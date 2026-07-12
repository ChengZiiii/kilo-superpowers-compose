# kilo-superpowers-compose

[![npm version](https://img.shields.io/npm/v/kilo-superpowers-compose.svg)](https://www.npmjs.com/package/kilo-superpowers-compose)
[![license](https://img.shields.io/npm/l/kilo-superpowers-compose.svg)](./LICENSE)

> A Kilo Code / Kilo CLI plugin that packages the
> [obra/superpowers](https://github.com/obra/superpowers) development workflow
> into a single installable package, exposing a **`compose`** orchestrator agent
> that drives brainstorming → planning → subagent implementation → two-stage
> review → merge.

## Status

**v0.1.1.** Installed via the npm CLI and verified on both **Kilo CLI** and the
**VS Code Kilo Code** extension (they share the same config, so one install
covers both).

> **About the `plugin` field:** Kilo's `plugin: ["…"]` field in `kilo.jsonc`
> does **not** load npm-named plugins in current Kilo — adding it only slows
> startup. This package ships a plugin module (`plugin/index.js`) for the
> future, but **do not add it to the `plugin` field**. Use the npm CLI install
> below. See [docs/DESIGN.md §10 Q5](docs/DESIGN.md#10-open-questions--decisions-pending).

## What it is

`kilo-superpowers-compose` bundles 14 battle-tested Superpowers skills + 3
purpose-built agents + a `/superpowers` slash command into one npm package.
Run one install command and the skills link into `~/.kilo/skills/`, the agent
files copy into `~/.config/kilo/agent/`, the command into
`~/.config/kilo/commands/`, and `kilo.jsonc` gets the skill path registered.
Restart Kilo and a `compose` agent appears in the agent picker, ready to run
the full, disciplined Superpowers workflow on any coding task.

## Installation

```bash
npm install -g kilo-superpowers-compose
kilo-superpowers-compose install
```

Then restart Kilo. You'll see `compose` in `/agents` and `/superpowers` will
work. One install covers both Kilo CLI and the VS Code Kilo Code extension
(they share `~/.config/kilo/`).

### Kilo Marketplace (official channel — coming soon)

The Marketplace lets you install from the Kilo sidebar with no terminal. We're
preparing a contribution to
[`Kilo-Org/kilo-marketplace`](https://github.com/Kilo-Org/kilo-marketplace).
Until then, use the npm install above.

## What gets installed

- **14 skills** under the `superpowers` namespace, vendored verbatim from
  obra/superpowers `v6.1.1` (MIT): `using-superpowers`, `brainstorming`,
  `test-driven-development`, `systematic-debugging`,
  `verification-before-completion`, `writing-plans`, `executing-plans`,
  `subagent-driven-development`, `requesting-code-review`,
  `receiving-code-review`, `using-git-worktrees`,
  `finishing-a-development-branch`, `dispatching-parallel-agents`,
  `writing-skills`.
- **3 agents**: `compose` (primary orchestrator), `compose-dev` (TDD
  implementer subagent), `compose-review` (two-stage reviewer subagent). None
  pin a `model` — they use your global default model.
- **1 slash command**: `/superpowers` (routes to `compose`).

## Update & uninstall

```bash
# Update (re-runs install, idempotent)
kilo-superpowers-compose update

# Remove everything this package installed (manifest-based; never touches your own files)
kilo-superpowers-compose uninstall
```

After bumping the upstream package:

```bash
npm update -g kilo-superpowers-compose
kilo-superpowers-compose update
```

Uninstall removes: the skills link, the 3 agent files, the `superpowers.md`
command, the package's `skills.paths` entry in `kilo.jsonc`, and the install
manifest. Your own skills, agents, and config are left untouched.

## CLI usage

```text
kilo-superpowers-compose <command>

Commands:
  install     Install skills, agents, and the slash command (default)
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
| `KILO_SUPERPOWERS_PREFIX=1` | (reserved) prefix skill names; v0.1 isolates via the `superpowers` namespace instead |
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
- **Skill namespace**: the 14 skills live under `superpowers/`, so they won't
  collide with your own `~/.kilo/skills/<name>` skills — only an existing
  `superpowers` directory would conflict.
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
