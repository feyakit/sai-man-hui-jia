import { Color, Graphics, Label, Node, UITransform, view } from 'cc';
import { stackPageHeight } from '../core/stack/stack-layout';
import { fill, label, uiNode } from './UIKit';

const gold = new Color(255, 205, 105);
const paleGold = new Color(255, 232, 177);
const cream = new Color(255, 246, 229);

/** Shown before the pile appears, after this long, so instant (prefetched) entries never flash it. */
const SHOW_AFTER_MS = 120;

interface LoadingDebug { active: boolean; visible: boolean; done: number; total: number; startedAt: number }

/**
 * Red-gold “年货装车中…” card shown while a level's goods and ride art load, so the pile only ever
 * appears with every card already an image.
 */
export class StackLoading {
  readonly node: Node;
  private readonly art: Graphics;
  private readonly bar: Graphics;
  private readonly title: Label;
  private readonly count: Label;
  private readonly started = Date.now();
  private height = 1334;
  private done = 0;
  private total = 0;
  private frame = 0;
  private readonly debug: LoadingDebug;

  constructor(parent: Node) {
    this.node = uiNode('StackLoading', parent, 750, 1334);
    this.art = this.node.addComponent(Graphics);
    const barNode = uiNode('LoadingBar', this.node, 750, 1334);
    this.bar = barNode.addComponent(Graphics);
    this.title = label(this.node, 'LoadingTitle', '年货装车中', 36, 0, 30);
    this.title.color = gold;
    this.title.isBold = true;
    this.count = label(this.node, 'LoadingCount', '', 22, 0, -62);
    this.count.color = paleGold;
    this.debug = {active: true, visible: false, done: 0, total: 0, startedAt: this.started};
    if (typeof window !== 'undefined') (window as Window & {__stackLoading?: LoadingDebug}).__stackLoading = this.debug;
    this.node.once(Node.EventType.NODE_DESTROYED, () => { this.debug.active = false; this.debug.visible = false; });
    this.layout();
    this.setVisible(false);
  }

  progress(done: number, total: number): void {
    this.done = done; this.total = total;
    this.debug.done = done; this.debug.total = total;
    this.drawBar();
  }

  tick(): void {
    if (!this.node.isValid) return;
    const size = view.getVisibleSize();
    if (stackPageHeight(size.width, size.height) !== this.height) this.layout();
    if (!this.debug.visible && Date.now() - this.started >= SHOW_AFTER_MS) this.setVisible(true);
    if (++this.frame % 20 === 0) this.title.string = `年货装车中${'·'.repeat(1 + (this.frame / 20) % 3)}`;
  }

  private setVisible(visible: boolean): void {
    this.debug.visible = visible;
    for (const child of this.node.children) child.active = visible;
    this.art.enabled = visible;
  }

  private layout(): void {
    const size = view.getVisibleSize();
    this.height = stackPageHeight(size.width, size.height);
    const scale = Math.min(size.width / 750, size.height / this.height);
    this.node.setScale(scale, scale, 1);
    this.node.getComponent(UITransform)!.setContentSize(750, this.height);
    const g = this.art;
    const h = this.height;
    g.clear();
    fill(g, new Color(46, 10, 18), -375, -h / 2, 750, h);
    fill(g, new Color(92, 16, 26, 160), -375, -h / 2, 750, h * .45);
    // Card: gold rim, red body, inner gold hairline.
    fill(g, new Color(20, 4, 8, 150), -264, -132, 536, 276, 34);
    fill(g, gold, -268, -126, 536, 276, 34);
    fill(g, new Color(150, 26, 36), -260, -118, 520, 260, 28);
    fill(g, new Color(196, 44, 44), -248, -106, 496, 236, 22);
    g.strokeColor = new Color(255, 226, 150, 150); g.lineWidth = 1.5;
    g.roundRect(-240, -98, 480, 220, 18); g.stroke();
    this.drawBar();
  }

  private drawBar(): void {
    const g = this.bar;
    g.clear();
    const w = 380, x = -w / 2, y = -24;
    fill(g, new Color(90, 14, 22), x, y, w, 18, 9);
    const share = this.total > 0 ? Math.min(1, this.done / this.total) : 0;
    if (share > 0) fill(g, gold, x, y, Math.max(18, w * share), 18, 9);
    g.strokeColor = new Color(255, 226, 150, 190); g.lineWidth = 1.5;
    g.roundRect(x, y, w, 18, 9); g.stroke();
    this.count.string = this.total > 0 ? `年货图片 ${this.done} / ${this.total}` : '';
    this.count.color = cream;
  }
}
