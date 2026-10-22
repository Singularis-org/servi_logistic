// Guardia: el candado de archivos (`scripts/archivos-en-vuelo.mjs`) solo dice CHOCA cuando dos
// features van a tocar el mismo archivo de verdad.
//
// Existe por el incidente del 2026-10-08: `--candidata QC-177` chocaba con TODAS las features
// en vuelo por dos motivos ajenos al conflicto real: (1) cada tasks.md cita `./init.sh` como
// comando entre backticks y contaba como archivo; (2) `tests/baseline-rojos.json` es un archivo
// de apendice que edita toda feature que limpia rojos. El candado se volvia ruido.
// La regla: `docs/equipo.md > Conflicto de archivos entre personas`.
//
// Desde el 2026-10-13 el candado solo bloquea a OTRA persona: fichas del mismo dueno (mismo
// `assignee.accountId`) dan AVISO, y un choque con otra persona que el humano acepta con
// `--acepto <key>` sale como `CHOCA ACEPTADO` y no bloquea (casos QC-7, QC-8 y QC-9).
//
// Un solo repo de mentira para los nueve casos, montado una vez: las ramas "publicadas" son refs
// `refs/remotes/origin/*` creadas con UN `git fast-import` (sin remoto ni push; el `git fetch`
// del script falla sin ruido y no importa). Cada caso es una candidata `QC-n` con su feature en
// vuelo `QC-n2` y rutas propias (`lib/cn/...`), para que los casos no se crucen. Las nueve
// candidatas se corren en paralelo. Un fixture por desenlace (`docs/gate.md > Probar que muerde,
// no que pasa`): con el script anterior al arreglo del 2026-10-08, cinco de los seis primeros
// salen en rojo (el del choque real no); con el anterior al del 2026-10-13, los tres nuevos.

import { execFile, execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(AQUI, '..', '..', 'scripts', 'archivos-en-vuelo.mjs')
const correr = promisify(execFile)

interface Caso {
  /** Candidata: su tasks.md vive en disco, en la raiz del repo. */
  tasksCandidata: string
  /** Feature en vuelo `<candidata>2`: su tasks.md vive en su rama publicada. */
  tasksEnVuelo: string
  /** Archivos que la rama en vuelo ya toca (commit en la rama, no en `dev`). */
  tocados?: Record<string, string>
  /** `assignee.accountId` comun a la candidata y a su feature en vuelo: mismo dueno. */
  dueno?: string
  /** Argumentos extra del script para este caso (p. ej. `--acepto`). */
  args?: string[]
}

const conSeccion = (cuerpo: string, archivos: string[]): string =>
  `# tasks\n\n## T1\n\n${cuerpo}\n\n## Archivos esperados\n\n${archivos.map((a) => `- \`${a}\``).join('\n')}\n`

const CASOS: Record<string, Caso> = {
  // un comando entre backticks (`./init.sh`) no es un archivo
  'QC-1': {
    tasksCandidata: conSeccion('Cierra con `./init.sh`.', ['lib/c1/a.ts']),
    tasksEnVuelo: '# tasks\n\n## T1\n\nCierra con `./init.sh` y `./scripts/arnes-sync.sh`.\n',
  },
  // con `## Archivos esperados`, solo cuentan las rutas de esa seccion
  'QC-2': {
    tasksCandidata: conSeccion('Lee `lib/c2/b.ts` como referencia.', ['lib/c2/a.ts']),
    tasksEnVuelo: conSeccion('Lee `lib/c2/a.ts` para entender el contrato.', ['lib/c2/b.ts']),
  },
  // el mismo archivo en las dos secciones choca
  'QC-3': {
    tasksCandidata: conSeccion('', ['tests/unit/c3/x.test.ts']),
    tasksEnVuelo: conSeccion('', ['lib/c3/a.ts', 'tests/unit/c3/x.test.ts']),
  },
  // `./init.sh` dentro de `## Archivos esperados` SI es un archivo
  'QC-4': {
    tasksCandidata: conSeccion('', ['init.sh']),
    tasksEnVuelo: conSeccion('', ['./init.sh']),
  },
  // un archivo compartido de apendice avisa y no choca
  'QC-5': {
    tasksCandidata: conSeccion('', ['tests/baseline-rojos.json', 'lib/c5/a.ts']),
    tasksEnVuelo: conSeccion('', ['tests/baseline-rojos.json', 'lib/c5/b.ts']),
  },
  // lo que la rama ya toca: compartido avisa, real choca
  'QC-6': {
    tasksCandidata: conSeccion('', ['tests/baseline-rojos.json', 'lib/c6/c.ts']),
    tasksEnVuelo: conSeccion('', ['lib/c6/b.ts']),
    tocados: { 'tests/baseline-rojos.json': '["x"]\n', 'lib/c6/c.ts': 'export {}\n' },
  },
  // fichas del mismo dueno: el choque es AVISO, no CHOCA
  'QC-7': {
    tasksCandidata: conSeccion('', ['lib/c7/a.ts']),
    tasksEnVuelo: conSeccion('', ['lib/c7/a.ts']),
    dueno: 'cuenta-mia',
  },
  // otra persona, choque aceptado por el humano con `--acepto` (lista por comas)
  'QC-8': {
    tasksCandidata: conSeccion('', ['lib/c8/a.ts']),
    tasksEnVuelo: conSeccion('', ['lib/c8/a.ts']),
    args: ['--acepto', 'QC-1,QC-82'],
  },
  // otra persona, `--acepto` de otra key: sigue chocando
  'QC-9': {
    tasksCandidata: conSeccion('', ['lib/c9/a.ts']),
    tasksEnVuelo: conSeccion('', ['lib/c9/a.ts']),
    args: ['--acepto', 'QC-99'],
  },
}

const spec = (key: string): string => `specs/${key}-algo`
const rama = (key: string): string => `feature/${key}-algo`

/** Flujo de `git fast-import`: `origin/dev` y una rama por feature en vuelo, todo en un proceso. */
function flujo(): string {
  const archivo = (ruta: string, contenido: string): string =>
    `M 100644 inline ${ruta}\ndata ${Buffer.byteLength(contenido)}\n${contenido}\n`
  const commit = (ref: string, marca: number, cuerpo: string, desde?: number): string =>
    `commit ${ref}\nmark :${marca}\ncommitter guardia <guardia@ejemplo> 0 +0000\ndata 1\nx\n` +
    `${desde ? `from :${desde}\n` : ''}${cuerpo}\n`

  let salida = commit('refs/remotes/origin/dev', 1, archivo('README.md', 'base\n') + archivo('tests/baseline-rojos.json', '[]\n'))
  let marca = 2
  for (const [cand, caso] of Object.entries(CASOS)) {
    const key = `${cand}2`
    let cuerpo = archivo(`${spec(key)}/tasks.md`, caso.tasksEnVuelo)
    for (const [ruta, contenido] of Object.entries(caso.tocados ?? {})) cuerpo += archivo(ruta, contenido)
    salida += commit(`refs/remotes/origin/${rama(key)}`, marca++, cuerpo, 1)
  }
  return salida
}

let repo = ''
const salidas = new Map<string, { code: number; salida: string }>()

beforeAll(async () => {
  repo = mkdtempSync(join(tmpdir(), 'guard-en-vuelo-'))
  execFileSync('git', ['init', '--quiet', repo])
  execFileSync('git', ['fast-import', '--quiet'], { cwd: repo, input: flujo() })

  const features: unknown[] = []
  for (const [cand, caso] of Object.entries(CASOS)) {
    const key = `${cand}2`
    features.push({
      key,
      name: 'algo',
      status: 'in_progress',
      branch: rama(key),
      spec_path: spec(key),
      assignee: caso.dueno
        ? { displayName: 'Yo', accountId: caso.dueno }
        : { displayName: 'Otra persona', accountId: 'cuenta-otra' },
    })
    features.push({
      key: cand,
      name: 'algo',
      status: 'pending',
      spec_path: spec(cand),
      assignee: { displayName: 'Yo', accountId: caso.dueno ?? 'cuenta-mia' },
    })
    mkdirSync(join(repo, spec(cand)), { recursive: true })
    writeFileSync(join(repo, spec(cand), 'tasks.md'), caso.tasksCandidata)
  }
  writeFileSync(join(repo, 'feature_list.json'), JSON.stringify({ features }))

  await Promise.all(
    Object.entries(CASOS).map(async ([cand, caso]) => {
      try {
        const { stdout } = await correr(process.execPath, [SCRIPT, '--candidata', cand, ...(caso.args ?? [])], {
          cwd: repo,
        })
        salidas.set(cand, { code: 0, salida: stdout })
      } catch (e) {
        const err = e as { code?: number; stdout?: string; stderr?: string }
        salidas.set(cand, { code: typeof err.code === 'number' ? err.code : 1, salida: `${err.stdout ?? ''}${err.stderr ?? ''}` })
      }
    }),
  )
}, 30_000)

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true })
})

const de = (cand: string): { code: number; salida: string } => salidas.get(cand) ?? { code: -1, salida: 'no corrio' }

describe('guardia: el candado de archivos no hace ruido', () => {
  it('un comando entre backticks (`./init.sh`) no es un archivo', () => {
    const { code, salida } = de('QC-1')

    expect(salida).not.toContain('CHOCA')
    expect(salida).toContain('QC-12 (Otra persona): su tasks.md no tiene `## Archivos esperados`')
    expect(code, salida).toBe(0)
  })

  it('con `## Archivos esperados`, solo cuentan las rutas de esa seccion', () => {
    const { code, salida } = de('QC-2')

    expect(salida).not.toContain('CHOCA')
    expect(code, salida).toBe(0)
  })

  it('el mismo archivo en las dos secciones choca', () => {
    const { code, salida } = de('QC-3')

    expect(salida).toContain('CHOCA con QC-32 (Otra persona): tests/unit/c3/x.test.ts')
    expect(code, salida).toBe(1)
  })

  it('`./init.sh` dentro de `## Archivos esperados` SI es un archivo y choca', () => {
    const { code, salida } = de('QC-4')

    expect(salida).toContain('CHOCA con QC-42 (Otra persona): init.sh')
    expect(code, salida).toBe(1)
  })

  it('un archivo compartido de apendice da AVISO y no choca', () => {
    const { code, salida } = de('QC-5')

    expect(salida).toContain('AVISO: comparte con QC-52 (Otra persona) archivos de apendice, no choca: tests/baseline-rojos.json')
    expect(salida).not.toContain('CHOCA')
    expect(code, salida).toBe(0)
  })

  it('lo que la rama ya toca: compartido avisa, real choca', () => {
    const { code, salida } = de('QC-6')

    expect(salida).toContain('AVISO: comparte con QC-62 (Otra persona) archivos de apendice, no choca: tests/baseline-rojos.json')
    expect(salida).toContain('CHOCA con QC-62 (Otra persona): lib/c6/c.ts')
    expect(salida).not.toMatch(/CHOCA[^\n]*baseline-rojos/)
    expect(code, salida).toBe(1)
  })

  it('fichas del mismo dueno: AVISO, no CHOCA', () => {
    const { code, salida } = de('QC-7')

    expect(salida).toContain('AVISO: mismo dueño que QC-72 (Yo), no choca: lib/c7/a.ts')
    expect(salida).not.toContain('CHOCA')
    expect(code, salida).toBe(0)
  })

  it('otra persona con `--acepto <key>`: CHOCA ACEPTADO y no bloquea', () => {
    const { code, salida } = de('QC-8')

    expect(salida).toContain('CHOCA ACEPTADO con QC-82 (Otra persona): lib/c8/a.ts')
    expect(salida).toContain('progress/features/QC-8.md > Decisiones')
    expect(salida).not.toMatch(/^CHOCA con/m)
    expect(code, salida).toBe(0)
  })

  it('otra persona con `--acepto` de otra key: sigue chocando', () => {
    const { code, salida } = de('QC-9')

    expect(salida).toContain('CHOCA con QC-92 (Otra persona): lib/c9/a.ts')
    expect(salida).toContain('AVISO: --acepto QC-99: no hay choque con otra persona que aceptar')
    expect(salida).not.toContain('CHOCA ACEPTADO')
    expect(code, salida).toBe(1)
  })
})
