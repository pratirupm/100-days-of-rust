---
title: "Day 13 — Review: Part II"
description: "Catch up on traits, generics, lifetimes, custom errors, and integration tests, then tag Part II. — Day 13 of 100 Days of Rust."
sidebar:
  order: 13
day: 13
---

**About 1.5 hours** · Part II, review.

Part II turned the single-file program into a small library with a public
surface: a `Summary` trait, generic search helpers, a zero-copy `TaskView`,
`thiserror`, and integration tests that use the crate from outside.

Today is a catch-up day. Run the suite, read the tree, and save a milestone.

## Run the suite

```bash
$ cargo test
...
running 23 tests
...
test result: ok. 23 passed; 0 failed; ...
...
     Running tests/cli.rs
running 2 tests
test binary_runs_and_prints_the_banner ... ok
test demo_shows_views_and_a_list_summary ... ok

test result: ok. 2 passed; 0 failed; ...
     Running tests/library.rs
running 1 test
test the_public_api_is_usable_from_outside ... ok

test result: ok. 1 passed; 0 failed; ...
     Running tests/smoke.rs
running 1 test
test banner_prints_on_start ... ok

test result: ok. 1 passed; 0 failed; ...
```

If a test is red, read the failure before changing code. The suite is the
contract you built; a red test is a question, not an obstacle.

## Read the tree

<!-- transcripts: authored -->
```text
src/
├── lib.rs        the library root and re-exports
├── main.rs       the binary
├── error.rs      TodoError, derived with thiserror
├── query.rs      find_first and count_if
├── store.rs      TodoList
├── summary.rs    the Summary trait
├── task.rs       Task and Status
└── view.rs       TaskView<'a>
tests/
├── cli.rs        the real binary
├── library.rs    the public library API
└── smoke.rs      the first end-to-end test
```

The library owns the model. The binary is thin. The integration tests exercise
the public surface; the unit tests stay inside the modules.

## Check your history

<!-- transcripts: authored -->
```bash
$ git log --oneline
... day 12: test the library and the binary
... day 11: derive custom errors
... day 10: borrow task views
... day 9: write generic helpers
... day 8: describe tasks with traits
$ git tag part-ii
```

The tag names the end of Part II. You can return to it later with `git switch
part-ii` (or `git checkout part-ii` in older git versions).

## What you should be able to explain

- What a trait promises, and why `Display` makes `{}` work.
- Why a generic function needs a bound such as `F: Fn(&T) -> bool`.
- What `'a` means in `TaskView<'a>`, and why the view cannot outlive the list.
- Why `thiserror` can replace a hand-written `Display` and `Error`.
- The difference between a unit test and an integration test.
- Why the integration test imports `Summary` explicitly.

## If the suite is red

**A trait method is missing.** Import the trait (`Summary`) in the file that
calls it. Traits must be in scope even when the implementation exists.

**A lifetime error in `view.rs`.** The view is being used after the list is
dropped or mutated. Let the views go out of scope first.

**A generic bound error in `query.rs`.** The closure's parameter or return
type does not match `Fn(&T) -> bool`. Check the closure, not the caller.

**The integration test cannot see a type.** Re-export it from `lib.rs`, or the
test is reaching for a private module. The public surface is the point.

**A thiserror format error.** Every variant needs an `#[error("...")]`
attribute, and `{0}` needs a field.

## The milestone

You have a library with a public API, a binary that uses it, typed errors, and
three layers of tests. That is the structure the rest of the book builds on.

Tag it:

<!-- transcripts: authored -->
```bash
$ git tag part-ii
```

Next: testing and tooling. The suite gets table tests, snapshots, property
tests, compile-fail tests, coverage, benchmarks, and a repeatable check that
runs them all.

<div class="day-tracker" data-day="13"></div>
