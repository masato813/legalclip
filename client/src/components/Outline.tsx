/**
 * Outline - 右サイドバー（アウトライン + 検索 + プロパティ）
 * Design: エディトリアル × ワークスペース
 * タブ: アウトライン / 検索 / プロパティ
 */

import { useState, useMemo, useCallback } from "react";
import { useDocument } from "@/contexts/DocumentContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Bookmark, X, Tag, Search, ArrowDown, ArrowUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type TabType = "outline" | "search" | "properties";

export default function Outline() {
  const { clippedArticles, removeArticle, documentTitle, setDocumentTitle, searchQuery, setSearchQuery } = useDocument();
  const [activeTab, setActiveTab] = useState<TabType>("outline");
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

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

  // Search matches
  const searchMatches = useMemo(() => {
    if (!localSearchQuery.trim()) return [];
    const q = localSearchQuery.trim().toLowerCase();
    const matches: { articleId: string; articleTitle: string; lawTitle: string; context: string }[] = [];
    for (const article of clippedArticles) {
      for (const para of article.paragraphs) {
        const text = para.sentences.join("");
        const lowerText = text.toLowerCase();
        const idx = lowerText.indexOf(q);
        if (idx !== -1) {
          const start = Math.max(0, idx - 20);
          const end = Math.min(text.length, idx + q.length + 30);
          const context = (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
          matches.push({
            articleId: article.id,
            articleTitle: article.articleTitle,
            lawTitle: article.lawTitle,
            context,
          });
          break; // One match per article
        }
        for (const item of para.items) {
          const itemText = item.sentences.join("");
          const lowerItemText = itemText.toLowerCase();
          const itemIdx = lowerItemText.indexOf(q);
          if (itemIdx !== -1) {
            const start = Math.max(0, itemIdx - 20);
            const end = Math.min(itemText.length, itemIdx + q.length + 30);
            const context = (start > 0 ? "..." : "") + itemText.slice(start, end) + (end < itemText.length ? "..." : "");
            matches.push({
              articleId: article.id,
              articleTitle: article.articleTitle,
              lawTitle: article.lawTitle,
              context,
            });
            break;
          }
        }
      }
    }
    return matches;
  }, [localSearchQuery, clippedArticles]);

  const handleSearch = useCallback(() => {
    setSearchQuery(localSearchQuery.trim());
    setCurrentMatchIndex(0);
  }, [localSearchQuery, setSearchQuery]);

  const handleClearSearch = useCallback(() => {
    setLocalSearchQuery("");
    setSearchQuery("");
    setCurrentMatchIndex(0);
  }, [setSearchQuery]);

  const handleNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % searchMatches.length);
  }, [searchMatches.length]);

  const handlePrevMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
  }, [searchMatches.length]);

  // Highlight search query in context text
  const highlightContext = (context: string) => {
    if (!localSearchQuery.trim()) return context;
    const q = localSearchQuery.trim();
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = context.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-amber-200 text-ink rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="h-full flex flex-col bg-sidebar">
      {/* Tab header */}
      <div className="flex border-b border-sidebar-border shrink-0">
        <button
          onClick={() => setActiveTab("outline")}
          className={`flex-1 py-2.5 text-[11px] font-bold transition-colors ${
            activeTab === "outline"
              ? "border-b-2 border-vermillion text-vermillion bg-vermillion/5"
              : "border-b-2 border-transparent text-muted-foreground hover:text-ink"
          }`}
        >
          アウトライン
        </button>
        <button
          onClick={() => setActiveTab("search")}
          className={`flex-1 py-2.5 text-[11px] font-bold transition-colors flex items-center justify-center gap-1 ${
            activeTab === "search"
              ? "border-b-2 border-vermillion text-vermillion bg-vermillion/5"
              : "border-b-2 border-transparent text-muted-foreground hover:text-ink"
          }`}
        >
          <Search className="w-3 h-3" />
          検索
        </button>
        <button
          onClick={() => setActiveTab("properties")}
          className={`flex-1 py-2.5 text-[11px] font-bold transition-colors ${
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
                        <div className="flex items-center gap-1.5 mb-1.5 px-1">
                          <Bookmark className="w-3 h-3 text-vermillion shrink-0" />
                          <span className="text-[11px] font-semibold text-ink truncate font-[var(--font-serif)]">
                            {lawTitle}
                          </span>
                        </div>
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
            ) : activeTab === "search" ? (
              <motion.div
                key="search"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* Search input */}
                <div className="mb-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      value={localSearchQuery}
                      onChange={(e) => setLocalSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSearch();
                        if (e.key === "Escape") handleClearSearch();
                      }}
                      placeholder="文書内を検索..."
                      className="w-full pl-8 pr-8 py-1.5 bg-muted/30 border border-border rounded-md text-xs focus:ring-2 focus:ring-vermillion/20 focus:border-vermillion/30 outline-none transition-all"
                      autoFocus={activeTab === "search"}
                    />
                    {localSearchQuery && (
                      <button
                        onClick={handleClearSearch}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Search controls */}
                  {searchQuery && searchMatches.length > 0 && (
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-muted-foreground">
                        {searchMatches.length}件の条文でヒット
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {currentMatchIndex + 1}/{searchMatches.length}
                        </span>
                        <button
                          onClick={handlePrevMatch}
                          className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-ink transition-colors"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={handleNextMatch}
                          className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-ink transition-colors"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {searchQuery && searchMatches.length === 0 && (
                    <p className="text-[10px] text-muted-foreground mt-2">
                      「{searchQuery}」に一致する条文はありません
                    </p>
                  )}
                </div>

                {/* Search results */}
                {searchMatches.length > 0 && (
                  <div className="space-y-1">
                    {searchMatches.map((match, i) => (
                      <motion.div
                        key={`${match.articleId}-${i}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={`p-2 rounded-lg border transition-all cursor-pointer ${
                          i === currentMatchIndex
                            ? "border-vermillion/30 bg-vermillion/5"
                            : "border-transparent hover:bg-muted/50"
                        }`}
                        onClick={() => setCurrentMatchIndex(i)}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-vermillion/8 text-vermillion font-semibold">
                            {match.lawTitle}
                          </span>
                          <span className="text-[11px] font-semibold text-ink">
                            {match.articleTitle}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {highlightContext(match.context)}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Empty state */}
                {!searchQuery && clippedArticles.length === 0 && (
                  <div className="text-center py-10">
                    <Search className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">
                      条文を追加してから検索できます
                    </p>
                  </div>
                )}

                {!searchQuery && clippedArticles.length > 0 && (
                  <div className="text-center py-6">
                    <Search className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-[11px] text-muted-foreground">
                      キーワードを入力してEnterで検索
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      ペーパー内の条文テキストからキーワードをハイライト表示します
                    </p>
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
