---
title: A crate, a save point
day: 1
part: I
partName: Language basics
partDay: 1
partDays: 6
time: "2 hours"
description: Set up Rust, git, and the todo crate — and make the first save point before writing any real code.
bullets:
  - have Rust, Cargo, and git installed and checked;
  - create the `todo` crate and run its hello-world binary;
  - make the first commit and tag the day.
---

Every application starts with an empty folder. Ours is called `todo`, and by
the end of the book it will hold a complete todo app: a command-line tool, a
web API, a browser interface, and a terminal interface. Today it gets a few
small files, a working build, and a habit.

The habit is this: **save your work at the end of every day**. A save point is
a snapshot you can return to. In git, that snapshot is called a **commit**.
You'll make one today, before there is anything interesting to save, because
the habit is easier to build when the stakes are low.

We'll also check the tools, create the project, and run it once. No todo logic
yet — just a crate that compiles.

## What you need

- **Rust 1.99 or newer.** Install it with [rustup](https://rustup.rs). The
  installer also gives you `cargo`, Rust's build tool.
- **Git.** Install it from [git-scm.com](https://git-scm.com), or use the
  copy that came with your system.
- **A terminal.** Everything in this book happens on the command line.
- **An editor.** VS Code with the `rust-analyzer` extension is a good
  default; any editor works.

## Check the tools

Open a terminal and ask each tool for its version:

```bash
$ rustc --version
rustc 1.99.0 (b940084d7 2026-09-28)
$ cargo --version
cargo 1.99.0 (5f94df478 2026-08-27)
$ git --version
git version 2.39.5
```

The exact dates and commit hashes will differ on your machine. What matters is
that `rustc` and `cargo` are **1.99 or newer**, and that `git` answers at all.
If a command says `command not found`, the tool is not installed or not on your
`PATH`; install it and open a new terminal.

## Create the crate

A Rust **crate** is a project: source files, a manifest, and a build. `cargo
new` creates one:

```bash
$ cargo new todo
    Creating binary (application) `todo` package
note: see more `Cargo.toml` keys and their definitions at https://doc.rust-lang.org/cargo/reference/manifest.html
$ cd todo
```

The first line says Cargo made a **binary** crate — a program you can run.
The note points at the manifest reference; you can ignore it for now. The
second command moves your terminal into the new folder.

Cargo also sets up git for the project. Let's make sure the branch is called
`main`, the name the rest of the book uses:

```bash
$ git branch -M main
```

If the branch was already `main`, this command does nothing. If it was
`master`, it renames it in one step.

## Meet the files

Cargo made a small tree. The two files that matter today are `Cargo.toml` and
`src/main.rs`.

`Cargo.toml` is the **manifest** — the project's name, version, edition, and
dependencies. Open it and make it look like this:

<!-- verify: Cargo.toml at=day-01 -->
```toml title="Cargo.toml"
[package]
name = "todo"
version = "0.1.0"
edition = "2024"
description = "A tiny task manager built while learning Rust"
rust-version = "1.85"

[dependencies]
```

The first three keys came from `cargo new`. The `description` and
`rust-version` lines are optional, but they document the crate and the oldest
Rust that can build it. Leave `[dependencies]` empty for now; we add crates
one at a time, when the app needs them.

Next, pin the toolchain. Create a file called `rust-toolchain.toml` beside
`Cargo.toml`:

<!-- verify: rust-toolchain.toml at=day-01 -->
```toml title="rust-toolchain.toml"
[toolchain]
channel = "1.99.0"
components = ["rustfmt", "clippy", "rust-analyzer", "rust-src"]
```

This tells `rustup` which Rust to use in this folder. Pinning it means a
future release cannot quietly change the compiler under the book. The
components are the formatter, the linter, the editor server, and the standard
library source.

Now open `src/main.rs`:

<!-- verify: src/main.rs at=day-01 -->
```rust title="src/main.rs"
fn main() {
    println!("Hello, world!");
}
```

`fn main()` is the entry point; Rust runs this function when the program
starts. `println!` prints a line. The `!` means it is a **macro**, a piece of
code that writes more code for you; we'll meet macros properly much later.

## Run it

Build and run the program with one command:

```bash
$ cargo run
   Compiling todo v0.1.0 (/work/todo)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.08s
     Running `/target/debug/todo`
Hello, world!
```

The path in the parentheses is where Cargo found the crate; yours will be your
own folder. Cargo compiled the crate, put the binary in `target/debug/`, and
ran it. The last line is the program's output.

Two more files appeared:

- **`Cargo.lock`** records the exact version of every dependency. The project
  has none yet, so it is short — but commit it anyway. A binary application
  should build the same way tomorrow.
- **`target/`** holds build output. It is already in `.gitignore`; nothing in
  it is source, and it can always be rebuilt.

Open `.gitignore` and add the lines the app will need later:

<!-- verify: .gitignore at=HEAD -->
```text title=".gitignore"
/target
/todo.db
/todo.db-shm
/todo.db-wal
/todo.db.session
/todo.json
/todo.json.tmp
/.env
*.snap.new
```

`target/` is build output. The database and session files arrive in later
parts; ignoring them now means you cannot accidentally commit a local
database. `.env` holds secrets; `.snap.new` is a failed snapshot that should
be reviewed, not committed.

## Set your identity

Git records who made each commit. Set your name and email once, globally:

```bash
$ git config --global user.name "Your Name"
$ git config --global user.email "you@example.com"
```

Use your own name and email. If these are already set, the commands print
nothing and change nothing. If you later see an error about an unknown author
identity, this is the step to repeat.

## The first save point

Look at what git sees:

```bash
$ git status
On branch main

No commits yet

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.gitignore
	Cargo.lock
	Cargo.toml
	rust-toolchain.toml
	src/

nothing added to commit but untracked files present (use "git add" to track)
```

The files are **untracked** — git sees them but is not watching them yet.
`git add` stages them for the next commit, and `git commit` writes the
snapshot:

```bash
$ git add -A
$ git commit -m "day 1: create the todo crate"
[main (root-commit) ...] day 1: create the todo crate
 5 files changed, 28 insertions(+)
 create mode 100644 .gitignore
 create mode 100644 Cargo.lock
 create mode 100644 Cargo.toml
 create mode 100644 rust-toolchain.toml
 create mode 100644 src/main.rs
```

The hash in the brackets is different on every machine; that is why it is
elided here. The message is the part you choose. We use `day N: ...` so the
history reads like a diary.

Finally, look at the log:

```bash
$ git log --oneline
... day 1: create the todo crate
```

`git log --oneline` shows one line per commit: a short hash and the message.
You have one commit. It is a save point you can return to.

## If something went wrong

**`rustc: command not found`.** `rustup` is not installed, or its `bin`
directory is not on your `PATH`. Install it from [rustup.rs](https://rustup.rs)
and open a new terminal.

**`git: command not found`.** Install git from [git-scm.com](https://git-scm.com)
and open a new terminal.

**`fatal: not a git repository`.** You are outside the `todo` folder. Run
`cd todo` and try again.

**`Author identity unknown`.** Git does not know your name and email. Run the
two `git config --global` commands above.

**The branch is `master`, not `main`.** Run `git branch -M main` inside the
project. It renames the current branch.

**`cargo new` says the folder already exists.** Pick a different name, or
delete the old folder if it is empty and you are sure. Do not delete a folder
with work in it.

## Going deeper: crate, package, and edition

A **package** is what `Cargo.toml` describes; a **crate** is one compiled unit
inside it. A package can hold one library crate, one or more binary crates, or
both. Today the package is a single binary crate, which is why `src/main.rs`
is enough.

The `edition` key selects the language rules. Edition 2024 is the current
edition and needs Rust 1.85 or newer. Editions are opt-in and per-package, so
old code keeps compiling while the language evolves.

`Cargo.lock` is not a cache. It is a promise: the same dependency versions on
every machine. For a binary, commit it. For a library you publish for others,
the convention differs — but you are building an application, so keep it.

