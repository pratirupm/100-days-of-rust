---
title: A task is a struct
day: 3
part: I
partName: Language basics
partDay: 3
partDays: 6
time: "2 hours"
description: Give the app a real task model — a struct with an id, a title, and a status — and test it before wiring it into main.
bullets:
  - define a struct and an enum;
  - add methods with `impl`;
  - write unit tests for the model.
---

The banner prints, but the app still has no idea what a task is. Today it
gets one: a value with an id, a title, and a status.

We will write the tests first, as always. They describe the task we want
before the type exists. Then we add the type and make the tests pass.

## A struct bundles values

A task has three pieces of data: a number that identifies it, the text the
user typed, and whether it is finished. Rust's **struct** groups named values
like that into one type.

We want:

- `id` — a `u32`, an unsigned 32-bit integer;
- `title` — a `String`, because the task owns its text;
- `status` — a `Status`, which is either pending or done.

`Status` is an **enum**: a type whose value is one of a fixed set of
variants. A status is not arbitrary text; it is one of two things. The
compiler can check that we handle both.

## Write the tests first

Add this module to the bottom of `src/main.rs`:

<!-- verify: src/main.rs at=day-03 -->
```rust title="src/main.rs"
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_task_is_pending() {
        let task = Task::new(1, "buy milk");
        assert_eq!(task.id, 1);
        assert_eq!(task.title, "buy milk");
        assert_eq!(task.status, Status::Pending);
        assert!(!task.is_done());
    }

    #[test]
    fn done_marks_the_task_done() {
        let mut task = Task::new(2, "write the report");
        task.done();
        assert!(task.is_done());
        assert_eq!(task.status, Status::Done);
    }

    #[test]
    fn title_is_owned_by_the_task() {
        let title = String::from("buy milk");
        let task = Task::new(3, &title);
        drop(title);
        assert_eq!(task.title, "buy milk");
    }
}
```

A few pieces to notice:

- `#[cfg(test)]` means "compile this module only for tests." It is not part
  of the program users run.
- `use super::*;` imports everything from the file above, so the tests can
  see `Task` and `Status`.
- `#[test]` marks a function as a test; `cargo test` finds it.
- `let mut task` is mutable because `done()` changes it. The first test uses
  `let task` because it only reads.
- `assert_eq!` compares two values and prints both when they differ.
- `drop(title)` throws away the original `String`. The task must still have
  its own copy — that is what the test proves.

## Watch it fail

Run the tests:

```bash
$ cargo test
   Compiling todo v0.1.0 (...)
...
error[E0433]: cannot find type `Task` in this scope
  --> src/main.rs:...
...
error[E0433]: cannot find type `Status` in this scope
  --> src/main.rs:...
...
error: could not compile `todo` (bin "todo" test) due to 5 previous errors
```

The tests cannot compile because `Task` and `Status` do not exist yet. That
is the first half of the process. The error names the type the compiler
needs, and the tests show how it will be used.

## Make it pass

Add the model above `fn main()`:

<!-- verify: src/main.rs at=day-03 -->
```rust title="src/main.rs"
#[derive(Debug, PartialEq, Eq)]
struct Task {
    id: u32,
    title: String,
    status: Status,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Status {
    Pending,
    Done,
}

impl Task {
    fn new(id: u32, title: &str) -> Self {
        Self {
            id,
            title: title.to_string(),
            status: Status::Pending,
        }
    }

    fn done(&mut self) {
        self.status = Status::Done;
    }

    fn is_done(&self) -> bool {
        match self.status {
            Status::Pending => false,
            Status::Done => true,
        }
    }
}
```

`struct Task` declares the three fields. A value of type `Task` always has
all three; there is no "missing title" state.

`enum Status` declares exactly two variants. `#[derive(...)]` asks the
compiler to write common behavior for us:

- `Debug` lets `{:?}` print the value, which makes test failures readable.
- `PartialEq` and `Eq` let `assert_eq!` compare values.
- `Clone` and `Copy` let a `Status` be copied like a number. A plain enum
  with no heap data can be `Copy`.

`impl Task` is the block where methods live. `new` is an associated function
— it does not take `self`; it builds a new value. `done` takes `&mut self`
because it changes the task. `is_done` takes `&self` because it only reads.

`title: &str` lets the caller pass a string literal or a borrowed `String`.
`title.to_string()` makes an owned copy, so the task does not depend on the
caller's value. That is why the `drop(title)` test passes.

The `match` in `is_done` must handle both variants. If we add a third status
later, the compiler will point at this match and ask us to decide what it
means.

## Wire it into main

The model is not used by the program yet. The linter would call it dead code,
and the app would still only print the banner. For today, make one task and
show it:

<!-- verify: src/main.rs at=day-03 -->
```rust title="src/main.rs"
fn main() {
    let mut task = Task::new(1, "buy milk");
    task.done();

    println!("{USAGE}");
    println!(
        "demo: task {} {:?} done={}",
        task.id,
        task.title,
        task.is_done()
    );
}
```

The `demo:` line is temporary. It proves the model works and keeps the
compiler honest until the real commands arrive.

Run the tests again:

```bash
$ cargo test
...
running 3 tests
test tests::done_marks_the_task_done ... ok
test tests::new_task_is_pending ... ok
test tests::title_is_owned_by_the_task ... ok

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; ...
...
running 1 test
test banner_prints_on_start ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; ...
```

All four tests pass. Now run the program:

```bash
$ cargo run
...
todo — a tiny task manager

Usage:
  todo              start the interactive list
  todo add <title>  add a task
  todo list         list tasks

demo: task 1 "buy milk" done=true
```

The task was created pending, marked done, and printed. The `done=true` is
the `is_done()` result; `{:?}` printed the title with quotes because it is a
`String`.

## Save your work

<!-- transcripts: authored -->
```bash
$ git status
On branch main
...
$ git add -A
$ git commit -m "day 3: add the task model"
[main ...] day 3: add the task model
 6 files changed, 117 insertions(+)
...
$ git log --oneline
... day 3: add the task model
```

## If something went wrong

**`cannot find type Task` even though you added it.** The tests and the model
must be in the same file, and the model must be above `fn main()` or below
the tests. Rust does not care about order inside a file, but it does care
that both are in the same crate.

**`missing match arm`.** Every variant of `Status` needs an arm in
`is_done`. If you add a variant, add its arm too.

**`expected String, found &str`.** `Task::new` takes `&str` and converts it
with `.to_string()`. Do not pass a `String` where the signature says `&str`
unless you borrow it with `&`.

**`cannot borrow task as mutable`.** `done()` needs `let mut task`. Add
`mut` to the binding.

**The tests pass but `cargo run` still prints only the banner.** Check that
you replaced `fn main()` with the demo version. The tests call the model
directly; they do not run `main`.

## Going deeper: structs, enums, and copies

A struct with named fields is the clearest shape when the values have
different types. A tuple struct — `struct Point(i32, i32);` — is shorter when
the position is the name. We use named fields because `task.title` is easier
to read than `task.1`.

`Status` is `Copy` because it is small and has no heap data. `Task` is not
`Copy` because it owns a `String`; copying it would require an explicit
`Clone`. We will meet both in the next lesson.

`Debug` and `PartialEq` are not magic. They are traits, and `#[derive]`
writes an implementation for the fields. We will write traits by hand soon.

