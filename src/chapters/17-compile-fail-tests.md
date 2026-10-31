---
title: Compile-fail tests
day: 17
part: III
partName: Testing and tooling
partDay: 4
partDays: 5
time: "1.5 hours"
description: Pin a compiler error as a test — prove that using a moved value still fails, and that the message stays the one a reader will meet.
bullets:
  - add `trybuild` as a dev-dependency;
  - write a case that must not compile;
  - commit the expected compiler output.
---

Most tests prove that code works. A **compile-fail test** proves that code
does not compile — and that the error is the one we expect.

Rust is unusually good at this because the compiler is part of the language's
contract. Today we pin the move error from Day 4: using a task after `push`
must fail, with `E0382`. If a future change makes that code compile, the test
fails.

## Add trybuild

<!-- verify: Cargo.toml at=day-17 -->
```toml title="Cargo.toml"
[dev-dependencies]
insta = "1"
proptest = "1"
trybuild = "1"
```

`trybuild` compiles each case as a separate crate and compares the compiler
output with a checked-in `.stderr` file.

## The harness

Create `tests/compile_fail.rs`:

<!-- verify: tests/compile_fail.rs at=day-17 -->
```rust title="tests/compile_fail.rs"
//! Compile-fail tests: cases that must not compile, with the error pinned.

#[test]
fn moved_value_is_a_compile_error() {
    let cases = trybuild::TestCases::new();
    cases.compile_fail("tests/compile_fail/moved_value.rs");
}
```

The test itself is short. The real content is the case and its `.stderr`.

## The case

Create `tests/compile_fail/moved_value.rs`:

<!-- verify: tests/compile_fail/moved_value.rs at=day-17 -->
```rust title="tests/compile_fail/moved_value.rs"
use todo::{Task, TodoList};

fn main() {
    let mut list = TodoList::new();
    let task = Task::new(1, "buy milk").unwrap();
    list.push(task);
    println!("{}", task.title);
}
```

This is the same mistake the compiler caught on Day 4: `push` takes ownership,
so `task` cannot be used afterward. The file is not a passing program; it is a
specimen.

## The expected error

The first run has no `.stderr`. Generate it with:

<!-- transcripts: authored -->
```bash
$ TRYBUILD=overwrite cargo test --test compile_fail
```

`trybuild` writes `tests/compile_fail/moved_value.stderr`:

<!-- transcripts: authored -->
```text title="tests/compile_fail/moved_value.stderr"
error[E0382]: borrow of moved value: `task`
 --> tests/compile_fail/moved_value.rs:7:20
  |
5 |     let task = Task::new(1, "buy milk").unwrap();
  |         ---- move occurs because `task` has type `Task`, which does not implement the `Copy` trait
6 |     list.push(task);
  |               ---- value moved here
7 |     println!("{}", task.title);
  |                    ^^^^^^^^^^ value borrowed here after move
  |
help: consider cloning the value if the performance cost is acceptable
  |
6 |     list.push(task.clone());
  |                   ++++++++
```

Commit the `.stderr` file. It is the expectation, not a generated artifact.

## Run it

```bash
$ cargo test
...
     Running tests/compile_fail.rs
...
test tests/compile_fail/moved_value.rs ... ok
...
test moved_value_is_a_compile_error ... ok

test result: ok. 1 passed; 0 failed; ...
```

Try making the case compile — for example, clone the task before `push`. The
test fails with a diff: the code that was supposed to fail compiled. That is
the point. The test protects the rule, not the test file.

## Save your work

```bash
$ git add -A
$ git commit -m "day 17: pin a compile-fail case"
[main (root-commit) ...] day 17: pin a compile-fail case
 23 files changed, 1308 insertions(+)
...
$ git log --oneline
... day 17: pin a compile-fail case
```

## If something went wrong

**`wip` in the output.** `trybuild` wrote new output because the `.stderr`
was missing or stale. Review the diff, then accept it with
`TRYBUILD=overwrite` only if the new error is the one you intend.

**The test fails with a `.stderr` diff after a toolchain upgrade.** Compiler
messages change between versions. Regenerate the snapshots on the pinned
toolchain, review the diff, and commit it. This is why the app pins Rust in
`rust-toolchain.toml`.

**The case compiles.** The test fails with "expected compilation to fail".
That is a real finding: the rule you wanted to protect no longer holds.
Change the test only if the rule changed on purpose.

**The case cannot find `todo`.** The compile-fail file is compiled as its own
crate; it uses the package by name. Check `name = "todo"` and the public
exports in `lib.rs`.

**Paths in the `.stderr` differ.** `trybuild` normalizes the test's own path;
absolute paths or temporary directories are not normalized. Keep the case in
`tests/compile_fail/` and use relative paths.

**The test is slow.** Each case is a full compile. Keep the cases small and
rare; a handful of compile-fail tests is enough.

## Going deeper: errors are an API

A library's compiler errors are part of its teaching surface. If a function
takes ownership, the error should say so; if a trait bound is missing, the
error should name the trait. A compile-fail test pins that experience.

Use compile-fail tests for rules that cannot be expressed as a runtime
assertion:

- a moved value cannot be used;
- a `TaskView` cannot outlive its list;
- a trait method is not available without the trait in scope;
- a public API refuses an invalid state at compile time.

Do not pin every compiler message. Pin the rules that matter, and let the
compiler's own tests cover the rest.

