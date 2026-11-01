---
title: "Day 90 — The production capstone"
description: "Run the whole stack, walk the production checklist, and close the 30-day track. — Day 90 of 100 Days of Rust."
sidebar:
  order: 30
day: 90
---

**About 2 hours** · Production ground, day 30 of 30.

**You'll be able to:**

- bring up the server, database, cache, and queue together;
- verify health, metrics, a task event, and a backup;
- review the production track.

---

Thirty days ago the app ran on a laptop. Today it has a container, a database
server, a cache, a queue, a cluster, and a runbook.

The capstone is a rehearsal: bring the stack up, prove the paths, and check the
list.

## The stack

<!-- transcripts: authored -->
```bash
$ podman pod create --name todo-prod -p 8080:8080
$ podman run -d --pod todo-prod --name todo-pg \
    -e POSTGRES_USER=todo -e POSTGRES_PASSWORD=todo \
    -e POSTGRES_DB=todo -v todo-pg:/var/lib/postgresql/data \
    docker.io/library/postgres:17
$ podman run -d --pod todo-prod --name todo-redis \
    docker.io/library/redis:7
$ podman run -d --pod todo-prod --name todo-server \
    -e TODO_DB=postgres://todo:todo@127.0.0.1:5432/todo \
    -v todo-data:/data todo-server:0.2
```

The server image includes the Postgres adapter; the container uses the same
environment contract as the systemd unit. The pod shares the network namespace,
so the database and cache are on localhost.

## The checks

<!-- transcripts: authored -->
```bash
$ curl -fsS http://127.0.0.1:8080/health
{"status":"ok"}
$ curl -fsS http://127.0.0.1:8080/metrics | head
$ TOKEN=$(curl -s -X POST http://127.0.0.1:8080/api/v1/sessions \
    -H 'content-type: application/json' \
    -d '{"email":"a@example.com","password":"secret"}' | jq -r .token)
$ curl -s -X POST http://127.0.0.1:8080/api/v1/tasks \
    -H "authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' -d '{"title":"capstone"}'
$ curl -s http://127.0.0.1:8080/api/v1/tasks \
    -H "authorization: Bearer $TOKEN"
```

The metrics show the request and task counters. The task is in Postgres. The
event is in the outbox or the topic; the consumer sees it.

## The checklist

- [ ] The server runs as a non-root user with a read-only root filesystem.
- [ ] The database is a server with a backup, not a file on the app host.
- [ ] The cache has a TTL and a key that includes the owner.
- [ ] The event producer uses an outbox; the consumer is idempotent.
- [ ] The gRPC/WebSocket boundaries have auth and owner scoping.
- [ ] Kubernetes has readiness and liveness probes that differ.
- [ ] The cloud services are behind traits; the tests need no cloud.
- [ ] The notification service has its own data and health.
- [ ] Retries have jitter, a budget, and an idempotency key.
- [ ] The dashboard shows RED metrics and the queue lag.
- [ ] The load test has a baseline and a p99.
- [ ] The SBOM, checksums, and advisory check run on every release.
- [ ] The runbook has deploy, backup, restore, rotate, and rollback.
- [ ] A restore drill has been run, not just planned.

## What the track covered

Containers → pods → CI/CD → PostgreSQL → Redis → Kafka → gRPC → WebSockets →
Kubernetes → LocalStack → microservices → distributed systems → observability →
performance → supply chain → operations.

The app did not become a different app. Each topic extended the same todo
service behind a seam: a store trait, an event, a client, a transport. That is
the real lesson: production is a set of boundaries, not a new codebase.

## What is next

Days 91–100 go underneath the app: complexity, vectors, maps, stacks, linked
structures, trees, graphs, shortest paths, sorting, and interview-shaped
practice — measured with `criterion` and tied back to the todo data.

The app is yours. Add a feature the book did not: recurring tasks, sharing,
reminders, a mobile client. Keep the tests green; that is how the next change
stays safe.

## If something went wrong

**The stack starts but the server cannot reach Postgres.** The pod network is
shared, but the server container may be using a different namespace. Check the
pod and the URL.

**The health check is green but the task write fails.** The health only lists
tasks; the write path has a different error (owner, migration, disk). Read the
server logs.

**The event is published but the consumer sees nothing.** The topic or consumer
group is wrong, or the consumer is not running. Check the broker and the lag.

**The backup file is on the same disk as the database.** A disk failure takes
both. Copy it to object storage.

**The restore drill fails.** The backup was never tested. Fix the restore
process before the real incident.

**The checklist has unchecked boxes.** The capstone is a rehearsal; an unchecked
box is a known gap, not a failure. Put it on the list with an owner.

## Going deeper: production is a practice

The tools change: Docker to Podman, Kafka to Redpanda, SQLite to Postgres. The
questions stay: where is the state, who can read it, what happens when a call
fails, and how do we know?

The last ten days are a different kind of question: how do we measure a data
structure and choose one? That is next.

<div class="day-tracker" data-day="90"></div>
