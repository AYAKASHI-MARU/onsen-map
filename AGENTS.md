# 全国温泉マップ

サウナ付きの天然温泉（日帰り入浴可）を日本地図に表示し、タップすると温泉名・料金（平日/休日の大人）・現在地から車での移動時間を表示する PWA。

## 構成

- `src/main.ts` 地図（Leaflet + markercluster、地理院タイル）・詳細カード・検索・現在地
- `src/travel.ts` 車の移動時間。Google Routes API（`.env.local` の `VITE_GOOGLE_MAPS_API_KEY`）→ OSRM → 直線距離の概算、の順で使う
- `public/data/onsen.json` アプリが読むデータ（**手で編集しない**。`npm run data` で生成）
- `research/README.md` 調査ルール（収録条件・料金ルール・出力形式）
- `research/raw/*.json` 都道府県ごとの調査結果
- `research/PROGRESS.md` 段階調査の進捗
- `research/overrides.json` 座標の手動補正・除外
- `scripts/build-data.mjs` 調査結果 → アプリ用データ（ジオコーディング・検証・重複除去）

## コマンド

- `npm run dev` 開発サーバー（http://localhost:5173）
- `npm run data` データ生成（結果は `research/build-report.md`）
- `npm run build` 本番ビルド（`dist/` を静的ホスティングに置けば動く）

## データ調査の進め方

1都道府県（大きい道県は地域分割）を1エージェントに任せ、地方ごとに段階を分けて実行する。
エージェントへの指示は `research/AGENT_PROMPT.md` のテンプレートを使う。各段階の後に `npm run data` → レポートの警告確認。

### 利用上限で止まったときの再開（ユーザーの指示）

- 調査は**同時3件まで**。利用上限（session limit）で止まったら、**解除時刻の後に自動で再開する**。
- セッション内では CronCreate の定期見回り（30分ごと）で、実行中の調査が3件未満なら再開・新規起動する。
- 新しいセッションでこのプロジェクトを開いたときに調査が終わっていなければ、ユーザーに聞かずに続きから再開する:
  1. `research/PROGRESS.md` で、未完了の担当を確認する。
  2. `research/raw/` にある途中のファイルは、確認済みの施設を調べ直さず続きから進めるよう、テンプレートの指示に書き添えて新しいエージェントを起動する。
  3. 同じ定期見回り（CronCreate）を作り直す。
