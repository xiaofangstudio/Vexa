/** 画笔面板：图案/艺术/散点/书法画笔，沿路径描边并即时调参。 */
import { useEffect, useState } from "react";
import { zh } from "../i18n/zh";
import { docToSVG } from "../core/svg";
import type { BrushKind, PathNode, VexaDoc } from "../core/types";
import {
  MAX_BRUSHES,
  applyBrushStroke,
  brushById,
  brushPattern,
  brushUsable,
  brushUsageCount,
  brushesOf,
  canBrushStroke,
  createBrush,
  deleteBrush,
  redefineBrushPattern,
  setBrushStyle,
} from "../core/brushes";
import { patternsOf } from "../core/patterns";
import type { DocStore } from "../stores/docStore";

interface Props {
  doc: VexaDoc;
  store: DocStore;
  ids: string[];
  onSay: (msg: string) => void;
}

const KINDS: BrushKind[] = ["pattern", "art", "scatter", "calligraphic"];

function formatText(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));
}

function kindLabel(kind: BrushKind): string {
  return zh.dock.brushKinds[kind];
}

function previewSVG(doc: VexaDoc, id: string): string {
  const brush = brushById(doc, id);
  if (!brush || !brushUsable(doc, brush)) return "";
  const curve: PathNode = {
    kind: "path",
    id: "brush-preview",
    name: "画笔预览",
    subpaths: [
      {
        closed: false,
        anchors: [
          { x: 12, y: 46, hIn: { x: 12, y: 46 }, hOut: { x: 52, y: 12 }, smooth: true },
          { x: 110, y: 38, hIn: { x: 72, y: 66 }, hOut: { x: 148, y: 14 }, smooth: true },
          { x: 218, y: 44, hIn: { x: 178, y: 70 }, hOut: { x: 218, y: 44 }, smooth: true },
        ],
      },
    ],
    fill: { kind: "none", color: "#ffffff", opacity: 1 },
    stroke: {
      kind: "solid",
      color: "#111827",
      opacity: 1,
      width: 8,
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
  const [newKind, setNewKind] = useState<BrushKind>("pattern");
  const [name, setName] = useState("");
  const [scale, setScale] = useState(100);
  const [spacing, setSpacing] = useState(100);
  const [angle, setAngle] = useState(120);
  const [roundness, setRoundness] = useState(35);
  const [jitter, setJitter] = useState(35);
  const [spread, setSpread] = useState(40);
  const activeBrush = brushById(doc, active);
  const canStroke = canBrushStroke(doc, ids);
  const activeUsable = brushUsable(doc, activeBrush);
  const callig = activeBrush?.kind === "calligraphic";

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
    setAngle(Math.round(activeBrush.angle ?? 120));
    setRoundness(Math.round(activeBrush.roundness ?? 35));
    setJitter(Math.round(activeBrush.jitter ?? 35));
    setSpread(Math.round(activeBrush.spread ?? 40));
  }, [
    activeBrush?.id,
    activeBrush?.scale,
    activeBrush?.spacing,
    activeBrush?.angle,
    activeBrush?.roundness,
    activeBrush?.jitter,
    activeBrush?.spread,
  ]);

  const create = () => {
    let result: ReturnType<typeof createBrush> = { ok: false, error: zh.dock.brushNeedPattern };
    store.commit((d) => {
      result = createBrush(d, newKind, newKind === "calligraphic" ? undefined : source, name);
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

  const commitStyle = (patch: Parameters<typeof setBrushStyle>[2]) => {
    if (!activeBrush) return;
    store.commit((d) => {
      setBrushStyle(d, activeBrush.id, patch);
    });
  };

  const changeSource = (patternId: string) => {
    if (!activeBrush) return;
    store.commit((d) => {
      redefineBrushPattern(d, activeBrush.id, patternId);
    });
    onSay(zh.dock.brushRedefined);
  };

  const detailText = (b: NonNullable<typeof activeBrush>): string => {
    if (b.kind === "calligraphic") {
      return `${Math.round(b.angle ?? 120)}° / ${Math.round(b.roundness ?? 35)}%`;
    }
    if (b.kind === "art") return `${Math.round(b.scale * 100)}% ${zh.dock.brushArtStretch}`;
    if (b.kind === "scatter") {
      return `${Math.round(b.scale * 100)}% / ${Math.round(b.spacing)}% · ${Math.round(b.jitter ?? 35)}%`;
    }
    return `${Math.round(b.scale * 100)}% / ${Math.round(b.spacing)}%`;
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
            const usable = brushUsable(doc, b);
            const pat = brushPattern(doc, b);
            const isActive = b.id === active;
            return (
              <div
                key={b.id}
                className={`gs-card brh-card${isActive ? " is-active" : ""}`}
                role="button"
                tabIndex={0}
                data-brush-id={b.id}
                title={`${b.name} · ${pat?.name ?? zh.dock.brushCalligSource}`}
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
                  <b>
                    {b.name}
                    <i className={`brh-chip brh-chip-${b.kind}`}>{kindLabel(b.kind)}</i>
                  </b>
                  <em>
                    {formatText(zh.dock.brushUsage, { n: use })} · {detailText(b)}
                  </em>
                </span>
                <button
                  className="gs-btn brh-apply"
                  type="button"
                  title={canStroke ? zh.dock.brushApply : zh.dock.brushNeedSel}
                  disabled={!canStroke || !usable}
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
        <div className={`brh-detail brh-detail-${activeBrush.kind}`}>
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
          {!callig && (
            <label className="brh-source">
              <span>{zh.dock.brushSource}</span>
              <select value={activeBrush.patternId ?? ""} aria-label={zh.dock.brushSource} onChange={(e) => changeSource(e.target.value)}>
                {patterns.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="brh-fields">
            {activeBrush.kind !== "pattern" && activeBrush.kind !== "art" && activeBrush.kind !== "scatter" && (
              <>
                <label>
                  <span>{zh.dock.brushWidth}</span>
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    step={5}
                    value={scale}
                    aria-label={zh.dock.brushWidthHint}
                    onChange={(e) => {
                      const v = Math.min(1000, Math.max(10, Number(e.target.value) || 100));
                      setScale(v);
                      commitStyle({ scale: v / 100 });
                    }}
                  />
                  <em>%</em>
                </label>
                <label>
                  <span>{zh.dock.brushAngle}</span>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    step={5}
                    value={angle}
                    aria-label={zh.dock.brushAngleHint}
                    onChange={(e) => {
                      const v = Math.min(180, Math.max(0, Number(e.target.value) || 0));
                      setAngle(v);
                      commitStyle({ angle: v });
                    }}
                  />
                  <em>°</em>
                </label>
                <label>
                  <span>{zh.dock.brushRoundness}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={roundness}
                    aria-label={zh.dock.brushRoundnessHint}
                    onChange={(e) => {
                      const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setRoundness(v);
                      commitStyle({ roundness: v });
                    }}
                  />
                  <em>%</em>
                </label>
              </>
            )}
            {(activeBrush.kind === "pattern" || activeBrush.kind === "art" || activeBrush.kind === "scatter") && (
              <label>
                <span>{activeBrush.kind === "art" ? zh.dock.brushHeight : zh.dock.brushScale}</span>
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
                    commitStyle({ scale: v / 100 });
                  }}
                />
                <em>%</em>
              </label>
            )}
            {(activeBrush.kind === "pattern" || activeBrush.kind === "scatter") && (
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
                    commitStyle({ spacing: v });
                  }}
                />
                <em>%</em>
              </label>
            )}
            {activeBrush.kind === "scatter" && (
              <>
                <label>
                  <span>{zh.dock.brushJitter}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={jitter}
                    aria-label={zh.dock.brushJitterHint}
                    onChange={(e) => {
                      const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setJitter(v);
                      commitStyle({ jitter: v });
                    }}
                  />
                  <em>%</em>
                </label>
                <label>
                  <span>{zh.dock.brushSpread}</span>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    step={5}
                    value={spread}
                    aria-label={zh.dock.brushSpreadHint}
                    onChange={(e) => {
                      const v = Math.min(200, Math.max(0, Number(e.target.value) || 0));
                      setSpread(v);
                      commitStyle({ spread: v });
                    }}
                  />
                  <em>%</em>
                </label>
              </>
            )}
          </div>
        </div>
      )}

      <div className="gs-actions">
        <label className="brh-source">
          <span>{zh.dock.brushSource}</span>
          <select
            value={source}
            aria-label={`${zh.dock.brushSource} 新建`}
            disabled={!patterns.length || newKind === "calligraphic"}
            onChange={(e) => setSource(e.target.value)}
          >
            {patterns.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="brh-source brh-kind-row">
          <span>{zh.dock.brushKind}</span>
          <select className="brh-kind" value={newKind} aria-label={zh.dock.brushKind} onChange={(e) => setNewKind(e.target.value as BrushKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </select>
        </label>
        <input
          className="gs-name"
          value={name}
          maxLength={24}
          placeholder={zh.dock.brushNameHint}
          disabled={newKind !== "calligraphic" && !patterns.length}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (newKind === "calligraphic" || patterns.length)) create();
          }}
        />
        <div className="gs-btns">
          <button className="gs-btn gs-primary" type="button" disabled={newKind !== "calligraphic" && !patterns.length} onClick={create}>
            {zh.dock.brushNew}
          </button>
          <button
            className="gs-btn"
            type="button"
            disabled={!activeBrush || !canStroke || !activeUsable}
            onClick={() => activeBrush && apply(activeBrush.id)}
          >
            {zh.dock.brushApply}
          </button>
        </div>
        {newKind !== "calligraphic" && !patterns.length && <p className="gs-note">{zh.dock.brushNeedPattern}</p>}
        {patterns.length > 0 && !canStroke && <p className="gs-note">{zh.dock.brushNeedSel}</p>}
      </div>
    </section>
  );
}

