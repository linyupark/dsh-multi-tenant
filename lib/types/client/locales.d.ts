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
    readonly 'admin.passwordBlock': "修改我的密码";
    readonly 'admin.currentPassword': "当前密码";
    readonly 'admin.newPassword': "新密码";
    readonly 'admin.repeatPassword': "确认新密码";
    readonly 'admin.changePassword': "确认修改";
    readonly 'admin.passwordRevokes': "修改后，其他已登录的会话将失效（当前会话保留）。";
    readonly 'admin.passwordDone': "密码已修改";
    readonly 'admin.passwordMismatch': "两次输入的新密码不一致";
    readonly 'admin.disable': "禁用";
    readonly 'admin.sync': "同步软链接";
    readonly 'admin.status.active': "启用";
    readonly 'admin.status.disabled': "已禁用";
    readonly 'admin.syncDone': "已同步";
    readonly 'admin.delete': "删除";
    readonly 'admin.deleteProject': "删除项目";
    readonly 'admin.confirmDeleteUser': "确定物理删除用户 {name}？\n\n会删除：该用户的登录记录、令牌，以及其工作区目录。\n此操作不可撤销。";
    readonly 'admin.confirmDeleteProject': "确定物理删除项目 {name}？\n\n会删除：该项目、其下全部已禁用用户与他们的工作区目录。\n此操作不可撤销。";
    readonly 'admin.deleteUserDone': "已删除用户";
    readonly 'admin.deleteProjectDone': "已删除项目";
    readonly 'admin.boundDirKept': "（绑定的外部目录已保留）";
    readonly 'admin.userNotDisabled': "请先禁用该用户，再删除。";
    readonly 'admin.projectHasActive': "项目下还有未禁用的用户。";
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
