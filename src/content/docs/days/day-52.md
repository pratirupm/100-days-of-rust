---
title: "Day 52 — Styling and layout"
description: "Give the terminal UI a small theme and a help overlay that centers itself and clears what is underneath. — Day 52 of 100 Days of Rust."
sidebar:
  order: 52
day: 52
---

**About 1.5 hours** · Part IX, day 3 of 5.

**You'll be able to:**

- style the header and help text;
- center an overlay with percentage constraints;
- clear the area before drawing on top.

---

The TUI works, but it looks like a debug dump. Today it gets a small theme and
a help overlay.

The overlay is a good layout exercise: it has to center itself in any terminal,
clear the rows underneath, and stay readable when the terminal is small.

## The theme

The header and help use a warm yellow; the selected row uses reverse video. The
rest stays in the terminal's default colors, so the app respects the reader's
palette.

<!-- verify: src/tui.rs at=day-52 -->
```rust title="src/tui.rs"
        let header =
            Paragraph::new("todo — a tiny task manager").style(Style::default().fg(Color::Yellow));
        frame.render_widget(header, chunks[0]);
```

A terminal may not support the color. `Color::Yellow` degrades to the default
or the nearest palette entry; it does not crash. If the app must work without
color, a `NO_COLOR` check would turn the styles off; the layout does not depend
on them.

## Centering

<!-- verify: src/tui.rs at=day-52 -->
```rust title="src/tui.rs"
fn centered(area: Rect, percent_x: u16, percent_y: u16) -> Rect {
    let vertical = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(area);
    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(vertical[1])[1]
}
```

Two layouts: one splits the area vertically into top, middle, bottom; the
second splits the middle horizontally. The result is a rectangle in the center.
Percentages adapt to any terminal size; a 50×40 overlay is half the width and
40% of the height.

## The overlay

<!-- verify: src/tui.rs at=day-52 -->
```rust title="src/tui.rs"
        if self.help {
            let area = centered(frame.area(), 50, 40);
            frame.render_widget(Clear, area);
            let help = Paragraph::new(
                "↑/↓ or j/k  move\nenter/space toggle\nq or esc    quit\n?           close help",
            )
            .block(Block::default().borders(Borders::ALL).title("Help"))
            .style(Style::default().fg(Color::Yellow));
            frame.render_widget(help, area);
        }
```

`Clear` fills the area with blank cells before the paragraph draws. Without it,
the list text shows through the spaces in the help overlay and the result is
unreadable.

The help is a static block. It lists the keys the app actually handles; if a
key is added, this text is part of the change.

## Toggle it

<!-- verify: src/tui.rs at=day-52 -->
```rust title="src/tui.rs"
            KeyCode::Char('?') => self.help = !self.help,
```

The `?` key is convenient but often requires Shift on some layouts. The help
text says `?`; the key event is the character, not the physical key, so it works
on a US layout and most others.

## The test

<!-- verify: src/tui.rs at=day-52 -->
```rust title="src/tui.rs"
    #[test]
    fn help_overlay_toggles_and_draws() {
        let mut app = app();
        app.handle_key(KeyEvent::from(KeyCode::Char('?')));
        assert!(app.help);
        let text = screen(&app);
        assert!(text.contains("Help"));
        assert!(text.contains("toggle"));
    }
```

`TestBackend` renders the overlay into the same buffer. The test checks that the
help title and one of its lines appear. It does not check colors; the buffer
holds symbols, not styles by default.

## Run it

```bash
$ cargo test
...
test tui::tests::help_overlay_toggles_and_draws ... ok
...
```

<!-- transcripts: authored -->
```bash
$ cargo run --bin todo-tui
```

Press `?`; the help appears in the center. Press `?` again; it closes. Resize
the terminal; the overlay follows the new center.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 52: style the terminal and add help"
[main ...] day 52: style the terminal and add help
 47 files changed, 6802 insertions(+)
...
$ git log --oneline
... day 52: style the terminal and add help
```

## If something went wrong

**The overlay is transparent.** `Clear` is missing, or it is rendered after the
paragraph. Clear first, then draw.

**The overlay is off-center.** The percentage constraints do not add up to 100,
or the parent area is not the full frame. Check `frame.area()`.

**The overlay is too small to read.** A fixed percentage of a tiny terminal is
tiny. For a minimum size, use `Constraint::Length` with a clamp, or skip the
overlay when the area is below a threshold.

**The help text shows a key that does nothing.** The text and `handle_key` are
out of sync. Update both in the same change.

**Colors are invisible on a light terminal.** Yellow on white is low contrast.
Use a style that works with the terminal's palette, or respect `NO_COLOR`.

**The selected row loses its highlight under the overlay.** That is expected;
the overlay covers it. The selection returns when the overlay closes.

## Going deeper: small terminals

A 40×10 terminal is a real constraint. The layout uses `Min(3)` for the list,
so the list gets at least three rows even when the header and status take two.
A smaller terminal may still clip; Ratatui does not scroll the whole screen.

For a production TUI, set a minimum size and show a "terminal too small"
message. The help overlay is the first place to test it: at 50% width, a 20×5
terminal has no room for the text.

The next lesson gives the TUI a real client: it loads and saves tasks through
the API instead of reading the database directly.

<div class="day-tracker" data-day="52"></div>
