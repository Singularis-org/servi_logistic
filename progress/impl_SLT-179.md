# SLT-179 «Siembra propia en tests de corrección, gestión y reparto» — bitácora (backend_dev)

## Entorno
- Bases desechables vía `scratchpad/con-desechable.cjs` (sin leer `.env` ni ver URLs), migradas
  (`migrate deploy`) + `pnpm run db:seed`, igual que `gate.yml`. Postgres local **18.2** (CI usa 17).
  - **A** `servi_slt179_desechable`: vacía (solo catálogos). R1020.
  - **B** `servi_slt179b_desechable`: + empresa AJENA confirmada con
    `scratchpad/slt179-otra-empresa.tmp.ts` (fuera del repo): 1 organización, zona central y
    satélite, 2 tarifas, 5 usuarios (mensajero, adminTienda, maestro, adminSatelite, admin),
    40 órdenes (una por estado y zona), 40 gestiones, 1 `cierre_dia`. R1021.
- `prisma generate` no se ejecutó. Ningún archivo de `lib/ app/ components/ hooks/ db/ scripts/
  .github/ package.json` tocado; `_postgres-real.ts`, `454/_escenario.ts` y
  `_fixtures/orden-minima.ts` sin cambios (R1029 no aplica: no se tocó ningún helper compartido).

## T1 — antes (base A, JSON de vitest)
Los 15 tal como estaban: los mismos p/f/s de la tabla del spec (13 con 0/0/n por `fksDeOrden` en el
`beforeAll`; `novedades-sin-gestionar-aviso-dedupe` 0/5/0 y `reparto-manana-repository` 0/10/0 con
«la tabla `orden` está vacía»). Ninguno pasaba; los 15 estaban en el baseline citando SLT-179.

## T2-T4 — qué se sembró
Patrón común: `fksDeOrden(prisma)` del `beforeAll` sale; dentro de la tx revertida de CADA caso,
tras `serializarEscriturasReales`, `crearFksDeOrden(tx)` (y `crearUsuarioDePrueba` donde hacía falta
otro usuario) + control positivo con mensaje «SLT-179: la … sembrada no esta en la base». Catálogos
por clave (`tipoIdentificacion` por `value: "cedula"` en `efectos` y `traspaso`).

| archivo | además | control positivo |
|---|---|---|
| `correccion-dia-reparto-efectos.int` | `findFirst` de `tipoIdentificacion` → por clave | tienda 1, zona 1 |
| `correccion-dia-reparto-historial.int` | `ACTOR_NOMBRE` se lee de la tienda sembrada | tienda ≠ null, zona 1 |
| `correccion-dia-reparto.int` | zona AJENA sembrada en la tx; `Semilla.zonaId` → `zonaAjena: boolean` (el id se resuelve dentro de la tx) | tienda 1, zonas 2 |
| `correccion-fecha-reprogramacion.int` | mensajero `crearUsuarioDePrueba` (antes «el primer usuario») | usuarios 2, zona 1 |
| `correccion-resultado-gestion.int` | tienda/vehículo de la tienda sembrada | zona 1, tienda ≠ null |
| `corregir-datos-cliente.repo` | central SIEMPRE creada en la empresa del caso (antes `findFirst esCentral` sin empresa); R30 compara con la zona sembrada en ESE caso | tienda 1, zona 1 |
| `corregir-ubicacion-geocode` | la carga de `it.each` se construye dentro de la tx | tienda 1, zona 1 |
| `deshacer-asignacion-zona-satelite.int` | central y satélite propias (antes `findFirst` global de cada una) | central 1, satélite 1 |
| `deshacer-gestion-conserva-reserva.int` | — | tienda 1, zona 1 |
| `gestion-desde-ayuda-dia-reserva.int` | — | tienda 1, zona 1 |
| `gestiones-detalle-api-405` | 2 tiendas + 2 mensajeros sembrados (antes `usuario.findMany take 2`) | usuarios 4, zona 1 |
| `novedades-sin-gestionar-aviso-dedupe` | usuario modelo sembrado; `SELECT … usuario LIMIT 1` → `WHERE id = modelo` | usuario 1 |
| `recoger-lote-dia-reserva.int` | — | tienda 1, zona 1 |
| `reparto-manana-repository` | tienda modelo sembrada por caso | tienda 1 |
| `traspaso-mensajero.int` | `tipoIdentificacion` por clave | tienda 1, zona 1 |

R1025: ningún `it`/`expect` sobre el comportamiento cambió ni se quitó; ningún literal esperado
cambió. Los `expect(fks).not.toBeNull()` de `novedades` (que afirmaban «hay una orden en la base»)
se sustituyen por el control positivo `usuario.count === 1` del modelo sembrado. Número de casos por
archivo: igual (comparado en el JSON antes/después).

## Resultado (JSON de vitest, los 15 juntos)
| archivo | A (vacía) | B (empresa ajena) |
|---|---|---|
| `correccion-dia-reparto-historial.int` | 9/0/0 | 9/0/0 |
| `correccion-fecha-reprogramacion.int` | 23/0/0 | 23/0/0 |
| `correccion-resultado-gestion.int` | 14/0/0 | 14/0/0 |
| `corregir-ubicacion-geocode` | 11/0/0 | 11/0/0 |
| `deshacer-asignacion-zona-satelite.int` | 6/0/0 | 6/0/0 |
| `deshacer-gestion-conserva-reserva.int` | 8/0/0 | 8/0/0 |
| `gestion-desde-ayuda-dia-reserva.int` | 5/0/0 | 5/0/0 |
| `novedades-sin-gestionar-aviso-dedupe` | 5/0/0 | 5/0/0 |
| `recoger-lote-dia-reserva.int` | 7/0/0 | 7/0/0 |
| `reparto-manana-repository` | 10/0/0 | 10/0/0 |
| `correccion-dia-reparto-efectos.int` | 0/0/11 (catálogo) | ídem |
| `correccion-dia-reparto.int` | 0/0/18 (catálogo) | ídem |
| `corregir-datos-cliente.repo` | 0/0/22 (catálogo) | ídem |
| `gestiones-detalle-api-405` | 0/0/12 (catálogo) | ídem |
| `traspaso-mensajero.int` | 0/0/24 (catálogo) | ídem |

R1023: ningún caso siembra filas confirmadas (todo en tx revertida). Conteo de B antes y después de
la suite idéntico (`organizacion 1, zona 2, usuario 5, orden 40, gestion_orden 40, cierre_dia 1,
tarifa_zona_mensajero 2`); en A, 0 en todas tras la suite.

## Los 5 que siguen rojos — PARADA (R1028): ninguna ficha del board cubre la causa
Ya sembrados, caen en el `beforeAll` por **otra causa**: exigen en el catálogo `order_status`
estados que la **ficha 454 retiró** (`db/migrations/20260923120200_retiro_estados_454/migration.sql:143`
borra `ayuda_tienda` y `devolucion_por_confirmar`). Son tests desfasados tras 454, no falta de datos.
Medición local 2026-11-17, base A:

| archivo | primer error | tras quitar el estado retirado (experimento, revertido) |
|---|---|---|
| `correccion-dia-reparto-efectos.int` | `Error: el catalogo \`order_status\` no tiene ayuda_tienda` (:97) | 10/1: R26 «NO tiene policies» — ya hay policies (SL-17 → SLT-187) |
| `correccion-dia-reparto.int` | ídem (:85) | 17/1: R23 columnas del rastro, hay 8 y espera 7 (SL-17 → SLT-187) |
| `corregir-datos-cliente.repo` | ídem (:97); `ayuda_tienda` solo está en la lista del catálogo, no se usa | 22/0 |
| `gestiones-detalle-api-405` | `Error: falta el estado \`devolucion_por_confirmar\`` (:166) | 10/2: R19 el detalle emite 15 consultas, el contrato dice 14 |
| `traspaso-mensajero.int` | `Error: el catalogo \`order_status\` no tiene ayuda_tienda` (:88) | 22/2: R4 «`ayuda_tienda` se traspasa» (estado inexistente) y T9.9 el payload del job lleva `origen` además de `mensajeroId` |

Su entrada del baseline **no se ha tocado** (sigue con el motivo «base vacía» y SLT-179): hace
falta que el leader decida la ficha (¿una nueva «tests desfasados tras 454»?, ¿ampliar SLT-187?)
antes de reescribir el motivo. La siembra de esos 5 sí queda hecha y commiteada. Ninguno apunta a
un fallo de producción: son expectativas de los tests contra un catálogo/contrato que cambió.

## T6 — mutaciones (base A, una a una, `git checkout --` tras cada una, árbol limpio)
La fila sembrada se sustituye por un uuid que nadie sembró (`…0000aa`).

| archivo | fila quitada | p/f/s | caso rojo | mensaje |
|---|---|---|---|---|
| `correccion-dia-reparto-historial.int` | zona | 0/9/0 | R37/R38 | «SLT-179: la zona sembrada no esta en la base» |
| `correccion-fecha-reprogramacion.int` | mensajero | 0/23/0 | «a fecha FUTURA…» | «SLT-179: la tienda y el mensajero sembrados no estan en la base» |
| `correccion-resultado-gestion.int` | zona | 1/13/0 | R6/R7 | «SLT-179: la zona sembrada no esta en la base» |
| `corregir-ubicacion-geocode` | tienda | 0/11/0 | R19 | «SLT-179: la tienda sembrada no esta en la base» |
| `deshacer-asignacion-zona-satelite.int` | zona satélite | 0/6/0 | orden en `en_ruta_bodega_satelite` | «SLT-179: la zona satelite sembrada no esta en la base» |
| `deshacer-gestion-conserva-reserva.int` | tienda | 0/8/0 | R17 | «SLT-179: la tienda sembrada no esta en la base» |
| `gestion-desde-ayuda-dia-reserva.int` | zona | 0/5/0 | R30 | «SLT-179: la zona sembrada no esta en la base» |
| `novedades-sin-gestionar-aviso-dedupe` | usuario modelo | 0/5/0 | «dos corridas el MISMO día» | `PrismaClientKnownRequestError` (la tienda clonada de un modelo inexistente no nace) |
| `recoger-lote-dia-reserva.int` | zona | 0/7/0 | R1/R8 | «SLT-179: la zona sembrada no esta en la base» |
| `reparto-manana-repository` | tienda modelo | 1/9/0 | R1 «3 para mañana…» | `PrismaClientKnownRequestError` (FK de tienda) |

Los 5 rojos por catálogo: sin mutación útil (caen antes, en el `beforeAll`).

## T7 — baseline
`tests/baseline-rojos.json`: 152 → 142 claves; solo se borran las 10 de los verdes (40 líneas, 0
añadidas). Las 5 rojas, intactas (ver parada).

## Mapa R → evidencia
| R | evidencia |
|---|---|
| R1020, R1022, R1024, R1025 | los 10 verdes en A (tabla de resultado), diff revisado; controles positivos |
| R1021, R1023 | los mismos 10 en B, conteo de B igual antes/después |
| R1026 | tabla T6 |
| R1027 | diff del baseline: −10 claves del alcance, nada más |
| R1028 | 5 archivos: PARADA, sin ficha que cubra la causa (arriba) |
| R1029 | no se tocó ningún helper compartido |
| R1030, R1032 | `git diff --name-only origin/dev` solo `tests/`, `specs/`, `progress/`; tamaño abajo |
| R1031 | pendiente del CI del PR |

## Salidas
- `pnpm run typecheck`: exit 0. `eslint` sobre los archivos tocados: 0 errores (1 aviso: el JSON del
  baseline no tiene config de eslint).
- `node scripts/tamano-pr.mjs`: 16/40 archivos, 0/1000 producción, 707/3000 tests.
- `./init.sh` en la base A (log `scratchpad/gate-179.log`): **INIT_EXIT=0** a la tercera. Las dos
  primeras dieron 1 por un timeout de 20 s en una guardia distinta cada vez
  (`backfills-retirados.guardia`, luego `otp-debug-solo-en-pruebas.guardia`), con la máquina cargada;
  aisladas pasan en 2,5 s y 7 s. No tocan nada de este diff. En el gate, `novedades`,
  `correccion-fecha-reprogramacion` y `reparto-manana-repository` corrieron y pasaron.

## Veredicto
10 de 15 verdes en base vacía y con empresa ajena y fuera del baseline; 5 sembrados pero rojos por
estados retirados en 454 → parada R1028, a la espera de que el leader asigne ficha.

## Decisión del leader (2026-11-17) sobre los 5 parados
Van a SLT-186 «Tests con estados retirados del catálogo», que amplía su alcance a «tests desfasados
tras 454» con las causas de segundo nivel medidas. En `tests/baseline-rojos.json` se reescriben sus 5
motivos (primera causa + lo que viene detrás, citando SLT-186), con `desde` intacto. Tasks T1-T8
marcadas en el spec; T8 con «CI del PR pendiente».
