// Guardia: el `.github/workflows/gate.yml` del proyecto se GENERA desde `arnes.config.json`
// (`docs/gate.md > El CI se genera`) y `./init.sh` falla si se desalinea.
//
// Existe porque el CI era un archivo copiado a mano en cada proyecto: cada mejora del CI del arnés
// había que volver a copiarla, y la copia se quedaba atrás en silencio. Ahora la mecánica viaja en
// `arnes-gate.yml` (del arnés) y el `gate.yml` es una llamada de unas 30 líneas que sale de `ramas`
// y `ci`. Un caso por desenlace (`docs/gate.md > Probar que muerde`).

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { CI_POR_DEFECTO, erroresCi, esGenerado, generarGate, MARCA } from '../../scripts/ci.mjs'

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts')
const base = { tracker: { tipo: 'jira', prefijo: 'AB' }, ramas: { integracion: 'dev', produccion: 'prod' } }

const tmp = mkdtempSync(join(tmpdir(), 'guard-ci-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))
let n = 0

/** Un proyecto con `arnes.config.json` y, opcionalmente, su gate.yml y el arnes-gate.yml. */
function proyecto(config: object, gate?: string, conArnesGate = true) {
  const raiz = join(tmp, `p${++n}`)
  mkdirSync(join(raiz, '.github', 'workflows'), { recursive: true })
  writeFileSync(join(raiz, 'arnes.config.json'), JSON.stringify(config))
  if (gate !== undefined) writeFileSync(join(raiz, '.github', 'workflows', 'gate.yml'), gate)
  if (conArnesGate) writeFileSync(join(raiz, '.github', 'workflows', 'arnes-gate.yml'), 'on: workflow_call\n')
  return raiz
}
const correr = (raiz: string, script: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd: raiz, encoding: 'utf8' })
  return { code: r.status, salida: `${r.stdout}${r.stderr}` }
}
const gateDe = (raiz: string) => readFileSync(join(raiz, '.github', 'workflows', 'gate.yml'), 'utf8')

describe('guardia: el gate.yml se genera desde arnes.config.json', { timeout: 30_000 }, () => {
  it('genera la llamada al workflow del arnés con las ramas y el bloque ci', () => {
    const yml = generarGate({ ...base, ci: { shards: 4, e2e: false } })
    expect(esGenerado(yml)).toBe(true)
    expect(yml.startsWith(MARCA)).toBe(true)
    expect(yml).toContain('branches: [dev, prod]')
    expect(yml).toContain('uses: ./.github/workflows/arnes-gate.yml')
    expect(yml).toContain('rama_produccion: prod')
    expect(yml).toContain('shards: 4')
    expect(yml).toContain("shards_lista: '[1,2,3,4]'")
    expect(yml).toContain('e2e: false')
    expect(yml).toContain(`postgres_image: ${CI_POR_DEFECTO.postgres_image}`)
    expect(yml).toContain('secrets: inherit')
  })

  it('rechaza un bloque ci o unas ramas que romperían el YAML o el workflow', () => {
    expect(erroresCi(base)).toEqual([])
    expect(erroresCi({ ramas: { integracion: 'dev' } }).join()).toMatch(/ramas/)
    expect(erroresCi({ ...base, ramas: { integracion: 'dev', produccion: 'a: b' } }).join()).toMatch(/ramas.produccion/)
    expect(erroresCi({ ...base, ci: { shards: 0 } }).join()).toMatch(/shards/)
    expect(erroresCi({ ...base, ci: { shards: 2.5 } }).join()).toMatch(/shards/)
    expect(erroresCi({ ...base, ci: { node_version: 'lts' } }).join()).toMatch(/node_version/)
    expect(erroresCi({ ...base, ci: { navegadores: 'chromium,webkit' } }).join()).toMatch(/navegadores/)
    expect(erroresCi({ ...base, ci: { e2e: 'si' } }).join()).toMatch(/e2e/)
    expect(erroresCi({ ...base, ci: { postgres_image: 'postgres 17' } }).join()).toMatch(/postgres_image/)
    expect(() => generarGate({ ...base, ci: { shards: 0 } })).toThrow(/shards/)
  })

  it('generar crea el archivo y comprobar lo da por bueno; tras cambiar ramas, comprobar falla', () => {
    const raiz = proyecto(base)
    expect(correr(raiz, 'ci.mjs', 'generar').code).toBe(0)
    expect(gateDe(raiz)).toBe(generarGate(base))
    expect(correr(raiz, 'ci.mjs', 'comprobar').code).toBe(0)
    writeFileSync(join(raiz, 'arnes.config.json'), JSON.stringify({ ...base, ramas: { integracion: 'dev', produccion: 'main' } }))
    expect(correr(raiz, 'ci.mjs', 'comprobar').code).toBe(1)
  })

  it('generar --si-procede (lo que corre el sync) nunca pisa un gate.yml escrito a mano', () => {
    const raiz = proyecto(base, 'name: gate\n# a mano\n')
    const r = correr(raiz, 'ci.mjs', 'generar', '--si-procede')
    expect(r.code).toBe(0)
    expect(gateDe(raiz)).toBe('name: gate\n# a mano\n')
    expect(correr(raiz, 'ci.mjs', 'generar').code).toBe(0)
    expect(esGenerado(gateDe(raiz))).toBe(true)
  })

  it('check-perfil: pasa con el generado al día (también con CRLF)', () => {
    const r = correr(proyecto(base, generarGate(base).replace(/\n/g, '\r\n')), 'check-perfil.mjs')
    expect(r.salida).not.toMatch(/no esta al dia/)
    expect(r.code).toBe(0)
  })

  it('check-perfil: falla si el generado no está al día con arnes.config.json', () => {
    const r = correr(proyecto(base, generarGate({ ...base, ci: { shards: 2 } })), 'check-perfil.mjs')
    expect(r.code).toBe(1)
    expect(r.salida).toMatch(/no esta al dia.*node scripts\/ci\.mjs generar/)
  })

  it('check-perfil: falla si falta arnes-gate.yml, al que llama el generado', () => {
    const r = correr(proyecto(base, generarGate(base), false), 'check-perfil.mjs')
    expect(r.code).toBe(1)
    expect(r.salida).toMatch(/arnes-gate\.yml, que no existe/)
  })

  it('check-perfil: falla si el bloque ci está mal', () => {
    const r = correr(proyecto({ ...base, ci: { shards: 'tres' } }, generarGate(base)), 'check-perfil.mjs')
    expect(r.code).toBe(1)
    expect(r.salida).toMatch(/ci\.shards/)
  })

  it('check-perfil: con uno escrito a mano avisa de pasarlo al generado y sigue mirando sus ramas', () => {
    const aMano = 'name: gate\non:\n  pull_request:\n    branches: [dev, prod]\n'
    const bien = correr(proyecto(base, aMano), 'check-perfil.mjs')
    expect(bien.code).toBe(0)
    expect(bien.salida).toMatch(/escrito a mano/)
    const mal = correr(proyecto(base, aMano.replace('prod', 'main')), 'check-perfil.mjs')
    expect(mal.code).toBe(1)
    expect(mal.salida).toMatch(/no escucha PRs a prod/)
  })
})
