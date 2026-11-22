"""AM kit (Sigma COM101) panel layout measured on the flattened photo. Millimetres, x right, y down, origin = top-left of the printed sheet."""
PANEL_W, PANEL_H = 297.0, 232.3
# camera nadir of the reference photo and parallax factors h / (Z - h) for the pin tops and the acrylic's hole edges
NADIR = (105.0, 162.0)
F_PIN, F_RING = 0.083, 0.047
PINS = {
    'bm.modin': (40.0, 21.2), 'bm.out1': (115.4, 22.6), 'bm.out2': (123.8, 22.6), 'bm.link': (33.4, 56.0), 'bm.m1v': (33.4, 67.8),
    'bm.gnd': (27.1, 81.0), 'bm.rfin': (69.2, 88.0),
    'ag.out1': (110.6, 101.8), 'ag.out2': (119.5, 101.5), 'ag.gnd': (119.7, 125.5),
    'ps.p15': (122.5, 179.4), 'ps.gnd': (122.3, 199.8), 'ps.m15': (122.9, 219.9),
    'rf.out': (224.8, 204.8), 'rf.gnd': (179.5, 217.7),
    'pd.amin': (136.4, 14.8), 'pd.gnd1': (132.7, 58.6), 'pd.out1': (213.0, 16.2), 'pd.out2': (223.2, 16.2), 'pd.rfin': (168.2, 86.8), 'pd.gnd2': (220.9, 82.2),
    'bp.in': (235.2, 24.5), 'bp.out1': (234.3, 84.5), 'bp.out2': (234.9, 92.4),
    'lp.in': (262.9, 21.7), 'lp.out': (282.3, 86.3),
    'dd.in': (239.2, 107.1), 'dd.gnd': (239.2, 118.1), 'dd.out1': (275.8, 105.3), 'dd.out2': (282.5, 107.1), 'dd.x': (282.2, 130.2),
}
# printed dial rings: centre, inner radius of the tick marks
DIALS = {'ag.amp': (72.1, 162.0, 9.6), 'ag.freq': (107.4, 162.3, 9.6), 'rf.freq': (155.5, 204.9, 11.9), 'rf.amp': (202.0, 204.9, 9.9)}
