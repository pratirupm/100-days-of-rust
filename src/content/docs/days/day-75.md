---
title: "Day 75 — Kubernetes"
description: "Run a single-node cluster with Kind or k3d, deploy the server with a Deployment and Service, and give the database a persistent volume. — Day 75 of 100 Days of Rust."
sidebar:
  order: 15
day: 75
---

**About 3 hours** · Production ground, day 15 of 30.

**You'll be able to:**

- create a local cluster with Kind or k3d;
- apply a Deployment, Service, and PersistentVolumeClaim;
- check readiness, logs, and a rollout.

---

Kubernetes is a scheduler, a service registry, and a reconciliation loop. The
app's container is the unit; a Deployment keeps the desired number running, and
a Service gives it a stable name.

Today the app runs on a local cluster.

## Create a cluster

<!-- transcripts: authored -->
```bash
$ export KIND_EXPERIMENTAL_PROVIDER=podman
$ kind create cluster --name todo
$ kubectl cluster-info --context kind-todo
$ kubectl get nodes
NAME                  STATUS   ROLES           AGE
todo-control-plane    Ready    control-plane   ...
```

Kind runs the control plane in a container. The environment variable selects
Podman instead of Docker; on a rootless host, kind may still need extra
privileges. k3d is the k3s equivalent. If the provider needs privileges, use a
disposable VM instead of weakening the host.

Load the app image into the cluster:

<!-- transcripts: authored -->
```bash
$ kind load docker-image todo-server:0.1 --name todo
```

The cluster cannot pull a local image by name; loading copies it into the
node's image store.

## The Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: todo-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: todo-server
  template:
    metadata:
      labels:
        app: todo-server
    spec:
      containers:
        - name: server
          image: todo-server:0.1
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: todo-config
          env:
            - name: TODO_DB
              value: sqlite:///data/todo.db
          volumeMounts:
            - name: data
              mountPath: /data
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 2
            periodSeconds: 5
          livenessProbe:
            tcpSocket:
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: todo-data
```

`readinessProbe` decides whether the Service sends traffic. `livenessProbe`
decides whether the kubelet restarts the container. A database blip should fail
readiness, not liveness; a restart loop on a transient DB outage is worse than
being temporarily out of rotation.

## The Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: todo-server
spec:
  selector:
    app: todo-server
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP
```

A `ClusterIP` is reachable inside the cluster. An Ingress or a port-forward
exposes it locally:

<!-- transcripts: authored -->
```bash
$ kubectl port-forward svc/todo-server 8080:80
$ curl -s http://127.0.0.1:8080/health
{"status":"ok"}
```

## The volume

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: todo-data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
```

`ReadWriteOnce` is one node, not one pod. A Deployment with `replicas: 1` and a
SQLite file is consistent with that; two replicas would race on the file.

Postgres is the production answer for multiple replicas. The lesson's point is
the manifest shape, not pretending SQLite scales.

## Config and secrets

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: todo-config
data:
  TODO_API_ADDR: "0.0.0.0:8080"
  RUST_LOG: "todo=info"
---
apiVersion: v1
kind: Secret
metadata:
  name: todo-secret
type: Opaque
stringData:
  TODO_TOKEN: "change-me"
```

A Secret is base64, not encryption. Use `kubectl create secret` from a file,
enable encryption at rest, and restrict RBAC. The app reads the value as an
environment variable; the manifest is not the secret store.

## Rollout

<!-- transcripts: authored -->
```bash
$ kubectl apply -f deploy/k8s/
$ kubectl rollout status deployment/todo-server
$ kubectl get pods
$ kubectl logs deploy/todo-server --tail=50
$ kubectl rollout undo deployment/todo-server
```

`rollout status` waits for the new pods to become ready. `rollout undo` returns
to the previous ReplicaSet. The database migration is not rolled back by the
manifest; the pre-deploy backup is the rollback for schema changes.

## In the app

The server's health endpoint is the probe. The metrics endpoint is a scrape
target. The WebSocket route needs sticky sessions or a shared broadcast when
there is more than one replica; a `Service` load-balances each connection to a
pod, and a client reconnecting may land on another pod.

The local Podman pod and the Kubernetes Pod share the network idea. The
Kubernetes Service replaces the pod's published port; the Deployment replaces
`podman run`.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 75: kubernetes"
```

## If something went wrong

**The pod is `ImagePullBackOff`.** The image is not in the cluster. `kind load`
or push it to a registry the cluster can reach.

**The pod is `CrashLoopBackOff`.** Read `kubectl logs` and
`kubectl describe pod`. The usual causes are a bad database URL, a missing
volume, or a migration failure.

**Readiness never passes.** The probe path or port is wrong, or the server binds
`127.0.0.1` instead of `0.0.0.0`.

**The volume is not bound.** The StorageClass is missing or the claim requests
more than the class offers. Check `kubectl get pvc`.

**Two replicas corrupt SQLite.** SQLite is one writer, one file. Use one replica
or move to Postgres.

**`rollout undo` does not fix the schema.** Restore the backup, or ship a
forward migration. Kubernetes rolls back pods, not data.

## Going deeper: controllers and desired state

A Deployment is a desired state: three replicas, this image, these probes. The
controller compares the actual state and acts. That is why `kubectl apply` is
idempotent and why a killed pod comes back.

Stateful workloads need a StatefulSet, stable network identities, and a
database operator. The app's SQLite file is a teaching compromise; Postgres is
the production shape.

The next lesson runs the app's own Deployment in the cluster; after that the
cloud dependency moves to LocalStack: S3 and SQS without a bill.

<div class="day-tracker" data-day="75"></div>
