# SLT-161 «Descargas de la satélite sin el dinero de la empresa» — tasks

> Requisitos: R480–R489 (`requirements.md`). Diseño: `design.md`. Sin migración. Antes del primer gate,
> copiar `.env` al worktree (sin él el gate sale verde saltándose la integración). Exportar la base
> desechable antes de cualquier `vitest`. Literales de los tests a mano, con el cálculo en un
> comentario.

## T1 — Contratos (backend_dev)

- [x] **T1.1** `CifrasCierreDescargaDTO`: `pagoTienda`, `ganaLaTienda`, `totalFacturado`,
  `ivaFacturado`, `netoEmpresa` a `string | null`; `partesPorTienda` a `… | null` (obligatorios).
  `CierreGestionDescargaDTO`: `montoCobrar?` y `tarifaModelo?` aditivos.
  **Hecho:** `pnpm run typecheck` muestra solo los errores de los consumidores que T2/T3 arreglan.
- [x] **T1.2** [P con T1.1] `CifrasCierreBodegaDescargaDTO`: `totalFacturado`, `ivaFacturado`,
  `netoEmpresa`, `ganaLaTienda` a `string | null`; `partesPorTienda` a `… | null`.
  **Hecho:** ídem.

## T2 — Corte en el servidor (backend_dev; depende de T1)

- [x] **T2.1** `CLASE_CIFRAS_DESCARGA_CIERRE` + `anularEmpresaSiNoCentral` en `completoConCifras`
  (F4). **Hecho:** R481 y R488 verdes en `cierres-resumen-modelo-nuevo-descarga-service.test.ts` y
  `cierres-admin-fulfillment-solo-central.test.ts`; los casos de la central de ese archivo, sin tocar,
  verdes.
- [x] **T2.2** `ocultarDineroEmpresaDescargaSiNoCentral` en `listarGestionesCierresAdminCompleto` (F5),
  sustituyendo el `map` de fulfillment. **Hecho:** R482 y R488 verdes en
  `cierres-admin-fulfillment-solo-central.test.ts`; los tests de F481/SLT-113 del fulfillment siguen
  verdes (el `null` del bloque los incluye; si alguno afirmaba el bloque con solo el fulfillment
  anulado para la satélite, se actualiza a R482 y se anota en `progress/impl_SLT-161.md`).
- [x] **T2.3** `CLASE_CIFRAS_BODEGA_DESCARGA` en `cifras-bodega-descarga.ts` + corte en
  `listarCierresBodegaSolicitadosCompleto` (F3). Si el import desde `CierresAdminService.ts` cierra un
  ciclo, mover `anularEmpresa`/`ClasificacionDinero` a `lib/services/anular-empresa.ts` con reexport.
  **Hecho:** R480 verde en `cierre-bodega-solicitados-modelo-nuevo-service.test.ts`.
- [x] **T2.4** Integración (depende de T2.1–T2.3):
  - `cierres-bodega-cifras-lote-sql-real.test.ts`: el caso R386/R389 pasa a afirmar R480 (BN con
    `gestiones`/`pagosAjustados` literales y las cinco EMP en `null`, sin `pagoEntregado`).
  - `cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts`: el caso R382/R383 pasa a afirmar R481 en
    Resueltos y en Pendientes; caso nuevo R482 sobre las gestiones de S1 (`ingresoEmpresa: null`,
    `montoCobrar` y `tarifaModelo: "nuevo"` literales, pago al mensajero e ingreso de bodega literales).
  - Los casos de la central (R380, R387, R388) sin cambio: R487 en el servidor.
  **Hecho:** los dos archivos verdes contra Postgres real; mutación de control: comentar la llamada al
  recorte de cada lectura pone rojo su caso (anotado en `progress/impl_SLT-161.md`).

## T3 — El libro de la satélite (frontend_dev; depende de T1, [P] con T2)

- [x] **T3.1** [P] Fundida: claves EMP en el conjunto de la central (26 columnas para la satélite);
  `montoCobrar` y `tarifaModelo` leídos también de la gestión. **Hecho:** R483, R489 (fundida) y R487
  (31) verdes en `cierres-gestiones-fundida-descarga-columnas.test.ts`, con una gestión del modelo nuevo
  `incidente` con `ingresoEmpresa: null` que conserva «Pago al mensajero» y «Gana la bodega».
- [x] **T3.2** [P] «Gestiones» del modelo nuevo: 21 columnas y claves EMP solo para `"admin"`.
  **Hecho:** R484, R489 y R487 (35) verdes en `cierres-gestiones-modelo-nuevo-descarga.test.ts`.
- [x] **T3.3** [P] «Cierres» y libro de mensajeros: 14 columnas, claves EMP solo para `"admin"`, sin
  «Por tienda» para la satélite. **Hecho:** R485, R486, R489 y R487 (19 + «Por tienda») verdes en
  `cierres-resumen-modelo-nuevo-descarga.test.ts` (solo nuevo y mixto).
- [x] **T3.4** [P] «Cierres» y libro de bodega: 21 columnas, claves EMP solo para `"admin"`, sin «Por
  tienda» para la satélite. **Hecho:** R485, R486, R489 y R487 (26 + «Por tienda») verdes en
  `cierres-bodega-modelo-nuevo-descarga.test.ts`.

## T4 — Cierre (depende de T2 y T3)

- [x] **T4.1** `pnpm run test:guardias` verde (en especial `columnas-sensibles.guardia` y
  `ambito-columnas.guardia`, sin tocarlas). **Hecho:** salida en `progress/impl_SLT-161.md`.
- [x] **T4.2** `./init.sh` verde con `.env`. **Hecho:** `INIT_EXIT=0` escrito en el log.
- [x] **T4.3** Mapa `R480–R489 → test` en `progress/impl_SLT-161.md`, con el nombre exacto de cada
  `it(...)`. **Hecho:** las diez filas, ninguna vacía.
- [x] **T4.4** Antes del PR (lo corre el leader): `pnpm exec playwright test e2e/cierre-bodega-satelite.spec.ts`
  y `pnpm exec playwright test --project=dinero` en local, base desechable nueva. **Hecho:** verdes
  anotados en `progress/impl_SLT-161.md`.

## Tamaño

`arnes.config.json > gate.tamano_pr`: 40 archivos (80% = 32), 1000 líneas de producción, 3000 de tests.

| Tipo | Archivos | Líneas estimadas |
|---|---|---|
| Producción | 11 (+1 condicional, `anular-empresa.ts`) | ~180 |
| Tests | 11 (dos de servicios, `CierresAdminService.gestiones-completo` y `cierres-gestiones-modelo-nuevo-descarga-service`, solo si hoy afirman el bloque de la satélite) | ~650 |
| **Total** | **22–23 (55–58%)** | por debajo de los dos topes |

## Archivos esperados

Producción:
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/interfaces/services/ICierreBodegaService.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/CierreBodegaService.ts`
- `lib/services/cifras-bodega-descarga.ts`
- `lib/services/anular-empresa.ts` (solo si hay ciclo de imports, T2.3)
- `app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga.ts`
- `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga.ts`

Tests:
- `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts`
- `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts`
- `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts`
- `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts`
- `tests/unit/services/cierre-bodega-solicitados-modelo-nuevo-service.test.ts`
- `tests/unit/services/CierresAdminService.gestiones-completo.test.ts`
- `tests/unit/services/cierres-gestiones-modelo-nuevo-descarga-service.test.ts`
- `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts`
- `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts`
- `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts`
- `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts`

Bitácora:
- `progress/impl_SLT-161.md`
