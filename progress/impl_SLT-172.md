# impl SLT-172 «Limpieza tras el pago neto a la tienda: componentes de cierres sin uso»

Ruta ligera. Spec: `specs/SLT-172-limpieza-pago-neto/requirements.md` (T1-T5 hechas; T6 parcial).
Commits: `a6fe3db8` (feat, producción) y `2765a41a` (test).

## Archivos

Producción:
- borrados: `app/(app)/cierres-admin/_components/CascadasCierreMensajero.tsx`, `.../DesglosePorTienda.tsx`
- `app/(app)/cierres-admin/_components/cascadas-bodega.ts` (fuera `lineasCascadaDueno` e imports)
- `app/(app)/cierres-admin/_components/cierre-labels.ts` (entra `marcaDeVariasTiendas`; fuera los nueve nombres de R644)
- `components/private/cierres/detalle/detalle-cierre-vista.ts` (import de `cierre-labels`)

Tests:
- borrados: `tests/fixtures/detalle-cierre-admin-anterior.tsx`, `tests/components/CierreMensajeroDetalleCascadas.test.tsx`, `tests/components/CierreMensajeroDesglosePorTienda.test.tsx`
- recortados: `CierreDesgloseModeloNuevo`, `CierreIngresoBodegaModeloNuevo`, `DeudasD39D40ModeloEnPantalla`, `DineroIdentidadesEnPantalla`
- nuevos: `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts`, `tests/unit/utils/marca-varias-tiendas.test.ts`
- **fuera de la lista del spec:** `tests/unit/guards/nombres-estado-retirados.guardia.test.ts`. Su excepción de
  `cierre-labels.ts` contaba cuatro «entregadas», y una era de `DESGLOSE_POR_TIENDA_NOTA_MODELO_NUEVO`, que R644
  retira. La guardia exige el número exacto, así que baja a tres.

`git diff --name-only origin/dev -- lib/` está vacío.

## Desvío de la firma (R642)

`marcaDeVariasTiendas(partes: readonly unknown[])` en lugar de `readonly ParteDeTienda[]`. El `import type`
de `@/lib/utils/ingreso-empresa` en `cierre-labels.ts` puso en rojo `pagos-captura.guardia` R19: lo
comprobé con 2 fallos. Esa guardia sigue también los `import type`, y `ingreso-empresa` importa `Prisma`
como valor. La función solo cuenta elementos y los dos llamadores le siguen pasando `ParteDeTienda[]`.

## T1 — mapa de rescate

| De dónde | Qué comprobaba | ¿Vivo? | Destino |
|---|---|---|---|
| `CierreMensajeroDetalleCascadas` · 395 partición, puente, neto, negativos, tiempo verbal, rótulos, «se abra por donde se abra», SLT-54 R65 (`factura()`) | regiones y notas de `CascadasCierreMensajero` | no (se retira) | — |
| idem · 395 «antes que la tarjeta Pago a tienda» | orden cascada frente al comprobante | no (la mitad es la cascada) | — |
| idem · SL-39 R24/R26 sobre la cascada «Lo que le queda a la empresa» | la cascada | no | — |
| idem · SL-39 «Liquidación» A y B (bruto, IVA, Debe, orden y cuenta) | `CierreFacturaDetalle` | sí | `DineroIdentidadesEnPantalla` · B6 (cierre A y B, con la cuenta) |
| idem · R27 «Debe» −100 + nota «Ingreso sin IVA…» | `CierreFacturaDetalle` | sí | ya estaba en B6 R27; se amplía con IVA −260 y el orden |
| idem · `IVA_FACTURADO_LABEL` = `${IMPUESTO_ROTULO} facturado` | rótulo vivo (`cierre-factura`) | sí | B6 |
| idem · literales `IVA_FACTURADO_NOTA`, `NETO_EMPRESA_NOTA`, `GANANCIA_NOTA_BODEGA` | quedan sin consumidor vivo (los dos primeros solo en lo retirado; el tercero ya no tenía consumidor) | no | — (pregunta abierta 1 del spec, SLT-174) |
| idem · literal `GANANCIA_NOTA` | nota de «Debe» en `CierreFacturaDetalle` | sí | B6 R27 lo lee del DOM, escrito a mano |
| idem y `CierreMensajeroDesglosePorTienda` · money-safe | `CascadasCierreMensajero`, `DesglosePorTienda`, **`cierre-labels.ts`** | `cierre-labels` sí, sin otra vigilancia | guardia nueva, bloque «T1 — cierre-labels sigue money-safe» |
| `CierreMensajeroDesglosePorTienda` · 396 R1-R17, homónimas, orden, sitio | `DesglosePorTienda` | no | — |
| idem · R1/R2, el umbral de la marca | `marcaDeVariasTiendas` | sí | `marca-varias-tiendas.test.ts` (R642) y `detalle-cierre-vista.test.ts:402-408` (R643) |
| idem · R10/R11/R12, la suma por tienda leída del DOM | `DesglosePorTienda` (la suma la garantiza el servidor) | pantalla no | — |
| idem · R26, `CierreDiaModule` sin desglose | la vista del mensajero no ve el dinero de la empresa | sí | ya cubierto en `detalle-cierre-vista.test.ts:303` («audiencia mensajero… nunca «Dinero»»), y `DetalleCierre.tsx:158` pasa `dinero = null` |
| `CierreDesgloseModeloNuevo:309-337` | rótulo y nota de la cascada según el modelo | no | — |
| `CierreIngresoBodegaModeloNuevo:208-277` | cascada y nota del desglose según el modelo | no | — |
| `DeudasD39D40:219-322` | notas D40 de la cascada y del desglose | no | — (también las claves `ganaTienda`/`pagoHoy`/`desglose` de `VIEJO`/`NUEVO`, ya sin uso) |
| `DineroIdentidades` · B6 R24/R26 (la cascada) | la cascada | no | B6 pasa a leer «Liquidación» |
| `DineroIdentidades` · censo, dos entradas | las rutas retiradas | no | censo 17 → 15 (R645) |

No queda ninguna fila «vivo, sin cubrir».

## Mapa R → test

| R | Test |
|---|---|
| R640 | `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts` · «R640 — ninguno de los dos archivos existe» / «ningún fuente… los cita» |
| R641 | la misma guardia · «R641 — su único export de valor es `lineasCascadaCentral`»; `tests/unit/utils/detalle-cierre-vista.test.ts` (la cascada central), sin cambios y en verde |
| R642 | `tests/unit/utils/marca-varias-tiendas.test.ts` (0, 1, 2 y 3 tiendas, con literales) |
| R643 | `tests/unit/utils/detalle-cierre-vista.test.ts:402-408` y `tests/components/CierreBodegaDesglosePorTienda.test.tsx`, sin cambios y en verde |
| R644 | la guardia · «R644 — ninguno de los nueve nombres sale exportado» |
| R645 | `tests/components/DineroIdentidadesEnPantalla.test.tsx` · «ficha 359 · D — las quince existen…» (15 a mano, y las dos rutas fuera) |

## Mutaciones y contrapruebas (ejecutadas)

- T2: `>= 2` → `>= 1` en `marcaDeVariasTiendas` da 2 rojos: «con una sola tienda no hay marca» y
  `detalle-cierre-vista` «Por tienda solo con dos o más tiendas». Restaurado.
- T5, en memoria: 11 formas de import sintético detectadas, 4 casos sin falso positivo, archivo restaurado
  simulado, `export function lineasCascadaDueno` y los 9 nombres de R644 inyectados (como export directo y
  como `export { a as X }`).
- T5, sobre el árbol real (restaurado después):
  - A: `DesglosePorTienda.tsx` restaurado con `git show` da 1 rojo («ninguno de los dos archivos existe»).
  - B: `export function lineasCascadaDueno` añadido a `cascadas-bodega.ts` da 2 rojos.
  - C: `tests/fixtures/zz-infractor.ts` con `import("@/…/CascadasCierreMensajero")` da 1 rojo («ningún fuente… los cita»).
  - D: `export const TIENDA_GANA_TOTAL_LABEL` en `cierre-labels.ts` da 1 rojo.
- B6 reubicado: `conOperador(ivaFacturado, true)` → `money(ivaFacturado)` en `cierre-factura.tsx` da 2 rojos
  (cierre A y B). Restaurado.

## Comandos (salida real, resumida)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .`: `TSC_EXIT=0`.
- `eslint` de los 9 archivos tocados que siguen existiendo: 0 errores y 1 aviso (`DineroIdentidadesEnPantalla:541`,
  directiva `import/first` sin uso). El aviso ya estaba en `HEAD`.
- `vitest run` de los 7 archivos tocados: `Test Files 7 passed (7) · Tests 230 passed (230)`.
- `vitest run` de los 49 tests que importan `cascadas-bodega|cierre-labels|detalle-cierre-vista|cierre-detalle-shared`
  (sin integración), más `superficie-de-uso`, `pagos-captura`, `cierres-retirados`, `CierreBodegaDesglosePorTienda`,
  `CascadaDinero` y `marca-varias-tiendas`:
  - primero 1 rojo, `nombres-estado-retirados`, por la excepción de las cuatro «entregadas»; corregido;
  - después: verde.
- `vitest run tests/unit/guards tests/unit/analytics`: 427/429 archivos verdes.
  - `dependencias-declaradas-presentes` (4 rojos) también falla en la base con `git stash`: es del entorno del
    worktree (el junction de `node_modules` y `init.sh`), no de este cambio.
  - `catalogo-postgres-acota-esquema` (2 rojos) se debía a `git ls-files` con los borrados aún sin preparar en el
    índice. Tras el commit: verde, junto con `nombres-estado-retirados` (16/16).
- `node scripts/tamano-pr.mjs`: **AVISO** con 15/40 archivos, 761/1000 líneas de producción y **2676/3000 de tests**
  (89%, por encima del aviso del 80%). El spec estimaba unas 2350; la diferencia está en las líneas que se borraron
  de más en `DineroIdentidades` y `Deudas`, y en la guardia nueva. Queda por debajo del tope.

## Sin cerrar (T6)

- `./init.sh` y los E2E `e2e/cierres-rediseno.spec.ts` y `e2e/cierre-bodega-satelite.spec.ts`: los corre el leader.

Veredicto: T1-T5 hechas, R640-R645 mapeados y en verde; queda T6 (gate y E2E), del leader.
