# Changelog

## v0.3.0 — 三大完整玩法模式、3D 实时变形机库、零字节程序化音景与全端移动适配

### Gameplay & 3D Modes
* **完整任务 2.0（Campaign 2.0）**（`src/simulation/lunar-campaign-plus.mjs`）：扩大 64m×64m 环形山可探索盆地；新增 2.35s 轨道空降开场、中继激光链路/观测站六边形护盾穹顶/太阳能磁轨三大动态基地特写、太阳耀斑与微陨石动态危机、`[Q]` 地质声呐与 3 处遗迹、车载能量护盾槽（进安全区自动充能）、SLN-07 火箭发射塔与 4.5s 点火升空终局；新增**地球望远镜拍照彩蛋引导**（发光棱镜信标 + 底部实时距离胶囊 + 林指挥官电台提示）。
* **深空搜打撤 · 肉鸽远征 & 3D 实时变形机库**（`src/simulation/lunar-extraction.mjs`）：4 种动态月面地貌开放盆地、低矮柔和收缩电磁风暴圈（联动右下角雷达虚线圈）、野外应急中继站/低重力跳台/陨石核、三选一战术卡牌构筑，以及 4 台可实时 3D 变形的载具（先锋探索者 / 猎隼疾速艇 / 泰坦重装矿机 / 彩蛋迷你飞碟）与免费试驾/悬赏闭环。
* **星际磁吸竞速 · 狂野轨道（Orbital Mag-Lev GP）**（`src/simulation/lunar-race.mjs`）：3 张专属 3D 赛道（星港霓虹都市 / 赤峡熔岩矿区 / 天穹反重力 360° 倒立星环）、5 档渐进加速 + 2.2s–2.6s 加速后惯性滑行尾段、3D 氦-3 能量瓶续杯氮气、写实化炭黑金属碎片撞毁特写 + 4 层物理碰撞音效与 3D 彩带领奖台。

### Rendering, Audio & Mobile UX
* **地球云层流动加速与双层旋涡扩散**（`src/rendering/lunar-earth-optics.mjs`）：在 WebGL 2 片元着色器中升级双层差速云带与有机旋涡扩散，2 秒内清晰可见云系自然舒展流转，零额外贴图开销。
* **0 字节程序化深空环境合成器 & GPU 减负**（`src/audio/lunar-music.mjs`、`src/core/lunar-game.mjs`）：移除 275 KB Base64 音频改用 Web Audio 四和弦渐进深空合成器，全三模式单文件体积控制在 **1.81 MB（Gzip 806 KB）**；启动阶段预编译全场景着色器、阴影节流 28ms、桌面 `pixelRatio` 上限 1.35、SSAO `occlusionScale` 降至 0.38。
* **物理与交互细节打磨**：补齐着陆坪旁双翼太阳能板物理碰撞；机械臂取样回缩改为平稳航天液压阻尼；车载护盾球升级为平滑清透 Fresnel 边缘光。
* **手机竖屏（390×844）与横屏（844×390）全模式零遮挡适配**：完成首页、故事、肉鸽、竞速与 3D 机库（竖屏上 42% 展台 + 下 58% 抽屉 / 横屏左 48% 展台 + 右 52% 面板）全量触控布局重构并通过 Playwright 8/8 画面零重叠审计。
* 新增 [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) 玩法、经济与工程设计白皮书。

## v0.2.1 — GPU 双倍减负、视觉氛围强化与领域分层开源

### GPU Performance & Bundle
* **Draw Calls 减半（473 → 245，-48.2%）& 面数削减近 60%（1.40M → 577k，移动端 1.46M → 571k）**：移除晶石与岩芯的 `transmission` 整场双 Pass 渲染，改用 `sheen + clearcoat +` 菲涅尔高光边缘模拟通透感；将 28 块边界路标与 35 块晶座月岩分别合批为 `InstancedMesh`；地形细分按端自适应（桌面 184² / 移动 136²），远景碎石降阶 LOD 并修复陡坡悬空。
* **包体再瘦身（1.81 MB → 1.75 MB，Gzip 895 KB，对比初版 -67.2%）**：天空地球圆盘改为复用 `lunar-earth-color.webp` + 球面正交反投影，彻底移除 78 KB 重复的 `BLUE_MARBLE_DATA`。
* 修复 `lunar-lighting.mjs` 导出对象的 getter 快照问题，确保切换 `Mobile Low` 时 `bloomEnabled` 状态实时同步。

### Visuals, Game Feel & Structure
* **月球车氛围升级**（`src/world/lunar-rover.mjs`）：新增车尾双喷口 **HDR 青蓝离子推进火焰 + 动态尾灯**（按住 `Shift` 点燃触发 Bloom）与前灯轻量 Fresnel 体积光锥。
* **60 秒极速采集模式打磨**（`src/simulation/lunar-arcade.mjs`）：动态切换右上角 HUD 标签为「得分 / 连击 / 信标」；新增屏幕霓虹连击飘字、连击倒计时衰减条、巡检机高速**险过奖励（Near Miss Bonus）**；新增全局 `K` 键防卡车一键回正脱困。
* **源码目录按领域分层**：将 `src/` 重组为 `core / rendering / simulation / world / audio / ui / assets` 七大清晰目录，提升开源代码可读性。

## v0.2.0 — 工程架构重构、极限压包与渲染 Breakdown 升级

### Performance & Packaging
* **单文件极限瘦身（5.32 MB → 1.81 MB，-65.9%）**：移除内嵌片头 MP4 与静态封面大图，改为引擎实时 3D 轨道运镜；将 BGM 精简为 40 秒等功率无缝循环 AAC（202 KB）。
* **地球观测迁移至 WebGL 2 Fragment Shader**（`src/rendering/lunar-earth-optics.mjs`）：彻底消除主线程 400 万次逐像素 JS 计算卡顿，实现连续平滑云层漂移与 GPU 实时假彩远紫外模拟。
* 打包脚本支持输出结构化体积拆解报告（`docs/bundle-stats.json`）。

### Rendering & Visual Polish
* **HDR 选择性 Bloom Pass**（`src/rendering/lunar-lighting.mjs`）：在 HalfFloat `beauty` 缓冲与 AgX 映射之间新增 1/4 分辨率阈值提取与双 Pass 可分离高斯模糊，赋予车灯、着陆区 LED 灯柱、晶石与钻切火花自然泛光。
* **视觉短板修复**：移除晶石底座生硬黑圆盘，改用自然半埋月岩碎石基座；钻切点新增 HDR 高温火花粒子（`src/world/lunar-mining.mjs`）；着陆区浮空光球 Sprite 升级为斜角金属 LED 灯柱；环形山斜坡碎石增加地形法线对齐与防悬空下沉（`src/world/lunar-surface.mjs`）。
* 解除 `THREE.REVISION === "182"` 脆弱硬编码，改为基于 ShaderChunk 锚点检测并安全回退。

### Tooling, Architecture & Gameplay
* **实时渲染通道 Breakdown & 性能调试面板**（`src/ui/lunar-debug-overlay.mjs`）：按 `F2` 或通过 `?debug=1` / 设置菜单呼出，支持实时 FPS 曲线、Draw Calls、面数、虚拟车辙显存节省率、6 轮 120Hz 悬挂载荷条、画质档位热切换，以及 `Final / SSAO / HDR Bloom / No Post / Depth / Track Pages / Wireframe` 七种通道一键切换。
* **模块解耦**：从主入口 `lunar-game.mjs` 抽离场景装配（`lunar-world.mjs`）与雷达渲染（`lunar-radar.mjs`）。
* **新增「60 秒极速采集（Arcade Sprint）」模式**（`src/simulation/lunar-arcade.mjs`）：高速穿环瞬时采集、`×1–×5` 连击倍率、递升音阶反馈音（`src/audio/lunar-audio.mjs`）、低重力飞坡滞空奖励（Air Jump Bonus）、Spring 镜头微震与推进 FOV 扩张。
* **开源完整工程源码与技术文档**：公开 `src/`、`scripts/`、[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)、[`docs/RENDERING_BREAKDOWN.md`](docs/RENDERING_BREAKDOWN.md) 与 [`docs/OPTIMIZATION_LOG.md`](docs/OPTIMIZATION_LOG.md)。

## v0.1.1 — 初始公开试玩版
* 发布 5.6 MB 单文件离线 HTML 试玩版，包含完整科考任务、地球望远镜观测与 Playwright 自动化验收脚本。
