# 黑苔公会大厅 精修像素美术(640×360 逻辑分辨率,只用锁定的黑苔 32 色)
# 输出:hall_bg.png(墙/地/静态物件) + 各可交互物件单独 PNG(悬停描边用)
import random, os, sys
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else './hall'
os.makedirs(OUT, exist_ok=True)
P = ['#121416','#202426','#353b3d','#515a5b','#798582','#adb6aa','#d9dcc7','#f4edcf',
     '#241b17','#403025','#624635','#886447','#b88b60','#dcba87','#8b703d','#c39e56',
     '#263527','#3e5138','#61724a','#8d9b62','#283a48','#405f71','#69919c','#a5c2c7',
     '#422632','#674254','#997187','#512b27','#893d36','#be6550','#dd9563','#edc47b']
RGB = [tuple(int(h[i:i+2], 16) for i in (1, 3, 5)) + (255,) for h in P]
# 材质色阶(暗→亮)
STONE = [0, 1, 2, 3, 4, 5]
WOOD = [8, 9, 10, 11, 12, 13]
GOLD = [8, 14, 15, 31]
FIRE = [27, 28, 29, 30, 31, 7]
GREEN = [16, 17, 18, 19]
RED = [27, 28, 29]
BLUE = [20, 21, 22, 23]
PLUM = [24, 25, 26]


class C:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.im.putpixel((x, y), RGB[c])

    def r(self, x, y, w, h, c):
        if w > 0 and h > 0:
            self.d.rectangle([x, y, x + w - 1, y + h - 1], fill=RGB[c])

    def dither(self, x, y, w, h, c, phase=0, density=2):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if (xx + yy + phase) % density == 0:
                    self.px(xx, yy, c)

    def ell(self, x, y, w, h, c):
        self.d.ellipse([x, y, x + w - 1, y + h - 1], fill=RGB[c])

    def poly(self, pts, c):
        self.d.polygon(pts, fill=RGB[c])

    def line(self, pts, c, w=1):
        self.d.line(pts, fill=RGB[c], width=w)

    def box(self, x, y, w, h, ramp, outline=None):
        """带光影的块:左上受光,右下背光,外描边用材质最暗色"""
        o = ramp[0] if outline is None else outline
        self.r(x, y, w, h, o)
        self.r(x + 1, y + 1, w - 2, h - 2, ramp[2])
        self.r(x + 1, y + 1, w - 2, 1, ramp[3])
        self.r(x + 1, y + 1, 1, h - 2, ramp[3])
        self.r(x + 1, y + h - 2, w - 2, 1, ramp[1])
        self.r(x + w - 2, y + 1, 1, h - 2, ramp[1])

    def shadow(self, x, y, w, h):
        """地面接触阴影(实心核 + 抖动边)"""
        self.d.ellipse([x + 2, y + 1, x + w - 3, y + h - 2], fill=RGB[8])
        mask = Image.new('L', (self.w, self.h), 0)
        ImageDraw.Draw(mask).ellipse([x, y, x + w - 1, y + h - 1], fill=255)
        for yy in range(max(0, y), min(self.h, y + h)):
            for xx in range(max(0, x), min(self.w, x + w)):
                if mask.getpixel((xx, yy)) and (xx + yy) % 2 == 0:
                    self.px(xx, yy, 8)

    def paste(self, other, x, y):
        self.im.alpha_composite(other.im if isinstance(other, C) else other, (x, y))

    def save(self, name):
        self.im.save(os.path.join(OUT, name + '.png'))


random.seed(20261008)
W, H, FLOOR = 640, 360, 150

# ============================== 背景:墙、梁、护墙板、地板 ==============================
bg = C(W, H)
bg.r(0, 0, W, FLOOR, 1)
# 石墙:错缝方石,每块随机明暗;顶部逐渐压暗
for row, y in enumerate(range(16, 114, 12)):
    off = 0 if row % 2 == 0 else 13
    x = -off
    while x < W:
        bw = random.choice([22, 26, 26, 30])
        tone = random.choices([2, 2, 2, 3, 1], [5, 5, 5, 2, 1])[0]
        bg.r(x, y, bw, 12, 1)  # 灰缝
        bg.r(x + 1, y + 1, bw - 2, 10, tone)
        bg.r(x + 1, y + 1, bw - 2, 1, min(tone + 1, 4))
        bg.r(x + 1, y + 1, 1, 10, min(tone + 1, 4))
        bg.r(x + 1, y + 10, bw - 2, 1, max(tone - 1, 1))
        for _ in range(random.randint(0, 3)):  # 风化麻点
            bg.px(x + random.randint(3, bw - 4), y + random.randint(3, 8), max(tone - 1, 1))
        if random.random() < .12:  # 苔痕
            for k in range(random.randint(3, 7)):
                bg.px(x + random.randint(2, bw - 3), y + 9 - random.randint(0, 2), random.choice([16, 17]))
        x += bw
bg.dither(0, 16, W, 10, 1, 0, 2)
bg.dither(0, 26, W, 8, 1, 1, 3)
# 天花与主梁
bg.r(0, 0, W, 16, 0)
bg.r(0, 8, W, 9, 8); bg.r(0, 9, W, 6, 10); bg.r(0, 9, W, 1, 11); bg.r(0, 14, W, 1, 9)
for x in range(18, W, 64):  # 次梁端头
    bg.r(x, 2, 10, 14, 8); bg.r(x + 1, 3, 8, 12, 9); bg.r(x + 1, 3, 8, 1, 10)
# 护墙板
bg.r(0, 112, W, 38, 8)
bg.r(0, 112, W, 4, 11); bg.r(0, 112, W, 1, 12); bg.r(0, 115, W, 1, 9)
for x in range(0, W, 30):
    bg.r(x + 2, 118, 26, 26, 9)
    bg.r(x + 3, 119, 24, 24, 10)
    bg.r(x + 3, 119, 24, 1, 11); bg.r(x + 3, 119, 1, 24, 11)
    bg.r(x + 3, 142, 24, 1, 9); bg.r(x + 26, 119, 1, 24, 9)
    for g in range(3):  # 木纹
        gy = 123 + g * 7 + random.randint(-1, 1)
        bg.r(x + 6, gy, random.randint(8, 18), 1, 9)
bg.r(0, 145, W, 5, 8); bg.r(0, 145, W, 1, 10)
# 地板:越靠近镜头,木板越宽(纵深)
y, row = FLOOR, 0
while y < H:
    rh = 8 + row // 2
    x = -random.randint(0, 70)
    while x < W:
        L = random.randint(56, 120)
        tone = random.choices([9, 10, 9], [5, 2, 3])[0]
        bg.r(x, y, L, rh, tone)
        bg.r(x, y, L, 1, 10 if tone == 9 else 11)
        bg.r(x, y + rh - 1, L, 1, 8)
        bg.r(x + L - 1, y, 1, rh, 8)
        for _ in range(random.randint(1, 3)):  # 木纹
            gx = x + random.randint(4, max(5, L - 20))
            bg.r(gx, y + random.randint(2, rh - 3), random.randint(6, 16), 1, 8 if tone == 9 else 9)
        if random.random() < .5:  # 钉子
            bg.px(x + 3, y + rh // 2, 3); bg.px(x + L - 4, y + rh // 2, 3)
        x += L
    y += rh
    row += 1
# 地板与墙交界的接触暗线
bg.r(0, FLOOR, W, 2, 8)
bg.dither(0, FLOOR + 2, W, 4, 8, 0, 2)

# 立柱(把墙面分成几个区)
for px_ in [88, 204, 530]:
    bg.r(px_, 0, 10, FLOOR + 2, 8)
    bg.r(px_ + 1, 0, 8, FLOOR, 10)
    bg.r(px_ + 1, 0, 2, FLOOR, 11)
    bg.r(px_ + 7, 0, 1, FLOOR, 9)
    for gy in range(24, FLOOR, 23):
        bg.r(px_ + 4, gy, 1, random.randint(6, 12), 9)
    bg.r(px_ - 2, FLOOR - 6, 14, 7, 8); bg.r(px_ - 1, FLOOR - 5, 12, 5, 9); bg.r(px_ - 1, FLOOR - 5, 12, 1, 10)
    bg.r(px_ - 2, 16, 14, 4, 8); bg.r(px_ - 1, 17, 12, 2, 10)

# 高窗(冷光来源)
for wx in [180, 566]:
    bg.r(wx - 2, 30, 20, 46, 3)
    bg.r(wx - 1, 31, 18, 44, 4)
    bg.ell(wx - 2, 22, 20, 18, 3); bg.ell(wx - 1, 23, 18, 16, 4)
    bg.r(wx + 1, 34, 14, 40, 20)
    bg.ell(wx + 1, 26, 14, 14, 20)
    bg.r(wx + 2, 36, 5, 16, 21); bg.r(wx + 2, 36, 2, 8, 22)
    bg.ell(wx + 2, 27, 6, 6, 21)
    bg.r(wx + 7, 26, 2, 48, 1); bg.r(wx + 1, 50, 14, 2, 1)
    bg.px(wx + 11, 30, 23); bg.px(wx + 12, 31, 22); bg.px(wx + 4, 57, 22)
    bg.r(wx - 3, 74, 22, 4, 3); bg.r(wx - 3, 74, 22, 1, 5); bg.r(wx - 3, 77, 22, 1, 2)

# 地毯(出征之门前)
rx, ry, rw, rh = 262, 166, 116, 46
bg.shadow(rx - 4, ry + rh - 6, rw + 8, 10)
bg.r(rx, ry, rw, rh, 27)
bg.r(rx + 2, ry + 2, rw - 4, rh - 4, 28)
bg.r(rx + 5, ry + 5, rw - 10, rh - 10, 27)
bg.r(rx + 7, ry + 7, rw - 14, rh - 14, 28)
for i in range(rx + 8, rx + rw - 8, 4):  # 金边纹
    bg.px(i, ry + 3, 15); bg.px(i + 2, ry + 4, 14)
    bg.px(i, ry + rh - 4, 15); bg.px(i + 2, ry + rh - 5, 14)
cx, cy = rx + rw // 2, ry + rh // 2
for k in range(12):  # 中心菱形纹章
    bg.r(cx - k, cy - 11 + k, 2 * k + 1, 1, 14)
    bg.r(cx - k, cy + 11 - k, 2 * k + 1, 1, 14)
for k in range(9):
    bg.r(cx - k, cy - 8 + k, 2 * k + 1, 1, 27)
    bg.r(cx - k, cy + 8 - k, 2 * k + 1, 1, 27)
for k in range(4):
    bg.r(cx - k, cy - 3 + k, 2 * k + 1, 1, 15)
    bg.r(cx - k, cy + 3 - k, 2 * k + 1, 1, 15)
for side in (-1, 1):
    for i in range(3):
        sx = cx + side * (22 + i * 14)
        for k in range(3):
            bg.r(sx - k, cy - 2 + k, 2 * k + 1, 1, 14); bg.r(sx - k, cy + 2 - k, 2 * k + 1, 1, 14)
for i in range(rx + 1, rx + rw - 1, 2):  # 流苏
    bg.px(i, ry - 1, 13); bg.px(i, ry + rh, 13)
    if i % 4 == 1: bg.px(i, ry - 2, 12); bg.px(i, ry + rh + 1, 12)

# ============================== 物件 ==============================
def trophy(c, x, y):
    """壁炉上方:交叉双剑 + 圆盾战利品"""
    c.line([(x - 12, y + 14), (x + 12, y - 10)], 4, 2); c.line([(x + 12, y + 14), (x - 12, y - 10)], 4, 2)
    c.line([(x - 12, y + 14), (x + 12, y - 10)], 5, 1)
    c.r(x - 14, y + 13, 5, 2, 14); c.r(x + 10, y + 13, 5, 2, 14)
    c.ell(x - 9, y - 7, 18, 18, 8); c.ell(x - 8, y - 6, 16, 16, 28); c.ell(x - 6, y - 4, 12, 12, 27)
    c.ell(x - 3, y - 1, 6, 6, 15); c.px(x - 1, y, 31)
    c.px(x - 6, y - 4, 29); c.px(x - 5, y - 5, 29)


# ---- 壁炉 72×100 ----
fp = C(76, 104)
for row, yy in enumerate(range(0, 100, 8)):
    off = 0 if row % 2 == 0 else 6
    xx = 4 - off
    while xx < 72:
        bw = 12
        x0 = max(4, xx)
        w0 = min(xx + bw, 72) - x0
        if w0 > 1:
            t = random.choice([3, 3, 2, 4])
            fp.r(x0, yy, w0, 8, 1); fp.r(x0 + 1, yy + 1, w0 - 2, 6, t); fp.r(x0 + 1, yy + 1, w0 - 2, 1, min(t + 1, 5))
        xx += bw
fp.r(4, 0, 68, 4, 2)  # 烟囱收顶
# 炉口
fp.r(16, 62, 44, 38, 1)
fp.ell(16, 52, 44, 24, 1)
fp.r(18, 64, 40, 36, 0)
fp.ell(18, 54, 40, 22, 0)
for k in range(10):  # 熏黑
    fp.dither(18, 54 + k * 2, 40, 2, 1, k, 3)
# 柴火
fp.r(22, 90, 32, 5, 8); fp.r(23, 90, 30, 4, 10); fp.r(23, 90, 30, 1, 11)
fp.r(26, 86, 24, 5, 8); fp.r(27, 86, 22, 4, 9); fp.r(27, 86, 22, 1, 10)
fp.ell(21, 89, 6, 6, 11); fp.ell(22, 90, 4, 4, 12)
# 火焰:外暗红 → 橙 → 黄 → 白芯
def flame(c, x, y, w, h, ramp):
    for i, col in enumerate(ramp):
        ww, hh = w - i * (w // (len(ramp) + 1)), h - i * (h // (len(ramp) + 1))
        if ww < 1 or hh < 1: break
        for k in range(hh):
            sw = max(1, int(ww * (1 - (k / hh) ** 1.4)))
            c.r(x + (w - sw) // 2, y + h - 1 - k, sw, 1, col)
flame(fp, 24, 64, 28, 26, [28, 29, 30, 31])
flame(fp, 18, 72, 14, 18, [28, 29, 30])
flame(fp, 44, 70, 14, 20, [28, 29, 30, 31])
fp.r(36, 80, 4, 5, 7)
for (ex, ey) in [(30, 95), (40, 96), (46, 94), (25, 96), (51, 97)]:
    fp.px(ex, ey, random.choice([30, 31]))
# 壁炉台
fp.r(0, 44, 76, 7, 8); fp.r(1, 44, 74, 5, 11); fp.r(1, 44, 74, 1, 12); fp.r(1, 48, 74, 1, 9)
fp.r(4, 51, 4, 6, 9); fp.r(68, 51, 4, 6, 9)
# 台上物件:蜡烛、陶罐、酒瓶
for cxp in [8, 14]:
    fp.r(cxp, 36, 3, 8, 6); fp.r(cxp, 36, 1, 8, 7); fp.px(cxp + 1, 34, 31); fp.px(cxp + 1, 35, 30)
fp.ell(56, 34, 10, 10, 10); fp.ell(57, 35, 8, 8, 11); fp.r(59, 32, 4, 3, 10); fp.px(58, 36, 12)
fp.r(48, 32, 4, 12, 17); fp.r(49, 29, 2, 4, 17); fp.r(48, 33, 1, 8, 19); fp.px(49, 28, 11)
trophy(fp, 38, 22)
# 炉前石台
fp.r(8, 100, 60, 4, 2); fp.r(8, 100, 60, 1, 4)
fp.save('fireplace')

# ---- 告示板 64×46 ----
bd = C(64, 48)
bd.box(0, 4, 64, 42, WOOD)
bd.r(4, 8, 56, 34, 12)
for _ in range(220):
    bd.px(random.randint(4, 59), random.randint(8, 41), random.choice([11, 11, 13]))
bd.r(4, 8, 56, 1, 11); bd.r(4, 8, 1, 34, 11)
# 顶部雕花
bd.r(22, 0, 20, 6, 8); bd.r(23, 1, 18, 4, 11); bd.r(23, 1, 18, 1, 13)
bd.r(30, 2, 4, 2, 15)


def paper(c, x, y, w, h, tone=7, lines=3, seal=None, tilt=0):
    c.r(x + 1, y + 1, w, h, 10)
    c.r(x, y, w, h, tone)
    c.r(x, y, w, 1, 7 if tone != 7 else 6)
    c.r(x + w - 1, y, 1, h, 6 if tone == 7 else 13)
    for k in range(lines):
        lw = w - 5 - (k % 2) * 3
        c.r(x + 2, y + 3 + k * 3, lw, 1, 4)
    c.px(x + w // 2, y, 29); c.px(x + w // 2, y + 1, 28)
    if seal:
        c.r(x + w // 2 - 2, y + h - 5, 5, 4, seal[0]); c.px(x + w // 2 - 1, y + h - 4, seal[1])


paper(bd, 7, 11, 14, 18, 7, 4)
paper(bd, 23, 14, 13, 15, 6, 3)
paper(bd, 38, 10, 17, 22, 7, 5, seal=(28, 29))
paper(bd, 10, 31, 16, 9, 13, 2)
paper(bd, 30, 31, 10, 8, 7, 1)
bd.r(41, 12, 11, 2, 15)  # 王国信头的金边
bd.save('board')

# ---- 军旗 22×60 ----
def banner(c, x, y):
    c.r(x, y, 22, 3, 8); c.r(x + 1, y + 1, 20, 1, 11); c.r(x - 1, y, 2, 3, 15); c.r(x + 21, y, 2, 3, 15)
    c.r(x + 2, y + 3, 18, 46, 16)
    c.r(x + 3, y + 3, 16, 46, 17)
    c.r(x + 3, y + 3, 2, 46, 18)
    c.r(x + 16, y + 3, 3, 46, 16)
    for k in range(9):  # 燕尾
        c.r(x + 2 + k, y + 49 + k, 9 - k, 1, 17 if k < 8 else 16)
        c.r(x + 11, y + 49 + k, 9 - k, 1, 17 if k < 8 else 16)
    c.r(x + 2, y + 5, 18, 1, 15); c.r(x + 2, y + 45, 18, 1, 15)
    cx_, cy_ = x + 11, y + 24
    for k in range(8):
        c.r(cx_ - k, cy_ - 8 + k, 2 * k + 1, 1, 19); c.r(cx_ - k, cy_ + 8 - k, 2 * k + 1, 1, 19)
    for k in range(5):
        c.r(cx_ - k, cy_ - 5 + k, 2 * k + 1, 1, 16); c.r(cx_ - k, cy_ + 5 - k, 2 * k + 1, 1, 16)
    for k in range(2):
        c.r(cx_ - k, cy_ - 2 + k, 2 * k + 1, 1, 18); c.r(cx_ - k, cy_ + 2 - k, 2 * k + 1, 1, 18)


bn = C(24, 62); banner(bn, 1, 0); bn.save('banner')

# ---- 壁灯(火把座)18×28 ----
sc = C(18, 30)
sc.r(7, 14, 4, 14, 1); sc.r(8, 14, 2, 14, 3)
sc.r(3, 12, 12, 4, 1); sc.r(4, 13, 10, 2, 3); sc.r(4, 13, 10, 1, 4)
sc.r(5, 8, 8, 5, 10); sc.r(5, 8, 8, 1, 11)
flame(sc, 4, 0, 10, 10, [28, 29, 30, 31])
sc.px(8, 6, 7); sc.px(9, 6, 7)
sc.r(6, 24, 6, 3, 1); sc.r(7, 25, 4, 1, 3)
sc.save('sconce')

# ---- 出征之门 96×112 ----
gt = C(96, 114)
# 拱石
for i in range(15):
    import math
    a0 = math.pi * (1 - i / 15); a1 = math.pi * (1 - (i + 1) / 15)
    cx_, cy_, r0, r1 = 48, 50, 34, 46
    pts = [(cx_ + r0 * math.cos(a0), cy_ - r0 * math.sin(a0)), (cx_ + r1 * math.cos(a0), cy_ - r1 * math.sin(a0)),
           (cx_ + r1 * math.cos(a1), cy_ - r1 * math.sin(a1)), (cx_ + r0 * math.cos(a1), cy_ - r0 * math.sin(a1))]
    gt.poly(pts, 1)
    inset = [(px_ + (cx_ - px_) * 0.04, py_ + (cy_ - py_) * 0.04) for px_, py_ in pts]
    gt.poly(inset, random.choice([3, 3, 4]))
# 门框侧柱
for x0 in (2, 82):
    for yy in range(50, 112, 10):
        t = random.choice([3, 4, 3])
        gt.r(x0, yy, 12, 10, 1); gt.r(x0 + 1, yy + 1, 10, 8, t); gt.r(x0 + 1, yy + 1, 10, 1, min(t + 1, 5))
# 拱心石 + 公会纹章
gt.r(41, 0, 14, 14, 1); gt.r(42, 1, 12, 12, 4); gt.r(42, 1, 12, 1, 5)
for k in range(5):
    gt.r(48 - k, 3 + k, 2 * k, 1, 18); gt.r(48 - k, 12 - k, 2 * k, 1, 18)
# 门洞
mk = Image.new('L', (96, 114), 0); md = ImageDraw.Draw(mk)
md.rectangle([14, 50, 81, 113], fill=255); md.ellipse([14, 16, 81, 84], fill=255)
door = C(96, 114)
for x0 in range(14, 82, 7):  # 竖向木板
    t = random.choice([10, 10, 11])
    door.r(x0, 0, 7, 114, 8); door.r(x0 + 1, 0, 5, 114, t); door.r(x0 + 1, 0, 1, 114, t + 1)
    for gy in range(20, 110, 17):
        door.r(x0 + 3, gy + random.randint(0, 6), 1, random.randint(5, 10), 9)
for yy in (40, 66, 92):  # 铁箍
    door.r(14, yy, 68, 6, 0); door.r(14, yy + 1, 68, 4, 2); door.r(14, yy + 1, 68, 1, 4)
    for x0 in range(18, 82, 7):
        door.px(x0, yy + 3, 5); door.px(x0, yy + 2, 4)
door.r(47, 0, 2, 114, 8)  # 两扇门缝
for hx in (40, 54):  # 门环
    door.ell(hx - 3, 74, 7, 7, 8); door.ell(hx - 2, 75, 5, 5, 15); door.ell(hx - 1, 76, 3, 3, 8)
    door.r(hx - 1, 71, 2, 4, 14)
door.dither(14, 16, 68, 22, 8, 0, 2)  # 拱顶内侧阴影
gt.im.paste(door.im, (0, 0), mk)
# 门槛台阶
gt.r(8, 108, 80, 6, 1); gt.r(9, 108, 78, 5, 3); gt.r(9, 108, 78, 1, 5)
gt.save('gate')

# ---- 书架 52×100 ----
sh = C(52, 100)
sh.box(0, 0, 52, 100, WOOD)
sh.r(4, 4, 44, 92, 8)
spines = [17, 21, 27, 28, 25, 14, 10, 20, 16, 24, 29, 18]
for si, sy in enumerate([6, 30, 54, 78]):
    x = 5
    while x < 46:
        w_ = random.choice([2, 3, 3, 4, 4])
        h_ = random.randint(12, 19)
        if x + w_ > 47: break
        col = random.choice(spines)
        lean = random.random() < .08
        top = sy + 20 - h_
        sh.r(x, top, w_, h_, col)
        sh.r(x, top, 1, h_, 0 if col in (10, 14, 16, 17, 20, 24, 27, 28) else 8)
        if w_ >= 3: sh.r(x + 1, top + 2, w_ - 2, 1, 15 if random.random() < .5 else 13)
        if w_ >= 3 and random.random() < .4: sh.r(x + 1, top + h_ - 4, w_ - 2, 1, 15)
        x += w_ + (2 if lean else (1 if random.random() < .15 else 0))
    sh.r(3, sy + 20, 46, 3, 11); sh.r(3, sy + 20, 46, 1, 12); sh.r(3, sy + 22, 46, 1, 9)
# 顶上:骷髅与卷轴
sh.ell(34, -2, 8, 7, 5); sh.r(36, 3, 4, 2, 5); sh.px(36, 1, 0); sh.px(39, 1, 0); sh.px(37, 4, 2); sh.px(38, 4, 2)
sh.r(8, 0, 16, 3, 13); sh.r(8, 0, 16, 1, 7); sh.r(8, 2, 16, 1, 12); sh.px(7, 1, 12); sh.px(24, 1, 12)
sh.save('shelf')

# ---- 讲台 + 大事记 34×46 ----
lc = C(34, 48)
lc.shadow(2, 40, 30, 8)
lc.r(14, 18, 7, 26, 8); lc.r(15, 18, 5, 26, 10); lc.r(15, 18, 2, 26, 11)
lc.r(7, 40, 21, 5, 8); lc.r(8, 40, 19, 3, 10); lc.r(8, 40, 19, 1, 11)
lc.poly([(2, 12), (32, 8), (32, 18), (2, 22)], 8)
lc.poly([(3, 12), (31, 9), (31, 17), (3, 21)], 10)
lc.line([(3, 12), (31, 9)], 12)
# 摊开的书
lc.poly([(4, 8), (16, 6), (16, 15), (4, 17)], 7); lc.poly([(17, 6), (30, 4), (30, 13), (17, 15)], 6)
for k in range(4):
    lc.line([(6, 10 + k * 2), (14, 9 + k * 2)], 4); lc.line([(19, 8 + k * 2), (28, 7 + k * 2)], 4)
lc.r(16, 6, 1, 10, 13)
lc.r(21, 14, 2, 8, 28)  # 书签带
# 蜡烛
lc.r(28, 0, 3, 7, 6); lc.r(28, 0, 1, 7, 7); lc.px(29, -1 + 1, 31)
lc.save('lectern')

# ---- 名人堂壁龛 72×108 ----
mm = C(72, 110)
for row, yy in enumerate(range(0, 110, 9)):
    off = 0 if row % 2 == 0 else 7
    xx = -off
    while xx < 72:
        x0 = max(0, xx); w0 = min(xx + 14, 72) - x0
        if w0 > 1:
            t = random.choice([3, 4, 3])
            mm.r(x0, yy, w0, 9, 2); mm.r(x0 + 1, yy + 1, w0 - 2, 7, t); mm.r(x0 + 1, yy + 1, w0 - 2, 1, min(t + 1, 5))
        xx += 14
mk2 = Image.new('L', (72, 110), 0); m2 = ImageDraw.Draw(mk2)
m2.rectangle([12, 34, 59, 92], fill=255); m2.ellipse([12, 10, 59, 58], fill=255)
inner = C(72, 110); inner.r(0, 0, 72, 110, 1); inner.dither(0, 0, 72, 110, 0, 0, 3)
mm.im.paste(inner.im, (0, 0), mk2)
# 石像:持剑骑士
sx, sy = 36, 24
mm.ell(sx - 6, sy, 12, 12, 4); mm.ell(sx - 5, sy + 1, 9, 9, 5); mm.r(sx - 6, sy + 4, 12, 3, 3)  # 头盔
mm.poly([(sx - 12, sy + 14), (sx + 12, sy + 14), (sx + 10, sy + 54), (sx - 10, sy + 54)], 3)
mm.poly([(sx - 11, sy + 15), (sx + 6, sy + 15), (sx + 4, sy + 53), (sx - 9, sy + 53)], 4)
mm.r(sx - 11, sy + 15, 3, 38, 5)
mm.r(sx - 1, sy + 18, 3, 40, 5); mm.r(sx - 6, sy + 22, 13, 3, 5); mm.r(sx, sy + 18, 1, 40, 6)  # 剑
mm.ell(sx - 4, sy + 20, 9, 6, 4)  # 握剑的手
mm.r(14, 80, 44, 8, 2); mm.r(15, 80, 42, 2, 5); mm.r(15, 86, 42, 1, 1)  # 底座
mm.r(26, 82, 20, 4, 14); mm.r(27, 83, 18, 2, 15)  # 铭牌
for cxp in (17, 22, 49, 54):  # 蜡烛
    h_ = random.choice([6, 8, 5])
    mm.r(cxp, 80 - h_, 2, h_, 6); mm.px(cxp, 80 - h_, 7); mm.px(cxp, 78 - h_, 31); mm.px(cxp, 79 - h_, 30)
mm.r(8, 92, 56, 6, 2); mm.r(9, 92, 54, 1, 5); mm.r(9, 97, 54, 1, 1)
mm.r(4, 98, 64, 12, 2); mm.r(5, 98, 62, 1, 4)
mm.save('memorial')

# ---- 吧台 + 酒桶 128×62 ----
tv = C(130, 64)
tv.shadow(0, 54, 128, 10)
for i, bx in enumerate([4, 24, 44]):  # 酒桶
    by = 6 if i != 1 else 2
    tv.r(bx, by, 20, 28, 8); tv.r(bx + 1, by + 1, 18, 26, 10); tv.r(bx + 2, by + 1, 5, 26, 11); tv.r(bx + 14, by + 1, 4, 26, 9)
    for hy in (by + 4, by + 13, by + 22):
        tv.r(bx + 1, hy, 18, 2, 1); tv.r(bx + 1, hy, 18, 1, 4)
    tv.r(bx + 8, by + 15, 4, 4, 8); tv.r(bx + 9, by + 16, 2, 2, 15)
# 后排酒架
tv.r(68, 6, 34, 26, 8); tv.r(69, 7, 32, 24, 9)
for sy_ in (14, 23):
    tv.r(69, sy_, 32, 2, 11)
for i, (bx, col) in enumerate([(71, 17), (76, 25), (81, 28), (87, 21), (93, 17), (97, 14)]):
    top = 14 - random.randint(6, 8) if i < 6 else 0
    tv.r(bx, top, 3, 14 - top, col); tv.r(bx + 1, top - 2, 1, 2, col); tv.px(bx, top + 1, 7)
for i, bx in enumerate([71, 78, 86, 93]):
    tv.r(bx, 17, 5, 6, 5); tv.r(bx, 17, 5, 1, 7)
# 吧台
tv.r(0, 30, 130, 30, 8)
tv.r(1, 36, 128, 23, 10)
for x0 in range(4, 126, 20):
    tv.r(x0, 38, 16, 18, 9); tv.r(x0 + 1, 39, 14, 16, 10); tv.r(x0 + 1, 39, 14, 1, 11); tv.r(x0 + 1, 39, 1, 16, 11)
tv.r(0, 30, 130, 7, 8); tv.r(1, 30, 128, 5, 11); tv.r(1, 30, 128, 1, 13); tv.r(1, 34, 128, 1, 9)
# 台面上:酒杯、钱袋、蜡烛
for mx in (14, 30, 92, 112):
    tv.r(mx, 23, 6, 7, 3); tv.r(mx + 1, 24, 4, 5, 5); tv.r(mx + 1, 22, 4, 2, 7); tv.r(mx + 6, 25, 1, 3, 3)
tv.ell(56, 24, 10, 8, 11); tv.ell(57, 25, 8, 6, 12); tv.r(59, 22, 4, 3, 10); tv.px(60, 26, 15); tv.px(61, 27, 31)
tv.r(78, 20, 2, 10, 6); tv.r(78, 20, 1, 10, 7); tv.px(78, 18, 31); tv.px(79, 19, 30)
tv.save('tavern')

# ---- 圆桌 + 凳子 56×34 ----
tb = C(58, 36)
tb.shadow(4, 26, 50, 9)
tb.r(10, 14, 3, 16, 9); tb.r(44, 14, 3, 16, 9)
tb.ell(2, 6, 54, 14, 8); tb.ell(3, 6, 52, 12, 11); tb.ell(5, 6, 48, 9, 12); tb.r(10, 7, 20, 1, 13)
tb.r(14, 3, 5, 6, 5); tb.r(14, 3, 5, 1, 7); tb.r(19, 4, 1, 3, 5)  # 酒杯
tb.r(30, 6, 14, 5, 13); tb.r(30, 6, 14, 1, 7); tb.r(31, 8, 10, 1, 4)  # 摊开的地图
tb.r(46, 0, 2, 7, 6); tb.px(46, -1 + 1, 31)
for sx_ in (0, 48):  # 凳子
    tb.ell(sx_, 24, 10, 5, 8); tb.ell(sx_ + 1, 24, 8, 3, 11); tb.r(sx_ + 2, 28, 2, 6, 9); tb.r(sx_ + 6, 28, 2, 6, 9)
tb.save('table')

# ---- 仓库:木箱、宝箱、麻袋 84×52 ----
st = C(86, 54)
st.shadow(0, 44, 86, 10)


def crate(c, x, y, s):
    c.box(x, y, s, s, WOOD)
    c.r(x + 2, y + 2, s - 4, 2, 11); c.r(x + 2, y + s - 4, s - 4, 2, 9)
    for k in range(2, s - 2):
        c.px(x + k, y + k, 9); c.px(x + s - 1 - k, y + k, 9)
        c.px(x + k + 1, y + k, 11)


crate(st, 2, 22, 24); crate(st, 6, 2, 20); crate(st, 26, 26, 20)
# 宝箱
st.box(48, 26, 32, 22, [8, 9, 11, 12])
st.r(49, 22, 30, 8, 11); st.r(50, 21, 28, 2, 12); st.r(49, 29, 30, 1, 8)
for bx in (52, 74):
    st.r(bx, 21, 3, 27, 1); st.r(bx, 21, 1, 27, 4)
st.r(61, 30, 6, 7, 14); st.r(62, 31, 4, 5, 15); st.px(63, 33, 8); st.px(64, 34, 8)
# 麻袋
st.ell(70, 30, 15, 20, 11); st.ell(71, 31, 12, 18, 12); st.ell(72, 32, 6, 10, 13); st.r(75, 28, 5, 4, 11); st.r(74, 31, 7, 1, 9)
st.save('storage')

# ---- 训练场:兵器架、木人、铁砧 108×66 ----
tr = C(110, 68)
tr.shadow(0, 58, 110, 10)
# 兵器架
tr.r(70, 6, 36, 3, 8); tr.r(70, 7, 36, 1, 11); tr.r(70, 38, 36, 3, 8); tr.r(70, 39, 36, 1, 11)
tr.r(70, 2, 4, 62, 9); tr.r(71, 2, 1, 62, 11); tr.r(102, 2, 4, 62, 9); tr.r(103, 2, 1, 62, 11)
# 剑
tr.r(78, 0, 3, 44, 3); tr.r(78, 0, 1, 44, 5); tr.r(75, 40, 9, 2, 14); tr.r(78, 42, 3, 8, 10); tr.r(78, 50, 3, 2, 15)
# 斧
tr.r(88, 4, 2, 52, 10); tr.r(88, 4, 1, 52, 11)
tr.poly([(90, 6), (97, 3), (98, 16), (90, 14)], 3); tr.poly([(90, 7), (96, 5), (96, 14), (90, 13)], 4); tr.line([(96, 5), (97, 15)], 5)
# 长枪
tr.r(97, 0, 2, 60, 10); tr.poly([(96, 0), (98, -6), (100, 0), (98, 8)], 4); tr.r(96, 8, 4, 2, 14)
# 木人
tr.r(44, 14, 4, 52, 10); tr.r(44, 14, 1, 52, 11)
tr.r(34, 24, 24, 4, 11); tr.r(34, 24, 24, 1, 12)
tr.ell(37, 26, 18, 24, 12); tr.ell(38, 27, 10, 22, 13); tr.r(37, 34, 18, 2, 11); tr.r(37, 42, 18, 2, 11)
tr.ell(41, 30, 10, 10, 28); tr.ell(43, 32, 6, 6, 7); tr.ell(45, 34, 2, 2, 28)
tr.ell(38, 4, 16, 16, 12); tr.ell(39, 5, 9, 13, 13); tr.r(42, 10, 2, 2, 8); tr.r(48, 10, 2, 2, 8); tr.r(43, 15, 6, 1, 11)
tr.r(37, 18, 18, 3, 28)  # 围巾
# 铁砧 + 木墩
tr.r(4, 46, 24, 18, 8); tr.r(5, 47, 22, 16, 10); tr.r(5, 47, 22, 1, 12); tr.r(5, 47, 4, 16, 11)
tr.ell(5, 45, 22, 5, 11); tr.ell(8, 46, 16, 3, 12)
tr.r(0, 34, 32, 5, 0); tr.r(1, 34, 30, 4, 3); tr.r(1, 34, 30, 1, 5)
tr.poly([(0, 34), (-4, 37), (0, 38)], 2)
tr.r(6, 38, 18, 4, 1); tr.r(9, 41, 12, 6, 2); tr.r(9, 41, 12, 1, 3)
tr.r(12, 30, 10, 4, 29); tr.r(13, 30, 8, 1, 30)  # 烧红的铁坯
tr.save('base')

# ---- 吊灯 40×40 ----
ch = C(42, 42)
ch.r(20, 0, 2, 18, 1)
ch.ell(4, 18, 34, 10, 0); ch.ell(5, 19, 32, 8, 2); ch.ell(9, 21, 24, 4, 0)
for cxp in (6, 14, 22, 30, 36):
    ch.r(cxp, 12, 3, 8, 6); ch.r(cxp, 12, 1, 8, 7)
    ch.px(cxp + 1, 10, 31); ch.px(cxp + 1, 11, 30); ch.px(cxp + 1, 9, 7)
ch.r(19, 26, 4, 6, 2); ch.px(20, 32, 3)
ch.save('chandelier')

# ============================== 组合预览 ==============================
LAYOUT = {
    'fireplace': (6, 48), 'board': (100, 38), 'banner_l': (222, 18), 'banner_r': (596, 18),
    'sconce_l': (250, 58), 'sconce_r': (372, 58), 'gate': (272, 40), 'memorial': (392, 42),
    'shelf': (468, 52), 'lectern': (548, 104), 'tavern': (14, 192), 'table': (180, 234),
    'storage': (420, 190), 'base': (520, 178), 'chandelier_l': (140, 10), 'chandelier_r': (424, 4),
}
SRC = {'banner_l': 'banner', 'banner_r': 'banner', 'sconce_l': 'sconce', 'sconce_r': 'sconce',
       'chandelier_l': 'chandelier', 'chandelier_r': 'chandelier'}
bg.save('hall_bg')
full = Image.open(os.path.join(OUT, 'hall_bg.png')).convert('RGBA')
for k, (x, y) in LAYOUT.items():
    full.alpha_composite(Image.open(os.path.join(OUT, SRC.get(k, k) + '.png')).convert('RGBA'), (x, y))
full.save(os.path.join(OUT, 'hall_full.png'))
full.resize((1920, 1080), Image.NEAREST).save(os.path.join(OUT, 'hall_full_3x.png'))
import json
json.dump(LAYOUT, open(os.path.join(OUT, 'layout.json'), 'w'))
print('ok')
