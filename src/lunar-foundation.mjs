import * as THREE from "three";
import { oreClearance } from "./lunar-collision.mjs";

export function createFoundationPreview(scene, groundHeight, site, obstacle, t = zh => zh) {
  const footprint = new THREE.BufferGeometry();
  const corners = [];
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    corners.push([x * 0.58, z * 0.53], [x * 0.29, z * 0.53], [x * 0.58, z * 0.53], [x * 0.58, z * 0.24]);
  }
  footprint.setAttribute("position", new THREE.Float32BufferAttribute(corners.flatMap(([x, z]) =>
    [site.x + x, groundHeight(site.x + x, site.z + z) + 0.031, site.z + z]), 3));
  const finish = new THREE.LineBasicMaterial({ color: 0xb2dabf, transparent: true, opacity: 0.73, depthWrite: false });
  const bracket = new THREE.LineSegments(footprint, finish);
  bracket.visible = false;
  scene.add(bracket);
  const layers = corners.map(([x, z]) => groundHeight(site.x + x, site.z + z));
  const grade = Math.max(...layers) - Math.min(...layers);
  function update(show, state) {
    const clear = oreClearance(state.x, state.z, state.yaw, obstacle) >= 0.014;
    const valid = grade < 0.28 && clear;
    bracket.visible = show;
    finish.color.setHex(valid ? 0xa3d8bb : 0xff9e7b);
    return { valid, reason: !clear ? t("车身占据施工位置", "Rover is blocking the site")
      : grade >= 0.28 ? t("坡度过大，换一处地基", "Site too steep. Try the other site.")
        : t("地基可施工", "Site clear") };
  }
  return { update };
}
