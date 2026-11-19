# SLT-176 «Sacar de CierreBodegaService las lecturas de cifras de presentación del cierre» — requirements

Ruta: **completa** (zona backend, complejidad low; label del board). Requisitos: **R690-R705**, del
rango **R690-R709** reservado para esta ficha (SLT-175 «Pruebas R621/R623 con datos propios y guardia
R631 con imports indirectos» usó R670-R679 con R670-R689 reservado; R710-R789 los ocupan otros specs en
paralelo).

**Sin cambios de esquema ni migraciones.** El diff no toca `db/`.

## Origen

- Board: «CierreBodegaService escribe dinero y llega por import indirecto a las cifras de presentación
  (`CierreBodegaService.ts:556` → `cifras-bodega-descarga.ts:90` → `cifras-cierre`; y `:40` →
  `CierresAdminService.ts:87`). Hoy solo las lee para la descarga de la satélite. Mover esas lecturas a
  un servicio de solo lectura y vaciar la lista de excepciones de la guardia R631 (SLT-175).»
- SLT-175, decisión D2 (`specs/SLT-175-pruebas-r621-r623-guardia-r631/requirements.md:129`): los dos
  caminos quedan como excepciones con nombre, «la lista solo puede encoger» y «la vacía SLT-176».
- Review de SLT-175 (`progress/review_SLT-175.md:47-48`):
  - **m1**: el tope de la lista es el literal `2` (`…guardia.test.ts:352,458`); al vaciarla debe bajar a 0.
  - **m2**: la excepción es por par (servicio, primer módulo), así que un camino NUEVO dentro del subárbol
    de `cifras-bodega-descarga.ts` o de `CierresAdminService.ts` queda tapado mientras la excepción viva.
    Vaciar la lista lo cierra.

## Medición (árbol de `dev` 825ba66d)

- `lib/services/CierreBodegaService.ts` es servicio de dinero para la guardia R631
  (`tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts:30-36`).
- Sus dos imports de valor que llegan a las cifras de presentación los usa **un solo método**,
  `listarCierresBodegaSolicitadosCompleto` (`CierreBodegaService.ts:516-560`):
  - `:33-38` importa `cierresBodegaModeloNuevo`, `cifrasBodegaDescarga`, `CLASE_CIFRAS_BODEGA_DESCARGA` y
    `LecturaCifrasBodegaAusenteError` de `cifras-bodega-descarga.ts` (usados en `:539-557`);
  - `:40` importa `anularEmpresaSiNoCentral` de `CierresAdminService.ts:188` (usado en `:557`).
  - El quinto parámetro del constructor, `cifrasLote` (`:256`), solo lo usa ese método (`:542-548`).
- Quién llama al método: solo la acción `listarCierresBodegaSolicitadosCompleto`
  (`lib/actions/cierre-bodega.ts:277-291`), que construye el servicio con `buildCierreBodegaService()`
  (`:77-87`). La acción la registra `lib/actions/_shared/registro-descargas.ts:28,69` y la llama la pantalla
  `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx:273` por su nombre.
- El método está declarado en `lib/interfaces/services/ICierreBodegaService.ts:415-428`.

## Alcance

**Dentro:**
- Un servicio nuevo, de solo lectura, que hace lo que hoy hace
  `CierreBodegaService.listarCierresBodegaSolicitadosCompleto`, con el mismo resultado.
- `CierreBodegaService` pierde ese método, su parámetro `cifrasLote` y los dos imports.
- La acción `listarCierresBodegaSolicitadosCompleto` (mismo nombre, mismo contrato) usa el servicio nuevo.
- La guardia R631: lista de excepciones vacía, tope 0 y una contraprueba con el árbol real.
- Los tests que hoy prueban el método sobre `CierreBodegaService` pasan a probarlo sobre el servicio
  nuevo, **sin cambiar ningún valor esperado**.

**Fuera (lo que NO entra):**
- **`lib/services/CierresAdminService.ts` y `lib/interfaces/services/ICierresAdminService.ts`: 0 líneas.**
  Los toca SLT-125 «Geografía jerárquica: presentación, exportes, cierres y geocodificación» (otra persona,
  PR #161). El servicio nuevo importa `anularEmpresaSiNoCentral` de donde está hoy.
- `lib/services/cifras-bodega-descarga.ts`, `lib/utils/cifras-cierre*.ts` y `CierresBodegaAdminService`
  (la descarga de la central): sin cambios.
- La pantalla, el registro de descargas y las columnas del archivo: sin cambios.
- `POR_NOMBRE`, `POR_PATRON`, `MODULOS_PROHIBIDOS` y `NOMBRES_PROHIBIDOS` de la guardia: sin cambios.
  `CierreBodegaService.ts` sigue en la lista de servicios de dinero.
- Esquema, migraciones, permisos y módulos encendidos: sin cambios.

## Decisiones cerradas (no reabrir)

No hubo `/afinar-feature`: la tabla recoge lo que esta ficha hereda.

| Id | Fecha · quién | Decisión |
|---|---|---|
| D1 | 2026-11-16 · Carlos | (Heredada de SLT-175 D2.) La lista de excepciones de la guardia R631 solo puede encoger, y esta ficha la vacía. |
| D2 | 2026-11-16 · Carlos | (Del board.) Las lecturas se mueven a un servicio de solo lectura; la descarga de la satélite queda igual. |

Cobertura: D1 → R700, R701, R702. D2 → R690-R699.

## Requisitos (EARS)

### La descarga de la satélite, igual que hoy

- **R690** — CUANDO un `adminSatelite` pide el conjunto de «Cierres de bodega solicitados» para descargar
  (acción `listarCierresBodegaSolicitadosCompleto`), el sistema DEBE devolver, para los mismos datos y
  filtros, el mismo resultado que antes de esta ficha:
  - el mismo `status` (`ok` o `limite_excedido`), con los mismos `items`, `total` y `limite`;
  - sin cierres de bodega del modelo nuevo, la respuesta sin la clave `cifrasModeloNuevo` y sin ninguna
    lectura en lote (SLT-141 R384);
  - con cierres nuevos, una entrada de `cifrasModeloNuevo` por cierre nuevo, en el orden de `items` y con
    las mismas claves (SLT-141 R387).
- **R691** — CUANDO el conjunto trae cierres de bodega del modelo nuevo, el sistema DEBE pedir la lectura
  en lote UNA vez, solo con los ids de los nuevos, con el alcance `{ lectura: "zona", zonaId }` de la zona
  del actor y la zona horaria de la empresa (SLT-141 R389).
- **R692** — MIENTRAS el actor no tenga acceso total, el sistema DEBE devolver en cada entrada de
  `cifrasModeloNuevo`:
  - `totalFacturado`, `ivaFacturado`, `netoEmpresa`, `pagoTienda` y `partesPorTienda` en `null`
    (SLT-161 R480);
  - `cierreBodegaId`, `gestiones` y `pagosAjustados` con su valor;
  - y NO DEBE incluir la clave `pagoEntregado` (F481, SLT-141 R386).
- **R693** — SI el actor no es `adminSatelite`, ENTONCES el sistema DEBE devolver `forbidden` sin leer
  ningún repositorio. SI el actor no tiene zona, o el filtro de folio es imposible (SLT-153 R457),
  ENTONCES el sistema DEBE devolver `{ status: "ok", items: [], total: 0 }`.
- **R694** — SI el conjunto trae un cierre del modelo nuevo y el servicio no tiene la lectura en lote,
  ENTONCES el sistema DEBE lanzar `LecturaCifrasBodegaAusenteError` en vez de devolver el archivo sin
  cifras.
- **R695** — El borde de la acción NO DEBE cambiar: sin sesión, `unauthenticated` sin tocar el servicio;
  una clave no declarada (`zonaId` incluida), `validation_error` sin tocar el servicio; los `filtros`
  válidos llegan al servicio tal cual.

### Un servicio de solo lectura

- **R696** — La lectura de R690-R694 DEBE vivir en un servicio de `lib/services/` distinto de
  `CierreBodegaService`, que NO esté en la lista de servicios de dinero de la guardia R631 y cuyo
  constructor reciba SOLO puertos de lectura: `findCierresBodegaByZona`, `findUsuarioZonaId`,
  `zonaHoraria` y `leerCierresDiaDeBodegas`.
- **R697** — El archivo del servicio de solo lectura NO DEBE importar por valor de `@/lib/repositories/`,
  `@/lib/db/` ni `@prisma/client`, ni de ningún archivo que la guardia R631 tenga por servicio de dinero.
  SI alguno de esos imports aparece, ENTONCES la guardia DEBE dar rojo nombrándolo.
- **R698** — CUANDO la acción `listarCierresBodegaSolicitadosCompleto` se ejecuta sin servicio inyectado,
  DEBE construir el servicio de solo lectura con la lectura en lote real (`CifrasBodegaLoteRepository`) y
  NO DEBE construir `CierreBodegaService`.
- **R699** — `CierreBodegaService` NO DEBE tener el método `listarCierresBodegaSolicitadosCompleto` ni
  recibir la lectura en lote de cifras, e `ICierreBodegaService` NO DEBE declararlo. Sus demás operaciones
  (`listarConsolidacion`, los dos paginados, `listarConsolidablesCompleto`, `solicitarCierreBodega`) NO
  DEBEN cambiar de resultado.

### La guardia R631 sin excepciones

- **R700** — La lista de excepciones de la guardia R631 DEBE estar vacía y su tope DEBE ser `0`, fijado
  con el literal `0` en la aserción («solo encoge», m1). Sobre el árbol real, el veredicto de la guardia
  DEBE ser `[]` y los caminos de valor de los servicios de dinero a `cifras-cierre` o
  `cifras-cierre-bodega` DEBEN ser `[]`.
- **R701** — SI sobre el árbol real se reemplaza en memoria `lib/services/CierreBodegaService.ts` por un
  texto que vuelve a importar por valor de `@/lib/services/cifras-bodega-descarga` o
  `anularEmpresaSiNoCentral` de `@/lib/services/CierresAdminService`, ENTONCES el veredicto DEBE dar rojo
  con la cadena entera (servicio → … → módulo prohibido). Lo mismo con un camino nuevo que entre por
  cualquier otro módulo (m2: ya no hay par exceptuado que lo tape).
- **R702** — La guardia DEBE seguir probando que su barrido no es vacuo: lee más archivos que servicios de
  dinero y llega a `lib/utils/ingreso-empresa.ts` (SLT-175 R679).

### Sin esquema

- **R703** — El diff de esta ficha NO DEBE tocar `db/` (`schema.prisma` ni `migrations/`).
- **R704** — El diff NO DEBE tocar `lib/services/CierresAdminService.ts` ni
  `lib/interfaces/services/ICierresAdminService.ts`.
- **R705** — Los tests que hoy prueban la descarga de la satélite sobre `CierreBodegaService` DEBEN
  seguir existiendo, apuntados al servicio de solo lectura, y NINGUNO de sus valores esperados DEBE
  cambiar: solo cambia cómo se construye el servicio.

## Preguntas abiertas

Ninguna que dependa del humano. Lo técnico (nombre del servicio, forma del constructor, dónde vive la
contraprueba) está decidido en `design.md`.

Aviso, no pregunta: el texto del error interno `LecturaCifrasBodegaAusenteError` y el contexto de
`zonaDeLaEmpresa` nombran la operación; pasa de `CierreBodegaService.listarCierresBodegaSolicitadosCompleto`
a `CierresBodegaSateliteDescargaService.listarCierresBodegaSolicitadosCompleto`. No llega al usuario ni
a ningún test (se buscó el literal en `tests/` y `e2e/`: no aparece).
