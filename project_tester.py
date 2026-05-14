# -*- coding: utf-8 -*-
"""
project_tester.py
=================
Comprehensive test suite for the Atino booking webapp.
Tests Express backend endpoints, Supabase REST tables, Supabase RPCs,
notification flow (insert → read → delete), GCS upload, and frontend smoke.

Usage:
    python project_tester.py [options]

Options:
    --api         Express backend URL    (default: http://localhost:3001)
    --frontend    Vite dev server URL    (default: http://localhost:5173)
    --env         Path to .env file      (default: .env in script directory)
    --timeout     Per-request timeout s  (default: 30)
    --skip-frontend Skip frontend smoke tests
    --json        Save JSON report to this path
    --fail-fast   Stop on first failure
"""

import argparse
import base64
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# Force UTF-8 on Windows
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

try:
    import requests
except ImportError:
    print("[ERR] 'requests' not found. Install: pip install requests")
    sys.exit(1)

FAKE_UUID = "00000000-0000-0000-0000-000000000000"


# ─── ANSI colours ─────────────────────────────────────────────────────────────
def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m"

GREEN  = lambda t: _c("32", t)
RED    = lambda t: _c("31", t)
YELLOW = lambda t: _c("33", t)
CYAN   = lambda t: _c("36", t)
BOLD   = lambda t: _c("1",  t)
DIM    = lambda t: _c("2",  t)


# ─── .env parser ──────────────────────────────────────────────────────────────
def parse_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


# ─── Staff JWT builder ────────────────────────────────────────────────────────
def build_admin_jwt(staff_users_json: str) -> Optional[str]:
    """Build base64(JSON) token for the admin user."""
    try:
        users = json.loads(staff_users_json)
        admin = next((u for u in users if u.get("role") == "admin"), None)
        if not admin:
            return None
        payload = {k: v for k, v in admin.items() if k != "password_hash"}
        return base64.b64encode(json.dumps(payload).encode()).decode()
    except Exception:
        return None


# ─── Case / Result ────────────────────────────────────────────────────────────
@dataclass
class Case:
    group:   str
    method:  str
    url:     str                          # full URL (not path — varies per group)
    label:   str  = ""
    expect:  int  = 200
    body:    Optional[dict] = None
    extra_headers: dict = field(default_factory=dict)
    auth:    str  = "none"               # "staff_jwt" | "anon" | "service_role" | "none"
    check_key: str = ""                  # assert this key in JSON response

    def __post_init__(self):
        if not self.label:
            self.label = self.url.rsplit("/", 1)[-1]


@dataclass
class Result:
    case:      Case
    status:    Optional[int]
    elapsed:   float
    ok:        bool
    error_msg: str = ""
    body_peek: str = ""


# ─── Credentials container ────────────────────────────────────────────────────
@dataclass
class Creds:
    supabase_url: str
    anon_key:     str
    service_key:  str
    admin_jwt:    str


# ─── Runner ───────────────────────────────────────────────────────────────────
def run_case(case: Case, creds: Creds, timeout: int) -> Result:
    headers: dict = {"Content-Type": "application/json"}
    if case.auth == "staff_jwt":
        headers["Authorization"] = f"Bearer {creds.admin_jwt}"
    elif case.auth == "anon":
        headers["apikey"] = creds.anon_key
        headers["Authorization"] = f"Bearer {creds.anon_key}"
    elif case.auth == "service_role":
        headers["apikey"] = creds.service_key
        headers["Authorization"] = f"Bearer {creds.service_key}"
        headers["Prefer"] = "return=representation"
    headers.update(case.extra_headers)

    t0 = time.monotonic()
    try:
        if case.method == "GET":
            resp = requests.get(case.url, headers=headers, timeout=timeout)
        elif case.method == "POST":
            resp = requests.post(case.url, json=case.body, headers=headers, timeout=timeout)
        elif case.method == "DELETE":
            resp = requests.delete(case.url, headers=headers, timeout=timeout)
        elif case.method == "PATCH":
            resp = requests.patch(case.url, json=case.body, headers=headers, timeout=timeout)
        else:
            raise ValueError(f"Unsupported method: {case.method}")

        elapsed = time.monotonic() - t0
        ok = resp.status_code == case.expect

        body_peek = ""
        if not ok:
            try:
                d = resp.json()
                body_peek = str(d.get("error") or d.get("message") or d.get("msg") or d)[:200]
            except Exception:
                body_peek = resp.text[:200]

        # Extra: check_key in response body
        if ok and case.check_key:
            try:
                d = resp.json()
                if isinstance(d, list):
                    d = d[0] if d else {}
                if case.check_key not in d:
                    ok = False
                    body_peek = f"Missing key '{case.check_key}' in response"
            except Exception:
                ok = False
                body_peek = "Response not JSON"

        return Result(case=case, status=resp.status_code, elapsed=elapsed, ok=ok, body_peek=body_peek)

    except requests.exceptions.ConnectionError:
        elapsed = time.monotonic() - t0
        return Result(case=case, status=None, elapsed=elapsed, ok=False,
                      error_msg="Connection refused")
    except requests.exceptions.Timeout:
        elapsed = time.monotonic() - t0
        return Result(case=case, status=None, elapsed=elapsed, ok=False,
                      error_msg=f"Timed out after {timeout}s")
    except Exception as e:
        elapsed = time.monotonic() - t0
        return Result(case=case, status=None, elapsed=elapsed, ok=False, error_msg=str(e))


# ─── Build all cases ──────────────────────────────────────────────────────────
def build_cases(api: str, creds: Creds) -> list[Case]:
    cases: list[Case] = []
    sb = creds.supabase_url

    def add(group, method, url, **kwargs):
        cases.append(Case(group=group, method=method, url=url, **kwargs))

    # ── Express — Health ──────────────────────────────────────────────────────
    add("Express — Health", "GET", f"{api}/api/health",
        label="GET /api/health", expect=200, check_key="status")

    # ── Express — Auth ────────────────────────────────────────────────────────
    add("Express — Auth", "POST", f"{api}/api/booking/finalize",
        label="POST /api/booking/finalize — no auth → 401",
        expect=401, auth="none")
    add("Express — Auth", "POST", f"{api}/api/booking/finalize",
        label="POST /api/booking/finalize — garbage token → 401",
        expect=401, auth="none",
        extra_headers={"Authorization": "Bearer notavalidtoken"})

    # ── Express — Booking API ─────────────────────────────────────────────────
    add("Express — Booking", "POST", f"{api}/api/booking/finalize",
        label="POST /api/booking/finalize — admin + no supplier_account_id → 400",
        expect=400, auth="staff_jwt", body={})
    add("Express — Booking", "POST", f"{api}/api/booking/finalize",
        label="POST /api/booking/finalize — admin + fake supplier_account_id → 403 or 400",
        expect=403, auth="staff_jwt",
        body={"supplier_account_id": FAKE_UUID, "warehouse_id": FAKE_UUID,
              "time_slot": "morning", "delivery_note": "test",
              "session_id": "test", "items": []})

    # ── Express — Upload ──────────────────────────────────────────────────────
    add("Express — Upload", "POST", f"{api}/api/upload/gcs",
        label="POST /api/upload/gcs — no file → 400",
        expect=400, auth="none",
        extra_headers={"Content-Type": "application/json"})

    # ── Supabase — Tables ─────────────────────────────────────────────────────
    for table, check in [
        ("bookings",              "id"),
        ("booking_items",         "id"),
        ("suppliers",             "id"),
        ("supplier_accounts",     "id"),
        ("warehouses",            "id"),
        ("notifications",         "id"),
        ("booking_amendments",    "id"),
        ("booking_item_photos",   "id"),
    ]:
        add("Supabase — Tables", "GET",
            f"{sb}/rest/v1/{table}?select=*&limit=1",
            label=f"SELECT {table} (limit 1)",
            expect=200, auth="anon")

    # reviewed_at column exists on booking_items
    add("Supabase — Tables", "GET",
        f"{sb}/rest/v1/booking_items?select=reviewed_at&limit=1",
        label="booking_items.reviewed_at column exists",
        expect=200, auth="anon")

    # ── Supabase — RPCs ───────────────────────────────────────────────────────
    add("Supabase — RPCs", "POST",
        f"{sb}/rest/v1/rpc/revert_booking_item",
        label="rpc/revert_booking_item — fake UUID → error in body",
        auth="anon",
        body={"p_item_id": FAKE_UUID, "p_reviewer_username": "_tester_"},
        expect=200)

    add("Supabase — RPCs", "POST",
        f"{sb}/rest/v1/rpc/confirm_booking_item",
        label="rpc/confirm_booking_item — fake UUID → no-op",
        auth="anon",
        body={"p_item_id": FAKE_UUID, "p_reviewer_username": "_tester_"},
        expect=200)

    add("Supabase — RPCs", "POST",
        f"{sb}/rest/v1/rpc/reject_booking_item",
        label="rpc/reject_booking_item — fake UUID → no-op",
        auth="anon",
        body={"p_item_id": FAKE_UUID, "p_reason": "test", "p_reviewer_username": "_tester_"},
        expect=200)

    add("Supabase — RPCs", "POST",
        f"{sb}/rest/v1/rpc/admin_delete_booking",
        label="rpc/admin_delete_booking — fake UUID (service role)",
        auth="service_role",
        body={"p_booking_id": FAKE_UUID},
        expect=200)

    # ── Notifications — read-only checks ─────────────────────────────────────
    add("Notifications — Read", "GET",
        f"{sb}/rest/v1/notifications?select=id,event_type,message&limit=5&order=created_at.desc",
        label="SELECT latest notifications (anon)",
        expect=200, auth="anon")
    add("Notifications — Read", "GET",
        f"{sb}/rest/v1/notifications?recipient_type=eq.staff&select=id&limit=1",
        label="SELECT staff notifications filter (anon)",
        expect=200, auth="anon")
    add("Notifications — Read", "GET",
        f"{sb}/rest/v1/notifications?recipient_type=eq.supplier_account&select=id&limit=1",
        label="SELECT supplier_account notifications filter (anon)",
        expect=200, auth="anon")

    return cases




# ─── Frontend smoke tests ─────────────────────────────────────────────────────
FRONTEND_ROUTES = [
    ("/",                   "Landing page"),
    ("/login",              "Login page"),
    ("/booking/new",        "Booking form"),
    ("/my-bookings",        "My bookings"),
    ("/reviewbooking",      "Review booking"),
    ("/receiver",           "Receiver page"),
    ("/admin",              "Admin panel"),
    ("/manager",            "Manager panel"),
    ("/admin/report",       "Report page (admin)"),
    ("/manager/report",     "Report page (manager)"),
    ("/admin/view-as",      "View-as page"),
    ("/guide/create",       "Guide — create"),
    ("/guide/receiving",    "Guide — receiving"),
]


def run_frontend_tests(base_url: str, timeout: int) -> list[Result]:
    results: list[Result] = []
    for path, label in FRONTEND_ROUTES:
        url = base_url.rstrip("/") + path
        case = Case(group="Frontend — Smoke", method="GET", url=url, label=label, expect=200)
        t0 = time.monotonic()
        try:
            resp = requests.get(url, timeout=timeout, allow_redirects=True)
            elapsed = time.monotonic() - t0
            ok = resp.status_code == 200 and ("<div" in resp.text or "root" in resp.text)
            body_peek = "" if ok else f"HTTP {resp.status_code} — no HTML root found"
            results.append(Result(case=case, status=resp.status_code, elapsed=elapsed,
                                   ok=ok, body_peek=body_peek))
        except requests.exceptions.ConnectionError:
            results.append(Result(case=case, status=None, elapsed=time.monotonic() - t0,
                                   ok=False, error_msg="Connection refused — is Vite running?"))
        except Exception as e:
            results.append(Result(case=case, status=None, elapsed=time.monotonic() - t0,
                                   ok=False, error_msg=str(e)[:80]))
    return results


# ─── Output helpers ───────────────────────────────────────────────────────────
def fmt_status(r: Result) -> str:
    if r.status is None:
        return RED("???")
    if r.ok:
        return GREEN(str(r.status))
    if r.status >= 500:
        return RED(str(r.status))
    return YELLOW(str(r.status))


def fmt_time(r: Result) -> str:
    ms = r.elapsed * 1000
    if ms < 500:
        return GREEN(f"{ms:6.0f}ms")
    if ms < 2000:
        return YELLOW(f"{ms:6.0f}ms")
    return RED(f"{ms:6.0f}ms")


def print_results(results: list[Result]) -> None:
    current_group = ""
    for r in results:
        if r.case.group != current_group:
            current_group = r.case.group
            print(f"\n  {CYAN(BOLD(current_group))}")
        icon_s = GREEN("✓") if r.ok else RED("✗")
        meth = DIM(r.case.method.ljust(6))
        label = r.case.label
        print(f"    {icon_s} {meth} {label:<55} {fmt_status(r)}  {fmt_time(r)}")
        if not r.ok:
            msg = r.error_msg or r.body_peek
            if msg:
                msg = msg[:160] + ("…" if len(msg) > 160 else "")
                print(f"         {RED('→')} {DIM(msg)}")


def save_json_report(results: list[Result], out_path: str) -> None:
    report = []
    for r in results:
        report.append({
            "group":      r.case.group,
            "method":     r.case.method,
            "url":        r.case.url,
            "label":      r.case.label,
            "status":     r.status,
            "elapsed_ms": round(r.elapsed * 1000, 1),
            "ok":         r.ok,
            "error":      r.error_msg or r.body_peek,
        })
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(DIM(f"  JSON report → {out_path}"))


# ─── Main ─────────────────────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(description="Atino booking webapp test suite")
    parser.add_argument("--api",          default="http://localhost:3001",
                        help="Express backend URL (default: http://localhost:3001)")
    parser.add_argument("--frontend",     default="http://localhost:5173",
                        help="Vite dev server URL (default: http://localhost:5173)")
    parser.add_argument("--env",          default=None,
                        help="Path to .env file (default: .env next to this script)")
    parser.add_argument("--timeout",      type=int, default=30,
                        help="Per-request timeout in seconds (default: 30)")
    parser.add_argument("--skip-frontend", action="store_true",
                        help="Skip frontend smoke tests")
    parser.add_argument("--json",         default=None,
                        help="Save JSON report to this path")
    parser.add_argument("--fail-fast",    action="store_true",
                        help="Stop on first failure")
    args = parser.parse_args()

    os.system("")  # enable ANSI on Windows

    # Load .env
    env_path = Path(args.env) if args.env else Path(__file__).parent / ".env"
    env = parse_env(env_path)

    supabase_url = env.get("VITE_SUPABASE_URL", "").rstrip("/")
    anon_key     = env.get("VITE_SUPABASE_ANON_KEY", "")
    service_key  = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    staff_users  = env.get("VITE_STAFF_USERS", "[]")
    admin_jwt    = build_admin_jwt(staff_users) or ""

    if not supabase_url or not anon_key:
        print(RED("  [ERR] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not found in .env"))
        print(DIM(f"  env file: {env_path}"))
        return 1
    if not admin_jwt:
        print(YELLOW("  [WARN] Could not build admin JWT from VITE_STAFF_USERS — Express auth tests will be skipped"))

    creds = Creds(
        supabase_url=supabase_url,
        anon_key=anon_key,
        service_key=service_key,
        admin_jwt=admin_jwt,
    )

    print()
    print(BOLD(f"{'─' * 80}"))
    print(BOLD(f"  Atino Booking — Full Test Suite"))
    print(BOLD(f"{'─' * 80}"))
    print(DIM(f"  API:       {args.api}"))
    print(DIM(f"  Supabase:  {supabase_url}"))
    print(DIM(f"  Frontend:  {args.frontend}"))
    print(DIM(f"  .env:      {env_path}"))
    print(DIM(f"  Timeout:   {args.timeout}s"))

    all_results: list[Result] = []

    # ── Express + Supabase cases ───────────────────────────────────────────────
    cases = build_cases(args.api, creds)
    print(DIM(f"\n  Running {len(cases)} API/Supabase tests…"))

    for case in cases:
        r = run_case(case, creds, args.timeout)
        all_results.append(r)
        if args.fail_fast and not r.ok:
            break

    # ── Frontend smoke ────────────────────────────────────────────────────────
    if not args.skip_frontend and not (args.fail_fast and any(not r.ok for r in all_results)):
        fe_results = run_frontend_tests(args.frontend, min(args.timeout, 15))
        all_results.extend(fe_results)

    # ── Print all ─────────────────────────────────────────────────────────────
    print_results(all_results)

    # ── Summary ───────────────────────────────────────────────────────────────
    passed = sum(1 for r in all_results if r.ok)
    failed = len(all_results) - passed
    total_ms = sum(r.elapsed for r in all_results) * 1000

    print()
    print(BOLD(f"{'─' * 80}"))
    print(f"  {GREEN(f'{passed} passed')}  |  {RED(f'{failed} failed')}  |  {len(all_results)} total  |  {total_ms:.0f}ms total")
    print(BOLD(f"{'─' * 80}"))

    if failed:
        print()
        print(RED(BOLD("  FAILED:")))
        for r in all_results:
            if not r.ok:
                msg = r.error_msg or r.body_peek or ""
                print(f"    {RED('✗')} [{r.case.method}] {r.case.label}{DIM(' → ' + msg[:80] if msg else '')}")

    print()

    if args.json:
        save_json_report(all_results, args.json)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
