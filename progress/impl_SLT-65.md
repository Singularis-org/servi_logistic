# impl SLT-65 — geo-jerarquica-consultas

Bitácora del implementer. Spec: `specs/SLT-65-geo-jerarquica-consultas/`.

## T0.1 — Llamadores de las lecturas (contexto)

Resultado: **ningún llamador de las lecturas 1–4, de `crearCierre`/`leerDescriptivosDeOrdenes` ni de
`ZonaRepository.update` corre en `comoPlataforma`.** El único método de design §2.1 en plataforma es
`contarSinEntregarPorNodoGeografico` (fila 5), que el design ya trata con `dePais` (§5).

Único llamador sin contexto: `scripts/bench-busqueda-ordenes.ts` (`OrdenService.listar` → `list`, con
`PrismaClient` crudo; aborta fuera de localhost). No es de producción.

| método | llamador | punto de entrada | contexto |
|---|---|---|---|
| `listByOwner` | `lib/services/ApiOrdenLecturaService.ts:173` | `GET app/api/ordenes/api-key/route.ts:153` → `handleListadoApi:114` | `conEmpresa` de la API key (`lib/api/api-key-request.ts:79`; la key se resuelve antes en plataforma, `:52`) |
| `findDetalleByOrdenIdForOwner` | `ApiOrdenLecturaService.ts:208` | `GET app/api/ordenes/api-key/orden/[id]/route.ts:165` | `conEmpresa` (key) |
| `findDetalleByOrdenIdForOwner` | `lib/services/ApiPdfEtiquetaService.ts:58` | `POST app/api/ordenes/api-key/orden/[id]/generate/route.ts:127` | `conEmpresa` (key) |
| `list` | `lib/services/OrdenService.ts:286`/`:288` ← `listar:382`, `listarCompleto:434` | actions `lib/actions/ordenes.ts:54`, `:74`; `lib/actions/_shared/registro-descargas.ts:58` | sesión |
| `list` | `scripts/bench-busqueda-ordenes.ts:637`, `:648` | script local | sin contexto (no producción) |
| `findListItemsByIds` | `lib/services/TableroDiaService.ts:313` | action `lib/actions/tablero-dia.ts:114` | sesión |
| recepción satélite `:4119` | `lib/services/RecepcionSateliteService.ts:169` | action `lib/actions/recepcion-satelite.ts:158` | sesión |
| recepción satélite `:4270` | `RecepcionSateliteService.ts:256`, `:323` | actions `recepcion-satelite.ts:183`, `:209`; `registro-descargas.ts:81` | sesión |
| `findBaseCobroDevolucion` | `lib/services/RechazoTiendaService.ts:241` | action `lib/actions/resolver-novedad.ts:197` | sesión |
| `findBaseCobroDevolucion` | igual, desde `scripts/demo-qa/receta.ts:1172` | demo QA | `conEmpresa` |
| `findParaCorreccion` | `lib/services/CorregirDatosClienteService.ts:203` ← `corregir:229`, `obtenerUbicacion:457` | actions `lib/actions/corregir-datos-cliente.ts:114`, `:167` | sesión |
| `crearCierre` | `lib/services/CierreDiaService.ts:713` | action `lib/actions/cierre-dia.ts:186` | sesión |
| `crearCierre` | `lib/services/CorteDiarioService.ts:209` | cron `app/api/cron/corte-diario/route.ts:131` → `paraCadaEmpresa` | `conEmpresa` por empresa (`lib/db/para-cada-empresa.ts:78`) |
| `leerDescriptivosDeOrdenes` | solo `CierreDiaRepository.ts:1328` | ver `crearCierre` | `conEmpresa`/sesión |
| `ZonaRepository.update` | `lib/services/ZonaService.ts:187` | action `lib/actions/zonas.ts:124` | sesión |
| `contarSinEntregarPorNodoGeografico` (fila 5) | `lib/services/GeografiaService.ts:219` | action `lib/actions/geografia-plataforma.ts:301` | **`comoPlataforma("SL-20")`** (previsto en §5) |

Revisados y sin llegar a estos métodos: `rastreo-publico.ts` (plataforma solo para resolver la
empresa; la lectura va en `conEmpresa`), `app/api/cron/procesar-jobs` y `scripts/drenar-jobs.ts`, y el
resto de crons.

## T1.2 — Copia literal (`scripts/geo-equivalencia/consultas-de-hoy.ts`)

Commit propio `69a385e`, antes de tocar ningún repositorio. Cada función cita su origen en `b2bade4`.
Adaptaciones no literales (para que el reviewer las compare):
1. `this.prisma` → parámetro `cliente`/`tx`; métodos → funciones exportadas; `apiOrdenSelect` →
   `API_ORDEN_SELECT`.
2. Helpers y constantes estables se importan de `lib/` (`SELECT_MARCA_ZONA_ESPECIAL`,
   `esZonaEspecialDeLaEmpresa`, `zonaUnicaDeDistrito`, `ESTADOS_TERMINALES`,
   `ESTADOS_PAQUETE_EN_ESTANTE`, `NOMBRE_USUARIO_SELECT`, `ordenTotal`, `conAyudaAbiertaDe`,
   `SNAPSHOT_SELECT` y tipos). Se copian `DescriptivosDeOrden`/`DescriptivosTxClient` (SLT-65 los
   cambia) y las constantes privadas `DESEMPATE_UNICO`, `RESULTADO_REPROGRAMADA` y `SORT_COLUMN`.
3. **`SORT_COLUMN` reducida a `created_at`** (y `sortBy: Extract<SortField, "created_at">`): la
   entrada `num_remision: "claveRemision"` ponía en rojo la guardia `clave-remision-solo-lectura`
   (su lista `PERMITIDOS` es una decisión humana). El design solo mide la primera página con el
   orden por defecto, así que no hace falta otra entrada.
4. `paginaApiDeHoy`/`paginaListadoDeHoy` devuelven las filas crudas del `findMany` (sin `count`,
   tarifas, señales ni mapeo a DTO, que no leen geografía). Con `where` vacío el `where` del listado
   queda en `{ deletedAt: null }`.
5. `congeladoDeHoy` devuelve las mismas expresiones de `crearCierre:1339–1370` fuera del
   `createMany`. `marcasDeHoy` es nueva (proyección + `esZonaEspecialDeLaEmpresa`, `Map<id, boolean>`).
6. `planDeHoy` sin `loteId`, actor, `updateMany` ni `appendAccion`; conserva el `continue` (una zona
   sin elegibles no entra en `porZona`). Dos JSDoc largos resumidos con cita; el código es literal.

Verificación: `pnpm run typecheck` verde; `eslint` del archivo sin issues; guardias
`clave-remision-solo-lectura` y `geografia-sin-cte-recursiva`: 2 files, 17 tests passed.
`dependencias-declaradas-presentes` está en rojo, pero ya lo estaba y figura en `tests/baseline-rojos.json`.

## T0.2, T1.1, T2.1–T2.4 — órdenes (backend_dev, 2026-10-31)

### Archivos
- Nuevos: `lib/repositories/_shared/lugar-orden.ts`, `scripts/geo-equivalencia/comparacion.ts`,
  `tests/integration/db/_fixtures/geo-65.ts`, `tests/integration/db/geo-65-fixture.test.ts`,
  `tests/integration/db/geo-consultas-ordenes.test.ts`, `tests/unit/repositories/lugar-orden.test.ts`,
  `tests/fixtures/doble-catalogo-geografico.ts` (los cinco delegados del catálogo para los dobles).
- Modificados: `lib/repositories/OrdenRepository.ts`, `scripts/geo-equivalencia-dinero.ts`, y 15 tests
  existentes, solo en la ENTRADA (ver abajo).

### Qué cambió en `OrdenRepository`
- `marcasDeOrdenes(filas)` privado: `esZonaEspecial(cat, asig, lugarDeLaOrden(f))` con
  `this.catalogoGeografico().deLaEmpresa()` (la carga memorizada por instancia de SLT-44). Vacío → `[]`.
- `apiOrdenSelect`: `distrito: { ...SELECT_MARCA_ZONA_ESPECIAL }` → `distritoId`, `cantonId`.
  `WITH_ESTATUS_Y_TIENDA.distrito` → `{ id, nombre }`. `toApiOrdenRow`, `toApiOrdenDetalleRow`,
  `toListItemDTO` y `toBodegaSateliteRow` reciben la marca.
- `listByOwner`, `findDetalleByOrdenIdForOwner`, `list`, `findListItemsByIds`,
  `findRecepcionSateliteByZona`, `hidratarSatelite`, `findBaseCobroDevolucion` y `findParaCorreccion`
  (este: `distritoNombre = nodo(cat, distritoId)?.nombre ?? null`).
- Sin tocar (R28): `list` :2024–2027 (filtros), `condicionesSatelite`, `WITH_ETIQUETA`,
  `findNovedadesByTienda`, `toRelaciones` y los nombres de `toBodegaSateliteRow`.
- `SELECT_MARCA_ZONA_ESPECIAL`/`esZonaEspecialDeLaEmpresa` ya no se importan en `OrdenRepository`.

### T5.1 (segunda parte, solo lectura) — qué consume `RechazoTiendaService`
`congelarCobro` (`RechazoTiendaService.ts:238–285`) solo usa la fila de `findBaseCobroDevolucion`
(`ordenId`, `tiendaId`, `zonaId`, `esCentral`, `esZonaEspecial`, `montoCobrar`, `cobraComision`) y la
tarifa de `resolveTarifas([{tiendaId, zonaId}])`, cuyo par sale de esa misma fila. `findById` (:108)
solo decide autorización y estado (`tiendaId`, `estatusValue`), no el importe. La igualdad de la fila
basta para el cobro.

### Mapa R → test
| R | Test |
|---|---|
| R1, R2, R3 | `geo-consultas-ordenes.test.ts` («API…», «/ordenes…», «cobro… y corrección…», herencia en cantón) |
| R1, R9, R13, R19 (forma) | `tests/unit/repositories/lugar-orden.test.ts` |
| R4 | `geo-consultas-ordenes.test.ts` («en plataforma…», «sin contexto, con la extensión real…») |
| R27 (parcial) | suites existentes citadas, sin cambiar aserciones |

### Tests existentes que cambian de ENTRADA (ningún `expect` cambia)
Añaden `...delegadosDelCatalogo()` al doble de Prisma (o el equivalente en el proxy de
`api-pdf-etiqueta-columna-intacta`); `api-lectura` y `tarifa-especial-por-distrito` además ponen
`distritoId` en la fila y la marca en el catálogo del doble, donde antes la simulaba
`distrito.zonasEspeciales`. `git diff -- tests/ | grep '^[-+].*expect'` sale vacío.
(Ampliado: `tests/unit/api/ordenes-api-key-composicion-415.test.ts` también cambia solo el doble.)

### BLOQUEO — dos aserciones de SALIDA que el design no deja cumplir
El design (§2.1 fila 1, §3) quita la relación `distrito` de `apiOrdenSelect`. Hay dos tests existentes
que congelan esa forma del `select`, y su `expect` es salida, no entrada:
1. `tests/unit/repositories/orden-repository.no-regresion-106.test.ts:266`: `SELECT_DETALLE_106` lleva
   `distrito: { select: { zonasEspeciales: … } }` (:119). Ahora el select trae `distritoId`/`cantonId`.
2. `tests/unit/repositories/orden-repository.api-lectura.test.ts:531`: `expect(select.distrito).toEqual({ select: { zonasEspeciales … } })`.
Además `tests/integration/db/gestiones-detalle-api-405.test.ts` (`CONSULTAS_DEL_DETALLE`, 14
consultas, con `distrito` y `distrito_zona_especial`) cambiará en CI cuando corra con datos. Está en
`baseline-rojos.json` (base vacía), así que hoy no se ve. No se ha tocado ningún `expect`: decide el
humano o el spec_author (enmendar el literal congelado, como hicieron las fichas 415 y SL-38).

### Corridas (Postgres local, por nombre)
- Nuevos: `lugar-orden` + `geo-65-fixture`: 2 files, 8 tests passed. `geo-consultas-ordenes`: 6/6 passed.
- Unit de OrdenRepository y dobles (47 files): 800 passed, 2 failed (las dos del bloqueo).
- Integración (37 files): en verde costo-y-zona/405/455/corregir-repo… no corren (base vacía, en
  baseline); `ordenes-api-key-listado`, `ordenes-api-key-orden-consulta` y `asimetria-sin-tarifa`, en
  verde tras el doble (3 files, 62 tests); `zona-especial-dos-empresas` 12/12; `geo-equivalencia-dinero` 8/8.
- `vitest related` (OrdenRepository, lugar-orden, scripts): 657 files; fuera de la baseline solo quedan
  las dos del bloqueo, más tres que fallan en `beforeAll` por el estado de la base local
  (`carga-division`, `geografia-superadmin-sin-empresa`: «la base ya tiene un superadmin»;
  `demo-qa`: «faltan catálogos vehiculo»). No son de este cambio. Ningún fallo trae catálogo ni
  `EmpresaNoResuelta` en su traza.
- Guardias zona-especial-punto-unico, geografia-lecturas-sin-nodo-fk, geografia-sin-cte-recursiva,
  consultas-concurrentes-en-transaccion y clave-remision-solo-lectura: 5 files, 55 passed.
- `pnpm run typecheck`: verde. `pnpm run lint`: 0 errores (232 warnings que ya estaban).

Veredicto: T0.2, T1.1, T2.1–T2.3 hechas; T2.4 en verde salvo dos `expect` congelados de la forma del
`select` que contradicen el design. Parado ahí, a la espera de decisión.

### Decisión de los literales (T2.4)
Decisión humana: «Sí, actualizar los literales» (Camilo, 2026-10-31). Solo se tocan los tres literales
que congelan la forma del `select`; cada uno lleva un comentario que cita SLT-65 y la decisión.
1. `tests/unit/repositories/orden-repository.no-regresion-106.test.ts` (`SELECT_DETALLE_106`):
   `distrito: { select: { zonasEspeciales … } }` pasa a `distritoId: true, cantonId: true`.
2. `tests/unit/repositories/orden-repository.api-lectura.test.ts` (antes :537): el
   `expect(select.distrito).toEqual({ select: { zonasEspeciales … } })` pasa a
   `select.distrito` undefined + `select.distritoId`/`select.cantonId` a `true`.
3. `tests/integration/db/gestiones-detalle-api-405.test.ts` (`CONSULTAS_DEL_DETALLE`): salen
   `distrito` (5) y `distrito_zona_especial` (9b) de las relaciones del detalle; al final van las seis
   consultas de la carga del catálogo (`marcasDeOrdenes` -> `deLaEmpresa`): `zona_distrito`, `zona`,
   `organizacion`, `tipo_nivel_geografico`, `nodo_geografico`, `distrito_zona_especial` (12 + 6 = 18).
   NO MEDIDO: la base local no tiene órdenes (el `beforeAll` falla: «la tabla `orden` esta vacia»);
   la lista sale del código. El archivo está en `tests/baseline-rojos.json`.

**ABIERTO en el 405 (no se resuelve cambiando solo el literal).** `deLaEmpresa` memoriza la carga por
instancia, y el test lee dos veces con el MISMO repo: la primera lectura (con gestiones) emite 18
consultas y la segunda (sin gestiones) 12. Con cualquier literal, cuando corra con datos (SL-31), fallan
aserciones que no son el literal: `toHaveLength(14)` (:~606, serían 18) y la comparación con/sin
gestiones (:~619 `toHaveLength(tablasSinGestiones.length)` y :~622 `tablasSinGestiones` contra el
literal). Hace falta decisión: precargar el catálogo antes de medir, o medir el coste del detalle
aparte de la carga. No lo he tocado.

Corridas (Postgres local; `.env` de la raíz por comando):
- `pnpm run typecheck`: verde (exit 0).
- `pnpm run lint`: 0 errores, 232 warnings (los que ya estaban).
- Tests tocados, por nombre (22 files: 3 nuevos, 18 modificados incluidos los tres de los literales, y
  geo-equivalencia-dinero): 21 files passed, 1 failed; 304 tests passed, 12 skipped. El único rojo es
  `gestiones-detalle-api-405` en el `beforeAll` (base sin órdenes), en la baseline: no bloqueante.
- `git diff -- tests/ | grep -E '^[-+].*expect'`: solo las líneas del literal de `api-lectura`
  (los otros dos literales son constantes, no líneas `expect`).

Veredicto: los tres literales actualizados y la tanda de órdenes en verde fuera de la baseline; queda
abierta la medición del 405 (carga del catálogo memorizada por instancia), que necesita decisión.
