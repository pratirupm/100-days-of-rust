---
title: "Day 48 — Page tests and accessibility"
description: "Snapshot a whole page, prove that user titles are escaped, and check the accessibility basics a form needs. — Day 48 of 100 Days of Rust."
sidebar:
  order: 48
day: 48
---

**About 2 hours** · Part VIII, day 5 of 5.

**You'll be able to:**

- snapshot the rendered task page with `insta`;
- assert that a title cannot inject HTML;
- check language, labels, and headings.

---

The web handlers have tests for status codes and cookies. They do not check
what the page actually looks like, or what happens when a title contains HTML.

Today the page itself becomes the test subject: a snapshot, an escaping test,
and a small accessibility check.

## The page snapshot

<!-- verify: src/web.rs at=day-48 -->
```rust title="src/web.rs"
    #[test]
    fn index_page_snapshot() {
        let page = IndexTemplate {
            csrf: "csrf".to_string(),
            tasks: vec![TaskRow {
                id: 1,
                title: "buy milk".to_string(),
                done: false,
            }],
        }
        .render()
        .unwrap();

        insta::assert_snapshot!(page);
    }
```

The template is rendered with fixed data: a fixed CSRF token and one task. The
snapshot records the whole HTML document. `insta` writes it under
`src/snapshots/`; a future change shows a diff.

<!-- transcripts: authored -->
```text title="src/snapshots/todo__web__tests__index_page_snapshot.snap"
---
source: src/web.rs
expression: page
---
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tasks — todo</title>
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body>
  <header><a href="/">todo</a></header>
  <main>
<h1>Tasks</h1>
<form method="post" action="/tasks">
  <input type="hidden" name="csrf" value="csrf">
  <input type="text" name="title" placeholder="What needs doing?" required>
  <button type="submit">Add</button>
</form>
<ul>

  <li>
    <span class="">buy milk</span>
    
    <form method="post" action="/tasks/1/done">
      <input type="hidden" name="csrf" value="csrf">
      <button type="submit">Done</button>
    </form>
    
  </li>

</ul>
<form method="post" action="/logout">
  <input type="hidden" name="csrf" value="csrf">
  <button type="submit">Log out</button>
</form>
</main>
</body>
</html>
```

The blank lines are what the template produces; the snapshot records them.
When the layout changes, the diff is the review.

## Escaping

<!-- verify: src/web.rs at=day-48 -->
```rust title="src/web.rs"
    #[test]
    fn titles_are_escaped() {
        let page = IndexTemplate {
            csrf: "csrf".to_string(),
            tasks: vec![TaskRow {
                id: 1,
                title: "<script>alert(1)</script>".to_string(),
                done: false,
            }],
        }
        .render()
        .unwrap();

        assert!(page.contains("&#60;script&#62;"));
        assert!(!page.contains("<script>alert(1)</script>"));
    }
```

Askama escapes `<` and `>` as HTML entities. The test checks both sides: the
entity is present, and the raw tag is not. A template engine that escapes by
default is the difference between a todo app and a stored XSS.

## Accessibility basics

<!-- verify: src/web.rs at=day-48 -->
```rust title="src/web.rs"
    #[test]
    fn pages_have_language_labels_and_headings() {
        let login = LoginTemplate {
            csrf: "csrf".to_string(),
        }
        .render()
        .unwrap();
        assert!(login.contains("<html lang=\"en\">"));
        assert!(login.contains("<label>Email"));
        assert!(login.contains("<h1>Log in</h1>"));

        let index = IndexTemplate {
            csrf: "csrf".to_string(),
            tasks: vec![],
        }
        .render()
        .unwrap();
        assert!(index.contains("<html lang=\"en\">"));
        assert!(index.contains("<h1>Tasks</h1>"));
    }
```

Three basics, three assertions:

- `<html lang="en">` tells a screen reader which language to pronounce.
- `<label>Email` gives the input an accessible name; clicking the label focuses
  the input.
- One `<h1>` per page gives the document a clear heading.

This is not a full accessibility audit. It catches the mistakes that are easy
to make in a hand-written template and cheap to prevent.

## Run it

```bash
$ cargo test
...
test web::tests::pages_have_language_labels_and_headings ... ok
test web::tests::titles_are_escaped ... ok
test web::tests::index_page_snapshot ... ok
...
```

## Save your work

```bash
$ git add -A
$ git commit -m "day 48: snapshot pages and check accessibility"
[main (root-commit) ...] day 48: snapshot pages and check accessibility
 45 files changed, 6152 insertions(+)
...
$ git log --oneline
... day 48: snapshot pages and check accessibility
```

## If something went wrong

**The snapshot fails after a template edit.** Read the diff; accept it only if
the new HTML is what you want. `INSTA_UPDATE=always` rewrites it.

**The snapshot contains a random value.** Use a fixed CSRF token in the test
data, as this test does. Do not snapshot a live request.

**A title is not escaped.** The template uses `|safe` or a raw HTML type. Remove
it; user text is never safe.

**The escaping test expects `&lt;` but sees `&#60;`.** Both are valid HTML
entities. The exact form is the template engine's choice; assert the entity it
emits and the absence of the raw tag.

**A label is missing.** An input without a label is unnamed to a screen reader.
Wrap the input in a `<label>` or add `for`/`id`.

**The page has two `h1`s.** Use one page heading and `h2` for sections. The
snapshot makes the structure visible.

## Going deeper: what a snapshot cannot see

A snapshot compares bytes, not meaning. It cannot tell whether a button is
reachable by keyboard, whether contrast passes, or whether the form order makes
sense. Those need a browser and a human.

The next layer is a browser test: Playwright can click, type, and inspect the
accessibility tree. That is heavier than `oneshot` and worth it for a few
critical flows, not every page.

For now, the page tests cover rendering, escaping, and the basics. The security
part revisits headers and cookies; the deployment part checks the real browser
over HTTPS.

<div class="day-tracker" data-day="48"></div>
