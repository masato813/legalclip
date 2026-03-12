/**
 * Home - LegalClip メインページ
 * Design: エディトリアル × ワークスペース — 参考デザインに準拠
 * 3カラムレイアウト: 左(法令ライブラリ) / 中央(ペーパーエディタ) / 右(アウトライン)
 */

import { useState, useCallback } from "react";
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
  Search,
  FileDown,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateDocx } from "@/lib/docx-generator";
import { toast } from "sonner";

function HeaderDownloadButton() {
  const { clippedArticles, documentTitle } = useDocument();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = useCallback(async () => {
    if (clippedArticles.length === 0) {
      toast.error("条文が追加されていません");
      return;
    }
    setIsGenerating(true);
    try {
      await generateDocx(clippedArticles, documentTitle);
      toast.success("Wordファイルをダウンロードしました");
    } catch (err) {
      console.error("Word生成エラー:", err);
      toast.error("ファイル生成に失敗しました");
    } finally {
      setIsGenerating(false);
    }
  }, [clippedArticles, documentTitle]);

  return (
    <Button
      onClick={handleDownload}
      disabled={isGenerating}
      className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white rounded-lg px-4 py-2 text-sm font-bold transition-all shadow-sm h-auto"
    >
      {isGenerating ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <FileDown className="w-4 h-4" />
      )}
      Wordでダウンロード
    </Button>
  );
}

function MainLayout() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top Navigation — 参考デザインに準拠 */}
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
            <button
              className="text-slate-600 hover:text-primary text-sm font-medium transition-colors py-3"
              onClick={() => toast.info("ダッシュボード機能は準備中です")}
            >
              ダッシュボード
            </button>
            <button
              className="text-slate-600 hover:text-primary text-sm font-medium transition-colors py-3"
              onClick={() => toast.info("テンプレート機能は準備中です")}
            >
              テンプレート
            </button>
            <button className="text-primary text-sm font-semibold border-b-2 border-primary py-3">
              法律ライブラリ
            </button>
          </nav>
        </div>

        {/* Right: Search + Download + Panel toggles */}
        <div className="flex items-center gap-4">
          <div className="relative w-56 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors w-4 h-4" />
            <input
              className="w-full pl-9 pr-4 py-1.5 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
              placeholder="文書内を検索"
              type="text"
              onFocus={() => toast.info("文書内検索機能は準備中です")}
            />
          </div>

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

      {/* Main content - 3 column layout */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Law Library */}
        <aside
          className={`border-r border-slate-200 bg-white flex flex-col transition-all duration-200 overflow-hidden shrink-0 ${
            leftOpen ? "w-80" : "w-0"
          }`}
        >
          <LawSearch />
        </aside>

        {/* Center - Paper Editor */}
        <section className="flex-1 overflow-hidden">
          <PaperEditor />
        </section>

        {/* Right sidebar - Outline */}
        <aside
          className={`border-l border-slate-200 bg-white flex flex-col transition-all duration-200 overflow-hidden shrink-0 ${
            rightOpen ? "w-72" : "w-0"
          }`}
        >
          <Outline />
        </aside>
      </main>
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
