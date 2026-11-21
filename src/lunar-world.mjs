import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { addLunarBackdrop, LUNAR_SUN_OFFSET } from "./three-visuals.mjs";
import { makeEquipmentFinish } from "./lunar-equipment-finish.mjs";
import { ORE_RADIUS } from "./lunar-collision.mjs";
import { createBore } from "./lunar-mining.mjs";
import { makeMineralStyle } from "./lunar-mineral-styles.mjs";
import { createLunarSurface, addEmbeddedRocks, regolithHeight, regolithTint } from "./lunar-surface.mjs";
import { ARENA_LIMIT, RETURN_RADIUS } from "./lunar-rules.mjs";

export const ARENA_RADIUS = 37.4;

export function fract(number) { return number - Math.floor(number); }
export function hash(x, z) { return fract(Math.sin(x * 191.51 + z * 319.47) * 43758.5453); }

export function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = fract(x), fz = fract(z);
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(xi, zi), hash(xi + 1, zi), u),
    THREE.MathUtils.lerp(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
}

export function terrainHeight(x, z) {
  const saddle = 0.19 * (noise(x * 0.2, z * 0.17) - 0.5)
    + 0.11 * (noise(x * 0.75, z * 0.72) - 0.53);
  const basin = Math.exp(-((x + 4.2) ** 2 + (z - 1.05) ** 2) / 5.5);
  const secondary = Math.exp(-((x - 7.8) ** 2 + (z + 7.4) ** 2) / 5);
  const radial = Math.hypot(x, z);
  const border = THREE.MathUtils.smoothstep(radial, 11.1, 17.1);
  const ridge = 0.42 * (noise(x * 0.16 + 5, z * 0.16 - 9) - 0.46)
    + 0.23 * (noise(x * 0.34, z * 0.37 + 7) - 0.5);
  const outsideBowl = Math.exp(-((x + 13.2) ** 2 * 0.18 + (z - 1.5) ** 2 * 0.085))
    + Math.exp(-((x - 13.6) ** 2 * 0.16 + (z - 6.2) ** 2 * 0.10));
  const relief = saddle - 0.29 * basin - 0.19 * secondary + regolithHeight(x, z)
    + border * (ridge - 0.46 * outsideBowl);
  return THREE.MathUtils.lerp(relief, -0.08, THREE.MathUtils.smoothstep(radial, 35.95, ARENA_RADIUS));
}

export function createReflectionEnvironment(renderer) {
  const stage = new THREE.Scene();
  stage.background = new THREE.Color().setRGB(0.023, 0.027, 0.038);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const reflectionCards = [
    { position: LUNAR_SUN_OFFSET, size: [1.4, 1.4], color: [10.0, 8.5, 6.3] },
    { position: [-9, 5, 6], size: [7, 2.0], color: [1.8, 1.30, 0.90] },
    { position: [4, 8, 6], size: [10, 6], color: [0.50, 0.65, 0.92] },
    { position: [0, -9, 2], size: [24, 24], color: [0.64, 0.51, 0.39] },
  ];
  const materials = [];
  for (const { position, size, color } of reflectionCards) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(...color), toneMapped: false,
    });
    materials.push(material);
    const card = new THREE.Mesh(geometry, material);
    card.position.set(...position);
    card.scale.set(...size, 1);
    card.lookAt(0, 0, 0);
    stage.add(card);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const { texture } = pmrem.fromScene(stage, 0, 0.1, 42, { size: 128 });
  pmrem.dispose();
  geometry.dispose();
  for (const material of materials) material.dispose();
  return texture;
}

export function createSharedMaterials() {
  const silver = makeEquipmentFinish(0xbcc3c9, "steel", 167);
  const slateMetal = new THREE.MeshStandardMaterial({ color: 0x343c49, roughness: 0.42, metalness: 0.62 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd49a50, roughness: 0.32, metalness: 0.52 });
  function emissive(color, strength = 2.2) {
    return new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: strength, metalness: 0.12, roughness: 0.34,
    });
  }
  const ice = emissive(0x74ffd8);
  const amber = emissive(0xffbb61);
  const roadMarks = new THREE.MeshStandardMaterial({ color: 0x817d6e, roughness: 0.91 });
  return { silver, slateMetal, gold, ice, amber, roadMarks, emissive };
}

export function createGlowFactory() {
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 64;
  const glowContext = glowCanvas.getContext("2d");
  const gradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "#ffffffe6");
  gradient.addColorStop(0.19, "#ffffff81");
  gradient.addColorStop(0.5, "#ffffff28");
  gradient.addColorStop(1, "#ffffff00");
  glowContext.fillStyle = gradient;
  glowContext.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  function glow(parent, color, size, opacity, x, y, z) {
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, color, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    flare.position.set(x, y, z);
    flare.scale.set(size, size, 1);
    parent.add(flare);
    return flare;
  }
  return { glow, glowTexture };
}

export function place(parent, geometry, material, x, y, z) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

export function block(parent, material, width, depth, length, x, y, z, radius = 0.035) {
  return place(parent, new RoundedBoxGeometry(width, depth, length, 2, radius), material, x, y, z);
}

export function buildLunarTerrain(scene, renderer, camera, sun) {
  const surface = createLunarSurface(renderer);
  const rimColor = new THREE.Color(0x85817b);
  addLunarBackdrop(scene, {
    arenaRadius: ARENA_RADIUS, camera, groundY: -0.08, rimColor,
    surfaceTexture: surface.map, surfaceNormal: surface.normalMap, surfaceRoughness: surface.roughnessMap,
    surfaceNormalScale: surface.normalScale, sunDirection: sun.position.clone().normalize(),
  });
  const arenaDiameter = 2 * ARENA_RADIUS + 0.025;
  const terrain = new THREE.PlaneGeometry(arenaDiameter, arenaDiameter, 258, 258);
  terrain.rotateX(-Math.PI / 2);
  const terrainPositions = terrain.attributes.position;
  const terrainUvs = terrain.attributes.uv;
  const terrainColors = [];
  const slate = new THREE.Color(0x5e5b57);
  const ash = new THREE.Color(0x9d988f);
  const groundColor = new THREE.Color();
  for (let i = 0; i < terrainPositions.count; i++) {
    const u = terrainPositions.getX(i) / (arenaDiameter * 0.5);
    const v = terrainPositions.getZ(i) / (arenaDiameter * 0.5);
    const x = u * Math.sqrt(1 - v * v * 0.5) * arenaDiameter * 0.5;
    const z = v * Math.sqrt(1 - u * u * 0.5) * arenaDiameter * 0.5;
    terrainPositions.setXYZ(i, x, terrainHeight(x, z), z);
    terrainUvs.setXY(i, x / 28 + 0.5, 0.5 - z / 28);
    const value = 0.10 + 0.45 * noise(x * 0.27 + 3, z * 0.31)
      + 0.24 * noise(x * 0.92, z * 1.06) + 0.12 * noise(x * 2.3, z * 2.1)
      + regolithTint(x, z);
    groundColor.copy(slate).lerp(ash, value).lerp(rimColor, THREE.MathUtils.smoothstep(Math.hypot(x, z), 34.9, ARENA_RADIUS));
    terrainColors.push(groundColor.r, groundColor.g, groundColor.b);
  }
  terrain.setAttribute("color", new THREE.Float32BufferAttribute(terrainColors, 3));
  terrain.computeVertexNormals();
  const ground = new THREE.Mesh(terrain, surface.material);
  ground.receiveShadow = true;
  scene.add(ground);

  const rockField = addEmbeddedRocks(scene, terrainHeight, { arenaRadius: ARENA_RADIUS, playableLimit: ARENA_LIMIT });
  const { tallRockFixtures, sampleRockSupport, lowRockSupports } = rockField.userData;
  const wheelSurface = (x, z) => terrainHeight(x, z) + sampleRockSupport(x, z);

  return { ground, surface, rockField, tallRockFixtures, sampleRockSupport, lowRockSupports, wheelSurface };
}

export function buildStationFurniture(scene, { silver, slateMetal, amber, roadMarks }, glow) {
  for (const side of [-1, 1]) {
    for (let offset = -15; offset <= 15; offset += 5) {
      for (const alongX of [false, true]) {
        const [x, z] = alongX ? [offset, side * (ARENA_LIMIT - 0.32)] : [side * (ARENA_LIMIT - 0.32), offset];
        const mark = place(scene, new THREE.BoxGeometry(alongX ? 0.37 : 0.075, 0.012, alongX ? 0.075 : 0.37),
          roadMarks, x, terrainHeight(x, z) + 0.027, z);
        mark.castShadow = false;
      }
    }
  }

  for (const side of [-1, 1]) for (const other of [-1, 1]) {
    const bx = side * (ARENA_LIMIT - 0.55), bz = other * (ARENA_LIMIT - 0.55);
    const stand = new THREE.Group();
    stand.position.set(bx, terrainHeight(bx, bz), bz);
    scene.add(stand);
    block(stand, slateMetal, 0.63, 0.16, 0.67, 0, 0.08, 0);
    block(stand, silver, 0.12, 0.78, 0.12, 0, 0.46, 0);
    block(stand, amber, 0.28, 0.1, 0.28, 0, 0.9, 0);
    block(stand, slateMetal, 0.32, 0.065, 0.31, 0, 0.98, 0);
    glow(stand, 0xffb461, 0.48, 0.42, 0, 0.88, 0);
  }

  const solarRack = new THREE.Group();
  solarRack.position.set(6.9, terrainHeight(6.9, -9.1), -9.1);
  solarRack.rotation.y = -0.42;
  scene.add(solarRack);
  const solarPlate = new THREE.MeshPhysicalMaterial({
    color: 0x172a51, metalness: 0.34, roughness: 0.23, clearcoat: 0.69, clearcoatRoughness: 0.11,
  });
  const solarCellGeometry = new THREE.BoxGeometry(0.205, 0.014, 0.21);
  const solarBanks = [];
  const alignSolar = new THREE.Object3D();
  for (const side of [-1, 1]) {
    const bank = new THREE.Group();
    bank.rotation.x = 0.26;
    bank.position.set(side * 0.67, 0.61, 0);
    solarRack.add(bank);
    solarBanks.push(bank);
    block(bank, slateMetal, 1.19, 0.073, 0.97, 0, 0, 0, 0.024);
    block(solarRack, silver, 0.09, 0.63, 0.11, side * 0.70, 0.33, -0.09, 0.012);
    block(solarRack, slateMetal, 0.26, 0.08, 0.29, side * 0.70, 0.06, -0.09, 0.014);
    const solarCells = new THREE.InstancedMesh(solarCellGeometry, solarPlate, 20);
    for (let cell = 0; cell < 20; cell++) {
      alignSolar.position.set((cell % 5 - 2) * 0.225, 0.04, (Math.floor(cell / 5) - 1.5) * 0.226);
      alignSolar.updateMatrix();
      solarCells.setMatrixAt(cell, alignSolar.matrix);
    }
    bank.add(solarCells);
  }

  const pad = new THREE.Group();
  scene.add(pad);
  const padY = (x, z) => terrainHeight(x, z) + 0.026;
  const padRings = [];
  const dockLights = [];
  for (let index = 0; index < 12; index++) {
    const angle = index / 12 * Math.PI * 2;
    const x = Math.sin(angle) * RETURN_RADIUS, z = Math.cos(angle) * RETURN_RADIUS;
    const marking = block(pad, roadMarks, 0.29, 0.013, 0.053, x, padY(x, z), z, 0.004);
    marking.rotation.y = angle;
    padRings.push(marking);
    if (index % 3 === 0) {
      const lx = Math.sin(angle) * (RETURN_RADIUS + 0.15), lz = Math.cos(angle) * (RETURN_RADIUS + 0.15);
      const py = padY(lx, lz);
      const housing = block(pad, slateMetal, 0.18, 0.048, 0.18, lx, py, lz, 0.012);
      housing.rotation.y = angle;
      const cap = block(pad, silver, 0.13, 0.016, 0.13, lx, py + 0.028, lz, 0.005);
      cap.rotation.y = angle;
      const ledMat = new THREE.MeshStandardMaterial({
        color: 0x8cf8eb, emissive: 0x8cf8eb, emissiveIntensity: 2.6, roughness: 0.2, metalness: 0.1,
      });
      const led = block(pad, ledMat, 0.092, 0.014, 0.032, lx, py + 0.038, lz, 0.004);
      led.rotation.y = angle;
      led.castShadow = false;
      dockLights.push(led);
    }
  }

  const receiver = new THREE.Group();
  receiver.name = "Landing zone telemetry receiver";
  receiver.position.set(2.86, terrainHeight(2.86, 0.85), 0.85);
  receiver.rotation.y = -Math.PI / 2;
  scene.add(receiver);
  block(receiver, slateMetal, 0.41, 0.063, 0.33, 0, 0.037, 0, 0.013);
  block(receiver, silver, 0.047, 0.96, 0.059, 0, 0.51, 0, 0.007);
  block(receiver, slateMetal, 0.18, 0.16, 0.104, 0, 0.99, 0.029, 0.015);
  block(receiver, silver, 0.119, 0.115, 0.016, 0, 1.007, 0.089, 0.004);
  block(receiver, amber, 0.095, 0.022, 0.018, 0, 0.922, 0.087, 0.003);
  const dataDestination = receiver.localToWorld(new THREE.Vector3(0, 1.004, 0.108));

  return { solarBanks, padRings, dockLights, receiver, dataDestination };
}

function makeCausticMap() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 96;
  const brush = canvas.getContext("2d");
  brush.globalCompositeOperation = "lighter";
  for (let i = 0; i < 19; i++) {
    const x = 48 + (hash(i, 33) - 0.5) * 46, y = 48 + (hash(i, 55) - 0.5) * 38;
    const radius = 7 + 20 * hash(i, 57);
    brush.save();
    brush.translate(x, y);
    brush.rotate(Math.PI * hash(i, 62));
    brush.scale(1, 0.23 + hash(i, 72) * 0.52);
    const light = brush.createRadialGradient(0, 0, 0, 0, 0, radius);
    light.addColorStop(0, i % 5 === 0 ? "#e1ffc290" : "#58e4c84c");
    light.addColorStop(0.25, "#5be4cc28");
    light.addColorStop(1, "#5be4cc00");
    brush.fillStyle = light;
    brush.fillRect(-radius, -radius, radius * 2, radius * 2);
    brush.restore();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

export function buildCrystalField(scene, { slateMetal }) {
  const crystals = [[0, -3], [-6, -5], [5.8, -6], [6.5, 4.8], [-5.5, 5.9]]
    .map(([x, z]) => ({ x, z, radius: ORE_RADIUS }));
  const mineralStyles = crystals.map((_, i) => makeMineralStyle(i, hash));
  const crystalMaterial = new THREE.MeshPhysicalMaterial({
    metalness: 0.06, thickness: 0.32, ior: 1.56, attenuationDistance: 0.45, dispersion: 0.10,
    envMapIntensity: 1.85, clearcoat: 0.58, clearcoatRoughness: 0.10, flatShading: true, vertexColors: true,
  });
  const crystalEdge = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 facingNormal;
      varying vec3 towardCamera;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        facingNormal = normalize(normalMatrix * normal);
        towardCamera = -view.xyz;
        gl_Position = projectionMatrix * view;
      }
    `,
    uniforms: { mineralTint: { value: new THREE.Color(0x7baea3) } },
    fragmentShader: /* glsl */ `
      uniform vec3 mineralTint;
      varying vec3 facingNormal;
      varying vec3 towardCamera;
      void main() {
        vec3 n = normalize(facingNormal);
        vec3 v = normalize(towardCamera);
        float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.6);
        float gleam = pow(max(0.0, dot(reflect(-v, n), normalize(vec3(-0.63, 0.56, 0.42)))), 28.0);
        gl_FragColor = vec4(mix(mineralTint * 2.1, vec3(1.12, 1.18, 1.10), gleam), fresnel * 0.22 + gleam * 0.28);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const causticMap = makeCausticMap();
  const regolithRockMat = new THREE.MeshStandardMaterial({
    color: 0x625d56, roughness: 0.94, metalness: 0.02, flatShading: true,
  });
  const collarChunkGeo = new THREE.DodecahedronGeometry(1, 0);
  const boreRay = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const boreRayStart = new THREE.Vector3();
  const crystalMeshes = [];

  for (const [siteIndex, { x, z }] of crystals.entries()) {
    const style = mineralStyles[siteIndex];
    const marker = new THREE.Group();
    const y = terrainHeight(x, z);
    marker.position.set(x, y, z);
    scene.add(marker);

    for (let c = 0; c < 7; c++) {
      const theta = (c / 7) * Math.PI * 2 + hash(siteIndex, c + 19) * 0.55;
      const rad = 0.16 + hash(c, siteIndex + 41) * 0.14;
      const chunk = place(marker, collarChunkGeo, regolithRockMat,
        Math.cos(theta) * rad, 0.012 + hash(c + 5, siteIndex) * 0.032, Math.sin(theta) * rad);
      const sx = 0.08 + hash(c + 11, siteIndex) * 0.095;
      chunk.scale.set(sx, sx * (0.36 + hash(c + 23, siteIndex) * 0.28), sx * (0.72 + hash(c + 31, siteIndex) * 0.52));
      chunk.rotation.set(hash(c, 3) * 0.6, theta, hash(c, 7) * 0.5);
    }

    const specimen = new THREE.Group();
    marker.add(specimen);
    const pin = block(marker, slateMetal, 0.072, 0.048, 0.056, 0.22, 0.026, 0.24, 0.008);
    pin.rotation.y = 0.65;
    const indicator = block(marker, slateMetal, 0.056, 0.012, 0.024, 0.22, 0.053, 0.24, 0.003);
    indicator.rotation.y = 0.65;
    indicator.castShadow = false;

    const shards = [];
    const mineral = crystalMaterial.clone(), edge = crystalEdge.clone();
    mineral.color.setHex(style.color);
    mineral.attenuationColor.setHex(style.tint);
    mineral.transmission = style.transmission;
    mineral.roughness = style.roughness;
    edge.uniforms.mineralTint.value.setHex(style.tint);
    for (const { geometry, x: ox, z: oz, size, bank, yaw, rake } of style.shards) {
      const shard = place(specimen, geometry, mineral, ox, 0.079 + size * 0.319, oz);
      shard.scale.set(size * 0.86, size, size * 0.92);
      shard.rotation.set(rake, yaw, bank);
      shards.push(shard);
      const rim = new THREE.Mesh(geometry, edge);
      rim.scale.setScalar(1.001);
      rim.renderOrder = 2;
      shard.add(rim);
    }

    const gleam = new THREE.PointLight(style.tint, 0, 1.45, 2);
    gleam.position.set(-0.2, 0.54, 0.17);
    specimen.add(gleam);
    const patchMaterial = new THREE.MeshBasicMaterial({
      map: causticMap, color: style.tint, transparent: true, opacity: 0.14, toneMapped: false,
      depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1,
    });
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.76, 4, 4), patchMaterial);
    patch.geometry.rotateX(-Math.PI / 2);
    const positions = patch.geometry.attributes.position;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const px = positions.getX(vertex) + 0.38, pz = positions.getZ(vertex) - 0.28;
      positions.setXYZ(vertex, px, terrainHeight(x + px, z + pz) - y + 0.023, pz);
    }
    specimen.add(patch);
    marker.updateMatrixWorld(true);

    const boreSurface = new THREE.Vector3(x, y + 0.09, z);
    function mineralTop(px, pz) {
      boreRayStart.set(px, y + 1.6, pz);
      boreRay.set(boreRayStart, down);
      return boreRay.intersectObjects(shards, false)[0]?.point.y;
    }
    const roof = mineralTop(x, z);
    if (roof !== undefined) boreSurface.y = roof;
    const bore = createBore(scene, mineral, edge, boreSurface, mineralTop);
    crystalMeshes.push({ patchMaterial, gleam, indicator, boreSurface, bore });
  }

  return { crystals, crystalMeshes };
}
