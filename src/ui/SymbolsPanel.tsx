/** 符号面板：从选中捕获、置入实例、重定义同步、断开链接与删除。 */
import { useEffect, useState } from "react";
import { zh } from "../i18n/zh";
import type { Node, VexaDoc } from "../core/types";
import { docToSVG } from "../core/svg";
import {
  MAX_SYMBOLS,
  addSymbol,
  deleteSymbol,
  expandSymbolInstance,
  placeSymbol,
  redefineSymbol,
  renameSymbol,
  symbolById,
  symbolUsage,
  symbolsOf,
} from "../core/symbols";
import type { DocStore } from "../stores/docStore";

interface Props {
  doc: VexaDoc;
  store: DocStore;
  ids: string[];
  onSay: (msg: string) => void;
  onSelect: (ids: string[]) => void;
}

function formatText(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));
}

function canCapture(doc: VexaDoc, ids: string[]): boolean {
  return ids.some((id) => {
    const n: Node | undefined = doc.nodes[id];
    return !!n && n.kind !== "symbol";
  });
}

function previewSVG(doc: VexaDoc, id: string): string {
  const s = symbolById(doc, id);
  if (!s) return "";
  return docToSVG(
    {
      ...doc,
      artboards: [{ id: "preview", name: s.name, x: 0, y: 0, w: s.w, h: s.h, bg: "#ffffff" }],
      nodes: s.nodes,
      root: s.root,
      symbols: [],
    },
    { pretty: false },
  );
}

export default function SymbolsPanel({ doc, store, ids, onSay, onSelect }: Props) {
  const [name, setName] = useState("");
  const [active, setActive] = useState<string>("");
  const symbols = symbolsOf(doc);
  const activeSymbol = symbolById(doc, active);
  const selectedInstance = ids.map((id) => doc.nodes[id]).find((n): n is Extract<Node, { kind: "symbol" }> => !!n && n.kind === "symbol");
  const captureOk = canCapture(doc, ids);

  useEffect(() => {
    if (active && symbols.some((s) => s.id === active)) return;
    setActive(symbols[0]?.id ?? "");
  }, [active, symbols]);

  const create = () => {
    let result: ReturnType<typeof addSymbol> = { ok: false, error: zh.dock.symbolNeedSel };
    store.commit((d) => {
      result = addSymbol(d, ids, name);
    });
    if (result.ok && result.symbol) {
      onSay(formatText(zh.dock.symbolCreated, { name: result.symbol.name }));
      setName("");
      setActive(result.symbol.id);
    } else {
      onSay(result.error?.startsWith("最多") ? formatText(zh.dock.symbolMax, { n: MAX_SYMBOLS }) : zh.dock.symbolNeedSel);
    }
  };

  const place = (id: string) => {
    const s = symbolById(doc, id);
    if (!s) return;
    const board = doc.artboards[0];
    const x = board.x + (board.w - s.w) / 2;
    const y = board.y + (board.h - s.h) / 2;
    let made: string | null = null;
    store.commit((d) => {
      made = placeSymbol(d, id, x, y)?.id ?? null;
    });
    if (made) {
      onSelect([made]);
      onSay(formatText(zh.dock.symbolPlaced, { name: s.name }));
    }
  };

  const redefine = () => {
    if (!activeSymbol) {
      onSay(zh.dock.symbolNeedSel);
      return;
    }
    if (!captureOk) {
      onSay(zh.dock.symbolRedefineNeed);
      return;
    }
    let n = 0;
    store.commit((d) => {
      n = redefineSymbol(d, activeSymbol.id, ids);
    });
    if (n > 0) onSay(formatText(zh.dock.symbolRedefined, { n }));
    else onSay(zh.dock.symbolRedefineNeed);
  };

  const expand = () => {
    if (!selectedInstance) {
      onSay(zh.dock.symbolExpandNeed);
      return;
    }
    let groupId: string | null = null;
    store.commit((d) => {
      groupId = expandSymbolInstance(d, selectedInstance.id);
    });
    if (groupId) {
      onSelect([groupId]);
      onSay(zh.dock.symbolExpand);
    } else {
      onSay(zh.dock.symbolExpandNeed);
    }
  };

  const remove = (id: string) => {
    const s = symbolById(doc, id);
    store.commit((d) => {
      deleteSymbol(d, id);
    });
    if (s) onSay(formatText(zh.dock.symbolDeleted, { name: s.name }));
  };

  const rename = (id: string, next: string) => {
    store.commit((d) => {
      renameSymbol(d, id, next);
    });
  };

  return (
    <section className="gs-panel sym-panel">
      <header className="gs-head">
        <span>{zh.dock.symbolsTitle}</span>
        <span className="gs-count">{symbols.length}</span>
      </header>

      {symbols.length === 0 ? (
        <div className="gs-empty">
          <b>{zh.dock.symbolEmpty}</b>
          <p>{zh.dock.symbolEmpty2}</p>
        </div>
      ) : (
        <div className="gs-list sym-list">
          {symbols.map((s) => {
            const use = symbolUsage(doc, s.id);
            const isActive = s.id === active;
            return (
              <div
                key={s.id}
                className={`gs-card sym-card${isActive ? " is-active" : ""}`}
                role="button"
                tabIndex={0}
                data-symbol-id={s.id}
                title={`${s.name} · ${formatText(zh.dock.symbolUsage, { n: use })}`}
                onClick={() => setActive(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActive(s.id);
                  }
                }}
              >
                <span className="sym-thumb" dangerouslySetInnerHTML={{ __html: previewSVG(doc, s.id) }} />
                <span className="gs-meta">
                  <b>{s.name}</b>
                  <em>{formatText(zh.dock.symbolUsage, { n: use })}</em>
                </span>
                <button
                  className="gs-btn sym-place"
                  type="button"
                  title={zh.dock.symbolPlace}
                  onClick={(e) => {
                    e.stopPropagation();
                    place(s.id);
                  }}
                >
                  {zh.dock.symbolPlace}
                </button>
                <button
                  className="gs-del"
                  type="button"
                  title={zh.dock.symbolDelete}
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

      {activeSymbol && (
        <div className="sym-detail">
          <span className="sym-dim">
            {Math.round(activeSymbol.w)} × {Math.round(activeSymbol.h)}
          </span>
          <input
            className="gs-name"
            defaultValue={activeSymbol.name}
            key={activeSymbol.id + activeSymbol.name}
            maxLength={24}
            aria-label={zh.dock.symbolNameHint}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== activeSymbol.name) rename(activeSymbol.id, next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </div>
      )}

      <div className="gs-actions">
        <input
          className="gs-name"
          value={name}
          maxLength={24}
          placeholder={zh.dock.symbolNameHint}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
          }}
        />
        <div className="gs-btns">
          <button className="gs-btn gs-primary" type="button" disabled={!captureOk} onClick={create}>
            {zh.dock.symbolNew}
          </button>
          <button className="gs-btn" type="button" disabled={!activeSymbol || !captureOk} onClick={redefine}>
            {zh.dock.symbolRedefine}
          </button>
          <button className="gs-btn" type="button" disabled={!selectedInstance} onClick={expand}>
            {zh.dock.symbolUnlink}
          </button>
        </div>
        {!captureOk && <p className="gs-note">{zh.dock.symbolNeedSel}</p>}
      </div>
    </section>
  );
}
