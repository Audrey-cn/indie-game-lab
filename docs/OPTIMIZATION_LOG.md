# 工程优化与性能实测记录 · Optimization & Benchmark Log

以下全部数据均由本仓库自动化脚本 [`scripts/pack-three-demo.mjs`](../scripts/pack-three-demo.mjs) 与 [`scripts/lunar-benchmark-qa.mjs`](../scripts/lunar-benchmark-qa.mjs) 在 macOS Metal WebGL 2（Headless Edge）环境下实测采集，原始 JSON 报告保留在 [`docs/bundle-stats.json`](./bundle-stats.json) 与 [`docs/benchmark-report.json`](./benchmark-report.json)。

## 1. 单文件包体极限瘦身（Playable Ads / 轻量跨端标准）

| 指标 | v0.1.1（优化前） | v0.2.0（优化后） | 变化 |
| :--- | :---: | :---: | :---: |
| **单文件离线 HTML 总大小** | 5.318 MB (5,575,910 B) | **1.814 MB (1,902,153 B)** | **-65.9% (-3.50 MB)** |
| **Gzip 传输体积** | ~4.1 MB | **949.9 KB** | **< 1 MB 传输** |
| **内嵌 BGM 体积（Base64）** | ~2.67 MB（完整 200s 原曲） | **268.8 KB**（40s 等功率无缝循环） | **-90.0%** |
| **内嵌片头视频 + 封面** | ~1.18 MB（MP4 + WebP） | **0 KB**（改为引擎实时 3D 轨道运镜） | **-100%** |
| **JS + Three.js + 地球贴图** | ~1.47 MB | 1.50 MB（新增 Bloom/Arcade/Debug/GPU地球） | 仅增 ~30 KB |

### 关键工程取舍
1. **片头去 MP4 化**：原先片头为了省首帧渲染内嵌了 655 KB MP4 + 232 KB WebP；重构后直接启用引擎实时轨道运镜，不仅立省 1.18 MB，还实现了点击“开始任务”时镜头从环绕视角**零切换平滑拉至车尾**的电影感转场。
2. **BGM 等功率无缝循环**：从原曲提取核心钢琴乐段，使用等功率正余弦交叉淡化（2.5s overlap）生成 40 秒无缝循环 AAC（202 KB 二进制），大幅降低首屏 Base64 解码与内存峰值。

---

## 2. 渲染与运行时性能基线（v0.2.0 实测）

![Live Debug & Profiling HUD](../media/render-debug-hud.jpg)

| 运行环境 / 档位 | Boot 耗时 | Draw Calls | 场景面数 | 虚拟车辙显存占用 | 显存节省率 | 后处理配置 |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Desktop · High (1280×720)** | 2.05 s | 452–473 | ~1.40M | **397 KB** (6–8/256 页) | **-96.8%** (对比 12 MB 全图) | PCSS + SSAO 0.5x + HDR Bloom |
| **Desktop · Balanced** | — | 473 | ~1.40M | 397 KB | -96.8% | PCSS + SSAO 0.4x + HDR Bloom |
| **Desktop · Low** | — | 466 | ~1.40M | 397 KB | -96.8% | SSAO 0.32x + 阴影 48ms 节流 |
| **Mobile Portrait (400×869 DPR2)** | 2.30 s | 542 | ~1.46M | 按需分配 | 自动按需 | PCF 1024 + SSAO 0.32x + 关闭 Bloom/AA |

### CPU → GPU 地球光学渲染迁移收益
* **优化前**：打开地球望远镜时，JS 主线程同步执行 `1152 × 1152 × 3` 像素的三角反投影与双线性插值（约 400 万次循环），在中低端设备上造成明显卡顿；云层仅靠 3 张静态图混合。
* **优化后**：直接上传 WebP 贴图至 WebGL 2 纹理，Fragment Shader 在 GPU 毫秒级实时完成反投影与光照；云层变为连续平滑漂移，且保持 `prefers-reduced-motion` 下零像素抖动（已通过 `check-earth-immersive.mjs` 桌面/竖屏/横屏三端自动化验收）。

---

## 3. 自动化回归验证矩阵

| 测试套件 | 脚本 | 覆盖范围 | 结果 |
| :--- | :--- | :--- | :---: |
| **完整战役自动通关** | [`scripts/lunar-campaign-qa.mjs`](../scripts/lunar-campaign-qa.mjs) | 10 阶段完整任务、3 晶样、2 勘测、3 设施制造部署校准、补电循环、重开菜单 | **PASS**（0 错误 / 0 外联） |
| **地球观测三端验收** | [`scripts/check-earth-immersive.mjs`](../scripts/check-earth-immersive.mjs) | 桌面 + 竖屏 + 横屏；可见光/远紫外/全景、1×–8× 缩放、动态云层与减动效、PNG 导出 | **PASS**（0 错误 / 0 外联） |
| **性能与街机模式验证** | [`scripts/lunar-benchmark-qa.mjs`](../scripts/lunar-benchmark-qa.mjs) | 三档画质切换、Breakdown 4 通道截图、60 秒街机模式采分与连击验收 | **PASS**（0 错误 / 0 外联） |
