import * as THREE from "three";
import { loadLunarModel } from "./lunar-model-assets.mjs";

// Keep the landing circle, mission sites and the habitat's front workshop lane clear.
const placements = [
  { model: "hangar", x: -13.9, z: -5.9, height: 1.8, yaw: 0, foundation: true },
  { model: "miner", x: 5, z: -0.9, height: 0.78, yaw: 0 },
  { model: "astronaut", x: -9.375, z: -5.587, height: 0.95, yaw: 0.38 },
  { model: "rock", x: -12, z: -10.7, height: 0.34, yaw: 0.7 },
  { model: "rock", x: -13.2, z: -9.8, height: 0.29, yaw: 2.1 },
  { model: "rock", x: -10.8, z: -12, height: 0.40, yaw: 1.4 },
  { model: "rock", x: -8.8, z: -12.7, height: 0.28, yaw: 2.8 },
  { model: "rock", x: -5.3, z: -11.3, height: 0.38, yaw: 0.3 },
  { model: "rock", x: -4.5, z: -9.7, height: 0.24, yaw: 1.9 },
];

function bottomContacts(model, height) {
  const points = [];
  const point = new THREE.Vector3();
  model.updateMatrixWorld(true);
  model.traverse(object => {
    if (!object.isMesh) return;
    const positions = object.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
      // Use the actual feet / underside, including the GLB's original node transforms.
      if (point.y <= height * 0.025) points.push(point.clone());
    }
  });
  return points;
}

export async function addLunarOutpostModels(scene, terrainHeight) {
  const models = await Promise.all(placements.map(({ model }) => loadLunarModel(model)));
  const group = new THREE.Group();
  group.name = "kenney-outpost";
  const groundings = placements.map((placement, index) => {
    const { model: kind, x, z, height, yaw, foundation } = placement;
    const model = models[index];
    model.scale.setScalar(height);
    model.rotation.y = yaw;
    const contacts = bottomContacts(model, height);
    const anchor = new THREE.Group();
    anchor.name = `outpost:${kind}:${index}`;
    anchor.position.set(x, 0, z);
    anchor.add(model);
    group.add(anchor);

    if (!foundation) return () => {
      // Seat every low contact on or just inside the ground; never suspend feet above a slope.
      const datum = Math.min(...contacts.map(p => terrainHeight(x + p.x, z + p.z) - p.y));
      anchor.position.y = datum - (kind === "rock" ? height * 0.08 : 0);
    };

    const bounds = new THREE.Box3().setFromObject(model);
    const radius = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / 2 + 0.06;
    const geometry = new THREE.CylinderGeometry(radius, radius, 1, 32);
    const positions = geometry.attributes.position;
    const skirt = Array.from({ length: positions.count }, (_, i) => ({
      x: positions.getX(i), z: positions.getZ(i), bottom: positions.getY(i) < 0,
    }));
    const footing = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: 0x69675f, roughness: 0.93, metalness: 0.04,
    }));
    footing.name = "research-dome-grounding";
    footing.castShadow = footing.receiveShadow = true;
    anchor.add(footing);
    return () => {
      // A level top supports the dome; its skirt follows the existing terrain function.
      // Sample the full disk as well as the rim so a central rise cannot penetrate the floor.
      let datum = terrainHeight(x, z);
      for (const p of skirt) datum = Math.max(datum, terrainHeight(x + p.x, z + p.z));
      for (let u = -radius; u <= radius; u += radius / 8) {
        for (let v = -radius; v <= radius; v += radius / 8) {
          if (u * u + v * v <= radius * radius) datum = Math.max(datum, terrainHeight(x + u, z + v));
        }
      }
      anchor.position.y = datum + 0.012;
      for (let i = 0; i < skirt.length; i++) {
        const p = skirt[i];
        positions.setY(i, p.bottom ? terrainHeight(x + p.x, z + p.z) - anchor.position.y - 0.035 : 0);
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    };
  });
  function refreshTerrain() {
    for (const ground of groundings) ground();
    group.updateMatrixWorld(true);
  }
  refreshTerrain();
  scene.add(group);
  // Static scenery stays out of mission fixtures and rover physics.
  return { group, refreshTerrain };
}
