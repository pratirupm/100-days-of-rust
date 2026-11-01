---
title: Transactions
day: 34
part: VI
partName: The data layer
partDay: 3
partDays: 5
time: "2 hours"
description: Make a batch of inserts all-or-nothing — commit together, or roll back the whole batch when one title is bad.
bullets:
  - open a transaction with `pool.begin()`;
  - run several writes on the same connection;
  - commit, or let the transaction drop and roll back.
---

A single insert is atomic: SQLite either writes it or does not. A batch of
inserts is not. If the third title is blank, the first two may already be in
the table.

A **transaction** makes the batch one unit. It commits only if every step
succeeds; otherwise it rolls back to the state before the first write.

## The batch

Add `add_many` to `src/db.rs`:

<!-- verify: src/db.rs at=day-34 -->
```rust title="src/db.rs"
    /// Add several tasks atomically; one bad title rolls back the batch.
    pub async fn add_many(&self, titles: &[&str]) -> Result<Vec<u32>, TodoError> {
        let mut tx = self.pool.begin().await?;
        let mut ids = Vec::new();

        for title in titles {
            let task = Task::new(0, title)?;
            let result = sqlx::query("INSERT INTO tasks (title, status, tags) VALUES (?, ?, ?)")
                .bind(&task.title)
                .bind(status_name(&task.status))
                .bind(serde_json::to_string(&task.tags)?)
                .execute(&mut *tx)
                .await?;
            ids.push(result.last_insert_rowid() as u32);
        }

        tx.commit().await?;
        Ok(ids)
    }
```

`pool.begin()` checks out a connection and sends `BEGIN`. Every query in the
block uses `&mut *tx`, the transaction's connection. The `?` on a failed
insert or a blank title returns early; `tx` is dropped without `commit`, and
SQLite rolls the transaction back. The commit is the only point where the
writes become visible.

The `&mut *tx` is deliberate: `sqlx` needs a mutable connection, and the
transaction dereferences to one. Reusing `&self.pool` here would run outside
the transaction and break atomicity.

## The tests

<!-- verify: src/db.rs at=day-34 -->
```rust title="src/db.rs"
    #[tokio::test]
    async fn add_many_commits_together() {
        let (_dir, store) = store().await;
        let ids = store
            .add_many(&["buy milk", "write the report"])
            .await
            .unwrap();

        assert_eq!(ids.len(), 2);
        assert_eq!(store.list().await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn add_many_rolls_back_on_a_blank_title() {
        let (_dir, store) = store().await;
        let result = store
            .add_many(&["buy milk", "   ", "write the report"])
            .await;

        assert_eq!(result, Err(TodoError::EmptyTitle));
        assert!(store.list().await.unwrap().is_empty());
    }
```

The first test proves the happy path. The second is the reason transactions
exist: the first insert happened, the second failed, and the list is still
empty. Without the transaction, the first task would be committed.

## Why not just validate first?

You could scan every title before the first insert. That handles this error,
but not a disk failure on the third row, a constraint violation, or a process
that dies mid-batch. The transaction handles all of them, because it is
enforced by the database, not by the order of our checks.

## Run it

```bash
$ cargo test
...
test db::tests::add_many_commits_together ... ok
test db::tests::add_many_rolls_back_on_a_blank_title ... ok
...
```

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 34: make batch writes transactional"
[main ...] day 34: make batch writes transactional
 33 files changed, 3617 insertions(+)
...
$ git log --oneline
... day 34: make batch writes transactional
```

## If something went wrong

**The batch is partly visible.** A query used `&self.pool` instead of
`&mut *tx`. Every statement in the transaction must use the transaction's
connection.

**`transaction already closed`.** You committed or rolled back, then used the
transaction again. Return immediately after `commit`/`rollback`.

**`cannot start a transaction within a transaction`.** SQLite does not nest
`BEGIN` by default. Use savepoints if you need nesting, or keep one transaction
per operation.

**`database is locked`.** Another writer holds the lock. Keep the transaction
short; do not wait on network I/O inside it.

**The transaction never commits.** You returned early without `commit`; that
is a rollback. If the data should be saved, commit before returning.

**A panic leaves the database locked.** The transaction guard rolls back on
drop, but a panic in a background task can still leave a connection busy. Use
`spawn_blocking` for long work; keep the async critical section small.

## Going deeper: isolation and WAL

SQLite gives serializable transactions by default. A reader sees a consistent
snapshot; a writer blocks other writers. For one process with short writes,
that is exactly the guarantee we need.

WAL mode (`PRAGMA journal_mode = WAL`) lets readers proceed while one writer
works. It adds a `-wal` file and a step that folds the log back into the
database. A later production lesson can turn it on; it is a performance
choice, not a correctness one.

A transaction is also a unit of retry. If a write fails with `SQLITE_BUSY`,
retry the whole transaction, not the individual statement. The idempotency
lesson in production ground returns to this.

