---
title: "Day 84 — Dashboards and alerts for the app"
description: "Add a latency histogram, write the RED queries, and make one alert that follows the SLO instead of the CPU. — Day 84 of 100 Days of Rust."
sidebar:
  order: 24
day: 84
---

**About 2 hours** · Production ground, day 24 of 30.

**You'll be able to:**

- record request duration in a histogram;
- write PromQL for rate, errors, and p99;
- alert on the burn rate, not a single spike.

---

The metrics endpoint has two counters. This lesson designs the latency metric,
the dashboard, and the alert; the reference image keeps the two counters until
you add the histogram.

## The histogram

```rust
use metrics::{histogram, counter};

pub fn record_request(method: &str, route: &str, status: u16, seconds: f64) {
    counter!("todo_requests_total", "method" => method.to_string(),
             "route" => route.to_string(), "status" => status.to_string()).increment(1);
    histogram!("todo_request_duration_seconds", "route" => route.to_string())
        .record(seconds);
}
```

Use a bounded set of labels: method, route template, status class. A raw path
(`/tasks/42`) is high cardinality; a route template (`/tasks/{id}`) is not.

The middleware wraps the request, records the duration, and calls the next
handler. The status is known after the response.

## PromQL

<!-- transcripts: authored -->
```text
# request rate
sum(rate(todo_requests_total[5m]))

# error ratio
sum(rate(todo_requests_total{status=~"5.."}[5m]))
/
sum(rate(todo_requests_total[5m]))

# p99 latency
histogram_quantile(0.99,
  sum by (le) (rate(todo_request_duration_seconds_bucket[5m])))
```

The first two are RED rate and errors. The third is duration at the tail.

## The dashboard

A compact dashboard:

1. **SLO** — success ratio and p99 over 30 days.
2. **Traffic** — request rate by route.
3. **Errors** — 5xx ratio and the top failing route.
4. **Latency** — p50/p95/p99.
5. **Dependencies** — database pool saturation, Redis errors, queue lag.
6. **Business** — tasks created, users active.

Each panel links to the logs or traces for the same time window. A dashboard
without a drill-down is a poster.

## The alert

```yaml
groups:
  - name: todo
    rules:
      - alert: TodoHighErrorBudgetBurn
        expr: |
          (sum(rate(todo_requests_total{status=~"5.."}[5m]))
           / sum(rate(todo_requests_total[5m]))) > (14.4 * 0.001)
        for: 5m
        labels:
          severity: page
        annotations:
          summary: "todo is burning its 99.9% error budget"
          runbook: "https://example.com/runbooks/todo"
```

The `14.4` is a burn-rate multiplier: at 14.4× the budget, a 30-day budget is
gone in about two days. A multi-window alert (5m and 1h) reduces noise.

The alert is about the user-visible error ratio, not CPU. A CPU spike with a
healthy error rate is a dashboard note; a page for it is noise.

## Traces

The middleware opens a span per request. The database call and the queue
publish get child spans:

```rust
let span = tracing::info_span!("create_task", user_id = user.id);
let _guard = span.enter();
```

The trace id goes into the response header and the log context. A client can
report the id; the operator finds the trace without guessing the time window.

## In the app

The API is the first dashboard. The web UI's page loads and the TUI's refresh
are separate; add a browser RUM or a server-side timing for the page. The queue
lag comes from the broker; the app exports the publish failures.

The metrics crate can replace the hand-written counters. The hand-written
version shows the format; the library handles histograms and labels.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 84: dashboards and alerts for the app"
```

## If something went wrong

**The histogram has no data.** The middleware is not installed, or the label
cardinality is wrong. Check a raw scrape.

**p99 is higher than the max.** The quantile is computed across buckets that do
not align; use a consistent bucket set and window.

**The alert never fires.** The threshold is impossible, or the series name is
wrong. Test the expression in the Prometheus UI.

**The alert fires on every deploy.** A rollout briefly has 5xx; add a `for:`
duration and a multi-window burn rate.

**The dashboard is slow.** Too many series; reduce labels and use recording
rules.

**The trace is missing the database span.** The database call is not
instrumented. Add a span around it or enable the sqlx tracing feature.

## Going deeper: SLOs are product decisions

An SLO is a promise about the user's experience. 99.9% at 500 ms is a different
product from 99.99% at 100 ms, and a different bill. The number comes from the
product, not the infrastructure team alone.

The error budget makes the trade-off explicit: a deploy that risks the budget
needs a reason. A team that never spends the budget is moving too slowly; a
team that always spends it is unreliable.

The next lesson loads the app and profiles the hot path.

<div class="day-tracker" data-day="84"></div>
