/**
 * PaperEditor - 中央のペーパーエディタ
 * Design: エディトリアル × ワークスペース
 * A4用紙を模したキャンバスに条文をドラッグ＆ドロップで配置
 * 改善: 削除ボタン常時表示（赤ゴミ箱）、Undo/Redo機能、Ctrl+Z/Y対応
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDocument } from "@/contexts/DocumentContext";
import type { DocumentArticle } from "@/lib/docx-generator";
import { generateDocx } from "@/lib/docx-generator";
import { generateTxt, generateMarkdown } from "@/lib/export-utils";
import { useMemo } from "react";
import {
  GripVertical,
  FileDown,
  Trash2,
  FileText,
  Loader2,
  Undo2,
  Redo2,
  PlusCircle,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

/* ============================
   Article content renderer
   ============================ */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-amber-200/80 text-ink rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function ArticleContent({
  article,
  isOverlay = false,
  searchQuery = "",
}: {
  article: DocumentArticle;
  isOverlay?: boolean;
  searchQuery?: string;
}) {
  return (
    <div className={`py-3 transition-all ${isOverlay ? "" : "border-l-2 border-transparent hover:border-primary/40"} pl-4`}>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-vermillion/8 text-vermillion font-semibold font-[var(--font-ui)]">
          {article.lawTitle}
        </span>
      </div>
      {article.articleCaption && (
        <p className="text-xs font-semibold text-ink/60 mb-0.5 font-[var(--font-sans)]">
          {article.articleCaption}
        </p>
      )}
      <h4 className="text-lg font-bold text-ink mb-3 font-[var(--font-serif)]">
        {article.articleTitle}
      </h4>
      {article.paragraphs.map((para, pi) => (
        <div key={pi} className="mb-2">
          <p className="text-[13.5px] leading-[2] text-ink/85 text-justify font-[var(--font-serif)]">
            {para.paragraphNum && <span className="font-semibold mr-1">{para.paragraphNum}</span>}
            <HighlightText text={para.sentences.join("")} query={searchQuery} />
          </p>
          {para.items.map((item, ii) => (
            <p key={ii} className="text-[13.5px] leading-[2] text-ink/85 pl-6 text-justify font-[var(--font-serif)]">
              <span className="font-semibold mr-1">{item.title}</span>
              <HighlightText text={item.sentences.join("")} query={searchQuery} />
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ============================
   Sortable Article Card
   ============================ */
function SortableArticle({
  article,
  onRemove,
  searchQuery,
}: {
  article: DocumentArticle;
  onRemove: (id: string) => void;
  searchQuery: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: article.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: isDragging ? 0.3 : 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.25 }}
      className={`group relative mb-4 rounded-lg transition-all ${
        isDragging
          ? "bg-primary/5 border-2 border-dashed border-primary/30"
          : "border border-transparent hover:border-slate-200 hover:bg-slate-50/50"
      }`}
    >
      {/* Top bar: drag handle + delete */}
      <div className={`flex items-center justify-between px-3 py-1 rounded-t-lg transition-all ${isDragging ? "opacity-30" : ""}`}>
        <button
          {...attributes}
          {...listeners}
          className="flex items-center gap-1 text-slate-300 hover:text-primary transition-colors cursor-grab active:cursor-grabbing py-0.5 px-1 -ml-1 rounded hover:bg-primary/5"
          title="ドラッグして並べ替え"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        {/* Delete button - always visible red trash */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onRemove(article.id)}
              className="flex items-center gap-1 text-red-400 hover:text-red-600 hover:bg-red-50 transition-all py-1 px-1.5 rounded"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            この条文を削除（Ctrl+Zで元に戻せます）
          </TooltipContent>
        </Tooltip>
      </div>

      {!isDragging && <ArticleContent article={article} searchQuery={searchQuery} />}
    </motion.div>
  );
}

/* ============================
   Drag Overlay
   ============================ */
function DragOverlayContent({ article, searchQuery }: { article: DocumentArticle; searchQuery: string }) {
  return (
    <div className="bg-white rounded-lg shadow-2xl border border-primary/20 max-w-[700px] overflow-hidden rotate-1">
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 border-b border-primary/10">
        <GripVertical className="w-4 h-4 text-primary" />
        <span className="text-[10px] font-semibold text-primary">移動中...</span>
      </div>
      <div className="px-4">
        <ArticleContent article={article} isOverlay searchQuery={searchQuery} />
      </div>
    </div>
  );
}

/* ============================
   Main PaperEditor
   ============================ */
export default function PaperEditor() {
  const {
    clippedArticles,
    removeArticle,
    reorderArticles,
    clearArticles,
    addArticle,
    documentTitle,
    setDocumentTitle,
    undo,
    redo,
    canUndo,
    canRedo,
    lastUndoLabel,
    lastRedoLabel,
    searchQuery,
  } = useDocument();

  const [isDragOver, setIsDragOver] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const paperRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) {
          undo();
          toast.info("元に戻しました");
        }
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z")
      ) {
        e.preventDefault();
        if (canRedo) {
          redo();
          toast.info("やり直しました");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeArticle = activeId ? clippedArticles.find((a) => a.id === activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (over && active.id !== over.id) {
        const oldIndex = clippedArticles.findIndex((a) => a.id === active.id);
        const newIndex = clippedArticles.findIndex((a) => a.id === over.id);
        reorderArticles(oldIndex, newIndex);
      }
    },
    [clippedArticles, reorderArticles]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleExternalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, []);

  const handleExternalDragLeave = useCallback((e: React.DragEvent) => {
    const rect = paperRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        setIsDragOver(false);
      }
    }
  }, []);

  const handleExternalDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      try {
        const data = e.dataTransfer.getData("application/json");
        if (data) {
          const article: DocumentArticle = JSON.parse(data);
          addArticle(article);
          toast.success(`${article.articleTitle} を追加しました`);
        }
      } catch (err) {
        console.error("ドロップエラー:", err);
      }
    },
    [addArticle]
  );

  const handleDownload = useCallback(
    async (format: "docx" | "txt" | "md") => {
      if (clippedArticles.length === 0) return;
      setIsGenerating(true);
      try {
        switch (format) {
          case "docx":
            await generateDocx(clippedArticles, documentTitle);
            toast.success("Wordファイルをダウンロードしました");
            break;
          case "txt":
            generateTxt(clippedArticles, documentTitle);
            toast.success("テキストファイルをダウンロードしました");
            break;
          case "md":
            generateMarkdown(clippedArticles, documentTitle);
            toast.success("Markdownファイルをダウンロードしました");
            break;
        }
      } catch (err) {
        console.error("ファイル生成エラー:", err);
        toast.error("ファイル生成に失敗しました");
      } finally {
        setIsGenerating(false);
      }
    },
    [clippedArticles, documentTitle]
  );

  return (
    <div className="h-full flex flex-col relative">
      {/* Toolbar */}
      <div className="px-4 py-2.5 border-b border-border bg-white/80 backdrop-blur-sm flex items-center gap-3 shrink-0">
        <FileText className="w-4 h-4 text-vermillion shrink-0" />
        <input
          value={documentTitle}
          onChange={(e) => setDocumentTitle(e.target.value)}
          className="text-sm font-semibold text-ink bg-transparent border-none outline-none flex-1 font-[var(--font-sans)] placeholder:text-muted-foreground min-w-0"
          placeholder="ドキュメントタイトル"
        />
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-muted-foreground mr-1 tabular-nums">
            {clippedArticles.length}条
          </span>
          {clippedArticles.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearArticles}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              クリア
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={clippedArticles.length === 0 || isGenerating}
                size="sm"
                className="h-7 px-3 text-xs bg-primary hover:bg-primary/90 text-white font-bold"
              >
                {isGenerating ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <FileDown className="w-3.5 h-3.5 mr-1.5" />
                )}
                ダウンロード
                <ChevronDown className="w-3 h-3 ml-1 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => handleDownload("docx")} className="gap-2 text-xs">
                <FileDown className="w-3.5 h-3.5" />
                Word (.docx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload("txt")} className="gap-2 text-xs">
                <FileDown className="w-3.5 h-3.5" />
                テキスト (.txt)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload("md")} className="gap-2 text-xs">
                <FileDown className="w-3.5 h-3.5" />
                Markdown (.md)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Paper area */}
      <div className="flex-1 overflow-auto p-8" style={{ backgroundColor: "#f6f6f8" }}>
        <div
          ref={paperRef}
          onDragOver={handleExternalDragOver}
          onDragLeave={handleExternalDragLeave}
          onDrop={handleExternalDrop}
          className={`mx-auto bg-white paper-shadow rounded-sm min-h-[1056px] max-w-[800px] relative transition-all duration-300 ${
            isDragOver ? "ring-2 ring-primary/30 ring-offset-4 ring-offset-[#f6f6f8]" : ""
          }`}
          style={{ padding: "64px 56px" }}
        >
          {/* Drop overlay hint */}
          {isDragOver && (
            <div className="absolute inset-0 border-2 border-dashed border-primary/30 m-4 rounded pointer-events-none flex items-center justify-center z-10">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-primary/10 px-5 py-2.5 rounded-full text-primary font-semibold flex items-center gap-2 text-sm"
              >
                <PlusCircle className="w-4 h-4" />
                ここに条文をドラッグ＆ドロップ
              </motion.div>
            </div>
          )}

          {/* Document title on paper */}
          <div className="mb-10">
            <input
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              className="w-full text-3xl font-bold border-none bg-transparent focus:ring-0 outline-none text-ink mb-2 p-0 font-[var(--font-serif)] placeholder:text-muted-foreground/40"
              placeholder="ドキュメントタイトル"
            />
            <p className="text-slate-400 text-sm font-[var(--font-ui)]">
              {new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })} 作成
            </p>
          </div>

          {/* Articles with sortable DnD */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={clippedArticles.map((a) => a.id)} strategy={verticalListSortingStrategy}>
              <AnimatePresence>
                {clippedArticles.map((article) => (
                  <SortableArticle key={article.id} article={article} onRemove={removeArticle} searchQuery={searchQuery} />
                ))}
              </AnimatePresence>
            </SortableContext>

            <DragOverlay dropAnimation={null}>
              {activeArticle ? <DragOverlayContent article={activeArticle} searchQuery={searchQuery} /> : null}
            </DragOverlay>
          </DndContext>

          {/* Drop zone at bottom */}
          {clippedArticles.length > 0 && (
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center text-slate-400 gap-2 hover:border-primary/40 hover:bg-primary/5 transition-all group mt-6">
              <PlusCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium">ライブラリから条文をここにドラッグ</span>
            </div>
          )}

          {/* Empty state */}
          {clippedArticles.length === 0 && !isDragOver && (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <FileText className="w-7 h-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground font-[var(--font-sans)]">
                左のライブラリから条文をドラッグ＆ドロップ
              </p>
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                または条文カードの「追加」ボタンをクリック
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Floating bottom toolbar with Undo/Redo */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white border border-border rounded-full shadow-xl px-5 py-2 flex items-center gap-4 z-10 pointer-events-auto">
        {/* Undo/Redo group */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`p-1.5 rounded-md transition-all ${
                  canUndo
                    ? "text-ink hover:text-primary hover:bg-primary/10"
                    : "text-slate-300 cursor-not-allowed"
                }`}
                onClick={() => {
                  if (canUndo) {
                    undo();
                    toast.info("元に戻しました");
                  }
                }}
                disabled={!canUndo}
              >
                <Undo2 className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              {canUndo ? `元に戻す: ${lastUndoLabel} (Ctrl+Z)` : "元に戻す (Ctrl+Z)"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`p-1.5 rounded-md transition-all ${
                  canRedo
                    ? "text-ink hover:text-primary hover:bg-primary/10"
                    : "text-slate-300 cursor-not-allowed"
                }`}
                onClick={() => {
                  if (canRedo) {
                    redo();
                    toast.info("やり直しました");
                  }
                }}
                disabled={!canRedo}
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              {canRedo ? `やり直す: ${lastRedoLabel} (Ctrl+Y)` : "やり直す (Ctrl+Y)"}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="h-5 w-px bg-slate-200" />

        {/* Article count indicator */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="w-3.5 h-3.5" />
          <span className="tabular-nums font-medium">{clippedArticles.length}条</span>
        </div>
      </div>
    </div>
  );
}
