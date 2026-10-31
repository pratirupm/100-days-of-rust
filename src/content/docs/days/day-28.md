---
title: "Day 28 — Async and Tokio"
description: "Wrap the blocking file calls in async functions and run them on Tokio — without blocking the executor. — Day 28 of 100 Days of Rust."
sidebar:
  order: 28
day: 28
---

**About 2 hours** · Part V, day 3 of 5.

**You'll be able to:**

- add Tokio and write `async fn`;
- use `spawn_blocking` for the existing file API;
- test with `#[tokio::test]`.

---

The worker uses a real thread for every save. That is fine for a handful of
jobs, but a server may have thousands of connections and cannot afford a
thread each.

**Async** lets one thread run many tasks while they wait for I/O. Today we add
Tokio and wrap the existing blocking file API in async functions.

## Add Tokio

<!-- verify: Cargo.toml at=day-28 -->
```toml title="Cargo.toml"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "fs", "time", "sync"] }
```

`rt-multi-thread` gives the runtime its worker threads; `macros` gives
`#[tokio::main]` and `#[tokio::test]`; `fs`, `time`, and `sync` are the
modules the next lessons use.

## The async functions

Create `src/async_store.rs`:

<!-- verify: src/async_store.rs at=day-28 -->
```rust title="src/async_store.rs"
use std::path::Path;

use crate::error::TodoError;
use crate::store::TodoList;

/// Save a list without blocking the async runtime.
pub async fn save(list: TodoList, path: impl AsRef<Path>) -> Result<(), TodoError> {
    let path = path.as_ref().to_path_buf();
    tokio::task::spawn_blocking(move || list.save(&path))
        .await
        .map_err(|error| TodoError::Io(error.to_string()))??;
    Ok(())
}

/// Load a list without blocking the async runtime.
pub async fn load(path: impl AsRef<Path>) -> Result<TodoList, TodoError> {
    let path = path.as_ref().to_path_buf();
    tokio::task::spawn_blocking(move || TodoList::load(&path))
        .await
        .map_err(|error| TodoError::Io(error.to_string()))?
}
```

An `async fn` does not run when called; it returns a **future**. The future
runs when you `.await` it, and the runtime can pause it at an await point to
run another task.

`spawn_blocking` moves the blocking call to a dedicated blocking thread. If we
called `list.save` directly inside `async fn`, it would block a runtime worker
and stop every other task on that thread. `spawn_blocking` is the bridge from
an async caller to a synchronous library.

The result has two layers: the task may fail to join (`JoinError`), and the
save may fail (`TodoError`). `map_err` converts the join error; the two `?`
operators unwrap both layers. `load` returns the inner `Result` directly after
the join check.

## The test

<!-- verify: src/async_store.rs at=day-28 -->
```rust title="src/async_store.rs"
#[cfg(test)]
mod tests {
    use super::*;
    use crate::summary::Summary;

    #[tokio::test]
    async fn async_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("todo.json");
        let mut list = TodoList::new();
        list.add("buy milk").unwrap();

        save(list, &path).await.unwrap();
        let loaded = load(&path).await.unwrap();

        assert_eq!(loaded.summary(), "1 task(s), 0 done");
    }
}
```

`#[tokio::test]` starts a small runtime for the test and awaits the async
function. Without it, `.await` outside a runtime is an error.

## Run it

```bash
$ cargo test
...
test async_store::tests::async_round_trip ... ok
...
```

## Save your work

```bash
$ git add -A
$ git commit -m "day 28: add async store operations"
[main (root-commit) ...] day 28: add async store operations
 29 files changed, 2202 insertions(+)
...
$ git log --oneline
... day 28: add async store operations
```

## If something went wrong

**`there is no reactor running`.** You awaited an async function outside a
runtime. Use `#[tokio::main]` on `main` or `#[tokio::test]` on the test.

**`cannot find attribute tokio::main`.** The `macros` feature is missing.

**The future is never awaited.** Calling `save(list, path)` returns a future;
nothing happens until `.await` (or a spawn). The compiler warns about an
unused `Future` if you forget.

**The runtime is blocked.** You called a blocking function directly in an
async context. Use `spawn_blocking`, `tokio::fs`, or an async client.

**`JoinError` is not a `TodoError`.** Map it explicitly, as the code does.
A panic inside the blocking task becomes a join error.

**The test hangs.** A blocking call is holding the only worker thread; move it
to `spawn_blocking`, or use a multi-thread runtime.

## Going deeper: async is not a thread

A thread is scheduled by the operating system; an async task is scheduled by
the runtime. A task is a state machine that stores where it paused. That makes
thousands of waiting connections cheap, but it also means a blocking call is
much more damaging: it blocks every task on that worker.

`tokio::fs` wraps the blocking file API in its own thread pool. We used
`spawn_blocking` directly so the existing `TodoList::save` and `load` stay
synchronous and reusable. Both are correct; the explicit bridge is easier to
see.

The server will use these functions in request handlers. The next lessons add
timeouts, cancellation, and parallel work — the three things that make async
safe under load.

<div class="day-tracker" data-day="28"></div>
