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

### T2 — `ParteDeTienda` a `lib/types/parte-de-tienda.ts` (R661)

- Módulo nuevo sin un solo `import`; `ingreso-empresa.ts` lo importa con `import type` y lo
  re-exporta (`export type { ParteDeTienda }`), sin copia.
- `marcaDeVariasTiendas(partes: readonly ParteDeTienda[])` en `cierre-labels.ts`, JSDoc corregido.
- `marca-varias-tiendas.test.ts`: tipo pedido al módulo nuevo + `expectTypeOf(...).parameter(0)`.
- `pagos-captura.guardia.test.ts` verde **sin tocarlo**.

### T3 — Alias fuera de producción (R650-R655, R657)

- Campo `ganaLaTienda` retirado de `ParteDeTienda`, `CifrasCierre`, detalle de mensajero,
  `CifrasCierreDescargaDTO`, `ParteDeTiendaDescargaDTO`, cierre del día y agregado de bodega,
  `DineroEmpresaMensajero` y el estado de `CierresAdminModule`. Las cinco `CLASE_*` sin la entrada.
- Descarga de bodega: `CifrasCierreBodegaDescargaDTO.ganaLaTienda` → `pagoTienda` (valor
  `cifras.pagoTienda`); `CLASE_CIFRAS_BODEGA_DESCARGA` y la `clave` de la columna «Se le paga a la
  tienda» (+ `CLAVES_EMPRESA` y la fila) pasan a `pagoTienda`. Encabezado y posición iguales.
- `CierresAdminModule.tsx`: el JSDoc del estado deja de nombrar `CascadasCierreMensajero` (R662);
  queda solo el comentario histórico «Sustituye…» de `:78`.
- SLT-125: en `ICierresAdminService.ts` y `CierresAdminService.ts` solo las líneas de §6. Import
  `:32` intacto. `cierre-detalle-shared.tsx` y `cierre-factura.tsx` sin tocar en esta tanda.
- `rg "\bganaLaTienda\b" app components lib`: solo la función (`ingreso-empresa.ts:524`), sus tres
  llamadas, los dos `import` y comentarios que hablan de la función. `rg alias` sobre
  `ingreso-empresa.ts`, `cifras-cierre.ts` e `I*Cierre*.ts`: vacío.
- Abierto (fuera de §6, no tocado): `CierresAdminService.ts:~1131` dice «las tres lineas derivadas
  arriba» y ahora son dos. Es una línea de SLT-125 fuera de §6.

### T4 — Tests del alias (§8)

- 44 archivos de `tests/` (38 de unidad/componente y 6 de integración). Reglas de §8: aserciones
  `ganaLaTienda` con pareja `pagoTienda` borradas; sin pareja, convertidas a `pagoTienda` con el
  **mismo literal** (`cierres-admin-service.test.ts` −1356.51 y 16383.91;
  `cifras-cierre-bodega.test.ts` 100000.00).
- Descarga de bodega (5 archivos + `cierres-admin-fulfillment-solo-central.test.ts`): clave
  renombrada a `pagoTienda`, mismos literales.
- `describe` R11 de `partes-por-tienda.test.ts` y el `it` «alias de igual valor» borrados; las
  cinco claves pasan a cuatro (R652) con `not.toHaveProperty`.
- Listas de clasificación (`cierres-admin-fulfillment-solo-central.test.ts`): diez → nueve,
  ocho → siete, siete → seis; la de bodega mantiene cinco, con `pagoTienda`.
- Aserciones nuevas `not.toHaveProperty("ganaLaTienda")`: detalle y partes
  (`cierres-admin-service.test.ts`); agregado, cada cierre del día y partes
  (`cierres-bodega-admin-service.test.ts`); DTO y partes con tres claves
  (`cierres-resumen-modelo-nuevo-descarga-service.test.ts`, `it` nuevo); y en los de integración.
- La identidad R624 de `cierres-admin-service.test.ts:~780` va ahora contra el literal `"20000.55"`.
- Quité una aserción `not.toHaveProperty` que había puesto en `cierre-desglose-tres-superficies`:
  miraba un objeto auxiliar del test, no la salida del servicio, y estaba siempre verde.

### T7 — Invariantes de dinero (R656)

`git diff origin/dev` sobre los tests de §9: ningún literal de R10/R12/R621/R623/R624 cambió; solo
se borraron las líneas del alias. En `cifras-cierre.test.ts` (R624) se añadió la identidad en
céntimos contra `1990000`, escrito a mano: antes ese `it` solo afirmaba el total facturado, y la
mutación T7-b no lo ponía rojo a él sino a sus vecinos.

### Mutaciones (aplicar → rojo → revertir; todas revertidas, comprobado con `git status`)

| # | Mutación | Resultado |
|---|---|---|
| T2-a | `import { Prisma } from "@prisma/client"` (valor) en `parte-de-tienda.ts` | ROJO `pagos-captura.guardia` (2 tests: «ningún módulo del árbol importa `@prisma/client` como VALOR» y su contraprueba) |
| T2-b | `marcaDeVariasTiendas(partes: readonly unknown[])` | ROJO typecheck: `marca-varias-tiendas.test.ts(37,67) TS2344` |
| T4-a | `ganaLaTienda: pagoTienda` de vuelta en el `return` de `cifrasDelCierre` | ROJO `cifras-cierre.test.ts` y `cifras-cierre-bodega.test.ts`. **No** pone rojos `cierres-admin-service` ni `cierres-resumen-…-service` como preveía tasks.md: esos servicios montan su salida campo a campo y no propagan la clave. Por eso T4-b |
| T4-b | `ganaLaTienda` de vuelta en el detalle de `verCierreDetalle` y en `cifrasDescarga` | ROJO `cierres-admin-service.test.ts` (4) y `cierres-resumen-modelo-nuevo-descarga-service.test.ts` (4) |
| T4-c | `ganaLaTienda` de vuelta en cada parte de `partesPorTienda` | ROJO `partes-por-tienda` (5), `cierres-admin-service` (4), `cierres-bodega-admin-service` (5) |
| T4-d | `ganaLaTienda` en el cierre del día de bodega + `clave: "ganaLaTienda"` en la columna | ROJO los 3 archivos: `cierres-bodega-admin-service`, `cierres-bodega-modelo-nuevo-descarga`, `CierresBodegaResumenModeloNuevo` |
| T7-a | `pagoTienda: ganaLaTienda(recaudado, "0.00")` en `partesPorTienda` | ROJO R10/R621 de `partes-por-tienda.test.ts` (7) y `cierre-desglose-tres-superficies.test.ts` (3) |
| T7-b | `pagoTienda = ganaLaTienda(general, totalesIngreso.fleteConIva)` en `cifrasDelCierre` | ROJO `cifras-cierre.test.ts` (6, incluido el `it` R624) y `cierres-admin-service.test.ts` |
| T7-c | cierre del día de bodega con `fleteConIva` en vez de `total` | ROJO «R10/R12: en los TRES niveles…» (R623) de `cierres-bodega-admin-service.test.ts` (7) |
| T7-d | `recaudado` por tienda + 0,01 | ROJO R12 de `partes-por-tienda.test.ts` (7) |

### Mapa R → test (tanda 1)

| R | Test |
|---|---|
| R650 | typecheck (los contratos ya no declaran el campo) y el barrido `rg` de T3. La guardia `SLT-174 · R650` es de T6 (tanda 2) |
| R651 | `cierres-admin-service.test.ts` (not.toHaveProperty en detalle y partes; `pagoTienda` 15027.40, 16383.91, 128474.00, −1356.51); `cierres-bodega-admin-service.test.ts` (agregado, cierres del día y partes; 92090.00, 58276.50, 150366.50); `cierres-resumen-modelo-nuevo-descarga-service.test.ts` («SLT-174 (R651/R652)», 92090.00); `cifras-cierre.test.ts`; `cifras-cierre-bodega.test.ts`; integración: `cierres-bodega-cifras-lote-sql-real`, `cierres-resumen-modelo-nuevo-descarga-sql-real`, `satelite-detalle-sin-dinero-empresa-sql-real` |
| R652 | `partes-por-tienda.test.ts` («cuatro claves»); `cierres-admin-service.test.ts` y `cierres-bodega-admin-service.test.ts` (R16/R5, cuatro claves); `cierres-resumen-modelo-nuevo-descarga-service.test.ts` (tres claves) |
| R653 | `cierres-bodega-modelo-nuevo-descarga.test.ts` (26 columnas; `columnas[11]` = `{ clave: "pagoTienda", encabezado: "Se le paga a la tienda" }`; valor; satélite sin la columna); `CierresBodegaResumenModeloNuevo.test.tsx`; `cierres-admin-fulfillment-solo-central.test.ts` (R488: `pagoTienda` en la clasificación de bodega); integración `cierres-bodega-cifras-lote-sql-real` |
| R654 | `cierres-resumen-modelo-nuevo-descarga.test.ts` y `cierres-bodega-modelo-nuevo-descarga.test.ts` (encabezados escritos a mano, sin cambios); `DetalleCierreDinero.test.tsx` y `CierreBodegaDetalleCascadas.test.tsx` (rótulos e importes sin cambios) |
| R655 | `detalle-cierre-vista.test.ts` (`empresaDe` → `null`); `cierres-admin-fulfillment-solo-central.test.ts` (listas de cifras de la empresa); integración `satelite-detalle-sin-dinero-empresa-sql-real` y `satelite-cierre-bodega-lectura.int` |
| R656 | `partes-por-tienda.test.ts` (R10/R621, R12, R621 por tienda); `cifras-cierre.test.ts` (R624 en céntimos); `cierres-admin-service.test.ts` (R10/R12; R624 contra 20000.55); `cierres-bodega-admin-service.test.ts` (R10/R12 en tres niveles, R623, R621 por tienda); `cierre-desglose-tres-superficies.test.ts` |
| R657 | `cierres-admin-service.test.ts` (`cobradoSobreRecaudado`); `cifras-cierre.test.ts` (línea puente 5 650,00); `cifras-cierre-bodega.test.ts`; `DetalleCierreDinero.test.tsx`. Sin cambios |
| R661 | `marca-varias-tiendas.test.ts` (`expectTypeOf` + R642) y typecheck; `pagos-captura.guardia.test.ts` (R19, sin cambios). La guardia `SLT-174 · R661` es de T6 |
| R662 | parcial en T3 (`CierresAdminModule.tsx`). `cierre-detalle-shared.tsx:606` y la guardia son de T5/T6 |
| R658-R660, R663 | tanda 2 (T5, T6) |

### Salidas (tanda 1)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` → 0 errores (`TSC_EXIT=0`).
  Tras T3, con los tests aún sin tocar, daba 121 errores, todos en `tests/` (dobles tipados); T4
  los resuelve.
- `pnpm exec eslint` sobre todo lo tocado → 0 errores; 1 aviso previo en
  `DineroIdentidadesEnPantalla.test.tsx:541` (directiva sin uso), en una línea que no se tocó.
- `pnpm exec vitest run` de los 38 archivos de unidad/componente tocados + `pagos-captura` →
  39 archivos, 973 tests, todos verdes.
- **Integración no corrida en local** (no contra la base de dev). Los 6 archivos tocados de
  `tests/integration/db/` los corre el gate: `cierre-bodega-desglose-por-tienda-sql-real`,
  `cierre-desglose-por-tienda-sql-real`, `cierres-bodega-cifras-lote-sql-real`,
  `cierres-resumen-modelo-nuevo-descarga-sql-real`, `satelite-cierre-bodega-lectura.int` y
  `satelite-detalle-sin-dinero-empresa-sql-real`. El typecheck y el lint sí los cubren.

**Veredicto tanda 1:** T1-T4 y T7 hechas. Typecheck en 0, tests de unidad y componente en verde y
cada mutación en rojo. Queda la integración para el gate y la tanda 2 (T5, T6).

## Tanda 2 (frontend_dev): T5, T6

### Archivos

T5 (5bdd136c):
- `app/(app)/cierres-admin/_components/cierre-labels.ts`: fuera los 20 rótulos (8 de R658, 12 de
  R663) con su JSDoc. `CASCADA_CENTRAL_TITULO` se queda.
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`: solo las líneas de §6. Fuera los
  imports y re-exports de los 20, comentarios de bloque recontados («doce»), el bloque FICHA 395
  vacío, los dos comentarios SL-39 (ya no hay cascadas que pinten el IVA: lo lee el bloque
  «Liquidación» de `cierre-factura`) y el de `esMontoCero` sin `CascadasCierreMensajero` (R662).
- `app/(app)/cierres-admin/_components/CascadaDinero.tsx`: borrado.
- `app/(app)/cierres-admin/_components/cascadas-bodega.ts`: `SignoCascada` y `LineaCascada`, tal
  cual con su JSDoc; fuera el import de `./CascadaDinero`.
- `components/private/cierres/detalle/Cuenta.tsx:16`: el comentario no compara con el retirado.
- `tests/components/CascadaDinero.test.tsx`: borrado (mapa de rescate en T1).
- `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts`: fuera 9 imports, filas de
  `CASCADA_DUENO_TITULO`, `COBRADO_SOBRE_RECAUDADO_LABEL`, `FLETE_RECHAZO_NO_DEDUCIBLE_NOTA` y las
  6 de SL-15 R3; `CascadaDinero.tsx` fuera de `SUPERFICIES_ENTERAS`. `CASCADA_CENTRAL_TITULO` igual.
- `tests/unit/components/rechazo-nombre-466-app.test.ts`: fuera 2 imports y sus 2 aserciones.
- `tests/unit/guards/nombres-estado-retirados.guardia.test.ts`: una sola «entregadas», con motivo.
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`: entrada fuera, «catorce» / `14`, y
  `CascadaDinero.tsx` en la lista de retiradas (R660).

T6:
- `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts`: `CascadaDinero` en
  `MODULOS_RETIRADOS`; vecino de nombre parecido → `./cascadas-bodega`; restaurar cualquiera de los
  dos se detecta; cinco bloques `SLT-174 · R659`, `R658/R663`, `R650`, `R661`, `R662` y su
  autocomprobación en memoria (20 rótulos inyectados, 7 formas del alias en rojo y 6 en verde, el
  mismo nombre importado de otro módulo, copia de la interfaz, import en el módulo de tipos,
  comentario nuevo de `CascadasCierreMensajero`).

Antes de borrar se repitió la medición de §5 (`grep -rlw` en `app components lib tests e2e`): ningún
nombre ganó un importador vivo desde e92741e5.

### Mapa R → test (tanda 2)

| R | Test |
|---|---|
| R650 | `cierres-componentes-retirados.guardia.test.ts` «SLT-174 · R650» (+ no-vacuidad) |
| R658 | ídem «SLT-174 · R658/R663» |
| R659 | ídem «SLT-174 · R659» y R640/R641 de SLT-172; `detalle-cierre-vista.test.ts` sin cambios |
| R660 | `DineroIdentidadesEnPantalla.test.tsx` «ficha 359 · D» (14, escrito a mano) |
| R661 | guardia «SLT-174 · R661»; `marca-varias-tiendas.test.ts`; `pagos-captura.guardia.test.ts` sin cambios |
| R662 | guardia «SLT-174 · R662» (foto a mano: `CierresAdminModule.tsx: 1`, con «Sustituye») |
| R663 | guardia «SLT-174 · R658/R663» con el control de `CASCADA_CENTRAL_TITULO`; vocabulario «Lo que va a la central» sin cambios |

### Contrapruebas sobre el árbol (aplicar → rojo → revertir, en secuencia, sin gate en paralelo)

| Mutación | Resultado |
|---|---|
| M1 R659: se restaura `CascadaDinero.tsx` | 2 rojos: R640 «ninguno de los … archivos existe» y R659 «el archivo no existe» |
| M2 R658: `export const COBRADO_SOBRE_RECAUDADO_LABEL = "x"` en `cierre-labels.ts` | 2 rojos (export + nombrado en código) |
| M3 R663: `export const CASCADA_DUENO_TITULO = "x"` en `cierre-labels.ts` | 2 rojos (ídem) |
| M3b R663 control: `CASCADA_CENTRAL_TITULO` sin `export` | 1 rojo (el control) |
| M4 R650: `fila.ganaLaTienda = cifras.pagoTienda;` en `cierres-bodega-modelo-nuevo-descarga-columnas.ts` | 1 rojo «lo usa como campo» |
| M5 R661: `interface ParteDeTienda` copiada en `ingreso-empresa.ts` | 1 rojo «no la copia» |
| M5b R661: `import type { Prisma }` en `lib/types/parte-de-tienda.ts` | 1 rojo «no importa nada» |
| M6 R662: `// lo pinta \`CascadasCierreMensajero\`` en `cierre-detalle-shared.tsx` | 2 rojos (la foto y la autocomprobación, que lee el archivo real) |
| Final, todo revertido con `git checkout --` | 80/80 verde; `git status` solo con la guardia en edición |

### Salidas (tanda 2)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` → `TSC_EXIT=0` (tras T5 y tras T6).
- `pnpm exec eslint` sobre los 9 archivos tocados → 0 errores; 1 aviso preexistente en
  `DineroIdentidadesEnPantalla.test.tsx:541` (directiva `eslint-disable` sin uso, no tocada).
- `pnpm exec vitest run` de los 10 archivos (las tres guardias tocadas, `superficie-de-uso`,
  `pagos-captura`, `rechazo-nombre-466-app`, `DineroIdentidadesEnPantalla`,
  `CierreBodegaDetalleCascadas`, `detalle-cierre-vista`, `marca-varias-tiendas`) →
  `Test Files 10 passed (10)`, `Tests 346 passed (346)`.
- `git diff origin/dev --stat -- cierre-factura.tsx` → vacío (D7).

### Abierto

- `docs/ayuda/oficina/cierres.md` lista `CascadaDinero.tsx` en `fuentes:` del frontmatter. No está en
  el spec ni hay guardia que lo lea; queda para el leader (quitar la línea).
- `cierre-factura.tsx:515` nombra `CascadaDinero`: deuda D7 (§12), no se toca.

**Veredicto tanda 2:** T5 y T6 hechas; typecheck en 0, tests tocados en verde y cada mutación de §7 en rojo.
