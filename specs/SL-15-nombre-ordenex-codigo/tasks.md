# SL-15 — Tasks

Cada tanda se hace en orden y cierra igual: `./init.sh` en verde (R22), un commit
`feat(SL-15): <tanda>` y `git push`. Antes de empezar, la rama se rebasa sobre `dev` con SL-8 y
SL-10 ya integradas.

La medición y el mapa `R → test` van en `progress/impl_SL-15.md`.

Todas las tandas editan la misma lista de excepciones de la guardia (`design.md` §7), así que van
una detrás de otra. Lo marcado con `[P]` se puede hacer en paralelo, pero solo dentro de su misma
tanda.

## T1 — Módulo de marca, patrón y guardia (no depende de otra tanda)

- [x] **T1.1** Volver a medir:
      - `git grep -l -E 'Ordenex|ordenex|ORDENEX|ordx_'` sobre todo el árbol, por carpeta;
      - `git ls-files | grep -E 'ordenex|ordx_'`, para las rutas.

      **Hecho:** los números están en `progress/impl_SL-15.md`, y cada diferencia con `design.md` §1
      dice su causa. Por ejemplo, lo que ya integraron SL-8, SL-11, SL-12, SL-13 o SL-14.
- [x] **T1.2** [P] `lib/config/marca.ts`, con la forma de `design.md` §3.
      - Si lo creó SL-8, se comprueba que tiene esa forma.
      - Si no existe, se crea.
      - Si existe con otra forma, se para y se pregunta.

      Se añade `tests/unit/config/marca.test.ts`, que afirma como literales «Servi Logistic»,
      «la empresa», «La empresa» y `null` (R1). **Hecho:** cambiar cualquiera de esos cuatro valores
      pone el test en rojo.
- [x] **T1.3** [P] `tests/fixtures/nombre-heredado.ts`: el patrón, armado por partes (R17).
      `tests/unit/guards/sin-nombre-heredado.guardia.test.ts` (R15, R16) lleva:
      - la autocomprobación de `design.md` §7;
      - las excepciones de salida;
      - una entrada `retira: "SL-15"` por cada archivo pendiente de T1.1.

      **Hecho:** la guardia está en verde. Además se comprueba que salta en tres casos: si se quita
      una entrada pendiente, si una excepción deja de cubrir alguna aparición y si se vacía la
      lectura de `git ls-files`.
- [x] **T1.4** `tests/unit/guards/marca-estaticos.guardia.test.ts` (R5, R6). **Hecho:** sale en rojo
      si se cambia `MARCA.nombre` a «X», y también si se escribe «Servi Logistic» a mano en un archivo
      de `lib/`.
- [x] **T1.5** `./init.sh`, commit y push.

## T2 — La plataforma (clase A; depende de T1)

- [x] **T2.1** Pasar a `MARCA.nombre`:
      - `components/shared/AvisoVersionNueva.tsx`, `PushOptIn.tsx` y `AsistentePanel.tsx`;
      - `lib/asistente/instrucciones.ts` (regla de `design.md` §3);
      - `lib/interfaces/external/IAsistenteProvider.ts`;
      - `lib/utils/aviso-ubicacion-denegada.ts`;
      - `lib/services/email/plantillas/otp-codigo.ts`;
      - `DEFAULT_FROM_NAME` en `lib/config/email.ts`;
      - los títulos de `lib/api/openapi-spec.ts` y `app/api-docs/route.ts`;
      - el `alt` de `app/(app)/_components/Sidebar.tsx`, si sigue ahí.

      En `public/sw.js`, `public/offline.html` y las etiquetas de capturas de `public/manifest.json`
      el nombre va literal. **Hecho:** R2 y R6 se cumplen. Los tests de contrato afirman el literal
      (R19): `PushOptIn.test.tsx`, `instrucciones.test.ts`, `email-config.test.ts`,
      `nodemailer-email-sender.test.ts`, `aviso-ubicacion-denegada.test.ts`, `pwa-push.guardia`,
      `pwa-manifiesto-atajos.guardia`, `pwa-servida-sin-sesion.guardia` y
      `email-notificacion.test.ts`.
- [x] **T2.2** Quitar sus entradas de la guardia; `./init.sh`, commit y push.

## T3 — Lo técnico de la plataforma (clases C y C'; depende de T2)

- [x] **T3.1** [P] Almacenamiento, eventos, mensajes y `tag` del service worker, y la cookie, todo
      según `design.md` §5 (R9). **Hecho:** los tests de contrato afirman los nombres nuevos:
      `pwa-relevo-y-purga.guardia`, `usePushEnVentana.test.tsx`, `useTonoAlIncrementar.test.tsx`,
      `tema-encendido.guardia` (la regex de la línea 449), `AppLayout.test.tsx` y
      `preferencia-columnas.test.ts`.
- [x] **T3.2** [P] Las cabeceras de firma, en `lib/crypto/webhook-firma.ts` y `lib/api/openapi-spec.ts`
      (R10). **Hecho:** `webhook-firma.test.ts`, `webhook-sender.test.ts`,
      `openapi-webhook-estado-actualizado.test.ts` y `webhook-estado-service.test.ts` afirman las
      cabeceras nuevas. Un caso nuevo comprueba que el OpenAPI no documenta ninguna otra cabecera
      de firma.
- [x] **T3.3** [P] El prefijo de las llaves (R11):
      - `API_KEY_PREFIX = "svl_"` y `PREFIX_VISIBLE_CHARS = API_KEY_PREFIX.length + 7`;
      - `WEBHOOK_SECRET_PREFIX = "svl_whsec_"`;
      - los textos `Bearer …` de `lib/api/openapi-spec.ts`;
      - los comentarios de `middleware.ts`, `app/api/ordenes/api-key/**`, `ApiKeyService.ts`,
        `WebhookEstadoService.ts`, `lib/types/api-key.ts`, `IApiKeyRepository.ts` y
        `db/schema.prisma`.

      **Hecho:**
      - `api-key-generator.test.ts` afirma los literales `"svl_"` y 11;
      - `api-key-hash.test.ts` y los tests de ruta de API key afirman el prefijo nuevo;
      - un caso de `api-key-auth-service.test.ts` comprueba que una key `ordx_…` recibe el mismo 401
        que una key desconocida.
- [x] **T3.4** [P] La base local (R12). **Hecho:** `analitica-rollup-handler.test.ts` acepta
      `localhost:5432/servi_logistic` y rechaza tanto `localhost:5432/ordenex` como un host remoto.
      Los `DATABASE_URL` por defecto de `tests/integration/db/*` pasan a `servi_logistic`.
- [x] **T3.5** Quitar sus entradas de la guardia; `./init.sh`, commit y push.

## T4 — La empresa en la wallet (clases B y B'; depende de T3)

- [x] **T4.1** Pasar a `EMPRESA`, interpolado en el mismo `Record`. Los ejemplos pasan a «Mensajería
      Ejemplo». Archivos:
      - `lib/constants/wallet-rotulos.ts` y `lib/constants/origen-legible-rotulos.ts`;
      - todo `app/(app)/wallet/**` y `app/(app)/mi-wallet/**`;
      - todo `components/shared/wallet/**` y `components/shared/estado-cuenta/**`;
      - `components/shared/sinpe-textos.ts`;
      - los textos de `lib/utils/estado-cuenta*.ts`, `lib/utils/descripcion-*.ts`, `lib/types/wallet*.ts`
        y `lib/actions/{wallet*,abono-tienda,estado-cuenta}.ts`.

      **Hecho:** R3 se cumple en la wallet. Sus tests de contrato afirman el literal nuevo (R19):
      `nombres-wallet-461`, `wallet-textos-458`, `caja-textos-459`, `wallet-labels`,
      `mi-wallet-labels`, `wallet-conceptos-manuales`, `wallet-registrar-movimiento-dialog`,
      `desglose-tienda-labels`, `saldo-tienda-card.negativo` y los componentes de la wallet.
- [x] **T4.2** [P] R4: un caso con `vi.mock` («Acme Envíos») en `wallet-labels.test.ts` y otro en
      `EstadoCuenta.test.tsx`. **Hecho:** los dos pasan en rojo si un rótulo vuelve a escribir el
      nombre a mano.
- [x] **T4.3** [P] R21: `tests/integration/wallet-page.test.tsx` y
      `tests/integration/mi-wallet-page.test.tsx` comprueban la página renderizada:
      - no contiene el patrón de `nombre-heredado.ts`;
      - no contiene «Servi Logistic» en los textos de dinero;
      - sí contiene «La empresa» / «la empresa».

      **Hecho:** cada caso pasa en rojo si se revierte un rótulo.
- [x] **T4.4** Quitar sus entradas; `./init.sh`, commit y push.

## T5 — La empresa en cierres y analítica (clase B; depende de T4)

- [x] **T5.1** Pasar los textos de:
      - `app/(app)/cierres-admin/**`, `app/(app)/cierre-dia/**` y `app/(app)/analitica/**`;
      - `lib/analytics/metrics.ts`: solo `etiqueta` y `descripcion`, el `id` es de T7;
      - los servicios de cierre que componen textos.

      **Hecho:** estos tests de contrato afirman el literal nuevo: `cierre-bodega-vocabulario`,
      `factura-contraste`, `rechazo-nombre-466-app`, `etiquetas-visibles`, `TableroFinanciero`,
      `ProductosTablaDinero` y los componentes de cierres.
- [x] **T5.2** [P] R4: un caso con `vi.mock` en `CierreBodegaDetalleCascadas.test.tsx` y otro en
      `metrics.test.ts`.
- [x] **T5.3** Quitar sus entradas; `./init.sh`, commit y push.

## T6 — La empresa en el resto y en los PDF (clase B; depende de T5)

- [x] **T6.1** Pasar los textos de:
      - el historial: `lib/types/historial-accion*.ts`;
      - las plantillas: `lib/types/plantilla-datos.ts`, sin las líneas de el dominio de Ordenex;
      - `app/(app)/{configuracion,novedades,ordenes,mis-asignaciones}/**`;
      - el resto de `lib/types/**` y `lib/utils/**` con texto visible.

      **Hecho:** `catalogo-y-choke-point`, `HistorialAccionesAbonoTienda457` y `plantilla-datos`
      afirman el literal nuevo.
- [x] **T6.2** El rótulo de la etiqueta, en `lib/pdf/etiquetas-dibujo.ts` y
      `lib/pdf/etiquetas-maqueta.ts` (R7). **Hecho:**
      - `etiquetas-verificacion.ts` y `etiquetas-pdf-lote.smoke.test.ts` afirman «GUÍA»;
      - con el mock de membrete «Acme Envíos», afirman «ACME ENVÍOS · GUÍA»;
      - un caso apoyado en `pdf-inspector.ts` comprueba que los dos rótulos terminan antes del
        recuadro del número de guía.
- [x] **T6.3** [P] Los informes de `lib/whatsapp-envios/informes/{transito,picking}/` (R8).
      **Hecho:** `informe-transito-pdf.test.ts` y `picking-pdf.test.ts` afirman que el encabezado
      y el sello van sin nombre, y que con el mock de membrete sí lo llevan.
- [x] **T6.4** [P] R4: un caso con `vi.mock` en `catalogo-y-choke-point.test.ts` y otro en
      `plantilla-datos.test.ts`.
- [x] **T6.5** Quitar sus entradas; `./init.sh`, commit y push.

## T7 — Identificadores (clase D; depende de T6)

- [x] **T7.1** Volver a medir los identificadores, en producción y en tests, y guardar la lista en
      `progress/impl_SL-15.md`.
- [x] **T7.2** Renombrar `lib/utils/ingreso-ordenex.ts` a `lib/utils/ingreso-empresa.ts`, y cada
      identificador según el glosario de `design.md` §3, incluidos los nombres locales de los tests.
      `tests/unit/utils/ingreso-ordenex.test.ts` conserva su nombre, porque es excepción de ruta que retira SL-27,
      pero su contenido se limpia. **Hecho:**
      - typecheck, lint y suite en verde;
      - `test-citado-desaparecido.guardia` en verde;
      - las rutas literales de `caja-173-alcance`, `flete-por-rechazo-censo`,
        `cierre-dia-repository.test.ts` y `LandingPage.test.tsx` apuntan al archivo nuevo.
- [x] **T7.3** Quitar sus entradas; `./init.sh`, commit y push.

## T8 — Comentarios de producción (clase E; depende de T7)

- [x] **T8.1** Corregir los comentarios que quedan en `app/`, `lib/`, `components/`, `hooks/`,
      `scripts/`, `db/schema.prisma` y `.github/workflows/gate.yml`, y los restos que SL-8 haya
      dejado en sus archivos, por ejemplo `app/_landing/LandingPoliticas.tsx`. En
      `db/schema.prisma` se cambian las 47 apariciones (46 de la palabra y 1 de `ordx_`). Todas están
      en comentarios (`design.md` §4), así que no se renombra ningún modelo, campo, enum ni `@map`
      (R14b). **Hecho:** `pnpm exec prisma validate` pasa en verde, y el diff de `db/schema.prisma`
      solo toca líneas de comentario.
- [x] **T8.2** Quitar sus entradas; `./init.sh`, commit y push.

## T9 — Migraciones (clase G; depende de T8)

- [x] **T9.1** Editar en sitio los 19 archivos de migración de `Archivos esperados` (R14):
      - los comentarios, con el criterio de E;
      - el mensaje de `RAISE EXCEPTION` del `down.sql` de la 457.

      Quedan fuera las migraciones del usuario maestro, que son de SL-11, y estas dos de SL-13: la
      `459` y `20260827160000_orden_num_remision_unico_parcial`. No
      se renombra ninguna carpeta y no se consolida nada (eso es SL-28). Los tests que leen esas
      migraciones cambian a la vez: `caja-tesoreria-migration`, `abono-tienda-457-migration` y
      `orden-num-remision-por-tienda`. `orden-num-remision-parcial` lee la migración de SL-13: si su
      mención está ahí, la cubre la excepción de SL-13. **Hecho:** `git grep` de la palabra sobre `db/migrations/` solo
      devuelve los archivos que cubren las excepciones de SL-11 y SL-13.
- [x] **T9.2** Probar el esquema: `prisma migrate reset` sobre una base local vacía y, después,
      `prisma migrate diff --from-migrations db/migrations --to-schema-datamodel db/schema.prisma`.
      **Hecho:** el diff sale vacío, los tests de integración de `tests/integration/db/` están en
      verde, y en `progress/impl_SL-15.md` queda anotado que las bases locales se rehacen con
      `prisma migrate reset`.
- [x] **T9.3** Quitar sus entradas; `./init.sh`, commit y push.

## T10 — Barrido de tests y e2e (clase F; depende de T9)

- [x] **T10.1** Reescribir los comentarios, los nombres de caso y los datos que no son contrato en
      `tests/` y `e2e/` (R20). Los valores neutros están en `design.md` §2 F. **Hecho:** lo que el
      test comprueba no cambia; antes de tocar cada `expect` se revisa si es contrato.
- [x] **T10.2** Quitar las entradas `SL-15` que queden; `./init.sh`, commit y push.

## T11 — Cierre (depende de T10)

- [x] **T11.1** Ninguna excepción con `retira: "SL-15"`. Solo quedan las de `design.md` §7 cuya ficha
      todavía no está integrada (R16).
- [x] **T11.2** Revisar el diff contra `dev` (R18):
      - `git diff --name-only dev... -- specs` no lista nada;
      - ningún archivo de `arnes.manifest` está en `git diff --name-only dev...`;
      - en `git diff -U0 dev...`, ninguna línea `-` con el dominio de Ordenex, el integrador, una provincia,
        `SINPE` o `₡` tiene una línea `+` que cambie algo más que la palabra.

      **Hecho:** el resultado queda en `progress/impl_SL-15.md`.
- [ ] **T11.3** Comprobación visual (`docs/verification.md`) de `/wallet`, `/mi-wallet`,
      `/cierres-admin`, `/analitica`, la etiqueta PDF, `/configuracion/api` (una key nueva empieza
      por `svl_`) y el aviso de versión nueva. **Hecho:** la evidencia queda en
      `progress/impl_SL-15.md`.
- [x] **T11.4** El mapa `R → test` queda completo y `./init.sh` termina con código 0 (R22).

## Trazabilidad prevista

| R | Test |
|---|---|
| R1 | `tests/unit/config/marca.test.ts` |
| R2 | `tests/components/PushOptIn.test.tsx`, `tests/unit/asistente/instrucciones.test.ts`, `tests/unit/config/email-config.test.ts`, `tests/unit/utils/aviso-ubicacion-denegada.test.ts` |
| R3 | los tests de contrato de T4.1, T5.1 y T6.1 |
| R4 | los casos con `vi.mock` de T4.2, T5.2, T6.2, T6.3 y T6.4 |
| R5, R6 | `tests/unit/guards/marca-estaticos.guardia.test.ts` |
| R7 | `tests/unit/pdf/etiquetas-pdf-lote.smoke.test.ts` y el caso de ajuste de T6.2 |
| R8 | `tests/unit/pdf/informe-transito-pdf.test.ts`, `tests/unit/whatsapp-envios/picking-pdf.test.ts` |
| R9 | `tests/unit/guards/pwa-relevo-y-purga.guardia.test.ts`, `tests/unit/hooks/usePushEnVentana.test.tsx`, `tests/unit/guards/tema-encendido.guardia.test.ts` |
| R10 | `tests/unit/clients/webhook-sender.test.ts`, `tests/unit/api/openapi-webhook-estado-actualizado.test.ts` |
| R11 | `tests/unit/utils/api-key-generator.test.ts`, `tests/unit/services/api-key-auth-service.test.ts` |
| R12 | `tests/unit/services/analitica-rollup-handler.test.ts` |
| R13 | typecheck, la suite y `tests/unit/guards/sin-nombre-heredado.guardia.test.ts` |
| R14 | `tests/unit/guards/sin-nombre-heredado.guardia.test.ts` y la comprobación de esquema de T9.2 |
| R14b | `tests/unit/guards/sin-nombre-heredado.guardia.test.ts` y el `prisma migrate diff` vacío de T9.2 |
| R15, R16, R17 | `tests/unit/guards/sin-nombre-heredado.guardia.test.ts`, con su autocomprobación |
| R18 | la revisión del diff de T11.2 |
| R19 | los tests de contrato de T2 a T9, que afirman literales |
| R20 | `tests/unit/guards/sin-nombre-heredado.guardia.test.ts`, que también recorre `tests/` y `e2e/` |
| R21 | `tests/integration/wallet-page.test.tsx`, `tests/integration/mi-wallet-page.test.tsx` |
| R22 | `./init.sh` al cerrar cada tanda |

## Archivos esperados

Producción:

- `lib/config/marca.ts`
- `lib/utils/ingreso-empresa.ts`
- `lib/utils/ingreso-ordenex.ts`
- `middleware.ts`
- `app/layout.tsx`
- `app/page.tsx`
- `app/globals.css`
- `app/_landing/LandingPoliticas.tsx`
- `app/_landing/LandingPostular.tsx`
- `app/_landing/LandingNav.tsx`
- `app/_landing/LandingFooter.tsx`
- `app/_landing/primitivas.tsx`
- `app/api-docs/route.ts`
- `app/api/ordenes/api-key/route.ts`
- `app/api/ordenes/api-key/carga/route.ts`
- `app/api/ordenes/api-key/analitica/route.ts`
- `app/(app)/_components/Sidebar.tsx`
- `app/(app)/analitica/_components/entregas/DineroProductoDetalle.tsx`
- `app/(app)/analitica/_components/entregas/ProductosTabla.tsx`
- `app/(app)/analitica/_components/entregas/analitica-productos-descarga-columnas.ts`
- `app/(app)/analitica/_components/finanzas/cargar-kpis.ts`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/CascadasCierreMensajero.tsx`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `app/(app)/cierres-admin/_components/DesglosePorTienda.tsx`
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`
- `app/(app)/cierres-admin/_components/cierre-factura.tsx`
- `app/(app)/cierres-admin/_components/cierre-labels.ts`
- `app/(app)/cierres-admin/_components/cierres-bodega-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts`
- `app/(app)/configuracion/api/_components/ApiKeysModule.tsx`
- `app/(app)/configuracion/envios-whatsapp/page.tsx`
- `app/(app)/configuracion/tarifas/_components/CrearZonaForm.tsx`
- `app/(app)/configuracion/tarifas/_components/tarifas-labels.ts`
- `app/(app)/mi-wallet/page.tsx`
- `app/(app)/mi-wallet/_components/MiEstadoCuenta.tsx`
- `app/(app)/mi-wallet/_components/ResumenMiWallet.tsx`
- `app/(app)/mi-wallet/_components/VerComprobanteMiMovimiento.tsx`
- `app/(app)/mi-wallet/_components/mi-estado-cuenta-descarga-columnas.ts`
- `app/(app)/mi-wallet/_components/mi-estado-cuenta-labels.ts`
- `app/(app)/mi-wallet/_components/mi-wallet-labels.ts`
- `app/(app)/mis-asignaciones/_components/GestionarOrdenPanel.tsx`
- `app/(app)/novedades/_components/GestionarDesdeAyudaModal.tsx`
- `app/(app)/novedades/_components/RechazarNovedadModal.tsx`
- `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx`
- `app/(app)/ordenes/_components/EtiquetaGuia.tsx`
- `app/(app)/ordenes/_components/carga-masiva-clasificacion.ts`
- `app/(app)/ordenes/_components/ordenes-descarga-columnas.ts`
- `app/(app)/wallet/page.tsx`
- `app/(app)/wallet/_components/BarraComposicionCaja.tsx`
- `app/(app)/wallet/_components/CajaResumenCard.tsx`
- `app/(app)/wallet/_components/ComposicionGananciaCard.tsx`
- `app/(app)/wallet/_components/DesgloseEgresosLista.tsx`
- `app/(app)/wallet/_components/DetalleFilaComposicion.tsx`
- `app/(app)/wallet/_components/FilaComposicion.tsx`
- `app/(app)/wallet/_components/WalletLedger.tsx`
- `app/(app)/wallet/_components/WalletModule.tsx`
- `app/(app)/wallet/_components/composicion-detalle-labels.ts`
- `app/(app)/wallet/_components/libro-caja-labels.ts`
- `app/(app)/wallet/_components/wallet-conceptos-manuales.ts`
- `app/(app)/wallet/_components/wallet-labels.ts`
- `app/(app)/wallet/mensajeros/_components/EstadoCuentaMensajero.tsx`
- `app/(app)/wallet/mensajeros/_components/estado-cuenta-mensajero-labels.ts`
- `app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels.ts`
- `app/(app)/wallet/satelites/page.tsx`
- `app/(app)/wallet/satelites/_components/satelites-labels.ts`
- `app/(app)/wallet/tiendas/_components/EstadoCuentaAcciones.tsx`
- `app/(app)/wallet/tiendas/_components/EstadoCuentaTienda.tsx`
- `app/(app)/wallet/tiendas/_components/PagosTiendaEstadoCuenta.tsx`
- `app/(app)/wallet/tiendas/_components/SaldosTiendasTable.tsx`
- `app/(app)/wallet/tiendas/_components/desglose-tienda-labels.ts`
- `app/(app)/wallet/tiendas/_components/estado-cuenta-tienda-labels.ts`
- `components/shared/AsistentePanel.tsx`
- `components/shared/AvisoVersionNueva.tsx`
- `components/shared/PushOptIn.tsx`
- `components/shared/RevisionSinpeBodega.tsx`
- `components/shared/sinpe-textos.ts`
- `components/shared/estado-cuenta/EstadoCuenta.tsx`
- `components/shared/estado-cuenta/TarjetasEstadoCuenta.tsx`
- `components/shared/estado-cuenta/estado-cuenta-descarga-columnas.ts`
- `components/shared/estado-cuenta/estado-cuenta-labels.ts`
- `components/shared/estado-cuenta/estado-cuenta-lineas.ts`
- `components/shared/wallet/DetalleMovimientoPanel.tsx`
- `components/shared/wallet/RegistrarMovimientoDialog.tsx`
- `components/shared/wallet/conceptos-filtro.ts`
- `components/shared/wallet/detalle-movimiento-panel-labels.ts`
- `components/shared/wallet/registrar-movimiento-labels.ts`
- `hooks/usePreferenciaColumnas.ts`
- `hooks/usePreferenciaSonido.ts`
- `public/manifest.json`
- `public/offline.html`
- `public/sw.js`
- `scripts/contraste-454.ts`
- `scripts/drenar-jobs.ts`
- `scripts/rollup-analitica-manual.ts`
- `db/schema.prisma`
- `.github/workflows/gate.yml`
- `lib/actions/abono-tienda.ts`
- `lib/actions/estado-cuenta.ts`
- `lib/actions/rechazo-tienda-cobro.ts`
- `lib/actions/wallet-anulacion.ts`
- `lib/actions/wallet-tienda.ts`
- `lib/actions/wallet.ts`
- `lib/analytics/metrics.ts`
- `lib/api/openapi-spec.ts`
- `lib/asistente/instrucciones.ts`
- `lib/audio/preferencia-sonido.ts`
- `lib/auth/menu-visibility.ts`
- `lib/columnas/preferencia-columnas.ts`
- `lib/config/composicion-detalle.ts`
- `lib/config/email.ts`
- `lib/config/wallet-tienda.ts`
- `lib/constants/origen-legible-rotulos.ts`
- `lib/constants/wallet-rotulos.ts`
- `lib/crypto/webhook-firma.ts`
- `lib/interfaces/external/IAsistenteProvider.ts`
- `lib/interfaces/repositories/IAbonoTiendaRepository.ts`
- `lib/interfaces/repositories/IAjusteCajaAnulacionRepository.ts`
- `lib/interfaces/repositories/IApiKeyRepository.ts`
- `lib/interfaces/repositories/ICierreDiaRepository.ts`
- `lib/interfaces/repositories/ICobroTiendaAnulacionRepository.ts`
- `lib/interfaces/repositories/IComoQuedoRepository.ts`
- `lib/interfaces/repositories/ICuentasPorPagarAnaliticaRepository.ts`
- `lib/interfaces/repositories/IEstadoCuentaRepository.ts`
- `lib/interfaces/repositories/ILibroCajaAutoriaRepository.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/interfaces/repositories/IOrigenLegibleRepository.ts`
- `lib/interfaces/repositories/ITarifaVigenteRepository.ts`
- `lib/interfaces/repositories/IWalletComprobanteRepository.ts`
- `lib/interfaces/repositories/IWalletMovimientoRepository.ts`
- `lib/interfaces/repositories/IWalletTiendaMovimientoRepository.ts`
- `lib/interfaces/services/IAbonoTiendaService.ts`
- `lib/interfaces/services/ICajaAbonoTiendaFeedService.ts`
- `lib/interfaces/services/ICajaCobroTiendaFeedService.ts`
- `lib/interfaces/services/ICajaPagoTiendaFeedService.ts`
- `lib/interfaces/services/ICajaPremioRankingFeedService.ts`
- `lib/interfaces/services/ICierreBodegaService.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/interfaces/services/ICierresBodegaAdminService.ts`
- `lib/interfaces/services/ICobroTiendaService.ts`
- `lib/interfaces/services/IEgresoCajaAnulacionService.ts`
- `lib/interfaces/services/IEstadoCuentaService.ts`
- `lib/interfaces/services/IRechazoTiendaCobroService.ts`
- `lib/interfaces/services/IWalletService.ts`
- `lib/manifiesto/preferencia-columnas.ts`
- `lib/pdf/etiquetas-dibujo.ts`
- `lib/pdf/etiquetas-maqueta.ts`
- `lib/pwa/actualizacion.ts`
- `lib/repositories/AbonoTiendaRepository.ts`
- `lib/repositories/AjusteCajaAnulacionRepository.ts`
- `lib/repositories/CierreBodegaRepository.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/repositories/CobroTiendaAnulacionRepository.ts`
- `lib/repositories/ComoQuedoRepository.ts`
- `lib/repositories/EgresoCajaDocumentosRepository.ts`
- `lib/repositories/EstadoCuentaRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/repositories/RechazoTiendaCobroRepository.ts`
- `lib/repositories/WalletTiendaMovimientoRepository.ts`
- `lib/repositories/ZonaRepository.ts`
- `lib/repositories/libro-caja-a-quien-sql.ts`
- `lib/services/AbonoTiendaService.ts`
- `lib/services/AnaliticaFinancieraService.ts`
- `lib/services/ApiKeyService.ts`
- `lib/services/AporteCapitalService.ts`
- `lib/services/BulkOrdenService.ts`
- `lib/services/CajaAbonoTiendaFeedService.ts`
- `lib/services/CajaCobroTiendaFeedService.ts`
- `lib/services/CajaCodFeedService.ts`
- `lib/services/CajaPremioRankingFeedService.ts`
- `lib/services/CierreDiaService.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/CierresBodegaAdminService.ts`
- `lib/services/CobroTiendaService.ts`
- `lib/services/ConteoProductosService.ts`
- `lib/services/CorregirDatosClienteService.ts`
- `lib/services/CotizacionOrdenService.ts`
- `lib/services/DetalleDineroProductoService.ts`
- `lib/services/DetalleEnLoteService.ts`
- `lib/services/EgresoCajaAnulacionService.ts`
- `lib/services/EstadoCuentaService.ts`
- `lib/services/LibroCajaAutoriaService.ts`
- `lib/services/LiquidacionService.ts`
- `lib/services/OrigenLegibleService.ts`
- `lib/services/PagoPorCuentaTiendaService.ts`
- `lib/services/RechazoTiendaCobroService.ts`
- `lib/services/RechazoTiendaService.ts`
- `lib/services/WalletFeedService.ts`
- `lib/services/WalletService.ts`
- `lib/services/WalletTiendaFeedService.ts`
- `lib/services/WalletTiendaService.ts`
- `lib/services/WebhookEstadoService.ts`
- `lib/services/email/plantillas/otp-codigo.ts`
- `lib/tema/tema.ts`
- `lib/types/abono-tienda.ts`
- `lib/types/analitica-financiera.ts`
- `lib/types/api-key.ts`
- `lib/types/aporte-capital.ts`
- `lib/types/api-orden.ts`
- `lib/types/carga-masiva.ts`
- `lib/types/conteo-productos.ts`
- `lib/types/correccion-datos-cliente.ts`
- `lib/types/cotizacion.ts`
- `lib/types/dinero-productos.ts`
- `lib/types/efecto-movimiento.ts`
- `lib/types/estado-cuenta.ts`
- `lib/types/historial-accion-etiquetas.ts`
- `lib/types/historial-accion.ts`
- `lib/types/libro-caja-autoria.ts`
- `lib/types/orden.ts`
- `lib/types/pago-por-cuenta-tienda.ts`
- `lib/types/plantilla-datos.ts`
- `lib/types/rechazo-tienda-cobro.ts`
- `lib/types/tarifa.ts`
- `lib/types/wallet-anulacion.ts`
- `lib/types/wallet-comprobante-lateral.ts`
- `lib/types/wallet-filtros.ts`
- `lib/types/wallet-laterales.ts`
- `lib/types/wallet-mensajero.ts`
- `lib/types/wallet-tienda.ts`
- `lib/types/wallet.ts`
- `lib/utils/anotacion-de-fila.ts`
- `lib/utils/api-key-generator.ts`
- `lib/utils/aporte-por-orden.ts`
- `lib/utils/api-orden-costo.ts`
- `lib/utils/aviso-ubicacion-denegada.ts`
- `lib/utils/caja-tesoreria.ts`
- `lib/utils/cierre-detalle.ts`
- `lib/utils/comprobante.ts`
- `lib/utils/cuenta-por-pagar.ts`
- `lib/utils/descripcion-abono.ts`
- `lib/utils/descripcion-cobro-tienda.ts`
- `lib/utils/descripcion-pago-por-cuenta.ts`
- `lib/utils/desglose-tienda.ts`
- `lib/utils/dinero-por-producto.ts`
- `lib/utils/efecto-movimiento.ts`
- `lib/utils/egreso-anulable.ts`
- `lib/utils/estado-cuenta-chips.ts`
- `lib/utils/estado-cuenta.ts`
- `lib/utils/finanzas-diarias.ts`
- `lib/utils/invariante-tiendas.ts`
- `lib/utils/mapeo-concepto-tienda.ts`
- `lib/utils/mensaje-caracter-no-imprimible.ts`
- `lib/utils/nombre-imprimible-etiqueta.ts`
- `lib/utils/preferencia-navegacion.ts`
- `lib/utils/saldo-tienda.ts`
- `lib/utils/texto-imprimible-etiqueta.ts`
- `lib/utils/webhook-secret-generator.ts`
- `lib/whatsapp-envios/informes/picking/informe.ts`
- `lib/whatsapp-envios/informes/picking/pdf.ts`
- `lib/whatsapp-envios/informes/transito/pdf.ts`

Migraciones (se editan en sitio, R14):

- `db/migrations/20260712160000_wallet_movimiento/migration.sql`
- `db/migrations/20260803120000_caja_tesoreria/migration.sql`
- `db/migrations/20260815140000_orden_mensajero_meta_drop_nota/migration.sql`
- `db/migrations/20260825160000_orden_num_remision_unico_por_tienda/migration.sql`
- `db/migrations/20260831120000_rechazo_tienda_cobro/migration.sql`
- `db/migrations/20260907130000_historial_accion_zona_central_cambiada/migration.sql`
- `db/migrations/20260908140000_wallet_tienda_categoria_cobro_manual/migration.sql`
- `db/migrations/20260917120200_cierre_rechazo_tienda/migration.sql`
- `db/migrations/20260926120000_cobro_tienda_461_enums/migration.sql`
- `db/migrations/20260926120100_cobro_tienda_461_anulacion_y_checks/migration.sql`
- `db/migrations/20260926120200_cobro_tienda_461_completar_caja/migration.sql`
- `db/migrations/20260926120300_wallet_461_enum_anulacion_correccion/migration.sql`
- `db/migrations/20260926120400_wallet_461_idempotencia_y_anulacion_correccion/migration.sql`
- `db/migrations/20260926120500_wallet_461_fechas_cr_pagos/migration.sql`
- `db/migrations/20260927120000_abono_tienda_457_enums/migration.sql`
- `db/migrations/20260927120100_abono_tienda_457_tablas_y_checks/migration.sql`
- `db/migrations/20260927120100_abono_tienda_457_tablas_y_checks/down.sql`
- `db/migrations/20260928120100_wallet_458_tablas/migration.sql`
- `db/migrations/20261005120100_whatsapp_envios/migration.sql`

E2E:

- `e2e/mi-wallet.spec.ts`
- `e2e/wallet.spec.ts`
- `e2e/wallet-mensajeros.spec.ts`

Tests nuevos:

- `tests/fixtures/nombre-heredado.ts`
- `tests/unit/config/marca.test.ts`
- `tests/unit/guards/marca-estaticos.guardia.test.ts`
- `tests/unit/guards/sin-nombre-heredado.guardia.test.ts`

Tests existentes. Son los que hoy tienen la palabra o `ordx_`, menos los de las excepciones de
`design.md` §7:

- `tests/components/ApiKeyAccionCell.test.tsx`
- `tests/components/ApiKeysModule.test.tsx`
- `tests/components/AppLayout.test.tsx`
- `tests/components/AyudaDocumentoPage.test.tsx`
- `tests/components/BusquedaPorGuia469.test.tsx`
- `tests/components/CajaComposicionBarra.test.tsx`
- `tests/components/CajaResumenCard.test.tsx`
- `tests/components/ChatBurbujaContenido.test.tsx`
- `tests/components/ChatNoLeidos.test.tsx`
- `tests/components/CierreBodegaDesglosePorTienda.test.tsx`
- `tests/components/CierreBodegaDetalleCascadas.test.tsx`
- `tests/components/CierreBodegaDetalleGestiones.test.tsx`
- `tests/components/CierreBodegaTarjetaCascada.test.tsx`
- `tests/components/CierreCobrosDeLaGestion.test.tsx`
- `tests/components/CierreDetalleIncidente.test.tsx`
- `tests/components/CierreFacturaFilaIncidente.test.tsx`
- `tests/components/CierreFacturaSinGestionar.test.tsx`
- `tests/components/CierreMensajeroDesglosePorTienda.test.tsx`
- `tests/components/CierreMensajeroDetalleCascadas.test.tsx`
- `tests/components/CierreMotivoRechazoAutomatico.test.tsx`
- `tests/components/CierrePremioPendiente.test.tsx`
- `tests/components/CierreRechazosDeTienda.test.tsx`
- `tests/components/CierreTarifaAplicada.test.tsx`
- `tests/components/CierreTarifaEspecial.test.tsx`
- `tests/components/CierresAdminConfirmacionFisica.test.tsx`
- `tests/components/CierresAdminDeepLink.test.tsx`
- `tests/components/CierresAdminIndemnizacion.test.tsx`
- `tests/components/CierresAdminModule.test.tsx`
- `tests/components/CierresAdminPage.test.tsx`
- `tests/components/CierresAdminPagoMensajero.test.tsx`
- `tests/components/ColumnasPopoverReordenar.test.tsx`
- `tests/components/ComposicionGananciaCard.test.tsx`
- `tests/components/ConfiguracionApiPage.test.tsx`
- `tests/components/CorregirResultadoCierre.test.tsx`
- `tests/components/CuentasPorPagarTable.test.tsx`
- `tests/components/DescargarManifiestoColumnas.test.tsx`
- `tests/components/DesgloseTiendaAbono457.test.tsx`
- `tests/components/DetalleFilaComposicion.test.tsx`
- `tests/components/DetalleMiMovimientoCierre.test.tsx`
- `tests/components/DetalleMovimientoCierre.test.tsx`
- `tests/components/DetalleMovimientoPanel.test.tsx`
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`
- `tests/components/EscanerRecepcion.test.tsx`
- `tests/components/EscanerRecepcionBodegaCentral.test.tsx`
- `tests/components/EscanerRecepcionOrigen.test.tsx`
- `tests/components/EstadoCuenta.test.tsx`
- `tests/components/EstadoCuenta458DPantalla.test.tsx`
- `tests/components/EstadoCuentaAcciones.test.tsx`
- `tests/components/EstadoCuentaAnulados.test.tsx`
- `tests/components/EstadoCuentaMensajeroAnular.test.tsx`
- `tests/components/GenerarApiKeyForm.test.tsx`
- `tests/components/GestionarDesdeAyudaModal.test.tsx`
- `tests/components/GestionarOrdenUbicacionContexto.test.tsx`
- `tests/components/HistorialAccionesAbonoTienda457.test.tsx`
- `tests/components/LandingPage.test.tsx`
- `tests/components/Logo.test.tsx`
- `tests/components/MiWalletComprobante458.test.tsx`
- `tests/components/NotificationsBell.push.test.tsx`
- `tests/components/NotificationsBell.test.tsx`
- `tests/components/OrdenesCargaPreview.test.tsx`
- `tests/components/OrdenesDescargaColumnas.test.tsx`
- `tests/components/PagoMensajeroAcciones.test.tsx`
- `tests/components/PagosTiendaEstadoCuenta.test.tsx`
- `tests/components/ProductosTablaDinero.test.tsx`
- `tests/components/PushOptIn.test.tsx`
- `tests/components/QrScanner.test.tsx`
- `tests/components/RecoleccionModule.test.tsx`
- `tests/components/RecogerPaqueteCard.test.tsx`
- `tests/components/ResumenMiWallet.test.tsx`
- `tests/components/RevelarSecretosModal.test.tsx`
- `tests/components/TableroFinanciero.test.tsx`
- `tests/components/VerificarGuiaGate.test.tsx`
- `tests/components/WalletCaja463.test.tsx`
- `tests/components/WalletCaja468.test.tsx`
- `tests/components/WalletCajaBarra467.test.tsx`
- `tests/components/WalletCuentasPorPagarRefrescoP1.test.tsx`
- `tests/components/WalletFechaCostaRica459.test.tsx`
- `tests/components/WalletFiltroAQuien458E.test.tsx`
- `tests/components/WalletLedgerAcciones457.test.tsx`
- `tests/components/WalletLedgerAcciones459.test.tsx`
- `tests/components/WalletLedgerAcciones461.test.tsx`
- `tests/components/WalletLedgerVer458C.test.tsx`
- `tests/components/WalletLibroCaja458E.test.tsx`
- `tests/components/WalletRefrescoDirigido.test.tsx`
- `tests/components/descarga/CierresAdminDescargaDetallada.test.tsx`
- `tests/components/descarga/CierresBodegaDescargaDetallada.test.tsx`
- `tests/components/descarga/CierresDescarga.test.tsx`
- `tests/components/descarga/CierresDescargaColumnas.test.tsx`
- `tests/components/descarga/CierresDescargaNiveles.test.tsx`
- `tests/components/descarga/ConfiguracionDescarga.test.tsx`
- `tests/components/descarga/ControlDescargaTransversal.test.tsx`
- `tests/components/descarga/DescargarGestionesDialog.test.tsx`
- `tests/components/descarga/IncidentesDescarga.test.tsx`
- `tests/components/descarga/ProductosDescargaColumnas.test.tsx`
- `tests/components/descarga/WalletDescarga.test.tsx`
- `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx`
- `tests/fixtures/api-key-dependencias-usuario.ts`
- `tests/fixtures/dto-financiero-servido.ts`
- `tests/fixtures/estado-cuenta.ts`
- `tests/fixtures/gestion-detalle-478.ts`
- `tests/fixtures/plantilla-datos.ts`
- `tests/integration/actions/analitica-financiera-action.test.ts`
- `tests/integration/actions/novedades-pestana-por-url.test.ts`
- `tests/integration/actions/purga-postulaciones-recurso-route.test.ts`
- `tests/integration/api/ordenes-api-key-177-key-nunca-filtrada.route.test.ts`
- `tests/integration/api/ordenes-api-key-cancelar.route.test.ts`
- `tests/integration/api/ordenes-api-key-carga-generate.route.test.ts`
- `tests/integration/api/ordenes-api-key-carga.route.test.ts`
- `tests/integration/api/ordenes-api-key-eliminar.route.test.ts`
- `tests/integration/api/ordenes-api-key-filtros-scope-ajeno.route.test.ts`
- `tests/integration/api/ordenes-api-key-habilitar.route.test.ts`
- `tests/integration/api/ordenes-api-key-listado-codigo-anterior.route.test.ts`
- `tests/integration/api/ordenes-api-key-listado-filtros.route.test.ts`
- `tests/integration/api/ordenes-api-key-listado.route.test.ts`
- `tests/integration/api/ordenes-api-key-orden-consulta.route.test.ts`
- `tests/integration/api/ordenes-api-key-orden-generate.route.test.ts`
- `tests/integration/api/ordenes-api-key-seguridad.route.test.ts`
- `tests/integration/api/ordenes-api-key-tienda-destino-aislamiento.route.test.ts`
- `tests/integration/api/ordenes-api-key-tienda-destino.route.test.ts`
- `tests/integration/api/procesar-jobs-whatsapp-bienvenida.test.ts`
- `tests/integration/api/webhook-evidencias-url-resuelve.route.test.ts`
- `tests/integration/asimetria-sin-tarifa.test.ts`
- `tests/integration/asistente-route.test.ts`
- `tests/integration/carga-api-etiquetas.test.ts`
- `tests/integration/carga-api-key-sin-tarifa.test.ts`
- `tests/integration/cotizacion-api-key.test.ts`
- `tests/integration/mi-wallet-page.test.tsx`
- `tests/integration/purga-pdf-regenera-177.test.ts`
- `tests/integration/repositories/dinero-productos.int.test.ts`
- `tests/integration/wallet-page.test.tsx`
- `tests/integration/wallet-satelites.test.tsx`
- `tests/integration/wallet-tiendas-page.test.tsx`
- `tests/integration/db/455/caracterizacion/webhook-estado.test.ts`
- `tests/integration/db/486-evidencias-cierres-sql-real.test.ts`
- `tests/integration/db/_fixtures/caja-459.ts`
- `tests/integration/db/_fixtures/escrituras-459.ts`
- `tests/integration/db/abono-tienda-457-concurrencia.test.ts`
- `tests/integration/db/abono-tienda-457-migration.test.ts`
- `tests/integration/db/abono-tienda-457.test.ts`
- `tests/integration/db/analitica-anulacion-rechazo-458.test.ts`
- `tests/integration/db/analytics-daily-job.test.ts`
- `tests/integration/db/analytics-daily-migration.test.ts`
- `tests/integration/db/aporte-capital.test.ts`
- `tests/integration/db/api-key-eliminar.test.ts`
- `tests/integration/db/api-key-migration.test.ts`
- `tests/integration/db/caja-caracterizacion-459.test.ts`
- `tests/integration/db/caja-invariante-tiendas.test.ts`
- `tests/integration/db/caja-tesoreria-idempotencia.test.ts`
- `tests/integration/db/caja-tesoreria-migration.test.ts`
- `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts`
- `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts`
- `tests/integration/db/cobro-tienda-461.test.ts`
- `tests/integration/db/como-quedo.test.ts`
- `tests/integration/db/composicion-detalle-postgres.test.ts`
- `tests/integration/db/correccion-resultado-gestion-migration.test.ts`
- `tests/integration/db/detalle-en-lote-464.test.ts`
- `tests/integration/db/efecto-movimiento-predice.test.ts`
- `tests/integration/db/estado-cuenta-servidor-458d.test.ts`
- `tests/integration/db/historial-accion-cobro-tienda-migration.test.ts`
- `tests/integration/db/historial-accion-conciliacion-bodega-migration.test.ts`
- `tests/integration/db/historial-accion-orden-zona-reconciliada-migration.test.ts`
- `tests/integration/db/historial-accion-q1-ubicacion.test.ts`
- `tests/integration/db/historial-accion-zona-pago-mensajero-migration.test.ts`
- `tests/integration/db/historial-accion-zona-sinpe-migration.test.ts`
- `tests/integration/db/job-tipo-analitica-invalidacion-migration.test.ts`
- `tests/integration/db/job-tipo-analitica-rollup-migration.test.ts`
- `tests/integration/db/libro-caja-a-quien.test.ts`
- `tests/integration/db/libro-caja-filtro-a-quien.test.ts`
- `tests/integration/db/libro-caja-revision-458c.test.ts`
- `tests/integration/db/liquidacion-pago-tienda-458-concurrencia.test.ts`
- `tests/integration/db/notificacion-evento-webhook-suscripcion-migration.test.ts`
- `tests/integration/db/orden-incidente-migration.test.ts`
- `tests/integration/db/orden-remision-borrada-libera-numero.test.ts`
- `tests/integration/db/orden-traspaso-migration.test.ts`
- `tests/integration/db/pago-por-cuenta-tienda-concurrencia.test.ts`
- `tests/integration/db/premio-ranking-devengo-migration.test.ts`
- `tests/integration/db/resolver-novedad-reprograma-dinero.test.ts`
- `tests/integration/db/wallet-461-idempotencia-clave.test.ts`
- `tests/integration/db/wallet-caracterizacion-458.test.ts`
- `tests/integration/db/wallet-comprobante-alcance.test.ts`
- `tests/integration/db/wallet-documento-comprobante-458.test.ts`
- `tests/integration/db/wallet-fecha-elegida.test.ts`
- `tests/integration/db/wallet-migration.test.ts`
- `tests/integration/db/wallet-tienda-cobro.test.ts`
- `tests/integration/db/webhook-evidencias-url-resuelve-sql-real.test.ts`
- `tests/unit/actions/api-keys-descarga-action.test.ts`
- `tests/unit/actions/api-keys-eliminar.test.ts`
- `tests/unit/actions/api-keys-listar.test.ts`
- `tests/unit/actions/api-keys.test.ts`
- `tests/unit/actions/wallet-actions.test.ts`
- `tests/unit/actions/wallet-caja-descarga-action.test.ts`
- `tests/unit/actions/wallet-egresos-actions.test.ts`
- `tests/unit/actions/wallet-tienda-cobro-action.test.ts`
- `tests/unit/actions/webhooks-action.test.ts`
- `tests/unit/analytics/_dinero-falso.ts`
- `tests/unit/analytics/alcance-dinero.guardia.test.ts`
- `tests/unit/analytics/conteo-productos-dinero.test.ts`
- `tests/unit/analytics/detalle-dinero-producto.test.ts`
- `tests/unit/analytics/dinero-producto-no-sumable.guardia.test.ts`
- `tests/unit/analytics/etiquetas-visibles.guardia.test.ts`
- `tests/unit/analytics/export-csv-frontera.guardia.test.ts`
- `tests/unit/analytics/financiera-borde.guardia.test.ts`
- `tests/unit/analytics/financiera-contratos.test.ts`
- `tests/unit/analytics/financiera-correspondencia.guardia.test.ts`
- `tests/unit/analytics/financiera-desglose-ids.guardia.test.ts`
- `tests/unit/analytics/financiera-forma-importe.guardia.test.ts`
- `tests/unit/analytics/financiera-granularidad.test.ts`
- `tests/unit/analytics/financiera-ingresos-repo.test.ts`
- `tests/unit/analytics/finanzas-diario.test.ts`
- `tests/unit/analytics/fulfillment-fuera-de-la-formula.guardia.test.ts`
- `tests/unit/analytics/kpis-financieros.test.ts`
- `tests/unit/analytics/metrics-caja-naturaleza.guardia.test.ts`
- `tests/unit/analytics/metrics-cuenta-por-pagar-tienda-457.test.ts`
- `tests/unit/analytics/metrics.test.ts`
- `tests/unit/analytics/tablero-financiero-cargar.test.ts`
- `tests/unit/analytics/tablero-operativo-frontera.guardia.test.ts`
- `tests/unit/api/analitica-api-key-route.test.ts`
- `tests/unit/api/openapi-266-habilitar.test.ts`
- `tests/unit/api/openapi-320-eliminar.test.ts`
- `tests/unit/api/openapi-405-gestiones.test.ts`
- `tests/unit/api/openapi-406-evidencias-url.test.ts`
- `tests/unit/api/openapi-webhook-contrato.test.ts`
- `tests/unit/api/openapi-webhook-estado-actualizado.test.ts`
- `tests/unit/api/ordenes-api-key-composicion-415.test.ts`
- `tests/unit/app/tarifas/DescargarCoberturaButton.test.tsx`
- `tests/unit/asistente/instrucciones.test.ts`
- `tests/unit/auth/menu-visibility.test.ts`
- `tests/unit/auth/middleware.test.ts`
- `tests/unit/clients/google-route-optimization.test.ts`
- `tests/unit/clients/webhook-sender.test.ts`
- `tests/unit/clients/whatsapp-app-id.test.ts`
- `tests/unit/columnas/orden-efectivo.test.ts`
- `tests/unit/components/api-key-eliminar.ui.test.tsx`
- `tests/unit/components/api-keys-module.eliminar.test.tsx`
- `tests/unit/components/desglose-tienda-labels.test.ts`
- `tests/unit/components/desglose-tienda-ledger.test.tsx`
- `tests/unit/components/mi-wallet-labels.test.ts`
- `tests/unit/components/ordenes-columns.test.tsx`
- `tests/unit/components/rechazo-nombre-466-app.test.ts`
- `tests/unit/components/saldo-tienda-card.negativo.test.tsx`
- `tests/unit/components/wallet-conceptos-manuales.test.ts`
- `tests/unit/components/wallet-indemnizacion-libro.test.tsx`
- `tests/unit/components/wallet-labels.test.ts`
- `tests/unit/components/wallet-ledger-dueno.test.tsx`
- `tests/unit/components/wallet-page-cobros-pendientes.test.tsx`
- `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx`
- `tests/unit/config/email-config.test.ts`
- `tests/unit/config/push-config.test.ts`
- `tests/unit/crypto/webhook-firma.test.ts`
- `tests/unit/crypto/webhook-secret-cipher.test.ts`
- `tests/unit/db/orden-num-remision-parcial.test.ts`
- `tests/unit/db/orden-num-remision-por-tienda.test.ts`
- `tests/unit/descarga/analitica-productos-descarga-columnas.test.ts`
- `tests/unit/descarga/api-keys-descarga-columnas.test.ts`
- `tests/unit/descarga/censo-tablas.ts`
- `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts`
- `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts`
- `tests/unit/descarga/cierres-gestiones-paridad.test.ts`
- `tests/unit/descarga/cobertura-tablas.guardia.test.ts`
- `tests/unit/descarga/estado-cuenta-descarga-columnas.test.ts`
- `tests/unit/descarga/libro-kardex-468.test.ts`
- `tests/unit/descarga/wallet-caja-descarga-columnas.test.ts`
- `tests/unit/descarga/wallet-tienda-descarga-columnas.test.ts`
- `tests/unit/guards/abono-tienda-alcance.guardia.test.ts`
- `tests/unit/guards/api-keys-tabla-una-linea.guardia.test.tsx`
- `tests/unit/guards/caja-173-alcance.guardia.test.ts`
- `tests/unit/guards/caja-clasificacion-459.guardia.test.ts`
- `tests/unit/guards/caja-composicion-exhaustiva.guardia.test.ts`
- `tests/unit/guards/caja-textos-459.guardia.test.ts`
- `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts`
- `tests/unit/guards/factura-contraste.guardia.test.ts`
- `tests/unit/guards/flete-por-rechazo-censo.guardia.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `tests/unit/guards/historial-correccion-dia.guardia.test.ts`
- `tests/unit/guards/incidente-exhaustividad.test.ts`
- `tests/unit/guards/mensajero-forma-unica.guardia.test.ts`
- `tests/unit/guards/nombres-wallet-461.guardia.test.ts`
- `tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts`
- `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts`
- `tests/unit/guards/pwa-push.guardia.test.ts`
- `tests/unit/guards/pwa-relevo-y-purga.guardia.test.ts`
- `tests/unit/guards/pwa-servida-sin-sesion.guardia.test.ts`
- `tests/unit/guards/quitador-comentarios.guardia.test.ts`
- `tests/unit/guards/tablero-doble-vs-servicio.guardia.test.ts`
- `tests/unit/guards/tema-encendido.guardia.test.ts`
- `tests/unit/guards/wallet-conceptos-sin-seed.guardia.test.ts`
- `tests/unit/guards/wallet-sin-uuid.guardia.test.tsx`
- `tests/unit/guards/wallet-textos-458.guardia.test.ts`
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`
- `tests/unit/hooks/usePushEnVentana.test.tsx`
- `tests/unit/hooks/useTonoAlIncrementar.test.tsx`
- `tests/unit/manifiesto/preferencia-columnas.test.ts`
- `tests/unit/notificaciones/webhook-suscripcion-pausada-aviso.test.ts`
- `tests/unit/pdf/etiquetas-pdf-lote.smoke.test.ts`
- `tests/unit/pdf/etiquetas-verificacion.ts`
- `tests/unit/pdf/informe-transito-pdf.test.ts`
- `tests/unit/push/web-push-sender.test.ts`
- `tests/unit/repositories/api-key-repository.eliminar.test.ts`
- `tests/unit/repositories/api-key-repository.list.test.ts`
- `tests/unit/repositories/api-key-repository.secreto.test.ts`
- `tests/unit/repositories/api-key-repository.test.ts`
- `tests/unit/repositories/cierre-detalle-causa-monto.test.ts`
- `tests/unit/repositories/cierre-dia-repository.test.ts`
- `tests/unit/repositories/cierres-admin-caja-cod.test.ts`
- `tests/unit/repositories/cierres-admin-repository.test.ts`
- `tests/unit/repositories/cierres-gestiones-descarga-dto.test.ts`
- `tests/unit/repositories/orden-repository.test.ts`
- `tests/unit/repositories/wallet-movimiento-repository.test.ts`
- `tests/unit/repositories/webhook-orden-reader.test.ts`
- `tests/unit/services/CierresAdminService.gestiones-completo.test.ts`
- `tests/unit/services/CierresBodegaAdminService.gestiones-completo.test.ts`
- `tests/unit/services/WebhookEventoOrdenService.test.ts`
- `tests/unit/services/abono-tienda-anulacion.test.ts`
- `tests/unit/services/analitica-financiera-derivacion.test.ts`
- `tests/unit/services/analitica-financiera-serie-frontera.test.ts`
- `tests/unit/services/analitica-financiera-serie.test.ts`
- `tests/unit/services/analitica-financiera-service.test.ts`
- `tests/unit/services/analitica-rollup-handler.test.ts`
- `tests/unit/services/api-key-auth-service.test.ts`
- `tests/unit/services/api-key-descarga.test.ts`
- `tests/unit/services/api-key-service.eliminar.test.ts`
- `tests/unit/services/api-key-service.listar.test.ts`
- `tests/unit/services/api-key-service.test.ts`
- `tests/unit/services/caja-abono-tienda-feed.test.ts`
- `tests/unit/services/caja-backfill-tesoreria.test.ts`
- `tests/unit/services/caja-cadena-pago-anulacion.test.ts`
- `tests/unit/services/caja-cod-feed-service.test.ts`
- `tests/unit/services/cierre-desglose-tres-superficies.test.ts`
- `tests/unit/services/cierre-dia-service-totales-mixtos.test.ts`
- `tests/unit/services/cierre-dia-service.test.ts`
- `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts`
- `tests/unit/services/cierres-admin-service.aprobar.sin-gestion.test.ts`
- `tests/unit/services/cierres-admin-service.test.ts`
- `tests/unit/services/cierres-bodega-admin-service.test.ts`
- `tests/unit/services/cierres-bodega-pendientes-paginado.test.ts`
- `tests/unit/services/cobro-tienda-service.test.ts`
- `tests/unit/services/corregir-datos-cliente-texto-etiqueta.test.ts`
- `tests/unit/services/cotizacion-orden-service.test.ts`
- `tests/unit/services/email-notificacion.test.ts`
- `tests/unit/services/libro-kardex-468.test.ts`
- `tests/unit/services/liquidacion-anulacion.test.ts`
- `tests/unit/services/liquidacion-caja-puerto.test.ts`
- `tests/unit/services/nodemailer-email-sender.test.ts`
- `tests/unit/services/nombres-que-imprime-la-etiqueta.test.ts`
- `tests/unit/services/rechazo-tienda-cobro-service.test.ts`
- `tests/unit/services/wallet-anulacion-service.test.ts`
- `tests/unit/services/wallet-caja-descarga.test.ts`
- `tests/unit/services/wallet-egreso-reverso-legible.test.ts`
- `tests/unit/services/wallet-indemnizacion-no-reversable.test.ts`
- `tests/unit/services/wallet-origen-legible.test.ts`
- `tests/unit/services/wallet-service.test.ts`
- `tests/unit/services/wallet-tienda-feed-service.test.ts`
- `tests/unit/services/webhook-estado-service.mensajero.test.ts`
- `tests/unit/services/webhook-estado-service.test.ts`
- `tests/unit/services/webhook-suscripcion-service.test.ts`
- `tests/unit/types/abono-tienda-schema.test.ts`
- `tests/unit/types/cobro-tienda-anulacion-schema.test.ts`
- `tests/unit/types/plantilla-datos.test.ts`
- `tests/unit/types/wallet-461-clave-schema.test.ts`
- `tests/unit/utils/api-key-generator.test.ts`
- `tests/unit/utils/api-key-hash.test.ts`
- `tests/unit/utils/aporte-por-orden-equivalencia.test.ts`
- `tests/unit/utils/aporte-por-orden.test.ts`
- `tests/unit/utils/aviso-ubicacion-denegada.test.ts`
- `tests/unit/utils/caja-composicion.test.ts`
- `tests/unit/utils/caja-derivacion-457.test.ts`
- `tests/unit/utils/caja-derivacion-459.test.ts`
- `tests/unit/utils/caja-derivacion-461.test.ts`
- `tests/unit/utils/caja-tesoreria.test.ts`
- `tests/unit/utils/cascadas-cierre-bodega.test.ts`
- `tests/unit/utils/cuenta-por-pagar.test.ts`
- `tests/unit/utils/descripcion-abono.test.ts`
- `tests/unit/utils/descripcion-cobro-tienda.test.ts`
- `tests/unit/utils/desglose-tienda.test.ts`
- `tests/unit/utils/dinero-por-producto.test.ts`
- `tests/unit/utils/efecto-movimiento.test.ts`
- `tests/unit/utils/incidente-no-mueve-dinero.test.ts`
- `tests/unit/utils/ingreso-ordenex.test.ts`
- `tests/unit/utils/libro-kardex-468.test.ts`
- `tests/unit/utils/linkificar.test.ts`
- `tests/unit/utils/paquete-url.test.ts`
- `tests/unit/utils/partes-por-tienda.test.ts`
- `tests/unit/utils/tarifa-especial-por-distrito.test.ts`
- `tests/unit/whatsapp-envios/informe-aviso-interno.test.ts`
- `tests/unit/whatsapp-envios/picking-pdf.test.ts`
