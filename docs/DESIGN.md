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
│  │  ├─ package.json (with opencode plugin hook)         │    │
│  │  ├─ bin/install.js, uninstall.js, update.js          │    │
│  │  ├─ skills/  (14 SKILL.md folders from obra)         │    │
│  │  ├─ agents/  (compose.md, compose-dev.md, ...)       │    │
│  │  └─ commands/ (superpowers.md)                       │    │
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
│  ├─ ~/.config/kilo/commands/superpowers.md ← copied         │
│  └─ ~/.config/kilo/kilo.jsonc.skills.paths += pkg/skills    │
└──────────────────────────────────────────────────────────────┘
                          │
                          │  user runs `kilo`
                          ▼
┌──────────────────────────────────────────────────────────────┐
│  Kilo CLI / VS Code extension                                │
│  - scans skills/ → 14 skills load                            │
│  - scans agent/ → 3 agents register                          │
│  - reads commands/ → /superpowers appears                    │
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
│   ├── compose.md               # orchestrator (primary)
│   ├── compose-dev.md           # subagent for TDD implementation
│   └── compose-review.md        # subagent for 2-stage review
├── commands/
│   └── superpowers.md           ✅ /superpowers slash command (routes to compose)
├── test/                        ✅ node:test, zero-dep (excluded from tarball via files)
├── docs/
│   ├── DESIGN.md                (this file)
│   ├── INSTALLER.md
│   ├── AGENTS.md
│   └── REFERENCES.md
└── package.json "files"         ✅ whitelist = ["bin","skills","agents","commands"]
                                   (README + LICENSE included automatically by npm; docs/ excluded)
```

---

## 4. Naming decisions (locked-in)

| Resource | Name | Rationale |
|---|---|---|
| npm package | `kilo-superpowers-compose` | Descriptive, searchable, unambiguous |
| bin CLI command | `kilo-superpowers-compose` | Matches package name (Kebab-case per npm convention) |
| Primary agent | `compose` | Matches mimo-compose convention; short, memorable |
| Subagent — implementer | `compose-dev` | Disambiguates role |
| Subagent — reviewer | `compose-review` | Disambiguates role |
| Slash command | `superpowers` | Different from agent name; evokes the underlying framework |
| Skill folder | `superpowers` (linked as a unit) | Single junction point under `~/.kilo/skills/` |
| Individual skill names | **Verbatim from obra** (`brainstorming`, etc.) | ✅ resolved — taken verbatim from obra/superpowers @ `v6.1.1` (see §10 Q3) |

---

## 5. Installation mechanism

### 5.1 Two install paths, one package

**Path A — npm install (primary)**:

```bash
npm install -g kilo-superpowers-compose
kilo-superpowers-compose install
```

**Path B — Kilo/OpenCode plugin field (also works)**:

User adds to `kilo.jsonc` (or `opencode.json`):

```jsonc
{
  "plugin": ["kilo-superpowers-compose"]
}
```

CLI on startup detects the plugin in the `plugin` array and triggers install.
(Falls back to Path A if Kilo doesn't auto-install.)

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
| Commands dir | `%USERPROFILE%\.config\kilo\commands` | `~/.config/kilo/commands` |

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
| **P3 — Dual-protocol verify** | Path B (`plugin` field) also works | 0.5 day | Both install paths produce identical end state |
| **P4 — Polish** | uninstall/update scripts, README, demo | 1 week | Uninstall is clean; update preserves user config; README has screenshots |
| **P5 — Distribute** | Publish to npm public, submit to kilo-marketplace | 1 day | Package on npm; PR open against kilo-marketplace |

### ✅ Q5: Path B (`plugin` field) — researched, deferred to post-v0.1

The `plugin: string[]` field in `kilo.jsonc` loads `{plugin,plugins}/*.{ts,js}`
modules from the named package. Research against the upstream OpenCode plugin
interface (obra/superpowers `.opencode/plugins/superpowers.js`) shows the
likely contract: export a factory returning a `config(config)` hook that
mutates the live config (e.g. inject `skills.paths`). **However:**

- That hook registers **skills only** — it cannot place agent `.md` /
  command `.md` files on disk, so it alone cannot reproduce Path A's end
  state (the `compose` agent + `/superpowers` command).
- The hook is `experimental.*` in OpenCode and the Kilo-specific loading
  semantics are not documented in the Kilo config reference; a speculative
  plugin module could break Kilo startup if the interface diverged.

**Decision (v0.1.0):** Path A (explicit `kilo-superpowers-compose install`)
is the only supported install path. Path B is **deferred / experimental**.
The official Kilo distribution path is the **Marketplace** (copies agents to
`~/.config/kilo/agents/` and skills to `~/.config/kilo/skills/`), targeted in
P5. Future work: verify Kilo's plugin hook contract against the kilocode
source, then ship `plugin/superpowers-compose.js` reusing the obra `config`
hook pattern.

---

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Kilo CLI `plugin` field not honored | Medium | Path B breaks; Path A still works | **Path A is the only supported path in v0.1** (see §10 Q5). Path B deferred. Marketplace is the official distribution channel (P5). |
| Skill content evolves in obra, breaks our agent prompts | Medium | Orchestrator gets confused | Pin version; review upstream changes before bumping |
| Windows junction creation fails (rare edge cases) | Low | Skills don't load | Fall back to recursive copy with de-dup check |
| `kilo.jsonc` corruption if user has weird custom format | Low | Kilo won't start | Backup `kilo.jsonc` before patching; restore on parse failure |
| Naming collision with existing user skills | Medium | Some skills hidden | Document the `KILO_SUPERPOWERS_PREFIX` escape hatch |