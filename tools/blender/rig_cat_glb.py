"""
Headless Blender 4.5 LTS Automated Cat Rigging & 3-Clip Animation Baking Pipeline
Usage:
  blender --background --python rig_cat_glb.py -- <input.glb> <output.glb>

Bakes 3 seamless looping skeletal AnimationClips via NLA tracks into a single GLB:
  - Idle    (30 frames @ 30fps): gentle breathing, tail sway, cute head tilt
  - Run     (24 frames @ 30fps): energetic 4-paw gallop stride, torso bob, hat bounce
  - Victory (30 frames @ 30fps): joyful bunny-hop celebration, raised front paws, fast tail wag
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

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=in_path)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    print("ERROR: No mesh found in", in_path)
    sys.exit(1)

# Remove any pre-existing armatures/modifiers so re-rigging an already-rigged GLB is idempotent
for o in list(bpy.context.scene.objects):
    if o.type == "ARMATURE":
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.object.select_all(action="DESELECT")
for m in meshes:
    for mod in list(m.modifiers):
        m.modifiers.remove(mod)
    m.vertex_groups.clear()
    m.parent = None
    m.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
cat_obj = bpy.context.view_layer.objects.active
cat_obj.name = "MeowCatMesh"

bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

verts_world = [cat_obj.matrix_world @ v.co for v in cat_obj.data.vertices]
min_v = Vector((min(v.x for v in verts_world), min(v.y for v in verts_world), min(v.z for v in verts_world)))
max_v = Vector((max(v.x for v in verts_world), max(v.y for v in verts_world), max(v.z for v in verts_world)))
center = (min_v + max_v) * 0.5
size = max_v - min_v
max_dim = max(size.x, size.y, size.z) or 1.0

for v in cat_obj.data.vertices:
    v.co.x = (v.co.x - center.x) / max_dim
    v.co.y = (v.co.y - center.y) / max_dim
    v.co.z = (v.co.z - min_v.z) / max_dim
cat_obj.data.update()

zs = [v.co.z for v in cat_obj.data.vertices]
xs = [v.co.x for v in cat_obj.data.vertices]
ys = [v.co.y for v in cat_obj.data.vertices]
h = max(zs) - min(zs)
w = max(xs) - min(xs)
d = max(ys) - min(ys)

# Build 7-Bone Chibi Cat Armature
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
add_bone("paw_FL", (-w * 0.20, -d * 0.14, h * 0.24), (-w * 0.22, -d * 0.18, h * 0.02), b_root)
add_bone("paw_FR", (w * 0.20, -d * 0.14, h * 0.24), (w * 0.22, -d * 0.18, h * 0.02), b_root)
add_bone("paw_BL", (-w * 0.20, d * 0.14, h * 0.24), (-w * 0.22, d * 0.18, h * 0.02), b_root)
add_bone("paw_BR", (w * 0.20, d * 0.14, h * 0.24), (w * 0.22, d * 0.18, h * 0.02), b_root)

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

cat_obj.parent = arm_obj
mod = cat_obj.modifiers.new("Armature", "ARMATURE")
mod.object = arm_obj

vgroups = {name: cat_obj.vertex_groups.new(name=name) for name in bone_centers}
for v in cat_obj.data.vertices:
    p = v.co
    raw_w = {}
    for name, bc in bone_centers.items():
        dist = (p - bc).length
        sharp = 4.2 if name.startswith("paw_") or name == "tail" else 2.6
        raw_w[name] = 1.0 / (0.015 + math.pow(dist, sharp))
    if p.z > h * 0.45:
        for pn in ("paw_FL", "paw_FR", "paw_BL", "paw_BR"):
            raw_w[pn] *= 0.02
    total = sum(raw_w.values()) or 1.0
    for name, val in raw_w.items():
        nw = val / total
        if nw > 0.01:
            vgroups[name].add([v.index], nw, "REPLACE")

bpy.context.scene.render.fps = 30
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode="POSE")
for pb in arm_obj.pose.bones:
    pb.rotation_mode = "XYZ"

def reset_pose():
    for pb in arm_obj.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)

def bake_clip(name, total_frames, step_frames, pose_fn):
    reset_pose()
    act = bpy.data.actions.new(name=name)
    if not arm_obj.animation_data:
        arm_obj.animation_data_create()
    arm_obj.animation_data.action = act
    for f in step_frames:
        bpy.context.scene.frame_set(f)
        phase = ((f - 1) / float(total_frames)) * math.pi * 2.0
        pose_fn(phase)
        for pb in arm_obj.pose.bones:
            pb.keyframe_insert("location", frame=f)
            pb.keyframe_insert("rotation_euler", frame=f)
    track = arm_obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, act)
    strip.action_frame_start = 1
    strip.action_frame_end = total_frames + 1
    arm_obj.animation_data.action = None

# Clip 1: Run (24 frames)
def pose_run(ph):
    s, c = math.sin(ph), math.cos(ph)
    arm_obj.pose.bones["root"].location = (0, 0, abs(s) * 0.045)
    arm_obj.pose.bones["root"].rotation_euler = (s * 0.12, 0, 0)
    arm_obj.pose.bones["head"].rotation_euler = (-s * 0.10, 0, c * 0.08)
    arm_obj.pose.bones["tail"].rotation_euler = (s * 0.18, 0, c * 0.42)
    arm_obj.pose.bones["paw_FL"].rotation_euler = (s * 0.68, 0, 0)
    arm_obj.pose.bones["paw_BR"].rotation_euler = (s * 0.68, 0, 0)
    arm_obj.pose.bones["paw_FR"].rotation_euler = (-s * 0.68, 0, 0)
    arm_obj.pose.bones["paw_BL"].rotation_euler = (-s * 0.68, 0, 0)

# Clip 2: Idle (30 frames)
def pose_idle(ph):
    s, c = math.sin(ph), math.cos(ph)
    arm_obj.pose.bones["root"].location = (0, 0, s * 0.018)
    arm_obj.pose.bones["root"].rotation_euler = (s * 0.03, 0, 0)
    arm_obj.pose.bones["head"].rotation_euler = (s * 0.05, c * 0.08, s * 0.10)
    arm_obj.pose.bones["tail"].rotation_euler = (0.12, 0, s * 0.35)
    arm_obj.pose.bones["paw_FL"].rotation_euler = (s * 0.08, 0, 0)
    arm_obj.pose.bones["paw_FR"].rotation_euler = (-s * 0.08, 0, 0)

# Clip 3: Victory (30 frames)
def pose_victory(ph):
    s, c = math.sin(ph), math.cos(ph)
    hop = max(0.0, s)
    arm_obj.pose.bones["root"].location = (0, 0, hop * 0.10)
    arm_obj.pose.bones["root"].rotation_euler = (-hop * 0.16, 0, c * 0.08)
    arm_obj.pose.bones["head"].rotation_euler = (-0.12 - hop * 0.08, 0, c * 0.14)
    arm_obj.pose.bones["tail"].rotation_euler = (0.25, 0, math.sin(ph * 2.0) * 0.52)
    arm_obj.pose.bones["paw_FL"].rotation_euler = (-0.75 - hop * 0.35, 0, -0.25)
    arm_obj.pose.bones["paw_FR"].rotation_euler = (-0.75 - hop * 0.35, 0, 0.25)
    arm_obj.pose.bones["paw_BL"].rotation_euler = (hop * 0.25, 0, 0)
    arm_obj.pose.bones["paw_BR"].rotation_euler = (hop * 0.25, 0, 0)

bake_clip("Run", 24, [1, 7, 13, 19, 25], pose_run)
bake_clip("Idle", 30, [1, 9, 16, 24, 31], pose_idle)
bake_clip("Victory", 30, [1, 9, 16, 24, 31], pose_victory)

bpy.ops.object.mode_set(mode="OBJECT")

bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    export_image_format="WEBP",
    export_image_quality=80,
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_skins=True,
    export_apply=False,
)
print("SUCCESS: Exported 3-clip rigged GLB (Run, Idle, Victory) ->", out_path)
