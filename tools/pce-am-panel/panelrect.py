"""Flatten the kit photo into a top-down panel image.
   python -I panelrect.py IN OUT WIDTH_PX [ASPECT]   (ASPECT = width/height; omitted: from the camera geometry)"""
import sys
import cv2, numpy as np
src, out, WPX = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = cv2.imdecode(np.fromfile(src, dtype=np.uint8), 1)
E = np.load('edges.npz')
k1, cx, cy, norm, C = float(E['k1']), float(E['cx']), float(E['cy']), float(E['norm']), E['corners']
TL, TR, BR, BL = C
def hom(p): return np.array([p[0], p[1], 1.0])
lt, lb = np.cross(hom(TL), hom(TR)), np.cross(hom(BL), hom(BR))
ll, lr = np.cross(hom(TL), hom(BL)), np.cross(hom(TR), hom(BR))
v1, v2 = np.cross(lt, lb), np.cross(ll, lr)
v1, v2 = v1[:2] / v1[2], v2[:2] / v2[2]
c = np.array([cx, cy])
f2 = -np.dot(v1 - c, v2 - c)
print('vanishing points', v1.round(0), v2.round(0), ' f^2', round(float(f2)))
aspect = None
if f2 > 0:
    f = np.sqrt(f2)
    K = np.array([[f, 0, cx], [0, f, cy], [0, 0, 1]])
    Hu = cv2.getPerspectiveTransform(np.array([[0, 0], [1, 0], [1, 1], [0, 1]], np.float32), C.astype(np.float32))
    M = np.linalg.inv(K) @ Hu
    aspect = float(np.linalg.norm(M[:, 0]) / np.linalg.norm(M[:, 1]))
    print('focal length', round(float(f)), 'px; aspect (w/h) from geometry', round(aspect, 4))
if len(sys.argv) > 4:
    aspect = float(sys.argv[4])
HPX = int(round(WPX / aspect))
H = cv2.getPerspectiveTransform(np.array([[0, 0], [WPX, 0], [WPX, HPX], [0, HPX]], np.float32), C.astype(np.float32))
xs, ys = np.meshgrid(np.arange(WPX, dtype=np.float64) + 0.5, np.arange(HPX, dtype=np.float64) + 0.5)
den = H[2, 0] * xs + H[2, 1] * ys + H[2, 2]
ux = (H[0, 0] * xs + H[0, 1] * ys + H[0, 2]) / den
uy = (H[1, 0] * xs + H[1, 1] * ys + H[1, 2]) / den
# undistorted -> distorted (invert u = c + (d - c)(1 + k1 r_d^2) by fixed point)
nx, ny = (ux - cx) / norm, (uy - cy) / norm
dx, dy = nx.copy(), ny.copy()
for _ in range(8):
    r2 = dx * dx + dy * dy
    dx, dy = nx / (1 + k1 * r2), ny / (1 + k1 * r2)
mapx, mapy = (cx + dx * norm).astype(np.float32), (cy + dy * norm).astype(np.float32)
flat = cv2.remap(im, mapx, mapy, cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
cv2.imencode('.png', flat)[1].tofile(out)
np.savez(out + '.map.npz', H=H, WPX=WPX, HPX=HPX, aspect=aspect)
print(out, flat.shape, 'aspect', round(aspect, 4))
