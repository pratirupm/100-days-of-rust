---
title: "Day 31 — Review: Part V"
description: "Catch up on threads, shared state, Tokio, timeouts, cancellation, and JoinSet, then tag Part V. — Day 31 of 100 Days of Rust."
sidebar:
  order: 31
day: 31
---

**About 1.5 hours** · Part V, review.

Part V added the tools a server needs: a worker thread, a shared list behind a
lock, async file operations, deadlines, cancellation, and a parallel batch.

The CLI still runs synchronously. These pieces are the foundation for the API
in Part VII; the tests prove they work before a server depends on them.

## Run the check

```bash
$ make check
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
...
cargo test --locked --workspace
...
test result: ok. ...
...
RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps
 Documenting todo v0.1.0 (...)
    Finished `dev` profile ...
   Generated /target/doc/todo/index.html
```

## Read the new modules

<!-- transcripts: authored -->
```text
src/
├── worker.rs        background saves over an mpsc channel
├── shared.rs        Arc<RwLock<TodoList>>
├── async_store.rs   async save/load, timeout, cancellation
└── parallel.rs      JoinSet batch saves
```

Each module is public and tested. None of them is wired into the CLI yet; that
is deliberate. The CLI's job is small; the server will use the async pieces.

## What you should be able to explain

- Why a channel moves work instead of sharing it.
- What `Arc` adds to a value, and what `RwLock` adds on top.
- Why a blocking call inside an async function is a bug.
- What `timeout` cancels, and what it does not.
- Why `select!` needs `&mut` on a receiver.
- What `JoinSet` owns, and what happens to unfinished tasks when it drops.
- Why unbounded parallelism is a memory risk.

## Check your history

<!-- transcripts: authored -->
```bash
$ git log --oneline
... day 30: save many lists with JoinSet
... day 29: add timeouts and cancellation
... day 28: add async store operations
... day 27: share the list behind a lock
... day 26: save tasks on a worker thread
$ git tag part-v
```

## If something is red

**A thread test hangs.** A worker is waiting forever. Drop the handle, send
the stop message, or join explicitly.

**`RwLock` is poisoned.** A thread panicked while holding the lock. Fix the
panic; a poisoned lock is a symptom, not the disease.

**An async test says "no reactor running".** Add `#[tokio::test]`.

**A timeout test is flaky.** Use an already-cancelled channel for the
deterministic branch; do not race a 5 ms timer on a shared machine.

**A JoinSet test fails on a missing file.** The parent directory must exist;
`save` does not create directories.

## The milestone

You have the concurrency toolkit and tests for each piece. The next part moves
the data layer from a JSON file to SQLite, behind a trait that can accept both.

Tag it:

<!-- transcripts: authored -->
```bash
$ git tag part-v
```

Next: the data layer. A real database, migrations, queries, transactions,
UUIDs, and the store interface that lets the app swap backends.

<div class="day-tracker" data-day="31"></div>
