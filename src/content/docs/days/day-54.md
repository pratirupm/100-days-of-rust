---
title: "Day 54 — TUI testing and logging"
description: "Snapshot a whole terminal frame, log startup events, and know where the logs go when the alternate screen is in the way. — Day 54 of 100 Days of Rust."
sidebar:
  order: 54
day: 54
---

**About 2 hours** · Part IX, day 5 of 5.

**You'll be able to:**

- snapshot a `TestBackend` frame with `insta`;
- initialize `tracing` in the TUI binary;
- read the log without leaving the alternate screen.

---

The TUI has small state tests. Today it gets a frame snapshot and logging.

A terminal frame is text in a grid. A snapshot records the grid, so a layout or
border change shows a diff. That is the same idea as the web page snapshot, one
layer down.

## The frame snapshot

<!-- verify: src/tui.rs at=day-54 -->
```rust title="src/tui.rs"
    #[test]
    fn screen_snapshot() {
        let text = screen(&app());
        insta::assert_snapshot!(text);
    }
```

`screen` renders the `App` into a 60×10 `TestBackend` and flattens the cells
into a string. The snapshot is the whole visible frame:

<!-- transcripts: authored -->
```text title="src/snapshots/todo__tui__tests__screen_snapshot.snap"
---
source: src/tui.rs
expression: text
---
todo — a tiny task manager                                  ┌Tasks─────────────────────────────────────────────────────┐│✓ #1 buy milk                                             ││  #2 write the report                                     ││                                                          ││                                                          ││                                                          ││                                                          │└──────────────────────────────────────────────────────────┘2 task(s), 1 done · q quit · ↑/↓ move · enter done · ? help
```

The border characters and the padding are part of the snapshot. If a
`Constraint` changes, the diff shows exactly which rows moved.

`TestBackend` captures symbols, not colors. A color-only change will not fail
this snapshot; test the style with `buffer` cells if the color is a contract.

## Logging

<!-- verify: src/bin/todo-tui.rs at=day-54 -->
```rust title="src/bin/todo-tui.rs"
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("todo=warn"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .without_time()
        .init();
```

The TUI uses the same `tracing` setup as the CLI: quiet by default, `RUST_LOG`
overrides. Logs go to stderr, not stdout; the terminal UI owns stdout.

A debug line records the load:

<!-- verify: src/bin/todo-tui.rs at=day-54 -->
```rust title="src/bin/todo-tui.rs"
    tracing::debug!(tasks = tasks.len(), "tui loaded tasks");
```

Run with `RUST_LOG=todo=debug` to see it.

## Where the logs go

The alternate screen covers the terminal. A log line written to stderr while
the TUI is running can scroll behind the interface or disappear. Two common
answers:

- **A log file.** Write to a file and inspect it after the session; the TUI
  stays clean.
- **A log pane.** Keep a ring buffer of recent lines and render it in the UI;
  useful while debugging, noisy for users.

This lesson uses stderr for startup and a `RUST_LOG` switch; the next production
step is a file. The important part is that the logger is initialized before the
alternate screen, so startup errors are visible.

## Run it

```bash
$ cargo test
...
test tui::tests::screen_snapshot ... ok
...
```

<!-- transcripts: authored -->
```bash
$ RUST_LOG=todo=debug cargo run --bin todo-tui
```

Start the app with a bad `TODO_DB` path; the error prints before the screen
changes.

## Save your work

```bash
$ git add -A
$ git commit -m "day 54: snapshot the TUI and log startup"
[main (root-commit) ...] day 54: snapshot the TUI and log startup
 49 files changed, 7492 insertions(+)
...
$ git log --oneline
... day 54: snapshot the TUI and log startup
```

## If something went wrong

**The snapshot fails after a layout change.** Read the diff; accept it only if
the new frame is intended. The `INSTA_UPDATE=always` flag rewrites it.

**The snapshot has a different terminal width.** The `TestBackend` size is part
of the test; keep it fixed. A real terminal is not deterministic.

**A color change does not fail the test.** The buffer flattening drops styles.
Inspect `cell.fg`/`cell.bg` if the color is part of the contract.

**Logs disappear.** They are on stderr behind the alternate screen. Write to a
file or add a log pane.

**`init` panics with a global subscriber already set.** Initialize once per
process; tests should not install a global subscriber.

**The TUI starts without a terminal.** The binary needs a TTY; tests use
`TestBackend` and never call `TerminalGuard`.

## Going deeper: frame testing is cheap

Unlike a browser screenshot, a terminal frame is a string. Snapshots are small,
diffs are readable, and tests run in milliseconds. That makes the TUI the
cheapest place to test layout logic.

The limit is meaning: a snapshot cannot tell whether the interface is usable.
It cannot measure key latency or confirm that a screen reader can navigate a
terminal. Those need a human and a real terminal.

The next part ships the app: observability, secrets, an audit, deployment,
releases, and a performance pass.

<div class="day-tracker" data-day="54"></div>
