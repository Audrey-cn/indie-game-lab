<h1 align="center">月面采集站</h1>

<p align="center"><strong>驶入月球南极，为下一支车队留下一座站。</strong></p>

<p align="center">
  <a href="https://audrey-cn.github.io/lunar-field-station/"><strong>在线试玩</strong></a> ·
  <a href="https://github.com/Audrey-cn/lunar-field-station/releases/download/v0.1.1/lunar-field-station.html">下载单文件</a> ·
  <a href="./docs/controls.zh-CN.md">操作手册</a> ·
  <a href="./README.en.md">English</a>
</p>

<p align="center"><sub>试玩版 0.1.1 · Three.js r182 · WebGL 2 · 5.6 MB 单文件</sub></p>

[![游戏实机画面，六轮月球车停在野外工作站前，地球挂在月面地平线之上。](./media/lunar-field-station.jpg)](https://audrey-cn.github.io/lunar-field-station/)

《月面采集站》是一款用 Three.js 制作的单人浏览器试玩。跟着随行无人机「枝灯」穿过环形山，钻取晶样、读取仪器，到工坊制造并部署中继站、地形观测站和太阳能补给站。最后回到着陆区，回传任务记录。

## 开始试玩

用支持 WebGL 2 的浏览器[在线试玩](https://audrey-cn.github.io/lunar-field-station/)，或[下载 HTML](https://github.com/Audrey-cn/lunar-field-station/releases/download/v0.1.1/lunar-field-station.html)后打开，然后选择「开始完整任务」。游戏、画面和音频都打包在[一个 HTML 文件](./index.html)里，下载后可离线运行，无需安装或构建。

电脑上用 **WASD** 或**方向键**驾驶，**空格**刹车，**Shift** 推进。靠近晶体或勘测仪器并停车，长按 **E** 取样或读取。到工坊按 **R** 制造套件，到施工点再用 **R** 预览地基并部署。手机上用左侧摇杆驾驶，在屏幕右侧滑动观察，点击场景中的操作提示完成交互。[完整操作手册](./docs/controls.zh-CN.md)

## 月面任务

- **勘测与取样。** 月球车在月壤上留下车辙。停稳对准晶石，看机械臂钻出岩芯、提起并装入样本舱。
- **建设与返航。** 把首批晶样和勘测读数送回着陆区，解锁建设。设施上线后返航，回传完整任务记录。
- **从月面回望地球。** 到观测台变焦取景，拍摄可见光、模拟远紫外或全景影像。
- **听见月球车的动作。** 车轮接地和取样钻头有独立音效，取样时钢琴会自动压低。音乐和音效可分别开关。

## 开发

早期原型主要使用 **Fable 5.2** 开发，后续结合试玩反馈，由 Codex 协助持续打磨。开发期间的模型调用费用约 **50 美元**。游戏使用 **Three.js r182**，以 WebGL 2 渲染、Web Audio 混音，最终打包为单文件 HTML。

## 素材与致谢

配乐为 [Scott Buckley 的《In This Moment》](https://www.scottbuckley.com.au/library/in-this-moment/)，采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。完整的素材来源、署名和授权见[素材与授权清单](./CREDITS.md)。
