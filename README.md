# 塞满回家

使用 Node.js 24，在仓库根目录运行 `npm ci`。开发者从[接手说明](docs/handoff.md)进入，并查看[开发与验收记录](docs/development-log.md)。

## 怎么玩

手机竖屏打开。目标是在倒计时结束前，把托盘里的年货尽可能塞进后备箱；全部恰好装下后触发关盖、尾灯和彩纸结算。

- 轻点年货只选中，不会旋转或移动；按住并移动超过 8px 才开始拖动。
- 拖到后备箱上方会显示落点预览：绿色可放，红色不可放。松手后合法落位，非法落位会飞回原位。
- 用底部的“旋转 90°”按钮转动选中年货。拖动中也可以按旋转按钮，手里的年货会立即转向。
- “撤销”回退放置、拿出或旋转；“重开”会先弹出“重新装车？”确认。
- 第 1 关 4 件、60 秒，开局有手指引导；第 2 关 10 件、150 秒。第 2 关结算后可点“下一关”，或点“试试妈妈模式”进入追加年货模式；也可以直接打开 `?mode=mom`。
- 右上角红金齿轮打开设置，可分别开关“音效”和“震动”，默认都开，设置会保存在浏览器 `localStorage`。
- 倒计时最后 10 秒数字变红、轻微跳动并每秒 tick。时间到后盘面冻结，点“再装一次”重开当前关。

浏览器需要 WebGL。首次进入后先点一下屏幕，浏览器才允许播放音效。

## 怎么本地运行

### 运行测试与检查

需要 Node.js 24 和 npm。在仓库根目录执行：

```sh
npm ci
npm test
npm run art:check
npm run levels:v1
npm run test:performance
```

`npm test` 会先跑 TypeScript 类型检查，再跑 Vitest 和核心代码覆盖率。`npm run levels:v1` 会重新生成并校验 V1 第 2 关；正常情况下关卡文件和 fixture 不应出现差异。

### 运行 Cocos Web Mobile 试玩

用 Cocos Creator 3.8.8 打开 `client/`，选择 Web Mobile 构建。构建完成后，在构建输出目录（例如 `client/build/web-mobile`）启动静态 HTTP 服务：

```sh
python3 -m http.server 8080 -d client/build/web-mobile
```

然后访问 `http://127.0.0.1:8080/`。开发时可用 `?level=demo` 读取 `client/assets/resources/dev-levels/demo.json`，用 `?mode=mom` 直达妈妈模式。未带参数时默认进入第 1 关，第 2 关使用 `client/assets/resources/levels/v1/stage2.json`。

本工作区也提供一条打包脚本，只构建和本地验收、不发布：

```sh
/workspace/build-play.sh origin/work/m1-core --no-publish
```

产物在 `/workspace/play-dist`；本地验收截图在 `/workspace/play-check/`。不要用 `file://` 直接打开 `index.html`，资源加载会被浏览器拦截。

## M1 核心逻辑

- `client/assets/scripts/core/` 包含车型、形状、日期、输入判定、生成器和精确覆盖求解器。
- `npm test` 检查类型、运行单元测试并校验核心代码行覆盖率。
- `npm run test:performance` 使用完整五菱车型，验证解数 1–20、首解至少 2,000 个搜索节点及 10 秒生成要求。
- 五菱保留四角禁放格，并加中间隔挡，剩余 87 格。生成器可以优先试用车型的行李组合，运行时仍完整计数和验解。同形行李共用求解配额，输出解按锚点分配 ID。

## M2 关卡工具

先在本机环境中设置 `LEVEL_SECRET`，然后运行以下命令。

```sh
npm run levels:generate -- --from 2027-01-15 --days 7
npm run --silent levels:evaluate -- --vehicle wuling --samples 200
npm run levels:upload -- --from 2027-01-15 --days 7 --dry-run
npm run levels:copy-dev
npm run art:templates
```

- 生成器使用日期和关卡编号计算 HMAC 种子。关卡与解分开写入 `levels/` 和 `levels/solutions/`。
- 整个日期范围生成成功后才开始写文件。批量生成若失败，报错会包含失败日期和关卡淘汰原因。
- 上传命令目前只执行本地预检。试玩复制只导出关卡字段。轮廓模板输出到 `tools/out/art-templates/`。
- M2 已验证连续七天覆盖六种车型。CSV、SVG 和上传预检均已通过。
