"""Run: blender --background --python tools/build_blender_assets.py

Generates original editable sources (.blend) and runtime assets (.glb) in assets/models:
an anatomically structured low-poly undead roster (skeleton, skeleton_reaper, skeleton_knight, skeleton_warlord,
ghoul: shared rig with Idle/Walk/Attack/Hit/Death clips; skull_horned: static floating boss), weapon
(double-barrel shotgun with gloved hands), and a dark-fantasy arena kit (gate, brazier, dead
trees, graves, gallows, rocks, crystal, broken wall).
Target: Blender 4.2 LTS; API differences with older releases (2.9x) are detected at runtime.
Colors are baked into vertex colors so glTF/Bevy receive variation without procedural nodes.
Blender is Z-up; glTF/Bevy are Y-up. Characters face Blender -Y (glTF +Z); weapon barrels
point to Blender +Y (glTF -Z, camera forward).
Build a subset: blender --background --python tools/build_blender_assets.py -- skeleton ghoul
"""
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1] / "assets" / "models"
ROOT.mkdir(parents=True, exist_ok=True)
FPS = 24


# ---------------------------------------------------------------- utilities
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def hash3(x, y, z, seed):
    h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def noise(p, scale=1.0, seed=0):
    """Trilinear value noise in [0, 1]."""
    x, y, z = p[0] * scale, p[1] * scale, p[2] * scale
    ix, iy, iz = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    fx, fy, fz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    acc = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (fx if dx else 1 - fx) * (fy if dy else 1 - fy) * (fz if dz else 1 - fz)
                acc += w * hash3(ix + dx, iy + dy, iz + dz, seed)
    return acc


def fbm(p, scale=1.0, seed=0, octaves=3):
    total, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        total += noise(p, scale * (2 ** o), seed + o * 17) * amp
        norm += amp
        amp *= 0.5
    return total / norm


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- materials
def make_material(name, metal, rough, emit=None, strength=1.0, vertex_color=True):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = tree.nodes.get("Principled BSDF")
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if vertex_color:
        node = tree.nodes.new("ShaderNodeVertexColor")
        node.layer_name = "Col"
        tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    if emit:
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[key].default_value = (emit[0], emit[1], emit[2], 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = strength
    return mat


class Surface:
    """Material plus a color function evaluated per vertex."""

    def __init__(self, name, color_fn, metal=0.0, rough=0.8, emit=None, strength=1.0, smooth=False, facet=0.0):
        self.name, self.color_fn, self.smooth, self.facet = name, color_fn, smooth, facet
        self.args = (metal, rough, emit, strength)

    def material(self):
        mat = bpy.data.materials.get(self.name)
        if mat is None:
            metal, rough, emit, strength = self.args
            mat = make_material(self.name, metal, rough, emit, strength)
        return mat


def stone_color(p):
    n = fbm(p, 2.2, 3)
    base = mix((0.15, 0.145, 0.13), (0.30, 0.29, 0.26), n)
    moss = smooth(0.55, 0.75, fbm(p, 1.3, 9)) * smooth(1.6, 0.0, p[2])
    base = mix(base, (0.10, 0.17, 0.07), moss * 0.85)
    return mix(base, (0.05, 0.05, 0.045), smooth(0.68, 0.8, noise(p, 9.0, 4)) * 0.6)


def wood_color(p):
    grain = 0.5 + 0.5 * math.sin(p[2] * 7.0 + p[0] * 30.0 + fbm(p, 3.0, 5) * 6.0)
    return mix((0.07, 0.04, 0.025), (0.19, 0.11, 0.06), grain * 0.7 + fbm(p, 6.0, 8) * 0.3)


def bark_color(p):
    streak = 0.5 + 0.5 * math.sin(p[0] * 40.0 + p[1] * 40.0 + fbm(p, 2.0, 2) * 9.0)
    base = mix((0.045, 0.035, 0.03), (0.13, 0.10, 0.08), streak * 0.6 + fbm(p, 5.0, 1) * 0.4)
    return mix(base, (0.08, 0.12, 0.05), smooth(0.6, 0.8, fbm(p, 1.5, 7)) * smooth(2.0, 0.2, p[2]))


def iron_color(p):
    rust = smooth(0.5, 0.75, fbm(p, 6.0, 11))
    return mix((0.08, 0.08, 0.085), (0.26, 0.11, 0.05), rust)


def steel_color(p):
    return mix((0.10, 0.11, 0.12), (0.30, 0.31, 0.32), fbm(p, 18.0, 21) ** 2)


def brass_color(p):
    return mix((0.30, 0.18, 0.05), (0.62, 0.42, 0.14), fbm(p, 25.0, 23))


def gun_wood_color(p):
    grain = 0.5 + 0.5 * math.sin(p[1] * 90.0 + fbm(p, 12.0, 25) * 7.0)
    return mix((0.12, 0.045, 0.02), (0.30, 0.12, 0.05), grain)


def leather_color(p):
    return mix((0.06, 0.045, 0.035), (0.16, 0.11, 0.08), fbm(p, 20.0, 27))


def cloth_color(p):
    sigil = 0.0
    x, z = abs(abs(p[0]) - 2.4), p[2]
    # Original diamond emblem with a vertical blade, centered on each banner (x = +-2.4).
    dz = z - 3.1
    if abs(x) + abs(dz) < 0.32 and abs(x) + abs(dz) > 0.25:
        sigil = 1.0
    if abs(x) < 0.025 and abs(dz) < 0.42:
        sigil = 1.0
    base = mix((0.16, 0.025, 0.02), (0.30, 0.05, 0.03), fbm(p, 4.0, 31))
    return mix(base, (0.55, 0.45, 0.30), sigil)


SURF = {
    "stone": Surface("wet stone", stone_color, 0.0, 0.62),
    "wood": Surface("dark wood", wood_color, 0.0, 0.78),
    "bark": Surface("dead bark", bark_color, 0.0, 0.9, smooth=True),
    "iron": Surface("rusted iron", iron_color, 0.85, 0.55),
    "steel": Surface("worn steel", steel_color, 0.9, 0.33, smooth=True),
    "brass": Surface("aged brass", brass_color, 0.85, 0.38),
    "gunwood": Surface("walnut", gun_wood_color, 0.0, 0.45),
    "leather": Surface("leather glove", leather_color, 0.0, 0.7, smooth=True),
    "cloth": Surface("banner cloth", cloth_color, 0.0, 0.95),
    "ember": Surface("embers", lambda p: (0.9, 0.25, 0.05), 0.0, 0.8, (1.0, 0.32, 0.05), 6.0),
    "crystal": Surface("soul crystal", lambda p: mix((0.1, 0.8, 0.3), (0.5, 1.0, 0.6), noise(p, 8.0, 3)),
                       0.0, 0.08, (0.15, 1.0, 0.35), 4.0),
    "bone": Surface("bone", lambda p: mix((0.45, 0.42, 0.34), (0.70, 0.66, 0.55), fbm(p, 12.0, 41)), 0.0, 0.6),
    "rope": Surface("rope", lambda p: mix((0.18, 0.14, 0.08), (0.32, 0.25, 0.14), noise(p, 40.0, 2)), 0.0, 0.95),
}


# ---------------------------------------------------------------- geometry
class MeshBuilder:
    def __init__(self):
        self.verts, self.faces, self.face_surf, self.vbone = [], [], [], []

    def add(self, verts, faces, surf, matrix=None, bone=None):
        offset = len(self.verts)
        for v in verts:
            self.verts.append(tuple(matrix @ Vector(v)) if matrix else tuple(v))
            self.vbone.append(bone)
        for f in faces:
            self.faces.append([i + offset for i in f])
            self.face_surf.append(surf)

    def build(self, name, collection=None, ao=False, grime=False):
        return create_object(name, self.verts, self.faces, self.face_surf, collection, ao=ao, grime=grime)


AO_DIRS = []
for _i in range(14):  # golden-spiral directions on the +Z hemisphere
    _z = 1.0 - (_i + 0.5) / 14
    _r = math.sqrt(max(0.0, 1 - _z * _z))
    _a = _i * 2.39996
    AO_DIRS.append(Vector((math.cos(_a) * _r, math.sin(_a) * _r, _z)))


def bake_occlusion(mesh, distance=0.1):
    """Ray-cast ambient occlusion per face; crevices, sockets and joints get darker."""
    from mathutils.bvhtree import BVHTree
    verts = [v.co.copy() for v in mesh.vertices]
    polys = [tuple(p.vertices) for p in mesh.polygons]
    tree = BVHTree.FromPolygons(verts, polys)
    result = []
    for p in mesh.polygons:
        n = p.normal
        if n.length < 0.5:
            result.append(1.0)
            continue
        rot = n.to_track_quat("Z", "Y")
        origin = p.center + n * 0.0015
        hits = 0
        for d in AO_DIRS:
            if tree.ray_cast(origin, rot @ d, distance)[0] is not None:
                hits += 1
        result.append(1.0 - 0.72 * hits / len(AO_DIRS))
    return result


def create_object(name, verts, faces, face_surf, collection=None, extra_color=None, ao=False, grime=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    if ao:
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
    occlusion = bake_occlusion(mesh) if ao else None
    surfaces = []
    for s in face_surf:
        if s not in surfaces:
            surfaces.append(s)
    for s in surfaces:
        mesh.materials.append(SURF[s].material())
    for poly, s in zip(mesh.polygons, face_surf):
        poly.material_index = surfaces.index(s)
        poly.use_smooth = SURF[s].smooth
    def color(poly, co):
        s = SURF[face_surf[poly.index]]
        if not s.facet:
            c = (extra_color or s.color_fn)(co)
        else:
            # Low-poly look: one color per face with a small per-face value shift.
            c = s.color_fn(poly.center)
            k = 1.0 + (hash3(poly.index, 7, 13, 5) - 0.5) * s.facet
            c = tuple(min(1.0, v * k) for v in c)
        if grime and s.args[2] is None:
            z = poly.center.z
            c = mix(c, (0.20, 0.15, 0.10), smooth(0.5, 0.05, z) * 0.75 * (0.6 + 0.4 * fbm(poly.center, 9.0, 77)))
        if occlusion is not None and s.args[2] is None:
            c = tuple(v * occlusion[poly.index] for v in c)
        return c

    paint(mesh, color)
    obj = bpy.data.objects.new(name, mesh)
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def paint(mesh, fn):
    if hasattr(mesh, "color_attributes"):
        layer = mesh.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    else:
        layer = mesh.vertex_colors.new(name="Col")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            c = fn(poly, co)
            layer.data[li].color = (c[0], c[1], c[2], 1.0)


def box(sx, sy, sz):
    x, y, z = sx / 2, sy / 2, sz / 2
    v = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return v, f


def cylinder(r1, r2, h, seg=12, caps=True):
    """Along +Z from 0 to h."""
    v, f = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        v.append((math.cos(a) * r1, math.sin(a) * r1, 0.0))
    for i in range(seg):
        a = 2 * math.pi * i / seg
        v.append((math.cos(a) * r2, math.sin(a) * r2, h))
    for i in range(seg):
        j = (i + 1) % seg
        f.append((i, j, seg + j, seg + i))
    if caps:
        f.append(tuple(reversed(range(seg))))
        f.append(tuple(range(seg, 2 * seg)))
    return v, f


def tube(ro, ri, h, seg=20):
    """Hollow barrel along +Z: open bore visible from the muzzle."""
    v, f = [], []
    for ring_z, r in [(0, ro), (h, ro), (h, ri), (0.02, ri)]:
        for i in range(seg):
            a = 2 * math.pi * i / seg
            v.append((math.cos(a) * r, math.sin(a) * r, ring_z))
    for ring in range(3):
        for i in range(seg):
            j = (i + 1) % seg
            a, b = ring * seg, (ring + 1) * seg
            f.append((a + i, a + j, b + j, b + i))
    f.append(tuple(range(3 * seg, 4 * seg)))
    f.append(tuple(reversed(range(seg))))
    return v, f


def sphere(r, seg=10, rings=7, jitter=0.0, seed=0, squash=(1, 1, 1)):
    rng = random.Random(seed)
    v, f = [(0, 0, -r * squash[2])], []
    for ri in range(1, rings):
        phi = math.pi * ri / rings - math.pi / 2
        for i in range(seg):
            a = 2 * math.pi * i / seg
            k = 1.0 + rng.uniform(-jitter, jitter)
            v.append((math.cos(phi) * math.cos(a) * r * k * squash[0], math.cos(phi) * math.sin(a) * r * k * squash[1],
                      math.sin(phi) * r * k * squash[2]))
    v.append((0, 0, r * squash[2]))
    top = len(v) - 1
    for i in range(seg):
        f.append((0, 1 + (i + 1) % seg, 1 + i))
    for ri in range(rings - 2):
        for i in range(seg):
            a = 1 + ri * seg
            b = a + seg
            j = (i + 1) % seg
            f.append((a + i, a + j, b + j, b + i))
    last = 1 + (rings - 2) * seg
    for i in range(seg):
        f.append((last + i, last + (i + 1) % seg, top))
    return v, f


def grid(sx, sz, nx, nz):
    """Vertical plane in XZ, centered on x, from z=0 to sz."""
    v, f = [], []
    for j in range(nz + 1):
        for i in range(nx + 1):
            v.append((-sx / 2 + sx * i / nx, 0.0, sz * j / nz))
    for j in range(nz):
        for i in range(nx):
            a = j * (nx + 1) + i
            f.append((a, a + 1, a + nx + 2, a + nx + 1))
    return v, f


def T(x=0, y=0, z=0, rx=0, ry=0, rz=0, s=1.0):
    m = Matrix.Translation((x, y, z)) @ Euler((rx, ry, rz)).to_matrix().to_4x4()
    if isinstance(s, (int, float)):
        return m @ Matrix.Scale(s, 4)
    return m @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))


def skin_object(name, points, edges, radii, root=0, subdiv=2):
    """Organic mesh from a vertex graph using Skin + Subdivision, evaluated without operators."""
    mesh = bpy.data.meshes.new(name + "_graph")
    mesh.from_pydata(points, edges, [])
    obj = bpy.data.objects.new(name + "_graph", mesh)
    bpy.context.scene.collection.objects.link(obj)
    skin = obj.modifiers.new("Skin", "SKIN")
    skin.use_smooth_shade = True
    for i, r in enumerate(radii):
        sv = mesh.skin_vertices[0].data[i]
        sv.radius = r if isinstance(r, (tuple, list)) else (r, r)
        sv.use_root = i == root
    sub = obj.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = subdiv
    sub.render_levels = subdiv
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    result = bpy.data.meshes.new_from_object(evaluated)
    verts = [tuple(v.co) for v in result.vertices]
    faces = [tuple(p.vertices) for p in result.polygons]
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(result)
    return verts, faces


def export(name):
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / (name + ".blend")))
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    wanted = {
        "filepath": str(ROOT / (name + ".glb")),
        "export_format": "GLB",
        "export_apply": True,
        "export_colors": True,
        "export_vertex_color": "ACTIVE",
        "export_animations": True,
        "export_skins": True,
        "export_nla_strips": True,
        "export_animation_mode": "NLA_TRACKS",
        "export_force_sampling": True,
        "export_def_bones": True,
        "export_yup": True,
    }
    bpy.ops.export_scene.gltf(**{k: v for k, v in wanted.items() if k in props or k == "filepath"})
    print("exported", name)


# ---------------------------------------------------------------- weapon
def build_weapon():
    reset()
    mb = MeshBuilder()
    rot_y = math.pi / 2 * -1  # cylinders built on +Z, rotate to +Y
    for x in (-0.027, 0.027):
        mb.add(*tube(0.026, 0.0175, 0.66, 24), "steel", T(x, -0.04, 0.0, rx=rot_y))
        for y in (0.06, 0.30, 0.58):
            mb.add(*cylinder(0.0295, 0.0295, 0.022, 24), "brass", T(x, y, 0.0, rx=rot_y))
    mb.add(*box(0.012, 0.66, 0.012), "steel", T(0, 0.29, 0.03))  # top rib
    mb.add(*box(0.010, 0.012, 0.016), "brass", T(0, 0.60, 0.042))  # bead sight
    mb.add(*box(0.07, 0.26, 0.045), "gunwood", T(0, 0.17, -0.040))  # forend
    mb.add(*box(0.088, 0.17, 0.085), "steel", T(0, -0.11, -0.012))  # receiver
    for i in range(6):  # engraved brass inlay
        mb.add(*box(0.090, 0.012, 0.010), "brass", T(0, -0.18 + i * 0.026, 0.02 + (i % 2) * 0.01))
    mb.add(*box(0.012, 0.03, 0.03), "steel", T(0, -0.045, 0.045, rx=0.4))  # top lever
    mb.add(*cylinder(0.008, 0.008, 0.02, 10), "steel", T(-0.03, -0.175, 0.04, ry=math.pi / 2))  # hammer pin
    mb.add(*box(0.008, 0.012, 0.04), "steel", T(0, -0.10, -0.075, rx=0.25))  # trigger
    mb.add(*box(0.006, 0.09, 0.006), "steel", T(0, -0.10, -0.098))  # trigger guard
    mb.add(*box(0.006, 0.006, 0.045), "steel", T(0, -0.055, -0.078))
    mb.add(*box(0.074, 0.17, 0.07), "gunwood", T(0, -0.27, -0.045, rx=0.18))  # wrist
    mb.add(*box(0.07, 0.07, 0.13), "gunwood", T(0, -0.31, -0.10, rx=-0.35))  # pistol grip
    mb.add(*box(0.082, 0.30, 0.11), "gunwood", T(0, -0.50, -0.095, rx=0.12))  # stock
    mb.add(*box(0.086, 0.02, 0.125), "leather", T(0, -0.655, -0.115, rx=0.12))  # butt pad
    # Gloved hands and sleeves; sleeves extend toward the camera.
    left = T(0.0, 0.18, -0.078)
    mb.add(*box(0.10, 0.10, 0.045), "leather", left)
    for i in range(4):
        mb.add(*sphere(0.016, 8, 5, squash=(1.0, 1.0, 1.3)), "leather", left @ T(0.045, -0.035 + i * 0.023, 0.03))
    mb.add(*cylinder(0.048, 0.05, 0.36, 12), "leather", left @ T(-0.06, -0.02, -0.02, rx=1.75, rz=0.5))
    right = T(0.0, -0.31, -0.11, rx=-0.35)
    mb.add(*box(0.095, 0.09, 0.08), "leather", right)
    for i in range(3):
        mb.add(*sphere(0.016, 8, 5, squash=(1.3, 1.0, 1.0)), "leather", right @ T(-0.045, 0.0, 0.02 - i * 0.024))
    mb.add(*cylinder(0.05, 0.055, 0.35, 12), "leather", right @ T(0.05, -0.04, -0.03, rx=1.9, rz=-0.6))
    mb.build("weapon")
    export("weapon")


# ---------------------------------------------------------------- arena kit
def build_gate():
    reset()
    mb = MeshBuilder()
    rng = random.Random(7)
    for x in (-2.4, 2.4):
        z = 0.0
        while z < 4.6:
            h = rng.uniform(0.45, 0.7)
            mb.add(*box(1.0 + rng.uniform(-0.06, 0.06), 1.0 + rng.uniform(-0.06, 0.06), h - 0.03), "stone",
                   T(x + rng.uniform(-0.03, 0.03), 0, z + h / 2, rz=rng.uniform(-0.05, 0.05)))
            z += h
        mb.add(*box(1.25, 1.25, 0.35), "stone", T(x, 0, 0.17))
    # Pointed arch: two arcs meeting at the apex, with one fallen keystone gap.
    for side in (-1, 1):
        cx = -side * 1.0
        for i in range(9):
            a = math.radians(5 + i * 9.5)
            px = cx + side * 3.4 * math.cos(a)
            pz = 4.6 + 3.4 * math.sin(a) * 0.95
            if side == 1 and i == 8:
                continue
            mb.add(*box(0.55, 0.9, 0.5), "stone", T(px, 0, pz, ry=side * (a - math.pi / 2) * -1))
    mb.add(*box(0.6, 0.85, 0.5), "stone", T(1.3, -1.2, 0.25, rx=0.4, rz=0.7))  # fallen block
    for i in range(4):  # steps
        mb.add(*box(7.0 - i * 0.6, 0.6, 0.18), "stone", T(0, -1.6 + i * 0.5, 0.09 + i * 0.18))
    for x in (-2.4, 2.4):  # hanging banners
        v, f = grid(0.75, 2.0, 16, 40)
        v = [(px, 0.02 * math.sin(pz * 5 + px * 3), pz - 0.25 * smooth(0.4, 0.0, pz) * (1 - abs(px) / 0.38))
             for px, py, pz in v]
        mb.add(v, f, "cloth", T(x, -0.52, 2.1))
        mb.add(*box(0.9, 0.05, 0.05), "iron", T(x, -0.52, 4.12))
    mb.build("gate")
    export("gate")


def build_brazier():
    reset()
    mb = MeshBuilder()
    mb.add(*cylinder(0.32, 0.28, 0.12, 8), "stone", T())
    mb.add(*cylinder(0.18, 0.15, 0.9, 8), "stone", T(z=0.12))
    mb.add(*cylinder(0.2, 0.26, 0.1, 8), "stone", T(z=1.0))
    mb.add(*cylinder(0.16, 0.42, 0.24, 12), "iron", T(z=1.1))
    for i in range(6):
        a = i * math.pi / 3
        mb.add(*box(0.03, 0.03, 0.22), "iron", T(math.cos(a) * 0.43, math.sin(a) * 0.43, 1.42, rx=math.sin(a) * 0.3,
                                                 ry=-math.cos(a) * 0.3))
    rng = random.Random(3)
    for i in range(9):
        mb.add(*sphere(0.08, 6, 4, 0.25, i), "ember", T(rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 1.3))
    mb.build("brazier")
    export("brazier")


def build_tree(name, seed, height):
    reset()
    rng = random.Random(seed)
    points, edges, radii = [(0, 0, -0.3)], [], [0.42]

    def branch(parent, direction, length, radius, depth):
        d = Vector(direction).normalized()
        steps = 3
        prev = parent
        for s in range(steps):
            d = (d + Vector((rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), rng.uniform(-0.1, 0.25)))).normalized()
            p = Vector(points[prev]) + d * (length / steps)
            points.append(tuple(p))
            r = radius * (1 - (s + 1) / (steps + 1.5))
            radii.append(max(r, 0.02))
            edges.append((prev, len(points) - 1))
            prev = len(points) - 1
            if depth > 0 and s >= 1:
                for _ in range(rng.randint(1, 2)):
                    nd = d + Vector((rng.uniform(-1.2, 1.2), rng.uniform(-1.2, 1.2), rng.uniform(-0.1, 0.6)))
                    branch(prev, nd, length * rng.uniform(0.45, 0.65), max(r * 0.8, 0.045), depth - 1)
        return prev

    for i in range(4):  # roots
        a = i * math.pi / 2 + rng.uniform(-0.3, 0.3)
        points.append((math.cos(a) * 0.9, math.sin(a) * 0.9, -0.15))
        radii.append(0.08)
        edges.append((0, len(points) - 1))
    branch(0, (0, 0, 1), height, 0.36, 2)
    verts, faces = skin_object(name, points, edges, radii, 0, 1)
    create_object(name, verts, faces, ["bark"] * len(faces))
    export(name)


def build_graves():
    reset()
    mb = MeshBuilder()
    mb.add(*box(0.6, 0.16, 0.75), "stone", T(z=0.375))
    v, f = cylinder(0.3, 0.3, 0.16, 12)
    mb.add(v, f, "stone", T(0, 0.08, 0.75, rx=math.pi / 2))
    mb.add(*box(0.7, 0.3, 0.12), "stone", T(z=0.06))
    mb.build("grave_a")
    export("grave_a")
    reset()
    mb = MeshBuilder()
    mb.add(*box(0.14, 0.12, 1.25), "stone", T(z=0.62, ry=0.12))
    mb.add(*box(0.62, 0.12, 0.14), "stone", T(0.11, 0, 0.95, ry=0.12))
    mb.add(*box(0.5, 0.4, 0.15), "stone", T(z=0.07))
    mb.build("grave_b")
    export("grave_b")


def build_gallows():
    reset()
    mb = MeshBuilder()
    mb.add(*box(0.24, 0.24, 4.4), "wood", T(z=2.2))
    mb.add(*box(2.0, 0.2, 0.2), "wood", T(0.8, 0, 4.2))
    mb.add(*box(0.14, 0.14, 1.1), "wood", T(0.36, 0, 3.75, ry=-0.78))
    mb.add(*cylinder(0.012, 0.012, 1.3, 6), "rope", T(1.6, 0, 2.95))
    mb.add(*sphere(0.13, 10, 7, 0.06, 2, (0.85, 1.0, 1.1)), "bone", T(1.6, 0, 2.82))
    mb.add(*box(0.12, 0.05, 0.05), "bone", T(1.6, -0.08, 2.7))
    for i in range(3):
        mb.add(*box(0.05, 0.03, 0.4 - i * 0.08), "bone", T(1.55 + i * 0.05, 0.02, 2.45, ry=0.1 * i))
    mb.add(*box(0.7, 0.7, 0.3), "stone", T(z=0.15))
    mb.build("gallows")
    export("gallows")


def build_rocks():
    reset()
    mb = MeshBuilder()
    mb.add(*sphere(0.8, 9, 6, 0.28, 5, (1.3, 1.0, 0.7)), "stone", T(z=0.25))
    mb.build("rock")
    export("rock")


def build_crystal():
    reset()
    mb = MeshBuilder()
    rng = random.Random(12)
    for i in range(5):
        h = rng.uniform(0.35, 0.7)
        v = [(0, 0, 0), (0.07, 0, h * 0.3), (0, 0.07, h * 0.3), (-0.07, 0, h * 0.3), (0, -0.07, h * 0.3), (0, 0, h)]
        f = [(0, 2, 1), (0, 3, 2), (0, 4, 3), (0, 1, 4), (1, 2, 5), (2, 3, 5), (3, 4, 5), (4, 1, 5)]
        mb.add(v, f, "crystal", T(rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), 0, rng.uniform(-0.4, 0.4),
                                  rng.uniform(-0.4, 0.4), rng.uniform(0, 3)))
    mb.add(*sphere(0.16, 7, 4, 0.3, 4, (1.2, 1.2, 0.5)), "stone", T())
    mb.build("crystal")
    export("crystal")


def build_wall():
    reset()
    mb = MeshBuilder()
    rng = random.Random(21)
    for row in range(6):
        x = -2.6 + (row % 2) * 0.3
        while x < 2.6:
            w = rng.uniform(0.5, 0.8)
            limit = 3.2 - abs(x) * 0.9 + rng.uniform(-0.4, 0.3)
            if row * 0.42 < limit:
                mb.add(*box(w - 0.03, 0.5, 0.39), "stone", T(x + w / 2, rng.uniform(-0.03, 0.03), row * 0.42 + 0.2,
                                                         rz=rng.uniform(-0.04, 0.04)))
            x += w
    mb.build("wall")
    export("wall")


# ---------------------------------------------------------------- undead roster
# Original characters: anatomically structured bones (skull, curved ribs, vertebrae, pelvis,
# long bones with heads and condyles, hands and feet with phalanges), dried tissue, torn cloth
# and riveted armor. Rigid parts skinned 100% to one bone each; faceted shading, baked
# ray-cast occlusion and ground grime in vertex colors.
BR = 1.65  # bone radii exaggerated over real anatomy so silhouettes read at game distance


def bone_c(p):
    base = mix((0.60, 0.53, 0.40), (0.80, 0.74, 0.60), fbm(p, 9.0, 41))
    base = mix(base, (0.45, 0.35, 0.22), smooth(0.55, 0.78, fbm(p, 4.0, 60)) * 0.7)
    return mix(base, (0.88, 0.84, 0.74), smooth(0.7, 0.85, noise(p, 22.0, 61)) * 0.4)


def ghoul_c(p):
    base = mix((0.30, 0.38, 0.22), (0.50, 0.58, 0.34), fbm(p, 7.0, 43))
    return mix(base, (0.25, 0.20, 0.16), smooth(0.6, 0.8, fbm(p, 5.0, 62)) * 0.6)


def mail_c(p):
    ring = 0.5 + 0.5 * math.sin(p[0] * 260.0) * math.sin(p[2] * 260.0)
    return mix((0.26, 0.26, 0.28), (0.58, 0.58, 0.6), ring * 0.6 + fbm(p, 30.0, 63) * 0.4)


def rag_c(p):
    base = mix((0.20, 0.055, 0.035), (0.34, 0.10, 0.06), fbm(p, 10.0, 46))
    return mix(base, (0.12, 0.08, 0.05), smooth(0.55, 0.75, fbm(p, 6.0, 64)) * 0.7)


SURF.update({
    "bonec": Surface("bone", bone_c, 0.0, 0.62, facet=0.1),
    "darkbone": Surface("old bone", lambda p: mix((0.33, 0.27, 0.19), (0.50, 0.42, 0.30), fbm(p, 9.0, 44)), 0.0, 0.65,
                        facet=0.12),
    "teeth": Surface("teeth", lambda p: mix((0.62, 0.56, 0.38), (0.85, 0.80, 0.66), noise(p, 40.0, 65)), 0.0, 0.4,
                     facet=0.1),
    "socket": Surface("socket", lambda p: (0.025, 0.02, 0.018), 0.0, 0.9),
    "eyeglow": Surface("eye glow", lambda p: (1.0, 0.55, 0.12), 0.0, 0.4, (1.0, 0.42, 0.06), 6.0),
    "eyered": Surface("eye red", lambda p: (1.0, 0.2, 0.1), 0.0, 0.4, (1.0, 0.12, 0.05), 6.0),
    "flesh": Surface("dried flesh", lambda p: mix((0.22, 0.035, 0.025), (0.45, 0.09, 0.06), fbm(p, 12.0, 45)), 0.0,
                     0.45, facet=0.18),
    "sinew": Surface("sinew", lambda p: mix((0.20, 0.07, 0.04), (0.38, 0.20, 0.12), noise(p, 30.0, 66)), 0.0, 0.5,
                     facet=0.1),
    "rag": Surface("rag cloth", rag_c, 0.0, 0.95, facet=0.15),
    "strap": Surface("strap leather", lambda p: mix((0.12, 0.07, 0.04), (0.26, 0.15, 0.08), fbm(p, 14.0, 47)), 0.0,
                     0.75, facet=0.12),
    "plate": Surface("armor plate", lambda p: mix((0.22, 0.23, 0.25), (0.44, 0.45, 0.47), fbm(p, 6.0, 48)), 0.85, 0.4,
                     facet=0.12),
    "blackplate": Surface("black plate", lambda p: mix((0.07, 0.07, 0.08), (0.18, 0.17, 0.17), fbm(p, 6.0, 49)), 0.85,
                          0.45, facet=0.12),
    "mail": Surface("chain mail", mail_c, 0.9, 0.5, facet=0.08),
    "trim": Surface("gold trim", lambda p: mix((0.50, 0.34, 0.10), (0.80, 0.58, 0.22), fbm(p, 20.0, 50)), 0.9, 0.32,
                    facet=0.1),
    "rust": Surface("rusty metal", lambda p: mix((0.20, 0.10, 0.05), (0.42, 0.22, 0.11), fbm(p, 10.0, 51)), 0.7, 0.62,
                    facet=0.15),
    "ghoul": Surface("ghoul skin", ghoul_c, 0.0, 0.55, facet=0.12),
    "antler": Surface("antler", lambda p: mix((0.26, 0.17, 0.10), (0.50, 0.37, 0.22), fbm(p, 8.0, 52)), 0.0, 0.7,
                      facet=0.12),
})

RIG = [
    # name, head, tail, parent  (character faces Blender -Y; arms in a relaxed A-pose)
    ("hips", (0, 0.0, 0.98), (0, 0.0, 1.10), None),
    ("spine", (0, 0.0, 1.10), (0, 0.0, 1.50), "hips"),
    ("neck", (0, 0.0, 1.50), (0, -0.01, 1.60), "spine"),
    ("head", (0, -0.01, 1.60), (0, -0.01, 1.92), "neck"),
    ("upper_arm.L", (0.21, 0.0, 1.46), (0.27, 0.0, 1.18), "spine"),
    ("forearm.L", (0.27, 0.0, 1.18), (0.30, -0.02, 0.93), "upper_arm.L"),
    ("hand.L", (0.30, -0.02, 0.93), (0.31, -0.03, 0.80), "forearm.L"),
    ("thigh.L", (0.10, 0.0, 0.95), (0.11, 0.0, 0.52), "hips"),
    ("shin.L", (0.11, 0.0, 0.52), (0.11, 0.01, 0.10), "thigh.L"),
    ("foot.L", (0.11, 0.01, 0.10), (0.11, -0.12, 0.03), "shin.L"),
]
for _n, _h, _t, _p in list(RIG):
    if _n.endswith(".L"):
        RIG.append((_n[:-2] + ".R", (-_h[0], _h[1], _h[2]), (-_t[0], _t[1], _t[2]),
                    _p[:-2] + ".R" if _p and _p.endswith(".L") else _p))
JOINT = {n: (Vector(h), Vector(t)) for n, h, t, _ in RIG}


def V3(*a):
    return Vector(a)


def seg(mb, a, b, r1, r2, surf, bone, sides=6, twist=0.0):
    """Faceted prism from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    if d.length < 1e-5:
        return
    v, f = cylinder(r1, r2, d.length, sides)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    mb.add(v, f, surf, Matrix.Translation(a) @ rot @ Matrix.Rotation(twist, 4, "Z"), bone)


def knob(mb, p, r, surf, bone, squash=(1, 1, 1), seg_count=6, rings=4):
    mb.add(*sphere(r, seg_count, rings, squash=squash), surf, Matrix.Translation(Vector(p)), bone)


def blk(mb, p, size, surf, bone, rot=(0, 0, 0)):
    mb.add(*box(*size), surf, T(p[0], p[1], p[2], rot[0], rot[1], rot[2]), bone)


def plate(mb, pts, thick, surf, bone):
    """Extruded convex polygon (scapula, iliac wing, armor lames)."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    normal = (pts[1] - pts[0]).cross(pts[2] - pts[0]).normalized() * thick / 2
    v = [tuple(p + normal) for p in pts] + [tuple(p - normal) for p in pts]
    f = [tuple(range(n)), tuple(reversed(range(n, 2 * n)))]
    for i in range(n):
        j = (i + 1) % n
        f.append((i, i + n, j + n, j))
    mb.add(v, f, surf, None, bone)


def lerp(a, b, t):
    return Vector(a).lerp(Vector(b), t)


def catmull(ctrl, steps=3):
    ctrl = [Vector(c) for c in ctrl]
    pts = [ctrl[0]]
    ext = [ctrl[0] * 2 - ctrl[1]] + ctrl + [ctrl[-1] * 2 - ctrl[-2]]
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for s in range(1, steps + 1):
            t = s / steps
            pts.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    return pts


def curve(mb, ctrl, r1, r2, surf, bone, sides=5, steps=3):
    pts = catmull(ctrl, steps)
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        t0, t1 = i / (len(pts) - 1), (i + 1) / (len(pts) - 1)
        seg(mb, a, b, r1 + (r2 - r1) * t0, r1 + (r2 - r1) * t1, surf, bone, sides)


def long_bone(mb, a, b, r, surf, bone, head_a=2.0, head_b=2.0, bow=(0, 0, 0)):
    """Shaft narrowing at mid-length with expanded epiphyses at both ends."""
    a, b = Vector(a), Vector(b)
    mid = lerp(a, b, 0.5) + Vector(bow)
    seg(mb, lerp(a, b, 0.06), mid, r * 1.25, r, surf, bone, 6)
    seg(mb, mid, lerp(a, b, 0.94), r, r * 1.3, surf, bone, 6)
    if head_a:
        knob(mb, a, r * head_a, surf, bone, (1.0, 0.9, 0.8))
    if head_b:
        knob(mb, b, r * head_b, surf, bone, (1.1, 0.9, 0.8))


# ---- skull
def skull(mb, center, r, eyes=None, surf="bonec", bone="head", jaw_open=0.04, damage=False, teeth="teeth"):
    c = Vector(center)

    def P(x, y, z):
        return c + Vector((x * r, y * r, z * r))

    knob(mb, P(0, 0.14, 0.14), r, surf, bone, (0.80, 1.0, 0.86), 10, 8)  # cranial vault
    knob(mb, P(0, -0.42, 0.24), r * 0.7, surf, bone, (1.08, 0.78, 0.82), 8, 6)  # frontal bone
    knob(mb, P(0, 0.55, -0.15), r * 0.55, surf, bone, (1.2, 0.8, 0.9), 8, 5)  # occipital
    for sx in (-1, 1):
        knob(mb, P(sx * 0.36, -0.76, -0.04), r * 0.25, "socket", bone, (1.0, 0.7, 0.9), 6, 4)  # orbit
        ring = [P(sx * 0.36 + math.cos(a) * 0.31, -0.86 + 0.06 * abs(math.sin(a)), -0.04 + math.sin(a) * 0.28)
                for a in [i * math.pi / 4 for i in range(9)]]
        for a, b in zip(ring, ring[1:]):
            seg(mb, a, b, r * 0.035, r * 0.035, surf, bone, 4)
        seg(mb, P(sx * 0.6, -0.62, -0.28), P(sx * 0.8, -0.05, -0.2), r * 0.09, r * 0.07, surf, bone, 5)  # zygoma
        knob(mb, P(sx * 0.66, 0.1, -0.38), r * 0.13, surf, bone)  # mastoid
        knob(mb, P(sx * 0.72, 0.1, 0.05), r * 0.38, surf, bone, (0.5, 1.0, 1.0), 6, 4)  # temporal
        if eyes:
            knob(mb, P(sx * 0.36, -0.9, -0.05), r * 0.075, eyes, bone, seg_count=4, rings=3)
    plate(mb, [P(0, -0.94, -0.16), P(-0.13, -0.9, -0.44), P(0.13, -0.9, -0.44)], r * 0.12, "socket", bone)  # nose
    seg(mb, P(0, -0.9, 0.04), P(0, -0.97, -0.14), r * 0.055, r * 0.04, surf, bone, 4)  # nasal bone
    knob(mb, P(0, -0.6, -0.56), r * 0.46, surf, bone, (1.0, 0.85, 0.6), 8, 5)  # maxilla
    for i in range(8):
        a = (i - 3.5) * 0.2
        p = P(math.sin(a) * 0.42, -0.86 + (1 - math.cos(a)) * 0.9, -0.76 - (hash3(i, 1, 2, 3) - 0.5) * 0.06)
        blk(mb, p, (r * 0.1, r * 0.09, r * 0.17), teeth, bone, (0, 0, a))
    o = Vector((0, 0, -jaw_open * r))
    for sx in (-1, 1):  # mandible
        curve(mb, [P(sx * 0.56, -0.05, -0.36) + o, P(sx * 0.52, -0.15, -0.9) + o, P(sx * 0.34, -0.58, -0.98) + o,
                   P(0, -0.78, -1.0) + o], r * 0.12, r * 0.11, surf, bone, 5, 2)
        seg(mb, P(sx * 0.5, -0.3, -0.48) + o, P(sx * 0.52, -0.2, -0.86) + o, r * 0.07, r * 0.1, surf, bone, 4)
    plate(mb, [P(-0.48, -0.18, -0.95) + o, P(0.48, -0.18, -0.95) + o, P(0.3, -0.66, -1.0) + o,
               P(-0.3, -0.66, -1.0) + o], r * 0.14, surf, bone)  # mandible body
    blk(mb, P(0, -0.8, -1.02) + o, (r * 0.34, r * 0.14, r * 0.2), surf, bone)  # chin
    for i in range(8):
        a = (i - 3.5) * 0.19
        p = P(math.sin(a) * 0.4, -0.8 + (1 - math.cos(a)) * 0.9, -0.92 + (hash3(i, 4, 2, 3) - 0.5) * 0.05) + o
        blk(mb, p, (r * 0.09, r * 0.08, r * 0.14), teeth, bone, (0, 0, a))
    if damage:
        plate(mb, [P(0.42, -0.1, 0.72), P(0.62, 0.15, 0.6), P(0.55, 0.3, 0.75), P(0.38, 0.2, 0.84)], r * 0.1,
              "socket", bone)


# ---- torso
def ribcage(mb, surf="bonec", s=1.0):
    for k in range(7):
        zb = 1.47 - k * 0.042
        w = math.sin(math.pi * (k + 1.5) / 8.5)
        rx, ry = (0.10 + 0.065 * w) * s, (0.085 + 0.04 * w) * s
        for sx in (-1, 1):
            ctrl = [V3(sx * 0.02, 0.085, zb), V3(sx * rx * 0.62, 0.105, zb - 0.005), V3(sx * rx, 0.02, zb - 0.03),
                    V3(sx * rx * 0.86, -ry * 0.8, zb - 0.07 - k * 0.006)]
            if k < 5:
                ctrl.append(V3(sx * 0.03, -ry * 1.02, zb - 0.1 - k * 0.016))
            curve(mb, ctrl, 0.0085 * BR, 0.0075 * BR, surf, "spine", 4, 3)
    blk(mb, (0, -0.105 * s, 1.445), (0.06, 0.022, 0.05), surf, "spine")  # manubrium
    blk(mb, (0, -0.115 * s, 1.34), (0.038, 0.02, 0.16), surf, "spine", (-0.12, 0, 0))  # sternum body
    blk(mb, (0, -0.115 * s, 1.245), (0.018, 0.014, 0.035), surf, "spine")  # xiphoid
    for i in range(9):  # thoracic vertebrae
        z = 1.49 - i * 0.037
        blk(mb, (0, 0.07, z), (0.03 * BR, 0.028 * BR, 0.022), surf, "spine")
        seg(mb, (0, 0.085, z), (0, 0.13, z - 0.03), 0.006 * BR, 0.004 * BR, surf, "spine", 4)
        for sx in (-1, 1):
            seg(mb, (0, 0.08, z), (sx * 0.035, 0.09, z), 0.005 * BR, 0.004 * BR, surf, "spine", 4)
    for i in range(5):  # lumbar vertebrae
        z = 1.165 - i * 0.034
        bone = "spine" if z >= 1.1 else "hips"
        blk(mb, (0, 0.055, z), (0.038 * BR, 0.032 * BR, 0.026), surf, bone)
        seg(mb, (0, 0.075, z), (0, 0.115, z - 0.01), 0.008 * BR, 0.006 * BR, surf, bone, 4)
        for sx in (-1, 1):
            seg(mb, (0, 0.06, z), (sx * 0.05, 0.065, z + 0.005), 0.005 * BR, 0.004 * BR, surf, bone, 4)
    for sx in (-1, 1):
        curve(mb, [V3(sx * 0.025, -0.075, 1.5), V3(sx * 0.09, -0.088, 1.505), V3(sx * 0.15, -0.05, 1.495),
                   V3(sx * 0.2, 0.0, 1.485)], 0.008 * BR, 0.009 * BR, surf, "spine", 5, 2)  # clavicle
        plate(mb, [V3(sx * 0.06, 0.125, 1.47), V3(sx * 0.19, 0.08, 1.48), V3(sx * 0.1, 0.12, 1.3)], 0.012, surf,
              "spine")  # scapula
        seg(mb, V3(sx * 0.07, 0.135, 1.43), V3(sx * 0.205, 0.05, 1.475), 0.006 * BR, 0.008 * BR, surf, "spine", 4)


def pelvis(mb, surf="bonec"):
    plate(mb, [(-0.045, 0.075, 1.035), (0.045, 0.075, 1.035), (0.0, 0.085, 0.915)], 0.03, surf, "hips")  # sacrum
    seg(mb, (0, 0.085, 0.92), (0, 0.07, 0.885), 0.007 * BR, 0.004 * BR, surf, "hips", 4)  # coccyx
    for sx in (-1, 1):
        wing = [V3(sx * 0.045, 0.075, 1.025), V3(sx * 0.13, 0.055, 1.085), V3(sx * 0.17, -0.02, 1.065),
                V3(sx * 0.14, -0.055, 0.985), V3(sx * 0.1, -0.008, 0.94)]
        plate(mb, wing, 0.014, surf, "hips")
        curve(mb, [wing[0], wing[1], wing[2], wing[3]], 0.008 * BR, 0.008 * BR, surf, "hips", 4, 2)  # iliac crest
        knob(mb, (sx * 0.1, -0.008, 0.94), 0.02 * BR, surf, "hips")  # acetabulum
        seg(mb, (sx * 0.1, -0.025, 0.935), (sx * 0.02, -0.068, 0.9), 0.009 * BR, 0.008 * BR, surf, "hips", 5)  # pubis
        seg(mb, (sx * 0.095, 0.0, 0.93), (sx * 0.075, 0.02, 0.86), 0.01 * BR, 0.011 * BR, surf, "hips", 5)  # ischium
        seg(mb, (sx * 0.075, 0.02, 0.86), (sx * 0.025, -0.058, 0.88), 0.007 * BR, 0.007 * BR, surf, "hips", 4)
    blk(mb, (0, -0.07, 0.895), (0.03, 0.02, 0.035), surf, "hips")  # symphysis


# ---- limbs
def bone_arm(mb, side, surf="bonec", hands="fingers"):
    s = "." + side
    sx = 1 if side == "L" else -1
    ua, fa, hd = "upper_arm" + s, "forearm" + s, "hand" + s
    sh, el = JOINT[ua]
    wr, tip = JOINT[hd]
    knob(mb, sh + V3(-sx * 0.008, 0.008, 0.004), 0.021 * BR, surf, ua)  # humeral head
    long_bone(mb, sh, el, 0.012 * BR, surf, ua, 0, 0)
    knob(mb, el + V3(sx * 0.012, 0, 0.004), 0.011 * BR, surf, ua, (1, 1, 0.8))  # epicondyles
    knob(mb, el + V3(-sx * 0.014, 0, 0.004), 0.012 * BR, surf, ua, (1, 1, 0.8))
    knob(mb, el + V3(0, 0.018, 0.012), 0.011 * BR, surf, fa)  # olecranon
    seg(mb, el + V3(-sx * 0.012, 0.012, -0.01), wr + V3(-sx * 0.01, 0.008, 0.01), 0.0085 * BR, 0.0065 * BR, surf, fa, 5)
    seg(mb, el + V3(sx * 0.012, -0.008, -0.01), wr + V3(sx * 0.012, -0.012, 0.01), 0.0065 * BR, 0.0095 * BR, surf, fa, 5)
    carp = lerp(wr, tip, 0.15)
    for ix in range(3):
        for iz in range(2):
            knob(mb, carp + V3(0, -0.018 + ix * 0.017, -iz * 0.014), 0.007 * BR, surf, hd, seg_count=5, rings=3)
    knuck = lerp(wr, tip, 0.65)
    if hands == "claws":
        for i in range(3):
            o = V3(0, -0.022 + i * 0.022, 0)
            seg(mb, carp + o, knuck + o, 0.004 * BR, 0.005 * BR, surf, hd, 4)
            curve(mb, [knuck + o, knuck + o + V3(sx * 0.01, -0.05, -0.1), knuck + o + V3(sx * 0.02, -0.13, -0.24)],
                  0.008 * BR, 0.0015, surf, hd, 4, 2)
        return
    for i in range(4):
        o = V3(0, -0.026 + i * 0.017, 0)
        seg(mb, carp + o * 0.7, knuck + o, 0.0038 * BR, 0.0045 * BR, surf, hd, 4)  # metacarpal
        p, d = knuck + o, V3(0, -0.15, -1.0).normalized()
        for j, ln in enumerate((0.04, 0.026, 0.02)):
            d = (d + V3(0, -0.35, 0)).normalized()
            q = p + d * ln * (0.85 if i in (0, 3) else 1.0)
            seg(mb, p, q, 0.0042 * BR - j * 0.0008, 0.0036 * BR - j * 0.0008, surf, hd, 4)
            knob(mb, q, 0.0042 * BR, surf, hd, seg_count=4, rings=3)
            p = q
    t0 = carp + V3(-sx * 0.008, -0.03, -0.005)
    curve(mb, [t0, t0 + V3(-sx * 0.005, -0.03, -0.025), t0 + V3(-sx * 0.004, -0.045, -0.06)], 0.0045 * BR,
          0.0035 * BR, surf, hd, 4, 2)  # thumb


def bone_leg(mb, side, surf="bonec"):
    s = "." + side
    sx = 1 if side == "L" else -1
    th, sh, ft = "thigh" + s, "shin" + s, "foot" + s
    hip, kn = JOINT[th]
    an, toe = JOINT[ft]
    head = V3(sx * 0.1, -0.008, 0.94)
    troch = V3(sx * 0.145, 0.006, 0.915)
    knob(mb, head, 0.017 * BR, surf, th)  # femoral head
    seg(mb, head, troch, 0.01 * BR, 0.012 * BR, surf, th, 5)  # femoral neck
    knob(mb, troch, 0.015 * BR, surf, th, (1, 1, 1.3))  # greater trochanter
    long_bone(mb, troch + V3(-sx * 0.01, 0, -0.02), kn + V3(0, 0, 0.02), 0.0145 * BR, surf, th, 0, 0,
              (0, -0.012, 0))
    for o in (-0.017, 0.017):
        knob(mb, kn + V3(o, 0.006, 0.012), 0.017 * BR, surf, th)  # condyles
    knob(mb, kn + V3(0, -0.03, 0.012), 0.012 * BR, surf, sh, (1, 0.6, 1.25))  # patella
    blk(mb, kn + V3(0, 0, -0.024), (0.075, 0.058, 0.024), surf, sh)  # tibial plateau
    long_bone(mb, kn + V3(-sx * 0.004, 0, -0.03), an + V3(-sx * 0.006, 0, 0.02), 0.0125 * BR, surf, sh, 0, 0)
    seg(mb, kn + V3(sx * 0.024, 0.008, -0.03), an + V3(sx * 0.02, 0.006, 0.0), 0.0045 * BR, 0.0045 * BR, surf, sh, 4)
    knob(mb, an + V3(-sx * 0.016, 0, 0.005), 0.009 * BR, surf, sh)  # medial malleolus
    knob(mb, an + V3(sx * 0.02, 0.006, 0.0), 0.008 * BR, surf, sh)  # lateral malleolus
    knob(mb, an + V3(0, 0, -0.012), 0.015 * BR, surf, ft, (1, 1.2, 0.8))  # talus
    blk(mb, an + V3(0, 0.03, -0.05), (0.035, 0.06, 0.04), surf, ft, (0.25, 0, 0))  # calcaneus
    mid = an + V3(0, -0.04, -0.04)
    blk(mb, mid, (0.055, 0.04, 0.03), surf, ft)  # tarsals
    for i in range(5):
        x = -0.026 + i * 0.013
        base = mid + V3(x * 0.8, -0.015, 0.0)
        ball = V3(an.x + x * 1.3 - sx * 0.002, toe.y + 0.02, 0.018)
        seg(mb, base, ball, 0.004 * BR, 0.005 * BR, surf, ft, 4)
        p = ball
        for j, ln in enumerate((0.024, 0.016)):
            q = p + V3(0, -ln, -0.004 * (j + 1))
            seg(mb, p, q, 0.0045 * BR - j * 0.001, 0.004 * BR - j * 0.001, surf, ft, 4)
            p = q


# ---- tissue, cloth, gear
def remnants(mb, amount=1.0, seed=3):
    rng = random.Random(seed)
    th0, th1 = JOINT["thigh.L"]
    seg(mb, lerp(th0, th1, 0.2) + V3(0, -0.012, 0), lerp(th0, th1, 0.62) + V3(0, -0.01, 0), 0.026, 0.017, "flesh",
        "thigh.L", 6)
    ua0, ua1 = JOINT["upper_arm.R"]
    seg(mb, lerp(ua0, ua1, 0.12), lerp(ua0, ua1, 0.55), 0.02, 0.014, "flesh", "upper_arm.R", 6)
    for name in ("forearm.L", "forearm.R", "shin.L", "shin.R"):
        a, b = JOINT[name]
        for k in range(2):  # sinew strands across the joint below
            o = V3(rng.uniform(-0.012, 0.012), rng.uniform(-0.012, 0.012), 0)
            seg(mb, a + V3(0, 0, 0.035) + o, lerp(a, b, 0.25) + o, 0.0035, 0.003, "sinew", name, 4)
    if amount > 0.5:
        plate(mb, [V3(0.08, -0.12, 1.42), V3(0.15, -0.07, 1.4), V3(0.16, -0.05, 1.28), V3(0.1, -0.1, 1.25)], 0.012,
              "flesh", "spine")
        plate(mb, [V3(-0.15, 0.0, 1.36), V3(-0.155, -0.04, 1.33), V3(-0.14, -0.03, 1.24), V3(-0.15, 0.02, 1.26)],
              0.01, "flesh", "spine")
        seg(mb, V3(-0.12, -0.06, 1.24), V3(-0.13, -0.07, 1.13), 0.008, 0.002, "sinew", "spine", 4)  # hanging strip
        seg(mb, V3(0.03, -0.075, 1.5), V3(0.0, -0.06, 1.58), 0.012, 0.01, "sinew", "neck", 5)  # neck tendon


def loincloth(mb, length=0.32, belt=True, seed=1, surf="rag"):
    rng = random.Random(seed)
    if belt:
        ring = [V3(math.sin(a) * 0.155, -math.cos(a) * 0.115, 1.0 + 0.012 * math.cos(a)) for a in
                [i * math.pi / 6 for i in range(13)]]
        for a, b in zip(ring, ring[1:]):
            seg(mb, a, b, 0.011, 0.011, "strap", "hips", 4)
        knob(mb, (0.04, -0.12, 0.99), 0.018, "strap", "hips", (1.2, 0.7, 1.0))
    for y, tilt in ((-0.118, 0.1), (0.108, -0.1)):
        x = -0.11
        while x < 0.105:
            w = rng.uniform(0.035, 0.06)
            ln = length * rng.uniform(0.6, 1.0)
            v, f = grid(w, ln, 1, 5)
            v = [(px + x + w / 2, 0.006 * math.sin(pz * 19 + x * 40), -(ln - pz) - (0.02 if pz < 0.01 and px > 0 else 0))
                 for px, py, pz in v]
            v = [(px if pz > -ln * 0.75 else x + w / 2 + (px - x - w / 2) * 0.7, py, pz) for px, py, pz in v]
            mb.add(v, f + [tuple(reversed(face)) for face in f], surf, T(0, y, 0.99, rx=tilt), "hips")
            x += w - 0.004


def cape(mb, surf="rag", seed=5):
    rng = random.Random(seed)
    x = -0.2
    while x < 0.2:
        w = rng.uniform(0.05, 0.08)
        ln = rng.uniform(0.75, 1.0)
        v, f = grid(w, ln, 1, 8)
        v = [(px + x + w / 2, 0.02 * math.sin(pz * 6 + x * 20) + (ln - pz) * 0.12, -(ln - pz)) for px, py, pz in v]
        mb.add(v, f + [tuple(reversed(face)) for face in f], surf, T(0, 0.15, 1.5), "spine")
        x += w - 0.006


def pauldron(mb, side, surf="plate", spikes=False, layers=3):
    s = "." + side
    sh = JOINT["upper_arm" + s][0]
    sx = 1 if side == "L" else -1
    for i in range(layers):
        c = sh + V3(sx * (0.025 + i * 0.012), 0, 0.035 - i * 0.05)
        mb.add(*sphere(0.085 - i * 0.008, 8, 5, squash=(1.0, 1.15, 0.45)), surf, T(c.x, c.y, c.z, ry=sx * (0.5 + i * 0.15)),
               "upper_arm" + s)
        for k in range(5):  # rivets
            a = math.radians(-60 + k * 30)
            knob(mb, c + V3(sx * 0.04, math.sin(a) * 0.07, 0.02 + math.cos(a) * 0.005), 0.006, "trim",
                 "upper_arm" + s, seg_count=4, rings=3)
    if spikes:
        for i in range(3):
            base = sh + V3(sx * 0.05, -0.05 + i * 0.05, 0.06)
            seg(mb, base, base + V3(sx * 0.07, 0, 0.15), 0.018, 0.0, "darkbone", "upper_arm" + s, 5)


def armor(mb, surf="plate"):
    knob(mb, (0, -0.01, 1.34), 0.215, surf, "spine", (0.95, 0.76, 0.98), 10, 7)  # breast and back plate
    seg(mb, (0, -0.172, 1.46), (0, -0.172, 1.22), 0.009, 0.009, surf, "spine", 4)  # medial ridge
    ring = [V3(math.sin(a) * 0.12, -0.02 - math.cos(a) * 0.1, 1.5) for a in [i * math.pi / 6 for i in range(13)]]
    for a, b in zip(ring, ring[1:]):
        seg(mb, a, b, 0.012, 0.012, "trim", "spine", 4)  # gorget rim
    knob(mb, (0, -0.05, 1.2), 0.15, surf, "spine", (1.0, 0.72, 0.55), 8, 5)  # plackart
    for k in range(9):
        a = math.radians(-80 + k * 20)
        knob(mb, V3(math.sin(a) * 0.165, -0.02 - math.cos(a) * 0.13, 1.27), 0.007, "trim", "spine", seg_count=4,
             rings=3)
    for a, b in (((-0.1, 1.45), (0.1, 1.29)), ((0.1, 1.45), (-0.1, 1.29))):
        seg(mb, V3(a[0], -0.166, a[1]), V3(b[0], -0.166, b[1]), 0.006, 0.006, "trim", "spine", 4)
    v, f = cylinder(0.17, 0.155, 0.2, 12, caps=False)
    mb.add(v, f + [tuple(reversed(x)) for x in f], "mail", T(0, -0.01, 0.84, s=(1.0, 0.8, 1.0)), "hips")  # mail skirt
    for i in range(3):  # faulds
        v, f = cylinder(0.172 + i * 0.01, 0.18 + i * 0.01, 0.045, 12, caps=False)
        mb.add(v, f + [tuple(reversed(x)) for x in f], surf, T(0, -0.01, 1.08 - i * 0.04), "hips")
    for side in ("L", "R"):
        s = "." + side
        sx = 1 if side == "L" else -1
        el, wr = JOINT["forearm" + s]
        for k in range(3):  # gauntlet lames
            seg(mb, lerp(el, wr, 0.3 + k * 0.22), lerp(el, wr, 0.5 + k * 0.22), 0.03 + k * 0.004, 0.034 + k * 0.004,
                surf, "forearm" + s, 7)
        kn, an = JOINT["shin" + s]
        seg(mb, lerp(kn, an, 0.12), lerp(kn, an, 0.82), 0.04, 0.03, surf, "shin" + s, 7)  # greave
        knob(mb, kn + V3(0, -0.03, 0.005), 0.04, surf, "shin" + s, (1, 0.7, 1))  # poleyn
        plate(mb, [kn + V3(sx * 0.03, -0.03, 0.03), kn + V3(sx * 0.07, -0.0, 0.0), kn + V3(sx * 0.03, -0.02, -0.04)],
              0.008, surf, "shin" + s)
        plate(mb, [V3(sx * 0.05, -0.135, 0.98), V3(sx * 0.17, -0.1, 0.98), V3(sx * 0.16, -0.1, 0.82),
                   V3(sx * 0.06, -0.125, 0.8)], 0.01, surf, "thigh" + s)  # tasset


def helmet(mb, surf="plate", spike=True):
    c = JOINT["head"][0] + V3(0, -0.03, 0.23)
    mb.add(*sphere(0.18, 10, 7, squash=(0.92, 1.0, 0.78)), surf, T(c.x, c.y + 0.01, c.z + 0.03), "head")
    v, f = cylinder(0.215, 0.19, 0.03, 12)
    mb.add(v, f, surf, T(c.x, c.y + 0.01, c.z - 0.035, s=(1.0, 1.08, 1.0)), "head")  # brim
    blk(mb, c + V3(0, -0.17, -0.07), (0.03, 0.035, 0.13), surf, "head")  # nasal guard
    for sx in (-1, 1):
        plate(mb, [c + V3(sx * 0.15, -0.08, -0.04), c + V3(sx * 0.16, 0.06, -0.04), c + V3(sx * 0.13, 0.02, -0.2),
                   c + V3(sx * 0.12, -0.08, -0.17)], 0.012, surf, "head")  # cheek guards
    ring = [c + V3(math.sin(a) * 0.168, math.cos(a) * 0.18 + 0.01, 0.0) for a in [i * math.pi / 8 for i in range(17)]]
    for a, b in zip(ring, ring[1:]):
        seg(mb, a, b, 0.008, 0.008, "trim", "head", 4)
    if spike:
        seg(mb, c + V3(0, 0.01, 0.13), c + V3(0, 0.02, 0.34), 0.03, 0.0, surf, "head", 6)


def antlers(mb):
    c = JOINT["head"][0] + V3(0, 0.02, 0.33)
    for sx in (-1, 1):
        p = c + V3(sx * 0.08, 0, 0)
        knob(mb, p, 0.03, "antler", "head", (1, 1, 0.6))  # burr
        main = [p, p + V3(sx * 0.12, 0.03, 0.12), p + V3(sx * 0.17, 0.06, 0.3), p + V3(sx * 0.22, 0.02, 0.45),
                p + V3(sx * 0.3, -0.03, 0.55)]
        curve(mb, main, 0.022, 0.011, "antler", "head", 6, 3)
        for base, dv in ((main[1], (sx * 0.02, -0.14, 0.1)), (main[2], (-sx * 0.04, -0.06, 0.18)),
                         (main[2], (sx * 0.16, -0.02, 0.05)), (main[3], (sx * 0.0, -0.04, 0.16)),
                         (main[3], (sx * 0.14, 0.03, 0.06))):
            curve(mb, [base, base + V3(*dv) * 0.5 + V3(0, 0, 0.02), base + V3(*dv)], 0.013, 0.002, "antler", "head",
                  5, 2)


def spiked_club(mb, side="R"):
    s = "." + side
    wr, tip = JOINT["hand" + s]
    grip = lerp(wr, tip, 0.55)
    end = grip + V3(0, -0.55, -0.12)
    seg(mb, grip + V3(0, 0.1, 0.02), end, 0.022, 0.032, "strap", "hand" + s, 7)
    for k in range(4):  # leather wrap
        seg(mb, lerp(grip, end, 0.05 + k * 0.05), lerp(grip, end, 0.08 + k * 0.05), 0.027, 0.027, "rag", "hand" + s, 7)
    head = lerp(grip, end, 0.82)
    seg(mb, head, end + V3(0, -0.05, -0.01), 0.065, 0.07, "rust", "hand" + s, 8)
    for ring in (0.0, 0.5):
        for i in range(8):
            a = i * math.pi / 4 + ring * 0.4
            d = V3(math.cos(a), 0.0, math.sin(a))
            p = lerp(head, end, 0.3 + ring * 0.5)
            seg(mb, p + d * 0.06, p + d * 0.15 + V3(0, -0.03, 0), 0.016, 0.0, "plate", "hand" + s, 5)


def ghoul_flesh(mb):
    """Rotten flesh over the right half of the torso and the limbs; left ribs stay exposed."""
    knob(mb, (-0.05, -0.0, 1.36), 0.17, "ghoul", "spine", (0.72, 0.72, 1.0), 9, 6)
    knob(mb, (0.0, 0.03, 1.36), 0.15, "ghoul", "spine", (1.0, 0.55, 1.0), 9, 6)  # back muscles
    knob(mb, (0, -0.02, 1.16), 0.12, "ghoul", "spine", (1.0, 0.75, 0.75), 8, 5)  # abdomen
    knob(mb, (0, 0.0, 0.99), 0.14, "ghoul", "hips", (1.1, 0.8, 0.6), 8, 5)
    knob(mb, (0, 0.01, 1.54), 0.055, "ghoul", "neck", (1, 1, 1.3))
    plate(mb, [V3(0.02, -0.15, 1.45), V3(0.09, -0.13, 1.44), V3(0.11, -0.12, 1.25), V3(0.02, -0.13, 1.22)], 0.015,
          "flesh", "spine")  # torn edge
    blk(mb, (-0.09, -0.12, 1.12), (0.06, 0.03, 0.05), "flesh", "spine")
    for side in ("L", "R"):
        s = "." + side
        sx = 1 if side == "L" else -1
        sh = JOINT["upper_arm" + s][0]
        knob(mb, sh + V3(sx * 0.01, 0, 0.0), 0.05, "ghoul", "upper_arm" + s, (1, 1, 1.2))  # deltoid
        for name, r1, r2, t0, t1 in (("upper_arm", 0.03, 0.022, 0.1, 0.85), ("forearm", 0.026, 0.016, 0.05, 0.8),
                                     ("thigh", 0.048, 0.03, 0.08, 0.85), ("shin", 0.034, 0.018, 0.05, 0.7)):
            a, b = JOINT[name + s]
            seg(mb, lerp(a, b, t0) + V3(0, 0.004, 0), lerp(a, b, t1), r1, r2, "ghoul", name + s, 7)
    seg(mb, lerp(*JOINT["thigh.R"], 0.3) + V3(0, -0.04, 0), lerp(*JOINT["thigh.R"], 0.5) + V3(0, -0.035, 0), 0.02,
        0.015, "flesh", "thigh.R", 5)
    seg(mb, lerp(*JOINT["forearm.L"], 0.3) + V3(0.02, -0.01, 0), lerp(*JOINT["forearm.L"], 0.6) + V3(0.02, -0.01, 0),
        0.018, 0.012, "flesh", "forearm.L", 5)


# ---- animation (authored as rotations on armature axes; see pose_rot)
def pose_rot(arm, bone, deg):
    """X+: spine leans forward / hanging limbs swing back. Y+: hanging limbs move toward -X."""
    rest = arm.data.bones[bone].matrix_local.to_3x3()
    world = Euler([math.radians(d) for d in deg], "XYZ").to_matrix()
    return (rest.inverted() @ world @ rest).to_quaternion()


STANCE = {"spine": (5, 0, 0), "neck": (4, 0, 0), "head": (-6, 0, 0), "upper_arm.L": (0, -6, 0),
          "upper_arm.R": (0, 6, 0), "forearm.L": (-10, 0, 0), "forearm.R": (-10, 0, 0)}


def key_pose(arm, frame, pose, hips_offset=(0, 0, 0)):
    for name, _h, _t, _p in RIG:
        pb = arm.pose.bones[name]
        deg = list(STANCE.get(name, (0, 0, 0)))
        if name in pose:
            deg = [deg[i] + pose[name][i] for i in range(3)]
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = pose_rot(arm, name, deg)
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        if name == "hips":
            rest = arm.data.bones[name].matrix_local.to_3x3()
            pb.location = rest.inverted() @ Vector(hips_offset)
            pb.keyframe_insert("location", frame=frame)


def mirror(pose):
    out = {}
    for k, v in pose.items():
        nk = k[:-2] + (".R" if k.endswith(".L") else ".L") if k[-2:] in (".L", ".R") else k
        out[nk] = (v[0], -v[1], -v[2])
    return out


def animate(arm):
    arm.animation_data_create()
    clips = []

    def clip(name, keys, end):
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        arm.animation_data.action = action
        for frame, pose, offset in keys:
            key_pose(arm, frame, pose, offset)
        clips.append((name, action, end))

    rest = {"upper_arm.L": (-4, 0, 0), "upper_arm.R": (-2, 0, 0)}
    breathe = {"spine": (3, -2, 0), "head": (4, 0, -6), "upper_arm.L": (2, -3, 0), "upper_arm.R": (3, 3, 0),
               "forearm.L": (-6, 0, 0), "forearm.R": (-6, 0, 0)}
    clip("Idle", [(0, rest, (0, 0, 0)), (24, breathe, (0, 0, -0.012)), (48, rest, (0, 0, 0))], 48)

    stride = {"thigh.L": (-28, 0, 0), "shin.L": (8, 0, 0), "foot.L": (-6, 0, 0), "thigh.R": (20, 0, 0),
              "shin.R": (26, 0, 0), "upper_arm.L": (22, 0, 0), "upper_arm.R": (-24, 0, 0), "forearm.R": (-14, 0, 0),
              "spine": (3, 0, 7), "head": (0, 0, -5)}
    passing = {"thigh.L": (-6, 0, 0), "shin.L": (4, 0, 0), "thigh.R": (-12, 0, 0), "shin.R": (50, 0, 0),
               "foot.R": (12, 0, 0), "spine": (4, 0, 0)}
    clip("Walk", [(0, stride, (0, 0, -0.02)), (8, passing, (0, 0, 0.02)), (16, mirror(stride), (0, 0, -0.02)),
                  (24, mirror(passing), (0, 0, 0.02)), (32, stride, (0, 0, -0.02))], 32)

    wind = {"upper_arm.R": (-150, 0, 0), "forearm.R": (-30, 0, 0), "upper_arm.L": (-40, -10, 0),
            "spine": (-10, 0, -18), "head": (-8, 0, 0)}
    strike = {"upper_arm.R": (-55, 0, 0), "forearm.R": (-5, 0, 0), "upper_arm.L": (-70, 0, 0),
              "forearm.L": (-10, 0, 0), "spine": (26, 0, 16), "head": (-10, 0, 0), "thigh.L": (-28, 0, 0),
              "shin.L": (22, 0, 0)}
    clip("Attack", [(0, rest, (0, 0, 0)), (9, wind, (0, 0.04, 0)), (13, strike, (0, -0.14, -0.05)),
                    (24, rest, (0, 0, 0))], 24)

    flinch = {"spine": (-20, 6, 0), "head": (-25, 10, 0), "upper_arm.L": (-30, -22, 0), "upper_arm.R": (-20, 22, 0)}
    clip("Hit", [(0, rest, (0, 0, 0)), (3, flinch, (0, 0.06, 0)), (12, rest, (0, 0, 0))], 12)

    buckle = {"spine": (-15, 0, 0), "thigh.L": (-35, 0, 0), "shin.L": (45, 0, 0), "thigh.R": (-25, 0, 0),
              "shin.R": (50, 0, 0), "upper_arm.L": (-45, -25, 0), "upper_arm.R": (-40, 25, 0), "head": (-30, 0, 0)}
    fallen = {"hips": (-84, 0, 0), "spine": (-8, 0, 0), "head": (-10, 0, 14), "thigh.L": (-10, 0, 0),
              "thigh.R": (-18, 0, 6), "shin.L": (8, 0, 0), "shin.R": (14, 0, 0), "upper_arm.L": (10, -70, 0),
              "upper_arm.R": (14, 66, 0), "forearm.L": (-20, 0, 0)}
    settle = dict(fallen, head=(-14, 0, 24), **{"upper_arm.L": (6, -82, 0)})
    clip("Death", [(0, rest, (0, 0, 0)), (9, buckle, (0, 0.05, -0.3)), (20, fallen, (0, 0.25, -0.8)),
                   (25, fallen, (0, 0.27, -0.76)), (40, settle, (0, 0.27, -0.8))], 40)

    for name, action, end in clips:
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, action)
        strip.action_frame_end = end
    arm.animation_data.action = None


def rig_character(name, mb):
    body = mb.build(name + "_mesh", ao=True, grime=True)
    arm_data = bpy.data.armatures.new(name + "_rig")
    arm = bpy.data.objects.new(name, arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for bname, head, tail, parent in RIG:
        eb = arm_data.edit_bones.new(bname)
        eb.head, eb.tail, eb.roll = head, tail, 0.0
        if parent:
            eb.parent = arm_data.edit_bones[parent]
            eb.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    groups = {b[0]: body.vertex_groups.new(name=b[0]) for b in RIG}
    for i, bone in enumerate(mb.vbone):
        groups[bone or "spine"].add([i], 1.0, "REPLACE")
    body.parent = arm
    mod = body.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    animate(arm)
    export(name)


SKULL_CENTER = JOINT["head"][0] + V3(0, -0.02, 0.17)


def skeleton_core(mb, surf="bonec", hands="fingers", eyes=None, damage=False, teeth="teeth"):
    skull(mb, SKULL_CENTER, 0.15, eyes, surf, damage=damage, teeth=teeth)
    for i in range(4):  # cervical vertebrae
        z = 1.5 + i * 0.03
        blk(mb, (0, 0.03 - i * 0.008, z), (0.028 * BR, 0.026 * BR, 0.018), surf, "neck")
        seg(mb, (0, 0.045 - i * 0.008, z), (0, 0.075 - i * 0.008, z - 0.012), 0.005 * BR, 0.003 * BR, surf, "neck", 4)
    ribcage(mb, surf)
    pelvis(mb, surf)
    for side in ("L", "R"):
        bone_arm(mb, side, surf, hands)
        bone_leg(mb, side, surf)


def build_skeleton():
    reset()
    mb = MeshBuilder()
    skeleton_core(mb, damage=True)
    remnants(mb, 1.0, 3)
    loincloth(mb, 0.34, True, 1)
    pauldron(mb, "L", "rust", spikes=True, layers=1)
    spiked_club(mb)
    rig_character("skeleton", mb)


def build_reaper():
    reset()
    mb = MeshBuilder()
    skeleton_core(mb, hands="claws")
    remnants(mb, 0.4, 8)
    loincloth(mb, 0.42, True, 4)
    seg(mb, (0.17, -0.11, 1.48), (-0.15, -0.135, 1.05), 0.016, 0.016, "strap", "spine", 4)  # bandolier
    seg(mb, (0.17, 0.12, 1.48), (-0.15, 0.1, 1.05), 0.016, 0.016, "strap", "spine", 4)
    for k in range(4):
        knob(mb, lerp((0.17, -0.11, 1.48), (-0.15, -0.135, 1.05), 0.2 + k * 0.18) + V3(0, -0.012, 0), 0.012, "rust",
             "spine", seg_count=4, rings=3)
    c = SKULL_CENTER
    for i in range(4):  # broken bone crest
        seg(mb, c + V3(0.02 + i * 0.018, 0.04, 0.12), c + V3(0.04 + i * 0.03, 0.08, 0.24 - i * 0.03), 0.013, 0.0,
            "bonec", "head", 4)
    rig_character("skeleton_reaper", mb)


def build_knight():
    reset()
    mb = MeshBuilder()
    skeleton_core(mb, eyes="eyered")
    armor(mb, "plate")
    helmet(mb, "plate")
    for side in ("L", "R"):
        pauldron(mb, side, "plate")
    loincloth(mb, 0.3, False, 6)
    rig_character("skeleton_knight", mb)


def build_warlord():
    reset()
    mb = MeshBuilder()
    skeleton_core(mb, surf="darkbone", eyes="eyeglow", teeth="darkbone")
    armor(mb, "blackplate")
    antlers(mb)
    for side in ("L", "R"):
        pauldron(mb, side, "blackplate", spikes=True)
    loincloth(mb, 0.48, False, 7)
    cape(mb)
    plate(mb, [V3(0, -0.168, 1.41), V3(0.03, -0.168, 1.37), V3(0, -0.168, 1.33), V3(-0.03, -0.168, 1.37)], 0.012,
          "eyeglow", "spine")  # chest ember
    rig_character("skeleton_warlord", mb)


def build_ghoul():
    reset()
    mb = MeshBuilder()
    skeleton_core(mb, surf="ghoul", eyes="eyered")
    ribcage(mb, "bonec", 1.02)
    ghoul_flesh(mb)
    c = SKULL_CENTER
    for i in range(4):  # stitches across the scalp
        seg(mb, c + V3(-0.06 + i * 0.035, -0.11, 0.1), c + V3(-0.045 + i * 0.035, -0.07, 0.15), 0.004, 0.004,
            "strap", "head", 4)
    seg(mb, c + V3(-0.08, -0.1, 0.12), c + V3(0.08, -0.06, 0.15), 0.004, 0.004, "flesh", "head", 4)
    loincloth(mb, 0.36, True, 9, "strap")
    rig_character("ghoul", mb)


def build_horned_skull():
    """Floating skull boss: static mesh; bobbing and jaw motion are driven in-engine."""
    reset()
    mb = MeshBuilder()
    skull(mb, (0, 0, 0), 0.42, "eyeglow", "bonec", None, jaw_open=0.12, damage=True)
    for sx in (-1, 1):
        ctrl = [V3(sx * 0.3, 0.08, 0.2), V3(sx * 0.5, 0.15, 0.35), V3(sx * 0.68, 0.12, 0.62), V3(sx * 0.74, 0.0, 0.9),
                V3(sx * 0.68, -0.15, 1.08)]
        pts = catmull(ctrl, 3)
        for i, (a, b) in enumerate(zip(pts, pts[1:])):
            r0 = 0.11 * (1 - i / len(pts)) + 0.004
            r1 = 0.11 * (1 - (i + 1) / len(pts)) + 0.002
            seg(mb, a, b, r0, r1, "antler" if i < 4 else "bonec", None, 7)
            knob(mb, a, r0 * 1.06, "antler" if i < 4 else "bonec", None, (1, 1, 0.5), 7, 3)  # growth ridges
    mb.build("skull_horned", ao=True)
    export("skull_horned")


if __name__ == "__main__":
    only = None
    if "--" in sys.argv:
        args = sys.argv[sys.argv.index("--") + 1:]
        only = set(args) if args else None
    builders = [
        ("weapon", build_weapon), ("gate", build_gate), ("brazier", build_brazier),
        ("tree_a", lambda: build_tree("tree_a", 11, 5.5)), ("tree_b", lambda: build_tree("tree_b", 29, 6.5)),
        ("graves", build_graves), ("gallows", build_gallows), ("rock", build_rocks), ("crystal", build_crystal),
        ("wall", build_wall), ("skeleton", build_skeleton), ("skeleton_reaper", build_reaper),
        ("skeleton_knight", build_knight), ("skeleton_warlord", build_warlord), ("ghoul", build_ghoul),
        ("skull_horned", build_horned_skull),
    ]
    for key, fn in builders:
        if only is None or key in only:
            fn()
    print("Saved Battle Hell kit: .blend + .glb in", ROOT)
