import { Color, Graphics } from 'cc';
import { itemKey } from '../core/items';
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
  return tones[itemKey(piece)] ?? fallback;
}

function block(g: Graphics,color: Color,x: number,y: number,w: number,h: number,r = 0): void {
  g.fillColor=color;
  if (r) g.roundRect(x,y,w,h,r); else g.rect(x,y,w,h);
  g.fill();
}

function shape(g: Graphics,color: Color,points: readonly (readonly [number,number])[]): void {
  g.fillColor=color;
  g.moveTo(points[0][0],points[0][1]);
  for (const [x,y] of points.slice(1)) g.lineTo(x,y);
  g.close(); g.fill();
}

function line(g: Graphics,color: Color,width: number,points: readonly (readonly [number,number])[]): void {
  g.strokeColor=color; g.lineWidth=width;
  g.moveTo(points[0][0],points[0][1]);
  for (const [x,y] of points.slice(1)) g.lineTo(x,y);
  g.stroke();
}

function dot(g: Graphics,color: Color,x: number,y: number,r: number): void {
  g.fillColor=color; g.circle(x,y,r); g.fill();
}

/** A compact, upright cargo emblem that stays legible at tray and board sizes. */
export function drawItemFeature(g: Graphics,piece: PieceDef,size: number,width: number,height: number,labelHeight: number,tone: ItemTone): void {
  const key=itemKey(piece);
  const room=Math.max(12,height-labelHeight-8), s=Math.max(12,Math.min(size*.95,room));
  const long=Math.max(20,Math.min(width*.7,size*2.45));
  const y=0, lw=Math.max(1,Math.min(3,s*.07));
  const edge=tone.edge, accent=tone.accent, light=tone.light;

  switch (key) {
    case 'liquor': {
      const bw=Math.max(13,s*.48), bh=Math.max(18,s*.9);
      block(g,light,-bw/2,y-bh*.43,bw,bh*.74,Math.max(2,bw*.16));
      shape(g,light,[[-bw*.23,y+bh*.3],[-bw*.23,y+bh*.18],[bw*.23,y+bh*.18],[bw*.23,y+bh*.3]]);
      block(g,accent,-bw*.17,y+bh*.35,bw*.34,bh*.13,1);
      block(g,accent,-bw/2+2,y-bh*.17,bw-4,bh*.3,1);
      g.strokeColor=edge; g.lineWidth=Math.max(1.5,lw);
      g.roundRect(-bw/2,y-bh*.43,bw,bh*.77,Math.max(2,bw*.16)); g.stroke();
      g.moveTo(-bw*.23,y+bh*.29); g.lineTo(-bw*.23,y+bh*.18);
      g.lineTo(bw*.23,y+bh*.18); g.lineTo(bw*.23,y+bh*.29); g.stroke();
      dot(g,light,-bw*.14,y+bh*.02,Math.max(1.5,s*.045));
      dot(g,light,bw*.1,y-bh*.08,Math.max(1.5,s*.045));
      break;
    }
    case 'milk': {
      const bw=Math.max(22,s*.75), bh=Math.max(18,s*.62), bodyH=bh*.68;
      block(g,light,-bw/2,y-bh*.45,bw,bodyH,2);
      shape(g,accent,[[-bw/2,y+bh*.23],[0,y+bh*.45],[bw/2,y+bh*.23],[bw/2,y+bh*.13],[-bw/2,y+bh*.13]]);
      block(g,accent,-bw/2+3,y-bh*.2,bw-6,Math.max(3,bh*.15),1);
      g.strokeColor=edge; g.lineWidth=Math.max(1.5,lw);
      g.moveTo(-bw/2,y+bh*.23); g.lineTo(-bw/2,y-bh*.45); g.lineTo(bw/2,y-bh*.45);
      g.lineTo(bw/2,y+bh*.23); g.stroke();
      shape(g,accent,[[bw*.02,y+bh*.07],[bw*.24,y+bh*.22],[bw*.34,y+bh*.03],[bw*.12,y-bh*.03]]);
      dot(g,accent,bw*.3,y-bh*.06,Math.max(2,s*.05));
      break;
    }
    case 'sugarcane': {
      const half=long/2, stalk=Math.max(3.5,s*.16);
      line(g,accent,stalk,[[-half,y-s*.16],[-half*.42,y+s*.22],[half*.24,y+s*.12],[half*.9,y+s*.26]]);
      line(g,tone.base,stalk,[[-half*.82,y-s*.32],[-half*.2,y-s*.02],[half*.48,y-s*.08],[half,y+s*.02]]);
      line(g,edge,Math.max(2,s*.08),[[-half*.92,y+s*.3],[-half*.28,y+s*.38],[half*.4,y+s*.3],[half*.94,y+s*.4]]);
      line(g,edge,Math.max(2,s*.08),[[-half*.86,y-s*.36],[-half*.2,y-s*.42],[half*.5,y-s*.37],[half*.94,y-s*.22]]);
      for (const at of [-.38,.22,.65]) {
        line(g,light,Math.max(1,s*.035),[[half*at,y-s*.26],[half*at+s*.06,y+s*.18]]);
      }
      line(g,edge,Math.max(2,s*.065),[[0,y-s*.36],[0,y+s*.35]]);
      dot(g,accent,0,y+s*.02,Math.max(2.5,s*.08));
      break;
    }
    case 'nutbox': {
      const bw=Math.max(22,s*.68), bh=Math.max(18,s*.54);
      block(g,tone.light,-bw/2,y-bh*.28,bw,bh*.62,2);
      block(g,accent,-bw/2,y+bh*.18,bw,bh*.2,1);
      block(g,light,-bw*.09,y-bh*.3,bw*.18,bh*.72,1);
      shape(g,edge,[[-bw*.09,y+bh*.37],[-bw*.3,y+bh*.52],[-bw*.11,y+bh*.27]]);
      shape(g,edge,[[bw*.09,y+bh*.37],[bw*.3,y+bh*.52],[bw*.11,y+bh*.27]]);
      dot(g,accent,0,y+bh*.36,Math.max(2,s*.06));
      break;
    }
    case 'frozenbox': {
      const bw=Math.max(24,s*.76), bh=Math.max(18,s*.58);
      block(g,light,-bw/2,y-bh*.44,bw,bh*.88,3);
      block(g,accent,-bw/2,y+bh*.2,bw,bh*.17,1);
      line(g,edge,lw,[[0,y+bh*.08],[0,y-bh*.27]]);
      line(g,edge,lw,[[-bw*.17,y-bh*.09],[bw*.17,y-bh*.09]]);
      line(g,edge,lw,[[-bw*.11,y+bh*.06],[bw*.11,y-bh*.22]]);
      line(g,edge,lw,[[bw*.11,y+bh*.06],[-bw*.11,y-bh*.22]]);
      break;
    }
    case 'tv': {
      const bw=Math.min(width*.68,size*1.9), bh=Math.max(16,s*.48);
      block(g,edge,-bw/2,y-bh*.28,bw,bh*.62,3);
      block(g,accent,-bw/2+3,y-bh*.21,bw-6,bh*.47,2);
      shape(g,new Color(235,252,250,150),[[-bw*.34,y+bh*.2],[-bw*.14,y+bh*.2],[-bw*.32,y-bh*.14]]);
      block(g,edge,-bw*.28,y-bh*.46,bw*.56,bh*.14,1);
      line(g,tone.light,lw,[[-bw*.1,y+bh*.08],[bw*.22,y-bh*.1]]);
      break;
    }
    case 'painting': {
      const bw=Math.max(22,s*.56), bh=Math.max(18,s*.78);
      block(g,tone.light,-bw/2,y-bh*.42,bw,bh*.84,2);
      block(g,accent,-bw/2+3,y-bh*.36,bw-6,bh*.1,1);
      block(g,accent,-bw*.34,y-bh*.2,bw*.25,bh*.34,1);
      line(g,tone.base,Math.max(1,s*.035),[[-bw*.03,y+bh*.28],[-bw*.03,y-bh*.02]]);
      line(g,tone.base,Math.max(1,s*.035),[[bw*.2,y+bh*.2],[bw*.2,y-bh*.12]]);
      block(g,accent,bw*.16,y-bh*.4,bw*.07,bw*.07,1);
      block(g,edge,bw*.2,y+bh*.45,bw*.18,bh*.1,1);
      break;
    }
    case 'duck': {
      const bw=Math.max(22,s*.72), bh=Math.max(18,s*.5);
      block(g,tone.light,-bw/2,y-bh*.25,bw,bh*.56,bh*.25);
      dot(g,tone.light,bw*.29,y+bh*.22,Math.max(4,s*.12));
      shape(g,accent,[[bw*.39,y+bh*.22],[bw*.57,y+bh*.16],[bw*.4,y+bh*.1]]);
      shape(g,light,[[-bw*.17,y+bh*.05],[bw*.04,y+bh*.16],[bw*.12,y-bh*.05],[-bw*.1,y-bh*.12]]);
      line(g,edge,lw,[[-bw*.42,y-bh*.23],[bw*.05,y-bh*.1],[bw*.48,y-bh*.19]]);
      line(g,edge,lw,[[0,y+bh*.32],[0,y+bh*.55]]);
      break;
    }
    case 'sausage': {
      const bw=Math.min(width*.72,size*2.1), bh=Math.max(16,s*.45);
      for (const [ox,oy] of [[-bw*.3,bh*.18],[0,-bh*.02],[bw*.3,bh*.16]]) {
        block(g,tone.light,ox-bw*.19,oy-bh*.24,bw*.38,bh*.48,bh*.24);
        line(g,accent,Math.max(1,s*.035),[[ox-bw*.06,oy-bh*.22],[ox+bw*.06,oy+bh*.22]]);
      }
      line(g,edge,lw,[[-bw*.48,y+bh*.32],[0,y+bh*.45],[bw*.48,y+bh*.3]]);
      break;
    }
    case 'fish': {
      const bw=Math.min(width*.68,size*1.9), bh=Math.max(16,s*.46);
      block(g,tone.light,-bw*.34,y-bh*.32,bw*.66,bh*.64,bh*.3);
      shape(g,accent,[[bw*.27,y],[bw*.5,y+bh*.3],[bw*.47,y-bh*.3]]);
      shape(g,light,[[-bw*.1,y+bh*.05],[-bw*.24,y+bh*.3],[bw*.02,y+bh*.18]]);
      dot(g,edge,-bw*.33,y+bh*.08,Math.max(1.5,s*.04));
      line(g,edge,lw,[[-bw*.7,y],[bw*.5,y]]);
      break;
    }
    case 'suitcase_s':
    case 'suitcase_l': {
      const bw=Math.max(24,s*.68), bh=Math.max(20,s*.58);
      block(g,tone.light,-bw/2,y-bh*.4,bw,bh*.78,3);
      line(g,accent,Math.max(2,s*.06),[[-bw*.24,y+bh*.38],[-bw*.24,y+bh*.56],[bw*.24,y+bh*.56],[bw*.24,y+bh*.38]]);
      block(g,accent,-bw*.34,y-bh*.34,bw*.12,bh*.68,1);
      block(g,accent,bw*.22,y-bh*.34,bw*.12,bh*.68,1);
      dot(g,edge,-bw*.35,y-bh*.45,Math.max(1.5,s*.04));
      dot(g,edge,bw*.35,y-bh*.45,Math.max(1.5,s*.04));
      break;
    }
    case 'duffel': {
      const bw=Math.max(26,s*.8), bh=Math.max(17,s*.48);
      block(g,tone.light,-bw/2,y-bh*.32,bw,bh*.64,bh*.24);
      line(g,accent,Math.max(2,s*.055),[[-bw*.25,y+bh*.35],[-bw*.12,y+bh*.56],[bw*.12,y+bh*.56],[bw*.25,y+bh*.35]]);
      line(g,edge,lw,[[-bw*.43,y-bh*.06],[bw*.43,y-bh*.06]]);
      block(g,accent,bw*.34,y-bh*.1,bw*.08,bh*.22,2);
      break;
    }
    case 'quilt': {
      const bw=Math.max(25,s*.76), bh=Math.max(17,s*.52);
      block(g,tone.light,-bw/2,y-bh*.3,bw,bh*.5,4);
      block(g,accent,-bw/2,y+bh*.14,bw,bh*.18,3);
      line(g,edge,Math.max(1,s*.035),[[-bw*.38,y-bh*.1],[bw*.38,y+bh*.14]]);
      line(g,edge,Math.max(1,s*.035),[[-bw*.38,y+bh*.14],[bw*.38,y-bh*.1]]);
      line(g,accent,Math.max(1,s*.03),[[-bw*.4,y+bh*.23],[bw*.4,y+bh*.23]]);
      break;
    }
    case 'coop': {
      const bw=Math.max(24,s*.72), bh=Math.max(20,s*.58);
      block(g,new Color(66,58,48,70),-bw/2,y-bh*.4,bw,bh*.8,3);
      line(g,edge,lw,[[-bw/2,y-bh*.4],[-bw/2,y+bh*.4],[bw/2,y+bh*.4],[bw/2,y-bh*.4]]);
      line(g,accent,Math.max(1,s*.035),[[-bw*.25,y-bh*.35],[-bw*.25,y+bh*.35]]);
      line(g,accent,Math.max(1,s*.035),[[0,y-bh*.35],[0,y+bh*.35]]);
      line(g,accent,Math.max(1,s*.035),[[bw*.25,y-bh*.35],[bw*.25,y+bh*.35]]);
      line(g,edge,lw,[[-bw*.24,y+bh*.4],[0,y+bh*.58],[bw*.24,y+bh*.4]]);
      break;
    }
    case 'crab': {
      const bw=Math.max(25,s*.72), bh=Math.max(17,s*.5);
      block(g,tone.light,-bw/2,y-bh*.39,bw,bh*.74,3);
      block(g,accent,-bw/2,y+bh*.18,bw,bh*.16,1);
      block(g,edge,-bw*.25,y-bh*.05,bw*.5,bh*.22,bh*.11);
      line(g,edge,Math.max(2,s*.05),[[-bw*.24,y+bh*.06],[-bw*.43,y+bh*.28],[-bw*.5,y+bh*.13]]);
      line(g,edge,Math.max(2,s*.05),[[bw*.24,y+bh*.06],[bw*.43,y+bh*.28],[bw*.5,y+bh*.13]]);
      dot(g,accent,-bw*.1,y+bh*.08,Math.max(1.5,s*.035));
      dot(g,accent,bw*.1,y+bh*.08,Math.max(1.5,s*.035));
      break;
    }
    case 'lotusroot': {
      const bw=Math.min(width*.72,size*2.1), bh=Math.max(15,s*.42);
      block(g,tone.light,-bw/2,y-bh*.28,bw*.55,bh*.56,bh*.26);
      block(g,tone.light,bw*.01,y-bh*.18,bw*.43,bh*.42,bh*.2);
      dot(g,edge,-bw*.28,y,Math.max(1.4,s*.035));
      dot(g,edge,-bw*.12,y,Math.max(1.4,s*.035));
      dot(g,edge,bw*.15,y+bh*.02,Math.max(1.4,s*.035));
      line(g,accent,Math.max(1,s*.03),[[-bw*.02,y-bh*.22],[-bw*.02,y+bh*.22]]);
      break;
    }
    case 'couplets': {
      const bw=Math.max(24,s*.7), bh=Math.max(20,s*.7);
      for (const ox of [-bw*.28,bw*.28]) {
        block(g,tone.light,ox-bw*.13,y-bh*.4,bw*.26,bh*.8,2);
        block(g,accent,ox-bw*.13,y+bh*.22,bw*.26,bh*.12,1);
        block(g,accent,ox-bw*.13,y-bh*.34,bw*.26,bh*.09,1);
        line(g,edge,Math.max(1,s*.035),[[ox,y+bh*.16],[ox,y-bh*.22]]);
      }
      line(g,accent,Math.max(2,s*.05),[[-bw*.15,y+bh*.42],[0,y+bh*.52],[bw*.15,y+bh*.42]]);
      dot(g,accent,0,y+bh*.46,Math.max(2,s*.06));
      break;
    }
    case 'ricecooker': {
      const bw=Math.max(25,s*.72), bh=Math.max(18,s*.55);
      block(g,tone.light,-bw/2,y-bh*.3,bw,bh*.64,bh*.16);
      block(g,accent,-bw*.42,y+bh*.18,bw*.84,bh*.16,bh*.08);
      line(g,edge,lw,[[-bw*.3,y+bh*.36],[-bw*.15,y+bh*.55],[bw*.15,y+bh*.55],[bw*.3,y+bh*.36]]);
      dot(g,accent,bw*.33,y+bh*.05,Math.max(2,s*.06));
      break;
    }
    default:
      line(g,accent,Math.max(2,s*.06),[[-s*.22,y-s*.2],[s*.22,y+s*.2]]);
      line(g,accent,Math.max(2,s*.06),[[-s*.22,y+s*.2],[s*.22,y-s*.2]]);
  }
}
