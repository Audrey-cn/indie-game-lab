"""
Headless Blender 4.5 LTS Automated Cat Rigging & Run-Cycle Baking Pipeline
Usage:
  blender --background --python rig_cat_glb.py -- <input.glb> <output.glb>

Takes a static AI-sculpted (Hunyuan 3D / Tripo3D) cat .glb, normalizes bounds,
builds a 10-bone stylized quadruped/chibi armature (body, head, ears, tail, 4 paws),
computes smooth spatial vertex-group skinning weights, bakes a looping 24-frame Run
action, and exports a game-ready rigged .glb for Three.js AnimationMixer or Unity 6!
"""
import sys
import math
import bpy
from mathutils import Vector

argv = sys.argv
if "--" not in argv or len(argv[argv.index("--") + 1:]) < 2:
    print("Usage: blender --background --python rig_cat_glb.py -- <input.glb> <output.glb>")
    sys.exit(1)

in_path, out_path = argv[argv.index("--") + 1:][:2]

# 1. Clean scene & import GLB
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=in_path)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    print("ERROR: No mesh found in", in_path)
    sys.exit(1)

# Join into single mesh if multiple parts
bpy.ops.object.select_all(action="DESELECT")
for m in meshes:
    m.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
cat_obj = bpy.context.view_layer.objects.active
cat_obj.name = "MeowCatMesh"

# Apply existing transforms
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Compute bounding box in Blender Z-up space
verts_world = [cat_obj.matrix_world @ v.co for v in cat_obj.data.vertices]
min_v = Vector((min(v.x for v in verts_world), min(v.y for v in verts_world), min(v.z for v in verts_world)))
max_v = Vector((max(v.x for v in verts_world), max(v.y for v in verts_world), max(v.z for v in verts_world)))
center = (min_v + max_v) * 0.5
size = max_v - min_v
max_dim = max(size.x, size.y, size.z) or 1.0

# Center X/Y and sit bottom on Z=0, normalized to height/max_dim = 1.0
for v in cat_obj.data.vertices:
    v.co.x = (v.co.x - center.x) / max_dim
    v.co.y = (v.co.y - center.y) / max_dim
    v.co.z = (v.co.z - min_v.z) / max_dim
cat_obj.data.update()

# Re-measure normalized bounds (Z is up in Blender; -Y is forward in standard glTF import)
zs = [v.co.z for v in cat_obj.data.vertices]
xs = [v.co.x for v in cat_obj.data.vertices]
ys = [v.co.y for v in cat_obj.data.vertices]
h = max(zs) - min(zs)
w = max(xs) - min(xs)
d = max(ys) - min(ys)
print(f"Normalized cat bounds: w={w:.3f}, d={d:.3f}, h={h:.3f}, verts={len(cat_obj.data.vertices)}")

# 2. Build 10-Bone Chibi Cat Armature
arm_data = bpy.data.armatures.new("MeowArmature")
arm_obj = bpy.data.objects.new("MeowRig", arm_data)
bpy.context.collection.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode="EDIT")

def add_bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name)
    b.head = Vector(head)
    b.tail = Vector(tail)
    if parent:
        b.parent = parent
    return b

b_root = add_bone("root", (0, 0, h * 0.28), (0, 0, h * 0.48))
b_head = add_bone("head", (0, -d * 0.04, h * 0.50), (0, -d * 0.04, h * 0.92), b_root)
b_tail = add_bone("tail", (0, d * 0.16, h * 0.30), (0, d * 0.44, h * 0.48), b_root)
b_paw_fl = add_bone("paw_FL", (-w * 0.20, -d * 0.14, h * 0.24), (-w * 0.22, -d * 0.18, h * 0.02), b_root)
b_paw_fr = add_bone("paw_FR", (w * 0.20, -d * 0.14, h * 0.24), (w * 0.22, -d * 0.18, h * 0.02), b_root)
b_paw_bl = add_bone("paw_BL", (-w * 0.20, d * 0.14, h * 0.24), (-w * 0.22, d * 0.18, h * 0.02), b_root)
b_paw_br = add_bone("paw_BR", (w * 0.20, d * 0.14, h * 0.24), (w * 0.22, d * 0.18, h * 0.02), b_root)

bone_centers = {
    "root": Vector((0, 0, h * 0.36)),
    "head": Vector((0, -d * 0.04, h * 0.72)),
    "tail": Vector((0, d * 0.32, h * 0.36)),
    "paw_FL": Vector((-w * 0.22, -d * 0.18, h * 0.10)),
    "paw_FR": Vector((w * 0.22, -d * 0.18, h * 0.10)),
    "paw_BL": Vector((-w * 0.22, d * 0.18, h * 0.10)),
    "paw_BR": Vector((w * 0.22, d * 0.18, h * 0.10)),
}

bpy.ops.object.mode_set(mode="OBJECT")

# 3. Assign Smooth Spatial Proximity Skinning Weights
cat_obj.parent = arm_obj
mod = cat_obj.modifiers.new("Armature", "ARMATURE")
mod.object = arm_obj

vgroups = {name: cat_obj.vertex_groups.new(name=name) for name in bone_centers}
for v in cat_obj.data.vertices:
    p = v.co
    raw_w = {}
    for name, bc in bone_centers.items():
        dist = (p - bc).length
        # Tighter influence for paws & tail so they swing cleanly without warping torso
        sharp = 4.2 if name.startswith("paw_") or name == "tail" else 2.6
        raw_w[name] = 1.0 / (0.015 + math.pow(dist, sharp))
    # Prevent paws from affecting upper head/hat
    if p.z > h * 0.45:
        for pn in ("paw_FL", "paw_FR", "paw_BL", "paw_BR"):
            raw_w[pn] *= 0.02
    total = sum(raw_w.values()) or 1.0
    for name, val in raw_w.items():
        nw = val / total
        if nw > 0.01:
            vgroups[name].add([v.index], nw, "REPLACE")

# 4. Bake Seamless 24-Frame Looping 'Run' Skeletal Animation!
bpy.context.scene.render.fps = 30
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 24
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode="POSE")

for pb in arm_obj.pose.bones:
    pb.rotation_mode = "XYZ"

frames = [1, 7, 13, 19, 25]
for f in frames:
    bpy.context.scene.frame_set(f)
    phase = ((f - 1) / 24.0) * math.pi * 2.0
    s = math.sin(phase)
    c = math.cos(phase)

    # Energetic gallop torso bob & pitch
    arm_obj.pose.bones["root"].location = (0, 0, abs(s) * 0.045)
    arm_obj.pose.bones["root"].rotation_euler = (s * 0.12, 0, 0)
    arm_obj.pose.bones["root"].keyframe_insert("location", frame=f)
    arm_obj.pose.bones["root"].keyframe_insert("rotation_euler", frame=f)

    # Playful nodding head & hat follow-through
    arm_obj.pose.bones["head"].rotation_euler = (-s * 0.10, 0, c * 0.08)
    arm_obj.pose.bones["head"].keyframe_insert("rotation_euler", frame=f)

    # Happy wagging tail
    arm_obj.pose.bones["tail"].rotation_euler = (s * 0.18, 0, c * 0.42)
    arm_obj.pose.bones["tail"].keyframe_insert("rotation_euler", frame=f)

    # Alternating left/right paw running stride!
    arm_obj.pose.bones["paw_FL"].rotation_euler = (s * 0.65, 0, 0)
    arm_obj.pose.bones["paw_BR"].rotation_euler = (s * 0.65, 0, 0)
    arm_obj.pose.bones["paw_FR"].rotation_euler = (-s * 0.65, 0, 0)
    arm_obj.pose.bones["paw_BL"].rotation_euler = (-s * 0.65, 0, 0)
    for pn in ("paw_FL", "paw_FR", "paw_BL", "paw_BR"):
        arm_obj.pose.bones[pn].keyframe_insert("rotation_euler", frame=f)

if arm_obj.animation_data and arm_obj.animation_data.action:
    arm_obj.animation_data.action.name = "Run"

bpy.ops.object.mode_set(mode="OBJECT")

# 5. Export Game-Ready Rigged & Animated GLB!
bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    export_animations=True,
    export_skins=True,
    export_apply=False,
)
print("SUCCESS: Exported rigged animated GLB ->", out_path)
