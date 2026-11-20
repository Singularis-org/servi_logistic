# Integración de la épica de geografía jerárquica en `geo_jerarquica`

Pila, de abajo arriba: 43 → 44 → 65 → 71 → 45 → 46 → 89 → 47 → 125 → 48. Cada escalón se integra
con un **merge** (sin rebase ni force-push) de `origin/geo_jerarquica` en su rama.

## SLT-43

SLT-43 «Geografía jerárquica: modelo y migración». Rama `feature/SLT-43-geo-jerarquica-modelo`.

- Base: `origin/geo_jerarquica` = `origin/dev` = `bd43f7ae` (Merge PR #236). La rama iba 1868
  commits por detrás.
- Worktree limpio antes de empezar. `git merge --no-ff origin/geo_jerarquica`.

### Conflictos y criterio

Criterio común: unión. Se conserva todo lo de `dev` y todo lo de SLT-43. Ningún conflicto pedía
decidir comportamiento.

| Archivo | Conflicto | Resolución |
|---|---|---|
| `db/schema.prisma` (modelo `Pais`) | `dev` añade la relación `tiposIdentificacion` (SLT-42); SLT-43 añade `tiposDeNivel` y `nodosGeograficos` | Se quedan las tres relaciones. `prisma validate` en verde. |
| `docs/architecture.md` | Dos viñetas nuevas en el mismo punto: SLT-42 (teléfono, documento y hora) y SLT-43 (fase *expand*) | Se quedan las dos: primero la de SLT-42 (ya en `dev`) y después la de SLT-43. |
| `lib/db/modelos-de-negocio.ts` (cabecera) | Recuentos: `dev` dice negocio 92 / plataforma 23; SLT-43 decía 85 / 25 | Negocio 92 (lo de `dev`) y plataforma 25 (23 de `dev` + los 2 de SLT-43). Es un comentario; las listas de `dev` ya traían recuentos desfasados respecto de sus propias filas, y eso no se toca aquí. |
| `lib/db/modelos-de-negocio.ts` (`MODELOS_DE_PLATAFORMA`) | `dev` añade `BugReport*` (SLT-87, SLT-97, SLT-98); SLT-43 añade `TipoNivelGeografico` y `NodoGeografico` | Se quedan los seis modelos. |
| `tests/integration/db/historial-accion-cobro-tienda-migration.test.ts` | Lista de entidades posteriores al down: `dev` añade `organizacion` (SLT-77); SLT-43 añade `nodo_geografico` | Se quedan las dos. La lista de tipos posteriores de `dev` (SLT-86, SLT-77, SLT-94, SLT-211) entró sin conflicto. |
| `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` (6 trozos) | Recuento de `HISTORIAL_ACCION_ENTIDADES`: los dos lados decían 31, cada uno con una entidad distinta (`organizacion` de SLT-77, `nodo_geografico` de SLT-43). Tipos: 82 (SLT-43) frente a 86 (`dev`) | Tipos 86 (SLT-43 no añade tipos). Entidades **32** = 31 de `dev` + `nodo_geografico`, comprobado sobre el catálogo combinado (86 tipos sin repetir, 32 entidades). Los dos tests nuevos de SLT-211 se conservan. |

`pnpm-lock.yaml` cambió con el merge (viene de `dev`): `pnpm install --frozen-lockfile` en verde.

### Migraciones: orden de aplicación

Las seis migraciones de SLT-43 (`20261104120000` … `20261104120500`) tienen fecha anterior a 37 de
`dev`. En producción las de `dev` ya están aplicadas; las de SLT-43 llegarían después.

**Prueba empírica: NO corrida.** El plan era crear una base vacía en el Postgres local
(`localhost:5432`), aplicar las 334 migraciones de `dev` (exportadas de `origin/geo_jerarquica` a
un directorio temporal) y después `prisma migrate deploy` con las de la rama. El clasificador de
permisos denegó el `CREATE DATABASE` dos veces («Modify Shared Resources»). Docker Desktop no
estaba arrancado y no hay `psql`. No se usó la base de desarrollo del `.env`
(`servi_logistic_simprod`): los tests de `down` y un deploy encima la modificarían. **Falta que el
humano autorice crear una base de prueba, o que la cree y pase su URL.**

Análisis estático (sin ejecutar):

- `prisma migrate deploy` (Prisma 7.8, `scripts/migrate-deploy.ts`) aplica las migraciones de la
  carpeta que no están en `_prisma_migrations`, por orden de nombre. Según la documentación de
  Prisma, `deploy` no comprueba que una pendiente sea posterior a la última aplicada (eso lo hace
  `migrate dev`, que en producción no se usa). Es lo que se esperaba confirmar con la prueba.
- Las seis de SLT-43 no dependen de nada que `dev` cambie después de `20261104`:
  - `geo_enums`: `ADD VALUE IF NOT EXISTS 'nodo_geografico'` en `historial_accion_entidad` y en
    `historial_plataforma_entidad`. Las de `dev` posteriores sobre esos enums también son
    `ADD VALUE IF NOT EXISTS` (`tarifa_activacion`, `organizacion`) y ninguna recrea el tipo. En
    producción, `nodo_geografico` quedaría al final del enum, detrás de `organizacion`. En una base
    nueva (CI) queda antes. Prisma no depende del orden interno del enum.
  - `tipo_nivel_geografico` y `nodo_geografico`: tablas nuevas, más el trigger sobre `pais`. Las
    migraciones de `dev` sobre `pais` (`20261107120000_slt42_pais_telefono_y_zona`) solo añaden
    columnas y CHECK, sin tocar `nivel_N_*`.
  - Sincronía (`provincia`, `canton`, `distrito`) y columnas `nodo_geografico_id` en `orden`,
    `zona_distrito`, `distrito_zona_especial` y `cierre_detail`: ninguna migración de `dev`
    posterior a `20261104120500` hace DDL ni DML sobre esas tablas.
- CI aplica todas las migraciones en orden de nombre sobre una base nueva (SLT-43 antes que las de
  `dev`). Prueba ese orden, no el de producción.

### Verificación local

Todo con `NODE_OPTIONS=--max-old-space-size=8192`, sin `DATABASE_URL`: los tests de
`tests/integration/db/` se saltan.

- `pnpm install --frozen-lockfile`: verde (el lockfile cambió con el merge).
- `prisma validate`: «The schema at db\schema.prisma is valid». `prisma generate`: verde.
- Typecheck:
  - `tsc --noEmit` dio un solo error, en `.next/types/validator.ts`. Ese archivo es un artefacto
    ignorado por git (del 2026-10-29) que apunta a `app/(app)/configuracion/vehiculos/page`, una
    página que `dev` retiró en SL-42. En CI no existe `.next`.
  - Repetido con un tsconfig temporal que excluye `.next`: `exit=0`.
- `pnpm run lint`: `exit=0`, 0 errores (249 avisos, ya presentes).
- `vitest run guard` + `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` +
  `tests/integration/db/historial-accion-cobro-tienda-migration.test.ts`:
  `Test Files 360 passed | 3 skipped (363)`, `Tests 5471 passed | 37 skipped (5508)`. El test de
  migración de cobro-tienda se salta sin base, así que su conflicto solo se prueba en CI.
- `lib/db/modelos-de-negocio.ts` lo cubren las guardias de censo de tablas incluidas arriba.

### CI

- Commit de merge `4bacc530`, publicado con `git push` normal.
- `gate.yml` lanzado a mano con `workflow_dispatch` sobre la rama:
  https://github.com/Singularis-org/servi_logistic/actions/runs/44539511540 (no se esperó el
  resultado).

## SLT-43 — rojos CI 44608687001

`gate-completo` encontró dos archivos en rojo fuera del baseline. Los dos son censos de igualdad
EXACTA escritos en `dev` antes de que existiera lo de SLT-43 «Geografía jerárquica: modelo y
migración»; el código de SLT-43 y el de `dev` están bien. Error sacado del log de los shards.

- `tests/integration/db/orden-traspaso-migration.test.ts` > «su timestamp es POSTERIOR…»: la
  lista de migraciones posteriores a `orden_traspaso_mensajero` recibió 144 y esperaba 138. Las 6
  de más son las de SLT-43 (`20261104120000` … `20261104120500`), que el censo no declaraba.
  - Arreglo: se declaran en su sitio por orden de nombre, con su ficha y su motivo (R19, R34), igual
    que las demás entradas. La igualdad exacta se queda: una migración no declarada sigue en rojo.
  - Grep sobre sus `.sql`: ninguna nombra `orden_traspaso_mensajero`.
  - El caso avisa justo de esto: un timestamp anterior a migraciones de `dev` ya aplicadas. Ya
    estaba analizado arriba («Migraciones: orden de aplicación»). Sigue pendiente la prueba
    empírica sobre una base con las de `dev` ya aplicadas.
- `tests/integration/db/corregir-datos-cliente.repo.test.ts` > «327 caso 3+4 (R1/R22)»: tras
  corregir el distrito, cambia también `nodoGeograficoId`. Lo hace el trigger `orden_nodo_geografico`
  de SLT-43 (R20: el nodo de la orden sigue a su distrito), a propósito.
  - Arreglo: `nodoGeograficoId` entra en el conjunto de columnas que cambian, y se fija su valor
    (`= distritoId`, el id del nodo de un distrito). Las coordenadas (R22 de esa ficha) siguen
    afirmadas igual.

Verificación local (`NODE_OPTIONS=--max-old-space-size=6144`, contra `servi_logistic_simprod`;
los dos archivos solo escriben en transacciones revertidas):

- Los 2 archivos: `Test Files 2 passed (2)`, `Tests 37 passed (37)`.
- `tsc --noEmit`: sin errores. `eslint` sobre los dos archivos: sin salida.
- `vitest run guard`: `Test Files 358 passed | 3 skipped (361)`, `Tests 5407 passed | 28 skipped`.

## SLT-44

SLT-44 «Geografía jerárquica: dominio y repositorios». Rama `feature/SLT-44-geo-jerarquica-dominio`,
PR #55 contra `geo_jerarquica`.

- Worktree limpio antes de empezar. `git fetch origin`.
- `git merge --no-ff origin/geo_jerarquica` (`6fa51e48`, Merge PR #44): la rama iba 1871 commits
  por detrás. Commit `67aedb2a`.
- `git merge --no-ff origin/feature/SLT-43-geo-jerarquica-modelo` (`02bb1160`): trae los dos
  commits de SLT-43 que no entraron en #44 (`ed186693`, marca de tamaño de SLT-43; `02bb1160`,
  los dos censos exactos). Commit `9e9cba94`.

### Conflictos y criterio

**Ninguno** en los dos merges. Nada pidió decidir comportamiento.

- `orden-traspaso-migration.test.ts`: las 6 migraciones de SLT-43 quedan declaradas una sola vez.
- SLT-44 no añade migraciones, modelos, entidades del historial ni excepciones nuevas (R25): los
  censos de migraciones, de `lib/db/modelos-de-negocio.ts` y del catálogo del historial no cambian.
- `pnpm-lock.yaml` y `db/schema.prisma` vienen de `dev`: `pnpm install --frozen-lockfile`,
  `prisma validate` y `prisma generate` en verde.

### Tests de `dev` ajustados

- `tests/integration/db/cobertura-repository.test.ts` > «SLT-54 R30 — la marca sigue en el Excel
  tras activar, y es la de la empresa»: rojo con SLT-44 (`EmpresaNoResuelta` en
  `CatalogoGeograficoRepository.deLaEmpresa`). El Excel de cobertura lee ahora el catálogo de la
  empresa **del contexto** (SLT-44 R9, R20). El test fijaba la empresa solo en la base (`comoApp`);
  el contexto seguía en la empresa por defecto de `enTransaccionRevertida`, que la RLS no deja ver
  (R10). En producción contexto y GUC salen del mismo id.
  - Arreglo de montaje, el mismo que `8f8ba908` en `tarifa-empresa-nueva.test.ts`: la lectura corre
    dentro de `conEmpresa(org, …)`. Las aserciones (marca de A antes y después de activar, B sin
    marca) no cambian.

### Verificación local

`NODE_OPTIONS=--max-old-space-size=6144`.

- Typecheck: `tsc --noEmit` con un tsconfig temporal que excluye `.next` (artefacto viejo): `exit=0`.
- `pnpm run lint`: `exit=0`, 0 errores (249 avisos, ya presentes).
- `vitest run guard` (sin base): `Test Files 361 passed | 3 skipped (364)`,
  `Tests 5426 passed | 28 skipped (5454)`.
- `vitest related --run` sobre los fuentes de SLT-44 y los dos censos (sin base):
  `Test Files 1 failed | 537 passed | 273 skipped (811)`, `Tests 7920 passed | 2224 skipped`.
  El único rojo, `total-a-cobrar-sin-cerrado-sql-real.test.ts`, exige `DATABASE_URL` por diseño
  («este test no se salta»); con base, verde (abajo).
- Integración contra `servi_logistic_simprod` (el `.env` del checkout principal; todos los casos en
  transacciones revertidas, sin crear ni borrar bases): `corregir-datos-cliente.repo`,
  `geo-catalogo-repository`, `geo-equivalencia-dinero`, `geo-lecturas-catalogo`,
  `geo-lecturas-sin-backfill`, `orden-traspaso-migration`, `tarifa-empresa-nueva`,
  `zona-distrito-unica`, `total-a-cobrar-sin-cerrado-sql-real` y `cobertura-repository`:
  - antes del ajuste: `Test Files 1 failed | 9 passed (10)`, `Tests 2 failed | 83 passed (85)`;
  - `cobertura-repository` tras el ajuste: `Tests 1 failed | 4 passed (5)`. El rojo que queda,
    «465 … listZonaIdsConTarifaGeneral (R14)», **no es de SLT-44**: sale igual en el worktree de
    SLT-43 (`02bb1160`) contra la misma base, y en el CI de SLT-43 ese archivo pasó. Depende de los
    datos de la base local; no se toca.
  - `eslint` del archivo ajustado: sin salida.

### Tamaño del PR

`scripts/tamano-pr.mjs` lo marca en rojo. **No se añade la marca de aceptado**: decide el humano.

- Contra `dev` (lo que mide el script, `ramas.integracion`): 77/40 archivos, 3309/1000 líneas de
  producción, 5880/3000 de tests. Incluye lo de SLT-43, aún no en `dev`.
- Contra `geo_jerarquica` (la base real de #55, mismas reglas de `medir`): 32/40 archivos,
  **1998/1000 líneas de producción**, 2562/3000 de tests.

### CI

- Commit `e2f3f59a` (sobre los merges `67aedb2a` y `9e9cba94`), publicado con `git push` normal.
- `gate.yml` lanzado a mano con `workflow_dispatch` sobre la rama:
  https://github.com/Singularis-org/servi_logistic/actions/runs/44639642504 (no se esperó el
  resultado).

## SLT-44 — rojo CI 44641382942

`gate-completo` dio un rojo nuevo: `tests/integration/db/zona-sin-distritos.test.ts` (SLT-198,
`dev`), caso «R1224/R1226/R1227/R1228/R1232: vaciar Cartago…». Con Cartago vacía, la resolución
seguía devolviendo Cartago en `canton` y en `correccion`.

- Causa (montaje del test, no producción): el caso usa **un solo** `OrdenRepository` para toda la
  secuencia: resuelve, vacía la zona con `ZonaRepository` y vuelve a resolver. SLT-44 R11 lee el
  catálogo y las asignaciones una vez por instancia de repositorio (una petición) y no los reutiliza
  entre peticiones. La segunda resolución veía la foto de antes de vaciar.
  - En producción cada composición crea su repositorio por llamada. Ningún servicio escribe zonas y
    vuelve a resolver con el mismo `OrdenRepository` en la misma petición: `ZonaService` solo usa
    `ZonaRepository`.
  - La regla R1224 se cumple con SLT-44. Con un repositorio por resolución pasan la resolución
    vacía (`null`) y la final (Quebradilla → GAM, Dulce Nombre → `null`).
- Arreglo: el `resolver` del caso crea su `OrdenRepository` en cada llamada, sobre la misma
  transacción revertida. Las aserciones no cambian (R1224 sigue afirmada igual). Código de SLT-44
  sin cambios.
- Verificación local (`NODE_OPTIONS=--max-old-space-size=6144`, contra `servi_logistic_simprod`, en
  transacciones revertidas):
  - `zona-sin-distritos`, `zona-distrito-unica`, `geo-catalogo-repository`,
    `geo-lecturas-catalogo` y `geo-lecturas-sin-backfill`: `Test Files 1 failed | 4 passed (5)`,
    `Tests 1 failed | 30 passed (31)`. El caso de R1224 sale en verde.
  - El rojo que queda, «R1220/R1223/R1225» (historial con filas de más), **no es de SLT-44**: sale
    igual en el worktree de SLT-43 contra la misma base, y en CI pasa. Depende de los datos de la
    base local.
  - `tsc --noEmit` (sin `.next`): sin errores. `eslint` del archivo: sin salida.
  - `vitest run guard`: `Test Files 361 passed | 3 skipped (364)`, `Tests 5426 passed | 28 skipped`.

- Commit `7d16628a`, `git push` normal. CI lanzado sin esperar:
  https://github.com/Singularis-org/servi_logistic/actions/runs/44644761926

## SLT-65

SLT-65 «Geografía jerárquica: consultas de órdenes, cierres y zonas sobre el nodo» (PR #75, base
`geo_jerarquica`). Puesta al día de `feature/SLT-65-geo-jerarquica-consultas` (`49f3296c`) con
`origin/geo_jerarquica` (`88442421`, tras #44 y #55): merge, sin rebase. La rama de SLT-44 no tenía
commits fuera de la épica, así que no hizo falta un merge aparte.

### Conflictos y criterio

- `progress/deudas.md`: SLT-65 había dado de alta su D43 (`enUnaFoto` reutiliza
  `OPCIONES_TRANSACCION`) y `dev` trae otra D43 (encabezado de la descarga), más D44-D80. Se
  conservan todas; la de SLT-65 se renumera a **D81** con una nota en su «Dueño». Las menciones a
  «D43» en `progress/impl_SLT-65.md` son historia y no se tocan.
- `tests/integration/db/cierre-detail-congelado.test.ts`,
  `tests/unit/repositories/cierre-dia-repository.test.ts`,
  `tests/unit/repositories/gestion-desde-ayuda-cierre.test.ts`: solo imports. Se conservan los dos
  (`delegadosDelCatalogo` de SLT-65 y `ZONA_DE_CR`/`ZONA_CR` de dev); los dos se usan.
- `tests/integration/db/gestiones-detalle-api-405.test.ts` (censo exacto de consultas del detalle):
  SLT-65 baja de 14 a 12 en caliente (salen `distrito` y `distrito_zona_especial` del `select`) y
  dev sube de 14 a 15 con `cierre_detail_concepto` (SLT-52, medido en SLT-186). En el código
  fusionado el `select` del detalle trae `cierreDetail.conceptos` y no trae `zonasEspeciales`, así
  que el censo es **13**: la lista de SLT-65 más `cierre_detail_concepto`. Medido en local (verde).
- Auto-fusionados y revisados: `zona-sin-distritos.test.ts` y `orden-traspaso-migration.test.ts`
  quedan idénticos a `geo_jerarquica` (el arreglo `7d16628a` y el censo de migraciones geo
  intactos). SLT-65 no añade migraciones ni entidades de historial. `lib/db/excepciones-aislamiento.ts`
  conserva las excepciones de los dos scripts de SLT-65.

### Marca de tamaño

`progress/features/SLT-65.md` lleva
`<!-- tamano-pr-aceptado: 2026-11-20 · pila geo aceptada entera por el humano (2026-11-19) -->`.

### Verificación local

- `pnpm install --frozen-lockfile` y `pnpm prisma generate`: sin errores.
- Base desechable `logistic_slt65_r1120` (localhost; `migrate deploy` de todas las migraciones y
  `db:seed`). No se usó `servi_logistic_simprod`.
- `vitest run` de los cuatro archivos en conflicto más `zona-sin-distritos` y
  `orden-traspaso-migration` (`NODE_OPTIONS=--max-old-space-size=8192`):
  `Test Files 6 passed (6)`, `Tests 172 passed (172)`.
- `pnpm run typecheck` (`tsc --noEmit`): exit 0. `pnpm run lint`: 0 errores (249 avisos, ya existentes).
- `vitest run tests/unit/guards`: `Test Files 262 passed (262)`, `Tests 3990 passed | 4 skipped`.

### CI
