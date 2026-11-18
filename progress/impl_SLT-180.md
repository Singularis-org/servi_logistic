# SLT-180 «Siembra propia en tests de API keys, historial y borrado de órdenes» — bitácora (backend_dev)

## Entorno
- Bases desechables vía `scratchpad/con-desechable.cjs` (sin leer `.env` ni ver URLs), migradas
  (`migrate deploy`) + `pnpm run db:seed`, igual que `gate.yml`. Postgres local **18.2** (CI usa 17).
  - **A** `servi_slt180_desechable`: vacía (solo catálogos). R1040.
  - **B** `servi_slt180b_desechable`: + empresa AJENA confirmada con
    `scratchpad/slt180-otra-empresa.tmp.ts` (fuera del repo; variante de la de SLT-179 que además
    siembra 1 API key): 1 organización, zona central y satélite, 2 tarifas, 6 usuarios (mensajero,
    adminTienda, maestro, adminSatelite, admin + la cuenta dedicada de la key), 40 órdenes,
    40 gestiones, 1 `cierre_dia`, 1 `api_key`. R1041.
- `prisma generate` no se ejecutó. Nada de `lib/ app/ components/ hooks/ db/ scripts/ .github/
  package.json` tocado (`git diff --name-only origin/dev -- …` vacío). `_postgres-real.ts`,
  `454/_escenario.ts` y todo `_fixtures/` sin cambios (R1049 no aplica: ningún helper tocado; se
  IMPORTAN `crearFksDeOrden`/`crearUsuarioDePrueba` y, en `emisor`, `limpiarEmpresas` de
  `_fixtures/fulfillment-94.ts`).

## T1 — antes (base A, JSON de vitest)
Los 15 dieron los p/f/s de la tabla del spec: 13 con 0/0/n por `fksDeOrden` en el `beforeAll`;
`historial-accion-lectura` 0/16/2 («hacen falta al menos 2 usuarios»); `orden-traspaso-migration`
4/1/10. Los 15 seguían en el baseline citando SLT-180.

## T2-T4 — qué se sembró
Patrón común: sale `fksDeOrden(prisma)` (y todo `usuario.findFirst/findMany` sin clave) del
`beforeAll`; dentro de la tx revertida de CADA caso, tras `serializarEscriturasReales`,
`crearFksDeOrden(tx)` (+ `crearUsuarioDePrueba` donde hacía falta otro usuario) y control positivo
`expect(count, "SLT-180: la … sembrada no esta en la base").toBe(n)`. Catálogos por clave.

| archivo | además | control positivo |
|---|---|---|
| `api-key-eliminabilidad` | — | tienda 1, zona 1 |
| `api-key-eliminar-fk-inesperada` | maestro sembrado (antes `findFirst` rol maestro) | tienda+maestro 2, zona 1 |
| `api-key-eliminar-tienda-destino` | maestro sembrado | maestro 1, zona 1 |
| `tarifa-zona-borrado-fk-real` | maestro sembrado; el mensajero del cierre, sembrado (antes «el primer usuario») | tienda+maestro 2, zona 1 |
| `historial-accion-atomicidad` | actor de R3/R4 y plantilla de `sembrarUsuario` = la tienda sembrada (antes `findFirstOrThrow` sin filtro) | tienda 1, zona 1 |
| `historial-accion-lectura` | corpus: actores A=`maestro` y B=`admin` sembrados (roles distintos: el nombre del fixture lleva el rol, así buscar por el nombre de A no alcanza a B); bloque 424: FKs sembradas y `cedula` por clave | actores 2; tienda 1, zona 1 |
| `historial-accion-q1-ubicacion` | — | tienda 1, zona 1 |
| `emisor-relaciones-anidadas` | **R1043**: el paso 4 lee por el POOL, fuera de tx → gestión CONFIRMADA en empresa propia (`crearOrganizacion` + `fijarEmpresa`, bajo `bajoLockDeEscrituraReal`); `afterAll` la borra con `limpiarEmpresas` y CUENTA 0 filas (organización, usuario, orden, gestión). El paso 4 lee esa gestión por id (antes «el universo entero acotado a 1 fila») | gestión confirmada 1; por caso tienda+mensajero 2, zona 1 |
| `486-evidencias-cierres-sql-real` | tienda/mensajero con rol por clave (`adminTienda`/`mensajero`) y `cedula` por clave (antes plantilla «primer usuario») | zona 1, tienda+mensajero 2 |
| `eliminar-orden-api-frontera-tienda` | 2 tiendas sembradas (antes `usuario.findMany take 2`) | tiendas 2, zona 1 |
| `eliminar-orden-pantalla-frontera-tienda` | ídem | tiendas 2, zona 1 |
| `orden-eliminada-actor-admin` | `cedula` por clave (antes plantilla «primer usuario») | tienda 1, zona 1 |
| `orden-remision-borrada-libera-numero` | tienda modelo sembrada por caso | tienda 1, zona 1 |
| `orden-traspaso-migration` | `tipoIdentificacion` por clave (antes `findFirst`) | tienda 1, zona 1 |
| `notificacion-bloqueo-otro-cierre-avisa` | mensajero sembrado, limpio por construcción (antes búsqueda de uno «limpio» entre 10) | `{mensajero 1, zona 1, avisosPrevios 0, cierresAbiertos 0}` |

R1045: ningún `it`/`expect` de comportamiento quitado ni debilitado; ningún literal esperado
cambiado. Número de casos por archivo igual antes/después (JSON). R1044: ningún `return` antes de
la primera aserción; si falta un catálogo, lanza nombrándolo.

## Resultado (JSON de vitest, los 15 juntos) — p/f/s
| archivo | antes (A) | A (vacía) | B (empresa ajena) |
|---|---|---|---|
| `486-evidencias-cierres-sql-real` | 0/0/6 | 6/0/0 | 6/0/0 |
| `api-key-eliminabilidad` | 0/0/10 | 10/0/0 | 10/0/0 |
| `api-key-eliminar-fk-inesperada` | 0/0/3 | 3/0/0 | 3/0/0 |
| `api-key-eliminar-tienda-destino` | 0/0/2 | 2/0/0 | 2/0/0 |
| `eliminar-orden-api-frontera-tienda` | 0/0/1 | 1/0/0 | 1/0/0 |
| `eliminar-orden-pantalla-frontera-tienda` | 0/0/5 | 5/0/0 | 5/0/0 |
| `emisor-relaciones-anidadas` | 0/0/4 | 4/0/0 | 4/0/0 |
| `historial-accion-atomicidad` | 0/0/22 | 22/0/0 | 22/0/0 |
| `historial-accion-lectura` | 0/16/2 | 18/0/0 | 18/0/0 |
| `historial-accion-q1-ubicacion` | 0/0/5 | 5/0/0 | 5/0/0 |
| `notificacion-bloqueo-otro-cierre-avisa` | 0/0/1 | 1/0/0 | 1/0/0 |
| `orden-eliminada-actor-admin` | 0/0/5 | 5/0/0 | 5/0/0 |
| `orden-remision-borrada-libera-numero` | 0/0/9 | 9/0/0 | 9/0/0 |
| `tarifa-zona-borrado-fk-real` | 0/0/9 | 9/0/0 | 9/0/0 |
| `orden-traspaso-migration` | 4/1/10 | **13/2/0** (otra causa) | 13/2/0 |

R1043: conteo de B antes y después de la suite idéntico (`organizacion 1, zona 2, usuario 6,
orden 40, gestion_orden 40, cierre_dia 1, tarifa_zona_mensajero 2, api_key 1`, resto 0); en A, 0 en
todas las tablas tras la suite (la empresa confirmada de `emisor` no deja rastro).

## El que sigue rojo — `orden-traspaso-migration` (R1048 → SLT-187)
Ya sembrado, los 13 casos de base pasan; quedan 2 rojos que no son falta de datos (medido local
2026-11-17, A y B):
- `427/T2 … su timestamp es POSTERIOR …` (`:114`): `expected [ …(136) ] to deeply equal [ …(33) ]`.
  La lista de migraciones posteriores a la 427 acaba en `20261021120000`; detrás están las de SL-17
  (`20261022130100_organizacion_id_en_negocio`) y siguientes. Ya fallaba antes (era el 1 de 4/1/10).
- `427/T3 ⭑ (a) las columnas …` (`:294`): espera 9 columnas y hay 10: SL-17 añadió `organizacion_id`
  a `orden_traspaso_mensajero` (`20261022130100_organizacion_id_en_negocio/migration.sql:230`).
Ambos son «tests de migración desfasados tras SL-17» → SLT-187 «Tests de migración desfasados tras
SL-17». Motivo reescrito en el baseline, `desde` intacto. No es un fallo de producción.

## T6 — mutaciones (base A, una a una, `git checkout --` tras cada una, árbol limpio)
La fila sembrada se sustituye por un uuid que nadie sembró (`…0000aa`). Script:
`scratchpad/mut180.cjs` (fuera del repo).

| archivo | fila quitada | p/f/s | caso rojo | mensaje |
|---|---|---|---|---|
| `api-key-eliminabilidad` | zona | 0/10/0 | «una cuenta LIMPIA…» | «SLT-180: la zona sembrada no esta en la base» |
| `api-key-eliminar-fk-inesperada` | maestro | 0/3/0 | R16 | «SLT-180: la tienda y el maestro sembrados no estan en la base» |
| `api-key-eliminar-tienda-destino` | zona | 0/2/0 | R5 | «SLT-180: la zona sembrada no esta en la base» |
| `tarifa-zona-borrado-fk-real` | maestro | 0/9/0 | «ZONA con una orden…» | «SLT-180: la tienda y el maestro sembrados no estan en la base» |
| `historial-accion-atomicidad` | tienda | 0/22/0 | R10 | «SLT-180: la tienda sembrada no esta en la base» |
| `historial-accion-lectura` | actor B | 2/16/0 | ANTI-VACUIDAD | «SLT-180: los dos actores sembrados no estan en la base» |
| `historial-accion-q1-ubicacion` | zona | 0/5/0 | (1) DIRECCION | «SLT-180: la zona sembrada no esta en la base» |
| `emisor-relaciones-anidadas` | mensajero | 0/0/4 + suite FAIL (`beforeAll`) | los 4 | «SLT-180: la tienda y el mensajero sembrados no estan en la base»; el `afterAll` limpió (A quedó a 0) |
| `486-evidencias-cierres-sql-real` | mensajero | 0/6/0 | CONTROL POSITIVO | «SLT-180: la tienda y el mensajero sembrados no estan en la base» |
| `eliminar-orden-api-frontera-tienda` | tienda ajena | 0/1/0 | R3/R4/R7 | «SLT-180: las dos tiendas sembradas no estan en la base» |
| `eliminar-orden-pantalla-frontera-tienda` | tienda B | 0/5/0 | R2 | «SLT-180: las dos tiendas sembradas no estan en la base» |
| `orden-eliminada-actor-admin` | zona | 0/5/0 | ANTI-VACUIDAD | «SLT-180: la zona sembrada no esta en la base» |
| `orden-remision-borrada-libera-numero` | tienda modelo | 0/9/0 | EL CASO DE PRODUCCION | «SLT-180: la tienda modelo sembrada no esta en la base» |
| `orden-traspaso-migration` | zona | 8/7/0 (vs 13/2) | (b), CONTROL (b), (c)×2, motivo 300 | «SLT-180: la zona sembrada no esta en la base» |
| `notificacion-bloqueo-otro-cierre-avisa` | mensajero | 0/1/0 | R44 | «SLT-180: el mensajero y la zona sembrados no estan en la base …» |

## T7 — baseline
`tests/baseline-rojos.json`: 128 → 114 claves; se borran las 14 de los verdes (56 líneas) y se
reescribe el `motivo` de `orden-traspaso-migration` (SLT-187), `desde` intacto. Ninguna otra
entrada cambia.

## Mapa R → evidencia
| R | evidencia |
|---|---|
| R1040, R1042, R1044, R1045 | los 15 archivos en A (tabla de resultado), diff revisado; controles positivos |
| R1041, R1043 | los mismos en B; conteo de B igual antes/después; A a 0 tras la suite; `afterAll` de `emisor` cuenta 0 |
| R1046 | tabla T6 |
| R1047 | diff del baseline: −14 claves del alcance, 1 motivo reescrito |
| R1048 | `orden-traspaso-migration` → SLT-187 (arriba) |
| R1049 | no se tocó ningún helper compartido |
| R1050, R1052 | `git diff --name-only origin/dev -- lib/ app/ …` vacío; tamaño abajo |
| R1051 | pendiente del CI del PR |

## Salidas
- `pnpm run typecheck`: exit 0.
- `pnpm exec eslint` sobre los 15 archivos tocados: exit 0, sin salida.
- `node scripts/tamano-pr.mjs`: 16/40 archivos, 0/1000 producción, 759/3000 tests (antes de esta
  bitácora y del spec).
- `./init.sh` en la base A: ver `## Gate`.

## Gate
`./init.sh` en la base A (log `scratchpad/gate-180.log`): **INIT_EXIT=0** a la primera. Tandas de
vitest 100/100, 100/100, 100/100 y 82/82 archivos en verde; `vitest related` corrió los archivos
del alcance (p. ej. `api-key-eliminabilidad`, `historial-accion-lectura`, `emisor-relaciones-anidadas`,
`tarifa-zona-borrado-fk-real`, `notificacion-bloqueo-otro-cierre-avisa`) y pasaron. Tamaño en el gate:
16/40 archivos, 0/1000 producción, 759/3000 tests.

## Veredicto
14 de 15 verdes en base vacía y con empresa ajena y fuera del baseline; `orden-traspaso-migration`
sembrado (13/2/0) y en el baseline por SL-17 → SLT-187 «Tests de migración desfasados tras SL-17».

## CI del PR #213 (run 44235155028) — `tarifa-zona-borrado-fk-real` vuelve al baseline
En CI (Postgres 17) el `gate-completo` salió rojo por un único archivo fuera del baseline:
`tarifa-zona-borrado-fk-real`, caso «⭑ el error REAL de la FK no es un `P2003`: la comprobacion
ingenua NO lo caza», `:382`: «la comprobacion ingenua ahora SI caza el error: expected true to be
false». En local (Postgres 18.2) el archivo pasa 9/0/0 en las dos bases. La siembra no es la causa:
es un test-cicatriz cuyo resultado depende del entorno. Decisión del leader (2026-11-18): vuelve al
baseline con su `desde` original (`2026-10-22`, el de `origin/dev`) y motivo medido en CI, citando
SLT-186 «Tests con estados retirados del catálogo» (alcance «tests desfasados»). El test no se toca;
la siembra se queda. Retirados del baseline: 13 (128 → 115 claves); se quedan 2 de los 15
(`orden-traspaso-migration` → SLT-187, `tarifa-zona-borrado-fk-real` → SLT-186).
