---
title: The production capstone
day: 90
part: Production ground
partDay: 30
partDays: 30
time: "2 hours"
description: Run the whole stack, walk the production checklist, and close the 30-day track.
bullets:
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
$ podman volume create todo-data
$ podman run -d --pod todo-prod --name todo-server \
    -e TODO_DB=sqlite:///data/todo.db \
    -v todo-data:/data todo-server:0.1
```

The reference image runs the 60-day app on SQLite. The Postgres, Redis, and
event variants from this track are adapters you add in your own copy; the
commands below prove the app's own path first.

## The checks

<!-- transcripts: authored -->
```bash
$ curl -fsS http://127.0.0.1:8080/health
{"status":"ok"}
$ curl -fsS http://127.0.0.1:8080/metrics | head
$ curl -s -X POST http://127.0.0.1:8080/api/v1/users \
    -H 'content-type: application/json' \
    -d '{"email":"a@example.com","password":"secret"}'
{"user_id":1}
$ TOKEN=$(curl -s -X POST http://127.0.0.1:8080/api/v1/sessions \
    -H 'content-type: application/json' \
    -d '{"email":"a@example.com","password":"secret"}' | jq -r .token)
$ curl -s -X POST http://127.0.0.1:8080/api/v1/tasks \
    -H "authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' -d '{"title":"capstone"}'
$ curl -s http://127.0.0.1:8080/api/v1/tasks \
    -H "authorization: Bearer $TOKEN"
```

The metrics show the request and task counters. The task is in the SQLite file
inside the `todo-data` volume. Register before logging in: a fresh database has
no user, and the login endpoint correctly returns 401 until one exists.

## The checklist

The checklist is the **target** state for a deployment with the production
adapters. An unchecked box is a known gap, not a claim about the reference
image.

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

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 90: the production capstone"
```

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

