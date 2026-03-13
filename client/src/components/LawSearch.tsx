/**
 * LawSearch - 法令検索サイドバー
 * Design: エディトリアル × ワークスペース
 * 機能: お気に入り・履歴（localStorage）、条文フィルタ、章単位一括追加、項単位の部分選択
 */

import { useState, useCallback, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
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
  Trash2,
  Clock,
  PlusSquare,
  ListChecks,
  Check,
  CheckSquare,
  Square,
  ChevronsUpDown,
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
import { useFavorites, useHistory } from "@/hooks/useLocalStorage";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

type ViewState = "search" | "articles" | "favorites" | "history";

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
  const [currentLawId, setCurrentLawId] = useState<string>("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Paragraph selection state
  const [paragraphSelectArticle, setParagraphSelectArticle] = useState<ParsedArticle | null>(null);
  const [selectedParagraphs, setSelectedParagraphs] = useState<Set<number>>(new Set());

  // Article expand state (for showing full preview text)
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

  const { addArticle, addArticles, clippedArticles } = useDocument();
  const { favorites, addFavorite, removeFavorite, isFavorite } = useFavorites();
  const { history, addToHistory, clearHistory } = useHistory();

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
      setViewState("search");
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
    setCurrentLawId(law.law_info.law_id);
    try {
      const data = await getLawData(law.law_info.law_id);
      const title = extractLawTitle(data.law_full_text) || law.revision_info.law_title;
      const articles = extractArticles(data.law_full_text);
      const struct = extractStructure(data.law_full_text);
      setLawTitle(title);
      setLawNum(law.law_info.law_num);
      setAllArticles(articles);
      setStructures(struct);
      setLawFullTextData(data.law_full_text);
      setViewState("articles");
      setArticleFilter("");
      setShowFilter(false);
      addToHistory(law.law_info.law_id, title, law.law_info.law_num);
      if (struct.length > 0) {
        const firstKey = `root-0/${struct[0].tag}-${struct[0].num}-${struct[0].title}`;
        setExpandedSections(new Set([firstKey]));
      }
      setExpandedArticles(new Set());
    } catch (err) {
      console.error("法令取得エラー:", err);
      toast.error("法令の取得に失敗しました");
    } finally {
      setIsLoadingLaw(false);
    }
  }, [addToHistory]);

  const handleLoadLawById = useCallback(async (lawId: string, title: string, num: string) => {
    setIsLoadingLaw(true);
    setCurrentLawId(lawId);
    try {
      const data = await getLawData(lawId);
      const extractedTitle = extractLawTitle(data.law_full_text) || title;
      const articles = extractArticles(data.law_full_text);
      const struct = extractStructure(data.law_full_text);
      setLawTitle(extractedTitle);
      setLawNum(num);
      setAllArticles(articles);
      setStructures(struct);
      setLawFullTextData(data.law_full_text);
      setSelectedLaw(null);
      setViewState("articles");
      setArticleFilter("");
      setShowFilter(false);
      addToHistory(lawId, extractedTitle, num);
      if (struct.length > 0) {
        const firstKey = `root-0/${struct[0].tag}-${struct[0].num}-${struct[0].title}`;
        setExpandedSections(new Set([firstKey]));
      }
      setExpandedArticles(new Set());
    } catch (err) {
      console.error("法令取得エラー:", err);
      toast.error("法令の取得に失敗しました");
    } finally {
      setIsLoadingLaw(false);
    }
  }, [addToHistory]);

  const handleBack = useCallback(() => {
    setViewState("search");
    setSelectedLaw(null);
    setStructures([]);
    setAllArticles([]);
    setExpandedSections(new Set());
    setArticleFilter("");
    setShowFilter(false);
    setLawFullTextData(null);
    setCurrentLawId("");
    setParagraphSelectArticle(null);
  }, []);

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const makeLawId = useCallback((articleNum: string, paragraphSuffix?: string) => {
    const base = `${currentLawId || selectedLaw?.law_info.law_id}-${articleNum}`;
    return paragraphSuffix ? `${base}-p${paragraphSuffix}` : base;
  }, [currentLawId, selectedLaw]);

  const toDocArticle = useCallback((article: ParsedArticle, selectedParaIndices?: Set<number>): DocumentArticle => {
    const paragraphs = selectedParaIndices
      ? article.paragraphs.filter((_, i) => selectedParaIndices.has(i))
      : article.paragraphs;

    // If partial selection, create a unique ID with paragraph info
    const id = selectedParaIndices && selectedParaIndices.size < article.paragraphs.length
      ? makeLawId(article.articleNum, Array.from(selectedParaIndices).sort().join(","))
      : makeLawId(article.articleNum);

    return {
      id,
      lawTitle: lawTitle,
      lawNum: lawNum,
      articleTitle: article.articleTitle,
      articleCaption: article.articleCaption,
      paragraphs,
    };
  }, [makeLawId, lawTitle, lawNum]);

  const handleAddArticle = useCallback(
    (article: ParsedArticle) => {
      addArticle(toDocArticle(article));
      toast.success(`${article.articleTitle} を追加しました`);
    },
    [addArticle, toDocArticle]
  );

  /** 項選択ダイアログを開く */
  const openParagraphSelector = useCallback((article: ParsedArticle) => {
    setParagraphSelectArticle(article);
    // Default: all paragraphs selected
    setSelectedParagraphs(new Set(article.paragraphs.map((_, i) => i)));
  }, []);

  /** 項選択ダイアログを閉じる */
  const closeParagraphSelector = useCallback(() => {
    setParagraphSelectArticle(null);
    setSelectedParagraphs(new Set());
  }, []);

  /** 選択した項のみ追加 */
  const handleAddSelectedParagraphs = useCallback(() => {
    if (!paragraphSelectArticle || selectedParagraphs.size === 0) return;
    const docArticle = toDocArticle(paragraphSelectArticle, selectedParagraphs);
    addArticle(docArticle);
    const count = selectedParagraphs.size;
    const total = paragraphSelectArticle.paragraphs.length;
    if (count === total) {
      toast.success(`${paragraphSelectArticle.articleTitle}（全${total}項）を追加しました`);
    } else {
      toast.success(`${paragraphSelectArticle.articleTitle}（${count}/${total}項）を追加しました`);
    }
    closeParagraphSelector();
  }, [paragraphSelectArticle, selectedParagraphs, toDocArticle, addArticle, closeParagraphSelector]);

  /** 項のチェックボックスをトグル */
  const toggleParagraph = useCallback((index: number) => {
    setSelectedParagraphs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  /** 全選択/全解除 */
  const toggleAllParagraphs = useCallback(() => {
    if (!paragraphSelectArticle) return;
    setSelectedParagraphs((prev) => {
      if (prev.size === paragraphSelectArticle.paragraphs.length) {
        return new Set();
      }
      return new Set(paragraphSelectArticle.paragraphs.map((_, i) => i));
    });
  }, [paragraphSelectArticle]);

  /** 章・節内の全条文を再帰的に収集 */
  const collectAllArticles = useCallback((struct: LawStructure): ParsedArticle[] => {
    const result: ParsedArticle[] = [...struct.articles];
    for (const child of struct.children) {
      result.push(...collectAllArticles(child));
    }
    return result;
  }, []);

  /** 章単位の一括追加 */
  const handleBulkAddSection = useCallback(
    (struct: LawStructure) => {
      const allSectionArticles = collectAllArticles(struct);
      if (allSectionArticles.length === 0) {
        toast.info("この章には条文がありません");
        return;
      }
      const docArticles = allSectionArticles.map((a) => toDocArticle(a));
      addArticles(docArticles);
      const addedCount = docArticles.filter(
        (a) => !clippedArticles.some((c) => c.id === a.id)
      ).length;
      if (addedCount > 0) {
        toast.success(`${struct.title}から${addedCount}条を追加しました`);
      } else {
        toast.info("全て追加済みです");
      }
    },
    [collectAllArticles, toDocArticle, addArticles, clippedArticles]
  );

  const isArticleClipped = useCallback(
    (article: ParsedArticle) => {
      const id = makeLawId(article.articleNum);
      return clippedArticles.some((a) => a.id === id || a.id.startsWith(id));
    },
    [clippedArticles, makeLawId]
  );

  /** セクション内の追加済み条文数を計算 */
  const countClippedInSection = useCallback(
    (struct: LawStructure): number => {
      let count = struct.articles.filter(isArticleClipped).length;
      for (const child of struct.children) {
        count += countClippedInSection(child);
      }
      return count;
    },
    [isArticleClipped]
  );

  /** セクション内の全条文数を計算 */
  const countTotalInSection = useCallback(
    (struct: LawStructure): number => {
      let count = struct.articles.length;
      for (const child of struct.children) {
        count += countTotalInSection(child);
      }
      return count;
    },
    []
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, article: ParsedArticle) => {
      const docArticle = toDocArticle(article);
      e.dataTransfer.setData("application/json", JSON.stringify(docArticle));
      e.dataTransfer.effectAllowed = "copy";
    },
    [toDocArticle]
  );

  const matchesFilter = useCallback((article: ParsedArticle) => {
    if (!articleFilter.trim()) return true;
    const f = articleFilter.trim().toLowerCase();
    return (
      article.articleTitle.toLowerCase().includes(f) ||
      article.articleCaption.toLowerCase().includes(f) ||
      article.articleNum.includes(f)
    );
  }, [articleFilter]);

  const filterStructure = useCallback((struct: LawStructure): LawStructure | null => {
    if (!articleFilter.trim()) return struct;
    const filteredArticles = struct.articles.filter(matchesFilter);
    const filteredChildren = struct.children.map(filterStructure).filter((c): c is LawStructure => c !== null);
    if (filteredArticles.length === 0 && filteredChildren.length === 0) return null;
    return { ...struct, articles: filteredArticles, children: filteredChildren };
  }, [articleFilter, matchesFilter]);

  // 全セクションキーを収集するヘルパー
  const collectAllSectionKeys = useCallback((structs: LawStructure[], parentKey = ""): string[] => {
    const keys: string[] = [];
    for (const struct of structs) {
      const key = `${parentKey}/${struct.tag}-${struct.num}-${struct.title}`;
      keys.push(key);
      if (struct.children.length > 0) {
        keys.push(...collectAllSectionKeys(struct.children, key));
      }
    }
    return keys;
  }, []);

  const handleExpandAll = useCallback(() => {
    const allKeys = structures.flatMap((struct, idx) => collectAllSectionKeys([struct], `root-${idx}`));
    setExpandedSections(new Set(allKeys));
    // Also expand all article cards to show full preview text
    setExpandedArticles(new Set(allArticles.map((a) => a.id)));
  }, [structures, allArticles, collectAllSectionKeys]);

  const handleCollapseAll = useCallback(() => {
    setExpandedSections(new Set());
    setExpandedArticles(new Set());
  }, []);

  const isAllExpanded = useMemo(() => {
    if (structures.length === 0) return false;
    const allKeys = structures.flatMap((struct, idx) => collectAllSectionKeys([struct], `root-${idx}`));
    return allKeys.every((k) => expandedSections.has(k));
  }, [structures, expandedSections, collectAllSectionKeys]);

  const filteredStructures = useMemo(() => {
    if (!articleFilter.trim()) return structures;
    return structures.map(filterStructure).filter((s): s is LawStructure => s !== null);
  }, [structures, articleFilter, filterStructure]);

  const filteredArticles = useMemo(() => {
    if (!articleFilter.trim()) return allArticles;
    return allArticles.filter(matchesFilter);
  }, [allArticles, articleFilter, matchesFilter]);

  const handleFullLawDownload = useCallback(() => {
    if (onDownloadFullLaw && lawFullTextData) {
      onDownloadFullLaw(lawTitle, lawNum, allArticles, lawFullTextData);
    }
  }, [onDownloadFullLaw, lawTitle, lawNum, allArticles, lawFullTextData]);

  const handleToggleFavorite = useCallback(() => {
    if (!currentLawId) return;
    if (isFavorite(currentLawId)) {
      removeFavorite(currentLawId);
      toast.info("お気に入りから削除しました");
    } else {
      addFavorite(currentLawId, lawTitle, lawNum);
      toast.success("お気に入りに追加しました");
    }
  }, [currentLawId, isFavorite, removeFavorite, addFavorite, lawTitle, lawNum]);

  // ============================
  // Render helpers
  // ============================

  const renderArticleCard = (article: ParsedArticle, index: number) => {
    const clipped = isArticleClipped(article);
    const isArticleExpanded = expandedArticles.has(article.id);
    // Build full preview text from all paragraphs
    const fullPreviewText = article.paragraphs
      .map((p) => {
        const num = p.paragraphNum ? `${p.paragraphNum}\u3000` : "";
        return num + p.sentences.join("");
      })
      .join("\n");
    const shortPreviewText = article.paragraphs[0]?.sentences.join("").slice(0, 70) || "";
    const hasParagraphs = article.paragraphs.length > 1;

    const toggleArticleExpand = (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedArticles((prev) => {
        const next = new Set(prev);
        if (next.has(article.id)) next.delete(article.id);
        else next.add(article.id);
        return next;
      });
    };

    return (
      <motion.div
        key={article.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.025, 0.25) }}
        draggable={!clipped && !isArticleExpanded}
        onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, article)}
        className={`article-card group relative rounded-md border p-2.5 mb-1.5 transition-all ${
          clipped
            ? "bg-primary/5 border-primary/20 opacity-70"
            : "bg-white border-slate-200 hover:border-primary/30 hover:bg-primary/5 cursor-grab active:cursor-grabbing"
        }`}
      >
        {!clipped && !isArticleExpanded && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="w-3.5 h-3.5 text-primary" />
          </div>
        )}
        <div className="pr-5" onClick={toggleArticleExpand} style={{cursor: 'pointer'}}>
          {article.articleCaption && (
            <span className="text-[10px] font-medium text-vermillion mb-0.5 block">
              {article.articleCaption}
            </span>
          )}
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-ink font-[var(--font-serif)]">
              {article.articleTitle}
            </span>
            {hasParagraphs && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                {article.paragraphs.length}項
              </span>
            )}
            {clipped && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold shrink-0">
                追加済
              </span>
            )}
          </div>
          {isArticleExpanded ? (
            <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-line">
              {fullPreviewText}
            </p>
          ) : (
            shortPreviewText && (
              <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                {shortPreviewText}...
              </p>
            )
          )}
        </div>

        {/* Action buttons */}
        {!clipped && (
          <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            {/* Paragraph selector button - only show if multiple paragraphs */}
            {hasParagraphs && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openParagraphSelector(article);
                }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary font-bold flex items-center gap-0.5 transition-colors"
                title="項を選択して追加"
              >
                <ListChecks className="w-3 h-3" />
                項選択
              </button>
            )}
            <button
              onClick={() => handleAddArticle(article)}
              className="text-[10px] px-2 py-0.5 rounded bg-primary text-white hover:bg-primary/90 font-bold"
            >
              追加
            </button>
          </div>
        )}
      </motion.div>
    );
  };

  const renderStructure = (struct: LawStructure, depth = 0, parentKey = ""): React.ReactNode => {
    const sectionKey = `${parentKey}/${struct.tag}-${struct.num}-${struct.title}`;
    const isExpanded = articleFilter.trim() ? true : expandedSections.has(sectionKey);
    const hasContent = struct.articles.length > 0 || struct.children.length > 0;
    const totalInSection = countTotalInSection(struct);
    const clippedInSection = countClippedInSection(struct);
    const allClipped = totalInSection > 0 && clippedInSection === totalInSection;

    return (
      <div key={sectionKey} className="mb-0.5">
        <div
          className={`group/section flex items-center gap-1 rounded-lg hover:bg-slate-50 transition-colors`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <button
            onClick={() => toggleSection(sectionKey)}
            className={`flex items-center gap-1.5 py-2 px-2 text-left flex-1 min-w-0 ${
              depth === 0 ? "font-semibold text-sm" : "text-xs font-medium"
            }`}
          >
            {hasContent ? (
              isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <span className="text-slate-700 truncate">{struct.title}</span>
          </button>

          <div className="flex items-center gap-1 pr-2 shrink-0">
            {clippedInSection > 0 && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-bold">
                {clippedInSection}/{totalInSection}
              </span>
            )}
            {totalInSection > 0 && !allClipped && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleBulkAddSection(struct);
                }}
                className="opacity-0 group-hover/section:opacity-100 transition-opacity text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 font-bold flex items-center gap-0.5"
                title={`${struct.title}の全${totalInSection}条を追加`}
              >
                <PlusSquare className="w-3 h-3" />
                全追加
              </button>
            )}
            {totalInSection > 0 && !clippedInSection && (
              <span className="text-[10px] text-slate-400 opacity-100 group-hover/section:opacity-0 transition-opacity">
                {totalInSection}条
              </span>
            )}
          </div>
        </div>

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

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "たった今";
    if (minutes < 60) return `${minutes}分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}日前`;
    return new Date(timestamp).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
  };

  // ============================
  // Paragraph selection panel
  // ============================

  const renderParagraphSelectorContent = () => {
    if (!paragraphSelectArticle) return null;
    const article = paragraphSelectArticle;
    const allSelected = selectedParagraphs.size === article.paragraphs.length;
    const noneSelected = selectedParagraphs.size === 0;

    return (
      <>
        {/* Header */}
        <div className="p-4 border-b border-slate-100 shrink-0">
          <button
            onClick={closeParagraphSelector}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary transition-colors mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            条文一覧に戻る
          </button>
          <div>
            {article.articleCaption && (
              <span className="text-[10px] font-medium text-vermillion mb-0.5 block">
                {article.articleCaption}
              </span>
            )}
            <h3 className="text-sm font-bold text-ink font-[var(--font-serif)]">
              {article.articleTitle}
            </h3>
            <p className="text-[10px] text-slate-500 mt-1">
              追加する項を選択してください（全{article.paragraphs.length}項）
            </p>
          </div>

          {/* Select all / deselect all */}
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={toggleAllParagraphs}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-primary transition-colors"
            >
              {allSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              {allSelected ? "全解除" : "全選択"}
            </button>
            <span className="text-[10px] text-slate-400">
              {selectedParagraphs.size}/{article.paragraphs.length}項 選択中
            </span>
          </div>
        </div>

        {/* Paragraph list */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-1" style={{ minHeight: 0 }}>
          {article.paragraphs.map((para, i) => {
            const isSelected = selectedParagraphs.has(i);
            const previewText = para.sentences.join("").slice(0, 120);
            const paraLabel = para.paragraphNum || `第${i + 1}項`;

            return (
              <button
                key={i}
                onClick={() => toggleParagraph(i)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  isSelected
                    ? "border-primary/30 bg-primary/5"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-primary border-primary"
                      : "border-slate-300 bg-white"
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-ink block mb-0.5">
                      {paraLabel}
                    </span>
                    <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3">
                      {previewText}{previewText.length >= 120 ? "..." : ""}
                    </p>
                    {para.items.length > 0 && (
                      <span className="text-[9px] text-slate-400 mt-1 block">
                        ({para.items.length}号あり)
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer with action button */}
        <div className="p-3 pb-5 border-t border-slate-100 shrink-0">
          <button
            onClick={handleAddSelectedParagraphs}
            disabled={noneSelected}
            className={`w-full py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              noneSelected
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-primary text-white hover:bg-primary/90 shadow-sm"
            }`}
          >
            <ListChecks className="w-4 h-4" />
            {noneSelected
              ? "項を選択してください"
              : selectedParagraphs.size === article.paragraphs.length
                ? `全${article.paragraphs.length}項を追加`
                : `選択した${selectedParagraphs.size}項を追加`
            }
          </button>
        </div>
      </>
    );
  };

  // ============================
  // Main render
  // ============================

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Paragraph selection mode - replaces entire sidebar content */}
      {paragraphSelectArticle ? (
        <div className="h-full flex flex-col bg-white overflow-hidden">
          {renderParagraphSelectorContent()}
        </div>
      ) : (
      <>
      {/* Header */}
      <div className="p-4 border-b border-slate-100 shrink-0">
        {viewState === "search" || viewState === "favorites" || viewState === "history" ? (
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
                  setViewState("search");
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
            <div>
              <div className="flex items-start gap-2">
                <h3 className="text-sm font-bold text-ink font-[var(--font-serif)] leading-tight flex-1">
                  {lawTitle}
                </h3>
                <button
                  onClick={handleToggleFavorite}
                  className={`shrink-0 p-1 rounded transition-all ${
                    isFavorite(currentLawId)
                      ? "text-amber-500 hover:text-amber-600"
                      : "text-slate-300 hover:text-amber-400"
                  }`}
                  title={isFavorite(currentLawId) ? "お気に入りから削除" : "お気に入りに追加"}
                >
                  <Star className={`w-4 h-4 ${isFavorite(currentLawId) ? "fill-current" : ""}`} />
                </button>
              </div>
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
          </div>
        )}
      </div>

      {/* Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ minHeight: 0 }}
      >
        <div className="p-2">
          {/* Search view */}
          {viewState === "search" && (
            <>
              {isSearching && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              )}

              {!isSearching && !hasSearched && (
                <>
                  <div className="mb-4">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      クイックアクセス
                    </div>
                    <button
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/5 text-primary hover:bg-primary/10 transition-colors text-left"
                      onClick={() => setViewState("favorites")}
                    >
                      <Star className="w-4 h-4" />
                      <span className="text-sm font-medium">お気に入り</span>
                      {favorites.length > 0 && (
                        <span className="ml-auto text-[10px] bg-primary/10 px-1.5 py-0.5 rounded-full font-bold">
                          {favorites.length}
                        </span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
                    </button>
                    <button
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors text-left"
                      onClick={() => setViewState("history")}
                    >
                      <History className="w-4 h-4" />
                      <span className="text-sm font-medium">履歴</span>
                      {history.length > 0 && (
                        <span className="ml-auto text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-full font-medium text-slate-500">
                          {history.length}
                        </span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
                    </button>
                  </div>

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

          {/* Favorites view */}
          {viewState === "favorites" && (
            <div>
              <div className="flex items-center justify-between px-3 py-2 mb-2">
                <button
                  onClick={() => setViewState("search")}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  戻る
                </button>
                <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  お気に入り
                </h4>
              </div>
              {favorites.length === 0 ? (
                <div className="text-center py-8">
                  <Star className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">お気に入りはまだありません</p>
                  <p className="text-[10px] text-slate-400 mt-1">法令を開いて★をクリックすると追加できます</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {favorites.map((fav) => (
                    <div
                      key={fav.lawId}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors group"
                    >
                      <button
                        onClick={() => handleLoadLawById(fav.lawId, fav.lawTitle, fav.lawNum)}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="text-sm font-medium text-ink truncate font-[var(--font-serif)]">
                          {fav.lawTitle}
                        </p>
                        <p className="text-[10px] text-slate-400">{fav.lawNum}</p>
                      </button>
                      <button
                        onClick={() => {
                          removeFavorite(fav.lawId);
                          toast.info("お気に入りから削除しました");
                        }}
                        className="shrink-0 p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="お気に入りから削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* History view */}
          {viewState === "history" && (
            <div>
              <div className="flex items-center justify-between px-3 py-2 mb-2">
                <button
                  onClick={() => setViewState("search")}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  戻る
                </button>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    履歴
                  </h4>
                  {history.length > 0 && (
                    <button
                      onClick={() => {
                        clearHistory();
                        toast.info("履歴をクリアしました");
                      }}
                      className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                    >
                      クリア
                    </button>
                  )}
                </div>
              </div>
              {history.length === 0 ? (
                <div className="text-center py-8">
                  <History className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">閲覧履歴はまだありません</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {history.map((entry) => (
                    <button
                      key={`${entry.lawId}-${entry.accessedAt}`}
                      onClick={() => handleLoadLawById(entry.lawId, entry.lawTitle, entry.lawNum)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left group"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0 group-hover:text-primary transition-colors" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink truncate font-[var(--font-serif)]">
                          {entry.lawTitle}
                        </p>
                        <p className="text-[10px] text-slate-400">{entry.lawNum}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatRelativeTime(entry.accessedAt)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Articles view */}
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
                  <div className="flex items-center justify-between px-3 mb-2">
                    <p className="text-[10px] text-slate-400">
                      「追加」または「項選択」でペーパーに追加。
                    </p>
                    {!articleFilter.trim() && (
                      <button
                        onClick={isAllExpanded ? handleCollapseAll : handleExpandAll}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary transition-colors font-medium shrink-0"
                        title={isAllExpanded ? "全て折りたたむ" : "全て展開"}
                      >
                        <ChevronsUpDown className="w-3 h-3" />
                        {isAllExpanded ? "全折" : "全展開"}
                      </button>
                    )}
                  </div>
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
      </>
      )}
    </div>
  );
}
