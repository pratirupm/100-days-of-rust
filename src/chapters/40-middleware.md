---
title: Middleware
day: 40
part: VII
partName: The HTTP API
partDay: 3
partDays: 5
time: "2 hours"
description: Wrap every route in request IDs, tracing, a timeout, compression, and two security headers — one layer stack, in a deliberate order.
bullets:
  - add request ids and propagate them to responses;
  - trace, time out, and compress requests;
  - set security headers on every response.
---

Each handler should not repeat the same cross-cutting work: assign an id, log
the request, enforce a deadline, compress the body, add headers. Axum and
`tower-http` express that work as **layers** around the router.

One layer stack, applied once, covers every route.

## The dependencies

<!-- verify: Cargo.toml at=day-40 -->
```toml title="Cargo.toml"
tower = { version = "0.5", features = ["util"] }
tower-http = { version = "0.6", features = ["trace", "limit", "timeout", "compression-full", "set-header", "request-id"] }
```

`tower` provides `ServiceBuilder`; `tower-http` provides the HTTP-specific
layers. The features enable only the pieces used here.

## The layer stack

<!-- verify: src/api.rs at=day-40 -->
```rust title="src/api.rs"
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
```

Read from the outside in:

- `SetRequestIdLayer` reuses an incoming `x-request-id` or creates a UUID.
- `PropagateRequestIdLayer` copies the id onto the response.
- `TraceLayer` opens a span per request and logs the response status.
- `TimeoutLayer` turns a request slower than ten seconds into a 408.
- `CompressionLayer` compresses the body when the client advertises support.
- The two `SetResponseHeaderLayer`s add `x-content-type-options: nosniff` and
  `x-frame-options: DENY`.

Order matters. A timeout outside the trace layer still logs the timeout; a
timeout inside it might log a 500 instead. The request id must be set before
the trace layer if the span should include it. `ServiceBuilder` applies layers
in the order written, outermost first.

`SetResponseHeaderLayer::overriding` replaces an existing header; the `if_not_present` variant leaves a handler-set value alone. Pick deliberately.

## The header test

<!-- verify: src/api.rs at=day-40 -->
```rust title="src/api.rs"
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
```

The request already carries an id; the layer must reuse it, not replace it.
That is what makes a client's trace id useful across services.

## Run it

```bash
$ cargo test
...
test api::tests::responses_have_request_id_and_security_headers ... ok
...
```

With the server running, inspect the headers:

<!-- transcripts: authored -->
```bash
$ curl -i http://127.0.0.1:8080/health
HTTP/1.1 200 OK
x-request-id: ...
x-content-type-options: nosniff
x-frame-options: DENY
...
{"status":"ok"}
```

## Save your work

```bash
$ git add -A
$ git commit -m "day 40: wrap the API in middleware"
[main (root-commit) ...] day 40: wrap the API in middleware
 37 files changed, 4672 insertions(+)
...
$ git log --oneline
... day 40: wrap the API in middleware
```

## If something went wrong

**The request id changes.** `SetRequestIdLayer` should reuse the incoming
header. Check the header name spelling; a different name creates a new id.

**The timeout returns 500.** The timeout layer is inside an error-mapping layer
that turns 408 into 500, or the handler is blocking the runtime. Check the
stack order and any blocking calls.

**Compression never happens.** The client must send `accept-encoding: gzip`.
`curl --compressed` does.

**A handler's header disappears.** `SetResponseHeaderLayer::overriding`
replaces it. Use `if_not_present` if the handler owns the value.

**The trace output is missing.** No `tracing` subscriber is installed, or its
filter excludes `tower_http`. The binary installs the subscriber from Day 23.

**The test sees a different status.** Layers can short-circuit before the
handler. Assert the status first, then the body.

## Going deeper: middleware is a function

A `tower::Service` is a function from a request to a future response. A layer
wraps one service in another. That is why the same stack works for Axum, tonic,
and any other tower-based server.

The layer stack is also a policy document. A reader can see the timeout, the
request id, the security headers, and the trace in one place. Handlers stay
about tasks, not about infrastructure.

The next lesson adds identity: users, passwords, and sessions. The auth
middleware will join this stack and attach a `CurrentUser` to each request.

