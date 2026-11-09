# 开发与验收记录

每轮交付保留独立的 GitHub 提交。接手时从草稿 PR #2 的提交列表和本记录核对已完成事项。新增记录应注明日期、执行命令、结果和剩余验收项。云端凭证、生产种子和关卡解留在发布环境。

## 2026-11-09 · M1 核心逻辑

| 执行 | 结果 |
| --- | --- |
| `npm test` | 20 项通过，覆盖 500 个随机种子的生成与验解，核心代码行覆盖率 94.91% |
| `npm run test:performance` | 完整五菱关卡通过。测试用时约 0.72 秒，精确计数 8 个解，首解 28,810 个搜索节点 |
| 原求解器对 87 格候选复核 | 52 秒到达 1,000 万节点上限，只确认 2 个解，未能完成计数 |
| 按同形行李合并配额后复核 | 同一盘面完整计数 8 个解。重复行李的 ID 按锚点顺序分配，独立穷举回归测试通过 |

改动集中在 `client/assets/scripts/core/dlx.ts`、`generator.ts`、`types.ts`、`vehicles.ts`，以及 `tests/crosscheck.test.ts` 和 `tests/performance.test.ts`。五菱保留四角禁放格，新增中间隔挡并留一格相通，可用面积为 87 格。各车型可使用优先尝试的行李组合。求解器每次仍复核完整解数和首解搜索节点。此阶段无编辑器操作。

## 2026-11-09 · M2 关卡工具

| 执行 | 结果 |
| --- | --- |
| `npm run levels:generate -- --from 2027-01-15 --days 7` | 初次运行在皮卡处停止，100 次中 94 次超过解数上限，6 次切分失败 |
| 同一批次重新生成 | 2027-01-15 至 2027-01-21 的七个关卡和七个解全部生成，覆盖六种车型 |
| `npm run levels:upload -- --from 2027-01-15 --days 7 --dry-run` | 7 对关卡及解通过本地校验 |
| `npm run --silent levels:evaluate -- --vehicle wuling --samples 3` | 输出表头和 3 行 CSV，样本均有 8 个解 |
| `npm run levels:copy-dev` | 生成公开试玩关卡文件，单日样本做过 JSON 字段对比 |
| `npm run art:templates` | 19 个 SVG，格长 128 px |
| `npm test` 和 `npm run test:performance` | 完整轮换配置变更后复跑通过 |

| 日期 | 车型 | 完整解数 |
| --- | --- | --- |
| 2027-01-15 | 皮卡 | 6 |
| 2027-01-16 | 电动三轮 | 6 |
| 2027-01-17 | 摩托车 | 10 |
| 2027-01-18 | 绿皮火车 | 8 |
| 2027-01-19 | 五菱宏光 | 8 |
| 2027-01-20 | SUV | 5 |
| 2027-01-21 | 皮卡 | 6 |

工具源码在 `tools/`。本轮补齐六种车型的候选组合，修改了 SUV、皮卡、摩托车的禁放坐标。摩托车有三个独立区域，共 80 格。测试批次使用本地种子，交付代码与验证记录，不提交测试批次的解。换成生产环境变量后可重新生成正式关卡。

当前有些车型只有一套候选组合，换种子主要变化为托盘顺序和初始朝向。解数和搜索节点是机器求解指标，玩家难度待 H5 实测。

## 2026-11-09 · M3 试玩源码

| 执行 | 结果 |
| --- | --- |
| `npm test` | 22 项通过，核心代码行覆盖率 94.91%。新增碰撞、旋转、拖回、撤销、重开、完整通关与模拟后台 10 秒的逻辑验证 |
| `npm run test:performance` | M3 源码加入后复跑通过 |
| 查找 Cocos Creator 和场景工程 | 云端工作区有源码和 Cocos 3.8 类型定义。构建需要接手人在编辑器创建工程和 Main 场景 |

入口在 `client/assets/scripts/Bootstrap.ts`，画面与触控在 `pages/StagePage.ts`，盘面状态和计时在 `game/StageSession.ts`。WebPlatform 和本地关卡读取在 `platform/` 与 `services/`。默认第 1 关通过后载入随仓库附带的 demo 关，`?level=demo` 可直接打开挑战关。公开试玩文件只包含关卡数据。

M3 仍需生成 Web Mobile 构建并在手机和桌面浏览器验证两关、触摸命中、旋转和真实后台计时。编辑器设置见 [接手开发](handoff.md)。

新增 `.github/workflows/verify.yml`。后续每次 PR 更新会自动验证核心和关卡工具，并把运行日志保存在 GitHub Checks。

## 2026-11-09 · M3 拖拽修复与自动构建

- 手势在松手时重新采样，快速拖放可以提交落点。第二个触点只有按旋转按钮时才影响正在拖动的行李。窗口缩放或时间到时结束当前拖动。
- 点击和拖动中旋转均按屏幕顺时针方向处理。关卡文件继续使用原有旋转编码。
- 浏览器和关卡工具共用关卡格式校验，进入棋盘前检查重复 ID、禁放格、行李形状和面积。
- `npm test` 新增快速拖放、触点隔离、顺时针旋转、损坏关卡和演示关完整通关验证，共 28 项通过。
- GitHub Actions 新增 Windows 构建任务。它从 Cocos Creator 3.8.8 安装包复制官方 Empty 2D 模板和 2D 场景，由编辑器导入资源、生成元数据并构建 Web Mobile。游戏通过场景启动事件挂载 Bootstrap。

- 新增 Chromium 验收脚本，驱动真实 Web Mobile 构建的鼠标和触摸事件。检查两关通关、非法吸附、顺时针旋转、拖回托盘、URL 直达挑战关和冻结 10 秒后的倒计时。GitHub Actions 保留浏览器验收截图。

## 2026-11-09 · M3 云端构建复核

| 执行 | 结果 |
| --- | --- |
| [核心 CI](https://github.com/feyakit/sai-man-hui-jia/actions/runs/42623132608) | 类型检查、28 项测试、五菱性能测试和七天关卡校验通过 |
| `npm run --silent levels:evaluate -- --vehicle wuling --samples 200` | 200 行 CSV。每局 8 个解、首解 28,810 个节点，单局约 271–547 毫秒 |
| [首次官方编辑器构建](https://github.com/feyakit/sai-man-hui-jia/actions/runs/42622598981) | 编辑器安装包传输耗时约 7 分钟，原 5 分钟传输限制触发重试，随后达到任务时限 |
| 修正 Windows 下载限制 | 单次下载放宽到 15 分钟，任务上限 32 分钟，缓存已下载的完整安装包 |

## 2026-11-09 · M3 私密浏览器试玩

| 执行 | 结果 |
| --- | --- |
| Cocos 3.8.8 引擎预览包 | 从 `6f6aa2a` 的游戏源码构建，编译 Web 引擎与 UI 材质，使用官方默认 2D 场景 |
| `node --import tsx tools/cocos/smoke-web-mobile.mjs <试玩目录> <截图目录>` | 桌面鼠标和 Pixel 7 模拟触屏均通关两关。非法落点、点按旋转、拖回托盘、URL 直达挑战与冻结 10 秒后的倒计时均通过 |
| [部署私密试玩](https://sai-man-hui-jia-playtest.feya0517.chatgpt.site) | 仅项目所有者可访问。部署源码版本 `202433254ed06bc1918453b38a6d161bae552043` |
| [官方 Web Mobile 构建](https://github.com/feyakit/sai-man-hui-jia/actions/runs/42625147699) | 已启用调整后的下载时限。正式编辑器出包和真机复测仍待确认 |

试玩直接使用 Cocos 开源 Web 引擎和同一套游戏源码。测试环境使用 Chromium 软件 WebGL。试玩页会在浏览器无法启动 WebGL 时提示，实体手机、微信和官方 Web Mobile 导出不计入本轮通过项。

## 2026-11-09 · M3 春运主题试玩与正式构建修复

- 初次试玩从几何色块直接进棋盘，缺少春运回家的目标与年货识别。两关加入夜色归家路、村口灯火和灯笼，后备箱车身、带名字的年货、装车进度及到家结尾。仍沿用原有两关和计时规则。
- [上一轮 Cocos 官方构建](https://github.com/feyakit/sai-man-hui-jia/actions/runs/42625294962) 已出包。桌面验收失败，调试发现编辑器把 Map 值迭代器的展开编译成数组拼接，空盘面被误读为含一条记录。
- 使用 `Array.from` 明确读取盘面。用临时诊断包验证该改动后，官方引擎的桌面鼠标和手机模拟触屏均通关两关。仓库只修改 TypeScript 源码，由 CI 重新导出。
- `npm test` 28 项通过，独立性能测试通过。正式验收增加空盘面、归家叙事、年货标签、装车进度及到家截图检查。

### 春运试玩交付

- [第一轮官方构建及浏览器 CI](https://github.com/feyakit/sai-man-hui-jia/actions/runs/42633780090) 已通过。最后一版优化年货卡片尺寸，并关闭性能面板。
- [新版官方导出](https://github.com/feyakit/sai-man-hui-jia/actions/runs/42634064950/artifacts/13681543848) 来自 `82a69cd`。发布前用该导出包复跑桌面和模拟手机两关，保留两关和到家画面截图。
- [原私密试玩页](https://sai-man-hui-jia-playtest.feya0517.chatgpt.site) 已替换为正式 Web Mobile 导出。网页入口增加中文标题与 WebGL 不可用提示，游戏逻辑沿用导出产物。部署源码版本 `91a10bd23937543f1a9459d9a82ae2adc2bd15a7`。

## 2026-11-09 · 任务 1：CI、证据与 V1 关卡地基（进行中）

- 从最新 `origin/work/m1-core`（4099f11）创建 `codex/v1-1-foundation`，不修改画面或操作。
- 检查 `gh run view 42635027666 --log-failed`：Creator 退出码 34，下载及解压已成功；原 workflow 未收集到编辑器日志。增加标准输出、错误输出及内部日志收集，继续在 CI 定位。

## 2026-11-10 · 任务 1 收尾：Cocos 构建稳定性、Cloudflare 预览与自动验证

- 分支 `codex/v1-1-foundation`，draft PR #4 指向 `work/m1-core`，未合并。
- Cocos 构建：`42640620679`（4876ae4）失败于 Creator exit 34；此次 stderr 取证指向 `Check build parameter startScene (undefined) failed`，而下载（1027270586 字节校验）与 7z 解压均成功。同一脚本在 `7023529` 的绿灯运行 `42640138388` 证明输入本身可构建，判定为 hosted runner 瞬时故障而非代码回归，但内部根因未被证实。`build-web-mobile.ps1` 现保留每次尝试日志并最多重试 3 次，失败后清理 `client/build/web-mobile` 与 `temp` 再重试；CI 复跑结果待补记。
- `npm test`：37 通过、1 跳过（`tests/performance.test.ts` 仅在 `RUN_M1_PERFORMANCE=1` 时执行）；`npm run test:performance` 通过。
- `npm run levels:v1` 重建后 `git status` 无差异（确定性生成）；stage2 当前 10 件、完整解 11 个、首解 3022 节点。
- `smoke-web-mobile.mjs` 已覆盖桌面 1280×900、Pixel 7（recordVideo）、iPhone SE 375×667（recordVideo）、412×915，产物进 `web-mobile-browser-evidence`。
- 预览部署：Netlify 专用脚本已退役，改为 Cloudflare Pages Direct Upload（Wrangler 4.159.0）。三项配置齐备才执行，缺失时跳过且在 Job Summary 说明；需要产品方配置 Secrets `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 与仓库变量 `CLOUDFLARE_PAGES_PROJECT_NAME`。
- 剩余人工项：产品配置预览凭证以验证部署路径；真机清单与外部试玩按规格 5.4 由产品方完成。
