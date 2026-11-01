---
title: JSON persistence
day: 21
part: IV
partName: CLI and persistence
partDay: 2
partDays: 5
time: "2.5 hours"
description: Save the list to a JSON file after every change and load it on startup, so two separate commands see the same tasks.
bullets:
  - derive `Serialize` and `Deserialize` for the model;
  - save atomically and load a missing file as an empty list;
  - point the app at a file with `TODO_DB`.
---

The commands work, but each one starts with an empty list. `todo add` saves a
task in memory, then exits and forgets it; `todo list` sees nothing.

Today the list gets a file. After every change, the app writes JSON; on
startup, it loads the file. Two separate processes now share the same data.

## Add serde

<!-- verify: Cargo.toml at=day-21 -->
```toml title="Cargo.toml"
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
```

`serde` turns Rust values into data formats; `serde_json` is the JSON format.
The `derive` feature writes the conversion code from attributes.

The cross-process test later needs a temporary directory, so add `tempfile` as
a dev-dependency:

```toml
[dev-dependencies]
tempfile = "3"
```

## Make the model serializable

In `src/task.rs`, add the imports and derives:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Task { ... }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Status { ... }
```

The field names become JSON keys. `Status` becomes the strings `"Pending"` and
`"Done"` unless you add a rename attribute. Keeping the default is fine for a
file only this app reads.

## Save and load

Add the store imports and a private snapshot type, then the four methods in
`src/store.rs`:

```rust
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
```


<!-- verify: src/store.rs at=day-21 -->
```rust title="src/store.rs"
#[derive(Debug, Serialize, Deserialize)]
struct Snapshot {
    tasks: Vec<Task>,
    next_id: u32,
}

impl TodoList {
    /// Serialize the list to pretty JSON.
    pub fn to_json(&self) -> Result<String, TodoError> {
        let snapshot = Snapshot {
            tasks: self.tasks.clone(),
            next_id: self.next_id,
        };
        Ok(serde_json::to_string_pretty(&snapshot)?)
    }

    /// Parse a list from JSON.
    pub fn from_json(text: &str) -> Result<Self, TodoError> {
        let snapshot: Snapshot = serde_json::from_str(text)?;
        Ok(Self {
            tasks: snapshot.tasks,
            next_id: snapshot.next_id,
        })
    }

    /// Write the list to a file atomically.
    pub fn save(&self, path: &Path) -> Result<(), TodoError> {
        let temporary = path.with_extension("json.tmp");
        fs::write(&temporary, self.to_json()?)?;
        fs::rename(temporary, path)?;
        Ok(())
    }

    /// Load a list, or return an empty one when the file does not exist.
    pub fn load(path: &Path) -> Result<Self, TodoError> {
        if !path.exists() {
            return Ok(Self::new());
        }
        Self::from_json(&fs::read_to_string(path)?)
    }
}
```

`Snapshot` exists so the JSON shape is explicit. The list's fields are private;
the snapshot is the boundary.

`save` writes to a temporary file and renames it over the real one. A rename on
the same filesystem is atomic: a reader sees the old file or the new file, never
a half-written one. If the process dies mid-write, the old file survives.

`load` returns an empty list when the file does not exist. A missing file is
not an error on first run; a file that exists but cannot be parsed *is* an
error.

## The error variants

The store can fail for reasons the task model never could. Add two variants
and conversions:

<!-- verify: src/error.rs at=day-21 -->
```rust title="src/error.rs"
    /// The store could not be read or written.
    #[error("could not read or write the store: {0}")]
    Io(String),
    /// The store's JSON could not be parsed.
    #[error("could not parse the store: {0}")]
    Json(String),
}

impl From<std::io::Error> for TodoError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error.to_string())
    }
}

impl From<serde_json::Error> for TodoError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error.to_string())
    }
}
```

The conversions are what make `?` work on `fs::write`, `fs::read_to_string`,
and `serde_json::from_str`. The error text is kept as a `String` so the enum
stays comparable in tests; a production error might keep the source error
instead.

## Point the app at a file

`TODO_DB` chooses the file; without it, the app uses `todo.json` in the
current directory:

<!-- verify: src/main.rs at=day-21 -->
```rust title="src/main.rs"
fn db_path() -> PathBuf {
    std::env::var_os("TODO_DB")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("todo.json"))
}
```

At the start of `run`, load the list:

<!-- verify: src/main.rs at=day-21 -->
```rust title="src/main.rs"
    let path = db_path();
    let mut list = TodoList::load(&path)?;
```

After every change, save it:

<!-- verify: src/main.rs at=day-21 -->
```rust title="src/main.rs"
        Some(Command::Add { title }) => {
            let id = list.add(&title)?;
            list.save(&path)?;
            println!("added task #{id}");
        }
```

The same `list.save(&path)?` follows `done` and `tag`. `list` does not save;
it only reads.

## Try two processes

```bash
$ cargo run -- add "buy milk"
added task #1
$ cargo run -- list
#1 buy milk [pending]
$ cargo run -- done 1
done task #1
$ cargo run -- list
#1 buy milk [done]
```

The second `cargo run` loads the file written by the first. That is the whole
point: the data outlives the process.

## The cross-process test

<!-- verify: tests/cli.rs at=day-21 -->
```rust title="tests/cli.rs"
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
```

`tempfile::tempdir()` creates a directory that is deleted when the `TempDir`
value drops. Each test gets its own file, so tests can run in parallel.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 21: persist the list as JSON"
[main ...] day 21: persist the list as JSON
 26 files changed, 1729 insertions(+)
...
$ git log --oneline
... day 21: persist the list as JSON
```

## If something went wrong

**`the trait Serialize is not implemented for Task`.** The derive or the
`serde` dependency is missing. Add `Serialize, Deserialize` to the derive list
and the `use serde::{Deserialize, Serialize};` import.

**The file is created in the wrong place.** `TODO_DB` is an environment
variable. For one command, use `TODO_DB=/tmp/todo.json cargo run -- add ...`;
for a shell, export it once.

**`could not parse the store`.** The file is not the JSON the app wrote. Open
it, fix it by hand, or delete it if it is a scratch file. The error includes
the parser's message and position.

**`could not read or write the store: No such file or directory`.** The
parent directory does not exist. Create it, or choose a path that does.

**The rename fails with `Invalid cross-device link`.** The temporary file and
the target must be on the same filesystem. Use a `.tmp` file beside the target,
as `save` does.

**Two commands race and one loses a write.** A single-file store is not a
database. For one user and one command at a time it is fine; concurrent writers
need locking or SQLite, which arrives in Part VI.

## Going deeper: a file format is an interface

Once a file is on disk, users can copy it, edit it, and keep it for years. Treat
the JSON shape as an interface:

- adding a field with a default is backward-compatible;
- renaming a field breaks old files unless you add an alias;
- removing a field silently loses data;
- a version field makes migrations explicit.

The export/import lesson will add a version to the document. For now, the
snapshot is small enough to read and repair by hand, which is a feature.

