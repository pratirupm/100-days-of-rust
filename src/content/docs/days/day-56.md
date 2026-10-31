---
title: "Day 56 — Tracing and metrics"
description: "Expose two Prometheus counters at /metrics, count requests and created tasks, and keep logs and metrics in their separate lanes. — Day 56 of 100 Days of Rust."
sidebar:
  order: 56
day: 56
---

**About 2 hours** · Part X, day 1 of 5.

**You'll be able to:**

- add a metrics type with atomic counters;
- serve the Prometheus text format;
- test the counters through the router.

---

Logs tell a story about one request. Metrics tell a shape about all requests:
how many, how fast, how often they fail. A production service needs both.

Today the API gets a `/metrics` endpoint with two counters: requests handled
and tasks created. It is small on purpose; the shape is the lesson.

## The counters

Create `src/metrics.rs`:

<!-- verify: src/metrics.rs at=day-56 -->
```rust title="src/metrics.rs"
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
```

An `AtomicU64` increments without a mutex. `Relaxed` ordering is enough for a
counter: the exact moment another thread sees the new value does not matter,
only that increments are not lost.

The text format is Prometheus's. `# HELP` and `# TYPE` describe the metric; the
`name value` line is the sample. A real exporter would use a library and labels;
the hand-written format shows what the library produces.

## Wire it into the API

The app state holds the counters next to the store. The router adds a route:

<!-- verify: src/api.rs at=day-56 -->
```rust title="src/api.rs"
        .route("/health", get(health))
        .route("/metrics", get(metrics))
```

The handler returns text, not JSON:

<!-- verify: src/api.rs at=day-56 -->
```rust title="src/api.rs"
async fn metrics(State(state): State<AppState>) -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        state.metrics.render(),
    )
}
```

`text/plain; version=0.0.4` is the Prometheus exposition content type. A scraper
checks it; a browser shows the text.

The task handlers increment at the edge:

<!-- verify: src/api.rs at=day-56 -->
```rust title="src/api.rs"
    state.metrics.request();
    let id = state.store.add_owned(&body.title, user_id).await?;
    state.metrics.task_created();
```

`list`, `get`, and `done` increment `requests` too. The health and metrics
handlers do not count themselves; a scraper hitting `/metrics` every few
seconds would otherwise dominate the request count.

## The tests

<!-- verify: src/metrics.rs at=day-56 -->
```rust title="src/metrics.rs"
    #[test]
    fn counters_render_in_prometheus_format() {
        let metrics = Metrics::new();
        metrics.request();
        metrics.task_created();

        let text = metrics.render();
        assert!(text.contains("todo_requests_total 1"));
        assert!(text.contains("todo_tasks_created_total 1"));
    }
```

The API test starts at zero:

<!-- verify: src/api.rs at=day-56 -->
```rust title="src/api.rs"
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
```

## Try it

```bash
$ cargo test
...
test metrics::tests::counters_render_in_prometheus_format ... ok
test api::tests::metrics_start_at_zero ... ok
...
```

With the server running:

<!-- transcripts: authored -->
```bash
$ curl -s http://127.0.0.1:8080/metrics
# HELP todo_requests_total API requests handled.
# TYPE todo_requests_total counter
todo_requests_total 0
# HELP todo_tasks_created_total Tasks created.
# TYPE todo_tasks_created_total counter
todo_tasks_created_total 0
```

Create a task and scrape again; both counters move.

## Save your work

```bash
$ git add -A
$ git commit -m "day 56: expose request and task counters"
[main (root-commit) ...] day 56: expose request and task counters
 50 files changed, 7587 insertions(+)
...
$ git log --oneline
... day 56: expose request and task counters
```

## If something went wrong

**`/metrics` returns 404.** The route is missing, or the server is the API
router without the merge. Check the route and the binary.

**The counters are always zero.** The handlers do not call `request()`; or each
request builds a new `AppState` (it should not; the router owns it).

**The scrape is slow or huge.** A counter with a user id or a task title as a
label creates unbounded series. Use labels with a small, known set of values.

**Prometheus rejects the output.** The content type or the format is wrong.
`# TYPE` must precede the sample; names use `_total` for counters.

**The metric resets on restart.** That is normal for an in-process counter.
Prometheus handles resets; a monotonic counter is not a database.

**The endpoint is public.** Metrics often leak topology and traffic. Put it
behind the same network boundary as the API, or a separate admin listener.

## Going deeper: the three signals

- **Logs** are events: one request, one error, one decision.
- **Metrics** are aggregates: counts, rates, durations, errors.
- **Traces** are causality: one request across services, with spans.

The app already has logs and counters. A trace would wrap the request in a span
and propagate a request id; the `TraceLayer` from the middleware lesson is the
first step. The deeper observability lesson in production ground adds a
collector and dashboards.

A counter is not a metric system. The next step is a histogram for request
duration, then an alert on the error rate. Start with the question you need to
answer, then add the smallest metric that answers it.

<div class="day-tracker" data-day="56"></div>
