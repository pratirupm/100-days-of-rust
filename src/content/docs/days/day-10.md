---
title: "Day 10 — Lifetimes"
description: "Return a zero-copy view of a task — and learn how Rust names the lifetime that keeps the view tied to the list it borrows. — Day 10 of 100 Days of Rust."
sidebar:
  order: 10
day: 10
---

**About 2 hours** · Part II, day 3 of 5.

**You'll be able to:**

- define a struct that borrows a `&str`;
- write `TaskView<'a>` and `From<&'a Task>`;
- let the compiler prove a view cannot outlive its list.

---

The store can return a `&Task`, but a caller often needs only the id, title,
and status. Today we build `TaskView<'a>`: a small value that holds the
title as a **borrow**, not a clone.

The `'a` is a **lifetime**. It is the compiler's name for "how long this
reference is valid." Lifetimes do not change what a program does; they let the
compiler prove that a reference never outlives the value it points at.

## The view

Create `src/view.rs`:

<!-- verify: src/view.rs at=day-10 -->
```rust title="src/view.rs"
use std::fmt;

use crate::task::{Status, Task};

/// A zero-copy view of a task: the title is borrowed, not cloned.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TaskView<'a> {
    pub id: u32,
    pub title: &'a str,
    pub status: Status,
}

impl<'a> TaskView<'a> {
    pub fn is_done(&self) -> bool {
        self.status == Status::Done
    }
}

impl<'a> From<&'a Task> for TaskView<'a> {
    fn from(task: &'a Task) -> Self {
        Self {
            id: task.id,
            title: &task.title,
            status: task.status,
        }
    }
}

impl fmt::Display for TaskView<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "#{} {} [{}]", self.id, self.title, self.status)
    }
}
```

Read the type first: `TaskView<'a>` has a field `title: &'a str`. The `'a`
says the title points at text that lives at least as long as the view. The
other fields are owned or `Copy`, so they need no lifetime.

`From<&'a Task>` builds a view from a borrowed task. The input reference and
the output view share the same `'a`; that is the promise that the view's title
is valid exactly as long as the task's title is.

`Display for TaskView<'_>` uses `'_` — "the lifetime is inferred here." The
formatter only reads the view, so it does not need a name.

## A list of views

The store returns views borrowed from its tasks:

<!-- verify: src/store.rs at=day-10 -->
```rust title="src/store.rs"
    pub fn views(&self) -> Vec<TaskView<'_>> {
        self.tasks.iter().map(TaskView::from).collect()
    }
```

The `'_` in the return type is tied to `&self`: the views cannot outlive the
list. `map(TaskView::from)` converts each `&Task` into a view by borrowing
its title; no `String` is cloned.

Add the method to `impl TodoList` and import `TaskView`:

```rust
use crate::view::TaskView;
```

## The tests

<!-- verify: src/view.rs at=day-10 -->
```rust title="src/view.rs"
#[cfg(test)]
mod tests {
    use crate::store::TodoList;

    #[test]
    fn views_borrow_titles_without_cloning() {
        let mut list = TodoList::new();
        list.add("buy milk").unwrap();
        list.add("write the report").unwrap();

        let views = list.views();

        assert_eq!(views.len(), 2);
        assert_eq!(views[0].title, "buy milk");
        assert_eq!(views[1].title, "write the report");
        assert!(!views[0].is_done());
    }

    #[test]
    fn view_display_matches_the_task_line() {
        let mut list = TodoList::new();
        let id = list.add("buy milk").unwrap();
        list.done(id).unwrap();

        let view = list.views()[0];

        assert_eq!(format!("{view}"), "#1 buy milk [done]");
        assert!(view.is_done());
    }
}
```

The views point into the list. The tests can read them while the list is
alive. If you try to drop the list first, the compiler stops you — that is the
next section.

## The compiler says: a view cannot outlive its list

Add `drop(list);` before the assertions in the first test and run the tests:

```text
error[E0505]: cannot move out of `list` because it is borrowed
...
note: if `store::TodoList` implemented `Clone`, you could clone the value
...
error: could not compile `todo` (lib test) due to 1 previous error
```

The views borrow the list's titles. Dropping the list would free those
strings, so the compiler refuses. This is the lifetime rule in action: a
reference is valid only while its owner is alive.

## Use the views in main

<!-- verify: src/main.rs at=day-10 -->
```rust title="src/main.rs"
    let views = list.views();
    for view in &views {
        println!("view: {view} done={}", view.is_done());
    }
```

Place this after the `find_by_title` block and before `tag_counts`. Run it:

```bash
$ cargo run
...
view: #1 buy milk [done] done=true
view: #2 write the report [pending] done=false
...
```

No title was cloned. The `views` vector holds three small values and two
borrowed strings.

## Run the suite

```bash
$ cargo test
...
test view::tests::view_display_matches_the_task_line ... ok
test view::tests::views_borrow_titles_without_cloning ... ok
...
test result: ok. 22 passed; 0 failed; ...
```

## Save your work

```bash
$ git add -A
$ git commit -m "day 10: borrow task views"
[main (root-commit) ...] day 10: borrow task views
 13 files changed, 562 insertions(+)
...
$ git log --oneline
... day 10: borrow task views
```

## If something went wrong

**`missing lifetime specifier`.** A struct field or a return type has `&str`
without a lifetime. Add `'a` to the type and to the reference, or use `'_`
where the compiler can infer it.

**`borrowed value does not live long enough`.** You are returning a reference
to a local value. Return an owned `String`, or take the borrow as an input and
tie the output to it, as `views(&self)` does.

**`cannot borrow list as mutable because it is also borrowed as immutable`.**
You still hold views (or a `&Task`) and then call `add` or `done`. Let the
views go out of scope first.

**`TaskView is not Copy`.** `&str` is `Copy`, `u32` is `Copy`, `Status` is
`Copy`, so the view can derive `Copy`. If you add an owned `String` field, it
cannot.

**`expected &str, found &&str`.** You are looking at a reference to a
reference. Inside `From<&Task>`, use `&task.title`; the field is already a
`String`, so this borrows its contents.

## Going deeper: elision

Most lifetimes are not written. Rust has **elision rules**:

- every input reference gets its own lifetime;
- if there is exactly one input lifetime, the output gets it;
- if there is a `&self` or `&mut self`, the output gets its lifetime.

`fn views(&self) -> Vec<TaskView<'_>>` uses the third rule: the output views
borrow from `self`. That is why the list must stay alive.

A struct that holds a reference must name its lifetime, because the compiler
cannot guess which borrow it is. That is why `TaskView<'a>` has the parameter.

`TaskView` is the first type in the app that borrows instead of owning. It is
a preview of the store trait, the API DTOs, and the zero-copy readers later in
the book: borrow when you can, clone only when you must.

<div class="day-tracker" data-day="10"></div>
