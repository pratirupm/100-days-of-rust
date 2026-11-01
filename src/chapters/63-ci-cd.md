---
title: CI/CD
day: 63
part: Production ground
partDay: 3
partDays: 30
time: "2 hours"
description: Put the check on every push: format, clippy, and the full suite in GitHub Actions, with a cache that makes it fast.
bullets:
  - write a CI workflow that runs the same check as `make check`;
  - cache dependencies and build artifacts;
  - make the check required before a merge.
---

The app's check is a local command. CI is the same command running on someone
else's machine, on every push, without a human remembering it.

Today the check becomes a workflow.

## The workflow

`.github/workflows/ci.yml`:

<!-- verify: .github/workflows/ci.yml at=review -->
```yaml title=".github/workflows/ci.yml"
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@v2
      - run: cargo fmt --all --check
      - run: cargo clippy --locked --workspace --all-targets -- -D warnings
      - run: cargo test --locked --workspace
      - run: RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps
```

The workflow has the same three commands as the local check. `--locked` fails if
`Cargo.lock` needs an update, so a dependency change must be reviewed. The
toolchain action installs the stable Rust and the two components the check uses.

`permissions: contents: read` is the least privilege the job needs. A workflow
with a broad token is a supply-chain risk; give it only what it uses.

## Cache

`Swatinem/rust-cache@v2` caches the Cargo registry and the target directory. The
first run is slow; later runs reuse compiled dependencies. The cache key follows
the lockfile and the toolchain, so a dependency change starts a fresh build.

A cache is an optimization, never a correctness requirement. If the cache is
cold or corrupted, the job still works; it is just slower.

## Make it required

A workflow that runs but does not block a merge is a notification, not a check.
In the project settings, require that job for the `main` branch, and
disallow direct pushes. The branch protection is part of the CI/CD lesson; the
YAML alone does not enforce it.

## CI vs CD

CI runs the checks. **CD** takes a green commit and puts it somewhere: a
release, a container image, a server. The release workflow belongs to the
delivery half:

- build the binaries on a tag;
- run the same check before publishing;
- publish archives and checksums;
- deploy the artifact.

The app's release script is local; the CI version runs it on a runner and
uploads the result. The commands are the same; the environment differs.

## In the app

The workflow does not need the sibling reference projects. The app's tests
are self-contained; the book's quote and transcript checks stay local because
they need the private app and captures.

The workflow's job name is part of the configuration; a branch protection
rule selects it.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 63: cI/CD"
```

## If something went wrong

**The workflow cannot find `Cargo.lock`.** The lockfile is not committed. A
binary application commits it; a library may not. This app is a binary.

**`--locked` fails after adding a dependency.** Run `cargo check` locally,
commit the lockfile, and push again.

**Clippy passes locally and fails in CI.** The toolchain versions differ. Pin
the toolchain in `rust-toolchain.toml` and use the same version in CI.

**The cache never hits.** The key includes the lockfile and toolchain; a change
to either invalidates it. Check the action's log for the key.

**A fork's pull request gets no secrets.** GitHub withholds secrets from forks.
The check must not need them; deploy jobs run only on trusted branches.

**The job is green but the branch is not protected.** Require the check in the
project settings; CI cannot protect itself.

## Going deeper: the pipeline is a contract

The pipeline encodes the project's definition of "green": format, lints, tests,
and whatever else the team agrees on. Adding a check is cheap; removing one is
a decision.

The same check should run locally and in CI. A local `make check` that differs
from CI produces the worst feedback loop: green locally, red remotely. Keep one
script or one Makefile target and call it from both.

The next lesson adds a matrix and a release workflow: more than one target, and
an artifact that leaves the runner.

