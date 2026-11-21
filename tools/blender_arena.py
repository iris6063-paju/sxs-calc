"""Builds the stone colosseum around the board (assets/models/env_colosseum.glb) in Blender, from code.
blender -b --factory-startup --python tools/blender_arena.py -- <out.glb> [preview.png]

Frame: three.js x = Blender x, three.js y = Blender z, three.js z = -Blender y (glTF export, +Y up).
The board covers x -8.4..8.4, z -7.2..7.2 and its tiles sit at y 0.03..0.08; the camera looks from +z (Blender -y), so that
side stays open. The battle-log monitor stands at z -10.6 (Blender y 10.6); the gate rises behind it.
Materials are named so the page can recolour them per ground theme: stone, stone_dark, trim, wood, gold, cloth_a, cloth_b,
fire (glow), crystal (glow), leaf, grass."""
import bpy, sys, math, random

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'env_colosseum.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
random.seed(20261121)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

MATS = {}
def mat(name, rgb, emit=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = 0.85
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    MATS[name] = m; return m

STONE = mat('stone', (0.78, 0.74, 0.66)); STONE_D = mat('stone_dark', (0.47, 0.45, 0.42)); TRIM = mat('trim', (0.86, 0.82, 0.72))
WOOD = mat('wood', (0.42, 0.27, 0.16)); GOLD = mat('gold', (0.95, 0.72, 0.25)); CLA = mat('cloth_a', (0.22, 0.45, 0.95)); CLB = mat('cloth_b', (0.92, 0.28, 0.26))
FIRE = mat('fire', (1.0, 0.55, 0.12), 4.0); CRYS = mat('crystal', (0.45, 0.85, 1.0), 1.5); LEAF = mat('leaf', (0.35, 0.62, 0.30)); GRASS = mat('grass', (0.48, 0.70, 0.33))

def put(obj, m, name):
    obj.name = name; obj.data.materials.clear(); obj.data.materials.append(m); return obj

def cyl(name, m, r, depth, loc, verts=24, r2=None, rot=(0, 0, 0)):
    if r2 is None: bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else: bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    return put(bpy.context.object, m, name)

def box(name, m, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.scale = size; return put(o, m, name)

def bevel(o, w=0.04):
    b = o.modifiers.new('bev', 'BEVEL'); b.width = w; b.segments = 2; b.limit_method = 'ANGLE'

CAM_OPEN = math.radians(-90)  # Blender -y = the camera side
def open_side(a, half):
    d = (a - CAM_OPEN + math.pi) % (2 * math.pi) - math.pi
    return abs(d) < half

# 1. the dais: a stone disc under the board with a darker inlaid ring and a trim edge
cyl('dais', STONE, 12.8, 0.5, (0, 0, -0.27), 72)
cyl('dais_edge', TRIM, 13.0, 0.18, (0, 0, -0.06), 72)
ring_in = cyl('dais_ring', STONE_D, 11.9, 0.06, (0, 0, -0.005), 72)
cyl('dais_ring_cut', STONE, 11.2, 0.07, (0, 0, -0.0), 72)
# 2. the ring wall with crenellations, open toward the camera
R_WALL, N_SEG = 13.9, 40
for i in range(N_SEG):
    a = (i + 0.5) / N_SEG * 2 * math.pi
    if open_side(a, math.radians(48)): continue
    x, y = math.cos(a) * R_WALL, math.sin(a) * R_WALL
    seg = box(f'wall_{i}', STONE, (0.9, 2 * math.pi * R_WALL / N_SEG + 0.05, 1.5), (x, y, 0.5), (0, 0, a)); bevel(seg, 0.05)
    if i % 2 == 0: box(f'merlon_{i}', STONE, (0.95, 1.0, 0.5), (math.cos(a) * R_WALL, math.sin(a) * R_WALL, 1.5), (0, 0, a))
    box(f'wallcap_{i}', TRIM, (1.05, 2 * math.pi * R_WALL / N_SEG + 0.07, 0.14), (x, y, 1.28), (0, 0, a))
# 3. pillars with braziers and team banners (team A on -x, team B on +x)
FIRES = []
for i in range(12):
    a = (i + 0.5) / 12 * 2 * math.pi
    if open_side(a, math.radians(40)): continue
    r = R_WALL + 1.0
    x, y = math.cos(a) * r, math.sin(a) * r
    cyl(f'pillar_base_{i}', TRIM, 0.75, 0.5, (x, y, 0.25), 8)
    p = cyl(f'pillar_{i}', STONE, 0.5, 4.6, (x, y, 2.75), 8); bevel(p, 0.03)
    cyl(f'pillar_cap_{i}', TRIM, 0.72, 0.4, (x, y, 5.2), 8)
    cyl(f'brazier_{i}', GOLD, 0.62, 0.45, (x, y, 5.62), 10, r2=0.35)
    f = cyl(f'fire_{i}', FIRE, 0.42, 0.9, (x, y, 6.15), 7, r2=0.02); FIRES.append(f)
    side = CLA if x < 0 else CLB
    bx, by = math.cos(a) * (r - 0.55), math.sin(a) * (r - 0.55)
    box(f'banner_{i}', side, (0.06, 1.0, 2.2), (bx, by, 3.3), (0, 0, a))
    box(f'banner_rod_{i}', WOOD, (0.12, 1.25, 0.1), (bx, by, 4.45), (0, 0, a))
    box(f'banner_trim_{i}', GOLD, (0.07, 1.02, 0.18), (bx, by, 2.25), (0, 0, a))
# 4. the gate behind the battle-log monitor (Blender +y)
for s in (-1, 1):
    t = cyl(f'tower_{s}', STONE, 1.35, 7.5, (s * 6.2, 15.2, 3.75), 10); bevel(t, 0.04)
    cyl(f'tower_top_{s}', TRIM, 1.55, 0.5, (s * 6.2, 15.2, 7.75), 10)
    cyl(f'tower_roof_{s}', CLB if s > 0 else CLA, 1.6, 2.2, (s * 6.2, 15.2, 9.1), 10, r2=0.05)
    cyl(f'tower_flagpole_{s}', WOOD, 0.06, 2.2, (s * 6.2, 15.2, 11.2), 6)
    box(f'tower_flag_{s}', CLB if s > 0 else CLA, (0.05, 1.1, 0.7), (s * 6.2 + 0.0, 15.75, 11.9))
arch = box('gate_beam', STONE, (13.6, 1.6, 1.3), (0, 15.2, 6.9)); bevel(arch, 0.05)
box('gate_beam_trim', TRIM, (13.9, 1.75, 0.22), (0, 15.2, 6.2))
cyl('gate_emblem', GOLD, 1.25, 0.25, (0, 14.35, 6.9), 24, rot=(math.radians(90), 0, 0))
cyl('gate_emblem_core', CRYS, 0.6, 0.3, (0, 14.25, 6.9), 6, rot=(math.radians(90), 0, 0))
box('gate_wall', STONE_D, (9.8, 0.8, 6.2), (0, 15.6, 3.1))
# 5. crystals and rocks outside the wall, a few round trees
for k, (a, r) in enumerate([(25, 17.0), (155, 17.2), (60, 18.5), (120, 18.0), (200, 16.8), (340, 16.9)]):
    ar = math.radians(a)
    for j in range(3):
        h = 1.4 + random.random() * 1.8
        cx, cy = math.cos(ar) * r + random.uniform(-0.8, 0.8), math.sin(ar) * r + random.uniform(-0.8, 0.8)
        cyl(f'crystal_{k}_{j}', CRYS, 0.32 + random.random() * 0.2, h, (cx, cy, h / 2), 6, r2=0.05, rot=(random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25), 0))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.9, location=(math.cos(ar) * (r + 1.2), math.sin(ar) * (r + 1.2), 0.3))
    put(bpy.context.object, STONE_D, f'rock_{k}')
for k, a in enumerate([10, 40, 140, 170, 75, 105, 190, 350]):
    ar = math.radians(a); r = 19.5 + random.random() * 1.2
    x, y = math.cos(ar) * r, math.sin(ar) * r
    cyl(f'tree_trunk_{k}', WOOD, 0.22, 1.8, (x, y, 0.9), 7)
    for j in range(3):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0 - j * 0.18, location=(x + random.uniform(-0.4, 0.4), y + random.uniform(-0.4, 0.4), 2.0 + j * 0.7))
        put(bpy.context.object, LEAF, f'tree_crown_{k}_{j}')
# 6. a grass ring between the dais and the wall line, outside the board
cyl('grass_ring', GRASS, 15.6, 0.1, (0, 0, -0.58), 72)

# apply modifiers and export
for o in sc.objects:
    if o.type != 'MESH': continue
    bpy.context.view_layer.objects.active = o
    for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
# one mesh per material (a dozen draw calls instead of two hundred)
for m in list(MATS.values()):
    objs = [o for o in sc.objects if o.type == 'MESH' and o.data.materials and o.data.materials[0] == m]
    if len(objs) < 2: continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = m.name
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True, export_draco_mesh_compression_enable=True,
                          export_draco_mesh_compression_level=6, export_tangents=False, export_texcoords=False)
print('ARENA', OUT, len([o for o in sc.objects if o.type == 'MESH']), 'meshes')

if PREVIEW:
    cam_d = bpy.data.cameras.new('cam'); cam_d.lens = 32
    cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (0, -24, 14); cam.rotation_euler = (math.radians(62), 0, 0)
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.5
    so = bpy.data.objects.new('sun', sun); so.rotation_euler = (math.radians(45), math.radians(10), math.radians(35)); sc.collection.objects.link(so)
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get('Background'); bg.inputs[0].default_value = (0.55, 0.75, 0.95, 1); bg.inputs[1].default_value = 1.0
    sc.render.resolution_x, sc.render.resolution_y = 900, 520
    sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
