// Meowball Rush v0.3.0 — Poster-Grade WitchSpring R Natural Storybook 3D Scene Factory
// Multi-material Cliff/Grass Floating Islands (ZERO stretched sides!), 3D Stone Curbs,
// Slatted Rope-Wood Bridges, Stylized Cel-Shaded Trees & Wildflowers, Layered Cloud Sea,
// Drifting Magic Petals, Real-Time Soft Shadows & Hand-Painted Anime Kitten Face!
import * as THREE from "three";

let toonGradient = null;
function getToonGradient() {
  if (toonGradient) return toonGradient;
  const data = new Uint8Array([122, 122, 122, 255, 198, 198, 198, 255, 255, 255, 255, 255]);
  toonGradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  toonGradient.minFilter = THREE.NearestFilter;
  toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x352548, side: THREE.BackSide });

export function toonMat(color, emissive = 0x000000, emissiveIntensity = 0, map = null) {
  const opts = { color, gradientMap: getToonGradient(), emissive, emissiveIntensity };
  if (map) opts.map = map;
  return new THREE.MeshToonMaterial(opts);
}

export function addOutline(mesh, scale = 1.036) {
  const out = new THREE.Mesh(mesh.geometry, outlineMat);
  out.scale.setScalar(scale);
  mesh.add(out);
  return mesh;
}

function castRec(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

// Organic Beveled Rounded-Corner Island Geometry (Eliminates flat boxy rectangles!)
function createRoundedSlabGeo(w, d, h, radius = 0.9, bevel = 0.14) {
  const hw = Math.max(0.2, w * 0.5 - bevel);
  const hd = Math.max(0.2, d * 0.5 - bevel);
  const r = Math.min(radius, hw * 0.85, hd * 0.85);
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const depth = Math.max(0.15, h - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geo.rotateX(Math.PI / 2); // Extrude downward from y=0 to y=-depth
  // Normalize planar top UVs so cobblestone/brass textures tile smoothly without distortion!
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + w * 0.5) / 4.2, (pos.getZ(i) + d * 0.5) / 4.2);
  }
  uv.needsUpdate = true;
  return geo;
}

// ===== HAND-PAINTED STORYBOOK TEXTURES =====
const TEX_CACHE = {};
function makeTex(key, w, h, drawFn, rx = 1, ry = 1) {
  if (TEX_CACHE[key]) return TEX_CACHE[key];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  drawFn(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  TEX_CACHE[key] = tex;
  return tex;
}

function getCobbleGrassTex() {
  return makeTex("cobble_v3", 256, 256, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#86e374");
    bg.addColorStop(1, "#63c95b");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(46, 122, 52, 0.28)";
    g.lineWidth = 2;
    for (let i = 0; i < 60; i++) {
      const gx = (i * 47) % w;
      const gy = (i * 89) % h;
      g.beginPath();
      g.moveTo(gx, gy);
      g.lineTo(gx - 3, gy - 7);
      g.moveTo(gx, gy);
      g.lineTo(gx + 3, gy - 6);
      g.stroke();
    }
    // Organic irregular hand-painted stepping stones (just like the poster!)
    const stones = [
      [34, 34, 44, 32], [96, 28, 52, 38], [166, 36, 48, 34], [228, 32, 34, 32],
      [26, 94, 50, 36], [94, 92, 46, 38], [162, 96, 54, 40], [230, 94, 38, 36],
      [38, 158, 48, 36], [108, 156, 54, 40], [180, 160, 48, 34], [236, 158, 34, 34],
      [28, 220, 48, 36], [98, 220, 50, 36], [168, 222, 50, 34], [232, 220, 36, 34],
    ];
    for (let i = 0; i < stones.length; i++) {
      const [sx, sy, sw, sh] = stones[i];
      g.fillStyle = i % 3 === 0 ? "#e2dcd0" : i % 3 === 1 ? "#cfc9bc" : "#ebe4d6";
      g.strokeStyle = "#5c6858";
      g.lineWidth = 2.6;
      g.beginPath();
      g.roundRect(sx - sw / 2, sy - sh / 2, sw, sh, 12);
      g.fill();
      g.stroke();
      g.fillStyle = "rgba(255,255,248,0.48)";
      g.beginPath();
      g.roundRect(sx - sw / 2 + 5, sy - sh / 2 + 4, sw - 12, sh * 0.32, 6);
      g.fill();
    }
  });
}

function getCliffSideTex() {
  return makeTex("cliff_v3", 256, 128, (g, w, h) => {
    // Top overhanging lush grass lip + warm painted cliff rock below (ZERO texture stretching!)
    g.fillStyle = "#9e7256";
    g.fillRect(0, 0, w, h);
    // Faceted rock strata shading
    g.fillStyle = "#855c43";
    g.fillRect(0, h * 0.52, w, h * 0.48);
    g.fillStyle = "#b58768";
    for (let x = 0; x < w; x += 48) {
      g.beginPath();
      g.roundRect(x + 4, 28, 38, 32, 8);
      g.fill();
    }
    // Scalloped hanging grass edge along the top!
    g.fillStyle = "#68cc5e";
    g.fillRect(0, 0, w, 20);
    for (let x = 0; x < w; x += 24) {
      g.beginPath();
      g.arc(x + 12, 20, 13, 0, Math.PI);
      g.fill();
    }
    g.strokeStyle = "#3a6b38";
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, 22);
    g.lineTo(w, 22);
    g.stroke();
  });
}

function getWoodPlankTex() {
  return makeTex("wood_v3", 256, 256, (g, w, h) => {
    g.fillStyle = "#5c341d";
    g.fillRect(0, 0, w, h);
    const rows = 6;
    const rh = h / rows;
    for (let i = 0; i < rows; i++) {
      const y = i * rh + 3;
      const grad = g.createLinearGradient(0, y, 0, y + rh - 6);
      grad.addColorStop(0, i % 2 === 0 ? "#df9e59" : "#d08f4a");
      grad.addColorStop(1, "#aa6b34");
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(4, y, w - 8, rh - 6, 5);
      g.fill();
      g.strokeStyle = "#3a2114";
      g.lineWidth = 2.5;
      g.stroke();
    }
  });
}

function getBrassTex() {
  return makeTex("brass_v3", 256, 256, (g, w, h) => {
    const rad = g.createRadialGradient(w / 2, h / 2, 16, w / 2, h / 2, w * 0.55);
    rad.addColorStop(0, "#ffe48a");
    rad.addColorStop(0.55, "#dfa03a");
    rad.addColorStop(1, "#a86d1c");
    g.fillStyle = rad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(92, 54, 12, 0.45)";
    g.lineWidth = 4;
    for (const r of [42, 82, 112]) {
      g.beginPath();
      g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = "#fff1b8";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * 96, h / 2 + Math.sin(a) * 96, 6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function getRainbowBoostTex() {
  return makeTex("rainbow_v3", 128, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#ff7eb6");
    grad.addColorStop(0.28, "#ffe066");
    grad.addColorStop(0.55, "#6ef2a9");
    grad.addColorStop(0.8, "#52e5ff");
    grad.addColorStop(1, "#c084fc");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.92)";
    g.lineWidth = 12;
    g.lineCap = "round";
    g.lineJoin = "round";
    for (let y = 32; y < h; y += 64) {
      g.beginPath();
      g.moveTo(20, y + 22);
      g.lineTo(w / 2, y - 10);
      g.lineTo(w - 20, y + 22);
      g.stroke();
    }
  });
}

function getIceCrystalTex() {
  return makeTex("ice_v3", 256, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#c2f6ff");
    grad.addColorStop(0.5, "#74dcff");
    grad.addColorStop(1, "#52b6f5");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.62)";
    g.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.moveTo((i * 41) % w, 0);
      g.lineTo(((i * 41) + 75) % w, h);
      g.stroke();
    }
  });
}

// Hand-Painted Expressive Anime Kitten Face Texture (replaces raw sphere dots!)
function getCatFaceTex(catDef) {
  return makeTex(`face_${catDef.id}`, 256, 256, (g, w, h) => {
    g.fillStyle = `#${catDef.bodyColor.toString(16).padStart(6, "0")}`;
    g.fillRect(0, 0, w, h);
    // Cute blush cheeks
    g.fillStyle = "rgba(255, 130, 175, 0.42)";
    g.beginPath();
    g.ellipse(76, 152, 22, 12, 0, 0, Math.PI * 2);
    g.ellipse(180, 152, 22, 12, 0, 0, Math.PI * 2);
    g.fill();
    // Large luminous anime eyes with highlight crescents
    const eyeHex = `#${catDef.eyeColor.toString(16).padStart(6, "0")}`;
    for (const ex of [92, 164]) {
      g.fillStyle = "#1d142b";
      g.beginPath();
      g.ellipse(ex, 124, 20, 23, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = eyeHex;
      g.beginPath();
      g.ellipse(ex, 128, 15, 16, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#1d142b";
      g.beginPath();
      g.ellipse(ex, 123, 9, 10, 0, 0, Math.PI * 2);
      g.fill();
      // Big anime specular dot + tiny lower dot
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(ex - 6, 114, 6.5, 0, Math.PI * 2);
      g.arc(ex + 6, 134, 3, 0, Math.PI * 2);
      g.fill();
    }
    // Cute pink triangle nose + ":3" happy cat mouth!
    g.fillStyle = "#ff8bb8";
    g.beginPath();
    g.moveTo(128, 146);
    g.lineTo(120, 138);
    g.lineTo(136, 138);
    g.closePath();
    g.fill();
    g.strokeStyle = "#1d142b";
    g.lineWidth = 4;
    g.lineCap = "round";
    g.beginPath();
    g.arc(120, 150, 8, 0.1, Math.PI * 0.9);
    g.stroke();
    g.beginPath();
    g.arc(136, 150, 8, 0.1, Math.PI * 0.9);
    g.stroke();
  });
}

// ===== DREAMY GRADIENT SKY DOME SHADER =====
export function createSkyDome(track) {
  const top = new THREE.Color(track.skyTop);
  const bot = new THREE.Color(track.skyBottom);
  const isNight = track.id === "aurora";
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: top },
      uBottom: { value: bot },
      uNight: { value: isNight ? 1.0 : 0.0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform float uNight;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y * 0.72 + 0.36, 0.0, 1.0);
        vec3 col = mix(uBottom, uTop, pow(h, 0.7));
        float glow = pow(max(0.0, 1.0 - abs(vDir.y - 0.12) * 3.0), 2.0);
        col += (uNight > 0.5 ? vec3(0.18, 0.72, 0.58) : vec3(0.36, 0.28, 0.14)) * glow * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(145, 24, 16), mat);
}

export function createBubbleMaterial(tintHex = 0xb67cff) {
  const col = new THREE.Color(tintHex);
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: col }, uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewPos);
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.2);
        vec3 L = normalize(vec3(0.45, 0.85, 0.55));
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 36.0);
        vec3 rainbow = 0.5 + 0.5 * cos(uTime * 1.4 + N.xyx * 3.2 + vec3(0.0, 2.0, 4.0));
        vec3 col = mix(uColor, rainbow, 0.36) * (0.7 + fresnel * 0.95) + vec3(1.0) * spec * 1.35;
        float alpha = clamp(0.14 + fresnel * 0.66 + spec * 0.9, 0.0, 0.94);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

export function createRainbowRibbon(segments = 24) {
  const vertCount = segments * 2;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const indices = [];
  const palette = [
    new THREE.Color(0xff7eb6),
    new THREE.Color(0xffe066),
    new THREE.Color(0x6ef2a9),
    new THREE.Color(0x52e5ff),
    new THREE.Color(0xc084fc),
  ];
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const c = palette[Math.min(palette.length - 1, Math.floor(t * (palette.length - 0.01)))];
    const fade = 1 - t;
    for (let s = 0; s < 2; s++) {
      const vi = (i * 2 + s) * 3;
      colors[vi] = c.r * (0.75 + 0.25 * fade);
      colors[vi + 1] = c.g * (0.75 + 0.25 * fade);
      colors[vi + 2] = c.b * (0.75 + 0.25 * fade);
    }
    if (i < segments - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return {
    mesh: new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false })
    ),
    segments,
  };
}

// Build Refined Cel-Shaded Kitten with Hand-Painted Anime Face + External GLB Mount Hook!
export function createKittyBall(catDef) {
  const root = new THREE.Group();

  const bubbleMat = createBubbleMaterial(catDef.bubbleColor);
  const bubbleMesh = castRec(new THREE.Mesh(new THREE.SphereGeometry(0.62, 28, 24), bubbleMat), true, false);
  root.add(bubbleMesh);

  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.018, 8, 28),
    new THREE.MeshBasicMaterial({ color: catDef.trailColor || 0xffffff, transparent: true, opacity: 0.55 })
  );
  band.rotation.x = Math.PI / 2;
  bubbleMesh.add(band);

  // Distinctive Magic Halo Ring inside the bubble (unique color per cat rarity!)
  const auraRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.016, 8, 24),
    new THREE.MeshBasicMaterial({ color: catDef.bubbleColor, transparent: true, opacity: 0.72 })
  );
  auraRing.rotation.x = Math.PI / 2;
  auraRing.position.y = -0.26;
  root.add(auraRing);

  // Inner Kitty Container (supports swapping in an external .glb 3D model via rig.mountExternalModel!)
  const kitty = new THREE.Group();
  root.add(kitty);

  const bodyMat = toonMat(catDef.bodyColor);
  const bellyMat = toonMat(catDef.bellyColor);
  const pinkMat = toonMat(0xff9ec4);
  const faceMat = toonMat(0xffffff, 0x000000, 0, getCatFaceTex(catDef));
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1a1226 });

  const body = addOutline(new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 16), bodyMat), 1.06);
  body.scale.set(0.98, 0.88, 1.18);
  body.position.set(0, -0.09, 0.03);
  kitty.add(body);

  // Smooth round head with hand-painted anime face texture oriented forward (-Z)!
  const head = addOutline(new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 18), faceMat), 1.06);
  head.scale.set(1.12, 0.98, 1.02);
  head.position.set(0, 0.14, -0.15);
  head.rotation.y = Math.PI / 2;
  kitty.add(head);

  for (const s of [-1, 1]) {
    const ear = addOutline(new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.18, 5), bodyMat), 1.09);
    ear.position.set(s * 0.14, 0.31, -0.14);
    ear.rotation.z = -s * 0.3;
    kitty.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.11, 5), pinkMat);
    inner.position.set(s * 0.14, 0.3, -0.16);
    inner.rotation.z = -s * 0.3;
    kitty.add(inner);
  }

  const paws = [];
  for (const [px, py, pz] of [[-0.12, -0.25, -0.14], [0.12, -0.25, -0.14], [-0.12, -0.25, 0.14], [0.12, -0.25, 0.14]]) {
    const paw = addOutline(new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 10), bellyMat), 1.09);
    paw.scale.set(0.9, 0.76, 1.25);
    paw.position.set(px, py, pz);
    kitty.add(paw);
    paws.push({ mesh: paw, baseY: py, baseZ: pz });
  }

  const tail = addOutline(new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.24, 6, 8), bodyMat), 1.1);
  tail.position.set(0, 0.06, 0.3);
  tail.rotation.x = 0.65;
  kitty.add(tail);

  const accGroup = new THREE.Group();
  if (catDef.acc === "witch_hat") {
    const brim = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.26, 0.035, 16), toonMat(0x6d35a8)), 1.07);
    brim.position.set(0.03, 0.35, -0.13);
    brim.rotation.z = -0.18;
    accGroup.add(brim);
    const cone = addOutline(new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.29, 12), toonMat(0x7c3aed)), 1.07);
    cone.position.set(0.06, 0.49, -0.12);
    cone.rotation.z = -0.26;
    accGroup.add(cone);
    const bandH = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.145, 0.045, 12), toonMat(0xff5ca8));
    bandH.position.set(0.04, 0.38, -0.13);
    bandH.rotation.z = -0.18;
    accGroup.add(bandH);
  } else if (catDef.acc === "scarf") {
    const scarf = addOutline(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.055, 8, 16), toonMat(0xe11d48)), 1.08);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.set(0, 0.01, -0.12);
    accGroup.add(scarf);
  } else if (catDef.acc === "ribbon") {
    for (const s of [-1, 1]) {
      const bow = addOutline(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.11, 6), toonMat(0xff7eb6)), 1.1);
      bow.position.set(s * 0.06, 0.02, -0.3);
      bow.rotation.z = s * Math.PI / 2;
      accGroup.add(bow);
    }
  } else if (catDef.acc === "bell") {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 8, 16), toonMat(0xef4444));
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.01, -0.12);
    accGroup.add(collar);
    const bell = addOutline(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), toonMat(0xffd54a)), 1.1);
    bell.position.set(0, -0.02, -0.29);
    accGroup.add(bell);
  } else if (catDef.acc === "goggles") {
    for (const s of [-1, 1]) {
      const lens = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 12), toonMat(0x38f3ff, 0x38f3ff, 0.4)), 1.1);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(s * 0.085, 0.28, -0.28);
      accGroup.add(lens);
    }
  } else if (catDef.acc === "crown") {
    const cr = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.12, 6), toonMat(0xffd54a, 0xffd54a, 0.25)), 1.1);
    cr.position.set(0, 0.38, -0.15);
    accGroup.add(cr);
  }
  kitty.add(accGroup);

  const dizzyHalo = new THREE.Group();
  dizzyHalo.visible = false;
  dizzyHalo.position.set(0, 0.68, 0);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffe047 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), starMat);
    st.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
    dizzyHalo.add(st);
  }
  root.add(dizzyHalo);

  const furball = new THREE.Group();
  furball.visible = false;
  furball.add(addOutline(new THREE.Mesh(new THREE.DodecahedronGeometry(0.46, 1), bodyMat), 1.07));
  for (const s of [-1, 1]) {
    const se = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    se.position.set(s * 0.14, 0.1, -0.4);
    furball.add(se);
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), pupilMat);
    sp.position.set(s * 0.14, 0.1, -0.47);
    furball.add(sp);
  }
  root.add(furball);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.54, 20),
    new THREE.MeshBasicMaterial({ color: 0x261a3b, transparent: true, opacity: 0.3, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;

  // Ready-to-use External GLB Model Mount Hook with Procedural Per-Limb Vertex Shader Running & Squash-Stretch!
  let hasExternal = false;
  const animUniforms = {
    uPhase: { value: 0 },
    uSpeed: { value: 0 },
    uTurn: { value: 0 },
    uSquash: { value: 0 },
    uTime: { value: 0 },
    uMinY: { value: -0.5 },
    uInvH: { value: 1.0 },
  };
  function mountExternalModel(gltfScene, scale = 0.72) {
    kitty.clear();
    hasExternal = true;
    gltfScene.scale.setScalar(scale);
    gltfScene.position.y = -0.04; // Snugly centered inside bubble so hat & tail NEVER clip through glass!
    gltfScene.rotation.y = Math.PI;
    // Measure local mesh Y bounds so vertex shader knows exact paw / torso / head-hat zones!
    let minY = Infinity;
    let maxY = -Infinity;
    gltfScene.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        obj.geometry.computeBoundingBox();
        const bb = obj.geometry.boundingBox;
        if (bb) {
          if (bb.min.y < minY) minY = bb.min.y;
          if (bb.max.y > maxY) maxY = bb.max.y;
        }
      }
    });
    if (isFinite(minY) && maxY > minY + 0.01) {
      animUniforms.uMinY.value = minY;
      animUniforms.uInvH.value = 1.0 / (maxY - minY);
    }
    const tintCol = new THREE.Color(catDef.bodyColor);
    const auraCol = new THREE.Color(catDef.bubbleColor);
    const tintMix = catDef.tintMix || 0;
    const patchedMats = new Set();
    gltfScene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material && !patchedMats.has(obj.material)) {
          obj.material = obj.material.clone();
          patchedMats.add(obj.material);
          if (obj.material.isMeshStandardMaterial) {
            obj.material.roughness = 0.65;
            obj.material.metalness = 0.04;
            if (tintMix > 0) {
              obj.material.color.lerp(tintCol, tintMix);
              obj.material.emissive.copy(auraCol);
              obj.material.emissiveIntensity = 0.14;
            }
          }
          obj.material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, animUniforms);
            shader.vertexShader = shader.vertexShader.replace(
              "#include <common>",
              `#include <common>
              uniform float uPhase;
              uniform float uSpeed;
              uniform float uTurn;
              uniform float uSquash;
              uniform float uTime;
              uniform float uMinY;
              uniform float uInvH;`
            );
            shader.vertexShader = shader.vertexShader.replace(
              "#include <begin_vertex>",
              `#include <begin_vertex>
              float h01 = clamp((transformed.y - uMinY) * uInvH, 0.0, 1.0);
              // 1. Alternating left/right paw stride on lower body
              float pawMask = smoothstep(0.44, 0.06, h01);
              float side = transformed.x >= 0.0 ? 1.0 : -1.0;
              float stride = sin(uPhase + side * 1.5708);
              float lift = max(0.0, cos(uPhase + side * 1.5708));
              transformed.z += stride * 0.14 * uSpeed * pawMask;
              transformed.y += lift * 0.11 * uSpeed * pawMask;

              // 2. Torso gallop arch & idle breathing
              float bodyMask = sin(h01 * 3.14159);
              transformed.y += sin(uPhase * 2.0) * 0.045 * uSpeed * bodyMask;
              transformed.z -= sin(uPhase * 2.0) * 0.04 * uSpeed * bodyMask;
              float breath = 1.0 + sin(uTime * 3.4) * 0.025 * bodyMask;
              transformed.x *= breath;
              transformed.z *= breath;

              // 3. Head, ears & witch hat follow-through whip on turns & speed
              float headMask = smoothstep(0.52, 1.0, h01);
              transformed.y += sin(uPhase * 2.0 - 0.65) * 0.05 * uSpeed * headMask;
              transformed.x += uTurn * 0.16 * headMask * headMask;
              transformed.z -= uSpeed * 0.09 * headMask * headMask;

              // 4. Tail / cape lively wag behind body
              float tailMask = smoothstep(0.06, 0.42, -transformed.z) * smoothstep(0.08, 0.62, h01);
              transformed.x += sin(uTime * 8.5 + uPhase * 1.35) * (0.035 + 0.085 * uSpeed) * tailMask;

              // 5. Elastic jelly squash-and-stretch on landing / jumps
              float sqY = 1.0 + uSquash * 0.22;
              float sqXZ = 1.0 / sqrt(max(0.55, sqY));
              transformed.y = uMinY + (transformed.y - uMinY) * sqY;
              transformed.x *= sqXZ;
              transformed.z *= sqXZ;`
            );
          };
          obj.material.customProgramCacheKey = () => "meow_vertex_run_v1";
          obj.material.needsUpdate = true;
        }
      }
    });
    kitty.add(gltfScene);
  }

  return { root, bubbleMesh, bubbleMat, kitty, accGroup, paws, tail, dizzyHalo, furball, shadow, mountExternalModel, isExternal: () => hasExternal, animUniforms };
}

// Helper: Stylized WitchSpring Storybook Tree!
function createStorybookTree(leafColor = 0x5fd468) {
  const tg = new THREE.Group();
  const trunk = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 1.35, 7), toonMat(0x8c5533)), 1.06));
  trunk.position.y = 0.65;
  tg.add(trunk);
  const foliage = [
    [0, 1.65, 0, 0.78],
    [-0.45, 1.42, 0.25, 0.56],
    [0.45, 1.45, -0.2, 0.58],
    [0.05, 2.08, -0.05, 0.52],
  ];
  const lMat = toonMat(leafColor);
  for (const [fx, fy, fz, fr] of foliage) {
    const puff = castRec(addOutline(new THREE.Mesh(new THREE.IcosahedronGeometry(fr, 1), lMat), 1.05));
    puff.position.set(fx, fy, fz);
    tg.add(puff);
  }
  return tg;
}

// Build Poster-Grade Natural Storybook 3D Scene!
export function buildTrackScene(track) {
  const group = new THREE.Group();
  const dynamicMeshes = { gears: [], hammers: [], stars: [], boosts: [], mushrooms: [], portal: null, portalAnchor: null, treeSlots: [], clouds: [], floaters: [], petals: null };

  group.add(createSkyDome(track));

  const cobbleTex = getCobbleGrassTex();
  const cliffTex = getCliffSideTex();
  const woodTex = getWoodPlankTex();
  const brassTex = getBrassTex();
  const rainbowTex = getRainbowBoostTex();
  const iceTex = getIceCrystalTex();

  // Multi-material Grass Island: Top = Hand-Painted Cobblestones, Sides = Hanging Grass + Cliff Rock!
  const grassSideMat = toonMat(0xffffff, 0x000000, 0, cliffTex);
  const grassTopMat = toonMat(0xffffff, 0x000000, 0, cobbleTex);
  const grassBoxMats = [grassSideMat, grassSideMat, grassTopMat, toonMat(0x6e4a35), grassSideMat, grassSideMat];

  const mats = {
    grassEdge: toonMat(0x67cc5e),
    grassDirt: toonMat(0x9a6d52),
    stoneCurb: toonMat(0xe5dfd3),
    wood: toonMat(0xffffff, 0x000000, 0, woodTex),
    woodPlank: toonMat(0xd4924c),
    woodPost: toonMat(0x824c27),
    rope: toonMat(0xd6b078),
    brass: toonMat(0xffffff, 0x000000, 0, brassTex),
    brassDark: toonMat(0x8c5c20),
    cloud: new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: getToonGradient(), transparent: true, opacity: 0.74 }),
    ice: new THREE.MeshToonMaterial({ color: 0xffffff, map: iceTex, gradientMap: getToonGradient(), emissive: 0x165e8a, emissiveIntensity: 0.25 }),
    neon: new THREE.MeshToonMaterial({ color: 0xff6ee6, gradientMap: getToonGradient(), emissive: 0xff2eb3, emissiveIntensity: 0.5, transparent: true, opacity: 0.86 }),
    crystal: toonMat(0x52398e, 0x2a1860, 0.35),
    rainbow: new THREE.MeshBasicMaterial({ map: rainbowTex, transparent: true, opacity: 0.94 }),
  };

  const flowerCols = [0xff85c0, 0xffe066, 0xffffff, 0x93c5fd];

  // 1. Multi-Material Floating Islands, Stone Curbs, Slatted Rope-Wood Bridges & Natural Trees!
  for (const p of track.platforms) {
    if (p.kind === "ramp" || p.kind === "ice_ramp") {
      const run = p.dir === "+x" ? p.w : p.d;
      const drop = p.yEnd - p.yStart;
      const len = Math.hypot(run, drop);
      const angle = Math.atan2(drop, run);

      const geom = new THREE.BoxGeometry(p.dir === "+x" ? len : p.w, p.h, p.dir === "-z" ? len : p.d);
      const mesh = castRec(addOutline(new THREE.Mesh(geom, p.kind === "ice_ramp" ? mats.ice : mats.wood), 1.016));
      // Exact cos(angle) vertical thickness compensation so visual ramp top == physics surface to 0.001m!
      mesh.position.set(p.x, (p.yStart + p.yEnd) / 2 - (p.h * 0.5) / Math.cos(angle), p.z);
      if (p.dir === "-z") mesh.rotation.x = angle;
      else if (p.dir === "+x") mesh.rotation.z = angle;
      group.add(mesh);
    } else if (p.kind === "wood") {
      // TRUE SLATTED ROPE-WOOD SUSPENSION BRIDGE (matching the cover poster!)
      const isZ = p.d >= p.w;
      const span = isZ ? p.d : p.w;
      const width = isZ ? p.w : p.d;
      const plankCount = Math.max(4, Math.floor(span / 0.62));
      const step = span / plankCount;
      for (let i = 0; i < plankCount; i++) {
        const offset = -span / 2 + (i + 0.5) * step;
        const pw = isZ ? width : step * 0.82;
        const pd = isZ ? step * 0.82 : width;
        const plank = castRec(addOutline(new THREE.Mesh(new THREE.BoxGeometry(pw, 0.24, pd), mats.woodPlank), 1.03));
        plank.position.set(p.x + (isZ ? 0 : offset), p.y - 0.12, p.z + (isZ ? offset : 0));
        group.add(plank);
      }
      // Side Rope Posts + Running Side Ropes!
      for (const s of [-1, 1]) {
        const ropeGeo = new THREE.CylinderGeometry(0.045, 0.045, span, 6);
        const rope = new THREE.Mesh(ropeGeo, mats.rope);
        if (isZ) {
          rope.rotation.x = Math.PI / 2;
          rope.position.set(p.x + s * (width * 0.48), p.y + 0.22, p.z);
        } else {
          rope.rotation.z = Math.PI / 2;
          rope.position.set(p.x, p.y + 0.22, p.z + s * (width * 0.48));
        }
        group.add(rope);
        for (let off = -span * 0.44; off <= span * 0.45; off += 2.4) {
          const post = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.68, 6), mats.woodPost), 1.08));
          post.position.set(p.x + (isZ ? s * width * 0.48 : off), p.y + 0.2, p.z + (isZ ? off : s * width * 0.48));
          group.add(post);
        }
      }
    } else if (p.kind === "grass") {
      // ORGANIC BEVELED ROUNDED FLOATING ISLAND (Eliminates rigid BoxGeometry!)
      const topGeo = createRoundedSlabGeo(p.w, p.d, 0.55, Math.min(p.w, p.d) * 0.24, 0.14);
      const topMesh = castRec(addOutline(new THREE.Mesh(topGeo, grassTopMat), 1.012), false, true);
      topMesh.position.set(p.x, p.y - 0.14, p.z);
      group.add(topMesh);

      // Sculpted Multi-Cluster Cliff Rock Underbelly (3 overlapping jagged storybook cliff cones!)
      const baseR = Math.min(p.w, p.d) * 0.52;
      const mainRock = castRec(addOutline(new THREE.Mesh(new THREE.ConeGeometry(baseR, 4.4, 7), mats.grassDirt), 1.022));
      mainRock.rotation.x = Math.PI;
      mainRock.position.set(p.x, p.y - 2.45, p.z);
      group.add(mainRock);
      for (const [ox, oz, sr, sh] of [[-0.28, 0.22, 0.58, 2.8], [0.3, -0.2, 0.52, 2.5], [0.18, 0.28, 0.45, 2.2]]) {
        const sub = castRec(addOutline(new THREE.Mesh(new THREE.ConeGeometry(baseR * sr, sh, 6), toonMat(0x8a6047)), 1.025));
        sub.rotation.x = Math.PI;
        sub.position.set(p.x + p.w * ox, p.y - sh * 0.5 - 0.35, p.z + p.d * oz);
        group.add(sub);
      }

      // Stylized Rounded Stone Boulders & Wildflower Tufts along the Island Rim!
      for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const fx = p.x + cx * (p.w * 0.39);
        const fz = p.z + cz * (p.d * 0.39);
        const boulder = castRec(addOutline(new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), mats.stoneCurb), 1.05));
        boulder.scale.set(1.2, 0.65, 1.0);
        boulder.position.set(fx, p.y + 0.1, fz);
        group.add(boulder);
        const bush = castRec(new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), mats.grassEdge));
        bush.scale.y = 0.68;
        bush.position.set(fx - cx * 0.36, p.y + 0.14, fz - cz * 0.36);
        group.add(bush);
        for (let f = 0; f < 3; f++) {
          const fl = new THREE.Mesh(
            new THREE.SphereGeometry(0.11, 6, 6),
            toonMat(flowerCols[(Math.abs(Math.round(fx + fz)) + f) % flowerCols.length])
          );
          fl.position.set(fx - cx * 0.36 + (f - 1) * 0.18, p.y + 0.34, fz - cz * 0.36 + (f % 2 === 0 ? 0.12 : -0.12));
          group.add(fl);
        }
      }
      // Plant a real Sculpted Hunyuan 3D Storybook Tree on large terraces!
      if (p.w >= 6.0) {
        const treeAnchor = new THREE.Group();
        treeAnchor.position.set(p.x - p.w * 0.38, p.y, p.z + p.d * 0.34);
        const tree = createStorybookTree(p.z < -20 ? 0x7ae582 : 0x5cd666);
        tree.scale.setScalar(0.82);
        treeAnchor.add(tree);
        group.add(treeAnchor);
        dynamicMeshes.treeSlots.push({ anchor: treeAnchor, scale: 2.9 });
      }
    } else {
      const topMat =
        p.kind === "cloud" ? mats.cloud
          : p.kind === "ice" ? mats.ice
            : p.kind === "neon" ? mats.neon
              : p.kind === "crystal" ? mats.crystal
                : mats.brass;
      const isRounded = p.kind === "brass" || p.kind === "crystal" || p.kind === "ice";
      const geo = isRounded ? createRoundedSlabGeo(p.w, p.d, p.h, Math.min(p.w, p.d) * 0.2, 0.12) : new THREE.BoxGeometry(p.w, p.h, p.d);
      const mesh = castRec(new THREE.Mesh(geo, topMat), false, true);
      mesh.position.set(p.x, isRounded ? p.y - 0.12 : p.y - p.h / 2, p.z);
      if (p.kind !== "cloud" && p.kind !== "neon") addOutline(mesh, 1.015);
      group.add(mesh);

      // Glowing Crystal Spires poking out of Aurora Crystal Islands!
      if (p.kind === "crystal" && p.w >= 5) {
        for (const [cx, cz] of [[-1, -1], [1, 1]]) {
          const spire = castRec(addOutline(new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), mats.ice), 1.05));
          spire.scale.set(0.65, 1.9, 0.65);
          spire.rotation.z = cx * 0.25;
          spire.position.set(p.x + cx * p.w * 0.44, p.y + 0.45, p.z + cz * p.d * 0.44);
          group.add(spire);
        }
      }

      if (p.kind === "neon" && p.d >= 8) {
        for (let zOff = -3.2; zOff <= 3.2; zOff += 3.2) {
          const runeRing = new THREE.Mesh(
            new THREE.TorusGeometry(1.55, 0.06, 8, 24),
            new THREE.MeshBasicMaterial({ color: 0x38f3ff, transparent: true, opacity: 0.82 })
          );
          runeRing.position.set(p.x, p.y + 1.45, p.z + zOff);
          group.add(runeRing);
        }
      }
    }
  }

  // 2. Rotating Interlocking Brass Gears!
  for (const g of track.gears) {
    const gGroup = new THREE.Group();
    gGroup.position.set(g.x, g.y - g.h / 2, g.z);
    gGroup.add(castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(g.r, g.r, g.h, 24), mats.brass), 1.022)));
    gGroup.add(castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(g.r * 0.32, g.r * 0.32, g.h + 0.18, 12), mats.brassDark), 1.04)));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tooth = castRec(addOutline(new THREE.Mesh(new THREE.BoxGeometry(0.62, g.h * 0.85, 0.72), mats.brass), 1.04));
      tooth.position.set(Math.cos(a) * (g.r + 0.2), 0, Math.sin(a) * (g.r + 0.2));
      tooth.rotation.y = -a;
      gGroup.add(tooth);
    }
    group.add(gGroup);
    dynamicMeshes.gears.push({ mesh: gGroup, def: g });
  }

  // 3. Swinging Carved Wooden Pendulum Hammers!
  for (const hm of track.hammers) {
    const arch = new THREE.Group();
    arch.position.set(hm.x, hm.y, hm.z);
    arch.add(castRec(addOutline(new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.36, 0.36), mats.brassDark), 1.04)));
    const mountGear = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.22, 10), mats.brass), 1.05));
    mountGear.rotation.x = Math.PI / 2;
    arch.add(mountGear);

    const pivot = new THREE.Group();
    const rod = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, hm.len, 8), mats.woodPlank), 1.08));
    rod.position.set(0, -hm.len / 2, 0);
    pivot.add(rod);
    const head = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 1.55, 14), toonMat(0x9e542a)), 1.05));
    head.rotation.z = Math.PI / 2;
    head.position.set(0, -hm.len, 0);
    pivot.add(head);
    for (const s of [-0.52, 0.52]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.59, 0.59, 0.14, 14), mats.brass);
      ring.rotation.z = Math.PI / 2;
      ring.position.set(s, -hm.len, 0);
      pivot.add(ring);
    }
    arch.add(pivot);
    group.add(arch);
    dynamicMeshes.hammers.push({ pivot, def: hm, worldHead: new THREE.Vector3(), velX: 0, velY: 0 });
  }

  // 4. Bouncy Red-Cap Spotted Mushrooms!
  for (const m of track.mushrooms) {
    const mg = new THREE.Group();
    mg.position.set(m.x, m.y, m.z);
    const stem = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.65, 12), toonMat(0xfff1d6)), 1.06));
    stem.position.y = 0.25;
    mg.add(stem);
    const cap = castRec(addOutline(new THREE.Mesh(new THREE.SphereGeometry(m.r * 0.92, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), toonMat(0xff4268, 0xff2244, 0.15)), 1.05));
    cap.position.y = 0.35;
    mg.add(cap);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), toonMat(0xffffff));
      dot.position.set(Math.cos(a) * 0.72, 0.85, Math.sin(a) * 0.72);
      mg.add(dot);
    }
    group.add(mg);
    dynamicMeshes.mushrooms.push({ mesh: mg, def: m, bounceAnim: 0 });
  }

  // 5. Animated Rainbow Chevron Speed Boost Strips!
  for (const b of track.boosts) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.08, b.d), mats.rainbow);
    strip.position.set(b.x, b.y, b.z);
    group.add(strip);
    dynamicMeshes.boosts.push({ mesh: strip, def: b, tex: rainbowTex });
  }

  // 6. Collectible Magic Star Candies!
  for (const st of track.stars) {
    const starMesh = castRec(addOutline(new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), toonMat(0xffde4d, 0xffaa00, 0.45)), 1.1));
    starMesh.position.set(st.x, st.y, st.z);
    group.add(starMesh);
    dynamicMeshes.stars.push({ mesh: starMesh, def: st, collected: false });
  }

  // 7. Grand Storybook Golden Archway Finish Portal!
  const f = track.finish;
  const portalGroup = new THREE.Group();
  portalGroup.position.set(f.x, f.y, f.z);
  const portalArchHolder = new THREE.Group();
  for (const s of [-2.05, 2.05]) {
    const pil = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 2.3, 10), mats.stoneCurb), 1.05));
    pil.position.set(s, 1.15, 0);
    portalArchHolder.add(pil);
  }
  const archRing = castRec(addOutline(new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.3, 12, 24, Math.PI), toonMat(0xffd54a, 0xffa000, 0.38)), 1.05));
  archRing.position.y = 2.1;
  portalArchHolder.add(archRing);
  portalGroup.add(portalArchHolder);
  const swirl = new THREE.Mesh(
    new THREE.CircleGeometry(1.75, 24),
    new THREE.MeshBasicMaterial({ color: track.id === "aurora" ? 0xc084fc : 0xffe57f, transparent: true, opacity: 0.72, side: THREE.DoubleSide })
  );
  swirl.position.y = 1.85;
  portalGroup.add(swirl);
  group.add(portalGroup);
  dynamicMeshes.portal = swirl;
  dynamicMeshes.portalAnchor = portalArchHolder;

  // 8. Lush Distant Floating Sky Islands with Storybook Trees & Stone Ruin Arches!
  const decoIslands = [
    [-20, 8, -14, 3.6], [19, 5, -22, 4.0], [-22, 4, -40, 4.4], [21, 9, -46, 3.4], [2, 11, -68, 5.4],
    [-12, 12, -56, 3.2], [16, 10, -4, 3.1],
  ];
  for (const [ix, iy, iz, ir] of decoIslands) {
    const ig = new THREE.Group();
    ig.position.set(ix, iy, iz);
    const cone = addOutline(new THREE.Mesh(new THREE.ConeGeometry(ir, ir * 1.45, 7), mats.grassDirt), 1.03);
    cone.rotation.x = Math.PI;
    cone.position.y = -ir * 0.72;
    ig.add(cone);
    const top = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(ir, ir * 0.96, 0.6, 8), track.id === "aurora" ? mats.crystal : mats.grassEdge), 1.03);
    ig.add(top);
    if (track.id !== "aurora") {
      const t1 = createStorybookTree(track.id === "clockwork" ? 0xff9e5e : 0x62d468);
      t1.scale.setScalar(ir * 0.28);
      t1.position.set(-ir * 0.32, 0.25, 0.2);
      ig.add(t1);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(ir * 0.32, 0.22, 6, 12, Math.PI), mats.stoneCurb);
    arch.position.set(ir * 0.2, 0.25, -0.2);
    ig.add(arch);
    group.add(ig);
    dynamicMeshes.floaters.push({ mesh: ig, baseY: iy, seed: ix + iz });
  }

  // 9. Thick, Billowing Multi-Layer Cloud Sea beneath the Floating World!
  const cloudMat = new THREE.MeshToonMaterial({
    color: track.id === "aurora" ? 0x382563 : track.id === "clockwork" ? 0xffe0bd : 0xffffff,
    gradientMap: getToonGradient(),
    transparent: true,
    opacity: 0.9,
  });
  for (let i = 0; i < 42; i++) {
    const cg = new THREE.Group();
    const cx = Math.sin(i * 3.17) * 44;
    const cy = -5.5 - (i % 4) * 2.2;
    const cz = -i * 2.1 + 14;
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(2.8 + (k === 1 ? 1.5 : 0.4), 10, 8), cloudMat);
      puff.position.set((k - 1.5) * 2.1, k === 1 ? 0.8 : 0, (k % 2) * 0.9);
      puff.scale.y = 0.52;
      cg.add(puff);
    }
    cg.position.set(cx, cy, cz);
    group.add(cg);
    dynamicMeshes.clouds.push({ mesh: cg, baseX: cx, seed: i });
  }

  // 10. Drifting Ambient Magic Petals / Fireflies / Starlight Particles!
  const pCount = 90;
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 46;
    pPos[i * 3 + 1] = 1 + Math.random() * 14;
    pPos[i * 3 + 2] = -Math.random() * 68 + 8;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: track.id === "aurora" ? 0x7ef9ff : track.id === "clockwork" ? 0xffe28a : 0xffb8dc,
    size: 0.28,
    transparent: true,
    opacity: 0.82,
  });
  const petals = new THREE.Points(pGeo, pMat);
  group.add(petals);
  dynamicMeshes.petals = petals;

  return { group, dynamicMeshes };
}
