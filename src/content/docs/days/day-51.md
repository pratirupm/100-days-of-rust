---
title: "Day 51 — The event loop"
description: "Drive the screen from a poll-and-read loop, and restore the terminal with a guard that runs even when the app panics. — Day 51 of 100 Days of Rust."
sidebar:
  order: 51
day: 51
---

**About 2 hours** · Part IX, day 2 of 5.

**You'll be able to:**

- poll for keys without busy-spinning;
- quit on `q` or Escape;
- restore raw mode and the alternate screen on drop.

---

The TUI can draw a frame. It cannot yet respond to a key. The event loop is the
bridge: poll, read, update the state, redraw.

The second half of the lesson is cleanup. A full-screen app that leaves the
terminal in raw mode is a broken shell; the guard makes the restore happen even
when a handler panics.

## The guard

<!-- verify: src/tui.rs at=day-51 -->
```rust title="src/tui.rs"
/// Restore the terminal when dropped, including during a panic.
pub struct TerminalGuard;

impl TerminalGuard {
    /// Enter raw mode and the alternate screen.
    pub fn enter() -> io::Result<Self> {
        enable_raw_mode()?;
        execute!(io::stdout(), EnterAlternateScreen)?;
        Ok(Self)
    }
}

impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let _ = execute!(io::stdout(), Show, LeaveAlternateScreen);
        let _ = disable_raw_mode();
    }
}
```

`enter` enables raw mode and switches to the alternate screen. The `Drop` impl
reverses both. Rust runs `Drop` during unwinding, so a panic in the event loop
still restores the terminal. The `let _ =` ignores cleanup errors: there is
nothing useful to do if the terminal is already gone.

`Show` puts the cursor back; the alternate-screen leave does not necessarily
restore it.

## The loop

<!-- verify: src/bin/todo-tui.rs at=day-51 -->
```rust title="src/bin/todo-tui.rs"
    let _guard = TerminalGuard::enter()?;
    let mut terminal = Terminal::new(CrosstermBackend::new(io::stdout()))?;
    let mut app = app;

    while !app.quit {
        terminal.draw(|frame| app.draw(frame))?;
        if event::poll(Duration::from_millis(250))? {
            if let Event::Key(key) = event::read()? {
                app.handle_key(key);
            }
        }
    }

    terminal.show_cursor()?;
    Ok(())
```

`poll` waits up to 250 ms for an event. If one arrives, `read` consumes it. The
timeout keeps the loop from burning a core when nothing happens; it also gives
a future background refresh a natural place to run.

The loop condition is the app's `quit` flag. `handle_key` sets it on `q` or
Escape. The guard drops at the end of `main`, after `show_cursor`.

## The selection test

<!-- verify: src/tui.rs at=day-51 -->
```rust title="src/tui.rs"
    #[test]
    fn selected_task_tracks_the_selection() {
        let mut app = app();
        app.handle_key(KeyEvent::from(KeyCode::Down));
        assert_eq!(app.selected_task().unwrap().id, 2);
    }
```

The event loop is hard to test as a whole because it owns a terminal. The
`handle_key` state machine is easy: send a key, assert the state. The binary's
loop is thin enough that the state tests cover the logic.

## Run it

```bash
$ cargo test
...
test tui::tests::selected_task_tracks_the_selection ... ok
...
```

<!-- transcripts: authored -->
```bash
$ cargo run --bin todo-tui
```

Press the arrow keys, `j`/`k`, Enter, and `q`. The selection moves, the task
toggles locally, and the terminal returns to the shell.

## Save your work

```bash
$ git add -A
$ git commit -m "day 51: guard the terminal event loop"
[main (root-commit) ...] day 51: guard the terminal event loop
 47 files changed, 6757 insertions(+)
...
$ git log --oneline
... day 51: guard the terminal event loop
```

## If something went wrong

**The shell is in raw mode after an error.** The guard did not run: `main`
returned before `enter`, or the process called `std::process::exit`. Let the
guard drop; do not exit inside the loop.

**The screen is garbled after a panic.** The alternate screen was left, but the
cursor is hidden or raw mode is still on. The guard handles both; if a custom
panic hook runs, make sure it does not bypass `Drop`.

**The app uses 100% CPU.** `poll` is missing or has a zero timeout. Use a
non-zero duration, or block on `read` if no refresh is needed.

**A key press is handled twice.** Some terminals report key release events.
Filter on `KeyEventKind::Press` if your crossterm version provides it.

**The arrow keys print escape sequences.** Raw mode was not enabled, or the
terminal is not the alternate screen. Check `TerminalGuard::enter`.

**Tests cannot open a terminal.** They should not. Use `TestBackend` for the
screen and `handle_key` for the state; the real terminal belongs to the binary.

## Going deeper: a panic hook

`Drop` runs during unwinding only if the panic strategy is `unwind` (the
default). A release profile with `panic = "abort"` skips destructors; a
terminal app should keep unwinding, or install a panic hook that restores the
terminal before aborting.

A panic hook can also print the panic message after restoring the screen, so
the user sees the error instead of a blank alternate screen. The guard is the
floor; a hook is the polish.

The next lesson styles the interface: a theme, a help overlay, and a layout
that follows a small terminal.

<div class="day-tracker" data-day="51"></div>
