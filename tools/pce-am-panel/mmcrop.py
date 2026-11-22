"""Crop of the flattened panel with a millimetre grid.
   python -I mmcrop.py FLAT OUT PANEL_W_MM X0 Y0 X1 Y1 [SCALE] [GRID_MM]"""
import sys
import cv2, numpy as np
flat, out, wmm = sys.argv[1], sys.argv[2], float(sys.argv[3])
x0, y0, x1, y1 = (float(v) for v in sys.argv[4:8])
scale = float(sys.argv[8]) if len(sys.argv) > 8 else 1.8
grid = float(sys.argv[9]) if len(sys.argv) > 9 else 10
im = cv2.imdecode(np.fromfile(flat, dtype=np.uint8), 1)
ppm = im.shape[1] / wmm
c = im[int(y0 * ppm):int(y1 * ppm), int(x0 * ppm):int(x1 * ppm)]
c = cv2.resize(c, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
k = ppm * scale
gx = np.arange(np.ceil(x0 / grid) * grid, x1, grid)
gy = np.arange(np.ceil(y0 / grid) * grid, y1, grid)
for g in gx:
    X = int((g - x0) * k)
    cv2.line(c, (X, 0), (X, c.shape[0]), (255, 255, 0), 1)
    cv2.putText(c, f'{g:g}', (X + 2, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 0, 0), 1, cv2.LINE_AA)
for g in gy:
    Y = int((g - y0) * k)
    cv2.line(c, (0, Y), (c.shape[1], Y), (255, 255, 0), 1)
    cv2.putText(c, f'{g:g}', (2, Y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 0, 0), 1, cv2.LINE_AA)
cv2.imencode('.jpg', c, [cv2.IMWRITE_JPEG_QUALITY, 88])[1].tofile(out)
print(out, c.shape, 'px/mm', round(k, 2))
