---
title: IDs and time
day: 35
part: VI
partName: The data layer
partDay: 4
partDays: 5
time: "2 hours"
description: Give every task a UUIDv7 and a UTC creation time, add both through a migration, and keep old JSON readable.
bullets:
  - generate a time-ordered UUIDv7 for each task;
  - record creation time in UTC as RFC 3339;
  - add columns with a migration and default old rows.
---

The database id is an `INTEGER PRIMARY KEY`. It is perfect inside one SQLite
file and useless outside it: another database, an export, or a client that
syncs tasks needs an identifier that does not collide.

Today every task gets a **UUIDv7** and a **UTC creation time**.

## Add the crates

<!-- verify: Cargo.toml at=day-35 -->
```toml title="Cargo.toml"
chrono = { version = "0.4", features = ["serde"] }
...
uuid = { version = "1", features = ["v7"] }
```

`uuid` generates the identifier; `chrono` gives the timestamp and the RFC 3339
format. `serde` features let both survive JSON.

## The new fields

<!-- verify: src/task.rs at=day-35 -->
```rust title="src/task.rs"
/// A single todo item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Task {
    /// The task's database id.
    pub id: u32,
    /// A stable external identifier.
    #[serde(default)]
    pub uuid: String,
    /// When the task was created, in UTC.
    #[serde(default)]
    pub created_at: String,
    /// The task's title, trimmed on creation.
    pub title: String,
    /// Whether the task is pending or done.
    pub status: Status,
    /// The tags attached to the task, without duplicates.
    pub tags: Vec<String>,
}
```

`#[serde(default)]` lets an old JSON file without these fields still load. The
missing values become empty strings; a later import can fill them in.

`Task::new` generates both:

<!-- verify: src/task.rs at=day-35 -->
```rust title="src/task.rs"
    /// Build a task from a title, refusing a blank one.
    pub fn new(id: u32, title: &str) -> Result<Self, TodoError> {
        let title = title.trim();
        if title.is_empty() {
            return Err(TodoError::EmptyTitle);
        }
        Ok(Self {
            id,
            uuid: Uuid::now_v7().to_string(),
            created_at: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
            title: title.to_string(),
            status: Status::Pending,
            tags: Vec::new(),
        })
    }
```

`Uuid::now_v7()` is time-ordered: the first 48 bits are a Unix timestamp in
milliseconds, so UUIDs sort roughly by creation time. That makes them friendlier
to database indexes than random v4 UUIDs.

`to_rfc3339_opts(SecondsFormat::Secs, true)` produces a UTC timestamp with a
`Z`, for example `2026-10-31T09:30:00Z`. Storing UTC avoids the "which timezone
was this?" problem; convert for display, never for storage.

The id stays as the database key for now. The UUID is the **external**
identifier: it can travel between databases and clients without a collision.
The next lessons use it in exports and URLs.

## The migration

<!-- verify: migrations/0003_uuid_and_time.sql at=day-35 -->
```sql title="migrations/0003_uuid_and_time.sql"
ALTER TABLE tasks ADD COLUMN uuid TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
```

SQLite can add a column with a default, even `NOT NULL`. Existing rows get an
empty string, which is honest: they were created before the app recorded an
identifier. New rows get real values.

## Read them back

Update the queries to select the new columns and map them:

<!-- verify: src/db.rs at=day-35 -->
```rust title="src/db.rs"
fn row_to_task(row: &SqliteRow) -> Result<Task, TodoError> {
    let id: i64 = row.try_get("id")?;
    let uuid: String = row.try_get("uuid")?;
    let created_at: String = row.try_get("created_at")?;
    let title: String = row.try_get("title")?;
    let status: String = row.try_get("status")?;
    let tags: String = row.try_get("tags")?;

    Ok(Task {
        id: id as u32,
        uuid,
        created_at,
        title,
        status: if status == "Done" {
            Status::Done
        } else {
            Status::Pending
        },
        tags: serde_json::from_str(&tags)?,
    })
}
```

The `INSERT` statements also bind `uuid` and `created_at`; the `SELECT` lists
include them. A column that is not selected cannot be mapped.

## The test

<!-- verify: src/db.rs at=day-35 -->
```rust title="src/db.rs"
    #[tokio::test]
    async fn tasks_have_uuid_and_created_at() {
        let (_dir, store) = store().await;
        let id = store.add("buy milk").await.unwrap();
        let task = store.find(id).await.unwrap().unwrap();

        assert_eq!(task.uuid.len(), 36);
        assert!(task.created_at.ends_with('Z'));
    }
```

A UUID string is 36 characters including hyphens. The timestamp ends in `Z`
because it is UTC. The test checks the shape; a parser check would be stricter
and is a good next step.

## Run it

```bash
$ cargo test
...
test task::tests::new_task_has_uuid_and_time ... ok
...
test db::tests::tasks_have_uuid_and_created_at ... ok
...
```

## Save your work

```bash
$ git add -A
$ git commit -m "day 35: add UUIDs and UTC timestamps"
[main (root-commit) ...] day 35: add UUIDs and UTC timestamps
 34 files changed, 3848 insertions(+)
...
$ git log --oneline
... day 35: add UUIDs and UTC timestamps
```

## If something went wrong

**Old rows have empty UUIDs.** That is expected: the default is `''`. Write a
backfill migration that generates UUIDs for rows with an empty value, then add
a uniqueness constraint in a later migration.

**The timestamp has an offset instead of `Z`.** Use `Utc::now()`, not
`Local::now()`, and the `true` argument for the `Z` suffix.

**Two tasks have the same UUID.** `Uuid::now_v7()` is unique in practice, but
a database constraint is the proof. Add `CREATE UNIQUE INDEX` on `uuid` after
the backfill.

**`chrono` and `uuid` are missing from the docs.** Public fields have docs;
the external crates are dependencies, not public types. `cargo doc --no-deps`
does not document them.

**The JSON file from before fails to load.** The new fields need
`#[serde(default)]`. Without it, serde treats them as required.

**The UUID is not lexicographically sorted by time in a query.** UUIDv7 is
time-ordered within the same millisecond; ties and clock changes can break the
order. Sort by `created_at` when order matters, or by both.

## Going deeper: UUIDs are not a primary key replacement

A UUID is 16 bytes versus an integer's 4–8, and a random UUID index is less
cache-friendly. UUIDv7 fixes the ordering problem but not the size. Use the
integer as the local primary key and the UUID as the external identity; that is
the common compromise.

For a distributed database, the UUID can become the key because merging
integer sequences is painful. The trade-off is storage and index size. Measure
before changing.

Time is the same story: store UTC, convert at the edge, and never parse a
display format back into storage. ISO 8601 with an explicit offset is a good
wire format; RFC 3339 is its common profile.

