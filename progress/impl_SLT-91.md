# SLT-91 — mi-plan-solo-maestro · bitácora de implementación

Base de pruebas: desechable local `servi_gate_slt91` (`migrate deploy`, 313 migraciones, y `db:seed`; `current_database()`
comprobado). Borrada al terminar. Grafo: no consultado; el `design.md` ya traía las rutas y dice que no había proyecto indexado
para este worktree; se usó Grep y Read.

## Archivos

- **Producción (una línea y comentarios):** `lib/auth/menu-visibility.ts`, `lib/actions/_shared/mi-plan.ts`.
- **Tests cambiados:** `tests/unit/auth/menu-mi-plan.test.ts`, `tests/unit/auth/menu-visibility.test.ts`,
  `tests/unit/auth/menu-historial-acciones.test.ts`, `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts`,
  `tests/integration/mi-plan-page.test.tsx`, `tests/unit/services/mi-plan-service.test.ts`,
  `tests/unit/services/aprobacion-postulacion-tope-plan.test.ts`, `e2e/planes-superadmin.spec.ts`.
- **Tests nuevos:** `tests/integration/db/mi-plan-solo-maestro.test.ts`, `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts`.
- **Documentación:** `docs/architecture.md`, `specs/SLT-58-planes-superadmin-ui/requirements.md` y `design.md` (enmienda),
  `progress/deudas.md` (D61), `specs/SLT-91-mi-plan-solo-maestro/tasks.md`, `progress/features/SLT-91.md`.

Sin `db/migrations/` y sin dependencias.

## Mapa R → test

`guardia` = `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts`, `integracion` =
`tests/integration/db/mi-plan-solo-maestro.test.ts`, `menu` = `tests/unit/auth/menu-mi-plan.test.ts`, `servicio` =
`tests/unit/services/mi-plan-service.test.ts`, `pagina` = `tests/integration/mi-plan-page.test.tsx`, `e2e` =
`e2e/planes-superadmin.spec.ts`.

| R | Test concreto |
|---|---|
| R1 | `menu` «SLT-91 R1: de los siete roles solo lo ve el `maestro`; sin sesión, nadie» y «SLT-91 R1: con todos los módulos apagados o encendidos, el `admin` no lo ve» |
| R2 | `servicio` «R8 — %s recibe forbidden sin una sola llamada al repositorio» (con `admin`) y «sin sesión»; `integracion` «R2, R4: en la misma empresa con plan…»; `pagina` «%s → «no encontrado», sin leer la base» (con `admin`) |
| R3 | `pagina` el mismo caso con `admin`; `e2e` «el admin de A recibe 404 en «Mi plan»…» |
| R4 | `integracion` «R2, R4…»; `pagina` «maestro → ve la pantalla «Mi plan»»; `e2e` «el maestro de A ve en «Mi plan» el nombre, sus topes y su consumo» |
| R5 | `guardia` «R5: la lista es exactamente [maestro]…» y «R5: el servicio lee la misma constante y nadie más la define»; `menu` «SLT-91 R5: `roles` ES la constante…» |
| R6 | `menu` «R10: %s sigue aterrizando en…» (sin cambiar); `tests/unit/auth/menu-visibility.test.ts` (lista exacta del `admin`); `tests/unit/auth/menu-historial-acciones.test.ts` «el apartado «Histórico» sigue yendo AL FINAL»; `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` (`admin: 15`) |
| R7 | `tests/integration/db/planes-cambio-correos.test.ts` «R41: la edición inmediata avisa a los maestros activos…» (existente, con un `admin` activo; muere con la mutación B1) |
| R8 | `guardia` «R8: solo «Mi plan» y el detalle de empresa del superadmin importan `ConsumoDelPlan`» |
| R9 | `guardia` «R9: ningún evento de la campana habla del plan» |
| R10 | `guardia` «R10: fuera del menú, el reparto de módulos…», «R10: el reparto y la página no son enlaces…» y «R10: la ayuda no nombra «Mi plan»» |
| R11 | `tests/unit/services/aprobacion-postulacion-tope-plan.test.ts` «SLT-91 R11: a un `admin` le devuelve el mismo texto del tope…»; `guardia` «R11: ni la variante de rol ni la de API keys» |
| R12 | `tests/unit/services/deuda-plataforma-service.test.ts` y `tests/integration/db/mi-plan-repository.test.ts` (existentes, sin tocar); revisión del diff: sin `db/migrations/` |
| R13 | `tests/components/HistorialAccionesPage.test.tsx`, `tests/unit/auth/menu-historial-acciones.test.ts`, `tests/unit/services/planes-service-lecturas.test.ts` (existentes, sin tocar) |
| R14 | `e2e` «el admin de A recibe 404…» y «el maestro de A ve en «Mi plan»…» |

## Salida real

**T0.1:** `.env` presente, `DATABASE_URL` válida y de host local (booleanos). La integración corrió sin saltos.

**T1.2 a T1.4** (los seis archivos, el caso de R11 y la integración):

```
Test Files  8 passed (8)
     Tests  143 passed (143)
```

**T2.1** `pnpm run test:guardias`, con exit 1 solo por un archivo de `tests/baseline-rojos.json`:

```
FAIL tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts (4 casos)
Test Files  1 failed | 333 passed (334)
     Tests  4 failed | 4683 passed | 1 skipped (4688)
```

`dependencias-declaradas-presentes.guardia.test.ts` está en `tests/baseline-rojos.json` desde el 2026-10-21. El `skipped` no es
de esta feature: la guardia nueva corrió con 0 saltos (mutaciones, abajo).

**T2.2** (R7, R12, R13: sin tocarlos, 0 saltos):

```
HistorialAccionesPage.test.tsx 11 · mi-plan-repository.test.ts 5 · planes-cambio-correos.test.ts 9
menu-historial-acciones.test.ts 23 · deuda-plataforma-service.test.ts 13 · planes-service-lecturas.test.ts 46
Test Files  6 passed (6)
     Tests  107 passed (107)
```

**T3.1** `pnpm exec playwright test e2e/planes-superadmin.spec.ts`, con `next build` previo sobre base recién creada y las
variables que pone CI (`NEXT_PUBLIC_APP_URL`, `APP_BASE_URL`, `SESSION_SECRET`):

```
[planes] /mi-plan del admin: estado HTTP 404
[planes] /mi-plan del mensajero: estado HTTP 404
18 passed (29.9s)
```

Una primera corrida cayó en `superadmin-empresas` (`plataforma-vacia`, del que depende este spec) por lanzarla sin
`NEXT_PUBLIC_APP_URL` en el build: era el entorno, no el código. El `.env` local no la trae.

## Mutaciones

Arnés fuera del repo. Antes de cada ronda corre sin mutar y exige más de 0 tests, 0 fallos y 0 saltos. Cada mutación exige rojo
en cada archivo nombrado, 0 saltos y árbol limpio al revertir. Ninguna convivió con el gate.

**Tanda A** (base: 39 tests, 0 fallos, 0 saltos):

| Mutación | Resultado | Rojos |
|---|---|---|
| Control: la constante a `["mensajero"]` | Muere, 16 fallos | `menu-mi-plan`, `mi-plan-service`, `mi-plan-page`, `mi-plan-solo-maestro` |
| A1: la constante vuelve a `["maestro", "admin"]` | Muere, 7 fallos | `menu-mi-plan`, `mi-plan-service`, `mi-plan-page`, `mi-plan-solo-maestro` |
| A2: `MiPlanService` deja de comprobar el rol | Muere, 15 fallos | `mi-plan-solo-maestro`, `mi-plan-service`, `mi-plan-page` |

**Tanda B** (base: 18 tests, 0 fallos, 0 saltos):

| Mutación | Resultado | Rojos |
|---|---|---|
| Control: la constante a `["mensajero"]` | Muere, 1 fallo | guardia (R5) |
| B1: quitar `rol: { value: "maestro" }` de `PlanesRepository.ts:1327` | Muere, 8 fallos | `planes-cambio-correos` |
| B2: `href="/mi-plan"` en `AdminMaestroDashboard.tsx` | Muere, 2 fallos | guardia (R10) |
| B3: importar `ConsumoDelPlan` en `components/shared/AppPage.tsx` | Muere, 1 fallo | guardia (R8) |
| B4: «Mi plan» en el texto de `mensajeDelTope` | Muere, 1 fallo | guardia (R11) |
| B5: la guardia con la lista de rutas vacía | Muere, 4 fallos | guardia (autocomprobación) |

## Gate

<!-- GATE -->

## Veredicto

<!-- VEREDICTO -->
