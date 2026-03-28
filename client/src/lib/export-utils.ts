/**
 * エクスポートユーティリティ
 * TXT, Markdown, 全文ダウンロード機能を提供
 */

import { saveAs } from "file-saver";
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
} from "docx";
import type { DocumentArticle } from "./docx-generator";
import type { ParsedArticle } from "./egov-api";

// ============================
// Helper: item to plain text (recursive)
// ============================
function itemToPlainText(item: { title: string; sentences: string[]; subitems?: unknown[]; tableStruct?: { rows: { cells: { text: string }[] }[] } }, indent: string): string[] {
  const lines: string[] = [];
  const text = `${indent}${item.title}${item.sentences.join("") ? "　" + item.sentences.join("") : ""}`;
  if (text.trim()) lines.push(text);
  if (item.tableStruct) {
    for (const row of item.tableStruct.rows) {
      lines.push(indent + row.cells.map((c) => c.text).join("　　"));
    }
  }
  if (item.subitems) {
    for (const sub of item.subitems as typeof item[]) {
      lines.push(...itemToPlainText(sub, indent + "　"));
    }
  }
  return lines;
}

// ============================
// Helper: article to plain text
// ============================
function articleToPlainText(article: DocumentArticle | ParsedArticle, includeLawTitle = false): string {
  const lines: string[] = [];

  if (includeLawTitle && "lawTitle" in article) {
    // DocumentArticle type
  }

  const caption = "articleCaption" in article ? article.articleCaption : "";
  const title = "articleTitle" in article ? article.articleTitle : "";
  const paragraphs = article.paragraphs;

  if (caption) lines.push(caption);
  lines.push(title);

  for (const para of paragraphs) {
    const prefix = ("paragraphNum" in para && para.paragraphNum) ? `${para.paragraphNum}　` : "";
    const text = para.sentences.join("");
    lines.push(`${prefix}${text}`);

    const items = para.items || [];
    for (const item of items) {
      lines.push(...itemToPlainText(item as Parameters<typeof itemToPlainText>[0], "　"));
    }

    // Paragraph-level table
    if ("tableStruct" in para && para.tableStruct) {
      for (const row of para.tableStruct.rows) {
        lines.push("　" + row.cells.map((c) => c.text).join("　　"));
      }
    }
  }

  return lines.join("\n");
}

// ============================
// TXT Export (抜粋)
// ============================
export function generateTxt(articles: DocumentArticle[], documentTitle?: string) {
  const sections: string[] = [];

  if (documentTitle) {
    sections.push(documentTitle);
    sections.push("=".repeat(documentTitle.length * 2));
    sections.push(`作成日: ${new Date().toLocaleDateString("ja-JP")}`);
    sections.push("");
  }

  // Group by law
  const lawGroups = new Map<string, DocumentArticle[]>();
  for (const article of articles) {
    const key = article.lawTitle;
    if (!lawGroups.has(key)) lawGroups.set(key, []);
    lawGroups.get(key)!.push(article);
  }

  for (const [lawTitle, lawArticles] of Array.from(lawGroups.entries())) {
    sections.push(`■ ${lawTitle}`);
    if (lawArticles[0]?.lawNum) {
      sections.push(`  （${lawArticles[0].lawNum}）`);
    }
    sections.push("");

    for (const article of lawArticles) {
      sections.push(articleToPlainText(article));
      sections.push("");
    }

    sections.push("-".repeat(40));
    sections.push("");
  }

  const content = sections.join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const lawNames = Array.from(new Set(articles.map((a) => a.lawTitle))).join("・");
  const baseName = lawNames ? `${dateStr}条文抜粋（${lawNames}）` : `${dateStr}条文抜粋`;
  saveAs(blob, `${baseName}.txt`);
}

// ============================
// Markdown helpers
// ============================
type MarkdownItem = { title: string; sentences: string[]; subitems?: unknown[]; tableStruct?: { rows: { cells: { text: string }[] }[] } };

function tableToMarkdown(table: { rows: { cells: { text: string }[] }[] }): string[] {
  if (!table.rows.length) return [];
  const lines: string[] = [];
  // Header row
  const header = table.rows[0];
  lines.push("| " + header.cells.map((c) => c.text || " ").join(" | ") + " |");
  lines.push("|" + header.cells.map(() => "---").join("|") + "|");
  for (let i = 1; i < table.rows.length; i++) {
    lines.push("| " + table.rows[i].cells.map((c) => c.text || " ").join(" | ") + " |");
  }
  return lines;
}

function itemToMarkdown(item: MarkdownItem, depth: number): string[] {
  const lines: string[] = [];
  const prefix = "  ".repeat(depth) + "- ";
  const text = `${item.title}${item.sentences.join("") ? "　" + item.sentences.join("") : ""}`;
  if (text.trim()) lines.push(`${prefix}${text}`);
  if (item.tableStruct) {
    lines.push("");
    lines.push(...tableToMarkdown(item.tableStruct).map((l) => "  ".repeat(depth + 1) + l));
    lines.push("");
  }
  if (item.subitems) {
    for (const sub of item.subitems as MarkdownItem[]) {
      lines.push(...itemToMarkdown(sub, depth + 1));
    }
  }
  return lines;
}

// ============================
// Markdown Export (抄粋)
// ============================
export function generateMarkdown(articles: DocumentArticle[], documentTitle?: string) {
  const lines: string[] = [];

  if (documentTitle) {
    lines.push(`# ${documentTitle}`);
    lines.push("");
    lines.push(`> 作成日: ${new Date().toLocaleDateString("ja-JP")}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // Group by law
  const lawGroups = new Map<string, DocumentArticle[]>();
  for (const article of articles) {
    const key = article.lawTitle;
    if (!lawGroups.has(key)) lawGroups.set(key, []);
    lawGroups.get(key)!.push(article);
  }

  for (const [lawTitle, lawArticles] of Array.from(lawGroups.entries())) {
    lines.push(`## ${lawTitle}`);
    if (lawArticles[0]?.lawNum) {
      lines.push("");
      lines.push(`*${lawArticles[0].lawNum}*`);
    }
    lines.push("");

    for (const article of lawArticles) {
      if (article.articleCaption) {
        lines.push(`**${article.articleCaption}**`);
      }
      lines.push(`### ${article.articleTitle}`);
      lines.push("");

      for (const para of article.paragraphs) {
        const prefix = para.paragraphNum ? `**${para.paragraphNum}**　` : "";
        lines.push(`${prefix}${para.sentences.join("")}`);
        lines.push("");

        for (const item of para.items) {
          lines.push(...itemToMarkdown(item as Parameters<typeof itemToMarkdown>[0], 0));
        }
        if (para.items.length > 0) lines.push("");

        // Paragraph-level table
        if (para.tableStruct) {
          lines.push(...tableToMarkdown(para.tableStruct));
          lines.push("");
        }
      }
    }

    lines.push("---");
    lines.push("");
  }

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const lawNames = Array.from(new Set(articles.map((a) => a.lawTitle))).join("・");
  const baseName = lawNames ? `${dateStr}条文抜粋（${lawNames}）` : `${dateStr}条文抜粋`;
  saveAs(blob, `${baseName}.md`);
}

// ============================
// Full Law Download - Word
// ============================
export async function generateFullLawDocx(
  lawTitle: string,
  lawNum: string,
  articles: ParsedArticle[]
) {
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      text: lawTitle,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // Law number
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: `（${lawNum}）`,
          size: 22,
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

  for (const article of articles) {
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

      children.push(
        new Paragraph({
          spacing: { after: 80 },
          indent: { firstLine: convertMillimetersToTwip(10) },
          children: [
            new TextRun({
              text: prefix + paraText,
              size: 22,
              font: "游明朝",
            }),
          ],
        })
      );

      for (const item of para.items) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: convertMillimetersToTwip(15) },
            children: [
              new TextRun({
                text: `${item.title}　${item.sentences.join("")}`,
                size: 22,
                font: "游明朝",
              }),
            ],
          })
        );
      }
    }
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
  saveAs(blob, `${lawTitle}.docx`);
}

// ============================
// Full Law Download - TXT
// ============================
export function generateFullLawTxt(
  lawTitle: string,
  lawNum: string,
  articles: ParsedArticle[]
) {
  const lines: string[] = [];

  lines.push(lawTitle);
  lines.push(`（${lawNum}）`);
  lines.push("=".repeat(lawTitle.length * 2));
  lines.push("");

  for (const article of articles) {
    if (article.articleCaption) {
      lines.push(article.articleCaption);
    }
    lines.push(article.articleTitle);

    for (const para of article.paragraphs) {
      const prefix = para.paragraphNum ? `${para.paragraphNum}　` : "";
      lines.push(`${prefix}${para.sentences.join("")}`);

      for (const item of para.items) {
        lines.push(`　${item.title}　${item.sentences.join("")}`);
      }
    }
    lines.push("");
  }

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  saveAs(blob, `${lawTitle}.txt`);
}

// ============================
// Full Law Download - Markdown
// ============================
export function generateFullLawMarkdown(
  lawTitle: string,
  lawNum: string,
  articles: ParsedArticle[]
) {
  const lines: string[] = [];

  lines.push(`# ${lawTitle}`);
  lines.push("");
  lines.push(`*${lawNum}*`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const article of articles) {
    if (article.articleCaption) {
      lines.push(`**${article.articleCaption}**`);
    }
    lines.push(`## ${article.articleTitle}`);
    lines.push("");

    for (const para of article.paragraphs) {
      const prefix = para.paragraphNum ? `**${para.paragraphNum}**　` : "";
      lines.push(`${prefix}${para.sentences.join("")}`);
      lines.push("");

      for (const item of para.items) {
        lines.push(`- **${item.title}**　${item.sentences.join("")}`);
      }
      if (para.items.length > 0) lines.push("");
    }
  }

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, `${lawTitle}.md`);
}
