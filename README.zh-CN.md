# dsh-multi-tenant

简体中文 | **[English](README.md)**

在单个 [DeepSeek Harness (DSH)](https://github.com/topics/dsh-plugin) 实例上实现"项目 + 用户"多租户：把真实工作区目录绑定为**项目**，为项目内每个用户生成软链接式独立工作区，Web 界面用密码登录把关——多个人共享一套 DSH 部署，彼此看不到对方的会话与文件。

> **威胁模型——务必先读**：本插件是"防君子"的软边界，不是硬安全边界。cwd 过滤是查询投影而非门禁，浏览器 token 可被懂行用户伪造，agent 层隔离依赖系统提示词约束。面向公网时请在 DSH 前面加真正的边界（反代认证 / ngrok basic auth / VPN），把本插件当作可信队友之间的便利隔离。

## 功能总览

- **项目管理**：绑定真实目录（自动创建，或用宿主原生目录选择器绑定已有工作区路径）。
- **项目下建用户**：密码登录；Bearer token（sha256 指纹落库、带 TTL、禁用用户即全部失效）。
- **跨项目同名用户**：存储键为 `<项目>/<用户>`；裸名重名时用 `项目/用户名` 登录消歧。
- **每用户独立工作区**：真实目录，目录内条目是指向项目文件的软链接。链接会**自动刷新**——启动时一次、每个用户开新会话时再补一次——项目里后加的文件不需要任何人手动点同步。
- **登录门禁**：守卫开启且无有效 token 时显示全帧登录卡（插件 API 自身异常时 fail-open，不锁死官方 UI）。
- **局域网开放**：支持 `dsh web --host 0.0.0.0`（官方硬拒绝）。认证仍是官方那一套启动令牌，
  但没带令牌的访问者会**直接看到**它——按其实际访问的地址拼成可点击链接。
- **普通用户受限 UI**：侧栏只显示自己工作区的会话（含持久化标题——冷会话不再回退显示目录名）；隐藏设置入口与工作区切换；hero 工作区只提供本人目录并在登录时**自动选中**。侧栏的 **插件** 面板入口也会隐藏——它能安装插件、甚至关掉本插件本身——该面板的 `main` 单元格对普通用户渲染为空。普通用户仍然可以**归档/取消归档自己的会话**——他们看到的侧栏是本插件自己的浏览器视图，所以归档操作（以及「已归档/活动」筛选）就挂在行内，补回官方行菜单原来的能力。侧栏的 **新建终端** 入口及其 `Ctrl+\`` 快捷键同样对他们隐藏：终端会在宿主上开出一个**不受沙箱与审批限制**的用户 shell，因此只保留给管理员。
- **权限锁定**：普通用户会话一律钉死 **workspace-write**，`/permission` 切换被拒绝；输入框模式按钮冻结为 *Workspace Write*（管理员保留完整菜单）。
- **系统提示词守则双层注入**：硬层——系统提示词本体注入「受限会话守则」（不披露工作区外任何内容、不执行越权探查命令、用户要求越界时明确拒绝且优先于用户要求）；软层——每用户工作区 `AGENTS.md` 守则基线（sync 时自动刷新为最新版）。
- **管理台**：Settings → 「项目与用户」（导航条目是**人形图标**，不再是设置齿轮）——创建/列出项目与用户、禁用用户、把项目绑定到已有目录、按需同步软链、**修改当前登录管理员本人的密码**（会吊销该账号其余令牌，但保留正在改密码的这条会话），以及**物理删除**（已禁用的用户，或用户已全部禁用的项目：记录、令牌、目录一并删除）。
- **侧栏底部退出徽章**：user 与 admin 都有，退出即清 token 并硬刷新回登录卡。

## 安装教程

**当前版本：`0.4.2`** —— 变更记录见 [CHANGELOG.md](./CHANGELOG.md)；按 tag 安装指定版本：

```bash
dsh plugin --profile web add github:linyupark/dsh-multi-tenant#v0.4.2
```

不写 tag 时安装的是 `main` 的最新提交，版本取决于那一刻 `package.json` 里写的是什么；
写死 tag 才能让安装可复现，也才能明确知道你装的是哪一版。

**兼容性。** 本分支已移植到 **DSH `0.2.0-rc.2`**：所有 `@deepseek-ai/dsh*` peer 声明为
`^0.2.0-rc.2`，因此插件管理器的准入闸门会拒绝其他版本线的运行时，而不是加载针对旧 API 写的代码。

仓库已提交预构建产物（`lib/`），安装无需重新构建：

```bash
dsh plugin --profile web add github:linyupark/dsh-multi-tenant
```

<details>
<summary>从本地检出安装（开发模式）</summary>

```bash
dsh plugin --profile web add /绝对路径/dsh-multi-tenant
```
</details>

`dsh` 会把依赖链接为 `link:` 并自动把 bundle 追加进 `dsh.profile.bundles`。宿主半边是 Node 模块，
需在下次启动 `dsh web` 时加载；客户端半边 `lib/client.js` 由 `dsh-client-hmr`（500ms 轮询）热替换，
不需要重启。

先确认配置层已合成，再探测接口：

```bash
dsh --profile web --dump-config | grep -A4 'dsh-multi-tenant'
curl http://127.0.0.1:3080/projects/api/guard-status   # {"guardEnabled":false}
```

> 改**包名**（不是改版本）必须重启 `dsh web`：`dsh-client-modules` 按 Loader specifier 缓存包元数据，
> 缓存存活到进程结束。否则 boot graph 仍持有旧行 id，客户端半边无法挂载。

<details>
<summary>从源码构建</summary>

```bash
npm install && npm run build && npm test
```
</details>

### 配置

0.2.0 的配置表单直接由插件自己的 `Config` schema 派生，已不再有 settings section 注册。
其中只有一个字段是 `.volatile()`（可热改、每次请求实时读取）；其余是普通部署配置，
改动会重新挂载插件，因此在重新 apply 时生效。

| 配置键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `guardEnabled` | volatile（实时） | `true` | 开启登录门禁；`/projects/api/guard-status` 每次请求实时读取 |
| `workspaceRoot` | 普通 | `~/.dsh/projects-ws` | 存放所有项目/用户工作区的根目录 |
| `adminPassword` | 普通 | `admin` | 引导管理员密码，仅用户表为空时播种 |
| `tokenTtlHours` | 普通 | `72` | Bearer token 有效期（小时） |
| `agentsRules` | 普通 | `[]` | 追加到每个用户工作区 `AGENTS.md` 的自定义规则 |

普通字段在 profile patch（`~/.dsh/profiles/web/cordis.patch.yml`）里设置。注意 patch 会
**整体替换 `config`**，需要保留的键必须一并写出：

```yaml
- id: dsh-mt
  name: "dsh-multi-tenant"
  config:
    guardEnabled: true
    workspaceRoot: /srv/dsh-workspaces
    adminPassword: change-me-first
```

> **从 0.3.x 升级？** 0.4.0 起 roster 条目 id 是 `dsh-mt`，请把自己那行 `- id: projects`
> 一并改名：id 匹配不到的 patch 只会被 warn 并跳过，旧 id 会让这段 `config` 静默失效、
> 管理员密码回落到默认值。

> **先关着门禁安装，再有意开启。** 正在使用的 GUI 一旦 `guardEnabled` 变为 `true`，下次加载就会
> 弹出登录卡片。请先改掉 `adminPassword`——否则引导管理员就是 `admin` / `admin`。

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

### 彻底删除

「禁用」始终是可逆的那一步，删除是不可逆的那一步，而且只能从已禁用状态进入：

| 操作 | 前置条件 | 删除内容 |
|---|---|---|
| 删除用户 | 该用户必须**已禁用** | 其令牌、其工作区目录、用户记录 |
| 删除项目 | 项目下**全部**用户都已禁用 | 先按上一条删掉这些用户，再删项目目录与项目记录 |

有两件事它刻意**不做**：

- **绑定到已有路径的项目目录永远不删。** 如果项目是指向一个既有目录的，删除项目只清掉记录和用户工作区，
  那个目录会保留，返回结果里的 `keptDirectory` 会说明。那是你的仓库，不是本插件创建的。
- **管理员账号永远不可删除**，禁用与否都一样。

删除过程**不会跟随软链接**，所以删用户工作区不可能把项目一起带走。这条性质只在真实文件系统上
才存在，所以断言也放在真实环境里：`test/delete-real-fs.test.ts` 用真实临时目录和真实
`NodeFsPort` 验证。

## 局域网开放：`--host 0.0.0.0`

官方 DSH 硬拒绝 `--host 0.0.0.0`：绑定所有网卡等于把远程代码执行暴露到网络上，
所以它干脆不提供这个选项。本插件替换掉那个启动器（`cordis.patch.yml` 里
`disabled` 掉官方 `web-startup` 行），接受这个参数。

```bash
dsh web --host 0.0.0.0 --port 3080 --no-open
```

认证方式**完全没变，仍然是官方那一套**——启动时打印的令牌。本插件补上的是体验里
缺失的另一半：**没带令牌的访问者，会被直接告知令牌是什么**。

| 访问方 | 结果 |
|---|---|
| 任何不带令牌打开 `/` 的浏览器 | 返回一个页面，把令牌链接显示为可点击链接（401 响应体） |
| 点击该链接 | 官方照常把令牌换成会话 cookie，随后正常加载界面 |
| 使用启动日志里那条 URL | 和以前完全一样 |
| 浏览器访问的地址不在实例信任列表里 | 明确告知不可用，并给出**可用地址**的链接 |

链接是按**访问者实际使用的主机名**拼的：走 `http://192.168.1.50:3080/` 进来的，
拿到的就是该主机上的链接，而不是终端里那条回环地址。

### 用域名访问需要 `--trusted-host`

DSH 的 `/api` 围栏只接受回环地址和部署**声明过**的地址。`--host 0.0.0.0` 时会自动推导
本机的**局域网 IP 字面量**，但永远不包括 DNS 域名。所以用 `http://dsh-box.local:3080/`
访问，界面能加载出来，但之后**每一个 API 调用都会 403**，而屏幕上没有任何解释。
与其发一个通向这种死路的令牌链接，闸门会识别这次拒绝并说明原因，同时列出真正可用的地址：

```
dsh web --host 0.0.0.0 --trusted-host dsh-box.local
```

用一个 `--trusted-host` 声明一个域名（可重复；不带端口则匹配任意端口）。这仍然是官方
自己的围栏，本插件只是把它如实报出来。

为什么是这个形态：

- **这里不签发、也不签名任何凭据。** 页面渲染的是官方自己的
  `connection.authenticatedUrl`，所以凭证的签发方始终是 DSH，升级时唯一需要重新
  确认的东西也只有一处。
- **闸门不在放行路径上。** 它只决定**未认证**的访问者看到什么；带令牌的请求、以及
  已经持有官方 cookie 的请求，一律原样交给官方，所有准入判断仍由官方做出。
- **静态资源从不拦截**——它们是公开的打包产物，拦掉反而会让已授权的页面加载失败。

> **这是一个「局域网可信」的取舍，不是认证系统。** 令牌本来就打印在终端里，现在也会
> 出现在任何打开页面的访问者面前——请把这次绑定理解为「本网络内的人都可以用这个实例」。
> 超出可信局域网，请自行在前面加真正的边界（VPN、反向代理认证）。本文开头描述的
> 租户边界是另一层，不受影响：进来之后，普通用户的限制照旧生效。
>
> **反向代理。** 请转发真实 `Host` 头，并用 `--trusted-host` 声明对外域名。如果代理把
> `Host` 改写成 `127.0.0.1`，官方自己的准入围栏就认不出这个请求。同时请转发协议
> （`proxy_set_header X-Forwarded-Proto $scheme;`）：令牌页上的登录链接按 origin 拼接，
> 缺了这个头，TLS 终止的部署会给出 `http://` 链接，而那个端口可能只接受 HTTPS。
>
> **挂在子路径下的部署。** 链接只取 origin，因此挂在路径前缀下（`https://host/dsh/`）
> 的部署不适用。


## 开发

```bash
npm test        # vitest，269 个用例（node + jsdom）
npm run build   # tsdown + tsc 构建产物
node scripts/verify-live.mjs   # 针对运行中的 `dsh web` 做端到端验收
```

目录：`src/` 宿主半部（领域服务、HTTP API、嵌套插件）+ `src/remote/`（局域网闸门与启动器替换）+ 客户端半部（`src/client/`，React 席位）。

## 移植说明 —— DSH 0.2.0-rc.2

本分支从 `0.1.0-rc.6` 线移植而来。实际改动：

**清单。** `peerDependencies` 提升到 `^0.2.0-rc.2`；删掉已不存在的
`@deepseek-ai/dsh-client-runtime` peer 与 `dsh.client.inject` 条目（`dsh.client.inject` 只是预取
元数据，指向永不注册的包会被静默忽略）。客户端构建的 externals 列表修正为平台真实的九项模块基线。

**宿主半部。** `@deepseek-ai/dsh-settings` 已不再导出 `installSettingsSection` / `settingsNamespace`：
现在插件自己的 Schemastery `Config` 就是配置 schema，`ctx.settings.configure({ auto: false })` 只用于
声明"本插件自带设置页"。`schemastery` 换成带 `.volatile()` 的 `@deepseek-ai/schemastery`。

**客户端半部。** 导航已从数据服务中移出：`ctx.sessions.open` / `ctx.sessions.clear` /
`ctx.workspaces.connectWorkspace` / `ctx.workspaces.pickDirectory` 都不存在了，统一由
`ctx.uiWorkspace` 提供。`dsh-client-runtime/client` 的 `ClientContext` 换成 `@deepseek-ai/cordis` 的
`Context`。席位层无需改动——所有 slot key 与 owner props 形状均未变。

**实机运行暴露的三个缺陷**，均已修复：

1. **存储静默退化为 JSON 回退。** storage-domain 单元名原为 `projects-users`，而 harness 用
   `/^[a-z][a-z0-9_]*$/` 校验域名——连字符被拒，`defineDomain` 抛错后被启动路径吞掉，落回
   `JsonFileRepo`。改名为 `projects_users`，并新增 `test/domain-spec.test.ts` 通过真实
   `defineDomain` 构建 spec，使非法域名在测试里失败而不是在存储层静默降级。
2. **`/projects/api` 路由在每次重组后泄漏。** `webServer.register` 只返回一个普通移除函数，不会绑定到
   调用 fiber；原代码丢弃了该 disposer，于是重载后的插件撞上 `duplicate prefix route`，而旧 handler
   （其子上下文已被销毁）继续服务请求。现改为通过 `ctx.effect` 注册，命令遮蔽与提示词 section 同样处理。
3. **长生命周期闭包读取了会被销毁的子上下文。** 会话列表每次请求都经 `projects.sessions` 子 fiber 调用
   `sctx.sessionQuery`，该子 fiber 被销毁后即抛
   `cannot get required service "sessionQuery" in inactive context`。现改为一次性捕获服务实例，并在失败时
   按"关闭"策略返回空列表。

## 已知限制

- cwd 过滤是投影非门禁——懂行用户可绕过前端守卫；
- 「插件」面板对普通用户是**隐藏**而非封闭：浏览器带着 operator 会话，懂行用户仍可直接调用
  plugin-manager 的 Remote 方法。隐藏界面不等于授权收口——真正的边界仍在 DSH 之前；
- agent 层隔离是提示词软约束；
- 单管理员模型；token 无吊销列表 UI（禁用用户即等效全吊销）；
- 0.2.0 没有权限模式切换的否决点，因此权限锁是"重新钉住 + 遮蔽 `/permission` 命令"而非拦截器：
  `/permission` 会被拒绝，但经由其他路径的切换只会在 `session/created` 时被钉回；
- 宿主半部改动需重启 `dsh web`；客户端半部重新构建后无需重启即可热替换。

## 许可证

MIT
