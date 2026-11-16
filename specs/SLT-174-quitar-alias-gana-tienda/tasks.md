# SLT-174 «Quitar el alias ganaLaTienda y los restos de la cascada del mensajero» — tasks

Orden: T1 → T2 → (T3 ‖ T5) → T4 → T6 → T7 → T8. Las secciones del design se citan como `§n`.

**Antes de cualquier `vitest`:** copiar `.env` al worktree y exportar la base desechable (memorias
del leader «Worktree sin .env = gate ciego» y «vitest related toca la base local»).

## Tasks

- [x] **T1 — Mapa de rescate, antes de borrar nada.**
  - En `progress/impl_SLT-174.md`, anotar cada `describe`/`it` que se borra, qué comprueba y si eso
    sigue vivo:
    - `tests/components/CascadaDinero.test.tsx` entero;
    - `describe("396/R11 …")` de `partes-por-tienda.test.ts:265-275`;
    - los `it` de «alias de igual valor», p. ej. `partes-por-tienda.test.ts:300-304`;
    - las filas retiradas de `cierre-bodega-vocabulario.guardia.test.ts`.
  - Lo vivo que no esté cubierto en otro sitio se reubica en un test vivo.
  - *Hecho:* la tabla existe y no queda ni una fila «vivo, sin cubrir».

- [x] **T2 — `ParteDeTienda` a `lib/types/parte-de-tienda.ts` (R661, §4).** Depende de T1.
  - Crear el módulo, sin un solo `import`. En esta task se mueve con sus cinco claves; T3 le quita
    la quinta.
  - En `ingreso-empresa.ts`: `import type` + `export type { ParteDeTienda }`, y borrar la interfaz
    local.
  - En `cierre-labels.ts`: `marcaDeVariasTiendas(partes: readonly ParteDeTienda[])`, importado de
    `@/lib/types/parte-de-tienda`, y corregir su JSDoc (`:527-530`).
  - En `tests/unit/utils/marca-varias-tiendas.test.ts`:
    - pedir el tipo al módulo nuevo;
    - añadir `expectTypeOf(marcaDeVariasTiendas).parameter(0).toEqualTypeOf<readonly ParteDeTienda[]>()`;
    - corregir el comentario «con la misma firma» (`:3`), que vuelve a ser cierto.
  - *Hecho:*
    - `pnpm run typecheck` en verde;
    - `tests/unit/guards/pagos-captura.guardia.test.ts` en verde **sin tocarlo**;
    - `marca-varias-tiendas.test.ts` en verde.
  - *Mutación:*
    - añadir `import { Prisma } from "@prisma/client";` al módulo nuevo pone rojo `pagos-captura`
      («ningún módulo del árbol importa `@prisma/client` como VALOR»);
    - volver a `readonly unknown[]` pone rojo el typecheck por el `expectTypeOf`.

- [x] **T3 — Quitar el alias de producción (R650-R655, R657, §3, §6).** Depende de T2.
  - **`lib/`:**
    - `cifras-cierre.ts`: el campo, `:73` y `:83`;
    - `ingreso-empresa.ts`: el campo en `lib/types/parte-de-tienda.ts`, la llamada `:708` y el JSDoc
      `:476`, `:506-507`, `:601-602`, `:644-645`, `:655-661`;
    - los tres `I*Service.ts`: campos y JSDoc de los invariantes, sin R11;
    - `CierresAdminService.ts`;
    - `CierresBodegaAdminService.ts`: `:530-536` y `:601`;
    - `cifras-bodega-descarga.ts`;
    - las cinco `CLASE_*`.
  - **Descarga de bodega:** en `CifrasCierreBodegaDescargaDTO` y `CLASE_CIFRAS_BODEGA_DESCARGA`,
    `ganaLaTienda` → `pagoTienda`; el valor pasa a ser `cifras.pagoTienda`. En
    `cierres-bodega-modelo-nuevo-descarga-columnas.ts`, la `clave` cambia en `:42`, `:62` y `:145`,
    y se ajusta el comentario `:61`. El `encabezado` y la posición no cambian.
  - **`app/`:** `CierresAdminModule.tsx`:
    - el campo (`:494`) y el set (`:819`);
    - el JSDoc `:483-491` y `:496-502`, que deja de nombrar `CascadasCierreMensajero` como
      consumidor (R662).
  - **`components/`:** `detalle-cierre-vista.ts`, en `:84` y en `empresaDe` (`:980`, `:984`, `:995`).
  - En los cuatro archivos de SLT-125 «Geografía jerárquica: presentación, exportes, cierres y
    geocodificación», solo las líneas de §6.
  - *Hecho:*
    - `pnpm run typecheck` y `pnpm run lint` en verde, con los tests todavía sin tocar;
    - `rg -n "\bganaLaTienda\b" app components lib` solo devuelve la función, sus llamadas, el
      import y comentarios que hablan de la función;
    - `rg -n "alias" lib/utils/ingreso-empresa.ts lib/utils/cifras-cierre.ts lib/interfaces/services/I*Cierre*.ts`
      no devuelve ninguna frase sobre el alias de `pagoTienda`.

- [x] **T4 — Tests del alias (R651-R657, §8).** Depende de T3.
  - Aplicar la tabla de §8 a los 44 archivos de `tests/` de `## Archivos esperados` que nombran el
    alias. `pago-tienda-no-mueve-dinero.guardia.test.ts` **no se toca**: es de SLT-175 y solo nombra
    la función.
  - Conservar los literales escritos a mano. Nunca sustituir uno por `x.pagoTienda`.
  - Añadir las aserciones `not.toHaveProperty("ganaLaTienda")`:
    - en `cierres-admin-service.test.ts` (detalle y partes);
    - en `cierres-bodega-admin-service.test.ts` (agregado, cada cierre del día y partes);
    - en `cierres-resumen-modelo-nuevo-descarga-service.test.ts` (DTO y partes).
  - Las de la descarga de bodega en `cierres-bodega-modelo-nuevo-descarga.test.ts` y
    `cierres-bodega-resumen-modelo-nuevo-service.test.ts`: la columna sale de `cifras.pagoTienda`
    con el mismo literal.
  - `partes-por-tienda.test.ts:439-451`: pasa a cuatro claves (R652). Se borra el `describe` R11.
  - *Hecho:* `pnpm exec vitest related --run` sobre el diff, en verde.
  - *Mutación:* volver a poner `ganaLaTienda: pagoTienda` en el `return` de `cifrasDelCierre` pone
    rojos `cierres-admin-service.test.ts` (`not.toHaveProperty`) y
    `cierres-resumen-modelo-nuevo-descarga-service.test.ts`.

- [x] **T5 [P con T3] — Rótulos y `CascadaDinero` (R658-R660, R663, §5).** Depende de T2, porque
  los dos editan `cierre-labels.ts`.
  - **`cierre-labels.ts`:** borrar los 20 rótulos con su JSDoc: los 8 de R658 y los 12 de R663.
    `CASCADA_CENTRAL_TITULO` se queda.
  - **`cierre-detalle-shared.tsx`:**
    - quitar los imports y re-exports de esos 20;
    - corregir los comentarios de bloque que cuentan «trece» y «doce» (`:55-58`, `:150`, `:168`,
      `:184`) y el de `:606` (R662);
    - nada más del archivo (§6).
  - **Antes de borrar:** repetir la medición de §5 con
    `rg -n "\b<NOMBRE>\b" app components lib tests`. Si algún nombre ha ganado un importador vivo
    desde e92741e5, se queda fuera y se avisa al leader.
  - **`CascadaDinero.tsx`:** borrarlo. `SignoCascada` y `LineaCascada` se mudan a `cascadas-bodega.ts`
    (`export type` / `export interface`) y se borra su import `:24`.
  - **`components/private/cierres/detalle/Cuenta.tsx:16`:** el comentario deja de comparar con un
    componente que ya no existe.
  - **Tests:**
    - borrar `tests/components/CascadaDinero.test.tsx`;
    - en `cierre-bodega-vocabulario.guardia.test.ts`:
      - quitar los imports `:10-13`, `:16`, `:19-20` y `:23-24`;
      - quitar las filas `:590`, `:595`, `:676-679`, `:737-746` y `:747-758`;
      - sacar `"CascadaDinero.tsx"` de `SUPERFICIES_ENTERAS` (`:118`);
      - no tocar los usos de `CASCADA_CENTRAL_TITULO`;
    - en `rechazo-nombre-466-app.test.ts`, quitar los imports `:16` y `:19` y las aserciones
      `:138-143`;
    - en `nombres-estado-retirados.guardia.test.ts:100-105`, pasar a una sola «entregadas»
      (`FLETE_NO_ENTREGADAS_LABEL`) con su motivo;
    - en `DineroIdentidadesEnPantalla.test.tsx`, quitar la entrada `:1525-1528`; el título y el
      número pasan a «catorce» / `14`, con su comentario.
  - *Hecho:*
    - `pnpm run typecheck` en verde;
    - las tres guardias tocadas y `rechazo-nombre-466-app.test.ts` en verde;
    - `tests/unit/utils/detalle-cierre-vista.test.ts` en verde **sin cambios en sus aserciones de la
      cascada central** (R659);
    - `superficie-de-uso.guardia.test.ts` en verde.

- [ ] **T6 — Ampliar la guardia `cierres-componentes-retirados` (R650, R658, R659, R661, R662, R663, §7).**
  Depende de T3 y T5.
  - Cinco bloques `SLT-174 · R…`, cada uno con autocomprobación.
  - Cambiar el ejemplo «vecino de nombre parecido» de `:188` por `./cascadas-bodega`.
  - *Hecho:* verde en el árbol, y **rojo** en cada inyección sintética de §7. También rojo si:
    - se restaura `CascadaDinero.tsx`;
    - se añade `export const COBRADO_SOBRE_RECAUDADO_LABEL = "x"` a `cierre-labels.ts`;
    - se escribe `fila.ganaLaTienda = …` en `cierres-bodega-modelo-nuevo-descarga-columnas.ts`;
    - se copia `interface ParteDeTienda` en `ingreso-empresa.ts`;
    - se añade un comentario «lo pinta `CascadasCierreMensajero`» en `cierre-detalle-shared.tsx`.
  - Cada mutación se aplica, se ve el rojo, se revierte y se anota en `progress/impl_SLT-174.md`. Que
    sea en ese orden, no en paralelo con el gate (memoria «Gate y mutaciones no en paralelo»).

- [x] **T7 — Invariantes de dinero (R656, §9).** Depende de T4.
  - Correr los tests de la tabla de §9 y comprobar que sus literales no cambiaron con
    `git diff origin/dev -- <archivo>` sobre esas líneas.
  - *Mutación* (aplicar, ver rojo, revertir):
    - en `partesPorTienda`, `pagoTienda: ganaLaTienda(recaudado, "0.00")` pone rojos R10/R621 de
      `partes-por-tienda.test.ts`;
    - en `cifrasDelCierre`, `pagoTienda = ganaLaTienda(c.totales.general, totalesIngreso.fleteConIva)`
      pone rojo R624 de `cifras-cierre.test.ts:213`.
  - *Hecho:* verde, con las dos mutaciones anotadas.

- [ ] **T8 — Cierre.** Depende de T1-T7.
  - `./init.sh` en verde, con `INIT_EXIT` escrito dentro del log.
  - **E2E en local** (`docs/perfil-agentes.md > Todos los agentes`, toca dinero):
    - `e2e/cierres-rediseno.spec.ts`;
    - `e2e/cierre-bodega-satelite.spec.ts`;
    - `pnpm exec playwright test --project=dinero`.
    - Base desechable nueva y `next build` previo.
  - `git diff origin/dev --stat -- 'app/(app)/cierres-admin/_components/cierre-factura.tsx'`
    vacío. En los otros tres archivos de SLT-125, el diff solo cubre las líneas de §6.
  - Mapa `R<n> → test` en `progress/impl_SLT-174.md` (abajo).
  - *Hecho:* todo verde y anotado.

## Trazabilidad prevista

| R | Test |
|---|---|
| R650 | `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts` (bloque `SLT-174 · R650`) y `pnpm run typecheck` |
| R651 | `tests/unit/services/cierres-admin-service.test.ts`, `tests/unit/services/cierres-bodega-admin-service.test.ts`, `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts`, `tests/unit/services/cierres-bodega-resumen-modelo-nuevo-service.test.ts` (`not.toHaveProperty` + literal de `pagoTienda`) |
| R652 | `tests/unit/utils/partes-por-tienda.test.ts` («cuatro claves»); `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts` (partes de la descarga) |
| R653 | `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts` (26 columnas, «Se le paga a la tienda» en su posición, valor y satélite sin la columna); `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` |
| R654 | `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` y `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts` (encabezados escritos a mano, sin cambios); `tests/components/DetalleCierreDinero.test.tsx` y `tests/components/CierreBodegaDetalleCascadas.test.tsx` (rótulos e importes, sin cambios) |
| R655 | `tests/integration/db/satelite-detalle-sin-dinero-empresa-sql-real.test.ts`; `tests/unit/utils/detalle-cierre-vista.test.ts` (`empresaDe` → `null`) |
| R656 | `tests/unit/utils/partes-por-tienda.test.ts:250-262,277-284,293-298`; `tests/unit/utils/cifras-cierre.test.ts:213`; `tests/unit/services/cierres-admin-service.test.ts:2436`; `tests/unit/services/cierres-bodega-admin-service.test.ts:1124,1546,1554`; `tests/unit/services/cierre-desglose-tres-superficies.test.ts` |
| R657 | `tests/unit/services/cierres-admin-service.test.ts:636,706`; `tests/unit/utils/cifras-cierre.test.ts:113`; `tests/unit/utils/cifras-cierre-bodega.test.ts:100`; `tests/components/DetalleCierreDinero.test.tsx:171` |
| R658 | `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts` (bloque `SLT-174 · R658/R663`) |
| R659 | la misma guardia (bloque `SLT-174 · R659` y R641 de SLT-172); `tests/unit/utils/detalle-cierre-vista.test.ts` (cascada central, sin cambios) |
| R660 | `tests/components/DineroIdentidadesEnPantalla.test.tsx` («ficha 359 · D») |
| R661 | `tests/unit/utils/marca-varias-tiendas.test.ts` (`expectTypeOf` + R642); `tests/unit/guards/pagos-captura.guardia.test.ts` (R19, sin cambios); la guardia `SLT-174 · R661` |
| R662 | `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts` (bloque `SLT-174 · R662`) |
| R663 | `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts` (bloque `SLT-174 · R658/R663`, con el control de `CASCADA_CENTRAL_TITULO`); `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts` («Lo que va a la central», sin cambios) |

## Tamaño

**Archivos: ~66/40 (~165%).** Carlos lo aceptó (D3).
- La lista de abajo tiene 68: 17 de producción y 51 de tests.
- Dos de ellas son guardias que no deberían cambiar (`pagos-captura` y `superficie-de-uso`), así
  que en el diff se esperan 66.

| Montón | Estimación | Tope | % |
|---|---|---|---|
| Producción | **~590 líneas.** Desglose abajo. | 1000 | ~59% |
| Tests | **~850 líneas.** Desglose abajo. | 3000 | ~28% |

**Producción:**
- 149 de `CascadaDinero.tsx`, borrado;
- ~125 de los rótulos de `cierre-labels.ts`: ~70 de los ocho de R658 con la firma de la marca, y
  ~55 de los doce de R663;
- ~60 de `cierre-detalle-shared.tsx`;
- ~25 de `cascadas-bodega.ts`;
- ~45 de `ingreso-empresa.ts` y ~35 del módulo de tipos nuevo;
- ~80 de las tres interfaces, sobre todo JSDoc;
- ~25 de los dos servicios;
- ~35 entre `cifras-cierre`, `cifras-bodega-descarga`, `CierresAdminModule`, columnas,
  `detalle-cierre-vista` y `Cuenta`.

**Tests:**
- ~300 por las 259 apariciones del alias en 44 archivos (casi todas borrados de una línea; las de
  bodega son renombres, que cuentan doble);
- 153 de `CascadaDinero.test.tsx`, borrado;
- ~85 de la guardia de vocabulario, `rechazo-nombre-466-app`, el censo y
  `nombres-estado-retirados`;
- ~260 de la ampliación de la guardia con su autocomprobación;
- ~50 de aserciones nuevas.

Las dos cifras de líneas quedan lejos de sus topes, así que no hay `BLOQUEADO`. Solo el número de
archivos pasa del tope, y está aceptado.

## Archivos esperados

Producción:
- `lib/types/parte-de-tienda.ts`
- `lib/utils/ingreso-empresa.ts`
- `lib/utils/cifras-cierre.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/interfaces/services/ICierreBodegaService.ts`
- `lib/interfaces/services/ICierresBodegaAdminService.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/CierresBodegaAdminService.ts`
- `lib/services/cifras-bodega-descarga.ts`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierre-labels.ts`
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`
- `app/(app)/cierres-admin/_components/CascadaDinero.tsx`
- `app/(app)/cierres-admin/_components/cascadas-bodega.ts`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `components/private/cierres/detalle/Cuenta.tsx`

Tests que nombran el alias (44):
- `tests/components/CierreBodegaDetalleCascadas.test.tsx`
- `tests/components/cierre-detalle-ajuste-badge.test.tsx`
- `tests/components/CierreBodegaDetalleGestiones.test.tsx`
- `tests/components/CierreBodegaDesglosePorTienda.test.tsx`
- `tests/components/CierresAdminConfirmacionFisica.test.tsx`
- `tests/components/CierrePremioPendiente.test.tsx`
- `tests/components/CierresBodegaAdminCifrasFila.test.tsx`
- `tests/components/CierresAdminIndemnizacion.test.tsx`
- `tests/components/CierresAdminPagoMensajero.test.tsx`
- `tests/components/CierresAdminPage.test.tsx`
- `tests/components/CierresAdminDetalleUnico.test.tsx`
- `tests/components/CierresAdminModule.test.tsx`
- `tests/components/CierresBodegaAdminRefresco.test.tsx`
- `tests/components/CierresBodegaAdminDeepLink.test.tsx`
- `tests/components/CierresBodegaAdminDetalleUnico.test.tsx`
- `tests/components/CierresAdminDeepLink.test.tsx`
- `tests/components/ConsolidacionBodegaRefresco.test.tsx`
- `tests/components/CorregirResultadoCierre.test.tsx`
- `tests/components/DetalleCierre.test.tsx`
- `tests/components/DetalleCierreDinero.test.tsx`
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`
- `tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx`
- `tests/components/descarga/DescargarResumenModeloNuevo.test.tsx`
- `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts`
- `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts`
- `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts`
- `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts`
- `tests/integration/db/satelite-cierre-bodega-lectura.int.test.ts`
- `tests/integration/db/satelite-detalle-sin-dinero-empresa-sql-real.test.ts`
- `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts`
- `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts`
- `tests/unit/utils/cifras-cierre.test.ts`
- `tests/unit/utils/cifras-cierre-bodega.test.ts`
- `tests/unit/utils/detalle-cierre-vista.test.ts`
- `tests/unit/utils/ingreso-empresa-modelo-nuevo.test.ts`
- `tests/unit/utils/marca-varias-tiendas.test.ts`
- `tests/unit/utils/partes-por-tienda.test.ts`
- `tests/unit/services/cierre-bodega-solicitados-modelo-nuevo-service.test.ts`
- `tests/unit/services/cierre-desglose-tres-superficies.test.ts`
- `tests/unit/services/cierres-bodega-resumen-modelo-nuevo-service.test.ts`
- `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts`
- `tests/unit/services/cierres-bodega-admin-service.test.ts`
- `tests/unit/services/cierres-admin-service.test.ts`
- `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts`

Tests de rótulos, `CascadaDinero` y guardias (7):
- `tests/components/CascadaDinero.test.tsx`
- `tests/unit/components/rechazo-nombre-466-app.test.ts`
- `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts`
- `tests/unit/guards/nombres-estado-retirados.guardia.test.ts`
- `tests/unit/guards/cierres-componentes-retirados.guardia.test.ts`
- `tests/unit/guards/pagos-captura.guardia.test.ts`
- `tests/unit/guards/superficie-de-uso.guardia.test.ts`

Las dos últimas guardias **no deberían cambiar**: van en la lista porque deben seguir verdes y para
que un choque con otras fichas se vea. `cierre-factura.tsx` no está en la lista a propósito (D2 y
D7; deuda en `design.md > §12`).
