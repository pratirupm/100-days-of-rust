---
title: "Day 45 — Forms and validation"
description: "Read a browser form with Axum's Form extractor, validate the title, and redirect after a successful write. — Day 45 of 100 Days of Rust."
sidebar:
  order: 45
day: 45
---

**About 2 hours** · Part VIII, day 2 of 5.

**You'll be able to:**

- parse `application/x-www-form-urlencoded` with `Form`;
- reject a blank title with 422;
- use submit → redirect → GET.

---

The task page has a form. A browser sends it as
`application/x-www-form-urlencoded`, not JSON. Axum's `Form` extractor turns
that body into a typed struct, just as `Json` does for the API.

Today the form becomes a real write path, with validation and a redirect.

## The form type

<!-- verify: src/web.rs at=day-45 -->
```rust title="src/web.rs"
struct TaskForm {
    csrf: String,
    title: String,
}
```

The field names match the HTML `name` attributes. A missing field is a
deserialization error before the handler runs. The `title` is still a raw
string; the store validates it.

## The handler

<!-- verify: src/web.rs at=day-45 -->
```rust title="src/web.rs"
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
```

The order matters:

1. A session is required; without one, redirect to the login page.
2. The CSRF token must match the cookie.
3. The store validates the title and writes the task.
4. On success, redirect to `/`.

The **Post/Redirect/Get** pattern is the last step. A refresh after a redirect
repeats the `GET /`, not the `POST /tasks`; it cannot create a duplicate task.

A 422 for a blank title is honest: the form was understood, but the value is
not acceptable. A 400 would suggest a malformed request; a 500 would blame the
server.

The form does not preserve the input after a validation error. That is a
usability gap: a real page would re-render the form with the submitted title
and an error message. The test pins the status; the next improvement is a
template that takes an optional error.

## The validation test

<!-- verify: src/web.rs at=day-45 -->
```rust title="src/web.rs"
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
```

`title=+++` decodes to three spaces. The store trims it to empty and returns
`EmptyTitle`; the handler maps that to 422. The test sets the session and CSRF
cookies directly so it can focus on the form rule.

## Try it

```bash
$ cargo test
...
test web::tests::blank_title_form_is_422 ... ok
test web::tests::logged_in_user_can_add_a_task ... ok
...
```

In the browser, log in, type a title, press Add. The page returns to the list
with the new task. Submit spaces and the request is rejected.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 45: validate the browser forms"
[main ...] day 45: validate the browser forms
 44 files changed, 5892 insertions(+)
...
$ git log --oneline
... day 45: validate the browser forms
```

## If something went wrong

**`415 Unsupported Media Type`.** The form was sent as JSON or with no
`content-type`. Browsers send `application/x-www-form-urlencoded`; a test must
set the header.

**`422` before the handler.** A required field is missing from the form body.
Check the `name` attributes and the struct fields.

**A blank title creates a task.** The handler is not using the store's
validation, or it ignores the error. The `add_owned` call must return
`EmptyTitle`.

**The browser asks to resubmit on refresh.** The handler returns HTML instead of
a redirect. Use `Redirect::to("/")` after a successful write.

**The CSRF check returns 403 in a test.** The cookie and the form token must be
the same string; the test above uses `csrf` for both.

**The form works for one user and not another.** The session cookie belongs to
the other user, or the task was created without `owner_id`. Check the session
and the owned insert.

## Going deeper: forms are a public API

A form is an interface: field names, method, action, and status codes. Changing
a field name breaks every bookmarked or scripted submission. Keep the names
stable and version the page if the shape changes.

Validation belongs in one place. The store's `EmptyTitle` is the same rule the
API uses; the handler maps it to 422. Do not duplicate the check in the
template, the handler, and the database. One rule, one error, two transports
(JSON and form).

The next lesson explains why the token is required on every mutating form and
hardens the session cookie.

<div class="day-tracker" data-day="45"></div>
