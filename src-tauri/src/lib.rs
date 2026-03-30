use std::fs;
use std::io::{Read, Write};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{atomic::{AtomicBool, Ordering}, Arc, LazyLock, Mutex};
use std::time::UNIX_EPOCH;
use serde::{Deserialize, Serialize};
use notify::{recommended_watcher, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_cli::CliExt;

const GITHUB_OWNER: &str = "Ashisheng2005";
const GITHUB_REPO: &str = "RadishMD";
const UPDATE_DOWNLOAD_PROGRESS_EVENT: &str = "radishmd://update-download-progress";

#[derive(Deserialize)]
struct GitHubReleaseAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    assets: Vec<GitHubReleaseAsset>,
}

#[derive(Serialize)]
struct UpdateAsset {
    name: String,
    download_url: String,
    size: u64,
    is_preferred: bool,
}

#[derive(Serialize)]
struct UpdateCheckResult {
    current_version: String,
    latest_version: String,
    release_name: Option<String>,
    release_notes: Option<String>,
    release_url: String,
    published_at: Option<String>,
    has_update: bool,
    assets: Vec<UpdateAsset>,
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    download_id: String,
    asset_name: String,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    progress: Option<f64>,
}

#[derive(Serialize)]
struct FileSnapshot {
    content: String,
    modified: Option<u64>,
}

static FILE_WATCHER: LazyLock<Mutex<Option<(String, RecommendedWatcher)>>> = LazyLock::new(|| {
    Mutex::new(None)
});

static PENDING_OPENED_FILES: LazyLock<Mutex<Vec<String>>> = LazyLock::new(|| {
    Mutex::new(Vec::new())
});

#[derive(Default)]
struct DownloadCancellationRegistry {
    tokens: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl DownloadCancellationRegistry {
    fn register(&self, download_id: &str) -> Result<Arc<AtomicBool>, String> {
        let token = Arc::new(AtomicBool::new(false));
        let mut tokens = self.tokens.lock().map_err(|_| "Failed to lock download registry".to_string())?;
        tokens.insert(download_id.to_string(), token.clone());
        Ok(token)
    }

    fn cancel(&self, download_id: &str) -> Result<bool, String> {
        let tokens = self.tokens.lock().map_err(|_| "Failed to lock download registry".to_string())?;

        if let Some(token) = tokens.get(download_id) {
            token.store(true, Ordering::SeqCst);
            return Ok(true);
        }

        Ok(false)
    }

    fn remove(&self, download_id: &str) {
        if let Ok(mut tokens) = self.tokens.lock() {
            tokens.remove(download_id);
        }
    }
}

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
fn take_opened_files() -> Vec<String> {
    match PENDING_OPENED_FILES.lock() {
        Ok(mut pending) => {
            let files = pending.drain(..).collect::<Vec<_>>();
            eprintln!("[RadishMD][tauri] take_opened_files count={}", files.len());
            files
        }
        Err(_) => Vec::new(),
    }
}

fn normalize_version(version: &str) -> String {
    version.trim().trim_start_matches(['v', 'V']).to_string()
}

fn asset_priority(asset_name: &str) -> i32 {
    let lower_name = asset_name.to_ascii_lowercase();

    #[cfg(target_os = "windows")]
    {
        if lower_name.ends_with(".msi") {
            return 100;
        }

        if lower_name.ends_with(".exe") {
            return 90;
        }

        if lower_name.ends_with(".zip") {
            return 80;
        }
    }

    #[cfg(target_os = "macos")]
    {
        if lower_name.ends_with(".dmg") {
            return 100;
        }

        if lower_name.ends_with(".pkg") {
            return 90;
        }

        if lower_name.ends_with(".zip") {
            return 80;
        }
    }

    #[cfg(target_os = "linux")]
    {
        if lower_name.ends_with(".deb") {
            return 100;
        }

        if lower_name.ends_with(".rpm") {
            return 95;
        }

        if lower_name.ends_with(".appimage") {
            return 90;
        }

        if lower_name.ends_with(".tar.gz") {
            return 80;
        }

        if lower_name.ends_with(".zip") {
            return 70;
        }
    }

    if lower_name.ends_with(".zip") {
        return 10;
    }

    0
}

fn build_github_client(app: &tauri::AppHandle) -> Result<reqwest::blocking::Client, String> {
    let user_agent = format!("RadishMD/{}", app.package_info().version);

    reqwest::blocking::Client::builder()
        .user_agent(user_agent)
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
fn check_latest_release(app: tauri::AppHandle) -> Result<UpdateCheckResult, String> {
    let client = build_github_client(&app)?;
    let release_url = format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        GITHUB_OWNER, GITHUB_REPO
    );

    let release = client
        .get(release_url)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json::<GitHubRelease>()
        .map_err(|e| e.to_string())?;

    let current_version = app.package_info().version.to_string();
    let current_normalized = normalize_version(&current_version);
    let latest_version = normalize_version(&release.tag_name);

    let has_update = match (
        semver::Version::parse(&current_normalized),
        semver::Version::parse(&latest_version),
    ) {
        (Ok(current), Ok(latest)) => latest > current,
        _ => current_normalized != latest_version,
    };

    let mut assets: Vec<UpdateAsset> = release
        .assets
        .into_iter()
        .map(|asset| UpdateAsset {
            is_preferred: asset_priority(&asset.name) > 0,
            name: asset.name,
            download_url: asset.browser_download_url,
            size: asset.size,
        })
        .collect();

    assets.sort_by(|left, right| {
        asset_priority(&right.name)
            .cmp(&asset_priority(&left.name))
            .then(left.name.cmp(&right.name))
    });

    Ok(UpdateCheckResult {
        current_version,
        latest_version,
        release_name: release.name,
        release_notes: release.body,
        release_url: release.html_url,
        published_at: release.published_at,
        has_update,
        assets,
    })
}

#[tauri::command]
async fn download_release_asset(
    app: tauri::AppHandle,
    download_id: String,
    asset_name: String,
    asset_url: String,
    save_path: String,
    cancellation_registry: tauri::State<'_, DownloadCancellationRegistry>,
) -> Result<(), String> {
    let cancellation_token = cancellation_registry.register(&download_id)?;
    let download_id_for_cleanup = download_id.clone();

    let download_result = tauri::async_runtime::spawn_blocking(move || {
        download_release_asset_blocking(
            &app,
            &download_id,
            &asset_name,
            &asset_url,
            &save_path,
            &cancellation_token,
        )
    })
    .await;

    cancellation_registry.remove(&download_id_for_cleanup);

    download_result.map_err(|e| e.to_string())?
}

fn download_release_asset_blocking(
    app: &tauri::AppHandle,
    download_id: &str,
    asset_name: &str,
    asset_url: &str,
    save_path: &str,
    cancellation_token: &Arc<AtomicBool>,
) -> Result<(), String> {
    let path = PathBuf::from(save_path);
    let result = (|| -> Result<(), String> {
        let client = build_github_client(app)?;
        let mut response = client
            .get(asset_url)
            .send()
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;

        let total_bytes = response.content_length();
        let mut downloaded_bytes = 0u64;

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let mut file = fs::File::create(&path).map_err(|e| e.to_string())?;
        let mut buffer = [0u8; 16 * 1024];

        loop {
            if cancellation_token.load(Ordering::SeqCst) {
                return Err("download cancelled".to_string());
            }

            let bytes_read = response.read(&mut buffer).map_err(|e| e.to_string())?;

            if bytes_read == 0 {
                break;
            }

            if cancellation_token.load(Ordering::SeqCst) {
                return Err("download cancelled".to_string());
            }

            file.write_all(&buffer[..bytes_read]).map_err(|e| e.to_string())?;
            downloaded_bytes += bytes_read as u64;

            let progress = total_bytes.map(|total| downloaded_bytes as f64 / total as f64);

            let _ = app.emit(
                UPDATE_DOWNLOAD_PROGRESS_EVENT,
                DownloadProgress {
                    download_id: download_id.to_string(),
                    asset_name: asset_name.to_string(),
                    downloaded_bytes,
                    total_bytes,
                    progress,
                },
            );
        }

        file.flush().map_err(|e| e.to_string())?;

        let _ = app.emit(
            UPDATE_DOWNLOAD_PROGRESS_EVENT,
            DownloadProgress {
                download_id: download_id.to_string(),
                asset_name: asset_name.to_string(),
                downloaded_bytes,
                total_bytes,
                progress: Some(1.0),
            },
        );

        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&path);
    }

    result
}

#[tauri::command]
fn cancel_download(download_id: String, cancellation_registry: tauri::State<'_, DownloadCancellationRegistry>) -> Result<(), String> {
    if cancellation_registry.cancel(&download_id)? {
        Ok(())
    } else {
        Err("download not found".to_string())
    }
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
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_cli::init())
        .manage(DownloadCancellationRegistry::default())
        .invoke_handler(tauri::generate_handler![
            read_file,
            read_file_snapshot,
            write_file,
            get_file_name,
            get_cli_file_path,
            take_opened_files,
            get_app_version,
            check_latest_release,
            download_release_asset,
            cancel_download,
            watch_file_changes,
            clear_file_watcher
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            window.set_title("RadishMD").ok();
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = _event {
            eprintln!("[RadishMD][tauri] RunEvent::Opened urls={:?}", urls);
            let file_paths = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|path| path.to_string_lossy().into_owned())
                .collect::<Vec<_>>();

            if file_paths.is_empty() {
                eprintln!("[RadishMD][tauri] RunEvent::Opened no file paths resolved");
                return;
            }

            eprintln!("[RadishMD][tauri] RunEvent::Opened file_paths={:?}", file_paths);
            if let Ok(mut pending) = PENDING_OPENED_FILES.lock() {
                pending.extend(file_paths.iter().cloned());
            }

            for file_path in file_paths {
                let _ = _app_handle.emit("radishmd://file-opened", file_path);
            }
        }
    });
}
