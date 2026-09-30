/**
 * Regression cover for the storage-domain unit: the harness validates a
 * domain name against `/^[a-z][a-z0-9_]*$/`, and a hyphen made `defineDomain`
 * throw — which the boot path swallows into the JSON fallback, so the store
 * silently stopped being the official typed domain storage.
 */
import { describe, expect, it } from 'vitest'
import { PROJECTS_DOMAIN_NAME, buildProjectsDomainSpec } from '../src/index.ts'

describe('projects storage domain', () => {
  it('names the unit within the harness UNIT_NAME_RE', () => {
    expect(PROJECTS_DOMAIN_NAME).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it('builds through the harness defineDomain without throwing', async () => {
    const spec = (await buildProjectsDomainSpec()) as {
      name: string
      version: number
      tables: Record<string, unknown>
    }
    expect(spec.name).toBe(PROJECTS_DOMAIN_NAME)
    expect(spec.version).toBe(1)
    expect(Object.keys(spec.tables)).toEqual(['projects', 'users', 'tokens', 'roles'])
  })
})