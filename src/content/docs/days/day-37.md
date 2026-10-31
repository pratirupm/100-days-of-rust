---
title: "Day 37 — Review: Part VI"
description: "Catch up on SQLite, migrations, transactions, UUIDs, timestamps, and the Store trait, then tag Part VI. — Day 37 of 100 Days of Rust."
sidebar:
  order: 37
day: 37
---

**About 1.5 hours** · Part VI, review.

Part VI moved the tasks into a real database: SQLite through sqlx, versioned
migrations, an index, an all-or-nothing batch, UUIDs and UTC timestamps, and a
`Store` trait with export/import.

The CLI still uses the JSON file; the database is ready for the server.

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

## Read the data layer

<!-- transcripts: authored -->
```text
src/
├── db.rs          SqliteStore, queries, export/import
├── storage.rs     the Store trait
└── task.rs        Task with uuid and created_at
migrations/
├── 0001_init.sql
├── 0002_status_index.sql
└── 0003_uuid_and_time.sql
```

The migrations are the schema's history. The `Store` trait is the seam the API
will use; it does not name SQLite.

## Exercise the store

<!-- transcripts: authored -->
```bash
$ cargo test
...
test db::tests::add_list_and_find ... ok
test db::tests::add_many_commits_together ... ok
test db::tests::add_many_rolls_back_on_a_blank_title ... ok
test db::tests::export_and_import_round_trip ... ok
test db::tests::migrations_run_once ... ok
test db::tests::tasks_have_uuid_and_created_at ... ok
test db::tests::the_store_trait_is_generic ... ok
...
```

## What you should be able to explain

- Why a connection pool is better than one connection.
- What a migration records, and why an applied file must not be edited.
- When a batch needs a transaction.
- Why UUIDv7 is more index-friendly than UUIDv4.
- Why timestamps are stored in UTC.
- Why the `Store` trait does not mention SQL.
- Why import preserves UUIDs but not local ids.

## Check your history

<!-- transcripts: authored -->
```bash
$ git log --oneline
... day 36: abstract the store and import JSON
... day 35: add UUIDs and UTC timestamps
... day 34: make batch writes transactional
... day 33: run versioned migrations
... day 32: store tasks in SQLite
$ git tag part-vi
```

## If something is red

**A migration checksum mismatch.** An applied file changed. Add a new
migration; reset the scratch database if needed.

**`database is locked`.** A writer is holding the file. Keep transactions
short, or turn on WAL in the throughput lesson.

**The batch is partly committed.** Use `&mut *tx` for every statement.

**UUIDs are empty.** Rows predate migration 0003. Backfill them in a new
migration.

**Import doubles the data.** Import appends; add a unique index and an upsert,
or import into an empty database.

## The milestone

You have a real database, a migration history, atomic writes, stable external
ids, and a store interface. The API can now be built on top of it without
knowing how SQLite works.

Tag it:

<!-- transcripts: authored -->
```bash
$ git tag part-vi
```

Next: the HTTP API. Axum, a health endpoint, task CRUD, validation,
middleware, users, sessions, authorization, and OpenAPI.

<div class="day-tracker" data-day="37"></div>
