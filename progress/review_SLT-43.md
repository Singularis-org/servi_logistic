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
| Guardias relacionadas (11): `plataforma-solo-en-lista`, `organizacion-en-modelos`, `rls-por-empresa`, `fk-misma-empresa`, `catalogo-postgres-acota-esquema`, `cobro-plataforma-solo-por-trigger`, `sql-a-mano-por-empresa`, `geografia-sin-borrado-fisico`, `backfills-retirados`, `guard-dependencias-aprobadas`, `migraciones-destructivas` | 10/11 verdes; `migraciones-destructivas` roja **solo** por `20261028120000_modulo_wallet_nucleo` (ajena, PR #43). Ninguna `202610291*` aparece. |
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
