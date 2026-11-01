---
title: "Day 62 — Pods and local stacks"
description: "Group the server and its future services in a Podman pod, share a network namespace, and bring the stack up and down as one unit. — Day 62 of 100 Days of Rust."
sidebar:
  order: 2
day: 62
---

**About 2 hours** · Production ground, day 2 of 30.

**You'll be able to:**

- create a pod with one published port;
- run the server inside the pod with a volume;
- stop and remove the whole stack with one command.

---

A container is one process. The app's production stack will be several:
server, PostgreSQL, Redis, and maybe a queue. Starting each with its own port
and network is work.

A **pod** is a group of containers that share a network namespace. Podman can
run one; Kubernetes schedules one. Today we use Podman's pod for the local
stack.

## Create the pod

<!-- transcripts: authored -->
```bash
$ podman pod create --name todo-pod -p 8080:8080
$ podman pod ps
POD ID        NAME      STATUS   CREATED   INFRA ID   # OF CONTAINERS
...           todo-pod  Running  ...       ...        1
```

A pod always has an **infra** container. It holds the network namespace and
keeps the pod alive even when the application containers restart. The infra
container is tiny; you do not manage it directly.

The published port is on the pod. Any container in the pod that listens on 8080
is reachable through that mapping; the containers do not need their own `-p`.

## Run the server in it

<!-- transcripts: authored -->
```bash
$ podman volume create todo-data
$ podman run -d --pod todo-pod --name todo-server \
    -v todo-data:/data todo-server:0.1
$ curl -s http://127.0.0.1:8080/health
{"status":"ok"}
```

`--pod todo-pod` joins the network namespace. `--name` gives the container a
stable DNS name inside the pod; a future Redis container can reach it as
`todo-server`.

## Add a service

The next lessons add PostgreSQL and Redis. In a pod, they talk over localhost:

<!-- transcripts: authored -->
```bash
$ podman run -d --pod todo-pod --name todo-redis docker.io/library/redis:7
$ podman exec todo-redis redis-cli ping
PONG
```

The app's Redis URL becomes `redis://127.0.0.1:6379` from inside the pod. No
host port, no cross-container DNS, no exposed service.

## Stop and remove

<!-- transcripts: authored -->
```bash
$ podman pod stop todo-pod
$ podman pod rm todo-pod
```

`pod rm` removes the containers in the pod, but not the named volumes. The
database survives. That is the same rule as a single container: state lives in
volumes, not in the container layer.

## Compose as an alternative

`compose.yaml` describes the same stack in a declarative file. Podman can run
it with a Compose provider; the exact command depends on the host. A minimal
file:

```yaml
services:
  server:
    image: todo-server:0.1
    ports:
      - "8080:8080"
    environment:
      TODO_DB: sqlite:///data/todo.db
    volumes:
      - todo-data:/data
volumes:
  todo-data:
```

The file is useful when the stack grows; a pod is enough for two or three
containers and a course.

## In the app

The server's environment is the only configuration the pod changes. The
database URL, the listen address, and the log level are already read from the
environment. A production stack sets them per container; the binary does not
need a new flag.

The pod does not replace the deployment unit. systemd starts the binary on a
single host; a pod starts containers. Both run the same image and the same
environment.

## If something went wrong

**The pod will not start.** The infra container is missing or the name is in
use. Run `podman pod ps -a` and remove the stale pod.

**The port is already published.** A pod port cannot be changed after creation;
create a new pod with a different `-p`.

**A container cannot reach another.** They are not in the same pod, or the
service is not listening on localhost. Check `podman pod ps` and the container's
listen address.

**The volume is empty after `pod rm`.** Named volumes are not removed by `pod
rm`; that is intentional. Remove it explicitly when you mean to delete data.

**The stack starts in the wrong order.** A pod starts containers in creation
order, not dependency order. The app must retry its database connection, or a
supervisor must wait for readiness.

**The pod uses too much memory.** Each container has its own limit; a pod is a
scheduling unit, not a resource limit. Set limits per container.

## Going deeper: pods and Kubernetes

A Kubernetes Pod is the same idea with a scheduler, a kubelet, and a control
plane. The local Podman pod is a useful preview: shared network, shared
lifecycle, one published port.

Kubernetes adds health probes, resource requests, secrets, and rollout
semantics. The deployment files in the Kubernetes lesson map one-to-one to the
pod commands here: a Deployment for the server, a Service for the port, a
PersistentVolumeClaim for the data.

<div class="day-tracker" data-day="62"></div>
