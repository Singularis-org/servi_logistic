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

## Tandas 2-3 (T2.1–T2.4, T3.1) · resumen, PDF y Excel (lib puro) · sin commit (lo hace el leader)
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
