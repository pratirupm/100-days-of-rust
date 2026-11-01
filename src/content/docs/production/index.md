---
title: Production ground
description: "The 30 days after the app: containers, PostgreSQL, Redis, Kafka, gRPC, WebSockets, Kubernetes, AWS with LocalStack, microservices, distributed systems, observability, performance, and security."
sidebar:
  label: Overview
  order: 0
---

The first sixty days build the whole application and stop at the door of
production. The next thirty walk through it. This is not a new app: every
topic extends the same `todo` service, and every lab runs locally in Podman.
Cloud accounts are optional.

Each topic gets two days: one for the concepts and the local setup, one for
wiring it into the app. The days are numbered 61–90, but they can be taken
in any order once the app is complete.

**How to read this track.** The reference app is the 60-day SQLite
application. Its container, CI, deployment, and supply-chain files exist in the
project. The service integrations — a Postgres store, Redis cache, Kafka
outbox, gRPC service, WebSocket route, Kubernetes manifests, notification
service, retry layer, and metrics exporter — are designs you implement in your
own copy. The code shows the shape and the failure modes; it is not compiled
into the reference app's check. Commands that depend on those additions say so.

## The topics

- **Containers** — Podman, images, layers, and a container for `todo-server`.
- **Compose and local stacks** — networks, volumes, and the server plus its
  database on one command.
- **CI/CD** — GitHub Actions, caching, matrices, and checks that run what
  the book runs.
- **PostgreSQL** — roles, indexes, and the real SQLite-to-Postgres swap.
- **Redis** — caching, TTLs, rate limits, and session storage.
- **Kafka/Redpanda** — topics, producers, consumers, and task events.
- **gRPC** — Protobuf, `tonic`, status codes, and a typed task service.
- **WebSockets** — upgrades, frames, backpressure, and live updates.
- **Kubernetes** — pods, deployments, services, and a Kind/k3d cluster.
- **AWS with LocalStack** — S3, SQS, and IAM-shaped policy without a bill.
- **Microservices** — seams, contracts, and a notification service.
- **Distributed systems** — retries, idempotency, ordering, and what
  "exactly once" really means.
- **Observability at scale** — metrics, traces, dashboards, and alerting.
- **Performance and load** — profiling, load tests, and budgets.
- **Security and supply chain** — threat modeling, SBOMs, secrets, and the
  audit that proves the hardening.
- **Operations and the capstone** — SLOs, on-call, backups, and a rehearsal of
  the whole stack.

## The days

- [61 — Containers with Podman](/100-days-of-rust/days/day-61/) · [62 — Pods and local stacks](/100-days-of-rust/days/day-62/)
- [63 — CI/CD](/100-days-of-rust/days/day-63/) · [64 — CI matrices and releases](/100-days-of-rust/days/day-64/)
- [65 — PostgreSQL](/100-days-of-rust/days/day-65/) · [66 — PostgreSQL in the app](/100-days-of-rust/days/day-66/)
- [67 — Redis](/100-days-of-rust/days/day-67/) · [68 — Redis in the app](/100-days-of-rust/days/day-68/)
- [69 — Kafka and Redpanda](/100-days-of-rust/days/day-69/) · [70 — Task events in the app](/100-days-of-rust/days/day-70/)
- [71 — gRPC](/100-days-of-rust/days/day-71/) · [72 — gRPC in the app](/100-days-of-rust/days/day-72/)
- [73 — WebSockets](/100-days-of-rust/days/day-73/) · [74 — Live task updates](/100-days-of-rust/days/day-74/)
- [75 — Kubernetes](/100-days-of-rust/days/day-75/) · [76 — The app on Kubernetes](/100-days-of-rust/days/day-76/)
- [77 — AWS with LocalStack](/100-days-of-rust/days/day-77/) · [78 — Backups and jobs in the cloud](/100-days-of-rust/days/day-78/)
- [79 — Microservices](/100-days-of-rust/days/day-79/) · [80 — The notification service](/100-days-of-rust/days/day-80/)
- [81 — Distributed systems](/100-days-of-rust/days/day-81/) · [82 — Retries and idempotency in the app](/100-days-of-rust/days/day-82/)
- [83 — Observability at scale](/100-days-of-rust/days/day-83/) · [84 — Dashboards and alerts for the app](/100-days-of-rust/days/day-84/)
- [85 — Performance and load](/100-days-of-rust/days/day-85/) · [86 — The optimization pass](/100-days-of-rust/days/day-86/)
- [87 — Supply chain](/100-days-of-rust/days/day-87/) · [88 — Security incidents](/100-days-of-rust/days/day-88/)
- [89 — Operations](/100-days-of-rust/days/day-89/) · [90 — The production capstone](/100-days-of-rust/days/day-90/)

## What you need

- The finished app from Day 60.
- Podman. Everything runs rootless on your machine.
- Optional for specific labs: the AWS CLI and `jq` for LocalStack, `kubectl`
  and Kind or k3d for Kubernetes, and `oha`/`perf` for the load lessons. Each
  lab names the tool it needs.
- Optional: a GitHub account for the CI/CD days, and a cloud account only if
  you want to repeat the LocalStack exercises for real.
