# SL-44 — E2E en verde en CI · tasks

> **Aprobado por Carlos (2026-10-24).** Decisiones sobre las preguntas abiertas:
> - **A1:** datos únicos por corrida, más dos corridas seguidas en verde. No hace falta borrar al
>   terminar.
> - **A2:** si un E2E destapa un defecto de producción y el arreglo es pequeño (≤ ~30 líneas y sin
>   migración), se arregla dentro de SL-44 con su test. Si es mayor, se para y se avisa a Carlos con
>   el defecto descrito, para abrir una ficha.
> - `e2e/cobro-plataforma-sl40.spec.ts` (SL-40, llegó con el merge de `dev`) entra en el alcance y
>   pierde su skip `SL40_UI`.

Convenciones:
- `[P]` = puede ir en paralelo con las otras `[P]` de su tanda.
- Cada tanda cierra con `./init.sh` en verde (`INIT_EXIT` escrito en el log) y su bitácora en
  `progress/impl_SL-44.md`.
- Un E2E se da por hecho solo con su salida real de Playwright (`--reporter=list`): 0 failed,
  0 skipped, 0 flaky. Además hace falta una mutación que lo tumbe (`docs/verification.md`).
- **Un dev server a la vez**, con `.next` limpio (memoria «Dos dev servers se pisan»).

## Tanda 1 — Seguridad y diagnóstico

- [x] **T1.1 — El error real de cada spec.** Sin dependencias.
  - `gh run view 40020120423 --log-failed`: el primer error de cada spec, en una tabla en la
    bitácora.
  - Cruzarla con `design.md > D5`; si una causa no coincide, corregir D5 en la misma tanda.

  **Hecho:** tabla con los 24 specs del run, y D5 coherente con ella.
- [x] **T1.2 — Guarda del OTP en producción** (D1; R1, R2, R3). `[P]`
  - `lib/config/email.ts > otpDebugLogHabilitado`.
  - Casos en `tests/unit/config/email-config.test.ts` y `tests/unit/services/email-notificacion.test.ts`.
  - Guardia `tests/unit/guards/otp-debug-solo-en-pruebas.guardia.test.ts`, con un fixture verde y
    uno por cada motivo de rojo.

  **Hecho:**
  - los 4 casos de D1 en verde;
  - quitando el `if`, rojo el caso `production` y verde el resto. Restaurado desde copia, con `cmp`;
  - la guardia, roja con un `AUTH_OTP_DEBUG_LOG=1` en un archivo de `lib/` inyectado y verde al
    quitarlo.
- [x] **T1.3 — Medir el servidor del E2E** (D3). `[P]`
  - `next build` + `next start` contra una base local desechable migrada y con `db:seed`.
  - Un login real con `marca`: ¿entra la cookie `secure` en `http://localhost`?
  - Con un `.env` que tenga `SMTP_*` y el entorno con `SMTP_USER=""`: ¿qué emisor sale? Se mira la
    línea `[email] sin SMTP configurado` en el log.

  **Hecho:** las dos respuestas medidas y anotadas, y la decisión `start` o `dev` para CI, con su
  motivo.

## Tanda 2 — Infraestructura del E2E y CI (depende de T1.3)

- [x] **T2.1 — Doble de Storage** (D2; R4, R5). `[P]`
  - Fijar las rutas y las formas leyendo `@supabase/storage-js` instalado (citar archivo y línea en
    la bitácora).
  - `e2e/_storage-falso/servidor.mjs`.
  - `tests/unit/e2e/storage-falso.test.ts`, con el cliente real de supabase-js.
  - `e2e/fixtures/evidencia.jpg`, generada y pequeña.

  **Hecho:**
  - el test de contrato, en verde;
  - con el doble devolviendo otros bytes, rojo;
  - `git diff --stat -- lib/storage lib/actions app/api` vacío (R6).
- [x] **T2.2 — Lanzador y configuración de Playwright** (D3; R14, R24, R26). `[P]`
  - `e2e/_servidor-app.mjs`.
  - `playwright.config.ts`: dos `webServer`, los proyectos, `retries`/`failOnFlakyTests` y el
    reporter.
  - `LogDelServidor.desdeEntorno()` pasa a `E2E_LOG_SERVIDOR`.

  **Hecho:**
  - `superadmin-arranque` y `superadmin-empresas` (proyecto `plataforma-vacia`) pasan en local con
    `pnpm exec playwright test --project=plataforma-vacia`, sin levantar nada a mano. Dos corridas
    seguidas;
  - mutación: `AUTH_OTP_DEBUG_LOG` vacío en `webServer.env` da rojo «el log del servidor no recibió
    ningún código».
- [x] **T2.3 — Montaje en `gate.yml`** (D6; R20–R23, R25, R28). Depende de T2.2.
  - Matriz `e2e-grupo` con base propia, `CRON_SECRET` efímero, `next build`, artefacto si falla y
    `timeout-minutes: 30`.
  - El check `e2e`, que agrega.
  - El disparo en PR a `dev`, y el comentario de cabecera.

  **Hecho:**
  - `gh workflow run gate.yml --ref feature/SL-44-e2e-verde-ci`: el grupo `aislamiento` pasa al
    menos `plataforma-vacia`;
  - un grupo rojo deja `e2e` en rojo con el mensaje de R22. Se comprueba con el primer grupo que
    caiga, o forzando `exit 1` en un commit temporal que se revierte;
  - YAML validado (`actionlint`, si está; si no, el propio CI).

## Tanda 3 — Fábricas y escenarios (depende de T2.1)

- [x] **T3.1 — `tests/fabricas/e2e.ts`** (D4; R7, R10, R11, R12).
  - `abrirBaseE2E`, `crearEmpresaE2E`, `crearUsuarioE2E`, `confiarDispositivo` y `sesionDe`.
  - Test de unidad del guardián de host: `tests/unit/fabricas/e2e-host.test.ts`.

  **Hecho:**
  - con `DATABASE_URL` a un host remoto inventado, lanza antes de abrir conexión;
  - sin `DATABASE_URL`, lanza con mensaje;
  - un usuario creado entra por `/login` sin OTP en un caso mínimo dentro de `marca`.
- [x] **T3.2 — Escenarios** `e2e/_escenarios/{reparto,cierres,crons}.ts` (D4; R8). Depende de T3.1.
  - Cada estado se produce por su servicio o su cron.
  - Confirmar o quitar cada excepción de la tabla de D4, y anotar el resultado.

  **Hecho:** cada escenario lo usa al menos un spec que pasa en T4–T6. La tabla de excepciones de D4
  queda con lo medido.

## Tanda 4 — Plataforma y aislamiento (depende de T2.2 y T3.1)

- [x] **T4.1 — Humo de dos empresas por la pantalla** (D16; R16, R17).
  - Alta de A y B en `/plataforma/empresas` como superadmin; primer acceso por «¿Olvidaste tu
    contraseña?» con el OTP del log; datos marcados (`sembrarDatos`).
  - Fuera `correoDelMaestro`, `liberarCorreos` y `solicitarRecuperacion`.

  **Hecho:**
  - 6/6 dos veces seguidas;
  - mutación de la puerta (`!esPlataforma` → solo `!actor`, como en SL-32): rojo el punto 6;
  - mutación de aislamiento (marcador de B en una pantalla de A): rojo.
- [x] **T4.2 — `wallet-iva-aparte-sl39` sin skip** (R13). `[P]`

  **Hecho:** pasa en `aislamiento`, y su mutación de SL-39 sigue tumbándolo.
- [x] **T4.3 — `marca`, `auth`, `rastreo-publico`, `analitica-roles`** (D5; R7–R11, R18). `[P]`
  - `auth`: bloqueo por intentos fallidos desde la UI, y OTP real del log.

  **Hecho:** cada uno en verde. Mutaciones:
  - `auth`: que el login no compruebe la contraseña;
  - `analitica-roles`: la que nombra su cabecera;
  - `rastreo-publico`: textos distintos en los dos rechazos;
  - `marca`: un logo cambiado.
- [x] **T4.4 — `zona-especial-dos-empresas`** en el proyecto `aislamiento`. `[P]`

  **Hecho:** en verde en el grupo, junto al resto, sin tocar el spec.

## Tanda 5 — Reparto (depende de T3.2)

- [x] **T5.1 — `asignacion-satelite`, `recepcion-satelite`** (R18). `[P]`
- [x] **T5.2 — `mis-asignaciones`**, reescrito contra la UI actual: recoger por guía o escáner,
  gestión en panel y pago mixto (R18). `[P]`
- [x] **T5.3 — `devolucion-origen`, `historial-orden`** (R18). `[P]`
- [x] **T5.4 — `reintentos-escalado`, `reprogramacion-liberacion`**, con el cron real (R18, R23).
  `[P]`

  **Hecho (T5.x):** cada spec en verde con `--project=reparto` y una mutación que lo tumba. Por
  ejemplo: umbral de reintentos 3 → 4, el cron que no libera, o la recepción que no cambia el
  estado. `tests/baseline-rojos.json` sin cambios.

## Tanda 6 — Dinero (depende de T3.2)

- [ ] **T6.1 — `cierre-dia`, `cierres-admin`, `cierres-admin-rechazos-sla`** (R18). `[P]`
- [ ] **T6.2 — `cierre-bodega-satelite`, `cierre-vencido-modelo`, `reglas-bloqueos-cierre`** (R18).
  `[P]`
- [x] **T6.3 — `wallet`, `mi-wallet`, `wallet-mensajeros`** (R18). `[P]`

  **Hecho (T6.x):**
  - cada spec en verde con `--project=dinero`;
  - las cifras afirmadas escritas a mano a partir de lo que crea el escenario, nunca calculadas con
    funciones de producción;
  - una mutación por spec sobre el cálculo o la puerta que afirma.

## Tanda 7 — Retiro, guardias y cierre (depende de T4–T6)

- [x] **T7.1 — Retirar `e2e/home.spec.ts`** (D5). Grep de citas en `docs/`, `specs/` y `tests/`.

  **Hecho:** sin citas vivas; `test-citado-desaparecido` en verde.
- [ ] **T7.2 — Guardia `tests/unit/guards/e2e-sin-saltos.guardia.test.ts`** (D7; R9, R13, R19 y la
  cobertura de proyectos).

  **Hecho:**
  - un fixture verde y uno por motivo de rojo: un `fixme`, un `skip` condicional, un `only`, un
    `correct-password`, un spec fuera de proyecto y un flujo crítico sin archivo;
  - contra el árbol real, en verde.
- [x] **T7.3 — Docs y deudas** (R29).
  - `docs/verification.md`: el E2E en cada PR a `dev`, el OTP del log y el doble de Storage.
  - `docs/gate.md` no se toca: está en `arnes.manifest`. Si la plantilla debe decir que el E2E
    puede correr en el PR a integración, va por `/afinar-regla`, fuera de esta ficha.
  - `progress/deudas.md`: D16 y D17 resueltas.
  - La línea `Login y sesión` de `docs/checkpoints-proyecto.md`, sin cambios.

  **Hecho:** el reviewer lo comprueba leyendo; la guardia de R19 sigue en verde.
- [ ] **T7.4 — Verde de verdad** (R27, R28, R22).
  - En local: base nueva (`DROP` + `CREATE` + `migrate deploy` + `db:seed`) y `pnpm run test:e2e`
    **dos veces seguidas**, cada una con 0 failed, 0 skipped y 0 flaky.
  - En CI: el PR de SL-44 a `dev` con `gate-completo` y `e2e` en verde, y el tiempo de cada grupo
    anotado frente a la estimación de D8.

  **Hecho:** las dos corridas locales y el run de CI citados en la bitácora. Si un grupo pasa de
  25 min, se parte otra vez antes de cerrar.

## Trazabilidad prevista

| Req | Test o corrida |
|---|---|
| R1 | `tests/unit/config/email-config.test.ts` + `tests/unit/services/email-notificacion.test.ts` (casos `production`) |
| R2 | los mismos (casos `preview` y sin `VERCEL_ENV`) |
| R3 | `tests/unit/guards/otp-debug-solo-en-pruebas.guardia.test.ts` |
| R4 | `tests/unit/e2e/storage-falso.test.ts` + `mis-asignaciones`, `cierres-admin` (evidencia) |
| R5 | `tests/unit/e2e/storage-falso.test.ts` (bytes, tipo y objeto ausente) |
| R6 | T2.1: `git diff --stat -- lib/storage lib/actions app/api` vacío, que comprueba el reviewer |
| R7 | corridas T4–T6 sobre base nueva (T7.4) |
| R8 | tabla de excepciones de D4 tras T3.2, revisada contra los escenarios |
| R9 | `tests/unit/guards/e2e-sin-saltos.guardia.test.ts` |
| R10 | `tests/unit/guards/e2e-sin-saltos.guardia.test.ts` (sin `@example.com` literal) + `tests/unit/fabricas/e2e-host.test.ts` (forma del correo) |
| R11 | `tests/unit/fabricas/e2e-host.test.ts` (sin `DATABASE_URL`) |
| R12 | `tests/unit/fabricas/e2e-host.test.ts` (host remoto) |
| R13 | `tests/unit/guards/e2e-sin-saltos.guardia.test.ts` |
| R14 | `superadmin-arranque.spec.ts` (con la mutación de T2.2) |
| R15 | `superadmin-arranque.spec.ts`, `superadmin-empresas.spec.ts`, `auth.spec.ts` (OTP) |
| R16 | `dos-empresas-humo.spec.ts` |
| R17 | `dos-empresas-humo.spec.ts` (primer test) |
| R18 | los 20 heredados de D5, en verde en T4–T6 |
| R19 | `tests/unit/guards/e2e-sin-saltos.guardia.test.ts` |
| R20 | run de CI del PR de SL-44 a `dev` (T7.4) |
| R21 | T2.3: paso «Base del grupo» con `set -euo pipefail`, y run de CI |
| R22 | T2.3: un grupo rojo deja `e2e` en rojo |
| R23 | T2.3: `gate.yml` sin `secrets.` en el job y `reprogramacion-liberacion` en verde |
| R24 | `playwright.config.ts` (`failOnFlakyTests`) + T2.2 |
| R25 | T2.3: artefacto `e2e-<grupo>` presente en una corrida roja |
| R26 | `playwright.config.ts` (`aislamiento` depende de `plataforma-vacia`). Desde T7 ningún E2E afirma el vacío (A1, `design.md > D3`): el estado vacío de «Empresas» lo cubre `tests/components/empresas-module.test.tsx` («sin empresas pinta el estado vacío y no la tabla») |
| R27 | T7.4: dos corridas locales seguidas |
| R28 | T7.4: duración de cada grupo en el run de CI |
| R29 | T7.3, revisión del reviewer |

## Archivos esperados

Producción y configuración:
- `lib/config/email.ts`
- `playwright.config.ts`
- `.github/workflows/gate.yml`

E2E:
- `e2e/_storage-falso/servidor.mjs`
- `e2e/_servidor-app.mjs`
- `e2e/_escenarios/reparto.ts`
- `e2e/_escenarios/cierres.ts`
- `e2e/_escenarios/crons.ts`
- `e2e/fixtures/evidencia.jpg`
- `e2e/_dos-empresas-fixture.ts`
- `e2e/_superadmin-fixture.ts`
- `e2e/_zona-especial-fixture.ts`
- `e2e/_wallet-iva-sl39-siembra.ts`
- `e2e/analitica-roles.spec.ts`
- `e2e/asignacion-satelite.spec.ts`
- `e2e/auth.spec.ts`
- `e2e/cierre-bodega-satelite.spec.ts`
- `e2e/cierre-dia.spec.ts`
- `e2e/cierre-vencido-modelo.spec.ts`
- `e2e/cierres-admin-rechazos-sla.spec.ts`
- `e2e/cierres-admin.spec.ts`
- `e2e/devolucion-origen.spec.ts`
- `e2e/dos-empresas-humo.spec.ts`
- `e2e/historial-orden.spec.ts`
- `e2e/home.spec.ts` (se borra)
- `e2e/marca.spec.ts`
- `e2e/mi-wallet.spec.ts`
- `e2e/mis-asignaciones.spec.ts`
- `e2e/rastreo-publico.spec.ts`
- `e2e/recepcion-satelite.spec.ts`
- `e2e/reglas-bloqueos-cierre.spec.ts`
- `e2e/reintentos-escalado.spec.ts`
- `e2e/reprogramacion-liberacion.spec.ts`
- `e2e/superadmin-arranque.spec.ts`
- `e2e/superadmin-empresas.spec.ts`
- `e2e/wallet-iva-aparte-sl39.spec.ts`
- `e2e/wallet-mensajeros.spec.ts`
- `e2e/wallet.spec.ts`
- `e2e/zona-especial-dos-empresas.spec.ts`

Tests:
- `tests/fabricas/e2e.ts`
- `tests/unit/fabricas/e2e-host.test.ts`
- `tests/unit/e2e/storage-falso.test.ts`
- `tests/unit/config/email-config.test.ts`
- `tests/unit/services/email-notificacion.test.ts`
- `tests/unit/guards/otp-debug-solo-en-pruebas.guardia.test.ts`
- `tests/unit/guards/e2e-sin-saltos.guardia.test.ts`

Docs y estado:
- `docs/verification.md`
- `progress/deudas.md`
- `progress/impl_SL-44.md`
- `specs/SL-31-tests-datos-propios-ci/tasks.md`
