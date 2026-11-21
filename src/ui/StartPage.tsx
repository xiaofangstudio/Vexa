/** 欢迎页：留白优先，左新建、右最近与导入。参考 Strata 的呼吸节奏。 */
import { useEffect, useMemo, useState } from "react";
import { zh } from "../i18n/zh";
import { formatWhen, loadRecent, removeRecent, type RecentEntry } from "../stores/recent";
import { pickImage, pickVexOpen } from "../engine/io";
import type { VexaSettings } from "../stores/settings";
import "./StartPage.css";

interface Preset {
  id: string;
  label: string;
  note: string;
  w: number;
  h: number;
}

const PRESETS: Preset[] = [
  { id: "square", label: "方图", note: "1080 × 1080", w: 1080, h: 1080 },
  { id: "hd", label: "横屏", note: "1920 × 1080", w: 1920, h: 1080 },
  { id: "story", label: "竖屏", note: "1080 × 1920", w: 1080, h: 1920 },
  { id: "a4", label: "A4 竖版", note: "794 × 1123", w: 794, h: 1123 },
  { id: "a4l", label: "A4 横版", note: "1123 × 794", w: 1123, h: 794 },
  { id: "icon", label: "图标", note: "1024 × 1024", w: 1024, h: 1024 },
];

const FEATURES = ["钢笔与贝塞尔", "布尔运算", "位图描摹", "SVG · PNG · PDF", "全本地 · 零联网"];

interface Props {
  theme: "light" | "dark";
  settings: VexaSettings;
  onToggleTheme: () => void;
  onCreate: (name: string, w: number, h: number) => void;
  onOpenFile: (path: string) => void;
  onImportImage: (path: string, mode: "image" | "trace") => void;
  onSettings: () => void;
  onAbout: () => void;
}

function numOr(v: string, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default function StartPage(props: Props) {
  const [presetId, setPresetId] = useState("square");
  const [w, setW] = useState("1080");
  const [h, setH] = useState("1080");
  const [name, setName] = useState("");
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  const cw = numOr(w, 1080);
  const ch = numOr(h, 1080);

  const preview = useMemo(() => {
    const maxW = 240;
    const maxH = 110;
    const s = Math.min(maxW / cw, maxH / ch);
    return { w: Math.round(cw * s), h: Math.round(ch * s) };
  }, [cw, ch]);

  const applyPreset = (p: Preset) => {
    setPresetId(p.id);
    setW(String(p.w));
    setH(String(p.h));
  };

  const create = () => {
    props.onCreate(name.trim() || zh.start.untitled, cw, ch);
  };

  const openFile = async () => {
    setBusy("open");
    try {
      const path = await pickVexOpen();
      if (path) props.onOpenFile(path);
    } catch (err) {
      console.warn(err);
    } finally {
      setBusy(null);
    }
  };

  const importImage = async () => {
    setBusy("import");
    try {
      const path = await pickImage();
      if (path) setPendingImage(path);
    } catch (err) {
      console.warn(err);
    } finally {
      setBusy(null);
    }
  };

  const pickMode = (mode: "image" | "trace") => {
    const p = pendingImage;
    setPendingImage(null);
    if (p) props.onImportImage(p, mode);
  };

  return (
    <div className="start">
      <header className="start-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 40 40" width="27" height="27">
              <path d="M6 30 L20 8 L34 30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
              <path d="M12.5 24 L27.5 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
            </svg>
          </span>
          <span className="brand-name">Vexa</span>
          <span className="brand-tag">小方工作室</span>
        </div>
        <div className="spacer" />
        <button className="icon-btn" onClick={props.onToggleTheme} title={zh.btn.theme} aria-label={zh.btn.theme}>
          {props.theme === "light" ? (
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path d="M8 2.4a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2Z" fill="none" stroke="currentColor" strokeWidth="1.1" />
              <path d="M8 1v1.4M8 13.6V15M1 8h1.4M13.6 8H15M3.1 3.1l1 1M11.9 11.9l1 1M12.9 3.1l-1 1M4.1 11.9l-1 1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path d="M13.2 9.6a5.6 5.6 0 0 1-6.8-6.8 5.6 5.6 0 1 0 6.8 6.8Z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <button className="btn btn-ghost" onClick={props.onSettings} title="设置">
          设置
        </button>
        <button className="btn btn-ghost" onClick={props.onAbout}>
          关于
        </button>
      </header>

      <main className="start-main">
        <section className="start-hero">
          <div className="start-eyebrow">{zh.app.tagline}</div>
          <h1 className="start-title">{zh.app.slogan}</h1>
          <p className="start-sub">
            全中文、永久免费、零联网的矢量图软件。画 logo、图标、插画与排版，导出 SVG / PNG / PDF；
            所有文件都留在本机，不上传、不联网、不调用任何 AI。
          </p>
          <div className="start-features">
            {FEATURES.map((f) => (
              <span className="feature-pill" key={f}>
                {f}
              </span>
            ))}
          </div>
        </section>

        <div className="start-grid">
          <section className="card create-card">
            <div className="card-head">
              <h2 className="card-title">{zh.start.title}</h2>
              <span className="card-note">{zh.start.note}</span>
            </div>

            <div className="presets">
              {PRESETS.map((p) => (
                <button key={p.id} className={"chip" + (presetId === p.id ? " is-on" : "")} onClick={() => applyPreset(p)}>
                  <span className="chip-glyph" style={{ aspectRatio: `${p.w} / ${p.h}` }} />
                  <span className="chip-label">{p.label}</span>
                  <span className="chip-note num">{p.note}</span>
                </button>
              ))}
            </div>

            <div className="field-row create-fields">
              <div className="field">
                <label className="field-label">{zh.start.width}</label>
                <div className="field-row">
                  <input
                    className="field-input num"
                    value={w}
                    inputMode="numeric"
                    onChange={(e) => {
                      setW(e.target.value.replace(/[^\d]/g, ""));
                      setPresetId("custom");
                    }}
                  />
                  <span className="field-unit">px</span>
                </div>
              </div>
              <span className="field-x">×</span>
              <div className="field">
                <label className="field-label">{zh.start.height}</label>
                <div className="field-row">
                  <input
                    className="field-input num"
                    value={h}
                    inputMode="numeric"
                    onChange={(e) => {
                      setH(e.target.value.replace(/[^\d]/g, ""));
                      setPresetId("custom");
                    }}
                  />
                  <span className="field-unit">px</span>
                </div>
              </div>
              <div className="field create-name">
                <label className="field-label">{zh.start.name}</label>
                <input
                  className="field-input"
                  value={name}
                  placeholder={zh.start.untitled}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                  }}
                />
              </div>
            </div>

            <div className="canvas-preview">
              <div className="preview-stage">
                <div
                  className="preview-paper"
                  style={{ width: preview.w, height: preview.h, background: props.settings.defaultBg }}
                />
              </div>
              <div className="preview-meta">
                <span className="num">
                  {cw} × {ch} px
                </span>
                <span className="faint">RGB · 96 PPI</span>
              </div>
            </div>

            <div className="create-actions">
              <button className="btn btn-primary btn-lg" onClick={create}>
                {zh.start.create}
              </button>
              <span className="create-hint">Enter 直接创建</span>
            </div>
          </section>

          <aside className="start-side">
            <section className="card recent-card">
              <div className="card-head">
                <h2 className="card-title">{zh.start.recent}</h2>
                <button className="btn-link" onClick={openFile} disabled={busy === "open"}>
                  {zh.start.open}
                </button>
              </div>

              {recent.length === 0 ? (
                <div className="empty">
                  <div className="empty-mark" aria-hidden>
                    <svg viewBox="0 0 48 48" width="38" height="38">
                      <rect x="7" y="10" width="34" height="28" rx="4" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
                      <path d="M7 18h34" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
                      <path d="M15 34l8-9 6 6 4-4 5 7" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
                    </svg>
                  </div>
                  <div className="empty-title">{zh.start.recentEmpty}</div>
                  <div className="empty-hint">{zh.start.recentEmptyHint}</div>
                </div>
              ) : (
                <ul className="recent-list">
                  {recent.map((r) => (
                    <li key={r.path} className="recent-item">
                      <button className="recent-open" onClick={() => props.onOpenFile(r.path)} title={r.path}>
                        <span className="recent-thumb">
                          {r.thumb ? (
                            <img src={r.thumb} alt="" />
                          ) : (
                            <span className="recent-ph" style={{ aspectRatio: `${r.w || 1} / ${r.h || 1}` }} />
                          )}
                        </span>
                        <span className="recent-text">
                          <span className="recent-name">{r.name || zh.doc.untitled}</span>
                          <span className="recent-path">{r.path}</span>
                          <span className="recent-meta num">
                            {r.w} × {r.h} · {formatWhen(r.when)}
                          </span>
                        </span>
                      </button>
                      <button
                        className="icon-btn recent-remove"
                        title={zh.start.remove}
                        onClick={() => setRecent(removeRecent(r.path))}
                      >
                        <svg viewBox="0 0 16 16" width="14" height="14">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card import-card">
              <div className="card-head">
                <h2 className="card-title">{zh.start.import}</h2>
                <span className="card-note">{zh.start.importHint}</span>
              </div>
              <p className="import-hint">{zh.start.traceHint}</p>
              <div className="import-ways">
                <button className="btn btn-block" onClick={importImage} disabled={busy === "import"}>
                  <svg viewBox="0 0 16 16" width="15" height="15" style={{ marginRight: 6 }}>
                    <path d="M8 2v8M4.6 6.6 8 10l3.4-3.4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                    <path d="M2.5 12.5h11" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
                  </svg>
                  选择图片…
                </button>
                <button className="btn btn-block" onClick={openFile} disabled={busy === "open"}>
                  打开 .vex 工程
                </button>
              </div>
              <div className="import-tags">
                <span className="tag">作为位图置入</span>
                <span className="tag">描摹成矢量路径</span>
                <span className="tag">拖放也行</span>
              </div>
            </section>
          </aside>
        </div>
      </main>

      <footer className="start-foot">
        <span className="foot-label">Vexa 0.1.0 · 规格 v1.0</span>
        <span className="foot-sep" />
        <span className="foot-keys">
          <code>V</code> 选择 <code>P</code> 钢笔 <code>R</code> 矩形 <code>Ctrl+G</code> 编组
        </span>
        <div className="spacer" />
        <span className="foot-note">{zh.start.foot}</span>
      </footer>

      {pendingImage && (
        <div className="modal-mask" onClick={() => setPendingImage(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{zh.trace.title}</h3>
              <span className="faint">{pendingImage.split(/[\\/]/).pop()}</span>
            </div>
            <div className="modal-body">
              <p className="muted">{zh.trace.note}</p>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setPendingImage(null)}>
                {zh.btn.cancel}
              </button>
              <button className="btn" onClick={() => pickMode("image")}>
                {zh.trace.importAsImage}
              </button>
              <button className="btn btn-primary" onClick={() => pickMode("trace")}>
                {zh.trace.importAsTrace}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

