---
title: "Day 38 — Axum hello and health"
description: "Put the store behind an Axum router, serve a health endpoint that checks the database, and add a todo-server binary. — Day 38 of 100 Days of Rust."
sidebar:
  order: 38
day: 38
---

**About 2 hours** · Part VII, day 1 of 5.

**You'll be able to:**

- build a router with shared state;
- write a health handler that checks the store;
- serve the app with Tokio and test it with `oneshot`.

---

The database is ready. Today it gets an HTTP face: an Axum router with a
health endpoint, and a `todo-server` binary that binds a port.

The health endpoint is deliberately more than `{"ok": true}`: it asks the
store for the task list. If the database is down, the endpoint returns 503.
That is the difference between "the process is alive" and "the process can do
its job."

## Add Axum

<!-- verify: Cargo.toml at=day-38 -->
```toml title="Cargo.toml"
axum = "0.8"
```

`axum` builds on Tokio, which the app already uses. `tower-http` is already in
the dependency list for the middleware lesson; it is not used yet.

## The router

Create `src/api.rs`:

<!-- verify: src/api.rs at=day-38 -->
```rust title="src/api.rs"
use std::sync::Arc;

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::db::SqliteStore;

#[derive(Clone)]
struct AppState {
    store: Arc<SqliteStore>,
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
}

/// Build the HTTP router for the task API.
pub fn router(store: SqliteStore) -> Router {
    let state = AppState {
        store: Arc::new(store),
    };

    Router::new()
        .route("/health", get(health))
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> Result<Json<Health>, axum::http::StatusCode> {
    state
        .store
        .list()
        .await
        .map_err(|_| axum::http::StatusCode::SERVICE_UNAVAILABLE)?;
    Ok(Json(Health { status: "ok" }))
}
```

`Router` maps a method and path to a handler. `with_state` attaches the shared
state; `State<AppState>` extracts it. `AppState` is `Clone` because Axum clones
it per request; the store sits behind `Arc`, so the clone is cheap.

`health` returns `Result<Json<Health>, StatusCode>`. `?` on the store error is
not available because the error type is not `StatusCode`, so `map_err`
converts it to 503. A health check that hides a database failure is worse than
no health check.

## The server binary

Create `src/bin/todo-server.rs`:

<!-- verify: src/bin/todo-server.rs at=day-38 -->
```rust title="src/bin/todo-server.rs"
use std::net::SocketAddr;

use todo::SqliteStore;
use todo::api::router;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db = std::env::var("TODO_DB").unwrap_or_else(|_| "sqlite://todo.db".to_string());
    let store = SqliteStore::open(&db).await?;
    let app = router(store);

    let addr: SocketAddr = std::env::var("TODO_API_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8080".to_string())
        .parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;

    println!("listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
```

`#[tokio::main]` starts the runtime. `TODO_DB` is a SQLite URL, not a plain
path; `sqlite://todo.db` is relative, `sqlite:///var/lib/todo.db` is absolute.
`TODO_API_ADDR` is the listen address. Both have defaults for a quick local
run.

`Box<dyn std::error::Error>` lets `main` use `?` on both `TodoError` and the
address parse error. A production binary might use a typed error and a cleaner
shutdown; that comes in the deployment lesson.

## Test without a port

<!-- verify: src/api.rs at=day-38 -->
```rust title="src/api.rs"
    #[tokio::test]
    async fn health_is_ok() {
        let (_dir, app) = test_app().await;
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }
```

`tower::ServiceExt::oneshot` sends one request through the router without
binding a socket. That is faster and more reliable than starting a server for
every test. `test_app()` creates a temporary database and a router.

## Run it

```bash
$ cargo test
...
test api::tests::health_is_ok ... ok
...
```

```bash
$ cargo run --bin todo-server
listening on http://127.0.0.1:18080
```

The terminal block above was run with `TODO_API_ADDR=127.0.0.1:18080`; the
default is `127.0.0.1:8080`. In another terminal:

<!-- transcripts: authored -->
```bash
$ curl -s http://127.0.0.1:18080/health
{"status":"ok"}
```

Stop the server with Ctrl-C. It has no graceful shutdown yet; that is a later
lesson.

## Save your work

```bash
$ git add -A
$ git commit -m "day 38: serve a health endpoint"
[main (root-commit) ...] day 38: serve a health endpoint
 37 files changed, 4439 insertions(+)
...
$ git log --oneline
... day 38: serve a health endpoint
```

## If something went wrong

**`Address already in use`.** Another process owns the port. Pick another
`TODO_API_ADDR`, or stop the old server.

**`unable to open database file`.** The SQLite URL is wrong or the parent
directory does not exist. Use an absolute path with `sqlite:///`.

**`/health` returns 503.** The store failed; the response hides the reason on
purpose. Check the server logs or open the database by hand.

**`404` on `/health`.** The route is missing, or you are hitting the wrong
port. The server prints the address it bound.

**`#[tokio::main]` not found.** The `macros` feature of Tokio is missing.

**The test hangs.** A handler is waiting on a lock or a database connection.
Keep the test database small and the transactions short.

## Going deeper: liveness and readiness

A **liveness** check says "the process is running"; a **readiness** check says
"it can serve traffic." A database query belongs in readiness, not liveness: a
temporary database outage should remove the instance from the load balancer,
not restart it.

This endpoint is a readiness check. In a container, the distinction matters:
a liveness probe that restarts on a database blip creates a crash loop.

Axum's `State` is just one extractor. The next lessons add JSON bodies, path
parameters, and middleware. The shape stays: a router, shared state, and
handlers that return typed responses.

<div class="day-tracker" data-day="38"></div>
