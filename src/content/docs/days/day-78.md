---
title: "Day 78 — Backups and jobs in the cloud"
description: "Put the SQLite snapshot in S3, send notification jobs through SQS, and keep both behind small traits so tests need no cloud. — Day 78 of 100 Days of Rust."
sidebar:
  hidden: true
day: 78
---

**About 2 hours** · Part Production ground, day 18 of 30.

**You'll be able to:**

- abstract object storage and the queue;
- back up on a timer and verify the checksum;
- consume jobs idempotently.

---

LocalStack ran the services. This lesson puts them behind the app's own small
traits and wires the background work.

## The traits

```rust
#[async_trait]
pub trait ObjectStore: Send + Sync {
    async fn put(&self, key: &str, bytes: Vec<u8>) -> Result<(), TodoError>;
    async fn get(&self, key: &str) -> Result<Vec<u8>, TodoError>;
}

#[async_trait]
pub trait Queue: Send + Sync {
    async fn send(&self, body: &str) -> Result<(), TodoError>;
    async fn receive(&self) -> Result<Option<(String, String)>, TodoError>;
    async fn delete(&self, receipt: &str) -> Result<(), TodoError>;
}
```

An `S3Store` and an `SqsQueue` implement them with the AWS SDK. A
`MemoryObjectStore` and an in-memory queue are the tests. The backup job and the
consumer depend on the traits.

## The backup

```rust
async fn backup(store: &SqliteStore, objects: &dyn ObjectStore) -> Result<(), TodoError> {
    let bytes = store.snapshot_bytes().await?;
    let key = format!("todo-{}.db", Utc::now().format("%Y%m%dT%H%M%SZ"));
    objects.put(&key, bytes.clone()).await?;
    let read_back = objects.get(&key).await?;
    if read_back != bytes {
        return Err(TodoError::Io("backup checksum mismatch".into()));
    }
    Ok(())
}
```

The read-back is not paranoia; it catches a truncated upload, a wrong key, and a
misconfigured bucket. A backup that was never read is a hope.

Schedule it with a timer, a systemd timer, or a Kubernetes CronJob. Keep the
last N copies and one monthly copy; prune with a lifecycle rule.

## The job

When a task is created, enqueue a notification job:

```rust
queue.send(&serde_json::to_string(&Job::TaskCreated { id, owner })?).await?;
```

The enqueue is after the database commit; a crash can lose the job. For a
notification, that is acceptable; for a payment, use the outbox from the Kafka
lesson. The same pattern applies with SQS: an outbox row and a relay.

## The consumer

```rust
loop {
    let Some((body, receipt)) = queue.receive().await? else { continue };
    let job: Job = serde_json::from_str(&body)?;
    handle(job).await?;
    queue.delete(&receipt).await?;
}
```

If `handle` fails, do not delete; the message returns after the visibility
timeout. Add a retry count and a dead-letter queue after a budget. A poison
message must not loop forever.

The handler is idempotent: the job carries an id, and the side effect checks a
`notifications` table before sending.

## Configuration

<!-- transcripts: authored -->
```text
AWS_ENDPOINT_URL=http://127.0.0.1:4566
TODO_BACKUP_BUCKET=todo-backups
TODO_JOB_QUEUE=todo-jobs
```

The endpoint is empty in production; the SDK uses the real AWS endpoints. The
bucket and queue names are config, not code.

## In the app

The backup is a background job, not a request handler. The queue consumer is a
separate binary or a task in the server; a separate process is easier to scale
and restart.

The API's request path stays free of cloud calls. A slow S3 upload must not make
`POST /tasks` slow.

## If something went wrong

**The backup is missing.** The timer is not running, or the bucket policy
denies `PutObject`. Check the job's logs, not just the app's.

**The backup is corrupt.** The read-back check should have caught it. If it did
not, the checksum comparison is wrong or the object store returned a cached
value.

**The consumer loops on one message.** The handler fails, the message returns,
and the retry budget is missing. Add a dead-letter queue.

**The job runs twice.** At-least-once. The idempotency table is missing or the
check is not in the same transaction as the side effect.

**LocalStack works, AWS fails.** IAM, region, bucket names, and endpoint
differences. Check the real policy and the error code.

**The queue grows without bound.** The producer is faster than the consumer, or
the consumer is down. Monitor the queue depth and the age of the oldest message.

## Going deeper: backups are a restore drill

A backup policy has three numbers: how often, how long, and how fast to restore.
The first two are easy; the third is the one that matters during an incident.

Run a restore into a scratch environment on a schedule. A backup that has never
been restored is a hypothesis.

The next lesson splits the notification work into a small service, the first
microservice boundary.

<div class="day-tracker" data-day="78"></div>
