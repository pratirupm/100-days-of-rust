---
title: Config and paths
day: 22
part: IV
partName: CLI and persistence
partDay: 3
partDays: 5
time: "1.5 hours"
description: Let a global --db flag override TODO_DB, which overrides todo.json — one small precedence ladder at the edge of the app.
bullets:
  - add a global `--db` flag with `clap`;
  - resolve flag → environment → default;
  - keep the path out of the core library.
---

The app reads `TODO_DB` or writes `todo.json`. That works, but a flag is easier
to use for one command, and an environment variable is easier to set once.

Today we add both, with a clear order: **flag, then environment, then
default**. That order is the whole configuration lesson.

## The flag

`clap` can read an environment variable as a fallback for an argument. Add the
`env` feature:

<!-- verify: Cargo.toml at=day-22 -->
```toml title="Cargo.toml"
clap = { version = "4", features = ["derive", "env"] }
```

Then import `PathBuf` and add the field to `Cli`:

```rust
use std::path::PathBuf;
```

<!-- verify: src/cli.rs at=day-22 -->
```rust title="src/cli.rs"
pub struct Cli {
    /// The JSON file to read and write.
    #[arg(long, global = true, env = "TODO_DB", default_value = "todo.json")]
    pub db: PathBuf,
    /// What to do; no command prints the demo banner.
    #[command(subcommand)]
    pub command: Option<Command>,
}
```

Four attributes, four jobs:

- `--db` is the flag a user types.
- `global = true` lets it appear before or after the subcommand.
- `env = "TODO_DB"` reads the environment when the flag is absent.
- `default_value = "todo.json"` is the last resort.

`PathBuf` is an owned path. It is a better fit than `String` because the app
will hand it to file APIs, and `PathBuf` keeps the platform's path rules.

## Use the parsed path

`Cli` is destructured once in `run`:

<!-- verify: src/main.rs at=day-22 -->
```rust title="src/main.rs"
fn run(cli: Cli) -> Result<(), TodoError> {
    let Cli { command, db: path } = cli;
    let mut list = TodoList::load(&path)?;

    match command {
```

The library still does not know about flags or environment variables. It
receives a `&Path` and saves or loads. Keeping configuration at the binary's
edge is what makes the library reusable by the server and the TUI later.

## The precedence test

<!-- verify: src/cli.rs at=day-22 -->
```rust title="src/cli.rs"
    #[test]
    fn db_flag_wins_over_the_default() {
        let cli = Cli::try_parse_from(["todo", "--db", "/tmp/demo.json", "list"]).unwrap();
        assert_eq!(cli.db, PathBuf::from("/tmp/demo.json"));
    }
```

The test passes the flag explicitly. The environment fallback is exercised by
the cross-process CLI test, which sets `TODO_DB` and does not pass `--db`.

## Try it

```bash
$ cargo run -- --db /tmp/todo-demo.json add "buy milk"
added task #1
$ cargo run -- --db /tmp/todo-demo.json list
#1 buy milk [pending]
```

Both commands use the same file because both received the same flag. Change
the flag and you get a different store; that is how a test or a second profile
keeps its data separate.

The precedence ladder in full:

1. `--db /path/to/file` — this command only.
2. `TODO_DB=/path/to/file` — this shell or process.
3. `todo.json` — the default in the current directory.

The first one that is present wins. `clap` implements the order; the app only
sees the final `PathBuf`.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 22: resolve the store path from a flag"
[main ...] day 22: resolve the store path from a flag
 25 files changed, 1721 insertions(+)
...
$ git log --oneline
... day 22: resolve the store path from a flag
```

## If something went wrong

**`unexpected argument '--db'`.** The `env` feature is not the issue; `global =
true` is. A global flag can appear at any level. Without it, `--db` must come
before the subcommand.

**`TODO_DB` is ignored.** The `env` feature is missing from the `clap`
dependency, or the flag is present and wins. Check both.

**The file is still `todo.json`.** The flag is spelled `--db`, not `--database`
or `-d`. Run `todo --help` and copy the name.

**A relative path lands in the wrong directory.** Relative paths resolve
against the process's current directory. Use an absolute path in scripts and
tests.

**Two tests share a database.** Each test must use its own `tempfile::tempdir`
or its own `--db`. The precedence does not isolate tests; the test setup does.

**The path is a directory.** `load` checks `exists`, then tries to read it as a
file; the I/O error says so. Choose a file path, not a folder.

## Going deeper: configuration is a boundary

Every option has three possible homes: a flag, an environment variable, and a
file. The order matters, and the app should have one place that resolves it.
Here that place is `Cli`; later it will be a `Config` struct built from `Cli`
and the environment.

Flags are best for one-off choices; environment variables are best for
deployment; a config file is best for many settings. Do not put the resolution
ladder in every command handler. Resolve once, pass the values down.

The library API takes `&Path`, `&str`, and numbers. It does not read
`std::env`. That separation is what lets the server and the TUI share the same
core without inheriting the CLI's configuration rules.

