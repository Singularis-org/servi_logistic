// Guardia: una key de ficha nunca va sola en lo que lee el humano (`CLAUDE.md` regla 9,
// `docs/jira.md > Cómo se nombra una ficha`). El hook Stop (`.claude/hooks/fin-de-turno.mjs`)
// anota debajo del último mensaje el título de cada key que nombra sin él. NO bloquea.
//
// Existe porque el 2026-11-07 el humano recibió «ya hice la tarea SL-50» sin saber qué tarea era.
// El 2026-11-10 pidió que dejara de bloquear: el hook corre cuando ya ve el mensaje, y el bloqueo
// se lo duplicaba entero.
//
// Un caso por desenlace (`docs/gate.md > Probar que muerde, no que pasa`): la key suelta deja la
// nota con su título; con título, en código, en una ruta o rama, o ajena al board, no; y el hook
// nunca devuelve `decision: block`.

import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { keysSinTitulo, notaDeTitulos, sinCodigo } from '../../scripts/nombres-de-fichas.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TITULOS = new Map([
  ['SL-50', 'Zonas separadas de Tarifas'],
  ['SL-51', 'Alta de tiendas'],
])
const BOARD = { titulos: TITULOS, prefijos: ['SL'] }

describe('guardia: keysSinTitulo', () => {
  it('una key suelta del board se detecta', () => {
    expect(keysSinTitulo('Ya terminé la SL-50 y paso a la siguiente.', BOARD)).toEqual(['SL-50'])
  })

  it('con su título como <key> «<title>» no se detecta', () => {
    expect(keysSinTitulo('Ya terminé SL-50 «Zonas separadas de Tarifas».', BOARD)).toEqual([])
  })

  it('se detecta cada key suelta una vez, aunque otra vaya bien', () => {
    const texto = 'SL-51 «Alta de tiendas» depende de SL-50; SL-50 sigue en curso.'
    expect(keysSinTitulo(texto, BOARD)).toEqual(['SL-50'])
  })

  it('con el título una vez, las siguientes menciones de esa key pueden ir solas', () => {
    const texto = 'Cerré SL-50 «Zonas separadas de Tarifas». La SL-50 ya está en dev.'
    expect(keysSinTitulo(texto, BOARD)).toEqual([])
  })

  it('el título que va en código no cuenta como mención con título', () => {
    expect(keysSinTitulo('Mira `SL-50 «Zonas separadas de Tarifas»`; la SL-50 ya está.', BOARD)).toEqual(['SL-50'])
  })

  it('en código, rutas y ramas no cuenta como mención', () => {
    const texto = [
      'Corre `./scripts/wt.sh new SL-50 zonas` y mira specs/SL-50-zonas/.',
      'La rama feature/SL-51-alta ya está publicada.',
      '```',
      'node scripts/archivos-en-vuelo.mjs --candidata SL-50',
      '```',
    ].join('\n')
    expect(keysSinTitulo(texto, BOARD)).toEqual([])
  })

  it('lo que no es del board (UTF-8, SHA-256, otro prefijo) no cuenta', () => {
    expect(keysSinTitulo('Guarda en UTF-8, firma con SHA-256 y mira QC-9.', BOARD)).toEqual([])
  })

  it('una key con el prefijo del tracker cuenta aunque no esté en la copia del board', () => {
    expect(keysSinTitulo('La SL-77 es nueva.', { prefijos: ['SL'] })).toEqual(['SL-77'])
  })

  it('la nota trae el título de la copia del board, o dice que no lo hay', () => {
    const nota = notaDeTitulos(['SL-50', 'SL-77'], TITULOS)
    expect(nota).toBe(
      'Fichas nombradas sin título (regla 9): SL-50 «Zonas separadas de Tarifas»; SL-77 (sin título en feature_list.json).',
    )
  })

  it('sinCodigo quita bloques y código en línea', () => {
    expect(sinCodigo('a `SL-1` b\n```\nSL-2\n```\nc')).not.toMatch(/SL-[12]/)
  })
})

// --- El hook de verdad, sobre un repo de mentira ------------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'guard-nombres-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

function repo(): string {
  const raiz = join(tmp, `repo-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(raiz, '.claude', 'hooks'), { recursive: true })
  mkdirSync(join(raiz, 'scripts'), { recursive: true })
  cpSync(join(RAIZ, '.claude', 'hooks', 'fin-de-turno.mjs'), join(raiz, '.claude', 'hooks', 'fin-de-turno.mjs'))
  for (const s of ['nombres-de-fichas.mjs', 'tracker.mjs']) cpSync(join(RAIZ, 'scripts', s), join(raiz, 'scripts', s))
  writeFileSync(join(raiz, 'arnes.config.json'), JSON.stringify({ tracker: { tipo: 'trello', prefijo: 'SL' } }))
  writeFileSync(
    join(raiz, 'feature_list.json'),
    JSON.stringify({ features: [{ key: 'SL-50', title: 'Zonas separadas de Tarifas' }] }),
  )
  return raiz
}

function hook(raiz: string, entrada: Record<string, unknown>) {
  const r = spawnSync(process.execPath, [join(raiz, '.claude', 'hooks', 'fin-de-turno.mjs')], {
    cwd: raiz,
    input: JSON.stringify(entrada),
    encoding: 'utf8',
  })
  return { status: r.status, salida: r.stdout.trim() ? JSON.parse(r.stdout) : {} }
}

describe('guardia: el hook Stop hace cumplir la regla', { timeout: 30_000 }, () => {
  it('con una key suelta NO bloquea: deja la nota con su título debajo del mensaje', () => {
    const r = hook(repo(), { last_assistant_message: 'Listo, ya hice la SL-50.', stop_hook_active: false })
    expect(r.status).toBe(0)
    expect(r.salida.decision).toBeUndefined()
    expect(r.salida.reason).toBeUndefined()
    expect(r.salida.systemMessage).toContain('SL-50 «Zonas separadas de Tarifas»')
  })

  it('si la key va con su título no deja nota', () => {
    const r = hook(repo(), { last_assistant_message: 'Listo SL-50 «Zonas separadas de Tarifas».', stop_hook_active: false })
    expect(r.salida.decision).toBeUndefined()
    expect(r.salida.systemMessage ?? '').not.toContain('regla 9')
  })

  it('sin entrada (stdin vacío) no bloquea ni falla', () => {
    const r = spawnSync(process.execPath, [join(repo(), '.claude', 'hooks', 'fin-de-turno.mjs')], { encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout).not.toContain('"block"')
  })
})
