# SLT-43 «Geografía jerárquica: modelo y migración» — review (F2.2)

Revisado el 2026-10-29 por `reviewer`. Diff: `git diff origin/dev...HEAD` (`cbd538b..a08424a`).
Contrastado con `specs/SLT-43-geo-jerarquica-modelo/{requirements,design,tasks}.md` (R1–R40, R38 retirado,
enmiendas del design), `progress/impl_SLT-43.md`, `progress/features/SLT-43.md`, `docs/architecture.md`,
`docs/conventions.md`, `docs/verification.md`, `docs/perfil-agentes.md`, `CHECKPOINTS.md` y
`docs/checkpoints-proyecto.md`. El grafo no tenía indexado este worktree: usé Grep/Read y consultas de
catálogo a la base local `logistic_slt43`.

## Verificación que corrí yo (base local `logistic_slt43`, nunca producción)

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | exit 0 |
| `eslint` sobre los 27 `.ts` del diff | exit 0, sin salida |
| Unit: `slt43-migraciones-aditivas`, `nodo-geografico-sin-escritor.guardia`, `historial-accion-entidades`, `catalogo-y-choke-point`, `historial-acciones-filtros-def`, `migrate-deploy-guardas` (R39) | 6 archivos, 123/123 |
| Integración: los 8 `geo-*` (sin rendimiento) + `carga-division` | 9 archivos, 69/69 (`--no-file-parallelism`) |
| Integración: `migracion-slt43-ida-y-vuelta` + `geo-trigger-orden-rendimiento` (R22) | 2 archivos, 9/9 (bases propias `slt43_*`, borradas al terminar) |
| Guardias relacionadas (11): `plataforma-solo-en-lista`, `organizacion-en-modelos`, `rls-por-empresa`, `fk-misma-empresa`, `catalogo-postgres-acota-esquema`, `cobro-plataforma-solo-por-trigger`, `sql-a-mano-por-empresa`, `geografia-sin-borrado-fisico`, `backfills-retirados`, `guard-dependencias-aprobadas`, `migraciones-destructivas` | 10/11 verdes; `migraciones-destructivas` roja **solo** por `20261028120000_modulo_wallet_nucleo` (ajena, PR #43). Ninguna `202610311*` aparece. |
| Catálogo de la base (`pg_trigger`, `pg_constraint`, `pg_class`, `pg_proc`, grants) | ver «Foco del humano» |

No corrí `./init.sh` (muere por memoria en este equipo; ver memoria del leader) ni la suite completa ni E2E:
eso es del CI.

## Checklist

### Especificación
- [x] `requirements.md` con EARS numerados R1–R40 (R38 retirado con fecha y motivo).
- [x] `design.md` con alternativas descartadas (§8, seis) y su porqué.
- [ ] `tasks.md` todo `[x]`: **T7.1 y T7.2 abiertas** (ver m5). T0–T6 `[x]`.
- [x] `design.md` abre con `## Lo que ya existe`, no vacía; el diff no re-crea nada de esa lista
      (reutiliza `pais.nivel_N_*`, el patrón de FK compuesta y de RLS de SL-20, `comoPlataforma`,
      `EXCEPCIONES_DE_PLATAFORMA`, `decidirMigracion`). `geo_normalizar_nombre` no duplica `normalizeName`: es
      su traducción a SQL, obligada por el único de la base, y el design la justifica.

### Equipo
- [x] Rama `feature/SLT-43-geo-jerarquica-modelo` publicada (commit `9a2f261 chore(SLT-43): feature tomada`).

### Trazabilidad
- [x] Cada R<n> tiene test concreto que lo ejercita (tabla abajo). Ninguno vacío.
- [x] `progress/impl_SLT-43.md` trae el mapa `R<n> -> test`.

### Calidad de código
- [x] Typecheck sin errores (corrido).
- [x] Lint sin errores en el diff (corrido).
- [ ] `gate-completo` en CI: pendiente (no hay PR todavía). Condición de merge.
- [~] Flujo crítico (órdenes; aislamiento por tocar `lib/db/`): no hay salida local de E2E en la bitácora
      (decisión cerrada «E2E existente como red»). Ver m4.
- [x] Sin dependencias nuevas (`package.json` solo añade el script `geo:backfill`).

### Seguridad y configuración
- [x] Sin secretos en el diff. El script no imprime la URL ni el nombre real de la base.
- [x] Sin webhooks nuevos.
- [x] Nada que cambie entre entornos hardcodeado. Los únicos literales de país son la palabra «Costa Rica» en
      un comentario SQL y `'CR'` en un test de rendimiento: ninguno en código de la app.

### Datos y seguridad (perfil)
- [x] Tablas nuevas de **plataforma** (como `pais`/`provincia`): sin `organizacion_id` por diseño, en
      `MODELOS_DE_PLATAFORMA`, con RLS de lectura por país y `REVOKE INSERT, UPDATE, DELETE` a `servi_app`
      (verificado en la base: `servi_app` solo tiene `SELECT` en las dos).
- [x] Ninguna query de negocio nueva en la app. El script corre por `comoPlataforma("SLT-43", …)` y está en
      `EXCEPCIONES_DE_PLATAFORMA`.
- [x] Cada migración trae `down.sql`; ninguna migración ya aplicada se edita.
- [x] Sin Ordenex. Sin `console.log` de PII (el script imprime cifras e ids de zona/país).

### Arquitectura y permisos
- [x] Sin action, ruta ni pantalla nueva; nada que autorizar. R37 lo hace cumplir una guardia.

### Verificación final
- [ ] `./init.sh` verde: no se pudo completar en local (memoria). Sustituto verificado por mí: typecheck,
      lint del diff, guardias relacionadas y todos los tests de SLT-43. Queda el `gate-completo` del CI.
- [ ] `progress/features/SLT-43.md > Cierre`, worktree desmontado: son del leader tras el merge.

### Reglas del revisor (`docs/perfil-agentes.md > reviewer`)
- [x] Ninguna tabla de negocio sin `organizacion_id`; ninguna tabla sin RLS.
- [x] Ninguna migración sin `down.sql`.
- [x] Ninguna migración pierde datos: solo `CREATE`, `ADD COLUMN` nullable sin DEFAULT, `ADD CONSTRAINT … NOT
      VALID`, `CREATE INDEX/TRIGGER/FUNCTION/POLICY`, `REVOKE`, `INSERT` en tablas nuevas y `ALTER TYPE … ADD
      VALUE IF NOT EXISTS`. Los `DROP` viven solo en los `down.sql` (la guardia no los mira, como está previsto).
- [x] Ningún `UPDATE` de columna existente en migraciones. El script solo escribe `nodo_geografico_id` y
      `ubicacion_snapshot`.
- [x] Sin literales de país o moneda en código nuevo de la app.
- [x] Sin dependencias nuevas.
- [x] Comentarios: explican el porqué (largos, pero de motivo, no de qué).

## Trazabilidad R → test (comprobada leyendo cada caso)

| R | Test | Comprobado |
|---|---|---|
| R1, R2, R3 | `geo-tipo-nivel.test.ts` (CR con sus 3 tipos; ningún país sin tipos; alta de país; cambio de nombres/dígitos sin cambiar id; únicos/CHECK/FK; CASCADE de la enmienda) | sí |
| R4–R9 | `geo-nodo-invariantes.test.ts` (campos; 23503 padre/tipo de otro país; `SLT43` al crear y al mover bajo un descendiente; ruta del subárbol; tres únicos y mismo código en dos tipos) | sí |
| R10 | `geo-normalizar-nombre.test.ts` (todos los nombres de la base + casos; IMMUTABLE; STRICT) | sí |
| R11 | `geo-nodo-invariantes.test.ts` (GIN existe y `EXPLAIN` lo usa) | sí |
| R12 | `geo-nodo-rls.test.ts` + caso R12 de `geo-tipo-nivel.test.ts` (lectura por país, 42501 al escribir) | sí |
| R13, R14 | `migracion-slt43-ida-y-vuelta.test.ts` (copia igual; abortos con `SLT43` sin dejar nada; código «1» en dos tipos) | sí |
| R15–R18 | `geo-sincronia-geografia.test.ts` (alta SL-20 y CSV; renombre/retiro/padre/código/país; UPDATE sin cambios no reescribe; borrado; `canton.pais_id` y sin historial) | sí |
| R19 | `slt43-migraciones-aditivas.test.ts` (seis carpetas reales + contrapruebas) | sí |
| R20, R21 | `geo-sincronia-orden-zonas.test.ts` | sí |
| R22 | `geo-trigger-orden-rendimiento.test.ts` (base propia; 5 000 filas × 3 rondas + calentamiento; contraprueba por ronda) | sí, verde en mi corrida |
| R23 | `historial-accion-entidades.test.ts` (TS y filtro) + ida y vuelta (enums y filas de historial iguales) | sí |
| R24–R31, R33, R40 | `geo-backfill.test.ts` (un caso por R; R29 compara `to_jsonb(orden)` entera salvo la columna nueva; R30 compara `cobro_plataforma_movimiento` fila a fila; R28 por `ctid`) | sí |
| R32 | `geo-equivalencia.test.ts` (igual → 0; zona desviada, orden NULL y distrito sin nodo → ≠ 0) | sí |
| R34, R35 | `migracion-slt43-ida-y-vuelta.test.ts` (seis downs en orden inverso: foto de esquema igual salvo 2 enums, datos iguales; escritura tras la vuelta; reaplicar = primera ida) | sí |
| R36 | Suites existentes: `carga-division` (excepción aprobada, verde aquí), `geografia-*`/`pais-*`/órdenes/zonas/cierres según la bitácora (rojos solo de baseline); E2E en CI | parcial en local (ver m4) |
| R37 | `nodo-geografico-sin-escritor.guardia.test.ts` (con contraprueba de 19 positivos y un archivo inventado) | sí |
| R38 | Retirado | — |
| R39 | `tests/unit/scripts/migrate-deploy-guardas.test.ts` (existente, verde) | sí |

## Foco del humano

**Migraciones aditivas.** Cumplen: verificado leyendo las seis y por el test de R19. Las tres FK de negocio
hacia `nodo_geografico` están `NOT VALID` (`pg_constraint.convalidated = false` en la base). Las FK internas
de `nodo_geografico` y `tipo_nivel_geografico` son de tablas nuevas y nacen validadas, que es lo correcto.
Cada `down.sql` deshace solo lo suyo, y el de `120000` es `SELECT 1` con el motivo escrito.

**Script `geo-backfill-nodo.ts`.**
- Escribe solo columnas nuevas: `orden/zonas.nodo_geografico_id` y `cierre_detail.ubicacion_snapshot`.
- Lotes por keyset con filtro `IS NULL`. Cada lote es una sentencia. En `comoPlataforma`, la extensión pasa el
  SQL a mano tal cual, sin `$transaction` (`extension-empresa.ts:209`), así que cada lote se confirma solo y
  un corte deja confirmado lo anterior.
- Es reanudable: R28 está probado por `ctid`.
- `--aplicar` y `--validar` exigen `--base = current_database()` antes de leer nada más. Sin opciones y con
  `--equivalencia` es de solo lectura.
- Nunca lo ejecutó un agente fuera de tests revertidos.

**Triggers de sincronía: ¿pueden tumbar escrituras reales?**
- `orden_nodo_geografico` y los de zona son BEFORE, solo asignan desde la propia fila y no consultan nada.
  Lo único que puede fallar es la FK nueva, si la orden apunta a un distrito o cantón sin nodo. Hoy ese
  estado solo se crea apagando la sincronía a mano, o en la ventana de deploy de m3.
- Una orden sin cantón da 23502, igual que antes. Borrar un distrito con órdenes funciona: las acciones RI
  corren antes que la sincronía. Las dos cosas están probadas.
- La sincronía de geografía solo rechaza lo que ya rechaza el único de nombre normalizado (R9).
  `GeografiaService` compara por `normalizeName` antes de escribir (altas y renombres), y la carga CSV
  deduplica. El código único `(pais, tipo, código)` equivale a los `(pais_id, codigo_dta)` por tabla que
  ya existen (comprobado en `pg_indexes`). No veo una vía de la app que hoy acepte algo que la sincronía
  rechace.
- `geo_normalizar_nombre` es, si acaso, **menos** estricta que `normalizeName`: marcas solo en
  U+0300–U+036F y el caso `ǅ`. Ese es el lado seguro.

**¿Interfieren con `cobro_plataforma_*` o con `orden.updated_at`?** No.
- `pg_trigger`: `cobro_plataforma_al_crear_orden` es AFTER INSERT, independiente del BEFORE nuevo.
  `cobro_plataforma_al_cambiar_borrado` es `UPDATE OF deleted_at`, y el script no lo dispara.
- Ningún trigger de `orden`, zonas ni `cierre_detail` lleva `nodo_geografico_id`/`ubicacion_snapshot` en su
  lista, salvo los de SLT-43.
- `updated_at` no lo pone ningún trigger: es `@updatedAt` de Prisma.
- R29/R30 lo prueban fila a fila.

**Excepciones aprobadas.**
- «decision 4» de `carga-division`: acotada a ese caso. `DISABLE/ENABLE` y el `UPDATE canton SET nombre =
  nombre` van dentro de su `revertida`. Las aserciones no cambian, y añade la comprobación `tgenabled = 'O'`.
- `ubicacionSnapshot: undefined` en 454/477: una línea cada uno, con comentario. Las dos están documentadas en
  `design.md` (enmienda R36) y en la bitácora.

**Desviaciones del design que listó el implementer (juicio).**

| Desviación | Juicio |
|---|---|
| Ruta de descendientes recalculada por nivel | **Correcta y necesaria.** Con una sola sentencia, el trigger de invariantes de cada fila leería la ruta vieja de su padre. Probada con dos niveles por debajo. |
| SQLSTATE `SLT43` | Es lo que dice el design (§2.2) para R7. Usarlo también en R14 es coherente. No es desviación. |
| Upsert con `IS DISTINCT FROM` | Mejora: un UPDATE de la tabla vieja que no toca el nodo no lo reescribe. Probado por `xmin` con contraprueba. |
| Función de trigger compartida en zonas | Inocua: el design no fija nombres de función y los dos triggers siguen con su nombre. |
| `ON UPDATE CASCADE` en FK de zona | Inocua: los ids de nodo no cambian. Es lo que exige `migrate diff` vacío (default de Prisma). |
| Lote como una sentencia (CTE) | Mejora sobre «una transacción por lote»: es atómico y no necesita `$transaction`. |
| Exports extra (`aplicar`, `leerArgumentos`, `ejecutar`) | Inocuo; hace testeable el código de salida. |
| Snapshot nivel 3 con `id: null` si la orden ya no tiene distrito | Razonable (el nombre congelado manda), pero **no está escrito** en el design. Ver m6. |

**Archivos fuera de lo esperado.**
- `^SLT?-\d+$` en `tests/unit/guards/_aislamiento-por-empresa.ts`: correcto y mínimo. Alinea el validador de
  la guardia con `FichaJira` y `comoPlataforma`. No relaja nada más.
- Las 7 aserciones de recuento (6 en `catalogo-y-choke-point` + 1 en `historial-acciones-filtros-def`):
  aceptables. El enum crece por diseño (§2.5) y el recuento de opciones del filtro sigue siendo 27, igual
  que antes. No son tests de flujo de R36.

**Medición R22.**
- **El método es creíble.** Usa base propia y un `INSERT … SELECT` de 5 000 órdenes repartidas por los 494
  distritos, con una ronda de calentamiento descartada. Alterna qué variante va primero. Compara con el
  trigger apagado, y así mide trigger + FK, que es lo que añade SLT-43. Cada ronda tiene contraprueba
  (5 000 filas con nodo / 0 sin nodo).
- **Las cifras son creíbles.** El INSERT base cuesta ~0,9 ms/fila por los triggers que ya existen (cobro,
  tope de plan, misma empresa). El ruido entre rondas es de ±0,03 ms/fila. La mediana registrada,
  0,00362 ms/fila, está ~300 veces por debajo del tope.
- **Mi corrida: verde.** La aserción `≤ 1 ms` pasó. La configuración de vitest no muestra el `console.log`,
  así que no tengo mi cifra (m8).
- Se midió en Postgres 16.1 local. El ensayo de §6 debe repetirla sobre la copia.

## Hallazgos

Ningún **BLOQUEANTE**.

- **m1 (menor) — Tests que apagan triggers en la base compartida, contra design §7.**
  - Design §7 dice: «las pruebas que bajan migraciones o desactivan triggers usan base propia (prefijo
    `slt43_`)». Sin embargo, `geo-backfill.test.ts` (vía `vaciarColumnasNuevas`), `geo-equivalencia.test.ts`
    y `geo-sincronia-orden-zonas.test.ts` hacen `ALTER TABLE orden|zona_distrito|distrito_zona_especial|distrito
    DISABLE TRIGGER` en la base compartida, dentro de una transacción revertida.
  - Eso toma `AccessExclusiveLock` sobre `orden` y compañía hasta el final del caso. En `geo-backfill`, ese
    caso además corre `aplicar` sobre **todas** las órdenes de la base.
  - En el `gate-completo`, con archivos en paralelo, puede bloquear otras suites y dar timeouts en archivos
    ajenos. Hay precedente (`usuario-empresa-o-superadmin.test.ts`), y en local con `--no-file-parallelism`
    pasa. Aun así, la bitácora no lo declara como desviación.
  - Qué hacer: vigilar el CI. Si aparecen timeouts ajenos, mover esos casos a base propia o declarar la
    desviación en el design.
- **m2 (menor) — R33 en Supabase es una barrera débil.** El nombre de la base de todo proyecto Supabase es
  `postgres`, así que `--base postgres` coincide en producción y en cualquier copia. Cumple el requisito
  literal, pero no distingue producción de la copia del ensayo. Para la puerta humana (§6) conviene
  confirmar además el host o el project-ref en el runbook (mejora futura: `--host`).
- **m3 (menor) — Ventana de deploy entre `120200` y `120300`.** Cada migración hace su propio `COMMIT`. Una
  provincia, cantón o distrito creado entre la copia (`120200`) y la sincronía (`120300`) queda sin nodo. Las
  órdenes y zonas que lo usen después de `120400` fallarían con 23503 (la FK `NOT VALID` comprueba las filas
  nuevas). La ventana es de segundos y la equivalencia lo detecta, pero conviene escribir en §6: «sin
  ediciones de geografía durante el deploy».
- **m4 (menor) — E2E de flujo crítico sin salida local.**
  - SLT-43 toca `orden` (flujo de órdenes) y `lib/db/` (aislamiento: `dos-empresas-humo`).
  - `CHECKPOINTS.md` pide su salida en la bitácora. La decisión cerrada «¿E2E?» la delega en el E2E
    existente, y `gate.yml` corre `e2e` en el PR a `dev`, pero como informativo.
  - **Condición de merge:** el job `e2e`, con los grupos de órdenes y de aislamiento, en verde en el PR,
    citado en `progress/features/SLT-43.md`.
- **m5 (menor) — T7.1 y T7.2 sin marcar.**
  - T7.1: `./init.sh` no termina en este equipo por memoria. Yo verifiqué el sustituto (arriba). El leader
    puede marcarla citando ese sustituto y el `gate-completo` del PR.
  - T7.2 es puerta humana, previa a la release a `prod` (no al merge a `dev`). Debe quedar como pendiente
    explícito en la ficha.
- **m6 (menor) — Caso del snapshot sin regla escrita.** Con `distrito_nombre` con valor y la orden sin
  `distrito_id`, el nivel 3 sale con `"id": null`. Es coherente con «el nombre es la foto, el id solo
  enlaza», pero conviene añadirlo a design §2.6 para que SLT-47 lo espere.
- **m7 (menor) — Bloqueo al aplicar `120400`.** `ALTER TABLE orden ADD COLUMN` toma `AccessExclusiveLock`
  hasta el `COMMIT` de la migración. Si hay una consulta larga sobre `orden`, el ALTER espera y encola detrás
  a todos los escritores. Es rápido, pero sin `lock_timeout`. Que el ensayo (§6) lo mida junto con `120500`,
  o fijar `SET lock_timeout` si el humano lo prefiere.
- **m8 (menor) — La cifra de R22 no aparece en la salida por defecto.** El test dice «deja la cifra en el
  log», pero la configuración de vitest se traga el `console.log` (lo probé con `--silent=false`). El número
  de la bitácora depende de la corrida del implementer. Si el ensayo debe registrar la cifra, que el test la
  escriba en un archivo o que se documente cómo verla.

## Veredicto

**OK** — 0 bloqueantes, 8 menores.

Condiciones de merge, que no son hallazgos de código:
- `gate-completo` en verde en el PR, sin rojos nuevos respecto de `tests/baseline-rojos.json`.
- El job `e2e` (órdenes y aislamiento) en verde (m4).
- La guardia de wallet resuelta por el PR #43.
- T7.2 queda como puerta humana antes de la release a `prod`.

## T8 (acotada a 8a625d7..a5c22f9: enmienda «sin `ruta`»)

### Verificación que corrí yo
- `vitest run` de `slt43-migraciones-aditivas`, `nodo-geografico-sin-escritor.guardia`, `recursos-origen-fuera.guardia`,
  `catalogo-postgres-acota-esquema.guardia` y la parte sin base de `geo-backfill` (R33): verdes.
- `pnpm run typecheck` exit 0; `eslint` sobre los 6 TS tocados: sin problemas.
- **No** corrí los de integración contra Postgres: en mi entorno no hay `DATABASE_URL` y el acceso al `.env` me lo
  denegó el permiso. Lo que sigue sobre el trigger es análisis de la semántica de Postgres (visibilidad en triggers
  `BEFORE ROW`, FK autorreferente, bloqueos de fila), no una corrida. Los dos casos de B1 y B2 son de una sola
  sentencia y el implementer puede reproducirlos en `logistic_slt43` en un minuto.

### Checklist
- [x] Tasks T8.1–T8.10 `[x]`. T8.11 `[ ]`, a la espera del `gate-completo` del PR #44 (condición de merge, no hallazgo).
- [x] `design.md > ## Lo que ya existe` presente; el diff no re-crea nada de esa lista.
- [x] `down.sql` de 120200: inverso exacto. Borra el trigger, la función de invariantes, la tabla (con ella caen
  índices, FK, RLS, política y permisos) y `geo_normalizar_nombre`, en ese orden. Ya no nombra el trigger ni la
  función de descendientes, que la ida ya no crea. El `down.sql` de 120300 no cambia y no hace falta.
- [x] `schema.prisma` en sincronía: el modelo ya no tiene `ruta` ni `@@index(..., type: Gin)`, y el comentario
  nombra el paso 3. La bitácora registra un `migrate diff` vacío; no lo repetí porque no tengo base.
- [x] Sincronía (120300): los tres upserts ya no llevan `ruta`. Solo mueven nodos dentro de su nivel (1/2/3), así
  que el paso 3 nunca los frena.
- [x] Grep: `ruta` como columna de `nodo_geografico` solo queda en los literales del test que comprueba que no existe.
- [x] Reglas del proyecto (perfil reviewer): la tabla es de plataforma, con RLS y `REVOKE`; hay `down.sql`; sin
  literales de país; sin dependencias nuevas. Los comentarios explican el porqué.
- [ ] **R7, «sin ciclos»: no se cumple en dos casos** (B1, B2).
- [x] Trazabilidad R4, R8, R11 (ver abajo). R7 tiene test de los casos que cubre, pero no de B1/B2.

### Trazabilidad
| R | Test | Estado |
|---|---|---|
| R4 | `geo-nodo-invariantes` «R4: guarda cada campo…», «R4: la tabla no tiene columna `ruta`» | ok |
| R7 | `geo-nodo-invariantes` «R7: profundidad mala…», «…nodo con hijos → SLT43…», «colgar un nodo de su nieto…», «mover un nodo con hijos… entra» | ok para lo que prueban; falta el caso «colgado de sí mismo», que R7 nombra (B1) |
| R8 | Retirado; «R8/R11 retirados» (`pg_trigger`, acotado a `public`) | ok |
| R11 | Retirado; ese mismo test (`pg_indexes`) | ok |

La contraprueba del paso 3 está en la bitácora: sin el paso 3, fallan los dos casos nuevos. Es creíble y coherente
con el código.

### Concurrencia (lo que pidió el leader)
- **Crear un hijo frente a cambiar la profundidad del padre (READ COMMITTED): cerrada.**
  - Si el hijo va primero, mantiene `FOR SHARE` sobre el padre. El `UPDATE` del padre pide `FOR NO KEY UPDATE`,
    que choca con `FOR SHARE` (no con el `FOR KEY SHARE` de la FK; por eso hace falta), así que espera. Al
    seguir, su `EXISTS` corre con snapshot nuevo, ve al hijo y lanza `SLT43`.
  - Si el padre va primero, el `FOR SHARE` del hijo espera, relee la versión nueva del padre y el paso 2 rechaza
    la profundidad vieja.
- **Dos reparentados cruzados (A bajo B y B bajo A a la vez): cerrada.** Cada `UPDATE` bloquea su fila y pide
  `FOR SHARE` de la otra.
  - Si se intercalan, Postgres detecta un deadlock y aborta una de las dos.
  - Si van en serie, la segunda ve a la primera ya hecha. Su paso 2 le exige una profundidad que cambia la suya,
    y como ahora tiene un hijo, el paso 3 la rechaza.
- En una sola sentencia con varias filas (`UPDATE … CASE`), las filas que se procesan después ven a las de
  antes, y el paso 3 cierra el caso.

### Hallazgos
- **B1 (BLOQUEANTE): un nodo se puede colgar de sí mismo.** R7 (texto nuevo de T8) dice que «ningún nodo puede
  quedar colgado de sí mismo», y el trigger no lo impide.
  - Con una hoja raíz `R` (profundidad 1): `UPDATE nodo_geografico SET padre_id = id, profundidad = 2 WHERE id = R`.
  - Paso 2: el `SELECT … FOR SHARE` del padre lee la versión vieja de la propia fila (profundidad 1), y 2 = 1 + 1
    pasa.
  - Paso 3: el `EXISTS` no ve hijos, porque la versión vieja de `R` tiene `padre_id` NULL.
  - La FK compuesta autorreferente se cumple con la propia fila. Queda `R.padre_id = R`.
  - Por `INSERT` pasa lo mismo: `INSERT … (id, padre_id) = ('x','x')` con cualquier profundidad. El padre aún no
    existe, la rama `IF FOUND` no compara nada y la FK se cumple al final de la sentencia.
  - Ya pasaba con la `ruta`, pero T8 añadió a R7 la garantía y su justificación (comentario de la migración,
    design §2.2, `architecture.md`), y esa justificación supone que el padre es otra fila.
  - Falta: impedirlo, por ejemplo con `CHECK ("padre_id" IS DISTINCT FROM "id")` (lo expresa el SQL, no Prisma),
    o en el trigger. Y un caso en `geo-nodo-invariantes` (UPDATE e INSERT → rechazo, sin cambios).
- **B2 (BLOQUEANTE): «padre aún no encontrado → que decida la FK» deja pasar ciclos y profundidades malas en una
  misma sentencia.**
  - La FK se comprueba al final de la sentencia. Un `INSERT` de varias filas con el hijo antes que el padre pasa
    el paso 2 sin comparar.
  - Ejemplo: `INSERT … VALUES (A, padre B, prof 1), (B, padre A, prof 2)`. Para A, B no existe y no se compara.
    Para B, ve a A (fila ya procesada), y 2 = 1 + 1 pasa. Las dos FK se cumplen al final: queda el ciclo A↔B, y
    A tiene padre con profundidad 1.
  - Lo mismo con `INSERT … SELECT` desordenado o con CTE de escritura. Sin ciclo, `(C, padre P, prof 7), (P, raíz,
    prof 1)` deja a C con una profundidad mala, y eso viola la primera condición de R7.
  - La premisa del argumento «el invariante vale en todas las filas» no se cumple.
  - Hoy ninguna vía de la app escribe así (copia ordenada por niveles, sincronía fila a fila, `REVOKE` a
    `servi_app`). Pero R7 es una garantía de la base frente al SQL a mano y frente a SLT-46, que es justo para lo
    que se mantiene el trigger.
  - Falta: que el paso 2 rechace cuando `padre_id` no es NULL y el padre no se encuentra (`SLT43` o el `23503` a
    mano; el R5 actual sigue igual, porque ahí el padre existe en otro país). O que la FK pase a `DEFERRABLE
    INITIALLY IMMEDIATE`, con una comprobación de profundidad que vea al padre. Si se elige lanzar en el trigger,
    la frase del comentario «con un padre inexistente no se lanza aquí» cambia. Y un test con el `INSERT` de dos
    filas cruzadas.
- **m1 (menor):** el cierre de la carrera vale en READ COMMITTED, como dice el comentario. En REPEATABLE READ o
  SERIALIZABLE, el `EXISTS` usa el snapshot de la transacción y no ve a un hijo que otra transacción acaba de
  confirmar.
  - En SERIALIZABLE, SSI probablemente lo aborte; en REPEATABLE READ, no.
  - La sincronía y el SQL a mano corren en READ COMMITTED, así que basta con dejarlo escrito en design §2.2 (o
    lanzar el error si `current_setting('transaction_isolation') <> 'read committed'` y hay padre).
- **m2 (menor):** ningún test ejercita la carrera: si se quita el `FOR SHARE`, no se pone rojo nada. Un test con
  dos conexiones (crear un hijo mientras otra cambia la profundidad del padre) lo fijaría. No lo pedía T8.6.
- **Las dos excepciones aprobadas por el humano:**
  - **`slt43-migraciones-aditivas.test.ts:119`.** El control sigue probando que las migraciones reales escriben, y
    el `DO UPDATE` lo trata una regla que sí existe en el detector. Ya no queda en el SQL real ningún
    `UPDATE <tabla nueva>` directo que pase por la rama de «tabla nueva aceptada». Eso refleja el SQL actual y
    las contrapruebas inventadas siguen cubriendo el rojo. No lo debilita.
  - **`geo-backfill.test.ts` R33.** Son las mismas cadenas, por interpolación, con las mismas expectativas, y está
    en verde. No lo debilita.

### Veredicto T8
**RECHAZADO**: 2 bloqueantes (B1, B2) y 2 menores. Los dos bloqueantes son de la garantía «sin ciclos» que T8
escribió en R7. Lo demás de la enmienda (columna, GIN, trigger de descendientes, `down.sql`, Prisma, sincronía,
tests de R4/R8/R11, las dos excepciones) está bien. Vuelve al implementer:
- impedir el autopadre (B1);
- impedir que un padre «aún no encontrado» se salte el paso 2 (B2);
- añadir un caso de test por cada uno en `geo-nodo-invariantes.test.ts`.

## T8, vuelta 2 (acotada a a5c22f9..f9e9426)

Commits: `34ae97e` (arreglos), `5291380` (merge de `origin/dev`; contra el primer padre no toca `db/`) y `f9e9426`
(bitácora).

### Verificación que corrí yo
- `eslint` sobre los 3 tests tocados: sin problemas. `slt43-migraciones-aditivas`: 9/9, y el `CHECK` nuevo no
  dispara el detector de R19.
- Tampoco esta vez tengo base: lo de Postgres sale de leer el SQL y los tests. La bitácora registra 123/123 en los 14
  archivos de integración afectados, un `migrate diff` vacío y la contraprueba: sin el CHECK y con el `IF FOUND` de
  antes, fallan justo los 4 tests nuevos.

### Hallazgos de la vuelta 1
- **B1: resuelto.**
  - `CONSTRAINT "nodo_geografico_padre_id_check" CHECK ("padre_id" IS DISTINCT FROM "id")` en la tabla. Cae con el
    `DROP TABLE` del `down.sql`, cuyo comentario ya lo nombra. Prisma no expresa CHECK, así que el diff sigue vacío.
  - Un `INSERT` con autopadre da `SLT43`: el trigger `BEFORE` corre antes que el CHECK y la propia fila aún no existe
    como padre. Un `UPDATE` da `23514`.
  - Tests: «crear un nodo colgado de sí mismo» (profundidad 1 y 2, y la definición del CHECK leída de `pg_constraint`,
    acotada a `public`) y «colgar de sí misma una raíz… → 23514 y sin cambios». Comprueban de verdad las dos vías.
- **B2: resuelto.**
  - El paso 2 lanza `SLT43` con `IF NOT FOUND`. R5 no cambia: un padre de otro país sí existe, así que la
    profundidad cuadra y la FK compuesta da `23503`. Su test sigue en pie.
  - Ningún test esperaba `23503` por un padre inexistente.
  - Tests: el INSERT de dos filas en ciclo (`SLT43`, no queda ninguna) y el INSERT con el hijo antes que el padre
    (`SLT43`; el mismo SQL en orden entra, lo que demuestra que el rechazo depende del orden y no del SQL).
  - Revisé los caminos que escriben en la tabla: copia por niveles, sincronía `AFTER ROW` cuyo padre ya tiene nodo
    por su FK vieja, y la vuelta 1 ya vio que el script no escribe `nodo_geografico`. Ninguno inserta un hijo antes
    que su padre, así que el rechazo nuevo no rompe nada legítimo.
- **m1: resuelto.** La nota de design §2.2 deja claro que la protección vale solo en `READ COMMITTED` y que en
  `REPEATABLE READ`/`SERIALIZABLE` la carrera puede reabrirse. Es correcta.
- **m2:** fuera por decisión del leader. Queda anotado.

### `SECURITY DEFINER SET search_path = public` en `nodo_geografico_invariantes` (revisado con lupa)
- **Escalada o escritura de `servi_app`: no abre nada.**
  - Una función de trigger no se puede llamar directamente («trigger functions can only be called as triggers»).
    Solo corre dentro de una escritura que ya pasó el control de permisos de la tabla.
  - `servi_app` tiene revocados `INSERT`/`UPDATE`/`DELETE`, así que nunca la dispara por su cuenta. Por la sincronía
    ya corría como dueño, porque esas funciones son `SECURITY DEFINER`.
  - La función no escribe nada: solo lee, bloquea con `FOR SHARE` y pisa `NEW.nombre_normalizado`.
  - El dueño salta la RLS porque la tabla no tiene `FORCE ROW LEVEL SECURITY`. Ese es justo el efecto buscado: un
    padre o un hijo invisible por la RLS no cuenta como inexistente.
  - El `FOR SHARE` como dueño no da a nadie un bloqueo que no pudiera tomar ya: quien escribe en la tabla ya tiene
    sus permisos.
- **`search_path`: el mismo patrón que el repo, con un matiz conocido (m3).**
  - Es idéntico a `verificar_misma_empresa` (20261022130300) y a las tres funciones de la sincronía (120300).
  - Las funciones (`geo_normalizar_nombre`) nunca se buscan en `pg_temp`: no hay secuestro de funciones.
  - Las relaciones sí: con `search_path = public`, Postgres mira `pg_temp` antes que `public`. La documentación de
    `SECURITY DEFINER` recomienda poner `pg_temp` al final de forma explícita.
- **m3 (menor):** una sesión con `TEMP` (por defecto `PUBLIC` lo tiene) y SQL arbitrario podría crear una tabla
  temporal `nodo_geografico`.
  - Entonces, en una escritura de la sincronía disparada desde esa sesión, el `SELECT` del trigger leería la tabla
    falsa.
  - No da privilegios, solo saltarse la comprobación de profundidad. Ya existía, y peor, en el `INSERT` de la
    sincronía, que en ese caso escribiría en la temporal.
  - Exige además poder ejecutar SQL arbitrario como `servi_app`.
  - Propuesta: `SET search_path = public, pg_temp` en todas las funciones `SECURITY DEFINER` del repo, en una ficha
    aparte. No bloquea T8, porque sigue el precedente aprobado.

### Tests de 381 y 459 ajustados al enum ampliado
- **`caja-459-migration.test.ts`:** sigue el patrón del propio archivo. Su comentario apila «Ficha 461… 457… 458-B…
  SL-36… SL-23… SL-24: N tipos y M entidades detrás de…», y cada ficha corre los `slice`.
  - SLT-43 añade su línea («UNA entidad y NINGÚN tipo detrás de los de SL-24»), corre en uno los dos tramos de
    entidades y fija `entidades.slice(-1) = ["nodo_geografico"]`.
  - Los tramos de tipos no cambian, y está bien, porque SLT-43 no añade tipos.
  - Las dos comprobaciones exactas de arriba (`tipos`/`entidades` ordenados igual a las constantes TS) siguen
    intactas. No tapa nada: además fija la posición de la entidad nueva.
- **`historial-accion-cobro-tienda-migration.test.ts` (381/B.7 b):** añade `nodo_geografico` a la lista de entidades
  posteriores que se excluyen al comparar el estado tras el `down`. Es la misma lista y el mismo comentario que
  usaron 459, 457, SL-36, SL-23 y SL-24.
  - Lo que el test verifica (que el down de 381 deja exactamente lo de antes de 381) no cambia.
  - Los conteos «51 tipos y 21 entidades tras el up» son del estado intermedio de la 381, no del enum final, y no se
    tocaron.

### Trazabilidad (actualizada)
| R | Test | Estado |
|---|---|---|
| R4 | `geo-nodo-invariantes` «R4: guarda cada campo…», «R4: la tabla no tiene columna `ruta`» | ok |
| R7 | `geo-nodo-invariantes`: los 4 casos de T8, los 2 de autopadre (B1) y los 2 de INSERT multi-fila (B2) | ok |
| R8, R11 | Retirados; «R8/R11 retirados» (`pg_indexes`, `pg_trigger`) | ok |

### Checklist de la vuelta
- [x] B1, B2 y m1 resueltos, con test de cada bloqueante.
- [x] `down.sql` sigue siendo el inverso exacto (el CHECK cae con la tabla); `schema.prisma` en sincronía.
- [x] `SECURITY DEFINER`: sin escalada ni vía de escritura para `servi_app` (solo m3).
- [x] Los ajustes de 381 y 459 siguen el patrón de esos archivos y no relajan lo que comprueban.
- [x] Sin regresiones en el resto de T8. El merge de `origin/dev` no trae migraciones.
- [ ] T8.11: a la espera del `gate-completo` del PR #44. Es condición de merge, no hallazgo.

### Veredicto T8 (vuelta 2)
**OK**: 0 bloqueantes. Menores abiertos: m2 (fuera por decisión del leader) y m3 (`pg_temp` en el `search_path` de
las funciones `SECURITY DEFINER`, deuda de todo el repo, para una ficha aparte). Condición de merge: `gate-completo`
del PR #44 en verde.
