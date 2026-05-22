# MCP Installation Rules

## Summary

MCP server configuration for this repository must be project-based.

For this project, put MCP settings in:

```text
C:\{Project_folder}\.codex\config.toml
```

Do not put project-specific MCP servers in the global Codex config:

```text
C:\Users\Administrator\.codex\config.toml
```

Global config affects every Codex workspace on the PC. Supabase MCP is tied
to one Supabase project ref, so keeping it global can accidentally expose the
wrong project in another repository.

## Rule

Project MCP servers belong in the repository-local Codex config:

```text
.codex\config.toml
```

Use global Codex config only for settings that are truly shared across every
repository on the machine, such as model defaults or generic UI preferences.

Do not configure any of these globally when they are project-specific:

- Supabase MCP server URLs
- Supabase project refs
- Supabase access tokens
- Database-specific MCP headers
- Repository-specific stdio MCP servers

## Supabase MCP Configuration

The Supabase MCP server should be configured in:

```text
C:\{Project_folder}\.codex\config.toml
```

Required shape:

```toml
[features]
rmcp_client = true

[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp?project_ref=<project-ref>"
http_headers = { Authorization = "Bearer <supabase-personal-access-token>" }
```

For this project, the Supabase project ref is:

```text
{Project_ref_url}
```

The project URL resolved through MCP is:

```text
{Project ref URL}
```

Do not document or commit real Supabase access tokens in architecture docs,
README files, comments, screenshots, or chat examples. Use placeholders like
`<supabase-personal-access-token>`.

## Why Project-Based Config Is Required

Supabase MCP is not a generic tool configuration. It points to a specific
Supabase project:

```text
https://mcp.supabase.com/mcp?project_ref=<project-ref>
```

If this is configured globally, Codex can resolve the same Supabase project
from unrelated repositories. That creates three problems:

1. The wrong project can be inspected or modified from another workspace.
2. Tool discovery becomes confusing because global and project configs can
   disagree.
3. Secrets and project refs become harder to audit.

Keeping the MCP server in `.codex\config.toml` makes the active Supabase
project visible and reviewable with the rest of the repository setup.

## Installation Steps

From the repository root:

```powershell
cd C:\{Project_folder}
```

Create or update:

```text
.codex\config.toml
```

Add the Supabase MCP block:

```toml
[features]
rmcp_client = true

[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp?project_ref={Project_ref_url}"
http_headers = { Authorization = "Bearer <supabase-personal-access-token>" }
```

Keep the token out of documentation and issue comments. If this file is ever
committed, confirm whether it is allowed to contain local credentials first.

## Removing Global Supabase MCP

Check the global config:

```powershell
Select-String -LiteralPath "$env:USERPROFILE\.codex\config.toml" -Pattern "supabase|mcp_servers\.supabase" -Context 2,2
```

If a global Supabase block exists, remove only this block:

```toml
[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp?project_ref=<project-ref>"
http_headers = { Authorization = "Bearer <token>" }
```

Leave unrelated global settings alone.

## Verification

Run these checks from the project root:

```powershell
cd C:\{Project_folder}
```

Confirm the project-local config contains Supabase:

```powershell
Select-String -LiteralPath ".codex\config.toml" -Pattern "supabase|mcp_servers\.supabase" -Context 1,2
```

Confirm the global config does not contain Supabase:

```powershell
Select-String -LiteralPath "$env:USERPROFILE\.codex\config.toml" -Pattern "supabase|mcp_servers\.supabase" -Context 1,2
```

Confirm Codex resolves the Supabase MCP server while the working directory is
this repository:

```powershell
codex mcp get supabase
```

Expected result:

```text
supabase
  enabled: true
  transport: streamable_http
  url: https://mcp.supabase.com/mcp?project_ref={Project ref URL}
```

Inside a Codex chat with the MCP tools loaded, test with a read-only call:

```text
mcp__supabase__.get_project_url
```

Expected project URL:

```text
{Project ref URL}
```

For a second read-only check, list public tables:

```text
mcp__supabase__.list_tables schemas=["public"] verbose=false
```

If the config was just changed and tools are not visible in the current chat,
restart or reload the Codex session so the MCP tool registry refreshes.

## Troubleshooting

If `codex mcp get supabase` does not find Supabase:

1. Confirm the command is running from `C:\{Project_folder}`.
2. Confirm `.codex\config.toml` contains `[mcp_servers.supabase]`.
3. Confirm `[features] rmcp_client = true` is present.
4. Confirm the project ref is correct.
5. Reload the Codex session after config changes.

If the MCP endpoint is reachable but tools are missing in chat, the session
probably loaded before the MCP server was added. Restart the chat.

If authentication fails, refresh the Supabase personal access token and update
only the project-local `.codex\config.toml`.

## Security Notes

Do not store Supabase service role keys in MCP docs.

Do not paste personal access tokens into chat unless the token is being rotated
immediately after use.

Prefer project-local configuration so secrets, project refs, and MCP behavior
can be reviewed together with the repository that uses them.

