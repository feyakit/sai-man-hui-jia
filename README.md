# 塞满回家

使用 Node.js 24，在仓库根目录运行 `npm ci`。

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
- M2 的七天验收需要所有车型均能生成达标关卡。单日工具可用，当前仍在补全车型的关卡组合。
