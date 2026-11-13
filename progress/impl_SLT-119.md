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
