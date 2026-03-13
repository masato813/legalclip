/**
 * DocumentContext - 抜粋した条文の管理
 * ドラッグ＆ドロップで配置された条文のリストを管理する
 * Undo/Redo履歴スタック付き
 */

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import type { DocumentArticle } from "@/lib/docx-generator";

interface HistoryEntry {
  articles: DocumentArticle[];
  label: string;
}

interface DocumentContextType {
  clippedArticles: DocumentArticle[];
  addArticle: (article: DocumentArticle) => void;
  /** 指定インデックスに条文を挿入 */
  insertArticleAt: (article: DocumentArticle, index: number) => void;
  /** 複数条文を一括追加 */
  addArticles: (articles: DocumentArticle[]) => void;
  removeArticle: (id: string) => void;
  reorderArticles: (oldIndex: number, newIndex: number) => void;
  clearArticles: () => void;
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
}

const DocumentContext = createContext<DocumentContextType | null>(null);

const MAX_HISTORY = 50;

export function DocumentProvider({ children }: { children: React.ReactNode }) {
  const [clippedArticles, setClippedArticles] = useState<DocumentArticle[]>([]);
  const [documentTitle, setDocumentTitle] = useState("条文抜粋");
  const [searchQuery, setSearchQuery] = useState("");

  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const addArticle = useCallback((article: DocumentArticle) => {
    setClippedArticles((prev) => {
      if (prev.some((a) => a.id === article.id)) return prev;
      undoStack.current.push({ articles: [...prev], label: `${article.articleTitle}を追加` });
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
      setUndoCount(undoStack.current.length);
      setRedoCount(0);
      return [...prev, article];
    });
  }, []);

  const insertArticleAt = useCallback((article: DocumentArticle, index: number) => {
    setClippedArticles((prev) => {
      if (prev.some((a) => a.id === article.id)) return prev;
      undoStack.current.push({ articles: [...prev], label: `${article.articleTitle}を追加` });
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
      setUndoCount(undoStack.current.length);
      setRedoCount(0);
      const items = [...prev];
      items.splice(index, 0, article);
      return items;
    });
  }, []);

  const addArticles = useCallback((articles: DocumentArticle[]) => {
    setClippedArticles((prev) => {
      // 重複を除外
      const newArticles = articles.filter((a) => !prev.some((p) => p.id === a.id));
      if (newArticles.length === 0) return prev;
      undoStack.current.push({ articles: [...prev], label: `${newArticles.length}条を一括追加` });
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
      setUndoCount(undoStack.current.length);
      setRedoCount(0);
      return [...prev, ...newArticles];
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
        insertArticleAt,
        addArticles,
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
