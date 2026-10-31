---
title: CSRF and web sessions
day: 46
part: VIII
partName: The web UI
partDay: 3
partDays: 5
time: "2.5 hours"
description: Give every mutating form a CSRF token, set an HttpOnly session cookie, and prove that a wrong token is rejected.
bullets:
  - issue a CSRF token and keep it in a cookie;
  - require the form token to match on every write;
  - set the session cookie with `HttpOnly` and `SameSite=Lax`.
---

A browser sends cookies automatically. That is convenient for sessions and
dangerous for writes: another site can make the browser POST to your app with
the user's session attached.

The defense is a **CSRF token**: a random value the attacker cannot read from
the form page. The browser sends it in both a cookie and a form field; the
server checks that the two match.

## The token helper

<!-- verify: src/web.rs at=day-46 -->
```rust title="src/web.rs"
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
```

The CSRF cookie is deliberately **not** `HttpOnly`: the template needs the
value, and a same-site attacker cannot read it. The session cookie is
`HttpOnly`; JavaScript must not see it.

`SameSite=Lax` is a second layer: the browser does not send the cookie on most
cross-site POSTs. The token is the layer that works even when `SameSite` is not
enough.

## The login cookie

The login handler creates a session and sets the cookie:

<!-- verify: src/web.rs at=day-46 -->
```rust title="src/web.rs"
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
```

The token is stored hashed; the browser gets the raw token once. `HttpOnly`
keeps it away from scripts, `SameSite=Lax` limits cross-site sends, and the
seven-day expiry is enforced by the session query. `Secure` is added when the
app is served over HTTPS; a local HTTP server would drop a `Secure` cookie.

The login rotates the session: a new token is created on every login. An old
token from before the login is not reused, which closes session fixation.

## The write check

Every mutating form carries the token. `create_task` checks it before writing:

<!-- verify: src/web.rs at=day-46 -->
```rust title="src/web.rs"
    let Some(cookie) = jar.get(CSRF_COOKIE) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if cookie.value() != form.csrf {
        return StatusCode::FORBIDDEN.into_response();
    }
```

The same check protects `/tasks/{id}/done` and `/logout`. A missing cookie or a
mismatched field is 403; the handler does not touch the store.

## The tests

<!-- verify: src/web.rs at=day-46 -->
```rust title="src/web.rs"
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
```

The login test reads the CSRF cookie from the login page, submits the form with
the same value, and checks the response's `Set-Cookie` headers:

<!-- verify: src/web.rs at=day-46 -->
```rust title="src/web.rs"
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
```

## Run it

```bash
$ cargo test
...
test web::tests::create_with_wrong_csrf_is_403 ... ok
test web::tests::login_sets_a_session_cookie ... ok
...
```

## Save your work

```bash
$ git add -A
$ git commit -m "day 46: require CSRF tokens and secure cookies"
[main (root-commit) ...] day 46: require CSRF tokens and secure cookies
 44 files changed, 5979 insertions(+)
...
$ git log --oneline
... day 46: require CSRF tokens and secure cookies
```

## If something went wrong

**`403` on every form after login.** The CSRF cookie and the hidden field are
different. The login page must read the cookie value the server set, not
generate a second token.

**The session cookie is missing.** The login response sets it, but the test
client did not store it. Browsers do; a test must copy the `Set-Cookie` header
into the next request.

**The cookie is not sent over HTTP.** `Secure` cookies are only sent over
HTTPS. Do not set `Secure` on a local HTTP dev server.

**The cookie is sent on cross-site POSTs.** `SameSite=Lax` allows top-level GET
navigation; for stronger isolation use `Strict`, with the cost that following a
link from another site does not carry the session.

**A user is logged in as someone else after login.** The session token is not
rotated, or the old cookie is reused. Create a fresh token on login and set the
new cookie.

**The CSRF token is in the URL.** Tokens belong in a form field or a header, not
in a query string; URLs leak through logs and referrers.

## Going deeper: CSRF is about ambient authority

A bearer token is not vulnerable to CSRF because an attacker cannot make the
browser attach it. A cookie is attached automatically, so every cookie-based
write needs a token or a strict `SameSite` policy.

The double-submit pattern is simple but not perfect: a subdomain attacker might
set a cookie for the parent domain. A signed double-submit cookie, or a token
tied to the session, closes that. For this app, the token is random and the
cookie is host-only; the tests pin the behavior.

The web session and the API bearer token share the same session table. A user
can log in through the browser and use the token through the CLI; revoking the
row logs out both.

