import { Color, Graphics, Label, Node, Sprite, UITransform, Vec3, view } from 'cc';
import { GAME_SUBTITLE, GAME_TITLE } from '../config/brand';
import { STACK_BODY_HOLE, STACK_BODY_SIZE } from '../core/stack/stack-layout';
import { STACK_CARGO_POSITIONS, STACK_SHARE_ITEM_KEYS } from '../core/stack/stack-share';
import { loadArt } from '../services/OptionalResources';
import { fill, label, uiNode } from '../ui/UIKit';

const red = new Color(184, 29, 42);
const deepRed = new Color(84, 18, 27);
const wine = new Color(57, 12, 22, 232);
const gold = new Color(255, 205, 105);
const paleGold = new Color(255, 232, 177);
const cream = new Color(255, 246, 229);
const ink = new Color(75, 28, 20);
const shadowInk = new Color(49, 8, 14, 180);

const CAR_WIDTH = 700;
const CAR_HEIGHT = 438;
const START_WIDTH = 600;
const START_HEIGHT = 88;
const CLASSIC_WIDTH = 360;
const CLASSIC_HEIGHT = 66;

interface HomeButtonRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface HomePageActions {
  readonly onStart: () => void;
  readonly onClassic: () => void;
}

interface HomeButtonPoint {
  readonly key: 'start' | 'classic';
  readonly screenX: number;
  readonly screenY: number;
  readonly screenLeft: number;
  readonly screenRight: number;
  readonly screenTop: number;
  readonly screenBottom: number;
  readonly screenW: number;
  readonly screenH: number;
}

/** Code-built title screen. The night scene, red-gold chrome and packed car preview the match-three game. */
export class HomePage {
  readonly node: Node;
  private readonly background: Sprite;
  private readonly chrome: Graphics;
  private readonly title: Label;
  private readonly titleShadow: Label;
  private readonly subtitle: Label;
  private readonly eyebrow: Label;
  private readonly cargoTag: Label;
  private readonly ruleLineOne: Label;
  private readonly ruleLineTwo: Label;
  private readonly startLabel: Label;
  private readonly classicLabel: Label;
  private readonly startNode: Node;
  private readonly classicNode: Node;
  private readonly car: Node;
  private readonly carFallback: Graphics;
  private readonly trunkImage: Sprite;
  private readonly bodyImage: Sprite;
  private readonly cargo: Node;
  private readonly cargoSprites: Sprite[] = [];
  private readonly touchWorld = new Vec3();
  private readonly touchLocal = new Vec3();
  private readonly debugHook: object;
  private startRect: HomeButtonRect = {x:75,y:0,w:START_WIDTH,h:START_HEIGHT};
  private classicRect: HomeButtonRect = {x:195,y:0,w:CLASSIC_WIDTH,h:CLASSIC_HEIGHT};
  private width = 750;
  private height = 1334;
  private layoutWidth = -1;
  private layoutHeight = -1;
  private hole = {x:0,y:0,w:CAR_WIDTH,h:CAR_HEIGHT};
  private carTop = 400;

  constructor(
    parent: Node,
    private readonly actions: HomePageActions,
  ) {
    this.node = uiNode('HomePage', parent, 750, 1334);
    this.background = uiNode('HomeNight', this.node, 750, 1334).addComponent(Sprite);
    this.background.sizeMode = Sprite.SizeMode.CUSTOM;
    this.background.trim = false;
    this.background.enabled = false;
    void loadArt('ui/bg_night').then(frame => {
      if (!frame || !this.node.isValid) return;
      this.background.spriteFrame = frame;
      this.background.enabled = true;
      this.layoutBackground();
    });
    this.chrome = uiNode('HomeChrome', this.node, 750, 1334).addComponent(Graphics);

    this.car = uiNode('PackedCar', this.node, CAR_WIDTH, CAR_HEIGHT);
    this.carFallback = uiNode('CarFallback', this.car, CAR_WIDTH, CAR_HEIGHT).addComponent(Graphics);
    this.trunkImage = this.imageNode('TrunkWell', this.car);
    this.cargo = uiNode('HomeCargo', this.car, CAR_WIDTH, CAR_HEIGHT);
    for (let index = 0; index < STACK_SHARE_ITEM_KEYS.length; index++) {
      this.cargoSprites.push(this.imageNode(`CargoItem${index}`, this.cargo));
    }
    this.bodyImage = this.imageNode('CarBody', this.car);
    void Promise.all([
      loadArt('vehicles/sedan_v1_body'),
      loadArt('vehicles/sedan_v1_trunk'),
    ]).then(([body, trunk]) => {
      if (!this.node.isValid) return;
      if (trunk) { this.trunkImage.spriteFrame = trunk; this.trunkImage.enabled = true; }
      if (body) {
        this.bodyImage.spriteFrame = body;
        this.bodyImage.enabled = true;
        this.carFallback.enabled = false;
      }
      this.layoutCar();
    });
    void Promise.all(STACK_SHARE_ITEM_KEYS.map(key => loadArt(`items/${key}`))).then(frames => {
      if (!this.node.isValid) return;
      for (let index = 0; index < frames.length && index < this.cargoSprites.length; index++) {
        const frame = frames[index];
        if (!frame) continue;
        this.cargoSprites[index].spriteFrame = frame;
        this.cargoSprites[index].enabled = true;
      }
      this.layoutCar();
    });

    this.eyebrow = label(this.node, 'Eyebrow', '春运 · 年货专列', 22, 0, 0);
    this.eyebrow.color = paleGold;
    this.titleShadow = label(this.node, 'TitleShadow', `《${GAME_TITLE}》`, 82, 0, 0);
    this.titleShadow.color = shadowInk;
    this.title = label(this.node, 'Title', `《${GAME_TITLE}》`, 82, 0, 0);
    this.title.color = gold;
    this.subtitle = label(this.node, 'Subtitle', GAME_SUBTITLE, 28, 0, 0);
    this.subtitle.color = cream;
    this.cargoTag = label(this.node, 'CargoTag', '后备箱已清空，等你装满', 23, 0, 0);
    this.cargoTag.color = paleGold;
    this.ruleLineOne = label(this.node, 'RuleOne', '点没被压住的年货，凑齐 3 件同款就打包装车', 22, 0, 0);
    this.ruleLineOne.color = cream;
    this.ruleLineTwo = label(this.node, 'RuleTwo', '7 格塞满就失败', 20, 0, 0);
    this.ruleLineTwo.color = paleGold;

    this.startNode = uiNode('HomeStart', this.node, START_WIDTH, START_HEIGHT);
    this.startLabel = label(this.startNode, 'HomeStartText', '开始装车', 34, 0, 0);
    this.startLabel.color = ink;
    this.classicNode = uiNode('HomeClassic', this.node, CLASSIC_WIDTH, CLASSIC_HEIGHT);
    this.classicLabel = label(this.classicNode, 'HomeClassicText', '经典装箱玩法', 24, 0, 0);
    this.classicLabel.color = paleGold;

    this.node.on(Node.EventType.TOUCH_END, this.touch, this);
    this.debugHook = Object.freeze({
      getButtons: () => this.debugButtons(),
      getLayout: () => ({viewport:{width:this.screenWidth(),height:this.screenHeight()},height:this.height}),
    });
    if (typeof window !== 'undefined') {
      (window as Window & {__home?: object}).__home = this.debugHook;
    }
    this.node.once(Node.EventType.NODE_DESTROYED, () => {
      if (typeof window !== 'undefined' && (window as Window & {__home?: object}).__home === this.debugHook) {
        delete (window as Window & {__home?: object}).__home;
      }
    });
    this.tick();
  }

  tick(): void {
    const size = view.getVisibleSize();
    if (size.width !== this.layoutWidth || size.height !== this.layoutHeight) {
      this.layoutWidth = size.width;
      this.layoutHeight = size.height;
      this.height = size.height > 0 && size.width > 0
        ? Math.max(1334, size.height / size.width * 750)
        : 1334;
      const scale = Math.min(size.width / 750, size.height / this.height);
      this.node.setScale(scale, scale, 1);
      this.node.getComponent(UITransform)!.setContentSize(750, this.height);
      this.layout();
    }
  }

  private layout(): void {
    this.layoutBackground();
    this.eyebrow.node.setPosition(0, this.height / 2 - 80);
    this.titleShadow.node.setPosition(4, this.height / 2 - 165);
    this.title.node.setPosition(0, this.height / 2 - 160);
    this.subtitle.node.setPosition(0, this.height / 2 - 296);

    this.carTop = Math.round(Math.max(398, Math.min(this.height - 842, this.height * .30)));
    this.car.setPosition(0, this.height / 2 - (this.carTop + CAR_HEIGHT / 2));
    this.cargoTag.node.setPosition(0, this.height / 2 - (this.carTop + CAR_HEIGHT + 56));
    this.layoutCar();

    const rulesY = Math.round(this.height * .70);
    this.ruleLineOne.node.setPosition(0, this.height / 2 - rulesY);
    this.ruleLineTwo.node.setPosition(0, this.height / 2 - rulesY - 42);

    const startY = this.height - 272;
    this.startRect = {x:(750 - START_WIDTH) / 2, y:startY, w:START_WIDTH, h:START_HEIGHT};
    this.startNode.setPosition(0, this.height / 2 - (startY + START_HEIGHT / 2));
    const classicY = this.height - 158;
    this.classicRect = {x:(750 - CLASSIC_WIDTH) / 2, y:classicY, w:CLASSIC_WIDTH, h:CLASSIC_HEIGHT};
    this.classicNode.setPosition(0, this.height / 2 - (classicY + CLASSIC_HEIGHT / 2));

    this.drawChrome(rulesY);
  }

  private layoutBackground(): void {
    const scale = Math.max(1, this.height / 1334);
    this.background.node.getComponent(UITransform)!.setContentSize(750 * scale, 1334 * scale);
    this.background.node.setPosition(0, 0);
  }

  private drawChrome(rulesY: number): void {
    const g = this.chrome;
    g.clear();
    const top = this.height / 2;
    const left = -375;
    const rect = (color: Color, x: number, y: number, w: number, h: number, radius = 0) => {
      fill(g, color, left + x, top - y - h, w, h, radius);
    };

    rect(new Color(10, 8, 22, 84), 0, 0, 750, this.height);
    rect(new Color(28, 10, 20, 64), 0, this.height - 410, 750, 410, 0);
    rect(new Color(28, 7, 13, 150), 34, 40, 682, 310, 34);
    rect(new Color(94, 22, 29, 238), 40, 44, 670, 304, 32);
    rect(gold, 48, 52, 654, 288, 27);
    rect(red, 56, 60, 638, 272, 22);
    rect(new Color(224, 56, 48), 68, 72, 614, 248, 18);
    rect(new Color(255, 229, 164, 150), 126, 224, 498, 2, 1);
    rect(gold, 292, 250, 166, 3, 1);

    rect(new Color(48, 12, 23, 186), 54, rulesY - 34, 642, 106, 26);
    rect(new Color(255, 211, 117, 42), 62, rulesY - 26, 626, 90, 22);
    g.strokeColor = new Color(255, 205, 105, 130);
    g.lineWidth = 2;
    g.roundRect(left + 56, top - (rulesY - 32) - 102, 638, 102, 24);
    g.stroke();

    const start = this.startRect;
    rect(new Color(26, 8, 13, 150), start.x + 5, start.y + 10, start.w, start.h, 28);
    rect(new Color(111, 45, 18), start.x, start.y, start.w, start.h, 28);
    rect(gold, start.x + 4, start.y + 4, start.w - 8, start.h - 8, 24);
    rect(new Color(255, 193, 72), start.x + 12, start.y + 12, start.w - 24, start.h - 24, 19);
    rect(new Color(255, 227, 143, 150), start.x + 28, start.y + 18, start.w - 56, 8, 4);

    const classic = this.classicRect;
    rect(new Color(53, 10, 19, 196), classic.x, classic.y, classic.w, classic.h, 22);
    g.strokeColor = gold;
    g.lineWidth = 2;
    g.roundRect(left + classic.x + 2, top - (classic.y + classic.h) + 2, classic.w - 4, classic.h - 4, 20);
    g.stroke();
    rect(new Color(255, 214, 126, 160), classic.x + 92, classic.y + classic.h - 11, classic.w - 184, 2, 1);

    this.drawCarFallback();
  }

  private layoutCar(): void {
    const trunkW = CAR_WIDTH;
    const trunkH = CAR_HEIGHT;
    const holeX = Math.round((STACK_BODY_HOLE.left + STACK_BODY_HOLE.right) / 2 / 1024 * trunkW - trunkW / 2);
    const holeY = Math.round((STACK_BODY_HOLE.top + STACK_BODY_HOLE.bottom) / 2 / 640 * trunkH - trunkH / 2);
    const holeW = Math.round((STACK_BODY_HOLE.right - STACK_BODY_HOLE.left) / 1024 * trunkW);
    const holeH = Math.round((STACK_BODY_HOLE.bottom - STACK_BODY_HOLE.top) / 640 * trunkH);
    this.hole = {x:holeX, y:holeY, w:holeW, h:holeH};
    this.show(this.bodyImage, 0, 0, CAR_WIDTH, CAR_HEIGHT);
    this.show(this.trunkImage, 0, holeY, holeW, holeH);
    const max = Math.min(holeW * .26, holeH * .55, 168);
    for (let index = 0; index < this.cargoSprites.length && index < STACK_CARGO_POSITIONS.length; index++) {
      const sprite = this.cargoSprites[index];
      const frame = sprite.spriteFrame;
      if (!frame) continue;
      const [px, py, angle] = STACK_CARGO_POSITIONS[index];
      const ratio = frame.rect.width / Math.max(1, frame.rect.height);
      const width = ratio >= 1 ? max : max * ratio;
      const height = ratio >= 1 ? max / ratio : max;
      sprite.node.getComponent(UITransform)!.setContentSize(width, height);
      sprite.node.setPosition(holeX + (px - .5) * holeW, holeY + (.45 - py * .64) * holeH);
      sprite.node.angle = -angle * 180 / Math.PI;
      sprite.enabled = true;
    }
  }

  private drawCarFallback(): void {
    const g = this.carFallback;
    g.clear();
    fill(g, new Color(16, 10, 21, 105), -340, -230, 680, 460, 56);
    fill(g, new Color(111, 18, 30), -350, -216, 700, 438, 62);
    fill(g, red, -337, -205, 674, 418, 56);
    fill(g, new Color(42, 18, 25), -270, -100, 540, 248, 40);
    fill(g, deepRed, -278, -214, 556, 92, 24);
    fill(g, new Color(255, 206, 112), -102, -186, 204, 44, 12);
    fill(g, new Color(255, 139, 58, 210), -300, -126, 74, 44, 14);
    fill(g, new Color(255, 139, 58, 210), 226, -126, 74, 44, 14);
    fill(g, new Color(20, 15, 20), -295, -222, 590, 28, 12);
  }

  private touch(event: {getUILocation(): {x:number;y:number}}): void {
    const point = this.point(event);
    if (contains(this.startRect, point.x, point.y)) {
      this.actions.onStart();
      return;
    }
    if (contains(this.classicRect, point.x, point.y)) {
      this.actions.onClassic();
    }
  }

  private point(event: {getUILocation(): {x:number;y:number}}): {x:number;y:number} {
    const p = event.getUILocation();
    this.touchWorld.set(p.x, p.y, 0);
    const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(this.touchWorld, this.touchLocal);
    return {x:local.x + 375, y:this.height / 2 - local.y};
  }

  private debugButtons(): HomeButtonPoint[] {
    const screenWidth = this.screenWidth();
    const screenHeight = this.screenHeight();
    return (['start', 'classic'] as const).map(key => {
      const rect = key === 'start' ? this.startRect : this.classicRect;
      return {
        key,
        screenX:(rect.x + rect.w / 2) / 750 * screenWidth,
        screenY:(rect.y + rect.h / 2) / this.height * screenHeight,
        screenLeft:rect.x / 750 * screenWidth,
        screenRight:(rect.x + rect.w) / 750 * screenWidth,
        screenTop:rect.y / this.height * screenHeight,
        screenBottom:(rect.y + rect.h) / this.height * screenHeight,
        screenW:rect.w / 750 * screenWidth,
        screenH:rect.h / this.height * screenHeight,
      };
    });
  }

  private screenWidth(): number {
    return typeof window === 'undefined' ? 750 : window.innerWidth;
  }

  private screenHeight(): number {
    return typeof window === 'undefined' ? this.height : window.innerHeight;
  }

  private imageNode(name: string, parent: Node): Sprite {
    const sprite = uiNode(name, parent, 1, 1).addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    sprite.enabled = false;
    return sprite;
  }

  private show(sprite: Sprite, x: number, y: number, width: number, height: number): void {
    sprite.node.getComponent(UITransform)!.setContentSize(width, height);
    sprite.node.setPosition(x, y);
    sprite.enabled = true;
  }
}

function contains(rect: HomeButtonRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
