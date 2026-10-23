# SL-31 — Bitácora de implementación

## Tanda 1 — CI: base migrada en los shards (T5; R16–R18)

Fecha: 2026-10-22. Implementer (sin subagentes: la tanda es un solo archivo de CI, sin código de
producción ni tests). Rama `feature/SL-31-tests-datos-propios-ci` (la indicó el leader; el spec ya
está commiteado en ella), PR propio a `dev`.

### Archivos modificados

- `.github/workflows/gate.yml`
  - `vitest`: paso nuevo «Base del shard (migrada + catalogos)» entre «Credenciales efimeras» y el
    gate: `set -euo pipefail; prisma generate; prisma migrate deploy; pnpm run db:seed` (R16).
  - `e2e`: «Base del E2E (migrada + catalogos)» con `migrate deploy` + `db:seed`, y fuera el
    comentario `ABIERTO` (R17).
  - Fuera `SEED_ADMIN_*` / `SEED_MAESTRO_*` y las contraseñas `P1`/`P2` que solo las alimentaban,
    en los dos jobs. Quedan `SESSION_SECRET` y `APP_BASE_URL` (R18).
  - Comentarios corregidos: ya no se cita `tests/helpers/test-database.ts` (no existe) ni se dice
    que los tests crean una base efímera desde una plantilla (R18).
- `specs/SL-31-tests-datos-propios-ci/tasks.md`: T5 marcada.

### Mapa R → evidencia

| Req | Evidencia |
|---|---|
| R16 | Reproducción local (abajo) + los tres shards de `vitest` del CI del PR |
| R17 | Mismo paso en `e2e`; el job solo corre en PR a `prod` o `workflow_dispatch` (P4): pendiente de esa corrida |
| R18 | Grep de `SEED_ADMIN`, `SEED_MAESTRO` y `test-database.ts` en `gate.yml`: 0 resultados |

### Verificación local

- YAML: `actionlint` no está instalado. Parseado con PyYAML: válido; pasos de `vitest` y `e2e` en
  el orden esperado. La validación definitiva es el propio CI del PR.
- Base desechable `servi_logistic_sl31` en el Postgres local (creada vacía, 0 tablas; borrada al
  terminar). `DATABASE_URL` nunca impresa.
- Los tres comandos del paso con `set -euo pipefail` sobre la base nueva: `PASO_EXIT=0`. «All
  migrations have been successfully applied.», «Seed de catalogos completado (tipo_identificacion,
  rol, order_status, vehiculos).». 89 tablas; `usuario`/`zona`/`orden` = 0/0/0 antes y después.
- Contraprueba: el mismo paso (script con `set -euo pipefail` corrido con `bash`, como en CI) contra
  `127.0.0.1:1`: `P1001: Can't reach database server`, `INALCANZABLE_EXIT=1`, no llega a `db:seed`.
- `GATE_SHARD=1/3 bash ./init.sh --completo` sobre esa base: `Test Files 84 failed | 755 passed
  (839)`, 437,97 s. **Los 84 rojos están en `tests/baseline-rojos.json`; 0 fuera.** `INIT_EXIT=0`
  (el shard no da veredicto).
- `TEST_RAPIDO_BASE=dev ./init.sh`: `INIT_EXIT=1`, por **un** rojo ajeno a esta tanda:
  `tests/unit/guards/test-citado-desaparecido.guardia.test.ts > ninguna excepción temporal
  sobrevive a su motivo`. Dos `EXCEPCIONES_TEMPORALES` de
  `specs/461-cobro-a-tienda-y-nombres-claros/design.md` (`reclasificacion-459-migration.test.ts`,
  `reclasificacion-459-lista.guardia.test.ts`): «su borrado ya no está en la historia de git». La
  historia de `origin/dev` se aplanó a un commit (`86d70bf`), así que falla igual en `dev`; no está
  en el baseline. No se toca aquí (la tanda solo toca `gate.yml`): queda reportado al leader.
  (Una primera corrida dio además 2 errores de lint en un script auxiliar mío dentro de
  `_trabajo/`; lo moví fuera del repo y no volvió a salir.)

Logs (gitignored): `_trabajo/sl31-paso.log`, `_trabajo/sl31-inalcanzable.log`,
`_trabajo/sl31-shard1.log`, `_trabajo/sl31-init-rapido.log`.

### CI del PR #1

**Corrida 1** (run 39870419854, commit `3fb3928`): `estatico` y los tres shards en verde (el paso
de migración incluido); `gate-completo` rojo: 2516 archivos, 284 tests en rojo, **6 archivos fuera
del baseline**. Diagnóstico por archivo (mensajes del informe unido `.vitest-rojos.json`):

| Archivo | Causa medida | Qué se hizo |
|---|---|---|
| `tests/unit/guards/test-citado-desaparecido.guardia.test.ts` | Las 2 `EXCEPCIONES_TEMPORALES` de `specs/461…/design.md` exigen ver su borrado en git y la historia se aplanó en `86d70bf`. Rojo también en `dev`. No apunta al spec de SL-31. | Campo opcional `historiaAplanada` (2026-10-22): esas dos ya no exigen el borrado y siguen exigiendo archivo ausente + cita viva, con `retira: "SL-27"`. Caso sintético nuevo. Contraprueba: quitando el campo de una vuelve el rojo. La guardia es del perfil (`tests/unit/guards/`, fuera de `arnes.manifest`). |
| `tests/unit/guards/sin-nombre-heredado.guardia.test.ts` | Hallazgo `init-shard.log:2653`: el `tee` del shard escribe el log dentro del checkout, `git ls-files --others` lo ve, y la línea es `✓ tests/unit/guards/fuera-datos-ordenex.guardia.test.ts`. No apunta al spec de SL-31 (`specs/` está fuera del universo de la guardia). Depende del orden dentro del shard 3. | `gate.yml`: el log va a `$RUNNER_TEMP` y se copia al workspace en un paso `always()` justo antes de subir el artefacto. |
| `tests/integration/db/abono-tienda-457-migration.test.ts`, `cobro-tienda-461-migration.test.ts`, `wallet-461-migration.test.ts` | `expected '23503' to be '23001'` al borrar un usuario referenciado por una FK RESTRICT y otra NO ACTION. **No es falta de datos** (la fixture `personas-461` crea sus usuarios) ni se saltaban antes. Es la **versión de Postgres**: en base nueva migrada + catálogos pasan en PG 18.2 (local, 16/16) y fallan en PG 17.11 (Docker `postgres:17`, como CI: 3 fallan, 13 pasan). | Al baseline con ese motivo; los tres leen `db/migrations/`, así que los retira SL-28 (P5). La versión de Postgres de CI sigue ABIERTA en `gate.yml` (no la decido yo). |
| `tests/unit/services/rastreo-publico-service.test.ts` | `expected '2026-08-15T02:30+00:00' to be '2026-08-15T02:30Z'`. Es la **zona horaria / ICU**, determinista, no un flake: `Intl` con `timeZoneName: "longOffset"` para `UTC` da `"GMT"` en Node 24.13.0 (local, ICU 77.1) y `"GMT+00:00"` en Node 24.21.0 (CI); `lib/services/RastreoPublicoService.ts:89` solo convierte `""` en `Z`. Falla igual en `dev` (ni el test ni el servicio cambian aquí). | **Nada.** El arreglo es código de producción (fuera de SL-31, R24) y no hay ficha que retire una entrada de baseline: hace falta una ficha nueva. Sigue rojo en CI. |

Verificación local tras los arreglos: `TEST_RAPIDO_BASE=dev ./init.sh` → `== init OK ==`,
`INIT_EXIT=0` (`_trabajo/sl31-init-rapido-2.log`).

**Corrida 2** (run 39873408233, commit `6c49fa8`): `estatico` pass, `vitest (shard 1/3)` pass,
`vitest (shard 2/3)` pass, `vitest (shard 3/3)` pass, `e2e` skipping (solo PR a `prod` o a mano),
`gate-completo` **fail**: 2516 archivos, 281 tests en rojo, **1 archivo fuera del baseline**:
`tests/unit/services/rastreo-publico-service.test.ts` (ICU, ver tabla). Para cerrarlo hace falta una
decisión del leader: una ficha nueva que arregle `RastreoPublicoService` (que `+00:00` también dé
`Z`) y que la cite como motivo de su entrada en el baseline mientras tanto. PR sin mergear.

Las bases desechables (`servi_logistic_sl31`) y el contenedor `postgres:17` de la medición, borrados.

**Corrida 3:** por decisión del leader, `tests/unit/services/rastreo-publico-service.test.ts` entra
al baseline con motivo «Node 24.21 en CI da GMT+00:00 en UTC; lo arregla SL-37 (PR #2)», desde
2026-10-22. El PR #2 (`feature/SL-37-rastreo-fecha-utc`) quita la entrada al mergearse.

Corrida 3 (run 39888970739, commit `54a9a0f`), primer intento: `gate-completo` fail por
`tests/unit/components/api-keys-module.eliminar.test.tsx` (`Unable to find an element with the
text: integracion-11`, un `findByText` con el runner saturado). Es un flake: pasó en las corridas 1
y 2 y pasa 3/3 en local, y el commit solo tocaba el baseline. No entra al baseline. Se relanzó la
corrida entera (`gh run rerun`).

Segundo intento: **`gate-completo` pass**. `estatico` pass, los tres shards pass, `e2e` skipping.
«sin rojos nuevos (248 rojos, todos en el baseline de 249); 1 por limpiar». El que ya pasa es
`tests/integration/db/notificacion-evento-webhook-suscripcion-migration.test.ts`, de la exclusión de
SL-28: se deja para SL-28.

### `api-keys-module.eliminar.test.tsx`: no determinista bajo carga (arreglado)

Cayó dos veces en CI, en casos distintos: run 39888970739 («con MÁS de una fila…») y run
39891004914 («un borrado que FALLA…»). Las dos en `irAPagina2` (línea 81), a ~1075 ms, con
`Unable to find an element with the text: integracion-11`.

- **Causa:** el `findByText` usa `asyncUtilTimeout`, 1000 ms por defecto, no el `testTimeout`
  de 20 s. El clic, la petición de la página 2 al mock (resuelve al instante) y el render con
  jsdom no cupieron en 1 s en el runner de 2 vCPU. En el componente no hay carrera: el cambio de
  página es `setPage` + una clave SWR nueva. No se toca el componente.
- **Arreglo:** solo en el test.
  - `irAPagina2` espera las dos condiciones reales, en orden: que se pidió la página 2 y que se
    pintó.
  - `configure({ asyncUtilTimeout: 10000 })` en el archivo, con el razonamiento escrito, como
    `tests/components/OrdenesPageFiltros.test.tsx`.
- **Reproducción determinista** (copias temporales, ya borradas, con la página 2 retrasada):
  - 1500 ms: la versión de `HEAD` da 3/4 rojos con el error exacto de CI; la arreglada, 4/4 verdes.
  - Página que no llega nunca: la arreglada sigue roja (a los ~10 s, «expected … called with
    { page: 2 }»), así que no tapa un fallo real.
- **Bajo carga** (`vitest run tests/unit/components --pool threads` en bucle, en paralelo):
  - con el arreglo, **20/20** verdes;
  - sin el arreglo, también 20/20, y 20/20 con cuatro bucles de carga: esta máquina no reproduce
    el rojo por carga, de ahí la reproducción por latencia.
- **Mutaciones de R35** (cada una restaurada con `git checkout`):

  | Mutante | Resultado |
  |---|---|
  | M1, `retrocederSiPaginaVacia` no hace nada | rojo «⭑ borrada la ÚNICA fila…» |
  | M2, `<= 1` → `<= 99` | rojo «con MÁS de una fila…» |
  | M3, `page > 1` → `page >= 1` | rojo «en la página 1 NO retrocede» |
  | M4, la celda llama a `onEliminada` tras un borrado `bloqueada` | rojo «un borrado que FALLA…» |

  En 1 de 4 corridas de M1 cayó además «un borrado que FALLA…», a los 10 s, justo detrás del caso
  que agotó su espera. Sin mutante no ha pasado en 40 corridas.
- `TEST_RAPIDO_BASE=dev ./init.sh`: `== init OK ==`, `INIT_EXIT=0`.

#### Corrección del diagnóstico (2026-10-23): era una carrera, no CPU

El primer arreglo (`ca7a3a5`) no bastó. Run 39899861209, shard 1/3: «un borrado que FALLA…» cae a
los 10 s con `expected … called with { page: 2 }` y **una sola llamada, `{ page: 1 }`**. El clic
en «Página siguiente» no surtió efecto: no era lentitud.

- **Causa raíz:**
  - Con `fallbackData`, SWR 2.4.2 revalida la página 1 al montar, diferida a un
    `requestAnimationFrame`.
  - Durante esa revalidación `isLoading` es `true` («bypasses fallback data», `swr/dist/index`).
  - `Pagination` recibe `disabled={isLoading}`: «Página siguiente» está deshabilitado en esa
    ventana, y un clic de `user-event` que cae dentro se pierde sin error.
  - En CI el runner cargado retrasa los pasos del clic hasta esa ventana.
- **Arreglo, en el test:** `irAPagina2` espera a que la revalidación del montaje haya empezado (se
  pidió la página 1) y terminado (el botón vuelve a estar habilitado) antes de hacer clic. Después
  espera que se pida la página 2 y que se pinte. Se mantiene `asyncUtilTimeout: 10000`, ya solo
  como margen de render.
- **Componente:** deshabilitar la paginación mientras se revalida en segundo plano, con datos ya
  pintados, es un defecto menor de UX (un clic rápido justo al cargar se pierde). Es código de
  producción, fuera de SL-31 (R24): no se toca y queda reportado al leader.
- **Reproducción determinista de la carrera** (copias temporales, borradas): la página 1 tarda
  2000 ms y `userEvent.setup({ delay: 50 })`. La versión `ca7a3a5` cae 3/4 con la firma exacta de
  CI (una llamada, página 1). La nueva pasa 4/4.
- **Orden y mocks:** `--sequence.shuffle`, semillas 1–10: 10/10 verdes.
  `vitest run tests/unit/components`: 117/117 archivos. `isolate: true`, así que no hay mocks
  compartidos entre archivos.
- **Bajo carga:** 20/20 verdes.
- **Mutaciones:** M1–M4, cada una roja solo en su caso. El rojo extra de M1 en la corrida anterior
  era esta misma carrera.
- `TEST_RAPIDO_BASE=dev ./init.sh`: `== init OK ==`, `INIT_EXIT=0`.
