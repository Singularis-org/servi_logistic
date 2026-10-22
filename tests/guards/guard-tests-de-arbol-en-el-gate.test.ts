// Guardia: el gate rapido corre siempre los patrones de `arnes.config.json > gate.siempre`, y el
// aviso de tests de arbol sin cubrir detecta lo que debe y nada mas.
//
// Existe por el 2026-10-08: QC-230 paso `./init.sh` en verde y el CI completo salio rojo por tres
// `module-contract.test.ts`. Esos tests recorren el arbol de codigo en vez de importar lo que
// vigilan, asi que `vitest related` no los seleccionaba y no se llaman `guard`.
// `docs/gate.md > Las guardias van SIEMPRE`.
//
// Prueba las funciones puras de `scripts/test-rapido.mjs` y `scripts/tests-de-arbol.mjs` sin
// lanzar vitest. Los casos «debe avisar» son los que la hacen valer: un detector que nunca
// avisara pasaria los demas (`docs/gate.md > Probar que muerde, no que pasa`).

import { describe, expect, it } from 'vitest'

import { patronesSiempre } from '../../scripts/test-rapido.mjs'
import { testsDeArbolSinCubrir } from '../../scripts/tests-de-arbol.mjs'

const RECORRE_APP = "import { readdirSync } from 'node:fs'\nreaddirSync('app/(private)')\n"

describe('guardia: patrones que el gate rapido corre siempre', () => {
  it('sin perfil o sin gate.siempre, solo las guardias', () => {
    expect(patronesSiempre(null)).toEqual(['guard'])
    expect(patronesSiempre({ gate: {} })).toEqual(['guard'])
    expect(patronesSiempre({ gate: { siempre: [] } })).toEqual(['guard'])
  })

  it('con gate.siempre, exactamente esos patrones (sin vacios)', () => {
    expect(patronesSiempre({ gate: { siempre: ['guard', 'module-contract', ' '] } })).toEqual([
      'guard',
      'module-contract',
    ])
  })
})

describe('guardia: aviso de tests de arbol sin cubrir', () => {
  it('avisa de un test que recorre app/ y no casa con ningun patron', () => {
    const fuera = testsDeArbolSinCubrir(
      [{ ruta: 'tests/unit/pedidos/module-contract.test.ts', texto: RECORRE_APP }],
      ['guard'],
    )
    expect(fuera).toEqual(['tests/unit/pedidos/module-contract.test.ts'])
  })

  it('no avisa si el patron lo cubre', () => {
    expect(
      testsDeArbolSinCubrir(
        [{ ruta: 'tests/unit/pedidos/module-contract.test.ts', texto: RECORRE_APP }],
        ['guard', 'module-contract'],
      ),
    ).toEqual([])
  })

  it('no avisa con la excepcion // gate: related', () => {
    expect(
      testsDeArbolSinCubrir(
        [{ ruta: 'tests/unit/x/algo.test.ts', texto: `// gate: related (motivo)\n${RECORRE_APP}` }],
        ['guard'],
      ),
    ).toEqual([])
  })

  it('no avisa de tests que importan lo que vigilan, ni de integracion, ni de los que solo leen db/', () => {
    const archivos = [
      { ruta: 'tests/unit/x/importa.test.ts', texto: "import { f } from '@/lib/x'\nexpect(f()).toBe(1)\n" },
      { ruta: 'tests/integration/x/recorre.int.test.ts', texto: RECORRE_APP },
      { ruta: 'tests/unit/x/migracion.test.ts', texto: "readdirSync('db/migrations')\n" },
    ]
    expect(testsDeArbolSinCubrir(archivos, ['guard'])).toEqual([])
  })
})
