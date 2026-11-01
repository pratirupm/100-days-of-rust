---
title: Logging
day: 23
part: IV
partName: CLI and persistence
partDay: 4
partDays: 5
time: "1.5 hours"
description: Add structured tracing that is quiet by default, loud with --verbose or RUST_LOG, and writes to stderr so stdout stays clean.
bullets:
  - install a `tracing` subscriber with an environment filter;
  - log loaded stores, added tasks, and listed counts;
  - keep user output on stdout and diagnostics on stderr.
---

The app prints user output, but it says nothing about what it is doing. When a
command fails on someone else's machine, a log line is often the difference
between a five-minute fix and a long guess.

Today we add **structured logging** with `tracing`. The app is quiet by
default; `--verbose` or `RUST_LOG` makes it talk. Logs go to stderr, so a
script reading stdout is not disturbed.

## Add tracing

<!-- verify: Cargo.toml at=day-23 -->
```toml title="Cargo.toml"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

`tracing` is the logging API; `tracing-subscriber` installs a collector and
formats the events. The `env-filter` feature lets `RUST_LOG` choose what is
printed.

## The subscriber

Create `src/logging.rs`:

<!-- verify: src/logging.rs at=day-23 -->
```rust title="src/logging.rs"
use tracing_subscriber::EnvFilter;

/// Install the tracing subscriber. `--verbose` raises the default level;
/// `RUST_LOG` overrides both.
pub fn init(verbose: bool) {
    let default = if verbose { "todo=debug" } else { "todo=warn" };
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(default));

    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .with_target(false)
        .with_ansi(false)
        .without_time()
        .init();
}
```

The filter has a default and an override:

- `--verbose` selects `todo=debug`, so the app's debug events appear.
- `RUST_LOG` wins if it is set, so `RUST_LOG=todo=trace` or
  `RUST_LOG=warn` works without a new build.

The output goes to **stderr**, not stdout. User output stays on stdout; logs
are diagnostics. `with_target(false)` drops the crate path; `with_ansi(false)`
keeps the book's captured output free of color codes; `without_time()` keeps
the transcript stable. A production app may keep the timestamp; the level and
the fields matter more than the clock.

## Wire it in

Add the flag to `Cli`:

<!-- verify: src/cli.rs at=day-23 -->
```rust title="src/cli.rs"
pub struct Cli {
    /// The JSON file to read and write.
    #[arg(long, global = true, env = "TODO_DB", default_value = "todo.json")]
    pub db: PathBuf,
    /// Print debug logs.
    #[arg(long, global = true)]
    pub verbose: bool,
    /// What to do; no command prints the demo banner.
    #[command(subcommand)]
    pub command: Option<Command>,
}
```

Declare the module in `main.rs` with `mod logging;`, then install the
subscriber before `run`:

<!-- verify: src/main.rs at=day-23 -->
```rust title="src/main.rs"
fn main() {
    let cli = Cli::parse();
    logging::init(cli.verbose);
    if let Err(error) = run(cli) {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}
```

`run` logs the load and the operations:

<!-- verify: src/main.rs at=day-23 -->
```rust title="src/main.rs"
    let mut list = TodoList::load(&path)?;
    tracing::debug!(path = %path.display(), "loaded store");
```

<!-- verify: src/main.rs at=day-23 -->
```rust title="src/main.rs"
        Some(Command::Add { title }) => {
            let id = list.add(&title)?;
            list.save(&path)?;
            tracing::info!(id, "added task");
            println!("added task #{id}");
        }
```

`debug!` is for detail a developer wants; `info!` is for a change worth
recording. The `id` is a **field**, not part of the message: a structured log
can filter or search `id=1` without parsing the text.

The list command logs a count at debug level:

<!-- verify: src/main.rs at=day-23 -->
```rust title="src/main.rs"
        Some(Command::List) => {
            tracing::debug!(count = list.list().len(), "listed tasks");
            for task in list.list() {
                println!("{task}");
            }
        }
```

`done` and `tag` get the same `info!` treatment.

## See it

```bash
$ cargo run -- --verbose --db /tmp/todo-log.json add "buy milk"
DEBUG loaded store path=/tmp/todo-log.json
 INFO added task id=1
added task #1
$ cargo run -- --verbose --db /tmp/todo-log.json list
DEBUG loaded store path=/tmp/todo-log.json
DEBUG listed tasks count=1
#1 buy milk [pending]
```

The first two lines are stderr; the last is stdout. Without `--verbose`, the
same commands print only the user lines.

`RUST_LOG` can be more specific:

<!-- transcripts: authored -->
```bash
$ RUST_LOG=todo=debug cargo run -- --db /tmp/todo-log.json list
$ RUST_LOG=warn cargo run -- --db /tmp/todo-log.json list
```

## The stderr test

<!-- verify: tests/cli.rs at=day-23 -->
```rust title="tests/cli.rs"
#[test]
fn verbose_logs_to_stderr() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("todo.json");

    let out = todo()
        .env("TODO_DB", &db)
        .args(["--verbose", "list"])
        .output()
        .expect("failed to list");
    assert!(out.status.success(), "exit status was {:?}", out.status);

    let stderr = String::from_utf8(out.stderr).expect("stderr is UTF-8");
    assert!(stderr.contains("loaded store"), "stderr was: {stderr}");
}
```

The test reads `stderr`, not `stdout`. If the subscriber writes to the wrong
stream, the test fails — which is exactly the bug we fixed while writing this
lesson.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 23: log with tracing"
[main ...] day 23: log with tracing
 26 files changed, 1917 insertions(+)
...
$ git log --oneline
... day 23: log with tracing
```

## If something went wrong

**Logs appear in stdout.** `tracing_subscriber::fmt` defaults to stdout. Add
`.with_writer(std::io::stderr)`.

**No logs appear with `--verbose`.** The filter target must match the crate
that emits the event. The binary crate is `todo`; `todo=debug` enables it.
`RUST_LOG` overrides the flag; check it is not set to `off`.

**`RUST_LOG` syntax is wrong.** Use `target=level`, for example
`todo=debug`; separate directives with commas. An invalid value prints a
warning from the subscriber.

**`init` panics with "global default subscriber already set".** The subscriber
must be installed once per process. Tests that need to inspect logs should use
`tracing_subscriber::fmt().with_writer(...).try_init()` or a test writer.

**Logs contain color escape codes in a file.** Add `.with_ansi(false)` for
non-terminal output.

**Every log line has a timestamp that changes.** That is normal; the book
removes it with `.without_time()` so transcripts stay stable. Keep the
timestamp in production if you need it.

## Going deeper: spans and structured output

A **span** is a scoped context: `let span = tracing::info_span!("add", id);
let _guard = span.enter();` makes every event inside carry `id`. Spans are how
tracing reconstructs a request across functions; they become essential in the
API and observability lessons.

The subscriber can emit JSON instead of text:

```rust
tracing_subscriber::fmt().json().init();
```

JSON lines are easy to ship to a log collector. The text format is easier to
read in a terminal. Choose per environment, not per event.

`tracing` is not `log`. `log` has levels and messages; `tracing` adds spans and
structured fields. The extra structure is why the later observability work can
correlate a request id, a user, and a database query.

