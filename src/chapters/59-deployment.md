---
title: Deployment
day: 59
part: X
partName: Shipping it
partDay: 4
partDays: 5
time: "2.5 hours"
description: Run the server under systemd, put Caddy in front for TLS, and write the backup and rollback steps before the first deploy.
bullets:
  - write a systemd unit with a non-root user and a read-only filesystem;
  - terminate TLS at Caddy and proxy to localhost;
  - back up the database and have a rollback path.
---

The app runs on a laptop. Production is a different machine: a service user, a
unit file, a TLS terminator, a backup, and a runbook.

Today those become files in `deploy/`.

## The unit

<!-- verify: deploy/todo.service at=day-59 -->
```ini title="deploy/todo.service"
[Unit]
Description=todo server — 100 Days of Rust
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=todo
Group=todo
WorkingDirectory=/var/lib/todo
StateDirectory=todo
EnvironmentFile=/etc/todo/todo.env
ExecStart=/usr/local/bin/todo-server
Restart=on-failure
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/todo
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

The service runs as `todo`, not root. `StateDirectory=todo` creates
`/var/lib/todo` with the right ownership. `ProtectSystem=strict` makes the rest
of the filesystem read-only; `ReadWritePaths` opens exactly the state directory.
`ProtectHome` hides home directories. `NoNewPrivileges` blocks setuid
escalation.

`EnvironmentFile` keeps secrets out of the unit. The file is `0600`, owned by
`root:todo`.

## The environment

<!-- verify: deploy/todo.env.example at=day-59 -->
```ini title="deploy/todo.env.example"
# Copy to /etc/todo/todo.env, then chmod 600 and chown root:todo.
TODO_DB=sqlite:///var/lib/todo/todo.db
TODO_API_ADDR=127.0.0.1:8080
RUST_LOG=todo=info
```

The database URL is absolute. The listener is loopback-only; Caddy is the
public edge. `RUST_LOG` is the operator's dial, not a code change.

## TLS at Caddy

<!-- verify: deploy/Caddyfile at=day-59 -->
```text title="deploy/Caddyfile"
todo.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}
```

Caddy obtains and renews the certificate, adds compression, and proxies to the
app. The app does not need to know about certificates, ports 80/443, or HTTP/2.

If you use nginx instead, the shape is the same: TLS at the edge, proxy to
`127.0.0.1:8080`, and set the forwarded headers the app trusts.

## The runbook

`deploy/RUNBOOK.md` holds the commands that should not be improvised:

````markdown title="deploy/RUNBOOK.md"
## Backup

```bash
install -d -m 700 /var/backups/todo
sqlite3 /var/lib/todo/todo.db ".backup '/var/backups/todo/todo-$(date -u +%Y%m%dT%H%M%SZ).db'"
```

Keep at least seven daily copies and one monthly copy. A backup is not a backup
until a restore has been tested.
````

The `sqlite3 .backup` command copies a consistent database while the service
runs. Copying the file with `cp` can catch a write in progress; the backup API
does not.

Restore is a stop, copy, chown, start, and health check. The runbook spells it
out because the person doing it may be tired and under pressure.

## Verify the unit

```bash
$ systemd-analyze verify deploy/todo.service
todo.service: Command /usr/local/bin/todo-server is not executable: No such file or directory
```

The only complaint is the binary path: the file is not installed on this
machine. The unit syntax and the security directives are accepted. On the
server, install the binary first and the message goes away.

## Deploy

<!-- transcripts: authored -->
```bash
$ sudo install -m 755 target/release/todo-server /usr/local/bin/todo-server
$ sudo systemctl daemon-reload
$ sudo systemctl enable --now todo
$ curl -fsS http://127.0.0.1:8080/health
{"status":"ok"}
```

## Save your work

```bash
$ git add -A
$ git commit -m "day 59: write the deployment files and runbook"
[main (root-commit) ...] day 59: write the deployment files and runbook
 58 files changed, 7809 insertions(+)
...
$ git log --oneline
... day 59: write the deployment files and runbook
```

## If something went wrong

**The service exits immediately.** Check `journalctl -u todo -n 100`. The usual
causes are a missing binary, a bad `TODO_DB` path, or a permission denied on
`/var/lib/todo`.

**`status=203/EXEC`.** The binary is missing or not executable. Install it at
the path in `ExecStart`.

**The database is read-only.** `ReadWritePaths` does not include the database
directory, or the `todo` user does not own it. Fix the ownership; do not run as
root.

**Caddy returns 502.** The app is not listening on `127.0.0.1:8080`, or the
proxy target is wrong. Check `systemctl status todo` and `curl` locally.

**The certificate fails.** The domain's DNS does not point at the host, or ports
80/443 are blocked. Caddy needs both for the HTTP challenge.

**A rollback crosses a migration.** Restoring the old binary against a newer
schema can fail. Restore the database backup from before the deploy, or write a
forward fix. Migrations are forward-only.

**The backup is empty.** `sqlite3 .backup` failed silently because the path was
wrong. Check the file size and run a test restore.

## Going deeper: immutable infrastructure

A hand-installed binary on a pet server is fine for a course. At scale, the
binary and the unit are built into an image, the image is deployed by a
controller, and the database is a managed service. The same files exist; they
are inputs to a build, not commands typed on a host.

The security directives in the unit are a small sandbox. A container adds a
namespace and a read-only root filesystem; a VM adds a kernel boundary. The
production ground covers containers and Kubernetes.

The release lesson packages the binary; this lesson makes it run.

