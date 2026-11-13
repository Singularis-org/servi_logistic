# SLT-119 «Planes: pantallas de facturas para el superadmin y el maestro» · bitácora

## Tanda backend (T1.1–T3.2) · sin commit (lo hace el implementer)
Subagente: `backend_dev`. Sin dependencias nuevas ni migraciones.

Archivos:
- `lib/types/factura-plataforma.ts` (mod.): `TIPOS_LINEA_FACTURA`, `LineaDeFactura`, `PaginaDeLineas`,
  `DetalleDeFactura`, `LINEAS_POR_PAGINA = 100`, `FacturasResult`, `DetalleFacturaResult`, `detalleFacturaSchema`,
  `detalleFacturaEmpresaSchema`, `facturasDeEmpresaSchema` (design §3).
- `lib/interfaces/repositories/IFacturaPlataformaRepository.ts` (mod.), `lib/repositories/FacturaPlataformaRepository.ts`
  (mod.): `detalleDeLaEmpresa` (cabecera de `deLaEmpresa()`, líneas `findMany` + `count` por `cobradoAt` en
  `[desde, hasta)` y `(cobradoAt, id)`, en `$transaction` `RepeatableRead`) y `detalleParaPlataforma` (= `conEmpresa`).
  Ninguna escritura.
- `lib/interfaces/services/IFacturaPlataformaService.ts`, `lib/services/FacturaPlataformaService.ts` (nuevos).
- `lib/actions/_shared/facturas-plataforma.ts`, `lib/actions/facturas-plataforma.ts` (nuevos).
- `lib/modulos/reparto.ts` (mod.): `"facturas-plataforma": "nucleo"`.
- Tests nuevos: `tests/integration/db/factura-plataforma-detalle.test.ts`,
  `tests/unit/services/factura-plataforma-service.test.ts`, `tests/unit/actions/facturas-plataforma.test.ts`.

Mapa R → test (backend):
- R1 (orden) → `factura-plataforma-service.test.ts` «R1: de la más reciente a la más antigua…»
- R7, R8 → `factura-plataforma-detalle.test.ts` «R7, R8: líneas por instante…»
- R10 → `factura-plataforma-detalle.test.ts` «R10: 230 líneas en páginas de 100, 100 y 30…»
- R11 → `factura-plataforma-detalle.test.ts` «R11: la en curso lista las líneas…»
- R12 → `factura-plataforma-detalle.test.ts` «R12: el superadmin ve las mismas facturas…»
- R13 → `factura-plataforma-service.test.ts` «R13: …» (vías del maestro y del superadmin) y
  `facturas-plataforma.test.ts` «R13: …»
- R14 → `factura-plataforma-detalle.test.ts` «R14: el maestro de A no ve…» y «R14: el superadmin que nombra B…»;
  `factura-plataforma-service.test.ts` «R14: el repositorio da null…»
- R15 → `factura-plataforma-service.test.ts` «R15: …»
- R16 (backend) → `facturas-plataforma.test.ts` «R16: solo dos actions…» y la guardia
  `cobro-plataforma-solo-por-trigger` (verde).

Verificación (salida real, 2026-11-12):
- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin él, el tsc muere por memoria): verde.
- `pnpm run lint`: 0 errores (243 warnings preexistentes); `eslint` sobre los 11 archivos tocados: limpio.
- `vitest run` de los 3 tests: 42 pasados, 0 fallidos (integración contra `servi_logistic_slt119`).
- `pnpm run test:guardias`: 4852 pasados, 5 fallidos en 2 archivos:
  - `superficie-de-uso` R-A: `verDetalleFacturaMiPlanAction` y `verDetalleFacturaEmpresaAction` aún sin página que
    las importe; se pone verde con T6.1/T6.2 (frontend). No se anotan `@sin-superficie`.
  - `dependencias-declaradas-presentes` (4): `init.sh` sin el marcador de la ficha 420; no lo toca esta tanda.

Veredicto: backend T1–T3 listo; guardia de superficie roja hasta que T6 cablee las actions.

## Tanda frontend (T4.1–T6.2) · sin commit (lo hace el implementer)

Archivos creados:
- `components/shared/facturas/facturas-vista.ts` (T4.1): número «N.º n», período en la hora de la plataforma,
  estado, suma de cuotas en céntimos (`aCentimos`/`aTexto`), «X de Y días», instante con hora, páginas y
  `FACTURAS_TEXTOS`. Reusa `fechaCortaEnZona`, `horaDePared`, `ZONA_CR` y las etiquetas de `TEXTOS_TIPO_COBRO`.
  Sin imports de `lib/actions|services|repositories|db` (lo afirma un test).
- `components/shared/facturas/FacturasDeLaEmpresa.tsx` (T5.1): sección «Facturas de la empresa», `Table`, botón
  «Ver detalle» por fila, vacío y fallo.
- `components/shared/facturas/DetalleDeFactura.tsx` (T5.2): `Sheet` lateral; pide el detalle al abrir y al paginar
  (`useEffect`, respuesta por página); «No se pudo cargar la factura» ante throw o estado ≠ `ok`.
- `tests/unit/planes/facturas-vista.test.ts`, `tests/components/FacturasDeLaEmpresa.test.tsx`,
  `tests/components/DetalleDeFactura.test.tsx`, `tests/components/_facturas-plataforma.ts` (fábrica de facturas
  y líneas para los tests de pantalla; fuera de la lista de `tasks.md`, una ruta más: 28 de 40).

Archivos modificados:
- `app/(app)/mi-plan/page.tsx` (T6.1): `leerFacturas(actor)` aislada en el `Promise.all`; pasa
  `verDetalleFacturaMiPlanAction`.
- `app/(app)/mi-plan/_components/MiPlanModule.tsx` (T6.1): prop **opcional** `facturas: { lista, cargarDetalle }`
  y la sección al final, tras `CambioDePlan`. Desvío menor del design §6.2 (dos props sueltas y obligatorias): así
  no se tocan las ~20 llamadas de `MiPlanCambioDePlan.test.tsx` y `ConsumoDelPlanPeriodo.test.tsx`; la página
  siempre la pasa.
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx` (T6.2): `Tabs defaultValue="empresa"` con «Empresa»
  (plan, núcleo y módulos sin cambios, mismo orden) y «Facturación» (`FacturasDeLaEmpresa` con
  `verDetalleFacturaEmpresaAction.bind(null, empresa.organizacionId)`); «Volver a Empresas» fuera de las pestañas;
  `leerFacturas(actor, organizacionId)` aislada en el `Promise.all`.
- `tests/components/MiPlanModule.test.tsx`, `tests/integration/mi-plan-page.test.tsx`,
  `tests/integration/plataforma-empresa-detalle-page.test.tsx` (ampliados; los tests existentes sin cambios).

Mapa `R<n> → test` (frontend):
- R1 → `FacturasDeLaEmpresa.test.tsx` «R1: una sin plan, una con el plan anterior y la en curso…», «R1: ningún
  texto presenta las facturas como de un plan»; `mi-plan-page.test.tsx` «R1: el maestro ve la sección al final…»,
  «R1: la empresa sin facturas…», «R1 (SLT-91): %s no llega a leer las facturas»; `MiPlanModule.test.tsx` «R1: …».
- R2 → `facturas-vista.test.ts` «R2: …» (Emitida / En curso para `en_curso` y `por_cerrar`);
  `FacturasDeLaEmpresa.test.tsx` «R2: una %s se muestra igual»; `DetalleDeFactura.test.tsx` «R2, R6: una %s se
  muestra «En curso», sin número y con la cuota prevista marcada».
- R3 → `facturas-vista.test.ts` «R3: …» (los cuatro ejemplos del requisito y el corte en la hora de la plataforma).
- R4 → `facturas-vista.test.ts` «R4: una cerrada con número 7 → «N.º 7»…», «R4: una %s no muestra número».
- R5 → `FacturasDeLaEmpresa.test.tsx` «R5: importes con céntimos que un redondeo cambiaría…»;
  `facturas-vista.test.ts` «R5: suma exacta en céntimos…».
- R6 → `DetalleDeFactura.test.tsx` «R6: una cerrada con las dos cuotas, una de ellas prorrateada», «R6: una sin
  cuota…», «R2, R6: …»; `FacturasDeLaEmpresa.test.tsx` «R16, R6: «Ver detalle» abre el panel…».
- R7, R9 → `DetalleDeFactura.test.tsx` «R7, R9: cargo y reverso en el orden de la base, el reverso en negativo y
  «—» sin guía»; `facturas-vista.test.ts` «R7: fecha y hora del cobro…».
- R10 → `DetalleDeFactura.test.tsx` «R10: 230 líneas…», «R10: en la última página «Siguiente» está
  deshabilitado»; `facturas-vista.test.ts` «R10: páginas de una factura…».
- R12 → `plataforma-empresa-detalle-page.test.tsx` «R12: al abrir, «Empresa» es la pestaña elegida…», «R12:
  «Facturación» muestra las facturas de la empresa de la URL…», «R12: el detalle lo pide la action ligada…»,
  «R12: un rol de empresa no lee las facturas…».
- R16 → `FacturasDeLaEmpresa.test.tsx` «R16: los únicos botones abren el detalle…»; `DetalleDeFactura.test.tsx`
  «R16: los únicos botones del panel son cerrar y paginar»; guardia `cobro-plataforma-solo-por-trigger` (verde).
- R17 → `FacturasDeLaEmpresa.test.tsx` «R17: si la lectura falló (`null`)…»; `DetalleDeFactura.test.tsx` «R17: si
  %s, el detalle dice «No se pudo cargar la factura» y la lista sigue visible»; `mi-plan-page.test.tsx` «R17: si la
  lectura de las facturas lanza…»; `MiPlanModule.test.tsx` «R17: …»; `plataforma-empresa-detalle-page.test.tsx`
  «R17: si %s, «Facturación» lo dice y plan, núcleo y módulos se pintan igual».
- R18 → `FacturasDeLaEmpresa.test.tsx` «R18: sin facturas…»; `facturas-vista.test.ts` «R18, R17: los textos…».

Verificación (salida real, 2026-11-12):
- `pnpm run typecheck` (`NODE_OPTIONS=--max-old-space-size=8192`): `tsc --noEmit` sin errores.
- `pnpm exec eslint` sobre los 13 archivos tocados: sin errores ni avisos.
- `pnpm exec vitest run` de los 6 tests de la tanda + `MiPlanCambioDePlan.test.tsx` y
  `ConsumoDelPlanPeriodo.test.tsx` (montan `MiPlanModule`): 8 archivos, 134 pasados, 0 fallidos.
- `pnpm run test:guardias`: 343 archivos verdes, 4853 pasados; 4 fallidos, todos en
  `dependencias-declaradas-presentes` (baseline, ficha 420). `superficie-de-uso`, `mi-plan-solo-maestro`,
  `cobro-plataforma-solo-por-trigger` y `pais-sin-literales`: verdes.
- E2E no corridos en esta tanda: `planes-superadmin.spec.ts` y `superadmin-empresas.spec.ts` (Hecho de T6.2) y el
  nuevo `facturas-plataforma.spec.ts` quedan para T7.1.

Veredicto: frontend T4–T6 listo; guardia de superficie verde; faltan los E2E de T6.2/T7.1.

## Tanda E2E (T7.1) · sin commit (lo hace el implementer)

Archivos:
- `e2e/facturas-plataforma.spec.ts` (**nuevo**, serial; design §9): empresa con maestro, `admin`, zona y tienda; plan
  público (base 1 000 mensual, 300,00 por orden) asignado desde hoy con `PlanesRepository.asignar`; dos órdenes por
  `crearOrdenesDirectas` y una eliminada con la empresa fijada (se comprueban 2 cargos y 1 reverso en la base).
  Tests: (1) maestro en «Mi plan», fila «En curso» con órdenes «₡300» y detalle con las tres líneas (guías, «Cargo»
  «₡300» ×2, «Reverso» «-₡300»); (2) `factura_plataforma_cerrar(org, fin_natural_at + 6 min)`, el maestro recarga:
  «N.º 1», «Emitida», cuotas y total iguales a los de la fila de la base, la nueva en curso encima, mismo detalle;
  (3) superadmin, pestaña «Facturación» del detalle de empresa: misma «N.º 1» y mismas líneas; (4) `admin` →
  404 «no encontrado» sin la sección. `afterAll` archiva el plan. Sin `waitForTimeout`.
- `playwright.config.ts`: `facturas-plataforma` en `specs(...)` del proyecto `dinero`.

R19 → `e2e/facturas-plataforma.spec.ts` (los cuatro tests).

Entorno local (como `gate.yml > e2e-grupo`): base desechable `servi_logistic_slt119_e2e` (DROP/CREATE), `prisma
migrate deploy`, `pnpm run db:seed`; `next build` con `NODE_OPTIONS=--max-old-space-size=8192` y
`NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL=http://localhost:3044` (exit 0); `DATABASE_URL` a la base e2e y
`E2E_PUERTO=3044` por entorno. El `.env` del worktree no se tocó.

Las corridas pasan `AUTH_RISK_THRESHOLD=50` por entorno, como CI.

Salida real (2026-11-12):
- `playwright test e2e/facturas-plataforma.spec.ts` (sin `AUTH_RISK_THRESHOLD`): 1 failed, 3 did not run (el OTP de
  arriba).
- Ídem con `AUTH_RISK_THRESHOLD=50`, corrida 1: **4 passed** (16.2s), 0 failed, 0 flaky, 0 skipped.
- Ídem, corrida 2 seguida sobre la misma base: **4 passed** (37.7s), 0 failed, 0 flaky, 0 skipped.
- `playwright test e2e/planes-superadmin.spec.ts e2e/superadmin-empresas.spec.ts` (T6.2, sin tocarlos; arrastran
  `plataforma-vacia`): **18 passed** (1.3m), 0 failed, 0 flaky.
- `playwright test --project=dinero`: **102 passed** (8.9m), 0 failed, 0 flaky, 0 skipped.
- `vitest run tests/unit/guards/e2e-sin-saltos.guardia.test.ts`: 38 passed (la 1.ª vez cayó porque el comentario del
  config citaba el nombre de la función entre comillas invertidas y la guardia lo leyó como spec; se reescribió).
- `pnpm run typecheck` (`NODE_OPTIONS=--max-old-space-size=8192`): sin errores. `eslint` sobre los dos archivos: sin
  errores ni avisos.

Veredicto: T7.1 hecha; R19 verde en local dos veces seguidas, T6.2 y `dinero` verdes.

## Cierre del implementer (T7.2, T7.3) · 2026-11-12

Commits: `55cb78ee` (T1–T3), `e14a6b88` (T4–T6), y el de T7. PR borrador #146.

**T7.2:** `docs/architecture.md > Facturas de la plataforma > Lectura` ya no dice «aún no existe»; nueva viñeta
«Pantallas (SLT-119)»: por empresa, no por plan; sección de «Mi plan» y pestaña «Facturación»; líneas desde la traza,
100 por página; «N.º N»; sin descarga (SLT-136).

### Mapa R<n> → test (consolidado)

| R | Test |
|---|---|
| R1 | `tests/unit/services/factura-plataforma-service.test.ts` (orden), `tests/components/FacturasDeLaEmpresa.test.tsx`, `tests/components/MiPlanModule.test.tsx`, `tests/integration/mi-plan-page.test.tsx` |
| R2 | `tests/unit/planes/facturas-vista.test.ts`, `FacturasDeLaEmpresa.test.tsx`, `DetalleDeFactura.test.tsx` |
| R3, R4 | `tests/unit/planes/facturas-vista.test.ts` |
| R5 | `FacturasDeLaEmpresa.test.tsx`, `facturas-vista.test.ts` |
| R6, R9 | `tests/components/DetalleDeFactura.test.tsx` |
| R7, R8 | `tests/integration/db/factura-plataforma-detalle.test.ts`; R7 también `DetalleDeFactura.test.tsx` |
| R10 | `factura-plataforma-detalle.test.ts` (230 líneas: 100/100/30/vacía), `DetalleDeFactura.test.tsx` |
| R11 | `factura-plataforma-detalle.test.ts` |
| R12 | `factura-plataforma-detalle.test.ts`, `tests/integration/plataforma-empresa-detalle-page.test.tsx` |
| R13 | `factura-plataforma-service.test.ts`, `tests/unit/actions/facturas-plataforma.test.ts` |
| R14 | `factura-plataforma-detalle.test.ts`, `factura-plataforma-service.test.ts` |
| R15 | `factura-plataforma-service.test.ts` |
| R16 | `FacturasDeLaEmpresa.test.tsx`, `DetalleDeFactura.test.tsx`, `facturas-plataforma.test.ts`, guardia `cobro-plataforma-solo-por-trigger` |
| R17 | `FacturasDeLaEmpresa.test.tsx`, `DetalleDeFactura.test.tsx`, `MiPlanModule.test.tsx`, `mi-plan-page.test.tsx`, `plataforma-empresa-detalle-page.test.tsx` |
| R18 | `FacturasDeLaEmpresa.test.tsx` |
| R19 | `e2e/facturas-plataforma.spec.ts` (proyecto `dinero`) |

### Salida real (implementer, 2026-11-12, base `servi_logistic_slt119`)

- `pnpm run typecheck` (8 GB): exit 0.
- `pnpm exec vitest run` de los 9 archivos tocados: `Test Files 9 passed (9)`, `Tests 150 passed (150)`, 0 skipped.
- `pnpm run test:guardias`: `Test Files 1 failed | 343 passed (344)`; los 4 rojos son
  `dependencias-declaradas-presentes`, que está en `tests/baseline-rojos.json` (no lo toca este cambio).
- `./init.sh`: **rojo por el board, no por el código**: «features en vuelo sin assignee en el tracker: SLT-119» y
  «zona backend: SLT-43, SLT-44, SLT-45, SLT-65, SLT-71, SLT-128 (6 in_progress, max 5)». Es `feature_list.json`
  (del leader); el gate corta ahí antes de los pasos de código.
  **T7.3 no queda «verde»** (m2 de la review): el rojo es solo del validador de features (cupo backend 6/5 por las
  fichas geo en pausa, aceptado por el humano).

### Desvíos menores respecto al design (para el reviewer)

1. `deEmpresa` con un `organizacionId` que no es uuid lanza (sin leer la base) en vez de `validation_error`, porque
   `FacturasResult` (§3) no lo tiene; la página lo pinta como «No se pudieron cargar las facturas» (R17). Con test.
2. `errores: Record<string, string>` (§3) con el primer mensaje de cada campo; `PlanesService` usa `string[]`.
3. `MiPlanModule` recibe una prop opcional `facturas: { lista, cargarDetalle }` en vez de dos props obligatorias
   (§6.2), para no tocar ~20 montajes en otros tests; la página siempre la pasa.
4. Archivo extra fuera de la lista de tasks: `tests/components/_facturas-plataforma.ts` (datos de prueba). 28/40.


## Review vuelta 1 (2026-11-12): B2, m1, m2, m3

**m1.** `MiPlanModule`: `facturas` sigue opcional pero toma por defecto `FACTURAS_NO_RECIBIDAS` (`lista: null`): sin la
prop, la sección «Facturas de la empresa» se pinta con el aviso de R17 «No se pudieron cargar las facturas», no
desaparece. Test: `MiPlanModule.test.tsx` «R17: sin la prop facturas, la sección se ve con el aviso de fallo, no
desaparece» (sustituye al viejo «R1: sin la prop `facturas` no hay sección»). `MiPlanCambioDePlan.test.tsx`: 4 casos
de R20 usaban `findByRole("alert")` y ahora hay dos alertas; helper `alertaDelCambio()`, sin tocar montajes.
- `vitest run` de MiPlanModule, MiPlanCambioDePlan, ConsumoDelPlanPeriodo y mi-plan-page: `Test Files 4 passed (4)`,
  `Tests 64 passed (64)`. `tsc --noEmit` (8 GB) exit 0; eslint de los 3 archivos limpio.

**B2.** Base desechable `servi_logistic_slt119_e2e` recreada (DROP/CREATE, `migrate deploy`, `db:seed`), `next build`
nuevo con `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL=http://localhost:3044`. Comando, con `AUTH_RISK_THRESHOLD=50`,
`E2E_PUERTO=3044`, `PRISMA_LOG_QUERIES=off` y `DATABASE_URL` a la base e2e por entorno:
`pnpm exec playwright test --project=aislamiento e2e/mi-plan-cambiar-plan.spec.ts e2e/planes-costeo.spec.ts
e2e/cobro-plataforma-sl40.spec.ts e2e/pago-plataforma-sl45.spec.ts e2e/dos-empresas-humo.spec.ts --reporter=list`

| Corrida | passed | failed | flaky | skipped | tiempo |
|---|---|---|---|---|---|
| 0 (sin `PRISMA_LOG_QUERIES=off`) | 7 | 1 | 0 | 0 (26 did not run) | — |
| 1 | 34 | 0 | 0 | 0 | 1.9 min |
| 2 (seguida, misma base) | 34 | 0 | 0 | 0 | 2.0 min |

Corrida 0: cayó `superadmin-arranque.spec.ts:54` (R18 de esa ficha, «no imprime sus datos») porque el `.env` local
activa el log de consultas de Prisma con parámetros; ajeno a esta ficha. Desglose 1 y 2: `plataforma-vacia`
(superadmin-arranque 3, superadmin-empresas 7) y `aislamiento` (dos-empresas-humo 8, planes-costeo 5,
pago-plataforma-sl45 6, cobro-plataforma-sl40 3, mi-plan-cambiar-plan 2).

**m2.** T7.3 en `tasks.md` y aquí: `./init.sh` no está verde, rojo solo por el validador de features.
**m3.** Quitada de esta bitácora la propuesta sobre `AUTH_RISK_THRESHOLD` para `docs/verification.md`.
