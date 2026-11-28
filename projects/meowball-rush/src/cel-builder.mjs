// Meowball Rush v0.3.0 — Poster-Grade WitchSpring R Natural Storybook 3D Scene Factory
// Multi-material Cliff/Grass Floating Islands (ZERO stretched sides!), 3D Stone Curbs,
// Slatted Rope-Wood Bridges, Stylized Cel-Shaded Trees & Wildflowers, Layered Cloud Sea,
// Drifting Magic Petals, Real-Time Soft Shadows & Hand-Painted Anime Kitten Face!
import * as THREE from "three";
import { addV3Platform, buildV3World } from "./v3-worlds.mjs";
import { boostRibbonGeometry } from "./course-geometry.mjs";
export { animateFairytaleScenery } from "./v3-worlds.mjs";
import cobblePathTexUrl from "./assets/textures/tex-cobble-path.webp";
import meadowGrassTexUrl from "./assets/textures/tex-meadow-grass.webp";
import cliffRockTexUrl from "./assets/textures/tex-cliff-rock.webp";
import honeyAmberTexUrl from "./assets/textures/tex-honey-amber.webp";

const _texLoader = new THREE.TextureLoader();
function loadHandPaintedTex(key, url, rx = 1, ry = 1) {
  if (TEX_CACHE[key]) return TEX_CACHE[key];
  if (typeof Image === "undefined") {
    const dt = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    dt.needsUpdate = true;
    TEX_CACHE[key] = dt;
    return dt;
  }
  const tex = _texLoader.load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  TEX_CACHE[key] = tex;
  return tex;
}

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
  return loadHandPaintedTex("hp_cobble_v1", cobblePathTexUrl, 1.4, 1.4);
}

function getMeadowGrassTex() {
  return loadHandPaintedTex("hp_meadow_v1", meadowGrassTexUrl, 2.0, 2.0);
}

function getCliffSideTex() {
  return loadHandPaintedTex("hp_cliff_v1", cliffRockTexUrl, 1.5, 1.0);
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

// Sticky Honey-Caramel Mud Slowdown Trap Hand-Painted Seamless Texture!
function getHoneyMudTex() {
  return loadHandPaintedTex("hp_honey_v1", honeyAmberTexUrl, 1.5, 1.5);
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
  const isNight = track.id === "aurora" || track.worldType === "starlight_library";
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
  const sky = new THREE.Mesh(new THREE.SphereGeometry(145, 24, 16), mat);
  sky.name = "storybook-sky";
  return sky;
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
  // Charms use the bubble's origin, independently of the kitty's hopping/leaning.
  // This conservative radius also covers every later orbit and local spin.
  const accessoryOrbits = [];
  function fitAccessoriesInsideBubble() {
    function radiusOf(node) {
      let radius = 0;
      if (node.geometry) {
        node.geometry.computeBoundingSphere();
        const sphere = node.geometry.boundingSphere;
        radius = sphere.center.length() + sphere.radius;
      }
      for (const child of node.children) {
        const scale = Math.max(Math.abs(child.scale.x), Math.abs(child.scale.y), Math.abs(child.scale.z));
        radius = Math.max(radius, child.position.length() + radiusOf(child) * scale);
      }
      return radius;
    }
    accGroup.scale.setScalar(Math.min(1, 0.55 / (radiusOf(accGroup) || 1)));
    accGroup.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }
  fitAccessoriesInsideBubble();
  root.add(accGroup);

  function addFloatingAccessories() {
    accGroup.clear();
    accGroup.scale.setScalar(1);
    accessoryOrbits.length = 0;
    accGroup.name = `charms-${catDef.id}`;
    const gold = toonMat(0xffcf58, 0xffad32, 0.24);
    const glow = (color) => toonMat(color, color, 0.65);
    const accent = glow(catDef.trailColor || catDef.bubbleColor);
    function mesh(geometry, material, x = 0, y = 0, z = 0, parent = accGroup) {
      const item = new THREE.Mesh(geometry, material);
      item.position.set(x, y, z);
      parent.add(item);
      return item;
    }
    function orbit(speed, phase = 0) {
      const pivot = new THREE.Group();
      pivot.rotation.y = phase;
      accGroup.add(pivot);
      accessoryOrbits.push({ pivot, speed, phase });
      return pivot;
    }
    function pip(parent, x, y, z, size = 0.032, material = accent) {
      const star = mesh(new THREE.OctahedronGeometry(size, 0), material, x, y, z, parent);
      star.scale.y = 1.5;
      return star;
    }

    if (catDef.acc === "crown") {
      const crown = new THREE.Group();
      crown.position.set(0, 0.405, -0.035);
      accGroup.add(crown);
      const rim = mesh(new THREE.TorusGeometry(0.105, 0.018, 6, 20), gold, 0, 0, 0, crown);
      rim.rotation.x = Math.PI / 2;
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        mesh(new THREE.ConeGeometry(0.027, 0.075, 4), gold, Math.cos(a) * 0.095, 0.038, Math.sin(a) * 0.095, crown);
        pip(crown, Math.cos(a) * 0.095, 0.083, Math.sin(a) * 0.095, 0.016);
      }
    } else if (catDef.acc === "goggles") {
      const lensMat = glow(0x55eeff);
      const frameMat = toonMat(catDef.id === "cloud_explorer" ? 0xf4e4ae : 0x156b94, 0x32dfff, 0.25);
      for (const s of [-1, 1]) {
        mesh(new THREE.TorusGeometry(0.066, 0.014, 6, 18), frameMat, s * 0.082, 0.205, -0.375);
        const lens = mesh(new THREE.SphereGeometry(0.052, 12, 8), lensMat, s * 0.082, 0.205, -0.378);
        lens.scale.z = 0.22;
      }
      mesh(new THREE.BoxGeometry(0.05, 0.018, 0.02), frameMat, 0, 0.205, -0.375);
      const halo = mesh(new THREE.TorusGeometry(0.19, 0.008, 5, 28), lensMat, 0, 0.32, 0);
      halo.rotation.x = Math.PI / 2;
      if (catDef.id === "cloud_explorer") {
        // A little cloud crest distinguishes the explorer from the SSR racing visor.
        for (const [x, y, r] of [[-0.045, 0.37, 0.035], [0, 0.39, 0.045], [0.045, 0.37, 0.035]]) {
          mesh(new THREE.SphereGeometry(r, 8, 6), glow(0xe7f7ff), x, y, 0.1);
        }
      } else {
        for (const s of [-1, 1]) pip(accGroup, s * 0.25, 0.16, -0.25, 0.038, lensMat);
      }
    } else if (catDef.acc === "ribbon") {
      const bow = new THREE.Group();
      bow.position.set(0, 0.36, -0.16);
      accGroup.add(bow);
      for (const s of [-1, 1]) {
        const loop = mesh(new THREE.SphereGeometry(0.067, 10, 8), glow(0xffb6d8), s * 0.07, 0.015, 0, bow);
        loop.scale.set(1.15, 0.7, 0.42);
        loop.rotation.z = s * 0.35;
        const ribbon = mesh(new THREE.ConeGeometry(0.035, 0.095, 3), toonMat(0xff81b6), s * 0.043, -0.06, 0.005, bow);
        ribbon.rotation.z = s * 0.35 + Math.PI;
      }
      mesh(new THREE.SphereGeometry(0.032, 8, 6), gold, 0, 0.012, -0.008, bow);
      const petals = orbit(-0.55);
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        pip(petals, Math.cos(a) * 0.39, 0.1, Math.sin(a) * 0.39, 0.025, glow(0xffb6d8));
      }
    } else if (catDef.acc === "bell") {
      const bellOrbit = orbit(catDef.id === "calico_mint" ? -0.7 : 0.65, -0.8);
      const bell = new THREE.Group();
      bell.position.set(0.37, 0.035, 0);
      bellOrbit.add(bell);
      mesh(new THREE.SphereGeometry(0.06, 10, 8), gold, 0, 0, 0, bell);
      const lip = mesh(new THREE.TorusGeometry(0.053, 0.012, 6, 14), gold, 0, -0.032, 0, bell);
      lip.rotation.x = Math.PI / 2;
      mesh(new THREE.SphereGeometry(0.014, 8, 6), toonMat(0x8b5a21), 0, -0.057, 0, bell);
      const loop = mesh(new THREE.TorusGeometry(0.022, 0.008, 5, 12), gold, 0, 0.067, 0, bell);
      loop.rotation.y = Math.PI / 2;
      const stars = orbit(-0.45, 1.2);
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        pip(stars, Math.cos(a) * 0.39, 0.18, Math.sin(a) * 0.39);
      }
      // Mint's clover and Starbell's butterfly make the two SR bells distinct in silhouette.
      const crest = new THREE.Group();
      crest.position.set(0, 0.38, -0.09);
      accGroup.add(crest);
      if (catDef.id === "calico_mint") {
        for (const [x, y] of [[-0.033, 0.02], [0.033, 0.02], [0, 0.065]]) {
          mesh(new THREE.SphereGeometry(0.036, 8, 6), accent, x, y, 0, crest);
        }
      } else {
        for (const s of [-1, 1]) {
          const wing = mesh(new THREE.SphereGeometry(0.05, 8, 6), accent, s * 0.045, 0, 0, crest);
          wing.scale.set(0.8, 1.2, 0.3);
          wing.rotation.z = -s * 0.4;
        }
        pip(crest, 0, 0, 0, 0.023, gold);
      }
    } else if (catDef.acc === "scarf") {
      const ring = mesh(new THREE.TorusGeometry(0.365, 0.025, 8, 32), glow(0xffab3d), 0, -0.03, 0);
      ring.rotation.set(Math.PI / 2, 0.12, 0.12);
      const sparks = orbit(0.8);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        pip(sparks, Math.cos(a) * 0.38, -0.03, Math.sin(a) * 0.38, 0.032, gold);
      }
    } else if (catDef.acc === "witch_hat") {
      const phantom = catDef.id === "phantom_tuxedo";
      const wisps = orbit(phantom ? -0.65 : 0.55, 0.4);
      for (const s of [-1, 1]) {
        const wisp = new THREE.Group();
        wisp.position.set(s * 0.365, 0.2, 0);
        wisps.add(wisp);
        mesh(new THREE.SphereGeometry(0.045, 10, 8), accent, 0, 0, 0, wisp);
        pip(wisp, 0, 0.06, 0, 0.022, gold);
        for (let i = 1; i <= 3; i++) {
          mesh(new THREE.SphereGeometry(0.025 / i, 6, 4), accent, -s * i * 0.023, -i * 0.025, i * 0.018, wisp);
        }
      }
      if (phantom) {
        // A silver mask crest accompanies the rogue's rose wisps.
        for (const s of [-1, 1]) pip(accGroup, s * 0.047, 0.37, -0.18, 0.047, glow(0xffe9f3));
      }
    }

    if (catDef.rarity === "SSR") {
      const crystals = orbit(-0.45, Math.PI / 3);
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        pip(crystals, Math.cos(a) * 0.405, -0.12, Math.sin(a) * 0.405, 0.046);
      }
    }
    fitAccessoriesInsideBubble();
  }

  function updateAccessories(time) {
    accGroup.rotation.y = kitty.rotation.y;
    for (const { pivot, speed, phase } of accessoryOrbits) pivot.rotation.y = phase + time * speed;
  }

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
        obj.frustumCulled = false; // Prevent SkinnedMesh bounding-box culling during skeletal animation!
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
          // Only attach procedural vertex-shader stride to static (non-skinned) meshes; rigged SkinnedMeshes use real Blender bones!
          if (!obj.isSkinnedMesh) {
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
                float pawMask = smoothstep(0.44, 0.06, h01);
                float side = transformed.x >= 0.0 ? 1.0 : -1.0;
                float stride = sin(uPhase + side * 1.5708);
                float lift = max(0.0, cos(uPhase + side * 1.5708));
                transformed.z += stride * 0.14 * uSpeed * pawMask;
                transformed.y += lift * 0.11 * uSpeed * pawMask;
                float bodyMask = sin(h01 * 3.14159);
                transformed.y += sin(uPhase * 2.0) * 0.045 * uSpeed * bodyMask;
                transformed.z -= sin(uPhase * 2.0) * 0.04 * uSpeed * bodyMask;
                float breath = 1.0 + sin(uTime * 3.4) * 0.025 * bodyMask;
                transformed.x *= breath;
                transformed.z *= breath;
                float headMask = smoothstep(0.52, 1.0, h01);
                transformed.y += sin(uPhase * 2.0 - 0.65) * 0.05 * uSpeed * headMask;
                transformed.x += uTurn * 0.16 * headMask * headMask;
                transformed.z -= uSpeed * 0.09 * headMask * headMask;
                float tailMask = smoothstep(0.06, 0.42, -transformed.z) * smoothstep(0.08, 0.62, h01);
                transformed.x += sin(uTime * 8.5 + uPhase * 1.35) * (0.035 + 0.085 * uSpeed) * tailMask;
                float sqY = 1.0 + uSquash * 0.22;
                float sqXZ = 1.0 / sqrt(max(0.55, sqY));
                transformed.y = uMinY + (transformed.y - uMinY) * sqY;
                transformed.x *= sqXZ;
                transformed.z *= sqXZ;`
              );
            };
            obj.material.customProgramCacheKey = () => "meow_vertex_run_v1";
          }
          obj.material.needsUpdate = true;
        }
      }
    });
    kitty.add(gltfScene);
    addFloatingAccessories();
  }

  return { root, bubbleMesh, bubbleMat, kitty, accGroup, paws, tail, dizzyHalo, furball, shadow, mountExternalModel, updateAccessories, isExternal: () => hasExternal, animUniforms };
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

// Shared with collision handling: a neighboring deck opens a doorway in an X-side curb.
// Values are world-space Z intervals, expanded slightly so a rolling bubble clears the ends.
export function getSideWallOpenings(p, platforms, side) {
  const edgeX = p.x + side * p.w / 2;
  const openings = [];
  for (const q of platforms) {
    if (q === p) continue;
    const left = q.x - q.w / 2;
    const right = q.x + q.w / 2;
    if (left > edgeX + 0.28 || right < edgeX - 0.28) continue;
    if ((q.x + side * q.w / 2 - edgeX) * side < 0.12) continue;
    let lo = Math.max(p.z - p.d / 2, q.z - q.d / 2);
    let hi = Math.min(p.z + p.d / 2, q.z + q.d / 2);
    if (hi <= lo) continue;

    if (q.kind === "ramp" || q.kind === "ice_ramp") {
      const drop = q.yEnd - q.yStart;
      if (q.dir === "-z" && Math.abs(drop) > 0.0001) {
        const za = q.z + q.d / 2 - ((p.y - 0.3 - q.yStart) / drop) * q.d;
        const zb = q.z + q.d / 2 - ((p.y + 0.3 - q.yStart) / drop) * q.d;
        lo = Math.max(lo, Math.min(za, zb));
        hi = Math.min(hi, Math.max(za, zb));
      } else {
        const t = q.dir === "+x" ? THREE.MathUtils.clamp((edgeX - q.x) / q.w + 0.5, 0, 1) : 0.5;
        if (Math.abs(q.yStart + t * drop - p.y) > 0.3) continue;
      }
    } else {
      const qY = q.y + (q.kind === "trough" ? 0.6 * Math.pow(THREE.MathUtils.clamp((edgeX - q.x) / (q.w / 2), -1, 1), 2) : 0);
      if (Math.abs(qY - p.y) > 0.3) continue;
    }
    if (hi > lo) openings.push([lo - 0.2, hi + 0.2]);
  }
  return openings.sort((a, b) => a[0] - b[0]);
}

// Z-end curbs share their world-X doorways with physics. Narrow passages retain
// the center route while the bumper plazas catch outward diagonal ricochets.
export function getEndWallOpenings(p, platforms, side, gears = []) {
  const rotate = (q) => {
    const rotated = { ...q, x: q.z, z: q.x, w: q.d, d: q.w };
    if (q.kind === "ramp" || q.kind === "ice_ramp") {
      rotated.dir = q.dir === "-z" ? "+x" : "-z";
      rotated.yStart = q.yEnd;
      rotated.yEnd = q.yStart;
    }
    return rotated;
  };
  const rotatedPad = rotate(p);
  const openings = getSideWallOpenings(rotatedPad,
    platforms.map(q => q === p ? rotatedPad : rotate(q)), side);
  const edgeZ = p.z + side * p.d / 2;
  for (const gear of gears) {
    if (Math.abs(gear.y - p.y) > 0.3 || (gear.z + side * gear.r - edgeZ) * side < 0.12) continue;
    const dz = edgeZ - gear.z;
    if (Math.abs(dz) >= gear.r) continue;
    const halfChord = Math.sqrt(gear.r * gear.r - dz * dz);
    const lo = Math.max(p.x - p.w / 2, gear.x - halfChord);
    const hi = Math.min(p.x + p.w / 2, gear.x + halfChord);
    if (hi > lo) openings.push([lo - 0.2, hi + 0.2]);
  }
  return openings.map(([lo, hi]) => {
    const center = (lo + hi) / 2;
    return [Math.max(lo, center - 1.25), Math.min(hi, center + 1.25)];
  }).sort((a, b) => a[0] - b[0]);
}

function extrudeChannelSection(shape, length) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 8, steps: 1 });
  geometry.translate(0, 0, -length / 2);
  return geometry;
}

// Build Poster-Grade Natural Storybook 3D Scene!
export function buildTrackScene(track) {
  const group = new THREE.Group();
  const dynamicMeshes = { gears: [], hammers: [], rollingPins: [], bumpers: [], steamVents: [], stars: [], boosts: [], mushrooms: [], elevators: [], portal: null, portalAnchor: null, treeSlots: [], propSlots: [], clouds: [], floaters: [], petals: null };

  const sky = createSkyDome(track);
  group.add(sky);
  dynamicMeshes.sky = sky;

  const cobbleTex = getCobbleGrassTex();
  const cliffTex = getCliffSideTex();
  const woodTex = getWoodPlankTex();
  const brassTex = getBrassTex();
  const rainbowTex = getRainbowBoostTex();
  const iceTex = getIceCrystalTex();
  const mudTex = getHoneyMudTex();

  // Multi-material Grass Island: Top = Hand-Painted Cobblestones, Sides = Hanging Grass + Cliff Rock!
  const grassSideMat = toonMat(0xffffff, 0x000000, 0, cliffTex);
  const grassTopMat = toonMat(0xffffff, 0x000000, 0, cobbleTex);
  const grassBoxMats = [grassSideMat, grassSideMat, grassTopMat, toonMat(0x6e4a35), grassSideMat, grassSideMat];

  const mats = {
    grassEdge: toonMat(0x67cc5e),
    grassDirt: toonMat(0x9a6d52),
    stoneCurb: toonMat(0xe5dfd3),
    wood: Object.assign(toonMat(0xffffff, 0x000000, 0, woodTex), { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    woodPlank: Object.assign(toonMat(0xd4924c), { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    woodPost: toonMat(0x824c27),
    rope: toonMat(0xd6b078),
    brass: toonMat(0xffffff, 0x000000, 0, brassTex),
    brassDark: toonMat(0x8c5c20),
    cloud: new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: getToonGradient(), transparent: true, opacity: 0.74 }),
    ice: new THREE.MeshToonMaterial({ color: 0xffffff, map: iceTex, gradientMap: getToonGradient(), emissive: 0x165e8a, emissiveIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    neon: new THREE.MeshToonMaterial({ color: 0xff6ee6, gradientMap: getToonGradient(), emissive: 0xff2eb3, emissiveIntensity: 0.5, transparent: true, opacity: 0.86, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    crystal: toonMat(0x52398e, 0x2a1860, 0.35),
    mud: new THREE.MeshToonMaterial({ color: 0xffffff, map: mudTex, gradientMap: getToonGradient(), emissive: 0x78350f, emissiveIntensity: 0.16, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
    rainbow: new THREE.MeshBasicMaterial({ map: rainbowTex, transparent: true, opacity: 0.94, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };

  const flowerCols = [0xff85c0, 0xffe066, 0xffffff, 0x93c5fd];

  // Reserve the outer corners for landmarks; bridges and the rolling lane stay clear.
  const plazas = track.worldType ? [] : track.platforms.filter((p) => p.w >= 6 && p.d >= 6 && !p.kind.includes("ramp") && !p.walls && p.kind !== "trough" && p.kind !== "elevator");
  const contains = (p, point) => Math.abs(point.x - p.x) <= p.w / 2 && Math.abs(point.z - p.z) <= p.d / 2;
  const startPlaza = plazas.find((p) => contains(p, track.start) && Math.abs(p.y - (track.start.y - 0.6)) < 0.2);
  const finishPlaza = plazas.find((p) => contains(p, track.finish) && Math.abs(p.y - track.finish.y) < 0.2);
  const propCorners = new Map(plazas.map((p) => [p, new Set()]));
  function addPropSlot(p, key, sx, sz, scale, footprint, role) {
    propCorners.get(p).add(`${sx},${sz}`);
    // Small stone corner ledges support the props beyond the island's rounded top.
    const x = p.x + sx * p.w * 0.42;
    const z = p.z + sz * p.d * 0.42;
    const y = p.y + (p.kind === "mud" ? -0.016 : p.kind === "ice" ? 0.008 : p.kind === "neon" ? 0.014 : 0);
    const ledge = castRec(new THREE.Mesh(createRoundedSlabGeo(0.98, 0.98, 0.28, 0.12, 0.04), mats.stoneCurb));
    ledge.position.set(x, y - 0.04, z);
    group.add(ledge);
    const anchor = new THREE.Group();
    anchor.position.set(x, y, z);
    group.add(anchor);
    dynamicMeshes.propSlots.push({ key, anchor, y, scale, rotation: key === "fountain-center" ? 0 : Math.PI / 2, maxFootprint: footprint, platform: p, role });

    if (key === "fountain-center") {
      // Kenney's center is the stone floor + water tile; frame it as a tiny fountain.
      const basin = new THREE.Group();
      basin.position.set(x, y, z);
      for (const side of [-1, 1]) {
        const rimX = castRec(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.18, 0.055), mats.stoneCurb));
        rimX.position.set(0, 0.09, side * 0.405);
        basin.add(rimX);
        const rimZ = castRec(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 0.76), mats.stoneCurb));
        rimZ.position.set(side * 0.405, 0.09, 0);
        basin.add(rimZ);
      }
      const spout = castRec(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.08, 0.3, 8), mats.stoneCurb));
      spout.position.y = 0.17;
      basin.add(spout);
      const waterMat = toonMat(0x75e5ff, 0x38bdf8, 0.4);
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.16, 6), waterMat);
      jet.position.y = 0.38;
      basin.add(jet);
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), waterMat);
      drop.scale.y = 1.4;
      drop.position.y = 0.49;
      basin.add(drop);
      group.add(basin);
    }
  }
  for (const p of plazas) {
    if (p === startPlaza || p === finishPlaza) {
      const back = p === startPlaza ? 1 : -1;
      const role = p === startPlaza ? "start" : "finish";
      for (const side of [-1, 1]) addPropSlot(p, "banner-red", side, -back, 1.65, { x: 0.76, z: 0.14 }, role);
      addPropSlot(p, "fence", 1, back, 1.35, { x: 0.82, z: 0.14 }, role);
    } else {
      const role = (track.checkpoints || []).some((cp) => contains(p, cp) && Math.abs(cp.y - p.y) < 0.2) ? "checkpoint" : "terrace";
      addPropSlot(p, "fountain-center", 1, -1, 0.76, { x: 0.76, z: 0.76 }, role);
    }
  }

  // A detached workshop display beside the lower dock. It is scenery only;
  // keeping it out of track.platforms leaves a visible gap beside the route.
  if (track.id === "gear_outpost") {
    const display = { kind: "brass", x: 8.6, y: 5, z: -48, w: 5.5, d: 6, h: 0.8 };
    const ledge = castRec(addOutline(new THREE.Mesh(createRoundedSlabGeo(display.w, display.d, display.h, 0.85, 0.12), mats.brassDark), 1.012));
    ledge.name = "seesaw-scenery-ledge";
    ledge.position.set(display.x, display.y - 0.12, display.z);
    group.add(ledge);
    const anchor = new THREE.Group();
    anchor.name = "seesaw-scenery-anchor";
    anchor.position.set(display.x, display.y, display.z);
    group.add(anchor);
    const fallback = new THREE.Group();
    fallback.name = "seesaw-fallback";
    const fulcrum = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.9, 12), mats.brass), 1.035));
    fulcrum.rotation.z = Math.PI / 2;
    fulcrum.position.y = 0.56;
    fallback.add(fulcrum);
    const board = castRec(addOutline(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.18, 4.4), mats.woodPlank), 1.025));
    board.position.y = 1.12;
    board.rotation.x = 0.16;
    fallback.add(board);
    for (const side of [-1, 1]) {
      const endBand = castRec(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.12), mats.brassDark));
      endBand.position.set(0, 1.12 - Math.sin(0.16) * side * 1.85, Math.cos(0.16) * side * 1.85);
      endBand.rotation.x = 0.16;
      fallback.add(endBand);
    }
    anchor.add(fallback);
    dynamicMeshes.propSlots.push({ key: "hazard-seesaw", anchor, fallback, y: display.y, scale: 4.4, rotation: 0, maxFootprint: { x: 2.1, z: 4.8 }, platform: display, role: "scenery" });
  }

  function addSideCurbs(p, parent = group, local = false) {
    for (const side of [-1, 1]) {
      const openings = getSideWallOpenings(p, track.platforms, side);
      const segments = [];
      let cursor = p.z - p.d / 2;
      for (const [lo, hi] of openings) {
        if (lo > cursor) segments.push([cursor, Math.min(lo, p.z + p.d / 2)]);
        cursor = Math.max(cursor, hi);
      }
      if (cursor < p.z + p.d / 2) segments.push([cursor, p.z + p.d / 2]);
      for (const [lo, hi] of segments) {
        if (hi - lo < 0.08) continue;
        const length = hi - lo;
        const x = (local ? 0 : p.x) + side * (p.w / 2 + 0.12);
        const y = local ? 0 : p.y;
        const z = (lo + hi) / 2 - (local ? p.z : 0);
        const stone = castRec(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.44, length), mats.stoneCurb));
        stone.name = "side-curb-stone";
        stone.position.set(x, y + 0.22, z);
        parent.add(stone);
        const timber = castRec(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.11, length), mats.woodPlank));
        timber.name = "side-curb-timber";
        timber.position.set(x, y + 0.495, z);
        parent.add(timber);
      }
    }
  }

  function addEndCurbs(p) {
    for (const side of [-1, 1]) {
      const openings = getEndWallOpenings(p, track.platforms, side, track.gears);
      const segments = [];
      let cursor = p.x - p.w / 2;
      for (const [lo, hi] of openings) {
        if (lo > cursor) segments.push([cursor, Math.min(lo, p.x + p.w / 2)]);
        cursor = Math.max(cursor, hi);
      }
      if (cursor < p.x + p.w / 2) segments.push([cursor, p.x + p.w / 2]);
      for (const [lo, hi] of segments) {
        if (hi - lo < 0.08) continue;
        const length = hi - lo;
        const x = (lo + hi) / 2;
        const z = p.z + side * (p.d / 2 + 0.12);
        const stone = castRec(new THREE.Mesh(new THREE.BoxGeometry(length, 0.44, 0.24), mats.stoneCurb));
        stone.name = "end-curb-stone";
        stone.position.set(x, p.y + 0.22, z);
        group.add(stone);
        const timber = castRec(new THREE.Mesh(new THREE.BoxGeometry(length, 0.11, 0.24), mats.woodPlank));
        timber.name = "end-curb-timber";
        timber.position.set(x, p.y + 0.495, z);
        group.add(timber);
      }
    }
  }

  // 1. Multi-Material Floating Islands, Stone Curbs, Slatted Rope-Wood Bridges & Natural Trees!
  for (const p of track.platforms) {
    if (track.worldType) { addV3Platform(track, p, group, mats); continue; }
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
    } else if (p.kind === "trough") {
      const channel = new THREE.Group();
      channel.name = "parabolic-stone-trough";
      channel.position.set(p.x, p.y, p.z);
      const halfWidth = p.w / 2;
      const thickness = Math.max(0.32, Math.min(p.h ?? 0.6, 0.65));
      const section = new THREE.Shape();
      for (let i = 0; i <= 32; i++) {
        const x = -halfWidth + p.w * i / 32;
        const y = 0.6 * Math.pow(x / halfWidth, 2);
        if (i === 0) section.moveTo(x, y);
        else section.lineTo(x, y);
      }
      for (let i = 32; i >= 0; i--) {
        const x = -halfWidth + p.w * i / 32;
        section.lineTo(x, 0.6 * Math.pow(x / halfWidth, 2) - thickness);
      }
      section.closePath();
      channel.add(castRec(new THREE.Mesh(extrudeChannelSection(section, p.d), mats.stoneCurb)));

      // Curved stone cheeks rise outside the usable channel width. Z ends stay open.
      for (const side of [-1, 1]) {
        const wallSection = new THREE.Shape();
        wallSection.moveTo(side * halfWidth, 0.6 - thickness);
        wallSection.lineTo(side * halfWidth, 0.76);
        wallSection.quadraticCurveTo(side * halfWidth, 1.28, side * (halfWidth + 0.18), 1.35);
        wallSection.lineTo(side * (halfWidth + 0.36), 1.35);
        wallSection.quadraticCurveTo(side * (halfWidth + 0.49), 1.1, side * (halfWidth + 0.46), 0.48 - thickness);
        wallSection.closePath();
        channel.add(castRec(new THREE.Mesh(extrudeChannelSection(wallSection, p.d), mats.stoneCurb)));
        const rim = castRec(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, p.d, 8), mats.woodPost));
        rim.rotation.x = Math.PI / 2;
        rim.position.set(side * (halfWidth + 0.25), 1.28, 0);
        channel.add(rim);
      }
      // Inlaid seams and timber braces make the channel read as crafted stonework.
      for (let z = -p.d / 2 + 1.2; z < p.d / 2 - 0.3; z += 2.6) {
        const points = [];
        for (let i = 0; i <= 20; i++) {
          const x = -halfWidth + p.w * i / 20;
          points.push(new THREE.Vector3(x, 0.6 * Math.pow(x / halfWidth, 2) + 0.008, z));
        }
        channel.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.012, 4, false), mats.woodPost));
        const brace = castRec(new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.84, 0.16, 0.22), mats.woodPlank));
        brace.position.set(0, -thickness - 0.08, z);
        channel.add(brace);
      }
      group.add(channel);
    } else if (p.kind === "elevator") {
      const elevator = new THREE.Group();
      elevator.name = "rune-stone-elevator";
      elevator.position.set(p.x, p.y, p.z);
      const slabHeight = p.h ?? 0.65;
      const slabMat = toonMat(0xb8bdcf, 0x384c9c, 0.24);
      const slab = castRec(addOutline(new THREE.Mesh(createRoundedSlabGeo(p.w, p.d, slabHeight, 0.6, 0.12), slabMat), 1.012));
      slab.position.y = -0.12;
      elevator.add(slab);
      const cyan = new THREE.MeshBasicMaterial({ color: 0x78f6ff });
      const violet = new THREE.MeshBasicMaterial({ color: 0xbc9aff });
      const haloMat = new THREE.MeshBasicMaterial({ color: 0x5deaff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const shortSide = Math.min(p.w, p.d);
      const runeRadius = shortSide * 0.4;
      const runeY = -slabHeight - 0.3;
      for (const [scale, material] of [[1, cyan], [1.17, violet]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(runeRadius * scale, 0.035, 6, 48), material);
        ring.rotation.x = -Math.PI / 2;
        ring.scale.set(p.w / shortSide, p.d / shortSide, 1);
        ring.position.y = runeY;
        elevator.add(ring);
      }
      const halo = new THREE.Mesh(new THREE.RingGeometry(runeRadius * 0.72, runeRadius * 1.27, 48), haloMat);
      halo.rotation.x = -Math.PI / 2;
      halo.scale.set(p.w / shortSide, p.d / shortSide, 1);
      halo.position.y = runeY + 0.01;
      elevator.add(halo);
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        const rune = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.025, 0.22), i % 2 ? violet : cyan);
        rune.position.set(Math.cos(angle) * p.w * 0.435, runeY, Math.sin(angle) * p.d * 0.435);
        rune.rotation.y = -angle;
        elevator.add(rune);
      }
      for (const side of [-1, 1]) {
        const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, p.d * 0.65), cyan);
        lightStrip.position.set(side * (p.w / 2 - 0.18), -0.16, 0);
        elevator.add(lightStrip);
      }
      const seal = new THREE.Mesh(new THREE.RingGeometry(shortSide * 0.16, shortSide * 0.174, 32), violet);
      seal.rotation.x = -Math.PI / 2;
      seal.position.y = 0.012;
      elevator.add(seal);
      if (p.walls) addSideCurbs(p, elevator, true);
      group.add(elevator);
      dynamicMeshes.elevators.push({ def: p, mesh: elevator });
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
      for (const s of p.walls ? [] : [-1, 1]) {
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
      for (const [cx, cz] of p.walls ? [] : [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (propCorners.get(p)?.has(`${cx},${cz}`)) continue;
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
      if (p.w >= 6.0 && !p.walls) {
        const [tx, tz] = [[-1, 1], [-1, -1], [1, 1], [1, -1]].find(([cx, cz]) => !propCorners.get(p)?.has(`${cx},${cz}`));
        const treeAnchor = new THREE.Group();
        treeAnchor.position.set(p.x + tx * p.w * 0.38, p.y, p.z + tz * p.d * 0.34);
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
            : p.kind === "mud" ? mats.mud
              : p.kind === "neon" ? mats.neon
                : p.kind === "crystal" ? mats.crystal
                  : mats.brass;
      const isRounded = p.kind === "brass" || p.kind === "crystal" || p.kind === "ice" || p.kind === "mud";
      // Deterministic micro Y-layering eliminates coplanar Z-fighting flicker at platform seams!
      const yLayer = p.kind === "mud" ? -0.016 : p.kind === "ice" ? 0.008 : p.kind === "neon" ? 0.014 : 0;
      const geo = isRounded ? createRoundedSlabGeo(p.w, p.d, p.h, Math.min(p.w, p.d) * 0.2, 0.12) : new THREE.BoxGeometry(p.w, p.h, p.d);
      const mesh = castRec(new THREE.Mesh(geo, topMat), false, true);
      mesh.position.set(p.x, (isRounded ? p.y - 0.12 : p.y - p.h / 2) + yLayer, p.z);
      if (p.kind !== "cloud" && p.kind !== "neon") addOutline(mesh, 1.015);
      group.add(mesh);

      // Glowing Crystal Spires poking out of Aurora Crystal Islands!
      if (p.kind === "crystal" && p.w >= 5 && !p.walls) {
        for (const [cx, cz] of [[-1, -1], [1, 1]]) {
          if (propCorners.get(p)?.has(`${cx},${cz}`)) continue;
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

    if (p.walls && p.kind !== "trough" && p.kind !== "elevator" && p.kind !== "ramp" && p.kind !== "ice_ramp") {
      addSideCurbs(p);
    }
    if (p.endWalls) addEndCurbs(p);
  }

  // 2. Rotating Interlocking Brass Gears (Recessed -0.07m below adjoining deck with inset teeth -> ZERO clipping or Z-fighting!)
  for (const g of track.gears) {
    const gGroup = new THREE.Group();
    const diskR = Math.max(1.2, g.r - 0.22);
    gGroup.position.set(g.x, g.y - 0.07 - g.h / 2, g.z);
    gGroup.add(castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(diskR, diskR, g.h, 28), mats.brass), 1.018)));
    gGroup.add(castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(diskR * 0.3, diskR * 0.3, g.h + 0.12, 14), mats.brassDark), 1.03)));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tooth = castRec(addOutline(new THREE.Mesh(new THREE.BoxGeometry(0.46, g.h * 0.62, 0.56), mats.brassDark), 1.03));
      tooth.position.set(Math.cos(a) * (diskR + 0.12), -0.05, Math.sin(a) * (diskR + 0.12));
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
    const rod = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, hm.len, 8), track.worldType === "town_street" ? mats.brass : mats.woodPlank), 1.08));
    rod.position.set(0, -hm.len / 2, 0);
    pivot.add(rod);
    const head = new THREE.Group();
    head.name = hm.variant === "flail" ? "flail-head" : "hammer-head";
    head.position.set(0, -hm.len, 0);
    pivot.add(head);
    const headFallback = new THREE.Group();
    headFallback.name = `${head.name}-fallback`;
    head.add(headFallback);
    const modelAnchor = new THREE.Group();
    modelAnchor.name = `${head.name}-model-anchor`;
    head.add(modelAnchor);
    if (hm.variant === "flail") {
      const crystalMat = toonMat(0xae72df, 0x613095, 0.3);
      headFallback.add(castRec(addOutline(new THREE.Mesh(new THREE.OctahedronGeometry(0.59, 0), crystalMat), 1.045)));
      const directions = [
        [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
        [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
        [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
      ];
      const up = new THREE.Vector3(0, 1, 0);
      for (const coordinates of directions) {
        const direction = new THREE.Vector3(...coordinates).normalize();
        const spike = castRec(addOutline(new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), crystalMat), 1.04));
        spike.scale.set(0.7, 1.6, 0.7);
        spike.position.copy(direction).multiplyScalar(0.55);
        spike.quaternion.setFromUnitVectors(up, direction);
        headFallback.add(spike);
      }
    } else if (track.worldType === "town_street") {
      const weight = castRec(addOutline(new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), mats.brass), 1.04));
      weight.scale.z = 0.52;
      headFallback.add(weight);
      const engraving = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 6, 24), mats.brassDark);
      engraving.position.z = 0.26;
      headFallback.add(engraving);
    } else {
      const barrel = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 1.55, 14), toonMat(track.worldType === "town_street" ? 0xd3a84f : 0x9e542a)), 1.05));
      barrel.rotation.z = Math.PI / 2;
      headFallback.add(barrel);
      for (const s of [-0.52, 0.52]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.59, 0.59, 0.14, 14), mats.brass);
        ring.rotation.z = Math.PI / 2;
        ring.position.x = s;
        headFallback.add(ring);
      }
    }
    arch.add(pivot);
    group.add(arch);
    dynamicMeshes.hammers.push({ pivot, def: hm, head, headFallback, modelAnchor, worldHead: new THREE.Vector3(), velX: 0, velY: 0 });
  }

  // Rolling pins move as a unit along Z; both visual sources spin around X.
  for (const def of track.rollingPins || []) {
    const mesh = new THREE.Group();
    mesh.name = "rolling-pin";
    mesh.position.set(def.x, def.y, def.z);
    const roller = new THREE.Group();
    roller.name = "rolling-pin-roller";
    mesh.add(roller);
    const fallback = new THREE.Group();
    fallback.name = "rolling-pin-fallback";
    roller.add(fallback);
    const barrel = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, def.width, 18), mats.woodPlank), 1.025));
    barrel.rotation.z = Math.PI / 2;
    fallback.add(barrel);
    for (const side of [-1, 1]) {
      const band = castRec(new THREE.Mesh(new THREE.CylinderGeometry(0.485, 0.485, 0.075, 18), mats.brassDark));
      band.rotation.z = Math.PI / 2;
      band.position.x = side * (def.width / 2 - 0.12);
      fallback.add(band);
      const handle = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.28, 10), mats.woodPost), 1.04));
      handle.rotation.z = Math.PI / 2;
      handle.position.x = side * (def.width / 2 + 0.12);
      fallback.add(handle);
    }
    const modelAnchor = new THREE.Group();
    modelAnchor.name = "rolling-pin-model-anchor";
    roller.add(modelAnchor);
    group.add(mesh);
    dynamicMeshes.rollingPins.push({ def, mesh, roller, fallback, modelAnchor });
  }

  // Spring bumpers are grounded at def.y and reserve def.r as their footprint.
  for (const def of track.bumpers || []) {
    const mesh = new THREE.Group();
    mesh.name = "bumper";
    mesh.position.set(def.x, def.y, def.z);
    const fallback = new THREE.Group();
    fallback.name = "bumper-fallback";
    const base = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(def.r * 0.92, def.r * 0.98, def.r * 0.18, 18), mats.brassDark), 1.015));
    base.position.y = def.r * 0.09;
    fallback.add(base);
    for (let i = 0; i < 3; i++) {
      const coil = castRec(new THREE.Mesh(new THREE.TorusGeometry(def.r * 0.48, def.r * 0.055, 6, 18), mats.brass));
      coil.rotation.x = Math.PI / 2;
      coil.position.y = def.r * (0.23 + i * 0.1);
      fallback.add(coil);
    }
    const cap = castRec(addOutline(new THREE.Mesh(new THREE.SphereGeometry(def.r * 0.91, 18, 12), toonMat(0xef76ad, 0xa82c79, 0.2)), 1.025));
    cap.scale.y = 0.4;
    cap.position.y = def.r * 0.68;
    fallback.add(cap);
    const rim = castRec(new THREE.Mesh(new THREE.TorusGeometry(def.r * 0.83, def.r * 0.075, 8, 20), mats.brass));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = def.r * 0.62;
    fallback.add(rim);
    const star = castRec(new THREE.Mesh(new THREE.OctahedronGeometry(def.r * 0.18, 0), toonMat(0xffed90, 0xffd54a, 0.3)));
    star.scale.y = 0.35;
    star.position.y = def.r * 1.055;
    fallback.add(star);
    mesh.add(fallback);
    const modelAnchor = new THREE.Group();
    modelAnchor.name = "bumper-model-anchor";
    mesh.add(modelAnchor);
    group.add(mesh);
    dynamicMeshes.bumpers.push({ def, mesh, fallback, modelAnchor, pulse: 0 });
  }

  // The translucent plume has its own sibling mount so replacing a grate with
  // an imported vent never hides the timed warning and steam animation.
  for (const def of track.steamVents || []) {
    const mesh = new THREE.Group();
    mesh.name = "steam-vent";
    mesh.position.set(def.x, def.y, def.z);
    const fallback = new THREE.Group();
    fallback.name = "steam-vent-fallback";
    const base = castRec(addOutline(new THREE.Mesh(new THREE.CylinderGeometry(def.r * 0.88, def.r, 0.16, 18), mats.brassDark), 1.02));
    base.position.y = 0.08;
    fallback.add(base);
    const ring = castRec(new THREE.Mesh(new THREE.TorusGeometry(def.r * 0.72, def.r * 0.12, 8, 20), mats.brass));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.18;
    fallback.add(ring);
    for (let i = -2; i <= 2; i++) {
      const offset = i * def.r * 0.23;
      const span = Math.sqrt(Math.max(0, (def.r * 0.66) ** 2 - offset ** 2));
      const grate = castRec(new THREE.Mesh(new THREE.BoxGeometry(span * 2, 0.07, def.r * 0.07), mats.brassDark));
      grate.position.set(0, 0.18, offset);
      fallback.add(grate);
    }
    mesh.add(fallback);
    const modelAnchor = new THREE.Group();
    modelAnchor.name = "steam-vent-model-anchor";
    mesh.add(modelAnchor);
    const plumeGeometry = new THREE.ConeGeometry(def.r * 1.25, 2.8, 18, 1, true);
    plumeGeometry.rotateX(Math.PI);
    plumeGeometry.translate(0, 1.4, 0);
    const plume = new THREE.Mesh(plumeGeometry, new THREE.MeshBasicMaterial({ color: 0x8ceaff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
    plume.name = "steam-vent-plume";
    plume.position.y = 0.2;
    plume.visible = false;
    mesh.add(plume);
    group.add(mesh);
    dynamicMeshes.steamVents.push({ def, mesh, fallback, modelAnchor, plume, active: false });
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
    const route = track.routes?.find(route => route.id === b.routeId);
    const strip = new THREE.Mesh(route ? boostRibbonGeometry(route, b) : new THREE.BoxGeometry(b.w, 0.08, b.d), mats.rainbow);
    strip.name = 'rainbow-boost-ribbon';
    if (!route) strip.position.set(b.x, b.y + .085, b.z);
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

  if (track.worldType) {
    buildV3World(track, group, dynamicMeshes, mats);
    return { group, dynamicMeshes };
  }

  // 8. A floating, terraced valley frames the full course while keeping every route clear.
  const nightValley = track.id === "aurora" || track.id === "sky_finale";
  const autumnValley = ["clockwork", "gear_outpost", "belfry"].includes(track.id);
  const frostValley = track.id === "frost_slide";
  const valleyStone = toonMat(nightValley ? 0x68658b : autumnValley ? 0xa47b62 : 0x9a8875);
  const valleyStoneShade = toonMat(nightValley ? 0x494965 : autumnValley ? 0x805d50 : 0x6f756a);
  const valleyGrass = toonMat(nightValley ? 0x69b6a0 : autumnValley ? 0x9fc769 : frostValley ? 0xa2ddd1 : 0x7acb78);
  const hillGrass = toonMat(nightValley ? 0x71c7b6 : autumnValley ? 0xb6d078 : frostValley ? 0xbce9df : 0x9bd582);
  const waterMat = new THREE.MeshToonMaterial({ color: nightValley ? 0x7ad4ff : 0x7bdeed, emissive: 0x216985, emissiveIntensity: nightValley ? 0.4 : 0.18, gradientMap: getToonGradient(), transparent: true, opacity: 0.74 });
  const waterShine = new THREE.MeshBasicMaterial({ color: 0xd6fbff, transparent: true, opacity: 0.66, depthWrite: false });
  const leafColor = nightValley ? 0x76d1bf : autumnValley ? 0xe4ac69 : frostValley ? 0xb9e3d3 : 0x64be78;
  const distantTree = createStorybookTree(leafColor);
  const courseMinZ = Math.min(...track.platforms.map((p) => p.z - p.d / 2), track.finish.z) - 7;
  const courseMaxZ = Math.max(...track.platforms.map((p) => p.z + p.d / 2), track.start.z) + 6;
  const valleyCount = Math.min(9, Math.max(4, Math.ceil((courseMaxZ - courseMinZ) / 15)));
  for (let i = 0; i < valleyCount; i++) {
    for (const side of [-1, 1]) {
      const z = courseMaxZ - (courseMaxZ - courseMinZ) * i / (valleyCount - 1) + side * 2.1;
      const nearest = track.platforms.reduce((best, p) => Math.abs(p.z - z) < Math.abs(best.z - z) ? p : best, track.platforms[0]);
      const x = side * (28.4 + (i % 3) * 1.55 + Math.sin(i * 1.7 + side) * 0.65);
      const topY = nearest.y - 1.8 + Math.sin(i * 1.4 + side) * 1.5;
      const radius = 4.6 + ((i + (side === 1 ? 1 : 0)) % 3) * 0.28;
      const cliff = new THREE.Group();
      cliff.name = "distant-valley-cliff";
      cliff.position.set(x, topY, z);

      const rock = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.67, 7.4, 7, 2), valleyStone);
      rock.position.y = -3.7;
      rock.rotation.y = i * 0.41;
      cliff.add(rock);
      const root = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.78, 4.4, 7), valleyStoneShade);
      root.rotation.x = Math.PI;
      root.position.y = -8.8;
      cliff.add(root);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius, 0.42, 10), valleyGrass);
      crown.position.y = 0.02;
      cliff.add(crown);
      const hill = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.77, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hillGrass);
      hill.scale.y = 0.36;
      hill.position.set(side * 0.7, 0.18, -0.35);
      cliff.add(hill);

      // Lower shelves break the cliff silhouette and catch the cascading water.
      const terrace = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius * 0.52, 1.1, 7), valleyStoneShade);
      terrace.position.set(-side * radius * 0.45, -4.2, 0.45);
      cliff.add(terrace);
      const terraceGrass = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.63, radius * 0.62, 0.23, 8), valleyGrass);
      terraceGrass.position.copy(terrace.position).y = -3.57;
      cliff.add(terraceGrass);
      for (const [tx, tz, scale] of [[-0.35, -0.27, 1.1], [0.35, 0.2, 0.86]]) {
        const tree = distantTree.clone(true);
        tree.position.set(radius * tx, 0.32, radius * tz);
        tree.scale.setScalar(scale);
        cliff.add(tree);
      }
      for (let bushIndex = 0; bushIndex < 3; bushIndex++) {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), valleyGrass);
        bush.scale.set(1.2, 0.65, 0.9);
        bush.position.set(-side * radius * 0.55, 0.34, (bushIndex - 1) * 1.2);
        cliff.add(bush);
      }

      if ((i + (side === 1 ? 1 : 0)) % 2 === 0) {
        const waterfallX = -side * radius * 0.91;
        const waterfallZ = 0.5;
        const fall = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.7, 1.28), waterMat);
        fall.position.set(waterfallX, -1.65, waterfallZ);
        cliff.add(fall);
        for (const offset of [-0.37, 0.13, 0.4]) {
          const streak = new THREE.Mesh(new THREE.BoxGeometry(0.018, 3.45, 0.055), waterShine);
          streak.position.set(waterfallX - side * 0.09, -1.64, waterfallZ + offset);
          cliff.add(streak);
        }
        const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.04, 0.93, 0.055, 16), waterMat);
        pool.scale.set(0.84, 1, 1.15);
        pool.position.set(waterfallX + side * 0.17, -3.4, waterfallZ);
        cliff.add(pool);
        const foam = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.055, 6, 20), waterShine);
        foam.rotation.x = -Math.PI / 2;
        foam.scale.x = 0.75;
        foam.position.set(waterfallX, -3.34, waterfallZ);
        cliff.add(foam);
        const lowerFall = new THREE.Mesh(new THREE.BoxGeometry(0.11, 3.4, 0.7), waterMat);
        lowerFall.position.set(waterfallX - side * 0.53, -5.26, waterfallZ + 0.12);
        cliff.add(lowerFall);
      } else {
        // Slender neighboring pinnacles make a recognisable valley, beyond the playable lane.
        for (const [offZ, height] of [[-3.9, 6.4], [3.2, 4.9]]) {
          const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.05, height, 6), valleyStoneShade);
          pillar.position.set(side * 2.6, -1.5, offZ);
          cliff.add(pillar);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.84, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), hillGrass);
          cap.scale.y = 0.33;
          cap.position.set(side * 2.6, -1.5 + height / 2, offZ);
          cliff.add(cap);
        }
      }
      cliff.traverse((node) => { node.castShadow = false; node.receiveShadow = false; });
      group.add(cliff);
      dynamicMeshes.floaters.push({ mesh: cliff, baseY: topY, seed: i * 1.7 + side });
    }
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
