/**
 * DocumentContext - 抜粋した条文の管理
 * ドラッグ＆ドロップで配置された条文のリストを管理する
 */

import React, { createContext, useContext, useState, useCallback } from "react";
import type { DocumentArticle } from "@/lib/docx-generator";

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
}

const DocumentContext = createContext<DocumentContextType | null>(null);

export function DocumentProvider({ children }: { children: React.ReactNode }) {
  const [clippedArticles, setClippedArticles] = useState<DocumentArticle[]>([]);
  const [documentTitle, setDocumentTitle] = useState("条文抜粋");

  const addArticle = useCallback((article: DocumentArticle) => {
    setClippedArticles((prev) => {
      // 重複チェック
      if (prev.some((a) => a.id === article.id)) return prev;
      return [...prev, article];
    });
  }, []);

  const removeArticle = useCallback((id: string) => {
    setClippedArticles((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const reorderArticles = useCallback((oldIndex: number, newIndex: number) => {
    setClippedArticles((prev) => {
      const items = [...prev];
      const [removed] = items.splice(oldIndex, 1);
      items.splice(newIndex, 0, removed);
      return items;
    });
  }, []);

  const clearArticles = useCallback(() => {
    setClippedArticles([]);
  }, []);

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
