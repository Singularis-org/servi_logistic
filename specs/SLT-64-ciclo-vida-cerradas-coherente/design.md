# SLT-64 · design

> Podado el 2026-11-04 a R1–R17 (decisión de Carlos del 2026-10-30) y revalidado contra el código
> tras integrar `origin/dev`. Lo que solo servía a R18–R23 está resumido en §8.

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
| Puntos de escritura que mueven la «última gestión vigente» | `CierreDiaRepository.anularGestionPendiente`, `.anularGestionDeCierreRechazado`, `.anularGestionYDevolverAGestion`; `CierresAdminRepository.corregirResultadoGestionEnCierre` | **No se tocan.** Los tres primeros llegan solo por `deshacerGestion` y el cuarto solo por `corregirResultadoGestion`. Las dos son Server Actions, y ahí se invalida (R12, R13). |

Hay otras correcciones que no cambian ni el resultado ni la vigencia de una gestión y quedan fuera:
`corregir-fecha-reprogramacion`, `corregir-dia-reparto`, `corregir-datos-cliente` y
`conciliacion-satelites`.

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
  los parámetros como texto: sin un cast, Postgres no encuentra el operador `enum = text`.
  `ConteoDevolucionesRepository` lo resuelve por el otro lado, con un solo valor
  (`${…}::"gestion_resultado"`). Aquí la lista entra por `Prisma.join`, y es más simple castear la
  columna.
- **No lee `orden_historial_estado`.** Por eso aprobar un cierre no mueve la cifra (R6), y una
  transición terminal sin gestión de cierre no cuenta (R2).
- **Los índices aplican en las dos lecturas de `gestion_orden`.** La subconsulta usa
  `gestion_orden(orden_id)`. El filtro externo arranca por la ventana con
  `gestion_orden(organizacion_id, created_at)`, que sustituyó al índice de `created_at` a secas
  (SL-18) y sirve porque la RLS fija la empresa.

### Una sola fuente para «resultado de cierre» (R10)

`lib/types/conteo-ciclo-vida.ts` es el DTO puro del ciclo y gana esta constante, con
`import type { OrderStatusValue } from "@/lib/types/order-status"`:

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
`consultarCicloVida` **no cambian de forma**. Lo que cambia es el significado del dato. Por eso se
corrigen los comentarios que dejarían de ser ciertos:

- las cabeceras de `CicloVidaRepository`, `lib/actions/ciclo-vida.ts`,
  `lib/types/conteo-ciclo-vida.ts`, `CicloVidaKpi.tsx` e `ICicloVidaRepository`;
- `claveDeCicloVida` en `lib/analytics/entregas-conteo.ts`;
- los que describen el ciclo de vida por la transición terminal o nombran
  `condicionDeVentanaTerminal`: `CohorteCargaRepository.ts`, `ventana-de-carga.ts`,
  `cohorte-carga-ventana.int.test.ts`, `cohorte-carga-reloj.int.test.ts` y
  `cohorte-terminales.guardia.test.ts`. Su argumento sigue en pie (la ventana del ciclo cae sobre el
  cierre y la de la cohorte sobre la carga). La lógica de esos archivos no cambia.

**La pantalla no cambia.** El rótulo sigue siendo «Ciclo de vida promedio (N órdenes cerradas)», y
el vocabulario de la fila («cerradas» frente a «con desenlace», ficha 441) se conserva.

## 2. Qué consumidores del concepto cambian y cuáles no

| Consumidor | ¿Cambia? | Por qué |
|---|---|---|
| `CicloVidaRepository` → `CicloVidaKpi` («Ciclo de vida promedio») | **Sí** (§1) | Es la cifra que da 0 con 11 entregas registradas (evidencia §5). |
| `ConteoPorStatusRepository` → «Detalle de las órdenes», `KpisEfectividad`, héroe de madurez, `AvisoPeriodoEnCurso`, `ProductosTabla` (vía `calcularEfectividad` y `evaluarMadurezDeCohorte`) | **No en lógica.** Sí ganan la invalidación (§3). | Ya leen la última gestión vigente al consultar, así que una anulación ya los mueve. Su «cerradas» (`cargadas − enProceso`) se rotula «tienen desenlace»: son los cinco desenlaces de `DESENLACES`, incluidos `reprogramado` y `novedad`. Es otra pregunta, y la pantalla la separa a propósito (ficha 441, `FilaKpisVocabulario.test.tsx`). Su ventana cae sobre la carga (ficha 441) y la del ciclo sobre la gestión final (D4): con rango, las dos cifras coinciden solo si la ventana cubre carga y gestión. R11 se mide sin rango. |
| `ConteoEntregasRepository` (anillo), `ConteoDevolucionesRepository`, `HoyGestion`, `ConteoCargadasPorDia` | **No en lógica.** Sí la invalidación. | Leen gestiones vigentes u `orden` en vivo, y ninguno usa el concepto «cerrada». |
| `CohorteCargaRepository` → `CohorteCargaTabla` | **No** (Q2) | Su desenlace y sus días siguen en la transición terminal. Su DTO defiende esa decisión: «`devuelta` = devolución anclada, no lote cerrado». Cambiarlo toca el tipo `CohorteDesenlace`, la tabla y ocho tests de integración, y la evidencia no lo pidió. Sí gana la invalidación de su etiqueta. |
| `AnaliticaRollupRepository.acumularCiclosCerrados` (Q5, `tiempo_ciclo` en `analytics_daily`) | **No** (Q3) | Es contrato público: `tiempo_ciclo` está en `METRICAS_API_KEY`. La pantalla no lo usa, porque el slot `operativo` del shell está comentado. Una anulación no lo afecta, porque no escribe historial. |
| `AnaliticaRollupRepository` Q3/Q4 (medidas de gestión por día) | **No en esta ficha** (§8) | Cuentan gestiones vigentes **del día al correr**. Una anulación posterior deja la fecha por exceso (124 §D3+D8), como hoy. El recálculo va a la ficha aparte. |
| `AnaliticaOperativaVivaRepository` (tablero de hoy) | **No** | Es gemelo de Q5 en vivo, no tiene caché propia de entregas y su región no se pinta. Se resuelve con Q3. |
| `TableroDiaRepository` (Monitoreo) | **No** | No es Analítica. Ya usa la última gestión vigente del día. |

## 3. Invalidación de caché por anulación y corrección (R12–R17)

**Dónde se invalida: en la Server Action, no en el servicio.**

- `deshacerGestion` (`lib/actions/cierre-dia.ts`) y `corregirResultadoGestion`
  (`lib/actions/cierres-admin.ts`) invalidan **después** de que el servicio devuelva `status: "ok"`
  y antes de devolver la respuesta.
- `revalidateTag` necesita el contexto de petición de Next, y la acción lo tiene.
- Los servicios siguen sin conocer Next.
- `deshacerGestion` del servicio devuelve `ok` por las tres vías de R12
  (`CierreDiaService.ts`: `anularGestionDeCierreRechazado`, `anularGestionPendiente` y
  `anularGestionYDevolverAGestion`), así que basta un solo punto en la acción.

**La lista de etiquetas.**

- El módulo nuevo y puro `lib/analytics/tags-entregas.ts` exporta
  `TAGS_LECTURAS_ENTREGAS: readonly string[]` con las ocho etiquetas: las siete de
  `entregas-conteo.ts` más `TAG_CONTEO_PRODUCTOS`.
- No puede vivir en `entregas-conteo.ts`: `productos-consulta.ts` ya importa valores de ese archivo,
  y el import inverso crearía un ciclo.
- `analitica-refrescar.ts` pasa a construir su lista como `[...TAGS_LECTURAS_ENTREGAS, ...TAGS_OPERATIVA]`,
  en el mismo orden de hoy.
- El test de R17 comprueba tres cosas:
  1. que `analitica-refrescar.ts` importa la constante y ya no importa las `TAG_*` de entregas;
  2. que la constante contiene exactamente las ocho, escritas una a una en el test (derivarlas de
     ella misma daría siempre verde);
  3. que ningún archivo de `lib/` escribe los literales de esas etiquetas, salvo donde se declara cada
     una y `lib/modulos/reparto.ts`, donde esos textos son nombres de archivos de acción. Las
     subclaves SWR de `app/(app)/analitica/` tampoco son etiquetas de caché y quedan fuera del censo.

**El puerto.**

- Las dos acciones ganan la dependencia inyectable `cache?: IAnaliticaCache` en `CierreDiaDeps` y
  `CierresAdminDeps`. Por defecto usan `crearAnaliticaCacheDeNext()`, que trae el registro de R23 de
  la 128, y por eso R16 se cumple solo.
- `OrigenInvalidacion` gana `"correccion_gestion"`. `registro-invalidacion.ts` no enumera los
  orígenes (usa el tipo), así que no cambia.
- La etiqueta lleva la empresa (`org:<id>:<tag>`): `NextAnaliticaCache.invalidar` la resuelve del
  contexto de la petición, que es la empresa del actor y de la orden.
- Se corrigen dos comentarios que esta ficha deja falsos: el de `crearConteoEntregasCacheDeNext`
  («esta vertical no tiene ninguna [invalidación]») y el de `lib/config/conteo-entregas-cache.ts`
  («ni van a tener un invalidador por escritura»). La gestión nueva sigue sin invalidar.

**Si la invalidación falla (R15).**

- Se captura, se registra con `defaultLogger.logError` (sin ids ni PII) y la acción devuelve el
  `ok` del servicio. La construcción del puerto por defecto va dentro del mismo `try`.
- **No** se propaga, al revés que en el job de la 128 (R11). La escritura ya está confirmada; si
  respondiera error, el usuario reintentaría y recibiría `conflict` («ya deshecha») por algo que sí
  hizo.
- El TTL de 15 minutos acota lo que la cifra puede quedarse vieja.

**Cableado (memoria «composition root que no inyecta»).**
`cache-invalidacion-correccion-cableado.test.ts` comprueba en estático que las dos acciones, en su
rama por defecto, construyen el puerto con `crearAnaliticaCacheDeNext()` y no con `cacheNula()`.

## 4. Modelo de datos, multi-empresa y país

- **Sin tablas, columnas, enums ni migraciones.** No hay `down.sql` que escribir ni dependencias
  nuevas. Tampoco hay endpoints ni integraciones externas nuevas.
- **Multi-empresa.** La consulta de §1 corre con la empresa fijada y la RLS de `orden` y
  `gestion_orden` acota por `organizacion_id`. `CicloVidaRepository` ya está en
  `EXCEPCIONES_SQL_A_MANO` (`lib/db/excepciones-aislamiento.ts`) por ese motivo, y sigue sin filtrar
  en el texto. No hay RLS nueva ni únicos nuevos. La caché ya separa por empresa (§3).
- **País.** Nada depende del país: la consulta compara instantes y la ventana sale de `resolverRango`.

## 5. Autorización

No cambia. Quién puede deshacer o corregir lo siguen decidiendo:

- `CierreDiaService.deshacerGestion` (mensajero autor y guardas de la 67/477);
- `CierresAdminService.corregirResultadoGestion` (rol, alcance y cierre abierto).

La invalidación solo ocurre tras su `ok`. La lectura del ciclo exige el módulo `analitica`
(`exigirModuloActivo`) y aplica el alcance por rol, igual que hoy. Las dos acciones de escritura son
del núcleo (`MODULO_POR_ACTION`), no llevan esa puerta, e invalidan igual con el módulo apagado: es
inocuo.

## 6. Alternativas descartadas

1. **Seguir midiendo el cierre aprobado y poner una nota en la pantalla** («cerradas = cierre
   aprobado»), como sugería la evidencia §5. Se descarta porque D1 decide lo contrario. Además, la
   nota no arregla nada: mientras nadie apruebe cierres, el KPI sigue vacío.
2. **Escribir la transición terminal al registrar la gestión.** Es volver al modelo anterior a la
   454, que la quitó a propósito: la orden se queda `en_reparto` hasta la aprobación, y de eso cuelgan
   el dinero y el deshacer. Mueve el dominio para arreglar una lectura.
3. **Unir las dos fuentes**: gestión final o transición terminal, la que exista. Da dos instantes de
   fin para la misma orden y una regla de precedencia que nadie decidió. Q1 ya decidió que
   `devuelta_a_tienda` no cierra por sí sola.
4. **`LEFT JOIN LATERAL` desde `orden`**, el patrón de `ConteoPorStatusRepository`. Recorre todas
   las órdenes del alcance para luego descartar casi todas: la ventana cae sobre la gestión y no
   sobre la orden. El `NOT EXISTS` empieza por las gestiones de cierre de la ventana.
5. **Invalidar desde el servicio con un puerto obligatorio.** Mete `next/cache` en el árbol de
   servicios y obliga a ampliar la allowlist de `cache-aislamiento.guardia.test.ts` (128 R21). La
   acción ya es la frontera con Next.
6. **Propagar el fallo de la invalidación** (R11 de la 128). Aquí la escritura ya está confirmada:
   devolver error invita a reintentar, y el reintento choca con `conflict`. Ver §3.

## 7. Estrategia de prueba: las mutaciones que cada test debe matar

Los tests de §1 van contra **Postgres real** (`tests/integration/db/`, `HAY_BASE_DE_DATOS`), en una
transacción revertida. Se apoyan en lo que ya hay:

- `tests/integration/db/_postgres-real.ts`: `enTransaccionRevertida` y `clienteConSavepoint` (el que
  necesitan los repositorios reales que abren `$transaction`);
- `_semilla-rollup.ts`: `sembrarBase`, `crearOrden`, `crearGestion` y `agregarTransicion`;
- `_cohorte-carga.ts`: `consultaDe` (`rangoDe` para los casos con ventana);
- `correccion-resultado-gestion.int.test.ts`: cómo sembrar un cierre abierto para la escritura real;
- `tests/fabricas/organizaciones.ts`: `comoApp`, `crearOrganizacion` y `fijarEmpresa`, para el caso
  de otra empresa.

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
| ″ | Orden de otra tienda con alcance de tienda; orden borrada; mensajero sin gestión vigente (R9) | quitar `condicionDeAlcance`, `deleted_at` o el `EXISTS` |
| ″ | Orden de otra empresa, leyendo como `servi_app` con la empresa fijada (`comoApp`), con alcance global → no cuenta (R9). Con alcance global `condicionDeAlcance` es `TRUE`: esta frontera es la RLS | quitar la RLS en la transacción del test, o leer sin `comoApp` |
| ″ | R11: mismo recorte sin rango → `n` = suma de los tres buckets de `ConteoPorStatusRepository` | cualquiera de las anteriores |

## 8. Para la ficha aparte (por crear): recálculo del rollup

Salió de este spec por decisión de Carlos del 2026-10-30. Lo imprescindible para no perder el análisis:

- **El hueco.** `AnaliticaRollupRepository` Q3/Q4 cuentan gestiones vigentes del día al correr. Una
  anulación o corrección posterior deja `analytics_daily` por exceso en esa fecha.
- **Pregunta sin decidir (antigua Q4).** D3+D8 de la 124 dicen que el job diario nunca recomputa
  fechas pasadas y que corregir es un acto deliberado del backfill (125). Un trabajo por evento,
  aparte del diario, no toca R35 de la 124, pero sí contradice D8. Hay que decidir si se acepta.
- **Diseño que se había propuesto:**
  - valor `analitica_reagregar_fecha` en `job_tipo`, con migración y `down.sql` que recrea el tipo
    (patrón `20260803140000_job_tipo_analitica_invalidacion_cache`), y su clasificación en
    `MODULO_POR_JOB` como `"analitica"`;
  - encolado dentro de la transacción de las cuatro escrituras (`anularGestionPendiente`,
    `anularGestionDeCierreRechazado`, `anularGestionYDevolverAGestion` y
    `corregirResultadoGestionEnCierre`), con el patrón de `encolarWebhookEvento`, solo si la fecha CR
    de la gestión es anterior a hoy;
  - clave de dedupe `analitica_reagregar_fecha:<fecha>:<gestionId>:<evento>`: `enqueue` hace
    `ON CONFLICT (dedupe_key) DO NOTHING` para siempre, y juntar dos eventos de una fecha perdería el
    segundo;
  - handler que llama a `AnaliticaRollupService.agregarFecha(payload.fecha)` (idempotente, 124 R27),
    nunca a `fechaObjetivo(now())`, e invalida `TAGS_OPERATIVA` sin `try/catch`; se registra en
    `app/api/cron/procesar-jobs/route.ts`.
- **Hallazgo heredado.** Las consultas de `AnaliticaRollupRepository` no filtran por `organizacion_id`
  en el texto. Hay que comprobar qué recalcula `agregarFecha(D)` al correr en el contexto de una empresa.
- **Alternativas ya descartadas:**
  - que el job diario vuelva a mirar N días: viola R35 de la 124 y recalcula sin que haya pasado nada;
  - encolar fuera de la transacción: si el proceso muere tras el commit, la fecha queda vieja sin
    rastro.
- **Revalidar antes de especificar.** SLT-52 cambió `corregirResultadoGestionEnCierre` después de este
  análisis, y el diseño de arriba no se revisó contra el código actual.
