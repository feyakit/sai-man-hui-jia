# V1 收尾对照清单

> 对照规格：`docs/spec-v1.2.md` 第 4.2–4.12 节
> 基线：`origin/work/m1-core`（`01eccb9`）
> 验收分支：`codex/v1-11-checklist`
> 代码提交：`76312ac`、`aff5d3f`、`f7e0251`、`796d42a`、`d56fe70`、`53ee7d1`

## 状态说明

- **已实现**：规格项已有代码或测试证据，当前可运行。
- **部分**：主流程可用，但与规格仍有可见或可测量的差距。
- **缺失**：规格要求尚未交付。
- **遗留**：需要改托盘架构、补产品资产或做真机/网络实测，不适合在本任务中临时打补丁。

## 4.2 屏幕布局

| 规格项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| 顶栏显示关卡、车型、倒计时、已装 n/N、设置按钮 | 已实现 | `client/assets/scripts/pages/StagePage.ts` 的 `layout()`、`updateControls()`、`layoutSettings()`；`tests/finish-integration.test.ts` 的 “settings gear opens a red-gold panel clear of the trunk and persists both toggles”。 |
| 后备箱区：车尾插画、打开的后备箱、箱内网格 | 已实现 | `client/assets/scripts/ui/StageArt.ts` 的 `drawCarRear()`、`drawTrunkFloor()`、`drawTrunkGrid()`；`tests/stage-art.test.ts` 的 “phone layout reserves separate header, open trunk and tray bands”。 |
| 格长按可用宽高向下取整，上限 110 | 已实现 | `StageArt.computeStageLayout()` 使用 `Math.floor(Math.min(110, ...))`；`tests/stage-art.test.ts` 的 “grid cell caps at 110 design pixels”。 |
| 禁放格与空格明显区分 | 已实现 | `StageArt.drawTrunkFloor()` / `drawTrunkGrid()` 为禁放格绘制深色底和细金斜纹，不加粗格线；关卡禁放数据由 `tools/config/v1-levels.json` 固定，`tests/v1-levels.test.ts` 校验。 |
| 托盘区一屏摆下、不滚动 | 部分 | 稀疏托盘可一屏放下；第 2 关 10 件在窄屏会横向滚动。见 `StagePage` 的 `trayScrollX`、`InteractionGeometry.trayLayout()` 与 `tests/interaction-geometry.test.ts` 的 “gives every ten-piece stage-two cargo at least 56 design pixels and scrolls the overflow”。 |
| 操作栏：旋转（至少 160×120、最显眼）、撤销、重开 | 已实现 | `StageArt.computeStageLayout()` 的 `buttonH=120`，`StagePage` 构造 180×120 旋转、160×120 撤销/重开；`tests/stage-art.test.ts` 断言 `buttonH >= 120`。 |
| 按宽度缩放、高屏补后备箱区、安全区、竖屏限制 | 已实现 | `StagePage.updateLayout()` 读取 Cocos 安全区和 H5 `env(safe-area-inset-*)`；横屏显示“请竖屏游玩”，计时继续。`tests/stage-art.test.ts` 校验分区顺序与高屏后备箱空间。 |

## 4.3 托盘

| 规格项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| 未放置行李按关卡顺序排列 | 已实现 | `StagePage.layoutTray()` 使用 `session.pieces` 顺序；`tests/interaction-geometry.test.ts` 校验槽位顺序与 ID 顺序。 |
| 先一行，低于 28px 改两行，仍放不下等比缩小到 20px 下限 | 部分 | 当前实现会尝试最多三行，最小格长 56px，并允许横向滚动兜底；与规格的 20px 下限/两行要求不一致。见 `InteractionGeometry.trayLayout()`。 |
| 12 件必须两行内放下 | 部分 | 12 件在 56px 下可完整、互不重叠地摆放，但算法没有强制“两行内”；`tests/interaction-geometry.test.ts` 只断言完整、边界和不重叠。 |
| 缩略图按当前朝向、统一格长、形状可辨 | 已实现 | `trayLayout()` 的 `rotationFor` 回调使用当前会话朝向；`tests/interaction-geometry.test.ts` 覆盖四个朝向。 |
| 空位不留洞、剩余件不重排、拖回原槽位 | 部分 | 放置后会按剩余件重新计算槽位，剩余件位置可能重排；拖回托盘会回到新布局中的槽位，而不是严格的原始槽位。见 `StagePage.layoutTray()`。 |
| 选中物品金色描边 | 已实现 | `StagePage.drawPiece()` 在 `selected` 时使用金色描边；正式构建由浏览器截图复核。 |

## 4.4 选中与拖拽

| 规格项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| 轻点物品只选中，不旋转、不移动 | 已实现 | `DragController.release()` 返回 `tap`，`StagePage.end()` 只切换 `selected`；`tests/drag-controller.test.ts` 的 “reports taps without changing rotation”。 |
| 轻点空白取消选中 | 已实现 | `StagePage.end()` 在 `tap` 且无物品时清空 `selected`。 |
| 移动超过 8px 才拿起 | 已实现 | `DragController.move()`；`tests/drag-controller.test.ts` 的 “starts pickup only beyond 8px and ignores a second pointer”。 |
| 拖动放大 1.05、投影、中心在手指上方 max(1.2 格,120px) | 已实现 | `StagePage.move()`、`updateHeld()`、`drawPiece()`；`tests/interaction-geometry.test.ts` 的 “keeps the full piece center at least 120px above the finger through all rotations”。 |
| 实时绿/红落点预览 | 已实现 | `StagePage.updateHeld()` 使用 `canDrop()` 着色；`tests/interaction-geometry.test.ts` 的 “shows preview at half the occupied cells, independent of blocked cells”。 |
| 合法落下播放落位反馈 | 已实现 | `StagePage.end()` 使用 `DROP_SQUASH_FRAMES`；`tests/finish-integration.test.ts` 的 “legal drop squashes to 0.85, rebounds to 1.05, and settles in 220ms”。 |
| 非法/箱外松手 180ms 回原位 | 已实现 | `StagePage.end()` 的 tween 分支；`tests/finish-integration.test.ts` 的 “legal drop keeps stage...” 覆盖非法操作不改变盘面。 |
| 后备箱物品拖到托盘区归还 | 已实现 | `StagePage.end()` 调用 `session.returnToTray()`；`tests/finish-integration.test.ts` 的妈妈模式用例覆盖拖回托盘。 |
| 第二指只有按旋转按钮才生效 | 已实现 | `DragController` 隔离活动指针，`StagePage.rotateSelected()` 只处理旋转按钮；`tests/drag-controller.test.ts` 覆盖第二指忽略。 |
| 系统打断取消拖动、不丢件 | 已实现 | `StagePage.cancelDrag()`、`onHide()`、尺寸变化和超时分支；`tests/stage-session.test.ts` 校验超时冻结与重开不丢件。 |
| 抓取按物品包围区（含格间缝） | 已实现 | `StagePage.start()` 使用 `view.rect` 做包围区命中。 |
| 拖动当帧跟手、不加平滑延迟 | 已实现 | `StagePage.move()` 在触摸事件内直接 `updateHeld()`。 |

## 4.5 吸附规则

| 规格项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| 左上格就近取整，不搜索远处合法位置 | 已实现 | `DragController.placement()` 使用最近格；`tests/drag-controller.test.ts` 的 “snaps a quick drop even when the browser reports only start and release”。 |
| 至少一半占格在网格内才显示预览 | 已实现 | `InteractionGeometry.previewVisible()`；`tests/interaction-geometry.test.ts` 覆盖半数边界。 |
| 出界、重叠、禁放格沿用 `canDrop` | 已实现 | `StageSession.canDrop()`；`tests/stage-session.test.ts` 的 “rejects blocked/overlapping rotations atomically...” 覆盖禁放格与碰撞。 |

## 4.6 旋转

| 规格项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| 只有旋转按钮能顺时针 90°，禁止镜像/双指旋转 | 已实现 | `StagePage.rotateSelected()`、`DragController.rotateHeld()`；`tests/drag-controller.test.ts` 覆盖手持旋转，第二指只作用于按钮。 |
| 无选中置灰，有选中/拖动高亮 | 已实现 | `StagePage.updateControls()` 根据 `selected` 切换按钮配色。 |
| 拖动中按旋转立即转向并刷新预览 | 已实现 | `rotateSelected()` 更新 `drag.active.rotation` 后调用 `updateHeld()`。 |
| 选中托盘物品时旋转缩略图 | 已实现 | `rotateSelected()` → `renderPiece()` 按当前朝向重绘。 |
| 后备箱物品非法旋转保持原样、红色抖动 200ms、播放 invalid | 已实现 | `StageSession.rotatePiece()` 原子返回 false；`StagePage.rotateSelected()` 执行 4×50ms 抖动并恢复原图。`tests/stage-session.test.ts` 覆盖原子性。 |
| 旋转 120ms 动画，逻辑立即生效 | 已实现 | `StagePage.rotateSelected()` 使用 `.12s` 角度 tween；逻辑状态由 `StageSession` 立即更新。 |

## 4.7 反馈与设置

| 规格项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| 拿起：放大/投影、`pickup`、震动 10ms | 已实现（音效逻辑已接，正式 MP3 缺失） | `StagePage.move()`、`end()`、`drawPiece()`；`tests/finish-integration.test.ts` 的 “pickup and legal drop vibrate...”。音频文件缺失时由 `SoundEffects`/`OptionalResources` 静默。 |
| 合法落下：纵向 0.85→1.05→1.0 约 220ms、`drop`、震动 20ms | 已实现（音效逻辑已接，正式 MP3 缺失） | `StagePage.DROP_SQUASH_FRAMES` 与新单测；`SoundEffects.play('drop')`。 |
| 非法松手：飞回原位、`invalid`、无震动 | 已实现（音效逻辑已接，正式 MP3 缺失） | `StagePage.end()` 180ms 缓动；`tests/finish-integration.test.ts` 覆盖非法操作不改变盘面。 |
| 旋转动画、`rotate`、无震动 | 已实现（音效逻辑已接，正式 MP3 缺失） | `StagePage.rotateSelected()`。 |
| 撤销/重开物品飞回、`undo` | 已实现 | `StagePage.capturePositions()`/`flyBack()` 在撤销和重开时执行 180ms 飞回；`tests/finish-integration.test.ts` 的 “undo and restart fly changed pieces back over 180ms”。 |
| 倒计时 ≤10 秒变红、轻微跳动、每秒 `tick` | 已实现 | `client/assets/scripts/game/CountdownFeedback.ts`，`StagePage.tick()`；`tests/countdown-feedback.test.ts` 与 `tests/finish-integration.test.ts` 的 “countdown turns red, ticks and bounces for the final ten seconds”。 |
| 设置“音效”“震动”默认开、存 `localStorage` | 已实现 | `client/assets/scripts/game/GameSettings.ts`，键 `smhj.game-settings.v1`；`tests/game-settings.test.ts` 与设置面板集成测试。 |
| 红金小齿轮按钮 + 小面板，不遮挡后备箱 | 已实现 | `StagePage.settingsGearRect()` / `settingsPanelRect()` 绘制红金齿轮和面板；面板底部小于 `trunk.y`，集成测试断言不遮挡。 |
| 震动使用 `navigator.vibrate`，不支持时静默 | 已实现 | `StagePage.vibrate()` 在 API 缺失或抛错时静默；`tests/finish-integration.test.ts` 的 “missing vibration API and a throwing device never prevent finishing”。 |
| 音频缺失/加载失败静默、不阻塞游戏 | 已实现 | `SoundEffects`、`OptionalResources.loadAudio()`；`tests/sound-effects.test.ts`、`tests/optional-resources.test.ts`。 |

## 4.8 撤销与重开

| 规格项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| 撤销回退一步，放置/拿出/旋转都算，不限步数，不丢件 | 已实现 | `StageSession.undo()`；`tests/stage-session.test.ts` 覆盖 120 步撤销、旋转回退和跨妈妈追加撤销。 |
| 撤销后清空选中 | 已实现 | `StagePage` 撤销按钮将 `selected=undefined` 后 `sync()`。 |
| 重开二次确认“重新装车？” | 已实现 | `StagePage.updateOverlay()`；`tests/finish-integration.test.ts` 的 “restart confirms first and timeout freezes the board behind the retry prompt”。 |
| 重开清空后备箱、回到初始朝向、重置计时 | 已实现 | `StageSession.restart()`；`tests/stage-session.test.ts` 的 “freezes all mutations on timeout and resets every rotation on restart”。 |
| 时间到冻结盘面并弹“时间到 · 再装一次” | 已实现 | `StageSession.expired` 拒绝变更，`StagePage.tick()` 设置 `modal='timeout'`；集成测试断言盘面不变、按钮文字和重开计时。 |

## 4.9 塞满结算

| 规格项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| 0–300ms 保留最后落位反馈 | 已实现 | `FinishTimeline.finishTimeline()` 与 `StagePage.beginFinish()`；`tests/finish-timeline.test.ts`。 |
| 300–700ms 关盖、`trunk_slam`、震动 40ms | 已实现（音效逻辑已接，正式 MP3 缺失） | `FINISH_CUES` 的 `trunk_slam`/40ms；`tests/finish-timeline.test.ts` 与 `tests/finish-integration.test.ts`。 |
| 700–1000ms 车身下沉 12px 再回弹一半 | 已实现 | `finishTimeline().bodySink`；`tests/finish-timeline.test.ts` 的边界断言。 |
| 1000–1600ms 尾灯闪两次、`horn` 两次 | 已实现（音效逻辑已接，正式 MP3 缺失） | `tailLights` 两段窗口与 `FINISH_CUES` 两次 `horn`；`tests/finish-timeline.test.ts`。 |
| 1200–2500ms 彩纸、中央“塞满了！回家！” | 已实现 | `FinishView.render()`、`updateConfetti()`；`tests/finish-timeline.test.ts`。 |
| 2500ms 后按关卡出现按钮 | 已实现 | `finishButtons()`；`tests/finish-timeline.test.ts` 与 `tests/finish-integration.test.ts` 覆盖第 1 关、第 2 关、妈妈模式。 |
| 点击屏幕跳到最后一帧 | 已实现 | `FinishPlayback.skip()`、`StagePage.start()`；`tests/finish-integration.test.ts` 的 “screen touch skips from animation to final frame without firing pending cues or clicking through”。 |
| 彩纸 ≤120、结束全部回收 | 已实现 | `MAX_CONFETTI=120`、固定池；`tests/finish-timeline.test.ts` 的 “pool remains bounded, reuses identities, and recycles every particle”。 |

## 4.10 关卡

| 规格项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| V1 关卡放 `resources/levels/v1/`，测试用 DLX 证明有解并保留 fixture | 已实现 | `client/assets/resources/levels/v1/{stage1,stage2,mom}.json`；`tests/v1-levels.test.ts`、`tests/fixtures/v1/*.solution.json`。 |
| 第 1 关 4–5 件、60 秒、无教学弹窗、首件手指引导、首次触摸消失 | 已实现 | `client/assets/scripts/core/stage1.ts`（4 件/60 秒）、`StagePage.prepareGuideRoute()`；`tests/finish-integration.test.ts` 的引导三条用例。 |
| 第 2 关 10–12 件、参数在 `tools/config/v1-levels.json`、固定生成、同形/六格约束 | 已实现 | 配置为 `sedan_v1`、8×6、10 件、150 秒；`npm run levels:v1` 输出 10 件、11 个完整解、`nodesToFirst=3022`；`tests/v1-levels.test.ts` 校验约束。 |
| 妈妈模式独立入口、普通关不触发、按批次追加 2–3 次、无解不生成 | 已实现 | `WebPlatform.isMomMode()`、`Api.loadMom()`、`StageSession` 批次；`tests/stage-session.test.ts`、`tests/v1-levels.test.ts`、`tests/finish-integration.test.ts` 覆盖。 |
| 妈妈模式默认不限时、撤销不撤回追加、重开回第一批 | 已实现 | `mom.json` 的 `timeLimitSec:0`；`StageSession.appendNextBatch()` 不在撤销快照中；`tests/stage-session.test.ts` 与 `tests/finish-integration.test.ts`。 |

## 4.11 美术资源规范

| 规格项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| `art/items`、`vehicles`、`ui`、`fx` 目录和命名 | 已实现 | `client/assets/resources/art/` 下 66 个 PNG；命名按 `items.ts`、车型和 UI 约定。 |
| 行李 PNG 尺寸、透明底、非占用格 alpha=0 | 已实现 | `npm run art:check` 通过；`tests/art-check.test.ts` 覆盖尺寸、损坏、伪装格式和占用格外透明。 |
| 图像缺失/加载失败回退色块 + 物品名 | 已实现 | `StagePage.drawPiece()` 与 `OptionalResources.loadArt()`；`tests/stage-art.test.ts`、`tests/optional-resources.test.ts`。 |
| 仓库内有一套程序生成占位 PNG | 已实现 | 资源目录已提交通过 `art:check` 的 PNG 集；正式图可直接同名覆盖。 |
| `npm run art:check` 并由 CI 执行 | 已实现 | `package.json`、`tools/art-check.ts`、`.github/workflows/verify.yml`；本轮 `art:check` 通过。 |
| 10 个正式 MP3（每个 ≤100KB，44.1kHz） | 缺失 | `client/assets/resources/audio/` 目前只有 `README.md`，没有 `pickup/drop/invalid/rotate/undo/tick/trunk_slam/horn/cheer/mom.mp3`；缺失时静默回退已实现。 |

## 4.12 性能

| 规格项 | 状态 | 证据 / 说明 |
| --- | --- | --- |
| 目标 60fps、低端机不低于 45fps | 部分 / 未实测 | 当前仅在 Chromium + Web Mobile 构建和自动化测试中验证，未做实体低端机 fps 采样。 |
| 拖动只移动被拿起物品和预览节点，不每帧重画盘面 | 已实现 | `StagePage.move()`/`updateHeld()` 只更新手持节点、预览和必要标签；背景在 `layout()` 绘制。 |
| 每件行李一个 Sprite 节点，网格只在开局/尺寸变化时绘制 | 已实现 | `StagePage` 构造 `PieceView` 独立节点；`drawBackground()` 只在布局阶段调用。`tests/stage-art.test.ts` 覆盖每件独立图片/节点。 |
| 拖动和结算动画期间不每帧分配新对象 | 已实现 | `InteractionGeometry` 预计算形状和包围盒；`FinishTimeline` 复用状态对象与固定彩纸池；`tests/finish-timeline.test.ts` 校验池身份和回收。 |
| 首屏资源到可操作 ≤3 秒（4G 模拟） | 部分 / 未实测 | 本轮做了构建和浏览器截图，未做 4G 网络节流和冷启动计时。 |

## 遗留

以下项目需要单独任务，本任务不做临时架构改动：

1. **4.3 托盘架构**：第 2 关 10 件在窄屏仍会横向滚动；最小格长是 56px 而非 20px；放置后剩余件会重排，拖回不保证原始槽位。需要重做托盘布局/槽位持久化和关卡件数约束。
2. **4.11 正式音效**：10 个 MP3 尚未由产品方提供。加载、开关、静音和失败回退逻辑已就绪，但当前没有可听音效。
3. **4.12 真机性能与 4G 启动**：需要低端 Android/iPhone 实测 fps、冷启动和 4G 网络节流；本轮只有 Chromium 构建截图和自动化单测。
4. **安全区真机复测**：刘海屏、底部手势条和实体触屏手感仍需在 iPhone/Android 真机复核。

## 本轮验证

| 命令 | 结果 |
| --- | --- |
| `npm test` | 109 通过，1 个既有性能测试默认跳过；类型检查通过；核心行覆盖率 98.81%。 |
| `npm run art:check` | 通过：必需 PNG、尺寸、占用格外 alpha=0、3–6 张彩纸。 |
| `npm run levels:v1` | 通过：stage2 10 件、11 个完整解、`nodesToFirst=3022`，关卡文件无差异。 |
| `npm run test:performance` | 1 通过（最终复跑 460ms）。 |

未修改 `core/dlx.ts`、车型数据、关卡形状数据；未操作 `main`；未合并 PR；未运行 `art:placeholders`。
