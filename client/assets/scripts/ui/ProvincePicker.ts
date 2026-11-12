import { Color, Graphics, Label, Node, UITransform } from 'cc';
import { PROVINCES } from '../core/provinces';
import type { Province } from '../core/rank/rank';
import { fill, label, uiNode } from './UIKit';

const deep = new Color(30, 8, 18, 246);
const panel = new Color(121, 24, 34, 250);
const gold = new Color(255, 207, 111);
const paleGold = new Color(255, 231, 173);
const cream = new Color(255, 246, 229);
const ink = new Color(76, 30, 20);
const cell = new Color(80, 17, 28, 245);
const cellGlow = new Color(255, 216, 136, 34);

interface PickerRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface CellView extends PickerRect {
  readonly province: Province;
  readonly node: Node;
}

export interface ProvincePickerActions {
  readonly onSelect: (province: Province) => void;
  readonly onCancel: () => void;
}

/** Reusable five-column province chooser. Geometry is independent of the page that opens it. */
export class ProvincePicker {
  readonly node: Node;
  private readonly cells: CellView[] = [];
  private readonly cancelRect: PickerRect;
  private readonly height: number;
  private readonly width = 750;
  private readonly debugHook: object;
  private destroyed = false;

  constructor(
    parent: Node,
    height: number,
    current: Province | null,
    private readonly actions: ProvincePickerActions,
  ) {
    this.height = Math.max(1334,height);
    this.node = uiNode('ProvincePicker',parent,this.width,this.height);
    const backdrop = uiNode('PickerBackdrop',this.node,this.width,this.height).addComponent(Graphics);
    fill(backdrop,new Color(5,7,18,208),-375,-this.height/2,750,this.height);
    fill(backdrop,new Color(0,0,0,72),-375,-this.height/2,750,this.height);

    const columns = 5;
    const cellW = 118;
    const cellH = 52;
    const gap = 10;
    const gridW = columns * cellW + (columns - 1) * gap;
    const rows = Math.ceil(PROVINCES.length / columns);
    const panelW = 690;
    const panelH = 88 + rows * cellH + (rows - 1) * gap + 78;
    const panelX = (this.width - panelW) / 2;
    const panelY = Math.round((this.height - panelH) / 2);
    const gridX = Math.round((this.width - gridW) / 2);
    const gridY = panelY + 88;

    const art = uiNode('PickerChrome',this.node,this.width,this.height).addComponent(Graphics);
    const box = (color: Color,x: number,y: number,w: number,h: number,radius = 0) => {
      fill(art,color,x - 375,this.height/2 - y - h,w,h,radius);
    };
    const strokeBox = (x: number,y: number,w: number,h: number,radius: number) => {
      art.roundRect(x - 375,this.height/2 - y - h,w,h,radius);
      art.stroke();
    };
    box(new Color(8,5,14,180),panelX + 7,panelY + 9,panelW,panelH,34);
    box(gold,panelX,panelY,panelW,panelH,34);
    box(deep,panelX + 5,panelY + 5,panelW - 10,panelH - 10,30);
    box(panel,panelX + 12,panelY + 12,panelW - 24,panelH - 24,26);
    box(new Color(255,219,145,42),panelX + 20,panelY + 18,panelW - 40,2,1);
    box(new Color(255,209,121,34),panelX + 18,panelY + 65,panelW - 36,1,1);

    const title = label(this.node,'PickerTitle','选择你的省份',38,0,this.height/2 - (panelY + 36));
    title.color = paleGold;
    const subtitle = label(this.node,'PickerSubtitle','为家乡而战 · 可随时修改',19,0,this.height/2 - (panelY + 66));
    subtitle.color = cream;

    for (let index = 0; index < PROVINCES.length; index++) {
      const province = PROVINCES[index];
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = gridX + column * (cellW + gap);
      const y = gridY + row * (cellH + gap);
      const selected = province === current;
      box(selected ? gold : cell,x,y + 3,cellW,cellH,16);
      if (!selected) {
        box(cellGlow,x + 2,y + 5,cellW - 4,cellH - 4,14);
        art.strokeColor = new Color(255,207,111,150);
        art.lineWidth = 1.5;
        strokeBox(x + 1,y + 1,cellW - 2,cellH - 2,16);
      }
      const text = label(this.node,`Province-${province}`,province,22,0,0);
      text.node.getComponent(UITransform)!.setContentSize(cellW - 8,cellH);
      text.overflow = Label.Overflow.SHRINK;
      text.node.setPosition(x + cellW/2 - 375,this.height/2 - (y + cellH/2));
      text.color = selected ? ink : cream;
      text.isBold = selected;
      this.cells.push({province,x,y,w:cellW,h:cellH,node:text.node});
    }

    this.cancelRect = {
      x:Math.round((this.width - 220) / 2),
      y:panelY + panelH - 66,
      w:220,
      h:52,
    };
    box(new Color(255,231,173,18),this.cancelRect.x,this.cancelRect.y,this.cancelRect.w,this.cancelRect.h,16);
    art.strokeColor = new Color(255,207,111,150);
    art.lineWidth = 1.5;
    strokeBox(this.cancelRect.x,this.cancelRect.y,this.cancelRect.w,this.cancelRect.h,16);
    const cancel = label(this.node,'PickerCancel','取消',22,0,this.height/2 - (this.cancelRect.y + this.cancelRect.h/2));
    cancel.color = paleGold;

    this.debugHook = Object.freeze({
      getState: () => this.debugState(),
      press: (x: number,y: number) => this.press(x,y),
    });
    if (typeof window !== 'undefined') {
      (window as Window & {__provincePicker?: object}).__provincePicker = this.debugHook;
    }
    this.node.once(Node.EventType.NODE_DESTROYED,() => {
      this.destroyed = true;
      if (typeof window !== 'undefined'
        && (window as Window & {__provincePicker?: object}).__provincePicker === this.debugHook) {
        delete (window as Window & {__provincePicker?: object}).__provincePicker;
      }
    });
  }

  press(x: number, y: number): boolean {
    if (this.destroyed) return false;
    for (const cell of this.cells) {
      if (!contains(cell,x,y)) continue;
      const province = cell.province;
      this.close();
      this.actions.onSelect(province);
      return true;
    }
    if (contains(this.cancelRect,x,y)) {
      this.close();
      this.actions.onCancel();
    }
    return true;
  }

  close(): void {
    if (!this.destroyed && this.node.isValid) this.node.destroy();
  }

  debugState(): object {
    const screenWidth = typeof window === 'undefined' ? this.width : window.innerWidth;
    const screenHeight = typeof window === 'undefined' ? this.height : window.innerHeight;
    const points = this.cells.map(item => ({
      province:item.province,
      screenX:(item.x + item.w/2) / this.width * screenWidth,
      screenY:(item.y + item.h/2) / this.height * screenHeight,
      screenLeft:item.x / this.width * screenWidth,
      screenRight:(item.x + item.w) / this.width * screenWidth,
      screenTop:item.y / this.height * screenHeight,
      screenBottom:(item.y + item.h) / this.height * screenHeight,
    }));
    return {
      visible:!this.destroyed,
      provinceCount:points.length,
      points,
      cancel:{
        screenX:(this.cancelRect.x + this.cancelRect.w/2) / this.width * screenWidth,
        screenY:(this.cancelRect.y + this.cancelRect.h/2) / this.height * screenHeight,
      },
    };
  }
}

function contains(rect: PickerRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
