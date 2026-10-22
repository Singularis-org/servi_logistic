// Guardia: el validador de `feature_list.json` hace cumplir las reglas de equipo del arnes v2
// (`docs/equipo.md`): toda feature en vuelo tiene assignee en Jira, y el cupo por zona cuenta
// solo las features de quien corre el gate (`.arnes.local.json`).
//
// Monta un repo de mentira en un directorio temporal (sin git, asi que la raiz se resuelve por
// el fallback del validador) y lo corre de verdad. Cada regla tiene su caso en verde y su caso
// en rojo: un validador que no mirara nada pasaria los verdes (`docs/gate.md > Probar que
// muerde, no que pasa`).

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const AQUI = dirname(fileURLToPath(import.meta.url))
const VALIDADOR = join(AQUI, '..', '..', 'scripts', 'validate-features.mjs')

type Ficha = Record<string, unknown>

const ficha = (n: number, extra: Ficha): Ficha => ({
  key: `QC-${n}`,
  id: n,
  name: `ficha-${n}`,
  sdd: false,
  status: 'in_progress',
  zone: 'frontend',
  ...extra,
})

let temporal: string | null = null

afterEach(() => {
  if (temporal) rmSync(temporal, { recursive: true, force: true })
  temporal = null
})

function correr(features: Ficha[] | null, miCuenta?: string): { code: number; salida: string } {
  const raiz = mkdtempSync(join(tmpdir(), 'guard-equipo-'))
  temporal = raiz
  writeFileSync(join(raiz, 'arnes.config.json'), JSON.stringify({ jira: { project: 'QC' }, cupos_por_persona: { frontend: 2 } }))
  if (features) writeFileSync(join(raiz, 'feature_list.json'), JSON.stringify({ features }))
  if (miCuenta) writeFileSync(join(raiz, '.arnes.local.json'), JSON.stringify({ jira_account_id: miCuenta }))
  try {
    const salida = execFileSync(process.execPath, [VALIDADOR], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, salida }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? 1, salida: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

const de = (accountId: string) => ({ assignee: { accountId, displayName: accountId } })

describe('guardia: reglas de equipo del validador', () => {
  it('falla si una feature en vuelo no tiene assignee', () => {
    const { code, salida } = correr([ficha(1, { assignee: null })], 'u1')
    expect(salida).toContain('sin assignee')
    expect(code).not.toBe(0)
  })

  it('pasa si todas las features en vuelo tienen assignee', () => {
    const { code, salida } = correr([ficha(1, de('u1')), ficha(2, { status: 'pending', assignee: null })], 'u1')
    expect(code, salida).toBe(0)
  })

  it('el cupo cuenta solo las mias: 3 frontend del equipo, 1 mia, pasa', () => {
    const equipo = [ficha(1, de('u1')), ficha(2, de('u2')), ficha(3, de('u2'))]
    const { code, salida } = correr(equipo, 'u1')
    expect(code, salida).toBe(0)
  })

  it('el cupo muerde cuando YO lo paso', () => {
    const equipo = [ficha(1, de('u1')), ficha(2, de('u1')), ficha(3, de('u1'))]
    const { code, salida } = correr(equipo, 'u1')
    expect(salida).toContain('zona frontend')
    expect(code).not.toBe(0)
  })

  it('sin identidad local cuenta todo el equipo y lo avisa', () => {
    const equipo = [ficha(1, de('u1')), ficha(2, de('u2')), ficha(3, de('u2'))]
    const { code, salida } = correr(equipo)
    expect(salida).toContain('zona frontend')
    expect(code).not.toBe(0)
  })

  it('una copia anterior a v2 (sin campo assignee) avisa y no falla', () => {
    const { code, salida } = correr([ficha(1, {})], 'u1')
    expect(salida).toContain('AVISO: la copia del board es anterior al arnes v2')
    expect(code, salida).toBe(0)
  })

  it('sin copia del board (CI) pasa', () => {
    const { code, salida } = correr(null)
    expect(salida).toContain('sin copia local del board')
    expect(code, salida).toBe(0)
  })
})
