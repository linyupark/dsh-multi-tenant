/**
 * The 'projects' locale namespace: every user-facing string of the browser
 * half, zh first (fallback), en second. Declared into LocaleNamespaceMap so
 * registrations and the framework `t` seat type-check against these keys.
 */
export declare const zh: {
    readonly 'gate.title': "登录 DSH";
    readonly 'gate.subtitle': "项目工作区访问";
    readonly 'gate.checking': "正在验证访问身份…";
    readonly 'gate.username': "用户名";
    readonly 'gate.password': "密码";
    readonly 'gate.submit': "登录";
    readonly 'gate.signingIn': "登录中…";
    readonly 'badge.signedInAs': "当前用户";
    readonly 'badge.logout': "退出登录";
    readonly 'browser.project': "项目";
    readonly 'browser.empty': "还没有会话：点击「新会话」开始。";
    readonly 'picker.missing': "你的项目工作区尚未注册，请联系管理员。";
    readonly 'section.title': "项目与用户";
    readonly 'admin.notSignedIn': "尚未登录：请先通过登录门禁完成认证，再打开本页。";
    readonly 'admin.denied': "仅管理员可管理项目与用户；当前账号没有这个权限。";
    readonly 'admin.logout': "退出登录";
    readonly 'admin.identity': "当前身份";
    readonly 'admin.role.admin': "管理员";
    readonly 'admin.role.user': "普通用户";
    readonly 'admin.projects': "项目";
    readonly 'admin.projectName': "项目名称";
    readonly 'admin.projectPath': "工作区路径（可选，绝对路径，留空自动创建）";
    readonly 'admin.browse': "浏览…";
    readonly 'admin.pickFailed': "宿主目录选择不可用，请手动输入路径。";
    readonly 'admin.createProject': "创建项目";
    readonly 'admin.users': "用户";
    readonly 'admin.userProject': "所属项目";
    readonly 'admin.username': "用户名";
    readonly 'admin.password': "初始密码";
    readonly 'admin.createUser': "创建用户";
    readonly 'admin.issueToken': "补发令牌";
    readonly 'admin.disable': "禁用";
    readonly 'admin.sync': "同步软链接";
    readonly 'admin.status.active': "启用";
    readonly 'admin.status.disabled': "已禁用";
    readonly 'admin.tokenIssued': "一次性令牌（仅显示一次）：";
    readonly 'admin.syncDone': "已同步";
    readonly 'admin.loading': "加载中…";
};
export type ProjectsLocaleKey = keyof typeof zh;
export declare const en: Record<ProjectsLocaleKey, string>;
/** Register the namespace in the locale table (typed key domain). */
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'projects': ProjectsLocaleKey;
    }
}
