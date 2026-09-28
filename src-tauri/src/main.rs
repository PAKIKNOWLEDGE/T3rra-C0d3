#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

const DEFAULT_SANDBOX: &str = "sandbox";
const SERVE_READY_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TransportEvent {
    kind: String,
    line: Option<String>,
    code: Option<i32>,
    signal: Option<String>,
    message: Option<String>,
    reason: Option<String>,
}

impl TransportEvent {
    fn line(line: String) -> Self {
        Self {
            kind: "line".into(),
            line: Some(line),
            code: None,
            signal: None,
            message: None,
            reason: None,
        }
    }

    fn exit(status: ExitStatus) -> Self {
        Self {
            kind: "exit".into(),
            line: None,
            code: status.code(),
            signal: None,
            message: None,
            reason: None,
        }
    }

    fn error(message: String) -> Self {
        Self {
            kind: "error".into(),
            line: None,
            code: None,
            signal: None,
            message: Some(message),
            reason: None,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeResult {
    binary: Option<String>,
    cwd: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpResult {
    status: u16,
    text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpawnArgs {
    cwd: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectConfigArgs {
    method: String,
    cwd: String,
    config: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpArgs {
    method: String,
    path: String,
    body: Option<Value>,
}

struct ServeRuntime {
    child: Arc<Mutex<Child>>,
    port: u16,
}

struct Runtime {
    child: Option<Arc<Mutex<Child>>>,
    cwd: Option<PathBuf>,
    generation: u64,
    channel: Option<Channel<TransportEvent>>,
    serve: Option<ServeRuntime>,
}

#[derive(Clone)]
struct EngineState {
    runtime: Arc<Mutex<Runtime>>,
}

impl Default for EngineState {
    fn default() -> Self {
        Self {
            runtime: Arc::new(Mutex::new(Runtime {
                child: None,
                cwd: None,
                generation: 0,
                channel: None,
                serve: None,
            })),
        }
    }
}

fn emit(runtime: &Arc<Mutex<Runtime>>, generation: u64, event: TransportEvent) {
    let channel = {
        let guard = runtime.lock().expect("engine runtime lock poisoned");
        if guard.generation != generation {
            return;
        }
        guard.channel.clone()
    };
    if let Some(channel) = channel {
        if channel.send(event).is_err() {
            let mut guard = runtime.lock().expect("engine runtime lock poisoned");
            guard.channel = None;
        }
    }
}

fn normalized_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
}

fn candidate_binaries() -> Vec<String> {
    if let Some(path) = normalized_env("T3RRA_ENGINE_BIN") {
        return vec![path];
    }
    if let Some(path) = normalized_env("T3RRA_OMP_BIN") {
        return vec![path];
    }
    if normalized_env("T3RRA_ENGINE").as_deref() == Some("omp") {
        return vec!["omp".into()];
    }
    let mut candidates = if cfg!(windows) {
        vec!["opencode.cmd".into(), "opencode".into()]
    } else {
        vec!["opencode".into()]
    };
    if let Some(appdata) = normalized_env("APPDATA") {
        candidates.push(
            PathBuf::from(appdata)
                .join("npm/node_modules/opencode-ai/bin/opencode.exe")
                .to_string_lossy()
                .into(),
        );
    }
    if let Some(home) = normalized_env("HOME") {
        candidates.push(
            PathBuf::from(home)
                .join(".local/bin/opencode")
                .to_string_lossy()
                .into(),
        );
    }
    candidates
}

fn command_for(binary: &str) -> Command {
    if cfg!(windows) && (binary.ends_with(".cmd") || binary.ends_with(".bat")) {
        let mut command = Command::new("cmd.exe");
        command.arg("/D").arg("/C").arg(binary);
        command
    } else {
        Command::new(binary)
    }
}

fn version_supported(output: &str) -> bool {
    let mut numbers = output
        .split(|ch: char| !ch.is_ascii_digit() && ch != '.')
        .find_map(|part| {
            let mut values = part
                .split('.')
                .filter_map(|value| value.parse::<u32>().ok());
            let major = values.next()?;
            let minor = values.next()?;
            let patch = values.next()?;
            Some((major, minor, patch))
        });
    if numbers.is_none() {
        numbers = output.split_whitespace().find_map(|part| {
            let cleaned = part.trim_start_matches('v');
            let mut values = cleaned
                .split('.')
                .filter_map(|value| value.parse::<u32>().ok());
            Some((values.next()?, values.next()?, values.next()?))
        });
    }
    matches!(numbers, Some((major, minor, _patch)) if major > 1 || (major == 1 && minor >= 18))
}

fn resolve_binary() -> Result<String, String> {
    let explicit_omp = normalized_env("T3RRA_ENGINE").as_deref() == Some("omp")
        || normalized_env("T3RRA_ENGINE_BIN").is_none()
            && normalized_env("T3RRA_OMP_BIN").is_some();
    for candidate in candidate_binaries() {
        let output = command_for(&candidate).arg("--version").output();
        if let Ok(output) = output {
            if output.status.success()
                && (explicit_omp || version_supported(&String::from_utf8_lossy(&output.stdout)))
            {
                return Ok(candidate);
            }
        }
    }
    Err(if explicit_omp {
        "engine not found: set T3RRA_OMP_BIN or put omp on PATH"
    } else {
        "supported opencode not found: set T3RRA_ENGINE_BIN or put opencode on PATH"
    }
    .into())
}

fn default_cwd(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?
        .join(DEFAULT_SANDBOX);
    fs::create_dir_all(&dir).map_err(|error| format!("cannot create engine sandbox: {error}"))?;
    Ok(dir)
}

fn valid_cwd(path: &Path) -> Result<PathBuf, String> {
    let path = fs::canonicalize(path)
        .map_err(|error| format!("cwd is not an existing directory: {error}"))?;
    if !path.is_dir() {
        return Err(format!("cwd is not a directory: {}", path.display()));
    }
    Ok(path)
}

fn spawn_engine(runtime: Arc<Mutex<Runtime>>, binary: String, cwd: PathBuf) -> Result<(), String> {
    let mut child = command_for(&binary)
        .arg("acp")
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("cannot start opencode acp: {error}"))?;
    let stdin_available = child.stdin.is_some();
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "opencode stdout unavailable".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "opencode stderr unavailable".to_string())?;
    if !stdin_available {
        return Err("opencode stdin unavailable".into());
    }
    let process = Arc::new(Mutex::new(child));
    let generation = {
        let mut guard = runtime.lock().expect("engine runtime lock poisoned");
        guard.generation = guard.generation.wrapping_add(1);
        guard.child = Some(process.clone());
        guard.cwd = Some(cwd);
        guard.generation
    };
    let out_runtime = runtime.clone();
    thread::spawn(move || {
        read_lines(stdout, |line| {
            emit(&out_runtime, generation, TransportEvent::line(line))
        });
    });
    let err_runtime = runtime.clone();
    thread::spawn(move || {
        read_lines(stderr, |line| {
            emit(&err_runtime, generation, TransportEvent::error(line))
        });
    });
    let wait_runtime = runtime.clone();
    thread::spawn(move || {
        loop {
            let status = process
                .lock()
                .ok()
                .and_then(|mut child| child.try_wait().ok())
                .flatten();
            if let Some(status) = status {
                emit(&wait_runtime, generation, TransportEvent::exit(status));
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }
        if let Ok(mut guard) = wait_runtime.lock() {
            if guard.generation == generation {
                guard.child = None;
                guard.cwd = None;
            }
        }
    });
    Ok(())
}

fn read_lines<R: Read>(mut reader: R, mut on_line: impl FnMut(String)) {
    let mut bytes = [0_u8; 8192];
    let mut pending = String::new();
    loop {
        let read = match reader.read(&mut bytes) {
            Ok(0) | Err(_) => break,
            Ok(size) => size,
        };
        pending.push_str(&String::from_utf8_lossy(&bytes[..read]));
        while let Some(index) = pending.find('\n') {
            let mut line = pending[..index].to_string();
            pending.drain(..=index);
            if line.ends_with('\r') {
                line.pop();
            }
            if !line.is_empty() {
                on_line(line);
            }
        }
    }
    if !pending.trim_end_matches('\r').is_empty() {
        on_line(pending.trim_end_matches('\r').to_string());
    }
}

fn stop_child(child: &Arc<Mutex<Child>>) {
    if let Ok(mut child) = child.lock() {
        let _ = child.kill();
    }
}

fn free_port() -> Result<u16, String> {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|error| format!("cannot allocate local port: {error}"))
}

fn wait_for_port(port: u16) -> Result<(), String> {
    let started = Instant::now();
    while started.elapsed() < SERVE_READY_TIMEOUT {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err(format!(
        "opencode serve did not listen within {} seconds",
        SERVE_READY_TIMEOUT.as_secs()
    ))
}

fn ensure_serve(runtime: Arc<Mutex<Runtime>>, binary: String, cwd: PathBuf) -> Result<u16, String> {
    {
        let guard = runtime.lock().expect("engine runtime lock poisoned");
        if let Some(serve) = &guard.serve {
            if serve
                .child
                .lock()
                .ok()
                .and_then(|mut child| child.try_wait().ok())
                .flatten()
                .is_none()
            {
                return Ok(serve.port);
            }
        }
    }
    let port = free_port()?;
    let child = command_for(&binary)
        .args(["serve", "--port", &port.to_string()])
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("cannot start opencode serve: {error}"))?;
    let child = Arc::new(Mutex::new(child));
    if let Err(error) = wait_for_port(port) {
        stop_child(&child);
        return Err(error);
    }
    let mut guard = runtime.lock().expect("engine runtime lock poisoned");
    guard.serve = Some(ServeRuntime { child, port });
    Ok(port)
}

fn http_request(
    port: u16,
    method: &str,
    path: &str,
    body: Option<&Value>,
) -> Result<HttpResult, String> {
    if !path.starts_with('/') {
        return Err("HTTP path must start with /".into());
    }
    let bytes = body
        .map(serde_json::to_vec)
        .transpose()
        .map_err(|error| format!("encode HTTP body: {error}"))?
        .unwrap_or_default();
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .map_err(|error| format!("connect opencode serve: {error}"))?;
    stream.set_read_timeout(Some(Duration::from_secs(30))).ok();
    let request = format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\nContent-Length: {}\r\nContent-Type: application/json\r\n\r\n", bytes.len());
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("write HTTP request: {error}"))?;
    stream
        .write_all(&bytes)
        .map_err(|error| format!("write HTTP body: {error}"))?;
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|error| format!("read HTTP response: {error}"))?;
    let text = String::from_utf8_lossy(&response);
    let (headers, body_text) = text
        .split_once("\r\n\r\n")
        .ok_or_else(|| "invalid HTTP response from opencode serve".to_string())?;
    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| "missing HTTP status".to_string())?;
    Ok(HttpResult {
        status,
        text: body_text.to_string(),
    })
}

fn project_config(args: ProjectConfigArgs) -> Result<HttpResult, String> {
    let cwd = valid_cwd(Path::new(&args.cwd))?;
    let jsonc = cwd.join("opencode.jsonc");
    if jsonc.exists() {
        return Ok(HttpResult {
            status: 409,
            text:
                r#"{"ok":false,"error":"opencode.jsonc is present; edit that JSONC file manually"}"#
                    .into(),
        });
    }
    let json_file = cwd.join("opencode.json");
    let mut config = if json_file.exists() {
        let text = fs::read_to_string(&json_file)
            .map_err(|error| format!("read opencode.json: {error}"))?;
        serde_json::from_str::<Value>(&text)
            .map_err(|error| format!("opencode.json is not valid JSON: {error}"))?
    } else {
        Value::Object(Default::default())
    };
    if !config.is_object() {
        return Err("config root must be an object".into());
    }
    if args.method == "PATCH" {
        let next = args
            .config
            .ok_or_else(|| "config must be an object".to_string())?;
        if !next.is_object() {
            return Err("config must be an object".into());
        }
        let text = serde_json::to_string_pretty(&next)
            .map_err(|error| format!("encode opencode.json: {error}"))?;
        fs::write(&json_file, format!("{text}\n"))
            .map_err(|error| format!("write opencode.json: {error}"))?;
        config = next;
    } else if args.method != "GET" {
        return Err("method must be GET or PATCH".into());
    }
    let payload = serde_json::json!({ "ok": true, "config": config });
    Ok(HttpResult {
        status: 200,
        text: serde_json::to_string(&payload).expect("config payload serializes"),
    })
}

#[tauri::command]
fn engine_attach(
    channel: Channel<TransportEvent>,
    state: State<'_, EngineState>,
) -> Result<(), String> {
    let mut guard = state.runtime.lock().expect("engine runtime lock poisoned");
    guard.channel = Some(channel);
    Ok(())
}

#[tauri::command]
fn engine_probe(app: AppHandle, state: State<'_, EngineState>) -> Result<ProbeResult, String> {
    let binary = resolve_binary().ok();
    let cwd = state
        .runtime
        .lock()
        .expect("engine runtime lock poisoned")
        .cwd
        .clone()
        .or_else(|| default_cwd(&app).ok());
    Ok(ProbeResult {
        binary,
        cwd: cwd.map(|path| path.to_string_lossy().into_owned()),
    })
}

#[tauri::command]
fn engine_spawn(
    app: AppHandle,
    args: SpawnArgs,
    state: State<'_, EngineState>,
) -> Result<(), String> {
    let binary = resolve_binary()?;
    let cwd = match args.cwd {
        Some(cwd) => valid_cwd(Path::new(&cwd))?,
        None => default_cwd(&app)?,
    };
    {
        let guard = state.runtime.lock().expect("engine runtime lock poisoned");
        if let (Some(child), Some(existing_cwd)) = (&guard.child, &guard.cwd) {
            if existing_cwd == &cwd
                && child
                    .lock()
                    .ok()
                    .and_then(|mut child| child.try_wait().ok())
                    .flatten()
                    .is_none()
            {
                return Ok(());
            }
        }
        if let Some(child) = &guard.child {
            stop_child(child);
        }
    }
    spawn_engine(state.runtime.clone(), binary, cwd)
}

#[tauri::command]
fn engine_write(line: String, state: State<'_, EngineState>) -> Result<(), String> {
    if line.is_empty() {
        return Err("line must be a non-empty string".into());
    }
    let child = state
        .runtime
        .lock()
        .expect("engine runtime lock poisoned")
        .child
        .clone()
        .ok_or_else(|| "no engine running".to_string())?;
    let mut guard = child
        .lock()
        .map_err(|_| "engine process lock poisoned".to_string())?;
    let stdin = guard
        .stdin
        .as_mut()
        .ok_or_else(|| "engine stdin unavailable".to_string())?;
    stdin
        .write_all(line.as_bytes())
        .map_err(|error| format!("write engine stdin: {error}"))?;
    if !line.ends_with('\n') {
        stdin
            .write_all(b"\n")
            .map_err(|error| format!("write engine frame: {error}"))?;
    }
    stdin
        .flush()
        .map_err(|error| format!("flush engine stdin: {error}"))?;
    Ok(())
}

#[tauri::command]
fn engine_kill(state: State<'_, EngineState>) -> Result<(), String> {
    let mut guard = state.runtime.lock().expect("engine runtime lock poisoned");
    guard.generation = guard.generation.wrapping_add(1);
    if let Some(child) = guard.child.take() {
        stop_child(&child);
    }
    guard.cwd = None;
    if let Some(serve) = guard.serve.take() {
        stop_child(&serve.child);
    }
    Ok(())
}

#[tauri::command]
fn engine_choose_folder() -> Result<Option<String>, String> {
    Ok(FileDialog::new()
        .set_title("Choose project directory")
        .pick_folder()
        .map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn engine_project_config(args: ProjectConfigArgs) -> Result<HttpResult, String> {
    project_config(args)
}

#[tauri::command]
fn engine_http(
    app: AppHandle,
    args: HttpArgs,
    state: State<'_, EngineState>,
) -> Result<HttpResult, String> {
    let binary = resolve_binary()?;
    let cwd = state
        .runtime
        .lock()
        .expect("engine runtime lock poisoned")
        .cwd
        .clone()
        .or_else(|| default_cwd(&app).ok())
        .ok_or_else(|| "engine cwd unavailable".to_string())?;
    let port = ensure_serve(state.runtime.clone(), binary, cwd)?;
    http_request(
        port,
        &args.method.to_uppercase(),
        &args.path,
        args.body.as_ref(),
    )
}

fn main() {
    tauri::Builder::default()
        .manage(EngineState::default())
        .invoke_handler(tauri::generate_handler![
            engine_attach,
            engine_probe,
            engine_spawn,
            engine_write,
            engine_kill,
            engine_choose_folder,
            engine_project_config,
            engine_http,
        ])
        .run(tauri::generate_context!())
        .expect("error while running T3rra-C0d3-Rhodes");
}
