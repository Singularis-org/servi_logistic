// Guardia: el gate rapido (`scripts/test-rapido.mjs`) no se pone rojo por un rojo HEREDADO del
// baseline, y si por cualquier otro.
//
// Existe por el 2026-10-08: en QC-226, `./init.sh` salio rojo por
// `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`, que estaba en
// `tests/baseline-rojos.json`. El script lo "excluia" con `--exclude`, pero `vitest related`
// (4.1.10) ignora `--exclude` y lo corrio igual, porque el diff tocaba archivos relacionados.
// Ahora el veredicto sale del informe JSON de la corrida.
//
// Prueba la funcion pura `veredictoConHeredados`, sin lanzar vitest. Los casos de rojo son los
// que la hacen valer: un veredicto que siempre diera verde pasaria los dos primeros
// (`docs/gate.md > Probar que muerde, no que pasa`).

import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { veredictoConHeredados } from '../../scripts/test-rapido.mjs'

const HEREDADO = 'tests/unit/navegacion/pantallas-exigen-permiso.test.tsx'
const OTRO = 'tests/unit/pedidos/pedido-form.test.tsx'
// vitest escribe rutas absolutas en `testResults[].name`.
const abs = (p: string) => path.resolve(p)
const informe = (...suites: Array<[string, 'passed' | 'failed']>) => ({
  testResults: suites.map(([name, status]) => ({ name: abs(name), status })),
})

describe('guardia: el gate rapido tolera solo los rojos heredados', () => {
  it('verde con estado 0, sin mirar el informe', () => {
    expect(veredictoConHeredados({ estado: 0, reporte: null, heredados: [] }).estado).toBe(0)
  })

  it('verde si TODOS los rojos son heredados, y los nombra', () => {
    const v = veredictoConHeredados({
      estado: 1,
      reporte: informe([HEREDADO, 'failed'], [OTRO, 'passed']),
      heredados: [HEREDADO],
    })
    expect(v.estado).toBe(0)
    expect(v.heredadosEnRojo).toEqual([HEREDADO])
  })

  it('rojo si hay un rojo fuera del baseline, y lo nombra', () => {
    const v = veredictoConHeredados({
      estado: 1,
      reporte: informe([HEREDADO, 'failed'], [OTRO, 'failed']),
      heredados: [HEREDADO],
    })
    expect(v.estado).toBe(1)
    expect(v.nuevos).toEqual([OTRO])
  })

  it('rojo si vitest salio en rojo sin informe (no arranco o revento antes)', () => {
    expect(veredictoConHeredados({ estado: 1, reporte: null, heredados: [HEREDADO] }).estado).toBe(1)
  })

  it('rojo si el informe no trae ningun archivo rojo (la causa del rojo es otra)', () => {
    const v = veredictoConHeredados({ estado: 1, reporte: informe([OTRO, 'passed']), heredados: [HEREDADO] })
    expect(v.estado).toBe(1)
  })

  it('rojo con baseline vacio: cualquier rojo cuenta', () => {
    const v = veredictoConHeredados({ estado: 1, reporte: informe([HEREDADO, 'failed']), heredados: [] })
    expect(v.estado).toBe(1)
  })
})
