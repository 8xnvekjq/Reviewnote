// Minimal Node ESM resolution hook so `node --test` can run this project's .ts source files
// directly (no vitest/tsx dependency to add). Vite's bundler resolves extensionless specifiers
// like `../types` (-> `../types/index.ts`) and `./foo` (-> `./foo.ts`) the way CommonJS/webpack
// do; plain Node ESM does not. This hook only kicks in when Node's own resolution fails, and only
// tries the two suffixes Vite would — it never changes resolution for a specifier that already
// works. Local test infra only, never imported by the app itself.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const code = err && typeof err === 'object' ? err.code : undefined;
    if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'ERR_UNSUPPORTED_DIR_IMPORT') throw err;
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw err;
    const base = new URL(specifier, context.parentURL);
    const asPath = fileURLToPath(base);
    for (const candidate of [`${asPath}.ts`, `${asPath}/index.ts`]) {
      if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
    }
    throw err;
  }
}
