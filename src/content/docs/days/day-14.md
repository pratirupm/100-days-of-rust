---
title: "Day 14 — Table tests and fixtures"
description: "Turn a pile of similar assertions into one table with named cases, and build a small fixture the tests can share. — Day 14 of 100 Days of Rust."
sidebar:
  order: 14
day: 14
---

**About 1.5 hours** · Part III, day 1 of 5.

**You'll be able to:**

- write a table-driven test with one loop and named cases;
- use a fixture to set up a list the same way twice;
- read a failure that names the input.

---

The suite has twenty-three unit tests and four integration tests. Some of
them repeat the same shape: create a task, call a method, assert a value.

Today we make those cases a **table**, and we build a **fixture** — a small
helper that returns a list in a known state. The tests get shorter, and a
failure gets easier to read.

## A table of title rules

Create `tests/table.rs`:

<!-- verify: tests/table.rs at=day-14 -->
```rust title="tests/table.rs"
//! Table tests and a small fixture, using only the public API.

use todo::{Summary, TodoError, TodoList};

fn sample_list() -> TodoList {
    let mut list = TodoList::new();
    let first = list.add("buy milk").unwrap();
    list.add("write the report").unwrap();
    list.done(first).unwrap();
    list
}

#[test]
fn title_rules_are_a_table() {
    let cases = [
        ("buy milk", true, "buy milk"),
        ("  buy milk  ", true, "buy milk"),
        ("", false, ""),
        ("   ", false, ""),
    ];

    for (input, ok, expected_title) in cases {
        let mut list = TodoList::new();
        let result = list.add(input);

        assert_eq!(result.is_ok(), ok, "input: {input:?}");
        if let Ok(id) = result {
            assert_eq!(list.find(id).unwrap().title, expected_title);
        }
    }
}

#[test]
fn the_fixture_has_one_done_and_one_pending() {
    let mut list = sample_list();

    assert_eq!(list.summary(), "2 task(s), 1 done");
    assert!(list.find(1).unwrap().is_done());
    assert!(!list.find(2).unwrap().is_done());
    assert_eq!(list.done(999), Err(TodoError::NotFound(999)));
}
```

The table has three columns:

- the input title;
- whether `add` should succeed;
- the title the stored task should have after trimming.

The loop creates a fresh list for every row. A failed row prints the input
with `{input:?}`, so you do not have to guess which case broke.

`sample_list` is the fixture. It builds two tasks and marks the first done.
Tests that need that shape call it instead of repeating four lines. The
fixture owns its list and returns it; each test gets a fresh one, so tests do
not share state.

## The fixture is not magic

A fixture is an ordinary function. It is not a test attribute, a framework, or
a hidden global. Keep fixtures small and obvious:

- one fixture per common setup;
- no randomness unless the test is about randomness;
- return owned values so each test can mutate its copy;
- do not share a fixture between threads.

When the app starts writing files, the fixture will create a temporary
directory and return a path. That is the `tempfile` lesson; the shape stays
the same.

## Run the suite

```bash
$ cargo test
...
     Running tests/table.rs
running 2 tests
test the_fixture_has_one_done_and_one_pending ... ok
test title_rules_are_a_table ... ok

test result: ok. 2 passed; 0 failed; ...
```

The table tests are in a separate test crate. They use only the public API,
which is why `Summary` must be imported: the trait method is not in scope by
default.

## Save your work

```bash
$ git add -A
$ git commit -m "day 14: table tests and fixtures"
[main (root-commit) ...] day 14: table tests and fixtures
 16 files changed, 706 insertions(+)
...
$ git log --oneline
... day 14: table tests and fixtures
```

## If something went wrong

**`no method named summary`.** Import `Summary` from `todo`. Trait methods
need the trait in scope, even when the implementation exists.

**`cannot borrow list as mutable`.** The fixture test calls `done`, so its
binding must be `let mut list = sample_list()`. The fixture returning an owned
list does not make the binding mutable.

**`mismatched types` in the table.** All rows must have the same tuple type.
If one row uses `&str` and another uses `String`, the array will not compile;
pick one type.

**`assert_eq!` on a `Result` fails on the error type.** The error must
implement `PartialEq` and `Debug`; `TodoError` does. If you add a variant with
a non-comparable field, the assertion stops compiling.

**One row fails but the message is vague.** Add the input to the assertion
message: `assert_eq!(..., ..., "input: {input:?}")`. A table test is only as
useful as its failure message.

**Tests share a file or a list.** The fixture returns a new value per call;
do not use a `static` or a global `Mutex` unless the test is specifically
about shared state.

## Going deeper: when a table is the wrong shape

A table is right when the cases differ only in data. It is wrong when each
case needs a different sequence of actions; a table would hide the story.
Keep the table for the data, and write a named test for the workflow.

The `rstest` crate can generate table tests from attributes and fixtures. It
is convenient, but it adds a macro layer; the plain array of tuples is enough
for most of this app.

A fixture that grows branches is a test in disguise. If `sample_list` starts
taking flags, split it into `empty_list`, `sample_list`, and
`finished_list`.

<div class="day-tracker" data-day="14"></div>
