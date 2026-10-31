---
title: Lints, docs, and the full check
day: 18
part: III
partName: Testing and tooling
partDay: 5
partDays: 5
time: "1.5 hours"
description: Put formatting, clippy, the tests, and rustdoc behind one command — and make missing documentation a warning the gate can catch.
bullets:
  - run `cargo fmt` and `cargo clippy` as part of the check;
  - document the public API and build the docs;
  - add a `Makefile` that runs the whole check.
---

The suite is green, but a green suite is not the same as a clean project. The
code can be unformatted, clippy can find a sharper way to write it, and the
public API can be undocumented. Today those checks become one command.

The command is `make check`. It runs the formatter, the linter, the tests, and
the documentation build. If any step fails, the check stops.

## Formatting

`cargo fmt` rewrites the code in the standard style. In CI and in the check,
use the non-rewriting form:

```bash
$ cargo fmt --all --check
```

It exits nonzero if any file would change. Run `cargo fmt --all` locally to
fix it. Formatting is not a matter of taste; it removes a whole class of diff
noise from every future change.

## Clippy

`cargo clippy` is the linter. It looks for patterns that compile but are
unclear, inefficient, or likely wrong. Make warnings errors in the check:

```bash
$ cargo clippy --locked --workspace --all-targets -- -D warnings
```

`--all-targets` includes tests and examples. `--locked` refuses to update the
lockfile. `-D warnings` turns every lint into a failure.

## Documentation

Rustdoc reads the `///` comments and builds an API reference. Add a crate-level
warning so missing public docs are visible:

<!-- verify: src/lib.rs at=day-18 -->
```rust title="src/lib.rs"
//! The todo app's library: tasks, the list that stores them, and the errors
//! they can produce.
#![warn(missing_docs)]

/// The errors returned by the core app.
pub mod error;
/// Generic search and count helpers.
pub mod query;
/// The in-memory list of tasks.
pub mod store;
/// The one-line summary trait.
pub mod summary;
/// Tasks, statuses, and tags.
pub mod task;
/// Zero-copy views of tasks.
pub mod view;

pub use error::TodoError;
pub use query::{count_if, find_first};
pub use store::TodoList;
pub use summary::Summary;
pub use task::{Status, Task};
pub use view::TaskView;
```

`#![warn(missing_docs)]` is a crate attribute. It asks rustc to warn on any
public item without a doc comment. The build does not fail on a warning by
itself — but clippy's `-D warnings` turns it into a failure, so the check
catches it.

The task's fields are now documented too:

<!-- verify: src/task.rs at=day-18 -->
```rust title="src/task.rs"
/// A single todo item.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Task {
    /// The task's stable id.
    pub id: u32,
    /// The task's title, trimmed on creation.
    pub title: String,
    /// Whether the task is pending or done.
    pub status: Status,
    /// The tags attached to the task, without duplicates.
    pub tags: Vec<String>,
}
```

Build the docs with warnings as errors:

```bash
$ RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps
```

`--no-deps` documents your crate, not its dependencies. `RUSTDOCFLAGS` passes
the warning policy to rustdoc. The output lands in `target/doc/todo/`; open
`target/doc/todo/index.html` in a browser, or run `cargo doc --open`.

## One command

Create `Makefile`:

<!-- verify: Makefile at=day-18 -->
```makefile title="Makefile"
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
```

The recipe lines start with a **tab**, not spaces. Make is old and strict
about that; a line with four spaces produces `missing separator`.

Run it:

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

Four checks, one exit code. That is the check you run before a commit that
touches code, and the check a future CI job will run.

## Save your work

```bash
$ git add -A
$ git commit -m "day 18: document and gate the crate"
[main (root-commit) ...] day 18: document and gate the crate
 24 files changed, 1351 insertions(+)
...
$ git log --oneline
... day 18: document and gate the crate
```

## If something went wrong

**`missing separator` from make.** A recipe line uses spaces. Replace them
with a tab.

**`missing documentation for a struct field`.** Add a `///` comment above the
field, or remove `#![warn(missing_docs)]` if the crate is not public. The
warning is the point: the field is part of the API.

**Clippy fails on a pattern you like.** Read the lint name and its suggestion.
If the pattern is deliberate, allow that one lint with a comment explaining
why; do not disable the whole lint set.

**`cargo doc` fails on a broken link.** Rustdoc checks intra-doc links such as
`[TodoError]`. Fix the path or remove the brackets.

**`--locked` fails after adding a dependency.** Run `cargo check` once to
update `Cargo.lock`, then commit the lockfile. The check is protecting you from
an unreviewed dependency update.

**The formatter rewrites code you did not touch.** That is expected on the
first run. Commit the formatting separately if the diff is large, so the next
change is readable.

## Going deeper: docs are tests

A doc comment can contain a code block:

```rust
/// ```
/// let task = todo::Task::new(1, "buy milk").unwrap();
/// assert_eq!(task.title, "buy milk");
/// ```
```

`cargo test` compiles and runs doc tests. They are examples that cannot rot
silently. Use them for the public API's smallest useful example, not for a
second test suite.

The full check will grow: `cargo-deny` for licenses and advisories, `cargo
audit` for vulnerabilities, a secret scan, and a benchmark comparison. Those
belong in the shipping part. Today's four commands are the floor, not the
ceiling.

