# SL-44 «E2E en verde en CI» · review (vuelta 1)

- Rama `feature/SL-44-e2e-verde-ci`, head revisado `b73a945`, diff contra `origin/dev`.
- Leído: requirements, design, tasks, `progress/impl_SL-44.md`, `docs/perfil-agentes.md`,
  `CHECKPOINTS.md`, `docs/checkpoints-proyecto.md`, `docs/verification.md` (diff).
- MCP del grafo: no usado. Todo con Grep/Read y ejecución.
- Lock `scratchpad/gate.lock` tomado como `reviewer SL-44` y soltado. No se creó ninguna base: no
  hizo falta correr E2E, porque el hallazgo B1 se prueba leyendo el código y el rojo de CI ya citado.
  No se usó el `.env` de la raíz, y el worktree no tiene `.env`.

## Ejecutado por el reviewer

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | `TC_EXIT=0` |
| `pnpm run lint` | 0 errores (232 avisos), `LINT_EXIT=0` |
| `pnpm run test:guardias` | `1 failed / 304 passed`: solo cae `dependencias-declaradas-presentes`, que está en `tests/baseline-rojos.json`. El baseline no cambia en el diff |
| 10 archivos de SL-44: email-config, email-notificacion, otp-debug, e2e-sin-saltos, storage-falso, e2e-host, los 2 Refresco, empresas-module y no-embalaje | `154 passed` |
| `gh run view 40144681190` | `success` sobre `5f9a823`; los 9 jobs en `success`. Playwright: `57 passed`, `15 passed` y `28 passed` (100). En el log no hay `flaky`, `skipped` ni `retry` |
| Diff `5f9a823..b73a945` | Solo `progress/impl_SL-44.md` y `tasks.md`: el run verde vale para el código del head |
| Artefacto de un run rojo (R25) | El run 40132245831 tiene `e2e-aislamiento` |
| `grep -c "secrets\." gate.yml` (R23) | 0 |
| `git diff --stat -- lib/storage lib/actions app/api` (R6) | vacío |
| Bundle `.next/server` y `.next/static`: `storage-falso`, `clave-falsa-e2e`, `E2E_LOG_SERVIDOR`, `E2E_STORAGE_PUERTO` | Sin coincidencias. Además, ningún archivo de `lib/`, `app/` ni `components/` importa de `e2e/` ni de `tests/` |

**Mutaciones** (scripts en `scratchpad/sl44rev/mutar*.mjs`). Cada una se restauró desde la copia, se
comparó con `cmp` (OK) y se cerró con `git status` limpio.

| Mutación | Esperado | Resultado |
|---|---|---|
| M1: quitar el `if (VERCEL_ENV === "production")` de `otpDebugLogHabilitado` | rojo | ROJO, `4 failed / 55 passed`: los 4 casos `production` |
| M5: `.env.example` con `AUTH_OTP_DEBUG_LOG=1` | rojo | ROJO (guardia R3) |
| M5b: `process.env.AUTH_OTP_DEBUG_LOG = "1"` en `lib/config/email.ts` | rojo | ROJO (guardia R3) |
| M2a: `test.skip(!process.env.X, …)` en `marca.spec.ts` | rojo | ROJO (`e2e-sin-saltos`) |
| M2b: `test.describe.fixme(…)` en `asignacion-satelite.spec.ts` | rojo | ROJO (`e2e-sin-saltos`) |
| M2c: `const t = test; t.skip(true)` (alias) | — | **VERDE**: hueco, ver m1 |
| M2d: `test\n  .skip(true)` (en dos líneas) | — | **VERDE**: hueco, ver m1 |
| M3a (A2): quitar `cierres-bodega:resueltos` de `refrescarListas` | rojo | ROJO (`CierresBodegaAdminRefresco`) |
| M3b (A2): el `mutate` de `confirmarSolicitud` no casa ninguna clave | rojo | ROJO (`ConsolidacionBodegaRefresco`) |
| M4: el doble de Storage sirve otros bytes | rojo | ROJO, `6 failed / 5 passed` |
| M6: el guardián de host de `abrirBaseE2E` acepta cualquier host | rojo | ROJO, `4 failed / 7 passed` (R12) |
| M7: `EmpresasModule`, `empresas.length === 0` cambiado por `< 0` | rojo | ROJO (`empresas-module`, el estado vacío) |

## Checklist

### Encargo del leader
1. **R1–R3, la guarda del OTP: OK.** El test cubre `production` con `1` y con `true`, que apagan, y
   `preview` y sin definir, que encienden. El código no sale por ningún canal de consola. Las
   mutaciones M1, M5 y M5b dan rojo. Ningún mecanismo del E2E se activa en producción:
   - el doble de Storage y el lanzador viven solo en `e2e/` y solo los arranca Playwright;
   - `AUTH_OTP_DEBUG_LOG=1` solo está en `playwright.config.ts` (`webServer.env`), y la guardia lo vigila;
   - el emisor de consola no imprime el código con `VERCEL_ENV=production`;
   - nada de eso entra en el bundle.
2. **Nada saltado ni debilitado: OK, con un hueco menor (m1).**
   - `e2e-sin-saltos` cae con un skip condicional y con un `describe.fixme`.
   - El config lleva `retries: CI ? 1 : 0`, `failOnFlakyTests: CI` y `forbidOnly: CI`.
   - `marca`: `esperarPantallaLista` solo cambia la espera (`load`, `fonts.ready` y un elemento
     visible). `verificarPantalla` afirma lo mismo que antes; la mutación del logo la hizo el
     implementer (5 rojos por «logos visibles»).
   - `reglas-bloqueos-cierre`: `toPass` envuelve `check` + `toBeChecked`, así que el caso sigue
     exigiendo la casilla marcada. Las aserciones de los pasos 3 y 5 no cambian.
3. **Las tres `.check()` sin esperar la hidratación: BLOQUEANTE (B1).**
4. **Las dos decisiones por validar: técnicamente correctas.** Queda el OK humano (m3).
5. **A2: OK.** Hay dos arreglos de 7 y 13 líneas, sin migración. Cada uno tiene su test de componente,
   y las dos mutaciones dan rojo.
6. **El doble de Storage: OK.** No entra en el bundle, `lib/storage/` no cambia y el test de contrato
   usa el cliente real. La mutación M4 da rojo.
7. **La tanda 7 de SL-31: OK.** Queda anotada como absorbida en `specs/SL-31-tests-datos-propios-ci/tasks.md`,
   con P3 / R23 anulados y el motivo. `design.md` de SL-31 dice que `home.spec.ts` lo retiró SL-44.

### CHECKPOINTS.md
- [x] `requirements.md` con EARS de R1 a R29.
- [x] `design.md` con alternativas descartadas (7).
- [ ] **Todas las tasks `[x]`: no.** T7.2 sigue `[ ]` en `tasks.md:160`, aunque la guardia existe y
  está verde (B2).
- [x] `## Lo que ya existe`, con contenido. El diff reutiliza `_dos-empresas-fixture`,
  `_superadmin-fixture` y `fijarEmpresa`, y no re-crea nada de la lista. `tests/fabricas/e2e.ts` es
  el nombre que fijó SL-31 y no existía.
- [ ] Assignee en Jira y rama con `wt.sh new`: no verificable desde el worktree. Lo comprueba el leader.
- [x] Cada R<n> tiene su test o su corrida (ver Trazabilidad).
- [~] Mapa R→test en `progress/impl_SL-44.md`: está repartido por tandas; el completo está en
  `tasks.md > Trazabilidad prevista` (m4).
- [x] typecheck y lint.
- [x] `gate-completo` en verde (run 40144681190).
- [x] Flujos críticos con E2E y su salida local en la bitácora: 100 passed dos veces sobre base nueva.
- [x] Sin dependencias nuevas: `package.json` no cambia.
- [x] Sin secretos hardcodeados. `clave-falsa-e2e` es la clave del doble, solo en el config de Playwright.
- [x] Sin webhooks nuevos.
- [x] Configuración: puertos y log por variables con valor por defecto.
- [x] `./init.sh` verde: lo dice la bitácora (`INIT_EXIT=0`). Yo corrí las piezas por separado
  (typecheck, lint, guardias y tests relacionados).
- [ ] `progress/features/SL-44.md > Cierre`: no existe en el worktree. Es del leader, en el cierre.
- [ ] Desmontar el worktree: es posterior al merge.

### docs/checkpoints-proyecto.md
- [x] typecheck, lint y gate (ver arriba).
- [x] Flujos críticos: la guardia R19 resuelve cada nombre a un archivo, y todos corren en CI.
- [x] Sin tablas, queries ni migraciones nuevas. El único cambio de producción es un predicado de
  config y dos `mutate` de SWR en el cliente.
- [x] Ningún recurso de Ordenex: `marca.spec.ts` pierde incluso sus hashes de bases prohibidas, y lo
  sustituye un guardián más estricto (solo `localhost` o `127.0.0.1`, que cae con M6).
- [x] Ningún `console.log` de secretos o PII en producción. El log del servidor que sube el artefacto
  lleva OTP y correos de datos efímeros (`@example.test`), y design D6 lo asume.
- [x] Capas: sin lógica nueva en producción.
- [x] Permisos: no cambian.

### perfil-agentes > reviewer
- [x] Sin tablas nuevas, sin RLS que añadir y sin migraciones.
- [x] Sin literales de país o moneda en código de producción nuevo. En `e2e/`, `SINPE` es el valor del
  método de pago y la fecha local va a UTC-6 fijo (m2).
- [x] Sin dependencias nuevas.
- [x] Los comentarios explican el porqué. Uno del config quedó desfasado (m5).

## Trazabilidad

| R | Evidencia | Estado |
|---|---|---|
| R1, R2 | `email-config.test.ts` y `email-notificacion.test.ts` (4+4 casos), M1 | OK |
| R3 | `otp-debug-solo-en-pruebas.guardia.test.ts`, M5 y M5b | OK |
| R4, R5 | `storage-falso.test.ts` (cliente real), M4. La evidencia la usan `mis-asignaciones` y `cierres-admin` en CI | OK |
| R6 | diff vacío en `lib/storage`, `lib/actions` y `app/api` | OK |
| R7, R8 | escenarios por servicio; las excepciones están en la tabla de D4 | OK |
| R9, R13 | `e2e-sin-saltos`, M2a y M2b (con el hueco de m1) | OK |
| R10–R12 | `e2e-host.test.ts`, M6 | OK |
| R14–R17 | `superadmin-*` y `dos-empresas-humo` en CI (aislamiento, 57 passed) | OK |
| R18 | los 20 heredados, verdes en CI y en local ×2 | OK, salvo la inestabilidad de B1 |
| R19 | `e2e-sin-saltos` (flujos críticos) | OK |
| R20–R23, R25, R28 | `gate.yml` leído; runs 40112266371 (rojo de R22), 40132245831 (artefacto) y 40144681190 | OK |
| R24 | `failOnFlakyTests` + `retries: 1`. Lo demostró el run 40142523437: el flaky dejó el grupo en rojo | OK |
| R26 | sigue la dependencia; ningún E2E afirma ya el vacío, y lo cubre `empresas-module` (M7) | OK |
| R27 | bitácora: 100 passed ×2 sobre base nueva | OK, salvo B1 |
| R29 | `docs/verification.md > El E2E`; D16 y D17 resueltas (también D19) | OK |

## Hallazgos

### B1 — BLOQUEANTE: tres specs con la misma carrera de hidratación que ya falló en CI

Tres specs marcan la casilla con `.check()` justo después de `page.goto`, sin esperar la
hidratación. Son estos:
- `e2e/asignacion-satelite.spec.ts:51`;
- `e2e/devolucion-origen.spec.ts:52`;
- `e2e/reprogramacion-liberacion.spec.ts:60` (dentro del bucle) y `:89`.

Es exactamente la carrera del run 40142523437 en `reglas-bloqueos-cierre`, paso 5: «Clicking the
checkbox did not change its state».
- La casilla es el `Checkbox` de `components/ui/checkbox.tsx`, de `@base-ui/react`: un `role=checkbox`
  que sin React hidratado no cambia.
- `asignacion-satelite` y `reprogramacion-liberacion` usan **la misma página y el mismo componente**
  del fallo: `/recepcion-satelite/en-bodega`, `SateliteOrdenesListado.tsx:538`.
- `devolucion-origen` usa el mismo primitivo en `/ordenes`, por `CeldaSeleccion`.
- Antes del `.check()` solo hay `toBeVisible()` de texto del HTML del servidor, y eso no implica
  hidratación.
- La bitácora lo reconoce: «Mismo patrón sin arreglar (no evidenciado)».

Con `failOnFlakyTests`, la carrera pone `e2e` en rojo de forma intermitente en PRs ajenos. Eso no
es «verde de verdad» (decisión del 2026-10-23, R24 y R27).

**Qué falta:**
- aplicar a esas cuatro llamadas la espera de `reglas-bloqueos-cierre:56-59` (`check` + `toBeChecked`
  dentro de `toPass`), mejor como un helper compartido en `e2e/_escenarios/` que reglas también use;
- correr `--project=reparto` dos veces sobre base nueva;
- volver a correr el CI.

### B2 — BLOQUEANTE (trivial): T7.2 sin marcar

`specs/SL-44-e2e-verde-ci/tasks.md:160` sigue `- [ ]`. La guardia existe, tiene sus fixtures y está
verde contra el árbol, así que su «Hecho» se cumple; falta marcarla. `CHECKPOINTS.md` exige todas
las tasks `[x]`.

### m1 — menor: `e2e-sin-saltos` no ve un skip con alias ni partido en dos líneas

`const t = test; t.skip(true)` y `test\n  .skip(...)` pasan en verde (M2c y M2d). R13 nombra la
llamada directa y la condicional, y las dos las detecta. Los huecos son formas deliberadas o de
formato. Se cierran con una pasada sobre el texto sin saltos de línea, o prohibiendo
`\.\s*(skip|fixme|only)\s*\(` en `e2e/`. Tampoco detecta `testIgnore` ni `grepInvert` en el
config. Puede ir en una ficha posterior.

### m2 — menor: la fecha local, a UTC-6 fijo en el escenario

`e2e/_escenarios/reparto.ts:219-226` calcula `hoyCR` y `mananaCR` con `-6 h` fijo y el nombre del
país. Coincide con la app, que fija UTC-6 en `lib/config/reprogramadas-retenidas.ts` y en
`aviso-reparto-manana.ts`. Pero es un literal de país en código nuevo, aunque sea de pruebas. Si
`lib/config` expone la constante, mejor leerla de allí.

### m3 — menor: las dos decisiones esperan el OK humano

Las dos son técnicamente correctas:
- `superadmin-empresas` sin base vacía. `soloExistenAyB` mantiene que una repetición no crea nada,
  acotado a los slugs de la corrida. El estado vacío lo cubre `empresas-module` (M7, rojo). R26 queda
  sin caso que ordenar, y está anotado en D3.
- `analitica-roles` rehecho. Lo comprobé: `AnaliticaShell.tsx:71-96` tiene comentadas «Filtros»,
  «Tablero operativo» y «Tablero financiero» ya en `dev`. El spec nuevo afirma el recorte que sí se
  pinta (`ALCANCE_PRODUCTOS`) y tiene su mutación. Es un desvío de D5 que la bitácora pide validar.

Las dos esperan el OK de Carlos o del leader antes del merge.

### m4 — menor: el mapa R→test de la bitácora está repartido

`progress/impl_SL-44.md` lo da por tandas. El completo está en `tasks.md > Trazabilidad prevista`.

### m5 — menor: comentario desfasado en el config

`playwright.config.ts:59` dice del proyecto `plataforma-vacia` «Afirman la plataforma sin empresas:
tienen que terminar antes que cualquier alta (R26)». Desde T7, ninguno lo afirma: el motivo vigente
es que el superadmin es único por base (D3).

## Veredicto

**RECHAZADO**, por B1 (la carrera de hidratación en `asignacion-satelite`, `devolucion-origen` y
`reprogramacion-liberacion`) y B2 (T7.2 sin marcar). Todo lo demás del encargo pasa, con
verificación ejecutada:
- la guarda del OTP;
- la guardia sin saltos;
- `retries` y `failOnFlakyTests`;
- `marca` y `reglas-bloqueos-cierre`;
- el arreglo A2;
- el doble de Storage;
- la absorción de SL-31.
