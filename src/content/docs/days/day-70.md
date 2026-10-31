---
title: "Day 70 — Task events in the app"
description: "Publish task events through an outbox, key them by task id, and make the consumer idempotent. — Day 70 of 100 Days of Rust."
sidebar:
  hidden: true
day: 70
---

**About 2 hours** · Part Production ground, day 10 of 30.

**You'll be able to:**

- write the event in the same transaction as the task;
- relay the outbox to Kafka;
- consume with an idempotency key.

---

A producer that publishes after the database commit can lose the event if the
process dies between the two. A producer that publishes before the commit can
announce a task that never existed.

The **outbox** closes the gap: the event is a row in the same transaction, and
a relay publishes it after.

## The outbox table

```sql
CREATE TABLE outbox (
    id BIGSERIAL PRIMARY KEY,
    topic TEXT NOT NULL,
    key TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);
```

The insert joins the task write:

```rust
let mut tx = pool.begin().await?;
let id = insert_task(&mut tx, title, owner).await?;
insert_outbox(&mut tx, "task-events", &id.to_string(), json!({
    "event": "task.created",
    "task_id": id,
    "owner_id": owner,
    "title": title,
})).await?;
tx.commit().await?;
```

Either both rows commit or neither does. The task and the event cannot disagree.

## The relay

A background task polls unpublished rows and produces them:

```rust
loop {
    let batch = claim_batch(&pool, 100).await?;
    for row in batch {
        producer.send(row.topic, row.key, row.payload).await?;
        mark_published(&pool, row.id).await?;
    }
    sleep(Duration::from_millis(500)).await;
}
```

The relay can publish the same row twice if it crashes after the send and
before the mark. That is at-least-once; the consumer must tolerate it.

A claim with `FOR UPDATE SKIP LOCKED` lets several relays work without sending
the same row twice in the normal case. The duplicate window on crash remains.

## The event

```json
{
  "event": "task.created",
  "task_id": 1,
  "owner_id": 1,
  "title": "buy milk",
  "at": "2026-10-31T09:30:00Z"
}
```

The event is a fact, past tense. `task.created`, not `create_task`. The
consumer should not need to call back to the producer to understand it.

Include an event id or a version so the consumer can deduplicate. The outbox
row id is a good idempotency key.

## The consumer

```rust
async fn handle(event: Event) -> Result<(), Error> {
    if seen(&event.id).await? {
        return Ok(());
    }
    send_notification(&event).await?;
    mark_seen(&event.id).await?;
    Ok(())
}
```

`seen` and `mark_seen` are a store keyed by event id. A duplicate delivery is a
no-op. The notification is sent once; the marker is written after the side
effect, so a crash between them can send twice. A true exactly-once side effect
needs the side effect and the marker in one transaction — an email provider
with an idempotency key is the practical answer.

## Ordering

Key by `task_id` so all events for one task land on one partition. The consumer
sees `created` before `done` for that task. Events for different tasks can
interleave; that is fine.

If the consumer needs global order, one partition is the only way, and it caps
throughput. Most systems need per-entity order, not global order.

## Failure handling

- **Poison message** — a payload the consumer cannot parse. Send it to a
  dead-letter topic after a retry budget; do not block the partition forever.
- **Transient failure** — retry with backoff, then dead-letter.
- **Lag** — monitor consumer lag; scale consumers up to the partition count.

The outbox relay also needs a metric: unpublished rows and the age of the oldest
one. A relay that stops is invisible until the notifications stop.

## In the app

The `Store` trait can grow an `outbox` method, but the event is a production
concern. Keep the API handler and the outbox insert in the same Postgres
transaction; the SQLite course path does not need Kafka.

The TUI and web UI do not know about events. They read the task; the event is
for other services.

## If something went wrong

**Events are missing.** The outbox row was not in the same transaction, or the
relay is down. Check the unpublished rows and the relay log.

**The same event is handled twice.** At-least-once, as designed. The consumer's
idempotency check is missing or not durable.

**The consumer is stuck on one message.** A poison message blocks the
partition. Add retries and a dead-letter topic.

**The outbox grows forever.** Published rows are not deleted. Archive or delete
them on a timer; keep enough for replay.

**Events are out of order for one task.** The key is missing or not the task id.

**The relay publishes after a rollback.** It reads committed rows only; a
rollback removes the outbox row too.

## Going deeper: the log is the integration

A database is a shared mutable state; an event log is a shared history. Services
that share a table are coupled at the schema; services that share events are
coupled at the event contract, which is easier to version.

The outbox is the bridge: the database transaction is the source of truth, and
the log is derived. Do not publish directly from the request handler and call
it reliable.

The next lesson adds gRPC: a typed request/response boundary beside the event
stream.

<div class="day-tracker" data-day="70"></div>
