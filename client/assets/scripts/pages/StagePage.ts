import { Color, EventTouch, Graphics, Label, Node, UITransform, Vec3, view } from 'cc';
import type { Point } from '../core/input';
import { ITEMS } from '../core/items';
import { rotate, SHAPES } from '../core/shapes';
import type { Level, PieceDef, Rotation } from '../core/types';
import { VEHICLES } from '../core/vehicles';
import { StageSession } from '../game/StageSession';
import { DragController, type Gesture } from '../game/DragController';
import { fill, label, uiNode } from '../ui/UIKit';

interface Rect { x: number; y: number; w: number; h: number }
const palette = [[215,69,57],[240,162,54],[91,133,128],[104,106,169],[182,105,132]];
const inRect = (point: Point, rect: Rect) =>
  point.x >= rect.x && point.y >= rect.y && point.x < rect.x+rect.w && point.y < rect.y+rect.h;

export class StagePage {
  readonly node: Node;
  private readonly graphics: Graphics;
  private readonly session: StageSession;
  private readonly clock: Label;
  private readonly notice: Label;
  private readonly board: Rect;
  private readonly tray: Rect;
  private readonly cell: number;
  private readonly width: number;
  private readonly height: number;
  private readonly buttons: {rect: Rect; action: () => void; duringDrag: boolean}[] = [];
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
    this.graphics = this.node.addComponent(Graphics);
    this.session = new StageSession(level,now);
    const top = 164;
    const bottom = Math.max(top+460,this.height-250);
    this.cell = Math.floor(Math.min(96,(this.width-48)/level.width,(bottom-top)/level.height));
    this.board = {x:(this.width-this.cell*level.width)/2,y:top,w:this.cell*level.width,h:this.cell*level.height};
    this.tray = {x:24,y:Math.min(this.height-196,this.board.y+this.board.h+70),w:this.width-48,h:136};
    const name = VEHICLES.find(vehicle => vehicle.id === level.vehicle)?.name ?? '小轿车';
    label(this.node,'Title',`第 ${level.stage} 关 · ${name}`,38,0,this.height/2-52);
    this.clock = label(this.node,'Clock','',32,0,this.height/2-105);
    this.notice = label(this.node,'Notice','拖动行李，填满后备箱',26,0,this.height/2-(this.tray.y-30));
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
      this.clock.string = seconds ? `剩余 ${seconds} 秒` : '时间到，点「重开」再试';
      this.clock.color = seconds <= 30 ? new Color(215,51,43) : new Color(74,44,26);
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

  private rectangle(rect: Rect, color: Color, radius = 0): void {
    fill(this.graphics,color,rect.x-this.width/2,this.height/2-rect.y-rect.h,rect.w,rect.h,radius);
  }

  private paintPiece(piece: PieceDef, rotation: Rotation, x: number, y: number, size: number, tint?: Color, clip?: Rect): void {
    const [r,g,b] = palette[(piece.id-1)%palette.length];
    const color = tint ?? new Color(r,g,b);
    for (const [dx,dy] of rotate(SHAPES[piece.shape],rotation)) {
      const tile = {x:x+dx*size+2,y:y+dy*size+2,w:size-4,h:size-4};
      if (clip) {
        const left = Math.max(tile.x,clip.x), right = Math.min(tile.x+tile.w,clip.x+clip.w);
        if (left >= right) continue;
        tile.x = left;
        tile.w = right-left;
      }
      this.rectangle(tile,color,Math.min(7,tile.w/2));
    }
  }

  private paint(): void {
    this.graphics.clear();
    this.rectangle({x:0,y:0,w:this.width,h:this.height},new Color(255,246,229));
    this.rectangle(this.board,new Color(232,217,191),10);
    const blocked = new Set(this.level.blocked.map(([x,y]) => `${x},${y}`));
    for (let y=0;y<this.level.height;y++) for (let x=0;x<this.level.width;x++) {
      this.rectangle({
        x:this.board.x+x*this.cell+1,y:this.board.y+y*this.cell+1,w:this.cell-2,h:this.cell-2,
      },blocked.has(`${x},${y}`) ? new Color(146,126,106) : new Color(255,241,212),4);
    }
    const held = this.drag.active?.mode === 'drag' ? this.drag.active : undefined;
    for (const placement of this.session.placements) {
      if (held?.piece?.id === placement.pieceId) continue;
      const piece = this.level.pieces.find(item => item.id === placement.pieceId)!;
      this.paintPiece(piece,placement.rotation,this.board.x+placement.x*this.cell,this.board.y+placement.y*this.cell,this.cell);
    }
    this.rectangle(this.tray,new Color(239,222,192),14);
    const placed = new Set(this.session.placements.map(placement => placement.pieceId));
    const pieces = this.level.pieces.filter(piece => !placed.has(piece.id));
    this.scrollLimit = Math.max(0,pieces.length*139-this.tray.w+20);
    this.scroll = Math.min(this.scroll,this.scrollLimit);
    this.slots = [];
    for (const [index,piece] of pieces.entries()) {
      const rect = {x:this.tray.x+10+index*139-this.scroll,y:this.tray.y+14,w:130,h:108};
      this.slots.push({piece,rect});
      if (held?.piece?.id === piece.id) continue;
      this.paintPiece(piece,this.session.rotationFor(piece.id),rect.x+5,rect.y+5,24,undefined,this.tray);
    }
    for (const {rect} of this.buttons) this.rectangle(rect,new Color(215,51,43),13);
    this.notice.string = this.selected ? ITEMS[this.selected.shape].name : '拖动行李，填满后备箱';
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
