# SLT-136 «Planes: aviso, correo y descarga de la factura» · bitácora

## Tanda 1 (T1.1–T1.4) · datos y lectura de la descarga · commit be835d50
Subagente: `backend_dev`. Sin dependencias nuevas ni migraciones. Plan B de §2.2 **no** hizo falta: la remisión
de una orden eliminada sale por la relación (ni la extensión ni la RLS de `orden` filtran `deleted_at`).

Archivos:
- `lib/types/factura-plataforma.ts` (mod.): `MovimientoDeFactura`, `DatosDescargaFactura`, `DescargaFacturaResult`,
  `descargaFacturaSchema`, `descargaFacturaEmpresaSchema` (+ sus `*Input`).
- `lib/interfaces/repositories/IFacturaPlataformaRepository.ts`, `lib/repositories/FacturaPlataformaRepository.ts`
  (mod.): `datosDescargaDeLaEmpresa` (cabecera de `deLaEmpresa()`, `null` si no es cerrada; traza entera por
  `(cobradoAt, id)` con `orden.numRemision` y el nombre de la empresa, en `$transaction` `RepeatableRead`) y
  `datosDescargaParaPlataforma` (= `conEmpresa`). Ninguna escritura.
  - Desvío menor de §2.2: el nombre de la empresa se lee con `$queryRaw` y
    `WHERE id = current_setting('app.organizacion_id', true)` (además de la RLS), en vez de
    `organizacion.findFirst` sin `where`, que confía solo en la RLS. Mismo resultado, una barrera más.
- `lib/interfaces/services/IFacturaPlataformaService.ts`, `lib/services/FacturaPlataformaService.ts` (mod.):
  `descargaDeMiEmpresa`, `descargaDeEmpresa` (actor → esquema → repositorio).
- `lib/actions/facturas-plataforma.ts` (mod.): `descargarFacturaMiPlanAction`, `descargarFacturaEmpresaAction`
  (empresa ligada; la del `input` no cuenta).
- Tests: `tests/integration/db/factura-plataforma-descarga.test.ts` (nuevo);
  `tests/unit/services/factura-plataforma-service.test.ts` y `tests/unit/actions/facturas-plataforma.test.ts`
  (ampliados). En este último se actualiza el caso de SLT-119 «R16: solo dos actions» a cuatro (las dos nuevas
  son de lectura).

Mapa R → test (tanda 1):
- R1 → `factura-plataforma-descarga.test.ts` «R1, R6: la cabecera de la lista…», «R1: sin paginar: 230…»,
  «R1: una factura cerrada sin movimientos…»; `factura-plataforma-service.test.ts` «R1: el maestro recibe…»;
  `facturas-plataforma.test.ts` «R1: la descarga del maestro pasa el actor de la sesión…»
- R2 → `factura-plataforma-descarga.test.ts` «R2: el superadmin descarga de A lo mismo que su maestro…», «R2, R4: el
  superadmin que nombra B…»; `factura-plataforma-service.test.ts` «R2: el superadmin recibe…»;
  `facturas-plataforma.test.ts` «R2: la descarga del superadmin usa la empresa ligada…»
- R3 → `factura-plataforma-service.test.ts` «R3: …» (las dos vías y rol antes que entrada);
  `facturas-plataforma.test.ts` «R3: …»
- R4 → `factura-plataforma-descarga.test.ts` «R4: la en curso, la por cerrar, la de otra empresa…» y «R2, R4…»;
  `factura-plataforma-service.test.ts` «R4: el repositorio da null…»
- R5 → `factura-plataforma-service.test.ts` «R5: …»
- R6 → `factura-plataforma-descarga.test.ts` «R1, R6: …» (orden con `deleted_at`) y «R2: …» (por el cliente de la app)

Salida:
- `vitest run` de los 3 archivos (con base `servi_logistic_slt136`): 3 archivos, 68 tests, 68 verdes.
- Regresión: `factura-plataforma-detalle.test.ts`, `jobs-factura-plataforma.test.ts`, `mi-plan-page.test.tsx`,
  `plataforma-empresa-detalle-page.test.tsx`: 4 archivos, 79 tests, 79 verdes.
- `pnpm run typecheck`: limpio. `eslint` de los 9 archivos tocados: limpio.
- `pnpm run test:guardias`: 354 archivos; rojos solo `dependencias-declaradas-presentes.guardia.test.ts` (4, en
  `tests/baseline-rojos.json`, no es de esta ficha) y `superficie-de-uso.guardia.test.ts` (1, las dos actions nuevas
  sin pantalla todavía). Este último se resolvió con `@sin-superficie` pegado a cada action, con su motivo: la T4.2
  las cablea y la guardia exige entonces quitar la anotación (caduca). Re-corrida: verde.

**Pendiente para T4.2 (frontend):** quitar los dos `@sin-superficie` de `lib/actions/facturas-plataforma.ts` al
montar los botones; la guardia `superficie-de-uso` se pone roja si se dejan.

Veredicto: tanda 1 verde; R1–R6 mapeados.

## Tandas 2-3 (T2.1–T2.4, T3.1) · resumen, PDF y Excel (lib puro) · commit 9fdb4b65
Subagente: `frontend_dev`. No hay dependencias nuevas: jsPDF y exceljs ya estaban aprobadas. No toca archivos de la tanda 5.

Archivos:
- `lib/facturas-plataforma/resumen.ts` (nuevo). Contiene `resumirFactura`, `DescuadreDeFactura`,
  `FACTURA_DESCARGA_TEXTOS`, `fechaNumerica`, `periodoNumerico` y `nombreArchivoFactura`. Añade además `diaNumerico`,
  `cantidadVisible` (separador de miles del dinero), `planVisible` y `periodicidadVisible`, que comparten el PDF y los
  tests.
- `lib/facturas-plataforma/pdf.ts` (nuevo): `construirPdfFactura(datos, resumen, logo)` → `ArrayBuffer`, y el tipo
  `LogoDelPdf = Uint8Array`.
- `lib/facturas-plataforma/excel.ts` (nuevo): `construirExcelFactura(datos)`. Llama a `comprobarLimiteExcel` y después
  a `buildXlsxLibro`.
- `lib/pdf/imprimible.ts` (nuevo): `imprimible`, movida sin cambios desde
  `lib/whatsapp-envios/informes/transito/pdf.ts` (mod.: ahora la importa).
- `lib/config/marca.ts` (mod.): `MARCA_FACTURA`, con el comentario PROVISIONAL.
- `public/brand/logo-singularis.png` (nuevo): copia del provisional (rectángulo negro de 400×100).
- Tests:
  - `tests/unit/facturas-plataforma/{resumen,pdf,excel}.test.ts` (nuevos).
  - `tests/components/_facturas-plataforma.ts` (mod.): añade `movimiento()` y `datosDescarga()` al fixture de
    SLT-119.

Decisiones menores (el spec no las fija):
- La fuente embebida tiene un solo peso. La «negrita» de los valores y totales es el mismo glifo relleno y con trazo
  (`renderingMode: fillThenStroke`).
- El valor de una tarjeta parte en hasta dos líneas: «Sin plan asignado · sin cuota de plan» no cabe en una.
- Si el nombre de la empresa no deja nada tras normalizarlo, el archivo se llama `factura-<n>.<ext>`, sin guion
  colgando.
- Un PNG que jsPDF no sabe pintar cuenta como logo que no se pudo cargar (R14).
- Texto de la nota del desglose (R11): «Cada cargo y cada reverso, con su guía y su remisión, va en el Excel de esta
  factura.»

Mapa R → test (tandas 2-3):
- R7 → `pdf.test.ts` «R7 — A4 vertical y cabecera con marca» (A4 en todas las páginas; logo como imagen; título,
  número y cliente).
- R8 → `pdf.test.ts` «R8 — las seis tarjetas» (2 casos); `resumen.test.ts` «R8 — fechas, período y plan…».
- R9 → `resumen.test.ts` «R9: cuenta cargos y reversos…», «R9: la cuota del plan es la cuota de la emisión más la
  primera…», «R9: sin cuota… 0.00»; `pdf.test.ts` «R9: Concepto · Cantidad · Importe, sin columna de tarifa» y
  «R9: las cuatro filas…».
- R10 → `resumen.test.ts` «R10: el total y los movimientos son los de la base…»; `pdf.test.ts` «R10, R13: el total
  de la base sin redondear…».
- R11 → `resumen.test.ts` «R11 — el desglose por día…» (3 casos, incluido el de las 23:30 en CR); `pdf.test.ts` «R11 —
  el desglose por día en página aparte» (3 casos).
- R12 → `pdf.test.ts` «R12 — paginación y pie»: 60 días en 3 o más páginas, cabecera repetida, 60 filas sin pérdida
  ni duplicado, y pie con «Página n de m» en todas.
- R13 → `pdf.test.ts` «R10, R13…» (₡ y céntimos de la base) y «R13: un carácter que la fuente no cubre sale como «?»».
- R14 → `pdf.test.ts` «R14 — sin logo…» (con `null` y con bytes que no son PNG). Falta el lado del componente (T4.1).
- R15 → `resumen.test.ts` «R15 — un descuadre con la base no produce archivo»: importe y conteo. Falta el lado del
  componente (T4.1).
- R16 → `excel.test.ts` «R16 — …» (3 casos: hoja, cabeceras, filas, guía vacía, Cobrado/Reverso, valor numérico
  `#,##0.00` con signo).
- R17 → `excel.test.ts` «R17 — sin movimientos»; `pdf.test.ts` «R17 — sin movimientos»; `resumen.test.ts` «R17 —…».
- R18 → `resumen.test.ts` «R18 — el nombre de los archivos».

Salida:
- `vitest run tests/unit/facturas-plataforma/ tests/unit/pdf/informe-transito-pdf.test.ts`: 4 archivos y 57 tests, todos
  verdes. Por archivo: resumen 15, pdf 17, excel 5 y tránsito 20.
- `vitest related --run` sobre los archivos tocados: 935 archivos, de los que 811 pasan, 4 fallan y 120 se saltan.
  - Tres de los rojos son de componentes y fallaron por timeout con la máquina cargada (20–60 s):
    `DetalleMensajeroPanel`, `DetalleMovimientoCierre` y `EstadoCuenta463`. Corridos solos dan 3 archivos y 80 tests,
    todos verdes.
  - El cuarto es `jobs-handler-por-tipo.guardia.test.ts`: es de la tanda 5 en curso (el `job_tipo` nuevo aún sin
    handler registrado), no de estas tandas.
- `pnpm run typecheck`: limpio (exit 0).
- `eslint` de los archivos tocados: limpio.

Veredicto: tandas 2-3 en verde; R7–R13 y R16–R18 cubiertos en lib, y R14 y R15 en lib a falta del componente (T4.1).
(Las guardias `pais-sin-literales` y `sin-nombre-heredado` que estos archivos ponían rojas se arreglaron en la tanda 7.)

## Tanda 4 (T4.1, T4.2) · botones de descarga · commit 47ff35a6

- Nuevos: `components/shared/facturas/DescargarFactura.tsx`, `tests/components/DescargarFactura.test.tsx`.
- Modificados: `components/shared/facturas/{DetalleDeFactura.tsx,FacturasDeLaEmpresa.tsx,facturas-vista.ts}`,
  `app/(app)/mi-plan/{page.tsx,_components/MiPlanModule.tsx}`,
  `app/(app)/plataforma/empresas/[organizacionId]/page.tsx` (`.bind` con la empresa de la URL),
  `lib/actions/facturas-plataforma.ts` (quitadas las dos anotaciones `@sin-superficie`), y los tests
  `DetalleDeFactura`, `FacturasDeLaEmpresa`, `MiPlanModule` y `tests/integration/plataforma-empresa-detalle-page.test.tsx`.
- Decisión menor: los botones van bajo el encabezado del panel, antes de las cuotas, y dependen de la fila elegida
  (se ven aunque falle la lectura del detalle).
- Salida: 6 archivos, 117 tests verdes; typecheck y eslint limpios; `superficie-de-uso` verde sin las anotaciones.

## Tanda 5 (T5.1–T5.5) · enums, outbox del cierre, campanita, push y manejador · commit 3e78a8ca

- Migración `db/migrations/20261117120000_factura_plataforma_aviso_enums/` (sin renumerar: la última de `dev` era
  `20261116120000`), aplicada en `servi_logistic_slt136`; `prisma generate` limpio.
- Nuevos: `lib/repositories/_shared/encolar-en-empresas.ts`, `lib/planes/jobs-factura-aviso.ts` y los tests
  `factura-plataforma-aviso-migration`, `factura-plataforma-cierre-aviso`, `jobs-factura-aviso`, `emitir-factura-emitida`.
- Modificados: `db/schema.prisma`, `PlanesRepository`, `FacturaPlataformaRepository.cerrar` (transacción + outbox),
  `lib/types/notificacion.ts`, `lib/notificaciones/{emitir,notificadores,catalogo-avisos,push-elegibles}.ts`,
  `lib/whatsapp-envios/eventos.ts`, `app/api/cron/procesar-jobs/route.ts`, `lib/modulos/reparto.ts`.
- Inventarios de enums: los cinco de §9 y seis más que se ponían rojos (`notificacion-productores-wiring`,
  `fila-puenteable`, `eventos-envio`, `push-elegibles`, `procesar-jobs-webhook-estado`, `procesar-jobs-geocodificacion`).
  El de `462/` no hizo falta tocarlo (usa `toContain`).
- Decisión menor: el período de la campanita lo calcula `emitir.ts` con `fechaCalendarioPlataforma`
  (`lib/planes/ciclo.ts`), por la guardia `pais-sin-literales`.
- Nota: en `servi_logistic_slt136` fallan 4 tests de migración ajenos a §9 (`traspaso`, `cierre-rechazado`,
  `reparto-manana`, `geocodificacion-caida`) porque esa base no tiene filas en `usuario`; no es por los enums.

## Tanda 6 (T6.1, T6.2) · correo · commit a6a2836a

- Nuevos: `lib/services/email/plantillas/factura-emitida.ts`, `tests/unit/services/email/plantilla-factura-emitida.test.ts`.
- `lib/planes/jobs-factura-aviso.ts`: paso 5 (un correo por maestro; si uno falla sigue con los demás y después lanza
  sin el correo en el motivo); `sender`, `contacto` y `urlApp` en las deps.
- Decisiones menores: los importes van como párrafos «Concepto: importe» (la plantilla común no tiene bloque de
  lista); la frase del período es la misma de la campanita.

## Tanda 7 (T7.1–T7.3) · enmiendas, docs y guardias · commit d8c7b526

- T7.1: enmienda de SLT-118 R25 en `jobs-factura-plataforma.test.ts` y en el comentario de
  `lib/planes/jobs-factura-plataforma.ts`; caso nuevo: `factura_plataforma_aviso` registrado.
- T7.2: `mi-plan-solo-maestro.guardia.test.ts` admite `catalogo-avisos.ts` y `factura-emitida.ts`, con
  autocomprobación que los exige.
- T7.3: `docs/architecture.md > Facturas de la plataforma` (descarga, aviso al cerrar, enmiendas, logo provisional).
  `node scripts/check-perfil.mjs`: 6/6 docs revisados, exit 0.
- Guardias de las tandas 2-3: `pais-sin-literales` (`resumen.ts` y `excel.ts` dejan `fecha-cr`; nueva
  `horaDeParedPlataforma` en `lib/planes/ciclo.ts`, que ya era excepción de la guardia) y `sin-nombre-heredado`
  (comentario de `pdf.ts`). Los tests de `tests/unit/facturas-plataforma/` siguen verdes sin tocar expectativas.

## Tanda 8 (T8.1, T8.2) · E2E y cierre

- `e2e/facturas-plataforma.spec.ts` ampliado: la en curso sin botones; el maestro descarga el PDF (`%PDF`) y el Excel
  (releído con exceljs: hoja «Movimientos», cabeceras, 2 «Cobrado» de 300 y 1 «Reverso» de −300, guías y remisiones);
  el superadmin descarga el PDF desde «Facturación». Nombres `factura-1-<empresa>.{pdf,xlsx}`.
- Base desechable `servi_logistic_slt136_e2e` (creada nueva por `migrate deploy` + `db:seed`); `next build` con
  `NEXT_PUBLIC_APP_URL=http://localhost:3044` como `gate.yml`.

Salida real:
```
E2E_PUERTO=3044 pnpm exec playwright test e2e/facturas-plataforma.spec.ts --reporter=list
  corrida 1: 4 passed (44.2s) · corrida 2 (misma base): 4 passed (29.0s) · 0 failed, 0 flaky
E2E_PUERTO=3044 pnpm exec playwright test --project=dinero --reporter=list
  126 passed (16.1m), 0 failed, 0 flaky, 0 skipped
vitest run tests/unit/guards/e2e-sin-saltos.guardia.test.ts: 38 passed
```

### Verificación final (implementer)
```
vitest run <30 archivos de la feature, contra servi_logistic_slt136>
 Test Files  30 passed (30)
      Tests  524 passed (524)
pnpm run typecheck: exit 0
pnpm run test:guardias:
 Test Files  2 failed | 349 passed | 3 skipped (354)
  - dependencias-declaradas-presentes (4 tests): en tests/baseline-rojos.json, ajeno
  - filtros-url-r25: "Hook timed out in 60000ms" con la máquina cargada; solo: 3 passed
node scripts/check-perfil.mjs: exit 0
```
Lint: cada subagente corrió `eslint` sobre todos los archivos que tocó, limpio en cada tanda. El `pnpm run lint`
completo del implementer lo paró el sistema por falta de memoria (no es un fallo del lint); queda para el gate de CI.

## Review vuelta 1 · correcciones (commit f5982fc8)

- Menor 1: la plantilla del correo usa `periodoDeFactura` y `textoFacturaEmitida` de `lib/notificaciones/emitir.ts`
  (un solo origen para campanita y correo). `periodoNumerico` (`resumen.ts`, va al navegador) no puede importar
  emitir.ts ni al revés sin meter Prisma en el cliente o UI en el emisor; lo ata el test nuevo
  `emitir-factura-emitida.test.ts > «SLT-136/R8, R22, R26 — campanita, correo y PDF dicen el mismo período»`
  (6 pares de fechas con bordes de medianoche CR y `hasta − 1 ms`, control a mano, y frase del correo = campanita).
  Salida: 7 archivos, 105 tests verdes (incluidas las guardias `pais-sin-literales`, `mi-plan-solo-maestro`,
  `correos-sin-secretos`); typecheck limpio; eslint limpio.
- Menor 2: nota en design §7.4 (importes como párrafos «Concepto: importe», sin bloque de lista en `componerCorreo`).
- Menor 3: comentario de `datosDescargaDeLaEmpresa`: la cabecera se lee fuera de la foto `RepeatableRead`, inocuo con
  factura cerrada; R15 detectaría un descuadre. Sin cambio de código.

### Mayor 1: proyecto E2E `aislamiento` entero en local (HEAD f5982fc8)

Base desechable nueva `servi_logistic_slt136_aisl` (`migrate deploy` + `db:seed`), `next build` nuevo con
`NEXT_PUBLIC_APP_URL`/`APP_BASE_URL=http://localhost:3044`, como `gate.yml`. Comando:
`CI=1 E2E_PUERTO=3044 pnpm exec playwright test --project=aislamiento --reporter=list` (con `CI=1`: `retries: 1`,
`failOnFlakyTests`, `forbidOnly`, como en CI).

Specs: `plataforma-vacia` (superadmin-arranque, superadmin-empresas) y `aislamiento` (analitica-roles, auth,
cobro-plataforma-sl40, dos-empresas-humo, integraciones-por-empresa, login-varias-empresas, marca,
mi-plan-cambiar-plan, pago-plataforma-sl45, planes-costeo, planes-superadmin, rastreo-publico, reporte-de-bugs,
tarifas-maqueta, wallet-iva-aparte-sl39, zona-especial-dos-empresas, zonas-crear-sin-costos).

| Corrida | passed | failed | flaky | skipped | Duración |
|---|---|---|---|---|---|
| 1 | 99 | 3 | 0 | 0 | 10,2 min |
| 2 | 98 | 3 | 1 | 0 | 20,5 min |
| 3 | 102 | 0 | 0 | 0 | 6,8 min |
| 4 | 102 | 0 | 0 | 0 | 12,3 min |

Salida real de las dos últimas (seguidas, misma base): `102 passed (6.8m)` y `102 passed (12.3m)`.

Rojos de las corridas 1-2, no de SLT-136:
- `marca.spec.ts:294` y `rastreo-publico.spec.ts:86`/`:115`: `page.goto("/")` no recibe `load` en 30 s porque
  `/_next/image?url=/landing/*.jpg` queda sin respuesta con la máquina cargada. `superadmin-arranque.spec.ts:72`
  (flaky en la corrida 2, la más lenta): timeout preparando `page`.
- Evidencia: el diff contra el merge-base `a9471ed9` no toca `app/_landing`, `app/page.tsx`, `public/landing`,
  `next.config.ts`, `package.json`, `playwright.config.ts` ni esas specs (en marca solo se añade `MARCA_FACTURA`).
  Esas specs solas pasan sobre el mismo build (9 passed; con `plataforma-vacia` + `dos-empresas-humo`, 25 passed).
  El subconjunto previo sobre el merge-base exportado también pasa (42 passed). Las corridas 3 y 4 pasan enteras.
  En CI, el run 44164952802 sobre f5982fc8 da `e2e (aislamiento)` y `gate-completo` en success.
- Logs: `aisl-e2e{,-2,-3,-4}.log` en el scratchpad de la sesión.

## Mapa R → test (R1–R33)

| R | Test |
|---|---|
| R1, R2 | `tests/integration/db/factura-plataforma-descarga.test.ts`, `tests/unit/actions/facturas-plataforma.test.ts`, `tests/unit/services/factura-plataforma-service.test.ts`; R2 también `tests/integration/plataforma-empresa-detalle-page.test.tsx` |
| R3, R5 | `tests/unit/services/factura-plataforma-service.test.ts`, `tests/unit/actions/facturas-plataforma.test.ts` |
| R4 | `tests/integration/db/factura-plataforma-descarga.test.ts`, `tests/unit/services/factura-plataforma-service.test.ts` |
| R6 | `tests/integration/db/factura-plataforma-descarga.test.ts` |
| R7, R12, R13 | `tests/unit/facturas-plataforma/pdf.test.ts` |
| R8, R9, R10, R11 | `tests/unit/facturas-plataforma/resumen.test.ts`, `tests/unit/facturas-plataforma/pdf.test.ts` |
| R14 | `tests/unit/facturas-plataforma/pdf.test.ts`, `tests/components/DescargarFactura.test.tsx` |
| R15 | `tests/unit/facturas-plataforma/resumen.test.ts`, `tests/components/DescargarFactura.test.tsx` |
| R16 | `tests/unit/facturas-plataforma/excel.test.ts`, `e2e/facturas-plataforma.spec.ts` |
| R17 | `tests/unit/facturas-plataforma/{excel,pdf,resumen}.test.ts` |
| R18 | `tests/unit/facturas-plataforma/resumen.test.ts`, `e2e/facturas-plataforma.spec.ts` |
| R19 | `tests/components/DetalleDeFactura.test.tsx`, `tests/components/MiPlanModule.test.tsx`, `tests/integration/plataforma-empresa-detalle-page.test.tsx`, `e2e/facturas-plataforma.spec.ts` |
| R20 | `tests/components/DescargarFactura.test.tsx`, `tests/components/DetalleDeFactura.test.tsx` |
| R21 | `tests/integration/db/factura-plataforma-cierre-aviso.test.ts`, `tests/unit/planes/jobs-factura-plataforma.test.ts` |
| R22 | `tests/unit/notificaciones/emitir-factura-emitida.test.ts`, `tests/unit/planes/jobs-factura-aviso.test.ts` |
| R23 | `tests/unit/notificaciones/catalogo-avisos.test.ts`, `tests/unit/notificaciones/push-elegibles.test.ts`, `tests/unit/whatsapp-envios/eventos-envio.test.ts`, `tests/unit/services/notificacion-notificadores-reales.test.ts` |
| R24 | `tests/unit/notificaciones/emitir-factura-emitida.test.ts`, `tests/unit/notificaciones/push-elegibles.test.ts`, `tests/unit/planes/jobs-factura-aviso.test.ts` |
| R25 | `tests/integration/db/factura-plataforma-cierre-aviso.test.ts`, `tests/unit/planes/jobs-factura-aviso.test.ts` |
| R26 | `tests/unit/services/email/plantilla-factura-emitida.test.ts`, `tests/unit/planes/jobs-factura-aviso.test.ts` |
| R27, R28 | `tests/unit/planes/jobs-factura-aviso.test.ts` |
| R29 | `tests/unit/services/email/plantilla-factura-emitida.test.ts`, `tests/unit/planes/jobs-factura-aviso.test.ts` |
| R30 | `tests/unit/planes/jobs-factura-aviso.test.ts`, `tests/unit/api/procesar-jobs-registro.test.ts` |
| R31 | `tests/integration/db/factura-plataforma-aviso-migration.test.ts` (+ inventarios de enums) |
| R32 | `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts` |
| R33 | `e2e/facturas-plataforma.spec.ts` |
