/**
 * Domain record schemas (zod). One source of truth: the same schemas validate
 * storage-domain records and give TS types via `z.infer`.
 */
import { z } from 'zod'

export const ProjectRecord = z.object({
  slug: z.string(),
  name: z.string(),
  workspacePath: z.string(),
  createdAt: z.number(),
})
export type ProjectRecord = z.infer<typeof ProjectRecord>

export const UserRecord = z.object({
  slug: z.string(),
  name: z.string(),
  /** Owning project slug; null for the bootstrap admin. */
  projectSlug: z.string().nullable(),
  role: z.enum(['admin', 'user']),
  passwordHash: z.string(),
  status: z.enum(['active', 'disabled']),
  /** User workspace absolute path; null for admins. */
  workspacePath: z.string().nullable(),
  createdAt: z.number(),
})
export type UserRecord = z.infer<typeof UserRecord>

export const TokenRecord = z.object({
  /** sha256 fingerprint of the bearer token — the only persisted form. */
  fingerprint: z.string(),
  userSlug: z.string(),
  createdAt: z.number(),
  expiresAt: z.number(),
  revoked: z.boolean(),
})
export type TokenRecord = z.infer<typeof TokenRecord>

export const RoleRecord = z.object({
  code: z.enum(['admin', 'user']),
  description: z.string(),
})
export type RoleRecord = z.infer<typeof RoleRecord>

/** The zod table layout handed to `defineDomain` when storageDomain exists. */
export const projectsDomainTables = {
  projects: ProjectRecord,
  users: UserRecord,
  tokens: TokenRecord,
  roles: RoleRecord,
}
