"""
Fix double-encoded UTF-8 (mojibake) in TSX/TS files.

Root cause: Vietnamese UTF-8 bytes interpreted as cp1252 (or latin-1 for
undefined cp1252 bytes), then stored as UTF-8.

Fix: for each run of high chars (> 0x7F), encode each char back to its raw
byte (cp1252 for cp1252-defined chars, latin-1 for C1 control range fallback),
then decode the resulting bytes as UTF-8.
"""
import os

FILES = [
    "src/features/admin/tabs/AccountsTab.tsx",
    "src/features/admin/tabs/SuppliersTab.tsx",
    "src/features/admin/tabs/WarehousesTab.tsx",
    "src/features/auth/AccountsPage.tsx",
    "src/features/booking/components/PoRow.tsx",
    "src/features/home/GuidePage.tsx",
    "src/features/home/LandingPage.tsx",
    "src/features/manager/index.tsx",
    "src/features/notifications/components/NotificationPanel.tsx",
    "src/features/warehouse/reviewer/AmendmentPanel.tsx",
    "src/features/warehouse/reviewer/BookingDetailModal.tsx",
    "src/features/warehouse/reviewer/BookingTooltip.tsx",
    "src/shared/components/Drawer.tsx",
    "src/shared/components/FilterDatePicker.tsx",
    "src/shared/components/filters/DateRangePickerPopup.tsx",
    "src/shared/components/Modal.tsx",
]

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Build a char→byte mapping combining cp1252 and latin-1.
# cp1252 takes priority for chars it defines; latin-1 used for C1 controls.
_char_to_byte: dict[str, int] = {}
for b in range(256):
    # cp1252 decode
    try:
        c = bytes([b]).decode("cp1252")
        _char_to_byte[c] = b
    except Exception:
        pass
# Ensure latin-1 C1 control chars (0x80-0x9F) are covered if cp1252 left gaps
for b in range(0x80, 0xA0):
    c = chr(b)  # latin-1: byte value == unicode codepoint
    if c not in _char_to_byte:
        _char_to_byte[c] = b


def char_to_byte(c: str) -> int | None:
    return _char_to_byte.get(c)


def try_fix_run(run: str) -> str:
    """
    Encode a run of high chars to bytes using the combined mapping,
    then decode as UTF-8. Return original on any failure.
    """
    raw = bytearray()
    for c in run:
        b = char_to_byte(c)
        if b is None:
            return run  # Unknown char — can't fix this run
        raw.append(b)
    try:
        decoded = raw.decode("utf-8")
        return decoded
    except UnicodeDecodeError:
        return run


def fix_mojibake(text: str) -> str:
    result = []
    i = 0
    while i < len(text):
        c = text[i]
        if ord(c) > 0x7F:
            # Collect a run of high chars
            run = []
            while i < len(text) and ord(text[i]) > 0x7F:
                run.append(text[i])
                i += 1
            result.append(try_fix_run("".join(run)))
        else:
            result.append(c)
            i += 1
    return "".join(result)


fixed_count = 0
failed_count = 0
unchanged_count = 0

for rel in FILES:
    path = os.path.join(root, rel.replace("/", os.sep))
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            content = f.read()

        fixed = fix_mojibake(content)

        if fixed == content:
            print(f"UNCHANGED {rel}")
            unchanged_count += 1
            continue

        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(fixed)
        print(f"FIXED {rel}")
        fixed_count += 1
    except Exception as e:
        print(f"ERROR {rel}: {e}")
        failed_count += 1

print(f"\nDone: {fixed_count} fixed, {unchanged_count} unchanged, {failed_count} errors")
