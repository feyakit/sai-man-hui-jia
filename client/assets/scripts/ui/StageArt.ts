import { Color, Graphics } from 'cc';
import { itemMeta } from '../core/items';
import type { Level, PieceDef } from '../core/types';
import type { Rect } from '../game/InteractionGeometry';

export interface VehicleLook {
  readonly name: string;
  readonly body: Color;
  readonly deep: Color;
  readonly light: Color;
  readonly trim: Color;
}

export interface StageLayout {
  readonly cell: number;
  readonly car: Rect;
  readonly trunk: Rect;
  readonly board: Rect;
  readonly tray: Rect;
  readonly buttonY: number;
  readonly buttonH: number;
  readonly noticeY: number;
}

const looks: Record<string,VehicleLook> = {
  sedan: {name:'小轿车',body:new Color(202,41,42),deep:new Color(112,25,31),light:new Color(239,86,55),trim:new Color(255,205,114)},
  sedan_v1: {name:'小轿车',body:new Color(194,35,43),deep:new Color(104,21,30),light:new Color(235,75,52),trim:new Color(255,211,121)},
  wuling: {name:'五菱宏光',body:new Color(178,44,39),deep:new Color(91,27,27),light:new Color(224,88,54),trim:new Color(246,195,67)},
  suv: {name:'SUV',body:new Color(137,42,48),deep:new Color(70,24,31),light:new Color(197,76,64),trim:new Color(255,204,121)},
  pickup: {name:'皮卡',body:new Color(176,78,37),deep:new Color(91,37,25),light:new Color(222,119,55),trim:new Color(250,201,104)},
  etrike: {name:'电动三轮',body:new Color(51,111,91),deep:new Color(27,62,53),light:new Color(95,151,112),trim:new Color(246,195,67)},
  moto: {name:'摩托车',body:new Color(155,49,38),deep:new Color(78,25,25),light:new Color(211,86,53),trim:new Color(255,205,114)},
  train: {name:'绿皮火车',body:new Color(44,105,78),deep:new Color(23,58,46),light:new Color(90,146,98),trim:new Color(246,195,67)},
};
const fallback = looks.sedan;

export function vehicleLook(vehicle: string): VehicleLook { return looks[vehicle] ?? fallback; }

const shorts: Record<string,string> = {
  liquor:'白酒', sausage:'腊肠', ricecooker:'饭煲', sugarcane:'甘蔗', milk:'牛奶',
  suitcase_s:'登机箱', duffel:'拉杆包', nutbox:'坚果', fish:'鱼', duck:'腊鸭',
  quilt:'被子', frozenbox:'冻品', tv:'电视', coop:'鸡鸭笼', crab:'闸蟹',
  painting:'年画', lotusroot:'莲藕', couplets:'春联', suitcase_l:'行李箱',
  winebox:'红酒', ricecake:'年糕', hairtail:'带鱼', oil:'食用油', mandarin:'砂糖橘', toycar:'玩具车',
  ricebag:'大米', drinks:'饮料', teabox:'茶叶', eggs:'鸡蛋', candy:'糖果', snacks:'零食',
  ham:'火腿', kumquat:'金桔', fruitbasket:'果篮', apples:'苹果', fudeco:'窗花', larou:'腊肉',
  lanterns:'灯笼', woven:'编织袋',
  scallion:'大葱', dryfish:'腊鱼', giftstack:'礼盒', dates:'红枣', noodles:'方便面', milkflat:'牛奶',
  firecracker:'鞭炮', guamian:'挂面', pomelo:'柚子', thermos:'保温壶', pastry:'糕点', driedgoods:'干货',
  hongbao:'红包', oven:'烤箱',
};
export function itemName(piece: PieceDef): string { return itemMeta(piece).name; }
export function itemShortName(piece: PieceDef): string { return shorts[itemMeta(piece).key] ?? itemName(piece); }

export function controlContentLayout(rect: Rect): {iconX: number; textX: number} {
  return {iconX:rect.x+34,textX:rect.x+(rect.w+62)/2};
}

export function computeStageLayout(level: Pick<Level,'width'|'height'|'mode'>, height: number, top: number, bottom: number): StageLayout {
  const buttonH=112;
  const buttonY=height-bottom-24-buttonH;
  const trayH=Math.max(300,Math.min(420,height*.26));
  const trayY=buttonY-24-trayH;
  const carTop=(level.mode === 'mom' ? 326 : 286)+top;
  const carBottom=Math.max(carTop+430,trayY-46);
  const car={x:14,y:carTop,w:722,h:carBottom-carTop};
  const trunk={x:44,y:carTop+78,w:662,h:Math.max(250,car.h-78-144)};
  const cell=Math.floor(Math.min(110,(trunk.w-20)/level.width,(trunk.h-20)/level.height));
  const board={x:(750-level.width*cell)/2,y:trunk.y+(trunk.h-level.height*cell)/2,
    w:level.width*cell,h:level.height*cell};
  return {cell,car,trunk,board,tray:{x:5,y:trayY,w:740,h:trayH},buttonY,buttonH,noticeY:trayY-20};
}

export function polygon(graphics: Graphics, points: readonly (readonly [number,number])[], color: Color): void {
  graphics.fillColor=color;
  graphics.moveTo(points[0][0],points[0][1]);
  for (const [x,y] of points.slice(1)) graphics.lineTo(x,y);
  graphics.close();
  graphics.fill();
}

export function circle(graphics: Graphics, x: number, y: number, radius: number, color: Color): void {
  graphics.fillColor=color;
  graphics.circle(x,y,radius);
  graphics.fill();
}

interface ScenePoint { x: number; y: number }
function topDown(width: number, height: number, top: number) {
  return {
    x:(value: number) => value-width/2,
    y:(value: number) => height/2-top-value,
  };
}

/** Full-screen Spring Festival night road, drawn back-to-front with Graphics only. */
export function drawStageBackdrop(graphics: Graphics, width: number, height: number, top: number, look: VehicleLook): void {
  const p=topDown(width,height,top), rect=(x:number,y:number,w:number,h:number,c:Color,r=0) => {
    if (r) { graphics.fillColor=c; graphics.roundRect(p.x(x),p.y(y+h),w,h,r); graphics.fill(); }
    else { graphics.fillColor=c; graphics.rect(p.x(x),p.y(y+h),w,h); graphics.fill(); }
  };
  const poly=(points:readonly (readonly [number,number])[],c:Color) =>
    polygon(graphics,points.map(([x,y]):[number,number]=>[p.x(x),p.y(y)]),c);
  const orb=(x:number,y:number,r:number,c:Color) => circle(graphics,p.x(x),p.y(y),r,c);

  rect(0,0,width,height,new Color(31,21,39));
  rect(0,0,width,510,new Color(48,27,49));
  rect(0,54,width,390,new Color(78,34,49));
  rect(0,156,width,294,new Color(121,45,48));
  // Warm horizon glow behind the village.
  rect(0,234,width,190,new Color(180,75,52));
  orb(604,104,72,new Color(255,207,127,38));
  orb(604,104,48,new Color(255,218,142));
  orb(590,93,38,new Color(255,241,183));
  for (const [x,y,r] of [[78,74,2],[137,116,2],[232,58,2],[310,103,1],[438,67,2],[510,139,1],[702,177,2],[663,48,1]]) orb(x,y,r,new Color(255,227,159,185));

  // Layered hills and a warm village street.
  poly([[0,282],[74,220],[150,253],[240,214],[334,267],[425,221],[510,251],[607,207],[750,264],[750,399],[0,399]],new Color(77,42,54));
  poly([[0,318],[92,277],[174,305],[274,266],[370,313],[489,264],[589,305],[680,274],[750,307],[750,414],[0,414]],new Color(47,31,42));
  poly([[0,375],[750,375],[750,510],[510,430],[408,414],[332,417],[430,438],[210,510],[0,510]],new Color(119,49,45));
  for (const [x,base,w,h] of [[62,334,58,45],[130,320,42,37],[548,334,66,48],[623,318,45,37]]) {
    rect(x,base-h,w,h,new Color(91,41,39),3);
    poly([[x-9,base-h],[x+w/2,base-h-27],[x+w+9,base-h]],new Color(42,27,36));
    rect(x+10,base-h+13,10,12,new Color(255,213,133),2);
    rect(x+w-20,base-h+13,10,12,new Color(255,213,133),2);
  }
  poly([[326,410],[347,410],[358,382],[331,382]],new Color(255,205,117));
  poly([[414,388],[431,388],[446,380],[438,379]],new Color(255,205,117));
  rect(0,414,width,height-414,new Color(47,29,38));
  poly([[0,height],[0,492],[304,390],[441,390],[750,492],[750,height]],new Color(61,32,39));
  poly([[306,height],[440,height],[445,448],[408,418],[340,419],[304,448]],new Color(100,45,44));
  for (let y=500;y<height-30;y+=82) rect(360,y,29,43,new Color(246,195,67,115),5);

  for (const [x,y,size] of [[42,88,32],[716,82,29],[64,204,23],[690,214,24]]) {
    rect(x-2,y-28,4,39,look.trim,2);
    rect(x-size/2,y,size,40,new Color(202,50,44),12);
    rect(x-size/2+5,y+4,size-10,3,look.trim,1);
    rect(x-size/2+5,y+32,size-10,3,look.trim,1);
    rect(x-2,y+40,4,13,look.trim,2);
  }
  // Side curtains leave a clean centre lane for the open trunk.
  rect(0,0,16,height,new Color(95,29,38));
  rect(width-16,0,16,height,new Color(95,29,38));
  rect(16,0,2,height,new Color(246,195,67,95));
  rect(width-18,0,2,height,new Color(246,195,67,95));
}

export function drawStageChrome(graphics: Graphics, width: number, height: number, top: number, board: Rect, tray: Rect, noticeY: number, look: VehicleLook): void {
  const p=topDown(width,height,top);
  const rect=(x:number,y:number,w:number,h:number,c:Color,r=0) => {
    if (r) { graphics.fillColor=c; graphics.roundRect(p.x(x),p.y(y+h),w,h,r); graphics.fill(); }
    else { graphics.fillColor=c; graphics.rect(p.x(x),p.y(y+h),w,h); graphics.fill(); }
  };
  const poly=(points:readonly (readonly [number,number])[],c:Color) =>
    polygon(graphics,points.map(([x,y]):[number,number]=>[p.x(x),p.y(y)]),c);

  // Spring Festival header banner and paired gold ribbons.
  rect(34,15,682,127,new Color(40,19,28,145),26);
  rect(38,18,674,120,look.trim,24);
  rect(44,24,662,108,new Color(147,31,39),18);
  rect(53,31,644,94,new Color(206,48,43),13);
  poly([[69,52],[94,52],[79,76],[72,74]],new Color(255,219,149,120));
  poly([[681,52],[656,52],[671,76],[678,74]],new Color(255,219,149,120));
  rect(112,112,526,2,new Color(255,222,161,170),1);
  rect(300,24,150,4,new Color(255,224,165),2);

  // Two HUD tablets: loaded count on the left, departure clock on the right.
  rect(42,158,326,58,new Color(91,25,35,235),18);
  rect(382,158,326,58,new Color(91,25,35,235),18);
  rect(44,160,322,54,look.trim,16);
  rect(384,160,322,54,look.trim,16);
  rect(49,165,312,44,new Color(153,34,42),12);
  rect(389,165,312,44,new Color(153,34,42),12);
  rect(66,183,104,2,new Color(255,218,154,100),1);
  rect(580,183,104,2,new Color(255,218,154,100),1);

  // The notice ribbon sits in the narrow gap above the cargo tray.
  rect(75,noticeY-25,600,42,new Color(72,25,33,220),14);
  rect(78,noticeY-22,594,36,look.trim,12);
  rect(82,noticeY-18,586,28,new Color(141,32,40),9);

  // Open wooden cargo tray with rope handles and gold trim.
  rect(tray.x-5,tray.y-5,tray.w+10,tray.h+10,new Color(79,28,34),25);
  rect(tray.x,tray.y,tray.w,tray.h,look.trim,21);
  rect(tray.x+5,tray.y+5,tray.w-10,tray.h-10,new Color(112,39,39),17);
  for (let y=tray.y+56;y<tray.y+tray.h-16;y+=38) rect(tray.x+10,y,tray.w-20,2,new Color(255,217,151,42));
  rect(tray.x+25,tray.y+10,tray.w-50,3,new Color(255,229,174,75),2);
  rect(tray.x-13,tray.y+tray.h/2-23,10,46,new Color(226,170,98),5);
  rect(tray.x+tray.w+3,tray.y+tray.h/2-23,10,46,new Color(226,170,98),5);

  // A subtle gold rim keeps the board readable without washing out its floor.
  const rim=new Color(255,218,153,135);
  rect(board.x-8,board.y-8,board.w+16,8,rim,4);
  rect(board.x-8,board.y+board.h,board.w+16,8,rim,4);
  rect(board.x-8,board.y,8,board.h,rim,4);
  rect(board.x+board.w,board.y,8,board.h,rim,4);
}

export function drawCarRear(graphics: Graphics, width: number, height: number, top: number, car: Rect, trunk: Rect, look: VehicleLook): void {
  const p=topDown(width,height,top);
  const rect=(x:number,y:number,w:number,h:number,c:Color,r=0) => {
    if (r) { graphics.fillColor=c; graphics.roundRect(p.x(x),p.y(y+h),w,h,r); graphics.fill(); }
    else { graphics.fillColor=c; graphics.rect(p.x(x),p.y(y+h),w,h); graphics.fill(); }
  };
  const poly=(points:readonly (readonly [number,number])[],c:Color) =>
    polygon(graphics,points.map(([x,y]):[number,number]=>[p.x(x),p.y(y)]),c);
  const orb=(x:number,y:number,r:number,c:Color) => circle(graphics,p.x(x),p.y(y),r,c);

  // Ground shadow and an open lid rising behind the car body.
  rect(car.x+26,car.y+28,car.w-52,car.h+44,new Color(16,11,17,155),48);
  poly([[car.x+66,car.y+2],[car.x+car.w-66,car.y+2],[trunk.x+trunk.w-4,trunk.y-10],[trunk.x+4,trunk.y-10]],look.deep);
  poly([[car.x+80,car.y+13],[car.x+car.w-80,car.y+13],[trunk.x+trunk.w-18,trunk.y-20],[trunk.x+18,trunk.y-20]],look.body);
  poly([[car.x+100,car.y+19],[car.x+car.w-100,car.y+19],[trunk.x+trunk.w-36,trunk.y-25],[trunk.x+36,trunk.y-25]],look.light);
  poly([[trunk.x+40,trunk.y-35],[trunk.x+trunk.w-40,trunk.y-35],[trunk.x+trunk.w-52,trunk.y-16],[trunk.x+52,trunk.y-16]],look.trim);
  poly([[trunk.x+trunk.w/2,car.y+25],[trunk.x+trunk.w/2+25,car.y+51],[trunk.x+trunk.w/2,car.y+77],[trunk.x+trunk.w/2-25,car.y+51]],look.trim);
  poly([[trunk.x+trunk.w/2,car.y+31],[trunk.x+trunk.w/2+18,car.y+51],[trunk.x+trunk.w/2,car.y+71],[trunk.x+trunk.w/2-18,car.y+51]],look.deep);
  rect(trunk.x+trunk.w/2-54,trunk.y-56,108,18,look.deep,9);
  rect(trunk.x+trunk.w/2-41,trunk.y-51,82,7,look.trim,3);

  // Broad rear body, quarter panels and bumper.
  rect(car.x,car.y+20,car.w,car.h-20,look.deep,44);
  rect(car.x+7,car.y+27,car.w-14,car.h-34,look.body,38);
  rect(car.x+16,car.y+39,car.w-32,22,look.light,10);
  rect(trunk.x-24,trunk.y-12,24,trunk.h+28,look.deep,8);
  rect(trunk.x+trunk.w,trunk.y-12,24,trunk.h+28,look.deep,8);
  rect(trunk.x-20,trunk.y-5,20,trunk.h+14,look.body,6);
  rect(trunk.x+trunk.w,trunk.y-5,20,trunk.h+14,look.body,6);
  rect(car.x+52,car.y+car.h-91,car.w-104,19,look.light,9);
  rect(car.x+35,car.y+car.h-71,car.w-70,46,look.deep,21);
  rect(car.x+52,car.y+car.h-62,car.w-104,27,look.body,13);

  // Trunk opening rim and deep interior.
  rect(trunk.x-13,trunk.y-13,trunk.w+26,trunk.h+26,look.trim,20);
  rect(trunk.x-8,trunk.y-8,trunk.w+16,trunk.h+16,look.deep,16);
  rect(trunk.x,trunk.y,trunk.w,trunk.h,new Color(27,31,34),12);
  rect(trunk.x+8,trunk.y+8,trunk.w-16,trunk.h-16,new Color(37,42,45),8);

  // Tail lights, reflector strip, plate recess and exhaust.
  for (const x of [car.x+50,car.x+car.w-190]) {
    rect(x,car.y+car.h-128,140,45,new Color(77,20,27),14);
    rect(x+8,car.y+car.h-121,124,31,look.light,10);
    rect(x+20,car.y+car.h-113,100,13,new Color(255,172,91),6);
  }
  rect(car.x+238,car.y+car.h-136,246,54,new Color(49,25,27),11);
  rect(car.x+245,car.y+car.h-129,232,40,look.trim,8);
  rect(car.x+251,car.y+car.h-123,220,28,new Color(48,40,34),6);
  rect(car.x+car.w-116,car.y+car.h-35,70,18,new Color(38,28,29),9);
  orb(car.x+46,car.y+car.h-25,18,new Color(20,14,18));
  orb(car.x+car.w-46,car.y+car.h-25,18,new Color(20,14,18));
}

export function drawTrunkFloor(graphics: Graphics, width: number, height: number, top: number, trunk: Rect, board: Rect, level: Pick<Level,'width'|'height'|'blocked'>, cell: number): void {
  const p=topDown(width,height,top);
  const rect=(x:number,y:number,w:number,h:number,c:Color,r=0) => {
    if (r) { graphics.fillColor=c; graphics.roundRect(p.x(x),p.y(y+h),w,h,r); graphics.fill(); }
    else { graphics.fillColor=c; graphics.rect(p.x(x),p.y(y+h),w,h); graphics.fill(); }
  };
  rect(trunk.x+12,trunk.y+12,trunk.w-24,trunk.h-24,new Color(24,28,31),8);
  for (let y=trunk.y+26;y<trunk.y+trunk.h-20;y+=44) rect(trunk.x+17,y,trunk.w-34,2,new Color(226,232,225,18));
  rect(board.x-5,board.y-5,board.w+10,board.h+10,new Color(13,17,19),8);
  for (let y=0;y<level.height;y++) for (let x=0;x<level.width;x++) {
    const blocked=level.blocked.some(([bx,by]) => bx === x && by === y);
    const rx=board.x+x*cell, ry=board.y+y*cell;
    rect(rx+1,ry+1,cell-2,cell-2,blocked ? new Color(24,28,31) : (x+y)%2 ? new Color(43,49,52) : new Color(49,56,59));
    if (blocked) {
      rect(rx+7,ry+7,cell-14,cell-14,new Color(31,36,39),7);
      graphics.strokeColor=new Color(246,195,67,145); graphics.lineWidth=2;
      graphics.moveTo(p.x(rx+15),p.y(ry+cell-15));
      graphics.lineTo(p.x(rx+cell-15),p.y(ry+15));
      graphics.moveTo(p.x(rx+15),p.y(ry+15));
      graphics.lineTo(p.x(rx+cell-15),p.y(ry+cell-15));
      graphics.stroke();
    }
    rect(rx+cell-1,ry+1,1,cell-2,new Color(224,231,226,24));
    rect(rx+1,ry+cell-1,cell-2,1,new Color(224,231,226,24));
  }
  // The mat around a small stage-one grid still reads as a real trunk floor.
  rect(board.x,board.y,board.w,2,new Color(255,218,153,90));
  rect(board.x,board.y+board.h-2,board.w,2,new Color(255,218,153,90));
}

// Barely-there cell lines and wheel-arch cells over the painted trunk carpet.
export function drawTrunkGrid(graphics: Graphics, width: number, height: number, top: number, board: Rect, level: Pick<Level,'width'|'height'|'blocked'>, cell: number): void {
  const p=topDown(width,height,top);
  graphics.fillColor=new Color(255,226,170,18);
  graphics.roundRect(p.x(board.x),p.y(board.y+board.h),board.w,board.h,6); graphics.fill();
  graphics.strokeColor=new Color(255,214,140,120); graphics.lineWidth=3;
  graphics.roundRect(p.x(board.x-3),p.y(board.y+board.h+3),board.w+6,board.h+6,8); graphics.stroke();
  graphics.strokeColor=new Color(255,226,170,38); graphics.lineWidth=1.5;
  for (let x=1;x<level.width;x++) { graphics.moveTo(p.x(board.x+x*cell),p.y(board.y)); graphics.lineTo(p.x(board.x+x*cell),p.y(board.y+board.h)); }
  for (let y=1;y<level.height;y++) { graphics.moveTo(p.x(board.x),p.y(board.y+y*cell)); graphics.lineTo(p.x(board.x+board.w),p.y(board.y+y*cell)); }
  graphics.stroke();
  for (const [x,y] of level.blocked) {
    const rx=board.x+x*cell, ry=board.y+y*cell;
    graphics.fillColor=new Color(14,11,13,235);
    graphics.roundRect(p.x(rx+2),p.y(ry+cell-2),cell-4,cell-4,10); graphics.fill();
    graphics.strokeColor=new Color(246,195,67,120); graphics.lineWidth=2;
    graphics.moveTo(p.x(rx+16),p.y(ry+cell-16)); graphics.lineTo(p.x(rx+cell-16),p.y(ry+16));
    graphics.moveTo(p.x(rx+16),p.y(ry+16)); graphics.lineTo(p.x(rx+cell-16),p.y(ry+cell-16));
    graphics.stroke();
  }
}
