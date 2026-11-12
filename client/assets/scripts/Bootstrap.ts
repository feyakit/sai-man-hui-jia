import { _decorator, Color, Component, Director, Graphics, Layers, Node, ResolutionPolicy, director, profiler, view } from 'cc';
import { EDITOR } from 'cc/env';
import { GAME_SUBTITLE, GAME_TITLE } from './config/brand';
import { shanghaiDate } from './core/date';
import { stage1 } from './core/stage1';
import type { Level } from './core/types';
import { HomePage } from './pages/HomePage';
import { StagePage } from './pages/StagePage';
import { StackPage, type StackPageAction } from './pages/StackPage';
import type { StackRoute } from './core/stack/stack-progress';
import { WebPlatform } from './platform/WebPlatform';
import { Api } from './services/Api';
import { RankApi } from './services/RankApi';
import { fill, label, uiNode } from './ui/UIKit';
import { drawHomeRoad, drawWelcomeHome } from './ui/JourneyArt';

const {ccclass} = _decorator;

@ccclass('Bootstrap')
export class Bootstrap extends Component {
  private stage?: StagePage;
  private stack?: StackPage;
  private home?: HomePage;
  private readonly platform = new WebPlatform();
  private readonly api = new Api(this.platform);
  private readonly rankApi = new RankApi();

  start(): void {
    void this.rankApi.flushPending().catch(() => undefined);
    const route = this.platform.route();
    if (route === 'stack') this.startStack(this.platform.stackStage());
    else if (route === 'mom') void this.startMomMode();
    else if (route === 'pack') this.startPack();
    else if (route === 'level') void this.challenge();
    else this.showHome();
  }

  update(): void { this.stage?.tick(); this.stack?.tick(); this.home?.tick(); }

  private showHome(): void {
    this.node.destroyAllChildren();
    this.stage = undefined;
    this.stack = undefined;
    this.home = new HomePage(this.node,{
      onStart:() => this.startStack(1),
      onDaily:() => this.startStack('daily'),
      onClassic:() => this.startPack(),
    });
  }

  private startPack(): void {
    if (this.platform.hasLevelOverride()) void this.challenge();
    else this.show(stage1(shanghaiDate()));
  }

  private show(level: Level): void {
    this.node.destroyAllChildren();
    this.stack = undefined;
    this.home = undefined;
    this.stage = new StagePage(this.node,level,() => this.platform.now(),action => {
      if (action === 'next') void this.challenge();
      else if (action === 'mom') void this.startMomMode();
      else if (action === 'first') this.show(stage1(shanghaiDate()));
      else this.show(level);
    });
  }

  private startStack(route: StackRoute): void {
    this.node.destroyAllChildren();
    this.stage = undefined;
    this.home = undefined;
    this.stack = new StackPage(this.node,route,(action: StackPageAction) => {
      if (route === 'daily') {
        if (action === 'replay') this.startStack('daily');
        else this.showHome();
      } else if (action === 'next') this.startStack(route+1);
      else if (action === 'first') this.startStack(1);
      else this.startStack(route);
    });
  }

  private async startMomMode(): Promise<void> {
    this.home = undefined;
    try {
      const level = await this.api.loadMom();
      if (this.node.isValid) this.show(level);
    } catch {
      if (this.node.isValid) this.message('妈妈模式读取失败，点屏幕重试',() => void this.startMomMode());
    }
  }

  private async challenge(): Promise<void> {
    this.home = undefined;
    this.message('年货装上车，准备跑最后一程');
    try {
      const level = await this.api.loadChallenge();
      if (this.node.isValid) this.show(level);
    } catch {
      if (this.node.isValid) this.message('挑战关读取失败，点屏幕重试',() => void this.challenge());
    }
  }

  private message(text: string, onTap?: () => void): void {
    this.stage = undefined;
    this.stack = undefined;
    this.home = undefined;
    this.node.destroyAllChildren();
    const size = view.getVisibleSize();
    const width = 750;
    const height = 1334;
    const screen = uiNode('Message',this.node,width,height);
    const scale = Math.min(size.width/width,size.height/height);
    screen.setScale(scale,scale,1);
    const art = screen.addComponent(Graphics);
    fill(art,new Color(255,246,229),-width/2,-height/2,width,height);
    drawHomeRoad(art,width,height,0);
    label(screen,'Brand',GAME_TITLE,62,0,549).color = new Color(255,246,229);
    label(screen,'Subtitle',GAME_SUBTITLE,25,0,488).color = new Color(255,222,181);
    const arrived = text === '行李塞满了，回家！';
    if (arrived) {
      drawWelcomeHome(art);
      label(screen,'Arrival','春运这一程 · 平安到家',26,0,320);
      label(screen,'Message',text,48,0,-66);
      label(screen,'Family','家里还亮着灯，年夜饭等你开席。',28,0,-139);
      fill(art,new Color(158,45,41),-148,-300,296,64,16);
      label(screen,'Again','再跑一趟',29,0,-268).color = new Color(255,246,229);
    } else {
      label(screen,'Message',text,32,0,0);
    }
    if (onTap) screen.once(Node.EventType.TOUCH_END,onTap);
  }
}

if (!EDITOR) {
  director.on(Director.EVENT_AFTER_SCENE_LAUNCH, (scene: Node) => {
    const canvas = scene.getChildByName('Canvas');
    if (!canvas) return;
    profiler?.hideStats();
    view.setDesignResolutionSize(750,1334,ResolutionPolicy.FIXED_WIDTH);
    let root = canvas.getChildByName('GameRoot');
    if (!root) {
      root = new Node('GameRoot');
      root.layer = Layers.Enum.UI_2D;
      canvas.addChild(root);
    }
    if (!root.getComponent(Bootstrap)) root.addComponent(Bootstrap);
  });
}
