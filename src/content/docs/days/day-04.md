---
title: "Day 4 — Ownership"
description: "Give the app a list of tasks and learn the rule at the center of Rust — every value has one owner, and moving it changes who that is. — Day 4 of 100 Days of Rust."
sidebar:
  order: 4
day: 4
---

**About 2.5 hours** · Part I, day 4 of 6.

**You'll be able to:**

- keep tasks in a `Vec<Task>` behind a `TodoList`;
- move a task into the list with `push`;
- tell a move from a copy, and when to `Clone`.

---

The task model works, but it holds one task. A todo app needs a list — and a
list in Rust forces us to meet the rule the language is built around:
**every value has one owner**.

Today we add a `TodoList` that owns a `Vec<Task>`. Adding a task moves it into
the list. Reading the list borrows it. Those two verbs — move and borrow — are
the rest of this chapter.

## What we're building

A `TodoList` holds:

- `tasks: Vec<Task>` — the tasks, in the order they were added;
- `next_id: u32` — the next number to hand out.

It can `add` a task by title, `push` an existing task in, `list` the tasks,
and mark one `done` by id. The last method needs a mutable borrow of the
vector; we'll get there.

## The tests first

Replace the `mod tests` block at the bottom of `src/main.rs` with this one. Do
not paste a second module — replace the old one, adding the new tests:

<!-- verify: src/main.rs at=day-04 -->
```rust title="src/main.rs"
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_returns_an_id_and_appends() {
        let mut list = TodoList::new();
        assert_eq!(list.add("buy milk"), 1);
        assert_eq!(list.add("write the report"), 2);
        assert_eq!(list.list().len(), 2);
        assert_eq!(list.list()[0].title, "buy milk");
    }

    #[test]
    fn push_moves_a_task_into_the_list() {
        let mut list = TodoList::new();
        let task = Task::new(99, "read the book");
        let snapshot = task.clone();

        list.push(task);

        assert_eq!(list.list().len(), 1);
        assert_eq!(snapshot.title, "read the book");
        assert_eq!(list.add("next"), 100);
        // println!("{}", task.title); // error[E0382]: borrow of moved value
    }

    #[test]
    fn done_marks_a_task_by_id() {
        let mut list = TodoList::new();
        let id = list.add("buy milk");

        assert!(list.done(id));
        assert!(list.list()[0].is_done());
        assert!(!list.done(999));
    }

    #[test]
    fn clone_makes_an_independent_copy() {
        let task = Task::new(7, "buy milk");
        let mut copy = task.clone();

        copy.done();

        assert!(!task.is_done());
        assert!(copy.is_done());
    }

    #[test]
    fn list_borrows_the_tasks() {
        let mut list = TodoList::new();
        list.add("buy milk");

        let tasks: &[Task] = list.list();

        assert_eq!(tasks[0].title, "buy milk");
    }
}
```

The first test checks ids and order. The second takes a `snapshot` before the
move, so it can prove the list got the task while the snapshot stayed usable.
The line in the comment is the code that would **not** compile — the compiler
will explain why in a moment. The last test checks that marking a missing id
returns `false` instead of panicking.

## Watch it fail

```bash
$ cargo test
   Compiling todo v0.1.0 (...)
error[E0433]: cannot find type `TodoList` in this scope
...
error[E0599]: no method named `clone` found for struct `Task` in the current scope
...
error: could not compile `todo` (bin "todo" test)
```

Two things are missing: the `TodoList` type, and `Clone` on `Task`. Both are
today's build.

## Make it pass

First, tell the compiler that a `Task` can be cloned:

<!-- verify: src/main.rs at=day-04 -->
```rust title="src/main.rs"
#[derive(Debug, Clone, PartialEq, Eq)]
struct Task {
    id: u32,
    title: String,
    status: Status,
}
```

`Clone` is an explicit duplicate. The task owns a `String`, so copying it
means allocating new text; Rust refuses to do that behind your back. `Status`
is different: it is plain data with no heap allocation, so it can be `Copy` —
a cheap, implicit duplicate.

Now add the list above `fn main()`:

<!-- verify: src/main.rs at=day-04 -->
```rust title="src/main.rs"
struct TodoList {
    tasks: Vec<Task>,
    next_id: u32,
}

impl TodoList {
    fn new() -> Self {
        Self {
            tasks: Vec::new(),
            next_id: 1,
        }
    }

    fn add(&mut self, title: &str) -> u32 {
        let id = self.next_id;
        self.next_id += 1;
        self.push(Task::new(id, title));
        id
    }

    fn push(&mut self, task: Task) {
        if task.id >= self.next_id {
            self.next_id = task.id + 1;
        }
        self.tasks.push(task);
    }

    fn list(&self) -> &[Task] {
        &self.tasks
    }

    fn done(&mut self, id: u32) -> bool {
        for task in &mut self.tasks {
            if task.id == id {
                task.done();
                return true;
            }
        }
        false
    }
}
```

Read the signatures. They are the lesson:

- `add(&mut self, ...)` borrows the list mutably because it changes it.
- `push(&mut self, task: Task)` takes the task **by value**. The task moves
  into the method, and from there into the `Vec`. The caller no longer owns
  it.
- `list(&self) -> &[Task]` borrows the list immutably and returns a slice —
  a view into the vector, not a copy.
- `done(&mut self, ...)` borrows the list mutably for the whole loop. The
  loop variable is `&mut Task`, so `task.done()` can change the status.

`push` also raises `next_id` when a task arrives with a high id. Without that,
a task pushed with id 99 would collide with the next id handed out by `add`.

## Wire it into main

Replace the demo in `main`:

<!-- verify: src/main.rs at=day-04 -->
```rust title="src/main.rs"
fn main() {
    let mut list = TodoList::new();
    let first = list.add("buy milk");
    list.add("write the report");
    list.push(Task::new(99, "read the book"));

    list.done(first);

    println!("{USAGE}");
    println!(
        "demo: task {first} added; {} task(s); first done={}",
        list.list().len(),
        list.list()[0].is_done()
    );
}
```

The first task is added, then marked done by id. The list still owns all three
tasks; `main` only holds the number `first`.

Run the tests and the program:

```bash
$ cargo test
...
running 5 tests
test tests::add_returns_an_id_and_appends ... ok
test tests::clone_makes_an_independent_copy ... ok
test tests::done_marks_a_task_by_id ... ok
test tests::list_borrows_the_tasks ... ok
test tests::push_moves_a_task_into_the_list ... ok

test result: ok. 5 passed; 0 failed; ...
...
$ cargo run
...
demo: task 1 added; 3 task(s); first done=true
```

## The compiler says: moved values cannot be used

If you uncomment the line in the second test, the compiler stops you:

```text
error[E0382]: borrow of moved value: `task`
   --> src/main.rs:...
    |
    |         let task = Task::new(99, "read the book");
    |             ---- move occurs because `task` has type `Task`, which does not implement the `Copy` trait
...
    |         list.push(task);
    |                   ---- value moved here
    |         println!("{}", task.title);
    |                        ^^^^^^^^^^ value borrowed here after move
```

This is not a quirk to work around. `push` took ownership, so `task` is no
longer a valid name for that value. If you need the value in two places, make
the second copy explicit with `.clone()` — and pay the allocation — or change
the function to borrow instead of take ownership.

## Save your work

```bash
$ git add -A
$ git commit -m "day 4: own the task list"
[main (root-commit) ...] day 4: own the task list
 6 files changed, 191 insertions(+)
...
$ git log --oneline
... day 4: own the task list
```

## If something went wrong

**`the name tests is defined multiple times` (E0428).** You pasted a second
`mod tests` instead of replacing the old one. There is one tests module per
file; merge the new functions into it.

**`cannot borrow list as mutable`.** `add`, `push`, and `done` need
`let mut list`. If the binding is not mutable, the compiler will not let you
call them.

**`cannot move out of borrowed content`.** You are trying to take a `Task`
out of a `&[Task]`. The list owns the tasks; borrow them, or clone one if you
really need an owned copy.

**`expected &[Task], found &Vec<Task>`.** `&Vec<Task>` coerces to
`&[Task]` in most calls, but the return type of `list` is the slice. Keep the
signature as written; callers can still use `.len()` and indexing.

**`cannot compare Task with Task`.** Add `PartialEq` to the `Task` derive
list. `assert_eq!` needs it.

## Going deeper: moves, copies, and the vector

A move is a shallow transfer: the `Vec` takes the task's three fields, and the
old binding is marked invalid. No data is copied. A clone is deep for a
`String`: new heap storage and a new length.

`Copy` is for types whose bits can be duplicated without ownership concerns —
numbers, booleans, and small enums like `Status`. A type that owns heap data
cannot be `Copy`; if it could, two owners would free the same allocation.

The `Vec` itself is a growable buffer. `push` may reallocate and move the
elements to a larger buffer. That is safe because the `Vec` owns them; the
borrow checker prevents a reference into the buffer from outliving a
reallocation.

<div class="day-tracker" data-day="4"></div>
