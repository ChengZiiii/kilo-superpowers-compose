# kilo-superpowers-compose

> 一个 Kilo Code / Kilo CLI 插件，将 [obra/superpowers](https://github.com/obra/superpowers)
> 开发工作流打包为单个可安装的 npm 包，对外暴露一个 `compose` 编排器代理，驱动
> 头脑风暴 → 规划 → 子代理实现 → 两阶段评审 → 合并的完整流程。

## 状态

**v0.1.0 —— 可用。** 已实现安装器、14 个内嵌技能、3 个代理、`/superpowers` 命令，
并通过自动化测试与隔离环境往返验证。详见 [更新日志](#更新日志)。

## 这个项目做什么（一段话）

它把 14 个久经考验的 Superpowers 技能 + 3 个专门构建的代理打包成一个名为
`kilo-superpowers-compose` 的 npm 包。运行一条安装命令后，本包会把技能链接到
`~/.kilo/skills/`，把代理的 `.md` 文件复制到 `~/.config/kilo/agent/`，把
`/superpowers` 命令复制到 `~/.config/kilo/commands/`，并在 `kilo.jsonc` 中注册技能
路径。重启 Kilo CLI 或 VS Code 扩展后，用户即可在代理选择器中看到一个 `compose`
代理，对任意编码任务运行完整的、有纪律的 Superpowers 工作流。

## 安装

### 方式 A：npm + 显式安装（推荐，已验证）

```bash
npm install -g kilo-superpowers-compose
kilo-superpowers-compose install
```

安装完成后重启 Kilo，即可在代理选择器（`/agents`）中看到 `compose`，并使用
`/superpowers` 斜杠命令。

### 方式 B：Kilo `plugin` 字段（实验性 / 暂缓）

理论上可在 `kilo.jsonc` 中加入 `"plugin": ["kilo-superpowers-compose"]` 让 Kilo 在
启动时加载本包。但 Kilo 的插件钩子接口尚未稳定文档化，且该机制只能注册技能、无法
放置代理 / 命令文件，因此 **v0.1 暂不支持**。请使用方式 A。详见
[docs/DESIGN.md §10 Q5](docs/DESIGN.md)。

> 提示：Kilo 官方的分发渠道是 **Marketplace**（把代理复制到 `~/.config/kilo/agents/`、
> 技能复制到 `~/.config/kilo/skills/`）。后续版本会提交到 [kilo-marketplace](https://github.com/Kilo-Org/kilo-marketplace)。

## 安装了什么

- `superpowers` 技能目录下的 **14 个技能**（来自 obra/superpowers `v6.1.1`，逐字内嵌）：
  `using-superpowers`、`brainstorming`、`test-driven-development`、`systematic-debugging`、
  `verification-before-completion`、`writing-plans`、`executing-plans`、
  `subagent-driven-development`、`requesting-code-review`、`receiving-code-review`、
  `using-git-worktrees`、`finishing-a-development-branch`、`dispatching-parallel-agents`、
  `writing-skills`。
- **3 个代理**：`compose`（主代理 / 编排器）、`compose-dev`（子代理 / 实现者）、
  `compose-review`（子代理 / 评审者）。三者均**不锁定 `model`**，沿用你的全局默认模型。
- **1 个斜杠命令**：`/superpowers`（路由到 `compose`）。

## 更新与卸载

```bash
# 更新（重新运行安装，幂等）
kilo-superpowers-compose update

# 卸载（清单法精确移除本包安装的全部内容，绝不触碰用户自有文件）
kilo-superpowers-compose uninstall
```

更新上游包后，建议：

```bash
npm update -g kilo-superpowers-compose
kilo-superpowers-compose update
```

卸载会移除：技能链接、3 个代理文件、`superpowers.md` 命令、`kilo.jsonc` 中本包的
`skills.paths` 条目，以及安装清单。你的其他技能 / 代理 / 配置保持原样。

## 命令行用法

```text
kilo-superpowers-compose <command>

命令：
  install     安装技能、代理与斜杠命令（默认）
  uninstall   移除本包安装的全部内容（清单法）
  update      重新运行安装（幂等）

选项：
  -v, --version    显示版本号
  -h, --help       显示帮助
```

### 环境变量

| 变量 | 作用 |
|---|---|
| `KILO_HOME=<path>` | 覆盖用户主目录（多用于测试 / 多配置隔离） |
| `KILO_SUPERPOWERS_PREFIX=1` | （保留）为技能名加前缀；v0.1 以 `superpowers` 命名空间隔离，故暂未启用 |
| `KILO_SUPERPOWERS_DRY_RUN=1` | 只打印将执行的动作，不修改任何文件 |
| `KILO_SUPERPOWERS_VERBOSE=1` | 输出详细日志（到 stderr） |

### 退出码

`0` 成功 · `1` 一般错误 · `2` `kilo.jsonc` 解析失败（已从备份恢复） · `3` 目标目录不可写 · `4` 技能链接创建失败。

> **关于 `kilo.jsonc` 注释**：安装器只剥离 `//` 行注释；**块注释 `/* */` 不被处理**。
> 若你的 `kilo.jsonc` 含块注释导致解析失败，安装器会从自动备份恢复并以退出码 `2` 退出。
> 写回时会丢失注释（已知取舍）。

## 注意事项

- **同名代理覆盖**：若你已有一个名为 `compose` 的代理，安装会覆盖它（v0.1 接受此取舍）。
- **技能命名空间**：14 个技能位于 `superpowers/` 命名空间下，不会与你已有的
  `~/.kilo/skills/<name>` 技能冲突；仅当你也存在 `superpowers` 目录时才需留意。
- **Windows 链接**：技能目录用 junction 链接（无需管理员权限）；极少数失败会自动
  回退为递归复制。
- **不自动 `postinstall`**：安装是显式的，避免在你不知情时修改 `kilo.jsonc`。

## 开发与测试

```bash
node --test     # 零依赖自动化测试（安装器纯逻辑 + install/uninstall 往返）
npm pack        # 检视发布包内容
```

## 文档

- [docs/DESIGN.md](docs/DESIGN.md) —— 架构、命名、包布局、设计决策、风险
- [docs/INSTALLER.md](docs/INSTALLER.md) —— `bin/` 安装器规格与源码
- [docs/AGENTS.md](docs/AGENTS.md) —— 三个代理的规格（frontmatter + 系统提示词）
- [docs/REFERENCES.md](docs/REFERENCES.md) —— 所有参考链接（上游项目、Kilo 文档等）
- [NOTICE](NOTICE) —— 上游 obra/superpowers 归属（tag `v6.1.1`，MIT）

## 灵感来源

本项目移植 / 改编自
[moyu-by/opencode-mimo-compose](https://github.com/moyu-by/opencode-mimo-compose)，
后者为 OpenCode 做了同样的事。我们：

1. 将其重新打包以面向 Kilo（Kilo 是 OpenCode 的一个 fork —— 高度重合）。
2. 底层技能来源换成 [obra/superpowers](https://github.com/obra/superpowers)（MIT）。
3. 将编排器设计收紧为纯路由角色（不在内联写代码），并配以严格的两阶段评审子代理。

## 许可证

MIT（见 [LICENSE](LICENSE)）。内嵌的 14 个技能来自 obra/superpowers（MIT，
© Jesse Vincent），逐字保留；归属见 [NOTICE](NOTICE)。

## 更新日志

- **v0.1.0** —— 首个可用版本。14 技能（锁 obra/superpowers `v6.1.1`）、3 代理、
  `/superpowers` 命令、零依赖 ESM 安装器（清单法卸载、幂等、跨平台 junction）。
  Path A 为受支持路径；Path B（`plugin` 字段）暂缓为实验性。
