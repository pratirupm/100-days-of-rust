---
title: "scripts — the finished app"
description: "The finished app, file by file: scripts (spoilers)."
sidebar:
  hidden: true
tableOfContents: false
pagefind: false
---


Part of [The finished app (spoilers)](/100-days-of-rust/appendices/the-finished-app/).


## `scripts/audit.sh`

````bash
#!/usr/bin/env bash
# Local security and supply-chain checks. Some tools are optional; the first
# three commands are the same gate the app uses.
set -euo pipefail

cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace

echo "dependency duplicates:"
cargo tree -d

# Optional tools, installed outside the host (see the validation image):
#   cargo audit
#   cargo deny check
#   cargo geiger --output-format Json
echo "audit: local checks passed"
````


## `scripts/release.sh`

````bash
#!/usr/bin/env bash
# Build the release archives and checksums.
set -euo pipefail

version="${1:?usage: scripts/release.sh <version>}"
mkdir -p dist

cargo build --locked --release --workspace --bins

tar -C target/release -czf "dist/todo-${version}-x86_64-linux.tar.gz" \
  todo todo-server todo-tui

sha256sum dist/*.tar.gz > dist/SHA256SUMS
echo "release: dist/todo-${version}-x86_64-linux.tar.gz"
````
