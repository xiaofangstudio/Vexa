/** 图案面板：矢量砖缩略预览、从选中新建/重定义、网格与砖排、套用到选区。 */
import { useEffect, useState } from "react";
import { zh } from "../i18n/zh";
import type { PathNode, VexaDoc } from "../core/types";
import { docToSVG } from "../core/svg";
import {
  MAX_PATTERNS,
  addPattern,
  applyPatternFill,
  canPatternFill,
  deletePattern,
  patternById,
  patternUsage,
  patternsOf,
  redefinePattern,
  renamePattern,
  setPatternTile,
} from "../core/patterns";
import type { DocStore } from "../stores/docStore";

interface Props {
  doc: VexaDoc;
  store: DocStore;
  ids: string[];
  onSay: (msg: string) => void;
}

function formatText(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));
}

function previewSVG(doc: VexaDoc, id: string): string {
  const def = patternById(doc, id);
  if (!def) return "";
  const tileW = def.tile === "brick" ? def.w * 2 : def.w;
  const tileH = def.tile === "brick" ? def.h * 2 : def.h;
  const w = tileW * 2.2;
  const h = tileH * 1.5;
  const rect: PathNode = {
    kind: "path",
    id: "preview",
    name: "图案预览",
    subpaths: [
      {
        closed: true,
        anchors: [
          { x: 0, y: 0, hIn: { x: 0, y: 0 }, hOut: { x: 0, y: 0 }, smooth: false },
          { x: w, y: 0, hIn: { x: w, y: 0 }, hOut: { x: w, y: 0 }, smooth: false },
          { x: w, y: h, hIn: { x: w, y: h }, hOut: { x: w, y: h }, smooth: false },
          { x: 0, y: h, hIn: { x: 0, y: h }, hOut: { x: 0, y: h }, smooth: false },
        ],
      },
    ],
    fill: { kind: "pattern", color: "#0f76d6", opacity: 1, patternId: id, patternScale: 1 },
    stroke: { kind: "none", color: "#000000", opacity: 1, width: 0, dash: [], cap: "butt", join: "miter", arrow: "none" },
    opacity: 1,
    visible: true,
    locked: false,
  };
  return docToSVG(
    {
      ...doc,
      name: "图案预览",
      artboards: [{ id: "preview", name: def.name, x: 0, y: 0, w, h, bg: "#ffffff" }],
      nodes: { preview: rect },
      root: ["preview"],
      symbols: [],
      styles: [],
    },
    { pretty: false },
  );
}

export default function PatternsPanel({ doc, store, ids, onSay }: Props) {
  const [name, setName] = useState("");
  const [active, setActive] = useState("");
  const [scale, setScale] = useState(100);
  const patterns = patternsOf(doc);
  const activePattern = patternById(doc, active);
  const canFill = canPatternFill(doc, ids);

  useEffect(() => {
    if (active && patterns.some((p) => p.id === active)) return;
    setActive(patterns[0]?.id ?? "");
  }, [active, patterns]);

  const create = () => {
    let result: ReturnType<typeof addPattern> = { ok: false, error: zh.dock.patternNeedSel };
    store.commit((d) => {
      result = addPattern(d, ids, name);
    });
    if (result.ok && result.pattern) {
      onSay(formatText(zh.dock.patternCreated, { name: result.pattern.name }));
      setName("");
      setActive(result.pattern.id);
    } else {
      onSay(result.error?.startsWith("最多") ? formatText(zh.dock.patternMax, { n: MAX_PATTERNS }) : zh.dock.patternNeedSel);
    }
  };

  const apply = (id: string) => {
    let n = 0;
    store.commit((d) => {
      n = applyPatternFill(d, ids, id, scale / 100);
    });
    if (n) {
      const def = patternById(doc, id);
      onSay(formatText(zh.dock.patternApplied, { name: def?.name ?? "图案", n }));
    } else {
      onSay(zh.dock.patternApplyNeed);
    }
  };

  const redefine = () => {
    if (!activePattern) return;
    let ok = false;
    store.commit((d) => {
      ok = redefinePattern(d, activePattern.id, ids);
    });
    if (ok) onSay(formatText(zh.dock.patternRedefined, { n: patternUsage(doc, activePattern.id) }));
    else onSay(zh.dock.patternRedefineNeed);
  };

  const remove = (id: string) => {
    const def = patternById(doc, id);
    let n = 0;
    store.commit((d) => {
      n = deletePattern(d, id);
    });
    if (def) onSay(formatText(zh.dock.patternDeleted, { name: def.name, n }));
  };

  const rename = (id: string, next: string) => {
    store.commit((d) => {
      renamePattern(d, id, next);
    });
  };

  return (
    <section className="gs-panel pat-panel">
      <header className="gs-head">
        <span>{zh.dock.patternsTitle}</span>
        <span className="gs-count">{patterns.length}</span>
      </header>

      {patterns.length === 0 ? (
        <div className="gs-empty">
          <b>{zh.dock.patternEmpty}</b>
          <p>{zh.dock.patternEmpty2}</p>
        </div>
      ) : (
        <div className="gs-list pat-list">
          {patterns.map((p) => {
            const use = patternUsage(doc, p.id);
            const isActive = p.id === active;
            return (
              <div
                key={p.id}
                className={`gs-card pat-card${isActive ? " is-active" : ""}`}
                role="button"
                tabIndex={0}
                data-pattern-id={p.id}
                title={`${p.name} · ${p.tile === "brick" ? zh.dock.patternBrick : zh.dock.patternGrid}`}
                onClick={() => setActive(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActive(p.id);
                  }
                }}
              >
                <span className="sym-thumb pat-thumb" dangerouslySetInnerHTML={{ __html: previewSVG(doc, p.id) }} />
                <span className="gs-meta">
                  <b>{p.name}</b>
                  <em>
                    {formatText(zh.dock.patternUsage, { n: use })} · {Math.round(p.w)}×{Math.round(p.h)}
                  </em>
                </span>
                <button
                  className="gs-btn pat-apply"
                  type="button"
                  title={canFill ? zh.dock.patternApply : zh.dock.patternApplyNeed}
                  disabled={!canFill}
                  onClick={(e) => {
                    e.stopPropagation();
                    apply(p.id);
                  }}
                >
                  {zh.dock.patternApply}
                </button>
                <button
                  className="gs-del"
                  type="button"
                  title={zh.dock.patternDelete}
                  aria-label={`${zh.dock.patternDelete} ${p.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(p.id);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activePattern && (
        <div className="pat-detail">
          <input
            className="gs-name"
            defaultValue={activePattern.name}
            key={activePattern.id + activePattern.name}
            maxLength={24}
            aria-label={zh.dock.patternNameHint}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== activePattern.name) rename(activePattern.id, next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          <div className="pat-tile" role="group" aria-label="图案平铺方式">
            <button
              className={"pat-tile-btn" + (activePattern.tile === "grid" ? " is-on" : "")}
              type="button"
              onClick={() => store.commit((d) => { setPatternTile(d, activePattern.id, "grid"); })}
            >
              {zh.dock.patternGrid}
            </button>
            <button
              className={"pat-tile-btn" + (activePattern.tile === "brick" ? " is-on" : "")}
              type="button"
              onClick={() => store.commit((d) => { setPatternTile(d, activePattern.id, "brick"); })}
            >
              {zh.dock.patternBrick}
            </button>
          </div>
          <label className="pat-scale">
            <span>{zh.dock.patternScale}</span>
            <input
              type="number"
              min={25}
              max={400}
              step={5}
              value={scale}
              aria-label={zh.dock.patternScaleHint}
              onChange={(e) => setScale(Math.min(400, Math.max(25, Number(e.target.value) || 100)))}
            />
            <em>%</em>
          </label>
        </div>
      )}

      <div className="gs-actions">
        <input
          className="gs-name"
          value={name}
          maxLength={24}
          placeholder={zh.dock.patternNameHint}
          disabled={!canFill}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canFill) create();
          }}
        />
        <div className="gs-btns">
          <button className="gs-btn gs-primary" type="button" disabled={!canFill} onClick={create}>
            {zh.dock.patternNew}
          </button>
          <button className="gs-btn" type="button" disabled={!activePattern || !canFill} onClick={redefine}>
            {zh.dock.patternRedefine}
          </button>
          <button className="gs-btn" type="button" disabled={!canFill} onClick={() => activePattern && apply(activePattern.id)}>
            {zh.dock.patternApply}
          </button>
        </div>
        {!canFill && <p className="gs-note">{zh.dock.patternNeedSel}</p>}
      </div>
    </section>
  );
}
