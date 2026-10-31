---
title: PostgreSQL
day: 65
part: Production ground
partDay: 5
partDays: 30
time: "2.5 hours"
description: Run PostgreSQL in a container, write a real schema with an index, and see where the SQLite store swaps behind the trait.
bullets:
  - run PostgreSQL locally with Podman;
  - create the tasks table and an index with `psql`;
  - move the store behind a Postgres adapter.
---

SQLite is a file. PostgreSQL is a server: concurrent writers, network
connections, a query planner, and an operational surface.

Today the app's data moves to Postgres in a local container. The `Store` trait
is the seam; the SQL is different, the domain is the same.

## Run it

<!-- transcripts: authored -->
```bash
$ podman volume create todo-pg
$ podman run -d --name todo-pg --pod todo-pod \
    -e POSTGRES_USER=todo -e POSTGRES_PASSWORD=todo \
    -e POSTGRES_DB=todo -v todo-pg:/var/lib/postgresql/data \
    docker.io/library/postgres:17
$ podman exec todo-pg pg_isready -U todo
/var/run/postgresql:5432 - accepting connections
```

The pod from the previous lesson shares the network namespace. From the server
container, the database is `127.0.0.1:5432`; from the host, publish a port or
use `podman exec`.

## The schema

<!-- transcripts: authored -->
```bash
$ podman exec -it todo-pg psql -U todo -d todo
```

```sql
CREATE TABLE tasks (
    id BIGSERIAL PRIMARY KEY,
    uuid TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]',
    owner_id BIGINT REFERENCES users (id)
);

CREATE INDEX tasks_owner_status_idx ON tasks (owner_id, status);
```

`BIGSERIAL` is a 64-bit auto-incrementing key. `TIMESTAMPTZ` stores an instant,
not a local wall clock. `JSONB` stores the tags as binary JSON and can index
inside it; a normalized `tags` table is the alternative when tags need their
own queries.

The composite index matches the app's most common query: a user's tasks
filtered by status. The order of the columns matters; `owner_id` first, then
`status`.

## Users and sessions

The users and sessions tables follow the same shape as SQLite:

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id),
    expires_at TIMESTAMPTZ NOT NULL
);
```

The session query compares `expires_at > now()`, not a string. Postgres knows
time; let it do the comparison.

## The adapter

The `Store` trait says add, list, done. A `PostgresStore` implements it with
`sqlx`'s Postgres driver:

```rust
pub struct PostgresStore {
    pool: sqlx::PgPool,
}

impl Store for PostgresStore {
    async fn add(&self, title: &str) -> Result<u32, TodoError> { ... }
    async fn list(&self) -> Result<Vec<Task>, TodoError> { ... }
    async fn done(&self, id: u32) -> Result<(), TodoError> { ... }
}
```

The method bodies use `$1` placeholders instead of `?`, `RETURNING id` instead
of `last_insert_rowid`, and `TIMESTAMPTZ` instead of text. The handler and the
TUI do not change; they depend on the trait, not the SQL dialect.

The app's current `SqliteStore` stays for local use. The Postgres adapter is
selected by configuration in a real deployment:

```text
TODO_DB=postgres://todo:todo@127.0.0.1:5432/todo
```

The URL scheme selects the adapter; the rest of the app sees `dyn Store` or a
generic `S: Store`.

## Migrations

The SQLite migrations are not portable: `AUTOINCREMENT`, `TEXT` timestamps, and
`ALTER TABLE` differ. A Postgres adapter needs its own migration set, or a
migration tool that speaks both dialects.

Keep one migration history per database. Sharing files across engines looks
tidy and breaks on the first engine-specific type. The `Store` trait is the
portable seam; the schema is not.

## In the app

The owner-scoped queries become:

```sql
SELECT id, uuid, created_at, title, status, tags
FROM tasks
WHERE owner_id = $1
ORDER BY id;
```

`sqlx` maps `TIMESTAMPTZ` to `chrono::DateTime<Utc>`; the app's `Task` stores a
string today. A Postgres adapter would either keep the string at the boundary
or change `Task` to a typed timestamp. The boundary is the place to decide.

## If something went wrong

**`connection refused`.** The container is not ready, or the server is using
the wrong host. Wait for `pg_isready`; use `127.0.0.1` inside the pod.

**`password authentication failed`.** The container's `POSTGRES_*` variables
only apply on first initialization of the volume. Remove the volume and start
again, or alter the role.

**`relation "tasks" does not exist`.** The schema was not applied. Run the
migration as part of startup, not by hand.

**The index is not used.** Run `EXPLAIN (ANALYZE, BUFFERS)` on the query. A
small table may prefer a sequential scan; the planner is allowed to ignore the
index.

**A writer blocks readers.** Postgres uses MVCC; readers do not block. A long
transaction holds locks and bloat; keep transactions short.

**The tags query is slow.** `JSONB` containment needs a GIN index:
`CREATE INDEX ON tasks USING GIN (tags);`. Measure before adding it.

## Going deeper: SQLite and Postgres are different tools

SQLite is embedded, zero-ops, and excellent for one writer and a small app. It
is not a network database and does not scale writes across machines.

Postgres is a server with roles, connections, backups, replication, and an
operational cost. It earns that cost when several services or writers need the
same data.

The `Store` trait lets the app choose. The rest of the production ground assumes
Postgres; the local course keeps SQLite for zero-setup.

