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

## What you need

- The finished app from Day 60.
- Podman. Everything runs rootless on your machine.
- Optional: a GitHub account for the CI/CD days, and a cloud account only if
  you want to repeat the LocalStack exercises for real.
