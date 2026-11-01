---
title: "Day 53 — The API client"
description: "Give the TUI a typed HTTP client — bearer auth, JSON, status mapping — and test it against a real server on an ephemeral port. — Day 53 of 100 Days of Rust."
sidebar:
  order: 53
day: 53
---

**About 2 hours** · Part IX, day 4 of 5.

**You'll be able to:**

- wrap the task endpoints in an `ApiClient`;
- map HTTP failures to `TodoError`;
- run an integration test against a real Axum server.

---

The TUI reads the SQLite file directly. That works on the same machine, but the
server is the app's real boundary: auth, validation, ownership, and JSON live
there. A remote TUI needs a client.

Today we build `ApiClient` and let the TUI use it when `TODO_API` and
`TODO_TOKEN` are set.

## The client

Create `src/client.rs`:

<!-- verify: src/client.rs at=day-53 -->
```rust title="src/client.rs"
use reqwest::Client;
use serde_json::json;

use crate::error::TodoError;
use crate::task::Task;

/// A typed HTTP client for the task API.
#[derive(Debug, Clone)]
pub struct ApiClient {
    base: String,
    token: String,
    http: Client,
}

impl ApiClient {
    /// Build a client for an API base URL and bearer token.
    pub fn new(base: impl Into<String>, token: impl Into<String>) -> Self {
        Self {
            base: base.into(),
            token: token.into(),
            http: Client::new(),
        }
    }
```

`reqwest::Client` owns a connection pool. Cloning `ApiClient` clones the pool
handle, not the sockets. Build one client and reuse it; do not create a client
per request.

## List

<!-- verify: src/client.rs at=day-53 -->
```rust title="src/client.rs"
    /// List the current user's tasks.
    pub async fn list(&self) -> Result<Vec<Task>, TodoError> {
        let response = self
            .http
            .get(format!("{}/api/v1/tasks", self.base))
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|error| TodoError::Io(error.to_string()))?;
        let response = check(response)?;
        response
            .json()
            .await
            .map_err(|error| TodoError::Json(error.to_string()))
    }
```

`bearer_auth` adds `Authorization: Bearer <token>`. The response is parsed into
`Vec<Task>`; the server's JSON matches the task model's serde derives.

`check` maps the status:

<!-- verify: src/client.rs at=day-53 -->
```rust title="src/client.rs"
fn check(response: reqwest::Response) -> Result<reqwest::Response, TodoError> {
    if response.status().is_success() {
        return Ok(response);
    }
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(TodoError::Unauthorized);
    }
    Err(TodoError::Db(format!("API returned {}", response.status())))
}
```

A 401 becomes `Unauthorized`, the same error the CLI and web use. Other failures
become a database-style error with the status; a richer client would parse
problem+json and keep the detail.

## Add and done

<!-- verify: src/client.rs at=day-53 -->
```rust title="src/client.rs"
    /// Add a task.
    pub async fn add(&self, title: &str) -> Result<Task, TodoError> {
        let response = self
            .http
            .post(format!("{}/api/v1/tasks", self.base))
            .bearer_auth(&self.token)
            .json(&json!({ "title": title }))
            .send()
            .await
            .map_err(|error| TodoError::Io(error.to_string()))?;
        let response = check(response)?;
        response
            .json()
            .await
            .map_err(|error| TodoError::Json(error.to_string()))
    }
```

`done` is the same shape with `POST /api/v1/tasks/{id}/done` and no body. Each
method returns the server's task, so the local view can replace its copy with
the authoritative one.

## The TUI chooses a source

<!-- verify: src/bin/todo-tui.rs at=day-53 -->
```rust title="src/bin/todo-tui.rs"
    let tasks = match (std::env::var("TODO_API"), std::env::var("TODO_TOKEN")) {
        (Ok(base), Ok(token)) => ApiClient::new(base, token).list().await?,
        _ => store.list().await?,
    };
```

With both variables set, the TUI talks to the API. Without them, it reads the
local database. That keeps the zero-setup local flow and gives the remote flow
a real path.

The TUI still toggles locally; the next lesson wires the toggle back through
the client. Reading is the first half.

## The integration test

<!-- verify: src/client.rs at=day-53 -->
```rust title="src/client.rs"
    #[tokio::test]
    async fn client_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let url = format!("sqlite://{}", dir.path().join("todo.db").display());
        let store = SqliteStore::open(&url).await.unwrap();
        let hash = auth::hash_password("secret").unwrap();
        let user_id = store
            .create_user("client@example.com", &hash)
            .await
            .unwrap();
        let token = auth::new_token();
        store
            .create_session(user_id, &auth::token_hash(&token), "2099-01-01T00:00:00Z")
            .await
            .unwrap();

        let app = api::router(store);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let client = ApiClient::new(format!("http://{addr}"), token);
        let task = client.add("buy milk").await.unwrap();
        assert_eq!(task.title, "buy milk");
        assert_eq!(client.list().await.unwrap().len(), 1);
        let done = client.done(task.id).await.unwrap();
        assert!(done.is_done());
    }
```

The test starts the real router on port 0 (an ephemeral port), creates a user
and session directly, and drives the client. It exercises the HTTP stack, JSON,
auth, and the database — not a mock.

The spawned server lives until the test process ends. For one test, that is
fine; a larger suite would keep a shutdown handle.

## Run it

```bash
$ cargo test
...
test client::tests::client_round_trip ... ok
...
```

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 53: fetch tasks through an API client"
[main ...] day 53: fetch tasks through an API client
 48 files changed, 7471 insertions(+)
...
$ git log --oneline
... day 53: fetch tasks through an API client
```

## If something went wrong

**`connection refused`.** The server is not running, or the `TODO_API` base URL
is wrong. Start `todo-server` and use its printed address.

**A 401.** The token is missing, expired, or belongs to another database. Log
in again and pass the new token.

**`error decoding response body`.** The client and server disagree about the
JSON shape. Check the `Task` fields and the endpoint's response.

**TLS errors.** The local test uses HTTP. For HTTPS, enable the rustls feature
and trust the certificate; do not disable verification.

**The test hangs.** The server task is running, but the client is waiting on a
response that never comes. Check the route and whether the handler is blocked.

**The TUI uses the wrong source.** Both `TODO_API` and `TODO_TOKEN` must be set.
One alone falls back to the local database.

## Going deeper: clients are seams

`ApiClient` is a seam between the TUI and the server. The TUI could take a
trait object instead of a concrete client, and tests could use a fake. At this
size, a real server on an ephemeral port is simpler and tests more of the
stack.

The client does not retry. A retry policy needs idempotency keys and a budget;
the production ground covers retries and backoff. For now, a failed request is
reported, not repeated.

The next lesson adds TUI logging and snapshot tests, then Part X ships the
whole thing.

<div class="day-tracker" data-day="53"></div>
