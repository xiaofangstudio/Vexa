/** Vexa AI 面板：离线中文设计指令，所有改动走现有撤销栈。 */
import { useEffect, useRef, useState } from "react";
import { runAiCommand, type AiReply } from "../ai/commands";
import type { Paint, Stroke } from "../core/types";
import type { DocStore } from "../stores/docStore";
import Icon from "./Icon";
import "./AiPanel.css";

interface Props {
  ids: string[];
  boardIndex: number;
  fill: Paint;
  stroke: Stroke;
  store: DocStore;
  onSelect: (ids: string[]) => void;
  onToast: (msg: string) => void;
}

interface Message {
  id: number;
  role: "user" | "ai";
  text: string;
}

const CHIPS = ["生成卡片", "生成海报", "画一个红色圆角矩形", "撤销"];

let msgSeq = 1;

export default function AiPanel({ ids, boardIndex, fill, stroke, store, onSelect, onToast }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "ai",
      text: "本地设计助手。试试“画一个 300×200 的红色圆角矩形”“改成蓝色”“生成卡片”。不联网，不上传工程。",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const overflow = el.scrollHeight - el.clientHeight;
    if (overflow > 2) {
      el.scrollTop = el.scrollHeight;
      setAtTop(false);
    } else {
      setAtTop(true);
    }
  }, [messages, busy]);

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text) return;
    setInput("");
    setMessages((m) => [...m.slice(-28), { id: msgSeq++, role: "user", text }]);
    setBusy(true);
    // 让用户看到“思考”状态，同时保持主线程不会被长任务卡住。
    window.setTimeout(() => {
      const before = store.snapshot();
      let reply: AiReply;
      try {
        reply = runAiCommand(text, { doc: store.doc, selected: ids, boardIndex, fill, stroke });
        store.finish(before);
        if (reply.action === "undo") store.undo();
        else if (reply.action === "redo") store.redo();
        else if (reply.action === "selectAll") onSelect(store.doc.root.slice());
        else if (reply.action === "clearSelection") onSelect([]);
        if (reply.selected) onSelect(reply.selected);
        if (reply.toast) onToast(reply.toast);
      } catch (err) {
        reply = { handled: false, message: `执行失败：${(err as Error).message ?? err}` };
      }
      setMessages((m) => [...m.slice(-28), { id: msgSeq++, role: "ai", text: reply.message }]);
      setBusy(false);
    }, 60);
  };

  return (
    <div className="ai-panel">
      <div className="ai-head">
        <span className="ai-mark"><Icon name="spark" size={15} /></span>
        <span className="ai-title">Vexa AI</span>
        <span className="ai-badge">本地</span>
        <span className="ai-ctx faint">已选 {ids.length}</span>
      </div>
      <p className="ai-sub">用一句话画图、改色、排布。不上传工程，不联网。</p>

      <div className="ai-chips">
        {CHIPS.map((c) => (
          <button key={c} type="button" className="ai-chip" onClick={() => send(c)} disabled={busy}>
            {c}
          </button>
        ))}
      </div>

      <div className="ai-log-wrap">
        {!atTop && <div className="ai-log-fade" aria-hidden />}
        <div
          className="ai-log"
          aria-live="polite"
          ref={logRef}
          onScroll={(e) => setAtTop(e.currentTarget.scrollTop < 2)}
        >
          {messages.map((m) => (
            <div key={m.id} className={`ai-msg ${m.role}`}>
              <div className="ai-msg-role">{m.role === "user" ? "你" : "Vexa AI"}</div>
              <div className="ai-msg-text">{m.text}</div>
            </div>
          ))}
          {busy && (
            <div className="ai-msg ai">
              <div className="ai-msg-role">Vexa AI</div>
              <div className="ai-msg-text ai-typing"><i /><i /><i /></div>
            </div>
          )}
        </div>
      </div>

      <div className="ai-compose">
        <textarea
          className="ai-input"
          value={input}
          placeholder="例如：画一个 300×200 的红色圆角矩形，然后写上“让想法变成矢量”"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send();
            }
          }}
          rows={3}
        />
        <div className="ai-compose-foot">
          <span className="faint">Ctrl+Enter 发送</span>
          <button type="button" className="btn btn-primary ai-send" onClick={() => send()} disabled={busy || !input.trim()}>
            发送
          </button>
        </div>
      </div>
      <div className="ai-foot faint">离线意图引擎 · 每条改动只进一次撤销栈 · 复杂需求可以说“帮助”</div>
    </div>
  );
}
