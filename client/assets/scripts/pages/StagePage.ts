import { Color, EventTouch, Game, Graphics, Label, Node, Tween, UITransform, Vec3, game, sys, tween, view } from 'cc';
import { GAME_TITLE } from '../config/brand';
import type { Point } from '../core/input';
import { ITEMS } from '../core/items';
import { rotate, SHAPES } from '../core/shapes';
import type { Level, PieceDef, Placement, Rotation } from '../core/types';
import { StageSession } from '../game/StageSession';
import { DragController, type Gesture } from '../game/DragController';
import { dimensions, inRect, pieceCells, previewVisible, trayLayout, type Rect } from '../game/InteractionGeometry';
import { fill, label, uiNode } from '../ui/UIKit';

const ink = new Color(74,44,26), red = new Color(215,51,43), cream = new Color(255,246,229);
const gold = new Color(246,195,67), gray = new Color(160,151,136);
const green = new Color(76,175,80,128), invalid = new Color(229,57,53,128);
const colors = [new Color(174,64,53),new Color(157,99,36),new Color(65,115,97),new Color(95,87,140)];
const shadow = new Color(40,20,10,70);
interface PieceView { node: Node; graphics: Graphics; title: Label; rect: Rect; rotation: Rotation; size: number }

export class StagePage {
  readonly node: Node;
  private readonly session: StageSession;
  private readonly background: Graphics;
  private readonly preview: Graphics;
  private readonly controls: Graphics;
  private readonly clock: Label;
  private readonly packed: Label;
  private readonly notice: Label;
  private readonly overlay: Node;
  private readonly overlayText: Label;
  private readonly pieces = new Map<number,PieceView>();
  private readonly drag = new DragController();
  private readonly buttons: {rect: Rect; action: () => void; duringDrag: boolean}[] = [];
  private slots: {piece: PieceDef; rect: Rect}[] = [];
  private board: Rect = {x:0,y:0,w:0,h:0};
  private tray: Rect = {x:24,y:880,w:702,h:270};
  private cell = 0;
  private trayCell = 0;
  private width = 750;
  private height = 1334;
  private selected?: PieceDef;
  private cleared = false;
  private displayedSeconds = -1;
  private layoutWidth = -1;
  private layoutHeight = -1;
  private browserWidth = -1;
  private browserHeight = -1;
  private safeProbe?: HTMLDivElement;
  private previewX = NaN;
  private previewY = NaN;
  private previewRotation: Rotation = 0;
  private readonly candidate: Placement = {pieceId:0,x:0,y:0,rotation:0};
  private readonly touchWorld = new Vec3();
  private readonly touchLocal = new Vec3();
  private readonly touchPoint: Point = {x:0,y:0};
  private previewPlacement?: Placement;
  private modal: 'restart' | 'timeout' | undefined;
  private landscape = false;
  private rotateTitle: Label;
  private readonly onHide = () => this.cancelDrag();

  constructor(parent: Node, private readonly level: Level, private readonly now: () => number, private readonly onClear: () => void) {
    this.node = uiNode('StagePage',parent,750,1334);
    this.session = new StageSession(level,now);
    this.background = uiNode('GridBackground',this.node,750,1334).addComponent(Graphics);
    this.clock = label(this.node,'Clock','',28,0,0);
    this.packed = label(this.node,'Packed','',26,0,0);
    this.notice = label(this.node,'Notice','',24,0,0);
    label(this.node,'Title',GAME_TITLE,42,0,0);
    label(this.node,'Vehicle',`第 ${level.stage} 关 · 拖年货进后备箱`,27,0,0);
    this.preview = uiNode('DropPreview',this.node,750,1334).addComponent(Graphics);
    for (const piece of level.pieces) {
      const node = uiNode(`Piece${piece.id}`,this.node,1,1);
      const graphics = node.addComponent(Graphics);
      const title = label(node,`Item${piece.id}`,ITEMS[piece.shape].name,18,0,0);
      this.pieces.set(piece.id,{node,graphics,title,rect:{x:0,y:0,w:0,h:0},rotation:0,size:0});
    }
    this.controls = uiNode('Controls',this.node,750,1334).addComponent(Graphics);
    this.rotateTitle = this.button('旋转 90°',45,180,() => this.rotateSelected(),true);
    this.button('撤销',295,160,() => { this.cancelDrag(); this.session.undo(); this.selected=undefined; this.sync(); });
    this.button('重开',515,160,() => { this.cancelDrag(); this.modal='restart'; this.updateOverlay(); });
    this.overlay = uiNode('InteractionOverlay',this.node,750,1334);
    this.overlay.addComponent(Graphics);
    this.overlayText = label(this.overlay,'Prompt','',38,0,50);
    this.node.on(Node.EventType.TOUCH_START,this.start,this);
    this.node.on(Node.EventType.TOUCH_MOVE,this.move,this);
    this.node.on(Node.EventType.TOUCH_END,this.end,this);
    this.node.on(Node.EventType.TOUCH_CANCEL,this.cancel,this);
    game.on(Game.EVENT_HIDE,this.onHide);
    if (typeof document !== 'undefined') {
      this.safeProbe=document.createElement('div');
      this.safeProbe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
      document.body.appendChild(this.safeProbe);
    }
    this.node.once(Node.EventType.NODE_DESTROYED,() => {
      game.off(Game.EVENT_HIDE,this.onHide); this.safeProbe?.remove();
    });
    this.tick();
  }

  tick(): void {
    const size = view.getVisibleSize();
    const browserWidth = typeof window !== 'undefined' ? window.innerWidth : size.width;
    const browserHeight = typeof window !== 'undefined' ? window.innerHeight : size.height;
    if (size.width !== this.layoutWidth || size.height !== this.layoutHeight ||
        browserWidth !== this.browserWidth || browserHeight !== this.browserHeight) {
      this.cancelDrag();
      this.layoutWidth=size.width; this.layoutHeight=size.height;
      this.browserWidth=browserWidth; this.browserHeight=browserHeight;
      this.landscape=browserWidth > browserHeight;
      const safe = sys.getSafeAreaRect(false);
      this.height = Math.max(1334,size.height/size.width*750);
      { const k=Math.min(size.width/750,size.height/this.height); this.node.setScale(k,k,1); }
      this.node.getComponent(UITransform)!.setContentSize(750,this.height);
      let top = Math.max(0,(size.height-safe.y-safe.height)/size.height*this.height);
      let bottom = Math.max(0,safe.y/size.height*this.height);
      if (this.safeProbe) {
        const css=window.getComputedStyle(this.safeProbe);
        const ratio=750/browserWidth;
        top=Math.max(top,(parseFloat(css.paddingTop) || 0)*ratio);
        bottom=Math.max(bottom,(parseFloat(css.paddingBottom) || 0)*ratio);
      }
      this.layout(top,bottom);
    }
    const seconds = this.session.remainingSeconds;
    if (seconds !== this.displayedSeconds) {
      this.displayedSeconds = seconds;
      this.clock.string = Number.isFinite(seconds) ? `距出发 ${seconds} 秒` : '慢慢装，不限时';
      this.clock.color = seconds <= 10 ? red : ink;
    }
    if (this.session.expired && !this.cleared && this.modal !== 'timeout') {
      this.cancelDrag(); this.modal='timeout'; this.updateOverlay();
    }
  }

  private layout(top: number, bottom: number): void {
    const extra = this.height-1334;
    const boardTop = 205+top;
    const boardBottom = 850+extra-bottom;
    this.cell = Math.floor(Math.min(110,640/this.level.width,(boardBottom-boardTop-35)/this.level.height));
    this.board = {x:(750-this.cell*this.level.width)/2,y:boardTop+(boardBottom-boardTop-this.cell*this.level.height)/2,
      w:this.cell*this.level.width,h:this.cell*this.level.height};
    this.tray = {x:24,y:880+extra-bottom,w:702,h:270};
    const tray = trayLayout(this.level.pieces,this.tray);
    this.slots = tray.slots; this.trayCell = tray.cell;
    this.placeLabel('Title',65+top); this.placeLabel('Vehicle',122+top);
    this.placeLabel('Clock',172+top,190); this.placeLabel('Packed',172+top,-180);
    this.placeLabel('Notice',860+extra-bottom);
    for (const [i,button] of this.buttons.entries()) {
      button.rect.y = 1170+extra-bottom;
      this.placeLabel(`Button${i}`,button.rect.y+60,button.rect.x+button.rect.w/2-375);
    }
    this.drawBackground(); this.sync(); this.updateOverlay();
  }

  private placeLabel(name: string, y: number, x = 0): void { this.node.getChildByName(name)!.setPosition(x,this.height/2-y); }
  private rect(g: Graphics,r: Rect,color: Color): void { fill(g,color,r.x-375,this.height/2-r.y-r.h,r.w,r.h,6); }
  private drawBackground(): void {
    const g = this.background; g.clear();
    this.rect(g,{x:0,y:0,w:750,h:this.height},cream);
    this.rect(g,{x:this.board.x-14,y:this.board.y-14,w:this.board.w+28,h:this.board.h+28},red);
    this.rect(g,this.board,new Color(232,217,191));
    for (let y=0;y<this.level.height;y++) for (let x=0;x<this.level.width;x++) {
      const blocked = this.level.blocked.some(([bx,by]) => bx === x && by === y);
      const r = {x:this.board.x+x*this.cell+1,y:this.board.y+y*this.cell+1,w:this.cell-2,h:this.cell-2};
      this.rect(g,r,blocked ? ink : cream);
      if (blocked) {
        g.strokeColor=gold; g.lineWidth=3;
        for (let d=6;d<this.cell-6;d+=12) {
          g.moveTo(r.x-375+d,this.height/2-r.y-4);
          g.lineTo(r.x-375+4,this.height/2-r.y-d); g.stroke();
        }
      }
    }
    this.rect(g,this.tray,new Color(232,217,191));
  }

  private button(text: string,x: number,w: number,action: () => void,duringDrag = false): Label {
    const index = this.buttons.length;
    this.buttons.push({rect:{x,y:1170,w,h:120},action,duringDrag});
    return label(this.node,`Button${index}`,text,30,0,0);
  }
  private updateControls(): void {
    this.controls.clear();
    for (const [i,b] of this.buttons.entries()) this.rect(this.controls,b.rect,i === 0 ? (this.selected ? gold : gray) : red);
    this.rotateTitle.color = this.selected ? ink : cream;
    this.notice.string = this.selected ? `已选中 · ${ITEMS[this.selected.shape].name}` : '轻点选中 · 拖动装车 · 按按钮旋转';
    this.packed.string = `已装车 ${this.session.placements.length} / ${this.level.pieces.length} 件`;
  }
  private updateOverlay(): void {
    this.overlay.active = this.landscape || !!this.modal;
    if (!this.overlay.active) return;
    this.overlay.setSiblingIndex(this.node.children.length-1);
    const g = this.overlay.getComponent(Graphics)!; g.clear();
    this.rect(g,{x:-2000,y:-2000,w:4750,h:this.height+4000},new Color(40,20,10,235));
    this.overlayText.color = cream;
    this.overlayText.string = this.landscape ? '请竖屏游玩' : this.modal === 'restart' ? '重新装车？' : '时间到 · 再装一次';
    for (const child of this.overlay.children.slice(1)) child.destroy();
    if (!this.landscape) {
      const r = this.confirmRect(); this.rect(g,r,red);
      label(this.overlay,'Confirm','重新装车',32,0,this.height/2-r.y-r.h/2).color=cream;
      if (this.modal === 'restart') label(this.overlay,'Cancel','取消',28,0,this.height/2-r.y-160).color=cream;
    }
  }
  private confirmRect(): Rect { return {x:225,y:this.height/2+20,w:300,h:120}; }

  private sync(): void {
    for (const piece of this.level.pieces) this.renderPiece(piece);
    this.clearPreview(); this.updateControls();
  }
  private renderPiece(piece: PieceDef): void {
    const view = this.pieces.get(piece.id)!;
    Tween.stopAllByTarget(view.node); view.node.angle=0; view.node.setScale(1,1,1);
    const placement = this.session.placements.find(p => p.pieceId === piece.id);
    const rotation = this.session.rotationFor(piece.id);
    const size = placement ? this.cell : this.trayCell;
    const box = dimensions(piece,rotation);
    const slot = this.slots.find(s => s.piece.id === piece.id)!.rect;
    const rect = placement ? {x:this.board.x+placement.x*size,y:this.board.y+placement.y*size,w:box.w*size,h:box.h*size} :
      {x:slot.x+(slot.w-box.w*size)/2,y:slot.y+(slot.h-box.h*size)/2,w:box.w*size,h:box.h*size};
    view.rect=rect; view.rotation=rotation; view.size=size;
    this.drawPiece(piece,rotation,size,false);
    this.position(view,rect.x+rect.w/2,rect.y+rect.h/2);
  }
  private position(view: PieceView,x: number,y: number): void { view.node.setPosition(x-375,this.height/2-y); }
  private drawPiece(piece: PieceDef,rotation: Rotation,size: number,held: boolean,failed = false): void {
    const view = this.pieces.get(piece.id)!;
    const g=view.graphics; g.clear();
    const box=dimensions(piece,rotation), w=box.w*size,h=box.h*size;
    view.node.getComponent(UITransform)!.setContentSize(w,h);
    for (const [x,y] of rotate(SHAPES[piece.shape],rotation)) {
      if (held) fill(g,shadow,x*size-w/2+8,h/2-(y+1)*size-9,size-3,size-3,5);
      fill(g,failed ? red : this.selected?.id === piece.id ? gold : ink,x*size-w/2+1,h/2-(y+1)*size+1,size-2,size-2,5);
      fill(g,colors[piece.id%colors.length],x*size-w/2+4,h/2-(y+1)*size+4,size-8,size-8,4);
    }
    view.title.fontSize=Math.max(12,Math.min(22,size*.6)); view.title.color=cream;
    view.title.node.setPosition(0,0);
  }

  private point(event: EventTouch): Point {
    const p=event.getUILocation();
    this.touchWorld.set(p.x,p.y,0);
    const local=this.node.getComponent(UITransform)!.convertToNodeSpaceAR(this.touchWorld,this.touchLocal);
    this.touchPoint.x=local.x+375; this.touchPoint.y=this.height/2-local.y;
    return this.touchPoint;
  }
  private start(event: EventTouch): void {
    const p=this.point(event);
    if (this.landscape) return;
    if (this.modal) {
      if (inRect(p,this.confirmRect())) {
        this.modal=undefined; this.session.restart(); this.selected=undefined; this.cleared=false; this.sync(); this.updateOverlay();
      } else if (this.modal === 'restart' && p.y > this.confirmRect().y+130) { this.modal=undefined; this.updateOverlay(); }
      return;
    }
    if (this.cleared || this.session.expired) return;
    const button=this.buttons.find(b => inRect(p,b.rect));
    if (button) { if (!this.drag.active || (button.duringDrag && this.drag.active.mode === 'drag')) button.action(); return; }
    if (this.drag.active) return;
    // The entire grid bounding region includes the gaps between occupied cells.
    const piece=this.level.pieces.slice().reverse().find(piece => inRect(p,this.pieces.get(piece.id)!.rect));
    if (piece && this.selected && piece.id !== this.selected.id) {
      const old=this.selected; this.selected=undefined; this.renderPiece(old); this.updateControls();
    }
    this.drag.begin({id:event.getID() ?? 0,start:p,time:this.now(),piece,fromTray:inRect(p,this.tray),
      rotation:piece ? this.session.rotationFor(piece.id) : 0,offset:{x:0,y:0}});
  }
  private move(event: EventTouch): void {
    const previous=this.drag.active?.mode;
    const gesture=this.drag.move(event.getID() ?? 0,this.point(event));
    if (!gesture || gesture.mode !== 'drag' || !gesture.piece) return;
    if (previous !== 'drag') {
      this.selected=gesture.piece;
      const v=this.pieces.get(gesture.piece.id)!; Tween.stopAllByTarget(v.node);
      v.node.angle=0; v.node.setSiblingIndex(this.controls.node.getSiblingIndex()-1);
      this.drawPiece(gesture.piece,gesture.rotation,this.cell,true); v.node.setScale(1.05,1.05,1);
      this.updateControls();
    }
    this.updateHeld(gesture);
  }
  private updateHeld(g: Readonly<Gesture>): void {
    if (!g.piece) return;
    const box=dimensions(g.piece,g.rotation);
    const lift=Math.max(1.2*this.cell,120);
    g.offset.x=box.w*this.cell/2; g.offset.y=box.h*this.cell/2+lift;
    this.position(this.pieces.get(g.piece.id)!,g.current.x,g.current.y-lift);
    const x=Math.round((g.current.x-g.offset.x-this.board.x)/this.cell);
    const y=Math.round((g.current.y-g.offset.y-this.board.y)/this.cell);
    if (x === this.previewX && y === this.previewY && g.rotation === this.previewRotation) return;
    this.previewX=x; this.previewY=y; this.previewRotation=g.rotation;
    this.preview.clear(); this.previewPlacement=undefined;
    const placement=this.candidate;
    placement.x=x; placement.y=y; placement.rotation=g.rotation; placement.pieceId=g.piece.id;
    if (!previewVisible(g.piece,placement,this.level.width,this.level.height)) return;
    this.previewPlacement=placement;
    const color=this.session.canDrop(placement) ? green : invalid;
    const cells=pieceCells(g.piece,g.rotation);
    for (let i=0;i<cells.length;i++) {
      fill(this.preview,color,this.board.x+(x+cells[i][0])*this.cell-375,
        this.height/2-this.board.y-(y+cells[i][1]+1)*this.cell,this.cell,this.cell,6);
    }
  }
  private clearPreview(): void { this.preview.clear(); this.previewX=NaN; this.previewPlacement=undefined; }

  private rotateSelected(): void {
    if (!this.selected || this.session.expired || this.cleared) return;
    const piece=this.selected, v=this.pieces.get(piece.id)!;
    if (this.drag.rotateHeld()) {
      Tween.stopAllByTarget(v.node); v.node.angle=0;
      this.drawPiece(piece,this.drag.active!.rotation,this.cell,true);
      this.previewX=NaN; this.updateHeld(this.drag.active!);
      tween(v.node).set({angle:90}).to(.12,{angle:0}).start();
    } else if (this.session.rotatePiece(piece.id)) {
      this.renderPiece(piece); tween(v.node).set({angle:90}).to(.12,{angle:0}).start();
    } else {
      this.drawPiece(piece,v.rotation,v.size,false,true);
      tween(v.node).by(.05,{position:new Vec3(-8,0,0)}).by(.05,{position:new Vec3(16,0,0)})
        .by(.05,{position:new Vec3(-16,0,0)}).by(.05,{position:new Vec3(8,0,0)}).call(() => this.renderPiece(piece)).start();
    }
  }
  private end(event: EventTouch): void {
    const released=this.drag.release(event.getID() ?? 0,this.point(event),this.now());
    if (!released) return;
    const {gesture:g,tap}=released;
    if (this.session.expired) { this.cancelDrag(); this.sync(); return; }
    if (tap) {
      this.selected = this.selected?.id === g.piece?.id ? undefined : g.piece;
      this.sync(); return;
    }
    if (g.mode !== 'drag' || !g.piece) return;
    // release() also handles quick gestures without an intermediate move event.
    const v=this.pieces.get(g.piece.id)!;
    this.selected=g.piece; this.drawPiece(g.piece,g.rotation,this.cell,true); v.node.setScale(1.05,1.05,1);
    this.updateHeld(g);
    let accepted=false;
    if (inRect(g.current,this.tray)) {
      if (!g.fromTray) { this.session.returnToTray(g.piece.id,g.rotation); accepted=true; }
    } else if (this.previewPlacement) accepted=this.session.drop(this.previewPlacement);
    const from=v.node.position.clone();
    this.renderPiece(g.piece);
    const destination=v.node.position.clone();
    if (!accepted) {
      v.node.setPosition(from);
      const returnScale=this.cell/v.size*1.05;
      v.node.setScale(returnScale,returnScale,1);
      tween(v.node).to(.18,{position:destination,scale:new Vec3(1,1,1)},{easing:'quadOut'}).start();
    }
    this.clearPreview(); this.updateControls();
    if (this.session.solved && !this.cleared) { this.cleared=true; this.onClear(); }
  }
  private cancelDrag(): void { if (this.drag.cancel()) this.sync(); }
  private cancel(event: EventTouch): void { if (this.drag.cancel(event.getID() ?? 0)) this.sync(); }
}
