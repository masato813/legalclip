/**
 * e-Gov法令API v2 クライアント
 * Base URL: https://laws.e-gov.go.jp/api/2
 * CORS: access-control-allow-origin: * (ブラウザから直接呼び出し可能)
 */

const BASE_URL = "https://laws.e-gov.go.jp/api/2";

// --- Types ---

export interface LawInfo {
  law_type: string;
  law_id: string;
  law_num: string;
  law_num_era: string;
  law_num_year: number;
  law_num_type: string;
  law_num_num: string;
  promulgation_date: string;
}

export interface RevisionInfo {
  law_revision_id: string;
  law_type: string;
  law_title: string;
  law_title_kana: string;
  abbrev: string | null;
  category: string;
  updated: string;
  amendment_enforcement_date: string;
  current_revision_status: string;
}

export interface LawListItem {
  law_info: LawInfo;
  revision_info: RevisionInfo;
  current_revision_info?: RevisionInfo;
}

export interface LawListResponse {
  total_count: number;
  count: number;
  next_offset: number;
  laws: LawListItem[];
}

export interface LawFullTextNode {
  tag: string;
  attr: Record<string, string>;
  children: (LawFullTextNode | string)[];
}

export interface LawDataResponse {
  law_info: LawInfo;
  revision_info: RevisionInfo;
  law_full_text: LawFullTextNode;
}

export interface KeywordSearchItem {
  law_info: LawInfo;
  revision_info: RevisionInfo;
  sentences: { position: string; text: string }[];
}

export interface KeywordSearchResponse {
  total_count: number;
  count: number;
  next_offset: number;
  items: KeywordSearchItem[];
}

// --- Parsed article types ---

export interface ParsedArticle {
  id: string;
  articleNum: string;
  articleCaption: string;
  articleTitle: string;
  paragraphs: ParsedParagraph[];
  rawNode: LawFullTextNode;
}

export interface ParsedParagraph {
  num: string;
  paragraphNum: string;
  sentences: string[];
  items: ParsedItem[];
  tableStruct?: ParsedTable;
}

export interface ParsedItem {
  title: string;
  sentences: string[];
  subitems?: ParsedItem[];
  tableStruct?: ParsedTable;
  columns?: string[];
}

export interface ParsedTableCell {
  text: string;
  colspan?: number;
  rowspan?: number;
  align?: string;
}

export interface ParsedTableRow {
  cells: ParsedTableCell[];
}

export interface ParsedTable {
  rows: ParsedTableRow[];
}

// --- API Functions ---

export async function searchLaws(
  title: string,
  lawType?: string,
  limit = 20,
  offset = 0
): Promise<LawListResponse> {
  const params = new URLSearchParams({
    law_title: title,
    response_format: "json",
    limit: String(limit),
    offset: String(offset),
  });
  if (lawType) params.set("law_type", lawType);

  const res = await fetch(`${BASE_URL}/laws?${params}`);
  if (!res.ok) throw new Error(`法令検索に失敗しました: ${res.status}`);
  return res.json();
}

export async function getLawData(lawIdOrNum: string): Promise<LawDataResponse> {
  const params = new URLSearchParams({
    response_format: "json",
    law_full_text_format: "json",
  });

  const res = await fetch(`${BASE_URL}/law_data/${encodeURIComponent(lawIdOrNum)}?${params}`);
  if (!res.ok) throw new Error(`法令本文の取得に失敗しました: ${res.status}`);
  return res.json();
}

export async function keywordSearch(
  keyword: string,
  limit = 20,
  offset = 0
): Promise<KeywordSearchResponse> {
  const params = new URLSearchParams({
    keyword,
    response_format: "json",
    limit: String(limit),
    offset: String(offset),
  });

  const res = await fetch(`${BASE_URL}/keyword?${params}`);
  if (!res.ok) throw new Error(`キーワード検索に失敗しました: ${res.status}`);
  return res.json();
}

// --- Parser Functions ---

function extractText(node: LawFullTextNode | string): string {
  if (typeof node === "string") return node;
  if (!node.children) return "";
  return node.children.map(extractText).join("");
}

function findChildByTag(node: LawFullTextNode, tag: string): LawFullTextNode | undefined {
  if (!node.children) return undefined;
  return node.children.find(
    (c): c is LawFullTextNode => typeof c !== "string" && c.tag === tag
  );
}

function findChildrenByTag(node: LawFullTextNode, tag: string): LawFullTextNode[] {
  if (!node.children) return [];
  return node.children.filter(
    (c): c is LawFullTextNode => typeof c !== "string" && c.tag === tag
  );
}

function parseTableStruct(tableStructNode: LawFullTextNode): ParsedTable | undefined {
  const tableNode = findChildByTag(tableStructNode, "Table");
  if (!tableNode) return undefined;
  const rows: ParsedTableRow[] = [];
  const rowNodes = findChildrenByTag(tableNode, "TableRow");
  for (const rowNode of rowNodes) {
    const cells: ParsedTableCell[] = [];
    const colNodes = findChildrenByTag(rowNode, "TableColumn");
    for (const colNode of colNodes) {
      cells.push({
        text: extractText(colNode),
        colspan: colNode.attr?.colspan ? Number(colNode.attr.colspan) : undefined,
        rowspan: colNode.attr?.rowspan ? Number(colNode.attr.rowspan) : undefined,
        align: colNode.attr?.Align,
      });
    }
    if (cells.length > 0) rows.push({ cells });
  }
  return rows.length > 0 ? { rows } : undefined;
}

/** Item/Subitem を再帰的にパース（表・サブ項目対応） */
function parseItem(itemNode: LawFullTextNode): ParsedItem {
  const titleTag = itemNode.tag === "Item" ? "ItemTitle"
    : itemNode.tag === "Subitem1" ? "Subitem1Title"
    : itemNode.tag === "Subitem2" ? "Subitem2Title"
    : itemNode.tag === "Subitem3" ? "Subitem3Title"
    : "ItemTitle";
  const sentenceTag = itemNode.tag === "Item" ? "ItemSentence"
    : itemNode.tag === "Subitem1" ? "Subitem1Sentence"
    : itemNode.tag === "Subitem2" ? "Subitem2Sentence"
    : itemNode.tag === "Subitem3" ? "Subitem3Sentence"
    : "ItemSentence";

  const titleNode = findChildByTag(itemNode, titleTag);
  const sentenceNode = findChildByTag(itemNode, sentenceTag);
  const sentences: string[] = [];
  if (sentenceNode) {
    // ItemSentence may contain Column nodes (for multi-column layout) or Sentence nodes
    const columnNodes = findChildrenByTag(sentenceNode, "Column");
    if (columnNodes.length > 0) {
      // Multi-column: join all column texts
      columnNodes.forEach(col => {
        const colSentences = findChildrenByTag(col, "Sentence");
        if (colSentences.length > 0) {
          colSentences.forEach(s => sentences.push(extractText(s)));
        } else {
          sentences.push(extractText(col));
        }
      });
    } else {
      const sNodes = findChildrenByTag(sentenceNode, "Sentence");
      if (sNodes.length > 0) {
        sNodes.forEach(s => sentences.push(extractText(s)));
      } else {
        sentences.push(extractText(sentenceNode));
      }
    }
  }

  // Parse nested subitems (Subitem1, Subitem2, etc.)
  const subitemTags = ["Subitem1", "Subitem2", "Subitem3"];
  const subitems: ParsedItem[] = [];
  for (const subTag of subitemTags) {
    const subNodes = findChildrenByTag(itemNode, subTag);
    subitems.push(...subNodes.map(parseItem));
  }

  // Parse TableStruct directly under this item/subitem
  const tableStructNode = findChildByTag(itemNode, "TableStruct");
  const tableStruct = tableStructNode ? parseTableStruct(tableStructNode) : undefined;

  return {
    title: titleNode ? extractText(titleNode) : "",
    sentences,
    subitems: subitems.length > 0 ? subitems : undefined,
    tableStruct,
  };
}

function parseParagraph(node: LawFullTextNode): ParsedParagraph {
  const num = node.attr?.Num || "";
  const paragraphNumNode = findChildByTag(node, "ParagraphNum");
  const paragraphNum = paragraphNumNode ? extractText(paragraphNumNode) : "";
  
  const sentenceNode = findChildByTag(node, "ParagraphSentence");
  const sentences: string[] = [];
  if (sentenceNode) {
    const sentenceChildren = findChildrenByTag(sentenceNode, "Sentence");
    if (sentenceChildren.length > 0) {
      sentenceChildren.forEach(s => sentences.push(extractText(s)));
    } else {
      sentences.push(extractText(sentenceNode));
    }
  }

  const items: ParsedItem[] = findChildrenByTag(node, "Item").map(parseItem);

  // Parse TableStruct directly under Paragraph
  const tableStructNode = findChildByTag(node, "TableStruct");
  const tableStruct = tableStructNode ? parseTableStruct(tableStructNode) : undefined;

  return { num, paragraphNum, sentences, items, tableStruct };
}

function parseArticle(node: LawFullTextNode): ParsedArticle {
  const captionNode = findChildByTag(node, "ArticleCaption");
  const titleNode = findChildByTag(node, "ArticleTitle");
  const paragraphs = findChildrenByTag(node, "Paragraph").map(parseParagraph);
  const num = node.attr?.Num || "";

  return {
    id: `article-${num}`,
    articleNum: num,
    articleCaption: captionNode ? extractText(captionNode) : "",
    articleTitle: titleNode ? extractText(titleNode) : "",
    paragraphs,
    rawNode: node,
  };
}

/** 法令本文のJSONツリーから全条文を抽出 */
export function extractArticles(lawFullText: LawFullTextNode): ParsedArticle[] {
  const articles: ParsedArticle[] = [];

  function walk(node: LawFullTextNode) {
    if (node.tag === "Article") {
      articles.push(parseArticle(node));
      return;
    }
    if (node.children) {
      for (const child of node.children) {
        if (typeof child !== "string") {
          walk(child);
        }
      }
    }
  }

  walk(lawFullText);
  return articles;
}

/** 法令本文のJSONツリーから構造（編・章・節）を抽出 */
export interface LawStructure {
  tag: string;
  title: string;
  num: string;
  children: LawStructure[];
  articles: ParsedArticle[];
}

export function extractStructure(lawFullText: LawFullTextNode): LawStructure[] {
  const structureTags = new Set([
    "Part", "Chapter", "Section", "Subsection", "Division",
    "MainProvision", "SupplProvision"
  ]);
  const titleTagMap: Record<string, string> = {
    Part: "PartTitle",
    Chapter: "ChapterTitle",
    Section: "SectionTitle",
    Subsection: "SubsectionTitle",
    Division: "DivisionTitle",
    SupplProvision: "SupplProvisionLabel",
  };

  // Counter for generating unique keys for SupplProvision nodes
  let supplProvisionCounter = 0;

  function buildStructure(node: LawFullTextNode): LawStructure | null {
    if (!structureTags.has(node.tag)) return null;

    const titleTag = titleTagMap[node.tag];
    const titleNode = titleTag ? findChildByTag(node, titleTag) : undefined;
    const title = titleNode ? extractText(titleNode) : (node.tag === "MainProvision" ? "本則" : node.tag);

    // Generate a unique num for SupplProvision nodes that lack one
    let num = node.attr?.Num || "";
    if (node.tag === "SupplProvision") {
      supplProvisionCounter++;
      if (!num) {
        num = `suppl-${supplProvisionCounter}`;
      }
    }

    const children: LawStructure[] = [];
    const articles: ParsedArticle[] = [];

    if (node.children) {
      for (const child of node.children) {
        if (typeof child === "string") continue;
        if (child.tag === "Article") {
          articles.push(parseArticle(child));
        } else if (structureTags.has(child.tag)) {
          const s = buildStructure(child);
          if (s) children.push(s);
        } else {
          // Recurse into non-structure nodes to find nested articles
          const nested = findArticlesDeep(child);
          articles.push(...nested);
          // And nested structures
          if (child.children) {
            for (const gc of child.children) {
              if (typeof gc !== "string" && structureTags.has(gc.tag)) {
                const s = buildStructure(gc);
                if (s) children.push(s);
              }
            }
          }
        }
      }
    }

    return { tag: node.tag, title, num, children, articles };
  }

  function findArticlesDeep(node: LawFullTextNode): ParsedArticle[] {
    const result: ParsedArticle[] = [];
    if (node.tag === "Article") {
      result.push(parseArticle(node));
      return result;
    }
    if (node.children) {
      for (const child of node.children) {
        if (typeof child !== "string" && child.tag === "Article") {
          result.push(parseArticle(child));
        }
      }
    }
    return result;
  }

  // Find LawBody
  const lawBody = findChildByTag(lawFullText, "LawBody");
  if (!lawBody) return [];

  const structures: LawStructure[] = [];
  if (lawBody.children) {
    for (const child of lawBody.children) {
      if (typeof child === "string") continue;
      if (structureTags.has(child.tag)) {
        const s = buildStructure(child);
        if (s) structures.push(s);
      }
    }
  }

  return structures;
}

/** 法令タイトルを取得 */
export function extractLawTitle(lawFullText: LawFullTextNode): string {
  const lawBody = findChildByTag(lawFullText, "LawBody");
  if (!lawBody) return "";
  const titleNode = findChildByTag(lawBody, "LawTitle");
  return titleNode ? extractText(titleNode) : "";
}
