---
title: Redis in the app
day: 68
part: Production ground
partDay: 8
partDays: 30
time: "2 hours"
description: Add a cache-aside read for the task list and a Redis-backed login limiter, with the failure paths designed first.
bullets:
  - cache a user's task list with a short TTL;
  - increment a login counter with an expiry;
  - fall back to Postgres when Redis is down.
---

Redis is running. This lesson designs the two places where it earns its place:
the task list read and the login limiter. The reference app has no Redis
dependency yet; add the `Cache` trait and the client in your copy before using
the snippets.

The rule is the same in both: Redis is allowed to fail, and the app still
works.

## The cache key

<!-- transcripts: authored -->
```text
tasks:{version}:{owner_id}
```

The version is bumped when the shape changes; the owner id keeps users apart.
A key without the owner is a data leak.

## Cache-aside

```rust
pub async fn list_tasks(
    user: CurrentUser,
    State(state): State<AppState>,
) -> Result<Json<Vec<Task>>, ApiError> {
    let key = format!("tasks:v1:{}", user.id);
    if let Some(cached) = state.cache.get(&key).await? {
        return Ok(Json(cached));
    }
    let tasks = state.store.list_owned(user.id).await?;
    state.cache.set(&key, &tasks, Duration::from_secs(30)).await?;
    Ok(Json(tasks))
}
```

`cache.get` and `cache.set` are a trait, not a direct Redis call:

```rust
#[async_trait]
pub trait Cache: Send + Sync {
    async fn get(&self, key: &str) -> Result<Option<Vec<Task>>, TodoError>;
    async fn set(&self, key: &str, value: &[Task], ttl: Duration) -> Result<(), TodoError>;
    async fn delete(&self, key: &str) -> Result<(), TodoError>;
}
```

A `NoopCache` returns misses; a `MemoryCache` is a map with expiries for tests;
a `RedisCache` uses the client. The API depends on the trait.

## Invalidate on write

`create`, `done`, `tag`, and any future delete call `cache.delete` after the
database write. Delete, do not update: the next read fills the value from the
source of truth, and a race cannot leave two writers disagreeing.

If Redis is down, the delete fails; log it and continue. A stale cache entry
expires in 30 seconds; the write is already durable.

## The limiter

```rust
pub async fn check_login(&self, email: &str) -> Result<(), TodoError> {
    let key = format!("login:{email}");
    let count = self.redis.incr(&key).await?;
    if count == 1 {
        self.redis.expire(&key, 60).await?;
    }
    if count > 5 {
        return Err(TodoError::RateLimited);
    }
    Ok(())
}
```

The counter is per email. An attacker can rotate emails; add a per-IP counter
as a second dimension, and keep both windows short. A 429 response includes
`Retry-After`.

`INCR` and `EXPIRE` are two calls. A crash between them leaves a key without a
TTL; use a Lua script or `SET key 1 EX 60 NX` followed by `INCR` in one
transaction. The exact mechanism matters less than the invariant: the key must
expire.

## Failure paths

| Failure | Behavior |
| --- | --- |
| Redis down on read | miss; read Postgres |
| Redis down on write | log; write is durable |
| Redis down on limit | allow, or fail closed? |
| Redis slow | timeout, then fall back |

For login, failing **open** is a risk: an attacker who can take Redis down
bypasses the limiter. For a course, log and allow; for a bank, fail closed or
use a local fallback. Make the choice explicit.

For the task list, failing **closed** is unnecessary: the database is the truth.

## Metrics

Add a cache hit/miss counter and a Redis error counter. A cache with a 0% hit
rate is a cost with no benefit; a limiter with no errors may not be running.

The existing `/metrics` endpoint can expose:

<!-- transcripts: authored -->
```text
todo_cache_hits_total
todo_cache_misses_total
todo_redis_errors_total
```

## In the app

The API's task read is the first cache. The web UI's page render uses the same
API? It calls the store directly today; move it to the same cache layer or let
it read the database. A cache is not free consistency; one client with a
short TTL is easier to reason about than two.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 68: redis in the app"
```

## If something went wrong

**Every request is a miss.** The key changes per request (a timestamp or a
random id); or the TTL is zero. Log the key.

**The cache returns old tasks after a write.** The write path does not delete
the key. Add `cache.delete` after every mutation.

**The limiter blocks a legitimate user.** Five attempts is too low for a shared
office IP; key by email **and** IP, and give a clear retry time.

**Redis memory grows.** Keys lack TTLs. Set a maxmemory policy and a default
TTL; audit keys without `TTL`.

**The app fails when Redis is down.** The cache call is not optional. Wrap it
in a timeout and fall back to the store.

## Going deeper: cache consistency

A cache is a copy. Every copy can be wrong; the design decides how wrong and for
how long. TTL bounds the staleness; delete-on-write bounds it further; a
versioned key bounds it at deploy time.

Do not cache the authorization decision itself unless the key includes every
input. A cached "user 1 can see task 1" is a permission bypass when task 1
changes owner.

