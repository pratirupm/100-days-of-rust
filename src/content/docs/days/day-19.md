---
title: "Day 19 — Review: Part III"
description: "Catch up on table tests, snapshots, property tests, compile-fail tests, and the full check, then tag Part III. — Day 19 of 100 Days of Rust."
sidebar:
  order: 19
day: 19
---

**About 1.5 hours** · Part III, review.

Part III turned the suite from a pile of assertions into a toolkit: tables,
snapshots, generated inputs, compile-fail cases, and one command that runs the
whole check.

Today is a catch-up day. Run the check, read the test tree, and save a
milestone.

## Run the check

```bash
$ make check
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
...
cargo test --locked --workspace
...
test result: ok. ...
...
RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps
 Documenting todo v0.1.0 (...)
    Finished `dev` profile ...
   Generated /target/doc/todo/index.html
```

Four checks, one exit code. If a step fails, fix it before moving on. The
check is the same command a future CI job will run.

## Read the test tree

<!-- transcripts: authored -->
```text
tests/
├── cli.rs              the real binary
├── compile_fail.rs     the compile-fail harness
├── compile_fail/
│   ├── moved_value.rs
│   └── moved_value.stderr
├── library.rs          the public library API
├── property.rs         generated inputs
├── smoke.rs            the first end-to-end test
├── snapshots.rs        recorded output
├── snapshots/
│   ├── snapshots__list.snap
│   └── snapshots__task.snap
└── table.rs            named cases and a fixture
```

Each file is a separate test crate. The unit tests stay inside `src/`; the
integration tests use the public API.

## Check your history

<!-- transcripts: authored -->
```bash
$ git log --oneline
... day 18: document and gate the crate
... day 17: pin a compile-fail case
... day 16: property-test title round-trips
... day 15: snapshot the printed lines
... day 14: table tests and fixtures
```

## What you should be able to explain

- When a table is clearer than four named tests.
- What a snapshot records, and why reviewing the diff is the test.
- How a property test differs from an example test.
- Why a compile-fail test is possible in Rust.
- What `make check` runs, and why `-D warnings` matters.
- Why `#![warn(missing_docs)]` is useful even before the crate is published.

## If the check is red

**`cargo fmt --check` fails.** Run `cargo fmt --all`, review the diff, and
commit the formatting separately if it is large.

**Clippy fails.** Read the lint name and suggestion. Fix it, or allow that one
lint with a comment explaining the exception.

**A snapshot changed.** Read the diff; accept it only if the new output is the
one you want, then update the `.snap` file.

**A compile-fail case now compiles.** The rule changed. Fix the code or update
the case on purpose; do not delete the test to make the check green.

**`cargo doc` fails on a link.** Fix the intra-doc link or remove the
brackets.

## The milestone

You have a suite that checks behavior, output, generated inputs, compile
errors, formatting, lints, and docs. That is the quality floor for the rest of
the book.

Tag it:

<!-- transcripts: authored -->
```bash
$ git tag part-iii
```

Next: the command-line app. `clap` gives the demo real commands, `serde`
writes the list to disk, and the CLI becomes something a person can use
without reading the source.

<div class="day-tracker" data-day="19"></div>
