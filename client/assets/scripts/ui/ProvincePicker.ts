import { Color, EventTouch, Graphics, Label, Mask, Node, UITransform, Vec3 } from 'cc';
import { citiesOf, type CityPlate } from '../core/cities';
import { PROVINCE_PLATE_ABBR } from '../core/plate';
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
  readonly key: string;
}

export interface ProvincePickerActions {
  /** `city` is null for municipalities / 港澳台, or when the player keeps just the province. */
  readonly onSelect: (province: Province, city: string | null) => void;
  readonly onCancel: () => void;
}

const DRAG_SLOP = 12;

/**
 * Two-step region chooser in the red-gold 年画 style: a five-column province grid, then (for provinces
 * with prefectures) a four-column city grid showing each city's plate letter. The city grid scrolls when it
 * is taller than the screen allows. Geometry is independent of the page that opens it.
 */
export class ProvincePicker {
  readonly node: Node;
  private readonly height: number;
  private readonly width = 750;
  private readonly debugHook: object;
  private destroyed = false;
  private step: 'province' | 'city' = 'province';
  private stepNode?: Node;
  private cells: CellView[] = [];
  private buttons: (PickerRect & {key: 'cancel' | 'back' | 'skip'})[] = [];
  private province: Province | null = null;
  // City grid scrolling (design px).
  private viewport: PickerRect = {x:0,y:0,w:0,h:0};
  private content?: Node;
  private scrollY = 0;
  private scrollMax = 0;
  private dragStartY: number | null = null;
  private dragStartScroll = 0;
  private dragged = false;

  constructor(
    parent: Node,
    height: number,
    private readonly current: Province | null,
    private readonly actions: ProvincePickerActions,
    private readonly currentCity: string | null = null,
  ) {
    this.height = Math.max(1334,height);
    this.node = uiNode('ProvincePicker',parent,this.width,this.height);
    const backdrop = uiNode('PickerBackdrop',this.node,this.width,this.height).addComponent(Graphics);
    fill(backdrop,new Color(5,7,18,208),-375,-this.height/2,750,this.height);
    fill(backdrop,new Color(0,0,0,72),-375,-this.height/2,750,this.height);
    this.buildProvinces();

    this.node.on(Node.EventType.TOUCH_START,this.touchStart,this);
    this.node.on(Node.EventType.TOUCH_MOVE,this.touchMove,this);
    this.debugHook = Object.freeze({
      getState: () => this.debugState(),
      press: (x: number,y: number) => this.press(x,y),
      scrollBy: (dy: number) => this.scrollTo(this.scrollY + dy),
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

  /** Tap at design coordinates (the host page forwards its TOUCH_END). Always consumes the tap. */
  press(x: number, y: number): boolean {
    if (this.destroyed) return false;
    if (this.dragged) { this.dragged = false; return true; }
    if (this.step === 'city' && !contains(this.viewport,x,y)) {
      // Buttons below the grid only.
    } else {
      const sy = this.step === 'city' ? y + this.scrollY : y;
      const hit = this.cells.find(item => contains(item,x,sy));
      if (hit) {
        if (this.step === 'province') this.pickProvince(hit.key as Province);
        else this.finish(this.province!,hit.key);
        return true;
      }
    }
    const button = this.buttons.find(item => contains(item,x,y));
    if (button?.key === 'cancel') { this.close(); this.actions.onCancel(); }
    else if (button?.key === 'back') this.buildProvinces();
    else if (button?.key === 'skip') this.finish(this.province!,null);
    return true;
  }

  close(): void {
    if (!this.destroyed && this.node.isValid) this.node.destroy();
  }

  private finish(province: Province, city: string | null): void {
    this.close();
    this.actions.onSelect(province,city);
  }

  private pickProvince(province: Province): void {
    if (citiesOf(province).length === 0) { this.finish(province,null); return; }
    this.province = province;
    this.buildCities(province);
  }

  private resetStep(step: 'province' | 'city'): Node {
    this.stepNode?.destroy();
    this.step = step;
    this.cells = [];
    this.buttons = [];
    this.content = undefined;
    this.scrollY = 0; this.scrollMax = 0; this.dragged = false; this.dragStartY = null;
    this.stepNode = uiNode(`PickerStep-${step}`,this.node,this.width,this.height);
    return this.stepNode;
  }

  private chrome(root: Node, panelX: number, panelY: number, panelW: number, panelH: number, titleText: string, subtitleText: string): Graphics {
    const art = uiNode('PickerChrome',root,this.width,this.height).addComponent(Graphics);
    const box = (color: Color,x: number,y: number,w: number,h: number,radius = 0) => fill(art,color,x - 375,this.height/2 - y - h,w,h,radius);
    box(new Color(8,5,14,180),panelX + 7,panelY + 9,panelW,panelH,34);
    box(gold,panelX,panelY,panelW,panelH,34);
    box(deep,panelX + 5,panelY + 5,panelW - 10,panelH - 10,30);
    box(panel,panelX + 12,panelY + 12,panelW - 24,panelH - 24,26);
    box(new Color(255,219,145,42),panelX + 20,panelY + 18,panelW - 40,2,1);
    box(new Color(255,209,121,34),panelX + 18,panelY + 65,panelW - 36,1,1);
    const title = label(root,'PickerTitle',titleText,38,0,this.height/2 - (panelY + 36));
    title.color = paleGold;
    const subtitle = label(root,'PickerSubtitle',subtitleText,19,0,this.height/2 - (panelY + 66));
    subtitle.color = cream;
    return art;
  }

  private cellBox(art: Graphics, x: number, y: number, w: number, h: number, selected: boolean, originY: number): void {
    const box = (color: Color,bx: number,by: number,bw: number,bh: number,radius = 0) => fill(art,color,bx - 375,originY - by - bh,bw,bh,radius);
    box(selected ? gold : cell,x,y + 3,w,h,16);
    if (!selected) {
      box(cellGlow,x + 2,y + 5,w - 4,h - 4,14);
      art.strokeColor = new Color(255,207,111,150);
      art.lineWidth = 1.5;
      art.roundRect(x + 1 - 375,originY - (y + 1) - (h - 2),w - 2,h - 2,16);
      art.stroke();
    }
  }

  private button(root: Node, art: Graphics, key: 'cancel' | 'back' | 'skip', text: string, x: number, y: number, w: number, h: number, primary = false): void {
    const box = (color: Color,bx: number,by: number,bw: number,bh: number,radius = 0) => fill(art,color,bx - 375,this.height/2 - by - bh,bw,bh,radius);
    box(primary ? gold : new Color(255,231,173,18),x,y,w,h,16);
    if (!primary) {
      art.strokeColor = new Color(255,207,111,150);
      art.lineWidth = 1.5;
      art.roundRect(x - 375,this.height/2 - y - h,w,h,16);
      art.stroke();
    }
    const caption = label(root,`Picker-${key}`,text,24,x + w/2 - 375,this.height/2 - (y + h/2));
    caption.color = primary ? ink : paleGold;
    caption.isBold = primary;
    this.buttons.push({key,x,y,w,h});
  }

  private buildProvinces(): void {
    const root = this.resetStep('province');
    const columns = 5, cellW = 118, cellH = 56, gap = 10;
    const gridW = columns * cellW + (columns - 1) * gap;
    const rows = Math.ceil(PROVINCES.length / columns);
    const panelW = 690;
    const panelH = 88 + rows * cellH + (rows - 1) * gap + 84;
    const panelX = (this.width - panelW) / 2;
    const panelY = Math.round((this.height - panelH) / 2);
    const gridX = Math.round((this.width - gridW) / 2);
    const gridY = panelY + 88;
    const art = this.chrome(root,panelX,panelY,panelW,panelH,'选择你的家乡','先选省份 · 再选城市 · 可随时修改');
    PROVINCES.forEach((province,index) => {
      const x = gridX + (index % columns) * (cellW + gap);
      const y = gridY + Math.floor(index / columns) * (cellH + gap);
      const selected = province === this.current;
      this.cellBox(art,x,y,cellW,cellH,selected,this.height/2);
      const text = label(root,`Province-${province}`,province,22,0,0);
      text.node.getComponent(UITransform)!.setContentSize(cellW - 8,cellH);
      text.overflow = Label.Overflow.SHRINK;
      text.node.setPosition(x + cellW/2 - 375,this.height/2 - (y + cellH/2));
      text.color = selected ? ink : cream;
      text.isBold = selected;
      this.cells.push({key:province,x,y,w:cellW,h:cellH});
    });
    this.button(root,art,'cancel','取消',Math.round((this.width - 220) / 2),panelY + panelH - 70,220,56);
  }

  private buildCities(province: Province): void {
    const root = this.resetStep('city');
    const cities = citiesOf(province);
    const abbr = PROVINCE_PLATE_ABBR[province];
    const columns = 4, cellW = 148, cellH = 78, gap = 12;
    const gridW = columns * cellW + (columns - 1) * gap;
    const rows = Math.ceil(cities.length / columns);
    const fullH = rows * cellH + (rows - 1) * gap;
    const maxView = this.height - 160 - 96 - 108;
    const viewH = Math.min(fullH + 8,maxView);
    const panelW = 690;
    const panelH = 96 + viewH + 108;
    const panelX = (this.width - panelW) / 2;
    const panelY = Math.round((this.height - panelH) / 2);
    const gridX = Math.round((this.width - gridW) / 2);
    const art = this.chrome(root,panelX,panelY,panelW,panelH,`选择城市 · ${province}`,'车牌按城市发牌代号 · 如 洛阳 豫C');
    this.viewport = {x:gridX - 6,y:panelY + 90,w:gridW + 12,h:viewH};
    this.scrollMax = Math.max(0,fullH + 8 - viewH);

    const mask = uiNode('CityViewport',root,this.viewport.w,this.viewport.h);
    mask.setPosition(this.viewport.x + this.viewport.w/2 - 375,this.height/2 - (this.viewport.y + this.viewport.h/2));
    mask.addComponent(Mask);
    // Content uses its own top-left origin at the viewport's top-left; y grows down.
    const content = uiNode('CityContent',mask,this.viewport.w,fullH + 8);
    this.content = content;
    const contentArt = uiNode('CityCells',content,this.viewport.w,fullH + 8).addComponent(Graphics);
    const originY = this.viewport.h / 2; // design y (relative to viewport top) → local y = originY - y
    const localX = (x: number) => x - this.viewport.x - this.viewport.w/2;
    cities.forEach((city: CityPlate,index) => {
      const x = gridX + (index % columns) * (cellW + gap);
      const y = this.viewport.y + 4 + Math.floor(index / columns) * (cellH + gap);
      const selected = province === this.current && city.name === this.currentCity;
      const ry = y - this.viewport.y;
      fillCell(contentArt,localX(x),originY - ry - cellH,cellW,cellH,selected);
      const name = label(content,`City-${city.name}`,city.name,25,localX(x + cellW/2),originY - (ry + 30));
      name.node.getComponent(UITransform)!.setContentSize(cellW - 12,34);
      name.overflow = Label.Overflow.SHRINK;
      name.color = selected ? ink : cream;
      name.isBold = true;
      const code = label(content,`CityCode-${city.name}`,`${abbr}${city.code}`,18,localX(x + cellW/2),originY - (ry + 58));
      code.color = selected ? ink : gold;
      this.cells.push({key:city.name,x,y,w:cellW,h:cellH});
    });
    if (this.scrollMax > 0) {
      const hint = label(root,'CityScrollHint','上下滑动查看更多',17,0,this.height/2 - (this.viewport.y + this.viewport.h + 10));
      hint.color = new Color(255,231,173,170);
    }
    const by = panelY + panelH - 76;
    this.button(root,art,'back','← 换省份',panelX + 40,by,280,60);
    this.button(root,art,'skip',`只选${province}`,panelX + panelW - 320,by,280,60,true);
    this.scrollTo(0);
  }

  private scrollTo(value: number): void {
    this.scrollY = Math.max(0,Math.min(this.scrollMax,value));
    if (this.content) this.content.setPosition(0,this.scrollY);
  }

  private designPoint(event: EventTouch): {x: number; y: number} {
    const p = event.getUILocation();
    const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x,p.y,0));
    return {x:local.x + 375,y:this.height/2 - local.y};
  }

  private touchStart(event: EventTouch): void {
    this.dragged = false;
    if (this.step !== 'city' || this.scrollMax <= 0) { this.dragStartY = null; return; }
    const p = this.designPoint(event);
    this.dragStartY = contains(this.viewport,p.x,p.y) ? p.y : null;
    this.dragStartScroll = this.scrollY;
  }

  private touchMove(event: EventTouch): void {
    if (this.dragStartY === null) return;
    const p = this.designPoint(event);
    const dy = this.dragStartY - p.y;
    if (Math.abs(dy) > DRAG_SLOP) this.dragged = true;
    if (this.dragged) this.scrollTo(this.dragStartScroll + dy);
  }

  debugState(): object {
    const screenWidth = typeof window === 'undefined' ? this.width : window.innerWidth;
    const screenHeight = typeof window === 'undefined' ? this.height : window.innerHeight;
    const toScreen = (item: PickerRect, dy = 0) => ({
      screenX:(item.x + item.w/2) / this.width * screenWidth,
      screenY:(item.y - dy + item.h/2) / this.height * screenHeight,
      screenLeft:item.x / this.width * screenWidth,
      screenRight:(item.x + item.w) / this.width * screenWidth,
      screenTop:(item.y - dy) / this.height * screenHeight,
      screenBottom:(item.y - dy + item.h) / this.height * screenHeight,
    });
    const dy = this.step === 'city' ? this.scrollY : 0;
    const points = this.cells.map(item => ({key:item.key,province:this.step === 'province' ? item.key : this.province,...toScreen(item,dy)}));
    const button = (key: string) => { const b = this.buttons.find(item => item.key === key); return b ? toScreen(b) : null; };
    return {
      visible:!this.destroyed,
      step:this.step,
      province:this.province,
      provinceCount:this.step === 'province' ? points.length : PROVINCES.length,
      cityCount:this.step === 'city' ? points.length : 0,
      points,
      scroll:{y:this.scrollY,max:this.scrollMax},
      viewport:this.step === 'city' ? toScreen(this.viewport) : null,
      cancel:button('cancel'),
      back:button('back'),
      skip:button('skip'),
    };
  }
}

function fillCell(art: Graphics, x: number, y: number, w: number, h: number, selected: boolean): void {
  fill(art,selected ? gold : cell,x,y - 3,w,h,16);
  if (selected) return;
  fill(art,cellGlow,x + 2,y - 1,w - 4,h - 4,14);
  art.strokeColor = new Color(255,207,111,150);
  art.lineWidth = 1.5;
  art.roundRect(x + 1,y + 1,w - 2,h - 2,16);
  art.stroke();
}

function contains(rect: PickerRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
