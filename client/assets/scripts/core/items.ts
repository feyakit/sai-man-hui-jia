import type { ShapeId } from './types';
import type { PieceDef } from './types';
export interface ItemDef { readonly key: string; readonly name: string; readonly scale?: { readonly x?: number; readonly y?: number } }
export const ITEMS: Record<ShapeId, ItemDef> = {
 I2:{key:'liquor',name:'一箱白酒'}, I3:{key:'sausage',name:'腊肠串',scale:{y:1.6}}, L3:{key:'ricecooker',name:'电饭煲'}, I4:{key:'sugarcane',name:'甘蔗'}, O4:{key:'milk',name:'牛奶箱'}, L4:{key:'suitcase_s',name:'登机箱'}, J4:{key:'duffel',name:'拉杆包'}, T4:{key:'nutbox',name:'坚果礼盒'}, S4:{key:'fish',name:'鱼'}, Z4:{key:'duck',name:'腊鸭'}, P5:{key:'quilt',name:'被子'}, L5:{key:'frozenbox',name:'冻品泡沫箱'}, T5:{key:'tv',name:'电视'}, U5:{key:'coop',name:'鸡鸭笼'}, V5:{key:'crab',name:'大闸蟹礼盒'}, Z5:{key:'painting',name:'年画卷'}, N5:{key:'lotusroot',name:'莲藕',scale:{y:1.12}}, Y5:{key:'couplets',name:'春联礼包'}, R6:{key:'suitcase_l',name:'大号行李箱'}
};

export interface SkinDef extends ItemDef { readonly shape: ShapeId }
/** Extra real-object skins: same footprint as the shape default, so gameplay never changes. */
export const EXTRA_ITEMS: readonly SkinDef[] = [
 {key:'winebox',name:'红酒礼盒',shape:'I2'}, {key:'ricecake',name:'年糕条',shape:'I3'}, {key:'hairtail',name:'带鱼',shape:'I4'},
 {key:'oil',name:'食用油',shape:'L3'}, {key:'mandarin',name:'砂糖橘箱',shape:'O4'}, {key:'toycar',name:'玩具车礼盒',shape:'O4'},
 {key:'ricebag',name:'大米袋',shape:'L4'}, {key:'drinks',name:'饮料箱',shape:'J4'}, {key:'teabox',name:'茶叶礼盒',shape:'T4'},
 {key:'eggs',name:'鸡蛋托',shape:'S4'}, {key:'candy',name:'糖果礼盒',shape:'Z4'}, {key:'snacks',name:'零食大礼包',shape:'P5'},
 {key:'ham',name:'金华火腿',shape:'L5'}, {key:'kumquat',name:'金桔盆栽',shape:'T5'}, {key:'fruitbasket',name:'果篮',shape:'U5'},
 {key:'apples',name:'苹果箱',shape:'V5'}, {key:'fudeco',name:'窗花礼包',shape:'Z5'}, {key:'larou',name:'腊肉',shape:'N5'},
 {key:'lanterns',name:'红灯笼',shape:'Y5'}, {key:'woven',name:'土特产编织袋',shape:'R6'},
];

const byKey = new Map<string,ItemDef>([...Object.values(ITEMS),...EXTRA_ITEMS].map(item => [item.key,item]));

/** Every skin drawn for a shape: the default first, then the extras in table order. */
export function skinsFor(shape: ShapeId): readonly ItemDef[] {
  return [ITEMS[shape],...EXTRA_ITEMS.filter(item => item.shape === shape)];
}

/**
 * Re-skin pieces for on-screen variety without touching shape, rotation or ids.
 * Each shape cycles through its skins starting at a per-level offset, so one key repeats at most
 * ceil(count/skins) times (≤2 while a shape appears ≤ 2×its skin count).
 */
export function diversifySkins<T extends PieceDef>(pieces: readonly T[], offset = 0): T[] {
  const seen = new Map<ShapeId,number>();
  const order = Object.keys(ITEMS) as ShapeId[];
  return pieces.map(piece => {
    const skins = skinsFor(piece.shape), n = seen.get(piece.shape) ?? 0;
    seen.set(piece.shape,n+1);
    return {...piece,item:skins[(offset+order.indexOf(piece.shape)+n)%skins.length].key};
  });
}

/** Level data may skin a piece independently; unknown or legacy values fall back to the shape default. */
export function itemKey(piece: PieceDef): string {
  return byKey.has(piece.item) ? piece.item : ITEMS[piece.shape].key;
}

export function itemMeta(piece: PieceDef): { key: string; name: string } {
  return byKey.get(itemKey(piece)) ?? ITEMS[piece.shape];
}

/** Art-only stretch hints; they never change collision cells or gameplay geometry. */
export function itemScale(piece: PieceDef): { x: number; y: number } {
  const scale=byKey.get(itemKey(piece))?.scale;
  return {x:scale?.x ?? 1,y:scale?.y ?? 1};
}
