import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import hangarUrl from "../assets/models/hangar_roundGlass.glb";
import minerUrl from "../assets/models/craft_miner.glb";
import astronautUrl from "../assets/models/astronautA.glb";
import rockUrl from "../assets/models/rock.glb";

const modelUrls = { hangar: hangarUrl, miner: minerUrl, astronaut: astronautUrl, rock: rockUrl };
const loader = new GLTFLoader();
const normalizedScenes = new Map();

async function loadNormalized(name) {
  const { scene } = await loader.loadAsync(modelUrls[name]);
  if (!scene) throw new Error(`Missing lunar model scene: ${name}`);
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error(`Empty lunar model: ${name}`);

  const materials = new Map();
  scene.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = object.receiveShadow = true;
    const prepare = source => {
      if (materials.has(source)) return materials.get(source);
      // Some Space Kit exports use unlit materials; keep them in the lunar lighting pass.
      const material = source.isMeshBasicMaterial ? new THREE.MeshStandardMaterial({
        name: source.name, color: source.color, map: source.map, side: source.side,
        opacity: source.opacity, transparent: source.transparent, roughness: 0.8, metalness: 0.18,
      }) : source;
      if (name === "rock") {
        material.color.setHex(source.name === "rockTrack" ? 0x77736c : 0x5f5c57);
        material.roughness = 0.94;
        material.metalness = 0.02;
      }
      materials.set(source, material);
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(prepare) : prepare(object.material);
  });

  // Normalize inside a wrapper so callers can set its scale without losing normalization.
  // The nested transform also preserves the original GLB node transforms and offsets.
  const normalizer = new THREE.Group();
  const scale = 1 / size.y;
  normalizer.scale.setScalar(scale);
  normalizer.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  normalizer.add(scene);
  const normalized = new THREE.Group();
  normalized.name = `kenney:${name}`;
  normalized.userData.lunarModel = name;
  normalized.add(normalizer);
  return normalized;
}

export async function loadLunarModel(name) {
  if (!Object.hasOwn(modelUrls, name)) throw new Error(`Unknown lunar model: ${name}`);
  if (!normalizedScenes.has(name)) {
    const pending = loadNormalized(name).catch(error => {
      normalizedScenes.delete(name);
      throw error;
    });
    normalizedScenes.set(name, pending);
  }
  // These are static props: clones share cached geometry/materials, but have independent poses.
  return (await normalizedScenes.get(name)).clone(true);
}
