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

// Un PR solo de `progress/` o `specs/` publica `gate-completo` (y `e2e`) en verde sin correr la suite
// (`docs/gate.md > El CI se genera`). Con `paths-ignore` el check requerido no se publicaba y la
// protección de `dev` dejó el #190 bloqueado. Se lee el texto del workflow (sin parser YAML: no es
// dependencia del proyecto) por bloques de indentación, que es como los escribe el arnés.
const WORKFLOWS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.github', 'workflows')
const SOLO_NO = "needs.cambios.outputs.solo_docs != 'true'"
const SOLO_SI = "needs.cambios.outputs.solo_docs == 'true'"
const AVISO = 'PR solo de estado/specs (progress/, specs/): sin suite'
// La clave, no la palabra: los comentarios del workflow explican por qué ya no está.
const conPathsIgnore = (yml: string) => /^\s*paths-ignore:/m.test(yml)

/** El bloque de un job: desde `  <job>:` hasta el siguiente job (o el final). */
function job(yml: string, nombre: string): string | null {
  const lineas = yml.replace(/\r\n/g, '\n').split('\n')
  const ini = lineas.findIndex((l) => l === `  ${nombre}:`)
  if (ini < 0 || !lineas.slice(0, ini).includes('jobs:')) return null
  let fin = ini + 1
  while (fin < lineas.length && !/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lineas[fin]) && !/^\S/.test(lineas[fin])) fin++
  return lineas.slice(ini, fin).join('\n')
}
/** Un campo del job (4 espacios), con sus líneas de continuación (`if: >-`). */
function campo(bloque: string, clave: string): string {
  const lineas = bloque.split('\n')
  const i = lineas.findIndex((l) => l.startsWith(`    ${clave}:`))
  if (i < 0) return ''
  let fin = i + 1
  while (fin < lineas.length && /^ {6,}\S/.test(lineas[fin])) fin++
  return lineas.slice(i, fin).join(' ')
}
/** Los pasos del job: el texto de cada `- name:` y su `if:` (8 espacios), si lo tiene. */
function pasos(bloque: string): { nombre: string; si: string }[] {
  return bloque.split(/\n(?= {6}- name: )/).slice(1).map((s) => ({
    nombre: s.split('\n')[0].replace(/^ {6}- name: /, ''),
    si: s.split('\n').find((l) => l.startsWith('        if: '))?.slice(12) ?? '',
  }))
}

/** Los problemas del workflow frente a la regla (lista vacía = la cumple). */
function problemasSoloDocs(yml: string, saltados: string[], veredictos: string[]): string[] {
  const p: string[] = []
  if (conPathsIgnore(yml)) p.push('vuelve paths-ignore: el check requerido no se publicaría')
  const cambios = job(yml, 'cambios')
  if (!cambios) p.push('falta el job cambios')
  else {
    if (!/solo_docs: \$\{\{ steps\.\w+\.outputs\.solo_docs \}\}/.test(cambios)) p.push('cambios no expone el output solo_docs')
    if (!/git diff --no-renames --name-only "origin\/\$BASE\.\.\.HEAD"/.test(cambios)) p.push('cambios no compara contra la base del PR')
    if (!cambios.includes("'^(progress|specs)/'")) p.push('cambios no filtra progress/ y specs/')
  }
  for (const n of saltados) {
    const b = job(yml, n)
    if (!b) { p.push(`falta el job ${n}`); continue }
    if (!/cambios/.test(campo(b, 'needs'))) p.push(`${n} no depende de cambios`)
    if (!campo(b, 'if').includes(SOLO_NO)) p.push(`${n} no se salta con solo_docs`)
  }
  for (const n of veredictos) {
    const b = job(yml, n)
    if (!b) { p.push(`falta el job ${n}`); continue }
    if (!/cambios/.test(campo(b, 'needs'))) p.push(`${n} no depende de cambios`)
    const ps = pasos(b)
    const aviso = ps.filter((x) => x.si === SOLO_SI)
    if (aviso.length !== 1 || !b.includes(AVISO) || !b.includes('$GITHUB_STEP_SUMMARY')) p.push(`${n} no escribe el aviso en el summary con solo_docs`)
    for (const x of ps) if (x.si !== SOLO_SI && !x.si.includes(SOLO_NO)) p.push(`${n}: el paso «${x.nombre}» corre con solo_docs`)
  }
  return p
}

const leerWf = (f: string) => readFileSync(join(WORKFLOWS, f), 'utf8').replace(/\r\n/g, '\n')
const GATE = { saltados: ['estatico', 'vitest', 'e2e-grupo'], veredictos: ['gate-completo', 'e2e'] }
const ARNES = { saltados: ['estatico', 'vitest'], veredictos: ['gate-completo', 'e2e'] }

/**
 * El gate.yml tiene dos formas. GENERADO (lleva la MARCA, como en la plantilla): solo llama a
 * arnes-gate.yml, donde vive la regla, así que se le exige no llevar `paths-ignore` y llamarlo. ESCRITO
 * A MANO (sin MARCA, como en servi_logistic): lleva sus propios jobs y se le exige la regla entera.
 */
function problemasGate(yml: string): string[] {
  if (!esGenerado(yml)) return problemasSoloDocs(yml, GATE.saltados, GATE.veredictos)
  const p: string[] = []
  if (conPathsIgnore(yml)) p.push('vuelve paths-ignore: el check requerido no se publicaría')
  if (!/^ {4}uses: \.\/\.github\/workflows\/arnes-gate\.yml\s*$/m.test(yml)) p.push('el gate.yml generado no llama a arnes-gate.yml')
  return p
}

const gateDelRepo = leerWf('gate.yml')
const gateAMano = !esGenerado(gateDelRepo)

describe('guardia: un PR solo de progress/ o specs/ publica gate-completo en verde', () => {
  it(`el gate.yml del repo (${gateAMano ? 'escrito a mano' : 'generado'}) cumple la regla`, () => {
    expect(problemasGate(gateDelRepo)).toEqual([])
  })

  it('el gate.yml que genera ci.mjs no lleva paths-ignore y llama a arnes-gate.yml', () => {
    expect(problemasGate(generarGate(base))).toEqual([])
    expect(problemasGate(generarGate({ ...base, ci: { e2e: false } }))).toEqual([])
  })

  it('arnes-gate.yml: job cambios, la suite se salta y los veredictos salen en verde con solo_docs', () => {
    expect(problemasSoloDocs(leerWf('arnes-gate.yml'), ARNES.saltados, ARNES.veredictos)).toEqual([])
  })

  // Contraprueba (docs/gate.md > Probar que muerde): cada mutación del texto real pone la guardia en rojo.
  it('contraprueba generado (ci.mjs en memoria): con paths-ignore → rojo', () => {
    const original = generarGate(base)
    const mutado = original.replace('  workflow_dispatch:', "    paths-ignore:\n      - 'specs/**'\n  workflow_dispatch:")
    expect(mutado).not.toBe(original)
    expect(problemasGate(mutado).join('\n')).toMatch(/paths-ignore/)
  })
  it('contraprueba generado (ci.mjs en memoria): sin llamar a arnes-gate.yml → rojo', () => {
    const original = generarGate(base)
    const mutado = original.replace('uses: ./.github/workflows/arnes-gate.yml', 'uses: ./.github/workflows/otro.yml')
    expect(mutado).not.toBe(original)
    expect(problemasGate(mutado).join('\n')).toMatch(/no llama a arnes-gate\.yml/)
  })

  const mutaciones: [string, (y: string) => string, RegExp][] = [
    ['vuelve paths-ignore', (y) => y.replace(/\n {2}(pull_request|workflow_call):\n/, (m) => `${m}    paths-ignore:\n      - 'progress/**'\n`), /paths-ignore/],
    ['sin job cambios', (y) => y.replace('\n  cambios:\n', '\n  cambiosx:\n'), /falta el job cambios/],
    ['estatico corre con solo_docs', (y) => y.replace(/(\n {2}estatico:[\s\S]*?) && needs\.cambios\.outputs\.solo_docs != 'true'/, '$1'), /estatico no se salta/],
    ['vitest corre con solo_docs', (y) => y.replace(/(\n {2}vitest:[\s\S]*?) && needs\.cambios\.outputs\.solo_docs != 'true'/, '$1'), /vitest no se salta/],
    ['gate-completo exige estatico con solo_docs', (y) => y.replace(/(\n {2}gate-completo:[\s\S]*?- name: El job estatico y los shards corrieron\n) {8}if: [^\n]*\n/, '$1'), /gate-completo: el paso «El job estatico/],
    ['gate-completo sin aviso', (y) => y.replace(/(\n {2}gate-completo:[\s\S]*?)PR solo de estado\/specs \(progress/, '$1PR (progress'), /gate-completo no escribe el aviso/],
    ['e2e sin cambios en needs', (y) => y.replace(/(\n {2}e2e:\n {4}name: e2e\n {4}needs: \[)cambios(, )?/, '$1').replace(/(\n {2}e2e:\n {4}name: e2e\n) {4}needs: \[\]\n/, '$1'), /e2e no depende de cambios/],
  ]
  const objetivos = [
    // El escrito a mano solo existe en un proyecto que lo tenga (servi_logistic); en la plantilla el
    // gate.yml es el generado y su contraprueba es la de arriba.
    { nombre: 'gate.yml a mano', aplica: gateAMano, texto: () => gateDelRepo, problemas: problemasGate },
    { nombre: 'arnes-gate.yml', aplica: true, texto: () => leerWf('arnes-gate.yml'), problemas: (y: string) => problemasSoloDocs(y, ARNES.saltados, ARNES.veredictos) },
  ]
  for (const o of objetivos) {
    for (const [nombre, mutar, espera] of mutaciones) {
      it.skipIf(!o.aplica)(`contraprueba ${o.nombre}: ${nombre} → rojo`, () => {
        const original = o.texto()
        const mutado = mutar(original)
        expect(mutado).not.toBe(original)
        expect(o.problemas(mutado).join('\n')).toMatch(espera)
      })
    }
  }
  it.skipIf(!gateAMano)('contraprueba gate.yml a mano: e2e-grupo corre con solo_docs → rojo', () => {
    const mutado = gateDelRepo.replace(/(\n {2}e2e-grupo:[\s\S]*?) && needs\.cambios\.outputs\.solo_docs != 'true'/, '$1')
    expect(mutado).not.toBe(gateDelRepo)
    expect(problemasGate(mutado).join('\n')).toMatch(/e2e-grupo no se salta/)
  })
  it('contraprueba: un generado que perdiera la MARCA se juzga entero → rojo', () => {
    expect(problemasGate(generarGate(base).replace(MARCA, '# a mano')).join('\n')).toMatch(/falta el job cambios/)
  })
})
