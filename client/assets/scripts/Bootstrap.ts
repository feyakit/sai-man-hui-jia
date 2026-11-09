import { _decorator, Color, Component, Director, Graphics, Layers, Node, ResolutionPolicy, director, view } from 'cc';
import { EDITOR } from 'cc/env';
import { GAME_SUBTITLE, GAME_TITLE } from './config/brand';
import { shanghaiDate } from './core/date';
import { stage1 } from './core/stage1';
import type { Level } from './core/types';
import { StagePage } from './pages/StagePage';
import { WebPlatform } from './platform/WebPlatform';
import { Api } from './services/Api';
import { fill, label, uiNode } from './ui/UIKit';
import { drawHomeRoad, drawWelcomeHome } from './ui/JourneyArt';

const {ccclass} = _decorator;

@ccclass('Bootstrap')
export class Bootstrap extends Component {
  private stage?: StagePage;
  private readonly platform = new WebPlatform();
  private readonly api = new Api(this.platform);

  start(): void {
    if (this.platform.hasLevelOverride()) void this.challenge();
    else this.show(stage1(shanghaiDate()));
  }

  update(): void { this.stage?.tick(); }

  private show(level: Level): void {
    this.node.destroyAllChildren();
    this.stage = new StagePage(this.node,level,() => this.platform.now(),() => {
      if (level.stage === 1) void this.challenge();
      else this.message('行李塞满了，回家！',() => this.show(stage1(shanghaiDate())));
    });
  }

  private async challenge(): Promise<void> {
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
