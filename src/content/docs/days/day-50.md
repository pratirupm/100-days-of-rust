---
title: "Day 50 — A terminal interface"
description: "Draw the task list in a full-screen terminal interface with Ratatui — a header, a selectable list, and a status bar. — Day 50 of 100 Days of Rust."
sidebar:
  order: 50
day: 50
---

**About 2.5 hours** · Part IX, day 1 of 5.

**You'll be able to:**

- build an `App` with the tasks and a selection;
- draw a frame with a layout, a list, and a status line;
- test the screen with Ratatui's `TestBackend`.

---

The API and the web UI both talk to the database. The terminal UI is the third
client: a full-screen view that a person can drive with the arrow keys.

Ratatui is an **immediate-mode** library: every frame redraws the whole screen
from the current state. There is no retained widget tree to keep in sync; the
`App` holds the data and the selection, and `draw` renders it.

## The state

Create `src/tui.rs`:

<!-- verify: src/tui.rs at=day-50 -->
```rust title="src/tui.rs"
/// The terminal UI's state.
#[derive(Debug)]
pub struct App {
    /// The tasks shown in the list.
    pub tasks: Vec<Task>,
    /// The selected row.
    pub selected: usize,
    /// Set to true to leave the event loop.
    pub quit: bool,
    /// A short status line message.
    pub message: String,
}

impl App {
    /// Build the app from a task list.
    pub fn new(tasks: Vec<Task>) -> Self {
        Self {
            tasks,
            selected: 0,
            quit: false,
            message: "q quit · ↑/↓ move · enter done".to_string(),
        }
    }
```

The state is small on purpose. The TUI does not own a store or a session; it is
a view of a list. A later lesson adds the client that refreshes that list.

## Draw a frame

<!-- verify: src/tui.rs at=day-50 -->
```rust title="src/tui.rs"
    /// Draw one frame.
    pub fn draw(&self, frame: &mut Frame) {
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(1),
                Constraint::Min(3),
                Constraint::Length(1),
            ])
            .split(frame.area());

        let header = Paragraph::new("todo — a tiny task manager");
        frame.render_widget(header, chunks[0]);

        let items: Vec<ListItem> = self
            .tasks
            .iter()
            .map(|task| {
                let mark = if task.is_done() { "✓" } else { " " };
                ListItem::new(format!("{mark} #{} {}", task.id, task.title))
            })
            .collect();
        let list = List::new(items)
            .block(Block::default().borders(Borders::ALL).title("Tasks"))
            .highlight_style(Style::default().add_modifier(Modifier::REVERSED));
        let mut state = ListState::default();
        if !self.tasks.is_empty() {
            state.select(Some(self.selected.min(self.tasks.len() - 1)));
        }
        frame.render_stateful_widget(list, chunks[1], &mut state);

        let done = self.tasks.iter().filter(|task| task.is_done()).count();
        let status = format!(
            "{} task(s), {} done · {}",
            self.tasks.len(),
            done,
            self.message
        );
        frame.render_widget(Paragraph::new(status), chunks[2]);
    }
```

The layout is three rows: a one-line header, the list, and a one-line status.
`Constraint::Min(3)` gives the list the rest of the terminal. `ListState` holds
the selection; the list renders the highlighted row in reverse video.

The check mark is plain text, not an icon font. It is drawn by the terminal and
works in any font with the glyph.

## Keys

<!-- verify: src/tui.rs at=day-50 -->
```rust title="src/tui.rs"
    /// Handle one key.
    pub fn handle_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Char('q') | KeyCode::Esc => self.quit = true,
            KeyCode::Up | KeyCode::Char('k') => {
                self.selected = self.selected.saturating_sub(1);
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if self.selected + 1 < self.tasks.len() {
                    self.selected += 1;
                }
            }
            KeyCode::Enter | KeyCode::Char(' ') => {
                if let Some(task) = self.tasks.get_mut(self.selected) {
                    if task.is_done() {
                        task.status = crate::task::Status::Pending;
                    } else {
                        task.done();
                    }
                    self.message = format!("toggled task #{}", task.id);
                }
            }
            _ => {}
        }
    }
```

The toggles are local for now; nothing is saved. The next lessons add the event
loop, then a client that persists the change through the API.

`saturating_sub` prevents an underflow at the top; the down branch checks the
length before incrementing. Both are small guards that keep the selection in
range.

## The binary

Create `src/bin/todo-tui.rs`:

<!-- verify: src/bin/todo-tui.rs at=day-50 -->
```rust title="src/bin/todo-tui.rs"
use std::io;
use std::time::Duration;

use ratatui::Terminal;
use ratatui::backend::CrosstermBackend;
use ratatui::crossterm::event::{self, Event};
use ratatui::crossterm::execute;
use ratatui::crossterm::terminal::{
    EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode,
};
use todo::SqliteStore;
use todo::tui::App;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db = std::env::var("TODO_DB").unwrap_or_else(|_| "sqlite://todo.db".to_string());
    let store = SqliteStore::open(&db).await?;
    let app = App::new(store.list().await?);

    enable_raw_mode()?;
    execute!(io::stdout(), EnterAlternateScreen)?;
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

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    Ok(())
}
```

`enable_raw_mode` stops the terminal from line-buffering keys. The alternate
screen keeps the reader's shell history out of the view. Both are undone at the
end; a panic in the loop would skip the cleanup, which is why the next lesson
adds a guard.

The 250 ms poll keeps the UI responsive without busy-spinning. It also gives a
future background refresh a place to run.

## Test the screen

<!-- verify: src/tui.rs at=day-50 -->
```rust title="src/tui.rs"
    fn screen(app: &App) -> String {
        let backend = TestBackend::new(60, 10);
        let mut terminal = Terminal::new(backend).unwrap();
        terminal.draw(|frame| app.draw(frame)).unwrap();
        terminal
            .backend()
            .buffer()
            .content
            .iter()
            .map(|cell| cell.symbol())
            .collect()
    }

    #[test]
    fn draws_the_tasks_and_status() {
        let text = screen(&app());
        assert!(text.contains("buy milk"));
        assert!(text.contains("write the report"));
        assert!(text.contains("2 task(s), 1 done"));
    }
```

`TestBackend` renders into an in-memory buffer. The test reads the buffer as a
string and checks the content. No terminal, no TTY, no flaky timing.

## Run it

```bash
$ cargo test
...
test tui::tests::draws_the_tasks_and_status ... ok
test tui::tests::navigation_and_quit_work ... ok
test tui::tests::enter_toggles_the_selected_task ... ok
...
```

<!-- transcripts: authored -->
```bash
$ cargo run --bin todo-tui
```

The screen shows the header, the list, and the status bar. `q` exits.

## Save your work

```bash
$ git add -A
$ git commit -m "day 50: draw the terminal interface"
[main (root-commit) ...] day 50: draw the terminal interface
 47 files changed, 6731 insertions(+)
...
$ git log --oneline
... day 50: draw the terminal interface
```

## If something went wrong

**The terminal is left in raw mode after a panic.** Wrap the setup in a guard
that restores the terminal on drop. The next lesson adds it.

**The screen is blank.** The layout has no area, or `draw` was not called
inside `terminal.draw`. Check the terminal size and the constraints.

**The selection is out of range.** The list was replaced but `selected` was
not clamped. `draw` clamps for rendering; the key handler should clamp when the
data changes.

**The test sees `TestBackend` output, not the real terminal.** That is the
point. The buffer is deterministic; real terminals differ in size and font.

**Crossterm types come from two versions.** Use `ratatui::crossterm` re-exports
for events and terminal commands. A separate `crossterm` dependency can
duplicate the types.

**The arrow keys do nothing.** The terminal is not in raw mode, or the event
loop reads only `Event::Key`. Check both.

## Going deeper: immediate mode

In an immediate-mode UI, the state is the source of truth and the frame is a
function of it. There are no widget objects to mutate or free. The trade-off is
that every frame rebuilds the widgets; for a terminal-sized view, that is
cheap.

Ratatui's `Frame` is a view into a buffer. `render_widget` writes cells; the
terminal backend diffs them against the previous frame. The app never talks to
the terminal directly.

The next lesson builds the event loop around this draw function, with a
panic-safe terminal guard and a refresh path.

<div class="day-tracker" data-day="50"></div>
