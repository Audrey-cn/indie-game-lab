// Meowball Rush v0.1.0 — WitchSpring Cel-Shaded 3D Hamsterball Config
// 6 Collectible Kittens in Magic Bubbles + 3 Multi-Elevation Isometric Courses

export const CATS = [
  {
    id: "witch_black",
    name: "见习小黑猫",
    title: "星空魔女帽",
    bodyColor: 0x322a3d,
    bellyColor: 0x4b4059,
    eyeColor: 0xffb830,
    bubbleColor: 0xb67cff,
    trailColor: 0xc084fc,
    acc: "witch_hat",
    stats: { accel: 1.0, topSpeed: 1.0, grip: 1.0, dizzyResist: 1.0 },
    desc: "均衡全能 · 星空紫泡泡 + 彩虹微风拖尾",
    unlockText: "默认解锁",
    unlockedByDefault: true,
  },
  {
    id: "ginger_scarf",
    name: "暖橘围巾猫",
    title: "蜂蜜水晶球",
    bodyColor: 0xf49d47,
    bellyColor: 0xffe4b8,
    eyeColor: 0x3b2614,
    bubbleColor: 0xffcc4d,
    trailColor: 0xffb703,
    acc: "scarf",
    stats: { accel: 1.05, topSpeed: 1.04, grip: 0.96, dizzyResist: 1.2 },
    desc: "大橘为重 · 陡坡冲刺更快，抗砸抗摔！",
    unlockText: "通关第 1 关【魔女空中花园】解锁",
    unlockReq: { type: "clear", track: 0 },
  },
  {
    id: "ragdoll_sakura",
    name: "蓝眼布偶猫",
    title: "樱花粉泡泡",
    bodyColor: 0xf7f2f0,
    bellyColor: 0xffffff,
    eyeColor: 0x38bdf8,
    bubbleColor: 0xff8ec4,
    trailColor: 0xff85c0,
    acc: "ribbon",
    stats: { accel: 1.02, topSpeed: 0.99, grip: 1.08, dizzyResist: 1.45 },
    desc: "轻盈优雅 · 摔晕恢复极快，丝滑控球！",
    unlockText: "累计收集 12 颗魔法星糖解锁",
    unlockReq: { type: "stars", count: 12 },
  },
  {
    id: "calico_mint",
    name: "三花元气猫",
    title: "薄荷翡翠球",
    bodyColor: 0xfdf6ec,
    bellyColor: 0xffffff,
    eyeColor: 0xd97706,
    bubbleColor: 0x56f0b8,
    trailColor: 0x34d399,
    acc: "bell",
    stats: { accel: 1.08, topSpeed: 1.0, grip: 1.2, dizzyResist: 1.0 },
    desc: "急停之王 · 超强抓地力，走极限窄桥稳如老狗！",
    unlockText: "通关第 2 关【钟表魔法工坊】解锁",
    unlockReq: { type: "clear", track: 1 },
  },
  {
    id: "tuxedo_goggles",
    name: "奶牛飞行员",
    title: "青蓝霓虹球",
    bodyColor: 0x262936,
    bellyColor: 0xf8fafc,
    eyeColor: 0x38f3ff,
    bubbleColor: 0x38e8ff,
    trailColor: 0x38f3ff,
    acc: "goggles",
    stats: { accel: 1.12, topSpeed: 1.12, grip: 0.95, dizzyResist: 1.0 },
    desc: "竞速神车 · 最高极速突破，抢榜必备！",
    unlockText: "锦标赛通关总剩余时间 ≥ 25 秒解锁",
    unlockReq: { type: "time", seconds: 25 },
  },
  {
    id: "aurora_queen",
    name: "星月白猫女王",
    title: "极光幻彩球",
    bodyColor: 0xffffff,
    bellyColor: 0xfef3ff,
    eyeColor: 0x818cf8,
    bubbleColor: 0xd8b4fe,
    trailColor: 0x7dd3fc,
    acc: "crown",
    stats: { accel: 1.1, topSpeed: 1.1, grip: 1.12, dizzyResist: 1.35 },
    desc: "隐藏传说 · 全属性巅峰，极光尾迹闪耀天际！",
    unlockText: "通关全部 3 关锦标赛解锁",
    unlockReq: { type: "clear", track: 2 },
  },
];

// Each track is composed of deterministic 3D surfaces (boxes, ramps, rotating gears, cloud shortcuts),
// plus hazards (swinging hammers), bounce mushrooms, boost strips, star pickups, checkpoints & finish portal!
export const TRACKS = [
  {
    id: "garden",
    name: "01 · 魔女空中花园",
    subtitle: "石砖斜坡 · 彩虹加速 · 隐藏云朵捷径",
    skyTop: 0x60b8ff,
    skyBottom: 0xdff5ff,
    fogColor: 0xd9f2ff,
    sunColor: 0xfff5d6,
    bonusTime: 48,
    start: { x: 0, y: 8.6, z: 0 },
    deathY: -9,
    platforms: [
      // Start Terrace
      { kind: "grass", x: 0, y: 8, z: 0, w: 6.5, d: 6.5, h: 1.2 },
      // Downhill Cobble Ramp (y: 8 -> 5.2)
      { kind: "ramp", x: 0, y: 6.6, z: -6.8, w: 4.4, d: 7.4, h: 0.8, yStart: 8, yEnd: 5.2, dir: "-z" },
      // Mid Meadow Turn + Rainbow Boost Pad
      { kind: "grass", x: 0, y: 5.2, z: -13.5, w: 6.4, d: 6.4, h: 1.2 },
      // Standard Winding Route (Left -> Forward -> Right)
      { kind: "wood", x: -5.6, y: 5.2, z: -13.5, w: 5.0, d: 2.3, h: 0.55 },
      { kind: "grass", x: -10.5, y: 5.2, z: -13.5, w: 5.2, d: 5.2, h: 1.2 },
      { kind: "wood", x: -10.5, y: 5.2, z: -19.8, w: 2.1, d: 7.8, h: 0.55 },
      { kind: "grass", x: -10.5, y: 5.2, z: -26.2, w: 5.4, d: 5.2, h: 1.2 },
      { kind: "ramp", x: -4.8, y: 3.8, z: -26.2, w: 6.4, d: 3.4, h: 0.8, yStart: 5.2, yEnd: 2.4, dir: "+x" },
      // SECRET CLOUD SHORTCUT BRIDGE (Right off Mid Meadow -> skips the whole left loop!)
      { kind: "cloud", x: 4.8, y: 4.6, z: -19.6, w: 2.1, d: 12.8, h: 0.45, secret: true },
      { kind: "cloud", x: 2.6, y: 3.4, z: -26.2, w: 5.0, d: 2.2, h: 0.45, secret: true },
      // Checkpoint Plaza
      { kind: "grass", x: 0, y: 2.4, z: -26.2, w: 6.0, d: 6.0, h: 1.2 },
      // Final Narrow Rope-Wood Bridge (Guarded by 1 Swinging Hammer!)
      { kind: "wood", x: 0, y: 2.4, z: -34.2, w: 2.0, d: 10.4, h: 0.5 },
      // Finish Terrace
      { kind: "grass", x: 0, y: 2.4, z: -42.5, w: 6.8, d: 6.6, h: 1.2 },
    ],
    boosts: [
      { x: 0, y: 5.25, z: -13.5, w: 2.8, d: 3.2, fx: 0, fz: -24 },
      { x: 4.8, y: 4.65, z: -16.2, w: 1.8, d: 2.4, fx: 0, fz: -26 },
    ],
    mushrooms: [],
    gears: [],
    hammers: [
      { x: 0, y: 5.9, z: -34.2, len: 3.3, speed: 2.1, amp: 1.05, phase: 0, axis: "z" },
    ],
    checkpoints: [
      { x: 0, y: 2.4, z: -26.2 },
    ],
    stars: [
      { x: 0, y: 7.4, z: -5.5 },
      { x: -10.5, y: 6.0, z: -19.8 },
      { x: 4.8, y: 5.4, z: -19.6 },
      { x: 0, y: 3.2, z: -32.2 },
      { x: 0, y: 3.2, z: -36.2 },
    ],
    finish: { x: 0, y: 2.4, z: -43.5 },
  },
  {
    id: "clockwork",
    name: "02 · 钟表魔法工坊",
    subtitle: "黄金齿轮转盘 · 雕花大摆锤 · 弹跳红蘑菇",
    skyTop: 0xff8c5a,
    skyBottom: 0xffe4b5,
    fogColor: 0xffdcb3,
    sunColor: 0xffe09e,
    bonusTime: 36,
    start: { x: 0, y: 8.6, z: 0 },
    deathY: -9,
    platforms: [
      { kind: "brass", x: 0, y: 8, z: 0, w: 6.0, d: 6.0, h: 1.2 },
      // Narrow Timber Beam with 2 Hammers!
      { kind: "wood", x: 0, y: 8, z: -7.5, w: 2.1, d: 9.4, h: 0.55 },
      // Mid Landing Pad with Mushroom Bounce!
      { kind: "brass", x: 0, y: 8, z: -14.8, w: 5.6, d: 5.6, h: 1.2 },
      // Elevated Post-Jump Platform (reachable via Mushroom Bounce!)
      { kind: "brass", x: 0, y: 9.2, z: -23.4, w: 5.6, d: 5.4, h: 1.2 },
      // Steep Wooden Chute down to Gears
      { kind: "ramp", x: 0, y: 7.1, z: -29.8, w: 3.6, d: 7.6, h: 0.75, yStart: 9.2, yEnd: 5.0, dir: "-z" },
      // Checkpoint Platform before Dual Gears
      { kind: "brass", x: 0, y: 5.0, z: -35.8, w: 5.4, d: 5.0, h: 1.2 },
      // Final Sprint Bridge + Finish
      { kind: "wood", x: 0, y: 5.0, z: -53.2, w: 2.2, d: 7.2, h: 0.55 },
      { kind: "brass", x: 0, y: 5.0, z: -59.8, w: 6.6, d: 6.4, h: 1.2 },
    ],
    gears: [
      { x: -1.8, y: 5.0, z: -41.4, r: 4.1, h: 0.9, omega: 0.95 },
      { x: 1.8, y: 5.0, z: -47.0, r: 4.1, h: 0.9, omega: -1.05 },
    ],
    mushrooms: [
      { x: 0, y: 8.15, z: -16.0, r: 1.35, vy: 11.8, vz: -9.5 },
    ],
    boosts: [
      { x: 0, y: 5.05, z: -53.2, w: 2.0, d: 3.2, fx: 0, fz: -24 },
    ],
    hammers: [
      { x: 0, y: 11.4, z: -6.0, len: 3.2, speed: 2.4, amp: 1.08, phase: 0, axis: "z" },
      { x: 0, y: 11.4, z: -9.6, len: 3.2, speed: 2.4, amp: 1.08, phase: Math.PI, axis: "z" },
      { x: 0, y: 8.4, z: -53.2, len: 3.2, speed: 2.8, amp: 1.05, phase: 1.2, axis: "z" },
    ],
    checkpoints: [
      { x: 0, y: 9.2, z: -23.4 },
      { x: 0, y: 5.0, z: -35.8 },
    ],
    stars: [
      { x: 0, y: 8.8, z: -7.8 },
      { x: 0, y: 12.2, z: -19.5 },
      { x: -1.8, y: 5.8, z: -41.4 },
      { x: 1.8, y: 5.8, z: -47.0 },
      { x: 0, y: 5.8, z: -53.2 },
    ],
    finish: { x: 0, y: 5.0, z: -60.8 },
  },
  {
    id: "aurora",
    name: "03 · 极光水晶高塔",
    subtitle: "低摩擦冰晶滑道 · 霓虹玻璃窄路 · 终极挑战",
    skyTop: 0x0d1538,
    skyBottom: 0x3b1d66,
    fogColor: 0x24174a,
    sunColor: 0xb8f2ff,
    bonusTime: 40,
    start: { x: 0, y: 10.6, z: 0 },
    deathY: -8,
    platforms: [
      { kind: "crystal", x: 0, y: 10, z: 0, w: 6.0, d: 6.0, h: 1.1 },
      // Steep Slippery Ice Crystal Downhill!
      { kind: "ice_ramp", x: 0, y: 8.0, z: -7.6, w: 3.8, d: 9.4, h: 0.75, yStart: 10, yEnd: 6.0, dir: "-z" },
      // Slippery Ice Hairpin Turn!
      { kind: "ice", x: 0, y: 6.0, z: -15.4, w: 6.8, d: 6.4, h: 1.0 },
      { kind: "ice", x: 6.6, y: 6.0, z: -15.4, w: 6.6, d: 3.2, h: 0.8 },
      { kind: "ice", x: 12.0, y: 6.0, z: -15.4, w: 5.6, d: 5.8, h: 1.0 },
      // Neon-Magenta Glass Razor-Thin Walkway!
      { kind: "neon", x: 12.0, y: 6.0, z: -24.2, w: 1.75, d: 12.2, h: 0.45 },
      // Checkpoint Crystal Island
      { kind: "crystal", x: 12.0, y: 6.0, z: -33.2, w: 5.8, d: 5.8, h: 1.1 },
      // Drop-down Risky Shortcut Platform!
      { kind: "neon", x: 6.2, y: 4.5, z: -38.8, w: 2.0, d: 10.6, h: 0.45, secret: true },
      // Main Safe Route Left -> Forward
      { kind: "ice", x: 5.2, y: 6.0, z: -33.2, w: 8.2, d: 2.6, h: 0.65 },
      { kind: "crystal", x: 0, y: 6.0, z: -33.2, w: 5.2, d: 5.2, h: 1.1 },
      { kind: "neon", x: 0, y: 4.5, z: -41.4, w: 1.85, d: 11.4, h: 0.45 },
      // Grand Aurora Portal Finish Island
      { kind: "crystal", x: 0, y: 4.5, z: -50.2, w: 7.4, d: 7.2, h: 1.2 },
    ],
    gears: [
      { x: 0, y: 4.5, z: -41.4, r: 3.2, h: 0.7, omega: 1.35 },
    ],
    mushrooms: [
      { x: 12.0, y: 6.15, z: -16.8, r: 1.25, vy: 10.2, vz: -7.0 },
    ],
    boosts: [
      { x: 12.0, y: 6.05, z: -22.2, w: 1.6, d: 3.4, fx: 0, fz: -26 },
      { x: 6.2, y: 4.55, z: -38.8, w: 1.8, d: 3.2, fx: -12, fz: -24 },
    ],
    hammers: [
      { x: 12.0, y: 9.4, z: -26.2, len: 3.2, speed: 2.7, amp: 1.05, phase: 0.5, axis: "z" },
      { x: 0, y: 7.9, z: -44.2, len: 3.2, speed: 3.0, amp: 1.1, phase: 2.0, axis: "z" },
    ],
    checkpoints: [
      { x: 12.0, y: 6.0, z: -33.2 },
    ],
    stars: [
      { x: 0, y: 8.6, z: -7.6 },
      { x: 6.6, y: 6.8, z: -15.4 },
      { x: 12.0, y: 6.8, z: -24.2 },
      { x: 6.2, y: 5.3, z: -38.8 },
      { x: 0, y: 5.3, z: -41.4 },
    ],
    finish: { x: 0, y: 4.5, z: -51.4 },
  },
];

export const DEFAULT_SAVE = {
  selectedCat: "witch_black",
  unlockedCats: ["witch_black"],
  clearedTracks: [],
  totalStars: 0,
  bestTourneyTime: 0,
  bestTrackTimes: {},
  mouseSens: 1.0,
};
