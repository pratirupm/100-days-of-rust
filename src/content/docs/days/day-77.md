---
title: "Day 77 — AWS with LocalStack"
description: "Run LocalStack, create an S3 bucket and an SQS queue, and learn the AWS shapes without a cloud bill. — Day 77 of 100 Days of Rust."
sidebar:
  order: 17
day: 77
---

**About 2.5 hours** · Production ground, day 17 of 30.

**You'll be able to:**

- run LocalStack in a container;
- use the AWS CLI against a local endpoint;
- store a backup in S3 and send a message to SQS.

---

AWS is not one service; it is a catalog. The app needs two shapes: object
storage for backups and a queue for asynchronous work.

LocalStack implements the APIs locally. The commands are the real AWS CLI; only
the endpoint changes.

## Run it

<!-- transcripts: authored -->
```bash
$ podman run -d --name todo-localstack -p 4566:4566 \
    -e SERVICES=s3,sqs docker.io/localstack/localstack:stable
$ until curl -fsS http://127.0.0.1:4566/_localstack/health >/dev/null; do sleep 1; done
$ curl -s http://127.0.0.1:4566/_localstack/health | jq
```

The container publishes its own port; it does not need to join the todo pod.
The health endpoint lists the enabled services. Keep the surface small:
enabling every service makes startup slow and memory hungry.

## Credentials

<!-- transcripts: authored -->
```bash
$ export AWS_ACCESS_KEY_ID=test
$ export AWS_SECRET_ACCESS_KEY=test
$ export AWS_DEFAULT_REGION=us-east-1
$ export AWS_ENDPOINT_URL=http://127.0.0.1:4566
$ aws s3api list-buckets
```

LocalStack accepts fake credentials. The real AWS SDK reads the same variables;
`AWS_ENDPOINT_URL` is the only override. Never ship the test credentials to
production.

## S3

<!-- transcripts: authored -->
```bash
$ aws s3 mb s3://todo-backups
$ aws s3 cp todo.db s3://todo-backups/todo.db
$ aws s3 ls s3://todo-backups/
2026-10-31 09:30:00      24576 todo.db
```

An object store is not a filesystem. Keys are flat, writes are whole objects,
and a bucket name is globally unique in real AWS. Versioning and lifecycle
rules are the backup policy:

<!-- transcripts: authored -->
```bash
aws s3api put-bucket-versioning --bucket todo-backups \
  --versioning-configuration Status=Enabled
```

A backup to S3 is durable only when the upload completed and the object is
readable. Check the checksum, not just the exit code.

## SQS

<!-- transcripts: authored -->
```bash
$ aws sqs create-queue --queue-name todo-jobs
$ QUEUE=$(aws sqs get-queue-url --queue-name todo-jobs --query QueueUrl --output text)
$ aws sqs send-message --queue-url "$QUEUE" --message-body '{"task":1}'
$ aws sqs receive-message --queue-url "$QUEUE" --max-number-of-messages 1
$ aws sqs delete-message --queue-url "$QUEUE" --receipt-handle "..."
```

SQS is at-least-once. A consumer receives a message, processes it, and deletes
it with the receipt handle. If it crashes before the delete, the message becomes
visible again after the visibility timeout.

A standard queue does not guarantee order. A FIFO queue does, with a message
group id. Most notification jobs do not need global order; per-task order is
enough.

## IAM-shaped policy

LocalStack does not enforce IAM by default. The policy shape still matters:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject"],
    "Resource": "arn:aws:s3:::todo-backups/*"
  }]
}
```

Grant the app only the bucket and the actions it uses. A wildcard policy is the
cloud version of running as root.

## In the app

The backup job writes a SQLite snapshot to S3. The notification job consumes
SQS messages. The server does not need AWS on the request path; both are
background work.

The `Store` trait does not change. Cloud services sit behind their own small
traits: `ObjectStore` and `Queue`. A local filesystem and an in-memory queue are
the test doubles.

## Costs and limits

LocalStack is free. Real AWS charges for storage, requests, and data transfer.
A backup every hour with 30-day retention is small; a queue with a runaway
producer is not.

Set a budget alarm before the first real deploy. The free tier is not a safety
net.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 77: aWS with LocalStack"
```

## If something went wrong

**The CLI cannot connect.** The endpoint URL is missing or the container is not
ready. Use `AWS_ENDPOINT_URL` and wait for the health endpoint.

**`InvalidBucketName`.** S3 bucket names are lowercase, 3–63 characters, and
globally unique in real AWS. LocalStack is more forgiving; do not rely on it.

**The SQS message is received twice.** At-least-once. The consumer must be
idempotent; delete only after the side effect.

**The message is invisible forever.** The visibility timeout is longer than the
job, or the consumer forgot to delete. Check the queue attributes.

**The S3 upload succeeds but the object is empty.** The file handle was not
flushed, or the wrong path was uploaded. Compare sizes and checksums.

**The LocalStack container uses too much memory.** Enable only the services you
need and give it a memory limit.

## Going deeper: the cloud is a set of APIs

LocalStack is useful because the AWS APIs are the contract, not the console.
The same SDK call works against the local endpoint and the real service.

The dangerous differences are the ones LocalStack does not model: IAM
enforcement, eventual consistency, throttling, and cost. A local pass is not a
production guarantee.

The next lesson wires the backup and the job queue into the app.

<div class="day-tracker" data-day="77"></div>
