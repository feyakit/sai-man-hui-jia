import type { StackItemDef } from './stack-types';

/** A deliberately distinct subset keeps the dense second pile readable at phone size. */
export const STAGE1_ITEMS: readonly StackItemDef[] = [
  {key: 'mandarin', name: '砂糖橘'},
  {key: 'duck', name: '烤鸭'},
  {key: 'fruitbasket', name: '果篮'},
];

export const STAGE2_ITEMS: readonly StackItemDef[] = [
  {key: 'mandarin', name: '砂糖橘'},
  {key: 'duck', name: '烤鸭'},
  {key: 'fruitbasket', name: '果篮'},
  {key: 'fish', name: '鱼'},
  {key: 'kumquat', name: '金桔树'},
  {key: 'milk', name: '牛奶箱'},
  {key: 'oven', name: '烤箱'},
  {key: 'suitcase_l', name: '大行李箱'},
  {key: 'woven', name: '编织袋'},
  {key: 'toycar', name: '玩具车'},
  {key: 'snacks', name: '零食大礼包'},
  {key: 'ham', name: '火腿'},
  {key: 'thermos', name: '保温壶'},
  {key: 'crab', name: '大闸蟹'},
];

export function stackItems(stage: number): readonly StackItemDef[] {
  return stage === 1 ? STAGE1_ITEMS : STAGE2_ITEMS;
}

export function stackItemByName(items: readonly StackItemDef[], key: string): StackItemDef {
  return items.find(item => item.key === key) ?? items[0];
}
