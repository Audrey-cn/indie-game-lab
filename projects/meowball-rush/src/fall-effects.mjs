import * as THREE from 'three';

export function createFallEffect(parent, zone, at) {
  const group = new THREE.Group(); group.name = `fall-effect-${zone.type}`;
  group.position.set(at.x, (zone.triggerY ?? zone.y) + 0.07, at.z); parent.add(group);
  const water = zone.type === 'water', star = zone.type === 'cloud' && zone.variant === 'starlight';
  const color = water ? 0xb5f7ff : zone.variant === 'snow' ? 0xecfaff : zone.type === 'bush' ? 0x92cd68 : zone.type === 'indoor' ? 0xd7ad7c : star ? 0xffd98a : 0xf0e5ff;
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.66, 40), material.clone());
  ring.rotation.x = -Math.PI / 2; group.add(ring);
  const geometry = water ? new THREE.SphereGeometry(0.09, 6, 5) : star ? new THREE.OctahedronGeometry(0.13) : new THREE.SphereGeometry(zone.type === 'cloud' ? 0.3 : 0.12, 6, 5);
  for (let i = 0; i < 22; i++) {
    const angle = i * 2.39996, speed = 1.1 + (i % 5) * 0.4;
    const particle = new THREE.Mesh(geometry, material);
    if (zone.type === 'bush') particle.scale.set(1, 0.25, 1.8);
    particle.userData.velocity = { x: Math.cos(angle) * speed, y: 1.6 + (i % 6) * 0.45, z: Math.sin(angle) * speed };
    group.add(particle);
  }
  return { group, ring, material, geometry, elapsed: 0, duration: 1.1, type: zone.type };
}
export function updateFallEffects(effects, dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i]; effect.elapsed += dt;
    const t = Math.min(1, effect.elapsed / effect.duration);
    effect.ring.scale.setScalar(1 + t * 5); effect.ring.material.opacity = (1 - t) * 0.75;
    effect.material.opacity = (1 - t) ** 1.4;
    for (const particle of effect.group.children) {
      const v = particle.userData.velocity; if (!v) continue;
      particle.position.set(v.x * effect.elapsed, Math.max(-0.05, v.y * effect.elapsed - (effect.type === 'cloud' ? 0.4 : 4.5) * effect.elapsed ** 2), v.z * effect.elapsed);
      particle.rotation.x += dt * 2; particle.rotation.z += dt * 1.6;
    }
    if (t === 1) {
      effect.group.removeFromParent(); effect.geometry.dispose(); effect.material.dispose();
      effect.ring.geometry.dispose(); effect.ring.material.dispose(); effects.splice(i, 1);
    }
  }
}
