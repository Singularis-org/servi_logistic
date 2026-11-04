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

## T4 — Zonas y contexto (backend_dev, 2026-10-31)

### Archivos
- `lib/repositories/ZonaRepository.ts` (modificado): `planificarReconciliacion` exportada, con
  `PlanDeReconciliacion` y `TxDeReconciliacion` (`Pick<TransactionClient, "orden"> & CatalogoPrismaClient`).
  Carga `deLaEmpresa()` sobre la `tx` del guardado, lugares = afectados ∪ `nodosBajo`, zona por
  `zonaQueCubre`, y `whereBaseElegible(lugares, zona)` con `...whereLugarEn(lugares)`. `update`
  aplica el plan: mismo `updateMany` (solo `zonaId`), mismo `appendAccion` por orden, un solo
  `loteId`, misma respuesta. `ZonaPrismaClient` gana `& CatalogoPrismaClient`. Se quita el import de
  `zonaUnicaDeDistrito` (llega por `zonaQueCubre`).
  - Los modelos del catálogo van por `CatalogoPrismaClient` y no se nombran: escribir el modelo de
    las marcas en el `Pick` pone roja `zona-especial-punto-unico`.
  - `porZona` no lleva zonas sin elegibles (igual que `planDeHoy`), y el actor se resuelve solo si
    hay algo que mover (antes: si alguna zona se resolvía). Son lecturas, no salidas.
- `tests/integration/db/geo-consultas-zona.test.ts` (nuevo, 4 casos).
- `tests/unit/repositories/zona-repository.test.ts` (solo dobles de entrada).
- No se ha tocado ningún archivo compartido (`geo-65.ts`, `doble-catalogo-geografico.ts`,
  `lugar-orden.ts`) ni nada de T3.

### Mapa R → test
| R | Test |
|---|---|
| R13 | `geo-consultas-zona`: «R13, R15: … el plan es el de hoy» (todos los distritos de la empresa, CR y XA) y «R13: una asignacion en un canton …» (canton y distrito sin asignación propia → sur; distrito central → central; dos zonas → no se mueve) |
| R14 | `geo-consultas-zona`: «R14: `update` mueve solo …» (1 movida, 1 retenida en estante, la del cierre queda, la otra empresa intacta, una fila de historial y un lote). `zona-reconciliacion-ordenes`, `zona-central-guarda-y-rastro`, `zona-pago-mensajero-rastro` sin cambios |
| R15 | `geo-consultas-zona` «R13, R15»: `planificarReconciliacion` = `planDeHoy` (mismas órdenes, zonas y retenidas) y las órdenes sin distrito no se mueven |
| R16 | `zona-repository.test.ts` (unit, mismas escrituras; ver bloqueo) y `zonas-action.test.ts` sin cambios |
| R17 | `geo-consultas-zona` «R17»: el guardado de la zona norte añade el distrito sin zona y su orden se mueve en el mismo guardado (el plan ve lo escrito), y los nodos leídos por la carga son solo de XA |
| R18 | `geo-nodo-rls.test.ts` y `geografia-dos-paises.test.ts` sin cambios, más el diff de T4.3 |

Contraprueba a mano: con `distritoId: { in: lugares }` en lugar de `whereLugarEn`, cae el caso de
herencia del cantón (1 failed | 3 passed). Restaurado.

### Tests existentes que cambian de ENTRADA (ningún `expect` cambia)
`zona-repository.test.ts`: `buildTx` añade `...delegadosDelCatalogo({ nodos: NODOS_DEL_DOBLE })`; la
segunda respuesta de `zonaDistrito.findMany` (la que ahora lee la carga del catálogo) pasa a la forma
`{ distritoId, zona: { id, nombre, esCentral } }` con `filaDeZona`, en `txConNM` y en el caso
«design §7.1» (:~1030). `git diff -- tests/unit/repositories/zona-repository.test.ts | grep '^[-+].*expect'` sale vacío.

### BLOQUEO — tres aserciones de salida que el design §6.1 no deja cumplir
1. `zona-repository.test.ts` «⭑ R5: la segunda lectura de la N:M cubre la UNION…» (:~660):
   lee `zonaDistrito.findMany.mock.calls[1][0].where.distritoId.in`. Esa segunda llamada ahora es la
   carga del catálogo (`deLaEmpresa`, sin `where`): `TypeError`. La unión de antes y después sigue
   ahí, como `nodosAfectados` del plan.
2. `zona-repository.test.ts` «⭑ R2/R9: las dos consultas comparten el `where` base…» (:~744):
   `BASE_D1_ZA` congela `distritoId: { in: ["d1"] }`; el design pone `...whereLugarEn(lugares)`
   (`OR` de distrito y de cantón sin distrito). El resto del `where` es idéntico.
3. Guardia `zona-reconciliacion-no-retarifa.guardia.test.ts:157`: el antivacío
   `expect(cuerpo).toContain("orden.findMany(")` sobre el cuerpo de `update`. La lectura se ha
   ido a `planificarReconciliacion` (§6.1). El detector (`fallosDeLaReconciliacion`) pasa: `update`
   no escribe en tablas de dinero y su `updateMany` solo toca `zonaId`. `planificarReconciliacion`
   no escribe.
No he tocado ninguno. Hace falta decisión (como en T2.4): enmendar los dos literales del unit y que
la guardia mire también `planificarReconciliacion` (T7.2 no la lista).

### T4.3 — `extension-empresa` (R18)
`git fetch origin dev` y luego:
```
$ git diff --name-only origin/dev...HEAD -- lib/db/
lib/db/contexto-empresa.ts
lib/db/excepciones-aislamiento.ts
lib/db/modelos-de-negocio.ts
```
Los tres vienen de SLT-43, que llegó por el merge que hizo de base de SLT-44 (`git log origin/dev..HEAD -- lib/db/<f>`):
- `contexto-empresa.ts`: a274288, cf6ebde;
- `excepciones-aislamiento.ts`: 0dc0847 (merge de SLT-43 en SLT-44), a274288, cf6ebde;
- `modelos-de-negocio.ts`: 6a6dd4c, 2042688, 3e871f5, cf6ebde.

Ninguno es de un commit de SLT-65. Lo propio de SLT-65:
```
$ git diff --name-only 69a385e~1 -- lib/db/        # incluye el árbol de trabajo
(vacío)
$ git diff --name-only HEAD -- lib/db/ ; git status --short -- lib/db/
(vacío)
```
SLT-65 no toca `lib/db/`. Cuando SLT-43 y SLT-44 estén en `dev`, el primer diff saldrá vacío.

### Corridas (Postgres local en localhost:5432; `.env` de la raíz por comando)
- `pnpm run typecheck`: verde (exit 0, sin salida), después del último cambio.
- `pnpm exec eslint` de los tres archivos tocados: 0 errores, 1 warning que ya estaba (`normalizeName`
  sin usar en `ZonaRepository.ts`). `pnpm run lint` completo: 0 errores, 232 warnings (los que ya estaban).
- Tests del «Hecho» de T4 más `zona-guardado-conserva-costos`/`-inactivos` y las guardias
  `zona-especial-punto-unico`, `zona-reconciliacion-no-retarifa`, `geografia-lecturas-sin-nodo-fk`
  y `historial-accion-escrituras-cubiertas`: 14 files, 3 failed | 11 passed; 262 passed, 4 failed.
  - `geo-consultas-zona` 4/4.
  - `zona-reconciliacion-ordenes`, `zona-central-guarda-y-rastro`, `zona-pago-mensajero-rastro`,
    `zonas-action`, `geo-nodo-rls` y `geografia-dos-paises`: en verde.
  - Rojos: los 3 del bloqueo, y `zona-especial-punto-unico`, que solo señala
    `CierreDiaRepository.ts: distritoZonaEspecial` (T3, del otro agente). `ZonaRepository` ya no sale.
- `historial-accion-atomicidad` (llama a `update`): falla en el `beforeAll` (la tabla `orden` de
  la base local está vacía). Está en la baseline y no bloquea.
- `pnpm run test:guardias` (antes de quitar el nombre del modelo): 327 files, 4 failed; 4547 passed, 6 failed.
  - `dependencias-declaradas-presentes` ×4: en la baseline.
  - `zona-especial-punto-unico`: T3, y antes también `ZonaRepository`, ya corregido.
  - `zona-reconciliacion-no-retarifa`: bloqueo 3.
  - `filtros-url-r25` salió como suite fallida bajo carga. Sola pasa (3/3) y no tiene que ver con esto.
- `vitest related` no se ha usado: `ZonaRepository` lo importan muchas acciones y arrastraría la
  suite. Los archivos se han listado a mano.

Veredicto: T4.1–T4.3 hechas y la integración en verde. Quedan tres `expect` de salida que contradicen
el design §6.1 (dos del unit y el antivacío de una guardia), a la espera de decisión.

### Transacción anidada con el cliente extendido
**Causa medida. No es la que se suponía.** En Prisma 7.8, el `tx` interactivo expone `$transaction`, y no
solo el del cliente extendido: también el del cliente normal (comprobado con una sonda). Llamarlo abre una
transacción **anidada** de verdad (SAVEPOINT, `depth+1`), y el guardado sale bien. El fallo llega
después. `_transactionWithCallback` hace `options.newTxId = txId`: **muta el objeto de opciones** que
recibe, y `enUnaFoto` le pasa la constante del módulo `OPCIONES_TRANSACCION`. Desde ese momento, la
siguiente `enUnaFoto` que abre su propia transacción, fuera de otra, intenta anidar en una transacción
ya confirmada: «Transaction already closed: A start cannot be executed on a committed transaction».
- En R20/R21 lo que caía no era el cierre. Era el `findBaseCobroDevolucion` de después
  (`OrdenRepository.marcasDeOrdenes`). Medido con trazas temporales, ya quitadas.
- `ZonaRepository.update` deja el mismo veneno. Un `update` sobre el cliente extendido pasa. Lo que cae
  es la carga del catálogo que viene detrás.
- El `Proxy` de c10045e evita el veneno porque evita la anidada. La constante mutada sigue ahí: otro
  llamador que pase un `tx` a `CatalogoGeograficoRepository` (p. ej. `scripts/geo-explain-consultas.ts:392`)
  la vuelve a envenenar. Se propone, sin aplicar (fuera del alcance de esta tanda), pasar
  `{ ...OPCIONES_TRANSACCION }` en `enUnaFoto`.

**Test que lo destapa**: `tests/integration/db/zona-especial-dos-empresas.test.ts` › «SLT-65 R17:
ZonaRepository.update con el cliente extendido no deja rota la siguiente carga del catálogo». Va en ese
archivo y no en `geo-consultas-zona.test.ts`, que trabaja sobre una transacción revertida, porque:
`conAislamientoPorEmpresa` necesita un `PrismaClient` con `$extends` (el `tx` no lo tiene), y los datos
tienen que estar confirmados para que los vea. Ese archivo ya siembra dos empresas confirmadas con el
cliente de producción y las limpia. Cómo es el test: la zona de A gana D3, que no tiene órdenes. Después
viene la carga del catálogo de A, fuera de transacción, que tiene que ver D3 en su zona. Después, un
segundo `update` que deja la zona como estaba. El `finally` borra el `zona_distrito`.
- **Rojo antes** (sin el helper en `ZonaRepository`): `Tests 1 failed | 12 passed (13)`, con
  `PrismaClientKnownRequestError: Transaction API error: Transaction already closed: A start cannot be
  executed on a committed transaction.` en la carga de después.
- **Verde después**: 13/13.
- Antes se probó un test en `geo-consultas-zona` que le pasaba el `tx` real sin envolver. Salió en
  verde con y sin el arreglo, porque la anidada en sí funciona. Se quitó porque no detectaba nada.

**Arreglo**: `lib/repositories/_shared/sin-transaccion-anidada.ts` (`sinTransaccionAnidada(tx)`: un
`Proxy` que devuelve `undefined` para `$transaction`, con el porqué en la cabecera).
- Lo usan `CierreDiaRepository.leerDescriptivosDeOrdenes`, que sustituye al `Proxy` en línea, y
  `ZonaRepository.update` en la llamada a `planificarReconciliacion`.
- No se aplica dentro de `planificarReconciliacion`: el script de equivalencia la llama con su propio
  cliente, y ahí `enUnaFoto` tiene que poder abrir su foto RepeatableRead.
- Ninguna salida cambia.

**Corridas** (`.env` de la raíz por comando, `NODE_OPTIONS=--max-old-space-size=8192`, base local):
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: 0 errores, 232 warnings (los de antes). `eslint` de los 4 archivos tocados: 0
  errores, 1 warning que ya estaba (`normalizeName` en `ZonaRepository.ts`).
- `zona-especial-dos-empresas`: 13 passed (13).
- `geo-consultas-zona`: 4 passed (4).
- `geo-consultas-cierre`: 5 passed (5).
- `zona-reconciliacion-ordenes`: 28 passed (28).
- `zona-repository` (unit): 2 failed | 49 passed (51). Los dos rojos conocidos (l. 644 «R5: la segunda
  lectura…» y l. 732 «R2/R9: las dos consultas…»). Fallan igual sin el helper. No se tocan.
- `cierre-dia-repository` (unit): 116 passed (116).
- Guardia `zona-especial-punto-unico`: 9/9.
- Guardia `consultas-concurrentes-en-transaccion`: 23/23.
- Guardia `geografia-lecturas-sin-nodo-fk`: 6/6.
- Guardia `zona-reconciliacion-no-retarifa`: 1 failed | 5 passed. Es el rojo conocido. No se toca.

## T3 — Cierres y conteo (backend_dev, 2026-10-31)

### Archivos
- `lib/repositories/CierreDiaRepository.ts` (modificado; T3.1, design §4):
  - `leerDescriptivosDeOrdenes` conserva su nombre, su firma y el orden en serie. `zonas` y `tiendas`
    se leen igual; provincias, cantones y distritos salen de `new CatalogoGeograficoRepository(tx)
    .deLaEmpresa()`, solo con los ids de las filas (`nodo(catalogo, id)`). Un id ausente no entra al
    mapa y `descriptivoDe` lanza como antes (R6).
  - `cantones[id]` gana `zonaEspecial`; distritos y cantones usan `esZonaEspecial(cat, asig, id)`.
  - En `crearCierre`, una orden sin distrito congela `cantones[cantonId].zonaEspecial` en lugar del
    literal `false` (con marcas solo en distritos sigue siendo `false`).
  - `DescriptivosTxClient` = `Pick<PrismaClient, "zona" | "usuario"> & Omit<CatalogoPrismaClient,
    "$transaction">`. Pierde `provincia`, `canton` y `distrito`. Ya no importa
    `SELECT_MARCA_ZONA_ESPECIAL` ni `esZonaEspecialDeLaEmpresa`.
  - **Desviación del design §4, paso 2**: a la carga se le pasa el `tx` envuelto en un `Proxy` que
    oculta `$transaction`. Motivo: el `tx` interactivo del cliente EXTENDIDO (`extension-empresa`)
    sí expone `$transaction`, y `enUnaFoto` intentaba abrir otra transacción. Medido en
    `zona-especial-dos-empresas.test.ts` (R20/R21): «Transaction already closed: A start cannot be
    executed on a committed transaction». Con el `Proxy` pasa. No se nombran los modelos del catálogo,
    porque nombrar el de las marcas pone en rojo `zona-especial-punto-unico`.
- `lib/repositories/OrdenRepository.ts` (modificado; T3.3, design §5): `contarSinEntregarPorNodoGeografico`
  hace `nodoGeografico.findUnique` (paisId, profundidad). Si es `null` o la profundidad no es la del
  nivel, devuelve 0 (R10). Después hace `catalogoGeografico().dePais(paisId)` (R12),
  `ids = [id, ...nodosBajo]` (R9) y cuenta con `...whereLugarEn(ids)`. `ESTADOS_TERMINALES` sigue
  importado de su fuente. Constante de módulo `PROFUNDIDAD_DEL_NIVEL` (la única correspondencia
  nivel→profundidad, design §13). Imports: `whereLugarEn` y `nodosBajo`.
- Nuevos: `tests/integration/db/geo-consultas-cierre.test.ts` (5 casos) y
  `tests/integration/db/geo-consultas-conteo.test.ts` (4 casos).
- Compartidos (`geo-65.ts`, `doble-catalogo-geografico.ts`, `lugar-orden.ts`): sin tocar.

### Mapa R → test (T3)
| R | Test |
|---|---|
| R5 | `geo-consultas-cierre`: «R5: con marcas solo en distritos…». En CR y XA, `crearCierre` congela, por orden, lo mismo que `hoy.congeladoDeHoy`: nombres, `esCentral` y marca, con y sin marca y con y sin distrito. También «R5: con una marca inyectada en el canton…»: la orden sin distrito y la de un distrito de ese cantón congelan `true` |
| R6 | `geo-consultas-cierre` «R6»: el catálogo inyectado no trae el cantón retirado ni su distrito. El cierre lanza «falta la fila de…» y no queda cierre nuevo, gestión vinculada ni fila de detalle |
| R7 | `geo-consultas-cierre` «R7 — … 1 consulta en vuelo» (sonda `_consultas-en-vuelo`, código real): máximo 1 en vuelo, sin solapes, 1 conexión, y ninguna lectura de `provincia` ni de `distrito`. `emisor-relaciones-anidadas.test.ts` sigue en la baseline, ver BLOQUEO |
| R8 | `git diff --name-only origin/dev...HEAD -- lib/repositories/CierresAdminRepository.ts` sale vacío, y tampoco hay cambios en el árbol de trabajo. `cierres-admin-service` y `cierre-iva-aparte-sl39` pasan; `cierre-desglose-por-tienda-sql-real` y `detalle-movimiento-cierre-postgres` fallan, en la baseline, por la semilla («referencia a otra empresa: cierre_dia.destino_zona_id») |
| R9, R11 | `geo-consultas-conteo` «R9, R11»: para los 8 nodos de cada empresa (CR y XA), el nuevo es igual a `hoy.contarSinEntregarDeHoy`. Antivacío: provincia 10, suma de cantones 10, suma de distritos 7. Contraprueba «R11 (contraprueba)»: con la orden incoherente solo difieren el cantón activo (−1) y el retirado (+1); con ella borrada, 0 diferencias. Además (T8.2), por el composition root real: `geografia-plataforma.composition-root` «R31: el conteo usa el repositorio de órdenes…» cuenta `whereLugarEn([c-1, d-1])`, el cantón y su distrito |
| R10 | `geo-consultas-conteo` «R10»: un id inexistente, un cantón pedido como distrito, un distrito como cantón, un cantón como provincia y una provincia como cantón dan 0, tanto en el nuevo como en el de hoy |
| R12 | `geo-consultas-conteo` «R12», en `comoPlataforma`: el distrito central de XA cuenta 4 y, con la orden de una segunda empresa de XA, 5 (la provincia, 11), igual que hoy. Además (T8.2): el mismo caso del composition root carga el catálogo con `paisId` del nodo pedido (`findUnique` por id → `nodoGeografico.findMany` con `{ paisId: "CR" }`) |
| R17 | `geo-consultas-cierre` «R17»: en el cierre de XA, `nodoGeografico.findMany` se pide con `paisId` = XA y todos sus nodos son de XA; las zonas de `zonaDistrito` son solo de la empresa XA; una marca escrita en la misma transacción, sin confirmar, se congela `true` |

### Tests existentes que cambian de ENTRADA (ningún `expect` cambia)
Los dobles de `provincia`, `canton` y `distrito` (`catalogoDoble*`, con `zonasEspeciales: []`) pasan
a ser `...delegadosDelCatalogo({ nodos: [...] })`, con los mismos ids y nombres que congelaban y sin
marcas:
- `tests/unit/repositories/cierre-dia-repository.test.ts` (`buildSnapshotTx`);
- `tests/unit/repositories/convergencia-tarifa-listado-cierre.test.ts` (`resolverPorCierre`);
- `tests/unit/repositories/gestion-desde-ayuda-cierre.test.ts` (`buildStore`);
- `tests/integration/asimetria-sin-tarifa.test.ts` (`porElCierre`);
- `tests/integration/db/cierre-detail-congelado.test.ts` (`makeDb`).

`git diff -- tests/ | grep -E '^[-+].*expect'` sale vacío.

### BLOQUEO — `emisor-relaciones-anidadas.test.ts`: dos aserciones de salida que el design §4 no deja cumplir
Hoy no se ven: el archivo está en la baseline, porque el `beforeAll` falla con «la tabla `orden` está
vacía». Cuando corra con datos (SL-31 / CI con semilla), el caso «`SNAPSHOT_SELECT` +
`leerDescriptivosDeOrdenes` ponen 1 consulta en vuelo» fallará en:
- `:254` `expect(cuantasConteniendo('FROM "public"."provincia"')).toBe(1)`: con el catálogo, `provincia`
  ya no se lee y da 0. Es justo lo que pide el design §4.
- `:253` `expect(cuantasConteniendo('FROM "public"."zona"')).toBe(1)`: la carga lee
  `zona_distrito` con su `zona` anidada, que Prisma emite como otra consulta sobre `"zona"`. Con
  asignaciones da 2. Esto no está medido aquí; se deduce de la lista de consultas de la carga que
  se anotó en el 405.

Las aserciones que importan para R7 (`maximoEnVuelo() === 1`, `solapes === []` y
`conexionesUsadas() === 1`) no dependen de esto, y `geo-consultas-cierre` las mide sobre el fixture.
No he tocado ningún `expect`. Decide el humano o el spec_author: enmendar los dos literales, como en
la decisión de T2.4.

### AVISO para T4 (no tocado)
`ZonaRepository` también hace `new CatalogoGeograficoRepository(tx)` sobre el `tx` del guardado. Con
el cliente extendido de producción tendrá el mismo problema de `$transaction` (ver la desviación de
T3.1). `clienteConSavepoint` lo tapa, porque su `$transaction` es un SAVEPOINT. Lo destapa un test
con `conAislamientoPorEmpresa`, como `zona-especial-dos-empresas.test.ts`.

### Corridas (Postgres local, `.env` de la raíz por comando, `NODE_OPTIONS=--max-old-space-size=8192`)
- `pnpm run typecheck`: verde (exit 0).
- `pnpm run lint`: exit 0, 0 errores y 232 warnings, los que ya había. Ninguno en archivos de T3.
- Nuevos: `geo-consultas-cierre` 5/5 y `geo-consultas-conteo` 4/4 en verde.
- Guardias `consultas-concurrentes-en-transaccion`, `geografia-lecturas-sin-nodo-fk`,
  `geografia-predicado-unico`, `geografia-sin-cte-recursiva`, `geografia-terminales-una-sola-fuente`
  y `zona-especial-punto-unico`, junto con los 5 tests de entrada cambiada, los 2 nuevos,
  `zona-especial-dos-empresas`, `geo-consultas-ordenes` y `geo-65-fixture`: 16 files, 243 tests, todo
  en verde.
- Lista a mano (todos los tests que llaman a `crearCierre`, `leerDescriptivosDeOrdenes` o
  `contarSinEntregarPorNodoGeografico`; `vitest related` arrastraría unos 650 archivos): 62 files,
  1043 passed, 45 failed y 82 skipped. Los 17 archivos rojos están en `tests/baseline-rojos.json`
  (base sin órdenes o semilla de otra empresa), salvo `geografia-superadmin-sin-empresa`: falla en el
  `beforeAll` con «la base ya tiene un superadmin», por el estado de la base local; ya se sabía y no es
  regresión. `geografia-ordenes-sin-entregar` y `emisor-relaciones-anidadas` no corren aquí (base sin
  órdenes; están en la baseline).
- R8: `cierres-admin-service` y `cierre-iva-aparte-sl39` en verde. `cierre-desglose-por-tienda-sql-real`
  y `detalle-movimiento-cierre-postgres` en rojo por la semilla, ambos en la baseline.

Veredicto: T3.1–T3.4 hechas y en verde fuera de la baseline. Queda abierta la decisión sobre los dos
literales de `emisor-relaciones-anidadas` (`:253`, `:254`), y hay un aviso del `$transaction` del `tx`
extendido para T4.

## T6 — Script de rendimiento (backend_dev, 2026-10-31)

### Archivos

- `scripts/geo-equivalencia/captura-consultas.ts` (nuevo, T6.1): captura en el adaptador, repetición
  como `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` y lectura del plan (`Execution Time`, Seq Scan sobre
  `orden`).
- `scripts/geo-explain-consultas.ts` (nuevo, T6.2): las cinco lecturas, la mediana de 5,
  `hayRegresion` exportada, el informe y `main`.
- `tests/integration/db/geo-explain-consultas.test.ts` (nuevo, T6.3).
- `package.json`: solo la entrada `geo:explain-consultas`.
- No se tocan `db/`, `lib/db/` ni los repositorios. No hay dependencias nuevas.

### Dónde expone Prisma 7 el SQL y los parámetros (T6.1, design §10 paso 1)

Verificado en `node_modules/.pnpm/@prisma+adapter-pg@7.8.0/.../dist/index.mjs` y en
`@prisma/client@7.8.0/runtime/client.js`:

- Toda consulta pasa por `PgQueryable.queryRaw(query)` o `executeRaw(query)`. De `PgQueryable` heredan
  `PrismaPgAdapter`, que trabaja fuera de transacción, y `PgTransaction`, que trabaja dentro. `query` es
  `SqlQuery = { sql, args, argTypes }`: el SQL con `$n` y los parámetros con su tipo, antes de que
  `performIO` los pase por `mapArg` para `pg`.
- `startTransaction` del adaptador manda `BEGIN` (y `SET TRANSACTION ISOLATION LEVEL`) por
  `executeRaw`. El gestor de transacciones del cliente manda `{ sql: "COMMIT" }` y
  `{ sql: "ROLLBACK" }` por `executeRaw`, y después llama a `commit()`/`rollback()`, que solo sueltan
  la conexión.
- Por eso la captura envuelve `connect` del `PrismaPg` y `startTransaction` del adaptador, igual que
  `conConsultasEnSeriePorTransaccion`, y queda debajo de ella. No usa el evento `query`: ese evento
  trae los parámetros en JSON y sin tipo.
- El contexto de la RLS (`set_config(...)` de la extensión y `SET LOCAL ROLE` de los tests) se guarda
  por transacción. Cada consulta lleva el suyo, y el script lo repite en una transacción nueva del
  adaptador, que termina en `ROLLBACK`. El test, en cambio, repite la consulta en su propia
  transacción (modo `su-transaccion`), porque el fixture solo existe en la transacción revertida.

### Desviaciones y decisiones

1. **BLOQUEO de guardia: `plataforma-solo-en-lista` en rojo.** El script llama a `comoPlataforma`
   para dos cosas, y las dos vienen del design §10: elegir la empresa con más órdenes vivas cuando no
   se pasa `--empresa`, y medir el conteo en plataforma. Para que la guardia pase hay que añadir una
   entrada en `lib/db/excepciones-aislamiento.ts`, y ese archivo no me toca (`lib/db/` está fuera de
   esta tanda). Entrada propuesta:
   `{ archivo: "scripts/geo-explain-consultas.ts", ficha: "SLT-65", motivo: "comando de consola de solo lectura: elige la empresa con más órdenes vivas y mide el conteo sin entregar del superadmin, que corre sin empresa (design §10, R25)" }`.
   Es la misma pregunta que T5.1 hace para el script de equivalencia. Afecta a R18: `lib/db/` dejaría
   de tener solo la excepción de T5.1.
2. **Antes se completa con las consultas que la copia no trae, solo en los dos listados.**
   `paginaListadoDeHoy` y `paginaApiDeHoy` son solo la lectura geográfica. Según §8, el `count`, las
   tarifas y las señales no entran. `list()` y `listByOwner` sí los ejecutan, así que, comparados tal
   cual, «después» siempre sumaría consultas que «antes» no tiene. Para que la suma de antes también
   sea la de la lectura entera (decisión del 2026-10-31), se le añaden las consultas de después que
   antes no tiene (se cuentan por sentencia, con repeticiones) y que no nombran ninguna tabla de la
   geografía, de las asignaciones ni del catálogo: `provincia`, `canton`, `distrito`, `zona`,
   `zona_distrito`, `distrito_zona_especial`, `nodo_geografico`, `tipo_nivel_geografico` y
   `organizacion`. Lo medí en la base local: en `list()` entran el `count`, las tarifas y la SQL cruda
   de las señales. La consulta de `zona` que el catálogo lanza con cada `zona_distrito` queda fuera.
   Si una consulta común leyera `zona`, antes se quedaría sin ella: el error empuja a marcar regresión,
   nunca a esconderla. El informe dice cuántas consultas se añadieron («N comunes»).
3. **Solo localhost.** El script se niega a correr si `DATABASE_URL` no es `localhost`, `127.0.0.1` o
   `::1` (sale con 2), y no hay `--forzar`. Para T8.3, la persona tiene que restaurar la copia de
   producción en local. Si la copia vive en otro host, hay que decidir si se añade un `--forzar` como el
   de `bench-busqueda-ordenes.ts`.
4. **Página de la API: 50.** Design §10 fija 50 para `/ordenes`, pero no da un tamaño para la API. Usé
   el mismo; el valor por defecto de la API es 25 (`API_KEYS_DEFAULT_PAGE_SIZE`).
5. **Lecturas sin muestra.** Si no hay cierre en los últimos 30 días, ni tienda con órdenes, ni zona con
   distritos, la lectura sale como «sin muestra», no bloquea y cuenta en el total.
6. **Reconciliación.** La lectura de después se llama como en `ZonaRepository.update`:
   `planificarReconciliacion(sinTransaccionAnidada(tx), distritos)`. El helper de `_shared/` lo está
   escribiendo el otro backend_dev. Mientras ese archivo cambiaba, una corrida falló una vez con
   `planificarReconciliacion is not a function`; la siguiente pasó.
7. Lo que se imprime: el id de la empresa, el de la provincia (nodo) y el de la zona, el número de
   filas del cierre y números. No sale el id de la tienda (es un usuario) ni el del cierre.

### Mapa R → test (T6)

| R | Test |
|---|---|
| R24 | `geo-explain-consultas.test.ts`: «R24: con el cliente del script, un INSERT falla con 25006»; «R25, R24: … no escribe y no imprime SQL ni datos personales» (`orden`, `zona_distrito`, `distrito_zona_especial` y `cierre_detail` no cambian; la salida no contiene `DATOS_PERSONALES_GEO65`, el id de la tienda, `SELECT`, `FROM`, `INSERT`, `"public"` ni `$1`); «R24: la captura solo explica lecturas» |
| R25 | `geo-explain-consultas.test.ts`: «R25, R24: mide las cinco lecturas con 5 corridas por lado» (Postgres real, fixture `geo-65`); «+19 % no es regresion; +21 % si»; «un Seq Scan sobre `orden` solo en despues es regresion; en los dos lados, no»; «el 20 % solo bloquea en las lecturas calientes»; «la mediana de 5 corridas, y el codigo de salida» |
| T6.1 | «T6.1: el adaptador expone el SQL y los parametros tipados de `listByOwner`, y la consulta se puede explicar» |

### Corridas (Postgres local en localhost:5432, `.env` de la raíz por comando, `NODE_OPTIONS=--max-old-space-size=8192`)

- `pnpm run typecheck`: sale 0, sin errores.
- `pnpm run lint`: 0 errores y 232 avisos. Ningún aviso es de los tres archivos nuevos (`eslint` sobre
  ellos sale limpio).
- `npx vitest run tests/integration/db/geo-explain-consultas.test.ts`: 1 file, 11 passed (3 contra
  Postgres real y 8 sin base).
- Las guardias que miran `scripts/` (las de `tests/unit/guards` que nombran `scripts/`, más
  `clave-remision-solo-lectura`, `geografia-predicado-unico`, `zona-especial-punto-unico` y
  `dependencias-aprobadas`) son 39 files: 37 pasan y 2 fallan, con 570 tests en verde y 5 en rojo.
  - `plataforma-solo-en-lista` falla por este script: es la desviación 1.
  - `dependencias-declaradas-presentes` (4 tests) falla porque a `init.sh` le falta el marcador del
    paso 2. Está en `tests/baseline-rojos.json` y no viene de este cambio.
- `pnpm geo:explain-consultas` contra la base local (sale 1):

```
empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9: tienda=la de mas ordenes provincia=0371caa2-0857-4c6b-aac2-e668e67ad70c zona=da04c85d-7b0c-4b3e-ba8f-9bebb108fef8 (15 distritos) cierre=ninguno
lectura listado-ordenes: consultas antes=13 (3 comunes) despues=18 | mediana de 5 antes=0.747 ms despues=2.441 ms (+226.8 %) | seq-scan orden antes=3 despues=3 | pared media antes=25.424 ms despues=73.794 ms | bloquea-20%=si regresion=SI
lectura listado-api: consultas antes=9 (2 comunes) despues=12 | mediana de 5 antes=0.359 ms despues=1.838 ms (+412.0 %) | seq-scan orden antes=3 despues=2 | pared media antes=10.372 ms despues=24.073 ms | bloquea-20%=si regresion=SI
lectura cierre-descriptivos: sin muestra (sin cierres en 30 dias)
lectura reconciliacion: consultas antes=3 despues=8 | mediana de 5 antes=0.260 ms despues=3.038 ms (+1068.5 %) | seq-scan orden antes=2 despues=2 | pared media antes=7.174 ms despues=32.754 ms | bloquea-20%=no regresion=no
lectura conteo-sin-entregar: consultas antes=1 despues=4 | mediana de 5 antes=0.073 ms despues=1.782 ms (+2341.1 %) | seq-scan orden antes=1 despues=1 | pared media antes=3.177 ms despues=19.530 ms | bloquea-20%=no regresion=no
total: lecturas=5 con-regresion=2 fallidas=0 sin-muestra=1 salida=1
```

- Con una `DATABASE_URL` remota inventada sale 2 y dice «ABORTA: DATABASE_URL no apunta a
  localhost…», sin tocar la base.
- Lectura de la base local, que NO es la de T8.3: tiene pocas filas, y en ella la carga del catálogo
  (tipos, nodos del país, asignaciones y marcas) cuesta más que lo que ahorra. Por eso los dos
  listados salen en +200–400 %. Lo que decide es T8.3 sobre la copia de producción. Si allí se repite,
  la primera mitigación es la de la pregunta cerrada 2 (los nombres del listado al catálogo) y después
  T9.

Veredicto: T6.1–T6.3 hechas y en verde. Queda un bloqueo: `plataforma-solo-en-lista` necesita la
entrada del script en `lib/db/excepciones-aislamiento.ts`, que está fuera de mi alcance.

## T7 — Guardias (backend_dev, 2026-10-31)

### Archivos
- Nuevo: `tests/unit/guards/catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts` (T7.1, R21, design §12).
- Ampliado: `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts` (T7.2, R19). Los casos de
  SLT-44 quedan igual (ningún `expect` cambia); se añaden dos `describe` de SLT-65.
- Ampliado: `tests/integration/db/geo-lecturas-sin-backfill.test.ts` (T7.2, R19). El caso de SLT-44
  queda igual; se añade un `describe` anidado que comparte la base propia (`slt43_nb_…`).
- Sin cambios en `lib/`, `scripts/`, `db/`, `lib/db/` ni dependencias.

### Decisiones
- **Clases vigiladas (R21), calculadas:** `CatalogoGeograficoRepository` y las clases exportadas de
  los archivos de `lib/repositories/**` con un `import` de VALOR de `CatalogoGeograficoRepository` (un
  `import type` o un comentario no cuentan). Hoy: `GeoRepository`, `OrdenRepository`,
  `CoberturaRepository`, `ZonaRepository` y `CierreDiaRepository`, y el antivacío exige las seis.
  También sigue los alias de import (`import { OrdenRepository as Repo }`).
- **`_shared/sin-transaccion-anidada.ts`:** no entra en ninguna de las dos guardias como archivo
  vigilado. En R21 no es una clase y solo nombra el repositorio en un comentario; aun así lo barre el
  recorrido de `lib/`, así que una `new` de módulo en él saldría. En R19 no lee ninguna tabla: envuelve
  el cliente (design §14 lista los cuatro archivos y no lo incluye).
- **Integración, lecturas 6 y 7:** se mide la lectura (`leerDescriptivosDeOrdenes`,
  `planificarReconciliacion`) y además la escritura entera (`crearCierre`, `ZonaRepository.update`)
  dentro de un SAVEPOINT que siempre se deshace, para que las tres fases partan del mismo estado.
- **Integración, tres fases:** llena → en NULL en `orden`, `zona_distrito` y `distrito_zona_especial`
  con los triggers de SLT-43 apagados → desviada (órdenes al cantón retirado; asignaciones y marcas
  al distrito «sin zona»). Se exige `enNull = llena` y `desviada = llena`.
- **Orden de empate:** las órdenes del fixture comparten `created_at` (un `now()` en la misma
  transacción), así que entre ellas la página sale en el orden físico de las filas, y el UPDATE de la
  fase desviada lo cambia. Lo vio la primera corrida (`listByOwner` con dos filas cambiadas de
  sitio, misma marca por fila). Las páginas se comparan ordenadas por clave (`numRemision` en la API,
  `id` en el listado). No es de R19: el orden por `created_at` sin desempate es el de siempre.

### Mapa R → test
| R | Test |
|---|---|
| R19 | `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts` («SLT-65 R19 …», archivos enteros: `OrdenRepository.ts`, `CierreDiaRepository.ts`, `ZonaRepository.ts`, `_shared/lugar-orden.ts`) y `tests/integration/db/geo-lecturas-sin-backfill.test.ts` («SLT-65 R19 — las lecturas 1–7 …») |
| R21 | `tests/unit/guards/catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts` |

### Contrapruebas
- R21: los tres casos prohibidos de design §12 (constante de módulo, `new Servicio(new GeoRepository())`
  de módulo y `static repo = new ZonaRepository()`) salen con `fuente.ts:<línea> <Clase>`. Los cuatro
  permitidos (flecha, `function`, método y propiedad de instancia) no salen, y el detector sí los ve
  (las cuatro `new` con `deModulo: false`). Un comentario, una cadena y una clase no vigilada no
  cuentan; un alias de import sí. Árbol: más de 500 fuentes, más de 10 `new` reales de vigiladas
  (todas por llamada o por instancia), cero instancias de módulo.
- R19 (guardia): una mención en `contarSinEntregarPorNodoGeografico` la ve el barrido del archivo
  entero y no el del bloque de SLT-44, que es lo que justifica ampliar el alcance. Sobre un archivo
  real: `lugar-orden.ts` nombra `orden.nodo_geografico_id` en su comentario (el crudo da 1 mención) y
  sin comentarios da 0. Antivacío por archivo: longitud y las lecturas que contiene.
- R19 (integración): antivacío de cada lectura en la fase llena (5 marcas de 11 en la API y en el
  cobro, 3 correcciones sin distrito, conteo de la provincia > 0, distrito central marcado en los
  descriptivos y en el congelado, plan no vacío, guardado de zona con 1 reconciliada), y columnas:
  ≥ 22 órdenes llenas antes, 0 llenas después en las tres tablas.

### Salida real
- `pnpm run typecheck` → `tsc --noEmit` sin errores.
- `pnpm run lint` → `0 errors, 232 warnings` (todas preexistentes); los tres archivos tocados, con
  `eslint` directo: 0 problemas.
- `vitest run tests/unit/guards/catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts` →
  `Tests 7 passed (7)`.
- `vitest run tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts` → `Tests 10 passed (10)`.
- `vitest run tests/integration/db/geo-lecturas-sin-backfill.test.ts` (base local) → primera corrida
  `1 failed | 1 passed` (el orden de empate, arriba); tras comparar por clave, `Tests 2 passed (2)`.
  Sale un `DeprecationWarning` de `pg` (`client.query()` concurrente); no investigué de dónde viene.
- `pnpm run test:guardias` no se corrió: es T7.3.

Veredicto: T7.1 y T7.2 hechas y en verde; ninguna guardia nueva sale roja sobre `lib/` ni `scripts/`.

## T5 — Script de equivalencia (backend_dev, 2026-10-31)

### Archivos
- `scripts/geo-equivalencia-consultas.ts` (nuevo): los bloques de design §9. Exporta
  `compararEmpresaConsultas(cliente, organizacionId, opciones)`, `compararConteosDelPais(cliente,
  paisId, opciones)`, `compararConteosDeLaEmpresa`, `lineasDeInforme`, `lineasDeInformeDePais`,
  `codigoDeSalida`, `esBaseLocal`. Reutiliza `crearClienteDeSoloLectura` y `leerArgumentos` de
  `geo-equivalencia-dinero.ts`, y `paraCadaEmpresa`. Se niega a correr si `DATABASE_URL` no es
  localhost/127.0.0.1/::1 (salida 2).
- `lib/repositories/CierreDiaRepository.ts`: se extrae `congeladoDeLaFila(f, descriptivos)` (exportada)
  de las expresiones de marca y nombres del `createMany` de `crearCierre`, que ahora la esparce. Mismas
  expresiones y mismo orden de evaluación (la zona, luego la marca: el primer `descriptivoDe` que lanza
  es el mismo). Así el bloque `cierres` compara el código real de `crearCierre` sin escribir el cierre.
- `tests/integration/db/geo-equivalencia-consultas.test.ts` (nuevo, 8 casos).
- `package.json`: solo la línea `geo:equivalencia-consultas`.
- `lib/db/excepciones-aislamiento.ts` (segunda tanda): las dos entradas de SLT-65 en
  `EXCEPCIONES_DE_PLATAFORMA` (ver T5.1).

### T5.1 (primera parte) — `comoPlataforma` en `scripts/` y `plataforma-solo-en-lista`
**No pasa.** La guardia barre `lib/`, `app/`, `scripts/` y `tests/fabricas/` (`CARPETAS_PLATAFORMA`).
Todo archivo que llame a `comoPlataforma(` tiene que estar en `EXCEPCIONES_DE_PLATAFORMA`
(`lib/db/excepciones-aislamiento.ts`). Precedente: `scripts/geo-backfill-nodo.ts` (SLT-43). Hoy la
guardia sale roja por `scripts/geo-explain-consultas.ts` (T6), que ya llama a `comoPlataforma` sin
estar en la lista.

**Resuelto (segunda tanda, 2026-10-31): se añadieron dos excepciones.** Las autoriza tasks.md T5.1 y
T4.3, y las pidió el leader. Van al final de `EXCEPCIONES_DE_PLATAFORMA` en
`lib/db/excepciones-aislamiento.ts`, con el formato de la de `scripts/geo-backfill-nodo.ts` (SLT-43):

| archivo | ficha | motivo |
|---|---|---|
| `scripts/geo-explain-consultas.ts` | SLT-65 | «comando de consola de solo lectura, solo contra localhost: elige la empresa con más órdenes vivas y mide el conteo sin entregar del superadmin, que no tiene empresa (design §10, R25)» |
| `scripts/geo-equivalencia-consultas.ts` | SLT-65 | «comando de consola de solo lectura, solo contra localhost: compara el conteo sin entregar por país en plataforma, como lo lee el superadmin, que no tiene empresa (design §9, R22)» |

**AVISO PARA EL REVIEWER:** la lista de plataforma crece en dos entradas (las dos de SLT-65). Las dos
son scripts de consola que no entran al build de la app. Los dos se niegan a correr si
`DATABASE_URL` no es localhost, y su conexión nace con `default_transaction_read_only = on`.

Cambio en el script (design §9, «una vez por país, en `comoPlataforma`»):
- `compararConteosDelPaisEnPlataforma(cliente, paisId, clienteNuevo?)` (nueva, exportada) envuelve
  `compararConteosDelPais` en `comoPlataforma("SLT-65", …)` con `ambito: "plataforma"`.
- `paisesAComparar` lista, en plataforma, los `paisId` distintos de `organizacion`: el de `--empresa`,
  o el de todas. `main` corre el conteo de cada país antes del bucle por empresa. Si un país falla,
  se imprime `pais <id>: fallo al leer (<nombre>)` y la salida es 2.
- **El bloque por empresa se mantiene** (`compararConteosDeLaEmpresa`, ámbito `empresa <id>`). Aporta
  dos cosas: comprueba el conteo nuevo también bajo la RLS de una empresa, y su test es el que prueba
  que una empresa no ve la orden incoherente de otra.
- La línea `total:` suma `paises=<n>`: los países comparados en plataforma, contando los fallidos.
  `fallidas` incluye los países que fallaron.
- Test nuevo: «R22 — el conteo del pais, una vez por pais en plataforma». Corre CR y XA como el dueño,
  sin `servi_app`, y comprueba: 0 diferencias, `ambito = plataforma`, antivacío (≥ 7 nodos en CR) y que
  la orden incoherente de CR la ve CR y no XA. La orden incoherente se siembra **después** del conteo
  que exige 0 diferencias. El motivo: con las FK viejas cuenta en otro cantón que con el lugar, y en
  plataforma eso sale como `hoy=9 nuevo=8` en dos nodos. Es la diferencia que §5 propone tratar como
  informativa, no la que mide este caso. Ningún `expect` de los casos que ya había cambia.

### Otras decisiones
- `cierres`: el conjunto (a) son las gestiones con `cierreId: null, anuladaAt: null`. Es un
  superconjunto de lo que se llevaría un cierre, y basta porque el congelado es por orden. El conjunto
  (b) son los `--muestra` detalles más recientes con las gestiones vigentes de su cierre. Se comparan
  `estado` (ok/error: falta un descriptivo), la marca y los tres nombres geográficos (estos solo
  «distinto»).
- El ingreso de `cierres`: `derivarIngresoOrden` por cada gestión de (b), con `tarifaDe(detalle)`,
  `resultado`, y `esCentral`, `montoCobrar` y `cobraComision` del detalle; la marca de hoy frente a la
  nueva. Una orden con un descriptivo ausente no suma, porque ya sale distinta por orden.
- `listados`: `OrdenListItemDTO` no lleva `esZonaEspecial`. La marca de `findListItemsByIds` se lee de
  `fleteOrigen`: `especial`/`especial_sin_pacto` → true; `normal` con flete ≠ 0.00 → false. Sin tarifa
  (`normal` y 0.00) no se puede saber: se cuenta en `sin-tarifa` y esa pata no se compara. La API se
  compara siempre: `costeo.esZonaEspecial` de `listByOwner` de la tienda dueña, filtrada por la
  remisión o la guía.
- `reconciliacion`: `planificarReconciliacion` recibe el cliente del script, no un `tx`. La carga del
  catálogo abre su propia transacción y no hace falta `sinTransaccionAnidada`.
- `correccion`: estos campos solo se imprimen como «distinto»: `destinatario`, `telefonoDest`,
  `producto`, `notas`, `direccion`, `distritoNombre` y `zonaNombre`.

### Mapa R → test (`tests/integration/db/geo-equivalencia-consultas.test.ts`)
| R | Caso |
|---|---|
| R22 | «0 diferencias en los seis bloques de las dos empresas y en el conteo de sus nodos» (antivacío por bloque) |
| R22 (contraprueba) | «las ordenes del canton sin marca propia salen distintas en cierres, cobro, correccion y listados» (marca inyectada en el cantón, en la lectura nueva) |
| R23 | «la muestra respeta --muestra…», «la orden con cadena incoherente se cuenta y se nombra…», «codigoDeSalida: 0 si coincide…» |
| R24 | «con el cliente del script, un INSERT falla con 25006», «esBaseLocal: solo localhost…», «las filas quedan iguales y la salida, tambien la de la contraprueba, no lleva datos personales» |

### Corridas (Postgres local en localhost; `.env` de la raíz por comando)
- `pnpm run typecheck` → sin errores.
- `pnpm run lint` → `✖ 232 problems (0 errors, 232 warnings)`. `eslint` sobre los tres archivos tocados → sin salida.
- `vitest run tests/integration/db/geo-equivalencia-consultas.test.ts` → `Test Files 1 passed (1)`, `Tests 8 passed (8)`.
- `vitest run` de `plataforma-solo-en-lista`, `geo-equivalencia-dinero` y `geo-consultas-cierre` →
  `Tests 1 failed | 19 passed (20)`. El rojo es `plataforma-solo-en-lista`:
  `expected [ 'scripts/geo-explain-consultas.ts' ] to deeply equal []`. Ese archivo es de T6; este
  script no aparece. `geo-equivalencia-dinero` y `geo-consultas-cierre` salen en verde.
- Las 13 suites que ejercitan `crearCierre` y `cierre_detail` → `Tests 269 passed | 33 skipped`.
  `costo-y-zona-api-415` y `dinero-productos.int` fallan en la preparación (faltan zonas sembradas;
  `referencia a otra empresa`). Las dos están en `tests/baseline-rojos.json`.
- `pnpm geo:equivalencia-consultas` contra la base local (`localhost`, base `logistic`), salida 0:
  ```
  empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9 cierres: comparados=0 distintos=0
  empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9 cierres-ingreso: comparados=0 distintos=0
  empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9 cobro-devolucion: comparados=15 distintos=0
  empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9 correccion: comparados=15 distintos=0
  empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9 listados: comparados=15 distintos=0 sin-tarifa=0
  empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9 reconciliacion: comparados=1 distintos=0
  pais CR (empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9) conteo-sin-entregar: comparados=27 distintos=0
  pais CR (empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9) cadena-incoherente: ordenes=0
  total: empresas=1 con-diferencias=0 conteos-con-diferencias=0 cadena-incoherente=0 fallidas=0 salida=0
  ```
  La base local no tiene cierres; el bloque `cierres` contra el fixture lo cubre el test. El fixture de
  `geo-65.ts` vive en la transacción revertida del test, no en la base: «sale 0 con el fixture» es el
  primer caso del test.
- Con `DATABASE_URL` fuera de localhost → `ABORTA: DATABASE_URL no apunta a localhost…`, salida 2. Con
  un argumento desconocido → el uso, salida 2.

### Corridas de la segunda tanda (excepciones + país en plataforma; `.env` de la raíz por comando, `NODE_OPTIONS=--max-old-space-size=8192`)
- `pnpm run typecheck` (y `tsc --noEmit` tras el último retoque) → sin errores, salida 0.
- `pnpm run lint` → `✖ 232 problems (0 errors, 232 warnings)`, las mismas de antes. `eslint` sobre los
  tres archivos tocados → sin salida.
- `vitest run tests/unit/guards/plataforma-solo-en-lista tests/integration/db/geo-equivalencia-consultas.test.ts tests/integration/db/geo-explain-consultas.test.ts`
  → `Test Files 3 passed (3)`, `Tests 27 passed (27)`. **`plataforma-solo-en-lista` en verde.**
- `pnpm geo:equivalencia-consultas` contra la base local (localhost), salida 0:
  ```
  empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9 cierres: comparados=0 distintos=0
  empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9 cierres-ingreso: comparados=0 distintos=0
  empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9 cobro-devolucion: comparados=15 distintos=0
  empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9 correccion: comparados=15 distintos=0
  empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9 listados: comparados=15 distintos=0 sin-tarifa=0
  empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9 reconciliacion: comparados=1 distintos=0
  pais CR (plataforma) conteo-sin-entregar: comparados=27 distintos=0
  pais CR (plataforma) cadena-incoherente: ordenes=0
  pais CR (empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9) conteo-sin-entregar: comparados=27 distintos=0
  pais CR (empresa 27b391d7-b405-406c-a0ff-e3d3ce3933f9) cadena-incoherente: ordenes=0
  total: empresas=1 con-diferencias=0 conteos-con-diferencias=0 cadena-incoherente=0 paises=1 fallidas=0 salida=0
  ```

Veredicto: T5.1, T5.2 y T5.3 hechas y en verde. Hay dos excepciones de plataforma nuevas (SLT-65), avisadas al reviewer, y el conteo del país corre en plataforma, como pide design §9.

## T7.3, T8.1, T8.2 — Cierre de la implementación (implementer, 2026-10-31)

### Commits (sin push)
`69a385e` T1.2 · `56c2626` T0–T2 · `c10045e` T3 · `cb1a1dd` T4 · `2b42d81` T6 · `ecbb6e1` T7.1–T7.2 · `df5a7e3` T5.

### Mapa R → test (R1–R28)
| R | Test |
|---|---|
| R1 | `geo-consultas-ordenes` (API, /ordenes, herencia en cantón); `lugar-orden.test.ts` |
| R2 | `geo-consultas-ordenes` (marcas solo a distritos = hoy); `geo-equivalencia-consultas` |
| R3 | `geo-consultas-ordenes`; las suites de API/listado existentes, sin cambiar la respuesta (los literales del `select` se tocaron por decisión humana) |
| R4 | `geo-consultas-ordenes` («en plataforma…», «sin contexto, con la extensión real…») |
| R5 | `geo-consultas-cierre` (R5 ×2) |
| R6 | `geo-consultas-cierre` (R6) |
| R7 | `geo-consultas-cierre` (R7, una consulta en vuelo); `emisor-relaciones-anidadas` (literales enmendados 2026-11-03: 0 `provincia`, 2 `zona`; en la baseline, no corre en local) |
| R8 | `git diff origin/dev...HEAD -- lib/repositories/CierresAdminRepository.ts` vacío; `cierres-admin-service`, `cierre-iva-aparte-sl39`; `cierre-detail-congelado` |
| R9 | `geo-consultas-conteo` («R9, R11»); `lugar-orden.test.ts` |
| R10 | `geo-consultas-conteo` («R10») |
| R11 | `geo-consultas-conteo` («R9, R11» y su contraprueba) |
| R12 | `geo-consultas-conteo` («R12», en `comoPlataforma`) |
| R13 | `geo-consultas-zona` («R13, R15», «R13: una asignación en un cantón»); `lugar-orden.test.ts` |
| R14 | `geo-consultas-zona` («R14»); `zona-reconciliacion-ordenes`, `zona-central-guarda-y-rastro`, `zona-pago-mensajero-rastro` |
| R15 | `geo-consultas-zona` («R13, R15»: plan nuevo = `planDeHoy`) |
| R16 | `zonas-action`; `zona-repository.test.ts` («⭑ R5: … UNION…» y «⭑ R2/R9…», enmendados 2026-11-03); guardia `zona-reconciliacion-no-retarifa` (mira `planificarReconciliacion`, enmendada 2026-11-03) |
| R17 | `geo-consultas-zona` («R17»), `geo-consultas-cierre` («R17»), `zona-especial-dos-empresas` («SLT-65 R17: … cliente extendido») |
| R18 | `geo-nodo-rls`, `geografia-dos-paises`, `geo-consultas-ordenes` (R4); en `lib/db/` solo la excepción de T5.1 |
| R19 | guardia `geografia-lecturas-sin-nodo-fk` (ampliada) y `geo-lecturas-sin-backfill` (lecturas 1–7) |
| R20 | guardia `geografia-sin-cte-recursiva` (verde en `test:guardias`) |
| R21 | guardia `catalogo-geografico-sin-instancia-de-modulo` (7/7, con contraprueba) |
| R22 | `geo-equivalencia-consultas` (incluye «R22 — el conteo del país, una vez por país en plataforma») |
| R23 | `geo-equivalencia-consultas` (salida ≠ 0 con diferencias; contraprueba de la marca en un cantón) |
| R24 | `geo-equivalencia-consultas` y `geo-explain-consultas` (INSERT → 25006, sin SQL ni datos personales) |
| R25 | `geo-explain-consultas` (cinco lecturas, mediana, +19 %/+21 %, Seq Scan) |
| R26 | sin migración: `git diff --name-only 69a385e~1 HEAD -- db/` vacío (T9 no aplica sin T8.3) |
| R27 | suites existentes de órdenes, cierres, zonas y geografía en verde sin cambiar aserciones (salvo los literales autorizados, incluidos los enmendados el 2026-11-03); E2E en CI |
| R28 | ver la comprobación de diff de abajo |

### Comprobaciones de diff
- **`db/` (R26):** `git diff --name-only 69a385e~1 HEAD -- db/` → vacío. Contra `origin/dev...HEAD` salen las 6 migraciones `20261031120000`–`120500` y `schema.prisma`, que vienen de SLT-43 por la base de SLT-44, no de esta feature.
- **`lib/db/` (R18):** `git diff --name-only 69a385e~1 HEAD -- lib/db/` → solo `lib/db/excepciones-aislamiento.ts` (las dos entradas de T5.1). **Aviso al reviewer:** la lista de plataforma gana `scripts/geo-explain-consultas.ts` y `scripts/geo-equivalencia-consultas.ts`.
- **§2.2 (R28):** archivos de código que toca SLT-65: `lib/repositories/{OrdenRepository,CierreDiaRepository,ZonaRepository}.ts`, `lib/repositories/_shared/{lugar-orden,sin-transaccion-anidada}.ts`, `lib/db/excepciones-aislamiento.ts`, `scripts/geo-*` y `package.json`. No cambian ni `CierresAdminRepository`, ni las actions, ni los servicios de escritura de geografía, zonas o marcas, ni `components/`/`app/`. En `OrdenRepository` no cambia ninguna línea de `where` con `provinciaId|cantonId|distritoId` (grep del diff vacío). Los filtros de `list`, `condicionesSatelite`, `WITH_ETIQUETA` y los nombres de `toBodegaSateliteRow` siguen sin tocar (ver T2).

### T7.3 — `pnpm run test:guardias` (corrida del 2026-10-31; la de cierre está en la sección del 2026-11-03)
`Test Files 2 failed | 326 passed (328)`, `Tests 5 failed | 4585 passed | 1 skipped (4591)`.
- `dependencias-declaradas-presentes` (4): está en `tests/baseline-rojos.json`.
- `zona-reconciliacion-no-retarifa` (1): ABIERTA. Su antivacío busca `orden.findMany(` en `update`, y la lectura está ahora en `planificarReconciliacion`.
- `zona-especial-punto-unico`, `geografia-sin-cte-recursiva`, `consultas-concurrentes-en-transaccion`, `plataforma-solo-en-lista`, `geografia-lecturas-sin-nodo-fk` y `catalogo-geografico-sin-instancia-de-modulo`: en verde.

### T8.2 — `./init.sh` (sin marcar)
Corta en el paso 3: `✗ feature_list.json invalido: zona backend: SLT-43, SLT-44, SLT-59, SLT-65 (4 in_progress, max 3)`. Es la excepción de cupo que aceptó el humano (`progress/features/SLT-65.md`), pero el validador no la conoce; le toca al leader. Lo que sí se corre en local:
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: `232 problems (0 errors, 232 warnings)`, los que ya había.
- guardias: arriba.
No se corre `vitest related`, porque arrastra unos 650 archivos (la suite entera). Las tandas acotadas de cada bloque están en sus secciones.

## Cierre de los tres ABIERTOS (implementer, 2026-11-03)

Decisión humana: `progress/features/SLT-65.md > Decisiones`, 2026-11-03. Sin cambios de código de producción.

### Commits (sin push)
`20a3731` test: zonas, los tres `expect` · `a3e8700` test: literales de emisor y 405 · (este) docs: T4.2, T7.3 y bitácora.

### Qué cambió
- `tests/unit/repositories/zona-repository.test.ts`
  - «⭑ R5: … la UNION…»: la 2.ª `zonaDistrito.findMany` es la carga del catálogo. La unión se lee ahora en la llamada que la lleva: los `orden.count` del plan (uno por zona resuelta, R8), en la rama `distritoId.in` de `whereLugarEn`. La entrada pasa a dar zona a los tres nodos (`dViejo` → `zB`; `dQueSigue`, `dNuevo` → `zA`). Mismas dos aserciones: conjunto `{dViejo, dQueSigue, dNuevo}` y longitud 3 (sin repetidos).
  - `BASE_D1_ZA`: `distritoId: {in: ["d1"]}` pasa a la forma literal de `whereLugarEn` (`OR` de distrito y de cantón sin distrito). El resto del `where` no cambia.
- `tests/unit/guards/zona-reconciliacion-no-retarifa.guardia.test.ts`: el antivacío exige `appendAccion` y `planificarReconciliacion(` en `update`. Además exige `orden.findMany(` y `orden.count(` en el cuerpo de `planificarReconciliacion` (el recortador LANZA si no la encuentra). Gana fuerza: el plan no puede escribir en ningún modelo (`escriturasDelPlan`, con su contraprueba) ni nombrar una tabla de dinero. El detector de `update` (`fallosDeLaReconciliacion`) no cambia.
- `tests/integration/db/emisor-relaciones-anidadas.test.ts`: `provincia` → 0 y `zona` → 2, con un comentario que explica la carga del catálogo.
- `tests/integration/db/gestiones-detalle-api-405.test.ts`: una lectura de calentamiento antes de medir. `CONSULTAS_DEL_DETALLE` queda en las 12 de la lectura en caliente, sin las seis de la carga. Pasa `toHaveLength(14)` → `12`. Con y sin gestiones se miden ya en caliente, sobre la misma base.

### Corridas (`NODE_OPTIONS=--max-old-space-size=8192`, Postgres local con `node --env-file=../../.env`)
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: `232 problems (0 errors, 232 warnings)`, los mismos de antes.
- Unit zonas (`zona-repository`, guardia `zona-reconciliacion-no-retarifa`): `Test Files 2 passed (2)`, `Tests 58 passed (58)`.
- T4.2: `geo-consultas-zona`, `zona-reconciliacion-ordenes`, `zona-central-guarda-y-rastro`, `zona-pago-mensajero-rastro`, `zonas-action` y `zona-repository`: `Test Files 6 passed (6)`, `Tests 149 passed (149)`. **T4.2 marcada.**
- T7.3: `pnpm run test:guardias` da `Test Files 1 failed | 324 passed | 3 skipped (328)` y `Tests 4 failed | 4564 passed | 24 skipped (4592)`. El único archivo en rojo es `dependencias-declaradas-presentes` (4), que está en `tests/baseline-rojos.json`. Corridas aparte con `--reporter=verbose`, `zona-especial-punto-unico`, `geografia-sin-cte-recursiva`, `consultas-concurrentes-en-transaccion` y `zona-reconciliacion-no-retarifa` dan `4 passed`, `44 passed`, sin skips. **T7.3 marcada.**
- `emisor-relaciones-anidadas` y `gestiones-detalle-api-405`: los dos en rojo en local por el estado de la base, no por los literales. El 405 corta en el `beforeAll` («falta el estado `devolucion_por_confirmar`… corre `pnpm run db:seed`»). El emisor da `expected [] to have a length of 1` en el antivacío y `referencia a otra empresa: orden.tienda_id -> usuario`. Los dos están en `tests/baseline-rojos.json`. **Los literales nuevos NO están medidos**: se comprueban cuando corran con datos (SL-31 / CI con semilla).
- `./init.sh` (T8.2, sin marcar) corta en el paso 3: `zona backend: SLT-43, SLT-44, SLT-59, SLT-65 (4 in_progress, max 3)`. Es la excepción de cupo que aceptó el humano y no cuenta como rojo.

## T8.3 — Medición con volumen en la base LOCAL (implementer, 2026-11-03)

Decisión humana (Cristian, 2026-11-03): «Medir con volumen» antes de aceptar la regresión vista con
15 órdenes. Autorizó la base local (`localhost:5432/logistic`). **No es la copia de producción**:
T8.3 sigue pidiendo esa corrida y queda **sin marcar**.

### Datos sintéticos (sembrados y borrados)

- Empresa `perf-slt65-org` (slug `perf-slt65`), país CR. 6 zonas (1 central), 204 `zona_distrito`
  (la zona 1 con 60 distritos), 8 tiendas y 12 mensajeros.
- 10 000 órdenes: las 7 provincias, 20 estatus (45 % `entregado`), 90 días de `created_at`, 3 %
  borradas, 10 % sin distrito. `nodo_geografico_id` lo puso el trigger: 0 filas con
  `nodo_geografico_id IS DISTINCT FROM COALESCE(distrito_id, canton_id)`.
- 5 `cierre_dia` en los últimos 30 días y 700 `gestion_orden` (el cierre mayor, 300 filas).
- SQL de siembra y limpieza fuera del repo (scratchpad). `ANALYZE` antes de medir.
- **Limpieza:** borradas todas (incluidas las 10 318 filas de `cobro_plataforma_movimiento` que creó
  el trigger). Conteo de las 107 tablas de `public` igual al de antes de sembrar: 0 diferencias.

### `geo:explain-consultas --empresa perf-slt65-org`, 3 corridas (cada una ya es mediana de 5)

| Lectura | Antes (ms) | Después (ms) | % (mediana de las 3) | % por corrida | Seq Scan `orden` antes/después | Bloquea 20 % | Veredicto |
|---|---|---|---|---|---|---|---|
| `listado-ordenes` | 8.139 | 14.027 | +70.5 % | +70.1 / +70.5 / +72.3 | 0 / 0 | sí | **regresión** |
| `listado-api` | 9.674 | 45.535 | +32.7 % | −7.9 / +499.3 / +32.7 | 0 / 0 | sí | **regresión** (ruidosa) |
| `cierre-descriptivos` | 0.668 | 21.073 | +3132.5 % | +4471.6 / +2706.0 / +3132.5 | 0 / 0 | sí | **regresión** |
| `reconciliacion` | 38.336 | 30.187 | −21.3 % | −58.3 / −21.3 / +17.4 | 0 / 0 | no | sin regresión |
| `conteo-sin-entregar` | 38.767 | 55.455 | +94.7 % | −22.3 / +94.7 / +329.4 | 0 / 0 | no | sin regresión (no bloquea) |

Salida de las 3 corridas: `salida=1` (2, 3 y 3 lecturas con regresión). Ningún Seq Scan sobre
`orden` en ningún lado. La máquina (Windows, Postgres 16.1) es ruidosa entre corridas; el
`listado-ordenes` es estable.

### `geo:equivalencia-consultas` (con los datos sintéticos): salida 0

`total: empresas=2 con-diferencias=0 conteos-con-diferencias=0 cadena-incoherente=0 paises=1 fallidas=0 salida=0`.
En `perf-slt65-org`: cobro-devolución 200/0, corrección 200/0, listados 200/0, reconciliación 6/0,
conteo por empresa 287/0; plataforma CR 297/0. Los bloques `cierres` comparan 0 (la siembra no creó
`cierre_detail`).

### Diagnóstico (`EXPLAIN (ANALYZE, BUFFERS)` por consulta)

- Las consultas sobre `orden` no empeoran: usan índice (`orden_organizacion_id_created_at_vivas_idx`
  en el `count`, `orden_pkey` en la de señales). Los dos `count` del listado (2.4–4.9 ms) están en
  los dos lados.
- La diferencia es un **costo fijo de la carga del catálogo**, que no crece con las órdenes:
  - `nodo_geografico` del país (585 filas) `ORDER BY nombre, id` (`ORDEN_NODOS`): 2–3.4 ms, casi
    todo en el nodo `Sort`.
  - `zona_distrito` de la empresa (204 filas) `ORDER BY id`: 0.9–1.7 ms, también en el `Sort`.
  - El resto (tipos, organización, marcas, `zona` por id) suma < 0.3 ms.
- La causa del `Sort` caro es la **collation de la base local**, `Spanish_Colombia.1252` (libc de
  Windows). Medido con 7 corridas (mediana), en una transacción revertida:

  | Consulta | Hoy | `COLLATE "C"` | Sin `ORDER BY` | Índice ordenado (forzado) |
  |---|---|---|---|---|
  | nodos `ORDER BY nombre, id` | 3.435 ms | 0.964 ms | 0.222 ms | 0.406 ms (`(pais_id, nombre, id)`) |
  | `zona_distrito` `ORDER BY id` | 1.625 ms | 0.282 ms | 0.080 ms | 0.137 ms (`(organizacion_id, id)`) |

  Con el índice creado y `ANALYZE`, el planner **no lo elige**: sigue con Seq Scan + Sort porque las
  tablas son chicas. Solo se usa con `enable_seqscan`/`enable_sort` apagados.
- En el cierre el «antes» son 6 consultas por id (0.6 ms), así que cualquier carga del catálogo
  pasa del 20 %. En el listado, ~5 ms fijos sobre ~8 ms.
- T9.1 (nombres del catálogo ya cargado) quitaría las tres consultas `provincia`/`canton`/`distrito`
  de «después», que suman ~0.3 ms: no basta.

### Propuesta (sin cambios de código ni migraciones; decide el humano)

1. **Medir sobre la copia de producción** (lo que T8.3 pide). El costo está en el `Sort` con la
   collation libc de Windows. La collation de producción no está en `docs/`: es un dato
   **ABIERTO**. Si allí es `C`/`C.UTF-8` o ICU, el sort baja a ~1 ms y la regresión del listado
   puede quedar cerca del umbral.
2. Si se repite: **quitar el `ORDER BY` de la carga y ordenar en memoria** (o no ordenar, si nadie
   depende del orden de los nodos). Ahorra ~4.5 ms por lectura. Cambia el design §3 («por nombre,
   con la collation de la base»), así que necesita decisión.
3. **Cachear el catálogo por país** dentro de la petición o del proceso. Elimina la carga en lecturas
   repetidas, pero choca con m5/R21 (sin instancias de módulo) y necesita design.
4. **No recomiendo el índice de T9.2** solo: el planner no lo usa en tablas de este tamaño.

## T8.2 — rojo de `test:rapido` en el composition root del conteo (implementer, 2026-11-03)

Decisión humana (Cristian, 2026-11-03): «Diagnosticar y enmendar».

- **Rojo:** `tests/unit/actions/geografia-plataforma.composition-root.test.ts:56`, «R31: el conteo
  usa el repositorio de órdenes (el SEGUNDO argumento del root)». Esperaba
  `{ status: "ok", ordenes: 7 }` y recibía `{ status: "error" }`. Este archivo no está en
  `tests/baseline-rojos.json`.
- **Error real** (sacado con una sonda temporal sobre `OrdenRepository`, ya borrada):
  `TypeError: this.prisma.nodoGeografico.findUnique is not a function`. La action lo registra como
  `fallo conteo de ordenes nivel=canton causa=TypeError` y devuelve `error`.
- **Causa: el mock estaba viejo, no hay bug en el código.** `contarSinEntregarPorNodoGeografico`
  hace lo que pide el design §5 (R9–R12): lee el nodo pedido por id (`findUnique`), carga
  `dePais(paisId)` y cuenta `whereLugarEn([id, ...nodosBajo])`. El cliente falso de SL-20 solo
  tenía `orden.count`, con el `where` por columna de nivel (`cantonId`) que había antes de SLT-65.
- **Enmienda (solo en el test):**
  - se agrega `nodoGeografico.findUnique`, que por defecto devuelve `null`;
  - el caso R31 prepara el cantón `c-1` de CR (profundidad 2), con su distrito `d-1`;
  - el `where` pasa a la forma de `whereLugarEn(["c-1", "d-1"])`, junto con `deletedAt: null`.

  No se quitó ningún aserto: siguen `{ status: "ok", ordenes: 7 }` y `toHaveBeenCalledTimes(1)`
  sobre `orden.count`, así que el conteo sigue pasando por el repositorio de órdenes del root. Se
  suman dos asertos: `findUnique` con `{ id: "c-1" }` y `nodoGeografico.findMany` con
  `{ paisId: "CR" }`. El mapa R → test (T3) añade este caso a las filas R9/R11 y R12.

### Corridas (`NODE_OPTIONS=--max-old-space-size=8192`)

- `vitest run tests/unit/actions/geografia-plataforma.composition-root.test.ts` → `Tests  6 passed (6)`.
- Relacionados (`geografia-action`, `geografia-plataforma-action`, `geografia-service` y el
  composition root) → `Test Files  4 passed (4)`, `Tests  159 passed (159)`.
- `eslint` del archivo → sin problemas. `tsc --noEmit` → sin errores.
- `./init.sh` completo: Claude Code **lo cortó por falta de memoria del sistema** a mitad de
  `test:rapido`, con el log en 9579 líneas. Antes del corte pasaron
  `✓ cupo por zona respetado (mis in_progress=4)`, `✓ typecheck paso` y el lint (solo warnings), y
  no había ninguna línea `FAIL`. No hay línea final. **T8.2 sigue sin marcar**, pendiente de volver
  a correr `./init.sh` con memoria libre.

## F2.3 — Sincronización con `dev` (implementer, 2026-11-03)

**Merge:** `git merge origin/dev`, 248 commits, merge commit `0c86d71b`. Arreglos posteriores en `7b29903b`.

**Conflictos resueltos (los 6, uniendo ambos lados):**
- `lib/db/modelos-de-negocio.ts`: solo la cabecera. Queda en 80 de negocio (dev suma `ConciliacionBodegaAjuste`, de SLT-73) y 25 de plataforma (SLT-43).
- `lib/repositories/ZonaRepository.ts`: solo los imports. Entran `esViolacionDeUnico` (SLT-75) y `sinTransaccionAnidada`, `nodosBajo` y `zonaQueCubre` (SLT-65), y sale `zonaUnicaDeDistrito`, que ya no se usa. El cuerpo se mezcló solo: la lectura de conflictos de SLT-75 queda antes de la primera escritura, y después vienen la reconciliación por `planificarReconciliacion` y el rastro `zona_distrito_cambiado`.
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`: 75 tipos (SLT-76) y 28 entidades (SLT-43).
- `tests/integration/db/caja-459-migration.test.ts`: los tramos de los enums con `zona_distrito_cambiado` como último tipo y `nodo_geografico` como última entidad.
- `tests/unit/repositories/zona-repository.test.ts`: `nmEnOrden` (SLT-75) con las filas del catálogo (`filaDeZona`, SLT-65).
- `progress/deudas.md`: se quedan la D34 y la D35 de dev. La D34 de SLT-65 (`enUnaFoto`) pasa a ser la D36.

**Roto por el merge y arreglado (backend_dev, `7b29903b`):**
- `GeoRepository.listArbol`: el auto-merge dejó `d.zonas` (SLT-75 R14) sobre el nodo del catálogo. Ahora esas zonas salen de `asignaciones.zonasPorNodo`, sin colapsar y ordenadas.
- `scripts/geo-equivalencia/lecturas-de-hoy.ts`: la lectura de hoy calcula `zonas` desde la relación, igual que en dev.
- `tests/unit/repositories/geo-repository-arbol-zonas.test.ts`: el doble pasa a la forma del catálogo. Las aserciones no cambian.
- `zona-repository.test.ts`: `esLecturaDeConflictos` confundía la carga del catálogo con la lectura de conflictos, porque las dos piden `select.zona`, y eso daba 8 rojos. Ahora reconoce la de conflictos por `select.distrito`.

**Migraciones:** las 21 nuevas de dev (de `20261031120000_liberar_recolecciones_recibidas` a `20261102090100_slt76_retirar_respaldos`) ya estaban aplicadas en la base local, que es compartida. `prisma migrate status` da «295 migrations found… up to date». Las 6 de SLT-43 (`20261031120000`–`120500`) son anteriores a las de dev que tocan `zona_distrito` (`20261101090000`/`090100`) y a la de `zona_distrito_cambiado` (`20261102090000`), así que en una base vacía el orden es válido. En una base que ya tenga las de dev, `migrate deploy` las aplica como pendientes aunque lleven fecha anterior.

**Verificación** (con el `.env` de la raíz y `NODE_OPTIONS=--max-old-space-size=8192`):
- `pnpm typecheck`: exit 0. `./init.sh` llegó a «✓ typecheck paso» y «✓ lint paso» (0 errores, 234 warnings), con el cupo «mis in_progress=4» en verde. En `test:rapido` (97 archivos del diff contra `origin/dev`) se cortó por timeout a los 590 s (exit 124), sin terminar.
- `pnpm run test:guardias`: 331 archivos, 330 en verde. Hay 4 rojos, todos en `dependencias-declaradas-presentes.guardia.test.ts`, que está en `baseline-rojos.json`.
- Unit: `zona-repository` 61/61 en verde. `catalogo-y-choke-point` y `caja-459-migration` en verde. `geo-repository-arbol-zonas`, `catalogo-filtros-ordenes`, `geografia-service` y `geografia-action`: 103/103.
- Integración: `zona-distrito-unica` y `geo-lecturas-catalogo` dan 10 rojos y 7 verdes. No están en la baseline. Son dos choques entre SLT-44 y SLT-75 que quedan ABIERTOS en `progress/features/SLT-65.md > Decisiones`: el fixture `geo-44` con un distrito en dos zonas, y `EmpresaNoResuelta` en el R14 de SLT-75.

## Paso B tras el merge de SLT-44 (implementer, 2026-11-04)

**Contexto:** merge de `origin/feature/SLT-44-geo-jerarquica-dominio` (Parte A, `590682e9`, enmienda
«un distrito, una zona») en `d2769756`. El implementer anterior se colgó (watchdog de 600 s). En
esta vuelta todo corre archivo por archivo, con `timeout`, el `.env` de la raíz (`localhost:5432/logistic`)
y `NODE_OPTIONS=--max-old-space-size=8192`.

**Commit `9b4e0004` test(SLT-65):** `zona-distrito-unica.test.ts` envuelve el `fn(...)` del escenario
en `conEmpresa(A, ...)`. `enTransaccionRevertida` deja la empresa por defecto en `contextoActual`, y el
catálogo de SLT-44 busca `organizacion` por ese id, de ahí `EmpresaNoResuelta` en R14. Es un arreglo
del arnés del test: no cambia ningún `expect`.

**R4: guardar:** con ese cambio pasa. No hizo falta tocarlo ni llamar a backend_dev. Su rojo de la
corrida del 2026-11-03 salía de la misma causa (contexto de empresa) o del fixture geo-44 con un
distrito en dos zonas, que SLT-44 ya arregló en `590682e9`. No lo aislé más porque ya está en verde.

**Corridas (todas exit 0):**
- `zona-distrito-unica`: 9/9.
- `geo-lecturas-catalogo` 8/8 · `geo-equivalencia-dinero` 8/8 · `geo-catalogo-repository` 8/8 ·
  `geo-lecturas-sin-backfill` 2/2 · `geo-consultas-conteo` 4/4 · `geo-consultas-cierre` 5/5 ·
  `geo-consultas-ordenes` 6/6 · `geo-consultas-zona` 4/4 · `geo-equivalencia` 4/4 ·
  `geo-equivalencia-consultas` 9/9 · `geo-65-fixture` 1/1 · `geo-backfill` 16/16 ·
  `geo-explain-consultas` 11/11 · `geo-nodo-invariantes` 15/15 · `geo-nodo-rls` 2/2 ·
  `geo-normalizar-nombre` 4/4 · `geo-sincronia-geografia` 8/8 · `geo-sincronia-orden-zonas` 10/10 ·
  `geo-tipo-nivel` 7/7 · `geo-trigger-orden-rendimiento` en verde (el bucle salió 0).
- `pnpm run typecheck`: exit 0.
- `pnpm run test:guardias`: 323 de 331 archivos en verde y 7 tests en rojo. Detalle:
  - `dependencias-declaradas-presentes` (4 tests): está en `baseline-rojos.json`.
  - `filtros-url-r25`, `otp-debug-solo-en-pruebas`, `descargas-por-registro` y `sin-estados-retirados`:
    cayeron por timeout (20 s en `readdirSync` del árbol). Esa corrida coincidió con la de integración.
    Corridos solos pasan: 2 + 27 tests en lote, y 9/9 y 6/6 por separado. No son rojos de SLT-65.

## F2.3 — Merge de SLT-44 con las migraciones de SLT-43 renombradas (implementer, 2026-11-04)

- `3e261867`: commit de `progress/review_SLT-65.md` (review vuelta 2, B1).
- Merge de `origin/feature/SLT-44-geo-jerarquica-dominio` (`98976157`). Trae SLT-43 con sus 6 migraciones renombradas a `20261104120000`…`20261104120500`, después de SLT-52, y además SLT-52, que entra por primera vez en esta rama. SLT-65 no tiene migraciones propias.
- Conflictos y cómo se resolvieron. En todos se unen los dos lados:
  - `CierreDiaRepository.crearCierre`: el snapshot usa `...congeladoDeLaFila(f, descriptivos)` (SLT-65) seguido de `tarifaModelo` y `tarifaColumnas(tarifa?.modelo === "viejo" ? …)` (SLT-52). Los nombres congelados salen solo de `congeladoDeLaFila`.
  - `OrdenRepository.toListItemDTO(row, tarifa: TarifaDeFila | null, esZonaEspecial)`.
  - En 3 dobles de test (`ordenes-api-key-orden-consulta.route`, `ordenes-api-key-composicion-415`, `costo-orden-forma-unica.guardia`) van `...delegadosDelCatalogo()` y `...sinValoresDelModeloNuevo()`. No comparten claves.
- Ajustes tras el merge, para que el typecheck pase y la copia de hoy refleje `dev`:
  - `distritoId` aparecía duplicado porque lo añadieron SLT-52 y SLT-65. Se quitó la línea de SLT-65 en `OrdenRepository` (`apiOrdenSelect`, el tipo de la fila y `findBaseCobroDevolucion`) y en el literal de `orden-repository.no-regresion-106`. La semántica no cambia.
  - `scripts/geo-equivalencia-consultas.ts`: `DETALLE_SELECT` suma `tarifaModelo` y `conceptos`, y la llamada pasa a `tarifaDe(d, d.conceptos)`. Es el patrón de `CierresAdminRepository`.
  - `scripts/geo-equivalencia/consultas-de-hoy.ts`: se añade `distritoId` en `API_ORDEN_SELECT` y en `findBaseCobroDevolucion`, igual que hizo SLT-52 en `dev`.
  - `geo-consultas-ordenes.test.ts:163`: el `costeo` esperado suma `distritoId: f.distritoId`, el campo que SLT-52 añadió al `costeo`. La marca y el resto del `expect` no cambian. **Es un cambio de un literal esperado: lo revisa el reviewer.**
- Base: `logistic_slt65_r1104` es nueva, con `migrate deploy` (301), `db:seed` y `db:generate`. La base compartida `logistic` no se tocó.

Salida (`DATABASE_URL` → `logistic_slt65_r1104`, un archivo por corrida con `timeout 600`):
- `slt43-migraciones-aditivas` 9/9; `migracion-slt43-ida-y-vuelta` 8/8.
- `geo-*` de integración, los 21: `geo-65-fixture` 1/1, `geo-backfill` 16/16, `geo-catalogo-repository` 8/8, `geo-consultas-cierre` 5/5, `geo-consultas-conteo` 4/4, `geo-consultas-ordenes` 6/6 (tras el ajuste; antes 1 rojo), `geo-consultas-zona` 4/4, `geo-equivalencia` 4/4, `geo-equivalencia-consultas` 9/9, `geo-equivalencia-dinero` 8/8, `geo-explain-consultas` 11/11, `geo-lecturas-catalogo` 8/8, `geo-lecturas-sin-backfill` 2/2, `geo-nodo-invariantes` 15/15, `geo-nodo-rls` 2/2, `geo-normalizar-nombre` 4/4, `geo-sincronia-geografia` 8/8, `geo-sincronia-orden-zonas` 10/10, `geo-tipo-nivel` 7/7, `geo-trigger-orden-rendimiento` 1/1.
- `zona-distrito-unica` 9/9, `zona-distrito-unica-migration` 24/24, `catalogo-y-choke-point` 52/52, `caja-459-migration` 6/6.
- Archivos con conflicto: `ordenes-api-key-orden-consulta.route` 31/31, `ordenes-api-key-composicion-415` 3/3, `costo-orden-forma-unica.guardia` 11/11, `orden-repository.no-regresion-106` 7/7.
- `pnpm run test:guardias`: 332/333 archivos y 4623 tests en verde. Solo falla `dependencias-declaradas-presentes` (4 tests), que está en la baseline.
- `tsc --noEmit`: exit 0.
