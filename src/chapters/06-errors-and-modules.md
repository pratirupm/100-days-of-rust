---
title: Errors and modules
day: 6
part: I
partName: Language basics
partDay: 6
partDays: 6
time: "2.5 hours"
description: Make a blank title an error, return it with Result and ?, and split the growing file into a library with modules.
bullets:
  - return `Result` and use `?` to pass an error up;
  - define a `TodoError` enum with `Display` and `Error`;
  - split the crate into `lib.rs`, `task`, `store`, and `error` modules.
---

The app can add, find, and tag tasks. It still has two problems:

- a blank title is accepted, and becomes an empty task;
- everything lives in one file, which is getting long.

Today we fix both. The blank title becomes a typed error, and the file becomes
a small library with modules. This is the day the app starts to look like a
program someone else could work on.

## Errors are values

Rust does not throw exceptions. A function that can fail returns a
`Result<T, E>`:

- `Ok(value)` means it worked;
- `Err(error)` means it did not, and carries the reason.

`Result` is an enum, like `Option`, but the failure case has a value: the
error. The caller must decide what to do with it; the compiler will not let it
be ignored.

Our error type is an enum too, so each failure has a name and, when useful,
data:

<!-- verify: src/error.rs at=day-06 -->
```rust title="src/error.rs"
use std::fmt;

/// Everything that can go wrong in the core app.
#[derive(Debug, PartialEq, Eq)]
pub enum TodoError {
    /// A task was created or added with a blank title.
    EmptyTitle,
    /// No task with this id exists.
    NotFound(u32),
}

impl fmt::Display for TodoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyTitle => write!(f, "a task needs a title"),
            Self::NotFound(id) => write!(f, "no task with id {id}"),
        }
    }
}

impl std::error::Error for TodoError {}
```

`Display` is what `{}` uses when printing. `std::error::Error` is the standard
trait for error types; implementing it lets our error work with tools and with
`?` in larger programs. `NotFound(u32)` carries the missing id, so the message
can name it.

## The failing test

Add this test to the task tests:

<!-- verify: src/task.rs at=day-06 -->
```rust title="src/task.rs"
    #[test]
    fn blank_title_is_rejected() {
        assert_eq!(Task::new(4, "   "), Err(TodoError::EmptyTitle));
    }
```

Run it and the compiler stops on the missing type:

```bash
$ cargo test
   Compiling todo v0.1.0 (...)
error[E0433]: cannot find type `TodoError` in this scope
  --> src/main.rs:...
...
```

That is the first half of the error lesson: the test names the failure we want
before the type exists.

## Make the task fallible

`Task::new` now returns a `Result`:

<!-- verify: src/task.rs at=day-06 -->
```rust title="src/task.rs"
    /// Build a task from a title, refusing a blank one.
    pub fn new(id: u32, title: &str) -> Result<Self, TodoError> {
        let title = title.trim();
        if title.is_empty() {
            return Err(TodoError::EmptyTitle);
        }
        Ok(Self {
            id,
            title: title.to_string(),
            status: Status::Pending,
            tags: Vec::new(),
        })
    }
```

The `trim()` removes leading and trailing whitespace, so a title of three
spaces becomes empty and is rejected. On success, the function wraps the task
in `Ok(...)`.

Everything that calls `Task::new` now has to deal with the `Result`. Inside
`TodoList::add`, `?` does that:

<!-- verify: src/store.rs at=day-06 -->
```rust title="src/store.rs"
    /// Add a task and return its id.
    pub fn add(&mut self, title: &str) -> Result<u32, TodoError> {
        let task = Task::new(self.next_id, title)?;
        let id = task.id;
        self.next_id += 1;
        self.push(task);
        Ok(id)
    }
```

The `?` after `Task::new(...)` means: if the result is `Err`, return that
error from `add` immediately; if it is `Ok`, unwrap the task and keep going.
No `match` is needed for the common case.

The id is incremented only after the task is built. A rejected title does not
consume a number, so the next good task gets the id the failed one would have
had. The test checks exactly that.

`done` uses `?` in the other direction — turning an `Option` into a `Result`
with `ok_or`:

<!-- verify: src/store.rs at=day-06 -->
```rust title="src/store.rs"
    /// Mark a task done, or say which id was missing.
    pub fn done(&mut self, id: u32) -> Result<(), TodoError> {
        let task = self.find_mut(id).ok_or(TodoError::NotFound(id))?;
        task.done();
        Ok(())
    }
```

`find_mut` returns `Option`. `ok_or` converts `None` into
`Err(TodoError::NotFound(id))`, and `?` returns it. The success value is
`()`, the empty tuple, which is how Rust spells "nothing to return."

## Split the file into modules

The app now has three concerns: the task type, the list, and the errors. Give
each one a file.

The library root, `src/lib.rs`, declares the modules and re-exports the names
the rest of the app uses:

<!-- verify: src/lib.rs at=day-06 -->
```rust title="src/lib.rs"
//! The todo app's library: tasks, the list that stores them, and the errors
//! they can produce.

pub mod error;
pub mod store;
pub mod task;

pub use error::TodoError;
pub use store::TodoList;
pub use task::{Status, Task};
```

`mod` says "this file is a module." `pub mod` makes the module public outside
the library. `pub use` re-exports an item at the library root, so callers can
write `todo::TodoList` instead of `todo::store::TodoList`.

## Make the boundary public

A module boundary is a visibility boundary. `store.rs` and `main.rs` use
`Task`, its fields, and its methods, so every one of those items must be marked
`pub`. Make these changes while moving the code:

- `pub struct Task`, with `pub` on `id`, `title`, `status`, and `tags`;
- `pub enum Status`;
- `pub fn new`, `pub fn done`, `pub fn is_done`, and `pub fn add_tag` on `Task`;
- `pub struct TodoList` (its fields can stay private);
- `pub fn new`, `add`, `push`, `list`, `find`, `find_mut`, `find_by_title`,
  `done`, and `tag_counts` on `TodoList`.

The previous days' tests call `Task::new` and `list.add` without handling a
`Result`. Change those calls to `.unwrap()` where the title is known to be
good, or to `?` in a function that returns `Result`.

Clippy's `new_without_default` lint also expects a `Default` implementation for
a public `TodoList::new`. Add it before the tests:

```rust
impl Default for TodoList {
    fn default() -> Self {
        Self::new()
    }
}
```

The files look like this:

<!-- transcripts: authored -->
```text
src/
├── lib.rs      the library root
├── main.rs     the binary root
├── error.rs    TodoError
├── store.rs    TodoList
└── task.rs     Task and Status
```

A package can have both a library and a binary. The library is what tests and
other crates use; the binary is the program. `main.rs` imports the library:

```rust
use todo::{TodoError, TodoList};
```

The `todo` is the package name. There is no `mod store;` in `main.rs`; the
library already declares it.

Inside the library, `task.rs` imports the error with `use
crate::error::TodoError;`. `crate` means "this library"; `super` means "the
parent module"; `self` means the current module. Those three paths are the
whole module system in miniature.

## The binary handles the error

`run` returns a `Result`, so it can use `?`:

<!-- verify: src/main.rs at=day-06 -->
```rust title="src/main.rs"
fn run() -> Result<(), TodoError> {
    let mut list = TodoList::new();
    let first = list.add("buy milk")?;
    list.add("write the report")?;

    if let Some(task) = list.find_mut(first) {
        task.add_tag("errand");
    }
    list.done(first)?;

    println!("{USAGE}");

    if let Some(task) = list.find(first) {
        println!("first: {} (done={})", task.title, task.is_done());
    }
    if let Some(task) = list.find_by_title("write the report") {
        println!("found: {}", task.title);
    }

    let counts = list.tag_counts();
    println!("demo: {} task(s); tags={:?}", list.list().len(), counts);
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}
```

`main` cannot use `?` because it does not return a `Result`. It calls `run`,
prints the error to stderr, and exits with status 1. That is the usual shape
for a small command-line program: the library returns typed errors, the
binary decides how to show them.

## Run it

```bash
$ cargo test
...
running 15 tests
test store::tests::add_returns_an_id_and_appends ... ok
test store::tests::blank_title_is_an_error_and_does_not_consume_an_id ... ok
...
test task::tests::blank_title_is_rejected ... ok
test task::tests::title_is_trimmed ... ok

test result: ok. 15 passed; 0 failed; ...
...
running 1 test
test banner_prints_on_start ... ok

test result: ok. 1 passed; 0 failed; ...
```

```bash
$ cargo run
...
first: buy milk (done=true)
found: write the report
demo: 2 task(s); tags={"errand": 1}
```

The program behaves the same; the structure underneath is different. The
tests now run against the library. The smoke test still runs the binary.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 6: return errors and split the crate"
[main ...] day 6: return errors and split the crate
 10 files changed, 387 insertions(+)
...
$ git log --oneline
... day 6: return errors and split the crate
```

## If something went wrong

**`file not found for module store`.** `src/lib.rs` declares `pub mod store;`
but `src/store.rs` is missing or in the wrong folder. The file name must match
the module name.

**`unresolved import todo::TodoList`.** `main.rs` is using the package name,
but `lib.rs` has not re-exported `TodoList`, or the `pub mod store;` line is
missing. Check `lib.rs` first.

**`the ? operator can only be used in a function that returns Result`.** You
put `?` in `main`. Move the fallible work into `run() -> Result<...>` and
call it from `main`.

**`TodoError doesn't implement Display`.** The `?` and `eprintln!` need a
printable error. Implement `Display` for the enum and match every variant.

**`unused Result`.** A `Result` must be used: `?` it, `match` it, or
`unwrap()` it. If the test is intentionally checking an error, compare it
with `assert_eq!`.

**`expected Result, found Task`.** `Task::new` now returns a `Result`. Add
`.unwrap()` in tests where you know the title is good, or `?` in a function
that returns a `Result`.

## Going deeper: why a library?

A binary-only crate cannot be imported by integration tests or by another
tool. Moving the logic into `lib.rs` gives the tests a stable API and lets the
binary stay thin. The binary's job is to parse arguments, call the library,
and print results — not to own the task model.

The module tree is not a folder tree you must mirror. A module can be a file
(`store.rs`) or a directory (`store/mod.rs`). Start with files. Split into
directories only when a module has its own submodules.

We wrote `TodoError` by hand. In a later part we meet `thiserror`, which
generates most of this boilerplate from an enum. Writing it once by hand is
how you understand what the macro does.

