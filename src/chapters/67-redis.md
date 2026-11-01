---
title: Redis
day: 67
part: Production ground
partDay: 7
partDays: 30
time: "2 hours"
description: Run Redis locally, learn the strings, hashes, and TTLs the app needs, and see where a cache helps — and where it lies.
bullets:
  - run Redis in a container and use `redis-cli`;
  - cache a read with a TTL;
  - use `INCR` for a rate limiter.
---

Postgres is the source of truth. Redis is the fast, disposable layer beside it:
a cache, a counter, a short-lived session, a rate limiter.

Today the app's stack gets Redis. The lessons are as much about what not to
cache as about the commands.

## Run it

<!-- transcripts: authored -->
```bash
$ podman run -d --name todo-redis --pod todo-pod \
    docker.io/library/redis:7
$ podman exec todo-redis redis-cli ping
PONG
```

Redis is a single process with an in-memory data store. It can persist to disk,
but its first job is speed; a restart may lose recent writes unless persistence
is configured.

## The data types

- **String** — a value, a counter, a serialized blob.
- **Hash** — named fields under one key; a task's fields.
- **List** — an ordered queue.
- **Set** — unique members.
- **Sorted set** — members with a score; a leaderboard or a time index.
- **Stream** — an append-only log with consumer groups.

The app uses strings and counters first.

## A cache

<!-- transcripts: authored -->
```bash
$ podman exec todo-redis redis-cli SET task:1 '{"title":"buy milk"}' EX 60
OK
$ podman exec todo-redis redis-cli TTL task:1
60
$ podman exec todo-redis redis-cli GET task:1
{"title":"buy milk"}
```

`EX 60` expires the key after 60 seconds. A cache without a TTL is a second
database with worse durability. Set a TTL for every cached read, and make the
TTL a policy decision, not a random number.

The **cache-aside** pattern:

1. read from Redis;
2. on a miss, read from Postgres;
3. write the result to Redis with a TTL;
4. on a write, delete the key (or update it).

Deleting on write is simpler and safer than updating: the next read fills the
cache from the source of truth.

## A rate limiter

<!-- transcripts: authored -->
```bash
$ podman exec todo-redis redis-cli INCR login:alice
1
$ podman exec todo-redis redis-cli EXPIRE login:alice 60
1
```

`INCR` is atomic. The first request creates the key with 1; subsequent requests
increment. `EXPIRE` starts a window. A login limiter checks the count before
verifying the password and rejects over the limit with 429 and `Retry-After`.

The two commands are not atomic together. A crash between `INCR` and `EXPIRE`
leaves a key without a TTL. Use a Lua script or `SET key 1 EX 60 NX` plus
`INCR` carefully; the production version uses one atomic operation.

## Sessions

A session token can live in Redis instead of Postgres. The trade-off:

- Redis is fast and expires keys automatically;
- Postgres is durable and queryable;
- a Redis restart may log everyone out.

The app stores sessions in SQLite/Postgres today. Redis is a good fit for a
short-lived cache of the session lookup, not the only copy.

## Cache invalidation

The hard part is not `SET`; it is knowing when the value is stale.

- **TTL only** — simple; a reader may see data up to TTL old.
- **Delete on write** — the next read refreshes; a race can refill an old value.
- **Versioned keys** — `tasks:v3:{user}`; a deploy bumps the version.
- **Write-through** — update both stores; more code, more failure modes.

For a task list, a short TTL plus delete-on-write is enough. For a bank
balance, a cache is a liability.

## In the app

The API's `GET /api/v1/tasks` is a candidate: it is read-heavy and the result
is per user. The owner id is part of the key; never cache across users.

The login limiter is the second candidate: per email or per IP, a short window,
a 429 response. The password hash check is expensive; the limiter protects it.

The TUI and CLI do not use Redis. They read the store directly or through the
API; a cache is a server concern.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 67: redis"
```

## If something went wrong

**`connection refused`.** Redis is not running or the host is wrong. Inside a
pod, use `127.0.0.1:6379`.

**The cache returns the previous user's tasks.** The key does not include the
owner id. Add it; a shared cache key is a data leak.

**A key never expires.** The TTL was not set, or `EXPIRE` failed after `INCR`.
Use an atomic set with expiry.

**The cache is always cold.** The TTL is too short, or writes delete the key
faster than reads fill it. Measure the hit rate before tuning.

**Redis memory grows without bound.** Eviction is `noeviction` by default on
some images; set `maxmemory` and a policy, or every key needs a TTL.

**The session disappears after a restart.** Redis persistence is off or the
session lived only in memory. Keep the durable session in Postgres.

## Going deeper: Redis is not a database

Redis is excellent at small, hot, disposable state. It is a poor primary store
for data you cannot rebuild: eviction, restart, and replication lag all bite.

The app's rule: Postgres owns the tasks and users; Redis owns speed and
short-lived counters. A cache miss is a slow path, not an error.

The next lesson wires Redis into the app's session lookup and rate limiter.

