export type Confidence = 'high' | 'medium' | 'low';

// 施設の種類: 天然温泉 / 銭湯（一般公衆浴場）/ スーパー銭湯など（天然温泉ではないもの）
export type Kind = 'onsen' | 'sento' | 'super';

// public/data/onsen.json の1施設分（scripts/build-data.mjs が生成する）
export interface Onsen {
  id: string;
  kind: Kind;
  name: string;
  pref: string;
  address: string;
  lat: number;
  lng: number;
  weekday: number | null;
  holiday: number | null;
  // 0 = 入浴料に含む / 数値 = 別料金 / null = 不明
  saunaFee: number | null;
  priceNote?: string;
  saunaTypes: string[];
  saunaNote?: string;
  // 定休日・臨時休館など利用者向けのお知らせ
  notice?: string;
  url?: string;
  sources: string[];
  confidence: Confidence;
  verifiedAt: string;
}

export interface OnsenData {
  generatedAt: string;
  asOf: string;
  count: number;
  facilities: Onsen[];
}

export interface LatLng {
  lat: number;
  lng: number;
}
