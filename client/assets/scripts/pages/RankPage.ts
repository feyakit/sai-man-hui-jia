import { Color, Graphics, Label, Node, Sprite, UITransform } from 'cc';
import {
  RANK_ERROR_TEXT,
  RANK_EMPTY_TEXT,
  RANK_LOADING_TEXT,
  RANK_RETRY_TEXT,
  RANK_TITLE,
  buildRankRows,
  formatRankSummary,
  formatRankToday,
  type RankDisplayRow,
  type RankSnapshot,
} from '../core/rank/rank';
import { loadArt } from '../services/OptionalResources';
import { RankApi } from '../services/RankApi';
import { fill, label, uiNode } from '../ui/UIKit';

const gold = new Color(255, 207, 111);
const brightGold = new Color(255, 226, 151);
const paleGold = new Color(255, 235, 190);
const cream = new Color(255, 246, 229);
const warmCream = new Color(255, 239, 207);
const ink = new Color(75, 28, 20);
const red = new Color(184, 29, 42);
const brightRed = new Color(211, 52, 48);
const deepRed = new Color(84, 18, 27);
const wine = new Color(57, 12, 22, 236);
const rowWine = new Color(89, 24, 34, 238);
const muted = new Color(151, 126, 113);
const silver = new Color(218, 224, 228);
const bronze = new Color(205, 142, 86);

type RankStatus = 'loading' | 'ready' | 'error';

interface RankRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface ScreenRect extends RankRect {
  readonly screenX: number;
  readonly screenY: number;
  readonly screenLeft: number;
  readonly screenRight: number;
  readonly screenTop: number;
  readonly screenBottom: number;
  readonly screenW: number;
  readonly screenH: number;
}

/** Full-page leaderboard overlay with real API data only. */
export class RankPage {
  readonly node: Node;
  private readonly api: RankApi;
  private readonly height: number;
  private readonly width = 750;
  private readonly background: Sprite;
  private readonly chrome: Graphics;
  private readonly contentLayer: Node;
  private readonly contentArt: Graphics;
  private readonly backRect: RankRect = {x:24,y:24,w:112,h:50};
  private readonly bottomBackRect: RankRect;
  private readonly startRect: RankRect;
  private prevRect: RankRect;
  private nextRect: RankRect;
  private retryRect: RankRect = {x:225,y:0,w:300,h:64};
  private readonly debugHook: object;
  private status: RankStatus = 'loading';
  private snapshot?: RankSnapshot;
  private rows: RankDisplayRow[] = [];
  private page = 0;
  private pageCount = 1;
  private rowsPerPage = 1;
  private listTop = 286;
  private destroyed = false;

  constructor(
    parent: Node,
    height: number,
    private readonly onBack: () => void,
    private readonly onStart?: () => void,
    api: RankApi = new RankApi(),
  ) {
    this.api = api;
    this.height = Math.max(1334,height);
    this.node = uiNode('RankPage',parent,this.width,this.height);
    this.background = uiNode('RankNight',this.node,this.width,this.height).addComponent(Sprite);
    this.background.sizeMode = Sprite.SizeMode.CUSTOM;
    this.background.trim = false;
    this.background.enabled = false;
    void loadArt('ui/bg_night').then(frame => {
      if (!frame || !this.node.isValid) return;
      this.background.spriteFrame = frame;
      this.background.enabled = true;
      this.layoutBackground();
    });
    this.chrome = uiNode('RankChrome',this.node,this.width,this.height).addComponent(Graphics);
    this.contentLayer = uiNode('RankContent',this.node,this.width,this.height);
    this.contentArt = this.contentLayer.addComponent(Graphics);
    this.bottomBackRect = {x:518,y:this.height - 124,w:196,h:74};
    this.startRect = {x:36,y:this.height - 124,w:466,h:74};
    this.prevRect = {x:36,y:this.height - 292,w:176,h:48};
    this.nextRect = {x:538,y:this.height - 292,w:176,h:48};
    this.layoutBackground();
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
    if (contains(this.backRect,x,y) || contains(this.bottomBackRect,x,y)) {
      this.onBack();
      return true;
    }
    if (contains(this.startRect,x,y)) {
      this.onStart?.();
      return true;
    }
    if (this.status === 'ready' && this.pageCount > 1) {
      if (contains(this.prevRect,x,y) && this.page > 0) {
        this.page--;
        this.renderReady();
        return true;
      }
      if (contains(this.nextRect,x,y) && this.page < this.pageCount - 1) {
        this.page++;
        this.renderReady();
        return true;
      }
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
      this.rows = buildRankRows(snapshot,this.api.province);
      this.status = 'ready';
      this.page = 0;
      this.renderReady();
    } catch {
      if (this.destroyed || !this.node.isValid) return;
      this.snapshot = undefined;
      this.rows = [];
      this.status = 'error';
      this.renderError();
    }
  }

  private layoutBackground(): void {
    const scale = Math.max(1,this.height / 1334);
    this.background.node.getComponent(UITransform)!.setContentSize(750 * scale,1334 * scale);
    this.background.node.setPosition(0,0);
  }

  private drawChrome(): void {
    const g = this.chrome;
    const top = this.height / 2;
    const rect = (color: Color,x: number,y: number,w: number,h: number,radius = 0) => {
      fill(g,color,x - 375,top - y - h,w,h,radius);
    };
    rect(new Color(7,8,22,112),0,0,750,this.height);
    rect(new Color(43,8,18,104),0,0,750,250,0);
    rect(new Color(28,8,17,130),0,this.height - 260,750,260,0);
    this.drawLanterns(g,48,34);
    this.drawLanterns(g,702,34);

    rect(new Color(21,7,13,150),22,24,116,54,18);
    rect(new Color(74,17,27,246),24,26,112,50,17);
    g.strokeColor = new Color(255,216,136,190);
    g.lineWidth = 1.5;
    g.roundRect(26 - 375,top - 74,108,46,15);
    g.stroke();
    label(this.node,'RankBackArrow','‹',32,26 - 375,top - 49).color = gold;
    label(this.node,'RankBack','返回',21,43 - 375,top - 49).color = paleGold;

    rect(new Color(25,7,15,190),60,78,630,134,30);
    rect(new Color(99,22,29,248),66,84,618,122,26);
    rect(gold,72,90,606,110,23);
    rect(red,78,96,594,98,19);
    rect(brightRed,86,104,578,82,15);
    rect(new Color(255,226,151,118),132,174,486,2,1);
    const title = label(this.node,'RankTitle',RANK_TITLE,34,0,top - 122);
    title.color = cream;
    title.isBold = true;
    title.node.getComponent(UITransform)!.setContentSize(590,45);
    title.overflow = Label.Overflow.SHRINK;
    const subtitle = label(this.node,'RankKicker','灯笼亮起，等你的家乡拔得头筹',18,0,top - 164);
    subtitle.color = paleGold;
    subtitle.node.getComponent(UITransform)!.setContentSize(550,26);
    subtitle.overflow = Label.Overflow.SHRINK;
  }

  private drawLanterns(g: Graphics,x: number,y: number): void {
    const top = this.height / 2;
    g.strokeColor = new Color(255,210,124,150);
    g.lineWidth = 2;
    g.moveTo(x - 375,top - y);
    g.lineTo(x - 375,top - y - 26);
    g.stroke();
    fill(g,new Color(255,132,74,30),x - 33 - 375,top - y - 92,66,88,28);
    fill(g,gold,x - 25 - 375,top - y - 27,50,9,4);
    fill(g,new Color(185,31,39),x - 29 - 375,top - y - 92,58,70,22);
    fill(g,new Color(241,71,52),x - 22 - 375,top - y - 84,44,54,18);
    fill(g,new Color(255,213,129,145),x - 14 - 375,top - y - 77,9,39,4);
    fill(g,gold,x - 23 - 375,top - y - 96,46,8,4);
    fill(g,new Color(255,210,124),x - 3 - 375,top - y - 104,6,9,3);
    g.strokeColor = new Color(255,210,124,170);
    g.moveTo(x - 375,top - y - 96);
    g.lineTo(x - 7 - 375,top - y - 117);
    g.lineTo(x + 5 - 375,top - y - 117);
    g.stroke();
    fill(g,gold,x - 4 - 375,top - y - 16,8,18,3);
  }

  private renderLoading(): void {
    this.status = 'loading';
    this.rows = [];
    this.page = 0;
    this.clearContent();
    this.drawSummary(null);
    const card = {x:86,y:338,w:578,h:218};
    this.drawCard(card,wine,gold);
    const title = this.contentLabel('RankLoading',RANK_LOADING_TEXT,28,375,card.y + 80,paleGold);
    title.node.getComponent(UITransform)!.setContentSize(520,42);
    title.overflow = Label.Overflow.SHRINK;
    const hint = this.contentLabel('RankLoadingHint','正在看看乡亲们的年货都装到哪一步了',20,375,card.y + 143,muted);
    hint.node.getComponent(UITransform)!.setContentSize(500,34);
    hint.overflow = Label.Overflow.SHRINK;
    this.drawFooter();
  }

  private renderError(): void {
    this.clearContent();
    this.drawSummary(null);
    const card = {x:64,y:322,w:622,h:276};
    this.drawCard(card,wine,gold);
    const title = this.contentLabel('RankError',RANK_ERROR_TEXT,30,375,card.y + 78,paleGold);
    title.node.getComponent(UITransform)!.setContentSize(540,44);
    title.overflow = Label.Overflow.SHRINK;
    const hint = this.contentLabel('RankErrorHint','检查网络后再试一次，排行会在这里等你',20,375,card.y + 139,muted);
    hint.node.getComponent(UITransform)!.setContentSize(520,34);
    hint.overflow = Label.Overflow.SHRINK;
    this.retryRect = {x:225,y:card.y + 174,w:300,h:64};
    this.drawButton(this.retryRect,gold,ink,RANK_RETRY_TEXT,25,true);
    this.drawFooter();
  }

  private renderReady(): void {
    this.clearContent();
    const snapshot = this.snapshot;
    if (!snapshot) return;
    this.drawSummary(snapshot);
    const empty = !snapshot.provinces.some(entry => entry.total > 0);
    if (empty) {
      const callout = {x:46,y:272,w:658,h:126};
      this.drawCard(callout,new Color(110,22,29,246),gold);
      const title = this.contentLabel('RankEmpty',RANK_EMPTY_TEXT,26,375,callout.y + 52,cream);
      title.node.getComponent(UITransform)!.setContentSize(600,42);
      title.overflow = Label.Overflow.SHRINK;
      const hint = this.contentLabel('RankEmptyHint','第一箱年货，等你来装车',19,375,callout.y + 94,paleGold);
      hint.node.getComponent(UITransform)!.setContentSize(520,30);
      hint.overflow = Label.Overflow.SHRINK;
      this.listTop = 424;
    } else {
      this.listTop = 282;
    }
    this.drawList(empty);
    this.drawFooter();
  }

  private drawSummary(snapshot: RankSnapshot | null): void {
    const pill = {x:232,y:220,w:286,h:38};
    this.drawCard(pill,new Color(42,10,20,170),new Color(255,207,111,90));
    const text = snapshot ? formatRankSummary(snapshot) : '全国乡亲 · 共赴团圆';
    const summary = this.contentLabel('RankSummary',text,18,375,pill.y + 19,snapshot ? cream : muted);
    summary.node.getComponent(UITransform)!.setContentSize(270,28);
    summary.overflow = Label.Overflow.SHRINK;
  }

  private drawList(empty: boolean): void {
    const footerTop = this.height - 216;
    const listBottom = footerTop - 16;
    const pagerTop = listBottom - 48;
    const rowsBottom = pagerTop - 12;
    const headerTop = this.listTop;
    const headerH = 28;
    const rowH = 54;
    const gap = 7;
    const available = Math.max(rowH + gap,rowsBottom - headerTop - headerH - 8);
    this.rowsPerPage = Math.max(4,Math.floor(available / (rowH + gap)));
    this.pageCount = Math.max(1,Math.ceil(this.rows.length / this.rowsPerPage));
    this.page = Math.max(0,Math.min(this.pageCount - 1,this.page));

    const header = {x:36,y:headerTop,w:678,h:headerH};
    fill(this.contentArt,new Color(51,12,22,180),header.x - 375,this.height / 2 - header.y - header.h,header.w,header.h,12);
    const columns = [
      {x:76,w:88,text:'名次'},
      {x:236,w:210,text:'省份'},
      {x:503,w:132,text:'通关'},
      {x:642,w:110,text:'今日'},
    ];
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index];
      const text = this.contentLabel(`RankHead-${index}`,column.text,16,column.x,headerTop + 15,muted);
      text.node.getComponent(UITransform)!.setContentSize(column.w,24);
      text.overflow = Label.Overflow.SHRINK;
    }

    const start = this.page * this.rowsPerPage;
    const pageRows = this.rows.slice(start,start + this.rowsPerPage);
    for (let index = 0; index < pageRows.length; index++) {
      const row = pageRows[index];
      const top = headerTop + headerH + 8 + index * (rowH + gap);
      this.drawRow(row,top,rowH,index);
    }

    this.prevRect = {x:36,y:pagerTop,w:176,h:48};
    this.nextRect = {x:538,y:pagerTop,w:176,h:48};
    this.drawPagerButton(this.prevRect,this.page > 0,'上一页');
    this.drawPagerButton(this.nextRect,this.page < this.pageCount - 1,'下一页');
    const pageText = this.contentLabel('RankPageCount',`第 ${this.page + 1} / ${this.pageCount} 页`,19,375,pagerTop + 24,empty ? muted : paleGold);
    pageText.node.getComponent(UITransform)!.setContentSize(280,30);
    pageText.overflow = Label.Overflow.SHRINK;
  }

  private drawRow(row: RankDisplayRow,top: number,height: number,index: number): void {
    const x = 36;
    const w = 678;
    const radius = 16;
    const rowColor = row.own
      ? new Color(255,231,171,248)
      : index % 2 === 0 ? cream : warmCream;
    fill(this.contentArt,new Color(21,7,13,95),x - 375 + 2,this.height / 2 - top - height + 2,w,height,radius);
    fill(this.contentArt,rowColor,x - 375,this.height / 2 - top - height,w,height,radius);
    if (row.own) {
      this.contentArt.strokeColor = gold;
      this.contentArt.lineWidth = 2.5;
      this.contentArt.roundRect(x + 2 - 375,this.height / 2 - top - height + 2,w - 4,height - 4,radius - 2);
      this.contentArt.stroke();
      fill(this.contentArt,red,x - 375,this.height / 2 - top - height + 10,6,height - 20,3);
    }

    const centerY = top + height / 2;
    if (row.badge) {
      const badgeColor = row.badge === 1 ? gold : row.badge === 2 ? silver : bronze;
      fill(this.contentArt,badgeColor,76 - 375 - 20,this.height / 2 - centerY - 20,40,40,20);
      fill(this.contentArt,colorWithAlpha(badgeColor,72),76 - 375 - 15,this.height / 2 - centerY - 15,30,30,15);
    }
    const rankText = row.badge ? `${row.badge}` : row.rank ? `${row.rank}` : '—';
    const rank = this.contentLabel(`Rank-${top}-rank`,rankText,row.badge ? 23 : 21,76,centerY,row.badge ? ink : row.waiting ? muted : deepRed);
    rank.isBold = !!row.badge;
    rank.node.getComponent(UITransform)!.setContentSize(70,height - 4);
    rank.overflow = Label.Overflow.SHRINK;

    const provinceText = row.own ? `★ ${row.province}` : row.province;
    const province = this.contentLabel(`Rank-${top}-province`,provinceText,23,236,centerY,row.own ? deepRed : ink);
    province.isBold = row.own;
    province.node.getComponent(UITransform)!.setContentSize(205,height - 4);
    province.overflow = Label.Overflow.SHRINK;

    const totalText = row.waiting ? '待塞满' : `${Math.max(0,Math.floor(row.total))} 人`;
    const total = this.contentLabel(`Rank-${top}-total`,totalText,row.waiting ? 19 : 21,503,centerY,row.waiting ? muted : deepRed);
    total.isBold = !row.waiting;
    total.node.getComponent(UITransform)!.setContentSize(132,height - 4);
    total.overflow = Label.Overflow.SHRINK;

    const todayText = row.waiting ? '—' : formatRankToday(row.today);
    const today = this.contentLabel(`Rank-${top}-today`,todayText,19,642,centerY,row.waiting ? muted : red);
    today.isBold = !row.waiting;
    today.node.getComponent(UITransform)!.setContentSize(110,height - 4);
    today.overflow = Label.Overflow.SHRINK;
  }

  private drawPagerButton(rect: RankRect,enabled: boolean,text: string): void {
    this.drawCard(
      rect,
      enabled ? new Color(88,20,31,242) : new Color(56,44,49,228),
      enabled ? new Color(255,218,145,190) : new Color(136,119,109,130),
      13,
    );
    const item = this.contentLabel(`RankPager-${text}`,text,21,375,rect.y + rect.h / 2,enabled ? paleGold : new Color(160,145,137));
    item.node.getComponent(UITransform)!.setContentSize(rect.w - 24,rect.h - 4);
    item.overflow = Label.Overflow.SHRINK;
  }

  private drawFooter(): void {
    const footerTop = this.height - 216;
    const card = {x:36,y:footerTop,w:678,h:78};
    fill(this.contentArt,new Color(20,7,13,110),card.x - 375 + 2,this.height / 2 - card.y - card.h + 3,card.w,card.h,24);
    fill(this.contentArt,cream,card.x - 375,this.height / 2 - card.y - card.h,card.w,card.h,24);
    this.contentArt.strokeColor = gold;
    this.contentArt.lineWidth = 2;
    this.contentArt.roundRect(card.x + 2 - 375,this.height / 2 - card.y - card.h + 2,card.w - 4,card.h - 4,22);
    this.contentArt.stroke();
    fill(this.contentArt,red,card.x + 20 - 375,this.height / 2 - card.y - card.h + 20,5,card.h - 40,3);
    const info = this.footerText();
    const own = this.contentLabel('RankOwnProvince',info,22,375,card.y + card.h / 2,this.api.province ? deepRed : muted);
    own.isBold = !!this.api.province;
    own.node.getComponent(UITransform)!.setContentSize(636,card.h - 12);
    own.overflow = Label.Overflow.SHRINK;

    this.drawButton(this.startRect,gold,ink,'去塞满',32,true,'第 1 关');
    this.drawButton(this.bottomBackRect,new Color(76,17,27,244),paleGold,'返回',27,false);
  }

  private footerText(): string {
    const own = this.api.province;
    if (!own) return '你的省份：未选择';
    const row = this.rows.find(item => item.province === own);
    if (!row || row.waiting || !row.rank) return `你的省份：${own} · 待塞满`;
    return `你的省份：${own} · 排第 ${row.rank} 名 · ${row.total} 人通关`;
  }

  private drawButton(
    rect: RankRect,
    color: Color,
    textColor: Color,
    text: string,
    size: number,
    primary: boolean,
    subtext?: string,
  ): void {
    if (primary) fill(this.contentArt,new Color(22,7,13,120),rect.x + 3 - 375,this.height / 2 - rect.y - rect.h - 4,rect.w,rect.h,24);
    fill(this.contentArt,color,rect.x - 375,this.height / 2 - rect.y - rect.h,rect.w,rect.h,24);
    if (!primary) {
      this.contentArt.strokeColor = new Color(255,217,139,190);
      this.contentArt.lineWidth = 1.5;
      this.contentArt.roundRect(rect.x + 2 - 375,this.height / 2 - rect.y - rect.h + 2,rect.w - 4,rect.h - 4,22);
      this.contentArt.stroke();
    }
    const title = this.contentLabel(`RankButton-${text}`,text,size,375,rect.y + rect.h / 2 - (subtext ? 9 : 0),textColor);
    title.isBold = primary;
    title.node.getComponent(UITransform)!.setContentSize(rect.w - 28,rect.h - 10);
    title.overflow = Label.Overflow.SHRINK;
    if (subtext) {
      const sub = this.contentLabel(`RankButton-${text}-sub`,subtext,15,375,rect.y + rect.h / 2 + 23,new Color(122,65,25));
      sub.node.getComponent(UITransform)!.setContentSize(rect.w - 30,22);
      sub.overflow = Label.Overflow.SHRINK;
    }
  }

  private drawCard(rect: RankRect,color: Color,border: Color,radius = 22): void {
    fill(this.contentArt,color,rect.x - 375,this.height / 2 - rect.y - rect.h,rect.w,rect.h,radius);
    this.contentArt.strokeColor = border;
    this.contentArt.lineWidth = 1.5;
    this.contentArt.roundRect(rect.x + 2 - 375,this.height / 2 - rect.y - rect.h + 2,rect.w - 4,rect.h - 4,Math.max(2,radius - 2));
    this.contentArt.stroke();
  }

  private contentLabel(
    name: string,
    text: string,
    size: number,
    x: number,
    top: number,
    color: Color,
  ): Label {
    const item = label(this.contentLayer,name,text,size,x - 375,this.height / 2 - top);
    item.color = color;
    return item;
  }

  private clearContent(): void {
    for (const child of [...this.contentLayer.children]) child.destroy();
    this.contentArt.clear();
  }

  private debugState(): object {
    const start = this.page * this.rowsPerPage;
    return {
      status:this.status,
      title:RANK_TITLE,
      province:this.api.province,
      provinces:this.snapshot?.provinces ?? [],
      totalClears:this.snapshot?.totalClears ?? null,
      todayClears:this.snapshot?.todayClears ?? null,
      errorText:this.status === 'error' ? RANK_ERROR_TEXT : null,
      emptyText:RANK_EMPTY_TEXT,
      page:this.page + 1,
      pages:this.pageCount,
      rowsPerPage:this.rowsPerPage,
      allRows:this.rows.map(row => ({
        province:row.province,
        total:row.total,
        today:row.today,
        rank:row.rank,
        badge:row.badge,
        own:row.own,
        waiting:row.waiting,
      })),
      rows:this.rows.slice(start,start + this.rowsPerPage).map(row => row.province),
      buttons:{
        back:this.screenRect(this.backRect),
        bottomBack:this.screenRect(this.bottomBackRect),
        start:this.screenRect(this.startRect),
        prev:this.status === 'ready' && this.pageCount > 1 ? this.screenRect(this.prevRect) : null,
        next:this.status === 'ready' && this.pageCount > 1 ? this.screenRect(this.nextRect) : null,
        retry:this.status === 'error' ? this.screenRect(this.retryRect) : null,
      },
      layout:{
        width:this.width,
        height:this.height,
        listTop:this.listTop,
        listBottom:this.height - 232,
        footerTop:this.height - 216,
      },
    };
  }

  private screenRect(rect: RankRect): ScreenRect {
    const screenWidth = typeof window === 'undefined' ? this.width : window.innerWidth;
    const screenHeight = typeof window === 'undefined' ? this.height : window.innerHeight;
    return {
      ...rect,
      screenX:(rect.x + rect.w / 2) / this.width * screenWidth,
      screenY:(rect.y + rect.h / 2) / this.height * screenHeight,
      screenLeft:rect.x / this.width * screenWidth,
      screenRight:(rect.x + rect.w) / this.width * screenWidth,
      screenTop:rect.y / this.height * screenHeight,
      screenBottom:(rect.y + rect.h) / this.height * screenHeight,
      screenW:rect.w / this.width * screenWidth,
      screenH:rect.h / this.height * screenHeight,
    };
  }
}

function colorWithAlpha(color: Color,alpha: number): Color {
  return new Color(color.r,color.g,color.b,alpha);
}

function contains(rect: RankRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
