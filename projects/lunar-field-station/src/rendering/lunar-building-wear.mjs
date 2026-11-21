import * as THREE from "three";

let weatherTile;

export function buildingWearTile() {
  if (weatherTile) return weatherTile;
  const size = 256;
  function hash(x, y, salt) {
    let value = Math.imul(x + salt * 43, 0x5f356495) ^ Math.imul(y + salt * 73, 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  }
  function noise(u, v, cells, salt) {
    const x = Math.floor(u * cells), y = Math.floor(v * cells);
    const dx = u * cells - x, dy = v * cells - y;
    const sx = dx * dx * (3 - 2 * dx), sy = dy * dy * (3 - 2 * dy);
    const wrap = cells - 1;
    const a = hash(x & wrap, y & wrap, salt), b = hash((x + 1) & wrap, y & wrap, salt);
    const c = hash(x & wrap, (y + 1) & wrap, salt), d = hash((x + 1) & wrap, (y + 1) & wrap, salt);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, sx), THREE.MathUtils.lerp(c, d, sx), sy);
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const grain = hash(x, y, 14), pores = noise(u, v, 64, 38);
      const broad = noise(u, v, 8, 21);
      const patches = noise(u + 0.13 * broad, v - 0.1 * broad, 16, 27);
      const chips = noise(u, v, 32, 43) * 0.72 + pores * 0.28;
      const scrape = noise(u + 2.0 * v, v * 2.0, 32, 89);
      const wrinkles = Math.sin(Math.PI * 2 * (u * 24 + v * 7) + 13 * patches);
      const i = (y * size + x) * 4;
      data[i] = Math.round(255 * (0.48 * grain + 0.52 * pores));
      data[i + 1] = Math.round(255 * (0.52 * broad + 0.48 * patches));
      data[i + 2] = Math.round(255 * chips);
      data[i + 3] = Math.round(255 * (0.48 * (0.5 + 0.5 * wrinkles) + 0.52 * scrape));
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  weatherTile = texture;
  return weatherTile;
}

// Reuse the packed tile for pigment, roughness and relief. Geometry supplies
// height above grade, face direction and the handled edges of each piece.
export function addBuildingWear(material, tile, profile, dustReach) {
  material.onBeforeCompile = shader => {
    shader.uniforms.buildingWearTile = { value: tile };
    shader.uniforms.buildingWearProfile = { value: new THREE.Vector4(...profile) };
    shader.uniforms.buildingDustReach = { value: dustReach };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", /* glsl */ `
      #include <common>
      attribute vec4 equipmentFinish;
      varying vec4 buildingFinish;
      varying vec2 buildingUV;
      varying vec4 buildingSurface;
    `).replace("#include <begin_vertex>", /* glsl */ `
      #include <begin_vertex>
      buildingFinish = equipmentFinish;
      buildingUV = uv;
      buildingSurface = vec4(position, normal.y);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", /* glsl */ `
      #include <common>
      uniform sampler2D buildingWearTile;
      uniform vec4 buildingWearProfile;
      uniform float buildingDustReach;
      varying vec4 buildingFinish;
      varying vec2 buildingUV;
      varying vec4 buildingSurface;
    `).replace("#include <color_fragment>", /* glsl */ `
      #include <color_fragment>
      vec2 seeds = buildingFinish.y * vec2(1.0, 0.618);
      vec4 microWear = texture2D(buildingWearTile, buildingUV * vec2(2.40, 1.72) + seeds);
      vec4 broadWear = texture2D(buildingWearTile, buildingUV * vec2(0.79, 0.57) + 0.4 * seeds);
      vec2 surfacePosition = vec2(buildingSurface.x + 0.47 * buildingSurface.z,
        buildingSurface.y + 0.62 * buildingSurface.z);
      vec4 coating = texture2D(buildingWearTile, surfacePosition * (0.48 / buildingDustReach));
      vec2 nearestEdge = min(buildingUV, 1.0 - buildingUV);
      float edgeDistance = buildingFinish.z > 0.5 ? nearestEdge.y : min(nearestEdge.x, nearestEdge.y);
      float lip = 1.0 - smoothstep(0.012, 0.105, edgeDistance);
      float chipNoise = 0.74 * microWear.b + 0.26 * broadWear.b;
      float chippedEdge = lip * smoothstep(0.48, 0.76, chipNoise);
      float rubbed = buildingFinish.w * smoothstep(0.42, 0.72, broadWear.b) * smoothstep(0.29, 0.71, microWear.a);
      float primer = buildingWearProfile.y * clamp(1.45 * (chippedEdge + rubbed), 0.0, 1.0);
      float bareMetal = primer * smoothstep(0.50, 0.76, 0.74 * chipNoise + 0.26 * microWear.a);
      float seam = (1.0 - smoothstep(0.002, 0.035, edgeDistance)) * (1.0 - 0.72 * primer);
      float grain = mix(microWear.r, microWear.a, buildingWearProfile.w);

      float deposition = smoothstep(0.34, 0.75, 0.55 * coating.g + 0.32 * broadWear.g + 0.13 * microWear.r);
      float heightFromGrade = buildingFinish.x / buildingDustReach + 0.30 * (coating.g - 0.5);
      float groundDust = 1.0 - smoothstep(0.07, 0.83, heightFromGrade);
      // Terrain Seam Blending: smoothly fuse the lowest 24cm of struts/bases into lunar regolith.
      float terrainSeam = 1.0 - smoothstep(0.0, 0.24, buildingFinish.x + 0.05 * (coating.g - 0.5));
      float ledge = smoothstep(0.18, 0.94, buildingSurface.w);
      float lowerShell = 1.0 - smoothstep(-0.91, 0.06, buildingSurface.w);
      float dust = groundDust * (0.10 + 0.60 * deposition + 0.22 * ledge + 0.10 * lowerShell);
      dust += seam * (0.09 + 0.16 * deposition) * (1.0 - 0.50 * buildingFinish.w);
      dust = clamp(max(dust * buildingWearProfile.x * (1.0 - 0.43 * bareMetal), terrainSeam * 0.92), 0.0, 1.0);

      float pigment = 0.90 + 0.18 * broadWear.g + 0.08 * coating.g + 0.06 * grain;
      diffuseColor.rgb *= pigment * (1.0 - 0.13 * seam * buildingWearProfile.y);
      vec3 exposedPrimer = mix(vec3(0.16, 0.15, 0.14), vec3(0.29, 0.27, 0.24), broadWear.g);
      vec3 exposedAlloy = mix(vec3(0.31, 0.33, 0.34), vec3(0.53, 0.55, 0.56), grain);
      diffuseColor.rgb = mix(diffuseColor.rgb, exposedPrimer, primer * 0.58);
      diffuseColor.rgb = mix(diffuseColor.rgb, exposedAlloy, bareMetal * 0.86);
      vec3 regolith = mix(vec3(0.104, 0.096, 0.088), vec3(0.248, 0.229, 0.208), 0.63 * coating.r + 0.37 * microWear.r);
      diffuseColor.rgb = mix(diffuseColor.rgb, regolith, dust * 0.96);
    `).replace("#include <roughnessmap_fragment>", /* glsl */ `
      #include <roughnessmap_fragment>
      float coatRoughness = clamp(roughnessFactor + 0.26 * (grain - 0.5) + 0.13 * primer, 0.24, 0.98);
      coatRoughness = mix(coatRoughness, 0.37 + 0.20 * grain, bareMetal * 0.84);
      roughnessFactor = mix(coatRoughness, 0.98, dust * 0.94);
    `).replace("#include <metalnessmap_fragment>", /* glsl */ `
      #include <metalnessmap_fragment>
      metalnessFactor = mix(mix(metalnessFactor, 0.79, bareMetal * 0.83), 0.015, dust);
    `).replace("#include <normal_fragment_maps>", /* glsl */ `
      #include <normal_fragment_maps>
      vec3 positionDx = dFdx(-vViewPosition);
      vec3 positionDy = dFdy(-vViewPosition);
      vec3 tangentX = cross(positionDy, normal);
      vec3 tangentY = cross(normal, positionDx);
      float determinant = dot(positionDx, tangentX);
      float relief = grain + 0.19 * microWear.b - 0.39 * primer - 0.14 * seam;
      relief = mix(relief, 0.73 * microWear.r + 0.27 * coating.r, 0.63 * dust);
      vec3 gradient = sign(determinant) * (dFdx(relief) * tangentX + dFdy(relief) * tangentY);
      float surfaceDamage = 0.38 + 0.62 * max(dust, max(primer, lip * 0.32));
      normal = normalize(max(0.000001, abs(determinant)) * normal - (surfaceDamage * buildingWearProfile.z) * gradient);
    `).replace("#include <aomap_fragment>", /* glsl */ `
      #include <aomap_fragment>
      float seamOcclusion = (1.0 - seam * buildingWearProfile.y * (0.22 + 0.12 * deposition))
        * (1.0 - terrainSeam * 0.38);
      reflectedLight.indirectDiffuse *= seamOcclusion;
      reflectedLight.indirectSpecular *= seamOcclusion * (1.0 - terrainSeam * 0.65);
    `);
  };
}

