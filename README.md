# kilo-superpowers-compose

[![npm version](https://img.shields.io/npm/v/kilo-superpowers-compose.svg)](https://www.npmjs.com/package/kilo-superpowers-compose)
[![license](https://img.shields.io/npm/l/kilo-superpowers-compose.svg)](./LICENSE)

> A Kilo Code / Kilo CLI plugin that packages the
> [obra/superpowers](https://github.com/obra/superpowers) development workflow
> into a single installable package, exposing a **`compose`** orchestrator agent
> that drives brainstorming → planning → subagent implementation → two-stage
> review → merge.

## Status

**v0.2.0.** Released with the `compose-` skill namespace, junction renamed
to match, and a global `permission.skill["compose-*"]="deny"` that hides
compose skills from Kilo's built-in agents (override-allowed in the
`compose*` agent frontmatter). Installed via the npm CLI and verified on
both **Kilo CLI** and the **VS Code Kilo Code** extension (they share the
same config, so one install covers both).

> **About the `plugin` field:** Kilo's `plugin: ["…"]` field in `kilo.jsonc`
> does **not** load npm-named plugins in current Kilo — adding it only slows
> startup. This package ships a plugin module (`plugin/index.js`) for the
> future, but **do not add it to the `plugin` field**. Use the npm CLI install
> below. See [docs/DESIGN.md §10 Q5](docs/DESIGN.md#10-open-questions--decisions-pending).

## What it is

`kilo-superpowers-compose` bundles 14 battle-tested Superpowers skills + 3
purpose-built agents into one npm package.
Run one install command and the skills link into `~/.kilo/skills/`, the agent
files copy into `~/.config/kilo/agent/`, and `kilo.jsonc` gets the skill path
registered. Restart Kilo and a `compose` agent appears in the agent picker.
Pick `compose` and the full, disciplined Superpowers workflow runs on any
coding task — no extra slash command required (this matches the mimo-compose
convention).

## Installation

> ⚠ **Two steps required.** Running only step ① (`npm install -g`) does
> nothing visible — it only installs the CLI binary, not the agent files,
> the skills link, or `kilo.jsonc`. Skipping step ② is the most common
> mistake.

**Step ① — Install the CLI**:

```bash
npm install -g kilo-superpowers-compose
```

Only installs the CLI binary (the `kilo-superpowers-compose` command
itself); does not touch your config directory.

**Step ② — Install into Kilo**:

```bash
kilo-superpowers-compose install
```

Copies the 3 agent files to `~/.config/kilo/agent/`, creates the skills
junction at `~/.kilo/skills/compose`, patches `kilo.jsonc` to add a
`skills.paths` entry and set a global `permission.skill["compose-*:deny"]`
(so built-in agents can't see or invoke compose skills; the three
`compose*` agents' frontmatter overrides this to `allow`). **Idempotent**:
safe to re-run.

**Step ③ — Restart Kilo** (fully quit and reopen the CLI; **Reload Window**
in VS Code).

After this, `compose` appears in the agent picker — pick it to enter the
Superpowers workflow. One install covers both Kilo CLI and the VS Code
Kilo Code extension (they share `~/.config/kilo/`).

### Kilo Marketplace (official channel — coming soon)

The Marketplace lets you install from the Kilo sidebar with no terminal. We're
preparing a contribution to
[`Kilo-Org/kilo-marketplace`](https://github.com/Kilo-Org/kilo-marketplace).
Until then, use the npm install above.

## What gets installed

- **14 skills**, each prefixed `compose-` (e.g. `compose-brainstorming`),
  vendored from obra/superpowers `v6.1.1` (MIT). Folder names are
  kept verbatim (`brainstorming/`, `using-superpowers/`, …); the
  `compose-` prefix lives in each SKILL.md's frontmatter `name:` field.
  Full list: `compose-using-superpowers`, `compose-brainstorming`,
  `compose-test-driven-development`, `compose-systematic-debugging`,
  `compose-verification-before-completion`, `compose-writing-plans`,
  `compose-executing-plans`, `compose-subagent-driven-development`,
  `compose-requesting-code-review`, `compose-receiving-code-review`,
  `compose-using-git-worktrees`,
  `compose-finishing-a-development-branch`,
  `compose-dispatching-parallel-agents`, `compose-writing-skills`.
- **3 agents**: `compose` (primary orchestrator), `compose-dev` (TDD
  implementer subagent), `compose-review` (two-stage reviewer subagent). None
  pin a `model` — they use your global default model. Pick `compose` in the
  agent picker to enter the Superpowers workflow.

> v0.1.x 早期版本同时注册了 `/superpowers` 斜杠命令；自 v0.1.3 起移除以与
> mimo-compose 保持一致——选 `compose` 代理即可触发完整工作流，不再占用命令面板。
> **从老版本升级到 v0.1.3+：** 若你的 `~/.config/kilo/commands/superpowers.md`
> 仍是 v0.1.2 之前留下的副本，运行 `kilo-superpowers-compose uninstall`（再 install
> 也可）会顺手清掉它。如果还想自己手动清：
>
> ```powershell
> Remove-Item -Force "$env:USERPROFILE\.config\kilo\commands\superpowers.md"
> ```

## Update & uninstall

> **Update is also two steps.** `npm update -g` upgrades the package
> itself; the `update` subcommand re-syncs the artifacts to Kilo's config.
> Running only step ① won't update your agents / skills link.

**Update** (two steps, after a new version is published):

```bash
npm update -g kilo-superpowers-compose   # ① upgrade the package
kilo-superpowers-compose update         # ② re-sync artifacts to Kilo (idempotent)
```

You can also just re-run `kilo-superpowers-compose update` (without
`npm update`) — it refreshes artifacts using the current global package
version, but won't pull a newer version.

**Uninstall** (removes everything this package installed, manifest-based;
never touches your own files):

```bash
kilo-superpowers-compose uninstall       # remove artifacts
npm uninstall -g kilo-superpowers-compose  # remove the CLI itself
```

Uninstall removes: the skills link, the 3 agent files, this package's
`skills.paths` entry in `kilo.jsonc`, and the install manifest. Your own
skills, agents, and config are left untouched.

## Common mistakes

**"I ran `npm install -g` but the agent picker doesn't show `compose`."**
— You only ran step ①. The CLI is installed, but no agent files or skills
link were created. Run `kilo-superpowers-compose install`.

**"I changed package code after install; restarting Kilo doesn't pick it up."**
— `~/.kilo/skills/compose` is a junction pointing to the package
directory, so package upgrades are picked up automatically. But
agent files were copied at install time and don't auto-update. Run
`kilo-superpowers-compose update`.

**"I added `plugin: ['kilo-superpowers-compose']` to `kilo.jsonc`."**
— Remove it. Current Kilo doesn't load this field; it only slows startup.
This package installs via the npm CLI — no `plugin` field needed.

## CLI usage

```text
kilo-superpowers-compose <command>

Commands:
  install     Install skills and agents (default)
  uninstall   Remove everything this package installed (manifest-based)
  update      Re-run install (idempotent)

Options:
  -v, --version    Show version
  -h, --help       Show help
```

### Environment variables

| Variable | Purpose |
|---|---|
| `KILO_HOME=<path>` | Override user home (for testing / isolated configs) |
| `KILO_SUPERPOWERS_PREFIX=1` | _unused since v0.2.0_ — all 14 skills are intrinsically `compose-` prefixed; the env var is ignored |
| `KILO_SUPERPOWERS_DRY_RUN=1` | Print intended actions without modifying anything |
| `KILO_SUPERPOWERS_VERBOSE=1` | Verbose logging (to stderr) |

### Exit codes

`0` success · `1` generic error · `2` `kilo.jsonc` parse error (restored from
backup) · `3` target dir not writable · `4` skills link creation failed.

> **`kilo.jsonc` comments**: the installer strips only `//` line comments;
> **block comments `/* */` are not handled**. If your `kilo.jsonc` has block
> comments and fails to parse, the installer restores from the auto-backup and
> exits with code `2`. Writing back loses comments (accepted trade-off).

## Notes

- **Same-name agent**: if you already have an agent named `compose`, installing
  overwrites it (accepted for v0.1).
- **Skill namespace & isolation**: all 14 skills are intrinsically prefixed
  `compose-` (e.g. `compose-brainstorming`). On install, a global
  `permission.skill["compose-*"]="deny"` is written into `kilo.jsonc`, so
  Kilo's built-in agents (code / plan / debug / ask / explore / general)
  cannot see or invoke them. Each of the three shipped agents (`compose`,
  `compose-dev`, `compose-review`) declares the override `allow` in its
  frontmatter, which Kilo's `findLast`-based `Permission.evaluate`
  honours. Folder names under `skills/` remain verbatim from upstream
  (`brainstorming/`, `using-superpowers/`, …).
- **Windows links**: skills are linked via a directory junction (no admin
  rights needed); on rare failure it falls back to a recursive copy.
- **No auto-`postinstall`**: install is explicit, so your `kilo.jsonc` is never
  modified without you running the command.

## Development & testing

```bash
node --test     # zero-dependency tests (installer logic + plugin module + install/uninstall round-trip)
npm pack        # inspect the published tarball
```

## Documentation

- [docs/DESIGN.md](docs/DESIGN.md) — architecture, naming, layout, decisions, risks
- [docs/INSTALLER.md](docs/INSTALLER.md) — `bin/` installer spec and source
- [docs/AGENTS.md](docs/AGENTS.md) — the three agents (frontmatter + prompts)
- [docs/REFERENCES.md](docs/REFERENCES.md) — all reference links
- [NOTICE](NOTICE) — upstream obra/superpowers attribution (tag `v6.1.1`, MIT)

## Inspiration

This project ports/adapts
[moyu-by/opencode-mimo-compose](https://github.com/moyu-by/opencode-mimo-compose)
(which did the same for OpenCode). We: re-target it at Kilo (a Kilo is an
OpenCode fork — high overlap); swap the skill source to
[obra/superpowers](https://github.com/obra/superpowers) (MIT); and tighten the
orchestrator into a pure-routing role (it never writes code itself) with a
strict two-stage review subagent.

## License

MIT — see [LICENSE](LICENSE). The 14 vendored skills are from
obra/superpowers (MIT, © Jesse Vincent), kept verbatim; attribution in
[NOTICE](NOTICE).
