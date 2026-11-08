// Guardia: las tres rutas (`docs/specs.md > Tres rutas`) en el validador y en el candado de archivos.
//   - `ruta` solo admite directa, ligera o completa;
//   - la ruta directa no exige spec; la ligera y la completa si;
//   - EL SUELO: si el diff de la feature de la rama actual toca `rutas.completa_si_toca`
//     (migraciones, esquema), una ruta que no sea la completa pone el gate en rojo;
//   - el candado de archivos lee `## Archivos esperados` del requirements.md unico (ligera) o los
//     recibe con `--archivos` (directa).
// Un caso por desenlace (`docs/gate.md > Probar que muerde, no que pasa`).

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const AQUI = dirname(fileURLToPath(import.meta.url))
const VALIDADOR = join(AQUI, '..', '..', 'scripts', 'validate-features.mjs')
const EN_VUELO = join(AQUI, '..', '..', 'scripts', 'archivos-en-vuelo.mjs')

const tmp = mkdtempSync(join(tmpdir(), 'guard-rutas-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))
let n = 0

const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

const ficha = (extra: Record<string, unknown> = {}) => ({
  key: 'AB-1',
  id: 1,
  title: 'Algo',
  name: 'algo',
  sdd: true,
  status: 'in_progress',
  zone: 'backend',
  branch: 'feature/AB-1-algo',
  assignee: { accountId: 'u1', displayName: 'u1' },
  ...extra,
})

/** Repo con la rama de la feature y `origin/dev`; `tocar` son archivos commiteados en la rama. */
function repo(f: Record<string, unknown>, { tocar = [] as string[], conSpec = false, completaSi }: { tocar?: string[]; conSpec?: boolean; completaSi?: string[] } = {}) {
  const raiz = join(tmp, `r${++n}`)
  mkdirSync(raiz, { recursive: true })
  git(raiz, 'init', '-q', '-b', 'dev')
  git(raiz, 'config', 'user.email', 'g@g')
  git(raiz, 'config', 'user.name', 'g')
  writeFileSync(join(raiz, 'README.md'), 'x\n')
  git(raiz, 'add', '-A')
  git(raiz, 'commit', '-qm', 'base')
  git(raiz, 'update-ref', 'refs/remotes/origin/dev', 'HEAD')
  git(raiz, 'checkout', '-q', '-b', 'feature/AB-1-algo')
  for (const t of tocar) {
    mkdirSync(join(raiz, dirname(t)), { recursive: true })
    writeFileSync(join(raiz, t), 'x\n')
  }
  if (conSpec) {
    mkdirSync(join(raiz, 'specs', 'AB-1-algo'), { recursive: true })
    writeFileSync(join(raiz, 'specs', 'AB-1-algo', 'requirements.md'), '# AB-1\n')
  }
  git(raiz, 'add', '-A')
  git(raiz, 'commit', '-qm', 'feature', '--allow-empty')
  const config: Record<string, unknown> = { jira: { project: 'AB' }, ramas: { integracion: 'dev', produccion: 'main' } }
  if (completaSi) config.rutas = { completa_si_toca: completaSi }
  writeFileSync(join(raiz, 'arnes.config.json'), JSON.stringify(config))
  writeFileSync(join(raiz, 'feature_list.json'), JSON.stringify({ features: [ficha(f)] }))
  writeFileSync(join(raiz, '.arnes.local.json'), JSON.stringify({ jira_account_id: 'u1' }))
  return raiz
}

const validar = (cwd: string) => {
  const r = spawnSync(process.execPath, [VALIDADOR], { cwd, encoding: 'utf8' })
  return { code: r.status, salida: `${r.stdout}${r.stderr}` }
}

describe('guardia: rutas en el validador', { timeout: 30_000 }, () => {
  it('una ruta que no existe es error', () => {
    const r = validar(repo({ ruta: 'express' }, { conSpec: true }))
    expect(r.salida).toContain('tiene ruta "express"')
    expect(r.code).not.toBe(0)
  })

  it('la ruta directa en vuelo no exige spec', () => {
    const r = validar(repo({ ruta: 'directa' }, { tocar: ['lib/a.ts'] }))
    expect(r.code, r.salida).toBe(0)
  })

  it('la ruta ligera sin spec sigue siendo error', () => {
    const r = validar(repo({ ruta: 'ligera' }, { tocar: ['lib/a.ts'] }))
    expect(r.salida).toContain('faltan specs')
    expect(r.code).not.toBe(0)
  })

  it('EL SUELO: ruta ligera que toca una migracion es error', () => {
    const r = validar(repo({ ruta: 'ligera' }, { conSpec: true, tocar: ['db/migrations/2026_x/up.sql'] }))
    expect(r.salida).toContain('exige la ruta completa')
    expect(r.code).not.toBe(0)
  })

  it('EL SUELO: ruta directa que toca el esquema es error, aunque no este commiteado', () => {
    const raiz = repo({ ruta: 'directa' }, { tocar: ['lib/a.ts'] })
    mkdirSync(join(raiz, 'db'), { recursive: true })
    writeFileSync(join(raiz, 'db', 'schema.prisma'), 'model X {}\n')
    git(raiz, 'add', 'db/schema.prisma')
    const r = validar(raiz)
    expect(r.salida).toContain('db/schema.prisma')
    expect(r.code).not.toBe(0)
  })

  it('la misma migracion en la ruta completa, o sin ruta (= completa), pasa', () => {
    expect(validar(repo({ ruta: 'completa' }, { conSpec: true, tocar: ['db/migrations/x/up.sql'] })).code).toBe(0)
    expect(validar(repo({}, { conSpec: true, tocar: ['db/migrations/x/up.sql'] })).code).toBe(0)
  })

  it('el perfil puede cambiar lo que obliga a la completa', () => {
    const r = validar(repo({ ruta: 'ligera' }, { conSpec: true, tocar: ['lib/pagos/cobro.ts'], completaSi: ['lib/pagos/**'] }))
    expect(r.salida).toContain('lib/pagos/cobro.ts')
    expect(r.code).not.toBe(0)
  })
})

describe('guardia: rutas en el candado de archivos', { timeout: 30_000 }, () => {
  function candado(spec: Record<string, string>, args: string[] = []) {
    const raiz = join(tmp, `c${++n}`)
    mkdirSync(join(raiz, 'specs', 'AB-1-algo'), { recursive: true })
    git(raiz, 'init', '-q')
    for (const [nombre, texto] of Object.entries(spec)) writeFileSync(join(raiz, 'specs', 'AB-1-algo', nombre), texto)
    writeFileSync(join(raiz, 'feature_list.json'), JSON.stringify({ features: [ficha({ status: 'pending', spec_path: 'specs/AB-1-algo' })] }))
    const r = spawnSync(process.execPath, [EN_VUELO, '--candidata', 'AB-1', ...args], { cwd: raiz, encoding: 'utf8' })
    return { code: r.status, salida: `${r.stdout}${r.stderr}` }
  }

  it('ruta ligera: lee los archivos esperados del requirements.md unico', () => {
    const r = candado({ 'requirements.md': '# AB-1\n\n## Archivos esperados\n\n- `lib/a.ts`\n' })
    expect(r.code, r.salida).toBe(0)
    expect(r.salida).toContain('sin conflicto')
  })

  it('ruta directa: sin spec, los archivos llegan con --archivos', () => {
    const r = candado({}, ['--archivos', 'lib/a.ts,lib/b.ts'])
    expect(r.code, r.salida).toBe(0)
  })

  it('sin spec y sin --archivos no se puede comprobar: sale con 2 y lo dice', () => {
    const r = candado({})
    expect(r.code).toBe(2)
    expect(r.salida).toContain('--archivos')
  })
})
