# 100 Days of Rust — curriculum

**Shape:** 60 days build the app, 30 days take it to production, 10 days
cover data structures and algorithms. Every day is written; there is no
"what's coming" section.

The rule for every build day: **write the test first, watch it fail, make
it pass, commit, tag.** The app in `../rust-todo-app` is the reference; the
reader builds their own crate in `../rust-todo-reader` (or any empty folder).

## The 60 days — build the app

Ten parts: fifty build days and ten review days, split across the parts.

| Day | Part | Lesson | App change | Tests / gate | Tag |
|---:|---|---|---|---|---|
| 1 | I | A crate, a save point | `cargo new todo`, first commit, gate | `cargo run`, commit | `day-01` |
| 2 | I | The first test | Banner and `tests/smoke.rs` | Smoke test | `day-02` |
| 3 | I | A task is a struct | `Task`, `Status`, `TodoList` | Unit tests | `day-03` |
| 4 | I | Ownership | `add`, moves, `Clone` | Unit tests | `day-04` |
| 5 | I | Borrowing and collections | `Vec`, `HashMap`, `find`, slices | Unit tests | `day-05` |
| 6 | I | Errors and modules | `Result`, `?`, `lib.rs` + `main.rs` | Unit + integration | `day-06` |
| 7 | I | Review | Gate, log, tag | `cargo fmt`, `clippy`, `test` | `part-i` |
| 8 | II | Traits | `Display` for `Task`, `Summary` | Unit tests | `day-08` |
| 9 | II | Generics | Generic `find`/`count` helpers | Unit tests | `day-09` |
| 10 | II | Lifetimes | `TaskView<'a>` borrow-based search | Compile-fail drill | `day-10` |
| 11 | II | Custom errors | `thiserror` enum, exit codes | Error tests | `day-11` |
| 12 | II | Unit and integration tests | Test layout, `tests/` crate | Full suite | `day-12` |
| 13 | II | Review | Gate, log, tag | Gate | `part-ii` |
| 14 | III | Table tests and fixtures | Named cases, temp dirs | Table tests | `day-14` |
| 15 | III | Snapshot tests | `insta` output snapshots | Snapshot tests | `day-15` |
| 16 | III | Property tests | `proptest` round-trips | Property tests | `day-16` |
| 17 | III | Compile-fail tests | `trybuild` ownership drills | Compile-fail suite | `day-17` |
| 18 | III | Lints, docs, and the full check | `fmt`, `clippy`, `rustdoc`, `cargo-deny` | Full gate | `day-18` |
| 19 | III | Review | Gate, log, tag | Gate | `part-iii` |
| 20 | IV | CLI arguments | `clap` command tree | `assert_cmd` tests | `day-20` |
| 21 | IV | JSON persistence | `serde`, atomic write, import/export | Round-trip tests | `day-21` |
| 22 | IV | Config and paths | Flag → env → default, `$TODO_DB` | Config table tests | `day-22` |
| 23 | IV | Logging | `tracing`, levels, JSON/file output | Log contract tests | `day-23` |
| 24 | IV | Output and integration tests | Table + JSON, black-box CLI tests | CLI integration suite | `day-24` |
| 25 | IV | Review | Gate, log, tag | Gate | `part-iv` |
| 26 | V | Threads and channels | Autosave worker, `mpsc` | Worker tests | `day-26` |
| 27 | V | Shared state | `Arc<RwLock<TodoList>>` | Concurrency tests | `day-27` |
| 28 | V | Async and Tokio | `tokio`, async store traits | Async tests | `day-28` |
| 29 | V | Select, timeouts, cancellation | Graceful shutdown, timeouts | Cancellation tests | `day-29` |
| 30 | V | Streams and parallelism | `JoinSet`, bounded work | Parallel tests | `day-30` |
| 31 | V | Review | Gate, log, tag | Gate | `part-v` |
| 32 | VI | SQLite and `sqlx` | Pool, `SqliteStorage` | Store conformance | `day-32` |
| 33 | VI | Migrations | Versioned SQL, embedded migrations | Migration tests | `day-33` |
| 34 | VI | Queries and transactions | CRUD, all-or-nothing writes | Transaction tests | `day-34` |
| 35 | VI | IDs and time | UUIDv7, UTC, version column | Round-trip tests | `day-35` |
| 36 | VI | The store's interface and import/export | Trait seam, JSON import/export | Conformance suite | `day-36` |
| 37 | VI | Review | Gate, log, tag | Gate | `part-vi` |
| 38 | VII | Axum hello and health | Router, `todo-server`, `/health` | Server tests | `day-38` |
| 39 | VII | CRUD and validation | Task endpoints, 422 problem+json | API tests | `day-39` |
| 40 | VII | Middleware | Request IDs, tracing, timeout, compression | Middleware tests | `day-40` |
| 41 | VII | Users and sessions | Argon2id, cookie sessions | Auth tests | `day-41` |
| 42 | VII | Authorization | Owner scope, admin, audit log | IDOR tests | `day-42` |
| 43 | VII | Review | Gate, log, tag | Gate | `part-vii` |
| 44 | VIII | Templates and layout | Askama base layout, blocks, partials | Page snapshots | `day-44` |
| 45 | VIII | Forms and validation | Create/edit/delete, preserved input | Form tests | `day-45` |
| 46 | VIII | CSRF and web sessions | Double-submit token, login/logout | CSRF tests | `day-46` |
| 47 | VIII | Assets and headers | Embedded CSS, CSP, HSTS, cookies | Header tests | `day-47` |
| 48 | VIII | Page tests and accessibility | Journey test, HTML snapshots, a11y pass | Web suite | `day-48` |
| 49 | VIII | Review | Gate, log, tag | Gate | `part-viii` |
| 50 | IX | Ratatui basics | Full-screen table, status bar | `TestBackend` tests | `day-50` |
| 51 | IX | The event loop | Keys, refresh, resize, quit | Event tests | `day-51` |
| 52 | IX | Styling and layout | Theme, help overlay, small terminals | Frame snapshots | `day-52` |
| 53 | IX | API client and state | `reqwest`, optimistic toggle, rollback | Client tests | `day-53` |
| 54 | IX | TUI testing and logging | `insta` frames, scripted keys, log pane | TUI suite | `day-54` |
| 55 | IX | Review | Gate, log, tag | Gate | `part-ix` |
| 56 | X | Tracing and metrics | Spans, Prometheus metrics, `/metrics` | Telemetry tests | `day-56` |
| 57 | X | Secrets | `Secret` newtype, env/file, redaction | No-secrets tests | `day-57` |
| 58 | X | Security audit | Threat model, `cargo-deny`, audit, SBOM | Security gate | `day-58` |
| 59 | X | Deployment | systemd unit, Caddy TLS, backups, runbook | Deploy checks | `day-59` |
| 60 | X | Releases and performance; review | Version stamp, archives, image, profile | Full gate + tag | `part-x` |

## The next 30 — production ground

Two days per topic: concepts and local setup, then integration into the
same `todo` app. Labs run in Podman; cloud accounts are optional. Days
61–90 are `prod-01`…`prod-15` checkpoints.

| Day | Topic | Day 1 | Day 2 | Checkpoint |
|---:|---|---|---|---|
| 61–62 | Containers | Podman, images, layers | Containerize `todo-server` | `prod-01` |
| 63–64 | Compose and local stacks | Compose, networks, volumes | Server + database stack | `prod-02` |
| 65–66 | CI/CD | GitHub Actions, cache, matrix | Build, test, publish on push | `prod-03` |
| 67–68 | PostgreSQL | SQL, roles, indexes | Swap the SQLite store | `prod-04` |
| 69–70 | Redis | Cache, TTL, rate limits | Cache tasks and sessions | `prod-05` |
| 71–72 | Kafka/Redpanda | Topics, producers, consumers | Publish task events | `prod-06` |
| 73–74 | gRPC | Protobuf, tonic, status codes | Add a gRPC task service | `prod-07` |
| 75–76 | WebSockets | Upgrade, frames, backpressure | Live task updates | `prod-08` |
| 77–78 | Kubernetes | Pods, deployments, services | Deploy to Kind/k3d | `prod-09` |
| 79–80 | AWS with LocalStack | S3, SQS, IAM-shaped policy | Backups and queues locally | `prod-10` |
| 81–82 | Microservices | Seams, contracts, failure | Split notifications from tasks | `prod-11` |
| 83–84 | Distributed systems | Retries, idempotency, ordering | Exactly-once exercise | `prod-12` |
| 85–86 | Observability at scale | Metrics, traces, dashboards | Instrument the extended app | `prod-13` |
| 87–88 | Performance and load | Profiling, load tests, budgets | Tune the API and database | `prod-14` |
| 89–90 | Security and supply chain | Threat model, SBOM, secrets | Harden and verify the stack | `prod-15` |

## The last 10 — DSA

Measured with `criterion`, tied back to the app where possible.

| Day | Lesson | App tie-in | Checkpoint |
|---:|---|---|---|
| 91 | Complexity and measurement | Benchmark the store | `dsa-01` |
| 92 | `Vec` and slices underneath | Task list growth and copies | `dsa-02` |
| 93 | `HashMap` and `BTreeMap` | Tag index, due-date range | `dsa-03` |
| 94 | Stacks, queues, deques | Undo history, next-up queue | `dsa-04` |
| 95 | Linked structures in Rust | `Box`, `Rc`, `RefCell` trade-offs | `dsa-05` |
| 96 | Trees and heaps | Priority queue for tasks | `dsa-06` |
| 97 | Graphs: BFS and DFS | Task dependency graph | `dsa-07` |
| 98 | Shortest paths and topological sort | Scheduling tasks | `dsa-08` |
| 99 | Sorting and searching | Stable sort, binary search | `dsa-09` |
| 100 | Interview-shaped practice | Ten problems, tested in Rust | `dsa-10` |

## Gate

Every build day and review day ends with:

```bash
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
```

The app is tagged `day-NN`; each part gets `part-i`…`part-x`; production
and DSA get their own checkpoints. Quotes in the book are checked against
these tags. Terminal output is captured from the same container, never
typed by hand.
