/**
 * Word (docx) ファイル生成ユーティリティ
 * docx ライブラリを使用して条文抜粋をWordファイルに変換
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
} from "docx";
import { saveAs } from "file-saver";

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
      // Article caption (e.g., （目的）)
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

      // Article title (e.g., 第一条)
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

        // Items (号)
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
  const filename = documentTitle
    ? `${documentTitle}.docx`
    : `条文抜粋_${new Date().toISOString().slice(0, 10)}.docx`;
  saveAs(blob, filename);
}
