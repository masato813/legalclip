/**
 * Home - LegalClip メインページ
 * Design: エディトリアル × ワークスペース — 参考デザインに準拠
 * 3カラムレイアウト: 左(法令ライブラリ) / 中央(ペーパーエディタ) / 右(アウトライン)
 * 改善: リサイズ可能サイドバー、全文ダウンロードダイアログ、複数形式ダウンロード
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import LawSearch from "@/components/LawSearch";
import PaperEditor from "@/components/PaperEditor";
import Outline from "@/components/Outline";
import { DocumentProvider, useDocument } from "@/contexts/DocumentContext";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Scale,
  FileDown,
  Loader2,
  ChevronDown,
  FileText,
  FileType,
  FileCode,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { generateDocx } from "@/lib/docx-generator";
import {
  generateTxt,
  generateMarkdown,
  generateFullLawDocx,
  generateFullLawTxt,
  generateFullLawMarkdown,
} from "@/lib/export-utils";
import type { ParsedArticle, LawFullTextNode } from "@/lib/egov-api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

// ============================
// Header Download Button (抜粋ダウンロード)
// ============================
function HeaderDownloadButton() {
  const { clippedArticles, documentTitle } = useDocument();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = useCallback(
    async (format: "docx" | "txt" | "md") => {
      if (clippedArticles.length === 0) {
        toast.error("条文が追加されていません");
        return;
      }
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          disabled={isGenerating}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white rounded-lg px-4 py-2 text-sm font-bold transition-all shadow-sm h-auto"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4" />
          )}
          ダウンロード
          <ChevronDown className="w-3.5 h-3.5 ml-0.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() => handleDownload("docx")}
          className="gap-2"
        >
          <FileText className="w-4 h-4 text-blue-600" />
          Word (.docx)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleDownload("txt")}
          className="gap-2"
        >
          <FileType className="w-4 h-4 text-slate-600" />
          テキスト (.txt)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleDownload("md")}
          className="gap-2"
        >
          <FileCode className="w-4 h-4 text-emerald-600" />
          Markdown (.md)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================
// Full Law Download Dialog
// ============================
interface FullLawDialogProps {
  open: boolean;
  onClose: () => void;
  lawTitle: string;
  lawNum: string;
  articles: ParsedArticle[];
}

function FullLawDownloadDialog({
  open,
  onClose,
  lawTitle,
  lawNum,
  articles,
}: FullLawDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingFormat, setGeneratingFormat] = useState<string | null>(null);

  // 日付プレフィックス（デフォルト: 今日の日付 YYYY-MM-DD）
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const [datePrefix, setDatePrefix] = useState(todayStr);

  // ダイアログを開くたびに今日の日付にリセット
  useEffect(() => {
    if (open) {
      const d = new Date();
      setDatePrefix(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
  }, [open]);

  // ファイル名: 日付プレフィックスが空なら法令名のみ
  const fileName = datePrefix.trim() ? `${datePrefix.trim()}${lawTitle}` : lawTitle;

  const handleDownload = useCallback(
    async (format: "docx" | "txt" | "md") => {
      setIsGenerating(true);
      setGeneratingFormat(format);
      try {
        switch (format) {
          case "docx":
            await generateFullLawDocx(lawTitle, lawNum, articles, fileName);
            toast.success("Word形式でダウンロードしました");
            break;
          case "txt":
            generateFullLawTxt(lawTitle, lawNum, articles, fileName);
            toast.success("テキスト形式でダウンロードしました");
            break;
          case "md":
            generateFullLawMarkdown(lawTitle, lawNum, articles, fileName);
            toast.success("Markdown形式でダウンロードしました");
            break;
        }
        onClose();
      } catch (err) {
        console.error("全文ダウンロードエラー:", err);
        toast.error("ダウンロードに失敗しました");
      } finally {
        setIsGenerating(false);
        setGeneratingFormat(null);
      }
    },
    [lawTitle, lawNum, articles, onClose, fileName]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-[400px] max-w-[90vw]"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-[var(--font-serif)]">
                  全文ダウンロード
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {lawTitle}（{articles.length}条）
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 -mr-1 -mt-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ファイル名設定 */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                ファイル名プレフィックス
              </label>
              <div className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-500">
                <input
                  type="text"
                  value={datePrefix}
                  onChange={(e) => setDatePrefix(e.target.value)}
                  placeholder="例: 2026-03-29"
                  className="flex-1 bg-transparent outline-none text-slate-800 placeholder-slate-400 text-xs"
                />
                <span className="text-slate-400 shrink-0">{lawTitle}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                ファイル名: <span className="text-slate-600 font-medium">{fileName}</span>
              </p>
            </div>

            {/* Format buttons */}
            <div className="space-y-2">
              <button
                onClick={() => handleDownload("docx")}
                disabled={isGenerating}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left group disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  {generatingFormat === "docx" ? (
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  ) : (
                    <FileText className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">
                    Word (.docx)
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Microsoft Word形式で保存
                  </p>
                </div>
              </button>

              <button
                onClick={() => handleDownload("txt")}
                disabled={isGenerating}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-left group disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  {generatingFormat === "txt" ? (
                    <Loader2 className="w-5 h-5 text-slate-600 animate-spin" />
                  ) : (
                    <FileType className="w-5 h-5 text-slate-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-slate-900 transition-colors">
                    テキスト (.txt)
                  </p>
                  <p className="text-[11px] text-slate-400">
                    プレーンテキスト形式で保存
                  </p>
                </div>
              </button>

              <button
                onClick={() => handleDownload("md")}
                disabled={isGenerating}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all text-left group disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                  {generatingFormat === "md" ? (
                    <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                  ) : (
                    <FileCode className="w-5 h-5 text-emerald-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-emerald-700 transition-colors">
                    Markdown (.md)
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Markdown形式で保存
                  </p>
                </div>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================
// Resizable sidebar handle
// ============================
function ResizeHandle({
  side,
  onResize,
}: {
  side: "left" | "right";
  onResize: (delta: number) => void;
}) {
  const isDragging = useRef(false);
  const startX = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startX.current = e.clientX;

      const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = e.clientX - startX.current;
        startX.current = e.clientX;
        onResize(side === "left" ? delta : -delta);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [onResize, side]
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`w-1 hover:w-1.5 bg-transparent hover:bg-primary/20 cursor-col-resize transition-all shrink-0 group relative ${
        side === "left"
          ? "border-r border-slate-200"
          : "border-l border-slate-200"
      }`}
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}

// ============================
// Main Layout
// ============================
function MainLayout() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(288);

  // Full law download dialog state
  const [fullLawDialog, setFullLawDialog] = useState<{
    open: boolean;
    lawTitle: string;
    lawNum: string;
    articles: ParsedArticle[];
  }>({ open: false, lawTitle: "", lawNum: "", articles: [] });

  const handleLeftResize = useCallback((delta: number) => {
    setLeftWidth((prev) => Math.max(200, Math.min(600, prev + delta)));
  }, []);

  const handleRightResize = useCallback((delta: number) => {
    setRightWidth((prev) => Math.max(200, Math.min(500, prev + delta)));
  }, []);

  // Full law download handler - opens dialog
  const handleDownloadFullLaw = useCallback(
    (
      lawTitle: string,
      lawNum: string,
      articles: ParsedArticle[],
      _lawFullText: LawFullTextNode
    ) => {
      setFullLawDialog({ open: true, lawTitle, lawNum, articles });
    },
    []
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Navigation */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-2 shrink-0 z-20">
        {/* Left: Logo + Nav */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-primary">
            <Scale className="w-6 h-6 font-bold" />
            <h1 className="text-xl font-bold leading-tight tracking-tight font-[var(--font-serif)]">
              LegalClip
            </h1>
          </div>
          <nav className="flex items-center gap-6 ml-4">
            <span className="text-primary text-sm font-semibold border-b-2 border-primary py-3">
              法律ライブラリ
            </span>
          </nav>
        </div>

        {/* Right: Search + Download + Panel toggles */}
        <div className="flex items-center gap-4">
          <HeaderDownloadButton />

          <div className="h-8 w-px bg-slate-200 mx-1" />

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLeftOpen(!leftOpen)}
              className="h-8 w-8 p-0"
              title={leftOpen ? "ライブラリを閉じる" : "ライブラリを開く"}
            >
              {leftOpen ? (
                <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
              ) : (
                <PanelLeftOpen className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRightOpen(!rightOpen)}
              className="h-8 w-8 p-0"
              title={rightOpen ? "アウトラインを閉じる" : "アウトラインを開く"}
            >
              {rightOpen ? (
                <PanelRightClose className="w-4 h-4 text-muted-foreground" />
              ) : (
                <PanelRightOpen className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Main content - 3 column layout with resizable sidebars */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Law Library */}
        {leftOpen && (
          <>
            <aside
              className="bg-white flex flex-col overflow-hidden shrink-0"
              style={{ width: `${leftWidth}px` }}
            >
              <LawSearch onDownloadFullLaw={handleDownloadFullLaw} />
            </aside>
            <ResizeHandle side="left" onResize={handleLeftResize} />
          </>
        )}

        {/* Center - Paper Editor */}
        <section className="flex-1 overflow-hidden">
          <PaperEditor />
        </section>

        {/* Right sidebar - Outline */}
        {rightOpen && (
          <>
            <ResizeHandle side="right" onResize={handleRightResize} />
            <aside
              className="bg-white flex flex-col overflow-hidden shrink-0"
              style={{ width: `${rightWidth}px` }}
            >
              <Outline />
            </aside>
          </>
        )}
      </main>

      {/* Full Law Download Dialog */}
      <FullLawDownloadDialog
        open={fullLawDialog.open}
        onClose={() =>
          setFullLawDialog((prev) => ({ ...prev, open: false }))
        }
        lawTitle={fullLawDialog.lawTitle}
        lawNum={fullLawDialog.lawNum}
        articles={fullLawDialog.articles}
      />
    </div>
  );
}

export default function Home() {
  return (
    <DocumentProvider>
      <MainLayout />
    </DocumentProvider>
  );
}
