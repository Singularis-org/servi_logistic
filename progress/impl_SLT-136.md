# SLT-136 «Planes: aviso, correo y descarga de la factura» · bitácora

## Tanda 1 (T1.1–T1.4) · datos y lectura de la descarga · sin commit (lo hace el leader)
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
