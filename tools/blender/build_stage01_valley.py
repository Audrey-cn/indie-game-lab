"""
Headless Blender 4.5 LTS Organic Valley Environment Sculptor (Stage 01: Dawn Meadow Academy)
Creates a high-craft organic sculpted valley terrain mesh with proper UV unwrap and real
hand-painted Studio Ghibli PBR textures (tex-meadow-grass.png & tex-cliff-rock.png) —
NO blocky boxes! Exports to GLB for Unity 6 & Three.js.
"""
import sys
import os
import math
import bpy
from mathutils import noise, Vector

argv = sys.argv
if "--" not in argv or len(argv[argv.index("--") + 1:]) < 2:
    print("Usage: blender --background --python build_stage01_valley.py -- <textures_dir> <output.glb>")
    sys.exit(1)

tex_dir, out_path = argv[argv.index("--") + 1:][:2]
os.makedirs(os.path.dirname(out_path), exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)

def make_tex_mat(name, img_path, uv_scale=8.0, roughness=0.72):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular IOR Level"].default_value = 0.25
    tex_coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (uv_scale, uv_scale, 1.0)
    tex_img = nt.nodes.new("ShaderNodeTexImage")
    tex_img.image = bpy.data.images.load(img_path)
    nt.links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], tex_img.inputs["Vector"])
    nt.links.new(tex_img.outputs["Color"], bsdf.inputs["Base Color"])
    return mat

grass_mat = make_tex_mat("HandPaintedMeadow", os.path.join(tex_dir, "tex-meadow-grass.png"), uv_scale=12.0)
cliff_mat = make_tex_mat("HandPaintedCliff", os.path.join(tex_dir, "tex-cliff-rock.png"), uv_scale=8.0)

# Sculpt an organic 140m x 140m Fairy-Tale Valley surrounding the central Stage 01 course corridor!
bpy.ops.mesh.primitive_grid_add(x_subdivisions=96, y_subdivisions=96, size=140.0, location=(0, -22.0, 0.0))
valley = bpy.context.active_object
valley.name = "FairyValleyOrganicMesh"
valley.data.materials.append(grass_mat)
valley.data.materials.append(cliff_mat)

for v in valley.data.vertices:
    x, y = v.co.x, v.co.y
    # Keep a dramatic sunken central valley floor along the course (|x| < 12) and rise into lush rolling hills on flanks
    dist_corridor = max(0.0, abs(x) - 11.5)
    ridge = math.pow(min(1.0, dist_corridor / 38.0), 1.45) * 24.0
    n1 = noise.noise(Vector((x * 0.045, y * 0.045, 0.7))) * 5.8
    n2 = noise.noise(Vector((x * 0.11, y * 0.11, 2.3))) * 1.9
    end_rise = max(0.0, (-y - 54.0) * 0.45) + max(0.0, (y - 16.0) * 0.35)
    z = -7.5 + ridge + end_rise + (n1 + n2) * (0.35 + 0.65 * min(1.0, dist_corridor / 18.0))
    v.co.z = z

valley.data.update()

# Assign cliff material to steeper slopes and meadow grass to gentler hills!
for poly in valley.data.polygons:
    poly.use_smooth = True
    poly.material_index = 1 if poly.normal.z < 0.78 else 0

bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    export_image_format="WEBP",
    export_image_quality=80,
    export_apply=True,
)
print("Exported sculpted organic Fairy Valley GLB ->", out_path, f"({os.path.getsize(out_path)/1024:.1f} KB)")
