---
title: "Day 73 — WebSockets"
description: "Upgrade an HTTP connection to a WebSocket, send frames both ways, and handle ping, close, and backpressure. — Day 73 of 100 Days of Rust."
sidebar:
  hidden: true
day: 73
---

**About 2 hours** · Part Production ground, day 13 of 30.

**You'll be able to:**

- perform the HTTP upgrade;
- send and receive text frames;
- keep the connection alive with ping/pong.

---

A request/response API starts a new request for every update. A WebSocket keeps
one connection open and sends messages both ways. For live task updates, that is
the difference between polling and a feed.

Today we run a small WebSocket server and client, then wire it into the app.

## The upgrade

A WebSocket starts as an HTTP request with `Upgrade: websocket` and a key. The
server answers `101 Switching Protocols`, and the same TCP connection becomes a
frame stream.

Axum has a built-in extractor:

```rust
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};

async fn ws(upgrade: WebSocketUpgrade) -> impl IntoResponse {
    upgrade.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    while let Some(Ok(message)) = socket.recv().await {
        if let Message::Text(text) = message {
            let _ = socket.send(Message::Text(format!("echo: {text}"))).await;
        }
    }
}
```

The handler is per connection. It runs until the client closes, the server
closes, or a network error ends the stream.

## Frames

- **Text** — UTF-8 JSON, the app's choice.
- **Binary** — bytes, for a compact protocol.
- **Ping/Pong** — liveness; the peer answers a ping automatically in most
  libraries.
- **Close** — a close frame with a code and reason.

The app sends JSON text frames. A binary protocol is a later optimization; it
costs debuggability.

## The client

`websocat` is a quick CLI client:

<!-- transcripts: authored -->
```bash
$ websocat ws://127.0.0.1:8080/ws
{"type":"task.created","id":1,"title":"buy milk"}
```

A browser uses `new WebSocket('/ws')`; the cookie or a token in the first
message authenticates. Do not put a bearer token in the URL; URLs leak.

## Heartbeats

A proxy or a phone network can drop an idle connection without a close frame.
The server sends a ping on a timer and closes a connection that misses two
pongs:

```rust
let mut interval = tokio::time::interval(Duration::from_secs(30));
loop {
    tokio::select! {
        _ = interval.tick() => socket.send(Message::Ping(Vec::new())).await?,
        message = socket.recv() => { ... }
    }
}
```

The reverse proxy's idle timeout must be longer than the ping interval, or the
proxy closes the connection first.

## Backpressure

A slow client cannot be allowed to grow an unbounded queue. Use a bounded
channel per connection:

```rust
let (tx, mut rx) = tokio::sync::mpsc::channel(32);
tokio::spawn(async move {
    while let Some(event) = rx.recv().await {
        if socket.send(Message::Text(event)).await.is_err() {
            break;
        }
    }
});
```

When the channel is full, the producer slows down or drops the event. A live
feed can drop intermediate updates and send the latest state; a command stream
cannot.

## In the app

The server broadcasts task events from the outbox/relay to every connected
client for the same owner. The browser's page updates the list without a
refresh.

The REST API remains the source of truth; the socket carries notifications. A
client that reconnects fetches the list, then resumes listening. The socket is
not a database.

## If something went wrong

**The upgrade returns 400.** The client sent a bad key or the route is missing
the `WebSocketUpgrade` extractor.

**The connection closes after 30 seconds.** A proxy idle timeout is shorter
than the ping interval. Lower the interval or raise the proxy timeout.

**Messages arrive out of order.** WebSockets preserve order per connection;
the app is sending from several tasks without sequencing. Use one writer task.

**Memory grows with slow clients.** The per-connection queue is unbounded. Use
a bounded channel and a drop policy.

**The token is in the URL.** Move it to a cookie or the first message. URLs are
logged.

**The server cannot scale past one instance.** A socket is pinned to the
instance that accepted it. Broadcast through Redis pub/sub or a message bus when
there is more than one server.

## Going deeper: sockets and events

A WebSocket is a transport. The app's event model is the contract: a
`task.created` message means the same thing whether it arrives by socket,
Kafka, or a polling response.

Design the event first, then the transport. A socket that sends ad-hoc strings
is a second API with no schema.

The next lesson deploys the app to Kubernetes, where a Service can route
ordinary HTTP but a WebSocket needs sticky sessions or a shared broadcast.

<div class="day-tracker" data-day="73"></div>
