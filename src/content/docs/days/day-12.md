---
title: "Day 12 — Unit and integration tests"
description: "Test the library through its public API and the binary as a user would — two kinds of integration test, and the unit tests already inside the modules. — Day 12 of 100 Days of Rust."
sidebar:
  order: 12
day: 12
---

**About 2 hours** · Part II, day 5 of 5.

**You'll be able to:**

- add a library integration test in `tests/`;
- add a black-box test for the real binary;
- know which test layer to reach for.

---

The app has unit tests inside each module. They can see private functions and
fields because they live in the same file. That is useful, but it is not the
whole story: a bug can hide at the boundary between the library and the
binary, or between the binary and its output.

Today we add two **integration tests**. They live in `tests/`, and they use
the app the way an outside user does.

## The test layers

- **Unit tests** live in `#[cfg(test)] mod tests` beside the code. They can
  reach private items. They are fast and precise.
- **Integration tests** live in `tests/`, one file per test crate. They can
  use only the public API. They are the contract the rest of the world sees.
- **Black-box tests** start the real binary and read its output. They are the
  closest thing to a user.

The three layers check different things. A unit test can prove a function
returns the right error; a black-box test proves the program prints the right
line and exits successfully.

## The library test

Create `tests/library.rs`:

<!-- verify: tests/library.rs at=day-12 -->
```rust title="tests/library.rs"
//! Integration tests use the library the way another crate would: only the
//! public API, no private modules.

use todo::{Summary, TodoError, TodoList};

#[test]
fn the_public_api_is_usable_from_outside() {
    let mut list = TodoList::new();
    let id = list.add("buy milk").unwrap();

    assert!(list.done(id).is_ok());
    assert!(list.find(id).unwrap().is_done());
    assert_eq!(list.done(999), Err(TodoError::NotFound(999)));
    assert_eq!(list.summary(), "1 task(s), 1 done");
}
```

The `use todo::...` is the same import another crate would write. If a type
is not re-exported from `lib.rs`, this test cannot see it — which is exactly
the boundary we want to check.

`Summary` is in the import list because `summary()` is a trait method. A trait
must be in scope to call its methods; integration tests do not get the
library's internal `use` statements for free.

## The binary test

Create `tests/cli.rs`:

<!-- verify: tests/cli.rs at=day-12 -->
```rust title="tests/cli.rs"
//! Black-box tests for the real binary: start it, capture stdout, and read
//! the output the way a user would.

use std::process::Command;

fn todo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_todo"))
}

#[test]
fn binary_runs_and_prints_the_banner() {
    let out = todo().output().expect("failed to run todo");
    assert!(out.status.success(), "exit status was {:?}", out.status);

    let stdout = String::from_utf8(out.stdout).expect("stdout is UTF-8");
    assert_eq!(stdout.lines().next(), Some("todo — a tiny task manager"));
}

#[test]
fn demo_shows_views_and_a_list_summary() {
    let out = todo().output().expect("failed to run todo");
    assert!(out.status.success(), "exit status was {:?}", out.status);

    let stdout = String::from_utf8(out.stdout).expect("stdout is UTF-8");
    assert!(stdout.contains("view: #1 buy milk [done] done=true"));
    assert!(stdout.contains("list: 2 task(s), 1 done"));
}
```

`env!("CARGO_BIN_EXE_todo")` is filled in by Cargo with the path to the built
binary. The test does not call a function; it starts the program, waits for it,
and reads stdout and the exit status. That catches a panic before `main`, a
wrong binary name, or output on the wrong stream — problems a unit test cannot
see.

The helper `fn todo() -> Command` keeps the tests short. Each test gets its
own `Command` and its own process; tests run in parallel.

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

Four separate test binaries, plus the library's unit tests. `cargo test` runs
all of them.

Useful flags:

- `cargo test --test cli` runs only the `tests/cli.rs` crate.
- `cargo test demo` filters by test name across all targets.
- `cargo test -- --nocapture` shows output from passing tests.
- `cargo test -- --test-threads=1` runs serially, which helps diagnose a
  shared-file race.

## Save your work

```bash
$ git add -A
$ git commit -m "day 12: test the library and the binary"
[main (root-commit) ...] day 12: test the library and the binary
 15 files changed, 665 insertions(+)
...
$ git log --oneline
... day 12: test the library and the binary
```

## If something went wrong

**`no method named summary` in the library test.** The trait is not in scope.
Import `Summary` from `todo`, as the test does.

**`environment variable CARGO_BIN_EXE_todo not defined`.** The binary target
is not named `todo`, or you are running the test outside Cargo. Check
`name = "todo"` in `Cargo.toml` and run `cargo test`.

**The integration test cannot see a private item.** That is expected. If the
item is part of the public contract, re-export it from `lib.rs`; if it is not,
test it with a unit test inside the module.

**The test file is ignored.** Files in `tests/` must end in `.rs`. A
`tests/cli.txt` is not compiled.

**Tests pass alone but fail together.** They share a file or a global value.
Give each test its own temporary path, or run with `--test-threads=1` to
confirm the race.

**Output looks interleaved.** Tests run in parallel and Cargo captures stdout.
Use `-- --nocapture` when you need to see it, or run one test at a time.

## Going deeper: the test pyramid

Most tests should be unit tests: fast, precise, and close to the code. A few
integration tests should cover each public boundary. A handful of black-box
tests should prove the program runs.

As the app grows, the `tests/` folder will get a `common/` module for shared
fixtures; note that Cargo does not treat `tests/common/mod.rs` as a test crate
because it is inside a subdirectory. That is the usual place for a temporary
directory helper.

Later, `assert_cmd` and `predicates` make the CLI tests shorter, `insta`
captures output snapshots, and `proptest` generates inputs. They are additions,
not replacements: the shape you wrote today — library test, binary test,
unit test — stays.

A test is a promise about behavior. When the behavior must change, change the
test first, watch it fail, then change the code. The suite is not paperwork;
it is how the next refactor stays safe.

<div class="day-tracker" data-day="12"></div>
