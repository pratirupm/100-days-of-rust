---
title: Traits
day: 8
part: II
partName: Structure
partDay: 1
partDays: 5
time: "2 hours"
description: Describe a task and a list in one line by giving them a shared trait — and implement Rust's standard Display on the way.
bullets:
  - define a `Summary` trait;
  - implement it for `Task` and `TodoList`;
  - implement `Display` for `Task` and `Status`.
---

A task can be printed with `{:?}`, but that is debug output: quotes, field
names, and braces. A program needs a human line. Today we define one — and we
use a **trait** to say that different types can produce it.

A trait is a shared promise: "any type that implements this can do this." The
standard library's `Display` is one. Our `Summary` is another.

## The trait

Create `src/summary.rs`:

<!-- verify: src/summary.rs at=day-08 -->
```rust title="src/summary.rs"
/// A one-line description of a value.
pub trait Summary {
    fn summary(&self) -> String;
}
```

The trait declares a method signature, not a body. Each implementor supplies
the body. `&self` means the method reads the value; `String` is an owned line
the caller can keep.

Declare the module in `lib.rs` and re-export the trait:

```rust
pub mod summary;
pub use summary::Summary;
```

The rest of the crate can now `use crate::summary::Summary;` and call
`.summary()` on a type that implements it.

## Display for Status

`Status` gets the standard `Display` trait first. In `src/task.rs`:

<!-- verify: src/task.rs at=day-08 -->
```rust title="src/task.rs"
impl fmt::Display for Status {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Pending => write!(f, "pending"),
            Self::Done => write!(f, "done"),
        }
    }
}
```

`fmt` is `std::fmt`; add `use std::fmt;` at the top of the file. The method
receives a formatter and returns `fmt::Result` — `Ok(())` when the write
worked, an error when it did not. `write!` is `print!`'s cousin: it writes
into the formatter instead of the terminal.

With this impl, `format!("{}", status)` produces `pending` or `done`.

## Summary for Task

The task's one-line summary uses the status's `Display`:

<!-- verify: src/task.rs at=day-08 -->
```rust title="src/task.rs"
impl Summary for Task {
    fn summary(&self) -> String {
        format!("#{} {} [{}]", self.id, self.title, self.status)
    }
}

impl fmt::Display for Task {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.summary())
    }
}
```

`format!` builds a `String`; `{}` calls `Display` on each value. The task's
`Display` delegates to `summary`, so `format!("{task}")` and
`task.summary()` produce the same line. That is deliberate: one definition,
two ways to ask for it.

Add `use crate::summary::Summary;` to `task.rs`.

## Summary for the list

A list summary counts the tasks and how many are done:

<!-- verify: src/store.rs at=day-08 -->
```rust title="src/store.rs"
impl Summary for TodoList {
    fn summary(&self) -> String {
        let done = self.tasks.iter().filter(|task| task.is_done()).count();
        format!("{} task(s), {} done", self.tasks.len(), done)
    }
}
```

`iter()` borrows each task; `filter` keeps the ones whose closure returns
true; `count` consumes the iterator and returns a number. The list is not
changed. Add `use crate::summary::Summary;` to `store.rs`.

## The tests

Two tests for the task's line, one for the list's count:

<!-- verify: src/task.rs at=day-08 -->
```rust title="src/task.rs"
    #[test]
    fn task_display_is_one_line() {
        let mut task = Task::new(1, "buy milk").unwrap();
        assert_eq!(format!("{task}"), "#1 buy milk [pending]");
        task.done();
        assert_eq!(format!("{task}"), "#1 buy milk [done]");
    }

    #[test]
    fn task_summary_matches_display() {
        let task = Task::new(2, "write the report").unwrap();
        assert_eq!(task.summary(), format!("{task}"));
    }
```

<!-- verify: src/store.rs at=day-08 -->
```rust title="src/store.rs"
    #[test]
    fn list_summary_counts_done() {
        let mut list = TodoList::new();
        let first = list.add("buy milk").unwrap();
        list.add("write the report").unwrap();
        list.done(first).unwrap();

        assert_eq!(list.summary(), "2 task(s), 1 done");
    }
```

The tests call the trait method directly and through `Display`. If the impls
are missing, the test module does not compile: `Task` does not implement
`Display`, and `TodoList` has no `summary`.

## Use it in main

Import the trait in `src/main.rs`:

```rust
use todo::{Summary, TodoError, TodoList};
```

Then print the task and the list through their new lines:

<!-- verify: src/main.rs at=day-08 -->
```rust title="src/main.rs"
    if let Some(task) = list.find(first) {
        println!("first: {task} (done={})", task.is_done());
        println!("summary: {}", task.summary());
    }
```

And after the count:

<!-- verify: src/main.rs at=day-08 -->
```rust title="src/main.rs"
    let counts = list.tag_counts();
    println!("demo: {} task(s); tags={:?}", list.list().len(), counts);
    println!("list: {}", list.summary());
    Ok(())
```

Run it:

```bash
$ cargo run
...
first: #1 buy milk [done] (done=true)
summary: #1 buy milk [done]
found: write the report
demo: 2 task(s); tags={"errand": 1}
list: 2 task(s), 1 done
```

The tests:

```bash
$ cargo test
...
running 18 tests
...
test store::tests::list_summary_counts_done ... ok
...
test task::tests::task_display_is_one_line ... ok
test task::tests::task_summary_matches_display ... ok
...
test result: ok. 18 passed; 0 failed; ...
```

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 8: describe tasks with traits"
[main ...] day 8: describe tasks with traits
 11 files changed, 451 insertions(+)
...
$ git log --oneline
... day 8: describe tasks with traits
```

## If something went wrong

**`no method named summary`.** The trait is not in scope. Add
`use crate::summary::Summary;` in the file that calls it, or
`use todo::Summary;` in the binary.

**`Summary is not implemented for Task`.** The `impl Summary for Task` block
is missing, or it is in a file that does not compile. Check the spelling of
the trait and the type.

**`conflicting implementations of Display for Task`.** `Display` can be
implemented once per type. If you wrote it by hand and also used a derive that
provides it, remove one.

**`write!` returns an error you did not handle.** The method must return
`fmt::Result`; the last expression should be `write!(...)`, without a
semicolon, so its result is returned.

**`format!` prints `Task { ... }`.** You are using `{:?}` (Debug), not `{}`
(Display). Debug is derived; Display is the implementation you wrote.

**The list summary is wrong.** `filter` runs the closure on each task; make
sure the closure calls `is_done()` and that `done()` was actually called.

## Going deeper: traits are contracts

A trait can have default methods: a method with a body that implementors get
for free. It can also have associated types and constants. We will meet those
when the app needs them.

`Display` is special: it is what `{}`, `format!`, `to_string`, and `println!`
use. That is why implementing it makes a type print naturally everywhere,
without a custom function name.

The **orphan rule** says you can implement a trait for a type only if the
trait or the type is local to your crate. You can implement your `Summary` for
`String` (the type is foreign, the trait is yours), and you can implement
`Display` for `Task` (the trait is foreign, the type is yours). You cannot
implement `Display` for `String`; neither side is yours.

Traits are how Rust does shared behavior without inheritance. The next lesson
makes a function work for many types with generics; the trait is the bound
that says what those types must be able to do.

