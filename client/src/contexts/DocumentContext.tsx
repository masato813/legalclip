/**
 * DocumentContext - 抜粋した条文・見出し・メモの管理
 * ドラッグ＆ドロップで配置されたアイテムのリストを管理する
 * Undo/Redo履歴スタック付き
 */

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import type { DocumentArticle } from "@/lib/docx-generator";

// ============================
// Types
// ============================

/** テキストアノテーション（ハイライト・アンダーライン） */
export interface TextAnnotation {
  id: string;
  /** 対象テキスト */
  text: string;
  /** アノテーション種別 */
  type: "highlight" | "underline";
  /** ハイライト色（highlight のみ） */
  color?: "yellow" | "green" | "pink" | "blue";
}

/** 見出しブロック */
export interface HeadingBlock {
  kind: "heading";
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

/** メモブロック */
export interface MemoBlock {
  kind: "memo";
  id: string;
  text: string;
}

/** 条文ブロック（既存 DocumentArticle に kind と annotations を追加） */
export interface ArticleBlock extends DocumentArticle {
  kind: "article";
  /** テキストアノテーション（ハイライト・アンダーライン） */
  annotations?: TextAnnotation[];
}

/** ペーパー上のアイテム */
export type DocumentItem = ArticleBlock | HeadingBlock | MemoBlock;

// ============================
// Context type
// ============================

interface DocumentContextType {
  items: DocumentItem[];
  /** 末尾に条文を追加 */
  addArticle: (article: DocumentArticle) => void;
  /** 指定インデックスに条文を挿入 */
  insertArticleAt: (article: DocumentArticle, index: number) => void;
  /** 複数条文を一括追加 */
  addArticles: (articles: DocumentArticle[]) => void;
  /** 見出しブロックを挿入 */
  insertHeadingAt: (text: string, level: 1 | 2 | 3, index: number) => void;
  /** メモブロックを挿入 */
  insertMemoAt: (text: string, index: number) => void;
  /** ブロックを更新（見出し・メモのテキスト編集） */
  updateItem: (id: string, patch: Partial<HeadingBlock | MemoBlock | ArticleBlock>) => void;
  /** アノテーションを追加 */
  addAnnotation: (articleId: string, annotation: TextAnnotation) => void;
  /** アノテーションを削除 */
  removeAnnotation: (articleId: string, annotationId: string) => void;
  removeItem: (id: string) => void;
  reorderItems: (oldIndex: number, newIndex: number) => void;
  clearItems: () => void;
  documentTitle: string;
  setDocumentTitle: (title: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  lastUndoLabel: string;
  lastRedoLabel: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  // Legacy compat
  clippedArticles: ArticleBlock[];
  removeArticle: (id: string) => void;
  reorderArticles: (oldIndex: number, newIndex: number) => void;
  clearArticles: () => void;
}

const DocumentContext = createContext<DocumentContextType | null>(null);

const MAX_HISTORY = 50;

// ============================
// Provider
// ============================

export function DocumentProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [documentTitle, setDocumentTitle] = useState("条文抜粋");
  const [searchQuery, setSearchQuery] = useState("");

  const undoStack = useRef<{ items: DocumentItem[]; label: string }[]>([]);
  const redoStack = useRef<{ items: DocumentItem[]; label: string }[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const pushHistory = useCallback((current: DocumentItem[], label: string) => {
    undoStack.current.push({ items: current, label });
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    setUndoCount(undoStack.current.length);
    setRedoCount(0);
  }, []);

  const addArticle = useCallback((article: DocumentArticle) => {
    setItems((prev) => {
      if (prev.some((a) => a.id === article.id)) return prev;
      pushHistory(prev, `${article.articleTitle}を追加`);
      return [...prev, { ...article, kind: "article" as const }];
    });
  }, [pushHistory]);

  const insertArticleAt = useCallback((article: DocumentArticle, index: number) => {
    setItems((prev) => {
      if (prev.some((a) => a.id === article.id)) return prev;
      pushHistory(prev, `${article.articleTitle}を追加`);
      const next = [...prev];
      next.splice(index, 0, { ...article, kind: "article" as const });
      return next;
    });
  }, [pushHistory]);

  const addArticles = useCallback((articles: DocumentArticle[]) => {
    setItems((prev) => {
      const newItems = articles
        .filter((a) => !prev.some((p) => p.id === a.id))
        .map((a) => ({ ...a, kind: "article" as const }));
      if (newItems.length === 0) return prev;
      pushHistory(prev, `${newItems.length}条を一括追加`);
      return [...prev, ...newItems];
    });
  }, [pushHistory]);

  const insertHeadingAt = useCallback((text: string, level: 1 | 2 | 3, index: number) => {
    setItems((prev) => {
      const id = `heading-${Date.now()}`;
      pushHistory(prev, `見出しを追加`);
      const next = [...prev];
      next.splice(index, 0, { kind: "heading", id, text, level });
      return next;
    });
  }, [pushHistory]);

  const insertMemoAt = useCallback((text: string, index: number) => {
    setItems((prev) => {
      const id = `memo-${Date.now()}`;
      pushHistory(prev, `メモを追加`);
      const next = [...prev];
      next.splice(index, 0, { kind: "memo", id, text });
      return next;
    });
  }, [pushHistory]);

  const updateItem = useCallback((id: string, patch: Partial<HeadingBlock | MemoBlock | ArticleBlock>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } as DocumentItem : item)));
  }, []);

  const addAnnotation = useCallback((articleId: string, annotation: TextAnnotation) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== articleId || item.kind !== "article") return item;
        const existing = (item as ArticleBlock).annotations ?? [];
        return { ...item, annotations: [...existing, annotation] } as ArticleBlock;
      })
    );
  }, []);

  const removeAnnotation = useCallback((articleId: string, annotationId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== articleId || item.kind !== "article") return item;
        const existing = (item as ArticleBlock).annotations ?? [];
        return { ...item, annotations: existing.filter((a) => a.id !== annotationId) } as ArticleBlock;
      })
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((a) => a.id === id);
      const label = item?.kind === "article" ? `${item.articleTitle}を削除` : "ブロックを削除";
      pushHistory(prev, label);
      return prev.filter((a) => a.id !== id);
    });
  }, [pushHistory]);

  const reorderItems = useCallback((oldIndex: number, newIndex: number) => {
    setItems((prev) => {
      pushHistory(prev, "順序を変更");
      const next = [...prev];
      const [removed] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, removed);
      return next;
    });
  }, [pushHistory]);

  const clearItems = useCallback(() => {
    setItems((prev) => {
      if (prev.length === 0) return prev;
      pushHistory(prev, "全てクリア");
      return [];
    });
  }, [pushHistory]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    setItems((current) => {
      const entry = undoStack.current.pop()!;
      redoStack.current.push({ items: [...current], label: entry.label });
      setUndoCount(undoStack.current.length);
      setRedoCount(redoStack.current.length);
      return entry.items;
    });
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    setItems((current) => {
      const entry = redoStack.current.pop()!;
      undoStack.current.push({ items: [...current], label: entry.label });
      setUndoCount(undoStack.current.length);
      setRedoCount(redoStack.current.length);
      return entry.items;
    });
  }, []);

  const canUndo = undoCount > 0;
  const canRedo = redoCount > 0;
  const lastUndoLabel = undoStack.current.length > 0 ? undoStack.current[undoStack.current.length - 1].label : "";
  const lastRedoLabel = redoStack.current.length > 0 ? redoStack.current[redoStack.current.length - 1].label : "";

  // Legacy compat: clippedArticles = items filtered to articles
  const clippedArticles = items.filter((i): i is ArticleBlock => i.kind === "article");

  return (
    <DocumentContext.Provider
      value={{
        items,
        addArticle,
        insertArticleAt,
        addArticles,
        insertHeadingAt,
        insertMemoAt,
        updateItem,
        addAnnotation,
        removeAnnotation,
        removeItem,
        reorderItems,
        clearItems,
        documentTitle,
        setDocumentTitle,
        undo,
        redo,
        canUndo,
        canRedo,
        lastUndoLabel,
        lastRedoLabel,
        searchQuery,
        setSearchQuery,
        // Legacy compat
        clippedArticles,
        removeArticle: removeItem,
        reorderArticles: reorderItems,
        clearArticles: clearItems,
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
}

export function useDocument() {
  const ctx = useContext(DocumentContext);
  if (!ctx) throw new Error("useDocument must be used within DocumentProvider");
  return ctx;
}
