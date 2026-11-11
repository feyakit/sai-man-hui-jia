import type { StackItemDef } from './stack-types';

/** A deliberately distinct subset keeps the dense second pile readable at phone size. */
export const STAGE1_ITEMS: readonly StackItemDef[] = [
  {key: 'fish', name: '鱼'},
  {key: 'couplets', name: '春联'},
  {key: 'hongbao', name: '红包'},
];

export const STAGE2_ITEMS: readonly StackItemDef[] = [
  {key: 'fish', name: '鱼'},
  {key: 'couplets', name: '春联'},
  {key: 'hongbao', name: '红包'},
  {key: 'duck', name: '腊鸭'},
  {key: 'crab', name: '大闸蟹'},
  {key: 'milk', name: '牛奶箱'},
  {key: 'kumquat', name: '金桔'},
  {key: 'lanterns', name: '红灯笼'},
  {key: 'mandarin', name: '砂糖橘'},
  {key: 'sausage', name: '腊肠'},
  {key: 'ricecooker', name: '电饭煲'},
  {key: 'pomelo', name: '柚子'},
  {key: 'teabox', name: '茶叶礼盒'},
  {key: 'tv', name: '电视'},
];

export function stackItems(stage: number): readonly StackItemDef[] {
  return stage === 1 ? STAGE1_ITEMS : STAGE2_ITEMS;
}

export function stackItemByName(items: readonly StackItemDef[], key: string): StackItemDef {
  return items.find(item => item.key === key) ?? items[0];
}
