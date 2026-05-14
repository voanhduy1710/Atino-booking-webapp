"""
Third-pass fix: remaining mojibake where continuation byte 0xA0 (NBSP)
was normalized to regular space 0x20, so run-based fixer couldn't catch it.

'Ã ' -> 'à'  is safe in all these files since Ã never occurs in correct Vietnamese.
"""
import os, glob

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, "src")

# Also check all tsx/ts in src
files = glob.glob(os.path.join(src, "**", "*.tsx"), recursive=True) + \
        glob.glob(os.path.join(src, "**", "*.ts"), recursive=True)

REPLACEMENT = "Ã "  # U+00C3 + U+0020
CORRECT = "à"      # U+00E0

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
