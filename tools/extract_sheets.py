"""Cut the user's SD asset sheets into game sprites.

Input : art_src/sheets/<design>.webp  (1448x1086 "2D 게임 에셋 개발 시트" template, kept local, not published)
Output: assets/sheets/<design>/{master,turn_0..4,anim,faces,fx_0..3}.webp + assets/sheets/manifest.json

Usage : python tools/extract_sheets.py art_src/sheets assets/sheets [debug_dir]

How: the cream page colour is removed with a flood fill from each region's border (so white parts inside a
drawing stay), the rest is split into connected pieces, thin lines / label pills are dropped by shape, and
the five animation rows are laid out on an evenly spaced grid. Effects (soft glows) are separated from the
cream background by colour unmixing instead.
"""
import sys, os, json
from collections import deque
import numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else 'art_src/sheets'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'assets/sheets'
DBG = sys.argv[3] if len(sys.argv) > 3 else None
DESIGNS = ['warrior', 'mage', 'knight', 'duelist', 'sorcerer', 'sage']
CLASS_OF = {
    'Zhanshi': 'warrior', 'Fashi': 'mage',
    'Huwei': 'knight', 'Dunjiashi': 'knight', 'Shouhuzhe': 'knight', 'LegendShouhuzhe': 'knight',
    'Doushi': 'duelist', 'Kuangzhanshi': 'duelist', 'Zhengfuzhe': 'duelist', 'LegendZhengfuzhe': 'duelist',
    'Shushi': 'sorcerer', 'Modaoshi': 'sorcerer', 'Huimiezhe': 'sorcerer', 'LegendHuimiezhe': 'sorcerer',
    'Xianzhe': 'sage', 'Mishushi': 'sage', 'Zhangkongzhe': 'sage', 'LegendZhangkongzhe': 'sage',
}
ANIM = [('idle', 8), ('move', 6), ('attack', 6), ('skill', 8), ('hit', 6)]
# labels as printed on each sheet (expressions: 2 rows of 6, effects: 4)
FACES = {
    'duelist': ['기본', '웃음', '신남', '윙크', '놀람', '당황', '화남', '집중', '피로', '생각 중', '교만', '투지'],
    'warrior': ['기본', '웃음', '신남', '윙크', '놀람', '당황', '화남', '슬픔', '뾰로통', '생각 중', '졸림', '결의'],
}
FACES_DEFAULT = ['기본', '웃음', '신남', '윙크', '놀람', '당황', '화남', '슬픔', '뾰로통', '생각 중', '졸림', '감탄']
FX = {
    'warrior': ['검격 (기본 베기)', '돌진 (차지)', '타격 (충돌)', '피니시 (마무리 타격)'],
    'duelist': ['질주 베기 (대시)', '쌍검 연속 베기 (아크)', '가속 궤적 (스피드)', '피니시 임팩트 (마무리)'],
    'knight': ['방패 가드 (방어)', '신성 장벽 (배리어)', '방패 돌진 (실드 배시)', '빛의 참격 (레디언트 슬래시)'],
    'mage': ['마법 화살 (탄환)', '마법진 (시전/버프)', '별빛 시전 (채널링)', '마법 폭발 (타격/마무리)'],
    'sorcerer': ['화염 (기본 원소)', '마법진 (시전/버프)', '투사체 (공격)', '폭발 (타격/마무리)'],
    'sage': ['치유의 빛 (회복)', '지원 진형 (버프/보호)', '축복 (강화)', '회복의 파동 (광역 회복)'],
}
TOL = 22  # max channel difference from the page colour that still counts as page


def page_ref(rgb):
    """the panel colour: the most common bright colour in the region"""
    p = rgb.reshape(-1, 3).astype(np.int32)
    p = p[p.min(axis=1) > 200]
    if not len(p): return np.median(rgb.reshape(-1, 3), axis=0)
    key = (p[:, 0] // 4) * 4096 + (p[:, 1] // 4) * 64 + (p[:, 2] // 4)
    top = np.bincount(key).argmax()
    return p[key == top].mean(axis=0)


def flood_page(rgb, tol=TOL):
    """page pixels: cream patches that touch the region border or are large (the panel interior);
    small cream patches enclosed by a drawing's outline (white cloth, highlights) stay part of the drawing"""
    H, W = rgb.shape[:2]
    ref = page_ref(rgb)
    near =np.abs(rgb.astype(np.int16) - ref.astype(np.int16)).max(axis=2) <= tol
    bg = np.zeros((H, W), bool)
    seen = np.zeros((H, W), bool)
    big = 0.08 * H * W
    ys, xs = np.nonzero(near)
    for sy, sx in zip(ys, xs):
        if seen[sy, sx]: continue
        seen[sy, sx] = True
        q = deque([(sy, sx)]); pts = []; edge = False
        while q:
            y, x = q.popleft(); pts.append((y, x))
            if y == 0 or x == 0 or y == H - 1 or x == W - 1: edge = True
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < H and 0 <= nx < W and near[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        if edge or len(pts) >= big:
            py, px = zip(*pts); bg[list(py), list(px)] = True
    return bg, ref


def components(mask):
    """8-connected pieces → list of dict(y0,x0,y1,x1,n,pix:(ys,xs))"""
    H, W = mask.shape
    lab = np.zeros((H, W), np.int32)
    out = []
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys, xs):
        if lab[sy, sx]: continue
        idx = len(out) + 1
        lab[sy, sx] = idx
        q = deque([(sy, sx)]); py, px = [], []
        while q:
            y, x = q.popleft(); py.append(y); px.append(x)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = idx; q.append((ny, nx))
        py = np.array(py); px = np.array(px)
        out.append({'y0': int(py.min()), 'x0': int(px.min()), 'y1': int(py.max()) + 1, 'x1': int(px.max()) + 1, 'n': len(py), 'pix': (py, px)})
    for c in out:
        c['w'] = c['x1'] - c['x0']; c['h'] = c['y1'] - c['y0']
        c['fill'] = c['n'] / max(1, c['w'] * c['h'])
        c['cx'] = (c['x0'] + c['x1']) / 2; c['cy'] = (c['y0'] + c['y1']) / 2
    return out


def is_line(c):
    return (c['w'] <= 4 or c['h'] <= 4 or (c['fill'] < 0.06 and (c['w'] > 120 or c['h'] > 120))
            or (c['h'] > 90 and c['w'] < 12) or (c['w'] > 90 and c['h'] < 10))


def is_pill(c):
    return c['w'] > 30 and 12 <= c['h'] <= 32 and c['fill'] > 0.55 and c['w'] > 1.8 * c['h']


def cutout(rgb, ref, comps, pad=2):
    """RGBA image of the given pieces (soft 1px edge from the colour difference)"""
    y0 = max(0, min(c['y0'] for c in comps) - pad); x0 = max(0, min(c['x0'] for c in comps) - pad)
    y1 = min(rgb.shape[0], max(c['y1'] for c in comps) + pad); x1 = min(rgb.shape[1], max(c['x1'] for c in comps) + pad)
    m = np.zeros((y1 - y0, x1 - x0), bool)
    for c in comps:
        py, px = c['pix']; m[py - y0, px - x0] = True
    sub = rgb[y0:y1, x0:x1].astype(np.float32)
    diff = np.abs(sub - ref).max(axis=2)
    edge = m & ~(np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1))
    a = np.where(m, 255.0, 0.0)
    a[edge] = np.clip(diff[edge] / 45.0, 0.35, 1.0) * 255
    img = np.dstack([sub, a]).astype(np.uint8)
    return Image.fromarray(img, 'RGBA'), (x0, y0)


def unmix(rgb):
    """effects on the cream page → straight-alpha RGBA (colour = page·(1−a) + fx·a)"""
    p = rgb.astype(np.float32)
    ref = page_ref(rgb).astype(np.float32)
    dark = ((ref - p) / np.maximum(ref, 1)).max(axis=2)
    light = ((p - ref) / np.maximum(255 - ref, 40)).max(axis=2)
    a = np.clip(np.maximum(dark, light), 0, 1)
    a[a < 0.07] = 0
    f = np.where(a[..., None] > 0, (p - (1 - a[..., None]) * ref) / np.maximum(a[..., None], 1e-3), 0)
    return np.dstack([np.clip(f, 0, 255), a * 255]).astype(np.uint8), a


def near_any(c, keep, m=14):
    return any(c['x1'] >= k['x0'] - m and c['x0'] <= k['x1'] + m and c['y1'] >= k['y0'] - m and c['y0'] <= k['y1'] + m for k in keep)


def figures(rgb, min_h=60):
    """big drawings in a region plus the small bits around them (sparkles, strands); labels/lines dropped"""
    bg, ref = flood_page(rgb)
    cs = [c for c in components(~bg) if not is_line(c) and not is_pill(c)]
    big = [c for c in cs if c['h'] >= min_h]
    small = [c for c in cs if c['h'] < min_h and c['n'] >= 6]
    return big, small, ref


def save(img, path, q=90):
    img.save(path, 'WEBP', quality=q, method=6)


def extract(design, sheet):
    im = np.array(Image.open(os.path.join(SRC, design + '.webp')).convert('RGB'))
    od = os.path.join(OUT, design); os.makedirs(od, exist_ok=True)
    meta = {'faces': {}, 'fx': [], 'turn': [], 'anim': {}}

    # master model (left top)
    X0, Y0 = 15, 95
    big, small, ref = figures(im[Y0:445, X0:382])
    main = max(big, key=lambda c: c['n'])
    keep = [c for c in big if c['n'] >= 0.03 * main['n']]
    keep += [c for c in small if near_any(c, keep)]
    img, _ = cutout(im[Y0:445, X0:382], ref, keep)
    save(img, os.path.join(od, 'master.webp')); meta['master'] = {'f': 'master.webp', 'w': img.width, 'h': img.height}

    # turnaround (5 directions)
    Y0 = 455
    big, small, ref = figures(im[Y0:675, 15:618])
    big = sorted([c for c in big if 80 <= c['h'] <= 200 and c['w'] <= 170 and c['fill'] > 0.2], key=lambda c: -c['n'])[:5]
    big.sort(key=lambda c: c['cx'])
    for i, c in enumerate(big):
        parts = [c] + [s for s in small if near_any(s, [c], 6) and s['cy'] < c['y1']]
        img, _ = cutout(im[Y0:675, 15:618], ref, parts)
        save(img, os.path.join(od, f'turn_{i}.webp')); meta['turn'].append({'f': f'turn_{i}.webp', 'w': img.width, 'h': img.height})

    # expression icons: 12 framed squares
    Y0 = 690
    bg, ref = flood_page(im[Y0:918, 15:618])
    allc = components(~bg)
    cs = [c for c in allc if 50 <= c['w'] <= 125 and 42 <= c['h'] <= 110 and c['fill'] > 0.5]
    if len(cs) < 12:
        # icons joined by soft shadows: split each row strip into 6 equal cells
        cs = []
        for strip in [c for c in allc if c['w'] > 300 and 42 <= c['h'] <= 130]:
            py, px = strip['pix']; step = strip['w'] / 6
            for k in range(6):
                sel = (px >= strip['x0'] + k * step + 2) & (px < strip['x0'] + (k + 1) * step - 2)
                if sel.sum() < 200: continue
                sy, sx = py[sel], px[sel]
                cs.append({'y0': int(sy.min()), 'x0': int(sx.min()), 'y1': int(sy.max()) + 1, 'x1': int(sx.max()) + 1, 'n': int(sel.sum()), 'pix': (sy, sx),
                           'w': int(sx.max() - sx.min() + 1), 'h': int(sy.max() - sy.min() + 1), 'cx': float(sx.mean()), 'cy': float(sy.mean()), 'fill': 1})
    cs = sorted(cs, key=lambda c: -c['n'])[:12]
    if len(cs) < 12: raise SystemExit(f'{design}: found {len(cs)} expression icons')
    rows = sorted(cs, key=lambda c: c['cy']); top = rows[:6]; bot = rows[6:]
    icons = sorted(top, key=lambda c: c['cx']) + sorted(bot, key=lambda c: c['cx'])
    cw = max(c['w'] for c in icons) + 2; ch = max(c['h'] for c in icons) + 2
    atlas = Image.new('RGBA', (cw * 12, ch))
    for c in icons:  # the frame is ~0.8 as tall as wide; anything lower is the label pill
        hmax = int(round(0.82 * c['w']))
        if c['h'] > hmax:
            py, px = c['pix']; sel = py < c['y0'] + hmax
            c.update(pix=(py[sel], px[sel]), y1=c['y0'] + hmax, h=hmax)
    cw = max(c['w'] for c in icons) + 2; ch = max(c['h'] for c in icons) + 2
    atlas = Image.new('RGBA', (cw * 12, ch))
    for i, c in enumerate(icons):
        img, _ = cutout(im[Y0:918, 15:618], ref, [c], pad=0)
        atlas.paste(img, (i * cw + (cw - img.width) // 2, (ch - img.height) // 2))
    save(atlas, os.path.join(od, 'faces.webp'))
    meta['faces'] = {'f': 'faces.webp', 'cw': cw, 'ch': ch, 'n': len(icons), 'labels': FACES.get(design, FACES_DEFAULT)}

    # effects (4 cells along the bottom): colour unmixing keeps the glow
    Y0, X0, X1 = 925, 18, 805
    region = im[Y0:1070, X0:X1]
    rgba, a = unmix(region)
    RH, RW = a.shape
    # pieces touching the region border are page margins / panel frames
    cs = [c for c in components(a > 0.12) if not is_line(c) and c['x0'] > 0 and c['y0'] > 0 and c['x1'] < RW and c['y1'] < RH]
    cellw = (X1 - X0) / 4
    # label pills sit on one row: their top (median over the cells that show one) ends the art band
    pills = [c for c in cs if is_pill(c) and c['cy'] > 80]
    cut = int(np.median([p['y0'] for p in pills])) - 3 if pills else RH - 34
    top = 32  # below the panel title
    for i in range(4):
        cx0, cx1 = int(i * cellw) + 5, int((i + 1) * cellw) - 5
        sub = a[top:cut, cx0:cx1]
        pieces = [c for c in components(sub > 0.07) if not is_line(c) and c['n'] >= 4]
        if not pieces: continue
        m = np.zeros(sub.shape, bool)
        for c in pieces:
            py, px = c['pix']; m[py, px] = True
        grow = m.copy()  # keep the soft glow around the marks
        for _ in range(4): grow = grow | np.roll(grow, 1, 0) | np.roll(grow, -1, 0) | np.roll(grow, 1, 1) | np.roll(grow, -1, 1)
        ys, xs = np.nonzero(m)
        y0, y1 = max(0, ys.min() - 3), min(sub.shape[0], ys.max() + 4); x0, x1 = max(0, xs.min() - 3), min(sub.shape[1], xs.max() + 4)
        out = rgba[top:cut, cx0:cx1].copy(); out[..., 3] = np.where(grow, out[..., 3], 0)
        img = Image.fromarray(out[y0:y1, x0:x1], 'RGBA')
        save(img, os.path.join(od, f'fx_{i}.webp'), q=88)
        meta['fx'].append({'f': f'fx_{i}.webp', 'w': img.width, 'h': img.height, 'label': FX[design][i]})

    # animation rows (right middle)
    AX0, AY0, AX1, AY1 = 805, 466, 1426, 858
    region = im[AY0:AY1, AX0:AX1]
    bg, ref = flood_page(region)
    # faint row dividers run under the feet: rows where light, unsaturated "line" colour spans most of the width
    rf = region.astype(np.int16); diff = np.abs(rf - ref.astype(np.int16)).max(axis=2)
    sat = rf.max(axis=2) - rf.min(axis=2)
    lineish = (diff > 6) & (diff < 60) & (sat < 45)
    rows = lineish.mean(axis=1) > 0.55
    y = 0
    while y < len(rows):
        if rows[y]:
            e = y
            while e + 1 < len(rows) and rows[e + 1]: e += 1
            if e - y <= 2:  # a thin divider, not a band of pale drawings
                for yy in range(max(0, y - 1), min(region.shape[0], e + 2)): bg[yy] |= lineish[yy]
            y = e + 1
        else: y += 1
    cs = [c for c in components(~bg) if not is_line(c) and not is_pill(c) and not (c['w'] > region.shape[1] * 0.6)]
    big = [c for c in cs if c['h'] >= 30 and c['w'] <= 170 and c['fill'] > 0.12]
    big.sort(key=lambda c: c['cy'])
    groups, cur = [], [big[0]]
    for c in big[1:]:
        if c['cy'] - cur[-1]['cy'] > 26 and c['y0'] > max(k['y1'] for k in cur) - 12: groups.append(cur); cur = [c]
        else: cur.append(c)
    groups.append(cur)
    groups = sorted(groups, key=lambda g: -sum(c['n'] for c in g))[:5]
    groups.sort(key=lambda g: min(c['y0'] for c in g))
    if len(groups) != 5: raise SystemExit(f'{design}: found {len(groups)} animation rows')
    frames_meta, cells = {}, []
    idle_h = None
    for (name, n), g in zip(ANIM, groups):
        ry0 = min(c['y0'] for c in g) - 8; ry1 = max(c['y1'] for c in g) + 8
        rowc = [c for c in cs if ry0 <= c['cy'] <= ry1 and c['w'] <= 200]
        # frame centres: the n largest pieces that sit apart (the characters), then a straight-line fit
        # so the grid is evenly spaced (dust clouds and effect trails don't pull it)
        pitch0 = (max(c['cx'] for c in rowc) - min(c['cx'] for c in rowc)) / max(1, n - 1)
        picks = []
        for c in sorted(rowc, key=lambda c: -c['n']):
            if all(abs(c['cx'] - p) > 0.55 * pitch0 for p in picks): picks.append(c['cx'])
            if len(picks) == n: break
        if len(picks) < n: raise SystemExit(f'{design}/{name}: only {len(picks)} frames found')
        cen = np.array(sorted(picks))
        A = np.vstack([np.arange(n), np.ones(n)]).T
        slope, inter = np.linalg.lstsq(A, cen, rcond=None)[0]
        fit = inter + slope * np.arange(n)
        if np.abs(fit - cen).max() < 10: cen = fit
        slots = [[] for _ in range(n)]
        for c in rowc:
            slots[int(np.abs(cen - c['cx']).argmin())].append(c)
        mains = [max(s, key=lambda c: c['n']) for s in slots if s]
        base = float(np.median([c['y1'] for c in mains]))
        if name == 'idle': idle_h = float(np.median([c['h'] for c in mains]))
        fr = []
        for k in range(n):
            if not slots[k]: raise SystemExit(f'{design}/{name}: empty frame {k}')
            img, (ox, oy) = cutout(region, ref, slots[k])
            fr.append({'img': img, 'ax': float(cen[k] - ox), 'ay': base - oy})
        frames_meta[name] = fr
    # pack rows into one atlas
    W = max(sum(f['img'].width + 2 for f in fr) for fr in frames_meta.values())
    H = sum(max(f['img'].height for f in fr) + 2 for fr in frames_meta.values())
    atlas = Image.new('RGBA', (W, H)); y = 0
    for name, _ in ANIM:
        x = 0; rh = max(f['img'].height for f in frames_meta[name])
        meta['anim'][name] = []
        for f in frames_meta[name]:
            atlas.paste(f['img'], (x, y))
            meta['anim'][name].append([x, y, f['img'].width, f['img'].height, round(f['ax'], 1), round(f['ay'], 1)])
            x += f['img'].width + 2
        y += rh + 2
    save(atlas, os.path.join(od, 'anim.webp'), q=92)
    meta['atlas'] = {'f': 'anim.webp', 'w': W, 'h': H}
    meta['charH'] = round(idle_h, 1)
    if DBG:
        os.makedirs(DBG, exist_ok=True)
        prev = Image.new('RGBA', (W, H), (60, 70, 60, 255)); prev.alpha_composite(atlas); prev.save(os.path.join(DBG, design + '_anim.png'))
    return meta


if __name__ == '__main__':
    manifest = {'v': 1, 'source': '사용자 제공 SD 에셋 개발 시트 (art_src/sheets, 비공개)', 'classes': CLASS_OF, 'designs': {}}
    for d in DESIGNS:
        manifest['designs'][d] = extract(d, None)
        m = manifest['designs'][d]
        print(d, 'master', m['master']['w'], 'x', m['master']['h'], '| turn', len(m['turn']), '| faces', m['faces']['n'], '| fx', len(m['fx']), '| frames', {k: len(v) for k, v in m['anim'].items()}, '| idle h', m['charH'])
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote', os.path.join(OUT, 'manifest.json'))
