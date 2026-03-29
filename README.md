# LegalClip

e-Gov 法令 API を利用した条文抜粋・全文ダウンロードツール。

## 概要

LegalClip は、日本の法令データベース（e-Gov）から条文を検索・抜粋し、Word / テキスト / Markdown 形式でダウンロードできる Web アプリです。条文に含まれる表（TableStruct）やサブ項目も正確に出力します。

## 主な機能

| 機能 | 説明 |
|------|------|
| 法令検索 | 法令名・キーワードで e-Gov API を検索 |
| 条文抜粋 | 任意の条文を選択してペーパーに追加 |
| 全文ダウンロード | 法令全体を一括ダウンロード |
| 表・サブ項目対応 | TableStruct（表）・号・サブ項目を正確に出力 |
| 複数形式出力 | Word (.docx) / テキスト (.txt) / Markdown (.md) |
| ファイル名設定 | ダウンロード時に日付プレフィックスを設定可能 |
| お気に入り・履歴 | よく使う法令をブックマーク、閲覧履歴を保持 |
| アノテーション | 条文にメモ・ハイライトを付加 |

## 技術スタック

- **フロントエンド**: React 19 + TypeScript + Tailwind CSS 4
- **UI コンポーネント**: shadcn/ui
- **法令データ**: [e-Gov 法令 API v2](https://laws.e-gov.go.jp/api/)
- **Word 生成**: docx.js
- **ファイル保存**: file-saver

## ファイル構成

```
client/src/
├── components/
│   ├── LawSearch.tsx       # 法令検索・条文一覧
│   ├── PaperEditor.tsx     # 条文ペーパー編集・表示
│   └── Outline.tsx         # アウトライン・検索・プロパティ
├── contexts/
│   └── DocumentContext.tsx # ペーパー状態管理
├── lib/
│   ├── egov-api.ts         # e-Gov API クライアント・パーサー
│   ├── docx-generator.ts   # 抜粋 Word 生成
│   └── export-utils.ts     # TXT / Markdown / 全文 Word 生成
└── pages/
    └── Home.tsx            # メインレイアウト
```

## 使い方

1. 左ペインの検索欄に法令名またはキーワードを入力
2. 法令を選択し、条文一覧から「追加」ボタンで中央ペーパーに追加
3. ペーパー上部の「ダウンロード」から形式を選択してエクスポート
4. 全文ダウンロードは法令ページ上部の「全文 DL」ボタンから実行

## 注意事項

- 本ツールは e-Gov 法令 API の公開データを利用しています
- 法令データの正確性は e-Gov の提供内容に依存します
- インターネット接続が必要です
