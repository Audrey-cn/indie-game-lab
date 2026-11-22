// Roomba Raid v0.4.0 — Expanded 2400x2400 Multi-Room Apartment Map (Vampire-Survivors Scale!)
// Pure visual top-down furniture (NO text labels!), Tactical Cover Obstacles,
// Duckable Semi-Transparent Under-Furniture Hiding Spots (blocks Cat Paw!),
// Secret Under-Bed Easter Egg Vault, Native Search Seams & Exact Cleanliness Tracker.

export const ROOM = {
  width: 2400,
  height: 2200,
  // Irregular top-right balcony/wall cutout for authentic apartment geometry
  cutout: { x: 1760, y: 0, w: 640, h: 520 },
};

// Solid furniture & partition walls (block movement, block enemy bullets, STUN charging Boss!)
// Drawn purely as rich recognizable furniture (TV on console, sofa with cushions, bookshelf, kitchen island)
export const OBSTACLES = [
  // Living Room (Top-Left)
  { id: "sofa", kind: "sofa", x: 240, y: 150, w: 500, h: 130 },
  { id: "tv", kind: "tv", x: 240, y: 880, w: 500, h: 105 },
  { id: "bookshelf", kind: "bookshelf", x: 1120, y: 200, w: 130, h: 280 },
  // Interior partition walls with wide doorways separating Living Room / Dining / Bedroom
  { id: "wall_mid_l", kind: "wall", x: 0, y: 1120, w: 460, h: 42 },
  { id: "wall_mid_r", kind: "wall", x: 860, y: 1120, w: 520, h: 42 },
  { id: "wall_vert", kind: "wall", x: 1360, y: 520, w: 42, h: 360 },
  // Dining & Kitchen Wing (Right)
  { id: "island", kind: "island", x: 1680, y: 760, w: 360, h: 130 },
  { id: "fridge", kind: "fridge", x: 2210, y: 620, w: 135, h: 200 },
  // Master Bedroom Wing (Bottom)
  { id: "wardrobe", kind: "wardrobe", x: 180, y: 1980, w: 460, h: 120 },
  { id: "cabinet", kind: "cabinet", x: 2220, y: 1460, w: 125, h: 340 },
];

// Duckable overhead furniture (opaque from above, smoothly fades translucent when Roomba ducks underneath!)
// ALSO shields Roomba 100% from the Giant Cat Paw Slam!
export const HIDDEN_ZONES = [
  { id: "coffee_table", kind: "coffee_table", x: 350, y: 490, w: 300, h: 180 },
  { id: "desk", kind: "desk", x: 80, y: 540, w: 170, h: 280 },
  { id: "dining_table", kind: "dining_table", x: 1620, y: 1240, w: 380, h: 250 },
  { id: "king_bed", kind: "bed", x: 360, y: 1360, w: 460, h: 360, secretEasterEgg: true },
  { id: "study_table", kind: "desk", x: 1020, y: 1760, w: 280, h: 180 },
];

// Native logical search seams integrated into living room, dining & bedroom furniture
export const NATIVE_SPOT_DEFS = [
  { id: "sofa_crack", label: "沙发缝", x: 490, y: 305, minVal: 8800 },
  { id: "coffee_under", label: "茶几底", x: 500, y: 580, minVal: 12000 },
  { id: "desk_under", label: "书桌底", x: 165, y: 680, minVal: 18800 },
  { id: "tv_back", label: "电视柜后", x: 765, y: 930, minVal: 12000 },
  { id: "dining_under", label: "餐桌底", x: 1810, y: 1365, minVal: 28000 },
  { id: "island_seam", label: "吧台暗角", x: 1860, y: 915, minVal: 18800 },
  { id: "bed_secret", label: "床底猫窝金库", x: 590, y: 1540, minVal: 42000, isSecret: true },
  { id: "study_under", label: "卧室书桌底", x: 1160, y: 1850, minVal: 28000 },
];

// Interactive Power-Strip Shock Traps scattered across rooms
export const SHOCK_STRIP_DEFS = [
  { id: "strip1", x: 940, y: 580 },
  { id: "strip2", x: 1540, y: 1020 },
  { id: "strip3", x: 960, y: 1480 },
];

// Wet Slippery Floor Zones (Ice-like low-friction drift near kitchen & bathroom!)
export const WET_ZONES = [
  { id: "wet_kitchen", x: 1520, y: 600, w: 320, h: 140 },
  { id: "wet_hall", x: 1120, y: 1220, w: 260, h: 170 },
];

// Floor Fan / Hairdryer Wind Corridors (pushes idle Roomba, resists headwind, boosts tailwind!)
export const WIND_ZONES = [
  { id: "wind_living", x: 760, y: 260, w: 320, h: 210, vx: -135, vy: 0 },
  { id: "wind_bedroom", x: 1200, y: 1560, w: 340, h: 200, vx: 0, vy: -135 },
];

// Boss-Key Unlockable Special Facilities (Fridge & TV Secret Vault!)
export const LOCKED_FACILITIES = [
  { id: "fridge_vault", label: "神秘冰箱暗格", x: 2180, y: 720, radius: 74 },
  { id: "tv_vault", label: "电视柜隐藏金库", x: 490, y: 1015, radius: 74 },
];

export function isInsideCutout(x, y, pad = 0) {
  const c = ROOM.cutout;
  return x > c.x - pad && y < c.y + c.h + pad;
}

export function isUnderHiddenCover(x, y) {
  for (const hz of HIDDEN_ZONES) {
    if (x >= hz.x && x <= hz.x + hz.w && y >= hz.y && y <= hz.y + hz.h) {
      return hz;
    }
  }
  return null;
}

export function clampToRoom(ent, r = 20) {
  ent.x = Math.max(r + 14, Math.min(ROOM.width - r - 14, ent.x));
  ent.y = Math.max(r + 14, Math.min(ROOM.height - r - 14, ent.y));

  const c = ROOM.cutout;
  if (ent.x + r > c.x && ent.y - r < c.y + c.h) {
    const dx = ent.x + r - c.x;
    const dy = c.y + c.h - (ent.y - r);
    if (dx < dy) ent.x = c.x - r;
    else ent.y = c.y + c.h + r;
  }

  let hitObstacle = false;
  for (const ob of OBSTACLES) {
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

export function pointHitsObstacle(x, y) {
  if (x < 12 || x > ROOM.width - 12 || y < 12 || y > ROOM.height - 12) return true;
  if (isInsideCutout(x, y, 2)) return true;
  for (const ob of OBSTACLES) {
    if (x >= ob.x && x <= ob.x + ob.w && y >= ob.y && y <= ob.y + ob.h) return true;
  }
  return false;
}

// Cleanliness & Exploration Grid Tracker (68px tiles across the 2400x2200 apartment)
export function createCleanTracker() {
  const cell = 68;
  const cols = Math.ceil(ROOM.width / cell);
  const rows = Math.ceil(ROOM.height / cell);
  const valid = new Uint8Array(cols * rows);
  const cleaned = new Uint8Array(cols * rows);
  let totalValid = 0;

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const wx = gx * cell + cell / 2;
      const wy = gy * cell + cell / 2;
      if (!pointHitsObstacle(wx, wy)) {
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
