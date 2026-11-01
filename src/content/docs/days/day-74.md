---
title: "Day 74 — Live task updates"
description: "Add an authenticated /ws endpoint, broadcast owner-scoped task events, and let the browser refresh without polling. — Day 74 of 100 Days of Rust."
sidebar:
  order: 14
day: 74
---

**About 2 hours** · Production ground, day 14 of 30.

**You'll be able to:**

- authenticate the socket with the session cookie;
- broadcast only to the owner's connections;
- reconnect and refetch on the client.

---

The socket server works. This lesson adds it to the app, with the rule that
matters: a connection sees only its owner's tasks.

## The connection

```rust
async fn ws(
    State(state): State<AppState>,
    jar: CookieJar,
    upgrade: WebSocketUpgrade,
) -> Response {
    let Some(user_id) = current_user(&state, &jar).await else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    upgrade.on_upgrade(move |socket| handle(socket, state, user_id))
}
```

The session cookie authenticates the upgrade. The user id is captured in the
connection; it is never taken from a message.

## The hub

```rust
pub struct Hub {
    rooms: Mutex<HashMap<i64, Vec<mpsc::Sender<String>>>>,
}

impl Hub {
    pub fn subscribe(&self, owner: i64, tx: mpsc::Sender<String>) { ... }
    pub fn publish(&self, owner: i64, event: &Event) {
        let text = serde_json::to_string(event).unwrap();
        for tx in self.rooms.lock().unwrap().get(&owner).into_iter().flatten() {
            let _ = tx.try_send(text.clone());
        }
    }
}
```

`try_send` on a bounded channel drops the event for a slow client instead of
blocking the publisher. A live feed can drop intermediate updates; the client
refetches on reconnect.

A `HashMap<i64, Vec<Sender>>` is fine for one process. Several server instances
need a shared bus (Redis pub/sub or Kafka) and each instance publishes to its
local rooms.

## The handler

```rust
async fn handle(mut socket: WebSocket, hub: Arc<Hub>, owner: i64) {
    let (tx, mut rx) = mpsc::channel(32);
    hub.subscribe(owner, tx);
    let mut ping = tokio::time::interval(Duration::from_secs(30));

    loop {
        tokio::select! {
            _ = ping.tick() => {
                if socket.send(Message::Ping(Vec::new())).await.is_err() { break; }
            }
            event = rx.recv() => {
                match event {
                    Some(text) => {
                        if socket.send(Message::Text(text)).await.is_err() { break; }
                    }
                    None => break,
                }
            }
            message = socket.recv() => {
                if message.is_none() { break; }
            }
        }
    }
}
```

One writer task owns the socket's send side. The receive branch keeps the
connection alive and could accept commands later; the first version only reads
to detect close.

## Publishing

The outbox relay or the API handler calls `hub.publish(owner, event)` after a
successful task change. The event is the same JSON the Kafka consumer uses:

```json
{"type":"task.done","id":1}
```

The client does not need the whole task; it can update the row or refetch the
list. Sending the full task makes the update self-contained but duplicates the
REST representation.

## The browser

```js
const socket = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/ws`);
socket.onmessage = (message) => {
  const event = JSON.parse(message.data);
  if (event.type === 'task.done') refreshList();
};
socket.onclose = () => setTimeout(() => location.reload(), 1000);
```

The cookie is sent with the upgrade automatically. A reconnect is a reload;
the page fetches the authoritative list and resumes. The socket is an
optimization, not the source of truth.

## Tests

A `TestBackend`-style socket test is harder than an HTTP `oneshot`. The cheap
checks:

- the upgrade without a session is 401;
- the hub publishes only to the matching owner;
- a bounded channel drops instead of blocking.

An end-to-end test connects a real client to an ephemeral server, sends a task
through the API, and waits for the socket message with a timeout.

## In the app

The web page can listen for task events. The TUI could use the same socket for
live updates; its polling loop is simpler for now. The REST API remains the
read path.

The metrics gain a `websocket_connections` gauge. A connection count that only
grows is a leak or a client that never closes.

## If something went wrong

**The upgrade is 401.** The session cookie is missing or expired. The browser
sends cookies automatically only for the same origin; a cross-origin page needs
CORS and credentials.

**The client never receives events.** The owner id in the hub does not match,
or the publish path is not called after the write.

**The server's memory grows.** Connections are not removed from the hub when
they close. Remove the sender on disconnect.

**One slow client blocks others.** The channel is unbounded or the publish uses
`send().await`. Use `try_send` on a bounded channel.

**A second server instance loses events.** The hub is local. Use pub/sub across
instances.

**The proxy closes the connection.** Its idle timeout is shorter than the ping
interval. Align them.

## Going deeper: polling and sockets

Polling is simpler: a request every few seconds, no connection state, no
sticky sessions. A socket is better when updates are frequent and latency
matters.

A middle ground is long polling or server-sent events (SSE), which is one-way
over HTTP and easier to proxy. The app's updates are one-way; SSE would be
enough. WebSockets are the general bidirectional tool.

The next lesson deploys the app to Kubernetes and confronts the socket's
sticky-session problem.

<div class="day-tracker" data-day="74"></div>
