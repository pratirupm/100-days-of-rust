---
title: "Day 82 — Retries and idempotency in the app"
description: "Add a retry policy to the client, an idempotency table to the API, and a version check to the update path. — Day 82 of 100 Days of Rust."
sidebar:
  hidden: true
day: 82
---

**About 2 hours** · Production ground, day 22 of 30.

**You'll be able to:**

- retry only transient client failures, with jitter;
- store an idempotency key with the write;
- reject a stale update with a version.

---

The failure model is clear. This lesson adds three small pieces to the app:
client retries, idempotent writes, and optimistic concurrency.

## Client retries

```rust
async fn send_with_retry(&self, request: RequestBuilder) -> Result<Response, Error> {
    let mut attempt = 0;
    loop {
        let response = request.try_clone().unwrap().send().await;
        match response {
            Ok(r) if !r.status().is_server_error() => return Ok(r),
            Ok(r) if attempt < 3 => { /* retry after backoff */ }
            Ok(r) => return Ok(r),
            Err(e) if e.is_timeout() || e.is_connect() => { /* retry */ }
            Err(e) => return Err(e),
        }
        attempt += 1;
        sleep(jittered_backoff(attempt)).await;
    }
}
```

`try_clone` is required because a request body cannot be replayed after it is
sent. Retry only idempotent requests, or attach an idempotency key.

## Idempotency in the API

The table:

```sql
CREATE TABLE idempotency (
    key TEXT PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    status INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The handler:

1. reads `Idempotency-Key`;
2. inserts a `processing` row;
3. performs the write;
4. stores the response and commits.

A duplicate key returns the stored body. A key with a different body is a 409.
A crash after the insert but before the write leaves a `processing` row; a
reaper or a retry policy decides what to do with it.

## Optimistic concurrency

Add a `version` column to tasks. The update carries the version the client read:

```sql
UPDATE tasks SET status = 'Done', version = version + 1
WHERE id = $1 AND owner_id = $2 AND version = $3;
```

Zero rows affected means the task changed; return 409 and let the client
refetch. The version check is the database-level guard against a stale write
overwriting a newer one.

## Ordering

The API's writes are ordered per task by the version. The outbox publishes the
new version; the consumer ignores an event older than the last version it
applied.

## Tests

- a retried `POST` with the same key creates one task;
- a different body with the same key returns 409;
- a stale `done` returns 409;
- a transient 503 is retried, a 422 is not;
- the retry budget stops after N attempts.

The tests do not need a flaky network; a fake client returns the errors.

## In the app

The TUI client gets the retry wrapper. The API gets the idempotency table and
the version column. The outbox gets the version in the event. The pieces are
small; the design is the hard part.

Do not retry inside the database transaction; retry the whole operation. A
transaction that timed out may have committed; the retry must be idempotent.

## If something went wrong

**A retry creates two tasks.** The idempotency key is not stored atomically
with the write, or the client generates a new key per attempt.

**The same key returns a stale body.** The stored response was not updated, or
the key is reused across operations. A key belongs to one logical operation.

**A stale update wins.** The version predicate is missing, or the version is
read outside the transaction.

**The retry never stops.** The attempt counter is not incremented, or the
transient classifier is too broad.

**The idempotency table grows forever.** Add a retention window; old keys can
be deleted after the client's retry budget.

**A timeout commits twice.** The database may have committed before the client
timed out. The idempotency key is the only safe answer.

## Going deeper: a retry budget

A retry budget is a cap on retries relative to successful traffic: at most 10%
of requests may be retries. It prevents a small outage from becoming a large
one.

The budget is shared across callers, not per request. A single client retrying
three times is fine; a thousand clients retrying three times is a second
outage.

The next lesson makes the system observable enough to see the retries,
timeouts, and queue lag.

<div class="day-tracker" data-day="82"></div>
