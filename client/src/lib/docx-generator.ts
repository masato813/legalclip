/**
 * Word (docx) ファイル生成ユーティリティ
 * docx ライブラリを使用して条文抜粋をWordファイルに変換
 * アノテーション（ハイライト・アンダーライン）対応
 */

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  SectionType,
  convertMillimetersToTwip,
  BorderStyle,
  type IRunOptions,
} from "docx";
import { saveAs } from "file-saver";
import type { TextAnnotation } from "@/contexts/DocumentContext";

export interface DocumentArticle {
  id: string;
  lawTitle: string;
  lawNum: string;
  articleTitle: string;
  articleCaption: string;
  paragraphs: {
    paragraphNum: string;
    sentences: string[];
    items: {
      title: string;
      sentences: string[];
    }[];
  }[];
  annotations?: TextAnnotation[];
}

// ============================
// Annotation-aware text renderer
// ============================

const HIGHLIGHT_MAP: Record<string, string> = {
  yellow: "yellow",
  green:  "green",
  pink:   "magenta",
  blue:   "cyan",
};

/**
 * テキストをアノテーションに基づいて TextRun[] に分割する
 */
function buildAnnotatedRuns(
  text: string,
  annotations: TextAnnotation[],
  baseOptions: IRunOptions = {}
): TextRun[] {
  if (!annotations || annotations.length === 0) {
    return [new TextRun({ ...baseOptions, text })];
  }

  // Build segments: [{text, highlight?, underline?}]
  type Seg = { text: string; highlight?: string; underline?: boolean };
  let segments: Seg[] = [{ text }];

  for (const ann of annotations) {
    if (!ann.text) continue;
    const escaped = ann.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "g");
    const next: Seg[] = [];
    for (const seg of segments) {
      if (seg.highlight || seg.underline) { next.push(seg); continue; }
      const parts = seg.text.split(regex);
      for (const part of parts) {
        if (!part) continue;
        if (part === ann.text) {
          next.push({
            text: part,
            highlight: ann.type === "highlight" ? (ann.color ?? "yellow") : undefined,
            underline: ann.type === "underline" ? true : undefined,
          });
        } else {
          next.push({ text: part });
        }
      }
    }
    segments = next;
  }

  return segments.map((seg) => {
    const opts: IRunOptions = {
      ...baseOptions,
      text: seg.text,
      ...(seg.highlight ? { highlight: (HIGHLIGHT_MAP[seg.highlight] ?? "yellow") as "yellow" | "green" | "magenta" | "cyan" } : {}),
      ...(seg.underline ? { underline: {} } : {}),
    };
    return new TextRun(opts);
  });
}

export async function generateDocx(
  articles: DocumentArticle[],
  documentTitle?: string
) {
  const children: Paragraph[] = [];

  // Document title
  if (documentTitle) {
    children.push(
      new Paragraph({
        text: documentTitle,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );
  }

  // Date
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: `作成日: ${new Date().toLocaleDateString("ja-JP")}`,
          size: 20,
          color: "666666",
          font: "游ゴシック",
        }),
      ],
    })
  );

  // Separator
  children.push(
    new Paragraph({
      spacing: { after: 300 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      },
    })
  );

  // Group articles by law
  const lawGroups = new Map<string, DocumentArticle[]>();
  for (const article of articles) {
    const key = article.lawTitle;
    if (!lawGroups.has(key)) lawGroups.set(key, []);
    lawGroups.get(key)!.push(article);
  }

  for (const [lawTitle, lawArticles] of Array.from(lawGroups.entries())) {
    // Law title heading
    children.push(
      new Paragraph({
        spacing: { before: 300, after: 100 },
        children: [
          new TextRun({
            text: lawTitle,
            bold: true,
            size: 28,
            font: "游明朝",
          }),
        ],
      })
    );

    // Law number
    if (lawArticles[0]?.lawNum) {
      children.push(
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: `（${lawArticles[0].lawNum}）`,
              size: 20,
              color: "666666",
              font: "游ゴシック",
            }),
          ],
        })
      );
    }

    for (const article of lawArticles) {
      const anns = article.annotations ?? [];
      const baseRun: IRunOptions = { size: 22, font: "游明朝" };

      // Article caption
      if (article.articleCaption) {
        children.push(
          new Paragraph({
            spacing: { before: 200, after: 50 },
            children: [
              new TextRun({
                text: article.articleCaption,
                bold: true,
                size: 22,
                font: "游ゴシック",
              }),
            ],
          })
        );
      }

      // Article title
      children.push(
        new Paragraph({
          spacing: { before: article.articleCaption ? 0 : 200, after: 100 },
          children: [
            new TextRun({
              text: article.articleTitle,
              bold: true,
              size: 22,
              font: "游明朝",
            }),
          ],
        })
      );

      // Paragraphs
      for (const para of article.paragraphs) {
        const paraText = para.sentences.join("");
        const prefix = para.paragraphNum ? `${para.paragraphNum}　` : "";
        const fullText = prefix + paraText;

        children.push(
          new Paragraph({
            spacing: { after: 80 },
            indent: { firstLine: convertMillimetersToTwip(10) },
            children: buildAnnotatedRuns(fullText, anns, baseRun),
          })
        );

        // Items (号)
        for (const item of para.items) {
          const itemText = `${item.title}　${item.sentences.join("")}`;
          children.push(
            new Paragraph({
              spacing: { after: 40 },
              indent: { left: convertMillimetersToTwip(15) },
              children: buildAnnotatedRuns(itemText, anns, baseRun),
            })
          );
        }
      }
    }

    // Separator between laws
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 200 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
        },
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            margin: {
              top: convertMillimetersToTwip(25),
              right: convertMillimetersToTwip(25),
              bottom: convertMillimetersToTwip(25),
              left: convertMillimetersToTwip(25),
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const lawNames = Array.from(new Set(articles.map((a) => a.lawTitle))).join("・");
  const baseName = lawNames ? `${dateStr}条文抜粋（${lawNames}）` : `${dateStr}条文抜粋`;
  saveAs(blob, `${baseName}.docx`);
}
