---
title: Generics
day: 9
part: II
partName: Structure
partDay: 2
partDays: 5
time: "2 hours"
description: Write one search helper and one count helper that work for tasks, numbers, and anything else — by making the type a parameter.
bullets:
  - write a function with a type parameter and a trait bound;
  - use it for both `Task` and `i32`;
  - replace two hand-written loops with the helpers.
---

The store has two searches and one count that all do the same thing: walk a
slice and keep the items that match. The logic is identical; only the item
type and the condition change.

Today we write that logic once, with **generics**. A generic function takes a
type as a parameter, the same way a normal function takes a value.

## The helpers

Create `src/query.rs`:

<!-- verify: src/query.rs at=day-09 -->
```rust title="src/query.rs"
/// Return the first item that matches the predicate.
pub fn find_first<T, F>(items: &[T], predicate: F) -> Option<&T>
where
    F: Fn(&T) -> bool,
{
    items.iter().find(|item| predicate(item))
}

/// Count the items that match the predicate.
pub fn count_if<T, F>(items: &[T], predicate: F) -> usize
where
    F: Fn(&T) -> bool,
{
    items.iter().filter(|item| predicate(item)).count()
}
```

Two type parameters, not one:

- `T` is the item type — `Task`, `i32`, anything.
- `F` is the predicate type — a closure or function that takes `&T` and
  returns `bool`.

The `where` clause is the **trait bound**: `F: Fn(&T) -> bool` says "whatever
`F` is, it must be callable with a `&T` and return a `bool`." Without that
bound, the compiler would not know that `predicate(item)` is allowed.

`items.iter()` produces `&T` items. `find`'s closure receives a reference to
the item, so `item` is `&&T`; Rust's deref coercion passes it to `predicate`
as `&T`. `filter` works the same way, and `count` turns the matching items
into a number.

## Use the helpers in the store

In `src/store.rs`, add:

```rust
use crate::query::{count_if, find_first};
```

Then replace the two searches:

<!-- verify: src/store.rs at=day-09 -->
```rust title="src/store.rs"
    pub fn find(&self, id: u32) -> Option<&Task> {
        find_first(&self.tasks, |task| task.id == id)
    }
```

<!-- verify: src/store.rs at=day-09 -->
```rust title="src/store.rs"
    pub fn find_by_title(&self, title: &str) -> Option<&Task> {
        find_first(&self.tasks, |task| task.title == title)
    }
```

The compiler infers `T = Task` from `&self.tasks`. The closure's parameter is
`&Task`, so `task.id` and `task.title` work. The `title` closure borrows the
function argument; `Fn` allows that because it only reads.

The summary count uses the second helper:

<!-- verify: src/store.rs at=day-09 -->
```rust title="src/store.rs"
    fn summary(&self) -> String {
        let done = count_if(&self.tasks, |task| task.is_done());
        format!("{} task(s), {} done", self.tasks.len(), done)
    }
```

There is no `Task` in either signature in `query.rs`. That is the point: the
helpers do not know what a task is. They know how to walk a slice and ask a
question.

## The same helpers on numbers

The tests prove the helpers are not tied to tasks:

<!-- verify: src/query.rs at=day-09 -->
```rust title="src/query.rs"
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_first_returns_a_borrow() {
        let values = [1, 2, 3];
        assert_eq!(find_first(&values, |value| *value == 2), Some(&2));
    }

    #[test]
    fn count_if_counts_matching_items() {
        let values = [1, 2, 3, 4];
        assert_eq!(count_if(&values, |value| *value % 2 == 0), 2);
    }
}
```

Here `T = i32`; the closure receives `&i32`, and `*value` reads the number.
The same functions that search tasks also search integers. The compiler
generates a separate copy for each concrete type — this is called
**monomorphization**. The source is generic; the binary is not.

## Run it

```bash
$ cargo test
...
running 20 tests
test query::tests::count_if_counts_matching_items ... ok
test query::tests::find_first_returns_a_borrow ... ok
...
test result: ok. 20 passed; 0 failed; ...
```

The store's tests still pass: `find` and `find_by_title` now go through the
helpers, and their behavior did not change.

```bash
$ cargo run
...
first: #1 buy milk [done] (done=true)
...
```

## Save your work

```bash
$ git add -A
$ git commit -m "day 9: write generic helpers"
[main (root-commit) ...] day 9: write generic helpers
 12 files changed, 486 insertions(+)
...
$ git log --oneline
... day 9: write generic helpers
```

## If something went wrong

**`the trait bound F: Fn(&T) -> bool is not satisfied`.** The closure's
parameter or return type does not match. A search predicate takes `&T` and
returns `bool`; check the closure.

**`cannot find function find_first`.** The module is not declared or imported.
Add `pub mod query;` to `lib.rs` and `use crate::query::find_first;` where it
is called.

**`expected &T, found &&T`.** The `find` closure gives you `&&T`; the helper
passes it to `predicate`, which expects `&T`. The deref coercion normally
handles it. If you write the helper yourself without the coerced call, use
`predicate(*item)`.

**`closure may outlive the current function`.** The predicate borrows a local
value and the helper stores it longer than the value lives. The helpers here
do not store the closure; check the signature if you changed it.

**`T cannot be compared`.** `find_first` does not compare `T`; the closure
does. Add the comparison to the closure, or add a trait bound such as
`T: PartialEq` if the function itself must compare.

## Going deeper: generics are erased by use

A generic function is checked once for every type it is used with. The
compiler knows the concrete types at the call site, so the generated code has
no runtime type checks and no boxing. This is why generic Rust is fast by
default.

You can put a generic on a struct too: `struct Page<T> { items: Vec<T> }`. We
will use generic types when the store gets a backend that can hold different
item types.

`Fn` is one of three closure traits. `Fn` can be called repeatedly and only
reads captures; `FnMut` can change captures; `FnOnce` consumes them. A search
predicate only reads, so `Fn` is the right bound.

The `where` clause can move to the signature — `fn find_first<T, F: Fn(&T) ->
bool>(...)` — but the separate clause is easier to read when the bounds grow.
Both mean the same thing.

