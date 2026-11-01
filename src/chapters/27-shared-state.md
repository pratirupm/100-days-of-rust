---
title: Shared state
day: 27
part: V
partName: Concurrency and async
partDay: 2
partDays: 5
time: "2 hours"
description: Let several threads read and change one list through Arc and RwLock — with short lock scopes and a snapshot that leaves the lock.
bullets:
  - share ownership with `Arc`;
  - guard the list with `RwLock`;
  - take a snapshot instead of holding a lock.
---

The worker owns each list it saves. That is fine for one job, but a server
needs several threads to read and change the same list. Ownership cannot move
the list to all of them.

Today we share it: `Arc` gives shared ownership, and `RwLock` allows many
readers or one writer at a time.

## The shared list

Create `src/shared.rs`:

<!-- verify: src/shared.rs at=day-27 -->
```rust title="src/shared.rs"
use std::sync::{Arc, RwLock};

use crate::error::TodoError;
use crate::store::TodoList;
use crate::summary::Summary;

/// A list shared between threads behind a read-write lock.
#[derive(Debug, Clone)]
pub struct SharedList {
    inner: Arc<RwLock<TodoList>>,
}

impl SharedList {
    /// Wrap a list in a shared handle.
    pub fn new(list: TodoList) -> Self {
        Self {
            inner: Arc::new(RwLock::new(list)),
        }
    }

    /// Add a task under the write lock.
    pub fn add(&self, title: &str) -> Result<u32, TodoError> {
        self.inner.write().unwrap().add(title)
    }

    /// Mark a task done under the write lock.
    pub fn done(&self, id: u32) -> Result<(), TodoError> {
        self.inner.write().unwrap().done(id)
    }

    /// Add a tag under the write lock.
    pub fn tag(&self, id: u32, tag: &str) -> Result<(), TodoError> {
        let mut guard = self.inner.write().unwrap();
        let task = guard.find_mut(id).ok_or(TodoError::NotFound(id))?;
        task.add_tag(tag);
        Ok(())
    }

    /// Read the list's summary under the read lock.
    pub fn summary(&self) -> String {
        self.inner.read().unwrap().summary()
    }

    /// Copy the list while holding the read lock.
    pub fn snapshot(&self) -> TodoList {
        self.inner.read().unwrap().clone()
    }
}
```
Declare it in `src/lib.rs`:

```rust
pub mod shared;
pub use shared::SharedList;
```


Two layers:

- `Arc<TodoList>` would share ownership, but it is immutable. `Arc` means
  **atomically reference counted**: cloning the handle increments a count;
  dropping it decrements; the value is freed at zero.
- `RwLock<T>` adds interior mutability: many readers (`read`) or one writer
  (`write`). The lock guard releases when it drops at the end of the
  expression or block.

`SharedList` is `Clone`: cloning it clones the `Arc`, not the list. Every clone
points at the same lock.

`tag` takes the write lock, finds the task, mutates it, and returns. The guard
is dropped at the end of the function, so the lock is held for the smallest
possible scope. Holding a lock longer than necessary is how concurrent
programs slow down and deadlock.

`snapshot` clones the list while holding the read lock, then drops the guard.
The caller gets an independent copy and can read it without blocking writers.

`TodoList` needed `Clone` for the snapshot; it derives `Clone` now.

## The tests

<!-- verify: src/shared.rs at=day-27 -->
```rust title="src/shared.rs"
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn threads_share_one_list() {
        let shared = SharedList::new(TodoList::new());
        let mut handles = Vec::new();

        for i in 0..4 {
            let shared = shared.clone();
            handles.push(std::thread::spawn(move || {
                shared.add(&format!("task {i}")).unwrap();
            }));
        }
        for handle in handles {
            handle.join().unwrap();
        }

        assert_eq!(shared.snapshot().list().len(), 4);
        assert_eq!(shared.summary(), "4 task(s), 0 done");
    }

    #[test]
    fn a_snapshot_is_independent() {
        let shared = SharedList::new(TodoList::new());
        shared.add("buy milk").unwrap();

        let snapshot = shared.snapshot();
        shared.add("write the report").unwrap();

        assert_eq!(snapshot.list().len(), 1);
        assert_eq!(shared.snapshot().list().len(), 2);
    }
}
```

Four threads add four tasks. The order is not deterministic; the count is.
Each thread clones the handle, not the list. The second test proves the
snapshot is a copy: adding to the shared list does not change it.

## Run it

```bash
$ cargo test
...
test shared::tests::a_snapshot_is_independent ... ok
test shared::tests::threads_share_one_list ... ok
...
```

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 27: share the list behind a lock"
[main ...] day 27: share the list behind a lock
 28 files changed, 2137 insertions(+)
...
$ git log --oneline
... day 27: share the list behind a lock
```

## If something went wrong

**The program hangs.** Two paths take the write lock and wait for each other,
or a guard is held while calling another method that locks. Keep lock scopes
short; never call back into `SharedList` while a guard is alive.

**`RwLock` is poisoned after a panic.** A thread panicked while holding the
lock; `.unwrap()` panics on the poison. Fix the panic, or handle the poison
explicitly if a panic is acceptable.

**`TodoList` does not implement Clone.** Add `#[derive(Clone)]` to the list;
all its fields are cloneable.

**`Rc` cannot be sent between threads safely.** Use `Arc`, not `Rc`. The
compiler refuses `Rc` because its count is not atomic.

**The snapshot is stale.** It is a copy from the moment you took it. Take a new
snapshot after a change, or read the live list under a guard for a short
operation.

**Writers starve.** `RwLock` favors readers on some platforms. If writers must
make progress, use a `Mutex` with short critical sections, or a fair lock from
a crate.

## Going deeper: lock granularity

A single lock around the whole list is simple and correct. It is also a
bottleneck: every reader waits for a writer, and every writer waits for all
readers. At this scale, that is fine.

The next step is finer granularity: a lock per task, or a read-only snapshot
swapped atomically. Those are optimizations; they make the code harder to
reason about. Measure first.

`parking_lot::RwLock` is a faster drop-in with no poisoning. The standard
library's lock is enough here, and its poison behavior is a useful lesson.

