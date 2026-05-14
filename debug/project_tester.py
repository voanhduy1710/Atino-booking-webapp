# -*- coding: utf-8 -*-
"""
project_tester.py
=================
Hits every GET endpoint in the Atino backend and reports HTTP status,
response time, and any error detail.

Usage:
    python project_tester.py [--base http://localhost:8080] [--token <jwt>] [--timeout 30]

Options:
    --base     Base URL of the running backend  (default: http://localhost:8080)
    --token    Bearer JWT for authenticated endpoints (default: reads from .token file)
    --username Login username for auto-auth      (default: PROJECT_TESTER_USERNAME or atino123)
    --password Login password for auto-auth      (default: PROJECT_TESTER_PASSWORD or 123456)
    --timeout  Per-request timeout in seconds        (default: 30)
    --skip-slow  Skip endpoints known to be slow (silent-refresh, load-cache)
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# Force UTF-8 output on Windows
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

try:
    import requests
except ImportError:
    print("[ERR] 'requests' not found. Install with: pip install requests")
    sys.exit(1)

DEFAULT_USERNAME = "atino123"
DEFAULT_PASSWORD = "123456"

# ─── Colour helpers (ANSI) ───────────────────────────────────────────────────
def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m"

GREEN  = lambda t: _c("32", t)
RED    = lambda t: _c("31", t)
YELLOW = lambda t: _c("33", t)
CYAN   = lambda t: _c("36", t)
BOLD   = lambda t: _c("1",  t)
DIM    = lambda t: _c("2",  t)


# ─── Test case definition ─────────────────────────────────────────────────────
@dataclass
class Case:
    group:   str          # section heading
    method:  str          # GET / POST / DELETE
    path:    str          # relative path, e.g. /api/v1/approval/cache-status
    params:  dict  = field(default_factory=dict)
    body:    Optional[dict] = None
    label:   str   = ""   # human-readable description (auto-filled if empty)
    expect:  int   = 200  # expected HTTP status
    slow:    bool  = False  # mark long-running endpoints
    skip_by_default: bool = False  # skip unless --include-slow is passed

    def __post_init__(self):
        if not self.label:
            self.label = self.path.split("/api/v1/", 1)[-1]


# ─── Frontend smoke tests ───────────────────────────────────────────────────────

FRONTEND_ROUTES = [
    ("/",                          "Root redirect"),
    ("/approval",                  "Approval – Đề nghị thanh toán"),
    ("/approval/paymentproposal",   "Approval – Payment proposal"),
    ("/approval/productdevelopment","Approval – Product development"),
    ("/approval/productapproval",   "Approval – Product approval"),
    ("/ledger",                     "Ledger – default"),
    ("/ledger/data",                "Ledger – Sổ quỹ"),
    ("/ledger/report",              "Ledger – Báo cáo"),
    ("/ledger/dataprocessor",       "Ledger – Xử lý ngân hàng"),
    ("/balance",                    "Balance – default"),
    ("/balance/transactions",       "Balance – Biến động"),
    ("/balance/currentbalance",     "Balance – Số dư hiện có"),
    ("/report",                     "Report – Báo cáo tổng quát"),
    ("/cashflow",                   "Cashflow – default"),
    ("/cashflow/reconciliation",    "Cashflow – Đối soát"),
    ("/dashboard",                  "Dashboard – default"),
    ("/dashboard/overview",         "Dashboard – Overview"),
    ("/dashboard/pltable",          "Dashboard – P&L table"),
    ("/dashboard/pltablebytime",    "Dashboard – P&L by time"),
]


def run_frontend_tests(base_url: str, timeout: int) -> tuple[int, int]:
    """Hit every frontend page route on the Vite dev server.
    Returns (passed, total)."""
    import requests as _req
    print()
    print(BOLD(f"{'─' * 80}"))
    print(BOLD(f"  Frontend Smoke Tests  —  {base_url}"))
    print(BOLD(f"{'─' * 80}"))
    print(DIM(f"\n  Checking {len(FRONTEND_ROUTES)} routes"))

    passed = 0
    for path, label in FRONTEND_ROUTES:
        url = base_url.rstrip("/") + path
        t0 = time.monotonic()
        try:
            resp = _req.get(url, timeout=timeout, allow_redirects=True)
            elapsed = time.monotonic() - t0
            ms = elapsed * 1000
            ok = resp.status_code == 200 and ("<div" in resp.text or "root" in resp.text)
            icon_s = GREEN("✓") if ok else RED("✗")
            ms_s = GREEN(f"{ms:6.0f}ms") if ms < 500 else YELLOW(f"{ms:6.0f}ms")
            status_s = GREEN(str(resp.status_code)) if resp.status_code == 200 else RED(str(resp.status_code))
            print(f"    {icon_s} GET    {label:<45} {status_s}  {ms_s}")
            if not ok and resp.status_code != 200:
                print(f"         {RED('→')} {DIM(resp.text[:120])}")
            if ok:
                passed += 1
        except _req.exceptions.ConnectionError:
            print(f"    {RED('✗')} GET    {label:<45} {RED('???')}  {DIM('Connection refused — is Vite running?')}")
        except Exception as exc:
            print(f"    {RED('✗')} GET    {label:<45} {RED('ERR')}  {DIM(str(exc)[:80])}")

    total = len(FRONTEND_ROUTES)
    print()
    print(BOLD(f"{'─' * 80}"))
    print(f"  {GREEN(f'{passed} passed')}  |  {RED(f'{total - passed} failed')}  |  {total} total  (frontend)")
    print(BOLD(f"{'─' * 80}"))
    return passed, total


# ─── All test cases ───────────────────────────────────────────────────────────
def build_cases(skip_slow: bool) -> list[Case]:
    cases: list[Case] = []

    def add(group, method, path, **kwargs):
        c = Case(group=group, method=method, path=path, **kwargs)
        if skip_slow and c.slow:
            return
        cases.append(c)

    # ── Health / server alive ─────────────────────────────────────────────────
    add("Health", "GET", "/api/v1/approval/cache-status",
        label="Server alive (approval cache-status)")

    # ── Approval summary ──────────────────────────────────────────────────────
    add("Approval", "GET",  "/api/v1/approval/cache-status",       label="Cache status")
    add("Approval", "GET",  "/api/v1/approval/filter-options",     label="Filter options")
    add("Approval", "GET",  "/api/v1/approval/summary",
        params={"limit": 10, "offset": 0}, label="Summary (limit=10)")

    # ── Product Development ───────────────────────────────────────────────────
    add("Product Development", "GET", "/api/v1/approval/product-development/cache-status",
        label="PD cache status")
    add("Product Development", "GET", "/api/v1/approval/product-development",
        label="PD main data")
    add("Product Development", "GET", "/api/v1/approval/product-development/report",
        label="PD report")

    # ── Product Approval ──────────────────────────────────────────────────────
    add("Product Approval",    "GET", "/api/v1/approval/product-approval/cache-status",
        label="PA cache status")
    add("Product Approval",    "GET", "/api/v1/approval/product-approval",
        label="PA main data")
    add("Product Approval",    "GET", "/api/v1/approval/product-approval/report",
        label="PA report")
    add("Product Approval",    "GET", "/api/v1/approval/product-approval/image-rows",
        label="PA image rows")
    # fresh-image-urls needs a real request_no — skip if not available
    # add("Product Approval", "GET", "/api/v1/approval/product-approval/fresh-image-urls",
    #     params={"request_no": "SP-XXXXX"}, label="PA fresh image URLs")

    # ── Report ────────────────────────────────────────────────────────────────
    add("Report",    "GET", "/api/v1/report/cache-status",    label="Cache status")
    add("Report",    "GET", "/api/v1/report/filter-options",  label="Filter options")
    add("Report",    "GET", "/api/v1/report/summary",
        params={"limit": 10, "offset": 0, "time_group": "month"},
        label="Summary (limit=10)")

    # ── Balance ───────────────────────────────────────────────────────────────
    add("Balance",   "GET", "/api/v1/balance/cache/status",   label="Cache status")
    add("Balance",   "GET", "/api/v1/balance/filter-options", label="Filter options")
    add("Balance",   "GET", "/api/v1/balance/current-balance",label="Current balance")
    add("Balance",   "GET", "/api/v1/balance/summary",
        params={"limit": 10, "offset": 0}, label="Summary (limit=10)")

    # ── Cashflow ──────────────────────────────────────────────────────────────
    add("Cashflow",  "GET", "/api/v1/cashflow/cache-status",       label="Cache status")
    add("Cashflow",  "GET", "/api/v1/cashflow/summary",
        params={"limit": 10, "offset": 0}, label="Summary (limit=10)")
    add("Cashflow",  "GET", "/api/v1/cashflow/transaction-links",  label="Transaction links")

    # ── Ledger ────────────────────────────────────────────────────────────────
    add("Ledger",    "GET", "/api/v1/ledger/filter-options", label="Filter options")
    add("Ledger",    "GET", "/api/v1/ledger/data",
        params={"limit": 10, "offset": 0}, label="Ledger data (limit=10)")
    add("Ledger",    "GET", "/api/v1/ledger/report",         label="Ledger report")

    # ── Dashboard ─────────────────────────────────────────────────────────────
    add("Dashboard", "GET", "/api/v1/dashboard/cache-status",  label="Cache status")
    add("Dashboard", "GET", "/api/v1/dashboard/filter-options",label="Filter options")
    add("Dashboard", "GET", "/api/v1/dashboard/overview",      label="Overview")
    add("Dashboard", "GET", "/api/v1/dashboard/pl-table",      label="P&L table")
    add("Dashboard", "GET", "/api/v1/dashboard/pl-table-v2",   label="P&L table v2")
    add("Dashboard", "GET", "/api/v1/dashboard/pl-table-by-time",
        params={"view_by": "month"}, label="P&L by time (month)")
    add("Dashboard", "GET", "/api/v1/dashboard/pl-structure",  label="P&L structure")
    add("Dashboard", "GET", "/api/v1/dashboard/revenue",
        params={"limit": 10}, label="Revenue (limit=10)")
    add("Dashboard", "GET", "/api/v1/dashboard/expenses",
        params={"limit": 10}, label="Expenses (limit=10)")

    # ── ETL status ────────────────────────────────────────────────────────────
    add("ETL",  "GET",  "/api/v1/etl/status",           label="ETL status")

    # ── ETL button (triggers actual GCS/BigQuery jobs — slow) ─────────────────
    add("ETL",  "POST", "/api/v1/etl/run-auto-detect",  label="Run auto-detect ETL",        slow=True)
    add("ETL",  "POST", "/api/v1/etl/run-approval",     label="Run approval ETL",            slow=True)
    add("ETL",  "POST", "/api/v1/etl/run-sepay",        label="Run SePay ETL",               slow=True)
    add("ETL",  "POST", "/api/v1/etl/run-sanxuat",      label="Run san xuat ETL",            slow=True)
    add("ETL",  "POST", "/api/v1/etl/run-cost-table",   label="Run cost table ETL",          slow=True)
    add("ETL",  "POST", "/api/v1/etl/run-all",          label="Run ALL ETL (full refresh)",  slow=True)

    # ── Silent background refreshes (re-build in-memory caches) ───────────────
    add("Silent Refresh", "POST", "/api/v1/approval/silent-refresh",
        label="Approval silent refresh", slow=True)
    add("Silent Refresh", "POST", "/api/v1/approval/product-development/silent-refresh",
        label="PD silent refresh", slow=True)
    add("Silent Refresh", "POST", "/api/v1/approval/product-approval/silent-refresh",
        label="PA silent refresh", slow=True)
    add("Silent Refresh", "POST", "/api/v1/dashboard/silent-refresh",
        label="Dashboard silent refresh", slow=True)

    return cases


# ─── Runner ───────────────────────────────────────────────────────────────────
@dataclass
class Result:
    case:      Case
    status:    Optional[int]
    elapsed:   float
    ok:        bool
    error_msg: str = ""
    body_peek: str = ""


def run_case(case: Case, base_url: str, token: Optional[str], timeout: int) -> Result:
    url = base_url.rstrip("/") + case.path
    headers: dict = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    t0 = time.monotonic()
    try:
        if case.method == "GET":
            resp = requests.get(url, params=case.params, headers=headers, timeout=timeout)
        elif case.method == "POST":
            resp = requests.post(url, params=case.params, json=case.body, headers=headers, timeout=timeout)
        elif case.method == "DELETE":
            resp = requests.delete(url, params=case.params, headers=headers, timeout=timeout)
        else:
            raise ValueError(f"Unsupported method: {case.method}")

        elapsed = time.monotonic() - t0
        ok = resp.status_code == case.expect

        # Peek at error body
        body_peek = ""
        if not ok:
            try:
                d = resp.json()
                body_peek = d.get("detail") or d.get("message") or str(d)[:200]
            except Exception:
                body_peek = resp.text[:200]

        return Result(case=case, status=resp.status_code, elapsed=elapsed, ok=ok,
                      body_peek=body_peek)

    except requests.exceptions.ConnectionError:
        elapsed = time.monotonic() - t0
        return Result(case=case, status=None, elapsed=elapsed, ok=False,
                      error_msg="Connection refused — is the backend running?")
    except requests.exceptions.Timeout:
        elapsed = time.monotonic() - t0
        return Result(case=case, status=None, elapsed=elapsed, ok=False,
                      error_msg=f"Timed out after {timeout}s")
    except Exception as e:
        elapsed = time.monotonic() - t0
        return Result(case=case, status=None, elapsed=elapsed, ok=False,
                      error_msg=str(e))


def login(base_url: str, username: str, password: str, timeout: int) -> Optional[str]:
    """Authenticate and return a JWT access token."""
    login_url = base_url.rstrip("/") + "/api/v1/auth/login"
    try:
        resp = requests.post(
            login_url,
            json={"username": username, "password": password},
            timeout=min(timeout, 30),
        )
    except Exception as e:
        print(YELLOW(f"  Auto-login error: {e} — tests will run unauthenticated"))
        return None

    if resp.status_code != 200:
        detail = ""
        try:
            data = resp.json()
            detail = data.get("detail") or data.get("message") or str(data)
        except Exception:
            detail = resp.text[:160]
        print(YELLOW(f"  Auto-login failed ({resp.status_code}) {detail} — tests will run unauthenticated"))
        return None

    token = resp.json().get("access_token")
    if not token:
        print(YELLOW("  Auto-login response did not include access_token — tests will run unauthenticated"))
        return None
    return token


def token_is_valid(base_url: str, token: str, timeout: int) -> bool:
    """Check whether a cached/provided token can access protected routes."""
    url = base_url.rstrip("/") + "/api/v1/etl/status"
    try:
        resp = requests.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=min(timeout, 30),
        )
    except Exception:
        return False
    return resp.status_code != 401


# ─── Output ───────────────────────────────────────────────────────────────────
def fmt_status(r: Result) -> str:
    if r.status is None:
        return RED("???")
    if r.ok:
        return GREEN(str(r.status))
    if r.status >= 500:
        return RED(str(r.status))
    if r.status >= 400:
        return YELLOW(str(r.status))
    return YELLOW(str(r.status))

def fmt_time(r: Result) -> str:
    ms = r.elapsed * 1000
    if ms < 500:
        return GREEN(f"{ms:6.0f}ms")
    if ms < 2000:
        return YELLOW(f"{ms:6.0f}ms")
    return RED(f"{ms:6.0f}ms")


def save_json_report(results: list[Result], out_path: str) -> None:
    report = []
    for r in results:
        report.append({
            "group":   r.case.group,
            "method":  r.case.method,
            "path":    r.case.path,
            "label":   r.case.label,
            "status":  r.status,
            "elapsed_ms": round(r.elapsed * 1000, 1),
            "ok":      r.ok,
            "error":   r.error_msg or r.body_peek,
        })
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(DIM(f"  JSON report saved → {out_path}"))


# ─── Main ─────────────────────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(description="Atino project API tester")
    parser.add_argument("--base",       default="http://localhost:8080",
                        help="Backend base URL (default: http://localhost:8080)")
    parser.add_argument("--token",      default=None,
                        help="Bearer JWT token for auth")
    parser.add_argument("--username",   default=os.getenv("PROJECT_TESTER_USERNAME", DEFAULT_USERNAME),
                        help=f"Login username for auto-auth (default: PROJECT_TESTER_USERNAME or {DEFAULT_USERNAME})")
    parser.add_argument("--password",   default=os.getenv("PROJECT_TESTER_PASSWORD", DEFAULT_PASSWORD),
                        help="Login password for auto-auth (default: PROJECT_TESTER_PASSWORD or built-in dev password)")
    parser.add_argument("--timeout",    type=int, default=300,
                        help="Per-request timeout in seconds (default: 300)")
    parser.add_argument("--skip-slow",  action="store_true",
                        help="Skip slow endpoints (ETL triggers, silent-refresh cache rebuilds)")
    parser.add_argument("--frontend",    default="http://localhost:5173",
                        help="Vite frontend base URL (default: http://localhost:5173). Pass empty string to skip frontend tests.")
    parser.add_argument("--json",       default=None,
                        help="Save results to a JSON file at this path")
    parser.add_argument("--fail-fast",  action="store_true",
                        help="Stop on first failure")
    args = parser.parse_args()

    # Try to read token from debug/.token if not passed.
    token = args.token
    token_source = "argument" if token else ""
    token_file = Path(__file__).parent / "debug" / ".token"
    token_file.parent.mkdir(exist_ok=True)
    if not token:
        if token_file.exists():
            token = token_file.read_text().strip()
            token_source = "cache"
            print(DIM(f"  Using token from {token_file}"))

    if token and not token_is_valid(args.base, token, args.timeout):
        source_label = "cached token" if token_source == "cache" else "provided token"
        print(YELLOW(f"  {source_label.capitalize()} is invalid or expired — refreshing via login"))
        token = None

    # Auto-login if there is no usable token. Tokens are cached in debug/.token.
    if not token:
        token = login(args.base, args.username, args.password, args.timeout)
        if token:
            token_file.write_text(token, encoding="utf-8")
            print(DIM(f"  Auto-logged in as {args.username} -> token cached in {token_file}"))

    cases = build_cases(skip_slow=args.skip_slow)

    os.system("")  # enable ANSI on Windows
    print()
    print(BOLD(f"{'─' * 80}"))
    print(BOLD(f"  Atino API Test Suite  —  {args.base}"))
    print(BOLD(f"{'─' * 80}"))
    print(DIM(f"\n  Running {len(cases)} tests  |  timeout {args.timeout}s per request"))
    if args.skip_slow:
        print(DIM("  (slow endpoints skipped)"))

    results: list[Result] = []
    current_group = ""

    for case in cases:
        # Print group header before the first case in each group
        if case.group != current_group:
            current_group = case.group
            print(f"\n  {CYAN(BOLD(current_group))}")

        # Show a dim "running…" hint for slow cases so the user knows it's working
        if case.slow:
            label_hint = (case.label or case.path).ljust(45)
            print(f"    {DIM('…')} {DIM(case.method.ljust(6))} {DIM(label_hint)}  {DIM('running…')}",
                  end="\r", flush=True)

        r = run_case(case, args.base, token, args.timeout)
        if r.status == 401:
            refreshed = login(args.base, args.username, args.password, args.timeout)
            if refreshed:
                token = refreshed
                token_file.write_text(token, encoding="utf-8")
                print(DIM(f"         refreshed token cached in {token_file}; retrying"))
                r = run_case(case, args.base, token, args.timeout)
        results.append(r)

        # Overwrite the "running…" line (or just print fresh for fast cases)
        icon   = "✓" if r.ok else "✗"
        icon_s = GREEN(icon) if r.ok else RED(icon)
        label  = r.case.label or r.case.path
        meth   = DIM(r.case.method.ljust(6))
        line   = f"    {icon_s} {meth} {label:<45} {fmt_status(r)}  {fmt_time(r)}"
        print(line)

        if not r.ok:
            msg = r.error_msg or r.body_peek
            if msg:
                msg = msg[:160] + ("…" if len(msg) > 160 else "")
                print(f"         {RED('→')} {DIM(msg)}")

        if args.fail_fast and not r.ok:
            break

    # ── Summary ───────────────────────────────────────────────────────────────
    passed = sum(1 for r in results if r.ok)
    failed = len(results) - passed
    total_time = sum(r.elapsed for r in results)

    print()
    print(BOLD(f"{'─' * 80}"))
    print(f"  {GREEN(f'{passed} passed')}  |  {RED(f'{failed} failed')}  |  {len(results)} total  |  {total_time*1000:.0f}ms total")
    print(BOLD(f"{'─' * 80}"))
    print()

    if failed:
        print(RED(BOLD("  FAILED ENDPOINTS:")))
        for r in results:
            if not r.ok:
                msg = r.error_msg or r.body_peek or ""
                msg_s = f" → {msg}" if msg else ""
                print(f"    {RED('✗')} [{r.case.method}] {r.case.path}{DIM(msg_s[:100])}")
        print()

    if args.json:
        save_json_report(results, args.json)

    # ── Frontend smoke tests ───────────────────────────────────────────────────
    fe_passed = fe_total = 0
    if args.frontend:
        fe_passed, fe_total = run_frontend_tests(args.frontend, min(args.timeout, 10))

    all_ok = (failed == 0) and (fe_total == 0 or fe_passed == fe_total)
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
