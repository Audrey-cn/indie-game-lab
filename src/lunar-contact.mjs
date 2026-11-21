import * as THREE from "three";

const PATCH_SIZE = 4.8;
const MAP_SIZE = 192;
const HEIGHT_SPAN = 3.6;
const HEIGHT_BIAS = 0.22;

function makeCasterMaterial(referenceHeight) {
  return new THREE.ShaderMaterial({
    name: "Rover contact coverage and underside height",
    uniforms: {
      referenceHeight,
      heightSpan: { value: HEIGHT_SPAN },
      heightBias: { value: HEIGHT_BIAS },
    },
    vertexShader: `
      varying float worldY;
      void main() {
        vec4 local = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          local = instanceMatrix * local;
        #endif
        vec4 world = modelMatrix * local;
        worldY = world.y;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float referenceHeight;
      uniform float heightSpan;
      uniform float heightBias;
      varying float worldY;
      void main() {
        // Reversed depth retains the underside visible to the ground.
        gl_FragDepth = 1.0 - gl_FragCoord.z;
        float heightCode = (worldY - referenceHeight) / heightSpan + heightBias;
        gl_FragColor = vec4(1.0, clamp(heightCode, 0.0, 1.0), 0.0, 1.0);
      }
    `,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
  });
}

function makeGroundMaterial(texture, referenceHeight) {
  return new THREE.ShaderMaterial({
    name: "Terrain projected rover contact occlusion",
    uniforms: {
      contactMap: { value: texture },
      referenceHeight,
      heightSpan: { value: HEIGHT_SPAN },
      heightBias: { value: HEIGHT_BIAS },
      patchSize: { value: PATCH_SIZE },
    },
    vertexShader: `
      varying vec2 mapUV;
      varying float groundY;
      void main() {
        mapUV = uv;
        groundY = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D contactMap;
      uniform float referenceHeight;
      uniform float heightSpan;
      uniform float heightBias;
      uniform float patchSize;
      varying vec2 mapUV;
      varying float groundY;
      float occlusion(vec2 stepM) {
        vec2 sampleUV = mapUV + stepM / patchSize;
        vec2 edge = abs(sampleUV - 0.5);
        if (max(edge.x, edge.y) > 0.497) return 0.0;
        vec2 coverageHeight = texture2D(contactMap, sampleUV).rg;
        float casterY = (coverageHeight.g - heightBias) * heightSpan + referenceHeight;
        float clearance = max(0.0, casterY - groundY);
        return coverageHeight.r * exp(-clearance * 1.54);
      }
      void main() {
        float core = occlusion(vec2(0.0));
        float nearShade = occlusion(vec2(0.065, 0.024)) + occlusion(vec2(-0.025, 0.067))
          + occlusion(vec2(-0.068, -0.031)) + occlusion(vec2(0.028, -0.060));
        float farShade = occlusion(vec2(0.155, 0.035)) + occlusion(vec2(0.076, 0.139))
          + occlusion(vec2(-0.038, 0.155)) + occlusion(vec2(-0.139, 0.076))
          + occlusion(vec2(-0.149, -0.044)) + occlusion(vec2(-0.071, -0.145))
          + occlusion(vec2(0.049, -0.149)) + occlusion(vec2(0.141, -0.071));
        float shade = 0.19 * core + 0.115 * nearShade + 0.04375 * farShade;
        gl_FragColor = vec4(vec3(0.008, 0.007, 0.006), shade * 0.75);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    toneMapped: false,
  });
}

export function createRoverContactPass(renderer, scene, rover, height) {
  const referenceHeight = { value: 0 };
  const casterMaterial = makeCasterMaterial(referenceHeight);
  const captureScene = new THREE.Scene();
  captureScene.overrideMaterial = casterMaterial;
  const casters = [];
  rover.traverse(object => {
    if (!object.isMesh || !object.castShadow) return;
    // Share meshes' geometry and instanced attributes without a second traversal of the terrain.
    const proxy = object.clone(false);
    proxy.matrixWorldAutoUpdate = false;
    proxy.layers.set(0);
    if (object.isInstancedMesh) proxy.instanceMatrix = object.instanceMatrix;
    captureScene.add(proxy);
    casters.push({ object, proxy });
  });

  const target = new THREE.WebGLRenderTarget(MAP_SIZE, MAP_SIZE, {
    depthBuffer: true, stencilBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  });
  target.texture.name = "Rover contact layer";
  const captureCamera = new THREE.OrthographicCamera(
    -PATCH_SIZE / 2, PATCH_SIZE / 2, PATCH_SIZE / 2, -PATCH_SIZE / 2, 0.1, 6,
  );
  captureCamera.up.set(0, 0, -1);
  const groundMaterial = makeGroundMaterial(target.texture, referenceHeight);
  const patchGeometry = new THREE.PlaneGeometry(PATCH_SIZE, PATCH_SIZE, 24, 24);
  patchGeometry.rotateX(-Math.PI / 2);
  const vertices = patchGeometry.attributes.position;
  vertices.setUsage(THREE.DynamicDrawUsage);
  const original = vertices.array.slice();
  const patch = new THREE.Mesh(patchGeometry, groundMaterial);
  patch.name = "Rover contact layer receiver";
  patch.frustumCulled = false;
  patch.renderOrder = 1;
  patch.visible = false;
  scene.add(patch);

  const savedClearColor = new THREE.Color();
  let previousX = NaN;
  let previousZ = NaN;
  let ready = false;
  function invalidate() { ready = false; }
  renderer.domElement.addEventListener("webglcontextrestored", invalidate);

  function updateReceiver(x, z) {
    if (x === previousX && z === previousZ) return;
    previousX = x;
    previousZ = z;
    for (let index = 0; index < vertices.count; index++) {
      const px = original[index * 3] + x, pz = original[index * 3 + 2] + z;
      vertices.setXYZ(index, px, height(px, pz) + 0.016, pz);
    }
    vertices.needsUpdate = true;
  }

  function render(x, z) {
    if (!casters.length) return;
    let changed = !ready || x !== previousX || z !== previousZ;
    rover.updateWorldMatrix(true, true);
    for (const caster of casters) {
      const { object, proxy } = caster;
      let visible = true;
      for (let ancestor = object; ancestor && visible; ancestor = ancestor.parent) visible = ancestor.visible;
      if (proxy.visible !== visible) changed = true;
      proxy.visible = visible;
      if (!visible) continue;
      const positionVersion = object.geometry.attributes.position.version;
      const indexVersion = object.geometry.index?.version;
      const instanceVersion = object.instanceMatrix?.version;
      if (!changed) changed = !proxy.matrixWorld.equals(object.matrixWorld) || proxy.geometry !== object.geometry
        || proxy.material !== object.material || caster.positionVersion !== positionVersion || caster.indexVersion !== indexVersion
        || object.isInstancedMesh && (proxy.instanceMatrix !== object.instanceMatrix || proxy.count !== object.count
          || caster.instanceVersion !== instanceVersion);
      proxy.matrixWorld.copy(object.matrixWorld);
      proxy.geometry = object.geometry;
      proxy.material = object.material;
      caster.positionVersion = positionVersion;
      caster.indexVersion = indexVersion;
      if (object.isInstancedMesh) {
        proxy.instanceMatrix = object.instanceMatrix;
        proxy.count = object.count;
        caster.instanceVersion = instanceVersion;
      }
    }
    if (!changed) return;

    const base = height(x, z);
    referenceHeight.value = base;
    captureCamera.position.set(x, base + 4.15, z);
    captureCamera.lookAt(x, base, z);
    updateReceiver(x, z);

    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousMipmap = renderer.getActiveMipmapLevel();
    const previousAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    const previousShadows = renderer.shadowMap.enabled;
    const previousXR = renderer.xr.enabled;
    renderer.getClearColor(savedClearColor);
    try {
      renderer.xr.enabled = false;
      renderer.shadowMap.enabled = false;
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(captureScene, captureCamera);
      ready = true;
      patch.visible = true;
    } finally {
      renderer.xr.enabled = previousXR;
      renderer.shadowMap.enabled = previousShadows;
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(savedClearColor, previousAlpha);
      renderer.setRenderTarget(previousTarget, previousFace, previousMipmap);
    }
  }

  function dispose() {
    renderer.domElement.removeEventListener("webglcontextrestored", invalidate);
    captureScene.clear();
    patch.removeFromParent();
    patchGeometry.dispose();
    groundMaterial.dispose();
    casterMaterial.dispose();
    target.dispose();
  }

  return { render, dispose, target, get ready() { return ready; }, casterCount: casters.length };
}
