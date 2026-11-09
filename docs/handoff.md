# 接手开发

从仓库的 `work/m1-core` 分支继续，工作进度统一关联草稿 PR #2。交互细节见 GitHub Issue #1。提交前更新 [开发与验收记录](development-log.md)，包含命令、结果、未验收项和需要人工处理的步骤。

## 当前交付

M1 核心规则和 M2 关卡工具已通过云端验收。Node.js 24 环境执行 `npm ci`、`npm test` 和 `npm run test:performance` 即可复核。M2 命令在 [README](../README.md)。生成关卡前由接手人在本机设置 `LEVEL_SECRET`。正式云端上传安排在微信云端阶段。

## 下一阶段

M3 使用 Cocos Creator 3.8.x，在 `client/` 用编辑器创建 Empty 2D 工程。保留仓库已有的 `client/assets/scripts/core/` 源码。通过编辑器新建 `assets/scenes/Main.scene`，Canvas 设为 750 × 1334 并启用 Fit Width。场景只放 Canvas 与其子节点 GameRoot，界面运行时创建。实现 Bootstrap 后把它挂到 GameRoot，设 Main 为启动场景。每次新增脚本或资源后打开编辑器生成 `.meta`。

在仓库根目录生成并复制开发关卡，再用编辑器构建 Web Mobile。按 Issue #1 实测一指拖拽、近格吸附、旋转、合法与非法预览、拖回托盘和重开。M3 还需验证手机与桌面均可玩两关，URL 参数可选关，以及后台 10 秒后倒计时扣减约 10 秒。

## 交付规则

按 M1 到 M8 顺序验收。核心代码保持纯 TypeScript，Cocos 场景、预制体和元数据由编辑器维护。微信 AppID、云环境、广告位、生产种子从本地或云环境配置读取。生成的解位于 `levels/solutions/`，由服务端使用。
