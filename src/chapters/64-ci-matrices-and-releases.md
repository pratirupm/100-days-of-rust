---
title: CI matrices and releases
day: 64
part: Production ground
partDay: 4
partDays: 30
time: "2 hours"
description: Run the check on more than one target, build artifacts on a tag, and publish checksums with the release.
bullets:
  - use a matrix for more than one OS or target;
  - build and upload release artifacts on a tag;
  - keep the check in front of the publish step.
---

One runner is a start. A release needs more than one target and an artifact
that outlives the job.

Today the workflow grows a matrix and a release job. The check still runs first.

## The matrix

<!-- transcripts: authored -->
```yaml
jobs:
  check:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@v2
      - run: cargo fmt --all --check
      - run: cargo clippy --locked --workspace --all-targets -- -D warnings
      - run: cargo test --locked --workspace
```

`fail-fast: false` runs every cell even if one fails; you see all the platform
differences in one run. A matrix multiplies cost: two OSes is two jobs; add a
cell only when a real difference justifies it.

The commands are the same. The matrix is an assertion that the app is portable,
not a second definition of green.

## The release job

<!-- transcripts: authored -->
```yaml
  release:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: check
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo build --locked --release --workspace --bins
      - run: scripts/release.sh "${GITHUB_REF_NAME#v}"
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            dist/*.tar.gz
            dist/SHA256SUMS
```

`needs: check` makes the release wait for the checks. `if:` limits it to tags
that start with `v`. `permissions: contents: write` is scoped to this job; the
check job keeps read-only.

The release script builds the archive and the checksum. The action uploads
both. A consumer downloads the archive and verifies the checksum before
running it.

## Tags and versions

A release is a tag, a version in the manifest, and a changelog entry that agree.
The tag is the source of truth for the artifact; the manifest is the source of
truth for the binary. A mismatch is a release bug, not a documentation issue.

The app's version is `0.1.0`; the first published release could be `v0.1.0`.
The exact number is less important than the agreement.

## Images in CI

The container image is another artifact. Build it in the release job after the
check, tag it with the version and the commit, and push it to a registry. The
same Dockerfile can be built locally with Podman; CI needs a builder that
speaks OCI.

A multi-arch image (amd64 + arm64) needs a builder with emulation or native
runners. Start with one architecture; add the second when a user needs it.

## In the app

The local `scripts/release.sh` and the CI job run the same commands. The CI
version adds the upload and the tag check; the script stays the single place
that knows how to package.

The workflow does not run the private book checks. Those need the reference
app and the captured transcripts; the site's workflow runs only the prose lint
and the build.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 64: cI matrices and releases"
```

## If something went wrong

**The release job runs on every push.** The `if:` condition is missing or the
tag pattern is wrong. A release must be tag-driven.

**The artifact has the wrong version.** The tag and `Cargo.toml` disagree. Read
the tag, the manifest, and the changelog before publishing.

**The matrix doubles the bill and finds nothing.** Remove a cell; a matrix is
for a real portability claim, not a badge.

**The upload fails with a permissions error.** The job token lacks
`contents: write`, or the workflow runs from a fork.

**The checksum file is empty.** The script ran in the wrong directory, or the
archive glob did not match. Check the `dist/` listing.

**The image works locally and not in CI.** The builder differs. Pin the builder
image and the target architecture.

## Going deeper: reproducible releases

A release is reproducible when the same inputs produce the same artifact. The
inputs are the source commit, the toolchain, the dependency lockfile, and the
build flags. Pin all four; publish the SBOM and the checksum with the artifact.

True bit-for-bit reproducibility is hard across machines. A verifiable
provenance attestation is often the practical goal: this artifact was built
from this commit by this workflow.

The next lesson moves the database from SQLite to PostgreSQL, the first real
backend swap behind the `Store` trait.

