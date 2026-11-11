import { Color, EventTouch, Game, Graphics, Label, Node, Sprite, SpriteFrame, Tween, UITransform, Vec3, game, sys, tween, view } from 'cc';
import { GAME_TITLE } from '../config/brand';
import type { Point } from '../core/input';
import { itemKey, itemMeta, itemScale } from '../core/items';
import type { Level, PieceDef, Placement, Rotation } from '../core/types';
import { StageSession } from '../game/StageSession';
import { DragController, type Gesture } from '../game/DragController';
import { dimensions, inRect, pieceCells, previewVisible, trayLayout, type Rect } from '../game/InteractionGeometry';
import { SoundEffects } from '../services/SoundEffects';
import { loadArt } from '../services/OptionalResources';
import { fill, label, uiNode } from '../ui/UIKit';
import { FinishPlayback, type FinishAction } from '../game/FinishTimeline';
import { FinishView } from '../ui/FinishView';
import { computeStageLayout, controlContentLayout, drawCarRear, drawTrunkGrid, drawStageBackdrop, drawStageChrome, drawTrunkFloor, itemShortName, vehicleLook } from '../ui/StageArt';
import { drawItemFeature, itemTone } from '../ui/ItemArt';
import { browserSettingsStorage, loadGameSettings, saveGameSettings, type GameSettingsData } from '../game/GameSettings';
import { countdownFrame } from '../game/CountdownFeedback';

const ink = new Color(74,44,26), red = new Color(215,51,43), cream = new Color(255,246,229);
const gold = new Color(246,195,67);
const green = new Color(76,175,80,128), invalid = new Color(229,57,53,128);
const shadow = new Color(40,20,10,70);
// Measured on art/vehicles/sedan_v1_body.png (1024×640).
const BODY_SIZE = {w:1024,h:640};
const BODY_HOLE = {left:159,right:878,top:104,bottom:425};
const BODY_SLICE = {top:150,bottom:380};
const BODY_PLATE_Y = 498, BODY_SEAL_Y = 72;
const MOM_INTRO_MS = 3800, MOM_APPEAR_MS = 700, MOM_STAY_MS = 1300;
const ITEM_OVERSCAN = 1.025;
interface PieceView { node: Node; sprite: Sprite; shadow: Sprite; graphics: Graphics; featureNode: Node; feature: Graphics; title: Label; held: boolean; failed: boolean; rect: Rect; rotation: Rotation; size: number }
interface MomSequence { started: number; appended: boolean }
interface TrayPan { id: number; startX: number; startY: number; startScroll: number; active: boolean }

export class StagePage {
  readonly node: Node;
  private readonly session: StageSession;
  private readonly sounds: SoundEffects;
  private readonly settings: GameSettingsData;
  private readonly settingsStorage = browserSettingsStorage();
  private readonly settingsButton: Node;
  private readonly settingsButtonArt: Graphics;
  private readonly settingsPanel: Node;
  private readonly settingsArt: Graphics;
  private readonly settingsTitle: Label;
  private readonly soundLabel: Label;
  private readonly vibrationLabel: Label;
  private readonly soundState: Label;
  private readonly vibrationState: Label;
  private readonly background: Graphics;
  private readonly trayEmpty: Node;
  private readonly trayEmptyArt: Graphics;
  private readonly trayEmptyTitle: Label;
  private readonly trayEmptyHint: Label;
  private readonly backdrop: Graphics;
  private readonly floorMarks: Graphics;
  private readonly bgImage: Sprite;
  private readonly bodyImage: Sprite;
  private readonly trunkImage: Sprite;
  private readonly sceneFrames: {bg?: SpriteFrame; body?: SpriteFrame; trunk?: SpriteFrame} = {};
  private readonly itemFrames = new Map<string,SpriteFrame | undefined>();
  private readonly preview: Graphics;
  private readonly controls: Graphics;
  private readonly clock: Label;
  private readonly packed: Label;
  private readonly notice: Label;
  private readonly title: Label;
  private readonly vehicle: Label;
  private readonly plate: Label;
  private readonly lidSeal: Label;
  private readonly overlay: Node;
  private readonly overlayText: Label;
  private readonly allPieces: readonly PieceDef[];
  private readonly pieces = new Map<number,PieceView>();
  private readonly drag = new DragController();
  private readonly buttons: {rect: Rect; action: () => void; duringDrag: boolean}[] = [];
  private slots: {piece: PieceDef; rect: Rect}[] = [];
  private board: Rect = {x:0,y:0,w:0,h:0};
  private tray: Rect = {x:24,y:880,w:702,h:270};
  private car: Rect = {x:0,y:0,w:0,h:0};
  private trunk: Rect = {x:0,y:0,w:0,h:0};
  private buttonY = 1170;
  private buttonH = 120;
  private cell = 0;
  private trayCell = 0;
  private trayScrollX = 0;
  private trayScrollMax = 0;
  private trayContentWidth = 0;
  private trayPan?: TrayPan;
  private width = 750;
  private height = 1334;
  private selected?: PieceDef;
  private cleared = false;
  private finish?: FinishPlayback;
  private finishView?: FinishView;
  private finishStarted=0;
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
  private readonly momIntro: Label;
  private readonly momIntroBubble: Node;
  private readonly momLayer: Node;
  private readonly momAvatar: Node;
  private readonly momBubbleNode: Node;
  private readonly momBubble: Label;
  private readonly guideNode: Node;
  private readonly guideHand: Node;
  private readonly guideArt: Graphics;
  private previewPlacement?: Placement;
  private modal: 'restart' | 'timeout' | undefined;
  private landscape = false;
  private mom?: MomSequence;
  private momIntroUntil = 0;
  private guidePlacement?: Placement;
  private guideFrom?: Point;
  private guideTo?: Point;
  private guideStarted = 0;
  private guideDismissed = false;
  private settingsOpen = false;
  private readonly onHide = () => this.cancelDrag();

  constructor(parent: Node, private readonly level: Level, private readonly now: () => number, private readonly onClear: (action: FinishAction) => void) {
    this.node = uiNode('StagePage',parent,750,1334);
    this.allPieces = [...level.pieces,...(level.mode === 'mom' ? (level.extras ?? []).flat() : [])];
    this.session = new StageSession(level,now);
    this.sounds = new SoundEffects(parent);
    this.settings = loadGameSettings(this.settingsStorage);
    this.sounds.setEnabled?.(this.settings.sound);
    this.backdrop = uiNode('Backdrop',this.node,750,1334).addComponent(Graphics);
    this.bgImage = this.imageNode('BackdropImage');
    this.bodyImage = this.imageNode('CarBodyImage');
    this.background = uiNode('GridBackground',this.node,750,1334).addComponent(Graphics);
    this.trayEmpty = uiNode('TrayEmptyState',this.node,750,1334);
    this.trayEmptyArt = this.trayEmpty.addComponent(Graphics);
    this.trayEmptyTitle = label(this.trayEmpty,'TrayEmptyTitle','已全部装车',34,0,0);
    this.trayEmptyTitle.color = cream;
    this.trayEmptyHint = label(this.trayEmpty,'TrayEmptyHint','福气满箱 · 准备出发',21,0,0);
    this.trayEmptyHint.color = gold;
    this.trayEmpty.active = false;
    this.trunkImage = this.imageNode('TrunkFloorImage');
    this.floorMarks = uiNode('TrunkFloorMarks',this.node,750,1334).addComponent(Graphics);
    for (const [file,slot] of [['ui/bg_night','bg'],['vehicles/sedan_v1_body','body'],['vehicles/sedan_v1_trunk','trunk']] as const)
      void loadArt(file).then(frame => {
        if (!frame || !this.node.isValid) return;
        this.sceneFrames[slot]=frame;
        if (this.height) this.drawBackground();
      });
    const look=vehicleLook(level.vehicle);
    this.clock = label(this.node,'Clock','',28,0,0);
    this.clock.color = gold;
    this.packed = label(this.node,'Packed','',26,0,0);
    this.packed.color = gold;
    this.notice = label(this.node,'Notice','',24,0,0);
    this.notice.color = gold;
    this.momIntroBubble = uiNode('MomIntroBubble',this.node,470,110);
    this.momIntroBubble.active = false;
    this.drawMomIntroBubble(this.momIntroBubble.addComponent(Graphics));
    this.momIntro = label(this.node,'MomIntro','妈妈说：再带点东西！',28,0,0);
    this.momIntro.color = red; this.momIntro.node.active = false;
    this.momIntroUntil = level.mode === 'mom' ? now()+MOM_INTRO_MS : 0;
    this.title = label(this.node,'Title',GAME_TITLE,54,0,0);
    this.title.color = gold;
    this.vehicle = label(this.node,'Vehicle',`第 ${level.stage} 关 · ${look.name}后备箱`,27,0,0);
    this.vehicle.color = cream;
    this.plate = label(this.node,'Plate','回家',24,0,0);
    this.plate.color = gold;
    this.lidSeal = label(this.node,'TrunkLidSeal','福',30,0,0);
    this.lidSeal.color = gold;
    this.preview = uiNode('DropPreview',this.node,750,1334).addComponent(Graphics);
    for (const piece of this.allPieces) {
      const node = uiNode(`Piece${piece.id}`,this.node,1,1);
      const graphics = uiNode(`Fallback${piece.id}`,node,1,1).addComponent(Graphics);
      const shadowSprite = uiNode(`Shadow${piece.id}`,node,1,1).addComponent(Sprite);
      shadowSprite.sizeMode=Sprite.SizeMode.CUSTOM; shadowSprite.trim=false; shadowSprite.enabled=false;
      const sprite = uiNode(`Sprite${piece.id}`,node,1,1).addComponent(Sprite);
      sprite.sizeMode=Sprite.SizeMode.CUSTOM; sprite.trim=false; sprite.enabled=false;
      const featureNode = uiNode(`Feature${piece.id}`,node,1,1);
      const feature = featureNode.addComponent(Graphics);
      const title = label(node,`Item${piece.id}`,itemShortName(piece),18,0,0);
      this.pieces.set(piece.id,{node,sprite,shadow:shadowSprite,graphics,featureNode,feature,title,held:false,failed:false,rect:{x:0,y:0,w:0,h:0},rotation:0,size:0});
    }
    this.controls = uiNode('Controls',this.node,750,1334).addComponent(Graphics);
    this.button('旋转 90°',45,180,() => this.rotateSelected(),true);
    this.button('撤销',295,160,() => { this.cancelDrag(); this.session.undo(); this.sounds.play('undo'); this.selected=undefined; this.sync(); });
    this.button('重开',515,160,() => { this.cancelDrag(); this.modal='restart'; this.updateOverlay(); });
    this.settingsButton = uiNode('SettingsButton',this.node,750,1334);
    this.settingsButtonArt = this.settingsButton.addComponent(Graphics);
    this.settingsPanel = uiNode('SettingsPanel',this.node,750,1334);
    this.settingsPanel.active = false;
    this.settingsArt = this.settingsPanel.addComponent(Graphics);
    this.settingsTitle = label(this.settingsPanel,'SettingsTitle','设置',23,0,0);
    this.settingsTitle.color = gold;
    this.soundLabel = label(this.settingsPanel,'SoundLabel','音效',25,0,0);
    this.soundLabel.color = cream;
    this.vibrationLabel = label(this.settingsPanel,'VibrationLabel','震动',25,0,0);
    this.vibrationLabel.color = cream;
    this.soundState = label(this.settingsPanel,'SoundState','开',21,0,0);
    this.soundState.color = ink;
    this.vibrationState = label(this.settingsPanel,'VibrationState','开',21,0,0);
    this.vibrationState.color = ink;
    this.momLayer = uiNode('MomAppear',this.node,750,1334);
    this.momLayer.active = false;
    const bubble = uiNode('MomBubble',this.momLayer,430,104);
    this.momBubbleNode = bubble;
    fill(bubble.addComponent(Graphics),cream,-215,-52,430,104,26);
    this.momBubble = label(bubble,'MomBubbleText','等等！还有这个！',30,0,0);
    this.momBubble.color = ink;
    this.momAvatar = uiNode('MomAvatar',this.momLayer,180,180);
    const momFallback = this.momAvatar.addComponent(Graphics);
    fill(momFallback,red,-78,-78,156,156,78);
    const momFallbackText = label(this.momAvatar,'MomFallbackText','妈',72,0,0);
    momFallbackText.color = cream;
    const momImage = uiNode('MomImage',this.momAvatar,170,170).addComponent(Sprite);
    momImage.sizeMode = Sprite.SizeMode.CUSTOM; momImage.trim = false; momImage.enabled = false;
    if (level.mode === 'mom') void loadArt('ui/mom').then(frame => {
      if (!frame || !this.node.isValid) return;
      momImage.spriteFrame = frame; momImage.enabled = true;
      momFallback.enabled = false; momFallbackText.node.active = false;
    });
    this.overlay = uiNode('InteractionOverlay',this.node,750,1334);
    this.overlay.addComponent(Graphics);
    this.overlayText = label(this.overlay,'Prompt','',38,0,50);
    this.guideNode = uiNode('FirstLevelGuide',this.node,750,1334);
    this.guideNode.active = false;
    this.guideArt = this.guideNode.addComponent(Graphics);
    this.guideHand = uiNode('GuideHand',this.guideNode,96,112);
    this.drawGuideHand(this.guideHand.addComponent(Graphics));
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
    if (this.finish) {
      this.finishView!.render(this.finish.advance(this.now()-this.finishStarted));
      return;
    }
    if (this.canShowGuide()) {
      if (!this.guidePlacement) this.prepareGuideRoute();
      this.updateGuide();
    } else {
      this.guideNode.active = false;
    }
    const showIntro=this.level.mode === 'mom' && !this.mom && this.now() < this.momIntroUntil;
    this.momIntro.node.active = showIntro;
    this.momIntroBubble.active = showIntro;
    if (this.mom) this.updateMomSequence();
    else if (this.session.readyForNextBatch && !this.cleared) this.startMomSequence();
    const seconds = this.session.remainingSeconds;
    if (seconds !== this.displayedSeconds) {
      const frame=countdownFrame(seconds,this.displayedSeconds);
      if (frame.tick) { this.sounds.play('tick'); this.bounceCountdown(); }
      this.displayedSeconds = seconds;
      this.clock.string = frame.label;
      this.clock.color = frame.warning ? new Color(255,92,76) : gold;
    }
    if (this.session.expired && !this.cleared && this.modal !== 'timeout') {
      this.cancelDrag(); this.modal='timeout'; this.updateOverlay();
    }
  }

  private layout(top: number, bottom: number): void {
    const frame=computeStageLayout(this.level,this.height,top,bottom);
    this.cell=frame.cell; this.board=frame.board; this.tray=frame.tray;
    this.car=frame.car; this.trunk=frame.trunk; this.buttonY=frame.buttonY; this.buttonH=frame.buttonH;
    this.layoutTray();
    this.placeLabel('Title',64+top); this.placeLabel('Vehicle',116+top);
    this.placeLabel('MomIntro',281+top);
    this.momIntroBubble.setPosition(0,this.height/2-281-top);
    this.placeLabel('Clock',187+top,190);
    this.placeLabel('Packed',187+top,-180);
    this.placeLabel('Notice',frame.noticeY);
    this.placeLabel('Plate',this.car.y+this.car.h-98);
    this.placeLabel('TrunkLidSeal',this.car.y+51);
    this.momBubbleNode.setPosition(-75,this.height/2-735);
    this.momAvatar.setPosition(300,this.height/2-795);
    for (const [i,button] of this.buttons.entries()) {
      button.rect.y = this.buttonY; button.rect.h = this.buttonH;
      this.placeLabel(`Button${i}`,button.rect.y+58,button.rect.x+button.rect.w/2-375);
    }
    this.drawBackground(); this.sync(); this.updateOverlay();
    this.layoutSettings();
    this.guidePlacement=undefined; this.guideFrom=undefined; this.guideTo=undefined;
    if (this.guideNode) this.prepareGuideRoute();
    this.finishView?.layout(this.height,this.board);
  }

  private placeLabel(name: string, y: number, x = 0): void { this.node.getChildByName(name)!.setPosition(x,this.height/2-y); }
  private rect(g: Graphics,r: Rect,color: Color): void { fill(g,color,r.x-375,this.height/2-r.y-r.h,r.w,r.h,6); }
  private imageNode(name: string): Sprite {
    const sprite=uiNode(name,this.node,1,1).addComponent(Sprite);
    sprite.sizeMode=Sprite.SizeMode.CUSTOM; sprite.trim=false; sprite.enabled=false;
    return sprite;
  }
  private drawBackground(): void {
    const g = this.background; g.clear(); this.backdrop.clear(); this.floorMarks.clear();
    const look=vehicleLook(this.level.vehicle);
    const {bg,body,trunk}=this.sceneFrames;
    // Painted backdrop covers the screen (cropping the sides on tall phones); code art is the fallback.
    if (bg) {
      const scale=Math.max(1,this.height/1334);
      this.showImage(this.bgImage,bg,375,this.height/2,750*scale,1334*scale);
    } else drawStageBackdrop(this.backdrop,750,this.height,0,look);
    if (body) this.drawCarBody(body); else drawCarRear(g,750,this.height,0,this.car,this.trunk,look);
    if (trunk) {
      this.rect(g,this.trunk,new Color(28,22,24));
      this.showImage(this.trunkImage,trunk,this.trunk.x+this.trunk.w/2,this.trunk.y+this.trunk.h/2,this.trunk.w,this.trunk.h);
      drawTrunkGrid(this.floorMarks,750,this.height,0,this.board,this.level,this.cell);
    } else drawTrunkFloor(g,750,this.height,0,this.trunk,this.board,this.level,this.cell);
    drawStageChrome(g,750,this.height,0,this.board,this.tray,this.tray.y-20,look);
  }
  private showImage(sprite: Sprite,frame: SpriteFrame,cx: number,cy: number,w: number,h: number): void {
    sprite.spriteFrame=frame; sprite.enabled=true;
    sprite.node.getComponent(UITransform)!.setContentSize(w,h);
    sprite.node.setPosition(cx-375,this.height/2-cy);
  }
  // The car-rear painting has a transparent trunk opening (BODY_HOLE). It is scaled so the opening
  // matches the trunk rect; only the plain pillar band between the slanted top and the tail lights stretches.
  private drawCarBody(frame: SpriteFrame): void {
    const s=this.trunk.w/(BODY_HOLE.right-BODY_HOLE.left);
    frame.insetTop=BODY_SLICE.top; frame.insetBottom=BODY_SLICE.bottom; frame.insetLeft=0; frame.insetRight=0;
    const sprite=this.bodyImage;
    sprite.type=Sprite.Type.SLICED;
    const h=this.trunk.h/s+BODY_HOLE.top+(BODY_SIZE.h-BODY_HOLE.bottom);
    const left=this.trunk.x-BODY_HOLE.left*s, top=this.trunk.y-BODY_HOLE.top*s;
    this.showImage(sprite,frame,left+BODY_SIZE.w*s/2,top+h*s/2,BODY_SIZE.w,h);
    sprite.node.setScale(s,s,1);
    this.placeLabel('Plate',this.trunk.y+this.trunk.h+(BODY_PLATE_Y-BODY_HOLE.bottom)*s);
    this.placeLabel('TrunkLidSeal',this.trunk.y-(BODY_HOLE.top-BODY_SEAL_Y)*s);
    this.lidSeal.color=new Color(150,28,32);
    this.plate.color=new Color(150,28,32);
  }

  private drawMomIntroBubble(g: Graphics): void {
    fill(g,new Color(255,205,114),-207,-39,414,86,24);
    fill(g,new Color(255,246,229),-201,-33,402,74,19);
    fill(g,new Color(255,226,190),-189,-23,378,54,14);
    g.fillColor=new Color(255,246,229);
    g.moveTo(-12,-39); g.lineTo(20,-39); g.lineTo(2,-62); g.close(); g.fill();
  }

  private canShowGuide(): boolean {
    return this.level.stage === 1 && this.level.mode !== 'mom' && !this.guideDismissed &&
      !this.cleared && !this.finish && !this.modal;
  }

  private prepareGuideRoute(): void {
    this.guideNode.active = false;
    if (!this.canShowGuide()) return;
    const piece=this.remainingPieces()[0];
    if (!piece) return;
    const view=this.pieces.get(piece.id)!;
    if (!view.node.active || !view.rect.w || !view.rect.h) return;
    const placement=this.findGuidePlacement(piece);
    if (!placement) return;
    const box=dimensions(piece,placement.rotation);
    this.guidePlacement=placement;
    this.guideFrom={x:view.rect.x+view.rect.w/2,y:view.rect.y+view.rect.h/2};
    this.guideTo={x:this.board.x+(placement.x+box.w/2)*this.cell,
      y:this.board.y+(placement.y+box.h/2)*this.cell};
    this.guideStarted=this.now();
    this.guideNode.active=true;
    this.drawGuideMarker(piece,placement);
    this.updateGuide();
  }

  private findGuidePlacement(piece: PieceDef): Placement | undefined {
    const preferred=this.session.rotationFor(piece.id);
    const rotations:[Rotation,Rotation,Rotation,Rotation]=[preferred,0,1,2];
    const seen=new Set<Rotation>();
    let best: Placement | undefined, bestScore=Infinity;
    for (const rotation of rotations) {
      if (seen.has(rotation)) continue;
      seen.add(rotation);
      const box=dimensions(piece,rotation);
      for (let y=0;y<=this.level.height-box.h;y++) for (let x=0;x<=this.level.width-box.w;x++) {
        const placement:Placement={pieceId:piece.id,x,y,rotation};
        if (!this.session.canDrop(placement)) continue;
        const score=(rotation === preferred ? 0 : 1000)+Math.abs(x+box.w/2-this.level.width/2)+y*2;
        if (score < bestScore) { best=placement; bestScore=score; }
      }
    }
    return best;
  }

  private updateGuide(): void {
    if (!this.guideNode.active || !this.guideFrom || !this.guideTo) return;
    const travel=1100,dwell=320,total=(travel+dwell)*2;
    const elapsed=Math.max(0,this.now()-this.guideStarted)%total;
    let progress=0;
    if (elapsed < travel) progress=elapsed/travel;
    else if (elapsed < travel+dwell) progress=1;
    else if (elapsed < travel*2+dwell) progress=1-(elapsed-travel-dwell)/travel;
    const eased=progress*progress*(3-2*progress);
    const x=this.guideFrom.x+(this.guideTo.x-this.guideFrom.x)*eased;
    const y=this.guideFrom.y+(this.guideTo.y-this.guideFrom.y)*eased;
    const bob=Math.sin(elapsed/total*Math.PI*4)*2.5;
    this.guideHand.setPosition(x-375,this.height/2-y+bob);
  }

  private drawGuideMarker(piece: PieceDef,placement: Placement): void {
    const g=this.guideArt; g.clear();
    const box=dimensions(piece,placement.rotation);
    const left=this.board.x+placement.x*this.cell-375;
    const right=left+box.w*this.cell;
    const top=this.height/2-(this.board.y+placement.y*this.cell);
    const bottom=top-box.h*this.cell;
    const corner=Math.min(22,this.cell*.34);
    g.strokeColor=new Color(246,195,67,220); g.lineWidth=3;
    g.moveTo(left,top-corner); g.lineTo(left,top); g.lineTo(left+corner,top);
    g.moveTo(right-corner,top); g.lineTo(right,top); g.lineTo(right,top-corner);
    g.moveTo(left,bottom+corner); g.lineTo(left,bottom); g.lineTo(left+corner,bottom);
    g.moveTo(right-corner,bottom); g.lineTo(right,bottom); g.lineTo(right,bottom+corner);
    g.stroke();
    const cx=(left+right)/2,cy=(top+bottom)/2;
    g.fillColor=new Color(255,246,229,190); g.circle(cx,cy,8); g.fill();
    g.strokeColor=new Color(215,51,43,170); g.lineWidth=2; g.circle(cx,cy,12); g.stroke();
  }

  private drawGuideHand(g: Graphics): void {
    const outline=new Color(112,28,31,235), fingertip=new Color(255,243,214);
    fill(g,new Color(40,20,10,65),-9,-94,57,80,23);
    fill(g,outline,-11,-49,22,52,11);
    fill(g,fingertip,-7,-45,14,45,7);
    fill(g,outline,0,-75,48,51,22);
    fill(g,cream,4,-71,40,43,19);
    fill(g,outline,-4,-56,23,24,12);
    fill(g,cream,-1,-53,17,18,9);
    fill(g,outline,7,-94,40,24,10);
    fill(g,new Color(184,40,42),10,-91,34,18,7);
    fill(g,gold,12,-81,30,3,2);
    fill(g,new Color(255,255,255,90),-4,-40,7,26,4);
    fill(g,new Color(246,195,67,205),-18,-71,5,5,3);
    fill(g,new Color(246,195,67,175),35,-51,4,4,2);
    fill(g,new Color(215,51,43,175),28,-99,4,4,2);
  }

  private dismissGuide(): void {
    if (this.guideDismissed) return;
    this.guideDismissed=true;
    this.guideNode.active=false;
    this.guidePlacement=undefined; this.guideFrom=undefined; this.guideTo=undefined;
  }

  private button(text: string,x: number,w: number,action: () => void,duringDrag = false): Label {
    const index = this.buttons.length;
    this.buttons.push({rect:{x,y:this.buttonY,w,h:this.buttonH},action,duringDrag});
    return label(this.node,`Button${index}`,text,28,0,0);
  }
  private updateControls(): void {
    this.controls.clear();
    for (const [i,b] of this.buttons.entries()) {
      const active=i === 0 && !!this.selected;
      this.rect(this.controls,{x:b.rect.x+3,y:b.rect.y+6,w:b.rect.w,h:b.rect.h},new Color(34,15,21,180));
      this.rect(this.controls,b.rect,gold);
      this.rect(this.controls,{x:b.rect.x+4,y:b.rect.y+4,w:b.rect.w-8,h:b.rect.h-8},
        active ? new Color(239,181,62) : new Color(184,40,42));
      const content=controlContentLayout(b.rect),cy=this.height/2-(b.rect.y+b.rect.h/2);
      this.drawControlIcon(this.controls,i,content.iconX-375,cy,active ? ink : gold);
      const text=this.node.getChildByName(`Button${i}`);
      text?.setPosition(content.textX-375,cy);
    }
    const rotateTitle=this.node.getChildByName('Button0')?.getComponent(Label);
    if (rotateTitle) rotateTitle.color=this.selected ? ink : gold;
    for (let i=1;i<this.buttons.length;i++) {
      const text=this.node.getChildByName(`Button${i}`)?.getComponent(Label);
      if (text) text.color=cream;
    }
    this.notice.string = this.selected ? `已选中 · ${itemMeta(this.selected).name}` :
      this.trayScrollMax > 0 ? '轻点年货选中 · 拖进后备箱 · 托盘左右滑动' : '轻点年货选中 · 拖进后备箱';
    const total = this.level.mode === 'mom' ? this.session.totalPieces : this.session.pieces.length;
    this.packed.string = `已装车 ${this.session.placements.length} / ${total} 件`;
    if (this.trayScrollMax > 0) {
      const trackW=this.tray.w-40, trackY=this.height/2-(this.tray.y+this.tray.h-18);
      const thumbW=Math.max(52,trackW*this.tray.w/this.trayContentWidth);
      const thumbX=-trackW/2+(trackW-thumbW)*this.trayScrollX/this.trayScrollMax;
      fill(this.controls,new Color(255,218,153,48),-trackW/2,trackY,trackW,4,2);
      fill(this.controls,gold,thumbX,trackY,thumbW,4,2);
    }
  }

  private drawControlIcon(g: Graphics,index: number,cx: number,cy: number,color: Color): void {
    if (index === 0) {
      g.strokeColor=color; g.lineWidth=5;
      g.circle(cx,cy,14); g.stroke();
      fill(g,color,cx+11,cy+4,10,6,2);
      g.fillColor=color; g.moveTo(cx+21,cy+7); g.lineTo(cx+9,cy+14); g.lineTo(cx+21,cy+18); g.close(); g.fill();
    } else if (index === 1) {
      fill(g,color,cx-15,cy-7,22,5,2);
      fill(g,color,cx-15,cy-7,5,18,2);
      g.fillColor=color; g.moveTo(cx-18,cy-13); g.lineTo(cx-8,cy-13); g.lineTo(cx-15,cy-2); g.close(); g.fill();
    } else {
      g.strokeColor=color; g.lineWidth=4;
      g.circle(cx,cy,13); g.stroke();
      fill(g,color,cx-3,cy+5,6,12,2);
      g.fillColor=color; g.moveTo(cx-10,cy+15); g.lineTo(cx+7,cy+15); g.lineTo(cx,cy+5); g.close(); g.fill();
    }
  }
  private settingsGearRect(): Rect { return {x:634,y:52,w:68,h:68}; }
  private settingsPanelRect(): Rect { return {x:384,y:146,w:330,h:136}; }
  private soundSettingRect(): Rect { return {x:396,y:180,w:306,h:44}; }
  private vibrationSettingRect(): Rect { return {x:396,y:224,w:306,h:44}; }

  private drawSettingsButton(): void {
    const g=this.settingsButtonArt; g.clear();
    const r=this.settingsGearRect(),radius=28;
    const x=r.x+r.w/2-375,y=this.height/2-(r.y+r.h/2);
    fill(g,new Color(34,15,21,155),x-radius+2,y-radius-4,radius*2,radius*2,radius);
    g.fillColor=gold; g.circle(x,y,radius); g.fill();
    g.fillColor=red; g.circle(x,y,radius-5); g.fill();
    g.strokeColor=gold; g.lineWidth=5;
    for (let i=0;i<8;i++) {
      const a=i*Math.PI/4;
      g.moveTo(x+Math.cos(a)*11,y+Math.sin(a)*11);
      g.lineTo(x+Math.cos(a)*(radius-2),y+Math.sin(a)*(radius-2));
    }
    g.stroke();
    g.fillColor=gold; g.circle(x,y,10); g.fill();
    g.fillColor=new Color(184,40,42); g.circle(x,y,4); g.fill();
  }

  private drawSettingToggle(g: Graphics,row: Rect,on: boolean): void {
    const pill={x:row.x+row.w-90,y:row.y+7,w:70,h:30};
    this.rect(g,pill,gold);
    this.rect(g,{x:pill.x+3,y:pill.y+3,w:pill.w-6,h:pill.h-6},
      on ? new Color(246,195,67) : new Color(91,31,38));
  }

  private updateSettingsPanel(): void {
    this.settingsPanel.active=this.settingsOpen;
    const g=this.settingsArt; g.clear();
    const r=this.settingsPanelRect();
    this.rect(g,{x:r.x+4,y:r.y+6,w:r.w,h:r.h},new Color(34,15,21,165));
    this.rect(g,r,gold);
    this.rect(g,{x:r.x+4,y:r.y+4,w:r.w-8,h:r.h-8},new Color(150,34,40));
    this.rect(g,{x:r.x+10,y:r.y+36,w:r.w-20,h:2},new Color(255,224,158,95));
    this.drawSettingToggle(g,this.soundSettingRect(),this.settings.sound);
    this.drawSettingToggle(g,this.vibrationSettingRect(),this.settings.vibration);
    this.settingsTitle.node.setPosition(r.x+r.w/2-375,this.height/2-(r.y+19));
    this.soundLabel.node.setPosition(r.x+24-375,this.height/2-202);
    this.vibrationLabel.node.setPosition(r.x+24-375,this.height/2-246);
    const stateX=this.soundSettingRect().x+this.soundSettingRect().w-55-375;
    this.soundState.node.setPosition(stateX,this.height/2-202);
    this.vibrationState.node.setPosition(stateX,this.height/2-246);
    this.soundState.string=this.settings.sound ? '开' : '关';
    this.vibrationState.string=this.settings.vibration ? '开' : '关';
    this.soundState.color=this.settings.sound ? ink : gold;
    this.vibrationState.color=this.settings.vibration ? ink : gold;
  }

  private applySettings(): void {
    this.sounds.setEnabled?.(this.settings.sound);
    saveGameSettings(this.settings,this.settingsStorage);
    this.updateSettingsPanel();
  }

  private setSettingsOpen(open: boolean): void {
    this.settingsOpen=open;
    this.updateSettingsPanel();
  }

  private handleSettingsTap(p: Point): boolean {
    if (this.settingsOpen) {
      if (inRect(p,this.soundSettingRect())) {
        this.settings.sound=!this.settings.sound; this.applySettings(); return true;
      }
      if (inRect(p,this.vibrationSettingRect())) {
        this.settings.vibration=!this.settings.vibration; this.applySettings(); return true;
      }
      if (inRect(p,this.settingsGearRect())) { this.setSettingsOpen(false); return true; }
      if (!inRect(p,this.settingsPanelRect())) this.setSettingsOpen(false);
      return true;
    }
    if (inRect(p,this.settingsGearRect())) { this.setSettingsOpen(true); return true; }
    return false;
  }

  private layoutSettings(): void {
    this.settingsButton.active=!this.finish;
    this.drawSettingsButton();
    this.updateSettingsPanel();
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
      label(this.overlay,'Confirm',this.modal === 'timeout' ? '再装一次' : '重新装车',32,0,this.height/2-r.y-r.h/2).color=cream;
      if (this.modal === 'restart') label(this.overlay,'Cancel','取消',28,0,this.height/2-r.y-160).color=cream;
    }
  }
  private confirmRect(): Rect { return {x:225,y:this.height/2+20,w:300,h:120}; }

  private sync(): void {
    this.layoutTray();
    const active = new Set(this.session.pieces.map(piece => piece.id));
    for (const piece of this.allPieces) {
      const visible = active.has(piece.id), view = this.pieces.get(piece.id)!;
      view.node.active = visible;
      if (visible) this.renderPiece(piece);
    }
    this.clearPreview(); this.updateTrayState(); this.updateControls();
  }
  private remainingPieces(): readonly PieceDef[] {
    return this.session.pieces.filter(piece => !this.session.placements.some(placement => placement.pieceId === piece.id));
  }
  private layoutTray(): void {
    const tray = trayLayout(this.remainingPieces(),this.tray,piece => this.session.rotationFor(piece.id));
    this.slots = tray.slots; this.trayCell = tray.cell;
    this.trayContentWidth = tray.contentWidth; this.trayScrollMax = tray.maxScroll;
    this.trayScrollX = Math.max(0,Math.min(this.trayScrollX,this.trayScrollMax));
  }
  private updateTrayState(): void {
    const show=this.remainingPieces().length === 0 && this.level.mode !== 'mom';
    this.trayEmpty.active=show;
    if (!show) return;
    const g=this.trayEmptyArt; g.clear();
    const cx=0,cy=this.tray.y+this.tray.h/2;
    const left=-this.tray.w/2;
    fill(g,new Color(255,241,205,20),left+30,this.height/2-(this.tray.y+this.tray.h-34),this.tray.w-60,this.tray.h-68,26);
    for (const x of [left+66,left+this.tray.w-66]) {
      fill(g,new Color(255,218,153,85),x-12,this.height/2-(cy+5),24,2,1);
      fill(g,new Color(255,218,153,85),x-12,this.height/2-(cy-5),24,2,1);
    }
    g.fillColor=new Color(255,218,153,80); g.circle(cx,this.height/2-(cy-42),64); g.fill();
    g.fillColor=gold; g.circle(cx,this.height/2-(cy-42),55); g.fill();
    g.fillColor=new Color(173,38,43); g.circle(cx,this.height/2-(cy-42),47); g.fill();
    g.strokeColor=cream; g.lineWidth=8;
    g.moveTo(cx-21,this.height/2-(cy-42)); g.lineTo(cx-6,this.height/2-(cy-27));
    g.lineTo(cx+24,this.height/2-(cy-63)); g.stroke();
    fill(g,gold,left+42,this.height/2-(cy+78),80,3,1);
    fill(g,gold,left+this.tray.w-122,this.height/2-(cy+78),80,3,1);
    const titleY=cy+35,hintY=cy+77;
    this.trayEmptyTitle.node.setPosition(0,this.height/2-titleY);
    this.trayEmptyHint.node.setPosition(0,this.height/2-hintY);
  }
  private renderPiece(piece: PieceDef): void {
    const view = this.pieces.get(piece.id)!;
    Tween.stopAllByTarget(view.node); view.node.angle=0; view.node.setScale(1,1,1);
    const placement = this.session.placements.find(p => p.pieceId === piece.id);
    const rotation = this.session.rotationFor(piece.id);
    const size = placement ? this.cell : this.trayCell;
    const box = dimensions(piece,rotation);
    const slot = this.slots.find(s => s.piece.id === piece.id)?.rect;
    const rect = placement ? {x:this.board.x+placement.x*size,y:this.board.y+placement.y*size,w:box.w*size,h:box.h*size} :
      {x:(slot?.x ?? this.tray.x)-this.trayScrollX+((slot?.w ?? this.tray.w)-box.w*size)/2,
       y:(slot?.y ?? this.tray.y)+((slot?.h ?? this.tray.h)-box.h*size)/2,w:box.w*size,h:box.h*size};
    view.rect=rect; view.rotation=rotation; view.size=size;
    this.drawPiece(piece,rotation,size,false);
    this.position(view,rect.x+rect.w/2,rect.y+rect.h/2);
    view.node.active=!!placement ||
      (rect.x >= this.tray.x-0.5 && rect.x+rect.w <= this.tray.x+this.tray.w+0.5);
  }
  private position(view: PieceView,x: number,y: number): void { view.node.setPosition(x-375,this.height/2-y); }
  private bounceCountdown(): void {
    Tween.stopAllByTarget(this.clock.node);
    this.clock.node.setScale(1,1,1);
    tween(this.clock.node).to(.07,{scale:new Vec3(1.14,1.14,1)})
      .to(.13,{scale:new Vec3(1,1,1)}).start();
  }
  private vibrate(ms: number): void {
    if (!this.settings.vibration || !ms) return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try { navigator.vibrate(ms); } catch { /* Unsupported device: silent. */ }
  }
  private drawPiece(piece: PieceDef,rotation: Rotation,size: number,held: boolean,failed = false): void {
    const view = this.pieces.get(piece.id)!;
    view.rotation=rotation; view.size=size; view.held=held; view.failed=failed;
    const g=view.graphics; g.clear();
    const box=dimensions(piece,rotation), w=box.w*size,h=box.h*size;
    view.node.getComponent(UITransform)!.setContentSize(w,h);
    const chosen=this.selected?.id === piece.id;
    if (this.drawPieceArt(piece,view,rotation,size,w,h,held,failed,chosen)) return;
    view.sprite.enabled=false; view.shadow.enabled=false; view.title.node.active=true;
    const tone=itemTone(piece);
    const bodyColor=failed ? new Color(172,35,37) : tone.base;
    const outline=failed ? new Color(92,20,22) : tone.edge;
    const cells=pieceCells(piece,rotation);
    const cellRect=([x,y]: readonly [number,number]) => ({
      x:x*size-w/2,y:h/2-(y+1)*size,
    });
    for (const cell of cells) {
      const r=cellRect(cell);
      if (held) fill(g,shadow,r.x+8,r.y-9,size-3,size-3,5);
      fill(g,bodyColor,r.x,r.y,size+1,size+1);
    }
    g.strokeColor=chosen ? gold : outline;
    g.lineWidth=Math.max(3,Math.min(6,size*.075));
    const occupied=new Set(cells.map(([x,y]) => `${x},${y}`));
    for (const [x,y] of cells) {
      const r=cellRect([x,y]);
      if (!occupied.has(`${x},${y-1}`)) { g.moveTo(r.x,r.y+size); g.lineTo(r.x+size,r.y+size); }
      if (!occupied.has(`${x},${y+1}`)) { g.moveTo(r.x,r.y); g.lineTo(r.x+size,r.y); }
      if (!occupied.has(`${x-1},${y}`)) { g.moveTo(r.x,r.y); g.lineTo(r.x,r.y+size); }
      if (!occupied.has(`${x+1},${y}`)) { g.moveTo(r.x+size,r.y); g.lineTo(r.x+size,r.y+size); }
    }
    g.stroke();
    g.strokeColor=chosen ? new Color(255,244,198,180) : tone.light;
    g.lineWidth=Math.max(1,Math.min(2,size*.022));
    for (const [x,y] of cells) {
      if (occupied.has(`${x},${y-1}`)) continue;
      const r=cellRect([x,y]);
      g.moveTo(r.x+4,r.y+size-4); g.lineTo(r.x+size-4,r.y+size-4);
    }
    g.stroke();
    view.title.string=itemShortName(piece);
    view.title.fontSize=Math.max(13,Math.min(22,size*.38)); view.title.color=cream;
    view.title.lineHeight=view.title.fontSize+4;
    const labelW=Math.min(w-8,Math.max(32,view.title.string.length*(view.title.fontSize-1)+16));
    const labelH=view.title.fontSize+6, labelY=-h/2+labelH/2+3;
    const centers=cells.map(([x,y]) => ({x:x*size-w/2+size/2,y:h/2-(y+.5)*size}));
    const anchorX=centers.reduce((sum,p) => sum+p.x,0)/centers.length;
    const anchorY=centers.reduce((sum,p) => sum+p.y,0)/centers.length;
    const roomTop=h/2-4, roomBottom=labelY+labelH/2+3;
    const featureHalf=Math.min(size*.55,Math.max(6,(roomTop-roomBottom)*.48));
    const featureY=Math.max(roomBottom+featureHalf,Math.min(roomTop-featureHalf,anchorY));
    view.feature.clear();
    view.featureNode.setPosition(anchorX,featureY);
    drawItemFeature(view.feature,piece,size,w,h,labelH,tone);
    fill(g,new Color(30,24,28,228),-labelW/2,labelY-labelH/2,labelW,labelH,Math.min(10,labelH/2));
    fill(g,new Color(255,214,145,210),-labelW/2,labelY-labelH/2,labelW,2,1);
    view.title.node.setPosition(0,labelY);
  }

  // Real item art: one Sprite per piece, rotated as a whole (art is drawn for rotation 0).
  // Until the frame is available the coloured-cell fallback is drawn instead.
  private drawPieceArt(piece: PieceDef,view: PieceView,rotation: Rotation,size: number,w: number,h: number,held: boolean,failed: boolean,chosen: boolean): boolean {
    const key=itemKey(piece);
    const frame=this.itemFrames.get(key);
    if (!frame) {
      if (!this.itemFrames.has(key)) {
        this.itemFrames.set(key,undefined);
        void loadArt(`items/${key}`).then(loaded => {
          if (!loaded || !this.node.isValid) return;
          this.itemFrames.set(key,loaded);
          for (const other of this.allPieces) if (itemKey(other) === key) {
            const pv=this.pieces.get(other.id)!;
            if (pv.size) this.drawPiece(other,pv.rotation,pv.size,pv.held,pv.failed);
          }
        });
      }
      return false;
    }
    const g=view.graphics;
    const base=dimensions(piece,0);
    const fitted={w:base.w*size*ITEM_OVERSCAN,h:base.h*size*ITEM_OVERSCAN};
    const placed=!held && this.session.placements.some(p => p.pieceId === piece.id);
    // Soft glow under the occupied cells shows selection / pickup without hiding the art.
    for (const [x,y] of pieceCells(piece,rotation)) {
      const cx=x*size-w/2, cy=h/2-(y+1)*size;
      if (held) fill(g,shadow,cx+8,cy-9,size-3,size-3,Math.max(6,size*.18));
      if (chosen || held) fill(g,new Color(255,214,120,held ? 70 : 95),cx+1,cy+1,size-2,size-2,Math.max(6,size*.18));
      if (failed) fill(g,new Color(220,40,40,90),cx+1,cy+1,size-2,size-2,Math.max(6,size*.18));
    }
    const sn=view.sprite.node;
    sn.getComponent(UITransform)!.setContentSize(fitted.w,fitted.h);
    sn.angle=90*rotation; sn.setPosition(0,0);
    const artScale=itemScale(piece);
    sn.setScale(artScale.x,artScale.y,1);
    const shadowNode=view.shadow.node;
    shadowNode.getComponent(UITransform)!.setContentSize(fitted.w,fitted.h);
    shadowNode.angle=90*rotation; shadowNode.setPosition(4,-6);
    shadowNode.setScale(artScale.x,artScale.y,1);
    view.shadow.spriteFrame=frame;
    view.shadow.color=new Color(18,12,16,80);
    view.shadow.enabled=placed;
    view.sprite.spriteFrame=frame; view.sprite.enabled=true;
    view.sprite.color=failed ? new Color(255,150,150) : Color.WHITE;
    view.title.node.active=false;
    // The fallback card's emblem lives on its own Graphics; drop it once the real picture shows.
    view.feature.clear();
    return true;
  }

  private point(event: EventTouch): Point {
    const p=event.getUILocation();
    this.touchWorld.set(p.x,p.y,0);
    const local=this.node.getComponent(UITransform)!.convertToNodeSpaceAR(this.touchWorld,this.touchLocal);
    this.touchPoint.x=local.x+375; this.touchPoint.y=this.height/2-local.y;
    return this.touchPoint;
  }
  private start(event: EventTouch): void {
    this.dismissGuide();
    const p=this.point(event);
    if (this.finish) {
      if (!this.finish.state.buttons) this.finishView!.render(this.finish.skip());
      else if (!this.landscape) this.finishView!.press(p.x,p.y);
      return;
    }
    if (this.landscape) return;
    if (this.mom) return;
    if (this.modal) {
      if (inRect(p,this.confirmRect())) {
        this.modal=undefined; this.restartStage();
      } else if (this.modal === 'restart' && p.y > this.confirmRect().y+130) { this.modal=undefined; this.updateOverlay(); }
      return;
    }
    if (this.cleared || this.session.expired) return;
    const button=this.buttons.find(b => inRect(p,b.rect));
    if (button) { if (!this.drag.active || (button.duringDrag && this.drag.active.mode === 'drag')) button.action(); return; }
    if (this.drag.active) return;
    if (this.handleSettingsTap(p)) return;
    // The entire grid bounding region includes the gaps between occupied cells.
    const piece=this.session.pieces.slice().reverse().find(piece => {
      const view=this.pieces.get(piece.id)!;
      return view.node.active && inRect(p,view.rect);
    });
    if (piece && this.selected && piece.id !== this.selected.id) {
      const old=this.selected; this.selected=undefined; this.renderPiece(old); this.updateControls();
    }
    const id=event.getID() ?? 0,fromTray=inRect(p,this.tray);
    if (fromTray && this.trayScrollMax > 0) this.trayPan={id,startX:p.x,startY:p.y,startScroll:this.trayScrollX,active:false};
    this.drag.begin({id,start:p,time:this.now(),piece,fromTray,
      rotation:piece ? this.session.rotationFor(piece.id) : 0,offset:{x:0,y:0}});
  }
  private move(event: EventTouch): void {
    const id=event.getID() ?? 0,p=this.point(event),pan=this.trayPan;
    if (pan && pan.id === id) {
      const dx=p.x-pan.startX,dy=p.y-pan.startY;
      if (!pan.active && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)*1.25) {
        pan.active=true;
        this.drag.cancel(id);
        this.selected=undefined;
      }
      if (pan.active) {
        this.trayScrollX=Math.max(0,Math.min(pan.startScroll-dx,this.trayScrollMax));
        this.sync();
        return;
      }
      if (Math.abs(dy) > 8) this.trayPan=undefined;
    }
    const previous=this.drag.active?.mode;
    const gesture=this.drag.move(id,p);
    if (!gesture || gesture.mode !== 'drag' || !gesture.piece) return;
    if (previous !== 'drag') {
      this.sounds.play('pickup');
      this.vibrate(10);
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
      this.sounds.play('rotate');
      Tween.stopAllByTarget(v.node); v.node.angle=0;
      this.drawPiece(piece,this.drag.active!.rotation,this.cell,true);
      this.previewX=NaN; this.updateHeld(this.drag.active!);
      tween(v.node).set({angle:90}).to(.12,{angle:0}).start();
    } else if (this.session.rotatePiece(piece.id)) {
      this.sounds.play('rotate');
      this.renderPiece(piece); tween(v.node).set({angle:90}).to(.12,{angle:0}).start();
    } else {
      this.sounds.play('invalid');
      this.drawPiece(piece,v.rotation,v.size,false,true);
      tween(v.node).by(.05,{position:new Vec3(-8,0,0)}).by(.05,{position:new Vec3(16,0,0)})
        .by(.05,{position:new Vec3(-16,0,0)}).by(.05,{position:new Vec3(8,0,0)}).call(() => this.renderPiece(piece)).start();
    }
  }
  private end(event: EventTouch): void {
    const id=event.getID() ?? 0,pan=this.trayPan;
    this.trayPan=undefined;
    if (pan?.active) { this.drag.cancel(id); return; }
    const released=this.drag.release(id,this.point(event),this.now());
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
    if (!v.held) { this.sounds.play('pickup'); this.vibrate(10); }
    this.selected=g.piece; this.drawPiece(g.piece,g.rotation,this.cell,true); v.node.setScale(1.05,1.05,1);
    this.updateHeld(g);
    let accepted=false,placed=false;
    if (inRect(g.current,this.tray)) {
      if (!g.fromTray) { this.session.returnToTray(g.piece.id,g.rotation); accepted=true; }
    } else if (this.previewPlacement) { accepted=this.session.drop(this.previewPlacement); placed=accepted; }
    this.sounds.play(accepted ? 'drop' : 'invalid');
    if (placed) this.vibrate(20);
    if (accepted && this.level.mode === 'mom') this.layoutTray();
    const from=v.node.position.clone();
    this.renderPiece(g.piece);
    const destination=v.node.position.clone();
    if (accepted) {
      tween(v.node).to(.08,{scale:new Vec3(1.04,1.04,1)}).to(.16,{scale:new Vec3(1,1,1)}).start();
    } else {
      v.node.setPosition(from);
      const returnScale=this.cell/v.size*1.05;
      v.node.setScale(returnScale,returnScale,1);
      tween(v.node).to(.18,{position:destination,scale:new Vec3(1,1,1)},{easing:'quadOut'}).start();
    }
    this.clearPreview(); this.updateControls();
    if (this.session.readyForNextBatch) this.startMomSequence();
    else if (this.session.solved && !this.cleared) this.beginFinish();
  }
  private beginFinish(): void {
    this.cleared=true; this.selected=undefined;
    this.dismissGuide();
    this.setSettingsOpen(false); this.settingsButton.active=false;
    this.momIntro.node.active=false; this.momLayer.active=false;
    this.momIntroBubble.active=false;
    this.finishStarted=this.now();
    this.finish=new FinishPlayback(cue => {
      this.sounds.play(cue.sound);
      this.vibrate(cue.vibration);
    });
    this.finishView=new FinishView(this.node,this.level.stage,this.onClear);
    this.finishView.layout(this.height,this.board);
    this.finishView.render(this.finish.state);
  }

  private startMomSequence(): void {
    if (this.mom || this.cleared || !this.session.readyForNextBatch) return;
    this.cancelDrag();
    this.selected=undefined;
    this.momIntro.node.active=false;
    this.momIntroBubble.active=false;
    this.momIntroUntil=0;
    this.mom={started:this.now(),appended:false};
    this.momLayer.active=true;
    this.momBubble.string='等等！还有这个！';
    this.momAvatar.setPosition(520,this.height/2-795);
    tween(this.momAvatar).to(.24,{position:new Vec3(300,this.height/2-795,0)},{easing:'quadOut'}).start();
    this.updateControls();
  }

  private updateMomSequence(): void {
    if (!this.mom) return;
    const elapsed=this.now()-this.mom.started;
    if (!this.mom.appended && elapsed >= MOM_APPEAR_MS) {
      const previous=new Set(this.session.pieces.map(piece => piece.id));
      if (this.session.appendNextBatch()) {
        const added=this.session.pieces.filter(piece => !previous.has(piece.id));
        this.sync();
        for (const piece of added) {
          const view=this.pieces.get(piece.id)!;
          const destination=view.node.position.clone();
          view.node.setPosition(destination.x,destination.y+280,destination.z);
          Tween.stopAllByTarget(view.node);
          tween(view.node).to(.3,{position:destination},{easing:'bounceOut'}).start();
        }
        this.sounds.play('mom');
        this.updateControls();
      }
      this.mom.appended=true;
    }
    if (this.mom.appended && elapsed >= MOM_APPEAR_MS+MOM_STAY_MS) {
      this.mom=undefined;
      this.momLayer.active=false;
      this.sync();
    }
  }

  private restartStage(): void {
    this.session.restart();
    this.selected=undefined; this.cleared=false; this.modal=undefined;
    this.setSettingsOpen(false); this.settingsButton.active=true;
    Tween.stopAllByTarget(this.clock.node); this.clock.node.setScale(1,1,1);
    this.displayedSeconds=-1;
    const frame=countdownFrame(this.session.remainingSeconds,-1);
    this.clock.string=frame.label; this.clock.color=frame.warning ? new Color(255,92,76) : gold;
    this.mom=undefined; this.momLayer.active=false;
    this.momIntroUntil=this.level.mode === 'mom' ? this.now()+MOM_INTRO_MS : 0;
    this.sync(); this.updateOverlay();
    this.guidePlacement=undefined; this.guideFrom=undefined; this.guideTo=undefined;
    if (this.canShowGuide()) this.prepareGuideRoute();
  }
  private cancelDrag(): void { this.trayPan=undefined; if (this.drag.cancel()) this.sync(); }
  private cancel(event: EventTouch): void { this.trayPan=undefined; if (this.drag.cancel(event.getID() ?? 0)) this.sync(); }
}
