import { Color, Graphics, Label, Node, UITransform } from 'cc';
import { CONFIRM_TEXT, confirmLayout, inExitRect, type ExitRect } from '../core/home-exit';
import { fill, label, uiNode } from './UIKit';

const red = new Color(178, 30, 40);
const deepRed = new Color(96, 14, 24);
const gold = new Color(255, 205, 105);
const paleGold = new Color(255, 232, 177);
const ink = new Color(90, 34, 16);

/**
 * Red-gold “← 主页” pill plus its “放弃本局?” confirm dialog. The owner page forwards taps
 * (design px from the top-left of a 750-wide page) and decides what “go home” means.
 */
export class HomeExit {
  readonly node: Node;
  private readonly pill: Node;
  private dialog?: Node;
  private height = 1334;

  constructor(parent: Node, private rect: ExitRect, private readonly onHome: () => void) {
    this.node = uiNode('HomeExit', parent, 750, 1334);
    this.pill = uiNode('HomeExitButton', this.node, rect.w, rect.h);
    const g = this.pill.addComponent(Graphics);
    const {w, h} = rect;
    fill(g, new Color(30, 6, 10, 130), -w / 2 + 2, -h / 2 - 3, w, h, h / 2);
    fill(g, gold, -w / 2, -h / 2, w, h, h / 2);
    fill(g, red, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, h / 2 - 3);
    g.strokeColor = new Color(255, 226, 150, 150); g.lineWidth = 1.2;
    g.roundRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14, h / 2 - 7); g.stroke();
    const text = label(this.pill, 'HomeExitText', '← 主页', 23, 0, 0);
    text.color = paleGold;
    text.isBold = true;
    // “← 主页” at 23px is ~92px wide: fits the 128px pill without shrinking.
  }

  get open(): boolean { return !!this.dialog; }
  get buttonRect(): ExitRect { return this.rect; }

  layout(height: number, rect = this.rect): void {
    this.height = height;
    this.rect = rect;
    this.node.getComponent(UITransform)!.setContentSize(750, height);
    this.node.setPosition(0, 0);
    this.pill.setPosition(rect.x + rect.w / 2 - 375, height / 2 - (rect.y + rect.h / 2));
    if (this.dialog) { this.closeDialog(); this.openDialog(); }
  }

  /** Keep the pill above overlays added later (fail modal, finish view). */
  bringToFront(): void { this.node.setSiblingIndex(Number.MAX_SAFE_INTEGER); }

  setVisible(visible: boolean): void { this.pill.active = visible; }

  /** True when the tap was consumed. `confirm` decides whether leaving needs the dialog. */
  press(x: number, y: number, confirm: boolean): boolean {
    if (this.dialog) {
      const box = confirmLayout(this.height);
      if (inExitRect(box.confirm, x, y)) { this.closeDialog(); this.onHome(); }
      else if (inExitRect(box.cancel, x, y) || !inExitRect(box.panel, x, y)) this.closeDialog();
      return true;
    }
    if (!this.pill.active || !inExitRect(this.rect, x, y)) return false;
    if (confirm) this.openDialog(); else this.onHome();
    return true;
  }

  closeDialog(): void {
    this.dialog?.destroy();
    this.dialog = undefined;
  }

  /** Screen-space debug rects for live checks. */
  debug(screenW: number, screenH: number): {button: object; confirm: object | null; cancel: object | null; open: boolean; text: string | null} {
    const map = (r: ExitRect) => ({
      screenX:(r.x + r.w / 2) / 750 * screenW, screenY:(r.y + r.h / 2) / this.height * screenH,
      screenLeft:r.x / 750 * screenW, screenRight:(r.x + r.w) / 750 * screenW,
      screenTop:r.y / this.height * screenH, screenBottom:(r.y + r.h) / this.height * screenH,
    });
    const box = confirmLayout(this.height);
    return {
      button:map(this.rect), open:!!this.dialog,
      confirm:this.dialog ? map(box.confirm) : null, cancel:this.dialog ? map(box.cancel) : null,
      text:this.dialog ? CONFIRM_TEXT : null,
    };
  }

  private openDialog(): void {
    this.bringToFront();
    const node = uiNode('HomeExitConfirm', this.node, 750, this.height);
    const g = node.addComponent(Graphics);
    const H = this.height;
    const box = (color: Color, r: ExitRect, radius: number) => fill(g, color, r.x - 375, H / 2 - r.y - r.h, r.w, r.h, radius);
    fill(g, new Color(8, 6, 14, 200), -375, -H / 2, 750, H);
    const {panel, confirm, cancel} = confirmLayout(H);
    box(new Color(14, 4, 8, 160), {x:panel.x + 6, y:panel.y + 10, w:panel.w, h:panel.h}, 30);
    box(gold, panel, 30);
    box(deepRed, {x:panel.x + 6, y:panel.y + 6, w:panel.w - 12, h:panel.h - 12}, 26);
    box(red, {x:panel.x + 14, y:panel.y + 14, w:panel.w - 28, h:panel.h - 28}, 22);
    box(new Color(255, 223, 146, 60), {x:panel.x + 40, y:panel.y + 74, w:panel.w - 80, h:2}, 1);
    const title = label(node, 'ConfirmTitle', '回主页', 34, 0, H / 2 - (panel.y + 46));
    title.color = gold; title.isBold = true;
    const body = label(node, 'ConfirmText', CONFIRM_TEXT, 27, 0, H / 2 - (panel.y + 140));
    body.color = new Color(255, 244, 226);
    const hint = label(node, 'ConfirmHint', '已通关的关卡进度会保留', 20, 0, H / 2 - (panel.y + 186));
    hint.color = new Color(255, 214, 160, 210);
    box(gold, confirm, 22);
    box(new Color(255, 226, 138), {x:confirm.x + 8, y:confirm.y + 6, w:confirm.w - 16, h:8}, 4);
    const yes = label(node, 'ConfirmYes', '回主页', 28, confirm.x + confirm.w / 2 - 375, H / 2 - (confirm.y + confirm.h / 2));
    yes.color = ink; yes.isBold = true;
    box(gold, cancel, 22);
    box(deepRed, {x:cancel.x + 3, y:cancel.y + 3, w:cancel.w - 6, h:cancel.h - 6}, 19);
    const no = label(node, 'ConfirmNo', '继续玩', 28, cancel.x + cancel.w / 2 - 375, H / 2 - (cancel.y + cancel.h / 2));
    no.color = paleGold; no.isBold = true;
    this.dialog = node;
  }
}
