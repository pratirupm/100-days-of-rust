---
title: "Day 58 — The security audit"
description: "Write the threat model down, pin the dependency policy, and make the audit a command instead of a mood. — Day 58 of 100 Days of Rust."
sidebar:
  order: 58
day: 58
---

**About 2 hours** · Part X, day 3 of 5.

**You'll be able to:**

- declare the dependency, license, and source policy in `deny.toml`;
- run the local check and inspect duplicate versions;
- keep a vulnerability-reporting policy.

---

Security is not a header list. It is a set of claims about who can do what,
which dependencies are trusted, and what happens when one of them is wrong.

Today the audit becomes files: a threat model, a dependency policy, a reporting
policy, and a script that runs the checks locally.

## The threat model

The app's assets:

- a user's tasks and email;
- session tokens and password hashes;
- the admin's deployment and database files.

The actors:

- an anonymous visitor (can register, log in, see the login page);
- an authenticated user (can see and change only their tasks);
- an administrator (can read across users, deliberately);
- an attacker with a leaked token or a compromised dependency.

The boundaries:

- the HTTP API and web forms are the public edge;
- SQLite is local state, not a network service;
- the environment and the deploy files hold secrets;
- the dependency tree is code you did not write.

The audit checks the last boundary and the code that crosses the others.

## The dependency policy

Create `deny.toml`:

<!-- verify: deny.toml at=day-58 -->
```toml title="deny.toml"
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
```

`cargo deny check` reads this and fails on:

- a known advisory or a yanked crate;
- a license outside the allowlist;
- a wildcard dependency (`*`) that lets an unreviewed version in;
- a source that is not crates.io or an approved git host.

`multiple-versions = "warn"` reports duplicate crates without failing. Duplicate
`unicode-width` or `winnow` versions are a compile-time and binary-size cost,
not a vulnerability; the warning makes them visible.

## The audit script

Create `scripts/audit.sh`:

<!-- verify: scripts/audit.sh at=review -->
```bash title="scripts/audit.sh"
#!/usr/bin/env bash
# Local security and supply-chain checks. Some tools are optional; the first
# four commands are the same check the app uses.
set -euo pipefail

cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps

echo "dependency duplicates:"
cargo tree -d

# Optional tools, installed outside the host (see the validation image):
#   cargo audit
#   cargo deny check
#   cargo geiger --output-format Json
echo "audit: local checks passed"
```

The first four commands are the app's check; the rest are the supply-chain
lens. `cargo tree -d` needs no extra tool. The optional commands belong in a
tool image, not on the host.

## Duplicate versions

<!-- transcripts: authored -->
```text
unicode-width v0.1.14
└── unicode-truncate v1.1.0 (*)

unicode-width v0.2.0
└── ratatui v0.29.0 (*)

winnow v0.7.15
└── askama_parser v0.14.0 (*)

winnow v1.0.4
├── toml v1.1.8+spec-1.1.0 (*)
└── toml_parser v1.1.5+spec-1.1.0
    └── toml v1.1.8+spec-1.1.0 (*)
```

The block is a fragment of `cargo tree -d`; the arrows show which dependents
pulled each copy. A duplicate is not automatically a bug. It is a question:
can the two dependents agree on one version?

## The reporting policy

`SECURITY.md` tells a researcher where to send a report and what is in scope.
It also promises a response time and a disclosure window. A policy with no
contact is worse than no policy; it looks like a process but routes nowhere.

## Run the audit

<!-- transcripts: authored -->
```bash
$ scripts/audit.sh
...
test result: ok. ...
dependency duplicates:
...
audit: local checks passed
```

The optional tools:

<!-- transcripts: authored -->
```bash
$ cargo audit
$ cargo deny check
$ cargo geiger --output-format Json
$ scripts/scan-secrets.sh
```

Run them in a container with a pinned toolchain. A scan result is evidence only
when it is reproducible.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 58: add the security audit policy"
[main ...] day 58: add the security audit policy
 54 files changed, 7718 insertions(+)
...
$ git log --oneline
... day 58: add the security audit policy
```

## If something went wrong

**`cargo deny` reports an advisory.** Read the advisory, check whether the
affected code path is reachable, and upgrade or replace the crate. Do not
silence it without a date and a reason.

**A crate is yanked.** Cargo still builds it, but it is withdrawn for a reason.
Find the replacement or the fixed version; pin a temporary exception only with
a tracking issue.

**A license is not in the allowlist.** Add it only after reading the terms. The
allowlist is a legal decision, not a compile fix.

**Duplicate versions remain.** Run `cargo tree -i <crate>` to see the
dependents. Upgrade one side, or accept the duplicate with a note.

**The audit tools are missing.** Install them in a tools image, not on the
host. The app's CI can run `cargo deny` and `cargo audit` as separate jobs.

**A secret scan finds a test fixture.** Move the fixture to a clearly fake
value, or add a narrow allowlist entry with a comment. Never add a real secret
to the allowlist.

## Going deeper: SBOM and provenance

An SBOM lists the components and versions in a build. It answers "were we
affected?" after a new advisory, without rebuilding every old commit. Generate
one from `cargo metadata`; publish it with the release.

Provenance goes further: who built the artifact, from which commit, with which
toolchain. A signed attestation lets a consumer verify the binary. The release
lesson adds checksums; a full supply-chain story adds signatures and an SBOM.

The audit is not a one-time event. It runs before every release and on a
schedule, because new advisories arrive for code that did not change.

<div class="day-tracker" data-day="58"></div>
