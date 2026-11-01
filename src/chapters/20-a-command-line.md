---
title: A command line
day: 20
part: IV
partName: CLI and persistence
partDay: 1
partDays: 5
time: "2 hours"
description: Give the demo real commands with clap — add, list, done, and tag — and let the parser reject bad input before the app runs.
bullets:
  - define a command tree with `clap` derive;
  - parse the arguments and dispatch on the command;
  - test the parser without starting a process.
---

The binary can add, find, and print tasks, but only through its demo. A real
tool needs commands a person can type: `todo add "buy milk"`, `todo list`,
`todo done 1`.

Today we add a command line with `clap`. The parser reads the arguments,
rejects a missing title, and produces an enum the app can match on.

## Add clap

<!-- verify: Cargo.toml at=day-20 -->
```toml title="Cargo.toml"
clap = { version = "4", features = ["derive"] }
```

`clap` is the standard argument parser. The `derive` feature lets us describe
the command tree with Rust types instead of builder calls.

## The command tree

Create `src/cli.rs`:

<!-- verify: src/cli.rs at=day-20 -->
```rust title="src/cli.rs"
use clap::{Parser, Subcommand};

/// The command-line surface.
#[derive(Debug, PartialEq, Eq, Parser)]
#[command(name = "todo", version, about = "A tiny task manager")]
pub struct Cli {
    /// What to do; no command prints the demo banner.
    #[command(subcommand)]
    pub command: Option<Command>,
}

/// The available commands.
#[derive(Debug, PartialEq, Eq, Subcommand)]
pub enum Command {
    /// Add a task by title.
    Add {
        /// The task's title.
        title: String,
    },
    /// List the tasks.
    List,
    /// Mark a task done by id.
    Done {
        /// The task id.
        id: u32,
    },
    /// Add a tag to a task.
    Tag {
        /// The task id.
        id: u32,
        /// The tag to add.
        tag: String,
    },
}
```

`Cli` is the parser. `command: Option<Command>` means the subcommand is
optional; no subcommand runs the demo. `Command` is an enum, so the `match` in
`main` is exhaustive: add a command later and the compiler will point at the
match that needs a new arm.

The doc comments become the help text. `#[command(...)]` sets the name,
version, and about line. `Add { title: String }` makes `title` a required
positional argument; clap refuses `todo add` with no title before `run` is
called.

Declare the module in `src/lib.rs` and re-export the command types:

```rust
pub mod cli;
pub use cli::{Cli, Command};
```

## Dispatch

Move the body of the old `run` into a new function, `fn demo(list: &mut
TodoList) -> Result<(), TodoError>`. The body does not change; it now receives
the list instead of creating it.

In `main.rs`, import the parser and the command types, then parse and match:

Add the imports at the top of `src/main.rs`:

```rust
use clap::Parser;
use todo::{Cli, Command, Summary, TodoError, TodoList};
```

Then append `run` and the new `main`:

<!-- verify: src/main.rs at=day-20 -->
```rust title="src/main.rs"
fn run(cli: Cli) -> Result<(), TodoError> {
    let mut list = TodoList::new();

    match cli.command {
        None => demo(&mut list)?,
        Some(Command::Add { title }) => {
            let id = list.add(&title)?;
            println!("added task #{id}");
        }
        Some(Command::List) => {
            for task in list.list() {
                println!("{task}");
            }
        }
        Some(Command::Done { id }) => {
            list.done(id)?;
            println!("done task #{id}");
        }
        Some(Command::Tag { id, tag }) => {
            let task = list.find_mut(id).ok_or(TodoError::NotFound(id))?;
            task.add_tag(&tag);
            println!("tagged task #{id} with {tag}");
        }
    }

    Ok(())
}

fn main() {
    let cli = Cli::parse();
    if let Err(error) = run(cli) {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}
```

`Cli::parse()` in `main` reads the process arguments and exits with a helpful
message on invalid input. `run` receives a parsed value, so every branch knows
the fields exist.

## Test the parser

Parsing is a pure function; test it without starting a process:

<!-- verify: src/cli.rs at=day-20 -->
```rust title="src/cli.rs"
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_add() {
        let cli = Cli::try_parse_from(["todo", "add", "buy milk"]).unwrap();
        assert_eq!(
            cli.command,
            Some(Command::Add {
                title: "buy milk".to_string()
            })
        );
    }

    #[test]
    fn no_command_is_the_demo() {
        let cli = Cli::try_parse_from(["todo"]).unwrap();
        assert_eq!(cli.command, None);
    }

    #[test]
    fn add_needs_a_title() {
        assert!(Cli::try_parse_from(["todo", "add"]).is_err());
    }
}
```

`try_parse_from` returns a `Result` instead of exiting, which makes it
testable. The real `main` uses `parse`, which prints the error and exits with
status 2.

## Try it

```bash
$ cargo run -- --help
...
Usage: todo [COMMAND]

Commands:
  add   Add a task by title
  list  List the tasks
  done  Mark a task done by id
  tag   Add a tag to a task
...
```

```bash
$ cargo run -- add "buy milk"
added task #1
$ cargo run -- list
```

`list` prints nothing because each process starts with a new in-memory list.
That is the next lesson: persistence. The command works; the memory does not
survive the process.

The no-argument demo still runs, so the existing smoke test and the view demo
keep working.

## Add a black-box check

`tests/cli.rs` grows one test:

<!-- verify: tests/cli.rs at=day-20 -->
```rust title="tests/cli.rs"
#[test]
fn help_lists_the_commands() {
    let out = todo().arg("--help").output().expect("failed to run todo");
    assert!(out.status.success(), "exit status was {:?}", out.status);

    let stdout = String::from_utf8(out.stdout).expect("stdout is UTF-8");
    assert!(stdout.contains("add"));
    assert!(stdout.contains("list"));
    assert!(stdout.contains("done"));
    assert!(stdout.contains("tag"));
}
```

The test runs the real binary and checks that the help output names every
command. If a command is removed, the test asks why.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 20: give the app a command line"
[main ...] day 20: give the app a command line
 25 files changed, 1584 insertions(+)
...
$ git log --oneline
... day 20: give the app a command line
```

## If something went wrong

**`cannot find derive macro Parser`.** The `derive` feature is missing from
the `clap` dependency. Use `features = ["derive"]`.

**`error: the following required arguments were not provided`.** `todo add`
needs a title. That is clap doing its job; quote a multi-word title:
`todo add "buy milk"`.

**`unrecognized subcommand`.** The command is spelled differently. Run
`todo --help` and use the listed name.

**`Cli::parse` exits the test process.** Tests should use
`try_parse_from`, not `parse`. `parse` is for the real `main`.

**`list` is empty after `add`.** Each process starts with an empty in-memory
list. Persistence arrives next; until then, the commands are exercised in one
process through `run` or the unit tests.

## Going deeper: parsing is a boundary

The parser is the app's first boundary. It turns untrusted text into a typed
`Command`; after that, the rest of the app deals in values, not strings. That
is why `run(cli: Cli)` is easier to test than a function that reads
`std::env::args` directly.

`clap` can parse values, validate ranges, and generate shell completions. We
will add a global `--db` flag and a `--json` output switch as the app grows.
Keep the command tree small and the docs on each command honest; the help text
is the first documentation a user reads.

