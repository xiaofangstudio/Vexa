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
}

const clone = (d: VexaDoc): VexaDoc => JSON.parse(JSON.stringify(d)) as VexaDoc;

export function useDocStore(initial: VexaDoc): DocStore {
  const docRef = useRef<VexaDoc>(initial);
  const undoRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const [, setVersion] = useState(0);
  const versionRef = useRef(0);

  const bump = useCallback(() => {
    versionRef.current += 1;
    setVersion(versionRef.current);
  }, []);

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
      bump();
    },
    [bump],
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
  };
}

export { clone };
