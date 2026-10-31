---
title: "Day 39 — CRUD and validation"
description: "Add create, list, get, and done endpoints — with a 201, a 404, and one problem+json shape for every failure. — Day 39 of 100 Days of Rust."
sidebar:
  order: 39
day: 39
---

**About 2.5 hours** · Part VII, day 2 of 5.

**You'll be able to:**

- route CRUD operations on `/api/v1/tasks`;
- validate a title and return 422 in problem+json;
- test status codes and response bodies through the router.

---

The server has a health endpoint. Today it gets the task API: create, list,
get one, and mark one done.

The shape is REST-shaped, but the important part is the contract: which method,
which path, which status code, and which body. The tests pin all four.

## The routes

Extend the router in `src/api.rs`:

<!-- verify: src/api.rs at=day-39 -->
```rust title="src/api.rs"
/// Build the HTTP router for the task API.
pub fn router(store: SqliteStore) -> Router {
    let state = AppState {
        store: Arc::new(store),
    };

    Router::new()
        .route("/health", get(health))
        .route("/api/v1/tasks", get(list_tasks).post(create_task))
        .route("/api/v1/tasks/{id}", get(get_task))
        .route("/api/v1/tasks/{id}/done", post(done_task))
        .with_state(state)
}
```

Axum 0.8 uses `{id}` for a path parameter. The older `:id` syntax belongs to
0.7 and fails to match here.

`/api/v1` is a version prefix. A breaking change gets `/api/v2`; additive
changes stay in v1.

## The request body

<!-- verify: src/api.rs at=day-39 -->
```rust title="src/api.rs"
#[derive(Deserialize)]
struct CreateTask {
    title: String,
}
```

The JSON `{ "title": "buy milk" }` maps to this struct. A missing `title` is a
deserialization error, which Axum turns into a 422 by default. A present but
blank title reaches `TodoList::add`, which returns `TodoError::EmptyTitle`.

## The handlers

<!-- verify: src/api.rs at=day-39 -->
```rust title="src/api.rs"
async fn list_tasks(State(state): State<AppState>) -> Result<Json<Vec<Task>>, ApiError> {
    Ok(Json(state.store.list().await?))
}

async fn create_task(
    State(state): State<AppState>,
    Json(body): Json<CreateTask>,
) -> Result<(StatusCode, Json<Task>), ApiError> {
    let id = state.store.add(&body.title).await?;
    let task = state
        .store
        .find(id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("no task with id {id}")))?;
    Ok((StatusCode::CREATED, Json(task)))
}
```

`list_tasks` returns `200 OK` with a JSON array. `create_task` returns
`201 Created` and the created task, including its server-assigned id and UUID.

Why fetch the task after inserting it? The database assigns the id and the
store fills UUID and time. Returning the stored row is the honest response; a
hand-built body could drift from the database.

`get_task` and `done_task` follow the same pattern:

<!-- verify: src/api.rs at=day-39 -->
```rust title="src/api.rs"
async fn get_task(
    Path(id): Path<u32>,
    State(state): State<AppState>,
) -> Result<Json<Task>, ApiError> {
    let task = state
        .store
        .find(id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("no task with id {id}")))?;
    Ok(Json(task))
}

async fn done_task(
    Path(id): Path<u32>,
    State(state): State<AppState>,
) -> Result<Json<Task>, ApiError> {
    state.store.done(id).await?;
    let task = state
        .store
        .find(id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("no task with id {id}")))?;
    Ok(Json(task))
}
```

`Path(id)` extracts and parses the path segment. A non-numeric id is a 400 from
Axum before the handler runs.

## One error shape

<!-- verify: src/api.rs at=day-39 -->
```rust title="src/api.rs"
enum ApiError {
    BadRequest(String),
    NotFound(String),
    Internal(String),
}

impl From<TodoError> for ApiError {
    fn from(error: TodoError) -> Self {
        match error {
            TodoError::EmptyTitle => Self::BadRequest(error.to_string()),
            TodoError::NotFound(id) => Self::NotFound(format!("no task with id {id}")),
            other => Self::Internal(other.to_string()),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, title, detail) = match self {
            Self::BadRequest(detail) => (StatusCode::UNPROCESSABLE_ENTITY, "Invalid task", detail),
            Self::NotFound(detail) => (StatusCode::NOT_FOUND, "Task not found", detail),
            Self::Internal(detail) => (StatusCode::INTERNAL_SERVER_ERROR, "Internal error", detail),
        };
        let body = Json(json!({
            "type": "about:blank",
            "title": title,
            "status": status.as_u16(),
            "detail": detail,
        }));
        (
            status,
            [(header::CONTENT_TYPE, "application/problem+json")],
            body,
        )
            .into_response()
    }
}
```

This is **problem+json** (RFC 9457): a standard error body with a type, title,
status, and detail. Every failure looks the same, so a client needs one parser.

`From<TodoError>` maps the store's errors: a blank title is 422, a missing task
is 404, and everything else is 500. `?` in a handler triggers the conversion.

The content type is `application/problem+json`, not `application/json`. The
test checks it.

## The tests

<!-- verify: src/api.rs at=day-39 -->
```rust title="src/api.rs"
    #[tokio::test]
    async fn create_returns_201_and_the_task() {
        let (_dir, app) = test_app().await;
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/tasks")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"title":"buy milk"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CREATED);
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value["title"], "buy milk");
        assert_eq!(value["status"], "Pending");
        assert_eq!(value["uuid"].as_str().unwrap().len(), 36);
    }
```

The test sends a real HTTP request through the router and parses the response
body. It checks the status, the title, the status field, and the UUID shape.

The validation test checks the error contract:

<!-- verify: src/api.rs at=day-39 -->
```rust title="src/api.rs"
    #[tokio::test]
    async fn blank_title_returns_problem_json() {
        let (_dir, app) = test_app().await;
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/tasks")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"title":"   "}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "application/problem+json"
        );
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value["status"], 422);
        assert_eq!(value["title"], "Invalid task");
    }
```

## Try it with curl

<!-- transcripts: authored -->
```bash
$ cargo run --bin todo-server
listening on http://127.0.0.1:8080
$ curl -s -X POST http://127.0.0.1:8080/api/v1/tasks \
    -H 'content-type: application/json' -d '{"title":"buy milk"}'
{"id":1,"uuid":"...","created_at":"...","title":"buy milk","status":"Pending","tags":[]}
$ curl -s http://127.0.0.1:8080/api/v1/tasks
[...]
$ curl -s -X POST http://127.0.0.1:8080/api/v1/tasks \
    -H 'content-type: application/json' -d '{"title":"   "}'
{"type":"about:blank","title":"Invalid task","status":422,"detail":"a task needs a title"}
```

## Save your work

```bash
$ git add -A
$ git commit -m "day 39: build task CRUD endpoints"
[main (root-commit) ...] day 39: build task CRUD endpoints
 37 files changed, 4622 insertions(+)
...
$ git log --oneline
... day 39: build task CRUD endpoints
```

## If something went wrong

**`404` on `/api/v1/tasks`.** The route is missing, or the server was built
before the change. Rebuild and restart.

**`405 Method Not Allowed`.** The path exists but not for that method. Use
`POST` for create and `GET` for list.

**A path parameter is not parsed.** Axum 0.8 uses `{id}`, not `:id`. A
non-numeric `id` is a 400 before the handler.

**The body is rejected before the handler.** Missing `title` or invalid JSON
fails deserialization. Axum's default rejection is not problem+json yet; the
validation lesson can add a custom rejection.

**The status is 500 for a blank title.** `From<TodoError>` is not mapping
`EmptyTitle` to `BadRequest`, or the handler is not using `?`.

**The error content type is JSON, not problem+json.** The `IntoResponse` tuple
must include the `CONTENT_TYPE` header.

**`oneshot` consumes the router.** `ServiceExt::oneshot` takes `self`. Create
a fresh app per request in tests, or clone the router (Axum routers are
cloneable).

## Going deeper: contracts before code

Write the method, path, status, and body down before the handler. That table is
the API contract; the tests are its executable form. Changing a status from 200
to 201 is a contract change even if the code still compiles.

The next lessons add middleware, auth, and authorization. The error shape and
the version prefix stay. A client that can parse one problem+json body can
handle every failure the API grows.

<div class="day-tracker" data-day="39"></div>
