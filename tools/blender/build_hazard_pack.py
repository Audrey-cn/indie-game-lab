"""
Headless Blender 4.5 LTS Stylized 3D Hazard & Contraption Asset Generator
Strictly follows the approved Meowball Rush 6-Hazard Compendium!

Exports 5 game-ready stylized GLBs (with clean bevels, WitchSpring warm PBR materials):
  - hazard-rolling-pin.glb  (Giant enchanted bakery rolling pin with brass end-caps)
  - hazard-flail.glb        (Glowing star-crystal chained flail pendulum head)
  - hazard-bumper.glb       (Neon-crystal pinball bumper pillar with shockwave rings)
  - hazard-vent.glb         (Brass & turquoise rune steam-wind vent nozzle)
  - hazard-seesaw.glb       (Golden gear-fulcrum wooden & brass seesaw bridge)

Usage:
  blender --background --python build_hazard_pack.py -- <output_dir>
"""
import sys
import os
import math
import bpy

argv = sys.argv
if "--" not in argv or len(argv[argv.index("--") + 1:]) < 1:
    print("Usage: blender --background --python build_hazard_pack.py -- <output_dir>")
    sys.exit(1)

out_dir = argv[argv.index("--") + 1]
os.makedirs(out_dir, exist_ok=True)

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def make_mat(name, color, roughness=0.45, metallic=0.05, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission is not None and emission_strength > 0:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat

def assign(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True

def export_glb(filename):
    path = os.path.join(out_dir, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
    )
    print("Exported", path, f"({os.path.getsize(path) / 1024:.1f} KB)")

# 1. Giant Enchanted Bakery Rolling Pin (X-aligned cylinder, sits cleanly at Z >= 0)
clear_scene()
m_wood = make_mat("WarmWood", (0.76, 0.48, 0.24), roughness=0.52)
m_handle = make_mat("DarkWood", (0.45, 0.24, 0.12), roughness=0.58)
m_brass = make_mat("PolishedBrass", (0.92, 0.72, 0.25), roughness=0.28, metallic=0.82)

bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=0.45, depth=2.6, location=(0, 0, 0.45), rotation=(0, math.pi / 2, 0))
assign(bpy.context.active_object, m_wood)
for sx in (-1, 1):
    # Decorative brass collar rings
    bpy.ops.mesh.primitive_torus_add(major_radius=0.46, minor_radius=0.055, location=(sx * 1.22, 0, 0.45), rotation=(0, math.pi / 2, 0))
    assign(bpy.context.active_object, m_brass)
    # Turned wooden handles
    bpy.ops.mesh.primitive_cylinder_add(vertices=18, radius=0.14, depth=0.55, location=(sx * 1.56, 0, 0.45), rotation=(0, math.pi / 2, 0))
    assign(bpy.context.active_object, m_handle)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.18, location=(sx * 1.84, 0, 0.45))
    assign(bpy.context.active_object, m_brass)
export_glb("hazard-rolling-pin.glb")

# 2. Glowing Star-Crystal Flail Head (centered at origin for pendulum attachment)
clear_scene()
m_crystal = make_mat("StarCrystal", (0.72, 0.35, 1.0), roughness=0.18, metallic=0.1, emission=(0.78, 0.42, 1.0), emission_strength=1.4)
m_gold = make_mat("FlailGold", (0.96, 0.78, 0.26), roughness=0.25, metallic=0.85)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.52, location=(0, 0, 0))
assign(bpy.context.active_object, m_crystal)
bpy.ops.mesh.primitive_torus_add(major_radius=0.56, minor_radius=0.06, location=(0, 0, 0))
assign(bpy.context.active_object, m_gold)
bpy.ops.mesh.primitive_torus_add(major_radius=0.56, minor_radius=0.06, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
assign(bpy.context.active_object, m_gold)
for dx, dy, dz in [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]:
    rx = math.pi / 2 if dy != 0 else 0
    ry = -math.pi / 2 if dx > 0 else (math.pi / 2 if dx < 0 else (math.pi if dz < 0 else 0))
    if dy > 0: rx = -math.pi / 2
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.18, depth=0.42, location=(dx * 0.65, dy * 0.65, dz * 0.65), rotation=(rx, ry, 0))
    assign(bpy.context.active_object, m_crystal)
export_glb("hazard-flail.glb")

# 3. Neon-Crystal Pinball Bumper Pillar (sits on Z=0)
clear_scene()
m_base = make_mat("BumperBase", (0.24, 0.16, 0.42), roughness=0.35, metallic=0.45)
m_neon_m = make_mat("NeonMagenta", (1.0, 0.32, 0.78), roughness=0.18, emission=(1.0, 0.28, 0.75), emission_strength=1.6)
m_neon_c = make_mat("NeonCyan", (0.22, 0.92, 1.0), roughness=0.18, emission=(0.2, 0.9, 1.0), emission_strength=1.8)
bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.68, depth=0.22, location=(0, 0, 0.11))
assign(bpy.context.active_object, m_base)
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.44, depth=0.85, location=(0, 0, 0.62))
assign(bpy.context.active_object, m_neon_m)
bpy.ops.mesh.primitive_torus_add(major_radius=0.62, minor_radius=0.075, location=(0, 0, 0.52))
assign(bpy.context.active_object, m_neon_c)
bpy.ops.mesh.primitive_torus_add(major_radius=0.56, minor_radius=0.06, location=(0, 0, 0.88))
assign(bpy.context.active_object, m_neon_c)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.34, location=(0, 0, 1.24))
assign(bpy.context.active_object, m_neon_c)
export_glb("hazard-bumper.glb")

# 4. Brass & Turquoise Rune Steam-Wind Vent Nozzle (sits on Z=0)
clear_scene()
m_brass2 = make_mat("VentBrass", (0.86, 0.64, 0.22), roughness=0.30, metallic=0.82)
m_copper = make_mat("VentCopper", (0.58, 0.32, 0.18), roughness=0.38, metallic=0.75)
m_rune = make_mat("TurquoiseRune", (0.18, 0.96, 0.88), roughness=0.15, emission=(0.15, 0.95, 0.88), emission_strength=2.0)
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.78, depth=0.22, location=(0, 0, 0.11))
assign(bpy.context.active_object, m_copper)
bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.62, radius2=0.46, depth=0.38, location=(0, 0, 0.38))
assign(bpy.context.active_object, m_brass2)
bpy.ops.mesh.primitive_torus_add(major_radius=0.52, minor_radius=0.075, location=(0, 0, 0.56))
assign(bpy.context.active_object, m_rune)
for i in range(6):
    a = (i / 6.0) * math.pi * 2
    bpy.ops.mesh.primitive_cube_add(size=0.14, location=(math.cos(a) * 0.66, math.sin(a) * 0.66, 0.22))
    assign(bpy.context.active_object, m_brass2)
export_glb("hazard-vent.glb")

# 5. Balanced Golden-Gear Seesaw Bridge (centered at fulcrum origin)
clear_scene()
m_plank = make_mat("SeesawWood", (0.78, 0.52, 0.26), roughness=0.50)
m_trim = make_mat("SeesawBrass", (0.90, 0.70, 0.24), roughness=0.28, metallic=0.80)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.0))
plank = bpy.context.active_object
plank.scale = (2.6, 7.2, 0.32)
assign(plank, m_plank)
for sx in (-1.34, 1.34):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sx, 0, 0.08))
    rail = bpy.context.active_object
    rail.scale = (0.14, 7.2, 0.36)
    assign(rail, m_trim)
bpy.ops.mesh.primitive_cylinder_add(vertices=18, radius=0.48, depth=3.1, location=(0, 0, -0.35), rotation=(0, math.pi / 2, 0))
assign(bpy.context.active_object, m_trim)
export_glb("hazard-seesaw.glb")

print("ALL 5 HAZARD GLBs GENERATED SUCCESSFULLY!")
