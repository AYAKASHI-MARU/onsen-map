// research/raw/*.json（調査結果）から public/data/onsen.json（アプリ用データ）を作る
//   npm run data
// - 住所 → 座標は国土地理院の住所検索 API。町名までしか当たらないときは OpenStreetMap（Nominatim）で施設名を探して補う
// - 座標の逆引きで都道府県が合っているか確かめる
// - 結果は research/geocode-cache.json にキャッシュし、警告は research/build-report.md に書く
// - 手動の補正は research/overrides.json（{ "施設名": { "lat": 0, "lng": 0 } または { "exclude": true, "reason": "" } }）
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'research', 'raw');
const CACHE_FILE = path.join(ROOT, 'research', 'geocode-cache.json');
const OVERRIDES_FILE = path.join(ROOT, 'research', 'overrides.json');
const OUT_FILE = path.join(ROOT, 'public', 'data', 'onsen.json');
const REPORT_FILE = path.join(ROOT, 'research', 'build-report.md');
const AS_OF = '2026-10-29';
const UA = 'onsen-map-data-builder/0.1 (personal, non-commercial)';

const PREFS = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
  '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
  '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];
const prefCodeOf = (name) => String(PREFS.indexOf(name) + 1).padStart(2, '0');
const SAUNA_TYPES = new Set(['ドライ', 'スチーム', 'ミスト', '塩', '遠赤外線', 'ロウリュ可', 'その他']);
// 施設の種類: 天然温泉 / 銭湯（一般公衆浴場）/ スーパー銭湯など。kind が無い温泉データは onsen 扱い
const KINDS = new Set(['onsen', 'sento', 'super']);
const KIND_LABEL = { onsen: '天然温泉', sento: '銭湯', super: 'スーパー銭湯' };

const warnings = [];
const warn = (file, name, msg) => warnings.push({ file, name, msg });

const cache = existsSync(CACHE_FILE)
  ? JSON.parse(await readFile(CACHE_FILE, 'utf8'))
  : { gsi: {}, nominatim: {}, reverse: {} };
const overrides = existsSync(OVERRIDES_FILE) ? JSON.parse(await readFile(OVERRIDES_FILE, 'utf8')) : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) =>
  String(s ?? '')
    .normalize('NFKC')
    .replace(/[\s　]/g, '')
    .replace(/[‐－―ー−–—]/g, '-')
    .toLowerCase();

async function getJson(url, headers = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
      if (res.ok) return await res.json();
      if (res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i === 2) throw e;
    }
    await sleep(1500 * (i + 1));
  }
}

let cacheDirty = 0;
async function saveCache(force = false) {
  if (!force && cacheDirty < 25) return;
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 0));
  cacheDirty = 0;
}

// 国土地理院 住所検索
async function gsiGeocode(address) {
  if (address in cache.gsi) return cache.gsi[address];
  await sleep(120);
  const json = await getJson(
    `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`,
  );
  const target = norm(address);
  let best = null;
  for (const f of json ?? []) {
    const title = f.properties?.title ?? '';
    const t = norm(title);
    let k = 0;
    while (k < t.length && t[k] === target[k]) k++;
    if (!best || k > best.score) {
      best = { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], title, score: k };
    }
  }
  cache.gsi[address] = best;
  cacheDirty++;
  return best;
}

// 京都市の「○○通○○上ル」などの通り名を外した住所を返す（地理院の検索は通り名を解釈できない）
function stripKyotoStreet(address) {
  const m = address.match(/^(京都府京都市.+?区)(.*?(?:上ル|下ル|上る|下る|西入ル|東入ル|西入る|東入る|西入|東入))+(.+)$/);
  return m ? m[1] + m[3].replace(/^d+丁目/, '') : null;
}

// 地理院の結果が「市区町村」止まり（=役場などの代表点）かどうか
function isCoarse(title) {
  const rest = norm(title)
    .replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/, '')
    .replace(/^(.+?郡)?(.+?市)?(.+?[区町村])?/, '');
  return rest.length === 0;
}

// OpenStreetMap（Nominatim）で施設名を検索（近く 20km 以内に限る）
async function nominatimByName(name, near) {
  const key = `${name}@${near.lat.toFixed(2)},${near.lng.toFixed(2)}`;
  if (key in cache.nominatim) return cache.nominatim[key];
  await sleep(1100); // 利用規約: 1秒に1回まで
  const d = 0.2;
  const params = new URLSearchParams({
    q: name,
    format: 'jsonv2',
    countrycodes: 'jp',
    limit: '1',
    viewbox: `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`,
    bounded: '1',
  });
  const json = await getJson(`https://nominatim.openstreetmap.org/search?${params}`, { 'Accept-Language': 'ja' });
  const hit = json?.[0] ? { lat: Number(json[0].lat), lng: Number(json[0].lon), title: json[0].display_name } : null;
  cache.nominatim[key] = hit;
  cacheDirty++;
  return hit;
}

// 座標 → 市区町村コード（先頭2桁が都道府県コード）
async function reversePrefCode(lat, lng) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (!(key in cache.reverse)) {
    await sleep(120);
    const json = await getJson(
      `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`,
    );
    cache.reverse[key] = json?.results?.muniCd ?? null;
    cacheDirty++;
  }
  const cd = cache.reverse[key];
  return cd ? String(cd).padStart(5, '0').slice(0, 2) : null;
}

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function distanceM(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 利用者向けのお知らせ（定休日・臨時休館など）。notice が無ければ調査メモ（note）から休館などの文だけ拾う
function noticeOf(f) {
  const own = String(f.notice ?? '').trim();
  if (own) return own;
  const parts = String(f.note ?? '')
    .split(/。|\n/)
    .map((s) => s.trim())
    .filter((s) => /休館|休業|定休|曜休|曜日のみ|限定営業/.test(s) && !/ポータル|ニフティ|確認|記載|情報/.test(s));
  return parts.length ? parts.join('。') : undefined;
}

const isYen = (v) => v === null || (Number.isInteger(v) && v >= 0);
const isUrl = (s) => typeof s === 'string' && /^https?:\/\//.test(s);

// ---- 読み込みと検証 ----
const files = (await readdir(RAW_DIR)).filter((f) => f.endsWith('.json')).sort();
const perPref = new Map();
const candidates = [];
let excludedCount = 0;

for (const file of files) {
  let raw;
  try {
    raw = JSON.parse(await readFile(path.join(RAW_DIR, file), 'utf8'));
  } catch (e) {
    warn(file, '-', `JSON として読めません: ${e.message}`);
    continue;
  }
  excludedCount += raw.excluded?.length ?? 0;
  for (const f of raw.facilities ?? []) {
    const name = String(f.name ?? '').trim();
    const address = String(f.address ?? '').trim().normalize('NFKC').replace(/\s+/g, '');
    if (!name || !address) {
      warn(file, name || '(名前なし)', '名前か住所が空なので除外');
      continue;
    }
    const ov = overrides[name];
    if (ov?.exclude) {
      warn(file, name, `overrides で除外: ${ov.reason ?? ''}`);
      continue;
    }
    const pref = PREFS.find((p) => address.startsWith(p));
    if (!pref) {
      warn(file, name, `住所が都道府県名から始まっていないので除外: ${address}`);
      continue;
    }
    if (raw.prefecture && pref !== raw.prefecture) warn(file, name, `担当外の都道府県（${pref}）の施設`);

    const weekday = f.weekdayAdult ?? null;
    const holiday = f.holidayAdult ?? null;
    const saunaFee = f.saunaFee ?? null;
    if (!isYen(weekday) || !isYen(holiday) || !isYen(saunaFee)) {
      warn(file, name, `料金が整数でないので除外: ${weekday}/${holiday}/${saunaFee}`);
      continue;
    }
    for (const v of [weekday, holiday]) {
      if (v !== null && (v < 150 || v > 5000)) warn(file, name, `料金が想定外の範囲: ${v}円`);
    }
    if (weekday !== null && holiday !== null && holiday < weekday) warn(file, name, `休日料金が平日より安い: ${weekday}/${holiday}`);
    if (weekday === null && holiday === null) warn(file, name, '料金不明');

    const saunaTypes = (Array.isArray(f.saunaTypes) ? f.saunaTypes : []).filter((t) => SAUNA_TYPES.has(t));
    const confidence = ['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'medium';
    const sources = (Array.isArray(f.sources) ? f.sources : []).filter(isUrl);
    let kind = KINDS.has(f.kind) ? f.kind : null;
    if (!kind) {
      // 銭湯の調査ファイルで種類が無いものは、取り違えを避けるため入れない
      if (file.includes('-sento')) {
        warn(file, name, `kind が無い・不正なので除外: ${f.kind}`);
        continue;
      }
      kind = 'onsen';
    }
    if (!sources.length && !isUrl(f.url)) warn(file, name, '出典URLがない');

    candidates.push({
      file,
      kind,
      name,
      pref,
      address,
      weekday,
      holiday,
      saunaFee,
      // 調査メモ的な言い回しを利用者向けにする
      priceNote:
        String(f.priceNote ?? '')
          .trim()
          .replace(/サウナ(の)?(別)?料金(は)?未確認/g, 'サウナ料金は施設にご確認ください') || undefined,
      saunaTypes,
      saunaNote: String(f.saunaNote ?? '').trim() || undefined,
      notice: noticeOf(f),
      url: isUrl(f.url) ? f.url : undefined,
      sources,
      confidence,
      verifiedAt: /^\d{4}-\d{2}-\d{2}$/.test(raw.researchedAt ?? '') ? raw.researchedAt : AS_OF,
      override: ov,
    });
  }
}

// ---- 座標 ----
const located = [];
let i = 0;
for (const c of candidates) {
  i++;
  if (i % 50 === 0) console.log(`座標を確認中… ${i}/${candidates.length}`);
  let pos = null;
  let how = '';
  if (c.override?.lat != null && c.override?.lng != null) {
    pos = { lat: c.override.lat, lng: c.override.lng };
    how = 'override';
  } else {
    let g = await gsiGeocode(c.address);
    const kyoto = (!g || isCoarse(g.title)) && stripKyotoStreet(c.address);
    if (kyoto) {
      const g2 = await gsiGeocode(kyoto);
      if (g2 && !isCoarse(g2.title)) g = g2;
    }
    if (g) {
      pos = { lat: g.lat, lng: g.lng };
      how = 'gsi';
    }
    if (!g || isCoarse(g.title)) {
      const near = g ?? null;
      const n = near ? await nominatimByName(c.name, near) : null;
      if (n) {
        pos = { lat: n.lat, lng: n.lng };
        how = 'nominatim';
      } else if (g) {
        warn(c.file, c.name, `座標が市区町村の代表点どまり（${g.title}）。overrides.json で補正を推奨`);
        how = 'gsi-coarse';
      }
    }
  }
  await saveCache();
  if (!pos) {
    warn(c.file, c.name, `住所から座標を求められないので除外: ${c.address}`);
    continue;
  }
  if (how !== 'override') {
    const code = await reversePrefCode(pos.lat, pos.lng);
    if (code && code !== prefCodeOf(c.pref)) {
      warn(c.file, c.name, `座標の都道府県が住所と違う（${PREFS[Number(code) - 1]}）ので除外。overrides.json で補正を`);
      continue;
    }
  }
  located.push({ ...c, lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)), how });
}
await saveCache(true);

// ---- 重複の除去（同じ名前で 1km 以内） ----
const rank = { high: 3, medium: 2, low: 1 };
const kept = [];
for (const c of located) {
  const dup = kept.find((k) => norm(k.name) === norm(c.name) && distanceM(k, c) < 1000);
  if (!dup) {
    kept.push(c);
    continue;
  }
  warn(c.file, c.name, `重複（${dup.file} と同じ施設）`);
  // 種類が違う重複は調査済みの天然温泉を残す。同じ種類なら信頼度の高いほう
  const better = dup.kind !== c.kind ? c.kind === 'onsen' : rank[c.confidence] > rank[dup.confidence];
  if (better) kept[kept.indexOf(dup)] = c;
}

// ---- 出力 ----
kept.sort((a, b) => prefCodeOf(a.pref).localeCompare(prefCodeOf(b.pref)) || a.address.localeCompare(b.address, 'ja'));
const facilities = kept.map((c) => ({
  id: `${prefCodeOf(c.pref)}-${fnv1a(`${c.name}|${c.address}`)}`,
  kind: c.kind,
  name: c.name,
  pref: c.pref,
  address: c.address,
  lat: c.lat,
  lng: c.lng,
  weekday: c.weekday,
  holiday: c.holiday,
  saunaFee: c.saunaFee,
  ...(c.priceNote && { priceNote: c.priceNote }),
  saunaTypes: c.saunaTypes,
  ...(c.saunaNote && { saunaNote: c.saunaNote }),
  ...(c.notice && { notice: c.notice }),
  ...(c.url && { url: c.url }),
  sources: c.sources,
  confidence: c.confidence,
  verifiedAt: c.verifiedAt,
}));
for (const f of facilities) perPref.set(f.pref, (perPref.get(f.pref) ?? 0) + 1);

await writeFile(
  OUT_FILE,
  JSON.stringify({ generatedAt: new Date().toISOString(), asOf: AS_OF, count: facilities.length, facilities }),
);

const byHow = located.reduce((m, c) => ((m[c.how] = (m[c.how] ?? 0) + 1), m), {});
const conf = facilities.reduce((m, c) => ((m[c.confidence] = (m[c.confidence] ?? 0) + 1), m), {});
const lines = [
  `# データ生成レポート`,
  ``,
  `- 生成: ${new Date().toISOString()}`,
  `- 収録: **${facilities.length}件**（候補 ${candidates.length}件 / 調査時の除外 ${excludedCount}件）`,
  `- 種類: ${[...KINDS].map((k) => `${KIND_LABEL[k]} ${facilities.filter((f) => f.kind === k).length}`).join(' / ')}`,
  `- 信頼度: high ${conf.high ?? 0} / medium ${conf.medium ?? 0} / low ${conf.low ?? 0}`,
  `- 座標: 地理院 ${byHow.gsi ?? 0} / OSM施設名 ${byHow.nominatim ?? 0} / 市区町村どまり ${byHow['gsi-coarse'] ?? 0} / 手動 ${byHow.override ?? 0}`,
  ``,
  `## 都道府県別`,
  ``,
  ...PREFS.map((p) => `- ${p}: ${perPref.get(p) ?? 0}`),
  ``,
  `## 警告（${warnings.length}件）`,
  ``,
  ...warnings.map((w) => `- [${w.file}] ${w.name}: ${w.msg}`),
  ``,
];
await writeFile(REPORT_FILE, lines.join('\n'));
console.log(`完了: ${facilities.length}件を出力 / 警告 ${warnings.length}件（research/build-report.md）`);
