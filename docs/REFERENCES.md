# References

> All links referenced in DESIGN.md, INSTALLER.md, and AGENTS.md.
> Sorted by category. Verified reachable as of 2026-07-12.

---

## Primary upstream — skills source

| Resource | URL |
|---|---|
| obra/superpowers repo (253k ★) | <https://github.com/obra/superpowers> |
| obra/superpowers skills directory | <https://github.com/obra/superpowers/tree/main/skills> |
| obra/superpowers OpenCode install guide | <https://github.com/obra/superpowers/blob/main/.opencode/INSTALL.md> |
| obra/superpowers basic workflow overview | <https://github.com/obra/superpowers#the-basic-workflow> |

We copy these `skills/*/SKILL.md` files verbatim in Phase 2.

---

## Inspiration — direct port target

| Resource | URL |
|---|---|
| moyu-by/opencode-mimo-compose repo | <https://github.com/moyu-by/opencode-mimo-compose> |
| mimo-compose skills directory | <https://github.com/moyu-by/opencode-mimo-compose/tree/main/skills> |
| mimo-compose agents directory | <https://github.com/moyu-by/opencode-mimo-compose/tree/main/agents> |
| mimo-compose install.cjs (reference impl) | <https://github.com/moyu-by/opencode-mimo-compose/blob/main/install.cjs> |

The shape, naming convention, and junction-based install technique are
borrowed from this project. We swap the skill source from MiMoCode's
compose → obra/superpowers, and tighten the orchestrator design.

---

## Kilo Code — official docs

| Doc | URL |
|---|---|
| Custom Modes (agents) | <https://kilocode.ai/docs/customize/custom-modes> |
| Custom Rules | <https://kilocode.ai/docs/customize/custom-rules> |
| Custom Instructions / AGENTS.md | <https://kilocode.ai/docs/customize/custom-instructions> |
| Skills | <https://kilocode.ai/docs/customize/skills> |
| Workflows / slash commands | <https://kilocode.ai/docs/customize/workflows> |
| AGENTS.md (legacy) | <https://kilocode.ai/docs/customize/agents-md> |
| Custom Subagents | <https://kilocode.ai/docs/customize/custom-subagents> |
| Agent Permissions | <https://kilocode.ai/docs/customize/agent-permissions> |
| Kilo CLI overview | <https://kilocode.ai/docs/code-with-ai/platforms/cli> |
| VS Code extension overview | <https://kilocode.ai/docs/code-with-ai/platforms/vscode> |
| Kilo Marketplace | <https://kilocode.ai/docs/customize/marketplace> |

---

## Kilo — code, registry, marketplace

| Resource | URL |
|---|---|
| Kilo main repo (Kilo-Org/kilocode) | <https://github.com/Kilo-Org/kilocode> |
| Kilo Marketplace (community skills/agents) | <https://github.com/Kilo-Org/kilo-marketplace> |
| Kilo CLI npm package | <https://www.npmjs.com/package/@kilocode/cli> |
| Kilo website | <https://kilocode.ai> |

---

## Upstream dependencies

| Resource | URL |
|---|---|
| OpenCode (Kilo CLI's upstream) | <https://opencode.ai> |
| OpenCode config docs | <https://opencode.ai/docs/config> |
| Agent Skills specification | <https://agentskills.io/home> |
| Agent Skills spec (full) | <https://agentskills.io/specification> |

---

## Related Kilo plugins / community work

| Resource | URL |
|---|---|
| kilo-superpowers (older, uses deprecated `.kilocode/` schema) | <https://github.com/jinmin88/kilo-superpowers> |

This older project uses the pre-1.0 Kilo schema and won't work with the
current `.kilo/` / `.config/kilo/` structure. We mention it for historical
context only.

---

## OpenCode / plugin model references

| Resource | URL |
|---|---|
| OpenCode plugin system (how mimo-compose hooks in) | <https://github.com/obra/superpowers/blob/main/.opencode/INSTALL.md> |
| `kilo plugin <module>` CLI command | <https://kilocode.ai/docs/code-with-ai/platforms/cli#getting-started> |

---

## Original conversation log

This project was conceived during a chat session with Kilo CLI on
2026-07-12. The conversation traced:

1. Inspection of the now-stale `jinmin88/kilo-superpowers` repo
2. Discovery that Kilo CLI is an OpenCode fork sharing config with the VS
   Code extension
3. Discovery of `obra/superpowers` (253k ★) and its OpenCode support
4. Discovery of `moyu-by/opencode-mimo-compose` as a directly comparable
   port
5. Design decisions: pure orchestrator, verbatim skill sourcing, dual
   install protocol, zero dependencies

---

## License notes

- **obra/superpowers**: MIT
- **moyu-by/opencode-mimo-compose**: MIT
- **Kilo Code**: Apache-2.0 (the marketplace repo)
- **Our package (target)**: MIT

Attribution to obra/superpowers must remain in every `SKILL.md` we vendor.