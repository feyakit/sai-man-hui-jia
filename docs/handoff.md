# 接手开发

从仓库的 `work/m1-core` 分支继续，工作进度统一关联草稿 PR #2。交互细节见 GitHub Issue #1。提交前更新 [开发与验收记录](development-log.md)，包含命令、结果、未验收项和需要人工处理的步骤。

## 当前交付

M1 核心规则和 M2 关卡工具已通过云端验收。Node.js 24 环境执行 `npm ci`、`npm test` 和 `npm run test:performance` 即可复核。M2 命令在 [README](../README.md)。生成关卡前由接手人在本机设置 `LEVEL_SECRET`。正式云端上传安排在微信云端阶段。

## M3 浏览器试玩与官方构建

[私密试玩](https://sai-man-hui-jia-playtest.feya0517.chatgpt.site) 使用 Cocos 3.8.8 Web 引擎。浏览器需支持 WebGL。桌面鼠标与手机触屏模拟已通关两关。打开后拖动行李放入格子，点按可旋转，拖回托盘可取下。加上 `?level=demo` 可直达挑战关。试玩链接限项目所有者访问。

PR 的 **Build Cocos Web Mobile** 任务在 Windows 构建机运行 Cocos Creator 3.8.8。它使用官方 Empty 2D 模板和 2D 场景，Bootstrap 在场景启动后挂载到 GameRoot。构建成功时，从对应 Actions 运行下载 `trunk-home-web-mobile`。正式导出验证及实体手机复测仍待完成。

仓库带有已验解的试玩关卡 `client/assets/resources/dev-levels/demo.json`。可在仓库根目录生成并复制其他开发关卡。通过 HTTP 服务打开构建目录的 `index.html`，或执行 `node --import tsx tools/cocos/smoke-web-mobile.mjs <构建目录> <截图目录>` 复跑 Chromium 验收。测试项包括两关通关、点击旋转、吸附、非法落点、拖回、URL 直达及后台计时。GitHub Actions 自动保存验收截图。

## 交付规则

按 M1 到 M8 顺序验收。核心代码保持纯 TypeScript，Cocos 场景、预制体和元数据由编辑器维护。微信 AppID、云环境、广告位、生产种子从本地或云环境配置读取。生成的解位于 `levels/solutions/`，由服务端使用。

GitHub Actions 对 PR 自动运行类型检查、核心测试、五菱性能测试和七天关卡验证。查看 PR 的 Checks 可找到对应提交的执行结果。
