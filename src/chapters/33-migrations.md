---
title: Migrations
day: 33
part: VI
partName: The data layer
partDay: 2
partDays: 5
time: "2 hours"
description: Version the schema with sqlx migrations, add an index, and let the database record what has already run.
bullets:
  - switch from inline SQL to `sqlx::migrate!`;
  - add a second migration for the status index;
  - prove migrations run once, not on every startup.
---

Day 32 ran a `CREATE TABLE IF NOT EXISTS` on every open. That works for one
table and one version. It does not work when the second version needs
`ALTER TABLE`, and it gives no record of what ran.

Today the schema becomes a sequence of numbered migrations. `sqlx` records each
one in a table and skips it next time.

## Enable migrations

<!-- verify: Cargo.toml at=day-33 -->
```toml title="Cargo.toml"
sqlx = { version = "0.9", features = ["runtime-tokio", "sqlite", "migrate"] }
```

The `migrate` feature adds the runner and the `sqlx::migrate!` macro.

## Add an index

The app will filter by status. An index makes that cheap:

<!-- verify: migrations/0002_status_index.sql at=day-33 -->
```sql title="migrations/0002_status_index.sql"
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
```

Migrations are forward-only. You add `0002`; you do not edit `0001`. A database
that already ran `0001` will now run `0002`. A fresh database runs both, in
order.

## Run them

<!-- verify: src/db.rs at=day-33 -->
```rust title="src/db.rs"
    /// Apply every pending migration.
    pub async fn migrate(&self) -> Result<(), TodoError> {
        sqlx::migrate!("./migrations")
            .run(&self.pool)
            .await
            .map_err(|error| TodoError::Db(error.to_string()))?;
        Ok(())
    }
```

`sqlx::migrate!("./migrations")` embeds the files at compile time. At runtime,
`run` checks the `_sqlx_migrations` table:

- if a migration's version is missing, it runs the SQL and records the version,
  a description, and a checksum;
- if the version is present and the checksum matches, it skips;
- if the version is present and the checksum differs, it fails.

The checksum is why editing an applied migration is a bug: the database and the
binary disagree about what `0002` means.

## The test

<!-- verify: src/db.rs at=day-33 -->
```rust title="src/db.rs"
    #[tokio::test]
    async fn migrations_run_once() {
        let (dir, store) = store().await;
        store.migrate().await.unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations")
            .fetch_one(&store.pool)
            .await
            .unwrap();
        assert_eq!(count, 2);
        drop(dir);
    }
```

`store()` already ran the migrations in `open`; calling `migrate` again must not
add rows. The count is two because there are two files. The test names the
contract: a migration is a one-time change, not a startup script.

## Try a fresh database

```bash
$ cargo test
...
test db::tests::migrations_run_once ... ok
...
```

To see the schema by hand, open the file with the SQLite CLI:

<!-- transcripts: authored -->
```bash
$ sqlite3 /tmp/todo.db '.schema tasks'
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    tags TEXT NOT NULL
);
CREATE INDEX tasks_status_idx ON tasks (status);
```

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 33: run versioned migrations"
[main ...] day 33: run versioned migrations
 33 files changed, 3574 insertions(+)
...
$ git log --oneline
... day 33: run versioned migrations
```

## If something went wrong

**`migration was previously applied but has been modified`.** You edited a
file that already ran. Add a new migration instead; if this is a scratch
database, delete the file and start over.

**`no migrations found`.** The path in `sqlx::migrate!` is wrong. It is
relative to the crate root, not to `src/`.

**A migration runs on every startup.** The `_sqlx_migrations` table is missing
or was deleted. Let `run` create it; do not manage the bookkeeping by hand.

**The index does not speed up a query.** SQLite may choose a table scan for a
small table. Check `EXPLAIN QUERY PLAN`; an index is an offer, not a command.

**Two instances migrate at once.** The runner locks the bookkeeping table; one
wins, the other waits or fails. Run migrations once at deploy time, not from
every process, when the deployment has many instances.

**`database is locked`.** A migration is waiting on another writer. Stop the
other writer, or set a busy timeout; do not disable the lock.

## Going deeper: schema as code

A migration file is code with a history. Treat it like an API:

- never edit an applied migration;
- add a new one for every change;
- keep each migration small and reversible in intent, even when SQLite cannot
  reverse it automatically;
- test the upgrade path, not only a fresh database.

A `schema.sql` snapshot is useful for reading, but it is not the source of
truth. The ordered migrations are. The finished-app appendix will show both.

SQLite's `ALTER TABLE` is limited: it can add a column, rename a table, and
rebuild a table for bigger changes. A table rebuild is a migration with a
temporary table, a copy, and a rename. The next lessons keep the schema simple
enough to avoid one.

