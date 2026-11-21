import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);
const transmission = new THREE.Color(0x8bfff0);
const confirmation = new THREE.Color(0xffc483);

const beamVertex = /* glsl */ `
  varying float along;
  varying vec3 facing;
  varying vec3 toCamera;

  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    along = uv.y;
    facing = normalMatrix * normal;
    toCamera = -view.xyz;
    gl_Position = projectionMatrix * view;
  }
`;

const beamFragment = /* glsl */ `
  uniform float progress;
  uniform float lengthMeters;
  uniform vec3 sendColor;
  uniform vec3 ackColor;
  varying float along;
  varying vec3 facing;
  varying vec3 toCamera;

  float packet(float leadingEdge, float lengthFraction, float taper) {
    float behind = leadingEdge - along;
    return smoothstep(-taper, 0.0, behind)
      * (1.0 - smoothstep(lengthFraction * 0.38, lengthFraction, behind));
  }

  void main() {
    float acquired = smoothstep(0.10, 0.23, progress);
    float extent = smoothstep(0.12, 0.29, progress);
    float endFalloff = smoothstep(0.0, 0.018, along) * (1.0 - smoothstep(0.982, 1.0, along));
    float visibility = acquired * (1.0 - smoothstep(0.86, 0.98, progress)) * endFalloff;
    float crossSection = 0.16 + 0.84 * pow(max(0.0, dot(normalize(facing), normalize(toCamera))), 1.9);
    float packetLength = clamp(0.39 / lengthMeters, 0.025, 0.19);
    float run = (progress - 0.235) / 0.265;
    float outgoing = max(packet(run, packetLength, 0.015),
      max(packet(run - 0.45, packetLength * 0.8, 0.012),
          packet(run - 0.84, packetLength * 0.64, 0.012)));
    float ackPosition = 1.0 - (progress - 0.715) / 0.21;
    float returning = packet(ackPosition + packetLength * 0.56, packetLength * 0.8, 0.015)
      * smoothstep(0.69, 0.735, progress);
    float dash = abs(fract(along * lengthMeters * 5.2) - 0.5);
    float trace = (1.0 - smoothstep(extent - 0.045, extent, along))
      * (0.09 + 0.105 * (1.0 - smoothstep(0.18, 0.39, dash)));
    vec3 color = mix(sendColor, ackColor, returning);
    float energy = clamp(trace + outgoing * 0.78 + returning * 0.82, 0.0, 1.0);
    gl_FragColor = vec4(color, energy * crossSection * visibility);
    #include <colorspace_fragment>
  }
`;

const endpointVertex = /* glsl */ `
  attribute float receiver;
  varying vec2 shape;
  varying float isReceiver;

  void main() {
    vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    center.xy += position.xy;
    shape = uv * 2.0 - 1.0;
    isReceiver = receiver;
    gl_Position = projectionMatrix * center;
  }
`;

const endpointFragment = /* glsl */ `
  uniform float progress;
  uniform vec3 sendColor;
  uniform vec3 ackColor;
  varying vec2 shape;
  varying float isReceiver;

  void main() {
    float radius = length(shape);
    float acquired = smoothstep(0.015, 0.16, progress) * (1.0 - smoothstep(0.17, 0.34, progress));
    float lightUp = smoothstep(0.46, 0.515, progress) * (1.0 - smoothstep(0.55, 0.69, progress));
    float returned = smoothstep(0.83, 0.91, progress) * (1.0 - smoothstep(0.91, 0.995, progress));
    float ack = mix(returned, lightUp, isReceiver);
    float level = max(acquired * mix(1.0, 0.56, isReceiver), ack);
    float ring = 1.0 - smoothstep(0.018, 0.052, abs(radius - mix(0.63, 0.40, acquired)));
    float notches = smoothstep(0.06, 0.25, min(abs(shape.x), abs(shape.y)));
    float led = 1.0 - smoothstep(0.07, 0.175, radius);
    float flare = exp(-9.5 * radius * radius);
    vec3 color = mix(sendColor, ackColor, ack);
    gl_FragColor = vec4(color, (ring * notches * 0.4 + led * 0.66 + flare * 0.3) * level);
    #include <colorspace_fragment>
  }
`;

function isEndpoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

export function createLunarUplink(scene, { groundHeight, mobileGraphics = false, duration = 1.75 } = {}) {
  const group = new THREE.Group();
  group.name = "Uplink packet trail";
  group.visible = false;
  scene.add(group);

  const progress = { value: 0 };
  const lengthMeters = { value: 1 };
  const uniforms = {
    progress,
    sendColor: { value: transmission },
    ackColor: { value: confirmation },
  };
  const effectMaterial = {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  };

  const tube = new THREE.CylinderGeometry(1, 0.76, 1, mobileGraphics ? 8 : 12, 1, true);
  tube.translate(0, 0.5, 0);
  const beam = new THREE.Mesh(tube, new THREE.ShaderMaterial({
    ...effectMaterial,
    uniforms: { ...uniforms, lengthMeters },
    vertexShader: beamVertex,
    fragmentShader: beamFragment,
  }));
  group.add(beam);

  const endpointGeometry = new THREE.PlaneGeometry(0.44, 0.44);
  endpointGeometry.setAttribute("receiver", new THREE.InstancedBufferAttribute(new Float32Array([0, 1]), 1));
  const endpoints = new THREE.InstancedMesh(endpointGeometry, new THREE.ShaderMaterial({
    ...effectMaterial,
    uniforms,
    vertexShader: endpointVertex,
    fragmentShader: endpointFragment,
  }), 2);
  endpoints.frustumCulled = false;
  endpoints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(endpoints);

  const sender = new THREE.Vector3();
  const receiver = new THREE.Vector3();
  const nextSender = new THREE.Vector3();
  const nextReceiver = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const placement = new THREE.Matrix4();
  const total = duration > 0 && Number.isFinite(duration) ? duration : 1.75;

  function placeEndpoint(out, point) {
    out.copy(point);
    if (groundHeight) out.y = Math.max(out.y, groundHeight(out.x, out.z) + 0.035);
  }

  function aim() {
    direction.subVectors(receiver, sender);
    const distance = direction.length();
    beam.visible = distance > 0.05;
    if (beam.visible) {
      beam.position.copy(sender);
      beam.quaternion.setFromUnitVectors(UP, direction.multiplyScalar(1 / distance));
      beam.scale.set(0.042, distance, 0.042);
      lengthMeters.value = distance;
    }
    endpoints.setMatrixAt(0, placement.makeTranslation(sender.x, sender.y, sender.z));
    endpoints.setMatrixAt(1, placement.makeTranslation(receiver.x, receiver.y, receiver.z));
    endpoints.instanceMatrix.needsUpdate = true;
  }

  function reset() {
    group.visible = false;
    progress.value = 0;
  }

  function start({ origin, destination }) {
    if (!isEndpoint(origin) || !isEndpoint(destination)) return false;
    placeEndpoint(nextSender, origin);
    placeEndpoint(nextReceiver, destination);
    if (nextSender.distanceToSquared(nextReceiver) <= 0.0025) return false;
    sender.copy(nextSender);
    receiver.copy(nextReceiver);
    progress.value = 0;
    group.visible = true;
    aim();
    return true;
  }

  function update(dt, origin) {
    if (!group.visible) return;
    progress.value += dt / total;
    if (progress.value >= 1 - 1e-6) {
      progress.value = 1;
      group.visible = false;
    } else if (isEndpoint(origin)) {
      placeEndpoint(sender, origin);
      aim();
    }
  }

  function inspect() {
    return {
      active: group.visible,
      phase: !group.visible ? (progress.value === 1 ? "complete" : "idle")
        : progress.value < 0.235 ? "aligning" : progress.value < 0.69 ? "transmitting" : "acknowledged",
      progress: progress.value,
      origin: sender.toArray(),
      destination: receiver.toArray(),
    };
  }

  return { start, update, reset, inspect };
}
