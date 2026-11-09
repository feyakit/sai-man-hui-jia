import { Color, EventTouch, Graphics, Label, Node, UITransform, Vec3, view } from 'cc';
import { GAME_TITLE } from '../config/brand';
import type { Point } from '../core/input';
import { ITEMS } from '../core/items';
import { rotate, SHAPES } from '../core/shapes';
import type { Level, PieceDef, Rotation, ShapeId } from '../core/types';
import { VEHICLES } from '../core/vehicles';
import { StageSession } from '../game/StageSession';
import { DragController, type Gesture } from '../game/DragController';
import { fill, label, uiNode } from '../ui/UIKit';
import { drawHomeRoad } from '../ui/JourneyArt';

interface Rect { x: number; y: number; w: number; h: number }
const ink = new Color(74,44,26);
const red = new Color(158,45,41);
const cream = new Color(255,246,229);
const gold = new Color(255,201,119);
const muted = new Color(132,91,72);
const palette = [[174,64,53],[157,99,36],[65,115,97],[95,87,140],[152,70,106]];
const packageColors: Record<ShapeId,number> = {
  I2:0,I3:0,L3:3,I4:2,O4:3,L4:1,J4:3,T4:1,S4:2,Z4:0,
  P5:4,L5:3,T5:3,U5:1,V5:0,Z5:4,N5:2,Y5:0,R6:1,
};
const stamps = {I2:'酒',I3:'腊',L3:'煲',I4:'蔗',O4:'奶',L4:'箱',J4:'包',T4:'礼',S4:'鱼',Z4:'鸭',
  P5:'被',L5:'冻',T5:'视',U5:'笼',V5:'蟹',Z5:'画',N5:'藕',Y5:'联',R6:'箱'};
const inRect = (point: Point, rect: Rect) =>
  point.x >= rect.x && point.y >= rect.y && point.x < rect.x+rect.w && point.y < rect.y+rect.h;

export class StagePage {
  readonly node: Node;
  private readonly graphics: Graphics;
  private readonly session: StageSession;
  private readonly clock: Label;
  private readonly notice: Label;
  private readonly packed: Label;
  private readonly board: Rect;
  private readonly tray: Rect;
  private readonly cell: number;
  private readonly width: number;
  private readonly height: number;
  private readonly buttons: {rect: Rect; action: () => void; duringDrag: boolean}[] = [];
  private readonly itemLabels = new Map<number,Label>();
  private slots: {piece: PieceDef; rect: Rect}[] = [];
  private readonly drag = new DragController();
  private selected?: PieceDef;
  private scroll = 0;
  private scrollLimit = 0;
  private cleared = false;
  private scale = 0;
  private displayedSeconds = -1;

  constructor(parent: Node, private readonly level: Level, private readonly now: () => number, private readonly onClear: () => void) {
    this.width = 750;
    this.height = 1334;
    this.node = uiNode('StagePage',parent,this.width,this.height);
    const backdrop = uiNode('JourneyBackdrop',this.node,this.width,this.height).addComponent(Graphics);
    fill(backdrop,cream,-this.width/2,-this.height/2,this.width,this.height);
    drawHomeRoad(backdrop,this.width,this.height,0);
    this.graphics = uiNode('LuggageGraphics',this.node,this.width,this.height).addComponent(Graphics);
    this.session = new StageSession(level,now);
    this.cell = Math.floor(Math.min(110,640/level.width,568/level.height));
    const boardHeight = this.cell*level.height;
    this.board = {x:(this.width-this.cell*level.width)/2,y:349+(568-boardHeight)/2,w:this.cell*level.width,h:boardHeight};
    this.tray = {x:24,y:1001,w:this.width-48,h:145};
    const vehicle = VEHICLES.find(entry => entry.id === level.vehicle)?.name ?? '小轿车';
    this.caption('Kicker','春运归家 · 年前最后一趟',23,0,53,gold);
    this.caption('Title',GAME_TITLE,65,0,118,cream);
    this.caption('Route','从打拼的城市，到亮着灯的老家',26,0,179,new Color(255,222,181));
    this.caption('Vehicle',`第 ${level.stage} 关 · ${vehicle}`,34,0,285,ink);
    this.clock = this.caption('Clock','',25,174,325,red);
    this.packed = this.caption('Packed','',25,-174,325,muted);
    this.notice = this.caption('Notice','',24,0,972,ink);
    this.caption('ControlsHint','拖年货进车厢 · 点按转向 · 横滑托盘',21,0,1275,muted);
    if (level.stage === 1) {
      this.caption('TrunkOpen','后备箱已打开',23,0,405,muted);
      this.caption('FirstLeg','装好这车年货，就能出发。',26,0,893,muted);
    }
    for (const piece of level.pieces) {
      const item = this.caption(`Item${piece.id}`,'',22,0,0,cream);
      this.itemLabels.set(piece.id,item);
    }
    const controlsY = this.tray.y+this.tray.h+14;
    this.button('旋转 90°',this.width/2-235,controlsY,() => this.rotateSelected(),true);
    this.button('撤销',this.width/2-75,controlsY,() => { this.session.undo(); this.paint(); });
    this.button('重开',this.width/2+85,controlsY,() => {
      this.session.restart();
      this.drag.cancel();
      this.cleared=false;
      this.selected=undefined;
      this.scroll=0;
      this.paint();
    });
    this.node.on(Node.EventType.TOUCH_START,this.start,this);
    this.node.on(Node.EventType.TOUCH_MOVE,this.move,this);
    this.node.on(Node.EventType.TOUCH_END,this.end,this);
    this.node.on(Node.EventType.TOUCH_CANCEL,this.cancel,this);
    this.paint();
    this.tick();
  }

  tick(): void {
    const size = view.getVisibleSize();
    const scale = Math.min(size.width/this.width,size.height/this.height);
    const resized = scale > 0 && scale !== this.scale;
    if (resized) {
      this.scale = scale;
      this.node.setScale(scale,scale,1);
    }
    const seconds = this.session.remainingSeconds;
    if (seconds !== this.displayedSeconds) {
      this.displayedSeconds = seconds;
      this.clock.string = seconds ? `距出发 ${seconds} 秒` : '时间到 · 重装一趟';
      this.clock.color = seconds <= 30 ? new Color(215,51,43) : red;
    }
    if ((resized || !seconds) && this.drag.cancel()) this.paint();
  }

  private point(event: EventTouch): Point {
    const touch = event.getUILocation();
    const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(touch.x,touch.y,0));
    return {x:local.x+this.width/2,y:this.height/2-local.y};
  }

  private button(text: string,x: number,y: number,action: () => void,duringDrag = false): void {
    const rect = {x,y,w:150,h:62};
    this.buttons.push({rect,action,duringDrag});
    const title = label(this.node,text,text,27,x+rect.w/2-this.width/2,this.height/2-y-rect.h/2);
    title.color = new Color(255,246,229);
  }

  private caption(name: string, text: string, size: number, x: number, y: number, color: Color): Label {
    const result = label(this.node,name,text,size,x,this.height/2-y);
    result.color = color;
    return result;
  }

  private positionItem(piece: PieceDef, text: string, x: number, y: number, color: Color): void {
    const item = this.itemLabels.get(piece.id)!;
    item.string = text;
    item.color = color;
    item.node.setPosition(x-this.width/2,this.height/2-y);
    item.node.active = true;
  }

  private rectangle(rect: Rect, color: Color, radius = 0): void {
    fill(this.graphics,color,rect.x-this.width/2,this.height/2-rect.y-rect.h,rect.w,rect.h,radius);
  }

  private paintPiece(piece: PieceDef, rotation: Rotation, x: number, y: number, size: number, tint?: Color, clip?: Rect): void {
    const [r,g,b] = palette[packageColors[piece.shape]];
    const color = tint ?? new Color(r,g,b);
    const cells = rotate(SHAPES[piece.shape],rotation);
    const box = (tile: Rect, boxColor: Color, radius: number) => {
      if (clip) {
        const left = Math.max(tile.x,clip.x), right = Math.min(tile.x+tile.w,clip.x+clip.w);
        if (left >= right) return;
        tile.x = left;
        tile.w = right-left;
      }
      this.rectangle(tile,boxColor,Math.min(radius,tile.w/2,tile.h/2));
    };
    const inset = Math.max(2,size*.07);
    const labelInk = new Color(255,236,191,85);
    for (const [dx,dy] of cells) {
      const left = x+dx*size;
      const top = y+dy*size;
      box({x:left+inset,y:top+inset,w:size-2*inset,h:size-2*inset},color,Math.min(8,size*.17));
      if (tint) continue;
      if (cells.some(([cx,cy]) => cx === dx+1 && cy === dy)) {
        box({x:left+size-2*inset,y:top+inset,w:4*inset,h:size-2*inset},color,0);
      }
      if (cells.some(([cx,cy]) => cx === dx && cy === dy+1)) {
        box({x:left+inset,y:top+size-2*inset,w:size-2*inset,h:4*inset},color,0);
      }
      box({x:left+size*.2,y:top+size*.20,w:size*.6,h:Math.max(2,size*.055)},labelInk,2);
    }
  }

  private paint(): void {
    this.graphics.clear();
    for (const item of this.itemLabels.values()) item.node.active = false;
    const {x,y,w,h} = this.board;
    this.rectangle({x:x+w*.22,y:y-31,w:w*.56,h:20},new Color(82,58,54),7);
    this.rectangle({x:x+w*.3,y:y-27,w:w*.4,h:7},new Color(180,132,115),3);
    this.rectangle({x:x-30,y:y+8,w:21,h:55},new Color(61,48,50),7);
    this.rectangle({x:x+w+9,y:y+8,w:21,h:55},new Color(61,48,50),7);
    this.rectangle({x:x-30,y:y+h-57,w:21,h:55},new Color(61,48,50),7);
    this.rectangle({x:x+w+9,y:y+h-57,w:21,h:55},new Color(61,48,50),7);
    this.rectangle({x:x-25,y:y-19,w:w+50,h:h+49},new Color(106,47,43),22);
    this.rectangle({x:x-16,y:y-12,w:w+32,h:h+36},new Color(174,67,55),17);
    this.rectangle({x:x-6,y:y-6,w:w+12,h:h+12},new Color(82,58,54),11);
    this.rectangle(this.board,new Color(231,205,170),8);
    this.rectangle({x:x-13,y:y+h+9,w:54,h:9},gold,4);
    this.rectangle({x:x+w-41,y:y+h+9,w:54,h:9},gold,4);
    this.rectangle({x:x+w/2-37,y:y+h+10,w:74,h:13},new Color(63,66,92),4);
    const blocked = new Set(this.level.blocked.map(([x,y]) => `${x},${y}`));
    for (let y=0;y<this.level.height;y++) for (let x=0;x<this.level.width;x++) {
      this.rectangle({
        x:this.board.x+x*this.cell+1,y:this.board.y+y*this.cell+1,w:this.cell-2,h:this.cell-2,
      },blocked.has(`${x},${y}`) ? new Color(146,126,106) : new Color(255,241,212),4);
    }
    const held = this.drag.active?.mode === 'drag' ? this.drag.active : undefined;
    const placements = this.session.placements;
    for (const placement of placements) {
      if (held?.piece?.id === placement.pieceId) continue;
      const piece = this.level.pieces.find(item => item.id === placement.pieceId)!;
      const left = x+placement.x*this.cell;
      const top = y+placement.y*this.cell;
      this.paintPiece(piece,placement.rotation,left,top,this.cell);
      const [dx,dy] = rotate(SHAPES[piece.shape],placement.rotation)[0];
      this.positionItem(piece,stamps[piece.shape],left+(dx+.5)*this.cell,top+(dy+.5)*this.cell,cream);
    }
    this.rectangle(this.tray,new Color(231,208,174),16);
    this.packed.string = `已装车 ${placements.length} / ${this.level.pieces.length} 件`;
    const placed = new Set(placements.map(placement => placement.pieceId));
    const pieces = this.level.pieces.filter(piece => !placed.has(piece.id));
    this.scrollLimit = Math.max(0,pieces.length*139-this.tray.w+20);
    this.scroll = Math.min(this.scroll,this.scrollLimit);
    this.slots = [];
    for (const [index,piece] of pieces.entries()) {
      const rect = {x:this.tray.x+10+index*139-this.scroll,y:this.tray.y+14,w:130,h:108};
      this.slots.push({piece,rect});
      if (held?.piece?.id === piece.id) continue;
      const left = Math.max(rect.x,this.tray.x+4);
      const right = Math.min(rect.x+rect.w,this.tray.x+this.tray.w-4);
      if (right > left) {
        this.rectangle({x:left,y:rect.y,w:right-left,h:119},new Color(255,244,222),9);
      }
      const rotation = this.session.rotationFor(piece.id);
      const cells = rotate(SHAPES[piece.shape],rotation);
      const columns = Math.max(...cells.map(([column]) => column))+1;
      const rows = Math.max(...cells.map(([,row]) => row))+1;
      const size = Math.floor(Math.min(34,(rect.w-18)/columns,80/rows));
      this.paintPiece(piece,rotation,rect.x+(rect.w-columns*size)/2,rect.y+(90-rows*size)/2,size,undefined,this.tray);
      if (right-left >= 105) {
        this.positionItem(piece,ITEMS[piece.shape].name,(left+right)/2,rect.y+104,ink);
      }
    }
    for (const {rect} of this.buttons) this.rectangle(rect,red,13);
    const mission = this.level.stage === 1 ? '先把给家里带的年货装上车' : '年前最后一程，把剩下的年货带回家';
    this.notice.string = this.selected ? `正在装车 · ${ITEMS[this.selected.shape].name}` : mission;
    if (held?.piece) {
      const placement = this.drag.placement(held,this.board,this.cell);
      if (placement && inRect(held.current,this.board)) {
        const color = this.session.canDrop(placement) ? new Color(76,175,80,145) : new Color(229,57,53,145);
        this.paintPiece(held.piece,held.rotation,this.board.x+placement.x*this.cell,this.board.y+placement.y*this.cell,this.cell,color);
      } else {
        this.paintPiece(held.piece,held.rotation,held.current.x-held.offset.x,held.current.y-held.offset.y,this.cell);
      }
    }
  }

  private rotateSelected(): void {
    if (!this.selected || this.cleared || !this.session.remainingSeconds) return;
    if (!this.drag.rotateHeld()) this.session.rotatePiece(this.selected.id);
    this.paint();
  }

  private start(event: EventTouch): void {
    const point = this.point(event);
    const button = this.buttons.find(entry => inRect(point,entry.rect));
    if (button) {
      if (!this.drag.active || (button.duringDrag && this.drag.active.mode === 'drag')) button.action();
      return;
    }
    if (this.drag.active || this.cleared || !this.session.remainingSeconds) return;
    let piece: PieceDef | undefined;
    let offset = {x:this.cell/2,y:this.cell/2+22};
    const fromTray = inRect(point,this.tray);
    if (fromTray) piece = this.slots.find(slot => inRect(point,slot.rect))?.piece;
    if (inRect(point,this.board)) {
      const x = Math.floor((point.x-this.board.x)/this.cell);
      const y = Math.floor((point.y-this.board.y)/this.cell);
      const placement = this.session.placements.find(item => {
        const definition = this.level.pieces.find(candidate => candidate.id === item.pieceId)!;
        return rotate(SHAPES[definition.shape],item.rotation).some(([dx,dy]) => item.x+dx === x && item.y+dy === y);
      });
      if (placement) {
        piece = this.level.pieces.find(item => item.id === placement.pieceId);
        offset = {x:point.x-this.board.x-placement.x*this.cell,y:point.y-this.board.y-placement.y*this.cell};
      }
    }
    if (!piece && !fromTray) return;
    this.drag.begin({
      id:event.getID() ?? 0,start:point,time:this.now(),piece,fromTray,scrollStart:this.scroll,
      rotation:piece ? this.session.rotationFor(piece.id) : 0,offset,
    });
  }

  private applyGesture(gesture: Readonly<Gesture>): void {
    if (gesture.mode === 'drag') this.selected = gesture.piece;
    if (gesture.mode === 'scroll') {
      this.scroll = Math.max(0,Math.min(this.scrollLimit,gesture.scrollStart+gesture.start.x-gesture.current.x));
    }
  }

  private move(event: EventTouch): void {
    const gesture = this.drag.move(event.getID() ?? 0,this.point(event));
    if (!gesture) return;
    this.applyGesture(gesture);
    this.paint();
  }

  private end(event: EventTouch): void {
    const released = this.drag.release(event.getID() ?? 0,this.point(event),this.now());
    if (!released) return;
    const {gesture,tap} = released;
    this.applyGesture(gesture);
    if (gesture.piece && this.session.remainingSeconds) {
      if (tap) {
        this.selected = gesture.piece;
        this.session.rotatePiece(gesture.piece.id);
      } else if (gesture.mode === 'drag') {
        const placement = this.drag.placement(gesture,this.board,this.cell);
        if (placement && inRect(gesture.current,this.board)) this.session.drop(placement);
        else if (!gesture.fromTray) this.session.returnToTray(gesture.piece.id,gesture.rotation);
      }
    }
    this.paint();
    if (this.session.solved && !this.cleared) {
      this.cleared=true;
      this.onClear();
    }
  }

  private cancel(event: EventTouch): void {
    if (this.drag.cancel(event.getID() ?? 0)) this.paint();
  }
}
