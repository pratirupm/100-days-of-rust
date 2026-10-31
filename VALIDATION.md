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

## Status

| Track | Days | Status | Last checked |
| --- | --- | --- | --- |
| Part I — Language basics | 1–7 | in progress | — |
| Part II — Structure | 8–13 | pending | — |
| Part III — Testing and tooling | 14–19 | pending | — |
| Part IV — CLI and persistence | 20–25 | pending | — |
| Part V — Concurrency and async | 26–31 | pending | — |
| Part VI — The data layer | 32–37 | pending | — |
| Part VII — The HTTP API | 38–43 | pending | — |
| Part VIII — The web UI | 44–49 | pending | — |
| Part IX — The terminal UI | 50–55 | pending | — |
| Part X — Shipping | 56–60 | pending | — |
| Production ground | 61–90 | pending | — |
| Data structures & algorithms | 91–100 | pending | — |

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
