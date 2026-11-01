# Review — 100 Days of Rust

**Date:** 2026-11-01

## Method

- Ran the book gate: prose lint, 259 quote checks, transcript checks, and the
  Astro build (121 pages, links valid).
- Ran the application gate in Podman at `HEAD`: fmt, clippy, all workspace
  tests, and rustdoc.
- Reviewed all 100 chapter sources in four passes (Days 1–25, 26–50, 51–75,
  76–100), plus targeted checks of the live site, mobile layout, DSA crate,
  container, PostgreSQL, Redis, and LocalStack labs.

## Fixed in this pass

- **Beginner wiring:** added missing `pub` visibility, module declarations,
  dependency steps (`tempfile`, `tower`, `ratatui`, `axum-extra`, `argon2`,
  `sha2`, `uuid`), and the `demo` extraction in the CLI chapter.
- **Progression:** moved part-tag commands to the milestone only; fixed
  `select!`’s random default; corrected the CSRF/forms ordering note; clarified
  the cumulative `src/web.rs` build across Days 44–46.
- **Security:** API internal errors no longer leak details; web handlers
  distinguish validation from internal failures; login always pays the Argon2
  cost and hashing runs on a blocking thread; deployment adds
  `StateDirectoryMode`/`UMask`, HSTS, and a WAL-safe restore.
- **Containers and labs:** the runtime image creates `/data` for the non-root
  user; Podman sections no longer add ports to an existing pod; LocalStack runs
  standalone; Kubernetes uses a TCP liveness probe and documents the
  `--migrate-only` requirement; the capstone uses the SQLite image and
  registers a user before login.
- **DSA:** fixed the Unicode longest-common-prefix panic, corrected the
  benchmark ratio, and labelled the complete reference crate as a guided tour
  rather than an incremental build.
- **Book completeness:** generated the finished-app appendix from `day-60` and
  linked it from Start here; added save points to the production days; updated
  the curriculum table, validation record, and style target to match the book.
- **Site:** all 100 days are in the sidebar; the deploy workflow enables Pages;
  the live site was redeployed and checked.

## Evidence

```text
bun run check
  0 lint failures
  259 quotes checked, 0 failures
  492 transcript lines checked, 0 missing
  121 pages built; all internal links valid

tools/validate-app.sh HEAD
  cargo fmt, clippy, workspace tests, and rustdoc pass
```

Live: <https://pratirupm.github.io/100-days-of-rust/>

## Known limitations

- The production integrations (Postgres store, Redis cache, Kafka outbox,
  gRPC service, WebSocket route, Kubernetes manifests, notification service,
  retry layer, metrics exporter) are designs for the reader’s copy; the
  reference app remains the 60-day SQLite application. This is stated on the
  production overview and in the disclaimer.
- Days 44–46 are cumulative: `src/web.rs` compiles at the end of Day 46, not
  after Day 44. The chapter says so.
- Kafka/Redpanda, gRPC, WebSockets, and Kubernetes are optional labs; they are
  documented but not re-run by the default book gate.
- The reference app is not public; only the book site is on GitHub Pages.
