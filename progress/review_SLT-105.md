# Review — SLT-105 «Cola de bodega de la central: Por conciliar y Conciliados» (C1)

> Reviewer, 2026-11-11. Rama `feature/SLT-105-cola-bodega-central`, HEAD `df13a048`, diff
> `origin/dev...HEAD`. Ruta **completa** (lectura de dinero; correcta). T0 la hizo el leader
> (`rechazado` 0, `cambian_de_lista` 0); T6 (C1 y C2 —SLT-127 «Cola de bodega de la central con la cola
> única»— a `prod` juntas) es del leader y no se revisa como código.
> Grafo: no consultado (el índice de este worktree no existe, según el design); Grep/Read.

## Verificación ejecutada por el reviewer (no copiada de la bitácora)

Base desechable `slt105_c1` (solo cambia el nombre de la base del `.env`; valor sin comillas). Sin dev
server. Nada de `migrate reset`.

| Qué | Resultado |
|---|---|
| `.env` (solo booleanos) | existe, ignorado por git, `DATABASE_URL` postgres en host local, valor entre comillas en el archivo (se exportó sin ellas), sin CRLF |
| `vitest run` de slt105, slt76-desmarcable, colas/historicos `-where`, cierre-bodega-repository, criterio-unico | 6 archivos, **89 passed**, `EXIT=0` |
| `slt105-particion-conciliacion-sql-real` en `--reporter=verbose` | **8 passed**, los 8 ejecutados (ninguno `skipped`) |
| Mutación `<` → `<=` en `idsRecibidosIncompletos` | **ROJO 6/8** (R44/R122, R123 totales, R123 bodega, R124, R125 por escrito, R126) |
| Mutación: quitar `cb."organizacion_id" = NULLIF(...)` | test de integración **ROJO 1/8** («R125: la consulta a mano filtra la empresa POR ESCRITO») y guardia `sql-a-mano-por-empresa` **ROJA** («todo archivo con SQL a mano sobre negocio sin organizacion_id está en la lista») |
| Reversión | `sha1` del repositorio idéntico antes y después (`726a7a33…`); `git status` limpio |
| `pnpm run typecheck` | verde |
| `eslint` de los 7 archivos tocados | 0 errores; 4 warnings `_args` heredados (no los añade el diff) |
| `pnpm run test:guardias` | 342/343 archivos; el único rojo es `dependencias-declaradas-presentes.guardia.test.ts`, que **está en `tests/baseline-rojos.json`** (no es hallazgo) |
| `node scripts/tamano-pr.mjs` | 7/40 archivos, 756/1000 líneas |

### El test de integración no tiene camino verde sin afirmar
- Sin base: `describe.skip` visible. Con base y sin catálogos: `throw` en `beforeAll` → todos rojos.
- Sin `if (...) return` ni guardas que salten aserciones; el corpus se afirma con `toEqual` de listas
  literales escritas a mano (`["S","I","X","I2"]` / `["E","M","Z","G"]`), así que una fila ajena o la
  falta de una pone rojo.
- La lectura «como dueño» (sin RLS) es lo que hace falsable el filtro escrito de empresa: comprobado con
  la mutación (sin ella, la RLS lo tapaba).
- Los `.not.toContain("IB")` de R125 no son negativos vacíos: las mismas listas se fijan no vacías en
  los tests de R122/R123 y el total `4 + 4 = 8` lo cierra.

## Checklist

### Ruta y especificación
- [x] Ruta completa; requirements (EARS, R44, R122-R126, R136, R71, R72), design (6 alternativas
      descartadas) y tasks presentes.
- [x] T1-T5 `[x]`; T0 `[x]` (leader); T6 `[ ]` es del leader y se cumple en la promoción.
- [x] `design.md > ## Lo que ya existe` presente y con contenido; el diff reutiliza `filtrosBodegaWhere`,
      `ORDEN_CIERRES_BODEGA_ADMIN`, `BODEGA_RESUMEN_SELECT`/`toBodegaResumenRow` y el patrón de
      `senales-cola-cierre.ts`; no re-crea nada.
- [x] Tamaño del PR por debajo del máximo.
- [x] Equipo: rama publicada, ficha tomada por ArqDev (`progress/features/SLT-105.md`).

### Trazabilidad (cada R con test real)
- [x] R44 / R122 — slt105 «R44/R122…» (ids literales, unión, intersección vacía) + `colas-paginadas-where`
      (mismo `incompletos`, `in`/`notIn`, marca opuesta, sin `estado`); mutaciones 1-5.
- [x] R123 — slt105 «R123: el total…», «…filtro de bodega…», «…filtro de fecha…» (página, total, conjunto
      completo y orden); `colas-paginadas-where` / `historicos-paginados-where` (mismo `where` en
      `findMany`, `count` y conjunto).
- [x] R124 — slt105 «R124…» con `estadoConciliacionDe` por fila y faltas escritas a mano (400 y 3 000).
- [x] R125 — slt105 «R125: el incompleto de OTRA empresa…» y «…POR ESCRITO…»; guardia `sql-a-mano-por-empresa`.
- [x] R126 — slt105 «R126 (servidor)…» (marcar de menos → cola incompleto; corregir → conciliados;
      desmarcar → cola pendiente, por los métodos reales de escritura); `CierresBodegaAdminRefresco.test.tsx`
      (existente); E2E `cierre-bodega-satelite` › «SLT-105 —…» (sin recargar).
- [x] R136 — E2E `cierre-bodega-satelite` › «SLT-105 —…» («Pendientes (1)» con «Recibido incompleto» y falta
      ₡1.000 literal, ausente de «Resueltos», tras corregir «Pendientes (0)» y en «Resueltos»); el diff
      no toca `app/` ni `components/`.
- [x] R71 — guardia `liquidacion-money-safe` verde; sin código de cliente en el diff.
- [x] R72 — el diff no toca `db/`, migraciones, snapshots, asientos ni Server Actions.
- [x] `progress/impl_SLT-105.md` trae el mapa `R → test`.

### Pantalla intermedia (R136, condición de Carlos para partir)
- [x] Las pestañas siguen siendo «Pendientes» / «Resueltos» con la partición nueva: no hay cambio de
      UI; el E2E las localiza por esos nombres y afirma el conteo `Pendientes (n)` del servidor.
- [x] Coherente: «Ver / decidir» sigue disponible para el incompleto y abre el detalle con «Corregir»;
      la tarjeta pinta pastilla y «Falta por recibir». El texto de vacío de hoy se conserva (PA3 → C2).

### Calidad, datos y seguridad
- [x] Typecheck y lint sin errores.
- [x] SQL a mano filtra `organizacion_id` por escrito, además de la RLS; `$queryRaw` pasa por
      `$allOperations` de `lib/db/extension-empresa.ts` (model `undefined` → `set_config` de la empresa
      en la misma transacción), así que en la app la consulta ve la empresa de la sesión. Test con dos
      empresas.
- [x] Sin tablas, migraciones, dependencias, secretos, literales de país ni recursos de Ordenex.
- [x] Capas: solo repositorio; servicio sigue comprobando `esAccesoTotal` antes del repositorio.
- [x] Único consumidor de los cuatro métodos: `CierresBodegaAdminService` (Grep); no cambia de contrato.
- [ ] **E2E de flujos críticos con constancia local** → B1.
- [ ] `gate-completo` en CI: pendiente del PR (no lo verifica el reviewer).

## Hallazgos

### B1 — BLOQUEANTE: faltan en la bitácora el grupo `dinero` entero y `e2e/dos-empresas-humo.spec.ts`
- `docs/checkpoints-proyecto.md > Flujos críticos > Aislamiento entre empresas`: «Una feature que toque
  datos de negocio … lo corre». El diff añade una consulta SQL a mano sobre `cierre_bodega` y no hay
  salida de `dos-empresas-humo` (que recorre `/cierres-admin` con dos empresas y vigila
  `EmpresaNoResuelta` en el log del servidor).
- `docs/perfil-agentes.md > Todos los agentes > E2E en local antes del PR`: si toca dinero, «el grupo
  `dinero` entero». El propio spec clasifica el cambio como «`WHERE` de una lectura de dinero» (por eso
  la ruta completa). La bitácora solo trae `cierre-bodega-satelite` (4) y `ajuste-pago-mensajero-cierre`
  + `cierres-rediseno` (12), es decir, los afectados por grep, no el grupo.
- Riesgo real bajo (los demás specs de `dinero` usan «Resueltos» de mensajeros, no de bodega; y el E2E de
  SLT-105 ya pasa por `$queryRaw` con sesión real), pero el checkpoint es explícito.
- **Qué falta:** correr en local, con base desechable nueva y `NEXT_PUBLIC_APP_URL` como en
  `gate.yml`, `pnpm exec playwright test --project=dinero` y `e2e/dos-empresas-humo.spec.ts`, y anotar
  la salida (con `E2E_EXIT`) en `progress/impl_SLT-105.md`. **Se levanta sin otra vuelta de review** si
  sale verde sin adaptar ningún spec (mismo criterio que SLT-122 «pago bodega dueña»); si hay que tocar
  un spec, vuelve al reviewer acotado a ese diff.

### m1 — menor: comentario de cabecera desactualizado
`lib/repositories/CierresBodegaAdminRepository.ts`, cabecera de `findHistoricoCompleto` (≈ línea 345):
sigue diciendo «UNA consulta y ninguna mas (R15)», y ahora son dos (`idsRecibidosIncompletos` + `findMany`).
El design lo acepta («dos pasos»); el comentario debería decir que el `count` no viaja y que se lee antes
el conjunto de incompletos. Lo mismo, en tono, la cabecera de `listarPendientesCierresBodegaCompleto` en el
servicio («su tamaño lo marca el retraso del maestro en decidir»), que ahora incluye incompletos. No
afecta al comportamiento.

### m2 — menor: `.env` con el valor entre comillas
El `DATABASE_URL` del `.env` del worktree va entre comillas; quien lo exporte a mano sin quitarlas (como
pide la instrucción del leader) obtiene una URL inválida. No es del diff (el `.env` está ignorado); solo
aviso para las corridas de E2E de B1.

## Veredicto

**RECHAZADO** — 1 bloqueante (B1: constancia de E2E `dinero` entero y `dos-empresas-humo`), 2 menores.

El código y los tests de C1 están bien: partición por conciliación correcta y complemento exacto,
filtro de empresa escrito y probado con dos empresas, mutaciones reaplicadas por el reviewer en ROJO
(`<` → `<=` y quitar `organizacion_id`), pantalla intermedia coherente (R136). B1 se levanta sin otra
vuelta si los E2E salen verdes sin tocar ningún spec.

## Cierre (leader, 2026-11-11)

- B1 levantado: E2E `dinero` 95 passed / 0 failed (`E2E_EXIT_DINERO=0`) y `dos-empresas-humo` 18 passed (`E2E_EXIT_HUMO=0`), sin tocar ningún spec (c5b36997, `progress/impl_SLT-105.md` «Tanda 2»). Criterio de la propia review: se levanta sin otra vuelta.
- m1 hecho (solo comentarios). m2 aplicado al exportar.

**Veredicto final: OK.**
