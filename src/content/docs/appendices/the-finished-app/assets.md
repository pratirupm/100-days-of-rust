---
title: "assets — the finished app"
description: "The finished app, file by file: assets (spoilers)."
sidebar:
  hidden: true
tableOfContents: false
pagefind: false
---


Part of [The finished app (spoilers)](/100-days-of-rust/appendices/the-finished-app/).


## `assets/app.css`

````css
:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}
body {
  max-width: 42rem;
  margin: 2rem auto;
  padding: 0 1rem;
}
header a {
  font-weight: 700;
  text-decoration: none;
}
form {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin: 0.75rem 0;
}
input {
  padding: 0.4rem;
}
button {
  padding: 0.45rem 0.8rem;
  cursor: pointer;
}
.done {
  text-decoration: line-through;
  opacity: 0.65;
}
li {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}
````
