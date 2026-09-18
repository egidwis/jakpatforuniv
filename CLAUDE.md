## graphify

This project has a knowledge graph at `graphify-out/` with god nodes, community
structure, and cross-file relationships. Use it to answer codebase questions with a
small scoped subgraph instead of broad grepping.

### Invoking graphify

Always invoke graphify as a **Python module through the project venv**, never via the
bare `graphify` launcher. The launcher is a generated `.exe`/shim that is often not on
PATH, and on some Windows machines it is blocked outright by Application Control policy.
The module form has neither problem.

Pick the interpreter for the local venv layout (paths are relative to the repo root):

- Windows: `.venv\Scripts\python.exe -m graphify <args>`
- macOS / Linux: `.venv/bin/python -m graphify <args>`

If `graphify-out/.graphify_python` exists, it records the interpreter that built the
graph — prefer that path when present.

Not installed yet? `python -m pip install "graphifyy[sql]"` inside the venv. The `[sql]`
extra matters here: without it the `.sql` migrations are silently indexed as nothing.

### Rules

Substitute the invocation above wherever `graphify` appears below.

- For codebase questions, first run `graphify query "<question>"` when
  `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for relationships and
  `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph,
  usually much smaller than GRAPH_REPORT.md or raw grep output.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw
  source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review, or when
  query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no
  LLM and no API cost). Add `--force` if a large deletion/refactor makes the rebuild
  refuse to write a smaller graph.
- Whenever the user asks to commit a change, run `graphify update .` as part of that
  commit workflow (before or alongside the commit), not just opportunistically.

### First-time setup on a new machine

`graphify-out/` is gitignored, so each clone builds its own graph:

    python -m graphify extract . --code-only    # build the graph (no API key needed)
    python -m graphify hook install             # auto-rebuild on commit / branch switch

Optional, and machine-specific — do not commit these:

- `graphify claude install` writes PreToolUse hooks so Claude consults the graph
  automatically. It hardcodes an absolute interpreter path, so keep those hooks in
  `.claude/settings.local.json` (gitignored), not `.claude/settings.json`. It also
  wires the hooks to the `graphify` launcher; rewrite them to the `python -m graphify`
  form above.
- Community names (`Community 0`, `Community 12`, …) stay unlabeled unless an LLM API
  key is set. Everything works without one; with a key, `graphify label .` makes the
  report far more readable.

## SQL migrasi / perubahan tabel — tanpa MCP

SQL apa pun yang menyangkut migrasi atau perubahan tabel (DDL, fungsi, trigger,
RLS, cron, backfill) TIDAK dijalankan lewat MCP Supabase
(`apply_migration` / `execute_sql`). Tulis berkasnya di `multi-step-form/sql/`
lalu serahkan ke user untuk dijalankan sendiri di SQL Editor Supabase.

- Sertakan blok dry-run dan blok rollback di dalam berkas, seperti sql/94.
- MCP Supabase boleh dipakai untuk BACA saja (list_tables, get_advisors,
  query_logs, dan `execute_sql` yang murni SELECT).

## Deployment / release workflow

`git push` and deployment always run from `main` — never from a feature branch.

- When the user talks about deploying, that implies the next steps are: merge the
  current branch into `main`, then `git pull` from remote on `main` to catch any
  remote changes and confirm there's no conflict, before pushing.
- Do this merge/pull check every time deployment is discussed, even if it seems
  redundant — it's the guard against pushing a `main` that's diverged from remote.
