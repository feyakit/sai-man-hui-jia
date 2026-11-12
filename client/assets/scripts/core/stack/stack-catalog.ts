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
  {key: 'firecracker', name: '鞭炮礼盒'},
];

export function stackItems(stage: number): readonly StackItemDef[] {
  return stage === 1 ? STAGE1_ITEMS : STAGE2_ITEMS;
}

export function stackItemByName(items: readonly StackItemDef[], key: string): StackItemDef {
  return items.find(item => item.key === key) ?? items[0];
}

/** The mother event uses instantly legible goods that already appear in the stage. */
export const MOM_ITEM_KEYS = [
  'mandarin', 'duck', 'fruitbasket', 'suitcase_l', 'toycar', 'milk', 'oven',
] as const;

export function pickMomItem(items: readonly StackItemDef[], random: () => number = Math.random): StackItemDef {
  const preferredKeys = new Set<string>(MOM_ITEM_KEYS);
  const candidates = items.filter(item => preferredKeys.has(item.key));
  const pool = candidates.length ? candidates : items;
  if (!pool.length) return {key: 'mandarin', name: '砂糖橘'};
  const drawn = random();
  const value = Number.isFinite(drawn) ? Math.max(0, Math.min(0.999999, drawn)) : 0;
  return pool[Math.floor(value * pool.length)];
}

/**
 * Mom prefers goods that are scarce on the board right now (fewest copies left), so her three
 * cards cannot simply be matched against what is already lying around. Ties are broken randomly.
 */
export function pickRareMomItem(
  items: readonly StackItemDef[],
  boardKinds: readonly string[],
  random: () => number = Math.random,
): StackItemDef {
  const preferredKeys = new Set<string>(MOM_ITEM_KEYS);
  const candidates = items.filter(item => preferredKeys.has(item.key));
  const pool = candidates.length ? candidates : items;
  if (!pool.length) return {key: 'mandarin', name: '砂糖橘'};
  const counts = new Map<string, number>();
  for (const kind of boardKinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  const fewest = Math.min(...pool.map(item => counts.get(item.key) ?? 0));
  const rare = pool.filter(item => (counts.get(item.key) ?? 0) === fewest);
  const drawn = random();
  const value = Number.isFinite(drawn) ? Math.max(0, Math.min(0.999999, drawn)) : 0;
  return rare[Math.floor(value * rare.length)];
}

/**
 * Additional cargo keys already backed by art under resources/art/items. Endless levels grow
 * their kind count from this list without changing the fixed stage-two catalog above.
 */
export const ENDLESS_ITEMS: readonly StackItemDef[] = [
  ...STAGE2_ITEMS,
  {key: 'apples', name: '苹果'},
  {key: 'candy', name: '糖果'},
  {key: 'coop', name: '鸡笼'},
  {key: 'couplets', name: '春联'},
  {key: 'crab', name: '螃蟹'},
  {key: 'dates', name: '红枣'},
  {key: 'driedgoods', name: '干货'},
  {key: 'drinks', name: '饮料'},
  {key: 'dryfish', name: '鱼干'},
  {key: 'duffel', name: '行李袋'},
  {key: 'eggs', name: '鸡蛋'},
  {key: 'frozenbox', name: '冷冻食品'},
  {key: 'fudeco', name: '福字'},
  {key: 'giftstack', name: '礼盒堆'},
  {key: 'guamian', name: '挂面'},
  {key: 'hairtail', name: '带鱼'},
  {key: 'hongbao', name: '红包'},
  {key: 'lanterns', name: '灯笼'},
  {key: 'larou', name: '腊肉'},
  {key: 'liquor', name: '白酒'},
  {key: 'lotusroot', name: '莲藕'},
  {key: 'milkflat', name: '奶片'},
  {key: 'noodles', name: '面条'},
  {key: 'nutbox', name: '坚果盒'},
  {key: 'oil', name: '食用油'},
  {key: 'painting', name: '年画'},
  {key: 'pastry', name: '糕点'},
  {key: 'pomelo', name: '柚子'},
  {key: 'quilt', name: '棉被'},
  {key: 'ricebag', name: '米袋'},
  {key: 'ricecake', name: '年糕'},
  {key: 'ricecooker', name: '电饭煲'},
  {key: 'sausage', name: '香肠'},
  {key: 'scallion', name: '大葱'},
  {key: 'sugarcane', name: '甘蔗'},
  {key: 'suitcase_s', name: '小行李箱'},
  {key: 'teabox', name: '茶叶'},
  {key: 'tv', name: '电视'},
  {key: 'winebox', name: '酒箱'},
];
