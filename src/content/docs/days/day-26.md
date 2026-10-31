---
title: "Day 26 — Threads and channels"
description: "Move saving off the main thread with a worker, a channel, and a join — and keep the queue ordered. — Day 26 of 100 Days of Rust."
sidebar:
  order: 26
day: 26
---

**About 2 hours** · Part V, day 1 of 5.

**You'll be able to:**

- start a worker with `std::thread::spawn`;
- send save jobs over an `mpsc` channel;
- stop and join the worker from `Drop`.

---

Saving the list is fast for a few tasks, but a file on a slow disk can block
the command. A background worker can take the file write while the main thread
does something else.

Today we build the worker with the standard library: a thread, a channel, and
a join. No async runtime yet — that comes in two days.

## The worker

Create `src/worker.rs`:

<!-- verify: src/worker.rs at=day-26 -->
```rust title="src/worker.rs"
use std::path::PathBuf;
use std::sync::mpsc::{self, Sender};
use std::thread::{self, JoinHandle};

use crate::store::TodoList;

/// A background worker that saves lists in the order they are sent.
#[derive(Debug)]
pub struct SaveWorker {
    tx: Sender<Message>,
    handle: Option<JoinHandle<()>>,
}

#[derive(Debug)]
enum Message {
    Save { list: TodoList, path: PathBuf },
    Stop,
}

impl SaveWorker {
    /// Start the worker thread.
    pub fn spawn() -> Self {
        let (tx, rx) = mpsc::channel::<Message>();
        let handle = thread::spawn(move || {
            while let Ok(message) = rx.recv() {
                match message {
                    Message::Save { list, path } => {
                        if let Err(error) = list.save(&path) {
                            tracing::error!(%error, "background save failed");
                        }
                    }
                    Message::Stop => break,
                }
            }
        });

        Self {
            tx,
            handle: Some(handle),
        }
    }

    /// Queue a save; the worker owns the list from here.
    pub fn save(&self, list: TodoList, path: PathBuf) {
        if self.tx.send(Message::Save { list, path }).is_err() {
            tracing::error!("save worker is gone");
        }
    }
}

impl Drop for SaveWorker {
    fn drop(&mut self) {
        let _ = self.tx.send(Message::Stop);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}
```

The pieces:

- `mpsc::channel()` creates a **sender** and a **receiver**. Many senders
  can exist; one receiver takes the messages in order.
- `thread::spawn` starts a new thread. The closure owns `rx` because of
  `move`.
- `Message` owns the list and the path. Sending moves them into the worker;
  the main thread cannot use them afterward. This is the ownership rule from
  Part I, now across threads.
- `Drop` sends `Stop`, then joins. Joining waits for the worker to finish the
  current job and exit, so a program does not leave a thread writing after
  `main` returns.

The worker logs a failed save instead of panicking. A background failure has
no caller to return to, so the log is the only place it can be seen.

## The test

<!-- verify: src/worker.rs at=day-26 -->
```rust title="src/worker.rs"
#[cfg(test)]
mod tests {
    use super::*;
    use crate::summary::Summary;

    #[test]
    fn saves_in_the_background() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("todo.json");
        let mut list = TodoList::new();
        list.add("buy milk").unwrap();

        let worker = SaveWorker::spawn();
        worker.save(list, path.clone());
        drop(worker);

        let loaded = TodoList::load(&path).unwrap();
        assert_eq!(loaded.summary(), "1 task(s), 0 done");
    }
}
```

`drop(worker)` triggers `Drop`, which sends `Stop` and joins. Because the
channel is ordered, the save job is handled before the stop. The test then
loads the file and checks the task.

## Why a channel, not a lock?

A channel is a queue with a clear ownership rule: the sender gives the job
away; the receiver owns it until it is done. A lock would share the list and
let both threads touch it; that is the next lesson.

Channels are a good fit for work that happens **once** and in order. For a
shared, readable list, a lock is better.

## Run it

```bash
$ cargo test
...
test worker::tests::saves_in_the_background ... ok
...
```

## Save your work

```bash
$ git add -A
$ git commit -m "day 26: save tasks on a worker thread"
[main (root-commit) ...] day 26: save tasks on a worker thread
 27 files changed, 2050 insertions(+)
...
$ git log --oneline
... day 26: save tasks on a worker thread
```

## If something went wrong

**`use of moved value: rx`.** The receiver must move into the thread closure.
Add `move` before the closure and make sure no other code uses `rx`.

**`TodoList cannot be sent between threads safely`.** It contains only
`Vec<Task>`, `String`, and numbers, so it is `Send`; if you add a non-`Send`
field (an `Rc`, a raw pointer), the worker stops compiling. Use `Arc` for
shared ownership, not `Rc`.

**The program exits before the save finishes.** The worker is dropped, but
`Drop` joins. If you `std::mem::forget` the worker or call `std::process::exit`
first, the join never happens. Let the value drop normally.

**The file is sometimes empty.** Two writers are racing. This worker
serializes saves, but another thread or process may still write the same file.
Use one writer, a lock, or a database.

**A save error disappears.** The worker logs it with `tracing::error!`; run
with `--verbose` or `RUST_LOG=todo=error` to see it.

**The test hangs.** The worker is waiting on `recv` and never receives `Stop`.
Ensure `Drop` runs, or send `Stop` explicitly and join.

## Going deeper: bounded queues and backpressure

`mpsc::channel` is unbounded: a fast producer can queue work faster than the
worker saves it, and memory grows. `mpsc::sync_channel(n)` gives a bounded
queue; `send` blocks when it is full. That is **backpressure** — the producer
slows down instead of the queue growing without limit.

The async version of this pattern uses `tokio::sync::mpsc` and a task instead
of a thread. The shape is the same: a queue, an owner, a stop signal, and a
join.

<div class="day-tracker" data-day="26"></div>
