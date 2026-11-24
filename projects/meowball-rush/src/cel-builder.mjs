// Meowball Rush v0.1.0 — WitchSpring R Cel-Shaded 3D Mesh Factory
// Uses Three.js MeshToonMaterial + 3-band crisp cel gradient + Warm Plum Inverted-Hull Outlines
// + Fresnel Iridescent Soap-Bubble Shader!
import * as THREE from "three";

let toonGradient = null;
function getToonGradient() {
  if (toonGradient) return toonGradient;
  // Crisp 3-band WitchSpring cel-shading ramp (warm shadow -> midtone -> bright highlight)
  const data = new Uint8Array([105, 105, 105, 255, 188, 188, 188, 255, 255, 255, 255, 255]);
  toonGradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  toonGradient.minFilter = THREE.NearestFilter;
  toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x2b1e3a, side: THREE.BackSide });

export function toonMat(color, emissive = 0x000000, emissiveIntensity = 0) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getToonGradient(),
    emissive,
    emissiveIntensity,
  });
}

export function addOutline(mesh, scale = 1.045) {
  const out = new THREE.Mesh(mesh.geometry, outlineMat);
  out.scale.setScalar(scale);
  mesh.add(out);
  return mesh;
}

// Iridescent Translucent Magic Bubble Shader (Fresnel rim glow + glossy specular dot!)
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
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.4);
        vec3 L = normalize(vec3(0.45, 0.85, 0.55));
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 38.0);
        vec3 rainbow = 0.5 + 0.5 * cos(uTime * 1.4 + N.xyx * 3.2 + vec3(0.0, 2.0, 4.0));
        vec3 col = mix(uColor, rainbow, 0.28) * (0.65 + fresnel * 0.95) + vec3(1.0) * spec * 1.2;
        float alpha = clamp(0.14 + fresnel * 0.62 + spec * 0.85, 0.0, 0.92);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

// Build Articulated 3D Cel-Shaded Kitten inside the Translucent Magic Bubble!
export function createKittyBall(catDef) {
  const root = new THREE.Group();

  // 1. Outer Glossy Magic Bubble Sphere (rotates with physical roll!)
  const bubbleMat = createBubbleMaterial(catDef.bubbleColor);
  const bubbleMesh = new THREE.Mesh(new THREE.SphereGeometry(0.62, 28, 24), bubbleMat);
  root.add(bubbleMesh);

  // Subtle sparkle ring inside bubble to make rolling rotation super readable!
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.018, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })
  );
  band.rotation.x = Math.PI / 2;
  bubbleMesh.add(band);

  // 2. Inner Plump Cel-Shaded Kitten (stays upright, faces movement direction & pedals legs!)
  const kitty = new THREE.Group();
  root.add(kitty);

  const bodyMat = toonMat(catDef.bodyColor);
  const bellyMat = toonMat(catDef.bellyColor);
  const pinkMat = toonMat(0xff9ec4);
  const eyeMat = new THREE.MeshBasicMaterial({ color: catDef.eyeColor });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1a1226 });

  // Plump Body
  const body = addOutline(new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), bodyMat), 1.07);
  body.scale.set(0.95, 0.86, 1.18);
  body.position.set(0, -0.08, 0.02);
  kitty.add(body);

  // Cute Round Head
  const head = addOutline(new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 14), bodyMat), 1.07);
  head.scale.set(1.08, 0.96, 1.0);
  head.position.set(0, 0.14, -0.16);
  kitty.add(head);

  // Pointy Cat Ears + Pink Inner Ears
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

  // Expressive Anime Eyes + Cute Pink Nose
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

  // 4 Tiny Animated Running Paws!
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

  // Wagging Tail
  const tail = addOutline(new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.22, 6, 8), bodyMat), 1.12);
  tail.position.set(0, 0.06, 0.29);
  tail.rotation.x = 0.65;
  kitty.add(tail);

  // Unique Per-Cat Accessory (Witch Hat / Scarf / Ribbon / Bell / Goggles / Crown!)
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

  // 3. Dizzy Spinning Golden Stars Halo (visible when dizzy!)
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

  // 4. Comical Popped Fluffy Furball Puff (shown when bubble pops!)
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

  // 5. Crisp Ground Contact Shadow Disc (super helpful for judging 3D jumps & narrow bridges!)
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.56, 20),
    new THREE.MeshBasicMaterial({ color: 0x1b122b, transparent: true, opacity: 0.34, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;

  return { root, bubbleMesh, bubbleMat, kitty, accGroup, paws, tail, dizzyHalo, furball, shadow };
}

// Build Complete 3D Cel-Shaded Track Scene from Track Config!
export function buildTrackScene(track) {
  const group = new THREE.Group();
  const dynamicMeshes = { gears: [], hammers: [], stars: [], boosts: [], mushrooms: [], portal: null, clouds: [] };

  // Materials per surface type
  const mats = {
    grassTop: toonMat(0x74d668),
    grassDirt: toonMat(0x9a6d52),
    stoneTop: toonMat(0xb6c4d4),
    wood: toonMat(0xc7894c),
    brass: toonMat(0xd99b38),
    brassDark: toonMat(0x8c5c20),
    cloud: new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: getToonGradient(), transparent: true, opacity: 0.72 }),
    ice: new THREE.MeshToonMaterial({ color: 0x8be9ff, gradientMap: getToonGradient(), emissive: 0x165e8a, emissiveIntensity: 0.25 }),
    neon: new THREE.MeshToonMaterial({ color: 0xff5ce1, gradientMap: getToonGradient(), emissive: 0xff2eb3, emissiveIntensity: 0.45, transparent: true, opacity: 0.85 }),
    crystal: toonMat(0x4c3582, 0x261557, 0.3),
  };

  // 1. Platforms & Ramps
  for (const p of track.platforms) {
    if (p.kind === "ramp" || p.kind === "ice_ramp") {
      const dx = p.dir === "+x" ? p.w : 0;
      const dz = p.dir === "-z" ? p.d : 0;
      const run = p.dir === "+x" ? p.w : p.d;
      const drop = p.yEnd - p.yStart;
      const len = Math.hypot(run, drop);
      const angle = Math.atan2(drop, run);

      const geom = new THREE.BoxGeometry(p.dir === "+x" ? len : p.w, p.h, p.dir === "-z" ? len : p.d);
      const mesh = addOutline(new THREE.Mesh(geom, p.kind === "ice_ramp" ? mats.ice : mats.wood), 1.02);
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
      if (p.kind !== "cloud" && p.kind !== "neon") addOutline(mesh, 1.02);
      group.add(mesh);

      // Add cozy WitchSpring floating island dirt underbelly + pastel flowers on grass terraces!
      if (p.kind === "grass" && p.w >= 5) {
        const rock = addOutline(new THREE.Mesh(new THREE.ConeGeometry(Math.min(p.w, p.d) * 0.56, 3.2, 7), mats.grassDirt), 1.03);
        rock.rotation.x = Math.PI;
        rock.position.set(p.x, p.y - p.h - 1.5, p.z);
        group.add(rock);
        // Decorative stone center tiles + tiny flowers along edges
        const cobble = new THREE.Mesh(new THREE.BoxGeometry(p.w - 1.2, 0.06, p.d - 1.2), mats.stoneTop);
        cobble.position.set(p.x, p.y + 0.01, p.z);
        group.add(cobble);
      }
    }
  }

  // 2. Rotating Interlocking Brass Gears!
  for (const g of track.gears) {
    const gGroup = new THREE.Group();
    gGroup.position.set(g.x, g.y - g.h / 2, g.z);
    const disc = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(g.r, g.r, g.h, 20), mats.brass), 1.025);
    gGroup.add(disc);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(g.r * 0.35, g.r * 0.35, g.h + 0.14, 12), mats.brassDark);
    gGroup.add(hub);
    // 12 Gear Teeth around rim so rotation is visually unmistakable!
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.62, g.h * 0.85, 0.72), mats.brass);
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
    // Wooden Overhead Support Frame
    const topBar = addOutline(new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.35, 0.35), mats.brassDark), 1.04);
    arch.add(topBar);
    const pivot = new THREE.Group();
    const rod = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, hm.len, 8), mats.wood), 1.08);
    rod.position.set(0, -hm.len / 2, 0);
    pivot.add(rod);
    const head = addOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.5, 12), toonMat(0x9e542a)), 1.05);
    head.rotation.z = Math.PI / 2;
    head.position.set(0, -hm.len, 0);
    pivot.add(head);
    arch.add(pivot);
    group.add(arch);
    dynamicMeshes.hammers.push({ pivot, def: hm, worldHead: new THREE.Vector3() });
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
    // White polka dots
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), toonMat(0xffffff));
      dot.position.set(Math.cos(a) * 0.72, 0.85, Math.sin(a) * 0.72);
      mg.add(dot);
    }
    group.add(mg);
    dynamicMeshes.mushrooms.push({ mesh: mg, def: m, bounceAnim: 0 });
  }

  // 5. Rainbow Speed Boost Strips!
  for (const b of track.boosts) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, 0.08, b.d),
      new THREE.MeshBasicMaterial({ color: 0x38f3ff, transparent: true, opacity: 0.82 })
    );
    strip.position.set(b.x, b.y, b.z);
    group.add(strip);
    dynamicMeshes.boosts.push({ mesh: strip, def: b });
  }

  // 6. Collectible Magic Star Candies!
  for (const st of track.stars) {
    const starMesh = addOutline(new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), toonMat(0xffde4d, 0xffaa00, 0.45)), 1.1);
    starMesh.position.set(st.x, st.y, st.z);
    group.add(starMesh);
    dynamicMeshes.stars.push({ mesh: starMesh, def: st, collected: false });
  }

  // 7. Glowing Magic Archway Finish Portal!
  const f = track.finish;
  const portalGroup = new THREE.Group();
  portalGroup.position.set(f.x, f.y, f.z);
  const archRing = addOutline(new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.28, 12, 24, Math.PI), toonMat(0xffd54a, 0xffa000, 0.35)), 1.05);
  archRing.position.y = 0.2;
  portalGroup.add(archRing);
  const swirl = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 24),
    new THREE.MeshBasicMaterial({ color: track.id === "aurora" ? 0xc084fc : 0xffe57f, transparent: true, opacity: 0.68, side: THREE.DoubleSide })
  );
  swirl.position.y = 1.25;
  portalGroup.add(swirl);
  group.add(portalGroup);
  dynamicMeshes.portal = swirl;

  // 8. Dreamy Fluffy Sky Clouds floating below the course!
  const cloudMat = new THREE.MeshToonMaterial({
    color: track.id === "aurora" ? 0x3b2868 : track.id === "clockwork" ? 0xffdfb8 : 0xffffff,
    gradientMap: getToonGradient(),
    transparent: true,
    opacity: 0.86,
  });
  for (let i = 0; i < 18; i++) {
    const cg = new THREE.Group();
    const cx = (Math.sin(i * 4.7) * 28);
    const cy = -4 - (i % 4) * 2.5;
    const cz = -i * 3.8 + 8;
    for (let k = 0; k < 3; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(2.2 + (k === 1 ? 1.0 : 0), 10, 8), cloudMat);
      puff.position.set((k - 1) * 1.9, k === 1 ? 0.5 : 0, 0);
      puff.scale.y = 0.58;
      cg.add(puff);
    }
    cg.position.set(cx, cy, cz);
    group.add(cg);
    dynamicMeshes.clouds.push({ mesh: cg, baseX: cx, seed: i });
  }

  return { group, dynamicMeshes };
}
