---
title: Templates and layout
day: 44
part: VIII
partName: The web UI
partDay: 1
partDays: 5
time: "2.5 hours"
description: Render the first browser pages with Askama — a shared layout, a login page, and the task list — and serve them from the same Axum app.
bullets:
  - add `askama` templates with a shared layout;
  - render a typed template from a handler;
  - redirect a signed-out visitor to the login page.
---

The API speaks JSON. A person wants a page. Today the app gets a server-rendered
UI: a layout, a login form, and the task list, all rendered from templates.

The pages are HTML on the server; there is no client-side framework and no
JavaScript required. That keeps the first web UI small enough to understand.

## Add Askama

Askama compiles templates into Rust code. Add it with the other dependencies:

```toml
askama = "0.14"
```

The version resolves to one compatible with the crate's `rust-version`. The
templates live in `templates/` by default.

## The layout

Create `templates/base.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{% block title %}todo{% endblock %}</title>
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body>
  <header><a href="/">todo</a></header>
  <main>{% block content %}{% endblock %}</main>
</body>
</html>
```

The layout owns the document shell. Child templates fill `title` and
`content`. Askama's `{% extends %}` and `{% block %}` work like a small,
compile-time layout engine.

## The login page

Create `templates/login.html`:

```html
{% extends "base.html" %}
{% block title %}Log in — todo{% endblock %}
{% block content %}
<h1>Log in</h1>
<form method="post" action="/login">
  <input type="hidden" name="csrf" value="{{ csrf }}">
  <label>Email <input type="email" name="email" required></label>
  <label>Password <input type="password" name="password" required></label>
  <button type="submit">Log in</button>
</form>
{% endblock %}
```

The `csrf` value is a placeholder; the handler supplies it. Askama escapes
`{{ ... }}` by default, so a title cannot inject HTML. That is the main reason
to use a template engine instead of `format!` strings.

## The task list

Create `templates/index.html`:

```html
{% extends "base.html" %}
{% block title %}Tasks — todo{% endblock %}
{% block content %}
<h1>Tasks</h1>
<form method="post" action="/tasks">
  <input type="hidden" name="csrf" value="{{ csrf }}">
  <input type="text" name="title" placeholder="What needs doing?" required>
  <button type="submit">Add</button>
</form>
<ul>
{% for task in tasks %}
  <li>
    <span class="{% if task.done %}done{% endif %}">{{ task.title }}</span>
    {% if !task.done %}
    <form method="post" action="/tasks/{{ task.id }}/done">
      <input type="hidden" name="csrf" value="{{ csrf }}">
      <button type="submit">Done</button>
    </form>
    {% endif %}
  </li>
{% endfor %}
</ul>
<form method="post" action="/logout">
  <input type="hidden" name="csrf" value="{{ csrf }}">
  <button type="submit">Log out</button>
</form>
{% endblock %}
```

The template loops over a small view model, not the database entity. That keeps
the template free of method calls and database details.

## The template structs

In `src/web.rs`:

<!-- verify: src/web.rs at=day-44 -->
```rust title="src/web.rs"
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
```

`#[derive(Template)]` reads the file at compile time and generates a `render`
method. A missing field in the template is a compile error, not a runtime 500.

## The router

<!-- verify: src/web.rs at=day-44 -->
```rust title="src/web.rs"
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
}
```

The web router shares the store with the API router. The server binary merges
them:

```rust
let app = api::router(store.clone()).merge(web::router(store));
```

## Render the pages

<!-- verify: src/web.rs at=day-44 -->
```rust title="src/web.rs"
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
```

`index` checks the session cookie. No session means a redirect to `/login`, not
an error page. `login_page` creates a CSRF token cookie if it is missing and
hands the same token to the template.

## Try it

```bash
$ cargo test
...
test web::tests::login_page_has_a_csrf_field ... ok
test web::tests::tasks_require_a_session ... ok
test web::tests::logged_in_user_can_add_a_task ... ok
...
```

Start the server and open `http://127.0.0.1:8080/login`. A login form appears.
The task list requires a session; the full flow is tested in the module.

## Save your work

```bash
$ git add -A
$ git commit -m "day 44: render the first web pages"
[main (root-commit) ...] day 44: render the first web pages
 44 files changed, 5864 insertions(+)
...
$ git log --oneline
... day 44: render the first web pages
```

## If something went wrong

**`template not found`.** The path in `#[template(path = "...")]` is relative to
`templates/`. Check the file name and the `askama` version.

**A template field is missing.** The struct does not match the placeholders.
Add the field, or remove the placeholder; the compiler names the template.

**The page shows `{% ... %}`.** The response is the raw file, not the rendered
template. Check the handler's return type and that you called `render()`.

**HTML appears as text.** The response content type is wrong. `Html` sets
`text/html`; a `String` alone may not.

**A title injects markup.** Askama escapes `{{ }}` by default. Do not use
`|safe` on user input; that disables the protection.

**The page is blank.** The template block names do not match the layout, or the
child does not extend `base.html`.

## Going deeper: server-rendered HTML

Server-rendered pages are a good fit when the state is already on the server
and the interactions are forms. The browser sends a request, the server
returns HTML, and the page works without a JavaScript bundle.

The cost is a full page load per action. For a todo app, that is fine. The
`submit → redirect → GET` pattern (Post/Redirect/Get) keeps refreshes from
repeating a write; the next lesson uses it for the forms.

Askama is compile-time: a typo in a template fails the build. A runtime
template engine can change templates without recompiling, but it moves the
error to production. The app's templates change with the code, so compile-time
is the right trade.

