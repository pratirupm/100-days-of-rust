---
title: The first test
day: 2
part: I
partName: Language basics
partDay: 2
partDays: 6
time: "2 hours"
description: Write the first test — before the code it tests — and turn the hello-world stub into the todo banner.
bullets:
  - write an integration test that runs the real binary;
  - watch it fail for the right reason;
  - make it pass, then save the day.
---

Yesterday the crate printed `Hello, world!`. Today we decide what it should
print instead — and we decide it in a test, before changing the program.

A test is a small piece of code that checks another piece of code. Writing it
first feels backwards. It means we cannot fool ourselves: the test fails until
the program actually does what we said it should.

The target is the app's banner. When someone runs `todo` with no arguments, the
first line should be:

```text
todo — a tiny task manager
```

That em dash is part of the contract. A hyphen is a different character, and
the test will notice.

## What a test looks like

Rust has two common places for tests:

- **Unit tests** live beside the code, inside a `#[cfg(test)] mod tests` block.
  They can reach private functions and are compiled only for `cargo test`.
- **Integration tests** live in the `tests/` folder. Each file there is
  compiled as its own crate, and it uses your program the way a user would.

Today we use an integration test because the thing we care about is the real
binary's output. The test will run the program, capture what it prints, and
compare the first line.

## Write the test

Create a file called `tests/smoke.rs` next to `src/`:

<!-- verify: tests/smoke.rs at=day-02 -->
```rust title="tests/smoke.rs"
//! End-to-end smoke test: run the real binary and check the banner.

use std::process::Command;

#[test]
fn banner_prints_on_start() {
    let out = Command::new(env!("CARGO_BIN_EXE_todo"))
        .output()
        .expect("failed to run `todo`");
    assert!(out.status.success(), "exit status was {:?}", out.status);
    let stdout = String::from_utf8(out.stdout).expect("stdout is UTF-8");
    let first = stdout.lines().next().unwrap_or("");
    assert_eq!(first, "todo — a tiny task manager");
}
```

There is a lot here. Take it one line at a time:

- `use std::process::Command;` brings in the standard library's way to start a
  program.
- `#[test]` marks the function as a test. `cargo test` finds it.
- `env!("CARGO_BIN_EXE_todo")` is filled in by Cargo at build time with the
  path to the `todo` binary. The name comes from the package name.
- `.output()` runs the program and waits for it to finish.
- `assert!` checks the exit status. `assert_eq!` checks the first line.
- The strings after the comma are the messages shown when an assertion fails.

The test does not import anything from `src/main.rs`. It runs the compiled
binary, exactly as a person would.

## Watch it fail

Run the tests:

```bash
$ cargo test
   Compiling todo v0.1.0 (...)
    Finished `test` profile ...
     Running unittests src/main.rs (...)
...
test banner_prints_on_start ... FAILED
...
thread 'banner_prints_on_start' ... panicked at tests/smoke.rs:13:5:
assertion `left == right` failed
  left: "Hello, world!"
 right: "todo — a tiny task manager"
...
test result: FAILED. 0 passed; 1 failed; ...
```

The program ran successfully — the exit status check passed — but the first
line was `Hello, world!`, not the banner. The test tells us exactly what is
wrong and where: `tests/smoke.rs:13:5`.

This is the useful kind of failure. It is not a broken build; it is a
description of the gap between what the program does and what we decided it
should do.

## Make it pass

Open `src/main.rs` and replace the hello-world line with a banner:

<!-- verify: src/main.rs at=day-02 -->
```rust title="src/main.rs"
const USAGE: &str = "todo — a tiny task manager\n\nUsage:\n  todo              start the interactive list\n  todo add <title>  add a task\n  todo list         list tasks\n";

fn main() {
    println!("{USAGE}");
}
```

`const USAGE` is a constant: a name for a value that does not change. The value
is a string slice, `&str`, with `\n` escape sequences for the line breaks.

`fn main()` keeps the same shape, but now it prints the constant. `{USAGE}`
inside `println!` inserts the constant's value. The braces are a formatting
placeholder; `println!` replaces them with the value.

## Run it again

```bash
$ cargo test
   Compiling todo v0.1.0 (...)
    Finished `test` profile ...
     Running unittests src/main.rs (...)
...
running 1 test
test banner_prints_on_start ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; ...
```

The test passes. Run the program itself:

```bash
$ cargo run
    Finished `dev` profile ...
     Running `/target/debug/todo`
todo — a tiny task manager

Usage:
  todo              start the interactive list
  todo add <title>  add a task
  todo list         list tasks
```

That is the first real behavior of the app. The commands listed under `Usage`
do not exist yet; they are the contract for the next few days.

## Why an integration test?

The test lives in `tests/`, so Cargo compiles it as a separate crate. It does
not call a function in `src/main.rs`; it starts the real binary. That catches a
whole class of problems a unit test cannot see: a wrong binary name, a panic
before `main`, a banner printed to the wrong stream.

We will write unit tests too, when the code has pieces worth testing in
isolation. The integration test is the one that says "the program, as a
program, works."

## Save your work

You know the drill:

```bash
$ git status
On branch main
...
$ git add -A
$ git commit -m "day 2: add the first test"
[main (root-commit) ...] day 2: add the first test
 6 files changed, 44 insertions(+)
...
$ git log --oneline
... day 2: add the first test
```

The hash and the exact file count will differ if your tree has extra files.
The save point is what matters.

## If something went wrong

**`no test files` or the test is not found.** The file must be in `tests/` and
end in `.rs`. A file called `tests/smoke.txt` is not a test.

**`error: environment variable CARGO_BIN_EXE_todo not defined`.** You are
running the test outside Cargo, or the package name is not `todo`. Run
`cargo test` from the project root, and check `name = "todo"` in
`Cargo.toml`.

**The test still fails with `Hello, world!`.** The binary was not rebuilt. Run
`cargo clean -p todo`, then `cargo test` again. This can happen if a shared
build cache contains an older binary.

**The test fails with a different banner.** Compare the em dash. The expected
string uses `—` (U+2014), not `-` (hyphen). The book's text and your source
must agree.

**The test passes but `cargo run` looks wrong.** Check that you saved
`src/main.rs`. An unsaved editor buffer is the most common cause.

## Going deeper: why write the test first?

Because it flips the order of the decisions. When the test comes first, you
decide what the code should do *before* you write it, and the test holds you
to that decision. It also gives you a safety net for later: when the code
changes, the test tells you immediately if the behavior broke.

Two useful flags:

- `cargo test banner` runs only tests whose names contain `banner`.
- `cargo test -- --nocapture` shows output from tests that pass, instead of
  hiding it.

A test name is documentation. `banner_prints_on_start` says what the test
checks without opening the file.

