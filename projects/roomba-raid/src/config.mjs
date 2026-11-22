// Roomba Raid v0.5.5 — 3 Procedural Maps, 3x9 5-Level Style Talent Trees,
// 8 Free-Mix Anthropomorphic Accessories, 11 Silhouette Skins & 6-Enemy Codex!

export const MAPS = [
  {
    id: "living",
    name: "01·午夜大客厅",
    tag: "入门豪宅 · 随机户型",
    bgm: "living",
    lootMult: 1.0,
    hpMult: 1.0,
    floorStyle: "wood",
    unlockText: "默认解锁",
    secretName: "主卧床底猫窝金库",
    desc: "木地板客厅+餐厨+主卧，波次循序渐进，适合上手摸金！",
  },
  {
    id: "kitchen",
    name: "02·深夜厨房",
    tag: "大金 ×1.35 · 水渍漂移",
    bgm: "kitchen",
    lootMult: 1.35,
    hpMult: 1.25,
    floorStyle: "tile",
    unlockReq: { type: "stars", count: 1, label: "任意地图达成 ★ (35%清扫) 解锁" },
    secretName: "冰箱后半夜冻干暗格",
    desc: "大理石厨岛与湿滑瓷砖，主打奶茶减速怪与撒屎怪潮！",
  },
  {
    id: "study",
    name: "03·星空书房",
    tag: "大金 ×1.55 · 强风暗格",
    bgm: "bedroom",
    lootMult: 1.55,
    hpMult: 1.4,
    floorStyle: "parquet",
    unlockReq: { type: "kills", count: 120, label: "累计清理 120 只客厅怪潮解锁" },
    secretName: "红木书桌底私房钱密室",
    desc: "人字拼木地板+密集书桌暗格与强力风道，考验绕柱走位！",
  },
  {
    id: "cat_palace",
    name: "04·猫主子阁楼",
    tag: "隐藏图 · 大金 ×1.85",
    bgm: "bedroom",
    lootMult: 1.85,
    hpMult: 1.6,
    floorStyle: "velvet",
    unlockReq: { type: "cat_secret", label: "佩戴【猫耳/猫系机身】或收集 2 个金猫罐解锁" },
    secretName: "阁楼黄金猫神祭坛",
    desc: "隐藏地图！暖金丝绒阁楼 + 高频猫掌，满地顶级大金！",
  },
  {
    id: "rooftop",
    name: "05·豪宅天台",
    tag: "终极图 · 大金 ×2.3",
    bgm: "kitchen",
    lootMult: 2.3,
    hpMult: 1.9,
    floorStyle: "stone",
    unlockReq: { type: "cores", count: 2, label: "累计获得 2 颗稀缺金核 💎 或达成 ★★★ 解锁" },
    secretName: "天台露天观星保险箱",
    desc: "终极高难石板天台！双倍狂风+精英波次，挑战极限身价！",
  },
];

// Structured Vampire-Survivors-style Themed Wave Scripts per Map!
// Each wave has a clear dominant theme monster, progressive stat scaling & clear announcement.
export const MAP_WAVE_SCRIPTS = {
  living: [
    { name: "灰尘毛球先遣队", pool: ["dust"], rate: 0.78, hp: 1.0, spd: 1.0 },
    { name: "生化臭袜子远程奇袭", pool: ["sock", "sock", "sock", "dust"], rate: 0.65, hp: 1.38, spd: 1.08 },
    { name: "乐高重甲与撒屎怪阵", pool: ["lego", "lego", "pooper", "dust"], rate: 0.56, hp: 1.85, spd: 1.15 },
    { name: "全屋狂暴怪潮 · 拖把王降临", pool: ["sock", "lego", "slime", "pooper"], rate: 0.46, hp: 2.45, spd: 1.24, boss: true },
  ],
  kitchen: [
    { name: "打翻奶茶怪潮", pool: ["slime", "slime", "dust"], rate: 0.72, hp: 1.15, spd: 1.04 },
    { name: "撒屎捣蛋军团", pool: ["pooper", "pooper", "sock"], rate: 0.6, hp: 1.55, spd: 1.12 },
    { name: "奶茶+臭袜子双重封锁", pool: ["slime", "sock", "lego"], rate: 0.5, hp: 2.1, spd: 1.2 },
    { name: "厨房终极狂潮 · 拖把王降临", pool: ["slime", "pooper", "lego", "sock"], rate: 0.42, hp: 2.75, spd: 1.28, boss: true },
  ],
  study: [
    { name: "书房毛球与臭袜子", pool: ["dust", "sock", "sock"], rate: 0.68, hp: 1.25, spd: 1.08 },
    { name: "乐高地雷方阵", pool: ["lego", "lego", "lego", "sock"], rate: 0.58, hp: 1.75, spd: 1.15 },
    { name: "远程弹幕+奶茶封路", pool: ["sock", "slime", "pooper"], rate: 0.48, hp: 2.35, spd: 1.24 },
    { name: "书房大暴走 · 拖把王降临", pool: ["lego", "sock", "slime", "pooper"], rate: 0.4, hp: 3.1, spd: 1.32, boss: true },
  ],
  cat_palace: [
    { name: "阁楼狂暴毛球群", pool: ["dust", "dust", "pooper"], rate: 0.62, hp: 1.4, spd: 1.16 },
    { name: "猫主子近卫臭袜子", pool: ["sock", "sock", "slime"], rate: 0.52, hp: 1.95, spd: 1.22 },
    { name: "重甲乐高与撒屎精英", pool: ["lego", "pooper", "slime"], rate: 0.45, hp: 2.65, spd: 1.28 },
    { name: "猫神殿总攻 · 拖把王降临", pool: ["lego", "sock", "slime", "pooper"], rate: 0.36, hp: 3.4, spd: 1.36, boss: true },
  ],
  rooftop: [
    { name: "天台强风臭袜子队", pool: ["sock", "sock", "dust"], rate: 0.58, hp: 1.65, spd: 1.18 },
    { name: "重甲乐高与奶茶怪潮", pool: ["lego", "slime", "pooper"], rate: 0.48, hp: 2.3, spd: 1.26 },
    { name: "精英全兵种高压围剿", pool: ["lego", "sock", "slime", "pooper"], rate: 0.4, hp: 3.1, spd: 1.34 },
    { name: "终极天台决战 · 双倍高压", pool: ["lego", "sock", "slime", "pooper"], rate: 0.34, hp: 4.0, spd: 1.42, boss: true },
  ],
};

// Independent Anthropomorphic Cosmetics (Free-mix on top of any of the 11 Roomba skins!)
export const ACCESSORIES = [
  { id: "none", name: "无挂件", icon: "⭕", unlockText: "默认", free: true },
  { id: "ahoge", name: "俏皮呆毛", icon: "🌱", unlockText: "默认赠送", free: true },
  { id: "bow", name: "甜心蝴蝶结", icon: "🎀", unlockText: "达成 1 星清扫解锁", req: { type: "star", stars: 1 } },
  { id: "sunglasses", name: "像素大佬墨镜", icon: "🕶️", unlockText: "撬开神秘冰箱/电视柜掉落 或 ¥25k", price: 25000, core: 0 },
  { id: "catears", name: "软萌招财猫耳", icon: "🐱", unlockText: "达成 2 星清扫解锁（可解锁隐藏阁楼！）", req: { type: "star", stars: 2 } },
  { id: "horns", name: "小恶魔犄角", icon: "😈", unlockText: "稀缺金核 💎1 兑换", price: 15000, core: 1 },
  { id: "halo", name: "洁癖天使光环", icon: "😇", unlockText: "达成 100% 三星完美洁癖解锁", req: { type: "star", stars: 3 } },
  { id: "crown", name: "24K 迷你皇冠", icon: "👑", unlockText: "珍品直兑：摸出 1 枚【克拉钻戒】", req: { type: "loot", lootId: "ring", count: 1 } },
];

// Exponential 5-Level Talent Upgrade Costs (LV 1 -> 5)
export const TALENT_COSTS = [
  { coins: 8000, core: 0 },
  { coins: 22000, core: 0 },
  { coins: 55000, core: 0 },
  { coins: 120000, core: 1 },
  { coins: 240000, core: 2 },
];

// 3 Full Style Talent Trees (3 Styles x 3 Tiers x 3 Nodes = 27 Nodes, each upgradeable LV 1..5!)
export const TALENT_STYLES = [
  {
    id: "thunder",
    name: "⚡ 雷霆割草流",
    color: "#38f3ff",
    tiers: [
      {
        tier: 1,
        title: "T1 · 火力基础（同排任选 1 项激活）",
        nodes: [
          { id: "th_dmg", icon: "⚡", name: "高压增幅", stat: (lv) => `全伤害 +${lv * 10}%` },
          { id: "th_haste", icon: "🔥", name: "极速射频", stat: (lv) => `全攻速 +${lv * 7}%` },
          { id: "th_armor", icon: "🛡️", name: "防撞钢圈", stat: (lv) => `生命 +${lv * 22}` },
        ],
      },
      {
        tier: 2,
        title: "T2 · 暴击与范围（同排任选 1 项激活）",
        nodes: [
          { id: "th_crit", icon: "💥", name: "暴击过载", stat: (lv) => `暴击率 +${lv * 7}%` },
          { id: "th_range", icon: "📡", name: "广域电弧", stat: (lv) => `攻击范围 +${lv * 8}%` },
          { id: "th_vamp", icon: "❤️", name: "击杀修复", stat: (lv) => `每20杀回 ${lv * 4} 血` },
        ],
      },
      {
        tier: 3,
        title: "T3 · 雷王终极协议（同排任选 1 项激活）",
        nodes: [
          { id: "th_start", icon: "🔴", name: "开局激光", stat: (lv) => `开局 LV.${Math.min(5, lv)} 激光笔` },
          { id: "th_od", icon: "🔋", name: "永动电芯", stat: (lv) => `过载充能 +${lv * 18}%` },
          { id: "th_boss", icon: "👑", name: "斩王协议", stat: (lv) => `对Boss伤害 +${lv * 15}%` },
        ],
      },
    ],
  },
  {
    id: "greed",
    name: "💎 贪婪摸金流",
    color: "#ffd54a",
    tiers: [
      {
        tier: 1,
        title: "T1 · 寻宝雷达（同排任选 1 项激活）",
        nodes: [
          { id: "gr_val", icon: "💰", name: "点石成金", stat: (lv) => `大金估值 +${lv * 10}%` },
          { id: "gr_mag", icon: "🧲", name: "黑洞吸宝", stat: (lv) => `吸宝范围 +${lv * 16}%` },
          { id: "gr_spd", icon: "🏎️", name: "逃生涡轮", stat: (lv) => `移动速度 +${lv * 5}%` },
        ],
      },
      {
        tier: 2,
        title: "T2 · 撤离专家（同排任选 1 项激活）",
        nodes: [
          { id: "gr_dock", icon: "⚡", name: "极速充电", stat: (lv) => `撤离读条快 ${lv * 10}%` },
          { id: "gr_coin", icon: "🪙", name: "怪潮爆金", stat: (lv) => `怪物掉币 +${lv * 18}%` },
          { id: "gr_search", icon: "🔍", name: "神速掏缝", stat: (lv) => `开箱/掏宝快 ${lv * 12}%` },
        ],
      },
      {
        tier: 3,
        title: "T3 · 豪门特权（同排任选 1 项激活）",
        nodes: [
          { id: "gr_streak", icon: "🔥", name: "连撤暴利", stat: (lv) => `撤离额外 +${lv * 12}%` },
          { id: "gr_crate", icon: "📦", name: "自带金箱", stat: (lv) => `开局刷 ${Math.ceil(lv / 2)} 金箱` },
          { id: "gr_key", icon: "🗝️", name: "万能开锁", stat: (lv) => `开暗格额外 +${lv * 20}%` },
        ],
      },
    ],
  },
  {
    id: "clean",
    name: "🧹 洁癖召唤流",
    color: "#39ff88",
    tiers: [
      {
        tier: 1,
        title: "T1 · 强迫症清扫（同排任选 1 项激活）",
        nodes: [
          { id: "cl_wide", icon: "🧹", name: "宽幅滚刷", stat: (lv) => `清扫宽度 +${lv * 12}%` },
          { id: "cl_poop", icon: "✨", name: "净污光环", stat: (lv) => `粑粑减速 -${lv * 20}%` },
          { id: "cl_boot", icon: "🧊", name: "防滑越野轮", stat: (lv) => `水渍/风阻 -${lv * 18}%` },
        ],
      },
      {
        tier: 2,
        title: "T2 · 分身军团（同排任选 1 项激活）",
        nodes: [
          { id: "cl_clone", icon: "🤖", name: "多重分身", stat: (lv) => `分身 +${lv >= 3 ? 2 : 1} 台 · 时长+${lv * 2}s` },
          { id: "cl_cd", icon: "⏱️", name: "极速制造", stat: (lv) => `分身冷却 -${lv * 10}%` },
          { id: "cl_giant", icon: "🍄", name: "超级巨无霸", stat: (lv) => `变大时长 +${lv * 1.5}s` },
        ],
      },
      {
        tier: 3,
        title: "T3 · 洁净领域（同排任选 1 项激活）",
        nodes: [
          { id: "cl_charge", icon: "🌪️", name: "扫灰充能", stat: (lv) => `扫地充能 +${lv * 25}%` },
          { id: "cl_xp", icon: "⭐", name: "洁癖悟性", stat: (lv) => `经验获取 +${lv * 10}%` },
          { id: "cl_giant2", icon: "👑", name: "双倍变身", stat: (lv) => `开局变大次数 +${lv >= 4 ? 2 : 1}` },
        ],
      },
    ],
  },
];

export const SKINS = [
  { id: "classic", name: "经典暴富号", sizeClass: "标准", scale: 1.0, price: 0, corePrice: 0, filter: "none", topper: "lucky", skillName: "过载双雷环", desc: "过载释放双重雷暴冲击波", bonus: { speed: 1, hp: 1, loot: 1 } },
  { id: "mini_mint", name: "薄荷迷你豆", sizeClass: "迷你", scale: 0.84, price: 18000, corePrice: 0, filter: "hue-rotate(95deg) saturate(1.5) brightness(1.06)", topper: "antenna", skillName: "极速钻缝", desc: "小巧体型移速 +16%，钻桌底更灵巧", bonus: { speed: 1.16, hp: 0.88, loot: 1.05 } },
  { id: "cyber", name: "赛博霓虹壳", sizeClass: "标准", scale: 1.0, price: 38000, corePrice: 0, filter: "hue-rotate(155deg) saturate(1.9) brightness(1.06)", topper: "visor", skillName: "霓虹闪现", desc: "过载向前闪现 140px 并清屏", bonus: { speed: 1.12, hp: 1, loot: 1.05 } },
  { id: "tank_steel", name: "重装坦克号", sizeClass: "重装", scale: 1.16, price: 52000, corePrice: 0, filter: "saturate(0.3) contrast(1.25) brightness(0.88)", topper: "shield", skillName: "铁壁撞击", desc: "巨大重装底盘！生命 +45%", bonus: { speed: 0.94, hp: 1.45, loot: 1.05 } },
  { id: "sakura", name: "樱花甜心机", sizeClass: "迷你", scale: 0.88, price: 60000, corePrice: 0, filter: "hue-rotate(295deg) saturate(1.4) brightness(1.08)", topper: "bow", skillName: "花瓣旋风", desc: "清扫范围 +25% · 移速 +10%", bonus: { speed: 1.1, hp: 0.95, loot: 1.12 } },
  { id: "cat", name: "招财猫耳号", sizeClass: "标准", scale: 1.02, price: 68000, corePrice: 1, filter: "hue-rotate(285deg) saturate(1.55)", topper: "cat", skillName: "招财吸宝光环", desc: "大金估值 +18%，自带超大吸宝磁力", bonus: { speed: 1.05, hp: 1.05, loot: 1.18 } },
  { id: "lava", name: "熔岩暴走号", sizeClass: "重装", scale: 1.12, price: 88000, corePrice: 1, filter: "sepia(0.8) hue-rotate(-38deg) saturate(2.8)", topper: "horns", skillName: "灼热冲击", desc: "血量 +25% · 武器暴击伤害飙升", bonus: { speed: 1.04, hp: 1.25, loot: 1.15 } },
  { id: "gold", name: "24K 土豪金皇冠", sizeClass: "标准", scale: 1.06, price: 120000, corePrice: 2, filter: "sepia(0.95) saturate(3.2) hue-rotate(-8deg) brightness(1.08)", topper: "gold", skillName: "撒币震爆弹幕", desc: "过载狂撒金币！血量 +25% · 估值 +22%", bonus: { speed: 1.06, hp: 1.25, loot: 1.22 } },
  { id: "hidden_catgod", name: "隐藏款 · 猫罐至尊", sizeClass: "隐藏", scale: 1.08, price: 0, corePrice: 0, hiddenLootReq: { lootId: "catcan", count: 2, label: "集齐 2 个【24K纯金猫罐头】直兑" }, filter: "sepia(0.75) hue-rotate(-18deg) saturate(2.6) brightness(1.12)", topper: "cat_crown", skillName: "猫神降临", desc: "大金估值 +30% · 猫掌伤害减半", bonus: { speed: 1.1, hp: 1.2, loot: 1.3 } },
  { id: "hidden_duck", name: "隐藏款 · 黄金鸭王", sizeClass: "隐藏", scale: 1.05, price: 0, corePrice: 0, hiddenLootReq: { lootId: "duck", count: 1, label: "摸出 1 个【黄金橡胶鸭奖杯】直兑" }, filter: "sepia(1) hue-rotate(8deg) saturate(3.5) brightness(1.12)", topper: "duck", skillName: "鸭鸭涡轮波", desc: "移速 +18% · 过载冷却大幅加快", bonus: { speed: 1.18, hp: 1.15, loot: 1.25 } },
  { id: "hidden_diamond", name: "隐藏款 · 钻石女皇", sizeClass: "隐藏", scale: 1.1, price: 0, corePrice: 0, hiddenLootReq: { lootId: "ring", count: 1, label: "摸出 1 枚【失落克拉钻戒】直兑" }, filter: "hue-rotate(185deg) saturate(2.2) brightness(1.22)", topper: "diamond", skillName: "璀璨星爆", desc: "全属性巅峰！估值 +35% · 血量 +35%", bonus: { speed: 1.14, hp: 1.35, loot: 1.35 } },
];

export const ENEMY_CODEX = [
  { id: "dust", sprite: "dust", name: "灰尘毛球怪", role: "近战怪潮", desc: "沙发底批量繁殖，成群围堵但脆皮解压。" },
  { id: "sock", sprite: "sock", name: "生化臭袜子", role: "远程毒泡", desc: "中距离喷射绿色毒气泡，可躲家具掩体挡住！" },
  { id: "lego", sprite: "lego", name: "带刺乐高雷", role: "重甲地雷", desc: "移动缓慢但血厚刺痛，别傻傻贴脸硬撞。" },
  { id: "pooper", sprite: "poop", name: "捣蛋撒屎怪", role: "陷阱制造者", desc: "四处乱窜拉下定时粑粑陷阱！踩到减速涂脏地板！" },
  { id: "slime", sprite: "dust", name: "打翻奶茶怪", role: "减速Debuff", desc: "吐出黏糊糊珍珠奶茶滩，踩上去移速与攻速双衰减！" },
  { id: "mop", sprite: "mop", name: "旋转拖把王", role: "关卡Boss", desc: "360°甩水弹幕+红线冲锋+掉神秘钥匙！引撞家具击晕2.2秒！" },
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
  swatter: { id: "swatter", name: "高压电蚊拍", tag: "近身横扫", color: "#38f3ff", icon: "⚡", desc: "释放高压青蓝电弧横扫怪潮并击退，3级进化360°雷环", maxLv: 5, evoHint: "配🔌插线板→雷神磁暴阵" },
  laser: { id: "laser", name: "红外激光笔", tag: "锁敌暴击", color: "#ff4477", icon: "🔴", desc: "自动锁敌发射高暴击激光束，满级5道齐射", maxLv: 5, evoHint: "配🛞越野轮→棱镜轨道炮" },
  spatula: { id: "spatula", name: "胶带黄油刀铲", tag: "环绕斩击", color: "#ffd859", icon: "🔪", desc: "高速环绕机身旋转切割靠近的怪潮", maxLv: 5, evoHint: "配💨吹风机→焚天烈焰阵" },
  hairdryer: { id: "hairdryer", name: "涡轮吹风机", tag: "击退风暴", color: "#ff9848", icon: "💨", desc: "朝前方轰出热风冲击波，击飞怪群开路", maxLv: 5, evoHint: "配🔪黄油刀→焚天烈焰阵" },
  tesla: { id: "tesla", name: "暴走插线板", tag: "连锁闪电", color: "#9f84ff", icon: "🔌", desc: "召唤高电压闪电在怪群间跳跃传导", maxLv: 5, evoHint: "配⚡电蚊拍→雷神磁暴阵" },
};

// Vampire-Survivors-style Weapon Evolution Synergies!
export const WEAPON_EVOLUTIONS = [
  {
    id: "thunder_storm",
    name: "⚡ 雷神磁暴阵",
    icon: "🌩️",
    req: { swatter: 3, tesla: 2 },
    formula: "高压电蚊拍 Lv.3 + 暴走插线板 Lv.2",
    kw: "全屏紫电风暴+感电麻痹",
    desc: "周期爆发巨型球状磁暴环并连锁电击 10 个目标，附带感电眩晕！",
    color: "#c084fc",
  },
  {
    id: "flame_tornado",
    name: "🔥 焚天烈焰刀阵",
    icon: "🔥",
    req: { hairdryer: 3, spatula: 2 },
    formula: "涡轮吹风机 Lv.3 + 黄油刀铲 Lv.2",
    kw: "烈焰刀阵+穿透火球齐射",
    desc: "刀片燃起炽热火环高速绞杀，并向四周喷射穿透烈焰冲击波！",
    color: "#ff7a33",
  },
  {
    id: "prism_railgun",
    name: "🌈 棱镜轨道光炮",
    icon: "🌈",
    req: { laser: 3, turbo: 1 },
    formula: "红外激光笔 Lv.3 + 静音越野轮 Lv.1",
    kw: "三道彩虹贯穿折射光束",
    desc: "激光进化为高能棱镜轨道炮，命中后自动折射弹跳 3 次，暴击翻倍！",
    color: "#38f3ff",
  },
  {
    id: "golden_vortex",
    name: "👑 黄金引力黑洞",
    icon: "🌀",
    req: { spatula: 3, magnet: 1 },
    formula: "黄油刀铲 Lv.3 + 涡轮强吸口 Lv.1",
    kw: "黑洞卷怪+击杀狂爆金币",
    desc: "周身展开金色引力漩涡强行卷入怪潮绞杀，每次击杀额外爆大额金币！",
    color: "#ffd54a",
  },
];

export const PASSIVES = {
  magnet: { id: "magnet", name: "涡轮强吸口", tag: "吸尘范围", color: "#57f287", icon: "🧲", desc: "吸尘与大金拾取范围 +35%", evoHint: "配🔪黄油刀→黄金黑洞" },
  turbo: { id: "turbo", name: "静音越野轮", tag: "冲刺移速", color: "#4de1ff", icon: "🛞", desc: "移动速度 +14%，钻桌躲猫掌更稳", evoHint: "配🔴激光笔→棱镜光炮" },
  battery: { id: "battery", name: "快充锂电芯", tag: "续航回血", color: "#ff7eb6", icon: "🔋", desc: "最大生命 +25 并立刻恢复 40 点电量", evoHint: "提升生存容错" },
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
  totalKills: 0,
  bestRunValue: 0,
  bestStars: 0,
  extractStreak: 0,
  runsPlayed: 0,
  safeBoxSlots: 1,
  equippedSkin: "classic",
  skinsOwned: ["classic"],
  equippedAcc: "ahoge",
  accOwned: ["none", "ahoge"],
  activeTalentStyle: "thunder",
  talentLevels: {}, // nodeId -> 1..5
  talentActive: {
    thunder: { 1: null, 2: null, 3: null },
    greed: { 1: null, 2: null, 3: null },
    clean: { 1: null, 2: null, 3: null },
  },
  museum: {},
  boosters: {},
  selectedMap: "living",
  playerName: "扫地特工",
};
