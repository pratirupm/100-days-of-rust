---
title: "Day 30 — Streams and parallelism"
description: "Run many saves at once with JoinSet, collect the results in one place, and decide what to do when one job fails. — Day 30 of 100 Days of Rust."
sidebar:
  order: 30
day: 30
---

**About 2 hours** · Part V, day 5 of 5.

**You'll be able to:**

- spawn a set of tasks with `JoinSet`;
- collect results with `join_next`;
- understand unbounded fan-out and when to bound it.

---

One save at a time is simple. A batch of exports, a set of shards, a page of
independent requests — those want parallelism. Tokio's `JoinSet` runs a
collection of tasks and gives the results back in one place.

Today we save several lists concurrently.

## The parallel save

Create `src/parallel.rs`:

<!-- verify: src/parallel.rs at=day-30 -->
```rust title="src/parallel.rs"
use std::path::PathBuf;

use tokio::task::JoinSet;

use crate::error::TodoError;
use crate::store::TodoList;

/// Save several lists concurrently; return how many finished.
pub async fn save_all(jobs: Vec<(TodoList, PathBuf)>) -> Result<usize, TodoError> {
    let mut set = JoinSet::new();
    for (list, path) in jobs {
        set.spawn(async move { list.save(&path) });
    }

    let mut saved = 0;
    while let Some(result) = set.join_next().await {
        result.map_err(|error| TodoError::Io(error.to_string()))??;
        saved += 1;
    }
    Ok(saved)
}
```
Declare it in `src/lib.rs`:

```rust
pub mod parallel;
```


`JoinSet::spawn` starts a task and keeps its handle in the set. The task owns
the list and path (`async move`), so it is `'static` and can outlive the loop
iteration. `join_next` awaits the next task to finish, in completion order,
not submission order.

The result has two layers again: the task may panic or be cancelled
(`JoinError`), and the save may fail (`TodoError`). `map_err` converts the
first; `??` unwraps both. On the first failure, the function returns; the
remaining tasks are aborted when the `JoinSet` is dropped.

## The tests

<!-- verify: src/parallel.rs at=day-30 -->
```rust title="src/parallel.rs"
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn saves_many_lists_in_parallel() {
        let dir = tempfile::tempdir().unwrap();
        let mut jobs = Vec::new();

        for i in 0..3 {
            let mut list = TodoList::new();
            list.add(&format!("task {i}")).unwrap();
            jobs.push((list, dir.path().join(format!("list-{i}.json"))));
        }

        assert_eq!(save_all(jobs).await.unwrap(), 3);
        for i in 0..3 {
            assert!(dir.path().join(format!("list-{i}.json")).exists());
        }
    }

    #[tokio::test]
    async fn a_failed_save_fails_the_batch() {
        let dir = tempfile::tempdir().unwrap();
        let mut list = TodoList::new();
        list.add("buy milk").unwrap();
        let missing = dir.path().join("missing").join("todo.json");

        let result = save_all(vec![(list, missing)]).await;

        assert!(matches!(result, Err(TodoError::Io(_))));
    }
}
```

The first test checks the count and the files. The second uses a path whose
parent directory does not exist; the save fails, and so does the batch. The
`matches!` assertion checks the error variant without comparing the platform's
exact message.

## Why JoinSet, not a bare spawn loop?

`tokio::spawn` returns a `JoinHandle`. You can collect handles and await them,
but a `JoinSet` gives you:

- a single place to await completion, in completion order;
- automatic abort of unfinished tasks when the set is dropped;
- a clean way to add tasks while others are running.

That is structured concurrency: the parent owns the set, and the set owns the
tasks. No task outlives the batch by accident.

## Run it

```bash
$ cargo test
...
test parallel::tests::a_failed_save_fails_the_batch ... ok
test parallel::tests::saves_many_lists_in_parallel ... ok
...
```

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 30: save many lists with JoinSet"
[main ...] day 30: save many lists with JoinSet
 30 files changed, 2316 insertions(+)
...
$ git log --oneline
... day 30: save many lists with JoinSet
```

## If something went wrong

**`future cannot be sent between threads safely`.** A task must be `Send +
'static`. Do not capture a short-lived borrow; move owned values into the
`async move` block.

**`spawn` panics with "no reactor running".** Spawn inside a Tokio runtime,
or use `#[tokio::main]` / `#[tokio::test]`.

**A failed task does not stop the others.** `save_all` returns on the first
error and drops the set, which aborts the rest. If you need to collect every
result, store errors in a `Vec` and keep joining instead of returning early.

**Thousands of tasks exhaust memory.** `JoinSet` fan-out is unbounded. Bound
it with a `Semaphore`, or use `futures::stream::iter(jobs).buffer_unordered(n)`
so at most `n` futures are in flight.

**Blocking work freezes the runtime.** `list.save` is blocking; it runs inside
an async task here. For a large batch, wrap each save in `spawn_blocking`, as
`async_store::save` does, or use `tokio::fs`.

**Results arrive out of order.** `join_next` returns completion order. If you
need submission order, collect the results into a map keyed by an id, or use a
`Vec` of handles and await them in order.

## Going deeper: streams and backpressure

A stream is an async iterator: values arrive over time. `StreamExt::buffer_unordered(n)`
runs up to `n` futures from a stream and yields results as they finish. That is
bounded parallelism with backpressure: the source is pulled only as capacity
frees up.

For the app, the batch is small enough for `JoinSet`. When the server exports a
whole database or fans out to many shards, bounded streams are the safer shape.
The rule is the same as the thread lesson: a queue without a bound is a memory
leak waiting for load.

<div class="day-tracker" data-day="30"></div>
