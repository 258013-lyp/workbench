import zlib, struct, math, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icons')
os.makedirs(OUT, exist_ok=True)

BG = (0xFB, 0xF7, 0xF0)
FG = (0xC8, 0x7B, 0x4A)


def render(size, maskable=False):
    SS = 3  # supersample
    W = H = size * SS
    pad = W * (0.16 if maskable else 0.0)   # maskable 需留安全边
    cx = cy = W / 2
    r_out = (W * 0.30) if maskable else (W * 0.185)
    r_in = r_out * 0.80
    stroke = r_out * 0.24

    rays = []
    for i in range(8):
        a = math.pi * 2 * i / 8 - math.pi / 2
        r1 = r_out * 1.42
        r2 = r_out * 1.42 + r_out * 0.62
        rays.append((cx + math.cos(a) * r1, cy + math.sin(a) * r1,
                     cx + math.cos(a) * r2, cy + math.sin(a) * r2))

    # 以 (x,y) 到线段的距离判定描边
    def dist_seg(px, py, x1, y1, x2, y2):
        dx, dy = x2 - x1, y2 - y1
        L2 = dx * dx + dy * dy
        if L2 == 0:
            return math.hypot(px - x1, py - y1)
        t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / L2))
        return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))

    rows = []
    for y in range(H):
        row = bytearray()
        for x in range(W):
            hit = False
            dr = math.hypot(x - cx, y - cy)
            if abs(dr - r_in) <= stroke / 2:
                hit = True
            if not hit:
                for (x1, y1, x2, y2) in rays:
                    if dist_seg(x, y, x1, y1, x2, y2) <= stroke / 2:
                        hit = True
                        break
            if maskable:
                # 安全区内做圆形裁切
                if math.hypot(x - cx, y - cy) > W * 0.46:
                    hit = False
            row += bytes(FG) if hit else bytes(BG)
        rows.append(row)

    # 下采样抗锯齿
    out = bytearray()
    for y in range(size):
        out.append(0)
        for x in range(size):
            acc = [0, 0, 0]
            for dy in range(SS):
                for dx in range(SS):
                    src = rows[y * SS + dy][(x * SS + dx) * 3:(x * SS + dx) * 3 + 3]
                    for c in range(3):
                        acc[c] += src[c]
            n = SS * SS
            out += bytes([acc[0] // n, acc[1] // n, acc[2] // n])
    return bytes(out)


def write_png(path, size, raw):
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    return len(png)


jobs = [
    ('icon-192.png', 192, False),
    ('icon-512.png', 512, False),
    ('icon-180.png', 180, False),
    ('icon-maskable-512.png', 512, True),
]

for name, size, mask in jobs:
    raw = render(size, mask)
    n = write_png(os.path.join(OUT, name), size, raw)
    print(f'{name}  {size}x{size}  {n} bytes')
print('OK')
