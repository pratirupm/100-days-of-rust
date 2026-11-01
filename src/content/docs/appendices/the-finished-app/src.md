---
title: "src — the finished app"
description: "The finished app, file by file: src (spoilers)."
sidebar:
  hidden: true
tableOfContents: false
pagefind: false
---


Part of [The finished app (spoilers)](/100-days-of-rust/appendices/the-finished-app/).


## `src/api.rs`

````rust
use std::sync::Arc;

use axum::extract::{FromRequestParts, Path, State};
use axum::http::request::Parts;
use axum::http::{HeaderName, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{Duration as ChronoDuration, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;
use tower::ServiceBuilder;
use tower_http::compression::CompressionLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;

use crate::auth;
use crate::db::SqliteStore;
use crate::error::TodoError;
use crate::metrics::Metrics;
use crate::task::Task;

#[derive(Clone)]
struct AppState {
    store: Arc<SqliteStore>,
    metrics: Arc<Metrics>,
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
}

#[derive(Deserialize)]
struct CreateTask {
    title: String,
}

#[derive(Deserialize)]
struct Register {
    email: String,
    password: String,
}

#[derive(Deserialize)]
struct Login {
    email: String,
    password: String,
}

#[derive(Serialize)]
struct Session {
    token: String,
}

#[derive(Serialize)]
struct Me {
    user_id: i64,
}

/// Build the HTTP router for the task API.
pub fn router(store: SqliteStore) -> Router {
    let state = AppState {
        store: Arc::new(store),
        metrics: Arc::new(Metrics::new()),
    };

    Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics))
        .route("/api/v1/tasks", get(list_tasks).post(create_task))
        .route("/api/v1/tasks/{id}", get(get_task))
        .route("/api/v1/tasks/{id}/done", post(done_task))
        .route("/api/v1/users", post(register))
        .route("/api/v1/sessions", post(login))
        .route("/api/v1/me", get(me))
        .with_state(state)
        .layer(
            ServiceBuilder::new()
                .layer(SetRequestIdLayer::new(
                    HeaderName::from_static("x-request-id"),
                    MakeRequestUuid,
                ))
                .layer(PropagateRequestIdLayer::x_request_id())
                .layer(TraceLayer::new_for_http())
                .layer(TimeoutLayer::with_status_code(
                    StatusCode::REQUEST_TIMEOUT,
                    Duration::from_secs(10),
                ))
                .layer(CompressionLayer::new())
                .layer(SetResponseHeaderLayer::overriding(
                    HeaderName::from_static("x-content-type-options"),
                    HeaderValue::from_static("nosniff"),
                ))
                .layer(SetResponseHeaderLayer::overriding(
                    HeaderName::from_static("x-frame-options"),
                    HeaderValue::from_static("DENY"),
                )),
        )
}

async fn health(State(state): State<AppState>) -> Result<Json<Health>, StatusCode> {
    state
        .store
        .list()
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Ok(Json(Health { status: "ok" }))
}

async fn metrics(State(state): State<AppState>) -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        state.metrics.render(),
    )
}

async fn list_tasks(
    CurrentUser { id }: CurrentUser,
    State(state): State<AppState>,
) -> Result<Json<Vec<Task>>, ApiError> {
    state.metrics.request();
    Ok(Json(state.store.list_owned(id).await?))
}

async fn create_task(
    CurrentUser { id: user_id }: CurrentUser,
    State(state): State<AppState>,
    Json(body): Json<CreateTask>,
) -> Result<(StatusCode, Json<Task>), ApiError> {
    state.metrics.request();
    let id = state.store.add_owned(&body.title, user_id).await?;
    state.metrics.task_created();
    let task = state
        .store
        .find_owned(id, user_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("no task with id {id}")))?;
    Ok((StatusCode::CREATED, Json(task)))
}

async fn register(
    State(state): State<AppState>,
    Json(body): Json<Register>,
) -> Result<(StatusCode, Json<Me>), ApiError> {
    let hash = auth::hash_password(&body.password)?;
    let id = state.store.create_user(&body.email, &hash).await?;
    Ok((StatusCode::CREATED, Json(Me { user_id: id })))
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<Login>,
) -> Result<Json<Session>, ApiError> {
    let user = state
        .store
        .find_user_by_email(&body.email)
        .await?
        .ok_or_else(|| ApiError::Unauthorized("invalid email or password".to_string()))?;
    if !auth::verify_password(&user.password_hash, &body.password) {
        return Err(ApiError::Unauthorized(
            "invalid email or password".to_string(),
        ));
    }

    let token = auth::new_token();
    let expires = (Utc::now() + ChronoDuration::days(7)).to_rfc3339_opts(SecondsFormat::Secs, true);
    state
        .store
        .create_session(user.id, &auth::token_hash(&token), &expires)
        .await?;
    Ok(Json(Session { token }))
}

struct CurrentUser {
    id: i64,
}

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .ok_or_else(|| ApiError::Unauthorized("missing bearer token".to_string()))?;
        let user_id = state
            .store
            .user_for_token(&auth::token_hash(token))
            .await?
            .ok_or_else(|| ApiError::Unauthorized("invalid or expired token".to_string()))?;
        Ok(Self { id: user_id })
    }
}

async fn me(CurrentUser { id }: CurrentUser) -> Json<Me> {
    Json(Me { user_id: id })
}

async fn get_task(
    Path(id): Path<u32>,
    CurrentUser { id: user_id }: CurrentUser,
    State(state): State<AppState>,
) -> Result<Json<Task>, ApiError> {
    state.metrics.request();
    let task = state
        .store
        .find_owned(id, user_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("no task with id {id}")))?;
    Ok(Json(task))
}

async fn done_task(
    Path(id): Path<u32>,
    CurrentUser { id: user_id }: CurrentUser,
    State(state): State<AppState>,
) -> Result<Json<Task>, ApiError> {
    state.metrics.request();
    state.store.done_owned(id, user_id).await?;
    let task = state
        .store
        .find_owned(id, user_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("no task with id {id}")))?;
    Ok(Json(task))
}

enum ApiError {
    BadRequest(String),
    Unauthorized(String),
    NotFound(String),
    Conflict(String),
    Internal(String),
}

impl From<TodoError> for ApiError {
    fn from(error: TodoError) -> Self {
        match error {
            TodoError::EmptyTitle => Self::BadRequest(error.to_string()),
            TodoError::InvalidCredentials | TodoError::Unauthorized => {
                Self::Unauthorized(error.to_string())
            }
            TodoError::EmailTaken => Self::Conflict(error.to_string()),
            TodoError::NotFound(id) => Self::NotFound(format!("no task with id {id}")),
            other => Self::Internal(other.to_string()),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, title, detail) = match self {
            Self::BadRequest(detail) => (StatusCode::UNPROCESSABLE_ENTITY, "Invalid task", detail),
            Self::Unauthorized(detail) => (StatusCode::UNAUTHORIZED, "Unauthorized", detail),
            Self::NotFound(detail) => (StatusCode::NOT_FOUND, "Task not found", detail),
            Self::Conflict(detail) => (StatusCode::CONFLICT, "Conflict", detail),
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    async fn test_app() -> (tempfile::TempDir, Router) {
        let dir = tempfile::tempdir().unwrap();
        let url = format!("sqlite://{}", dir.path().join("todo.db").display());
        let store = SqliteStore::open(&url).await.unwrap();
        (dir, router(store))
    }

    async fn auth_token(app: &Router, email: &str) -> String {
        let body = format!(r#"{{"email":"{email}","password":"secret"}}"#);
        let register = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/users")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(body.clone()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(register.status(), StatusCode::CREATED);

        let login = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/sessions")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(login.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        value["token"].as_str().unwrap().to_string()
    }

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

    #[tokio::test]
    async fn metrics_start_at_zero() {
        let (_dir, app) = test_app().await;
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/metrics")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let text = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(text.contains("todo_requests_total 0"));
        assert!(text.contains("todo_tasks_created_total 0"));
    }

    #[tokio::test]
    async fn list_is_empty() {
        let (_dir, app) = test_app().await;
        let token = auth_token(&app, "list@example.com").await;
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/tasks")
                    .header(header::AUTHORIZATION, format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value, json!([]));
    }

    #[tokio::test]
    async fn create_returns_201_and_the_task() {
        let (_dir, app) = test_app().await;
        let token = auth_token(&app, "create@example.com").await;
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/tasks")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, format!("Bearer {token}"))
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

    #[tokio::test]
    async fn blank_title_returns_problem_json() {
        let (_dir, app) = test_app().await;
        let token = auth_token(&app, "blank@example.com").await;
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/tasks")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, format!("Bearer {token}"))
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

    #[tokio::test]
    async fn responses_have_request_id_and_security_headers() {
        let (_dir, app) = test_app().await;
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .header("x-request-id", "test-request")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()["x-request-id"], "test-request");
        assert_eq!(response.headers()["x-content-type-options"], "nosniff");
        assert_eq!(response.headers()["x-frame-options"], "DENY");
    }

    #[tokio::test]
    async fn register_login_and_me() {
        let (_dir, app) = test_app().await;

        let register = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/users")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        r#"{"email":"a@example.com","password":"secret"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(register.status(), StatusCode::CREATED);

        let login = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/sessions")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        r#"{"email":"a@example.com","password":"secret"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(login.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        let token = value["token"].as_str().unwrap();

        let me = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/me")
                    .header(header::AUTHORIZATION, format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(me.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(me.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value["user_id"], 1);
    }

    #[tokio::test]
    async fn me_without_token_is_401() {
        let (_dir, app) = test_app().await;
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/me")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn duplicate_email_is_409() {
        let (_dir, app) = test_app().await;
        let body = r#"{"email":"a@example.com","password":"secret"}"#;
        let first = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/users")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::CREATED);

        let second = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/users")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(second.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn tasks_are_scoped_to_the_owner() {
        let (_dir, app) = test_app().await;
        let alice = auth_token(&app, "alice@example.com").await;

        let create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/tasks")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::AUTHORIZATION, format!("Bearer {alice}"))
                    .body(Body::from(r#"{"title":"alice task"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create.status(), StatusCode::CREATED);
        let bytes = axum::body::to_bytes(create.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        let id = value["id"].as_i64().unwrap();

        let bob = auth_token(&app, "bob@example.com").await;
        let list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/tasks")
                    .header(header::AUTHORIZATION, format!("Bearer {bob}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(list.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(list.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value, json!([]));

        let get = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/tasks/{id}"))
                    .header(header::AUTHORIZATION, format!("Bearer {bob}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(get.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn missing_task_is_404() {
        let (_dir, app) = test_app().await;
        let token = auth_token(&app, "missing@example.com").await;
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/tasks/999")
                    .header(header::AUTHORIZATION, format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
````


## `src/async_store.rs`

````rust
use std::path::Path;

use crate::error::TodoError;
use crate::store::TodoList;

/// Save a list without blocking the async runtime.
pub async fn save(list: TodoList, path: impl AsRef<Path>) -> Result<(), TodoError> {
    let path = path.as_ref().to_path_buf();
    tokio::task::spawn_blocking(move || list.save(&path))
        .await
        .map_err(|error| TodoError::Io(error.to_string()))??;
    Ok(())
}

/// Load a list without blocking the async runtime.
pub async fn load(path: impl AsRef<Path>) -> Result<TodoList, TodoError> {
    let path = path.as_ref().to_path_buf();
    tokio::task::spawn_blocking(move || TodoList::load(&path))
        .await
        .map_err(|error| TodoError::Io(error.to_string()))?
}

/// Save a list, failing if the write takes longer than the limit.
pub async fn save_with_timeout(
    list: TodoList,
    path: impl AsRef<Path>,
    limit: std::time::Duration,
) -> Result<(), TodoError> {
    match tokio::time::timeout(limit, save(list, path)).await {
        Ok(result) => result,
        Err(_) => Err(TodoError::Io("save timed out".to_string())),
    }
}

/// Wait for cancellation or a deadline, whichever comes first.
pub async fn wait_or_cancel(
    mut cancel: tokio::sync::oneshot::Receiver<()>,
    limit: std::time::Duration,
) -> &'static str {
    tokio::select! {
        _ = &mut cancel => "cancelled",
        _ = tokio::time::sleep(limit) => "timeout",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::summary::Summary;

    #[tokio::test]
    async fn async_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("todo.json");
        let mut list = TodoList::new();
        list.add("buy milk").unwrap();

        save(list, &path).await.unwrap();
        let loaded = load(&path).await.unwrap();

        assert_eq!(loaded.summary(), "1 task(s), 0 done");
    }

    #[tokio::test]
    async fn save_with_timeout_succeeds() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("todo.json");
        let mut list = TodoList::new();
        list.add("buy milk").unwrap();

        save_with_timeout(list, &path, std::time::Duration::from_secs(5))
            .await
            .unwrap();
        assert!(path.exists());
    }

    #[tokio::test]
    async fn cancellation_wins() {
        let (tx, rx) = tokio::sync::oneshot::channel();
        tx.send(()).unwrap();

        assert_eq!(
            wait_or_cancel(rx, std::time::Duration::from_secs(5)).await,
            "cancelled"
        );
    }

    #[tokio::test]
    async fn a_short_deadline_times_out() {
        let (_tx, rx) = tokio::sync::oneshot::channel();

        assert_eq!(
            wait_or_cancel(rx, std::time::Duration::from_millis(5)).await,
            "timeout"
        );
    }
}
````


## `src/auth.rs`

````rust
use argon2::Argon2;
use argon2::password_hash::{
    PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng,
};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::TodoError;

/// A registered user. The password hash stays inside the crate.
#[derive(Debug, Clone)]
pub struct User {
    /// The local user id.
    pub id: i64,
    /// The user's email address.
    pub email: String,
    pub(crate) password_hash: String,
}

/// Hash a password with Argon2id and a random salt.
pub fn hash_password(password: &str) -> Result<String, TodoError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| TodoError::Password(error.to_string()))
}

/// Check a password against a stored hash.
pub fn verify_password(hash: &str, password: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

/// Create an opaque session token.
pub fn new_token() -> String {
    Uuid::new_v4().to_string()
}

/// Hash a session token before storing it.
pub fn token_hash(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}
````


## `src/cli.rs`

````rust
use std::path::PathBuf;

use clap::{Parser, Subcommand};

/// The command-line surface.
#[derive(Debug, PartialEq, Eq, Parser)]
#[command(name = "todo", version, about = "A tiny task manager")]
pub struct Cli {
    /// The JSON file to read and write.
    #[arg(long, global = true, env = "TODO_DB", default_value = "todo.json")]
    pub db: PathBuf,
    /// Print debug logs.
    #[arg(long, global = true)]
    pub verbose: bool,
    /// What to do; no command prints the demo banner.
    #[command(subcommand)]
    pub command: Option<Command>,
}

/// The available commands.
#[derive(Debug, PartialEq, Eq, Subcommand)]
pub enum Command {
    /// Add a task by title.
    Add {
        /// The task's title.
        title: String,
        /// Print the new task as JSON.
        #[arg(long)]
        json: bool,
    },
    /// List the tasks.
    List {
        /// Print the tasks as JSON.
        #[arg(long)]
        json: bool,
    },
    /// Mark a task done by id.
    Done {
        /// The task id.
        id: u32,
    },
    /// Add a tag to a task.
    Tag {
        /// The task id.
        id: u32,
        /// The tag to add.
        tag: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_add() {
        let cli = Cli::try_parse_from(["todo", "add", "buy milk"]).unwrap();
        assert_eq!(
            cli.command,
            Some(Command::Add {
                title: "buy milk".to_string(),
                json: false
            })
        );
    }

    #[test]
    fn no_command_is_the_demo() {
        let cli = Cli::try_parse_from(["todo"]).unwrap();
        assert_eq!(cli.command, None);
    }

    #[test]
    fn add_needs_a_title() {
        assert!(Cli::try_parse_from(["todo", "add"]).is_err());
    }

    #[test]
    fn parses_list_json() {
        let cli = Cli::try_parse_from(["todo", "list", "--json"]).unwrap();
        assert_eq!(cli.command, Some(Command::List { json: true }));
    }

    #[test]
    fn db_flag_wins_over_the_default() {
        let cli = Cli::try_parse_from(["todo", "--db", "/tmp/demo.json", "list"]).unwrap();
        assert_eq!(cli.db, PathBuf::from("/tmp/demo.json"));
    }
}
````


## `src/client.rs`

````rust
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

    /// Mark a task done.
    pub async fn done(&self, id: u32) -> Result<Task, TodoError> {
        let response = self
            .http
            .post(format!("{}/api/v1/tasks/{id}/done", self.base))
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
}

fn check(response: reqwest::Response) -> Result<reqwest::Response, TodoError> {
    if response.status().is_success() {
        return Ok(response);
    }
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(TodoError::Unauthorized);
    }
    Err(TodoError::Db(format!("API returned {}", response.status())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api;
    use crate::auth;
    use crate::db::SqliteStore;

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
}
````


## `src/db.rs`

````rust
use std::str::FromStr;

use chrono::{SecondsFormat, Utc};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteRow};
use sqlx::{Row, SqlitePool};

use crate::auth::User;
use crate::error::TodoError;
use crate::storage::Store;
use crate::task::{Status, Task};

/// A SQLite-backed task store.
#[derive(Debug, Clone)]
pub struct SqliteStore {
    pool: SqlitePool,
}

impl SqliteStore {
    /// Open the database, creating it and its schema if needed.
    pub async fn open(path: &str) -> Result<Self, TodoError> {
        let options = SqliteConnectOptions::from_str(path)?.create_if_missing(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;
        let store = Self { pool };
        store.migrate().await?;
        Ok(store)
    }

    /// Apply every pending migration.
    pub async fn migrate(&self) -> Result<(), TodoError> {
        sqlx::migrate!("./migrations")
            .run(&self.pool)
            .await
            .map_err(|error| TodoError::Db(error.to_string()))?;
        Ok(())
    }

    /// Add a task and return its database id.
    pub async fn add(&self, title: &str) -> Result<u32, TodoError> {
        let task = Task::new(0, title)?;
        let result = sqlx::query(
            "INSERT INTO tasks (uuid, created_at, title, status, tags) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&task.uuid)
        .bind(&task.created_at)
        .bind(&task.title)
        .bind(status_name(&task.status))
        .bind(serde_json::to_string(&task.tags)?)
        .execute(&self.pool)
        .await?;
        Ok(result.last_insert_rowid() as u32)
    }

    /// Add several tasks atomically; one bad title rolls back the batch.
    pub async fn add_many(&self, titles: &[&str]) -> Result<Vec<u32>, TodoError> {
        let mut tx = self.pool.begin().await?;
        let mut ids = Vec::new();

        for title in titles {
            let task = Task::new(0, title)?;
            let result = sqlx::query(
                "INSERT INTO tasks (uuid, created_at, title, status, tags) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(&task.uuid)
            .bind(&task.created_at)
            .bind(&task.title)
            .bind(status_name(&task.status))
            .bind(serde_json::to_string(&task.tags)?)
            .execute(&mut *tx)
            .await?;
            ids.push(result.last_insert_rowid() as u32);
        }

        tx.commit().await?;
        Ok(ids)
    }

    /// Add a task owned by a user.
    pub async fn add_owned(&self, title: &str, owner_id: i64) -> Result<u32, TodoError> {
        let task = Task::new(0, title)?;
        let result = sqlx::query(
            "INSERT INTO tasks (uuid, created_at, title, status, tags, owner_id) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&task.uuid)
        .bind(&task.created_at)
        .bind(&task.title)
        .bind(status_name(&task.status))
        .bind(serde_json::to_string(&task.tags)?)
        .bind(owner_id)
        .execute(&self.pool)
        .await?;
        Ok(result.last_insert_rowid() as u32)
    }

    /// List a user's tasks in id order.
    pub async fn list_owned(&self, owner_id: i64) -> Result<Vec<Task>, TodoError> {
        let rows = sqlx::query(
            "SELECT id, uuid, created_at, title, status, tags FROM tasks WHERE owner_id = ? ORDER BY id",
        )
        .bind(owner_id)
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(row_to_task).collect()
    }

    /// Find one of a user's tasks by id.
    pub async fn find_owned(&self, id: u32, owner_id: i64) -> Result<Option<Task>, TodoError> {
        let row = sqlx::query(
            "SELECT id, uuid, created_at, title, status, tags FROM tasks WHERE id = ? AND owner_id = ?",
        )
        .bind(id)
        .bind(owner_id)
        .fetch_optional(&self.pool)
        .await?;
        row.as_ref().map(row_to_task).transpose()
    }

    /// Mark one of a user's tasks done.
    pub async fn done_owned(&self, id: u32, owner_id: i64) -> Result<(), TodoError> {
        let result = sqlx::query("UPDATE tasks SET status = 'Done' WHERE id = ? AND owner_id = ?")
            .bind(id)
            .bind(owner_id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(TodoError::NotFound(id));
        }
        Ok(())
    }

    /// List every task in id order.
    pub async fn list(&self) -> Result<Vec<Task>, TodoError> {
        let rows =
            sqlx::query("SELECT id, uuid, created_at, title, status, tags FROM tasks ORDER BY id")
                .fetch_all(&self.pool)
                .await?;
        rows.iter().map(row_to_task).collect()
    }

    /// Find one task by id.
    pub async fn find(&self, id: u32) -> Result<Option<Task>, TodoError> {
        let row =
            sqlx::query("SELECT id, uuid, created_at, title, status, tags FROM tasks WHERE id = ?")
                .bind(id)
                .fetch_optional(&self.pool)
                .await?;
        row.as_ref().map(row_to_task).transpose()
    }

    /// Export every task as a JSON array.
    pub async fn export_json(&self) -> Result<String, TodoError> {
        let tasks = self.list().await?;
        Ok(serde_json::to_string_pretty(&tasks)?)
    }

    /// Import a JSON array atomically; returns the number of tasks imported.
    pub async fn import_json(&self, text: &str) -> Result<usize, TodoError> {
        let tasks: Vec<Task> = serde_json::from_str(text)?;
        let count = tasks.len();
        let mut tx = self.pool.begin().await?;

        for task in tasks {
            sqlx::query(
                "INSERT INTO tasks (uuid, created_at, title, status, tags) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(&task.uuid)
            .bind(&task.created_at)
            .bind(&task.title)
            .bind(status_name(&task.status))
            .bind(serde_json::to_string(&task.tags)?)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(count)
    }

    /// Create a user, refusing a duplicate email.
    pub async fn create_user(&self, email: &str, password_hash: &str) -> Result<i64, TodoError> {
        if self.find_user_by_email(email).await?.is_some() {
            return Err(TodoError::EmailTaken);
        }
        let now = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
        let result =
            sqlx::query("INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)")
                .bind(email)
                .bind(password_hash)
                .bind(now)
                .execute(&self.pool)
                .await?;
        Ok(result.last_insert_rowid())
    }

    /// Find a user by email.
    pub async fn find_user_by_email(&self, email: &str) -> Result<Option<User>, TodoError> {
        let row = sqlx::query("SELECT id, email, password_hash FROM users WHERE email = ?")
            .bind(email)
            .fetch_optional(&self.pool)
            .await?;
        let Some(row) = row else {
            return Ok(None);
        };
        Ok(Some(User {
            id: row.try_get("id")?,
            email: row.try_get("email")?,
            password_hash: row.try_get("password_hash")?,
        }))
    }

    /// Store a session token hash with an expiry.
    pub async fn create_session(
        &self,
        user_id: i64,
        token_hash: &str,
        expires_at: &str,
    ) -> Result<(), TodoError> {
        sqlx::query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
            .bind(token_hash)
            .bind(user_id)
            .bind(expires_at)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Resolve a token hash to a user id, if the session is still valid.
    pub async fn user_for_token(&self, token_hash: &str) -> Result<Option<i64>, TodoError> {
        let now = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
        let row =
            sqlx::query("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?")
                .bind(token_hash)
                .bind(now)
                .fetch_optional(&self.pool)
                .await?;
        row.map(|row| row.try_get("user_id"))
            .transpose()
            .map_err(Into::into)
    }

    /// Delete a session by token hash.
    pub async fn delete_session(&self, token_hash: &str) -> Result<(), TodoError> {
        sqlx::query("DELETE FROM sessions WHERE token_hash = ?")
            .bind(token_hash)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Mark a task done.
    pub async fn done(&self, id: u32) -> Result<(), TodoError> {
        let result = sqlx::query("UPDATE tasks SET status = 'Done' WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(TodoError::NotFound(id));
        }
        Ok(())
    }
}

#[allow(async_fn_in_trait)]
impl Store for SqliteStore {
    async fn add(&self, title: &str) -> Result<u32, TodoError> {
        SqliteStore::add(self, title).await
    }

    async fn list(&self) -> Result<Vec<Task>, TodoError> {
        SqliteStore::list(self).await
    }

    async fn done(&self, id: u32) -> Result<(), TodoError> {
        SqliteStore::done(self, id).await
    }
}

fn status_name(status: &Status) -> &'static str {
    match status {
        Status::Pending => "Pending",
        Status::Done => "Done",
    }
}

fn row_to_task(row: &SqliteRow) -> Result<Task, TodoError> {
    let id: i64 = row.try_get("id")?;
    let uuid: String = row.try_get("uuid")?;
    let created_at: String = row.try_get("created_at")?;
    let title: String = row.try_get("title")?;
    let status: String = row.try_get("status")?;
    let tags: String = row.try_get("tags")?;

    Ok(Task {
        id: id as u32,
        uuid,
        created_at,
        title,
        status: if status == "Done" {
            Status::Done
        } else {
            Status::Pending
        },
        tags: serde_json::from_str(&tags)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_store() -> (tempfile::TempDir, SqliteStore) {
        let dir = tempfile::tempdir().unwrap();
        let url = format!("sqlite://{}", dir.path().join("todo.db").display());
        let store = SqliteStore::open(&url).await.unwrap();
        (dir, store)
    }

    #[tokio::test]
    async fn add_list_and_find() {
        let (_dir, store) = test_store().await;
        let id = store.add("buy milk").await.unwrap();

        let tasks = store.list().await.unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "buy milk");
        assert_eq!(store.find(id).await.unwrap().unwrap().id, id);
    }

    #[tokio::test]
    async fn done_marks_the_task() {
        let (_dir, store) = test_store().await;
        let id = store.add("buy milk").await.unwrap();

        store.done(id).await.unwrap();

        assert!(store.find(id).await.unwrap().unwrap().is_done());
        assert_eq!(store.done(999).await, Err(TodoError::NotFound(999)));
    }

    #[tokio::test]
    async fn export_and_import_round_trip() {
        let (_dir, store) = test_store().await;
        store.add("buy milk").await.unwrap();
        store.add("write the report").await.unwrap();
        let json = store.export_json().await.unwrap();

        let (_dir2, other) = test_store().await;
        let count = other.import_json(&json).await.unwrap();

        assert_eq!(count, 2);
        assert_eq!(other.list().await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn the_store_trait_is_generic() {
        async fn count<S: Store>(store: &S) -> Result<usize, TodoError> {
            Ok(store.list().await?.len())
        }

        let (_dir, store) = test_store().await;
        store.add("buy milk").await.unwrap();

        assert_eq!(count(&store).await.unwrap(), 1);
    }

    #[tokio::test]
    async fn tasks_have_uuid_and_created_at() {
        let (_dir, store) = test_store().await;
        let id = store.add("buy milk").await.unwrap();
        let task = store.find(id).await.unwrap().unwrap();

        assert_eq!(task.uuid.len(), 36);
        assert!(task.created_at.ends_with('Z'));
    }

    #[tokio::test]
    async fn add_many_commits_together() {
        let (_dir, store) = test_store().await;
        let ids = store
            .add_many(&["buy milk", "write the report"])
            .await
            .unwrap();

        assert_eq!(ids.len(), 2);
        assert_eq!(store.list().await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn add_many_rolls_back_on_a_blank_title() {
        let (_dir, store) = test_store().await;
        let result = store
            .add_many(&["buy milk", "   ", "write the report"])
            .await;

        assert_eq!(result, Err(TodoError::EmptyTitle));
        assert!(store.list().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn migrations_run_once() {
        let (dir, store) = test_store().await;
        store.migrate().await.unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations")
            .fetch_one(&store.pool)
            .await
            .unwrap();
        assert_eq!(count, 4);
        drop(dir);
    }

    #[tokio::test]
    async fn a_blank_title_is_rejected() {
        let (_dir, store) = test_store().await;
        assert_eq!(store.add("   ").await, Err(TodoError::EmptyTitle));
    }
}
````


## `src/error.rs`

````rust
use thiserror::Error;

/// Everything that can go wrong in the core app.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum TodoError {
    /// A task was created or added with a blank title.
    #[error("a task needs a title")]
    EmptyTitle,
    /// No task with this id exists.
    #[error("no task with id {0}")]
    NotFound(u32),
    /// The store could not be read or written.
    #[error("could not read or write the store: {0}")]
    Io(String),
    /// The store's JSON could not be parsed.
    #[error("could not parse the store: {0}")]
    Json(String),
    /// The database returned an error.
    #[error("database error: {0}")]
    Db(String),
    /// The email or password did not match.
    #[error("invalid email or password")]
    InvalidCredentials,
    /// The email is already registered.
    #[error("that email is already registered")]
    EmailTaken,
    /// A session token is missing or expired.
    #[error("unauthorized")]
    Unauthorized,
    /// Password hashing failed.
    #[error("password error: {0}")]
    Password(String),
}

impl From<std::io::Error> for TodoError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error.to_string())
    }
}

impl From<serde_json::Error> for TodoError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error.to_string())
    }
}

impl From<sqlx::Error> for TodoError {
    fn from(error: sqlx::Error) -> Self {
        Self::Db(error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_messages_are_stable() {
        assert_eq!(TodoError::EmptyTitle.to_string(), "a task needs a title");
        assert_eq!(TodoError::NotFound(42).to_string(), "no task with id 42");
    }
}
````


## `src/lib.rs`

````rust
//! The todo app's library: tasks, the list that stores them, and the errors
//! they can produce.
#![warn(missing_docs)]

/// The HTTP API.
pub mod api;
/// Async file operations for the server.
pub mod async_store;
/// Authentication helpers.
pub mod auth;
/// The command-line surface.
pub mod cli;
/// The HTTP API client.
pub mod client;
/// The SQLite-backed store.
pub mod db;
/// The errors returned by the core app.
pub mod error;
/// Process metrics.
pub mod metrics;
/// Parallel save helpers.
pub mod parallel;
/// Generic search and count helpers.
pub mod query;
/// A value that redacts itself when printed.
pub mod secret;
/// A list shared between threads.
pub mod shared;
/// The task-store trait.
pub mod storage;
/// The in-memory list of tasks.
pub mod store;
/// The one-line summary trait.
pub mod summary;
/// Tasks, statuses, and tags.
pub mod task;
/// The terminal UI.
pub mod tui;
/// Zero-copy views of tasks.
pub mod view;
/// The browser-facing UI.
pub mod web;
/// Background save workers.
pub mod worker;

pub use auth::User;
pub use cli::{Cli, Command};
pub use client::ApiClient;
pub use db::SqliteStore;
pub use error::TodoError;
pub use metrics::Metrics;
pub use query::{count_if, find_first};
pub use secret::Secret;
pub use shared::SharedList;
pub use storage::Store;
pub use store::TodoList;
pub use summary::Summary;
pub use task::{Status, Task};
pub use view::TaskView;
pub use worker::SaveWorker;
````


## `src/logging.rs`

````rust
use tracing_subscriber::EnvFilter;

/// Install the tracing subscriber. `--verbose` raises the default level;
/// `RUST_LOG` overrides both.
pub fn init(verbose: bool) {
    let default = if verbose { "todo=debug" } else { "todo=warn" };
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(default));

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .with_target(false)
        .with_ansi(false)
        .without_time()
        .init();
}
````


## `src/main.rs`

````rust
mod logging;

use clap::Parser;
use todo::{Cli, Command, Summary, TodoError, TodoList};

const USAGE: &str = "todo — a tiny task manager\n\nUsage:\n  todo              start the interactive list\n  todo add <title>  add a task\n  todo list         list tasks\n";

fn demo(list: &mut TodoList) -> Result<(), TodoError> {
    let first = list.add("buy milk")?;
    list.add("write the report")?;

    if let Some(task) = list.find_mut(first) {
        task.add_tag("errand");
    }
    list.done(first)?;

    println!("{USAGE}");

    if let Some(task) = list.find(first) {
        println!("first: {task} (done={})", task.is_done());
        println!("summary: {}", task.summary());
    }
    if let Some(task) = list.find_by_title("write the report") {
        println!("found: {}", task.title);
    }

    let views = list.views();
    for view in &views {
        println!("view: {view} done={}", view.is_done());
    }

    let counts = list.tag_counts();
    println!("demo: {} task(s); tags={:?}", list.list().len(), counts);
    println!("list: {}", list.summary());
    Ok(())
}

fn run(cli: Cli) -> Result<(), TodoError> {
    let Cli {
        command, db: path, ..
    } = cli;
    let mut list = TodoList::load(&path)?;
    tracing::debug!(path = %path.display(), "loaded store");

    match command {
        None => demo(&mut list)?,
        Some(Command::Add { title, json }) => {
            let id = list.add(&title)?;
            list.save(&path)?;
            tracing::info!(id, "added task");
            if json {
                let task = list.find(id).ok_or(TodoError::NotFound(id))?;
                println!("{}", serde_json::to_string_pretty(task)?);
            } else {
                println!("added task #{id}");
            }
        }
        Some(Command::List { json }) => {
            tracing::debug!(count = list.list().len(), "listed tasks");
            if json {
                println!("{}", serde_json::to_string_pretty(list.list())?);
            } else {
                for task in list.list() {
                    println!("{task}");
                }
            }
        }
        Some(Command::Done { id }) => {
            list.done(id)?;
            list.save(&path)?;
            tracing::info!(id, "marked task done");
            println!("done task #{id}");
        }
        Some(Command::Tag { id, tag }) => {
            let task = list.find_mut(id).ok_or(TodoError::NotFound(id))?;
            task.add_tag(&tag);
            list.save(&path)?;
            tracing::info!(id, tag = %tag, "tagged task");
            println!("tagged task #{id} with {tag}");
        }
    }

    Ok(())
}

fn main() {
    let cli = Cli::parse();
    logging::init(cli.verbose);
    if let Err(error) = run(cli) {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}
````


## `src/metrics.rs`

````rust
use std::sync::atomic::{AtomicU64, Ordering};

/// Process counters exposed at `/metrics`.
#[derive(Debug, Default)]
pub struct Metrics {
    requests: AtomicU64,
    tasks_created: AtomicU64,
}

impl Metrics {
    /// Create a zeroed counter set.
    pub fn new() -> Self {
        Self::default()
    }

    /// Count one API request.
    pub fn request(&self) {
        self.requests.fetch_add(1, Ordering::Relaxed);
    }

    /// Count one created task.
    pub fn task_created(&self) {
        self.tasks_created.fetch_add(1, Ordering::Relaxed);
    }

    /// Render the Prometheus text exposition format.
    pub fn render(&self) -> String {
        format!(
            "# HELP todo_requests_total API requests handled.\n\
             # TYPE todo_requests_total counter\n\
             todo_requests_total {}\n\
             # HELP todo_tasks_created_total Tasks created.\n\
             # TYPE todo_tasks_created_total counter\n\
             todo_tasks_created_total {}\n",
            self.requests.load(Ordering::Relaxed),
            self.tasks_created.load(Ordering::Relaxed),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counters_render_in_prometheus_format() {
        let metrics = Metrics::new();
        metrics.request();
        metrics.task_created();

        let text = metrics.render();
        assert!(text.contains("todo_requests_total 1"));
        assert!(text.contains("todo_tasks_created_total 1"));
    }
}
````


## `src/parallel.rs`

````rust
use std::path::PathBuf;

use tokio::task::JoinSet;

use crate::error::TodoError;
use crate::store::TodoList;

/// Save several lists concurrently; return how many finished.
pub async fn save_all(jobs: Vec<(TodoList, PathBuf)>) -> Result<usize, TodoError> {
    let mut set = JoinSet::new();
    for (list, path) in jobs {
        set.spawn(async move { list.save(&path) });
    }

    let mut saved = 0;
    while let Some(result) = set.join_next().await {
        result.map_err(|error| TodoError::Io(error.to_string()))??;
        saved += 1;
    }
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn saves_many_lists_in_parallel() {
        let dir = tempfile::tempdir().unwrap();
        let mut jobs = Vec::new();

        for i in 0..3 {
            let mut list = TodoList::new();
            list.add(&format!("task {i}")).unwrap();
            jobs.push((list, dir.path().join(format!("list-{i}.json"))));
        }

        assert_eq!(save_all(jobs).await.unwrap(), 3);
        for i in 0..3 {
            assert!(dir.path().join(format!("list-{i}.json")).exists());
        }
    }

    #[tokio::test]
    async fn a_failed_save_fails_the_batch() {
        let dir = tempfile::tempdir().unwrap();
        let mut list = TodoList::new();
        list.add("buy milk").unwrap();
        let missing = dir.path().join("missing").join("todo.json");

        let result = save_all(vec![(list, missing)]).await;

        assert!(matches!(result, Err(TodoError::Io(_))));
    }
}
````


## `src/query.rs`

````rust
/// Return the first item that matches the predicate.
pub fn find_first<T, F>(items: &[T], predicate: F) -> Option<&T>
where
    F: Fn(&T) -> bool,
{
    items.iter().find(|item| predicate(item))
}

/// Count the items that match the predicate.
pub fn count_if<T, F>(items: &[T], predicate: F) -> usize
where
    F: Fn(&T) -> bool,
{
    items.iter().filter(|item| predicate(item)).count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_first_returns_a_borrow() {
        let values = [1, 2, 3];
        assert_eq!(find_first(&values, |value| *value == 2), Some(&2));
    }

    #[test]
    fn count_if_counts_matching_items() {
        let values = [1, 2, 3, 4];
        assert_eq!(count_if(&values, |value| *value % 2 == 0), 2);
    }
}
````


## `src/secret.rs`

````rust
use std::fmt;

/// A string that refuses to print its value.
#[derive(Clone, PartialEq, Eq)]
pub struct Secret(String);

impl Secret {
    /// Wrap a secret value.
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// Use the secret at the point where it is needed.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Secret([redacted])")
    }
}

impl fmt::Display for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[redacted]")
    }
}

impl From<String> for Secret {
    fn from(value: String) -> Self {
        Self(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_and_display_hide_the_value() {
        let secret = Secret::new("hunter2");
        assert_eq!(format!("{secret:?}"), "Secret([redacted])");
        assert_eq!(format!("{secret}"), "[redacted]");
        assert!(!format!("{secret:?}").contains("hunter2"));
    }

    #[test]
    fn expose_returns_the_value() {
        let secret = Secret::new("hunter2");
        assert_eq!(secret.expose(), "hunter2");
    }
}
````


## `src/shared.rs`

````rust
use std::sync::{Arc, RwLock};

use crate::error::TodoError;
use crate::store::TodoList;
use crate::summary::Summary;

/// A list shared between threads behind a read-write lock.
#[derive(Debug, Clone)]
pub struct SharedList {
    inner: Arc<RwLock<TodoList>>,
}

impl SharedList {
    /// Wrap a list in a shared handle.
    pub fn new(list: TodoList) -> Self {
        Self {
            inner: Arc::new(RwLock::new(list)),
        }
    }

    /// Add a task under the write lock.
    pub fn add(&self, title: &str) -> Result<u32, TodoError> {
        self.inner.write().unwrap().add(title)
    }

    /// Mark a task done under the write lock.
    pub fn done(&self, id: u32) -> Result<(), TodoError> {
        self.inner.write().unwrap().done(id)
    }

    /// Add a tag under the write lock.
    pub fn tag(&self, id: u32, tag: &str) -> Result<(), TodoError> {
        let mut guard = self.inner.write().unwrap();
        let task = guard.find_mut(id).ok_or(TodoError::NotFound(id))?;
        task.add_tag(tag);
        Ok(())
    }

    /// Read the list's summary under the read lock.
    pub fn summary(&self) -> String {
        self.inner.read().unwrap().summary()
    }

    /// Copy the list while holding the read lock.
    pub fn snapshot(&self) -> TodoList {
        self.inner.read().unwrap().clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn threads_share_one_list() {
        let shared = SharedList::new(TodoList::new());
        let mut handles = Vec::new();

        for i in 0..4 {
            let shared = shared.clone();
            handles.push(std::thread::spawn(move || {
                shared.add(&format!("task {i}")).unwrap();
            }));
        }
        for handle in handles {
            handle.join().unwrap();
        }

        assert_eq!(shared.snapshot().list().len(), 4);
        assert_eq!(shared.summary(), "4 task(s), 0 done");
    }

    #[test]
    fn a_snapshot_is_independent() {
        let shared = SharedList::new(TodoList::new());
        shared.add("buy milk").unwrap();

        let snapshot = shared.snapshot();
        shared.add("write the report").unwrap();

        assert_eq!(snapshot.list().len(), 1);
        assert_eq!(shared.snapshot().list().len(), 2);
    }
}
````


## `src/storage.rs`

````rust
use crate::error::TodoError;
use crate::task::Task;

/// The operations the app needs from a task store.
///
/// The trait uses `async fn` for static dispatch; a future server can accept
/// any implementation through a generic parameter.
#[allow(async_fn_in_trait)]
pub trait Store: Send + Sync {
    /// Add a task and return its local id.
    async fn add(&self, title: &str) -> Result<u32, TodoError>;

    /// List every task.
    async fn list(&self) -> Result<Vec<Task>, TodoError>;

    /// Mark a task done.
    async fn done(&self, id: u32) -> Result<(), TodoError>;
}
````


## `src/store.rs`

````rust
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::TodoError;
use crate::query::{count_if, find_first};
use crate::summary::Summary;
use crate::task::Task;
use crate::view::TaskView;

/// The in-memory list of tasks.
#[derive(Debug, Clone)]
pub struct TodoList {
    tasks: Vec<Task>,
    next_id: u32,
}

impl TodoList {
    /// Create an empty list with ids starting at 1.
    pub fn new() -> Self {
        Self {
            tasks: Vec::new(),
            next_id: 1,
        }
    }

    /// Add a task and return its id.
    pub fn add(&mut self, title: &str) -> Result<u32, TodoError> {
        let task = Task::new(self.next_id, title)?;
        let id = task.id;
        self.next_id += 1;
        self.push(task);
        Ok(id)
    }

    /// Move an existing task into the list.
    pub fn push(&mut self, task: Task) {
        if task.id >= self.next_id {
            self.next_id = task.id + 1;
        }
        self.tasks.push(task);
    }

    /// Borrow every task in insertion order.
    pub fn list(&self) -> &[Task] {
        &self.tasks
    }

    /// Find a task by id.
    pub fn find(&self, id: u32) -> Option<&Task> {
        find_first(&self.tasks, |task| task.id == id)
    }

    /// Find a task by id for mutation.
    pub fn find_mut(&mut self, id: u32) -> Option<&mut Task> {
        self.tasks.iter_mut().find(|task| task.id == id)
    }

    /// Find a task by its exact title.
    pub fn find_by_title(&self, title: &str) -> Option<&Task> {
        find_first(&self.tasks, |task| task.title == title)
    }

    /// Mark a task done, or say which id was missing.
    pub fn done(&mut self, id: u32) -> Result<(), TodoError> {
        let task = self.find_mut(id).ok_or(TodoError::NotFound(id))?;
        task.done();
        Ok(())
    }

    /// Borrow every task as a zero-copy view.
    pub fn views(&self) -> Vec<TaskView<'_>> {
        self.tasks.iter().map(TaskView::from).collect()
    }

    /// Count how many tasks carry each tag.
    pub fn tag_counts(&self) -> HashMap<&str, usize> {
        let mut counts: HashMap<&str, usize> = HashMap::new();
        for task in &self.tasks {
            for tag in &task.tags {
                *counts.entry(tag.as_str()).or_insert(0) += 1;
            }
        }
        counts
    }
}

impl Default for TodoList {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct Snapshot {
    tasks: Vec<Task>,
    next_id: u32,
}

impl TodoList {
    /// Serialize the list to pretty JSON.
    pub fn to_json(&self) -> Result<String, TodoError> {
        let snapshot = Snapshot {
            tasks: self.tasks.clone(),
            next_id: self.next_id,
        };
        Ok(serde_json::to_string_pretty(&snapshot)?)
    }

    /// Parse a list from JSON.
    pub fn from_json(text: &str) -> Result<Self, TodoError> {
        let snapshot: Snapshot = serde_json::from_str(text)?;
        Ok(Self {
            tasks: snapshot.tasks,
            next_id: snapshot.next_id,
        })
    }

    /// Write the list to a file atomically.
    pub fn save(&self, path: &Path) -> Result<(), TodoError> {
        let temporary = path.with_extension("json.tmp");
        fs::write(&temporary, self.to_json()?)?;
        fs::rename(temporary, path)?;
        Ok(())
    }

    /// Load a list, or return an empty one when the file does not exist.
    pub fn load(path: &Path) -> Result<Self, TodoError> {
        if !path.exists() {
            return Ok(Self::new());
        }
        Self::from_json(&fs::read_to_string(path)?)
    }
}

impl Summary for TodoList {
    fn summary(&self) -> String {
        let done = count_if(&self.tasks, |task| task.is_done());
        format!("{} task(s), {} done", self.tasks.len(), done)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_returns_an_id_and_appends() {
        let mut list = TodoList::new();
        assert_eq!(list.add("buy milk").unwrap(), 1);
        assert_eq!(list.add("write the report").unwrap(), 2);
        assert_eq!(list.list().len(), 2);
        assert_eq!(list.list()[0].title, "buy milk");
    }

    #[test]
    fn blank_title_is_an_error_and_does_not_consume_an_id() {
        let mut list = TodoList::new();
        assert_eq!(list.add("buy milk").unwrap(), 1);
        assert_eq!(list.add("   "), Err(TodoError::EmptyTitle));
        assert_eq!(list.add("write the report").unwrap(), 2);
    }

    #[test]
    fn push_moves_a_task_into_the_list() {
        let mut list = TodoList::new();
        let task = Task::new(99, "read the book").unwrap();
        let snapshot = task.clone();

        list.push(task);

        assert_eq!(list.list().len(), 1);
        assert_eq!(snapshot.title, "read the book");
        assert_eq!(list.add("next").unwrap(), 100);
    }

    #[test]
    fn done_marks_a_task_by_id() {
        let mut list = TodoList::new();
        let id = list.add("buy milk").unwrap();

        assert!(list.done(id).is_ok());
        assert!(list.find(id).unwrap().is_done());
        assert_eq!(list.done(999), Err(TodoError::NotFound(999)));
    }

    #[test]
    fn clone_makes_an_independent_copy() {
        let task = Task::new(7, "buy milk").unwrap();
        let mut copy = task.clone();

        copy.done();

        assert!(!task.is_done());
        assert!(copy.is_done());
    }

    #[test]
    fn list_borrows_the_tasks() {
        let mut list = TodoList::new();
        list.add("buy milk").unwrap();

        let tasks: &[Task] = list.list();

        assert_eq!(tasks[0].title, "buy milk");
    }

    #[test]
    fn find_returns_a_borrow() {
        let mut list = TodoList::new();
        let id = list.add("buy milk").unwrap();

        let task: &Task = list.find(id).unwrap();

        assert_eq!(task.title, "buy milk");
    }

    #[test]
    fn find_mut_changes_the_task() {
        let mut list = TodoList::new();
        let id = list.add("buy milk").unwrap();

        let task: &mut Task = list.find_mut(id).unwrap();
        task.add_tag("errand");

        assert_eq!(list.find(id).unwrap().tags, ["errand"]);
    }

    #[test]
    fn find_by_title_is_exact() {
        let mut list = TodoList::new();
        list.add("buy milk").unwrap();
        list.add("buy milk and bread").unwrap();

        assert!(list.find_by_title("buy milk").is_some());
        assert!(list.find_by_title("buy").is_none());
    }

    #[test]
    fn list_summary_counts_done() {
        let mut list = TodoList::new();
        let first = list.add("buy milk").unwrap();
        list.add("write the report").unwrap();
        list.done(first).unwrap();

        assert_eq!(list.summary(), "2 task(s), 1 done");
    }

    #[test]
    fn save_and_load_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("todo.json");
        let mut list = TodoList::new();
        let id = list.add("buy milk").unwrap();
        list.done(id).unwrap();

        list.save(&path).unwrap();
        let loaded = TodoList::load(&path).unwrap();

        assert_eq!(loaded.summary(), "1 task(s), 1 done");
        assert_eq!(loaded.find(id).unwrap().title, "buy milk");
    }

    #[test]
    fn load_missing_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let list = TodoList::load(&dir.path().join("missing.json")).unwrap();
        assert!(list.list().is_empty());
    }

    #[test]
    fn tags_are_owned_and_counted() {
        let mut list = TodoList::new();
        let first = list.add("buy milk").unwrap();
        let second = list.add("write the report").unwrap();

        list.find_mut(first).unwrap().add_tag("errand");
        list.find_mut(first).unwrap().add_tag("errand");
        list.find_mut(second).unwrap().add_tag("work");

        let counts = list.tag_counts();

        assert_eq!(counts.get("errand"), Some(&1));
        assert_eq!(counts.get("work"), Some(&1));
    }
}
````


## `src/summary.rs`

````rust
/// A one-line description of a value.
pub trait Summary {
    /// Return a one-line description of the value.
    fn summary(&self) -> String;
}
````


## `src/task.rs`

````rust
use std::fmt;

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::TodoError;
use crate::summary::Summary;

/// A single todo item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Task {
    /// The task's database id.
    pub id: u32,
    /// A stable external identifier.
    #[serde(default)]
    pub uuid: String,
    /// When the task was created, in UTC.
    #[serde(default)]
    pub created_at: String,
    /// The task's title, trimmed on creation.
    pub title: String,
    /// Whether the task is pending or done.
    pub status: Status,
    /// The tags attached to the task, without duplicates.
    pub tags: Vec<String>,
}

/// Whether a task is still pending or already done.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Status {
    /// The task still needs doing.
    Pending,
    /// The task is finished.
    Done,
}

impl fmt::Display for Status {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Pending => write!(f, "pending"),
            Self::Done => write!(f, "done"),
        }
    }
}

impl Task {
    /// Build a task from a title, refusing a blank one.
    pub fn new(id: u32, title: &str) -> Result<Self, TodoError> {
        let title = title.trim();
        if title.is_empty() {
            return Err(TodoError::EmptyTitle);
        }
        Ok(Self {
            id,
            uuid: Uuid::now_v7().to_string(),
            created_at: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
            title: title.to_string(),
            status: Status::Pending,
            tags: Vec::new(),
        })
    }

    /// Mark the task done.
    pub fn done(&mut self) {
        self.status = Status::Done;
    }

    /// Return true when the task is done.
    pub fn is_done(&self) -> bool {
        match self.status {
            Status::Pending => false,
            Status::Done => true,
        }
    }

    /// Add a tag once; duplicates are ignored.
    pub fn add_tag(&mut self, tag: &str) {
        for existing in &self.tags {
            if existing == tag {
                return;
            }
        }
        self.tags.push(tag.to_string());
    }
}

impl Summary for Task {
    fn summary(&self) -> String {
        format!("#{} {} [{}]", self.id, self.title, self.status)
    }
}

impl fmt::Display for Task {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.summary())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_task_is_pending() {
        let task = Task::new(1, "buy milk").unwrap();
        assert_eq!(task.id, 1);
        assert_eq!(task.title, "buy milk");
        assert_eq!(task.status, Status::Pending);
        assert!(!task.is_done());
    }

    #[test]
    fn done_marks_the_task_done() {
        let mut task = Task::new(2, "write the report").unwrap();
        task.done();
        assert!(task.is_done());
        assert_eq!(task.status, Status::Done);
    }

    #[test]
    fn title_is_owned_by_the_task() {
        let title = String::from("buy milk");
        let task = Task::new(3, &title).unwrap();
        drop(title);
        assert_eq!(task.title, "buy milk");
    }

    #[test]
    fn blank_title_is_rejected() {
        assert_eq!(Task::new(4, "   "), Err(TodoError::EmptyTitle));
    }

    #[test]
    fn title_is_trimmed() {
        let task = Task::new(5, "  buy milk  ").unwrap();
        assert_eq!(task.title, "buy milk");
    }

    #[test]
    fn new_task_has_uuid_and_time() {
        let task = Task::new(6, "buy milk").unwrap();
        assert_eq!(task.uuid.len(), 36);
        assert!(task.created_at.ends_with('Z'));
    }

    #[test]
    fn task_display_is_one_line() {
        let mut task = Task::new(1, "buy milk").unwrap();
        assert_eq!(format!("{task}"), "#1 buy milk [pending]");
        task.done();
        assert_eq!(format!("{task}"), "#1 buy milk [done]");
    }

    #[test]
    fn task_summary_matches_display() {
        let task = Task::new(2, "write the report").unwrap();
        assert_eq!(task.summary(), format!("{task}"));
    }
}
````


## `src/tui.rs`

````rust
use std::io;

use ratatui::Frame;
use ratatui::crossterm::cursor::Show;
use ratatui::crossterm::event::{KeyCode, KeyEvent};
use ratatui::crossterm::execute;
use ratatui::crossterm::terminal::{
    EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode,
};
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, ListState, Paragraph};

use crate::task::Task;

/// Restore the terminal when dropped, including during a panic.
pub struct TerminalGuard;

impl TerminalGuard {
    /// Enter raw mode and the alternate screen.
    pub fn enter() -> io::Result<Self> {
        enable_raw_mode()?;
        execute!(io::stdout(), EnterAlternateScreen)?;
        Ok(Self)
    }
}

impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let _ = execute!(io::stdout(), Show, LeaveAlternateScreen);
        let _ = disable_raw_mode();
    }
}

fn centered(area: Rect, percent_x: u16, percent_y: u16) -> Rect {
    let vertical = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(area);
    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(vertical[1])[1]
}

/// The terminal UI's state.
#[derive(Debug)]
pub struct App {
    /// The tasks shown in the list.
    pub tasks: Vec<Task>,
    /// The selected row.
    pub selected: usize,
    /// Set to true to leave the event loop.
    pub quit: bool,
    /// A short status line message.
    pub message: String,
    /// Whether the help overlay is open.
    pub help: bool,
}

impl App {
    /// Build the app from a task list.
    pub fn new(tasks: Vec<Task>) -> Self {
        Self {
            tasks,
            selected: 0,
            quit: false,
            message: "q quit · ↑/↓ move · enter done · ? help".to_string(),
            help: false,
        }
    }

    /// Draw one frame.
    pub fn draw(&self, frame: &mut Frame) {
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1),
                Constraint::Min(3),
                Constraint::Length(1),
            ])
            .split(frame.area());

        let header =
            Paragraph::new("todo — a tiny task manager").style(Style::default().fg(Color::Yellow));
        frame.render_widget(header, chunks[0]);

        let items: Vec<ListItem> = self
            .tasks
            .iter()
            .map(|task| {
                let mark = if task.is_done() { "✓" } else { " " };
                ListItem::new(format!("{mark} #{} {}", task.id, task.title))
            })
            .collect();
        let list = List::new(items)
            .block(Block::default().borders(Borders::ALL).title("Tasks"))
            .highlight_style(Style::default().add_modifier(Modifier::REVERSED));
        let mut state = ListState::default();
        if !self.tasks.is_empty() {
            state.select(Some(self.selected.min(self.tasks.len() - 1)));
        }
        frame.render_stateful_widget(list, chunks[1], &mut state);

        let done = self.tasks.iter().filter(|task| task.is_done()).count();
        let status = format!(
            "{} task(s), {} done · {}",
            self.tasks.len(),
            done,
            self.message
        );
        frame.render_widget(Paragraph::new(status), chunks[2]);

        if self.help {
            let area = centered(frame.area(), 50, 40);
            frame.render_widget(Clear, area);
            let help = Paragraph::new(
                "↑/↓ or j/k  move\nenter/space toggle\nq or esc    quit\n?           close help",
            )
            .block(Block::default().borders(Borders::ALL).title("Help"))
            .style(Style::default().fg(Color::Yellow));
            frame.render_widget(help, area);
        }
    }

    /// Handle one key.
    pub fn handle_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Char('q') | KeyCode::Esc => self.quit = true,
            KeyCode::Char('?') => self.help = !self.help,
            KeyCode::Up | KeyCode::Char('k') => {
                self.selected = self.selected.saturating_sub(1);
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if self.selected + 1 < self.tasks.len() {
                    self.selected += 1;
                }
            }
            KeyCode::Enter | KeyCode::Char(' ') => {
                if let Some(task) = self.tasks.get_mut(self.selected) {
                    if task.is_done() {
                        task.status = crate::task::Status::Pending;
                    } else {
                        task.done();
                    }
                    self.message = format!("toggled task #{}", task.id);
                }
            }
            _ => {}
        }
    }

    /// The selected task, if any.
    pub fn selected_task(&self) -> Option<&Task> {
        self.tasks.get(self.selected)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::Terminal;
    use ratatui::backend::TestBackend;

    fn app() -> App {
        let mut first = Task::new(1, "buy milk").unwrap();
        first.done();
        let second = Task::new(2, "write the report").unwrap();
        App::new(vec![first, second])
    }

    fn screen(app: &App) -> String {
        let backend = TestBackend::new(60, 10);
        let mut terminal = Terminal::new(backend).unwrap();
        terminal.draw(|frame| app.draw(frame)).unwrap();
        terminal
            .backend()
            .buffer()
            .content
            .iter()
            .map(|cell| cell.symbol())
            .collect()
    }

    #[test]
    fn draws_the_tasks_and_status() {
        let text = screen(&app());
        assert!(text.contains("buy milk"));
        assert!(text.contains("write the report"));
        assert!(text.contains("2 task(s), 1 done"));
    }

    #[test]
    fn navigation_and_quit_work() {
        let mut app = app();
        app.handle_key(KeyEvent::from(KeyCode::Down));
        assert_eq!(app.selected, 1);
        app.handle_key(KeyEvent::from(KeyCode::Char('q')));
        assert!(app.quit);
    }

    #[test]
    fn screen_snapshot() {
        let text = screen(&app());
        insta::assert_snapshot!(text);
    }

    #[test]
    fn help_overlay_toggles_and_draws() {
        let mut app = app();
        app.handle_key(KeyEvent::from(KeyCode::Char('?')));
        assert!(app.help);
        let text = screen(&app);
        assert!(text.contains("Help"));
        assert!(text.contains("toggle"));
    }

    #[test]
    fn selected_task_tracks_the_selection() {
        let mut app = app();
        app.handle_key(KeyEvent::from(KeyCode::Down));
        assert_eq!(app.selected_task().unwrap().id, 2);
    }

    #[test]
    fn enter_toggles_the_selected_task() {
        let mut app = app();
        app.handle_key(KeyEvent::from(KeyCode::Enter));
        assert!(!app.tasks[0].is_done());
    }
}
````


## `src/view.rs`

````rust
use std::fmt;

use crate::task::{Status, Task};

/// A zero-copy view of a task: the title is borrowed, not cloned.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TaskView<'a> {
    /// The task's stable id.
    pub id: u32,
    /// The task's title, borrowed from the list.
    pub title: &'a str,
    /// Whether the task is pending or done.
    pub status: Status,
}

impl<'a> TaskView<'a> {
    /// Return true when the task is done.
    pub fn is_done(&self) -> bool {
        self.status == Status::Done
    }
}

impl<'a> From<&'a Task> for TaskView<'a> {
    fn from(task: &'a Task) -> Self {
        Self {
            id: task.id,
            title: &task.title,
            status: task.status,
        }
    }
}

impl fmt::Display for TaskView<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "#{} {} [{}]", self.id, self.title, self.status)
    }
}

#[cfg(test)]
mod tests {
    use crate::store::TodoList;

    #[test]
    fn views_borrow_titles_without_cloning() {
        let mut list = TodoList::new();
        list.add("buy milk").unwrap();
        list.add("write the report").unwrap();

        let views = list.views();

        assert_eq!(views.len(), 2);
        assert_eq!(views[0].title, "buy milk");
        assert_eq!(views[1].title, "write the report");
        assert!(!views[0].is_done());
    }

    #[test]
    fn view_display_matches_the_task_line() {
        let mut list = TodoList::new();
        let id = list.add("buy milk").unwrap();
        list.done(id).unwrap();

        let view = list.views()[0];

        assert_eq!(format!("{view}"), "#1 buy milk [done]");
        assert!(view.is_done());
    }
}
````


## `src/web.rs`

````rust
use std::sync::Arc;

use askama::Template;
use axum::Router;
use axum::extract::{Form, Path, State};
use axum::http::{HeaderName, HeaderValue, StatusCode, header};
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::Deserialize;
use tower::ServiceBuilder;
use tower_http::set_header::SetResponseHeaderLayer;

use crate::auth;
use crate::db::SqliteStore;
use crate::error::TodoError;
use crate::task::Task;

const SESSION_COOKIE: &str = "todo_session";
const CSRF_COOKIE: &str = "todo_csrf";

#[derive(Clone)]
struct WebState {
    store: Arc<SqliteStore>,
}

#[derive(Template)]
#[template(path = "login.html")]
struct LoginTemplate {
    csrf: String,
}

struct TaskRow {
    id: u32,
    title: String,
    done: bool,
}

impl From<&Task> for TaskRow {
    fn from(task: &Task) -> Self {
        Self {
            id: task.id,
            title: task.title.clone(),
            done: task.is_done(),
        }
    }
}

#[derive(Template)]
#[template(path = "index.html")]
struct IndexTemplate {
    csrf: String,
    tasks: Vec<TaskRow>,
}

#[derive(Deserialize)]
struct LoginForm {
    csrf: String,
    email: String,
    password: String,
}

#[derive(Deserialize)]
struct TaskForm {
    csrf: String,
    title: String,
}

#[derive(Deserialize)]
struct CsrfForm {
    csrf: String,
}

/// Build the browser-facing router.
pub fn router(store: SqliteStore) -> Router {
    let state = WebState {
        store: Arc::new(store),
    };

    Router::new()
        .route("/", get(index))
        .route("/login", get(login_page).post(login))
        .route("/logout", post(logout))
        .route("/tasks", post(create_task))
        .route("/tasks/{id}/done", post(done_task))
        .route("/assets/app.css", get(assets))
        .with_state(state)
        .layer(
            ServiceBuilder::new()
                .layer(SetResponseHeaderLayer::overriding(
                    HeaderName::from_static("x-content-type-options"),
                    HeaderValue::from_static("nosniff"),
                ))
                .layer(SetResponseHeaderLayer::overriding(
                    HeaderName::from_static("x-frame-options"),
                    HeaderValue::from_static("DENY"),
                ))
                .layer(SetResponseHeaderLayer::overriding(
                    HeaderName::from_static("referrer-policy"),
                    HeaderValue::from_static("no-referrer"),
                ))
                .layer(SetResponseHeaderLayer::overriding(
                    HeaderName::from_static("content-security-policy"),
                    HeaderValue::from_static(
                        "default-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'",
                    ),
                )),
        )
}

fn csrf(jar: &CookieJar) -> (String, CookieJar) {
    if let Some(cookie) = jar.get(CSRF_COOKIE) {
        return (cookie.value().to_string(), jar.clone());
    }
    let token = auth::new_token();
    let cookie = Cookie::build((CSRF_COOKIE, token.clone()))
        .path("/")
        .same_site(SameSite::Lax)
        .http_only(false)
        .build();
    (token, jar.clone().add(cookie))
}

async fn user_id(state: &WebState, jar: &CookieJar) -> Result<Option<i64>, TodoError> {
    let Some(cookie) = jar.get(SESSION_COOKIE) else {
        return Ok(None);
    };
    state
        .store
        .user_for_token(&auth::token_hash(cookie.value()))
        .await
}

fn render<T: Template>(template: T) -> Result<Html<String>, StatusCode> {
    template
        .render()
        .map(Html)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn index(State(state): State<WebState>, jar: CookieJar) -> Response {
    let Some(user_id) = user_id(&state, &jar).await.ok().flatten() else {
        return Redirect::to("/login").into_response();
    };
    let (csrf, jar) = csrf(&jar);
    let tasks = state
        .store
        .list_owned(user_id)
        .await
        .unwrap_or_default()
        .iter()
        .map(TaskRow::from)
        .collect();
    match render(IndexTemplate { csrf, tasks }) {
        Ok(page) => (jar, page).into_response(),
        Err(status) => status.into_response(),
    }
}

async fn login_page(jar: CookieJar) -> Response {
    let (csrf, jar) = csrf(&jar);
    match render(LoginTemplate { csrf }) {
        Ok(page) => (jar, page).into_response(),
        Err(status) => status.into_response(),
    }
}

async fn login(
    State(state): State<WebState>,
    jar: CookieJar,
    Form(form): Form<LoginForm>,
) -> Response {
    let Some(cookie) = jar.get(CSRF_COOKIE) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if cookie.value() != form.csrf {
        return StatusCode::FORBIDDEN.into_response();
    }

    let Ok(Some(user)) = state.store.find_user_by_email(&form.email).await else {
        return (StatusCode::UNAUTHORIZED, "invalid email or password").into_response();
    };
    if !auth::verify_password(&user.password_hash, &form.password) {
        return (StatusCode::UNAUTHORIZED, "invalid email or password").into_response();
    }

    let token = auth::new_token();
    let expires = (chrono::Utc::now() + chrono::Duration::days(7))
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    if state
        .store
        .create_session(user.id, &auth::token_hash(&token), &expires)
        .await
        .is_err()
    {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let cookie = Cookie::build((SESSION_COOKIE, token))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .build();
    (jar.add(cookie), Redirect::to("/")).into_response()
}

async fn create_task(
    State(state): State<WebState>,
    jar: CookieJar,
    Form(form): Form<TaskForm>,
) -> Response {
    let Some(user_id) = user_id(&state, &jar).await.ok().flatten() else {
        return Redirect::to("/login").into_response();
    };
    let Some(cookie) = jar.get(CSRF_COOKIE) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if cookie.value() != form.csrf {
        return StatusCode::FORBIDDEN.into_response();
    }
    if state.store.add_owned(&form.title, user_id).await.is_err() {
        return StatusCode::UNPROCESSABLE_ENTITY.into_response();
    }
    Redirect::to("/").into_response()
}

async fn done_task(
    Path(id): Path<u32>,
    State(state): State<WebState>,
    jar: CookieJar,
    Form(form): Form<CsrfForm>,
) -> Response {
    let Some(user_id) = user_id(&state, &jar).await.ok().flatten() else {
        return Redirect::to("/login").into_response();
    };
    let Some(cookie) = jar.get(CSRF_COOKIE) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if cookie.value() != form.csrf {
        return StatusCode::FORBIDDEN.into_response();
    }
    if state.store.done_owned(id, user_id).await.is_err() {
        return StatusCode::NOT_FOUND.into_response();
    }
    Redirect::to("/").into_response()
}

async fn logout(
    State(state): State<WebState>,
    jar: CookieJar,
    Form(form): Form<CsrfForm>,
) -> Response {
    let Some(cookie) = jar.get(CSRF_COOKIE) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if cookie.value() != form.csrf {
        return StatusCode::FORBIDDEN.into_response();
    }
    if let Some(session) = jar.get(SESSION_COOKIE) {
        let _ = state
            .store
            .delete_session(&auth::token_hash(session.value()))
            .await;
    }
    let jar = jar.remove(Cookie::from(SESSION_COOKIE));
    (jar, Redirect::to("/login")).into_response()
}

async fn assets() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "text/css; charset=utf-8"),
            (header::CACHE_CONTROL, "public, max-age=3600"),
        ],
        include_str!("../assets/app.css"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    async fn test_app() -> (tempfile::TempDir, SqliteStore, Router) {
        let dir = tempfile::tempdir().unwrap();
        let url = format!("sqlite://{}", dir.path().join("todo.db").display());
        let store = SqliteStore::open(&url).await.unwrap();
        (dir, store.clone(), router(store))
    }

    #[test]
    fn index_page_snapshot() {
        let page = IndexTemplate {
            csrf: "csrf".to_string(),
            tasks: vec![TaskRow {
                id: 1,
                title: "buy milk".to_string(),
                done: false,
            }],
        }
        .render()
        .unwrap();

        insta::assert_snapshot!(page);
    }

    #[test]
    fn pages_have_language_labels_and_headings() {
        let login = LoginTemplate {
            csrf: "csrf".to_string(),
        }
        .render()
        .unwrap();
        assert!(login.contains("<html lang=\"en\">"));
        assert!(login.contains("<label>Email"));
        assert!(login.contains("<h1>Log in</h1>"));

        let index = IndexTemplate {
            csrf: "csrf".to_string(),
            tasks: vec![],
        }
        .render()
        .unwrap();
        assert!(index.contains("<html lang=\"en\">"));
        assert!(index.contains("<h1>Tasks</h1>"));
    }

    #[test]
    fn titles_are_escaped() {
        let page = IndexTemplate {
            csrf: "csrf".to_string(),
            tasks: vec![TaskRow {
                id: 1,
                title: "<script>alert(1)</script>".to_string(),
                done: false,
            }],
        }
        .render()
        .unwrap();

        assert!(page.contains("&#60;script&#62;"));
        assert!(!page.contains("<script>alert(1)</script>"));
    }

    #[tokio::test]
    async fn login_page_has_a_csrf_field() {
        let (_dir, _store, app) = test_app().await;
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/login")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(body.contains("name=\"csrf\""));
    }

    #[tokio::test]
    async fn tasks_require_a_session() {
        let (_dir, _store, app) = test_app().await;
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/tasks")
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from("csrf=x&title=buy+milk"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert_eq!(response.headers()[header::LOCATION], "/login");
    }

    #[tokio::test]
    async fn assets_have_css_and_cache_headers() {
        let (_dir, _store, app) = test_app().await;
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/assets/app.css")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert!(
            response.headers()[header::CONTENT_TYPE]
                .to_str()
                .unwrap()
                .contains("text/css")
        );
        assert!(
            response.headers()[header::CACHE_CONTROL]
                .to_str()
                .unwrap()
                .contains("max-age")
        );
    }

    #[tokio::test]
    async fn pages_have_security_headers() {
        let (_dir, _store, app) = test_app().await;
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/login")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.headers()["x-content-type-options"], "nosniff");
        assert_eq!(response.headers()["x-frame-options"], "DENY");
        assert_eq!(response.headers()["referrer-policy"], "no-referrer");
        assert!(
            response.headers()["content-security-policy"]
                .to_str()
                .unwrap()
                .contains("default-src 'self'")
        );
    }

    #[tokio::test]
    async fn create_with_wrong_csrf_is_403() {
        let (_dir, store, app) = test_app().await;
        let hash = auth::hash_password("secret").unwrap();
        let user_id = store.create_user("csrf@example.com", &hash).await.unwrap();
        let token = auth::new_token();
        store
            .create_session(user_id, &auth::token_hash(&token), "2099-01-01T00:00:00Z")
            .await
            .unwrap();
        let cookies = format!("{SESSION_COOKIE}={token}; {CSRF_COOKIE}=right");

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/tasks")
                    .header(header::COOKIE, &cookies)
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from("csrf=wrong&title=buy+milk"))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn login_sets_a_session_cookie() {
        let (_dir, store, app) = test_app().await;
        let hash = auth::hash_password("secret").unwrap();
        store.create_user("login@example.com", &hash).await.unwrap();

        let page = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/login")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let set_cookie = page.headers()[header::SET_COOKIE]
            .to_str()
            .unwrap()
            .to_string();
        let csrf = set_cookie
            .split(';')
            .next()
            .unwrap()
            .strip_prefix("todo_csrf=")
            .unwrap()
            .to_string();

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/login")
                    .header(header::COOKIE, format!("{CSRF_COOKIE}={csrf}"))
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from(format!(
                        "csrf={csrf}&email=login@example.com&password=secret"
                    )))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        let cookies: Vec<String> = response
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .map(str::to_string)
            .collect();
        let session = cookies
            .iter()
            .find(|cookie| cookie.starts_with("todo_session="))
            .expect("session cookie");
        assert!(session.contains("HttpOnly"));
        assert!(session.contains("SameSite=Lax"));
    }

    #[tokio::test]
    async fn blank_title_form_is_422() {
        let (_dir, store, app) = test_app().await;
        let hash = auth::hash_password("secret").unwrap();
        let user_id = store.create_user("blank@example.com", &hash).await.unwrap();
        let token = auth::new_token();
        store
            .create_session(user_id, &auth::token_hash(&token), "2099-01-01T00:00:00Z")
            .await
            .unwrap();
        let cookies = format!("{SESSION_COOKIE}={token}; {CSRF_COOKIE}=csrf");

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/tasks")
                    .header(header::COOKIE, &cookies)
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from("csrf=csrf&title=+++"))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn logged_in_user_can_add_a_task() {
        let (_dir, store, app) = test_app().await;
        let hash = auth::hash_password("secret").unwrap();
        let user_id = store.create_user("a@example.com", &hash).await.unwrap();
        let token = auth::new_token();
        store
            .create_session(user_id, &auth::token_hash(&token), "2099-01-01T00:00:00Z")
            .await
            .unwrap();
        let cookies = format!("{SESSION_COOKIE}={token}; {CSRF_COOKIE}=csrf");

        let page = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/")
                    .header(header::COOKIE, &cookies)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(page.status(), StatusCode::OK);

        let create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/tasks")
                    .header(header::COOKIE, &cookies)
                    .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
                    .body(Body::from("csrf=csrf&title=buy+milk"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create.status(), StatusCode::SEE_OTHER);

        let page = app
            .oneshot(
                Request::builder()
                    .uri("/")
                    .header(header::COOKIE, &cookies)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let bytes = axum::body::to_bytes(page.into_body(), usize::MAX)
            .await
            .unwrap();
        let body = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(body.contains("buy milk"));
    }
}
````


## `src/worker.rs`

````rust
use std::path::PathBuf;
use std::sync::mpsc::{self, Sender};
use std::thread::{self, JoinHandle};

use crate::store::TodoList;

/// A background worker that saves lists in the order they are sent.
#[derive(Debug)]
pub struct SaveWorker {
    tx: Sender<Message>,
    handle: Option<JoinHandle<()>>,
}

#[derive(Debug)]
enum Message {
    Save { list: TodoList, path: PathBuf },
    Stop,
}

impl SaveWorker {
    /// Start the worker thread.
    pub fn spawn() -> Self {
        let (tx, rx) = mpsc::channel::<Message>();
        let handle = thread::spawn(move || {
            while let Ok(message) = rx.recv() {
                match message {
                    Message::Save { list, path } => {
                        if let Err(error) = list.save(&path) {
                            tracing::error!(%error, "background save failed");
                        }
                    }
                    Message::Stop => break,
                }
            }
        });

        Self {
            tx,
            handle: Some(handle),
        }
    }

    /// Queue a save; the worker owns the list from here.
    pub fn save(&self, list: TodoList, path: PathBuf) {
        if self.tx.send(Message::Save { list, path }).is_err() {
            tracing::error!("save worker is gone");
        }
    }
}

impl Drop for SaveWorker {
    fn drop(&mut self) {
        let _ = self.tx.send(Message::Stop);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::summary::Summary;

    #[test]
    fn saves_in_the_background() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("todo.json");
        let mut list = TodoList::new();
        list.add("buy milk").unwrap();

        let worker = SaveWorker::spawn();
        worker.save(list, path.clone());
        drop(worker);

        let loaded = TodoList::load(&path).unwrap();
        assert_eq!(loaded.summary(), "1 task(s), 0 done");
    }
}
````
