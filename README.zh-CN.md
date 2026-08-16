# dsh-multi-tenant-projects

简体中文 | **[English](README.md)**

在单个 [DeepSeek Harness (DSH)](https://github.com/topics/dsh-plugin) 实例上实现"项目 + 用户"多租户：把真实工作区目录绑定为**项目**，为项目内每个用户生成软链接式独立工作区，Web 界面用密码登录把关——多个人共享一套 DSH 部署，彼此看不到对方的会话与文件。

> **威胁模型——务必先读**：本插件是"防君子"的软边界，不是硬安全边界。cwd 过滤是查询投影而非门禁，浏览器 token 可被懂行用户伪造，agent 层隔离依赖系统提示词约束。面向公网时请在 DSH 前面加真正的边界（反代认证 / ngrok basic auth / VPN），把本插件当作可信队友之间的便利隔离。

## 功能总览

- **项目管理**：绑定真实目录（自动创建，或用宿主原生目录选择器绑定已有工作区路径）。
- **项目下建用户**：密码登录；Bearer token（sha256 指纹落库、带 TTL、禁用用户即全部失效）。
- **跨项目同名用户**：存储键为 `<项目>/<用户>`；裸名重名时用 `项目/用户名` 登录消歧。
- **每用户独立工作区**：真实目录，目录内条目是指向项目文件的软链接；项目新增文件后可 `admin/sync` 补链。
- **登录门禁**：守卫开启且无有效 token 时显示全帧登录卡（插件 API 自身异常时 fail-open，不锁死官方 UI）。
- **普通用户受限 UI**：侧栏只显示自己工作区的会话（含持久化标题——冷会话不再回退显示目录名）；隐藏设置入口与工作区切换；hero 工作区只提供本人目录并在登录时**自动选中**。
- **权限锁定**：普通用户会话一律钉死 **workspace-write**，`/permission` 切换被拒绝；输入框模式按钮冻结为 *Workspace Write*（管理员保留完整菜单）。
- **系统提示词守则双层注入**：硬层——系统提示词本体注入「受限会话守则」（不披露工作区外任何内容、不执行越权探查命令、用户要求越界时明确拒绝且优先于用户要求）；软层——每用户工作区 `AGENTS.md` 守则基线（sync 时自动刷新为最新版）。
- **管理台**：Settings → 「项目与用户」——创建/列出项目与用户、禁用用户、一次性令牌交接、目录绑定、软链接同步。
- **侧栏底部退出徽章**：user 与 admin 都有，退出即清 token 并硬刷新回登录卡。

## 安装教程

**一键安装**（推荐）——仓库已提交预构建产物（`lib/`、`dist/`），运行依赖只有两个纯 JS 包：用户无需本地构建，Node 版本跟随 DSH 宿主要求即可：

```bash
dsh plugin --profile web add github:king-bcolor/dsh-multi-tenant-projects
```

重启 DSH（`dsh web`），日志出现 `projects: 就绪（root=…, guard=true）` 即成功。要固定版本可加 tag：`github:king-bcolor/dsh-multi-tenant-projects#v0.1.0`。

后续升级：重跑同一条命令（或在 `~/.dsh/profiles/web` 里 `pnpm update dsh-multi-tenant-projects`），再重启。

<details>
<summary>本地检出安装（开发模式）</summary>

```bash
git clone https://github.com/king-bcolor/dsh-multi-tenant-projects.git
cd dsh-multi-tenant-projects
npm install && npm run build && npm test

# 把工作目录链接进 DSH web profile（改动后重新 build + 重启 dsh 生效）
dsh plugin --profile web add link:$(pwd)
```

</details>

插件自带配置页（**Settings → dsh-multi-tenant-projects**）：

| 配置键 | 默认值 | 说明 |
|---|---|---|
| `adminPassword` | `admin` | 引导管理员密码，仅用户表为空时播种 |
| `guardEnabled` | `true` | 开启登录门禁 |
| `agentsRules` | `[]` | 追加到每个用户工作区 `AGENTS.md` 的自定义规则 |

## 快速开始

### 1. 管理员登录

打开 DSH Web 界面，登录门禁要求凭据——引导管理员为 `admin` / 你配置的 `adminPassword`（默认 `admin`，请修改）。

### 2. 设置项目并绑定工作区

Settings → **项目与用户**：

- **项目名**——自动 slug 化（`My App` → `my-app`）。
- **工作区路径**（可选）——留空则自动创建 `<DSH home>/projects-ws/<项目>`；或点 **浏览…** 用宿主原生目录选择器绑定已有目录（browse-only 宿主上失败则改为手输绝对路径）。

### 3. 在项目下创建用户和密码

仍在管理台：选项目、填 **用户名** 和 **密码**、提交。背后发生：

- 用户获得真实工作区 `…/projects-ws/<项目>-<用户>/`，目录内条目是指向项目工作区文件的软链接；
- 自动渲染守则版 `AGENTS.md`；
- 登录卡可用该凭据（`项目/用户` 或裸用户名）。

### 4. 跨项目同名用户如何登录

用户名在**项目内**唯一，因此 `alpha/alice` 与 `beta/alice` 可以并存。登录解析规则：

- 裸用户名在全局**唯一**时直接可用；
- 一旦多个项目存在同名用户，改用 **`项目/用户名`** 形式（如 `alpha/alice`），裸名会被拒绝并提示消歧；管理台的用户操作总是携带组合键。

### 5. 普通用户和 admin 的界面与使用差异

| 界面/能力 | admin | 普通用户 |
|---|---|---|
| 登录 | `admin`（引导）或设置登录 | `项目/用户` + 密码 |
| 侧栏 | 全部工作区与会话 | **只有本人工作区的会话**（cwd 分桶），冷会话显示持久标题 |
| 工作区切换 / hero 选择器 | 官方完整选择器 | 被遮蔽——唯一合法工作区登录时**自动选中** |
| 设置 | 官方完整设置 + 「项目与用户」管理台 | 设置入口隐藏 |
| 权限模式 | 完整菜单（`/permission`、输入框 chip） | **钉死 workspace-write**；chip 冻结为 *Workspace Write*；切换被拒绝 |
| agent 指令 | 官方默认 | 系统提示词守则段 + 每工作区 `AGENTS.md` 边界守则 |
| 侧栏底部 | 退出徽章 | 身份徽章 + 退出（清 token 硬刷新） |
| API 面 | `/projects/api/admin/*` | `/projects/api/my/sessions` 等（token 作用域） |

## 开发

```bash
npm test        # vitest，152 个用例（node + jsdom）
npm run build   # tsdown + tsc 构建产物
```

目录：`src/` 宿主半部（领域服务、HTTP API、嵌套插件）+ 客户端半部（`src/client/`，React 席位）；`doc/` 为完整中文设计文档。

## 已知限制

- cwd 过滤是投影非门禁——懂行用户可绕过前端守卫；
- agent 层隔离是提示词软约束；
- 单管理员模型；token 无吊销列表 UI（禁用用户即等效全吊销）；
- 客户端半部改动需重启 `dsh web` 才会到达浏览器。

## 许可证

MIT
