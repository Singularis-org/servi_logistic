// Guardia: el validador solo acepta los cinco estados del arnes (`pending`, `spec_ready`,
// `in_progress`, `done`, `cancelled`), tanto en el `status` de cada ficha de `feature_list.json`
// como en los valores de `arnes.config.json > jira.estados` (`docs/jira.md > Los estados del
// board`).
//
// Sale de la F0 de QC del 2026-10-08: el arnes suponia cinco columnas con nombre fijo y el board
// real tenia otros (Por hacer, En revision, Finalizado). Los nombres pasaron al perfil, y esta
// guardia prueba que una traduccion mal escrita no se cuela en verde.
//
// Un fixture por resultado: el valido sale 0, y cada rojo nombra lo que esta mal. Sin los rojos,
// esto pasaria con un validador que no mirara nada (`docs/gate.md > Probar que muerde, no que
// pasa`).

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const AQUI = dirname(fileURLToPath(import.meta.url))
const VALIDADOR = join(AQUI, '..', '..', 'scripts', 'validate-features.mjs')

const ESTADOS_QC = {
  'Por hacer': 'pending',
  'En revisión': 'spec_ready',
  'En curso': 'in_progress',
  Finalizado: 'done',
  Cancelado: 'cancelled',
}

const ficha = (n: number, status: unknown) => ({
  key: `QC-${n}`,
  id: n,
  name: `ficha-${n}`,
  sdd: false,
  status,
  zone: 'backend',
  assignee: null,
})

let temporal: string | null = null

afterEach(() => {
  if (temporal) rmSync(temporal, { recursive: true, force: true })
  temporal = null
})

function correr(estados: unknown, features: unknown[] | null): { code: number; salida: string } {
  const raiz = mkdtempSync(join(tmpdir(), 'guard-estados-'))
  temporal = raiz
  const jira: Record<string, unknown> = { project: 'QC' }
  if (estados !== undefined) jira.estados = estados
  writeFileSync(join(raiz, 'arnes.config.json'), JSON.stringify({ jira }))
  if (features) writeFileSync(join(raiz, 'feature_list.json'), JSON.stringify({ features }))
  writeFileSync(join(raiz, '.arnes.local.json'), JSON.stringify({ jira_account_id: 'u1' }))
  try {
    const salida = execFileSync(process.execPath, [VALIDADOR], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, salida }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? 1, salida: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

describe('guardia: estados del arnes en el validador', () => {
  it('pasa con jira.estados completo y fichas en los cinco estados', () => {
    const fichas = ['pending', 'done', 'cancelled'].map((s, i) => ficha(i + 1, s))
    const { code, salida } = correr(ESTADOS_QC, fichas)
    expect(code, salida).toBe(0)
    expect(salida).not.toContain('jira.estados')
  })

  it('falla si una ficha trae un status fuera de los cinco', () => {
    const { code, salida } = correr(ESTADOS_QC, [ficha(1, 'pending'), ficha(2, 'Finalizado')])
    expect(salida).toContain('QC-2 tiene status "Finalizado"')
    expect(code).not.toBe(0)
  })

  it('falla si una ficha no trae status', () => {
    const { code, salida } = correr(ESTADOS_QC, [ficha(1, undefined)])
    expect(salida).toContain('QC-1 tiene status undefined')
    expect(code).not.toBe(0)
  })

  it('falla si jira.estados traduce a un valor fuera de los cinco, aun sin copia del board', () => {
    const { code, salida } = correr({ ...ESTADOS_QC, 'En revisión': 'review' }, null)
    expect(salida).toContain('traduce "En revisión" a "review"')
    expect(code).not.toBe(0)
  })

  it('falla si jira.estados no es un objeto', () => {
    const { code, salida } = correr(['pending'], null)
    expect(salida).toContain('jira.estados no es un objeto')
    expect(code).not.toBe(0)
  })

  it('acepta varios nombres al mismo estado y avisa del que falta, sin fallar', () => {
    const sinCancelado: Record<string, string> = { ...ESTADOS_QC }
    delete sinCancelado.Cancelado
    const { code, salida } = correr({ ...sinCancelado, Bloqueado: 'in_progress' }, [ficha(1, 'pending')])
    expect(code, salida).toBe(0)
    expect(salida).toContain('AVISO: arnes.config.json > jira.estados no traduce ningun estado del board a: cancelled')
  })

  it('sin jira.estados declarado no exige nada', () => {
    const { code, salida } = correr(undefined, [ficha(1, 'pending')])
    expect(code, salida).toBe(0)
    expect(salida).not.toContain('jira.estados')
  })
})
