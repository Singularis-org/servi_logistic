# SLT-59 — Reducir llamadas pagadas a Google en la optimización de ruta · design

> **Revisión 4 (2026-10-30)** con D21-D25. Cambia:
> - §2 queda sustituida por §12.1 (decisión con disparo manual o automático, primera ruta y enfriamiento);
> - §12 es nueva: primera ruta del día, recogida, gestión, traspaso, salida y botón;
> - §5 y §6 suman dos campos de config y los contratos nuevos;
> - §8 se rehace (jornadas A y B);
> - §9 suma A12-A15 y §10 suma 92/R16-R17.
>
> Donde la revisión 4 contradiga a las anteriores, manda la revisión 4.
>
> **Revisión 5 (2026-10-31)** con D27. Añade §13: registro de cada llamada pagada, prefijo
> `[google-api]`, motivos y la secuencia de la jornada. Suma A16. Lo demás no cambia.

> **Revisión 3 (2026-10-30)** con D16-D20. Cambia: §2 (la decisión distingue prefijo de fuera de
> orden), §2.2 (sin tramo puente), §2.4 nueva (sincronización manual y origen), §1 y §6 (`estado` en
> la escritura, razón `reduccion_descartada`), §8 (jornada: la fila 7 pasa a 1/1/1, total 3/3/6),
> §9 (A9-A11) y §10 (92/R23). Lo demás es la revisión 2, ya implementada.
>
> **Revisión 2 (2026-10-29)** con las respuestas del humano (D6-D13 de `requirements.md`).
> Fuentes leídas: `lib/services/OptimizacionRutaService.ts`, `lib/services/jobs/optimizacion-ruta-encolado.ts`,
> `lib/services/jobs/optimizacion-ruta-handler.ts`, `lib/services/jobs/job-descartado.ts`,
> `lib/services/JobQueueService.ts`, `lib/services/MisAsignacionesService.ts` (`registrarUbicacion`,
> `gestionar`), `lib/actions/mis-asignaciones.ts` (`gestionar`), `lib/repositories/GestionOrdenRepository.ts`
> (`recogerLote`, `registrarGestionPendiente`), `lib/repositories/OrdenRepository.ts` (`findParadasEnReparto`),
> `lib/repositories/RutaOptimizadaRepository.ts`, `lib/interfaces/repositories/IRutaOptimizadaRepository.ts`,
> `lib/geo/polilinea.ts`, `lib/config/route-optimization.ts`, `lib/clients/google-route-optimization.ts:280`,
> `lib/actions/ruta-mensajero.ts:100`, `db/schema.prisma` (`RutaOptimizada`, `RutaOptimizadaParada`),
> `specs/92-*`, `specs/265-*`. El MCP del grafo no tiene indexado este worktree: todo se leyó con Grep/Read.

---

## Lo que ya existe

Buscado en el board (`feature_list.json`, títulos y descripciones): `optimiz`, `Google`, `ruta`,
`reintent`, `debounce` → **solo SLT-59**.

Buscado en `specs/`: `92-optimizacion-ruta-mensajero` y `265-optimizador-lee-al-proveedor`. No son la
misma feature: crearon las guardas que esta ficha afina. Se reutiliza, no se re-crea:

| Qué existe | Dónde | Cómo se usa aquí |
| --- | --- | --- |
| Guardas de coste en orden fijo | `OptimizacionRutaService.ejecutar` | La guarda 92/R36 se **sustituye en su sitio** (R8); el orden lo fija el describe «265/R33». |
| Huella `huella_set` | `OptimizacionRutaService.huella` | **Se conserva igual**: condición de `guardarTrazado` y ahora también de la escritura de la reducción (R18). Deja de ser el criterio de «sin cambios». |
| Tramos por parada | `ruta_optimizada_parada.tramo_*`, `RutaOptimizadaDTO.tramoPorOrden`, `trazadoDesdeCache` | Base de la reducción sin llamadas (R13). 🔎 Verificado: se guardan **uno por parada, el que llega a ella**, solo cuando el trazado vino de Routes (`guardarTrazado`, `RutaOptimizadaRepository.ts:200-244`). |
| Polilínea: codificar, **decodificar**, Haversine | `lib/geo/polilinea.ts` (`codificarPolilinea`, `decodificarPolilinea`, `distanciaHaversineKm`) | Concatenar tramos (R13) y medir la desviación (R3). Se añade una función: distancia mínima de un punto a una polilínea. |
| Debounce con ventana en la clave | `encolarOptimizacionDebounce` | La gestión pasa a usarlo (R21, R23). |
| Disparo inmediato | `encolarOptimizacionInmediata`, `dedupeKeyInmediato` | **Se retira** (sin consumidores). |
| `max_intentos` por fila | `JobRepository.enqueue` + `JobQueueService.manejarFallo` | Se le pasa 3 (R32). |
| Error de job que no es fallo | `JobDescartado` + su rama en `JobQueueService.drenar` | **Patrón** de `JobFallidoPermanente` (§4); la clase no se reutiliza (A5). |
| Trazado de un tramo suelto | `IRoutesClient.trazar({ origen, paradasEnOrden: [una] })` (ya lo usa `trazarTramoVivo`) | ~~El tramo puente de R14.~~ Revisión 3: ya no se usa en esta ficha (D16 retira R14). |
| Resultado de la acción manual | `SincronizarRutaResult` (`lib/types/ruta-mensajero.ts`) con `omitida`, `secuenciaFuente`, `trazado?`; `SincronizarRutaButton` muestra «La ruta ya estaba al día.» con `omitida: true` | Revisión 3 (R45): se reutiliza tal cual, sin campos nuevos. |
| Postgres real en tests | `tests/integration/db/_postgres-real.ts` (`HAY_BASE_DE_DATOS`, `crearPrismaDeTest`) y `_jobs-dos-empresas.ts` | Revisión 3 (R48, R50): el test SQL real de `reducirSecuencia` usa estas utilidades; se salta sin `DATABASE_URL`. Revisión 4: solo con `DATABASE_URL` del entorno y host local, nunca `.env`; las utilidades se importan dinámicamente (T6.7). |

---

## 1. Modelo de datos

**Sin migración (R40).** La revisión 1 añadía `calculo_origen_lat/lng` para medir cuánto se movió el
origen. Con D8 la desviación se mide contra la **ruta**, no contra el origen (§2.1), y la ruta ya está
persistida: la polilínea en la cabecera y las paradas en `ruta_optimizada_parada`. No hace falta
ninguna columna.

Repositorio — **un método nuevo** en `IRutaOptimizadaRepository`:

```ts
/**
 * SLT-59 (R11-R18): persiste una REDUCCION de la secuencia. Condicionada a `huellaPrevia` (R18):
 * si la cabecera ya no la tiene, no escribe nada y no lanza. NO toca `calculada_at` (R17), ni el
 * origen, ni `secuencia_fuente` (R12), ni `ultimo_error`.
 * En UNA transaccion: actualiza la huella y el trazado de la cabecera (o los limpia si `trazado`
 * es null), borra las paradas y las reinserta con `secuencia` 1..n y su tramo (o null).
 */
reducirSecuencia(
  mensajeroId: string,
  huellaPrevia: string,
  reduccion: {
    huellaSet: string;
    paradas: { ordenId: string; tramo: TramoPersistido | null }[]; // EN ORDEN DE VISITA
    trazado: TrazadoPersistido | null;
  },
): Promise<boolean>; // true = aplicada
```

**Revisión 3 (R48, m6):** la barrera pasa a ser `updateMany({ where: { mensajeroId, huellaSet:
huellaPrevia, estado: "vigente" } })`. `marcarDesactualizada` no cambia la huella, así que sin el
estado una reducción leída como `vigente` podía aplicarse sobre una ruta recién marcada
`desactualizada`. El contrato no cambia de firma; el JSDoc añade la condición. `false` sigue
significando «no se escribió nada» por cualquiera de las dos causas.

Se borra y reinserta en vez de renumerar con `UPDATE` por el índice único `(ruta_id, secuencia)`:
renumerar «hacia abajo» choca a mitad de camino. Es el mismo motivo que ya escribe `reemplazarSecuencia`.

**Multi-empresa:** sin tabla nueva. `ruta_optimizada` y `ruta_optimizada_parada` ya tienen
`organizacion_id`, RLS y la extensión del cliente (SL-17). El método nuevo usa `getPrismaClient()`
como los demás; corre dentro de `conEmpresa` (petición del mensajero) o con la empresa del job
(drenador). Ninguna FK nueva, ningún único nuevo.

---

## 2. La decisión de la guarda (bloques A y A')

Sustituye a `ruta?.huellaSet === huellaSet && ruta.estado === "vigente"` en las dos ramas del
servicio (2+ paradas, `:332`; una parada, `:273`). Es **pura** sobre lo que ya se cargó: `ruta`
(`findByMensajero`, trae secuencia, tramos y trazado) y `paradas` (`findParadasEnReparto`). Cero
lecturas nuevas (R9).

```
previa    = ids de ruta.secuenciaPorOrden en orden de secuencia
actual    = set(paradas.map(id))
desviado  = posicion !== null && distanciaMinimaAPolilineaM(posicion, lineaReferencia(ruta, paradas)) > RUTA_REOPT_DISTANCIA_M

si ruta.estado !== "vigente"  -> reoptimizar (R7)
si actual ⊄ previa            -> reoptimizar (R20)
si desviado                   -> reoptimizar (R19)
si actual == previa           -> omitir, devolver trazado de caché (R1, R2, R6)
si actual ⊂ previa (estricto) -> reducir (R11-R16)
```

La función de decisión se exporta (`decidirGuardaRuta`) y devuelve `{ tipo: "reoptimizar" | "omitir"
| "reducir", ... }`. Se prueba sola, con tabla de casos.

**Revisión 3 (D16, D18).** La decisión queda así:

```
si ruta === null               -> reoptimizar (sin_ruta)
si ruta.estado !== "vigente"   -> reoptimizar (R7)
si actual ⊄ previa             -> reoptimizar (R20, paradas_nuevas)
restantes = previa filtrada a actual
si restantes != previa.slice(previa.length - restantes.length)   -> reoptimizar (R42, R43, motivo "fuera_de_orden")
si desviado                    -> reoptimizar (R19; con polilínea vacía, R47)
si actual == previa            -> omitir (R1, R2)
si no                          -> reducir (R41: prefijo)
```

- **«Prefijo» en código.** `restantes` es exactamente la cola de `previa`. Equivale a «las quitadas son
  las `k` primeras». Por eso «quitar la última» (PA-1, R43) ya no cuenta como prefijo: `restantes =
  [s1, s2]` no es la cola de `[s1, s2, s3]`.
- **Fuera de orden va antes del desvío.** No necesita decodificar la polilínea. El resultado no cambia,
  porque las dos ramas dicen «reoptimizar». `motivo` gana el valor `"fuera_de_orden"`, que solo usa el
  `optlog`.
- **R47 (D18).** `lineaReferencia` sigue usando la polilínea `routes` cuando existe, aunque decodifique
  a 0 puntos. `distanciaMinimaAPolilineaM(p, [])` da `+Infinity`, y eso cuenta como desviado. Es lo que
  hace hoy el código. La revisión 3 solo lo fija en el spec y renombra el test PA-2 a R47.
- **Recalcular fuera de orden no es una rama nueva.** `guardaSinRecalculo` devuelve `null` y `ejecutar`
  sigue por el camino de siempre (`optimizar` + `trazar`, o la rama 92/R35 con 1 parada). Así salen las
  cuentas de R42 sin código propio.

### 2.1 Qué es «desviarse de la ruta dada» (D8)

Tres medidas posibles; se elige la **distancia mínima de la posición del mensajero a la línea de la
ruta**:

| Medida | Por qué sí / por qué no |
| --- | --- |
| Distancia al origen del último cálculo | ❌ El mensajero que sigue su ruta **se aleja** del origen: al primer kilómetro recorrido, cada disparo pagaría. Castiga justo al que hace bien su trabajo. Además exigía la migración. |
| Distancia a la próxima parada | ❌ Mientras va hacia ella está lejos de ella por definición: no mide desvío, mide cuánto le falta. |
| **Distancia a la línea de la ruta** | ✅ Es lo que dice la frase: «se desvía de la ruta dada». Cero mientras va por su ruta, crece cuando se sale. |

**Línea de referencia (R4):** la polilínea por calles de la cabecera (`ruta.trazado`, solo existe si
`fuente = routes`), decodificada con `decodificarPolilinea`. Si no hay, la recta que une las paradas
de la secuencia persistida en su orden (coordenadas sacadas de `paradas`; las que ya no están en
`paradas` no tienen coordenadas a mano y se saltan; esto no añade lecturas). Límite declarado en
`requirements.md`.

**Posición del mensajero:** el origen final ya resuelto (92/R24 + 265/R16). Si su fuente es
`centroide`, no hay posición y no se considera desviado (R5): el centroide no es dónde está nadie.

**Geometría:** función nueva `distanciaMinimaAPolilineaM(punto, puntos)` en `lib/geo/polilinea.ts`.
Distancia punto-segmento en una proyección equirectangular local centrada en el punto (a la escala de
1 km el error es despreciable frente al umbral). Con un solo punto, distancia Haversine a ese punto.
Coste: lineal en los puntos de la polilínea, en memoria.

**Umbral:** `RUTA_REOPT_DISTANCIA_M = 1000` (D8). Comparación estricta: a 1000 m justos, no desviado.
Sin criterio de tiempo (R10).

### 2.2 La reducción (R11-R16)

> **Revisión 3 (D16).** De lo que sigue solo quedan en vigor los casos «Prefijo + tramos» (R13) y
> «Sin tramos» (R15), y solo para el prefijo (R41). El caso «No prefijo + tramos» (R14), el punto 4
> (R16) y el hueco «al principio» desaparecen: fuera de orden ya no llega aquí (§2). En código:
> - `planificarReduccion` pierde la rama `puente` y queda `concatenar | sin_trazado`;
> - `tramosPuente` y el parámetro `permitirLlamada` de `aplicarReduccion` se borran: una reducción
>   ya nunca llama;
> - `reducirSinLlamadas` llama a `aplicarReduccion` sin más.
>
> El punto 6 gana una razón (R49):
> - `reducirSecuencia` devuelve `true` → `{ status: "omitida", razon: "reducida", trazado? }`;
> - devuelve `false`, o no hay huella previa → `{ status: "omitida", razon: "reduccion_descartada" }`,
>   sin trazado.
>
> El job termina `done` en los dos casos (no lanza). La acción manual los trata igual que
> `sin_cambios`: `omitida: true`. Con `reduccion_descartada` no sube trazado y el mapa conserva el
> suyo. El texto de abajo se conserva como historia de la revisión 2; donde contradiga esta nota,
> manda esta nota.

Siendo `restantes` la secuencia previa filtrada a `actual` (orden conservado):

1. **¿Prefijo?** Las quitadas son exactamente las `k` primeras de `previa`.
2. **¿Tramos completos?** `ruta.trazado?.fuente === "routes"` y `tramoPorOrden` tiene las `restantes`.
3. Casos:
   - **Prefijo + tramos** (R13, entrega en orden): cada parada restante conserva su tramo. El de la
     nueva primera parada sale de la última parada entregada, que es donde está el mensajero, así que
     sigue siendo correcto. Trazado de cabecera = decodificar cada tramo, concatenar quitando el punto
     repetido en cada unión, `codificarPolilinea`; distancia y duración = sumas (null si algún tramo
     las tiene null). **0 llamadas.**
   - **No prefijo + tramos** (R14, entrega fuera de orden): por cada hueco falta el tramo
     «parada anterior → parada siguiente».
     - 1 hueco → `routes.trazar({ origen: anterior, paradasEnOrden: [siguiente] })`; su único tramo
       sustituye al de la siguiente y se rehace la cabecera como arriba. **1 llamada.**
     - 2+ huecos → la primera parada restante conserva su tramo, y una sola
       `routes.trazar({ origen: primeraRestante, paradasEnOrden: resto })` da los tramos de todas las
       demás. **1 llamada.**
     - Un hueco al principio no existe: si la primera restante no es la primera previa, todo lo que
       hay delante fue quitado y eso es prefijo (o prefijo + huecos posteriores, que cuentan como
       huecos).
   - **Sin tramos** (R15): se persiste la secuencia sin trazado. **0 llamadas.**
4. Si la llamada de R14 lanza o no da `ok` (R16): se persiste la reducción sin trazado y se sigue. No
   se lanza (el job termina `done`).
5. Huella nueva = `huella(restantes, origenFinal)` (la misma función de hoy, para que `guardarTrazado`
   siga funcionando). Escritura con `reducirSecuencia(..., huellaPrevia = ruta.huellaSet)` (R18).
6. Resultado: `{ status: "omitida", razon: "reducida", trazado? }`. `EjecutarOptimizacionResult` gana
   esa `razon`; la acción manual la trata como `sin_cambios` (no hubo ordenación).

Con **una** parada restante la reducción vale igual (R13 con un tramo). Con **cero** no hay reducción:
la rama R35 de la 92 limpia la secuencia, como hoy.

### 2.4 Sincronización manual y origen (revisión 3: D17, m1; R45, R46)

**Qué ya hace el código.** El botón pasa por las mismas guardas que la cola: `sincronizarRuta` →
`ejecutar(id, { motivo: "manual", ubicacion })`. Con la ruta `vigente`, el conjunto igual y sin
desvío, hoy ya devuelve `omitida/sin_cambios` (o `sin_paradas` con una parada) con el trazado
guardado, y hace 0 llamadas. Es la fila 2 de §8. La acción lo traduce a `{ status: "ok", omitida:
true, secuenciaFuente: null, trazado? }`, y `SincronizarRutaButton` muestra «La ruta ya estaba al
día.» y pinta el trazado si viene. **R45 fija ese contrato. No se cambia ni la acción ni el botón.**

**Lo que cambia (m1).** `ejecutar` hace hoy `upsertOrigen` con la ubicación recibida **antes** de
cualquier guarda (92/R23). Esa escritura pisa `origen_lat/lng/at/fuente` aunque luego se omita, se
reduzca o corte el intervalo mínimo. Nuevo flujo:

1. Si llega `opts.ubicacion`, se guarda **en memoria** como `ubicacionGps = { lat, lng, capturadaAt:
   ahora, fuente: "gps" }`. Todavía no se escribe nada.
2. `findByMensajero` como hoy. Si hay ubicación, se usa una vista en memoria de la ruta con las cuatro
   columnas de origen sustituidas por `ubicacionGps`:
   `rutaVista = ruta && { ...ruta, origenLat, origenLng, origenAt: ahora, origenFuente: "gps" }`.
   `resolverOrigen`, `origenCoherente`, la huella y `decidirGuardaRuta` reciben `rutaVista`, así que
   el desvío se mide con la posición recién recibida (R46) y la huella sale igual que hoy.
   Las guardas 92/R20 y 92/R34 siguen leyendo `calculadaAt` de `ruta`, que es el mismo valor.
3. Si la ejecución **va a recalcular** (`guardaSinRecalculo` devuelve `null`, o la rama 92/R35 llega a
   `reemplazarSecuencia`), justo antes de esa escritura o de la llamada al proveedor se hace
   `upsertOrigen(ubicacionGps)`. Es la misma escritura de hoy en otro sitio. Se mantiene porque
   `reemplazarSecuencia` no escribe `origen_at` (🔎 `RutaOptimizadaRepository.ts:158-164`): sin
   `upsertOrigen`, la siguiente ejecución vería un `gps` recién capturado con el `origen_at` viejo y lo
   bajaría a `ultima_conocida`. Si el proveedor falla después, el GPS queda guardado como hoy. Ya se
   había decidido recalcular, que es lo que R46 permite.
4. Si **no** recalcula (omitir, reducir, `reduccion_descartada`, intervalo mínimo), `upsertOrigen` no
   se llama.

Con `ruta === null` no hay vista. La decisión es «reoptimizar», así que se cae en el punto 3: se
escribe primero, como hoy, y `upsertOrigen` crea la fila. La cola (`motivo: "debounce"`) nunca trae
`ubicacion`, así que nada de esto la toca. `reducirSinLlamadas` tampoco recibe ubicación: la de la
gestión ya la guardó `MisAsignacionesService.registrarUbicacion` (fuera del alcance de R46, ver la
lectura de R6).

**Coste:** cero lecturas nuevas (R9); se cambia de sitio una escritura.

### 2.3 Lo que no cambia

92/R20 y 92/R34 siguen delante. `huella_set` se calcula igual. 265/R16 sigue sustituyendo el origen
incoherente antes de la decisión. Añadir paradas → `actual ⊄ previa` → reoptimización completa (D13).

---

## 3. La gestión (bloque B y R27)

### 3.1 En la transacción (`GestionOrdenRepository.registrarGestionPendiente`)

- La re-lectura de gestionable (`:780-789`) añade a su `SELECT` si la orden tiene `latitud` y
  `longitud`. Misma sentencia, ya bajo el candado: cero consultas nuevas.
- El paso (7) llama a `encolarOptimizacionDebounce(..., { ahora: this.now(), debounceS:
  loadRouteOptimizationConfig().RUTA_DEBOUNCE_S })` solo si la orden tiene coordenadas (R21, R22),
  igual que `recogerLote` (`:730-740`). Outbox: si revierte, no hay job (R25).

92 §4.1 separó `:inmediato:` de `:debounce:` para que un debounce en vuelo no se tragara la gestión.
Ahora que la gestión también es diferida, que la trague es lo que se busca (R23): ese job corre después
y lee el conjunto al ejecutarse. Se anexa una nota fechada al comentario §4.1, sin borrar el original.

**Borde heredado, declarado:** si el cron reclama el job en vuelo entre el `now()` de la transacción y
su `COMMIT`, la gestión no queda cubierta por ese job. En una entrega en orden lo cubre R27; en el
resto, el siguiente evento.

### 3.2 Después de la transacción (R27, R28)

> **Revisión 3 (R44).** Sin cambio de cableado. `reducirSinLlamadas` aplica la decisión de §2: solo
> actúa con `reducir`, que desde D16 es solo el prefijo, y entonces siempre sin llamadas. Fuera de
> orden devuelve `reoptimizar` y no hace nada en la petición. El job de §3.1, ~`RUTA_DEBOUNCE_S`
> después, recalcula entero (R42). Las referencias a R13/R15/R14 de abajo se leen con esa nota.

La reducción sin llamadas se aplica **en la propia petición**, para que `router.refresh()` muestre ya
el orden nuevo. Dónde: en la Server Action `gestionar` (`lib/actions/mis-asignaciones.ts:208`), después
de `service.gestionar(...)` con `status: "ok"`:

```ts
await (deps.reducirRuta ?? reducirRutaReal)(actor.usuarioId); // best-effort, nunca lanza
```

`reducirRutaReal` construye el servicio (`buildOptimizacionRutaService`) y llama a un método nuevo
`OptimizacionRutaService.reducirSinLlamadas(mensajeroId)`, que ejecuta la misma decisión de §2 y
**solo** persiste si el resultado es «reducir» por R13 o R15. En cualquier otro caso no hace nada y
el job de §3.1 se encarga. Envuelto en `try/catch` vacío (R28), como `registrarUbicacion`.

`MisAsignacionesService.gestionar` ya guarda la ubicación (`:780`) antes de devolver, así que la
reducción ve la posición nueva.

El job de §3.1 sigue encolándose también en este caso como red de seguridad: al correr encuentra el
conjunto igual que la secuencia reducida y no llama a nadie. Ver P9.

---

## 4. Reintentos (bloque C)

1. **Servicio.** En `outcome.status === "config_invalida"` (`OptimizacionRutaService.ts:414`) se lanza
   `RutaCredencialRechazadaError`, **subclase** de `RutaIntentoFallidoError` con `name` propio: el
   `instanceof` de `lib/actions/ruta-mensajero.ts:100` la sigue atrapando (R31). `marcarDesactualizada`
   se llama antes, como hoy (R30). Mensaje = `outcome.detalle`, ya saneado (R35).
2. **Handler** (`optimizacion-ruta-handler.ts`). En su `catch`: `RutaCredencialRechazadaError` →
   `throw new JobFallidoPermanente(error.message)`; el resto se re-lanza igual (R33).
3. **Cola** (`JobQueueService.drenar`). Rama junto a la de `JobDescartado`: `JobFallidoPermanente` →
   `repo.fail(job.id, err.message, null)`, `fallidos += 1`, `muertos += 1`, `reagendarRecurrente`. Sin
   backoff (R29). Solo el handler de `optimizacion_ruta` lanza esta clase (R34).
4. **Clase** `lib/services/jobs/job-fallido-permanente.ts`, gemela de `job-descartado.ts`.
5. **Máximo de intentos:** `OPTIMIZACION_MAX_INTENTOS` (5) se sustituye por la config
   `RUTA_OPT_MAX_INTENTOS` (3). Los jobs ya encolados conservan su `max_intentos` por fila.

El 401/403 del endpoint de token queda fuera (D11).

---

## 5. Configuración

`RouteOptimizationConfig` gana dos campos, con `readPositiveInt` (nunca lanza, R36):

| Campo | Default | Nota junto al valor |
| --- | --- | --- |
| `RUTA_REOPT_DISTANCIA_M` | 1000 | «Decidido por el humano 2026-10-29 (SLT-59, D8); no calibrado con datos de producción.» |
| `RUTA_OPT_MAX_INTENTOS` | 3 | «Decidido por el humano 2026-10-29 (SLT-59, D9).» |

`RUTA_SYNC_MIN_INTERVALO_S` sigue en 10 (R38). El `optlog` de `buildOptimizacionRutaService` añade los
dos valores.

---

## 6. Contratos que cambian

| Contrato | Cambio |
| --- | --- |
| `IRutaOptimizadaRepository` | + `reducirSecuencia` |
| `IOptimizacionRutaService` | + `reducirSinLlamadas(mensajeroId)`; `EjecutarOptimizacionResult` + `razon: "reducida"` |
| `RouteOptimizationConfig` | + 2 campos |
| `optimizacion-ruta-encolado.ts` | − `encolarOptimizacionInmediata`, − `dedupeKeyInmediato`, − `OPTIMIZACION_MAX_INTENTOS` |
| `OptimizacionRutaService.ts` | + `RutaCredencialRechazadaError`; + `decidirGuardaRuta` exportada |
| `lib/geo/polilinea.ts` | + `distanciaMinimaAPolilineaM` |
| `lib/services/jobs/` | + `JobFallidoPermanente` |
| `MisAsignacionesDeps` (`lib/actions/mis-asignaciones.ts`) | + `reducirRuta?` (inyectable en tests) |
| **Rev. 3** `EjecutarOptimizacionResult` (`IOptimizacionRutaService`) | + `razon: "reduccion_descartada"` (R49) |
| **Rev. 3** `IRutaOptimizadaRepository.reducirSecuencia` | Misma firma; el `where` exige además `estado = 'vigente'` (R48) |
| **Rev. 3** `DecisionGuardaRuta` (`OptimizacionRutaService.ts`) | `motivo` + `"fuera_de_orden"` (R42, R43) |
| **Rev. 3** `OptimizacionRutaService.ts` (privado) | − `tramosPuente`, − rama `puente` de `planificarReduccion`, − `permitirLlamada`; `upsertOrigen` sale del principio de `ejecutar` (§2.4) |
| **Rev. 3** `SincronizarRutaResult`, `sincronizarRuta`, `SincronizarRutaButton` | **Sin cambio** (R45 reutiliza la forma). `razon: "reduccion_descartada"` cae en la rama `omitida: true` que ya existe: la acción solo distingue `intervalo_minimo` |

Sin rutas ni endpoints nuevos. Sin cambios de UI: la pantalla ya ordena por la secuencia persistida.

---

## 7. Autorización, módulos y país

- **Autorización:** `reducirSinLlamadas` recibe el `usuarioId` del actor que la Server Action ya
  validó como mensajero (`MisAsignacionesService.gestionar` devuelve `forbidden` a otros roles), y solo
  toca la ruta de ese mensajero. El job corre con la empresa de `jobs.organizacion_id`.
- **Módulo:** el mismo que hoy gobierna la optimización de ruta; nada nuevo.
- **País:** nada depende del país. El umbral está en metros.

---

## 8. Jornada de referencia (R37): cómo se verifica el ahorro

### 8.0 Revisión 4 — tablas vigentes (R37 afirma estas)

> **Enmienda D30 (2026-10-31).** La columna «jobs» de «Nuevo» se ajusta a D29/R76 con los valores
> medidos (`progress/impl_SLT-59.md > Tanda 8`): filas 0 y 1b de A, B1, total de B y variantes de B.
> Las llamadas facturadas (opt / routes) no cambian en ninguna fila. El código no se toca.

Mismo arnés de test que abajo (dobles en memoria, espías sobre `optimizar` y `trazar`, reloj
inyectado), con tres cambios:
- el doble de paradas cuenta también las asignadas del día (`contarAsignadasDelDia`);
- la ruta lleva `actualizadaAt`;
- la recogida usa el código real de encolado (R58/R76): la primera recogida parcial crea el job del
  día a +10 min, cada recogida siguiente lo mueve, y la del último paquete lo mueve a +60 s. Nunca
  hay más de un job de recogida por día.

Los disparos de salida (R62) llaman al servicio con `motivo: "salida"`. Umbral: 1000 m. Enfriamiento:
5 min. Mínimo para el botón: 80 %.

**Jornada A.** Un mensajero con 7 asignadas del día: s1…s6 con coordenadas y x sin coordenadas. Bodega
en B; tras la carga, la ruta empieza en A ≈ B.

| # | t (min) | Evento | Hoy: opt / routes / jobs | Nuevo: opt / routes / jobs |
| --- | --- | --- | --- | --- |
| 0 | −10…−7 | Recoge s1, s2, s3 y x de una en una, 1 por minuto (GPS en B) | hasta 4 / 4 / 4 | 0 / 0 / 1 (R76: la 1.ª recogida parcial crea el job del debounce; las siguientes lo mueven, sin duplicarlo) |
| 1 | −6 | Pulsa «Sincronizar» con 4 de 7 recogidas (57 %) | 1 / 1 / 0 | 0 / 0 / 0 (R64: `conflict`) |
| 1b | −5 | «Recoger todas» con las 3 restantes (s4, s5, s6) | 1 / 1 / 1 | 1 / 1 / 0 (R58: adelanta el job que ya existe, no crea otro; paga una vez, R59) |
| 2 | 5 | Sincroniza a mano, GPS a 50 m de A | 1 / 1 / 0 | 0 / 0 / 0 (R1, R46) |
| 3 | 10 | Gestiona x (sin coordenadas), GPS a 300 m | 1 / 1 / 1 | 0 / 0 / 0 (R22: la primera ruta ya existe) |
| 4 | 20 | Entrega s1 y s2 con 20 s de diferencia | 2 / 2 / 2 | 0 / 0 / 1 (R41, R44) |
| 5 | 40 | Entrega s3 **a 1,5 km de la ruta** | 1 / 1 / 1 | 0 / 0 / 1 (R51: el desvío no cuenta en automático) |
| 6 | 50 | Sincroniza a mano a 1,5 km de la ruta (quedan s4, s5, s6) | 1 / 1 / 0 | 1 / 1 / 0 (R52) |
| 7 | 60 | Entrega s5 antes que s4 (fuera de orden) | 1 / 1 / 1 | 1 / 1 / 1 (R42, en el job) |
| 8 | 80 | Entrega s4 (queda s6) | 0 / 1 / 1 | 0 / 0 / 1 (R41) |
| 9 | 85 | Sincroniza a mano a 200 m de la ruta, 1 parada | 0 / 1 / 0 | 0 / 0 / 0 (R2) |
| 10 | 100 | Entrega s6 (quedan 0) | 0 / 0 / 1 | 0 / 0 / 1 (92/R35) |
| | | **Total** | **hasta 13 / 15 / 12** | **3 / 3 / 6** |

Fuera del total: la credencial rechazada y la recuperación a mano (D21).

| # | Evento | Hoy | Nuevo |
| --- | --- | --- | --- |
| 11 | Un job recibe 401 | 5 llamadas | 1 llamada (R29) |
| 12 | Pulsa «Sincronizar» 2 min después del fallo, sin cambios ni desvío | 1 / 1 / 0 | 0 / 0 / 0 (R53: `omitida`) |
| 13 | Pulsa a los 6 min, sin otra escritura en la fila | 1 / 1 / 0 | 1 / 1 / 0 (R53) |

**Jornada B (respaldo de D25).** 7 asignadas; una nunca se recoge.

| # | Evento | Hoy | Nuevo |
| --- | --- | --- | --- |
| B1 | Recoge 6 de 7 de una en una, 1 por minuto (GPS en B) | hasta 6 / 6 / 6 | 0 / 0 / 1 (R76; no es la última) |
| B2 | Pantalla abierta, la posición en vivo llega a 400 m de B | 0 / 0 / 0 | 0 / 0 / 0 |
| B3 | La posición en vivo pasa de 1000 m de B | 0 / 0 / 0 | 1 / 1 / 0 (R62, `salida`) |
| B4 | Otra lectura a 1,5 km, o se recarga la página | 0 / 0 / 0 | 0 / 0 / 0 (R63, R66) |
| | **Total** | **hasta 6 / 6 / 6** | **1 / 1 / 1** |

Nota B1 (D30): el job del debounce de B1 vence después de que B3 ya calculó la ruta, así que la
guarda 92/R20 lo descarta (`obsoleta`) y no paga nada. Si el mensajero se quedara quieto más de
10 min, pagaría ese job (`primera_ruta_debounce_recogida`) en lugar de B3, y la salida ya no
aplicaría (R63). En los dos casos es una sola llamada.

Variantes de B que cubre el test (sin fila propia). Cada una suma 1 job (el de R76) y 0 llamadas
facturadas respecto a la revisión 4 original:
- primera gestión antes de alejarse → 1 / 1 / 2 (R59 paga; el job de R76 sale `obsoleta`);
- botón con 6 de 7 recogidas (86 %) → 1 / 1 / 1 (R64 paga; el job de R76 sale `obsoleta`);
- botón con 5 de 7 recogidas (71 %) → `conflict` con «llevas 5 de 7», 0 / 0 / 1 (el job viene de
  las recogidas parciales, R76).

Notas:
- **«Hasta» en «Hoy».** Con recogidas espaciadas, cada una cae en una ventana de debounce distinta.
  Pero la guarda 92/R20 descarta el job creado antes del último `calculada_at`, así que cuántas se
  pagan depende de cuándo pase el cron. Es una cota superior leída del código, no medida. El test
  afirma solo «Nuevo».
- **Por qué importa el número de envíos.** Route Optimization factura **por envío** (D23): cada
  llamada de la fila 0 de «Hoy» cobra todas las paradas recogidas hasta ese momento (1+2+3+4). La
  tabla cuenta llamadas (D10). El ahorro en dinero de la carga en bodega crece con el cuadrado de
  los paquetes, no linealmente.
- **Fila 5.** Se le añadió el desvío a propósito, para que la tabla afirme D24. Con las reglas de la
  revisión 3, el job de esa entrega reoptimizaba por desvío y costaba 1 / 1 / 1.
- **Filas 0, 1 y 1b.** La primera ruta del día. Con D23/D25, las 7 recogidas cuestan una sola
  optimización (la de 1b), en vez de una por ventana de debounce. Con D29/R76 (D30), el único job
  del día nace en la fila 0, con la primera recogida parcial, y 1b solo lo adelanta: por eso el job
  cuenta en la fila 0 y no en la 1b. El total de A no cambia.

### 8.1 Revisión 3 (historia; ya no la afirma ningún test)

Test `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts`. Dobles en memoria de
`IRutaOptimizadaRepository` (con tramos y `reducirSecuencia`), `ParadasRepo` e `IJobRepository` (con
`ON CONFLICT (dedupe_key) DO NOTHING`); **espías** sobre `IRouteOptimizationClient.optimizar`
(= `optimizeTours`) e `IRoutesClient.trazar` (= `computeRoutes`). El doble de Routes devuelve tramos
rectos entre los puntos pedidos, que bastan para medir la desviación. Reloj inyectado. Cada job se
ejecuta con `service.ejecutar(id, { motivo: "debounce", jobCreatedAt })` al vencer su `runAfter`; cada
gestión llama al helper de encolado (con el flag de coordenadas) y luego a `reducirSinLlamadas`. El
doble del optimizador devuelve siempre el orden s1…s6 (o el de las restantes).

Un mensajero, paradas s1…s6 con coordenadas + 1 sin coordenadas. Umbral 1000 m.

| # | t (min) | Evento | Hoy: opt / routes / jobs | Nuevo: opt / routes / jobs |
| --- | --- | --- | --- | --- |
| 1 | 0 | Recoge las 7 (GPS en A) | 1 / 1 / 1 | 1 / 1 / 1 |
| 2 | 5 | Sincroniza a mano, GPS a 50 m de A | 1 / 1 / 0 | 0 / 0 / 0 |
| 3 | 10 | Gestiona la orden sin coordenadas, GPS a 300 m, sobre la ruta | 1 / 1 / 1 | 0 / 0 / 0 |
| 4 | 20 | Entrega s1 y s2 con 20 s de diferencia (misma ventana) | 2 / 2 / 2 | 0 / 0 / 1 |
| 5 | 40 | Entrega s3 | 1 / 1 / 1 | 0 / 0 / 1 |
| 6 | 50 | Sincroniza a mano a 1,5 km de la ruta (quedan s4, s5, s6) | 1 / 1 / 0 | 1 / 1 / 0 |
| 7 | 60 | Entrega s5 antes que s4 (fuera de orden) | 1 / 1 / 1 | **1 / 1 / 1** (rev. 3; era 0 / 1 / 1) |
| 8 | 80 | Entrega s4 (queda s6) | 0 / 1 / 1 | 0 / 0 / 1 |
| 9 | 85 | Sincroniza a mano a 200 m de la ruta, 1 parada | 0 / 1 / 0 | 0 / 0 / 0 |
| 10 | 100 | Entrega s6 (quedan 0) | 0 / 0 / 1 | 0 / 0 / 1 |
| | | **Total** | **8 / 10 / 8** | **3 / 3 / 6** (rev. 3; era 2 / 3 / 6) |
| 11 | — | Un job recibe 401 | 5 llamadas | 1 llamada |

Cómo sale «Nuevo» fila a fila (revisión 3):
- **Filas 2, 3 y 9:** R1/R2 (no desviado). Las filas 2 y 9 son manuales: además no escriben el origen (R46).
- **Filas 4, 5 y 8:** reducción en orden en la petición (R41, R13, R44). Sus jobs corren después y no
  llaman a nadie.
- **Fila 6:** desviado (R19).
- **Fila 7:** fuera de orden (R42). En la petición, `reducirSinLlamadas` no hace nada. El job
  recalcula s4, s6 desde la posición del mensajero: 1 `optimizeTours` + 1 `computeRoutes`.
- **Fila 8:** la secuencia de la fila 7 es s4, s6 y s4 es la siguiente, así que es prefijo. El tramo
  que llega a s6 es el que guardó la re-sincronización de la fila 7.
- **Fila 10:** R35 de la 92.

Ahorro frente a «Hoy»: 5 `optimizeTours`, 7 `computeRoutes` y 2 jobs menos.

⚠️ **La columna «Hoy» está calculada leyendo el código, no medida.** La task **T0.1** ejecuta el
escenario contra `dev` antes de tocar nada y pega el resultado en `progress/impl_SLT-59.md`; si
difiere, se corrige la tabla con la medición al lado. El test que queda en el repo afirma **solo**
«Nuevo».

---

## 9. Alternativas descartadas

- **A1 — Medir la desviación contra el origen del último cálculo** (revisión 1, con migración de
  `calculo_origen_lat/lng`). Paga en cuanto el mensajero avanza 1 km por su propia ruta (§2.1). Además
  añade dos columnas. Descartada.
- **A2 — Rellenar el tramo puente con línea recta (gratis).** Mezcla un segmento recto en un trazado
  marcado `routes`, que la UI pinta como calles (`polilinea.ts:7-14`). Descartada (P8).
- **A3 — Comparar el conjunto con la huella.** La huella mezcla el origen: cualquier GPS nuevo la
  cambia, y ese es el defecto que motivó la ficha. `secuenciaPorOrden` da el conjunto exacto.
- **A4 — Ante 401/403, completar el job sin lanzar.** Corta los reintentos pero vuelve invisible el
  rechazo en la cola; la 92 eligió «un dead-letter VISIBLE» (`OptimizacionRutaService.ts:415-416`).
- **A5 — Reutilizar `JobDescartado`.** Exige un `ModuloApagable` y deja el job `descartado`
  («módulo apagado»): mentiría sobre la causa.
- **A6 — Hacer la reducción dentro de la transacción de la gestión.** Metería en el repositorio la
  decisión de la guarda (lógica de negocio, `docs/architecture.md > Repository`) y alargaría el
  candado de la fila de `orden` con decodificación de polilíneas.
- **A7 — Inyectar la reducción en `MisAsignacionesService`.** Es una dependencia requerida más en un
  constructor que montan 12 archivos de test (`tests/unit/services/mis-asignaciones-*.test.ts`), y el
  repo evita las dependencias opcionales ahí (comentario de `historial`, `:178-181`). La Server Action
  ya es el punto que orquesta servicios y ya tiene `deps` inyectables. Se elige la action.
- **A8 — Hacer el tramo puente de R14 dentro de la petición del mensajero.** Añade hasta 20 s
  (`ROUTE_OPT_TIMEOUT_MS`) a registrar una entrega. Va al job. (Revisión 3: el mismo argumento
  manda la re-sincronización de R42 al job y no a la petición.)
- **A9 — Conservar el tramo puente (D14) para la entrega fuera de orden.** Cuesta 1 `computeRoutes` en
  vez de 1 + 1. Pero conserva el orden previo y el tramo que sale del origen viejo. Tras entregar
  primero la s3, el mapa seguiría trazando origen → s1 → s2, cuando desde la s3 quizá conviene la s2
  primero. Descartada por el humano (D16).
- **A10 — Guardar siempre la ubicación del botón, pero en columnas de «última posición» separadas del
  origen del cálculo.** Conserva 92/R23 entero y cumple R6. Exige migración, y R40 la prohíbe.
  Descartada. La ubicación descartada al omitir no se pierde del todo: la próxima gestión o recogida
  la vuelve a guardar (`registrarUbicacion`).
- **A11 — Ante `reduccion_descartada`, reintentar la decisión o reoptimizar en el acto (m3).** Quien
  cambió la huella fue otra escritura (una reoptimización o la reducción de la petición), y esa ya
  dejó la ruta al día para su conjunto. Repetir pagaría o competiría con ella. Basta con informar con
  otra razón (R49). Si el estado quedó desfasado, lo cubre el siguiente evento, como ya declara §3.1.
- **A12 — Detectar la salida en el servidor con las escrituras de GPS que ya existen.** Entre la última
  recogida y la primera gestión, el servidor no recibe ninguna posición (§12.6). Ese disparo solo
  coincidiría con la gestión y el botón, que ya disparan por su cuenta. Descartada: no detecta nada.
- **A13 — Que el navegador envíe la posición periódicamente al servidor.** Necesita un endpoint, una
  escritura cada N segundos por mensajero y una política de retención de PII. Para una sola decisión
  al día basta el efecto de una vez del §12.6.
- **A14 — Columna `fallo_at` para el enfriamiento (D21).** Es exacta, pero R40 la prohíbe. Se usa
  `updated_at` como cota superior (R54, P12).
- **A16 — Registrar las llamadas en una tabla.** Permitiría consultar el gasto por empresa, pero exige
  una migración (R40). D27 elige los logs del servidor; el contador persistido queda para otra ficha.
  El log en los servicios en vez de en los clientes también se descarta: se perdería el reintento real
  de la petición, y un cliente nuevo que se saltara el servicio no dejaría rastro.
- **A15 — Marcar «primera ruta hecha» en una columna o en `huella_set`.** `calculada_at` contra el
  inicio del día ya lo dice sin migración. Una reducción no la mueve (R17), así que no puede fingir
  una primera ruta.

---

## 10. Requisitos de fichas anteriores que esta ficha cambia (por decisión del humano)

| Requisito previo | Qué cambia | Decisión |
| --- | --- | --- |
| 92/R19 (gestión sin delay; nunca la descarta un debounce) | La gestión pasa a debounce y comparte espacio de claves; la entrega en orden se resuelve en la petición | D2, D12 |
| Ficha 454, paso (7) de `registrarGestionPendiente` («reoptimización inmediata») | Ídem | D2 |
| 92/R36 (huella del conjunto + origen redondeado) | El criterio de «sin cambios» pasa a conjunto + desviación; la huella se conserva para las escrituras condicionadas | D1, D8 |
| 92/R15 y 265/R26 (`config_invalida` se propaga para que la cola aplique backoff) | Se propaga como fallo terminal sin backoff | D3 |
| 265, límite declarado 2 («la huella congela el orden local hasta que cambie el conjunto o el origen; la posición cambia constantemente, así que se cura sola») | Ya no se cura con el movimiento normal: solo con un cambio de conjunto o un desvío de más de 1 km | D8 |
| 92/R23 («la ubicación del navegador se persiste ANTES de cualquier guarda»), en `ejecutar` | En la sincronización manual se persiste solo si la ejecución va a recalcular; si no, se usa solo en memoria (§2.4). `registrarUbicacion` de `MisAsignacionesService` no cambia | D17 (m1) |
| Revisión 2 de esta ficha: R11, R14, R16, R27 y D14 | Retirados; los sustituyen R41-R44 | D16 |
| 92/R16-R17 (la recogida encola una reoptimización con debounce) | Solo encola el último paquete del día con la primera ruta pendiente (R57, R58) | D23, D25 |
| Traspaso de la 92/R32 de su ficha («la ruta de los dos») | Encola solo para el mensajero cuya primera ruta del día ya existe (R60) | D23 |
| Revisión 2 de esta ficha: R19, R26 | Retirados; los sustituyen R51/R52 y R57/R58/R60 | D24, D23 |
| Ficha 401, `revivirFallosConfig` («no toca `payload`») | Excepción: al revivir un geocode, el mismo `UPDATE` reescribe `payload.motivo` a `revivido_por_salud` (`jsonb_set`), como exige §13.2. El resto del `payload` no se toca | D27 (§13.2) |

En el código se **anexan** notas fechadas junto a los comentarios que citan esos requisitos; no se
reescriben.

---

## 12. Revisión 4 — primera ruta del día, desvío solo a mano, recuperación (D21-D25)

### 12.1 La decisión, completa

`decidirGuardaRuta` recibe dos entradas nuevas, ya cargadas o baratas:
- `disparo: "manual" | "automatico" | "salida"`. Se deriva de `opts.motivo`: `manual` → manual;
  `salida` → salida; el resto → automático.
- `ahora` y `config` (umbral, enfriamiento).

Lo de la primera ruta y el porcentaje lo deciden guardas propias, **antes** que ella (§12.3, §12.5).

```
si ruta === null o primeraPendiente                     -> reoptimizar (sin_ruta | primera_del_dia)   R59
si ruta.estado !== "vigente":
    si disparo === "automatico"                          -> reoptimizar (R7, sin cambio)
    si hay paradas nuevas / fuera de orden / desviado    -> reoptimizar (sin enfriamiento)
    si ahora - ruta.actualizadaAt >= ENFRIAMIENTO        -> reoptimizar (recuperacion)            R53
    si no                                                -> omitir (enfriamiento)                 R53
si actual ⊄ previa                                       -> reoptimizar (R20)
si no es prefijo                                         -> reoptimizar (R42, R43)
si disparo === "manual" y desviado                       -> reoptimizar (R52; R47 polilínea vacía)
si actual == previa                                      -> omitir (R1, R2)
si no                                                    -> reducir (R41; en manual, R56)
```

- **El desvío solo se calcula con `disparo === "manual"`** (R51). En automático ni se decodifica la
  polilínea, que además ahorra CPU. `reducirSinLlamadas` es automático.
- **`omitir (enfriamiento)`** devuelve `{ status: "omitida", razon: "enfriamiento", trazado? }` con el
  trazado en caché. No escribe nada, ni siquiera el origen (R46). La acción ya lo traduce a
  `ok/omitida` (R45). No hace falta mensaje nuevo: el aviso persistente «El orden mostrado no está
  actualizado» ya está en pantalla, porque la ruta está `desactualizada`.
- **`primeraPendiente`** (glosario): `ruta.calculadaAt === null || ruta.calculadaAt <
  inicioDelDia(ahora)`. Es puro sobre `ruta`, sin lecturas (R67). El instante de inicio del día se
  calcula con el helper de timestamps del repo (🔎 `lib/utils/fecha-cr.ts`: `inicioDelDiaCREnUtc`
  para timestamps, NO `startOfDayCR`, que es para columnas `date`. Lo vigilan guardias de la ficha
  166). No se escribe ningún literal de país nuevo: se reutiliza el helper.
- **`ruta.actualizadaAt`**: `RutaOptimizadaDTO` gana `actualizadaAt: Date` (de `updated_at`, que ya se
  lee en la fila; solo hay que mapearlo). Es la cota de R54 (P12).

### 12.2 Recogida (R57, R58)

En `GestionOrdenRepository.recogerLote` (🔎 `:720-737`), la llamada incondicional a
`encolarOptimizacionDebounce` pasa a estar condicionada, con **una** consulta dentro de la misma
transacción, después del `UPDATE … RETURNING`:

```sql
SELECT
  EXISTS (SELECT 1 FROM orden
          WHERE mensajero_asignado_id = $m AND estatus_id = $porRecoger AND deleted_at IS NULL
            AND (fecha_reparto IS NULL OR fecha_reparto <= $dia::date)) AS quedan_por_recoger,
  (SELECT calculada_at FROM ruta_optimizada WHERE mensajero_id = $m)  AS calculada_at
```

- El predicado de día es **el mismo literal** que el `UPDATE` de arriba (glosario, «Día en curso»).
- Se encola solo si `NOT quedan_por_recoger` y la primera ruta está pendiente (`calculada_at` nula o
  anterior al inicio del día).
- «Recoger todas» es una sola transacción, así que hay un solo job. Dos lotes seguidos que vacían
  `por_recoger` comparten la ventana de debounce (92/R17).
- Corre dentro de la transacción con la empresa fijada (RLS + extensión), igual que el `UPDATE`.

> **[2026-10-31, SLT-59, D29] Debounce deslizante (R76, R77).** Con la misma consulta de arriba:
> si `quedan_por_recoger` y la primera ruta está pendiente, la recogida deja o mueve un job con
> `runAfter = ahora + RUTA_PRIMERA_DEBOUNCE_MIN` y `origen = recogida_parcial`; si no quedan, el mismo
> job pasa a `ahora + RUTA_DEBOUNCE_S` con `origen = recogida` (R58).
>
> **La cola hoy no lo soporta.** `JobRepository.enqueue` hace `ON CONFLICT ("dedupe_key") DO NOTHING`,
> y la clave de debounce (`dedupeKeyDebounce`) es por ventana de `runAfter`: una recogida posterior cae
> en otra clave (job nuevo) o no hace nada (no mueve el `runAfter`).
>
> **La vía más barata y correcta, sin migración (R40):**
> - Una clave por mensajero y día: `ruta-opt:primera-recogida:<mensajeroId>:<díaCR>`.
> - Un método nuevo, `JobRepository.encolarOMoverPendiente(opts)`. Es el mismo `INSERT` con
>   `ON CONFLICT ("dedupe_key") WHERE "dedupe_key" IS NOT NULL DO UPDATE SET "run_after" =
>   EXCLUDED."run_after", "payload" = EXCLUDED."payload", "updated_at" = CURRENT_TIMESTAMP
>   WHERE "jobs"."estado" = 'pending'`. Usa el índice único parcial que ya existe.
> - El `WHERE … 'pending'` da R77 gratis: el índice único no está acotado por estado, así que una fila
>   del día ya en curso, hecha o muerta bloquea crear otro job y no se modifica. Es la única vez al día
>   (R66).
> - El `payload.origen` lo fija la ÚLTIMA recogida (`recogida_parcial` → `recogida` si fue la última).
>   Es una excepción acotada a D28: el job sigue siendo uno solo y el motivo dice por qué corrió.
> - Config: `RUTA_PRIMERA_DEBOUNCE_MIN` (10, «D29, humano 2026-10-31; no calibrado»; entero ≥ 1, fuera
>   de rango → default), con el mismo patrón de §5.
> - El drenado no cambia: un job con `run_after` futuro no se reclama.
>
> Si la recogida llega mientras el job está `running`, no se crea otro. El job toma el conjunto que
> lee al ejecutar, y lo que falte lo cubren los respaldos de D25.

### 12.3 Gestión (R59)

En `registrarGestionPendiente`, el paso (7) encola si la orden tiene coordenadas **o** si la primera
ruta del día está pendiente. Para saberlo, la re-lectura de gestionable (§3.1, que ya trae
`tiene_coordenadas`) añade una subconsulta escalar con `ruta_optimizada.calculada_at` del mensajero.
Es la misma sentencia: cero viajes nuevos.

El job resultante llega a `ejecutar` con `motivo: "debounce"`. `primeraPendiente` → reoptimizar
(R59). Con 0 o 1 paradas, la rama 92/R35 se encarga como hoy. Así se cubre «la primera gestión del
día» sin ningún código nuevo de disparo.

`reducirSinLlamadas` con la primera pendiente: la decisión devuelve `reoptimizar`, así que no hace
nada. Bien: no hay secuencia de hoy que reducir.

### 12.4 Traspaso y nueva asignación (R60, R61)

- **Traspaso** (🔎 `OrdenRepository.ts:4986-4993`). El bucle por `[origen, destino]` encola solo si la
  primera ruta de ese mensajero ya existe. La lectura es una `SELECT calculada_at FROM
  ruta_optimizada WHERE mensajero_id = ANY($1)` dentro de la misma transacción, para los dos a la vez.
  Motivo:
  - el destino que aún está en bodega recibe paquetes `en_reparto`, y su primera ruta saldrá por su
    gestión, su salida o su botón;
  - el origen que aún no salió no tiene secuencia de hoy que corregir.

  ⚠️ El traspaso mueve órdenes ya `en_reparto`: no cambia el conteo `por_recoger` del destino, así que
  no puede disparar R58. Es lo correcto: el mensajero no recogió nada.
- **Nueva asignación.** 🔎 No encola hoy. La orden nace `por_recoger`, que no es parada. R61 solo
  añade un test que lo fija.

  Consecuencia que conviene saber: una asignación nueva **durante** la carga hace que «el último
  paquete» llegue más tarde (R58 se evalúa en cada recogida). Una asignación **después** de la primera
  ruta no dispara nada hasta que la recoja. La recogida, con la primera ruta ya calculada, no encola
  (R57), y la parada nueva entra por el siguiente job de gestión (R20) o por el botón.

### 12.5 Botón con la primera ruta pendiente (R64)

Guarda nueva en `ejecutar`, solo con `motivo === "manual"`. Va **después** de 92/R20 y 92/R34 (que
no aplican: `calculada_at` es de ayer o nula) y **antes** de leer paradas:

1. Si `primeraPendiente(ruta)`, se lee `paradasRepo.contarAsignadasDelDia(mensajeroId, dia)` →
   `{ asignadas, recogidas }`. Es un método nuevo en `ParadasRepo` y en `OrdenRepository`: una
   consulta de conteo con el predicado del glosario (R67: una lectura, solo en este caso).
2. Si `recogidas * 100 < asignadas * RUTA_PRIMERA_MIN_RECOGIDO_PCT`, devuelve `{ status: "omitida",
   razon: "recogida_insuficiente", recogidas, asignadas }`, sin escribir (tampoco el origen, R46).
   La comparación es entera, sin redondeos. Con `asignadas = 0` no corta (no hay nada que esperar).
3. Si no, sigue. La decisión de §12.1 devuelve `primera_del_dia` → recalcula con lo recogido.

**Acción** (`sincronizarRuta`): `razon === "recogida_insuficiente"` → `{ status: "conflict", motivo:
"Todavía no se calcula la ruta: recoge al menos el ${pct} % de tus paquetes (llevas ${recogidas} de
${asignadas})." }`.
- Reutiliza la forma `conflict` que ya existe. El botón ya hace `toast.warning(result.motivo)`, así
  que **la UI no cambia**.
- Es un texto nuevo, pero viaja en el resultado. El componente no se toca.
- El porcentaje sale de la config (R55), no de un literal.

### 12.6 Disparo de salida (R62, R63) — el único toque de frontend

🔎 **Qué hay hoy:**
- el servidor solo recibe la posición del mensajero en la recogida, en la gestión y en el botón
  (`registrarUbicacion`, `ejecutar`);
- la posición en vivo (`useSeguimientoUbicacion`, `watchPosition`) vive solo en el navegador y no se
  envía a ningún sitio.

Así que no existe ninguna escritura de GPS que avise de «ya salió» antes de la primera gestión. El
disparo más barato y correcto es el navegador, que ya tiene la posición en vivo sin coste.

**Datos nuevos para la pantalla.** `RutaResumenDTO` (`IMisAsignacionesService`, el objeto `ruta` que ya
llega a `RepartoModule`) gana dos campos, calculados en `MisAsignacionesService` desde la `ruta` que
ya lee (cero lecturas nuevas):
- `primeraRutaPendiente: boolean`;
- `puntoRecogida: { lat, lng } | null`, con la regla del glosario: `origenFuente === "gps"` y
  `origenAt` dentro del día. Es la posición del propio mensajero, que ya se le muestra como origen.

**Cliente** (`RepartoModule`). Un `useEffect` sobre `ubicacionVivo` dispara una sola vez por montaje
(con un `useRef` de «ya disparado»):
1. si `ruta.primeraRutaPendiente && ruta.puntoRecogida && hayParadasConCoordenadas`, y
2. `distanciaHaversineKm(ubicacionVivo, puntoRecogida) * 1000 > umbral`,
3. llama a una Server Action nueva, `calcularRutaAlSalir({ ubicacion })`, en `lib/actions/ruta-mensajero.ts`.

Después: si la respuesta es `ok`, hace `router.refresh()` y `onTrazado`; si es otra cosa, nada, sin
toast. El umbral llega como prop desde el Server Component (🔎 `app/(app)/mis-asignaciones/reparto/page.tsx`,
que lee la config); no hay segundo literal.

- No pide permiso nuevo. Si no hay seguimiento en vivo (permiso no concedido), no hay salida
  automática, y quedan la gestión y el botón (R62: «sin pedir ninguna acción ni permiso nuevo»).
- **R65:** mientras esté pendiente, la pantalla es la de hoy sin ruta: marcadores sin número,
  «Pendiente de optimizar» y el aviso de R30. No se cambia nada.

**Servidor** (`calcularRutaAlSalir`):
- mismo patrón que `sincronizarRuta`: actor, rol `mensajero`, zod con el mismo esquema de ubicación;
- llama a `service.ejecutar(id, { motivo: "salida", ubicacion })`.

En `ejecutar`, con `motivo === "salida"` y antes de leer paradas, se comprueba (R63):
- `primeraPendiente(ruta)`;
- que hay punto de recogida en `ruta` (antes de aplicar la vista de §2.4);
- que la distancia de `ubicacion` a ese punto supera `RUTA_REOPT_DISTANCIA_M`;
- con la ruta `desactualizada`, el enfriamiento de R53.

Si algo falla → `{ status: "omitida", razon: "salida_no_aplica" }`, 0 llamadas, sin escribir. Si
todo pasa, sigue como un recálculo: la vista de §2.4 con la ubicación recibida y `upsertOrigen` justo
antes de llamar. La acción traduce:
- `ok` → `{ status: "ok", … }`;
- cualquier `omitida` → `{ status: "ok", omitida: true }`;
- `RutaIntentoFallidoError` → `conflict`.

Reutiliza `SincronizarRutaResult`. Sin `intervalo_minimo`: lo acota R63, que solo pasa con la
primera pendiente.

**Por qué no hay bucle de pagos (R66).**
- El cliente dispara una vez por montaje.
- El servidor exige `primeraPendiente`, que deja de cumplirse en cuanto `reemplazarSecuencia` escribe
  `calculada_at` de hoy.
- Si el proveedor falla, la ruta queda `desactualizada` y `calculada_at` no se mueve. Un nuevo montaje
  podría volver a disparar, pero R63 le aplica el enfriamiento de 5 min.
- Peor caso: una llamada cada 5 min mientras la credencial falle. Y con 401/403 la cola ya corta
  (R29); este disparo no viene de la cola.

  ⚠️ Ese último punto deja un hueco: si el fallo es 401/403 permanente, el disparo de salida lo
  reintenta cada 5 min por montaje. Se acepta: es el mismo peor caso que el botón con D21.

### 12.7 Config y contratos (revisión 4)

| Qué | Cambio |
| --- | --- |
| `RouteOptimizationConfig` | + `RUTA_RECUPERACION_ENFRIAMIENTO_MIN` (5, «D21, humano 2026-10-30; no calibrado»), + `RUTA_PRIMERA_MIN_RECOGIDO_PCT` (80, «D25»; 1-100, fuera de rango → default) |
| `MotivoOptimizacion` | + `"salida"` |
| `EjecutarOptimizacionResult.omitida.razon` | + `"enfriamiento"`, `"recogida_insuficiente"` (con `recogidas`, `asignadas`), `"salida_no_aplica"` |
| `DecisionGuardaRuta` | entrada + `disparo`, `ahora`, `enfriamientoMin`; `motivo` + `"primera_del_dia"`, `"recuperacion"`; `tipo` + omitir por enfriamiento |
| `RutaOptimizadaDTO` | + `actualizadaAt` |
| `ParadasRepo` / `OrdenRepository` | + `contarAsignadasDelDia(mensajeroId, dia)` |
| `RutaResumenDTO` (`IMisAsignacionesService`) | + `primeraRutaPendiente`, `puntoRecogida` |
| `lib/actions/ruta-mensajero.ts` | + `calcularRutaAlSalir`; `sincronizarRuta` traduce `recogida_insuficiente` a `conflict` |
| `RepartoModule.tsx` | + efecto de salida (§12.6). **Toque de frontend**, sin texto nuevo |
| `GestionOrdenRepository` | recogida condicionada (§12.2); gestión con primera pendiente (§12.3) |
| `OrdenRepository` (traspaso) | encolado condicionado (§12.4) |

Sin migración (R40). Sin dependencia nueva.

## 13. Revisión 5 — registro de cada llamada pagada (D27; R68-R75)

### 13.0 Pieza común

Archivo nuevo `lib/clients/registro-llamada-google.ts`, la única fuente:

```ts
export const GOOGLE_API_LOG_PREFIJO = "[google-api]";
export const GOOGLE_API_LOG_EVENTO = "google_api_llamada";
export type ApiGoogle = "route_optimization" | "routes" | "geocoding";
export interface ContextoLlamadaGoogle {
  motivo: MotivoLlamadaRuta | MotivoLlamadaGeocode;
  mensajeroId?: string;
  ordenId?: string;
  intento: number;
  maxIntentos: number; // 1/1 fuera de la cola (R70)
}
export function registrarLlamadaGoogle(logger, linea: {
  api: ApiGoogle;
  contexto: ContextoLlamadaGoogle;
  empresaId: string | null;
  paradas: number | null;
  resultado: "ok" | string;
}): void
// emite: `${GOOGLE_API_LOG_PREFIJO} ${JSON.stringify({ evento: GOOGLE_API_LOG_EVENTO, ... })}`
```

- **Una línea por petición HTTP facturada (R69).** La emite el cliente justo después de la respuesta o
  del fallo, en `google-route-optimization.ts`, `google-routes.ts` y `google-geocode.ts`.
- **Lo que no se registra (R72).** La petición del token OAuth no se registra, porque no se factura.
  Tampoco `FallbackRouteOptimizationClient` ni `haversine-route-optimization.ts`: no llaman a Google.
- **Reintentos (R70).** Los reintentos son de la cola, no del cliente: cada ejecución del job es una
  petición con su `intento`. El handler pasa el `intento` y el `max_intentos` de la fila del job.
  🧭 Hay que comprobar que `JobQueueService` ya entrega la fila al handler; si no, se añade al
  contrato del handler.
- **`empresaId`.** Sale del contexto de empresa activo, el mismo que SL-36 usa para elegir la
  credencial (`lib/db/contexto-empresa`). En el probador, la empresa que prueba.
- **PII (R71).** Solo ids, conteos, números de intento y el código de resultado. El `resultado` de un
  fallo es el estado HTTP o `red`/`timeout`, nunca `detalle` ni el cuerpo de la respuesta.
- **Logger.** Se reutiliza el `logger` inyectable que ya reciben los clientes y servicios (patrón
  `RutaLogger`/`GeocodeLogger`). El canal es `info`, con el mismo `console` que acaba en los logs de
  Vercel. No se escribe en base (R74).
- **Futuro.** Un contador persistido de llamadas por empresa y motivo queda como posible ficha
  aparte: necesita tabla y R40 lo prohíbe aquí.

### 13.1 Motivos de rutas (`MotivoLlamadaRuta`)

El motivo no lo decide el cliente. Lo decide el servicio con lo que ya sabe, y quien encola deja un
`origen` en el payload del job, que no es PII: `{ mensajeroId, origen: "recogida" | "gestion" |
"traspaso" }`. Con la ventana de debounce, el `origen` es el del primer evento (P13).

| Motivo | Cuándo (`decidirGuardaRuta` + disparo) |
| --- | --- |
| `primera_ruta_recogida_completa` | job, primera pendiente, `origen = recogida` (R58) |
| `primera_ruta_debounce_recogida` | job, primera pendiente, `origen = recogida_parcial` (R76, D29: 10 min sin recoger) |
| `primera_ruta_primera_gestion` | job, primera pendiente, `origen = gestion` (R59) |
| `primera_ruta_salida` | `motivo: "salida"` (R62, R63) |
| `primera_ruta_boton` | manual, primera pendiente (R64) |
| `entrega_fuera_de_orden` | job, `fuera_de_orden` (R42) |
| `paradas_nuevas_gestion` | job, `paradas_nuevas`, `origen = gestion` (añadido) |
| `paradas_nuevas_traspaso` | job, `paradas_nuevas`, `origen = traspaso` (R60) |
| `reintento_ruta_desactualizada` | job sobre una ruta `desactualizada` (R7, añadido) |
| `sincronizacion_manual_desvio` | manual, desviado (R52, R47) |
| `sincronizacion_manual_paradas` | manual, `paradas_nuevas` o `fuera_de_orden` |
| `recuperacion_ruta_caida` | manual, `desactualizada` tras el enfriamiento (R53) |
| `trayecto_vivo` | `trazarTramoVivo` (`computeRoutes`) |
| `prueba_integracion` | `optimizacion-rutas-probador.ts` |
| `job_sin_origen` | job encolado antes del despliegue, sin `origen` en el payload (añadido; solo en la transición) |

- Un recálculo produce su `optimizeTours` y su `computeRoutes` con **el mismo motivo**. La rama de una
  parada (92/R35) solo produce el `computeRoutes`.
- Si varias condiciones se cumplen a la vez, se toma la primera de la tabla de decisión de §12.1
  (primera pendiente > desactualizada > paradas nuevas > fuera de orden > desvío).

### 13.2 Motivos de geocode (`MotivoLlamadaGeocode`)

`encolarGeocodificacion` recibe `motivo` obligatorio y lo guarda en el payload: `{ ordenId, motivo
}`. El payload es `jsonb` (🔎 `schema.prisma`, `jobs.payload`), así que no hace falta migración. El
handler de geocodificación se lo pasa al cliente.

| Motivo | Quién encola (🔎) |
| --- | --- |
| `orden_creada` | creación de una orden suelta (`BulkOrdenService` → `createManyOrdenes*`; el implementer separa qué llamada es suelta, por ejemplo API, y cuál es carga) |
| `carga_masiva` | carga de archivo (`BulkOrdenService` → `createManyOrdenes*`) |
| `direccion_cambiada` | `OrdenRepository.encolarSiCambiaDireccion` (`update`, `corregirDatosCliente`) |
| `asignacion_sin_coordenadas` | `AsignabilidadCoordenadasService` (`:199`) |
| `revivido_por_salud` | `GeocodeSaludService` → `revivirFallosConfig`, que reescribe `payload.motivo` en el mismo `UPDATE` (`jsonb_set`) |
| `prueba_integracion` | `google-maps-probador.ts` (llamada directa, sin job) |
| `job_sin_motivo` | job encolado antes del despliegue, sin `motivo` (añadido; transición) |

🔎 `BulkOrdenService.ts:340/350/676` llama a `createManyOrdenesConGuia` y a `createManyOrdenes`. Qué
llamada corresponde a «orden creada» y cuál a «carga masiva» se fija leyendo sus llamadores en T8.3.
No lo invento aquí.

### 13.3 Secuencia de motivos de la jornada (R75)

Cada recálculo da dos líneas, primero `route_optimization` y luego `routes`, con el mismo motivo.

- **Jornada A (§8.0):**
  1. 1b → `primera_ruta_recogida_completa` ×2;
  2. 6 → `sincronizacion_manual_desvio` ×2;
  3. 7 → `entrega_fuera_de_orden` ×2.

  Total: 6 líneas, que cuadra con el `{3, 3, 6}` de §8.0.
- **Filas aparte:**
  - fila 11 → 1 línea con el motivo del job y `resultado: "401"`;
  - fila 12 → ninguna;
  - fila 13 → `recuperacion_ruta_caida` ×2.
- **Jornada B:** B3 → `primera_ruta_salida` ×2.
- **Variantes de B:**
  - primera gestión → `primera_ruta_primera_gestion` ×2;
  - botón con el 86 % → `primera_ruta_boton` ×2;
  - botón con el 71 % → ninguna.

## 11. Dependencias de terceros

Ninguna (R39).
