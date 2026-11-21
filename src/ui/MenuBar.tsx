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
  const barRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

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
      if (barRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
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
    a.run?.();
  };

  return (
    <div className={"menubar" + (compact ? " is-compact" : "")} ref={barRef}>
      {groups.map((g, i) => (
        <button
          key={g.label}
          className={"menubtn" + (open === i ? " is-open" : "")}
          onClick={() => setOpen(open === i ? null : i)}
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
                className={"menu-item" + (a.danger ? " is-danger" : "")}
                disabled={a.disabled}
                role={a.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                aria-checked={a.checked}
                onClick={() => run(a)}
              >
                <span className="menu-item-check" aria-hidden>
                  {a.checked ? "✓" : ""}
                </span>
                <span className="menu-item-label">{a.label}</span>
                {a.key && <span className="menu-item-key">{a.key}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
