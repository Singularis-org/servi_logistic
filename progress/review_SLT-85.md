# Review SLT-85 «Traza de facturación de los cobros por orden»

Vuelta 1 · 2026-11-09 · diff `origin/dev...HEAD` (f4317328..457c31fc, 17 archivos, +2481/−16) · ruta completa.

## Veredicto: RECHAZADO

Hay 2 bloqueantes y 3 menores. El SQL de la migración, el trigger, la seguridad y los tests de integración
están bien: los 71 tests contra Postgres pasan y ninguno se salta. El rechazo viene de una guardia que
este diff pone en rojo y de dos tareas de cierre sin marcar.

## Verificación ejecutada (por el reviewer, no copiada de la bitácora)

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` (8 GB) | verde, 0 errores (el rojo de `libphonenumber-js` ya no sale) |
| `eslint` de los 8 archivos `.ts` del diff | limpio |
| `pnpm run test:guardias` | 342 archivos: 337 pasan, **2 fallan**, 3 se saltan; 4 812 tests: 4 782 pasan, 5 fallan, 25 se saltan. `dependencias-declaradas-presentes` (4 rojos) está en `tests/baseline-rojos.json`. **`catalogo-postgres-acota-esquema` (1 rojo) NO está en el baseline y lo causa este diff** (B1) |
| Base propia `servi_logistic_slt85_rev`, recién creada: `prisma migrate deploy` de las 318 migraciones + `db:seed` | aplica todo, incluida `20261109120000` con su `BEGIN`/`COMMIT` y el `LOCK` |
| vitest contra esa base: los 3 archivos nuevos, `cobro-plataforma-cargos`, `cobro-porcentual-estados-finales`, `cobro-plataforma-porcentual-aislamiento` y `migracion-slt83-ida-y-vuelta` | 7 archivos, **71/71**, ninguno saltado |
| Atomicidad bajo `prisma migrate deploy` (prueba hecha a mano): bajé con `down.sql`, borré la fila de `_prisma_migrations`, creé antes una `cobro_plataforma_traza_inmutable()` para forzar un fallo a media migración y volví a hacer deploy | falla. No queda ni la tabla ni el trigger del libro. `_prisma_migrations` queda con `finished_at` null, como cualquier migración fallida. Con `migrate resolve --rolled-back` y otro deploy, sube limpia |
| Catálogo después del deploy | `servi_app` solo tiene `SELECT` sobre la traza. Hay 5 triggers: `…_inmutable`, `…_sin_cambio_de_empresa` y 3 `sme_*` |
| `node scripts/tamano-pr.mjs` | 1770/1000 líneas, con la aceptación humana en `progress/features/SLT-85.md` (sí) |

`./init.sh`, la suite completa y los E2E no se corrieron porque el leader lo pidió (memoria). La base de
revisión se borró al terminar.

## Checklist

- [x] **Ruta.** Es la completa, como exige el suelo de la ruta: el diff toca dinero y hace una migración.
- [x] Existen `requirements.md` (R1–R27 en EARS), `design.md` y `tasks.md`.
- [x] El design trae 6 alternativas descartadas, cada una con su porqué.
- [x] El design abre con `## Lo que ya existe`, con la búsqueda hecha, y el diff no vuelve a crear nada de esa lista: reutiliza los enums, las funciones del período, `generar-misma-empresa` y la guardia de SL-40.
- [ ] **Tasks.** T5.2 (`./init.sh`) y T5.3 (los E2E en local) siguen `[ ]` (B2).
- [x] **Tamaño.** Pasa del máximo, pero lleva la aceptación humana.
- [x] **Trazabilidad.** Cada R1–R27 tiene un test que de verdad lo prueba (ver la tabla) y el mapa está en `progress/impl_SLT-85.md`.
- [x] Typecheck y lint verdes.
- [ ] Guardias: una guardia está en rojo y no está en el baseline (B1).
- [ ] **E2E en local antes del PR** (`docs/perfil-agentes.md > reviewer`): el diff toca `db/` y dinero y no hay constancia de los E2E (B2).
- [x] Tabla nueva con `organizacion_id`, RLS, política `…_por_empresa` y únicos que empiezan por `organizacion_id`.
- [x] La migración trae `down.sql` y no edita ninguna migración ya aplicada.
- [x] No hay literales de país ni de moneda, ni recursos de Ordenex, ni secretos, ni dependencias nuevas.
- [x] Los comentarios explican el porqué.
- [x] `docs/architecture.md` tiene su línea nueva (T5.4).
- [x] Contadores al día: `rls-por-empresa` en 89, `TRIGGERS_MISMA_EMPRESA` en 175 y el contrato en 90/175/89.

## Trazabilidad R → test (revisada leyendo cada `it`)

| R | Test | ¿Lo prueba? |
|---|---|---|
| R1 | `cobro-plataforma-traza.test.ts` › R1 | Sí: 14 movimientos de los 7 caminos, conteos, `distinct` y ninguna fila suelta. También mira la base entera |
| R2 | ídem › los 7 `it` de R2 | Sí, uno por camino, incluido el de la porcentual que no deja traza al alta |
| R3 | ídem › los 2 `it` de R3 | Sí: rollback real y `CHECK (false) NOT VALID`; da 23514 y no queda ni el movimiento ni la orden |
| R4 | ídem › R4 (con el trigger y sin él) y las 4 suites de SL-40 y SLT-83 | Sí: los movimientos y las deudas son idénticos (200,00 / 3000,00), y 71/71 en verde |
| R5, R6 | ídem | Sí: guía, monto y estado del instante; fila a fila, las de antes quedan idénticas |
| R7, R8, R9 | ídem | Sí: porcentual con mínimo y sin él; fijo; las 4 fuentes, `sin_configurar` en 0,00 |
| R10 | ídem › los 2 `it` | Sí: plan del instante también con fuente `empresa`; sin plan, vacío; después de cambiar de plan |
| R11, R12, R13 | ídem | Sí: el valor exacto 80,55 / −80,55; `cobrado_at` = `deleted_at`; `reverso_de` en una cadena de 4 movimientos |
| R14, R15 | ídem | Sí: toda la tabla `CASOS_PERIODO` (5 casos por período, los 4 tipos, y el test comprueba que vio todos), entrada a mitad de período y empresa sin plan |
| R16 | ídem | Sí: 14 filas con `false` |
| R17–R20 | `migracion-slt85-ida-y-vuelta.test.ts` | Sí, en una base propia: relleno con vacíos; período `anual` con movimientos que se hicieron en mensual (P2); cierre P0001 y un reverso suelto que da 23514; bajada sin diferencias y bajada negada con una fila en vivo |
| R21–R24, R26 | `cobro-plataforma-traza-aislamiento.test.ts` | Sí: dos empresas, 42501 en INSERT, UPDATE y DELETE con el control de lectura, SL085 para el dueño y SL017 en las 3 FK y en el cambio de empresa |
| R25 | `cobro-plataforma-solo-por-trigger.guardia.test.ts` | Sí: 15 positivos y 4 negativos en la contraprueba, más el barrido de `lib/` y `app/` (en verde) |
| R27 | `cobro-plataforma-traza.test.ts` › R27 | Sí: `information_schema.columns` exacto |

## Lo revisado en el SQL (sin hallazgo)

- **Relleno** (`migration.sql:207-266`). Los cargos van primero y los reversos después.
  - `reverso_de` apunta al movimiento `secuencia − 1` que es `cargo`.
  - Se marca `porcentual` cuando la orden tiene fila en `cobro_plataforma_porcentual_orden` (PK `orden_id`, así que no se duplica).
  - Guía, monto, estado y plan quedan vacíos y `reconstruido = true`.
  - El período sale de `plan_tipo_cobro` de la empresa en el momento de migrar, solo si tiene `plan_id`, con las funciones de SLT-86 «Planes: período de facturación de calendario por empresa y sin tope de órdenes». `plan_tipo_cobro` es NOT NULL con un CHECK de 4 valores, así que no puede dar 22023.
  - Las dos sentencias tienen `NOT EXISTS`.
- **Cierre R19** (`:269-280`). Con un movimiento sin traza lanza P0001 y no queda nada aplicado, en los dos runners.
- **`BEGIN`/`COMMIT` y `LOCK`** (`:27`, `:198`, `:282`). Son seguros con `migrate deploy`: lo comprobé arriba. Lo mismo hacen 19 migraciones anteriores.
- **Trigger** (`:155-192`).
  - Es `AFTER INSERT … FOR EACH ROW` y devuelve `RETURN NULL`: no toca `NEW` ni el libro (R4).
  - Corre en la sentencia que inserta el movimiento, que a su vez va dentro del trigger de `orden`: es la misma transacción.
  - Los únicos que escriben movimientos son las 3 funciones de `20261023130200`, `20261024120000`, `20261031140200` y `20261104150200` (lo busqué con grep en `db/migrations`, `lib`, `app` y `scripts`), y este trigger las cubre a todas.
  - El signo es `−monto` en el reverso. Es `SECURITY DEFINER`, con `search_path` fijo y `REVOKE EXECUTE` a PUBLIC.
- **Seguridad.**
  - La política tiene la forma canónica y está el `REVOKE INSERT, UPDATE, DELETE` (en el catálogo, solo queda `SELECT`).
  - La inmutabilidad deja pasar el cambio de empresa a `…_sin_cambio_de_empresa`, que va justo después por orden alfabético y lo rechaza con SL017. Cualquier otro UPDATE, incluso uno que no cambie el valor, da SL085.
  - Hay 3 `sme_*`, uno por FK.
- **Lo que pide el aviso de la feature.** El humano decidió contar en producción, antes del deploy, los reversos sin cargo. El test lo cubre: un reverso suelto tumba la migración entera con 23514.

## Hallazgos

### B1 — BLOQUEANTE: este diff pone en rojo una guardia que no está en el baseline
- **Dónde:** `tests/integration/db/migracion-slt85-ida-y-vuelta.test.ts:165-167`, en la función `existe()`.
- **Qué falla:** `tests/unit/guards/catalogo-postgres-acota-esquema.guardia.test.ts` › «NINGUNA consulta del árbol lee un catálogo sin decir de qué esquema habla». Señala la línea 165.
- **Por qué:** `pg_proc WHERE proname IN (…)` y `pg_trigger WHERE tgname = …` no acotan el esquema.
- **Evidencia:** `pnpm exec vitest run tests/unit/guards/catalogo-postgres-acota-esquema.guardia.test.ts` da 1 fallo y 6 pasan. El archivo no está en `tests/baseline-rojos.json`.
- **Bitácora:** la evidencia de guardias de `progress/impl_SLT-85.md` (Tanda 2) no lo recoge. Seguramente T3 corrió las guardias antes de que T4 escribiera este archivo.
- **Arreglo:** hacer `JOIN pg_namespace n … AND n.nspname = 'public'` en los dos subselects. En `pg_trigger` se puede ir por `tgrelid = 'public.cobro_plataforma_movimiento'::regclass`. Después, volver a correr `test:guardias` y este test de ida y vuelta.

### B2 — BLOQUEANTE (de proceso): T5.2 y T5.3 sin hacer, y sin constancia de los E2E
- **Dónde:** `tasks.md` (T5.2 y T5.3 siguen `[ ]`) y `progress/impl_SLT-85.md` › «T5 — cierre», donde dice «NO corridos».
- **Qué regla falla:** `docs/perfil-agentes.md > reviewer` dice que es bloqueante un PR que toca `db/` o dinero sin constancia de los E2E afectados corridos en local. CHECKPOINTS pide además todas las tasks `[x]`.
- **Qué falta:** correr en local, con una base desechable, el grupo `dinero`, `cobro-plataforma-sl40`, `planes-costo-porcentual`, `planes-costeo`, `cierre-modelo-nuevo-plan-porcentual` y `dos-empresas-humo`. Después, dejar la salida en la bitácora y marcar T5.3.
- **T5.2 (`./init.sh`):** si el leader lo sustituye por el CI por la memoria, que lo deje escrito en `progress/features/SLT-85.md` y marque la task con esa nota.
- **Quién lo resuelve:** no es un fallo del código. Le toca al leader o al implementer antes del PR.

### m1 — menor: el `down.sql` comprueba sin bloquear el libro
- **Dónde:** `db/migrations/20261109120000_cobro_plataforma_traza/down.sql:15-22`.
- **Qué pasa:** el `DO` que mira si hay filas con `reconstruido = false` corre antes de que nada bloquee `cobro_plataforma_movimiento`. Entre esa comprobación y el `DROP TRIGGER`, otra sesión puede confirmar un movimiento con su traza en vivo, y el `DROP TABLE` se la llevaría. Eso es justo lo que P4 quiere impedir.
- **Riesgo:** la ventana es mínima y el down se corre a mano.
- **Arreglo:** poner `LOCK TABLE "cobro_plataforma_movimiento" IN SHARE ROW EXCLUSIVE MODE;` justo después del `BEGIN`.

### m2 — menor: con `BEGIN` explícito, `migrate deploy` esconde la causa real del fallo
- **Qué pasa:** en la prueba a mano, Prisma mostró «transacción abortada, las órdenes serán ignoradas…» (25P02) y no el error real, y `_prisma_migrations.logs` quedó vacío.
- **Contexto:** es lo mismo que pasa con las 19 migraciones anteriores que llevan `BEGIN`/`COMMIT`. No se pierde la atomicidad: no queda nada aplicado.
- **Por qué importa aquí:** si en producción hay un reverso sin cargo, el log del deploy no lo dirá.
- **Mitigación:** el conteo previo de reversos sin cargo que ya decidió el humano (`progress/features/SLT-85.md`) lo cubre. Conviene escribir en esa nota que, si el deploy falla, se lanza `SELECT` con la consulta del cierre (`migration.sql:273-276`) para ver la causa, y se resuelve con `prisma migrate resolve --rolled-back`.

### m3 — menor: el design no recoge el tipo de relación que se implementó
- **Qué no cuadra:** `design.md §1.4` dice `CobroPlataformaMovimiento.traza CobroPlataformaTraza?`, pero la implementación usa `trazas CobroPlataformaTraza[]` (`db/schema.prisma:6275`).
- **Estado:** el cambio lo aceptó el leader (propuesta 1). Falta anotarlo en el design para que no se lea como una desviación sin decidir.

## No regresión en SL-40 «Cobro de plataforma por orden» ni en SLT-83 «Planes: costo por orden porcentual»

- Las suites `cobro-plataforma-cargos` (20), `cobro-porcentual-estados-finales` (3), `cobro-plataforma-porcentual-aislamiento` (5) y `migracion-slt83-ida-y-vuelta` (6) pasan contra la base nueva con el trigger activo.
- El test R4 compara los movimientos y las deudas con el trigger y sin él, y salen idénticos.
- El diff no toca ninguna función ni ninguna tabla de SL-40, SLT-66 ni SLT-83.
- No lo comprobé en local: `tests/integration/db/demo-qa.test.ts`, que cubre el borrado de las demos con la FK `reverso_de` a la propia tabla. Lo corre el CI con el disparador `demo-qa`.
