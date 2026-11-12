import { Color, Graphics, Node, Sprite, UITransform } from 'cc';
import { FINISH_DURATION, type FinishAction, type FinishState } from '../game/FinishTimeline';
import type { Rect } from '../game/InteractionGeometry';
import { inRect } from '../game/InteractionGeometry';
import { loadArt } from '../services/OptionalResources';
import { fill, label, uiNode } from './UIKit';

const red = new Color(188, 34, 43);
const darkRed = new Color(83, 22, 29);
const gold = new Color(255, 207, 111);
const pale = new Color(255, 242, 208);
const ink = new Color(63, 29, 24);
const night = new Color(12, 15, 34, 150);

export interface StackFinishStats {
  readonly elapsedSec: number;
  readonly boxes: number;
}

interface FinishButton {
  readonly action: FinishAction | 'share';
  readonly rect: Rect;
  readonly label: Node;
}

/** Stack-mode celebration: the night backdrop stays visible while the loaded car closes up and drives away. */
export class StackFinishView {
  readonly node: Node;
  private readonly backdrop: Sprite;
  private readonly wash: Graphics;
  private readonly car: Node;
  private readonly carFallback: Graphics;
  private readonly trunkImage: Sprite;
  private readonly bodyImage: Sprite;
  private readonly headline: Node;
  private readonly statsLabel: Node;
  private readonly actions: Node;
  private readonly actionArt: Graphics;
  private readonly buttons: FinishButton[] = [];
  private height = 1334;
  private state?: FinishState;
  private ready = false;
  private trunkY = -39;

  constructor(
    parent: Node,
    private readonly choices: readonly {title: string; action: FinishAction}[],
    private readonly stats: StackFinishStats,
    private readonly onAction: (action: FinishAction) => void,
    private readonly onShare: () => void = () => undefined,
  ) {
    this.node = uiNode('StackFinish', parent, 750, 1334);
    this.backdrop = uiNode('NightBackdrop', this.node, 750, 1334).addComponent(Sprite);
    this.backdrop.sizeMode = Sprite.SizeMode.CUSTOM;
    this.backdrop.trim = false;
    this.backdrop.enabled = false;
    void loadArt('ui/bg_night').then(frame => {
      if (!frame || !this.node.isValid) return;
      this.backdrop.spriteFrame = frame;
      this.backdrop.enabled = true;
      this.layout(this.height);
    });
    this.wash = uiNode('NightWash', this.node, 750, 1334).addComponent(Graphics);

    this.car = uiNode('HomewardCar', this.node, 760, 520);
    this.carFallback = uiNode('CarFallback', this.car, 760, 520).addComponent(Graphics);
    this.trunkImage = this.imageNode('TrunkWell', this.car);
    this.bodyImage = this.imageNode('CarBody', this.car);
    void Promise.all([
      loadArt('vehicles/sedan_v1_body'),
      loadArt('vehicles/sedan_v1_trunk'),
    ]).then(([body, trunk]) => {
      if (!this.node.isValid) return;
      if (trunk) { this.trunkImage.spriteFrame = trunk; this.trunkImage.enabled = true; }
      if (body) { this.bodyImage.spriteFrame = body; this.bodyImage.enabled = true; this.carFallback.enabled = false; }
      this.ready = true;
      this.layout(this.height);
      if (this.state) this.render(this.state);
    });

    this.headline = uiNode('HomeBanner', this.node, 750, 230);
    const banner = this.headline.addComponent(Graphics);
    fill(banner, new Color(90, 23, 29, 232), -330, -63, 660, 126, 28);
    fill(banner, gold, -322, -55, 644, 110, 23);
    fill(banner, red, -315, -48, 630, 96, 19);
    label(this.headline, 'FinishTitle', '塞满了！回家！', 58, 0, 6).color = pale;
    this.statsLabel = uiNode('FinishStats', this.node, 700, 92);
    const statsBg = this.statsLabel.addComponent(Graphics);
    fill(statsBg, new Color(112, 25, 32, 245), -290, -35, 580, 70, 24);
    statsBg.strokeColor = new Color(255, 207, 111, 190);
    statsBg.lineWidth = 2;
    statsBg.roundRect(-288, -33, 576, 66, 22);
    statsBg.stroke();
    fill(statsBg, new Color(255, 219, 145, 46), -280, -27, 560, 54, 18);
    label(this.statsLabel, 'StatsText', this.statsText(), 26, 0, 0).color = pale;

    this.actions = uiNode('FinishActions', this.node, 750, 320);
    this.actionArt = this.actions.addComponent(Graphics);
    const choicesWithShare: readonly {title: string; action: FinishAction | 'share'}[] = [
      ...choices,
      {title:'生成分享图',action:'share'},
    ];
    for (let index = 0; index < choicesWithShare.length; index++) {
      const choice = choicesWithShare[index];
      const text = label(this.actions, `FinishButton${index}`, choice.title, 30, 0, 0);
      text.color = index === 0 ? ink : gold;
      this.buttons.push({ action: choice.action, rect: {x:125,y:0,w:500,h:74}, label: text.node });
    }
    label(this.node, 'SkipHint', '轻点屏幕 · 立即出发', 22, 0, 0).color = gold;
    this.layout(this.height);
  }

  layout(height: number): void {
    this.height = height;
    this.node.getComponent(UITransform)!.setContentSize(750, height);
    const scale = Math.max(1, height / 1334);
    this.backdrop.node.getComponent(UITransform)!.setContentSize(750 * scale, 1334 * scale);
    this.backdrop.node.setPosition(0, 0);
    this.wash.clear();
    fill(this.wash, night, -375, -height / 2, 750, height, 0);
    this.drawCarFallback();
    this.headline.setPosition(0, height / 2 - 207);
    this.statsLabel.setPosition(0, height / 2 - 380);
    const actionsY = -height / 2 + 300;
    this.actions.setPosition(0, actionsY);
    this.actionArt.clear();
    const baseY = 68;
    for (let index = 0; index < this.buttons.length; index++) {
      const button = this.buttons[index];
      const localY = baseY - index * 92;
      button.rect.y = height / 2 - (actionsY + localY) - 37;
      button.label.setPosition(0, localY);
      fill(this.actionArt, index === 0 ? gold : darkRed, -250, localY - 37, 500, 74, 22);
      if (index !== 0) {
        this.actionArt.strokeColor = gold;
        this.actionArt.lineWidth = 2;
        this.actionArt.roundRect(-248, localY - 35, 496, 70, 20);
        this.actionArt.stroke();
      }
    }
    this.node.getChildByName('SkipHint')!.setPosition(0, -height / 2 + 86);
    this.setupCar();
    if (this.state) this.render(this.state);
  }

  render(state: FinishState): void {
    this.state = state;
    const drive = Math.max(0, Math.min(1, (state.time - 1050) / (FINISH_DURATION - 1050)));
    const carScale = .98 - .12 * drive;
    this.car.setScale(carScale, carScale, 1);
    this.car.setPosition(0, -this.height * .035 + this.height * .055 * drive);
    this.headline.active = state.celebration;
    this.statsLabel.active = state.celebration;
    this.actions.active = state.buttons;
    this.node.getChildByName('SkipHint')!.active = !state.buttons;
  }

  press(x: number, y: number): void {
    if (!this.state?.buttons) return;
    for (const button of this.buttons) {
      if (!inRect({x, y}, button.rect)) continue;
      if (button.action === 'share') this.onShare();
      else this.onAction(button.action);
      return;
    }
  }

  buttonPoints(): {action: FinishAction | 'share'; rect: Rect}[] {
    return this.buttons.map(button => ({action:button.action,rect:{...button.rect}}));
  }

  private imageNode(name: string, parent: Node): Sprite {
    const sprite = uiNode(name, parent, 1, 1).addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    sprite.enabled = false;
    return sprite;
  }

  private setupCar(): void {
    const bodyW = 720, bodyH = 450;
    const holeX = Math.round(BODY_HOLE.left / 1024 * bodyW);
    const holeY = Math.round(BODY_HOLE.top / 640 * bodyH - bodyH / 2);
    const holeW = Math.round((BODY_HOLE.right - BODY_HOLE.left) / 1024 * bodyW);
    const holeH = Math.round((BODY_HOLE.bottom - BODY_HOLE.top) / 640 * bodyH);
    this.trunkY = holeY + holeH / 2;
    this.show(this.bodyImage, 0, 0, bodyW, bodyH);
    this.show(this.trunkImage, 0, this.trunkY, holeW, holeH);
    this.car.setScale(.98, .98, 1);
    this.car.setPosition(0, -this.height * .035);
  }

  private drawCarFallback(): void {
    const g = this.carFallback;
    g.clear();
    fill(g, new Color(20, 13, 24, 95), -345, -235, 690, 480, 54);
    fill(g, red, -350, -225, 700, 450, 64);
    fill(g, darkRed, -248, -134, 496, 244, 42);
    fill(g, new Color(25, 21, 33), -232, -121, 464, 214, 34);
    fill(g, new Color(255, 176, 68), -324, -83, 72, 38, 12);
    fill(g, new Color(255, 176, 68), 252, -83, 72, 38, 12);
  }

  private show(sprite: Sprite, x: number, y: number, width: number, height: number): void {
    sprite.node.getComponent(UITransform)!.setContentSize(width, height);
    sprite.node.setPosition(x, y);
    sprite.enabled = !!sprite.spriteFrame;
  }

  private statsText(): string {
    const minutes = Math.floor(this.stats.elapsedSec / 60);
    const seconds = this.stats.elapsedSec % 60;
    const time = minutes > 0 ? `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒` : `${seconds} 秒`;
    return `用时 ${time}  ·  打包 ${this.stats.boxes} 箱`;
  }
}

const BODY_HOLE = { left: 159, right: 878, top: 104, bottom: 425 } as const;
