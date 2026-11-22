// Roomba Raid v0.4.0 — Silhouette Collection (12 Variants + Hidden Treasure-Exchange Models),
// Graphical 3-Tier Branching Talent Tree (20 Minutes Till Dawn style), 6-Enemy Codex & Comedy Death Quips!

export const SKINS = [
  {
    id: "classic",
    name: "经典暴富号",
    sizeClass: "标准",
    scale: 1.0,
    price: 0,
    corePrice: 0,
    filter: "none",
    topper: "lucky",
    skillName: "过载双雷环",
    desc: "过载释放双重雷暴冲击波",
    bonus: { speed: 1, hp: 1, loot: 1 },
  },
  {
    id: "mini_mint",
    name: "薄荷迷你豆",
    sizeClass: "迷你",
    scale: 0.84,
    price: 18000,
    corePrice: 0,
    filter: "hue-rotate(95deg) saturate(1.5) brightness(1.06)",
    topper: "antenna",
    skillName: "极速钻缝",
    desc: "小巧体型移速 +16%，钻桌底更灵巧",
    bonus: { speed: 1.16, hp: 0.88, loot: 1.05 },
  },
  {
    id: "cyber",
    name: "赛博霓虹壳",
    sizeClass: "标准",
    scale: 1.0,
    price: 38000,
    corePrice: 0,
    filter: "hue-rotate(155deg) saturate(1.9) brightness(1.06)",
    topper: "visor",
    skillName: "霓虹闪现",
    desc: "过载向前闪现 140px 并清屏",
    bonus: { speed: 1.12, hp: 1, loot: 1.05 },
  },
  {
    id: "tank_steel",
    name: "重装坦克号",
    sizeClass: "重装",
    scale: 1.16,
    price: 52000,
    corePrice: 0,
    filter: "saturate(0.3) contrast(1.25) brightness(0.88)",
    topper: "shield",
    skillName: "铁壁撞击",
    desc: "巨大重装底盘！生命 +45% · 抗击退",
    bonus: { speed: 0.94, hp: 1.45, loot: 1.05 },
  },
  {
    id: "sakura",
    name: "樱花甜心机",
    sizeClass: "迷你",
    scale: 0.88,
    price: 60000,
    corePrice: 0,
    filter: "hue-rotate(295deg) saturate(1.4) brightness(1.08)",
    topper: "bow",
    skillName: "花瓣旋风",
    desc: "吸尘清扫范围 +25% · 移速 +10%",
    bonus: { speed: 1.1, hp: 0.95, loot: 1.12 },
  },
  {
    id: "cat",
    name: "招财猫耳号",
    sizeClass: "标准",
    scale: 1.02,
    price: 68000,
    corePrice: 1,
    filter: "hue-rotate(285deg) saturate(1.55)",
    topper: "cat",
    skillName: "招财吸宝光环",
    desc: "大金估值 +18%，自带超大吸宝磁力",
    bonus: { speed: 1.05, hp: 1.05, loot: 1.18 },
  },
  {
    id: "lava",
    name: "熔岩暴走号",
    sizeClass: "重装",
    scale: 1.12,
    price: 88000,
    corePrice: 1,
    filter: "sepia(0.8) hue-rotate(-38deg) saturate(2.8)",
    topper: "horns",
    skillName: "灼热冲击",
    desc: "血量 +25% · 武器暴击伤害飙升",
    bonus: { speed: 1.04, hp: 1.25, loot: 1.15 },
  },
  {
    id: "gold",
    name: "24K 土豪金皇冠",
    sizeClass: "标准",
    scale: 1.06,
    price: 120000,
    corePrice: 2,
    filter: "sepia(0.95) saturate(3.2) hue-rotate(-8deg) brightness(1.08)",
    topper: "gold",
    skillName: "撒币震爆弹幕",
    desc: "过载狂撒金币！血量 +25% · 估值 +22%",
    bonus: { speed: 1.06, hp: 1.25, loot: 1.22 },
  },
  // === 3 HIDDEN MODELS (Unlocked ONLY by trading rare extracted treasures!) ===
  {
    id: "hidden_catgod",
    name: "隐藏款 · 猫罐至尊",
    sizeClass: "隐藏",
    scale: 1.08,
    price: 0,
    corePrice: 0,
    hiddenLootReq: { lootId: "catcan", count: 2, label: "集齐 2 个【24K纯金猫罐头】直兑" },
    filter: "sepia(0.75) hue-rotate(-18deg) saturate(2.6) brightness(1.12)",
    topper: "cat_crown",
    skillName: "猫神降临",
    desc: "大金估值 +30% · 全图猫掌伤害减半",
    bonus: { speed: 1.1, hp: 1.2, loot: 1.3 },
  },
  {
    id: "hidden_duck",
    name: "隐藏款 · 黄金鸭王",
    sizeClass: "隐藏",
    scale: 1.05,
    price: 0,
    corePrice: 0,
    hiddenLootReq: { lootId: "duck", count: 1, label: "摸出 1 个【黄金橡胶鸭奖杯】直兑" },
    filter: "sepia(1) hue-rotate(8deg) saturate(3.5) brightness(1.12)",
    topper: "duck",
    skillName: "鸭鸭涡轮波",
    desc: "移速 +18% · 过载冷却大幅加快",
    bonus: { speed: 1.18, hp: 1.15, loot: 1.25 },
  },
  {
    id: "hidden_diamond",
    name: "隐藏款 · 钻石女皇",
    sizeClass: "隐藏",
    scale: 1.1,
    price: 0,
    corePrice: 0,
    hiddenLootReq: { lootId: "ring", count: 1, label: "摸出 1 枚【失落克拉钻戒】直兑" },
    filter: "hue-rotate(185deg) saturate(2.2) brightness(1.22)",
    topper: "diamond",
    skillName: "璀璨星爆",
    desc: "全属性巅峰！估值 +35% · 血量 +35%",
    bonus: { speed: 1.14, hp: 1.35, loot: 1.35 },
  },
];

// Graphical 3-Tier Branching Talent Tree (20 Minutes Till Dawn style — pick 1 active per tier!)
export const TALENT_TREE = [
  {
    tier: 1,
    title: "T1 · 底盘动力核心（任选1项激活）",
    nodes: [
      { id: "t1_suck", icon: "🌪️", name: "暴风吸口", stat: "清扫/吸力 +28%", price: 8000, core: 0 },
      { id: "t1_drift", icon: "🏎️", name: "漂移涡轮", stat: "移速 +14%", price: 8000, core: 0 },
      { id: "t1_armor", icon: "🛡️", name: "防撞钢圈", stat: "生命 +35", price: 8000, core: 0 },
    ],
  },
  {
    tier: 2,
    title: "T2 · 武器超频芯片（任选1项激活）",
    nodes: [
      { id: "t2_crit", icon: "💥", name: "暴击过载", stat: "暴击率 +18%", price: 24000, core: 0 },
      { id: "t2_haste", icon: "⚡", name: "极速射频", stat: "攻速 +18%", price: 24000, core: 0 },
      { id: "t2_poop", icon: "✨", name: "净污光环", stat: "踩粑粑不减速", price: 24000, core: 0 },
    ],
  },
  {
    tier: 3,
    title: "T3 · 传奇摸金协议（稀缺金核解锁）",
    nodes: [
      { id: "t3_greed", icon: "💎", name: "点石成金", stat: "大金估值 +25%", price: 45000, core: 1 },
      { id: "t3_charge", icon: "🔋", name: "永动电芯", stat: "过载充能 +45%", price: 45000, core: 1 },
      { id: "t3_start", icon: "🎁", name: "开局激光", stat: "进场自带激光笔", price: 45000, core: 1 },
    ],
  },
];

export const ENEMY_CODEX = [
  { id: "dust", sprite: "dust", name: "灰尘毛球怪", role: "近战怪潮", desc: "沙发底批量繁殖，成群围堵但脆皮解压。" },
  { id: "sock", sprite: "sock", name: "生化臭袜子", role: "远程毒泡", desc: "中距离喷射绿色毒气泡，可躲家具掩体挡住！" },
  { id: "lego", sprite: "lego", name: "带刺乐高雷", role: "重甲地雷", desc: "移动缓慢但血厚刺痛，别傻傻贴脸硬撞。" },
  { id: "pooper", sprite: "poop", name: "捣蛋撒屎怪", role: "陷阱制造者", desc: "四处乱窜拉下搞笑粑粑陷阱！远程打爆可爆隐藏金币！" },
  { id: "slime", sprite: "dust", name: "打翻奶茶怪", role: "减速Debuff", desc: "吐出黏糊糊珍珠奶茶滩，踩上去移速与攻速双衰减！" },
  { id: "mop", sprite: "mop", name: "旋转拖把王", role: "关卡Boss", desc: "360°甩水弹幕+红线冲锋+召小弟！引撞家具可击晕2.2秒！" },
];

export const DEATH_QUIPS = {
  catpaw: "被猫主子一巴掌拍成二维扫地饼！",
  mop: "惨遭旋转拖把老祖物理超度！",
  poop: "在客厅画出了一幅抽象派棕色现代画…",
  bullet: "没躲在沙发后面，被弹幕洗了个冷水澡！",
  slime: "陷进隔夜珍珠奶茶里彻底拔不出来了！",
  default: "贪心多吸了三秒，电量炸穿当场躺平！",
};

export const WEAPONS = {
  swatter: { id: "swatter", name: "高压电蚊拍", tag: "近身横扫", color: "#38f3ff", icon: "⚡", desc: "释放高压青蓝电弧横扫怪潮并击退，3级进化360°雷环", maxLv: 5 },
  laser: { id: "laser", name: "红外激光笔", tag: "锁敌暴击", color: "#ff4477", icon: "🔴", desc: "自动锁敌发射高暴击激光束，满级5道齐射", maxLv: 5 },
  spatula: { id: "spatula", name: "胶带黄油刀铲", tag: "环绕斩击", color: "#ffd859", icon: "🔪", desc: "高速环绕机身旋转切割靠近的怪潮", maxLv: 5 },
  hairdryer: { id: "hairdryer", name: "涡轮吹风机", tag: "击退风暴", color: "#ff9848", icon: "💨", desc: "朝前方轰出热风冲击波，击飞怪群开路", maxLv: 5 },
  tesla: { id: "tesla", name: "暴走插线板", tag: "连锁闪电", color: "#9f84ff", icon: "🔌", desc: "召唤高电压闪电在怪群间跳跃传导", maxLv: 5 },
};

export const PASSIVES = {
  magnet: { id: "magnet", name: "涡轮强吸口", tag: "吸尘范围", color: "#57f287", icon: "🧲", desc: "吸尘与大金拾取范围 +35%" },
  turbo: { id: "turbo", name: "静音越野轮", tag: "冲刺移速", color: "#4de1ff", icon: "🛞", desc: "移动速度 +14%，钻桌躲猫掌更稳" },
  battery: { id: "battery", name: "快充锂电芯", tag: "续航回血", color: "#ff7eb6", icon: "🔋", desc: "最大生命 +25 并立刻恢复 40 点电量" },
};

export const LOOT_ITEMS = [
  { id: "earbud", name: "失踪半年的左耳耳机", short: "单只耳机", value: 8800, rarity: "blue", color: "#4de1ff", weight: 30, set: "sofa" },
  { id: "remote", name: "沙发缝电视遥控器", short: "电视遥控", value: 12000, rarity: "blue", color: "#6b9eff", weight: 26, set: "sofa" },
  { id: "cash", name: "主人藏的私房钱卷", short: "私房钱卷", value: 18800, rarity: "purple", color: "#c86bff", weight: 20, set: "rich" },
  { id: "catcan", name: "24K 纯金猫罐头", short: "纯金猫罐", value: 28000, rarity: "gold", color: "#ffd54a", weight: 14, set: "sofa" },
  { id: "duck", name: "黄金橡胶鸭奖杯", short: "黄金鸭鸭", value: 42000, rarity: "gold", color: "#ffae33", weight: 7, set: "rich" },
  { id: "ring", name: "沙发底失落克拉钻戒", short: "克拉钻戒", value: 68000, rarity: "red", color: "#ff4268", weight: 3, set: "rich" },
];

export const MUSEUM_SETS = [
  { id: "sofa", name: "沙发缝失踪三件套", items: ["earbud", "remote", "catcan"], buffText: "永久全武器攻速 +12%" },
  { id: "rich", name: "客厅暴富三件套", items: ["cash", "duck", "ring"], buffText: "永久大金估值 +15%" },
];

export const BOOSTERS = [
  { id: "radar", name: "大金探测器", price: 6000, desc: "下局开场额外刷新 1 个超级金箱", icon: "📡" },
  { id: "lv3", name: "满电超频芯片", price: 8000, desc: "下局开场立刻触发 1 次三选一升级", icon: "⚡" },
  { id: "highrisk", name: "狂暴客厅加注券", price: 12000, desc: "下局怪血 +35%，但全场大金价值 ×1.8！", icon: "🔥" },
];

export const SAFE_BOX_PRICES = [0, 0, 35000, 95000];

export const DEFAULT_SAVE = {
  coins: 0,
  goldCores: 0,
  totalExtracted: 0,
  bestRunValue: 0,
  extractStreak: 0,
  runsPlayed: 0,
  safeBoxSlots: 1,
  equippedSkin: "classic",
  skinsOwned: ["classic"],
  talentsUnlocked: [],
  talentsEquipped: { 1: null, 2: null, 3: null },
  museum: {},
  boosters: {},
  roomsUnlocked: ["living"],
  playerName: "扫地特工",
};
