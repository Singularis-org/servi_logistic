# SLT-113 «Excel del modelo nuevo de cierres» — tasks (S15a: hojas por gestión)

> Reparto: `backend_dev` T0, T2, T3; `frontend_dev` T1, T4, T5. Antes del primer gate, copiar `.env`
> al worktree (sin él la integración se salta y el gate sale verde a ciegas). Base desechable para
> integración y E2E, nunca la de desarrollo. No correr el gate con una mutación aplicada.

## T0 — Comprobaciones previas (backend_dev)

- [x] **T0.1** En `origin/dev` actualizado (`git fetch` + `git grep`): nadie emite ya `cierreModelo`,
  `folioCierre`, `rechazosDeTienda` en la hoja fundida, ni `libro` / `tituloHoja` en el control de
  descarga. **Hecho:** resultado en `progress/impl_SLT-113.md`; si algo ya está, PARA y avisa.
- [x] **T0.2** Calcular a mano los literales de `design.md > Verificación` leyendo (no ejecutando)
  `derivarIngresoOrden`, `money`, `porcentajeDe`, `origenDe` y el catálogo de conceptos (¿la novedad
  tiene concepto de pago al mensajero? de eso depende `tarifaFaltante` de B). **Hecho:** literales
  anotados; si alguno no casa con el design, PARA y reporta (no se ajusta el literal a la salida).
- [x] **T0.3** Mirar cómo se tipan los dobles de `ICierresAdminRepository` e
  `ICierresBodegaAdminRepository` en `tests/unit/services/CierresAdminService.gestiones-completo.test.ts`
  y `tests/unit/services/CierresBodegaAdminService.gestiones-completo.test.ts`, y qué siembra
  `e2e/_escenarios/cierres.ts` (¿un cierre viejo y uno nuevo del mismo mensajero o rango? ¿algún
  rechazo de tienda en el nuevo?). **Hecho:** anotado; si hace falta tocar un archivo fuera de
  `## Archivos esperados`, PARA y avisa al leader.

## T1 — Contrato del control de descarga (frontend_dev) · [P] con T2

- [x] **T1.1** `DescargaConfig.tituloHoja?` en `lib/types/descarga.ts` y su uso en
  `construirDescarga` (`lib/utils/descarga-dataset.ts`), como `design.md > Contrato del control`.
  Nuevo `tests/unit/descarga/descarga-titulo-hoja.test.ts`: con `tituloHoja: "Gestiones"` y
  `titulo: "Gestiones de cierres"`, la primera hoja del xlsx (leído con ExcelJS) se llama
  «Gestiones» y el nombre de archivo empieza por el de hoy; sin `tituloHoja`, la hoja se llama como
  el título. **Hecho:** verde; rojo si el generador ignora `tituloHoja`;
  `tests/unit/descarga/archivo-identico-470.test.ts` y `tests/unit/descarga/libro-kardex-468.test.ts`
  verdes sin tocarlos.
- [x] **T1.2** `DescargaFilasResult.libro?` en `components/shared/DataTable.tsx` y su rama en
  `components/shared/DescargarDatasetButton.tsx`. Nuevo
  `tests/components/descarga/DescargarDatasetLibro.test.tsx` con `construirDescarga` espiado: (a) con
  `libro` de tres hojas, la llamada es `toEqual` a un literal
  `{ tipo: "xlsx", titulo, tituloHoja, columnas, filas, hojasAdicionales: [h2, h3] }` y las columnas
  del selector no se aplican; (b) sin `libro`, la llamada es `toEqual` al literal de hoy (sin claves
  nuevas); (c) con `detalle` declarado y sin `libro`, igual que hoy. **Hecho:** verde; rojo si (b)
  lleva `tituloHoja` o `hojasAdicionales`; `tests/components/descarga/DescargarDatasetDetalle468.test.tsx`
  verde sin tocarlo.

## T2 — Servidor (backend_dev) · depende de T0

- [x] **T2.1** `lib/utils/folio-cierre.ts > folioCierre(id)`; `folioDe` de
  `components/private/cierres/detalle/detalle-cierre-vista.ts` lo devuelve. Nuevo
  `tests/unit/utils/folio-cierre.test.ts`: `"…-0000abcd1234"` → «ABCD1234» (literal) y `folioDe`
  da lo mismo. **Hecho:** verde; los tests de la pantalla que leen el folio, verdes sin tocarlos.
- [x] **T2.2** Tipos: campos opcionales de `CierreGestionDescargaDTO`, `RechazoTiendaDescargaDTO` y
  `ListarGestionesDescargaServiceResult` en `lib/interfaces/services/ICierresAdminService.ts`; tipos
  de borde en `lib/types/cierres-admin.ts` y `lib/types/cierre-bodega.ts`. **Hecho:** typecheck
  verde.
- [x] **T2.3** `lib/repositories/CierresAdminRepository.ts`: `GESTION_DESCARGA_SELECT` con ajustes y
  pagos congelados (constante común con `GESTION_ADMIN_SELECT`); helpers con `Pick`;
  `componerGestionesDescarga` con `cargoPorOrden`, modelo por cierre, folio, día del cargo; los dos
  `find…Completo` llaman a `cargosFulfillmentVigentes` solo con ids de cierres nuevos
  (`CierresBodegaAdminRepository.ts` también). **Hecho:** typecheck verde; los tests de la hoja de
  hoy (`tests/unit/descarga/cierres-gestiones-paridad.test.ts`,
  `tests/unit/services/CierresAdminService.gestiones-completo.test.ts`,
  `tests/unit/services/CierresBodegaAdminService.gestiones-completo.test.ts`) verdes con sus mismas
  aserciones.
- [x] **T2.4** Métodos de rechazos en los dos repositorios y sus interfaces
  (`lib/interfaces/repositories/ICierresAdminRepository.ts`,
  `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`), con `toRechazoTiendaDescargaDTO`
  común. **Hecho:** typecheck verde; los dobles de T0.3 reciben el método nuevo si su tipo lo exige.
- [x] **T2.5** Servicios (`lib/services/CierresAdminService.ts`, `lib/services/CierresBodegaAdminService.ts`)
  como `design.md > Servidor 4`. Nuevo `tests/unit/services/cierres-gestiones-modelo-nuevo-descarga-service.test.ts`
  con dobles: (a) todo viejo → el método de rechazos no se llama y `ok` no lleva `rechazosDeTienda`;
  (b) un nuevo → se llama una vez con el alcance y los filtros de la gestión y la respuesta lo lleva;
  (c) `adminSatelite` → `fulfillmentCargadoDia` e `ingresoEmpresa.fulfillment*` en `null`; central,
  intactos; (d) más gestiones que el tope → `limite_excedido` sin llamar a rechazos; (e) bodega sin
  acceso total → `forbidden` sin tocar el repositorio. **Hecho:** verde; rojo si se quita la
  condición de (a) o el `null` de (c).

## T3 — Integración contra Postgres real (backend_dev) · depende de T2

- [x] **T3.1** Nuevo `tests/integration/db/cierres-gestiones-modelo-nuevo-descarga-sql-real.test.ts`
  con el corpus y las aserciones de `design.md > Verificación` (A, B, C, rechazos con central, con S
  y con rango, bodega, paridad con `findCierreByIdEnAlcance`, cero consultas de cargos con solo
  viejos, ninguna escritura). **Hecho:** verde contra la base desechable y visible como `passed` (no
  `skipped`).
- [x] **T3.2** Las seis mutaciones de `design.md > Verificación`, una a una. **Hecho:** las seis ponen
  rojo T3.1 (se anota qué aserción cae en cada una en `progress/impl_SLT-113.md`) y el código vuelve
  al original con el árbol limpio.

## T4 — Cliente de cierres (frontend_dev) · depende de T1 y T2.2

- [x] **T4.1** `senalesDe` / `textoSenales` con `Pick` en
  `components/private/cierres/fila/fila-gestion-vista.ts`. **Hecho:** typecheck verde;
  `tests/unit/utils/fila-gestion-vista.test.ts` verde sin tocarlo.
- [x] **T4.2** Nuevo `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga.ts`
  (`design.md > Cliente` y `> Hojas`). Nuevo `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts`
  con DTOs de dobles y **literales escritos a mano** (nunca con `textoSenales`, `money`, `origenDe`
  ni las funciones del módulo):
  - encabezados de «Gestiones» (35, central; 32, satélite) y de «Rechazados por la tienda», en orden;
  - fila de A celda a celda (los valores de `design.md > Verificación`, «Ajuste» `"-700.00"`, tarifa
    «Monto fijo ₡3.500 · grupo «San José centro» de la zona Centro», señales «Pago ajustado»);
    fila de B (vacías las celdas que no aplican, nunca `"0.00"` inventado; señales «Vuelve a bodega ·
    Sin tarifa de pago»); columnas de importe con `formato: "monto"`;
  - `libroGestiones`: todo viejo o sin `cierreModelo` → `null`; solo nuevo → dos hojas; mixto → tres,
    en orden, sin ninguna gestión repetida y con todas las de un cierre en la misma hoja; sin
    rechazos → hoja con solo encabezados; «Gestiones modelo anterior» = `filaDescargaGestionFundida`
    con las columnas recibidas (literal de una fila).

  **Hecho:** verde; rojo si una celda de importe se calcula o si un cierre mixto reparte gestiones.
- [x] **T4.3** `DescargarGestionesDialog.tsx` (rama del libro, prop `audiencia`) y
  `DescargarCierresButton.tsx` (la pasa). Nuevo `tests/components/descarga/DescargarGestionesModeloNuevo.test.tsx`,
  montando `DescargarCierresButton` en «Detalle» con una acción de dobles y `construirDescarga`
  espiado: (a) solo viejo → la configuración es `toEqual` al literal de hoy (título «Gestiones de
  cierres», columnas marcadas, fila literal, sin `tituloHoja` ni `hojasAdicionales`); (b) solo nuevo →
  `tituloHoja` «Gestiones» y la segunda hoja «Rechazados por la tienda»; (c) mixto → tres hojas en
  orden; (d) `audiencia="satelite"` → «Gestiones» sin «Fulfillment», «IVA de fulfillment» ni
  «Fulfillment cargado el»; `admin`, con ellas. Añadir el módulo nuevo a `SUBARBOL` en
  `tests/unit/guards/cierres-descarga-detallada-frontera.guardia.test.ts` y comprobar que
  `RechazoTiendaDescargaDTO` no declara ids ni evidencia. **Hecho:** verde;
  `tests/components/descarga/DescargarGestionesDialog.test.tsx`,
  `tests/components/descarga/CierresDescargaNiveles.test.tsx` y
  `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts` verdes sin tocarlos.

## T5 — E2E (frontend_dev) · depende de T3 y T4

- [x] **T5.1** En `e2e/cierres-rediseno.spec.ts`, describe de SLT-113: la central, en
  `/cierres-admin`, elige «Detalle · una fila por gestión», descarga con todos los mensajeros y sin
  rango, y lee el xlsx con ExcelJS: nombres de hojas en orden, encabezados de «Gestiones» y, en la
  fila de la gestión del cierre nuevo del escenario, «Se le cobra a la tienda» y «Pago al mensajero»
  como número con literales del escenario. Si el escenario no tiene los dos modelos en el conjunto,
  se amplía `e2e/_escenarios/cierres.ts` sin cambiar lo que leen los describes existentes.
  **Hecho:** verde en local (base desechable, `NEXT_PUBLIC_APP_URL` como en `gate.yml`); rojo con el
  libro desactivado a mano en el diálogo (mutación temporal, revertida y anotada).

## T6 — Cierre (implementer)

- [x] **T6.1** `./init.sh` verde con `INIT_EXIT` anotado; E2E `cierres-rediseno` entero y grupo
  `dinero` (`pnpm exec playwright test --project=dinero`) verdes en local. **Hecho:** salidas en
  `progress/impl_SLT-113.md`.
- [x] **T6.2** Si el gate avisa del tamaño en líneas, la decisión de PA7 escrita por el leader en
  `progress/features/SLT-113.md`. **Hecho:** línea `tamano-pr-aceptado` presente o PA7 resuelta de
  otro modo. **Evidencia (review 1):** `tamano-pr-aceptado` en `progress/features/SLT-113.md:26`
  (hasta 52 archivos); medido tras el merge de origin/dev: 51 archivos. E2E en local con base
  desechable nueva `slt113_e2e_r1`: grupo `dinero` 107/107 y `cierres-rediseno` 18/18
  (`progress/impl_SLT-113.md > Arreglos review 1`).
- [ ] **T6.3** Anotar en `progress/features/SLT-113.md` lo que heredan SLT-140 «Excel del modelo nuevo:
  hojas por cierre de mensajeros» y SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega»: el
  `libro` del control, `tituloHoja`, `folioCierre` y el criterio de R371. **Hecho:** líneas escritas.
- [x] **T6.4** Mapa `R → test` en `progress/impl_SLT-113.md`, igual a `## Trazabilidad`. **Hecho:**
  cada R con un test que existe y está verde.

## Trazabilidad

| R | Test |
|---|---|
| R370 | `tests/components/descarga/DescargarGestionesModeloNuevo.test.tsx` (a) · `tests/components/descarga/DescargarDatasetLibro.test.tsx` (b, c) · `tests/unit/descarga/descarga-titulo-hoja.test.ts` (sin `tituloHoja`) · existentes sin cambiar aserciones: `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts`, `tests/components/descarga/DescargarGestionesDialog.test.tsx`, `tests/components/descarga/CierresDescargaNiveles.test.tsx`, `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`, `tests/unit/descarga/archivo-identico-470.test.ts` |
| R371 | `tests/integration/db/cierres-gestiones-modelo-nuevo-descarga-sql-real.test.ts` (A y B nuevo, C viejo; mutación «primera fila») · `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts` (sin `cierreModelo` → `null`) |
| R372 | `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts` (`libroGestiones`) · `tests/components/descarga/DescargarGestionesModeloNuevo.test.tsx` (b, c) · `tests/unit/descarga/descarga-titulo-hoja.test.ts` · `e2e/cierres-rediseno.spec.ts` (hojas) |
| R373 | `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts` (encabezados, hoja vacía) · `tests/integration/db/cierres-gestiones-modelo-nuevo-descarga-sql-real.test.ts` (orden y conjunto de rechazos) · `tests/components/descarga/DescargarDatasetLibro.test.tsx` (a: el selector no se aplica) |
| R374 | `tests/integration/db/cierres-gestiones-modelo-nuevo-descarga-sql-real.test.ts` (literales, paridad, sin escrituras) · `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts` (celdas, vacías, «Ajuste» negativo, `formato`) · `e2e/cierres-rediseno.spec.ts` (números) |
| R375 | `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts` (folio, tarifa, señales, ajuste, fechas) · `tests/unit/utils/folio-cierre.test.ts` · `tests/integration/db/cierres-gestiones-modelo-nuevo-descarga-sql-real.test.ts` (días en la zona, folio) |
| R376 | `tests/unit/services/cierres-gestiones-modelo-nuevo-descarga-service.test.ts` (c) · `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts` (32 columnas) · `tests/components/descarga/DescargarGestionesModeloNuevo.test.tsx` (d) |

## Tamaño

**31 archivos** (por debajo del 80 % de 40 = 32): **19 de producción** y **12 de tests** (9 seguros
y 3 condicionados a T0.3: el escenario E2E y los dos tests de servicio con dobles de repositorio).

Líneas, estimadas: **~600 de producción** (el módulo nuevo ~230, los dos repositorios ~140, el resto
de 5 a 45 por archivo) y **~1 300 de tests** (≈2×: integración ~350, módulo ~300, diálogo ~220,
servicio ~150, control ~120, E2E ~60, el resto <50). **~1 900 líneas, por encima de las 1 000 del
gate**: PA7 en `requirements.md`.

## Archivos esperados

Producción:

- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/types/cierres-admin.ts`
- `lib/types/cierre-bodega.ts`
- `lib/interfaces/repositories/ICierresAdminRepository.ts`
- `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/repositories/CierresBodegaAdminRepository.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/CierresBodegaAdminService.ts`
- `lib/utils/folio-cierre.ts`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `components/private/cierres/fila/fila-gestion-vista.ts`
- `lib/types/descarga.ts`
- `lib/utils/descarga-dataset.ts`
- `components/shared/DataTable.tsx`
- `components/shared/DescargarDatasetButton.tsx`
- `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga.ts`
- `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx`
- `app/(app)/cierres-admin/_components/DescargarCierresButton.tsx`

Tests:

- `tests/integration/db/cierres-gestiones-modelo-nuevo-descarga-sql-real.test.ts`
- `tests/unit/services/cierres-gestiones-modelo-nuevo-descarga-service.test.ts`
- `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts`
- `tests/unit/descarga/descarga-titulo-hoja.test.ts`
- `tests/unit/utils/folio-cierre.test.ts`
- `tests/components/descarga/DescargarGestionesModeloNuevo.test.tsx`
- `tests/components/descarga/DescargarDatasetLibro.test.tsx`
- `tests/unit/guards/cierres-descarga-detallada-frontera.guardia.test.ts`
- `e2e/cierres-rediseno.spec.ts`
- `e2e/_escenarios/cierres.ts`
- `tests/unit/services/CierresAdminService.gestiones-completo.test.ts`
- `tests/unit/services/CierresBodegaAdminService.gestiones-completo.test.ts`

Estado (no cuentan para el tamaño):

- `progress/impl_SLT-113.md`
- `progress/features/SLT-113.md`
