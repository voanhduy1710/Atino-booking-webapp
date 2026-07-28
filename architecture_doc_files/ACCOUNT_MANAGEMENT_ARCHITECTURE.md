# Universal Account and Permission Management Architecture

## 1. Purpose

This document is a reusable reference architecture for applications that need:

- user and service accounts;
- secure password authentication;
- account creation, suspension, reactivation, and credential reset;
- role-based access control (RBAC);
- optional direct permissions;
- route, action, or resource authorization;
- session invalidation after security-sensitive changes;
- administrative interfaces and audit trails.

It intentionally does not prescribe a programming language, framework, database,
cloud provider, UI library, endpoint prefix, table name, role name, or product
feature.

## 2. Core Principles

1. **One authentication authority**: only a non-reversible password hash is used
   to verify a password.
2. **Controlled recoverability**: when an Actual password column is required,
   treat readable-password storage as an explicit high-risk exception with
   narrow reveal access, redaction, encryption where possible, and documented
   risk acceptance.
3. **Backend enforcement**: hidden UI elements are a usability feature, not an
   authorization boundary.
4. **Least privilege**: accounts receive only required permissions.
5. **Deny by default**: an unmapped operation is rejected.
6. **Immediate containment**: disabling an account or changing credentials can
   invalidate active sessions.
7. **Credential redaction**: hashes, plaintext values, reset tokens, and secrets
   never enter API responses, logs, analytics, or audit payloads.
8. **Traceable administration**: security-sensitive changes record actor,
   target, action, time, and non-secret metadata.
9. **Separation of concerns**: authentication proves identity; authorization
   decides what that identity may do.

## 3. Logical Components

| Component | Responsibility |
|---|---|
| Authentication service | Verify credentials, apply login controls, issue sessions or tokens |
| Account service | Manage identity profile, status, and lifecycle |
| Credential service | Hash passwords, reset credentials, enforce password policy |
| Authorization service | Resolve roles and permissions and evaluate access decisions |
| Session service | Issue, refresh, revoke, and validate sessions |
| Administration API | Expose protected account and permission operations |
| Administration UI | Provide account, role, and permission workflows |
| Audit service | Record security events with mandatory credential redaction |
| Notification service | Deliver reset links and security-change notifications |

These may be separate services or modules in one application. Their security
responsibilities should remain distinct even when deployed together.

## 4. Reference Data Model

Names below are logical examples. Adapt them to local naming conventions.

### 4.1 Account

| Field | Purpose |
|---|---|
| `id` | Stable internal identifier |
| `username` or `email` | Normalized unique login identifier |
| `display_name` | Human-readable label |
| `status` | `active`, `disabled`, `locked`, or another explicit state |
| `password_hash` | Non-reversible password verifier |
| `current_password` | Recoverable source for the Actual password string shown to authorized administrators; plaintext string or encrypted value according to the selected storage option |
| `credential_version` | Incremented after password or authentication changes |
| `authorization_version` | Incremented after role or permission changes |
| `last_login_at` | Last successful authentication timestamp |
| `password_changed_at` | Credential rotation timestamp |
| `created_at`, `updated_at` | Record timestamps |

### 4.2 Role and permission entities

| Entity | Purpose |
|---|---|
| Account | Identity and lifecycle state |
| Role | Named bundle of permissions |
| Permission | Stable authorization key for an action or resource |
| Account-role mapping | Assign zero or more roles to an account |
| Role-permission mapping | Assign zero or more permissions to a role |
| Optional account-permission mapping | Grant or deny exceptional permissions directly |
| Session | Track refresh token, device, expiry, and revocation state |
| Audit event | Record administrative and security activity |

Use immutable internal identifiers for relationships. Treat usernames, email
addresses, labels, and role names as editable attributes.

## 5. The Two Password Columns

Some inherited systems contain both:

- `password_hash`;
- `current_password`.

These columns must not be treated as equivalent.

### 5.1 `password_hash`

`password_hash` is the authentication credential.

Required properties:

- stores output from a password hashing algorithm, not encryption;
- uses Argon2id, scrypt, or bcrypt with parameters selected through current
  security guidance and performance testing;
- includes algorithm parameters and salt in the encoded hash format;
- is compared through the hashing library's verification function;
- is replaced whenever the password changes;
- is never returned by an API;
- is never displayed in an administration UI;
- is never written to application or audit logs.

A masked value in an account table is a visual placeholder. It does not mean the
original password can be recovered.

### 5.2 `current_password`: actual password display source

If the product requires administrators to see the actual password string,
`current_password` is the readable-password source for an **Actual password**
column in the account-management table.

The displayed value must be the real password string. It is not the hash, a
fixed placeholder, or a truncated value. `password_hash` remains the only field
used for authentication.

This is a high-risk design because it makes passwords recoverable.

Risks include:

- database readers can impersonate every account;
- backups, replicas, exports, and support tools duplicate the exposure;
- API serialization can leak the value to browsers or clients;
- audit before/after snapshots can retain it indefinitely;
- operators may mistake it for the real authentication authority;
- it can diverge from `password_hash`;
- a database compromise becomes an immediate credential compromise;
- users often reuse passwords across unrelated systems.

`current_password` must never be used as a login fallback. Authentication should
fail if `password_hash` verification fails.

### 5.3 Required behavior for the two-column design

Both fields must be updated atomically so the displayed password matches the
password that authenticates.

| Operation | `password_hash` | Readable password value |
|---|---|---|
| Create account | Store hash of submitted password | Store the same submitted password |
| Change/reset password | Replace with hash of new password | Replace with the same new password |
| Authenticate | Read and verify | Never use |
| Bulk list accounts | Never return | Prefer not to return |
| Reveal one account password | Never return | Return only after privileged authorization |
| Audit account change | Always redact | Always redact |
| Log or error payload | Always redact | Always redact |
| Export for support | Exclude | Exclude |

If either write fails, roll back both writes. A partially updated pair produces
a displayed password that cannot log in.

### 5.4 Storage options for the readable value

#### Option A: plaintext `current_password`

- Column type is a normal string/text value.
- The database contains the exact password.
- The administration UI can display it directly.
- This is the simplest implementation and the highest-risk option.
- Every database reader, backup reader, and replica reader can recover all
  passwords.

#### Option B: encrypted readable password (recommended)

- Store ciphertext in a field such as `password_ciphertext`.
- Encrypt with an authenticated encryption algorithm.
- Keep the encryption key in an external key-management or secret-management
  service, not in the database.
- Decrypt only for a separately authorized password-reveal operation.
- Return the plaintext only to the requesting privileged administrator.
- Never cache the plaintext response.

Both options allow an Actual password column to show the real string. Option B
reduces database-only exposure but remains a recoverable-password architecture.

### 5.5 Actual password column behavior

The account-management table includes one column named **Actual password**.

Recommended interaction:

1. Initial cell value is concealed.
2. A privileged administrator activates Reveal.
3. The client performs step-up authentication if required.
4. The server authorizes a dedicated password-reveal permission.
5. The server reads or decrypts the readable password.
6. The cell displays the exact password string.
7. The reveal event is audited without the password value.
8. The value is cleared when the row, page, or session loses focus or after a
   short timeout.

If a project requires the string to be always visible, the same column may load
the plaintext immediately. In that mode, the entire page and API must be limited
to the smallest possible administrator group, browser caching must be disabled,
and screen recording, screenshots, shoulder surfing, and support-tool capture
must be accepted as explicit risks.

### 5.6 Readable password API contract

Prefer a dedicated single-account reveal operation instead of including all
passwords in the bulk account response.

Conceptual response:

```json
{
  "account_id": "stable-account-id",
  "actual_password": "the-real-password-string",
  "expires_at": "short-lived-display-expiry"
}
```

Requirements:

- real-administrator or dedicated reveal permission;
- step-up authentication;
- no shared or browser cache;
- no analytics capture;
- no response-body logging;
- no inclusion in error reports;
- per-account reveal audit event;
- rate limit and anomaly monitoring.

## 6. Authentication Flow

```text
Client submits identifier + password
  -> normalize identifier
  -> apply per-IP and per-account rate limits
  -> load account and credential metadata
  -> reject disabled or locked account
  -> verify password against password_hash
  -> optionally upgrade an outdated hash
  -> evaluate MFA or risk policy
  -> create revocable session
  -> return minimal identity and authorization context
  -> record successful login without credential data
```

Failure responses should not reveal whether the account exists. Apply comparable
work and generic error messages to reduce account enumeration.

## 7. Password Lifecycle

### 7.1 Account creation

- Generate or accept the initial password only over a protected channel.
- Prefer a short-lived activation link over administrator-created passwords.
- Hash before persistence.
- Do not include the password in the normal creation response; use the dedicated
  privileged reveal operation when an administrator must view it.
- Require a change on first login when an administrator generated it.

### 7.2 User-initiated change

- Require the current password or a recently elevated session.
- Validate password policy and breached-password rules.
- replace `password_hash`;
- increment `credential_version`;
- update `password_changed_at`;
- revoke other sessions according to policy;
- send a security notification.

### 7.3 Administrative reset

- Prefer a single-use, short-lived reset link.
- Do not expose a readable password in the account table.
- Record who initiated the reset, not the new password or hash.
- Revoke existing sessions.
- Require password selection or change at next login.

### 7.4 Forgotten-password flow

Store only a hash of the reset token, with:

- account identifier;
- expiration time;
- used/revoked state;
- request metadata;
- rate-limit metadata.

Consume the token once and invalidate all outstanding reset tokens for that
account.

## 8. Authorization Model

The standard RBAC resolution path is:

```text
account
  -> assigned roles
  -> role permissions
  -> optional direct grants/denials
  -> effective permissions
  -> authorization decision for action + resource + context
```

Permission keys should describe stable actions, for example:

- `resource.read`;
- `resource.create`;
- `resource.update`;
- `resource.delete`;
- `resource.export`;
- `account.manage`;
- `permission.manage`.

Avoid encoding page labels or temporary UI structure into permission keys.

### 8.1 Decision order

A reusable policy is:

1. reject unauthenticated requests;
2. reject disabled, locked, expired, or revoked identities;
3. apply explicit denial if supported;
4. allow a narrowly defined break-glass administrator policy;
5. require the permission for the requested action;
6. apply resource ownership, tenant, region, or data-scope constraints;
7. deny by default.

### 8.2 Frontend versus backend

The frontend may use permissions to:

- hide navigation items;
- disable buttons;
- explain missing access;
- preview role behavior.

Every protected backend operation must repeat the authorization decision using
trusted server-side identity data.

## 9. Account Lifecycle

| State | Login | Existing sessions | Typical use |
|---|---|---|---|
| `pending` | Denied until activation | None | Newly invited account |
| `active` | Allowed | Allowed | Normal operation |
| `locked` | Denied until unlock/policy expiry | Usually revoked | Automated abuse response |
| `disabled` | Denied | Revoke immediately | Administrative suspension |
| `deleted` | Denied | Revoke immediately | Retention-controlled removal |

State changes should increment a version or revoke sessions so that the change
does not wait for token expiry.

## 10. Session and Token Architecture

### 10.1 Recommended model

- Short-lived access token or opaque session identifier.
- Rotating refresh token stored as a hash.
- Server-side session record with account, device, expiry, and revocation state.
- `credential_version` and `authorization_version` included in or associated
  with the session.
- Version comparison during refresh and, for high-risk operations, during each
  request.

### 10.2 Invalidation triggers

Revoke or invalidate sessions after:

- password change or reset;
- account disable, lock, or deletion;
- MFA recovery or removal;
- role or permission change, when immediate enforcement is required;
- suspected credential compromise;
- administrator-requested sign-out.

Stateless long-lived tokens without a revocation/version check delay security
changes until expiration.

## 11. Generic Administration API

Exact routes are implementation choices. A typical surface includes:

| Operation | Security requirement |
|---|---|
| List/get accounts | Account-read permission; never return credential fields |
| Create/invite account | Account-create permission plus strong audit |
| Update profile/status | Account-update permission |
| Assign roles | Role-assignment permission |
| Initiate password reset | Credential-reset permission and step-up authentication |
| List roles/permissions | Permission-read permission |
| Change role permissions | Permission-manage permission and step-up authentication |
| Revoke sessions | Session-revoke permission |
| Read audit events | Audit-read permission with sensitive-field controls |

Use separate request and response types. Never serialize database account rows
directly.

## 12. Administration UI

Recommended account table columns:

- login identifier;
- display name;
- status;
- roles;
- last login;
- credential last changed;
- MFA state;
- Actual password;
- available administrative actions.

The Actual password cell displays the exact string after authorized reveal, or
immediately in explicitly accepted always-visible mode. It must never display
the contents of `password_hash`.

Do not include:

- password hash;
- reset token;
- refresh token;
- secret answer;
- API secret.

Use a deliberate confirmation and step-up authentication for disable, delete,
credential reset, permission escalation, and session revocation.

## 13. Audit Architecture

An audit event should contain:

| Field | Example meaning |
|---|---|
| Event identifier | Unique immutable ID |
| Timestamp | Server-generated UTC time |
| Actor | Account or service performing the action |
| Action | Stable machine-readable event key |
| Target | Account, role, permission, or session identifier |
| Outcome | Success or failure |
| Request context | Correlation ID, source address, client metadata |
| Change summary | Redacted field names or non-secret before/after values |

Mandatory redaction list:

- any field whose name contains password, credential, secret, token, key, hash,
  authorization, cookie, or recovery answer;
- request bodies from login, password-change, password-reset, token, and
  activation endpoints;
- database rows containing credential material.

Prefer allowlisting safe audit fields over blocklisting dangerous fields.

## 14. Security Controls

Minimum controls:

- TLS for every credential-bearing connection;
- modern password hashing and automatic rehash support;
- login and reset rate limits;
- generic authentication failures;
- strong password and breached-password checks;
- optional or mandatory MFA based on risk;
- CSRF protection for cookie sessions;
- secure, HTTP-only, same-site cookies when cookies are used;
- strict CORS policy;
- secret-manager integration;
- database least privilege;
- encrypted backups;
- centralized redaction;
- dependency and security scanning;
- alerts for repeated failures and permission escalation.

## 15. Migration and Compatibility

Schema migrations should be:

- idempotent where possible;
- forward-compatible during rolling deployment;
- explicit about nullable-to-required transitions;
- accompanied by backfill and cleanup steps;
- reversible until destructive cleanup begins;
- tested against both previous and target schema versions.

Do not silently fall back to plaintext authentication when a hash column or
credential service is unavailable. Fail closed and surface an operational error.

## 16. Testing Strategy

### Authentication tests

- correct password succeeds;
- incorrect password fails;
- `current_password` never authenticates;
- disabled and locked accounts fail;
- rate limiting activates;
- hash upgrade works;
- reset tokens expire and are single-use.

### Authorization tests

- each protected action denies missing permission;
- role changes alter effective permissions;
- frontend visibility matches backend policy;
- tenant/resource constraints prevent cross-scope access;
- administrator bypass is narrowly tested.

### Credential-leakage tests

- bulk account responses omit both password columns;
- the privileged reveal response returns the exact readable password and never
  returns `password_hash`;
- the Actual password column displays the exact test password after authorized
  reveal;
- unauthorized reveal requests fail;
- reveal responses are not cached;
- logs omit submitted passwords and hashes;
- audit events redact credential fields;
- exports and error payloads omit secrets;
- database fixtures use synthetic non-production values.

### Session tests

- password reset revokes sessions;
- disable/delete revokes sessions;
- version mismatch rejects or refreshes stale authorization;
- refresh-token rotation detects reuse.

## 17. Adoption Checklist

- Choose account identifiers and normalization rules.
- Select the password-hashing algorithm and benchmark its parameters.
- Define account states and transition permissions.
- Define roles, permissions, resource scopes, and default-deny behavior.
- Decide whether access changes require immediate session invalidation.
- Choose plaintext or encrypted storage for the readable password and document
  the accepted exposure.
- Define who may reveal the Actual password column and whether it is concealed
  initially or always visible.
- Separate request DTOs, response DTOs, and persistence models.
- Implement centralized credential redaction.
- Protect administrative actions with step-up authentication.
- Document session lifetime, refresh, and revocation.
- Test credential leakage across APIs, logs, audits, exports, and backups.
- Define retention and access policy for audit events.
- Establish a break-glass procedure with monitoring and post-use review.

## 18. Project-Specific Decisions to Supply

Each adopting project should provide its own:

- framework and module layout;
- database technology and physical table names;
- endpoint paths;
- identity providers;
- tenant and resource-scope rules;
- roles and permission catalog;
- token/session format and lifetime;
- MFA policy;
- password policy;
- audit retention;
- notification channels;
- migration filenames and deployment procedure.

Keep those decisions in project-local documentation. Keep this file as the
technology-neutral security and architecture reference.
