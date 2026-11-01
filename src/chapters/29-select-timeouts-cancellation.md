---
title: Select, timeouts, and cancellation
day: 29
part: V
partName: Concurrency and async
partDay: 4
partDays: 5
time: "2 hours"
description: Put a deadline on a save and let a cancellation signal win a race — the two tools every server needs to shut down cleanly.
bullets:
  - wrap a future in `tokio::time::timeout`;
  - race a future against a `oneshot` signal with `select!`;
  - test both outcomes without a long wait.
---

An async task can wait forever. A save on a stuck disk, a request to a dead
service, a shutdown signal that never arrives — the program must have a way
out.

Today we add two exits: a **timeout** and a **cancellation signal**. Both are
built on `tokio::select!`, which polls several futures and takes the first one
that finishes.

## A save with a deadline

Add to `src/async_store.rs`:

<!-- verify: src/async_store.rs at=day-29 -->
```rust title="src/async_store.rs"
/// Save a list, failing if the write takes longer than the limit.
pub async fn save_with_timeout(
    list: TodoList,
    path: impl AsRef<Path>,
    limit: std::time::Duration,
) -> Result<(), TodoError> {
    match tokio::time::timeout(limit, save(list, path)).await {
        Ok(result) => result,
        Err(_) => Err(TodoError::Io("save timed out".to_string())),
    }
}

/// Wait for cancellation or a deadline, whichever comes first.
pub async fn wait_or_cancel(
    mut cancel: tokio::sync::oneshot::Receiver<()>,
    limit: std::time::Duration,
) -> &'static str {
    tokio::select! {
        _ = &mut cancel => "cancelled",
        _ = tokio::time::sleep(limit) => "timeout",
    }
}
```

`timeout(limit, future)` returns `Ok(result)` if the future finishes in time,
and `Err(Elapsed)` if it does not. The inner future is cancelled when the
timeout fires; for `save`, that means the blocking task is left to finish in
its pool, but the caller gets control back.

`select!` polls both branches. When more than one is ready, Tokio chooses one
at random by default; the loser is dropped. Add `biased;` at the top of the
macro to poll in the order written instead. `&mut cancel` is important:
`select!` needs to poll the receiver without consuming it, so the loop can try
again.

The return type `&'static str` is a small label for the test and the caller.
A real shutdown path would return a richer reason.

## The tests

<!-- verify: src/async_store.rs at=day-29 -->
```rust title="src/async_store.rs"
    #[tokio::test]
    async fn cancellation_wins() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        tx.send(()).unwrap();

        assert_eq!(
            wait_or_cancel(rx, std::time::Duration::from_secs(5)).await,
            "cancelled"
        );
    }

    #[tokio::test]
    async fn a_short_deadline_times_out() {
        let (_tx, rx) = tokio::sync::oneshot::channel();

        assert_eq!(
            wait_or_cancel(rx, std::time::Duration::from_millis(5)).await,
            "timeout"
        );
    }
```

The first test sends on the channel before awaiting; cancellation is already
ready, so it wins. The second holds the sender open and gives the deadline
five milliseconds; the sleep fires first. Neither test waits five seconds.

The save timeout has its own success test with a generous limit; a timeout test
for the real file write would be timing-dependent, so the deterministic
`wait_or_cancel` covers the failure path.

## Why this matters

A server has three exits it must honor:

- **deadline** — a request cannot take forever;
- **client disconnect** — the caller is gone; stop working;
- **shutdown** — the process is stopping; finish or abandon cleanly.

`timeout` covers the first. A `oneshot` or `CancellationToken` covers the
other two. The next lesson runs work in parallel; the shutdown path is what
keeps parallel work from leaking.

## Run it

```bash
$ cargo test
...
test async_store::tests::a_short_deadline_times_out ... ok
test async_store::tests::cancellation_wins ... ok
test async_store::tests::save_with_timeout_succeeds ... ok
...
```

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 29: add timeouts and cancellation"
[main ...] day 29: add timeouts and cancellation
 29 files changed, 2259 insertions(+)
...
$ git log --oneline
... day 29: add timeouts and cancellation
```

## If something went wrong

**`select!` reports a moved value.** One branch consumes the future; use
`&mut` on a receiver or pin the future. `tokio::time::sleep` is safe to create
inside the branch.

**The timeout never fires.** The future completed first, or the duration is
zero and the branch is ready immediately. Check the branch order and the
duration.

**A cancelled save still writes.** `timeout` cancels the *future*, not the
blocking task inside `spawn_blocking`. The write may finish after the caller
has moved on. If that matters, make the save itself check a cancellation
token, or use an async file API that can be cancelled.

**The test is flaky.** A 5 ms deadline on a busy machine can lose the race.
Use a channel that is already cancelled for the deterministic branch, as the
first test does.

`oneshot::Receiver` is `Unpin`; `&mut` is needed so the receiver is not consumed
by the macro and can be polled again in a loop.

**No runtime.** `#[tokio::test]` or `#[tokio::main]` is required for
`.await`.

## Going deeper: cooperative cancellation

A timeout drops the future at an await point. Code between awaits cannot be
interrupted; a long CPU loop in an async function will still block. That is
why cancellation is **cooperative**: put await points where work can pause,
and check a token in long loops.

`tokio_util::sync::CancellationToken` is a cloneable signal that many tasks can
await. It is the usual tool for graceful shutdown: cancel the token, wait for
the tasks to finish, then close the listener.

`select!` is random by default when several branches are ready. Add `biased;`
only when the priority is deliberate; an arbitrary priority can starve a
branch.

