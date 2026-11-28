import assert from 'node:assert/strict';
import * as THREE from 'three';

export function verifyMushroomContact(dynamicMeshes) {
  for (const entry of dynamicMeshes.mushrooms) {
    for (const stretch of [1, 1.35]) {
      entry.mesh.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
      entry.mesh.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(entry.mesh, true);
      assert(bounds.max.y <= entry.def.y + .025,
        `Mushroom cap hides the launch ball above authored contact: ${bounds.max.y - entry.def.y}m`);
    }
    entry.mesh.scale.set(1, 1, 1);
    entry.mesh.updateMatrixWorld(true);
  }
}
