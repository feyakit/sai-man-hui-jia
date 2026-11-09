# 接手开发

从仓库的 `work/m1-core` 分支继续，工作进度统一关联草稿 PR #2。交互细节见 GitHub Issue #1。提交前更新 [开发与验收记录](development-log.md)，包含命令、结果、未验收项和需要人工处理的步骤。

## 当前交付

M1 核心规则和 M2 关卡工具已通过云端验收。Node.js 24 环境执行 `npm ci`、`npm test` 和 `npm run test:performance` 即可复核。M2 命令在 [README](../README.md)。生成关卡前由接手人在本机设置 `LEVEL_SECRET`。正式云端上传安排在微信云端阶段。

## M3 试玩源码与待验收项

PR 的 **Build Cocos Web Mobile** 任务在 Windows 构建机运行 Cocos Creator 3.8.8。它使用官方 Empty 2D 模板和 2D 场景，Bootstrap 在场景启动后挂载到 GameRoot。构建成功时可从对应 Actions 运行下载 `trunk-home-web-mobile`。

仓库带有一份已验解的公开试玩关卡 `client/assets/resources/dev-levels/demo.json`。使用其他关卡时，在仓库根目录生成并复制开发关卡。构建完成后通过 HTTP 服务打开构建目录中的 `index.html`。按 Issue #1 实测一指拖拽、近格吸附、旋转、合法与非法预览、拖回托盘和重开。M3 还需验证手机与桌面均可玩两关，URL 参数 `?level=demo` 可直达挑战关，以及后台 10 秒后倒计时扣减约 10 秒。当前只有源码、类型检查和逻辑测试通过，浏览器实际交互需要在 Web Mobile 构建后验收。

## 交付规则

按 M1 到 M8 顺序验收。核心代码保持纯 TypeScript，Cocos 场景、预制体和元数据由编辑器维护。微信 AppID、云环境、广告位、生产种子从本地或云环境配置读取。生成的解位于 `levels/solutions/`，由服务端使用。

GitHub Actions 对 PR 自动运行类型检查、核心测试、五菱性能测试和七天关卡验证。查看 PR 的 Checks 可找到对应提交的执行结果。
