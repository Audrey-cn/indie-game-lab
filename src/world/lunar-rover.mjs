import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeEquipmentFinish } from "../rendering/lunar-equipment-finish.mjs";
import { getAerospaceTrimSheet } from "../rendering/lunar-trim-sheet.mjs";

const HALF_PI = Math.PI * 0.5;
const TAU = Math.PI * 2;
const TIRE_RADIUS = 0.275;

// The lunar wire tire deflects 12 mm under a static wheel load.
export function roverTireDeflection(normalLoad = 1) {
  return 0.012 * THREE.MathUtils.clamp(normalLoad, 0, 2.65);
}

function canvasTexture(width, height, draw, color = true) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function randomGenerator(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function coatingNoise(columns, rows, random) {
  const grid = Float32Array.from({ length: (columns + 1) * (rows + 1) }, random);
  return (u, v) => {
    const x = u * columns, y = v * rows;
    const column = Math.min(columns - 1, Math.floor(x)), row = Math.min(rows - 1, Math.floor(y));
    const i = row * (columns + 1) + column;
    const s = THREE.MathUtils.smoothstep(x - column, 0, 1), t = THREE.MathUtils.smoothstep(y - row, 0, 1);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(grid[i], grid[i + 1], s),
      THREE.MathUtils.lerp(grid[i + columns + 1], grid[i + columns + 2], s), t);
  };
}

function coatedPanels() {
  const random = randomGenerator(34031);
  const width = 384, height = 256;
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const brush = mask.getContext("2d");
  brush.fillStyle = "#000";
  brush.fillRect(0, 0, width, height);
  brush.fillStyle = "rgba(255,255,255,.20)";
  for (let scratch = 0; scratch < 62; scratch++) {
    const x = random() * width, y = height * (.40 + random() * .55);
    brush.strokeStyle = scratch % 5 ? "rgba(255,255,255,.30)" : "rgba(255,255,255,.71)";
    brush.lineWidth = .45 + random() * .7;
    brush.beginPath();
    brush.moveTo(x, y);
    brush.quadraticCurveTo(x + 4, y + (random() - .5), x + 4 + 23 * random() ** 1.5, y + (random() - .5) * 3.7);
    brush.stroke();
  }
  for (let chip = 0; chip < 102; chip++) {
    const x = random() * width;
    const lowerEdge = chip % 4 !== 0;
    const y = lowerEdge ? height - 4 - random() ** 2 * 23 : 2 + random() * 7;
    const size = .46 + random() ** 2 * 3.7;
    brush.fillStyle = chip % 3 ? "rgba(255,255,255,.71)" : "rgba(255,255,255,.92)";
    brush.beginPath();
    brush.moveTo(x, y);
    brush.lineTo(x + size * .59, y - size * .55);
    brush.lineTo(x + size * 1.43, y - size * .21);
    brush.lineTo(x + size * .98, y + size * .47);
    brush.closePath();
    brush.fill();
  }
  const wear = brush.getImageData(0, 0, width, height).data;
  const base = new Uint8ClampedArray(width * height * 4);
  const surface = new Uint8ClampedArray(base.length);
  const cast = coatingNoise(9, 7, random);
  const pores = coatingNoise(54, 41, random);
  const brushing = coatingNoise(4, 114, random);
  const { lerp, smoothstep } = THREE.MathUtils;
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const index = (y * width + x) * 4;
      const damage = wear[index] / 255;
      const mottling = cast(u, v), pits = pores(u, v) - 0.5, grain = random() - 0.5;
      const stroke = brushing(u, v) - 0.5;
      const primer = smoothstep(damage, 0.04, 0.52);
      const alloy = smoothstep(damage, 0.36, 0.79);
      const dust = 0.33 * smoothstep(v + 0.13 * mottling, 0.57, 1.04) * (0.2 + 0.8 * mottling);
      const coatVariation = 21 * (mottling - 0.5) + 9 * pits + 5 * grain;
      base[index] = lerp(lerp(lerp(235 + coatVariation, 145, primer * 0.80), 164 + 30 * stroke, alloy), 147, dust);
      base[index + 1] = lerp(lerp(lerp(233 + coatVariation, 135, primer * 0.80), 167 + 30 * stroke, alloy), 138, dust);
      base[index + 2] = lerp(lerp(lerp(224 + coatVariation, 119, primer * 0.83), 166 + 29 * stroke, alloy), 132, dust);
      base[index + 3] = 255;
      // Red stores relief, green roughness, and blue the metal exposed by a chip.
      surface[index] = 148 - 52 * primer - 19 * alloy + 19 * pits + 12 * stroke * alloy + 4 * grain;
      surface[index + 1] = lerp(150 + 35 * (mottling - 0.5) + 19 * pits + 83 * dust, 75 + 26 * stroke, alloy);
      surface[index + 2] = lerp(20 + 9 * pits, 218, alloy) * (1 - 0.70 * dust);
      surface[index + 3] = 255;
    }
  }
  const makeMap = (data, color) => canvasTexture(width, height, (context, w, h) => {
    context.putImageData(new ImageData(data, w, h), 0, 0);
  }, color);
  const albedo = makeMap(base, true);
  const abrasion = makeMap(surface, false);
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: albedo, roughness: 0.98, roughnessMap: abrasion,
    bumpMap: abrasion, bumpScale: 0.0051,
    metalness: 0.95, metalnessMap: abrasion, clearcoat: 0.055, clearcoatRoughness: 0.63,
  });
}

function roverDustMask() {
  const random = randomGenerator(28763);
  const tile = canvasTexture(192, 128, (context, width, height) => {
    context.fillStyle = "#777777";
    context.fillRect(0, 0, width, height);
    for (let i = 0; i < 125; i++) {
      const x = random() * width;
      const y = random() * height;
      const radius = 2 + random() ** 1.65 * 34;
      const tint = random() < 0.5 ? "228,228,228" : "31,31,31";
      const field = context.createRadialGradient(x, y, 0, x, y, radius);
      field.addColorStop(0, `rgba(${tint},.44)`);
      field.addColorStop(1, `rgba(${tint},0)`);
      context.fillStyle = field;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 2100; i++) {
      const gray = random() < 0.53 ? 34 : 221;
      context.fillStyle = `rgba(${gray},${gray},${gray},.33)`;
      context.fillRect(random() * width, random() * height, 0.45 + random() * 1.95, 0.40 + random() * 1.50);
    }
  }, false);
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
  return tile;
}

// Rigid body parts are merged in rover coordinates. Deposits stay on the lower
// armor, and different materials share the same abrasion at adjacent panel edges.
function weatherRoverBody(material, tile, dustStrength, edgeStrength) {
  material.onBeforeCompile = shader => {
    shader.uniforms.roverDustMask = { value: tile };
    shader.uniforms.roverDustProfile = { value: new THREE.Vector2(dustStrength, edgeStrength) };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", /* glsl */ `
      #include <common>
      varying vec3 roverSurfacePoint;
    `).replace("#include <begin_vertex>", /* glsl */ `
      #include <begin_vertex>
      roverSurfacePoint = position;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", /* glsl */ `
      #include <common>
      uniform sampler2D roverDustMask;
      uniform vec2 roverDustProfile;
      varying vec3 roverSurfacePoint;
    `).replace("#include <color_fragment>", /* glsl */ `
      #include <color_fragment>
      vec3 panelPoint = roverSurfacePoint;
      vec2 panelUV = vec2(1.35 * panelPoint.z + 1.27 * panelPoint.x,
        5.06 * panelPoint.y + 1.54 * panelPoint.x - 0.87 * panelPoint.z);
      float powderPattern = texture2D(roverDustMask, panelUV).r;
      float grains = texture2D(roverDustMask, vec2(panelUV.x * 2.9, panelUV.y * 1.85) + 0.42).r;
      float splash = smoothstep(0.45, 0.68, powderPattern) * 0.84
        + smoothstep(0.37, 0.69, grains) * 0.16;
      float tireThrow = max(1.0 - smoothstep(0.05, 0.39, abs(panelPoint.z + 0.53)),
        1.0 - smoothstep(0.04, 0.55, abs(panelPoint.z - 0.55)));
      float seam = 1.0 - smoothstep(0.005, 0.029, abs(panelPoint.y - 0.461));
      float lowerPanels = 1.0 - smoothstep(0.362, 0.615 + 0.036 * (powderPattern - 0.5), panelPoint.y);
      float dustFilm = clamp(roverDustProfile.x * (lowerPanels * (0.10 + 0.70 * splash + 0.20 * tireThrow)
        + 0.23 * seam * splash), 0.0, 1.0);
      float nearEdge = max(1.0 - smoothstep(0.004, 0.022, abs(panelPoint.y - 0.611)), seam);
      float edgeChip = roverDustProfile.y * nearEdge * smoothstep(0.57, 0.77, grains) * (1.0 - 0.64 * dustFilm);
      vec3 bareMetal = vec3(0.267, 0.280, 0.282);
      vec3 dustColor = mix(vec3(0.102, 0.088, 0.074), vec3(0.283, 0.257, 0.227), grains);
      diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.23 * seam * splash), bareMetal, edgeChip * 0.82);
      diffuseColor.rgb = mix(diffuseColor.rgb, dustColor, dustFilm);
    `).replace("#include <roughnessmap_fragment>", /* glsl */ `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(mix(roughnessFactor, 0.44, edgeChip), 0.94, dustFilm);
    `).replace("#include <metalnessmap_fragment>", /* glsl */ `
      #include <metalnessmap_fragment>
      metalnessFactor = mix(mix(metalnessFactor, 0.73, edgeChip), 0.025, dustFilm);
    `).replace("#include <normal_fragment_maps>", /* glsl */ `
      #include <normal_fragment_maps>
      vec3 panelDx = dFdx(-vViewPosition);
      vec3 panelDy = dFdy(-vViewPosition);
      vec3 panelTangentX = cross(panelDy, normal);
      vec3 panelTangentY = cross(normal, panelDx);
      float panelDet = dot(panelDx, panelTangentX);
      float panelRelief = grains * dustFilm - 0.65 * edgeChip - 0.35 * seam * (0.56 + 0.44 * powderPattern);
      vec3 panelGradient = sign(panelDet) * (dFdx(panelRelief) * panelTangentX + dFdy(panelRelief) * panelTangentY);
      normal = normalize(max(0.000001, abs(panelDet)) * normal - 0.0019 * panelGradient);
    `);
  };
  material.customProgramCacheKey = () => "rover-local-wear";
  return material;
}

function blanketMaterials() {
  const random = randomGenerator(11603);
  const relief = canvasTexture(192, 128, (paint, w, h) => {
    paint.fillStyle = "#797979";
    paint.fillRect(0, 0, w, h);
    for (let i = 0; i < 450; i++) {
      const x = random() * w, y = random() * h;
      const shade = 28 + Math.floor(random() * 200);
      paint.strokeStyle = `rgba(${shade},${shade},${shade},.32)`;
      paint.lineWidth = 0.3 + random() * 1.6;
      paint.beginPath();
      paint.moveTo(x, y);
      paint.quadraticCurveTo(x + 7 * random(), y + 5 * random(), x + 12 * random(), y - 10 * random());
      paint.stroke();
    }
    for (const y of [5, h - 7]) {
      paint.fillStyle = "#393939";
      paint.fillRect(0, y, w, 1.3);
      paint.fillStyle = "#afafaf";
      paint.fillRect(0, y + 2, w, 1);
    }
  }, false);
  const foil = new THREE.MeshPhysicalMaterial({
    color: 0xb98445, metalness: 0.62, roughness: 0.47,
    bumpMap: relief, bumpScale: 0.018, clearcoat: 0.23, clearcoatRoughness: 0.38,
  });
  const fabric = new THREE.MeshStandardMaterial({
    color: 0x8e8b80, metalness: 0.14, roughness: 0.76, bumpMap: relief, bumpScale: 0.009,
  });
  return { foil, fabric };
}

function machinedMetal() {
  const random = randomGenerator(5281);
  const tooling = canvasTexture(256, 96, (brush, width, height) => {
    const pixels = brush.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const pass = 137 + 23 * Math.sin(y * 1.51) + 31 * random();
      for (let x = 0; x < width; x++) {
        const gray = pass + 14 * random();
        pixels.data.set([gray, gray, gray, 255], (y * width + x) * 4);
      }
    }
    brush.putImageData(pixels, 0, 0);
  }, false);
  return new THREE.MeshStandardMaterial({
    color: 0x92928b, metalness: 0.76, roughness: 0.73, roughnessMap: tooling,
    bumpMap: tooling, bumpScale: 0.0035,
  });
}

function wireTireMaterial() {
  const wire = canvasTexture(256, 128, (paint, w, h) => {
    paint.fillStyle = "#777777";
    paint.fillRect(0, 0, w, h);
    for (const sign of [-1, 1]) {
      for (let i = -32; i <= 64; i++) {
        const x = i * 8;
        paint.strokeStyle = sign < 0 ? "#414141" : "#bfbfbf";
        paint.lineWidth = sign < 0 ? 2.5 : 1.2;
        paint.beginPath();
        paint.moveTo(x, 0);
        paint.lineTo(x + h * sign, h);
        paint.stroke();
      }
    }
  }, false);
  return new THREE.MeshStandardMaterial({
    color: 0x55544e, metalness: 0.48, roughness: 0.75,
    bumpMap: wire, bumpScale: 0.019,
  });
}

function solarMaterial() {
  const solar = canvasTexture(320, 256, (paint, w, h) => {
    const random = randomGenerator(8094);
    paint.fillStyle = "#121a22";
    paint.fillRect(0, 0, w, h);
    const cellX = w / 5, cellY = h / 4;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        const x = col * cellX + 2, y = row * cellY + 2;
        const sheen = paint.createLinearGradient(x, y, x + cellX, y + cellY);
        sheen.addColorStop(0, "#1a2a3c");
        sheen.addColorStop(0.5, `rgb(34, ${46 + Math.floor(12 * random())}, 77)`);
        sheen.addColorStop(1, "#172936");
        paint.fillStyle = sheen;
        paint.fillRect(x, y, cellX - 4, cellY - 4);
        paint.fillStyle = "#9c8e72";
        paint.fillRect(x + 4, y + 2, 0.75, cellY - 8);
        paint.fillStyle = "#5a6c84";
        for (let i = 1; i < 10; i++) paint.fillRect(x + 2, y + i * 6, cellX - 8, 0.5);
      }
    }
  });
  return new THREE.MeshPhysicalMaterial({
    map: solar, metalness: 0.36, roughness: 0.26,
    clearcoat: 0.85, clearcoatRoughness: 0.21,
  });
}

function lenses(color, intensity) {
  return new THREE.MeshPhysicalMaterial({
    color, emissive: color, emissiveIntensity: intensity, roughness: 0.28, clearcoat: 0.65,
  });
}

// Bake rigid details into one mesh per material, while each hub remains animated.
function partBatch(parent) {
  const list = new Map();
  return {
    add(material, source, position, rotation) {
      const geometry = source.index ? source.toNonIndexed() : source;
      if (geometry !== source) source.dispose();
      if (rotation) geometry.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)));
      geometry.translate(...position);
      if (!list.has(material)) list.set(material, []);
      list.get(material).push(geometry);
    },
    attach() {
      for (const [material, parts] of list) {
        const geometry = mergeGeometries(parts);
        for (const part of parts) part.dispose();
        if (!geometry) throw new Error("Rover part geometry is incomplete");
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = material.emissiveIntensity < 1.5 || !material.emissiveIntensity;
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
    },
  };
}

function box(batch, mat, w, h, d, x, y, z, bevel = 0.012, rotation) {
  const geometry = bevel > 0
    ? new RoundedBoxGeometry(w, h, d, 1, Math.min(bevel, 0.48 * Math.min(w, h, d)))
    : new THREE.BoxGeometry(w, h, d);
  batch.add(mat, geometry, [x, y, z], rotation);
}

function pin(batch, mat, radius, length, x, y, z, axis = "x", segments = 18) {
  const rotation = axis === "x" ? [0, 0, HALF_PI] : axis === "z" ? [HALF_PI, 0, 0] : undefined;
  batch.add(mat, new THREE.CylinderGeometry(radius, radius, length, segments), [x, y, z], rotation);
}

function serviceBolt(batch, metal, recess, x, y, z, axis) {
  const capOffset = 0.0041;
  pin(batch, metal, 0.010, 0.006, x, y, z, axis, 10);
  pin(batch, recess, 0.0043, 0.002, x, y + (axis === "y" ? capOffset : 0),
    z + (axis === "z" ? capOffset : 0), axis, 6);
}

function strut(batch, mat, start, end, r1, r2 = r1) {
  const linear = new THREE.Vector3(...start);
  const delta = new THREE.Vector3(...end).sub(linear);
  const geometry = new THREE.CylinderGeometry(r2, r1, delta.length(), 10);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()));
  batch.add(mat, geometry, linear.addScaledVector(delta, 0.5).toArray());
}

function cable(batch, mat, points, radius) {
  const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  batch.add(mat, new THREE.TubeGeometry(path, 16, radius, 5, false), [0, 0, 0]);
}

function armoredDeck(batch, material, outline, y, thickness, bevel) {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], -outline[0][1]);
  for (const [x, z] of outline.slice(1)) shape.lineTo(x, -z);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, steps: 1, bevelEnabled: true,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
  });
  geometry.rotateX(-HALF_PI);
  batch.add(material, geometry, [0, y, 0]);
}

function coil(batch, material, start, end, radius) {
  const mount = new THREE.Vector3(...start);
  const axis = new THREE.Vector3(...end).sub(mount);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  const vertices = [];
  for (let i = 0; i <= 36; i++) {
    const t = i / 36, angle = t * TAU * 5.3;
    vertices.push(new THREE.Vector3(radius * Math.cos(angle), axis.length() * t, radius * Math.sin(angle))
      .applyQuaternion(quaternion).add(mount));
  }
  const spiral = new THREE.CatmullRomCurve3(vertices);
  batch.add(material, new THREE.TubeGeometry(spiral, 60, 0.004, 5, false), [0, 0, 0]);
}

function badge(text, line, light) {
  return canvasTexture(384, 120, (paint, w, h) => {
    paint.fillStyle = light ? "#d8d5c8" : "#202523";
    paint.fillRect(0, 0, w, h);
    const ink = light ? "#272c2a" : "#edeee2";
    paint.lineWidth = 2;
    paint.strokeStyle = light ? "#6c6960" : "#888982";
    paint.strokeRect(4, 4, w - 8, h - 8);
    paint.fillStyle = ink;
    paint.font = "800 59px monospace";
    paint.fillText(text, 13, 68);
    paint.font = "bold 20px monospace";
    paint.fillText(line, 15, 101);
    paint.fillStyle = "#c18436";
    for (let i = 0; i < 4; i++) {
      paint.beginPath();
      const x = w - 86 + i * 17;
      paint.moveTo(x, 20);
      paint.lineTo(x + 12, 20);
      paint.lineTo(x - 6, 98);
      paint.lineTo(x - 18, 98);
      paint.closePath();
      paint.fill();
    }
  });
}

function createSampler(rover, { iron, rim, accent, rubber, optics }) {
  const assembly = new THREE.Group();
  assembly.name = "sample-handling-arm";
  rover.add(assembly);
  const shoulder = new THREE.Vector3(0.533, 0.911, 0.697);
  const stowedMast = new THREE.Vector3(0.585, 1.11, 0.53);
  const stowedCrosshead = new THREE.Vector3(0.628, 1.24, 0.30);
  const stowedWrist = new THREE.Vector3(0.632, 1.085, 0.106);
  const raisedMast = new THREE.Vector3(0.552, 1.38, 0.688);
  const raisedCrosshead = new THREE.Vector3(0.628, 1.82, 0.284);
  const raisedWrist = new THREE.Vector3(0.632, 1.64, 0.106);
  const mastPosition = new THREE.Vector3();
  const crossheadPosition = new THREE.Vector3();
  const wristPosition = new THREE.Vector3();
  const smoothWrist = new THREE.Vector3().copy(stowedWrist);
  const wristVel = new THREE.Vector3();
  const scanPoint = new THREE.Vector3(1.20, 0.55, 0.34);
  const candidate = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const right = new THREE.Vector3();
  const back = new THREE.Vector3();
  const elbowSpan = new THREE.Vector3();
  const elbowBend = new THREE.Vector3();
  const elbowMid = new THREE.Vector3();
  const ikElbow = new THREE.Vector3();
  const linkBasis = new THREE.Matrix4();
  const inverseVehicle = new THREE.Quaternion();
  const toolAttitude = new THREE.Quaternion();
  const headingAndFold = new THREE.Euler(0, 0, 0, "YZX");
  const drillAxis = new THREE.Vector3();
  const resolvedWrist = new THREE.Vector3();
  const drillTipLength = 0.123;
  const drillSeat = 0.037;
  const boomStowYaw = Math.atan2(raisedCrosshead.x - raisedMast.x, raisedMast.z - raisedCrosshead.z);
  const boomStowRadius = raisedMast.distanceTo(raisedCrosshead);
  // Overlapping multi-axis S-curve ranges replace the stiff 4-stage sequential step-machine,
  // while foldRange stays [0.008, 0.075] so the vertical drill drops the core cleanly into the storage cup before locking.
  const liftRange = [0.00, 0.42];
  const slewRange = [0.10, 0.66];
  const reachRange = [0.14, 0.78];
  const feedRange = [0.46, 0.96];
  const foldRange = [0.008, 0.075];
  const { clamp, damp, lerp, smootherstep } = THREE.MathUtils;
  const scanStatus = lenses(0x88eed9, 0.7);
  const drillHeatMat = new THREE.MeshStandardMaterial({
    color: 0x43484c, metalness: 0.78, roughness: 0.34,
    emissive: 0xff5a18, emissiveIntensity: 0, toneMapped: false,
  });

  // Open aerospace truss/clevis arm link with twin machined rails, accent fairing & telescopic hydraulic inner stage.
  function makeLink(name, sleeveLength, width) {
    const frame = new THREE.Group();
    frame.name = name;
    assembly.add(frame);
    const sleeve = partBatch(frame);
    // Twin machined side cheek rails + cross-ribs (replaces solid rectangular box tube)
    for (const s of [-1, 1]) {
      box(sleeve, iron, width * 0.24, sleeveLength, width * 0.78, s * width * 0.38, sleeveLength * 0.50, 0, width * 0.06);
      box(sleeve, rim, width * 0.10, sleeveLength * 0.86, width * 0.24, s * width * 0.49, sleeveLength * 0.50, width * 0.18, 0.003);
    }
    for (let r = 0; r < 3; r++) {
      const ry = sleeveLength * (0.20 + r * 0.30);
      box(sleeve, accent, width * 0.88, width * 0.28, width * 0.52, 0, ry, width * 0.16, 0.005);
    }
    box(sleeve, rim, width * 0.98, 0.024, width * 0.88, 0, sleeveLength * 0.97, 0, 0.005);
    // Exterior hydraulic cylinder barrel bolted alongside the truss sleeve
    pin(sleeve, iron, width * 0.16, sleeveLength * 0.78, 0, sleeveLength * 0.46, -width * 0.48, "y", 10);
    pin(sleeve, accent, width * 0.19, 0.022, 0, sleeveLength * 0.84, -width * 0.48, "y", 10);
    sleeve.attach();

    const rod = new THREE.Group();
    frame.add(rod);
    const rail = partBatch(rod);
    // Twin chrome guide rods + central hydraulic piston + flexible dark cable conduit
    for (const s of [-1, 1]) {
      pin(rail, rim, width * 0.15, 1, s * width * 0.19, 0.5, 0, "y", 10);
    }
    pin(rail, rim, width * 0.10, 1, 0, 0.5, -width * 0.48, "y", 8);
    box(rail, rubber, width * 0.14, 1, width * 0.26, 0, 0.5, width * 0.28, 0.003);
    rail.attach();
    return { frame, rod, sleeveLength };
  }

  const mast = makeLink("sampler-mast", 0.20, 0.082);
  const boom = makeLink("sampler-boom", 0.22, 0.072);
  const feed = makeLink("sampler-feed", 0.18, 0.058);

  // High-torque circular planetary servo actuators at each joint
  function hinge(name, radius) {
    const pivot = new THREE.Group();
    pivot.name = name;
    assembly.add(pivot);
    const motor = partBatch(pivot);
    pin(motor, iron, radius, radius * 1.9, 0, 0, 0, "x", 16);
    for (const s of [-1, 1]) {
      pin(motor, rim, radius * 0.72, 0.016, s * radius * 0.96, 0, 0, "x", 14);
      pin(motor, accent, radius * 0.42, 0.010, s * (radius * 0.96 + 0.009), 0, 0, "x", 10);
    }
    motor.attach();
    return pivot;
  }
  const shoulderTurret = hinge("sampler-shoulder-turret", 0.058);
  shoulderTurret.position.copy(shoulder);
  const mastHinge = hinge("sampler-mast-hinge", 0.054);
  const feedHinge = hinge("sampler-feed-hinge", 0.042);

  const wrist = new THREE.Group();
  wrist.name = "sampler-wrist";
  assembly.add(wrist);
  const carriage = partBatch(wrist);
  box(carriage, iron, 0.090, 0.078, 0.084, 0, 0, 0, 0.015);
  box(carriage, accent, 0.078, 0.022, 0.072, 0, -0.042, 0, 0.007);
  pin(carriage, rim, 0.026, 0.044, -0.039, -0.016, -0.016, "y", 14);
  pin(carriage, optics, 0.015, 0.008, -0.039, -0.041, -0.016, "y", 12);
  box(carriage, scanStatus, 0.022, 0.012, 0.034, 0.045, -0.016, 0.015, 0.002);
  carriage.attach();

  // Holographic cyan laser pre-scan cone & target ring projected from the wrist optics before drilling bite
  const scanBeamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.32, 2.8, 2.55), toneMapped: false, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const scanBeam = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.28, 16, 1, true), scanBeamMat);
  scanBeam.position.set(-0.036, -0.18, -0.014);
  scanBeam.visible = false;
  wrist.add(scanBeam);
  const scanRingMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.45, 3.1, 2.8), toneMapped: false, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const scanRing = new THREE.Mesh(new THREE.RingGeometry(0.052, 0.068, 24), scanRingMat);
  scanRing.rotation.x = -HALF_PI;
  scanRing.position.set(0, -0.26, 0);
  scanRing.visible = false;
  wrist.add(scanRing);

  const drill = new THREE.Group();
  drill.name = "sampling-spindle";
  wrist.add(drill);
  const cutter = partBatch(drill);
  pin(cutter, rim, 0.015, 0.094, 0, -0.047, 0, "y", 12);
  coil(cutter, accent, [0, -0.102, 0], [0, -0.02, 0], 0.017);
  cutter.attach();
  // Separate carbide tip mesh so it glows incandescent red-orange from drilling friction!
  const drillTipMesh = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.040, 10), drillHeatMat);
  drillTipMesh.position.set(0, -0.105, 0);
  drillTipMesh.rotation.x = Math.PI;
  drill.add(drillTipMesh);

  const gripper = new THREE.Group();
  const grip = new THREE.Object3D();
  grip.position.y = -0.104;
  gripper.add(grip);
  wrist.add(gripper);
  const jaws = [-1, 1].map(side => {
    const jaw = new THREE.Group();
    gripper.add(jaw);
    const parts = partBatch(jaw);
    box(parts, iron, 0.016, 0.059, 0.031, 0, -0.075, 0, 0.004);
    box(parts, rim, 0.022, 0.013, 0.030, -side * 0.006, -0.108, 0, 0.004);
    parts.attach();
    return jaw;
  });

  // Illuminated Sample Storage Cup with animated dual iris petals that swing open during sample drop-off
  const storage = new THREE.Group();
  storage.name = "sample-storage-cup";
  storage.position.set(stowedWrist.x, 0.868, stowedWrist.z);
  rover.add(storage);
  const storageHardware = partBatch(storage);
  box(storageHardware, iron, 0.27, 0.038, 0.157, -0.110, -0.114, 0, 0.011);
  box(storageHardware, rim, 0.038, 0.027, 0.151, -0.011, -0.094, 0, 0.004);
  box(storageHardware, rubber, 0.153, 0.026, 0.139, 0, -0.093, 0, 0.01);
  const cupProfile = [
    [0.001, -0.085], [0.058, -0.085], [0.080, -0.075], [0.102, -0.015], [0.103, 0],
    [0.086, 0], [0.086, -0.025], [0.066, -0.062], [0.001, -0.062],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  storageHardware.add(iron, new THREE.LatheGeometry(cupProfile, 28), [0, 0, 0]);
  storageHardware.add(accent, new THREE.TorusGeometry(0.094, 0.006, 6, 28), [0, -0.004, 0], [HALF_PI, 0, 0]);
  storageHardware.add(rim, new THREE.TorusGeometry(0.083, 0.004, 5, 28), [0, -0.023, 0], [HALF_PI, 0, 0]);
  serviceBolt(storageHardware, rim, rubber, -0.083, -0.089, -0.054, "y");
  serviceBolt(storageHardware, rim, rubber, -0.084, -0.089, 0.054, "y");
  storageHardware.attach();
  const cupGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.42, 2.6, 2.35), toneMapped: false, transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const cupGlowRing = new THREE.Mesh(new THREE.RingGeometry(0.074, 0.092, 24), cupGlowMat);
  cupGlowRing.rotation.x = -HALF_PI;
  cupGlowRing.position.y = 0.003;
  storage.add(cupGlowRing);
  const cupPetals = [-1, 1].map(side => {
    const hingeGroup = new THREE.Group();
    hingeGroup.position.set(side * 0.092, 0.004, 0);
    const petal = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.010, 0.142), rim);
    petal.position.set(-side * 0.044, 0, 0);
    hingeGroup.add(petal);
    storage.add(hingeGroup);
    return { hingeGroup, side };
  });

  function poseLink(link, start, end, heading) {
    direction.subVectors(end, start);
    const length = direction.length();
    direction.multiplyScalar(1 / Math.max(0.001, length));
    right.set(Math.cos(heading), 0, Math.sin(heading));
    right.addScaledVector(direction, -right.dot(direction));
    if (right.lengthSq() < 1e-5) right.set(1, 0, 0);
    else right.normalize();
    back.crossVectors(right, direction).normalize();
    link.frame.position.copy(start);
    link.frame.quaternion.setFromRotationMatrix(linkBasis.makeBasis(right, direction, back));
    link.rod.position.y = link.sleeveLength * 0.79;
    link.rod.scale.y = Math.max(0.024, length - link.rod.position.y);
  }

  // Analytical 2-Link Upward-Arching Elbow IK: computes an organic industrial elbow joint between A (shoulder) and B (wrist).
  function solveElbow(origin, target, baseLen, out) {
    elbowSpan.subVectors(target, origin);
    const dist = Math.max(0.08, elbowSpan.length());
    const seg = Math.max(baseLen, dist * 0.56);
    const halfDist = dist * 0.5;
    const arch = Math.sqrt(Math.max(0.0001, seg * seg - halfDist * halfDist));
    // Project global UP orthogonal to the span vector so the elbow always arches gracefully upward in the arm's reach plane.
    elbowBend.copy(up).addScaledVector(elbowSpan, -elbowSpan.y / (dist * dist));
    if (elbowBend.lengthSq() < 1e-4) elbowBend.set(0, 0, -1);
    else elbowBend.normalize();
    elbowMid.copy(origin).addScaledVector(elbowSpan, 0.5);
    return out.copy(elbowMid).addScaledVector(elbowBend, Math.min(arch, 0.76));
  }

  let extension = 0;
  let actuatorVelocity = 0;
  let scanProgress = 0;
  let spindleSpeed = 0;
  let drillHeat = 0;
  let lidOpen = 0;
  let animTime = 0;
  let targetHeading = boomStowYaw;
  let currentHeadingSmooth = boomStowYaw;
  let headingVel = 0;

  function canReachSample(target) {
    if (!target?.isVector3) return false;
    rover.worldToLocal(candidate.copy(target));
    const clearOfWheels = Math.abs(candidate.x) >= 0.94 || Math.abs(candidate.z) >= 1.00;
    const distance = Math.hypot(candidate.x - shoulder.x, candidate.z - shoulder.z);
    return clearOfWheels && distance <= 2.74 && Number.isFinite(candidate.y);
  }

  function getSamplerTip(out = new THREE.Vector3()) {
    return drill.localToWorld(out.set(0, -drillTipLength, 0));
  }

  function getSamplerStorage(out = new THREE.Vector3()) {
    return storage.getWorldPosition(out);
  }

  function phaseDerivative(value, [start, end]) {
    const t = clamp((value - start) / (end - start), 0, 1);
    return 30 * t * t * (1 - t) * (1 - t) / (end - start);
  }

  function updateSampler(dt, { active = false, progress = 0, target, mode = "precision", delivering = false, smoothRetract = true } = {}) {
    drill.visible = true;
    gripper.visible = false;
    animTime += dt;
    const operating = active && canReachSample(target);
    const rapid = mode === "rapid";
    if (operating) {
      scanProgress = damp(scanProgress, clamp(progress, 0, 1), 20, dt);
      scanPoint.copy(candidate);
      const heading = Math.atan2(scanPoint.x - raisedMast.x, raisedMast.z - scanPoint.z);
      const previous = extension < 0.20 ? boomStowYaw : targetHeading;
      const turn = Math.atan2(Math.sin(heading - previous), Math.cos(heading - previous));
      targetHeading = previous + turn;
    } else if (extension < 0.22) {
      scanProgress = damp(scanProgress, 0, 11, dt);
    }

    const destination = operating ? 1 : 0;
    const goalRadius = Math.hypot(scanPoint.x - raisedMast.x, scanPoint.z - raisedMast.z);
    const reachTravel = Math.abs(goalRadius - boomStowRadius) + 0.18;
    const currentReach = smootherstep(extension, ...reachRange);
    const sweepRadius = lerp(boomStowRadius, goalRadius, currentReach) + 0.18 * (1 - currentReach);
    const rotationTravel = Math.abs(targetHeading - boomStowYaw) * sweepRadius;
    const horizontal = Math.hypot(
      reachTravel * phaseDerivative(extension, reachRange),
      rotationTravel * phaseDerivative(extension, slewRange),
    );
    const vertical = 0.45 * phaseDerivative(extension, liftRange)
      + Math.max(0.55, raisedWrist.y - scanPoint.y) * phaseDerivative(extension, feedRange);
    const motionSlope = Math.max(1, horizontal + vertical);
    const gentleReturn = !operating && smoothRetract;
    const maxToolSpeed = operating ? (rapid ? 8.2 : 7.0) : (gentleReturn ? (delivering ? 2.5 : 3.0) : 7.8);
    const speedLimit = maxToolSpeed / motionSlope;
    const maxRetractRate = gentleReturn ? (delivering ? 0.58 : 0.68) : 1.45;
    const gain = gentleReturn ? 4.4 : (rapid ? 13 : 9.4);
    const requestedVelocity = clamp((destination - extension) * gain,
      -Math.min(maxRetractRate, speedLimit), Math.min(rapid ? 1.95 : 1.38, speedLimit));
    actuatorVelocity = damp(actuatorVelocity, requestedVelocity, gentleReturn ? 9.5 : 28, dt);
    extension = clamp(extension + actuatorVelocity * dt, 0, 1);

    const lift = smootherstep(extension, ...liftRange);
    const slew = smootherstep(extension, ...slewRange);
    const reach = smootherstep(extension, ...reachRange);
    const feedDepth = smootherstep(extension, ...feedRange);
    const align = smootherstep(scanProgress, 0.16, 0.296);
    const bite = smootherstep(scanProgress, 0.307, 0.72);
    const seal = smootherstep(scanProgress, 0.78, 0.971);
    const toolStroke = 0.024 * bite;
    const tipClearance = lerp(0.165, 0.012, align) - 0.098 * bite + 0.332 * seal;
    const travelAboveCut = drillTipLength + drillSeat + toolStroke + tipClearance;
    rover.getWorldQuaternion(inverseVehicle).invert();
    drillAxis.copy(up).applyQuaternion(inverseVehicle);
    drillAxis.lerp(up, 1 - smootherstep(feedDepth, 0.48, 0.96)).normalize();
    resolvedWrist.copy(scanPoint).addScaledVector(drillAxis, travelAboveCut);

    // Coordinated multi-axis shoulder + spring-damped turret yaw + curved overhead sweep trajectory for wrist
    mastPosition.copy(stowedMast).lerp(raisedMast, lift);
    const foldedHeading = Math.atan2(stowedWrist.x - mastPosition.x, mastPosition.z - stowedWrist.z);
    const desiredHeading = lerp(foldedHeading, targetHeading, slew);
    if (dt > 0) {
      const springK = 54, damperC = 11.5;
      headingVel += ((desiredHeading - currentHeadingSmooth) * springK - headingVel * damperC) * dt;
      currentHeadingSmooth += headingVel * dt;
    } else {
      currentHeadingSmooth = desiredHeading;
      headingVel = 0;
    }

    // Arcing wrist path: lifts smoothly along a sweeping cylindrical arc before descending precisely onto resolvedWrist
    const settledHeading = lerp(foldedHeading, currentHeadingSmooth, smootherstep(slew, 0.0, 0.14));
    const stowedRad = Math.hypot(stowedWrist.x - mastPosition.x, stowedWrist.z - mastPosition.z);
    const targetRad = Math.hypot(resolvedWrist.x - mastPosition.x, resolvedWrist.z - mastPosition.z);
    const arcRadius = lerp(stowedRad, targetRad, reach);
    const sweepArchY = lerp(stowedWrist.y, Math.max(raisedWrist.y, resolvedWrist.y + 0.26), smootherstep(lift, 0.18, 0.95));
    const arcX = mastPosition.x + Math.sin(settledHeading) * arcRadius;
    const arcZ = mastPosition.z - Math.cos(settledHeading) * arcRadius;
    wristPosition.set(
      lerp(arcX, resolvedWrist.x, feedDepth),
      lerp(sweepArchY, resolvedWrist.y, feedDepth),
      lerp(arcZ, resolvedWrist.z, feedDepth),
    );
    // Subtle 2nd-order inertial smoothing (fades off at high feedDepth AND near stow so both drilling & cup drop stay exact)
    const springBlend = smootherstep(slew, 0.02, 0.18) * (1 - smootherstep(feedDepth, 0.72, 0.96));
    if (dt > 0 && extension > 0.01) {
      const settleStiff = lerp(75, 190, feedDepth);
      const settleDamp = lerp(14, 26, feedDepth);
      wristVel.x += ((wristPosition.x - smoothWrist.x) * settleStiff - wristVel.x * settleDamp) * dt;
      wristVel.y += ((wristPosition.y - smoothWrist.y) * settleStiff - wristVel.y * settleDamp) * dt;
      wristVel.z += ((wristPosition.z - smoothWrist.z) * settleStiff - wristVel.z * settleDamp) * dt;
      smoothWrist.addScaledVector(wristVel, dt);
      wristPosition.lerp(smoothWrist, springBlend);
    } else {
      smoothWrist.copy(wristPosition);
      wristVel.set(0, 0, 0);
    }

    // High-frequency mechanical recoil micro-vibration during active cutting
    const cutting = operating ? align * (1 - seal) * smootherstep(feedDepth, 0.63, 0.98) : 0;
    if (cutting > 0.02) {
      const recoilAmp = cutting * (rapid ? 0.0085 : 0.0052);
      wristPosition.x += Math.sin(animTime * 112) * recoilAmp * 0.45;
      wristPosition.y += Math.sin(animTime * 148) * recoilAmp;
      wristPosition.z += Math.cos(animTime * 97) * recoilAmp * 0.45;
    }

    // Solve true upward-arching 2-link analytical elbow IK and blend cleanly into stowed posture
    solveElbow(mastPosition, wristPosition, 0.78, ikElbow);
    crossheadPosition.copy(stowedCrosshead).lerp(ikElbow, smootherstep(extension, 0.02, 0.26));

    const armYaw = Math.atan2(wristPosition.x - mastPosition.x, mastPosition.z - wristPosition.z);
    poseLink(mast, shoulder, mastPosition, foldedHeading);
    poseLink(boom, mastPosition, crossheadPosition, armYaw);
    poseLink(feed, crossheadPosition, wristPosition, armYaw);
    shoulderTurret.rotation.y = -armYaw;
    mastHinge.position.copy(mastPosition);
    mastHinge.quaternion.copy(boom.frame.quaternion);
    feedHinge.position.copy(crossheadPosition);
    feedHinge.quaternion.copy(feed.frame.quaternion);
    wrist.position.copy(wristPosition);

    const idleBreath = extension < 0.02 ? Math.sin(animTime * 1.15) * 0.045 : 0;
    const fold = (1 - smootherstep(extension, ...foldRange)) * HALF_PI;
    headingAndFold.set(0, -armYaw + idleBreath, fold, "YZX");
    toolAttitude.setFromEuler(headingAndFold);
    wrist.quaternion.setFromUnitVectors(up, drillAxis).multiply(toolAttitude);

    drill.position.y = -drillSeat - toolStroke;
    const nextSpeed = damp(spindleSpeed, (rapid ? 54 : 38) * cutting, 11, dt);
    drill.rotation.y = (drill.rotation.y + (spindleSpeed + nextSpeed) * 0.5 * dt) % TAU;
    spindleSpeed = nextSpeed;

    // Thermal red-orange heat glow on the carbide drill tip during cutting
    drillHeat = damp(drillHeat, cutting > 0.08 ? (rapid ? 1.0 : 0.72) : 0, cutting > 0.08 ? 3.5 : 1.4, dt);
    drillHeatMat.emissiveIntensity = drillHeat * 3.1;
    scanStatus.emissiveIntensity = 0.40 + slew * (0.95 + cutting * 0.55);

    // Pre-drill cyan holographic laser targeting cone & reticle ring
    const preScan = operating && feedDepth > 0.52 && scanProgress < 0.36 ? smootherstep(feedDepth, 0.52, 0.88) * (1 - smootherstep(scanProgress, 0.28, 0.36)) : 0;
    scanBeam.visible = preScan > 0.02;
    scanRing.visible = preScan > 0.02;
    if (preScan > 0.02) {
      const pulse = 0.72 + 0.28 * Math.sin(animTime * 24);
      scanBeamMat.opacity = preScan * 0.34 * pulse;
      scanRingMat.opacity = preScan * 0.78 * pulse;
      const ringScale = 1.25 - preScan * 0.35 + Math.sin(animTime * 16) * 0.06;
      scanRing.scale.setScalar(ringScale);
      scanRing.rotation.z = animTime * 3.2;
    }

    // Auto-opening glowing sample storage cup petals while stowing/delivering a core
    const wantLidOpen = delivering || (operating && seal > 0.25) ? 1 : 0;
    lidOpen = damp(lidOpen, wantLidOpen, 12, dt);
    cupGlowMat.opacity = 0.14 + lidOpen * 0.72 * (0.85 + 0.15 * Math.sin(animTime * 10));
    for (const { hingeGroup, side } of cupPetals) {
      hingeGroup.rotation.z = -side * lidOpen * 1.65;
    }
  }

  function poseKitArm(target, amount, clamped, caseAttitude) {
    drill.visible = false;
    gripper.visible = true;
    scanBeam.visible = false;
    scanRing.visible = false;
    // Crisp hydraulic snap clamp curve on jaws
    const jawClose = Math.pow(clamp(clamped, 0, 1), 0.45);
    for (const [index, jaw] of jaws.entries()) jaw.position.x = (index * 2 - 1) * lerp(0.050, 0.025, jawClose);
    rover.getWorldQuaternion(inverseVehicle).invert();
    toolAttitude.copy(inverseVehicle).multiply(caseAttitude);
    drillAxis.copy(up).applyQuaternion(toolAttitude);
    resolvedWrist.copy(target);
    rover.worldToLocal(resolvedWrist).addScaledVector(drillAxis, -grip.position.y);

    const smoothAmt = smootherstep(amount, 0, 1);
    mastPosition.copy(stowedMast).lerp(raisedMast, smoothAmt);
    wristPosition.copy(stowedWrist).lerp(resolvedWrist, smoothAmt);
    // Graceful overhead industrial arc with slight heavy-load dip that zeroes cleanly at amount === 1 (preserves gripGap === 0)
    wristPosition.y += 0.58 * Math.sin(Math.PI * smoothAmt) - 0.022 * jawClose * Math.sin(Math.PI * smoothAmt);
    solveElbow(mastPosition, wristPosition, 0.82, ikElbow);
    crossheadPosition.copy(stowedCrosshead).lerp(ikElbow, smootherstep(smoothAmt, 0.0, 0.28));

    const heading = Math.atan2(wristPosition.x - mastPosition.x, mastPosition.z - wristPosition.z);
    poseLink(mast, shoulder, mastPosition, boomStowYaw);
    poseLink(boom, mastPosition, crossheadPosition, heading);
    poseLink(feed, crossheadPosition, wristPosition, heading);
    shoulderTurret.rotation.y = -heading;
    mastHinge.position.copy(mastPosition);
    mastHinge.quaternion.copy(boom.frame.quaternion);
    feedHinge.position.copy(crossheadPosition);
    feedHinge.quaternion.copy(feed.frame.quaternion);
    wrist.position.copy(wristPosition);
    wrist.quaternion.copy(toolAttitude);
    smoothWrist.copy(wristPosition);
  }

  function getKitGrip(out) { return grip.getWorldPosition(out); }

  function resetSampler() {
    extension = 0;
    actuatorVelocity = 0;
    scanProgress = 0;
    spindleSpeed = 0;
    drillHeat = 0;
    lidOpen = 0;
    targetHeading = boomStowYaw;
    currentHeadingSmooth = boomStowYaw;
    headingVel = 0;
    drill.rotation.y = 0;
    smoothWrist.copy(stowedWrist);
    wristVel.set(0, 0, 0);
    updateSampler(0);
  }

  resetSampler();
  return { canReachSample, updateSampler, getSamplerTip, getSamplerStorage, resetSampler, poseKitArm, getKitGrip };
}

function makeRearGuard(chassis, mount, side, { paint, iron, machine, undercarriage, accent }) {
  const guard = new THREE.Group();
  guard.name = "rear-wheel-mudguard";
  mount.add(guard);
  const parts = partBatch(guard);

  // Cross-section of the curved painted press panel, wrapped lip, and inner liner.
  // The small radius remains outside the entire steered tread in carrier space.
  const section = [
    [-0.106, 0.309, iron], [-0.102, 0.321, paint], [-0.086, 0.334, paint],
    [0.087, 0.337, paint], [0.117, 0.333, paint], [0.137, 0.321, machine],
    [0.141, 0.314, iron], [0.141, 0.305, iron], [0.133, 0.300, iron],
    [0.118, 0.300, iron], [0.106, 0.308, iron], [-0.084, 0.307, iron],
    [-0.102, 0.302, iron],
  ];
  const halfArc = 1.01;
  const slices = 32;
  const panels = new Map();
  function surfaceFor(material) {
    if (!panels.has(material)) panels.set(material, { position: [], normal: [], uv: [] });
    return panels.get(material);
  }
  function archPoint(u, radius, angle) {
    const taper = THREE.MathUtils.smootherstep(Math.abs(angle), 0.74, halfArc);
    const r = radius + 0.0045 * taper;
    return [side * u * (1 - 0.065 * taper), r * Math.cos(angle), r * Math.sin(angle)];
  }
  function pushVertex(surface, point, normal, angle, u) {
    surface.position.push(...point);
    surface.normal.push(...normal);
    surface.uv.push((u + 0.120) / 0.263, 1 - 0.94 * Math.abs(angle) / halfArc);
  }

  for (let edge = 0; edge < section.length; edge++) {
    const [u0, r0, material] = section[edge];
    const [u1, r1] = section[(edge + 1) % section.length];
    const surface = surfaceFor(material);
    const width = u1 - u0;
    const rise = r1 - r0;
    const length = Math.hypot(width, rise);
    for (let slice = 0; slice < slices; slice++) {
      const a0 = halfArc * (2 * slice / slices - 1);
      const a1 = halfArc * (2 * (slice + 1) / slices - 1);
      const a0Normal = [-side * rise / length, width * Math.cos(a0) / length, width * Math.sin(a0) / length];
      const a1Normal = [-side * rise / length, width * Math.cos(a1) / length, width * Math.sin(a1) / length];
      const quad = [
        [archPoint(u0, r0, a0), a0Normal, a0, u0], [archPoint(u0, r0, a1), a1Normal, a1, u0],
        [archPoint(u1, r1, a1), a1Normal, a1, u1], [archPoint(u1, r1, a0), a0Normal, a0, u1],
      ];
      const triangles = side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const index of triangles) pushVertex(surface, ...quad[index]);
    }
  }

  const ends = THREE.ShapeUtils.triangulateShape(section.map(([u, r]) => new THREE.Vector2(u, r)), []);
  const cap = surfaceFor(iron);
  for (const end of [-1, 1]) {
    const angle = end * halfArc;
    const normal = [0, -end * Math.sin(angle), end * Math.cos(angle)];
    for (const face of ends) {
      const [a, b, c] = face;
      const winding = side === end ? [a, b, c] : [a, c, b];
      for (const index of winding) {
        const [u, r] = section[index];
        pushVertex(cap, archPoint(u, r, angle), normal, angle, u);
      }
    }
  }
  for (const [material, values] of panels) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(values.position, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(values.normal, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(values.uv, 2));
    parts.add(material, geometry, [0, 0, 0]);
  }

  // The rear-mounted guide shares vertical travel with the carrier and clears the steered tire.
  const guideX = side * -0.160;
  const guideZ = 0.328;
  box(parts, iron, 0.035, 0.058, 0.034, guideX, 0.095, guideZ, 0.006);
  pin(parts, machine, 0.010, 0.284, guideX, -0.063, guideZ, "y", 10);
  for (const y of [0.082, 0.103]) {
    pin(parts, machine, 0.0075, 0.007, guideX, y, guideZ + 0.019, "z", 8);
  }
  const beamUp = new THREE.Vector3(0, 1, 0);
  function foldedSupport(a, b, width) {
    const start = new THREE.Vector3(...a);
    const slope = new THREE.Vector3(...b).sub(start);
    const piece = new RoundedBoxGeometry(0.014, slope.length(), width, 1, 0.004);
    piece.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(beamUp, slope.clone().normalize()));
    parts.add(iron, piece, start.addScaledVector(slope, 0.5).toArray());
  }
  for (const [origin, knee, end] of [
    [[guideX, 0.091, guideZ], [side * -0.127, 0.155, 0.322], [side * -0.089, 0.178, 0.258]],
    [[guideX, 0.108, guideZ], [side * 0.019, 0.153, 0.326], [side * 0.069, 0.170, 0.267]],
  ]) {
    foldedSupport(origin, knee, 0.024);
    foldedSupport(knee, end, 0.023);
  }
  for (const angle of [-0.65, 0, 0.65]) {
    const y = 0.313 * Math.cos(angle);
    const z = 0.313 * Math.sin(angle);
    pin(parts, machine, 0.009, 0.007, side * 0.144, y, z, "x", 9);
    pin(parts, iron, 0.004, 0.002, side * 0.148, y, z, "x", 6);
  }
  // Sculpted external stiffening ribs, dark edge trim & amber clearance markers break up the smooth white fender arc.
  for (const ribAngle of [-0.56, 0.0, 0.56]) {
    const ry = 0.336 * Math.cos(ribAngle);
    const rz = 0.336 * Math.sin(ribAngle);
    box(parts, iron, 0.252, 0.015, 0.024, side * 0.012, ry, rz, 0.004, [ribAngle, 0, 0]);
    box(parts, machine, 0.236, 0.007, 0.010, side * 0.012, ry + 0.009 * Math.cos(ribAngle), rz + 0.009 * Math.sin(ribAngle), 0.002, [ribAngle, 0, 0]);
  }
  // Trailing dark rubber/titanium debris flap & recessed side clearance marker.
  const trailA = 0.94;
  box(parts, undercarriage, 0.242, 0.056, 0.016, side * 0.012, 0.318 * Math.cos(trailA) - 0.022, 0.318 * Math.sin(trailA) + 0.016, 0.005, [0.42, 0, 0]);
  box(parts, accent, 0.012, 0.018, 0.044, side * 0.143, 0.316 * Math.cos(0.42), 0.316 * Math.sin(0.42), 0.003, [0.42, 0, 0]);
  parts.attach();

  const sleeve = new THREE.Group();
  sleeve.name = "rear-guard-travel-guide";
  chassis.add(sleeve);
  const housing = partBatch(sleeve);
  const x = mount.position.x + guideX;
  const z = mount.position.z + guideZ;
  const guideProfile = [
    [0.012, -0.027], [0.018, -0.027], [0.021, -0.022], [0.019, -0.014],
    [0.019, 0.014], [0.021, 0.022], [0.018, 0.027], [0.012, 0.027], [0.012, -0.027],
  ].map(([radius, y]) => new THREE.Vector2(radius, y));
  housing.add(machine, new THREE.LatheGeometry(guideProfile, 16), [x, 0.193, z]);
  strut(housing, iron, [side * 0.404, 0.352, 0.771], [side * 0.406, 0.217, z], 0.016);
  strut(housing, iron, [side * 0.405, 0.216, z], [x - side * 0.029, 0.193, z], 0.016, 0.014);
  housing.attach();
}

function makeWheel(parent, side, z, index, materials) {
  const mount = new THREE.Group();
  const steering = new THREE.Group();
  const hub = new THREE.Group();
  const compliantTire = new THREE.Group();
  const treadSpin = new THREE.Group();
  const x = side * 0.64;
  mount.name = `suspension-${side}-${index}`;
  steering.name = "steering-knuckle";
  hub.name = "rolling-wheel";
  compliantTire.name = "loaded-wire-tire";
  treadSpin.name = "rolling-tread";
  mount.position.set(x, TIRE_RADIUS, z);
  parent.add(mount);
  mount.add(steering);
  if (index === 2) makeRearGuard(parent, mount, side, materials);
  steering.add(hub, compliantTire);
  compliantTire.add(treadSpin);
  const wheel = partBatch(hub);
  const tireParts = partBatch(treadSpin);
  const { tire, tread, rim, undercarriage, iron, accent, rimFlash, chalk } = materials;

  const barrel = [
    new THREE.Vector2(0.158, -0.101),
    new THREE.Vector2(0.219, -0.105),
    new THREE.Vector2(0.242, -0.091),
    new THREE.Vector2(0.253, -0.062),
    new THREE.Vector2(0.257, -0.028),
    new THREE.Vector2(0.257, 0.028),
    new THREE.Vector2(0.253, 0.062),
    new THREE.Vector2(0.242, 0.091),
    new THREE.Vector2(0.219, 0.105),
    new THREE.Vector2(0.158, 0.101),
  ];
  tireParts.add(tire, new THREE.LatheGeometry(barrel, 56), [0, 0, 0], [0, 0, HALF_PI]);
  const visibleSide = 0.110 * side;
  const ring = new THREE.TorusGeometry(0.176, 0.007, 7, 48);
  wheel.add(rim, ring, [visibleSide, 0, 0], [0, HALF_PI, 0]);
  wheel.add(rim, new THREE.TorusGeometry(0.165, 0.004, 6, 48), [visibleSide + 0.009 * side, 0, 0], [0, HALF_PI, 0]);
  wheel.add(iron, new THREE.TorusGeometry(0.202, 0.0047, 7, 42), [visibleSide - 0.005 * side, 0, 0], [0, HALF_PI, 0]);
  // The motor housing and caliper shift with steering and suspension; the rotor and rim revolve.
  const stationary = partBatch(steering);
  pin(stationary, iron, 0.092, 0.117, side * -0.102, 0, 0);
  pin(stationary, undercarriage, 0.119, 0.027, side * -0.088, 0, 0);
  for (let bolt = 0; bolt < 6; bolt++) {
    const theta = bolt * TAU / 6;
    pin(stationary, rim, 0.01, 0.012, side * -0.11, 0.099 * Math.cos(theta), 0.099 * Math.sin(theta), "x", 6);
  }
  box(stationary, accent, 0.044, 0.076, 0.059, side * 0.063, 0.081, 0.082, 0.012, [0.29, 0, 0]);
  stationary.attach();
  pin(wheel, undercarriage, 0.079, 0.018, side * 0.04, 0, 0);
  wheel.add(rim, new THREE.RingGeometry(0.081, 0.122, 40), [side * 0.049, 0, 0], [0, side * HALF_PI, 0]);
  pin(wheel, rim, 0.063, 0.039, visibleSide + 0.018 * side, 0, 0);
  pin(wheel, iron, 0.037, 0.018, visibleSide + 0.041 * side, 0, 0, "x", 12);
  pin(wheel, accent, 0.015, 0.006, visibleSide + 0.052 * side, 0, 0, "x", 10);
  for (let spoke = 0; spoke < 7; spoke++) {
    const angle = spoke * TAU / 7;
    const y = Math.sin(angle), s = Math.cos(angle);
    box(wheel, rim, 0.031, 0.033, 0.113, visibleSide - side * 0.005, y * 0.111, s * 0.111,
      0.008, [-angle, side * 0.1, 0]);
    box(wheel, undercarriage, 0.012, 0.026, 0.063, visibleSide + side * 0.010, y * 0.117, s * 0.117,
      0.004, [-angle, 0, 0]);
    pin(wheel, iron, 0.009, 0.008, visibleSide + side * 0.014, y * 0.154, s * 0.154, "x", 6);
  }

  // A single inspection patch and offset fastener keep motion readable at driving distance.
  const markAngle = 0.48 + index * 1.61 + (side < 0 ? 0.81 : 0);
  const polarMarker = new THREE.Group();
  polarMarker.name = "wheel-inspection-mark";
  polarMarker.rotation.x = markAngle;
  hub.add(polarMarker);
  const marker = partBatch(polarMarker);
  box(marker, rimFlash, 0.006, 0.032, 0.098, side * 0.125, 0.0, 0.151, 0.0015);
  box(marker, chalk, 0.006, 0.024, 0.029, side * 0.126, 0.009, 0.197, 0.001);
  box(marker, chalk, 0.006, 0.011, 0.014, side * 0.127, -0.022, 0.139, 0.001);
  marker.attach();

  const rotation = new THREE.Quaternion();
  const axle = new THREE.Vector3(1, 0, 0);
  for (let index = 0; index < 29; index++) {
    const angle = index * TAU / 29;
    rotation.setFromAxisAngle(axle, angle);
    for (const half of [-1, 1]) {
      const segment = new THREE.BoxGeometry(0.111, 0.018, 0.022);
      segment.rotateY(half * 0.28);
      segment.translate(half * 0.043, 0.263, 0);
      segment.applyQuaternion(rotation);
      tireParts.add(index === 4 ? rimFlash : tread, segment, [0, 0, 0]);
    }
  }
  wheel.attach();
  tireParts.attach();
  return { hub, mount, steering, compliantTire, treadSpin, x, z, tireRadius: TIRE_RADIUS, polarMarker };
}

export function createLunarRover({ glow } = {}) {
  const rover = new THREE.Group();
  rover.name = "Selene L-07 lunar rover";
  rover.rotation.y = -0.53;
  const body = partBatch(rover);
  const trim = getAerospaceTrimSheet();
  const paint = coatedPanels();
  paint.normalMap = trim.normalMap;
  paint.normalScale = new THREE.Vector2(0.42, 0.42);
  const { foil, fabric } = blanketMaterials();
  const machine = machinedMetal();
  const iron = new THREE.MeshStandardMaterial({
    color: 0x353b3d, metalness: 0.50, roughness: 0.54,
    normalMap: trim.normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
  });
  const undercarriage = new THREE.MeshStandardMaterial({ color: 0x565a57, metalness: 0.50, roughness: 0.65 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x9ca0a1, metalness: 0.70, roughness: 0.68,
    roughnessMap: machine.roughnessMap, bumpMap: machine.bumpMap, bumpScale: 0.0042 });
  const dustMask = roverDustMask();
  const hullCoating = weatherRoverBody(paint.clone(), dustMask, 0.92, 0.90);
  const lowerArmor = weatherRoverBody(iron.clone(), dustMask, 0.98, 0.65);
  const lowerHardware = weatherRoverBody(undercarriage.clone(), dustMask, 0.94, 0.56);
  const sillMetal = weatherRoverBody(rim.clone(), dustMask, 0.63, 0.76);
  const goldFoil = foil.clone();
  goldFoil.color.setHex(0xdcb056);
  goldFoil.metalness = 0.72;
  goldFoil.roughness = 0.34;
  const sideBlanket = weatherRoverBody(goldFoil, dustMask, 0.52, 0.40);
  const latchMetal = makeEquipmentFinish(0x96958b, "anodized", 73);
  const tread = new THREE.MeshStandardMaterial({ color: 0x737876, metalness: 0.61, roughness: 0.61 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xae7547, metalness: 0.49, roughness: 0.53 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1c2528, metalness: 0.13, roughness: 0.81 });
  const rimFlash = new THREE.MeshStandardMaterial({
    color: 0xfad17a, emissive: 0x71522a, emissiveIntensity: 0.45, roughness: 0.62, metalness: 0.14,
  });
  const chalk = new THREE.MeshStandardMaterial({
    color: 0xece9d1, emissive: 0x80795d, emissiveIntensity: 0.24, roughness: 0.80,
  });
  const optics = new THREE.MeshPhysicalMaterial({
    color: 0x243a48, metalness: 0.37, roughness: 0.17, clearcoat: 1, clearcoatRoughness: 0.1,
  });
  const frontLamps = lenses(0xdaf1ff, 3.1);
  const rearLamps = lenses(0xff6940, 2.85);
  const indicator = lenses(0xffba6a, 1.45);

  // Redesigned Wedge-Stance Tapered Armored Hull (forward-leaning explorer silhouette instead of flat boxy tub).
  const hull = [
    [-0.27, -0.85], [0.26, -0.85], [0.42, -0.60], [0.475, -0.18], [0.445, 0.16],
    [0.468, 0.56], [0.35, 0.735], [-0.34, 0.735], [-0.468, 0.56], [-0.46, -0.52],
  ];
  armoredDeck(body, lowerArmor, hull.map(([x, z]) => [x * 0.80, z * 0.96]), 0.268, 0.168, 0.024);
  armoredDeck(body, hullCoating, hull, 0.440, 0.164, 0.020);
  armoredDeck(body, undercarriage, hull.map(([x, z]) => [x * 0.92, z * 0.94]), 0.618, 0.032, 0.015);
  // Sculpted tiered wedge upper avionics cowl with raked front glacis
  const upperCowl = [
    [-0.29, -0.11], [0.15, -0.11], [0.23, 0.02], [0.23, 0.57],
    [0.14, 0.67], [-0.28, 0.67], [-0.37, 0.55], [-0.37, 0.02],
  ];
  armoredDeck(body, paint, upperCowl, 0.664, 0.098, 0.024);
  // Dark recessed structural spine & stepped mechanical top cap
  box(body, iron, 0.61, 0.034, 0.79, -0.075, 0.652, 0.227, 0.013);
  box(body, undercarriage, 0.46, 0.048, 0.54, -0.078, 0.766, 0.31, 0.014);
  for (let rib = 0; rib < 6; rib++) {
    box(body, iron, 0.49, 0.014, 0.018, -0.078, 0.764, 0.07 + rib * 0.092, 0.004);
  }
  // Sculpted domed pressurized cryo/fuel cylinders tucked into the starboard & port cheek recesses.
  const tankProfile = [
    new THREE.Vector2(0.001, -0.175), new THREE.Vector2(0.038, -0.168), new THREE.Vector2(0.056, -0.135),
    new THREE.Vector2(0.058, 0.135), new THREE.Vector2(0.038, 0.168), new THREE.Vector2(0.001, 0.175),
  ];
  for (const [tx, tz, mat] of [[0.235, 0.04, rim], [-0.375, -0.24, accent]]) {
    const vessel = new THREE.LatheGeometry(tankProfile, 14);
    body.add(mat, vessel, [tx, 0.72, tz], [HALF_PI, 0, 0]);
    for (const band of [-0.085, 0.085]) {
      body.add(iron, new THREE.TorusGeometry(0.061, 0.008, 6, 14), [tx, 0.72, tz + band]);
    }
  }
  // Forward sloped armored nose glacis & beveled under-nose bash-plate ribs
  box(body, paint, 0.44, 0.042, 0.24, 0, 0.60, -0.71, 0.012, [0.34, 0, 0]);
  for (let r = -2; r <= 2; r++) {
    box(body, rim, 0.024, 0.022, 0.16, r * 0.12, 0.335, -0.81, 0.005, [0.42, 0, 0]);
  }
  // Sculpted chamfered starboard nav/lidar sensor pod
  const sensorPod = [
    [0.105, -0.62], [0.355, -0.62], [0.412, -0.56], [0.412, -0.40],
    [0.355, -0.35], [0.135, -0.35], [0.095, -0.41], [0.095, -0.56],
  ];
  armoredDeck(body, undercarriage, sensorPod, 0.635, 0.098, 0.016);
  box(body, iron, 0.26, 0.018, 0.21, 0.255, 0.742, -0.485, 0.006);
  for (let f = 0; f < 5; f++) {
    box(body, rim, 0.23, 0.012, 0.012, 0.255, 0.754, -0.56 + f * 0.036, 0.002);
  }
  for (const lx of [0.195, 0.315]) {
    pin(body, iron, 0.034, 0.024, lx, 0.688, -0.634, "z", 14);
    pin(body, rim, 0.028, 0.008, lx, 0.688, -0.646, "z", 14);
    pin(body, optics, 0.021, 0.006, lx, 0.688, -0.649, "z", 12);
  }
  box(body, indicator, 0.022, 0.009, 0.008, 0.255, 0.722, -0.638, 0.002);
  box(body, lowerHardware, 0.86, 0.12, 0.105, 0, 0.361, 0.747, 0.022);
  box(body, lowerHardware, 0.74, 0.10, 0.126, 0, 0.39, -0.785, 0.029);
  box(body, iron, 0.36, 0.101, 0.037, 0, 0.554, -0.81, 0.009);
  for (let i = 0; i < 7; i++) {
    box(body, rim, 0.044, 0.011, 0.012, (i - 3) * 0.047, 0.566, -0.83, 0.003);
  }
  // Removable rear backplane separates the radiator from the protected service ports.
  box(body, iron, 0.688, 0.157, 0.055, 0, 0.594, 0.721, 0.017);
  box(body, machine, 0.643, 0.014, 0.018, 0, 0.667, 0.749, 0.002);
  box(body, rubber, 0.299, 0.107, 0.018, -0.162, 0.583, 0.752, 0.008);
  for (let fin = 0; fin < 13; fin++) {
    box(body, fin % 4 === 0 ? machine : undercarriage, 0.011, 0.084, 0.022,
      -0.162 + (fin - 6) * 0.021, 0.581, 0.763, 0.0012);
  }
  for (const y of [0.531, 0.631]) box(body, machine, 0.278, 0.009, 0.012, -0.162, y, 0.764, 0.002);
  box(body, undercarriage, 0.238, 0.108, 0.025, 0.151, 0.583, 0.754, 0.009);
  for (const [x, radius] of [[0.078, 0.024], [0.151, 0.031], [0.228, 0.020]]) {
    pin(body, machine, radius, 0.016, x, 0.589, 0.770, "z", 14);
    pin(body, rubber, radius * 0.67, 0.011, x, 0.589, 0.779, "z", 12);
    pin(body, x === 0.151 ? accent : machine, radius * 0.38, 0.004, x, 0.589, 0.785, "z", 10);
  }
  for (const x of [-0.322, 0.300]) {
    for (const y of [0.535, 0.643]) serviceBolt(body, machine, rubber, x, y, 0.750, "z");
  }
  for (const y of [0.535, 0.626]) serviceBolt(body, machine, rubber, 0.002, y, 0.756, "z");
  box(body, accent, 0.051, 0.011, 0.015, 0.219, 0.638, 0.776, 0.002);
  cable(body, rubber, [[0.151, 0.572, 0.776], [0.151, 0.537, 0.782], [0.126, 0.461, 0.770],
    [0.185, 0.432, 0.735]], 0.0077);
  cable(body, accent, [[0.196, 0.552, 0.763], [0.202, 0.519, 0.786], [0.192, 0.464, 0.778],
    [0.221, 0.441, 0.743]], 0.0062);
  box(body, machine, 0.062, 0.017, 0.013, 0.170, 0.509, 0.778, 0.0025);
  for (const side of [-1, 1]) {
    const x = side * 0.28;
    box(body, lowerHardware, 0.138, 0.094, 0.116, x, 0.297, 0.777, 0.013);
    body.add(accent, new THREE.TorusGeometry(0.034, 0.009, 6, 15), [x, 0.258, 0.833]);
    box(body, lowerArmor, 0.109, 0.027, 0.091, x, 0.242, -0.645, 0.005);
    strut(body, lowerHardware, [x, 0.260, -0.61], [x, 0.270, 0.62], 0.013);
  }

  // Sculpted LatheGeometry twin rear ion thruster bell nozzles + canted aerodynamic thruster cowlings.
  const nozzleProfile = [
    new THREE.Vector2(0.032, 0.0),
    new THREE.Vector2(0.044, 0.025),
    new THREE.Vector2(0.040, 0.055),
    new THREE.Vector2(0.068, 0.125),
    new THREE.Vector2(0.075, 0.140),
    new THREE.Vector2(0.062, 0.140),
    new THREE.Vector2(0.032, 0.052),
  ];
  for (const side of [-1, 1]) {
    const x = side * 0.23;
    const bell = new THREE.LatheGeometry(nozzleProfile, 16);
    body.add(iron, bell, [x, 0.43, 0.71], [HALF_PI, 0, 0]);
    body.add(rim, new THREE.TorusGeometry(0.070, 0.008, 8, 18), [x, 0.43, 0.845]);
    body.add(accent, new THREE.TorusGeometry(0.048, 0.006, 6, 16), [x, 0.43, 0.772]);
    // Angled armored thruster wing-cowls flanking each bell nozzle
    box(body, paint, 0.028, 0.125, 0.165, side * 0.345, 0.435, 0.77, 0.006, [0, side * 0.14, -side * 0.18]);
    box(body, accent, 0.014, 0.068, 0.135, side * 0.358, 0.435, 0.775, 0.003, [0, side * 0.14, -side * 0.18]);
  }

  // Signature Aerospace Tubular Exo-Cage Roll Frame (sweeps from front bull-bar over upper deck to rear bulkhead).
  cable(body, rim, [
    [-0.36, 0.43, -0.82], [-0.34, 0.56, -0.92], [-0.16, 0.58, -0.95],
    [0.16, 0.58, -0.95], [0.34, 0.56, -0.92], [0.36, 0.43, -0.82],
  ], 0.0155);
  // Sweeping side exo-cage rails rising toward the aft power deck
  for (const side of [-1, 1]) {
    cable(body, rim, [
      [side * 0.35, 0.56, -0.86],
      [side * 0.40, 0.76, -0.58],
      [side * 0.41, 0.91, -0.02],
      [side * 0.40, 0.94, 0.52],
      [side * 0.36, 0.73, 0.68],
    ], 0.0135);
    // Diagonal gusset struts tying exo-cage into chassis
    strut(body, iron, [side * 0.40, 0.76, -0.58], [side * 0.44, 0.62, -0.34], 0.011);
    strut(body, iron, [side * 0.41, 0.91, -0.02], [side * 0.42, 0.68, 0.18], 0.011);
    // Compact canted outboard heat-rejection winglets on upper rear flanks
    box(body, iron, 0.095, 0.014, 0.34, side * 0.465, 0.74, 0.34, 0.004, [0, 0, side * 0.38]);
    box(body, accent, 0.072, 0.008, 0.28, side * 0.472, 0.752, 0.34, 0.002, [0, 0, side * 0.38]);
  }
  // Overhead exo-cage brow arch & auxiliary high-mount HDR LED light bar
  cable(body, rim, [[-0.41, 0.91, -0.02], [-0.22, 0.97, -0.05], [0.22, 0.97, -0.05], [0.41, 0.91, -0.02]], 0.012);
  box(body, iron, 0.34, 0.030, 0.036, 0, 0.968, -0.062, 0.006);
  for (const lx of [-0.11, 0, 0.11]) {
    box(body, frontLamps, 0.072, 0.014, 0.010, lx, 0.968, -0.082, 0.002);
  }
  // Rear exo-cage stabilizer bridge bar
  cable(body, rim, [[-0.40, 0.94, 0.52], [-0.18, 0.98, 0.54], [0.18, 0.98, 0.54], [0.40, 0.94, 0.52]], 0.012);

  // The batteries and tools are wrapped in sewn, wrinkled thermal blankets.
  box(body, rubber, 0.41, 0.086, 0.449, -0.109, 0.792, 0.331, 0.019);
  box(body, fabric, 0.367, 0.104, 0.398, -0.109, 0.848, 0.331, 0.031);
  for (const x of [-0.26, 0.045]) {
    box(body, rubber, 0.026, 0.009, 0.405, x, 0.898, 0.32, 0.002);
    box(body, latchMetal, 0.053, 0.016, 0.064, x, 0.905, 0.395, 0.005);
  }
  box(body, paint, 0.105, 0.068, 0.103, -0.233, 0.787, 0.563, 0.014);
  box(body, machine, 0.062, 0.010, 0.065, -0.233, 0.824, 0.575, 0.004);
  for (const x of [-0.260, -0.206]) serviceBolt(body, rim, rubber, x, 0.833, 0.569, "y");
  box(body, iron, 0.245, 0.013, 0.021, -0.105, 0.830, 0.549, 0.005);
  for (const x of [-0.179, -0.030]) {
    box(body, latchMetal, 0.037, 0.028, 0.035, x, 0.835, 0.546, 0.004);
    box(body, rubber, 0.021, 0.006, 0.020, x, 0.850, 0.546, 0.001);
  }

  // Heat pipes link the exposed starboard exchanger to the rear radiator.
  box(body, rubber, 0.196, 0.038, 0.299, 0.286, 0.746, 0.365, 0.009);
  box(body, undercarriage, 0.182, 0.059, 0.284, 0.286, 0.784, 0.365, 0.012);
  for (let fin = 0; fin < 9; fin++) {
    box(body, fin % 3 === 0 ? machine : iron, 0.155, 0.020, 0.012,
      0.286, 0.820, 0.365 + (fin - 4) * 0.024, 0.0013);
  }
  for (const x of [0.222, 0.350]) {
    for (const z of [0.238, 0.491]) serviceBolt(body, machine, rubber, x, 0.818, z, "y");
    cable(body, machine, [[x, 0.837, 0.279], [x, 0.838, 0.421], [x, 0.828, 0.516],
      [x - 0.018, 0.770, 0.558], [x - 0.025, 0.690, 0.628]], 0.0084);
  }
  box(body, accent, 0.112, 0.007, 0.016, 0.287, 0.823, 0.244, 0.002);
  box(body, machine, 0.155, 0.010, 0.024, 0.289, 0.842, 0.437, 0.003);

  // The visible power harness is clipped along the port trough, clear of the wheel and arm.
  box(body, iron, 0.059, 0.023, 0.437, -0.355, 0.759, 0.330, 0.008);
  for (const z of [0.159, 0.346, 0.477]) {
    box(body, latchMetal, 0.061, 0.016, 0.024, -0.355, 0.802, z, 0.003);
    serviceBolt(body, rim, rubber, -0.377, 0.809, z, "y");
  }
  cable(body, accent, [[-0.272, 0.807, 0.556], [-0.324, 0.803, 0.515], [-0.350, 0.799, 0.386],
    [-0.349, 0.795, 0.186], [-0.322, 0.749, 0.124]], 0.0073);
  cable(body, rubber, [[-0.281, 0.793, 0.568], [-0.342, 0.798, 0.508], [-0.366, 0.797, 0.386],
    [-0.365, 0.790, 0.190], [-0.344, 0.738, 0.122]], 0.0085);

  // Tilted solar panel above the forward battery tray, with hinge rail and wiring.
  const solar = solarMaterial();
  box(body, iron, 0.582, 0.079, 0.519, -0.113, 0.753, -0.329, 0.021, [0.19, 0, 0]);
  box(body, rim, 0.609, 0.029, 0.541, -0.113, 0.794, -0.341, 0.013, [0.19, 0, 0]);
  body.add(solar, new THREE.PlaneGeometry(0.575, 0.514), [-0.113, 0.811, -0.340], [-HALF_PI + 0.19, 0, 0]);
  for (const x of [-0.337, 0.118]) {
    strut(body, iron, [x, 0.633, -0.448], [x, 0.765, -0.488], 0.020, 0.027);
    pin(body, rim, 0.027, 0.055, x, 0.777, -0.493);
  }
  strut(body, iron, [-0.380, 0.777, -0.493], [0.143, 0.777, -0.493], 0.011);
  cable(body, rubber, [[0.16, 0.72, -0.364], [0.207, 0.712, -0.297], [0.19, 0.683, -0.224]], 0.009);

  // The outboard mast socket bolts to the rear armor on a raised bracket.
  box(body, iron, 0.142, 0.065, 0.149, 0.424, 0.649, 0.658, 0.015);
  strut(body, iron, [0.431, 0.658, 0.655], [0.526, 0.854, 0.697], 0.041, 0.051);
  pin(body, iron, 0.071, 0.056, 0.533, 0.863, 0.697, "y");
  pin(body, accent, 0.054, 0.035, 0.533, 0.900, 0.697, "y");
  const sampler = createSampler(rover, { iron, rim, accent, rubber, optics });
  const kitRack = new THREE.Object3D();
  kitRack.name = "Rear construction case rack";
  kitRack.position.set(-0.145, 0.684, 0.97);
  rover.add(kitRack);
  // Open slatted tubular aerospace cargo rack (replaces a solid thick slab).
  for (const zOff of [-0.165, 0.165]) {
    box(body, iron, 0.52, 0.028, 0.032, -0.145, 0.656, 0.97 + zOff, 0.008);
  }
  for (const xOff of [-0.245, 0.245]) {
    box(body, iron, 0.032, 0.028, 0.36, -0.145 + xOff, 0.656, 0.97, 0.008);
  }
  for (let s = 0; s < 5; s++) {
    box(body, undercarriage, 0.46, 0.014, 0.028, -0.145, 0.656, 0.85 + s * 0.06, 0.003);
  }
  for (const x of [-0.384, 0.094]) {
    strut(body, iron, [x, 0.51, 0.75], [x, 0.64, 1.12], 0.030, 0.038);
    box(body, accent, 0.03, 0.039, 0.32, x, 0.686, 0.97, 0.006);
    pin(body, rim, 0.014, 0.009, x, 0.710, 1.086, "y", 8);
  }

  for (const side of [-1, 1]) {
    const x = side * 0.49;
    box(body, lowerArmor, 0.061, 0.1, 1.26, x, 0.423, 0.017, 0.025);
    box(body, sillMetal, 0.032, 0.026, 1.28, x + side * 0.022, 0.463, 0.017, 0.007);
    box(body, rubber, 0.026, 0.19, 0.41, x, 0.54, 0.345, 0.017);
    box(body, sideBlanket, 0.035, 0.172, 0.38, x + side * 0.012, 0.549, 0.359, 0.016);
    box(body, iron, 0.022, 0.116, 0.286, x + side * 0.01, 0.562, -0.335, 0.013);
    for (let g = 0; g < 4; g++) {
      box(body, rim, 0.008, 0.008, 0.243, x + side * 0.025, 0.525 + 0.021 * g, -0.337, 0.003);
    }

    // Rocker-bogie links sit behind each wheel and connect at the hub pickups.
    const hinge = [side * 0.511, 0.435, 0.04];
    pin(body, iron, 0.072, 0.086, ...hinge, "x");
    pin(body, rim, 0.037, 0.015, hinge[0] + side * 0.044, hinge[1], hinge[2], "x", 12);
    pin(body, iron, 0.023, 0.008, hinge[0] + side * 0.054, hinge[1], hinge[2], "x", 8);
    const rearBeam = [side * 0.492, 0.392, 0.377];
    const frontBeam = [side * 0.503, 0.345, -0.406];
    strut(body, lowerHardware, hinge, rearBeam, 0.025, 0.037);
    strut(body, lowerHardware, hinge, frontBeam, 0.039, 0.023);
    pin(body, iron, 0.044, 0.034, ...rearBeam);
    pin(body, rim, 0.028, 0.011, rearBeam[0] + 0.017 * side, rearBeam[1], rearBeam[2], "x", 10);
    for (const z of [-0.59, 0.04, 0.62]) {
      const skidJoint = [side * 0.519, 0.350, z * 0.87];
      pin(body, iron, 0.031, 0.055, side * 0.458, 0.510, z * 0.70, "x", 14);
      pin(body, rim, 0.015, 0.010, side * 0.489, 0.510, z * 0.70, "x", 10);
      pin(body, lowerHardware, 0.036, 0.037, ...skidJoint);
    }
    cable(body, rubber, [
      [side * 0.427, 0.408, -0.575], [side * 0.51, 0.397, -0.29],
      [side * 0.53, 0.377, 0.088], [side * 0.475, 0.405, 0.546],
    ], 0.011);

    box(body, iron, 0.177, 0.082, 0.086, side * 0.33, 0.595, -0.77, 0.018);
    box(body, frontLamps, 0.134, 0.036, 0.016, side * 0.33, 0.598, -0.816, 0.007);
    box(body, iron, 0.137, 0.067, 0.041, side * 0.37, 0.493, 0.735, 0.015);
    box(body, rearLamps, 0.091, 0.022, 0.013, side * 0.37, 0.496, 0.757, 0.004);
    glow?.(rover, 0xd8f4ff, 0.20, 0.22, side * 0.33, 0.60, -0.824);
    glow?.(rover, 0xff5a42, 0.16, 0.28, side * 0.37, 0.499, 0.769);
  }

  // Remote sensing mast, articulated scanning optical head, and a high-gain dish.
  box(body, rim, 0.129, 0.069, 0.136, -0.292, 0.825, 0.12, 0.015);
  strut(body, rim, [-0.292, 0.842, 0.12], [-0.31, 1.19, 0.1], 0.026, 0.017);
  strut(body, rubber, [-0.284, 0.849, 0.144], [-0.3, 1.155, 0.133], 0.014, 0.008);
  const mastHead = new THREE.Group();
  mastHead.position.set(-0.31, 1.202, 0.095);
  rover.add(mastHead);
  const headParts = partBatch(mastHead);
  box(headParts, undercarriage, 0.158, 0.086, 0.106, 0, 0, -0.021, 0.014);
  for (const x of [-0.04, 0.037]) {
    pin(headParts, rim, 0.028, 0.016, x, 0.001, -0.077, "z", 14);
    pin(headParts, optics, 0.020, 0.008, x, 0.001, -0.087, "z", 12);
  }
  box(headParts, indicator, 0.016, 0.010, 0.008, 0, 0.030, -0.076, 0.002);
  box(headParts, machine, 0.111, 0.051, 0.014, 0, 0.002, 0.035, 0.0055);
  for (const x of [-0.044, 0.044]) serviceBolt(headParts, rim, rubber, x, 0.007, 0.045, "z");
  box(headParts, iron, 0.048, 0.017, 0.010, 0, 0.003, 0.045, 0.002);
  headParts.attach();
  strut(body, rim, [0.346, 0.813, 0.307], [0.362, 1.30, 0.283], 0.010, 0.004);
  pin(body, indicator, 0.023, 0.038, 0.363, 1.299, 0.283, "y", 12);
  glow?.(rover, 0xffb655, 0.138, 0.58, 0.363, 1.307, 0.283);
  strut(body, undercarriage, [0.29, 0.827, -0.04], [0.302, 1.137, -0.015], 0.022);
  const parabola = Array.from({ length: 12 }, (_, i) => {
    const r = 0.13 * (i + 0.01) / 11;
    return new THREE.Vector2(r, r * r * 2.6);
  });
  const dish = rim.clone();
  dish.side = THREE.DoubleSide;
  const dataDish = new THREE.Group();
  dataDish.position.set(0.30, 1.14, -0.013);
  dataDish.rotation.set(0.36, 0, -0.43);
  rover.add(dataDish);
  const dataDishHardware = partBatch(dataDish);
  dataDishHardware.add(dish, new THREE.LatheGeometry(parabola, 36), [0, 0, 0]);
  for (const x of [-0.072, 0.072]) strut(dataDishHardware, rim, [x, 0.015, 0.031], [0, 0.101, 0], 0.004);
  pin(dataDishHardware, foil, 0.012, 0.019, 0, 0.101, 0, "y", 12);
  dataDishHardware.attach();
  const dataFeed = new THREE.Object3D();
  dataFeed.position.y = 0.115;
  dataDish.add(dataFeed);
  const parkedDish = dataDish.quaternion.clone();
  const dishRotation = new THREE.Quaternion();
  const dishBearing = new THREE.Vector3();
  const dishUp = new THREE.Vector3(0, 1, 0);

  function aimDataDish(receiver, dt) {
    if (receiver) {
      rover.worldToLocal(dishBearing.copy(receiver)).sub(dataDish.position).normalize();
      dishRotation.setFromUnitVectors(dishUp, dishBearing);
    } else dishRotation.copy(parkedDish);
    dataDish.quaternion.slerp(dishRotation, 1 - Math.exp(-12 * dt));
  }

  // Exposed Caged HDR Reactor Energy Core Spine atop the rear power deck (syncs with thruster theme & boost power).
  const reactorCoreMat = new THREE.MeshStandardMaterial({
    color: 0x74ffd8, emissive: 0x52f2d2, emissiveIntensity: 1.55,
    roughness: 0.18, metalness: 0.12, toneMapped: false,
  });
  for (const rx of [-0.175, -0.045]) {
    const coreTube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 12), reactorCoreMat);
    coreTube.rotation.x = HALF_PI;
    coreTube.position.set(rx, 0.916, 0.33);
    rover.add(coreTube);
    for (const bz of [0.19, 0.33, 0.47]) {
      body.add(iron, new THREE.TorusGeometry(0.027, 0.005, 6, 12), [rx, 0.916, bz]);
    }
  }

  body.attach();

  const sideBadge = new THREE.MeshStandardMaterial({
    map: badge("L-07", "SELENE / POLAR SURVEY", true), roughness: 0.68,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const tailBadge = new THREE.MeshStandardMaterial({
    map: badge("L-07", "SELENE / SAMPLE RETURN", false), roughness: 0.54,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const tailPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.252, 0.042), tailBadge);
  tailPlate.position.set(0.123, 0.644, 0.752);
  rover.add(tailPlate);

  const batteryLabel = new THREE.MeshStandardMaterial({
    map: badge("BATT A", "ISOLATE BEFORE SERVICE", true), roughness: 0.8,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const topPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.186, 0.054), batteryLabel);
  topPlate.position.set(-0.11, 0.901, 0.263);
  topPlate.rotation.x = -HALF_PI;
  rover.add(topPlate);

  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.285, 0.089), sideBadge);
    plate.position.set(side * 0.497, 0.581, -0.032);
    plate.rotation.y = side * HALF_PI;
    rover.add(plate);
  }

  const headlight = new THREE.SpotLight(0xddeeff, 7.8, 9.6, 0.50, 0.66, 1.74);
  headlight.position.set(0, 0.6, -0.817);
  headlight.target.position.set(0, 0.092, -4.75);
  rover.add(headlight, headlight.target);

  // Subtle Fresnel-faded volumetric headlight cones for deep crater shadow atmosphere.
  const coneGeo = new THREE.ConeGeometry(0.62, 3.6, 16, 1, true);
  coneGeo.translate(0, -1.8, 0);
  coneGeo.rotateX(Math.PI / 2 + 0.14);
  const coneMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float y = clamp(vUv.y, 0.0, 1.0);
        float axial = smoothstep(0.0, 0.25, 1.0 - y) * smoothstep(0.04, 0.55, y) * pow(max(0.0001, y), 1.4);
        float ndotv = clamp(abs(dot(normalize(vNormal), normalize(vView))), 0.0001, 1.0);
        float edge = pow(ndotv, 1.85);
        float alpha = axial * edge * 0.075;
        gl_FragColor = vec4(0.82, 0.92, 1.0, alpha);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(coneGeo, coneMat);
    beam.position.set(side * 0.34, 0.56, -0.82);
    beam.renderOrder = 3;
    rover.add(beam);
  }
  const standardRoverParts = [...rover.children];

  // Twin rear HDR ion boost thruster plumes (triggers selective Bloom when boosting).
  const plumeGeo = new THREE.ConeGeometry(0.078, 0.62, 12, 1, true);
  plumeGeo.translate(0, -0.31, 0);
  plumeGeo.rotateX(-Math.PI / 2);
  const THRUSTER_THEMES = {
    cyan: { outer: [0.32, 1.75, 2.2], inner: [2.8, 3.1, 2.6], light: 0x74ffd8 },
    gold: { outer: [2.4, 1.35, 0.22], inner: [3.4, 2.9, 1.6], light: 0xffc864 },
    crimson: { outer: [2.6, 0.28, 0.52], inner: [3.4, 1.85, 1.2], light: 0xff5a7a },
    ufo: { outer: [0.45, 2.6, 1.35], inner: [2.6, 3.6, 2.9], light: 0x6bffb8 },
    shockwave: { outer: [2.4, 0.35, 3.4], inner: [3.8, 2.9, 3.8], light: 0xe08cff },
  };
  const plumeMat = new THREE.ShaderMaterial({
    uniforms: {
      uPower: { value: 0 },
      uTime: { value: 0 },
      uOuterColor: { value: new THREE.Vector3(...THRUSTER_THEMES.cyan.outer) },
      uInnerColor: { value: new THREE.Vector3(...THRUSTER_THEMES.cyan.inner) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uPower;
      uniform float uTime;
      uniform vec3 uOuterColor;
      uniform vec3 uInnerColor;
      varying vec2 vUv;
      void main() {
        float y = clamp(vUv.y, 0.0, 1.0);
        float flicker = 0.86 + 0.14 * sin(uTime * 54.0 + y * 18.0);
        float tipFade = smoothstep(0.02, 0.34, y) * smoothstep(0.0, 0.14, 1.0 - y);
        float core = pow(max(0.0001, y), 1.35) * tipFade * flicker;
        vec3 col = mix(uOuterColor, uInnerColor, pow(max(0.0001, y), 2.8));
        gl_FragColor = vec4(col * uPower, core * uPower * 0.88);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  const thrusterPlumes = [-0.23, 0.23].map(x => {
    const plume = new THREE.Mesh(plumeGeo, plumeMat);
    plume.position.set(x, 0.43, 0.85);
    plume.visible = false;
    plume.renderOrder = 4;
    rover.add(plume);
    return plume;
  });
  const thrusterLight = new THREE.PointLight(0x74ffd8, 0, 2.8, 2);
  thrusterLight.position.set(0, 0.44, 0.98);
  rover.add(thrusterLight);
  let activeTheme = "cyan";
  function applyThemeColors(theme = "cyan") {
    const spec = THRUSTER_THEMES[theme] ?? THRUSTER_THEMES.cyan;
    plumeMat.uniforms.uOuterColor.value.set(...spec.outer);
    plumeMat.uniforms.uInnerColor.value.set(...spec.inner);
    thrusterLight.color.setHex(spec.light);
    reactorCoreMat.color.setHex(spec.light);
    reactorCoreMat.emissive.setHex(spec.light);
  }
  function setThrusterTheme(theme = "cyan") {
    activeTheme = theme;
    applyThemeColors(theme);
  }

  // --- 3 Morphable 3D Chassis Kits (reusing existing aerospace PBR materials -> zero extra bundle weight!) ---
  // 1) V-12 Falcon Speedster Kit: low-slung aero front splitter, side aero pods, high swept twin-pylon rear spoiler + gold glow strips
  const falconKit = new THREE.Group();
  falconKit.name = "chassis-falcon-kit";
  falconKit.visible = false;
  rover.add(falconKit);
  const falconBatch = partBatch(falconKit);
  const goldStripMat = lenses(0xffcc66, 2.8);
  // Front low-slung aerodynamic splitter & twin dive canards
  box(falconBatch, undercarriage, 0.84, 0.032, 0.24, 0, 0.25, -0.96, 0.008, [0.08, 0, 0]);
  box(falconBatch, accent, 0.78, 0.014, 0.06, 0, 0.27, -1.06, 0.004);
  for (const side of [-1, 1]) {
    box(falconBatch, paint, 0.04, 0.14, 0.26, side * 0.44, 0.31, -0.92, 0.006, [0, side * 0.12, 0]);
    // Sleek side aero intake pods
    box(falconBatch, paint, 0.14, 0.16, 0.68, side * 0.56, 0.56, 0.12, 0.022);
    box(falconBatch, goldStripMat, 0.02, 0.03, 0.54, side * 0.635, 0.58, 0.12, 0.004);
    // Swept rear wing stanchions
    strut(falconBatch, iron, [side * 0.34, 0.72, 0.62], [side * 0.42, 1.18, 0.88], 0.024, 0.018);
    // Wingtip endplates
    box(falconBatch, paint, 0.026, 0.18, 0.30, side * 0.68, 1.18, 0.90, 0.005, [0.08, 0, 0]);
    box(falconBatch, goldStripMat, 0.012, 0.12, 0.024, side * 0.692, 1.18, 1.04, 0.002);
  }
  // Wide swept high-downforce rear wing airfoil
  box(falconBatch, undercarriage, 1.38, 0.034, 0.24, 0, 1.20, 0.88, 0.008, [-0.14, 0, 0]);
  box(falconBatch, accent, 1.32, 0.014, 0.05, 0, 1.22, 0.99, 0.003, [-0.14, 0, 0]);
  // Center third ion boost nozzle
  pin(falconBatch, iron, 0.065, 0.14, 0, 0.43, 0.79, "z", 14);
  falconBatch.attach();

  // 2) T-88 Titan Heavy Mining Juggernaut Kit: heavy articulated front bulldozer ore plow, dorsal twin pulse coils, side sponsons & armored cargo hopper
  const titanKit = new THREE.Group();
  titanKit.name = "chassis-titan-kit";
  titanKit.visible = false;
  rover.add(titanKit);
  const titanBatch = partBatch(titanKit);
  const crimsonCoilMat = lenses(0xff5a7a, 2.9);
  // Massive twin-angled front bulldozer ore ram plow + twin hydraulic rams
  for (const side of [-1, 1]) {
    box(titanBatch, undercarriage, 0.56, 0.28, 0.08, side * 0.25, 0.34, -1.03, 0.012, [-0.28, -side * 0.24, 0]);
    box(titanBatch, accent, 0.52, 0.055, 0.03, side * 0.25, 0.44, -1.07, 0.006, [-0.28, -side * 0.24, 0]);
    box(titanBatch, rim, 0.54, 0.045, 0.04, side * 0.25, 0.21, -1.09, 0.004, [-0.18, -side * 0.24, 0]);
    strut(titanBatch, rim, [side * 0.30, 0.40, -0.78], [side * 0.34, 0.35, -1.00], 0.022);
    // Heavy armored side fender sponsons
    box(titanBatch, lowerArmor, 0.16, 0.22, 1.18, side * 0.57, 0.56, 0.04, 0.020);
    box(titanBatch, accent, 0.04, 0.08, 0.92, side * 0.655, 0.62, 0.04, 0.006);
    // Dorsal twin electromagnetic resonance pulse towers
    pin(titanBatch, iron, 0.072, 0.34, side * 0.26, 0.96, 0.36, "y", 14);
    for (const cy of [0.88, 0.98, 1.08]) {
      titanBatch.add(crimsonCoilMat, new THREE.TorusGeometry(0.082, 0.011, 6, 16), [side * 0.26, cy, 0.36], [HALF_PI, 0, 0]);
    }
    pin(titanBatch, rim, 0.052, 0.06, side * 0.26, 1.16, 0.36, "y", 12);
    // Heavy rear armored ore hopper side walls
    box(titanBatch, iron, 0.045, 0.24, 0.46, side * 0.38 - 0.14, 0.78, 0.98, 0.008);
  }
  box(titanBatch, iron, 0.74, 0.20, 0.045, -0.14, 0.77, 1.20, 0.008);
  box(titanBatch, crimsonCoilMat, 0.58, 0.028, 0.02, -0.14, 0.85, 1.225, 0.004);
  titanBatch.attach();

  // 3) X-00 Pocket UFO Saucer Kit (Easter Egg Mini Flying Saucer with spinning plasma rim, glass cockpit dome, pilot & anti-grav rings!)
  const ufoKit = new THREE.Group();
  ufoKit.name = "chassis-ufo-kit";
  ufoKit.visible = false;
  rover.add(ufoKit);
  const ufoNeonMat = lenses(0x6bffb8, 3.0);
  const ufoVioletMat = lenses(0xd580ff, 2.8);
  const ufoHullBatch = partBatch(ufoKit);
  // Upper & lower spun titanium saucer disc + beveled rim collar
  ufoHullBatch.add(paint, new THREE.CylinderGeometry(0.38, 0.84, 0.13, 28), [0, 0.52, 0]);
  ufoHullBatch.add(undercarriage, new THREE.CylinderGeometry(0.84, 0.34, 0.11, 28), [0, 0.40, 0]);
  ufoHullBatch.add(iron, new THREE.TorusGeometry(0.84, 0.042, 10, 32), [0, 0.46, 0], [HALF_PI, 0, 0]);
  ufoHullBatch.add(ufoNeonMat, new THREE.TorusGeometry(0.39, 0.018, 8, 24), [0, 0.59, 0], [HALF_PI, 0, 0]);
  // Twin rear warp thruster pods
  for (const side of [-1, 1]) {
    box(ufoHullBatch, iron, 0.14, 0.11, 0.24, side * 0.23, 0.44, 0.72, 0.02);
    pin(ufoHullBatch, rim, 0.055, 0.08, side * 0.23, 0.44, 0.83, "z", 12);
  }
  // 3 mini swept landing skids beneath saucer
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + HALF_PI;
    const sx = Math.cos(a) * 0.44, sz = Math.sin(a) * 0.44;
    strut(ufoHullBatch, iron, [sx * 0.65, 0.36, sz * 0.65], [sx, 0.18, sz], 0.018);
    box(ufoHullBatch, rim, 0.09, 0.025, 0.16, sx, 0.17, sz, 0.005, [0, -a + HALF_PI, 0]);
  }
  ufoHullBatch.attach();

  // Spinning outer plasma ring with 8 glowing gravity nodes
  const ufoSpinRing = new THREE.Group();
  ufoSpinRing.position.set(0, 0.46, 0);
  ufoKit.add(ufoSpinRing);
  const spinBatch = partBatch(ufoSpinRing);
  spinBatch.add(ufoNeonMat, new THREE.TorusGeometry(0.885, 0.016, 8, 32), [0, 0, 0], [HALF_PI, 0, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const nx = Math.cos(a) * 0.86, nz = Math.sin(a) * 0.86;
    box(spinBatch, i % 2 === 0 ? ufoNeonMat : ufoVioletMat, 0.075, 0.048, 0.11, nx, 0, nz, 0.012, [0, -a, 0]);
  }
  spinBatch.attach();

  // Cute Little Pilot inside the transparent cockpit bubble dome!
  const ufoPilot = new THREE.Group();
  ufoPilot.position.set(0, 0.60, -0.02);
  ufoKit.add(ufoPilot);
  const pilotBatch = partBatch(ufoPilot);
  pilotBatch.add(paint, new THREE.SphereGeometry(0.135, 16, 12), [0, 0.06, 0]);
  box(pilotBatch, ufoNeonMat, 0.17, 0.055, 0.08, 0, 0.07, -0.10, 0.018);
  for (const side of [-1, 1]) {
    strut(pilotBatch, iron, [side * 0.09, 0.15, 0], [side * 0.15, 0.24, 0], 0.010);
    pilotBatch.add(ufoVioletMat, new THREE.SphereGeometry(0.022, 8, 8), [side * 0.15, 0.25, 0]);
  }
  pilotBatch.attach();

  const ufoDomeMat = new THREE.MeshPhysicalMaterial({
    color: 0x9ef8ee, transmission: 0.72, transparent: true, opacity: 0.52,
    roughness: 0.12, metalness: 0.05, ior: 1.45,
  });
  const ufoDome = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 14, 0, TAU, 0, HALF_PI), ufoDomeMat);
  ufoDome.position.set(0, 0.57, 0);
  ufoKit.add(ufoDome);

  // Underside pulsing anti-gravity tractor rings
  const ufoGravRing1 = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.44, 28), new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.45, 2.8, 1.7), toneMapped: false, transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  ufoGravRing1.rotation.x = HALF_PI;
  ufoGravRing1.position.set(0, 0.24, 0);
  const ufoGravRing2 = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.25, 24), new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(2.1, 0.75, 3.1), toneMapped: false, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  ufoGravRing2.rotation.x = HALF_PI;
  ufoGravRing2.position.set(0, 0.14, 0);
  ufoKit.add(ufoGravRing1, ufoGravRing2);

  let currentChassis = "explorer";
  function setChassis(id = "explorer") {
    currentChassis = id;
    const isUfo = id === "ufo";
    for (const part of standardRoverParts) part.visible = !isUfo;
    falconKit.visible = id === "falcon";
    titanKit.visible = id === "titan";
    ufoKit.visible = isUfo;
    if (id === "falcon") {
      rover.scale.set(1.04, 0.88, 1.14);
      setThrusterTheme("gold");
    } else if (id === "titan") {
      rover.scale.set(1.20, 1.13, 1.08);
      setThrusterTheme("crimson");
    } else if (isUfo) {
      rover.scale.set(0.86, 0.86, 0.86);
      setThrusterTheme("ufo");
    } else {
      rover.scale.set(1, 1, 1);
      setThrusterTheme("cyan");
    }
  }

  // --- 3D Roguelite Visual Evolution Attachments (Crystal-Clear Rim-Only Shield Halo, Tesla Arc Lightning, Neon Wheel Rings, Shockwave Aura) ---
  const shieldMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vNorm;
      varying vec3 vView;
      varying vec3 vPos;
      void main() {
        vPos = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNorm = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      varying vec3 vNorm;
      varying vec3 vView;
      varying vec3 vPos;
      void main() {
        // Steep rim-only Fresnel: 100% transparent over the rover body so zero milky fog ever obscures the chassis!
        float ndv = abs(dot(normalize(vNorm), normalize(vView)));
        float rim = pow(max(0.0, 1.0 - ndv), 4.2);
        float scan = smoothstep(0.92, 1.0, sin(vPos.y * 9.0 - uTime * 3.8));
        float grid = 0.72 + 0.28 * sin(vPos.x * 22.0 + uTime * 2.0) * cos(vPos.z * 22.0 - uTime * 1.8);
        vec3 col = mix(vec3(0.24, 0.92, 1.15), vec3(0.65, 1.45, 1.55), scan);
        float a = (rim * 0.56 + scan * rim * 0.34) * grid * uOpacity;
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.42));
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, toneMapped: false,
  });
  const shieldDome = new THREE.Mesh(new THREE.SphereGeometry(1.42, 32, 20), shieldMat);
  shieldDome.scale.set(0.84, 0.64, 1.06);
  shieldDome.position.set(0, 0.64, 0.04);
  shieldDome.visible = false;
  shieldDome.renderOrder = 5;
  rover.add(shieldDome);

  // Crackling HDR Tesla Magnet Arc Lightning Beam leaping from Rover to active Crystal Vein!
  const teslaPositions = new Float32Array(12 * 3);
  const teslaGeo = new THREE.BufferGeometry();
  teslaGeo.setAttribute("position", new THREE.BufferAttribute(teslaPositions, 3));
  const teslaMat = new THREE.LineBasicMaterial({
    color: new THREE.Color().setRGB(0.55, 3.2, 3.1), toneMapped: false, transparent: true, opacity: 0.92,
    blending: THREE.AdditiveBlending,
  });
  const teslaLine = new THREE.Line(teslaGeo, teslaMat);
  teslaLine.frustumCulled = false;
  teslaLine.visible = false;
  rover.add(teslaLine);
  const teslaLocalTarget = new THREE.Vector3();

  // Shockwave Super-Boost Aura Ring (Asphalt-style Shockwave burst!)
  const shockwaveRingMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(2.4, 0.65, 3.4), toneMapped: false, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const shockwaveRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.15, 32), shockwaveRingMat);
  shockwaveRing.rotation.x = HALF_PI;
  shockwaveRing.position.set(0, 0.56, 0.65);
  shockwaveRing.visible = false;
  rover.add(shockwaveRing);

  let boostVis = 0;
  let shockVis = 0;
  function setBoostVisual(active, dt = 0.016, time = 0, shockwave = false) {
    boostVis = THREE.MathUtils.damp(boostVis, active ? (shockwave ? 1.55 : 1) : 0, active ? 18 : 11, dt);
    shockVis = THREE.MathUtils.damp(shockVis, shockwave ? 1 : 0, shockwave ? 16 : 9, dt);
    if (shockwave) applyThemeColors("shockwave");
    else applyThemeColors(activeTheme);
    const visible = boostVis > 0.02;
    plumeMat.uniforms.uPower.value = boostVis;
    plumeMat.uniforms.uTime.value = time;
    thrusterLight.intensity = boostVis * (shockwave ? 3.8 : 2.2);
    reactorCoreMat.emissiveIntensity = 1.25 + 0.25 * Math.sin(time * 2.8) + boostVis * 2.4;
    mastHead.rotation.y = Math.sin(time * 0.72) * 0.22 * (1 - Math.min(1, boostVis) * 0.8);
    mastHead.rotation.x = -Math.min(1, boostVis) * 0.14;
    const stretch = 0.55 + boostVis * (0.76 + 0.14 * Math.sin(time * 52));
    for (const plume of thrusterPlumes) {
      plume.visible = visible;
      plume.scale.set(0.75 + boostVis * 0.42, 0.75 + boostVis * 0.42, stretch);
    }
    if (ufoKit.visible) {
      ufoKit.position.y = 0.06 + Math.sin(time * 5.2) * 0.045;
      ufoSpinRing.rotation.y = time * (5.2 + boostVis * 9.5);
      ufoPilot.rotation.y = Math.sin(time * 2.4) * 0.35;
      const gPulse = 0.85 + 0.22 * Math.sin(time * 9.5);
      ufoGravRing1.scale.setScalar(gPulse);
      ufoGravRing2.scale.setScalar(1.7 - gPulse * 0.65);
    }
    shockwaveRing.visible = shockVis > 0.03;
    if (shockwaveRing.visible) {
      const pulse = (time * 4.5) % 1;
      shockwaveRing.scale.setScalar(0.85 + pulse * 1.45);
      shockwaveRing.position.z = 0.55 + pulse * 0.95;
      shockwaveRingMat.opacity = shockVis * (1 - pulse) * 0.85;
    }
  }

  const wheelMaterials = { tire: wireTireMaterial(), tread, rim, undercarriage, iron, accent, rimFlash, chalk, paint, machine };
  const wheelHubs = [];
  const wheelGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.45, 2.8, 2.6), toneMapped: false, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const wheelGlowGeo = new THREE.RingGeometry(0.185, 0.218, 20);
  for (const side of [-1, 1]) {
    for (const [index, z] of [-0.59, 0.04, 0.62].entries()) {
      const wh = makeWheel(rover, side, z, index, wheelMaterials);
      const glowRing = new THREE.Mesh(wheelGlowGeo, wheelGlowMat);
      glowRing.rotation.y = side * HALF_PI;
      glowRing.position.x = side * 0.116;
      wh.hub.add(glowRing);
      wheelHubs.push(wh);
    }
  }

  let shieldVis = 0;
  function setVisualEvolution({ shield = 0, magnetTarget = null, stuntGlow = 0, fever = false, shockwave = false, dt = 0.016, time = 0 } = {}) {
    shieldVis = THREE.MathUtils.damp(shieldVis, shield > 0 ? 1 : 0, 8, dt);
    shieldDome.visible = shieldVis > 0.02;
    if (shieldDome.visible) {
      shieldMat.uniforms.uTime.value = time;
      shieldMat.uniforms.uOpacity.value = shieldVis * 0.85;
    }
    const wantWheelGlow = Math.max(stuntGlow, fever ? 0.9 : 0, shockwave ? 1.0 : 0);
    wheelGlowMat.opacity = THREE.MathUtils.damp(wheelGlowMat.opacity, wantWheelGlow * 0.78, 10, dt);
    if (shockwave) wheelGlowMat.color.setRGB(2.6, 0.7, 3.6);
    else if (fever) wheelGlowMat.color.setRGB(3.1, 2.1, 0.55);
    else wheelGlowMat.color.setRGB(0.45, 2.8, 2.6);

    if (magnetTarget) {
      rover.worldToLocal(teslaLocalTarget.copy(magnetTarget));
      const sx = 0, sy = 0.92, sz = 0.25;
      const ex = teslaLocalTarget.x, ey = teslaLocalTarget.y + 0.45, ez = teslaLocalTarget.z;
      for (let i = 0; i < 12; i++) {
        const f = i / 11;
        const jitter = (i === 0 || i === 11) ? 0 : Math.sin(f * Math.PI) * 0.16;
        const px = THREE.MathUtils.lerp(sx, ex, f) + Math.sin(time * 64 + i * 2.9) * jitter;
        const py = THREE.MathUtils.lerp(sy, ey, f) + Math.cos(time * 57 + i * 3.7) * jitter + Math.sin(f * Math.PI) * 0.24;
        const pz = THREE.MathUtils.lerp(sz, ez, f) + Math.sin(time * 71 + i * 2.1) * jitter;
        teslaPositions[i * 3] = px;
        teslaPositions[i * 3 + 1] = py;
        teslaPositions[i * 3 + 2] = pz;
      }
      teslaGeo.attributes.position.needsUpdate = true;
      teslaLine.visible = true;
    } else {
      teslaLine.visible = false;
    }
  }

  const suspension = [];
  const strutGeometry = new THREE.CylinderGeometry(0.019, 0.027, 1, 10);
  const sleeveGeometry = new THREE.CylinderGeometry(0.019, 0.022, 0.056, 12);
  const pistonGeometry = new THREE.CylinderGeometry(0.009, 0.009, 1, 12);
  const springPoints = Array.from({ length: 41 }, (_, index) => {
    const fraction = index / 40;
    const angle = TAU * 5.25 * fraction;
    return new THREE.Vector3(0.026 * Math.cos(angle), fraction, 0.026 * Math.sin(angle));
  });
  const springGeometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPoints), 48, 0.004, 5, false);
  const up = new THREE.Vector3(0, 1, 0);
  const offset = new THREE.Vector3();
  const axleJoint = new THREE.Vector3();
  function suspensionMesh(geometry, material, name) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  for (const wheel of wheelHubs) {
    const { x, z } = wheel;
    const side = Math.sign(x);
    const trailingLink = suspensionMesh(strutGeometry, undercarriage, "suspension-trailing-link");
    const linkagePivot = new THREE.Vector3(side * 0.520, 0.350, z * 0.87);
    const shock = new THREE.Group();
    shock.name = "suspension-coilover";
    shock.position.set(side * 0.458, 0.510, z * 0.70);
    const sleeve = suspensionMesh(sleeveGeometry, iron, "damper-cylinder");
    sleeve.position.y = 0.028;
    const piston = suspensionMesh(pistonGeometry, machine, "damper-piston");
    const spring = suspensionMesh(springGeometry, accent, "damper-spring");
    shock.add(sleeve, piston, spring);
    rover.add(trailingLink, shock);
    standardRoverParts.push(wheel.mount, trailingLink, shock);
    suspension.push({ wheel, side, linkagePivot, trailingLink, shock, piston, spring });
  }
  function updateSuspension(wheelLoad = []) {
    for (const [index, { wheel, side, linkagePivot, trailingLink, shock, piston, spring }] of suspension.entries()) {
      const { mount, hub, compliantTire, treadSpin, tireRadius } = wheel;
      const deflection = roverTireDeflection(wheelLoad[index]);
      // Keep the unloaded crown circular and leave the machined hub at its rigid radius.
      compliantTire.scale.y = 1 - deflection / (2 * tireRadius);
      compliantTire.position.y = deflection * 0.5;
      treadSpin.rotation.x = hub.rotation.x;

      axleJoint.set(side * 0.523, mount.position.y, mount.position.z);
      offset.subVectors(axleJoint, linkagePivot);
      trailingLink.position.copy(linkagePivot).addScaledVector(offset, 0.5);
      trailingLink.scale.y = offset.length();
      trailingLink.quaternion.setFromUnitVectors(up, offset.normalize());

      axleJoint.x = side * 0.468;
      axleJoint.y += 0.022;
      offset.subVectors(axleJoint, shock.position);
      const span = offset.length();
      shock.quaternion.setFromUnitVectors(up, offset.normalize());
      piston.scale.y = Math.max(0.012, span - 0.037);
      piston.position.y = span - piston.scale.y * 0.5;
      spring.position.y = 0.008;
      spring.scale.y = Math.max(0.018, span - 0.016);
    }
  }
  updateSuspension();

  return { rover, wheelHubs, updateSuspension, setBoostVisual, setThrusterTheme, setChassis, getChassis: () => currentChassis, setVisualEvolution, kitRack, ...sampler, aimDataDish,
    getDataFeed: target => dataFeed.getWorldPosition(target) };
}
