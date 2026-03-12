/**
 * Outline - 右サイドバー（アウトライン + プロパティ）
 * Design: エディトリアル × ワークスペース — 参考デザインに準拠
 * タブ: アウトライン / プロパティ
 */

import { useState } from "react";
import { useDocument } from "@/contexts/DocumentContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Bookmark, X, Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type TabType = "outline" | "properties";

export default function Outline() {
  const { clippedArticles, removeArticle, documentTitle, setDocumentTitle } = useDocument();
  const [activeTab, setActiveTab] = useState<TabType>("outline");

  // Group by law
  const lawGroups = new Map<string, typeof clippedArticles>();
  for (const article of clippedArticles) {
    if (!lawGroups.has(article.lawTitle)) {
      lawGroups.set(article.lawTitle, []);
    }
    lawGroups.get(article.lawTitle)!.push(article);
  }

  // Unique law titles
  const uniqueLaws = Array.from(new Set(clippedArticles.map((a) => a.lawTitle)));

  // Global index counter
  let globalIndex = 0;

  return (
    <div className="h-full flex flex-col bg-sidebar">
      {/* Tab header */}
      <div className="flex border-b border-sidebar-border shrink-0">
        <button
          onClick={() => setActiveTab("outline")}
          className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
            activeTab === "outline"
              ? "border-b-2 border-vermillion text-vermillion bg-vermillion/5"
              : "border-b-2 border-transparent text-muted-foreground hover:text-ink"
          }`}
        >
          アウトライン
        </button>
        <button
          onClick={() => setActiveTab("properties")}
          className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
            activeTab === "properties"
              ? "border-b-2 border-vermillion text-vermillion bg-vermillion/5"
              : "border-b-2 border-transparent text-muted-foreground hover:text-ink"
          }`}
        >
          プロパティ
        </button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 custom-scrollbar">
        <div className="p-3">
          <AnimatePresence mode="wait">
            {activeTab === "outline" ? (
              <motion.div
                key="outline"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {clippedArticles.length === 0 ? (
                  <div className="text-center py-10">
                    <FileText className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">
                      条文を追加するとここに表示されます
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {Array.from(lawGroups.entries()).map(([lawTitle, articles]) => (
                      <div key={lawTitle}>
                        {/* Law group header */}
                        <div className="flex items-center gap-1.5 mb-1.5 px-1">
                          <Bookmark className="w-3 h-3 text-vermillion shrink-0" />
                          <span className="text-[11px] font-semibold text-ink truncate font-[var(--font-serif)]">
                            {lawTitle}
                          </span>
                        </div>

                        {/* Articles in this law */}
                        <AnimatePresence>
                          {articles.map((article) => {
                            globalIndex++;
                            const idx = globalIndex;
                            return (
                              <motion.div
                                key={article.id}
                                initial={{ opacity: 0, x: 8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -8, height: 0 }}
                                className="group flex items-center gap-2 py-1.5 px-2 ml-1 rounded-lg hover:bg-muted/50 transition-colors"
                              >
                                <span className="text-[10px] font-bold text-vermillion w-6 shrink-0 text-right tabular-nums">
                                  {String(idx).padStart(2, "0")}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-ink truncate font-[var(--font-sans)] font-medium">
                                    {article.articleTitle}
                                  </p>
                                  {article.articleCaption && (
                                    <p className="text-[10px] text-muted-foreground truncate">
                                      {article.articleCaption}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => removeArticle(article.id)}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
                                  title="削除"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="properties"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                {/* Document title */}
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold block mb-1.5">
                    ドキュメント名
                  </label>
                  <input
                    value={documentTitle}
                    onChange={(e) => setDocumentTitle(e.target.value)}
                    className="w-full text-sm font-medium text-ink bg-muted/30 border border-border rounded-md px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-vermillion/30 transition-all"
                    placeholder="ドキュメントタイトル"
                  />
                </div>

                {/* Stats */}
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold block mb-2">
                    統計
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/30 rounded-md p-2.5 text-center">
                      <p className="text-xl font-bold text-ink tabular-nums">{clippedArticles.length}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">抜粋条文数</p>
                    </div>
                    <div className="bg-muted/30 rounded-md p-2.5 text-center">
                      <p className="text-xl font-bold text-ink tabular-nums">{uniqueLaws.length}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">参照法令数</p>
                    </div>
                  </div>
                </div>

                {/* Related laws */}
                {uniqueLaws.length > 0 && (
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold block mb-2">
                      参照法令
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {uniqueLaws.map((law) => (
                        <span
                          key={law}
                          className="flex items-center gap-1 px-2 py-1 bg-muted/50 rounded text-[10px] text-ink font-medium border border-border/50"
                        >
                          <Tag className="w-2.5 h-2.5 text-vermillion" />
                          {law}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Created date */}
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold block mb-1.5">
                    作成日
                  </label>
                  <p className="text-sm font-medium text-ink">
                    {new Date().toLocaleDateString("ja-JP", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>

                {/* Status */}
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold block mb-1.5">
                    ステータス
                  </label>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    草案作成中
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}
