// Guardia: toda ficha con `key` trae `title` (el summary del issue) en cuanto la copia del board
// es posterior a la regla (`docs/jira.md > Como se nombra una ficha`).
//
// «SL-10» solo no dice de que se habla, y el gate corre sin red: no puede resolver el key contra
// Jira. Por eso el validador exige `title` si alguna ficha lo trae, y si ninguna lo trae (copia
// anterior a la regla) solo avisa para que la siguiente F0 lo importe.
//
// Un fixture por resultado: el valido sale 0, cada rojo nombra la ficha, y la copia antigua avisa
// sin fallar. Sin los rojos, esto pasaria con un validador que no mirara nada (`docs/gate.md >
// Probar que muerde, no que pasa`).

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const AQUI = dirname(fileURLToPath(import.meta.url))
const VALIDADOR = join(AQUI, '..', '..', 'scripts', 'validate-features.mjs')

const ficha = (n: number, title?: unknown) => {
  const f: Record<string, unknown> = {
    key: `QC-${n}`,
    id: n,
    name: `ficha-${n}`,
    sdd: false,
    status: 'pending',
    zone: 'backend',
    assignee: null,
  }
  if (title !== undefined) f.title = title
  return f
}

let temporal: string | null = null

afterEach(() => {
  if (temporal) rmSync(temporal, { recursive: true, force: true })
  temporal = null
})

function correr(features: unknown[]): { code: number; salida: string } {
  const raiz = mkdtempSync(join(tmpdir(), 'guard-titulo-'))
  temporal = raiz
  writeFileSync(join(raiz, 'arnes.config.json'), JSON.stringify({ jira: { project: 'QC' } }))
  writeFileSync(join(raiz, 'feature_list.json'), JSON.stringify({ features }))
  writeFileSync(join(raiz, '.arnes.local.json'), JSON.stringify({ jira_account_id: 'u1' }))
  try {
    const salida = execFileSync(process.execPath, [VALIDADOR], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, salida }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? 1, salida: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

describe('guardia: title en las fichas del board', () => {
  it('pasa si todas las fichas con key traen title', () => {
    const { code, salida } = correr([ficha(1, 'Alta de tiendas'), ficha(2, 'Ruta del dia')])
    expect(code, salida).toBe(0)
    expect(salida).not.toContain('title')
  })

  it('falla si una ficha con key no trae title y otra si', () => {
    const { code, salida } = correr([ficha(1, 'Alta de tiendas'), ficha(2)])
    expect(salida).toContain('QC-2 no trae title')
    expect(salida).not.toContain('QC-1 no trae title')
    expect(code).not.toBe(0)
  })

  it('falla si una ficha trae title vacio junto a otras con title', () => {
    const { code, salida } = correr([ficha(1, 'Alta de tiendas'), ficha(2, '  '), ficha(3, 'Ruta del dia')])
    expect(salida).toContain('QC-2 no trae title')
    expect(code).not.toBe(0)
  })

  it('avisa sin fallar si ninguna ficha trae title (copia anterior a la regla)', () => {
    const { code, salida } = correr([ficha(1), ficha(2)])
    expect(code, salida).toBe(0)
    expect(salida).toMatch(/no trae title.*corre F0/)
    expect(salida).not.toContain('QC-1 no trae title')
  })
})
