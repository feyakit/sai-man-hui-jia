当前规格以 docs/spec-v1.2.md 为准
# 接手开发

## 当前位置

- 当前阶段：竖切版 V1 收尾（对照 `docs/spec-v1.2.md` 第 4.2–4.12 节）。
- 工作分支：`codex/v1-11-checklist`，基线 `origin/work/m1-core`（`01eccb9`）。
- 草稿 PR：[#18](https://github.com/feyakit/sai-man-hui-jia/pull/18)，目标分支 `work/m1-core`。
- 本任务代码提交：`76312ac`（设置持久化）、`aff5d3f`（最后 10 秒反馈）、`f7e0251`（设置面板与回合内反馈）、`796d42a`（格长上限 110）、`d56fe70`（落位压扁与撤销/重开飞回）、`53ee7d1`（操作按钮 120px 高）。
- 逐条对照见 [docs/v1-checklist.md](v1-checklist.md)。本轮没有修改 `core/dlx.ts`、车型数据或关卡形状数据，没有操作 `main`，没有合并 PR，没有运行 `art:placeholders`，也没有运行 `gh run watch`。

## 当前交付

V1 的三条可玩路径已经打通：第 1 关（4 件、60 秒、首次触摸消失的手指引导）、第 2 关（`stage2.json`，10 件、150 秒）和妈妈模式（`?mode=mom`，按批次追加 3 件、不限时）。第 2 关和妈妈模式都由固定关卡文件与 DLX fixture 校验有解。

本轮补齐了：

- 第 4.7 节设置：右上角红金齿轮按钮、音效/震动两个开关、默认开、`localStorage` 键 `smhj.game-settings.v1`；面板位于后备箱上方，不遮挡箱内网格。音效开关会立即静音/恢复，震动开关会阻止 `navigator.vibrate` 调用；不支持震动 API 时静默。
- 第 4.7 节倒计时：≤10 秒数字变红、轻微跳动，每秒 `tick` 一次。
- 第 4.7 节手感：合法落下按纵向 0.85 → 1.05 → 1.0、约 220ms 回弹；撤销和重开让物品以 180ms 飞回。
- 第 4.8 节：重开二次确认“重新装车？”；时间到冻结盘面并弹出“时间到 · 再装一次”。
- 第 4.9 节回归：点击屏幕跳到结算最后一帧；彩纸固定池 ≤120，结束/跳过/销毁全部回收。

## 本轮验证

| 命令 | 结果 |
| --- | --- |
| `npm test` | 109 通过，1 个既有性能测试默认跳过；类型检查通过；核心行覆盖率 98.81%。 |
| `npm run art:check` | 通过：必需 PNG、尺寸、占用格外 alpha=0、3–6 张彩纸。 |
| `npm run levels:v1` | 通过：stage2 10 件、11 个完整解、`nodesToFirst=3022`，关卡文件无差异。 |
| `npm run test:performance` | 1 通过（本轮 630ms）。 |

构建验收使用：

```sh
/workspace/build-play.sh origin/codex/v1-11-checklist --no-publish
```

产物在 `/workspace/play-dist`；本任务截图在 `/workspace/play-check/task11/`。完整命令、构建结果和截图说明见 `/workspace/task11-report.md`。

## 尚未完成 / 需要人工处理

| 项 | 说明 |
| --- | --- |
| 4.3 托盘 | 第 2 关 10 件在窄屏仍会横向滚动；最小格长 56px 而非 20px；放置后剩余件会重排，拖回不保证原始槽位。需要重做托盘架构和槽位持久化，本任务列为遗留。 |
| 4.11 正式音效 | `client/assets/resources/audio/` 只有 README，还没有 10 个 MP3。加载、开关、静音和失败回退已实现；产品方补文件后即可出声。 |
| 4.12 真机性能 | 低端机 45/60fps、首屏 4G ≤3 秒尚未实测；本轮只有 Chromium Web Mobile 构建、单测和截图。 |
| 真机手感 | iPhone/Android 的刘海、底部手势条、触屏拖动和震动仍需实体机复核。 |

## 本地运行与验收

从仓库根目录执行：

```sh
npm ci
npm test
npm run art:check
npm run levels:v1
npm run test:performance
```

第 2 关和妈妈模式的生成参数在 `tools/config/v1-levels.json`；改参数后运行 `npm run levels:v1`，不要手改生成出的关卡和解。浏览器试玩需要 WebGL，构建输出目录必须通过 HTTP 打开。详细玩法、构建和本地运行见 [README](../README.md)。

## 后续里程碑

V1 验收通过前不要开始 M5 及以后。页面流程、省份、每日关卡、排行榜、分享、登录、云端、广告、道具和微信适配都在 V1 范围外，按规格书后续里程碑推进。GitHub Actions 的 `verify` 会运行类型检查、`npm test`、`art:check`、性能测试和七天关卡验证；本轮没有等待 Actions，不声称 CI 已绿。
