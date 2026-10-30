# SLT-64 · design

## Lo que ya existe

**Términos buscados:**

- en el board (`feature_list.json`): «ciclo de vida», «cerradas», «tiempo de ciclo», «anulada» con
  «analítica»;
- en `specs/`: `CicloVidaRepository`, «gestión final»;
- en el código, con Grep/Read: `ESTADOS_TERMINALES`, `TAG_CICLO_VIDA`, `anuladaAt`,
  `gestion_corregida`, `agregarFecha`, `analitica_*`.

El MCP `codebase-memory-mcp` no tiene un proyecto indexado para este worktree. Por eso esta
exploración se hizo con Grep/Read.

| Qué apareció | Dónde | Cómo se usa aquí |
|---|---|---|
| Ninguna ficha ni spec redefine «cerrada» | board (SLT-64 es la única), `specs/` | — |
| SLT-62 «% de efectividad aunque haya pocas órdenes» | board, `pending` | **No se solapa.** Toca el umbral de madurez (`lib/analytics/madurez-cohorte.ts`, `lib/config/efectividad-cohorte.ts`), y esta ficha no toca ninguno de los dos archivos. |
| Criterio «última gestión vigente» (`anulada_at IS NULL`, `created_at DESC, id DESC`) | `ConteoPorStatusRepository.contarPorStatus` | **Se reutiliza el criterio**, para que el ciclo de vida y el «Entregado N» elijan la misma gestión. |
| Lista de las ocho etiquetas de entregas | `lib/actions/analitica-refrescar.ts` (`TAGS_ANALITICA`, privada) | **Se extrae** a una constante exportada y la usan el botón y los invalidadores nuevos (R17). |
| Puerto de caché con `invalidar(origen, tags)` y registro | `IAnaliticaCache`, `crearAnaliticaCacheDeNext()` | **Se reutiliza.** `OrigenInvalidacion` gana el valor `correccion_gestion`. |
| Encolado de un job dentro de la transacción de dominio | `encolarWebhookEvento(tx, …)` en `lib/services/jobs/webhook-evento-encolado.ts` | **Se copia el patrón** para `analitica_reagregar_fecha`. |
| Re-agregado de una fecha | `AnaliticaRollupService.agregarFecha(fecha)`, idempotente (124 R27), que ya usan el job diario y el backfill (125) | **Se reutiliza tal cual.** El handler nuevo solo lo llama. |
| Enum `job_tipo` con un down que recrea el tipo | `db/migrations/20260803140000_job_tipo_analitica_invalidacion_cache/` | **Se calca.** |
| Puntos de escritura que mueven la «última gestión vigente» | `CierreDiaRepository.anularGestionPendiente`, `.anularGestionDeCierreRechazado`, `.anularGestionYDevolverAGestion`; `CierresAdminRepository.corregirResultadoGestionEnCierre` | Son los **cuatro** sitios donde se encola (R18). Los tres primeros llegan por `deshacerGestion` y el cuarto por `corregirResultadoGestion`. Las dos son Server Actions. |

Hay otras correcciones que no cambian ni el resultado ni la vigencia de una gestión y quedan fuera:
`corregir-fecha-reprogramacion`, `corregir-dia-reparto`, `corregir-datos-cliente` y
`conciliacion-satelites`.

**Hallazgo heredado que esta ficha no cambia.** Las consultas de `AnaliticaRollupRepository` no
filtran por `organizacion_id`, así que `agregarFecha(D)` recalcula D para toda la base. Re-agregar
por evento hereda ese comportamiento, el mismo del backfill.

## 1. La consulta nueva del ciclo de vida (R1–R11)

Se reescribe solo `CicloVidaRepository.acumularCiclos`. `condicionesDeCiclo`, que lleva el alcance,
el soft delete, las facetas y el `EXISTS` de mensajero, **no cambia** (R9).
`condicionDeVentanaTerminal` pasa a fechar `g."created_at"` y se renombra a
`condicionDeVentanaDeCierre`.

```sql
SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (g."created_at" - o."created_at"))::bigint), 0)::bigint AS seg,
       COUNT(*)::int AS n
FROM "gestion_orden" g
JOIN "orden" o ON o."id" = g."orden_id"
WHERE g."anulada_at" IS NULL
  AND g."resultado"::text IN (${RESULTADOS_DE_CIERRE})      -- R1, R10
  AND ${ventanaSobre g."created_at"}                         -- R4
  AND NOT EXISTS (                                            -- R5: es la ÚLTIMA vigente
    SELECT 1 FROM "gestion_orden" g2
    WHERE g2."orden_id" = g."orden_id"
      AND g2."anulada_at" IS NULL
      AND (g2."created_at", g2."id") > (g."created_at", g."id")
  )
  AND ${where}                                               -- R9: condicionesDeCiclo intacta
```

Lo que garantiza cada pieza:

- **Una contribución por orden (R3).** El `NOT EXISTS` deja pasar solo la última gestión vigente de
  cada orden. Dos gestiones de la misma orden no pueden ser «la última» a la vez.
- **Mismo desempate que el «Entregado N».** `(created_at, id) >` es el mismo orden que
  `ORDER BY created_at DESC, id DESC` en `ConteoPorStatusRepository`. Comparar `id` uuid con `>`
  es determinista, como el `ORDER BY id DESC` de allí.
- **La comparación se hace en texto.** `resultado` es el enum `gestion_resultado`, y Prisma manda
  los parámetros como texto: sin el cast, Postgres no encuentra el operador `enum = text`.
  `ConteoDevolucionesRepository` ya lo resuelve así (`g."resultado"::text = ${…}`).
- **No lee `orden_historial_estado`.** Por eso aprobar un cierre no mueve la cifra (R6), y una
  transición terminal sin gestión de cierre no cuenta (R2).
- **El índice aplica en las dos lecturas de `gestion_orden`.** La subconsulta usa
  `gestion_orden(orden_id)`. El filtro externo arranca por la ventana sobre `g.created_at` y por
  los resultados.

### Una sola fuente para «resultado de cierre» (R10)

`lib/types/conteo-ciclo-vida.ts` es el DTO puro del ciclo y gana esta constante:

```ts
export const RESULTADOS_DE_CIERRE = [
  "entregado",
  "devolucion_a_origen_por_rechazo",
  "incidente",
] as const satisfies readonly OrderStatusValue[];
```

Se tipa contra `OrderStatusValue` por el mismo motivo que `DESENLACES` en `conteo-entregas.ts`: si
el catálogo cambia un nombre, el tipo deja de compilar.

El guardia de R10 comprueba tres cosas:

1. que la lista es exactamente esa;
2. que cada valor existe en el enum `GestionResultado` de Prisma;
3. que `CicloVidaRepository` la importa y no escribe los literales. El censo de literales se copia
   de `cohorte-terminales.guardia.test.ts`, quitando los comentarios antes de buscar.

`CicloVidaRepository` deja de importar `ESTADOS_TERMINALES`.

### Contratos

`ICicloVidaRepository`, `CicloCrudo`, `CicloVidaDTO`, `ResultadoCicloVida` y la Server Action
`consultarCicloVida` **no cambian de forma**. Lo que cambia es el significado del dato, y por eso se
reescriben los comentarios de cabecera de cuatro archivos para que no mientan: `CicloVidaRepository`,
`lib/actions/ciclo-vida.ts`, `lib/types/conteo-ciclo-vida.ts` y `CicloVidaKpi.tsx`.

**La pantalla no cambia.** El rótulo sigue siendo «Ciclo de vida promedio (N órdenes cerradas)», y
el vocabulario de la fila («cerradas» frente a «con desenlace», ficha 441) se conserva.

## 2. Qué consumidores del concepto cambian y cuáles no

| Consumidor | ¿Cambia? | Por qué |
|---|---|---|
| `CicloVidaRepository` → `CicloVidaKpi` («Ciclo de vida promedio») | **Sí** (§1) | Es la cifra que da 0 con 11 entregas registradas (evidencia §5). |
| `ConteoPorStatusRepository` → «Detalle de las órdenes», `KpisEfectividad`, héroe de madurez, `AvisoPeriodoEnCurso`, `ProductosTabla` (vía `calcularEfectividad` y `evaluarMadurezDeCohorte`) | **No en lógica.** Sí ganan la invalidación (§3). | Ya leen la última gestión vigente al consultar, así que una anulación ya los mueve. Su «cerradas» (`cargadas − enProceso`) se rotula «tienen desenlace»: son los cinco desenlaces de `DESENLACES`, incluidos `reprogramado` y `novedad`. Es otra pregunta, y la pantalla la separa a propósito (ficha 441, `FilaKpisVocabulario.test.tsx`). |
| `ConteoEntregasRepository` (anillo), `ConteoDevolucionesRepository`, `HoyGestion`, `ConteoCargadasPorDia` | **No en lógica.** Sí la invalidación. | Leen gestiones vigentes u `orden` en vivo, y ninguno usa el concepto «cerrada». |
| `CohorteCargaRepository` → `CohorteCargaTabla` | **No** (Q2) | Su desenlace y sus días siguen en la transición terminal. Su DTO defiende esa decisión: «`devuelta` = devolución anclada, no lote cerrado». Cambiarlo toca el tipo `CohorteDesenlace`, la tabla y ocho tests de integración, y la evidencia no lo pidió. Sí gana la invalidación de su etiqueta. |
| `AnaliticaRollupRepository.acumularCiclosCerrados` (Q5, `tiempo_ciclo` en `analytics_daily`) | **No** (Q3) | Es contrato público: `tiempo_ciclo` está en `METRICAS_API_KEY`. La pantalla no lo usa, porque el slot `operativo` del shell está comentado. Una anulación no lo afecta, porque no escribe historial. |
| `AnaliticaRollupRepository` Q3/Q4 (medidas de gestión por día) | **Sí, por recálculo** (§4) | Cuentan gestiones vigentes **del día al correr**. Una anulación posterior deja la fecha por exceso (124 §D3+D8), y D2 pide recalcularla. |
| `AnaliticaOperativaVivaRepository` (tablero de hoy) | **No** | Es gemelo de Q5 en vivo, no tiene caché propia de entregas y su región no se pinta. Se resuelve con Q3. |
| `TableroDiaRepository` (Monitoreo) | **No** | No es Analítica. Ya usa la última gestión vigente del día. |

## 3. Invalidación de caché por anulación y corrección (R12–R17)

**Dónde se invalida: en la Server Action, no en el servicio.**

- `deshacerGestion` (`lib/actions/cierre-dia.ts`) y `corregirResultadoGestion`
  (`lib/actions/cierres-admin.ts`) invalidan **después** de que el servicio devuelva `status: "ok"`
  y antes de devolver la respuesta.
- `revalidateTag` necesita el contexto de petición de Next, y la acción lo tiene.
- Los servicios siguen sin conocer Next.

**La lista de etiquetas.**

- `lib/analytics/entregas-conteo.ts` exporta
  `TAGS_LECTURAS_ENTREGAS: readonly string[]` con las ocho etiquetas: las siete de este archivo más
  `TAG_CONTEO_PRODUCTOS`.
- `analitica-refrescar.ts` pasa a construir su lista como `[...TAGS_LECTURAS_ENTREGAS, ...TAGS_OPERATIVA]`.
- El test de R17 comprueba la identidad de la referencia y que ningún otro archivo escribe los
  literales de esas etiquetas.

**El puerto.**

- Las dos acciones ganan la dependencia inyectable `cache?: IAnaliticaCache`. Por defecto usan
  `crearAnaliticaCacheDeNext()`, que trae el registro de R23 de la 128, y por eso R16 se cumple solo.
- `OrigenInvalidacion` gana `"correccion_gestion"`.
- La etiqueta lleva la empresa (`org:<id>:<tag>`): `NextAnaliticaCache.invalidar` la resuelve del
  contexto de la petición, que es la empresa del actor y de la orden.

**Si la invalidación falla (R15).**

- Se captura, se registra con `defaultLogger.logError` (sin ids ni PII) y la acción devuelve el
  `ok` del servicio.
- **No** se propaga, al revés que en el job de la 128 (R11). La escritura ya está confirmada; si
  respondiera error, el usuario reintentaría y recibiría `conflict` («ya deshecha») por algo que sí
  hizo.
- El TTL de 15 minutos acota lo que la cifra puede quedarse vieja.

**Cableado (memoria «composition root que no inyecta»).**
`cache-invalidacion-correccion-cableado.test.ts` comprueba en estático que las dos acciones, en su
rama por defecto, construyen el puerto con `crearAnaliticaCacheDeNext()` y no con `cacheNula()`.

## 4. Re-agregación del rollup por evento (R18–R23)

### Modelo de datos

- **Sin tablas nuevas.** Solo el valor `analitica_reagregar_fecha` en el enum `job_tipo`.
- **Migración:** `db/migrations/<ts>_job_tipo_analitica_reagregar_fecha/`.
  - `migration.sql`: `ALTER TYPE "job_tipo" ADD VALUE 'analitica_reagregar_fecha';`.
  - `down.sql`: borra las filas `jobs` de ese tipo y recrea el tipo sin el valor, con la lista
    completa de valores en el **orden vigente**. El implementer la saca de la última migración de
    `job_tipo` y no la copia de este documento.
- **Multi-empresa.**
  - `jobs` ya lleva `organizacion_id` desde SL-19, y el trabajo se encola con la empresa de la orden.
  - No hay RLS nueva ni únicos nuevos.
  - Nada depende del país: el día se calcula en hora de Costa Rica con `lib/utils/fecha-cr.ts`, igual
    que el job diario.
- **Módulo.** `MODULO_POR_JOB` en `lib/modulos/reparto.ts` clasifica el tipo nuevo como
  `"analitica"`, igual que `analitica_rollup_diario`. El tipo `Record<JobTipo, Destino>` obliga a
  hacerlo.

### Encolado

Archivo nuevo: `lib/services/jobs/analitica-reagregar-fecha-encolado.ts`.

- **Funciones puras:**
  - `DEDUPE_PREFIX_REAGREGAR = "analitica_reagregar_fecha"`;
  - `dedupeKeyReagregar(fecha, gestionId, evento: "anulada" | "corregida")`, que devuelve
    `analitica_reagregar_fecha:<fecha>:<gestionId>:<evento>`.
- **Por qué esa clave.** Una gestión se anula una sola vez, y su resultado se corrige una sola vez
  (`entregado → devolucion_a_origen_por_rechazo`). La clave es idempotente frente al reintento del
  mismo evento, y **no** junta dos eventos distintos de la misma fecha. Juntarlos sería el fallo que
  describe `analitica-invalidacion-encolado.ts`: `enqueue` hace `ON CONFLICT (dedupe_key) DO NOTHING`
  para siempre.
- **El encolado:**
  `encolarReagregacionAnalitica(tx, { gestionCreadaAt, gestionId, evento, ahora })`.
  - Calcula la fecha CR de la gestión y la de `ahora`.
  - Si no es anterior a hoy, no encola y devuelve `false` (R19).
  - Si lo es, hace `JobRepository(tx).enqueue("analitica_reagregar_fecha", { fecha }, { dedupeKey }, tx)`
    con el patrón de `encolarWebhookEvento`.
  - **El reloj se inyecta.** `anularGestionYDevolverAGestion` ya recibe el instante del servicio
    (ficha 261). Las otras tres escrituras ganan un `ahora: Date` en su input, que el servicio les
    pasa con su `now`.

**Llamadas.** Las cuatro escrituras de `## Lo que ya existe` la llaman **dentro** de su
`$transaction` y después de su guarda de `count`:

- leen el `created_at` de la gestión con un `select` en la misma tx;
- si la tx revierte por `NoAnulable` o por una guarda, el `INSERT` en `jobs` revierte con ella (R20).

### Handler

Archivo nuevo: `lib/services/jobs/analitica-reagregar-fecha-handler.ts`, con
`crearAnaliticaReagregarFechaHandler(service, invalidador)`. Hace tres cosas:

1. Valida el payload `{ fecha: "YYYY-MM-DD" }`. Si viene malformado, lanza: es un fallo de
   programación.
2. Llama a `service.agregarFecha(fecha)`, y en ningún momento a `fechaObjetivo(now())` (R21:
   **exactamente** esa fecha).
3. Llama a `invalidador.invalidar("correccion_gestion", TAGS_OPERATIVA)`, sin `try/catch`. Usa el
   mismo origen que §3 para que el registro de la 128 distinga este recálculo del job diario. Un fallo
   sube y `JobQueueService` aplica el backoff (R21).

Se registra en `app/api/cron/procesar-jobs/route.ts` pasándole el puerto real, igual que el handler
diario. El test de cableado del handler diario (`cache-invalidacion-job.test.ts`) se amplía para
cubrir también el handler nuevo.

### Integración

No hay integraciones externas, endpoints nuevos ni dependencias nuevas.

## 5. Autorización

No cambia. Quién puede deshacer o corregir lo siguen decidiendo:

- `CierreDiaService.deshacerGestion` (mensajero autor y guardas R2–R9 de la 67/477);
- `CierresAdminService.corregirResultadoGestion` (rol, alcance y cierre abierto).

La invalidación y el encolado solo ocurren tras su `ok`. La lectura del ciclo exige el módulo
`analitica` (`exigirModuloActivo`) y aplica el alcance por rol, igual que hoy.

## 6. Alternativas descartadas

1. **Seguir midiendo el cierre aprobado y poner una nota en la pantalla** («cerradas = cierre
   aprobado»), como sugería la evidencia §5. Se descarta porque D1 decide lo contrario. Además, la
   nota no arregla nada: mientras nadie apruebe cierres, el KPI sigue vacío.
2. **Escribir la transición terminal al registrar la gestión.** Es volver al modelo anterior a la
   454, que la quitó a propósito: la orden se queda `en_reparto` hasta la aprobación, y de eso cuelgan
   el dinero y el deshacer. Mueve el dominio para arreglar una lectura.
3. **Unir las dos fuentes**: gestión final o transición terminal, la que exista. Da dos instantes de
   fin para la misma orden y una regla de precedencia que nadie decidió. Si Q1 pide cerrar también
   con `devuelta_a_tienda`, se decide entonces y en un solo sitio.
4. **`LEFT JOIN LATERAL` desde `orden`**, el patrón de `ConteoPorStatusRepository`. Recorre todas
   las órdenes del alcance para luego descartar casi todas: la ventana cae sobre la gestión y no
   sobre la orden. El `NOT EXISTS` empieza por las gestiones de cierre de la ventana.
5. **Invalidar desde el servicio con un puerto obligatorio.** Mete `next/cache` en el árbol de
   servicios y obliga a ampliar la allowlist de `cache-aislamiento.guardia.test.ts` (128 R21). La
   acción ya es la frontera con Next.
6. **Hacer que el job diario vuelva a mirar los N días anteriores.** Viola R35 de la 124, que es
   estricto, y recalcula días sin que haya pasado nada. El trabajo por evento solo recalcula la
   fecha tocada.
7. **Encolar la re-agregación fuera de la transacción**, en el servicio y tras el `ok`. Si el
   proceso muere entre el commit y el encolado, la fecha se queda vieja sin dejar rastro. Dentro de
   la tx es atómico, como el webhook de `gestion_anulada`.
8. **Propagar el fallo de la invalidación** (R11 de la 128). Aquí la escritura ya está confirmada:
   devolver error invita a reintentar, y el reintento choca con `conflict`. Ver §3.

## 7. Estrategia de prueba: las mutaciones que cada test debe matar

Los tests de §1 y §4 van contra **Postgres real** (`tests/integration/db/`, `HAY_BASE_DE_DATOS`), en
una transacción revertida y con la fábrica de órdenes y gestiones de los tests de la 455.

Antes de dar por bueno cada test hay que confirmar que **ejecuta filas**. Un `if (!datos) return` en
verde no prueba nada (memoria «test de integración verde sin datos»): cada test afirma primero que
su fixture existe.

| Test | Escenario mínimo | Mutación que lo pone rojo |
|---|---|---|
| `ciclo-vida-gestion-final.int.test.ts` | O1 entregado, sin historial terminal (el caso de producción) → `n = 1` | volver a leer `orden_historial_estado` → `n = 0` |
| ″ | O2 con la última gestión `reprogramado` y una transición terminal sembrada a mano → no cuenta (R2) | quitar el filtro de `RESULTADOS_DE_CIERRE` |
| ″ | O3 `entregado` dentro de la ventana y después un `reprogramado` vigente fuera → no cuenta (R5) | quitar el `NOT EXISTS`, o meterle la ventana |
| ″ | **Anulación (R7):** O4 con `reprogramado` en D1 y `entregado` en D2; se anula el de D2 en la tx → deja de contar. O5 con `entregado` en D1 y `novedad` en D2; se anula la de D2 → cuenta con el instante de D1 | quitar `anulada_at IS NULL` del `NOT EXISTS` o de la consulta externa |
| ″ | **Corrección (R8):** O6 corregida de `entregado` a `devolucion_a_origen_por_rechazo` con la escritura real de `corregirResultadoGestionEnCierre` → sigue contando y los segundos no cambian | usar el instante de la corrección, o sacar `devolucion…` de la lista |
| ″ | **Aprobación (R6):** el `n` y los segundos se leen antes y después de llamar a `resolverCierre(aprobado)` sobre O1 | volver al historial |
| ″ | Empate de `created_at` entre dos gestiones de la misma orden → `n = 1` (R3) | quitar `g2.id` de la tupla |
| ″ | Orden de otra empresa; orden borrada; mensajero sin gestión vigente (R9) | quitar `condicionDeAlcance` o el `EXISTS` |
| ″ | R11: mismo recorte sin rango → `n` = suma de los tres buckets de `ConteoPorStatusRepository` | cualquiera de las anteriores |
| `reagregacion-por-correccion.int.test.ts` | Las cuatro escrituras con una gestión de ayer → una fila `jobs` con la fecha de ayer; con una gestión de hoy → ninguna; una guarda que revierte → ninguna | encolar fuera de la tx; quitar la comparación con hoy |
| `rollup-reagregado-tras-anulacion.int.test.ts` | Agregar D (`entregas = 1`), anular, correr el handler → `entregas = 0` | que el handler use `fechaObjetivo(now())` |
