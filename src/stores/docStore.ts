/** 文档状态 + 撤销栈。
 *
 * 设计：文档对象在 ref 里原地修改（拖拽时零拷贝），版本号驱动重渲染；
 * 撤销栈存 JSON 快照，栈深 200，任何一次 commit 都进栈。
 */
import { useCallback, useRef, useState } from "react";
import type { VexaDoc } from "../core/types";

export interface DocStore {
  doc: VexaDoc;
  version: number;
  commit: (fn: (doc: VexaDoc) => void) => void;
  live: (fn: (doc: VexaDoc) => void) => void;
  snapshot: () => string;
  finish: (before: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (next: VexaDoc) => void;
  touch: () => void;
  /** 画布专用订阅：live 只通知这里，不触发 React 壳层重渲染。 */
  subscribeCanvas: (fn: () => void) => () => void;
}

const clone = (d: VexaDoc): VexaDoc => JSON.parse(JSON.stringify(d)) as VexaDoc;

export function useDocStore(initial: VexaDoc): DocStore {
  const docRef = useRef<VexaDoc>(initial);
  const undoRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const [, setVersion] = useState(0);
  const versionRef = useRef(0);
  const canvasSubsRef = useRef(new Set<() => void>());

  const notifyCanvas = useCallback(() => {
    for (const fn of canvasSubsRef.current) fn();
  }, []);

  const subscribeCanvas = useCallback((fn: () => void) => {
    canvasSubsRef.current.add(fn);
    return () => {
      canvasSubsRef.current.delete(fn);
    };
  }, []);

  const bump = useCallback(() => {
    versionRef.current += 1;
    setVersion(versionRef.current);
    notifyCanvas();
  }, [notifyCanvas]);

  const snapshot = useCallback(() => JSON.stringify(docRef.current), []);

  const commit = useCallback(
    (fn: (doc: VexaDoc) => void) => {
      undoRef.current.push(snapshot());
      if (undoRef.current.length > 200) undoRef.current.shift();
      redoRef.current = [];
      fn(docRef.current);
      bump();
    },
    [snapshot, bump],
  );

  const live = useCallback(
    (fn: (doc: VexaDoc) => void) => {
      fn(docRef.current);
      // 关键：拖拽 / 连续输入不增加 UI 版本，只通知画布重绘，
      // 避免 EditorShell、Dock、菜单和图层树每帧重建。
      notifyCanvas();
    },
    [notifyCanvas],
  );

  const finish = useCallback(
    (before: string) => {
      if (JSON.stringify(docRef.current) === before) return;
      undoRef.current.push(before);
      if (undoRef.current.length > 200) undoRef.current.shift();
      redoRef.current = [];
      bump();
    },
    [bump],
  );

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(JSON.stringify(docRef.current));
    docRef.current = JSON.parse(prev) as VexaDoc;
    bump();
  }, [bump]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(JSON.stringify(docRef.current));
    docRef.current = JSON.parse(next) as VexaDoc;
    bump();
  }, [bump]);

  const reset = useCallback(
    (next: VexaDoc) => {
      undoRef.current = [];
      redoRef.current = [];
      docRef.current = next;
      bump();
    },
    [bump],
  );

  const touch = useCallback(() => bump(), [bump]);

  return {
    doc: docRef.current,
    version: versionRef.current,
    commit,
    live,
    snapshot,
    finish,
    undo,
    redo,
    canUndo: undoRef.current.length > 0,
    canRedo: redoRef.current.length > 0,
    reset,
    touch,
    subscribeCanvas,
  };
}

export { clone };
