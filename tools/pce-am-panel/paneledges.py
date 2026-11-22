"""Precise sheet edges by strongest brightness drop across a rough quad; fits radial distortion k1 and the 4 lines.
   python -I paneledges.py IN  (uses the rough corners below) -> edges.npz (k1, centre, corners in undistorted px)"""
import sys
import cv2, numpy as np
im = cv2.imdecode(np.fromfile(sys.argv[1], dtype=np.uint8), 1)
h, w = im.shape[:2]
V = cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2HSV)[:, :, 2], (0, 0), 1.2).astype(np.float32)
rough = {'TL': (320, 16), 'TR': (1973, 98), 'BR': (2016, 1412), 'BL': (203, 1418)}
sides = {'top': ('TL', 'TR', (0, -1)), 'right': ('TR', 'BR', (1, 0)), 'bottom': ('BL', 'BR', (0, 1)), 'left': ('TL', 'BL', (-1, 0))}
W = 26
pts = {}
for name, (a, b, out) in sides.items():
    pa, pb = np.array(rough[a], np.float32), np.array(rough[b], np.float32)
    res = []
    n = 140
    for i in range(6, n - 5):
        p = pa + (pb - pa) * i / n
        best, bestv = None, 0
        prof = []
        for d in range(-W, W + 1):
            q = p + np.array(out, np.float32) * d
            x, y = int(round(q[0])), int(round(q[1]))
            if 2 <= x < w - 2 and 2 <= y < h - 2:
                # average along the edge direction
                if out[0] == 0: prof.append(float(V[y, x - 3:x + 4].mean()))
                else: prof.append(float(V[y - 3:y + 4, x].mean()))
            else: prof.append(np.nan)
        prof = np.array(prof)
        # drop going outward: inside mean (4 px) - outside mean (4 px)
        for k in range(5, len(prof) - 5):
            ins, outv = np.nanmean(prof[k - 5:k - 1]), np.nanmean(prof[k + 1:k + 5])
            dv = ins - outv
            if dv > bestv and ins > 115:
                bestv, best = dv, k
        if best is not None and bestv > 38:
            q = p + np.array(out, np.float32) * (best - W)
            res.append((float(q[0]), float(q[1]), bestv))
    pts[name] = np.array(res)
    print(name, len(res), 'pts; mean drop', round(float(np.mean(pts[name][:, 2])), 1))

cx, cy = w / 2, h / 2
norm = np.hypot(cx, cy)
def undist(P, k1):
    x, y = (P[:, 0] - cx) / norm, (P[:, 1] - cy) / norm
    r2 = x * x + y * y
    f = 1 + k1 * r2          # maps distorted -> undistorted (first order)
    return np.stack([cx + x * f * norm, cy + y * f * norm], 1)
def line_res(P):
    P = P.astype(np.float64)
    c = P.mean(0)
    u, s, vt = np.linalg.svd(P - c)
    nrm = vt[1]
    d = (P - c) @ nrm
    return d, c, vt[0]
def cost(k1, trim=True):
    tot = 0
    for name, P in pts.items():
        U = undist(P[:, :2], k1)
        d, _, _ = line_res(U)
        if trim:
            thr = max(1.5, np.percentile(np.abs(d), 80))
            keep = np.abs(d) <= thr
            d, _, _ = line_res(U[keep])
        tot += float(np.sqrt(np.mean(d * d)))
    return tot
ks = np.linspace(-0.08, 0.12, 201)
cs = [cost(k) for k in ks]
k1 = float(ks[int(np.argmin(cs))])
print('cost k1=0:', round(cost(0.0), 3), ' best k1:', round(k1, 4), 'cost', round(min(cs), 3))
lines = {}
for name, P in pts.items():
    U = undist(P[:, :2], k1)
    d, c, v = line_res(U)
    keep = np.abs(d) <= max(1.5, np.percentile(np.abs(d), 80))
    d2, c, v = line_res(U[keep])
    lines[name] = (c, v)
    print(f'{name:6s} rms {np.sqrt(np.mean(d2*d2)):.2f} px over {keep.sum()} pts, dir {v.round(4)}')
def inter(l1, l2):
    (c1, v1), (c2, v2) = l1, l2
    A = np.array([[v1[0], -v2[0]], [v1[1], -v2[1]]])
    t = np.linalg.solve(A, c2 - c1)
    return c1 + t[0] * v1
corners = np.array([inter(lines['top'], lines['left']), inter(lines['top'], lines['right']), inter(lines['bottom'], lines['right']), inter(lines['bottom'], lines['left'])])
print('undistorted corners TL TR BR BL:\n', corners.round(1))
np.savez('edges.npz', k1=k1, cx=cx, cy=cy, norm=norm, corners=corners)
dbg = im.copy()
for name, P in pts.items():
    for x, y, _ in P: cv2.circle(dbg, (int(x), int(y)), 3, (0, 0, 255), -1)
cv2.imencode('.jpg', cv2.resize(dbg, None, fx=0.75, fy=0.75), [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tofile('edges_debug.jpg')
