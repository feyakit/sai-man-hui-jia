import { Color, Graphics, Label, Node, Sprite, UITransform, Vec3, view } from 'cc';
import { loadArt } from '../services/OptionalResources';
import { RankApi } from '../services/RankApi';
import { ProvincePicker } from '../ui/ProvincePicker';
import { fill, label, uiNode } from '../ui/UIKit';
import { browserStorage, homeProgress, isDailyDone, type StackRoute } from '../core/stack/stack-progress';
import { RankPage } from './RankPage';
import { PlateBadge } from '../ui/PlateBadge';
import {
  ART_RECTS, BASE_HEIGHT, CAR_PLATE, COUPLET_ART, COUPLET_RIGHT_ART, LABEL_POINTS, MARKER_ART, ROAD_MILESTONES,
  homeBoxes, homeLayoutSlots, type HomeLayoutSlots, type Rect,
} from '../core/home-layout';

const deepRed = new Color(84, 18, 27);
const gold = new Color(255, 205, 105);
const brightGold = new Color(255, 224, 143);
const paleGold = new Color(255, 232, 177);
const cream = new Color(255, 240, 214);
const ink = new Color(88, 36, 16);

type HomeButtonRect = Rect;
type HomeButtonKey = 'start' | 'classic' | 'province' | 'rank' | 'daily' | 'restart' | 'help';

export interface HomePageActions {
  /** Starts a road level; omitted route means the current/farthest level. */
  readonly onStart: (route?: StackRoute) => void;
  readonly onDaily?: () => void;
  readonly onClassic: () => void;
}

interface HomeButtonPoint {
  readonly key: HomeButtonKey;
  readonly screenX: number;
  readonly screenY: number;
  readonly screenLeft: number;
  readonly screenRight: number;
  readonly screenTop: number;
  readonly screenBottom: number;
  readonly screenW: number;
  readonly screenH: number;
}

/**
 * Poster-style title screen built from pieces cut out of the approved mockup: lantern plaque with the
 * province seal, vertical couplets, the packed red car with the province plate, the winding road home with
 * nine milestones, the ribbon start button and three coin badges. Only the dynamic text is live.
 */
export class HomePage {
  readonly node: Node;
  private readonly background: Sprite;
  private readonly chrome: Graphics;
  private readonly plaqueImage: Sprite;
  private readonly coupletLeftImage: Sprite;
  private readonly coupletRightImage: Sprite;
  private readonly provinceLabel: Label;
  private readonly carImage: Sprite;
  private readonly plate: PlateBadge;
  private readonly roadImage: Sprite;
  private readonly roadMarks: Graphics;
  private readonly carMarkerImage: Sprite;
  private readonly progressLabel: Label;
  private readonly startImage: Sprite;
  private readonly startLabel: Label;
  private readonly restartLabel: Label;
  private readonly helpImage: Sprite;
  private readonly coinImages: Sprite[] = [];
  private readonly coinLabels: Label[] = [];
  private readonly rankApi = new RankApi();
  private provincePicker?: ProvincePicker;
  private rankPage?: RankPage;
  private rulesNode?: Node;
  private readonly touchWorld = new Vec3();
  private readonly touchLocal = new Vec3();
  private readonly debugHook: object;
  private boxes: Record<string, Rect> = homeBoxes(BASE_HEIGHT, false);
  private progressSteps = 0;
  private progressDone = false;
  private slots: HomeLayoutSlots = homeLayoutSlots(BASE_HEIGHT);
  private height = BASE_HEIGHT;
  private layoutWidth = -1;
  private layoutHeight = -1;

  constructor(
    parent: Node,
    private readonly actions: HomePageActions,
  ) {
    this.node = uiNode('HomePage', parent, 750, BASE_HEIGHT);
    this.background = this.imageNode('HomeNight', this.node);
    this.chrome = uiNode('HomePosterChrome', this.node, 750, BASE_HEIGHT).addComponent(Graphics);
    this.plaqueImage = this.imageNode('Plaque', this.node);
    this.coupletLeftImage = this.imageNode('CoupletLeftArt', this.node);
    this.coupletRightImage = this.imageNode('CoupletRightArt', this.node);
    this.carImage = this.imageNode('PackedCar', this.node);
    this.plate = new PlateBadge(this.carImage.node, CAR_PLATE, {w:ART_RECTS.car.w, h:ART_RECTS.car.h});
    this.roadImage = this.imageNode('HomeRoad', this.node);
    this.roadMarks = uiNode('HomeRoadMarks', this.node, 750, BASE_HEIGHT).addComponent(Graphics);
    this.carMarkerImage = this.imageNode('HomeCarMarker', this.node);
    this.startImage = this.imageNode('HomeStart', this.node);
    this.helpImage = this.imageNode('HomeHelp', this.node);
    for (let index = 0; index < 3; index++) this.coinImages.push(this.imageNode(`HomeCoin${index}`, this.node));

    this.provinceLabel = this.textLabel('HomeProvinceText', '选省份', 30, cream, 112, 44);
    this.provinceLabel.isBold = true;
    this.progressLabel = this.textLabel('HomeProgressText', '回家进度 0/9', 21, cream, 140, 30);
    this.restartLabel = this.textLabel('HomeRestart', '从头开始', 21, new Color(255, 226, 180, 215), 120, 28);
    this.restartLabel.enableOutline = true;
    this.restartLabel.outlineColor = deepRed;
    this.restartLabel.outlineWidth = 2;
    this.startLabel = this.textLabel('HomeStartText', '开始装车', 46, ink, 380, 64);
    this.startLabel.isBold = true;
    const daily = isDailyDone(browserStorage()) ? '每日一关 · 已塞满' : '每日一关';
    for (const [index, text] of ['省份排行', daily, '经典装箱'].entries()) {
      this.coinLabels.push(this.textLabel(`HomeCoinLabel${index}`, text, 25, cream, 124, 32));
    }

    const progress = homeProgress(browserStorage());
    this.progressSteps = progress.steps;
    this.progressDone = progress.done;
    this.progressLabel.string = progress.label;
    this.progressLabel.color = progress.done ? brightGold : cream;
    this.startLabel.string = progress.steps > 0 ? `继续回家 · 第${progress.steps}关` : '开始装车';
    this.restartLabel.node.active = progress.steps > 0 || progress.done;
    this.refreshProvinceLabel();

    const art: [Sprite, string][] = [
      [this.background, 'ui/bg_poster'], [this.plaqueImage, 'ui/plaque_poster'],
      [this.coupletLeftImage, 'ui/couplet_left'], [this.coupletRightImage, 'ui/couplet_right'],
      [this.carImage, 'ui/car_poster'], [this.roadImage, 'ui/road_home'], [this.carMarkerImage, 'ui/car_marker'],
      [this.startImage, 'ui/btn_start_poster'], [this.helpImage, 'ui/help_poster'],
      [this.coinImages[0], 'ui/coin_rank'], [this.coinImages[1], 'ui/coin_daily'], [this.coinImages[2], 'ui/coin_classic'],
    ];
    void Promise.all(art.map(([, key]) => loadArt(key))).then(frames => {
      if (!this.node.isValid) return;
      frames.forEach((frame, index) => { if (frame) art[index][0].spriteFrame = frame; });
      this.layout();
    });

    this.node.on(Node.EventType.TOUCH_END, this.touch, this);
    this.debugHook = Object.freeze({
      getButtons: () => this.debugButtons(),
      getLayout: () => ({viewport:{width:this.screenWidth(),height:this.screenHeight()},height:this.height,boxes:{...this.boxes}}),
      getState: () => ({
        province:this.rankApi.province,
        overlay:this.rankPage ? 'rank' : this.provincePicker ? 'province' : this.rulesNode ? 'rules' : null,
        progress:this.progressLabel?.string ?? '',
        plate:this.plate.node.active ? this.plate.text : null,
        seal:this.provinceLabel?.string ?? '',
        start:this.startLabel?.string ?? '',
        rules:this.rulesNode ? '点没被压住的年货，凑齐 3 件同款就打包装车；后备箱塞满就失败' : null,
      }),
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
        ? Math.max(BASE_HEIGHT, size.height / size.width * 750)
        : BASE_HEIGHT;
      const scale = Math.min(size.width / 750, size.height / this.height);
      this.node.setScale(scale, scale, 1);
      this.node.getComponent(UITransform)!.setContentSize(750, this.height);
      this.layout();
    }
  }

  private layout(): void {
    const s = homeLayoutSlots(this.height);
    this.slots = s;
    this.boxes = homeBoxes(this.height, this.restartLabel.node.active);
    const b = this.boxes;
    const at = (r: Rect, dy: number): Rect => ({x:r.x, y:r.y + dy, w:r.w, h:r.h});

    // The scene is 750x1700; it hangs from the top so the sky, moon and lantern street line up with the mockup.
    this.placeSprite(this.background, {x:0, y:0, w:750, h:1700});
    this.placeSprite(this.plaqueImage, at(ART_RECTS.plaque, s.top));
    this.placeCenter(this.provinceLabel.node, LABEL_POINTS.seal.x, LABEL_POINTS.seal.y + s.top);
    this.placeSprite(this.helpImage, at(ART_RECTS.help, s.help));

    this.placeSprite(this.coupletLeftImage, {x:b.coupletLeft.x, y:b.coupletLeft.y, w:COUPLET_ART.w * s.coupletScale, h:COUPLET_ART.h * s.coupletScale});
    this.placeSprite(this.coupletRightImage, {x:b.coupletRight.x, y:b.coupletRight.y, w:COUPLET_RIGHT_ART.w * s.coupletScale, h:COUPLET_RIGHT_ART.h * s.coupletScale});

    const car = at(ART_RECTS.car, s.car);
    this.placeSprite(this.carImage, car);
    this.plate.layout(car.w, car.h);

    const road = at(ART_RECTS.road, s.road);
    this.placeSprite(this.roadImage, road);
    this.layoutCarMarker(road);
    this.placeCenter(this.progressLabel.node, LABEL_POINTS.progress.x, LABEL_POINTS.progress.y + s.road);
    this.placeCenter(this.restartLabel.node, LABEL_POINTS.restart.x, LABEL_POINTS.restart.y + s.road);

    this.placeSprite(this.startImage, at(ART_RECTS.start, s.start));
    this.placeCenter(this.startLabel.node, LABEL_POINTS.start.x, LABEL_POINTS.start.y + s.start);

    for (let index = 0; index < 3; index++) {
      const coin = at(ART_RECTS.coins[index], s.coins);
      this.placeSprite(this.coinImages[index], coin);
      this.placeCenter(this.coinLabels[index].node, coin.x + coin.w / 2, LABEL_POINTS.coinLabelY + s.coins);
    }

    this.drawChrome();
    this.drawRoadMarks(road);
  }

  private drawChrome(): void {
    const g = this.chrome;
    g.clear();
    // Progress tag hanging under the lantern house (mockup: dark red pill, thin gold rim).
    const p = this.boxes.progress;
    const box = (color: Color, x: number, y: number, w: number, h: number, radius: number) => {
      fill(g, color, x - 375, this.height / 2 - y - h, w, h, radius);
    };
    box(new Color(25, 6, 10, 150), p.x + 2, p.y + 3, p.w, p.h, p.h / 2);
    box(new Color(214, 160, 86), p.x, p.y, p.w, p.h, p.h / 2);
    box(new Color(128, 18, 24), p.x + 2, p.y + 2, p.w - 4, p.h - 4, p.h / 2 - 2);
  }

  private drawRoadMarks(road: Rect): void {
    const g = this.roadMarks;
    g.clear();
    const top = this.height / 2;
    // Painted dots are the unlit state; cleared levels get a bright glowing bead on top.
    for (let index = 0; index < ROAD_MILESTONES.length && index < this.progressSteps; index++) {
      const point = ROAD_MILESTONES[index];
      const x = road.x + point.x - 375;
      const y = top - (road.y + point.y);
      g.fillColor = new Color(255, 190, 70, 85);
      g.circle(x, y, 15);
      g.fill();
      g.fillColor = this.progressDone ? brightGold : new Color(255, 196, 64);
      g.circle(x, y, 9);
      g.fill();
      g.strokeColor = new Color(255, 236, 170);
      g.lineWidth = 2;
      g.circle(x, y, 9);
      g.stroke();
      g.fillColor = new Color(255, 252, 230, 220);
      g.circle(x - 3, y + 3, 3);
      g.fill();
    }
  }

  private layoutCarMarker(road: Rect): void {
    if (this.progressSteps === 0) {
      this.placeSprite(this.carMarkerImage, {...MARKER_ART, y:MARKER_ART.y + this.slots.road});
      return;
    }
    const point = ROAD_MILESTONES[Math.min(ROAD_MILESTONES.length - 1, this.progressSteps - 1)];
    const cx = road.x + point.x;
    const cy = road.y + point.y - 22;
    this.placeSprite(this.carMarkerImage, {x:cx - MARKER_ART.w / 2, y:cy - MARKER_ART.h / 2, w:MARKER_ART.w, h:MARKER_ART.h});
  }

  private textLabel(name: string, text: string, size: number, color: Color, w: number, h: number): Label {
    const result = label(this.node, name, text, size, 0, 0);
    result.color = color;
    result.node.getComponent(UITransform)!.setContentSize(w, h);
    result.overflow = Label.Overflow.SHRINK;
    return result;
  }

  private touch(event: {getUILocation(): {x:number;y:number}}): void {
    const point = this.point(event);
    if (this.rulesNode) return;
    if (this.provincePicker) {
      this.provincePicker.press(point.x, point.y);
      return;
    }
    if (this.rankPage) {
      this.rankPage.press(point.x, point.y);
      return;
    }
    if (contains(this.boxes.help, point.x, point.y)) {
      this.openRules();
      return;
    }
    if (contains(this.boxes.seal, point.x, point.y)) {
      this.openProvincePicker();
      return;
    }
    if (contains(this.boxes.rank, point.x, point.y)) {
      this.openRankPage();
      return;
    }
    if (contains(this.boxes.daily, point.x, point.y)) {
      this.actions.onDaily?.();
      return;
    }
    if (contains(this.boxes.classic, point.x, point.y)) {
      this.actions.onClassic();
      return;
    }
    if (this.restartLabel.node.active && contains(this.boxes.restart, point.x, point.y)) {
      this.actions.onStart(1);
      return;
    }
    if (contains(this.boxes.start, point.x, point.y)) {
      this.actions.onStart(this.progressSteps > 0 ? this.progressSteps : 1);
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
    const keys: HomeButtonKey[] = this.restartLabel.node.active
      ? ['start', 'classic', 'province', 'rank', 'daily', 'restart', 'help']
      : ['start', 'classic', 'province', 'rank', 'daily', 'help'];
    return keys.map(key => {
      const rect = this.boxes[key === 'province' ? 'seal' : key];
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

  private openProvincePicker(): void {
    if (this.provincePicker) return;
    this.provincePicker = new ProvincePicker(this.node,this.height,this.rankApi.province,{
      onSelect:(province,city) => {
        this.rankApi.setRegion(province,city);
        this.provincePicker = undefined;
        this.refreshProvinceLabel();
      },
      onCancel:() => { this.provincePicker = undefined; },
    },this.rankApi.city);
  }

  private openRankPage(): void {
    if (this.rankPage) return;
    this.rankPage = new RankPage(this.node,this.height,() => {
      this.rankPage?.node.destroy();
      this.rankPage = undefined;
    },() => this.actions.onStart());
  }

  private openRules(): void {
    if (this.rulesNode) return;
    const node = uiNode('HomeRules', this.node, 750, this.height);
    const g = node.addComponent(Graphics);
    fill(g, new Color(5, 6, 16, 220), -375, -this.height / 2, 750, this.height);
    const panelW = 616;
    const panelH = 386;
    const panelX = (750 - panelW) / 2;
    const panelY = Math.round((this.height - panelH) / 2);
    const box = (color: Color, x: number, y: number, w: number, h: number, radius = 0) => {
      fill(g, color, x - 375, this.height / 2 - y - h, w, h, radius);
    };
    box(new Color(12, 6, 12, 170), panelX + 7, panelY + 10, panelW, panelH, 32);
    box(gold, panelX, panelY, panelW, panelH, 32);
    box(new Color(63, 12, 21), panelX + 6, panelY + 6, panelW - 12, panelH - 12, 27);
    box(new Color(128, 23, 32), panelX + 14, panelY + 14, panelW - 28, panelH - 28, 22);
    box(new Color(255, 223, 146, 56), panelX + 32, panelY + 66, panelW - 64, 2, 1);

    const title = label(node, 'RulesTitle', '玩法说明', 36, 0, this.height / 2 - (panelY + 44));
    title.color = brightGold;
    title.isBold = true;
    title.enableOutline = true;
    title.outlineColor = deepRed;
    title.outlineWidth = 2;

    const body = label(node, 'RulesBody', '点没被压住的年货，凑齐 3 件同款就打包装车；\n后备箱塞满就失败', 24, 0, this.height / 2 - (panelY + 196));
    body.color = cream;
    body.lineHeight = 42;
    body.enableWrapText = true;
    body.overflow = Label.Overflow.RESIZE_HEIGHT;
    body.node.getComponent(UITransform)!.setContentSize(566, 126);

    const closeY = panelY + panelH - 82;
    box(new Color(255, 223, 146, 28), panelX + 194, closeY, 228, 58, 18);
    g.strokeColor = gold;
    g.lineWidth = 2;
    g.roundRect(panelX + 195 - 375, this.height / 2 - (closeY + 57), 226, 56, 17);
    g.stroke();
    const close = label(node, 'RulesClose', '知道了', 24, 0, this.height / 2 - (closeY + 29));
    close.color = paleGold;
    close.isBold = true;

    node.on(Node.EventType.TOUCH_END, () => {
      if (this.rulesNode !== node) return;
      node.destroy();
      this.rulesNode = undefined;
    });
    this.rulesNode = node;
  }

  private refreshProvinceLabel(): void {
    const province = this.rankApi.province;
    const text = this.rankApi.city || province || '选省份';
    this.provinceLabel.string = text;
    // Long names (齐齐哈尔, 黔西南州) shrink so they stay inside the seal.
    this.provinceLabel.fontSize = sealFontSize(text);
    this.provinceLabel.lineHeight = this.provinceLabel.fontSize + 4;
    this.provinceLabel.overflow = Label.Overflow.SHRINK;
    this.plate.refresh();
    if (this.carImage?.spriteFrame) this.plate.layout(ART_RECTS.car.w, ART_RECTS.car.h);
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

  private placeSprite(sprite: Sprite, rect: {readonly x:number; readonly y:number; readonly w:number; readonly h:number}): void {
    sprite.node.getComponent(UITransform)!.setContentSize(rect.w, rect.h);
    sprite.node.setPosition(rect.x + rect.w / 2 - 375, this.height / 2 - (rect.y + rect.h / 2));
    sprite.enabled = !!sprite.spriteFrame;
  }

  private placeCenter(node: Node, centerX: number, centerY: number): void {
    node.setPosition(centerX - 375, this.height / 2 - centerY);
  }
}

function outlined(value: Label, color: Color, width: number): Label {
  value.enableOutline = true;
  value.outlineColor = color;
  value.outlineWidth = width;
  return value;
}

function contains(rect: HomeButtonRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/** Seal text size: 30px for two characters, smaller for longer city names. */
export function sealFontSize(text: string): number {
  const n = [...text].length;
  return n <= 2 ? 30 : n === 3 ? 28 : n === 4 ? 24 : 20;
}
