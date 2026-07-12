# Design Document

> Status: **Phase 2 — implementation in progress (locked design, doc amendments below)**
> Last updated: 2026-07-12

This document captures the architectural decisions for the
`kilo-superpowers-compose` plugin. Anything that is "decided" is marked
✅; anything still open is marked ❓.

---

## 1. Goals & non-goals

### Goals

- **One-line install**: `npm install -g kilo-superpowers-compose` and it
  works in both Kilo CLI and Kilo Code (VS Code extension).
- **Discoverable entry point**: After install, a `compose` agent appears in
  the Kilo agent picker. Users select it; they don't need to read docs.
- **Discipline over speed**: The orchestrator enforces brainstorming, TDD,
  systematic debugging, two-stage review — not as suggestions but as workflow
  gates.
- **Works on Windows, macOS, Linux**: No admin privileges required.
- **Updateable and removable**: Clean update via `npm update`, clean uninstall
  via `kilo-superpowers-compose uninstall`.

### Non-goals (Phase 1)

- ❌ Custom SKILL.md authoring (Phase 3, uses obra/superpowers verbatim)
- ❌ Visual companion (mimo-compose has a mockup browser feature we drop)
- ❌ Skill self-testing harness (mimo-compose has one we drop)
- ❌ Telemetry (explicitly opt-out by default)

---

## 2. High-level architecture

```
┌──────────────────────────────────────────────────────────────┐
│  npm registry                                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ kilo-superpowers-compose (npm pkg)                   │    │
│  │  ├─ package.json (main + kilo/opencode plugin hook)  │    │
│  │  ├─ plugin/index.js (Path B: config-hook module)     │    │
│  │  ├─ bin/install.js, uninstall.js, update.js          │    │
│  │  ├─ skills/  (14 SKILL.md folders from obra)         │    │
│  │  └─ agents/  (compose.md, compose-dev.md, ...)       │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
                           │
                           │  npm install -g
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  User machine                                                 │
│  ┌─ ~/.kilo/skills/superpowers → junction to pkg/skills      │
│  ├─ ~/.config/kilo/agent/compose.md ← copied                │
│  ├─ ~/.config/kilo/agent/compose-dev.md ← copied            │
│  ├─ ~/.config/kilo/agent/compose-review.md ← copied         │
│  └─ ~/.config/kilo/kilo.jsonc.skills.paths += pkg/skills    │
└──────────────────────────────────────────────────────────────┘
                           │
                           │  user runs `kilo`
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Kilo CLI / VS Code extension                                │
│  - scans skills/ → 14 skills load                            │
│  - scans agent/ → 3 agents register                          │
│  - user picks "compose" agent → Superpowers workflow active  │
└──────────────────────────────────────────────────────────────┘
```

**Key insight**: Kilo CLI and Kilo Code share `~/.config/kilo/` and
`~/.kilo/`, so one install target = both clients covered. Verified against
[kilocode.ai/docs/customize/skills](https://kilocode.ai/docs/customize/skills)
and [kilocode.ai/docs/code-with-ai/platforms/cli](https://kilocode.ai/docs/code-with-ai/platforms/cli).

---

## 3. Package layout

```
kilo-superpowers-compose/
├── package.json                 ✅ decided (files whitelist excludes docs/)
├── README.md                    ✅
├── LICENSE                      ✅ MIT
├── NOTICE                       ✅ upstream attribution (obra/superpowers @ v6.1.1)
├── bin/
│   ├── cli.js                   ✅ main entry (routes subcommands)
│   ├── install.js               ✅ see INSTALLER.md
│   ├── uninstall.js             ✅ manifest-based removal
│   └── update.js                ✅ re-runs install.js idempotently
├── skills/                      ✅ 14 SKILL.md folders (verbatim from obra/superpowers v6.1.1)
│   ├── using-superpowers/SKILL.md
│   ├── brainstorming/SKILL.md
│   ├── test-driven-development/SKILL.md
│   ├── systematic-debugging/SKILL.md
│   ├── verification-before-completion/SKILL.md
│   ├── writing-plans/SKILL.md
│   ├── executing-plans/SKILL.md
│   ├── subagent-driven-development/SKILL.md
│   ├── requesting-code-review/SKILL.md
│   ├── receiving-code-review/SKILL.md
│   ├── using-git-worktrees/SKILL.md
│   ├── finishing-a-development-branch/SKILL.md
│   ├── dispatching-parallel-agents/SKILL.md
│   └── writing-skills/SKILL.md
├── agents/                      ✅ 3 agent .md files (no model field)
│   ├── compose.md               # orchestrator (primary) — user picks this to enter the workflow
│   ├── compose-dev.md           # subagent for TDD implementation
│   └── compose-review.md        # subagent for 2-stage review
├── test/                        ✅ node:test, zero-dep (excluded from tarball via files)
├── docs/
│   ├── DESIGN.md                (this file)
│   ├── INSTALLER.md
│   ├── AGENTS.md
│   └── REFERENCES.md
└── package.json "files"         ✅ whitelist = ["bin","skills","agents"]
                                   (README + LICENSE included automatically by npm; docs/ excluded)
```

注：v0.1.x 早期版本曾在 `commands/superpowers.md` 注册一条 `/superpowers` 斜杠命令。
自 v0.1.3 起移除——参考 moyu-by/opencode-mimo-compose 的做法：用户通过在代理选择器
中选取 `compose` 代理直接进入工作流，不额外暴露斜杠命令。

---

## 4. Naming decisions (locked-in)

| Resource | Name | Rationale |
|---|---|---|
| npm package | `kilo-superpowers-compose` | Descriptive, searchable, unambiguous |
| bin CLI command | `kilo-superpowers-compose` | Matches package name (Kebab-case per npm convention) |
| Primary agent | `compose` | Matches mimo-compose convention; short, memorable |
| Subagent — implementer | `compose-dev` | Disambiguates role |
| Subagent — reviewer | `compose-review` | Disambiguates role |
| Skill folder | `superpowers` (linked as a unit) | Single junction point under `~/.kilo/skills/` |
| Individual skill names | **Verbatim from obra** (`brainstorming`, etc.) | ✅ resolved — taken verbatim from obra/superpowers @ `v6.1.1` (see §10 Q3) |

注：本包自 v0.1.3 起**不再注册任何斜杠命令**（早期版本曾注册 `/superpowers`，
现移除）。用户通过代理选择器中选取 `compose` 代理进入完整工作流，这与
mimo-compose 的做法一致，避免在用户命令面板中引入额外命令占用。

---

## 5. Installation mechanism

### 5.1 Two install paths, one package

**Path A — npm install (primary)**:

```bash
npm install -g kilo-superpowers-compose
kilo-superpowers-compose install
```

**Path B — Kilo/OpenCode plugin field (v0.1.1)**:

User adds to `kilo.jsonc`:

```jsonc
{
  "plugin": ["kilo-superpowers-compose"]
}
```

On startup, Kilo loads the package's `main` (`plugin/index.js`) and calls its
default-exported factory; the returned `config(config)` hook injects the 3
agents into the runtime config (`config.agent[name]`) and appends the package's
`skills/` dir to `config.skills.paths`. No `.md` files are written by the plugin
(agents live only in runtime config; user picks `compose` in the agent picker
to enter the workflow). Status: pending real-world verification (§10 Q5 decision gate).

### 5.2 Why both?

- Path A works regardless of Kilo plugin support — bulletproof.
- Path B feels native to Kilo/OpenCode users — premium UX.
- Cost: ~10 extra lines in `package.json` (`bin` field). Negligible.

### 5.3 Idempotency

`install.js` must be safely re-runnable. Behavior on re-install:

- Junction is removed and re-created (latest code wins).
- Agent `.md` files are overwritten (idempotent).
- `kilo.jsonc` is patched: if `skills.paths` entry already present, skip;
  otherwise append. No duplicates.

---

## 6. Why junction/symlink for skills?

We **don't copy** skill files. We **junction** (Windows) / **symlink** (Unix)
the entire `skills/` directory to `~/.kilo/skills/superpowers`.

Reasons:

1. **Updates propagate instantly.** `npm update -g` replaces the package
   files; the junction now points at the new content. No sync step needed.
2. **Single source of truth.** No risk of stale copies if someone manually
   edits files in `~/.kilo/skills/`.
3. **Smaller on disk.** No duplication.

Windows-specific:

```js
fs.symlinkSync(target, linkPath, 'junction');  // 'junction' = no admin needed
```

This is the same technique [opencode-mimo-compose uses](https://github.com/moyu-by/opencode-mimo-compose/blob/main/install.cjs).

---

## 7. Kilo configuration patching

We modify `~/.config/kilo/kilo.jsonc` to add the skills path:

```jsonc
{
  "skills": {
    "paths": [
      "C:\\Users\\Soren\\.config\\kilo\\kilo-superpowers-compose\\skills"
    ]
  }
}
```

**Why both junction AND `skills.paths`?**

- Junction → visible in `~/.kilo/skills/` directory listing, normal skill
  discovery path.
- `skills.paths` → belt-and-suspenders, in case Kilo ever deprecates the
  junction directory or the user's home layout differs.

The two should reference the **same on-disk path**, so updates affect both.

---

## 8. Cross-platform path handling

The installer must work on Windows, macOS, Linux. Key paths:

| Path | Windows | macOS / Linux |
|---|---|---|
| Config dir | `%USERPROFILE%\.config\kilo` | `~/.config/kilo` |
| Skills dir | `%USERPROFILE%\.kilo\skills` | `~/.kilo/skills` |
| Agents dir | `%USERPROFILE%\.config\kilo\agent` | `~/.config/kilo/agent` |

> 注：本包不再写入 `~/.config/kilo/commands/`（v0.1.3 起）。用户通过代理选择器
> 中的 `compose` 代理直接进入工作流。

Use Node's `path.join`, `os.homedir()`, and `path.delimiter`. No string
concatenation with backslashes.

---

## 9. Kilo agent frontmatter — what we know

Source: [kilocode.ai/docs/customize/custom-modes](https://kilocode.ai/docs/customize/custom-modes)

```markdown
---
description: "Shown in agent picker; used by orchestrator for delegation"
mode: primary | subagent | all        # required
color: "#8B5CF6"                       # hex or theme keyword
prompt: "Markdown body becomes system prompt"
permission:                           # optional
  edit:
    "*.md": "allow"
    "*": "deny"
  bash: ask
steps: 100                            # max agentic iterations
temperature: 0.2
---
```

For subagents, `mode: subagent` is critical — they don't appear in the
agent picker, only callable via the `task` tool.

> **`model` field decision (Phase 0 amendment):** we do **NOT** set `model`
> on any of the three agents. They fall back to the user's global default
> model, so the package never pins a provider/model that may be unavailable
> on a given Kilo install. The `model:` lines present in earlier drafts of
> `docs/AGENTS.md` have been removed.

---

## 10. Open questions / decisions pending

### ❓ Q1: Skill name collision strategy

obra/superpowers uses bare names (`brainstorming`, `tdd`, etc.). mimo-compose
also uses bare names. If a user already has `~/.kilo/skills/brainstorming`,
ours will collide.

Options:
- (a) **Verbatim** (current default) — simple, matches upstream, risk of collision
- (b) **Prefix all with `superpowers-`** — safe but verbose
- (c) **Namespaced under `superpowers/` folder** — discoverable but ugly in picker

**Recommendation**: start with (a); provide an env var
`KILO_SUPERPOWERS_PREFIX=1` for users who hit collisions. Iterate based on
field reports.

### ❓ Q2: Should we run `postinstall` automatically?

If `postinstall` in `package.json` runs `bin/install.js` automatically, the
UX is better but:

- Surprises users who didn't expect their `kilo.jsonc` to be modified
- Cross-platform npm script quirks

**Recommendation**: NO auto-postinstall. Make install explicit
(`kilo-superpowers-compose install`). Document the trade-off in README.

### ✅ Q3: Pin to specific obra/superpowers version?  (resolved — locked `v6.1.1`)

obra/superpowers evolves. Breaking changes to skill content could break us.

**Decision:** pinned to tag **`v6.1.1`** (commit `d884ae04edebef577e82ff7c4e143debd0bbec99`).
Skills are vendored (copied into the repo, not a submodule), so the repo
holds a frozen snapshot. `NOTICE` records the tag, commit, source URL, and
MIT license. To upgrade: re-vendor `skills/` from a newer tag deliberately
and update `NOTICE`. The 14 skills at this tag are enumerated in §3.

### ✅ Q4: License attribution  (resolved — MIT)

obra/superpowers skills are MIT. We keep attribution: each vendored
`SKILL.md` (and sibling files) retains its original content verbatim, and
`NOTICE` records the upstream source/tag/license. **This package itself is
licensed MIT** (see root `LICENSE`).

---

## 11. Phase roadmap

| Phase | Goal | Time | Done when |
|---|---|---|---|
| **P1 — Design** | Lock in all decisions in this doc | now → lock | This doc reviewed and approved |
| **P2 — Minimal runnable** | npm package installs and `compose` agent appears in Kilo | 1-2 days | `npm install -g && install` works locally |
| **P3 — Dual-protocol verify** | Path B (`plugin` field) tested; **does not work** in current Kilo | 0.5 day | See §10 Q5: `plugin` field is a no-op; Path A (npm CLI) is the only method |
| **P4 — Polish** | uninstall/update scripts, README, demo | 1 week | Uninstall is clean; update preserves user config; README has screenshots |
| **P5 — Distribute** | Publish to npm public, submit to kilo-marketplace | 1 day | Package on npm; PR open against kilo-marketplace |

### ✅ Q5: Path B (`plugin` field) — tested 2026-07, **does not work in current Kilo; Path A is the only method**

Real-world testing on Kilo CLI + VS Code Kilo Code (Kilo's `@kilocode/plugin`
v7.4.5) produced a definitive, counterintuitive result:

**The `plugin: ["kilo-superpowers-compose"]` field does NOT load npm-named
plugins.** With the package present in Kilo's own `~/.config/kilo/node_modules`,
adding it to the `plugin` field: ① never imported the module (no load
observable), ② when the package was absent, sent Kilo to the npm registry on
every startup (slow startup, mirrored registry), ③ never surfaced the `compose`
agent. The field is effectively a no-op for plugin loading in this Kilo and
should not be used.

**What DOES work — the glob loader (not shipped):** Kilo loads plugins from the
glob `~/.config/kilo/plugin/*.{js,ts}`. A loader file there that re-exports the
package's factory is imported, its `server()` is called, and its `config(cfg)`
hook runs — and `cfg` at runtime **does** contain `agent`, `skills.paths`, and
`command`. Verified end-to-end: a glob loader injected `compose`/`compose-dev`/
`compose-review` into `cfg.agent` and `compose` appeared in `/agents`. So the
plugin `config`-hook contract itself is correct; only the `plugin`-field
*discovery* mechanism is dead.

**Decision (v0.1.1):** Ship **Path A (npm CLI) as the only supported install
method.** The glob-loader path works technically but is more complex than the
file-based Path A, leans on an undocumented glob behavior, and its only
advantage (skip re-running `install` on update) is marginal — not worth a
second user-facing method. `plugin/index.js` is kept in the package (dormant,
zero-dep, fully `try/catch`-wrapped) so it can be enabled the moment Kilo
properly loads npm-named plugins via the `plugin` field or stabilizes the glob
loader. README explicitly warns **not** to add the package to the `plugin`
field.

To revisit later: re-test on a newer Kilo build whether `plugin:["name"]`
resolves; if yes, the existing `plugin/index.js` + `main`/`exports`/markers
light up with no code change.

---

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Kilo CLI `plugin` field not honored | Medium | Path B's agents don't appear; Path A still works | **v0.1.1** ships a defensive `plugin/index.js` (full try/catch, can't crash startup). Path A remains the verified path until the S1.5/S1.6 decision gate confirms Path B (see §10 Q5). |
| Skill content evolves in obra, breaks our agent prompts | Medium | Orchestrator gets confused | Pin version; review upstream changes before bumping |
| Windows junction creation fails (rare edge cases) | Low | Skills don't load | Fall back to recursive copy with de-dup check |
| `kilo.jsonc` corruption if user has weird custom format | Low | Kilo won't start | Backup `kilo.jsonc` before patching; restore on parse failure |
| Naming collision with existing user skills | Medium | Some skills hidden | Document the `KILO_SUPERPOWERS_PREFIX` escape hatch |