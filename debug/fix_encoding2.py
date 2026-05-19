"""
Third-pass fix for a historical encoding issue where the UTF-8 continuation
byte 0xA0 was normalized to a regular space. Kept for archive/debug use.
"""
import glob
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, "src")

files = glob.glob(os.path.join(src, "**", "*.tsx"), recursive=True) + \
        glob.glob(os.path.join(src, "**", "*.ts"), recursive=True)

REPLACEMENT = "\u00c3 "  # U+00C3 + U+0020
CORRECT = "\u00e0"       # U+00E0

fixed_count = 0
for path in sorted(files):
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        if REPLACEMENT not in content:
            continue
        fixed = content.replace(REPLACEMENT, CORRECT)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(fixed)
        rel = os.path.relpath(path, root).replace("\\", "/")
        print(f"FIXED {rel}")
        fixed_count += 1
    except Exception as e:
        print(f"ERROR {path}: {e}")

print(f"\nDone: {fixed_count} files fixed")
