"""Reviews / fixes the rigged hero GLBs in Blender: hair and capes that the auto-rig weighted to the arm bones.
blender -b --factory-startup --python tools/blender_heroes.py -- <src_dir> <out_dir> [analyse|fix] [designs...]

A vertex whose main weight is on an arm bone (upper arm, forearm, hand) but which lies farther from that bone's segment than
the arm itself (hair, a braid, a cape edge) is re-weighted to the torso chain (Spine / neck / Head by height), so the
pose code can swing the arms without dragging the hair. Then the GLB is written back with Draco compression and a
1024px JPEG texture."""
import bpy, sys, os, math
from mathutils import Vector
from mathutils.geometry import intersect_point_line

argv = sys.argv[sys.argv.index('--') + 1:]
src, out, mode = argv[0], argv[1], argv[2] if len(argv) > 2 else 'analyse'
only = set(argv[3:])
os.makedirs(out, exist_ok=True)
ARM = ['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand']
# per design: which arm bones lose their far vertices and the distance (fraction of the model height) where that starts.
# The hands are left alone (held staffs / books are weighted to them); the casters' wide sleeves stay on their arms.
FIX = {'knight': {'bones': ['RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm'], 'th': 0.065},
       'warrior': {'bones': ['LeftArm', 'RightArm'], 'th': 0.07}}


def seg_dist(p, a, b):
    t = intersect_point_line(p, a, b)[1]
    t = max(0.0, min(1.0, t))
    return (p - (a + (b - a) * t)).length


for f in sorted(os.listdir(src)):
    if not f.endswith('.glb'): continue
    d = f[:-4]
    if only and d not in only: continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, f))
    arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    mw, aw = mesh.matrix_world, arm.matrix_world
    bones = {b.name: (aw @ b.head_local, aw @ b.tail_local) for b in arm.data.bones}
    gi = {g.index: g.name for g in mesh.vertex_groups}
    zs = [(mw @ v.co).z for v in mesh.data.vertices]; H = max(zs) - min(zs); z0 = min(zs)
    rows = []
    for v in mesh.data.vertices:
        if not v.groups: continue
        g = max(v.groups, key=lambda x: x.weight); name = gi.get(g.group)
        if name not in ARM: continue
        p = mw @ v.co
        a, b = bones[name]
        rows.append((v.index, name, seg_dist(p, a, b) / H, (p.z - z0) / H))
    # histogram of distances (fraction of the model height) per arm side
    for side in ('Left', 'Right'):
        ds = sorted(r[2] for r in rows if r[1].startswith(side))
        if not ds: continue
        hist = [0] * 12
        for x in ds: hist[min(11, int(x / 0.01))] += 1
        print(f'ARMDIST {d} {side} n={len(ds)} p50={ds[len(ds)//2]:.3f} p90={ds[int(len(ds)*0.9)]:.3f} max={ds[-1]:.3f} hist(0.01 bins)={hist}')
    if mode != 'fix': continue
    cfg = FIX.get(d); th = cfg['th'] if cfg else 9
    torso = [n for n in ('Spine', 'Spine01', 'neck', 'Head') if n in bones]
    moved = 0
    for idx, name, dist, zrel in rows:
        if not cfg or name not in cfg['bones'] or dist <= th: continue
        frac = min(1.0, (dist - th) / 0.04)  # soft: just past the arm keeps part of its arm weight, far hair moves fully
        v = mesh.data.vertices[idx]; p = mw @ v.co
        # nearest torso bone takes the arm weights
        tgt = min(torso, key=lambda n: seg_dist(p, *bones[n]))
        tg = mesh.vertex_groups.get(tgt) or mesh.vertex_groups.new(name=tgt)
        w = 0.0
        for g in list(v.groups):
            gname = gi.get(g.group)
            if gname in ARM:
                take = g.weight * frac; w += take
                mesh.vertex_groups[gname].add([idx], g.weight - take, 'REPLACE')
        if w > 0: tg.add([idx], w, 'ADD'); moved += 1
    print(f'FIX {d} moved {moved} of {len(rows)} arm-weighted vertices to the torso (beyond {th:.3f} H)')
    for img in bpy.data.images:
        if img.size[0] > 1024: img.scale(1024, 1024)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, d + '.glb'), export_format='GLB', export_yup=True, export_skins=True, export_animations=False,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_image_format='JPEG', export_jpeg_quality=86, export_tangents=False)
    print('OUT', d, os.path.getsize(os.path.join(out, d + '.glb')))
