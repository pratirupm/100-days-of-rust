---
title: Users and sessions
day: 41
part: VII
partName: The HTTP API
partDay: 4
partDays: 5
time: "3 hours"
description: Register a user with Argon2id, log in with a hashed session token, and attach the user to a request with an extractor.
bullets:
  - store users with Argon2id password hashes;
  - issue a random session token and store only its hash;
  - extract the current user from a bearer token.
---

Tasks need an owner. Before the tasks can be scoped, the API needs users and a
way to prove who is calling.

Today we add registration, login, sessions, and a `CurrentUser` extractor. The
task routes stay open for one more lesson; the next one makes every task belong
to a user.

## Add the dependencies

```toml
argon2 = "0.5"
rand_core = { version = "0.6", features = ["getrandom"] }
sha2 = "0.10"
uuid = { version = "1", features = ["v4", "v7"] }
```

`argon2` hashes passwords, `sha2` hashes session tokens, `uuid` makes the token,
and `rand_core` gives Argon2 its OS-backed salt source. The `getrandom` feature
is what puts `OsRng` in scope.

Declare the module and re-export the user type in `src/lib.rs`:

```rust
pub mod auth;
pub use auth::User;
```

Add the new error variants and the API error cases:

<!-- verify: src/error.rs at=day-41 -->
```rust title="src/error.rs"
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
```

The API's error enum gains the matching cases:

<!-- verify: src/api.rs at=HEAD -->
```rust title="src/api.rs"
async fn register(
    State(state): State<AppState>,
    Json(body): Json<Register>,
) -> Result<(StatusCode, Json<Me>), ApiError> {
    let password = body.password.clone();
    let hash = tokio::task::spawn_blocking(move || auth::hash_password(&password))
        .await
        .map_err(|error| TodoError::Password(error.to_string()))??;
    let id = state.store.create_user(&body.email, &hash).await?;
    Ok((StatusCode::CREATED, Json(Me { user_id: id })))
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<Login>,
) -> Result<Json<Session>, ApiError> {
    let user = state.store.find_user_by_email(&body.email).await?;
    let hash = user
        .as_ref()
        .map(|user| user.password_hash.clone())
        .unwrap_or_else(|| auth::dummy_hash().to_string());
    let password = body.password.clone();
    let valid = tokio::task::spawn_blocking(move || auth::verify_password(&hash, &password))
        .await
        .map_err(|error| TodoError::Password(error.to_string()))?;
    let user = user
        .filter(|_| valid)
        .ok_or_else(|| ApiError::Unauthorized("invalid email or password".to_string()))?;

    let token = auth::new_token();
    let expires = (Utc::now() + ChronoDuration::days(7)).to_rfc3339_opts(SecondsFormat::Secs, true);
    state
        .store
        .create_session(user.id, &auth::token_hash(&token), &expires)
        .await?;
    Ok(Json(Session { token }))
}
```

## The tables

Create `migrations/0004_users_sessions.sql`:

<!-- verify: migrations/0004_users_sessions.sql at=day-41 -->
```sql title="migrations/0004_users_sessions.sql"
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id),
    expires_at TEXT NOT NULL
);

ALTER TABLE tasks ADD COLUMN owner_id INTEGER;
```

The email is unique. The password column stores a **hash**, never the password.
The session table stores a **hash of the token**, not the token: a database leak
must not hand an attacker a working session. `owner_id` is nullable for the
existing tasks; the authorization lesson decides what to do with them.

## Passwords

Create `src/auth.rs`:

<!-- verify: src/auth.rs at=day-41 -->
```rust title="src/auth.rs"
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
```

Argon2id is a memory-hard password hash: slow for an attacker, fast enough for
one login. `SaltString::generate` uses the OS random source; the salt is stored
inside the hash string, so verification needs only the string and the password.

`verify_password` returns `false` for a malformed hash instead of panicking. A
corrupt row should fail the login, not crash the server.

Session tokens are random UUIDv4 strings. They are hashed with SHA-256 before
storage: the token is a high-entropy secret, so a fast hash is enough; passwords
are low-entropy, so they need Argon2.

## Store the user

Add to `src/db.rs`:

<!-- verify: src/db.rs at=day-41 -->
```rust title="src/db.rs"
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
```

The duplicate check is a friendly error, not a guarantee: two simultaneous
registrations can both pass it. The `UNIQUE` constraint is the real guard; the
database will reject the second insert. A production API would catch that
specific error and return 409 as well.

## Store the session

<!-- verify: src/db.rs at=day-41 -->
```rust title="src/db.rs"
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
```

The expiry check is in SQL, so expired sessions are never returned. RFC 3339
UTC strings sort lexicographically, which makes the comparison valid.

## The API

Add the request and response types:

<!-- verify: src/api.rs at=day-41 -->
```rust title="src/api.rs"
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
```

The routes:

<!-- verify: src/api.rs at=day-41 -->
```rust title="src/api.rs"
        .route("/api/v1/users", post(register))
        .route("/api/v1/sessions", post(login))
        .route("/api/v1/me", get(me))
```

Registration hashes the password and stores the user; login verifies it and
issues a session:

<!-- verify: src/api.rs at=day-41 -->
```rust title="src/api.rs"
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
```

An unknown email and a wrong password produce the same 401 message. That is
deliberate: the response must not reveal which emails are registered. The
unknown-email path still runs Argon2 against a dummy hash, so its timing is not
a second oracle. Both the hash and the verify run on a blocking thread;
Argon2 is deliberately expensive and must not stall a Tokio worker.

The session token is returned once, to the client. The server keeps only its
hash. A client that loses the token logs in again; the server cannot recover it.

## The extractor

<!-- verify: src/api.rs at=day-41 -->
```rust title="src/api.rs"
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
```

`FromRequestParts` is how Axum turns request metadata into a typed argument.
Any handler that takes `CurrentUser` is protected: the handler does not run if
the token is missing or expired.

## The tests

<!-- verify: src/api.rs at=day-41 -->
```rust title="src/api.rs"
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
```

The full registration test registers, logs in, reads the token, and calls
`/me` with `Authorization: Bearer ...`. It asserts the returned user id. The
duplicate-email test registers twice and expects 409.

## Run it

```bash
$ cargo test
...
test api::tests::me_without_token_is_401 ... ok
test api::tests::duplicate_email_is_409 ... ok
test api::tests::register_login_and_me ... ok
...
```

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 41: register users and issue sessions"
[main ...] day 41: register users and issue sessions
 39 files changed, 5098 insertions(+)
...
$ git log --oneline
... day 41: register users and issue sessions
```

## If something went wrong

**`OsRng` is not found.** The `rand_core` dependency needs the `getrandom`
feature. Add it, or use a `rand` version with `OsRng`.

**A password verifies after the hash changes.** Argon2 stores the salt and
parameters inside the hash string. Rehashing with a different cost produces a
different string but still verifies; do not compare hash strings for equality.

**The session token is in the database in plain text.** The schema or the code
stores the token, not `token_hash`. Fix it before shipping; a database leak
would be a login for every row.

**Login succeeds for an unknown email.** You are skipping the
`find_user_by_email` result or the password check. Both must pass.

**The session expires immediately.** The expiry string must be UTC RFC 3339 and
the database comparison uses the same format. Do not mix local time.

**`/me` returns 401 with a valid token.** The token was hashed with a different
function, or the session row expired. Check `token_hash` and the clock.

**Passwords appear in logs.** Never log a request body from the auth routes.
The tracing layer logs method, path, and status, not bodies; keep it that way.

## Going deeper: sessions and tokens

A **session** is server-side state: the token is a lookup key, and revoking the
row logs the user out. A **JWT** is stateless: the token carries signed claims,
and revocation needs a denylist. Sessions are easier to revoke and easier to
get right.

Cookies and bearers are two transports for the same token. A browser wants an
`HttpOnly`, `Secure`, `SameSite` cookie; a CLI wants an `Authorization` header.
The extractor can accept both, with the cookie checked after the header.

Session expiry is not logout. Expired rows stay in the table until a cleanup
job removes them; the query ignores them. A production job deletes old rows on
a timer.

