/** 顶栏菜单：点开浮层，键盘 Esc / 点外部关闭。 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuAction {
  label: string;
  key?: string;
  run?: () => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  sep?: boolean;
  children?: MenuAction[];
}

export interface MenuGroup {
  label: string;
  items: MenuAction[];
}

interface Props {
  groups: MenuGroup[];
  compact?: boolean;
}

export default function MenuBar({ groups, compact }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [sub, setSub] = useState<{ index: number; left: number; top: number } | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const subRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (open === null) return;
    const btn = barRef.current?.querySelectorAll<HTMLButtonElement>(".menubtn")[open];
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setPos({ left: Math.round(r.left), top: Math.round(r.bottom + 4) });
  }, [open]);

  useEffect(() => {
    if (open === null) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (barRef.current?.contains(t) || popRef.current?.contains(t) || subRef.current?.contains(t)) return;
      setOpen(null);
      setSub(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(null); setSub(null); }
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (a: MenuAction) => {
    if (a.disabled) return;
    setOpen(null);
    setSub(null);
    a.run?.();
  };

  const openSub = (a: MenuAction, index: number, el: HTMLElement) => {
    if (a.disabled || !a.children?.length) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.round(r.right + 2), Math.max(8, window.innerWidth - 224));
    const top = Math.min(Math.max(8, Math.round(r.top - 4)), Math.max(8, window.innerHeight - 156));
    setSub({ index, left, top });
  };

  return (
    <div className={"menubar" + (compact ? " is-compact" : "")} ref={barRef}>
      {groups.map((g, i) => (
        <button
          key={g.label}
          className={"menubtn" + (open === i ? " is-open" : "")}
          onClick={() => { setSub(null); setOpen(open === i ? null : i); }}
        >
          {g.label}
        </button>
      ))}

      {open !== null && (
        <div className="menu-pop" ref={popRef} style={{ left: pos.left, top: pos.top }}>
          {groups[open]?.items.map((a, idx) =>
            a.sep ? (
              <div className="menu-sep" key={`sep-${idx}`} />
            ) : (
              <button
                key={`${a.label}-${idx}`}
                className={"menu-item" + (a.danger ? " is-danger" : "") + (a.children?.length ? " has-sub" : "")}
                disabled={a.disabled}
                role={a.children?.length ? "menuitem" : a.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                aria-checked={a.children?.length ? undefined : a.checked}
                aria-haspopup={a.children?.length ? "menu" : undefined}
                aria-expanded={a.children?.length ? sub?.index === idx : undefined}
                onMouseEnter={(e) => {
                  if (a.children?.length) openSub(a, idx, e.currentTarget);
                }}
                onClick={(e) => {
                  if (a.children?.length) openSub(a, idx, e.currentTarget);
                  else run(a);
                }}
              >
                <span className="menu-item-check" aria-hidden>
                  {a.checked ? "✓" : ""}
                </span>
                <span className="menu-item-label">{a.label}</span>
                {a.children?.length ? <span className="menu-item-key">▸</span> : a.key && <span className="menu-item-key">{a.key}</span>}
              </button>
            ),
          )}
        </div>
      )}

      {open !== null && sub && groups[open]?.items[sub.index]?.children?.length ? (
        <div className="menu-pop menu-sub" ref={subRef} style={{ left: sub.left, top: sub.top }}>
          <div className="menu-sub-head">{groups[open].items[sub.index].label}</div>
          {groups[open].items[sub.index].children!.map((a, idx) =>
            a.sep ? (
              <div className="menu-sep" key={`sub-sep-${idx}`} />
            ) : (
              <button
                key={`${a.label}-${idx}`}
                className={"menu-item" + (a.danger ? " is-danger" : "")}
                disabled={a.disabled}
                role="menuitem"
                onClick={() => run(a)}
              >
                <span className="menu-item-check" aria-hidden>{a.checked ? "✓" : ""}</span>
                <span className="menu-item-label">{a.label}</span>
                {a.key && <span className="menu-item-key">{a.key}</span>}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
