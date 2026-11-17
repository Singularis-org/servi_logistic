# SLT-136 — planes-aviso-descarga-factura · tasks.md

> Diseño: `design.md`. Requisitos: R1–R33. Un solo PR por encima del tope, aceptado por el humano (marcador en
> `progress/features/SLT-136.md`).
>
> - **Reparto:** `backend_dev` hace `lib/`, `db/` y `app/api/`; `frontend_dev` hace `components/` y las páginas de
>   `app/`.
> - **Cierre de cada tanda:** `./init.sh` (rápido).
> - **Antes del PR:** `pnpm exec playwright test e2e/facturas-plataforma.spec.ts` y el proyecto `dinero` en local
>   (`docs/perfil-agentes.md`), porque toca `db/`, pantallas y dinero.
> - `[P]` = paralelizable dentro de su tanda.

## Tanda 1 — Datos y lectura de la descarga (backend)

- [x] **T1.1** Tipos en `lib/types/factura-plataforma.ts`: `MovimientoDeFactura`, `DatosDescargaFactura`,
  `DescargaFacturaResult`, `descargaFacturaSchema` y `descargaFacturaEmpresaSchema` (design §2.1).
  *Hecho:* typecheck en verde.
- [x] **T1.2** Repositorio: `datosDescargaDeLaEmpresa` y `datosDescargaParaPlataforma`, en la interfaz y en
  `FacturaPlataformaRepository` (§2.2). Depende de T1.1.
  *Hecho:* el test de T1.4 está en verde.
- [x] **T1.3** Servicio y actions: `descargaDeMiEmpresa` y `descargaDeEmpresa` en `IFacturaPlataformaService` y en
  `FacturaPlataformaService`; `descargarFacturaMiPlanAction` y `descargarFacturaEmpresaAction` en
  `lib/actions/facturas-plataforma.ts` (§2.3). Depende de T1.2.
  *Hecho:* los tests de servicio y actions (R1, R2, R3, R4, R5) están en verde.
- [x] **T1.4** `[P]` Tests: `tests/integration/db/factura-plataforma-descarga.test.ts` (R1, R2, R4, R6); se amplían
  `tests/unit/services/factura-plataforma-service.test.ts` (R3–R5) y `tests/unit/actions/facturas-plataforma.test.ts`
  (R1, R2). Si la remisión de la orden eliminada sale `null`, se aplica el plan B de §2.2.
  *Hecho:* verdes contra la base de pruebas.

## Tanda 2 — Resumen y PDF (frontend, lib puro)

- [x] **T2.1** `lib/facturas-plataforma/resumen.ts`: `resumirFactura`, `DescuadreDeFactura`,
  `FACTURA_DESCARGA_TEXTOS`, `fechaNumerica`, `periodoNumerico` y `nombreArchivoFactura` (§3). Depende de T1.1.
  *Hecho:* `tests/unit/facturas-plataforma/resumen.test.ts` en verde (R9–R11, R15, R17, R18).
- [x] **T2.2** Logo y marca, marcado como **PROVISIONAL**.
  - Copiar `C:\Users\Cristian\Documents\trabajo\arc\servi_logistic\docs\referencias\logo-singularis.png` a
    `public/brand/logo-singularis.png`.
  - Añadir `MARCA_FACTURA` a `lib/config/marca.ts`, con el comentario de §4: el humano reemplaza el PNG por el real
    con el mismo nombre.

  *Hecho:* el archivo existe y `MARCA_FACTURA.logo.ruta` apunta a él.
- [x] **T2.3** Mover `imprimible` de `lib/whatsapp-envios/informes/transito/pdf.ts` a `lib/pdf/imprimible.ts`, sin
  cambiar su comportamiento.
  *Hecho:* los tests del informe de tránsito siguen en verde.
- [x] **T2.4** `lib/facturas-plataforma/pdf.ts`: `construirPdfFactura` (§4). Depende de T2.1, T2.2 y T2.3.
  *Hecho:* `tests/unit/facturas-plataforma/pdf.test.ts` en verde (R7–R14, R17).

## Tanda 3 — Excel (frontend, lib puro)

- [x] **T3.1** `[P]` `lib/facturas-plataforma/excel.ts`: `construirExcelFactura` (§5). Depende de T2.1.
  *Hecho:* `tests/unit/facturas-plataforma/excel.test.ts` en verde (R16, R17).

## Tanda 4 — Botones en las dos pantallas (frontend)

- [x] **T4.1** `components/shared/facturas/DescargarFactura.tsx`, más los textos en `facturas-vista.ts` (§6). Depende
  de T2.4 y T3.1.
  *Hecho:* `tests/components/DescargarFactura.test.tsx` en verde (R14, R15, R20).
- [x] **T4.2** Cablear `descargar` en las pantallas. Depende de T1.3 y T4.1.
  - `DetalleDeFactura.tsx`: los botones solo en una cerrada; se actualiza el comentario de la línea 38.
  - `FacturasDeLaEmpresa.tsx`.
  - `app/(app)/mi-plan/page.tsx` y `MiPlanModule.tsx`.
  - `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`, con `.bind`.

  *Hecho:* se ajusta `tests/components/DetalleDeFactura.test.tsx` (R19) y siguen en verde `MiPlanModule.test.tsx`,
  `mi-plan-page.test.tsx` y `plataforma-empresa-detalle-page.test.tsx`.

## Tanda 5 — Migración, outbox del cierre, campanita y push (backend)

- [x] **T5.1** Migración `db/migrations/20261117120000_factura_plataforma_aviso_enums/` (`migration.sql` y `down.sql`
  con `quitar_valores_de_enum_136`) y los tres valores en `db/schema.prisma` (§1). Renumerar si `dev` avanzó.
  *Hecho:* `tests/integration/db/factura-plataforma-aviso-migration.test.ts` en verde; los inventarios de enums de §9
  ampliados a mano y en verde; `prisma generate` limpio.
- [x] **T5.2** Mover `encolarEnEmpresas` a `lib/repositories/_shared/encolar-en-empresas.ts` y hacer que
  `PlanesRepository` lo importe. Mismo comportamiento.
  *Hecho:* los tests de planes que encolan avisos siguen en verde.
- [x] **T5.3** `FacturaPlataformaRepository.cerrar` con transacción y outbox (§7.1). Depende de T5.1 y T5.2.
  *Hecho:* `tests/integration/db/factura-plataforma-cierre-aviso.test.ts` en verde (R21, R25), y
  `factura-plataforma-cierre.test.ts` sigue en verde.
- [x] **T5.4** `[P]` La campanita y el push (§7.3). Depende de T5.1.
  - Evento y entidad en `lib/types/notificacion.ts`.
  - `textoFacturaEmitida` y `emitirFacturaEmitida` en `emitir.ts`.
  - `emitirFacturaEmitidaReal` en `notificadores.ts`.
  - Las entradas en `catalogo-avisos.ts`, `push-elegibles.ts` y `lib/whatsapp-envios/eventos.ts`.

  *Hecho:* `emitir-factura-emitida.test.ts` nuevo y verde (R22, R24). Ampliados y en verde: `catalogo-avisos.test.ts`,
  `push-elegibles.test.ts`, `eventos-envio.test.ts` y `notificacion-notificadores-reales.test.ts` (R23).
- [x] **T5.5** `lib/planes/jobs-factura-aviso.ts` (manejador y `buildDepsAvisoFactura`, por ahora sin correo: los pasos
  1–4 de §7.2). Se registra en `app/api/cron/procesar-jobs/route.ts` y en `lib/modulos/reparto.ts`
  (`MODULO_POR_JOB`). Depende de T5.4.
  *Hecho:* `tests/unit/planes/jobs-factura-aviso.test.ts` (casos de aviso, R22, R24, R25, R28, R30) y
  `tests/unit/api/procesar-jobs-registro.test.ts` en verde; la guardia `jobs-handler-por-tipo` en verde.

## Tanda 6 — Correo (backend)

- [ ] **T6.1** `lib/services/email/plantillas/factura-emitida.ts`: `plantillaFacturaEmitida` (§7.4).
  *Hecho:* `tests/unit/services/email/plantilla-factura-emitida.test.ts` en verde (R26, R29).
- [ ] **T6.2** El envío en el manejador: paso 5 de §7.2, y `sender`, `contacto` y `urlApp` en las deps. Depende de T5.5
  y T6.1.
  *Hecho:* los casos de correo de `jobs-factura-aviso.test.ts` en verde (R26, R27, R28).

## Tanda 7 — Enmiendas y documentación

- [ ] **T7.1** `[P]` Enmienda de SLT-118 R25 en `tests/unit/planes/jobs-factura-plataforma.test.ts` y en el comentario
  de cabecera de `lib/planes/jobs-factura-plataforma.ts` («Sin correos ni avisos (R25)» pasa a «los avisos los encola
  `cerrar` en su transacción, SLT-136 R21»). Detalle en §8.
  *Hecho:* el test está en verde.
- [ ] **T7.2** `[P]` Enmienda de la guardia de SLT-91 R10 en `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts`
  (§8, R32). Depende de T5.4 y T6.1.
  *Hecho:* la guardia está en verde, con los dos archivos admitidos y la autocomprobación que los exige.
- [ ] **T7.3** `[P]` En `docs/architecture.md > Facturas de la plataforma`, sustituir «sin descarga (SLT-136)» por:
  - la descarga: PDF y Excel en el navegador, solo de las cerradas, para el maestro y el superadmin;
  - el aviso al cerrar: outbox → `factura_plataforma_aviso` → campanita, push y correo a los maestros;
  - la enmienda de SLT-118 R25 y la de la guardia de SLT-91 R10;
  - el logo provisional.

  *Hecho:* el validador del perfil está en verde.

## Tanda 8 — E2E y cierre

- [ ] **T8.1** Ampliar `e2e/facturas-plataforma.spec.ts` como dice §9 (R33). Depende de T4.2.
  *Hecho:* `pnpm exec playwright test e2e/facturas-plataforma.spec.ts` en verde en local, con base desechable.
- [ ] **T8.2** Pasar `./init.sh` y el proyecto `dinero` en local, y anotar el mapa R → test en
  `progress/impl_SLT-136.md`.
  *Hecho:* todo en verde y R1–R33 mapeados.

## Mapa R → test

| R | Test |
|---|---|
| R1, R2 | `tests/integration/db/factura-plataforma-descarga.test.ts`, `tests/unit/actions/facturas-plataforma.test.ts` |
| R3, R5 | `tests/unit/services/factura-plataforma-service.test.ts` |
| R4 | `tests/integration/db/factura-plataforma-descarga.test.ts`, `tests/unit/services/factura-plataforma-service.test.ts` |
| R6 | `tests/integration/db/factura-plataforma-descarga.test.ts` |
| R7, R8, R12, R13 | `tests/unit/facturas-plataforma/pdf.test.ts` |
| R9, R10, R11 | `tests/unit/facturas-plataforma/resumen.test.ts`, `tests/unit/facturas-plataforma/pdf.test.ts` |
| R14 | `tests/unit/facturas-plataforma/pdf.test.ts`, `tests/components/DescargarFactura.test.tsx` |
| R15 | `tests/unit/facturas-plataforma/resumen.test.ts`, `tests/components/DescargarFactura.test.tsx` |
| R16 | `tests/unit/facturas-plataforma/excel.test.ts`, `e2e/facturas-plataforma.spec.ts` |
| R17 | `tests/unit/facturas-plataforma/excel.test.ts`, `tests/unit/facturas-plataforma/pdf.test.ts` |
| R18 | `tests/unit/facturas-plataforma/resumen.test.ts`, `e2e/facturas-plataforma.spec.ts` |
| R19 | `tests/components/DetalleDeFactura.test.tsx`, `e2e/facturas-plataforma.spec.ts` |
| R20 | `tests/components/DescargarFactura.test.tsx` |
| R21 | `tests/integration/db/factura-plataforma-cierre-aviso.test.ts`, `tests/unit/planes/jobs-factura-plataforma.test.ts` |
| R22 | `tests/unit/notificaciones/emitir-factura-emitida.test.ts`, `tests/unit/planes/jobs-factura-aviso.test.ts` |
| R23 | `tests/unit/notificaciones/catalogo-avisos.test.ts`, `tests/unit/notificaciones/push-elegibles.test.ts`, `tests/unit/services/notificacion-notificadores-reales.test.ts` |
| R24 | `tests/unit/notificaciones/emitir-factura-emitida.test.ts`, `tests/unit/planes/jobs-factura-aviso.test.ts` |
| R25 | `tests/integration/db/factura-plataforma-cierre-aviso.test.ts`, `tests/unit/planes/jobs-factura-aviso.test.ts` |
| R26 | `tests/unit/services/email/plantilla-factura-emitida.test.ts`, `tests/unit/planes/jobs-factura-aviso.test.ts` |
| R27, R28 | `tests/unit/planes/jobs-factura-aviso.test.ts` |
| R29 | `tests/unit/services/email/plantilla-factura-emitida.test.ts` |
| R30 | `tests/unit/planes/jobs-factura-aviso.test.ts`, `tests/unit/api/procesar-jobs-registro.test.ts` |
| R31 | `tests/integration/db/factura-plataforma-aviso-migration.test.ts` |
| R32 | `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts` |
| R33 | `e2e/facturas-plataforma.spec.ts` |

## Tamaño estimado

- **Producción:** 37 archivos (incluido el PNG del logo), unas 1 550 líneas. Las que más pesan: el PDF (~380), el
  `down.sql` (~130, copia de la función de la 462), el manejador (~120), el resumen (~120) y la plantilla del correo
  (~90).
- **Tests:** 27 archivos, unas 2 300 líneas.
- **Total:** ~64 archivos. Pasa el tope de 40 archivos y el de 1 000 líneas de producción, con el marcador de tamaño
  aceptado por el humano. Las líneas de tests quedan dentro de su tope (3 000).

## Archivos esperados

Producción:
- `lib/types/factura-plataforma.ts`
- `lib/interfaces/repositories/IFacturaPlataformaRepository.ts`
- `lib/repositories/FacturaPlataformaRepository.ts`
- `lib/interfaces/services/IFacturaPlataformaService.ts`
- `lib/services/FacturaPlataformaService.ts`
- `lib/actions/facturas-plataforma.ts`
- `lib/facturas-plataforma/resumen.ts`
- `lib/facturas-plataforma/pdf.ts`
- `lib/facturas-plataforma/excel.ts`
- `lib/pdf/imprimible.ts`
- `lib/whatsapp-envios/informes/transito/pdf.ts`
- `lib/config/marca.ts`
- `public/brand/logo-singularis.png`
- `components/shared/facturas/DescargarFactura.tsx`
- `components/shared/facturas/DetalleDeFactura.tsx`
- `components/shared/facturas/FacturasDeLaEmpresa.tsx`
- `components/shared/facturas/facturas-vista.ts`
- `app/(app)/mi-plan/page.tsx`
- `app/(app)/mi-plan/_components/MiPlanModule.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`
- `db/schema.prisma`
- `db/migrations/20261117120000_factura_plataforma_aviso_enums/migration.sql`
- `db/migrations/20261117120000_factura_plataforma_aviso_enums/down.sql`
- `lib/repositories/_shared/encolar-en-empresas.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/types/notificacion.ts`
- `lib/notificaciones/emitir.ts`
- `lib/notificaciones/notificadores.ts`
- `lib/notificaciones/catalogo-avisos.ts`
- `lib/notificaciones/push-elegibles.ts`
- `lib/whatsapp-envios/eventos.ts`
- `lib/planes/jobs-factura-aviso.ts`
- `lib/planes/jobs-factura-plataforma.ts`
- `app/api/cron/procesar-jobs/route.ts`
- `lib/modulos/reparto.ts`
- `lib/services/email/plantillas/factura-emitida.ts`
- `docs/architecture.md`

Tests:
- `tests/integration/db/factura-plataforma-descarga.test.ts`
- `tests/unit/services/factura-plataforma-service.test.ts`
- `tests/unit/actions/facturas-plataforma.test.ts`
- `tests/unit/facturas-plataforma/resumen.test.ts`
- `tests/unit/facturas-plataforma/pdf.test.ts`
- `tests/unit/facturas-plataforma/excel.test.ts`
- `tests/components/DescargarFactura.test.tsx`
- `tests/components/DetalleDeFactura.test.tsx`
- `tests/integration/db/factura-plataforma-aviso-migration.test.ts`
- `tests/integration/db/notificacion-evento-bloqueo-cierre-migration.test.ts`
- `tests/integration/db/notificacion-evento-dia-reparto-corregido-migration.test.ts`
- `tests/integration/db/notificacion-evento-gasto-fijo-migration.test.ts`
- `tests/integration/db/notificacion-evento-postulacion-recurso-migration.test.ts`
- `tests/integration/db/notificacion-evento-webhook-suscripcion-migration.test.ts`
- `tests/integration/db/462/notificacion-evento-reprogramadas-migration.test.ts`
- `tests/integration/db/factura-plataforma-cierre-aviso.test.ts`
- `tests/unit/planes/jobs-factura-plataforma.test.ts`
- `tests/unit/planes/jobs-factura-aviso.test.ts`
- `tests/unit/notificaciones/emitir-factura-emitida.test.ts`
- `tests/unit/notificaciones/catalogo-avisos.test.ts`
- `tests/unit/notificaciones/push-elegibles.test.ts`
- `tests/unit/whatsapp-envios/eventos-envio.test.ts`
- `tests/unit/services/notificacion-notificadores-reales.test.ts`
- `tests/unit/services/email/plantilla-factura-emitida.test.ts`
- `tests/unit/api/procesar-jobs-registro.test.ts`
- `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts`
- `e2e/facturas-plataforma.spec.ts`
