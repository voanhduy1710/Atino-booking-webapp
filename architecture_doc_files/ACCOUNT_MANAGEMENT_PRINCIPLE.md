# Account Management Principle

## Purpose

Account management should be treated as a backend-owned control surface. The frontend may display account state and collect admin intent, but sensitive changes such as approval, rejection, deletion, password reset, password reveal, and staff permission changes must be handled through backend routes with role checks.

This principle keeps the project easier to read, safer to operate, and simpler to maintain as account workflows grow.

## Personnel Model

The project should use a simple two-personnel staff model in environment configuration:

- **Admin**: owns account governance, supplier account review, password support actions, system settings, and sensitive account mutations.
- **Manager**: owns operational oversight, daily review workflows, and non-system administrative visibility granted by the backend.

Older four-personnel concepts such as reviewer, receiver, or other named operational staff should be expressed as permissions, routes, tags, or workflow access. They should not require separate primary staff identities in environment configuration unless the product intentionally expands the personnel model again.

Environment files must not contain real plaintext passwords. Staff credentials should use password hashes, and secrets must stay out of committed files.

## Account Lifecycle

Supplier account registration follows a controlled lifecycle:

1. A supplier submits a registration request.
2. The account enters a pending state.
3. Admin reviews the request and links it to the correct supplier record when appropriate.
4. Admin approves or rejects the request through backend account-management routes.
5. Approved accounts become active and can authenticate through the normal supplier login flow.
6. Rejected, deleted, or reset accounts remain traceable through backend-controlled state changes.

The database can store account status, supplier linkage, and audit-friendly metadata, but the decision to mutate account state should remain in backend business logic.

## Tags and Assignment

Tags should be lightweight metadata for organization, filtering, and assignment. They should not be the source of authorization by themselves.

Recommended account tag categories:

- **Status tag**: pending, active, rejected, disabled, or equivalent account state.
- **Supplier tag**: supplier code, supplier ID, or supplier grouping used to associate the login account with a supplier record.
- **Workflow tag**: operational grouping such as review queue, warehouse flow, dashboard visibility, or manager-owned process.

Authorization should come from backend role checks and permission rules. Tags can help the UI show the right grouping, but backend access control must remain authoritative.

## Password Management

Password handling should follow a support-first model:

- Passwords are hidden by default in the UI.
- Password reveal, if supported, is an exceptional Admin-only support action.
- Password reset should be preferred over password reveal.
- Password values must not be printed to logs, written into documentation, or exposed through debug scripts.
- Backend routes should own password reset behavior and use hashed passwords for authentication.

If plaintext password support is retained for supplier support, it should be treated as sensitive operational data and protected behind explicit Admin-only access.

## Backend Boundary

The frontend should not directly perform sensitive account mutations against Supabase tables. It should call backend APIs, and those APIs should:

- Verify the authenticated staff token.
- Check the caller role.
- Validate the requested account transition.
- Call database functions or table operations from the backend only.
- Return minimal account-management results to the UI.

The backend may continue using Supabase RPC functions for account workflows, but those functions should be wrapped by readable backend route handlers so the project behavior is easy to inspect from the backend folder.

## Operational Principle

The account-management architecture should stay readable in this order:

1. Backend route explains the allowed action.
2. Backend auth middleware explains who may perform it.
3. Database function or query performs the durable mutation.
4. Frontend reflects state and gathers user intent.

This keeps account registration, supplier assignment, tags, password support, and personnel permissions understandable without needing to inspect secrets or scattered UI-only behavior.
