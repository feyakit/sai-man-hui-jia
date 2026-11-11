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
| [部署私密试玩](https://example.feyakit.dev) | 仅项目所有者可访问。部署源码版本 `202433254ed06bc1918453b38a6d161bae552043` |
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
- [原私密试玩页](https://example.feyakit.dev) 已替换为正式 Web Mobile 导出。网页入口增加中文标题与 WebGL 不可用提示，游戏逻辑沿用导出产物。部署源码版本 `91a10bd23937543f1a9459d9a82ae2adc2bd15a7`。

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

## 2026-11-10 · 任务 1：复核备用模型提交与首次导入根因修复

- Review `ea5622e`、`e3e7eea`、`989e45a`、`02046ad`：保留 bounded retry、独立工程与 Cloudflare Pages 方案，删除旧 Netlify 部署脚本合理；纠正“只看 exit 36”、重试覆盖 stdout/stderr、超时立即退出不重试、手动运行预览分支为空的问题。
- 对比失败运行 [42663003930](https://github.com/feyakit/sai-man-hui-jia/actions/runs/42663003930) 和绿灯 [42634064950](https://github.com/feyakit/sai-man-hui-jia/actions/runs/42634064950)：失败轮构建日志 `Number of all scripts: 0`、`Num of bundles: 2`，绿灯为 23 脚本并包含 resources。失败首次尝试有 `Importer version is lower than asset`，第二次尝试脚本及 resources 目录在 17:18:51 导入，engine-extends 的 afterPreStart 到 17:19:01 才完成。新建工程和等待 asset-db ready 本身无法修复已被 fallback importer 导入的数据，缺 bundle/resources 并非下载损坏或游戏源码异常。
- 与上游 [Cocos #19250](https://github.com/cocos/cocos-engine/issues/19250) 的 3.8.8 导入器注册竞态吻合。`prepare-editor.mjs` 针对固定 3.8.8 官方编辑器，将 engine-extends 加入启动 pre-packages，先于 asset-db 加载；用 @electron/asar 读取本次 CI 临时编辑器归档，追加启动文件并重写头部与 SHA256，保留原数据段及 unpacked 文件，未知启动布局立即报错。没有修改仓库引擎或游戏画面操作。
- `build-web-mobile.ps1` 只有 exit 36 且非空 `index.html`、`src/chunks/bundle.js`、`assets/resources/config.json` 齐备才成功；缺失、超时与非 36 均最多尝试 3 次。每轮日志、资源元数据与拒绝原因独立保存，输出目录预先清空，超时终止整个编辑器进程树。
- 增加真实 ASAR fixture 测试，检查启动补丁、重复执行、未知版本拒绝、原文件与 native helper 解包状态保留。Windows 正式 CI 结果将在收尾记录补齐。

### 本轮验证与外部阻塞（2026-11-10）

- 本地 `npm test`：39 通过、1 个性能测试按默认配置跳过；`npm run test:performance`：1 通过。保留原有 28 项，新增数据与编辑器归档测试通过，核心行覆盖率 98.76%。`npm run levels:v1` 重跑无文件差异。
- 本地完整运行 verify 的七天关卡生成、upload dry-run、copy-dev、五菱 3 样本评估、19 SVG 模板检查均通过；未提交测试产生的七天数据。
- 固定种子的 stage2：10 件、8 种形状（J4×1、L5×2、N5×1、O4×1、T4×1、T5×1、Z4×1、Z5×2），46 格、无六格件，DLX 完整枚举 11 解、未截断/未超节点上限。生成阶段首解 3022 节点；提交文件经托盘洗牌后独立求解首解 2420 节点，两者均超过配置下限 200。
- 直接读取官方 Windows 3.8.8 归档，确认真实 `launch/dist/launch.js` 的 ui-kit pre-package 锚点与补丁吻合。真实归档有 4080 个 unpacked 文件，因此改为只追加启动文件与重写 ASAR 头/SHA256，原数据段和 unpacked 文件不变；fixture 测试逐字节验证原数据段保留。官方完整归档的额外本地下载中途超时，不将其算作完整编辑器运行验证。
- 已 push 并使用 `gh run watch --exit-status` 跟踪 [build/browser 42670775462](https://github.com/feyakit/sai-man-hui-jia/actions/runs/42670775462) 与 [verify 42670775917](https://github.com/feyakit/sai-man-hui-jia/actions/runs/42670775917)。GitHub Actions 在执行任何步骤前拒绝 job，annotation 为 `The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings`。此状态是账号计费/额度阻塞，不是测试或构建结果。不能宣称本轮三项全绿；需账号所有者恢复额度后复跑。
- Cloudflare 凭证未配置的跳过路径已实现；有凭证的真实部署尚未验证。保持 draft PR #4，base 为 `work/m1-core`；未操作 main、未合并。

## 2026-11-10 · 任务 2：v1.2 交互重写（本机验证，浏览器证据待补）

- 基于包含任务 1 合并提交 `1139fb3` 的 `work/m1-core`，分支 `codex/v1-2-interaction`。任务中断恢复后保留用户推送的 WIP `bfaec5a`，逐项 commit/push；不修改 main、不合并。
- 轻点仅切换选中；移除托盘滚动状态，移动严格超过 8px 才拿起。托盘按原关卡顺序预留稳定槽位，优先一行、低于 28px 改两行；V1 的 12 件布局有 >=20px、矩形不交叠、所有朝向可容纳的单测。旧 demo 的 20 件仍兼容，但两行缩略格长可能低于 20px；旧 demo 不是 V1 的 10–12 件关卡。
- 每件行李独立 Graphics 节点（本任务按要求使用色块，Sprite/图片留任务 3）；静态背景与网格只在开局/视口变化时绘制。移动只更新手持节点与独立预览，形状、包围盒预计算；预览吸附位置未变时不重画。没有实测 45/60fps。
- 拿起 1.05 倍、投影、整体中心上移 max(1.2 格,120 设计 px)；就近取整、半数占格在网格内才显示绿/红预览；非法释放 180ms 飞回、后备箱物品拖至托盘归还。后台/系统取消、尺寸变化、超时取消拖动。
- 旋转仅按钮，180×120、无选中置灰；第二指按按钮可旋转手持物品。`StageSession.rotatePiece` 非法时保持位置/朝向，返回 false，不产生撤销记录；已放置非法旋转为 200ms 红色抖动，成功旋转 120ms 动画。
- 撤销不限制历史深度，清空选中；重开确认含取消，重置朝向/时间。超时冻结盘面并提示重开；读取 Cocos 设计坐标安全区与 H5 CSS env 安全区，横屏遮罩且真实时钟继续。
- `c757a1e` 修改两个旧测试的原因：横滑应拿起而不再滚动；非法旋转应保留盘面而不再退回托盘。没有删除/跳过已有测试。新增覆盖：严格 8px 阈值、第二指隔离、快速松手、非法旋转原子性/禁放格/碰撞、120 步撤销、时间冻结/重开、12 槽位布局、旋转全朝向偏移与半数预览。
- 命令/结果：`npm test` **46 通过、1 按原配置跳过**（性能测试），typecheck 通过，核心行覆盖率 98.76%（不代表 UI 覆盖率）；`npm run test:performance` **1 通过**；`node --check tools/cocos/smoke-web-mobile.mjs` 通过；`git diff --check` 通过。
- smoke 更新：桌面鼠标竖屏、Pixel 7、iPhone SE、412×915；通关使用旋转按钮；轻点不旋转、双触点旋转并合法落下验证朝向、非法/箱外松手回原位、拖回托盘/撤销、重开确认/取消、横滑位置稳定、12 槽位包含与不重叠、中心上移 >=120、保留后台 10 秒计时检查。增加实际 V1 stage2 fixture 通关，12 件用 V1 stage2 的布局专用变体。妈妈模式运行时与音效/震动设置不属于本任务，未声称其浏览器用例完成。
- 构建目录检查：`client`、`/workspace/ci-good`、`/workspace/ci-bad`、`/workspace/deploy-b9f21a7` 没有可用 Web Mobile index.html/构建包；**smoke 未执行，待 Windows 打包后补证据**。不得用任务 1 旧截图替代本轮证据。
- Actions 免费额度已用尽，job 无法启动；本轮没有 watch/等待 Actions，没有宣称 CI 全绿。本地未运行 Cocos 编辑器，不声称本地构建通过。
- 待人工/后续证据：Windows 3.8.8 打包后执行 `node --import tsx tools/cocos/smoke-web-mobile.mjs <build-dir> <evidence-dir>`；检查新增 `*-interaction.png`、`*-12-interaction.png`、`*-12-piece-tray.png` 和三关通关截图/录屏（此处“三关”指原两关加 V1 stage2，并非妈妈模式）。iPhone Safari/Android Chrome 真机检查：手指不遮挡、无误触旋转、第二指仅旋转按钮有效、快速拖放/回弹、托盘不滑动、刘海与底部手势条、横屏/切后台取消拖动、流畅度。

## 2026-11-10 · 任务 3：占位图与资源校验

- 从含任务 2 合并提交 `664e997` 的 `origin/work/m1-core` 创建 `codex/v1-3-art`。
- 第 1、2 项：共用 shapes/items 的尺寸和占格定义，生成 19 行李、3 车图、6 UI、4 彩纸，共 32 张透明底 sRGB PNG；占用格内缩 6px，中文物品名限于首个占用格。生成中文需系统安装 Noto Sans CJK SC；生成会覆盖同名正式图，请仅在需要重置占位时运行。
- `art:check` 校验存在性、PNG 解码/格式、精确尺寸、行李非占用格每像素 alpha=0、彩纸数量 3–6；不检查音频缺失。CI 配置加入检查，直接验证提交图片而非先生成覆盖。
- 本机 `npm run art:placeholders`、`npm run art:check` 通过；`npm test` 50 通过，1 个既有性能测试按默认配置跳过，类型检查通过。失败用例覆盖缺失、损坏、伪 PNG、尺寸错误、非占用格 alpha=255/1。
- 未等待 Actions，额度阻塞不计为 CI 通过。运行时图片和音频接入在后续提交。

### 任务 3 · 第 3 项：运行时 Sprite

- 每件行李一个 Sprite 子节点；同级 Graphics 子节点仅作原色块兜底及拿起投影，避免在同一节点挂两个 UI 渲染组件。PNG 按 `art/items/<items.ts key>/spriteFrame` 加载、缓存；整图按朝向旋转，尺寸随棋盘/托盘格长缩放，禁用 trim 保留透明包围盒。
- 加载期间/缺失/失败使用原色块和物品名；缺失先检查 bundle 索引，不发出无效加载。回调检查页面存活，按当前朝向/尺寸/手持状态更新图片，避免重置正在拖动的位置。
- 沿用任务 2 的手势、布局、旋转、预览、计时与回弹；拖动移动只更新原节点和预览，兜底改用已有缓存占格。
- 本机 `npm test`：54 通过，1 个既有性能测试默认跳过，typecheck 通过。新增资源路径/缓存/缺失/错误/异常测试，以及模拟 Cocos 组件的 Sprite/兜底/四朝向/销毁回调测试。这些是组件模拟，不代表真机渲染、45/60fps 或 4G 首屏测试。

## 2026-11-11 · 任务 3：第 4 项音频与本机交付

- `resources/audio/README.md` 记录十个固定 MP3 文件名、44.1kHz/≤100KB 交付要求；本任务不生成正式音效或静音文件。`OptionalResources.loadAudio` 按 `audio/<name>` 加载全部十种并缓存，缺失先查询 bundle 索引，加载回调失败与同步异常均返回空。
- `SoundEffects` 预加载可选音频；未就绪、缺失、销毁后调用、播放抛错均静默，不阻塞输入、不补播旧动作。AudioSource 复用在持久父节点，避免切关立即销毁通关声音。
- 事件接入 pickup/drop/invalid/rotate/undo/tick/cheer。轻点选中不响 pickup；快速释放也可触发 pickup；tick 只在最后 10 秒按秒变化触发。trunk_slam/horn/mom 有加载与播放接口，留待关盖/发车/妈妈流程使用，本任务不实现这些流程。
- 本机 `npm test`：**58 通过、1 个既有性能测试默认跳过**；包含 typecheck，核心行覆盖率 98.76%（不是运行时 UI/音频覆盖率）。新增全部音频路径、缺失/解码失败/同步抛错、缓存、未就绪不补播、播放异常和销毁保护测试。
- `npm run art:placeholders`：32 张 PNG 生成通过；`npm run art:check`：全部通过。第 1/2 项提交 `0d7150a`，第 3 项提交 `927f4f9`，均已推送；第 4 项独立提交推送。
- PR #6 保持 draft，base `work/m1-core`；不修改 main、不合并、不运行 gh run watch、不宣称 CI 全绿。本轮没有重新打包 Web Mobile；没有真实 MP3 播放、Cocos 浏览器渲染、45/60fps 或 4G 首屏 ≤3 秒实测。车图/UI/彩纸已提供生成与校验，当前页面仍沿用原有静态 Graphics/UI；妈妈/手指/彩纸等后续流程图片未挂接，行李图片替换已接入。

## 2026-11-11 · 任务 4：塞满结算与收尾交付

- 基于任务 3 合并提交 f89dbdc，分支 codex/v1-4-finish；实现/测试提交依次为 0f304a4、8052b0c、38a88d8、6f1861a。Draft PR #7：https://github.com/feyakit/sai-man-hui-jia/pull/7，目标 work/m1-core。
- 规格 4.9：通过——0–300ms 保留最后落位反馈；300–700ms 关盖（sedan_v1_lid 图片与 Graphics 兜底）；700–1000ms 下沉 12px、回弹到 6px；1000/1300ms 两次亮尾灯；1200–2500ms 彩纸与中央“塞满了！回家！”。纯函数 finishTimeline 与 FinishPlayback 控制时序，点击跳至末帧，不补播音效或震动、不穿透按钮。固定池不超过 120 粒子，结束/跳过/销毁全部停用回收。
- 部分——700ms trunk_slam 与 navigator.vibrate(40)、1000/1300ms horn 两次的调用和容错单测通过，但正式 MP3 未交付，真实发声和设备震动未实测。
- 通过——2500ms 出按钮，第 1 关“下一关”进入第 2 关，第 2 关“再来一次”重开当前关；“试试妈妈模式”保留 mom 动作接口，显示筹备中提示，点击提示重开第 2 关。未做——妈妈模式本体及完成后的“回第 1 关”等按钮，按任务范围留后续。
- 收尾复跑 npm test：67 通过、1 个既有性能测试默认跳过，包含 typecheck；npm run art:check 通过；npm run levels:v1 通过（stage2 10 件、11 个完整解、首解 3022 节点），未产生关卡文件差异。新增测试覆盖时间点、跨帧一次性、跳帧、粒子上限/复用/回收、图片兜底、震动缺失/异常、冻结输入与 Bootstrap 路由。核心覆盖率不代表 UI 覆盖率。
- 现有预览截图位于 /workspace/repo/tools/out/finish-preview（仓库相对路径 tools/out/finish-preview）：300.png、700.png、850.png、1000.png、1300.png、1800.png、2500.png。已查验 1800ms 截图，红金车盖、春节灯笼、夜路与彩纸体现满载年货归家。截图来自 Chromium + Canvas 适配器渲染 FinishView 源码，不是正式 Cocos/Web Mobile 或完整装车流程验收；300ms 独立预览没有原盘面。该目录被 git 忽略，截图仅保留本机，未上传 PR。
- PR 描述已按 4.9 逐项标注通过/部分/未做；完整结论与截图路径写入仓库外 /workspace/task4-report.md。正式音效、设备震动、Cocos 渲染与真机性能仍待后续验证。
- 不修改 main、不合并、不改交互规则、不重新打包 Web Mobile。Actions 额度阻塞，未运行 gh run watch，不宣称 CI 全绿。
