---
title: "migrations — the finished app"
description: "The finished app, file by file: migrations (spoilers)."
sidebar:
  hidden: true
tableOfContents: false
pagefind: false
---


Part of [The finished app (spoilers)](/100-days-of-rust/appendices/the-finished-app/).


## `migrations/0001_init.sql`

````sql
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    tags TEXT NOT NULL
);
````


## `migrations/0002_status_index.sql`

````sql
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
````


## `migrations/0003_uuid_and_time.sql`

````sql
ALTER TABLE tasks ADD COLUMN uuid TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
````


## `migrations/0004_users_sessions.sql`

````sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id),
    expires_at TEXT NOT NULL
);

ALTER TABLE tasks ADD COLUMN owner_id INTEGER;
````
