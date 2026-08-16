/**
 * The composer access-mode chip lock for normal users.
 *
 * The stock composer renders the permission-mode selector inline (the
 * 'conversation.composer.bar' default entry) with the FULL preset roster the
 * host advertises through the 'permissions' projection — there is no slot,
 * provide-member, or projection-key override a plugin may use to narrow the
 * list (registering a second 'permissions' projection key fails loud, and
 * the preset roster itself is process-wide, so shrinking it would clamp
 * admins too). The host half of this plugin already pins every normal-user
 * session to workspace-write and rejects switches; this module closes the
 * UI half: while the resolved identity is a normal user, the chip keeps
 * showing the pinned "Workspace Write" value but stops opening its menu —
 * functionally "exactly one option, selected".
 *
 * Anchoring stays locale-stable and build-stable: the chip trigger is the
 * only button whose aria-label starts with the localized access-mode prefix
 * (the stock client ships exactly zh/en), and the chevron is matched by its
 * CSS-modules suffix rather than its hash.
 */

/**
 * aria-label prefixes of the access-mode trigger across the stock client
 * locales ('访问模式，当前：{name}' / 'Access mode, current: {name}').
 */
export const ACCESS_MODE_LABEL_PREFIXES: readonly string[] = ['访问模式', 'Access mode']

/** True when an aria-label belongs to the access-mode trigger. */
export function isAccessModeLabel(label: string): boolean {
  return ACCESS_MODE_LABEL_PREFIXES.some((prefix) => label.startsWith(prefix))
}

/** CSS selector matching the access-mode trigger button in every locale. */
export function accessModeTriggerSelector(): string {
  return ACCESS_MODE_LABEL_PREFIXES.map((p) => `button[aria-label^="${p}"]`).join(', ')
}

/** body[data-dsh-projects-role] value while a normal user is signed in. */
export const ROLE_ATTRIBUTE = 'data-dsh-projects-role'

/** id of the injected <style> element (idempotent mounting). */
export const PERMISSION_LOCK_STYLE_ID = 'projects-permission-lock'

/**
 * The lock stylesheet: while the role flag marks a normal user, the trigger
 * keeps rendering the pinned value but no longer opens its menu, and the
 * dropdown chevron is hidden (a fixed mode, not a chooser).
 *
 * One COMPLETE rule per locale prefix — a comma-joined selector would split
 * the rule list and drop the body scope from every segment but the first.
 * Declarations carry !important on purpose: this is an adversarial freeze
 * against stock styles the lock must win regardless of injection order.
 */
export function permissionLockCss(): string {
  const scoped = (suffix: string, decl: string): string =>
    ACCESS_MODE_LABEL_PREFIXES
      .map((p) => `body[${ROLE_ATTRIBUTE}="user"] button[aria-label^="${p}"]${suffix} { ${decl} }`)
      .join('\n')
  return [
    scoped('', 'pointer-events: none !important; cursor: default !important;'),
    scoped(' [class$="_chevron"]', 'display: none !important;'),
  ].join('\n')
}

/**
 * Keep the body role flag in step with the resolved identity: 'user' while a
 * normal user is signed in, absent otherwise (admins/anonymous keep the full
 * stock chip).
 */
export function applyBodyRole(
  body: Pick<HTMLElement, 'setAttribute' | 'removeAttribute'> | null | undefined,
  role: 'user' | 'other',
): void {
  if (!body) return
  if (role === 'user') body.setAttribute(ROLE_ATTRIBUTE, 'user')
  else body.removeAttribute(ROLE_ATTRIBUTE)
}

/**
 * Inject the lock stylesheet once per document; the disposer removes it.
 */
export function mountPermissionLockStyle(doc: Pick<Document, 'head' | 'querySelector' | 'createElement'>): () => void {
  const existing = doc.querySelector(`style#${PERMISSION_LOCK_STYLE_ID}`)
  if (existing) return () => existing.remove()
  const tag = doc.createElement('style')
  tag.id = PERMISSION_LOCK_STYLE_ID
  tag.textContent = permissionLockCss()
  doc.head.append(tag)
  return () => tag.remove()
}
