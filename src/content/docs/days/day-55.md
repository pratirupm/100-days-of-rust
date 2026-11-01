---
title: "Day 55 — Review: Part IX"
description: "Catch up on the Ratatui interface, event loop, help overlay, API client, and frame snapshots, then tag Part IX. — Day 55 of 100 Days of Rust."
sidebar:
  order: 55
day: 55
---

**About 1.5 hours** · Part IX, review.

Part IX gave the app a third client: a full-screen terminal UI with a list, a
selection, a help overlay, and a frame snapshot. It can load tasks from the
local database or from the API.

The API, the web UI, and the TUI now share the same domain and the same session
model. The TUI's toggle is still local; the next production step would send it
through the client, but the reading path is real.

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

## Read the TUI

<!-- transcripts: authored -->
```text
src/
├── tui.rs          App, draw, keys, guard, frame tests
├── client.rs       ApiClient for the task endpoints
└── bin/todo-tui.rs the terminal loop and logging
```

The TUI is a view of `Vec<Task>`: no store, no SQL, no password. The binary
chooses the source: local `SqliteStore` or `ApiClient` when `TODO_API` and
`TODO_TOKEN` are set.

## Exercise it

<!-- transcripts: authored -->
```bash
$ cargo run --bin todo-tui
```

Arrow keys or `j`/`k` move; Enter or Space toggles; `?` opens help; `q` quits.
The terminal returns to the shell.

## What you should be able to explain

- Why an immediate-mode UI redraws the whole frame.
- What `ListState` holds and why the selection is clamped.
- Why the terminal guard implements `Drop`.
- Why `poll` needs a timeout.
- Why the help overlay calls `Clear` first.
- Why `TestBackend` makes frame tests cheap.
- Why the TUI logs to stderr, and why that is awkward on the alternate screen.

## Check your history

<!-- transcripts: authored -->
```bash
$ git log --oneline
... day 54: snapshot the TUI and log startup
... day 53: fetch tasks through an API client
... day 52: style the terminal and add help
... day 51: guard the terminal event loop
... day 50: draw the terminal interface
```

## If something is red

**The screen is blank.** The terminal area is zero, or `draw` is outside
`terminal.draw`.

**The terminal is stuck in raw mode.** The guard did not run. Do not call
`process::exit` inside the loop.

**The TUI points at the wrong database.** With `TODO_API`/`TODO_TOKEN` set, it
uses the API; unset them for the local store.

**A frame snapshot changed.** Read the diff; accept only if the layout change
is intended.

**Logs are missing.** They are on stderr behind the alternate screen. Use a
file or a log pane.

## The milestone

You have three clients and one domain: CLI, HTTP API, browser UI, and terminal
UI. The next part ships the whole system: observability, secrets, an audit,
deployment, releases, and a measured optimization pass.

Tag it:

<!-- transcripts: authored -->
```bash
$ git tag part-ix
```

Next: shipping. The app leaves the laptop.

<div class="day-tracker" data-day="55"></div>
