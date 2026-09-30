/**
 * Build both halves of the plugin:
 *  - host: plain ESM library under lib/ (consumed by the cordis Loader)
 *  - client: a closure-factory bundle lib/client.js calling
 *    window.__ModuleLoader__.load({id, factory}) with externals resolved
 *    through the loader module table, following the official harness preset
 *    (packages/client/tsdown.client.ts). CSS Modules are compiled inline by
 *    lightningcss and inject a <style data-plugin> tag at factory execution.
 */
import { readFile } from 'node:fs/promises'
import { basename, dirname, relative as relativePath, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

const PKG_ROOT = dirname(fileURLToPath(import.meta.url))

/** Plugin id stamped into the __ModuleLoader__.load handoff and style tags. */
const PLUGIN_ID = 'dsh-multi-tenant-projects'

/**
 * The platform module baseline every dynamic client bundle resolves through
 * the loader module table (dsh-client-modules' PLATFORM_MODULES). These stay
 * external and are never inlined; everything else is bundled into
 * lib/client.js. Anything declared in `dsh.client.external` would join this
 * list, and this plugin declares none.
 */
const CLIENT_EXTERNALS: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline. */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

const host: UserConfig = {
  entry: ['src/index.ts'],
  dts: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'lib',
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  // keep the official plugin shape: runtime deps (zod/schemastery) and
  // @deepseek-ai/* peers stay external, resolved by the host composition
  deps: {
    neverBundle: [/^@deepseek-ai\//, 'zod', 'schemastery'],
  },
  // precise clean: never wipe the client bundle or tsc's lib/types output
  clean: ['lib/index.js', 'lib/index.d.ts'],
}

const client: UserConfig = {
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  entryFileNames: 'client.js',
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  // The platform baseline stays external; everything else inlines, exactly as
  // the harness's own client preset does.
  deps: {
    neverBundle: (id: string) => CLIENT_EXTERNALS.includes(id),
    alwaysBundle: (id: string) => !CLIENT_EXTERNALS.includes(id),
  },
  outputOptions: {
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
  plugins: [
    {
      // CSS Modules inline: import x.module.css -> hashed class map + an
      // idempotent <style data-plugin> tag appended at factory execution
      // (the loader removes plugin-owned tags on unload).
      name: 'dsh-css-modules-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css')) return null
        const absolute = importer !== undefined ? resolvePath(dirname(resolvePath(importer)), source) : source
        // Package-relative virtual id. An absolute one would be echoed into the
        // emitted `//#region` comments, embedding the build machine's directory
        // layout in a committed artifact and making rebuilds differ per checkout.
        return CSS_VIRTUAL_PREFIX + relativePath(PKG_ROOT, absolute) + CSS_VIRTUAL_SUFFIX
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const relativeId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        const fileId = resolvePath(PKG_ROOT, relativeId)
        this.addWatchFile(fileId)
        const source = await readFile(fileId)
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap: Record<string, string> = {}
        for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
        const tagId = `${PLUGIN_ID}/${basename(fileId)}`
        return [
          `const css = ${JSON.stringify(code.toString())};`,
          `const tagId = ${JSON.stringify(tagId)};`,
          "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
          "  const tag = document.createElement('style');",
          `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
          '  tag.dataset.pluginCss = tagId;',
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
          `export default ${JSON.stringify(classMap)};`,
        ].join('\n')
      },
    },
  ],
}

export default defineConfig([host, client])
