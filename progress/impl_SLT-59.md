# impl SLT-59 — Reducir llamadas pagadas a Google en la optimización de ruta

## Tanda 1 — backend_dev: T0.1, T0.2, T1.1, T1.2, T1.3 (2026-10-29)

Entorno: el worktree no tenía `node_modules`; se enlazó por junction al del checkout principal
(mismo `pnpm-lock.yaml`, como los demás worktrees). Sin instalar nada. Sin `.env` ni base: ningún
test de esta tanda necesita Postgres (ver «Desviaciones»).

### T0.1 — jornada de referencia, columna «Hoy» MEDIDA

Comando (el `--silent=false` hace visible el informe que el test escribe por consola):

```
pnpm exec vitest run tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts --reporter=verbose --silent=false
```

Medido contra el código anterior a SLT-59 (`OptimizacionRutaService`, handler, `JobQueueService` y
helpers de encolado reales; gestión = `encolarOptimizacionInmediata` como hoy, sin
`reducirSinLlamadas`):

| # | t (min) | Evento | Hoy medido: opt / routes / jobs | Tabla design §8 |
| --- | --- | --- | --- | --- |
| 1 | 0 | Recoge las 7 (GPS en A) | 1 / 1 / 1 | 1 / 1 / 1 |
| 2 | 5 | Sincroniza a mano, GPS a 50 m de A | 1 / 1 / 0 | 1 / 1 / 0 |
| 3 | 10 | Gestiona la orden sin coordenadas, GPS a 300 m, sobre la ruta | 1 / 1 / 1 | 1 / 1 / 1 |
| 4 | 20 | Entrega s1 y s2 con 20 s de diferencia | 2 / 2 / 2 | 2 / 2 / 2 |
| 5 | 40 | Entrega s3 | 1 / 1 / 1 | 1 / 1 / 1 |
| 6 | 50 | Sincroniza a mano a 1,5 km de la ruta | 1 / 1 / 0 | 1 / 1 / 0 |
| 7 | 60 | Entrega s5 antes que s4 | 1 / 1 / 1 | 1 / 1 / 1 |
| 8 | 80 | Entrega s4 (queda s6) | 0 / 1 / 1 | 0 / 1 / 1 |
| 9 | 85 | Sincroniza a mano a 200 m, 1 parada | 0 / 1 / 0 | 0 / 1 / 0 |
| 10 | 100 | Entrega s6 (quedan 0) | 0 / 0 / 1 | 0 / 0 / 1 |
| | | **Total** | **8 / 10 / 8** | **8 / 10 / 8** |
| 11 | — | Un job recibe 401 | 5 llamadas (job `failed`, 5/5 intentos) | 5 llamadas |

Salida literal del test:

```
[SLT-59 T0.1] jornada de referencia — columna «Hoy» MEDIDA (opt / routes / jobs):
  1. t=0 min — Recoge las 7 (GPS en A): 1 / 1 / 1
  2. t=5 min — Sincroniza a mano, GPS a 50 m de A: 1 / 1 / 0
  3. t=10 min — Gestiona la orden sin coordenadas, GPS a 300 m, sobre la ruta: 1 / 1 / 1
  4. t=20 min — Entrega s1 y s2 con 20 s de diferencia (misma ventana): 2 / 2 / 2
  5. t=40 min — Entrega s3: 1 / 1 / 1
  6. t=50 min — Sincroniza a mano a 1,5 km de la ruta (quedan s4, s5, s6): 1 / 1 / 0
  7. t=60 min — Entrega s5 antes que s4 (fuera de orden, 1 hueco): 1 / 1 / 1
  8. t=80 min — Entrega s4 (queda s6): 0 / 1 / 1
  9. t=85 min — Sincroniza a mano a 200 m de la ruta, 1 parada: 0 / 1 / 0
  10. t=100 min — Entrega s6 (quedan 0): 0 / 0 / 1
  Total: 8 / 10 / 8
  11. Un job recibe 401: 5 llamadas (job failed, intentos 5/5)
```

**Coincide fila a fila con la tabla de `design.md` §8: la tabla NO se corrige.**

El test queda verde: el de «Hoy» reporta los conteos y afirma solo que el arnés recorrió la jornada
(10 filas, secuencia final vacía, cola vacía, la orden sin coordenadas nunca va al proveedor, el job
del 401 acaba `failed`). «Nuevo» queda como `it.todo` para T5.1. **Aviso para T3.2/T5.1:** la
variante `gestionHoy` importa `encolarOptimizacionInmediata`; al retirarlo en T3.2 hay que borrar
esa variante y su `it` (la medición queda aquí).

### T0.2 — describe «265/R33 — las guardas cortan EN ESTE ORDEN»

```
pnpm exec vitest run tests/unit/services/optimizacion-ruta-service.test.ts -t "265/R33"
 Test Files  1 passed (1)
      Tests  4 passed | 36 skipped (40)
```

Verde los 4: R20 antes que R34; R34 antes que R35 (sin leer la base); R35 antes que R36; el recorte
R38 antes de la guarda del origen (265/R16).

### Archivos

Creados:
- `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts` (T0.1)
- `progress/impl_SLT-59.md`

Modificados:
- `lib/geo/polilinea.ts` — `distanciaMinimaAPolilineaM` (T1.1)
- `lib/config/route-optimization.ts` — `RUTA_REOPT_DISTANCIA_M` (1000) y `RUTA_OPT_MAX_INTENTOS` (3) con su nota (T1.2)
- `lib/services/jobs/optimizacion-ruta-handler.ts` — el `optlog` de la config añade los dos valores (design §5)
- `lib/interfaces/repositories/IRutaOptimizadaRepository.ts` — `ReduccionSecuencia` + `reducirSecuencia` (T1.3)
- `lib/repositories/RutaOptimizadaRepository.ts` — `reducirSecuencia` (T1.3)
- `tests/unit/geo/polilinea.test.ts`, `tests/unit/config/route-optimization-config.test.ts`,
  `tests/integration/repositories/ruta-optimizada-repo.test.ts` — casos nuevos
- Dobles que implementan los contratos ampliados (solo para que compilen, sin cambiar lo que prueban):
  `reducirSecuencia` en el doble de rutas de `integraciones-consumidores-composition-root`,
  `optimizacion-ruta-{degradacion,origen,service,tramo-vivo,trazado}.test.ts`, y los dos campos
  nuevos en el `CONFIG` literal de esos cinco `optimizacion-ruta-*`.

### Mapa R<n> → test (lo cubierto en esta tanda)

| Req | Test |
| --- | --- |
| R3, R4 (geometría) | `tests/unit/geo/polilinea.test.ts` › «SLT-59 — distanciaMinimaAPolilineaM» (8 casos) |
| R12, R17 | `tests/integration/repositories/ruta-optimizada-repo.test.ts` › «R12/R17: calculada_at, origen, secuencia_fuente, ultimo_error y estado quedan intactos» |
| R18 | ídem › «R18: con la huella cambiada no escribe NADA y devuelve false, sin lanzar» |
| R11/R13/R15 (persistencia) | ídem › 1..n con tramos; parada sin tramo; sin trazado limpia las 4 columnas; una transacción |
| R36 | `tests/unit/config/route-optimization-config.test.ts` › «SLT-59/R36 — …» (default, override, vacía, no numérica, cero, negativa, NaN, para los dos campos) |
| R38 | ídem › «SLT-59/R38 — RUTA_SYNC_MIN_INTERVALO_S sigue en 10…» y «…tope de intentos de la geocodificacion…» |
| R37 | `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts` (medición «Hoy»; las aserciones «Nuevo» son T5.1) |
| R8 | `optimizacion-ruta-service.test.ts` › «265/R33…» verde (T0.2) |

### Verificación

- `pnpm run typecheck` → `tsc --noEmit`, exit 0, sin errores.
- `pnpm run lint` → `0 errors, 230 warnings` (todas preexistentes); `eslint` sobre los archivos
  tocados: sin salida.
- `pnpm exec vitest run` de los 4 archivos de test nuevos/ampliados: polilinea + config 50/50,
  repo 26/26, jornada 1 passed + 1 todo.
- `pnpm exec vitest related --run <los 15 archivos tocados>` (arrastra todo lo que importa la
  config de ruta, por eso es grande):
  ```
   Test Files  467 passed | 201 skipped (668)
        Tests  6583 passed | 1536 skipped | 1 todo (8120)
  ```
  Los 201 archivos saltados son los de `tests/integration/db/` sin `DATABASE_URL` (este worktree no
  tiene base); ninguno es de esta tanda. 0 fallos.

### Desviaciones y avisos

- `ruta-optimizada-repo.test.ts` usa Prisma **doblado** (patrón del archivo: «la suite NO levanta
  Postgres»), así que los casos de T1.3 no necesitan `DATABASE_URL` y no se saltan. No hay un test
  contra Postgres real del `WHERE huella_set` de `reducirSecuencia`; ni tasks.md ni design lo piden y
  no existe uno para `guardarTrazado` (misma condición). Si se quiere, va en `tests/integration/db/`.
- `distanciaMinimaAPolilineaM` con 0 vértices devuelve `+Infinity` (mínimo de un conjunto vacío).
  Qué hace la guarda en ese caso (línea de referencia vacía, p. ej. polilínea corrupta) lo decide
  T2.1; con `+Infinity` y la comparación `>` del design saldría «desviado» → reoptimizar.
- La firma de `reducirSecuencia` usa un tipo con nombre (`ReduccionSecuencia`) con la misma forma
  que el literal del design §1.

**Veredicto:** T0.1, T0.2, T1.1, T1.2 y T1.3 hechos y en verde; «Hoy» medido = tabla del design (8/10/8, 401 → 5).

---

## Tanda 2 — Fase 2 — backend_dev: T2.1, T2.2, T2.3, T2.4, T2.5 (2026-10-29)

MCP del grafo no consultado en esta tanda: el design ya declara que este worktree no está indexado;
todo con Grep/Read.

### Archivos

Creados:
- `tests/unit/services/optimizacion-ruta-desvio.test.ts` (T2.1, T2.2) — 29 tests
- `tests/unit/services/optimizacion-ruta-reduccion.test.ts` (T2.3, T2.4) — 26 tests

Modificados:
- `lib/services/OptimizacionRutaService.ts`
  - T2.1: `decidirGuardaRuta` (exportada, pura), `posicionDelMensajero` (exportada) y las privadas
    `secuenciaPrevia`, `lineaReferencia`, `planificarReduccion`, `trazadoConcatenado`.
  - T2.2: la guarda 92/R36 se sustituye en su sitio por `guardaSinRecalculo` en la rama de 2+
    paradas. En la rama de UNA parada, la misma guarda va ANTES de `reemplazarSecuencia`: antes se
    escribía y luego se miraba la huella, lo que movía `calculada_at` y el origen (R6). La huella se
    sigue calculando igual, porque condiciona `guardarTrazado` y `reducirSecuencia`.
  - T2.3: `aplicarReduccion` + `tramosPuente` (R11-R18). Resultado `{ omitida, razon: "reducida", trazado? }`.
  - T2.4: método público `reducirSinLlamadas(mensajeroId)`. Solo aplica R13/R15; con puente, desvío,
    paradas nuevas, ruta desactualizada o 0 paradas no hace nada.
  - T2.5: notas fechadas `[2026-10-29, SLT-59, …]` junto al «R36» de la cabecera, `ORIGEN_DECIMALES`,
    `huella()`, el comentario de `persistirTrazado` que cita R36 y el sitio de la guarda. El límite
    2 de la 265 no aparece literal en el código: su nota va en la cabecera, junto a R36.
- `lib/interfaces/services/IOptimizacionRutaService.ts` — `razon: "reducida"` y `reducirSinLlamadas`.
  La acción manual (`lib/actions/ruta-mensajero.ts`) no necesita cambio: toda `omitida` que no sea
  `intervalo_minimo` ya sale como `ok` + `omitida: true`, que la UI trata como «sin cambios»
  (design §2.2, paso 6).
- `tests/unit/services/optimizacion-ruta-service.test.ts` — ajustes con nota fechada (ver «Desviaciones»).

### Mapa R<n> → test (lo cubierto en esta tanda)

| Req | Test |
| --- | --- |
| R1 | `optimizacion-ruta-desvio.test.ts` › T2.1 «R1: mismo conjunto…» y T2.2 «R1/R6/R9: 2+ paradas…» |
| R2 | ídem › T2.2 «R2/R6/R9: UNA parada…» y «R2: UNA parada sin trazado guardado…» |
| R3 | ídem › «R3 — desviado SI Y SOLO SI…»: borde exacto `d` → no desviado, `d - 1e-6` → desviado; 990/1010 m; lejos del origen pero sobre la ruta |
| R4 | ídem › «R4 — linea de referencia»: con polilínea `routes`; sin ella, la recta; una `local` heredada cuenta como recta; con una sola parada, el punto |
| R5 | ídem › T2.1 «R5: sin posicion…», «R5: con origen `centroide`…» y T2.2 «R5: origen `centroide`…» |
| R6 | ídem › T2.2 R1/R2: `escrituras() === 0` (upsertOrigen, reemplazarSecuencia, guardarTrazado, reducirSecuencia, marcarDesactualizada, marcarTramoVivo) |
| R7 | ídem › los dos casos `desactualizada` de T2.1 y «R7…» de T2.2; `optimizacion-ruta-reduccion.test.ts` › «R7: ruta desactualizada con un subconjunto…» |
| R8 | `optimizacion-ruta-service.test.ts` › «265/R33 — las guardas cortan EN ESTE ORDEN» (4/4 en verde; «R35 antes que R36» ajustado) |
| R9 | `optimizacion-ruta-desvio.test.ts` › T2.2 R1/R2: `findByMensajero` ×1 y `findParadasEnReparto` ×1 |
| R10 | ídem › T2.1 «R10: … calculada hace 8 h -> omitir» y T2.2 «R10…» |
| R11 | ídem › T2.1 «R11: subconjunto estricto…»; `optimizacion-ruta-reduccion.test.ts` › R11/R13 |
| R12, R17 | `optimizacion-ruta-reduccion.test.ts` › «R12/R17: la reduccion no reescribe la secuencia completa…» (+ repo, tanda 1) |
| R13 | ídem › «R11/R13: entrega EN ORDEN…», «R13: si un tramo no trae distancia…», «R13: queda UNA parada…» |
| R14 | ídem › «R14: … UN hueco…», «R14: DOS huecos…», «R14: prefijo + un hueco…», «R14: sin cliente de Routes NUNCA… una recta» |
| R15 | ídem › «R15: trazado guardado que no es por calles…», «R15: falta el tramo…» |
| R16 | ídem › «R16: el tramo puente lanza / no da ok…» |
| R18 | ídem › «R18: con la huella cambiada…», «R18: sin huella previa…» (+ repo, tanda 1) |
| R19 | `optimizacion-ruta-desvio.test.ts` › los dos casos `desviado` de T2.1 y los dos «R19…» de T2.2; reducción › «R19: subconjunto con el mensajero desviado…» |
| R20 | `optimizacion-ruta-desvio.test.ts` › los dos casos `paradas_nuevas` de T2.1 y «R20…» de T2.2; reducción › «R20: quita una y anade otra…» |
| R27 (parte del servicio) | `optimizacion-ruta-reduccion.test.ts` › «SLT-59 T2.4 — reducirSinLlamadas» (8 casos). La parte de la action es T3.3. |

### Verificación (salida real)

- `pnpm run typecheck` → `tsc --noEmit`, exit 0, 0 errores.
- `pnpm run lint` → `✖ 230 problems (0 errors, 230 warnings)`: las mismas 230 de antes. `eslint`
  sobre los 5 archivos tocados: `No issues found`.
- `pnpm exec vitest run tests/unit/services/optimizacion-ruta-desvio.test.ts` → 29 passed (29).
- `pnpm exec vitest run tests/unit/services/optimizacion-ruta-reduccion.test.ts` → 26 passed (26).
- `pnpm exec vitest run tests/unit/services/optimizacion-ruta- tests/unit/actions/sincronizar-ruta.test.ts`
  → `Test Files 9 passed (9)`, `Tests 151 passed | 1 todo (152)`. Corrida hecha antes de crear los 2
  archivos nuevos. La primera corrida tras el cambio dio 10 fallos en
  `optimizacion-ruta-service.test.ts` (ver «Desviaciones»).
- `pnpm exec vitest related --run lib/services/OptimizacionRutaService.ts lib/interfaces/services/IOptimizacionRutaService.ts tests/unit/services/optimizacion-ruta-desvio.test.ts tests/unit/services/optimizacion-ruta-reduccion.test.ts tests/unit/services/optimizacion-ruta-service.test.ts`
  ```
   Test Files  30 passed | 1 skipped (31)
        Tests  516 passed | 12 skipped | 1 todo (529)
  ```
  El archivo saltado es de integración y no tiene `DATABASE_URL`. 0 fallos.

### Desviaciones y avisos

- **10 tests de `optimizacion-ruta-service.test.ts` codificaban la guarda vieja** (huella con origen).
  Se ajustaron con nota fechada `[2026-10-29, SLT-59 …]`, sin borrar sus comentarios:
  - 4 tests («R35», «R36» y «§5.4») montaban la ruta «sin cambios» solo con la huella. Ahora llevan
    también `secuenciaPorOrden`, porque el criterio es el conjunto. Las aserciones no cambian.
  - 5 tests («R27», «265/R24» y «265/R10») usaban como escenario de fallo del proveedor una ruta
    vigente con el MISMO conjunto, y con la guarda nueva ya no llegaban al proveedor. Para que sigan
    probando lo suyo, se añade una parada nueva (`o3`) o se quita `o3` de la secuencia guardada (R20).
  - «265/R33 › R35 antes que R36» es el caso que tasks.md T2.2 manda ajustar. Pasaba en vacío: con la
    secuencia guardada vacía, la guarda lo leía como paradas nuevas. Ahora la ruta lleva `{o1}` y el
    test sigue fijando que gana `sin_paradas`. La aserción `reemplazarSecuencia ×1 + secuenciaFuente
    null` pasa a «`reemplazarSecuencia` NO se llama» (R2/R6). Consecuencia: una ruta reducida a 1
    parada conserva su `secuencia_fuente` (R12) en vez de reafirmar `null`. Lo dicta el spec; lo dejo
    a la vista del reviewer.
- **Rama de una parada:** se quitó el bloque que reponía el trazado cacheado después de reescribir,
  con su comentario de 2 líneas. Con la guarda antes de la escritura ya no hay nada que reponer. El
  resto de comentarios de la 92/265 sigue intacto: `git diff -U0 | grep ^-` solo muestra ese código,
  la guarda de 2+ sustituida y el import.
- **R6 y 92/R23:** `upsertOrigen` de la ubicación recibida sigue ANTES de toda guarda (92/R23, R8).
  Leo R6 como «la guarda no escribe», así que los tests de R6 no pasan `ubicacion`.
- **R18 con `huellaSet` null en la ruta guardada:** no hay con qué condicionar la escritura. Se trata
  como huella cambiada: no escribe y no lanza. En la práctica no se alcanza, porque
  `reemplazarSecuencia` escribe la huella en toda secuencia no vacía, pero el tipo lo permite.
- **R14 con `ok` sin tramos:** si Routes da `ok` pero no trae un tramo por cada parada pedida, se
  trata como R16 (sin trazado). Nunca se inventa un tramo.
- **Jornada T0.1:** `optimizacion-ruta-ahorro-jornada.test.ts` sigue en verde, pero su variante «Hoy»
  corre ahora contra el servicio NUEVO, así que lo que imprime ya no es «Hoy». La medición válida es
  la de la tanda 1 (arriba). T5.1 la convierte en aserciones «Nuevo».

### Pregunta abierta

**PA-1 — Paradas quitadas DETRÁS de la última restante (ni prefijo ni hueco).** Ejemplo: secuencia
s1,s2,s3 y el mensajero entrega s3 primero, así que quedan s1,s2. Ningún requisito cubre el caso:
R13 exige «prefijo», R14 habla de uno o más huecos y R15 exige tramos incompletos.

Implementado provisionalmente como **R13 (concatenar, 0 llamadas)**: cada tramo es el que LLEGA a
su parada, así que ninguno se rompe. El design §2.2 razona por huecos, y D7 pide «la opción más
barata correcta». La decisión está en un solo sitio (`planificarReduccion`, `huecos.length === 0`).
Alternativas: tratarlo como R14 (1 llamada, aunque no hay puente que pedir) o como R15 (sin trazado).
No tiene test dedicado hasta que decida el humano.

**Borde de la línea vacía (tanda 1): resuelto por el orden de la guarda, salvo un subcaso.** En
`decidirGuardaRuta` el desvío se mide DESPUÉS de R20, que es el orden del design §2. Para entonces:
- toda parada actual está en la secuencia previa y tiene coordenadas;
- hay al menos una, porque 92/R35 corta con 0.

Así que la recta de R4 nunca queda vacía.

Queda **PA-2**: una polilínea `routes` persistida que decodifica a 0 puntos (cadena vacía o
corrupta). Por R4 literal la polilínea «existe» y se usa; como `+Infinity > umbral`, el mensajero
cuenta como desviado y se reoptimiza (R3). No he añadido una rama propia, porque sería inventar.
¿Se acepta así, o debe caer a la recta?

**Veredicto:** T2.1-T2.5 hechos y en verde (typecheck 0 errores, lint 0 errores, related 516 passed / 0 fallos); dos preguntas abiertas: PA-1 (provisional como R13) y PA-2 (R3 literal).

### Tanda 2 — nota del implementer (2026-10-29)

- Re-verificación del implementer (typecheck + lint + related) **detenida por el sistema por falta de
  memoria** (no es un fallo del comando); no se relanzó. La evidencia de la tanda 2 es la corrida del
  backend_dev arriba (typecheck exit 0; lint 0 errores; related 30 passed | 1 skipped, 0 fallos). El
  gate completo corre en CI.
- PA-1 (paradas quitadas detrás de la última restante) queda para el humano. Lectura del
  implementer: la definición literal de «Prefijo» (requirements, glosario) lo clasifica como «no
  prefijo» → R14, pero R14 exige una llamada «para el tramo puente» y no hay hueco que puentear. La
  implementación provisional (R13, 0 llamadas) no afecta a la jornada R37. No bloquea las fases 3-5.
- PA-2: se sigue R4 literal (la polilínea existe → +Infinity → desviado → reoptimiza). Pendiente de
  confirmación humana, no bloquea.

## Tanda 3 — Fase 3 — backend_dev: T3.1, T3.2, T3.3 (2026-10-29)

MCP del grafo no usado (el worktree no está indexado, como en tandas previas): Grep/Read.

### Archivos

- `lib/repositories/GestionOrdenRepository.ts` — T3.1: la re-lectura de gestionable añade
  `("o"."latitud" IS NOT NULL AND "o"."longitud" IS NOT NULL) AS "tiene_coordenadas"` (misma sentencia,
  bajo el candado); el paso (7) llama a `encolarOptimizacionDebounce` con `RUTA_DEBOUNCE_S` solo si
  `tiene_coordenadas`. Notas fechadas en el JSDoc (paso 7) y en el cuerpo; el texto original se conserva.
- `lib/services/jobs/optimizacion-ruta-encolado.ts` — T3.2: retirados `encolarOptimizacionInmediata`,
  `dedupeKeyInmediato` y `OPTIMIZACION_MAX_INTENTOS`; `maxIntentos` = `loadRouteOptimizationConfig().RUTA_OPT_MAX_INTENTOS`;
  nota fechada anexada al comentario §4.1 (original intacto).
- `lib/actions/mis-asignaciones.ts` — T3.3: `MisAsignacionesDeps.reducirRuta?`; `reducirRutaReal`
  (`buildOptimizacionRutaService().reducirSinLlamadas`) y `reducirRutaSinFallar` (try/catch silencioso,
  R28). `gestionar` la llama solo con `status === "ok"`, con `actor.usuarioId`.
- `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts` — doble de `prismaGestion` con
  `coordenadas`/`gestionable`; bloque 92/R19 (inmediato) sustituido por R21, R22, R23, R25, R26.
- `tests/unit/services/optimizacion-ruta-encolado.test.ts` — fuera los casos del inmediato; + R23, R24, R32.
- `tests/unit/actions/mis-asignaciones-action.test.ts` — + describe «SLT-59 R27/R28».
- `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts` — borrada la variante «Hoy»
  (`gestionHoy` + su `it`); se conserva el `it.todo` de «Nuevo» (T5.1). Nota fechada en la cabecera.
- `tests/unit/repositories/notificacion-orden-rechazada.test.ts` — el doble de la re-lectura devuelve
  `tiene_coordenadas: true` (ver Desviaciones).

`grep -r encolarOptimizacionInmediata lib/` → 0. `dedupeKeyInmediato|OPTIMIZACION_MAX_INTENTOS` en `lib/ tests/` → 0.
Sin cambios en `db/` (R40). Sin dependencias nuevas.

### Mapa R<n> → test (esta tanda)

| R | Test |
| --- | --- |
| R21 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R21» (fila con debounce y clave `:debounce:`; dentro de la tx; coordenadas en la MISMA re-lectura) |
| R22 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R22» (sin coordenadas → 0 filas, gestión registrada) |
| R23 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R23» (recogida + gestión; dos gestiones → 1 fila, runAfter de la primera); `optimizacion-ruta-encolado.test.ts` › «R23» |
| R24 | `optimizacion-ruta-encolado.test.ts` › «R24» (ventana siguiente inserta su fila con otra clave) + «R18» existente |
| R25 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R25» (no gestionable → null, 0 filas) y «R16 y SLT-59 R25 — transacción REVERTIDA» |
| R26 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R26» (recogida: payload, runAfter, clave y tx iguales) + bloques R16/R17 existentes. Traspaso (`OrdenRepository.ts:4987`) no tocado. |
| R27 | `mis-asignaciones-action.test.ts` › «SLT-59 R27/R28» (ok → 1 llamada con `usuarioId`, después de `gestionar`; conflict/forbidden/throw/validation_error → 0 llamadas) |
| R28 | `mis-asignaciones-action.test.ts` › «R28: si la reduccion lanza, la action devuelve EXACTAMENTE el mismo resultado» |
| R32 | `optimizacion-ruta-encolado.test.ts` › «R32» (default 3; override `RUTA_OPT_MAX_INTENTOS=2` → 2) |

### Verificación (salida real, NODE_OPTIONS=--max-old-space-size=8192, un comando a la vez)

- `pnpm exec vitest run tests/integration/repositories/optimizacion-ruta-enqueue.test.ts tests/unit/services/optimizacion-ruta-encolado.test.ts`
  → `Test Files 2 passed (2) · Tests 28 passed (28)`. El de integración usa Prisma doblado (patrón del
  archivo): no necesita `DATABASE_URL`, corrió (no skipped). No se tocó ninguna base.
- `pnpm exec vitest run tests/unit/actions/mis-asignaciones-action.test.ts` → `1 passed · 38 passed`
  (antes de quitar el caso `error` imposible del `it.each`; ver Desviaciones).
- `pnpm exec vitest run` de los 4 hermanos `mis-asignaciones-{causa-devolucion,evidencias,pagos,ubicacion}` → `4 passed · 40 passed`.
- `pnpm run typecheck` → exit 0 (primera corrida: 1 error de tipo en mi test, `{status:"error"}` no es
  `GestionarServiceResult`; corregido y re-corrido limpio).
- `pnpm run lint` → `✖ 234 problems (0 errors, 234 warnings)`, exit 0.
- `pnpm exec vitest related --run <7 archivos tocados>` → `Test Files 2 failed | 455 passed | 202 skipped (659) · Tests 2 failed | 6420 passed | 1536 skipped | 1 todo`.
  - `notificacion-orden-rechazada.test.ts` › R20: causado por T3.1 (el doble no devolvía
    `tiene_coordenadas` → no se encolaba → el `enqueue` que revierte la tx no corría). Arreglado en el doble.
  - `tests/components/SaldosTiendasBuscador463.test.tsx` › R45 (4581 ms): UI de wallet, sin relación con el diff; timeout bajo carga.
  - Re-corrida de esos dos archivos: `Test Files 2 passed (2) · Tests 18 passed (18)`.
  - No se re-corrió `related` completo tras el arreglo (memoria); el gate de CI lo cubre.

### Desviaciones y avisos

- **Doble de otro archivo ajustado** (`notificacion-orden-rechazada.test.ts`): no está en «Archivos
  esperados», pero el SELECT cambió por R21/R22 y su doble lo emulaba. Solo se añade la columna; la
  aserción no cambia.
- **Variante «Hoy» borrada en T3.2** (no en T5.1), por instrucción del leader: el helper que usaba ya no
  existe. La medición sigue en Tanda 1. Quedan sin uso `medirJornada`, `totales`, `medirJobCon401` y el
  import `expect` en el archivo de la jornada (4 warnings de lint, 0 errores): son el arnés que T5.1 usará.
- **`it.each` sin `error`**: `GestionarServiceResult` no tiene `{status:"error"}` (lo produce el borde
  cuando el service lanza); ese caso se cubre con el test «si el service LANZA».
- Otros dobles de `registrarGestionPendiente` que no afirman el encolado dejan de encolar en silencio (su
  re-lectura no trae `tiene_coordenadas`); siguen verdes y no afirman nada sobre el job.

### Pregunta abierta

Ninguna nueva en esta tanda (PA-1 y PA-2 de la tanda 2 siguen abiertas).

**Veredicto:** T3.1-T3.3 hechos; typecheck 0 errores, lint 0 errores, tests tocados en verde (1 fallo de related ajeno al diff, verde al aislarlo).

### Tanda 3 — verificación del implementer (2026-10-30)

Con `NODE_OPTIONS=--max-old-space-size=8192`, un comando cada vez:
- `pnpm run typecheck` → exit 0. `pnpm run lint` → 0 errores.
- `pnpm exec vitest run` de los 4 tests de Fase 3 → `Test Files 3 passed | 1 skipped (4)`,
  `Tests 65 passed | 1 todo (66)`.
- `pnpm exec vitest related --run lib/services/jobs/optimizacion-ruta-encolado.ts
  lib/repositories/GestionOrdenRepository.ts lib/actions/mis-asignaciones.ts` →
  `Test Files 1 failed | 456 passed | 202 skipped (659)`. El rojo era
  `notificacion-orden-rechazada.test.ts › R20`, de antes de que backend_dev arreglara su doble
  (`tiene_coordenadas`); re-corrido tras el arreglo → `Tests 14 passed (14)`.

### Re-verificación de Fase 2 (implementer, 2026-10-30)

- `pnpm exec vitest run tests/unit/services/optimizacion-ruta-{desvio,reduccion,service}.test.ts` →
  `Test Files 3 passed (3)`, `Tests 95 passed (95)`.
- `vitest related --run lib/services/OptimizacionRutaService.ts lib/interfaces/services/IOptimizacionRutaService.ts`
  **detenido por el sistema por falta de memoria** (no es un fallo del comando); no se relanza por
  instrucción del sistema. Queda para el gate de CI.

### Decisiones del leader sobre PA-1 y PA-2 (2026-10-30, pendientes de objeción humana)

- **PA-1:** se mantiene R13 (0 llamadas) cuando las paradas quitadas van detrás de la última
  restante: no queda hueco que puentear. Lleva test propio.
- **PA-2:** se mantiene polilínea `routes` que decodifica a 0 puntos ⇒ distancia `+Infinity` ⇒
  desviado ⇒ reoptimizar (default seguro). Lleva test propio.

## Tanda 4 — PA-1/PA-2 + Fase 4 (backend_dev, 2026-10-30)

### Archivos

Creados:
- `lib/services/jobs/job-fallido-permanente.ts`: clase `JobFallidoPermanente`, gemela de `job-descartado.ts`.
- `tests/unit/services/job-queue-service-permanente.test.ts` (T4.1)
- `tests/unit/services/optimizacion-ruta-credencial-rechazada.test.ts` (T4.2)

Modificados:
- `lib/services/JobQueueService.ts`: rama `JobFallidoPermanente` en `drenar`, junto a la de
  `JobDescartado`. Hace `fail(id, msg, null)`, suma a `fallidos` y a `muertos` y llama a
  `reagendarRecurrente`. Sin backoff.
- `lib/services/OptimizacionRutaService.ts`: nueva `RutaCredencialRechazadaError extends
  RutaIntentoFallidoError`. Con `config_invalida` se lanza esa subclase, siempre DESPUÉS de
  `marcarDesactualizada`.
- `lib/services/jobs/optimizacion-ruta-handler.ts`: en el `catch`, `RutaCredencialRechazadaError` →
  `throw new JobFallidoPermanente(error.message)`. El resto de errores se re-lanza igual.
- `tests/unit/actions/sincronizar-ruta.test.ts`: describe de R31.
- `tests/unit/services/optimizacion-ruta-reduccion.test.ts`: test de PA-1.
- `tests/unit/services/optimizacion-ruta-desvio.test.ts`: test de PA-2.
- `specs/SLT-59-ahorro-llamadas-google-ruta/tasks.md`: T4.1 y T4.2 marcadas.

`lib/actions/ruta-mensajero.ts` NO cambia: su `instanceof RutaIntentoFallidoError` ya atrapa la
subclase, y el test de R31 lo demuestra. Ningún archivo bajo `db/` cambia: `git diff --stat
dev...HEAD -- db/` y `git diff --stat HEAD -- db/` salen vacíos.

### PA-1 / PA-2: el código ya hacía lo decidido

- **PA-1:** previa s1,s2,s3 y actual s1,s2, con tramos por calles. Resultado: 0 `optimizar`,
  0 `trazar` y 1 `reducirSecuencia` con los tramos o→s1 y s1→s2. La cabecera es
  `codificar([o,s1,s2])`, con 3000 m y 300 s. Devuelve `omitida/reducida` con el trazado.
- **PA-2:** con `trazado.fuente="routes"` y `encodedPolyline=""`, `distanciaMinimaAPolilineaM(p, [])`
  da `+Infinity`. `decidirGuardaRuta` devuelve `{reoptimizar, desviado}`, aunque la posición esté
  sobre la recta (con la recta saldría `omitir`).

Ninguno de los dos pidió cambiar código de producción.

### Mapa R<n> → test (esta tanda)

| R | Test |
| --- | --- |
| PA-1 (R13) | `optimizacion-ruta-reduccion.test.ts` › «PA-1/R13: paradas quitadas DETRAS de la ultima restante…» |
| PA-2 (R3/R4) | `optimizacion-ruta-desvio.test.ts` › «PA-2: polilinea `routes` que decodifica a 0 puntos…» |
| R29 | `job-queue-service-permanente.test.ts` › «dead-letter en el intento 1 de 3…»; `optimizacion-ruta-credencial-rechazada.test.ts` › «R29: el handler la traduce…» y «R29/R35: la cola lo deja en dead-letter en el intento 1 de 3…» (401 y 403) |
| R30 | `optimizacion-ruta-credencial-rechazada.test.ts` › «R30: el servicio conserva el orden previo, marca la ruta desactualizada…» (401 y 403) |
| R31 | `sincronizar-ruta.test.ts` › «SLT-59 R31 — 401/403 en la sincronizacion manual…» (401 y 403) |
| R33 | `job-queue-service-permanente.test.ts` › «un error normal sigue con backoff (R33)» (2 casos); `optimizacion-ruta-credencial-rechazada.test.ts` › «HTTP 503 -> el handler re-lanza…» |
| R34 | `job-queue-service-permanente.test.ts` › «los demas tipos de job no cambian (R34)» (geocodificacion, push_web, webhook_evento) |
| R35 | `optimizacion-ruta-credencial-rechazada.test.ts` › «R29/R35…». Cadena real: `GoogleRouteOptimizationClient` + `fetch` doble con 401/403 → servicio → handler → `JobQueueService`. El motivo en `fail` es exactamente `optimizar ruta: credencial rechazada (HTTP <n>)`, sin token, proyecto, `http(s)://`, `googleapis` ni coordenadas. |

### Salida real

Con `NODE_OPTIONS=--max-old-space-size=8192`:

- `pnpm exec vitest run tests/unit/services/optimizacion-ruta-reduccion.test.ts tests/unit/services/optimizacion-ruta-desvio.test.ts`
  → `Test Files 2 passed (2)`, `Tests 57 passed (57)`
- `pnpm exec vitest run tests/unit/services/job-queue-service-permanente.test.ts tests/unit/services/optimizacion-ruta-credencial-rechazada.test.ts tests/unit/actions/sincronizar-ruta.test.ts tests/unit/services/job-queue-service.test.ts tests/unit/services/job-queue-service-descartado.test.ts`
  → `Test Files 5 passed (5)`, `Tests 67 passed (67)`
- `vitest run optimizacion-ruta-{ahorro-jornada,degradacion,desvio,encolado,origen}` (desde `tests/unit/services`)
  → `Test Files 4 passed | 1 skipped (5)`, `Tests 73 passed | 1 todo (74)`. El skipped es el `it.todo` de T5.1.
- `vitest run optimizacion-ruta-{reduccion,service,token-por-empresa,tramo-vivo,trazado} integraciones-consumidores-composition-root`
  → `Test Files 6 passed (6)`, `Tests 121 passed (121)`. Incluye el R27 `config_invalida` de
  `optimizacion-ruta-service.test.ts`, que espera `RutaIntentoFallidoError` y sigue verde con la subclase.
- `pnpm run lint` → `✖ 234 problems (0 errors, 234 warnings)`. Lo corrí sobre los 9 archivos
  tocados → 0 problemas.
- `pnpm run typecheck` → **1 error, ajeno al diff**:
  `lib/types/historial-accion.ts(696,7): error TS2322 … "cierre_dia_pago_mensajero_ajustado"`.
  - Causa: el `node_modules` compartido (junction al repo principal) tiene un cliente Prisma
    generado desde `dev`, que ya trae SLT-56.
  - Ese valor no existe en el `db/schema.prisma` de esta rama (`grep` = 0) y sí en `dev`.
  - Desaparece al rebasar sobre `dev` o al regenerar el cliente desde el schema de la rama.
  - No es de esta tanda. Ninguno de los archivos tocados sale en la salida.

### Desviaciones y avisos

- La rama va por detrás de `dev`, que ya mergeó SLT-56. Eso explica el rojo del typecheck y que
  `git diff --stat dev -- db/` (sin `...`) muestre 5 archivos. Con la base común (`dev...HEAD`)
  sale vacío: R40 se cumple. Antes de T5.2 conviene rebasar sobre `dev`.
- **Incidencia de proceso:** typecheck y lint quedaron corriendo a la vez. El harness pasó el
  typecheck a background a los 180 s y lancé lint antes de que terminara. Los dos acabaron sin
  que el sistema los matara.
- No corrí `vitest related` sobre `OptimizacionRutaService.ts` ni `JobQueueService.ts`, por
  instrucción (memoria). Queda para el gate de CI.

### Pregunta abierta

Ninguna.

**Veredicto:** PA-1/PA-2 con test y T4.1/T4.2 hechos. Los tests tocados están verdes. Lint con
0 errores. Typecheck con 1 error ajeno (cliente Prisma de `dev` en el `node_modules` compartido).

### Tanda 4 — nota del implementer (2026-10-30)

`tsc --noEmit` da 3 errores, todos fuera del diff de SLT-59 (`git diff --name-only dev...HEAD` no
toca `historial*`): `lib/types/historial-accion.ts(696)` y `lib/repositories/HistorialAccionRepository.ts(149,159)`.
Causa: el `node_modules` enlazado (junction al checkout principal) tiene un cliente Prisma generado
desde `dev`, que ya trae el valor `cierre_dia_pago_mensajero_ajustado` (SLT-56) ausente del
`db/schema.prisma` de esta rama. Se resuelve con la sincronización F2.3 (merge de `dev`), que pide el
leader. No se regenera el cliente desde aquí: pisaría el `node_modules` compartido con el checkout
principal.

## Tanda 5 — Fase 5 — backend_dev: T5.1 + verificación de T5.2 (2026-10-30)

MCP del grafo no usado (worktree sin indexar, como en tandas previas): Grep/Read.

### Archivos

- `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts` — T5.1: el `it.todo` pasa a
  `it` con la columna «Nuevo» como aserciones exactas (`toEqual` fila a fila sobre la tabla
  `NUEVO`, total `{2, 3, 6}`, fila 11 → 1 llamada, job `failed`, intentos 1). Variante
  `gestionNuevo`: saca la orden del reparto, encola con `encolarOptimizacionDebounce` SOLO si tiene
  coordenadas (R21/R22, como el paso 7 de `registrarGestionPendiente`), guarda el GPS como origen
  (92/R23, como `MisAsignacionesService.registrarUbicacion`) y llama a `reducirSinLlamadas` (R27,
  como la Server Action `gestionar`). Mismo arnés: servicio, handler, `JobQueueService` y helpers
  reales; dobles solo para la base, los dos clientes de Google y el reloj. Nota fechada en la cabecera.
- `specs/SLT-59-ahorro-llamadas-google-ruta/tasks.md` — T5.1 marcada. T5.2 queda sin marcar: falta
  `./init.sh` (no se corre por instrucción) y la guardia 420 está en rojo (ver abajo).

Sin cambios en código de producción. Sin dependencias nuevas.

### T5.1 — «Nuevo» MEDIDO = tabla de design §8 (coincide fila a fila)

```
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts --reporter=verbose --silent=false

[SLT-59 T5.1] jornada de referencia — columna «Nuevo» MEDIDA (opt / routes / jobs):
  1. t=0 min — Recoge las 7 (GPS en A): 1 / 1 / 1
  2. t=5 min — Sincroniza a mano, GPS a 50 m de A: 0 / 0 / 0
  3. t=10 min — Gestiona la orden sin coordenadas, GPS a 300 m, sobre la ruta: 0 / 0 / 0
  4. t=20 min — Entrega s1 y s2 con 20 s de diferencia (misma ventana): 0 / 0 / 1
  5. t=40 min — Entrega s3: 0 / 0 / 1
  6. t=50 min — Sincroniza a mano a 1,5 km de la ruta (quedan s4, s5, s6): 1 / 1 / 0
  7. t=60 min — Entrega s5 antes que s4 (fuera de orden, 1 hueco): 0 / 1 / 1
  8. t=80 min — Entrega s4 (queda s6): 0 / 0 / 1
  9. t=85 min — Sincroniza a mano a 200 m de la ruta, 1 parada: 0 / 0 / 0
  10. t=100 min — Entrega s6 (quedan 0): 0 / 0 / 1
  Total: 2 / 3 / 6
  11. Un job recibe 401: 1 llamadas (job failed, intentos 1/3)

 ✓ … > T5.1 — la columna «Nuevo» como aserciones exactas, fila a fila y en total (R37) 23ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Contra «Hoy» (Tanda 1, medido): 8 / 10 / 8 → 2 / 3 / 6; 401: 5 llamadas → 1.

### T5.2 — verificación (salida real, un comando a la vez, NODE_OPTIONS=--max-old-space-size=8192)

- `pnpm run test:guardias` →
  ```
   Test Files  1 failed | 318 passed | 2 skipped (321)
        Tests  4 failed | 4487 passed | 20 skipped (4511)
  ```
  Los 4 rojos son todos de `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts`
  (guardia 420): «R2/R6 — con una dependencia ausente el paso CORTA…», «R4 — con el arbol completo…»,
  «R6 — init.sh invoca scripts/verificar-dependencias.mjs», «R2 — el visto bueno de dependencias ya no
  cuelga solo de que exista la carpeta». **Ajeno a SLT-59:** la guardia exige que `init.sh` llame a
  `scripts/verificar-dependencias.mjs`, y ni el `init.sh` de esta rama ni el de `dev` lo hacen
  (`grep -c verificar-dependencias` = 0 en los dos). `git diff --name-only dev...HEAD` no toca
  `init.sh`, `scripts/` ni `tests/unit/guards/`. Rojo preexistente en `dev`; es del arnés, no de esta feature.
- R39 — `pnpm exec vitest run tests/guards/guard-dependencias-aprobadas.test.ts` →
  `Test Files 1 passed (1) · Tests 2 passed (2)` (también verde dentro de la corrida de guardias).
  `git diff --stat dev...HEAD -- package.json pnpm-lock.yaml` → vacío.
- R40 — `git diff --stat dev...HEAD -- db/` → vacío. `git diff --stat HEAD -- db/` → vacío.
- `pnpm run lint` → `✖ 230 problems (0 errors, 230 warnings)` (antes 234: desaparecen los 4 warnings
  de arnés sin usar de la jornada). `eslint` sobre el archivo tocado → sin salida.
- `pnpm exec tsc --noEmit` → exactamente los 3 errores de entorno conocidos (Tanda 4), ninguno más:
  ```
  lib/repositories/HistorialAccionRepository.ts(149,14): error TS2322 …
  lib/repositories/HistorialAccionRepository.ts(159,5): error TS2322 …
  lib/types/historial-accion.ts(696,7): error TS2322 … "cierre_dia_pago_mensajero_ajustado"
  ```
- No se corrió `./init.sh` ni la suite completa (instrucción del leader; memoria).

### Mapa final R<n> → test

| R | Test |
| --- | --- |
| R1 | `tests/unit/services/optimizacion-ruta-desvio.test.ts` › T2.1 «R1: mismo conjunto…»; T2.2 «R1/R6/R9: 2+ paradas…» |
| R2 | ídem › T2.2 «R2/R6/R9: UNA parada…», «R2: UNA parada sin trazado guardado…» |
| R3 | ídem › «R3 — desviado SI Y SOLO SI…» (borde exacto, 990/1010 m); «PA-2: polilinea `routes` que decodifica a 0 puntos…»; `tests/unit/geo/polilinea.test.ts` › «SLT-59 — distanciaMinimaAPolilineaM» |
| R4 | `optimizacion-ruta-desvio.test.ts` › «R4 — linea de referencia»; `polilinea.test.ts` › «SLT-59 — distanciaMinimaAPolilineaM» |
| R5 | `optimizacion-ruta-desvio.test.ts` › T2.1 «R5: sin posicion…», «R5: con origen `centroide`…»; T2.2 «R5: origen `centroide`…» |
| R6 | ídem › T2.2 R1/R2 (`escrituras() === 0`) |
| R7 | ídem › casos `desactualizada` de T2.1 y «R7…» de T2.2; `optimizacion-ruta-reduccion.test.ts` › «R7: ruta desactualizada con un subconjunto…» |
| R8 | `tests/unit/services/optimizacion-ruta-service.test.ts` › «265/R33 — las guardas cortan EN ESTE ORDEN» |
| R9 | `optimizacion-ruta-desvio.test.ts` › T2.2 R1/R2 (`findByMensajero` ×1, `findParadasEnReparto` ×1) |
| R10 | ídem › T2.1 «R10: … calculada hace 8 h -> omitir» y T2.2 «R10…» |
| R11 | ídem › T2.1 «R11: subconjunto estricto…»; `optimizacion-ruta-reduccion.test.ts` › «R11/R13: entrega EN ORDEN…»; `tests/integration/repositories/ruta-optimizada-repo.test.ts` (casos T1.3) |
| R12 | `optimizacion-ruta-reduccion.test.ts` › «R12/R17: la reduccion no reescribe la secuencia completa…»; `ruta-optimizada-repo.test.ts` › «R12/R17: calculada_at, origen, secuencia_fuente, ultimo_error y estado quedan intactos» |
| R13 | `optimizacion-ruta-reduccion.test.ts` › «R11/R13: entrega EN ORDEN…», «R13: si un tramo no trae distancia…», «R13: queda UNA parada…», «PA-1/R13: paradas quitadas DETRAS de la ultima restante…» |
| R14 | ídem › «R14: … UN hueco…», «R14: DOS huecos…», «R14: prefijo + un hueco…», «R14: sin cliente de Routes NUNCA… una recta» |
| R15 | ídem › «R15: trazado guardado que no es por calles…», «R15: falta el tramo…»; `ruta-optimizada-repo.test.ts` › «sin trazado limpia las 4 columnas» |
| R16 | `optimizacion-ruta-reduccion.test.ts` › «R16: el tramo puente lanza / no da ok…» |
| R17 | ídem › «R12/R17…»; `ruta-optimizada-repo.test.ts` › «R12/R17…» |
| R18 | `optimizacion-ruta-reduccion.test.ts` › «R18: con la huella cambiada…», «R18: sin huella previa…»; `ruta-optimizada-repo.test.ts` › «R18: con la huella cambiada no escribe NADA y devuelve false, sin lanzar» |
| R19 | `optimizacion-ruta-desvio.test.ts` › casos `desviado` de T2.1 y «R19…» de T2.2; `optimizacion-ruta-reduccion.test.ts` › «R19: subconjunto con el mensajero desviado…» |
| R20 | `optimizacion-ruta-desvio.test.ts` › casos `paradas_nuevas` de T2.1 y «R20…» de T2.2; `optimizacion-ruta-reduccion.test.ts` › «R20: quita una y anade otra…» |
| R21 | `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts` › «SLT-59 R21» |
| R22 | ídem › «SLT-59 R22» |
| R23 | ídem › «SLT-59 R23»; `tests/unit/services/optimizacion-ruta-encolado.test.ts` › «R23» |
| R24 | `optimizacion-ruta-encolado.test.ts` › «R24» (+ «R18» existente) |
| R25 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R25», «R16 y SLT-59 R25 — transacción REVERTIDA» |
| R26 | ídem › «SLT-59 R26» (+ bloques R16/R17 existentes) |
| R27 | `tests/unit/actions/mis-asignaciones-action.test.ts` › «SLT-59 R27/R28»; `optimizacion-ruta-reduccion.test.ts` › «SLT-59 T2.4 — reducirSinLlamadas» |
| R28 | `mis-asignaciones-action.test.ts` › «R28: si la reduccion lanza, la action devuelve EXACTAMENTE el mismo resultado» |
| R29 | `tests/unit/services/job-queue-service-permanente.test.ts` › «dead-letter en el intento 1 de 3…»; `tests/unit/services/optimizacion-ruta-credencial-rechazada.test.ts` › «R29: el handler la traduce…», «R29/R35: la cola lo deja en dead-letter en el intento 1 de 3…»; jornada › fila 11 |
| R30 | `optimizacion-ruta-credencial-rechazada.test.ts` › «R30: el servicio conserva el orden previo, marca la ruta desactualizada…» |
| R31 | `tests/unit/actions/sincronizar-ruta.test.ts` › «SLT-59 R31 — 401/403 en la sincronizacion manual…» |
| R32 | `optimizacion-ruta-encolado.test.ts` › «R32» |
| R33 | `job-queue-service-permanente.test.ts` › «un error normal sigue con backoff (R33)»; `optimizacion-ruta-credencial-rechazada.test.ts` › «HTTP 503 -> el handler re-lanza…» |
| R34 | `job-queue-service-permanente.test.ts` › «los demas tipos de job no cambian (R34)» |
| R35 | `optimizacion-ruta-credencial-rechazada.test.ts` › «R29/R35…» |
| R36 | `tests/unit/config/route-optimization-config.test.ts` › «SLT-59/R36 — …» |
| R37 | `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts` › «SLT-59/R37 — jornada de referencia (design §8)» › «T5.1 — la columna «Nuevo» como aserciones exactas, fila a fila y en total (R37)» |
| R38 | `route-optimization-config.test.ts` › «SLT-59/R38 — RUTA_SYNC_MIN_INTERVALO_S sigue en 10…», «…tope de intentos de la geocodificacion…» |
| R39 | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente, sin cambios; verde) |
| R40 | `git diff --stat dev...HEAD -- db/` vacío (comprobación del diff, esta tanda) |

**R sin test: ninguno.**

### Pregunta abierta

Ninguna. «Nuevo» medido = tabla del design.

### Aviso para el leader

- La guardia 420 (`dependencias-declaradas-presentes.guardia.test.ts`, 4 tests) está roja en esta rama
  y en `dev` por el `init.sh` del arnés. No es de SLT-59, pero `./init.sh` y el gate la verán roja.
- El typecheck sigue con los 3 errores de entorno de la Tanda 4 hasta sincronizar con `dev` (F2.3).

**Veredicto:** T5.1 hecho y en verde (Nuevo = 2 / 3 / 6, 401 → 1 llamada, igual que el design). R1-R40 mapeados. R39 y R40 verdes. Lint con 0 errores. Typecheck solo con los 3 errores de entorno conocidos. test:guardias tiene 4 rojos ajenos a la feature (guardia 420).

### Tanda 5 — nota del implementer (2026-10-30)

- Los 4 rojos de `test:guardias` están en `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts`,
  que **figura en `tests/baseline-rojos.json`**: rojo heredado, no hallazgo de SLT-59.
- T5.2 queda **sin marcar**: falta `./init.sh` (no se corre aquí por memoria) y typecheck limpio, que
  depende de la sincronización F2.3 con `dev` (cliente Prisma compartido, ver Tanda 4). Ambos los
  cierra el leader (merge de `dev` + gate local o CI).

## Tanda 6b — backend_dev: T6.4, T6.7 (archivo SQL real), T7.1 (2026-10-30)

### Archivos

- `lib/repositories/RutaOptimizadaRepository.ts`: `reducirSecuencia` filtra por
  `{ mensajeroId, huellaSet: huellaPrevia, estado: "vigente" }` (R48). JSDoc con el motivo.
- `lib/interfaces/repositories/IRutaOptimizadaRepository.ts`: el JSDoc del contrato añade la condición
  del estado (la firma no cambia).
- `lib/config/route-optimization.ts`: `RUTA_RECUPERACION_ENFRIAMIENTO_MIN` (5, nota D21) y
  `RUTA_PRIMERA_MIN_RECOGIDO_PCT` (80, nota D25, 1-100 con `readIntEnRango`; fuera de rango → default).
- `tests/integration/repositories/ruta-optimizada-repo.test.ts`: el `where` se afirma con huella y estado;
  `buildPrismaReduccion` acepta el estado de la fila; caso nuevo `desactualizada` con la huella igual.
- `tests/integration/db/ruta-optimizada-reduccion-sql-real.test.ts` (nuevo, T6.7): lee
  `process.env.DATABASE_URL` tal como llega al proceso y exige host `localhost`/`127.0.0.1`;
  `_postgres-real`, `_jobs-dos-empresas` y `fabricas/organizaciones` se cargan con `await import` en
  `beforeAll` (solo `import type` estático de esos módulos). Siembra como dueño en `conDosEmpresas`; la
  reducción corre como `servi_app` con la empresa A (`comoApp`) y `clienteConSavepoint`; la medición
  lee como dueño, fila entera.
- `tests/unit/config/route-optimization-config.test.ts`: los dos campos en `VARS`, en la lista
  de claves y en el `describe.each` de R36 (default, override, vacío, no numérico, 0, negativo, NaN).
  Bloque R55 aparte: 101 y 250 → 80; 1 y 100 se aceptan; el enfriamiento admite 101.
- Fixtures `CONFIG` con los dos campos nuevos (sin otro cambio): `optimizacion-ruta-{ahorro-jornada,
  credencial-rechazada,degradacion,origen,service,tramo-vivo,trazado}.test.ts`.
- `specs/SLT-59-ahorro-llamadas-google-ruta/tasks.md`: T6.4 y T7.1 en `[x]`. T6.7 sigue abierta
  (falta el renombrado PA-2 → D18/R47 y la corrida en CI).

### Mapa R → test

| R | Test |
| --- | --- |
| R48 | `tests/integration/repositories/ruta-optimizada-repo.test.ts`: «todo va en UNA transaccion…» (`where` con estado) y «R48: con la ruta `desactualizada` y la huella IGUAL…». `tests/integration/db/ruta-optimizada-reduccion-sql-real.test.ts`: «R48: huella igual y `vigente`…», «R48: huella DISTINTA…», «R48: `desactualizada` con la huella IGUAL…» |
| R50 | `tests/integration/db/ruta-optimizada-reduccion-sql-real.test.ts`: «R50: una reduccion en el contexto de A no toca la cabecera ni las paradas de B, con la misma huella» (la de A se aplica; la de B pedida desde A devuelve `false`; B queda igual fila a fila) |
| R55 | `tests/unit/config/route-optimization-config.test.ts`: `describe.each` «SLT-59/R36, R55 — %s…» con los dos campos, y «SLT-59/R55 — RUTA_PRIMERA_MIN_RECOGIDO_PCT es un porcentaje: 1-100» |

### Salida real (resumida)

- `vitest run tests/integration/repositories/ruta-optimizada-repo.test.ts` → 27 passed.
- `vitest run tests/unit/config/route-optimization-config.test.ts` → 52 passed.
- Fixtures: 5 archivos / 99 passed (repo + config + ahorro-jornada, credencial-rechazada, degradacion);
  4 archivos / 81 passed (origen, service, tramo-vivo, trazado).
- Archivo SQL real, verificación de salto (T6.7 *Hecho*):
  - (a) `env -u DATABASE_URL pnpm exec vitest run <archivo>` con un `.env` **temporal** en el
    worktree (`DATABASE_URL=postgresql://nadie:nadie@localhost:5999/no_existe`, local a propósito: si
    se leyera, el test correría y fallaría) → `1 skipped / 4 skipped`. El `.env` se borró después.
  - (b) `DATABASE_URL=postgres://u:p@db.example.com:5432/x` → `1 skipped / 4 skipped`.
  - (c) Contra la Postgres **local** (`localhost:5432`, URL del `.env` del repo principal, host
    comprobado antes de correr) → **4 passed**. Nada remoto.
  - Mutación: con el `estado` quitado del `where`, fallan el caso `desactualizada` del SQL real y los
    dos del repo con doble (3 rojos); restaurado → verde.
- `pnpm run typecheck` → 3 errores, todos en archivos que esta tanda no podía tocar (el otro backend_dev
  los tiene en curso):
  - `optimizacion-ruta-desvio.test.ts(385,7)` y `optimizacion-ruta-reduccion.test.ts(33,7)`: TS2739, al
    `CONFIG` le faltan los dos campos nuevos de T7.1. Se arregla con dos líneas por archivo:
    `RUTA_RECUPERACION_ENFRIAMIENTO_MIN: 5, RUTA_PRIMERA_MIN_RECOGIDO_PCT: 80`.
  - `optimizacion-ruta-reduccion.test.ts(305,54)`: TS2493 (tupla `[]`). No lo causa esta tanda.
  - Los 3 errores de entorno de la Tanda 4 ya no salen.
- `pnpm exec eslint` sobre los 13 archivos tocados → 0 problemas. `pnpm run lint` completo → 0 errores, 230 warnings heredados (exit 0).

### Desviaciones

- T7.1 vuelve obligatorios dos campos de `RouteOptimizationConfig` (design §12.7). Eso obliga a tocar los
  9 fixtures `CONFIG`; 7 se ajustaron aquí y 2 son del otro agente (ver el typecheck).
- R50 se prueba de dos maneras porque `ruta_optimizada.mensajero_id` es UNIQUE global, así que un
  mensajero no puede tener ruta en las dos empresas: (1) A y B con la misma huella, A reduce la suya;
  (2) desde A se pide la reducción con el mensajero de B. El aislamiento lo da la RLS (`servi_app` +
  `app.organizacion_id`), igual que en producción. El filtro de la extensión no entra: el repositorio
  recibe el cliente de la transacción.
- Catálogos del SQL real: rol `mensajero`/`adminTienda`, un `tipo_identificacion`, `order_status`
  `en_reparto` y un distrito. Si falta alguno, falla con un error explícito.

**Veredicto:** T6.4 y T7.1 hechas y en verde. T6.7: el archivo SQL real existe, se salta sin URL o con un host remoto, y pasa contra la base local; faltan el renombrado y la corrida en CI. El typecheck solo falla en 2 archivos del otro agente.

## Tanda 6a — Fase 6 — backend_dev: T6.1, T6.2, T6.3 (2026-10-30/31)

> El backend_dev de esta tanda dejó el código y los tests hechos y las tasks marcadas, pero se colgó
> (stream watchdog) antes de escribir esta sección. La consolida el implementer con su propia
> verificación.

### Archivos
- `lib/services/OptimizacionRutaService.ts`: rama «fuera de orden» en `decidirGuardaRuta`, antes del
  desvío (`restantes` ≠ cola de `previa` → `reoptimizar/fuera_de_orden`, sin decodificar polilínea);
  se retiran la rama `puente` de `planificarReduccion`, `tramosPuente` y `permitirLlamada`;
  `reducirSinLlamadas` ya no reduce con fuera de orden (R44). Notas «[2026-10-30, SLT-59, D16]» junto
  a las de D14/R14, sin borrar el texto previo.
- `lib/actions/mis-asignaciones.ts`: nota fechada D16 (R27→R44).
- Tests: `optimizacion-ruta-desvio.test.ts`, `optimizacion-ruta-reduccion.test.ts`,
  `mis-asignaciones-action.test.ts` (títulos R27→R44, sin cambiar aserciones),
  `optimizacion-ruta-ahorro-jornada.test.ts` (ajuste mínimo, ver abajo). Los otros tests de servicio
  (`-service`, `-origen`, `-credencial-rechazada`, `-degradacion`, `-tramo-vivo`, `-trazado`) solo ganan
  los dos campos nuevos del `CONFIG` de T7.1 (+2 líneas cada uno).

### Mapa R<n> → test (esta tanda)
| R | test |
|---|---|
| R42 | `optimizacion-ruta-desvio.test.ts` «R42: fuera de orden con el mensajero SOBRE la ruta -> reoptimizar SIN decodificar la polilinea» + hueco en medio; `optimizacion-ruta-reduccion.test.ts` casos UN hueco / DOS huecos / prefijo+hueco / sin cliente de Routes (1 `optimizar`, 1 `trazar`, 0 `reducirSecuencia`), fuera de orden con 1 restante (rama 92/R35: 0 `optimizar`, 1 `trazar`), fuera de orden sin tramos → recalcula |
| R43 | `optimizacion-ruta-desvio.test.ts` «quitar la última → reoptimizar»; `optimizacion-ruta-reduccion.test.ts` «R43: quitar la ULTIMA …» (antes PA-1/R13) |
| R44 | `optimizacion-ruta-reduccion.test.ts` `reducirSinLlamadas`: hueco y «quitar la última» → 0 llamadas, 0 escrituras; prefijo → reduce. `mis-asignaciones-action.test.ts` títulos R44 |
| R11, R14, R16 | RETIRADOS (D16): `grep -n "tramosPuente\|permitirLlamada" lib/` = 0; casos R16 borrados; los de R14 reconvertidos a R42 |
| R27 | RETIRADO → R44 (renombrado) |
| R13, R15 | siguen verdes en `optimizacion-ruta-reduccion.test.ts` |

### Verificación (implementer, NODE_OPTIONS=--max-old-space-size=8192, `pnpm exec vitest run` por grupos)
```
desvio + reduccion                                   Test Files 2 passed (2)  Tests 63 passed (63)
mis-asignaciones-action + optimizacion-ruta-service  Test Files 2 passed (2)  Tests 77 passed (77)
ahorro-jornada + origen + credencial-rechazada        Test Files 3 passed (3)  Tests 27 passed (27)
degradacion + tramo-vivo + trazado                   Test Files 3 passed (3)  Tests 34 passed (34)
ruta-optimizada-repo + route-optimization-config      Test Files 2 passed (2)  Tests 79 passed (79)
pnpm run typecheck   -> tsc --noEmit, 0 errores (los 3 TS2739/TS2493 que vio la Tanda 6b ya no están)
pnpm run lint        -> 0 errors, 230 warnings (preexistentes)
grep -n "tramosPuente\|permitirLlamada" lib/   -> 0
```

### Desviaciones
- Jornada (`optimizacion-ruta-ahorro-jornada.test.ts`): ajuste mínimo con nota D16. La fila 7 (fuera de
  orden, 1 hueco) pasa de 0/1 a 1/1, porque ahora R42 re-sincroniza en vez de pagar un tramo puente. El
  total pasa de `{2,3,6}` a `{3,3,6}`. Las tablas de §8.0 se reescriben en T7.8.

## Tanda 6c — backend_dev: T6.5, T6.6, T6.7 (renombrado) (2026-10-31)

### Archivos
- `lib/interfaces/services/IOptimizacionRutaService.ts` — `EjecutarOptimizacionResult.razon` + `"reduccion_descartada"` (R49).
- `lib/services/OptimizacionRutaService.ts`
  - `aplicarReduccion` devuelve el desenlace: `omitida/reducida` (+ trazado) si `reducirSecuencia` escribe; `omitida/reduccion_descartada` sin trazado si devuelve `false` o no hay huella previa (R49). `guardaSinRecalculo` lo reenvía tal cual; `reducirSinLlamadas` lo ignora como antes.
  - `ejecutar` ya no hace `upsertOrigen` al principio (R46, design §2.4). La ubicación recibida se guarda en memoria (`ubicacionGps`); `origenGuardado` (las 4 columnas de origen, tipo nuevo `OrigenGuardado`) y `rutaVista` alimentan `resolverOrigen`, `origenSoloDeUltimaConocida` y `guardaSinRecalculo`. `persistirUbicacion` (nuevo, privado) escribe justo antes de `reemplazarSecuencia` en la rama 92/R35 y justo antes de `client.optimizar` en el camino principal.
  - `resolverOrigen` y `origenSoloDeUltimaConocida` reciben `OrigenGuardado | null` (supertipo de `RutaOptimizadaDTO`; `reducirSinLlamadas` no cambia).
- `tests/unit/services/optimizacion-ruta-reduccion.test.ts` — los dos casos R18 pasan a R18/R49 (`reduccion_descartada`, sin trazado, 0 `optimizar`, 0 `trazar`); caso nuevo R49 en la rama de una parada.
- `tests/unit/services/optimizacion-ruta-origen.test.ts` — «se persiste ANTES de optimizar» ajustado (antes de `optimizar`, después de `findByMensajero`, y el origen enviado es la ubicación recibida); describes nuevos R46: omitida R1, una parada R2, reducida R41, `reduccion_descartada` R49, intervalo mínimo 92/R34 → `upsertOrigen` no se llama; desviado según la ubicación RECIBIDA (origen guardado sobre la línea) → recalcula, `upsertOrigen` 1 vez antes de `optimizar`, más un control sin ubicación → omitida; sin ruta previa → `upsertOrigen` antes de `optimizar`; 92/R35 con 0 paradas → `upsertOrigen` antes de `reemplazarSecuencia`.
- `tests/unit/actions/sincronizar-ruta.test.ts` — R49 (`reduccion_descartada` → `{ ok, omitida: true, secuenciaFuente: null }`, sin `trazado`); R45 con el servicio REAL detrás de la acción: ruta vigente, mismo conjunto, ubicación sobre la línea → `{ ok, omitida: true, secuenciaFuente: null, trazado: <caché con sus tramos> }`, 0 `optimizar`, 0 `trazar`, 0 `upsertOrigen`.
- `tests/unit/services/optimizacion-ruta-desvio.test.ts` — título «PA-2» → «D18/R47»; aserción intacta (T6.7, primer punto).

### Mapa R → test (esta tanda)
| R | Test |
| --- | --- |
| R45 | `tests/unit/actions/sincronizar-ruta.test.ts` › «SLT-59 R45 — ruta vigente, mismo conjunto y sin desvio…» |
| R46 | `tests/unit/services/optimizacion-ruta-origen.test.ts` › «SLT-59 R46 — manual con ubicacion que no recalcula…» y «SLT-59 R46 — el desvio se mide con la ubicacion RECIBIDA…» |
| R47 | `tests/unit/services/optimizacion-ruta-desvio.test.ts` › «D18/R47: polilinea `routes` que decodifica a 0 puntos…» |
| R49 | `tests/unit/services/optimizacion-ruta-reduccion.test.ts` › «R18/R49…» (x2) y «R49: la rama de UNA parada…»; `tests/unit/actions/sincronizar-ruta.test.ts` › «SLT-59 R49…»; `optimizacion-ruta-origen.test.ts` › «R49: reduccion no aplicada…» |

### Verificación (NODE_OPTIONS=--max-old-space-size=8192, `pnpm exec vitest run` por grupos)
```
origen + reduccion + sincronizar-ruta           Test Files 3 passed (3)  Tests 89 passed (89)
ahorro-jornada + tramo-vivo + desvio            Test Files 3 passed (3)  Tests 45 passed (45)
optimizacion-ruta-service + trazado + degradacion  Test Files 3 passed (3)  Tests 65 passed (65)
pnpm run typecheck  -> tsc --noEmit, exit 0
pnpm run lint       -> 0 errors, 230 warnings (preexistentes; ninguno en los archivos tocados)
```
`test:guardias` no se corrió en esta tanda (el encargo limita a los archivos de test tocados); queda para T6.8.

### Desviaciones
- Sin ruta previa (`ruta === null`) design §2.4 dice «no hay vista». Se resuelve el origen con la ubicación recibida igualmente (`origenGuardado` solo con las 4 columnas), porque R46 pide usarla «como origen si la ejecución recalcula» y antes la relectura tras `upsertOrigen` la traía. Sin lecturas nuevas (R9). El test de origen lo fija (origen enviado = ubicación recibida).
- Ningún otro test afirmaba el orden de `upsertOrigen` en `ejecutar`: «Archivos esperados» no cambia.
- `sincronizarRuta` y `SincronizarRutaButton` sin cambios (design §6): `reduccion_descartada` cae en la rama `omitida: true` existente.
- Durante la tanda aparecieron cambios ajenos sin commitear en `specs/SLT-59-…/{requirements,design,tasks}.md` (revisión 5, D27). No los toqué salvo marcar T6.5-T6.7 en `tasks.md`.

Veredicto: T6.5, T6.6 y T6.7 (renombrado) hechas; typecheck y lint verdes, 199 tests de los archivos tocados y vecinos en verde.

## Tanda 7b — backend_dev: T7.3, T7.4, T7.9 (2026-10-31)

T7.3 y T7.9 van en un solo diseño: la recogida usa SIEMPRE la clave por día
`ruta-opt:primera-recogida:<mensajeroId>:<díaCR>` y `encolarOMoverPendiente`. Con la recogida parcial el job va a `+RUTA_PRIMERA_DEBOUNCE_MIN` y lleva `origen = recogida_parcial`. Con la última recogida (R58), el mismo job va a `+RUTA_DEBOUNCE_S` y lleva `origen = recogida`.

### Archivos
- `lib/config/route-optimization.ts`: añade `RUTA_PRIMERA_DEBOUNCE_MIN` (10; entero ≥ 1, fuera de rango → default; nota «D29, humano 2026-10-31; no calibrado»).
- `lib/interfaces/repositories/IJobRepository.ts`: añade `EncolarOMoverOpts` y la interfaz **`IJobRepositoryMovible extends IJobRepository`**, con `encolarOMoverPendiente`.
- `lib/repositories/JobRepository.ts`: implementa `IJobRepositoryMovible`. `encolarOMoverPendiente` hace el mismo `INSERT` de la cola con `ON CONFLICT ("dedupe_key") WHERE "dedupe_key" IS NOT NULL DO UPDATE SET run_after, payload, updated_at WHERE "jobs"."estado" = 'pending' RETURNING *`. Devuelve `null` si la fila ya no está `pending` (R77). Sin migración.
- `lib/services/jobs/optimizacion-ruta-encolado.ts`: añade
  - `ORIGENES_JOB_RUTA` y `OrigenJobRuta`: `recogida | recogida_parcial | gestion | traspaso`. Hoy solo la recogida escribe `origen`;
  - `dedupeKeyPrimeraRecogida`;
  - `primeraRutaPendiente(calculadaAt, diaCR)`: pura; usa `inicioDelDiaCREnUtc`;
  - `encolarPrimeraRutaPorRecogida`.
- `lib/services/jobs/optimizacion-ruta-handler.ts`: el zod del payload acepta `origen` opcional de `ORIGENES_JOB_RUTA`. Un valor fuera de la lista da «payload invalido».
- `lib/repositories/GestionOrdenRepository.ts`:
  - `recogerLote` (R57, R58, R76, R77): tras el `UPDATE`, hace UNA consulta, `EXISTS por_recoger` con el predicado de día copiado del `UPDATE` más `calculada_at`. Solo encola si la primera ruta está pendiente, siempre por `encolarPrimeraRutaPorRecogida`.
  - `registrarGestionPendiente` (R59, acota R22): la re-lectura de gestionable trae además `calculada_at` por subconsulta escalar, en la misma sentencia. Encola si hay coordenadas **o** si la primera ruta está pendiente (día: `fechaCalendarioCR(now)`).
  - `jobRepo` pasa a tipo `IJobRepositoryMovible`.
- `lib/repositories/OrdenRepository.ts`: solo el paso 6 de `traspasarMensajeroLote` (R60). Hace UNA lectura `ruta_optimizada … IN (origen, destino)` y encola solo a quien ya tiene la primera ruta de hoy. La nueva asignación (R61) no cambia: ya no encolaba; solo se fija con un test. No toqué `contarAsignadasDelDia`.
- Tests:
  - `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts` (reescrito: la cola en memoria honra `DO UPDATE … WHERE pending` y el `$transaction` fake revierte la cola);
  - `tests/integration/repositories/job-repo-posponer.test.ts` (nuevo);
  - `tests/unit/services/optimizacion-ruta-encolado.test.ts` (+ casos);
  - `tests/unit/config/route-optimization-config.test.ts` (+ variable);
  - `tests/unit/services/optimizacion-ruta-handler-payload.test.ts` (nuevo).
- Dobles ajenos que rompía mi cambio (Edit de 1-6 líneas cada uno):
  - `tests/unit/repositories/gestion-orden-repository.test.ts` y `tests/integration/db/recoger-lote-dia-reserva.int.test.ts`: `encolarOMoverPendiente` en su `colaFake`;
  - `tests/integration/db/traspaso-mensajero.int.test.ts`: `conEscenario` siembra `ruta_optimizada` de hoy para origen y destino, para que T9.9 (92/R32, 2 jobs) siga midiendo lo mismo con R60.

### Mapa R → test
| R | Test |
| --- | --- |
| R57 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R57 — con la primera ruta del dia ya calculada, recoger NO encola» (x4) |
| R58 | ídem › «SLT-59 R58 — …» (último paquete a +60 s, «recoger todas» → 1 job, R67: una consulta con el mismo predicado de día) + `optimizacion-ruta-encolado.test.ts` › «SLT-59 R58/R76 …» |
| R60 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R60 — …» (solo origen, solo destino, los dos pendientes → 0, los dos con ruta → 2, una sola lectura) |
| R61 | ídem › «SLT-59 R61 — una nueva asignacion NO encola…» (`asignarBodegaLote`) |
| R76 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R57/R76 — …» (1 job a +10 min; 2.ª parcial a los 4 min lo mueve; la última lo pasa a +60 s con `origen = recogida`; override de config; clave por mensajero) + `job-repo-posponer.test.ts` › «SLT-59 R76 — …» + `route-optimization-config.test.ts` (`RUTA_PRIMERA_DEBOUNCE_MIN`: default, override, vacía, inválida) + `optimizacion-ruta-handler-payload.test.ts` |
| R77 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R77 — …» (`processing`/`done`/`failed`) + `job-repo-posponer.test.ts` › «SLT-59 D29 — el SQL…» y «SLT-59 R77 — …» (`processing`/`done`/`failed`/`descartado`) |
| R22 (acotado), R59 (encolado) | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R22 (acotado por R59) — …» (sin coordenadas: primera hecha → 0; nunca calculada → 1; calculada ayer → 1) y «R59/R67: coordenadas y `calculada_at` salen de la MISMA re-lectura» |
| R59 (recalcula) | del otro agente: `optimizacion-ruta-primera-del-dia.test.ts` › «SLT-59 T7.4 — R59…» (existe y pasa: 2 passed con `-t R59`) |

### Verificación (NODE_OPTIONS=--max-old-space-size=8192, por grupos)
```
optimizacion-ruta-enqueue + gestion-orden-repository        Test Files 2 passed  Tests 69 passed
job-repo-posponer + optimizacion-ruta-encolado + config     Test Files 3 passed  Tests 91 passed
optimizacion-ruta-enqueue + handler-payload                 Test Files 2 passed  Tests 38 passed
handler-payload + orden-historial-atomicidad + orden-repository.guia   3 passed  Tests 45 passed
notificacion-orden-rechazada + orden-historial-cobertura + gestion-orden-evidencia  3 passed  32 passed
optimizacion-ruta-primera-del-dia -t R59 (del otro agente)  2 passed | 18 skipped
traspaso-mensajero.int + recoger-lote-dia-reserva.int       2 skipped (sin DATABASE_URL; corren en CI)
guardias relacionadas (75 archivos que citan repos/config/fecha-cr)  75 passed  1032 passed
pnpm run typecheck  -> exit 0
pnpm run lint       -> 0 errors, 230 warnings (preexistentes; ninguno en archivos míos)
```

### Desviaciones
- **`IJobRepositoryMovible` en vez de añadir el método a `IJobRepository`.** Con el método obligatorio en `IJobRepository`, el typecheck daba 34 errores en 18 archivos: dobles de otras fichas, `scripts/drenar-jobs.ts` y tests del otro agente. El contrato aparte solo lo exige `GestionOrdenRepository`. `encolarOptimizacionDebounce` y el traspaso siguen con `IJobRepository`.
- **No existía ninguna unión de `origen`.** El `origen` en el payload es de la Fase 8 (D28) y no estaba hecho. La creé en el módulo de encolado (`ORIGENES_JOB_RUTA`), que es mío. No toqué `OptimizacionRutaService`. Gestión y traspaso siguen sin escribir `origen`: eso es la Fase 8.
- La clave usa el prefijo `ruta-opt:` del design y no `DEDUPE_PREFIX` (`optimizacion_ruta`): son espacios disjuntos a propósito.
- **«Si la transacción revierte, no hay job».** Con dobles se mide de dos formas:
  - el append falla antes del encolado;
  - el `$transaction` falla al confirmar después de mover el job, y la cola vuelve a como estaba.

  La garantía real es que el job va por el `tx` de la recogida, y el test lo afirma.
- **«Una por_recoger de mañana no cuenta».** Con dobles solo se fija la forma: el mismo predicado de día que el `UPDATE`, con el día como texto. La semántica contra Postgres no tiene un test nuevo en `tests/integration/db/`, porque aquí no hay base local.
- T7.9 «motivo `primera_ruta_debounce_recogida`» en `optimizacion-ruta-motivo.test.ts` es de la Fase 8 (así lo marca la propia task). Marqué T7.9 con eso pendiente para T8.x.
- Toqué tres archivos de test fuera de mi lista (los de «Dobles ajenos» de arriba), con cambios mínimos, porque mi cambio los rompía.

Veredicto: T7.3, T7.4 (la parte de servidor; el R59 unitario es del otro agente y ya existe) y T7.9 hechas. Typecheck y lint verdes, 75 guardias relacionadas en verde, y los tests tocados y los vecinos en verde.

## Tanda 7a — backend_dev: T7.2, T7.5, T7.6, T7.7 (servidor), R59 (2026-10-31)

Base: HEAD 9ae0fb6, en paralelo con la Tanda 7b (otro backend_dev). Sin dependencias ni migraciones, y sin tocar las firmas de los clientes de Google (Fase 8). Grafo no consultado: Grep/Read bastaron.

### Archivos
**Producción**
- `lib/services/OptimizacionRutaService.ts`:
  - `decidirGuardaRuta` recibe `disparo`, `ahora` y `enfriamientoMin`. Los motivos nuevos son `primera_del_dia` y `recuperacion`, y hay un `omitir` con `motivo: "enfriamiento"`. El desvío solo se mide con `disparo === "manual"`.
  - Funciones puras exportadas: `disparoDe`, `primeraRutaPendiente` y `puntoDeRecogida`. Las dos últimas usan `inicioDelDiaCREnUtc(fechaCalendarioCR(ahora))`.
  - `ParadasRepo` gana `contarAsignadasDelDia`.
  - En `ejecutar`, después de R34 y antes de leer paradas, van dos guardas: la de salida (R63, `salidaAplica`) y la del botón con la primera ruta pendiente (R64).
  - `guardaSinRecalculo` devuelve `razon: "enfriamiento"`.
  - `reducirSinLlamadas` pasa `disparo: "automatico"`.
- `lib/interfaces/services/IOptimizacionRutaService.ts`: `MotivoOptimizacion` incluye `"salida"`. `omitida.razon` incluye `enfriamiento` y `salida_no_aplica`, y hay una variante nueva `recogida_insuficiente` con `recogidas` y `asignadas`.
- `lib/interfaces/repositories/IRutaOptimizadaRepository.ts` y `lib/repositories/RutaOptimizadaRepository.ts`: `actualizadaAt` se lee de `row.updatedAt`.
- `lib/interfaces/repositories/IOrdenRepository.ts` y `lib/repositories/OrdenRepository.ts` (solo con Edit): `contarAsignadasDelDia(mensajeroId, dia)` hace un único `findMany` que selecciona el estatus y cuenta en memoria.
- `lib/actions/ruta-mensajero.ts`:
  - `sincronizarRuta` traduce `recogida_insuficiente` a `conflict`.
  - La acción nueva `calcularRutaAlSalir` lleva la anotación `@sin-superficie`, que se borra al cablearla.
  - `RutaMensajeroDeps` gana `config?`.
- `lib/types/ruta-mensajero.ts`: añade `calcularRutaAlSalirSchema`.
- `lib/interfaces/services/IMisAsignacionesService.ts` y `lib/services/MisAsignacionesService.ts`: `RutaResumenDTO` gana `primeraRutaPendiente` y `puntoRecogida`. Ambos se calculan sobre la `ruta` ya leída y el `now` del listado.

**Tests nuevos**
- `tests/unit/services/optimizacion-ruta-recuperacion.test.ts`
- `tests/unit/services/optimizacion-ruta-primera-del-dia.test.ts`
- `tests/integration/repositories/orden-contar-asignadas-del-dia.test.ts`

**Tests modificados**
- `optimizacion-ruta-desvio.test.ts`:
  - wrapper `decidir` (por defecto `manual`) y `T0` movido a las 22:00Z para que «hace 8 h» (R10) siga siendo hoy;
  - filas R7 marcadas como automáticas;
  - R19 pasa a R52, y se añaden filas R51 (automático y salida);
  - casos nuevos: «automático no decodifica», «R47 acotado» y R59 puro;
  - en `ejecutar`: R52 (renombrado) y R51 (job).
- `optimizacion-ruta-reduccion.test.ts`:
  - R19 se parte en R52 (manual, recalcula) y R51 (job, reduce);
  - R56 nuevo;
  - el `reducirSinLlamadas` desviado pasa a R51 (reduce);
  - R59 nuevo: con la primera pendiente no reduce.
- `optimizacion-ruta-service.test.ts`: la segunda corrida de seis casos lleva `calculadaAt: CALCULADA_HOY`. Con `null`, la primera ruta estaría pendiente.
- `sincronizar-ruta.test.ts`: describes R64 y `calcularRutaAlSalir`.
- `mis-asignaciones-orden-ruta.test.ts`: `listar` recibe `ahora`, el `toEqual` literal crece con los dos campos y hay un describe R62 nuevo.

**Ajustes mecánicos de fixtures** (mi cambio rompía su compilación):
- `actualizadaAt` en el DTO: credencial-rechazada, origen, tramo-vivo, ahorro-jornada (`new Date(0)`; T7.8 decide).
- `contarAsignadasDelDia` (devuelve `{0, 0}`) en los dobles de `ParadasRepo`: degradación, trazado, jornada, etc. También en los dobles completos de `IOrdenRepository`: `bulk-orden-service(.carga-api)`, `orden-service`, `rol-admin-satelite-authz`.
- `RUTA_PRIMERA_DEBOUNCE_MIN: 10` en los literales `CONFIG` de los tests de ruta.
- `primeraRutaPendiente: false, puntoRecogida: null` en los fixtures de `RutaResumenDTO`. Están en 8 tests de `tests/components/` y en 3 de `tests/unit/actions/mis-asignaciones-*`.

### Firmas para frontend_dev (T7.7, RepartoModule)
```ts
// lib/actions/ruta-mensajero.ts ("use server")
export async function calcularRutaAlSalir(
  input: unknown,               // { ubicacion: { lat: number; lng: number } } (obligatoria, zod)
  deps?: RutaMensajeroDeps,
): Promise<SincronizarRutaResult>;
// ok -> { status: "ok", omitida: false, secuenciaFuente, trazado? }  => router.refresh() + onTrazado
// cualquier omitida -> { status: "ok", omitida: true, secuenciaFuente: null, trazado? }
// conflict | forbidden | unauthenticated | validation_error -> nada, sin toast (design §12.6)

// lib/interfaces/services/IMisAsignacionesService.ts, RutaResumenDTO
primeraRutaPendiente: boolean;
puntoRecogida: { lat: number; lng: number } | null;
```
Al cablearla en `RepartoModule`, hay que **borrar la anotación `@sin-superficie`** de `calcularRutaAlSalir`. Si no, la guardia la dejará pasar por anotada y no por usada.

### Mapa R → test
| R | Test |
|---|---|
| R51 | `optimizacion-ruta-desvio.test.ts`: filas «R51: automatico…» y «R51: salida…», «R51: automatico NO decodifica la polilinea», «R51: job de la cola… 0 llamadas»; `optimizacion-ruta-reduccion.test.ts`: «R51 (antes R19): job, prefijo…», «R51: con el mensajero desviado y un prefijo -> reduce igual» |
| R52 | `optimizacion-ruta-desvio.test.ts`: filas «R52: manual…», «R52 (antes R19)…» ×2; `optimizacion-ruta-reduccion.test.ts`: «R52 (antes R19): manual, prefijo…» |
| R47 (acotado) | `optimizacion-ruta-desvio.test.ts`: «R47 acotado: polilinea `routes` vacia -> manual reoptimiza, automatico omite» |
| R53 | `optimizacion-ruta-recuperacion.test.ts`: 4 min 59 s → `enfriamiento` sin escrituras ni `upsertOrigen`; a 5 min justos recalcula; con paradas nuevas o desviado a 1 min recalcula; un job sobre la ruta `desactualizada` recalcula (R7); `sincronizar-ruta.test.ts`: «`enfriamiento` (R53) llega como `ok/omitida`» |
| R54 | `optimizacion-ruta-recuperacion.test.ts`: «R54: la cota es `updated_at`…» (y los bordes de R53 miden contra `actualizadaAt`) |
| R56 | `optimizacion-ruta-reduccion.test.ts`: «R56: manual, ruta vigente, prefijo reducido y sin desvio…» |
| R59 | `optimizacion-ruta-primera-del-dia.test.ts`: «R59: job `debounce` con la primera pendiente…»; `optimizacion-ruta-desvio.test.ts`: «R59: primera ruta pendiente… -> reoptimizar»; `optimizacion-ruta-reduccion.test.ts`: «R59: … no reduce» |
| R62 (servidor) | `mis-asignaciones-orden-ruta.test.ts`: describe «SLT-59 R62 — `primeraRutaPendiente` y `puntoRecogida`»; `sincronizar-ruta.test.ts`: describe «R62/R63 — `calcularRutaAlSalir`» (la parte de cliente es de frontend_dev) |
| R63 | `optimizacion-ruta-primera-del-dia.test.ts`: describe «T7.6 — R63/R66» (1001 m recalcula con `upsertOrigen` antes de `optimizar`; 1000 m, primera hecha, sin punto ×3, sin ruta, `desactualizada` en el enfriamiento y sin ubicación → `salida_no_aplica`, 0 llamadas y 0 escrituras) |
| R64 | `optimizacion-ruta-primera-del-dia.test.ts`: describe «T7.5 — R64/R67» (3 de 4, 4 de 5, `asignadas = 0`, sin ruta, el día que se pasa al conteo); `sincronizar-ruta.test.ts`: «R64 — `recogida_insuficiente`…» ×2; `orden-contar-asignadas-del-dia.test.ts` (×3) |
| R66 | `optimizacion-ruta-primera-del-dia.test.ts`: «R66: dos disparos de salida seguidos -> la segunda vez, 0 llamadas» |
| R67 | `optimizacion-ruta-primera-del-dia.test.ts`: «R67: con la primera ya hecha, `contarAsignadasDelDia` no se llama», «R67: un job con la primera pendiente no lee el conteo»; `mis-asignaciones-orden-ruta.test.ts`: «R67: no anade lecturas» |

### Salida real (NODE_OPTIONS=--max-old-space-size=8192, por grupos de 2-4)
```
desvio + reduccion + origen                         3 files, 99 passed (antes de R56/R59; luego verdes)
primera-del-dia + recuperacion + reduccion          3 passed, 58 passed (tras 1 ajuste de test)
primera-del-dia + service + credencial              3 passed (tras CALCULADA_HOY)
service + tramo-vivo + trazado                      3 passed, 62 passed
degradacion + ahorro-jornada + desvio               3 passed, 55 passed
sincronizar-ruta + recuperacion + origen            3 passed, 84 passed
contar-asignadas + mis-asignaciones-orden-ruta      2 passed, 20 passed
mis-asignaciones-{action,causa-devolucion,evidencias} 3 passed, 54 passed
mis-asignaciones-service + reserva-bloquea + orden-service 3 passed, 133 passed
SincronizarRutaButton + MisAsignacionesPage         2 passed, 26 passed
RepartoModule + RepartoModule477 + RepartoAyuda     3 passed, 133 passed
RepartoAyudaResuelta + MarcarLuego + ChatContacto + GestionarOrdenPanelHilo 4 passed, 31 passed
sincronizar-ruta + primera-del-dia + recuperacion (final) 3 passed, 76 passed
bulk-orden-service(.carga-api) + rol-admin-satelite-authz 3 passed, 118 passed
pnpm run typecheck   -> exit 0
pnpm run lint        -> 0 errors, 231 warnings (en mis archivos, 0 tras quitar un `_args`)
pnpm run test:guardias -> 6 rojos, de los que ninguno queda mio:
  - superficie-de-uso: `calcularRutaAlSalir` sin superficie -> anotada `@sin-superficie` (verde)
  - censo-order-status-rename: yo usaba `"por_recoger"`, codigo anterior a la 135 -> corregido a
    `"mensajero_recogiendo_en_bodega"` (verde para mis archivos). Queda
    `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts:327 por_recoger`, del otro agente.
  - dependencias-declaradas-presentes (4): init.sh no tiene el marcador del paso 2 / no invoca
    scripts/verificar-dependencias.mjs. init.sh y scripts/ sin cambios respecto a HEAD: preexistente.
```

### Desviaciones
- **Las funciones puras viven en `OptimizacionRutaService.ts`** (`primeraRutaPendiente`, `puntoDeRecogida`) y `MisAsignacionesService` las importa. Así se evita un archivo fuera de «Archivos esperados», y la pantalla y el servidor usan una sola regla.
- **`contarAsignadasDelDia` hace un `findMany` del estatus** en vez de `COUNT ... FILTER`. Es una lectura y pasa por la extensión de empresa sin SQL a mano. `dia` va en la convención `@db.Date` (`startOfDayCR`), la que ya usan `recogerLote` y el corte.
- **El código del estado.** Para «por recoger» se usa el código vigente `mensajero_recogiendo_en_bodega`. El design escribe `por_recoger` como nombre del glosario.
- **R7 con `salida`.** Una salida que llegara a la decisión con la ruta `desactualizada` sigue R7 como un automático. En la práctica no se alcanza: R63 exige la primera pendiente, y entonces la decisión es `primera_del_dia`.
- **R64 con `ruta === null`.** También aplica el mínimo. El glosario dice que la primera ruta está pendiente cuando la ruta no existe.
- **El `%` del mensaje de R64** sale de `deps.config ?? loadRouteOptimizationConfig()` en la acción. El resultado del servicio no lleva el porcentaje: tiene la forma del design.
- **`@sin-superficie` en `calcularRutaAlSalir`.** Es temporal, hasta que la cablee frontend_dev (T7.7).
- **Tests de componentes.** Solo se añadieron los dos campos nuevos a sus fixtures, sin cambiar ningún comportamiento.

Veredicto: T7.2, T7.5, T7.6, T7.7 (servidor) y el caso R59 de T7.4 hechos. Typecheck y lint sin errores, y todos los tests tocados y vecinos en verde. Los rojos de guardias que quedan son ajenos: uno del otro agente y cuatro preexistentes de init.sh.

## Tanda 7c — frontend_dev: T7.7 (UI) (2026-10-31)

Base: HEAD del worktree con la Tanda 7a (servidor de T7.7 hecho). Sin dependencias, sin base de datos. Grafo no consultado (cambio acotado a 4 archivos ya conocidos; Grep/Read).

### Archivos
- `app/(app)/mis-asignaciones/_components/RepartoModule.tsx`: prop nueva `umbralSalidaM?: number` y efecto de una vez (design §12.6). Con `ruta.primeraRutaPendiente`, `ruta.puntoRecogida`, al menos una parada con coordenadas en `porGestionar` (sin filtrar) y una lectura de `useSeguimientoUbicacion` (watchPosition) a MÁS de `umbralSalidaM` metros (`distanciaHaversineKm` de `lib/geo/polilinea`), llama UNA vez a `calcularRutaAlSalir({ ubicacion })`; un `useRef` impide repetir en el montaje. `ok` y `omitida: false` → eleva `trazado` (si viene) y `router.refresh()`; `omitida: true`, `conflict`, `forbidden`, error o excepción → nada, sin toast. Sin texto nuevo.
- `app/(app)/mis-asignaciones/reparto/page.tsx`: pasa `umbralSalidaM={loadRouteOptimizationConfig().RUTA_REOPT_DISTANCIA_M}` (la constante que nombra el design; existe en `lib/config/route-optimization.ts`, default 1000).
- `lib/actions/ruta-mensajero.ts`: borrada la línea `@sin-superficie` de `calcularRutaAlSalir` (única edición fuera de la UI).
- `tests/components/RepartoModule.test.tsx`: el mock de `@/lib/actions/ruta-mensajero` gana `calcularRutaAlSalir`; describe nuevo «disparo de salida de la primera ruta (SLT-59, R62/R65)» con `watchPosition` y `navigator.permissions` (granted) simulados.
- `specs/SLT-59-ahorro-llamadas-google-ruta/tasks.md`: [x] T7.7.

### Mapa R → test (`tests/components/RepartoModule.test.tsx`, describe «disparo de salida…»)
- R62: «a 900 m del punto de recogida no llama»; «a exactamente el umbral no llama (hace falta superarlo)»; «a 1100 m llama una vez con esa posición y refresca la pantalla»; «R62/R66: más lecturas lejos del punto no vuelven a llamar en el mismo montaje»; «sin la primera ruta pendiente nunca llama»; «sin punto de recogida nunca llama»; «sin ninguna parada con coordenadas nunca llama»; «si el servidor la omite, no refresca ni avisa»; «un conflicto del servidor no refresca ni muestra toast».
- R65: «con la primera ruta pendiente se ve lo de sin ruta: aviso, «Pendiente de optimizar» y marcadores sin número» (aviso «El orden mostrado no está actualizado», badge, paradas del mapa con `secuencia: null`). Los 107 casos previos del archivo siguen verdes.

### Salida real (NODE_OPTIONS=--max-old-space-size=8192, de uno en uno)
- `npx vitest run tests/components/RepartoModule.test.tsx` → Test Files 1 passed (1), Tests 117 passed (117), 87.70s.
- `npx vitest run tests/components/SincronizarRutaButton.test.tsx` → Test Files 1 passed (1), Tests 10 passed (10).
- `npx vitest run tests/unit/guards/superficie-de-uso.guardia.test.ts` → Test Files 1 passed (1), Tests 18 passed (18).
- `pnpm run typecheck` → `tsc --noEmit` sin errores.
- `npx eslint` sobre los 4 archivos tocados → 0 errors, 1 warning preexistente (`ordenCardsEnReparto` sin usar, línea 166 del test, no es de esta tanda).
- `pnpm run lint` (repo entero) → exit 0, «✖ 230 problems (0 errors, 230 warnings)».

### Desviaciones
- `umbralSalidaM` es OPCIONAL, no requerida: hay 9 montajes del módulo en 7 archivos de test y solo se podían correr dos. Sin la prop, el efecto no dispara nunca (0 llamadas facturadas), que es el desenlace seguro; la única pantalla real (`reparto/page.tsx`) la pasa siempre. Si el reviewer la quiere requerida, son 9 líneas mecánicas en esos tests.
- Se añadieron dos condiciones que pide el design y el encargo no listaba: hacen falta paradas con coordenadas (`hayParadasConCoordenadas`, §12.6 paso 1) y el caso del borde exacto del umbral, más dos casos de desenlace (`omitida` y `conflict`, sin refresh ni toast).

**Veredicto:** T7.7 (UI) hecha; R62 y R65 con test, typecheck y lint en verde (0 errors).

## Tanda 8 — backend_dev: T7.8, Fase 8 (T8.1-T8.5) (2026-10-31)

Base: HEAD 04a7d92. Sin base de datos, sin dependencias, sin migración. Grafo no consultado:
archivos ya conocidos de las tandas previas (Grep/Read).

**Estado: PARADA en T7.8 por discrepancia código ↔ design §8.0 (decisión humana).** La Fase 8
(T8.1-T8.5) NO se empezó, como pide el encargo: «si el código real no da esos números, no lo
fuerces, anota la discrepancia fila a fila y para».

### Archivos
- `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts`: reescrito contra design §8.0.
  - El arnés usa el código real de la recogida: `encolarPrimeraRutaPorRecogida` + `primeraRutaPendiente`, el mismo que `recogerLote`.
  - La gestión replica la condición real de `registrarGestionPendiente`: coordenadas o primera pendiente (R59).
  - Los dobles ahora llevan:
    - `contarAsignadasDelDia` real: 7 asignadas, las recogidas;
    - solo las recogidas en reparto;
    - `actualizadaAt` movido en cada escritura;
    - `encolarOMoverPendiente` con la semántica de D29.
  - Casos:
    - jornada A fila a fila;
    - filas 11-13 aparte;
    - jornada B;
    - las tres variantes.
- Nada más. No se tocó código de producción ni `tasks.md`.

### T7.8: lo MEDIDO frente a §8.0
Todos los conteos de **opt / routes** coinciden con §8.0, sin excepción. Solo difiere la
columna **jobs**, y siempre por la misma causa: **D29 (R76)**. La primera recogida parcial, con la
primera ruta pendiente, ya crea el job del día a +10 min. §8.0 es de la revisión 4 (anterior a D29)
y dice «la recogida se simula con el helper de R57/R58: encola solo en el último paquete», que ya no
es el código.

| Fila | §8.0 «Nuevo» | Medido | ¿Coincide? | Por qué |
| --- | --- | --- | --- | --- |
| 0 | 0 / 0 / 0 | 0 / 0 / **1** | no (jobs) | D29: la 1.ª recogida parcial (t=−10) crea el job del día a +10 min; las 3 siguientes lo mueven |
| 1 | 0 / 0 / 0 | 0 / 0 / 0 | sí | R64 `recogida_insuficiente` 4 de 7 |
| 1b | 1 / 1 / 1 | 1 / 1 / **0** | no (jobs) | el job ya existe: «recoger todas» lo MUEVE a +60 s (`origen = recogida`), no crea otro; corre a t=−4 y paga 1/1 |
| 2-10 | según tabla | idénticos | sí | — |
| **Total A** | **3 / 3 / 6** | **3 / 3 / 6** | sí | el job solo cambia de fila (0 en vez de 1b) |
| 11 | 1 llamada | 1 llamada, job `failed`, intentos 1 | sí | R29 |
| 12 | 0 / 0 / 0 | 0 / 0 / 0 (`enfriamiento`) | sí | R53 |
| 13 | 1 / 1 / 0 | 1 / 1 / 0 | sí | R53 |
| B1 | 0 / 0 / 0 | 0 / 0 / **1** | no (jobs) | D29: job del día a +10 min tras la última recogida (t=−5 → +5) |
| B2 | 0 / 0 / 0 | 0 / 0 / 0 | sí | R63 400 m |
| B3 | 1 / 1 / 0 | 1 / 1 / 0 | sí | R62 `salida` |
| B4 | 0 / 0 / 0 | 0 / 0 / 0 | sí | R63/R66 |
| **Total B** | **1 / 1 / 0** | **1 / 1 / 1** | no (jobs) | el job de D29 corre a t=+5 y 92/R20 lo descarta (`obsoleta`, 0 llamadas) |
| Var. primera gestión | 1 / 1 / 1 | 1 / 1 / **2** | no (jobs) | job de D29 + job de la gestión (R59); paga el de la gestión y el de D29 sale `obsoleta` |
| Var. botón 86 % | 1 / 1 / 0 | 1 / 1 / **1** | no (jobs) | job de D29, luego `obsoleta` (0 llamadas) |
| Var. botón 71 % | `conflict` «5 de 7» | `omitida/recogida_insuficiente`, 5 de 7, 0 llamadas | sí | la acción lo traduce a `conflict` (ya probado en `sincronizar-ruta.test.ts`) |

Lectura: **el dinero (llamadas facturadas) cuadra en todas las filas.** El job extra de D29 nunca
paga en estos escenarios: lo absorbe 92/R20. La tabla solo está desfasada en la columna de jobs
encolados, en sus filas de recogida.

Si B3 ocurre más de 10 min después de la última recogida, el job de D29 paga la primera ruta
(`primera_ruta_debounce_recogida`) y la salida ya no aplica (R63). Las llamadas siguen en 1 / 1.
§8.0 no fija el tiempo de B3; el test usa t=−3, dentro de los 10 min.

**Lo que hay que decidir (humano):**
- (a) Enmendar la columna jobs de §8.0 por D29:
  - A: fila 0 → `0/0/1` y fila 1b → `1/1/0`; el total `{3, 3, 6}` no cambia;
  - B: B1 → `0/0/1` y total `{1, 1, 1}`;
  - variantes: primera gestión → `1/1/2`, botón 86 % → `1/1/1`.
- (b) O cambiar el código para que la recogida parcial no cree el job. Esto contradice R76, que pide crearlo.

Recomendación técnica: (a). R76 obliga a crear el job en la recogida parcial, así que (b)
reabriría D29.

### Salida real (NODE_OPTIONS=--max-old-space-size=8192)
```
npx vitest run tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts
  6 tests | 4 failed
  ✓ filas 11-13 …   ✓ variante B 71 %
  × jornada A (solo filas 0 y 1b, columna jobs)   × jornada B (B1 jobs, total 1/1/1)
  × variante primera gestión (1/1/2)              × variante botón 86 % (1/1/1)
pnpm run typecheck -> tsc --noEmit, exit 0
npx eslint tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts -> sin salida (0 problemas)
```
El test queda **rojo a propósito**: afirma §8.0 tal cual está escrito. Cuando el humano decida,
basta con cambiar `NUEVO_A`, `NUEVO_B` y los totales de las dos variantes (opción a), o el código (opción b).

### Mapa R → test (esta tanda)
- R37: `optimizacion-ruta-ahorro-jornada.test.ts`, los 6 casos. 4 en rojo, solo por la columna jobs (ver arriba).
- R68-R77: sin cambios en esta tanda. Fase 8 no empezada.

### Desviaciones
- Las filas 12 y 13 necesitan un fallo previo con la ruta del día ya hecha y el conjunto sin
  cambios. Un job fallido no sirve: o es la primera ruta, y entonces el botón vuelve a pagarla
  (primera pendiente), o cambia el conjunto, y entonces el botón reoptimiza por fuera de orden o
  paradas nuevas. El fallo se provoca con una sincronización a mano desviada que recibe 401 (fuera de las filas).
  Después, el botón a 50 m de A da `enfriamiento` a los 2 min y paga a los 6 min.

**Veredicto:** T7.8 bloqueada por decisión humana. El código cumple §8.0 en llamadas
facturadas; la columna jobs de §8.0 no refleja D29. Fase 8 sin empezar.

## Tanda 9 — backend_dev: Fase 8 (T8.1-T8.3, sin jornada) (2026-10-31)

Base: HEAD 04a7d92, con el `optimizacion-ruta-ahorro-jornada.test.ts` de la Tanda 8 sin commitear.
No lo he tocado. Sin base de datos, sin dependencias, sin migración y sin escrituras en la base para
el registro (R74). No usé el grafo: los archivos ya eran conocidos (Grep/Read).

### Archivos
**Nuevos**
- `lib/clients/registro-llamada-google.ts` (T8.1) es la única fuente. Contiene:
  - `GOOGLE_API_LOG_PREFIJO` y `GOOGLE_API_LOG_EVENTO`;
  - los tipos `ApiGoogle`, `MOTIVOS_LLAMADA_RUTA`/`MotivoLlamadaRuta` (§13.1) y
    `MOTIVOS_LLAMADA_GEOCODE`/`MotivoLlamadaGeocode` (§13.2);
  - `ContextoLlamadaGoogle<M>` y `FUERA_DE_COLA` (1/1);
  - `registrarLlamadaGoogle`, que copia los campos uno a uno (R71) y emite
    `[google-api] {"evento":…,"api","motivo","empresaId","mensajeroId","ordenId","paradas","intento","maxIntentos","resultado"}`;
  - `resultadoDeFalloDeRed` (`timeout`/`red`) y `resultadoDeRespuesta` (`ok` o el estado HTTP);
  - `empresaDelContextoActual` (lee `contextoActual()`).
- `lib/logging/google-api-log.ts`: el canal real, `console.info`. Va fuera de `lib/clients/` por la
  guardia `credenciales-sin-consola-cruda`. A diferencia de `optlog`, no depende de `RUTA_DEBUG_LOG`.
- Tres tests nuevos: `tests/unit/clients/google-registro-llamada.test.ts` (22),
  `tests/unit/services/optimizacion-ruta-motivo.test.ts` (22) y
  `tests/unit/services/geocodificacion-motivo.test.ts` (14).

**Código modificado**
- T8.2, los clientes:
  - `IRouteOptimizationClient.optimizar`, `IRoutesClient.trazar` e `IGeocodeClient.geocodificar` exigen
    un 2.º parámetro `contexto` (R68). Sin él, no compila.
  - `google-route-optimization.ts`, `google-routes.ts` y `google-geocode.ts` aceptan
    `registro?` y `empresaId?` en el constructor. Emiten una línea justo después de la respuesta HTTP o
    del fallo de `fetch`. No la emiten en el token ni en las guardas previas.
  - `fallback-route-optimization.ts` pasa el contexto a los dos. `haversine` no registra.
- T8.3, rutas:
  - `OptimizacionRutaService`:
    - función pura nueva `motivoLlamadaRuta(decisión, disparo, origen)`;
    - `guardaSinRecalculo` devuelve ahora `{desenlace}` o `{reoptimizar: motivo}`;
    - `contextoLlamada` da el mismo contexto al `optimizeTours` y al `computeRoutes` de un recálculo;
    - la rama de una parada (92/R35) lleva su motivo;
    - `trazarTramoVivo` registra `trayecto_vivo` 1/1.
  - `EjecutarOptimizacionOpts.job?` lleva `{origen, intento, maxIntentos}`.
  - `optimizacion-ruta-handler.ts`:
    - pasa `payload.origen ?? null`, `job.intentos` (ya incrementado por el claim) y `job.maxIntentos`;
    - fija `empresaId` por llamada: en optimizeTours, la empresa de `deLaEmpresa()`; en Routes, la que
      resolvió el token de esa llamada, con un cliente por llamada.
  - `encolarOptimizacionDebounce` exige `origen: "gestion" | "traspaso"`.
    `GestionOrdenRepository` escribe `gestion` y el traspaso de `OrdenRepository` escribe `traspaso`.
    Con `ON CONFLICT DO NOTHING` queda el origen del primer evento (D28).
- T8.3, geocode:
  - `encolarGeocodificacion` exige un 4.º parámetro, `motivo`, y lo guarda en el payload.
    Los llamadores:
    - `OrdenRepository.encolarSiCambiaDireccion` pasa `direccion_cambiada`;
    - los dos lotes pasan `motivoGeocodeDeCarga(historial.origenTipo)`;
    - `AsignabilidadCoordenadasService` pasa `asignacion_sin_coordenadas`.
  - `GeocodificacionService` valida `payload.motivo` (enum, opcional). Pasa al cliente
    `{motivo ?? "job_sin_motivo", ordenId, intento, maxIntentos}`.
  - `GeocodeSaludRepository.revivirFallosConfig` añade
    `"payload" = jsonb_set(j."payload", '{motivo}', to_jsonb($revivido_por_salud::text))` al mismo UPDATE.
    Se actualizó el comentario de la interfaz.
  - `google-maps-probador.ts` pasa `prueba_integracion` 1/1.

**Tests ajustados**
- Solo la firma: `google-routes`, `google-route-optimization`, `fallback-route-optimization`,
  `google-geocode`, `geocodificacion-encolado`, `geocodificacion-service` (un `toHaveBeenCalledWith`)
  y `optimizacion-ruta-encolado`. Este último trae además el caso nuevo de D28.
- El payload con `origen`/`motivo`:
  - `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts`: la gestión afirma
    `origen: "gestion"` y el traspaso, `origen: "traspaso"`;
  - `orden-geocode-enqueue.test.ts`: `orden_creada` y `carga_masiva`;
  - `asignabilidad-coordenadas.test.ts`;
  - dos tests de BD que aquí no corren: `tests/integration/db/corregir-ubicacion-geocode.test.ts`
    (`direccion_cambiada`) y `geocode-recuperacion.test.ts` (el payload ahora es idéntico salvo
    `motivo = revivido_por_salud`).
- `specs/.../tasks.md`: [x] en T8.1, T8.2 y T8.3. T7.8, T7.9, T8.4 y T8.5 quedan como estaban.

### Qué ruta de `BulkOrdenService` es cuál (T8.3)
- `cargarMasiva` (BulkOrdenService:319) registra `origenTipo: "carga_masiva"` y llama a
  `createManyOrdenesConGuia` (:340) y a `createManyOrdenes` (:350). Motivo: `carga_masiva`.
- `cargarViaApi` (:628/:679) registra `origenTipo: "carga_api"` y llama a `createManyOrdenesConGuia`
  (:676). Es la API de la tienda, una orden suelta por petición. Motivo: `orden_creada`.
- El repositorio lo deriva de `historial.origenTipo`: `carga_masiva` da `carga_masiva` y cualquier otro
  da `orden_creada`. No cambió ninguna firma de `IOrdenRepository`.

### Mapa R → test (esta tanda)
- R68:
  - `pnpm run typecheck`: los tres métodos exigen el contexto; los llamadores sin él no compilan;
  - `google-registro-llamada.test.ts`.
- R69 (prefijo, evento y campos; los tres clientes con la misma constante; línea también en un fallo):
  `google-registro-llamada.test.ts`, en «T8.1» y «T8.2 — route_optimization / routes / geocoding / los tres
  clientes».
- R70:
  - `optimizacion-ruta-motivo.test.ts`: «intento 1 de 3 recibe un 500 y el 2 de 3 paga», «fuera de la cola
    … 1 de 1» y «el handler pasa el origen … y el intento»;
  - `geocodificacion-motivo.test.ts`: «R70: un reintento tras un 500».
- R71:
  - `google-registro-llamada.test.ts`: `sinPii` en cada cliente y «un campo de más … NO llega»;
  - el probador: «no contiene la clave».
- R72:
  - `google-registro-llamada.test.ts`: token OAuth, token que falla, Haversine y la guarda sin paradas;
  - `optimizacion-ruta-motivo.test.ts`: la guarda que omite, la recta de respaldo y sin Routes;
  - `geocodificacion-motivo.test.ts`: el acierto de caché.
- R73:
  - `optimizacion-ruta-motivo.test.ts`: un caso por motivo de §13.1, incluidos
    `reintento_ruta_desactualizada` y `job_sin_origen`, más la tabla pura completa;
  - `geocodificacion-motivo.test.ts`: un caso por motivo de §13.2, incluidos `job_sin_motivo`,
    `revivido_por_salud` y `prueba_integracion`.
- R74: ninguna escritura. `db/` sin cambios. El canal es `console.info` (`google-api-log.ts`).
- R76 (motivo): `optimizacion-ruta-motivo.test.ts`, «T7.9 — primera_ruta_debounce_recogida».
- D28: `optimizacion-ruta-encolado.test.ts`, «el job agrupado … conserva el origen del PRIMER evento».
  También `optimizacion-ruta-enqueue.test.ts` (gestión y traspaso).
- R75: **no** en esta tanda (T8.4, bloqueada con T7.8).

### Salida real (NODE_OPTIONS=--max-old-space-size=8192; de uno o dos archivos)
```
vitest run google-registro-llamada.test.ts                  -> 1 file, 22 passed
vitest run optimizacion-ruta-motivo.test.ts                 -> 1 file, 22 passed
vitest run geocodificacion-motivo.test.ts                   -> 1 file, 14 passed
google-routes + google-route-optimization                   -> 2 files, 55 passed
fallback-route-optimization + google-geocode                -> 2 files, 31 passed
geocodificacion-encolado + optimizacion-ruta-encolado       -> 2 files, 42 passed
geocodificacion-service + asignabilidad-coordenadas         -> 2 files, 108 passed
orden-geocode-enqueue + optimizacion-ruta-enqueue (integr.) -> 2 files, 40 passed
optimizacion-ruta-service + -desvio                         -> 2 files, 82 passed
-reduccion + -origen                                        -> 2 files, 60 passed
-primera-del-dia + -tramo-vivo                              -> 2 files, 29 passed
-trazado + -degradacion                                     -> 2 files, 25 passed
-credencial-rechazada + -recuperacion                       -> 2 files, 13 passed
-handler-payload + -token-por-empresa                       -> 2 files, 24 passed
google-maps-probador + integraciones.composition-root       -> 2 files, 20 passed
demo-qa-jobs + asignabilidad-coordenadas-autorizada         -> 2 files, 39 passed
integraciones-consumidores-composition-root + geocode-salud -> 2 files, 54 passed
geocodificacion-marcador-contrato + route-optimization-cfg  -> 2 files, 85 passed
mis-asignaciones-action + sincronizar-ruta                  -> 2 files, 87 passed
procesar-jobs-registro + geocode-recuperacion (BD)          -> 1 passed | 1 skipped (sin BD)

pnpm run test:guardias -> 1 failed | 319 passed | 3 skipped (323); 4 failed | 4504 passed
  los 4 rojos son de dependencias-declaradas-presentes.guardia.test.ts (baseline-rojos.json)
pnpm run lint          -> ✖ 230 problems (0 errors, 230 warnings); en mis archivos, 0 problemas
pnpm run typecheck     -> exit 2, UN solo error, en el archivo bloqueado (ver abajo)
```

### ⚠️ El typecheck rompe en el test bloqueado (no lo he arreglado, como pide el encargo)
```
tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts(579,61): error TS2345: Argument of type
'{ ahora: Date; debounceS: number; }' is not assignable to parameter of type
'{ ahora: Date; debounceS: number; origen: "gestion" | "traspaso"; }'.
  Property 'origen' is missing in type '{ ahora: Date; debounceS: number; }' but required in type
  '{ ahora: Date; debounceS: number; origen: "gestion" | "traspaso"; }'.
```
- Es el único error de todo el repo. No lo causa la firma de los clientes: esa no rompe el archivo,
  porque sus dobles con un parámetro menos siguen siendo asignables. Lo causa `origen`, ahora
  obligatorio en `encolarOptimizacionDebounce` (D28).
- El arreglo es de una línea: añadir `origen: "gestion"` en la llamada de la línea 579, la gestión del
  arnés. Lo hará quien retome T7.8/T8.4.
- Lo dejé obligatorio a propósito: así el compilador impide que un llamador nuevo encole sin origen.

### Desviaciones y decisiones
- **`empresaId` no va en el contexto.** Siguiendo §13.0, el cliente lo resuelve por una opción
  inyectable `empresaId?: () => string | null`. Por defecto usa `contextoActual()`, la empresa del
  drenador (`conSuEmpresa`). En rutas, el composition root lo fija con la empresa que puso la
  credencial.
  Límite: el probador de Maps no tiene una empresa a mano. Registra la del contexto activo, o `null`
  si la acción de prueba no corre dentro de `conEmpresa`. Eso no lo he verificado.
- **`optimizacion-rutas-probador.ts` no deja línea.** Solo pide el token OAuth (`token.obtener()`): no hay
  `optimizeTours` ni `computeRoutes` facturados, y R72 excluye el token. §13.1 lista
  `prueba_integracion` para ese probador, pero hoy no hay ninguna llamada que registrar. Si se quiere
  esa línea, el probador tendría que hacer una petición facturada real. Eso es decisión humana.
- **`resultado` es el estado HTTP, no el `status` del cuerpo.** Un geocode 200 con `REQUEST_DENIED`
  registra `ok`. Lo dice R69 («estado HTTP o red/timeout»).
- **Combinaciones fuera de la tabla de §13.1** (hoy no las produce ningún flujo). Se mapean al motivo
  más cercano, comentado en `motivoLlamadaRuta`:
  - traspaso con la primera pendiente → `paradas_nuevas_traspaso`;
  - recogida con paradas nuevas → el motivo de la recogida, porque el job corrió por esa espera (R76);
  - un manual sobre `desactualizada` → `recuperacion_ruta_caida`.
- **El payload de geocode cambia en `revivirFallosConfig`.** Contradice el R15 de la ficha 401 («no toca
  payload») en un solo campo, como pide §13.2. El test de BD `geocode-recuperacion` está actualizado,
  pero aquí no se pudo correr (sin BD).
- Sin `.serena/` ni otros cambios fuera del alcance.

**Veredicto:** T8.1-T8.3 hechas y en verde. Lint con 0 errores; guardias sin rojos nuevos. El typecheck
tiene un único error, en el test bloqueado `optimizacion-ruta-ahorro-jornada.test.ts:579`
(`origen` obligatorio), que no he arreglado por encargo. T8.4/T8.5 siguen pendientes de T7.8.

## Estado del implementer — 2026-10-31 (bloqueado en una decisión humana)

**Hecho y publicado:** Fase 6 (T6.1-T6.7), Fase 7 (T7.1-T7.7, T7.9) y Fase 8 (T8.1-T8.3).
`pnpm run typecheck` da 0 errores, después de añadir `origen: "gestion"` en la línea 579 de la jornada.
Lint da 0 errores. En `test:guardias` solo fallan los rojos de la baseline (`dependencias-declaradas-presentes`).

**Bloqueado: T7.8 → T8.4 → T8.5.** D29 (R76) hace que la recogida parcial cree el job del día. Por
eso la columna «jobs» de design §8.0 ya no cuadra (detalle en la «Tanda 8»): fila 0 +1, fila 1b −1,
B1 +1, total B `{1,1,1}` y variantes de B +1. Las llamadas facturadas cuadran en todas las filas.
`optimizacion-ruta-ahorro-jornada.test.ts` afirma §8.0 tal cual, así que 4 de sus 6 casos quedan
**en rojo a propósito** hasta que el humano decida:
- **(a), la que recomiendo:** enmendar la columna «jobs» de §8.0 por D29 con los valores medidos. Es
  una consecuencia mecánica de R76 y no cambia ninguna llamada. El implementer intentó editar el design
  aprobado y el permiso se lo denegó, así que la edición la hace spec_author o el humano.
- **(b):** cambiar el código para que la recogida parcial no cree el job. Eso contradice R76 y
  reabre D29.

Tras la decisión, quedan: ajustar los valores esperados de la jornada (T7.8), capturar la secuencia de
motivos §13.3 (T8.4) y el mapa final y el cierre (T8.5). T5.2 y T6.8 los cierra el CI del PR (D20).

**Otras dos para el humano o el reviewer (Tanda 9):**
- `optimizacion-rutas-probador.ts` solo pide el token OAuth y no hace ninguna llamada facturada, así
  que no emite `prueba_integracion`.
- Revivir un geocode reescribe `payload.motivo`, lo que choca con el «no toca payload» de la ficha 401.
  Así lo pide §13.2.

## Tanda 10 — backend_dev: T7.8, T8.4, T8.5 (2026-10-31)

Base: HEAD d006bf3 (§8.0 ya enmendada por D30). Sin base de datos, sin dependencias, sin migración y
sin cambios en el código de producción. No usé el grafo: el archivo de la jornada y los módulos que
llama ya los conocía de las tandas previas (Grep/Read).

### Archivos
- `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts`:
  - T7.8: los valores esperados de §8.0 enmendada (D30):
    - `NUEVO_A`: fila 0 `0/0/1` y fila 1b `1/1/0`; el total `{3, 3, 6}` no cambia;
    - `NUEVO_B`: B1 `0/0/1`, total `{1, 1, 1}`;
    - variantes: primera gestión `1/1/2` y botón al 86 % `1/1/1`. En el botón al 71 % se afirma
      ahora el conteo desde la primera recogida, `{0, 0, 1}` (aserción de jobs nueva), y que ese job
      es el de R76 (`pending`, `origen = recogida_parcial`);
    - jornada A afirma además que hay un solo job de recogida en todo el día (R58/R76).
  - T8.4: los dobles de Google emiten la línea `[google-api]` como los clientes reales: llaman a
    `registrarLlamadaGoogle` con el `contexto` que les pasa el servicio, y un logger que la captura
    (`lineasGoogleApi`). `medir` guarda las líneas de cada fila (`lineasPorFila`). Casos:
    - caso nuevo «T8.4/R75 — jornada A: las lineas [google-api] siguen la secuencia de motivos de §13.3»;
    - en el caso de las filas 11-13: fila 11, 1 línea `route_optimization`, motivo
      `primera_ruta_recogida_completa`, `resultado: "401"`, intento 1 de 3; fila 12 sin líneas;
      fila 13 `recuperacion_ruta_caida` ×2;
    - jornada B: B3 `primera_ruta_salida` ×2;
    - variantes: `primera_ruta_primera_gestion` ×2, `primera_ruta_boton` ×2 y 71 % sin líneas.
- `specs/SLT-59-ahorro-llamadas-google-ruta/tasks.md`: [x] en T7.8, T8.4 y T8.5. T5.2 y T6.8 quedan
  sin marcar.

### T8.4: §13.3 frente a lo que registra el código
**Sin discrepancia.** La fila 1b registra `primera_ruta_recogida_completa`, como dice §13.3.
- El job nace en la fila 0 con `origen = recogida_parcial`. En la fila 1b, «recoger todas» lo mueve y
  le reescribe el payload: `lib/services/jobs/optimizacion-ruta-encolado.ts:144`
  (`const origen = opts.quedanPorRecoger ? "recogida_parcial" : "recogida"`) y `:145-148`
  (`encolarOMoverPendiente(…, { mensajeroId, origen }, …)`). En la base, `JobRepository.encolarOMoverPendiente`
  hace `DO UPDATE SET … payload = EXCLUDED.payload`; el doble hace lo mismo.
- El motivo lo decide `motivoLlamadaRuta` en `lib/services/OptimizacionRutaService.ts:450-451`
  (`case "recogida": return "primera_ruta_recogida_completa"`).
- Secuencia medida de la jornada A, en orden: `1b` → `route_optimization` y `routes`,
  `primera_ruta_recogida_completa`; `6` → los dos, `sincronizacion_manual_desvio`; `7` → los dos,
  `entrega_fuera_de_orden`. Son 6 líneas en total.

Límite de la prueba: las líneas las emiten los dobles con la función real de registro. El código real
decide el motivo, el intento y el máximo de intentos. Que cada cliente real emita una línea por
petición ya lo prueba `google-registro-llamada.test.ts` (T8.2).

### Salida real (NODE_OPTIONS=--max-old-space-size=8192)
```
pnpm exec vitest run --reporter=verbose tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts
  [SLT-59 T7.8] jornada A — MEDIDO (opt / routes / jobs):
    0. t=-10 min — Recoge s1, s2, s3 y x de una en una, 1 por minuto (GPS en B): 0 / 0 / 1
    1. t=-6 min — Pulsa «Sincronizar» con 4 de 7 recogidas (57 %): 0 / 0 / 0
    1b. t=-5 min — «Recoger todas» con las 3 restantes (s4, s5, s6): 1 / 1 / 0
    2. t=5 min — Sincroniza a mano, GPS a 50 m de A: 0 / 0 / 0
    3. t=10 min — Gestiona x (sin coordenadas), GPS a 300 m: 0 / 0 / 0
    4. t=20 min — Entrega s1 y s2 con 20 s de diferencia: 0 / 0 / 1
    5. t=40 min — Entrega s3 a 1,5 km de la ruta: 0 / 0 / 1
    6. t=50 min — Sincroniza a mano a 1,5 km de la ruta (quedan s4, s5, s6): 1 / 1 / 0
    7. t=60 min — Entrega s5 antes que s4 (fuera de orden): 1 / 1 / 1
    8. t=80 min — Entrega s4 (queda s6): 0 / 0 / 1
    9. t=85 min — Sincroniza a mano a 200 m de la ruta, 1 parada: 0 / 0 / 0
    10. t=100 min — Entrega s6 (quedan 0): 0 / 0 / 1
    Total: 3 / 3 / 6
  [SLT-59 T7.8] jornada B — MEDIDO: B1 0/0/1 · B2 0/0/0 · B3 1/1/0 · B4 0/0/0 · Total: 1 / 1 / 1
  [SLT-59 T7.8] variante B, primera gestion — MEDIDO: B1 0/0/1 · B-gestion 1/1/1 · Total: 1 / 1 / 2
  [SLT-59 T7.8] variante B, boton 86 % — MEDIDO: B1 0/0/1 · B-boton 1/1/0 · Total: 1 / 1 / 1
  ✓ jornada A: la columna «Nuevo» fila a fila y en total {3, 3, 6}
  ✓ T8.4/R75 — jornada A: las lineas [google-api] siguen la secuencia de motivos de §13.3
  ✓ filas 11-13: el 401 cuesta 1 llamada; el boton respeta el enfriamiento y luego recupera
  ✓ jornada B: la salida a mas de 1000 m paga la primera ruta y nada mas, {1, 1, 1}
  ✓ variante B: la primera gestion antes de alejarse -> 1 / 1 / 2 (R59)
  ✓ variante B: el boton con 6 de 7 recogidas (86 %) -> 1 / 1 / 1 (R64)
  ✓ variante B: el boton con 5 de 7 recogidas (71 %) no paga, dice «5 de 7» y deja 0 / 0 / 1 (R64, R76)
  Test Files  1 passed (1)
       Tests  7 passed (7)

pnpm run typecheck   -> tsc --noEmit, exit 0 (0 errores)
pnpm exec eslint tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts -> sin salida, exit 0
pnpm run lint        -> ✖ 230 problems (0 errors, 230 warnings)   (preexistentes)
pnpm run test:guardias
  Test Files  1 failed | 319 passed | 3 skipped (323)
       Tests  4 failed | 4504 passed | 24 skipped (4532)
  los 4 FAIL, todos en tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts
  (guardia 420: R2, R6, R2/R6, R4), que está en tests/baseline-rojos.json
```

### R40/R74: `db/` sin cambios
```
$ git diff --stat dev -- db/
 .../20261029120000_plan_de_la_empresa/down.sql     |   4 -
 .../migration.sql                                  |  62 --------
 .../down.sql                                       | 104 -------------
 .../migration.sql                                  | 132 ----------------
 .../down.sql                                       | 167 ---------------------
 .../migration.sql                                  |  18 ---
 .../down.sql                                       |  26 ----
 .../migration.sql                                  |  36 -----
 db/schema.prisma                                   |  22 +--
 9 files changed, 1 insertion(+), 570 deletions(-)

$ git diff --stat dev...HEAD -- db/
(vacío)
$ git diff --stat HEAD -- db/
(vacío)
```
**El comando pedido no sale vacío, pero no por esta rama.** `dev` (62e3d89) avanzó después de la base de
la rama (merge-base 9573ab0) con migraciones de otras fichas: `git log HEAD..dev -- db/` da SLT-58
(`plan_de_la_empresa`, `plan_ciclo_inicio_elegido`) y SLT-68. La comparación de dos puntos muestra
esas filas como «borradas» en la rama. Contra la base (`dev...HEAD`) y contra el árbol de trabajo,
el diff de `db/` está vacío: SLT-59 no toca `db/`. Al sincronizar con `dev` (F2.3), esas migraciones
entran tal cual.

### Mapa R<n> → test final (R1-R77)
Comprobado con `[ -f ]` que existen los 26 archivos citados, y con `grep -F` que existe un fragmento
del título de cada R.

| R | Test (archivo › título) |
| --- | --- |
| R1 | `tests/unit/services/optimizacion-ruta-desvio.test.ts` › «R1: mismo conjunto…», «R1/R6/R9: 2+ paradas…» |
| R2 | `optimizacion-ruta-desvio.test.ts` › «R2/R6/R9: UNA parada…» |
| R3 | `optimizacion-ruta-desvio.test.ts` › «R3 — desviado SI Y SOLO SI…»; `tests/unit/geo/polilinea.test.ts` › «SLT-59 — distanciaMinimaAPolilineaM» |
| R4 | `optimizacion-ruta-desvio.test.ts` › «R4 — linea de referencia»; `polilinea.test.ts` › «SLT-59 — distanciaMinimaAPolilineaM» |
| R5 | `optimizacion-ruta-desvio.test.ts` › «R5: sin posicion…», «R5: con origen `centroide`…» |
| R6 | `optimizacion-ruta-desvio.test.ts` › «R1/R6/R9…», «R2/R6/R9…» (`escrituras() === 0`) |
| R7 | `optimizacion-ruta-desvio.test.ts` › casos `desactualizada` «R7…»; `tests/unit/services/optimizacion-ruta-reduccion.test.ts` › «R7: ruta desactualizada con un subconjunto…» |
| R8 | `tests/unit/services/optimizacion-ruta-service.test.ts` › «265/R33 — las guardas cortan EN ESTE ORDEN» |
| R9 | `optimizacion-ruta-desvio.test.ts` › «R1/R6/R9…», «R2/R6/R9…» (una lectura de cada) |
| R10 | `optimizacion-ruta-desvio.test.ts` › «R10: … calculada hace 8 h -> omitir» |
| R11 | RETIRADO (D16) → R41 |
| R12 | `optimizacion-ruta-reduccion.test.ts` › «R12/R17: la reduccion no reescribe la secuencia completa…»; `tests/integration/repositories/ruta-optimizada-repo.test.ts` › «R12/R17: calculada_at, origen…» |
| R13 | `optimizacion-ruta-reduccion.test.ts` › «R41/R13: entrega EN ORDEN…», «R13: queda UNA parada…» |
| R14 | RETIRADO (D16) → R42 |
| R15 | `optimizacion-ruta-reduccion.test.ts` › «R15: trazado guardado que no es por calles…»; `ruta-optimizada-repo.test.ts` › «sin trazado limpia las 4 columnas» |
| R16 | RETIRADO (D16) |
| R17 | `optimizacion-ruta-reduccion.test.ts` › «R12/R17…»; `ruta-optimizada-repo.test.ts` › «R12/R17…» |
| R18 | `optimizacion-ruta-reduccion.test.ts` › «R18/R49…» ×2; `ruta-optimizada-repo.test.ts` › «R18: con la huella cambiada no escribe NADA…» |
| R19 | RETIRADO (D24) → R51, R52 |
| R20 | `optimizacion-ruta-desvio.test.ts` › casos `paradas_nuevas` «R20…»; `optimizacion-ruta-reduccion.test.ts` › «R20: quita una y anade otra…» |
| R21 | `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts` › «SLT-59 R21» |
| R22 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R22 (acotado por R59) — …»; jornada › fila 3 |
| R23 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R23»; `tests/unit/services/optimizacion-ruta-encolado.test.ts` › «R23» |
| R24 | `optimizacion-ruta-encolado.test.ts` › «R24» |
| R25 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R25», «R16 y SLT-59 R25 — transacción REVERTIDA» |
| R26 | RETIRADO (D23) → R57, R58, R60 |
| R27 | RETIRADO (D16) → R44 |
| R28 | `tests/unit/actions/mis-asignaciones-action.test.ts` › «R28: si la reduccion lanza, la action devuelve EXACTAMENTE el mismo resultado» |
| R29 | `tests/unit/services/job-queue-service-permanente.test.ts` › «dead-letter en el intento 1 de 3…»; `tests/unit/services/optimizacion-ruta-credencial-rechazada.test.ts` › «R29/R35…»; jornada › «filas 11-13…» |
| R30 | `optimizacion-ruta-credencial-rechazada.test.ts` › «R30: el servicio conserva el orden previo…» |
| R31 | `tests/unit/actions/sincronizar-ruta.test.ts` › «SLT-59 R31 — 401/403 en la sincronizacion manual…» |
| R32 | `optimizacion-ruta-encolado.test.ts` › «R32» |
| R33 | `job-queue-service-permanente.test.ts` › «un error normal sigue con backoff (R33)» |
| R34 | `job-queue-service-permanente.test.ts` › «los demas tipos de job no cambian (R34)» |
| R35 | `optimizacion-ruta-credencial-rechazada.test.ts` › «R29/R35…» |
| R36 | `tests/unit/config/route-optimization-config.test.ts` › «SLT-59/R36, R55 — %s…» |
| R37 | `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts` › «jornada A: la columna «Nuevo» fila a fila y en total {3, 3, 6}», «filas 11-13…», «jornada B: … {1, 1, 1}» y las tres «variante B: …» |
| R38 | `route-optimization-config.test.ts` › «SLT-59/R38 — RUTA_SYNC_MIN_INTERVALO_S sigue en 10…» |
| R39 | `tests/guards/guard-dependencias-aprobadas.test.ts` (verde en `test:guardias`) |
| R40 | Revisión del diff: `git diff --stat dev...HEAD -- db/` vacío (ver arriba) |
| R41 | `optimizacion-ruta-reduccion.test.ts` › «R41/R13: entrega EN ORDEN (prefijo) con tramos -> 0 llamadas…» |
| R42 | `optimizacion-ruta-desvio.test.ts` › «R42: fuera de orden con el mensajero SOBRE la ruta…»; jornada › fila 7 |
| R43 | `optimizacion-ruta-reduccion.test.ts` › «R43: quitar la ULTIMA…» |
| R44 | `optimizacion-ruta-reduccion.test.ts` › «SLT-59 T2.4/T6.3 — reducirSinLlamadas (R44…)»; `mis-asignaciones-action.test.ts` › «SLT-59 R44/R28 — …» |
| R45 | `sincronizar-ruta.test.ts` › «SLT-59 R45 — ruta vigente, mismo conjunto y sin desvio…» |
| R46 | `tests/unit/services/optimizacion-ruta-origen.test.ts` › «SLT-59 R46 — manual con ubicacion que no recalcula…», «SLT-59 R46 — el desvio se mide con la ubicacion RECIBIDA…» |
| R47 | `optimizacion-ruta-desvio.test.ts` › «D18/R47: polilinea `routes` que decodifica a 0 puntos…», «R47 acotado…» |
| R48 | `ruta-optimizada-repo.test.ts` › «R48: con la ruta `desactualizada` y la huella IGUAL…»; `tests/integration/db/ruta-optimizada-reduccion-sql-real.test.ts` › «R48: …» ×3 |
| R49 | `optimizacion-ruta-reduccion.test.ts` › «R18/R49…», «R49: la rama de UNA parada…»; `sincronizar-ruta.test.ts` › «SLT-59 R49…» |
| R50 | `ruta-optimizada-reduccion-sql-real.test.ts` › «R50: una reduccion en el contexto de A no toca … B…» |
| R51 | `optimizacion-ruta-desvio.test.ts` › «R51: automatico NO decodifica la polilinea», «R51: job de la cola… 0 llamadas»; jornada › fila 5 |
| R52 | `optimizacion-ruta-desvio.test.ts` › «R52: manual…»; `optimizacion-ruta-reduccion.test.ts` › «R52 (antes R19): manual, prefijo…»; jornada › fila 6 |
| R53 | `tests/unit/services/optimizacion-ruta-recuperacion.test.ts` (enfriamiento 4 min 59 s / 5 min); jornada › «filas 11-13…» |
| R54 | `optimizacion-ruta-recuperacion.test.ts` › «R54: la cota es `updated_at`…» |
| R55 | `route-optimization-config.test.ts` › «SLT-59/R55 — RUTA_PRIMERA_MIN_RECOGIDO_PCT es un porcentaje: 1-100» |
| R56 | `optimizacion-ruta-reduccion.test.ts` › «R56: manual, ruta vigente, prefijo reducido y sin desvio…» |
| R57 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R57 — con la primera ruta del dia ya calculada, recoger NO encola» |
| R58 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R58 — …»; jornada › fila 1b |
| R59 | `tests/unit/services/optimizacion-ruta-primera-del-dia.test.ts` › «R59: job `debounce` con la primera pendiente…»; `optimizacion-ruta-desvio.test.ts` › «R59: primera ruta pendiente… -> reoptimizar»; jornada › «variante B: la primera gestion…» |
| R60 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R60 — …» |
| R61 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R61 — una nueva asignacion NO encola…» |
| R62 | `tests/unit/services/mis-asignaciones-orden-ruta.test.ts` › «SLT-59 R62 — `primeraRutaPendiente` y `puntoRecogida`»; `sincronizar-ruta.test.ts` › «R62/R63 — `calcularRutaAlSalir`»; `tests/components/RepartoModule.test.tsx` › «disparo de salida de la primera ruta (SLT-59, R62/R65)» |
| R63 | `optimizacion-ruta-primera-del-dia.test.ts` › «T7.6 — R63/R66»; jornada › «jornada B…» (B2, B4) |
| R64 | `optimizacion-ruta-primera-del-dia.test.ts` › «T7.5 — R64/R67»; `sincronizar-ruta.test.ts` › «R64 — `recogida_insuficiente`…»; `tests/integration/repositories/orden-contar-asignadas-del-dia.test.ts`; jornada › fila 1 y «variante B: el boton…» ×2 |
| R65 | `RepartoModule.test.tsx` › «con la primera ruta pendiente se ve lo de sin ruta: aviso, «Pendiente de optimizar» y marcadores sin número» |
| R66 | `optimizacion-ruta-primera-del-dia.test.ts` › «R66: dos disparos de salida seguidos -> la segunda vez, 0 llamadas» |
| R67 | `optimizacion-ruta-primera-del-dia.test.ts` › «R67: con la primera ya hecha, `contarAsignadasDelDia` no se llama»; `mis-asignaciones-orden-ruta.test.ts` › «R67: no anade lecturas» |
| R68 | `pnpm run typecheck` (exit 0: los tres clientes exigen el contexto); `tests/unit/clients/google-registro-llamada.test.ts` › «T8.1» |
| R69 | `google-registro-llamada.test.ts` › «T8.1» y «T8.2 — route_optimization / routes / geocoding / los tres clientes» |
| R70 | `tests/unit/services/optimizacion-ruta-motivo.test.ts` › «intento 1 de 3 recibe un 500 y el 2 de 3 paga»; `tests/unit/services/geocodificacion-motivo.test.ts` › «R70: un reintento tras un 500»; jornada › fila 11 (intento 1 de 3) |
| R71 | `google-registro-llamada.test.ts` › `sinPii` en cada cliente, «un campo de más … NO llega» |
| R72 | `google-registro-llamada.test.ts` › token OAuth, Haversine, guarda sin paradas; `optimizacion-ruta-motivo.test.ts` › la guarda que omite y la recta de respaldo; `geocodificacion-motivo.test.ts` › acierto de caché |
| R73 | `optimizacion-ruta-motivo.test.ts` › un caso por motivo de §13.1; `geocodificacion-motivo.test.ts` › un caso por motivo de §13.2 |
| R74 | Revisión del diff: ninguna escritura, `db/` sin cambios (`git diff --stat dev...HEAD -- db/` vacío); canal `console.info` en `lib/logging/google-api-log.ts` |
| R75 | jornada › «T8.4/R75 — jornada A: las lineas [google-api] siguen la secuencia de motivos de §13.3», más las aserciones de líneas de «filas 11-13…», «jornada B…» y las tres variantes |
| R76 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R57/R76 — recogida parcial con la primera ruta pendiente: un job del dia a +10 min»; `tests/integration/repositories/job-repo-posponer.test.ts` › «SLT-59 R76 — crea la fila y luego la MUEVE mientras siga pending»; `optimizacion-ruta-motivo.test.ts` › «T7.9 — primera_ruta_debounce_recogida»; jornada › filas 0 y B1, y el botón al 71 % |
| R77 | `optimizacion-ruta-enqueue.test.ts` › «SLT-59 R77 — …»; `job-repo-posponer.test.ts` › «SLT-59 D29 — el SQL…», «SLT-59 R77 — …» |

Retirados (6): R11, R14, R16, R19, R26 y R27. Cubiertos por revisión del diff: R40 y R74.
**R vigente sin test: ninguno.**

### Notas
- El *Hecho* de T7.8 en `tasks.md` aún dice «jornada B `{1, 1, 0}`». Ese valor lo cambió D30 en
  §8.0, que es la fuente del test, y la jornada afirma `{1, 1, 1}`. No toqué el texto de la task:
  lo corrige spec_author si hace falta.
- `git diff --stat dev -- db/` no sale vacío por el avance de `dev`, no por esta rama (ver arriba).

**Veredicto:** T7.8, T8.4 y T8.5 hechas. La jornada da 7/7 en verde contra §8.0 (D30) y §13.3, sin
discrepancia en los motivos. Typecheck 0 errores, lint 0 errores, guardias solo con los rojos de la
baseline, y SLT-59 no cambia `db/`.
