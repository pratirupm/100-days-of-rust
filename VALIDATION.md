# Validation

Every command and transcript in this book is checked against a real
application, built and tested in Podman. The host never needs Rust.

## The containers

| Image | Purpose |
| --- | --- |
| `rust-todo-validator:1.99` | Rust 1.99, `rustfmt`, `clippy`, `git`, `sqlite3` |
| `rust-todo-release:1.99` | adds `musl-tools` and the musl target (release days) |
| `rust-todo-site:1.4` | Bun 1.4 for the site build |

The base image is pinned by digest in
`containers/validator/Containerfile`. The app's `rust-toolchain.toml` pins
the toolchain; `Cargo.lock` pins the crates. `cargo test --locked` is the
rule.

## The commands

```bash
# build the validator once
podman build -t rust-todo-validator:1.99 \
  -f containers/validator/Containerfile containers/validator

# validate a tag or the current working tree
tools/validate-app.sh day-02

# open the clean-room reader workspace
tools/reader-run.sh
```

`tools/validate-app.sh` exports the reference app at the requested ref with
`git archive`, runs the gate in the container, and writes the captured output
under `tools/transcripts/`. The app is never copied into this repository.

## The gate

```bash
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
cargo build --locked --workspace --bins
```

Release and production days add their own checks (static binary, container
smoke test, database migration, and so on).

## Latest run

- **2026-10-31** — `day-100`, Rust 1.99.0, Podman image `rust-todo-validator:1.99`.
  `cargo fmt`, `clippy`, the full workspace test suite (app and `dsa`), and
  `cargo doc` pass. The DSA tests and criterion benchmarks are captured in
  `tools/transcripts/day-91.txt`.
- **2026-10-31** — `day-60` and `day-02`, Rust 1.99.0. The release tag and the
  first build tag both pass the same gate; logs are
  `tools/transcripts/validate-day-60.txt` and `validate-day-02.txt`.

## Status

| Track | Days | Status | Last checked |
| --- | --- | --- | --- |
| Part I — Language basics | 1–7 | complete | 2026-10-31 |
| Part II — Structure | 8–13 | complete | 2026-10-31 |
| Part III — Testing and tooling | 14–19 | complete | 2026-10-31 |
| Part IV — CLI and persistence | 20–25 | complete | 2026-10-31 |
| Part V — Concurrency and async | 26–31 | complete | 2026-10-31 |
| Part VI — The data layer | 32–37 | complete | 2026-10-31 |
| Part VII — The HTTP API | 38–43 | complete | 2026-10-31 |
| Part VIII — The web UI | 44–49 | complete | 2026-10-31 |
| Part IX — The terminal UI | 50–55 | complete | 2026-10-31 |
| Part X — Shipping | 56–60 | complete | 2026-10-31 |
| Production ground | 61–90 | complete | 2026-10-31 |
| Data structures & algorithms | 91–100 | complete | 2026-10-31 |

## Production lab checks

- **2026-10-31** — PostgreSQL 17 (Podman, `postgres:17-alpine`). The Day 65
  schema applies in order: users, tasks, index, sessions. A join over tasks and
  users returned the inserted row.
- **2026-10-31** — Redis 7 (Podman, `redis:7-alpine`). `SET ... EX`, `TTL`,
  `GET`, `INCR`, and `EXPIRE` returned the values shown in Day 67.
- **2026-10-31** — LocalStack 4.13 (Podman). The Day 77 S3 bucket, upload,
  listing, SQS queue, send, and receive commands succeeded against the local
  endpoint.

Kafka/Redpanda, gRPC, WebSockets, and Kubernetes are written as optional local
labs; their manifests and commands are not re-run by the book's default check.
The app chapters and the DSA crate are covered by the gates above.

## What is checked

- **Quotes** — `bun run verify`: every `<!-- verify: path at=tag -->` block
  must appear in `../rust-todo-app` at that tag.
- **Transcripts** — `bun run transcripts`: every terminal line must appear in
  a captured run under `tools/transcripts/`.
- **Prose** — `bun run lint`: the house style in `STYLE.md`.
- **Reader path** — a clean-room app built from the book at the end of each
  part; the gate must pass.
- **Site** — `bun run build`: link validation, the search index, and the
  offline service worker.

## No host packages

The only host requirements are Podman, `git`, and Bun (already installed).
Rust, `cargo`, `sqlite3`, `musl-tools`, and the site's build dependencies all
live in images or volumes. No toolbx, no `dnf`, no `rpm-ostree`, no `sudo`.
