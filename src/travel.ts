import type { LatLng } from './types';

export type TravelSource = 'google' | 'osrm' | 'estimate';

export interface TravelResult {
  seconds: number;
  meters: number;
  source: TravelSource;
}

export class NoRouteError extends Error {}

const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();

export const hasGoogleKey = Boolean(GOOGLE_KEY);

// 同じ出発地（約100m単位）・同じ施設への問い合わせは使い回す（API の呼び出し回数を抑える）
const cache = new Map<string, Promise<TravelResult>>();

export function getDriveTime(id: string, from: LatLng, to: LatLng): Promise<TravelResult> {
  const key = `${id}|${from.lat.toFixed(3)},${from.lng.toFixed(3)}`;
  let p = cache.get(key);
  if (!p) {
    p = resolveDriveTime(from, to);
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

async function resolveDriveTime(from: LatLng, to: LatLng): Promise<TravelResult> {
  if (GOOGLE_KEY) {
    try {
      return await viaGoogle(from, to, GOOGLE_KEY);
    } catch (e) {
      if (e instanceof NoRouteError) throw e;
      console.warn('Google Routes API に失敗したため OSRM で計算します', e);
    }
  }
  try {
    return await viaOsrm(from, to);
  } catch (e) {
    if (e instanceof NoRouteError) throw e;
    console.warn('OSRM に失敗したため直線距離から概算します', e);
  }
  return estimate(from, to);
}

// Google Maps Platform Routes API（computeRoutes）
async function viaGoogle(from: LatLng, to: LatLng, key: string): Promise<TravelResult> {
  const res = await fetchWithTimeout('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      languageCode: 'ja-JP',
      regionCode: 'jp',
    }),
  });
  if (!res.ok) throw new Error(`Routes API HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { routes?: { duration?: string; distanceMeters?: number }[] };
  const route = json.routes?.[0];
  if (!route?.duration) throw new NoRouteError('no route');
  return { seconds: parseInt(route.duration, 10), meters: route.distanceMeters ?? 0, source: 'google' };
}

// OSRM 公開サーバ（キー不要。渋滞は考慮しない）
async function viaOsrm(from: LatLng, to: LatLng): Promise<TravelResult> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  const res = await fetchWithTimeout(url, {});
  const json = (await res.json()) as { code: string; routes?: { duration: number; distance: number }[] };
  if (json.code === 'NoRoute') throw new NoRouteError('no route');
  const route = json.routes?.[0];
  if (json.code !== 'Ok' || !route) throw new Error(`OSRM ${json.code}`);
  // OSRM は日本の一般道で速めに出るため、少しだけ補正する
  return { seconds: route.duration * 1.15, meters: route.distance, source: 'osrm' };
}

// 直線距離 × 道路係数 ÷ 想定速度
function estimate(from: LatLng, to: LatLng): TravelResult {
  const meters = haversine(from, to) * 1.3;
  const km = meters / 1000;
  const kmh = km < 10 ? 25 : km < 50 ? 40 : 60;
  return { seconds: (km / kmh) * 3600, meters, source: 'estimate' };
}

export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function formatDuration(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `約${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `約${h}時間` : `約${h}時間${m}分`;
}

export function formatDistance(meters: number): string {
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`;
}

export const sourceLabel: Record<TravelSource, string> = {
  google: 'Google マップの経路（現在の交通状況を反映）',
  osrm: '道路の経路から推定（渋滞は考慮しません）',
  estimate: '直線距離からの概算',
};

export function googleMapsDirectionsUrl(from: LatLng | null, name: string, address: string): string {
  const params = new URLSearchParams({ api: '1', destination: `${name} ${address}`, travelmode: 'driving' });
  if (from) params.set('origin', `${from.lat},${from.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
