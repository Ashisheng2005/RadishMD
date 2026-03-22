use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_cli::CliExt;

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_cli::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            get_file_name,
            get_cli_file_path
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.set_title("RadishMD").ok();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
