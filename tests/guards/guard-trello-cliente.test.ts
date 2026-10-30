// Guardia: el mapeo tarjeta de Trello -> ficha de `feature_list.json` de `scripts/trello.mjs`
// cumple `docs/trello.md > El contrato de campos`, sin red:
//   - labels `zone:`, `complexity:`, `slug:`, `sdd` y `epic:<KEY> <nombre>`, como en Jira;
//   - `depends_on` sale del checklist «Depende de»;
//   - el label `key:<KEY>` (features migradas de Jira) manda sobre `<prefijo>-<idShort>`;
//   - una key repetida o mal formada no se resuelve al azar ni tumba a las demas tarjetas;
//   - una lista sin traduccion en `tracker.estados` lanza: el estado nunca se adivina.
//
// Las funciones son puras y estan exportadas a proposito; la red (fetch) no se toca aqui.

import { describe, expect, it } from 'vitest'

import {
  coincide,
  fusionarConCopia,
  indexarPorKey,
  keyDeTarjeta,
  listaParaEstado,
  nombreConClave,
  partirLabels,
  planDeLabels,
  tarjetaAFicha,
  tituloSinClave,
} from '../../scripts/trello.mjs'
import { resolverTracker } from '../../scripts/tracker.mjs'

const ESTADOS = { Pendiente: 'pending', 'Spec en revisión': 'spec_ready', 'En curso': 'in_progress', Hecho: 'done' }
const LISTAS = new Map([
  ['l1', 'Pendiente'],
  ['l2', 'Spec en revisión'],
  ['l3', 'En curso'],
  ['l9', 'Ideas'],
])
const CTX = { prefijo: 'AB', estados: ESTADOS, listas: LISTAS }

const label = (name: string) => ({ id: `id-${name}`, name, color: null })

const tarjeta = (extra: Record<string, unknown> = {}) => ({
  id: 'c1',
  idShort: 7,
  name: 'Alta de clientes',
  desc: 'Pantalla de alta',
  idList: 'l3',
  labels: ['zone:backend', 'complexity:medium', 'slug:alta-de-clientes', 'sdd', 'epic:XY-17 Identidad y acceso'].map(label),
  members: [{ id: 'm1', fullName: 'Ana Pérez' }],
  idMembers: ['m1'],
  checklists: [
    { id: 'k0', name: 'Otro', checkItems: [{ name: 'no cuenta', pos: 1 }] },
    {
      id: 'k1',
      name: 'Depende de',
      checkItems: [
        { name: 'XY-12', pos: 2 },
        { name: 'AB-3', pos: 1 },
      ],
    },
  ],
  ...extra,
})

describe('guardia: cliente de Trello, tarjeta -> ficha', () => {
  it('mapea labels, lista, checklist y member como en el contrato de campos', () => {
    expect(tarjetaAFicha(tarjeta(), CTX)).toEqual({
      key: 'AB-7',
      id: 7,
      title: 'Alta de clientes',
      epic: 'XY-17',
      epic_name: 'Identidad y acceso',
      name: 'alta-de-clientes',
      description: 'Pantalla de alta',
      status: 'in_progress',
      sdd: true,
      complexity: 'medium',
      zone: 'backend',
      branch: 'feature/AB-7-alta-de-clientes',
      depends_on: ['AB-3', 'XY-12'],
      spec_path: 'specs/AB-7-alta-de-clientes',
      assignee: { accountId: 'm1', displayName: 'Ana Pérez' },
    })
  })

  it('el label key: manda sobre el idShort (features migradas de Jira)', () => {
    const f = tarjetaAFicha(tarjeta({ labels: [label('key:XY-131'), label('slug:prompts')] }), CTX)
    expect(f.key).toBe('XY-131')
    expect(f.id).toBe(131)
    expect(f.branch).toBe('feature/XY-131-prompts')
    expect(keyDeTarjeta(tarjeta({ labels: [] }), 'AB')).toBe('AB-7')
  })

  it('un label key: mal formado lanza', () => {
    expect(() => keyDeTarjeta(tarjeta({ labels: [label('key:xy131')] }), 'AB')).toThrow('PROYECTO-NUMERO')
  })

  it('indexarPorKey: una key mala va aparte y no impide encontrar las demas', () => {
    const buena = tarjeta({ id: 'c1', idShort: 1, labels: [] })
    const mala = tarjeta({ id: 'c2', idShort: 2, labels: [label('key:roto')] })
    const { porKey, malas, duplicadas } = indexarPorKey([mala, buena], 'AB')
    expect(porKey.get('AB-1')).toEqual([buena])
    expect(malas.map((m) => m.card.id)).toEqual(['c2'])
    expect(duplicadas).toEqual([])
  })

  it('indexarPorKey: dos tarjetas con la misma key salen como duplicada (migracion repetida)', () => {
    const a = tarjeta({ id: 'c1', idShort: 1, labels: [label('key:XY-9')] })
    const b = tarjeta({ id: 'c2', idShort: 2, labels: [label('key:XY-9')] })
    const { duplicadas } = indexarPorKey([a, b], 'AB')
    expect(duplicadas).toHaveLength(1)
    expect(duplicadas[0].key).toBe('XY-9')
    expect(duplicadas[0].cards.map((c: { id: string }) => c.id)).toEqual(['c1', 'c2'])
  })

  it('una lista sin traduccion en tracker.estados lanza nombrando la lista y la key', () => {
    expect(() => tarjetaAFicha(tarjeta({ idList: 'l9' }), CTX)).toThrow(/AB-7: la lista "Ideas" no esta en .*tracker\.estados/)
  })

  it('una lista que no es del board lanza', () => {
    expect(() => tarjetaAFicha(tarjeta({ idList: 'lx' }), CTX)).toThrow('lista desconocida')
  })

  it('sin checklist «Depende de», depends_on es []; sin labels, campos en null y sdd false', () => {
    const f = tarjetaAFicha(tarjeta({ labels: [], checklists: [] }), CTX)
    expect(f.depends_on).toEqual([])
    expect(f).toMatchObject({ zone: null, complexity: null, name: null, sdd: false, epic: null, epic_name: null, branch: null })
  })

  it('assignee: 0 members = null; mas de 1 = array (el validador lo rechaza en vuelo)', () => {
    expect(tarjetaAFicha(tarjeta({ members: [], idMembers: [] }), CTX).assignee).toBeNull()
    const dos = tarjetaAFicha(
      tarjeta({ members: [{ id: 'm1', fullName: 'Ana' }, { id: 'm2', fullName: 'Beto' }], idMembers: ['m1', 'm2'] }),
      CTX,
    ).assignee
    expect(dos).toEqual([
      { accountId: 'm1', displayName: 'Ana' },
      { accountId: 'm2', displayName: 'Beto' },
    ])
  })

  it('un label epic: sin nombre lanza', () => {
    expect(() => tarjetaAFicha(tarjeta({ labels: [label('epic:XY-17')] }), CTX)).toThrow('epic:<KEY> <nombre>')
  })

  it('F0 no degrada una in_progress ni borra zone/complexity evaluadas', () => {
    const nueva = { key: 'AB-7', status: 'spec_ready', zone: null, complexity: null }
    const antes = { key: 'AB-7', status: 'in_progress', zone: 'backend', complexity: 'low' }
    const { fichas, avisos } = fusionarConCopia([nueva], [antes])
    expect(fichas[0]).toMatchObject({ status: 'in_progress', zone: 'backend', complexity: 'low' })
    expect(avisos).toHaveLength(3)
  })

  it('title es el nombre de la tarjeta sin espacios sobrantes (docs/jira.md > Como se nombra una ficha)', () => {
    expect(tarjetaAFicha(tarjeta({ name: '  Alta de clientes \n' }), CTX).title).toBe('Alta de clientes')
  })

  // docs/trello.md > La key en el titulo
  it('tituloSinClave quita el prefijo `<KEY> · ` (propio o ajeno) y nada mas', () => {
    expect(tituloSinClave('SLT-51 · Zonas separadas de Tarifas')).toBe('Zonas separadas de Tarifas')
    expect(tituloSinClave('  AB-3 ·Otra ')).toBe('Otra')
    expect(tituloSinClave('Zona 3 - centro')).toBe('Zona 3 - centro')
    expect(tituloSinClave('SLT-51 sin separador')).toBe('SLT-51 sin separador')
    expect(tituloSinClave('Tarifas · SLT-51')).toBe('Tarifas · SLT-51')
    expect(tituloSinClave(undefined)).toBe('')
  })

  it('nombreConClave pone la key, corrige una equivocada y es idempotente', () => {
    expect(nombreConClave('SLT-51', 'Zonas')).toBe('SLT-51 · Zonas')
    expect(nombreConClave('SLT-51', 'SLT-50 · x')).toBe('SLT-51 · x')
    const una = nombreConClave('SLT-51', ' Zonas ')
    expect(nombreConClave('SLT-51', una)).toBe(una)
  })

  it('title va sin el prefijo `<KEY> · ` del nombre de la tarjeta', () => {
    expect(tarjetaAFicha(tarjeta({ name: 'AB-7 · Alta de clientes' }), CTX).title).toBe('Alta de clientes')
  })

  it('F0 conserva con aviso una in_progress cuya tarjeta ya no esta abierta; descarta las demas ausentes', () => {
    const nueva = { key: 'AB-1', status: 'pending' }
    const enVuelo = { key: 'AB-7', status: 'in_progress', title: 'Alta' }
    const pendienteBorrada = { key: 'AB-9', status: 'pending' }
    const { fichas, avisos } = fusionarConCopia([nueva], [enVuelo, pendienteBorrada])
    expect(fichas.map((f: { key: string }) => f.key)).toEqual(['AB-1', 'AB-7'])
    expect(fichas[1]).toEqual(enVuelo)
    expect(avisos).toEqual([
      'AB-7 sigue in_progress en disco pero su tarjeta ya no esta abierta en el board: restaurala o cierra la feature a mano',
    ])
  })

  it('listaParaEstado elige la lista del board que traduce a ese estado', () => {
    const listas = [
      { id: 'l1', name: 'Pendiente' },
      { id: 'l3', name: 'En curso' },
    ]
    expect(listaParaEstado('in_progress', ESTADOS, listas)).toEqual({ id: 'l3', name: 'En curso' })
    expect(listaParaEstado('cancelled', ESTADOS, listas)).toBeNull()
  })

  it('los labels se parten por |: una epica con coma queda entera', () => {
    expect(partirLabels('slug:a| zone:backend |epic:XY-17 Identidad, acceso')).toEqual([
      'slug:a',
      'zone:backend',
      'epic:XY-17 Identidad, acceso',
    ])
    expect(partirLabels(undefined)).toEqual([])
  })

  it('planDeLabels: un label de un solo valor reemplaza al anterior; los demas se suman', () => {
    const actuales = ['zone:backend', 'sdd', 'slug:a']
    expect(planDeLabels(actuales, ['zone:frontend', 'complexity:low'], [])).toEqual({
      quitar: ['zone:backend'],
      poner: ['zone:frontend', 'complexity:low'],
    })
    expect(planDeLabels(actuales, ['zone:backend'], ['sdd'])).toEqual({ quitar: ['sdd'], poner: [] })
  })

  it('buscar coincide en nombre y descripcion, sin mayusculas ni tildes', () => {
    expect(coincide({ name: 'Alta de Clientes', desc: '' }, 'clientes')).toBe(true)
    expect(coincide({ name: 'x', desc: 'Gestión de sesión' }, 'gestion')).toBe(true)
    expect(coincide({ name: 'x', desc: 'y' }, 'clientes')).toBe(false)
  })
})

describe('guardia: scripts/tracker.mjs resuelve el tracker en un solo sitio', () => {
  it('sin bloque tracker, el bloque jira equivale a tipo jira', () => {
    expect(resolverTracker({ jira: { project: 'XY', estados: { A: 'pending' } } })).toMatchObject({
      etiqueta: 'jira',
      tipo: 'jira',
      prefijo: 'XY',
      estados: { A: 'pending' },
    })
  })

  it('con bloque tracker, el bloque jira no se lee', () => {
    const t = resolverTracker({
      tracker: { tipo: 'trello', board: 'b', prefijo: 'AB', prefijos_historicos: ['XY'] },
      jira: { project: 'XY', estados: { A: 'pending' } },
    })
    expect(t).toMatchObject({ etiqueta: 'tracker', tipo: 'trello', prefijo: 'AB', historicos: ['XY'] })
    expect(t.estados).toBeUndefined()
  })
})
