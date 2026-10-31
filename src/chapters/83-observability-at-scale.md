---
title: Observability at scale
day: 83
part: Production ground
partDay: 23
partDays: 30
time: "2.5 hours"
description: Turn logs, metrics, and traces into answers: RED metrics, SLOs, dashboards, and alerts that page a human only when they should.
bullets:
  - choose RED metrics for request-driven services;
  - write an SLO and an alert that follows it;
  - trace one request across the API, store, and queue.
---

Three signals, three jobs:

- **metrics** answer "how many, how fast, how often";
- **logs** answer "what happened in this one case";
- **traces** answer "where did this request spend its time".

At scale, the question is not "do we have data"; it is "can we answer the
question in five minutes".

## RED and USE

For request-driven services, use **RED**:

- **Rate** — requests per second;
- **Errors** — failed requests per second;
- **Duration** — the latency distribution.

For resources, use **USE**:

- **Utilization** — how busy;
- **Saturation** — how queued;
- **Errors** — how failing.

The app's API is a RED service; its database and queue are USE resources.

## Percentiles

An average hides the users who waited. Track p50, p95, p99, and the max.

A p99 of 2 seconds means one in a hundred requests is slow; at 1,000 requests
per second, that is ten slow users every second. The average can look fine.

Histograms, not averages, are the source. A Prometheus histogram gives buckets;
the server computes quantiles over a window.

## SLOs

A service-level objective is a target over a window:

<!-- transcripts: authored -->
```text
99.9% of POST /api/v1/tasks succeed within 500 ms over 30 days.
```

The error budget is the remaining 0.1%: about 43 minutes in 30 days. Alerts
fire when the burn rate threatens the budget, not on every single error.

A good alert is actionable, has an owner, and links to a runbook. An alert that
fires every night trains the on-call to ignore it.

## Traces

A trace is a tree of spans. The API handler is the root; the database query,
the cache call, and the queue publish are children. Each span has a start, a
duration, and attributes.

Propagate the trace id in HTTP headers (`traceparent`) and in event metadata.
One id across the API, the consumer, and the logs is the difference between
"the request failed" and "the notification for task 42 failed in the consumer".

## Dashboards

A dashboard should answer a question, not display every metric:

- **Service health** — rate, errors, latency, saturation.
- **Dependencies** — database, Redis, queue lag.
- **Business** — tasks created, users active, notifications sent.
- **Deploy** — version, error rate before/after.

The top row is the SLO; the rest is drill-down. A wall of graphs is a screensaver.

## Alerts

- **Symptom-based** — the user-visible error rate or latency; page.
- **Cause-based** — CPU, disk, queue depth; ticket or dashboard, not page.
- **Budget-based** — burn rate; page only when the budget is at risk.

Every alert needs a runbook and a silence policy. An alert without an action is
noise.

## In the app

The app has counters and a trace layer. The next step is a histogram for request
duration and a dashboard with RED panels. The queue lag metric comes from the
broker, not the app.

The logs already carry request ids from the middleware; the trace id should be
added to the same context. The web UI's page load and the TUI's refresh are
separate user journeys; measure them separately.

## If something went wrong

**The dashboard is green while users complain.** The metric is measured at the
wrong boundary (inside the service, not at the edge), or the average hides the
tail. Measure at the user-facing edge and use percentiles.

**The alert fires constantly.** The threshold is too tight, or the alert is
cause-based and pages on a normal fluctuation. Move it to a ticket or a burn
rate.

**The trace has one span.** The instrumentation is missing on the dependencies.
Add spans around the database, cache, and queue.

**The trace id is not in the logs.** The logger context is not propagated.
Attach the span to the log record.

**The queue lag is invisible.** The app does not export it; scrape the broker
and put it on the same dashboard.

**The SLO has no owner.** A target without an owner is a wish. Name the team and
the runbook.

## Going deeper: cardinality

Every label combination is a time series. A `user_id` label creates one series
per user and kills the metrics backend. Use bounded labels: route, method,
status class, region.

High-cardinality data belongs in logs or traces, where it is indexed
differently, not in metrics.

The next lesson measures the app under load and profiles the hot path.

