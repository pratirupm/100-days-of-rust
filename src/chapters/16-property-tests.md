---
title: Property tests
day: 16
part: III
partName: Testing and tooling
partDay: 3
partDays: 5
time: "1.5 hours"
description: State a rule that should hold for every non-blank title, generate hundreds of inputs, and let proptest shrink the smallest failure.
bullets:
  - add `proptest` as a dev-dependency;
  - write a property with a generated string strategy;
  - read a counterexample after a failure.
---

The table test lists four titles. It is useful, but it only checks the titles
we thought of. A **property test** states a rule that should hold for *every*
input in a range, generates the inputs, and shrinks a failure to the smallest
case.

The rule today: **a non-blank title comes back trimmed.** Adding a title,
then reading the stored task, should give `title.trim()` — for every title
made of letters, digits, and spaces.

## Add proptest

<!-- verify: Cargo.toml at=day-16 -->
```toml title="Cargo.toml"
[dev-dependencies]
insta = "1"
proptest = "1"
```

`proptest` is a dev-dependency; it runs only in tests.

## The property

Create `tests/property.rs`:

<!-- verify: tests/property.rs at=day-16 -->
```rust title="tests/property.rs"
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
```

The string `"[a-zA-Z0-9][a-zA-Z0-9 ]{0,39}"` is a **strategy**: a recipe for
generating inputs. It produces one to forty characters, starting with a letter
or digit and then allowing letters, digits, and spaces. The first character is
non-space on purpose: a title made only of spaces trims to empty and is
rejected.
The property creates a fresh list for each generated title, adds it, reads it
back, and compares.

`prop_assert_eq!` is `assert_eq!` with a difference: when it fails, proptest
records the input and **shrinks** it, trying shorter and simpler values until
it finds the smallest one that still fails.

## Run it

```bash
$ cargo test
...
     Running tests/property.rs
running 1 test
test non_blank_titles_round_trip ... ok

test result: ok. 1 passed; 0 failed; ...
```

The test ran 256 cases by default. To run more:

<!-- transcripts: authored -->
```bash
$ PROPTEST_CASES=1000 cargo test --test property
```

If the property fails, the output names the seed and the minimal input. You
can reproduce it with `PROPTEST_CASES` and the seed, then fix the code and run
again.

## A failure looks like this

A property failure is not a list of values; it is a counterexample:

<!-- transcripts: authored -->
```text
minimal failing input: title = "  buy milk  "
    success: ...
    fail: ...
```

Read the smallest input first. It is the case the shrinker found after
removing everything that did not matter. Fix that case, then run the property
again.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 16: property-test title round-trips"
[main ...] day 16: property-test title round-trips
 20 files changed, 1096 insertions(+)
...
$ git log --oneline
... day 16: property-test title round-trips
```

## If something went wrong

**`proptest` cannot find a strategy.** Import `proptest::prelude::*`. The
`proptest!` macro and the strategies need it.

**The property fails with an empty title.** The regex `{1,40}` should not
produce an empty string, but spaces-only inputs are possible and `trim()`
makes them empty. That is a real rule: either reject whitespace-only titles in
the strategy or assert the error. This is why the strategy is part of the
test.

**A failure is not reproducible.** Save the seed proptest prints and pass it
back with `PROPTEST_SEED` or the test runner's seed option. A property test
that cannot be reproduced is not a test.

**The test is too slow.** Lower `PROPTEST_CASES` in the test environment, or
narrow the strategy. Keep the full run for the pre-push test run.

**The property passes but the table test fails.** They check different
things. The table pins exact cases; the property explores a range. Keep both.

## Going deeper: properties worth writing

Good properties are rules, not examples:

- round-trip: encode then decode equals the original;
- idempotence: doing the operation twice equals doing it once;
- invariant: a sorted list is still sorted after inserting an item;
- equivalence: the fast path and the slow path agree.

For the store, the next useful property is “adding N tasks yields N tasks with
unique ids.” For the JSON store, it is “export then import yields the same
list.” Those become possible when persistence lands.

Property tests are not a replacement for example tests. Examples document the
contract; properties search the edges. Use both, and keep the properties small
enough that a failure points at one rule.

