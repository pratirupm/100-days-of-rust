---
title: PostgreSQL in the app
day: 66
part: Production ground
partDay: 6
partDays: 30
time: "2 hours"
description: Put a PostgresStore behind the Store trait, select it by URL, and run the same owner-scoped tests against both databases.
bullets:
  - implement the store trait with `sqlx`'s Postgres pool;
  - select the adapter from the `TODO_DB` scheme;
  - run one conformance suite against SQLite and Postgres.
---

The previous lesson ran Postgres. This one puts it behind the app's `Store`
trait, so the API and the TUI do not know which database answered.

## The adapter

A `PostgresStore` is a pool and the same three operations:

```rust
pub struct PostgresStore {
    pool: sqlx::PgPool,
}

impl PostgresStore {
    pub async fn open(url: &str) -> Result<Self, TodoError> {
        let pool = sqlx::PgPool::connect(url).await?;
        sqlx::migrate!("./migrations-postgres").run(&pool).await?;
        Ok(Self { pool })
    }
}

impl Store for PostgresStore {
    async fn add(&self, title: &str) -> Result<u32, TodoError> { ... }
    async fn list(&self) -> Result<Vec<Task>, TodoError> { ... }
    async fn done(&self, id: u32) -> Result<(), TodoError> { ... }
}
```

The SQL changes:

- `?` placeholders become `$1`, `$2`;
- `last_insert_rowid()` becomes `RETURNING id`;
- `TEXT` timestamps become `TIMESTAMPTZ`;
- `AUTOINCREMENT` becomes `BIGSERIAL`;
- tags become `JSONB`.

The trait is unchanged. The API's `AppState` holds `Arc<dyn Store>` (or a
generic `S: Store`); the TUI's local path can keep `SqliteStore`.

## Select the adapter

The URL scheme is enough:

<!-- transcripts: authored -->
```text
TODO_DB=sqlite://todo.db
TODO_DB=postgres://todo:todo@127.0.0.1:5432/todo
```

A small factory reads the scheme and returns a boxed trait object:

```rust
pub async fn open_store(url: &str) -> Result<Box<dyn Store>, TodoError> {
    if url.starts_with("postgres") {
        Ok(Box::new(PostgresStore::open(url).await?))
    } else {
        Ok(Box::new(SqliteStore::open(url).await?))
    }
}
```

`dyn Store` works because the trait's methods are object-safe after
`#[async_trait]` or because the app uses a generic. The current trait uses
`async fn` and static dispatch; a boxed trait needs `async_trait` or a manual
`Pin<Box<dyn Future>>`. Pick one and keep it at the boundary.

## Migrations

The SQLite migrations are not portable. Keep a `migrations-postgres` directory
with the same versions and Postgres types. The version numbers must agree; a
deploy must not run the SQLite 0003 against Postgres.

A migration tool that supports both dialects can generate both sets from one
description. The app's hand-written migrations are simple enough to maintain
twice; the tests catch drift.

## One conformance suite

The store tests should run against both adapters. Extract the test body into a
generic function:

```rust
async fn conformance<S: Store>(store: &S) {
    let id = store.add("buy milk").await.unwrap();
    assert_eq!(store.list().await.unwrap().len(), 1);
    store.done(id).await.unwrap();
    assert!(store.list().await.unwrap()[0].is_done());
}
```

Run it with `SqliteStore` in the normal test, and with `PostgresStore` in an
integration test gated by `DATABASE_URL`. The same behavior, two backends.

## Run the Postgres tests

<!-- transcripts: authored -->
```bash
$ podman run -d --name todo-pg-test -e POSTGRES_USER=todo \
    -e POSTGRES_PASSWORD=todo -e POSTGRES_DB=todo_test \
    -p 55432:5432 docker.io/library/postgres:17
$ DATABASE_URL=postgres://todo:todo@127.0.0.1:55432/todo_test \
    cargo test --test postgres_store
```

The test creates a database or truncates the tables before each case. Do not
point it at the production database; a test that deletes data is a production
incident waiting to happen.

Use a fresh database per test run (a random schema or a container) so parallel
tests do not collide. `sqlx`'s test macros or a `#[sqlx::test]` fixture can do
this; a plain `tokio::test` with a unique database name is enough.

## In the app

The CLI's `TodoList` JSON store remains for the zero-setup path. The API and
TUI can choose the database by configuration. The owner-scoped queries use
`$1` for the user id; the SQL injection rule is the same: bind, never format.

The health check runs `SELECT 1` on the pool, not a full table scan. The metrics
counter for requests stays in the API layer, not the store.

## If something went wrong

**`pool timed out`.** The pool is exhausted or the database is unreachable.
Check `max_connections` and the connection URL.

**`relation does not exist`.** The Postgres migrations did not run. Run them at
startup, not in a separate manual step.

**`RETURNING id` returns i64.** Cast to the app's id type at the boundary; a
64-bit id will not fit u32 forever.

**The timestamps shift by an hour.** You stored a local time. Use
`TIMESTAMPTZ` and UTC at the boundary.

**The tests pass alone and fail together.** They share a database. Use a
separate schema or database per test.

**The adapter compiles but the API still uses SQLite.** The factory selects by
scheme; check the URL and the branch.

## Going deeper: connection pools and prepared statements

A pool is a set of reusable connections. `sqlx` prepares statements per
connection; a pool reuses them. A server with hundreds of concurrent requests
needs a pool small enough for Postgres's `max_connections` and large enough to
avoid queueing.

Postgres's MVCC lets readers proceed during a write, but long transactions
hold snapshots and bloat the table. Keep transactions short; do not wait on
network I/O inside one.

The next lesson adds Redis: a cache and a rate limiter in front of the same
store.

