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
