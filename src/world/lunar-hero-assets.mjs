import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

/**
 * Optional Hero Asset Pipeline (GLTF/GLB + Draco) for 80/20 hybrid web production:
 * Keeps procedural terrain/rocks/tracks lightweight while allowing any artist or TA
 * to hot-swap Hero models (Rover chassis, Hero Crystals) via URL params or console API:
 *   ?heroRover=./assets/hero-rover.glb&dracoDecoder=./draco/
 *   window.__lunarHeroAssets.loadInto(targetGroup, "./rover.glb", { targetHeight: 1.05 })
 */
export function createHeroAssetPipeline({ dracoDecoderPath = null } = {}) {
  const loader = new GLTFLoader();
  let draco = null;
  if (dracoDecoderPath) {
    draco = new DRACOLoader();
    draco.setDecoderPath(dracoDecoderPath);
    loader.setDRACOLoader(draco);
  }

  async function loadNormalized(url, { targetHeight = 1.0, castShadow = true, receiveShadow = true } = {}) {
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene || gltf.scenes?.[0];
    if (!root) throw new Error(`Empty GLB scene: ${url}`);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.y, 0.0001);
    const scale = targetHeight / maxDim;
    root.scale.setScalar(scale);
    root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    root.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow = castShadow;
      obj.receiveShadow = receiveShadow;
    });
    const wrapper = new THREE.Group();
    wrapper.name = `hero-asset:${url}`;
    wrapper.add(root);
    return { wrapper, gltf, originalSize: size };
  }

  async function attachFromUrlParams({ rover, onLoaded } = {}) {
    const params = new URLSearchParams(location.search);
    const dracoPath = params.get("dracoDecoder");
    if (dracoPath && !draco) {
      draco = new DRACOLoader();
      draco.setDecoderPath(dracoPath);
      loader.setDRACOLoader(draco);
    }
    const roverUrl = params.get("heroRover");
    if (roverUrl && rover) {
      try {
        const { wrapper } = await loadNormalized(roverUrl, { targetHeight: 1.02 });
        wrapper.position.y = 0.24;
        rover.add(wrapper);
        onLoaded?.("rover", wrapper);
      } catch (err) {
        console.warn("[lunar-hero-assets] Failed to load heroRover GLB; keeping procedural rover.", err);
      }
    }
  }

  return { loadNormalized, attachFromUrlParams };
}
