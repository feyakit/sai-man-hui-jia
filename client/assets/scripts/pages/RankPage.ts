import { Color, Graphics, Label, Node, UITransform } from 'cc';
import type { RankEntry, RankSnapshot } from '../core/rank/rank';
import {
  RANK_ERROR_TEXT,
  RANK_EMPTY_TEXT,
  RANK_LOADING_TEXT,
  RANK_RETRY_TEXT,
  RANK_TITLE,
  findRankEntry,
  formatRankSummary,
  formatRankToday,
  formatYourProvince,
} from '../core/rank/rank';
import { RankApi } from '../services/RankApi';
import { fill, label, uiNode } from '../ui/UIKit';

const gold = new Color(255, 207, 111);
const paleGold = new Color(255, 231, 173);
const cream = new Color(255, 246, 229);
const ink = new Color(51, 22, 19);
const deep = new Color(22, 9, 22, 246);
const panel = new Color(84, 19, 30, 235);
const rowDark = new Color(52, 14, 27, 228);
const rowLight = new Color(94, 24, 34, 232);
const ownRow = new Color(255, 207, 111, 44);
const muted = new Color(222, 190, 164);

type RankStatus = 'loading' | 'ready' | 'error';

interface RankRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Full-page leaderboard overlay with real API data only. */
export class RankPage {
  readonly node: Node;
  private readonly api: RankApi;
  private readonly height: number;
  private readonly width = 750;
  private readonly listLayer: Node;
  private readonly listArt: Graphics;
  private readonly statusLabel: Label;
  private readonly summary: Label;
  private readonly chrome: Graphics;
  private readonly backRect: RankRect = {x:30,y:34,w:126,h:54};
  private retryRect = {x:225,y:0,w:300,h:60};
  private readonly debugHook: object;
  private status: RankStatus = 'loading';
  private snapshot?: RankSnapshot;
  private destroyed = false;

  constructor(
    parent: Node,
    height: number,
    private readonly onBack: () => void,
    api: RankApi = new RankApi(),
  ) {
    this.api = api;
    this.height = Math.max(1334,height);
    this.node = uiNode('RankPage',parent,this.width,this.height);
    this.chrome = uiNode('RankChrome',this.node,this.width,this.height).addComponent(Graphics);
    this.listArt = uiNode('RankListArt',this.node,this.width,this.height).addComponent(Graphics);
    this.listLayer = uiNode('RankList',this.node,this.width,this.height);
    this.statusLabel = label(this.node,'RankStatus',RANK_LOADING_TEXT,28,0,0);
    this.statusLabel.color = paleGold;
    this.summary = label(this.node,'RankSummary','',19,0,this.height/2 - 151);
    this.summary.color = cream;
    this.drawChrome();
    this.debugHook = Object.freeze({
      getState: () => this.debugState(),
      press: (x: number,y: number) => this.press(x,y),
      retry: () => void this.load(),
    });
    if (typeof window !== 'undefined') {
      (window as Window & {__rank?: object}).__rank = this.debugHook;
    }
    this.node.once(Node.EventType.NODE_DESTROYED,() => {
      this.destroyed = true;
      if (typeof window !== 'undefined' && (window as Window & {__rank?: object}).__rank === this.debugHook) {
        delete (window as Window & {__rank?: object}).__rank;
      }
    });
    this.renderLoading();
    void this.load();
  }

  press(x: number, y: number): boolean {
    if (this.destroyed) return false;
    if (contains(this.backRect,x,y)) {
      this.onBack();
      return true;
    }
    if (this.status === 'error' && contains(this.retryRect,x,y)) {
      void this.load();
    }
    return true;
  }

  get snapshotData(): RankSnapshot | undefined { return this.snapshot; }

  private async load(): Promise<void> {
    this.renderLoading();
    try {
      const snapshot = await this.api.fetchRank();
      if (this.destroyed || !this.node.isValid) return;
      this.snapshot = snapshot;
      this.status = 'ready';
      this.renderReady(snapshot);
    } catch {
      if (this.destroyed || !this.node.isValid) return;
      this.snapshot = undefined;
      this.status = 'error';
      this.renderError();
    }
  }

  private drawChrome(): void {
    const g = this.chrome;
    const box = (color: Color,x: number,y: number,w: number,h: number,radius = 0) => {
      fill(g,color,x - 375,this.height/2 - y - h,w,h,radius);
    };
    const strokeBox = (x: number,y: number,w: number,h: number,radius: number) => {
      g.roundRect(x - 375,this.height/2 - y - h,w,h,radius);
      g.stroke();
    };
    fill(g,new Color(3,4,14,250),-375,-this.height/2,750,this.height);
    fill(g,new Color(31,9,26,200),-375,this.height/2 - 260,750,260);
    fill(g,new Color(64,12,28,150),-375,-this.height/2,750,220);
    fill(g,new Color(255,207,111,34),-375,this.height/2 - 250,750,2);
    fill(g,new Color(255,207,111,24),-375,-this.height/2 + 150,750,2);

    const back = this.backRect;
    box(new Color(70,18,29,238),back.x,back.y,back.w,back.h,18);
    g.strokeColor = new Color(255,207,111,175);
    g.lineWidth = 1.5;
    strokeBox(back.x,back.y,back.w,back.h,18);
    const backLabel = label(this.node,'RankBack','返回',22,back.x + back.w/2 - 375,this.height/2 - (back.y + back.h/2));
    backLabel.color = paleGold;
    label(this.node,'RankBackArrow','‹',34,back.x + 23 - 375,this.height/2 - (back.y + back.h/2)).color = gold;

    const title = label(this.node,'RankTitle',RANK_TITLE,34,0,this.height/2 - 103);
    title.color = gold;
    label(this.node,'RankKicker','乡亲们的年货，都装到哪一步了？',18,0,this.height/2 - 142).color = muted;
  }

  private renderLoading(): void {
    this.status = 'loading';
    this.clearList();
    this.summary.string = '';
    this.statusLabel.node.active = true;
    this.statusLabel.string = RANK_LOADING_TEXT;
    this.statusLabel.color = paleGold;
    this.statusLabel.node.setPosition(0,0);
    this.statusLabel.fontSize = 28;
    this.statusLabel.lineHeight = 34;
  }

  private renderError(): void {
    this.clearList();
    this.summary.string = '';
    this.statusLabel.node.active = true;
    this.statusLabel.string = RANK_ERROR_TEXT;
    this.statusLabel.color = paleGold;
    this.statusLabel.node.setPosition(0,60);
    this.statusLabel.fontSize = 28;
    this.statusLabel.lineHeight = 34;
    this.retryRect.y = Math.round(this.height/2 + 20);
    fill(this.listArt,new Color(98,24,34,230),this.retryRect.x - 375,this.height/2 - this.retryRect.y - this.retryRect.h,this.retryRect.w,this.retryRect.h,20);
    this.listArt.strokeColor = gold;
    this.listArt.lineWidth = 2;
    this.listArt.roundRect(this.retryRect.x + 2 - 375,this.height/2 - this.retryRect.y - this.retryRect.h + 2,this.retryRect.w - 4,this.retryRect.h - 4,18);
    this.listArt.stroke();
    const retry = label(this.listLayer,'RankRetry',RANK_RETRY_TEXT,24,0,this.height/2 - (this.retryRect.y + this.retryRect.h/2));
    retry.color = cream;
  }

  private renderReady(snapshot: RankSnapshot): void {
    this.statusLabel.node.active = false;
    this.summary.string = formatRankSummary(snapshot);
    this.clearList();
    const entries = snapshot.provinces;
    if (!entries.length) {
      const empty = label(this.node,'RankEmpty',RANK_EMPTY_TEXT,26,0,this.height/2 - this.height * .47);
      empty.color = paleGold;
      this.listLayer.addChild(empty.node);
    } else {
      this.drawEntries(entries);
    }
    this.drawOwnProvince(snapshot,entries);
  }

  private drawEntries(entries: readonly RankEntry[]): void {
    const listTop = 226;
    const footerTop = this.height - 126;
    const available = Math.max(180,footerTop - listTop - 20);
    const rowH = Math.max(28,Math.min(60,Math.floor(available / entries.length)));
    const rowW = 678;
    const rowX = 36;
    const fontSize = rowH >= 50 ? 24 : rowH >= 40 ? 22 : rowH >= 34 ? 19 : 17;
    const headerY = 184;
    const headerSize = 17;
    const columns = [
      {x:72,label:'名次'},
      {x:214,label:'省份'},
      {x:516,label:'通关'},
      {x:634,label:'今日'},
    ];
    for (const column of columns) {
      const text = label(this.listLayer,`RankHead-${column.label}`,column.label,headerSize,0,this.height/2 - headerY);
      text.node.getComponent(UITransform)!.setContentSize(150,24);
      text.node.setPosition(column.x - 375,this.height/2 - headerY);
      text.color = muted;
      text.overflow = Label.Overflow.SHRINK;
    }
    const own = this.api.province;
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const y = listTop + index * rowH;
      const isOwn = entry.province === own;
      fill(
        this.listArt,
        isOwn ? ownRow : index % 2 === 0 ? rowDark : rowLight,
        rowX - 375,this.height/2 - y - (rowH - 4),rowW,rowH - 4,Math.min(18,Math.round(rowH/2) - 2),
      );
      if (isOwn) {
        this.listArt.strokeColor = gold;
        this.listArt.lineWidth = 2;
        this.listArt.roundRect(rowX + 1 - 375,this.height/2 - y - (rowH - 4) + 1,rowW - 2,rowH - 6,Math.min(17,Math.round(rowH/2) - 3));
        this.listArt.stroke();
      }
      const values = [
        {x:columns[0].x,text:`${index + 1}`,width:80},
        {x:columns[1].x,text:entry.province,width:220},
        {x:columns[2].x,text:`${entry.total}`,width:150},
        {x:columns[3].x,text:formatRankToday(entry.today),width:170},
      ];
      for (let column = 0; column < values.length; column++) {
        const item = values[column];
        const text = label(this.listLayer,`Rank-${index}-${column}`,item.text,fontSize,0,0);
        text.node.getComponent(UITransform)!.setContentSize(item.width,rowH);
        text.node.setPosition(item.x - 375,this.height/2 - (y + (rowH - 4)/2));
        text.color = isOwn ? paleGold : column === 0 ? gold : cream;
        text.isBold = column === 0 || isOwn;
        text.overflow = Label.Overflow.SHRINK;
      }
    }
  }

  private drawOwnProvince(snapshot: RankSnapshot, entries: readonly RankEntry[]): void {
    const own = this.api.province;
    const entry = own ? findRankEntry(snapshot,own) : undefined;
    const rank = entry ? entries.findIndex(item => item.province === entry.province) + 1 : undefined;
    const footerY = this.height - 112;
    fill(this.listArt,new Color(58,14,27,242),36 - 375,this.height/2 - footerY - 78,678,78,24);
    this.listArt.strokeColor = new Color(255,207,111,160);
    this.listArt.lineWidth = 1.5;
    this.listArt.roundRect(38 - 375,this.height/2 - footerY - 78 + 2,674,74,22);
    this.listArt.stroke();
    const text = label(this.listLayer,'RankOwnProvince',formatYourProvince(own,entry,rank),21,0,this.height/2 - (footerY + 39));
    text.node.getComponent(UITransform)!.setContentSize(646,60);
    text.overflow = Label.Overflow.SHRINK;
    text.color = own ? paleGold : muted;
  }

  private clearList(): void {
    for (const child of [...this.listLayer.children]) child.destroy();
    this.listArt.clear();
  }

  private debugState(): object {
    const screenWidth = typeof window === 'undefined' ? this.width : window.innerWidth;
    const screenHeight = typeof window === 'undefined' ? this.height : window.innerHeight;
    return {
      status:this.status,
      title:RANK_TITLE,
      province:this.api.province,
      provinces:this.snapshot?.provinces ?? [],
      totalClears:this.snapshot?.totalClears ?? null,
      todayClears:this.snapshot?.todayClears ?? null,
      errorText:this.status === 'error' ? RANK_ERROR_TEXT : null,
      buttons:{
        back:{screenX:(this.backRect.x + this.backRect.w/2)/this.width*screenWidth,screenY:(this.backRect.y + this.backRect.h/2)/this.height*screenHeight},
        retry:this.status === 'error'
          ? {screenX:(this.retryRect.x + this.retryRect.w/2)/this.width*screenWidth,screenY:(this.retryRect.y + this.retryRect.h/2)/this.height*screenHeight}
          : null,
      },
    };
  }
}

function contains(rect: RankRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

