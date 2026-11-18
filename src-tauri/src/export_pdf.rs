use std::sync::{mpsc, Mutex};
use std::time::Duration;

use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const EXPORT_LABEL: &str = "export";
const EXPORT_TIMEOUT: Duration = Duration::from_secs(45);

struct ExportSession {
    html: String,
    article: Option<String>,
    ready: Option<mpsc::Sender<Result<(), String>>>,
}

static BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static SESSION: Mutex<Option<ExportSession>> = Mutex::new(None);

fn session_lock() -> std::sync::MutexGuard<'static, Option<ExportSession>> {
    SESSION.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn close_export_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(EXPORT_LABEL) {
        let _ = window.close();
    }
}

#[tauri::command]
pub fn take_export_html() -> String {
    session_lock()
        .as_ref()
        .map(|session| session.html.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn finish_export_render(article: String) {
    let mut session = session_lock();
    if let Some(current) = session.as_mut() {
        current.article = Some(article);
        if let Some(ready) = current.ready.take() {
            let _ = ready.send(Ok(()));
        }
    }
}

#[tauri::command]
pub fn fail_export_render(message: String) {
    let mut session = session_lock();
    if let Some(current) = session.as_mut() {
        if let Some(ready) = current.ready.take() {
            let _ = ready.send(Err(message));
        }
    }
}

#[tauri::command]
pub fn close_export_preview(app: AppHandle) {
    if let Some(session) = session_lock().take() {
        if let Some(ready) = session.ready {
            let _ = ready.send(Err("导出已取消".to_string()));
        }
    }
    close_export_window(&app);
    BUSY.store(false, std::sync::atomic::Ordering::SeqCst);
}

fn open_export_window(app: &AppHandle) -> Result<(), String> {
    close_export_window(app);
    // Start visible so the WebView actually loads, then hide on first load so it cannot cover the editor.
    WebviewWindowBuilder::new(app, EXPORT_LABEL, WebviewUrl::App("index.html".into()))
        .title("export")
        .inner_size(794.0, 1123.0)
        .position(-4000.0, -4000.0)
        .visible(true)
        .focused(false)
        .decorations(false)
        .skip_taskbar(true)
        .resizable(false)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = window.hide();
            }
        })
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn prepare_export_preview(app: AppHandle, html: String) -> Result<String, String> {
    if BUSY.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return Err("正在导出，请稍候".to_string());
    }

    let (tx, rx) = mpsc::channel();
    {
        let mut session = session_lock();
        *session = Some(ExportSession {
            html,
            article: None,
            ready: Some(tx),
        });
    }

    let app_for_window = app.clone();
    let (window_tx, window_rx) = mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = window_tx.send(open_export_window(&app_for_window));
    })
    .map_err(|error| {
        close_export_preview(app.clone());
        error.to_string()
    })?;
    match window_rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            close_export_preview(app);
            return Err(error);
        }
        Err(_) => {
            close_export_preview(app);
            return Err("无法创建导出窗口".to_string());
        }
    }

    match rx.recv_timeout(EXPORT_TIMEOUT) {
        Ok(Ok(())) => {
            let article = session_lock()
                .as_ref()
                .and_then(|session| session.article.clone());
            match article {
                Some(article) => Ok(article),
                None => {
                    close_export_preview(app);
                    Err("导出页面没有返回内容".to_string())
                }
            }
        }
        Ok(Err(error)) => {
            close_export_preview(app);
            Err(error)
        }
        Err(_) => {
            close_export_preview(app);
            Err("导出超时".to_string())
        }
    }
}

#[tauri::command]
pub async fn export_pdf(app: AppHandle, path: String) -> Result<(), String> {
    let window = app
        .get_webview_window(EXPORT_LABEL)
        .ok_or_else(|| "导出窗口不存在".to_string())?;
    let result = print_webview(&window, path).await;
    close_export_preview(app);
    result
}

async fn print_webview(window: &tauri::WebviewWindow, path: String) -> Result<(), String> {
    let (tx, rx) = mpsc::channel();
    window
        .with_webview(move |webview| start_print(webview, path, tx))
        .map_err(|error| error.to_string())?;
    rx.recv_timeout(EXPORT_TIMEOUT)
        .map_err(|_| "PDF 写入超时".to_string())?
}

#[cfg(windows)]
fn start_print(
    webview: tauri::webview::PlatformWebview,
    path: String,
    tx: mpsc::Sender<Result<(), String>>,
) {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    let started: windows::core::Result<()> = (|| unsafe {
        let core = webview.controller().CoreWebView2()?;
        let webview7 = core.cast::<ICoreWebView2_7>()?;
        let environment = webview7.Environment()?.cast::<ICoreWebView2Environment6>()?;
        let settings = environment.CreatePrintSettings()?;
        let _ = settings.SetShouldPrintHeaderAndFooter(false);
        let _ = settings.SetShouldPrintBackgrounds(true);
        let _ = settings.SetPageWidth(8.27);
        let _ = settings.SetPageHeight(11.69);
        let _ = settings.SetMarginTop(0.0);
        let _ = settings.SetMarginBottom(0.0);
        let _ = settings.SetMarginLeft(0.0);
        let _ = settings.SetMarginRight(0.0);
        let file_path = HSTRING::from(path);
        let callback_tx = tx.clone();
        webview7.PrintToPdf(
            &file_path,
            &settings,
            &PrintToPdfCompletedHandler::create(Box::new(move |error, success| {
                let ok = error.is_ok() && success;
                let _ = callback_tx.send(if ok {
                    Ok(())
                } else {
                    Err(format!("PDF 写入失败: {error:?}"))
                });
                Ok(())
            })),
        )?;
        Ok(())
    })();
    if let Err(error) = started {
        let _ = tx.send(Err(error.to_string()));
    }
}

#[cfg(target_os = "macos")]
fn start_print(
    webview: tauri::webview::PlatformWebview,
    path: String,
    tx: mpsc::Sender<Result<(), String>>,
) {
    use block2::RcBlock;
    use objc2::MainThreadMarker;
    use objc2_foundation::NSData;
    use objc2_web_kit::{WKPDFConfiguration, WKWebView};

    let started = (|| {
        let mtm = MainThreadMarker::new().ok_or("PDF 生成不在主线程")?;
        unsafe {
            let view: &WKWebView = &*webview.inner().cast();
            let config = WKPDFConfiguration::new(mtm);
            let block = RcBlock::new(move |data: *mut NSData, error: *mut objc2_foundation::NSError| {
                if !error.is_null() {
                    let _ = tx.send(Err("PDF 生成失败".to_string()));
                    return;
                }
                if data.is_null() {
                    let _ = tx.send(Err("PDF 为空".to_string()));
                    return;
                }
                let data = &*data;
                let bytes = std::slice::from_raw_parts(data.bytes() as *const u8, data.length());
                let _ = tx.send(std::fs::write(&path, bytes).map_err(|error| error.to_string()));
            });
            view.createPDFWithConfiguration_completionHandler(Some(&config), &block);
        }
        Ok(())
    })();
    if let Err(error) = started {
        let _ = tx.send(Err(error));
    }
}

#[cfg(target_os = "linux")]
fn start_print(
    webview: tauri::webview::PlatformWebview,
    path: String,
    tx: mpsc::Sender<Result<(), String>>,
) {
    use gtk::prelude::*;
    use webkit2gtk::PrintOperationExt;

    let Some(printer) = file_printer_name() else {
        let _ = tx.send(Err("当前系统没有可用的 PDF 打印机".to_string()));
        return;
    };

    let web_view = webview.inner();
    let operation = webkit2gtk::PrintOperation::new(&web_view);
    let settings = gtk::PrintSettings::new();
    settings.set_printer(&printer);
    settings.set("output-uri", Some(&file_uri(&path)));
    for key in [
        "print-header-left",
        "print-header-center",
        "print-header-right",
        "print-footer-left",
        "print-footer-center",
        "print-footer-right",
    ] {
        settings.set(key, Some(""));
    }
    operation.set_print_settings(&settings);

    let paper = gtk::PaperSize::new(Some("iso_a4"));
    let setup = gtk::PageSetup::new();
    setup.set_paper_size(&paper);
    operation.set_page_setup(&setup);

    let failed_tx = tx.clone();
    operation.connect_failed(move |_, error| {
        let _ = failed_tx.send(Err(error.to_string()));
    });
    operation.connect_finished(move |_| {
        let _ = tx.send(Ok(()));
    });
    // The operation must outlive this closure or GTK drops the job.
    keep_print_operation(operation.clone());
    operation.print();
}

#[cfg(target_os = "linux")]
fn file_printer_name() -> Option<String> {
    let found = std::cell::RefCell::new(None);
    gtk::enumerate_printers(
        |printer| {
            if !printer.accepts_pdf() || !printer.is_virtual() {
                return false;
            }
            let name = printer.name().map(|value| value.to_string()).unwrap_or_default();
            let lower = name.to_lowercase();
            let preferred = lower.contains("file") || lower.contains("pdf") || lower.contains("文件");
            let replace = found.borrow().is_none() || preferred;
            if replace {
                *found.borrow_mut() = Some(name);
            }
            false
        },
        true,
    );
    found.into_inner()
}

#[cfg(target_os = "linux")]
fn file_uri(path: &str) -> String {
    let mut uri = String::from("file://");
    if !path.starts_with('/') {
        uri.push('/');
    }
    for byte in path.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b'-' | b'_' | b'.' | b'~' => {
                uri.push(byte as char)
            }
            _ => uri.push_str(&format!("%{byte:02X}")),
        }
    }
    uri
}

#[cfg(target_os = "linux")]
fn keep_print_operation(operation: webkit2gtk::PrintOperation) {
    static PRINT_OPERATION: Mutex<Option<webkit2gtk::PrintOperation>> = Mutex::new(None);
    *PRINT_OPERATION.lock().unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(operation);
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
fn start_print(
    _webview: tauri::webview::PlatformWebview,
    _path: String,
    tx: mpsc::Sender<Result<(), String>>,
) {
    let _ = tx.send(Err("当前系统不支持导出 PDF".to_string()));
}
