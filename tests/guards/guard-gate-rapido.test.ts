// Guardia: el gate rapido elige bien QUE corre (`docs/gate.md > Disparadores`, `> Presupuesto del
// rapido`): los disparadores cazan los tests que no son imports, y el presupuesto deja fuera los
// relacionados cuando son demasiados, sin tocar las guardias ni lo disparado.
//
// Existe por lo medido en el proyecto de origen el 2026-11-07: 4 de los 5 ultimos rojos de CI eran
// tests de esquema, migracion, `scope` o integracion que el rapido no seleccionaba, y una corrida
// del rapido tardo 978 s. Prueba las funciones puras de `scripts/disparadores.mjs` y
// `scripts/test-rapido.mjs`; el recorrido completo con vitest esta medido a mano en el PR.

import { describe, expect, it } from 'vitest'

import { casaAlguno, compilarPatron, disparados, erroresDisparadores } from '../../scripts/disparadores.mjs'
import { noSeleccionados, presupuestoRapido, seleccion } from '../../scripts/test-rapido.mjs'

const TESTS = [
  'tests/unit/pedidos/schema/pedidos-schema.test.ts',
  'tests/unit/pedidos/schema/orders-actual-cost-migration.test.ts',
  'tests/unit/recetas/scope.test.ts',
  'tests/unit/recetas/calculo.test.ts',
  'tests/integration/recetas/receta.int.test.ts',
  'tests/guards/guard-x.test.ts',
]

describe('guardia: patrones de rutas', () => {
  it('** cruza carpetas, * no, y <x> captura un segmento', () => {
    expect(compilarPatron('db/migrations/**').regex.test('db/migrations/2026_x/down.sql')).toBe(true)
    expect(compilarPatron('lib/*.ts').regex.test('lib/a/b.ts')).toBe(false)
    expect(compilarPatron('**/*.prisma').regex.test('db/schema.prisma')).toBe(true)
    const { regex, nombres } = compilarPatron('lib/modules/<m>/**')
    expect(nombres).toEqual(['m'])
    expect(regex.exec('lib/modules/recetas/domain/x.ts')?.[1]).toBe('recetas')
  })

  it('casaAlguno acepta un glob o una lista', () => {
    expect(casaAlguno('db/migrations/1/up.sql', ['**/migrations/**'])).toBe(true)
    expect(casaAlguno('lib/a.ts', '**/*.sql')).toBe(false)
  })
})

describe('guardia: disparadores', () => {
  it('un cambio en el esquema dispara los tests de esquema y migracion, que ningun import relaciona', () => {
    const r = disparados(['db/schema.prisma'], TESTS, [{ si_cambia: ['db/schema.prisma', 'db/migrations/**'], corre: ['schema', 'migration'] }])
    expect(r.archivos).toEqual([
      'tests/unit/pedidos/schema/orders-actual-cost-migration.test.ts',
      'tests/unit/pedidos/schema/pedidos-schema.test.ts',
    ])
    expect(r.motivos[0]).toContain('db/schema.prisma')
  })

  it('la captura <m> lleva al modulo tocado y solo a ese', () => {
    const r = disparados(['lib/modules/recetas/domain/x.ts'], TESTS, [
      { si_cambia: 'lib/modules/<m>/**', corre: ['tests/unit/<m>/scope', 'tests/integration/<m>/'] },
    ])
    expect(r.archivos).toEqual(['tests/integration/recetas/receta.int.test.ts', 'tests/unit/recetas/scope.test.ts'])
  })

  it('sin cambios que casen, no dispara nada', () => {
    expect(disparados(['README.md'], TESTS, [{ si_cambia: 'db/**', corre: ['schema'] }])).toEqual({ archivos: [], motivos: [] })
    expect(disparados(['db/schema.prisma'], TESTS, undefined)).toEqual({ archivos: [], motivos: [] })
  })

  it('la forma se valida: si_cambia, corre y capturas que existan', () => {
    expect(erroresDisparadores(undefined)).toEqual([])
    expect(erroresDisparadores([{ si_cambia: 'db/**', corre: ['schema'] }])).toEqual([])
    expect(erroresDisparadores('x')).toEqual(['gate.disparadores no es una lista'])
    expect(erroresDisparadores([{ corre: ['a'] }])[0]).toContain('si_cambia')
    expect(erroresDisparadores([{ si_cambia: 'db/**' }])[0]).toContain('corre')
    expect(erroresDisparadores([{ si_cambia: 'lib/**', corre: ['tests/<m>/'] }])[0]).toContain('<m>')
  })
})

describe('guardia: presupuesto del rapido', () => {
  const base = { siempre: ['tests/guards/guard-x.test.ts'], disparados: ['tests/unit/recetas/scope.test.ts'], heredados: [], presupuesto: 2 }

  it('dentro del presupuesto corre relacionados, siempre y disparados, sin repetir', () => {
    const s = seleccion({ ...base, relacionados: ['tests/unit/recetas/calculo.test.ts', 'tests/unit/recetas/scope.test.ts'] })
    expect(s.relacionadosFuera).toBe(false)
    expect(s.archivos).toEqual(['tests/guards/guard-x.test.ts', 'tests/unit/recetas/calculo.test.ts', 'tests/unit/recetas/scope.test.ts'])
  })

  it('por encima deja fuera los relacionados, pero no las guardias ni lo disparado', () => {
    const s = seleccion({ ...base, relacionados: ['a.test.ts', 'b.test.ts', 'c.test.ts'] })
    expect(s.relacionadosFuera).toBe(true)
    expect(s.archivos).toEqual(['tests/guards/guard-x.test.ts', 'tests/unit/recetas/scope.test.ts'])
  })

  it('sinPresupuesto los corre igualmente', () => {
    const s = seleccion({ ...base, relacionados: ['a.test.ts', 'b.test.ts', 'c.test.ts'], sinPresupuesto: true })
    expect(s.relacionadosFuera).toBe(false)
    expect(s.archivos).toContain('c.test.ts')
  })

  it('los rojos heredados no entran en la seleccion', () => {
    const s = seleccion({ ...base, relacionados: [], heredados: ['tests/unit/recetas/scope.test.ts'] })
    expect(s.archivos).toEqual(['tests/guards/guard-x.test.ts'])
  })

  it('--comprobar: dice que tests en rojo de CI no habria corrido el rapido', () => {
    const sel = ['tests/guards/guard-x.test.ts', 'tests/unit/recetas/scope.test.ts']
    expect(noSeleccionados(['tests/unit/recetas/scope.test.ts', 'tests/unit/pedidos/schema/pedidos-schema.test.ts'], sel)).toEqual([
      'tests/unit/pedidos/schema/pedidos-schema.test.ts',
    ])
    expect(noSeleccionados(['tests/unit/recetas/scope.test.ts'], sel)).toEqual([])
  })

  it('el presupuesto sale del perfil, o 150', () => {
    expect(presupuestoRapido({ gate: { presupuesto_rapido: 40 } })).toBe(40)
    expect(presupuestoRapido({ gate: { presupuesto_rapido: -1 } })).toBe(150)
    expect(presupuestoRapido(null)).toBe(150)
  })
})
