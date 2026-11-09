# 接手开发

从仓库的 `work/m1-core` 分支继续，工作进度统一关联草稿 PR #2。交互细节见 GitHub Issue #1。提交前更新 [开发与验收记录](development-log.md)，包含命令、结果、未验收项和需要人工处理的步骤。

## 当前交付

M1 核心规则和 M2 关卡工具已通过云端验收。Node.js 24 环境执行 `npm ci`、`npm test` 和 `npm run test:performance` 即可复核。M2 命令在 [README](../README.md)。生成关卡前由接手人在本机设置 `LEVEL_SECRET`。正式云端上传安排在微信云端阶段。

## M3 春运主题试玩与官方构建

[私密试玩](https://sai-man-hui-jia-playtest.feya0517.chatgpt.site) 已更新为 Cocos Creator 3.8.8 的正式 Web Mobile 导出。两关用归家夜路、车厢、年货标签和到家画面串起春运主题。浏览器需要 WebGL，链接限项目所有者访问。

[官方构建与浏览器验收](https://github.com/feyakit/sai-man-hui-jia/actions/runs/42634064950) 提供 `trunk-home-web-mobile`。同一导出包在桌面鼠标与 Pixel 7 模拟触屏各通关两关，旋转、非法落点、拖回托盘、URL 直达及后台计时通过。实体手机仍待复测。

仓库带有已验解的试玩关卡 `client/assets/resources/dev-levels/demo.json`。使用其他关卡时，在仓库根目录生成并复制开发关卡。通过 HTTP 打开构建目录的 `index.html`，或用 `node --import tsx tools/cocos/smoke-web-mobile.mjs <构建目录> <截图目录>` 复跑验收。也可用 `?level=demo` 直达挑战关。

## 尚未开发的里程碑

| 阶段 | 范围 |
| --- | --- |
| M4 | 启动页、选老家省份、首页、转场和正式结算流程，帮忙模式、分享图、道具模拟 |
| M5 | 微信小游戏适配、构建模板、主包与分包配置、微信开发者工具及真机 |
| M6 | 微信登录、全国同一每日关卡、每人每天首次通关为老家接回一人、省榜与连胜、云端防作弊和真实关卡上传 |
| M7 | 正式品牌、车型与年货美术，放置和关车厢动效、催促反馈、音效、真机性能 |
| M8 | 断网重试、提交去重、埋点、上线验收 |

## 交付规则

按 M1 到 M8 顺序验收。核心代码保持纯 TypeScript，Cocos 场景、预制体和元数据由编辑器维护。微信 AppID、云环境、广告位、生产种子从本地或云环境配置读取。生成的解位于 `levels/solutions/`，由服务端使用。

GitHub Actions 对 PR 自动运行类型检查、核心测试、五菱性能测试和七天关卡验证。查看 PR 的 Checks 可找到对应提交的执行结果。
