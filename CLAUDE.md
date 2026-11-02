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

## 公開

- GitHub: `AYAKASHI-MARU/onsen-map`（公開リポジトリ）。`main` に push すると `.github/workflows/deploy.yml` がビルドして GitHub Pages に公開する。
- アプリの URL: https://ayakashi-maru.github.io/onsen-map/
- Google Maps の API キーは、リポジトリの Secrets `VITE_GOOGLE_MAPS_API_KEY` に入れるとビルドに使われる（未設定なら OSRM）。
- **有料サービスは使わない**（ユーザーの指示・2026-11-02）。少しでも料金が発生しうるサービス（Google Cloud・Routes API など）は導入も提案もしない。移動時間は無料の OSRM で計算し、Google マップへはリンク（キー不要）でつなぐ。

## データ調査の進め方

1都道府県（大きい道県は地域分割）を1エージェントに任せ、地方ごとに段階を分けて実行する。
エージェントへの指示は `research/AGENT_PROMPT.md` のテンプレートを使う。各段階の後に `npm run data` → レポートの警告確認。

### 利用量の自主制限と再開（ユーザーの指示・2026-11-01 改定）

- 調査は**同時3件まで**。調査エージェントは effort を **xhigh（超高）** で起動する（ユーザーの指示・2026-11-02）。
- MAX プランに変更済み。ただし**これまでの利用上限1回分（調査エージェント合計 約100万トークン）を使ったら、5時間休む**。記録は `research/budget.json`。
  - 調査担当が完了したら、通知の subagent_tokens を usedTokens に足し、log に追記する。
  - usedTokens が limitTokens 以上なら、新しい起動・再開をしない（実行中のものはそのまま終わらせる）。
  - windowStart から5時間たったら、windowStart を今の時刻に、usedTokens を0に戻して再開する。
- 定期見回り（CronCreate・30分ごと）で上の判断をし、実行中が3件未満で枠に余裕があれば、未完了の担当を起動する。担当と ID は `research/agents.md`。
- 新しいセッションで調査が終わっていなければ、ユーザーに聞かずに続きから再開し、見回りを作り直す（途中のファイルは「確認済みは調べ直さず続きから」と指示して新しいエージェントを起動）。
