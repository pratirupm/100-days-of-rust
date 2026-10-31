---
title: Review — Part I
day: 7
part: I
partName: Language basics
time: "1.5 hours"
description: Catch up, run the whole suite, read the history, and tag Part I.
review: true
---

Part I is finished. You started with an empty folder and now have a task
model, an in-memory list, ownership and borrowing in use, tags counted in a
map, typed errors, and a library split into modules.

Today is a catch-up day. No new code — run what you have, read it, and save a
milestone.

## Run the suite

From the project root:

```bash
$ cargo test
...
running 15 tests
test store::tests::add_returns_an_id_and_appends ... ok
test store::tests::blank_title_is_an_error_and_does_not_consume_an_id ... ok
test store::tests::done_marks_a_task_by_id ... ok
test store::tests::clone_makes_an_independent_copy ... ok
test store::tests::find_by_title_is_exact ... ok
test store::tests::find_mut_changes_the_task ... ok
test store::tests::find_returns_a_borrow ... ok
test store::tests::list_borrows_the_tasks ... ok
test store::tests::push_moves_a_task_into_the_list ... ok
test store::tests::tags_are_owned_and_counted ... ok
test task::tests::blank_title_is_rejected ... ok
test task::tests::done_marks_the_task_done ... ok
test task::tests::new_task_is_pending ... ok
test task::tests::title_is_owned_by_the_task ... ok
test task::tests::title_is_trimmed ... ok

test result: ok. 15 passed; 0 failed; ...
...
running 1 test
test banner_prints_on_start ... ok

test result: ok. 1 passed; 0 failed; ...
```

If one test is red, read the failure before changing code. The message names
the file, the line, and the value it expected. Fix one test at a time, then
run the suite again.

## Read the tree

Your project now looks like this:

<!-- transcripts: authored -->
```text
todo/
├── Cargo.toml
├── Cargo.lock
├── rust-toolchain.toml
├── src/
│   ├── lib.rs
│   ├── main.rs
│   ├── error.rs
│   ├── store.rs
│   └── task.rs
└── tests/
    └── smoke.rs
```

`lib.rs` is the library root. `main.rs` is the binary. `task.rs`, `store.rs`,
and `error.rs` are modules. `tests/smoke.rs` is the integration test that runs
the real binary.

## Check your history

Look at the save points you made this week:

<!-- transcripts: authored -->
```bash
$ git log --oneline
... day 6: return errors and split the crate
... day 5: borrow, search, and count tags
... day 4: own the task list
... day 3: add the task model
... day 2: add the first test
... day 1: create the todo crate
$ git tag part-i
```

`git log --oneline` shows one line per commit; the hash is different on every
machine. The messages are a diary of the week. `git tag part-i` puts a name on
the current state, so you can return to the end of Part I later.

If your history is shorter, that is fine. A save point you actually made is
worth more than a perfect history you copied.

## What you should be able to explain

Try each one out loud, without looking. If it feels fuzzy, reread that day.

- The difference between a **struct** and an **enum**.
- Why `Task` owns a `String` and why `Status` can be `Copy`.
- What a **move** does to the old binding.
- The difference between `&T` and `&mut T`, and why they cannot overlap.
- What `Option` means, and how `if let` handles `None`.
- What `Result` means, and what `?` does with an `Err`.
- How `lib.rs` and `main.rs` share the `task`, `store`, and `error` modules.
- Why the tests live in `#[cfg(test)] mod tests` and in `tests/`.

## If the suite is red

**`no method named ...`.** The method is missing or outside its `impl` block.
Check the module where it belongs.

**`cannot borrow ... as mutable`.** You are holding a shared borrow while
calling a method that needs `&mut self`. Let the shared borrow end.

**`expected Result, found Task`.** `Task::new` returns a `Result`. Add `?` in a
function that returns a `Result`, or `.unwrap()` in a test with a valid title.

**`unresolved import`.** Check `pub mod` and `pub use` in `lib.rs`, and the
file name that matches the module name.

**A test passes alone but fails with the others.** Tests run in parallel. A
test that shares a file or a global value with another test will race. Use a
temporary path per test, or `--test-threads=1` to confirm the cause.

## The milestone

You have a working library, a working binary, and a test suite. That is the
foundation for everything after this: traits, generics, lifetimes, CLI
arguments, persistence, and the server.

Take the win. Then tag it:

<!-- transcripts: authored -->
```bash
$ git tag part-i
```

The next part adds traits, generics, and lifetimes. The task model gets a
`Display` implementation, the list gets a generic helper, and search gets a
zero-copy view.

