/**
 * The 'projects' locale namespace: every user-facing string of the browser
 * half, zh first (fallback), en second. Declared into LocaleNamespaceMap so
 * registrations and the framework `t` seat type-check against these keys.
 */

export const zh = {
  'gate.title': '登录 DSH',
  'gate.subtitle': '项目工作区访问',
  'gate.checking': '正在验证访问身份…',
  'gate.username': '用户名',
  'gate.password': '密码',
  'gate.submit': '登录',
  'gate.signingIn': '登录中…',
  'badge.signedInAs': '当前用户',
  'badge.logout': '退出登录',
  'browser.project': '项目',
  'browser.empty': '还没有会话：点击「新会话」开始。',
  'picker.missing': '你的项目工作区尚未注册，请联系管理员。',
  'section.title': '项目与用户',
  'admin.notSignedIn': '尚未登录：请先通过登录门禁完成认证，再打开本页。',
  'admin.denied': '仅管理员可管理项目与用户；当前账号没有这个权限。',
  'admin.logout': '退出登录',
  'admin.identity': '当前身份',
  'admin.role.admin': '管理员',
  'admin.role.user': '普通用户',
  'admin.projects': '项目',
  'admin.projectName': '项目名称',
  'admin.projectPath': '工作区路径（可选，绝对路径，留空自动创建）',
  'admin.browse': '浏览…',
  'admin.pickFailed': '宿主目录选择不可用，请手动输入路径。',
  'admin.createProject': '创建项目',
  'admin.users': '用户',
  'admin.userProject': '所属项目',
  'admin.username': '用户名',
  'admin.password': '初始密码',
  'admin.createUser': '创建用户',
  'admin.issueToken': '补发令牌',
  'admin.disable': '禁用',
  'admin.sync': '同步软链接',
  'admin.status.active': '启用',
  'admin.status.disabled': '已禁用',
  'admin.tokenIssued': '一次性令牌（仅显示一次）：',
  'admin.syncDone': '已同步',
  'admin.loading': '加载中…',
} as const

export type ProjectsLocaleKey = keyof typeof zh

export const en: Record<ProjectsLocaleKey, string> = {
  'gate.title': 'Sign in to DSH',
  'gate.subtitle': 'Project workspace access',
  'gate.checking': 'Verifying your access…',
  'gate.username': 'Username',
  'gate.password': 'Password',
  'gate.submit': 'Sign in',
  'gate.signingIn': 'Signing in…',
  'badge.signedInAs': 'Signed in as',
  'badge.logout': 'Sign out',
  'browser.project': 'Project',
  'browser.empty': 'No sessions yet — hit “New Session” to start.',
  'picker.missing': 'Your project workspace is not registered yet; ask the admin.',
  'section.title': 'Projects & Users',
  'admin.notSignedIn': 'Not signed in: pass the login gate first, then reopen this page.',
  'admin.denied': 'Only admins manage projects and users; this account lacks that right.',
  'admin.logout': 'Sign out',
  'admin.identity': 'Current identity',
  'admin.role.admin': 'Admin',
  'admin.role.user': 'Member',
  'admin.projects': 'Projects',
  'admin.projectName': 'Project name',
  'admin.projectPath': 'Workspace path (optional, absolute; empty auto-creates)',
  'admin.browse': 'Browse…',
  'admin.pickFailed': 'Host directory picking unavailable — type the path instead.',
  'admin.createProject': 'Create project',
  'admin.users': 'Users',
  'admin.userProject': 'Project',
  'admin.username': 'Username',
  'admin.password': 'Initial password',
  'admin.createUser': 'Create user',
  'admin.issueToken': 'Issue token',
  'admin.disable': 'Disable',
  'admin.sync': 'Sync links',
  'admin.status.active': 'Active',
  'admin.status.disabled': 'Disabled',
  'admin.tokenIssued': 'One-time token (shown once):',
  'admin.syncDone': 'Synced',
  'admin.loading': 'Loading…',
}

/** Register the namespace in the locale table (typed key domain). */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'projects': ProjectsLocaleKey
  }
}
