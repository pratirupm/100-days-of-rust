---
title: Supply chain
day: 87
part: Production ground
partDay: 27
partDays: 30
time: "2 hours"
description: Generate an SBOM, run the advisory and license checks, and sign what you ship.
bullets:
  - generate a CycloneDX SBOM from Cargo metadata;
  - check on advisories, licenses, and sources;
  - publish checksums and provenance with the release.
---

The app's own code is a fraction of the binary. The rest is dependencies,
build tools, and the toolchain. A supply-chain audit asks: what is in the
artifact, and can we prove where it came from?

## The SBOM

`scripts/sbom.sh`:

<!-- verify: scripts/sbom.sh at=day-87 -->
```bash title="scripts/sbom.sh"
#!/usr/bin/env bash
# Generate a small CycloneDX document from Cargo metadata.
set -euo pipefail

out="${1:-sbom.cdx.json}"
cargo metadata --format-version 1 --locked > /tmp/todo-metadata.json

python3 - "$out" <<'PY'
import json
import sys

meta = json.load(open("/tmp/todo-metadata.json"))
components = [
    {"type": "library", "name": package["name"], "version": package["version"]}
    for package in meta["packages"]
]
document = {
    "bomFormat": "CycloneDX",
    "specVersion": "1.5",
    "version": 1,
    "components": components,
}
json.dump(document, open(sys.argv[1], "w"), indent=2)
PY

echo "wrote $out"
```

The SBOM lists every package and version Cargo resolved. It is not a proof of
vulnerability; it is the inventory you need when a new advisory lands.

A full CycloneDX tool adds licenses, hashes, and dependency relationships. The
script is a small, readable version; the shape is what matters.

## The check

`.github/workflows/security.yml`:

<!-- verify: .github/workflows/security.yml at=day-87 -->
```yaml title=".github/workflows/security.yml"
name: Security

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  advisories:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - uses: EmbarkStudios/cargo-deny-action@v2
      - uses: rustsec/audit-check@v2.0.0
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

  sbom:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: scripts/sbom.sh sbom.cdx.json
      - uses: actions/upload-artifact@v4
        with:
          name: sbom
          path: sbom.cdx.json
```

`cargo-deny` checks advisories, licenses, sources, and wildcard bans from
`deny.toml`. `cargo-audit` checks the RustSec database. The workflow uploads the
SBOM as an artifact; attach it to the release when you publish.

## Secrets

The reference workflow does not include a secret scan yet. Add one as a separate
job or a pre-commit hook. It walks the tree and the
history for high-entropy strings and known token formats. A test fixture with a
fake key is fine; a real key in history is a rotation, not a delete.

The app's `Secret` type prevents accidental printing; the scan prevents
accidental committing. Both are needed.

## Signatures and provenance

A checksum proves the download matches the file. A **signature** proves who
built it. A **provenance attestation** proves from which commit and workflow.

The minimum release:

- a tag;
- a checksum file;
- an SBOM;
- a signed artifact or a provenance attestation.

Signing a container image (cosign) and a binary (minisign) are the common
options. The course's release script writes checksums; the next step is a
signature with a key stored outside the project.

## Licenses

`deny.toml`'s allowlist is a legal decision. A new dependency with an
unexpected license fails the check; a human reads the terms and decides.

The app is MIT for code and CC BY-NC-SA for prose. A dependency's license is
separate; the allowlist is how the project states what it accepts.

## In the app

The security workflow runs beside the CI check. A failure blocks the merge if the
branch protection requires it. The SBOM ships with the release; the audit runs
on a schedule because new advisories arrive for old code.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 87: supply chain"
```

## If something went wrong

**The SBOM is huge.** It includes the whole dependency graph, including build
dependencies. That is the point; filter for runtime components if a consumer
needs a smaller document.

**`cargo-deny` fails on a license.** Read it; add it only if the terms are
acceptable. Do not disable the license check.

**An advisory has no fix.** Check whether the affected code is reachable; pin a
temporary exception with a date and a tracking issue.

**A secret scan flags a test.** Move the fixture to an obviously fake value. A
narrow allowlist entry needs a comment and an owner.

**The signature cannot be verified.** The public key is not published, or the
artifact was rebuilt after signing. Publish the key and sign the final bytes.

**The SBOM does not match the binary.** The SBOM was generated from a different
lockfile or commit. Generate it in the same job as the build.

## Going deeper: the build is the supply chain

The compiler, the linker, the C dependencies, and the CI runner are all inputs.
A reproducible build narrows the trust to the source, the lockfile, and the
toolchain. An attestation records the rest.

You cannot audit everything. Prioritize the dependencies that touch untrusted
input and the ones that run with your credentials. The SBOM tells you which
those are.

The next lesson is the incident: what to do when a dependency or a secret is
compromised.

