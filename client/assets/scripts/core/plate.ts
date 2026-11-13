import { PROVINCES } from './provinces';
import type { VehicleKey } from './stack/stack-vehicles';

/** One-character plate abbreviation for each of the 34 provincial-level regions. */
export const PROVINCE_PLATE_ABBR: Readonly<Record<typeof PROVINCES[number], string>> = {
  北京: '京', 天津: '津', 河北: '冀', 山西: '晋', 内蒙古: '蒙', 辽宁: '辽', 吉林: '吉', 黑龙江: '黑',
  上海: '沪', 江苏: '苏', 浙江: '浙', 安徽: '皖', 福建: '闽', 江西: '赣', 山东: '鲁', 河南: '豫',
  湖北: '鄂', 湖南: '湘', 广东: '粤', 广西: '桂', 海南: '琼', 重庆: '渝', 四川: '川', 贵州: '贵',
  云南: '云', 西藏: '藏', 陕西: '陕', 甘肃: '甘', 青海: '青', 宁夏: '宁', 新疆: '新', 香港: '港',
  澳门: '澳', 台湾: '台',
};

/** Festive (never real-format) plate text: “豫A·春节” for a chosen province, “回家·春节” before one is picked. */
export function plateText(province: string | null | undefined): string {
  const abbr = province ? (PROVINCE_PLATE_ABBR as Record<string, string>)[province] : undefined;
  return abbr ? `${abbr}A·春节` : '回家·春节';
}

/** A plate rectangle in art pixels. */
export interface PlateRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** The painted (blank yellow) plate on each rear-view sprite, measured on the PNGs (art px). */
export const VEHICLE_PLATES: Readonly<Record<VehicleKey, PlateRect>> = {
  moto: {x: 227, y: 496, w: 94, h: 45},
  trike: {x: 246, y: 519, w: 155, h: 46},
  sedan: {x: 402, y: 472, w: 232, h: 53},
  suv: {x: 251, y: 499, w: 180, h: 48},
  van: {x: 136, y: 567, w: 99, h: 37},
  pickup: {x: 270, y: 514, w: 166, h: 29},
  truck: {x: 297, y: 472, w: 176, h: 46},
  bus: {x: 190, y: 539, w: 139, h: 37},
  tractor: {x: 167, y: 572, w: 121, h: 28},
};

/**
 * Where to draw the plate badge, as 0..1 fractions of the art: centred on the painted plate, a bit
 * larger than it and never flatter than 3.4:1 so the text stays legible at small sizes.
 */
export function plateBox(key: VehicleKey | PlateRect, art: {readonly w: number; readonly h: number}): {cx: number; cy: number; w: number; h: number} {
  const p = typeof key === 'string' ? VEHICLE_PLATES[key] : key;
  const w = p.w * 1.1;
  const h = Math.max(p.h * 1.15, w / 3.4);
  return {cx: (p.x + p.w / 2) / art.w, cy: (p.y + p.h / 2) / art.h, w: w / art.w, h: h / art.h};
}

/** Font size that fits plate text into a w×h box (CJK ≈ 1em, Latin ≈ .62em, middle dot ≈ .4em). */
export function plateFontSize(text: string, w: number, h: number): number {
  let em = 0;
  for (const ch of text) em += /[\u3400-\u9fff]/.test(ch) ? 1 : ch === '·' ? .4 : .62;
  return Math.max(6, Math.min(h * .7, w * .86 / Math.max(1, em)));
}
