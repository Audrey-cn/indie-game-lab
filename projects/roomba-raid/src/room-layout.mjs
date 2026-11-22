// Irregular L-Shaped Living Room Layout, Solid Cover Furniture, Semi-Transparent Hidden Zones,
// Native Furniture Loot Spots, Power-Strip Shock Traps & Exact Cleanliness Percentage Tracker

export const ROOM = {
  width: 1480,
  height: 1760,
  // Top-right wall cutout makes a real L-shaped apartment floorplan (living room + hallway wing)
  cutout: { x: 1020, y: 0, w: 460, h: 560 },
};

// Solid furniture obstacles: block movement, block Boss bullets, and STUN charging Boss!
export const OBSTACLES = [
  { id: "sofa", label: "主沙发", x: 180, y: 110, w: 440, h: 112, color: "#3d335c", trim: "#62538f" },
  { id: "tv", label: "电视柜", x: 180, y: 1560, w: 460, h: 98, color: "#2d2a42", trim: "#524c78" },
  { id: "shelf", label: "客厅立柱书柜", x: 880, y: 880, w: 120, h: 190, color: "#4a3832", trim: "#7d6054" },
  { id: "cabinet", label: "玄关鞋柜", x: 1310, y: 740, w: 120, h: 310, color: "#3d354f", trim: "#665a85" },
];

// Overhead furniture: opaque from above, smoothly fades to translucent when Roomba ducks underneath!
export const HIDDEN_ZONES = [
  { id: "coffee_table", label: "茶几底暗格", x: 420, y: 690, w: 280, h: 165, color: "#543b2e", trim: "#966b52" },
  { id: "dining_table", label: "餐桌底秘境", x: 960, y: 1320, w: 320, h: 220, color: "#4e3932", trim: "#8c695a" },
  { id: "desk", label: "书桌底私房钱窝", x: 78, y: 920, w: 175, h: 260, color: "#363c59", trim: "#5c6896" },
];

// Native logical search spots baked into living room furniture (replaces spammy random crates!)
export const NATIVE_SPOT_DEFS = [
  { id: "sofa_crack", label: "掏沙发缝", x: 400, y: 245, minVal: 8800 },
  { id: "coffee_under", label: "摸茶几底", x: 560, y: 772, minVal: 12000 },
  { id: "desk_under", label: "掏书桌底", x: 165, y: 1050, minVal: 18800 },
  { id: "dining_under", label: "翻餐桌底", x: 1120, y: 1430, minVal: 28000 },
  { id: "tv_back", label: "搜电视柜角", x: 670, y: 1595, minVal: 12000 },
  { id: "hall_corner", label: "玄关角落", x: 1265, y: 895, minVal: 18800 },
];

// Interactive Power-Strip Shock Traps on the floor (trigger AoE chain stun on enemies!)
export const SHOCK_STRIP_DEFS = [
  { id: "strip1", x: 760, y: 520 },
  { id: "strip2", x: 730, y: 1240 },
];

export function isInsideCutout(x, y, pad = 0) {
  const c = ROOM.cutout;
  return x > c.x - pad && y < c.y + c.h + pad;
}

export function clampToRoom(ent, r = 20) {
  ent.x = Math.max(r + 14, Math.min(ROOM.width - r - 14, ent.x));
  ent.y = Math.max(r + 14, Math.min(ROOM.height - r - 14, ent.y));

  // Push out of top-right L-cutout wall
  const c = ROOM.cutout;
  if (ent.x + r > c.x && ent.y - r < c.y + c.h) {
    const dx = ent.x + r - c.x;
    const dy = c.y + c.h - (ent.y - r);
    if (dx < dy) ent.x = c.x - r;
    else ent.y = c.y + c.h + r;
  }

  // Push out of solid furniture obstacles, returning true if hit solid obstacle (used for Boss charge stun!)
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
        // Center fell inside rect: push out nearest edge
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

// Cleanliness Grid Tracker (56px tiles across walkable L-shaped floor)
export function createCleanTracker() {
  const cell = 56;
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
    markClean(x, y, radius = 48) {
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
            if (Math.hypot(wx - x, wy - y) <= radius + cell * 0.45) {
              cleaned[idx] = 1;
              this.cleanedCount++;
              newly++;
            }
          }
        }
      }
      if (newly > 0) {
        // Snap >= 94% to 100% so players never suffer pixel-hunting last stray dust!
        const raw = (this.cleanedCount / this.totalValid) * 100;
        this.percent = raw >= 94 ? 100 : Math.min(99, Math.floor(raw));
      }
      return newly;
    },
    dirtyAt(x, y, radius = 48) {
      // Pet Poop nightmare: smears dirt back onto cleaned floor!
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
