// Guardia: los hooks del arnes funcionan desde cualquier directorio de trabajo.
//
// Existe por el incidente del 2026-10-15 (QC-277): un `cd` dentro de `specs/<feature>/` persistio
// en la sesion y el hook Stop (`node .claude/hooks/fin-de-turno.mjs`) fallo en cada turno con
// MODULE_NOT_FOUND. Y aunque el comando se hubiera encontrado, el script buscaba
// `scripts/validate-features.mjs` relativo al cwd: desde una subcarpeta el validador no corria y
// el aviso de ROJO desaparecia sin ruido.
//
// La regla (`.claude/settings.json > $comment`): todo command que llame a `.claude/hooks/` va
// anclado con "$CLAUDE_PROJECT_DIR", y cada script resuelve sus rutas contra la raiz, no contra
// el cwd. Un caso por desenlace (`docs/gate.md > Probar que muerde, no que pasa`): con el
// settings.json y el fin-de-turno.mjs anteriores al 2026-10-15, los dos salen en rojo.

import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

interface Hook {
  type: string
  command?: string
}

function comandos(): string[] {
  const settings = JSON.parse(readFileSync(join(RAIZ, '.claude', 'settings.json'), 'utf8')) as {
    hooks?: Record<string, { hooks: Hook[] }[]>
  }
  return Object.values(settings.hooks ?? {})
    .flat()
    .flatMap((grupo) => grupo.hooks)
    .map((hook) => hook.command ?? '')
}

describe('guardia: hooks anclados a la raiz', () => {
  it('todo command que llama a .claude/hooks/ usa "$CLAUDE_PROJECT_DIR"', () => {
    const deHooks = comandos().filter((c) => c.includes('.claude/hooks/'))
    expect(deHooks.length).toBeGreaterThan(0)
    const sueltos = deHooks.filter((c) => !c.includes('"$CLAUDE_PROJECT_DIR/.claude/hooks/'))
    expect(sueltos).toEqual([])
  })

  const tmp = mkdtempSync(join(tmpdir(), 'hooks-anclados-'))
  afterAll(() => rmSync(tmp, { recursive: true, force: true }))

  it('fin-de-turno.mjs corre el validador aunque el cwd sea una subcarpeta', () => {
    mkdirSync(join(tmp, '.claude', 'hooks'), { recursive: true })
    mkdirSync(join(tmp, 'scripts'), { recursive: true })
    mkdirSync(join(tmp, 'specs', 'QC-1-algo'), { recursive: true })
    copyFileSync(join(RAIZ, '.claude', 'hooks', 'fin-de-turno.mjs'), join(tmp, '.claude', 'hooks', 'fin-de-turno.mjs'))
    writeFileSync(join(tmp, 'scripts', 'validate-features.mjs'), "console.error('validador roto a proposito'); process.exit(1);\n")

    const r = spawnSync(process.execPath, [join(tmp, '.claude', 'hooks', 'fin-de-turno.mjs')], {
      cwd: join(tmp, 'specs', 'QC-1-algo'),
      encoding: 'utf8',
    })

    expect(r.status).toBe(0)
    expect(r.stdout).toContain('el validador de features esta en ROJO')
    expect(r.stdout).toContain('validador roto a proposito')
  })
})
