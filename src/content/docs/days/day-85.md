---
title: "Day 85 — Performance and load"
description: "Measure latency and throughput under load, find the saturation point, and profile before changing a line. — Day 85 of 100 Days of Rust."
sidebar:
  hidden: true
day: 85
---

**About 2.5 hours** · Production ground, day 25 of 30.

**You'll be able to:**

- distinguish latency, throughput, and saturation;
- load test with warm-up and percentiles;
- profile the CPU and the query plan.

---

A benchmark on a laptop says almost nothing about production. A load test with a
defined workload, a warm-up, and percentiles says something.

Today the app is measured, not guessed at.

## The numbers

- **Latency** — how long one request takes; report p50, p95, p99.
- **Throughput** — requests per second at a given latency.
- **Saturation** — how close a resource is to its limit (CPU, connections,
  queue depth).
- **Error rate** — the share of requests that failed.

A system can be fast at low load and fall over at the knee. The **knee** is where
latency rises sharply as a resource saturates. Find it; do not tune for the
average.

## A load test

Run a fixed workload against a running server:

<!-- transcripts: authored -->
```bash
$ oha -z 30s -c 50 --latency-correction \
    http://127.0.0.1:8080/health
$ oha -z 30s -c 50 -m POST \
    -H 'content-type: application/json' \
    -d '{"title":"load test"}' \
    http://127.0.0.1:8080/api/v1/tasks
```

`-z 30s` runs for 30 seconds; `-c 50` keeps 50 concurrent workers. The latency
correction subtracts the client's own scheduling delay from the measured
latency.

Warm up first: JIT, caches, and connection pools need a few seconds. Measure the
steady state, not the first second.

The API requires a token; generate one with the login flow and pass it with
`-H 'authorization: Bearer ...'`. A load test against `/health` measures the
server loop, not the database.

## Read the output

<!-- transcripts: authored -->
```text
Success rate: 100.00%
Latency:
  p50: 1.2ms
  p95: 4.8ms
  p99: 9.1ms
Requests/sec: 8120
```

The p99 is the number a user feels when they are unlucky. The success rate is
the first filter; a fast 500 is still a failure.

Run the same test at 10, 50, 200, and 500 concurrency. Plot latency against
throughput. The knee is where p99 jumps while throughput stops rising.

## Profile

A profile says where the time goes:

<!-- transcripts: authored -->
```bash
$ perf record -g -- ./target/release/todo-server
$ perf report
$ cargo flamegraph --bin todo-server
```

`perf` samples the CPU; a flame graph shows the stack. For async code, also
measure wall time: a task waiting on a database is not burning CPU, but it is
still slow.

For allocations, use `heaptrack` or `DHAT`. For syscalls, `strace -c`. The tool
follows the question.

## The database

The query plan is the first place to look for an API:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, uuid, created_at, title, status, tags
FROM tasks WHERE owner_id = $1 ORDER BY id;
```

A sequential scan on a large table is the usual finding. The composite index
from the Postgres lesson (`owner_id, status`) or `(owner_id, id)` is the fix.
Measure the plan before and after; an index that is not used is a write cost
with no read benefit.

N+1 queries are the second finding: one query for the list, one per task for
tags. Join or batch.

## In the app

The app's hot paths:

- `GET /api/v1/tasks` — the database query and JSON encoding;
- `POST /api/v1/tasks` — the insert, the outbox, the response;
- the web page — template render and session lookup;
- the TUI — local render, not a server path.

The metrics endpoint, the health probe, and the login limiter are also request
paths. A limiter that calls Redis on every login is a dependency in the hot
path; measure it.

## If something went wrong

**The load test measures the client.** The client is at 100% CPU and the server
is idle. Run the load generator on another machine or container.

**The first second is slow.** That is the warm-up. Exclude it, or keep the
server warm.

**Throughput does not rise with concurrency.** A resource is saturated: the
connection pool, the database writer, or a lock. Find the saturation, not the
symptom.

**p99 is high but the average is fine.** A tail latency problem: a lock, a GC
pause, a slow query, or a queue. Profile the tail, not the mean.

**The optimization made it slower.** Measure the whole path, not one function.
A faster function that allocates more can lose.

**The index is not used.** The query or the statistics are different. Run
`ANALYZE`, check the plan, and match the index order to the predicate and sort.

## Going deeper: the USE method

For each resource: utilization, saturation, errors. A database at 90% CPU is
busy; at 100% with a queue, it is saturated. The queue is the signal, not the
CPU percentage.

Little's law: `concurrency = throughput × latency`. If 50 workers and 5 ms
latency give 10,000 requests per second, a latency of 50 ms at the same
concurrency gives 1,000. The math tells you which lever matters.

The next lesson turns the measurements into a repeatable optimization pass.

<div class="day-tracker" data-day="85"></div>
