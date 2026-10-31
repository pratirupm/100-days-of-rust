---
title: "Day 69 — Kafka and Redpanda"
description: "Run a single-node Redpanda broker, create a topic, and produce and consume task events. — Day 69 of 100 Days of Rust."
sidebar:
  hidden: true
day: 69
---

**About 2.5 hours** · Production ground, day 9 of 30.

**You'll be able to:**

- run Redpanda in a container;
- create a topic with partitions;
- produce and consume a task event.

---

A database answers "what is true now." An event log answers "what happened."
Kafka is the log; Redpanda is a Kafka-compatible broker that is easy to run
locally.

Today the app gets an event stream for task changes.

## Run Redpanda

<!-- transcripts: authored -->
```bash
$ podman run -d --name todo-redpanda --pod todo-pod \
    -p 9092:9092 -p 9644:9644 \
    docker.io/redpandadata/redpanda:latest \
    redpanda start --overprovisioned --smp 1 --memory 1G \
    --reserve-memory 0M --node-id 0 --check=false \
    --kafka-addr PLAINTEXT://0.0.0.0:9092 \
    --advertise-kafka-addr PLAINTEXT://127.0.0.1:9092
```

The flags keep the broker small enough for a laptop. `--check=false` skips the
host tuning check; a container is not a production host.

The broker exposes Kafka on 9092 and its admin API on 9644.

## A topic

<!-- transcripts: authored -->
```bash
$ podman exec todo-redpanda rpk topic create task-events -p 3
TOPIC       STATUS
task-events OK
```

Three partitions allow three consumers in a group to work in parallel. A
partition is ordered; the topic as a whole is not.

The **key** chooses the partition. Use the task id (or owner id) as the key when
events for one task must stay ordered. Without a key, events round-robin
across partitions.

## Produce

<!-- transcripts: authored -->
```bash
$ podman exec -it todo-redpanda rpk topic produce task-events
{"event":"task.created","id":1,"title":"buy milk"}
```

A message is bytes; JSON is a convention. The broker does not validate the
schema. The producer and consumer must agree on it, and a schema registry makes
that agreement enforceable.

## Consume

<!-- transcripts: authored -->
```bash
$ podman exec -it todo-redpanda rpk topic consume task-events --num 1
{
  "topic": "task-events",
  "partition": 0,
  "offset": 0,
  "key": null,
  "value": "{\"event\":\"task.created\",\"id\":1,\"title\":\"buy milk\"}"
}
```

The offset is the position in the partition. A consumer commits its offset to
record what it has processed; on restart it resumes after the last commit.

## Delivery semantics

- **At most once** — commit before processing; a crash loses the message.
- **At least once** — process, then commit; a crash may repeat. Consumers must
  be idempotent.
- **Exactly once** — transactional produce and consume; possible, complex, and
  usually unnecessary for a notification.

The app's task events are notifications; at-least-once with an idempotent
consumer is enough. A duplicate email is annoying; a duplicate payment is not.

An **outbox** keeps the database and the event consistent: write the event row
in the same transaction as the task, then a relay publishes it. Without an
outbox, a crash between the database commit and the publish loses the event.

## Consumer groups

A group shares the partitions. Three consumers in one group with three
partitions get one partition each. A fourth consumer sits idle. A second group
gets its own offsets and can replay the topic independently.

Replay is the superpower: a new consumer can read history from offset 0 and
build a new read model.

## In the app

The events are small:

```json
{"event":"task.created","task_id":1,"owner_id":1,"title":"buy milk","at":"2026-10-31T09:30:00Z"}
{"event":"task.done","task_id":1,"owner_id":1,"at":"2026-10-31T10:00:00Z"}
```

The notification service consumes them and sends an email. The search index
consumes them and updates a document. Neither needs to query the task table on
the request path.

## If something went wrong

**The broker exits with a memory error.** The container is too small for the
default reservations. Lower `--memory` and `--reserve-memory`, or give the
container more.

**The producer cannot connect.** The advertised address points at a host the
client cannot reach. Set `--advertise-kafka-addr` to the address clients use.

**A consumer sees duplicates.** At-least-once delivery. Make the handler
idempotent; use the event id or the task version.

**Events for one task are out of order.** They landed on different partitions.
Use the task id as the key.

**The consumer group lags.** A slow handler or too few consumers. Check the lag,
scale consumers up to the partition count, then optimize the handler.

**The topic grows forever.** Set a retention policy (time or size). An event log
is not a database; old events can expire.

## Going deeper: events vs messages

A message queue deletes a message after it is consumed. A log keeps it for a
retention period and lets many consumers read it independently. Kafka is a log.

The trade-off is operational: partitions, brokers, offsets, and retention.
Start with one topic and one consumer; add topics when the boundary is real,
not because microservices are fashionable.

The next lesson publishes task events from the app with an outbox.

<div class="day-tracker" data-day="69"></div>
