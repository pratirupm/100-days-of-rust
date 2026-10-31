---
title: "Day 5 — Borrowing and collections"
description: "Search the list without copying it, change one task through a mutable borrow, and count tags with a HashMap. — Day 5 of 100 Days of Rust."
sidebar:
  order: 5
day: 5
---

**About 2.5 hours** · Part I, day 5 of 6.

**You'll be able to:**

- return borrowed tasks with `Option<&Task>`;
- mutate one task through `Option<&mut Task>`;
- count tags in a `HashMap` whose keys borrow from the list.

---

The list owns its tasks. Today we read them without copying, change one of
them in place, and count their tags.

The new tools are `Option`, the two kinds of borrow, and `HashMap`. The rule
from yesterday still holds: a value has one owner. Borrowing lets us use it
without taking it.

## What we're adding

A task can now carry tags — short labels like `errand` or `work`. Each task
owns a `Vec<String>` of tags.

The list gets four new methods:

- `find(id) -> Option<&Task>` — a shared borrow of one task;
- `find_mut(id) -> Option<&mut Task>` — an exclusive borrow that can change it;
- `find_by_title(title) -> Option<&Task>` — an exact-title search;
- `tag_counts() -> HashMap<&str, usize>` — how many tasks carry each tag.

`Option` is an enum with two variants: `Some(value)` or `None`. It replaces
the missing value that other languages spell as `null`; the compiler makes
you handle the `None` case.

## Add tags to a task

The task owns its tags, so the struct gains one field:

<!-- verify: src/main.rs at=day-05 -->
```rust title="src/main.rs"
#[derive(Debug, Clone, PartialEq, Eq)]
struct Task {
    id: u32,
    title: String,
    status: Status,
    tags: Vec<String>,
}
```

`Task::new` initializes it with `tags: Vec::new()`. Then `add_tag` takes a
borrowed `&str`, checks for a duplicate, and stores an owned copy:

<!-- verify: src/main.rs at=day-05 -->
```rust title="src/main.rs"
    fn add_tag(&mut self, tag: &str) {
        for existing in &self.tags {
            if existing == tag {
                return;
            }
        }
        self.tags.push(tag.to_string());
    }
```

The loop borrows each existing tag; `existing == tag` compares a `&String`
with a `&str`. If the tag is already there, the method returns without
pushing a second copy. `tag.to_string()` allocates the owned `String` the
vector stores.

## Find without copying

The search methods return a reference, not a `Task`:

<!-- verify: src/main.rs at=day-05 -->
```rust title="src/main.rs"
    fn find(&self, id: u32) -> Option<&Task> {
        self.tasks.iter().find(|task| task.id == id)
    }

    fn find_mut(&mut self, id: u32) -> Option<&mut Task> {
        self.tasks.iter_mut().find(|task| task.id == id)
    }

    fn find_by_title(&self, title: &str) -> Option<&Task> {
        self.tasks.iter().find(|task| task.title == title)
    }

    fn done(&mut self, id: u32) -> bool {
        if let Some(task) = self.find_mut(id) {
            task.done();
            true
        } else {
            false
        }
    }

    fn tag_counts(&self) -> HashMap<&str, usize> {
        let mut counts: HashMap<&str, usize> = HashMap::new();
        for task in &self.tasks {
            for tag in &task.tags {
                *counts.entry(tag.as_str()).or_insert(0) += 1;
            }
        }
        counts
    }
```

Read the signatures first:

- `find` borrows the list with `&self` and returns `Option<&Task>`. The
  reference points into the vector; no task is copied.
- `find_mut` borrows with `&mut self` and returns `Option<&mut Task>`. While
  that reference is alive, the rest of the list is off limits.
- `find_by_title` is another shared search. It compares a `String` with a
  `&str`; Rust has an implementation that makes that comparison work.
- `done` uses `if let Some(task) = ...`. If the task exists, it calls
  `task.done()` and returns `true`; otherwise `false`. The `else` handles
  `None`.
- `tag_counts` builds a `HashMap<&str, usize>` whose keys borrow the tag
  strings inside the tasks. No tag is cloned.

`.iter().find(|task| ...)` is an iterator chain. `iter()` walks the vector by
shared reference; `find` returns the first item matching the closure. The
closure `|task| task.id == id` is a small unnamed function. We will meet
closures properly later; for now, read it as "given a task, is its id this
id?"

`find_mut` uses `iter_mut()` and returns the matching `&mut Task`. The
`tag_counts` loop uses `entry(tag.as_str()).or_insert(0)`: look up the key,
insert `0` if it is missing, and give back a mutable count. The `*` derefs
that count so `+= 1` can update it.

## The tests

Keep the tests from yesterday and add these four at the end of the module:

<!-- verify: src/main.rs at=day-05 -->
```rust title="src/main.rs"
    #[test]
    fn find_returns_a_borrow() {
        let mut list = TodoList::new();
        let id = list.add("buy milk");

        let task: &Task = list.find(id).unwrap();

        assert_eq!(task.title, "buy milk");
    }

    #[test]
    fn find_mut_changes_the_task() {
        let mut list = TodoList::new();
        let id = list.add("buy milk");

        let task: &mut Task = list.find_mut(id).unwrap();
        task.add_tag("errand");

        assert_eq!(list.find(id).unwrap().tags, ["errand"]);
    }

    #[test]
    fn find_by_title_is_exact() {
        let mut list = TodoList::new();
        list.add("buy milk");
        list.add("buy milk and bread");

        assert!(list.find_by_title("buy milk").is_some());
        assert!(list.find_by_title("buy").is_none());
    }

    #[test]
    fn tags_are_owned_and_counted() {
        let mut list = TodoList::new();
        let first = list.add("buy milk");
        let second = list.add("write the report");

        list.find_mut(first).unwrap().add_tag("errand");
        list.find_mut(first).unwrap().add_tag("errand");
        list.find_mut(second).unwrap().add_tag("work");

        let counts = list.tag_counts();

        assert_eq!(counts.get("errand"), Some(&1));
        assert_eq!(counts.get("work"), Some(&1));
    }
```

The `find_returns_a_borrow` annotation `let task: &Task` is deliberate: it
pins the return type. `find_mut_changes_the_task` holds the mutable borrow
only long enough to add a tag; then `list.find(id)` borrows shared again.

The tag test adds `errand` twice and still expects a count of one, because
`add_tag` refuses duplicates. `counts.get("errand")` returns `Option<&usize>`,
so the assertion compares with `Some(&1)`.

## Watch it fail

```bash
$ cargo test
   Compiling todo v0.1.0 (...)
error[E0599]: no method named `find` found for struct `TodoList` in the current scope
...
error[E0599]: no method named `find_mut` found for struct `TodoList` in the current scope
...
error[E0599]: no method named `tag_counts` found for struct `TodoList` in the current scope
...
```

The tests describe the API before it exists. Add the task field and the list
methods, and the errors go away.

## Wire it into main

<!-- verify: src/main.rs at=day-05 -->
```rust title="src/main.rs"
fn main() {
    let mut list = TodoList::new();
    let first = list.add("buy milk");
    list.add("write the report");

    if let Some(task) = list.find_mut(first) {
        task.add_tag("errand");
    }
    list.done(first);
    println!("{USAGE}");

    if let Some(task) = list.find(first) {
        println!("first: {} (done={})", task.title, task.is_done());
    }
    if let Some(task) = list.find_by_title("write the report") {
        println!("found: {}", task.title);
    }

    let counts = list.tag_counts();
    println!("demo: {} task(s); tags={:?}", list.list().len(), counts);
}
```

Run it:

```bash
$ cargo run
...
todo — a tiny task manager

Usage:
  todo              start the interactive list
  todo add <title>  add a task
  todo list         list tasks

first: buy milk (done=true)
found: write the report
demo: 2 task(s); tags={"errand": 1}
```

The tag map has one entry. `HashMap` does not promise an order, so a program
that needs sorted output must sort the keys.

## Save your work

```bash
$ git add -A
$ git commit -m "day 5: borrow, search, and count tags"
[main (root-commit) ...] day 5: borrow, search, and count tags
 6 files changed, 277 insertions(+)
...
$ git log --oneline
... day 5: borrow, search, and count tags
```

## If something went wrong

**`no method named find`.** The method is missing from `impl TodoList`, or
you added it outside the `impl` block. Keep the methods inside the block.

**`cannot borrow list as mutable because it is also borrowed as immutable`.**
You are holding a `&Task` from `find` and then calling `add` or `find_mut`.
Let the shared borrow end first — usually by not using `task` after the
mutation.

**`temporary value dropped while borrowed`.** A `tag_counts()` map borrows
from the list. Store the map in a variable and use it while the list is
unchanged; do not mutate the list and keep using the map.

**`no field tags`.** `Task` needs the `tags: Vec<String>` field and `new`
must initialize it with `Vec::new()`.

**`mismatched types` on `counts.get("errand")`.** The key type is `&str`, so
`get` returns `Option<&usize>`. Compare with `Some(&1)` or use
`assert_eq!(counts["errand"], 1)`.

**The tag count is two for one task.** `add_tag` must check for an existing
tag before pushing. The duplicate check is the loop at the top of the method.

## Going deeper: borrowed keys and the entry API

`HashMap<&str, usize>` is a map whose keys point at the strings owned by the
tasks. That is efficient — no key is copied — but it ties the map's lifetime
to the list. The compiler will not let the list be mutated while the map is
alive.

If you need the counts after changing the list, return owned keys instead:
`HashMap<String, usize>`, and insert `tag.clone()`. The clone costs an
allocation per distinct tag; the borrowed map costs none.

`entry` is the map's insert-or-update tool. `or_insert(0)` returns a mutable
reference to the existing value or inserts a new `0` and returns that. The
`entry` API avoids a second lookup and is worth learning early.

<div class="day-tracker" data-day="5"></div>
