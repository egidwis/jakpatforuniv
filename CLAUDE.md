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
