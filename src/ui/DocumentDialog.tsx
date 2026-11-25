/** 文档设置弹窗：文档名、当前画板名/尺寸/背景，以及只读文档信息。 */
import { useEffect, useRef, useState } from "react";
import { docSettingsStats, readDocSettings, validateDocSettings, type DocSettings } from "../core/documentSettings";
import type { VexaDoc } from "../core/types";
import "./DocumentDialog.css";

interface Props {
  doc: VexaDoc;
  boardIndex: number;
  onApply: (patch: DocSettings) => void;
  onClose: () => void;
}

export default function DocumentDialog({ doc, boardIndex, onApply, onClose }: Props) {
  const initial = readDocSettings(doc, boardIndex);
  const stats = docSettingsStats(doc);
  const restoreRef = useRef<HTMLElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [boardName, setBoardName] = useState(initial?.boardName ?? "");
  const [width, setWidth] = useState(String(initial?.width ?? 1));
  const [height, setHeight] = useState(String(initial?.height ?? 1));
  const [background, setBackground] = useState(initial?.background ?? "#ffffff");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();
    nameRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const restore = restoreRef.current;
      const target = restore && restore !== document.body && restore !== document.documentElement && document.contains(restore)
        ? restore
        : document.querySelector<HTMLElement>(".menubtn");
      target?.focus();
    };
  }, [onClose]);

  const submit = () => {
    if (!initial) {
      setError("画板不存在");
      return;
    }
    const patch: DocSettings = {
      name,
      boardName,
      width: Number(width),
      height: Number(height),
      background,
    };
    const issue = validateDocSettings(patch);
    if (issue) {
      setError(issue);
      return;
    }
    onApply(patch);
  };

  return (
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form
        className="modal doc-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-settings-title"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="modal-head">
          <h3 id="doc-settings-title">文档设置</h3>
          <span className="doc-head-note">改动应用后写入撤销栈</span>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label" htmlFor="doc-name">文档名称</label>
            <input
              id="doc-name"
              ref={nameRef}
              className="field-input"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="未命名"
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="doc-board-name">当前画板名称</label>
            <input
              id="doc-board-name"
              className="field-input"
              value={boardName}
              onChange={(e) => { setBoardName(e.target.value); setError(null); }}
              placeholder={`画板 ${boardIndex + 1}`}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <span className="field-label">画板尺寸</span>
            <div className="doc-size-row">
              <div className="doc-size-field">
                <label htmlFor="doc-width">宽</label>
                <div className="doc-size-input">
                  <input
                    id="doc-width"
                    className="field-input num"
                    type="number"
                    min={1}
                    max={20000}
                    step={1}
                    value={width}
                    onChange={(e) => { setWidth(e.target.value); setError(null); }}
                  />
                  <span className="field-unit">px</span>
                </div>
              </div>
              <div className="doc-size-field">
                <label htmlFor="doc-height">高</label>
                <div className="doc-size-input">
                  <input
                    id="doc-height"
                    className="field-input num"
                    type="number"
                    min={1}
                    max={20000}
                    step={1}
                    value={height}
                    onChange={(e) => { setHeight(e.target.value); setError(null); }}
                  />
                  <span className="field-unit">px</span>
                </div>
              </div>
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="doc-bg-hex">画板背景</label>
            <div className="doc-color-row">
              <input
                className="doc-color"
                type="color"
                value={background}
                aria-label="选择画板背景色"
                onChange={(e) => { setBackground(e.target.value); setError(null); }}
              />
              <input
                id="doc-bg-hex"
                className="field-input num"
                value={background}
                aria-label="画板背景色十六进制"
                onChange={(e) => { setBackground(e.target.value); setError(null); }}
              />
            </div>
          </div>

          <div className="doc-meta" aria-label="文档信息">
            <div className="doc-meta-item"><span>单位</span><b>px</b></div>
            <div className="doc-meta-item"><span>颜色模式</span><b>RGB / 8 位</b></div>
            <div className="doc-meta-item"><span>画板</span><b className="num">{boardIndex + 1} / {stats.artboards}</b></div>
            <div className="doc-meta-item"><span>对象</span><b className="num">{stats.nodes} / {stats.roots} 根层</b></div>
          </div>

          {error && <div className="doc-error" role="alert">{error}</div>}
          <p className="doc-note">调整画板尺寸只改画板边界，不移动现有对象；超出部分仍保留在画布上。</p>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn btn-primary">应用更改</button>
        </div>
      </form>
    </div>
  );
}
