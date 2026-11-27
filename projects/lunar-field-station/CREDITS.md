# 素材、署名与授权 · Credits and licenses

[简体中文首页](README.md) · [English README](README.en.md)

## 内置与随附素材 · Bundled content

| 素材 · Asset | 来源与署名 · Source and credit | 许可及处理 · Terms and changes |
| --- | --- | --- |
| 3D 引擎 · 3D engine | [Three.js r182](https://github.com/mrdoob/three.js/tree/r182)，© Three.js authors | [MIT 许可全文 · Full MIT notice](licenses/Three.js-MIT.txt)。许可全文同时附在 HTML 末尾。 The standalone HTML also includes the notice. |
| 基地 GLB 模型 · Outpost GLB models | Kenney, Space Kit | CC0 1.0. `hangar_roundGlass.glb`, `craft_miner.glb`, `astronautA.glb`, `rock.glb`; normalized, terrain grounded, and embedded in the standalone HTML. Rock materials use lunar gray. |
| 钢琴配乐 · Piano score | [“In This Moment” by Scott Buckley](https://www.scottbuckley.com.au/library/in-this-moment/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。授权源曲保留于 src/audio/lunar-in-this-moment-loop.m4a，并用于 v0.1.1 README 实机演示片段；当前轻量公开试玩版改用项目原创的零字节程序化深空合成器（Web Audio），不内嵌该音频。 Licensed source score retained in src/audio/lunar-in-this-moment-loop.m4a and used in the v0.1.1 README gameplay clip; the current lean public playable instead uses an original zero-byte procedural deep-space synth (Web Audio) and does not embed this audio. |
| 碰撞与机械拟音 · Impact and mechanical foley | Kenney，[Impact Sounds](https://kenney.nl/assets/impact-sounds) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。三段源声裁切、重采样、滤波及粒化后，用于接地、钻切和机械动作。 Three source clips were trimmed, resampled, filtered and granulated for contact, drilling and mechanical movement. |
| 天空中的地球 · Earth sky disc | [Blue Marble 2002](https://science.nasa.gov/resource/blue-marble-2002/)，Reto Stöckli / NASA Goddard Space Flight Center，Robert Simmon 协助处理 · with Robert Simmon | [NASA 素材使用指南 · Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)。调整尺寸并用于天穹渲染。 Resized for the in-game sky. |
| 望远镜地表图 · Telescope surface map | [Blue Marble Next Generation with Topography and Bathymetry, August 2004](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/)，Reto Stöckli / NASA Earth Observatory | [NASA 素材使用指南 · Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)。裁切、缩放并转为 WebP，用于地球可见光重建。 Cropped, resized and converted to WebP for the visible-light reconstruction. |
| 望远镜云图 · Telescope cloud layer | [NASA Blue Marble 2002 MODIS 云层合成图 · MODIS cloud composite](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/)，NASA Earth Observatory / NASA Goddard Space Flight Center | [NASA 素材使用指南 · Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)。裁切、缩放并转为 WebP，游戏内模拟云层漂移。 Cropped, resized and converted to WebP; cloud drift is simulated. |
| 历史远紫外照片 · Historical far-UV photograph | [Earth in Far-Ultraviolet](https://www.nasa.gov/image-article/earth-in-far-ultraviolet/)，NASA，John W. Young / Apollo 16，S72-36972 | [NASA 素材使用指南 · Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)。调整尺寸用于历史对照。 Resized for the historical comparison. |

月壤、车体、设施、UI 与月面动效由本项目实现。片头视频和 README 封面由游戏场景实拍生成。远紫外观测模式为程序化假彩模拟，历史对照使用上表单列的阿波罗影像。

The terrain, rover, facilities, interface and lunar effects were made for this project. The title loop and README cover were captured in-engine. The far-UV observation mode is a procedural false-color simulation, with the credited Apollo image provided for historical comparison.

README 实机演示为 v0.1.1 版本录制，保留当时的游戏内混音，收录 Scott Buckley 的《In This Moment》（CC BY 4.0）片段；当前轻量试玩版已改用原创程序化合成器。

The README gameplay clip was captured from v0.1.1 and uses an excerpt of Scott Buckley’s “In This Moment” (CC BY 4.0) in the in-game mix; the current lean playable uses an original procedural synth.

Kenney 原始文件 · Kenney source files: `impactMining_000.ogg`, `impactPlate_medium_000.ogg`, `impactPlate_light_002.ogg`. [样本文件对应 · Sample mapping](https://github.com/manuel-palacio/brickstorm/blob/main/CREDITS.md)

## 参考与发行范围 · References and distribution

《月面采集站》的月表表现参考了 [NASA 阿波罗月面档案](https://www.nasa.gov/history/alsj/)。Felix Rieseberg 的 *Saltline*（经[《几猫》社区版本](https://github.com/odin1024/jimao)了解）为单文件场景呈现提供了设计参考。

The lunar setting draws on the [Apollo Lunar Surface Journal](https://www.nasa.gov/history/alsj/). Felix Rieseberg’s *Saltline*, encountered through the [Jimao community edition](https://github.com/odin1024/jimao), was a design reference for the single-file presentation.

公开试玩版的第三方组件适用各自的许可。项目原创内容保留其相应权利。

Third-party components carry the terms listed above. Project-original material retains its existing rights.
