# impl SLT-60 «Confirmación del pago a la plataforma por el superadmin»

Rama `feature/SLT-60-confirmar-pago-plataforma`. Base de la feature: `servi_logistic_slt60` (tests de
integración) y `servi_logistic_slt60_e2e` (E2E), en el Postgres local.

## T0 — Comprobaciones

- **T0.1** (FK de `confirmado_por` al superadmin): **lleva FK.** En una base desechable
  (`servi_logistic_slt60_t01`, migrada hasta `dev` y borrada al acabar), un `INSERT` en
  `ajuste_caja_anulacion` (trigger `sme_ajuste_caja_anulacion_anulado_por_805eb3cf`) con `anulado_por` = un
  usuario `superadmin` con `organizacion_id` nulo entra; el control negativo (un `maestro` de otra empresa)
  cae con `SL017`. La función `verificar_misma_empresa` (`20261022130300`) sale con `v_org_ref IS NULL`
  (D15). `generar-misma-empresa.ts --faltantes` genera su trigger como a cualquier FK a `usuario`: son 4
  (175 → 179).
- **T0.2** Última migración de `origin/dev` a 2026-11-13: `20261115120100_pago_satelite_checks`, anterior a
  `20261116120000`. No se renombra.
- **T0.3** (`scripts/demo-qa/receta.ts`): **la receta no cierra ninguna factura.** El pago (línea ~1143,
  `PAGO_A_LA_PLATAFORMA = "1000"`) entra hoy con la deuda de cargos de las órdenes de la demo; no hay ninguna
  llamada a `factura_plataforma_*` en `scripts/demo-qa/`. Con el tope de SLT-60 (R3) el pago caería con
  `validation_error` y `tests/integration/db/demo-qa.test.ts` (que exige `egreso_pago_plataforma` en la caja,
  R18) caería. **Para T9.3:** antes del pago, cerrar como dueño la factura en curso de la empresa demo
  (`factura_plataforma_cerrar(org, fin_natural_at + 6 min)`, el mismo artificio del fixture de T3.5), de modo
  que su total (≥ cargos de las órdenes ya creadas) cubra los 1000; y cambiar el constructor
  `new TopePagoPlataformaService(new CobroPlataformaMovimientoRepository(app), new PagoPlataformaRepository(app))`
  (línea ~1150) por el de un solo repositorio (T2.3). Hoy el tope ya exige cargos ≥ 1000, así que la factura
  cerrada con esas órdenes los cubre; T9.3 lo confirma con `demo-qa.test.ts` en verde.
- **T0.4** `node scripts/archivos-en-vuelo.mjs --candidata SLT-60`: sin choques con features de otra
  persona. Coincidencias con el mismo dueño (no bloquean, rebasa quien mergee segundo):
  - SLT-119 «Planes: pantallas de facturas para el superadmin y el maestro»: `lib/modulos/reparto.ts`,
    `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`, `docs/architecture.md`,
    `playwright.config.ts`, `tests/integration/plataforma-empresa-detalle-page.test.tsx`.
  - SLT-125 «Geografía jerárquica: presentación, exportes, cierres y geocodificación»: `db/schema.prisma`, `lib/db/modelos-de-negocio.ts`,
    `lib/db/excepciones-aislamiento.ts`, `scripts/verificar-rls-despliegue.ts`, `lib/modulos/reparto.ts`,
    `docs/architecture.md`, `playwright.config.ts` y varios tests de pago-plataforma-sl45.
  - SLT-128 «Planes: el cambio programado del plan llega a cada empresa al inicio de su período»: `db/schema.prisma`, `lib/db/modelos-de-negocio.ts`.
  - Varias de Carlos Restrepo (SLT-106, 108, 110, 112-114, 124) sin rama publicada: no comprobables.

## T1 — La base (backend_dev)

**Archivos:**
- `db/migrations/20261116120000_pago_plataforma_confirmacion/migration.sql` (nuevo): las dos tablas (CHECK
  `monto > 0`, únicos por empresa, índices, FK, RLS, políticas, `REVOKE`), los 6 triggers de SL-17 generados con
  `--faltantes` (4 `sme_*` + 2 sin cambio), `pago_plataforma_inmutable` en las dos, `factura_plataforma_saldos`,
  `pago_plataforma_por_confirmar`, `pago_plataforma_disponible_de`, `pago_plataforma_disponible` (único con
  `GRANT` a `servi_app`), `pago_plataforma_confirmar`, el tope reescrito y `pago_plataforma_no_anular_confirmado`.
  Ningún `INSERT` de datos (R28).
- `db/migrations/20261116120000_pago_plataforma_confirmacion/down.sql` (nuevo): el orden de §3.8; el tope con el
  cuerpo de `20261111130100` §9 (comprobado con `diff`: idéntico).
- `db/schema.prisma`: `PagoPlataformaConfirmacion` y `PagoPlataformaAplicacion`, y las inversas en `Usuario`,
  `WalletMovimiento`, `Organizacion` y `FacturaPlataforma`. `prisma migrate diff` contra la base migrada: «No
  difference detected».
- `lib/db/modelos-de-negocio.ts`: los dos en `MODELOS_DE_NEGOCIO` (la cabecera decía 80 y eran 90; ahora 92).
- `scripts/verificar-rls-despliegue.ts`: `TRIGGERS_MISMA_EMPRESA` 175 → 179, con su línea.
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`: 90 → 92.
- `tests/integration/db/migracion-slt60-ida-y-vuelta.test.ts` (nuevo, R28, R29).

**Decisiones menores (no estaban escritas en el design):**
- Formato del error: `SQLSTATE SL060`, `MESSAGE` = el JSON solo (sin prefijo), p. ej.
  `{"codigo": "supera_saldo", "factura_id": "…"}`. `pago_confirmado` lleva además `pago_id`. Lo lee T2.1.
- El trigger inmutable usa el código `inmutable` (con `tabla` e `id`); deja pasar el cambio de empresa al
  trigger de SL-17 (SL017), como `factura_plataforma_inmutable`.
- `pago_plataforma_confirmar` redondea cada monto a 2 decimales antes de validar (lo validado es lo guardado);
  un `p_aplicaciones` que no es arreglo cuenta como vacío (`suma_distinta`).
- `confirmado_por` es `ON DELETE RESTRICT ON UPDATE CASCADE`, como los demás actores; las FK a
  `wallet_movimiento`, `factura_plataforma` y la confirmación, `NO ACTION` (design §1).
- El texto del `RAISE` del tope se dejó literal («supera la deuda vigente…») aunque el número es lo disponible:
  `tests/integration/db/caja-tesoreria-migration.test.ts` lo lee y no está en la lista de archivos.
- `@@index([organizacionId])` en `PagoPlataformaConfirmacion` (y su `CREATE INDEX`): lo exige la guardia
  `organizacion-en-modelos` (R2 de SL-17).

**Verificación:**
- Smoke a mano en la base desechable (rollback al final): sin factura → 23514; factura cerrada de 380 000 →
  disponible 380 000; pago 200 000 → 180 000; 180 000,01 → 23514; confirmar con suma corta, factura ajena,
  repetida, sobre saldo, factura con total −30 000 → `SL060` con su código; confirmar → `ok` y saldo 180 000;
  otra vez → `ya_confirmado`; contra-asiento del confirmado → `SL060 pago_confirmado`; `UPDATE` del dueño →
  `SL060 inmutable`; anular uno por confirmar → disponible sube; confirmar el anulado → `pago_no_encontrado`.
  Como `servi_app`: `pago_plataforma_disponible` propia OK y ajena 42501; lee 1 confirmación; `INSERT` → 42501;
  `factura_plataforma_saldos` → 42501.
- `pnpm run db:rollback` y `prisma migrate deploy` otra vez, en la desechable y en `servi_logistic_slt60`: sin
  error (sme_* 179 → 175 → 179).
- `vitest run migracion-slt60-ida-y-vuelta + organizacion-en-modelos + rls-por-empresa`:
  `Test Files 3 passed (3) · Tests 38 passed (38)`. Mutación: el `down.sql` con `v_deuda < 0` en vez de `<= 0`
  → «R29 … × », 1 failed | 3 passed; restaurado.
- `pnpm run typecheck`: exit 0. `pnpm run lint`: `0 errors, 251 warnings` (ninguno en los archivos tocados;
  `eslint` sobre ellos: exit 0).
- `pnpm run test:guardias` (antes del índice): `Test Files 3 failed | 338 passed | 3 skipped (344) · Tests 14
  failed | 4820 passed | 25 skipped (4859)`:
  - `organizacion-en-modelos` (4): faltaba el `@@index` → arreglado, verde.
  - `api-key-dependencias-usuario` (6): la relación nueva `PagoPlataformaConfirmacion.confirmador` hacia
    `Usuario` tiene que entrar en el censo `tests/fixtures/api-key-dependencias-usuario.ts`. **Bloqueado:** esa
    ruta no está en `## Archivos esperados`.
  - `dependencias-declaradas-presentes` (4): `init.sh` sin el marcador «FIN PASO 2: DEPENDENCIAS (ficha 420)».
    Ajeno a SLT-60 (no toca `init.sh` ni `package.json`).
- Fuera de las guardias, `tests/unit/scripts/verificar-rls-despliegue.test.ts` cae (4): fija 175 triggers y 90
  tablas a mano. **Bloqueado:** tampoco está en la lista. T1.4 queda sin marcar hasta que entren esas dos rutas.

### Cierre de T1.4 (2026-11-13)

- `tests/fixtures/api-key-dependencias-usuario.ts`: `PagoPlataformaConfirmacion.confirmador` como `no_alcanzable`
  con `SOLO_OPERADOR`, igual que `AjusteCajaAnulacion.anulador`.
- `tests/unit/scripts/verificar-rls-despliegue.test.ts`: 175 → 179 `sme_*`, 90 → 92 tablas, 91 → 93 políticas y
  (además) 90 → 92 triggers sin cambio de empresa, con su línea de comentario. Cifras reales en
  `servi_logistic_slt60` (`pg_trigger`/`pg_policies`): `sme=179`, `politicas=93`, `sin_cambio=92`.
- `vitest run verificar-rls-despliegue.test.ts`: 4 passed. `pnpm run test:guardias`:
  `Test Files 1 failed | 343 passed (344) · Tests 4 failed | 4854 passed | 1 skipped`; los 4 son
  `dependencias-declaradas-presentes` (baseline, heredado).

### Rutas fuera de la lista

Autorizadas por el leader el 2026-11-13:
- `tests/fixtures/api-key-dependencias-usuario.ts`: la relación nueva `confirmador` hacia `Usuario` tiene que
  estar en el censo; si no, la guardia `api-key-dependencias-usuario` cae (6).
- `tests/unit/scripts/verificar-rls-despliegue.test.ts`: fija a mano las cifras del contrato de RLS que cambia la
  migración.

## T2 — Lectura del dinero en el servidor (backend_dev, parcial)

**Hechas:** T2.1, T2.4, T2.5. **T2.2 a medias y T2.3 bloqueada** (ver «Bloqueo»).

**Archivos:**
- `lib/db/errores-pago-plataforma.ts` (nuevo, T2.1): `SQLSTATE_PAGO_PLATAFORMA = "SL060"`,
  `traducirErrorDeConfirmacion(e) → { codigo, facturaId? } | null` (solo los seis códigos de
  `pago_plataforma_confirmar`) y `esPagoConfirmadoError(e)`. Busca el JSON en cada mensaje del grafo de causas
  (`lib/db/sqlstate.ts`): llega solo en el `cause` del driver o dentro del texto de P2010.
- `lib/services/EgresoCajaAnulacionService.ts` (T2.5): en el `catch`, `esPagoConfirmadoError` → `forbidden`.
- `tests/unit/services/wallet-anulacion-service.test.ts` (T2.5, R10): `describe` nuevo con las dos formas del
  error (modelo y P2010) → `forbidden` para maestro y admin; otro `SL060` (`inmutable`) y otro SQLSTATE con el
  mismo JSON se relanzan.
- `lib/interfaces/repositories/IPagoPlataformaRepository.ts` y `lib/repositories/PagoPlataformaRepository.ts`
  (T2.2, parcial): entran `sumaPagosConfirmados` (`pagoPlataformaAplicacion.aggregate` con el filtro por empresa
  escrito) y `disponibleParaRegistrar` (`SELECT pago_plataforma_disponible($org)::text`, normalizado a 2
  decimales con `Prisma.Decimal`). `PagoPlataformaCliente` suma `pagoPlataformaAplicacion | $queryRaw`.
  `sumaPagosVigentes` **sigue**, marcada «PENDIENTE de quitar», porque la usa el tope (T2.3).
- `lib/services/DeudaPlataformaService.ts` (T2.4, R7): lee `sumaPagosConfirmados`.
- `tests/unit/services/deuda-plataforma-service.test.ts` (T2.4, R7): el doble de `sumaPagosVigentes` devuelve
  9999 y se afirma que no se llama; los casos de deuda pasan a «confirmados».
- `tests/unit/guards/pago-plataforma-inmutable-sl45.guardia.test.ts`: el control de no vacuidad mira
  `sumaPagosConfirmados`.
- `tests/unit/services/tope-pago-plataforma-service.test.ts`: solo se añaden los dos métodos nuevos al doble
  para que compile; la reescritura es de T2.3.

**Decisiones no fijadas por el design:**
- Cada método del repositorio tipa su `cliente`/`tx` con lo que usa (`Pick<…, "walletMovimiento">`,
  `"pagoPlataformaAplicacion"`, `"$queryRaw"`), no con `PagoPlataformaCliente` entero: así el `tx` del tope
  (`TopePagoPlataformaTx`) sigue sirviendo para `claveYaRegistrada`. `PagoPlataformaCliente` es el tipo del
  constructor.
- `traducirErrorDeConfirmacion` devuelve `null` para `pago_confirmado` e `inmutable`: no son rechazos de
  confirmar. `esPagoConfirmadoError` exige SQLSTATE `SL060` además del código en el JSON.

**Bloqueo (T2.2 resto y T2.3):** `disponibleParaRegistrar(org, tx)` hace `tx.$queryRaw`, y el `tx` que recibe
`TopePagoPlataformaService.comprobar` es `TopePagoPlataformaTx = Pick<PrismaClient, "$executeRaw" |
"cobroPlataformaMovimiento" | "walletMovimiento" | "facturaPlataforma">`, sin `$queryRaw`. Ese tipo vive en
`lib/interfaces/services/ITopePagoPlataformaService.ts`, **que no está en `## Archivos esperados`**. El cambio
necesario es una línea: añadir `"$queryRaw"` al `Pick` (y, ya sin uso, quitar `cobroPlataformaMovimiento` y
`facturaPlataforma`). Quien llama (`WalletEgresoService`) pasa el `tx` real de Prisma, que lo tiene. Sin esa
ruta no se puede quitar `sumaPagosVigentes` ni pasar el tope a un solo repositorio sin un cast.

**Verificación:**
- `vitest run deuda-plataforma-service + tope-pago-plataforma-service + wallet-anulacion-service +
  pago-plataforma-inmutable-sl45.guardia + wallet-egresos.composition-root`: `Test Files 5 passed · Tests 68
  passed`.
- Mutaciones (medidas y revertidas): sin la línea `esPagoConfirmadoError → forbidden` → 2 failed en
  `wallet-anulacion-service`; `DeudaPlataformaService` con `sumaPagosVigentes` → 5 failed en
  `deuda-plataforma-service`.
- `pnpm run typecheck`: exit 0. `pnpm run lint`: `0 errors, 251 warnings` (los mismos de T1; `eslint` sobre los
  archivos tocados: sin avisos).
- `pnpm run test:guardias` (después de T2): `Test Files 1 failed | 343 passed (344) · Tests 4 failed | 4854
  passed | 1 skipped (4859)`; los 4 son `dependencias-declaradas-presentes` (baseline).

**Veredicto:** T1.4, T2.1, T2.4 y T2.5 en verde; T2.2 a medias y T2.3 bloqueadas hasta que se autorice
`lib/interfaces/services/ITopePagoPlataformaService.ts`.
