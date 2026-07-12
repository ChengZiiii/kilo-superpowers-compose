# AGENTS.md

供在本仓库中工作的 AI 代理（如 Kilo 会话）参考的指南。请先阅读本文件。

## 工作语言

**本项目为中文开发环境。** 代理与用户的交流、提交信息（commit message）、
代码注释、新增文档默认使用简体中文。原有的英文文档（`README.md` 与 `docs/`）
当前作为锁定的设计事实来源保留，如需统一翻译为中文请单独提出。

## 仓库现状 —— 动手前必读

本仓库处于**已实现 / 待发布**阶段（DESIGN.md 的 P2–P5）。当前已有：
`package.json`、`bin/`（安装器）、`skills/`（14 个内嵌技能）、`agents/`（3 个代理）、
`commands/`（`/superpowers`）、`test/`（node:test 零依赖测试）、`LICENSE`、`NOTICE`，
以及锁定设计的 `docs/`。

- **运行测试**：`node --test`（零依赖，使用临时 `KILO_HOME`，不触碰真实配置）。
- **检视发布包**：`npm pack`。
- **本地试装**：用隔离 `KILO_HOME`，例如
  `$env:KILO_HOME="<临时目录>"; node bin/cli.js install`。
- **不要**直接对真实 `~/.config/kilo/kilo.jsonc` 执行安装，除非用户明确要求。

实现仍以 `docs/DESIGN.md` 为锁定的事实来源；架构变更须同步 `docs/`。

## 关键命名坑：存在两份不同的 `AGENTS.md`

- **`docs/AGENTS.md`** —— 一份*产品规格说明*，定义将在第二阶段交付的三个 Kilo
  代理提示词文件（`compose.md`、`compose-dev.md`、`compose-review.md`）。
  它**不是**给代理的指令。
- **`/AGENTS.md`**（本文件）—— 给在本仓库中工作的 AI 代理的指令。

不要把两者混为一谈去编辑。

## 事实来源

`docs/` 存放已锁定的设计；请将其视为权威，并在架构变更时保持同步：

| 文档 | 覆盖内容 |
|---|---|
| `docs/DESIGN.md` | 架构、包布局、命名、安装机制、待定问题、路线图、风险 |
| `docs/INSTALLER.md` | `bin/install.js`、`uninstall.js`、`update.js`、`cli.js` 的完整规格与源码 |
| `docs/AGENTS.md` | 三个代理的 frontmatter 与系统提示词（产品规格，非指令） |
| `docs/REFERENCES.md` | 所有上游 / 依赖链接 |

若你更改了某个已锁定的决策（命名、安装路径、代理角色），请同步更新
`docs/DESIGN.md`。

## 本项目是什么

一个 Kilo 插件包（`kilo-superpowers-compose`，npm），打包来自
[obra/superpowers](https://github.com/obra/superpowers) 的 14 个技能，外加 3
个代理（`compose` 编排器、`compose-dev` 实现者、`compose-review` 评审者）以及一个
`/superpowers` 斜杠命令。一次安装 → Kilo 代理选择器中出现 `compose` 代理，驱动完整的
Superpowers 工作流。外形与命名借鉴自
[moyu-by/opencode-mimo-compose](https://github.com/moyu-by/opencode-mimo-compose)。

## 实现的硬性约束（已决定 —— 不要随意更改）

- **技能原样内嵌自 obra/superpowers（MIT 许可）。** 每个 `SKILL.md` 都要保留原始
  版权 / 署名头。锁定到 obra/superpowers `v6.1.1`，并谨慎升级（DESIGN.md §10 Q3）。
  本包自身为 MIT 许可（见 `LICENSE` 与 `NOTICE`）。
- **安装时不复制技能 —— 而是建立 junction**
  （Windows 用 `fs.symlinkSync(src, dst, 'junction')`；Unix 用默认符号链接），
  这样 `npm update` 能即时生效。Windows 的 junction 无需管理员权限。
- **安装器：零第三方依赖、Node ≥ 18、ESM。** 只使用 `node:fs` / `node:path` /
  `node:os`。JSONC 注释用仓库内的启发式方法剥离后再 `JSON.parse`；写回时会丢失注释 ——
  这是被接受的取舍（INSTALLER.md §2.2 第 7 步）。
- **跨平台路径：绝不拼接反斜杠。** 一律使用 `path.join` + `os.homedir()` /
  `process.env.KILO_HOME`。目标目录因操作系统而异（DESIGN.md §8）。
- **不自动运行 `postinstall`。** 安装是显式的（`kilo-superpowers-compose install`）。
  DESIGN.md §10 Q2。
- **打补丁前必须备份 `kilo.jsonc`**，并在解析失败时恢复（退出码 2）。INSTALLER.md §2.3。
- **安装是幂等的** —— 重新运行会替换 junction、覆盖 agent / command 的 `.md`、
  绝不重复添加 `skills.paths` 条目。`update.js` 只是重新运行安装。

## 已锁定的命名

| 对象 | 名称 |
|---|---|
| npm 包 / CLI 可执行 | `kilo-superpowers-compose` |
| 主代理 | `compose`（`mode: primary`） |
| 子代理 —— 实现者 | `compose-dev`（`mode: subagent`） |
| 子代理 —— 评审者 | `compose-review`（`mode: subagent`） |
| 斜杠命令 | `/superpowers` |
| 安装的技能目录 | `superpowers`（单个 junction） |

安装器环境变量：`KILO_HOME`、`KILO_SUPERPOWERS_PREFIX=1`（给技能名加前缀以避免冲突）、
`KILO_SUPERPOWERS_DRY_RUN=1`、`KILO_SUPERPOWERS_VERBOSE=1`。退出码 0–4
（INSTALLER.md §2.3）。

## 随包交付的三个代理（完整提示词见 `docs/AGENTS.md`）

- `compose` —— **纯路由器；自己从不写代码。** 对任务分类（简单 / 复杂 / bug），选择技能链，
  分派 `compose-dev` / `compose-review`。强制第一步：加载 `using-superpowers` 技能。
- `compose-dev` —— 通过严格的 TDD 红-绿-重构执行单个任务；将架构决策回传给 `compose`。
- `compose-review` —— 两阶段评审（第一阶段规格符合度，第二阶段代码质量）；仅汇报发现，绝不改代码。

## Kilo 架构说明

面向**当前 Kilo 架构**（`~/.config/kilo/`、`~/.kilo/`、`.kilo/`）。较旧的
`jinmin88/kilo-superpowers` 项目使用的是**已废弃的 1.0 之前版本 `.kilocode/` 架构**——
仅作为历史参考引用，不要从中复制。Kilo CLI 与 VS Code 扩展共享相同的配置目录，
因此一次安装目标即可同时覆盖两者。
