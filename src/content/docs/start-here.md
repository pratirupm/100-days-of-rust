---
title: Start here
description: How 100 Days of Rust works — what you need, the three tracks, the day-by-day rhythm, and how you'll learn Rust by building a todo app from an empty folder.
---

This book is a programming course that builds one real application, from an
empty folder to a working todo app — the kind of app you might use to keep
track of what needs doing. You'll write every line of it yourself, and by the
end you'll understand every part of it.

No programming experience is needed. If you can open a terminal, run a
command, and edit a file, you're ready.

## What you need

- **Rust 1.99 or newer.** Install it with [rustup](https://rustup.rs). To
  check, run `rustc --version` and `cargo --version` — they should print
  something like `rustc 1.99.0` and `cargo 1.99.0`.
- **Git.** Install it from [git-scm.com](https://git-scm.com), or use the
  version already on your system. To check, run `git --version`.
- **A terminal.** Everything in this book happens on the command line.
- **An editor.** VS Code with the `rust-analyzer` extension is a good
  default; any editor works.
- **Podman** for the production days (61–90). The first 60 days need only
  Rust and git.

## How this book works

The book has three tracks:

1. **Days 1–60 — build the app.** Ten parts: fifty build days and ten review
   days. You finish with a complete, tested, deployable todo app.
2. **Days 61–90 — production ground.** Fifteen topics, two days each:
   containers, PostgreSQL, Redis, Kafka, gRPC, WebSockets, Kubernetes, and
   the rest. The same app grows; it does not restart.
3. **Days 91–100 — data structures and algorithms.** Ten days, measured with
   `criterion` and tied back to the app.

You can stop at Day 60 with a working application. The last 40 days are for
when you want to go further.

## The daily rhythm

Each build day follows the same steps:

1. **Write a test that describes what the piece should do** — and run it, so
   you watch it fail. The failure tells us exactly what's missing.
2. **Write the smallest amount of code that makes the test pass.**
3. **Run the tests again** to see everything pass.
4. **Save your work** with git: `git add -A`, then a commit.

At the end of each part, the review day runs all the checks, reads the tests
you wrote, and tags the milestone.

You type everything yourself — that's the point. Reading code is not the same
as writing it. The code blocks show exactly what to type, and the terminal
blocks show what you should see when you run it.

A few conventions worth knowing now:

- Terminal commands start with `$`. Type what follows the `$`.
- Long output is trimmed, and the trimmed part is marked with `...`.
- A block that quotes a file carries the file's name above it, like
  `src/main.rs`.
- Every day ends with a **Save your work** block. Run it before you close the
  terminal.

If a lesson ends with a **Going deeper** box, you can skip it. It's extra
background, not part of the build.

## Git from Day 1

Day 1 installs git, sets your name and email, creates the crate, and makes the
first commit. Every day after that ends with one commit:

```bash
$ git add -A
$ git commit -m "day 2: add the first test"
```

At the end of a part, tag the milestone:

```bash
$ git tag part-i
```

A commit is a save point. If an experiment goes wrong, you can go back to the
last one. The book teaches the three commands you need first —
`git status`, `git add`, `git commit` — and adds `git diff`, `git restore`,
and tags when they become useful. It never assumes you already know git.

## If you get stuck

- Compare your code with the lesson's blocks — a typo is the usual suspect.
- Lessons list the errors they can produce, with the fix, under
  "If something went wrong."
- Read the compiler's message slowly. Rust's errors name the file, the line,
  and the rule. The book has a **The compiler says** box in the hard lessons
  that translates the real message into plain words.
- As a last resort, the finished app appears in full in the appendix at the
  end of the course — but give it an honest try first. Struggling a little is
  how the learning happens.

## How the book was checked

The application lessons and the data-structures crate were run in a pinned
Podman container against the reference application. Code quotes are checked
against the app at the day's tag; terminal blocks are checked against captured
runs.

The production lessons are local Podman labs: PostgreSQL, Redis, and LocalStack
were run for real, while Kafka, gRPC, WebSocket, and Kubernetes depend on
optional tooling. The prose is machine-written, but the commands are not
invented — [the disclaimer](/100-days-of-rust/disclaimer/) explains what that
means.

Ready? [Day 1 — A crate, a save point](/100-days-of-rust/days/day-01/) is next.
