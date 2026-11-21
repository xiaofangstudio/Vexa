//! 描摹链路的真实跑通测试：生成一张纯色块 PNG，走一遍 VTracer，确认返回可用的 SVG 路径。
use std::path::PathBuf;

use vexa_lib::{trace_svg, TraceOptions};

fn opts(preset: &str) -> TraceOptions {
    TraceOptions {
        preset: preset.into(),
        colors: 6,
        detail: 6,
        smooth: 60,
        speckle: 4,
    }
}

fn make_test_png() -> PathBuf {
    let dir = std::env::temp_dir().join("vexa-test");
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("block.png");

    let w = 96u32;
    let h = 96u32;
    let mut buf = image::RgbaImage::from_pixel(w, h, image::Rgba([255, 255, 255, 255]));
    for y in 24..72 {
        for x in 24..72 {
            buf.put_pixel(x, y, image::Rgba([15, 118, 214, 255]));
        }
    }
    buf.save(&path).unwrap();
    path
}

#[test]
fn traces_png_into_paths() {
    let png = make_test_png();
    let svg = trace_svg(&png, &opts("illustration")).expect("描摹应成功");

    assert!(svg.contains("<svg"), "输出应是 SVG：{svg}");
    assert!(svg.contains("<path"), "输出应含路径：{}", &svg[..svg.len().min(240)]);
    assert!(svg.len() > 100, "输出不应为空");
}

#[test]
fn lineart_preset_works() {
    let png = make_test_png();
    let svg = trace_svg(&png, &opts("lineart")).expect("线稿模式应成功");
    assert!(svg.contains("<path"), "线稿模式应输出路径");
}

#[test]
fn missing_file_reports_error() {
    let bad = PathBuf::from("Z:\\vexa-nope\\nothing.png");
    let err = trace_svg(&bad, &opts("photo")).unwrap_err();
    assert!(err.contains("解码失败"), "错误信息应友好：{err}");
}
