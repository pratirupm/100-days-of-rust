---
title: "Day 72 — gRPC in the app"
description: "Put the Task service behind tonic, reuse the store and session logic, and test the generated client against a real server. — Day 72 of 100 Days of Rust."
sidebar:
  order: 12
day: 72
---

**About 2 hours** · Production ground, day 12 of 30.

**You'll be able to:**

- implement the generated service trait;
- share auth and owner scoping with the REST API;
- run a tonic server on an ephemeral port in a test.

---

The proto is the contract. This lesson implements it with the app's store and
auth, then tests the generated client.

## The service struct

```rust
#[derive(Clone)]
pub struct TasksService {
    store: Arc<dyn Store>,
    sessions: Arc<dyn SessionStore>,
}

#[tonic::async_trait]
impl tasks_server::Tasks for TasksService {
    async fn add_task(
        &self,
        request: Request<AddTaskRequest>,
    ) -> Result<Response<Task>, Status> {
        let user = self.current_user(request.metadata()).await?;
        let body = request.into_inner();
        let id = self.store.add_owned(&body.title, user.id).await
            .map_err(map_error)?;
        let task = self.store.find_owned(id, user.id).await
            .map_err(map_error)?
            .ok_or_else(|| Status::not_found("task"))?;
        Ok(Response::new(task.into()))
    }
}
```

`current_user` reads the `authorization` metadata, hashes the token, and looks
it up in the same session table as the REST API. The owner id goes into the
same `add_owned` call. The transport changes; the authorization rule does not.

## Error mapping

```rust
fn map_error(error: TodoError) -> Status {
    match error {
        TodoError::EmptyTitle => Status::invalid_argument("title"),
        TodoError::NotFound(_) => Status::not_found("task"),
        TodoError::Unauthorized => Status::unauthenticated("token"),
        TodoError::EmailTaken => Status::already_exists("email"),
        other => Status::internal(other.to_string()),
    }
}
```

Do not put the raw error string in `INTERNAL` for a public service; it can leak
paths or SQL. Log the detail and return a stable message.

## The server binary

```rust
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let store = open_store(&std::env::var("TODO_DB")?).await?;
    let addr = "127.0.0.1:50051".parse()?;
    let service = TasksService::new(store);
    Server::builder()
        .add_service(TasksServer::new(service))
        .serve(addr)
        .await?;
    Ok(())
}
```

The service binds loopback. A gateway or a service mesh exposes it; do not put
an unauthenticated gRPC port on the public internet.

## The test

```rust
#[tokio::test]
async fn grpc_round_trip() {
    let store = test_store().await;
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        Server::builder()
            .add_service(TasksServer::new(TasksService::new(store)))
            .serve_with_incoming(TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let mut client = TasksClient::connect(format!("http://{addr}")).await.unwrap();
    let task = client.add_task(AddTaskRequest { title: "buy milk".into() })
        .await.unwrap().into_inner();
    assert_eq!(task.title, "buy milk");
}
```

The test needs a token in metadata. Reuse the API test helper: create a user,
session, and token, then attach it to the request.

## Contract tests

A gRPC contract has three checks:

- the proto compiles and the generated trait is implemented;
- the status codes are stable for each error;
- an old client can still call a new server (field numbers and defaults).

A schema registry or a buf lint/breaking check makes the third automatic. For a
course, a test that calls every method with a valid and an invalid request is
enough.

## In the app

The REST and gRPC services share the store, the session lookup, and the owner
rules. They are two adapters over one core. A change to the owner rule must land
in both; a shared `Access` helper is the way to avoid drift.

The TUI can use either transport. The REST client is smaller; the gRPC client
is typed. Keep one until a second consumer needs the other.

## Save your work

<!-- transcripts: authored -->
```bash
$ git add -A
$ git commit -m "day 72: gRPC in the app"
```

## If something went wrong

**The service trait is not implemented.** The generated trait name or method
signature changed. Run `cargo build` and read the generated error.

**`Missing authorization`.** The metadata key is case-sensitive in some
clients; use `authorization` and the `Bearer ` prefix.

**`Unimplemented` on a method.** The server did not add the service, or the
method path has the wrong package.

**The test server is not ready.** The client connects before `serve` starts.
Bind first, then connect; retry once if needed.

**A field is missing on the client.** Proto3 defaults are zero values; a
missing string is `""`. Make the contract explicit or use `optional`.

**The server leaks an internal error.** `map_error` sends `to_string()` for
every unknown error. Log the detail and return a generic message.

## Going deeper: gRPC vs REST for the browser

Browsers do not speak raw gRPC. gRPC-Web or a gateway adapts it; both add a
proxy and a mapping. The app's browser UI uses REST for that reason.

Internal services can use gRPC without a browser in the path. The typed client
and HTTP/2 multiplexing are worth the extra tooling when the call volume and
the contract complexity justify it.

The next lesson adds WebSockets for live updates, the browser-friendly
alternative to server streaming.

<div class="day-tracker" data-day="72"></div>
