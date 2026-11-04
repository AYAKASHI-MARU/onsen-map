# 全国温泉マップ

サウナ付きの天然温泉と銭湯・スーパー銭湯（日帰り入浴可）を日本地図に表示する PWA です。施設をタップすると、料金（平日・休日の大人）と現在地から車での移動時間を表示します。

- アプリ: https://ayakashi-maru.github.io/onsen-map/
- データ: 2026年10月29日時点・3,501件（天然温泉2,309・銭湯841・スーパー銭湯351。`public/data/onsen.json`）
- 地図: 国土地理院の地理院タイル
- 移動時間: Google Routes API（キー設定時）→ OSRM → 直線距離からの概算

料金や営業状況は変わることがあります。お出かけの前に各施設の公式情報をご確認ください。

## 開発

```sh
npm install
npm run dev     # 開発サーバー
npm run data    # research/raw/*.json からアプリ用データを生成
npm run build   # 本番ビルド（dist/）
```

`main` に push すると GitHub Actions がビルドし、GitHub Pages に公開します。
