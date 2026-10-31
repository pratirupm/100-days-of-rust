---
title: "Day 25 — Review: Part IV"
description: "Catch up on the command line, JSON persistence, configuration, logging, and output formats, then tag Part IV. — Day 25 of 100 Days of Rust."
sidebar:
  order: 25
day: 25
---

**About 1.5 hours** · Part IV, review.

Part IV made the app usable: real commands, a file that survives the process,
a path you can choose, logs when you ask for them, and JSON for scripts.

Today is a catch-up day. Run the full check, exercise the CLI by hand, and
save a milestone.

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

## Exercise the CLI

<!-- transcripts: authored -->
```bash
$ cargo run -- --db /tmp/review.json add "buy milk"
added task #1
$ cargo run -- --db /tmp/review.json add "write the report"
added task #2
$ cargo run -- --db /tmp/review.json done 1
done task #1
$ cargo run -- --db /tmp/review.json list
#1 buy milk [done]
#2 write the report [pending]
$ cargo run -- --db /tmp/review.json list --json
...
```

Try the same commands with `TODO_DB` instead of `--db`, then with both. The
flag should win. Try `--verbose` and watch the log lines appear on stderr while
the task list stays on stdout.

## Read the tree

<!-- transcripts: authored -->
```text
src/
├── lib.rs        library root and re-exports
├── main.rs       the binary, dispatch, and demo
├── cli.rs        clap command tree
├── logging.rs    the tracing subscriber
├── error.rs      TodoError
├── query.rs      generic helpers
├── store.rs      TodoList, JSON save/load
├── summary.rs    Summary trait
├── task.rs       Task and Status
└── view.rs       TaskView<'a>
```

The library still knows nothing about `clap`, `TODO_DB`, or log levels. Those
live at the binary's edge.

## Check your history

<!-- transcripts: authored -->
```bash
$ git log --oneline
... day 24: print human and JSON output
... day 23: log with tracing
... day 22: resolve the store path from a flag
... day 21: persist the list as JSON
... day 20: give the app a command line
$ git tag part-iv
```

## What you should be able to explain

- How `clap` turns arguments into a `Command` enum.
- Why the parser rejects `todo add` before `run` is called.
- How `serde` derives JSON for `Task` and `Status`.
- Why `save` writes a temporary file and renames it.
- The order `--db` → `TODO_DB` → `todo.json`.
- Why logs go to stderr and user output to stdout.
- Why the JSON test parses the output instead of comparing a string.

## If something is red

**A command exits with code 2.** Clap rejected the arguments; read the usage
line. It is not an app error.

**The store cannot be parsed.** Inspect the JSON file. A hand-edited comma is
the usual cause.

**The flag is ignored.** The order is flag, environment, default; a flag
always wins. Check the spelling and the command position.

**Logs and output are mixed.** The subscriber is writing to stdout. Use
stderr.

**The JSON shape changed.** Read the diff in the test. A field rename or a
status case change is a breaking format change; decide deliberately.

## The milestone

The app is now something a person can use without reading the source: add,
list, done, tag, choose a file, get JSON, and read logs when needed.

Tag it:

<!-- transcripts: authored -->
```bash
$ git tag part-iv
```

Next: concurrency and async. A worker saves in the background, shared state is
guarded, the store becomes async, and the app learns to shut down cleanly.

<div class="day-tracker" data-day="25"></div>
