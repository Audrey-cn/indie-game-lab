import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeEquipmentFinish } from "./lunar-equipment-finish.mjs";

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
  const stowedMast = new THREE.Vector3(0.603, 1.074, 0.505);
  const stowedCrosshead = new THREE.Vector3(0.628, 1.056, 0.284);
  const stowedWrist = new THREE.Vector3(0.632, 1.085, 0.106);
  const raisedMast = new THREE.Vector3(0.559, 1.79, 0.692);
  const raisedCrosshead = new THREE.Vector3(0.628, 1.80, 0.284);
  const raisedWrist = new THREE.Vector3(0.632, 1.64, 0.106);
  const mastPosition = new THREE.Vector3();
  const crossheadPosition = new THREE.Vector3();
  const wristPosition = new THREE.Vector3();
  const scanPoint = new THREE.Vector3(1.20, 0.55, 0.34);
  const candidate = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const right = new THREE.Vector3();
  const back = new THREE.Vector3();
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
  const liftRange = [0.012, 0.33];
  const slewRange = [0.26, 0.60];
  const reachRange = [0.42, 0.745];
  const feedRange = [0.705, 0.974];
  const foldRange = [0.008, 0.073];
  const { clamp, damp, lerp, smootherstep } = THREE.MathUtils;
  const scanStatus = lenses(0x88eed9, 0.7);

  function makeLink(name, sleeveLength, width) {
    const frame = new THREE.Group();
    frame.name = name;
    assembly.add(frame);
    const sleeve = partBatch(frame);
    box(sleeve, iron, width, sleeveLength, width * 0.84, 0, sleeveLength * 0.49, 0, width * 0.16);
    box(sleeve, accent, width * 1.04, sleeveLength * 0.64, width * 0.41,
      0, sleeveLength * 0.48, width * 0.31, 0.007);
    box(sleeve, rim, width * 0.93, 0.023, width * 0.8, 0, sleeveLength * 0.97, 0, 0.005);
    sleeve.attach();

    const rod = new THREE.Group();
    frame.add(rod);
    const rail = partBatch(rod);
    box(rail, rim, width * 0.53, 1, width * 0.51, 0, 0.5, 0, 0.006);
    box(rail, rubber, width * 0.12, 1, width * 0.33, width * 0.28, 0.5, 0, 0.001);
    rail.attach();
    return { frame, rod, sleeveLength };
  }

  const mast = makeLink("sampler-mast", 0.195, 0.077);
  const boom = makeLink("sampler-boom", 0.177, 0.069);
  const feed = makeLink("sampler-feed", 0.132, 0.057);
  function hinge(name, radius) {
    const pivot = new THREE.Group();
    pivot.name = name;
    assembly.add(pivot);
    const motor = partBatch(pivot);
    pin(motor, iron, radius, radius * 1.8, 0, 0, 0);
    pin(motor, rim, radius * 0.65, 0.014, radius, 0, 0, "x", 14);
    pin(motor, accent, radius * 0.35, 0.007, radius + 0.008, 0, 0, "x", 8);
    motor.attach();
    return pivot;
  }
  const mastHinge = hinge("sampler-mast-hinge", 0.052);
  const feedHinge = hinge("sampler-feed-hinge", 0.037);

  const wrist = new THREE.Group();
  wrist.name = "sampler-wrist";
  assembly.add(wrist);
  const carriage = partBatch(wrist);
  box(carriage, iron, 0.084, 0.075, 0.079, 0, 0, 0, 0.014);
  box(carriage, accent, 0.074, 0.021, 0.067, 0, -0.041, 0, 0.007);
  pin(carriage, rim, 0.024, 0.042, -0.037, -0.016, -0.016, "y");
  pin(carriage, optics, 0.014, 0.007, -0.037, -0.04, -0.016, "y");
  box(carriage, scanStatus, 0.020, 0.011, 0.031, 0.042, -0.016, 0.015, 0.002);
  carriage.attach();

  const drill = new THREE.Group();
  drill.name = "sampling-spindle";
  wrist.add(drill);
  const cutter = partBatch(drill);
  pin(cutter, rim, 0.014, 0.094, 0, -0.047, 0, "y", 12);
  coil(cutter, accent, [0, -0.102, 0], [0, -0.02, 0], 0.016);
  cutter.add(iron, new THREE.ConeGeometry(0.017, 0.036, 10), [0, -0.105, 0], [Math.PI, 0, 0]);
  cutter.attach();

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

  function poseLink(link, start, end, heading) {
    direction.subVectors(end, start);
    const length = direction.length();
    direction.multiplyScalar(1 / Math.max(0.001, length));
    right.set(Math.cos(heading), 0, Math.sin(heading));
    right.addScaledVector(direction, -right.dot(direction)).normalize();
    back.crossVectors(right, direction).normalize();
    link.frame.position.copy(start);
    link.frame.quaternion.setFromRotationMatrix(linkBasis.makeBasis(right, direction, back));
    link.rod.position.y = link.sleeveLength * 0.79;
    link.rod.scale.y = Math.max(0.024, length - link.rod.position.y);
  }

  let extension = 0;
  let actuatorVelocity = 0;
  let scanProgress = 0;
  let spindleSpeed = 0;
  let targetHeading = boomStowYaw;
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

  function updateSampler(dt, { active = false, progress = 0, target, mode = "precision" } = {}) {
    drill.visible = true;
    gripper.visible = false;
    const operating = active && canReachSample(target);
    const rapid = mode === "rapid";
    if (operating) {
      scanProgress = damp(scanProgress, clamp(progress, 0, 1), 20, dt);
      scanPoint.copy(candidate);
      const heading = Math.atan2(scanPoint.x - raisedMast.x, raisedMast.z - scanPoint.z);
      const previous = extension < 0.27 ? boomStowYaw : targetHeading;
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
    // Convert actuator phase speed to approximate tool speed so long, far-side reaches do not whip.
    const horizontal = Math.hypot(
      reachTravel * phaseDerivative(extension, reachRange),
      rotationTravel * phaseDerivative(extension, slewRange),
    );
    const vertical = 0.61 * phaseDerivative(extension, liftRange)
      + Math.max(0.55, raisedWrist.y - scanPoint.y) * phaseDerivative(extension, feedRange);
    const foldedTip = 0.25 * phaseDerivative(extension, foldRange);
    const motionSlope = Math.max(1, horizontal + vertical + foldedTip);
    const maxToolSpeed = operating ? (rapid ? 7.2 : 6.4) : 7.0;
    const speedLimit = maxToolSpeed / motionSlope;
    const requestedVelocity = clamp((destination - extension) * (rapid ? 12 : 8.6),
      -Math.min(1.20, speedLimit), Math.min(rapid ? 1.76 : 1.17, speedLimit));
    actuatorVelocity = damp(actuatorVelocity, requestedVelocity, 34, dt);
    extension = clamp(extension + actuatorVelocity * dt, 0, 1);

    // Shared phase boundaries preserve clearance on reversal, including after an interrupted scan.
    const lift = smootherstep(extension, ...liftRange);
    const slew = smootherstep(extension, ...slewRange);
    const reach = smootherstep(extension, ...reachRange);
    const feedDepth = smootherstep(extension, ...feedRange);
    const align = smootherstep(scanProgress, 0.18, 0.296);
    const bite = smootherstep(scanProgress, 0.307, 0.72);
    const seal = smootherstep(scanProgress, 0.78, 0.971);
    const toolStroke = 0.024 * bite;
    const tipClearance = lerp(0.165, 0.012, align) - 0.098 * bite + 0.332 * seal;
    const travelAboveCut = drillTipLength + drillSeat + toolStroke + tipClearance;
    rover.getWorldQuaternion(inverseVehicle).invert();
    drillAxis.copy(up).applyQuaternion(inverseVehicle);
    drillAxis.lerp(up, 1 - smootherstep(feedDepth, 0.56, 0.98)).normalize();
    resolvedWrist.copy(scanPoint).addScaledVector(drillAxis, travelAboveCut);
    const raisedWristY = Math.max(raisedWrist.y, resolvedWrist.y + 0.18);
    const raisedCrossheadY = Math.max(raisedCrosshead.y, raisedWristY + 0.21);

    mastPosition.copy(stowedMast).lerp(raisedMast, lift);
    crossheadPosition.copy(stowedCrosshead).lerp(raisedCrosshead, lift);
    wristPosition.copy(stowedWrist).lerp(raisedWrist, lift);
    const foldedHeading = Math.atan2(crossheadPosition.x - mastPosition.x, mastPosition.z - crossheadPosition.z);
    const foldedRadius = Math.hypot(crossheadPosition.x - mastPosition.x, crossheadPosition.z - mastPosition.z);
    const scanRadius = Math.hypot(scanPoint.x - mastPosition.x, scanPoint.z - mastPosition.z);
    const currentHeading = lerp(foldedHeading, targetHeading, slew);
    const currentRadius = lerp(foldedRadius, scanRadius, reach);
    direction.subVectors(wristPosition, crossheadPosition)
      .applyAxisAngle(up, foldedHeading - currentHeading).multiplyScalar(1 - reach);
    crossheadPosition.x = mastPosition.x + Math.sin(currentHeading) * currentRadius;
    crossheadPosition.z = mastPosition.z - Math.cos(currentHeading) * currentRadius;
    crossheadPosition.y += (raisedCrossheadY - raisedCrosshead.y) * reach;
    wristPosition.x = lerp(crossheadPosition.x + direction.x, resolvedWrist.x, feedDepth);
    wristPosition.z = lerp(crossheadPosition.z + direction.z, resolvedWrist.z, feedDepth);
    wristPosition.y = lerp(wristPosition.y + (raisedWristY - raisedWrist.y) * reach, resolvedWrist.y, feedDepth);

    poseLink(mast, shoulder, mastPosition, foldedHeading);
    poseLink(boom, mastPosition, crossheadPosition, currentHeading);
    poseLink(feed, crossheadPosition, wristPosition, currentHeading);
    mastHinge.position.copy(mastPosition);
    mastHinge.quaternion.copy(boom.frame.quaternion);
    feedHinge.position.copy(crossheadPosition);
    feedHinge.quaternion.copy(feed.frame.quaternion);
    wrist.position.copy(wristPosition);
    const fold = (1 - smootherstep(extension, ...foldRange)) * HALF_PI;
    headingAndFold.set(0, -currentHeading, fold, "YZX");
    toolAttitude.setFromEuler(headingAndFold);
    wrist.quaternion.setFromUnitVectors(up, drillAxis).multiply(toolAttitude);
    drill.position.y = -drillSeat - toolStroke;
    const cutting = operating ? align * (1 - seal) * smootherstep(feedDepth, 0.63, 0.98) : 0;
    const nextSpeed = damp(spindleSpeed, (rapid ? 49 : 34) * cutting, 11, dt);
    drill.rotation.y = (drill.rotation.y + (spindleSpeed + nextSpeed) * 0.5 * dt) % TAU;
    spindleSpeed = nextSpeed;
    scanStatus.emissiveIntensity = 0.36 + slew * (0.82 + cutting * 0.32);
  }

  function poseKitArm(target, amount, clamped, caseAttitude) {
    drill.visible = false;
    gripper.visible = true;
    for (const [index, jaw] of jaws.entries()) jaw.position.x = (index * 2 - 1) * lerp(0.046, 0.026, clamped);
    rover.getWorldQuaternion(inverseVehicle).invert();
    toolAttitude.copy(inverseVehicle).multiply(caseAttitude);
    drillAxis.copy(up).applyQuaternion(toolAttitude);
    resolvedWrist.copy(target);
    rover.worldToLocal(resolvedWrist).addScaledVector(drillAxis, -grip.position.y);

    mastPosition.copy(stowedMast).lerp(raisedMast, amount);
    wristPosition.copy(stowedWrist).lerp(resolvedWrist, amount);
    wristPosition.y += 0.66 * Math.sin(Math.PI * amount);
    const heading = Math.atan2(wristPosition.x - mastPosition.x, mastPosition.z - wristPosition.z);
    crossheadPosition.copy(stowedCrosshead);
    direction.copy(resolvedWrist);
    direction.y = Math.max(raisedCrosshead.y, resolvedWrist.y + 0.19);
    crossheadPosition.lerp(direction, amount);

    poseLink(mast, shoulder, mastPosition, boomStowYaw);
    poseLink(boom, mastPosition, crossheadPosition, heading);
    poseLink(feed, crossheadPosition, wristPosition, heading);
    mastHinge.position.copy(mastPosition);
    mastHinge.quaternion.copy(boom.frame.quaternion);
    feedHinge.position.copy(crossheadPosition);
    feedHinge.quaternion.copy(feed.frame.quaternion);
    wrist.position.copy(wristPosition);
    wrist.quaternion.copy(toolAttitude);
  }

  function getKitGrip(out) { return grip.getWorldPosition(out); }

  function resetSampler() {
    extension = 0;
    actuatorVelocity = 0;
    scanProgress = 0;
    spindleSpeed = 0;
    targetHeading = boomStowYaw;
    drill.rotation.y = 0;
    updateSampler(0);
  }

  resetSampler();
  return { canReachSample, updateSampler, getSamplerTip, getSamplerStorage, resetSampler, poseKitArm, getKitGrip };
}

function makeRearGuard(chassis, mount, side, { paint, iron, machine }) {
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
  const paint = coatedPanels();
  const { foil, fabric } = blanketMaterials();
  const machine = machinedMetal();
  const iron = new THREE.MeshStandardMaterial({ color: 0x353b3d, metalness: 0.46, roughness: 0.57 });
  const undercarriage = new THREE.MeshStandardMaterial({ color: 0x565a57, metalness: 0.50, roughness: 0.65 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x9ca0a1, metalness: 0.70, roughness: 0.68,
    roughnessMap: machine.roughnessMap, bumpMap: machine.bumpMap, bumpScale: 0.0042 });
  const dustMask = roverDustMask();
  const hullCoating = weatherRoverBody(paint.clone(), dustMask, 0.92, 0.90);
  const lowerArmor = weatherRoverBody(iron.clone(), dustMask, 0.98, 0.65);
  const lowerHardware = weatherRoverBody(undercarriage.clone(), dustMask, 0.94, 0.56);
  const sillMetal = weatherRoverBody(rim.clone(), dustMask, 0.63, 0.76);
  const sideBlanket = weatherRoverBody(foil.clone(), dustMask, 0.68, 0.40);
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
  const frontLamps = lenses(0xdaf1ff, 1.65);
  const rearLamps = lenses(0xff6940, 1.6);
  const indicator = lenses(0xffba6a, 0.65);

  const hull = [
    [-0.33, -0.78], [0.30, -0.81], [0.43, -0.57], [0.465, -0.16], [0.433, 0.15],
    [0.461, 0.55], [0.36, 0.723], [-0.341, 0.723], [-0.46, 0.55], [-0.46, -0.49],
  ];
  armoredDeck(body, lowerArmor, hull.map(([x, z]) => [x * 0.82, z * 0.97]), 0.272, 0.166, 0.022);
  armoredDeck(body, hullCoating, hull, 0.442, 0.169, 0.018);
  armoredDeck(body, undercarriage, hull.map(([x, z]) => [x * 0.94, z * 0.95]), 0.624, 0.031, 0.015);
  box(body, paint, 0.582, 0.141, 0.720, -0.079, 0.718, 0.269, 0.014);
  box(body, iron, 0.61, 0.034, 0.79, -0.075, 0.655, 0.227, 0.013);
  box(body, undercarriage, 0.332, 0.12, 0.281, 0.262, 0.689, -0.5, 0.025);
  box(body, lowerHardware, 0.86, 0.12, 0.105, 0, 0.361, 0.747, 0.022);
  box(body, lowerHardware, 0.81, 0.1, 0.126, 0, 0.39, -0.766, 0.029);
  box(body, iron, 0.36, 0.101, 0.037, 0, 0.554, -0.78, 0.009);
  for (let i = 0; i < 7; i++) {
    box(body, rim, 0.044, 0.011, 0.012, (i - 3) * 0.047, 0.566, -0.799, 0.003);
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
  box(body, iron, 0.51, 0.046, 0.37, -0.145, 0.654, 0.97, 0.013);
  for (const x of [-0.384, 0.094]) {
    strut(body, iron, [x, 0.51, 0.75], [x, 0.64, 1.12], 0.035, 0.044);
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
    glow?.(rover, 0xd8f4ff, 0.34, 0.50, side * 0.33, 0.60, -0.824);
    glow?.(rover, 0xff5a42, 0.25, 0.65, side * 0.37, 0.499, 0.769);
  }

  // Remote sensing mast, a steerable-looking optical head, and a high-gain dish.
  box(body, rim, 0.129, 0.069, 0.136, -0.292, 0.825, 0.12, 0.015);
  strut(body, rim, [-0.292, 0.842, 0.12], [-0.31, 1.19, 0.1], 0.026, 0.017);
  strut(body, rubber, [-0.284, 0.849, 0.144], [-0.3, 1.155, 0.133], 0.014, 0.008);
  box(body, undercarriage, 0.155, 0.086, 0.102, -0.31, 1.202, 0.074, 0.014);
  for (const x of [-0.35, -0.273]) {
    pin(body, rim, 0.028, 0.015, x, 1.203, 0.018, "z");
    pin(body, optics, 0.020, 0.007, x, 1.203, 0.008, "z");
  }
  box(body, machine, 0.111, 0.051, 0.014, -0.31, 1.204, 0.130, 0.0055);
  for (const x of [-0.354, -0.266]) serviceBolt(body, rim, rubber, x, 1.209, 0.140, "z");
  box(body, iron, 0.048, 0.017, 0.010, -0.31, 1.205, 0.140, 0.002);
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

  const wheelMaterials = { tire: wireTireMaterial(), tread, rim, undercarriage, iron, accent, rimFlash, chalk, paint, machine };
  const wheelHubs = [];
  for (const side of [-1, 1]) {
    for (const [index, z] of [-0.59, 0.04, 0.62].entries()) wheelHubs.push(makeWheel(rover, side, z, index, wheelMaterials));
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

  return { rover, wheelHubs, updateSuspension, kitRack, ...sampler, aimDataDish,
    getDataFeed: target => dataFeed.getWorldPosition(target) };
}
