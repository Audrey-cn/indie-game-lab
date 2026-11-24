// Meowball Rush v0.2.0 — WitchSpring R Storybook Cel-Shaded 3D Art & Asset Factory
// Features: Hand-Painted Cobblestone/Grass/Wood/Brass/Ice/Rainbow CanvasTextures,
// Gradient Sky Dome + Distant Floating Islands + Stone Curbs + Pastel Flowers + Rainbow Ribbon Trail!
import * as THREE from "three";

let toonGradient = null;
function getToonGradient() {
  if (toonGradient) return toonGradient;
  const data = new Uint8Array([115, 115, 115, 255, 194, 194, 194, 255, 255, 255, 255, 255]);
  toonGradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  toonGradient.minFilter = THREE.NearestFilter;
  toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x322244, side: THREE.BackSide });

export function toonMat(color, emissive = 0x000000, emissiveIntensity = 0, map = null) {
  const opts = { color, gradientMap: getToonGradient(), emissive, emissiveIntensity };
  if (map) opts.map = map;
  return new THREE.MeshToonMaterial(opts);
}

export function addOutline(mesh, scale = 1.038) {
  const out = new THREE.Mesh(mesh.geometry, outlineMat);
  out.scale.setScalar(scale);
  mesh.add(out);
  return mesh;
}

// ===== HAND-PAINTED STORYBOOK PROCEDURAL TEXTURES (Matching the WitchSpring Poster!) =====
const TEX_CACHE = {};
function makeTex(key, w, h, drawFn, repeatX = 1, repeatY = 1) {
  if (TEX_CACHE[key]) return TEX_CACHE[key];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  drawFn(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  TEX_CACHE[key] = tex;
  return tex;
}

function getCobbleGrassTex() {
  return makeTex("cobble", 256, 256, (g, w, h) => {
    // Rich sunlit emerald meadow base
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#7de06c");
    bg.addColorStop(1, "#5ec258");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // Soft grass blades
    g.strokeStyle = "rgba(45, 118, 52, 0.35)";
    g.lineWidth = 2;
    for (let i = 0; i < 45; i++) {
      const gx = (i * 53) % w;
      const gy = (i * 97) % h;
      g.beginPath();
      g.moveTo(gx, gy);
      g.lineTo(gx - 3, gy - 8);
      g.moveTo(gx, gy);
      g.lineTo(gx + 4, gy - 7);
      g.stroke();
    }
    // Rounded hand-painted warm stone cobblestones (just like our cover poster!)
    const stones = [
      [34, 34, 48, 36], [100, 28, 54, 42], [174, 36, 52, 38], [232, 32, 36, 36],
      [24, 98, 56, 42], [96, 94, 48, 40], [164, 98, 58, 44], [234, 96, 38, 40],
      [38, 162, 52, 40], [108, 158, 56, 44], [182, 164, 50, 38], [240, 162, 34, 38],
      [28, 224, 50, 38], [98, 222, 54, 40], [170, 226, 54, 38], [236, 224, 36, 36],
    ];
    for (let i = 0; i < stones.length; i++) {
      const [sx, sy, sw, sh] = stones[i];
      g.fillStyle = i % 3 === 0 ? "#d9d4c7" : i % 3 === 1 ? "#c7c4ba" : "#e3dccb";
      g.strokeStyle = "#485249";
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(sx - sw / 2, sy - sh / 2, sw, sh, 12);
      g.fill();
      g.stroke();
      // Warm sunlit top highlight on stone
      g.fillStyle = "rgba(255,255,245,0.42)";
      g.beginPath();
      g.roundRect(sx - sw / 2 + 5, sy - sh / 2 + 4, sw - 12, sh * 0.35, 6);
      g.fill();
    }
  });
}

function getWoodPlankTex() {
  return makeTex("wood", 256, 256, (g, w, h) => {
    g.fillStyle = "#5c341d";
    g.fillRect(0, 0, w, h);
    const rows = 6;
    const rh = h / rows;
    for (let i = 0; i < rows; i++) {
      const y = i * rh + 3;
      const grad = g.createLinearGradient(0, y, 0, y + rh - 6);
      grad.addColorStop(0, i % 2 === 0 ? "#d99b56" : "#cc8d49");
      grad.addColorStop(1, "#a86932");
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(4, y, w - 8, rh - 6, 5);
      g.fill();
      g.strokeStyle = "#3a2114";
      g.lineWidth = 2.5;
      g.stroke();
      // Subtle wood grain & nails
      g.strokeStyle = "rgba(80, 42, 16, 0.25)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(14, y + rh * 0.45);
      g.bezierCurveTo(90, y + rh * 0.3, 165, y + rh * 0.65, w - 16, y + rh * 0.45);
      g.stroke();
      g.fillStyle = "#463129";
      g.beginPath();
      g.arc(16, y + rh * 0.48, 3.5, 0, Math.PI * 2);
      g.arc(w - 16, y + rh * 0.48, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function getBrassTex() {
  return makeTex("brass", 256, 256, (g, w, h) => {
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
    // Decorative brass rivets
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
  return makeTex("rainbow", 128, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#ff7eb6");
    grad.addColorStop(0.28, "#ffe066");
    grad.addColorStop(0.55, "#6ef2a9");
    grad.addColorStop(0.8, "#52e5ff");
    grad.addColorStop(1, "#c084fc");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // Crisp white directional chevrons pointing forward (-Z)
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
  return makeTex("ice", 256, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#b8f4ff");
    grad.addColorStop(0.5, "#72d8ff");
    grad.addColorStop(1, "#52b6f5");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.6)";
    g.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.moveTo((i * 41) % w, 0);
      g.lineTo(((i * 41) + 75) % w, h);
      g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,0.28)";
    g.beginPath();
    g.moveTo(0, 40); g.lineTo(140, 0); g.lineTo(190, 0); g.lineTo(0, 110);
    g.fill();
  });
}

// ===== DREAMY GRADIENT SKY DOME SHADER (Daylight / Golden Sunset / Starry Aurora!) =====
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
        float h = clamp(vDir.y * 0.7 + 0.35, 0.0, 1.0);
        vec3 col = mix(uBottom, uTop, pow(h, 0.72));
        // Soft sunlit / aurora horizon glow
        float glow = pow(max(0.0, 1.0 - abs(vDir.y - 0.12) * 3.2), 2.0);
        col += (uNight > 0.5 ? vec3(0.18, 0.65, 0.55) : vec3(0.32, 0.24, 0.12)) * glow * 0.45;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(140, 24, 16), mat);
}

// Iridescent Translucent Magic Bubble Shader
export function createBubbleMaterial(tintHex = 0xb67cff) {
  const col = new THREE.Color(tintHex);
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: col },
      uTime: { value: 0 },
    },
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
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.3);
        vec3 L = normalize(vec3(0.45, 0.85, 0.55));
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 36.0);
        vec3 rainbow = 0.5 + 0.5 * cos(uTime * 1.4 + N.xyx * 3.2 + vec3(0.0, 2.0, 4.0));
        vec3 col = mix(uColor, rainbow, 0.34) * (0.68 + fresnel * 0.95) + vec3(1.0) * spec * 1.3;
        float alpha = clamp(0.15 + fresnel * 0.64 + spec * 0.88, 0.0, 0.94);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

// Lush Pastel Rainbow Ribbon Trail Mesh (replaces thin 1px line — matches the poster!)
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
    const colIdx = Math.min(palette.length - 1, Math.floor(t * (palette.length - 0.01)));
    const c = palette[colIdx];
    const fade = 1 - t;
    for (let s = 0; s < 2; s++) {
      const vi = (i * 2 + s) * 3;
      colors[vi] = c.r * (0.7 + 0.3 * fade);
      colors[vi + 1] = c.g * (0.7 + 0.3 * fade);
      colors[vi + 2] = c.b * (0.7 + 0.3 * fade);
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
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return { mesh: new THREE.Mesh(geo, mat), segments };
}

// Build Articulated 3D Cel-Shaded Kitten inside the Translucent Magic Bubble!
export function createKittyBall(catDef) {
  const root = new THREE.Group();

  const bubbleMat = createBubbleMaterial(catDef.bubbleColor);
  const bubbleMesh = new THREE.Mesh(new THREE.SphereGeometry(0.62, 28, 24), bubbleMat);
  root.add(bubbleMesh);

  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.018, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42 })
  );
  band.rotation.x = Math.PI / 2;
  bubbleMesh.add(band);

  const kitty = new THREE.Group();
  root.add(kitty);

  const bodyMat = toonMat(catDef.bodyColor);
  const bellyMat = toonMat(catDef.bellyColor);
  const pinkMat = toonMat(0xff9ec4);
  const eyeMat = new THREE.MeshBasicMaterial({ color: catDef.eyeColor });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1a1226 });

  const body = addOutline(new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), bodyMat), 1.07);
  body.scale.set(0.95, 0.86, 1.18);
  body.position.set(0, -0.08, 0.02);
  kitty.add(body);

  const head = addOutline(new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 14), bodyMat), 1.07);
  head.scale.set(1.08, 0.96, 1.0);
  head.position.set(0, 0.14, -0.16);
  kitty.add(head);

  for (const s of [-1, 1]) {
    const ear = addOutline(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.17, 4), bodyMat), 1.1);
    ear.position.set(s * 0.13, 0.31, -0.15);
    ear.rotation.z = -s * 0.28;
    kitty.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 4), pinkMat);
    inner.position.set(s * 0.13, 0.3, -0.17);
    inner.rotation.z = -s * 0.28;
    kitty.add(inner);
  }

  const eyesGroup = new THREE.Group();
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), eyeMat);
    eye.position.set(s * 0.085, 0.15, -0.34);
    eyesGroup.add(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(s * 0.095, 0.17, -0.375);
    eyesGroup.add(shine);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), pinkMat);
  nose.position.set(0, 0.11, -0.36);
  eyesGroup.add(nose);
  kitty.add(eyesGroup);

  const paws = [];
  const pawCoords = [
    [-0.12, -0.25, -0.14],
    [0.12, -0.25, -0.14],
    [-0.12, -0.25, 0.14],
    [0.12, -0.25, 0.14],
  ];
  for (const [px, py, pz] of pawCoords) {
    const paw = addOutline(new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 10), bellyMat), 1.1);
    paw.scale.set(0.9, 0.75, 1.25);
    paw.position.set(px, py, pz);
    kitty.add(paw);
    paws.push({ mesh: paw, baseY: py, baseZ: pz });
  }

  const tail = addOutline(new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.22, 6, 8), bodyMat), 1.12);
  tail.position.set(0, 0.06, 0.29);
  tail.rotation.x = 0.65;
  kitty.add(tail);

  const accGroup = new THREE.Group();
  if (catDef.acc === "witch_hat") {
    const brim = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.035, 16), toonMat(0x6d35a8)), 1.07);
    brim.position.set(0.03, 0.34, -0.14);
    brim.rotation.z = -0.18;
    accGroup.add(brim);
    const cone = addOutline(new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 12), toonMat(0x7c3aed)), 1.07);
    cone.position.set(0.06, 0.48, -0.13);
    cone.rotation.z = -0.26;
    accGroup.add(cone);
    const bandH = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.145, 0.045, 12), toonMat(0xff5ca8));
    bandH.position.set(0.04, 0.37, -0.14);
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
  const puff = addOutline(new THREE.Mesh(new THREE.DodecahedronGeometry(0.46, 1), bodyMat), 1.07);
  furball.add(puff);
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
    new THREE.CircleGeometry(0.56, 20),
    new THREE.MeshBasicMaterial({ color: 0x1b122b, transparent: true, opacity: 0.34, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;

  return { root, bubbleMesh, bubbleMat, kitty, accGroup, paws, tail, dizzyHalo, furball, shadow };
}

// Build Lush WitchSpring Storybook 3D Scene!
export function buildTrackScene(track) {
  const group = new THREE.Group();
  const dynamicMeshes = { gears: [], hammers: [], stars: [], boosts: [], mushrooms: [], portal: null, clouds: [], floaters: [] };

  // Sky Dome
  group.add(createSkyDome(track));

  const cobbleTex = getCobbleGrassTex();
  const woodTex = getWoodPlankTex();
  const brassTex = getBrassTex();
  const rainbowTex = getRainbowBoostTex();
  const iceTex = getIceCrystalTex();

  const mats = {
    grassTop: toonMat(0xffffff, 0x000000, 0, cobbleTex),
    grassEdge: toonMat(0x69cc60),
    grassDirt: toonMat(0x9a6d52),
    stoneCurb: toonMat(0xdcd6c8),
    wood: toonMat(0xffffff, 0x000000, 0, woodTex),
    woodPost: toonMat(0x8c532b),
    brass: toonMat(0xffffff, 0x000000, 0, brassTex),
    brassDark: toonMat(0x8c5c20),
    cloud: new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: getToonGradient(), transparent: true, opacity: 0.72 }),
    ice: new THREE.MeshToonMaterial({ color: 0xffffff, map: iceTex, gradientMap: getToonGradient(), emissive: 0x165e8a, emissiveIntensity: 0.25 }),
    neon: new THREE.MeshToonMaterial({ color: 0xff6ee6, gradientMap: getToonGradient(), emissive: 0xff2eb3, emissiveIntensity: 0.5, transparent: true, opacity: 0.86 }),
    crystal: toonMat(0x52398e, 0x2a1860, 0.35),
    rainbow: new THREE.MeshBasicMaterial({ map: rainbowTex, transparent: true, opacity: 0.92 }),
  };

  const flowerCols = [0xff85c0, 0xffe066, 0xffffff, 0x93c5fd];

  // 1. Platforms & Ramps with Rich Storybook Dressing!
  for (const p of track.platforms) {
    if (p.kind === "ramp" || p.kind === "ice_ramp") {
      const run = p.dir === "+x" ? p.w : p.d;
      const drop = p.yEnd - p.yStart;
      const len = Math.hypot(run, drop);
      const angle = Math.atan2(drop, run);

      const geom = new THREE.BoxGeometry(p.dir === "+x" ? len : p.w, p.h, p.dir === "-z" ? len : p.d);
      const mesh = addOutline(new THREE.Mesh(geom, p.kind === "ice_ramp" ? mats.ice : mats.wood), 1.018);
      mesh.position.set(p.x, (p.yStart + p.yEnd) / 2 - p.h / 2, p.z);
      if (p.dir === "-z") mesh.rotation.x = angle;
      else if (p.dir === "+x") mesh.rotation.z = angle;
      group.add(mesh);
    } else {
      const topMat =
        p.kind === "grass" ? mats.grassTop
          : p.kind === "wood" ? mats.wood
            : p.kind === "cloud" ? mats.cloud
              : p.kind === "ice" ? mats.ice
                : p.kind === "neon" ? mats.neon
                  : p.kind === "crystal" ? mats.crystal
                    : mats.brass;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), topMat);
      mesh.position.set(p.x, p.y - p.h / 2, p.z);
      if (p.kind !== "cloud" && p.kind !== "neon") addOutline(mesh, 1.016);
      group.add(mesh);

      // Storybook Grass Island Dressing: Rocky Underbelly + Stone Curbs + Pastel Wildflowers!
      if (p.kind === "grass" && p.w >= 5) {
        const rock = addOutline(new THREE.Mesh(new THREE.ConeGeometry(Math.min(p.w, p.d) * 0.58, 3.6, 7), mats.grassDirt), 1.03);
        rock.rotation.x = Math.PI;
        rock.position.set(p.x, p.y - p.h - 1.7, p.z);
        group.add(rock);
        // Cute pastel wildflower clusters on the 4 corners!
        for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const fx = p.x + cx * (p.w * 0.43);
          const fz = p.z + cz * (p.d * 0.43);
          const bush = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), mats.grassEdge);
          bush.scale.y = 0.65;
          bush.position.set(fx, p.y + 0.14, fz);
          group.add(bush);
          for (let f = 0; f < 2; f++) {
            const fl = new THREE.Mesh(
              new THREE.SphereGeometry(0.11, 6, 6),
              toonMat(flowerCols[(Math.abs(Math.round(fx + fz)) + f) % flowerCols.length])
            );
            fl.position.set(fx + (f - 0.5) * 0.22, p.y + 0.34, fz + (f * 0.16 - 0.08));
            group.add(fl);
          }
        }
      }

      // Decorative Rope-Bridge Side Posts on Wooden Bridges (just like our cover poster!)
      if (p.kind === "wood" && p.d >= 6) {
        for (const s of [-1, 1]) {
          for (let zOff = -p.d * 0.42; zOff <= p.d * 0.44; zOff += 2.6) {
            const post = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.72, 6), mats.woodPost), 1.08);
            post.position.set(p.x + s * (p.w * 0.48), p.y + 0.28, p.z + zOff);
            group.add(post);
          }
        }
      }

      // Glowing Moon-Rune Arches on Track 3 Neon Walkways!
      if (p.kind === "neon" && p.d >= 8) {
        for (let zOff = -3.2; zOff <= 3.2; zOff += 3.2) {
          const runeRing = new THREE.Mesh(
            new THREE.TorusGeometry(1.55, 0.06, 8, 24),
            new THREE.MeshBasicMaterial({ color: 0x38f3ff, transparent: true, opacity: 0.78 })
          );
          runeRing.position.set(p.x, p.y + 1.45, p.z + zOff);
          group.add(runeRing);
        }
      }
    }
  }

  // 2. Rotating Interlocking Brass Gears (with Engraved Brass Texture!)
  for (const g of track.gears) {
    const gGroup = new THREE.Group();
    gGroup.position.set(g.x, g.y - g.h / 2, g.z);
    const disc = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(g.r, g.r, g.h, 24), mats.brass), 1.022);
    gGroup.add(disc);
    const hub = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(g.r * 0.32, g.r * 0.32, g.h + 0.18, 12), mats.brassDark), 1.04);
    gGroup.add(hub);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tooth = addOutline(new THREE.Mesh(new THREE.BoxGeometry(0.62, g.h * 0.85, 0.72), mats.brass), 1.04);
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
    const topBar = addOutline(new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.36, 0.36), mats.brassDark), 1.04);
    arch.add(topBar);
    // Decorative gear mount at pivot (straight from our poster!)
    const mountGear = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.22, 10), mats.brass), 1.05);
    mountGear.rotation.x = Math.PI / 2;
    arch.add(mountGear);

    const pivot = new THREE.Group();
    const rod = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, hm.len, 8), mats.wood), 1.08);
    rod.position.set(0, -hm.len / 2, 0);
    pivot.add(rod);
    const head = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 1.55, 14), toonMat(0x9e542a)), 1.05);
    head.rotation.z = Math.PI / 2;
    head.position.set(0, -hm.len, 0);
    pivot.add(head);
    // Brass hammer bands
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
    const stem = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.65, 12), toonMat(0xfff1d6)), 1.06);
    stem.position.y = 0.25;
    mg.add(stem);
    const cap = addOutline(new THREE.Mesh(new THREE.SphereGeometry(m.r * 0.92, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), toonMat(0xff4268, 0xff2244, 0.15)), 1.05);
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
    const starMesh = addOutline(new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), toonMat(0xffde4d, 0xffaa00, 0.45)), 1.1);
    starMesh.position.set(st.x, st.y, st.z);
    group.add(starMesh);
    dynamicMeshes.stars.push({ mesh: starMesh, def: st, collected: false });
  }

  // 7. Grand Storybook Golden Archway Finish Portal (with Twin Carved Pillars!)
  const f = track.finish;
  const portalGroup = new THREE.Group();
  portalGroup.position.set(f.x, f.y, f.z);
  for (const s of [-2.05, 2.05]) {
    const pil = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 2.3, 10), mats.stoneCurb), 1.05);
    pil.position.set(s, 1.15, 0);
    portalGroup.add(pil);
  }
  const archRing = addOutline(new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.3, 12, 24, Math.PI), toonMat(0xffd54a, 0xffa000, 0.38)), 1.05);
  archRing.position.y = 2.1;
  portalGroup.add(archRing);
  const swirl = new THREE.Mesh(
    new THREE.CircleGeometry(1.92, 24),
    new THREE.MeshBasicMaterial({ color: track.id === "aurora" ? 0xc084fc : 0xffe57f, transparent: true, opacity: 0.72, side: THREE.DoubleSide })
  );
  swirl.position.y = 1.95;
  portalGroup.add(swirl);
  group.add(portalGroup);
  dynamicMeshes.portal = swirl;

  // 8. Distant Floating Storybook Sky Islands & Ruin Arches (gives breathtaking depth like our poster!)
  const decoIslands = [
    [-22, 9, -16, 3.2], [20, 6, -24, 3.8], [-24, 4, -44, 4.2], [22, 10, -48, 3.0], [0, 12, -68, 5.0],
  ];
  for (const [ix, iy, iz, ir] of decoIslands) {
    const ig = new THREE.Group();
    ig.position.set(ix, iy, iz);
    const cone = addOutline(new THREE.Mesh(new THREE.ConeGeometry(ir, ir * 1.4, 7), mats.grassDirt), 1.03);
    cone.rotation.x = Math.PI;
    cone.position.y = -ir * 0.7;
    ig.add(cone);
    const top = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(ir, ir * 0.96, 0.55, 7), track.id === "aurora" ? mats.crystal : mats.grassEdge), 1.03);
    ig.add(top);
    // Tiny stone ruin arch on distant island!
    const arch = new THREE.Mesh(new THREE.TorusGeometry(ir * 0.35, 0.22, 6, 12, Math.PI), mats.stoneCurb);
    arch.position.y = 0.25;
    ig.add(arch);
    group.add(ig);
    dynamicMeshes.floaters.push({ mesh: ig, baseY: iy, seed: ix + iz });
  }

  // 9. Dreamy Fluffy Sky Clouds floating below the course!
  const cloudMat = new THREE.MeshToonMaterial({
    color: track.id === "aurora" ? 0x3b2868 : track.id === "clockwork" ? 0xffdfb8 : 0xffffff,
    gradientMap: getToonGradient(),
    transparent: true,
    opacity: 0.88,
  });
  for (let i = 0; i < 20; i++) {
    const cg = new THREE.Group();
    const cx = Math.sin(i * 4.7) * 30;
    const cy = -4.2 - (i % 4) * 2.4;
    const cz = -i * 3.8 + 8;
    for (let k = 0; k < 3; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(2.3 + (k === 1 ? 1.1 : 0), 10, 8), cloudMat);
      puff.position.set((k - 1) * 1.9, k === 1 ? 0.5 : 0, 0);
      puff.scale.y = 0.56;
      cg.add(puff);
    }
    cg.position.set(cx, cy, cz);
    group.add(cg);
    dynamicMeshes.clouds.push({ mesh: cg, baseX: cx, seed: i });
  }

  return { group, dynamicMeshes };
}
