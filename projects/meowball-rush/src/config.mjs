import { polylineLength, computeLaunchVelocity, prepareRouteGeometry, samplePath, nearestRouteSurface } from "./course-math.mjs";

// Meowball Rush v3.1.1 — ten four-act courses, from a gentle meadow to the royal finale.

export const CATS = [
  {
    id: "witch_black",
    name: "见习小黑猫",
    title: "星空魔女帽",
    rarity: "R",
    emoji: "🧙‍♀️",
    glbKey: "cat-witch",
    tintMix: 0,
    bodyColor: 0x322a3d,
    bellyColor: 0x4b4059,
    eyeColor: 0xffb830,
    bubbleColor: 0xb67cff,
    trailColor: 0xc084fc,
    acc: "witch_hat",
    stats: { accel: 1.0, topSpeed: 1.0, grip: 1.0, dizzyResist: 1.0 },
    desc: "均衡全能 · 星空紫泡泡 + 彩虹微风拖尾",
    unlockText: "初始赠送",
    unlockedByDefault: true,
  },
  {
    id: "ginger_scarf",
    name: "暖橘围巾猫",
    title: "蜂蜜水晶球",
    rarity: "R",
    emoji: "🧣",
    glbKey: "cat-ginger",
    tintMix: 0,
    bodyColor: 0xf49d47,
    bellyColor: 0xffe4b8,
    eyeColor: 0x3b2614,
    bubbleColor: 0xffcc4d,
    trailColor: 0xffb703,
    acc: "scarf",
    stats: { accel: 1.05, topSpeed: 1.04, grip: 0.96, dizzyResist: 1.2 },
    desc: "大橘为重 · 陡坡冲刺更快，抗砸抗摔！",
    unlockText: "通关第 1 关【晨曦花谷学园】解锁",
    unlockReq: { type: "clear", track: 0 },
  },
  {
    id: "starbell_dream",
    name: "幻梦星铃猫",
    title: "蝶梦星光球",
    rarity: "SR",
    emoji: "🦋",
    glbKey: "cat-ragdoll",
    tintMix: 0.24,
    bodyColor: 0x60a5fa,
    bellyColor: 0xe0f2fe,
    eyeColor: 0x38bdf8,
    bubbleColor: 0x60c8ff,
    trailColor: 0x38bdf8,
    acc: "bell",
    stats: { accel: 1.06, topSpeed: 1.04, grip: 1.06, dizzyResist: 1.15 },
    desc: "星梦使者 · 首次生成/分享通关海报立刻领！",
    unlockText: "首次生成或分享任意通关海报解锁",
    unlockReq: { type: "share", count: 1 },
  },
  {
    id: "ragdoll_sakura",
    name: "樱花布偶猫",
    title: "樱花粉泡泡",
    rarity: "SR",
    emoji: "🌸",
    glbKey: "cat-ragdoll",
    tintMix: 0,
    bodyColor: 0xffb3d9,
    bellyColor: 0xfff0f7,
    eyeColor: 0x38bdf8,
    bubbleColor: 0xff8ec4,
    trailColor: 0xff85c0,
    acc: "ribbon",
    stats: { accel: 1.03, topSpeed: 1.0, grip: 1.1, dizzyResist: 1.45 },
    desc: "轻盈优雅 · 摔晕恢复极快，丝滑控球！",
    unlockText: "累计收集 10 颗魔法星糖解锁",
    unlockReq: { type: "stars", count: 10 },
  },
  {
    id: "calico_mint",
    name: "薄荷三花猫",
    title: "薄荷翡翠球",
    rarity: "SR",
    emoji: "🍀",
    glbKey: "cat-ginger",
    tintMix: 0.3,
    bodyColor: 0x6ee7b7,
    bellyColor: 0xecfdf5,
    eyeColor: 0xd97706,
    bubbleColor: 0x56f0b8,
    trailColor: 0x34d399,
    acc: "bell",
    stats: { accel: 1.08, topSpeed: 1.01, grip: 1.24, dizzyResist: 1.05 },
    desc: "急停之王 · 超强抓地力，冰面窄桥稳如老狗！",
    unlockText: "通关第 4 关【树洞与胖云牧场】解锁",
    unlockReq: { type: "clear", track: 3 },
  },
  {
    id: "cloud_explorer",
    name: "云端探险猫",
    title: "蓬松云朵球",
    rarity: "SR",
    emoji: "☁️",
    glbKey: "cat-ginger",
    tintMix: 0.32,
    bodyColor: 0x93c5fd,
    bellyColor: 0xf0f9ff,
    eyeColor: 0x2563eb,
    bubbleColor: 0x7dd3fc,
    trailColor: 0x93c5fd,
    acc: "goggles",
    stats: { accel: 1.07, topSpeed: 1.06, grip: 1.08, dizzyResist: 1.3 },
    desc: "捷径猎手 · 发现任意隐藏云朵捷径即可解锁！",
    unlockText: "发现任意 1 条隐藏云朵捷径解锁",
    unlockReq: { type: "secret", count: 1 },
  },
  {
    id: "phantom_tuxedo",
    name: "无伤怪盗猫",
    title: "绯红星夜球",
    rarity: "SSR",
    emoji: "🎩",
    glbKey: "cat-witch",
    tintMix: 0.32,
    bodyColor: 0xf43f5e,
    bellyColor: 0xffe4e6,
    eyeColor: 0xfbbf24,
    bubbleColor: 0xff6b8b,
    trailColor: 0xfb7185,
    acc: "witch_hat",
    stats: { accel: 1.14, topSpeed: 1.08, grip: 1.12, dizzyResist: 1.25 },
    desc: "完美主义 · 起步爆发极强，飘逸过弯大师！",
    unlockText: "任意关卡「0 破球无伤」通关解锁",
    unlockReq: { type: "nopop", count: 1 },
  },
  {
    id: "tuxedo_goggles",
    name: "极速飞行猫",
    title: "青蓝霓虹球",
    rarity: "SSR",
    emoji: "🥽",
    glbKey: "cat-ginger",
    tintMix: 0.3,
    bodyColor: 0x22d3ee,
    bellyColor: 0xecfeff,
    eyeColor: 0x38f3ff,
    bubbleColor: 0x38e8ff,
    trailColor: 0x22d3ee,
    acc: "goggles",
    stats: { accel: 1.12, topSpeed: 1.15, grip: 0.98, dizzyResist: 1.1 },
    desc: "竞速神车 · 全场最高极速突破，抢榜必备！",
    unlockText: "通关第 7 关【浮空云海跳岛】解锁",
    unlockReq: { type: "clear", track: 6 },
  },
  {
    id: "aurora_queen",
    name: "星月白猫女王",
    title: "极光幻彩球",
    rarity: "SSR",
    emoji: "👑",
    glbKey: "cat-ragdoll",
    tintMix: 0.22,
    bodyColor: 0xe9d5ff,
    bellyColor: 0xffffff,
    eyeColor: 0x818cf8,
    bubbleColor: 0xe879f9,
    trailColor: 0xd8b4fe,
    acc: "crown",
    stats: { accel: 1.13, topSpeed: 1.13, grip: 1.18, dizzyResist: 1.45 },
    desc: "隐藏传说 · 全属性天花板，极光尾迹闪耀天际！",
    unlockText: "通关第 10 关【魔女大庆典总决赛】解锁",
    unlockReq: { type: "clear", track: 9 },
  },
];


// Each stage is authored independently from its approved top/side-view blueprint.
// Explicit pacing targets preserve a readable opening and a substantial final cup.
// Each course adds new playable sections before normalization; these are not stretched copies.
export const COURSE_LENGTH_TARGETS = [165, 195, 235, 280, 330, 390, 460, 540, 625, 740];
// Reserve the default camera boom as well as the physical rolling corridor.
// Longer player-controlled orbit views use the runtime scenery cutaway.
export const SCENERY_CAMERA_REACH = 14;
const DAY = { skyTop: 0x75c9ff, skyBottom: 0xe9f9ff, fogColor: 0xd7f2eb, sunColor: 0xffefd0 };
const HOME = { skyTop: 0xf5cf9e, skyBottom: 0xfff4d8, fogColor: 0xf5e2ca, sunColor: 0xffe1aa };
const NIGHT = { skyTop: 0x101739, skyBottom: 0x604789, fogColor: 0x302855, sunColor: 0xc8e9ff };
const P = (x, y, z) => ({ x, y, z });

function smoothPath(controls) {
  controls = controls.filter((p, i) => !i || Math.hypot(p.x - controls[i - 1].x, p.y - controls[i - 1].y, p.z - controls[i - 1].z) > 1e-6);
  const points = [];
  for (let i = 0; i < controls.length - 1; i++) {
    const a = controls[Math.max(0, i - 1)], b = controls[i], c = controls[i + 1], d = controls[Math.min(controls.length - 1, i + 2)];
    const count = Math.max(4, Math.ceil(Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z) / 0.75));
    for (let k = 0; k < count; k++) {
      const t = k / count, t2 = t * t, t3 = t2 * t;
      const point = {};
      for (const axis of ['x', 'y', 'z']) point[axis] = 0.5 * ((2 * b[axis]) + (-a[axis] + c[axis]) * t + (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * t2 + (-a[axis] + 3 * b[axis] - 3 * c[axis] + d[axis]) * t3);
      points.push(point);
    }
  }
  points.push({ ...controls.at(-1) });
  return points;
}

function makeStage(index, id, name, worldType, subtitle, blueprint) {
  return { id, name, worldType, subtitle, blueprint: `docs/concept-art/v3-blueprints/${blueprint}.jpg`, diff: Math.min(5, 1 + Math.floor(index / 2)),
    ...(worldType === 'indoor_home' ? HOME : worldType === 'starlight_library' || worldType === 'hybrid_winter' ? NIGHT : DAY),
    routes: [], platforms: [], chutes: [], props: [], cameraZones: [], primaryPath: [], landmarks: [],
    boosts: [], mushrooms: [], gears: [], hammers: [], rollingPins: [], bumpers: [], steamVents: [], stars: [], checkpoints: [], tips: [],
    bonusTime: 65 + index * 12, deathY: -16, cameraSceneryReach: SCENERY_CAMERA_REACH, index };
}
function route(t, id, section, kind, width, controls, extra = {}) {
  controls = controls.filter((p, i) => !i || Math.hypot(p.x-controls[i-1].x,p.y-controls[i-1].y,p.z-controls[i-1].z)>1e-6).map(p => ({ ...p }));
  // Adaptive tangent runways preserve capture/release direction without overshooting
  // the next control on short receiving decks.
  for (const c of t.chutes) {
    const first=c.points[0],second=c.points[1],last=c.points.at(-1),before=c.points.at(-2);
    const same=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1e-6;
    if(same(controls.at(-1),first)){
      const n=Math.hypot(second.x-first.x,second.z-first.z),dx=(second.x-first.x)/n,dz=(second.z-first.z)/n;
      const p=controls.at(-2),distance=Math.hypot(first.x-p.x,first.z-p.z)||1;
      const runway=Math.min(4,distance*.45);
      if(((first.x-p.x)*dx+(first.z-p.z)*dz)/distance<.995||Math.abs(p.y-first.y)>.01)controls.splice(-1,0,P(first.x-dx*runway,first.y,first.z-dz*runway));
    }
    if(same(controls[0],last)){
      const n=Math.hypot(last.x-before.x,last.z-before.z),dx=(last.x-before.x)/n,dz=(last.z-before.z)/n;
      const p=controls[1],distance=Math.hypot(p.x-last.x,p.z-last.z)||1;
      const runway=Math.min(4,distance*.45);
      if(((p.x-last.x)*dx+(p.z-last.z)*dz)/distance<.995||Math.abs(p.y-last.y)>.01)controls.splice(1,0,P(last.x+dx*runway,last.y,last.z+dz*runway));
    }
  }
  const points = smoothPath(controls);
  for (const c of t.chutes) {
    const first=c.points[0],next=c.points[1],last=c.points.at(-1),before=c.points.at(-2);
    const same=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1e-6;
    if(same(points.at(-1),first)){
      const n=Math.hypot(next.x-first.x,next.z-first.z),tx=(next.x-first.x)/n,tz=(next.z-first.z)/n;
      let distance=0,nextSample={...points.at(-1)};
      for(let i=points.length-2;i>=Math.max(0,points.length-4);i--){const original={...points[i]};distance+=Math.hypot(nextSample.x-original.x,nextSample.z-original.z);points[i]=P(first.x-tx*distance,first.y,first.z-tz*distance);nextSample=original;}
    }
    if(same(points[0],last)){
      const n=Math.hypot(last.x-before.x,last.z-before.z),tx=(last.x-before.x)/n,tz=(last.z-before.z)/n;
      let distance=0,previous={...points[0]};
      for(let i=1;i<Math.min(4,points.length);i++){const original={...points[i]};distance+=Math.hypot(original.x-previous.x,original.z-previous.z);points[i]=P(last.x+tx*distance,last.y,last.z+tz*distance);previous=original;}
    }
  }
  const r = { id, section, kind, width, points, walls: width >= 3.8, ...extra };
  t.routes.push(r);
  if (!r.secret) t.primaryPath.push({ type: 'route', id });
  return r;
}
function plaza(t, at, kind = 'grass', w = 8, d = 8, role = '') {
  t.platforms.push({ kind, ...at, w, d, h: 0.65, walls: false, role });
  return at;
}
function orbit(t, at, r = 7) { t.cameraZones.push({ type: 'orbit', ...at, r, minY: at.y - 2, maxY: at.y + 5 }); }
function prop(t, type, at, extra = {}) {
  const p = { id: `${t.id}-${type}-${t.props.length}`, type, ...at, r: 1.05, ...extra };
  t.props.push(p); return p;
}
function launch(t, type, at, target, flightTime, extra = {}) {
  const p = prop(t, type, at, { target, flightTime, ...computeLaunchVelocity(at, target, flightTime), ...extra });
  t.primaryPath.push({ type: 'launch', id: p.id, optional: !!p.optional });
  return p;
}
function mushroom(t, at, target, flightTime) {
  const m = { id: `${t.id}-mushroom-${t.mushrooms.length}`, ...at, r: 1.5, target, flightTime, ...computeLaunchVelocity(at, target, flightTime) };
  t.mushrooms.push(m); t.primaryPath.push({ type: 'mushroom', id: m.id }); return m;
}
function chute(t, id, material, center, radius, drop, turns = 1, startAngle = Math.PI) {
  const pointAt = (s) => { const a = startAngle + Math.PI * 2 * turns * s;
    return P(center.x + radius * Math.cos(a), center.y - drop * (s - Math.sin(Math.PI * 2 * s) / (Math.PI * 2)), center.z + radius * Math.sin(a)); };
  const first = pointAt(0), last = pointAt(1);
  const ix = -Math.sin(startAngle), iz = Math.cos(startAngle);
  const endAngle = startAngle + Math.PI * 2 * turns, ex = -Math.sin(endAngle), ez = Math.cos(endAngle);
  const points = [P(first.x - ix * 5, first.y, first.z - iz * 5), P(first.x - ix * 2.5, first.y, first.z - iz * 2.5)];
  const count = Math.ceil(turns * 144);
  for (let i = 0; i <= count; i++) points.push(pointAt(i / count));
  points.push(P(last.x + ex * 3, last.y, last.z + ez * 3), P(last.x + ex * 7, last.y, last.z + ez * 7));
  const c = { id, material, points, center: { ...center }, radius, drop, turns, width: 3.6, speed: 13 + t.index * 0.55, exitSpeed:6, brakeDistance:12, entryRadius: 1.8, receiving: { ...points.at(-1) } };
  t.chutes.push(c); return c;
}
function ride(t, c) { t.primaryPath.push({ type: 'chute', id: c.id }); plaza(t, c.receiving, 'wood', 8, 9, 'chute-receiver'); }
function landmark(t, type, at, extra = {}) { t.landmarks.push({ type, ...at, ...extra }); }

function dawnValley() {
  const t = makeStage(0, 'academy', '01 · 晨曦花谷学园', 'grounded_nature', '绿丘花径 · 刺猬助跑 · 溪桥与微笑柳枝', 'stage01-dawn-valley');
  route(t, 'flower-curve', 'flower_valley', 'grass', 6.6, [P(0,8,0),P(1,7.8,-6),P(7,7,-12),P(10,6.3,-18),P(8,6,-25)]);
  prop(t, 'hedgehog', P(8.5,6.2,-20), { fx: -1.4, fz: -4.8, r: 1.2 });
  route(t, 'brook-bridge', 'brook_bridge', 'wood', 4.8, [P(8,6,-25),P(7,6.2,-29),P(7,6.4,-34),P(9,6.3,-38)]);
  route(t, 'willow-meadow', 'willow_branch', 'grass', 6.6, [P(9,6.3,-38),P(14,6.5,-43),P(22,6.8,-44),P(27,7,-49),P(28,7.3,-56)]);
  launch(t,'willow_branch',P(14,6.5,-43),P(17.7,6.65,-44),0.52,{optional:true,r:1.35});
  landmark(t,'stream',P(7,4.5,-32)); landmark(t,'willow',P(12,6.3,-41));
  t.finish = P(28,7.3,-56); t.start = P(0,8.62,0); t.goalStyle = 'flower_arch'; return t;
}
function livingRoom() {
  const t = makeStage(1,'garden','02 · 魔女客厅大冒险','indoor_home','编织地毯 · 书本斜坡 · 青玻璃螺旋与玩具火车','stage02-cozy-living-room');
  const c = chute(t,'cyan-glass','glass',P(30,12,-29),5,5.2,1,Math.PI);
  route(t,'woven-rug','woven_rug','carpet',6,[P(0,5.2,0),P(-4,4.7,-4),P(-4,4,-10)]);
  route(t,'book-ramp','stacked_books','wood',4.8,[P(-4,4,-10),P(-4,4.4,-20),P(-22,6,-32),P(-18,7.6,-48),P(-3,9.2,-50),P(10,10.8,-42),P(12,12,-30),P(3,12,-27),P(3,12,-23)]);
  route(t,'coffee-table','coffee_table','wood',6.4,[P(3,12,-23),P(3,12,-13),P(10,12,-7),P(20,12,-10),P(25,12,-17),c.points[0]]);
  prop(t,'turntable',P(3,12,-13),{r:2,omega:0.65}); prop(t,'toy_mouse',P(10,12,-7),{fx:1.5,fz:-3.5});
  ride(t,c);
  route(t,'toy-train','toy_train','wood',4,[c.receiving,P(25,6.8,-44),P(34,6.8,-51),P(43,6.8,-46),P(45,6.8,-36)]);
  landmark(t,'coffee_table',P(13,12,-13)); landmark(t,'teacup',P(17,5,-20));
  t.start=P(0,5.82,0);t.finish=P(45,6.8,-36);t.goalStyle='purple_cushion'; return t;
}
function bakeryStreet() {
  const t=makeStage(2,'honey','03 · 鹅卵石面包老街','town_street','鸭宝游行 · 双拱运河S桥 · 喷泉环岛与石沿','stage03-bakery-street');
  route(t,'downhill-street','cobblestone_street','stone',6,[P(0,10,0),P(0,9,-7),P(-5,7,-15),P(-9,6,-22)]);
  prop(t,'ducklings',P(-7,6.5,-18.5),{r:1.5,patrol:2.4,speed:1.4});
  route(t,'twin-arches','canal_bridges','stone',4.6,[P(-9,6,-22),P(-5,6.7,-27),P(3,7.5,-28),P(9,6.7,-31),P(9,6,-38),P(1,7.4,-43),P(-3,6,-49)]);
  const mainExit=P(8,6,-63);
  route(t,'fountain-roundabout','fountain_roundabout','stone',5,[P(-3,6,-49),P(-6,6,-55),P(-2,6,-61),mainExit]);
  route(t,'stone-curb','narrow_stone_curb','stone',2.1,[mainExit,P(18,6,-62),P(23,6,-56)]);orbit(t,P(16,6,-62),8);
  route(t,'festival-banner','festival_banner','stone',6,[P(23,6,-56),P(28,6,-52),P(31,6,-55)]);
  route(t,'awning-shortcut','bakery_awning','wood',3.4,[P(15,10.5,-43),P(21,10.5,-49),P(24,10.5,-56)],{secret:true,walls:false,detached:true});
  launch(t,'willow_branch',P(9,6,-38),P(15,10.5,-43),0.9,{optional:true,variant:'bakery_awning',r:.4});
  landmark(t,'fountain',P(2.5,6,-56));landmark(t,'canal',P(3,4,-35));
  t.start=P(0,10.62,0);t.finish=P(31,6,-55);t.goalStyle='festival_banner';return t;
}
function treePasture() {
  const t=makeStage(3,'mushroom','04 · 树洞与胖云牧场','grounded_nature','山间牧道 · 古橡树螺旋 · 独木桥与胖云羊群','stage04-treehouse-pasture');
  const c=chute(t,'hollow-oak','oak',P(10,13,-31),5.2,7,1,-Math.PI/2);
  route(t,'mountain-meadow','mountain_meadow','grass',5.8,[P(0,11,0),P(-8,11.5,-7),P(-11,12,-16),P(-5,13,-23),c.points[0]]);ride(t,c);
  route(t,'ravine-log','narrow_log_bridge','wood',1.9,[c.receiving,P(24,6,-36.2),P(30,6,-32),P(36,6,-29)]);orbit(t,P(29,6,-29),11);
  route(t,'sunny-pasture','sunny_pasture','grass',6.8,[P(36,6,-29),P(41,6.4,-35),P(39,7,-45),P(47,7.4,-51),P(54,8,-47)]);
  prop(t,'wind_cloud',P(40,7,-40),{r:1.4,fx:1.6,fz:-2.2});prop(t,'sheep',P(43,7.2,-48),{r:1.2,patrol:2.6,speed:.9});
  landmark(t,'giant_oak',P(10,6,-31),{height:16});landmark(t,'ravine',P(30,1,-29));
  t.start=P(0,11.62,0);t.finish=P(54,8,-47);t.goalStyle='flower_arch';return t;
}
function sweetKitchen() {
  const t=makeStage(4,'clockwork','05 · 厨房甜点大作战','indoor_home','格纹餐桌 · 吐司机弹射 · 煎饼转盘与蜂蜜玻璃管','stage05-sweet-kitchen');
  const c=chute(t,'amber-honey','honey',P(24,14,-40),5.4,5,1,Math.PI);
  route(t,'tablecloth','checkered_tablecloth','carpet',6.6,[P(0,7,0),P(-4,7,-6),P(1,7,-12),P(4,7,-16)]);
  plaza(t,P(4,7,-16),'wood',7,7,'toaster-dock');
  launch(t,'toaster',P(4,7,-16),P(9,14,-21),1.05,{r:1.25});plaza(t,P(9,14,-21),'wood',10,9,'upper-counter');
  route(t,'upper-counter','upper_kitchen_counter','wood',6.4,[P(9,14,-21),P(14,14,-24),P(18,14,-27)]);
  prop(t,'turntable',P(13,14,-23.5),{r:2.1,omega:.8,variant:'pancake'});
  route(t,'cutting-board','narrow_cutting_board','wood',1.9,[P(18,14,-27),P(18.6,14,-32),P(18.6,14,-35),c.points[0]]);orbit(t,P(18.6,14,-31),8);
  ride(t,c);route(t,'cake-steps','strawberry_cake','wood',5.6,[c.receiving,P(24,9,-51),P(32,9.6,-48),P(36,10,-42)]);
  landmark(t,'dining_table',P(0,7,-7));landmark(t,'kitchen_counter',P(14,14,-24));landmark(t,'cake',P(36,10,-42));
  t.start=P(0,7.62,0);t.finish=P(36,10,-42);t.goalStyle='strawberry_cake';return t;
}
function clocktowerRoofs() {
  const t=makeStage(5,'pendulum','06 · 钟楼运河与屋顶','town_street','瓦屋弯道 · 烟囱暖流捷径 · 齿轮钟摆与窗沿','stage06-clocktower-rooftops');
  route(t,'roof-bank','terracotta_rooftops','wood',5.4,[P(0,14,0),P(-3,13,-8),P(0,12,-17),P(9,12,-24)],{bank:.5});
  route(t,'balcony-eaves','forked_balcony','wood',2.5,[P(9,12,-24),P(19,12,-22),P(25,12.5,-28),P(24,13,-36)]);orbit(t,P(15,12,-23),8);
  route(t,'chimney-shortcut','chimney_updraft','wood',2.7,[P(13,16,-30),P(17,16,-34),P(20,16,-36)],{secret:true,walls:false,detached:true});
  launch(t,'wind_cloud',P(20,16,-36),P(24,13,-36),.88,{optional:true,variant:'chimney',r:.65});
  route(t,'clock-gear-deck','clocktower_gear_deck','brass',7.5,[P(24,13,-36),P(27,13,-44),P(22,13,-50),P(14,13,-51)]);
  t.gears.push({x:23,y:13,z:-44,r:3.3,h:.7,omega:.55},{x:19,y:13,z:-49,r:2.7,h:.7,omega:-.6});
  t.hammers.push({x:23,y:17,z:-42,len:3.3,speed:1.4,amp:.65,phase:0,axis:'z'},{x:19,y:17,z:-49,len:3.3,speed:1.3,amp:.6,phase:Math.PI,axis:'x'});
  route(t,'window-ledge','narrow_window_ledge','stone',1.8,[P(14,13,-51),P(8,13,-56),P(8,13,-65),P(15,13,-69)]);orbit(t,P(8,13,-60),10);
  route(t,'belfry','clocktower_belfry','wood',5.2,[P(15,13,-69),P(22,14.5,-70),P(25,15,-66)]);
  landmark(t,'clocktower',P(20,4,-49),{height:22});
  t.start=P(0,14.62,0);t.finish=P(25,15,-66);t.goalStyle='belfry';return t;
}
function skyIslands() {
  const t=makeStage(6,'foundry','07 · 浮空云海跳岛','sky_floating','三级翡翠岛 · 蘑菇胖云弹射 · 双环彩虹与无栏云桥','stage07-sky-cloud-islands');
  const c=chute(t,'double-rainbow','rainbow',P(40,15,-63),6,6,2,Math.PI);
  route(t,'emerald-island-one','emerald_island','grass',6.7,[P(0,9,0),P(1,9,-5),P(5,9,-9)]);
  plaza(t,P(5,9,-9),'grass',9,9,'island-one');mushroom(t,P(5,9,-9),P(12,11,-17),.93);plaza(t,P(12,11,-17),'grass',9,9,'island-two');
  route(t,'emerald-island-two','emerald_island','grass',6.2,[P(12,11,-17),P(16,11,-20),P(18,11,-26)]);
  mushroom(t,P(18,11,-26),P(25,13,-33),.93);plaza(t,P(25,13,-33),'grass',16,16,'island-three');
  route(t,'emerald-island-three','cloud_updraft','grass',6.4,[P(25,13,-33),P(32,13,-40),P(36,13.5,-48),P(34,15,-54),c.points[0]]);
  launch(t,'wind_cloud',P(32,13,-40),P(36,13.5,-48),.76,{optional:true,r:1.4});ride(t,c);
  route(t,'cloud-beam','guardless_cloud_beam','cloud',1.65,[c.receiving,P(38,9,-79),P(51,9,-81),P(60,9,-75)],{walls:false});orbit(t,P(48,9,-80),12);
  route(t,'sky-shrine','sky_shrine','grass',6,[P(60,9,-75),P(65,10,-68),P(69,10.5,-61)]);
  t.start=P(0,9.62,0);t.finish=P(69,10.5,-61);t.goalStyle='sky_shrine';return t;
}
function frostAttic() {
  const t=makeStage(7,'aurora','08 · 冬日暖炉与冰川阁楼','hybrid_winter','暖炉阁楼 · 冰雪半管 · 冰晶螺旋与极光木屋','stage08-hearth-frost-attic');
  const c=chute(t,'turquoise-ice','ice',P(28,12,-38),6,4.5,1.25,Math.PI);
  route(t,'hearth-attic','fireplace_attic','wood',6.6,[P(0,13,0),P(2,13,-7),P(8,13,-12)]);
  // Give the banked U-turn a real radius: a single sharp control pinched the
  // inner bank into the bubble's view at a legal edge station.
  route(t,'window-bowl','icy_halfpipe_bowl','ice',7.6,[P(8,13,-12),P(15,9,-16),P(23,7.5,-13),P(31,7.5,-20),P(31,7.7,-22),P(29.24,8.8,-26.24),P(25,10.3,-28),P(22,11.4,-28),P(22,12,-30),c.points[0]],{bank:1.0});
  prop(t,'snow_bunny',P(26,7.5,-15),{patrol:2.4,speed:1.1,r:1.05});prop(t,'penguin',P(31,7.7,-25),{patrol:2,speed:1.35,r:1.05});ride(t,c);
  route(t,'snow-pine-bridge','snow_pine_bridge','wood',2.6,[c.receiving,P(38,7.5,-43),P(44,8,-47)]);orbit(t,P(39,7.5,-44),8);
  route(t,'aurora-lodge','aurora_lodge','ice',5.8,[P(44,8,-47),P(49,8.3,-41),P(55,9,-36)]);
  landmark(t,'fireplace',P(-4,13,-4));landmark(t,'window',P(8,13,-12));landmark(t,'lodge',P(55,9,-36));
  t.start=P(0,13.62,0);t.finish=P(55,9,-36);t.goalStyle='aurora_lodge';return t;
}
function starlightLibrary() {
  const t=makeStage(8,'prism','09 · 星光书塔螺旋升空','starlight_library','270°升空书架 · 振翅魔法书 · 星辉丝带与观星穹顶','stage09-starlight-library');
  const terrace=[];
  for(let i=0;i<=36;i++){const a=Math.PI/2 + Math.PI*1.5*i/36;terrace.push(P(18*Math.cos(a),6+12*i/36,-24+18*Math.sin(a)));}
  route(t,'ascending-bookshelves','ascending_bookshelf_270','wood',5,terrace,{walls:true});
  const start=terrace[0], upper=terrace.at(-1);
  // Four independent books: open air remains between the page-sized landing pads.
  // Each departing book supplies a gentle hop, while manual orbit stays available.
  route(t,'spellbook-one','floating_spellbooks','book',2.15,[upper,P(17,18.2,-21)],{walls:false});
  launch(t,'spellbook_bridge',P(17.2,18.16,-21.6),P(14.5,18.7,-17.2),.62,{r:.64,cinematic:false});
  route(t,'spellbook-two','floating_spellbooks','book',2.15,[P(15,18.6,-18.8),P(14,18.8,-15.6)],{walls:false});
  launch(t,'spellbook_bridge',P(14.2,18.76,-16.24),P(10.7,19.3,-12.9),.62,{r:.64,cinematic:false});
  route(t,'spellbook-three','floating_spellbooks','book',2.15,[P(11.8,19.2,-14.2),P(9.6,19.4,-11.6)],{walls:false});
  launch(t,'spellbook_bridge',P(10.04,19.36,-12.12),P(6.8,19.8,-9.8),.58,{r:.64,cinematic:false});
  route(t,'spellbook-four','floating_spellbooks','book',2.15,[P(8,19.7,-10.2),P(5.6,19.9,-9.4)],{walls:false});
  prop(t,'spellbook_bridge',P(6.8,19.8,-9.8),{r:.8});orbit(t,P(13,19,-16),10);
  const c=chute(t,'golden-starlight','starlight',P(-6,20,-21),5.8,8,1.5,Math.PI/2);
  route(t,'crystal-beam','narrow_crystal_beam','neon',1.7,[P(5.6,19.9,-9.4),P(4,20,-12.5),P(3,20,-15.2),c.points[0]],{walls:false});orbit(t,P(4,20,-13),9);ride(t,c);
  route(t,'observatory-dome','observatory_dome','crystal',5.5,[c.receiving,P(11,12,-22),P(13,12.5,-28),P(7,13,-34),P(0,13,-33)]);
  landmark(t,'telescope',P(0,6,-24),{height:24});landmark(t,'observatory',P(0,13,-33));
  t.start=P(start.x,start.y+.62,start.z);t.finish=P(0,13,-33);t.goalStyle='observatory_dome';return t;
}
function grandFestival() {
  const t=makeStage(9,'sanctum','10 · 魔女大庆典总决赛','grand_medley','花谷街灯 · 图书室飞跃 · 双螺旋彩虹与皇家星桥','stage10-grand-festival-finale');
  route(t,'festival-valley','grounded_flower_valley','grass',6.4,[P(0,8,0),P(-5,7.5,-7),P(0,7,-15),P(9,7,-22),P(12,7,-29)]);
  prop(t,'hedgehog',P(3,7,-18),{fx:3,fz:-4,r:1.1});
  route(t,'lantern-street','lantern_cobblestone_street','stone',5.8,[P(12,7,-29),P(19,7.5,-36),P(18,8,-47),P(10,9,-53),P(10,10,-61)]);
  prop(t,'ducklings',P(18.5,8,-42),{patrol:2,speed:1.25,r:1.3});
  launch(t,'willow_branch',P(10,10,-61),P(15,14,-68),.93,{variant:'library_jump',r:1.3});plaza(t,P(10,10,-61),'stone',7,7,'library-jump-dock');plaza(t,P(15,14,-68),'wood',9,9,'library-arrival');
  route(t,'library-interior','indoor_library_jump','wood',5.8,[P(15,14,-68),P(23,15,-72),P(30,16,-68),P(36,17,-73),P(36,18,-82)]);
  prop(t,'spellbook_bridge',P(30,16,-68),{r:1.8});
  const c=chute(t,'royal-double-helix','rainbow',P(48,18,-94),7.2,7,2.25,Math.PI);
  route(t,'library-sky-dock','library_sky_dock','crystal',4.8,[P(36,18,-82),P(39,18,-85),c.points[0]]);ride(t,c);
  // The second intertwined ribbon is scenery; the primary ride never forks inside a rail.
  c.doubleHelix=true;
  route(t,'starry-festival-bridge','narrow_starry_festival_bridge','neon',1.65,[c.receiving,P(60,11,-89),P(72,11,-89),P(78,12,-96)],{walls:false});orbit(t,P(68,11,-89),13);
  route(t,'royal-sanctum','royal_double_arch_sanctum','crystal',7,[P(78,12,-96),P(86,13,-101),P(94,14,-98)]);
  landmark(t,'library',P(28,14,-73));landmark(t,'royal_sanctum',P(94,14,-98));
  t.start=P(0,8.62,0);t.finish=P(94,14,-98);t.goalStyle='royal_double_arch';return t;
}

// Every extension is a new, hand-placed play space beyond the original goal. The
// return bends, texture changes and quieter precision link give longer courses
// breathing room between their signature mechanisms and the final sprint.
const COURSE_EXTENSIONS = [
  [
    ['windmill-flower-loop','windmill_flower_loop','grass',6.4,[[35,7.4,-59],[42,7.2,-66],[39,7,-75]]],
    ['lily-step-bridge','lily_step_bridge','wood',3.8,[[44,7,-82],[52,7,-85]]],
    ['sunflower-finale','sunflower_festival','grass',6.8,[[59,7.3,-90],[66,7.6,-88],[72,7.8,-95]]],
  ],
  [
    ['sofa-cushion-loop','sofa_cushion_loop','wood',5.8,[[47,6.8,-26],[62,6.8,-20],[74,6.8,-33]]],
    ['ribbon-reel','ribbon_reel','wood',3.5,[[82,6.8,-45],[78,6.8,-57]]],
    ['cushion-parade','cushion_parade','wood',5.8,[[85,7,-67],[97,7.2,-66],[104,7.2,-57]]],
  ],
  [
    ['market-crescent','market_crescent','stone',5.8,[[42,6,-50],[53,6.2,-56],[55,6,-65]]],
    ['canal-balustrade','canal_balustrade','stone',3.1,[[52,6,-73],[55,6,-80]]],
    ['bakers-procession','bakers_procession','stone',6.4,[[63,6.3,-86],[73,6.4,-83],[80,6.5,-90]]],
  ],
  [
    ['clover-pasture-loop','clover_pasture_loop','grass',6.8,[[66,8,-42],[77,7.6,-49],[80,7.3,-58]]],
    ['shepherd-log','shepherd_log','wood',2.7,[[77,7.3,-66],[81,7.3,-73]]],
    ['cloud-sheep-finale','cloud_sheep_festival','grass',6.8,[[90,7.5,-79],[100,8,-74],[107,8,-82]]],
  ],
  [
    ['sugar-cookie-slalom','sugar_cookie_slalom','wood',5.8,[[45,10,-37],[56,9.8,-41],[60,9.6,-51]]],
    ['wafer-bridge','wafer_bridge','wood',2.6,[[57,9.6,-60],[62,9.6,-67]]],
    ['icing-procession','icing_procession','wood',6.2,[[70,10,-73],[79,10.4,-69],[87,10.5,-76]]],
  ],
  [
    ['copper-roof-loop','copper_roof_loop','wood',5.6,[[33,15,-61],[44,14.7,-66],[46,14.5,-77]]],
    ['bell-balcony','bell_balcony','stone',2.5,[[43,14.5,-86],[48,14.5,-93]]],
    ['sunset-belfry-run','sunset_belfry_run','brass',6,[[57,15,-99],[66,15.4,-94],[74,15.5,-102]]],
  ],
  [
    ['rainbow-garden-loop','rainbow_garden_loop','grass',6.2,[[74,10.5,-39],[86,10,-47],[89,9.8,-60]]],
    ['cloud-needle','cloud_needle','cloud',2.4,[[84,9.8,-70],[88,9.8,-80]]],
    ['sunrise-shrine-run','sunrise_shrine_run','grass',6.5,[[100,10,-86],[111,10.5,-81],[119,11,-90]]],
  ],
  [
    ['frozen-lake-crescent','frozen_lake_crescent','ice',7.2,[[69,9,-30],[81,8.5,-40],[84,8.2,-53]]],
    ['frost-fence-walk','frost_fence_walk','wood',2.5,[[78,8.2,-64],[83,8.2,-74]]],
    ['northern-lights-run','northern_lights_run','ice',6.6,[[96,8.5,-81],[107,9,-75],[116,9.2,-85]]],
  ],
  [
    ['comet-reading-terrace','comet_reading_terrace','crystal',6,[[-10,13.6,-32],[-25,14.4,-37],[-29,14.5,-50]]],
    ['gilt-book-balcony','gilt_book_balcony','wood',2.4,[[-24,14.5,-62],[-31,14.5,-73]]],
    ['planetarium-procession','planetarium_procession','crystal',6.4,[[-45,14.7,-80],[-57,15,-74],[-68,15.3,-85]]],
  ],
  [
    ['royal-rose-loop','royal_rose_loop','grass',6.4,[[107,14,-91],[121,13.7,-101],[125,13.5,-115]]],
    ['coronation-starwalk','coronation_starwalk','neon',2.3,[[119,13.5,-128],[125,13.5,-139]]],
    ['witch-crown-procession','witch_crown_procession','crystal',7.4,[[140,14,-147],[154,14.5,-139],[166,15,-150]]],
  ],
];

const COURSE_IDENTITIES = [
  { palette:[0x8fc968,0xf4cd69,0xffa4bd], surfacePattern:'flower_petals',edgeStyle:'meadow_hedge',lighting:'golden_morning',acts:['花径试滚','溪桥轻转','柳枝借力','向日葵庆典'] },
  { palette:[0xb88964,0x89d6e1,0xd3a4e6], surfacePattern:'woven_rug',edgeStyle:'rug_piping',lighting:'honey_window',acts:['绒毯起步','玻璃回旋','玩具列车','抱枕巡游'] },
  { palette:[0xad9d8c,0x68c5ce,0xe8b56d], surfacePattern:'cobblestone',edgeStyle:'canal_stone',lighting:'bakery_afternoon',acts:['面包香街','双拱运河','喷泉石沿','市集游行'] },
  { palette:[0x8fbd67,0x9e6d44,0xe8c68c], surfacePattern:'clover_meadow',edgeStyle:'oak_rail',lighting:'pasture_sunbeams',acts:['牧道登高','古橡树旋滑','独木试胆','胖云羊牧场'] },
  { palette:[0xd3a06c,0xf1bb73,0xf8a2ae], surfacePattern:'gingham',edgeStyle:'icing_rail',lighting:'warm_kitchen',acts:['格纹餐桌','吐司飞跃与蜂蜜旋滑','砧板与蛋糕微控','糖霜巡游'] },
  { palette:[0xb97455,0xc89b55,0x82b6c7], surfacePattern:'terracotta_tiles',edgeStyle:'roof_copper',lighting:'clocktower_sunset',acts:['瓦屋顺风','齿轮钟摆','窗沿慢行','暮光钟楼'] },
  { palette:[0x8ed6ac,0xffc9ed,0xe7e8ff], surfacePattern:'cloud_stars',edgeStyle:'cloud_rope',lighting:'opalescent_sunrise',acts:['三级翡翠岛','双环彩虹','云桥微操','晨星神殿'] },
  { palette:[0x99e5ee,0xd1a372,0xceb7f7], surfacePattern:'frost_crystals',edgeStyle:'frost_rail',lighting:'hearth_aurora',acts:['暖炉阁楼','冰碗与冰晶旋滑','雪松桥微控','极光湖畔'] },
  { palette:[0x9d8ac9,0xe1bc68,0x7dbadc], surfacePattern:'constellation_pages',edgeStyle:'gilt_books',lighting:'starlight_indigo',acts:['升空书架','振翅魔法书','星辉螺旋','行星仪巡游'] },
  { palette:[0xd19cdb,0xf2cf76,0x93d8d2], surfacePattern:'royal_stars',edgeStyle:'royal_gold',lighting:'festival_twilight',acts:['花谷街灯','图书室飞跃','皇家双螺旋','魔女加冕礼'] },
];
const COURSE_LIGHTING = [
  {skyTop:0x83d5f5,skyBottom:0xfff3cb,fogColor:0xddeed3,sunColor:0xffe3a6},
  {skyTop:0xe6be94,skyBottom:0xfff1d5,fogColor:0xf1dfca,sunColor:0xffd6a3},
  {skyTop:0x87c7db,skyBottom:0xffe6c0,fogColor:0xe2dfcf,sunColor:0xffdbac},
  {skyTop:0x9bcbd3,skyBottom:0xeef3ce,fogColor:0xd2e6c1,sunColor:0xffedc0},
  {skyTop:0xe5b6a1,skyBottom:0xffedcf,fogColor:0xf4d8ba,sunColor:0xffd49b},
  {skyTop:0x8a99c4,skyBottom:0xf5c29e,fogColor:0xc2b8c6,sunColor:0xffbd8c},
  {skyTop:0x8ebfe9,skyBottom:0xffddec,fogColor:0xd4ddf7,sunColor:0xfff1dd},
  {skyTop:0x253d6b,skyBottom:0x8a8fb5,fogColor:0x647b9c,sunColor:0xd5f5ff},
  {skyTop:0x151533,skyBottom:0x625080,fogColor:0x363054,sunColor:0xdfd4ff},
  {skyTop:0x4d4d8c,skyBottom:0xe3a8cd,fogColor:0x9e8cbb,sunColor:0xffdcb9},
];

function addCourseFinale(t) {
  const originalFinish={...t.finish};
  for (const [id,section,kind,width,controls] of COURSE_EXTENSIONS[t.index]) {
    const authored=controls.map(([x,y,z])=>P(x,y,z));
    const previous=t.routes.filter(r=>!r.secret).at(-1),last=previous.points.at(-1),before=previous.points.at(-2);
    const dx=last.x-before.x,dz=last.z-before.z,run=Math.hypot(dx,dz)||1,runway=Math.max(previous.width,width)*.9+1.2;
    // A new act continues the arriving tangent. Reversing over the old finish
    // creates overlapping collision rails even when the centerlines only meet once.
    authored[0]=P(last.x+dx/run*runway,last.y+(last.y-before.y)/run*runway,last.z+dz/run*runway);
    const points=[{...t.finish},...authored];
    // The first control already follows the arriving tangent. Overwriting just
    // the first three sampled points creates a kink at the fourth sample and
    // collapses the inside rail; let the whole spline ease off that runway.
    route(t,id,section,kind,width,points,{walls:width>=3.5,extension:true});
    t.finish={...points.at(-1)};
  }
  t.originalFinish=originalFinish;
  landmark(t,'act_gate',originalFinish,{label:COURSE_IDENTITIES[t.index].acts[3]});
  landmark(t,'finale_beacon',{...t.finish},{label:COURSE_IDENTITIES[t.index].acts[3]});
}

function authorCoursePacing(t) {
  const identity=COURSE_IDENTITIES[t.index], core=t.routes.filter(r=>!r.secret&&!r.extension);
  const coreActs=[
    [0,1,2],[0,0,1,2],[0,1,1,2,2],[0,1,2],[0,1,2,2],
    [0,0,1,2,2],[0,0,1,2,2],[0,1,2,2],[0,1,1,1,1,2,2],[0,0,1,1,2,2],
  ][t.index];
  t.visualIdentity={...identity,palette:[...identity.palette]};
  Object.assign(t,COURSE_LIGHTING[t.index]);
  t.acts=identity.acts.map((name,i)=>({id:`${t.id}-act-${i+1}`,name,role:['opening','signature','microcontrol','finale'][i],routeIds:[],pathIds:[]}));
  for(const r of t.routes) {
    const index=core.indexOf(r);
    r.actIndex=r.extension?3:r.secret?1:coreActs[index];
    r.surfacePattern=identity.surfacePattern;
    r.edgeStyle=identity.edgeStyle;
    r.surfaceColor=identity.palette[0];
    r.accentColor=identity.palette[r.actIndex===3?2:1];
    if(!r.secret)t.acts[r.actIndex].routeIds.push(r.id);
  }
  let actIndex=0;
  for(const step of t.primaryPath) {
    if(step.type==='route')actIndex=t.routes.find(r=>r.id===step.id).actIndex;
    else if(step.type==='chute')actIndex=1;
    else if(step.type==='launch') {
      const p=t.props.find(p=>p.id===step.id);
      if(!step.optional&&(p.type==='toaster'||p.variant==='library_jump'))actIndex=1;
    }
    step.actIndex=actIndex;
    if(!step.optional)t.acts[actIndex].pathIds.push(step.id);
  }
  for(const act of t.acts)act.lengthMeters=t.primaryPath.filter(p=>!p.optional&&p.actIndex===t.acts.indexOf(act)).reduce((sum,p)=>sum+(p.type==='route'?polylineLength(t.routes.find(r=>r.id===p.id).points):p.type==='chute'?polylineLength(t.chutes.find(c=>c.id===p.id).points):0),0);
  // Distance-based recovery points cover the new finale as well as the original
  // signature set piece. Every candidate is a broad floor or a chute arrival deck.
  const candidates=[];let progress=0;
  for(const step of t.primaryPath) {
    if(step.type==='route') {
      const r=t.routes.find(r=>r.id===step.id);let local=0;
      for(let i=1;i<r.points.length;i++) {
        const a=r.points[i-1],p=r.points[i];local+=Math.hypot(p.x-a.x,p.y-a.y,p.z-a.z);
        if(r.width>=3.5)candidates.push({...p,progress:progress+local,actIndex:r.actIndex});
      }
      progress+=local;
    } else if(step.type==='chute') {
      const c=t.chutes.find(c=>c.id===step.id);progress+=polylineLength(c.points);
      candidates.push({...c.receiving,progress,actIndex:1});
    }
  }
  t.checkpoints=[];
  for(const fraction of [.28,.53,.78]) {
    const available=candidates.filter(p=>!t.checkpoints.some(cp=>Math.abs(cp.progress-p.progress)<t.length*.1));
    const candidate=available.reduce((best,p)=>!best||Math.abs(p.progress-t.length*fraction)<Math.abs(best.progress-t.length*fraction)?p:best,null);
    if(candidate)t.checkpoints.push({...candidate});
  }
  t.checkpoints.sort((a,b)=>a.progress-b.progress);
  const narrowLength=t.routes.filter(r=>!r.secret&&r.width<=2.6).reduce((sum,r)=>sum+polylineLength(r.points),0);
  const stickyTime=t.routes.reduce((sum,r)=>sum+polylineLength(r.points)*(r.kind==='honey'?.7:r.kind==='mud'?.45:0),0);
  t.parSeconds=Math.ceil(t.length/(3.8+t.index*.04)+18+t.chutes.length*4+narrowLength*.12+stickyTime);
  t.bonusTime=Math.ceil(t.parSeconds*1.25+20);
}

function authorFallZones(t) {
  const all=t.routes.flatMap(r=>r.points), minY=Math.min(...all.map(p=>p.y));
  const bounds=(points,padding=4)=>{
    const x0=Math.min(...points.map(p=>p.x))-padding,x1=Math.max(...points.map(p=>p.x))+padding;
    const z0=Math.min(...points.map(p=>p.z))-padding,z1=Math.max(...points.map(p=>p.z))+padding;
    return {x:(x0+x1)/2,z:(z0+z1)/2,w:x1-x0,d:z1-z0};
  };
  t.fallZones=[];
  const zone=(type,routeIds,label,drop,priority=20)=>{
    const routes=t.routes.filter(r=>routeIds.includes(r.id)), points=routes.flatMap(r=>r.points);
    if(!points.length)return;
    const y=Math.min(...points.map(p=>p.y))-drop;
    t.fallZones.push({id:`${t.id}-${type}-${t.fallZones.length}`,type,...bounds(points,Math.max(4,...routes.map(r=>r.width*.65))),y,triggerY:y,label,routeIds,priority,fallback:false});
  };
  if(t.index===0) {
    zone('water',['brook-bridge'],'溪水溅起小水花',2.6,30);
    zone('water',['lily-step-bridge'],'睡莲溪轻轻接住你',2.6,30);
    zone('bush',['willow-meadow','windmill-flower-loop'],'蓬松花丛接住小猫',1.8,10);
  }
  if(t.index===2)for(const id of ['twin-arches','canal-balustrade'])zone('water',[id],'运河里扑通一声',2.8,30);
  if(t.index===3) {
    for(const id of ['ravine-log','shepherd-log'])zone('water',[id],'山溪溅起亮晶晶的水花',2.8,30);
    zone('bush',['sunny-pasture','clover-pasture-loop'],'三叶草丛沙沙响',1.8,10);
  }
  if(t.index===7) {
    zone('indoor',['hearth-attic'],'落回暖炉旁的软地毯',2.8,20);
    for(const id of ['snow-pine-bridge','frost-fence-walk'])zone('water',[id],'冰湖溅起雪色水花',2.8,30);
  }
  if(t.index===9)zone('indoor',['library-interior','library-sky-dock'],'书室软垫轻轻接住你',2.8,20);
  const fallbackType=[0,2,3,5,7].includes(t.index)?'bush':[1,4].includes(t.index)?'indoor':'cloud';
  const label=['花丛沙沙接住你','落回客厅软地毯','街角花坛接住你','牧场灌木接住你','落回厨房软垫','屋顶软篷接住你','胖云轻轻托住你','蓬松雪堆接住你','星云轻轻托住你','庆典彩云接住你'][t.index];
  const nominalY=minY-(fallbackType==='cloud'?6:fallbackType==='indoor'?2.8:2.5);
  // Keep broad foundations below the water/catch patches laid into them. A low
  // fallback must never steal a water contact before the ball reaches its surface.
  const y=t.fallZones.length?Math.min(nominalY,...t.fallZones.map(z=>z.y-.35)):nominalY;
  const variant={2:'flowerbed',5:'awning',7:'snow',8:'starlight',9:'starlight'}[t.index];
  t.fallZones.push({id:`${t.id}-fallback`,type:fallbackType,...bounds(all,20),y,triggerY:y,label,routeIds:[],priority:0,fallback:true,...(variant?{variant}:{})});
}

function authorClimbAssists(t) {
  // A downhill rug feeds a visible ribbon pad before the long book ascent;
  // the ice bowl keeps its momentum-dependent return bank, with a rescue pad
  // partway uphill so a careful player is never stranded after braking.
  for(const id of t.index===1?['book-ramp']:t.index===7?['window-bowl']:[]) {
    const r=t.routes.find(r=>r.id===id), candidates=[];
    for(let i=1;i<r.points.length-1;i++) {
      const a=r.points[i-1],b=r.points[i+1],run=Math.hypot(b.x-a.x,b.z-a.z);
      if((b.y-a.y)/run>Math.tan(8*Math.PI/180))candidates.push(i);
    }
    // Ice keeps its momentum challenge, with a final rescue ribbon covering
    // the steep lip after the first two pads instead of stranding a slow ball.
    for(const fraction of t.index===7?[.2,.65,.98]:[.2,.65]) {
      const index=candidates[Math.floor((candidates.length-1)*fraction)];
      if(index===undefined)continue;
      const p=r.points[index],a=r.points[index-1],b=r.points[index+1],n=Math.hypot(b.x-a.x,b.z-a.z)||1;
      const force=fraction>.9?5.5:11;
      t.boosts.push({id:`${t.id}-climb-ribbon-${t.boosts.length}`,x:p.x,y:p.y,z:p.z,w:4.4,d:5.5,fx:(b.x-a.x)/n*force,fz:(b.z-a.z)/n*force,role:'climb-assist',routeId:id});
    }
  }
}

function insertSurfaceStretch(t,routeId,kind,length) {
  const index=t.routes.findIndex(r=>r.id===routeId),original=t.routes[index],total=polylineLength(original.points);
  const start=total*.38,end=Math.min(total*.8,start+length),cuts=[0,start,end,total],parts=[];
  const distances=[0];
  for(let i=1;i<original.points.length;i++){const a=original.points[i-1],b=original.points[i];distances.push(distances.at(-1)+Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z));}
  for(let i=0;i<3;i++) {
    const points=[samplePath(original.points,cuts[i]),...original.points.filter((_,j)=>distances[j]>cuts[i]+1e-6&&distances[j]<cuts[i+1]-1e-6),samplePath(original.points,cuts[i+1])];
    parts.push({...original,id:i===0?original.id:`${original.id}-${i===1?kind:'exit'}`,kind:i===1?kind:original.kind,points});
  }
  t.routes.splice(index,1,...parts);
  const primary=t.primaryPath.findIndex(p=>p.type==='route'&&p.id===routeId);
  t.primaryPath.splice(primary,1,...parts.map(r=>({type:'route',id:r.id})));
}

function authorDetachedShortcut(t,scale) {
  if(![2,5].includes(t.index))return;
  const bakery=t.index===2,secret=t.routes.find(r=>r.id===(bakery?'awning-shortcut':'chimney-shortcut'));
  const parent=t.routes.find(r=>r.id===(bakery?'twin-arches':'roof-bank'));
  const anchor={x:9*scale,z:(bakery?-38:-24)*scale},points=parent.points;
  let index=0;
  for(let i=1;i<points.length;i++)if(Math.hypot(points[i].x-anchor.x,points[i].z-anchor.z)<Math.hypot(points[index].x-anchor.x,points[index].z-anchor.z))index=i;
  const p=points[index],a=points[Math.max(0,index-1)],b=points[Math.min(points.length-1,index+1)],length=Math.hypot(b.x-a.x,b.z-a.z)||1;
  const nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length,target=secret.points[0];
  const side=Math.sign((target.x-p.x)*nx+(target.z-p.z)*nz)||1,offset=parent.width*.35;
  const takeoff={x:p.x+nx*offset*side,z:p.z+nz*offset*side};
  const surface=nearestRouteSurface([parent],takeoff.x,takeoff.z,Infinity);
  takeoff.y=surface?.y??p.y;
  let helper;
  if(bakery) {
    helper=t.props.find(p=>p.variant==='bakery_awning');
    Object.assign(helper,takeoff,{target:{...target},flightTime:.9,r:.4},computeLaunchVelocity(takeoff,target,.9));
    const returning=t.routes.find(r=>r.id==='festival-banner').points.at(-1);
    launch(t,'willow_branch',{...secret.points.at(-1)},{...returning},.9,{optional:true,variant:'bakery_awning_return',r:.55,actIndex:1});
  } else {
    helper=launch(t,'wind_cloud',takeoff,{...target},.9,{optional:true,variant:'chimney_takeoff',r:.4,actIndex:1});
  }
  helper.offCenter=true;
  helper.secretEntry=true;
}

function finishAuthoredStage(t) {
  addCourseFinale(t);
  if(t.index===1) {
    const seen=new WeakSet(),height=p=>{if(p&&typeof p==='object'&&Number.isFinite(p.y)&&!seen.has(p)){seen.add(p);p.y=4+(p.y-4)*.8;}};
    for(const list of [t.routes,t.chutes])for(const p of list){for(const point of p.points)height(point);height(p.center);height(p.receiving);if(p.drop)p.drop*=.8;}
    for(const list of [t.platforms,t.props,t.mushrooms,t.gears,t.hammers,t.landmarks,t.cameraZones])for(const p of list){height(p);height(p.target);}
    height(t.finish);height(t.originalFinish);t.start.y=4+(t.start.y-.62-4)*.8+.62;
  }
  // Scale horizontal dimensions only; all elevation differences and ball-sized widths
  // remain intentional. Launch impulses are solved again after scaling.
  let primaryRoutes=t.routes.filter(r=>!r.secret);
  const measured=(scale)=>{
    let length=0;
    for(const path of [...primaryRoutes,...t.chutes])for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i];length+=Math.hypot((b.x-a.x)*scale,b.y-a.y,(b.z-a.z)*scale);
    }
    return length;
  };
  let lo=.05,hi=12;
  for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(measured(mid)<COURSE_LENGTH_TARGETS[t.index])lo=mid;else hi=mid;}
  const scale=(lo+hi)/2;
  const seen=new WeakSet();
  const scalePoint=(p)=>{if(p&&typeof p==='object'&&!seen.has(p)&&Number.isFinite(p.x)&&Number.isFinite(p.z)){seen.add(p);p.x*=scale;p.z*=scale;}};
  for(const r of t.routes)for(const p of r.points)scalePoint(p);
  for(const c of t.chutes){for(const p of c.points)scalePoint(p);scalePoint(c.center);scalePoint(c.receiving);c.radius*=scale;}
  for(const list of [t.platforms,t.props,t.mushrooms,t.gears,t.hammers,t.landmarks,t.cameraZones,t.boosts])for(const p of list){scalePoint(p);scalePoint(p.target);}
  scalePoint(t.start);scalePoint(t.finish);
  scalePoint(t.originalFinish);
  for(const p of [...t.props,...t.mushrooms])if(p.target&&p.flightTime)Object.assign(p,computeLaunchVelocity(p,p.target,p.flightTime));
  for(const z of t.cameraZones)z.r=Math.max(z.r,z.r*scale*.85);
  for(const p of t.platforms){if(p.role.includes('island')){
    // Keep receivers generous without extending the upper island backwards
    // through the preceding launch arc. The authored 16m island is the cap.
    p.w=Math.min(16,Math.max(p.w,p.w*Math.min(scale,1.4)));
    p.d=Math.min(16,Math.max(p.d,p.d*Math.min(scale,1.4)));
  }}
  if(t.index===3)insertSurfaceStretch(t,'clover-pasture-loop','mud',8);
  if(t.index===4)insertSurfaceStretch(t,'sugar-cookie-slalom','honey',11);
  primaryRoutes=t.routes.filter(r=>!r.secret);
  for(const r of primaryRoutes.filter(r=>r.width<=2.6)){
    for(let i=0;i<r.points.length;i+=Math.max(1,Math.floor(r.points.length/4))){
      const p=r.points[i];
      if(!t.cameraZones.some(z=>Math.hypot(p.x-z.x,p.z-z.z)<z.r*.65&&p.y>=z.minY&&p.y<=z.maxY))orbit(t,{...p},7);
    }
  }
  t.length=[...primaryRoutes,...t.chutes].reduce((sum,p)=>sum+polylineLength(p.points),0);
  t.lengthMeters=t.length;
  t.sections=t.routes.filter(r=>!r.secret).map(r=>({id:r.id,name:r.section,kind:r.kind,start:{...r.points[0]},end:{...r.points.at(-1)},center:{...r.points[Math.floor(r.points.length/2)]}}));
  t.route=[];
  for(const step of t.primaryPath){
    if(step.type==='route'){
      const r=t.routes.find(r=>r.id===step.id);
      for(let i=0;i<r.points.length;i+=Math.max(1,Math.floor(r.points.length/12)))t.route.push({...r.points[i],kind:'surface',routeId:r.id});
      t.route.push({...r.points.at(-1),kind:'surface',routeId:r.id});
    }else if(step.type==='chute'){
      const c=t.chutes.find(c=>c.id===step.id);
      t.route.push({...c.points[0],kind:'chute',chuteId:c.id},{...c.receiving,kind:'chute_exit',chuteId:c.id});
    }else if(!step.optional){
      const p=step.type==='mushroom'?t.mushrooms.find(p=>p.id===step.id):t.props.find(p=>p.id===step.id);
      t.route.push({...P(p.x,p.y,p.z),kind:'launch',propId:p.id},{...p.target,kind:'landing',propId:p.id});
    }
  }
  const first=t.routes[0].points[0];
  plaza(t,P(first.x,first.y,first.z),t.routes[0].kind,8,8,'start');
  plaza(t,{...t.finish},t.routes.at(-1).kind,9,9,'finish');
  // Checkpoints and candy follow the primary route, never inaccessible scenery.
  for(let i=0;i<primaryRoutes.length;i++){
    const r=primaryRoutes[i],mid=r.points[Math.floor(r.points.length*.55)];
    t.stars.push({...mid,y:mid.y+1.05});
  }
  authorCoursePacing(t);
  authorFallZones(t);
  authorClimbAssists(t);
  // Detached landing mouths must use the exact Float32 center vertex rendered
  // by Three.js; a double endpoint can otherwise sit a micron beyond its cap.
  for(const r of t.routes.filter(r=>r.detached))for(const p of [r.points[0],r.points.at(-1)])for(const axis of ['x','y','z'])p[axis]=Math.fround(p[axis]);
  prepareRouteGeometry(t.routes,t.chutes);
  authorDetachedShortcut(t,scale);
  t.tips=[{...P(first.x,first.y,first.z),r:4,msg:t.index===0?'🐾 WASD / 方向键推球；拖动视角，轻轻试试花谷弯道！':`✨ ${t.subtitle}`}];
  return t;
}

export const TRACKS = [dawnValley(),livingRoom(),bakeryStreet(),treePasture(),sweetKitchen(),clocktowerRoofs(),skyIslands(),frostAttic(),starlightLibrary(),grandFestival()].map(finishAuthoredStage);

export const DEFAULT_SAVE = {
  schemaVersion: 3,
  selectedCat: "witch_black",
  unlockedCats: ["witch_black"],
  clearedTracks: [],
  totalStars: 0,
  bestTourneyTime: 0,
  bestTrackTimes: {},
  bestSingleRemain: 0,
  secretsFound: 0,
  noPopClears: 0,
  sharedCount: 0,
  mouseSens: 1.0,
};

export function migrateV3Save(data = {}) {
  const saved = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const result = { ...DEFAULT_SAVE, ...saved, schemaVersion: 3,
    unlockedCats: [...(saved.unlockedCats || DEFAULT_SAVE.unlockedCats)],
    clearedTracks: [...(saved.clearedTracks || [])], bestTrackTimes: { ...(saved.bestTrackTimes || {}) } };
  if (saved.schemaVersion !== 3) {
    // Old course IDs overlap new IDs at different stage numbers (clockwork,
    // aurora). Read the original map once, so no result overwrites another.
    const oldIds = ['academy','garden','honey','mushroom_canyon','gear_outpost',
      'belfry','clockwork','frost_slide','aurora','sky_finale'];
    result.bestTrackTimes = {};
    oldIds.forEach((id, index) => {
      const time = saved.bestTrackTimes?.[id];
      if (Number.isFinite(time)) result.bestTrackTimes[TRACKS[index].id] = time;
    });
  }
  return result;
}
