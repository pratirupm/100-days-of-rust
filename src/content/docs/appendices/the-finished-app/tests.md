---
title: "tests — the finished app"
description: "The finished app, file by file: tests (spoilers)."
sidebar:
  hidden: true
tableOfContents: false
pagefind: false
---


Part of [The finished app (spoilers)](/100-days-of-rust/appendices/the-finished-app/).


## `tests/cli.rs`

````rust
//! Black-box tests for the real binary: start it, capture stdout, and read
//! the output the way a user would.

use std::process::Command;

fn todo() -> Command {
    Command::new(env!("CARGO_BIN_EXE_todo"))
}

#[test]
fn binary_runs_and_prints_the_banner() {
    let out = todo().output().expect("failed to run todo");
    assert!(out.status.success(), "exit status was {:?}", out.status);

    let stdout = String::from_utf8(out.stdout).expect("stdout is UTF-8");
    assert_eq!(stdout.lines().next(), Some("todo — a tiny task manager"));
}

#[test]
fn demo_shows_views_and_a_list_summary() {
    let out = todo().output().expect("failed to run todo");
    assert!(out.status.success(), "exit status was {:?}", out.status);

    let stdout = String::from_utf8(out.stdout).expect("stdout is UTF-8");
    assert!(stdout.contains("view: #1 buy milk [done] done=true"));
    assert!(stdout.contains("list: 2 task(s), 1 done"));
}

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

#[test]
fn add_then_list_persists_across_processes() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("todo.json");

    let add = todo()
        .env("TODO_DB", &db)
        .args(["add", "buy milk"])
        .output()
        .expect("failed to add");
    assert!(add.status.success(), "add exit status was {:?}", add.status);

    let list = todo()
        .env("TODO_DB", &db)
        .arg("list")
        .output()
        .expect("failed to list");
    assert!(
        list.status.success(),
        "list exit status was {:?}",
        list.status
    );

    let stdout = String::from_utf8(list.stdout).expect("stdout is UTF-8");
    assert!(stdout.contains("buy milk"), "list stdout was: {stdout}");
}

#[test]
fn verbose_logs_to_stderr() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("todo.json");

    let out = todo()
        .env("TODO_DB", &db)
        .args(["--verbose", "list"])
        .output()
        .expect("failed to list");
    assert!(out.status.success(), "exit status was {:?}", out.status);

    let stderr = String::from_utf8(out.stderr).expect("stderr is UTF-8");
    assert!(stderr.contains("loaded store"), "stderr was: {stderr}");
}

#[test]
fn list_json_is_machine_readable() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("todo.json");

    let add = todo()
        .env("TODO_DB", &db)
        .args(["add", "buy milk"])
        .output()
        .expect("failed to add");
    assert!(add.status.success(), "add exit status was {:?}", add.status);

    let list = todo()
        .env("TODO_DB", &db)
        .args(["list", "--json"])
        .output()
        .expect("failed to list");
    assert!(
        list.status.success(),
        "list exit status was {:?}",
        list.status
    );

    let value: serde_json::Value = serde_json::from_slice(&list.stdout).expect("valid JSON");
    assert_eq!(value[0]["title"], "buy milk");
    assert_eq!(value[0]["status"], "Pending");
}
````


## `tests/compile_fail.rs`

````rust
//! Compile-fail tests: cases that must not compile, with the error pinned.

#[test]
fn moved_value_is_a_compile_error() {
    let cases = trybuild::TestCases::new();
    cases.compile_fail("tests/compile_fail/moved_value.rs");
}
````


## `tests/compile_fail/moved_value.rs`

````rust
use todo::{Task, TodoList};

fn main() {
    let mut list = TodoList::new();
    let task = Task::new(1, "buy milk").unwrap();
    list.push(task);
    println!("{}", task.title);
}
````


## `tests/compile_fail/moved_value.stderr`

````text
error[E0382]: borrow of moved value: `task`
 --> tests/compile_fail/moved_value.rs:7:20
  |
5 |     let task = Task::new(1, "buy milk").unwrap();
  |         ---- move occurs because `task` has type `Task`, which does not implement the `Copy` trait
6 |     list.push(task);
  |               ---- value moved here
7 |     println!("{}", task.title);
  |                    ^^^^^^^^^^ value borrowed here after move
  |
help: consider cloning the value if the performance cost is acceptable
  |
6 |     list.push(task.clone());
  |                   ++++++++
````


## `tests/library.rs`

````rust
//! Integration tests use the library the way another crate would: only the
//! public API, no private modules.

use todo::{Summary, TodoError, TodoList};

#[test]
fn the_public_api_is_usable_from_outside() {
    let mut list = TodoList::new();
    let id = list.add("buy milk").unwrap();

    assert!(list.done(id).is_ok());
    assert!(list.find(id).unwrap().is_done());
    assert_eq!(list.done(999), Err(TodoError::NotFound(999)));
    assert_eq!(list.summary(), "1 task(s), 1 done");
}
````


## `tests/property.rs`

````rust
//! Property tests: state a rule, generate many inputs, and let proptest
//! shrink any counterexample to the smallest failing case.

use proptest::prelude::*;
use todo::TodoList;

proptest! {
    #[test]
    fn non_blank_titles_round_trip(title in "[a-zA-Z0-9][a-zA-Z0-9 ]{0,39}") {
        let mut list = TodoList::new();
        let id = list.add(&title).unwrap();
        let stored = &list.find(id).unwrap().title;

        prop_assert_eq!(stored, title.trim());
    }
}
````


## `tests/smoke.rs`

````rust
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
````


## `tests/snapshots.rs`

````rust
//! Snapshot tests: record the exact line, review it, and fail when it changes.

use todo::{Summary, TodoList};

#[test]
fn task_and_list_lines_are_snapshots() {
    let mut list = TodoList::new();
    let first = list.add("buy milk").unwrap();
    list.add("write the report").unwrap();
    list.done(first).unwrap();

    insta::assert_snapshot!("task", format!("{}", list.find(first).unwrap()));
    insta::assert_snapshot!("list", list.summary());
}
````


## `tests/snapshots/snapshots__list.snap`

````text
---
source: tests/snapshots.rs
expression: list.summary()
---
2 task(s), 1 done
````


## `tests/snapshots/snapshots__task.snap`

````text
---
source: tests/snapshots.rs
expression: "format!(\"{}\", list.find(first).unwrap())"
---
#1 buy milk [done]
````


## `tests/table.rs`

````rust
//! Table tests and a small fixture, using only the public API.

use todo::{Summary, TodoError, TodoList};

fn sample_list() -> TodoList {
    let mut list = TodoList::new();
    let first = list.add("buy milk").unwrap();
    list.add("write the report").unwrap();
    list.done(first).unwrap();
    list
}

#[test]
fn title_rules_are_a_table() {
    let cases = [
        ("buy milk", true, "buy milk"),
        ("  buy milk  ", true, "buy milk"),
        ("", false, ""),
        ("   ", false, ""),
    ];

    for (input, ok, expected_title) in cases {
        let mut list = TodoList::new();
        let result = list.add(input);

        assert_eq!(result.is_ok(), ok, "input: {input:?}");
        if let Ok(id) = result {
            assert_eq!(list.find(id).unwrap().title, expected_title);
        }
    }
}

#[test]
fn the_fixture_has_one_done_and_one_pending() {
    let mut list = sample_list();

    assert_eq!(list.summary(), "2 task(s), 1 done");
    assert!(list.find(1).unwrap().is_done());
    assert!(!list.find(2).unwrap().is_done());
    assert_eq!(list.done(999), Err(TodoError::NotFound(999)));
}
````
