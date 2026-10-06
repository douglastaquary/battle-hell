"""Run: blender --background --python tools/build_blender_assets.py
Blender 4.2 LTS; generates editable source and GLB examples, not final artwork.
"""
import bpy, math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1] / 'assets' / 'models'
ROOT.mkdir(parents=True, exist_ok=True)
def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
def material(name, color, metal=0, rough=.5):
    m=bpy.data.materials.new(name); m.use_nodes=True
    n=m.node_tree.nodes.get('Principled BSDF')
    n.inputs['Base Color'].default_value=(*color,1)
    n.inputs['Metallic'].default_value=metal
    n.inputs['Roughness'].default_value=rough
    return m
def cube(name, pos, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o=bpy.context.object; o.name=name; o.scale=size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel=o.modifiers.new('edge highlights','BEVEL');bevel.width=.018;bevel.segments=2
    o.data.materials.append(mat);return o
def save(name):
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/(name+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(ROOT/(name+'.glb')),export_format='GLB',export_apply=True)
reset()
steel=material('worn steel',(.12,.15,.18),.85,.32)
brass=material('aged brass',(.46,.28,.065),.72,.4)
wood=material('dark wood',(.16,.055,.02),0,.65)
# Blender +Y becomes glTF -Z: barrels point forward after export.
for x in [-.09,.09]:
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.072, depth=.85, location=(x,.2,0), rotation=(math.pi/2,0,0))
    bpy.context.object.name='barrel';bpy.context.object.data.materials.append(steel)
    for y in [-.13,.15,.48]:cube('brass band',(x,y,0),(.17,.035,.17),brass)
cube('stock',(0,-.35,-.10),(.24,.50,.22),wood)
cube('receiver',(0,-.05,0),(.30,.20,.20),steel)
for i in range(5):cube('engraving',(0,-.4+i*.06,.017),(.17,.012,.012),brass)
save('weapon')
reset();armor=material('armor',(.17,.20,.22),.65,.55)
cube('torso',(0,0,1.25),(.8,.4,1.),armor)
cube('helmet',(0,0,2.),(.42,.38,.42),armor)
for x in [-.25,.25]:cube('leg',(x,0,.4),(.23,.25,.8),armor)
for x in [-.55,.55]:cube('arm',(x,0,1.25),(.22,.25,.9),armor)
save('enemy')
reset();stone=material('stone',(.24,.23,.20),0,.8)
for x in [-5,5]:cube('pillar',(x,0,2.5),(1.3,1.3,5),stone)
cube('lintel',(0,0,5),(11.3,1.3,.7),stone)
save('ruin')
print('Saved weapon, enemy and ruin: .blend + .glb')
