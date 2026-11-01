---
title: "Day 60 — Releases and performance"
description: "Cut a release with LTO and stripped symbols, checksum the archives, and close Part X with the app complete. — Day 60 of 100 Days of Rust."
sidebar:
  order: 60
day: 60
---

**About 2 hours** · Part X, day 5 of 5.

**You'll be able to:**

- add release and dist profiles;
- package the three binaries and checksums;
- measure the build before tuning anything.

---

The server runs under systemd, Caddy terminates TLS, the database has a backup,
and the runbook is written. The last shipping step is the artifact: a release
build, an archive, and a checksum.

This is also the end of Part X and the end of the app build. The next part is
production ground; the last ten days are data structures and algorithms.

## The profiles

<!-- verify: Cargo.toml at=day-60 -->
```toml title="Cargo.toml"
[profile.release]
lto = "thin"
codegen-units = 1
strip = "symbols"

[profile.dist]
inherits = "release"
lto = "fat"
panic = "abort"
```

`lto = "thin"` links across crates with less time than fat LTO. `codegen-units =
1` gives the optimizer one unit of the crate; the build is slower and the binary
is smaller and usually faster. `strip = "symbols"` removes debug symbols from
the shipped binary.

`dist` inherits `release` and adds fat LTO and `panic = "abort"`. Abort is a
deliberate choice for the server: a panic should fail fast under a supervisor.
The TUI keeps the release profile's unwinding because its terminal guard relies
on `Drop`.

## The archive

<!-- verify: scripts/release.sh at=day-60 -->
```bash title="scripts/release.sh"
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
```

The archive contains the three binaries. The checksum file lets a user verify
the download. A real release adds a signature and an SBOM; the audit lesson
explains why.

## Build it

```bash
$ cargo build --release --workspace --bins
...
    Finished `release` profile ...
$ ls -lh ~/target/release/todo*
-rwxr-xr-x. 2 pm pm 1.6M ... /target/release/todo
-rwxr-xr-x. 2 pm pm 6.1M ... /target/release/todo-server
-rwxr-xr-x. 2 pm pm 8.6M ... /target/release/todo-tui
```

The numbers are from this machine; yours will differ. The CLI is small, the
server carries the web stack, and the TUI carries Ratatui.

## Measure first

A release profile is a guess until it is measured. The honest order is:

1. record a baseline with the current profile;
2. change one variable — LTO, codegen units, allocator, a query;
3. measure again;
4. keep the change only if the numbers support it.

The app's performance work has a small surface: SQLite queries, JSON encoding,
and the HTTP stack. The database index and the query planner are usually worth
more than a compiler flag. The production ground and the optimization lesson
return to this.

## Part X review

- [ ] The service runs as a non-root user with a read-only system.
- [ ] Secrets live in a `0600` environment file, not the unit.
- [ ] Caddy terminates TLS and proxies to loopback.
- [ ] `/health` checks the database.
- [ ] `/metrics` exposes the counters.
- [ ] The database backup and restore have been tested.
- [ ] `scripts/audit.sh` is clean on the pinned toolchain.
- [ ] The release build, archive, and checksum exist.

The app is complete. Days 61–90 take it to production: containers, PostgreSQL,
Redis, Kafka, gRPC, WebSockets, Kubernetes, AWS, microservices, distributed
systems, observability, performance, and supply chain. Days 91–100 go
underneath with data structures and algorithms.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 60: add release profiles and packaging"
[main ...] day 60: add release profiles and packaging
 59 files changed, 7833 insertions(+)
...
$ git log --oneline
... day 60: add release profiles and packaging
```

## If something went wrong

**The release build takes minutes.** LTO is doing its job. Keep a separate
`dev` loop; do not run release builds on every save.

**The binary has no stack traces.** `strip = "symbols"` removed them. Build a
debug or unstripped binary when investigating a crash.

**`panic = "abort"` breaks a test that expects unwinding.** The profile is for
the server binary, not the test profile. Do not apply it to the TUI without
checking its guard.

**The checksum does not match.** The archive changed after the checksum was
generated, or the download is corrupt. Regenerate both from the same build.

**`tar` includes an unexpected path.** The `-C target/release` changes the
working directory; list the archive with `tar -tzf` before publishing.

**A release crosses a migration.** The new binary migrates the database on
start. Keep the pre-deploy backup; a rollback needs it.

## Going deeper: release engineering

A release is a reproducible build plus a record of what it contains. The
minimum is a tag, a lockfile, a pinned toolchain, and a checksum. The next
levels are an SBOM, a signature, and a provenance attestation.

The `dist` profile is a starting point. A real release builds on a pinned
container, runs the full check first, and publishes the artifacts with the
commit and the toolchain version. The production ground's CI/CD and supply-chain
lessons fill in the rest.

<div class="day-tracker" data-day="60"></div>
