---
title: Beyond this book
description: "Where to go after the 100 days: the Rust standard library, the crates the book chose, and roads into systems, embedded, WebAssembly, GUIs, and distributed systems."
sidebar:
  order: 2
---

The app is finished, deployed, and measured. This page is a map of what to
explore next: how to keep reading Rust, the crates the book chose, and a few
roads out.

## Keep reading the standard library

The standard library is not a phase you finish; it is the code you keep
rereading, always on demand.

- **[doc.rust-lang.org/std](https://doc.rust-lang.org/std/)** is the index:
  search, read the examples, then follow the `[src]` link — the implementation
  is often shorter than the prose around it.
- **`cargo doc --open`** builds the docs for your own crate and its
  dependencies, with the same links and search.
- **`rustup doc`** opens the local standard-library docs without a browser.
- Your editor's go-to-definition works through `rust-analyzer`, the standard
  library, and every dependency.

## The tools this book chose

Every crate below earned its place in the build, and each has alternatives —
trying one is a good exercise.

- **`clap`** — the command tree. Alternatives: `argh`, `bpaf`.
- **`serde`** — serialization. Alternatives: `miniserde`, `rkyv`.
- **`sqlx`** — async SQL and migrations. Alternatives: `rusqlite`, `diesel`,
  `sea-orm`.
- **`axum`** — the HTTP API. Alternatives: `actix-web`, `rocket`, `poem`.
- **`askama`** — compile-time templates. Alternatives: `maud`, `minijinja`,
  `tera`.
- **`tracing`** — structured logs and spans. Alternatives: `log`, `slog`.
- **`ratatui`** — the terminal UI. Alternatives: `cursive`, `iocraft`.
- **`reqwest`** — the HTTP client. Alternatives: `hyper` directly, `ureq`.
- **`tokio`** — the async runtime. Alternatives: `async-std`, `smol`.
- **`argon2`** — password hashing. Alternatives: `scrypt`, `bcrypt`.
- **`insta`**, **`proptest`**, **`trybuild`**, **`assert_cmd`**,
  **`wiremock`** — snapshots, properties, compile-fail tests, CLI tests, and
  HTTP fakes.
- **`criterion`** — benchmarks.
- **`cargo-deny`**, **`cargo-audit`** — supply-chain checks.

## Roads out

A few directions, each with a first step:

- **Systems and unsafe Rust.** Read the Rustonomicon, then write one small
  `unsafe` abstraction — a bump allocator or a ring buffer — with tests and a
  safety comment for every block.
- **Embedded.** Start with `embassy` or `rtic` on a microcontroller; the
  ownership model is the same, the constraints are tighter.
- **WebAssembly.** Compile a small crate with `wasm-bindgen` and call it from
  a browser page; then measure the boundary cost.
- **GUIs.** Try `egui` for an immediate-mode desktop app, or `tauri` for a
  web front end around a Rust core.
- **Distributed systems.** Extend the production track: consensus, leases,
  and failure injection with `turmoil` or a local cluster.
- **More performance.** Profile-guided optimization, `mimalloc`, and longer
  benchmark series — one change at a time, with the baseline in hand.
- **More correctness.** Fuzzing with `cargo-fuzz`, mutation testing, and
  property tests that run in CI.

## Keep the app

The project is yours now. Add a feature the book did not: recurring tasks,
sharing, reminders, a mobile client. The fastest way to learn is to change a
working system and keep its tests green.
