---
title: "Day 43 — Review: Part VII"
description: "Catch up on the Axum API, middleware, users, sessions, and authorization, then tag Part VII. — Day 43 of 100 Days of Rust."
sidebar:
  order: 43
day: 43
---

**About 1.5 hours** · Part VII, review.

Part VII put the store behind HTTP: a health check, task CRUD with
problem+json, a middleware stack, users and sessions, and owner-scoped queries.

The API is the first real client of the database. The web UI and TUI will use
it, not the store directly.

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

## Read the API

<!-- transcripts: authored -->
```text
src/
├── api.rs       router, handlers, middleware, auth endpoints
└── auth.rs      Argon2id hashes, session tokens
```

Routes:

- `GET /health` — readiness, checks the database;
- `POST /api/v1/users` — register;
- `POST /api/v1/sessions` — log in, returns a bearer token;
- `GET /api/v1/me` — the current user;
- `GET /api/v1/tasks` — the current user's tasks;
- `POST /api/v1/tasks` — create a task;
- `GET /api/v1/tasks/{id}` — one task, 404 if not yours;
- `POST /api/v1/tasks/{id}/done` — mark one done.

## Exercise it

<!-- transcripts: authored -->
```bash
$ cargo run --bin todo-server
listening on http://127.0.0.1:8080
$ curl -s -X POST http://127.0.0.1:8080/api/v1/users \
    -H 'content-type: application/json' \
    -d '{"email":"a@example.com","password":"secret"}'
{"user_id":1}
$ TOKEN=$(curl -s -X POST http://127.0.0.1:8080/api/v1/sessions \
    -H 'content-type: application/json' \
    -d '{"email":"a@example.com","password":"secret"}' | jq -r .token)
$ curl -s -X POST http://127.0.0.1:8080/api/v1/tasks \
    -H "authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' -d '{"title":"buy milk"}'
...
```

The exact JSON includes an id, uuid, created_at, title, status, and tags.

## What you should be able to explain

- Why health checks the database.
- Which layer assigns a request id, and why it must come before tracing.
- Why a blank title is 422 and a missing task is 404.
- Why a wrong password and an unknown email return the same 401.
- Why the session table stores a token hash, not the token.
- Why every task query carries the owner id.
- Why another user's task returns 404, not 403.

## Check your history

<!-- transcripts: authored -->
```bash
$ git log --oneline
... day 42: scope every task to its owner
... day 41: register users and issue sessions
... day 40: wrap the API in middleware
... day 39: build task CRUD endpoints
... day 38: serve a health endpoint
```

## If something is red

**A task route returns 401.** The request has no `Authorization: Bearer ...`
header, or the session row expired.

**A user sees another user's task.** A handler uses `list`/`find` instead of
the owned variants. Add `owner_id` to the query.

**A migration checksum fails after adding users.** Add a new migration; do not
edit 0004 once it has run.

**The login test is slow.** Argon2 is deliberately slow. One hash per test is
fine; do not run a password hash in a tight loop.

**The middleware test sees a missing header.** The layer stack order changed.
Request id and security headers are outermost in this router.

## The milestone

You have an authenticated, owner-scoped JSON API with a consistent error shape
and a middleware stack. The next part gives it a browser face.

Tag it:

<!-- transcripts: authored -->
```bash
$ git tag part-vii
```

Next: the web UI. Askama templates, forms, CSRF, sessions, embedded assets,
security headers, and page tests.

<div class="day-tracker" data-day="43"></div>
