---
title: "Day 47 — Assets and security headers"
description: "Embed the stylesheet in the binary, serve it with the right type and cache, and add a small, deliberate set of security headers. — Day 47 of 100 Days of Rust."
sidebar:
  order: 47
day: 47
---

**About 2 hours** · Part VIII, day 4 of 5.

**You'll be able to:**

- serve an embedded stylesheet without a static directory;
- set `Content-Type` and `Cache-Control`;
- add CSP, frame, and referrer headers.

---

The pages link `/assets/app.css`. There is no static directory to deploy: the
stylesheet is embedded in the binary with `include_str!`, and a tiny route
serves it. Today that route gets the right headers, and the web router gets a
small security policy.

## Embedded assets

<!-- verify: src/web.rs at=day-47 -->
```rust title="src/web.rs"
async fn assets() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "text/css; charset=utf-8"),
            (header::CACHE_CONTROL, "public, max-age=3600"),
        ],
        include_str!("../assets/app.css"),
    )
}
```

`include_str!` reads the file at compile time and returns a `&'static str`.
There is no runtime file read, no `public/` directory to copy, and no path
traversal risk. The CSS is part of the binary.

`Content-Type: text/css; charset=utf-8` tells the browser how to parse the
body. `Cache-Control: public, max-age=3600` lets it reuse the file for an hour.
For a hashed asset name, the max-age could be a year; a fixed name needs a
shorter cache.

## The security headers

<!-- verify: src/web.rs at=day-47 -->
```rust title="src/web.rs"
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
```

Each header closes a small class of bugs:

- `x-content-type-options: nosniff` stops the browser from guessing a
  different type and executing it.
- `x-frame-options: DENY` stops another site from framing the app and tricking
  a click.
- `referrer-policy: no-referrer` keeps the app's URLs out of other sites'
  referrer logs.
- `content-security-policy` allows only same-origin styles and forms;
  `default-src 'self'` also limits scripts and images, and
  `frame-ancestors 'none'` forbids framing entirely. The app has no inline
  scripts or styles, so it can start strict. A future inline script needs a
  nonce or a hash; do not widen the policy by habit.

The policy is a starting point, not a complete security program. The security
part adds cookies, throttling, and an audit.

## The tests

<!-- verify: src/web.rs at=day-47 -->
```rust title="src/web.rs"
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
```

The header test checks the policy on a page:

<!-- verify: src/web.rs at=day-47 -->
```rust title="src/web.rs"
        assert_eq!(response.headers()["x-content-type-options"], "nosniff");
        assert_eq!(response.headers()["x-frame-options"], "DENY");
        assert_eq!(response.headers()["referrer-policy"], "no-referrer");
        assert!(
            response.headers()["content-security-policy"]
                .to_str()
                .unwrap()
                .contains("default-src 'self'")
        );
```

## Run it

```bash
$ cargo test
...
test web::tests::assets_have_css_and_cache_headers ... ok
test web::tests::pages_have_security_headers ... ok
...
```

In a browser, the login page loads the stylesheet from `/assets/app.css` and
the developer tools show the headers on the document response.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 47: serve embedded assets with security headers"
[main ...] day 47: serve embedded assets with security headers
 44 files changed, 6057 insertions(+)
...
$ git log --oneline
... day 47: serve embedded assets with security headers
```

## If something went wrong

**The page has no styles.** The stylesheet URL is wrong, or the CSP blocks it.
Check the `href` and the `style-src` directive.

**The CSS is downloaded as `text/plain`.** The `Content-Type` header is missing
or overwritten. Return the tuple with the header.

**The browser keeps an old stylesheet.** The cache is doing its job. Bump the
asset name or lower `max-age` during development.

**A header is missing on some responses.** The layer is applied to the router
before a route is added, or a nested router is merged after the layer. Apply
the layer to the final router.

**The CSP blocks an inline style or script.** Add a nonce or hash, or move the
code to an external file. Do not add `'unsafe-inline'` without understanding
what it allows.

**`x-frame-options` is ignored by a modern browser.** Some browsers prefer the
CSP `frame-ancestors` directive; the policy includes both.

## Going deeper: static assets at scale

Embedding is right for a small app: one binary, no missing files, no path
traversal. At scale, assets move to a CDN with hashed names and long cache
lifetimes; the app serves a manifest, not the bytes. The HTML's `link` changes
with the hash, so a deploy never serves a stale stylesheet.

A strict CSP is easiest before there is inline JavaScript. Adding it later means
finding every inline handler and nonce. Start strict and widen only with a
reason.

The next lesson tests whole pages and checks the accessibility basics: language,
labels, headings, and form controls.

<div class="day-tracker" data-day="47"></div>
