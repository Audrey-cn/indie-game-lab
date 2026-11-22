// Game Data & Configuration for Roomba Raid (半夜扫地机：客厅摸金)

export const ARENA = {
  width: 1180,
  height: 1580,
};

export const SKINS = [
  {
    id: "classic",
    name: "经典白 · 暴富符",
    enName: "Classic Lucky",
    price: 0,
    corePrice: 0,
    skillName: "过载双雷环",
    desc: "专属技【过载双雷环】：过载清屏释放双重雷暴波",
    body: "#eef4fb",
    rim: "#b4c5dc",
    eye: "#3af2ff",
    bonus: { speed: 1, hp: 1, loot: 1 },
  },
  {
    id: "cyber",
    name: "赛博霓虹透明壳",
    enName: "Cyber Neon",
    price: 45000,
    corePrice: 0,
    skillName: "霓虹闪现",
    desc: "专属技【霓虹闪现】：移速 +12%，过载冲刺留下高压雷痕",
    body: "#173c58",
    rim: "#36f6ff",
    eye: "#7dfdff",
    bonus: { speed: 1.12, hp: 1, loot: 1 },
  },
  {
    id: "cat",
    name: "招财粉嫩猫耳",
    enName: "Cat-Ear Pink",
    price: 68000,
    corePrice: 1,
    skillName: "招财吸宝光环",
    desc: "专属技【招财光环】：大金估值 +18%，自带超大吸宝磁力",
    body: "#ff9ed0",
    rim: "#ff5ca8",
    eye: "#fff3a6",
    bonus: { speed: 1.04, hp: 1, loot: 1.18 },
  },
  {
    id: "gold",
    name: "24K 土豪金皇冠",
    enName: "24K Gold Crown",
    price: 120000,
    corePrice: 2,
    skillName: "撒币震爆弹幕",
    desc: "专属技【撒币震爆】：血量 +25% · 过载爆发向外狂撒金币弹幕",
    body: "#ffd64f",
    rim: "#d98200",
    eye: "#fff9cf",
    bonus: { speed: 1.05, hp: 1.25, loot: 1.2 },
  },
];

export const WEAPONS = {
  swatter: {
    id: "swatter",
    name: "高压电蚊拍",
    tag: "近身横扫",
    color: "#38f3ff",
    icon: "⚡",
    desc: "360° 释放高压青蓝电弧横扫周围怪潮并击退",
    maxLv: 5,
  },
  laser: {
    id: "laser",
    name: "红外激光笔",
    tag: "锁敌暴击",
    color: "#ff4477",
    icon: "🔴",
    desc: "自动锁定最近目标发射高暴击穿透激光束",
    maxLv: 5,
  },
  spatula: {
    id: "spatula",
    name: "胶带黄油刀铲",
    tag: "环绕斩击",
    color: "#ffd859",
    icon: "🔪",
    desc: "高速环绕机身旋转切割靠近的毛球与臭袜子",
    maxLv: 5,
  },
  hairdryer: {
    id: "hairdryer",
    name: "涡轮吹风机",
    tag: "击退风暴",
    color: "#ff9848",
    icon: "💨",
    desc: "朝移动前方轰出热风冲击波，击飞怪群开路",
    maxLv: 5,
  },
  tesla: {
    id: "tesla",
    name: "暴走插线板",
    tag: "连锁闪电",
    color: "#9f84ff",
    icon: "🔌",
    desc: "召唤高电压闪电在多个怪物之间跳跃传导",
    maxLv: 5,
  },
};

export const PASSIVES = {
  magnet: {
    id: "magnet",
    name: "涡轮强吸口",
    tag: "吸尘范围",
    color: "#57f287",
    icon: "🧲",
    desc: "吸尘与大金拾取范围 +35%，经验秒吸",
  },
  turbo: {
    id: "turbo",
    name: "静音越野轮",
    tag: "冲刺移速",
    color: "#4de1ff",
    icon: "🛞",
    desc: "移动速度 +14%，撤离跑路更丝滑",
  },
  battery: {
    id: "battery",
    name: "快充锂电芯",
    tag: "续航回血",
    color: "#ff7eb6",
    icon: "🔋",
    desc: "最大生命 +25 并立刻恢复 35 点电量",
  },
};

export const LOOT_ITEMS = [
  {
    id: "earbud",
    name: "失踪半年的左耳耳机",
    short: "单只耳机",
    value: 8800,
    rarity: "blue",
    color: "#4de1ff",
    weight: 30,
    set: "sofa",
  },
  {
    id: "remote",
    name: "沙发缝电视遥控器",
    short: "电视遥控",
    value: 12000,
    rarity: "blue",
    color: "#6b9eff",
    weight: 26,
    set: "sofa",
  },
  {
    id: "cash",
    name: "主人藏的私房钱卷",
    short: "私房钱卷",
    value: 18800,
    rarity: "purple",
    color: "#c86bff",
    weight: 20,
    set: "rich",
  },
  {
    id: "catcan",
    name: "24K 纯金猫罐头",
    short: "纯金猫罐",
    value: 28000,
    rarity: "gold",
    color: "#ffd54a",
    weight: 14,
    set: "sofa",
  },
  {
    id: "duck",
    name: "黄金橡胶鸭奖杯",
    short: "黄金鸭鸭",
    value: 42000,
    rarity: "gold",
    color: "#ffae33",
    weight: 7,
    set: "rich",
  },
  {
    id: "ring",
    name: "沙发底失落克拉钻戒",
    short: "克拉钻戒",
    value: 68000,
    rarity: "red",
    color: "#ff4268",
    weight: 3,
    set: "rich",
  },
];

export const MUSEUM_SETS = [
  {
    id: "sofa",
    name: "沙发缝失踪三件套",
    items: ["earbud", "remote", "catcan"],
    buffText: "永久全武器攻速 +12%",
  },
  {
    id: "rich",
    name: "客厅暴富三件套",
    items: ["cash", "duck", "ring"],
    buffText: "永久大金估值 +15%",
  },
];

export const BOOSTERS = [
  {
    id: "radar",
    name: "大金探测器",
    price: 6000,
    desc: "下局开场额外刷新 2 个高价值大金箱",
    icon: "📡",
  },
  {
    id: "lv3",
    name: "满电超频芯片",
    price: 8000,
    desc: "下局开场立刻触发 1 次三选一升级",
    icon: "⚡",
  },
  {
    id: "highrisk",
    name: "狂暴客厅加注券",
    price: 12000,
    desc: "下局怪血 +35%，但全场大金价值 ×1.8！",
    icon: "🔥",
  },
];

export const SAFE_BOX_PRICES = [0, 0, 35000, 95000]; // 1 -> 2 -> 3 slots max

export const DEFAULT_SAVE = {
  coins: 0,
  goldCores: 0, // Scarce premium currency dropped by Bosses & 100% Cleanliness!
  totalExtracted: 0,
  bestRunValue: 0,
  extractStreak: 0,
  runsPlayed: 0,
  safeBoxSlots: 1,
  equippedSkin: "classic",
  skinsOwned: ["classic"],
  museum: {}, // lootId -> count
  boosters: {}, // boosterId -> boolean
  roomsUnlocked: ["living"],
  playerName: "扫地特工",
};
