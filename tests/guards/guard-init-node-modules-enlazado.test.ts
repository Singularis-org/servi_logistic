// Guardia: `init.sh` no reinstala un `node_modules` enlazado.
//
// Existe por el incidente del 2026-10-21 (servi_logistic): en un worktree recien creado el
// `node_modules` es un enlace al del checkout principal (`docs/worktrees.md`) y el lockfile
// siempre es «mas nuevo» que el enlace. El paso 2 de `init.sh` disparaba `pnpm install`, que
// trataba el `node_modules` compartido como suyo y, sin terminal, aceptaba solo borrarlo y
// reinstalarlo: rompia las dependencias de todas las fichas que lo comparten.
//
// Ejecuta SOLO el paso 2, extraido entre sus marcadores, en un directorio temporal y con un
// `pnpm` falso que deja constancia de la llamada. Un caso por desenlace
// (`docs/gate.md > Probar que muerde, no que pasa`): cambiar `[ -L node_modules ]` por otra
// ruta pone rojo el caso del enlace.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const INICIO = '# >>> PASO 2: DEPENDENCIAS <<<'
const FIN = '# >>> FIN PASO 2: DEPENDENCIAS <<<'

// En Windows, `bash` a secas puede resolver al de WSL (System32). Se usa el de Git Bash.
function rutaBash(): string {
  if (process.platform !== 'win32') return 'bash'
  const candidatos = [
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    'C:\\Program Files\\Git\\bin\\bash.exe',
  ]
  return candidatos.find((c) => existsSync(c)) ?? 'bash'
}
const BASH = rutaBash()
const ENV = { ...process.env, MSYS: 'winsymlinks:nativestrict' }

function pasoDos(): string {
  const texto = readFileSync(join(RAIZ, 'init.sh'), 'utf8').replace(/\r\n/g, '\n')
  const lineas = texto.split('\n')
  const i = lineas.findIndex((l) => l.startsWith(INICIO))
  const f = lineas.findIndex((l) => l.startsWith(FIN))
  if (i === -1) throw new Error(`init.sh no tiene el marcador de inicio «${INICIO}»: la guardia no puede aislar el paso 2`)
  if (f === -1) throw new Error(`init.sh no tiene el marcador de fin «${FIN}»: la guardia no puede aislar el paso 2`)
  if (f <= i) throw new Error('en init.sh el marcador de fin del paso 2 va antes que el de inicio')
  return lineas.slice(i + 1, f).join('\n')
}

const aBash = (p: string) => p.replace(/\\/g, '/')
const tmp = mkdtempSync(join(tmpdir(), 'init-nm-enlazado-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

function bash(script: string, cwd: string) {
  return spawnSync(BASH, ['-c', script], { cwd, encoding: 'utf8', env: ENV })
}

// `enlazar <destino> <enlace>`: un `ln -s` real; si el sistema no lo permite (Windows sin
// modo desarrollador: «Operation not permitted» aun con winsymlinks:nativestrict), una union
// NTFS con `mklink /J`, que es justo lo que monta el worktree (`docs/worktrees.md`) y que
// Git Bash reconoce con `[ -L ]`.
const ENLAZAR = [
  'enlazar() {',
  '  if ln -s "$1" "$2" 2>/dev/null && [ -L "$2" ]; then return 0; fi',
  '  rm -rf "$2"',
  '  command -v cmd >/dev/null 2>&1 || return 1',
  '  MSYS_NO_PATHCONV=1 cmd /c mklink /J "$2" "$1" >/dev/null',
  '}',
].join('\n')

// Sondeo: ¿este bash crea un enlace que `[ -L ]` reconozca?
function enlacesSoportados(): boolean {
  const dir = join(tmp, 'sondeo')
  mkdirSync(join(dir, 'real'), { recursive: true })
  const r = bash(`${ENLAZAR}\nenlazar real enlace && [ -L enlace ] && [ -d enlace ]`, dir)
  return r.status === 0
}
const HAY_ENLACES = enlacesSoportados()

let n = 0
interface Resultado {
  status: number | null
  salida: string
  llamadas: string[]
}

// Monta el caso con `preparar` (bash, cwd = directorio del caso) y corre el paso 2 alli.
function correr(preparar: string): Resultado {
  const caso = join(tmp, `caso-${++n}`)
  const bin = join(tmp, `bin-${n}`)
  mkdirSync(caso, { recursive: true })
  mkdirSync(bin, { recursive: true })
  const log = join(tmp, `pnpm-${n}.log`)
  writeFileSync(join(bin, 'pnpm'), `#!/usr/bin/env bash\necho "$*" >> "${aBash(log)}"\nexit 0\n`)
  writeFileSync(join(caso, 'package.json'), '{}\n')
  writeFileSync(join(caso, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')

  const prep = bash(`set -e\n${ENLAZAR}\n${preparar}`, caso)
  if (prep.status !== 0) throw new Error(`no se pudo preparar el caso: ${prep.stderr}`)

  const script = [
    'set -euo pipefail',
    "RED=''; GREEN=''; YELLOW=''; NC=''",
    'fail() { echo "${RED}✗ $1${NC}"; exit 1; }',
    'ok()   { echo "${GREEN}✓ $1${NC}"; }',
    'warn() { echo "${YELLOW}! $1${NC}"; }',
    `chmod +x "${aBash(join(bin, 'pnpm'))}"`,
    `export PATH="$(cd "${aBash(bin)}" && pwd):$PATH"`,
    pasoDos(),
  ].join('\n')
  const r = bash(script, caso)
  const llamadas = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter((l) => l.trim() !== '') : []
  return { status: r.status, salida: `${r.stdout}${r.stderr}`, llamadas }
}

const VIEJO = '2020-01-01 00:00:00'
const NUEVO = '2024-01-01 00:00:00'

describe('guardia: init.sh no reinstala un node_modules enlazado', () => {
  it('init.sh tiene los dos marcadores del paso 2', () => {
    expect(() => pasoDos()).not.toThrow()
  })

  it.skipIf(!HAY_ENLACES)(
    'enlace a un directorio real y lock mas nuevo: no llama a pnpm, avisa «compartido» y sale 0 (skip si este bash no crea ni enlace ni union que [ -L ] reconozca)',
    () => {
      const r = correr(`mkdir real\nenlazar real node_modules\ntouch -d '${VIEJO}' real\ntouch -d '${NUEVO}' pnpm-lock.yaml`)
      expect(r.status, r.salida).toBe(0)
      expect(r.salida).toContain('compartido')
      expect(r.llamadas).toEqual([])
    },
  )

  it.skipIf(!HAY_ENLACES)(
    'enlace roto: sale != 0 nombrando «enlace roto» y no llama a pnpm (skip si este bash no crea ni enlace ni union que [ -L ] reconozca)',
    () => {
      const r = correr(`mkdir real\nenlazar real node_modules\nrmdir real`)
      expect(r.status).not.toBe(0)
      expect(r.salida).toContain('enlace roto')
      expect(r.llamadas).toEqual([])
    },
  )

  it('directorio real y lock mas nuevo: llama a pnpm install --frozen-lockfile', () => {
    const r = correr(`mkdir node_modules\ntouch -d '${VIEJO}' node_modules\ntouch -d '${NUEVO}' pnpm-lock.yaml`)
    expect(r.status, r.salida).toBe(0)
    expect(r.llamadas).toEqual(['install --frozen-lockfile'])
  })

  it('directorio real y lock mas viejo: no llama a pnpm', () => {
    const r = correr(`mkdir node_modules\ntouch -d '${NUEVO}' node_modules\ntouch -d '${VIEJO}' pnpm-lock.yaml`)
    expect(r.status, r.salida).toBe(0)
    expect(r.llamadas).toEqual([])
  })

  it('sin node_modules: llama a pnpm install --frozen-lockfile', () => {
    const r = correr('true')
    expect(r.status, r.salida).toBe(0)
    expect(r.llamadas).toEqual(['install --frozen-lockfile'])
  })
})
