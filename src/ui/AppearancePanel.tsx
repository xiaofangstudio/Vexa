/** 外观面板：在路径/文字底层填充/描边之上叠加多层填充与描边，可显隐、排序、调透明度。 */
import { zh } from "../i18n/zh";
import type { AppearanceItem, Node, PathNode, TextNode, VexaDoc } from "../core/types";
import {
  MAX_APPEARANCE,
  addAppearance,
  appearanceOf,
  moveAppearance,
  removeAppearance,
  updateAppearance,
} from "../core/appearance";
import type { DocStore } from "../stores/docStore";
import { expandAppearance } from "../core/expandAppearance";

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

function paintPreview(color: string, kind: string): string {
  if (kind === "none") return "transparent";
  if (kind === "linear" || kind === "radial") return `linear-gradient(135deg, ${color} 0 48%, #ffffff 48% 52%, ${color} 52% 100%)`;
  if (kind === "pattern") return `repeating-linear-gradient(45deg, ${color} 0 4px, #ffffff 4px 8px)`;
  return color;
}

function AppearanceRow({
  item,
  nodeId,
  store,
}: {
  item: AppearanceItem;
  nodeId: string;
  store: DocStore;
}) {
  const fill = item.kind === "fill" ? item.fill : undefined;
  const stroke = item.kind === "stroke" ? item.stroke : undefined;
  const color = item.kind === "fill" ? fill?.color ?? "#111319" : stroke?.color ?? "#111319";
  const solid = item.kind === "fill" ? fill?.kind === "solid" : stroke?.kind === "solid";
  const label = item.kind === "fill" ? zh.dock.aprFill : zh.dock.aprStroke;

  const commit = (patch: Parameters<typeof updateAppearance>[2]) => {
    store.commit((d) => {
      const node = d.nodes[nodeId];
      if (node) updateAppearance(node, item.id, patch);
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
              const node = d.nodes[nodeId];
              if (node) moveAppearance(node, item.id, 1);
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
              const node = d.nodes[nodeId];
              if (node) moveAppearance(node, item.id, -1);
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
            const node = d.nodes[nodeId];
            if (node) removeAppearance(node, item.id);
          });
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function AppearancePanel({ doc, store, ids, onSay, onSelect }: Props) {
  const node = ids.length === 1 ? doc.nodes[ids[0]] : undefined;
  const host: PathNode | TextNode | undefined = node?.kind === "path" || node?.kind === "text" ? node : undefined;
  const items = host ? appearanceOf(host) : [];
  const count = items.length;
  const baseStroke = host?.stroke;

  const add = (kind: "fill" | "stroke") => {
    if (!host) return;
    let ok = false;
    let error = "";
    store.commit((d) => {
      const hit: Node | undefined = d.nodes[host.id];
      if (!hit) return;
      const res = addAppearance(hit, kind);
      ok = res.ok;
      error = res.error ?? "";
    });
    if (ok) onSay(formatText(zh.dock.aprAdded, { n: kind === "fill" ? zh.dock.aprFill : zh.dock.aprStroke }));
    else if (error) onSay(error);
  };

  const expand = () => {
    if (!host || !count) return;
    let groups: string[] = [];
    let layers = 0;
    store.commit((d) => {
      const res = expandAppearance(d, [host.id]);
      groups = res.groups;
      layers = res.layers;
    });
    if (groups.length) {
      onSelect(groups);
      onSay(formatText(zh.dock.aprExpandDone, { n: groups.length, m: layers }));
    } else {
      onSay(zh.dock.aprEmptyStack);
    }
  };

  return (
    <div className="apr-panel">
      <div className="apr-head">
        <span className="apr-title">{zh.dock.appearancePanel}</span>
        <span className={"apr-count" + (count ? " has" : "")}>{count}/{MAX_APPEARANCE}</span>
      </div>

      {!host ? (
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
                style={{ background: paintPreview(host.fill.color, host.fill.kind) }}
              />
              <span className="apr-base-meta">
                {host.fill.kind === "none"
                  ? zh.dock.none
                  : host.fill.kind === "solid"
                    ? host.fill.color.toUpperCase()
                    : host.fill.kind === "pattern"
                      ? zh.dock.patterns
                      : zh.dock.aprGradient}
              </span>
            </div>
            <div className="apr-base-row">
              <span className="apr-eye is-static">◉</span>
              <span className="apr-type apr-type-stroke">{zh.dock.aprStroke}</span>
              <span
                className="apr-swatch"
                style={{ background: baseStroke ? paintPreview(baseStroke.color, baseStroke.kind) : "transparent", borderStyle: baseStroke ? "solid" : "dashed" }}
              />
              <span className="apr-base-meta">
                {!baseStroke || baseStroke.kind === "none" || baseStroke.width <= 0 ? zh.dock.none : `${Math.round(baseStroke.width * 10) / 10} px`}
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
                <AppearanceRow key={item.id} item={item} nodeId={host.id} store={store} />
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
          <button type="button" className="apr-expand" disabled={count === 0} onClick={expand} title="把底层填充、描边与每层叠加拆成组内独立图层">
            {zh.dock.aprExpand}
          </button>
          <div className="apr-note">{formatText(zh.dock.aprLimit, { n: MAX_APPEARANCE })}</div>
        </>
      )}
    </div>
  );
}
