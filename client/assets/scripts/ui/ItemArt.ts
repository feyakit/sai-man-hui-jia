import { Color } from 'cc';
import { ITEMS } from '../core/items';
import type { PieceDef } from '../core/types';

export interface ItemTone {
  readonly hex: string;
  readonly base: Color;
  readonly edge: Color;
  readonly accent: Color;
  readonly light: Color;
}

const tones: Record<string,ItemTone> = {
  liquor: {hex:'#EDF3F7',base:new Color(237,243,247),edge:new Color(27,70,113),accent:new Color(49,112,164),light:new Color(255,255,255)},
  sausage: {hex:'#8B3B3B',base:new Color(139,59,59),edge:new Color(63,18,18),accent:new Color(224,146,99),light:new Color(193,88,72)},
  ricecooker: {hex:'#D8DDD8',base:new Color(216,221,216),edge:new Color(70,78,77),accent:new Color(87,157,146),light:new Color(246,248,243)},
  sugarcane: {hex:'#6DA552',base:new Color(109,165,82),edge:new Color(38,82,48),accent:new Color(112,63,137),light:new Color(187,222,135)},
  milk: {hex:'#F4F6ED',base:new Color(244,246,237),edge:new Color(46,95,65),accent:new Color(58,135,83),light:new Color(255,255,255)},
  suitcase_s: {hex:'#3B607C',base:new Color(59,96,124),edge:new Color(24,44,59),accent:new Color(244,194,76),light:new Color(124,164,184)},
  duffel: {hex:'#BE8B44',base:new Color(190,139,68),edge:new Color(85,53,31),accent:new Color(238,213,166),light:new Color(232,179,100)},
  nutbox: {hex:'#87542F',base:new Color(135,84,47),edge:new Color(66,38,23),accent:new Color(222,164,85),light:new Color(171,113,66)},
  fish: {hex:'#73A2AE',base:new Color(115,162,174),edge:new Color(39,76,88),accent:new Color(220,240,234),light:new Color(159,201,206)},
  duck: {hex:'#AE6036',base:new Color(174,96,54),edge:new Color(86,41,28),accent:new Color(236,171,85),light:new Color(207,128,76)},
  quilt: {hex:'#CFA4B2',base:new Color(207,164,178),edge:new Color(100,62,78),accent:new Color(247,220,215),light:new Color(236,198,203)},
  frozenbox: {hex:'#B8E1EB',base:new Color(184,225,235),edge:new Color(48,103,124),accent:new Color(239,252,255),light:new Color(255,255,255)},
  tv: {hex:'#4D5664',base:new Color(77,86,100),edge:new Color(30,33,39),accent:new Color(157,210,220),light:new Color(112,124,140)},
  coop: {hex:'#BF9A53',base:new Color(191,154,83),edge:new Color(83,63,37),accent:new Color(240,213,147),light:new Color(220,184,113)},
  crab: {hex:'#346F67',base:new Color(52,111,103),edge:new Color(24,57,53),accent:new Color(239,129,86),light:new Color(104,157,143)},
  painting: {hex:'#E7C782',base:new Color(231,199,130),edge:new Color(115,73,48),accent:new Color(196,53,47),light:new Color(255,238,193)},
  lotusroot: {hex:'#DDCDA6',base:new Color(221,205,166),edge:new Color(110,85,62),accent:new Color(96,65,53),light:new Color(244,232,203)},
  couplets: {hex:'#E1B858',base:new Color(225,184,88),edge:new Color(128,59,36),accent:new Color(190,56,48),light:new Color(250,222,143)},
  suitcase_l: {hex:'#5A4482',base:new Color(90,68,130),edge:new Color(47,33,69),accent:new Color(231,170,75),light:new Color(142,115,177)},
};

const fallback: ItemTone = {hex:'#4E7D78',base:new Color(78,125,120),edge:new Color(30,55,52),accent:new Color(238,196,105),light:new Color(128,170,161)};

export function itemTone(piece: PieceDef): ItemTone {
  return tones[ITEMS[piece.shape].key] ?? fallback;
}
