import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import './style.css';
import type { LatLng, Onsen, OnsenData } from './types';
import {
  NoRouteError,
  formatDistance,
  formatDuration,
  getDriveTime,
  googleMapsDirectionsUrl,
  hasGoogleKey,
  sourceLabel,
} from './travel';

const ONSEN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
  '<path d="M7.5 3.5c-1.3 1.4-1.3 2.6 0 4s1.3 2.6 0 4"/>' +
  '<path d="M12 2.5c-1.3 1.4-1.3 2.6 0 4s1.3 2.6 0 4"/>' +
  '<path d="M16.5 3.5c-1.3 1.4-1.3 2.6 0 4s1.3 2.6 0 4"/>' +
  '<path d="M4.5 13.5c-.9 3.6 2.8 7 7.5 7s8.4-3.4 7.5-7"/></svg>';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const sheet = $<HTMLElement>('sheet');
const sheetBody = $<HTMLElement>('sheet-body');
const toast = $<HTMLElement>('toast');
const countEl = $<HTMLElement>('count');
const searchInput = $<HTMLInputElement>('q');
const results = $<HTMLUListElement>('results');

// ---- 地図 ----
const map = L.map('map', {
  zoomControl: false,
  minZoom: 4,
  maxZoom: 18,
  maxBounds: [
    [18, 115],
    [50, 160],
  ],
  worldCopyJump: false,
}).setView([37.5, 137.5], 5);

const gsiAttribution = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
const pale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
  attribution: gsiAttribution,
  maxZoom: 18,
  maxNativeZoom: 18,
}).addTo(map);
const std = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
  attribution: gsiAttribution,
  maxZoom: 18,
  maxNativeZoom: 18,
});
L.control.layers({ 淡色地図: pale, 標準地図: std }, undefined, { position: 'bottomleft' }).addTo(map);
L.control.zoom({ position: 'bottomright', zoomInTitle: '拡大', zoomOutTitle: '縮小' }).addTo(map);

const pinIcon = L.divIcon({
  className: 'onsen-pin',
  html: `<span>${ONSEN_SVG}</span>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});
const selectedIcon = L.divIcon({
  className: 'onsen-pin is-selected',
  html: `<span>${ONSEN_SVG}</span>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

const cluster = L.markerClusterGroup({
  chunkedLoading: true,
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
  maxClusterRadius: (zoom: number) => (zoom < 8 ? 60 : zoom < 12 ? 45 : 30),
  iconCreateFunction: (c) => {
    const n = c.getChildCount();
    const size = n < 10 ? 36 : n < 100 ? 44 : 52;
    const tier = n < 10 ? 's' : n < 100 ? 'm' : 'l';
    return L.divIcon({
      className: `onsen-cluster tier-${tier}`,
      html: `<span>${n}</span>`,
      iconSize: [size, size],
    });
  },
});
map.addLayer(cluster);

let selectedMarker: L.Marker | null = null;
let selectedId: string | null = null;
const markers = new Map<string, L.Marker>();
let facilities: Onsen[] = [];

// ---- 現在地 ----
let here: LatLng | null = null;
let hereMarker: L.CircleMarker | null = null;
let hereAccuracy: L.Circle | null = null;
let geoState: 'idle' | 'pending' | 'ok' | 'denied' | 'unavailable' = 'idle';
let flyToHereOnFix = false;

function startLocation() {
  if (!('geolocation' in navigator)) {
    geoState = 'unavailable';
    return;
  }
  if (geoState === 'pending' || geoState === 'ok') return;
  geoState = 'pending';
  navigator.geolocation.watchPosition(
    (pos) => {
      const first = !here;
      here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      geoState = 'ok';
      drawHere(pos.coords.accuracy);
      if (flyToHereOnFix) {
        flyToHereOnFix = false;
        map.flyTo([here.lat, here.lng], Math.max(map.getZoom(), 11), { duration: 0.8 });
      }
      if (first && selectedId) refreshTravel();
    },
    (err) => {
      geoState = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
      if (flyToHereOnFix) showToast(geoMessage());
      flyToHereOnFix = false;
      if (selectedId) refreshTravel();
    },
    { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
  );
}

function drawHere(accuracy: number) {
  if (!here) return;
  const ll: L.LatLngExpression = [here.lat, here.lng];
  if (!hereMarker) {
    hereAccuracy = L.circle(ll, { radius: accuracy, className: 'here-accuracy', interactive: false }).addTo(map);
    hereMarker = L.circleMarker(ll, { radius: 8, className: 'here-dot', interactive: false }).addTo(map);
  } else {
    hereMarker.setLatLng(ll);
    hereAccuracy?.setLatLng(ll).setRadius(accuracy);
  }
}

function geoMessage(): string {
  if (geoState === 'denied') return '位置情報の利用が許可されていません。ブラウザの設定で許可すると、移動時間を表示できます。';
  if (geoState === 'unavailable') return '現在地を取得できませんでした。';
  return '現在地を取得しています…';
}

$<HTMLButtonElement>('locate').addEventListener('click', () => {
  if (here) {
    map.flyTo([here.lat, here.lng], Math.max(map.getZoom(), 11), { duration: 0.8 });
    return;
  }
  flyToHereOnFix = true;
  if (geoState === 'denied' || geoState === 'unavailable') {
    geoState = 'idle';
  }
  startLocation();
  showToast('現在地を取得しています…');
});

// ---- 施設カード ----
const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

function priceRows(o: Onsen): string {
  if (o.weekday == null && o.holiday == null) {
    return '<p class="muted">料金情報なし（公式サイトでご確認ください）</p>';
  }
  // 平日のみ・休日のみ日帰り営業の施設は片方が null（理由はお知らせ欄に出す）
  const v = (n: number | null) => (n == null ? '—' : yen(n));
  let html = `<dl class="prices">
    <div><dt>平日</dt><dd>大人 <strong>${v(o.weekday)}</strong></dd></div>
    <div><dt>休日</dt><dd>大人 <strong>${v(o.holiday)}</strong></dd></div>
  </dl>`;
  const notes: string[] = [];
  if (o.saunaFee && o.saunaFee > 0) notes.push(`サウナ利用は別途 ${yen(o.saunaFee)}`);
  else if (o.saunaFee === null && !o.priceNote?.includes('サウナ')) notes.push('サウナ料金は施設にご確認ください');
  if (o.priceNote) notes.push(escapeHtml(o.priceNote));
  if (notes.length) html += `<p class="note">※${notes.join(' ／ ')}</p>`;
  return html;
}

function saunaLine(o: Onsen): string {
  const types = o.saunaTypes.length ? o.saunaTypes.join('・') : 'あり';
  return escapeHtml(types + (o.saunaNote ? `（${o.saunaNote}）` : ''));
}

function openSheet(o: Onsen) {
  selectedId = o.id;
  if (selectedMarker) selectedMarker.setLatLng([o.lat, o.lng]);
  else selectedMarker = L.marker([o.lat, o.lng], { icon: selectedIcon, zIndexOffset: 1000, interactive: false }).addTo(map);

  const official = o.url
    ? `<a class="btn" href="${escapeAttr(o.url)}" target="_blank" rel="noopener">公式サイト</a>`
    : '';
  const sources = o.sources
    .slice(0, 3)
    .map((s, i) => `<a href="${escapeAttr(s)}" target="_blank" rel="noopener">出典${i + 1}</a>`)
    .join(' ');

  sheetBody.innerHTML = `
    <h2 class="name">${escapeHtml(o.name)}</h2>
    <p class="addr">${escapeHtml(o.address)}</p>
    ${o.notice ? `<p class="notice">お知らせ：${escapeHtml(o.notice)}</p>` : ''}
    <section class="block">
      <h3>料金</h3>
      ${priceRows(o)}
    </section>
    <section class="block">
      <h3>車での移動時間<span class="sub">（現在地から）</span></h3>
      <div id="travel" class="travel"></div>
    </section>
    <section class="block row">
      <h3>サウナ</h3><p>${saunaLine(o)}</p>
    </section>
    <div class="actions">
      <a id="gmaps" class="btn primary" target="_blank" rel="noopener">Googleマップで開く</a>
      ${official}
    </div>
    <p class="meta">情報確認日 ${o.verifiedAt.replaceAll('-', '/')}${o.confidence === 'high' ? '' : '（公式以外の情報を含む）'} ・ ${sources}<br>料金・営業状況は変わることがあります。お出かけ前に公式サイトでご確認ください。</p>
  `;
  sheet.hidden = false;
  sheet.scrollTop = 0;
  document.body.classList.add('sheet-open');
  refreshTravel();
  keepVisible(o);
}

function closeSheet() {
  sheet.hidden = true;
  selectedId = null;
  document.body.classList.remove('sheet-open');
  if (selectedMarker) {
    map.removeLayer(selectedMarker);
    selectedMarker = null;
  }
}

// 地図上の施設がカードに隠れないようにずらす
function keepVisible(o: Onsen) {
  requestAnimationFrame(() => {
    const p = map.latLngToContainerPoint([o.lat, o.lng]);
    const size = map.getSize();
    const wide = window.matchMedia('(min-width: 768px)').matches;
    if (wide) {
      const left = sheet.getBoundingClientRect().right + 24;
      if (p.x < left) map.panBy([p.x - (left + (size.x - left) / 2), 0]);
    } else {
      const visibleBottom = size.y - sheet.offsetHeight - 24;
      if (p.y > visibleBottom || p.y < 80) map.panBy([0, p.y - Math.max(120, visibleBottom / 2)]);
    }
  });
}

function refreshTravel() {
  const id = selectedId;
  const o = facilities.find((f) => f.id === id);
  const box = document.getElementById('travel');
  const gmaps = document.getElementById('gmaps') as HTMLAnchorElement | null;
  if (!o || !box) return;
  if (gmaps) gmaps.href = googleMapsDirectionsUrl(here, o.name, o.address);

  if (!here) {
    if (geoState === 'idle') startLocation();
    const canRetry = geoState === 'denied' || geoState === 'unavailable';
    box.innerHTML = `<p class="muted">${geoMessage()}</p>${
      canRetry ? '<button id="retry-geo" class="btn small" type="button">現在地を使う</button>' : ''
    }`;
    document.getElementById('retry-geo')?.addEventListener('click', () => {
      geoState = 'idle';
      startLocation();
      refreshTravel();
    });
    return;
  }

  box.innerHTML = '<p class="muted loading">計算しています…</p>';
  const from = here;
  getDriveTime(o.id, from, { lat: o.lat, lng: o.lng })
    .then((r) => {
      if (selectedId !== id) return;
      box.innerHTML = `<p class="time"><strong>${formatDuration(r.seconds)}</strong><span>${formatDistance(r.meters)}</span></p>
        <p class="muted small">${sourceLabel[r.source]}</p>`;
    })
    .catch((e) => {
      if (selectedId !== id) return;
      box.innerHTML =
        e instanceof NoRouteError
          ? '<p class="muted">車で行けるルートが見つかりませんでした（離島など）。</p>'
          : '<p class="muted">移動時間を取得できませんでした。</p>';
    });
}

$<HTMLButtonElement>('sheet-close').addEventListener('click', closeSheet);
map.on('click', () => {
  if (!sheet.hidden) closeSheet();
  results.hidden = true;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!results.hidden) results.hidden = true;
    else closeSheet();
  }
});

// ---- 検索 ----
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
let searchIndex: { o: Onsen; text: string }[] = [];

searchInput.addEventListener('input', () => {
  const q = norm(searchInput.value);
  if (!q) {
    results.hidden = true;
    return;
  }
  const hits = searchIndex.filter((x) => x.text.includes(q)).slice(0, 30);
  results.innerHTML = hits.length
    ? hits
        .map(
          ({ o }) =>
            `<li><button type="button" data-id="${o.id}"><span class="r-name">${escapeHtml(o.name)}</span><span class="r-addr">${escapeHtml(o.address)}</span></button></li>`,
        )
        .join('')
    : '<li class="empty">見つかりませんでした</li>';
  results.hidden = false;
});

results.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button[data-id]') as HTMLButtonElement | null;
  if (!btn) return;
  const o = facilities.find((f) => f.id === btn.dataset.id);
  const m = o && markers.get(o.id);
  if (!o || !m) return;
  results.hidden = true;
  searchInput.blur();
  map.setView([o.lat, o.lng], Math.max(map.getZoom(), 14));
  cluster.zoomToShowLayer(m, () => openSheet(o));
});

// ---- このアプリについて ----
const about = $<HTMLDialogElement>('about');
$<HTMLButtonElement>('about-open').addEventListener('click', () => about.showModal());
$<HTMLButtonElement>('about-close').addEventListener('click', () => about.close());
about.addEventListener('click', (e) => {
  if (e.target === about) about.close();
});
if (!hasGoogleKey) {
  document.getElementById('travel-method')!.textContent =
    '移動時間は道路の経路（OpenStreetMap / OSRM）から推定しています。渋滞は考慮しません。Google Maps の API キーを設定すると、Google マップの経路で計算します。';
}

// ---- 共通 ----
let toastTimer = 0;
function showToast(msg: string) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), 3500);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
const escapeAttr = escapeHtml;

// ---- データ読み込み ----
async function load() {
  try {
    const res = await fetch('./data/onsen.json', { cache: 'no-cache' });
    const data = (await res.json()) as OnsenData;
    facilities = data.facilities;
    const list: L.Marker[] = [];
    for (const o of facilities) {
      const m = L.marker([o.lat, o.lng], { icon: pinIcon, title: o.name, keyboard: false });
      m.on('click', () => openSheet(o));
      markers.set(o.id, m);
      list.push(m);
    }
    cluster.addLayers(list);
    searchIndex = facilities.map((o) => ({ o, text: norm(`${o.name}${o.address}`) }));
    const [y, mo, d] = data.asOf.split('-').map(Number);
    countEl.textContent = `サウナ付き温泉 ${facilities.length.toLocaleString('ja-JP')}件・${y}年${mo}月${d}日時点`;
  } catch (e) {
    console.error(e);
    countEl.textContent = 'データを読み込めませんでした';
  }
}

load();
startLocation();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
