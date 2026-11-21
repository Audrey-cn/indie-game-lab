# Changelog

## v0.2.0 — 工程架构重构、极限压包与渲染 Breakdown 升级

### Performance & Packaging
* **单文件极限瘦身（5.32 MB → 1.81 MB，-65.9%）**：移除内嵌片头 MP4 与静态封面大图，改为引擎实时 3D 轨道运镜；将 BGM 精简为 40 秒等功率无缝循环 AAC（202 KB）。
* **地球观测迁移至 WebGL 2 Fragment Shader**（`src/lunar-earth-optics.mjs`）：彻底消除主线程 400 万次逐像素 JS 计算卡顿，实现连续平滑云层漂移与 GPU 实时假彩远紫外模拟。
* 打包脚本支持输出结构化体积拆解报告（`docs/bundle-stats.json`）。

### Rendering & Visual Polish
* **HDR 选择性 Bloom Pass**（`src/lunar-lighting.mjs`）：在 HalfFloat `beauty` 缓冲与 AgX 映射之间新增 1/4 分辨率阈值提取与双 Pass 可分离高斯模糊，赋予车灯、着陆区 LED 灯柱、晶石与钻切火花自然泛光。
* **视觉短板修复**：移除晶石底座生硬黑圆盘，改用自然半埋月岩碎石基座；钻切点新增 HDR 高温火花粒子（`src/lunar-mining.mjs`）；着陆区浮空光球 Sprite 升级为斜角金属 LED 灯柱；环形山斜坡碎石增加地形法线对齐与防悬空下沉（`src/lunar-surface.mjs`）。
* 解除 `THREE.REVISION === "182"` 脆弱硬编码，改为基于 ShaderChunk 锚点检测并安全回退。

### Tooling, Architecture & Gameplay
* **实时渲染通道 Breakdown & 性能调试面板**（`src/lunar-debug-overlay.mjs`）：按 `F2` 或通过 `?debug=1` / 设置菜单呼出，支持实时 FPS 曲线、Draw Calls、面数、虚拟车辙显存节省率、6 轮 120Hz 悬挂载荷条、画质档位热切换，以及 `Final / SSAO / HDR Bloom / No Post / Depth / Track Pages / Wireframe` 七种通道一键切换。
* **模块解耦**：从主入口 `lunar-game.mjs` 抽离场景装配（`lunar-world.mjs`）与雷达渲染（`lunar-radar.mjs`）。
* **新增「60 秒极速采集（Arcade Sprint）」模式**（`src/lunar-arcade.mjs`）：高速穿环瞬时采集、`×1–×5` 连击倍率、递升音阶反馈音（`src/lunar-audio.mjs`）、低重力飞坡滞空奖励（Air Jump Bonus）、Spring 镜头微震与推进 FOV 扩张。
* **开源完整工程源码与技术文档**：公开 `src/`、`scripts/`、[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)、[`docs/RENDERING_BREAKDOWN.md`](docs/RENDERING_BREAKDOWN.md) 与 [`docs/OPTIMIZATION_LOG.md`](docs/OPTIMIZATION_LOG.md)。

## v0.1.1 — 初始公开试玩版
* 发布 5.6 MB 单文件离线 HTML 试玩版，包含完整科考任务、地球望远镜观测与 Playwright 自动化验收脚本。
