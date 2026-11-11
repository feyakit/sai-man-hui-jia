import type { ShapeId } from './types';
import type { PieceDef } from './types';
export const ITEMS: Record<ShapeId, { key: string; name: string }> = {
 I2:{key:'liquor',name:'一箱白酒'}, I3:{key:'sausage',name:'腊肠串'}, L3:{key:'ricecooker',name:'电饭煲'}, I4:{key:'sugarcane',name:'甘蔗'}, O4:{key:'milk',name:'牛奶箱'}, L4:{key:'suitcase_s',name:'登机箱'}, J4:{key:'duffel',name:'拉杆包'}, T4:{key:'nutbox',name:'坚果礼盒'}, S4:{key:'fish',name:'鱼'}, Z4:{key:'duck',name:'腊鸭'}, P5:{key:'quilt',name:'被子'}, L5:{key:'frozenbox',name:'冻品泡沫箱'}, T5:{key:'tv',name:'电视'}, U5:{key:'coop',name:'鸡鸭笼'}, V5:{key:'crab',name:'大闸蟹礼盒'}, Z5:{key:'painting',name:'年画卷'}, N5:{key:'lotusroot',name:'莲藕'}, Y5:{key:'couplets',name:'春联礼包'}, R6:{key:'suitcase_l',name:'大号行李箱'}
};

const byKey = new Map(Object.values(ITEMS).map(item => [item.key,item]));

/** Level data may skin a piece independently; unknown or legacy values fall back to the shape default. */
export function itemKey(piece: PieceDef): string {
  return byKey.has(piece.item) ? piece.item : ITEMS[piece.shape].key;
}

export function itemMeta(piece: PieceDef): { key: string; name: string } {
  return byKey.get(itemKey(piece)) ?? ITEMS[piece.shape];
}
