/**
 * LawSearch - 法令検索サイドバー
 * Design: エディトリアル × ワークスペース — 参考デザインに準拠
 * 白背景、クリーンなリスト表示
 * 改善: スクロール修正、条文フィルタ検索
 */

import { useState, useCallback, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  BookOpen,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Loader2,
  GripVertical,
  LibraryBig,
  RefreshCw,
  Star,
  History,
  Filter,
  X,
  Download,
} from "lucide-react";
import {
  searchLaws,
  getLawData,
  extractArticles,
  extractStructure,
  extractLawTitle,
  type LawListItem,
  type ParsedArticle,
  type LawStructure,
  type LawFullTextNode,
} from "@/lib/egov-api";
import { useDocument } from "@/contexts/DocumentContext";
import type { DocumentArticle } from "@/lib/docx-generator";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

type ViewState = "search" | "articles";

const QUICK_ACCESS_LAWS = [
  { name: "民法", query: "民法" },
  { name: "刑法", query: "刑法" },
  { name: "行政手続法", query: "行政手続法" },
  { name: "地方自治法", query: "地方自治法" },
];

interface LawSearchProps {
  onDownloadFullLaw?: (lawTitle: string, lawNum: string, articles: ParsedArticle[], lawFullText: LawFullTextNode) => void;
}

export default function LawSearch({ onDownloadFullLaw }: LawSearchProps) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LawListItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [viewState, setViewState] = useState<ViewState>("search");
  const [selectedLaw, setSelectedLaw] = useState<LawListItem | null>(null);
  const [lawTitle, setLawTitle] = useState("");
  const [lawNum, setLawNum] = useState("");
  const [structures, setStructures] = useState<LawStructure[]>([]);
  const [allArticles, setAllArticles] = useState<ParsedArticle[]>([]);
  const [isLoadingLaw, setIsLoadingLaw] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [totalCount, setTotalCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [articleFilter, setArticleFilter] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [lawFullTextData, setLawFullTextData] = useState<LawFullTextNode | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { addArticle, clippedArticles } = useDocument();

  const handleSearch = useCallback(async (overrideQuery?: string) => {
    const q = overrideQuery ?? query;
    if (!q.trim()) return;
    setIsSearching(true);
    setHasSearched(true);
    try {
      const result = await searchLaws(q.trim(), undefined, 30);
      setSearchResults(result.laws);
      setTotalCount(result.total_count);
      if (overrideQuery) setQuery(overrideQuery);
    } catch (err) {
      console.error("検索エラー:", err);
      toast.error("検索に失敗しました");
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleSelectLaw = useCallback(async (law: LawListItem) => {
    setSelectedLaw(law);
    setIsLoadingLaw(true);
    try {
      const data = await getLawData(law.law_info.law_id);
      const title = extractLawTitle(data.law_full_text);
      const articles = extractArticles(data.law_full_text);
      const struct = extractStructure(data.law_full_text);
      setLawTitle(title || law.revision_info.law_title);
      setLawNum(law.law_info.law_num);
      setAllArticles(articles);
      setStructures(struct);
      setLawFullTextData(data.law_full_text);
      setViewState("articles");
      setArticleFilter("");
      setShowFilter(false);
      // Auto-expand first structure
      if (struct.length > 0) {
        const firstKey = `/${struct[0].tag}-${struct[0].num}-${struct[0].title}`;
        setExpandedSections(new Set([firstKey]));
      }
    } catch (err) {
      console.error("法令取得エラー:", err);
      toast.error("法令の取得に失敗しました");
    } finally {
      setIsLoadingLaw(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    setViewState("search");
    setSelectedLaw(null);
    setStructures([]);
    setAllArticles([]);
    setExpandedSections(new Set());
    setArticleFilter("");
    setShowFilter(false);
    setLawFullTextData(null);
  }, []);

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleAddArticle = useCallback(
    (article: ParsedArticle) => {
      const docArticle: DocumentArticle = {
        id: `${selectedLaw?.law_info.law_id}-${article.articleNum}`,
        lawTitle: lawTitle,
        lawNum: lawNum,
        articleTitle: article.articleTitle,
        articleCaption: article.articleCaption,
        paragraphs: article.paragraphs,
      };
      addArticle(docArticle);
      toast.success(`${article.articleTitle} を追加しました`);
    },
    [addArticle, selectedLaw, lawTitle, lawNum]
  );

  const isArticleClipped = useCallback(
    (article: ParsedArticle) => {
      const id = `${selectedLaw?.law_info.law_id}-${article.articleNum}`;
      return clippedArticles.some((a) => a.id === id);
    },
    [clippedArticles, selectedLaw]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, article: ParsedArticle) => {
      const docArticle: DocumentArticle = {
        id: `${selectedLaw?.law_info.law_id}-${article.articleNum}`,
        lawTitle: lawTitle,
        lawNum: lawNum,
        articleTitle: article.articleTitle,
        articleCaption: article.articleCaption,
        paragraphs: article.paragraphs,
      };
      e.dataTransfer.setData("application/json", JSON.stringify(docArticle));
      e.dataTransfer.effectAllowed = "copy";
    },
    [selectedLaw, lawTitle, lawNum]
  );

  // Filter articles by article number or caption
  const matchesFilter = useCallback((article: ParsedArticle) => {
    if (!articleFilter.trim()) return true;
    const f = articleFilter.trim().toLowerCase();
    return (
      article.articleTitle.toLowerCase().includes(f) ||
      article.articleCaption.toLowerCase().includes(f) ||
      article.articleNum.includes(f)
    );
  }, [articleFilter]);

  // Filter structures recursively
  const filterStructure = useCallback((struct: LawStructure): LawStructure | null => {
    if (!articleFilter.trim()) return struct;
    
    const filteredArticles = struct.articles.filter(matchesFilter);
    const filteredChildren = struct.children
      .map(filterStructure)
      .filter((c): c is LawStructure => c !== null);
    
    if (filteredArticles.length === 0 && filteredChildren.length === 0) return null;
    
    return { ...struct, articles: filteredArticles, children: filteredChildren };
  }, [articleFilter, matchesFilter]);

  // Filtered structures
  const filteredStructures = useMemo(() => {
    if (!articleFilter.trim()) return structures;
    return structures
      .map(filterStructure)
      .filter((s): s is LawStructure => s !== null);
  }, [structures, articleFilter, filterStructure]);

  // Filtered flat articles
  const filteredArticles = useMemo(() => {
    if (!articleFilter.trim()) return allArticles;
    return allArticles.filter(matchesFilter);
  }, [allArticles, articleFilter, matchesFilter]);

  // Handle full law download
  const handleFullLawDownload = useCallback(() => {
    if (onDownloadFullLaw && lawFullTextData) {
      onDownloadFullLaw(lawTitle, lawNum, allArticles, lawFullTextData);
    }
  }, [onDownloadFullLaw, lawTitle, lawNum, allArticles, lawFullTextData]);

  const renderArticleCard = (article: ParsedArticle, index: number) => {
    const clipped = isArticleClipped(article);
    const firstParagraph = article.paragraphs[0];
    const previewText = firstParagraph?.sentences.join("").slice(0, 70) || "";

    return (
      <motion.div
        key={article.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.025, 0.25) }}
        draggable={!clipped}
        onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, article)}
        className={`article-card group relative rounded-md border p-2.5 mb-1.5 transition-all ${
          clipped
            ? "bg-primary/5 border-primary/20 opacity-70"
            : "bg-white border-slate-200 hover:border-primary/30 hover:bg-primary/5 cursor-grab active:cursor-grabbing"
        }`}
      >
        {!clipped && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="w-3.5 h-3.5 text-primary" />
          </div>
        )}
        <div className="pr-5">
          {article.articleCaption && (
            <span className="text-[10px] font-medium text-vermillion mb-0.5 block">
              {article.articleCaption}
            </span>
          )}
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-ink font-[var(--font-serif)]">
              {article.articleTitle}
            </span>
            {clipped && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold shrink-0">
                追加済
              </span>
            )}
          </div>
          {previewText && (
            <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
              {previewText}...
            </p>
          )}
        </div>
        {!clipped && (
          <button
            onClick={() => handleAddArticle(article)}
            className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity
                       text-[10px] px-2 py-0.5 rounded bg-primary text-white hover:bg-primary/90 font-bold"
          >
            追加
          </button>
        )}
      </motion.div>
    );
  };

  const renderStructure = (struct: LawStructure, depth = 0, parentKey = ""): React.ReactNode => {
    const sectionKey = `${parentKey}/${struct.tag}-${struct.num}-${struct.title}`;
    // Auto-expand when filtering
    const isExpanded = articleFilter.trim() ? true : expandedSections.has(sectionKey);
    const hasContent = struct.articles.length > 0 || struct.children.length > 0;

    return (
      <div key={sectionKey} className="mb-0.5">
        <button
          onClick={() => toggleSection(sectionKey)}
          className={`w-full flex items-center gap-1.5 py-2 px-3 rounded-lg text-left hover:bg-slate-50 transition-colors ${
            depth === 0 ? "font-semibold text-sm" : "text-xs font-medium"
          }`}
          style={{ paddingLeft: `${depth * 12 + 12}px` }}
        >
          {hasContent ? (
            isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform" />
            )
          ) : (
            <span className="w-3.5" />
          )}
          <span className="text-slate-700 truncate">{struct.title}</span>
          {struct.articles.length > 0 && (
            <span className="ml-auto text-[10px] text-slate-400 shrink-0">
              {struct.articles.length}条
            </span>
          )}
        </button>
        <AnimatePresence>
          {isExpanded && hasContent && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div
                className="mt-1 space-y-0 border-l-2 border-slate-100 pl-2"
                style={{ marginLeft: `${depth * 12 + 20}px` }}
              >
                {struct.articles.map((article, i) => renderArticleCard(article, i))}
              </div>
              {struct.children.map((child, idx) => renderStructure(child, depth + 1, `${sectionKey}-${idx}`))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 shrink-0">
        {viewState === "search" ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <LibraryBig className="w-4 h-4 text-primary" />
                法律・条文
              </h3>
              <button
                className="text-slate-400 hover:text-primary transition-colors"
                onClick={() => {
                  setSearchResults([]);
                  setHasSearched(false);
                  setQuery("");
                  toast.info("リセットしました");
                }}
                title="リセット"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors w-4 h-4" />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="法令名、キーワード"
                className="pl-9 bg-slate-100 border-none rounded-lg text-sm focus-visible:ring-2 focus-visible:ring-primary/20 h-9"
              />
            </div>
          </>
        ) : (
          <div>
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary transition-colors mb-3"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              検索に戻る
            </button>
            {selectedLaw && (
              <div>
                <h3 className="text-sm font-bold text-ink font-[var(--font-serif)] leading-tight">
                  {lawTitle}
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">{lawNum}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-slate-500">全{allArticles.length}条</p>
                  <div className="flex items-center gap-1">
                    {onDownloadFullLaw && (
                      <button
                        onClick={handleFullLawDownload}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary transition-colors font-medium flex items-center gap-1"
                        title="この法令の全文をダウンロード"
                      >
                        <Download className="w-3 h-3" />
                        全文DL
                      </button>
                    )}
                    <button
                      onClick={() => setShowFilter(!showFilter)}
                      className={`text-[10px] px-2 py-0.5 rounded transition-colors font-medium flex items-center gap-1 ${
                        showFilter || articleFilter
                          ? "bg-primary/10 text-primary"
                          : "bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary"
                      }`}
                      title="条文を絞り込み"
                    >
                      <Filter className="w-3 h-3" />
                      絞り込み
                    </button>
                  </div>
                </div>
                {/* Article filter input */}
                <AnimatePresence>
                  {showFilter && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="relative mt-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                        <input
                          value={articleFilter}
                          onChange={(e) => setArticleFilter(e.target.value)}
                          placeholder="条文番号・見出しで絞り込み（例: 第百条）"
                          className="w-full pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary/30 outline-none transition-all"
                          autoFocus
                        />
                        {articleFilter && (
                          <button
                            onClick={() => setArticleFilter("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {articleFilter && (
                        <p className="text-[10px] text-primary mt-1">
                          {filteredArticles.length}件の条文が該当
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content - native scroll instead of ScrollArea for reliable scrolling */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ minHeight: 0 }}
      >
        <div className="p-2">
          {viewState === "search" && (
            <>
              {isSearching && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              )}

              {!isSearching && !hasSearched && (
                <>
                  {/* Quick access */}
                  <div className="mb-4">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      クイックアクセス
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/5 text-primary cursor-pointer hover:bg-primary/10 transition-colors"
                      onClick={() => toast.info("お気に入り機能は準備中です")}>
                      <Star className="w-4 h-4" />
                      <span className="text-sm font-medium">お気に入り</span>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-600 cursor-pointer transition-colors"
                      onClick={() => toast.info("履歴機能は準備中です")}>
                      <History className="w-4 h-4" />
                      <span className="text-sm font-medium">履歴</span>
                    </div>
                  </div>

                  {/* Suggested laws */}
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      よく使われる法令
                    </div>
                    {QUICK_ACCESS_LAWS.map((law) => (
                      <button
                        key={law.name}
                        onClick={() => handleSearch(law.query)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors text-left"
                      >
                        <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-sm font-medium">{law.name}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 ml-auto" />
                      </button>
                    ))}
                  </div>
                </>
              )}

              {!isSearching && hasSearched && searchResults.length === 0 && (
                <div className="text-center py-8">
                  <BookOpen className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">該当する法令が見つかりません</p>
                </div>
              )}

              {!isSearching && searchResults.length > 0 && (
                <>
                  <p className="text-[10px] text-slate-400 mb-2 px-1">
                    {totalCount}件中 {searchResults.length}件を表示
                  </p>
                  {searchResults.map((law, i) => (
                    <motion.button
                      key={law.law_info.law_id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.015 }}
                      onClick={() => handleSelectLaw(law)}
                      disabled={isLoadingLaw}
                      className="w-full text-left p-2.5 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 mb-1 transition-all group"
                    >
                      <div className="flex items-start gap-2">
                        <BookOpen className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0 group-hover:text-primary transition-colors" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink truncate font-[var(--font-serif)]">
                            {law.revision_info.law_title}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {law.law_info.law_num}
                          </p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </motion.button>
                  ))}
                </>
              )}
            </>
          )}

          {viewState === "articles" && (
            <>
              {isLoadingLaw && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  <span className="text-xs text-slate-400 ml-2">読み込み中...</span>
                </div>
              )}

              {!isLoadingLaw && filteredStructures.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-2 px-3">
                    条文をドラッグして右のペーパーにドロップ、または「追加」ボタンをクリック
                  </p>
                  {filteredStructures.map((struct, idx) => renderStructure(struct, 0, `root-${idx}`))}
                </div>
              )}

              {!isLoadingLaw && filteredStructures.length === 0 && filteredArticles.length > 0 && (
                <div className="px-2">
                  <p className="text-[10px] text-slate-400 mb-2">
                    条文をドラッグして右のペーパーにドロップ
                  </p>
                  {filteredArticles.map((article, i) => renderArticleCard(article, i))}
                </div>
              )}

              {!isLoadingLaw && articleFilter && filteredArticles.length === 0 && (
                <div className="text-center py-8">
                  <Filter className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">「{articleFilter}」に該当する条文がありません</p>
                  <button
                    onClick={() => setArticleFilter("")}
                    className="text-xs text-primary mt-2 hover:underline"
                  >
                    フィルタをクリア
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
