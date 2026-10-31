---
title: "Day 57 — Secrets"
description: "Wrap secrets in a type that redacts itself when printed, and keep the value out of logs, errors, and panic messages. — Day 57 of 100 Days of Rust."
sidebar:
  order: 57
day: 57
---

**About 1.5 hours** · Part X, day 2 of 5.

**You'll be able to:**

- store a secret in a newtype that hides it from `Debug` and `Display`;
- expose the value only where it is used;
- keep secrets in the environment or a mode-checked file.

---

A secret is not a string with a special name. It is a value that must not leak:
not in a log line, not in an error message, not in a `Debug` dump, not in a
panic.

Today we add `Secret`, a small newtype that makes leaking the value a deliberate
act instead of an accident.

## The type

Create `src/secret.rs`:

<!-- verify: src/secret.rs at=day-57 -->
```rust title="src/secret.rs"
use std::fmt;

/// A string that refuses to print its value.
#[derive(Clone, PartialEq, Eq)]
pub struct Secret(String);

impl Secret {
    /// Wrap a secret value.
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// Use the secret at the point where it is needed.
    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Secret([redacted])")
    }
}

impl fmt::Display for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[redacted]")
    }
}

impl From<String> for Secret {
    fn from(value: String) -> Self {
        Self(value)
    }
}
```

The inner field is private. There is no `Deref`, no `AsRef<str>`, and no
`Serialize`; the only way out is `expose`. `Debug` and `Display` are the two
formatters that logs and errors use, and both redact.

If you derive `Debug` on a struct that contains a `Secret`, the derived output
calls `Secret`'s `Debug`, so the secret stays redacted. That is the point of the
custom impl.

## The tests

<!-- verify: src/secret.rs at=day-57 -->
```rust title="src/secret.rs"
    #[test]
    fn debug_and_display_hide_the_value() {
        let secret = Secret::new("hunter2");
        assert_eq!(format!("{secret:?}"), "Secret([redacted])");
        assert_eq!(format!("{secret}"), "[redacted]");
        assert!(!format!("{secret:?}").contains("hunter2"));
    }

    #[test]
    fn expose_returns_the_value() {
        let secret = Secret::new("hunter2");
        assert_eq!(secret.expose(), "hunter2");
    }
```

The tests use a fake value. Never use a real secret in a test; the test output
is a log too.

## Where the value comes from

A secret should arrive from outside the binary:

- **Environment** for a container or systemd unit, read once at startup.
- **A file** with restrictive permissions, read at startup.
- **A secret manager** for a larger deployment, fetched with a short-lived
  credential.

The app already reads `TODO_DB` and `TODO_API_ADDR` from the environment. A
production secret follows the same path but is wrapped immediately:

```rust
let token = std::env::var("TODO_TOKEN")
    .map(Secret::new)
    .map_err(|_| TodoError::Unauthorized)?;
```

Do not put a secret in a command-line flag: process arguments are visible in
`ps` and shell history.

## File permissions

A file secret should be `0600` and owned by the service user. The startup code
checks the mode before reading it; a world-readable file is a finding, not a
convenience.

The deployment lesson writes the unit file with `EnvironmentFile=` pointing at
a `0600` file. The file is read by systemd, not by the app.

## Run the tests

```bash
$ cargo test
...
test secret::tests::debug_and_display_hide_the_value ... ok
test secret::tests::expose_returns_the_value ... ok
...
```

## Save your work

```bash
$ git add -A
$ git commit -m "day 57: add a self-redacting secret type"
[main (root-commit) ...] day 57: add a self-redacting secret type
 51 files changed, 7644 insertions(+)
...
$ git log --oneline
... day 57: add a self-redacting secret type
```

## If something went wrong

**The secret appears in a log.** The logger formats a `String`, not a `Secret`.
Wrap the value as soon as it is read, and log only the wrapper.

**`Debug` on a containing struct leaks it.** The struct derives `Debug` and a
field is a bare `String`. Change the field to `Secret`; the derived output will
redact.

**`serde` serializes the secret.** `Secret` has no `Serialize`. If a config
struct derives `Serialize`, it will not compile with a `Secret` field — which is
the desired outcome. Implement a redacted serialization only if a protocol
requires it.

**`expose()` is called everywhere.** That defeats the type. Keep the call at the
boundary where the secret is used: an HTTP header, a database connection, a
signing function.

**The secret is in a panic message.** A panic can print a value with `Debug` or
`Display`; `Secret` redacts both. A hand-written `unwrap()` message is still
your responsibility.

**The environment is visible to other processes.** On Linux, `/proc/<pid>/environ`
is readable by the same user (and root). A secret manager or a file with tighter
permissions is stronger.

## Going deeper: rotation

A secret has a lifetime. The app should read it at startup and support a restart
that picks up a new value; a long-running process needs a refresh path.

Rotation is a deploy:

1. create the new secret;
2. deploy it beside the old one;
3. restart or reload the app;
4. revoke the old one after the new one is confirmed.

The session table already rotates tokens on login. The same idea applies to
service credentials: overlap, switch, revoke.

The `secrecy` crate offers a similar type with zeroization on drop. `Secret`
does not zero memory; a full threat model decides whether that matters. The
type prevents the common accident — printing the value — which is the first
win.

<div class="day-tracker" data-day="57"></div>
