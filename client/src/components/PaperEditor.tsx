/**
 * PaperEditor - 中央のペーパーエディタ
 * Design: エディトリアル × ワークスペース
 * A4用紙を模したキャンバスに条文・見出し・メモをドラッグ＆ドロップで配置
 * 機能: Undo/Redo, テキストアノテーション（ハイライト・アンダーライン）, 見出し・メモブロック挿入
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
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
import type { DocumentItem, ArticleBlock, HeadingBlock, MemoBlock, TextAnnotation } from "@/contexts/DocumentContext";
import type { DocumentArticle } from "@/lib/docx-generator";
import { generateDocx } from "@/lib/docx-generator";
import { generateTxt, generateMarkdown } from "@/lib/export-utils";
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
  Heading1,
  Heading2,
  Heading3,
  StickyNote,
  Highlighter,
  Underline,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

/* ============================
   Highlight colors
   ============================ */
const HIGHLIGHT_COLORS: Record<string, { bg: string; label: string }> = {
  yellow: { bg: "bg-yellow-200/90", label: "黄" },
  green:  { bg: "bg-green-200/90",  label: "緑" },
  pink:   { bg: "bg-pink-200/90",   label: "ピンク" },
  blue:   { bg: "bg-blue-200/90",   label: "青" },
};

/* ============================
   Annotated text renderer
   ============================ */
function AnnotatedText({
  text,
  annotations = [],
  searchQuery = "",
}: {
  text: string;
  annotations?: TextAnnotation[];
  searchQuery?: string;
}) {
  // Build a list of character-level spans with annotation info
  // Simple approach: split by annotation matches, apply styles
  if (annotations.length === 0 && !searchQuery.trim()) return <>{text}</>;

  // Apply search highlight first, then annotations
  type Span = { text: string; highlight?: string; underline?: boolean; search?: boolean };
  const spans: Span[] = [{ text }];

  // Apply annotations
  for (const ann of annotations) {
    const escaped = ann.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "g");
    const newSpans: Span[] = [];
    for (const span of spans) {
      if (span.highlight || span.underline || span.search) {
        newSpans.push(span);
        continue;
      }
      const parts = span.text.split(regex);
      for (const part of parts) {
        if (part === ann.text) {
          newSpans.push({
            text: part,
            highlight: ann.type === "highlight" ? (ann.color ?? "yellow") : undefined,
            underline: ann.type === "underline" ? true : undefined,
          });
        } else if (part) {
          newSpans.push({ text: part });
        }
      }
    }
    spans.splice(0, spans.length, ...newSpans);
  }

  // Apply search highlight
  if (searchQuery.trim()) {
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const newSpans: Span[] = [];
    for (const span of spans) {
      if (span.highlight || span.underline) {
        newSpans.push(span);
        continue;
      }
      const parts = span.text.split(regex);
      for (const part of parts) {
        if (regex.test(part)) {
          newSpans.push({ text: part, search: true });
        } else if (part) {
          newSpans.push({ text: part });
        }
      }
    }
    spans.splice(0, spans.length, ...newSpans);
  }

  return (
    <>
      {spans.map((span, i) => {
        if (span.search) return <mark key={i} className="bg-amber-200/80 text-ink rounded-sm px-0.5">{span.text}</mark>;
        if (span.highlight) {
          const colorClass = HIGHLIGHT_COLORS[span.highlight]?.bg ?? "bg-yellow-200/90";
          return <mark key={i} className={`${colorClass} text-ink rounded-sm px-0.5`}>{span.text}</mark>;
        }
        if (span.underline) return <span key={i} className="underline decoration-2 decoration-red-500">{span.text}</span>;
        return <span key={i}>{span.text}</span>;
      })}
    </>
  );
}

/* ============================
   Article content renderer
   ============================ */
function ArticleContent({
  article,
  isOverlay = false,
  searchQuery = "",
}: {
  article: ArticleBlock;
  isOverlay?: boolean;
  searchQuery?: string;
}) {
  const annotations = article.annotations ?? [];
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
          <p className="text-[13.5px] leading-[2] text-ink/85 text-justify font-[var(--font-serif)]" style={{ textIndent: "1em" }}>
            {para.paragraphNum && (
              <span className="font-semibold mr-1" style={{ marginLeft: "-1em" }}>
                {para.paragraphNum}
              </span>
            )}
            <AnnotatedText
              text={para.sentences.join("")}
              annotations={annotations}
              searchQuery={searchQuery}
            />
          </p>
          {para.items.map((item, ii) => (
            <p key={ii} className="text-[13.5px] leading-[2] text-ink/85 pl-6 text-justify font-[var(--font-serif)]">
              <span className="font-semibold mr-1">{item.title}</span>
              <AnnotatedText
                text={item.sentences.join("")}
                annotations={annotations}
                searchQuery={searchQuery}
              />
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ============================
   Annotation toolbar (floating)
   ============================ */
function AnnotationToolbar({
  position,
  selectedText,
  onAnnotate,
  onClose,
}: {
  position: { x: number; y: number };
  selectedText: string;
  onAnnotate: (type: "highlight" | "underline", color?: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl flex items-center gap-1 px-2 py-1.5"
      style={{ left: position.x, top: position.y - 48, transform: "translateX(-50%)" }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Highlight colors */}
      {Object.entries(HIGHLIGHT_COLORS).map(([color, { bg, label }]) => (
        <Tooltip key={color}>
          <TooltipTrigger asChild>
            <button
              className={`w-5 h-5 rounded-full border border-slate-300 hover:scale-110 transition-transform ${bg}`}
              onClick={() => onAnnotate("highlight", color)}
              title={`ハイライト（${label}）`}
            />
          </TooltipTrigger>
          <TooltipContent className="text-xs">{label}でハイライト</TooltipContent>
        </Tooltip>
      ))}
      <div className="w-px h-4 bg-slate-200 mx-0.5" />
      {/* Underline */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="p-1 rounded hover:bg-slate-100 transition-colors text-red-500"
            onClick={() => onAnnotate("underline")}
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">アンダーライン</TooltipContent>
      </Tooltip>
      <div className="w-px h-4 bg-slate-200 mx-0.5" />
      <button
        className="p-1 rounded hover:bg-slate-100 transition-colors text-slate-400"
        onClick={onClose}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

/* ============================
   Heading Block
   ============================ */
function SortableHeading({
  item,
  onRemove,
  onUpdate,
}: {
  item: HeadingBlock;
  onRemove: (id: string) => void;
  onUpdate: (id: string, text: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  const sizeClass = item.level === 1 ? "text-2xl font-bold" : item.level === 2 ? "text-xl font-bold" : "text-lg font-semibold";
  const borderClass = item.level === 1 ? "border-b-2 border-ink/20 pb-2" : item.level === 2 ? "border-b border-ink/15 pb-1" : "";

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      data-article-id={item.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.3 : 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      className={`group relative mb-4 rounded-lg transition-all ${isDragging ? "bg-primary/5 border-2 border-dashed border-primary/30" : "hover:bg-slate-50/50"}`}
    >
      <div className="flex items-center gap-2 px-3 py-1">
        <button
          {...attributes}
          {...listeners}
          className="text-slate-300 hover:text-primary transition-colors cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-primary/5"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">
          {item.level === 1 ? "大見出し" : item.level === 2 ? "中見出し" : "小見出し"}
        </span>
        <button
          onClick={() => onRemove(item.id)}
          className="ml-auto text-red-400 hover:text-red-600 hover:bg-red-50 transition-all p-1 rounded opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className={`px-4 pb-3 ${borderClass}`}>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { onUpdate(item.id, draft); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { onUpdate(item.id, draft); setEditing(false); } if (e.key === "Escape") { setDraft(item.text); setEditing(false); } }}
            className={`w-full bg-transparent border-none outline-none text-ink font-[var(--font-serif)] ${sizeClass}`}
          />
        ) : (
          <p
            className={`text-ink font-[var(--font-serif)] cursor-text ${sizeClass} ${!item.text ? "text-slate-300 italic" : ""}`}
            onClick={() => setEditing(true)}
          >
            {item.text || "見出しを入力..."}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ============================
   Memo Block
   ============================ */
function SortableMemo({
  item,
  onRemove,
  onUpdate,
}: {
  item: MemoBlock;
  onRemove: (id: string) => void;
  onUpdate: (id: string, text: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [draft, setDraft] = useState(item.text);

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      data-article-id={item.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.3 : 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      className={`group relative mb-4 rounded-lg transition-all ${isDragging ? "bg-amber-50 border-2 border-dashed border-amber-300" : "bg-amber-50/60 border border-amber-200/60"}`}
    >
      <div className="flex items-center gap-2 px-3 py-1">
        <button
          {...attributes}
          {...listeners}
          className="text-amber-400 hover:text-amber-600 transition-colors cursor-grab active:cursor-grabbing p-0.5 rounded"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <StickyNote className="w-3 h-3 text-amber-500" />
        <span className="text-[10px] text-amber-600 font-semibold">メモ</span>
        <button
          onClick={() => onRemove(item.id)}
          className="ml-auto text-red-400 hover:text-red-600 hover:bg-red-50 transition-all p-1 rounded opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-4 pb-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onUpdate(item.id, draft)}
          placeholder="メモを入力..."
          rows={2}
          className="w-full bg-transparent border-none outline-none resize-none text-[13px] leading-relaxed text-ink/80 font-[var(--font-sans)] placeholder:text-amber-400/60"
        />
      </div>
    </motion.div>
  );
}

/* ============================
   Sortable Article Card
   ============================ */
function SortableArticle({
  article,
  onRemove,
  searchQuery,
  onAnnotate,
  onRemoveAnnotation,
}: {
  article: ArticleBlock;
  onRemove: (id: string) => void;
  searchQuery: string;
  onAnnotate: (articleId: string, ann: TextAnnotation) => void;
  onRemoveAnnotation: (articleId: string, annId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: article.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [annotationToolbar, setAnnotationToolbar] = useState<{ x: number; y: number; text: string } | null>(null);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setAnnotationToolbar(null);
      return;
    }
    let selectedText = sel.toString().trim();
    // 項番号（「２」「３」など全角数字や漢数字）が先頭に含まれている場合は除去する
    // 例: "２ 行政庁は..." → "行政庁は..."
    selectedText = selectedText.replace(/^[０-９\d一二三四五六七八九十百]+\s*/, "").trim();
    if (!selectedText) {
      setAnnotationToolbar(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setAnnotationToolbar({
      x: rect.left + rect.width / 2,
      y: rect.top,
      text: selectedText,
    });
  }, []);

  const handleAnnotate = useCallback((type: "highlight" | "underline", color?: string) => {
    if (!annotationToolbar) return;
    const ann: TextAnnotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text: annotationToolbar.text,
      type,
      color: color as TextAnnotation["color"],
    };
    onAnnotate(article.id, ann);
    setAnnotationToolbar(null);
    window.getSelection()?.removeAllRanges();
  }, [annotationToolbar, article.id, onAnnotate]);

  const annotations = article.annotations ?? [];

  return (
    <>
      {annotationToolbar && (
        <AnnotationToolbar
          position={annotationToolbar}
          selectedText={annotationToolbar.text}
          onAnnotate={handleAnnotate}
          onClose={() => setAnnotationToolbar(null)}
        />
      )}
      <motion.div
        ref={setNodeRef}
        style={style}
        data-article-id={article.id}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: isDragging ? 0.3 : 1, y: 0 }}
        exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
        transition={{ duration: 0.25 }}
        className={`group relative mb-4 rounded-lg transition-all ${
          isDragging
            ? "bg-primary/5 border-2 border-dashed border-primary/30"
            : "border border-transparent hover:border-slate-200 hover:bg-slate-50/50"
        }`}
        onMouseUp={handleMouseUp}
      >
        {/* Top bar: drag handle + annotation badges + delete */}
        <div className={`flex items-center justify-between px-3 py-1 rounded-t-lg transition-all ${isDragging ? "opacity-30" : ""}`}>
          <button
            {...attributes}
            {...listeners}
            className="flex items-center gap-1 text-slate-300 hover:text-primary transition-colors cursor-grab active:cursor-grabbing py-0.5 px-1 -ml-1 rounded hover:bg-primary/5"
            title="ドラッグして並べ替え"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-1">
            {/* Annotation badges */}
            {annotations.length > 0 && (
              <div className="flex items-center gap-1 mr-1">
                {annotations.map((ann) => (
                  <Tooltip key={ann.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onRemoveAnnotation(article.id, ann.id)}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold transition-all hover:opacity-70 ${
                          ann.type === "underline"
                            ? "bg-red-100 text-red-600 underline"
                            : HIGHLIGHT_COLORS[ann.color ?? "yellow"]?.bg + " text-ink"
                        }`}
                      >
                        {ann.text.length > 8 ? ann.text.slice(0, 8) + "…" : ann.text}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">クリックで削除</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}

            {/* Delete button */}
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
        </div>

        {!isDragging && (
          <ArticleContent article={article} searchQuery={searchQuery} />
        )}
      </motion.div>
    </>
  );
}

/* ============================
   Drag Overlay
   ============================ */
function DragOverlayContent({ item, searchQuery }: { item: DocumentItem; searchQuery: string }) {
  if (item.kind === "heading") {
    return (
      <div className="bg-white rounded-lg shadow-2xl border border-primary/20 px-6 py-3 rotate-1">
        <p className="text-xl font-bold text-ink font-[var(--font-serif)]">{item.text || "見出し"}</p>
      </div>
    );
  }
  if (item.kind === "memo") {
    return (
      <div className="bg-amber-50 rounded-lg shadow-2xl border border-amber-200 px-6 py-3 rotate-1">
        <p className="text-sm text-ink/80 font-[var(--font-sans)]">{item.text || "メモ"}</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-lg shadow-2xl border border-primary/20 max-w-[700px] overflow-hidden rotate-1">
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 border-b border-primary/10">
        <GripVertical className="w-4 h-4 text-primary" />
        <span className="text-[10px] font-semibold text-primary">移動中...</span>
      </div>
      <div className="px-4">
        <ArticleContent article={item as ArticleBlock} isOverlay searchQuery={searchQuery} />
      </div>
    </div>
  );
}

/* ============================
   Insert Block Button (between items)
   ============================ */
function InsertBlockButton({ index, onInsertHeading, onInsertMemo }: {
  index: number;
  onInsertHeading: (level: 1 | 2 | 3, index: number) => void;
  onInsertMemo: (index: number) => void;
}) {
  return (
    <div className="group flex items-center gap-2 my-0.5 opacity-0 hover:opacity-100 transition-opacity">
      <div className="h-px flex-1 bg-slate-200 group-hover:bg-primary/30 transition-colors" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-primary bg-white border border-slate-200 hover:border-primary/40 px-2 py-0.5 rounded-full transition-all shadow-sm hover:shadow-md whitespace-nowrap">
            <PlusCircle className="w-3 h-3" />
            ブロックを追加
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-44">
          <DropdownMenuLabel className="text-[10px] text-muted-foreground">見出し</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onInsertHeading(1, index)} className="gap-2 text-xs">
            <Heading1 className="w-3.5 h-3.5" />大見出し（H1）
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsertHeading(2, index)} className="gap-2 text-xs">
            <Heading2 className="w-3.5 h-3.5" />中見出し（H2）
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsertHeading(3, index)} className="gap-2 text-xs">
            <Heading3 className="w-3.5 h-3.5" />小見出し（H3）
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onInsertMemo(index)} className="gap-2 text-xs">
            <StickyNote className="w-3.5 h-3.5 text-amber-500" />メモ
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="h-px flex-1 bg-slate-200 group-hover:bg-primary/30 transition-colors" />
    </div>
  );
}

/* ============================
   Main PaperEditor
   ============================ */
export default function PaperEditor() {
  const {
    items,
    clippedArticles,
    removeItem,
    reorderItems,
    clearItems,
    insertArticleAt,
    insertHeadingAt,
    insertMemoAt,
    updateItem,
    addAnnotation,
    removeAnnotation,
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
  const [dropInsertIndex, setDropInsertIndex] = useState<number | null>(null);
  const paperRef = useRef<HTMLDivElement>(null);

  // ドロップ位置からインデックスを計算
  const getDropIndex = useCallback((clientY: number): number => {
    const els = paperRef.current?.querySelectorAll("[data-article-id]");
    if (!els || els.length === 0) return items.length;
    for (let i = 0; i < els.length; i++) {
      const rect = els[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return els.length;
  }, [items.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) { undo(); toast.info("元に戻しました"); }
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z")
      ) {
        e.preventDefault();
        if (canRedo) { redo(); toast.info("やり直しました"); }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeItem = activeId ? items.find((a) => a.id === activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((a) => a.id === active.id);
      const newIndex = items.findIndex((a) => a.id === over.id);
      reorderItems(oldIndex, newIndex);
    }
  }, [items, reorderItems]);

  const handleDragCancel = useCallback(() => setActiveId(null), []);

  const handleExternalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
    setDropInsertIndex(getDropIndex(e.clientY));
  }, [getDropIndex]);

  const handleExternalDragLeave = useCallback((e: React.DragEvent) => {
    const rect = paperRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        setIsDragOver(false);
        setDropInsertIndex(null);
      }
    }
  }, []);

  const handleExternalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const insertIdx = getDropIndex(e.clientY);
    setIsDragOver(false);
    setDropInsertIndex(null);
    try {
      const data = e.dataTransfer.getData("application/json");
      if (data) {
        const article: DocumentArticle = JSON.parse(data);
        insertArticleAt(article, insertIdx);
        toast.success(`${article.articleTitle} を追加しました`);
      }
    } catch (err) {
      console.error("ドロップエラー:", err);
    }
  }, [insertArticleAt, getDropIndex]);

  const handleDownload = useCallback(async (format: "docx" | "txt" | "md") => {
    if (clippedArticles.length === 0) return;
    setIsGenerating(true);
    try {
      switch (format) {
        case "docx": await generateDocx(clippedArticles, documentTitle); toast.success("Wordファイルをダウンロードしました"); break;
        case "txt": generateTxt(clippedArticles, documentTitle); toast.success("テキストファイルをダウンロードしました"); break;
        case "md": generateMarkdown(clippedArticles, documentTitle); toast.success("Markdownファイルをダウンロードしました"); break;
      }
    } catch (err) {
      console.error("ファイル生成エラー:", err);
      toast.error("ファイル生成に失敗しました");
    } finally {
      setIsGenerating(false);
    }
  }, [clippedArticles, documentTitle]);

  const handleInsertHeading = useCallback((level: 1 | 2 | 3, index: number) => {
    insertHeadingAt("", level, index);
  }, [insertHeadingAt]);

  const handleInsertMemo = useCallback((index: number) => {
    insertMemoAt("", index);
  }, [insertMemoAt]);

  const handleUpdateItem = useCallback((id: string, text: string) => {
    updateItem(id, { text } as Partial<HeadingBlock | MemoBlock>);
  }, [updateItem]);

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
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearItems}
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
                <FileDown className="w-3.5 h-3.5" />Word (.docx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload("txt")} className="gap-2 text-xs">
                <FileDown className="w-3.5 h-3.5" />テキスト (.txt)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload("md")} className="gap-2 text-xs">
                <FileDown className="w-3.5 h-3.5" />Markdown (.md)
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
          {/* Drop overlay */}
          {isDragOver && (
            <div className="absolute inset-0 border-2 border-dashed border-primary/40 m-3 rounded-lg pointer-events-none z-10 bg-primary/5">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-0 left-0 right-0 p-4"
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="w-full h-1 bg-primary/40 rounded-full" />
                  <div className="bg-primary text-white px-4 py-2 rounded-full font-semibold flex items-center gap-2 text-sm shadow-lg">
                    <PlusCircle className="w-4 h-4" />
                    ここにドロップして追加
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {/* Document title */}
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

          {/* Items with sortable DnD */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={items.map((a) => a.id)} strategy={verticalListSortingStrategy}>
              <AnimatePresence>
                {/* Insert button before first item */}
                {items.length > 0 && !isDragOver && (
                  <InsertBlockButton
                    key="insert-0"
                    index={0}
                    onInsertHeading={handleInsertHeading}
                    onInsertMemo={handleInsertMemo}
                  />
                )}
                {items.map((item, idx) => (
                  <React.Fragment key={`frag-${item.id}`}>
                    {/* Drop indicator */}
                    {isDragOver && dropInsertIndex === idx && (
                      <motion.div
                        key={`indicator-${idx}`}
                        initial={{ opacity: 0, scaleX: 0.8 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2 my-1 pointer-events-none"
                      >
                        <div className="h-0.5 flex-1 bg-primary rounded-full" />
                        <div className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap">ここに挿入</div>
                        <div className="h-0.5 flex-1 bg-primary rounded-full" />
                      </motion.div>
                    )}

                    {/* Render item by kind */}
                    {item.kind === "article" && (
                      <SortableArticle
                        article={item as ArticleBlock}
                        onRemove={removeItem}
                        searchQuery={searchQuery}
                        onAnnotate={addAnnotation}
                        onRemoveAnnotation={removeAnnotation}
                      />
                    )}
                    {item.kind === "heading" && (
                      <SortableHeading
                        item={item as HeadingBlock}
                        onRemove={removeItem}
                        onUpdate={handleUpdateItem}
                      />
                    )}
                    {item.kind === "memo" && (
                      <SortableMemo
                        item={item as MemoBlock}
                        onRemove={removeItem}
                        onUpdate={handleUpdateItem}
                      />
                    )}

                    {/* Insert button after each item */}
                    {!isDragOver && (
                      <InsertBlockButton
                        key={`insert-${idx + 1}`}
                        index={idx + 1}
                        onInsertHeading={handleInsertHeading}
                        onInsertMemo={handleInsertMemo}
                      />
                    )}
                  </React.Fragment>
                ))}

                {/* Drop indicator at end */}
                {isDragOver && dropInsertIndex === items.length && (
                  <motion.div
                    key="indicator-last"
                    initial={{ opacity: 0, scaleX: 0.8 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 my-1 pointer-events-none"
                  >
                    <div className="h-0.5 flex-1 bg-primary rounded-full" />
                    <div className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap">ここに挿入</div>
                    <div className="h-0.5 flex-1 bg-primary rounded-full" />
                  </motion.div>
                )}
              </AnimatePresence>
            </SortableContext>

            <DragOverlay dropAnimation={null}>
              {activeItem ? <DragOverlayContent item={activeItem} searchQuery={searchQuery} /> : null}
            </DragOverlay>
          </DndContext>

          {/* Drop zone at bottom */}
          {items.length > 0 && (
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center text-slate-400 gap-2 hover:border-primary/40 hover:bg-primary/5 transition-all group mt-6">
              <PlusCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium">ライブラリから条文をここにドラッグ</span>
            </div>
          )}

          {/* Empty state */}
          {items.length === 0 && !isDragOver && (
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

      {/* Floating bottom toolbar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white border border-border rounded-full shadow-xl px-5 py-2 flex items-center gap-4 z-10 pointer-events-auto">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`p-1.5 rounded-md transition-all ${canUndo ? "text-ink hover:text-primary hover:bg-primary/10" : "text-slate-300 cursor-not-allowed"}`}
                onClick={() => { if (canUndo) { undo(); toast.info("元に戻しました"); } }}
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
                className={`p-1.5 rounded-md transition-all ${canRedo ? "text-ink hover:text-primary hover:bg-primary/10" : "text-slate-300 cursor-not-allowed"}`}
                onClick={() => { if (canRedo) { redo(); toast.info("やり直しました"); } }}
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
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="w-3.5 h-3.5" />
          <span className="tabular-nums font-medium">{clippedArticles.length}条</span>
        </div>
      </div>
    </div>
  );
}
