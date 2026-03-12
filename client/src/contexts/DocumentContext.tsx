/**
 * DocumentContext - 抜粋した条文の管理
 * ドラッグ＆ドロップで配置された条文のリストを管理する
 * Undo/Redo履歴スタック付き
 */

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import type { DocumentArticle } from "@/lib/docx-generator";

interface HistoryEntry {
  articles: DocumentArticle[];
  label: string; // 操作の説明（例: "第一条を追加"）
}

interface DocumentContextType {
  /** ペーパーに配置された条文リスト */
  clippedArticles: DocumentArticle[];
  /** 条文を追加 */
  addArticle: (article: DocumentArticle) => void;
  /** 条文を削除 */
  removeArticle: (id: string) => void;
  /** 条文の順序を変更 */
  reorderArticles: (oldIndex: number, newIndex: number) => void;
  /** 全条文をクリア */
  clearArticles: () => void;
  /** ドキュメントタイトル */
  documentTitle: string;
  setDocumentTitle: (title: string) => void;
  /** Undo */
  undo: () => void;
  /** Redo */
  redo: () => void;
  /** Undo可能か */
  canUndo: boolean;
  /** Redo可能か */
  canRedo: boolean;
  /** 最後のUndo/Redo操作のラベル */
  lastUndoLabel: string;
  lastRedoLabel: string;
  /** 文書内検索クエリ */
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const DocumentContext = createContext<DocumentContextType | null>(null);

const MAX_HISTORY = 50;

export function DocumentProvider({ children }: { children: React.ReactNode }) {
  const [clippedArticles, setClippedArticles] = useState<DocumentArticle[]>([]);
  const [documentTitle, setDocumentTitle] = useState("条文抜粋");
  const [searchQuery, setSearchQuery] = useState("");

  // Undo/Redo stacks
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  // Push current state to undo stack before making changes
  const pushUndo = useCallback((label: string) => {
    setClippedArticles((current) => {
      undoStack.current.push({ articles: [...current], label });
      if (undoStack.current.length > MAX_HISTORY) {
        undoStack.current.shift();
      }
      // Clear redo stack on new action
      redoStack.current = [];
      setUndoCount(undoStack.current.length);
      setRedoCount(0);
      return current; // Don't change state here
    });
  }, []);

  const addArticle = useCallback((article: DocumentArticle) => {
    setClippedArticles((prev) => {
      // 重複チェック
      if (prev.some((a) => a.id === article.id)) return prev;
      // Push undo
      undoStack.current.push({ articles: [...prev], label: `${article.articleTitle}を追加` });
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
      setUndoCount(undoStack.current.length);
      setRedoCount(0);
      return [...prev, article];
    });
  }, []);

  const removeArticle = useCallback((id: string) => {
    setClippedArticles((prev) => {
      const article = prev.find((a) => a.id === id);
      const label = article ? `${article.articleTitle}を削除` : "条文を削除";
      undoStack.current.push({ articles: [...prev], label });
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
      setUndoCount(undoStack.current.length);
      setRedoCount(0);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const reorderArticles = useCallback((oldIndex: number, newIndex: number) => {
    setClippedArticles((prev) => {
      undoStack.current.push({ articles: [...prev], label: "順序を変更" });
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
      setUndoCount(undoStack.current.length);
      setRedoCount(0);
      const items = [...prev];
      const [removed] = items.splice(oldIndex, 1);
      items.splice(newIndex, 0, removed);
      return items;
    });
  }, []);

  const clearArticles = useCallback(() => {
    setClippedArticles((prev) => {
      if (prev.length === 0) return prev;
      undoStack.current.push({ articles: [...prev], label: "全てクリア" });
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
      setUndoCount(undoStack.current.length);
      setRedoCount(0);
      return [];
    });
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    setClippedArticles((current) => {
      const entry = undoStack.current.pop()!;
      redoStack.current.push({ articles: [...current], label: entry.label });
      setUndoCount(undoStack.current.length);
      setRedoCount(redoStack.current.length);
      return entry.articles;
    });
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    setClippedArticles((current) => {
      const entry = redoStack.current.pop()!;
      undoStack.current.push({ articles: [...current], label: entry.label });
      setUndoCount(undoStack.current.length);
      setRedoCount(redoStack.current.length);
      return entry.articles;
    });
  }, []);

  const canUndo = undoCount > 0;
  const canRedo = redoCount > 0;
  const lastUndoLabel = undoStack.current.length > 0 ? undoStack.current[undoStack.current.length - 1].label : "";
  const lastRedoLabel = redoStack.current.length > 0 ? redoStack.current[redoStack.current.length - 1].label : "";

  return (
    <DocumentContext.Provider
      value={{
        clippedArticles,
        addArticle,
        removeArticle,
        reorderArticles,
        clearArticles,
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
