# Review SLT-56 «Ajustar en el cierre lo que ganó el mensajero»

Reviewer, 2026-10-29. Rama `feature/SLT-56-ajuste-pago-mensajero-cierre`, HEAD `ea9c980f`, diff
`origin/dev...HEAD` (75 archivos). El MCP `codebase-memory-mcp` no respondió (CONNECT_TIMEOUT): revisé con
Grep/Read y ejecutando.

## Veredicto: APROBADO (OK)

Sin bloqueantes. Hay 3 hallazgos menores, abajo.

## Verificación ejecutada por el reviewer (no copiada de la bitácora)

| Qué | Resultado |
|---|---|
| Integración SLT-56 contra `servi_slt56` (DATABASE_URL presente, base `servi_slt56`, local: verificado solo con booleanos) — `ajuste-pago-mensajero-cierre.int`, `ajuste-pago-mensajero-lectura.int`, `gestion-pago-mensajero-ajuste-migration`, `historial-accion-pago-mensajero-ajustado-migration` | `Test Files 4 passed`, `Tests 34 passed (34)`, **0 saltados**, EXIT=0. Los `describe.skip` sin base existen (patrón del repo), pero en esta corrida no se saltó ninguno |
| Mutación 1: quitar `pagoMensajero: Decimal(pagoAnterior)` del sello (`CierresAdminRepository.ts`, `ajustarPagoMensajeroEnCierre`) | **Muerta**: 2 rojos (los dos de R9). Revertida (`git checkout`, árbol limpio) |
| Mutación 2: quitar `anuladaAt: null` del `findMany` del total (paso 3, `CierresAdminRepository.ts:1918`) | **Sobrevive** (17/17 verde). Ver hallazgo m1. Revertida |
| `pnpm run typecheck` | TC_EXIT=0 (sin rojo por enum ajeno) |
| `pnpm run lint` | 0 errores (230 warnings preexistentes) |
| Tests de unidad/componentes/guardias del diff (30 archivos) | `30 passed`, `696 passed` |
| `pnpm run test:guardias` | 4 rojos, todos en `dependencias-declaradas-presentes.guardia.test.ts` (marcador de `init.sh`): **está en `tests/baseline-rojos.json`** y el diff no toca `init.sh` ni dependencias. No es hallazgo |

No corrí la suite completa ni el E2E (los corre CI). La salida local del E2E está en
`progress/impl_SLT-56.md` (2 passed ×2, `dos-empresas-humo` 18 passed).

## Checklist

### Especificación
- [x] `requirements.md` con R1–R21 en EARS; Q1/Q2 en Decisiones cerradas.
- [x] `design.md` con 4 alternativas descartadas.
- [x] `tasks.md`: todas `[x]` (0 `[ ]`).
- [x] `design.md` abre con `## Lo que ya existe`; el diff reutiliza (`resolveAlcance`, `alcanceWhere`,
      `ESTADOS_ABIERTOS`, `sumarSnapshotsCongelados`, `appendAccion`/`resolverActorCongelado`,
      `GESTION_ADMIN_SELECT`, `montoCobroSchema`, `motivoSchema`) y no re-crea nada de la lista.

### Trazabilidad (cada R con test real, ejecutado)
- [x] R1 SVC + E2E central · R2 INT «R2 — la satelite…» + SVC + E2E satélite · R3 INT (3 casos) + SVC
- [x] R4 SVC (mensajero/adminTienda → forbidden sin repo) + ACT (unauthenticated antes de parsear)
- [x] R5 INT aprobado/rechazado (nada escrito) + SVC carrera
- [x] R6 INT rechazo 0→1000 y entrega en `vencido` + SVC 5 resultados
- [x] R7 schema + SVC + ACT + CHECK de BD (`motivo ~ '[^[:space:]]'`) + DLG
- [x] R8 schema + util `sin_cambio` + CHECK `pago_nuevo >= 0` y `<> pago_anterior`
- [x] R9 INT (2 casos; la mutación 1 los pone rojos) + SVC + DLG
- [x] R10/R12 INT: total = suma de pagos vigentes; recaudo, ingreso bodega, otras gestiones, líneas y tarifa intactos
- [x] R11 CMP sin recargar + E2E (pago 1.500→2.200 y neto −700 por `expect.poll`) — ver m3
- [x] R13 E2E (devengo 2.200, pago del efectivo 2.000, debe 200) · R14 E2E (9.000/1.800/7.200)
- [x] R15 INT re-solicitud conserva el pago ajustado y su total
- [x] R16 guardia money-safe con contraprueba + util «un céntimo» + DLG string
- [x] R17 INT rastro con rol congelado + 2 casos de atomicidad (savepoint real) + migración (42501 sin UPDATE/DELETE, RLS)
- [x] R18 INT historial `cierre_dia_pago_mensajero_ajustado` (monto = nuevo, por guía, sin motivo) + migración up/down
- [x] R19/R20 LEC contra Postgres (orden cronológico insertado al revés; `_count` cuenta gestiones, no filas) + CMP + E2E
- [x] R21 CMP + DLG; `CierresBodegaAdminModule` no pasa `onAjustarPago` (solo lectura)
- [x] Mapa R→test en `progress/impl_SLT-56.md`

### Reglas de negocio (foco del leader)
- [x] Cierre aprobado/rechazado no se ajusta: el sello exige `estado IN (solicitado, vencido)` y el paso 3 lo repite; INT R5.
- [x] Quién: `resolveAlcance` (maestro/admin → central; adminSatelite → su satélite; sin zona → no_encontrada; otro rol → forbidden). La página pasa `puedeAjustarPagoMensajero = esAccesoTotal || adminSatelite`, pero la guardia real es servidor (alcance en el WHERE del sello).
- [x] Motivo obligatorio en tres capas (zod, servicio, CHECK).
- [x] Historial append-only con anterior/nuevo/motivo/actor/rol congelado; `REVOKE UPDATE, DELETE` a `servi_app`.
- [x] Q1: la 398 (`corregirResultadoGestionEnCierre`, `CierresAdminRepository.ts:1703-1717`) sigue poniendo el pago por la regla del rechazo sin condición sobre el pago; no borra filas de ajuste (FK RESTRICT), así la marca sigue; el total se recalcula sumando snapshots (no re-deriva), así no pisa el ajuste de otra gestión. Correcto por construcción — sin test propio (m2).
- [x] Q2: la vista del mensajero no trae `ajustesPago` y ve el pago de la columna (LEC «Q2», con valor 1200.50).
- [x] Totales cuadran: el total se recalcula como suma de snapshots tras el sello (no delta).

### Migraciones
- [x] `20261029120000` y `20261029120100` posteriores a la última de `origin/dev` (`20261028130400_plan_cambio_enums`).
- [x] Ambas con `down.sql` (el del enum recrea el tipo; la integración las prueba de ida y vuelta).
- [x] `organizacion_id` NOT NULL con default de sesión, FK, índice, RLS + política `…_por_empresa` FOR ALL TO servi_app, triggers misma-empresa generados y `sin_cambio_de_empresa`; CHECKs. Patrón de las vecinas.
- [x] Test con dos empresas: «RLS — otra empresa no ve el ajuste de A…» (`gestion-pago-mensajero-ajuste-migration.test.ts:160`, como `servi_app`).
- [x] Ninguna migración existente editada (0 líneas borradas bajo `db/migrations`).

### Composition root
- [x] `ajustarPagoMensajeroGestion` (action) usa `buildService()` (`lib/actions/cierres-admin.ts:103`), que construye `CierresAdminService` con `CierresAdminRepository(prisma, …)`; el método nuevo vive en esa clase, no hay dependencia nueva que inyectar. `AjustarPagoMensajeroDialog.tsx:10` importa la action y la llama con `pagoAnterior: gestion.pagoMensajero` (`:98`); `CierresAdminModule` monta el diálogo y `page.tsx` PASA la prop.

### Tests existentes modificados
- [x] Solo conteos que crecen por el contrato (74 tipos, 44 «mueve dinero», 79 tablas, 154 triggers sme, 80 políticas, 79 sin-cambio), dobles con el método/campo nuevo y la entrada del censo de escrituras con `cubiertaPor` real. Ninguna aserción relajada.

### Calidad, datos y seguridad
- [x] typecheck, lint, guardias (salvo baseline) en verde.
- [x] Sin literal de país/moneda/Ordenex/`console.log` en código nuevo (la marca usa los helpers `fecha-cr` existentes: deuda heredada anotada).
- [x] Sin dependencias nuevas (`package.json`/lock sin cambios).
- [x] Capas: lógica en service, SQL en repository, mutación por Server Action, zod en el borde.
- [x] E2E del flujo crítico (cierres + dinero) con su salida local en la bitácora.

### Ayuda (`docs/ayuda/oficina/cierres.md`)
- [x] Dice lo que el código hace: estados Solicitado/Vencido, cualquier resultado, quién (incl. satélite sin la central), valor ≥ 0 hasta 2 decimales, igual al vigente no se guarda, conflicto → recargar, marca «Ajustado» con historial inmutable, «Con ajustes» en bodega (solo lectura: verificado que no se pasa `onAjustarPago`), mensajero solo ve el valor, aprobado/rechazado no se ajusta. Voseo, como el resto de la ayuda.

## Hallazgos

- **m1 · menor** — `lib/repositories/CierresAdminRepository.ts:1918`: el `anuladaAt: null` del `findMany` que suma el total no lo protege ningún test (mutación 2 sobrevive). Hoy es un mutante equivalente: anular una gestión de un cierre la desvincula y anula su pago (`CierreDiaRepository.ts:1655-1663`), y anular fuera de cierre exige `cierreId: null` (`:1603`), así que una anulada nunca cuelga de un cierre con pago. Corrección: en el caso «R6/R10» de `tests/integration/db/ajuste-pago-mensajero-cierre.int.test.ts`, sembrar una gestión anulada con `pagoMensajero > 0` colgando del cierre y comprobar que el total no la suma; o dejarlo como defensa en profundidad, anotado.
- **m2 · menor** — Q1 sin test propio: nada fija que «corregir a rechazo una gestión ya ajustada → pago 0.00, la marca sigue, se puede reajustar con `pagoAnterior = 0.00`». Hoy sale bien por construcción (398 sin cambios). Corrección: un caso de integración en `ajuste-pago-mensajero-cierre.int.test.ts` (ajuste sobre la entrega → `corregirResultadoGestionEnCierre` → pago 0.00, filas de ajuste intactas, total = suma, reajuste ok).
- **m3 · menor** — `specs/SLT-56-ajuste-pago-mensajero-cierre/requirements.md:65` (R11) habla de «para la central» en el detalle del cierre; en el detalle del cierre del día la cifra equivalente se llama «Neto de la empresa» y se recalcula al releer el detalle (sin recargar la página), como dice `progress/impl_SLT-56.md` (notas). El E2E lo mide. Corrección: alinear la redacción de R11 (o anotar el desvío en el design) para que el spec no prometa una etiqueta que esa pantalla no tiene.

Nota de proceso: el leader pidió este archivo en `progress/reviews/SLT-56.md`; `CHECKPOINTS.md > Verificacion final` nombra `progress/review_<key>.md`. Si el validador mira esa ruta, conviene alinear.
