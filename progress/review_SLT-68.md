# Review SLT-68 «Incentivo manual a un mensajero en la wallet» — hotfix a `prod`

Diff revisado: `b31b6503...HEAD` (HEAD = `a6d57203`), rama `feature/SLT-68-incentivo-manual-mensajero`.
Grafo: no se usó (sin proyecto indexado para este worktree, según la bitácora); Grep/Read y ejecución.

## Verificación ejecutada por el reviewer

| Qué | Resultado |
|---|---|
| 11 archivos unit/componentes de la ficha + `incentivo-mensajero-slt68` + `migracion-slt68-ida-y-vuelta` + `efecto-movimiento-predice` | 13/14 archivos verdes, 254/259 tests; los 5 rojos son de `efecto-movimiento-predice` («referencia a otra empresa: orden.zona_id -> zona»): archivo **en `tests/baseline-rojos.json`** (app vacía, SL-11) |
| `incentivo-mensajero-slt68` + `migracion-slt68-ida-y-vuelta` (verbose) | 20/20 verdes (15 + 5), ninguno saltado |
| Mutación M-R16a en PG: quitar `if (c === "incentivo") return { tipo: "incentivo", id: f.id };` de `EstadoCuentaService.documentoDeMensajero` | ROJO (`R16: en el libro del mensajero…`, 1 failed); restaurado, `git hash-object` b1a3e090… igual antes/después, `git status` limpio |
| Mutación propia: `obtenerIncentivo` sin `categoria: "incentivo"` en el WHERE | **sobrevive** (30/30 verdes en integración + unit del servicio); restaurado, hash 7551a8e2… igual, árbol limpio. Ver H2 |
| `metrics-caja-naturaleza.guardia` + `analitica-financiera-conciliacion` (rojos del gate por `.prisma/client/default`) | vueltos a correr: 42/42 verdes → la clasificación «entorno» se confirma |
| `pnpm run test:guardias` | 317/318; el rojo es `dependencias-declaradas-presentes.guardia` (marcador de `init.sh`); `init.sh`/`scripts/` fuera del diff y el gate lo excluye → preexistente |
| Log del gate (`init-slt68-2.log`) | typecheck ✓, lint ✓ (solo warnings preexistentes), `test:rapido` 4 archivos rojos de 644: los 2 de Prisma (confirmados arriba), `caja-backfill` (FK de zona en `cierre_dia`, base `servi_slt68` solo con `db:seed`; ni el test ni sus fuentes están en el diff, salvo la fixture `caja-459.ts` que solo añade un lector vacío) e `indices-rutas-calientes` (elección del planificador; fuera del diff). Clasificación creíble; CI la confirma |
| Migraciones de `origin/dev` posteriores a prod | 9 migraciones, 0 menciones de `pago_mensajero_movimiento`, `wallet_origen_tipo`, `tipo_categoria` u `origen_uq` → sin colisión |
| Literales de país/moneda, Ordenex, `parseFloat`/`Number(` en lo añadido | ninguno |
| Dependencias | `package.json`/lockfile sin cambios |

No se corrió `prisma generate/migrate`, `pnpm install`, dev server ni E2E.

## Checklist

### CHECKPOINTS.md
- [x] requirements.md con EARS `R1..R22`.
- [x] design.md con alternativas descartadas (Q1 a/b, Q2, Q3).
- [ ] tasks.md con todas las tasks `[x]` → **T10–T14 siguen `[ ]`** aunque T10–T13 están hechas en el código (H1).
- [x] design.md abre con `## Lo que ya existe` con búsqueda hecha; el diff reutiliza el molde del premio (293), el reparto 205, la anulación uniforme y el catálogo del registro manual; no re-crea nada de la lista.
- [x] Cada `R<n>` mapea a un test concreto que corre (tabla abajo).
- [x] `progress/impl_SLT-68.md` contiene el mapa `R → test` (Tanda A + Tanda B + hueco R16).
- [x] typecheck verde (gate). [x] lint verde (gate).
- [ ] `gate-completo` en CI: pendiente del PR.
- [x] Flujo crítico «Dinero: wallet» tocado → E2E `e2e/incentivo-mensajero-slt68.spec.ts` con su salida en impl (4 passed). Ver H3.
- [x] Sin dependencias nuevas. [x] Sin secretos. [x] Sin valores de entorno hardcodeados.
- [ ] `./init.sh` verde: INIT_EXIT=1, rojos clasificados como entorno y confirmados (ver tabla). Aceptable para un hotfix; CI decide.

### docs/checkpoints-proyecto.md
- [x] Sin tabla nueva (no hay superficie RLS nueva).
- [x] Queries nuevas sobre negocio: van por el cliente con la extensión de empresa (filtro `organizacionId` en `findFirst/findMany/count/groupBy`) + RLS, como el resto del repo; R4 lo prueba con **dos empresas** por la action real (mensajero e incentivo ajenos → `no_encontrado`, cero filas). `obtenerIncentivo`/`obtenerNombreMensajero` sin `WHERE organizacion_id` propio: **aceptable** (mismo patrón que `obtenerNombreMensajero` preexistente y que el premio 293; la doble barrera está medida con M17 y R4).
- [x] Cada migración trae `down.sql`; no edita ninguna aplicada; timestamps `20261030120000`/`20261030120100` > `20261029150000` (dev) y > `20261028120000` (prod), afirmado en un test.
- [x] Sin Ordenex. [x] Sin `console.log` de PII.
- [x] Capas: servicio en `lib/services`, datos en `lib/repositories`, composition root en la action, la caja solo por puerto estrecho.
- [x] zod `.strict()` en el borde (registrar y anular; anular sin monto).
- [x] Sin literales de país/moneda.
- [x] Autorización en el servidor: `esAccesoTotal` en el servicio antes de leer nada (R1) y sesión antes del schema (R2).
- [x] Módulo: Wallet es núcleo; `lib/modulos/reparto.ts` registra la action como `nucleo`.

### docs/perfil-agentes.md > reviewer
- [x] Ninguna tabla/query de negocio sin `organizacion_id` efectivo (ver arriba). [x] Ninguna tabla sin RLS. [x] `down.sql` presentes.
- [x] Sin literales de país/moneda. [x] Sin Ordenex. [x] Sin dependencias.
- [x] Comentarios explican el porqué (decisiones Q1/Q2, orden caja→libro por idempotencia, por qué el incentivo no «nace de un cierre»).

## Trazabilidad R → test (verificada)

| R | Test | Estado |
|---|---|---|
| R1 | unit `incentivo-mensajero-service` › 5 roles sin acceso total, registrar y anular, sin repos ni tx; maestro y admin sí (M1, M14 rojas) | ✓ |
| R2 | unit `incentivo-mensajero-action` › petición inválida sin sesión → `unauthenticated` (M2) | ✓ |
| R3 | unit action › 13 casos + `.strict()` + fecha vacía (M3) | ✓ |
| R4 | PG › dos empresas por la action real | ✓ |
| R5 | PG › solo cierre solicitado (M15) + unit | ✓ |
| R6 | PG › 1+1 filas, cierre más reciente, fecha, motivo, actor; `cierre_dia` intacto | ✓ |
| R7 | PG › cuenta por pagar +M y ganancia −M con `derivarCaja` (M11) | ✓ |
| R8 | PG › pagable +M, imputable +M, no imputable igual, reparto lo salda (M8) | ✓ |
| R9 | PG › dos incentivos al mismo cierre (M7) | ✓ |
| R10 | PG › misma clave en serie y A LA VEZ | ✓ |
| R11 | unit › registrar y anular lanzan si la segunda escritura falla (M4) | ✓ |
| R12 | PG › 6 rechazos 23514 con nombre del CHECK (M6, M12) | ✓ |
| R13 | PG › 1+1 contraasientos, originales intactos | ✓ |
| R14 | PG › R7/R14 y R8/R14 (M9) | ✓ |
| R15 | PG › en serie (con inserción directa rechazada por `origen_uq`, M16) y A LA VEZ | ✓ |
| R16 | unit `wallet-anulacion-service` (5) + unit `estado-cuenta-incentivo-slt68` (2) + PG «R16: en el libro del mensajero…» (M-R16a corrida por el reviewer: ROJO) | ✓ |
| R17 | PG › conciliación sin descuadre (M10) | ✓ |
| R18 | unit `incentivo-rotulos-slt68` + `EstadoCuenta.test.tsx`/`EstadoCuentaBarra467` (MB2, MB3, MB5) | ✓ |
| R19 | unit `wallet-conceptos-manuales` (MB4) + `efecto-movimiento` (MB1) + diálogo (MB6); el paso PG de `efecto-movimiento-predice` está en baseline (H4) | ✓ con nota |
| R20 | unit `incentivo-analitica-slt68` (M13) | ✓ |
| R21 | PG `migracion-slt68-ida-y-vuelta` (5): ida, down aborta con incentivo, down limpio, reaplicación | ✓ |
| R22 | E2E `incentivo-mensajero-slt68.spec.ts` 4/4 (reportado; no re-corrido) | ✓ con nota (H3) |

## Seguridad del dinero (revisado en código)

- Montos: STRING escala 2 en borde y DTOs; aritmética con `Prisma.Decimal`; ningún `Number`/`parseFloat`.
- Devengo `incentivo` (sube la cuenta por pagar) + egreso `egreso_pago_mensajero` con origen `incentivo_mensajero` (categoría propia → baja la ganancia), en una transacción bajo el candado del cierre.
- Anulación: `reverso_incentivo` (pago) + `ingreso_ajuste` en la caja, misma transacción; originales intactos.
- Idempotencia: registro por el único `(organizacion_id, clave_idempotencia)` de la caja, escrita primero; anulación por `origen_uq` (el `reverso_incentivo` queda dentro del predicado) y por `wallet_movimiento_origen_categoria_uq` en la caja.
- Q2: lo pagable del cierre no baja de cero (`derivarPendienteCierre` recorta a `0.00`); la cuenta por pagar sí puede quedar negativa, como decidió el humano.
- `down.sql` de enums: función dinámica sobre `pg_enum` que solo quita los 3 valores de la ficha y aborta con RAISE si hay filas → no borra valores de dev. `down.sql` de checks: devuelve el CHECK y `origen_uq` exactamente a la definición de la 293.

## Hallazgos

- **H1 — menor (contabilidad del proceso; corregir antes de abrir el PR).** `specs/SLT-68-incentivo-manual-mensajero/tasks.md`: T10–T14 siguen `[ ]`. T10–T13 están hechas y probadas (rótulos, catálogo, diálogo, E2E); T14 tiene el mapa y la ayuda, y `./init.sh` rojo solo por entorno. Hay que marcar T10–T13 y T14 con la nota del gate. No se considera bloqueante porque el trabajo existe y está verificado; es el checkbox, no el entregable.
- **H2 — menor (hueco de test sobre dinero; recomendado antes del merge).** El filtro `categoria: "incentivo"` de `PagoMensajeroMovimientoRepository.obtenerIncentivo` no lo protege ningún test: quitándolo, 30/30 verdes. Sin ese filtro, `anularIncentivoMensajeroAction` (server action invocable directamente por maestro/admin) con el id de un `pago_devengado` o de un `premio_ranking` (ambos con origen `cierre_dia`) escribiría un `reverso_incentivo` y un `ingreso_ajuste` de su monto; el CHECK de origen no lo impide (no hay FK de `origen_id`). El código de hoy es correcto; falta el caso PG «anular con el id de un devengo que no es incentivo → `no_encontrado`, cero filas».
- **H3 — menor.** El E2E 4/4 se corrió antes de `a6d57203` (que cambia lo que pinta `/wallet/mensajeros/[id]`: la fila «Incentivo» pasa a «Anulado»/anulable). Las aserciones del último paso cuentan filas por concepto y deberían seguir valiendo, pero no está re-corrido: lo confirma el E2E del CI en el PR a `prod`.
- **H4 — menor (informativo).** El paso PG del incentivo en `efecto-movimiento-predice` no se ejecuta en ninguna parte: el archivo está en `tests/baseline-rojos.json` (app vacía). La predicción de «Así queda» queda cubierta por unit (MB1, MB4) y su efecto real por R7 en PG, pero el enlace «predice = queda» en Postgres no se mide hasta que SL-31 retire ese baseline.
- **H5 — menor (informativo).** `caja-backfill` e `indices-rutas-calientes` salen como «rojos NUEVOS» del gate local y no están en baseline. Clasificación de entorno creíble (FK de zona por base solo con `db:seed`; plan del planificador; fuera del diff), pero si el `gate-completo` del CI los marca, hay que mirarlos antes de mergear.

## Veredicto

**OK — APROBADO CON MENORES.** Sin bloqueantes: R1–R22 trazados a tests que corren y que alguna mutación pone en rojo; seguridad del dinero, aislamiento por empresa y migraciones correctos. Antes del PR: marcar las tasks (H1); recomendado añadir el caso de H2. El merge sigue condicionado a `gate-completo` (suite + E2E) verde en CI.
