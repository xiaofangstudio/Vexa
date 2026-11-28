/** 图形样式面板：从选中捕获、套用、更新联动、删除。 */
import { useState } from "react";
import { zh } from "../i18n/zh";
import type { Node, PathNode, TextNode, VexaDoc } from "../core/types";
import { paintPreview } from "../core/paint";
import {
  MAX_GRAPHIC_STYLES,
  addGraphicStyle,
  applyGraphicStyle,
  deleteGraphicStyle,
  graphicStyleById,
  graphicStyleUsage,
  stylesOf,
  updateGraphicStyle,
} from "../core/graphicStyles";
import type { DocStore } from "../stores/docStore";

interface Props {
  doc: VexaDoc;
  store: DocStore;
  ids: string[];
  onSay: (msg: string) => void;
}

function sourceNode(doc: VexaDoc, ids: string[]): PathNode | TextNode | undefined {
  for (const id of ids) {
    const n: Node | undefined = doc.nodes[id];
    if (n && (n.kind === "path" || n.kind === "text")) return n;
  }
  return undefined;
}

function formatText(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));
}

export default function GraphicStylesPanel({ doc, store, ids, onSay }: Props) {
  const [name, setName] = useState("");
  const styles = stylesOf(doc);
  const source = sourceNode(doc, ids);
  const activeId = source?.graphicStyle;
  const canCreate = !!source;
  const canUpdate = !!source && !!activeId && !!graphicStyleById(doc, activeId);

  const create = () => {
    let result: ReturnType<typeof addGraphicStyle> = { ok: false, error: zh.dock.styleNeedSel };
    store.commit((d) => {
      const node = sourceNode(d, ids);
      result = addGraphicStyle(d, node, name);
    });
    if (result.ok && result.style) {
      onSay(formatText(zh.dock.styleCreated, { name: result.style.name }));
      setName("");
    } else {
      onSay(result.error?.startsWith("最多") ? formatText(zh.dock.styleMax, { n: MAX_GRAPHIC_STYLES }) : zh.dock.styleNeedSel);
    }
  };

  const apply = (id: string) => {
    const style = graphicStyleById(doc, id);
    if (!style) return;
    if (ids.length === 0) {
      onSay(zh.dock.styleNeedSel);
      return;
    }
    let n = 0;
    store.commit((d) => {
      n = applyGraphicStyle(d, ids, id);
    });
    onSay(n > 0 ? formatText(zh.dock.styleApplied, { name: style.name }) : zh.dock.styleNeedSel);
  };

  const update = () => {
    if (!source || !activeId) {
      onSay(zh.dock.styleNoLink);
      return;
    }
    const style = graphicStyleById(doc, activeId);
    let n = 0;
    store.commit((d) => {
      n = updateGraphicStyle(d, activeId, source.id);
    });
    if (style && n > 0) onSay(formatText(zh.dock.styleUpdated, { name: style.name, n }));
    else onSay(zh.dock.styleNoLink);
  };

  const remove = (id: string) => {
    const style = graphicStyleById(doc, id);
    store.commit((d) => {
      deleteGraphicStyle(d, id);
    });
    onSay(style ? formatText(zh.dock.styleDeleted, { name: style.name }) : zh.dock.styleDeleted);
  };

  return (
    <section className="gs-panel">
      <header className="gs-head">
        <span>{zh.dock.graphicStyles}</span>
        <span className="gs-count">{styles.length}</span>
      </header>

      {styles.length === 0 ? (
        <div className="gs-empty">
          <b>{zh.dock.styleEmpty}</b>
          <p>{zh.dock.styleEmpty2}</p>
        </div>
      ) : (
        <div className="gs-list">
          {styles.map((s) => {
            const use = graphicStyleUsage(doc, s.id);
            const isActive = s.id === activeId;
            return (
              <div
                key={s.id}
                className={`gs-card${isActive ? " is-active" : ""}`}
                role="button"
                tabIndex={0}
                title={`${s.name} · ${formatText(zh.dock.styleLinked, { n: use })}${s.appearance?.length ? ` · ${s.appearance.length} 层叠加外观` : ""}`}
                onClick={() => apply(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    apply(s.id);
                  }
                }}
              >
                <span
                  className="gs-thumb"
                  style={{
                    background: paintPreview(s.fill),
                    borderColor: s.stroke && s.stroke.kind !== "none" ? s.stroke.color : "transparent",
                  }}
                />
                <span className="gs-meta">
                  <b>{s.name}</b>
                  <em>{formatText(zh.dock.styleLinked, { n: use })}{s.appearance?.length ? ` · 外观 ${s.appearance.length}` : ""}</em>
                </span>
                <span className="gs-alpha">{Math.round(s.opacity * 100)}%</span>
                <button
                  className="gs-del"
                  type="button"
                  title={zh.dock.delete}
                  aria-label={`${zh.dock.delete} ${s.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(s.id);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="gs-actions">
        <input
          className="gs-name"
          value={name}
          maxLength={24}
          placeholder={zh.dock.styleNameHint}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
          }}
        />
        <div className="gs-btns">
          <button className="gs-btn gs-primary" type="button" disabled={!canCreate} onClick={create}>
            {zh.dock.styleNew}
          </button>
          <button className="gs-btn" type="button" disabled={!canUpdate} onClick={update}>
            {zh.dock.styleUpdate}
          </button>
        </div>
        {!canCreate && <p className="gs-note">{zh.dock.styleNeedSel}</p>}
      </div>
    </section>
  );
}
