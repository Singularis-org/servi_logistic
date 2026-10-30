# SLT-59 — Reducir llamadas pagadas a Google en la optimización de ruta · design

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
| Trazado de un tramo suelto | `IRoutesClient.trazar({ origen, paradasEnOrden: [una] })` (ya lo usa `trazarTramoVivo`) | El tramo puente de R14. |

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
| 7 | 60 | Entrega s5 antes que s4 (fuera de orden, 1 hueco) | 1 / 1 / 1 | 0 / 1 / 1 |
| 8 | 80 | Entrega s4 (queda s6) | 0 / 1 / 1 | 0 / 0 / 1 |
| 9 | 85 | Sincroniza a mano a 200 m de la ruta, 1 parada | 0 / 1 / 0 | 0 / 0 / 0 |
| 10 | 100 | Entrega s6 (quedan 0) | 0 / 0 / 1 | 0 / 0 / 1 |
| | | **Total** | **8 / 10 / 8** | **2 / 3 / 6** |
| 11 | — | Un job recibe 401 | 5 llamadas | 1 llamada |

Cómo sale «Nuevo» fila a fila: 2, 3 y 9 → R1/R2 (no desviado). 4, 5 y 8 → reducción en orden en la
petición (R13, R27); sus jobs corren después y no llaman a nadie. 6 → desviado (R19). 7 → hueco s4→s6
(R14), en el job. 8 → el tramo que llega a s6 es el puente de la fila 7, guardado. 10 → R35 de la 92.

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
  (`ROUTE_OPT_TIMEOUT_MS`) a registrar una entrega. Va al job.

---

## 10. Requisitos de fichas anteriores que esta ficha cambia (por decisión del humano)

| Requisito previo | Qué cambia | Decisión |
| --- | --- | --- |
| 92/R19 (gestión sin delay; nunca la descarta un debounce) | La gestión pasa a debounce y comparte espacio de claves; la entrega en orden se resuelve en la petición | D2, D12 |
| Ficha 454, paso (7) de `registrarGestionPendiente` («reoptimización inmediata») | Ídem | D2 |
| 92/R36 (huella del conjunto + origen redondeado) | El criterio de «sin cambios» pasa a conjunto + desviación; la huella se conserva para las escrituras condicionadas | D1, D8 |
| 92/R15 y 265/R26 (`config_invalida` se propaga para que la cola aplique backoff) | Se propaga como fallo terminal sin backoff | D3 |
| 265, límite declarado 2 («la huella congela el orden local hasta que cambie el conjunto o el origen; la posición cambia constantemente, así que se cura sola») | Ya no se cura con el movimiento normal: solo con un cambio de conjunto o un desvío de más de 1 km | D8 |

En el código se **anexan** notas fechadas junto a los comentarios que citan esos requisitos; no se
reescriben.

---

## 11. Dependencias de terceros

Ninguna (R39).
