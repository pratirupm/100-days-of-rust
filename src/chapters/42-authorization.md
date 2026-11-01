---
title: Authorization
day: 42
part: VII
partName: The HTTP API
partDay: 5
partDays: 5
time: "2.5 hours"
description: Make every task query owner-scoped, return 404 for someone else's task, and prove it with two users.
bullets:
  - add owner-aware queries to the store;
  - take `CurrentUser` in every task handler;
  - test that one user cannot see or touch another's task.
---

Authentication answers "who are you?" Authorization answers "what may you
touch?" The API can authenticate a request and still leak every task if the
queries ignore the owner.

Today every task query gets an owner, and a second user proves the boundary.

## Owner-aware queries

Add four methods to `src/db.rs`:

<!-- verify: src/db.rs at=day-42 -->
```rust title="src/db.rs"
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
```

Every statement carries `owner_id` — not only the `SELECT`. The `UPDATE` and
the `INSERT` include it too. A query without the owner is an authorization bug,
even if the handler is "only reading."

The old `add`, `list`, `find`, and `done` methods remain for the CLI and the
tests. The API uses the owned variants.

## The handlers

<!-- verify: src/api.rs at=day-42 -->
```rust title="src/api.rs"
async fn list_tasks(
    CurrentUser { id }: CurrentUser,
    State(state): State<AppState>,
) -> Result<Json<Vec<Task>>, ApiError> {
    Ok(Json(state.store.list_owned(id).await?))
}

async fn create_task(
    CurrentUser { id: user_id }: CurrentUser,
    State(state): State<AppState>,
    Json(body): Json<CreateTask>,
) -> Result<(StatusCode, Json<Task>), ApiError> {
    let id = state.store.add_owned(&body.title, user_id).await?;
    let task = state
        .store
        .find_owned(id, user_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("no task with id {id}")))?;
    Ok((StatusCode::CREATED, Json(task)))
}
```

`CurrentUser` is an extractor: the handler does not run without a valid session.
The user id comes from the session, never from the request body. A client cannot
choose whose task it is writing.

`get_task` and `done_task` use `find_owned` and `done_owned`. A task that
belongs to someone else is indistinguishable from a task that does not exist:
both return 404. A 403 would confirm the id is real; 404 leaks less.

## The scoped test

<!-- verify: src/api.rs at=day-42 -->
```rust title="src/api.rs"
        let alice = auth_token(&app, "alice@example.com").await;
...
        let id = value["id"].as_i64().unwrap();

        let bob = auth_token(&app, "bob@example.com").await;
...
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value, json!([]));
...
        assert_eq!(get.status(), StatusCode::NOT_FOUND);
```

The test registers two users, creates a task as Alice, then lists and gets as
Bob. Bob sees an empty list and a 404. The elisions hide the request builders;
the assertions are the contract.

The `auth_token` helper registers and logs in a fresh user for each test. It
uses an email per test so the unique constraint does not collide.

## Run it

```bash
$ cargo test
...
test api::tests::tasks_are_scoped_to_the_owner ... ok
test api::tests::missing_task_is_404 ... ok
test api::tests::create_returns_201_and_the_task ... ok
...
```

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 42: scope every task to its owner"
[main ...] day 42: scope every task to its owner
 39 files changed, 5258 insertions(+)
...
$ git log --oneline
... day 42: scope every task to its owner
```

## If something went wrong

**A user sees another user's task.** A handler uses `list`/`find` instead of
`list_owned`/`find_owned`, or the SQL lost the `owner_id` predicate. Add the
predicate to every statement, including updates.

**The API returns 403 instead of 404.** Both are defensible, but 403 confirms
the id exists. For user-owned resources, 404 is usually the safer default.

**Old tasks disappear.** Rows created before migration 0004 have `owner_id
NULL`; no user owns them. Decide whether to assign them to a `legacy` user or
delete them. Do not silently show them to everyone.

**The wrong user id is used.** `CurrentUser.id` is the users table id, not the
task id. Pass it as `owner_id`, not as the task id.

**A missing token returns 500.** `CurrentUser`'s rejection is `ApiError`; its
`IntoResponse` maps `Unauthorized` to 401. Check the conversion, not the
handler.

**The cross-user test passes when it should not.** The second user may be
reusing the first user's token, or the test app is shared between tests. Use a
fresh app and a distinct email.

## Going deeper: authorization is a query property

It is tempting to write an authorization middleware and assume it covers every
route. Authentication can be centralized; authorization usually lives in the
query. The rule is simple: a query that returns user data must constrain it by
the user in the same statement.

A store method that takes `owner_id` makes the rule hard to forget. A
handler that calls a generic `list()` makes it easy to forget. The type system
does not enforce the predicate; the tests and the method names do.

Admin access is a deliberate exception, not a second code path hidden in the
handler. Give admins a separate scope and log every cross-user read. The audit
lesson in the shipping part returns to this.

