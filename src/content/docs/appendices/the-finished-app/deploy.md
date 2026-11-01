---
title: "deploy — the finished app"
description: "The finished app, file by file: deploy (spoilers)."
sidebar:
  hidden: true
tableOfContents: false
pagefind: false
---


Part of [The finished app (spoilers)](/100-days-of-rust/appendices/the-finished-app/).


## `deploy/Caddyfile`

````text
todo.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}
````


## `deploy/RUNBOOK.md`

````markdown
# Runbook

## Deploy

1. Build the server binary on the pinned toolchain.
2. Install it at `/usr/local/bin/todo-server`.
3. Create the `todo` user and `/var/lib/todo`.
4. Copy `todo.env.example` to `/etc/todo/todo.env`, set `chmod 600` and
   `chown root:todo`.
5. Install `todo.service` at `/etc/systemd/system/todo.service`.
6. `systemctl daemon-reload && systemctl enable --now todo`.
7. Put Caddy in front of `127.0.0.1:8080` with `Caddyfile`.

## Health

```bash
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/metrics | head
systemctl status todo --no-pager
journalctl -u todo -n 100 --no-pager
```

## Backup

```bash
install -d -m 700 /var/backups/todo
sqlite3 /var/lib/todo/todo.db ".backup '/var/backups/todo/todo-$(date -u +%Y%m%dT%H%M%SZ).db'"
```

Keep at least seven daily copies and one monthly copy. A backup is not a backup
until a restore has been tested.

## Restore

```bash
systemctl stop todo
cp /var/backups/todo/todo-YYYYMMDDTHHMMSSZ.db /var/lib/todo/todo.db
chown todo:todo /var/lib/todo/todo.db
systemctl start todo
curl -fsS http://127.0.0.1:8080/health
```

## Rotate a secret

1. Create the new secret and add it to `/etc/todo/todo.env` beside the old one.
2. Restart the service.
3. Confirm the new value works.
4. Remove the old value and restart again.

## Roll back

```bash
systemctl stop todo
install -m 755 todo-server.previous /usr/local/bin/todo-server
systemctl start todo
```

Migrations are forward-only. A rollback that crosses a migration needs the
database backup from before the deploy.
````


## `deploy/todo.env.example`

````text
# Copy to /etc/todo/todo.env, then chmod 600 and chown root:todo.
TODO_DB=sqlite:///var/lib/todo/todo.db
TODO_API_ADDR=127.0.0.1:8080
RUST_LOG=todo=info
````


## `deploy/todo.service`

````ini
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
````
