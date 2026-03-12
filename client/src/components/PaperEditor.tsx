/**
 * PaperEditor - 中央のペーパーエディタ
 * Design: エディトリアル × ワークスペース — 参考デザインに準拠
 * A4用紙を模したキャンバスに条文をドラッグ＆ドロップで配置
 * フローティングツールバー付き
 * 改善: 複数形式ダウンロード対応
 */

import { useState, useCallback, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
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
import {
  GripVertical,
  X,
  FileDown,
  Trash2,
  FileText,
  Loader2,
  AlignJustify,
  List,
  Bold,
  Undo2,
  Redo2,
  MessageSquare,
  Share2,
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
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

function SortableArticle({
  article,
  onRemove,
}: {
  article: DocumentArticle;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: article.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : 0,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.25 }}
      className={`group relative mb-8 ${isDragging ? "drag-ghost" : ""}`}
    >
      {/* Drag handle + Remove - visible on hover, positioned to the left */}
      <div className="absolute -left-12 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          {...attributes}
          {...listeners}
          className="p-1 rounded hover:bg-slate-100 text-muted-foreground hover:text-primary transition-colors cursor-grab active:cursor-grabbing"
          title="ドラッグして並べ替え"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <button
          onClick={() => onRemove(article.id)}
          className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
          title="削除"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Article content - left border accent on hover */}
      <div className="border-l-2 border-transparent hover:border-primary/40 pl-4 -ml-4 py-2 transition-all">
        {/* Law reference tag */}
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-vermillion/8 text-vermillion font-semibold font-[var(--font-ui)]">
            {article.lawTitle}
          </span>
        </div>

        {/* Article caption */}
        {article.articleCaption && (
          <p className="text-xs font-semibold text-ink/60 mb-0.5 font-[var(--font-sans)]">
            {article.articleCaption}
          </p>
        )}

        {/* Article title */}
        <h4 className="text-lg font-bold text-ink mb-3 font-[var(--font-serif)]">
          {article.articleTitle}
        </h4>

        {/* Paragraphs */}
        {article.paragraphs.map((para, pi) => (
          <div key={pi} className="mb-2">
            <p className="text-[13.5px] leading-[2] text-ink/85 text-justify font-[var(--font-serif)]">
              {para.paragraphNum && (
                <span className="font-semibold mr-1">{para.paragraphNum}</span>
              )}
              {para.sentences.join("")}
            </p>
            {para.items.map((item, ii) => (
              <p
                key={ii}
                className="text-[13.5px] leading-[2] text-ink/85 pl-6 text-justify font-[var(--font-serif)]"
              >
                <span className="font-semibold mr-1">{item.title}</span>
                {item.sentences.join("")}
              </p>
            ))}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function PaperEditor() {
  const {
    clippedArticles,
    removeArticle,
    reorderArticles,
    clearArticles,
    addArticle,
    documentTitle,
    setDocumentTitle,
  } = useDocument();

  const [isDragOver, setIsDragOver] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = clippedArticles.findIndex((a) => a.id === active.id);
        const newIndex = clippedArticles.findIndex((a) => a.id === over.id);
        reorderArticles(oldIndex, newIndex);
      }
    },
    [clippedArticles, reorderArticles]
  );

  // Handle external drag (from LawSearch sidebar)
  const handleExternalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, []);

  const handleExternalDragLeave = useCallback((e: React.DragEvent) => {
    const rect = paperRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
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

  const handleDownload = useCallback(async (format: "docx" | "txt" | "md") => {
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
  }, [clippedArticles, documentTitle]);

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

      {/* Paper area - "desk" surface */}
      <div
        className="flex-1 overflow-auto p-8"
        style={{ backgroundColor: "#f6f6f8" }}
      >
        <div
          ref={paperRef}
          onDragOver={handleExternalDragOver}
          onDragLeave={handleExternalDragLeave}
          onDrop={handleExternalDrop}
          className={`mx-auto bg-white paper-shadow rounded-sm min-h-[1056px] max-w-[800px] relative transition-all duration-300 ${
            isDragOver
              ? "ring-2 ring-primary/30 ring-offset-4 ring-offset-[#f6f6f8]"
              : ""
          }`}
          style={{ padding: "64px" }}
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
          <div className="mb-12">
            <input
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              className="w-full text-3xl font-bold border-none bg-transparent focus:ring-0 outline-none text-ink mb-2 p-0 font-[var(--font-serif)] placeholder:text-muted-foreground/40"
              placeholder="ドキュメントタイトル"
            />
            <p className="text-slate-400 text-sm font-[var(--font-ui)]">
              {new Date().toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })} 作成
            </p>
          </div>

          {/* Articles with sortable */}
          <div className="pl-12">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={clippedArticles.map((a) => a.id)}
                strategy={verticalListSortingStrategy}
              >
                <AnimatePresence>
                  {clippedArticles.map((article) => (
                    <SortableArticle
                      key={article.id}
                      article={article}
                      onRemove={removeArticle}
                    />
                  ))}
                </AnimatePresence>
              </SortableContext>
            </DndContext>

            {/* Drop zone at bottom when has articles */}
            {clippedArticles.length > 0 && (
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 flex flex-col items-center justify-center text-slate-400 gap-3 hover:border-primary/40 hover:bg-primary/5 transition-all group mt-4">
                <PlusCircle className="w-8 h-8 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium">ライブラリから条文をここにドラッグ</span>
              </div>
            )}
          </div>

          {/* Empty state */}
          {clippedArticles.length === 0 && !isDragOver && (
            <div className="flex flex-col items-center justify-center py-24 pl-12">
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
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white border border-border rounded-full shadow-xl px-6 py-2.5 flex items-center gap-5 z-10 pointer-events-auto">
        <div className="flex items-center gap-3 border-r border-border pr-5">
          <button className="text-muted-foreground hover:text-primary transition-colors" title="元に戻す"
            onClick={() => toast.info("元に戻す機能は準備中です")}>
            <Undo2 className="w-4 h-4" />
          </button>
          <button className="text-muted-foreground hover:text-primary transition-colors" title="やり直し"
            onClick={() => toast.info("やり直し機能は準備中です")}>
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3 border-r border-border pr-5">
          <button className="text-muted-foreground hover:text-primary transition-colors" title="太字"
            onClick={() => toast.info("太字機能は準備中です")}>
            <Bold className="w-4 h-4" />
          </button>
          <button className="text-muted-foreground hover:text-primary transition-colors" title="リスト"
            onClick={() => toast.info("リスト機能は準備中です")}>
            <List className="w-4 h-4" />
          </button>
          <button className="text-muted-foreground hover:text-primary transition-colors" title="両端揃え"
            onClick={() => toast.info("両端揃え機能は準備中です")}>
            <AlignJustify className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-muted-foreground hover:text-primary transition-colors" title="コメント"
            onClick={() => toast.info("コメント機能は準備中です")}>
            <MessageSquare className="w-4 h-4" />
          </button>
          <button className="text-muted-foreground hover:text-primary transition-colors" title="共有"
            onClick={() => toast.info("共有機能は準備中です")}>
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
