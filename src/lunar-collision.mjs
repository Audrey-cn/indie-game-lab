// The ore fixture is a cylinder around the plate and every embedded crystal.
// The rover's rounded footprint covers the bumpers, tire shoulders and body lean.
export const ORE_RADIUS = 0.375;
export const ROVER_CORE_HALF_X = 0.70;
export const ROVER_CORE_HALF_Z = 0.965;
export const ROVER_CORNER_RADIUS = 0.125;
const SKIN = 0.024;
const FOOTPRINT_RADIUS = Math.hypot(ROVER_CORE_HALF_X, ROVER_CORE_HALF_Z) + ROVER_CORNER_RADIUS + SKIN;
const WHEEL_DROOP = 0.137;

function clamp(value, limit) {
  return Math.max(-limit, Math.min(limit, value));
}

function localFixture(x, z, cosine, sine, sample) {
  const dx = sample.x - x, dz = sample.z - z;
  return [cosine * dx - sine * dz, sine * dx + cosine * dz];
}

function coreContact(u, v) {
  const du = u - clamp(u, ROVER_CORE_HALF_X);
  const dv = v - clamp(v, ROVER_CORE_HALF_Z);
  const distance = Math.hypot(du, dv);
  if (distance > 1e-8) return { nx: du / distance, nz: dv / distance, gap: distance };

  const xGap = Math.abs(u) - ROVER_CORE_HALF_X;
  const zGap = Math.abs(v) - ROVER_CORE_HALF_Z;
  return xGap > zGap
    ? { nx: u < 0 ? -1 : 1, nz: 0, gap: xGap }
    : { nx: 0, nz: v < 0 ? -1 : 1, gap: zGap };
}

function fixtureSupport(sample, nx, nz) {
  const radius = sample.radius ?? ORE_RADIUS;
  if (sample.kind !== "rock" || (sample.radiusX == null && sample.radiusZ == null)) return radius;

  // The support of the fitted ellipse gives a conservative separating plane.
  const yaw = sample.yaw ?? 0;
  const cosine = Math.cos(yaw), sine = Math.sin(yaw);
  const localX = cosine * nx - sine * nz;
  const localZ = sine * nx + cosine * nz;
  return Math.hypot((sample.radiusX ?? radius) * localX, (sample.radiusZ ?? radius) * localZ);
}

export function oreClearance(x, z, yaw, sample) {
  const cosine = Math.cos(yaw), sine = Math.sin(yaw);
  const [u, v] = localFixture(x, z, cosine, sine, sample);
  const { nx, nz, gap } = coreContact(u, v);
  return gap - ROVER_CORNER_RADIUS - fixtureSupport(sample, cosine * nx + sine * nz, -sine * nx + cosine * nz);
}

export function resolveOreContacts(state, samples, cosine, sine, arenaLimit = Infinity) {
  const wheelFloor = (state.y ?? -Infinity) - WHEEL_DROOP
    - ROVER_CORE_HALF_X * Math.abs(Math.sin(state.roll ?? 0))
    - ROVER_CORE_HALF_Z * Math.abs(Math.sin(state.pitch ?? 0));
  // A correction away from one fixture can move the rover into a neighboring one.
  for (let iteration = 0; iteration < 4; iteration++) {
    let projected = false;
    for (const [index, sample] of samples.entries()) {
      const extent = FOOTPRINT_RADIUS + Math.max(sample.radius ?? ORE_RADIUS, sample.radiusX ?? 0, sample.radiusZ ?? 0);
      if (Math.abs(sample.x - state.x) > extent || Math.abs(sample.z - state.z) > extent) continue;
      if (sample.kind === "rock" && wheelFloor > sample.top + SKIN) continue;

      const [u, v] = localFixture(state.x, state.z, cosine, sine, sample);
      const { nx, nz, gap } = coreContact(u, v);
      const worldX = cosine * nx + sine * nz, worldZ = -sine * nx + cosine * nz;
      const depth = fixtureSupport(sample, worldX, worldZ) + ROVER_CORNER_RADIUS + SKIN - gap;
      if (depth <= 1e-8) continue;

      projected = true;
      const normalSpeed = Math.max(0, state.vx * worldX + state.vz * worldZ);
      state.x -= worldX * depth;
      state.z -= worldZ * depth;
      // Cancel the inward component and retain tangential momentum along the rock.
      state.vx -= worldX * normalSpeed;
      state.vz -= worldZ * normalSpeed;
      state.oreContact = index;
      state.oreImpactSpeed = Math.max(state.oreImpactSpeed, normalSpeed);
    }
    const boundedX = clamp(state.x, arenaLimit), boundedZ = clamp(state.z, arenaLimit);
    if (boundedX !== state.x && state.vx * state.x > 0) state.vx = 0;
    if (boundedZ !== state.z && state.vz * state.z > 0) state.vz = 0;
    state.x = boundedX;
    state.z = boundedZ;
    if (!projected) break;
  }
}
