<h1 align="center">Indie Game Lab · 独立游戏实验仓库</h1>
<p align="center"><strong>多类型轻量化 Web / 移动端游戏原型与图形工程实验合集</strong></p>

<p align="center">
  <a href="https://audrey-cn.github.io/lunar-field-station/"><strong>🌐 打开在线试玩导航页（Game Lab Portal）</strong></a>
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
    └── (upcoming-roguelite)/         # [02] 手游优先 · 高饱和割草肉鸽 × 搜打撤（筹备中）
```

---

## 项目列表

### 01 · 月面采集站（Lunar Field Station）
- **定位**：偏 3D 引擎与渲染工程展示的轻量化技术切片（Three.js r182 / WebGL 2 / `1.81 MB` 离线单文件 HTML）
- **核心亮点**：自定义 PCSS 软阴影 + 双边 SSAO + HDR Selective Bloom + 120Hz 6 轮悬架物理 + 0 字节程序化 Web Audio 合成器；包含「完整任务 2.0」「深空搜打撤与 3D 变形机库」「星际磁吸竞速」三大模式及手机竖/横屏适配。
- **入口**：
  - [进入子项目文档与源码](./projects/lunar-field-station/README.md) · [English README](./projects/lunar-field-station/README.en.md)
  - [在线试玩](https://audrey-cn.github.io/lunar-field-station/projects/lunar-field-station/) · [开启 F2 渲染调试面板](https://audrey-cn.github.io/lunar-field-station/projects/lunar-field-station/?debug=1)
  - [玩法与系统设计白皮书](./projects/lunar-field-station/docs/GAME_DESIGN.md) · [系统架构](./projects/lunar-field-station/docs/ARCHITECTURE.md) · [渲染管线拆解](./projects/lunar-field-station/docs/RENDERING_BREAKDOWN.md)

```sh
# 独立构建「月面采集站」
cd projects/lunar-field-station
npm install
npm run build
```

### 02 · 手游优先 · 高饱和肉鸽 × 搜打撤（开发中 / 筹备中）
- **定位**：面向移动端单手竖屏（兼容 PC 键鼠）的高节奏爽感小游戏原型
- **方向**：单屏/竞技场极简画面 + 高对比饱和美术 + 自动攻击割草打击感 + 局内「秘宝撤离博弈」循环。
