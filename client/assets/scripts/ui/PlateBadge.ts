import { Color, Graphics, Label, Node, UITransform } from 'cc';
import { plateBox, plateFontSize, plateText, type PlateRect } from '../core/plate';
import { browserStorage } from '../core/stack/stack-progress';
import { readStoredProvince } from '../core/rank/rank';
import type { VehicleKey } from '../core/stack/stack-vehicles';
import { uiNode } from './UIKit';

const plateYellow = new Color(255, 204, 38);
const plateInk = new Color(22, 18, 14);

/** Text for the plate of the player's currently chosen province. */
export function currentPlateText(): string {
  return plateText(readStoredProvince(browserStorage()));
}

/**
 * Yellow-on-black festive licence plate laid over a vehicle sprite's painted blank plate. Lives as a child
 * of the sprite node, so it follows the sprite's position and scale; `counterScaleY` undoes a squashed parent.
 */
export class PlateBadge {
  readonly node: Node;
  private readonly graphics: Graphics;
  private readonly label: Label;

  constructor(parent: Node, private readonly key: VehicleKey | PlateRect, private readonly artSize: {readonly w: number; readonly h: number}) {
    this.node = uiNode('Plate', parent, 10, 10);
    this.graphics = this.node.addComponent(Graphics);
    const text = uiNode('PlateText', this.node, 10, 10);
    this.label = text.addComponent(Label);
    this.label.isBold = true;
    this.label.color = plateInk;
    this.label.overflow = Label.Overflow.NONE;
    this.label.string = currentPlateText();
    this.node.active = false;
  }

  /** Re-reads the chosen province. */
  refresh(): void { this.label.string = currentPlateText(); }

  get text(): string { return this.label.string; }

  /** Place over a sprite whose content box is `w`×`h` (local units, centred at the sprite's origin). */
  layout(w: number, h: number, counterScaleY = 1): void {
    const box = plateBox(this.key, this.artSize);
    const pw = box.w * w;
    const ph = box.h * h;
    this.node.active = true;
    this.node.setPosition((box.cx - .5) * w, (.5 - box.cy) * h);
    this.node.setScale(1, 1 / counterScaleY, 1);
    this.node.getComponent(UITransform)!.setContentSize(pw, ph);
    const g = this.graphics;
    g.clear();
    const r = Math.min(ph * .2, 8);
    g.fillColor = plateInk;
    g.roundRect(-pw / 2, -ph / 2, pw, ph, r);
    g.fill();
    const inset = Math.max(1.2, ph * .07);
    g.fillColor = plateYellow;
    g.roundRect(-pw / 2 + inset, -ph / 2 + inset, pw - inset * 2, ph - inset * 2, Math.max(1, r - inset));
    g.fill();
    const size = plateFontSize(this.label.string, pw - inset * 2, ph - inset * 2);
    this.label.fontSize = size;
    this.label.lineHeight = size * 1.1;
    this.label.node.getComponent(UITransform)!.setContentSize(pw, ph);
    this.label.node.setPosition(0, -size * .04);
  }
}
