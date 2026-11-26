/** 文档色板弹窗：新建、改名/改色/类型、删除、导入导出 JSON。 */
import { useEffect, useRef, useState } from "react";
import type { Swatch, SwatchKind, VexaDoc } from "../core/types";
import { SWATCH_KINDS, exportSwatchesText, parseSwatchesJSON, swatchUsage, swatchesOf, type MergeSwatchesResult, type SwatchResult } from "../core/swatches";
import { pickSwatchSave, writeTextFile } from "../engine/io";
import "./SwatchesDialog.css";

interface Props {
  doc: VexaDoc;
  onAdd: (input: { name: string; color: string; kind: SwatchKind }) => SwatchResult;
  onUpdate: (id: string, patch: Partial<Pick<Swatch, "name" | "color" | "kind">>) => SwatchResult;
  onRemove: (id: string) => void;
  onMerge: (list: Swatch[]) => MergeSwatchesResult;
  onClose: () => void;
}

type Draft = { name: string; color: string; kind: SwatchKind };
type Notice = { kind: "ok" | "error"; text: string } | null;

const draftOf = (s: Swatch): Draft => ({ name: s.name, color: s.color, kind: s.kind });
const makeDrafts = (list: Swatch[]): Record<string, Draft> => Object.fromEntries(list.map((s) => [s.id, draftOf(s)]));

export default function SwatchesDialog({ doc, onAdd, onUpdate, onRemove, onMerge, onClose }: Props) {
  const list = swatchesOf(doc);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => makeDrafts(list));
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0f76d6");
  const [kind, setKind] = useState<SwatchKind>("process");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const previousRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    setDrafts(makeDrafts(swatchesOf(doc)));
  }, [doc]);

  useEffect(() => {
    previousRef.current = document.activeElement as HTMLElement | null;
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
      const target = previousRef.current;
      if (target && target.isConnected && target !== document.body) target.focus();
    };
  }, []);

  const saveNew = () => {
    const r = onAdd({ name, color, kind });
    if (!r.ok) {
      setNotice({ kind: "error", text: r.error ?? "新建失败" });
      return;
    }
    setNotice({ kind: "ok", text: `已新建「${r.swatch?.name}」` });
    setName("");
  };

  const saveRow = (s: Swatch) => {
    const d = drafts[s.id];
    if (!d) return;
    const r = onUpdate(s.id, d);
    setNotice(r.ok ? { kind: "ok", text: `已更新「${r.swatch?.name}」` } : { kind: "error", text: r.error ?? "更新失败" });
  };

  const removeRow = (s: Swatch) => {
    onRemove(s.id);
    setNotice({ kind: "ok", text: `已删除「${s.name}」` });
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy("import");
    try {
      const parsed = parseSwatchesJSON(await file.text());
      if (parsed.error) {
        setNotice({ kind: "error", text: parsed.error });
        return;
      }
      const r = onMerge(parsed.list);
      setNotice(r.error ? { kind: "error", text: r.error } : { kind: "ok", text: `已导入 ${r.added} 个色板` });
    } catch (err) {
      setNotice({ kind: "error", text: `导入失败：${String(err)}` });
    } finally {
      setBusy(null);
    }
  };

  const exportFile = async () => {
    if (!list.length) {
      setNotice({ kind: "error", text: "还没有文档色板可导出" });
      return;
    }
    setBusy("export");
    try {
      const path = await pickSwatchSave(doc.name || "Vexa-文档色板");
      if (!path) {
        setNotice({ kind: "error", text: "未选择保存位置" });
        return;
      }
      await writeTextFile(path, exportSwatchesText(doc));
      setNotice({ kind: "ok", text: `已导出 ${list.length} 个色板` });
    } catch (err) {
      setNotice({ kind: "error", text: `导出失败：${String(err)}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal swatch-modal" role="dialog" aria-modal="true" aria-labelledby="swatch-title">
        <div className="modal-head">
          <h3 id="swatch-title">文档色板</h3>
          <span className="swatch-head-note">全局色 / 专色随工程保存；改动同步链接对象</span>
        </div>
        <div className="modal-body">
          <section className="swatch-sec">
            <div className="swatch-sec-head">
              <span>当前色板</span>
              <span className="faint num">{list.length} / {64}</span>
            </div>
            {list.length === 0 ? (
              <div className="swatch-empty">还没有文档色板。把常用填充存成全局色，或在下方新建。</div>
            ) : (
              <ul className="swatch-list">
                {list.map((s) => {
                  const d = drafts[s.id] ?? draftOf(s);
                  const dirty = d.name !== s.name || d.color !== s.color || d.kind !== s.kind;
                  const usage = swatchUsage(doc, s.id);
                  return (
                    <li className="swatch-row" key={s.id}>
                      <input
                        className="swatch-color"
                        type="color"
                        value={d.color}
                        aria-label={`${s.name} 颜色`}
                        onChange={(e) => { setDrafts((all) => ({ ...all, [s.id]: { ...d, color: e.target.value } })); setNotice(null); }}
                      />
                      <input
                        className="field-input swatch-name"
                        value={d.name}
                        aria-label={`${s.name} 名称`}
                        maxLength={24}
                        onChange={(e) => { setDrafts((all) => ({ ...all, [s.id]: { ...d, name: e.target.value } })); setNotice(null); }}
                      />
                      <select
                        className="field-input swatch-kind"
                        value={d.kind}
                        aria-label={`${s.name} 类型`}
                        onChange={(e) => { setDrafts((all) => ({ ...all, [s.id]: { ...d, kind: e.target.value === "spot" ? "spot" : "process" } })); setNotice(null); }}
                      >
                        {SWATCH_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                      </select>
                      <span className="swatch-use num" title={`${usage.fills} 个填充 / ${usage.strokes} 个描边`}>{usage.total} 处</span>
                      <button type="button" className="btn btn-sm" disabled={!dirty} onClick={() => saveRow(s)}>保存</button>
                      <button type="button" className="btn-link swatch-del" onClick={() => removeRow(s)}>删除</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="swatch-sec">
            <div className="swatch-sec-head"><span>新建色板</span></div>
            <div className="swatch-new">
              <input
                ref={nameRef}
                className="field-input swatch-new-name"
                value={name}
                placeholder="名称，例如 品牌蓝"
                maxLength={24}
                onChange={(e) => { setName(e.target.value); setNotice(null); }}
              />
              <input
                className="swatch-color"
                type="color"
                value={color}
                aria-label="新色板颜色"
                onChange={(e) => { setColor(e.target.value); setNotice(null); }}
              />
              <select
                className="field-input swatch-kind"
                value={kind}
                aria-label="新色板类型"
                onChange={(e) => setKind(e.target.value === "spot" ? "spot" : "process")}
              >
                {SWATCH_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <button type="button" className="btn btn-primary" onClick={saveNew}>新建</button>
            </div>
            <div className="swatch-tools">
              <input
                ref={importRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void importFile(f); }}
              />
              <button type="button" className="btn btn-sm" onClick={() => importRef.current?.click()} disabled={busy !== null}>
                {busy === "import" ? "导入中…" : "导入 JSON…"}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => void exportFile()} disabled={busy !== null || list.length === 0}>
                {busy === "export" ? "导出中…" : "导出 JSON…"}
              </button>
              <span className={`swatch-notice${notice?.kind === "error" ? " is-error" : ""}`} role="status">{notice?.text ?? ""}</span>
            </div>
          </section>
        </div>
        <div className="modal-foot">
          <span className="faint">导入只补充新色板，同名同色自动跳过</span>
          <button type="button" className="btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
