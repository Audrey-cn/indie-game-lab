import { polylineLength, computeLaunchVelocity, prepareRouteGeometry, samplePath, nearestRouteSurface } from "./course-math.mjs";
import { createStyledChute } from './chute-styles.mjs';
import { mudSpecForStage, sampleDryCurveStars } from './mud-curve.mjs';
import { difficultyProfileForStage, placeLaneBlockingHazards } from './lane-difficulty.mjs';

// Meowball Rush v4.1.0 — kinetic chutes, winding dry lines and real lane choices.

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
    unlockText: "通关第 4 关【参天古树速降山谷】解锁",
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
// Seven original adventures retain their pacing targets and authored extensions.
// Flagships bypass horizontal normalization to preserve their compact vertical dioramas.
export const COURSE_LENGTH_TARGETS = [600, 690, 790, 900, 1030, 1170, 1310, 1450, 1600, 1750];
export const STAGE_CHUTE_STYLES = ['rollercoaster','banked_slalom','rollercoaster','helix','helix','corkscrew_drop','rollercoaster','banked_slalom','corkscrew_drop','corkscrew_drop'];
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
    routes: [], platforms: [], chutes: [], portals: [], props: [], cameraZones: [], primaryPath: [], landmarks: [],
    boosts: [], mushrooms: [], gears: [], hammers: [], rollingPins: [], spikes: [], bumpers: [], steamVents: [], stars: [], checkpoints: [], tips: [],
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
  const spec = { id, material, center: { ...center }, radius, drop, turns, width: 3.6, speed: 13 + t.index * 0.55, exitSpeed:6, brakeDistance:12, entryRadius: 1.8 };
  // The oak and honey tube retain their exact approved circular cores. Every
  // other stage uses the module's independently shaped, signed-bank sweep.
  const style=STAGE_CHUTE_STYLES[t.index];
  const c = style==='helix' ? {...spec,style,points,bankProfile:points.map(()=>0),receiving:{...points.at(-1)}}
    : createStyledChute({...spec,style,start:points[0],end:points.at(-1),steps:288});
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
  const t = makeStage(1,'garden','02 · 魔女客厅大冒险','indoor_home','编织地毯 · 书本斜坡 · 青玻璃倾斜回转与玩具火车','stage02-cozy-living-room');
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
// v4 flagships keep their approved compact footprints. Elevations are never
// stretched, and all six acts live inside the same vertically layered diorama.
function flagship(t, id, tiers, blueprint, acts, anchors) {
  Object.assign(t,{flagship:id,tiers,blueprint:`docs/concept-art/v4-flagship/${blueprint}.jpg`,
    unlockedByDefault:true,flagshipActs:acts,worldAnchors:anchors,portals:[]});
  return t;
}
function treePasture() {
  const t=flagship(makeStage(3,'mushroom','04 · 参天古树速降山谷','grounded_nature',
    '42米古橡树 · 冠层藤桥 · 540°萤火树洞 · 瀑布羊牧场','stage04-treehouse-pasture'),
    'B',[36,18,2],'flagship-b-giant-tree-descent',
    ['树屋冠层起跑','苔枝速降与藤桥','540°萤火树洞','钟摆露台与胖云','瀑布谷地与羊群','柳叶软垫花门'],
    {oak:{x:0,y:0,z:0,height:42,radius:9},treehouse:P(-18,36,14),waterfall:{x:34,y:2,z:12,height:27},valley:P(10,2,26)});
  const c=chute(t,'hollow-oak','oak',P(0,30,0),6,12,1.5,0);c.actIndex=2;
  route(t,'canopy-treehouse','canopy_treehouse','wood',7.2,[P(-18,36,14),P(-8,36,22),P(2,35.5,24)],{actIndex:0});
  route(t,'mossy-branch-dive','mossy_tree_branch','grass',7.2,[P(2,35.5,24),P(17,34,17),P(24,32,0),P(17,30.5,-16),P(12,30,-28),P(6,30,-28),P(6,30,-20)],{actIndex:1,bank:.28});
  route(t,'vine-suspension','vine_suspension_bridge','wood',3,[P(6,30,-20),P(6,30,-12),c.points[0]],{actIndex:1,walls:false});
  orbit(t,P(6,30,-13),12);ride(t,c);
  route(t,'trunk-terrace','mid_trunk_terrace','wood',4.4,[c.receiving,P(-6,18,-17),P(8,18,-23),P(22,18,-18)],{actIndex:3});
  launch(t,'wind_cloud',P(22,18,-18),P(32,14,-4),1.6,{r:1.25,actIndex:3});
  plaza(t,P(32,14,-4),'grass',10,10,'waterfall-cloud-receiver');
  route(t,'waterfall-descent','waterfall_meadow_descent','grass',7.2,[P(32,14,-4),P(36.5,14,2.3),P(39,10,12),P(35,4,22),P(32,2,26.7272727),P(25,2,28)],{actIndex:4});
  route(t,'sunny-pasture','sunny_pasture','grass',7.2,[P(25,2,28),P(14,2,30),P(3,2,28),P(-7,2,21)],{actIndex:4});
  prop(t,'sheep',P(14,2,32.5),{r:1.05,patrol:1.15,speed:.8});
  prop(t,'sheep',P(3,2,30.5),{r:1.05,patrol:1.1,speed:.7,phase:2});
  launch(t,'willow_branch',P(-7,2,21),P(-10,2,36),1.6,{r:1.15,actIndex:5,variant:'mossy_cushion'});
  plaza(t,P(-10,2,36),'grass',8,8,'willow-cushion-receiver');
  route(t,'flower-arch-meadow','flower_arch_meadow','grass',6.8,[P(-10,2,36),P(-11,2,43),P(-3,2,47),P(8,2,45)],{actIndex:5});
  landmark(t,'giant_oak',P(0,0,0),{height:42,radius:9});landmark(t,'waterfall',P(34,2,12),{height:27});
  landmark(t,'treehouse',P(-18,36,14));landmark(t,'willow',P(-10,2,20));
  t.start=P(-18,36.62,14);t.finish=P(8,2,45);t.goalStyle='flower_arch';return t;
}
function sweetKitchen() {
  const t=flagship(makeStage(4,'clockwork','05 · 厨房一角三层微缩','indoor_home',
    '高柜香料架 · 木勺滑降 · 蜂蜜管直潜桌下 · 蒸汽蛋糕塔','stage05-sweet-kitchen'),
    'A',[24,12,1.5],'flagship-a-kitchen-3tier',
    ['高柜香料架','木勺滑降与煎饼','吐司飞跃与砧板','琥珀蜂蜜旋滑','巨桌下的饼干迷宫','蒸汽升空蛋糕塔'],
    {table:{x:0,y:12,z:0,w:36,d:26},cabinet:P(-15,24,-26),sink:P(-18,12,-6),cake:P(-7,12,26),room:{minX:-31,maxX:32,minZ:-33,maxZ:32}});
  const c=chute(t,'amber-honey','honey',P(18,12,-6),4.8,10.5,1,0);c.actIndex=3;
  route(t,'wall-cabinet-shelf','wall_cabinet_shelf','wood',4.4,[P(-22,24,-24),P(-10,24,-24),P(3,24,-24),P(15,24,-22)],{actIndex:0});
  route(t,'wooden-spoon-slide','wooden_spoon_downhill','wood',6.8,[P(15,24,-22),P(25,22,-17),P(28,18,-4),P(24,14,10),P(14,12,16),P(4,12,15)],{actIndex:1,bank:.25});
  route(t,'sunlit-counter','sunlit_kitchen_counter','wood',6.8,[P(4,12,15),P(-7,12,14),P(-17,12,8),P(-20,12,0)],{actIndex:1});
  prop(t,'turntable',P(-15,12,9),{r:2.0,omega:.65,variant:'pancake'});
  plaza(t,P(-20,12,0),'wood',7,7,'toaster-dock');
  launch(t,'toaster',P(-20,12,0),P(-16,12,-12),1.5,{r:1.15,actIndex:2});
  plaza(t,P(-16,12,-12),'wood',7,7,'sink-receiver');
  // The airborne toast landing and the cutting board share one authored curve.
  // Splitting its samples preserves the exact tangent while the deck narrows.
  const sinkRunout=smoothPath([P(-16,12,-12),P(-12,12,-24),P(0,12,-28),P(14,12,-28),P(22.8,12,-23),P(22.8,12,-17),c.points[0]]);
  const boardStart=sinkRunout.findLastIndex(p=>p.z<-20);
  const runout=route(t,'toaster-runout','toaster_sink_runout','wood',6.8,[sinkRunout[0],sinkRunout[boardStart]],{actIndex:2});runout.points=sinkRunout.slice(0,boardStart+1);
  const board=route(t,'cutting-board','narrow_cutting_board','wood',3,[sinkRunout[boardStart],c.points[0]],{actIndex:2,walls:false,slowZone:{kind:'honey',drySide:-1,dryWidth:1.5}});board.points=sinkRunout.slice(boardStart);
  for(const p of [P(-10,12,-15),P(2,12,-16),P(16,12,-15)])orbit(t,p,9);
  ride(t,c);
  const floorWeave=smoothPath([c.receiving,P(22.8,1.5,6),P(22.8,1.5,10),P(16,1.5,13),P(4,1.5,9),P(-7,1.5,0),P(-7,1.5,-10),P(3,1.5,-16),P(17,1.5,-15),P(29,1.5,-8),P(32,1.5,4),P(29,1.5,15),P(22,1.5,22)]);
  const mazeStart=floorWeave.findIndex(p=>p.x<-6&&p.z<0);
  const under=route(t,'under-table-dive','under_table_weave','wood',4.4,[floorWeave[0],floorWeave[mazeStart]],{actIndex:4});under.points=floorWeave.slice(0,mazeStart+1);
  const maze=route(t,'cookie-tin-maze','cookie_tin_floor_maze','wood',4.4,[floorWeave[mazeStart],floorWeave.at(-1)],{actIndex:4});maze.points=floorWeave.slice(mazeStart);
  prop(t,'toy_mouse',P(-7,1.5,0),{r:.85,fx:0,fz:-3});
  const steam=launch(t,'steam_vent',P(22,1.5,22),P(8,12,26),1.4,{r:1.25,actIndex:5});
  t.steamVents.push({...steam,period:1,duty:1});
  plaza(t,P(8,12,26),'wood',8,8,'cake-tower-receiver');
  route(t,'cake-tower','strawberry_cake','wood',6.8,[P(8,12,26),P(0,12,26),P(-7,12,26)],{actIndex:5});
  landmark(t,'dining_table',P(0,12,0),{w:36,d:26});landmark(t,'kitchen_counter',P(-18,12,-5));
  landmark(t,'wall_cabinet',P(-15,24,-26));landmark(t,'cake',P(-7,12,26));
  t.start=P(-22,24.62,-24);t.finish=P(-7,12,26);t.goalStyle='strawberry_cake';return t;
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
  const t=makeStage(6,'foundry','07 · 浮空云海跳岛','sky_floating','三级翡翠岛 · 蘑菇胖云弹射 · 彩虹波浪丘与无栏云桥','stage07-sky-cloud-islands');
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
  const t=makeStage(7,'aurora','08 · 冬日暖炉与冰川阁楼','hybrid_winter','暖炉阁楼 · 冰雪半管 · 冰晶雪橇回转与极光木屋','stage08-hearth-frost-attic');
  const c=chute(t,'turquoise-ice','ice',P(28,12,-38),6,4.5,1.25,Math.PI);
  route(t,'hearth-attic','fireplace_attic','wood',6.6,[P(0,13,0),P(2,13,-7),P(8,13,-12)]);
  // Give the banked U-turn a real radius: a single sharp control pinched the
  // inner bank into the bubble's view at a legal edge station.
  route(t,'window-bowl','icy_halfpipe_bowl','ice',7.6,[P(8,13,-12),P(15,9,-16),P(23,7.5,-13),P(31,7.5,-20),P(31,7.7,-22),P(29.24,8.8,-26.24),P(25,10.3,-28),P(22,11.4,-28),P(22,12,-30),c.points[0]],{bank:1.0});
  prop(t,'snow_bunny',P(26,7.5,-15),{patrol:2.4,speed:1.1,r:1.05});prop(t,'penguin',P(31,7.7,-25),{patrol:2,speed:1.35,r:1.05});ride(t,c);
  const exit=c.points.at(-1),before=c.points.at(-2),exitN=Math.hypot(exit.x-before.x,exit.z-before.z),ex=(exit.x-before.x)/exitN,ez=(exit.z-before.z)/exitN;
  const bridgeEnd=P(exit.x+ex*12,8,exit.z+ez*12);
  route(t,'snow-pine-bridge','snow_pine_bridge','wood',2.6,[c.receiving,P(exit.x+ex*6,7.5,exit.z+ez*6),bridgeEnd]);orbit(t,P(39,7.5,-44),8);
  route(t,'aurora-lodge','aurora_lodge','ice',5.8,[bridgeEnd,P(bridgeEnd.x+ex*8,8.3,bridgeEnd.z+ez*8),P(62,8.6,-54),P(64,8.8,-44),P(55,9,-36)]);
  landmark(t,'fireplace',P(-4,13,-4));landmark(t,'window',P(8,13,-12));landmark(t,'lodge',P(55,9,-36));
  t.start=P(0,13.62,0);t.finish=P(55,9,-36);t.goalStyle='aurora_lodge';return t;
}
function starlightLibrary() {
  const t=flagship(makeStage(8,'prism','09 · 星际宇宙传送城','cosmic_warp',
    '蓝色星港池 · 高空星环 · 玩具列车 · 三色传送观星穹顶','stage09-starlight-library'),
    'C',[8,28,16,22],'flagship-c-cosmic-warp-city',
    ['星港弹珠广场','蓝门与高空星环','水晶梁星摆','金门玩具列车','彩虹俯冲鞭转与紫门','皇家观星穹顶'],
    {city:P(0,8,16),ring:{x:0,y:28,z:0,radius:24},station:P(16,16,-18),observatory:P(15,22,32)});
  const portal=(id,color,entry,exit)=>{const p={id,label:`${id} → ${id}′`,color,entry:{...entry,r:1.5},exit:{...exit,speed:7}};t.portals.push(p);t.primaryPath.push({type:'portal',id});return p;};
  route(t,'starport-plaza','starport_plaza','crystal',7.2,[P(-18,8,28),P(-9,8,24),P(0,8,25),P(10,8,22)],{actIndex:0});
  portal('A',0x49cfff,P(10,8,22),{...P(-24,28,0),yaw:0});
  const ring=[];for(let i=0;i<=90;i++){const a=Math.PI+Math.PI*1.5*i/90;ring.push(P(24*Math.cos(a),28,24*Math.sin(a)));}
  route(t,'high-star-ring','high_banked_starlight_ring','crystal',6.8,ring,{actIndex:1,bank:.7});
  route(t,'crystal-beam','narrow_crystal_beam','crystal',3,[ring.at(-1),P(-7,28,24),P(-15,28,16),P(-18,28,6)],{actIndex:2,walls:false,slowZone:{kind:'mud',drySide:-1,dryWidth:1.5}});
  orbit(t,P(-8,28,16),12);orbit(t,P(-17,28,7),8);
  portal('B',0xffd66a,P(-18,28,6),{...P(16,16,-18),yaw:Math.PI});
  const c=chute(t,'iridescent-rainbow','rainbow',P(38,16,8),5,6,1,-Math.PI/2);c.actIndex=4;
  route(t,'toy-train-skyway','toy_train_skyway','wood',4.4,[P(16,16,-18),P(16,16,-8),P(20,16,0),P(27,16,3),c.points[0]],{actIndex:3});
  ride(t,c);
  route(t,'purple-portal-dock','purple_portal_dock','crystal',4.4,[c.receiving,P(37,10,3),P(32,10,10),P(40,10,20),P(49,10,12)],{actIndex:4});
  portal('C',0xc987ff,P(49,10,12),{...P(28,22,32),yaw:Math.PI/2});
  route(t,'observatory-dome','observatory_dome','crystal',6.8,[P(28,22,32),P(22,22,32),P(15,22,32)],{actIndex:5});
  for(const p of t.portals){plaza(t,p.entry,'crystal',7,7,`portal-${p.id}-entry`);plaza(t,p.exit,'crystal',8,8,`portal-${p.id}-exit`);}
  landmark(t,'cosmic_city',P(0,8,16));landmark(t,'toy_station',P(16,16,-18));landmark(t,'observatory',P(15,22,32));
  t.start=P(-18,8.62,28);t.finish=P(15,22,32);t.goalStyle='observatory_dome';return t;
}
function grandFestival() {
  const t=makeStage(9,'sanctum','10 · 魔女大庆典总决赛','grand_medley','花谷街灯 · 图书室飞跃 · 彩虹俯冲鞭转与皇家星桥','stage10-grand-festival-finale');
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
  { palette:[0x8ed6ac,0xffc9ed,0xe7e8ff], surfacePattern:'cloud_stars',edgeStyle:'cloud_rope',lighting:'opalescent_sunrise',acts:['三级翡翠岛','彩虹波浪丘','云桥微操','晨星神殿'] },
  { palette:[0x99e5ee,0xd1a372,0xceb7f7], surfacePattern:'frost_crystals',edgeStyle:'frost_rail',lighting:'hearth_aurora',acts:['暖炉阁楼','冰碗与雪橇回转','雪松桥微控','极光湖畔'] },
  { palette:[0x9bd7f4,0xd6b3f0,0xffdf8d], surfacePattern:'cosmic_stars',edgeStyle:'starlight_ring',lighting:'pastel_cosmic_twilight',acts:['星港广场','传送星环','玩具列车','皇家观星穹顶'] },
  { palette:[0xd19cdb,0xf2cf76,0x93d8d2], surfacePattern:'royal_stars',edgeStyle:'royal_gold',lighting:'festival_twilight',acts:['花谷街灯','图书室飞跃','皇家俯冲鞭转','魔女加冕礼'] },
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

// Two new acts carry their own geometry and mechanics. They leave the original
// signature deck on its arriving tangent and keep advancing away from the core,
// so extending play time never duplicates a floor or creates intersecting rails.
const ADVENTURE_ACT_NAMES = [
  ['彩虹波浪丘与柳叶飞跃','木桩微操与花田冲线'],
  ['玩具弹簧与书脊山丘','积木窄廊与窗光巡游'],
  ['风车面包与运河波浪丘','桶阵石街与钟声冲线'],
  ['蘑菇山丘与牧场弹珠','树篱窄道与牧羊庆典'],
  ['奶酪弹珠与饼干山丘','香料窄廊与甜点冲刺'],
  ['铜钟摆与坡屋顶集市','钟楼窄脊与晚霞冲线'],
  ['云垫弹珠与彩虹丘','星云微操与风车巡游'],
  ['雪松弹珠与冰雪山丘','雪桥微操与暖灯冲线'],
  ['书页山丘与星辉钟摆','书脊微操与观星巡游'],
  ['十界弹珠与庆典山丘','皇家微操与星冠冲线'],
];
function addAdventureActs(t) {
  const previous=t.routes.filter(r=>!r.secret).at(-1),origin={...t.finish};
  const end=previous.points.at(-1),before=previous.points.at(-2),norm=Math.hypot(end.x-before.x,end.z-before.z)||1;
  const fx=(end.x-before.x)/norm,fz=(end.z-before.z)/norm,nx=-fz,nz=fx;
  const at=(forward,side=0,rise=0)=>P(origin.x+fx*forward+nx*side,origin.y+rise,origin.z+fz*forward+nz*side);
  const indoor=t.worldType==='indoor_home',kind=indoor?'wood':t.index===7?'ice':t.index>=8?'crystal':t.worldType==='town_street'?'stone':'grass';
  const add=(suffix,width,controls,act,extra={})=>route(t,`${t.id}-adventure-${suffix}`,suffix,kind,width,controls,{extension:true,adventureAct:act,...extra});
  add('rolling-hills',6.8,[origin,at(12,0,.2),at(25,3,1.7),at(41,-2,2.6),at(58,0,1.2)],4);
  add('momentum-lane',4.4,[at(58,0,1.2),at(72,-3,1.2),at(88,-1,1.2),at(103,0,1.2)],4);
  let next=at(103,0,1.2);
  if(t.index===0||t.index===2||t.index===5) {
    // Stage 01's welcoming mini-slide and Stage 03's bakery spiral introduce a
    // visible capture mouth, smooth height drop and a generous receiving deck.
    const angle=Math.atan2(-fx,fz),radius=t.index===0?3.8:4.8,turns=1;
    const center=P(next.x+fx*5-radius*Math.cos(angle),next.y,next.z+fz*5-radius*Math.sin(angle));
    const c=chute(t,`${t.id}-garden-spiral`,t.index===0?'rainbow':'glass',center,radius,t.index===0?2.0:3.4,turns,angle);
    // A gentle real downhill runway starts the ride. Besides adding momentum,
    // this avoids coplanar Float32 slivers where the road's eight-column mouth
    // meets the sixteen-column bowl at an oblique world-space angle.
    for(let i=1;i<c.points.length;i++)c.points[i].y-=.035*Math.min(1,i/2);
    for(let i=c.points.length-2;i<c.points.length;i++)c.points[i].y-=.035*(i-(c.points.length-3))/2;
    c.drop+=.07;c.receiving={...c.points.at(-1)};
    // Re-author after the chute exists so route() supplies the same tangent
    // runway and eased cross-section used by every other helical entrance.
    // Replacing only an endpoint leaves an oblique final deck row crossing the
    // rising shell even when the center vertex itself is perfectly shared.
    t.routes.pop();t.primaryPath.pop();
    add('momentum-lane',4.4,[at(58,0,1.2),at(72,-3,1.2),at(88,-1,1.2),{...c.points[0]}],4);
    ride(t,c);next={...c.receiving};
    const exit=c.points.at(-1),prior=c.points.at(-2),n=Math.hypot(exit.x-prior.x,exit.z-prior.z)||1;
    // A separate runout follows the rail tangent before returning to the new
    // adventure's overall outward heading. This avoids a sharp mouth seam.
    const runout=P(exit.x+(exit.x-prior.x)/n*12,exit.y,exit.z+(exit.z-prior.z)/n*12);
    const offset=P(next.x+fx*26-nx*(t.index===5?18:0),next.y,next.z+fz*26-nz*(t.index===5?18:0));
    const turn=t.index===5?[P(runout.x-nx*9,runout.y,runout.z-nz*9),P(next.x-nx*18,next.y,next.z-nz*18)]:[];
    add('slide-runout',6.8,[next,runout,...turn,offset],4);next=offset;
  }
  // The final act has an unguarded wooden/cloud/stone precision passage between
  // two broad rooms. Its 2.8m nominal width always exceeds the full ball diameter.
  const local=(f,s=0,y=0)=>P(next.x+fx*f+nx*s,next.y+y,next.z+fz*f+nz*s);
  add('bumper-plaza',7.2,[next,local(15,0,.2),local(30,3,.7),local(44,0,.5)],5);
  add('precision-passage',2.8,[local(44,0,.5),local(57,0,.5),local(70,0,.5)],5,{walls:false,kind:indoor?'wood':t.index>=6?'cloud':'wood'});
  add('festival-sprint',6.8,[local(70,0,.5),local(84,-2,.2),local(100,1,.8),local(115,0,1.3)],5);
  t.finish={...local(115,0,1.3)};
  landmark(t,'act_gate',{...next},{label:ADVENTURE_ACT_NAMES[t.index][1]});
}

function authorAdventureMechanics(t) {
  for(const r of t.routes) {
    if(['mud','honey'].includes(r.kind)) {
      const sticky=r.kind;r.kind=t.worldType==='indoor_home'?'wood':'grass';
      r.slowZone={kind:sticky,drySide:t.index%2?1:-1,dryWidth:1.5};
    }
  }
  const lane=t.routes.find(r=>r.id===`${t.id}-adventure-momentum-lane`);
  // Sticky patches are optional skill choices on the *same* supported floor.
  // Their dry outer strip is continuous through the patch, never isolated stones.
  lane.slowZone={kind:t.worldType==='indoor_home'?'honey':'mud',drySide:t.index%2?1:-1,dryWidth:1.5};
  const hills=t.routes.find(r=>r.id===`${t.id}-adventure-rolling-hills`),plazaRoute=t.routes.find(r=>r.id===`${t.id}-adventure-bumper-plaza`);
  const floor=(r,d,offset=0)=>{
    const p=samplePath(r.points,polylineLength(r.points)*d),n=Math.hypot(p.tx,p.tz)||1;
    const x=p.x-p.tz/n*offset,z=p.z+p.tx/n*offset;
    return {...p,x,z,y:nearestRouteSurface([r],x,z,Infinity)?.y??p.y};
  };
  for(const [r,d] of [[hills,.27],[plazaRoute,.72]]) {
    const p=floor(r,d),force=t.index===0?4.5:5.4;
    t.boosts.push({id:`${t.id}-rainbow-boost-${t.boosts.length}`,x:p.x,y:p.y,z:p.z,w:Math.min(3.8,r.width-1),d:2.4,fx:p.tx*force,fz:p.tz*force,routeId:r.id,role:'adventure-rainbow'});
  }
  // Keep deliberate bouncy props distinct from the smooth rail constraint.
  const variant=t.worldType==='indoor_home'?(t.index===4?'cheese':'toy'):t.worldType==='town_street'?'barrel':'mushroom';
  for(const [fraction,side] of [[.28,-1],[.6,1]]) {
    const p=floor(plazaRoute,fraction,side*2.2);
    t.bumpers.push({id:`${t.id}-bouncy-${t.bumpers.length}`,x:p.x,y:p.y,z:p.z,r:.62,bounce:6,variant,routeId:plazaRoute.id});
  }
  // A small side plate keeps the open center line readable. Traps only occupy
  // one choice of lane and always leave room to wait, weave or pass safely.
  const spikeCount=t.index<2?1:2;
  for(let i=0;i<spikeCount;i++) {
    const p=floor(plazaRoute,.42+i*.18,(i%2?1:-1)*2.25);
    t.spikes.push({id:`${t.id}-spikes-${i}`,x:p.x,y:p.y,z:p.z,r:.7,phase:t.index*.37+i*1.1,telegraph:.55,activeDuration:1.1,retractDuration:1.8,routeId:plazaRoute.id});
  }
  if(t.index>=2) {
    const p=floor(hills,.64,2.9);
    t.hammers.push({id:`${t.id}-adventure-pendulum`,x:p.x,y:p.y+3.7,z:p.z,len:3.1,speed:1.15+t.index*.025,amp:.34,phase:Math.PI/2,axis:'z',variant:t.index>=6?'flail':'pendulum',routeId:hills.id});
    const q=floor(plazaRoute,.18,-2.65);
    t.rollingPins.push({id:`${t.id}-adventure-rolling-pin`,x:q.x,y:q.y+.53,z:q.z,width:1.45,r:.48,speed:1.1,phase:t.index*.6,ampZ:.25,routeId:plazaRoute.id});
  }
  // Fresh, gentle optional launches are early-course set pieces as well as
  // physical bouncy obstacles; the library keeps its three distinct book hops.
  if(t.index!==8) {
    const r=t.routes.find(r=>r.id===`${t.id}-adventure-rolling-hills`),a=floor(r,.09),b=floor(r,.16);
    const type=t.index===1||t.index===4?'toaster':t.index===6?'wind_cloud':'willow_branch';
    const helper=prop(t,type,P(a.x,a.y,a.z),{target:P(b.x,b.y,b.z),flightTime:.62,r:.62,optional:true,adventureAct:4});
    Object.assign(helper,computeLaunchVelocity(helper,helper.target,helper.flightTime));
    // Optional helper sits on the continuous floor and therefore does not add
    // a phantom mandatory gap to the itinerary.
  }
}

function authorCoursePacing(t) {
  const identity=COURSE_IDENTITIES[t.index], core=t.routes.filter(r=>!r.secret&&!r.extension);
  const coreActs=[
    [0,1,2],[0,0,1,2],[0,1,1,2,2],[0,1,2],[0,1,2,2],
    [0,0,1,2,2],[0,0,1,2,2],[0,1,2,2],[0,1,1,1,1,2,2],[0,0,1,1,2,2],
  ][t.index];
  t.visualIdentity={...identity,acts:[...identity.acts,...ADVENTURE_ACT_NAMES[t.index]],palette:[...identity.palette]};
  Object.assign(t,COURSE_LIGHTING[t.index]);
  t.acts=[...identity.acts,...ADVENTURE_ACT_NAMES[t.index]].map((name,i)=>({id:`${t.id}-act-${i+1}`,name,role:['opening','signature','microcontrol','celebration','adventure','finale'][i],routeIds:[],pathIds:[]}));
  for(const r of t.routes) {
    const index=core.indexOf(r);
    r.actIndex=r.adventureAct??(r.extension?3:r.secret?1:coreActs[index]);
    r.surfacePattern=identity.surfacePattern;
    r.edgeStyle=identity.edgeStyle;
    r.surfaceColor=identity.palette[0];
    r.accentColor=identity.palette[r.actIndex===3?2:1];
    if(!r.secret)t.acts[r.actIndex].routeIds.push(r.id);
  }
  let actIndex=0;
  for(const step of t.primaryPath) {
    if(step.type==='route')actIndex=t.routes.find(r=>r.id===step.id).actIndex;
    else if(step.type==='chute')actIndex=t.chutes.find(c=>c.id===step.id)?.id.includes('garden-spiral')?4:1;
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
      candidates.push({...c.receiving,progress,actIndex:c.id.includes('garden-spiral')?4:1});
    }
  }
  t.checkpoints=[];
  for(const fraction of [.16,.32,.49,.66,.83]) {
    const available=candidates.filter(p=>!t.checkpoints.some(cp=>Math.abs(cp.progress-p.progress)<t.length*.1));
    const candidate=available.reduce((best,p)=>!best||Math.abs(p.progress-t.length*fraction)<Math.abs(best.progress-t.length*fraction)?p:best,null);
    if(candidate)t.checkpoints.push({...candidate});
  }
  t.checkpoints.sort((a,b)=>a.progress-b.progress);
  const narrowLength=t.routes.filter(r=>!r.secret&&r.width<=2.6).reduce((sum,r)=>sum+polylineLength(r.points),0);
  const stickyTime=t.routes.reduce((sum,r)=>sum+polylineLength(r.points)*(r.kind==='honey'?.7:r.kind==='mud'?.45:0),0);
  t.parSeconds=Math.round(160+t.index*(135/9));
  t.bonusTime=Math.round(210+t.index*(150/9));
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

function finishFlagshipStage(t) {
  const primary=t.routes.filter(r=>!r.secret);
  t.length=t.lengthMeters=[...primary,...t.chutes].reduce((sum,p)=>sum+polylineLength(p.points),0);
  const identity=COURSE_IDENTITIES[t.index];
  t.visualIdentity={...identity,acts:[...t.flagshipActs],palette:[...identity.palette]};
  Object.assign(t,COURSE_LIGHTING[t.index]);
  if(t.flagship==='C')Object.assign(t,{skyTop:0x353269,skyBottom:0xeebcde,fogColor:0xa49bc8,sunColor:0xffe6cb});
  t.acts=t.flagshipActs.map((name,i)=>({id:`${t.id}-act-${i+1}`,name,role:['opening','signature','microcontrol','celebration','adventure','finale'][i],routeIds:[],pathIds:[],lengthMeters:0}));
  for(const r of t.routes){
    r.surfacePattern=identity.surfacePattern;r.edgeStyle=identity.edgeStyle;r.surfaceColor=identity.palette[0];r.accentColor=identity.palette[r.actIndex===5?2:1];
    t.acts[r.actIndex].routeIds.push(r.id);
  }
  t.route=[];const candidates=[];let progress=0,actIndex=0;
  for(const step of t.primaryPath){
    if(step.type==='route'){
      const r=t.routes.find(r=>r.id===step.id);actIndex=r.actIndex;
      const length=polylineLength(r.points);t.acts[actIndex].lengthMeters+=length;
      for(let d=0;d<length;d+=Math.max(.6,length/16)){
        const point=samplePath(r.points,d);t.route.push({...point,kind:'surface',routeId:r.id});
        if(r.width>=4)candidates.push({...point,progress:progress+d,actIndex});
      }
      t.route.push({...r.points.at(-1),kind:'surface',routeId:r.id});progress+=length;
    }else if(step.type==='chute'){
      const c=t.chutes.find(c=>c.id===step.id);actIndex=c.actIndex;
      const length=polylineLength(c.points);t.acts[actIndex].lengthMeters+=length;progress+=length;
      t.route.push({...c.points[0],kind:'chute',chuteId:c.id},{...c.receiving,kind:'chute_exit',chuteId:c.id});
      candidates.push({...c.receiving,progress,actIndex});
    }else if(step.type==='portal'){
      const p=t.portals.find(p=>p.id===step.id);
      t.route.push({...p.entry,kind:'portal',portalId:p.id},{...p.exit,kind:'portal_exit',portalId:p.id});
    }else{
      const p=t.props.find(p=>p.id===step.id);actIndex=p.actIndex??actIndex;
      t.route.push({...P(p.x,p.y,p.z),kind:'launch',propId:p.id},{...p.target,kind:'landing',propId:p.id});
    }
    step.actIndex=actIndex;t.acts[actIndex].pathIds.push(step.id);
  }
  const first=t.routes[0].points[0];
  plaza(t,P(first.x,first.y,first.z),t.routes[0].kind,8,8,'start');
  plaza(t,{...t.finish},t.routes.at(-1).kind,9,9,'finish');
  t.checkpoints=[];
  for(const fraction of [.16,.32,.49,.66,.83]){
    const free=candidates.filter(p=>!t.checkpoints.some(cp=>Math.abs(cp.progress-p.progress)<8));
    const candidate=free.reduce((best,p)=>!best||Math.abs(p.progress-t.length*fraction)<Math.abs(best.progress-t.length*fraction)?p:best,null);
    if(candidate)t.checkpoints.push({...candidate});
  }
  t.checkpoints.sort((a,b)=>a.progress-b.progress);
  for(const r of primary){const p=samplePath(r.points,polylineLength(r.points)*.55);t.stars.push({...p,y:p.y+1.05});}
  // All flagship samples use the renderer's Float32 coordinates. Mixing a
  // quantized cap with double-precision straight runways creates microscopic
  // sawtooth intersections where eight-column roads meet sixteen-column slides.
  for(const r of [...t.routes,...t.chutes])for(const p of r.points)for(const axis of ['x','y','z'])p[axis]=Math.fround(p[axis]);
  for(const c of t.chutes)c.receiving={...c.points.at(-1)};
  prepareRouteGeometry(t.routes,t.chutes);
  const floor=(r,fraction,offset=0)=>{
    const p=samplePath(r.points,polylineLength(r.points)*fraction),n=Math.hypot(p.tx,p.tz)||1;
    const x=p.x-p.tz/n*offset,z=p.z+p.tx/n*offset;
    return{...p,x,z,y:nearestRouteSurface([r],x,z,Infinity)?.y??p.y};
  };
  const broad=t.routes.find(r=>r.id===({A:'sunlit-counter',B:'sunny-pasture',C:'starport-plaza'}[t.flagship]));
  if(t.flagship==='B')t.routes.find(r=>r.id==='canopy-treehouse').slowZone={kind:'mud',drySide:-1,dryWidth:1.5};
  const boost=floor(broad,.2);t.boosts.push({id:`${t.id}-flagship-star-boost`,...P(boost.x,boost.y,boost.z),w:2.4,d:2.4,fx:boost.tx*3.4,fz:boost.tz*3.4,routeId:broad.id,role:'flagship-star'});
  for(const [f,side]of [[.37,-1],[.7,1]]){
    const p=floor(broad,f,side*2.6);t.bumpers.push({id:`${t.id}-flagship-bumper-${t.bumpers.length}`,x:p.x,y:p.y,z:p.z,r:.6,bounce:5.5,variant:t.flagship==='A'?'cheese':t.flagship==='C'?'star':'mushroom',routeId:broad.id});
  }
  const precision=t.routes.find(r=>r.width===3);
  for(const f of [.38,.68]){
    const p=floor(precision,f,1.18);t.spikes.push({id:`${t.id}-precision-spike-${t.spikes.length}`,x:p.x,y:p.y,z:p.z,r:.35,phase:t.index*.37+f,telegraph:.55,activeDuration:1.1,retractDuration:1.8,routeId:precision.id});
  }
  const pendulumRoute=t.flagship==='B'?t.routes.find(r=>r.id==='trunk-terrace'):precision;
  const pendulum=floor(pendulumRoute,.48,2.7);
  t.hammers.push({id:`${t.id}-gilded-pendulum`,x:pendulum.x,y:pendulum.y+3.8,z:pendulum.z,len:3.1,speed:1.25,amp:.34,phase:Math.PI/2,axis:'z',variant:t.flagship==='C'?'star':'pendulum',routeId:pendulumRoute.id});
  const roller=floor(broad,.52,2.8);t.rollingPins.push({id:`${t.id}-flagship-roller`,x:roller.x,y:roller.y+.53,z:roller.z,width:1.3,r:.48,speed:1.1,phase:t.index*.6,ampZ:.2,routeId:broad.id});
  for(const r of primary.filter(r=>r.width<=3))for(let d=0;d<=polylineLength(r.points);d+=5)orbit(t,samplePath(r.points,d),7);
  prepareRouteGeometry(t.routes,t.chutes);
  t.sections=primary.map(r=>({id:r.id,name:r.section,kind:r.kind,start:{...r.points[0]},end:{...r.points.at(-1)},center:{...r.points[Math.floor(r.points.length/2)]},...(r.slowZone?{slowZone:{...r.slowZone}}:{})}));
  authorFallZones(t);
  if(t.flagship==='B'){
    t.fallZones.push({id:'mushroom-waterfall-stream',type:'water',x:33,z:15,w:15,d:37,y:-.8,triggerY:-.8,label:'瀑布山溪溅起亮晶晶的水花',routeIds:['waterfall-descent'],priority:30,fallback:false});
  }
  t.bonusTime=t.flagship==='C'?360:300;t.parSeconds=Math.round(t.length/3.5+20);t.deathY=Math.min(...t.tiers)-14;
  t.tips=[{...P(first.x,first.y,first.z),r:4,msg:`🌟 v4.1 立体王牌 · ${t.subtitle}`}];
  return t;
}

function finishAuthoredStage(t) {
  if(t.flagship)return finishFlagshipStage(t);
  addCourseFinale(t);
  addAdventureActs(t);
  // Preserve broad rooms, medium rolling lanes and readable precision links.
  for(const r of t.routes){if(r.width<3.1)r.width=Math.max(2.7,Math.min(3,r.width+0.4));else if(r.width<5.2)r.width=Math.max(4,Math.min(4.8,r.width));else r.width=Math.max(6.2,Math.min(7.6,r.width));}
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
  for(const r of primaryRoutes.filter(r=>r.width<=3.0)){
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
  for(const r of [...t.routes,...t.chutes])for(const p of [r.points[0],r.points.at(-1)])for(const axis of ['x','y','z'])p[axis]=Math.fround(p[axis]);
  for(const c of t.chutes)c.receiving={...c.points.at(-1)};
  prepareRouteGeometry(t.routes,t.chutes);
  authorDetachedShortcut(t,scale);
  authorAdventureMechanics(t);
  // Slow-zone attributes and exact Float32 endpoints feed the shared floor cache.
  prepareRouteGeometry(t.routes,t.chutes);
  for(const section of t.sections){const r=t.routes.find(r=>r.id===section.id);section.kind=r.kind;if(r.slowZone)section.slowZone={...r.slowZone};}
  t.tips=[{...P(first.x,first.y,first.z),r:4,msg:t.index===0?'🐾 WASD / 方向键推球；拖动视角，轻轻试试花谷弯道！':`✨ ${t.subtitle}`}];
  return t;
}

// Extend the flagship's last act on its arriving tangent. Its original tiers,
// portals, launches and landmark anchors remain exactly where they were built.
function extendFlagshipJourney(t) {
  const deficit=COURSE_LENGTH_TARGETS[t.index]-t.length;
  if(deficit<=0)return;
  const previous=t.routes.filter(r=>!r.secret).at(-1),origin={...t.finish};
  const a=previous.points.at(-2),b=previous.points.at(-1),n=Math.hypot(b.x-a.x,b.z-a.z)||1;
  const fx=(b.x-a.x)/n,fz=(b.z-a.z)/n,nx=-fz,nz=fx;
  const path=span=>Array.from({length:Math.ceil(span)+1},(_,i)=>{
    const forward=span*i/Math.ceil(span),side=7*Math.sin(forward/32)**2;
    return P(origin.x+fx*forward+nx*side,origin.y,origin.z+fz*forward+nz*side);
  });
  let lo=0,hi=deficit;
  for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(polylineLength(path(mid))<deficit)lo=mid;else hi=mid;}
  const points=path((lo+hi)/2),count=Math.ceil(deficit/48),kind=previous.kind;
  for(let i=0;i<count;i++) {
    const from=Math.round((points.length-1)*i/count),to=Math.round((points.length-1)*(i+1)/count);
    const id=`${t.id}-finale-journey-${i+1}`;
    const r={id,section:'extended_finale_journey',kind,width:[6.4,4.35,3.25,4.35][i%4],points:points.slice(from,to+1),
      walls:true,actIndex:5,extension:true,journeyExtension:true,surfacePattern:previous.surfacePattern,
      edgeStyle:previous.edgeStyle,surfaceColor:previous.surfaceColor,accentColor:previous.accentColor};
    if(i===0)r.slowZone={kind:t.worldType==='indoor_home'?'honey':'mud'};
    t.routes.push(r);t.primaryPath.push({type:'route',id,actIndex:5});
    t.acts[5].routeIds.push(id);t.acts[5].pathIds.push(id);t.acts[5].lengthMeters+=polylineLength(r.points);
  }
  t.originalFinish={...origin};t.finish={...points.at(-1)};
  t.platforms=t.platforms.filter(p=>p.role!=='finish');plaza(t,t.finish,kind,9,9,'finish');
  t.length=t.lengthMeters=[...t.routes.filter(r=>!r.secret),...t.chutes].reduce((sum,p)=>sum+polylineLength(p.points),0);
}

function integrateV41Stage(t) {
  const styleParameters=[{radius:2,sway:.3,waves:2.5},{sway:1},{radius:2,sway:.3,waves:2.5},null,null,{radius:16},
    {radius:4,sway:2,waves:2},{sway:6},{},{}][t.index];
  if(styleParameters)for(const c of t.chutes) {
    Object.assign(c,createStyledChute({...c,...styleParameters,start:c.points[0],end:c.points.at(-1),steps:288}));
    delete c.doubleHelix;
  }
  t.length=t.lengthMeters=[...t.routes.filter(r=>!r.secret),...t.chutes].reduce((sum,p)=>sum+polylineLength(p.points),0);
  if(t.flagship)extendFlagshipJourney(t);
  else {
    // Replacing a coil by a wave changes arc length. Absorb that difference in
    // the open final promenade while preserving the authored core and mouths.
    const last=t.routes.filter(r=>!r.secret).at(-1),length=polylineLength(last.points);
    const desired=length+COURSE_LENGTH_TARGETS[t.index]-t.length;
    if(desired<=0)throw new Error(`${t.id}: final promenade cannot absorb chute length`);
    if(desired<length) {
      const cut=samplePath(last.points,desired);let walked=0;
      last.points=last.points.filter((p,i,points)=>{if(i)walked+=Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y,p.z-points[i-1].z);return walked<desired;});
      last.points.push(P(cut.x,cut.y,cut.z));
    }else {
      const end=last.points.at(-1),before=last.points.at(-2),n=Math.hypot(end.x-before.x,end.z-before.z)||1;
      const extra=desired-length,steps=Math.ceil(extra);
      for(let i=1;i<=steps;i++)last.points.push(P(end.x+(end.x-before.x)/n*extra*i/steps,end.y,end.z+(end.z-before.z)/n*extra*i/steps));
    }
    // Arc-length correction can be less than one Float32 row spacing. Keep
    // the exact finish, merging a sub-5cm terminal span into its predecessor.
    if(last.points.length>2) {
      const end=last.points.at(-1),before=last.points.at(-2);
      if(Math.hypot(end.x-before.x,end.y-before.y,end.z-before.z)<.05)last.points.splice(-2,1);
    }
    t.finish={...last.points.at(-1)};
    for(const p of t.platforms.filter(p=>p.role==='finish'))Object.assign(p,t.finish);
    const beacon=t.landmarks.find(p=>p.type==='finale_beacon');if(beacon)Object.assign(beacon,t.finish);
    t.length=t.lengthMeters=[...t.routes.filter(r=>!r.secret),...t.chutes].reduce((sum,p)=>sum+polylineLength(p.points),0);
  }
  const difficulty=t.difficultyProfile=difficultyProfileForStage(t.index),progress=t.index/9;
  let precisionIndex=0;
  for(const r of t.routes) {
    if(r.slowZone) {
      r.width=6.4-.8*progress;
      r.slowZone={...mudSpecForStage(t.index,r.width),kind:r.slowZone.kind,cycles:2};
    }else if(r.id.endsWith('-adventure-bumper-plaza'))r.width=difficulty.challengeCorridorWidth;
    else if(r.width<=3.4) {
      r.width=(precisionIndex++%2?3.35:3.25)-.3*progress;
    }else if(r.width<=5.5)r.width=difficulty.challengeCorridorWidth;
    else r.width=6.8-.4*progress;
  }
  // Quantize authored centers before sampling overlays, stars or lane slots.
  // Fresh arrays also invalidate arc-length caches populated during authoring.
  for(const r of [...t.routes,...t.chutes])r.points=r.points.map(p=>({...p,x:Math.fround(p.x),y:Math.fround(p.y),z:Math.fround(p.z)}));
  for(const c of t.chutes)c.receiving={...c.points.at(-1)};
  prepareRouteGeometry(t.routes,t.chutes);
  // Replace side-only plates on challenge roads with real one-lane bodies.
  // Existing signature launch props and world mechanisms keep their handlers.
  const corridors=t.routes.filter(r=>!r.secret&&!r.slowZone&&r.width<=4.5);
  const corridorIds=new Set(corridors.map(r=>r.id));
  for(const key of ['spikes','bumpers','hammers','rollingPins'])t[key]=t[key].filter(h=>!corridorIds.has(h.routeId));
  const candidates=[];
  for(const [index,r] of corridors.entries()) {
    const kinds=['spike','pendulum','bumper','critter'];
    const count=Math.max(1,Math.floor((polylineLength(r.points)-8)/difficulty.minHazardSpacing)+1);
    candidates.push(...placeLaneBlockingHazards(r,{stageIndex:t.index,count,kinds:[...kinds.slice(index%4),...kinds.slice(0,index%4)]}));
  }
  // Stage-wide density must increase in the actual level, including compact
  // flagship cores and their longer finales, rather than only in metadata.
  const target=Math.ceil(t.length*(.008+.0016*t.index));
  if(candidates.length<target)throw new Error(`${t.id}: insufficient safe lane slots (${candidates.length}/${target})`);
  const selected=new Set(['spike','pendulum','bumper','critter'].map(kind=>candidates.find(h=>h.kind===kind)).filter(Boolean));
  for(let i=0;selected.size<target&&i<target;i++)selected.add(candidates[Math.floor((i+.5)*candidates.length/target)]);
  for(const h of candidates){if(selected.size===target)break;selected.add(h);}
  t.laneHazards=candidates.filter(h=>selected.has(h));
  t.laneHazardDensity=t.laneHazards.length/t.length;
  for(const h of t.laneHazards) {
      if(h.kind==='spike')t.spikes.push(h);
      else if(h.kind==='pendulum')t.hammers.push(h);
      else if(h.kind==='bumper')t.bumpers.push(h);
      else t.props.push(h);
  }
  if(t.index>=2&&!t.rollingPins.length) {
    const r=t.routes.find(r=>r.id.endsWith('-adventure-rolling-hills'));
    if(r) {
      const p=samplePath(r.points,polylineLength(r.points)*.64),n=Math.hypot(p.tx,p.tz)||1,lateral=r.width/2-.6;
      const x=p.x-p.tz/n*lateral,z=p.z+p.tx/n*lateral,y=nearestRouteSurface([r],x,z,Infinity)?.y??p.y;
      t.rollingPins.push({id:`${t.id}-hill-rolling-pin`,x,y:y+.53,z,width:1.3,r:.48,speed:1.1,phase:t.index*.6,ampZ:.2,routeId:r.id});
    }
  }
  // Stars in slowdown sections come exclusively from the same S evaluator as
  // the visible ribbon and physics. Never retain their old center-road candy.
  t.stars=[];
  for(const r of t.routes.filter(r=>!r.secret)) {
    const stars=r.slowZone?sampleDryCurveStars(r,r.slowZone,4):[samplePath(r.points,polylineLength(r.points)*.55)].map(p=>({...p,y:p.y+1.05}));
    t.stars.push(...stars.map(p=>({...p,routeId:r.id})));
  }
  t.sections=t.routes.filter(r=>!r.secret).map(r=>({id:r.id,name:r.section,kind:r.kind,start:{...r.points[0]},end:{...r.points.at(-1)},center:{...r.points[Math.floor(r.points.length/2)]},...(r.slowZone?{slowZone:{...r.slowZone}}:{})}));
  // Rebuild distance-based recovery so the extended final act has beacons too.
  const recoveryCandidates=[];let distance=0;
  for(const step of t.primaryPath) {
    if(step.type==='route') {
      const r=t.routes.find(r=>r.id===step.id),length=polylineLength(r.points);
      if(!r.secret)for(let d=3;d<length-2;d+=4) {
        if(t.laneHazards.some(h=>h.routeId===r.id&&Math.abs(h.along-d)<3))continue;
        const p=samplePath(r.points,d);recoveryCandidates.push({...p,progress:distance+d,actIndex:r.actIndex});
      }
      distance+=length;
    }else if(step.type==='chute')distance+=polylineLength(t.chutes.find(c=>c.id===step.id).points);
  }
  t.checkpoints=[.16,.32,.49,.66,.83].map(f=>recoveryCandidates.reduce((best,p)=>!best||Math.abs(p.progress-t.length*f)<Math.abs(best.progress-t.length*f)?p:best,null)).filter(Boolean);
  // These are journey targets, not forced simulation durations: experienced
  // players can complete faster by following dry lines and reading trap cycles.
  t.parSeconds=Math.round(210+120*progress);t.bonusTime=Math.round(285+120*progress);
  if(t.flagship) {
    const signature=t.fallZones.filter(zone=>zone.id==='mushroom-waterfall-stream');
    authorFallZones(t);t.fallZones.push(...signature);
  }
  return t;
}

export const TRACKS = [dawnValley(),livingRoom(),bakeryStreet(),treePasture(),sweetKitchen(),clocktowerRoofs(),skyIslands(),frostAttic(),starlightLibrary(),grandFestival()].map(finishAuthoredStage).map(integrateV41Stage);

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
