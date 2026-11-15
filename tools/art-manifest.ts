import { EXTRA_ITEMS, ITEMS } from '../client/assets/scripts/core/items';
import { SHAPES } from '../client/assets/scripts/core/shapes';
import type { Cell, ShapeId } from '../client/assets/scripts/core/types';

export const CELL_PX = 128;
export interface ArtEntry { file: string; width: number; height: number; name: string; cells?: readonly Cell[] }
export function shapeSize(cells: readonly Cell[]) {
  return {width:(Math.max(...cells.map(([x]) => x))+1)*CELL_PX,
    height:(Math.max(...cells.map(([,y]) => y))+1)*CELL_PX};
}
export const ITEM_ART: ArtEntry[] = (Object.keys(ITEMS) as ShapeId[]).map(shape => ({
  file:`items/${ITEMS[shape].key}.png`, name:ITEMS[shape].name, cells:SHAPES[shape], ...shapeSize(SHAPES[shape]),
})).concat(EXTRA_ITEMS.map(item => ({
  file:`items/${item.key}.png`, name:item.name, cells:SHAPES[item.shape], ...shapeSize(SHAPES[item.shape]),
})));
export const ART: ArtEntry[] = [...ITEM_ART,...[
  ['vehicles/sedan_v1_body',1024,640,'车尾'],['vehicles/sedan_v1_lid',1024,360,'后备箱盖'],
  ['vehicles/sedan_v1_trunk',1024,768,'箱内底'],
  ['vehicles/moto',548,678,'摩托车'],['vehicles/trike',646,670,'电动三轮'],['vehicles/suv',682,665,'SUV'],
  ['vehicles/van',527,680,'面包车'],['vehicles/pickup',706,646,'皮卡'],['vehicles/truck',770,625,'小货车'],
  ['vehicles/bus',519,661,'大巴车'],['vehicles/tractor',457,647,'拖拉机'],['ui/btn_rotate',240,240,'旋转'],
  ['ui/btn_undo',160,160,'撤销'],['ui/btn_restart',160,160,'重开'],['ui/mom',512,512,'妈妈'],
  ['ui/hand',160,160,'手指'],['ui/bg_night',750,1334,'夜色归家'],['ui/bg_home',750,1334,'到家了'],
  ['ui/bg_poster',750,1700,'年画夜街'],['ui/plaque_poster',750,305,'年画牌匾'],
  ['ui/couplet_left',90,576,'上联'],['ui/couplet_right',92,576,'下联'],['ui/car_poster',656,484,'满载红车'],
  ['ui/coin_rank',158,162,'奖杯徽章'],['ui/coin_daily',158,162,'日历徽章'],['ui/coin_classic',158,162,'礼盒徽章'],
  ['ui/road_home',657,170,'回家路'],['ui/car_marker',62,44,'小车里程碑'],
  ['ui/btn_start_poster',545,130,'开始装车按钮'],['ui/help_poster',66,66,'说明按钮'],
  ...Array.from({length:4},(_,i) => [`fx/confetti_${i+1}`,32,32,'彩纸']),
].map(([file,width,height,name]) => ({file:`${file}.png`,width:Number(width),height:Number(height),name:String(name)}))];
