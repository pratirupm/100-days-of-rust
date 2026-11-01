---
title: "Day 76 — The app on Kubernetes"
description: "Turn the local manifests into the app's deployment: config, secrets, a migration job, probes, and the WebSocket caveat. — Day 76 of 100 Days of Rust."
sidebar:
  order: 16
day: 76
---

**About 2 hours** · Production ground, day 16 of 30.

**You'll be able to:**

- separate config from secrets;
- run migrations before the rollout;
- handle sockets across replicas.

---

The cluster runs a toy Deployment. This lesson makes it the app: configuration,
secrets, a migration step, and the parts that do not fit a single replica.

## Configuration

The app reads `TODO_DB`, `TODO_API_ADDR`, and `RUST_LOG`. Put the non-secret
values in a ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: todo-config
data:
  TODO_API_ADDR: "0.0.0.0:8080"
  RUST_LOG: "todo=info"
```

The database URL depends on the environment: SQLite for the small deployment,
Postgres for the real one. Keep it in the ConfigMap when it contains no
password; move the password to a Secret.

## Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: todo-secret
type: Opaque
stringData:
  TODO_DB: "postgres://todo:CHANGE_ME@postgres:5432/todo"
```

Kubernetes does not expand shell variables in `stringData`; replace
`CHANGE_ME` or create the Secret from a file. Do not commit a real password:

<!-- transcripts: authored -->
```bash
kubectl create secret generic todo-secret --from-file=TODO_DB=./db-url.txt
```

A Secret is base64 in etcd. Enable encryption at rest and restrict who can read
it.

## Migrations

The server runs migrations at startup. With one replica that is fine. With
several, two pods can race the migration; the SQL runner locks, but the startup
latency and the failure mode are ugly.

A Kubernetes **Job** runs the migration once before the rollout:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: todo-migrate
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: todo-server:0.1
          command: ["/usr/local/bin/todo-server"]
          args: ["--migrate-only"]
          envFrom:
            - configMapRef:
                name: todo-config
            - secretRef:
                name: todo-secret
```

Add the `--migrate-only` mode first: it applies the schema and exits. The
reference server does not have that mode yet. The Deployment then starts with
migrations already done.

## Probes

`/health` checks the database. A readiness probe uses it; a liveness probe
should not restart the app on a database blip. Split them:

- `/health` — readiness (database reachable);
- `/live` — liveness (process responds).

The server can add a `/live` route that returns 200 without touching the
database. A liveness probe that checks the database creates a restart loop
during an outage.

## Sockets across replicas

A WebSocket is pinned to the pod that accepted it. A Service load-balances new
connections; a reconnect can land on another pod and miss events from the first.

Options:

- **sticky sessions** at the Ingress (cookie affinity);
- **shared broadcast** through Redis pub/sub or Kafka, with every pod
  publishing to its local sockets;
- **SSE with a shared bus** if the updates are one-way.

Sticky sessions reduce the problem; a shared bus removes it. For one replica,
neither is needed.

## The rollout

<!-- transcripts: authored -->
```bash
kubectl apply -f deploy/k8s/config.yaml
kubectl apply -f deploy/k8s/migrate-job.yaml
kubectl wait --for=condition=complete job/todo-migrate
kubectl apply -f deploy/k8s/deployment.yaml
kubectl rollout status deployment/todo-server
```

The order is the book's deploy order in miniature: config, migrate, rollout. A
failed migration stops the rollout; the old pods keep serving the old schema
only if it is backward-compatible.

## In the app

The container is the same image as the Podman lab. The difference is the
orchestrator: probes, a Service, a volume claim, and a rollout.

The metrics endpoint is a scrape target; the ServiceMonitor or a Prometheus
annotation wires it. The logs go to stdout/stderr; the cluster's log collector
reads them.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 76: the app on Kubernetes"
```

## If something went wrong

**The migration Job runs twice.** It is recreated by `apply`; use a unique name
or a Helm hook. The migration runner must be idempotent.

**The rollout replaces healthy pods during a DB outage.** Readiness fails, but
liveness passes; the old pods stay. If liveness checks the DB, they restart.

**A socket misses events after a reconnect.** The new pod has no local hub
state. Refetch the list on connect; treat the socket as a hint.

**The Secret is in the manifest.** Remove it from git; create it from a secret
store. Rotate it and restart.

**The PVC is bound to one node and the pod schedules elsewhere.** A local
volume is node-bound. Use a network volume or a database service.

## Going deeper: GitOps

The manifests are the desired state. A GitOps controller (Argo CD, Flux)
applies them from a project and reconciles drift. The deploy is a commit,
the rollback is a revert.

The app's manifests are small enough to read. A production repo adds
Kustomize overlays for dev/staging/prod, a policy check (no `latest` tags, no
root), and a secret delivery mechanism.

The next lesson moves the cloud services to LocalStack: S3 and SQS without an
AWS bill.

<div class="day-tracker" data-day="76"></div>
