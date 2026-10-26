// Guardia: el validador y el chequeo del perfil resuelven el tracker (`arnes.config.json >
// tracker`, o el bloque `jira` antiguo como respaldo; `scripts/tracker.mjs`) y lo hacen cumplir
// sin red (`docs/trello.md`):
//   - `tracker.tipo` solo puede ser `jira` o `trello`;
//   - la key de cada ficha lleva `tracker.prefijo` o uno de `tracker.prefijos_historicos`;
//   - con `tracker` presente, el bloque `jira` no se lee;
//   - un perfil con solo `jira` se valida como siempre;
//   - una feature en vuelo con mas de un member de Trello es un error: el candado admite uno;
//   - el mismo `id` con keys de prefijos distintos (`XY-32` historico y `AB-32` nuevo) convive,
//     pero ese numero es ambiguo: no resuelve `depends_on` ni vale como prefijo de carpeta.
//
// Un fixture por desenlace, con los rojos nombrando lo que falla (`docs/gate.md > Probar que
// muerde, no que pasa`).

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const AQUI = dirname(fileURLToPath(import.meta.url))
const VALIDADOR = join(AQUI, '..', '..', 'scripts', 'validate-features.mjs')
const PERFIL = join(AQUI, '..', '..', 'scripts', 'check-perfil.mjs')

const ESTADOS = {
  Pendiente: 'pending',
  'Spec en revisión': 'spec_ready',
  'En curso': 'in_progress',
  Hecho: 'done',
  Cancelado: 'cancelled',
}

const TRACKER = { tipo: 'trello', board: 'b1', prefijo: 'AB', prefijos_historicos: ['XY'], estados: ESTADOS }

const ficha = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  id: Number(key.split('-')[1]),
  name: `ficha-${key.toLowerCase()}`,
  sdd: false,
  status: 'pending',
  zone: 'backend',
  assignee: null,
  ...extra,
})

let temporal: string | null = null

afterEach(() => {
  if (temporal) rmSync(temporal, { recursive: true, force: true })
  temporal = null
})

function correr(
  config: unknown,
  features: unknown[] | null,
  identidad: unknown = { trello_member_id: 'm1' },
  script: string = VALIDADOR,
  preparar?: (raiz: string) => void,
) {
  const raiz = mkdtempSync(join(tmpdir(), 'guard-tracker-'))
  temporal = raiz
  preparar?.(raiz)
  writeFileSync(join(raiz, 'arnes.config.json'), JSON.stringify(config))
  if (features) writeFileSync(join(raiz, 'feature_list.json'), JSON.stringify({ features }))
  writeFileSync(join(raiz, '.arnes.local.json'), JSON.stringify(identidad))
  try {
    const salida = execFileSync(process.execPath, [script], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, salida }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    return { code: err.status ?? 1, salida: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

describe('guardia: tracker resuelto en el validador', () => {
  it('pasa con tracker trello, prefijo nuevo y prefijo historico', () => {
    const { code, salida } = correr({ tracker: TRACKER }, [ficha('AB-1'), ficha('XY-131')])
    expect(code, salida).toBe(0)
    expect(salida).toContain('vienen del proyecto AB/XY')
  })

  it('falla si tracker.tipo no es jira ni trello, aun sin copia del board', () => {
    const { code, salida } = correr({ tracker: { ...TRACKER, tipo: 'linear' } }, null)
    expect(salida).toContain('tracker.tipo es "linear"')
    expect(code).not.toBe(0)
  })

  it('falla si una key trae un prefijo ajeno al tracker', () => {
    const { code, salida } = correr({ tracker: TRACKER }, [ficha('AB-1'), ficha('ZZ-2')])
    expect(salida).toContain('fichas de otro board')
    expect(salida).toContain('ZZ-2')
    expect(salida).toContain('tracker.prefijo')
    expect(code).not.toBe(0)
  })

  it('sin prefijos_historicos, una key de una migracion falla', () => {
    const sinHistoricos = { ...TRACKER, prefijos_historicos: [] }
    const { code, salida } = correr({ tracker: sinHistoricos }, [ficha('XY-131')])
    expect(salida).toContain('XY-131')
    expect(code).not.toBe(0)
  })

  it('con tracker presente, el bloque jira no se lee: su project no vale como prefijo', () => {
    const sinHistoricos = { ...TRACKER, prefijos_historicos: [] }
    const { code, salida } = correr({ tracker: sinHistoricos, jira: { project: 'XY' } }, [ficha('XY-1')])
    expect(salida).toContain('fichas de otro board')
    expect(code).not.toBe(0)
  })

  it('valida tracker.estados igual que jira.estados', () => {
    const { code, salida } = correr({ tracker: { ...TRACKER, estados: { ...ESTADOS, Hecho: 'hecho' } } }, null)
    expect(salida).toContain('tracker.estados traduce "Hecho" a "hecho"')
    expect(code).not.toBe(0)
  })

  it('un perfil con solo jira pasa como antes, con jira_account_id', () => {
    const { code, salida } = correr(
      { jira: { project: 'XY', estados: { 'Por hacer': 'pending', 'En curso': 'in_progress' } } },
      [ficha('XY-1', { status: 'in_progress', assignee: { accountId: 'u1', displayName: 'u1' } })],
      { jira_account_id: 'u1' },
    )
    expect(code, salida).toBe(0)
    expect(salida).toContain('vienen del proyecto XY')
    expect(salida).not.toContain('/tracker-connect')
  })

  it('trello: una feature en vuelo con mas de un member falla', () => {
    const dos = [
      { accountId: 'm1', displayName: 'Ana' },
      { accountId: 'm2', displayName: 'Beto' },
    ]
    const { code, salida } = correr({ tracker: TRACKER }, [ficha('AB-1', { status: 'in_progress', assignee: dos })])
    expect(salida).toContain('AB-1 esta en vuelo con 2 members')
    expect(code).not.toBe(0)
  })

  it('trello: la identidad es trello_member_id y cuenta el cupo con ella', () => {
    const mia = { status: 'in_progress', zone: 'backend', assignee: { accountId: 'm1', displayName: 'Ana' } }
    const { code, salida } = correr({ tracker: TRACKER }, [ficha('AB-1', mia)])
    expect(code, salida).toBe(0)
    expect(salida).toContain('mis in_progress=1')
  })

  it('trello sin trello_member_id avisa con /tracker-connect', () => {
    const { code, salida } = correr({ tracker: TRACKER }, [ficha('AB-1')], { jira_account_id: 'u1' })
    expect(code, salida).toBe(0)
    expect(salida).toContain('trello_member_id')
    expect(salida).toContain('/tracker-connect')
  })

  it('una feature en vuelo sin member falla nombrando el tracker', () => {
    const { code, salida } = correr({ tracker: TRACKER }, [ficha('AB-1', { status: 'in_progress' })])
    expect(salida).toContain('sin assignee en el tracker: AB-1')
    expect(code).not.toBe(0)
  })

  it('el mismo id con prefijos distintos (historico y nuevo) convive sin error', () => {
    const { code, salida } = correr({ tracker: TRACKER }, [ficha('XY-32'), ficha('AB-32')])
    expect(code, salida).toBe(0)
    expect(salida).not.toContain('id duplicado')
  })

  it('la misma key dos veces sigue fallando como key duplicado', () => {
    const { code, salida } = correr({ tracker: TRACKER }, [ficha('XY-32'), ficha('XY-32', { name: 'otra' })])
    expect(salida).toContain('key duplicado: "XY-32"')
    expect(code).not.toBe(0)
  })

  it('dos fichas sin key con el mismo id siguen fallando como id duplicado', () => {
    const sinKey = (name: string) => ({ ...ficha('AB-7', { name }), key: undefined })
    const { code, salida } = correr({ tracker: TRACKER }, [sinKey('una'), sinKey('otra')])
    expect(salida).toContain('id duplicado: 7')
    expect(code).not.toBe(0)
  })

  it('depends_on numerico a un id compartido entre prefijos falla por ambiguo, no por inexistente', () => {
    const { code, salida } = correr({ tracker: TRACKER }, [
      ficha('XY-32'),
      ficha('AB-32'),
      ficha('AB-50', { depends_on: [32] }),
    ])
    expect(salida).toContain('AB-50 depende de 32, que es ambiguo (XY-32, AB-32): usa la key')
    expect(salida).not.toContain('que no existe')
    expect(code).not.toBe(0)
  })

  it('depends_on por key resuelve aunque el id este compartido', () => {
    const { code, salida } = correr({ tracker: TRACKER }, [
      ficha('XY-32'),
      ficha('AB-32'),
      ficha('AB-50', { depends_on: ['AB-32'] }),
    ])
    expect(code, salida).toBe(0)
  })

  it('una carpeta <id>-<slug> antigua no cuenta como spec de la ficha nueva con ese id ambiguo', () => {
    const enVuelo = { sdd: true, status: 'in_progress', assignee: { accountId: 'm1', displayName: 'Ana' } }
    const { code, salida } = correr(
      { tracker: TRACKER },
      [ficha('XY-32', { status: 'done' }), ficha('AB-32', enVuelo)],
      undefined,
      VALIDADOR,
      (raiz) => {
        mkdirSync(join(raiz, 'specs', '32-algo-viejo'), { recursive: true })
        writeFileSync(join(raiz, 'specs', '32-algo-viejo', 'requirements.md'), '# viejo')
      },
    )
    expect(salida).toContain('faltan specs para features sdd en vuelo: AB-32')
    expect(code).not.toBe(0)
  })
})

describe('guardia: tracker resuelto en check-perfil', () => {
  const ramas = { integracion: 'dev', produccion: 'main' }

  it('con tracker, exige tracker.prefijo aunque haya jira.project', () => {
    const { code, salida } = correr(
      { tracker: { tipo: 'trello', board: 'b1' }, jira: { project: 'XY' }, ramas },
      null,
      {},
      PERFIL,
    )
    expect(salida).toContain('no declara "tracker.prefijo"')
    expect(code).not.toBe(0)
  })

  it('sin tracker, sigue exigiendo jira.project', () => {
    const { code, salida } = correr({ ramas }, null, {}, PERFIL)
    expect(salida).toContain('no declara "jira.project"')
    expect(code).not.toBe(0)
  })
})
