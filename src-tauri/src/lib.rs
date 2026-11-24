//! Vexa 后端：只做三件事 —— 本机文件读写、.vex 落盘、位图转矢量（VTracer）。
//! 零联网、零遥测、零 AI；不发起任何外部请求。

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

#[derive(Deserialize, Debug, Clone)]
pub struct TraceOptions {
    /// photo / illustration / lineart / pixel
    pub preset: String,
    /// 色彩层数（2..8）
    pub colors: u8,
    /// 细节保留（0..10）
    pub detail: u8,
    /// 曲线平滑（10..100）
    pub smooth: u8,
    /// 忽略碎块（0..30）
    pub speckle: u8,
}

fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        if !dir.as_os_str().is_empty() && !dir.exists() {
            fs::create_dir_all(dir).map_err(|e| format!("建目录失败：{e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(PathBuf::from(&path)).map_err(|e| format!("读取失败：{e}"))
}

#[tauri::command]
fn write_text_file(path: String, text: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    ensure_parent(&p)?;
    fs::write(&p, text.as_bytes()).map_err(|e| format!("写入失败：{e}"))
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<String, String> {
    let bytes = fs::read(PathBuf::from(&path)).map_err(|e| format!("读取失败：{e}"))?;
    Ok(B64.encode(bytes))
}

#[tauri::command]
fn write_binary_file(path: String, base64: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    ensure_parent(&p)?;
    let bytes = B64
        .decode(base64.as_bytes())
        .map_err(|e| format!("数据解码失败：{e}"))?;
    fs::write(&p, bytes).map_err(|e| format!("写入失败：{e}"))
}

/// 位图 → SVG 字符串。全程本地计算，像素不出机器。
#[tauri::command]
fn trace_image(path: String, opts: TraceOptions) -> Result<String, String> {
    trace_svg(&PathBuf::from(&path), &opts)
}

/// 描摹内核（与 Tauri 解耦，便于单测）
pub fn trace_svg(path: &Path, opts: &TraceOptions) -> Result<String, String> {
    let img = image::open(path).map_err(|e| format!("图片解码失败：{e}"))?;
    let mut rgba = img.to_rgba8();

    // 超大图先降采样，描摹质量不受影响，速度更稳
    let (w0, h0) = rgba.dimensions();
    let max_side = 2400.0_f64;
    let scale = (max_side / w0.max(1) as f64)
        .min(max_side / h0.max(1) as f64)
        .min(1.0);
    if scale < 1.0 {
        let nw = ((w0 as f64) * scale).round().max(1.0) as u32;
        let nh = ((h0 as f64) * scale).round().max(1.0) as u32;
        rgba = image::imageops::resize(&rgba, nw, nh, image::imageops::FilterType::Lanczos3);
    }
    let (w, h) = rgba.dimensions();
    if w == 0 || h == 0 {
        return Err("图片尺寸为 0".into());
    }

    let color_image = vtracer::ColorImage {
        pixels: rgba.into_raw(),
        width: w as usize,
        height: h as usize,
    };

    let mut config = vtracer::Config::default();
    let lineart = opts.preset == "lineart";
    config.color_mode = if lineart {
        vtracer::ColorMode::Binary
    } else {
        vtracer::ColorMode::Color
    };
    config.hierarchical = vtracer::Hierarchical::Stacked;
    config.mode = if opts.preset == "pixel" {
        visioncortex::PathSimplifyMode::Polygon
    } else {
        visioncortex::PathSimplifyMode::Spline
    };
    config.filter_speckle = opts.speckle as usize;
    config.color_precision = opts.colors.clamp(2, 8) as i32;
    config.layer_difference = 24 - opts.detail.min(10) as i32 * 2;
    config.corner_threshold = opts.smooth.clamp(10, 100) as i32;
    config.length_threshold = ((10 - opts.detail.min(10)) as f64 * 0.9).max(0.5);
    config.max_iterations = 10;
    config.splice_threshold = 45;
    config.path_precision = Some(4);

    vtracer::convert(color_image, config)
        .map(|svg| svg.to_string())
        .map_err(|e| format!("描摹失败：{e}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchIntent {
    kind: &'static str,
    path: Option<String>,
    args: Vec<String>,
}

fn openable_ext(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref(),
        Some("svg" | "vex")
    )
}

fn openable_path(path: &Path) -> bool {
    path.is_file() && openable_ext(path)
}

/// 与 Strata 的启动判定同口径：跳过开关参数，取第一个真实存在的 .svg / .vex。
fn pick_launch_path(args: &[String]) -> Option<String> {
    for raw in args {
        if raw.starts_with('-') {
            continue;
        }
        let path = raw.trim().trim_matches('"');
        if path.is_empty() {
            continue;
        }
        let candidate = Path::new(path);
        if openable_path(candidate) {
            return Some(path.to_string());
        }
    }
    None
}

#[tauri::command]
fn launch_intent() -> LaunchIntent {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match pick_launch_path(&args) {
        Some(path) => LaunchIntent {
            kind: "file",
            path: Some(path),
            args,
        },
        None => LaunchIntent {
            kind: "home",
            path: None,
            args,
        },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(path) = pick_launch_path(&argv) {
                let _ = app.emit("vexa://launch-open", path);
            }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 小屏 / 高缩放机器上，默认尺寸可能超出工作区：按显示器大小收一下并居中。
            if let Some(w) = app.get_webview_window("main") {
                if let Ok(Some(mon)) = w.current_monitor() {
                    let m = mon.size();
                    let s = mon.scale_factor();
                    let max_w = m.width as f64 / s * 0.92;
                    let max_h = m.height as f64 / s * 0.88;
                    if let Ok(cur) = w.inner_size() {
                        let cw = cur.width as f64 / s;
                        let ch = cur.height as f64 / s;
                        if cw > max_w || ch > max_h {
                            let _ =
                                w.set_size(tauri::LogicalSize::new(cw.min(max_w), ch.min(max_h)));
                        }
                    }
                    let _ = w.center();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            launch_intent,
            read_text_file,
            write_text_file,
            read_binary_file,
            write_binary_file,
            trace_image
        ])
        .run(tauri::generate_context!())
        .expect("Vexa 启动失败");
}
