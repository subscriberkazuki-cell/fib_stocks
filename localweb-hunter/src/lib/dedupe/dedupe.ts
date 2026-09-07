// 重複排除（§10-1）
//
// 照合の優先順位:
//   1. place_id / business_id      … 確実。同じなら即同一
//   2. 電話番号 かつ 座標が近い     … 電話一致だけでは統合しない（後述）
//   3. 店名 + 住所
//   4. 店名 + 緯度経度が近い
//
// 電話番号一致だけで統合しない理由:
//   テナントビル内の複数店舗が代表番号を共有していたり、
//   チェーン店の各店舗に本部番号が登録されていることがある。
//   これを統合してしまうと、営業リストから実在の見込み客が静かに消える。
//   そこで「電話一致 かつ 100m以内」を必須にしている。

import type { Business, BusinessCandidate } from '@/types/business';
import { isWeakPhoneForMatching, normalizePhone } from './phone';

/** 電話番号一致を統合の根拠にしてよい最大距離（メートル） */
export const PHONE_MATCH_MAX_DISTANCE_M = 100;
/** 店名一致を統合の根拠にしてよい最大距離（メートル） */
export const NAME_MATCH_MAX_DISTANCE_M = 150;

/** Haversine距離（メートル） */
export function distanceMeters(
  lat1: number | null, lng1: number | null,
  lat2: number | null, lng2: number | null
): number | null {
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return null;
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 店名の表記ゆれを吸収する。統合判定を緩めすぎないよう、削るのは記号と空白だけ */
export function normalizeName(name: string): string {
  return name
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/[\s　]/g, '')
    .replace(/[・･。、,，.．\-‐−ー―–—_/\\|()（）[\]【】「」『』"'`~!?！？:：;；]/g, '')
    .replace(/(株式会社|有限会社|合同会社|㈱|㈲)/g, '')
    .trim();
}

/** 住所の表記ゆれを吸収する（丁目/番地/号 と ハイフンの混在が主な原因） */
export function normalizeAddress(address: string): string {
  return address
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]/g, '')
    .replace(/丁目|番地|番|号/g, '-')
    .replace(/-+/g, '-')
    .replace(/-$/, '')
    .toLowerCase();
}

export type MatchReason = 'source_id' | 'phone_and_location' | 'name_and_address' | 'name_and_location';

export interface DuplicateMatch {
  existing: Business;
  reason: MatchReason;
  distanceM: number | null;
}

/**
 * 既存レコードの中から、この候補と同一とみなせるものを1件返す。
 * 見つからなければ null（＝新規店舗）。
 */
export function findDuplicate(candidate: BusinessCandidate, existing: Business[]): DuplicateMatch | null {
  // 1. source + source_business_id
  const byId = existing.find(
    (e) => e.source === candidate.source && e.sourceBusinessId === candidate.sourceBusinessId
  );
  if (byId) return { existing: byId, reason: 'source_id', distanceM: null };

  const candPhone = normalizePhone(candidate.phone);
  const candName = normalizeName(candidate.name);
  const candAddress = normalizeAddress(candidate.address);

  // 2. 電話番号一致 かつ 座標が近い
  //    フリーダイヤル等は根拠として弱いので、この経路では使わない。
  if (candPhone && !isWeakPhoneForMatching(candPhone)) {
    for (const e of existing) {
      const ePhone = normalizePhone(e.phone?.value ?? null);
      if (ePhone !== candPhone) continue;

      const d = distanceMeters(candidate.latitude, candidate.longitude, e.latitude, e.longitude);

      // 座標が両方揃っていて100m以内 → 同一店舗とみなす
      if (d !== null && d <= PHONE_MATCH_MAX_DISTANCE_M) {
        return { existing: e, reason: 'phone_and_location', distanceM: d };
      }
      // 座標が取れない場合は、店名も一致していれば統合する
      if (d === null && normalizeName(e.name) === candName) {
        return { existing: e, reason: 'phone_and_location', distanceM: null };
      }
      // 電話は一致するが離れている → テナントビル/チェーン本部の可能性。統合しない。
    }
  }

  // 3. 店名 + 住所
  if (candName && candAddress) {
    const byNameAddr = existing.find(
      (e) => normalizeName(e.name) === candName && normalizeAddress(e.address) === candAddress
    );
    if (byNameAddr) return { existing: byNameAddr, reason: 'name_and_address', distanceM: null };
  }

  // 4. 店名 + 緯度経度が近い
  if (candName) {
    for (const e of existing) {
      if (normalizeName(e.name) !== candName) continue;
      const d = distanceMeters(candidate.latitude, candidate.longitude, e.latitude, e.longitude);
      if (d !== null && d <= NAME_MATCH_MAX_DISTANCE_M) {
        return { existing: e, reason: 'name_and_location', distanceM: d };
      }
    }
  }

  return null;
}

/**
 * 同一バッチ内の重複を落とす。
 * 情報量の多いレコードを残す（§10-1「失われる情報がないようマージする」）。
 */
export function dedupeBatch(candidates: BusinessCandidate[]): {
  unique: BusinessCandidate[];
  duplicateCount: number;
} {
  const kept: BusinessCandidate[] = [];
  let duplicateCount = 0;

  for (const c of candidates) {
    const idx = kept.findIndex((k) => isSameBusiness(k, c));
    if (idx === -1) {
      kept.push(c);
      continue;
    }
    duplicateCount++;
    const existing = kept[idx];
    if (existing) kept[idx] = mergeCandidates(existing, c);
  }

  return { unique: kept, duplicateCount };
}

function isSameBusiness(a: BusinessCandidate, b: BusinessCandidate): boolean {
  if (a.source === b.source && a.sourceBusinessId === b.sourceBusinessId) return true;

  const aPhone = normalizePhone(a.phone);
  const bPhone = normalizePhone(b.phone);
  const d = distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);

  if (aPhone && bPhone && aPhone === bPhone && !isWeakPhoneForMatching(aPhone)) {
    if (d !== null && d <= PHONE_MATCH_MAX_DISTANCE_M) return true;
    if (d === null && normalizeName(a.name) === normalizeName(b.name)) return true;
  }

  if (normalizeName(a.name) === normalizeName(b.name)) {
    if (normalizeAddress(a.address) && normalizeAddress(a.address) === normalizeAddress(b.address)) return true;
    if (d !== null && d <= NAME_MATCH_MAX_DISTANCE_M) return true;
  }

  return false;
}

/** 情報量の多い方を優先してマージする。片方にしかない値は必ず残す */
export function mergeCandidates(a: BusinessCandidate, b: BusinessCandidate): BusinessCandidate {
  const pick = <T>(x: T | null | undefined, y: T | null | undefined): T | null =>
    x !== null && x !== undefined && x !== ('' as unknown as T) ? x : (y ?? null);

  return {
    ...a,
    name: a.name.length >= b.name.length ? a.name : b.name,
    category: pick(a.category, b.category) ?? '',
    address: (a.address.length >= b.address.length ? a.address : b.address) || '',
    prefecture: pick(a.prefecture, b.prefecture) ?? '',
    city: pick(a.city, b.city) ?? '',
    latitude: a.latitude ?? b.latitude,
    longitude: a.longitude ?? b.longitude,
    rating: a.rating ?? b.rating,
    reviewCount: Math.max(a.reviewCount ?? 0, b.reviewCount ?? 0) || (a.reviewCount ?? b.reviewCount),
    phone: a.phone ?? b.phone,
    hasWebsiteFieldPopulated: a.hasWebsiteFieldPopulated || b.hasWebsiteFieldPopulated,
    websiteUrlRaw: a.websiteUrlRaw ?? b.websiteUrlRaw,
    googleMapsUrl: a.googleMapsUrl ?? b.googleMapsUrl,
    openingHours: a.openingHours ?? b.openingHours,
  };
}
