import { Color, Graphics, Label, Node, Sprite, UITransform } from 'cc';
import type { FinishState } from '../game/FinishTimeline';
import type { Rect } from '../game/InteractionGeometry';
import { inRect } from '../game/InteractionGeometry';
import { createRng } from '../core/rng';
import { loadArt } from '../services/OptionalResources';
import type { StackFinishStats } from './StackFinishView';
import { fill, label, uiNode } from './UIKit';

const gold = new Color(255, 207, 111);
const pale = new Color(255, 242, 208);
const ink = new Color(63, 29, 24);
const darkRed = new Color(83, 22, 29);

export type HomecomingAction = 'road' | 'share' | 'home';

/** Firecracker strings painted in bg_home (design units at 750×1334, before cover scaling). */
const STRINGS = [{x: 45, top: 470, bottom: 790}, {x: 705, top: 470, bottom: 790}] as const;
/** Time for the tractor to roll up the lane to the gate. */
export const HOMECOMING_ARRIVE_MS = 1800;

/**
 * Level-9 finale: the family gate at night with parents waving, couplets and lanterns. The tractor
 * rolls up the lane and stops at the door, firecrackers keep popping, and the only ways on are
 * “再走一遍回家路”, the homecoming share image or the home screen — never a next level.
 */
export class StackHomecomingView {
  readonly node: Node;
  private readonly backdrop: Sprite;
  private readonly tractor: Sprite;
  private readonly sparks: Graphics;
  private readonly title: Node;
  private readonly subtitle: Node;
  private readonly statsLabel: Node;
  private readonly actions: Node;
  private readonly actionArt: Graphics;
  private readonly buttons: {readonly action: HomecomingAction; rect: Rect; readonly label: Node}[] = [];
  private readonly started = Date.now();
  private height = 1334;
  private state?: FinishState;
  private rankText: string | null = null;

  constructor(
    parent: Node,
    private readonly stats: StackFinishStats,
    private readonly onAction: (action: HomecomingAction) => void,
    private readonly tractorArt = 'vehicles/tractor',
    private readonly tractorSize = {w: 457, h: 647},
  ) {
    this.node = uiNode('StackHomecoming', parent, 750, 1334);
    const shade = uiNode('HomeShade', this.node, 750, 1334).addComponent(Graphics);
    fill(shade, new Color(10, 6, 18, 255), -375, -1000, 750, 2000, 0);
    this.backdrop = this.image('HomeBackdrop');
    this.tractor = this.image('HomeTractor');
    this.sparks = uiNode('HomeFirecrackers', this.node, 750, 1334).addComponent(Graphics);
    void loadArt('ui/bg_home').then(frame => {
      if (!frame || !this.node.isValid) return;
      this.backdrop.spriteFrame = frame;
      this.layout(this.height);
    });
    void loadArt(this.tractorArt).then(frame => {
      if (!frame || !this.node.isValid) return;
      this.tractor.spriteFrame = frame;
      this.layout(this.height);
    });
    this.title = label(this.node, 'HomeTitle', '到家了！', 92, 0, 0).node;
    this.title.getComponent(Label)!.color = gold;
    this.subtitle = label(this.node, 'HomeSubtitle', '爸妈在门口等你 · 新年快乐', 30, 0, 0).node;
    this.subtitle.getComponent(Label)!.color = pale;
    this.statsLabel = label(this.node, 'HomeStats', this.statsText(), 25, 0, 0).node;
    this.statsLabel.getComponent(Label)!.color = pale;
    this.actions = uiNode('HomeActions', this.node, 750, 320);
    this.actionArt = this.actions.addComponent(Graphics);
    const choices: {title: string; action: HomecomingAction}[] = [
      {title: '再走一遍回家路', action: 'road'},
      {title: '到家分享图', action: 'share'},
      {title: '回首页', action: 'home'},
    ];
    choices.forEach((choice, index) => {
      const text = label(this.actions, `HomeButton${index}`, choice.title, 30, 0, 0);
      text.color = index === 0 ? ink : gold;
      this.buttons.push({action: choice.action, rect: {x: 125, y: 0, w: 500, h: 74}, label: text.node});
    });
    this.layout(this.height);
  }

  layout(height: number): void {
    this.height = height;
    this.node.getComponent(UITransform)!.setContentSize(750, height);
    const scale = this.coverScale();
    this.show(this.backdrop, 0, 0, 750 * scale, 1334 * scale);
    this.title.setPosition(0, height / 2 - 150);
    this.subtitle.setPosition(0, height / 2 - 228);
    this.statsLabel.setPosition(0, height / 2 - 276);
    // Primary button on its own row, share + home side by side below it; all under the tractor.
    const actionsY = -height / 2 + 175;
    this.actions.setPosition(0, actionsY);
    this.actionArt.clear();
    const slots = [{x: -250, w: 500, y: 46}, {x: -250, w: 240, y: -46}, {x: 10, w: 240, y: -46}];
    this.buttons.forEach((button, index) => {
      const slot = slots[index];
      button.rect.x = 375 + slot.x;
      button.rect.w = slot.w;
      button.rect.y = height / 2 - (actionsY + slot.y) - 37;
      button.label.setPosition(slot.x + slot.w / 2, slot.y);
      fill(this.actionArt, index === 0 ? gold : darkRed, slot.x, slot.y - 37, slot.w, 74, 22);
      if (index) {
        this.actionArt.strokeColor = gold;
        this.actionArt.lineWidth = 2;
        this.actionArt.roundRect(slot.x + 2, slot.y - 35, slot.w - 4, 70, 20);
        this.actionArt.stroke();
      }
    });
    if (this.state) this.render(this.state);
  }

  render(state: FinishState): void {
    this.state = state;
    const now = Date.now() - this.started;
    const arrive = Math.min(1, now / HOMECOMING_ARRIVE_MS);
    const ease = 1 - Math.pow(1 - arrive, 3);
    // Rear view: the tractor rolls in big from the bottom edge and parks small beside the door,
    // leaving the waving parents in the doorway visible.
    const scale = this.coverScale();
    const h = (560 - 300 * ease) * scale;
    const w = h * this.tractorSize.w / this.tractorSize.h;
    const parkY = this.toLocal(830 * scale);
    const startY = -this.height / 2 + h * .2;
    const x = 235 * scale * ease;
    this.show(this.tractor, x, startY + (parkY - startY) * ease + Math.sin(now / 90) * (1 - ease) * 4, w, h);
    this.title.active = arrive >= .7;
    this.subtitle.active = arrive >= .8;
    this.statsLabel.active = arrive >= .8;
    this.actions.active = arrive >= 1;
    this.drawFirecrackers(now, scale);
  }

  press(x: number, y: number): void {
    if (!this.actions.active) return;
    for (const button of this.buttons) {
      if (inRect({x, y}, button.rect)) { this.onAction(button.action); return; }
    }
  }

  setRankStatus(text: string | null): void { this.rankText = text; }

  get rankStatusText(): string | null { return this.rankText; }

  get statsLine(): string { return this.statsText(); }

  buttonPoints(): {action: HomecomingAction; title: string; rect: Rect}[] {
    return this.buttons.map(button => ({
      action: button.action,
      title: button.label.getComponent(Label)?.string ?? '',
      rect: {...button.rect},
    }));
  }

  /** Bursts of sparks and red paper bits at the foot of both painted firecracker strings. */
  private drawFirecrackers(now: number, scale: number): void {
    const g = this.sparks;
    g.clear();
    const frame = Math.floor(now / 70);
    for (const string of STRINGS) {
      const random = createRng(`home-spark-${string.x}-${frame}`);
      const x = (string.x - 375) * scale;
      // The burning point creeps up the string, then the string starts again.
      const burn = (now / 2600) % 1;
      const y = this.toLocal((string.bottom - (string.bottom - string.top) * burn) * scale);
      for (let index = 0; index < 14; index++) {
        const angle = random() * Math.PI * 2;
        const distance = (10 + random() * 46) * scale;
        const size = (2 + random() * 4) * scale;
        const hot = random();
        g.fillColor = hot > .6 ? new Color(255, 244, 170, 255) : hot > .25 ? new Color(255, 170, 60, 235) : new Color(230, 40, 40, 220);
        g.circle(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, size);
        g.fill();
      }
      g.fillColor = new Color(255, 255, 220, 200);
      g.circle(x, y, 9 * scale);
      g.fill();
      for (let index = 0; index < 6; index++) {
        const fall = ((now / 1000 + index * .37) % 1.6) / 1.6;
        g.fillColor = new Color(214, 30, 36, Math.round(230 * (1 - fall)));
        g.rect(x + (random() - .5) * 120 * scale, y - fall * 260 * scale, 7 * scale, 4 * scale);
        g.fill();
      }
    }
  }

  private coverScale(): number { return Math.max(1, this.height / 1334); }

  /** Converts a y measured from the top of the cover-scaled backdrop into node-local y. */
  private toLocal(fromTop: number): number { return 1334 * this.coverScale() / 2 - fromTop; }

  private image(name: string): Sprite {
    const sprite = uiNode(name, this.node, 1, 1).addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    sprite.enabled = false;
    return sprite;
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
    return `第 9 关 · 用时 ${time} · 打包 ${this.stats.boxes} 箱`;
  }
}
