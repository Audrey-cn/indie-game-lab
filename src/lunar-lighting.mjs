import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

const directionalShadow = /* glsl */ `
#if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_BASIC ) && NUM_DIR_LIGHT_SHADOWS > 0
  float lunarDepth( sampler2D depthMap, vec2 uv ) {
    return texture2D( depthMap, uv ).r;
  }

  void lunarFindBlocker( sampler2D depthMap, vec2 uv, float receiver,
    inout float totalDepth, inout float count ) {
    float depth = lunarDepth( depthMap, uv );
    if ( receiver - depth > 0.0006 ) {
      totalDepth += depth;
      count += 1.0;
    }
  }

  float lunarCompareDepth( sampler2D depthMap, vec2 uv, float receiver ) {
    return step( receiver, lunarDepth( depthMap, uv ) );
  }

  float lunarBilinearShadow( sampler2D depthMap, vec2 uv, float receiver, vec2 dimensions, vec2 texel ) {
    vec2 grid = uv * dimensions - 0.5;
    vec2 weight = fract( grid );
    vec2 corner = ( floor( grid ) + 0.5 ) * texel;
    float low = mix( lunarCompareDepth( depthMap, corner, receiver ),
      lunarCompareDepth( depthMap, corner + vec2( texel.x, 0.0 ), receiver ), weight.x );
    float high = mix( lunarCompareDepth( depthMap, corner + vec2( 0.0, texel.y ), receiver ),
      lunarCompareDepth( depthMap, corner + texel, receiver ), weight.x );
    return mix( low, high, weight.y );
  }

  float lunarGetDirectionalShadow( sampler2D depthMap, vec2 dimensions, float intensity,
    float bias, float sourceSize, vec4 coord ) {
    if ( sourceSize <= 10.0 ) return getShadow( depthMap, dimensions, intensity, bias, sourceSize, coord );
    vec3 shadow = coord.xyz / coord.w;
    if ( shadow.z > 1.0 || any( lessThan( shadow.xy, vec2( 0.0 ) ) )
      || any( greaterThan( shadow.xy, vec2( 1.0 ) ) ) ) return 1.0;

    float receiver = shadow.z + bias;
    vec2 texel = 1.0 / dimensions;
    // Orthographic shadow depth is linear in distance from the sun camera.
    // Search within the projected maximum angular radius and measure the blocker gap.
    vec2 span = texel * clamp( sourceSize * 0.090, 2.5, 7.0 );
    float depthSum = 0.0;
    float blockers = 0.0;
    lunarFindBlocker( depthMap, shadow.xy, receiver, depthSum, blockers );
    lunarFindBlocker( depthMap, shadow.xy + span * vec2( 0.993, 0.117 ), receiver, depthSum, blockers );
    lunarFindBlocker( depthMap, shadow.xy + span * vec2( -0.993, -0.117 ), receiver, depthSum, blockers );
    lunarFindBlocker( depthMap, shadow.xy + span * vec2( 0.177, -0.984 ), receiver, depthSum, blockers );
    lunarFindBlocker( depthMap, shadow.xy + span * vec2( -0.177, 0.984 ), receiver, depthSum, blockers );
    if ( blockers < 0.5 ) return 1.0;

    float gap = receiver - depthSum / blockers;
    float penumbra = clamp( gap * sourceSize, 0.55, 8.0 );
    if ( blockers > 4.5 && penumbra < 1.15 ) return 1.0 - intensity;
    float base = lunarBilinearShadow( depthMap, shadow.xy, receiver, dimensions, texel );
    if ( penumbra < 1.15 ) return mix( 1.0, base, intensity );

    vec2 radius = texel * penumbra;
    float edge = (
      lunarCompareDepth( depthMap, shadow.xy + radius * vec2( -0.928, -0.265 ), receiver ) +
      lunarCompareDepth( depthMap, shadow.xy + radius * vec2( -0.665, 0.687 ), receiver ) +
      lunarCompareDepth( depthMap, shadow.xy + radius * vec2( 0.218, 0.934 ), receiver ) +
      lunarCompareDepth( depthMap, shadow.xy + radius * vec2( 0.874, 0.406 ), receiver ) +
      lunarCompareDepth( depthMap, shadow.xy + radius * vec2( 0.740, -0.613 ), receiver ) +
      lunarCompareDepth( depthMap, shadow.xy + radius * vec2( -0.345, -0.888 ), receiver )
    ) / 6.0;
    return mix( 1.0, mix( base, edge, 0.78 * smoothstep( 1.15, 3.6, penumbra ) ), intensity );
  }
#endif
`;

const bounceUniforms = {
  lunarBounceCenter: { value: [new THREE.Vector4(), new THREE.Vector4()] },
  lunarBounceNormal: { value: [new THREE.Vector4(), new THREE.Vector4()] },
  lunarBounceTint: { value: [new THREE.Vector3(), new THREE.Vector3()] },
};

const bounceDeclaration = /* glsl */ `
#if defined( STANDARD )
  uniform vec4 lunarBounceCenter[ 2 ];
  uniform vec4 lunarBounceNormal[ 2 ];
  uniform vec3 lunarBounceTint[ 2 ];

  vec3 lunarLocalBounce( vec3 point, vec3 normal, vec4 source, vec4 orientation, vec3 color ) {
    vec3 offset = source.xyz - point;
    float distance2 = dot( offset, offset );
    if ( source.w <= 0.0 || distance2 >= source.w ) return vec3( 0.0 );
    vec3 direction = offset * inversesqrt( max( distance2, 0.0001 ) );
    float emission = smoothstep( -0.13, 0.73, dot( -direction, orientation.xyz ) );
    float facing = smoothstep( -0.19, 0.88, dot( normal, direction ) );
    float range = 1.0 - smoothstep( 0.18, 1.0, distance2 / source.w );
    float falloff = orientation.w / ( orientation.w + distance2 );
    return color * ( facing * emission * range * falloff );
  }
#endif
`;

const bounceDiffuse = /* glsl */ `
#if defined( STANDARD ) && defined( RE_IndirectDiffuse )
  irradiance += lunarLocalBounce( geometryPosition, geometryNormal,
    lunarBounceCenter[ 0 ], lunarBounceNormal[ 0 ], lunarBounceTint[ 0 ] );
  irradiance += lunarLocalBounce( geometryPosition, geometryNormal,
    lunarBounceCenter[ 1 ], lunarBounceNormal[ 1 ], lunarBounceTint[ 1 ] );
#endif
`;

let shadowHookMounted = false;
function installDirectionalShadow(renderer) {
  const chunks = THREE.ShaderChunk;
  if (renderer.capabilities.reversedDepthBuffer) return false;
  if (!shadowHookMounted) {
    const hook = "getShadow( directionalShadowMap[ i ]";
    if (!chunks.lights_fragment_begin.includes(hook)
      || !chunks.shadowmap_pars_fragment.includes("getShadow( sampler2D shadowMap")) {
      console.warn(`[lunar-lighting] Directional shadow anchor not found in Three.js r${THREE.REVISION}; falling back to PCFShadowMap.`);
      return false;
    }
    chunks.lights_fragment_begin = chunks.lights_fragment_begin
      .replace(hook, "LUNAR_DIRECTIONAL_SHADOW( directionalShadowMap[ i ]");
    chunks.shadowmap_pars_fragment += directionalShadow + /* glsl */ `
      #if defined( SHADOWMAP_TYPE_BASIC )
        #define LUNAR_DIRECTIONAL_SHADOW lunarGetDirectionalShadow
      #else
        #define LUNAR_DIRECTIONAL_SHADOW getShadow
      #endif
    `;
    shadowHookMounted = true;
  }
  // Three's PCF comparison sampler cannot expose raw blocker depths.
  renderer.shadowMap.type = THREE.BasicShadowMap;
  return true;
}

let bounceHookMounted = false;
function installBounce() {
  if (bounceHookMounted) return;
  THREE.ShaderChunk.lights_pars_begin += bounceDeclaration;
  THREE.ShaderChunk.lights_fragment_maps += bounceDiffuse;
  // Three clones these arrays shallowly for each physical material.
  for (const shader of [THREE.ShaderLib.standard, THREE.ShaderLib.physical]) {
    Object.assign(shader.uniforms, bounceUniforms);
  }
  bounceHookMounted = true;
}

function createBounce(camera) {
  let sources = null;
  let benchIntensity = 0.46;
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const tint = new THREE.Color();
  const rotation = new THREE.Quaternion();

  function writeSource(index, radius, softArea, color, strength) {
    point.applyMatrix4(camera.matrixWorldInverse);
    normal.transformDirection(camera.matrixWorldInverse);
    bounceUniforms.lunarBounceCenter.value[index].set(point.x, point.y, point.z, radius * radius);
    bounceUniforms.lunarBounceNormal.value[index].set(normal.x, normal.y, normal.z, softArea);
    tint.setHex(color).multiplyScalar(strength);
    bounceUniforms.lunarBounceTint.value[index].set(tint.r, tint.g, tint.b);
  }

  return {
    setBounceSources(config) {
      installBounce();
      sources = config;
    },
    setWorkshopBounce({ near = false, active = false } = {}) {
      benchIntensity = active ? 1.0 : near ? 0.74 : 0.46;
    },
    update() {
      if (!sources) {
        if (bounceHookMounted) {
          for (const center of bounceUniforms.lunarBounceCenter.value) center.w = 0;
        }
        return;
      }
      camera.updateMatrixWorld();
      const { height, rover, workshop } = sources;
      rover.getWorldPosition(point);
      point.y = height(point.x, point.z) - 0.075;
      normal.set(0, 1, 0);
      writeSource(0, 3.1, 0.65, 0xc5a787, 0.35);

      point.set(1.046, 1.25, 1.225);
      workshop.localToWorld(point);
      workshop.getWorldQuaternion(rotation);
      normal.set(0, 0.24, 1).normalize().applyQuaternion(rotation);
      writeSource(1, 1.82, 0.17, 0x81ddd3, 0.58 * benchIntensity);
    },
  };
}

const screenVertex = /* glsl */ `
  varying vec2 screenUV;
  void main() {
    screenUV = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const occlusionFragment = /* glsl */ `
  varying vec2 screenUV;
  uniform sampler2D sceneDepth;
  uniform mat4 inverseProjection;
  uniform vec2 frameSize;
  uniform vec2 projectionScale;

  vec3 viewPoint(vec2 uv, float depth) {
    vec4 point = inverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return point.xyz / point.w;
  }

  vec3 neighbour(vec2 uv, vec3 fallback) {
    float depth = texture2D(sceneDepth, uv).r;
    return depth < 0.999999 ? viewPoint(uv, depth) : fallback;
  }

  void main() {
    float depth = texture2D(sceneDepth, screenUV).r;
    if (depth >= 0.999999) {
      gl_FragColor = vec4(1.0);
      return;
    }
    vec3 center = viewPoint(screenUV, depth);
    if (center.z <= -34.0) {
      gl_FragColor = vec4(1.0);
      return;
    }
    vec2 pixel = 1.0 / frameSize;
    vec3 x1 = neighbour(screenUV + vec2(pixel.x, 0.0), center) - center;
    vec3 x2 = center - neighbour(screenUV - vec2(pixel.x, 0.0), center);
    vec3 y1 = neighbour(screenUV + vec2(0.0, pixel.y), center) - center;
    vec3 y2 = center - neighbour(screenUV - vec2(0.0, pixel.y), center);
    vec3 dx = abs(x1.z) < abs(x2.z) && dot(x1, x1) > 0.00000001 ? x1 : x2;
    vec3 dy = abs(y1.z) < abs(y2.z) && dot(y1, y1) > 0.00000001 ? y1 : y2;
    vec3 crossProduct = cross(dx, dy);
    float normalLength = length(crossProduct);
    vec3 normal = normalLength > 0.00000001 ? crossProduct / normalLength : vec3(0.0, 0.0, 1.0);

    float radius = 0.43;
    vec2 stride = min(radius * projectionScale * 0.5 / max(0.6, -center.z), 70.0 * pixel);
    float rotation = 6.283185 * fract(sin(dot(floor(gl_FragCoord.xy / 2.0), vec2(12.9898,78.233))) * 43758.5453);
    float shade = 0.0;
    for (int index = 0; index < 12; index++) {
      float angle = float(index) * 2.399963 + rotation;
      float distanceScale = sqrt((float(index) + 0.55) / 12.0);
      vec2 uv = screenUV + vec2(cos(angle), sin(angle)) * stride * distanceScale;
      if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) continue;
      float sampleDepth = texture2D(sceneDepth, uv).r;
      if (sampleDepth >= 0.999999) continue;
      vec3 delta = viewPoint(uv, sampleDepth) - center;
      float distanceToSample = length(delta);
      if (distanceToSample < 0.023 || distanceToSample > radius) continue;
      float facing = max(dot(normal, delta / distanceToSample) - 0.11, 0.0);
      shade += facing * (1.0 - smoothstep(0.06, radius, distanceToSample));
    }
    float distanceFade = 1.0 - smoothstep(19.0, 34.0, -center.z);
    float visibility = 1.0 - min(0.61, shade * 0.26) * distanceFade;
    gl_FragColor = vec4(visibility, visibility, visibility, 1.0);
  }
`;

const bloomExtractFragment = /* glsl */ `
  varying vec2 screenUV;
  uniform sampler2D beauty;
  uniform sampler2D sceneDepth;
  uniform vec2 texelSize;
  uniform float threshold;

  vec3 sampleBright(vec2 uv) {
    float depth = texture2D(sceneDepth, uv).r;
    if (depth >= 0.999999) return vec3(0.0);
    vec3 color = max(texture2D(beauty, uv).rgb, vec3(0.0));
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float knee = threshold * 0.45;
    float soft = clamp(luma - threshold + knee, 0.0, 2.0 * knee);
    soft = (soft * soft) / max(4.0 * knee, 0.0001);
    float contribution = max(luma - threshold, soft) / max(luma, 0.0001);
    return min(color * contribution, vec3(6.0));
  }

  void main() {
    vec3 sum = sampleBright(screenUV) * 0.28;
    sum += sampleBright(screenUV + vec2(texelSize.x, texelSize.y)) * 0.18;
    sum += sampleBright(screenUV + vec2(-texelSize.x, texelSize.y)) * 0.18;
    sum += sampleBright(screenUV + vec2(texelSize.x, -texelSize.y)) * 0.18;
    sum += sampleBright(screenUV + vec2(-texelSize.x, -texelSize.y)) * 0.18;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const bloomBlurFragment = /* glsl */ `
  varying vec2 screenUV;
  uniform sampler2D source;
  uniform vec2 stepUV;

  void main() {
    vec3 sum = texture2D(source, screenUV).rgb * 0.227027;
    sum += texture2D(source, screenUV + stepUV * 1.384615).rgb * 0.316216;
    sum += texture2D(source, screenUV - stepUV * 1.384615).rgb * 0.316216;
    sum += texture2D(source, screenUV + stepUV * 3.230769).rgb * 0.070270;
    sum += texture2D(source, screenUV - stepUV * 3.230769).rgb * 0.070270;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const outputFragment = /* glsl */ `
  varying vec2 screenUV;
  uniform sampler2D beauty;
  uniform sampler2D sceneDepth;
  uniform sampler2D occlusion;
  uniform sampler2D bloomMap;
  uniform vec2 occlusionSize;
  uniform vec2 nearFar;
  uniform float bloomStrength;
  uniform float aoEnabled;
  uniform int debugView; // 0=final, 1=ssao, 2=bloom, 3=no-post, 4=depth

  float eyeDepth(float depth) {
    return nearFar.x * nearFar.y / max(0.00001, nearFar.y + depth * (nearFar.x - nearFar.y));
  }

  void includeShade(vec2 uv, float center, float weight, inout float sum, inout float total) {
    float other = eyeDepth(texture2D(sceneDepth, uv).r);
    float edge = exp(-abs(other - center) / (0.045 + center * 0.012));
    sum += texture2D(occlusion, uv).r * edge * weight;
    total += edge * weight;
  }

  void main() {
    vec3 color = texture2D(beauty, screenUV).rgb;
    float depth = texture2D(sceneDepth, screenUV).r;
    bool sky = depth >= 0.999999;
    float ao = 1.0;
    if (!sky && aoEnabled > 0.5 && debugView != 3) {
      float center = eyeDepth(depth);
      vec2 pixel = 1.0 / occlusionSize;
      float sum = texture2D(occlusion, screenUV).r * 2.4;
      float total = 2.4;
      includeShade(screenUV + vec2(pixel.x, 0.0), center, 1.0, sum, total);
      includeShade(screenUV - vec2(pixel.x, 0.0), center, 1.0, sum, total);
      includeShade(screenUV + vec2(0.0, pixel.y), center, 1.0, sum, total);
      includeShade(screenUV - vec2(0.0, pixel.y), center, 1.0, sum, total);
      ao = sum / max(total, 0.001);
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      // A visible sunlit surface mostly keeps its direct term. Crevices in
      // shade lose a larger fraction of their available indirect light.
      float contactStrength = mix(0.87, 0.43, smoothstep(0.045, 0.46, luminance));
      color *= mix(1.0, ao, contactStrength);
    }
    if (debugView == 1) {
      float vis = sky ? 0.06 : pow(clamp(ao, 0.0, 1.0), 2.1);
      gl_FragColor = vec4(vec3(vis), 1.0);
      return;
    }
    if (debugView == 4) {
      float d = sky ? 1.0 : clamp(eyeDepth(depth) / 42.0, 0.0, 1.0);
      gl_FragColor = vec4(vec3(1.0 - pow(d, 0.65)), 1.0);
      return;
    }
    vec3 bloom = bloomStrength > 0.001 && debugView != 3 ? texture2D(bloomMap, screenUV).rgb : vec3(0.0);
    if (debugView == 2) {
      gl_FragColor = vec4(bloom * 1.4, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }
    color += bloom * bloomStrength;
    gl_FragColor = vec4(color, 1.0);
    if (!sky) {
      #include <tonemapping_fragment>
    }
    #include <colorspace_fragment>
  }
`;

export function createLunarLighting(renderer, scene, camera, { mobile = false } = {}) {
  const bounce = createBounce(camera);
  let softShadows = false;
  let sunShadow;
  let bloomEnabled = !mobile;
  let aoEnabled = true;
  let debugMode = "final";
  const debugMap = { final: 0, ssao: 1, bloom: 2, "no-post": 3, depth: 4 };

  function setSun(light, { angularRadius = 0.024 } = {}) {
    const { camera: shadowCamera, mapSize } = light.shadow;
    softShadows = !mobile && light.isDirectionalLight === true && installDirectionalShadow(renderer);
    if (light.isDirectionalLight) sunShadow = light.shadow;
    light.shadow.radius = softShadows
      ? (shadowCamera.far - shadowCamera.near) * angularRadius * mapSize.x / (shadowCamera.right - shadowCamera.left)
      : 1.32;
  }
  const effects = {
    setSun,
    setBounceSources: bounce.setBounceSources,
    setWorkshopBounce: bounce.setWorkshopBounce,
    setBloomEnabled(value) { bloomEnabled = Boolean(value); },
    setAoEnabled(value) { aoEnabled = Boolean(value); },
    setDebugMode(mode) { debugMode = mode in debugMap ? mode : "final"; },
    getDebugMode() { return debugMode; },
    get bloomEnabled() { return bloomEnabled; },
    get aoEnabled() { return aoEnabled; },
  };
  function renderScene() {
    renderer.render(scene, camera);
    const map = sunShadow?.map;
    if (renderer.shadowMap.enabled && map?.depthTexture && map.texture.format === THREE.RGBAFormat) {
      // Basic and PCF sample depth. Keep the framebuffer color attachment at one byte per texel.
      map.dispose();
      map.texture.format = THREE.RedFormat;
      renderer.shadowMap.needsUpdate = true;
    }
  }
  if (!renderer.extensions.has("EXT_color_buffer_float")) {
    return { ...effects, get softShadows() { return softShadows; }, enabled: false,
      render() {
        bounce.update();
        renderScene();
        return renderer.info.render.calls;
      },
    };
  }
  const gl = renderer.getContext();
  const supported = mobile ? [] : gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES);
  let occlusionScale = mobile ? 0.36 : 0.50;
  const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  depth.minFilter = depth.magFilter = THREE.NearestFilter;
  const beauty = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, samples: Array.from(supported ?? []).some(value => value >= 2) ? 2 : 0,
    depthTexture: depth, depthBuffer: true,
  });
  const occlusion = new THREE.WebGLRenderTarget(1, 1, { format: THREE.RedFormat, depthBuffer: false });
  const bloomOptions = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  const bloomA = new THREE.WebGLRenderTarget(1, 1, bloomOptions);
  const bloomB = new THREE.WebGLRenderTarget(1, 1, bloomOptions);
  const frameSize = new THREE.Vector2(1, 1);
  const currentSize = new THREE.Vector2();
  const occlusionSize = new THREE.Vector2(1, 1);
  const bloomSize = new THREE.Vector2(1, 1);
  let forceResize = false;

  const occlusionPass = new FullScreenQuad(new THREE.ShaderMaterial({
    name: "Depth-reconstructed ambient occlusion",
    vertexShader: screenVertex, fragmentShader: occlusionFragment,
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: {
      sceneDepth: { value: depth }, inverseProjection: { value: camera.projectionMatrixInverse },
      frameSize: { value: frameSize }, projectionScale: { value: new THREE.Vector2() },
    },
  }));
  const bloomExtractPass = new FullScreenQuad(new THREE.ShaderMaterial({
    name: "HDR selective bloom extract",
    vertexShader: screenVertex, fragmentShader: bloomExtractFragment,
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: {
      beauty: { value: beauty.texture }, sceneDepth: { value: depth },
      texelSize: { value: new THREE.Vector2(1, 1) }, threshold: { value: 1.08 },
    },
  }));
  const bloomBlurPass = new FullScreenQuad(new THREE.ShaderMaterial({
    name: "Separable HDR bloom blur",
    vertexShader: screenVertex, fragmentShader: bloomBlurFragment,
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { source: { value: bloomA.texture }, stepUV: { value: new THREE.Vector2() } },
  }));
  const outputPass = new FullScreenQuad(new THREE.ShaderMaterial({
    name: "Depth-aware AO + HDR Bloom composite and AgX output",
    vertexShader: screenVertex, fragmentShader: outputFragment,
    depthTest: false, depthWrite: false,
    uniforms: {
      beauty: { value: beauty.texture }, sceneDepth: { value: depth }, occlusion: { value: occlusion.texture },
      bloomMap: { value: bloomA.texture }, occlusionSize: { value: occlusionSize },
      nearFar: { value: new THREE.Vector2(camera.near, camera.far) },
      bloomStrength: { value: 0.34 }, aoEnabled: { value: 1 }, debugView: { value: 0 },
    },
  }));

  function setOcclusionScale(scale) {
    const next = THREE.MathUtils.clamp(scale, 0.25, 0.75);
    if (Math.abs(next - occlusionScale) > 0.005) {
      occlusionScale = next;
      forceResize = true;
    }
  }

  let lastSceneTriangles = 0;
  let lastSceneCalls = 0;
  function render() {
    bounce.update();
    renderer.getDrawingBufferSize(currentSize);
    if (forceResize || !currentSize.equals(frameSize)) {
      forceResize = false;
      frameSize.copy(currentSize);
      const width = Math.max(1, Math.round(frameSize.x * occlusionScale));
      const height = Math.max(1, Math.round(frameSize.y * occlusionScale));
      occlusionSize.set(width, height);
      const bw = Math.max(1, Math.round(frameSize.x * 0.25));
      const bh = Math.max(1, Math.round(frameSize.y * 0.25));
      bloomSize.set(bw, bh);
      beauty.setSize(frameSize.x, frameSize.y);
      occlusion.setSize(width, height);
      bloomA.setSize(bw, bh);
      bloomB.setSize(bw, bh);
      bloomExtractPass.material.uniforms.texelSize.value.set(1 / frameSize.x, 1 / frameSize.y);
    }
    const projection = camera.projectionMatrix.elements;
    occlusionPass.material.uniforms.projectionScale.value.set(projection[0], projection[5]);
    renderer.setRenderTarget(beauty);
    renderScene();
    lastSceneCalls = renderer.info.render.calls;
    lastSceneTriangles = renderer.info.render.triangles;
    let totalCalls = lastSceneCalls;

    const viewCode = debugMap[debugMode] ?? 0;
    const runAo = aoEnabled && viewCode !== 3 && viewCode !== 2 && viewCode !== 4;
    if (runAo) {
      renderer.setRenderTarget(occlusion);
      occlusionPass.render(renderer);
      totalCalls += 1;
    }

    const runBloom = (bloomEnabled || viewCode === 2) && viewCode !== 3 && viewCode !== 1 && viewCode !== 4;
    if (runBloom) {
      renderer.setRenderTarget(bloomA);
      bloomExtractPass.render(renderer);
      bloomBlurPass.material.uniforms.source.value = bloomA.texture;
      bloomBlurPass.material.uniforms.stepUV.value.set(0, 1.35 / bloomSize.y);
      renderer.setRenderTarget(bloomB);
      bloomBlurPass.render(renderer);
      bloomBlurPass.material.uniforms.source.value = bloomB.texture;
      bloomBlurPass.material.uniforms.stepUV.value.set(1.35 / bloomSize.x, 0);
      renderer.setRenderTarget(bloomA);
      bloomBlurPass.render(renderer);
      totalCalls += 3;
    }

    outputPass.material.uniforms.bloomStrength.value = runBloom ? 0.34 : 0;
    outputPass.material.uniforms.aoEnabled.value = runAo ? 1 : 0;
    outputPass.material.uniforms.debugView.value = viewCode;
    renderer.setRenderTarget(null);
    outputPass.render(renderer);
    return totalCalls + 1;
  }

  return { ...effects, setOcclusionScale, get softShadows() { return softShadows; },
    get lastSceneTriangles() { return lastSceneTriangles; }, get lastSceneCalls() { return lastSceneCalls; }, render, enabled: true };
}
