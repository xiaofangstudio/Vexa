/** 画板预设库：保存当前尺寸、应用、删除、导入导出 JSON。 */
import { useEffect, useRef, useState } from "react";
import { MAX_CUSTOM_PRESETS } from "../core/boardPresets";
import type { BoardPreset } from "../core/artboards";
import { pickPresetSave, writeTextFile } from "../engine/io";
import { addPreset, deletePreset, exportPresetsText, importPresets, useCustomPresets } from "../stores/boardPresets";
import "./BoardPresetDialog.css";

interface Props {
  defaultW?: number;
  defaultH?: number;
  onApply: (preset: BoardPreset) => void;
  onClose: () => void;
  returnFocusSelector?: string;
}

type Notice = { kind: "ok" | "error"; text: string } | null;

export default function BoardPresetDialog(props: Props) {
  const list = useCustomPresets();
  const [name, setName] = useState("");
  const [w, setW] = useState(String(props.defaultW ?? 1080));
  const [h, setH] = useState(String(props.defaultH ?? 1080));
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  const selectorRef = useRef(props.returnFocusSelector);
  selectorRef.current = props.returnFocusSelector;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => nameRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      const fallback = selectorRef.current
        ? document.querySelector<HTMLElement>(selectorRef.current)
        : null;
      const target = previous && previous.isConnected && previous !== document.body ? previous : fallback;
      target?.focus();
    };
  }, []);

  const save = () => {
    const width = Math.round(Number(w));
    const height = Math.round(Number(h));
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      setNotice({ kind: "error", text: "宽高需为 1–20000 的整数" });
      return;
    }
    const result = addPreset({ label: name, width, height });
    if (result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    setNotice({ kind: "ok", text: `已保存「${result.preset?.label}」` });
    setName("");
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy("import");
    try {
      const text = await file.text();
      const result = importPresets(text);
      setNotice(result.error ? { kind: "error", text: result.error } : { kind: "ok", text: `已导入 ${result.added} 个预设` });
    } catch (err) {
      setNotice({ kind: "error", text: `导入失败：${String(err)}` });
    } finally {
      setBusy(null);
    }
  };

  const exportFile = async () => {
    if (!list.length) {
      setNotice({ kind: "error", text: "还没有自定义预设可导出" });
      return;
    }
    setBusy("export");
    try {
      const path = await pickPresetSave("Vexa-画板预设");
      if (!path) return;
      await writeTextFile(path, exportPresetsText());
      setNotice({ kind: "ok", text: `已导出 ${list.length} 个预设` });
    } catch (err) {
      setNotice({ kind: "error", text: `导出失败：${String(err)}` });
    } finally {
      setBusy(null);
    }
  };

  const remove = (preset: BoardPreset) => {
    deletePreset(preset.id);
    setNotice({ kind: "ok", text: `已删除「${preset.label}」` });
  };

  return (
    <div className="preset-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="preset-modal" role="dialog" aria-modal aria-labelledby="preset-title">
        <header className="preset-head">
          <div>
            <h3 id="preset-title">画板预设库</h3>
            <span className="preset-sub">自定义尺寸只保存在本机，不上传</span>
          </div>
          <button className="preset-x" onClick={props.onClose} aria-label="关闭" title="关闭">×</button>
        </header>

        <div className="preset-body">
          <section className="preset-sec">
            <div className="preset-sec-head">
              <span>自定义预设</span>
              <span className="faint num">{list.length} / {MAX_CUSTOM_PRESETS}</span>
            </div>
            {list.length === 0 ? (
              <div className="preset-empty">还没有自定义预设。下面填名称和尺寸保存，或从 JSON 导入。</div>
            ) : (
              <ul className="preset-list">
                {list.map((p) => (
                  <li key={p.id} className="preset-row">
                    <span className="preset-mini" style={{ aspectRatio: `${p.w} / ${p.h}` }} />
                    <span className="preset-row-text">
                      <span className="preset-row-name">{p.label}</span>
                      <span className="preset-row-size num">{p.note} px</span>
                    </span>
                    <button className="btn btn-sm" onClick={() => { props.onApply(p); props.onClose(); }}>应用</button>
                    <button className="btn-link preset-del" onClick={() => remove(p)} title={`删除 ${p.label}`}>删除</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="preset-sec">
            <div className="preset-sec-head"><span>保存新预设</span></div>
            <form
              className="preset-form"
              noValidate
              onSubmit={(e) => { e.preventDefault(); save(); }}
            >
              <label className="preset-field preset-name">
                <span>名称</span>
                <input
                  ref={nameRef}
                  className="field-input"
                  value={name}
                  placeholder="例如 名片"
                  maxLength={18}
                  onChange={(e) => { setName(e.target.value); setNotice(null); }}
                />
              </label>
              <label className="preset-field">
                <span>宽</span>
                <input
                  className="field-input num"
                  value={w}
                  inputMode="numeric"
                  onChange={(e) => { setW(e.target.value.replace(/[^\d]/g, "")); setNotice(null); }}
                />
              </label>
              <span className="preset-times">×</span>
              <label className="preset-field">
                <span>高</span>
                <input
                  className="field-input num"
                  value={h}
                  inputMode="numeric"
                  onChange={(e) => { setH(e.target.value.replace(/[^\d]/g, "")); setNotice(null); }}
                />
              </label>
              <span className="preset-unit">px</span>
              <button type="submit" className="btn btn-primary">保存</button>
            </form>
          </section>

          <div className="preset-foot-row">
            <div className="preset-file-actions">
              <input
                ref={importRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void importFile(file);
                }}
              />
              <button className="btn btn-sm" onClick={() => importRef.current?.click()} disabled={busy !== null}>
                {busy === "import" ? "导入中…" : "导入 JSON…"}
              </button>
              <button className="btn btn-sm" onClick={exportFile} disabled={busy !== null || !list.length}>
                {busy === "export" ? "导出中…" : "导出 JSON…"}
              </button>
            </div>
            <span className={`preset-notice${notice?.kind === "error" ? " is-error" : ""}`} role="status">
              {notice?.text ?? ""}
            </span>
          </div>
        </div>

        <footer className="preset-foot">
          <span className="faint">导入只补充新尺寸，重复尺寸自动跳过</span>
          <button className="btn" onClick={props.onClose}>关闭</button>
        </footer>
      </div>
    </div>
  );
}
