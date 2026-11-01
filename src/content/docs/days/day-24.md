---
title: "Day 24 — Output formats"
description: "Print a human line for people and JSON for scripts — two formats, one data model, and a test that parses the JSON instead of matching a string. — Day 24 of 100 Days of Rust."
sidebar:
  order: 24
day: 24
---

**About 1.5 hours** · Part IV, day 5 of 5.

**You'll be able to:**

- add a `--json` switch to `add` and `list`;
- serialize tasks with `serde_json`;
- test the machine output as data, not text.

---

A person reads `#1 buy milk [pending]`. A script cannot. It wants a stable
shape with named fields, so it can ask for `title` or `status` without
parsing the brackets.

Today the CLI gets two output formats. The data model is the same; only the
printer changes. The human format stays the default; `--json` is opt-in.

## The flags

Give `add` and `list` their own switches:

<!-- verify: src/cli.rs at=day-24 -->
```rust title="src/cli.rs"
    Add {
        /// The task's title.
        title: String,
        /// Print the new task as JSON.
        #[arg(long)]
        json: bool,
    },
    /// List the tasks.
    List {
        /// Print the tasks as JSON.
        #[arg(long)]
        json: bool,
    },
```

The flag belongs to the command, not the whole app: `todo list --json` is a
machine query; `todo done 1` does not need a JSON form yet. Clap places
command flags after the subcommand.

## The printers

`add` prints either a sentence or the task object:

<!-- verify: src/main.rs at=day-24 -->
```rust title="src/main.rs"
        Some(Command::Add { title, json }) => {
            let id = list.add(&title)?;
            list.save(&path)?;
            tracing::info!(id, "added task");
            if json {
                let task = list.find(id).ok_or(TodoError::NotFound(id))?;
                println!("{}", serde_json::to_string_pretty(task)?);
            } else {
                println!("added task #{id}");
            }
        }
```

`list` prints the whole array:

<!-- verify: src/main.rs at=day-24 -->
```rust title="src/main.rs"
        Some(Command::List { json }) => {
            tracing::debug!(count = list.list().len(), "listed tasks");
            if json {
                println!("{}", serde_json::to_string_pretty(list.list())?);
            } else {
                for task in list.list() {
                    println!("{task}");
                }
            }
        }
```

`serde_json::to_string_pretty` returns a `Result`; `?` converts the error into
`TodoError` through the `From` implementation added with persistence. The
JSON goes to stdout, like the human output. Logs stay on stderr.

## Try both

```bash
$ cargo run -- --db /tmp/todo-json.json add "buy milk"
added task #1
$ cargo run -- --db /tmp/todo-json.json list --json
[
  {
    "id": 1,
    "title": "buy milk",
    "status": "Pending",
    "tags": []
  }
]
```

`add --json` prints one object:

```bash
$ cargo run -- --db /tmp/todo-json.json add "write the report" --json
{
  "id": 2,
  "title": "write the report",
  "status": "Pending",
  "tags": []
}
```

The human `list` still works:

```bash
$ cargo run -- --db /tmp/todo-json.json list
#1 buy milk [pending]
#2 write the report [pending]
```

The field names come from the `serde` derives on `Task`. The status strings
are the variant names, `"Pending"` and `"Done"`, because the enum has no
rename attribute. A public format should make that choice deliberately; the
tests pin it.

## Test the data, not the text

<!-- verify: tests/cli.rs at=day-24 -->
```rust title="tests/cli.rs"
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
```

The test parses the output and indexes into it. It does not compare a
formatted string, so adding a field or changing indentation does not break it.
It *does* break if `title` disappears or `status` changes from `Pending` to
`pending` — which is what a machine consumer would notice.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 24: print human and JSON output"
[main ...] day 24: print human and JSON output
 26 files changed, 1968 insertions(+)
...
$ git log --oneline
... day 24: print human and JSON output
```

## If something went wrong

**The JSON output is mixed with log lines.** Logs must go to stderr; user
output goes to stdout. Check `.with_writer(std::io::stderr)` in `logging.rs`.

**`--json` is rejected before the command.** The flag belongs to the
subcommand. Write `todo list --json`, not `todo --json list`, unless you make
it global.

**`invalid type: map, expected a sequence`.** `list --json` prints an array;
`add --json` prints one object. Parse each accordingly.

**The status is `"pending"` in one place and `"Pending"` in another.** The
enum's variant name is the default; a `#[serde(rename_all = "lowercase")]`
would change it. Pick one and test it.

**A new field breaks a consumer.** That is a format change. Add fields with a
default and keep old ones; removing or renaming is a breaking change. A
version field makes the change explicit.

**Pretty output is too large for a pipe.** Add `--compact` or use
`to_string` instead of `to_string_pretty`. Pretty printing is for humans and
tests; a machine does not need the indentation.

## Going deeper: stdout is a contract

A command-line tool's stdout is an interface. Scripts depend on it, and a
change that looks cosmetic can break them. The human format may change with a
warning; the JSON format should change with a version or a new flag.

For a stream of records, **NDJSON** — one JSON object per line — is easier to
consume than a pretty array. It also handles a list that grows while it is
being read. The app is small enough for an array; when it streams, switch.

`jq` is the fastest way to check a format by hand:

<!-- transcripts: authored -->
```bash
$ cargo run -- --db /tmp/todo.json list --json | jq '.[].title'
```

If `jq` can read it, a script can. If the output needs a special parser, the
format is doing too little work.

<div class="day-tracker" data-day="24"></div>
