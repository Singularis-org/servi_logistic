# SLT-43 «Geografía jerárquica: modelo y migración» — bitácora del implementer

Worktree: `.worktrees/SLT-43-geo-jerarquica-modelo` · rama `feature/SLT-43-geo-jerarquica-modelo`.
Spec: `specs/SLT-43-geo-jerarquica-modelo/` (aprobado por Camilo el 2026-10-29).

## T0 — Precondiciones (2026-10-29)

- T0.1: PR #29 mergeado en `dev` (merge `cbd538b`). Guardia: `tests/guards/migraciones-destructivas.guard.test.ts`,
  corte `20261027120000`; solo mira `migration.sql`, nunca `down.sql`.
- T0.2: `git merge-base HEAD origin/dev` = `cbd538b` = `origin/dev`.

## Base de datos de la feature

Base local propia `logistic_slt43` en `localhost:5432` (no la de desarrollo `logistic`). Postgres
local 16.1, base UTF-8 con collation/ctype `Spanish_Colombia.1252`.

Creada el 2026-10-29 con `pg` (no hay `psql`): `CREATE DATABASE logistic_slt43` conectando a la base
`postgres` con las credenciales del `.env` principal; luego, con `DATABASE_URL` apuntando a
`…/logistic_slt43?schema=public` y `DIRECT_URL=` vacía, `pnpm exec prisma migrate deploy` y
`pnpm run db:seed`. El `.env` no se copia al worktree: la URL se exporta en cada comando.

**(Resuelto en la tanda 2.)** `20261029120200_nodo_geografico` estaba aplicada en `logistic_slt43`
solo con la función de T2.1. Al completarla en T2.2 cambia su checksum: antes de `migrate deploy`,
`DROP FUNCTION geo_normalizar_nombre(text)` y borrar su fila de `_prisma_migrations` (o recrear la base).

## Tandas

### Tanda 1 — T1.1, T1.2, T1.3, T2.1 (2026-10-29)

**Archivos creados**
- `db/migrations/20261029120000_geo_enums_nodo_geografico/{migration,down}.sql`
- `db/migrations/20261029120100_tipo_nivel_geografico/{migration,down}.sql`
- `db/migrations/20261029120200_nodo_geografico/{migration,down}.sql` (solo `geo_normalizar_nombre`; T2.2 completa)
- `tests/unit/types/historial-accion-entidades.test.ts`
- `tests/integration/db/geo-tipo-nivel.test.ts`
- `tests/integration/db/geo-normalizar-nombre.test.ts`

**Archivos modificados**
- `db/schema.prisma`: `nodo_geografico` en los dos enums; modelo `TipoNivelGeografico`; `Pais.tiposDeNivel`.
- `lib/types/historial-accion.ts`: `nodo_geografico` en `HISTORIAL_ACCION_ENTIDADES` y `ENTIDAD_LABELS`.
- `lib/types/historial-accion-etiquetas.ts`: `FuentesEtiqueta.nodo_geografico = { nombres }` y su constructor.
- `app/(app)/historico/acciones/_components/historial-acciones-filtros-def.ts`: `ENTIDADES_SIN_ESCRITOR`
  y el filtro de entidad sin `nodo_geografico`.
- `lib/db/modelos-de-negocio.ts`: `TipoNivelGeografico` en `MODELOS_DE_PLATAFORMA` (cabecera 23 → 24).
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`: recuento de entidades 27 → 28 (seis
  aserciones de recuento; el enum crece por diseño).
- `tests/unit/components/historial-acciones-filtros-def.test.ts`: el filtro ofrece las entidades menos
  `ENTIDADES_SIN_ESCRITOR`.

**Decisiones de implementación**
- `down.sql` de 120000 es `SELECT 1;` con la explicación (design §3).
- Ids de `tipo_nivel_geografico` sin DEFAULT en la base (`@default(uuid())` en Prisma; el SQL usa
  `gen_random_uuid()::text`): así el diff de Prisma sale vacío.
- `geo_normalizar_nombre`: marcas U+0300–U+036F (design) y la lista exacta de espacios de `\s` de JS en
  vez de `[[:space:]]`, que depende de la configuración regional.
- R10: idéntica a `normalizeName` en los 585 nombres de la geografía de `logistic_slt43` y en la lista
  de casos. Fuera de la geografía, con `Spanish_Colombia.1252`, `lower()` no pasa a minúscula el
  dígrafo `ǅ` (U+01C5) y JS sí; no aparece en ningún nombre. Repetir R10 en el ensayo (design §9).

**Mapa R → test (esta tanda)**
| R | Test |
|---|---|
| R1, R2, R3 | `tests/integration/db/geo-tipo-nivel.test.ts` |
| R10 | `tests/integration/db/geo-normalizar-nombre.test.ts` |
| R12 (lado tipos) | `tests/integration/db/geo-tipo-nivel.test.ts` (el de nodos va en `geo-nodo-rls.test.ts`, T2.2) |
| R23 (lado TS) | `tests/unit/types/historial-accion-entidades.test.ts` (el lado base va en la ida y vuelta, T6.1) |

**Verificación (salida real, `DATABASE_URL` → `logistic_slt43`, `NODE_OPTIONS=--max-old-space-size=8192`)**
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script`: `-- This is an
  empty migration.` tras 120000, tras 120100 y tras 120200.
- `pnpm run typecheck`: exit 0. `eslint` sobre los 9 archivos tocados: sin salida (limpio).
- `geo-tipo-nivel.test.ts` 6/6 · `geo-normalizar-nombre.test.ts` 4/4 · `historial-accion-entidades.test.ts`
  4/4 · `catalogo-y-choke-point.test.ts` + `historial-acciones-filtros-def.test.ts` 66/66.
- Guardias: `organizacion-en-modelos`, `rls-por-empresa`, `plataforma-solo-en-lista`, `fk-misma-empresa`
  verdes. `migraciones-destructivas` ROJA por `20261028120000_modulo_wallet_nucleo` (de `dev`, sin
  `DESTRUCTIVA.md`; ninguna de SLT-43 aparece). No es de esta rama: no se toca.
- Suites SL-20/374 (`geografia-*`, `pais-*`, `carga-division`, `migracion-sl20-ida-y-vuelta`): 17/21
  archivos verdes. Rojos: `geografia-superadmin-sin-empresa` (por SLT-43, ver pregunta), `carga-division`
  (arrastre: el anterior dejó su superadmin al fallar la limpieza; limpiado a mano en `logistic_slt43`),
  `geografia-historico-intacto` y `geografia-ordenes-sin-entregar` (base sin órdenes; ajeno).
- `vitest related` sobre `lib/db/modelos-de-negocio.ts` / `lib/types/historial-accion*.ts` arrastra casi
  toda la suite de base (los importa la extensión de Prisma): se cortó. Sus rojos vistos son de base
  vacía («`orden` esta vacia», «faltan la zona central…»), ninguno menciona objetos de SLT-43.

**Pregunta abierta (bloquea T1.3):** la FK `tipo_nivel_geografico.pais_id → pais` es
`RESTRICT/RESTRICT` (design §2.1) y el trigger crea tipos para todo país nuevo. La limpieza de
`geografia-superadmin-sin-empresa.test.ts` (`limpiarPais`, SL-20) hace `DELETE FROM pais` tras borrar
geografía e historial, y ahora falla con `23503 tipo_nivel_geografico_pais_id_fkey`. R36 pide esa suite
verde sin tocarla. Opciones: (a) FK `ON DELETE CASCADE` hacia `pais` (los nodos siguen en `RESTRICT`, así
que un país con geografía sigue sin poder borrarse); (b) añadir `tipo_nivel_geografico` a la limpieza
del test; (c) otra que decida el humano.

**Veredicto:** T1.1, T1.2 y T2.1 hechas; T1.3 implementada según design pero bloqueada por la pregunta.

### Tanda 2 — regresión, T1.3 (enmienda), T2.2, T2.3 (2026-10-29)

**Comprobación de regresión (antes de nada).** `geografia-historico-intacto` y
`geografia-ordenes-sin-entregar` fallan igual en `origin/dev` (`cbd538b`) sin SLT-43: base aparte
`logistic_slt43_dev` (migrate deploy + db:seed desde un worktree temporal de `origin/dev`) → 2 suites
rotas, 16 saltados, «hay DATABASE_URL pero `orden` esta vacia». En `logistic_slt43` con esta rama: lo
mismo, 2 rotas, 16 saltados, mismo mensaje. **Veredicto: entorno (base sin órdenes), no regresión.**
El worktree temporal se creó en `%TEMP%\wd43` y no en el scratchpad: allí la ruta a
`.prisma/client/package.json` pasa de 260 caracteres y Node no lee su `imports` (`ERR_PACKAGE_IMPORT_NOT_DEFINED`).
Worktree eliminado y base `logistic_slt43_dev` borrada al terminar.

**Archivos creados**
- `tests/integration/db/_fixtures/geo-43.ts` (T2.3): `tiposDeNivel`, `insertarNodo`/`SQL_INSERTAR_NODO`/
  `argumentosDeNodo` y `crearEscenarioGeo43` (país `XA`, empresa, provincia «1» y cantón «1», dos
  distritos, orden con y sin distrito, `zona_distrito`, `distrito_zona_especial`, cierre con dos filas
  de `cierre_detail`, una con `distrito_nombre` y otra sin él).
- `tests/integration/db/geo-nodo-invariantes.test.ts` (R4–R9, R11).
- `tests/integration/db/geo-nodo-rls.test.ts` (R12, lado nodos).

**Archivos modificados**
- `db/migrations/20261029120100_tipo_nivel_geografico/migration.sql`: FK a `pais` `ON DELETE CASCADE ON
  UPDATE RESTRICT` (enmienda de Camilo, opción (a)). `down.sql` sin cambios (la FK cae con la tabla).
- `db/migrations/20261029120200_nodo_geografico/{migration,down}.sql`: completa (design §2.2, §3). La
  función de T2.1 conserva sus bytes exactos (md5 comparado con el commit `3e871f5`).
- `db/schema.prisma`: `TipoNivelGeografico.pais` `onDelete: Cascade` y back-relation `nodos`; modelo
  `NodoGeografico`; `Pais.nodosGeograficos`.
- `lib/db/modelos-de-negocio.ts`: `NodoGeografico` en `MODELOS_DE_PLATAFORMA` (cabecera 24 → 25).
- `tests/integration/db/geo-tipo-nivel.test.ts`: caso CASCADE (sin nodos borra los tipos; con nodos 23503).
- `specs/SLT-43-geo-jerarquica-modelo/tasks.md`: T1.3 y T2.2 `[x]`; T2.3 creado, sin marcar (su criterio
  es que lo usen T3–T6).

**Decisiones de implementación**
- Plan A de design §2.2 funciona: la auto-relación `[padreId, paisId]` con `padreId` opcional y `paisId`
  obligatorio deja `prisma migrate diff` vacío, sin `dbgenerated()`. No hizo falta el plan B.
- `ruta TEXT[] NOT NULL`: Prisma genera `TEXT[]` sin NOT NULL para `String[]`, pero el diff sale vacío
  con el NOT NULL del SQL. `nombre_normalizado` y `ruta` sin DEFAULT: los pone siempre el trigger.
- R14: las comprobaciones van después de crear `geo_normalizar_nombre` (la necesitan) y antes de la
  tabla; todo en una transacción, así que si abortan no queda nada. SQLSTATE `SLT43` con las tres cifras.
- R7: SQLSTATE `SLT43`. Con padre inexistente el trigger no lanza: deja que la FK compuesta dé 23503.
- R8 (descendientes): un `UPDATE` por nivel de profundidad, de arriba abajo, y no uno para todo el
  subárbol como decía design §2.2. Motivo: el trigger de invariantes de cada fila recalcula la ruta
  leyendo la de su padre, y dentro de una sentencia el orden de filas no está garantizado (un nieto
  podría leer la ruta vieja de su padre). Sigue usando el GIN (`ruta @> ARRAY[id]`). El test mueve un
  nodo con dos niveles por debajo.
- Copia (R13): 7 provincias, 84 cantones, 494 distritos de CR → 585 nodos, `cardinality(ruta) =
  profundidad` en los 585.

**Base `logistic_slt43`:** 120100 y 120200 reaplicadas (DROP de la función, el trigger y la tabla de
tipos + borrado de sus dos filas de `_prisma_migrations`, luego `migrate deploy`).

**Mapa R → test (esta tanda)**
| R | Test |
|---|---|
| R4, R5, R6, R7, R8, R9, R11 | `tests/integration/db/geo-nodo-invariantes.test.ts` |
| R12 (lado nodos) | `tests/integration/db/geo-nodo-rls.test.ts` |
| Enmienda FK CASCADE (design §2.1) | `tests/integration/db/geo-tipo-nivel.test.ts` |

**Verificación (salida real, `DATABASE_URL` → `logistic_slt43`)**
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script`: `-- This is an
  empty migration.`
- `pnpm run typecheck`: exit 0. `eslint` sobre los 5 TS tocados: «No issues found».
- `geo-nodo-invariantes` 8/8 · `geo-nodo-rls` 2/2 · `geo-tipo-nivel` 7/7 · `geo-normalizar-nombre` 4/4
  (21/21).
- Guardias: `organizacion-en-modelos`, `rls-por-empresa`, `fk-misma-empresa`, `plataforma-solo-en-lista`
  verdes; `migraciones-destructivas` roja solo por `20261028120000_modulo_wallet_nucleo` (ajena; ninguna
  `202610291*`). 62/63.
- SL-20 (`geografia-*`, `pais-*`, `carga-division`, `migracion-sl20-ida-y-vuelta`): 19/21 archivos, 217
  pasados, 16 saltados. Verdes incluidos `geografia-superadmin-sin-empresa` (sin tocarlo) y
  `carga-division`. Rojos: `geografia-historico-intacto` y `geografia-ordenes-sin-entregar` (entorno, ver
  arriba).
- `vitest related` sobre `db/schema.prisma`/`lib/db/modelos-de-negocio.ts` no se corrió: arrastra casi
  toda la suite de base (visto en la tanda 1).

**Veredicto:** regresión descartada; T1.3 y T2.2 hechas; T2.3 creado y en uso, a marcar cuando lo usen T3–T6.

### Tanda 3 — T3.1 hecha; T3.2 bloqueada (pregunta); T4 sin empezar (2026-10-29)

**Archivos creados**
- `db/migrations/20261029120300_nodo_geografico_sincronia/{migration,down}.sql` (design §2.3): tres funciones
  `SECURITY DEFINER` con `search_path = public` (`geo_sincronizar_provincia|canton|distrito`) y tres triggers
  `AFTER INSERT OR UPDATE OR DELETE … FOR EACH ROW` (`<tabla>_sincroniza_nodo_geografico`).
- `tests/integration/db/geo-sincronia-geografia.test.ts` (R15–R18), 8 casos; usa `crearEscenarioGeo43` y
  `tiposDeNivel` del fixture `geo-43.ts` (sin cambios en el fixture).

**Archivos modificados**
- `specs/SLT-43-geo-jerarquica-modelo/tasks.md`: T3.1 `[x]`; nota de bloqueo en T3.2.

**Decisiones de implementación (desviaciones menores del design)**
- El upsert lleva `WHERE (…) IS DISTINCT FROM (EXCLUDED…)` en el `DO UPDATE`: un UPDATE de la fila vieja que
  no cambia nada del nodo (p. ej. `provincia.zona_id`) no reescribe el nodo. El test lo comprueba por `xmin`,
  con contraprueba.
- El tipo se busca con una subconsulta escalar dentro de `VALUES`: si faltara el `nivel_N` del país, el NOT
  NULL de `tipo_id` falla en vez de dejar la fila vieja sin nodo en silencio.
- Borrado en cascada: las acciones de las FK viejas (`RI_ConstraintTrigger_*`) se disparan antes que los
  triggers de sincronía por orden de nombre; la orden queda con `distrito_id` NULL (FK vieja `SET NULL`) y
  las filas de zona caen antes de borrar el nodo. Cubierto en el test de R17.

**Mapa R → test (esta tanda)**
| R | Test |
|---|---|
| R15 | `geo-sincronia-geografia.test.ts` («el alta de SL-20 crea el nodo…», «la carga CSV (`importarDivision`)…») |
| R16 | ídem («`renombrar` y `cambiarActivacion`…», «cambio de padre … código y país», «UPDATE que no cambia nada», y los códigos completados por la carga) |
| R17 | ídem («el borrado físico borra el nodo…») |
| R18 | ídem («`canton.pais_id` sigue saliendo del padre y la sincronía no escribe historial») |
| Riesgo design §9 | ídem («un homónimo normalizado … falla entero con 23505»: `GeoRepository.crear` → P2002, SQL → 23505, sin fila vieja ni historial) |

**Verificación (salida real, `DATABASE_URL` → `logistic_slt43`)**
- `prisma migrate deploy`: 120300 aplicada. `prisma migrate diff --from-config-datasource --to-schema
  db/schema.prisma --script`: `-- This is an empty migration.`
- `pnpm run typecheck`: 0 errores. `eslint tests/integration/db/geo-sincronia-geografia.test.ts`: limpio.
- `geo-sincronia-geografia.test.ts`: 8/8.
- Guardias: `fk-misma-empresa`, `organizacion-en-modelos`, `plataforma-solo-en-lista`, `rls-por-empresa`
  verdes; `migraciones-destructivas` roja solo por `20261028120000_modulo_wallet_nucleo` (ajena; no nombra
  ninguna `202610291*`). 62/63.
- T3.2 — `geo-*`, `geografia-*`, `pais-*`, `carga-division`, `migracion-sl20-ida-y-vuelta` (26 archivos):
  22 verdes, 243 pasados, 3 fallados, 16 saltados.
  - `geografia-historico-intacto`, `geografia-ordenes-sin-entregar`: base sin órdenes (entorno, igual en `dev`).
  - `geografia-registro-accion` (2 casos) y `geografia-renombrado` (1 caso, en otra corrida): el actor es
    `usuario.findFirst()` del `beforeAll`, que en paralelo puede ser el superadmin temporal de otro archivo,
    borrado al acabar → `actor_usuario_id` NULL. Solos pasan 31/31 (dos corridas). Los dos archivos están en
    `tests/baseline-rojos.json`. No es de SLT-43.
  - **`carga-division.test.ts` › «decision 4: con dos homonimos normalizados bajo el mismo padre, gana el
    primero (por id)»: ROJO POR SLT-43.** `migracion-sl20-ida-y-vuelta` verde.

**Pregunta abierta (bloquea T3.2 y, por la regla de parar, T4):** el test siembra por Prisma directo, bajo
la misma provincia, los cantones «San Jose» y «San José» («datos heredados»: el único viejo compara el
nombre literal). Con la sincronía, el segundo `canton.create` falla con 23505 en
`nodo_geografico_padre_id_nombre_normalizado_key` (R9). No es un `DELETE` de limpieza: es el estado que R14
declara imposible en el modelo nuevo, y R9 + R15 obligan a rechazarlo. Ninguna vía de la app lo crea (el
service compara por forma normalizada, 374/375; `planificarDivision` deduplica). Opciones:
- (a) Cambiar solo la preparación de ese caso (no sus aserciones): sembrar los dos homónimos con la
  sincronía apagada para ese `tx` (`ALTER TABLE canton DISABLE TRIGGER canton_sincroniza_nodo_geografico`
  dentro de la transacción revertida), o reescribir la siembra para que no dependa de datos que R14 prohíbe.
  Requiere permiso explícito porque R36 pide la suite sin tocar.
- (b) Que la sincronía no cree nodo cuando choca el nombre normalizado (capturar 23505 y seguir): deja una
  fila vieja sin nodo, rompe R15 y lo detectaría la equivalencia (R32). No recomendada.
- (c) Quitar el único `(padre_id, nombre_normalizado)` del nodo hasta SLT-48: rompe R9. No recomendada.
Recomendación: (a).

**Veredicto:** T3.1 hecha y verde; T3.2 bloqueada por un caso de `carga-division` que choca con R9 vía la
sincronía; T4.1/T4.2 no empezadas (dependen de la respuesta según la regla de parar).

### Tanda 4 — T3.2 (excepción autorizada), T4.1, T4.2, T4.4 (2026-10-29)

**Archivos creados**
- `db/migrations/20261029120400_columnas_nodo_geografico/{migration,down}.sql` (design §2.4): cuatro `ADD COLUMN`
  nullable sin DEFAULT, tres FK `NOT VALID` (`orden` RESTRICT/RESTRICT; zonas CASCADE/CASCADE como su
  `distrito_id`), funciones `orden_nodo_geografico()` y `zona_nodo_geografico_del_distrito()`, tres triggers
  `BEFORE INSERT OR UPDATE OF …`. Sin trigger en `cierre_detail`.
- `db/migrations/20261029120500_indices_nodo_geografico/{migration,down}.sql`: los tres índices con nombre por
  defecto de Prisma.
- `tests/integration/db/geo-sincronia-orden-zonas.test.ts` (R20, R21; 10 casos), sobre `crearEscenarioGeo43`
  (el fixture no necesitó cambios).
- `tests/unit/db/slt43-migraciones-aditivas.test.ts` (R19; 9 casos, 6 de contraprueba).

**Archivos modificados**
- `tests/integration/db/carga-division.test.ts`: SOLO el caso «decision 4: dos homónimos» (decisión de Camilo,
  opción (a)): `DISABLE`/`ENABLE TRIGGER canton_sincroniza_nodo_geografico` alrededor de la siembra, dentro de su
  `revertida`; comentario del motivo; tras la transacción, `pg_trigger.tgenabled = 'O'`. Aserciones sin cambios.
- `db/schema.prisma`: `Orden.nodoGeograficoId/nodoGeografico` (+ `@@index`), `ZonaDistrito` y
  `DistritoZonaEspecial` igual (+ `@@index`), `CierreDetail.ubicacionSnapshot Json?`, back-relations
  `ordenes`/`zonasDistrito`/`zonasEspeciales` en `NodoGeografico`.
- `tests/integration/db/454/correccion-ramas-sql-real.test.ts` y `477-resolicitud-rechazado-sql-real.test.ts`:
  `ubicacionSnapshot: undefined` al copiar un `cierreDetail` leído (typecheck: `JsonValue | null` no es entrada
  de Prisma). Ni datos ni aserciones cambian; ver desviaciones.
- `specs/.../tasks.md`: T3.2, T4.1, T4.2, T4.4 `[x]`; nota de bloqueo de T3.2 sustituida por la de la excepción.

**Decisiones / desviaciones**
- carga-division: además de apagar el trigger, un `UPDATE canton SET nombre = nombre` sobre el ganador (`primero`,
  por id) para que tenga nodo: el distrito que crea la carga cuelga de él y su nodo necesita el del padre (FK
  compuesta). Es preparación del caso, no aserción; sin esa línea el caso cae con 23503.
- Una sola función de trigger para `zona_distrito` y `distrito_zona_especial` (las dos `NEW.nodo_geografico_id :=
  NEW.distrito_id`); el design no fija nombres de funciones.
- ON UPDATE de las FK de zona: CASCADE (default de Prisma y lo que tiene su `distrito_id`); el design solo fijaba
  ON DELETE (los ids de nodo no cambian: ON UPDATE no se dispara en la práctica).
- 454/477: el design (R36) pide no cambiar aserciones; esto no las cambia, pero toca dos tests ajenos. Sin el
  cambio el typecheck queda rojo y no hay forma de que una columna `Json?` acepte `null` en Prisma. Ambos están
  en `tests/baseline-rojos.json` y en local fallan por base sin órdenes: las líneas tocadas solo las ejerce CI.
- `fk-misma-empresa.guardia` confirmada: verde con las tres FK a `nodo_geografico` (modelo de plataforma), sin
  trigger de misma empresa.
- Comportamiento de los triggers que puede tumbar escrituras (dejado en test): orden sin cantón → 23502 como
  antes (`canton_id` NOT NULL; no existe orden sin geografía); orden previa con nodo NULL se sigue actualizando
  y solo gana nodo si cambia su geografía; borrar un distrito con orden no falla (la orden pasa al cantón); la FK
  nueva solo rechaza (23503) un distrito sin nodo, que solo existe con la sincronía apagada a mano.
- R19 (T4.4): quita comentarios y la comparación `TG_OP = 'DELETE'`; `DELETE`/`UPDATE`/`INSERT` solo sobre
  tablas creadas por las seis; eventos de trigger, acciones de FK, `DO UPDATE` y `GRANT/REVOKE` no cuentan;
  `ALTER TYPE` solo `ADD VALUE IF NOT EXISTS`; `ADD COLUMN` en tabla existente sin NOT NULL/DEFAULT.

**Mapa R → test (esta tanda)**
| R | Test |
|---|---|
| R19 | `tests/unit/db/slt43-migraciones-aditivas.test.ts` |
| R20 | `tests/integration/db/geo-sincronia-orden-zonas.test.ts` (alta con/sin distrito; corrección de distrito/cantón; a mano se pisa; orden previa NULL; borrado de distrito; FK 23503) |
| R21 | ídem («`zona_distrito` y `distrito_zona_especial` apuntan a su distrito…») |
| R24, R40 (adelanto) | ídem (FK `convalidated = false`; `cierre_detail` sin trigger y snapshot NULL). Su test oficial sigue siendo `geo-backfill.test.ts` (T5.2) |
| R36 (excepción) | `tests/integration/db/carga-division.test.ts` (16/16, con `tgenabled = 'O'`) |

**Verificación (salida real, `DATABASE_URL` → `logistic_slt43`)**
- `prisma migrate deploy`: 120400 y 120500 aplicadas. `prisma migrate diff --from-config-datasource --to-schema
  db/schema.prisma --script`: `-- This is an empty migration.` tras cada una.
- `pnpm run typecheck`: 0 errores (antes del arreglo de 454/477: 2 errores TS2322 por `ubicacionSnapshot`).
  `eslint` sobre los 5 archivos de test tocados: sin salida.
- `geo-sincronia-orden-zonas` 10/10 · `slt43-migraciones-aditivas` 9/9 · `carga-division` 16/16.
- Guardias: `organizacion-en-modelos`, `rls-por-empresa`, `fk-misma-empresa`, `plataforma-solo-en-lista`,
  `cobro-plataforma-solo-por-trigger` verdes; `migraciones-destructivas` roja solo por
  `20261028120000_modulo_wallet_nucleo` (no nombra ninguna `202610291*`). 82/83.
- T3.2 + geo (`geo-`, `geografia-`, `carga-division`, `migracion-sl20-ida-y-vuelta`; 41 archivos): 584 pasados,
  16 saltados; rojos solo `geografia-historico-intacto` y `geografia-ordenes-sin-entregar` (base sin órdenes).
  `geografia-registro-accion` + `geografia-renombrado` solos: 42/42.
- Adelanto de T4.5 (no marcada): `zona-*`, `cobertura-*`, `distrito-zona-especial-por-empresa`,
  `aislamiento-cierres`, `aislamiento-ordenes`, `cierre-detail-migration`, `orden-*`,
  `cierre-aprobacion-libera-solo-lo-suyo`, `cierre-segundo-vincula-solo-lo-suyo`, `deshacer-asignacion-zona-satelite`
  (42 archivos): 33 verdes, 449 pasados, 7 fallados, 48 saltados. Los 9 archivos rojos están en
  `tests/baseline-rojos.json` y sus errores son de entorno («`orden` esta vacia», «sin catálogos sembrados», «zona
  sin central», «referencia a otra empresa» de fixtures) o el censo viejo de `orden-traspaso-migration` (espera
  33 migraciones posteriores y hay 81: ya roto antes de SLT-43). Ninguno nombra un objeto de SLT-43.
  454/477 tras el cambio: rojos por «tabla `orden` vacia» (entorno, baseline).

**Veredicto:** T3.2, T4.1, T4.2 y T4.4 hechas; T4.3 y T4.5 quedan para la siguiente tanda.

## Tanda 5 (2026-10-29) — T4.3 y T4.5 (backend_dev A), T5.1–T5.3 (backend_dev B), en paralelo

### T4.3 — R22, medición del trigger `orden_nodo_geografico`
`tests/integration/db/geo-trigger-orden-rendimiento.test.ts`, base propia `slt43_r22_<uuid>` (todas las migraciones,
`DROP DATABASE … WITH (FORCE)` al final). Cada medida: un `INSERT … SELECT` de 5 000 órdenes repartidas por los 494
distritos de CR, en `BEGIN`/`ROLLBACK`; variante «sin» con `DISABLE TRIGGER orden_nodo_geografico`. 1 ronda de
calentamiento descartada + 3 medidas, alternando el orden. Contraprueba por ronda: 5 000 filas con nodo con trigger, 0 sin.

PostgreSQL 16.1 (Visual C++ build 1937, 64-bit), 5 000 filas × 3 rondas:

| Ronda | Con trigger | Sin trigger | (con − sin) / fila |
|---|---|---|---|
| 1 | 4412.0 ms | 4251.4 ms | 0.03212 ms |
| 2 | 4785.5 ms | 4846.6 ms | -0.01221 ms |
| 3 | 4740.1 ms | 4721.9 ms | 0.00362 ms |

**Mediana: 0.00362 ms por fila (tope 1 ms). Verde.** El INSERT base ya cuesta ~0.9 ms/fila por triggers previos; lo
que añade SLT-43 queda en el ruido. Test: 1/1, ~44 s.

### T4.5 — suites de órdenes, zonas, cobertura y cierres (R36)
141 archivos de `tests/integration/db` que escriben `orden` o nombran `zona_distrito`, `distrito_zona_especial` o
`cierre_detail`: 1 375 tests, 670 pasados, 279 fallados, 426 saltados; 56 archivos verdes, 85 rojos.
Los 85 rojos están en `tests/baseline-rojos.json` (comprobado por el implementer: 0 fuera del baseline) y ningún error
nombra `nodo_geografico`, `tipo_nivel_geografico`, `ubicacion_snapshot` ni los triggers nuevos. Causas: base local sin
órdenes (47), fixtures con FK de otra empresa (~32), catálogo/semilla incompletos, `orden-traspaso-migration`
(censo 33 vs 81, previo) y `premio-ranking-idempotencia`.

### T5.1–T5.3 — script de datos
- T5.1: `FichaJira` admite `SLT-<n>` (`lib/db/contexto-empresa.ts`; `comoPlataforma` valida `^SLT?-\d+$`). Script en
  `EXCEPCIONES_DE_PLATAFORMA` (SLT-43). **Fuera de la lista de archivos:** `problemasDeExcepcion` en
  `tests/unit/guards/_aislamiento-por-empresa.ts` alineado con `FichaJira` (`^SLT?-\d+$`); sin ello la ficha SLT-43
  ponía roja `plataforma-solo-en-lista`. Para el reviewer.
- T5.2: `scripts/geo-backfill-nodo.ts` (modos de design §4) + `"geo:backfill": "tsx scripts/geo-backfill-nodo.ts"`
  (sin dependencias). Exporta `comprobar`/`aplicarLote`/`validar`/`equivalencia`, más `aplicar`, `leerArgumentos` y
  `ejecutar` (código de salida testeable, desviación menor). Cada lote es una sentencia (CTE de escritura) con keyset por
  id y filtro `IS NULL`; el cursor avanza por los ids leídos. Snapshot en un `UPDATE … FROM`: nombres de las columnas
  congeladas, ids de las FK de la orden. Sin trigger en `cierre_detail`. R33: `--aplicar`/`--validar` exigen
  `--base = current_database()`; los modos de solo lectura corren sin confirmación (design §4/§6).
- Caso límite sin regla escrita: `distrito_nombre` con valor y orden sin `distrito_id` → nivel 3 con `"id": null`.
- Fixture `geo-43.ts` ampliado: `crearOrdenGeo43`, `TRIGGERS_DE_COLUMNAS_NUEVAS`, `vaciarColumnasNuevas`.
- T5.3: `geo-equivalencia.test.ts`: igual → 0; zona desviada, orden con nodo NULL y distrito sin nodo → ≠ 0.
- **El script nunca se ejecutó a mano**: solo lo corren los tests, contra `logistic_slt43`, en transacciones revertidas.
- Resultados: `geo-backfill` 10/10, `geo-equivalencia` 4/4, `geo-sincronia-orden-zonas` 10/10 (0 saltados);
  typecheck y eslint verdes; guardias `plataforma-solo-en-lista`, `organizacion-en-modelos`, `rls-por-empresa`,
  `sql-a-mano-por-empresa`, `backfills-retirados`, `guard-dependencias-aprobadas` verdes.
