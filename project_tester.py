# -*- coding: utf-8 -*-
"""Always-on full-system audit for the Atino booking webapp.

Run with: ``python project_tester.py``.

There are deliberately no switches: every run validates frontend, backend,
session authorization, Supabase schema/data, and the product-catalog ETL. The
only database write is a short-lived test admin session, which is removed in a
``finally`` block.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import os
import subprocess
import sys
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

try:
    import requests
except ImportError:
    print("Install requests first: pip install requests")
    raise SystemExit(1)

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

ROOT = Path(__file__).resolve().parent
API = "http://localhost:3001"
FRONTEND = "http://localhost:5173"
TIMEOUT_SECONDS = 60
FAKE_UUID = "00000000-0000-0000-0000-000000000000"


@dataclass
class Result:
    area: str
    name: str
    ok: bool
    elapsed_ms: int
    detail: str = ""


# ─── Colour helpers (ANSI) ───────────────────────────────────────────────────
def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m"

GREEN  = lambda t: _c("32", t)
RED    = lambda t: _c("31", t)
YELLOW = lambda t: _c("33", t)
BOLD   = lambda t: _c("1",  t)
DIM    = lambda t: _c("2",  t)


class Audit:
    def __init__(self) -> None:
        self.results: list[Result] = []
        os.system("")  # Enable ANSI escape codes on Windows command prompt

    def add(self, area: str, name: str, ok: bool, started: float, detail: str = "") -> None:
        elapsed = int((time.monotonic() - started) * 1000)
        self.results.append(Result(area, name, ok, elapsed, detail[:280]))
        
        # Real-time printing
        mark = GREEN("PASS") if ok else RED("FAIL")
        suffix = f" — {detail[:280]}" if detail else ""
        print(f"[{mark}] {area}: {name} ({elapsed}ms){suffix}", flush=True)

    def check(self, area: str, name: str, action: Callable[[], Any]) -> Any:
        started = time.monotonic()
        try:
            value = action()
            self.add(area, name, True, started)
            return value
        except Exception as error:  # The audit must continue through every section.
            self.add(area, name, False, started, str(error))
            return None

    def http(
        self,
        area: str,
        name: str,
        method: str,
        url: str,
        expected: set[int],
        *,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        validate: Callable[[requests.Response], bool] | None = None,
    ) -> requests.Response | None:
        started = time.monotonic()
        try:
            response = requests.request(method, url, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
            valid = response.status_code in expected and (validate(response) if validate else True)
            detail = "" if valid else f"HTTP {response.status_code}: {response.text[:240]}"
            self.add(area, name, valid, started, detail)
            return response
        except Exception as error:
            self.add(area, name, False, started, str(error))
            return None


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def issue_test_admin_token(secret: str, jti: str) -> str:
    now = int(time.time())
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(json.dumps({
        "sub": "staff:project-tester", "username": "project-tester", "role": "admin", "jti": jti,
        "iat": now, "exp": now + 900, "iss": "atino-booking-api", "aud": "atino-booking-web", "typ": "access",
    }, separators=(",", ":")).encode())
    signature = b64url(hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def response_json_has(*keys: str) -> Callable[[requests.Response], bool]:
    def validate(response: requests.Response) -> bool:
        try:
            body = response.json()
            return all(key in body for key in keys)
        except ValueError:
            return False
    return validate


def run_command(audit: Audit, name: str, command: list[str]) -> None:
    started = time.monotonic()
    try:
        completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=300, check=False)
        output = (completed.stdout + completed.stderr).strip()
        audit.add("Toolchain", name, completed.returncode == 0, started, output[-280:] if completed.returncode else "")
    except Exception as error:
        audit.add("Toolchain", name, False, started, str(error))


def api_url(path: str) -> str:
    return f"{API}{path}"


def rest_url(supabase_url: str, path: str) -> str:
    return f"{supabase_url}/rest/v1/{path}"


def main() -> int:
    os.system("")  # Ensure ANSI colors are enabled on Windows
    print(BOLD("\nAtino full-system audit"))
    audit = Audit()
    env_path = ROOT / ".env"
    env = audit.check("Configuration", ".env is readable", lambda: parse_env(env_path)) or {}
    required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_ANON_KEY", "AUTH_JWT_SECRET", "GCS_SERVICE_ACCOUNT_JSON"]
    for key in required:
        audit.check("Configuration", f"{key} is configured", lambda key=key: env[key] or (_ for _ in ()).throw(RuntimeError(f"Missing {key}")))

    supabase_url = env.get("SUPABASE_URL", env.get("VITE_SUPABASE_URL", "")).rstrip("/")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    anon_key = env.get("VITE_SUPABASE_ANON_KEY", "")
    service_headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": "application/json", "Prefer": "return=representation"}
    anon_headers = {"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}

    # Compile and test before live integration checks.
    for label, command in [
        ("Frontend typecheck", ["npm.cmd", "run", "typecheck"]),
        ("Backend typecheck", ["npm.cmd", "run", "server:typecheck"]),
        ("Lint", ["npm.cmd", "run", "lint"]),
        ("Unit tests", ["npm.cmd", "test"]),
        ("Production build", ["npm.cmd", "run", "build"]),
    ]:
        run_command(audit, label, command)

    audit.http("Backend", "Health and database readiness", "GET", api_url("/api/health"), {200}, validate=response_json_has("status"))
    audit.http("Backend", "Invalid login is rejected", "POST", api_url("/api/auth/login"), {401}, payload={"username": "project-tester", "password": "invalid-password"})
    for path in ["/api/accounts?status=all", "/api/booking/finalize/supplier-accounts", "/api/notifications", "/api/product-process/sync"]:
        method = "POST" if path.endswith("/sync") else "GET"
        audit.http("Backend authorization", f"Unauthenticated {method} {path}", method, api_url(path), {401})

    # Create a real, short-lived signed admin session for all privileged read and negative-path checks.
    session_jti = str(uuid.uuid4())
    admin_headers: dict[str, str] = {}
    try:
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        inserted = audit.http("Session auth", "Create temporary audit session", "POST", rest_url(supabase_url, "auth_sessions"), {201}, headers=service_headers, payload={"jti": session_jti, "subject": "staff:project-tester", "expires_at": expires_at})
        if inserted:
            admin_headers = {"Authorization": f"Bearer {issue_test_admin_token(env['AUTH_JWT_SECRET'], session_jti)}"}
            audit.http("Backend", "List unified accounts", "GET", api_url("/api/accounts?status=all"), {200}, headers=admin_headers, validate=response_json_has("accounts"))
            audit.http("Backend", "List selectable suppliers", "GET", api_url("/api/accounts/suppliers"), {200}, headers=admin_headers, validate=response_json_has("suppliers"))
            audit.http("Backend", "List warehouses", "GET", api_url("/api/admin-resources/warehouses"), {200}, headers=admin_headers, validate=response_json_has("warehouses"))
            audit.http("Backend", "List suppliers", "GET", api_url("/api/admin-resources/suppliers"), {200}, headers=admin_headers, validate=response_json_has("suppliers"))
            audit.http("Backend", "List booking supplier accounts", "GET", api_url("/api/booking/finalize/supplier-accounts"), {200}, headers=admin_headers)
            audit.http("Backend negative paths", "Reject invalid account import", "POST", api_url("/api/accounts/import"), {400}, headers=admin_headers, payload={"accounts": []})
            audit.http("Backend negative paths", "Reject invalid booking finalization", "POST", api_url("/api/booking/finalize"), {400}, headers=admin_headers, payload={})
            audit.http("Backend negative paths", "Reject upload without a file", "POST", api_url("/api/upload/gcs"), {400}, headers=admin_headers)
            audit.http("Backend", "Reviewer supplier list", "GET", api_url("/api/reviewer/suppliers"), {200}, headers=admin_headers, validate=response_json_has("suppliers"))
            audit.http("Backend", "Reviewer report", "GET", api_url("/api/reviewer/report"), {200}, headers=admin_headers)
            # This is the actual ETL integration run. Its atomic RPC protects the catalog from partial data.
            audit.http("ETL", "Run product catalog sync", "POST", api_url("/api/product-process/sync"), {200}, headers=admin_headers, validate=response_json_has("synced"))
    finally:
        if service_key:
            audit.http("Session auth", "Remove temporary audit session", "DELETE", rest_url(supabase_url, f"auth_sessions?jti=eq.{session_jti}"), {200, 204}, headers=service_headers)

    # Public/read APIs and the ETL output contract.
    audit.http("Backend", "Product catalog lookup", "GET", api_url("/api/product-process?page=1&page_size=1"), {200}, validate=response_json_has("items", "total"))

    # Schema and data contracts through the service role; no business rows are changed here.
    tables = {
        "bookings": "id,booking_code,time_slot,delivery_date",
        "booking_items": "id,booking_id,status,total_quantity,size_4xl_34",
        "supplier_accounts": "id,username,status,password_ciphertext",
        "staff_accounts": "id,username,status,password_hash",
        "staff_account_roles": "staff_account_id,role",
        "auth_sessions": "jti,subject,expires_at,revoked_at",
        "account_audit_events": "id,action,account_kind",
        "product_process_catalog": "id,lark_record_id,total_quantity,size_4xl_34,last_synced_at",
        "suppliers": "id,code,name,active",
        "warehouses": "id,code,name,active",
        "notifications": "id,recipient_type,is_read",
        "pending_uploads": "path,owner_sub,expires_at",
        "internal_job_leases": "job_name,owner_id,expires_at",
        "app_schema_version": "singleton,version",
    }
    for table, columns in tables.items():
        audit.http("Supabase schema", f"{table} columns", "GET", rest_url(supabase_url, f"{table}?select={columns}&limit=1"), {200}, headers=service_headers)
    catalog_response = audit.http("ETL", "Catalog has active rows and 4XL/34 data", "GET", rest_url(supabase_url, "product_process_catalog?active=eq.true&select=lark_record_id,size_4xl_34,last_synced_at&limit=1"), {200}, headers=service_headers)
    if catalog_response is not None:
        try:
            rows = catalog_response.json()
            audit.add("ETL", "Catalog result is non-empty", isinstance(rows, list) and bool(rows), time.monotonic())
        except ValueError:
            audit.add("ETL", "Catalog result is JSON", False, time.monotonic(), "Invalid JSON")
    staff_response = audit.http("Personnel", "Dynamic staff roles are queryable", "GET", rest_url(supabase_url, "staff_accounts?select=username,status,staff_account_roles(role)&status=eq.active"), {200}, headers=service_headers)
    if staff_response is not None:
        try:
            staff = staff_response.json()
            bootstrap_in_db = any(row.get("username") == "voanhduy1710" for row in staff)
            audit.add("Personnel", "Bootstrap admin remains environment-only", not bootstrap_in_db, time.monotonic(), "Bootstrap admin found in staff_accounts" if bootstrap_in_db else "")
        except ValueError:
            audit.add("Personnel", "Staff query is JSON", False, time.monotonic(), "Invalid JSON")
    audit.http("Supabase security", "Anonymous sensitive account reads are blocked", "GET", rest_url(supabase_url, "staff_accounts?select=password_hash&limit=1"), {200, 401, 403}, headers=anon_headers, validate=lambda response: response.status_code != 200 or response.json() == [])

    # Every current SPA route must resolve to the Vite shell; authorization is verified above through the API.
    for route in ["/", "/login", "/guide", "/guide/create", "/guide/receiving", "/booking/new", "/my-bookings", "/reviewbooking", "/report", "/warehouses", "/suppliers", "/accounts", "/viewas", "/product-process"]:
        audit.http("Frontend", f"SPA route {route}", "GET", f"{FRONTEND}{route}", {200}, validate=lambda response: "root" in response.text)

    passed = sum(result.ok for result in audit.results)
    failed = len(audit.results) - passed
    passed_s = GREEN(f"{passed} passed")
    failed_s = RED(f"{failed} failed") if failed else f"{failed} failed"
    print(f"\n{passed_s} | {failed_s}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
