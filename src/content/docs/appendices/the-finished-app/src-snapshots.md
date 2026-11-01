---
title: "src/snapshots — the finished app"
description: "The finished app, file by file: src/snapshots (spoilers)."
sidebar:
  hidden: true
tableOfContents: false
pagefind: false
---


Part of [The finished app (spoilers)](/100-days-of-rust/appendices/the-finished-app/).


## `src/snapshots/todo__tui__tests__screen_snapshot.snap`

````text
---
source: src/tui.rs
expression: text
---
todo — a tiny task manager                                  ┌Tasks─────────────────────────────────────────────────────┐│✓ #1 buy milk                                             ││  #2 write the report                                     ││                                                          ││                                                          ││                                                          ││                                                          │└──────────────────────────────────────────────────────────┘2 task(s), 1 done · q quit · ↑/↓ move · enter done · ? help
````


## `src/snapshots/todo__web__tests__index_page_snapshot.snap`

````text
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
````
