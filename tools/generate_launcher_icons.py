#!/usr/bin/env python3
"""Generate mipmap launcher icons from Rebel avatar."""
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..", "app", "src", "main", "res")
DENSITIES = [
    ("mipmap-mdpi", 48),
    ("mipmap-hdpi", 72),
    ("mipmap-xhdpi", 96),
    ("mipmap-xxhdpi", 144),
    ("mipmap-xxxhdpi", 192),
]
FG_DENSITIES = [
    ("mipmap-mdpi", 108),
    ("mipmap-hdpi", 162),
    ("mipmap-xhdpi", 216),
    ("mipmap-xxhdpi", 324),
    ("mipmap-xxxhdpi", 432),
]


def circle_crop(img: Image.Image, size: int) -> Image.Image:
    img = img.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "/tmp/rebel_avatar.jpg"
    img = Image.open(src).convert("RGBA")
    for folder, size in DENSITIES:
        out_dir = os.path.join(ROOT, folder)
        os.makedirs(out_dir, exist_ok=True)
        icon = circle_crop(img, size)
        icon.save(os.path.join(out_dir, "ic_launcher.png"))
        icon.save(os.path.join(out_dir, "ic_launcher_round.png"))
    for folder, size in FG_DENSITIES:
        out_dir = os.path.join(ROOT, folder)
        os.makedirs(out_dir, exist_ok=True)
        fg = circle_crop(img, int(size * 0.72))
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        offset = (size - fg.width) // 2
        canvas.paste(fg, (offset, offset - int(size * 0.04)), fg)
        canvas.save(os.path.join(out_dir, "ic_launcher_foreground.png"))
    print("launcher icons generated")


if __name__ == "__main__":
    main()
