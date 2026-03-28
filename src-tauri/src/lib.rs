use std::fs;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};
use std::time::UNIX_EPOCH;
use serde::Serialize;
use notify::{recommended_watcher, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_cli::CliExt;

#[derive(Serialize)]
struct FileSnapshot {
    content: String,
    modified: Option<u64>,
}

static FILE_WATCHER: LazyLock<Mutex<Option<(String, RecommendedWatcher)>>> = LazyLock::new(|| {
    Mutex::new(None)
});

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file_snapshot(path: String) -> Result<FileSnapshot, String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let modified = fs::metadata(&path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64);

    Ok(FileSnapshot { content, modified })
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_file_name(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid file path".to_string())
}

#[tauri::command]
fn get_cli_file_path(app: tauri::AppHandle) -> Option<String> {
    let cli = app.cli();
    let matches = cli.matches().ok()?;
    matches.args.get("file").cloned()
        .and_then(|file_arg| file_arg.value.as_str().map(|s| s.to_string()))
}

#[tauri::command]
fn watch_file_changes(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let mut watcher_slot = FILE_WATCHER
        .lock()
        .map_err(|_| "Failed to lock file watcher".to_string())?;

    if watcher_slot
        .as_ref()
        .map(|(current_path, _)| current_path == &file_path)
        .unwrap_or(false)
    {
        return Ok(());
    }

    watcher_slot.take();

    let watched_path = file_path.clone();
    let app_handle = app.clone();
    let mut watcher = recommended_watcher(move |result: notify::Result<Event>| {
        if result.is_ok() {
            let _ = app_handle.emit("radishmd://file-changed", watched_path.clone());
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(PathBuf::from(&file_path).as_path(), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    *watcher_slot = Some((file_path, watcher));
    Ok(())
}

#[tauri::command]
fn clear_file_watcher() -> Result<(), String> {
    let mut watcher_slot = FILE_WATCHER
        .lock()
        .map_err(|_| "Failed to lock file watcher".to_string())?;
    watcher_slot.take();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_cli::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            read_file_snapshot,
            write_file,
            get_file_name,
            get_cli_file_path,
            watch_file_changes,
            clear_file_watcher
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.set_title("RadishMD").ok();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
