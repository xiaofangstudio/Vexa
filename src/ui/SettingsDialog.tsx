/** 设置：一个面板管住主题、画布、导出与本地 MCP。 */
import { useState } from "react";
import { DEFAULT_SETTINGS, type VexaSettings } from "../stores/settings";
import "./SettingsDialog.css";

interface Props {
  settings: VexaSettings;
  theme: "light" | "dark";
  onChange: (patch: Partial<VexaSettings>) => void;
  onTheme: (t: "light" | "dark") => void;
  onReset: () => void;
  onClose: () => void;
}

const MCP_CMD = "node mcp/vexa-mcp.mjs";
const MCP_JSON = `{
  "mcpServers": {
    "vexa": {
      "command": "node",
      "args": ["D:/20533/deskbox/fangwork/Vexa/mcp/vexa-mcp.mjs"],
      "env": { "VEXA_MCP_ROOT": "D:/20533/deskbox/fangwork/Vexa" }
    }
  }
}`;

export default function SettingsDialog({ settings, theme, onChange, onTheme, onReset, onClose }: Props) {
  const [tab, setTab] = useState<"general" | "canvas" | "export" | "bridge">("general");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h3>设置</h3>
          <span className="settings-sub">改动即时生效，保存在本机</span>
          <button className="icon-btn" title="关闭" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="15" height="15">
              <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="1.6" fill="none" />
            </svg>
          </button>
        </div>

        <div className="settings-tabs">
          {(
            [
              ["general", "通用"],
              ["canvas", "画布"],
              ["export", "保存与导出"],
              ["bridge", "本地 MCP"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} className={`settings-tab${tab === id ? " is-on" : ""}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="settings-body">
          {tab === "general" && (
            <>
              <Row label="主题" note="浅色适合印刷校对，深色适合长时间画图">
                <Seg
                  value={theme}
                  options={[
                    ["light", "浅色"],
                    ["dark", "深色"],
                  ]}
                  onPick={(v) => onTheme(v as "light" | "dark")}
                />
              </Row>
              <Row label="启动动画" note="关闭后直接进入欢迎页">
                <Switch on={settings.splash} onToggle={() => onChange({ splash: !settings.splash })} />
              </Row>
              <Row label="界面密度" note="紧凑会让工具栏与面板的间距收窄">
                <Seg
                  value={settings.density}
                  options={[
                    ["comfortable", "宽松"],
                    ["compact", "紧凑"],
                  ]}
                  onPick={(v) => onChange({ density: v as VexaSettings["density"] })}
                />
              </Row>
              <Row label="空白画板提示" note="画板为空时显示快捷键提示">
                <Switch on={settings.welcomeHints} onToggle={() => onChange({ welcomeHints: !settings.welcomeHints })} />
              </Row>
            </>
          )}

          {tab === "canvas" && (
            <>
              <Row label="点阵网格" note="画板上的 16px 辅助网格，缩到 70% 以下自动隐藏">
                <Switch on={settings.grid} onToggle={() => onChange({ grid: !settings.grid })} />
              </Row>
              <Row label="拖动吸附整像素" note="移动与缩放落在整数坐标，导出更干净">
                <Switch on={settings.snap} onToggle={() => onChange({ snap: !settings.snap })} />
              </Row>
              <Row label="新建画板背景" note="只在新建工程时使用，已存在的画板不受影响">
                <input
                  className="settings-color"
                  type="color"
                  value={settings.defaultBg}
                  onChange={(e) => onChange({ defaultBg: e.target.value })}
                />
              </Row>
            </>
          )}

          {tab === "export" && (
            <>
              <Row label="自动保存" note="只在工程已保存过路径时生效，不会自动弹出另存为">
                <Seg
                  value={String(settings.autoSave)}
                  options={[
                    ["0", "关闭"],
                    ["30", "30 秒"],
                    ["120", "2 分钟"],
                    ["300", "5 分钟"],
                  ]}
                  onPick={(v) => onChange({ autoSave: Number(v) })}
                />
              </Row>
              <Row label="默认导出格式" note="导出面板会预选这一项">
                <Seg
                  value={settings.exportFmt}
                  options={[
                    ["svg", "SVG"],
                    ["png", "PNG"],
                    ["pdf", "PDF"],
                  ]}
                  onPick={(v) => onChange({ exportFmt: v as "svg" | "png" | "pdf" })}
                />
              </Row>
              <Row label="PNG 倍率" note="1x 为画板原始像素">
                <Seg
                  value={String(settings.exportScale)}
                  options={[
                    ["1", "1x"],
                    ["2", "2x"],
                    ["3", "3x"],
                    ["4", "4x"],
                  ]}
                  onPick={(v) => onChange({ exportScale: Number(v) })}
                />
              </Row>
            </>
          )}

          {tab === "bridge" && (
            <>
              <div className="settings-block">
                <div className="settings-block-title">Vexa MCP · 本地桥</div>
                <p className="settings-note">
                  随工程自带一个本地 MCP 服务（stdio 传输，只读写本机 <code>.vex</code> 文件，不联网、不调用任何
                  AI）。任何支持 MCP 的编辑器 / 助手都能读工程结构、加形状、改颜色、导出 SVG。
                </p>
                <div className="settings-code">
                  <code>{MCP_CMD}</code>
                  <button className="btn btn-ghost btn-sm" onClick={() => void copy(MCP_CMD, "cmd")}>
                    {copied === "cmd" ? "已复制" : "复制"}
                  </button>
                </div>
              </div>
              <div className="settings-block">
                <div className="settings-block-title">客户端配置</div>
                <div className="settings-code settings-code-multi">
                  <pre>{MCP_JSON}</pre>
                  <button className="btn btn-ghost btn-sm" onClick={() => void copy(MCP_JSON, "json")}>
                    {copied === "json" ? "已复制" : "复制"}
                  </button>
                </div>
                <p className="settings-note">
                  自检：<code>node mcp/vexa-mcp.mjs --selftest</code>；工具清单见 <code>mcp/README.md</code>。
                </p>
              </div>
              <div className="settings-block">
                <div className="settings-block-title">安全边界</div>
                <ul className="settings-list">
                  <li>路径必须是绝对路径、以 <code>.vex</code> 结尾，且落在 <code>VEXA_MCP_ROOT</code> 之内。</li>
                  <li>只做工程读写与几何运算，不执行脚本、不访问网络。</li>
                  <li>服务不常驻后台，由客户端按需拉起。</li>
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="settings-foot">
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (window.confirm("恢复全部默认设置？界面会立刻还原。")) onReset();
            }}
          >
            恢复默认
          </button>
          <span className="settings-foot-note">默认：自动保存 2 分钟 · 网格关 · 吸附开 · 导出 SVG 2x</span>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>
            完成
          </button>
        </div>
        <div className="settings-version num">Vexa 0.1.0 · 默认值 {DEFAULT_SETTINGS.autoSave}s 自动保存</div>
      </div>
    </div>
  );
}

function Row({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <span className="settings-label">{label}</span>
        {note && <span className="settings-note">{note}</span>}
      </div>
      <div className="settings-row-ctl">{children}</div>
    </div>
  );
}

function Seg({
  value,
  options,
  onPick,
}: {
  value: string;
  options: [string, string][];
  onPick: (v: string) => void;
}) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={`seg-item${value === v ? " is-on" : ""}`} onClick={() => onPick(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button className={`switch${on ? " is-on" : ""}`} role="switch" aria-checked={on} onClick={onToggle}>
      <span className="switch-knob" />
    </button>
  );
}


