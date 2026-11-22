# 半夜扫地机：客厅摸金 · Roomba Raid

> **男女通吃 · 荒诞日常 × 单手竖屏肉鸽割草 × 零带入门槛轻度搜打撤**
> 目标分发渠道：微信小游戏（竖屏碎片化） + X / 社群即点即玩 Web 单文件

**当前版本：v0.7.0（可玩）** · 零依赖 Canvas 2D 单文件 `index.html`（~488 KB / Gzip 287 KB），手机竖屏优先、兼容 PC。

## 项目状态
- [x] 世界观、核心玩法与商业/裂变闭环架构设计（见 [`docs/DESIGN_MINDMAP_AND_LOOPS.md`](./docs/DESIGN_MINDMAP_AND_LOOPS.md)）
- [x] 第一轮美术概念设定稿（主角改装、客厅怪潮与大金、9:16 实机视觉靶标，见 [`art/concept-sheets/`](./art/concept-sheets/)）
- [x] 15 秒核心爽感可玩 MVP（单手竖屏 + 大金光柱 + 充电桩撤离 + 翻车舔包链接 + 战报小票）
- [x] 5 张程序化地图渐进解锁链、3×9 天赋树、8 配饰、4 武器进化
- [x] 金光开箱、地图卡枢纽、分层 SFX 与 Bloom VFX、海报结算 + QR、三选一抽卡、暂停、15s 热身、Boss 钥匙库
- [x] 每日同图种子（Daily Seed）+ `?seed&drop` 零后端异步舔包链接
- [ ] 美术与设计方案评审定稿（持续迭代）
- [ ] 微信小游戏平台适配与 IAA 卡点上线（见设计文档商业闭环）

## 本地构建与试玩

```sh
node scripts/build.mjs   # 产出单文件 index.html
# 直接用浏览器打开 index.html，或经 GitHub Pages 在线试玩
```