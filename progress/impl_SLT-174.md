# SLT-174 «Quitar el alias ganaLaTienda y los restos de la cascada del mensajero» — implementación

Rama `feature/SLT-174-quitar-alias-gana-tienda`, parte de `dev` e92741e5.

## Tanda 1 (backend_dev): T1, T2, T3, T4, T7

### T1 — Mapa de rescate (antes de borrar nada)

Cada `describe`/`it` que se borra, qué comprueba y si eso sigue vivo. Ninguna fila queda
«vivo, sin cubrir».

**`tests/components/CascadaDinero.test.tsx` (se borra entero en T5)** — solo monta el componente,
que hoy no monta nadie.

| `it` | Qué comprueba | ¿Vivo? | Dónde sigue cubierto |
|---|---|---|---|
| región con nombre accesible propio y rótulo (R32) | el `<section>` de `CascadaDinero` | No: el componente se retira | La cascada viva se pinta con `Cuenta.tsx`: `CierreBodegaDetalleCascadas.test.tsx` «son regiones distintas, con nombres accesibles distintos y su título visible (R1/R32)» |
| sustraendo con signo, la primera no (R5) | operador de la línea | No | `CierreBodegaDetalleCascadas.test.tsx` «las TRES cuentas cierran, leyendo lo pintado (R6/R8/R9)» |
| la resta cierra leyendo lo pintado (R5) | aritmética pintada | No | ídem «las TRES cuentas cierran» |
| destaca el resultado (R3/R4) | énfasis del total | No | ídem «Debe llegar a la central» es el total, DESTACADO (R4/R23) |
| no altera el importe (R13/R14) | formateador compartido | No | ídem R4/R23 (misma cifra que la tarjeta) |
| resultado negativo con signo y tono (R11/R36) | tono de atención | No | ídem «un «Debe llegar a la central» NEGATIVO lleva su signo, su tono y SU NOTA (R36)» |
| sustraendo grande no se tiñe | tono del resultado | No | es comportamiento del componente retirado; `Cuenta.tsx` decide el tono por el resultado (R36 arriba) |
| restar un negativo invierte el operador | doble signo | No | solo de `CascadaDinero`; `lineasCascadaCentral` + `Cuenta` cubiertos en `tests/unit/utils/detalle-cierre-vista.test.ts` (cascada central) |
| notas bajo su rótulo, solo las que se pasan | notas | No | ídem «lleva su NOTA FIJA (R26)» |

**`tests/unit/utils/partes-por-tienda.test.ts`**

| Bloque | Qué comprueba | ¿Vivo? | Dónde sigue cubierto |
|---|---|---|---|
| `describe("396/R11 …")` `:265-275` | Σ `.ganaLaTienda` === agregado | No: la identidad desaparece con el campo (R656). Era la misma cuenta que R10 | R10/R621 `:249-263` (Σ `.pagoTienda`, literal `AGREGADO_PAGO`) |
| `it("y ganaLaTienda es alias de igual valor …")` `:300-304` | alias = pagoTienda | No | Lo sustituye `not.toHaveProperty("ganaLaTienda")` en el test de las cuatro claves (R652) |
| `it` «emite una parte por tienda …» `:195` | forma de cada parte | Sí | Se queda, sin la clave del alias, con sus literales |

**Otros `it`/aserciones de «alias de igual valor»** (T4)

| Sitio | Qué comprueba | ¿Vivo? | Acción |
|---|---|---|---|
| `cifras-cierre.test.ts:103-106` «Gana la tienda en total … (alias)» | `ganaLaTienda` = 92 090,00 = `pagoTienda` | El importe sí | `pagoTienda` = "92090.00" ya está en `:91`; el `it` se borra |
| `cierres-admin-service.test.ts:786-810` «SIN rechazos …» | sin rechazos, pago = 16 383,91 | Sí | pasa a `pagoTienda` con el mismo literal + `not.toHaveProperty` |
| `cierres-admin-service.test.ts:772-783` | R624 sobre `ganaLaTienda` | Sí | la identidad pasa a `pagoTienda` (mismo literal `15027.40`) |
| `cierres-admin-service.test.ts:2550` | parte = agregado (alias) | No | se borra; `pagoTienda` y su literal se quedan |
| `cierres-bodega-admin-service.test.ts:1144-1145`, `:1566`, `:1737` | alias = pagoTienda | No | se borran; los literales de `pagoTienda` se quedan; `not.toHaveProperty` en agregado, cierre del día y partes |

**`tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts` (filas que retira T5)**

| Fila | Qué comprueba | ¿Vivo? |
|---|---|---|
| `CASCADA_DUENO_TITULO` `:590` | texto del rótulo | No: sin importador (R663) |
| `COBRADO_SOBRE_RECAUDADO_LABEL` `:595` | texto | No (R658) |
| `FLETE_RECHAZO_NO_DEDUCIBLE_NOTA` `:676-679` | texto | No (R663) |
| `GANA_LA_TIENDA_NOTA`, `GANA_LA_TIENDA_NEGATIVO_NOTA` `:737-746` | texto | No (R658) |
| `NETO_EMPRESA_NOTA`, `NETO_EMPRESA_NEGATIVO_NOTA`, `CASCADA_FACTURA_TIENDA_TITULO`, `CASCADA_NETO_EMPRESA_TITULO` `:747-758` | texto | No (R663) |

Cada fila solo cubría el texto de un rótulo que nadie pinta: nada que reubicar.
`CASCADA_CENTRAL_TITULO` (`:591`) se queda.
