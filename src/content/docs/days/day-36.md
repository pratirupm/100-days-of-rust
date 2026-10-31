---
title: "Day 36 — The store's interface and import/export"
description: "Hide the SQLite store behind a Store trait, then move tasks between databases as a JSON array — atomically, with their UUIDs intact. — Day 36 of 100 Days of Rust."
sidebar:
  order: 36
day: 36
---

**About 2 hours** · Part VI, day 5 of 5.

**You'll be able to:**

- define the operations the app needs from a store;
- implement the trait for `SqliteStore`;
- export and import tasks in a transaction.

---

The app now has two stores: a JSON file and SQLite. The CLI still uses the JSON
one; the server will use SQLite. If every caller names `SqliteStore`, swapping
backends leaks into every function.

Today the operations move behind a `Store` trait. Then the database gets export
and import, so tasks can move between installations without losing identity.

## The trait

Create `src/storage.rs`:

<!-- verify: src/storage.rs at=day-36 -->
```rust title="src/storage.rs"
use crate::error::TodoError;
use crate::task::Task;

/// The operations the app needs from a task store.
///
/// The trait uses `async fn` for static dispatch; a future server can accept
/// any implementation through a generic parameter.
#[allow(async_fn_in_trait)]
pub trait Store: Send + Sync {
    /// Add a task and return its local id.
    async fn add(&self, title: &str) -> Result<u32, TodoError>;

    /// List every task.
    async fn list(&self) -> Result<Vec<Task>, TodoError>;

    /// Mark a task done.
    async fn done(&self, id: u32) -> Result<(), TodoError>;
}
```

A trait is a contract. The app's core needs three operations, not a database
handle, a connection pool, or a file path. `Store: Send + Sync` says an
implementation can be shared across tasks and threads.

`async fn` in a trait is stable, but the compiler warns that public traits
using it are not object-safe; `#[allow(async_fn_in_trait)]` acknowledges that
we use **static dispatch** (a generic parameter), not `dyn Store`.

## Implement it

<!-- verify: src/db.rs at=day-36 -->
```rust title="src/db.rs"
impl Store for SqliteStore {
    async fn add(&self, title: &str) -> Result<u32, TodoError> {
        SqliteStore::add(self, title).await
    }

    async fn list(&self) -> Result<Vec<Task>, TodoError> {
        SqliteStore::list(self).await
    }

    async fn done(&self, id: u32) -> Result<(), TodoError> {
        SqliteStore::done(self, id).await
    }
}
```

The `SqliteStore::add` path calls the **inherent** method, not the trait method
of the same name. Without the type prefix, the call would recurse into the
trait implementation.

## Generic callers

A function can accept any store:

```rust
async fn count<S: Store>(store: &S) -> Result<usize, TodoError> {
    Ok(store.list().await?.len())
}
```

The test calls it with `&SqliteStore`. Later, the same function can take a
test double or a Postgres store. That is the seam the production ground uses.

## Export

<!-- verify: src/db.rs at=day-36 -->
```rust title="src/db.rs"
    /// Export every task as a JSON array.
    pub async fn export_json(&self) -> Result<String, TodoError> {
        let tasks = self.list().await?;
        Ok(serde_json::to_string_pretty(&tasks)?)
    }

    /// Import a JSON array atomically; returns the number of tasks imported.
    pub async fn import_json(&self, text: &str) -> Result<usize, TodoError> {
        let tasks: Vec<Task> = serde_json::from_str(text)?;
        let count = tasks.len();
        let mut tx = self.pool.begin().await?;

        for task in tasks {
            sqlx::query(
                "INSERT INTO tasks (uuid, created_at, title, status, tags) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(&task.uuid)
            .bind(&task.created_at)
            .bind(&task.title)
            .bind(status_name(&task.status))
            .bind(serde_json::to_string(&task.tags)?)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(count)
    }
```

The export is an array of `Task` objects: uuid, created_at, title, status, and
tags. The local integer id is included too, but the import does not preserve
it: SQLite assigns a new local id. The **UUID** is what survives.

The import parses the whole document before touching the database. Then it
opens one transaction and inserts every task. A bad row rolls back the batch;
a duplicate UUID does not fail because there is no unique index yet. Both are
deliberate next steps, not hidden behavior.

## The round-trip test

<!-- verify: src/db.rs at=day-36 -->
```rust title="src/db.rs"
    #[tokio::test]
    async fn export_and_import_round_trip() {
        let (_dir, store) = test_store().await;
        store.add("buy milk").await.unwrap();
        store.add("write the report").await.unwrap();
        let json = store.export_json().await.unwrap();

        let (_dir2, other) = test_store().await;
        let count = other.import_json(&json).await.unwrap();

        assert_eq!(count, 2);
        assert_eq!(other.list().await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn the_store_trait_is_generic() {
        async fn count<S: Store>(store: &S) -> Result<usize, TodoError> {
            Ok(store.list().await?.len())
        }

        let (_dir, store) = test_store().await;
        store.add("buy milk").await.unwrap();

        assert_eq!(count(&store).await.unwrap(), 1);
    }
```

The first test proves the format round-trips. The second proves the trait is
usable generically. `test_store()` creates a new temporary database each time,
so the two `_dir` values keep their files alive independently.

## Run it

```bash
$ cargo test
...
test db::tests::export_and_import_round_trip ... ok
test db::tests::the_store_trait_is_generic ... ok
...
```

## Save your work

```bash
$ git add -A
$ git commit -m "day 36: abstract the store and import JSON"
[main (root-commit) ...] day 36: abstract the store and import JSON
 35 files changed, 3940 insertions(+)
...
$ git log --oneline
... day 36: abstract the store and import JSON
```

## If something went wrong

**A trait method calls itself.** In the impl, use `SqliteStore::add(self, ...)`
to reach the inherent method. Without the type, the name resolves to the trait
method and recurses.

**`the trait Store cannot be made into an object`.** The trait uses `async fn`
and is not object-safe. Use a generic bound (`S: Store`), or use the
`async_trait` crate if you need `dyn Store`.

**Import doubles the tasks.** Import appends; it does not upsert. Clear the
target or add a unique index on `uuid` and an `ON CONFLICT` clause.

**Imported tasks have new ids.** That is expected. The UUID is the stable
identity; the integer is local.

**The import fails halfway.** The transaction rolls back, but the parse happens
before it. Check the JSON error first; it names the line and column.

**An old export has no UUIDs.** The `#[serde(default)]` fields load as empty
strings. A backfill migration can give them real UUIDs.

## Going deeper: the seam is the point

The `Store` trait is the seam between the app and its database. It is small on
purpose: add, list, done. A Postgres store, an in-memory store, and a fake for
tests can all implement it. The API handlers in the next part depend on the
trait, not on SQLite.

The trait is not free. Every new operation goes in the trait and in every
implementation; a too-large trait becomes a burden. Start with the operations
the app actually uses, and split when a second consumer appears.

Import/export is also a seam. A JSON array is not a backup format with
guarantees, but it is readable, portable, and enough to move a small app. A
real backup is the database file plus its WAL, or a `VACUUM INTO` snapshot; the
production ground covers that.

<div class="day-tracker" data-day="36"></div>
