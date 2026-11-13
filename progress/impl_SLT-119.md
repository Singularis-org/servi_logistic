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
