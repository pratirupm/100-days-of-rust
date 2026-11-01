---
title: "Day 11 — Custom errors"
description: "Replace the hand-written Display and Error impls with thiserror, keeping the same messages and the same tests. — Day 11 of 100 Days of Rust."
sidebar:
  order: 11
day: 11
---

**About 1.5 hours** · Part II, day 4 of 5.

**You'll be able to:**

- add a dependency to the manifest;
- derive `Display` and `Error` for `TodoError`;
- keep the error messages pinned by tests.

---

On Day 6 we wrote `TodoError` by hand: an enum, a `Display` implementation
with a `match`, and an empty `Error` implementation. That was the right way to
learn what the traits require. It is not the way to keep writing errors.

Today we replace the boilerplate with `thiserror`. The messages stay the same;
the tests prove it.

## Add the dependency

Open `Cargo.toml` and add `thiserror` under `[dependencies]`:

<!-- verify: Cargo.toml at=day-11 -->
```toml title="Cargo.toml"
[dependencies]
thiserror = "2"
```

You can also run `cargo add thiserror`, which writes the line and updates
`Cargo.lock` for you. Either way, commit both files: the manifest says what
you depend on, the lockfile says exactly which version resolved.

A dependency is a crate someone else maintains. `thiserror` is a **proc-macro**
crate: it generates code at compile time. The generated code is ordinary
`Display` and `Error` implementations; there is no runtime library to call.

## The error type

The whole file becomes:

<!-- verify: src/error.rs at=day-11 -->
```rust title="src/error.rs"
use thiserror::Error;

/// Everything that can go wrong in the core app.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum TodoError {
    /// A task was created or added with a blank title.
    #[error("a task needs a title")]
    EmptyTitle,
    /// No task with this id exists.
    #[error("no task with id {0}")]
    NotFound(u32),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_messages_are_stable() {
        assert_eq!(TodoError::EmptyTitle.to_string(), "a task needs a title");
        assert_eq!(TodoError::NotFound(42).to_string(), "no task with id 42");
    }
}
```

`#[derive(Error)]` is the macro. It generates `impl Display` and
`impl std::error::Error`. Each variant carries an `#[error("...")]` string;
that string is the `Display` output. `{0}` inserts the first field —
`NotFound(42)` becomes `no task with id 42`.

The `PartialEq, Eq` derives are still ours. They let the tests compare errors
with `assert_eq!`; `thiserror` does not need them, but the app's tests do.

The test pins the exact messages. That is the contract: the text may be
rewritten, but if it changes, the test says so. Error messages are part of a
command-line tool's interface.

## What was removed

The previous file had this:

```rust
impl fmt::Display for TodoError { ... }
impl std::error::Error for TodoError {}
```

Both are gone. The derive writes them. The `use std::fmt;` import is gone too.
If the compiler says `cannot find trait Error` or `unresolved import thiserror`,
the dependency or the derive is missing; the error message points at the
`#[derive]` line.

## Run the suite

```bash
$ cargo test
...
running 23 tests
test error::tests::display_messages_are_stable ... ok
...
test result: ok. 23 passed; 0 failed; ...
```

The suite is green before and after the change. That is the point of a
refactor: the behavior stays, the code gets smaller. If a test goes red, the
derive changed a message or a variant; read the failure and decide which side
is wrong.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 11: derive custom errors"
[main ...] day 11: derive custom errors
 13 files changed, 623 insertions(+)
...
$ git log --oneline
... day 11: derive custom errors
```

## If something went wrong

**`unresolved import thiserror`.** The dependency is not in `Cargo.toml`, or
you edited the manifest and did not build. Add the line and run `cargo check`.

**`cannot find derive macro Error`.** The `use thiserror::Error;` import is
missing. The derive name and the import are both `Error`.

**`no method named to_string`.** `to_string` comes from `Display`; the derive
did not run, or the variant has no `#[error(...)]` attribute. Every variant
needs one.

**`expected 1 argument, found 0`.** The format string uses `{0}` but the
variant has no field. Add the field or remove the placeholder.

**`TodoError cannot be compared with ==`.** Keep `PartialEq, Eq` in the derive
list if tests use `assert_eq!`.

**`thiserror` version conflict.** Another crate may require a different major
version. Cargo can compile both; the error usually names the crate that
disagrees. Read the full message before changing versions.

## Going deeper: thiserror or anyhow?

`thiserror` is for **libraries**: a typed error enum that callers can match.
`anyhow` is for **applications**: one boxed error type that carries context,
so `main` can report anything without inventing a variant for every failure.

The usual shape is both: the library uses `thiserror`, and the binary uses
`anyhow` (or a small `run() -> Result<(), TodoError>` like ours) at the edge.
We will meet `anyhow` when the CLI starts reading files, arguments, and
databases — places where the error set grows quickly.

`thiserror` also supports `#[from]` for automatic conversions and `#[source]`
for nested errors. We will use `#[from]` when the store starts wrapping
database errors; the `?` operator will convert them into `TodoError` without a
manual `map_err`.

A custom error enum is a map of everything that can go wrong. Keep it small,
name the cases the caller can act on, and do not put a string in a variant
unless the text is genuinely data.

<div class="day-tracker" data-day="11"></div>
