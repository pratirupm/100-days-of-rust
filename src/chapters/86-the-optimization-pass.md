---
title: The optimization pass
day: 86
part: Production ground
partDay: 26
partDays: 30
time: "2.5 hours"
description: Record a baseline, change one thing at a time, and keep only the optimizations the numbers support.
bullets:
  - write the baseline before touching code;
  - optimize the query before the microbenchmark;
  - record the reverted attempts too.
---

The load test gives numbers. This lesson turns them into a repeatable
optimization pass: baseline, one change, measure, keep or revert.

## The baseline

Record the workload and the results:

<!-- transcripts: authored -->
```text
GET /api/v1/tasks, 10,000 tasks for one user
concurrency 50, 30 seconds
p50 4.2ms, p95 18ms, p99 41ms, 2,310 req/s, 0 errors
```

The workload includes the data size. A benchmark on 10 tasks does not predict
10,000. Seed the database with a realistic number before measuring.

## The first look

`EXPLAIN (ANALYZE, BUFFERS)` on the list query:

```sql
SELECT ... FROM tasks WHERE owner_id = $1 ORDER BY id;
```

The plan scans the table and sorts. With 10,000 tasks for one user, the sort is
the cost. The SQLite index `(owner_id, id)` matches the filter and the order:

```sql
CREATE INDEX tasks_owner_id_idx ON tasks (owner_id, id);
```

The Postgres adapter uses the same column order; `EXPLAIN (ANALYZE, BUFFERS)`
shows the equivalent plan there.

The plan becomes an index scan; the sort disappears. Measure again:

<!-- transcripts: authored -->
```text
p50 1.1ms, p95 4.6ms, p99 9ms, 7,900 req/s
```

The index is a clear win. It also costs write time and disk; the task inserts
are less frequent than the reads, so the trade is worth it.

## The second candidate

JSON encoding of the list is the next cost. A page of 10,000 tasks is a large
response; the API should paginate:

```sql
... WHERE owner_id = $1 ORDER BY id LIMIT $2 OFFSET $3;
```

The web UI and the TUI can read a page once the endpoint supports it, and the
response size drops. The page size is a product decision; 50 is a reasonable
start. Cursor pagination
(`WHERE id > $last`) avoids the offset cost on deep pages.

## The third candidate

The login limiter calls Redis on every login. A local cache with a short TTL
can absorb repeated attempts from the same client, but a distributed limiter
must be shared. Measure the Redis round trip before adding a second cache.

## The reverted attempts

Not every idea wins. Record them:

- **A larger connection pool** — more contention on the database, no gain.
- **`codegen-units = 16`** — smaller build, no measurable runtime change.
- **A `Vec` preallocation** — within noise; the query dominates.

A reverted optimization is a result. It stops the next person from trying the
same thing.

## The check

Keep a small benchmark in the project:

<!-- transcripts: authored -->
```bash
$ cargo bench --bench api
```

A criterion benchmark with a committed baseline makes a regression visible in a
PR. The benchmark runs on a quiet machine; CI runners are noisy. The check uses
a threshold and a noise floor, not an exact number.

## In the app

The list query, the page size, and the index are the app's real performance
levers. The release profile is secondary. The database plan is visible; the
compiler flags are guesses until measured.

The web page renders the same list; pagination helps it too. The TUI loads the
local database; its list is small enough, but the same query shape applies.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 86: the optimization pass"
```

## If something went wrong

**The benchmark is noise.** The machine is busy, the sample is short, or the
workload is too small. Increase the sample, pin the CPU, and use a quiet host.

**The index slows writes.** Measure both reads and writes; keep the index only
if the read win outweighs the write cost.

**The optimization helps one query and hurts another.** The index order is
wrong for the second query. One index per shape, or a covering index.

**The response is still large.** Pagination is missing, or the page size is too
high. Measure the payload size, not just the latency.

**The baseline was recorded on a different dataset.** The comparison is
meaningless. Record the data size and the seed with the numbers.

**A regression ships.** The benchmark is not in the check. Add it with a
threshold, or compare the release artifacts.

## Going deeper: performance is a product feature

A 100 ms improvement is invisible; a 1 second improvement changes whether a
person uses the app. Prioritize the user-facing path, not the microbenchmark.

The production ground's performance lesson ends where the app's performance
work begins: a baseline, a plan, and a measurement loop. The rest is repetition.

The next lesson audits the supply chain: the code you ship that you did not
write.

