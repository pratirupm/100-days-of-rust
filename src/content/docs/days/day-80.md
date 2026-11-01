---
title: "Day 80 — The notification service"
description: "Build a small service that consumes task events, deduplicates them, and reports its own health and lag. — Day 80 of 100 Days of Rust."
sidebar:
  order: 20
day: 80
---

**About 2 hours** · Production ground, day 20 of 30.

**You'll be able to:**

- consume the event contract;
- keep an idempotency record;
- expose health and lag metrics.

---

The boundary is chosen. This lesson builds the service on the other side: a
consumer, an idempotency table, and its own health.

## The crate

A workspace member, not a second half of the app:

<!-- transcripts: authored -->
```text
notification/
├── Cargo.toml
└── src/
    ├── main.rs
    ├── consumer.rs
    └── store.rs
```

It depends on `tokio`, `serde`, `sqlx` (for its own idempotency table), and the
shared event type. It does not depend on the app's `Store` or API.

## The event type

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event")]
pub enum TaskEvent {
    #[serde(rename = "task.created")]
    Created { task_id: u32, owner_id: i64, email: String, title: String },
    #[serde(rename = "task.done")]
    Done { task_id: u32, owner_id: i64, email: String },
}
```

The enum is a contract. A new variant is an additive change; a renamed variant
is a breaking one. The `event` field is the discriminator.

## The consumer

```rust
loop {
    let Some((body, receipt)) = queue.receive().await? else { continue };
    let event: TaskEvent = serde_json::from_str(&body)?;
    if !seen(&pool, &event.id()).await? {
        send(&event).await?;
        mark_seen(&pool, &event.id()).await?;
    }
    queue.delete(&receipt).await?;
}
```

`seen` and `mark_seen` are the idempotency store. The send happens before the
mark; a crash between them can send twice. An email provider with an
idempotency key closes that window; for this course, the duplicate is
acknowledged.

## Health and lag

The service exposes:

- `/health` — the process can reach its database and queue;
- `/metrics` — `notification_sent_total`, `notification_failed_total`,
  `queue_lag_messages`.

Lag is the difference between the newest message and the last committed one.
The exact source depends on the queue; SQS has `ApproximateNumberOfMessages`;
Kafka has consumer group lag.

A consumer that is running but not consuming is worse than a stopped one: the
health check says green, the queue grows. Lag is the real health signal.

## The deploy

The service gets its own container, ConfigMap, Secret, and Deployment. The
queue URL and the database URL are config. The image is built from the same
workspace, but only the notification binary is copied into the runtime image.

The app's release workflow publishes both images. The service's migration is
its own (the idempotency table); it does not run the task schema migrations.

## The contract test

```rust
#[test]
fn created_event_round_trips() {
    let event = TaskEvent::Created { task_id: 1, owner_id: 1, email: "a@example.com".into(), title: "buy milk".into() };
    let json = serde_json::to_string(&event).unwrap();
    assert!(json.contains("\"event\":\"task.created\""));
    let back: TaskEvent = serde_json::from_str(&json).unwrap();
    assert!(matches!(back, TaskEvent::Created { task_id: 1, .. }));
}
```

The producer and the consumer share the type in a workspace; a test that
serializes and deserializes it catches the common drift. A cross-language
consumer needs a schema registry and generated types.

## In the app

The monolith publishes events through the outbox. The notification service
consumes them. The API's response does not wait for the email.

The service has its own database or schema. It does not read the task table; the
event carries the email and the title it needs.

## If something went wrong

**The service receives no messages.** The queue name or the region is wrong, or
the consumer group is not subscribed. Check the queue depth.

**The same event is sent twice.** The idempotency marker was written after the
send. Use a provider idempotency key or move the marker into the same
transaction as a local outbox.

**The service is healthy but the queue grows.** The consumer is blocked or the
handler is slow. Lag is the signal; add it to the dashboard.

**The event deserialization fails.** The producer changed a field. Add a
version or a compatible field; do not silently drop the message.

**The service cannot reach its database.** It has its own database URL. Check
the Secret and the network policy.

**The deploy of one service breaks the other.** The event contract changed
without a migration window. Deploy the consumer first, or support both shapes.

## Going deeper: bounded contexts

A service boundary is a bounded context: the notification service owns delivery,
the task service owns tasks, the billing service owns money. The event is the
translation between contexts.

The hard part is not the code; it is the ownership. Who can change the event?
Who is on call for the consumer? Who pays for the queue? A service without an
owner is a shared liability.

The next lesson covers distributed systems: retries, idempotency, ordering, and
the failure modes that appear when the network is real.

<div class="day-tracker" data-day="80"></div>
