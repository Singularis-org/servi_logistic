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

**(Resuelto en la tanda 2.)** `20261031120200_nodo_geografico` estaba aplicada en `logistic_slt43`
solo con la función de T2.1. Al completarla en T2.2 cambia su checksum: antes de `migrate deploy`,
`DROP FUNCTION geo_normalizar_nombre(text)` y borrar su fila de `_prisma_migrations` (o recrear la base).

**(2026-10-31) Colisión con SLT-68.** `dev` trajo `20261030120000_incentivo_mensajero_enums` y
`20261030120100_incentivo_mensajero_checks`, con los mismos timestamps que las de SLT-43. Las seis
pasan de `20261030120000`–`120500` a `20261031120000`–`120500`, mismo sufijo y mismo SQL; el filtro
de `slt43-migraciones-aditivas` pasa a `202610311` y `PREVIA` del ida-y-vuelta a
`20261030120100_incentivo_mensajero_checks`. Las referencias de este log se actualizaron al nombre
nuevo. Una base local con las viejas registradas en `_prisma_migrations` se recrea (solo local).

## Tandas

### Tanda 1 — T1.1, T1.2, T1.3, T2.1 (2026-10-29)

**Archivos creados**
- `db/migrations/20261031120000_geo_enums_nodo_geografico/{migration,down}.sql`
- `db/migrations/20261031120100_tipo_nivel_geografico/{migration,down}.sql`
- `db/migrations/20261031120200_nodo_geografico/{migration,down}.sql` (solo `geo_normalizar_nombre`; T2.2 completa)
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
- `db/migrations/20261031120100_tipo_nivel_geografico/migration.sql`: FK a `pais` `ON DELETE CASCADE ON
  UPDATE RESTRICT` (enmienda de Camilo, opción (a)). `down.sql` sin cambios (la FK cae con la tabla).
- `db/migrations/20261031120200_nodo_geografico/{migration,down}.sql`: completa (design §2.2, §3). La
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
  `202610311*`). 62/63.
- SL-20 (`geografia-*`, `pais-*`, `carga-division`, `migracion-sl20-ida-y-vuelta`): 19/21 archivos, 217
  pasados, 16 saltados. Verdes incluidos `geografia-superadmin-sin-empresa` (sin tocarlo) y
  `carga-division`. Rojos: `geografia-historico-intacto` y `geografia-ordenes-sin-entregar` (entorno, ver
  arriba).
- `vitest related` sobre `db/schema.prisma`/`lib/db/modelos-de-negocio.ts` no se corrió: arrastra casi
  toda la suite de base (visto en la tanda 1).

**Veredicto:** regresión descartada; T1.3 y T2.2 hechas; T2.3 creado y en uso, a marcar cuando lo usen T3–T6.

### Tanda 3 — T3.1 hecha; T3.2 bloqueada (pregunta); T4 sin empezar (2026-10-29)

**Archivos creados**
- `db/migrations/20261031120300_nodo_geografico_sincronia/{migration,down}.sql` (design §2.3): tres funciones
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
  ninguna `202610311*`). 62/63.
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
- `db/migrations/20261031120400_columnas_nodo_geografico/{migration,down}.sql` (design §2.4): cuatro `ADD COLUMN`
  nullable sin DEFAULT, tres FK `NOT VALID` (`orden` RESTRICT/RESTRICT; zonas CASCADE/CASCADE como su
  `distrito_id`), funciones `orden_nodo_geografico()` y `zona_nodo_geografico_del_distrito()`, tres triggers
  `BEFORE INSERT OR UPDATE OF …`. Sin trigger en `cierre_detail`.
- `db/migrations/20261031120500_indices_nodo_geografico/{migration,down}.sql`: los tres índices con nombre por
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
  `20261028120000_modulo_wallet_nucleo` (no nombra ninguna `202610311*`). 82/83.
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

## Tanda 6 (2026-10-29) — T6.1 (backend_dev A), T6.2 y T6.3 (backend_dev B), en paralelo

- T6.1 — `tests/integration/db/migracion-slt43-ida-y-vuelta.test.ts` (R13, R14, R23, R34, R35): base propia
  `slt43_iv_*`, molde `ida-y-vuelta-32`. Siembra previa a SLT-43 con el fixture geo-43. R14: hermanos «San José»/«San
  Jose» y provincias homónimas normalizadas → 120200 aborta con SQLSTATE `SLT43` y foto intacta. Ida: nodos = geografía
  vieja (id, país, padre, nombre, código, activo, profundidad, nivel_N); enums con `nodo_geografico`; historial igual.
  Script entre la ida y la vuelta sobre la base desechable (aplicar lote 2, equivalencia 0, validar: 3 FK validadas).
  Vuelta (seis `down.sql` en orden inverso): foto de esquema, filas, funciones, triggers, políticas, RLS y privilegios
  igual salvo los 2 enums (por diseño). R35: alta y edición de geografía, órdenes, zonas y cierres tras la vuelta.
  Reaplicar = primera ida. **8/8, 0 saltados, 12,8 s.** Ningún `down.sql` tocado.
- Fixture geo-43: `sembrarEscenarioGeo43` / `EscenarioGeo43SinTipos` (no lee tipos); `crearEscenarioGeo43` la reutiliza.
  T2.3 cumplido (fixture usado por T2–T6); los 5 tests que lo usaban siguen 31/31.
- T6.2 — `tests/unit/guards/nodo-geografico-sin-escritor.guardia.test.ts` (R37): mira `lib/`, `app/`, `components/`
  (design §7); Prisma `create*/update*/upsert/delete*` y SQL `INSERT/UPDATE/DELETE` sobre las dos tablas. Sin
  excepciones. Contraprueba: 19 positivos, 7 negativos y un archivo inventado con `prisma.nodoGeografico.create` → rojo.
  29/29.
- T6.3 — `docs/architecture.md > Multi-empresa > País por empresa`: subviñeta «Geografía jerárquica (SLT-43, fase
  expand)». `check-perfil` 6/6.
- `test:guardias`: 3 rojos. `migraciones-destructivas` (wallet, ajeno; arreglo en PR aparte del leader),
  `dependencias-declaradas-presentes` (en el baseline; `init.sh` sin cambios en la rama) y
  `catalogo-postgres-acota-esquema` (**de SLT-43**: 7 consultas a catálogos sin esquema en los tests nuevos; se corrige
  en la tanda 7).

## Tanda 7 — cierre (2026-10-29)

- `catalogo-postgres-acota-esquema`: 9 consultas a catálogos de Postgres en 6 tests de SLT-43 acotadas a `public`
  (commit `3b0dbfa`); aserciones sin cambios. Guardia 7/7.

### Gate local (T7.1)
- `./init.sh` (rápido, `NODE_OPTIONS=--max-old-space-size=8192`, `DATABASE_URL` → `logistic_slt43`): **no terminó**.
  Llegó a typecheck (verde) y Claude Code lo mató por falta de memoria del sistema. No se relanzó.
  Sustituto, como indica el leader: typecheck + lint + todas las guardias + tests nuevos de integración.
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0 (0 errores, 230 warnings preexistentes).
- `pnpm run test:guardias`: 4 de 323 archivos rojos, ninguno de SLT-43:
  - `tests/guards/migraciones-destructivas.guard.test.ts`: solo `20261028120000_modulo_wallet_nucleo` (ajena; la arregla
    el leader en un PR aparte). No nombra ninguna `202610311*`.
  - `dependencias-declaradas-presentes.guardia.test.ts`: en `tests/baseline-rojos.json`; `init.sh` sin cambios en la rama.
  - `filtros-url-r25.test.ts` y `otp-debug-solo-en-pruebas.guardia.test.ts`: timeout (hook 60 s / test 20 s) por carga en
    la corrida paralela; solos pasan 2/2 archivos. SLT-43 no toca nada de lo que miran.
- Unit de SLT-43 + R39 (`migrate-deploy-guardas`, `slt43-migraciones-aditivas`, `historial-accion-entidades`,
  `nodo-geografico-sin-escritor`): 4 archivos, 57/57.
- Integración de SLT-43 contra `logistic_slt43`, `--no-file-parallelism` (los 9 `geo-*.test.ts`,
  `migracion-slt43-ida-y-vuelta`, `carga-division`):

  ```
   Test Files  11 passed (11)
        Tests  78 passed (78)
     Duration  246.81s
  ```

### Mapa R<n> → test

| R | Test |
|---|---|
| R1, R2, R3 | `tests/integration/db/geo-tipo-nivel.test.ts` (+ CASCADE de la enmienda T1.3) |
| R4–R9 | `tests/integration/db/geo-nodo-invariantes.test.ts` |
| R10 | `tests/integration/db/geo-normalizar-nombre.test.ts` |
| R11 | `tests/integration/db/geo-nodo-invariantes.test.ts` |
| R12 | `tests/integration/db/geo-nodo-rls.test.ts` (+ lado de tipos en `geo-tipo-nivel.test.ts`) |
| R13, R14 | `tests/integration/db/migracion-slt43-ida-y-vuelta.test.ts` |
| R15–R18 | `tests/integration/db/geo-sincronia-geografia.test.ts` |
| R19 | `tests/unit/db/slt43-migraciones-aditivas.test.ts` |
| R20, R21 | `tests/integration/db/geo-sincronia-orden-zonas.test.ts` |
| R22 | `tests/integration/db/geo-trigger-orden-rendimiento.test.ts` — mediana 0.00362 ms/fila (tope 1 ms) |
| R23 | `tests/integration/db/migracion-slt43-ida-y-vuelta.test.ts` y `tests/unit/types/historial-accion-entidades.test.ts` |
| R24–R31, R33, R40 | `tests/integration/db/geo-backfill.test.ts` |
| R32 | `tests/integration/db/geo-equivalencia.test.ts` |
| R34, R35 | `tests/integration/db/migracion-slt43-ida-y-vuelta.test.ts` |
| R36 | Suites existentes: `geografia-*`, `pais-*`, `carga-division` (excepción aprobada), `migracion-sl20-ida-y-vuelta`, y las 141 de órdenes/zonas/cobertura/cierres de T4.5 (rojos: todos en baseline) |
| R37 | `tests/unit/guards/nodo-geografico-sin-escritor.guardia.test.ts` |
| R38 | Retirado (2026-10-29). Sin test. |
| R39 | `tests/unit/scripts/migrate-deploy-guardas.test.ts` (existente, sin cambios; verde) |

T7.1 queda **abierta**: su «Hecho» pide `./init.sh` verde, que no se pudo completar en local (memoria) y que además
sale rojo por la guardia de wallet hasta que entre el PR del leader. T7.2 es puerta humana.

## F2.3 — menores de la review (pedido de Camilo, 2026-10-29)

- m2: R33 añade `--destino <proyecto-o-host>`, obligatorio en `--aplicar`/`--validar` junto a `--base`. Destino =
  project-ref de Supabase (host `db.<ref>.supabase.co` en la conexión directa; usuario `postgres.<ref>` en el pooler)
  o, fuera de Supabase, el host; `destinoDeUrl(DATABASE_URL)`. Si falta, no coincide o la URL no da destino: código 1 y
  nada escrito. `ejecutar(db, args, urlDeConexion)`. Sin dependencias. `docs/architecture.md` (País por empresa) al día.
- m1: `geo-backfill`, `geo-equivalencia` y `geo-sincronia-orden-zonas` en base propia `slt43_*`
  (`_fixtures/base-propia-43.ts`; `DROP … WITH (FORCE)` al cerrar). Aserciones sin cambios.
- m3/m7: design §6 con el runbook (`--destino`), «sin ediciones de geografía entre 120200 y 120300» y la medida de
  bloqueos de 120400/120500 en el ensayo (`lock_timeout` lo decide el humano).
- m6: design §2.6, nivel 3 con `"id": null` cuando la orden perdió `distrito_id`.
- m8: R22 escribe la cifra por `process.stdout` (en vitest 4.1.10 `console.log` y `annotate` no salen por defecto):
  `[SLT-43 R22] mediana por fila = 0.08630 ms (tope 1 ms)` (rondas 0.11399 / 0.06153 / 0.08630 ms, PG 16.1).
- Tests (`vitest run --no-file-parallelism`, `logistic_slt43` + bases propias): geo-backfill 16/16, geo-equivalencia
  4/4, geo-sincronia-orden-zonas 10/10, geo-trigger-orden-rendimiento 1/1, migracion-slt43-ida-y-vuelta 8/8 → 39/39,
  0 saltados, dos corridas iguales. Sin bases `slt43_*` huérfanas. tsc y eslint verdes. Guardias
  plataforma-solo-en-lista, catalogo-postgres-acota-esquema, nodo-geografico-sin-escritor verdes;
  migraciones-destructivas solo con el rojo de wallet (ajeno).
- T7.1 marcada con nota (gate local sustituido; gate completo en CI). T7.2 abierta: puerta humana antes de `prod`.
- Pendiente de merge (review): `gate-completo` y job `e2e` (órdenes y aislamiento) verdes en el PR (m4); guardia de
  wallet resuelta por el PR #43.

## T8 — enmienda «sin `ruta`» (decisión 2026-10-29, aprobada por Camilo)

**Archivos modificados**
- `db/migrations/20261031120200_nodo_geografico/migration.sql` (editada en su sitio; sin columna, sin GIN, sin
  trigger de descendientes; invariantes con `FOR SHARE` y paso 3) y su `down.sql` (sin los DROP del trigger/función
  de descendientes).
- `db/migrations/20261031120300_nodo_geografico_sincronia/migration.sql` (sin la columna en los tres upserts).
- `db/schema.prisma` (modelo `NodoGeografico`).
- `tests/integration/db/_fixtures/geo-43.ts`, `tests/integration/db/geo-nodo-invariantes.test.ts`,
  `tests/integration/db/geo-sincronia-geografia.test.ts`, `tests/unit/guards/nodo-geografico-sin-escritor.guardia.test.ts`.
- `docs/architecture.md` (línea del modelo nuevo).

**Base:** `logistic_slt43` recreada (DROP/CREATE, `prisma migrate deploy`, `db:seed`): cambian los checksums de
120200 y 120300. `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` →
`-- This is an empty migration.`

**Mapa R → test (enmienda)**
| R | Test |
|---|---|
| R4 | `geo-nodo-invariantes` «R4: guarda cada campo…», «R4: la tabla no tiene columna `ruta`», «R4/R10: un nombre normalizado mandado a mano se pisa…» |
| R7 | `geo-nodo-invariantes` «R7: profundidad mala al crear o al mover…», «R7: cambiar la profundidad de un nodo con hijos → SLT43…», «R7: colgar un nodo de su nieto con la profundidad del nieto + 1 → SLT43 y sin cambios», «R7: mover un nodo con hijos a otro padre del mismo nivel entra…» |
| R8, R11 | Retirados. `geo-nodo-invariantes` «R8/R11 retirados: no quedan el índice ni el trigger…» (pg_indexes, pg_trigger) |
| R10 | `geo-nodo-invariantes` «R4/R10…» y `geo-normalizar-nombre` (sin cambios) |
| R15, R16 | `geo-sincronia-geografia` (expectativas sobre `padre_id`/`profundidad`) |

**Contraprueba del paso 3 (T8.6).** Con la función `nodo_geografico_invariantes` reemplazada en la base por la de la
migración sin el bloque «3. Un nodo con hijos…» (y restaurada después desde el archivo), `geo-nodo-invariantes`:
```
× R7: cambiar la profundidad de un nodo con hijos → SLT43, aunque la nueva cuadre con su padre nuevo
× R7: colgar un nodo de su nieto con la profundidad del nieto + 1 → SLT43 y sin cambios (sin ciclos)
AssertionError: expected null to be 'SLT43' // Object.is equality
Test Files  1 failed (1)   Tests  2 failed | 9 passed (11)
```
Restaurada: `pg_proc.prosrc` vuelve a contener el paso 3.

**Verificación (`DATABASE_URL` → `logistic_slt43`, `NODE_OPTIONS=--max-old-space-size=8192`)**
- `geo-nodo-invariantes` 11/11 · `geo-sincronia-geografia` 9/9 · `nodo-geografico-sin-escritor.guardia` 28/28 → 48/48.
- T8.10 (`--no-file-parallelism`): 64/65. `carga-division`, `geo-backfill`, `geo-equivalencia`, `geo-nodo-rls`,
  `geo-sincronia-orden-zonas`, `migracion-slt43-ida-y-vuelta` verdes; **rojo** `slt43-migraciones-aditivas` «control: las
  reales sí escriben…»: `expected '…' to match /UPDATE nodo_geografico/`. Ese `UPDATE` solo existía en el trigger de
  descendientes retirado; T8.10 pide no tocar el archivo → abierto para el leader/humano.
- `pnpm run typecheck` exit 0; `eslint` sobre los 4 TS tocados exit 0; `check-perfil` 6/6.
- Grep final: en `db/`, `tests/` y `docs/architecture.md` solo quedan los literales `ruta`, `nodo_geografico_ruta_idx`
  y `nodo_geografico_ruta_descendientes` que el propio test de R4/R8/R11 busca para comprobar que no existen.

**Cierre del implementer (T8.11 parcial).** `./init.sh` no se corrió (muere por memoria en local; gate completo en CI).
Sustituto: `pnpm run typecheck` exit 0; `pnpm run lint` exit 0; `pnpm run test:guardias` (`NODE_OPTIONS=--max-old-space-size=8192`):
`Test Files 3 failed | 317 passed | 2 skipped (322)`, `Tests 6 failed | 4506 passed | 20 skipped`:
- `catalogo-postgres-acota-esquema`: el `pg_trigger` nuevo de `geo-nodo-invariantes.test.ts:272` no acotaba el esquema →
  corregido (JOIN `pg_class`/`pg_namespace`, `n.nspname = 'public'`); guardia 7/7 y `geo-nodo-invariantes` 11/11.
- `dependencias-declaradas-presentes` (4): en `tests/baseline-rojos.json`.
- `recursos-origen-fuera` R1-R9/R23: `tests/integration/db/geo-backfill.test.ts:526,533,535,536` (`supabase-host`,
  `supabase-pooler`). **No es de T8**: entró con F2.3/m2 (`d42726b`, ejemplos de `--destino`). No está en el baseline;
  pondrá rojo el `gate-completo`. Fuera del alcance de T8: abierto para el leader.

**Veredicto:** T8.1–T8.9 hechas y verdes; T8.10 con un rojo en un test que el spec manda no tocar (pendiente de decisión).

### T8, cierre tras las decisiones de Camilo (2026-10-29)
- Excepción autorizada a «sin tocar» de T8.10: `tests/unit/db/slt43-migraciones-aditivas.test.ts:119`
  `/UPDATE nodo_geografico/` → `/ON CONFLICT \(id\) DO UPDATE/` (casa con los tres upserts de 120300).
- `recursos-origen-fuera`: en `tests/integration/db/geo-backfill.test.ts` (R33) los refs de ejemplo van en constantes
  (`REF`, `OTRO_REF`, `POOLER`) interpoladas; `destinoDeUrl` recibe las mismas cadenas y las expectativas no cambian.
  Guardia y baseline sin tocar.
- `slt43-migraciones-aditivas` + `recursos-origen-fuera`: `Test Files 2 passed (2)`, `Tests 44 passed | 1 skipped (45)`
  (el saltado es R18 de la guardia, que exige `RECURSOS_ORIGEN_REF`).
- `geo-backfill` contra `logistic_slt43`: `Test Files 1 passed (1)`, `Tests 16 passed (16)`.
- `pnpm run test:guardias`: `Test Files 1 failed | 319 passed | 2 skipped (322)`, `Tests 4 failed | 4508 passed | 20 skipped`;
  los 4 son de `dependencias-declaradas-presentes`, que está en `tests/baseline-rojos.json`.
- `pnpm run typecheck` exit 0; `pnpm run lint` exit 0.
- T8.10 marcada. T8.11 abierta solo a la espera del `gate-completo` del PR #44 (CI); el resto de su «Hecho» se cumple.

### T8, correcciones de la review (B1, B2, m1) y rojos del `gate-completo` (2026-10-29)
- **B1** (`34ae97e`): `CONSTRAINT "nodo_geografico_padre_id_check" CHECK ("padre_id" IS DISTINCT FROM "id")` en 120200
  (cae con el `DROP TABLE` del `down.sql`). `UPDATE … SET padre_id = id` → `23514`; `INSERT` con `padre_id = id` → `SLT43`
  (el trigger BEFORE corre antes que el CHECK y el padre aún no existe).
- **B2**: `nodo_geografico_invariantes` lanza `SLT43` si `padre_id` no es nulo y el padre no existe, en vez de dejarlo
  a la FK. Caminos revisados, ninguno inserta un hijo antes que su padre: sincronía de 120300 (AFTER ROW, FK viejas no
  diferibles), copia de 120200 por niveles, `GeoRepository` (`createMany` por niveles), `geo-backfill-nodo.ts` (no
  escribe `nodo_geografico`), `db:seed`, fixtures y tests que apagan la sincronía. La función pasa a
  `SECURITY DEFINER SET search_path = public` (como la sincronía y `verificar_misma_empresa`) para que un padre o un hijo
  invisible por RLS no cuente como inexistente.
- Tests nuevos en `geo-nodo-invariantes.test.ts` (R7): autopadre por INSERT (`SLT43` + CHECK en `pg_constraint`),
  autopadre por UPDATE (`23514`), INSERT multi-fila en ciclo (`SLT43`, no queda ninguna), INSERT multi-fila con el hijo
  antes que el padre (`SLT43`; en orden entra). Contraprueba sin CHECK y con el `IF FOUND AND …` de antes:
  `Tests 4 failed | 11 passed (15)`, los 4 nuevos.
- **m1**: design §2.2, el `FOR SHARE` protege en `READ COMMITTED`; en `REPEATABLE READ`/`SERIALIZABLE` la carrera
  puede reabrirse. Nadie escribe `nodo_geografico` con esos niveles (los `RepeatableRead` del repo son lecturas de
  analítica). m2 fuera por decisión del leader.
- **Rojos del `gate-completo` sobre `a5c22f9`**: misma causa. `20261031120000_geo_enums_nodo_geografico` añade
  `nodo_geografico` al final de `historial_accion_entidad`, y dos tests de otras fichas fijan el catálogo «de hoy»:
  - `historial-accion-cobro-tienda-migration.test.ts` (381/B.7 b): se añade `nodo_geografico` a la lista de entidades
    posteriores excluidas.
  - `caja-459-migration.test.ts` (a): los `slice` de entidades se corren uno y se añade `["nodo_geografico"]` al final.
  Se ajusta la expectativa y no la migración porque los dos tests piden expresamente que cada ficha que amplíe el enum
  después se sume a su lista (así lo hicieron 457, SL-36, SL-23 y SL-24). Con la versión de HEAD fallan igual que en
  CI; con el ajuste, 23/23. Los otros 13 tests que fijan esos enums no se rompen por `nodo_geografico` (3 rojos ya en
  el baseline, por otras causas).
- Merge de `origin/dev` (`df5fe8f`) → `5291380`, sin conflictos y sin migraciones nuevas.
- **Verificación** (tras el merge; `DATABASE_URL` → `logistic_slt43`, recreada limpia por backend_dev con el nuevo
  checksum de 120200, `NODE_OPTIONS=--max-old-space-size=8192`):
  - `pnpm run typecheck` exit 0; `pnpm run lint` exit 0.
  - `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` → `-- This is an empty migration.`
  - `--no-file-parallelism`, todos los `geo-*.test.ts`, `migracion-slt43-ida-y-vuelta`, `carga-division`,
    `slt43-migraciones-aditivas`, `caja-459-migration` y `historial-accion-cobro-tienda-migration`:
    `Test Files 14 passed (14)`, `Tests 123 passed (123)`, 0 saltados.
  - `pnpm run test:guardias`: `Test Files 1 failed | 321 passed (322)`, `Tests 4 failed | 4535 passed | 1 skipped`;
    el único rojo es `dependencias-declaradas-presentes` (baseline).
- Mapa R7 → `geo-nodo-invariantes.test.ts`: los 4 casos de T8 más los 4 de B1/B2 (15 tests en el archivo).

## 2026-10-30 — renombre de migraciones por choque con SLT-56

- El 2026-10-30, al mergear `origin/dev` (SLT-56, PR #48; SLT-51, PR #49), las seis migraciones de SLT-43 se renombraron de `20261029*` a `20261030*` (mismo orden y sufijo) porque SLT-56 trae `20261029120000_gestion_pago_mensajero_ajuste` y `20261029120100_historial_accion_pago_mensajero_ajustado`. Las referencias de esta bitácora, del spec, del schema, de los SQL y de los tests se actualizaron en su sitio. Con SLT-56 antes, `cierre_dia_pago_mensajero_ajustado` es el último valor de `historial_accion_tipo` y `nodo_geografico` el último de `historial_accion_entidad`; `PREVIA` en `migracion-slt43-ida-y-vuelta` pasa a ser `20261029120100_historial_accion_pago_mensajero_ajustado`.
