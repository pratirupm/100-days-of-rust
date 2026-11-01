---
title: "The project root — the finished app"
description: "The finished app, file by file: The project root (spoilers)."
sidebar:
  hidden: true
tableOfContents: false
pagefind: false
---


Part of [The finished app (spoilers)](/100-days-of-rust/appendices/the-finished-app/).


## `Cargo.toml`

````toml
[package]
name = "todo"
version = "0.1.0"
edition = "2024"
description = "A tiny task manager built while learning Rust"
rust-version = "1.85"

[dependencies]
argon2 = "0.5"
axum = "0.8"
chrono = { version = "0.4", features = ["serde"] }
clap = { version = "4", features = ["derive", "env"] }
serde = { version = "1", features = ["derive"] }
rand_core = { version = "0.6", features = ["getrandom"] }
serde_json = "1"
sha2 = "0.10"
sqlx = { version = "0.9", features = ["runtime-tokio", "sqlite", "migrate"] }
thiserror = "2"
tower = { version = "0.5", features = ["util"] }
tower-http = { version = "0.6", features = ["trace", "limit", "timeout", "compression-full", "set-header", "request-id"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "fs", "time", "sync"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
uuid = { version = "1", features = ["v4", "v7"] }
askama = "0.14.0"
axum-extra = { version = "0.12.6", features = ["cookie"] }
ratatui = "0.29.0"
reqwest = { version = "0.13.5", default-features = false, features = ["json", "rustls"] }

[dev-dependencies]
insta = "1"
proptest = "1"
trybuild = "1"
tempfile = "3"

[profile.release]
lto = "thin"
codegen-units = 1
strip = "symbols"

[profile.dist]
inherits = "release"
lto = "fat"
panic = "abort"
````


## `.gitignore`

````text
/target
/todo.db
/todo.db-shm
/todo.db-wal
/todo.db.session
/.env
*.snap.new
````


## `Makefile`

````makefile
.PHONY: check fmt lint test doc

check: fmt lint test doc

fmt:
	cargo fmt --all --check

lint:
	cargo clippy --locked --workspace --all-targets -- -D warnings

test:
	cargo test --locked --workspace

doc:
	RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps
````


## `SECURITY.md`

````markdown
# Security policy

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Email the maintainer at
`security@example.com` with a description, a reproduction, and the affected
version. You will get an acknowledgement within 72 hours.

## Supported versions

The latest release on the `main` branch is supported. Older versions receive
fixes only when the issue is critical and the upgrade is not practical.

## What is in scope

- the `todo`, `todo-server`, and `todo-tui` binaries;
- the HTTP API and its authentication and authorization rules;
- the session and password handling;
- the release artifacts and their checksums.

## What is out of scope

- vulnerabilities in dependencies that have a published advisory and no
  available upgrade (we track them in `deny.toml`);
- issues that require a compromised host or a privileged local user;
- the example deployment files used as teaching material.

## Disclosure

We aim to publish a fix and an advisory within 90 days. Credit is given unless
the reporter prefers to remain anonymous.
````


## `deny.toml`

````toml
[advisories]
db-urls = ["https://github.com/rustsec/advisory-db"]
yanked = "deny"

[licenses]
allow = [
  "MIT",
  "Apache-2.0",
  "Apache-2.0 WITH LLVM-exception",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Unicode-3.0",
  "Zlib",
  "MPL-2.0",
  "CC0-1.0",
]
confidence-threshold = 0.8

[bans]
multiple-versions = "warn"
wildcards = "deny"

[sources]
unknown-registry = "deny"
unknown-git = "deny"
````


## `rust-toolchain.toml`

````toml
[toolchain]
channel = "1.99.0"
components = ["rustfmt", "clippy", "rust-analyzer", "rust-src"]
````
