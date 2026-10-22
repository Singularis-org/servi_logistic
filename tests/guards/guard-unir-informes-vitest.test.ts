// Guardia: la union de los informes de vitest de los shards del CI (`scripts/unir-informes-vitest.mjs`
// y `./init.sh --unir`) MUERDE en cada desenlace de fallo, no solo pasa en el verde.
//
// Existe porque el CI parte la suite en N shards y ningun shard da veredicto: el veredicto (baseline
// de rojos + «los tres proyectos corrieron» + «contradiccion») se aplica UNA vez sobre el informe
// unido (`docs/gate.md > En CI la suite va en shards`). Si la union tragara un shard ausente, un
// JSON roto o un archivo repetido, el check `gate-completo` daria verde sobre tests que no se sabe
// si corrieron. `docs/gate.md > Probar que muerde, no que pasa`: un fixture por desenlace.
//
// Vive en `tests/guards/` porque nadie importa un `.mjs` de `scripts/` ni un `.sh`: ningun grafo
// de imports la seleccionaria en modo rapido.
//
// No necesita base de datos ni red: todo son JSON en un directorio temporal.

import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const UNIR = join(RAIZ, 'scripts', 'unir-informes-vitest.mjs')

interface Suite {
  name: string
  status: 'passed' | 'failed'
}

const temporales: string[] = []
afterEach(() => {
  for (const d of temporales.splice(0)) rmSync(d, { recursive: true, force: true })
})

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'unir-informes-'))
  temporales.push(d)
  return d
}

/** Un informe de vitest minimo, con los contadores derivados de sus archivos. */
function informe(raiz: string, archivos: Array<[string, 'passed' | 'failed']>) {
  const testResults: Suite[] = archivos.map(([ruta, status]) => ({ name: join(raiz, ruta), status }))
  const rojos = archivos.filter(([, s]) => s === 'failed').length
  return {
    numTotalTestSuites: archivos.length,
    numPassedTestSuites: archivos.length - rojos,
    numFailedTestSuites: rojos,
    numTotalTests: archivos.length * 2,
    numPassedTests: (archivos.length - rojos) * 2,
    numFailedTests: rojos * 2,
    numPendingTests: 0,
    startTime: 1_000 + archivos.length,
    success: rojos === 0,
    testResults,
  }
}

/** Deja `<dir>/informe-shard-<i>/` con su `.vitest-rojos.json` y su `.vitest-codigo`. */
function shard(dir: string, i: number, contenido: unknown, codigo = '0') {
  const carpeta = join(dir, `informe-shard-${i}`)
  mkdirSync(carpeta, { recursive: true })
  writeFileSync(
    join(carpeta, '.vitest-rojos.json'),
    typeof contenido === 'string' ? contenido : JSON.stringify(contenido),
  )
  if (codigo !== '') writeFileSync(join(carpeta, '.vitest-codigo'), `${codigo}\n`)
}

/** Tres shards sanos que cubren los tres proyectos (ui, node, integration). */
function tresShardsSanos(raizNombres: string, dir: string, codigos = ['0', '0', '0']) {
  shard(dir, 1, informe(raizNombres, [['tests/unit/a.test.tsx', 'passed'], ['tests/unit/b.test.ts', 'passed']]), codigos[0])
  shard(dir, 2, informe(raizNombres, [['tests/integration/c.int.test.ts', 'passed']]), codigos[1])
  shard(dir, 3, informe(raizNombres, [['tests/guards/d.test.ts', 'passed']]), codigos[2])
}

function unir(dir: string, n: string, cwd = RAIZ) {
  const salida = join(tmp(), 'unido.json')
  const r = spawnSync(process.execPath, [UNIR, dir, n, '--out', salida], { cwd, encoding: 'utf8' })
  return { ...r, salida }
}

describe('scripts/unir-informes-vitest.mjs', () => {
  it('une tres shards: concatena archivos, suma contadores y devuelve el codigo maximo', () => {
    const dir = tmp()
    shard(dir, 1, informe(RAIZ, [['tests/unit/a.test.tsx', 'passed'], ['tests/unit/b.test.ts', 'failed']]), '1')
    shard(dir, 2, informe(RAIZ, [['tests/integration/c.int.test.ts', 'passed']]), '0')
    shard(dir, 3, informe(RAIZ, [['tests/guards/d.test.ts', 'passed']]), '0')

    const r = unir(dir, '3')

    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout.trim()).toBe('1')
    const unido = JSON.parse(readFileSync(r.salida, 'utf8'))
    expect(unido.testResults).toHaveLength(4)
    expect(unido.numTotalTestSuites).toBe(4)
    expect(unido.numFailedTestSuites).toBe(1)
    expect(unido.numTotalTests).toBe(8)
    expect(unido.numFailedTests).toBe(2)
    expect(unido.numPassedTests).toBe(6)
    expect(unido.startTime).toBe(1_001)
    expect(unido.success).toBe(false)
  })

  it('success es true solo si TODOS los shards salieron bien', () => {
    const dir = tmp()
    tresShardsSanos(RAIZ, dir)
    const r = unir(dir, '3')
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout.trim()).toBe('0')
    expect(JSON.parse(readFileSync(r.salida, 'utf8')).success).toBe(true)
  })

  it('un shard sin informe es ROJO, no «un shard menos»', () => {
    const dir = tmp()
    tresShardsSanos(RAIZ, dir)
    rmSync(join(dir, 'informe-shard-2'), { recursive: true })

    const r = unir(dir, '3')

    expect(r.status).toBe(1)
    expect(r.stderr).toContain('se esperaban 3 informes')
    expect(existsSync(r.salida)).toBe(false)
  })

  it('un informe que no es JSON es ROJO', () => {
    const dir = tmp()
    tresShardsSanos(RAIZ, dir)
    shard(dir, 3, '{ "testResults": [ roto')

    const r = unir(dir, '3')

    expect(r.status).toBe(1)
    expect(r.stderr).toContain('no se pudo leer como JSON')
  })

  it('un informe sin testResults es ROJO', () => {
    const dir = tmp()
    tresShardsSanos(RAIZ, dir)
    shard(dir, 3, { success: true })

    const r = unir(dir, '3')

    expect(r.status).toBe(1)
    expect(r.stderr).toContain('le falta la lista testResults')
  })

  it('el mismo archivo en dos shards es ROJO', () => {
    const dir = tmp()
    tresShardsSanos(RAIZ, dir)
    shard(dir, 3, informe(RAIZ, [['tests/unit/b.test.ts', 'passed']]))

    const r = unir(dir, '3')

    expect(r.status).toBe(1)
    expect(r.stderr).toContain('aparece en dos informes')
    expect(r.stderr).toContain('tests/unit/b.test.ts')
  })

  it('un shard sin .vitest-codigo es ROJO (sin el, la contradiccion no se detecta)', () => {
    const dir = tmp()
    tresShardsSanos(RAIZ, dir)
    rmSync(join(dir, 'informe-shard-1', '.vitest-codigo'))

    const r = unir(dir, '3')

    expect(r.status).toBe(1)
    expect(r.stderr).toContain('.vitest-codigo')
  })

  it('un N que no es entero positivo es ROJO', () => {
    const dir = tmp()
    tresShardsSanos(RAIZ, dir)
    expect(unir(dir, '0').status).toBe(1)
    expect(unir(dir, 'tres').status).toBe(1)
  })
})

// ------------------------------------------------------------------ ./init.sh --unir de punta a punta

/**
 * Bash de verdad: en Windows, `bash` a secas puede resolver al de WSL, que no entiende rutas
 * `C:\...`. Se usa el de Git for Windows, que es el que corre el gate aqui.
 */
function bash(): string {
  if (process.platform !== 'win32') return 'bash'
  const execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim()
  return join(execPath, '..', '..', '..', 'bin', 'bash.exe')
}

/**
 * Un repo de mentira con lo justo para `--unir`: `init.sh`, los dos scripts del veredicto y un
 * baseline VACIO. Asi el veredicto no depende del baseline real ni escribe en la raiz del repo.
 */
function repoDeMentira(): string {
  const raiz = tmp()
  mkdirSync(join(raiz, 'scripts'))
  mkdirSync(join(raiz, 'tests'))
  copyFileSync(join(RAIZ, 'init.sh'), join(raiz, 'init.sh'))
  for (const s of ['unir-informes-vitest.mjs', 'comparar-baseline-rojos.mjs']) {
    copyFileSync(join(RAIZ, 'scripts', s), join(raiz, 'scripts', s))
  }
  writeFileSync(join(raiz, 'tests', 'baseline-rojos.json'), JSON.stringify({ archivos: {} }))
  return raiz
}

function initUnir(raiz: string, dir: string) {
  // Sin GATE_SHARD ni GATE_PARTE: esta guardia corre DENTRO de un shard de CI, que exporta
  // `GATE_SHARD=i/N`, y heredarlo haria que `init.sh --unir` lo rechace (solo vale con
  // `--completo`). Paso en la primera corrida por shards, el 2026-10-07.
  const env = { ...process.env }
  delete env.GATE_SHARD
  delete env.GATE_PARTE
  const r = spawnSync(bash(), ['./init.sh', '--unir', dir, '3'], { cwd: raiz, encoding: 'utf8', env })
  return { status: r.status, salida: `${r.stdout}${r.stderr}` }
}

describe('./init.sh --unir aplica el veredicto UNA vez, sobre el informe unido', () => {
  it('tres shards sanos que cubren los tres proyectos: verde', () => {
    const raiz = repoDeMentira()
    const dir = join(raiz, 'informes')
    tresShardsSanos(raiz, dir)

    const r = initUnir(raiz, dir)

    expect(r.status, r.salida).toBe(0)
    expect(r.salida).toContain('los tres proyectos corrieron')
    expect(r.salida).toContain('init OK')
  })

  it('sin un solo archivo de tests/integration/ en el informe unido: ROJO (garantia 1)', () => {
    const raiz = repoDeMentira()
    const dir = join(raiz, 'informes')
    shard(dir, 1, informe(raiz, [['tests/unit/a.test.tsx', 'passed']]))
    shard(dir, 2, informe(raiz, [['tests/unit/b.test.ts', 'passed']]))
    shard(dir, 3, informe(raiz, [['tests/guards/d.test.ts', 'passed']]))

    const r = initUnir(raiz, dir)

    expect(r.status).toBe(1)
    expect(r.salida).toContain('NI UN archivo del proyecto: integration')
  })

  it('un shard salio distinto de cero y ningun informe trae rojos: ROJO (garantia 2)', () => {
    const raiz = repoDeMentira()
    const dir = join(raiz, 'informes')
    tresShardsSanos(raiz, dir, ['0', '1', '0'])

    const r = initUnir(raiz, dir)

    expect(r.status).toBe(1)
    expect(r.salida).toContain('contradiccion')
  })

  it('un rojo que no esta en el baseline: ROJO', () => {
    const raiz = repoDeMentira()
    const dir = join(raiz, 'informes')
    tresShardsSanos(raiz, dir)
    shard(dir, 3, informe(raiz, [['tests/guards/d.test.ts', 'failed']]), '1')

    const r = initUnir(raiz, dir)

    expect(r.status).toBe(1)
    expect(r.salida).toContain('rojos NUEVOS')
  })

  it('un shard sin informe: ROJO tambien desde init.sh', () => {
    const raiz = repoDeMentira()
    const dir = join(raiz, 'informes')
    tresShardsSanos(raiz, dir)
    rmSync(join(dir, 'informe-shard-3'), { recursive: true })

    const r = initUnir(raiz, dir)

    expect(r.status).toBe(1)
    expect(r.salida).toContain('no se pudieron unir')
  })
})
