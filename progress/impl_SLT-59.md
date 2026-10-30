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
