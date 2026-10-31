---
title: "Day 49 — Review: Part VIII"
description: "Catch up on templates, forms, CSRF, cookies, embedded assets, security headers, and page tests, then tag Part VIII. — Day 49 of 100 Days of Rust."
sidebar:
  order: 49
day: 49
---

**About 1.5 hours** · Part VIII, review.

Part VIII gave the app a browser face: a shared layout, login and task pages,
forms with validation, CSRF-protected writes, secure session cookies, embedded
CSS, security headers, and page snapshots.

The API and the web UI share the store and the session table. A browser login
and a CLI bearer token are two doors into the same account.

## Run the check

```bash
$ make check
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
...
cargo test --locked --workspace
...
test result: ok. ...
...
RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps
 Documenting todo v0.1.0 (...)
    Finished `dev` profile ...
   Generated /target/doc/todo/index.html
```

## Read the web layer

<!-- transcripts: authored -->
```text
templates/
├── base.html      the document shell and blocks
├── login.html     the login form
└── index.html     the task list and forms
assets/
└── app.css        the stylesheet, embedded in the binary
src/
└── web.rs         router, handlers, cookies, CSRF, tests
```

The templates are compile-time checked. The CSS is embedded with
`include_str!`. The router is merged with the API router in `todo-server`.

## Exercise it

<!-- transcripts: authored -->
```bash
$ cargo run --bin todo-server
listening on http://127.0.0.1:8080
```

Open `http://127.0.0.1:8080/login`. Log in, add a task, mark it done, log out.
The page is server-rendered; each action is a form POST followed by a redirect.

## What you should be able to explain

- Why the layout uses blocks instead of string formatting.
- Why a blank title is 422 and a wrong CSRF token is 403.
- Why the session cookie is `HttpOnly` and `SameSite=Lax`.
- Why the CSRF cookie is not `HttpOnly`.
- Why the form uses Post/Redirect/Get.
- Why the stylesheet is embedded instead of served from a directory.
- What each security header prevents.
- Why a page snapshot must use fixed data.

## Check your history

<!-- transcripts: authored -->
```bash
$ git log --oneline
... day 48: snapshot pages and check accessibility
... day 47: serve embedded assets with security headers
... day 46: require CSRF tokens and secure cookies
... day 45: validate the browser forms
... day 44: render the first web pages
$ git tag part-viii
```

## If something is red

**The CSS is missing.** The asset route is wrong, or CSP blocks it. Check
`/assets/app.css` and the `style-src` directive.

**A form returns 403.** The CSRF cookie and the hidden field differ. Re-render
the page and use the cookie the server set.

**A login redirects back to `/login`.** The session cookie was not stored, or
the session row expired. Check `Set-Cookie` and the expiry.

**The snapshot changed after a layout edit.** Read the diff; accept it only if
the new HTML is intended.

**A title appears as markup.** The template uses `|safe`. Remove it; Askama
escapes by default.

## The milestone

The app is usable from a browser with a real login and a real database. The
next client is the terminal: a full-screen TUI that talks to the same API.

Tag it:

<!-- transcripts: authored -->
```bash
$ git tag part-viii
```

Next: the TUI. Ratatui, an async event loop, styling, an API client, and
headless frame tests.

<div class="day-tracker" data-day="49"></div>
