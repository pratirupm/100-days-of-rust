---
title: gRPC
day: 71
part: Production ground
partDay: 11
partDays: 30
time: "2.5 hours"
description: Define a typed task service in Protobuf, generate a tonic server and client, and compare the contract with REST.
bullets:
  - write a `.proto` contract;
  - generate Rust with `tonic-build`;
  - call a unary method and read the status codes.
---

REST is a resource model over HTTP/1.1 with JSON. gRPC is a typed method call
over HTTP/2 with Protobuf. Both are contracts; they make different trade-offs.

Today the app gets a gRPC task service beside the REST API.

## The contract

`proto/tasks.proto`:

```protobuf
syntax = "proto3";

package tasks.v1;

service Tasks {
  rpc ListTasks(ListTasksRequest) returns (ListTasksResponse);
  rpc AddTask(AddTaskRequest) returns (Task);
  rpc DoneTask(DoneTaskRequest) returns (Task);
}

message Task {
  uint32 id = 1;
  string uuid = 2;
  string title = 3;
  string status = 4;
  repeated string tags = 5;
}

message ListTasksRequest {}
message ListTasksResponse { repeated Task tasks = 1; }
message AddTaskRequest { string title = 1; }
message DoneTaskRequest { uint32 id = 1; }
```

Field numbers are the wire format. Never renumber a field; add a new number and
deprecate the old one. The package name is part of the method path.

## Generate

`build.rs`:

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::compile_protos("proto/tasks.proto")?;
    Ok(())
}
```

`Cargo.toml` needs `tonic`, `prost`, and `tonic-build` (build dependency). The
build script runs before the crate compiles; the generated modules live under
`OUT_DIR`.

## The server

```rust
#[derive(Default)]
pub struct TasksService {
    store: Arc<dyn Store>,
}

#[tonic::async_trait]
impl tasks_server::Tasks for TasksService {
    async fn list_tasks(
        &self,
        request: Request<ListTasksRequest>,
    ) -> Result<Response<ListTasksResponse>, Status> {
        let user = user_from_metadata(request.metadata())?;
        let tasks = self.store.list_owned(user).await
            .map_err(|_| Status::internal("store failed"))?;
        Ok(Response::new(ListTasksResponse { tasks: tasks.into_iter().map(Into::into).collect() }))
    }
}
```

The handler maps domain errors to gRPC status codes:

- `NOT_FOUND` — missing task;
- `UNAUTHENTICATED` — no token;
- `PERMISSION_DENIED` — wrong owner;
- `INVALID_ARGUMENT` — blank title;
- `INTERNAL` — the database failed.

The mapping is the same contract as the REST problem+json statuses, expressed in
a different transport.

## The client

```rust
let mut client = TasksClient::connect("http://127.0.0.1:50051").await?;
let tasks = client.list_tasks(ListTasksRequest {}).await?.into_inner();
```

The generated client is typed; a field rename is a compile error on both sides.
That is the selling point: the contract is checked at build time.

## Streaming

gRPC has server streaming, client streaming, and bidirectional streaming. A
task list can be a unary response today; a live feed is a server stream:

```protobuf
rpc WatchTasks(WatchRequest) returns (stream TaskEvent);
```

Streaming is useful for events and large result sets. It is not automatically
better than a WebSocket; both need backpressure and a reconnect story.

## In the app

The REST API stays the public browser/CLI boundary. gRPC is an internal
service-to-service boundary: the notification service, the search index, or a
mobile client that wants a typed contract.

Both adapters call the same `Store` trait and the same auth/session logic. The
transport is a layer, not a second domain.

## Run the lab

<!-- transcripts: authored -->
```bash
$ cargo run --bin todo-grpc
gRPC listening on 127.0.0.1:50051
$ grpcurl -plaintext 127.0.0.1:50051 tasks.v1.Tasks/ListTasks
```

`grpcurl` uses reflection; the server must enable it or the client needs the
proto files. Reflection is convenient in development; a production server can
disable it.

## If something went wrong

**`failed to connect`.** The server is not listening, or the client uses the
wrong port. gRPC uses HTTP/2; a plain HTTP/1.1 proxy may not pass it.

**`Unimplemented`.** The method name or package is wrong. The generated path is
`/tasks.v1.Tasks/ListTasks`.

**`Unauthenticated`.** The metadata key is wrong. Use
`authorization: Bearer <token>` and read it with `request.metadata()`.

**A field changed and old clients break.** A field number was reused or a type
changed. Add a field; do not renumber.

**The stream stalls.** The consumer is slower than the producer. Add
backpressure or a bounded queue.

**The generated code is missing.** `build.rs` did not run or the proto path is
wrong. Check the build output.

## Going deeper: REST and gRPC together

Use REST for public, cacheable, human-inspectable resources. Use gRPC for
internal, typed, high-throughput calls. A gateway can expose gRPC as REST
(grpc-gateway), but the mapping is another contract to maintain.

The app's REST API is the browser's path. A gRPC service is a natural fit for
the event consumers and a future mobile client.

The next lesson adds WebSockets: a persistent bidirectional channel for live
task updates.

