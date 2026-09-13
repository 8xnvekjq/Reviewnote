// node --test는 Vite 스타일의 확장자 없는/디렉터리 import(예: from '../types' -> ../types/index.ts)를
// 기본적으로 해석하지 못한다(ERR_UNSUPPORTED_DIR_IMPORT / ERR_MODULE_NOT_FOUND). 테스트 전용으로,
// 실패한 resolve를 .ts / /index.ts를 붙여 재시도하는 최소한의 로더.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.')) {
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return await nextResolve(specifier + suffix, context);
        } catch {
          // try next suffix
        }
      }
    }
    throw err;
  }
}
