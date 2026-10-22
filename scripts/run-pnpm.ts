import { spawnSync } from 'node:child_process'

/**
 * Ejecuta un binario del proyecto via `pnpm exec` heredando stdio.
 *
 * `shell: true` es necesario en Windows: los binarios de `node_modules/.bin` son
 * `.CMD` y `spawn` sin shell no los puede ejecutar. Los argumentos se citan para
 * que rutas con espacios no se partan.
 *
 * Devuelve el codigo de salida del proceso (null -> 1, para no tragarse una senal).
 */
export function runPnpmExec(args: readonly string[]): number {
  const quoted = args.map((arg) => `"${arg}"`)
  const result = spawnSync('pnpm', ['exec', ...quoted], {
    stdio: 'inherit',
    shell: true,
  })

  if (result.error !== undefined) {
    throw new Error(`no se pudo ejecutar 'pnpm exec ${args.join(' ')}': ${result.error.message}`)
  }

  return result.status ?? 1
}
