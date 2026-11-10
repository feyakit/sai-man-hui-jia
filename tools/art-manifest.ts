import { ITEMS } from '../client/assets/scripts/core/items';
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
}));
export const ART: ArtEntry[] = [...ITEM_ART,...[
  ['vehicles/sedan_v1_body',1024,640,'车尾'],['vehicles/sedan_v1_lid',1024,360,'后备箱盖'],
  ['vehicles/sedan_v1_trunk',1024,768,'箱内底'],['ui/btn_rotate',240,240,'旋转'],
  ['ui/btn_undo',160,160,'撤销'],['ui/btn_restart',160,160,'重开'],['ui/mom',512,512,'妈妈'],
  ['ui/hand',160,160,'手指'],['ui/bg_night',750,1334,'夜色归家'],
  ...Array.from({length:4},(_,i) => [`fx/confetti_${i+1}`,32,32,'彩纸']),
].map(([file,width,height,name]) => ({file:`${file}.png`,width:Number(width),height:Number(height),name:String(name)}))];
