// Roomba Raid v0.5.5 — Procedural Multi-Map Floorplan Generator (Vampire-Survivors Style!)
// Every single run randomizes room variant, furniture placement, wet/wind zones & secret Easter Eggs!

export const ROOM = { width: 2400, height: 2200 };

export function generateRoomLayout(mapId, rng) {
  const variant = Math.floor(rng() * 3); // 3 distinct floorplan cutouts per run!
  const cutout =
    variant === 0
      ? { x: 1760, y: 0, w: 640, h: 520 }
      : variant === 1
        ? { x: 0, y: 0, w: 560, h: 480 }
        : { x: 1780, y: 1660, w: 620, h: 540 };

  const jx = (base, spread = 90) => Math.round(base + (rng() - 0.5) * spread);
  const jy = (base, spread = 90) => Math.round(base + (rng() - 0.5) * spread);

  let obstacles = [];
  let hiddenZones = [];
  let nativeSpots = [];
  let wetZones = [];
  let windZones = [];
  let lockedFacilities = [];
  let startPos = { x: 1120, y: 980 };
  let dockPos = { x: 1840, y: 1080 };

  if (mapId === "kitchen") {
    // Midnight Gourmet Kitchen: sleek islands, fridges, abundant wet zones & wind vents!
    obstacles = [
      { id: "island1", kind: "island", x: jx(640, 80), y: jy(480, 70), w: 360, h: 130 },
      { id: "island2", kind: "island", x: jx(1420, 80), y: jy(820, 70), w: 360, h: 130 },
      { id: "fridge1", kind: "fridge", x: 140, y: jy(740, 80), w: 140, h: 220 },
      { id: "fridge2", kind: "fridge", x: 2160, y: jy(740, 80), w: 140, h: 220 },
      { id: "cabinet_k", kind: "cabinet", x: jx(940, 100), y: 1760, w: 440, h: 120 },
      { id: "wall_k1", kind: "wall", x: 0, y: 1180, w: 420, h: 42 },
      { id: "wall_k2", kind: "wall", x: 1020, y: 1180, w: 380, h: 42 },
    ];
    hiddenZones = [
      { id: "k_table1", kind: "dining_table", x: jx(420, 70), y: jy(1420, 60), w: 380, h: 240, secretEasterEgg: true },
      { id: "k_table2", kind: "dining_table", x: jx(1480, 70), y: jy(1380, 60), w: 360, h: 240 },
      { id: "k_coffee", kind: "coffee_table", x: jx(1080, 80), y: jy(460, 60), w: 280, h: 170 },
    ];
    wetZones = [
      { id: "w1", x: jx(560, 90), y: jy(840, 70), w: 340, h: 160 },
      { id: "w2", x: jx(1380, 90), y: jy(1100, 70), w: 320, h: 170 },
      { id: "w3", x: jx(980, 90), y: jy(1520, 70), w: 280, h: 150 },
    ];
    windZones = [
      { id: "wn1", x: 760, y: 200, w: 380, h: 190, vx: -155, vy: 0 },
      { id: "wn2", x: 1840, y: 1120, w: 320, h: 200, vx: 0, vy: -155 },
    ];
    lockedFacilities = [
      { id: "fridge_vault", label: "豪华双门冰箱暗格", x: 2120, y: 850, radius: 78 },
      { id: "fridge_vault2", label: "冰柜深处冻干库", x: 310, y: 850, radius: 78 },
    ];
    startPos = { x: 1160, y: 860 };
    dockPos = { x: variant === 1 ? 1860 : 480, y: 1860 };
  } else if (mapId === "cat_palace") {
    // Secret Cat Attic Palace: plush sofas, cat-beds & high-stakes loot!
    obstacles = [
      { id: "sofa1", kind: "sofa", x: jx(680, 90), y: jy(240, 60), w: 460, h: 130 },
      { id: "sofa2", kind: "sofa", x: jx(1260, 90), y: jy(1480, 60), w: 460, h: 130 },
      { id: "shelf1", kind: "bookshelf", x: jx(480, 70), y: jy(920, 80), w: 130, h: 280 },
      { id: "shelf2", kind: "bookshelf", x: jx(1720, 70), y: jy(780, 80), w: 130, h: 280 },
      { id: "tv_c", kind: "tv", x: jx(940, 80), y: jy(940, 60), w: 460, h: 105 },
    ];
    hiddenZones = [
      { id: "cat_bed", kind: "bed", x: jx(920, 70), y: jy(1520, 60), w: 460, h: 350, secretEasterEgg: true },
      { id: "cat_t1", kind: "coffee_table", x: jx(640, 80), y: jy(540, 60), w: 300, h: 180 },
      { id: "cat_t2", kind: "desk", x: jx(1420, 80), y: jy(560, 60), w: 260, h: 180 },
      { id: "cat_t3", kind: "dining_table", x: jx(240, 60), y: jy(1420, 60), w: 340, h: 220 },
    ];
    wetZones = [{ id: "wc1", x: 1120, y: 1220, w: 280, h: 150 }];
    windZones = [
      { id: "wnc1", x: 660, y: 740, w: 340, h: 170, vx: 150, vy: 0 },
      { id: "wnc2", x: 1460, y: 1120, w: 320, h: 190, vx: -150, vy: 0 },
    ];
    lockedFacilities = [
      { id: "tv_vault", label: "猫神供奉金库", x: 1160, y: 1070, radius: 80 },
    ];
    startPos = { x: 1160, y: 680 };
    dockPos = { x: 1960, y: 1260 };
  } else {
    // Classic Midnight Apartment (Living + Dining + Master Bedroom — randomized each run!)
    obstacles = [
      { id: "sofa", kind: "sofa", x: jx(620, 120), y: 160, w: 480, h: 130 },
      { id: "tv", kind: "tv", x: jx(560, 120), y: 900, w: 480, h: 105 },
      { id: "bookshelf", kind: "bookshelf", x: jx(1220, 80), y: 240, w: 130, h: 260 },
      { id: "wall_mid_l", kind: "wall", x: 0, y: 1140, w: 440, h: 42 },
      { id: "wall_mid_r", kind: "wall", x: 860, y: 1140, w: 500, h: 42 },
      { id: "island", kind: "island", x: jx(1660, 90), y: 760, w: 340, h: 130 },
      { id: "fridge", kind: "fridge", x: 2200, y: 640, w: 135, h: 200 },
      { id: "wardrobe", kind: "wardrobe", x: jx(260, 90), y: 1960, w: 440, h: 120 },
    ];
    hiddenZones = [
      { id: "coffee_table", kind: "coffee_table", x: jx(600, 100), y: 500, w: 300, h: 180 },
      { id: "desk", kind: "desk", x: 90, y: jy(640, 80), w: 170, h: 260 },
      { id: "dining_table", kind: "dining_table", x: jx(1580, 90), y: 1260, w: 360, h: 240 },
      { id: "king_bed", kind: "bed", x: jx(440, 100), y: 1380, w: 460, h: 350, secretEasterEgg: true },
      { id: "study_table", kind: "desk", x: jx(1100, 90), y: 1760, w: 280, h: 180 },
    ];
    wetZones = [
      { id: "wet_kitchen", x: jx(1500, 80), y: 600, w: 300, h: 140 },
      { id: "wet_hall", x: jx(1120, 80), y: 1240, w: 260, h: 160 },
    ];
    windZones = [
      { id: "wind_living", x: 960, y: 340, w: 320, h: 200, vx: -140, vy: 0 },
      { id: "wind_bedroom", x: 1220, y: 1560, w: 320, h: 190, vx: 0, vy: -140 },
    ];
    lockedFacilities = [
      { id: "fridge_vault", label: "神秘冰箱暗格", x: 2170, y: 740, radius: 76 },
      { id: "tv_vault", label: "电视柜隐藏金库", x: 800, y: 1030, radius: 76 },
    ];
    startPos = { x: 820, y: 400 };
    dockPos = { x: variant === 2 ? 420 : 1860, y: variant === 2 ? 1820 : 1060 };
  }

  // Filter out any obstacles colliding with the random cutout
  obstacles = obstacles.filter((ob) => !(ob.x + ob.w > cutout.x && ob.y < cutout.y + cutout.h));
  hiddenZones = hiddenZones.filter((hz) => !(hz.x + hz.w > cutout.x && hz.y < cutout.y + cutout.h));

  // Generate Native Furniture Search Seams dynamically anchored to the placed hiddenZones & obstacles!
  hiddenZones.forEach((hz, idx) => {
    nativeSpots.push({
      id: `hz_spot_${idx}`,
      label: hz.secretEasterEgg ? "隐藏金库" : "家具底暗格",
      x: hz.x + hz.w / 2,
      y: hz.y + hz.h / 2,
      minVal: hz.secretEasterEgg ? 42000 : 12000 + idx * 4000,
      isSecret: Boolean(hz.secretEasterEgg),
      progress: 0,
      tickAcc: 0,
      searched: false,
    });
  });
  obstacles.slice(0, 3).forEach((ob, idx) => {
    if (ob.kind === "wall") return;
    nativeSpots.push({
      id: `ob_spot_${idx}`,
      label: "家具缝隙",
      x: ob.x + ob.w / 2,
      y: Math.min(ROOM.height - 90, ob.y + ob.h + 26),
      minVal: 8800 + idx * 4000,
      isSecret: false,
      progress: 0,
      tickAcc: 0,
      searched: false,
    });
  });

  const shockStrips = [
    { id: "s1", x: jx(980, 120), y: jy(640, 90), cd: 0 },
    { id: "s2", x: jx(1520, 120), y: jy(1040, 90), cd: 0 },
    { id: "s3", x: jx(960, 120), y: jy(1480, 90), cd: 0 },
  ];

  return {
    mapId,
    width: ROOM.width,
    height: ROOM.height,
    cutout,
    obstacles,
    hiddenZones,
    nativeSpots,
    wetZones,
    windZones,
    lockedFacilities,
    shockStrips,
    startPos,
    dockPos,
  };
}

export function isInsideCutout(layout, x, y, pad = 0) {
  const c = layout.cutout;
  return x > c.x - pad && x < c.x + c.w + pad && y > c.y - pad && y < c.y + c.h + pad;
}

export function isUnderHiddenCover(layout, x, y) {
  for (const hz of layout.hiddenZones) {
    if (x >= hz.x && x <= hz.x + hz.w && y >= hz.y && y <= hz.y + hz.h) return hz;
  }
  return null;
}

export function pointHitsObstacle(layout, x, y) {
  if (x < 14 || x > layout.width - 14 || y < 14 || y > layout.height - 14) return true;
  if (isInsideCutout(layout, x, y, 2)) return true;
  for (const ob of layout.obstacles) {
    if (x >= ob.x && x <= ob.x + ob.w && y >= ob.y && y <= ob.y + ob.h) return true;
  }
  return false;
}

export function clampToRoom(layout, ent, r = 20) {
  ent.x = Math.max(r + 14, Math.min(layout.width - r - 14, ent.x));
  ent.y = Math.max(r + 14, Math.min(layout.height - r - 14, ent.y));

  // Push out of random rectangular cutout
  const c = layout.cutout;
  const ccx = Math.max(c.x, Math.min(c.x + c.w, ent.x));
  const ccy = Math.max(c.y, Math.min(c.y + c.h, ent.y));
  const cdx = ent.x - ccx;
  const cdy = ent.y - ccy;
  const cd2 = cdx * cdx + cdy * cdy;
  if (cd2 < r * r) {
    const d = Math.sqrt(cd2);
    if (d > 0.001) {
      ent.x = ccx + (cdx / d) * r;
      ent.y = ccy + (cdy / d) * r;
    } else {
      ent.x = c.x > 500 ? c.x - r : c.x + c.w + r;
    }
  }

  let hitObstacle = false;
  for (const ob of layout.obstacles) {
    const cx = Math.max(ob.x, Math.min(ob.x + ob.w, ent.x));
    const cy = Math.max(ob.y, Math.min(ob.y + ob.h, ent.y));
    const dx = ent.x - cx;
    const dy = ent.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hitObstacle = true;
      const d = Math.sqrt(d2);
      if (d > 0.001) {
        ent.x = cx + (dx / d) * r;
        ent.y = cy + (dy / d) * r;
      } else {
        const left = ent.x - ob.x;
        const right = ob.x + ob.w - ent.x;
        const top = ent.y - ob.y;
        const bottom = ob.y + ob.h - ent.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) ent.x = ob.x - r;
        else if (m === right) ent.x = ob.x + ob.w + r;
        else if (m === top) ent.y = ob.y - r;
        else ent.y = ob.y + ob.h + r;
      }
    }
  }
  return hitObstacle;
}

export function createCleanTracker(layout) {
  const cell = 68;
  const cols = Math.ceil(layout.width / cell);
  const rows = Math.ceil(layout.height / cell);
  const valid = new Uint8Array(cols * rows);
  const cleaned = new Uint8Array(cols * rows);
  let totalValid = 0;

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const wx = gx * cell + cell / 2;
      const wy = gy * cell + cell / 2;
      if (!pointHitsObstacle(layout, wx, wy)) {
        valid[gy * cols + gx] = 1;
        totalValid++;
      }
    }
  }

  return {
    cell,
    cols,
    rows,
    valid,
    cleaned,
    totalValid: Math.max(1, totalValid),
    cleanedCount: 0,
    percent: 0,
    markClean(x, y, radius = 56) {
      const rCells = Math.ceil(radius / cell);
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      let newly = 0;
      for (let dy = -rCells; dy <= rCells; dy++) {
        for (let dx = -rCells; dx <= rCells; dx++) {
          const gx = cx + dx;
          const gy = cy + dy;
          if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) continue;
          const idx = gy * cols + gx;
          if (valid[idx] && !cleaned[idx]) {
            const wx = gx * cell + cell / 2;
            const wy = gy * cell + cell / 2;
            if (Math.hypot(wx - x, wy - y) <= radius + cell * 0.48) {
              cleaned[idx] = 1;
              this.cleanedCount++;
              newly++;
            }
          }
        }
      }
      if (newly > 0) {
        const raw = (this.cleanedCount / this.totalValid) * 100;
        this.percent = raw >= 92 ? 100 : Math.min(99, Math.floor(raw));
      }
      return newly;
    },
    dirtyAt(x, y, radius = 48) {
      const rCells = Math.ceil(radius / cell);
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      for (let dy = -rCells; dy <= rCells; dy++) {
        for (let dx = -rCells; dx <= rCells; dx++) {
          const gx = cx + dx;
          const gy = cy + dy;
          if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) continue;
          const idx = gy * cols + gx;
          if (cleaned[idx]) {
            cleaned[idx] = 0;
            this.cleanedCount = Math.max(0, this.cleanedCount - 1);
          }
        }
      }
      const raw = (this.cleanedCount / this.totalValid) * 100;
      this.percent = Math.min(99, Math.floor(raw));
    },
  };
}
