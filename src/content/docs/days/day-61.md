---
title: "Day 61 — Containers with Podman"
description: "Package the server as an OCI image, run it rootless with Podman, and keep the database in a volume. — Day 61 of 100 Days of Rust."
sidebar:
  hidden: true
day: 61
---

**About 2 hours** · Part Production ground, day 1 of 30.

**You'll be able to:**

- build a multi-stage image for `todo-server`;
- run it rootless with a port and a volume;
- read the health endpoint from outside the container.

---

The server runs on the laptop with `cargo run`. Production needs an artifact
that carries its own runtime: an OCI image.

Today the server becomes a container. Podman builds and runs it rootless — no
daemon, no root, no toolbx.

## The image

`deploy/Containerfile`:

<!-- verify: deploy/Containerfile at=day-61 -->
```dockerfile title="deploy/Containerfile"
# syntax=docker/dockerfile:1
FROM rust:1.99-bookworm AS builder
WORKDIR /src
COPY . .
RUN cargo build --locked --release --bin todo-server

FROM debian:bookworm-slim
RUN useradd --system --create-home todo
COPY --from=builder /src/target/release/todo-server /usr/local/bin/todo-server
USER todo
ENV TODO_DB=sqlite:///data/todo.db \
    TODO_API_ADDR=0.0.0.0:8080
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/todo-server"]
```

The first stage has the compiler and the source. The second stage has only the
binary, a user, and the environment. The final image does not contain the Rust
toolchain, the source, or the target directory.

`TODO_DB` points at `/data`, a volume. The process runs as `todo`, not root.
The server listens on `0.0.0.0` inside the container; the published port maps it
to the host.

## Build

<!-- transcripts: authored -->
```bash
$ podman build -t todo-server:0.1 -f deploy/Containerfile .
$ podman images todo-server
REPOSITORY    TAG   IMAGE ID      SIZE
todo-server   0.1   ...           ...
```

The build context is the repository root. The `.dockerignore` keeps `target/`
and `.git/` out of the context; otherwise the build uploads gigabytes it does
not need.

## Run

<!-- transcripts: authored -->
```bash
$ podman volume create todo-data
$ podman run --rm --name todo -p 8080:8080 \
    -v todo-data:/data todo-server:0.1
```

In another terminal:

<!-- transcripts: authored -->
```bash
$ curl -s http://127.0.0.1:8080/health
{"status":"ok"}
```

The server writes `/data/todo.db` inside the volume. Removing the container
does not remove the volume; the tasks survive.

## Rootless

Podman runs the container as your user. There is no daemon socket with root
access. The container's root is mapped into a user namespace; the volume's
files are owned by your host user through the mapping.

On Fedora, a bind mount needs an SELinux label:

<!-- transcripts: authored -->
```bash
$ podman run --rm -v "$PWD/data:/data:Z" ...
```

`:Z` relabels the directory for this container. A named volume (`todo-data`) is
managed by Podman and needs no label.

## What the container needs

- **A volume** for the database. Containers are disposable; data is not.
- **A port** published only where it is needed. `127.0.0.1:8080:8080` keeps the
  API off the network; Caddy proxies to it.
- **Environment** for the database URL, listen address, and log level.
- **A health check** at the orchestrator level; the image does not need a
  `HEALTHCHECK` if the platform probes `/health`.

## In the app

The server already reads `TODO_DB` and `TODO_API_ADDR`; the image sets both. The
database migrations run on startup. The metrics endpoint is available at
`/metrics` for a scraper.

The container does not need the web templates or assets at runtime: Askama
compiles the templates into the binary, and the CSS is embedded. The runtime
image is the binary plus a minimal Debian userland.

## If something went wrong

**`permission denied` on the volume.** The container user cannot write the
mount. Use a named volume, or `:Z` and matching ownership for a bind mount.

**`address already in use`.** Another process owns 8080. Publish a different
host port: `-p 8081:8080`.

**The health check fails.** The server may still be applying migrations. Check
`podman logs todo`; the first start creates the schema.

**The image is huge.** The builder stage leaked into the final image, or the
binary is dynamically linked against libraries the slim image lacks. Check the
final layer list.

**The database disappears.** The container was run without a volume, or with
an anonymous volume that was pruned.

**The build is slow.** The dependency layer is rebuilt on every source change.
Copy `Cargo.toml`/`Cargo.lock` first and build a dummy target, then copy the
source; the dependency cache survives source edits.

## Going deeper: layers and distroless

Each `RUN`/`COPY` creates a layer. Order the Dockerfile so the expensive,
stable layers come first. The Cargo dependency build is the classic example.

A distroless runtime has no shell and no package manager; the attack surface is
the binary and the kernel. It also has no debug tools. For a course, the Debian
slim image is easier to inspect; for a release, distroless or a static musl
binary is smaller and quieter.

The container is not a security boundary by itself. Rootless, a read-only root
filesystem, no new privileges, and a non-root user are the baseline. The
deployment lesson's systemd unit applies the same ideas without a container.

<div class="day-tracker" data-day="61"></div>
