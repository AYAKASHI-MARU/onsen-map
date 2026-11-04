# 調査の進捗

調査は地方ごとに段階を分けて進める。1つの担当（エージェント）＝1都道府県（大きい道県は地域で分割）。
各段階が終わるたびに `npm run data` でデータを作り直し、`research/build-report.md` の警告を確認してから次へ進む。

| 段階 | 地方 | 担当（出力ファイル） | 状態 |
|---|---|---|---|
| 0 | 試験 | 14-kanagawa | 完了（69件） |
| 1 | 関東 | 08-ibaraki, 09-tochigi, 10-gunma, 11-saitama, 12-chiba, 13-tokyo-23ku, 13-tokyo-tama | 完了（312件: 茨城30・栃木43・群馬45・埼玉57・千葉37・東京23区44・東京多摩22、神奈川は段階0） |
| 2 | 中部 | 15-niigata, 16-toyama, 17-ishikawa, 18-fukui, 19-yamanashi, 20-nagano-north（北信・東信）, 20-nagano-south（中信・南信）, 21-gifu, 22-shizuoka-izu（伊豆半島・熱海・伊東）, 22-shizuoka（伊豆以外）, 23-aichi | 完了: 山梨48・新潟60・長野北47・長野南56・富山29・石川53・福井28・岐阜45・静岡伊豆34・静岡31・愛知35（中部 完了） |
| 3 | 近畿 | 24-mie, 25-shiga, 26-kyoto, 27-osaka, 28-hyogo, 29-nara, 30-wakayama | 完了: 三重34・滋賀18・京都27・兵庫71・大阪52・奈良22・和歌山24（近畿 完了） |
| 4 | 北海道・東北 | 01-hokkaido-central（石狩・空知・後志・胆振・日高）, 01-hokkaido-southnorth（渡島・檜山・上川・留萌・宗谷）, 01-hokkaido-east（オホーツク・十勝・釧路・根室）, 02-aomori, 03-iwate, 04-miyagi, 05-akita, 06-yamagata, 07-fukushima | 完了: 道央99・道南道北64・道東61（北海道 完了）・青森106・岩手48・山形36・宮城25・秋田55・福島54（東北 完了） |
| 5 | 中国・四国 | 31-tottori＋32-shimane, 33-okayama, 34-hiroshima, 35-yamaguchi, 36-tokushima＋39-kochi, 37-kagawa, 38-ehime | 完了: 鳥取18・島根24・岡山23・広島35・香川28・徳島18・高知18・山口38・愛媛43（中国・四国 完了） |
| 6 | 九州・沖縄 | 40-fukuoka, 41-saga, 42-nagasaki, 43-kumamoto, 44-oita, 45-miyazaki, 46-kagoshima, 47-okinawa | 完了: 福岡31・佐賀25・長崎41・熊本72・大分62・沖縄12・宮崎38・鹿児島126（九州・沖縄 完了） |

## 補完調査（全国が終わった後）

- 千葉県: 天然温泉の銭湯が未調査
- 各県: 料金・サウナ可否が公式で確認できなかった旅館ホテル（各ファイルの notes 参照）
- 兵庫県: WebSearch の上限に達し後半はポータル頼り（medium 53件）。公式での再確認と、神戸の小さな銭湯・有馬/城崎などの旅館の確認
- 青森県: low 42件（多くは温泉銭湯の料金が改定前の480円のまま。2026/6/1から上限530円）。公式・電話情報で料金の再確認。あすなろ温泉・岩木温泉の所在地の確認

## 段階7: 補完（2026-11-02 から）

| 担当 | 内容 | 状態 |
|---|---|---|
| S1 座標補正 | research/coord-fix-targets.txt の施設（市区町村の代表点どまり・座標なし）について、公式サイトのアクセス情報や地図埋め込みから正しい住所・座標を取り、research/overrides.json に書く | 完了（74/75件。スパ・ウッド観光ホテルのみ未補正） |
| S2 兵庫 再確認 | 28-hyogo.json の medium 施設を公式サイトで再確認し、料金・サウナを更新して high にする | 完了（high 28件昇格・5件追加、71→76件） |
| S3 青森 料金確認 | 02-aomori.json の low 施設（主に温泉銭湯の480円）の現行料金を確認する | 完了（31件確認・1件除外＋よこはま温泉を除外） |
| S4 千葉 銭湯 | 千葉県の天然温泉の銭湯（サウナ付き）を調べて 12-chiba.json に追加する | 完了（条件に合う銭湯なし・追加0件） |

## 段階8: 銭湯・スーパー銭湯（2026-11-03 から・範囲B）

天然温泉ではないサウナ付きの銭湯（sento）とスーパー銭湯（super）。指示は `research/AGENT_PROMPT_SENTO.md`、ルールは README の「銭湯・スーパー銭湯」の節。上から順に起動する。

| 担当 | 範囲 | 出力ファイル | 状態 |
|---|---|---|---|
| B1 | 東京23区 東部（足立・葛飾・江戸川・墨田・江東・荒川・台東・北・板橋） | 13-tokyo-23ku-east-sento | 完了（88件） |
| B2 | 東京23区 西部・都心（千代田・中央・港・新宿・文京・品川・目黒・大田・世田谷・渋谷・中野・杉並・豊島・練馬） | 13-tokyo-23ku-west-sento | 完了（107件） |
| B3 | 大阪市 | 27-osaka-city-sento | 完了（116件） |
| B4 | 大阪府（大阪市以外） | 27-osaka-other-sento | 完了（82件） |
| B5 | 神奈川県 | 14-kanagawa-sento | 完了（59件） |
| B6 | 埼玉県 | 11-saitama-sento | 完了（29件） |
| B7 | 千葉県 | 12-chiba-sento | 完了（36件） |
| B8 | 東京都 多摩・島しょ | 13-tokyo-tama-sento | 完了（33件） |
| B9 | 茨城・栃木・群馬 | 08-ibaraki-sento, 09-tochigi-sento, 10-gunma-sento | 完了（36件: 茨城24・栃木8・群馬4） |
| B10 | 北海道 | 01-hokkaido-sento | 完了（74件） |
| B11 | 東北6県 | 02-aomori-sento, 03-iwate-sento, 04-miyagi-sento, 05-akita-sento, 06-yamagata-sento, 07-fukushima-sento | 完了（79件: 青森28・岩手12・宮城11・秋田14・山形5・福島9） |
| B12 | 新潟・富山・石川・福井・長野 | 15-niigata-sento, 16-toyama-sento, 17-ishikawa-sento, 18-fukui-sento, 20-nagano-sento | 完了（83件: 新潟18・富山35・石川15・福井8・長野7） |
| B13 | 山梨・静岡・岐阜 | 19-yamanashi-sento, 22-shizuoka-sento, 21-gifu-sento | 完了（38件: 山梨6・静岡18・岐阜14） |
| B14 | 愛知・三重 | 23-aichi-sento, 24-mie-sento | 完了（79件: 愛知69・三重10） |
| B15 | 京都・滋賀・奈良 | 26-kyoto-sento, 25-shiga-sento, 29-nara-sento | 完了（99件: 京都78・滋賀13・奈良8） |
| B16 | 兵庫・和歌山 | 28-hyogo-sento, 30-wakayama-sento | 完了（63件: 兵庫59・和歌山4） |
| B17 | 中国5県（鳥取・島根・岡山・広島・山口） | 31-tottori-sento, 32-shimane-sento, 33-okayama-sento, 34-hiroshima-sento, 35-yamaguchi-sento | 完了（35件: 鳥取0・島根1・岡山7・広島21・山口6） |
| B18 | 四国4県 | 36-tokushima-sento, 37-kagawa-sento, 38-ehime-sento, 39-kochi-sento | 完了（53件: 徳島14・香川12・愛媛22・高知5） |
| B19 | 九州北部（福岡・佐賀・長崎・大分） | 40-fukuoka-sento, 41-saga-sento, 42-nagasaki-sento, 44-oita-sento | 完了（41件: 福岡29・佐賀2・長崎4・大分1） |
| B20 | 九州南部・沖縄（熊本・宮崎・鹿児島・沖縄） | 43-kumamoto-sento, 45-miyazaki-sento, 46-kagoshima-sento, 47-okinawa-sento | 完了（13件: 熊本3・宮崎6・鹿児島3・沖縄1） |
