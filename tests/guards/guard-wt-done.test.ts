// Guardia: `wt.sh done` aparta, desregistra y borra, en ese orden (`docs/worktrees.md > wt.sh done:
// apartar, desregistrar, borrar`), y un fallo a mitad nunca deja un huerfano.
//
// Existe porque el orden anterior (desregistrar y luego borrar) dejo ocho worktrees «a medio
// borrar» en el proyecto de origen (2026-09-18): un archivo abierto en Windows hacia fallar el
// borrado despues de desregistrar, y nada volvia a intentarlo. Los fallos se provocan con un `mv`
// y un `rm` falsos (funciones de bash exportadas). Un caso por desenlace (`docs/gate.md > Probar que muerde`).

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const WT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'wt.sh')

function bash(): string {
  if (process.platform !== 'win32') return 'bash'
  const execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim()
  return join(execPath, '..', '..', '..', 'bin', 'bash.exe')
}
const aBash = (p: string) => p.replace(/\\/g, '/')

const tmp = mkdtempSync(join(tmpdir(), 'guard-wt-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))
let n = 0
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

/** Repo en `dev` con el worktree `.worktrees/AB-1-x` en `feature/AB-1-x`, ya integrado en `dev`. */
function repo() {
  const raiz = join(tmp, `r${++n}`)
  mkdirSync(raiz, { recursive: true })
  git(raiz, 'init', '-q', '-b', 'dev')
  git(raiz, 'config', 'user.email', 'g@g')
  git(raiz, 'config', 'user.name', 'g')
  writeFileSync(join(raiz, 'README.md'), 'x\n')
  writeFileSync(join(raiz, '.gitignore'), '/.worktrees/\n')
  git(raiz, 'add', '-A')
  git(raiz, 'commit', '-qm', 'base')
  git(raiz, 'worktree', 'add', '-q', '-b', 'feature/AB-1-x', join(raiz, '.worktrees', 'AB-1-x'))
  return raiz
}

/**
 * Corre wt.sh con, opcionalmente, un `mv` o un `rm` que fallan siempre. Son funciones exportadas de
 * bash y no binarios en el PATH: en Windows una ruta `C:/...` en el PATH rompe el separador `:`.
 */
function wt(raiz: string, args: string[], falso?: 'mv' | 'rm') {
  const prefijo = falso ? `${falso}() { return 1; }; export -f ${falso}; ` : ''
  const r = spawnSync(bash(), ['-c', `${prefijo}bash "${aBash(WT)}" ${args.join(' ')}`], { cwd: raiz, encoding: 'utf8' })
  return { code: r.status, salida: `${r.stdout}${r.stderr}` }
}

const registrado = (raiz: string) => git(raiz, 'worktree', 'list', '--porcelain').includes('AB-1-x')
const enDisco = (raiz: string) => readdirSync(join(raiz, '.worktrees'))

describe('guardia: wt.sh done aparta, desregistra y borra', { timeout: 60_000 }, () => {
  it('camino feliz: desmonta, desregistra y borra la rama', () => {
    const raiz = repo()
    const r = wt(raiz, ['--base', 'dev', 'done', 'AB-1-x'])
    expect(r.code, r.salida).toBe(0)
    expect(registrado(raiz)).toBe(false)
    expect(enDisco(raiz)).toEqual([])
    expect(git(raiz, 'branch', '--list', 'feature/AB-1-x').trim()).toBe('')
  })

  it('si no se puede apartar (algo lo tiene abierto), no toca nada: sigue entero y registrado', () => {
    const raiz = repo()
    const r = wt(raiz, ['--base', 'dev', 'done', 'AB-1-x'], 'mv')
    expect(r.code).not.toBe(0)
    expect(r.salida).toContain('sigue entero y registrado')
    expect(registrado(raiz)).toBe(true)
    expect(existsSync(join(raiz, '.worktrees', 'AB-1-x', '.git'))).toBe(true)
  })

  it('si el borrado falla, queda una papelera que no es worktree, y clean --force la borra', () => {
    const raiz = repo()
    const r = wt(raiz, ['--base', 'dev', 'done', 'AB-1-x'], 'rm')
    expect(r.salida).toContain('a medio borrar')
    expect(registrado(raiz)).toBe(false)
    expect(enDisco(raiz).some((d) => d.startsWith('AB-1-x.borrando-'))).toBe(true)
    const c = wt(raiz, ['--base', 'dev', 'clean', '--force'])
    expect(c.salida).toContain('papelera borrada')
    expect(enDisco(raiz)).toEqual([])
  })

  it('un directorio sin registrar y sin sufijo de papelera es un huerfano: se avisa y no se borra', () => {
    const raiz = repo()
    mkdirSync(join(raiz, '.worktrees', 'AB-9-perdido'), { recursive: true })
    const c = wt(raiz, ['--base', 'dev', 'clean', '--force'])
    expect(c.salida).toContain('huerfano')
    expect(existsSync(join(raiz, '.worktrees', 'AB-9-perdido'))).toBe(true)
  })
})
