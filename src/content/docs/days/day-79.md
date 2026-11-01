---
title: "Day 79 — Microservices"
description: "Split one honest seam out of the app — notifications — and pay the operational bill for the split. — Day 79 of 100 Days of Rust."
sidebar:
  order: 19
day: 79
---

**About 2 hours** · Production ground, day 19 of 30.

**You'll be able to:**

- choose a boundary with a real reason;
- define the contract and the failure modes;
- decide what stays in the monolith.

---

A microservice is not a folder with a `main`. It is a separately deployable
process with its own data and its own failure modes. The split has a bill:
network calls, contracts, observability, and two deploys.

Today the app gets one seam: notifications.

## The seam

The task app writes tasks. A notification service sends email when a task is
created or done. The two have different reasons to change, different scaling
profiles, and different failure tolerances.

That is a real seam. A "user service" that shares the users table with the API
is not; it is a distributed monolith.

## The contract

The notification service consumes events, not database rows:

```json
{"event":"task.created","task_id":1,"owner_id":1,"email":"a@example.com","title":"buy milk"}
```

The event is the contract. The producer owns the event; the consumer owns the
notification. The notification service never queries the task database.

Version the event. Add fields; do not rename or remove without a migration
window. A consumer that ignores unknown fields survives additive changes.

## The failure modes

- **Queue unavailable** — the producer retries; the event stays in the outbox.
- **Consumer down** — messages wait; the queue depth grows; an alert fires.
- **Email provider down** — retry with backoff; dead-letter after the budget.
- **Duplicate delivery** — idempotency key; one email per event id.
- **Poison message** — parse failure; dead-letter immediately.
- **Consumer slow** — scale consumers up to the partition count; optimize the
  handler.

The monolith's request path does not wait for any of these. That is the point of
the split.

## What stays

The API, auth, tasks, and the web UI stay together. The notification service
owns only delivery. A second service for "search" could own an index; a third
for "billing" could own invoices. Each split must earn its operational cost.

A monolith is not a failure. A modular monolith with clear modules is often the
right first architecture. Split when a module has a different scaling or
failure profile, not because the diagram looks better.

## The deploy

The notification service has its own container, its own config, its own logs,
and its own health check. It shares the event schema, the queue, and the
tracing convention with the app.

The platform needs a service discovery mechanism (Kubernetes Service, a load
balancer) and a deployment pipeline per service. That is the bill.

## In the app

The outbox relay publishes `task.created` and `task.done` events. The
notification consumer reads them and sends an email. The app's API does not
import the notification code.

The `Store` trait stays in the monolith. The notification service has its own
small store for idempotency (`notifications` table or Redis key).

## If something went wrong

**The services share a database.** They are coupled at the schema; a change
breaks both. Give each service its own data, or keep one service.

**An event change breaks the consumer.** Additive fields are safe; renames and
removals are not. Version the schema and deploy both sides.

**The queue is the only integration test.** Add a contract test: the producer's
event serializes to the schema the consumer expects.

**The consumer falls behind.** Check the queue depth and the partition count.
Scale consumers up to the partitions; then optimize.

**A duplicate email is sent.** The idempotency key is missing or not durable.

**Tracing a request across services is impossible.** Propagate the trace/request
id in the event and the HTTP headers. One id across the boundary is the
minimum.

## Going deeper: distributed monolith

A distributed monolith has the deployment complexity of microservices and the
coupling of a monolith: shared databases, synchronous call chains, and lockstep
deploys. It is the worst of both.

The test for a real boundary: can the service be deployed, scaled, and fail
independently? If not, it is a module, not a service.

The next lesson builds the notification service and its contract test.

<div class="day-tracker" data-day="79"></div>
