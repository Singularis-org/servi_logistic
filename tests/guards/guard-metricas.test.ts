// Guardia: las metricas del ciclo (`scripts/metricas.mjs`, `docs/gate.md > Medir el ciclo`) se
// registran y se resumen bien, y `init.sh` deja su corrida registrada SIN cambiar su codigo de
// salida, tambien cuando falla.
//
// Existe porque en el proyecto de origen nadie sabia donde se iba el tiempo de una feature y hubo
// que reconstruirlo a mano (2026-11-07). Un registro que mintiera, o un trap que cambiara el codigo
// de salida del gate, serian peores que no medir.

import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { keyDeRama, mediana, resumir, resumirCi } from '../../scripts/metricas.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const h = (n: number) => new Date(Date.UTC(2026, 10, 1) + n * 3_600_000).toISOString()

describe('guardia: resumen de metricas', () => {
  it('keyDeRama solo reconoce ramas de feature', () => {
    expect(keyDeRama('feature/PROY-12-algo-mas')).toBe('PROY-12')
    expect(keyDeRama('dev')).toBeNull()
    expect(keyDeRama(null)).toBeNull()
  })

  it('mediana de pares e impares', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([1, 2, 3, 4])).toBe(2.5)
    expect(mediana([])).toBeNull()
  })

  it('los tramos salen de la primera vez que se registra cada fase', () => {
    const r = resumir([
      { ts: h(0), tipo: 'fase', key: 'A-1', fase: 'F1.0' },
      { ts: h(2), tipo: 'fase', key: 'A-1', fase: 'F1.3' },
      { ts: h(5), tipo: 'fase', key: 'A-1', fase: 'F1.3' },
      { ts: h(10), tipo: 'fase', key: 'A-1', fase: 'F1.4' },
      { ts: h(30), tipo: 'fase', key: 'A-1', fase: 'F2.5' },
    ])
    const t = Object.fromEntries(r.tramos.map((x) => [x.tramo, x.mediana_h]))
    expect(t['tomar -> spec listo']).toBe(2)
    expect(t['espera de aprobacion del spec']).toBe(8)
    expect(t['ciclo completo']).toBe(30)
    expect(t['PR -> merge (CI + review humana)']).toBeNull()
  })

  it('el gate local se resume por modo, con el % en rojo', () => {
    const r = resumir([
      { ts: h(0), tipo: 'gate', modo: 'rapido', segundos: 60, ok: true, key: 'A-1' },
      { ts: h(1), tipo: 'gate', modo: 'rapido', segundos: 120, ok: false, key: 'A-1' },
      { ts: h(2), tipo: 'gate', modo: 'completo', segundos: 600, ok: true, key: null },
    ])
    expect(r.gates.find((g) => g.modo === 'rapido')).toMatchObject({ corridas: 2, mediana_s: 90, rojo_pct: 50 })
    expect(r.corridas_de_gate_por_feature).toBe(2)
  })

  it('--desde filtra los eventos viejos', () => {
    const r = resumir([{ ts: '2026-01-01T00:00:00Z', tipo: 'gate', modo: 'rapido', segundos: 1, ok: true }], { desde: '2026-06-01' })
    expect(r.gates).toEqual([])
  })

  it('el CI cuenta canceladas y rojas, e ignora las saltadas', () => {
    const run = (min: number, conclusion: string) => ({ conclusion, createdAt: h(0), updatedAt: new Date(Date.parse(h(0)) + min * 60_000).toISOString() })
    const c = resumirCi([run(10, 'success'), run(20, 'failure'), run(30, 'cancelled'), run(1, 'skipped')])
    expect(c).toMatchObject({ corridas: 3, mediana_min: 20, rojo_o_cancelada_pct: 67 })
  })
})

// --- init.sh registra su corrida sin cambiar el codigo de salida --------------------------

function bash(): string {
  if (process.platform !== 'win32') return 'bash'
  const execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim()
  return join(execPath, '..', '..', '..', 'bin', 'bash.exe')
}

const tmp = mkdtempSync(join(tmpdir(), 'guard-metricas-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('guardia: init.sh registra la corrida', { timeout: 30_000 }, () => {
  it('una corrida que falla queda registrada como roja y el gate sigue saliendo con 1', () => {
    const raiz = join(tmp, 'repo')
    mkdirSync(join(raiz, 'scripts'), { recursive: true })
    copyFileSync(join(RAIZ, 'init.sh'), join(raiz, 'init.sh'))
    copyFileSync(join(RAIZ, 'scripts', 'metricas.mjs'), join(raiz, 'scripts', 'metricas.mjs'))
    execFileSync('git', ['init', '-q', '-b', 'feature/PROY-7-algo'], { cwd: raiz })
    const env: NodeJS.ProcessEnv = { ...process.env, GATE_SHARD: '1/2' }
    delete env.CI
    delete env.GATE_PARTE
    // GATE_SHARD sin --completo es un uso invalido: init.sh sale con 1 antes de hacer nada.
    const r = spawnSync(bash(), ['./init.sh'], { cwd: raiz, encoding: 'utf8', env })
    expect(r.status).toBe(1)
    const lineas = readFileSync(join(raiz, 'progress', 'logs', 'metricas.jsonl'), 'utf8').trim().split('\n')
    expect(JSON.parse(lineas.at(-1) as string)).toMatchObject({ tipo: 'gate', modo: 'rapido', ok: false, key: 'PROY-7' })
  })

  it('una fase mal escrita no se registra y sale con 2', () => {
    const r = spawnSync(process.execPath, [join(RAIZ, 'scripts', 'metricas.mjs'), 'fase', 'PROY-7', 'F9'], { cwd: tmp, encoding: 'utf8' })
    expect(r.status).toBe(2)
  })
})
