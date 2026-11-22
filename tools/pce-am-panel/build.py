"""Panel texture for the 3D kit: the flattened photo with the tall parts (pins, knobs, lamp, cord) painted out,
   since those are modelled in 3D, the dial scales redrawn where a knob hid them, and the photo's warm colour cast corrected.
   python -I build.py FLAT OUT_JPG OUT_W [QUALITY]"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cv2, numpy as np
from PIL import Image, ImageDraw, ImageFont
from layout import *
flat, out, OUT_W = sys.argv[1], sys.argv[2], int(sys.argv[3])
Q = int(sys.argv[4]) if len(sys.argv) > 4 else 84
im = cv2.imdecode(np.fromfile(flat, dtype=np.uint8), 1)
H, W = im.shape[:2]
k = W / PANEL_W
P = lambda x, y: (int(round(x * k)), int(round(y * k)))
rng = np.random.default_rng(7)
INK = np.array([52, 60, 70], np.float32)   # printed lines in the photo (BGR, before colour correction)
INK_T = tuple(int(v) for v in INK)


def away(x, y, f):
    return x + (x - NADIR[0]) * f, y + (y - NADIR[1]) * f

def blank():
    return np.zeros((H, W), np.uint8)

def regrain(img, m, sigma=3.2):
    """Painted patches are smooth: put paper grain back so they match their surroundings."""
    noise = cv2.GaussianBlur(rng.normal(0, sigma, img.shape[:2]).astype(np.float32), (0, 0), 1.1) * 2.2
    soft = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 2.0)[..., None]
    return np.clip(img.astype(np.float32) + noise[..., None] * soft, 0, 255).astype(np.uint8)

def repaint(img, region, sigma_mm=3.2, feather=1.2, bright=1.0):
    """Fill a region with the bare-paper colour around it: a blur of the neighbouring pixels that are
       paper (not ink, not a component, not the region itself), so shading and stains carry across."""
    region = (region > 127).astype(np.uint8) * 255
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    g = hsv[..., 2].astype(np.float32)
    local = cv2.GaussianBlur(cv2.dilate(hsv[..., 2], np.ones((int(2.2 * k),) * 2, np.uint8)), (0, 0), 1.5 * k).astype(np.float32)
    ok = (g > 0.86 * local) & (g < 1.06 * local) & (region == 0)
    wgt = ok.astype(np.float32)
    s = sigma_mm * k
    num = cv2.GaussianBlur(img.astype(np.float32) * wgt[..., None], (0, 0), s)
    den = cv2.GaussianBlur(wgt, (0, 0), s)[..., None]
    field = num / np.maximum(den, 1e-3)
    far = den[..., 0] < 2e-4           # deep inside a large region: widen the search
    if far.any():
        num2 = cv2.GaussianBlur(img.astype(np.float32) * wgt[..., None], (0, 0), s * 3)
        den2 = cv2.GaussianBlur(wgt, (0, 0), s * 3)[..., None]
        field[far] = (num2 / np.maximum(den2, 1e-4))[far]
    soft = cv2.GaussianBlur(region.astype(np.float32) / 255, (0, 0), feather)[..., None]
    outp = img.astype(np.float32) * (1 - soft) + field * bright * soft
    return regrain(np.clip(outp, 0, 255).astype(np.uint8), region)

def sample_ink(img, x0, y0, x1, y1):
    px = img[int(y0 * k):int(y1 * k), int(x0 * k):int(x1 * k)].reshape(-1, 3).astype(np.float32)
    lum = px.sum(1)
    return np.median(px[lum < np.percentile(lum, 12)], 0)
INK = sample_ink(im, 143, 182.5, 177, 187.5)        # the "RF OSCILLATOR" title
INK_T = tuple(int(v) for v in INK)
print('ink BGR', INK.round(0))

def ink_line(img, a, b, w, alpha=0.8):
    lay = img.copy()
    cv2.line(lay, P(*a), P(*b), INK_T, max(1, int(round(w * k))), cv2.LINE_AA)
    return cv2.addWeighted(lay, alpha, img, 1 - alpha, 0)

work = im.copy()
# ---- 1. leaning pins: inpaint the rod from just outside the solder pad to a little past its top
rods = blank()
gray0 = cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), (0, 0), 1.0)
for name, (x, y) in PINS.items():
    ux, uy = x - NADIR[0], y - NADIR[1]
    L = np.hypot(ux, uy) * 0.114
    if L < 2.6:
        continue
    pred = np.degrees(np.arctan2(uy, ux))
    # the pins are not all upright: take the darkest ray near the predicted lean
    best, best_a = 1e9, pred
    for ang in np.arange(pred - 28, pred + 28.1, 1.0):
        dx, dy = np.cos(np.radians(ang)), np.sin(np.radians(ang))
        vals = [gray0[min(H - 1, max(0, int((y + dy * t) * k))), min(W - 1, max(0, int((x + dx * t) * k)))] for t in np.arange(2.5, max(5.0, L * 0.8), 0.4)]
        v = float(np.mean(vals)) + abs(ang - pred) * 0.25
        if v < best: best, best_a = v, ang
    dx, dy = np.cos(np.radians(best_a)), np.sin(np.radians(best_a))
    cv2.line(rods, P(x + dx * 1.8, y + dy * 1.8), P(x + dx * (L + 1.5), y + dy * (L + 1.5)), 255, int(3.3 * k), cv2.LINE_AA)
rods = (rods > 127).astype(np.uint8) * 255
work = regrain(cv2.inpaint(work, rods, int(0.9 * k), cv2.INPAINT_TELEA), rods, 3.0)

# ---- 2. other tall things, painted over with the paper colour around them
m = blank(); cv2.line(m, P(266.5, 81.6), P(276.8, 75.6), 255, int(12.0 * k), cv2.LINE_AA)
work = repaint(work, m)                                                    # LPF electrolytic
m = blank(); cv2.circle(m, P(45.5, 216.2), int(6.2 * k), 255, -1)
work = repaint(work, m)                                                    # pilot lamp
m = blank(); cv2.line(m, P(0, 216.4), P(16.5, 216.4), 255, int(9.4 * k), cv2.LINE_AA)
cv2.ellipse(m, P(5.0, 215.4), (int(5.6 * k), int(9.6 * k)), 0, 0, 360, 255, -1)
work = repaint(work, m, 4.5)                                               # mains cord end
m = blank(); cv2.fillPoly(m, [np.array([P(268.0, 138.2), P(297, 135.0), P(297, 155.0), P(270.5, 155.0), P(266.4, 147)], np.int32)], 255)
work = repaint(work, m, 5.0)                                               # diode-detector knob
work = ink_line(work, (288.65, 134.0), (288.65, 156.0), 0.32, 0.7)         # the block frame it covered

# ---- 3. dials: the pots / knobs are 3D parts, so their images go: paper inside the tick rings, and what
#         is left of the big RF knob outside its ring, with the two scale ticks and the label it covered
SWEEP, STEP = 121.5, 243.0 / 32
for name, (x, y, r) in DIALS.items():
    region = blank()
    cv2.circle(region, P(x, y), int((r - 0.55) * k), 255, -1)
    if name == 'rf.freq':
        cv2.circle(region, P(157.0, 208.6), int(12.6 * k), 255, -1)
        cv2.rectangle(region, P(143.6, 216.6), P(165.2, 222.6), 255, -1)
        cv2.rectangle(region, P(168.4, 211.0), P(180, 219.6), 0, -1)      # keep the "1000 KHz" end label
    if name == 'rf.amp':
        cv2.circle(region, P(203.7, 207.4), int(6.9 * k), 255, -1)
    work = repaint(work, region, 6.0, feather=1.0)
x, y, r = DIALS['rf.freq']
lay = work.copy()
cv2.ellipse(lay, P(x, y), (int(r * k),) * 2, -90, 104, SWEEP, INK_T, max(1, int(round(0.30 * k))), cv2.LINE_AA)
work = cv2.addWeighted(lay, 0.75, work, 0.25, 0)
for ang in (SWEEP - 2 * STEP, SWEEP - STEP, SWEEP):
    a = np.radians(ang)
    r1 = r + (3.0 if abs(ang - SWEEP) < 0.1 else 2.1)
    work = ink_line(work, (x + r * np.sin(a), y - r * np.cos(a)), (x + r1 * np.sin(a), y - r1 * np.cos(a)), 0.34, 0.75)

def label(img, text, cx, cy, cap_mm, width_mm):
    """Arial text squeezed to the printed width, centred on (cx, cy), underlined like the panel's labels."""
    S = 4
    font = ImageFont.truetype('arialbd.ttf', int(cap_mm / 0.716 * k * S))
    l, t, r_, b = font.getbbox(text)
    tile = Image.new('L', (r_ - l + 8, b - t + 8), 0)
    ImageDraw.Draw(tile).text((4 - l, 4 - t), text, fill=255, font=font)
    w = int(width_mm * k); h = int(tile.size[1] / S)
    tile = cv2.GaussianBlur(np.array(tile.resize((w, h), Image.LANCZOS), np.float32) / 255, (0, 0), 0.9)
    x0, y0 = int(cx * k - w / 2), int(cy * k - h / 2)
    a = (tile * 0.78)[..., None]
    roi = img[y0:y0 + h, x0:x0 + w].astype(np.float32)
    img[y0:y0 + h, x0:x0 + w] = (roi * (1 - a) + INK[None, None, :] * a).astype(np.uint8)
    return ink_line(img, (cx - width_mm / 2 - 0.4, cy + cap_mm / 2 + 1.3), (cx + width_mm / 2 + 0.4, cy + cap_mm / 2 + 1.3), 0.36, 0.7)
work = label(work, 'FREQUENCY', 154.4, 219.1, 2.9, 20.4)

# ---- 4. colour: neutralise the tungsten cast using the capacitors' aluminium tops, then lift the tones a little
ref = []
for (x, y) in ((79.3, 188.2), (79.3, 210.5)):
    mm_ = blank(); cv2.circle(mm_, P(x, y), int(2.6 * k), 255, -1)
    ref.append(im[mm_ > 0].reshape(-1, 3).astype(np.float32))
ref = np.concatenate(ref).mean(0)
gain = ref.max() / ref
gain = gain / gain[1]
gain = 1 + (gain - 1) * 0.86          # not all the way: the paper is cream, not white
f = work.astype(np.float32) * gain[None, None, :]
f = 255 * np.power(np.clip(f / 255, 0, 1), 0.90)
f = (f - 12) * (255 / (243 - 12))
res = np.clip(f, 0, 255).astype(np.uint8)
hsv = cv2.cvtColor(res, cv2.COLOR_BGR2HSV).astype(np.float32)
hsv[..., 1] = np.clip(hsv[..., 1] * 1.12, 0, 255)
res = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
OUT_H = int(round(OUT_W * H / W))
res = cv2.resize(res, (OUT_W, OUT_H), interpolation=cv2.INTER_AREA)
cv2.imencode('.jpg', res, [cv2.IMWRITE_JPEG_QUALITY, Q, cv2.IMWRITE_JPEG_OPTIMIZE, 1])[1].tofile(out)
print(out, res.shape, round(os.path.getsize(out) / 1024), 'KB', 'gains BGR', gain.round(3))
