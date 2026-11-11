import {
  Color, EventTouch, Game, Graphics, Label, Node, Sprite, SpriteFrame, UITransform, Vec3,
  game, sys, tween, view,
} from 'cc';
import { STACK_SEEDS, generateStackLevel } from '../core/stack/stack-generator';
import { isBlocked, PACK_SIZE, SLOT_CAPACITY, StackGame, topCardAt } from '../core/stack/stack-rules';
import type { StackCard, StackLevel, StackTapResult } from '../core/stack/stack-types';
import { createRng } from '../core/rng';
import { FinishPlayback, type FinishAction } from '../game/FinishTimeline';
import type { Rect } from '../game/InteractionGeometry';
import { loadArt } from '../services/OptionalResources';
import { SoundEffects } from '../services/SoundEffects';
import { FinishView } from '../ui/FinishView';
import { fill, label, uiNode } from '../ui/UIKit';
import { drawCarRear, vehicleLook } from '../ui/StageArt';

const ink = new Color(74,44,26);
const red = new Color(184,27,43);
const brightRed = new Color(218,52,43);
const cream = new Color(255,246,229);
const gold = new Color(246,195,67);
const paleGold = new Color(255,219,145);
const deep = new Color(61,24,32);
const shadow = new Color(27,14,18,95);
const blockedShade = new Color(30,22,28,154);
const dimText = new Color(91,74,62);
const gray = new Color(126,117,109);

interface CardView {
  readonly node: Node;
  readonly art: Graphics;
  readonly sprite: Sprite;
  readonly fallback: Label;
  readonly dim: Graphics;
  size: number;
  kind: string;
  cardId: number;
  born: boolean;
}

interface ActionButton {
  readonly key: 'moveOut' | 'undo' | 'shuffle';
  readonly title: string;
  readonly rect: Rect;
  readonly label: Label;
}

interface FailButton {
  readonly action: 'revive' | 'restart';
  readonly title: string;
  readonly rect: Rect;
  readonly label: Label;
}

interface StackDebugCard {
  readonly id: number;
  readonly kind: string;
  readonly name: string;
  readonly screenX: number;
  readonly screenY: number;
}

export type StackPageAction = 'next' | 'replay' | 'first';

/** Code-built match-three page. All rules live in core/stack; this file only paints and animates. */
export class StackPage {
  readonly node: Node;
  private readonly level: StackLevel;
  private game: StackGame;
  private readonly sounds: SoundEffects;
  private readonly bgImage: Sprite;
  private readonly background: Graphics;
  private readonly hud: Node;
  private readonly stageLabel: Label;
  private readonly remainingLabel: Label;
  private readonly pileLayer: Node;
  private readonly slotLayer: Node;
  private readonly fxLayer: Node;
  private readonly buttonsLayer: Node;
  private readonly buttonsArt: Graphics;
  private readonly cardViews = new Map<number, CardView>();
  private readonly itemFrames = new Map<string,SpriteFrame | undefined>();
  private slotViews: CardView[] = [];
  private readonly slotRects: Rect[] = Array.from({length: SLOT_CAPACITY},() => ({x:0,y:0,w:0,h:0}));
  private readonly actions: ActionButton[] = [];
  private readonly failButtons: FailButton[] = [];
  private readonly touchWorld = new Vec3();
  private readonly touchLocal = new Vec3();
  private readonly touchPoint = {x:0,y:0};
  private readonly onHide = () => { this.busy = false; };
  private readonly momLayer: Node;
  private readonly momAvatar: Node;
  private readonly momBubble: Label;
  private momHideTimer?: ReturnType<typeof setTimeout>;
  private failLayer?: Node;
  private finish?: FinishPlayback;
  private finishView?: FinishView;
  private finishStarted = 0;
  private modal: 'fail' | undefined;
  private busy = false;
  private width = 750;
  private height = 1334;
  private layoutWidth = -1;
  private layoutHeight = -1;
  private trunk: Rect = {x:44,y:742,w:662,h:372};
  private slotY = 816;
  private slotCell = 78;
  private actionY = 1228;
  private readonly actionH = 76;
  private readonly slotTitle: Label;
  private readonly reserveTitle: Label;
  private readonly debugHook: object;

  constructor(
    parent: Node,
    stage: 1 | 2,
    private readonly onAction: (action: StackPageAction) => void,
  ) {
    this.level = generateStackLevel(stage, STACK_SEEDS[stage - 1]).level;
    this.game = new StackGame(this.level, createRng(`${this.level.seed}:runtime`), Date.now());
    this.node = uiNode('StackPage',parent,750,1334);
    this.sounds = new SoundEffects(parent);
    this.bgImage = uiNode('StackNight',this.node,750,1334).addComponent(Sprite);
    this.bgImage.sizeMode = Sprite.SizeMode.CUSTOM;
    this.bgImage.trim = false;
    this.bgImage.enabled = false;
    void loadArt('ui/bg_night').then(frame => {
      if (!frame || !this.node.isValid) return;
      this.bgImage.spriteFrame = frame;
      this.bgImage.enabled = true;
      this.layoutBackground();
    });
    this.background = uiNode('StackChrome',this.node,750,1334).addComponent(Graphics);
    this.hud = uiNode('StackHud',this.node,750,1334);
    this.stageLabel = label(this.hud,'Stage','第 1 关',29,0,0);
    this.stageLabel.color = paleGold;
    this.remainingLabel = label(this.hud,'Remaining','剩余 18 件',24,0,0);
    this.remainingLabel.color = paleGold;
    label(this.hud,'ModeTitle','年货三消',38,0,0).color = gold;
    const subtitle = label(this.hud,'Subtitle','点没被压住的年货 · 三件装一箱',19,0,0);
    subtitle.color = cream;
    this.pileLayer = uiNode('CargoPile',this.node,750,1334);
    this.slotLayer = uiNode('TrunkSlots',this.node,750,1334);
    this.fxLayer = uiNode('Effects',this.node,750,1334);
    this.slotTitle = label(this.node,'SlotTitle','打开的后备箱 · 7 格',20,0,0);
    this.slotTitle.color = paleGold;
    this.reserveTitle = label(this.node,'ReserveTitle','临时暂存区',16,0,0);
    this.reserveTitle.color = new Color(255,224,175,190);

    this.buttonsLayer = uiNode('StackActions',this.node,750,1334);
    this.buttonsArt = this.buttonsLayer.addComponent(Graphics);
    this.actions.push(
      this.makeAction('moveOut','移出'),
      this.makeAction('undo','撤回'),
      this.makeAction('shuffle','洗牌'),
    );
    this.momLayer = uiNode('MomToast',this.node,750,1334);
    this.momLayer.active = false;
    const bubble = uiNode('MomBubble',this.momLayer,430,96);
    const bubbleArt = bubble.addComponent(Graphics);
    fill(bubbleArt,cream,-215,-48,430,96,24);
    fill(bubbleArt,paleGold,-207,-40,414,80,18);
    this.momBubble = label(bubble,'MomText','妈妈又塞了一件！',27,0,0);
    this.momBubble.color = red;
    this.momAvatar = uiNode('MomAvatar',this.momLayer,122,122);
    const momFallback = this.momAvatar.addComponent(Graphics);
    fill(momFallback,red,-55,-55,110,110,55);
    label(this.momAvatar,'MomFallback','妈',46,0,0).color = cream;
    const momSprite = uiNode('MomImage',this.momAvatar,116,116).addComponent(Sprite);
    momSprite.sizeMode = Sprite.SizeMode.CUSTOM; momSprite.trim = false; momSprite.enabled = false;
    void loadArt('ui/mom').then(frame => {
      if (!frame || !this.node.isValid) return;
      momSprite.spriteFrame = frame; momSprite.enabled = true;
      momFallback.enabled = false;
      this.momAvatar.getChildByName('MomFallback')!.active = false;
    });

    this.node.on(Node.EventType.TOUCH_END,this.touch,this);
    game.on(Game.EVENT_HIDE,this.onHide);
    this.debugHook = {
      getState: () => this.debugState(),
      getClickable: () => this.debugClickable(),
    };
    if (typeof window !== 'undefined') {
      (window as Window & {__stack?: object}).__stack = Object.freeze(this.debugHook);
    }
    this.node.once(Node.EventType.NODE_DESTROYED,() => {
      game.off(Game.EVENT_HIDE,this.onHide);
      if (this.momHideTimer) clearTimeout(this.momHideTimer);
      if (typeof window !== 'undefined' && (window as Window & {__stack?: object}).__stack === this.debugHook) {
        delete (window as Window & {__stack?: object}).__stack;
      }
    });
    this.tick();
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'fail') {
      this.prefillFailure();
      this.refresh();
      if (this.game.status === 'lost') this.openFail();
    }
  }

  tick(): void {
    const size = view.getVisibleSize();
    if (size.width !== this.layoutWidth || size.height !== this.layoutHeight) {
      this.layoutWidth = size.width; this.layoutHeight = size.height;
      this.height = Math.max(1334,size.height/size.width*750);
      const scale = Math.min(size.width/750,size.height/this.height);
      this.node.setScale(scale,scale,1);
      this.node.getComponent(UITransform)!.setContentSize(750,this.height);
      const safe = sys.getSafeAreaRect(false);
      const bottom = Math.max(0,safe.y/size.height*this.height);
      this.layout(bottom);
    }
    if (this.finish) {
      this.finishView!.render(this.finish.advance(Date.now()-this.finishStarted));
      return;
    }
    if (!this.busy && !this.modal && this.game.status === 'playing') {
      const added = this.game.tickMom(Date.now());
      if (added.length) this.onMomAdded(added);
    }
  }

  private layout(bottom: number): void {
    this.node.getComponent(UITransform)!.setContentSize(750,this.height);
    this.actionY = this.height - bottom - 32 - this.actionH;
    const carTop = Math.max(650,this.height-908);
    const car = {x:12,y:carTop,w:726,h:Math.min(700,this.actionY-26-carTop)};
    this.trunk = {x:44,y:carTop+82,w:662,h:Math.min(470,car.h-170)};
    this.slotCell = Math.floor(Math.min(78,(this.trunk.w-44)/SLOT_CAPACITY-6));
    const gap = 7;
    const slotWidth = SLOT_CAPACITY*this.slotCell + (SLOT_CAPACITY-1)*gap;
    const slotX = Math.round((750-slotWidth)/2);
    this.slotY = this.trunk.y + 72;
    for (let i=0;i<SLOT_CAPACITY;i++) {
      this.slotRects[i].x = slotX + i*(this.slotCell+gap);
      this.slotRects[i].y = this.slotY;
      this.slotRects[i].w = this.slotCell;
      this.slotRects[i].h = this.slotCell;
    }
    this.stageLabel.node.setPosition(-242,this.height/2-61);
    this.remainingLabel.node.setPosition(226,this.height/2-61);
    this.hud.getChildByName('ModeTitle')!.setPosition(0,this.height/2-61);
    this.hud.getChildByName('Subtitle')!.setPosition(0,this.height/2-105);
    this.slotTitle.node.setPosition(0,this.height/2-(this.trunk.y+37));
    this.reserveTitle.node.setPosition(-260,this.height/2-478);
    this.momLayer.getChildByName('MomBubble')!.setPosition(-58,this.height/2-185);
    this.momAvatar.setPosition(285,this.height/2-185);
    for (let i=0;i<this.actions.length;i++) {
      const rect = this.actions[i].rect;
      rect.x = 44 + i*222; rect.y = this.actionY; rect.w = 210; rect.h = this.actionH;
      this.actions[i].label.node.setPosition(rect.x+rect.w/2-375,this.height/2-(rect.y+rect.h/2));
    }
    this.layoutBackground();
    this.drawCarSlots(car);
    this.drawActions();
    this.drawFailButtons();
    this.refresh();
    this.finishView?.layout(this.height,this.finishBoard());
  }

  private layoutBackground(): void {
    const scale = Math.max(1,this.height/1334);
    this.bgImage.node.getComponent(UITransform)!.setContentSize(750*scale,1334*scale);
    this.bgImage.node.setPosition(0,0);
  }

  private rect(g: Graphics,color: Color,x: number,y: number,w: number,h: number,r = 0): void {
    fill(g,color,x-375,this.height/2-y-h,w,h,r);
  }

  private stroke(g: Graphics,color: Color,lineWidth: number,x: number,y: number,w: number,h: number,r = 0): void {
    g.strokeColor = color; g.lineWidth = lineWidth;
    g.roundRect(x-375,this.height/2-y-h,w,h,r); g.stroke();
  }

  private drawCarSlots(car: Rect): void {
    const g = this.background;
    g.clear();
    this.rect(g,new Color(17,10,20,45),0,0,750,this.height);
    // Festival header.
    this.rect(g,new Color(45,19,29,232),32,14,686,118,26);
    this.rect(g,gold,38,20,674,106,22);
    this.rect(g,new Color(144,31,39),46,28,658,90,18);
    this.rect(g,new Color(205,51,45),55,36,640,72,13);
    this.rect(g,new Color(255,222,161,150),95,110,560,2,1);
    this.rect(g,new Color(255,224,165),302,25,146,4,2);
    // Soft cargo-table wash under the pile.
    this.rect(g,new Color(24,16,27,58),38,128,674,348,30);
    this.stroke(g,new Color(246,195,67,70),2,42,132,666,340,27);
    this.rect(g,new Color(246,195,67,80),70,463,610,2,1);
    // Temporary reserve shelf is deliberately outside the card pile.
    this.rect(g,new Color(46,27,32,150),66,482,618,102,20);
    this.stroke(g,new Color(246,195,67,75),2,68,484,614,98,18);

    drawCarRear(g,750,this.height,0,car,this.trunk,vehicleLook('sedan_v1'));
    const slotWidth = (this.slotRects[SLOT_CAPACITY-1].x+this.slotRects[SLOT_CAPACITY-1].w)-this.slotRects[0].x;
    const shelfX = this.slotRects[0].x-14;
    const shelfY = this.slotY-22;
    this.rect(g,new Color(19,17,19,230),shelfX,shelfY,slotWidth+28,this.slotCell+44,18);
    this.stroke(g,gold,3,shelfX,shelfY,slotWidth+28,this.slotCell+44,18);
    for (const slot of this.slotRects) {
      this.rect(g,new Color(51,38,37),slot.x,slot.y,slot.w,slot.h,12);
      this.rect(g,new Color(29,25,27),slot.x+5,slot.y+5,slot.w-10,slot.h-10,9);
      this.stroke(g,new Color(255,213,132,145),2,slot.x+2,slot.y+2,slot.w-4,slot.h-4,10);
      this.rect(g,new Color(246,195,67,90),slot.x+slot.w*.3,slot.y+slot.h-13,slot.w*.4,3,2);
    }
    this.rect(g,new Color(255,196,81,160),this.slotRects[0].x+22,this.slotY+this.slotCell+18,slotWidth-44,2,1);
  }

  private makeAction(key: ActionButton['key'],title: string): ActionButton {
    const text = label(this.buttonsLayer,`Action-${key}`,title,25,0,0);
    text.color = cream;
    return {key,title,rect:{x:0,y:0,w:0,h:0},label:text};
  }

  private drawActions(): void {
    const g = this.buttonsArt;
    g.clear();
    for (const action of this.actions) {
      const used = this.game.props[action.key];
      this.rect(g,used ? new Color(69,61,63,220) : new Color(86,28,37,238),action.rect.x,action.rect.y,action.rect.w,action.rect.h,20);
      this.stroke(g,used ? gray : gold,2,action.rect.x+2,action.rect.y+2,action.rect.w-4,action.rect.h-4,18);
      this.rect(g,used ? new Color(109,99,101) : new Color(255,213,132,90),action.rect.x+17,action.rect.y+action.rect.h-15,action.rect.w-34,3,2);
      action.label.string = used ? `${action.title} · 已用` : `${action.title} · 1 次`;
      action.label.color = used ? new Color(185,177,169) : paleGold;
    }
  }

  private refresh(): void {
    this.updateHud();
    this.syncPile();
    this.renderSlot(this.game.slot);
    this.drawActions();
  }

  private updateHud(): void {
    this.stageLabel.string = `第 ${this.level.stage} 关`;
    this.remainingLabel.string = `剩余 ${this.game.remaining} 件`;
  }

  private syncPile(): void {
    const active = new Map(this.game.cards.map(card => [card.id,card]));
    for (const [id,view] of this.cardViews) {
      if (!active.has(id)) view.node.active = false;
    }
    const sorted = [...this.game.cards].sort((a,b) => a.layer-b.layer || a.id-b.id);
    for (let index=0;index<sorted.length;index++) {
      const card = sorted[index];
      let view = this.cardViews.get(card.id);
      if (!view) {
        view = this.makeCardView(card,card.w,this.pileLayer);
        this.cardViews.set(card.id,view);
        view.born = true;
      }
      if (view.kind !== card.kind || view.size !== card.w) this.configureCard(view,card,card.w);
      view.node.active = true;
      view.node.setSiblingIndex(index);
      const center = this.cardCenter(card);
      if (view.born) {
        view.node.setPosition(center.x,center.y+(card.source === 'mom' ? 120 : 0),0);
        if (card.source === 'mom') tween(view.node).to(0.28,{position:center},{easing:'bounceOut'}).start();
        view.born = false;
      } else if (!this.busy || card.source !== 'mom') {
        view.node.setPosition(center);
      }
      this.drawDim(view,isBlocked(card,this.game.cards));
    }
  }

  private renderSlot(cards: readonly StackCard[]): void {
    for (const view of this.slotViews) if (view.node.isValid) view.node.destroy();
    this.slotViews = [];
    for (let index=0;index<cards.length && index<SLOT_CAPACITY;index++) {
      const card = cards[index];
      const rect = this.slotRects[index];
      const size = Math.max(42,rect.w-6);
      const view = this.makeCardView(card,size,this.slotLayer);
      view.node.setPosition(rect.x+rect.w/2-375,this.height/2-(rect.y+rect.h/2));
      this.slotViews.push(view);
    }
  }

  private makeCardView(card: StackCard,size: number,parent: Node): CardView {
    const node = uiNode(`Card-${card.id}`,parent,size,size);
    const art = node.addComponent(Graphics);
    const sprite = uiNode('ItemArt',node,size,size).addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false; sprite.enabled = false;
    const fallback = label(node,'Fallback',card.name,17,0,0);
    fallback.color = ink;
    fallback.overflow = Label.Overflow.SHRINK;
    fallback.node.getComponent(UITransform)!.setContentSize(size*.86,size*.7);
    const dim = uiNode('PressedShade',node,size,size).addComponent(Graphics);
    const view: CardView = {node,art,sprite,fallback,dim,size,kind:'',cardId:card.id,born:false};
    this.configureCard(view,card,size);
    return view;
  }

  private configureCard(view: CardView,card: StackCard,size: number): void {
    view.size = size; view.kind = card.kind; view.cardId = card.id;
    view.node.getComponent(UITransform)!.setContentSize(size,size);
    view.node.name = `Card-${card.id}-${card.kind}`;
    const g = view.art;
    g.clear();
    const radius = Math.max(9,size*.14);
    fill(g,shadow,-size/2+3,-size/2-5,size,size,radius);
    fill(g,cream,-size/2,-size/2,size,size,radius);
    fill(g,new Color(255,235,195),-size/2+5,-size/2+5,size-10,size-10,radius-3);
    g.strokeColor = red; g.lineWidth = Math.max(2,size*.036);
    g.roundRect(-size/2+1,-size/2+1,size-2,size-2,radius); g.stroke();
    g.strokeColor = new Color(246,195,67,210); g.lineWidth = 1.3;
    g.roundRect(-size/2+5,-size/2+5,size-10,size-10,radius-3); g.stroke();
    view.fallback.string = card.name;
    view.fallback.fontSize = Math.max(12,Math.min(18,size*.2));
    view.fallback.lineHeight = view.fallback.fontSize+3;
    view.fallback.node.active = true;
    view.sprite.enabled = false;
    const cached = this.itemFrames.get(card.kind);
    if (cached) this.showItemFrame(view,cached);
    else if (!this.itemFrames.has(card.kind)) {
      this.itemFrames.set(card.kind,undefined);
      void loadArt(`items/${card.kind}`).then(frame => {
        if (!frame || !view.node.isValid) return;
        this.itemFrames.set(card.kind,frame);
        for (const candidate of this.cardViews.values()) if (candidate.kind === card.kind) this.showItemFrame(candidate,frame);
        for (const candidate of this.slotViews) if (candidate.kind === card.kind) this.showItemFrame(candidate,frame);
      });
    }
  }

  private showItemFrame(view: CardView,frame: SpriteFrame): void {
    if (!view.node.isValid) return;
    const max = view.size*.84;
    const ratio = frame.width/frame.height;
    const w = ratio >= 1 ? max : max*ratio;
    const h = ratio >= 1 ? max/ratio : max;
    view.sprite.node.getComponent(UITransform)!.setContentSize(w,h);
    view.sprite.spriteFrame = frame;
    view.sprite.enabled = true;
    view.fallback.node.active = false;
  }

  private drawDim(view: CardView,blocked: boolean): void {
    const g = view.dim;
    g.clear();
    if (!blocked) return;
    fill(g,blockedShade,-view.size/2+2,-view.size/2+2,view.size-4,view.size-4,Math.max(8,view.size*.13));
  }

  private cardCenter(card: StackCard): Vec3 {
    return new Vec3(card.x+card.w/2-375,this.height/2-(card.y+card.h/2),0);
  }

  private touch(event: EventTouch): void {
    const p = this.point(event);
    if (this.finish) { this.finishView?.press(p.x,p.y); return; }
    if (this.modal === 'fail') {
      for (const button of this.failButtons) {
        if (!contains(button.rect,p.x,p.y)) continue;
        if (button.action === 'revive') this.revive();
        else this.onAction('replay');
        return;
      }
      return;
    }
    if (this.busy || this.game.status !== 'playing') return;
    for (const action of this.actions) {
      if (!contains(action.rect,p.x,p.y)) continue;
      this.useAction(action.key);
      return;
    }
    const hit = topCardAt(this.game.cards,p.x,p.y);
    if (!hit) return;
    if (!this.game.canTap(hit.id)) { this.sounds.play('invalid'); return; }
    this.tapCard(hit.id);
  }

  private point(event: EventTouch): {x:number;y:number} {
    const p = event.getUILocation();
    this.touchWorld.set(p.x,p.y,0);
    const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(this.touchWorld,this.touchLocal);
    this.touchPoint.x = local.x+375; this.touchPoint.y = this.height/2-local.y;
    return this.touchPoint;
  }

  private tapCard(id: number): void {
    const result = this.game.tap(id,Date.now());
    if (!result.ok || !result.card) { this.sounds.play('invalid'); return; }
    this.busy = true;
    this.sounds.play('pickup');
    const flyer = this.makeCardView(result.card,result.card.w,this.fxLayer);
    flyer.node.setPosition(this.cardCenter(result.card));
    const targetIndex = Math.min(result.insertIndex,SLOT_CAPACITY-1);
    const slot = this.slotRects[targetIndex];
    const target = new Vec3(slot.x+slot.w/2-375,this.height/2-(slot.y+slot.h/2),0);
    const scale = Math.max(.35,(slot.w-6)/result.card.w);
    this.syncPile();
    this.updateHud();
    tween(flyer.node).to(.2,{position:target,scale:new Vec3(scale,scale,1)},{easing:'quadOut'}).call(() => {
      if (flyer.node.isValid) flyer.node.destroy();
      if (result.packed.length === PACK_SIZE) this.playPack(result);
      else this.finishTap(result);
    }).start();
  }

  private playPack(result: StackTapResult): void {
    this.renderSlot(result.slotBeforePack);
    this.sounds.play('pack');
    const packed = new Set(result.packed.map(card => card.id));
    const views = this.slotViews.filter(view => packed.has(view.cardId));
    const first = views[0];
    if (!first) { this.finishTap(result); return; }
    const center = first.node.position.clone();
    const start = views.map(view => view.node.position.clone());
    setTimeout(() => {
      if (!this.node.isValid) return;
      for (let i=0;i<views.length;i++) {
        const view = views[i];
        tween(view.node).to(.24,{position:center,scale:new Vec3(.58,.58,1),angle:i === 0 ? -8 : i === 2 ? 8 : 0},{easing:'quadIn'}).start();
      }
      setTimeout(() => {
        if (!this.node.isValid) return;
        for (let i=0;i<views.length;i++) views[i].node.setPosition(start[i]);
        this.showPackedBox(center,() => this.finishTap(result));
      },250);
    },80);
  }

  private showPackedBox(at: Vec3,onDone: () => void): void {
    for (const view of this.slotViews) view.node.active = false;
    const box = uiNode('PackedBox',this.fxLayer,132,104);
    box.setPosition(at.x,at.y,20);
    const g = box.addComponent(Graphics);
    fill(g,new Color(33,18,17,80),-62,-48,128,92,10);
    fill(g,new Color(222,177,104),-60,-45,120,88,8);
    fill(g,new Color(247,213,153),-55,-40,110,78,6);
    fill(g,new Color(184,40,40),-55,-8,110,20,3);
    g.strokeColor = new Color(114,56,33); g.lineWidth = 2;
    g.roundRect(-60,-45,120,88,8); g.stroke();
    fill(g,gold,-8,-16,16,38,4);
    const seal = label(box,'Fu','福',42,0,7);
    seal.color = cream;
    box.setScale(.42,.42,1);
    tween(box).to(.18,{scale:new Vec3(1.06,1.06,1)},{easing:'backOut'}).to(.08,{scale:new Vec3(1,1,1)}).start();
    setTimeout(() => {
      if (!box.isValid) { onDone(); return; }
      tween(box).to(.34,{position:new Vec3(at.x,at.y+118,20),scale:new Vec3(.36,.36,1)},{easing:'quadIn'}).call(() => {
        if (box.isValid) box.destroy();
        onDone();
      }).start();
    },360);
  }

  private finishTap(result: StackTapResult): void {
    this.busy = false;
    this.refresh();
    if (result.status === 'lost') this.openFail();
    else if (result.status === 'won') this.beginFinish();
  }

  private useAction(key: ActionButton['key']): void {
    if (key === 'moveOut') {
      const moved = this.game.useMoveOut();
      if (moved.length) this.sounds.play('drop');
    } else if (key === 'undo') {
      if (this.game.useUndo()) this.sounds.play('undo');
    } else if (this.game.useShuffle()) {
      this.sounds.play('drop');
    }
    this.refresh();
  }

  private prefillFailure(): void {
    let guard = 0;
    while (this.game.status === 'playing' && this.game.slot.length < SLOT_CAPACITY && guard++ < 100) {
      const free = this.game.cards.filter(card => this.game.canTap(card.id));
      const target = free.find(card => this.game.slot.filter(item => item.kind === card.kind).length === 0)
        ?? free.find(card => this.game.slot.filter(item => item.kind === card.kind).length === 1);
      if (!target) break;
      this.game.tap(target.id,Date.now());
    }
  }

  private openFail(): void {
    this.modal = 'fail';
    this.failLayer?.destroy();
    this.failLayer = undefined;
    this.failButtons.length = 0;
    const layer = uiNode('TrunkOverflow',this.node,750,this.height);
    this.failLayer = layer;
    const g = layer.addComponent(Graphics);
    fill(g,new Color(20,12,18,176),-375,-this.height/2,750,this.height);
    fill(g,new Color(79,24,30),-310,-214,620,432,30);
    fill(g,new Color(246,195,67),-302,-206,604,416,26);
    fill(g,new Color(176,34,42),-293,-197,586,398,21);
    fill(g,new Color(255,233,192),-266,-162,532,66,18);
    label(layer,'OverflowTitle','后备箱塞爆了',44,0,145).color = red;
    const hint = label(layer,'OverflowHint','7 格全满，还差一件同款年货',22,0,86);
    hint.color = cream;
    const revive = this.failButton(layer,'revive','复活 · 移出 3 件',5);
    const restart = this.failButton(layer,'restart','重来',-103);
    this.failButtons.push(revive,restart);
    this.sounds.play('invalid');
    this.refreshFailButtons();
  }

  private failButton(parent: Node,action: FailButton['action'],title: string,localY: number): FailButton {
    const rect = {x:150,y:this.height/2-localY-38,w:450,h:76};
    const text = label(parent,`Fail-${action}`,title,29,0,localY);
    text.color = action === 'revive' ? ink : paleGold;
    return {action,title,rect,label:text};
  }

  private refreshFailButtons(): void {
    if (!this.failLayer?.isValid) return;
    const g = this.failLayer.getComponent(Graphics)!;
    for (const button of this.failButtons) {
      fill(g,button.action === 'revive' ? gold : deep,button.rect.x-375,this.height/2-button.rect.y-button.rect.h,button.rect.w,button.rect.h,22);
      if (button.action !== 'revive') {
        g.strokeColor = gold; g.lineWidth = 2;
        g.roundRect(button.rect.x-375+2,this.height/2-button.rect.y-button.rect.h+2,button.rect.w-4,button.rect.h-4,20); g.stroke();
      }
    }
  }

  private drawFailButtons(): void {
    if (this.failLayer) this.refreshFailButtons();
  }

  private revive(): void {
    const moved = this.game.revive();
    if (!moved.length) return;
    this.modal = undefined;
    this.failLayer?.destroy();
    this.failLayer = undefined;
    this.failButtons.length = 0;
    this.sounds.play('drop');
    this.refresh();
  }

  private beginFinish(): void {
    if (this.finish) return;
    this.busy = true;
    this.sounds.play('cheer');
    this.finishStarted = Date.now();
    this.finish = new FinishPlayback(cue => {
      this.sounds.play(cue.sound);
      if (cue.vibration && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(cue.vibration); } catch { /* Optional vibration: silent. */ }
      }
    });
    const choices = this.level.stage === 1
      ? [{title:'下一关',action:'next' as const},{title:'再来一次',action:'replay' as const}]
      : [{title:'再来一次',action:'replay' as const},{title:'回第 1 关',action:'first' as const}];
    this.finishView = new FinishView(this.node,this.level.stage,action => this.mapFinish(action),choices);
    this.finishView.layout(this.height,this.finishBoard());
    this.finishView.render(this.finish.state);
  }

  private mapFinish(action: FinishAction): void {
    if (action === 'next') this.onAction('next');
    else if (action === 'first') this.onAction('first');
    else this.onAction('replay');
  }

  private finishBoard(): Rect {
    const first = this.slotRects[0];
    const last = this.slotRects[SLOT_CAPACITY-1];
    return {x:first.x-12,y:first.y-13,w:last.x+last.w-first.x+24,h:first.h+26};
  }

  private onMomAdded(added: readonly StackCard[]): void {
    if (!added.length) return;
    this.sounds.play('mom');
    this.refresh();
    this.momLayer.active = true;
    this.momBubble.string = '妈妈又塞了一件！';
    if (this.momHideTimer) clearTimeout(this.momHideTimer);
    this.momHideTimer = setTimeout(() => { if (this.node.isValid) this.momLayer.active = false; },2300);
  }

  private debugClickable(): StackDebugCard[] {
    const size = view.getVisibleSize();
    const screenWidth = typeof window === 'undefined' ? size.width : window.innerWidth;
    const screenHeight = typeof window === 'undefined' ? size.height : window.innerHeight;
    return this.game.cards
      .filter(card => this.game.canTap(card.id))
      .sort((a,b) => b.layer-a.layer)
      .map(card => ({
        id:card.id,
        kind:card.kind,
        name:card.name,
        screenX:(card.x+card.w/2)/size.width*screenWidth,
        screenY:(card.y+card.h/2)/this.height*screenHeight,
      }));
  }

  private debugState(): object {
    return {
      stage:this.level.stage,
      status:this.game.status,
      remaining:this.game.remaining,
      modal:this.modal ?? null,
      slot:this.game.slot.map(card => ({id:card.id,kind:card.kind,name:card.name})),
      props:this.game.props,
      clickable:this.debugClickable(),
    };
  }
}

function contains(rect: Rect,x: number,y: number): boolean {
  return x >= rect.x && x <= rect.x+rect.w && y >= rect.y && y <= rect.y+rect.h;
}
