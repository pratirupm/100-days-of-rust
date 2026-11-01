---
title: "src/bin — the finished app"
description: "The finished app, file by file: src/bin (spoilers)."
sidebar:
  hidden: true
tableOfContents: false
pagefind: false
---


Part of [The finished app (spoilers)](/100-days-of-rust/appendices/the-finished-app/).


## `src/bin/todo-server.rs`

````rust
use std::net::SocketAddr;

use todo::SqliteStore;
use todo::api;
use todo::web;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db = std::env::var("TODO_DB").unwrap_or_else(|_| "sqlite://todo.db".to_string());
    let store = SqliteStore::open(&db).await?;
    let app = api::router(store.clone()).merge(web::router(store));

    let addr: SocketAddr = std::env::var("TODO_API_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8080".to_string())
        .parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;

    println!("listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
````


## `src/bin/todo-tui.rs`

````rust
use std::io;
use std::time::Duration;

use ratatui::Terminal;
use ratatui::backend::CrosstermBackend;
use ratatui::crossterm::event::{self, Event};
use todo::tui::{App, TerminalGuard};
use todo::{ApiClient, SqliteStore};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("todo=warn"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .without_time()
        .init();

    let db = std::env::var("TODO_DB").unwrap_or_else(|_| "sqlite://todo.db".to_string());
    let store = SqliteStore::open(&db).await?;
    let tasks = match (std::env::var("TODO_API"), std::env::var("TODO_TOKEN")) {
        (Ok(base), Ok(token)) => ApiClient::new(base, token).list().await?,
        _ => store.list().await?,
    };
    tracing::debug!(tasks = tasks.len(), "tui loaded tasks");
    let app = App::new(tasks);

    let _guard = TerminalGuard::enter()?;
    let mut terminal = Terminal::new(CrosstermBackend::new(io::stdout()))?;
    let mut app = app;

    while !app.quit {
        terminal.draw(|frame| app.draw(frame))?;
        if event::poll(Duration::from_millis(250))? {
            if let Event::Key(key) = event::read()? {
                app.handle_key(key);
            }
        }
    }

    terminal.show_cursor()?;
    Ok(())
}
````
