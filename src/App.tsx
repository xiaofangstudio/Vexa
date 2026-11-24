import { useCallback, useEffect, useRef, useState } from "react";
import Splash from "./ui/Splash";
import StartPage from "./ui/StartPage";
import EditorShell from "./ui/EditorShell";
import AboutDialog from "./ui/AboutDialog";
import SettingsDialog from "./ui/SettingsDialog";
import { zh, useTheme } from "./i18n/zh";
import { addNode, createDoc, newId } from "./core/docOps";
import { parseVex } from "./core/vex";
import { svgIntrinsicSize, svgToNodes } from "./core/svg";
import { onExternalOpen, readLaunchIntent } from "./core/launch";
import type { VexaDoc } from "./core/types";
import { makeThumb, pickVexOpen, readImageDataURL, readTextFile } from "./engine/io";
import { pushRecent } from "./stores/recent";
import { applyDensity, loadSettings, resetSettings, saveSettings, type VexaSettings } from "./stores/settings";

export default function App() {
  const { theme, setTheme, toggle } = useTheme();
  const [settings, setSettings] = useState<VexaSettings>(() => loadSettings());
  const [splash, setSplash] = useState(() => loadSettings().splash);
  const [doc, setDoc] = useState<VexaDoc | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [docKey, setDocKey] = useState(0);
  const [pendingTrace, setPendingTrace] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const [bootReady, setBootReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const settingsRef = useRef(settings);
  const docRef = useRef<VexaDoc | null>(null);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const confirmReplace = useCallback((source: string): boolean => {
    const current = docRef.current;
    if (!current) return true;
    return window.confirm(
      `当前已打开「${current.name || "未命名工程"}」。打开${source}会替换当前工程，未保存的修改会丢失。继续？`,
    );
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    applyDensity(settings);
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!doc) return;
    document.title = `${doc.name} · Vexa`;
  }, [doc]);

  const patchSettings = useCallback((patch: Partial<VexaSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const doResetSettings = useCallback(() => {
    setSettings(resetSettings());
  }, []);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const closeDoc = useCallback(() => {
    if (!doc || closing) return;
    setClosing(true);
    window.clearTimeout(closeTimer.current);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    closeTimer.current = window.setTimeout(() => {
      setDoc(null);
      setPath(null);
      setPendingTrace(null);
      setClosing(false);
    }, reduceMotion ? 0 : 170);
  }, [doc, closing]);

  const openFile = async (p: string) => {
    setClosing(false);
    window.clearTimeout(closeTimer.current);
    try {
      const text = await readTextFile(p);
      const d = parseVex(text);
      setDoc(d);
      setPath(p);
      setDocKey((k) => k + 1);
      setPendingTrace(null);
      void makeThumb(d).then((thumb) =>
        pushRecent({ path: p, name: d.name, w: d.artboards[0]?.w ?? 0, h: d.artboards[0]?.h ?? 0, when: Date.now(), thumb }),
      );
    } catch (e) {
      setBootError(zh.vex.openFail.replace("{msg}", String((e as Error).message ?? e)));
    }
  };

  const startOpen = async () => {
    const p = await pickVexOpen();
    if (p && confirmReplace("另一个 Vexa 工程")) await openFile(p);
  };

  const importSvgLaunch = async (p: string) => {
    setClosing(false);
    window.clearTimeout(closeTimer.current);
    const svg = await readTextFile(p);
    const size = svgIntrinsicSize(svg);
    const file = p.split(/[\\/]/).pop() ?? "SVG 导入";
    const name = file.replace(/\.[^.]+$/, "") || "SVG 导入";
    const d = createDoc(name, size.w, size.h, settingsRef.current.defaultBg);
    const { nodes, roots, nextSeq } = svgToNodes(svg, d.seq, "导入路径");
    if (!nodes.length) throw new Error("SVG 里没有可编辑的图形或文字");
    d.seq = nextSeq;
    for (const node of nodes) d.nodes[node.id] = node;
    d.root = roots;
    setDoc(d);
    setPath(null);
    setDocKey((k) => k + 1);
    setPendingTrace(null);
  };

  const openExternal = async (p: string) => {
    const ext = p.split(".").pop()?.toLowerCase();
    if (ext === "vex") {
      if (confirmReplace("另一个 Vexa 工程")) await openFile(p);
      return;
    }
    if (ext === "svg") {
      if (!confirmReplace("外部 SVG 文件")) return;
      await importSvgLaunch(p);
      return;
    }
    throw new Error("Vexa 只接 .vex 工程和 .svg 矢量文件");
  };

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const intent = await readLaunchIntent();
        if (!cancelled && intent.kind === "file") await openExternal(intent.path);
      } catch (e) {
        if (!cancelled) setBootError(`外部打开失败：${String((e as Error).message ?? e)}`);
      } finally {
        if (!cancelled) setBootReady(true);
      }
      if (!cancelled) {
        unlisten = await onExternalOpen((p) => {
          if (!cancelled) void openExternal(p);
        });
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
    // 启动意图只在首帧读一次；后续外部打开走 single-instance 事件。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = (name: string, w: number, h: number) => {
    setClosing(false);
    window.clearTimeout(closeTimer.current);
    const d = createDoc(name, w, h, settings.defaultBg);
    setDoc(d);
    setPath(null);
    setDocKey((k) => k + 1);
    setPendingTrace(null);
  };

  const importAs = async (p: string, mode: "image" | "trace") => {
    setClosing(false);
    window.clearTimeout(closeTimer.current);
    try {
      const img = await readImageDataURL(p);
      const name = p.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? zh.doc.untitled;
      const w = Math.min(img.w, 8000);
      const h = Math.min(img.h, 8000);
      const d = createDoc(name, w, h, settings.defaultBg);
      const id = newId(d, "im");
      addNode(d, {
        kind: "image",
        id,
        name: "图片",
        src: img.dataUrl,
        x: 0,
        y: 0,
        w,
        h,
        opacity: 1,
        visible: true,
        locked: false,
      });
      setDoc(d);
      setPath(null);
      setPendingTrace(mode === "trace" ? p : null);
    } catch (e) {
      setBootError(`导入失败：${String((e as Error).message ?? e)}`);
    }
  };

  const onSaved = (p: string, d: VexaDoc) => {
    setPath(p);
    setDoc(d);
    void makeThumb(d).then((thumb) =>
      pushRecent({ path: p, name: d.name, w: d.artboards[0]?.w ?? 0, h: d.artboards[0]?.h ?? 0, when: Date.now(), thumb }),
    );
  };

  if (splash) return <Splash onDone={() => setSplash(false)} />;
  if (!bootReady) return <div className="app-bg" />;

  return (
    <>
      <div className="app-bg" />
      {doc ? (
        <EditorShell
          key={docKey}
          initialDoc={doc}
          initialPath={path}
          theme={theme}
          onToggleTheme={toggle}
          settings={settings}
          onSettings={() => setSettingsOpen(true)}
          onSettingsChange={patchSettings}
          closing={closing}
          onExit={closeDoc}
          onOpenRequest={() => void startOpen()}
          onSaved={onSaved}
          pendingTrace={pendingTrace}
        />
      ) : (
        <StartPage
          theme={theme}
          settings={settings}
          onToggleTheme={toggle}
          onCreate={create}
          onOpenFile={(p) => void openFile(p)}
          onImportImage={(p, mode) => void importAs(p, mode)}
          onSettings={() => setSettingsOpen(true)}
          onAbout={() => setAbout(true)}
        />
      )}
      {about && <AboutDialog onClose={() => setAbout(false)} />}
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          theme={theme}
          onChange={patchSettings}
          onTheme={setTheme}
          onReset={doResetSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {bootError && (
        <div className="modal-mask" onClick={() => setBootError(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>打不开</h3>
            </div>
            <div className="modal-body">
              <p>{bootError}</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={() => setBootError(null)}>
                好的
              </button>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <div className="modal-mask" onClick={() => setNotice(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{notice.title}</h3>
            </div>
            <div className="modal-body">
              <p style={{ whiteSpace: "pre-line" }}>{notice.body}</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={() => setNotice(null)}>
                好的
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
