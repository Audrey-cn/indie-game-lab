import surfaceMap from "../assets/lunar-earth-color.webp";
import cloudMap from "../assets/lunar-earth-clouds.webp";

// NASA Blue Marble Next Generation (August 2004 surface) and NASA MODIS
// Blue Marble (2002 cloud composite). The offline maps are cropped to the
// longitude range seen from this fictional site, with margin for cloud drift.
const HALF_MAP_LONGITUDE = 103 * Math.PI / 180;
const POSE_ROLL = 11 * Math.PI / 180;
const MAX_CLOUD_DRIFT_RAD = 9.5 * Math.PI / 180;
const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));

function noise(x, y) {
  const value = Math.imul(x + 141, 374761393) ^ Math.imul(y + 73, 668265263);
  return ((Math.imul(value ^ value >>> 13, 1274126177) >>> 8) & 65535) / 65535;
}

function solarDirection(earth, sun) {
  const right = earth.clone().set(-earth.z, 0, earth.x).normalize();
  const north = right.clone().cross(earth).normalize();
  const direction = sun.clone().normalize();
  return { x: direction.dot(right), y: direction.dot(north), z: -direction.dot(earth) };
}

function drawSky(context, width, height, mode, zoom, offsetX, offsetY) {
  context.fillStyle = mode === "ultraviolet" ? "#030509" : "#020409";
  context.fillRect(0, 0, width, height);
  const intensity = mode === "overview" ? 0.82 : 0.57;
  const count = Math.round(clamp(width * height / 8500, 32, 114));
  context.fillStyle = "#b3c5d2";
  for (let index = 0; index < count; index++) {
    const x = ((noise(index, 37) + offsetX / width * 0.09 + 2) % 1) * width;
    const y = ((noise(index, 57) + offsetY / height * 0.09 + 2) % 1) * height;
    const magnitude = noise(index, 165);
    context.globalAlpha = (0.08 + magnitude ** 3 * 0.37) * intensity;
    const size = Math.min(1.2, (0.45 + magnitude * 0.56) * (1 + (zoom - 1) * 0.05));
    context.fillRect(x, y, size, size);
  }
  context.globalAlpha = 1;
}

const VERTEX_SHADER = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUV;
void main() {
  vec2 p = POS[gl_VertexID];
  vUV = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uSurface;
uniform sampler2D uClouds;
uniform int uHasClouds;
uniform int uProjected;
uniform int uMode; // 0 = visible/overview, 1 = ultraviolet
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uRadius;
uniform vec3 uSun;
uniform float uCloudShift;
uniform float uTime;
uniform float uRollCos;
uniform float uRollSin;
uniform float uHalfMapLon;

const float PI = 3.141592653589793;

vec3 toLinear(vec3 c) {
  return pow((c + 0.055) / 1.055, vec3(2.4));
}

vec3 toSRGB(vec3 c) {
  vec3 clamped = clamp(c, 0.0, 1.0);
  vec3 low = 12.92 * clamped;
  vec3 high = 1.055 * pow(clamped, vec3(1.0 / 2.4)) - 0.055;
  return mix(high, low, step(clamped, vec3(0.003131)));
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 pixel = vec2(vUV.x * uResolution.x, (1.0 - vUV.y) * uResolution.y);
  vec2 d = (pixel - uCenter) / max(uRadius, 1.0);
  float u = d.x;
  float v = -d.y;
  float r2 = u * u + v * v;

  if (uMode == 1) {
    float r = sqrt(r2);
    if (r > 1.36) {
      fragColor = vec4(0.0);
      return;
    }
    float n = sqrt(max(0.0, 1.0 - r2));
    float day = u * uSun.x + v * uSun.y + n * uSun.z;
    float disk = 1.0 - smoothstep(0.994, 1.004, r);
    float light = disk * smoothstep(-0.085, 0.76, day);
    float edge = exp(-abs(r - 1.01) * 68.0) * smoothstep(-0.14, 0.51, day);
    float hydrogen = 0.47 * exp(-max(0.0, r - 0.91) * 12.0) * smoothstep(0.74, 1.05, r);
    float geomagLat = v + 0.20 * u - 0.05 * sin(6.0 * u);
    float airglow = exp(-pow(abs(geomagLat) - 0.26, 2.0) * 128.0)
      * disk * smoothstep(0.19, 0.86, r) * (0.68 + 0.32 * cos(7.0 * u - v));
    float arcDist = v + 0.77 - pow(0.21 + u, 2.0) * 0.29 + sin(21.0 * u) * 0.021;
    float oval = exp(-arcDist * arcDist * 290.0) * disk * smoothstep(0.01, 0.62, u + 0.20);
    float grain = (hash21(floor(pixel)) - 0.5) * (5.0 / 255.0);
    vec3 col = vec3(
      (218.0 * light + 149.0 * edge + 44.0 * oval + 11.0 * airglow + 23.0 * hydrogen) / 255.0,
      ((61.0 + 54.0 * r) * light + 94.0 * edge + 82.0 * oval + 83.0 * airglow + 122.0 * hydrogen) / 255.0,
      (28.0 * light + 29.0 * edge + 104.0 * oval + 119.0 * airglow + 207.0 * hydrogen) / 255.0
    ) + grain;
    float alpha = max(max(disk, edge * 0.69), smoothstep(0.005, 0.32, hydrogen));
    fragColor = vec4(clamp(col, 0.0, 1.0) * alpha, alpha);
    return;
  }

  if (r2 > 1.075) {
    fragColor = vec4(0.0);
    return;
  }

  float r = sqrt(r2);
  float diskCoverage = 1.0 - smoothstep(0.997, 1.002, r);
  float n = sqrt(max(0.0, 1.0 - r2));
  float day = u * uSun.x + v * uSun.y + n * uSun.z;
  float atmosphereDay = 0.1 + 0.9 * smoothstep(-0.14, 0.52, day);
  float airPath = exp(-abs(r - 0.9995) * 113.0);
  float glow = airPath * atmosphereDay;
  float airAlpha = glow * (r < 1.0 ? 0.45 : 0.42);
  float alpha = diskCoverage + (1.0 - diskCoverage) * airAlpha;
  if (alpha < 0.001) {
    fragColor = vec4(0.0);
    return;
  }

  float light = 0.018 + 0.98 * pow(max(0.0, day), 0.86);
  float coolHaze = pow(1.0 - n, 2.0) * atmosphereDay * diskCoverage;
  float diskAlpha = diskCoverage / alpha;
  float atmosphereAlpha = (1.0 - diskCoverage) * airAlpha / alpha;

  vec2 mapUV;
  if (uProjected == 1) {
    mapUV = vec2(0.5 + u * 0.447, 0.5 - v * 0.447);
  } else {
    float lon = atan(u * uRollCos - v * uRollSin, n);
    float lat = asin(clamp(u * uRollSin + v * uRollCos, -1.0, 1.0));
    mapUV = vec2(0.5 + lon / (2.0 * uHalfMapLon), 0.5 - lat / PI);
  }

  vec3 surfaceLinear = vec3(0.0);
  float coverage = 0.0;
  if (r < 1.002) {
    vec2 clampedUV = clamp(mapUV, vec2(0.001), vec2(0.999));
    surfaceLinear = toLinear(texture(uSurface, clampedUV).rgb);
    if (uHasClouds == 1) {
      // Latitude-banded trade winds & jet streams + gentle organic curl/diffusion advection.
      float latBand = (mapUV.y - 0.5) * PI * 2.0;
      float wind = 0.62 + 0.38 * cos(latBand) + 0.16 * sin(latBand * 2.0);
      float drift = wind * uCloudShift / (2.0 * uHalfMapLon);
      float swirlPhase = uTime * 0.52;
      vec2 curl = vec2(
        sin(mapUV.y * 16.0 + swirlPhase) * cos(mapUV.x * 11.0 - swirlPhase * 0.7),
        cos(mapUV.x * 14.0 + swirlPhase * 0.85) * sin(mapUV.y * 12.0 + swirlPhase * 0.6)
      ) * 0.0085;
      // Primary cloud deck with noticeable eastward drift + soft curling diffusion.
      vec2 cloudUV1 = clamp(vec2(mapUV.x + drift, mapUV.y) + curl, vec2(0.002), vec2(0.998));
      float baseCloud = texture(uClouds, cloudUV1).r;
      // Secondary high-altitude wispy cirrus veil drifting faster with soft breathing diffusion.
      vec2 cloudUV2 = clamp(
        vec2(mapUV.x + drift * 1.68 + 0.018 * sin(uTime * 0.24), mapUV.y + 0.012 * cos(mapUV.x * 9.0 + swirlPhase)) - curl * 1.45,
        vec2(0.002),
        vec2(0.998)
      );
      float highWisps = texture(uClouds, cloudUV2).r;
      float diffuseBreath = 0.28 + 0.14 * sin(uTime * 0.65 + mapUV.x * 8.0 + mapUV.y * 6.0);
      float cloudBrightness = clamp(mix(baseCloud, max(baseCloud, highWisps * 1.06), diffuseBreath), 0.0, 1.0);
      coverage = smoothstep(0.11, 0.90, cloudBrightness) * 0.91;
    }
  }

  float cloudLight = 0.024 + 0.89 * pow(smoothstep(-0.045, 0.91, day), 0.55);
  float land = light * (1.0 - coverage * 0.32);
  vec3 lit = mix(surfaceLinear * land, vec3(0.92, 0.96, 1.0) * cloudLight, coverage)
    + coolHaze * vec3(0.024, 0.046, 0.088)
    + glow * vec3(0.026, 0.068, 0.168);

  vec3 finalLinear = lit * diskAlpha + vec3(0.055, 0.13, 0.24) * atmosphereAlpha;
  vec3 finalSrgb = toSRGB(finalLinear);
  fragColor = vec4(finalSrgb * alpha, alpha);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Earth optics shader compile failed: ${log}`);
  }
  return shader;
}

function uploadTexture(gl, unit, image) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}

function createGpuOptics({ image, clouds, light }) {
  const started = performance.now();
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true });
  if (!gl) return null;

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  const vao = gl.createVertexArray();
  const surfaceTex = uploadTexture(gl, 0, image);
  const cloudTex = clouds ? uploadTexture(gl, 1, clouds) : null;
  const mapsAreProjected = (image.naturalWidth || image.width) / (image.naturalHeight || image.height) < 1.15;

  const loc = {
    uSurface: gl.getUniformLocation(program, "uSurface"),
    uClouds: gl.getUniformLocation(program, "uClouds"),
    uHasClouds: gl.getUniformLocation(program, "uHasClouds"),
    uProjected: gl.getUniformLocation(program, "uProjected"),
    uMode: gl.getUniformLocation(program, "uMode"),
    uResolution: gl.getUniformLocation(program, "uResolution"),
    uCenter: gl.getUniformLocation(program, "uCenter"),
    uRadius: gl.getUniformLocation(program, "uRadius"),
    uSun: gl.getUniformLocation(program, "uSun"),
    uCloudShift: gl.getUniformLocation(program, "uCloudShift"),
    uTime: gl.getUniformLocation(program, "uTime"),
    uRollCos: gl.getUniformLocation(program, "uRollCos"),
    uRollSin: gl.getUniformLocation(program, "uRollSin"),
    uHalfMapLon: gl.getUniformLocation(program, "uHalfMapLon"),
  };

  gl.useProgram(program);
  gl.uniform1i(loc.uSurface, 0);
  gl.uniform1i(loc.uClouds, 1);
  gl.uniform1i(loc.uHasClouds, cloudTex ? 1 : 0);
  gl.uniform1i(loc.uProjected, mapsAreProjected ? 1 : 0);
  gl.uniform3f(loc.uSun, light.x, light.y, light.z);
  gl.uniform1f(loc.uRollCos, Math.cos(POSE_ROLL));
  gl.uniform1f(loc.uRollSin, Math.sin(POSE_ROLL));
  gl.uniform1f(loc.uHalfMapLon, HALF_MAP_LONGITUDE);

  const prepareMs = performance.now() - started;

  function draw(context, { width, height, mode, zoom = 1, offsetX = 0, offsetY = 0,
    time = 0, reducedMotion = false, stamp = "" }) {
    if (width <= 0 || height <= 0) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const midX = width / 2 + offsetX;
    const midY = height / 2 + offsetY;
    const radius = Math.min(width, height) * zoom * (mode === "overview" ? 0.32 : 1.9 / 9.6);
    const cloudShift = reducedMotion || !cloudTex ? 0 : Math.sin(time * 0.34) * MAX_CLOUD_DRIFT_RAD;

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, surfaceTex);
    if (cloudTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, cloudTex);
    }
    gl.uniform1i(loc.uMode, mode === "ultraviolet" ? 1 : 0);
    gl.uniform2f(loc.uResolution, width, height);
    gl.uniform2f(loc.uCenter, midX, midY);
    gl.uniform1f(loc.uRadius, radius);
    gl.uniform1f(loc.uCloudShift, cloudShift);
    gl.uniform1f(loc.uTime, reducedMotion ? 0 : time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    context.save();
    drawSky(context, width, height, mode, zoom, offsetX, offsetY);
    context.drawImage(canvas, 0, 0);
    if (stamp) {
      const size = clamp(Math.round(width / 65), 8, 14);
      context.font = `${size}px monospace`;
      context.fillStyle = "#aec6c7";
      context.fillText(stamp, size, height - size, width - 2 * size);
    }
    context.restore();
  }

  function dispose() {
    gl.deleteTexture(surfaceTex);
    if (cloudTex) gl.deleteTexture(cloudTex);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    canvas.width = canvas.height = 1;
  }

  return { draw, dispose, backend: "webgl2-shader", prepareMs };
}

export function prepareEarthOptics({ image, clouds, earth, sun }) {
  const light = solarDirection(earth, sun);
  const gpu = createGpuOptics({ image, clouds, light });
  if (gpu) return gpu;
  // Minimal graceful fallback if WebGL2 context creation fails.
  return {
    backend: "canvas-fallback",
    prepareMs: 0,
    draw(context, { width, height, mode, zoom = 1, offsetX = 0, offsetY = 0, stamp = "" }) {
      if (width <= 0 || height <= 0) return;
      context.save();
      drawSky(context, width, height, mode, zoom, offsetX, offsetY);
      const radius = Math.min(width, height) * zoom * (mode === "overview" ? 0.32 : 1.9 / 9.6);
      context.beginPath();
      context.arc(width / 2 + offsetX, height / 2 + offsetY, radius, 0, Math.PI * 2);
      context.clip();
      context.drawImage(image, width / 2 + offsetX - radius, height / 2 + offsetY - radius, radius * 2, radius * 2);
      context.restore();
      if (stamp) {
        const size = clamp(Math.round(width / 65), 8, 14);
        context.font = `${size}px monospace`;
        context.fillStyle = "#aec6c7";
        context.fillText(stamp, size, height - size, width - 2 * size);
      }
    },
    dispose() {},
  };
}

async function loadImage(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

export async function loadEarthOptics({ earth, sun, signal }) {
  const [image, clouds] = await Promise.allSettled([loadImage(surfaceMap), loadImage(cloudMap)]);
  signal?.throwIfAborted();
  if (image.status === "fulfilled") {
    return prepareEarthOptics({ image: image.value, clouds: clouds.value, earth, sun });
  }
  throw new Error("Earth surface map failed to load.");
}
