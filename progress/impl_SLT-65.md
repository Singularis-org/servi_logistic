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
| R9, R11 | `geo-consultas-conteo` «R9, R11»: para los 8 nodos de cada empresa (CR y XA), el nuevo es igual a `hoy.contarSinEntregarDeHoy`. Antivacío: provincia 10, suma de cantones 10, suma de distritos 7. Contraprueba «R11 (contraprueba)»: con la orden incoherente solo difieren el cantón activo (−1) y el retirado (+1); con ella borrada, 0 diferencias |
| R10 | `geo-consultas-conteo` «R10»: un id inexistente, un cantón pedido como distrito, un distrito como cantón, un cantón como provincia y una provincia como cantón dan 0, tanto en el nuevo como en el de hoy |
| R12 | `geo-consultas-conteo` «R12», en `comoPlataforma`: el distrito central de XA cuenta 4 y, con la orden de una segunda empresa de XA, 5 (la provincia, 11), igual que hoy |
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
