<h1 align="center">Indie Game Lab · 独立游戏实验仓库</h1>
<p align="center"><strong>多类型轻量化 Web / 移动端游戏原型与图形工程实验合集</strong></p>

<p align="center">
  <a href="https://audrey-cn.github.io/indie-game-lab/"><strong>🌐 打开在线试玩导航页（Game Lab Portal）</strong></a>
</p>

---

## 目录结构

本仓库采用 **Monorepo 多项目结构**，每个子目录均为可独立构建、离线单文件可玩的完整游戏项目：

```text
.
├── index.html                        # GitHub Pages 在线试玩总导航页
├── README.md                         # 仓库总览与项目索引
└── projects/
    ├── lunar-field-station/          # [01] 月面采集站（Three.js WebGL 2 3D 技术切片）
    └── roomba-raid/                  # [02] 半夜扫地机：客厅摸金（男女通吃 · 肉鸽 × 轻度搜打撤）
```

---

## 项目列表

### 01 · 月面采集站（Lunar Field Station）
- **定位**：偏 3D 引擎与渲染工程展示的轻量化技术切片（Three.js r182 / WebGL 2 / `1.81 MB` 离线单文件 HTML）
- **核心亮点**：自定义 PCSS 软阴影 + 双边 SSAO + HDR Selective Bloom + 120Hz 6 轮悬架物理 + 0 字节程序化 Web Audio 合成器；包含「完整任务 2.0」「深空搜打撤与 3D 变形机库」「星际磁吸竞速」三大模式及手机竖/横屏适配。
- **入口**：
  - [进入子项目文档与源码](./projects/lunar-field-station/README.md) · [English README](./projects/lunar-field-station/README.en.md)
  - [在线试玩](https://audrey-cn.github.io/indie-game-lab/projects/lunar-field-station/) · [开启 F2 渲染调试面板](https://audrey-cn.github.io/indie-game-lab/projects/lunar-field-station/?debug=1)
  - [玩法与系统设计白皮书](./projects/lunar-field-station/docs/GAME_DESIGN.md) · [系统架构](./projects/lunar-field-station/docs/ARCHITECTURE.md) · [渲染管线拆解](./projects/lunar-field-station/docs/RENDERING_BREAKDOWN.md)

```sh
# 独立构建「月面采集站」
cd projects/lunar-field-station
npm install
npm run build
```

### 02 · 半夜扫地机：客厅摸金（Roomba Raid · v0.7.0 可玩）
- **定位**：面向微信小游戏与 X 即点即玩的男女通吃荒诞日常爽游（单手竖屏优先，兼容 PC），零依赖 Canvas 2D 单文件（~488 KB / Gzip 287 KB）
- **核心亮点**：圆形大眼扫地机器人半夜客厅大战毛球/臭袜子/乐高雷，狂吸沙发缝大金（单只耳机/私房钱/金猫罐），在电量耗尽前冲回充电底座撤离；5 张程序化地图渐进解锁、3×9 天赋树、8 配饰、4 武器进化、金光开箱与分层 SFX/Bloom VFX；内置「机身整活改装 + 沙发底藏宝展柜 + 每日同图种子 + 朋友翻车点异步舔包链接」与 IAA 卡点商业闭环。
- **入口**：
  - [在线试玩](https://audrey-cn.github.io/indie-game-lab/projects/roomba-raid/) · [体验朋友舔包链接](https://audrey-cn.github.io/indie-game-lab/projects/roomba-raid/?seed=20261122&drop=Audrey:28000:catcan)
  - [子项目文档](./projects/roomba-raid/README.md) · [设计思维导图与商业闭环](./projects/roomba-raid/docs/DESIGN_MINDMAP_AND_LOOPS.md) · [概念美术设定稿](./projects/roomba-raid/art/concept-sheets/)
