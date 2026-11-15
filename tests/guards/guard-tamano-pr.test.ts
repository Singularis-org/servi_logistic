// Guardia: el tamano del PR (`scripts/tamano-pr.mjs`, `docs/gate.md > Tamaño del PR`) se mide
// bien, avisa al 80%, falla por encima del maximo y solo la aceptacion humana escrita lo convierte
// en aviso. No cuentan specs/, progress/, lockfiles, snapshots ni lo que excluya el perfil.
//
// Existe porque en el proyecto de origen (2026-11-07) los PRs de feature tocaban entre 50 y 160
// archivos y la regla de PRs pequenos era un consejo que nadie medía. Un caso por desenlace
// (`docs/gate.md > Probar que muerde, no que pasa`).

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { limites, medir, veredicto } from '../../scripts/tamano-pr.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'tamano-pr.mjs')

describe('guardia: tamano del PR, funciones puras', () => {
  const l = { max_archivos: 10, max_lineas: 100 }

  it('no cuentan specs, progress, lockfiles ni snapshots, ni lo excluido por el perfil', () => {
    const { excluir } = limites({ gate: { tamano_pr: { excluir: ['lib/generated/**'] } } })
    const m = medir(
      [
        { ruta: 'lib/a.ts', lineas: 10 },
        { ruta: 'specs/AB-1-x/requirements.md', lineas: 500 },
        { ruta: 'progress/features/AB-1.md', lineas: 50 },
        { ruta: 'pnpm-lock.yaml', lineas: 900 },
        { ruta: 'tests/__snapshots__/a.snap', lineas: 300 },
        { ruta: 'lib/generated/client.ts', lineas: 4000 },
      ],
      excluir,
    )
    expect(m).toMatchObject({ archivos: 1, lineas: 10 })
  })

  it('por debajo del 80%: ok', () => {
    expect(veredicto({ archivos: 3, lineas: 30 }, l).nivel).toBe('ok')
  })

  it('al 80% de archivos o de lineas: aviso', () => {
    expect(veredicto({ archivos: 8, lineas: 10 }, l).nivel).toBe('aviso')
    expect(veredicto({ archivos: 1, lineas: 85 }, l).nivel).toBe('aviso')
  })

  it('por encima: error que dice como partir y como aceptarlo', () => {
    const v = veredicto({ archivos: 11, lineas: 10 }, l)
    expect(v.nivel).toBe('error')
    expect(v.texto).toContain('Partir una feature')
    expect(v.texto).toContain('tamano-pr-aceptado')
  })

  it('por encima con aceptacion humana: aviso que cita el motivo', () => {
    const v = veredicto({ archivos: 11, lineas: 10 }, l, '2026-11-07 · migracion mecanica')
    expect(v.nivel).toBe('aviso')
    expect(v.texto).toContain('migracion mecanica')
  })

  it('limites por defecto 40, 1000 y 3000 de tests, y los del perfil mandan', () => {
    expect(limites(null)).toMatchObject({ max_archivos: 40, max_lineas: 1000, max_lineas_tests: 3000 })
    expect(limites({ gate: { tamano_pr: { max_archivos: 20 } } })).toMatchObject({
      max_archivos: 20,
      max_lineas: 1000,
      max_lineas_tests: 3000,
    })
    expect(limites({ gate: { tamano_pr: { max_lineas_tests: 500 } } }).max_lineas_tests).toBe(500)
    expect(limites({ gate: { tamano_pr: { max_lineas_tests: -1 } } }).max_lineas_tests).toBe(3000)
    expect(limites({ gate: { tamano_pr: { max_lineas_tests: 2.5 } } }).max_lineas_tests).toBe(3000)
  })
})

describe('guardia: tamano del PR, los tests con tope aparte', () => {
  // Limites por defecto escritos a mano: 40 archivos, 1000 de produccion, 3000 de tests.
  const d = { max_archivos: 40, max_lineas: 1000, max_lineas_tests: 3000 }

  it('medir separa los tests con cada glob por defecto', () => {
    const m = medir(
      [
        { ruta: 'lib/modules/a/servicio.ts', lineas: 7 },
        { ruta: 'app/page.tsx', lineas: 3 },
        { ruta: 'tests/unit/a.ts', lineas: 100 },
        { ruta: 'e2e/flujo.ts', lineas: 200 },
        { ruta: 'lib/a.test.ts', lineas: 400 },
        { ruta: 'components/b.spec.tsx', lineas: 800 },
        { ruta: 'lib/x/__tests__/c.ts', lineas: 1600 },
      ],
      limites(null).excluir,
    )
    // produccion 7 + 3 = 10; tests 100 + 200 + 400 + 800 + 1600 = 3100; 7 archivos
    expect(m).toMatchObject({ archivos: 7, lineas: 10, lineas_tests: 3100 })
  })

  it('el glob del perfil sustituye a los por defecto', () => {
    const l = limites({ gate: { tamano_pr: { tests: ['qa/**'] } } })
    expect(l.tests).toEqual(['qa/**'])
    const m = medir(
      [
        { ruta: 'src/foo.test.ts', lineas: 50 },
        { ruta: 'qa/caso.ts', lineas: 20 },
      ],
      l.excluir,
      l.tests,
    )
    // src/foo.test.ts ya no es test: cuenta como produccion
    expect(m).toMatchObject({ archivos: 2, lineas: 50, lineas_tests: 20 })
  })

  it('SLT-141 real (27 archivos, 933 produccion, 2391 tests): aviso con las cifras', () => {
    // A mano: 27/40 = 67,5% < 80%; 933/1000 = 93,3% >= 80% y <= 1000; 2391/3000 = 79,7% < 80%.
    // Nada pasa su tope y la produccion esta >= 80% -> aviso.
    const v = veredicto({ archivos: 27, lineas: 933, lineas_tests: 2391 }, d)
    expect(v.nivel).toBe('aviso')
    expect(v.texto).toContain('27/40 archivos, 933/1000 lineas de produccion, 2391/3000 de tests')
  })

  it('produccion por encima con tests bajos: error', () => {
    expect(veredicto({ archivos: 5, lineas: 1001, lineas_tests: 10 }, d).nivel).toBe('error')
  })

  it('tests por encima con produccion baja: error', () => {
    const v = veredicto({ archivos: 5, lineas: 10, lineas_tests: 3001 }, d)
    expect(v.nivel).toBe('error')
    expect(v.texto).toContain('Partir una feature')
  })

  it('tests al 80% con lo demas bajo: aviso; justo por debajo: ok', () => {
    expect(veredicto({ archivos: 5, lineas: 10, lineas_tests: 2400 }, d).nivel).toBe('aviso')
    expect(veredicto({ archivos: 5, lineas: 10, lineas_tests: 2399 }, d).nivel).toBe('ok')
  })

  it('tests por encima con la aceptacion humana: aviso', () => {
    const v = veredicto({ archivos: 5, lineas: 10, lineas_tests: 5000 }, d, '2026-11-13 · cierre con E2E')
    expect(v.nivel).toBe('aviso')
    expect(v.texto).toContain('cierre con E2E')
  })

  it('sin lineas_tests ni su tope no rompe: cuenta 0', () => {
    const v = veredicto({ archivos: 3, lineas: 30 }, { max_archivos: 10, max_lineas: 100 })
    expect(v.nivel).toBe('ok')
    expect(v.texto).toBe('tamano del PR: 3/10 archivos, 30/100 lineas de produccion, 0/3000 de tests')
  })
})

// --- El script de verdad sobre un repo de mentira -----------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'guard-tamano-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))
let n = 0
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

function repo(archivos: string[], { rama = 'feature/AB-1-algo', aceptado = false } = {}) {
  const raiz = join(tmp, `r${++n}`)
  mkdirSync(raiz, { recursive: true })
  git(raiz, 'init', '-q', '-b', 'dev')
  git(raiz, 'config', 'user.email', 'g@g')
  git(raiz, 'config', 'user.name', 'g')
  writeFileSync(join(raiz, 'arnes.config.json'), JSON.stringify({ ramas: { integracion: 'dev' }, gate: { tamano_pr: { max_archivos: 3, max_lineas: 1000 } } }))
  git(raiz, 'add', '-A')
  git(raiz, 'commit', '-qm', 'base')
  git(raiz, 'update-ref', 'refs/remotes/origin/dev', 'HEAD')
  git(raiz, 'checkout', '-q', '-b', rama)
  for (const a of archivos) {
    mkdirSync(join(raiz, dirname(a)), { recursive: true })
    writeFileSync(join(raiz, a), 'x\n')
  }
  if (aceptado) {
    mkdirSync(join(raiz, 'progress', 'features'), { recursive: true })
    writeFileSync(join(raiz, 'progress', 'features', 'AB-1.md'), '# AB-1\n<!-- tamano-pr-aceptado: 2026-11-07 · renombrado mecanico -->\n')
  }
  git(raiz, 'add', '-A')
  git(raiz, 'commit', '-qm', 'feature')
  return raiz
}

const correr = (cwd: string) => {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8', env: { ...process.env, GITHUB_HEAD_REF: '' } })
  return { code: r.status, salida: `${r.stdout}${r.stderr}` }
}

describe('guardia: tamano del PR, el script', { timeout: 30_000 }, () => {
  it('dentro del limite sale 0 con las cifras', () => {
    const r = correr(repo(['lib/a.ts']))
    expect(r.code, r.salida).toBe(0)
    expect(r.salida).toContain('1/3 archivos')
  })

  it('las lineas de tests van en su propio monton', () => {
    const r = correr(repo(['lib/a.ts', 'tests/unit/a.test.ts']))
    expect(r.code, r.salida).toBe(0)
    expect(r.salida).toContain('2/3 archivos, 1/1000 lineas de produccion, 1/3000 de tests')
  })

  it('por encima del limite sale 1', () => {
    const r = correr(repo(['lib/a.ts', 'lib/b.ts', 'lib/c.ts', 'lib/d.ts']))
    expect(r.code).toBe(1)
    expect(r.salida).toContain('pasa del tamano maximo')
  })

  it('lo no commiteado tambien cuenta', () => {
    const raiz = repo(['lib/a.ts', 'lib/b.ts', 'lib/c.ts'])
    writeFileSync(join(raiz, 'lib', 'nuevo.ts'), 'x\n')
    expect(correr(raiz).code).toBe(1)
  })

  it('con la aceptacion humana en progress/features/<key>.md sale 0 con AVISO', () => {
    const r = correr(repo(['lib/a.ts', 'lib/b.ts', 'lib/c.ts', 'lib/d.ts'], { aceptado: true }))
    expect(r.code, r.salida).toBe(0)
    expect(r.salida).toContain('AVISO')
    expect(r.salida).toContain('renombrado mecanico')
  })

  it('fuera de una rama de feature no aplica', () => {
    const r = correr(repo(['lib/a.ts', 'lib/b.ts', 'lib/c.ts', 'lib/d.ts'], { rama: 'chore/limpieza' }))
    expect(r.code).toBe(0)
    expect(r.salida).toContain('no aplica')
  })
})
