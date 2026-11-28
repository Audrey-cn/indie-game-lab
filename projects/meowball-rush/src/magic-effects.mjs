import * as THREE from 'three';

// Short, pooled-per-burst sparkles shared by critter greetings and beacons.
export function createMagicBurst(parent, effects, at, color = 0xffdf8d) {
  const group = new THREE.Group();
  group.name = 'magic-sparkle-burst';
  group.userData.cameraOcclusionIgnore = true;
  group.position.set(at.x, at.y + .45, at.z);
  const geometry = new THREE.OctahedronGeometry(.095);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true,
    opacity: 1, depthWrite: false, toneMapped: false });
  for (let i = 0; i < 18; i++) {
    const spark = new THREE.Mesh(geometry, material);
    const angle = i * 2.39996, speed = .9 + (i % 4) * .32;
    spark.userData.velocity = { x: Math.cos(angle) * speed,
      y: 1.5 + (i % 5) * .3, z: Math.sin(angle) * speed };
    group.add(spark);
  }
  parent.add(group);
  effects.push({ group, geometry, material, elapsed: 0, duration: .8 });
}

export function updateMagicBursts(effects, dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    effect.elapsed = Math.min(effect.duration, effect.elapsed + dt);
    const t = effect.elapsed / effect.duration;
    effect.material.opacity = (1 - t) ** 1.5;
    for (const spark of effect.group.children) {
      const v = spark.userData.velocity;
      spark.position.set(v.x * effect.elapsed, v.y * effect.elapsed - 1.8 * effect.elapsed ** 2, v.z * effect.elapsed);
      spark.rotation.set(t * 4, t * 3, t * 2);
      spark.scale.setScalar(1 - t * .65);
    }
    if (t >= 1) {
      effect.group.removeFromParent();
      effect.geometry.dispose(); effect.material.dispose();
      effects.splice(i, 1);
    }
  }
}
