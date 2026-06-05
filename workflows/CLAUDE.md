# CLAUDE.md — workflow/runner pitfalls

Operational details for running the multi-agent workflow scripts in this directory.
These are agent/runner concerns; a human reviewing the *findings* can ignore them.

- **Concurrency:** run at most ~2 heavy detection workflows at once. ~60+ concurrent
  subagents caused mass "completed without StructuredOutput" failures (model-API
  starvation). Always retry schema-enforced agents once — the runners do this.
- **playwright:** any agent that opens a page MUST `playwright-cli close` when done.
  Leaving the browser open leaks processes on the host (this happened in early runs).
- **args:** a Workflow's `args` arrives as a *string* → `JSON.parse` it defensively at
  the top of each script.
- **identity:** attach the authoritative `(candidate, topic)` from the orchestrator;
  never trust an agent's echoed identifiers (caused index collisions in an early
  adjudicator). Per-record files + a positional id list is the safe pattern.
- **source sheet** exceeds read-tool token limits — decode the xlsx and parse with
  openpyxl (`tools/parse_xlsx.py`); don't read it whole.
