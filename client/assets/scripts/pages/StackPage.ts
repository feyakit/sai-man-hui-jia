import {
  Color, EventTouch, Game, Graphics, Label, Node, Rect as SpriteRect, Size, Sprite, SpriteFrame,
  Tween, UIOpacity, UITransform, Vec2, Vec3, game, sys, tween, view,
} from 'cc';
import {
  ROAD_FINAL_STAGE, browserStorage, levelForRoute, markDailyDone, markHomeDone, nextRouteTitle, recordLevelReached, routeHeadline,
  vehicleLevelForRoute,
  type StackRoute,
} from '../core/stack/stack-progress';
import {
  STACK_ACTION_HEIGHT, STACK_BODY_HOLE, STACK_BODY_SIZE, STACK_BODY_SLICE, STACK_CAR_SCALE_Y,
  IDENTITY_BOARD, createStackPageLayout, fitStackBoard, mapStackRect, stackCardBounds, stackContentBounds,
  stackPageHeight, unmapStackPoint, type StackBoardFit,
} from '../core/stack/stack-layout';
import { isBlocked, PACK_SIZE, SLOT_CAPACITY, StackGame, topCardAt } from '../core/stack/stack-rules';
import type { StackCard, StackLevel, StackTapResult } from '../core/stack/stack-types';
import {
  sedanScaleForPage, sedanSlotCells, vehicleArtRect, vehicleScaleForPage, vehicleByKey, vehicleForLevel, vehicleRegionRects, vehicleSlotCells, vehicleSlotLabel,
  type LevelVehicle, type Rgb,
} from '../core/stack/stack-vehicles';
import { createRng } from '../core/rng';
import {
  formatContributionFailure,
  formatContributionResult,
  formatRankProgress,
  isDebugRun,
  RANK_DEBUG_TEXT,
  type Province,
} from '../core/rank/rank';
import { FINISH_DURATION, FinishPlayback, type FinishAction } from '../game/FinishTimeline';
import type { Rect } from '../game/InteractionGeometry';
import { loadArt } from '../services/OptionalResources';
import { RankApi } from '../services/RankApi';
import { StackSound } from '../services/StackSound';
import { showStackShareImage } from '../services/StackShareImage';
import { ProvincePicker } from '../ui/ProvincePicker';
import { fill, label, uiNode } from '../ui/UIKit';
import { StackFinishView, type StackFinishStats } from '../ui/StackFinishView';
import { StackHomecomingView } from '../ui/StackHomecomingView';
import { RankPage } from './RankPage';

/** Packs closer together than this count as a combo. */
const STACK_COMBO_WINDOW_MS = 3_000;
const ink = new Color(74,44,26);
const red = new Color(184,27,43);
const brightRed = new Color(218,52,43);
const cream = new Color(255,246,229);
const gold = new Color(246,195,67);
const paleGold = new Color(255,219,145);
const shadow = new Color(27,14,18,95);
const blockedShade = new Color(30,22,28,102);
const dimText = new Color(91,74,62);
const gray = new Color(126,117,109);
const ITEM_CROPS: Readonly<Record<string,{x:number;y:number;w:number;h:number}>> = {
  mandarin:{x:6,y:6,w:244,h:244},
  duck:{x:6,y:6,w:372,h:244},
  fruitbasket:{x:6,y:6,w:372,h:244},
  fish:{x:6,y:6,w:372,h:244},
  kumquat:{x:6,y:6,w:370,h:372},
  milk:{x:6,y:6,w:244,h:244},
  oven:{x:6,y:20,w:244,h:345},
  suitcase_l:{x:6,y:6,w:244,h:372},
  woven:{x:6,y:6,w:244,h:372},
  toycar:{x:6,y:6,w:244,h:244},
  snacks:{x:6,y:6,w:244,h:372},
  ham:{x:6,y:6,w:244,h:500},
  thermos:{x:6,y:6,w:244,h:372},
  firecracker:{x:6,y:6,w:372,h:116},
  ricecooker:{x:6,y:6,w:244,h:244},
};

interface CardView {
  readonly node: Node;
  readonly art: Graphics;
  readonly sprite: Sprite;
  readonly fallback: Label;
  readonly dim: Graphics;
  /** Carton back shown on covered cards from level 4 on. */
  readonly back: Graphics;
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
  readonly action: 'revive' | 'restart' | 'share';
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
  readonly screenLeft: number;
  readonly screenRight: number;
  readonly screenTop: number;
  readonly screenBottom: number;
  readonly screenW: number;
  readonly screenH: number;
}

export type StackPageAction = 'next' | 'replay' | 'first' | 'home';

/** Code-built match-three page. All rules live in core/stack; this file only paints and animates. */
export class StackPage {
  readonly node: Node;
  private readonly level: StackLevel;
  private game: StackGame;
  private readonly sounds: StackSound;
  private readonly bgImage: Sprite;
  private readonly background: Graphics;
  private readonly carLayer: Node;
  private readonly carDetail: Graphics;
  private readonly trunkImage: Sprite;
  private readonly bodyImage: Sprite;
  private readonly lidImage: Sprite;
  private readonly carFrames: {body?: SpriteFrame; trunk?: SpriteFrame; lid?: SpriteFrame} = {};
  private carRect: Rect = {x:30,y:940,w:690,h:420};
  private carScaleY = STACK_CAR_SCALE_Y;
  /** Uniform sedan shrink on short pages (1 elsewhere and for sprite rides). */
  private carScale = 1;
  private readonly hud: Node;
  private readonly stageLabel: Label;
  private readonly remainingLabel: Label;
  private readonly soundButton: Node;
  private readonly soundButtonArt: Graphics;
  private readonly soundButtonLabel: Label;
  private soundRect: Rect = {x:655,y:150,w:86,h:40};
  private musicRect: Rect = {x:655,y:196,w:86,h:40};
  private readonly musicButton: Node;
  private readonly musicButtonArt: Graphics;
  private readonly musicButtonLabel: Label;
  private comboCount = 0;
  private lastPackAt = 0;
  private warnLayer!: Node;
  private warnArt!: Graphics;
  private warnActive = false;
  private readonly pileLayer: Node;
  private readonly slotLayer: Node;
  private readonly fxLayer: Node;
  private readonly buttonsLayer: Node;
  private readonly buttonsArt: Graphics;
  private readonly reserveLayer: Node;
  private readonly reserveShelf: Graphics;
  private readonly cardViews = new Map<number, CardView>();
  private readonly itemFrames = new Map<string,SpriteFrame | undefined>();
  private slotViews: CardView[] = [];
  private readonly slotViewMap = new Map<number,CardView>();
  /** Card ids currently being packed; their nodes are the only ones allowed to vanish. */
  private packingIds = new Set<number>();
  private slotRects: Rect[] = [];
  /** The ride for this level; it owns the whole bottom of the page (art, containers, label, buttons). */
  private readonly vehicle: LevelVehicle;
  private readonly capacity: number;
  private readonly vehicleImage: Sprite;
  private vehicleFrame?: SpriteFrame;
  private artRect: Rect = {x:0,y:0,w:0,h:0};
  private introShown = false;
  /** Province rank returned by the last stage-2 clear, for the share card. */
  private lastProvinceRank: number | null = null;
  private readonly actions: ActionButton[] = [];
  private readonly failButtons: FailButton[] = [];
  private readonly touchWorld = new Vec3();
  private readonly touchLocal = new Vec3();
  private readonly touchPoint = {x:0,y:0};
  private readonly onHide = () => { this.busy = false; this.sounds.pause(); };
  private readonly onShow = () => this.sounds.resume();
  private readonly momLayer: Node;
  private readonly momAvatar: Node;
  private readonly momBubble: Label;
  private momHideTimer?: ReturnType<typeof setTimeout>;
  private failLayer?: Node;
  private provincePicker?: ProvincePicker;
  private rankPage?: RankPage;
  private readonly rankApi = new RankApi();
  private finish?: FinishPlayback;
  private finishView?: StackFinishView | StackHomecomingView;
  private finishStarted = 0;
  private readonly startedAt = Date.now();
  private modal: 'fail' | undefined;
  private debugMomPending = false;
  private busy = false;
  private width = 750;
  private height = 1334;
  private layoutWidth = -1;
  private layoutHeight = -1;
  private trunk: Rect = {x:16,y:1174,w:718,h:116};
  private slotY = 1185;
  private slotCell = 96;
  private safeBottom = 0;
  /** Level → page mapping that keeps the whole board between the title bar and the trunk lid. */
  private board: StackBoardFit = IDENTITY_BOARD;
  private actionY = 1527;
  private readonly actionH = STACK_ACTION_HEIGHT;
  private finishStats?: StackFinishStats;
  private readonly slotTitle: Label;
  private readonly reserveTitle: Label;
  private readonly debugHook: object;

  constructor(
    parent: Node,
    private readonly route: StackRoute,
    private readonly onAction: (action: StackPageAction) => void,
  ) {
    this.level = levelForRoute(route);
    if (route !== 'daily') recordLevelReached(browserStorage(),route);
    this.capacity = (this.level as StackLevel & {slotCapacity?: number}).slotCapacity ?? SLOT_CAPACITY;
    const forcedVehicle = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('vehicle');
    const levelVehicle = vehicleForLevel(vehicleLevelForRoute(route));
    const forcedDef = forcedVehicle ? vehicleByKey(forcedVehicle) : undefined;
    this.vehicle = forcedDef ? {def:forcedDef,displayName:forcedDef.name} : levelVehicle;
    this.game = new StackGame(this.level, createRng(`${this.level.seed}:runtime`), Date.now());
    this.node = uiNode('StackPage',parent,750,1334);
    this.sounds = new StackSound();
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
    this.carLayer = uiNode('SedanRear',this.node,750,1334);
    this.trunkImage = this.makeImageNode('TrunkWell',this.carLayer);
    this.bodyImage = this.makeImageNode('CarBody',this.carLayer);
    this.lidImage = this.makeImageNode('TrunkLid',this.carLayer);
    this.vehicleImage = this.makeImageNode('VehicleRear',this.carLayer);
    this.carDetail = uiNode('TrunkDetails',this.carLayer,750,1334).addComponent(Graphics);
    if (this.vehicle.def.art) {
      void loadArt(this.vehicle.def.art).then(frame => {
        if (!frame || !this.node.isValid) return;
        this.vehicleFrame = frame;
        this.drawCarSlots(this.carRect);
        if (this.failLayer?.isValid) this.drawOverflowCar(this.failLayer);
      });
    }
    void Promise.all([
      loadArt('vehicles/sedan_v1_body'),
      loadArt('vehicles/sedan_v1_trunk'),
      loadArt('vehicles/sedan_v1_lid'),
    ]).then(([body,trunk,lid]) => {
      if (!this.node.isValid) return;
      this.carFrames.body = body; this.carFrames.trunk = trunk; this.carFrames.lid = lid;
      this.drawCarSlots(this.carRect);
      if (this.failLayer?.isValid) this.drawOverflowCar(this.failLayer);
    });
    this.hud = uiNode('StackHud',this.node,750,1334);
    this.stageLabel = label(this.hud,'Stage','第 1 关',29,0,0);
    this.stageLabel.color = paleGold;
    this.remainingLabel = label(this.hud,'Remaining','剩余 18 件',24,0,0);
    this.remainingLabel.color = paleGold;
    label(this.hud,'ModeTitle','年货三消',38,0,0).color = gold;
    const headline = routeHeadline(route);
    const subtitle = label(this.hud,'Subtitle',headline.subtitle ?? '点没被压住的年货 · 三件装一箱',headline.subtitle ? 22 : 19,0,0);
    subtitle.color = cream;
    this.soundButton = uiNode('SoundToggle',this.hud,86,40);
    this.soundButtonArt = this.soundButton.addComponent(Graphics);
    this.soundButtonLabel = label(this.soundButton,'SoundLabel','音效 开',15,0,0);
    this.musicButton = uiNode('MusicToggle',this.hud,86,40);
    this.musicButtonArt = this.musicButton.addComponent(Graphics);
    this.musicButtonLabel = label(this.musicButton,'MusicLabel','音乐 开',15,0,0);
    this.drawSoundButton();
    this.reserveLayer = uiNode('ReserveZone',this.node,750,1334);
    this.reserveShelf = this.reserveLayer.addComponent(Graphics);
    this.reserveLayer.active = false;
    this.pileLayer = uiNode('CargoPile',this.node,750,1334);
    this.warnLayer = uiNode('TrunkWarning',this.node,750,1334);
    this.warnArt = this.warnLayer.addComponent(Graphics);
    this.warnLayer.addComponent(UIOpacity);
    this.warnLayer.active = false;
    this.slotLayer = uiNode('TrunkSlots',this.node,750,1334);
    this.fxLayer = uiNode('Effects',this.node,750,1334);
    this.slotTitle = label(this.node,'SlotTitle',vehicleSlotLabel(this.vehicle.def,this.capacity),17,0,0);
    this.slotTitle.color = paleGold;
    this.reserveTitle = label(this.reserveLayer,'ReserveTitle','临时暂存区',16,0,0);
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
    game.on(Game.EVENT_SHOW,this.onShow);
    this.debugHook = {
      getState: () => this.debugState(),
      getClickable: () => this.debugClickable(),
      getSolution: () => [...this.level.solution],
      getModalButtons: () => this.debugModalButtons(),
      getActions: () => this.debugActions(),
      getFinishButtons: () => this.debugFinishButtons(),
      getFinishRank: () => this.finishView?.rankStatusText ?? null,
      getFinishStats: () => this.finishStats ? {
        elapsedSec:this.finishStats.elapsedSec,
        boxes:this.finishStats.boxes,
        text:this.finishView?.statsLine ?? '',
      } : null,
      getBoard: () => this.game.cards.map(card => ({
        id:card.id, kind:card.kind, source:card.source, layer:card.layer,
        x:card.x, y:card.y, w:card.w, h:card.h,
      })),
      getLayout: () => this.debugLayout(),
      getSlotViews: () => this.debugSlotViews(),
    };
    if (typeof window !== 'undefined') {
      (window as Window & {__stack?: object}).__stack = Object.freeze(this.debugHook);
    }
    this.node.once(Node.EventType.NODE_DESTROYED,() => {
      game.off(Game.EVENT_HIDE,this.onHide);
      game.off(Game.EVENT_SHOW,this.onShow);
      this.sounds.dispose();
      if (this.momHideTimer) clearTimeout(this.momHideTimer);
      if (typeof window !== 'undefined' && (window as Window & {__stack?: object}).__stack === this.debugHook) {
        delete (window as Window & {__stack?: object}).__stack;
      }
    });
    this.tick();
    const debug = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('debug');
    this.debugMomPending = debug === 'mom';
    if (debug === 'fail') {
      this.prefillFailure();
      this.refresh();
      if (this.game.status === 'lost') this.openFail();
    }
    if (debug === 'win') this.beginFinish(true);
  }

  tick(): void {
    const size = view.getVisibleSize();
    if (size.width !== this.layoutWidth || size.height !== this.layoutHeight) {
      this.layoutWidth = size.width; this.layoutHeight = size.height;
      this.height = stackPageHeight(size.width,size.height);
      const scale = Math.min(size.width/750,size.height/this.height);
      this.node.setScale(scale,scale,1);
      this.node.getComponent(UITransform)!.setContentSize(750,this.height);
      const safe = sys.getSafeAreaRect(false);
      const cssInset = cssSafeBottomPx();
      const innerHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
      const cssBottom = innerHeight > 0 ? cssInset/innerHeight*this.height : 0;
      const bottom = Math.max(0,safe.y/size.height*this.height,cssBottom);
      this.layout(bottom);
    }
    if (this.finish) {
      this.finishView!.render(this.finish.advance(Date.now()-this.finishStarted));
      return;
    }
    if (!this.busy && !this.modal && this.game.status === 'playing') {
      if (this.debugMomPending) {
        this.debugMomPending = false;
        const debugAdded = this.game.triggerMom();
        if (debugAdded.length) this.onMomAdded(debugAdded);
      }
      const added = this.game.tickMom(Date.now());
      if (added.length) this.onMomAdded(added);
    }
  }

  private layout(bottom: number): void {
    this.safeBottom = Math.max(0,bottom);
    this.node.getComponent(UITransform)!.setContentSize(750,this.height);
    const rideScale = vehicleScaleForPage(this.height);
    this.carScale = this.isSedan ? sedanScaleForPage(this.height) : 1;
    const base = createStackPageLayout(this.height,bottom,undefined,this.carScale);
    this.artRect = vehicleArtRect(this.vehicle.def,base.actionY,750,rideScale);
    const metrics = this.isSedan ? base : createStackPageLayout(this.height,bottom,this.artRect.y);
    this.safeBottom = metrics.safeBottom;
    this.board = fitStackBoard(stackContentBounds(this.level),metrics);
    this.actionY = metrics.actionY;
    this.trunk = {...metrics.trunk};
    this.carRect = {
      x:375-STACK_BODY_SIZE.w*this.carScale/2,
      y:metrics.carTop,
      w:STACK_BODY_SIZE.w*this.carScale,
      h:metrics.bodyHeight,
    };
    this.slotRects = this.isSedan
      ? sedanSlotCells(this.trunk,this.capacity)
      : vehicleSlotCells(this.vehicle.def,this.capacity,this.artRect);
    this.slotCell = this.slotRects[0].w;
    this.slotY = Math.min(...this.slotRects.map(r => r.y));
    if (!this.isSedan) {
      // The red “almost full” pulse wraps the cargo cells of this vehicle.
      const left = Math.min(...this.slotRects.map(r => r.x)), right = Math.max(...this.slotRects.map(r => r.x+r.w));
      const bottomY = Math.max(...this.slotRects.map(r => r.y+r.h));
      this.trunk = {x:left-10,y:this.slotY-10,w:right-left+20,h:bottomY-this.slotY+20};
    }
    this.stageLabel.node.setPosition(-242,this.height/2-61);
    this.remainingLabel.node.setPosition(198,this.height/2-61);
    this.soundButton.setPosition(323,this.height/2-170);
    this.musicButton.setPosition(323,this.height/2-216);
    this.hud.getChildByName('ModeTitle')!.setPosition(0,this.height/2-61);
    this.hud.getChildByName('Subtitle')!.setPosition(0,this.height/2-105);
    this.slotTitle.node.setPosition(0,this.height/2-(this.slotY-(this.isSedan ? 17 : 24)));
    this.reserveTitle.node.setPosition(-235,this.height/2-920);
    this.momLayer.getChildByName('MomBubble')!.setPosition(40,this.height/2-204);
    this.momAvatar.setPosition(-250,this.height/2-204);
    this.showVehicleIntro();
    for (let i=0;i<this.actions.length;i++) {
      const rect = this.actions[i].rect;
      rect.x = 44 + i*222; rect.y = this.actionY; rect.w = 210; rect.h = this.actionH;
      this.actions[i].label.node.setPosition(rect.x+rect.w/2-375,this.height/2-(rect.y+rect.h/2));
    }
    this.layoutBackground();
    this.drawCarSlots(this.carRect);
    this.drawActions();
    this.drawSoundButton();
    this.drawFailButtons();
    this.warnActive = false;
    this.warnLayer.active = false;
    this.refresh();
    this.finishView?.layout(this.height);
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
    // A soft night-market wash makes the pile read as one cargo mountain without boxing it in.
    this.rect(g,new Color(21,14,28,42),34,136,682,982,42);
    this.rect(g,new Color(255,194,102,24),74,912,602,206,44);
    this.rect(g,new Color(246,195,67,62),132,1032,486,2,1);

    if (!this.isSedan) {
      this.drawVehicle();
      return;
    }
    this.vehicleImage.enabled = false;
    if (!this.carFrames.body) {
      this.rect(g,new Color(34,22,29,210),car.x,car.y,car.w,Math.min(430,car.h),54);
      this.rect(g,new Color(163,31,39),car.x+28,car.y+86,car.w-56,296,46);
      this.rect(g,new Color(25,21,31),car.x+158,car.y+104,car.w-316,224,34);
    }
    this.drawCarImages();
    this.carDetail.clear();
    this.drawTrunkDetails();

    const last = this.slotRects[this.slotRects.length-1];
    const slotWidth = (last.x+last.w)-this.slotRects[0].x;
    const shelfX = this.slotRects[0].x-13;
    const shelfY = this.slotY-10;
    this.rect(this.carDetail,new Color(9,8,12,220),shelfX,shelfY,slotWidth+26,this.slotCell+20,16);
    this.stroke(this.carDetail,new Color(255,211,122,168),2,shelfX+2,shelfY+2,slotWidth+22,this.slotCell+16,14);
    for (const slot of this.slotRects) {
      this.rect(this.carDetail,new Color(39,31,32),slot.x,slot.y,slot.w,slot.h,12);
      this.rect(this.carDetail,new Color(20,19,22),slot.x+5,slot.y+5,slot.w-10,slot.h-10,9);
      this.stroke(this.carDetail,new Color(255,222,151,172),2,slot.x+2,slot.y+2,slot.w-4,slot.h-4,10);
      this.rect(this.carDetail,new Color(246,195,67,105),slot.x+slot.w*.31,slot.y+slot.h-11,slot.w*.38,3,2);
    }
    this.rect(this.carDetail,new Color(255,196,81,118),this.slotRects[0].x+24,this.slotY+this.slotCell+9,slotWidth-48,2,1);
  }

  private get isSedan(): boolean { return !this.vehicle.def.art; }

  private paletteColor(rgb: Rgb,alpha = 255): Color { return new Color(rgb[0],rgb[1],rgb[2],alpha); }

  /** Non-sedan rides: one rear-view sprite plus code-drawn containers, cells and label plate. */
  private drawVehicle(): void {
    this.trunkImage.enabled = false;
    this.bodyImage.enabled = false;
    this.lidImage.enabled = false;
    const art = this.artRect;
    const pal = this.vehicle.def.palette;
    const g = this.carDetail;
    g.clear();
    // Ground shadow under the ride.
    this.rect(g,new Color(8,4,8,90),art.x+art.w*.08,art.y+art.h*.9,art.w*.84,art.h*.08,art.h*.04);
    if (this.vehicleFrame) {
      this.showImage(this.vehicleImage,this.vehicleFrame,art.x+art.w/2,art.y+art.h/2,art.w,art.h);
      this.vehicleImage.color = Color.WHITE;
    } else {
      this.vehicleImage.enabled = false;
      this.rect(g,this.paletteColor(pal.panel,230),art.x+art.w*.06,art.y+art.h*.2,art.w*.88,art.h*.62,40);
    }
    const regions = vehicleRegionRects(this.vehicle.def,art);
    let cursor = 0;
    const split = regions.map(region => this.slotRects.filter(cell => cell.x >= region.x-2 && cell.x+cell.w <= region.x+region.w+2
      && cell.y >= region.y-2 && cell.y+cell.h <= region.y+region.h+2).length);
    regions.forEach((region,index) => {
      const cells = this.slotRects.slice(cursor,cursor+split[index]);
      cursor += split[index];
      if (!cells.length) return;
      const left = Math.min(...cells.map(c => c.x))-9, top = Math.min(...cells.map(c => c.y))-9;
      const right = Math.max(...cells.map(c => c.x+c.w))+9, bottom = Math.max(...cells.map(c => c.y+c.h))+9;
      this.drawContainer(this.vehicle.def.regions[index].style,left,top,right-left,bottom-top);
    });
    for (const slot of this.slotRects) {
      this.rect(g,this.paletteColor(pal.well,236),slot.x,slot.y,slot.w,slot.h,10);
      this.stroke(g,this.paletteColor(pal.accent,190),2,slot.x+2,slot.y+2,slot.w-4,slot.h-4,9);
      this.rect(g,this.paletteColor(pal.accent,110),slot.x+slot.w*.31,slot.y+slot.h-10,slot.w*.38,3,2);
    }
    // Label plate above the first container.
    const plateW = Math.max(200,this.slotTitle.string.length*17+36);
    this.rect(g,this.paletteColor(pal.panel,236),375-plateW/2,this.slotY-38,plateW,28,14);
    this.stroke(g,this.paletteColor(pal.accent,220),2,375-plateW/2+1,this.slotY-37,plateW-2,26,13);
    this.slotTitle.color = this.paletteColor(pal.text);
  }

  private drawContainer(style: 'box' | 'bag' | 'bed' | 'hatch' | 'door',x: number,y: number,w: number,h: number): void {
    const g = this.carDetail;
    const pal = this.vehicle.def.palette;
    const accent = this.paletteColor(pal.accent,210);
    if (style === 'box') {
      this.rect(g,new Color(18,10,12,215),x,y,w,h,16);
      this.stroke(g,accent,3,x+1,y+1,w-2,h-2,15);
      this.rect(g,this.paletteColor(pal.accent,150),x+12,y+3,w-24,3,2);
    } else if (style === 'bag') {
      this.rect(g,new Color(64,14,18,225),x,y,w,h,20);
      this.stroke(g,accent,3,x+1,y+1,w-2,h-2,19);
      // Flap seam and buckle.
      this.rect(g,this.paletteColor(pal.accent,170),x+10,y+h*.5-1,w-20,2,1);
      this.rect(g,accent,x+w/2-8,y+h*.5-7,16,14,4);
    } else if (style === 'bed') {
      this.rect(g,new Color(40,30,26,205),x,y,w,h,8);
      g.strokeColor = new Color(255,220,160,40); g.lineWidth = 2;
      for (let lineX = x+28; lineX < x+w-10; lineX += 34) {
        g.moveTo(lineX-375,this.height/2-y-4); g.lineTo(lineX-375,this.height/2-y-h+4);
      }
      g.stroke();
      this.stroke(g,accent,3,x+1,y+1,w-2,h-2,7);
    } else if (style === 'hatch') {
      this.rect(g,new Color(22,20,26,215),x,y,w,h,14);
      this.stroke(g,new Color(205,205,215,150),2,x+3,y+3,w-6,h-6,12);
      this.stroke(g,accent,2,x+1,y+1,w-2,h-2,13);
    } else {
      this.rect(g,new Color(30,30,36,220),x,y,w,h,6);
      this.stroke(g,new Color(236,236,240,190),4,x+2,y+2,w-4,h-4,5);
      this.rect(g,accent,x+6,y+h-10,w-12,4,2);
    }
  }

  /** “本关座驾：…” banner; later levels slide the new ride in with “换车啦”. */
  private showVehicleIntro(): void {
    if (this.introShown) return;
    this.introShown = true;
    const swap = this.route !== 'daily' && this.route >= 2;
    const banner = uiNode('VehicleIntro',this.fxLayer,520,120);
    const g = banner.addComponent(Graphics);
    const pal = this.vehicle.def.palette;
    fill(g,new Color(30,10,14,210),-250,-52,500,104,26);
    fill(g,this.paletteColor(pal.accent),-244,-46,488,92,22);
    fill(g,this.paletteColor(pal.panel),-238,-40,476,80,18);
    const title = label(banner,'IntroTitle',swap ? '换车啦！' : '出发回家',24,0,18);
    title.color = this.paletteColor(pal.text);
    const name = label(banner,'IntroVehicle',`本关座驾：${this.vehicle.displayName}`,30,0,-16);
    name.color = this.paletteColor(pal.accent);
    const opacity = banner.addComponent(UIOpacity);
    const y = this.height/2-(this.artRect.y > 0 && !this.isSedan ? this.artRect.y-70 : this.carRect.y-150);
    banner.setPosition(0,y,40);
    banner.setScale(.7,.7,1);
    tween(banner).to(.22,{scale:new Vec3(1,1,1)},{easing:'backOut'}).delay(1.5).call(() => {
      tween(opacity).to(.35,{opacity:0}).call(() => { if (banner.isValid) banner.destroy(); }).start();
    }).start();
    if (swap) {
      this.carLayer.setPosition(820,0,0);
      tween(this.carLayer).to(.55,{position:new Vec3(0,0,0)},{easing:'quadOut'}).start();
    }
    this.sounds.play('swap');
  }

  private makeImageNode(name: string,parent: Node): Sprite {
    const sprite = uiNode(name,parent,1,1).addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    sprite.enabled = false;
    return sprite;
  }

  private showImage(sprite: Sprite,frame: SpriteFrame,cx: number,cy: number,w: number,h: number): void {
    sprite.spriteFrame = frame;
    sprite.enabled = true;
    sprite.node.getComponent(UITransform)!.setContentSize(w,h);
    sprite.node.setPosition(cx-375,this.height/2-cy);
  }

  private drawCarImages(): void {
    const {body,trunk,lid} = this.carFrames;
    if (trunk) this.showImage(this.trunkImage,trunk,this.trunk.x+this.trunk.w/2,this.trunk.y+this.trunk.h/2,this.trunk.w,this.trunk.h);
    if (body) {
      const frame = body.clone();
      frame.insetTop = STACK_BODY_SLICE.top; frame.insetBottom = STACK_BODY_SLICE.bottom;
      frame.insetLeft = 0; frame.insetRight = 0;
      this.bodyImage.type = Sprite.Type.SLICED;
      this.showImage(
        this.bodyImage,
        frame,
        this.carRect.x+this.carRect.w/2,
        this.carRect.y+this.carRect.h/2,
        STACK_BODY_SIZE.w,
        STACK_BODY_SIZE.h,
      );
      this.bodyImage.node.setScale(this.carScale,this.carScaleY*this.carScale,1);
    }
    if (lid) {
      const lidW = 642*this.carScale, lidH = 82*this.carScale;
      this.showImage(this.lidImage,lid,375,this.carRect.y-34*this.carScale,lidW,lidH);
      this.lidImage.node.setScale(1,1,1);
      this.lidImage.node.angle = -3;
    }
  }

  private drawTrunkDetails(): void {
    this.rect(this.carDetail,new Color(14,11,14,82),this.trunk.x-4,this.trunk.y-3,this.trunk.w+8,this.trunk.h+6,18);
    this.stroke(this.carDetail,new Color(255,206,120,120),2,this.trunk.x-2,this.trunk.y-1,this.trunk.w+4,this.trunk.h+2,15);
    this.rect(this.carDetail,new Color(8,6,9,112),this.trunk.x+8,this.trunk.y+6,this.trunk.w-16,20,9);
    const k = this.carScale;
    const sx = (x: number): number => (x-375)*k;
    const lidBottom = this.carRect.y+38*k;
    const hinge = this.height/2-(this.carRect.y+12*k);
    this.carDetail.strokeColor = new Color(30,17,20,220);
    this.carDetail.lineWidth = 7*k;
    this.carDetail.moveTo(sx(97),hinge);
    this.carDetail.lineTo(sx(157),this.height/2-lidBottom);
    this.carDetail.moveTo(sx(653),hinge);
    this.carDetail.lineTo(sx(593),this.height/2-lidBottom);
    this.carDetail.stroke();
    this.carDetail.strokeColor = new Color(255,197,101,105);
    this.carDetail.lineWidth = 2;
    this.carDetail.moveTo(sx(98),hinge);
    this.carDetail.lineTo(sx(157),this.height/2-lidBottom);
    this.carDetail.moveTo(sx(652),hinge);
    this.carDetail.lineTo(sx(593),this.height/2-lidBottom);
    this.carDetail.stroke();
  }

  private makeAction(key: ActionButton['key'],title: string): ActionButton {
    const text = label(this.buttonsLayer,`Action-${key}`,title,25,0,0);
    text.color = cream;
    return {key,title,rect:{x:0,y:0,w:0,h:0},label:text};
  }

  private drawSoundButton(): void {
    this.drawToggle(this.soundButtonArt,this.soundButtonLabel,this.sounds.soundEnabled,'音效');
    this.drawToggle(this.musicButtonArt,this.musicButtonLabel,this.sounds.musicEnabled,'音乐');
  }

  private drawToggle(g: Graphics,text: Label,on: boolean,name: string): void {
    g.clear();
    fill(g,on ? gold : new Color(96,87,89),-43,-20,86,40,14);
    fill(g,on ? new Color(139,31,38) : new Color(67,61,64),-40,-17,80,34,11);
    g.strokeColor = on ? new Color(255,226,164) : new Color(155,146,146);
    g.lineWidth = 1.5;
    g.roundRect(-41,-18,82,36,12); g.stroke();
    text.string = `${name} ${on ? '开' : '关'}`;
    text.color = on ? paleGold : new Color(205,198,194);
  }

  private drawActions(): void {
    const g = this.buttonsArt;
    g.clear();
    for (const action of this.actions) {
      const used = this.game.props[action.key];
      const pal = this.vehicle.def.palette;
      this.rect(g,used ? new Color(69,61,63,240) : this.paletteColor(pal.panel,246),action.rect.x,action.rect.y,action.rect.w,action.rect.h,20);
      this.stroke(g,used ? gray : this.paletteColor(pal.accent),2,action.rect.x+2,action.rect.y+2,action.rect.w-4,action.rect.h-4,18);
      this.rect(g,used ? new Color(109,99,101) : this.paletteColor(pal.accent,90),action.rect.x+17,action.rect.y+action.rect.h-15,action.rect.w-34,3,2);
      action.label.string = used ? `${action.title} · 已用` : `${action.title} · 1 次`;
      action.label.color = used ? new Color(185,177,169) : this.paletteColor(pal.text);
    }
  }

  private refresh(animateSlot = false): void {
    this.updateHud();
    this.updateReserve();
    this.syncPile();
    this.renderSlot(this.game.slot,{animate:animateSlot});
    this.updateWarning();
    this.drawActions();
  }

  private updateReserve(): void {
    const reserve = this.game.cards.filter(card => card.source === 'reserve').map(card => mapStackRect(this.board,card));
    this.reserveLayer.active = reserve.length > 0;
    if (!reserve.length) return;
    const minX = Math.min(...reserve.map(card => card.x));
    const minY = Math.min(...reserve.map(card => card.y));
    const maxX = Math.max(...reserve.map(card => card.x+card.w));
    const maxY = Math.max(...reserve.map(card => card.y+card.h));
    const shelfX = Math.max(20,minX-12);
    const shelfY = minY-10;
    const shelfW = Math.min(710,maxX-minX+24);
    const shelfH = maxY-minY+20;
    this.reserveShelf.clear();
    this.rect(this.reserveShelf,new Color(35,22,31,214),shelfX,shelfY,shelfW,shelfH,18);
    this.stroke(this.reserveShelf,new Color(246,195,67,132),2,shelfX+2,shelfY+2,shelfW-4,shelfH-4,16);
    this.reserveTitle.node.setPosition(shelfX+70-375,this.height/2-(shelfY-5));
  }

  private updateHud(): void {
    this.stageLabel.string = routeHeadline(this.route).stage;
    this.remainingLabel.string = `剩余 ${this.game.pileRemaining} 件`;
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
        view = this.makeCardView(card,card.w*this.board.scale,this.pileLayer);
        this.cardViews.set(card.id,view);
        view.born = true;
      }
      const size = card.w*this.board.scale;
      if (view.kind !== card.kind || Math.abs(view.size-size) > .01) this.configureCard(view,card,size);
      view.node.active = true;
      view.node.setSiblingIndex(index);
      const center = this.cardCenter(card);
      if (view.born) {
        view.node.setPosition(center.x,center.y+(card.source === 'mom' ? 120*this.board.scale : 0),0);
        if (card.source === 'mom') tween(view.node).to(0.28,{position:center},{easing:'bounceOut'}).start();
        view.born = false;
      } else if (!this.busy || card.source !== 'mom') {
        view.node.setPosition(center);
      }
      const blocked = isBlocked(card,this.game.cards);
      view.back.node.active = !!card.carton && blocked;
      this.drawDim(view,blocked && !view.back.node.active);
    }
  }

  /**
   * Reconciles slot card nodes with the slot contents. Every card keeps its own node for as long
   * as it stays in the slot (never hidden, rebuilt or re-textured); cards that move tween to their
   * new cell, cards that left are destroyed, and `reserve` keeps an empty cell for a card in flight.
   */
  private renderSlot(cards: readonly StackCard[],options: {animate?: boolean; reserve?: number} = {}): void {
    const keep = new Set(cards.map(card => card.id));
    for (const [id,view] of this.slotViewMap) {
      if (keep.has(id) && id !== options.reserve) continue;
      Tween.stopAllByTarget(view.node);
      if (view.node.isValid) view.node.destroy();
      this.slotViewMap.delete(id);
    }
    for (let index=0;index<cards.length && index<this.slotRects.length;index++) {
      const card = cards[index];
      if (card.id === options.reserve) continue;
      const rect = this.slotRects[index];
      const target = new Vec3(rect.x+rect.w/2-375,this.height/2-(rect.y+rect.h/2),0);
      let view = this.slotViewMap.get(card.id);
      if (!view) {
        view = this.makeCardView(card,Math.max(42,rect.w-6),this.slotLayer);
        view.node.setPosition(target);
        this.slotViewMap.set(card.id,view);
        continue;
      }
      const current = view.node.position;
      if (Math.abs(current.x-target.x) < .5 && Math.abs(current.y-target.y) < .5) continue;
      Tween.stopAllByTarget(view.node);
      if (options.animate) tween(view.node).to(.16,{position:target},{easing:'quadOut'}).start();
      else view.node.setPosition(target);
    }
    this.slotViews = [...this.slotViewMap.values()];
  }

  /** Snapshot for the frame-sampling slot check (tools/play-slot.mjs). */
  private debugSlotViews(): {id:number;kind:string;uuid:string;active:boolean;opacity:number;spriteEnabled:boolean;frame:string;x:number;scale:number}[] {
    return [...this.slotViewMap.values()].map(view => ({
      id:view.cardId,
      kind:view.kind,
      uuid:view.node.uuid,
      active:view.node.isValid && view.node.activeInHierarchy,
      opacity:view.node.getComponent(UIOpacity)?.opacity ?? 255,
      spriteEnabled:view.sprite.enabled,
      frame:view.sprite.spriteFrame ? `${view.sprite.spriteFrame.name}#${(view.sprite.spriteFrame as unknown as {_uuid?: string})._uuid ?? ''}` : 'fallback',
      x:view.node.position.x,
      scale:view.node.scale.x,
    }));
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
    const back = uiNode('CartonBack',node,size,size).addComponent(Graphics);
    back.node.active = false;
    const dim = uiNode('PressedShade',node,size,size).addComponent(Graphics);
    const view: CardView = {node,art,sprite,fallback,dim,back,size,kind:'',cardId:card.id,born:false};
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
    this.drawCartonBack(view.back,size);
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
        const cropped = cropItemFrame(card.kind,frame);
        this.itemFrames.set(card.kind,cropped);
        for (const candidate of this.cardViews.values()) if (candidate.kind === card.kind) this.showItemFrame(candidate,cropped);
        for (const candidate of this.slotViews) if (candidate.kind === card.kind) this.showItemFrame(candidate,cropped);
      });
    }
  }

  private get hideCovered(): boolean {
    return this.level.cards.some(card => card.carton);
  }

  /** Kraft carton with red tape and a 福 stamp: what a covered card looks like from level 4 on. */
  private drawCartonBack(g: Graphics,size: number): void {
    g.clear();
    const radius = Math.max(9,size*.14);
    fill(g,new Color(120,78,40),-size/2,-size/2,size,size,radius);
    fill(g,new Color(196,142,82),-size/2+3,-size/2+3,size-6,size-6,radius-2);
    fill(g,new Color(214,164,104),-size/2+6,-size/2+size*.52,size-12,size*.4,radius-4);
    // Packing tape across the flaps.
    fill(g,new Color(186,38,40,235),-size*.12,-size/2+3,size*.24,size-6,2);
    g.strokeColor = new Color(120,78,40,160); g.lineWidth = Math.max(1.5,size*.02);
    g.moveTo(-size/2+6,size*.02); g.lineTo(size/2-6,size*.02); g.stroke();
    fill(g,new Color(246,195,67,230),-size*.13,size*.16,size*.26,size*.22,3);
    g.strokeColor = new Color(186,38,40); g.lineWidth = Math.max(1.5,size*.025);
    g.roundRect(-size/2+1,-size/2+1,size-2,size-2,radius); g.stroke();
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
    const rect = mapStackRect(this.board,card);
    return new Vec3(rect.x+rect.w/2-375,this.height/2-(rect.y+rect.h/2),0);
  }

  /** Page (750-wide design) point → CSS pixel on screen, including letterboxing. */
  private toScreen(x: number,y: number): {x:number;y:number;k:number} {
    const sw = typeof window === 'undefined' ? 750 : window.innerWidth;
    const sh = typeof window === 'undefined' ? this.height : window.innerHeight;
    const k = Math.min(sw/750,sh/this.height);
    return {x:(sw-750*k)/2+x*k,y:(sh-this.height*k)/2+y*k,k};
  }

  private touch(event: EventTouch): void {
    this.sounds.unlock();
    const p = this.point(event);
    if (this.rankPage) { this.rankPage.press(p.x,p.y); return; }
    if (this.provincePicker) { this.provincePicker.press(p.x,p.y); return; }
    if (this.finish) { this.finishView?.press(p.x,p.y); return; }
    if (this.modal === 'fail') {
      for (const button of this.failButtons) {
        if (!contains(button.rect,p.x,p.y)) continue;
        if (button.action === 'revive') this.revive();
        else if (button.action === 'share') this.openShare(false);
        else this.onAction('replay');
        return;
      }
      return;
    }
    if (contains(this.soundRect,p.x,p.y)) {
      this.sounds.toggleSound();
      this.drawSoundButton();
      return;
    }
    if (contains(this.musicRect,p.x,p.y)) {
      this.sounds.toggleMusic();
      this.drawSoundButton();
      return;
    }
    if (this.busy || this.game.status !== 'playing') return;
    for (const action of this.actions) {
      if (!contains(action.rect,p.x,p.y)) continue;
      this.useAction(action.key);
      return;
    }
    const lp = unmapStackPoint(this.board,p.x,p.y);
    const hit = topCardAt(this.game.cards,lp.x,lp.y);
    if (!hit) return;
    if (!this.game.canTap(hit.id)) { this.sounds.play('tap'); return; }
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
    if (!result.ok || !result.card) { this.sounds.play('tap'); return; }
    this.busy = true;
    this.sounds.play('tap');
    setTimeout(() => { if (this.node.isValid) this.sounds.play('fly'); },35);
    const flyer = this.makeCardView(result.card,result.card.w*this.board.scale,this.fxLayer);
    flyer.node.setPosition(this.cardCenter(result.card));
    const targetIndex = Math.min(result.insertIndex,this.slotRects.length-1);
    const slot = this.slotRects[targetIndex];
    const target = new Vec3(slot.x+slot.w/2-375,this.height/2-(slot.y+slot.h/2),0);
    const scale = Math.max(.35,(slot.w-6)/(result.card.w*this.board.scale));
    this.syncPile();
    this.updateHud();
    // Neighbours after the insert point slide right now, leaving a gap the flyer lands in.
    this.renderSlot(result.slotBeforePack,{animate:true,reserve:result.card.id});
    const landed = result.card;
    tween(flyer.node).to(.2,{position:target,scale:new Vec3(scale,scale,1)},{easing:'quadOut'}).call(() => {
      if (flyer.node.isValid) flyer.node.destroy();
      this.renderSlot(result.slotBeforePack,{animate:true});
      void landed;
      if (result.packed.length === PACK_SIZE) this.playPack(result);
      else this.finishTap(result);
    }).start();
  }

  private playPack(result: StackTapResult): void {
    this.sounds.play('pack');
    const now = Date.now();
    this.comboCount = now - this.lastPackAt <= STACK_COMBO_WINDOW_MS ? this.comboCount + 1 : 1;
    this.lastPackAt = now;
    if (this.comboCount >= 2) {
      const level = Math.min(8,this.comboCount-1);
      setTimeout(() => { if (this.node.isValid) this.sounds.play('combo',{level}); },120);
      this.showCombo(this.comboCount);
    }
    const packed = new Set(result.packed.map(card => card.id));
    this.packingIds = packed;
    const views = [...this.slotViewMap.values()].filter(view => packed.has(view.cardId));
    const first = views[0];
    if (!first) { this.packingIds = new Set(); this.finishTap(result); return; }
    const center = views[Math.min(1,views.length-1)].node.position.clone();
    setTimeout(() => {
      if (!this.node.isValid) return;
      for (let i=0;i<views.length;i++) {
        const view = views[i];
        Tween.stopAllByTarget(view.node);
        tween(view.node).to(.24,{position:center,scale:new Vec3(.58,.58,1),angle:i === 0 ? -8 : i === 2 ? 8 : 0},{easing:'quadIn'}).start();
      }
      setTimeout(() => {
        if (!this.node.isValid) return;
        // Only the three packed cards leave; every other slot card keeps its node and slides left.
        for (const view of views) {
          Tween.stopAllByTarget(view.node);
          if (view.node.isValid) view.node.destroy();
          this.slotViewMap.delete(view.cardId);
        }
        this.slotViews = [...this.slotViewMap.values()];
        this.packingIds = new Set();
        this.renderSlot(this.game.slot,{animate:true});
        this.showPackedBox(center,() => this.finishTap(result));
      },250);
    },80);
  }

  private showPackedBox(at: Vec3,onDone: () => void): void {
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
    this.refresh(true);
    if (result.status === 'lost') this.openFail();
    else if (result.status === 'won') this.beginFinish();
  }

  private useAction(key: ActionButton['key']): void {
    let used = false;
    if (key === 'moveOut') used = this.game.useMoveOut().length > 0;
    else if (key === 'undo') used = this.game.useUndo();
    else used = this.game.useShuffle();
    this.sounds.play(used ? 'prop' : 'tap');
    this.refresh();
  }

  /** “连击 ×N” floats up from the slot and fades out. */
  private showCombo(count: number): void {
    const node = uiNode('ComboFloat',this.fxLayer,320,80);
    const text = label(node,'ComboText',`连击 ×${count}`,44,0,0);
    text.color = gold;
    text.enableOutline = true;
    text.outlineColor = new Color(120,14,22);
    text.outlineWidth = 4;
    const opacity = node.addComponent(UIOpacity);
    const y = this.height/2-(this.slotY-70);
    node.setPosition(0,y,30);
    node.setScale(.6,.6,1);
    tween(node).to(.16,{scale:new Vec3(1.15,1.15,1)},{easing:'backOut'}).to(.5,{position:new Vec3(0,y+70,30)}).call(() => { if (node.isValid) node.destroy(); }).start();
    tween(opacity).delay(.35).to(.3,{opacity:0}).start();
  }

  /** Red pulsing trunk when only one or two slot cells are left. */
  private updateWarning(): void {
    const free = this.capacity-this.game.slot.length;
    const danger = this.game.status === 'playing' && !this.finish && free <= 2;
    if (danger === this.warnActive) return;
    this.warnActive = danger;
    const opacity = this.warnLayer.getComponent(UIOpacity)!;
    Tween.stopAllByTarget(opacity);
    this.warnLayer.active = danger;
    if (!danger) return;
    this.sounds.play('warn');
    const g = this.warnArt;
    g.clear();
    const t = this.trunk;
    g.fillColor = new Color(230,30,36,92);
    g.roundRect(t.x-6-375,this.height/2-(t.y+t.h)-6,t.w+12,t.h+12,18); g.fill();
    g.strokeColor = new Color(255,70,60,255); g.lineWidth = 5;
    g.roundRect(t.x-6-375,this.height/2-(t.y+t.h)-6,t.w+12,t.h+12,18); g.stroke();
    opacity.opacity = 255;
    tween(opacity).repeatForever(tween<UIOpacity>().to(.32,{opacity:70}).to(.32,{opacity:255})).start();
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
    fill(g,new Color(61,18,26,245),-300,-320,600,640,34);
    fill(g,gold,-292,-312,584,624,29);
    fill(g,new Color(176,34,42),-284,-304,568,608,24);
    const title = label(layer,'OverflowTitle',this.isSedan ? '后备箱塞爆了' : `${this.vehicle.def.container}塞爆了`,46,0,236);
    title.color = gold;
    const hint = label(layer,'OverflowHint',`${this.capacity} 格全满，还差一件同款年货`,22,0,190);
    hint.color = cream;
    this.drawOverflowCar(layer);
    const share = this.failButton(layer,'share','生成分享图',-180);
    const restart = this.failButton(layer,'restart','重来',-262);
    if (this.game.canRevive) this.failButtons.push(this.failButton(layer,'revive','用道具复活一次 · 移出 3 件',-98));
    else label(layer,'ReviveUsed','本局复活已用过',22,0,-98).color = cream;
    this.failButtons.push(share,restart);
    this.sounds.play('fail');
    this.refreshFailButtons();
  }

  private drawOverflowCar(parent: Node): void {
    parent.getChildByName('OverflowCar')?.destroy();
    const car = uiNode('OverflowCar',parent,290,200);
    car.setPosition(0,45);
    const fallbackNode = uiNode('OverflowFrame',car,290,200);
    const fallback = fallbackNode.addComponent(Graphics);
    fill(fallback,new Color(30,14,18,80),-132,-88,264,166,28);
    fill(fallback,new Color(132,30,34),-129,-84,258,158,26);
    fill(fallback,new Color(22,18,23),-91,-49,182,87,16);
    const body = this.makeImageNode('OverflowBody',car);
    if (!this.isSedan) {
      fallbackNode.active = !this.vehicleFrame;
      if (this.vehicleFrame) {
        body.spriteFrame = this.vehicleFrame;
        body.enabled = true;
        const h = 196, w = h*this.vehicle.def.artSize.w/this.vehicle.def.artSize.h*(this.vehicle.def.stretchX ?? 1);
        body.node.getComponent(UITransform)!.setContentSize(Math.min(290,w),h);
        body.node.setPosition(0,-6);
      }
    } else if (this.carFrames.body) {
      body.spriteFrame = this.carFrames.body;
      body.enabled = true;
      body.node.getComponent(UITransform)!.setContentSize(252,158);
      body.node.setPosition(0,-8);
    }
    const lid = this.makeImageNode('OverflowLid',car);
    if (this.isSedan && this.carFrames.lid) {
      lid.spriteFrame = this.carFrames.lid;
      lid.enabled = true;
      lid.node.getComponent(UITransform)!.setContentSize(238,76);
      lid.node.setPosition(0,54);
      lid.node.angle = -7;
    }
    const items = this.level.items.slice(0,3);
    for (let index=0; index<items.length; index++) {
      const item = items[index];
      const node = uiNode(`OverflowItem-${index}`,car,42,42);
      node.setPosition((index-1)*54, [58,78,52][index]??58);
      node.angle = (index-1)*10;
      const art = node.addComponent(Graphics);
      fill(art,cream,-21,-21,42,42,9);
      art.strokeColor = gold; art.lineWidth = 2; art.roundRect(-20,-20,40,40,8); art.stroke();
      const sprite = this.makeImageNode('Art',node);
      sprite.node.getComponent(UITransform)!.setContentSize(34,34);
      sprite.node.setPosition(0,0);
      const frame = this.itemFrames.get(item.key);
      if (frame) {
        sprite.spriteFrame = frame; sprite.enabled = true;
      } else {
        void loadArt(`items/${item.key}`).then(loaded => {
          if (!loaded || !node.isValid) return;
          const cropped = cropItemFrame(item.key,loaded);
          this.itemFrames.set(item.key,cropped);
          sprite.spriteFrame = cropped; sprite.enabled = true;
          for (const candidate of this.cardViews.values()) if (candidate.kind === item.key) this.showItemFrame(candidate,cropped);
        });
      }
    }
  }

  private failButton(parent: Node,action: FailButton['action'],title: string,localY: number): FailButton {
    const rect = {x:150,y:this.height/2-localY-35,w:450,h:70};
    const text = label(parent,`Fail-${action}`,title,29,0,localY);
    text.color = ink;
    return {action,title,rect,label:text};
  }

  private refreshFailButtons(): void {
    if (!this.failLayer?.isValid) return;
    const g = this.failLayer.getComponent(Graphics)!;
    for (const button of this.failButtons) {
      fill(g,gold,button.rect.x-375,this.height/2-button.rect.y-button.rect.h,button.rect.w,button.rect.h,20);
      g.strokeColor = new Color(120,52,19); g.lineWidth = 2;
      g.roundRect(button.rect.x-375+2,this.height/2-button.rect.y-button.rect.h+2,button.rect.w-4,button.rect.h-4,18); g.stroke();
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
    this.sounds.play('prop');
    this.refresh();
  }

  private beginFinish(instant = false): void {
    if (this.finish) return;
    this.busy = true;
    this.sounds.play('win');
    const elapsedMs = instant ? Math.max(Date.now()-this.startedAt,60_000) : Math.max(0,Date.now()-this.startedAt);
    this.finishStarted = instant ? Date.now()-FINISH_DURATION : Date.now();
    this.finish = new FinishPlayback(cue => {
      if (cue.sound === 'trunk_slam') this.sounds.play('pack');
      else if (cue.sound === 'horn') this.sounds.play('tap');
      if (cue.vibration && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(cue.vibration); } catch { /* Optional vibration: silent. */ }
      }
    });
    if (this.route === 'daily') markDailyDone(browserStorage());
    const finale = this.route === ROAD_FINAL_STAGE;
    const elapsedSecFinale = instant ? Math.round(elapsedMs/1000) : Math.max(1,Math.round(elapsedMs/1000));
    if (finale) {
      // Level 9 is the end of the road: the homecoming scene replaces the usual finish screen.
      markHomeDone(browserStorage());
      this.sounds.play('home');
      this.finishStats = {elapsedSec:elapsedSecFinale,boxes:instant ? Math.floor(this.level.cards.length / 3) : this.game.clearedGroups};
      this.finishView = new StackHomecomingView(this.node,this.finishStats,action => {
        if (action === 'share') this.openShare(true);
        else if (action === 'road') this.onAction('first');
        else this.onAction('home');
      });
      this.finishView.layout(this.height);
      this.finishView.render(instant ? this.finish.advance(FINISH_DURATION) : this.finish.state);
      if (typeof window !== 'undefined' && isDebugRun(window.location.search)) this.finishView.setRankStatus(RANK_DEBUG_TEXT);
      return;
    }
    const choices = this.route === 'daily'
      ? [{title:'今日已塞满 · 回首页',action:'first' as const},{title:'再来一次',action:'replay' as const}]
      : this.route === 1
        ? [{title:'下一关',action:'next' as const},{title:'再来一次',action:'replay' as const}]
        : [{title:nextRouteTitle(this.route) ?? '下一关',action:'next' as const},{title:'再来一次',action:'replay' as const}];
    const elapsedSec = instant ? Math.round(elapsedMs/1000) : Math.max(1,Math.round(elapsedMs/1000));
    const totalBoxes = Math.floor(this.level.cards.length / 3);
    this.finishStats = {elapsedSec,boxes:instant ? totalBoxes : this.game.clearedGroups};
    this.finishView = new StackFinishView(
      this.node,
      choices,
      this.finishStats,
      action => this.mapFinish(action),
      () => this.openShare(true),
      () => this.openRankPage(),
      this.vehicle.def.art ? {
        art:this.vehicle.def.art,
        w:this.vehicle.def.artSize.w,
        h:this.vehicle.def.artSize.h,
        stretchX:this.vehicle.def.stretchX,
        region:this.vehicle.def.regions[0],
      } : undefined,
    );
    this.finishView.layout(this.height);
    this.finishView.render(instant ? this.finish.advance(FINISH_DURATION) : this.finish.state);
    // Any ?debug=… run (win/fail/mom/…) is a test drive: it never reaches the leaderboard.
    if (typeof window !== 'undefined' && isDebugRun(window.location.search)) {
      this.finishView.setRankStatus(RANK_DEBUG_TEXT);
      return;
    }
    // Only the first two levels count for the province board; the endless road and the daily board never report.
    if (this.route === 2) this.startRankReporting(elapsedMs);
    else if (this.route === 1) this.startStageOneReporting(elapsedMs);
  }

  private startStageOneReporting(elapsedMs: number): void {
    if (!this.rankApi.enabled) return;
    const province = this.rankApi.province;
    if (!province) {
      this.provincePicker = new ProvincePicker(this.node,this.height,null,{
        onSelect:selected => {
          this.rankApi.setProvince(selected);
          this.provincePicker = undefined;
          void this.sendClear(1,selected,elapsedMs);
        },
        onCancel:() => { this.provincePicker = undefined; },
      });
      return;
    }
    void this.sendClear(1,province,elapsedMs);
  }

  private startRankReporting(elapsedMs: number): void {
    if (!this.rankApi.enabled) {
      this.finishView?.setRankStatus(formatContributionFailure());
      return;
    }
    const province = this.rankApi.province;
    if (!province) {
      this.provincePicker = new ProvincePicker(this.node,this.height,null,{
        onSelect:selected => {
          this.rankApi.setProvince(selected);
          this.provincePicker = undefined;
          this.sendClear(2,selected,elapsedMs);
        },
        onCancel:() => {
          this.provincePicker = undefined;
          this.finishView?.setRankStatus('未选择省份，排行未上报');
        },
      });
      return;
    }
    this.sendClear(2,province,elapsedMs);
  }

  private async sendClear(stage: 1 | 2, province: Province, ms: number): Promise<void> {
    if (stage === 2) this.finishView?.setRankStatus(formatRankProgress(province));
    let outcome: Awaited<ReturnType<RankApi['submitClear']>>;
    try {
      outcome = await this.rankApi.submitClear({
        province,
        stage,
        ms,
        sessionId:this.rankApi.deviceId,
        boxes:this.game.clearedGroups,
        momBoxes:this.game.momEventCount,
      });
    } catch {
      outcome = {ok:false,reason:'network'};
    }
    if (!this.node.isValid || stage !== 2) return;
    if (outcome.ok) this.lastProvinceRank = outcome.result.rank;
    this.finishView?.setRankStatus(
      outcome.ok ? formatContributionResult(province,outcome.result) : formatContributionFailure(),
    );
  }

  private openRankPage(): void {
    if (this.rankPage) return;
    this.rankPage = new RankPage(this.node,this.height,() => {
      this.rankPage?.node.destroy();
      this.rankPage = undefined;
    },() => this.onAction('first'));
  }

  private mapFinish(action: FinishAction): void {
    if (action === 'next') this.onAction('next');
    else if (action === 'first') this.onAction('first');
    else this.onAction('replay');
  }

  private openShare(victory: boolean): void {
    const result = victory
      ? {
          victory:true as const,
          elapsedSec:this.finishStats?.elapsedSec ?? Math.max(1,Math.round((Date.now()-this.startedAt)/1000)),
          boxes:this.finishStats?.boxes ?? this.game.clearedGroups,
        }
      : {victory:false as const,remaining:this.game.pileRemaining};
    const def = this.vehicle.def;
    void showStackShareImage({
      stage:this.level.stage,
      stageLabel:routeHeadline(this.route).stage,
      result,
      province:this.rankApi.province,
      rank:victory ? this.lastProvinceRank : null,
      counted:(this.route === 1 || this.route === 2) && !(typeof window !== 'undefined' && isDebugRun(window.location.search)),
      ending:victory && this.route === ROAD_FINAL_STAGE,
      ride:{
        name:this.vehicle.displayName,
        art:def.art,
        w:def.artSize.w,
        h:def.artSize.h,
        stretchX:def.stretchX,
        region:def.regions[0],
      },
    });
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
      .map(card => {
        const rect = mapStackRect(this.board,card);
        const a = this.toScreen(rect.x,rect.y);
        const b = this.toScreen(rect.x+rect.w,rect.y+rect.h);
        void screenWidth; void screenHeight;
        return {
          id:card.id,
          kind:card.kind,
          name:card.name,
          screenX:(a.x+b.x)/2,
          screenY:(a.y+b.y)/2,
          screenLeft:a.x,
          screenRight:b.x,
          screenTop:a.y,
          screenBottom:b.y,
          screenW:b.x-a.x,
          screenH:b.y-a.y,
        };
      });
  }

  private debugActions(): {key:string;used:boolean;screenX:number;screenY:number}[] {
    const screenWidth = typeof window === 'undefined' ? 750 : window.innerWidth;
    const screenHeight = typeof window === 'undefined' ? this.height : window.innerHeight;
    return this.actions.map(action => ({
      key:action.key,
      used:this.game.props[action.key],
      screenX:(action.rect.x+action.rect.w/2)/750*screenWidth,
      screenY:(action.rect.y+action.rect.h/2)/this.height*screenHeight,
    }));
  }

  private debugLayout(): object {
    const viewport = this.toScreen(750,this.height);
    const origin = this.toScreen(0,0);
    const cards = this.game.cards.map(card => ({...card,...mapStackRect(this.board,card)}));
    const bounds = stackCardBounds(cards);
    const layout = this.isSedan ? createStackPageLayout(this.height,this.safeBottom,undefined,this.carScale) : createStackPageLayout(this.height,this.safeBottom,this.artRect.y);
    const topLeft = this.toScreen(bounds.left,bounds.top);
    const bottomRight = this.toScreen(bounds.right,bounds.bottom);
    const lidTop = this.isSedan ? this.carRect.y-75*this.carScale : this.artRect.y;
    const actionsBottom = this.actionY+this.actionH;
    return {
      viewport:{width:typeof window === 'undefined' ? 750 : window.innerWidth,height:typeof window === 'undefined' ? this.height : window.innerHeight},
      canvas:{left:origin.x,top:origin.y,right:viewport.x,bottom:viewport.y},
      boardScale:this.board.scale,
      cardSize:{
        width:this.level.cardW*this.board.scale*origin.k,
        height:this.level.cardH*this.board.scale*origin.k,
      },
      cardBounds:{left:topLeft.x,right:bottomRight.x,top:topLeft.y,bottom:bottomRight.y},
      hudBottom:this.toScreen(0,layout.stackTop).y,
      trunkTop:this.toScreen(0,this.trunk.y).y,
      lidTop:this.toScreen(0,lidTop).y,
      carTop:this.toScreen(0,this.isSedan ? this.carRect.y : this.artRect.y).y,
      vehicle:{key:this.vehicle.def.key,name:this.vehicle.displayName,capacity:this.capacity,label:this.slotTitle.string},
      actionsTop:this.toScreen(0,this.actionY).y,
      reserveBounds:(() => {
        const size = Math.round(this.level.cardW*.72);
        const rects = this.level.reservePositions.map(p => mapStackRect(this.board,{x:p.x,y:p.y,w:size,h:size}));
        const a = this.toScreen(Math.min(...rects.map(r => r.x)),Math.min(...rects.map(r => r.y)));
        const b = this.toScreen(Math.max(...rects.map(r => r.x+r.w)),Math.max(...rects.map(r => r.y+r.h)));
        return {left:a.x,top:a.y,right:b.x,bottom:b.y};
      })(),
      slotCells:this.slotRects.map(r => {
        const a = this.toScreen(r.x,r.y), b = this.toScreen(r.x+r.w,r.y+r.h);
        return {left:a.x,top:a.y,right:b.x,bottom:b.y};
      }),
      actionsBottom:this.toScreen(0,actionsBottom).y,
      safeBottom:this.safeBottom*origin.k,
      stackRegion:{
        top:this.toScreen(0,layout.stackTop).y,
        bottom:this.toScreen(0,layout.stackBottom).y,
        ratio:layout.stackRatio,
      },
      sideCounts:{
        left:cards.filter(card => card.source === 'side-left').length,
        right:cards.filter(card => card.source === 'side-right').length,
      },
    };
  }

  private debugState(): object {
    const kindCounts: Record<string,number> = {};
    for (const card of this.game.cards) kindCounts[card.kind] = (kindCounts[card.kind] ?? 0) + 1;
    return {
      stage:this.level.stage,
      finale:this.finishView instanceof StackHomecomingView,
      route:this.route,
      headline:routeHeadline(this.route),
      capacity:this.capacity,
      hideCovered:this.hideCovered,
      cartonCards:this.game.cards.filter(card => card.carton).length,
      cartonBacks:[...this.cardViews.values()].filter(view => view.node.active && view.back.node.active).length,
      status:this.game.status,
      remaining:this.game.pileRemaining,
      pileRemaining:this.game.pileRemaining,
      totalRemaining:this.game.remaining,
      modal:this.modal ?? null,
      busy:this.busy,
      finishing:!!this.finish,
      momEvents:this.game.momEventCount,
      momVisible:this.momLayer.active,
      soundEnabled:this.sounds.enabled,
      slot:this.game.slot.map(card => ({id:card.id,kind:card.kind,name:card.name})),
      props:this.game.props,
      kindCounts,
      clickable:this.debugClickable(),
      province:this.rankApi.province,
      overlay:this.rankPage ? 'rank' : this.provincePicker ? 'province' : null,
    };
  }

  private debugFinishButtons(): {
    action:string;title:string;screenX:number;screenY:number;screenLeft:number;screenRight:number;
    screenTop:number;screenBottom:number;screenW:number;screenH:number;
  }[] {
    if (!this.finishView) return [];
    const screenWidth = typeof window === 'undefined' ? 750 : window.innerWidth;
    const screenHeight = typeof window === 'undefined' ? this.height : window.innerHeight;
    return this.finishView.buttonPoints().map(button => ({...this.debugRect(button.action,button.rect,screenWidth,screenHeight),title:button.title}));
  }

  private debugModalButtons(): {
    action:string;screenX:number;screenY:number;screenLeft:number;screenRight:number;
    screenTop:number;screenBottom:number;screenW:number;screenH:number;
  }[] {
    if (this.modal !== 'fail') return [];
    const screenWidth = typeof window === 'undefined' ? 750 : window.innerWidth;
    const screenHeight = typeof window === 'undefined' ? this.height : window.innerHeight;
    return this.failButtons.map(button => this.debugRect(button.action,button.rect,screenWidth,screenHeight));
  }

  private debugRect(action: string,rect: Rect,screenWidth: number,screenHeight: number): {
    action:string;screenX:number;screenY:number;screenLeft:number;screenRight:number;
    screenTop:number;screenBottom:number;screenW:number;screenH:number;
  } {
    return {
      action,
      screenX:(rect.x+rect.w/2)/750*screenWidth,
      screenY:(rect.y+rect.h/2)/this.height*screenHeight,
      screenLeft:rect.x/750*screenWidth,
      screenRight:(rect.x+rect.w)/750*screenWidth,
      screenTop:rect.y/this.height*screenHeight,
      screenBottom:(rect.y+rect.h)/this.height*screenHeight,
      screenW:rect.w/750*screenWidth,
      screenH:rect.h/this.height*screenHeight,
    };
  }
}

let safeProbe: HTMLDivElement | null = null;
/** CSS env(safe-area-inset-bottom) in CSS pixels (iOS home indicator, Android gesture bar). */
function cssSafeBottomPx(): number {
  if (typeof document === 'undefined' || !document.body) return 0;
  try {
    if (!safeProbe) {
      safeProbe = document.createElement('div');
      safeProbe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom,0px)';
      document.body.appendChild(safeProbe);
    }
    return safeProbe.getBoundingClientRect().height || 0;
  } catch { return 0; }
}

function contains(rect: Rect,x: number,y: number): boolean {
  return x >= rect.x && x <= rect.x+rect.w && y >= rect.y && y <= rect.y+rect.h;
}

function cropItemFrame(key: string,frame: SpriteFrame): SpriteFrame {
  const crop = ITEM_CROPS[key];
  if (!crop) return frame;
  const result = frame.clone();
  result.rect = new SpriteRect(crop.x,crop.y,crop.w,crop.h);
  result.originalSize = new Size(crop.w,crop.h);
  result.offset = new Vec2(0,0);
  return result;
}
