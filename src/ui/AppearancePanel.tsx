/** 外观面板：在路径底层填充/描边之上叠加多层填充与描边，可显隐、排序、调透明度。 */
import { zh } from "../i18n/zh";
import type { AppearanceItem, PathNode, VexaDoc } from "../core/types";
import {
  MAX_APPEARANCE,
  addAppearance,
  appearanceOf,
  moveAppearance,
  removeAppearance,
  updateAppearance,
} from "../core/appearance";
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

function paintPreview(color: string, kind: string): string {
  if (kind === "none") return "transparent";
  if (kind === "linear" || kind === "radial") return `linear-gradient(135deg, ${color} 0 48%, #ffffff 48% 52%, ${color} 52% 100%)`;
  if (kind === "pattern") return `repeating-linear-gradient(45deg, ${color} 0 4px, #ffffff 4px 8px)`;
  return color;
}

function AppearanceRow({
  item,
  path,
  store,
}: {
  item: AppearanceItem;
  path: PathNode;
  store: DocStore;
}) {
  const fill = item.kind === "fill" ? item.fill : undefined;
  const stroke = item.kind === "stroke" ? item.stroke : undefined;
  const color = item.kind === "fill" ? fill?.color ?? "#111319" : stroke?.color ?? "#111319";
  const solid = item.kind === "fill" ? fill?.kind === "solid" : stroke?.kind === "solid";
  const label = item.kind === "fill" ? zh.dock.aprFill : zh.dock.aprStroke;

  const commit = (patch: Parameters<typeof updateAppearance>[2]) => {
    store.commit((d) => {
      const node = d.nodes[path.id];
      if (node?.kind === "path") updateAppearance(node, item.id, patch);
    });
  };

  return (
    <div className={"apr-item apr-item-" + item.kind + (item.visible ? "" : " is-off")} data-ap-id={item.id}>
      <button
        className="apr-eye"
        type="button"
        aria-label={item.visible ? zh.dock.aprHide : zh.dock.aprVisible}
        aria-pressed={item.visible}
        onClick={() => commit({ visible: !item.visible })}
      >
        {item.visible ? "◉" : "○"}
      </button>
      <span className={"apr-type apr-type-" + item.kind}>{label}</span>
      {solid ? (
        <input
          className="apr-color"
          type="color"
          value={color}
          aria-label={label}
          onChange={(e) =>
            commit(item.kind === "fill" ? { fill: { ...fill!, color: e.target.value, kind: "solid" } } : { stroke: { ...stroke!, color: e.target.value } })
          }
        />
      ) : (
        <span className="apr-swatch" style={{ background: paintPreview(color, item.kind === "fill" ? fill?.kind ?? "none" : "solid") }} title={zh.dock.aprGradient} />
      )}
      {stroke && (
        <label className="apr-width">
          <input
            type="number"
            min={0}
            max={200}
            step={1}
            value={Math.round(stroke.width * 10) / 10}
            aria-label={zh.dock.aprWidth}
            onChange={(e) => {
              const v = Math.max(0, Math.min(200, Number(e.target.value) || 0));
              commit({ stroke: { ...stroke, width: v } });
            }}
          />
          <span>px</span>
        </label>
      )}
      <label className="apr-opacity">
        <input
          type="number"
          min={0}
          max={100}
          step={5}
          value={Math.round(item.opacity * 100)}
          aria-label={zh.dock.aprOpacity}
          onChange={(e) => {
            const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
            commit({ opacity: v / 100 });
          }}
        />
        <span>%</span>
      </label>
      <div className="apr-order">
        <button
          type="button"
          className="apr-up"
          aria-label={zh.dock.aprUp}
          onClick={() =>
            store.commit((d) => {
              const node = d.nodes[path.id];
              if (node?.kind === "path") moveAppearance(node, item.id, 1);
            })
          }
        >
          ↑
        </button>
        <button
          type="button"
          className="apr-down"
          aria-label={zh.dock.aprDown}
          onClick={() =>
            store.commit((d) => {
              const node = d.nodes[path.id];
              if (node?.kind === "path") moveAppearance(node, item.id, -1);
            })
          }
        >
          ↓
        </button>
      </div>
      <button
        type="button"
        className="apr-del"
        aria-label={zh.dock.aprDelete}
        onClick={() => {
          store.commit((d) => {
            const node = d.nodes[path.id];
            if (node?.kind === "path") removeAppearance(node, item.id);
          });
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function AppearancePanel({ doc, store, ids, onSay }: Props) {
  const node = ids.length === 1 ? doc.nodes[ids[0]] : undefined;
  const path = node?.kind === "path" ? node : undefined;
  const items = path ? appearanceOf(path) : [];
  const count = items.length;

  const add = (kind: "fill" | "stroke") => {
    if (!path) return;
    let ok = false;
    let error = "";
    store.commit((d) => {
      const hit = d.nodes[path.id];
      if (hit?.kind === "path") {
        const res = addAppearance(hit, kind);
        ok = res.ok;
        error = res.error ?? "";
      }
    });
    if (ok) onSay(formatText(zh.dock.aprAdded, { n: kind === "fill" ? zh.dock.aprFill : zh.dock.aprStroke }));
    else if (error) onSay(error);
  };

  return (
    <div className="apr-panel">
      <div className="apr-head">
        <span className="apr-title">{zh.dock.appearancePanel}</span>
        <span className={"apr-count" + (count ? " has" : "")}>{count}/{MAX_APPEARANCE}</span>
      </div>

      {!path ? (
        <div className="apr-empty">{zh.dock.aprEmpty}</div>
      ) : (
        <>
          <div className="apr-section-label">{zh.dock.aprBase}</div>
          <div className="apr-base">
            <div className="apr-base-row">
              <span className="apr-eye is-static">◉</span>
              <span className="apr-type apr-type-fill">{zh.dock.aprFill}</span>
              <span
                className="apr-swatch"
                style={{ background: paintPreview(path.fill.color, path.fill.kind) }}
              />
              <span className="apr-base-meta">
                {path.fill.kind === "none"
                  ? zh.dock.none
                  : path.fill.kind === "solid"
                    ? path.fill.color.toUpperCase()
                    : path.fill.kind === "pattern"
                      ? zh.dock.patterns
                      : zh.dock.aprGradient}
              </span>
            </div>
            <div className="apr-base-row">
              <span className="apr-eye is-static">◉</span>
              <span className="apr-type apr-type-stroke">{zh.dock.aprStroke}</span>
              <span
                className="apr-swatch"
                style={{ background: paintPreview(path.stroke.color, path.stroke.kind) }}
              />
              <span className="apr-base-meta">
                {path.stroke.kind === "none" || path.stroke.width <= 0 ? zh.dock.none : `${Math.round(path.stroke.width * 10) / 10} px`}
              </span>
            </div>
          </div>

          <div className="apr-section-label">
            <span>{zh.dock.aprStack}</span>
            <span className="apr-stack-count">{count}/{MAX_APPEARANCE}</span>
          </div>

          {count === 0 ? (
            <div className="apr-empty-stack">{zh.dock.aprEmptyStack}</div>
          ) : (
            <div className="apr-stack">
              {[...items].reverse().map((item) => (
                <AppearanceRow key={item.id} item={item} path={path} store={store} />
              ))}
            </div>
          )}

          <div className="apr-actions">
            <button type="button" className="apr-add-fill" disabled={count >= MAX_APPEARANCE} onClick={() => add("fill")}>
              ＋ {zh.dock.aprAddFill}
            </button>
            <button type="button" className="apr-add-stroke" disabled={count >= MAX_APPEARANCE} onClick={() => add("stroke")}>
              ＋ {zh.dock.aprAddStroke}
            </button>
          </div>
          <div className="apr-note">{formatText(zh.dock.aprLimit, { n: MAX_APPEARANCE })}</div>
        </>
      )}
    </div>
  );
}
