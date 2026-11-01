# impl SLT-75 «Un distrito no puede quedar en dos zonas» (HOTFIX)

Rama `hotfix/SLT-75-distrito-zona-unica` (desde `origin/prod`), worktree `.worktrees/SLT-75-hotfix`.
Base local `servi_slt75` (nueva, migraciones de prod + `db:seed` de catálogos). Implementado
2026-10-31 por tres subagentes en paralelo: backend A (T1, T2, T6, T9), backend B (T7, T3, T4, T5)
y frontend (T8). Detalle de T8 en `progress/impl_SLT-75-T8.md`.

## Archivos

- Migraciones: `db/migrations/20261101090000_zona_distrito_duplicados_sin_zona/{migration,down}.sql`,
  `db/migrations/20261101090100_zona_distrito_distrito_unico_por_empresa/{migration,down}.sql`.
- `db/schema.prisma` (`@@unique([organizacionId, distritoId])`).
- `lib/interfaces/repositories/IZonaRepository.ts`, `lib/repositories/ZonaRepository.ts`,
  `lib/services/ZonaService.ts`, `lib/types/geografia-nodo.ts`, `lib/repositories/GeoRepository.ts`.
- `app/(app)/configuracion/tarifas/_components/{GeografiaSelector,CrearZonaForm,ZonasTarifasModule}.tsx`.
- Tests nuevos: `tests/integration/db/zona-distrito-unica.test.ts`,
  `tests/integration/db/zona-distrito-unica-migration.test.ts`,
  `tests/unit/repositories/geo-repository-arbol-zonas.test.ts`,
  `tests/unit/components/geografia-selector-zona-ocupada.test.tsx`,
  `tests/components/ZonasTarifasEditarDistritos.test.tsx`, `tests/components/ZonaDistritoEnOtraZona.test.tsx`.
- Tests adaptados: `zona-repository.test.ts`, `zona-service.test.ts`, `geografia-service.test.ts`,
  `filtrar-arbol-geografico.test.ts`, `geografia-catalogo-activo.test.ts`,
  `zona-guardado-conserva-inactivos.test.ts`, `zona-reconciliacion-ordenes.test.ts`,
  `corregir-datos-cliente.repo.test.ts`, `cobertura-repository.test.ts`,
  `zona-central-guarda-y-rastro.test.ts`, `zona-pago-mensajero-rastro.test.ts`,
  `zona-sinpe-revision.test.ts` (helper `zonaCreada` por el nuevo `CreateZonaResult`), y los fixtures
  de componentes (`geografia-selector-inactivos`, `ZonaCentralConfirmacion`, `ZonaDistritoEspecial`,
  `ZonaNombreNoImprimible`, `CrearZonaFormReconciliacion`).
- `_unicos-sin-empresa.ts` sin tocar (design §2.1): `unicos-por-empresa` 15/15.

## Mapa R → test

| R | Test |
|---|---|
| R1 | `tests/integration/db/zona-distrito-unica.test.ts` › «⭑ R1: crear con un distrito de otra zona…» |
| R2 | `zona-distrito-unica.test.ts` › «⭑ R2: actualizar con un distrito de otra zona…»; `tests/unit/services/zona-service.test.ts` (distrito_en_otra_zona → validation_error) |
| R3 | `zona-service.test.ts` › «⭑ R3: un mensaje por conflicto, con la forma exacta…» (literal); `zona-distrito-unica.test.ts` (nombres reales sembrados) |
| R4 | `zona-distrito-unica.test.ts` › «⭑ R4: guardar la zona con sus mismos distritos → ok»; unit en `zona-repository.test.ts` |
| R5 | `zona-distrito-unica.test.ts` › «⭑ R5: el mismo distrito en una zona de la empresa B no bloquea…» |
| R6 | `tests/unit/repositories/zona-repository.test.ts` (lectura con `tx` antes de escribir, create y update); PG R1/R2 |
| R7 | `zona-distrito-unica.test.ts` (inserción directa misma empresa falla / otra empresa se acepta); `zona-distrito-unica-migration.test.ts` › «R7 — …» (forma del índice) |
| R8 | `zona-distrito-unica.test.ts` › «⭑ R8: el error REAL del indice lo reconoce…» y «⭑ R8: la carrera…»; `zona-repository.test.ts`; `zona-service.test.ts` (conflictos null) |
| R9 | `tests/integration/db/zona-distrito-unica-migration.test.ts` › «R9 — …» |
| R10 | mismo archivo › «R10 — vive en el esquema respaldo» y privilegios de `servi_app` |
| R11 | mismo archivo › «R11 — orden.zona_id y updated_at…» |
| R12 | mismo archivo › «R12 — los dos down.sql … restauran» y «restaura solo la fila cuya zona sigue existiendo» |
| R13 | mismo archivo › caso sin duplicados |
| R14 | `tests/integration/db/geografia-catalogo-activo.test.ts` (1 y 0 zonas); `zona-distrito-unica.test.ts` › «⭑ R14: listArbol de la empresa A no trae la zona de B»; `tests/unit/repositories/geo-repository-arbol-zonas.test.ts` (orden) |
| R15-R18 | `tests/unit/components/geografia-selector-zona-ocupada.test.tsx` |
| R19, R20 | `tests/components/ZonasTarifasEditarDistritos.test.tsx` |
| R21, R22 | `tests/components/ZonaDistritoEnOtraZona.test.tsx` |

## Migración contra Postgres real (`servi_slt75`)

- Ida: `prisma migrate deploy` → «All migrations have been successfully applied».
- Bajada (los dos `down.sql` en orden inverso + borrado de sus filas en `_prisma_migrations`):
  antes `{"indice":1,"esquema_respaldo":1,"filas_migracion":2}` → después `{"indice":0,"esquema_respaldo":0,"filas_migracion":0}`.
- Ida otra vez: aplicadas; `migrate status` → «Database schema is up to date!».
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --exit-code` →
  «No difference detected.», `DIFF_EXIT=0`.
- Ventana sin índice en `servi_slt75`: 23:32:29-23:32:32.

## Mutaciones (todas autocomprobadas: verde sin mutar con N>0, grep del texto mutado, rojo, `git checkout --` y grep de vuelta)

| R | Mutación | Rojo |
|---|---|---|
| R1 | lectura de `create` después de `zona.create` | PG 9 → 1 falla («⭑ R1…») |
| R2 | lectura de `update` después de `deleteMany` | PG 9 → 1 falla («⭑ R2…») |
| R3 texto | «ya está en la zona» → «ya pertenece a la zona» | 47 → 6 fallan |
| R3 orden | sin `localeCompare` | 38 → 1 falla |
| R4 | sin `zonaId: { not }` | 69 → 3 fallan |
| R5 | `DISABLE ROW LEVEL SECURITY` en la tx del test (mutación en el test: con `servi_app` la RLS es la que aísla) | 9 → 6 fallan |
| R6 | lectura con `this.prisma` (update / create) | 60 → 27 / 16 fallan |
| R7 | sin `CREATE UNIQUE INDEX` / índice solo `(distrito_id)` | «expected null to be '23505'» / regex de la forma del índice |
| R8 | detector `false` / solo `e.code === "P2002"` | 69 → 4 / 7 fallan |
| R9 | `GROUP BY` sin empresa | «…la de B, intactas» |
| R10 | respaldo en `public` | «expected ['public'] to deeply equal ['respaldo']» |
| R11 | `UPDATE orden SET updated_at = now()` (zona_id es NOT NULL: `SET zona_id = NULL` rompería la migración antes de la aserción) | «R11 — orden.zona_id y updated_at» |
| R12 | `down.sql` sin `INSERT` | «R12 — los dos down.sql … restauran» |
| R14 | `zonas` vacía / sin orden | 28 → 4 / 3 → 1 |
| R15-R22 | ver `progress/impl_SLT-75-T8.md` (11 mutaciones, todas rojas) | |

Scripts: `<scratchpad>/mutar75.sh` (A), `<scratchpad>/mut75.py` + `mut75.log` (B). La primera tanda
de B no ejecutaba tests (bash de WSL); se detectó por salida vacía y se añadió un control que aborta
si vitest no imprime la línea `Tests`.

Cómo llega el error del índice: `PrismaClientKnownRequestError` `P2002`, sin `meta.target`; el
nombre del índice viene en `meta.driverAdapterError.cause.originalMessage` (23505). El detector lo
busca ahí.

## T9: tests eliminados o reescritos

| Test | Protegía | Sigue protegido en |
|---|---|---|
| `zona-reconciliacion-ordenes` `:383` (reescrito: guardar A con un distrito de B → `distrito_en_otra_zona`, la orden conserva su zona, sin historial) | un distrito con dos zonas no mueve órdenes | estado irrepresentable (índice, R7); rama «>1» del colapso en unit `zona-repository.test.ts` |
| `zona-reconciliacion-ordenes` `:590` (reescrito sin la fila en B) | (a) unión antes ∪ después; (b) un `lote_id` por guardado (366 R11) | (a) mismo test; (b) ningún otro lo afirmaba con más de una fila: se afirma aquí con 2 órdenes de 2 distritos y `Set(loteId).size === 1` |
| `zona-reconciliacion-ordenes` 377/R2-R6, 377/R3, 377/R1 (fuera de §8.1: sembraban el distrito en A y B) | el corte de la 377 (estante de satélite no cambia de zona; tránsito sí) | reescritos quitando el duplicado: distrito solo en A, orden con zona B, guardar A; R1 añade `retenidas === 1`. **Para el reviewer**: §8.1 no los listaba |
| `corregir-datos-cliente.repo` `dosZonas` y su aserción (y `zonaExtra`, sin uso) | `findDistritoParaCorreccion` no inventa zona con dos | unit `corregir-datos-cliente-service.test.ts:549`, `zona-repository.test.ts:842` |
| `cobertura-repository` fila z2/dDos | `listDistritos` sin colapsar | «Una Zona» y «Otra Zona Uno» como arrays |
| `geografia-catalogo-activo` `distritoDosZonas`, `zonaB` y caso «con DOS zonas» | el árbol no muestra «la primera» zona | R7 en base; colapso en unit; orden de `zonas` en `geo-repository-arbol-zonas.test.ts` |

Barrido de los 12 archivos (con el rechazo nuevo activo): ninguno siembra duplicados. 10 verdes
(145 tests). `informe-transito-zonas` falla por «no hay ningun usuario» (está en el baseline).
`geografia-por-pais` falla en 2 tests que esperan `23503` y reciben `23001` en un FK RESTRICT de
cantón/distrito: no está en el baseline, pero ni el archivo ni esas FK cambian en esta rama (solo se
toca `zona_distrito`).

`cobertura-repository` y `corregir-datos-cliente.repo` están en `tests/baseline-rojos.json` y piden
datos previos que una base de catálogos no tiene: sus cambios solo pasaron lint y typecheck.

## Cliente Prisma (node_modules compartido)

El cliente compartido estaba generado (23:01) desde un schema que no era ni el de SLT-75 ni el de
SLT-73, y daba 12 errores de typecheck en archivos de Wallet ajenos. Se guardó una copia en
`<scratchpad>/prisma-client-bak` y se corrió `prisma generate` desde esta rama a las 23:37:14.

La otra sesión volvió a regenerar el cliente desde otro schema (23:51:35, 23:54:52, 23:56:50,
23:57:19). La de las 23:51 rompió un archivo de `test:rapido` («Cannot find module
'.prisma/client/default'») y la de las 23:54 rompió el primer `next build` (enum
`egreso_diferencia_satelite`, de SLT-73). Antes de cada build se generó otra vez desde esta rama
(23:52:44, 23:55:41, 23:58:19). Copias del cliente ajeno en `<scratchpad>/prisma-client-bak{,2,3}`.

## Gate

`NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` (con `conbase75.sh`, base `servi_slt75`), log
`<scratchpad>/gate_SLT-75.log`:

```
✗ feature_list.json invalido:
specs/SLT-75-distrito-zona-unica/ no tiene ficha en R:\...\servi_logistic\feature_list.json: falta SLT-75.
INIT_EXIT=1
```

El validador lee el `feature_list.json` del worktree principal, que no tiene la ficha SLT-75: falta
el import F0, que es del leader. Como `fail` corta el script, se corrieron a mano los pasos
siguientes del modo rápido (`<scratchpad>/gate75_manual.sh`, log `gate_SLT-75_manual.log`):

| Paso | Resultado |
|---|---|
| `scripts/gate-proyecto.sh` | `GP_EXIT=0` |
| `pnpm run typecheck` | `TC_EXIT=0` |
| `pnpm run lint` | `LINT_EXIT=0` (0 errores, 232 avisos que ya estaban) |
| `pnpm run test:rapido` | `Test Files 1 failed \| 408 passed (409)`, `Tests 5856 passed \| 26 skipped`; rojo nuevo: `tests/unit/components/recuperar-orden.ui.test.tsx` |
| `down.sql` de todas las migraciones | ninguna falta |

El único rojo, `recuperar-orden.ui.test.tsx`, es «Cannot find module '.prisma/client/default'»: la
otra sesión regeneró el cliente a las 23:51:35, dentro de la corrida (23:42-23:51). Solo, con el
cliente ya regenerado: `Test Files 1 passed (1)`, `Tests 16 passed (16)`. El archivo no está en el
diff de esta rama.

**Pendiente del leader:** importar SLT-75 a `feature_list.json` y volver a correr `./init.sh`.

## E2E (local, `next build` + `next start`, puerto 3075, base `servi_slt75`)

`E2E_PUERTO=3075 NEXT_PUBLIC_APP_URL=http://localhost:3075 pnpm exec playwright test
e2e/zona-especial-dos-empresas.spec.ts e2e/dos-empresas-humo.spec.ts` (más su dependencia
`plataforma-vacia`). Log en `<scratchpad>/e2e_SLT-75.log`:

```
Running 21 tests using 1 worker
  21 passed (1.3m)
E2E_EXIT=0
```

El cliente Prisma no cambió durante el build ni durante el E2E (23:58:19 antes y después). Una
corrida anterior falló en `superadmin-empresas` › «2. crea A y B…» porque faltaba
`NEXT_PUBLIC_APP_URL` («[bienvenida] no se envio: falta NEXT_PUBLIC_APP_URL»). El CI la fija en
`gate.yml:372`. No hay specs E2E de `configuracion/tarifas` aparte de `zona-especial-dos-empresas`.

## Notas para el PR (las escribe el leader)

- **Efecto visible para Carlos (design §3.3).** Tras el deploy, el distrito que estaba en dos zonas
  queda sin zona. Una orden nueva con ese distrito se rechaza con «no tiene zona asignada» hasta que
  el maestro lo asigne a una zona desde /configuracion/tarifas, cosa que ahora sí puede hacer.
- **Para el dueño de SLT-43 (design §10).** Al llevar este hotfix a `dev`: el respaldo y el
  `down.sql` usan columnas con nombre, así que conviven con `zona_distrito.nodo_geografico_id`, y el
  `INSERT` del `down.sql` dispara su trigger. Si para entonces existe la guardia de migraciones
  destructivas, `20261101090000` necesita su excepción declarada.
- **Para el reviewer.** Los tres casos 377 de `zona-reconciliacion-ordenes` reescritos (fuera de la
  lista de §8.1). Y el texto del toast de R21 queda «…Zona Norte. y 1 más.» (con punto delante de
  « y»), literal del spec.

## Evidencia visual (T8, local, datos sintéticos en `servi_slt75`)

Spec Playwright de un solo uso (borrado, no versionado), 00:07:07-00:07:17, `next start` en 3075:

- `<scratchpad>/evidencia75/selector-bloqueado.png`: «Editar zona» de «Zona Norte Demo 5488». Un
  distrito de «Zona Sur Demo 5488» sale con la casilla deshabilitada y «(zona: Zona Sur Demo 5488)»;
  el spec afirma `disabled` y el nombre accesible con «(zona: …)» (R15, R18).
- `<scratchpad>/evidencia75/toast-distrito-en-otra-zona.png`: se marca un distrito libre, el spec lo
  mete en la otra zona por base antes de guardar y al guardar sale el toast de error «<distrito> ya
  está en la zona Zona Sur Demo 5488.», con el mismo texto bajo el selector (R1/R2, R3, R21).

Para esa corrida se regeneró el cliente (00:02:42-00:02:48) y se rehízo el build (00:04:49-00:06:28).

## Vuelta 2 (review RECHAZADO: B1, m1, m2) — commit d92eca24

- **B1.** `20261101090000…/down.sql`: el `DROP SCHEMA IF EXISTS respaldo` va en un bloque `DO` sin
  CASCADE que atrapa `dependent_objects_still_exist` (2BP01). Si queda un objeto de otra ficha
  (`respaldo.slt73_asientos`), el esquema se queda. El test de migración siembra una tabla ajena en
  `respaldo` y comprueba que sobrevive con su fila; otro caso comprueba que con `respaldo` vacío el
  esquema sí desaparece. Mutación: volver al `DROP SCHEMA IF EXISTS respaldo;` → «expected '2BP01' to
  be null» (y los `beforeAll` de la migración caen con 2BP01). Extra: `CASCADE` → «R12/B1 — con un
  objeto ajeno en respaldo…» rojo.
- **m1.** `20261031140200_slt73_retirar_asientos_satelite/down.sql`: `DROP SCHEMA respaldo CASCADE`
  → `DROP TABLE IF EXISTS respaldo.slt73_asientos` + el esquema solo si queda vacío. Prisma no
  checksumea `down.sql`: `migrate status` «Database schema is up to date!» y `migrate diff
  --exit-code` «No difference detected.». Convivencia en
  `tests/integration/db/respaldo-convivencia-slt73-slt75.test.ts` (4 tests): cada down deja el
  respaldo del otro con su fila; los dos juntos quitan el esquema. Mutación: el down de SLT-73 de
  vuelta a `CASCADE` → «m1 — el down de SLT-73 quita SU tabla y deja intacto el respaldo de
  SLT-75» rojo. Se ajustó R19 de `slt73-migracion-retira-asientos.int.test.ts` (ahora exige que
  desaparezca la tabla, no el esquema).
- Nuevo `sentenciasSql` en `tests/integration/db/_fixtures/sql-ejecutable.ts` (corta por `;`
  respetando `$tag$…$tag$`).
- **m2.** Comentario de `zona-reconciliacion-ordenes.test.ts:597` corregido (mide R3 y R11).
- Tests tocados contra `servi_slt75b` (con SLT-73): 4 archivos, 54/54.

### Gate v4 sobre HEAD (`servi_slt75b`, `prisma generate` 00:56:03; el cliente no cambió durante el gate)

`<scratchpad>/gate_SLT-75_v4.log`: validador de features en verde (SLT-75 ya importada), typecheck y
lint en verde; `test:rapido`: `Test Files 1 failed | 1320 passed (1321)`, `Tests 2 failed | 18077
passed | 26 skipped` → `INIT_EXIT=1`.

Único rojo nuevo: `tests/integration/db/geografia-por-pais.test.ts`, 2 tests, «expected '23001' to
be '23503'» (FK RESTRICT de cantón/distrito). **Ajeno, probado:** en un checkout limpio de
`origin/prod` (e4d53c38, worktree temporal ya borrado), contra la misma base, el mismo archivo da
`Tests 2 failed | 9 passed (11)` con el mismo error. Ninguna migración del repo emite `23001`: lo
emite el Postgres local (18.2). Ni el archivo ni esas FK están en el diff de la rama.
