/** 图案画笔面板：图案砖转画笔、沿路径描边、砖缩放/间距、更换图案与删除。 */
import { useEffect, useState } from "react";
import { zh } from "../i18n/zh";
import { docToSVG } from "../core/svg";
import type { PathNode, VexaDoc } from "../core/types";
import {
  MAX_BRUSHES,
  applyBrushStroke,
  brushById,
  brushPattern,
  brushUsageCount,
  brushesOf,
  canBrushStroke,
  createPatternBrush,
  deleteBrush,
  redefineBrushPattern,
  setBrushParams,
} from "../core/brushes";
import { patternsOf } from "../core/patterns";
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
  const brush = brushById(doc, id);
  if (!brush || !brushPattern(doc, brush)) return "";
  const curve: PathNode = {
    kind: "path",
    id: "brush-preview",
    name: "画笔预览",
    subpaths: [
      {
        closed: false,
        anchors: [
          { x: 12, y: 46, hIn: { x: 12, y: 46 }, hOut: { x: 52, y: 12 }, smooth: true },
          { x: 112, y: 40, hIn: { x: 72, y: 66 }, hOut: { x: 152, y: 14 }, smooth: true },
          { x: 218, y: 44, hIn: { x: 178, y: 70 }, hOut: { x: 218, y: 44 }, smooth: true },
        ],
      },
    ],
    fill: { kind: "none", color: "#ffffff", opacity: 1 },
    stroke: {
      kind: "solid",
      color: "#111827",
      opacity: 1,
      width: 1,
      dash: [],
      cap: "butt",
      join: "miter",
      arrow: "none",
      brushId: id,
    },
    opacity: 1,
    visible: true,
    locked: false,
  };
  return docToSVG(
    {
      ...doc,
      name: "画笔预览",
      artboards: [{ id: "preview", name: brush.name, x: 0, y: 0, w: 230, h: 84, bg: "#ffffff" }],
      nodes: { "brush-preview": curve },
      root: ["brush-preview"],
      symbols: [],
      styles: [],
    },
    { pretty: false },
  );
}

export default function BrushesPanel({ doc, store, ids, onSay }: Props) {
  const brushes = brushesOf(doc);
  const patterns = patternsOf(doc);
  const [active, setActive] = useState("");
  const [source, setSource] = useState("");
  const [name, setName] = useState("");
  const [scale, setScale] = useState(100);
  const [spacing, setSpacing] = useState(100);
  const activeBrush = brushById(doc, active);
  const canStroke = canBrushStroke(doc, ids);

  useEffect(() => {
    if (active && brushes.some((b) => b.id === active)) return;
    setActive(brushes[0]?.id ?? "");
  }, [active, brushes]);

  useEffect(() => {
    if (source && patterns.some((p) => p.id === source)) return;
    setSource(patterns[0]?.id ?? "");
  }, [patterns, source]);

  useEffect(() => {
    if (!activeBrush) return;
    setScale(Math.round(activeBrush.scale * 100));
    setSpacing(Math.round(activeBrush.spacing));
  }, [activeBrush?.id, activeBrush?.scale, activeBrush?.spacing]);

  const create = () => {
    let result: ReturnType<typeof createPatternBrush> = { ok: false, error: zh.dock.brushNeedPattern };
    store.commit((d) => {
      result = createPatternBrush(d, source, name);
    });
    if (result.ok && result.brush) {
      onSay(formatText(zh.dock.brushCreated, { name: result.brush.name }));
      setName("");
      setActive(result.brush.id);
    } else {
      onSay(result.error?.startsWith("最多") ? formatText(zh.dock.brushMax, { n: MAX_BRUSHES }) : result.error ?? zh.dock.brushNeedPattern);
    }
  };

  const apply = (id: string) => {
    let n = 0;
    store.commit((d) => {
      n = applyBrushStroke(d, ids, id);
    });
    if (n) {
      const brush = brushById(doc, id);
      onSay(formatText(zh.dock.brushApplied, { name: brush?.name ?? zh.dock.brushes, n }));
    } else {
      onSay(zh.dock.brushNeedSel);
    }
  };

  const remove = (id: string) => {
    const brush = brushById(doc, id);
    let n = 0;
    store.commit((d) => {
      n = deleteBrush(d, id);
    });
    if (brush) onSay(formatText(zh.dock.brushDeleted, { name: brush.name, n }));
  };

  const commitParams = (nextScale = scale, nextSpacing = spacing) => {
    if (!activeBrush) return;
    store.commit((d) => {
      setBrushParams(d, activeBrush.id, nextScale / 100, nextSpacing);
    });
  };

  const changeSource = (patternId: string) => {
    if (!activeBrush) return;
    store.commit((d) => {
      redefineBrushPattern(d, activeBrush.id, patternId);
    });
    onSay(zh.dock.brushRedefined);
  };

  return (
    <section className="gs-panel brh-panel">
      <header className="gs-head">
        <span>{zh.dock.brushesTitle}</span>
        <span className="gs-count">{brushes.length}</span>
      </header>

      {brushes.length === 0 ? (
        <div className="gs-empty">
          <b>{zh.dock.brushEmpty}</b>
          <p>{zh.dock.brushEmpty2}</p>
        </div>
      ) : (
        <div className="gs-list brh-list">
          {brushes.map((b) => {
            const use = brushUsageCount(doc, b.id);
            const pat = brushPattern(doc, b);
            const isActive = b.id === active;
            return (
              <div
                key={b.id}
                className={`gs-card brh-card${isActive ? " is-active" : ""}`}
                role="button"
                tabIndex={0}
                data-brush-id={b.id}
                title={`${b.name} · ${pat?.name ?? zh.dock.brushMissing}`}
                onClick={() => setActive(b.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActive(b.id);
                  }
                }}
              >
                <span className="brh-thumb" dangerouslySetInnerHTML={{ __html: previewSVG(doc, b.id) }} />
                <span className="gs-meta">
                  <b>{b.name}</b>
                  <em>
                    {formatText(zh.dock.brushUsage, { n: use })} · {Math.round(b.scale * 100)}% / {Math.round(b.spacing)}%
                  </em>
                </span>
                <button
                  className="gs-btn brh-apply"
                  type="button"
                  title={canStroke ? zh.dock.brushApply : zh.dock.brushNeedSel}
                  disabled={!canStroke || !pat}
                  onClick={(e) => {
                    e.stopPropagation();
                    apply(b.id);
                  }}
                >
                  {zh.dock.brushApply}
                </button>
                <button
                  className="gs-del"
                  type="button"
                  title={zh.dock.brushDelete}
                  aria-label={`${zh.dock.brushDelete} ${b.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(b.id);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeBrush && (
        <div className="brh-detail">
          <input
            className="gs-name"
            defaultValue={activeBrush.name}
            key={activeBrush.id + activeBrush.name}
            maxLength={24}
            aria-label={zh.dock.brushNameHint}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== activeBrush.name) {
                store.commit((d) => {
                  const b = brushById(d, activeBrush.id);
                  if (b) {
                    b.name = next;
                    b.rev = (b.rev ?? 1) + 1;
                  }
                });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          <label className="brh-source">
            <span>{zh.dock.brushSource}</span>
            <select value={activeBrush.patternId} aria-label={zh.dock.brushSource} onChange={(e) => changeSource(e.target.value)}>
              {patterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="brh-fields">
            <label>
              <span>{zh.dock.brushScale}</span>
              <input
                type="number"
                min={10}
                max={1000}
                step={5}
                value={scale}
                aria-label={zh.dock.brushScaleHint}
                onChange={(e) => {
                  const v = Math.min(1000, Math.max(10, Number(e.target.value) || 100));
                  setScale(v);
                  commitParams(v, spacing);
                }}

              />
              <em>%</em>
            </label>
            <label>
              <span>{zh.dock.brushSpacing}</span>
              <input
                type="number"
                min={20}
                max={400}
                step={5}
                value={spacing}
                aria-label={zh.dock.brushSpacingHint}
                onChange={(e) => {
                  const v = Math.min(400, Math.max(20, Number(e.target.value) || 100));
                  setSpacing(v);
                  commitParams(scale, v);
                }}

              />
              <em>%</em>
            </label>
          </div>
        </div>
      )}

      <div className="gs-actions">
        <label className="brh-source">
          <span>{zh.dock.brushSource}</span>
          <select value={source} aria-label={`${zh.dock.brushSource} 新建`} disabled={!patterns.length} onChange={(e) => setSource(e.target.value)}>
            {patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <input
          className="gs-name"
          value={name}
          maxLength={24}
          placeholder={zh.dock.brushNameHint}
          disabled={!patterns.length}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && patterns.length) create();
          }}
        />
        <div className="gs-btns">
          <button className="gs-btn gs-primary" type="button" disabled={!patterns.length} onClick={create}>
            {zh.dock.brushNew}
          </button>
          <button className="gs-btn" type="button" disabled={!activeBrush || !canStroke} onClick={() => activeBrush && apply(activeBrush.id)}>
            {zh.dock.brushApply}
          </button>
        </div>
        {!patterns.length && <p className="gs-note">{zh.dock.brushNeedPattern}</p>}
        {patterns.length > 0 && !canStroke && <p className="gs-note">{zh.dock.brushNeedSel}</p>}
      </div>
    </section>
  );
}
