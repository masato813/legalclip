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
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import type { DocumentArticle } from "./docx-generator";
import type { ParsedArticle, ParsedItem } from "./egov-api";

// ============================
// Shared table type (works for both ParsedTable and DocumentTable)
// ============================
type AnyTable = { rows: { cells: { text: string; colspan?: number; rowspan?: number }[] }[] };
type AnyItem = { title: string; sentences: string[]; subitems?: AnyItem[]; tableStruct?: AnyTable };

// A4 本文幅: 210mm - 左右25mm*2 = 160mm = 9072 twip
const PAGE_BODY_WIDTH_TWIP = convertMillimetersToTwip(160);

// ============================
// Helper: build docx Table with optional left indent
// ============================
function buildFullDocxTable(table: AnyTable, leftIndent = 0): Table {
  // 表幅 = 本文幅 - 左インデント分
  const tableWidth = Math.max(PAGE_BODY_WIDTH_TWIP - leftIndent, convertMillimetersToTwip(80));
  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    indent: leftIndent > 0 ? { size: leftIndent, type: WidthType.DXA } : undefined,
    rows: table.rows.map(
      (row) =>
        new TableRow({
          children: row.cells.map(
            (cell) =>
              new TableCell({
                columnSpan: cell.colspan,
                rowSpan: cell.rowspan,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cell.text,
                        size: 20,
                        font: "游明朝",
                      }),
                    ],
                  }),
                ],
              })
          ),
        })
    ),
  });
}

// ============================
// Helper: item to docx paragraphs (recursive)
// ============================
function buildFullItemParagraphs(
  item: AnyItem,
  leftIndent: number,
  out: (Paragraph | Table)[]
): void {
  const text = `${item.title}${item.sentences.join("") ? "　" + item.sentences.join("") : ""}`;
  if (text.trim()) {
    out.push(
      new Paragraph({
        spacing: { after: 40 },
        indent: { left: leftIndent },
        children: [new TextRun({ text, size: 22, font: "游明朝" })],
      })
    );
  }
  if (item.tableStruct) {
    out.push(buildFullDocxTable(item.tableStruct, leftIndent));
  }
  if (item.subitems) {
    for (const sub of item.subitems) {
      buildFullItemParagraphs(sub, leftIndent + convertMillimetersToTwip(10), out);
    }
  }
}

// ============================
// Helper: item to plain text (recursive)
// ============================
function itemToPlainText(item: AnyItem, indent: string): string[] {
  const lines: string[] = [];
  const text = `${indent}${item.title}${item.sentences.join("") ? "　" + item.sentences.join("") : ""}`;
  if (text.trim()) lines.push(text);
  if (item.tableStruct) {
    for (const row of item.tableStruct.rows) {
      lines.push(indent + row.cells.map((c) => c.text).join("　　"));
    }
  }
  if (item.subitems) {
    for (const sub of item.subitems) {
      lines.push(...itemToPlainText(sub, indent + "　"));
    }
  }
  return lines;
}

// ============================
// Helper: article to plain text
// ============================
function articleToPlainText(article: DocumentArticle | ParsedArticle): string {
  const lines: string[] = [];
  const caption = "articleCaption" in article ? article.articleCaption : "";
  const title = "articleTitle" in article ? article.articleTitle : "";
  const paragraphs = article.paragraphs;

  if (caption) lines.push(caption);
  lines.push(title);

  for (const para of paragraphs) {
    const prefix = ("paragraphNum" in para && para.paragraphNum) ? `${para.paragraphNum}　` : "";
    const text = para.sentences.join("");
    lines.push(`${prefix}${text}`);

    const items = (para.items || []) as AnyItem[];
    for (const item of items) {
      lines.push(...itemToPlainText(item, "　"));
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
// Markdown helpers
// ============================
function tableToMarkdown(table: AnyTable): string[] {
  if (!table.rows.length) return [];
  const lines: string[] = [];
  const header = table.rows[0];
  lines.push("| " + header.cells.map((c) => c.text || " ").join(" | ") + " |");
  lines.push("|" + header.cells.map(() => "---").join("|") + "|");
  for (let i = 1; i < table.rows.length; i++) {
    lines.push("| " + table.rows[i].cells.map((c) => c.text || " ").join(" | ") + " |");
  }
  return lines;
}

function itemToMarkdown(item: AnyItem, depth: number): string[] {
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
    for (const sub of item.subitems) {
      lines.push(...itemToMarkdown(sub, depth + 1));
    }
  }
  return lines;
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
// Markdown Export (抜粋)
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

        for (const item of para.items as AnyItem[]) {
          lines.push(...itemToMarkdown(item, 0));
        }
        if (para.items.length > 0) lines.push("");

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
  articles: ParsedArticle[],
  fileName?: string
) {
  const baseName = fileName ?? lawTitle;
  const children: (Paragraph | Table)[] = [];

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

      // Items with subitems and tables
      for (const item of para.items as AnyItem[]) {
        buildFullItemParagraphs(item, convertMillimetersToTwip(15), children);
      }

      // Paragraph-level table
      if (para.tableStruct) {
        children.push(buildFullDocxTable(para.tableStruct, convertMillimetersToTwip(10)));
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
  saveAs(blob, `${baseName}.docx`);
}

// ============================
// Full Law Download - TXT
// ============================
export function generateFullLawTxt(
  lawTitle: string,
  lawNum: string,
  articles: ParsedArticle[],
  fileName?: string
) {
  const baseName = fileName ?? lawTitle;
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

      for (const item of para.items as AnyItem[]) {
        lines.push(...itemToPlainText(item, "　"));
      }

      // Paragraph-level table
      if (para.tableStruct) {
        for (const row of para.tableStruct.rows) {
          lines.push("　" + row.cells.map((c) => c.text).join("　　"));
        }
      }
    }
    lines.push("");
  }

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  saveAs(blob, `${baseName}.txt`);
}

// ============================
// Full Law Download - Markdown
// ============================
export function generateFullLawMarkdown(
  lawTitle: string,
  lawNum: string,
  articles: ParsedArticle[],
  fileName?: string
) {
  const baseName = fileName ?? lawTitle;
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

      for (const item of para.items as AnyItem[]) {
        lines.push(...itemToMarkdown(item, 0));
      }
      if (para.items.length > 0) lines.push("");

      // Paragraph-level table
      if (para.tableStruct) {
        lines.push(...tableToMarkdown(para.tableStruct));
        lines.push("");
      }
    }
  }

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, `${baseName}.md`);
}
