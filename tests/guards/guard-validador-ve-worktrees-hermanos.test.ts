// Guardia: el validador de `feature_list.json` encuentra los specs de las features en vuelo
// AUNQUE se corra desde dentro de un worktree, donde `.worktrees/` no existe.
//
// Existe por un incidente que paro el repo tres veces —dos en QC-74 y una en QC-76, el
// 2026-09-08— y siempre igual: `./init.sh` abortaba en el paso 3 con «faltan specs para
// features sdd en vuelo», con esos specs sanos en disco, en worktrees hermanos, a un
// directorio de distancia. El gate se corre antes de cada PR (regla 5 de `CLAUDE.md`), asi
// que eso bloqueaba el F2.4 de TODAS las features a la vez.
// Detalle en `docs/worktrees.md > El validador mira el repo entero, no el worktree`.
//
// La guardia monta un repo de mentira en un directorio temporal y corre el validador de
// verdad con `cwd` dentro del worktree. El segundo caso es el que la hace valer: sin el,
// esto pasaria igual con un validador que no mirara nada (`docs/gate.md > Probar
// que muerde, no que pasa`).

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const AQUI = dirname(fileURLToPath(import.meta.url))
const VALIDADOR = join(AQUI, '..', '..', 'scripts', 'validate-features.mjs')

const FICHA_EN_VUELO = [
  {
    key: 'QC-9',
    id: 9,
    name: 'feature-en-otro-worktree',
    description: 'Vive en un worktree hermano, no en esta rama.',
    status: 'in_progress',
    sdd: true,
    complexity: 'low',
    zone: 'backend',
    branch: 'feature/QC-9-feature-en-otro-worktree',
    depends_on: null,
    spec_path: 'specs/QC-9-feature-en-otro-worktree',
  },
]

// El validador exige que la lista declare `jira.project` cuando hay fichas con `key`, y que
// todas lo lleven de prefijo. El fixture lo declara para representar un archivo valido.
const LISTA_DE_FEATURES = JSON.stringify(
  { jira: { site: 'ejemplo.atlassian.net', project: 'QC' }, features: FICHA_EN_VUELO },
  null,
  2,
)

let temporal: string | null = null

afterEach(() => {
  if (temporal) rmSync(temporal, { recursive: true, force: true })
  temporal = null
})

/**
 * Monta `<raiz>/{feature_list.json,.worktrees/QC-10-otra/}` y, si `conSpec`, el
 * `requirements.md` de la ficha en vuelo dentro de SU worktree — nunca en el que se corre.
 * Devuelve el directorio desde el que hay que correr el validador.
 */
function montarRepo(conSpec: boolean): string {
  const raiz = mkdtempSync(join(tmpdir(), 'guard-validador-'))
  temporal = raiz

  writeFileSync(join(raiz, 'feature_list.json'), LISTA_DE_FEATURES)

  // El worktree DESDE EL QUE se corre el gate: es el de otra feature y no tiene el spec.
  const propio = join(raiz, '.worktrees', 'QC-10-la-que-corre-el-gate')
  mkdirSync(join(propio, 'specs'), { recursive: true })
  writeFileSync(join(propio, 'feature_list.json'), LISTA_DE_FEATURES)

  if (conSpec) {
    const ajeno = join(raiz, '.worktrees', 'QC-9-feature-en-otro-worktree', 'specs', 'QC-9-feature-en-otro-worktree')
    mkdirSync(ajeno, { recursive: true })
    writeFileSync(join(ajeno, 'requirements.md'), '# QC-9\n\n## Requisitos (EARS)\n\nR1. Existe.\n')
  }

  return propio
}

function correrValidador(cwd: string): { code: number; salida: string } {
  try {
    const salida = execFileSync(process.execPath, [VALIDADOR], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, salida }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? 1, salida: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

describe('guardia: el validador ve los worktrees hermanos', () => {
  it('pasa cuando el spec de la feature en vuelo vive en OTRO worktree', () => {
    const { code, salida } = correrValidador(montarRepo(true))

    expect(salida).not.toContain('faltan specs')
    expect(code, salida).toBe(0)
  })

  // Anti-vacuidad: sin este caso, la guardia pasaria igual con un validador que no mirara
  // nada. Aqui el spec NO existe en ningun sitio, asi que el rojo es el correcto.
  it('falla cuando ese spec no existe en ningun worktree', () => {
    const { code, salida } = correrValidador(montarRepo(false))

    expect(salida).toContain('faltan specs')
    expect(code).not.toBe(0)
  })
})
