---
title: "Day 15 — Snapshot tests"
description: "Record the exact printed line as a snapshot, review it once, and let the test fail when a future change moves it. — Day 15 of 100 Days of Rust."
sidebar:
  order: 15
day: 15
---

**About 1.5 hours** · Part III, day 2 of 5.

**You'll be able to:**

- add `insta` as a dev-dependency;
- record task and list output as snapshots;
- review the diff instead of rewriting assertions.

---

The display tests assert exact strings by hand. That works for one line, but
the line will change as the app grows: a new status, a priority, a due date.
Every change means editing the expected string in the test.

A **snapshot test** records the output once, in a file, and compares future
runs against that file. When the output changes, the failure shows a diff; you
review it and accept it only if the change is intentional.

## Add insta

`insta` is a snapshot library. Add it to the dev-dependencies:

<!-- verify: Cargo.toml at=day-15 -->
```toml title="Cargo.toml"
[dev-dependencies]
insta = "1"
```

A dev-dependency is compiled only for tests and examples; the binary does not
ship it.

## Write the test

Create `tests/snapshots.rs`:

<!-- verify: tests/snapshots.rs at=day-15 -->
```rust title="tests/snapshots.rs"
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
```

The first run has no snapshot files. `insta` writes `*.snap.new` and fails,
so you can review the new content. To accept it for the first time, run:

<!-- transcripts: authored -->
```bash
$ INSTA_UPDATE=always cargo test --test snapshots
```

That writes the reviewed snapshots into `tests/snapshots/`:

<!-- transcripts: authored -->
```text title="tests/snapshots/snapshots__task.snap"
---
source: tests/snapshots.rs
expression: "format!(\"{}\", list.find(first).unwrap())"
---
#1 buy milk [done]
```

<!-- transcripts: authored -->
```text title="tests/snapshots/snapshots__list.snap"
---
source: tests/snapshots.rs
expression: list.summary()
---
2 task(s), 1 done
```

Commit the accepted snapshots. They are source: a reader can see the expected
output without running the test.

## Run the suite

```bash
$ cargo test
...
     Running tests/snapshots.rs
running 1 test
test task_and_list_lines_are_snapshots ... ok

test result: ok. 1 passed; 0 failed; ...
```

Change the task line by one character and rerun; the test fails with a diff
showing the old and new text. You then decide: is the change intentional? If
yes, accept the snapshot (`INSTA_UPDATE=always`, or `cargo insta review`). If
not, fix the code.

## Review is the test

A snapshot test is only as good as the review. Accepting a diff without
reading it turns the snapshot into a rubber stamp. The workflow is:

1. run the test;
2. read the diff;
3. accept only if it is the output you want;
4. commit the `.snap` file with the code change.

Insta writes `.snap.new` files for unreviewed changes; the app's `.gitignore`
ignores them. The reviewed `.snap` is the one that belongs in git.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 15: snapshot the printed lines"
[main ...] day 15: snapshot the printed lines
 19 files changed, 873 insertions(+)
...
$ git log --oneline
... day 15: snapshot the printed lines
```

## If something went wrong

**The test says `snapshot assertion failed` on the first run.** That is
expected; there is no snapshot yet. Run with `INSTA_UPDATE=always` once, review
the files, and commit them.

**`.snap.new` files appear after a failure.** They are the proposed new
snapshots. Review them, then accept or delete; do not commit them.

**The snapshot includes an absolute path or a timing.** Normalize the output
before snapshotting, or use a redaction. A snapshot that changes on every
machine is not a test.

**`cargo insta` is not installed.** The environment variable
`INSTA_UPDATE=always` works without the CLI. The CLI adds a review UI, not a
different format.

**A snapshot passes in one directory and fails in another.** The test is
picking up a path or an environment value. Make the input explicit.

**The diff is too large to read.** The snapshot is too broad. Snapshot a small
line or a single page, not a whole debug dump.

## Going deeper: inline snapshots

`insta::assert_snapshot!(value, @"expected")` keeps the expected value in the
test file. Inline snapshots are convenient for short output; file snapshots
are better for longer pages and for output you want to review as a document.

Snapshots are not a substitute for assertions. Use a snapshot for rendering —
HTML, tables, formatted text — and a normal assertion for a rule: "the total is
3", "the status is 422". A snapshot says "same as before"; an assertion says
"this is correct."

<div class="day-tracker" data-day="15"></div>
