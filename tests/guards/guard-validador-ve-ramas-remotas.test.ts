// Guardia: el validador de `feature_list.json` encuentra el spec de una feature en vuelo
// cuando solo vive en SU rama remota (`origin/<branch>`), la de un companero que no tienes en
// disco ni en un worktree.
//
// Existe por el 2026-10-08: QC-167 (de otra persona) estaba en `spec_ready` con su spec en
// `origin/feature/QC-167-...`, y `./init.sh` abortaba en el paso 3 con «faltan specs para
// features sdd en vuelo» en la maquina de todos los demas. El rojo era del validador, no del
// trabajo de nadie.
//
// La guardia monta un repo git de mentira, pone el spec SOLO en un commit al que apunta
// `refs/remotes/origin/<branch>` y corre el validador de verdad. El segundo caso es el que la
// hace valer (`docs/gate.md > Probar que muerde, no que pasa`).

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const AQUI = dirname(fileURLToPath(import.meta.url))
const VALIDADOR = join(AQUI, '..', '..', 'scripts', 'validate-features.mjs')
const RAMA = 'feature/QC-9-feature-de-un-companero'

const LISTA_DE_FEATURES = JSON.stringify(
  {
    jira: { site: 'ejemplo.atlassian.net', project: 'QC' },
    features: [
      {
        key: 'QC-9',
        id: 9,
        name: 'feature-de-un-companero',
        description: 'Su spec vive solo en la rama remota.',
        status: 'spec_ready',
        sdd: true,
        complexity: 'low',
        zone: 'backend',
        branch: RAMA,
        depends_on: null,
      },
    ],
  },
  null,
  2,
)

let temporal: string | null = null

afterEach(() => {
  if (temporal) rmSync(temporal, { recursive: true, force: true })
  temporal = null
})

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

/**
 * Repo con `feature_list.json` en el arbol de trabajo y, si `conSpec`, un commit con
 * `specs/QC-9-.../requirements.md` al que apunta `origin/<RAMA>`. El arbol de trabajo NO
 * tiene el spec en ningun caso.
 */
function montarRepo(conSpec: boolean): string {
  const raiz = mkdtempSync(join(tmpdir(), 'guard-validador-remoto-'))
  temporal = raiz
  git(raiz, 'init', '-q')
  git(raiz, 'config', 'user.email', 'guardia@ejemplo.test')
  git(raiz, 'config', 'user.name', 'guardia')

  const carpeta = join(raiz, 'specs', 'QC-9-feature-de-un-companero')
  mkdirSync(carpeta, { recursive: true })
  writeFileSync(join(carpeta, conSpec ? 'requirements.md' : 'notas.md'), '# QC-9\n\nR1. Existe.\n')
  git(raiz, 'add', 'specs')
  git(raiz, 'commit', '-q', '-m', 'spec en la rama del companero')
  git(raiz, 'update-ref', `refs/remotes/origin/${RAMA}`, 'HEAD')
  rmSync(join(raiz, 'specs'), { recursive: true, force: true })

  writeFileSync(join(raiz, 'feature_list.json'), LISTA_DE_FEATURES)
  return raiz
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

describe('guardia: el validador ve el spec en la rama remota de la feature', () => {
  it('pasa cuando el spec solo existe en origin/<branch>', () => {
    const { code, salida } = correrValidador(montarRepo(true))

    expect(salida).not.toContain('faltan specs')
    expect(code, salida).toBe(0)
  })

  // Anti-vacuidad: la rama remota existe pero no trae requirements.md, asi que el rojo es el correcto.
  it('falla cuando la rama remota no trae requirements.md', () => {
    const { code, salida } = correrValidador(montarRepo(false))

    expect(salida).toContain('faltan specs')
    expect(code).not.toBe(0)
  })
})
