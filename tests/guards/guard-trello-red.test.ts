// Guardia: los subcomandos de `scripts/trello.mjs` hablan con la API de Trello como dice
// `docs/trello.md`, contra un `fetch` simulado (sin red):
//   - las credenciales viajan en la cabecera `Authorization`, nunca en la URL ni en un error;
//   - un 429 se reintenta respetando `Retry-After`, o con espera creciente, y se rinde tras
//     `INTENTOS`; cualquier otro error no se reintenta;
//   - `importar`, `tomar`, `mover`, `editar`, `crear` y `aprobacion` hacen las llamadas del
//     contrato, y se niegan donde el contrato dice que se nieguen.
//
// El board falso guarda estado (members, labels, lista) para que `tomar` y `editar` se puedan
// comprobar por su efecto, no solo por las llamadas.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { crearCliente, ejecutar, esperaTras429, INTENTOS, SalidaError } from '../../scripts/trello.mjs'

const ENV = { TRELLO_KEY: 'clave-secreta', TRELLO_TOKEN: 'token-secreto' }

const ESTADOS = { Pendiente: 'pending', Spec: 'spec_ready', 'En curso': 'in_progress', Hecho: 'done' }
const LISTAS = [
  { id: 'l1', name: 'Pendiente', closed: false },
  { id: 'l2', name: 'Spec', closed: false },
  { id: 'l3', name: 'En curso', closed: false },
  { id: 'l4', name: 'Hecho', closed: false },
]

interface Llamada {
  metodo: string
  ruta: string
  query: Record<string, string>
  cuerpo: unknown
  url: string
  auth: string
}

interface Tarjeta {
  id: string
  idShort: number
  name: string
  desc: string
  idList: string
  closed: boolean
  labels: { id: string; name: string }[]
  idMembers: string[]
  members?: { id: string; fullName: string }[]
  checklists: unknown[]
}

const tarjeta = (extra: Partial<Tarjeta> = {}): Tarjeta => ({
  id: 'c1',
  idShort: 7,
  name: 'Alta de clientes',
  desc: '',
  idList: 'l1',
  closed: false,
  labels: [{ id: 'lb-slug', name: 'slug:alta' }],
  idMembers: [],
  checklists: [],
  ...extra,
})

/** Respuesta minima con la forma que usa el cliente: status, ok, headers.get, text. */
function respuesta(status: number, cuerpo: unknown, cabeceras: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (n: string) => cabeceras[n.toLowerCase()] ?? null },
    text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
  }
}

/**
 * Board falso. `antes` deja meter respuestas forzadas (429, 401) delante de las normales.
 * `trasAsignar` simula a otra persona que se asigna la tarjeta a la vez. `post429` hace que el
 * primer POST reciba un 429 con `Retry-After: 1`.
 */
function boardFalso(
  cards: Tarjeta[],
  opciones: {
    antes?: ReturnType<typeof respuesta>[]
    labels?: { id: string; name: string }[]
    acciones?: unknown[]
    trasAsignar?: string
    post429?: boolean
  } = {},
) {
  const llamadas: Llamada[] = []
  const forzadas = [...(opciones.antes ?? [])]
  const labelsBoard = [...(opciones.labels ?? [])]
  let creadas = 0
  let post429 = opciones.post429 ?? false

  const fetch = async (url: URL, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const ruta = url.pathname.replace(/^\/1/, '')
    const query = Object.fromEntries(url.searchParams)
    const cuerpo = init.body ? JSON.parse(init.body) : undefined
    llamadas.push({ metodo: init.method, ruta, query, cuerpo, url: url.href, auth: init.headers.Authorization })
    const forzada = forzadas.shift()
    if (forzada) return forzada
    if (post429 && init.method === 'POST') {
      post429 = false
      return respuesta(429, '', { 'retry-after': '1' })
    }

    const porId = (id: string) => cards.find((c) => c.id === id)
    const k = `${init.method} ${ruta}`
    let m: RegExpExecArray | null
    if (k === 'GET /boards/b1/lists') return respuesta(200, LISTAS)
    if (k === 'GET /boards/b1/cards') return respuesta(200, cards.filter((c) => !c.closed))
    if (k === 'GET /boards/b1/cards/all') return respuesta(200, cards)
    if (k === 'GET /boards/b1/labels') return respuesta(200, labelsBoard)
    // `b1` es un id corto: POST /labels necesita el largo y el cliente lo pide al board.
    if (k === 'GET /boards/b1') return respuesta(200, { id: 'a'.repeat(24) })
    if (k === 'GET /members/me') return respuesta(200, { id: 'm1', fullName: 'Ana', username: 'ana' })
    if (k === 'POST /labels') {
      // La API real responde 400 "Invalid id" con el id corto del board.
      if ((cuerpo as { idBoard: string }).idBoard !== 'a'.repeat(24)) return respuesta(400, '{"message":"Invalid id"}')
      const l ={ id: `lb-${labelsBoard.length + 1}`, name: (cuerpo as { name: string }).name }
      labelsBoard.push(l)
      return respuesta(200, l)
    }
    if (k === 'POST /cards') {
      creadas++
      return respuesta(200, { id: `nueva-${creadas}`, idShort: 100 + creadas })
    }
    if ((m = /^GET \/cards\/([^/]+)$/.exec(k))) return respuesta(200, { idMembers: porId(m[1])!.idMembers })
    if ((m = /^POST \/cards\/([^/]+)\/idMembers$/.exec(k))) {
      const c = porId(m[1])!
      c.idMembers.push(query.value)
      if (opciones.trasAsignar) c.idMembers.push(opciones.trasAsignar)
      return respuesta(200, c.idMembers)
    }
    if ((m = /^DELETE \/cards\/([^/]+)\/idLabels\/([^/]+)$/.exec(k))) {
      const c = porId(m[1])!
      c.labels = c.labels.filter((l) => l.id !== m![2])
      return respuesta(200, {})
    }
    if ((m = /^POST \/cards\/([^/]+)\/idLabels$/.exec(k))) {
      const c = porId(m[1])!
      c.labels.push(labelsBoard.find((l) => l.id === query.value)!)
      return respuesta(200, {})
    }
    if ((m = /^PUT \/cards\/([^/]+)$/.exec(k))) {
      Object.assign(porId(m[1])!, cuerpo)
      return respuesta(200, {})
    }
    if (/^GET \/cards\/[^/]+\/actions$/.test(k)) return respuesta(200, opciones.acciones ?? [])
    if (/^POST \/cards\/[^/]+\/checklists$/.test(k)) return respuesta(200, { id: 'cl1' })
    if (k === 'POST /checklists/cl1/checkItems') return respuesta(200, { id: 'ci' })
    return respuesta(404, `ruta no simulada: ${k}`)
  }
  return { fetch, llamadas, cards }
}

let temporal: string | null = null

afterEach(() => {
  if (temporal) rmSync(temporal, { recursive: true, force: true })
  temporal = null
})

/** Raiz temporal con perfil de Trello e identidad `m1`, y un cliente que no duerme de verdad. */
function cliente(board: ReturnType<typeof boardFalso>, { env = ENV, previa }: { env?: Record<string, string>; previa?: unknown } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'guard-trello-red-'))
  temporal = raiz
  const rutaConfig = join(raiz, 'arnes.config.json')
  writeFileSync(rutaConfig, JSON.stringify({ tracker: { tipo: 'trello', board: 'b1', prefijo: 'AB', estados: ESTADOS } }))
  writeFileSync(join(raiz, '.arnes.local.json'), JSON.stringify({ trello_member_id: 'm1' }))
  if (previa) writeFileSync(join(raiz, 'feature_list.json'), JSON.stringify(previa))
  const esperas: number[] = []
  const salida: string[] = []
  const c = crearCliente({
    raiz,
    rutaConfig,
    fetch: board.fetch as unknown as typeof fetch,
    esperar: async (ms: number) => {
      esperas.push(ms)
    },
    env: env as NodeJS.ProcessEnv, // el default de `crearCliente` es `process.env`: tsc infiere ProcessEnv
    log: (s: string) => salida.push(s),
  })
  return { c, raiz, esperas, salida }
}

describe('guardia: cliente de Trello contra fetch simulado — credenciales y 429', () => {
  it('las credenciales van en Authorization y nunca en la URL', async () => {
    const board = boardFalso([])
    const { c, salida } = cliente(board)
    await c.yo()
    expect(salida).toEqual(['{"id":"m1","fullName":"Ana","username":"ana"}'])
    const [ll] = board.llamadas
    expect(ll.auth).toBe('OAuth oauth_consumer_key="clave-secreta", oauth_token="token-secreto"')
    expect(ll.url).not.toContain('clave-secreta')
    expect(ll.url).not.toContain('token-secreto')
  })

  it('sin credenciales sale con codigo 1 y no llama a la red', async () => {
    const board = boardFalso([])
    const { c } = cliente(board, { env: {} })
    await expect(c.yo()).rejects.toMatchObject({ codigo: 1, message: expect.stringContaining('faltan TRELLO_KEY') })
    expect(board.llamadas).toHaveLength(0)
  })

  it('un 429 con Retry-After espera esos segundos y reintenta la misma peticion', async () => {
    const board = boardFalso([], { antes: [respuesta(429, 'rate limit', { 'retry-after': '2' })] })
    const { c, esperas, salida } = cliente(board)
    await c.yo()
    expect(esperas).toEqual([2000])
    expect(board.llamadas.map((l) => `${l.metodo} ${l.ruta}`)).toEqual(['GET /members/me', 'GET /members/me'])
    expect(salida).toHaveLength(1)
  })

  it('un 429 sin Retry-After espera 1 s, 2 s, 4 s...', async () => {
    const board = boardFalso([], { antes: [respuesta(429, ''), respuesta(429, ''), respuesta(429, '')] })
    const { c, esperas } = cliente(board)
    await c.yo()
    expect(esperas).toEqual([1000, 2000, 4000])
  })

  it(`se rinde tras ${INTENTOS} intentos con un error que nombra el 429 y no filtra el token`, async () => {
    const board = boardFalso([], { antes: Array.from({ length: INTENTOS }, () => respuesta(429, 'rate limit')) })
    const { c, esperas } = cliente(board)
    const err = await c.yo().catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain(`429 tras ${INTENTOS} intentos`)
    expect((err as Error).message).not.toContain('token-secreto')
    expect(esperas).toHaveLength(INTENTOS - 1)
    expect(board.llamadas).toHaveLength(INTENTOS)
  })

  it('un 401 no se reintenta', async () => {
    const board = boardFalso([], { antes: [respuesta(401, 'invalid token')] })
    const { c, esperas } = cliente(board)
    await expect(c.yo()).rejects.toThrow('GET /members/me -> 401: invalid token')
    expect(esperas).toEqual([])
    expect(board.llamadas).toHaveLength(1)
  })

  it('un POST que recibe 429 se reintenta (429 = rechazada, no ejecutada)', async () => {
    const board = boardFalso([tarjeta()], { post429: true })
    const { c, esperas } = cliente(board)
    await c.tomar('AB-7')
    expect(esperas).toEqual([1000])
    expect(board.llamadas.filter((l) => l.metodo === 'POST')).toHaveLength(2)
    expect(board.cards[0].idMembers).toEqual(['m1'])
  })

  it('esperaTras429 acepta fecha HTTP y nunca pasa de 60 s', () => {
    const ahora = Date.parse('2026-10-18T10:00:00Z')
    expect(esperaTras429('Sun, 18 Oct 2026 10:00:05 GMT', 1, ahora)).toBe(5000)
    expect(esperaTras429('3600', 1, ahora)).toBe(60_000)
    expect(esperaTras429(null, 10, ahora)).toBe(60_000)
  })
})

describe('guardia: cliente de Trello contra fetch simulado — subcomandos', () => {
  it('importar escribe feature_list.json y respeta la copia anterior (in_progress no se degrada)', async () => {
    const board = boardFalso([
      tarjeta({ id: 'c1', idShort: 7, idList: 'l2', members: [{ id: 'm1', fullName: 'Ana' }], idMembers: ['m1'] }),
      tarjeta({ id: 'c2', idShort: 3, labels: [{ id: 'x', name: 'slug:otra' }] }),
      tarjeta({ id: 'c3', idShort: 9, closed: true }),
    ])
    const previa = { features: [{ key: 'AB-7', status: 'in_progress', zone: 'backend' }] }
    const { c, raiz, salida } = cliente(board, { previa })
    await c.importar()
    const { features } = JSON.parse(readFileSync(join(raiz, 'feature_list.json'), 'utf8'))
    expect(features.map((f: { key: string }) => f.key)).toEqual(['AB-3', 'AB-7'])
    expect(features[1]).toMatchObject({ status: 'in_progress', zone: 'backend', assignee: { accountId: 'm1', displayName: 'Ana' } })
    expect(salida[0]).toContain('2 fichas importadas')
    expect(salida.some((s) => s.startsWith('AVISO: AB-7 sigue in_progress'))).toBe(true)
  })

  it('importar se detiene con dos tarjetas abiertas que comparten key', async () => {
    const dup = [{ id: 'k', name: 'key:XY-5' }]
    const board = boardFalso([tarjeta({ id: 'c1', labels: dup }), tarjeta({ id: 'c2', idShort: 8, labels: dup })])
    const { c, raiz } = cliente(board)
    await expect(c.importar()).rejects.toThrow('keys repetidas en el board: XY-5 (2 tarjetas)')
    expect(() => readFileSync(join(raiz, 'feature_list.json'))).toThrow()
  })

  it('tomar: tarjeta libre -> te asigna con value=<tu member> y relee', async () => {
    const board = boardFalso([tarjeta()])
    const { c, salida } = cliente(board)
    await c.tomar('AB-7')
    const post = board.llamadas.find((l) => l.metodo === 'POST')!
    expect(post.ruta).toBe('/cards/c1/idMembers')
    expect(post.query).toEqual({ value: 'm1' })
    expect(board.llamadas.at(-1)).toMatchObject({ metodo: 'GET', ruta: '/cards/c1' })
    expect(salida[0]).toContain('AB-7 es tuya')
  })

  it('tomar: con otro member sale con codigo 3 y no escribe nada', async () => {
    const board = boardFalso([tarjeta({ idMembers: ['m2'] })])
    const { c } = cliente(board)
    await expect(c.tomar('AB-7')).rejects.toMatchObject({ codigo: 3 })
    expect(board.llamadas.some((l) => l.metodo !== 'GET')).toBe(false)
  })

  it('tomar: si otra persona se asigna a la vez, sale con codigo 3', async () => {
    const board = boardFalso([tarjeta()], { trasAsignar: 'm2' })
    const { c } = cliente(board)
    await expect(c.tomar('AB-7')).rejects.toMatchObject({ codigo: 3, message: expect.stringContaining('alguien la tomo a la vez') })
  })

  it('mover pone idList de la lista que traduce a ese estado', async () => {
    const board = boardFalso([tarjeta()])
    const { c } = cliente(board)
    await c.mover('AB-7', 'spec_ready')
    expect(board.llamadas.at(-1)).toMatchObject({ metodo: 'PUT', ruta: '/cards/c1', cuerpo: { idList: 'l2' } })
    expect(board.cards[0].idList).toBe('l2')
  })

  it('mover a in_progress desde spec_ready sale con codigo 4 y no mueve: la aprobacion F1.4 es del humano', async () => {
    const board = boardFalso([tarjeta({ idList: 'l2' })])
    const { c } = cliente(board)
    await expect(c.mover('AB-7', 'in_progress')).rejects.toMatchObject({
      codigo: 4,
      message: expect.stringContaining('la aprobacion F1.4 la hace el humano moviendo la tarjeta en Trello'),
    })
    expect(board.llamadas.some((l) => l.metodo !== 'GET')).toBe(false)
    expect(board.cards[0].idList).toBe('l2')
  })

  it('mover a in_progress desde pending si mueve (features sin sdd)', async () => {
    const board = boardFalso([tarjeta({ idList: 'l1' })])
    const { c } = cliente(board)
    await c.mover('AB-7', 'in_progress')
    expect(board.cards[0].idList).toBe('l3')
  })

  it('importar conserva con aviso una in_progress cuya tarjeta se archivo, escribe title y no deja el .tmp', async () => {
    const board = boardFalso([
      tarjeta({ id: 'c1', idShort: 7, name: ' Alta de clientes ' }),
      tarjeta({ id: 'c2', idShort: 9, closed: true }),
    ])
    const previa = {
      features: [
        { key: 'AB-9', status: 'in_progress', title: 'Archivada en vuelo' },
        { key: 'AB-5', status: 'pending', title: 'Borrada sin empezar' },
      ],
    }
    const { c, raiz, salida } = cliente(board, { previa })
    await c.importar()
    const { features } = JSON.parse(readFileSync(join(raiz, 'feature_list.json'), 'utf8'))
    expect(features.map((f: { key: string }) => f.key)).toEqual(['AB-7', 'AB-9'])
    expect(features[0].title).toBe('Alta de clientes')
    expect(features[1]).toEqual(previa.features[0])
    expect(salida).toContain(
      'AVISO: AB-9 sigue in_progress en disco pero su tarjeta ya no esta abierta en el board: restaurala o cierra la feature a mano',
    )
    expect(existsSync(join(raiz, 'feature_list.json.tmp'))).toBe(false)
  })

  it('editar reemplaza el zone: anterior y crea el label que falta en el board', async () => {
    const board = boardFalso([tarjeta({ labels: [{ id: 'z1', name: 'zone:backend' }, { id: 's1', name: 'slug:alta' }] })])
    const { c, salida } = cliente(board)
    await c.editar('AB-7', { '--labels-mas': 'zone:frontend|complexity:low' })
    expect(board.cards[0].labels.map((l) => l.name).sort()).toEqual(['complexity:low', 'slug:alta', 'zone:frontend'])
    expect(board.llamadas.filter((l) => l.metodo === 'POST' && l.ruta === '/labels')).toHaveLength(2)
    expect(salida[0]).toBe('AB-7: +zone:frontend, +complexity:low, -zone:backend')
  })

  it('crear --key se niega si la key ya existe, aunque la tarjeta este archivada', async () => {
    const board = boardFalso([tarjeta({ closed: true, labels: [{ id: 'k', name: 'key:XY-131' }] })])
    const { c } = cliente(board)
    await expect(c.crear({ '--nombre': 'Prompts', '--key': 'XY-131' })).rejects.toThrow('XY-131 ya existe en el board')
    expect(board.llamadas.some((l) => l.ruta === '/cards' && l.metodo === 'POST')).toBe(false)
  })

  it('crear: labels con |, key migrada y checklist «Depende de»', async () => {
    const board = boardFalso([])
    const { c, salida } = cliente(board)
    await c.crear({ '--nombre': 'Prompts', '--key': 'XY-131', '--labels': 'slug:prompts|epic:XY-17 Identidad, acceso', '--depende': 'XY-1,XY-2' })
    const nombresLabels = board.llamadas.filter((l) => l.ruta === '/labels').map((l) => (l.cuerpo as { name: string }).name)
    expect(nombresLabels).toEqual(['slug:prompts', 'epic:XY-17 Identidad, acceso', 'key:XY-131'])
    const card = board.llamadas.find((l) => l.ruta === '/cards' && l.metodo === 'POST')!
    expect(card.cuerpo).toMatchObject({ idList: 'l1', name: 'Prompts' })
    expect(board.llamadas.filter((l) => /\/checkItems$/.test(l.ruta)).map((l) => (l.cuerpo as { name: string }).name)).toEqual(['XY-1', 'XY-2'])
    expect(salida[0]).toBe('XY-131 creada en Pendiente')
  })

  it('aprobacion elige el ultimo movimiento de spec_ready a in_progress', async () => {
    const mov = (date: string, antes: string, despues: string, quien: string) => ({
      date,
      idMemberCreator: quien,
      memberCreator: { fullName: quien.toUpperCase() },
      data: { listBefore: { name: antes }, listAfter: { name: despues } },
    })
    const acciones = [
      mov('2026-10-10T00:00:00Z', 'Spec', 'En curso', 'm2'),
      mov('2026-10-12T00:00:00Z', 'En curso', 'Spec', 'm1'),
      mov('2026-10-14T00:00:00Z', 'Spec', 'En curso', 'm3'),
    ]
    const board = boardFalso([tarjeta()], { acciones })
    const { c, salida } = cliente(board)
    await c.aprobacion('AB-7')
    expect(salida[0]).toBe('AB-7: aprobada por M3 (m3) el 2026-10-14T00:00:00Z')
  })

  it('aprobacion sin movimiento sale con codigo 1', async () => {
    const board = boardFalso([tarjeta()], { acciones: [] })
    const { c } = cliente(board)
    await expect(c.aprobacion('AB-7')).rejects.toMatchObject({ codigo: 1 })
  })

  it('ejecutar: un subcomando por key sin key valida sale con codigo 2 sin tocar la red', async () => {
    const board = boardFalso([])
    const { c } = cliente(board)
    const err = await ejecutar(['tomar', 'ab-7'], c).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SalidaError)
    expect((err as SalidaError).codigo).toBe(2)
    expect(board.llamadas).toHaveLength(0)
  })
})
