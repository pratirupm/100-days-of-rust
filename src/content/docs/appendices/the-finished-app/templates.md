---
title: "templates — the finished app"
description: "The finished app, file by file: templates (spoilers)."
sidebar:
  hidden: true
tableOfContents: false
pagefind: false
---


Part of [The finished app (spoilers)](/100-days-of-rust/appendices/the-finished-app/).


## `templates/base.html`

````html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{% block title %}todo{% endblock %}</title>
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body>
  <header><a href="/">todo</a></header>
  <main>{% block content %}{% endblock %}</main>
</body>
</html>
````


## `templates/index.html`

````html
{% extends "base.html" %}
{% block title %}Tasks — todo{% endblock %}
{% block content %}
<h1>Tasks</h1>
<form method="post" action="/tasks">
  <input type="hidden" name="csrf" value="{{ csrf }}">
  <input type="text" name="title" placeholder="What needs doing?" required>
  <button type="submit">Add</button>
</form>
<ul>
{% for task in tasks %}
  <li>
    <span class="{% if task.done %}done{% endif %}">{{ task.title }}</span>
    {% if !task.done %}
    <form method="post" action="/tasks/{{ task.id }}/done">
      <input type="hidden" name="csrf" value="{{ csrf }}">
      <button type="submit">Done</button>
    </form>
    {% endif %}
  </li>
{% endfor %}
</ul>
<form method="post" action="/logout">
  <input type="hidden" name="csrf" value="{{ csrf }}">
  <button type="submit">Log out</button>
</form>
{% endblock %}
````


## `templates/login.html`

````html
{% extends "base.html" %}
{% block title %}Log in — todo{% endblock %}
{% block content %}
<h1>Log in</h1>
<form method="post" action="/login">
  <input type="hidden" name="csrf" value="{{ csrf }}">
  <label>Email <input type="email" name="email" required></label>
  <label>Password <input type="password" name="password" required></label>
  <button type="submit">Log in</button>
</form>
{% endblock %}
````
