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
- `lib/interfaces/services/ITopePagoPlataformaService.ts` (2026-11-13, T2.3): el `tx` del tope
  (`TopePagoPlataformaTx`) necesita `$queryRaw` para leer lo disponible (`pago_plataforma_disponible`); quedan
  `"$executeRaw" | "$queryRaw" | "walletMovimiento"` y salen `cobroPlataformaMovimiento` y `facturaPlataforma`, ya
  sin uso. Sin este cambio el tope no pasa a un solo repositorio sin un cast.

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

## T5b (textos) — frontend_dev

**Archivos modificados:**
- `app/(app)/wallet/_components/wallet-labels.ts` (`deudaPlataformaPista`, R35)
- `app/(app)/wallet/_components/wallet-conceptos-manuales.ts` (`FRASE_DEL_EFECTO.pago_plataforma`, R37)
- `docs/ayuda/oficina/wallet-caja.md` (R38; `actualizado: 2026-11-13`): pista R35 en la fila «Debe»;
  «Lo ya pagado se descuenta cuando la plataforma lo confirma»; «La deuda no baja al registrar»; párrafos
  nuevos «El pago queda por confirmar» y «Solo se pagan facturas cerradas» (ejemplo 380 000 / 200 000 /
  180 000 y mensaje de R36); anulación solo mientras está por confirmar (sin subir la deuda); fila del
  catálogo y bullet de anulaciones al día.
- Tests con el literal escrito a mano: `tests/unit/components/wallet-labels.test.ts`,
  `tests/components/WalletDeudaPlataformaSL45.test.tsx` (pista y frase del efecto),
  `tests/components/WalletDeudaPlataformaSL40.test.tsx`, `tests/unit/components/wallet-conceptos-manuales.test.ts`,
  `tests/unit/asistente/contexto-sl45.test.ts` (3 casos nuevos de R38), `e2e/cobro-plataforma-sl40.spec.ts`
  (solo el literal; no se corrió).

**Mapa R → test:**
- R35 → `wallet-labels.test.ts`, `WalletDeudaPlataformaSL45/SL40.test.tsx`, `contexto-sl45.test.ts` («R1–R3 y SLT-60 R35…»), `e2e/cobro-plataforma-sl40.spec.ts`
- R37 → `wallet-conceptos-manuales.test.ts`, `WalletDeudaPlataformaSL45.test.tsx`
- R38 → `contexto-sl45.test.ts` («SLT-60 R38, el pago queda por confirmar…», «…solo se pagan facturas cerradas…», «…solo se anula mientras está por confirmar»)

**Salida:**
- `vitest run` de los 5 tests: `Test Files 1 failed | 4 passed (5) · Tests 1 failed | 97 passed (98)`.
  El rojo: `wallet-conceptos-manuales.test.ts > son de UNA línea: sin saltos y sin dos oraciones separadas
  por punto y espacio` (invariante de 459 R60 / 461 R41). El literal de R37 tiene dos oraciones
  («…confirma el pago. Baja la ganancia.»). **Bloqueo de spec:** decidir entre cambiar R37 a una oración
  (p. ej. «…confirma el pago; baja la ganancia.») o exceptuar `pago_plataforma` del invariante. No se tocó.
- `grep` de la ayuda por «baja esta deuda.», «La deuda baja** en el monto», «Baja la deuda con»,
  «deuda vuelve a subir», «lo ya pagado. »: sin coincidencias (exit 1).
- `pnpm run typecheck`: 2 errores en `tests/unit/services/deuda-plataforma-service.test.ts`
  (`sumaPagosVigentes`), del trabajo en curso del backend_dev; ninguno en archivos de T5b.
- `pnpm run lint`: `✖ 251 problems (0 errors, 251 warnings)`, exit 0.

**Veredicto:** T5b.1 y T5b.4 en verde; T5b.3 queda en rojo por el choque del literal de R37 con el
invariante «una oración» (a decidir en el spec).

## R37 contra la regla de una oración (resuelta)

La frase de R37 tiene dos oraciones («…confirma el pago. Baja la ganancia.») y la regla de las fichas 459 R60 /
461 R41 en `tests/unit/components/wallet-conceptos-manuales.test.ts` («son de UNA línea: … sin dos oraciones
separadas por punto y espacio») la rechaza. El código lleva la frase literal del spec; ese caso queda en rojo y
T5b.3 sin marcar hasta que decida el humano: (a) una sola oración («…confirma el pago; baja la ganancia.») o
(b) una excepción para `pago_plataforma` en la regla.

### Cierre de T2.2 y T2.3 (2026-11-13)

**Archivos:**
- `lib/interfaces/services/ITopePagoPlataformaService.ts` (fuera de la lista, autorizado): `TopePagoPlataformaTx` =
  `Pick<PrismaClient, "$executeRaw" | "$queryRaw" | "walletMovimiento">`; los comentarios hablan de lo disponible.
- `lib/services/TopePagoPlataformaService.ts`: constructor `(pagos: IPagoPlataformaRepository)`. `comprobar`: candado →
  clave → `disponibleParaRegistrar(org, tx)` → `supera` si `disponible <= 0` o `monto > disponible`, si no `cabe`
  (`Prisma.Decimal`).
- `lib/interfaces/repositories/IPagoPlataformaRepository.ts` y `lib/repositories/PagoPlataformaRepository.ts`: fuera
  `sumaPagosVigentes`.
- `lib/actions/wallet-egresos.ts`: `new TopePagoPlataformaService(new PagoPlataformaRepository(prisma))`; fuera el
  import de `CobroPlataformaMovimientoRepository`.
- `scripts/demo-qa/receta.ts`: solo la construcción del tope (y el import que sobraba). El cierre de la factura antes
  del pago sigue pendiente para T9.3.
- `tests/unit/actions/wallet-egresos.composition-root.test.ts`: el cliente falso responde `$queryRaw` (lo disponible);
  orden `candado → clave → disponible`; el SQL llama a `pago_plataforma_disponible(` con `org-a`; borde 500,00 cabe y
  500,01 no (R2), 0,00 disponible rechaza (R3). `MENSAJE_R9` sigue con el literal de hoy: lo cambia T5b.2 (R36).
- `tests/unit/services/tope-pago-plataforma-service.test.ts`: reescrito. R2: 180 000,00 cabe y 180 000,01 no, 0,01 cabe,
  importes grandes; R3: disponible 0,00 y −30 000,00 rechazan, y con disponible negativo ni un monto negativo cabe;
  R5: candado antes de la clave y de lo disponible, todo con el `tx`; reenvío sin leer lo disponible; el tope no lee
  la deuda.
- `tests/unit/services/deuda-plataforma-service.test.ts`: fuera el doble de `sumaPagosVigentes`; la trampa de R7 pasa
  a `disponibleParaRegistrar` (devuelve 9999 y se afirma que no se llama).
- Integración, solo para compilar (su puesta al día es T6): `factura-plataforma-deuda.test.ts` (tope de un
  repositorio y `sumaPagosConfirmados` en `deudaDeLaWallet`), `pago-plataforma-sl45-concurrencia.test.ts` (tope de
  un repositorio) y `pago-plataforma-sl45-blindaje.test.ts` (el caso m3 llama a `sumaPagosConfirmados`; su texto y
  sus cifras siguen siendo los de SL-45: T6.3 los rehace).

**Mutaciones (medidas y revertidas):** sin `if (disponible.lte(0))` → 1 failed (R3, monto negativo con disponible
negativo); `lte(disponible)` → `lt` → 3 failed (borde exacto de R2 en el servicio y en el composition root).

## T3 — La confirmación en el servidor (backend_dev; T3.1–T3.4)

**Archivos:**
- `lib/types/pago-plataforma.ts` (nuevo): los DTO de §4.4, `IMPORTE_REPARTO`, `TEXTOS_CONFIRMACION`,
  `verPagosDeEmpresaSchema`, `confirmarPagoSchema`, los dos `Result` y `claveDeFactura(id)` → `aplicaciones.<id>`.
  Sin `@prisma/client`.
- `lib/utils/reparto-pago-plataforma.ts` (nuevo): `proponerReparto` y `resumenDelReparto`, en céntimos `bigint`.
- `tests/unit/utils/reparto-pago-plataforma.test.ts` (nuevo, R14, R17): el ejemplo de 300 000 (200 000 + 100 000),
  parcial, agotar, pasar de los saldos, orden, grandes; resumen válido, falta, de más, sobre saldo, borde exacto,
  formatos, vacío = 0, todo en 0.
- `lib/interfaces/repositories/IPagoPlataformaConfirmacionRepository.ts` (nuevo): `leer(org)` y `confirmar(input)` →
  `ok | ya_confirmado | rechazado(error)`.
- `lib/repositories/PagoPlataformaConfirmacionRepository.ts` (nuevo): en `comoPlataforma("SL-45", …)`. `leer`: una sola
  sentencia con dos `jsonb_agg` (pagos de `pago_plataforma_por_confirmar` con el nombre completo de quien registró y
  `tiene_comprobante` por `EXISTS` en `wallet_comprobante`; facturas de `factura_plataforma_saldos` con `saldo > 0`),
  validada con zod. `confirmar`: `SELECT pago_plataforma_confirmar(…)`; un `SL060` se traduce con
  `traducirErrorDeConfirmacion` y cualquier otro error se propaga.
- `lib/db/excepciones-aislamiento.ts`: la entrada en `EXCEPCIONES_DE_PLATAFORMA` (ficha `SL-45`).
- `lib/interfaces/services/IPagoPlataformaConfirmacionService.ts` y `lib/services/PagoPlataformaConfirmacionService.ts`
  (nuevos): superadmin → zod → (confirmar) quitar ceros → repositorio → traducir. Reloj por constructor.
- `tests/unit/services/pago-plataforma-confirmacion-service.test.ts` (nuevo, R17, R19, R20, R24).
- `lib/actions/pagos-plataforma.ts` (nuevo): `verPagosDeEmpresaAction` y `confirmarPagoPlataformaAction` con `deps`;
  composition root `construirPagoPlataformaConfirmacionService(prisma = getPrismaClient())`.
- `lib/modulos/reparto.ts`: `"pagos-plataforma": "nucleo"`.
- `tests/unit/actions/pagos-plataforma.test.ts` (nuevo): sin `deps.service`, el cliente falso ve el SQL de las
  funciones y el mapeo del DTO sale del repositorio real; `ok`, `ya_confirmado`, P2010 → `not_found`, driver
  `supera_saldo` → bajo su factura, otro error se relanza; maestro y sin sesión → `forbidden` sin tocar el cliente.

**Decisiones no fijadas por el design:**
- **«Referencia» = `wallet_movimiento.descripcion`**, la que SL-45 rotula «Referencia del pago» y la que devuelve
  `pago_plataforma_por_confirmar`. No es `wallet_anotacion.referencia` (458-B).
- **«Registrado por» = nombre completo** (`nombreCompletoUsuarioSql`), con el `JOIN` a `usuario` acotado por
  `organizacion_id` escrito (como dueño no hay RLS; también satisface `sql-a-mano-por-empresa`). `null` sin usuario.
- **Una sola sentencia en `leer`** (como `FacturaPlataformaRepository.deLaEmpresa`): una foto de pagos y saldos.
- **El importe del reparto es `^\d{1,12}(\.\d{1,2})?$`**, no `^\d+…` como §4.4: con más de 12 cifras enteras la base
  respondería un desbordamiento de `numeric(14,2)` sin traducir. El servicio lo rechaza antes, bajo su factura.
- **Las claves de error:** `aplicaciones.<facturaId>` para una factura y `aplicaciones` para el reparto entero, en los
  errores de la base, en los de zod (el índice del arreglo se traduce a su `facturaId`) y en `resumenDelReparto`; así
  la pantalla los pinta bajo la fila venga de donde venga.
- **`TEXTOS_CONFIRMACION`** (impersonales, §6.1): `formato`, `monto_no_positivo`, `factura_no_valida`, `supera_saldo`,
  `factura_repetida` y `suma_distinta`. Todo en 0 o un reparto vacío responde con el de `suma_distinta` en
  `aplicaciones` (un reparto vacío nunca suma el monto de un pago > 0).
- **Los montos van normalizados** a dos decimales (`aTexto(aCentimos(m))`) antes de llamar a la base.
- **`@sin-superficie` temporal** en las dos actions: hasta que `page.tsx` las ligue (T5.2), la guardia
  `superficie-de-uso` las ve inalcanzables. La anotación dice que se borra en T5.2, y la guardia exige borrarla en
  cuanto tengan superficie («ninguna anotación sobrevive a su motivo»).
- **T3.6 (comprobante) queda fuera**, con su hueco natural: un método más en la interfaz del repositorio
  (`pagoDeLaEmpresa`) y del servicio (`verComprobante`), tres dependencias más en el constructor del servicio y una
  action más. No hubo que reescribir nada para dejarlo.

**Verificación:**
- Humo contra `servi_logistic_slt60` con el repositorio real (script de un solo uso, borrado): `leer` de una empresa sin
  datos → `{"pagos":[],"facturas":[]}`; `confirmar` de un pago inexistente →
  `{"estado":"rechazado","error":{"codigo":"pago_no_encontrado"}}` (el SQL corre y el `SL060` se traduce). El recorrido
  completo con datos es T3.5.
- `vitest run` de `tope-pago-plataforma-service + wallet-egresos.composition-root + deuda-plataforma-service +
  pago-plataforma-inmutable-sl45.guardia + wallet-egreso-service`: `Test Files 5 passed · Tests 80 passed`.
- `vitest run reparto-pago-plataforma`: `Tests 19 passed`. `vitest run pago-plataforma-confirmacion-service +
  pagos-plataforma`: `Test Files 2 passed · Tests 45 passed`.
- Mutaciones (medidas y revertidas) en `PagoPlataformaConfirmacionService`: autorizar a cualquier actor con sesión →
  8 failed; sin quitar los ceros → 2 failed; sin `pago_no_encontrado → not_found` → 2 failed.
- `pnpm run typecheck`: exit 0. `pnpm run lint`: `0 errors, 251 warnings` (los mismos); `eslint` sobre los archivos
  tocados: «No issues found».
- `pnpm run test:guardias`: `Test Files 1 failed | 343 passed (344) · Tests 4 failed | 4854 passed | 1 skipped`; los 4
  son `dependencias-declaradas-presentes` (baseline). `plataforma-solo-en-lista`, `sql-a-mano-por-empresa`,
  `modulos-reparto` y `superficie-de-uso` en verde.
- `vitest related --run` sobre los archivos de `lib/` de esta tanda: `Test Files 13 failed | 65 passed (78) · Tests 21
  failed | 1109 passed | 64 skipped`. Ningún rojo es de T2.3 ni de T3:
  - **Esperados, de T4.1 y T6** (pagan sin factura cerrada y el tope de R3 los rechaza, design §8.1):
    `pago-plataforma-sl45` (12), `pago-plataforma-sl45-concurrencia` (3), `empresas-plataforma-deuda-sl45` (3),
    `factura-plataforma-deuda` (1), `pago-plataforma-sl45-blindaje` y `descarga-pago-plataforma-sl45` (en la siembra).
  - **De la base de la feature, sin semilla** (faltan la zona central, el tipo `cedula`, una orden y los vehículos):
    `libro-caja-filtro-a-quien`, `wallet-comprobante-alcance`, `wallet-documento-comprobante-458`,
    `wallet-registro-comprobante-458` y `demo-qa` (este además espera T9.3).
  - **Bloqueado, fuera de la lista:** `tests/unit/actions/deuda-plataforma.composition-root.test.ts` (1): su cliente
    falso no trae `pagoPlataformaAplicacion`, y `DeudaPlataformaService` lee `sumaPagosConfirmados` desde T2.4. El
    arreglo es darle `pagoPlataformaAplicacion: { aggregate }` y afirmar esa llamada en vez del `findMany` de pagos;
    la ruta no está en `## Archivos esperados`.

**Veredicto:** T2.2, T2.3 y T3.1–T3.4 en verde; queda bloqueado
`tests/unit/actions/deuda-plataforma.composition-root.test.ts` (rojo desde T2.4, fuera de la lista).

### Rutas fuera de la lista (2026-11-13, T3 cierre)

- `tests/unit/actions/deuda-plataforma.composition-root.test.ts` (autorizada por el leader): su cliente falso gana
  `pagoPlataformaAplicacion.aggregate` (1 000) y se afirma esa llamada con el filtro por empresa; el
  `walletMovimiento.findMany` queda como trampa (9 999) que no debe llamarse (R7). `Tests 5 passed (5)`.

## T3 (cierre) — T3.5 y T3.6 (backend_dev)

**Archivos:**
- `tests/integration/db/_fixtures/factura-cerrada.ts` (nuevo, T3.5): `facturaEnCurso(base, org)` (la abre con un cierre
  a la hora de la base si no hay) y `cerrarFacturaEnCurso(base, org)` → `{ id, numero, total, desdeAt, hastaAt }`, con el
  artificio de SLT-119 §9 (`factura_plataforma_cerrar(org, fin_natural_at + 6 min)`), bajo el lock de la 227 y
  commiteado. Lanza si no cierra exactamente una.
- `tests/integration/db/pago-plataforma-confirmacion.test.ts` (nuevo, T3.5): la tabla de pasos de design §8 en orden,
  con filas commiteadas y todo por las actions sin servicio inyectado (wallet para registrar y anular; las de
  `pagos-plataforma` para leer y confirmar, con un superadmin commiteado bajo `tomarLockDeSuperadmin`). A con 380 000,
  B con su cerrada de 50 000 y un pago, C con 200 000 y −30 000 (la segunda con solo un reverso). La concurrencia
  (R5, R19, R21) se fuerza: otra conexión sostiene el MISMO candado (`hashtext('pago_plataforma:' || org)`) 1,5 s
  mientras arrancan las dos operaciones; se afirma que ninguna termina con el candado tomado. Limpieza: aplicaciones,
  confirmaciones y comprobantes antes que el libro (`limpiar459`) y el superadmin al final.
- `lib/types/pago-plataforma.ts` (T3.6): `verComprobantePagoSchema`, `VerComprobantePagoInput`, `VerComprobantePagoResult`.
- `lib/interfaces/repositories/IPagoPlataformaConfirmacionRepository.ts` y
  `lib/repositories/PagoPlataformaConfirmacionRepository.ts` (T3.6): `pagoDeLaEmpresa(organizacionId, pagoId)` →
  `walletMovimiento.findFirst({ id, organizacionId, tipo: egreso, categoria: egreso_pago_plataforma })`, fuera de
  `comoPlataforma`. El cliente del repositorio suma `"walletMovimiento"`.
- `lib/interfaces/services/IPagoPlataformaConfirmacionService.ts` y `lib/services/PagoPlataformaConfirmacionService.ts`
  (T3.6): `verComprobante(actor, input)`: superadmin → zod → `conEmpresa(org)` { `pagoDeLaEmpresa` → `not_found`;
  `lateralDe({ caja })` → `sin_comprobante`; `createSignedUrl(ruta, ttl)` } → `{ ok, url, contentType }`. Constructor:
  `(repo, comprobantes: Pick<IWalletComprobanteRepository, "lateralDe">, urls: Pick<ISignedUrlProvider,
  "createSignedUrl">, ttlSegundos, ahora)`.
- `lib/actions/pagos-plataforma.ts` (T3.6): el composition root pasa `WalletComprobanteRepository(prisma)`,
  `SupabaseSignedUrlProvider(undefined, walletComprobanteConfig.BUCKET)` y `SIGNED_URL_TTL_SECONDS`;
  `verComprobantePagoPlataformaAction(organizacionId, pagoId, deps)`, con `@sin-superficie` hasta T5.2.
- `tests/unit/services/pago-plataforma-confirmacion-service.test.ts` (T3.6): `montar` con los tres dobles nuevos;
  `describe` del comprobante (R33, R34): forbidden por rol y sin sesión sin leer, `validation_error` sin leer,
  `not_found` sin buscar el archivo ni firmar, `sin_comprobante` sin firmar, `ok` con el TTL y las tres lecturas dentro
  de `conEmpresa(ORG)` (los dobles leen `contextoActual()`), sin la ruta en la respuesta.
- `tests/unit/actions/pagos-plataforma.test.ts` (T3.6): cliente falso con `walletMovimiento.findFirst` y
  `walletComprobante.findFirst`; `SupabaseSignedUrlProvider` y la config mockeados para ver bucket, TTL y empresa del
  contexto al firmar; ok, not_found, sin_comprobante, maestro y sin sesión.

**Decisiones no fijadas por el design:**
- **`verComprobantePagoPlataformaAction(organizacionId, pagoId, deps)`**, dos argumentos y no un objeto: §4.8 dice que
  la página la liga con `.bind(null, organizacionId)`, y `.bind` solo fija argumentos posicionales. El cliente
  (T5.1) llama `accion(pagoId)`. Lo tiene que saber frontend_dev.
- **`pagoDeLaEmpresa(organizacionId, pagoId)`**, con la empresa como argumento y escrita en el `where` (§4.8 la
  pinta con solo `pagoId`): toda query de negocio filtra por empresa aunque la RLS ya acote. El test de integración
  prueba que la RLS sola basta: en `conEmpresa(B)` pedir el pago de C con la empresa de C da `null`.
- **«`tieneComprobante` en el repositorio»** (tasks T3.6) ya estaba desde T3.2 (`EXISTS` en `wallet_comprobante` dentro
  de `leer`); no hubo nada más que añadir.
- **El caso de §8 «`pagoDeLaEmpresa` dentro de `conEmpresa(B)` no ve el pago de A»** se hace con el pago de C (el que
  tiene comprobante); es el mismo aislamiento.
- **El mensaje del tope no se compara en el test nuevo**: se afirma `validation_error` con la clave `monto`. El
  literal lo cambia T5b.2 (R36) y lo fijan sus propios tests.
- **Los cargos de 380 000, 50 000, 170 000 y 30 000** se escriben como dueño sobre una orden real (molde
  `factura-plataforma-deuda.test.ts`: se borra el cargo del trigger y se inserta el del monto pedido).

**Mapa R → test (`pago-plataforma-confirmacion.test.ts` salvo que se diga):**
- R1, R6 → «R1, R6: A paga 200 000 → por confirmar…»
- R2 → «R2: A intenta 180 000,01…» y el borde 180 000,00 en «R4…»
- R3 → «R3: A con órdenes por 380 000 y sin cerrar…» y «R18, R7…» (saldo 0 → 0,01 rechazado)
- R4 → «R4: como servi_app a mano…»
- R5 → «R5: dos pagos de 100 000 a la vez…»
- R7 → «R16, R22…», «R18, R7…»; `deuda-plataforma.composition-root.test.ts`; `empresas-plataforma-deuda-sl45.test.ts`
- R9 → «R9: A anula el pago de 100 000…»
- R10 → «R10: A anula el pago confirmado…»
- R11 → «R11: el contra-asiento del pago confirmado escrito a mano…»
- R12, R14 → «R12, R14, R32: el superadmin lee…»
- R15, R17 → «R15, R17: un reparto inválido…», «R31…» (la de −30 000)
- R16, R22 → «R16, R22: el superadmin confirma los 200 000…»
- R18 → «R18, R7: un pago que deja el saldo en 0…»
- R19 → «R19: confirmar otra vez…» y «R19: dos confirmaciones del mismo pago a la vez…»
- R20 → «R20: confirmar el anulado, uno inexistente o el de otra empresa…»
- R21 → «R21: A anula y el superadmin confirma el mismo pago a la vez…»
- R25 → «R25: B lee solo sus confirmaciones…» (otra `organizacion_id` no ve nada; INSERT/UPDATE/DELETE → 42501;
  `pago_plataforma_disponible` ajena → 42501; `sumaPagosConfirmados` de A en el contexto de B → 0,00)
- R26 → «R26: una confirmación o una aplicación no cambian, tampoco como dueño»
- R31 → «R31: C con cerradas de 200 000 y −30 000…»
- R32 (lectura) → «R12, R14, R32…» (`false`) y «R32, R34…» (`true`)
- R33 → `pago-plataforma-confirmacion-service.test.ts` («R33: firma con el TTL…»), `pagos-plataforma.test.ts` («R33: sin
  deps.service…»), «R32, R34…» de integración
- R34 → los mismos tres (forbidden, not_found, sin_comprobante) y, en integración, `pagoDeLaEmpresa` en
  `conEmpresa(B)` → `null`

**Mutaciones (medidas y revertidas, base `servi_logistic_slt60`; `CREATE OR REPLACE` / `DROP TRIGGER` con el cuerpo
literal de la migración y restaurado con el mismo):**
1. `pago_plataforma_disponible_de` sin restar los por confirmar → `10 failed` (R1/R6, R2, R4, R5, R12, R16, R9, R20, R15,
   R18).
2. `sumaPagosConfirmados` que suma los pagos vigentes del libro → `Tests 5 failed | 17 passed (22)` (R1/R6, R5, R16,
   R10, R9).
3. `pago_plataforma_confirmar` sin `pg_advisory_xact_lock` → `Tests 2 failed | 20 passed (22)` (R21, R19 concurrente).
4. Sin el trigger `pago_plataforma_no_anular_confirmado` → `Tests 4 failed | 18 passed (22)` (R10, R11, R9, R21).
5. (T3.6) `verComprobante` sin `conEmpresa` → `Tests 18 failed | 43 passed (61)`; sin la comprobación de superadmin →
   `Tests 9 failed | 52 passed (61)`.

Tras restaurar, todo verde otra vez.

## T4 — El listado de Empresas (backend_dev; T4.1)

**Archivos:**
- `lib/repositories/EmpresasPlataformaRepository.ts`: lo pagado sale de
  `pagoPlataformaAplicacion.groupBy({ by: ["organizacionId"], where: { organizacionId: { in: ids } }, _sum: { monto } })`;
  fuera los dos `walletMovimiento.findMany` (pagos y contra-asientos). Contador: una consulta para todas,
  `SELECT i.id, (SELECT count(*) FROM pago_plataforma_por_confirmar(i.id))::int FROM unnest(ids)`.
  `EmpresasPlataformaPrismaClient`: entra `pagoPlataformaAplicacion`, sale `walletMovimiento`.
- `lib/types/empresas-plataforma.ts`: `pagosPorConfirmar: number`; los comentarios de `deudaPlataforma` y
  `pagadoPlataforma` hablan de los confirmados.
- `tests/unit/actions/empresas-plataforma.composition-root.test.ts`: el doble suma `pagoPlataformaAplicacion.groupBy`
  (200) y un `$queryRaw` que responde al contador (3); el libro queda como trampa (9 999) que no se llama; se afirma
  el `groupBy` con las empresas del listado y una sola consulta del contador con `[ids]` (R7, R8, R27).
- `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts`: superadmin commiteado; cierra la factura de A (1 000)
  y de B (300) antes de pagar; pagar deja la deuda y «Pagado» igual con 1 por confirmar (el anulado no cuenta);
  confirmar baja la deuda y sube «Pagado» con el contador a 0; el reverso de B sigue en a favor; dos pagos más de A
  → contador 2 sin tocar la fila de B; el repositorio con el cliente dueño reparte igual (R7, R8, R27).

**Bloqueo (typecheck):** `pagosPorConfirmar` es obligatorio en `EmpresaListada` (design §4.7) y 12 errores TS2741
salen en fixtures de tests que construyen esa fila a mano. `EmpresasModule.tsx` compila.
- `tests/components/empresas-module.test.tsx` (2): está en la lista, pero es de frontend_dev (T4.2).
- **Fuera de la lista** (10): `tests/components/EmpresasModuleCobro.test.tsx` (3),
  `tests/components/EmpresasModuleCobroPorcentual.test.tsx`, `tests/components/EmpresasModulePeriodo.test.tsx`,
  `tests/components/EmpresasModulePlan.test.tsx`, `tests/integration/empresas-page.test.tsx` (2) y
  `tests/unit/services/empresas-plataforma-service.test.ts` (2). Cada uno necesita `pagosPorConfirmar: 0` en su fila.
  En tiempo de ejecución pasan: `empresas-plataforma-service.test.ts` está verde en el `vitest run` de abajo.

**Verificación (T3 cierre y T4):**
- `vitest run` de los 7 archivos tocados, con base: `Test Files 7 passed (7) · Tests 115 passed (115)`.
- `vitest run pago-plataforma-confirmacion + empresas-plataforma-deuda-sl45`, dos veces seguidas sobre la misma base:
  `Test Files 2 passed (2) · Tests 29 passed (29)` las dos.
- `vitest run` de los 5 unitarios (después de los ajustes de lint): `Test Files 5 passed (5) · Tests 86 passed (86)`.
- `pnpm run typecheck`: los 12 TS2741 de arriba; ningún otro error.
- `pnpm run lint`: `0 errors`; `eslint` sobre los archivos tocados: sin avisos (los 6 `no-unused-vars` de los
  dobles se quitaron).
- `pnpm run test:guardias` (sin `DATABASE_URL`): `Test Files 1 failed | 340 passed | 3 skipped (344) · Tests 4 failed |
  4830 passed | 25 skipped`; los 4 son `dependencias-declaradas-presentes` (baseline). `storage-solo-por-adaptador`,
  `superficie-de-uso`, `plataforma-solo-en-lista` y `sql-a-mano-por-empresa` en verde.

**Veredicto:** T3.5, T3.6 y T4.1 en verde con base; el typecheck queda rojo por 12 fixtures de `EmpresaListada` sin
`pagosPorConfirmar` (2 de T4.2 y 10 fuera de la lista).

## T4.2 y T5 (frontend_dev)

**Archivos:**
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx` (T4.2): `TEXTOS_PLATAFORMA.pagosPorConfirmar(n)` y la
  tercera línea de `CeldaPlataforma`, solo con `pagosPorConfirmar > 0`, con `data-pagos-por-confirmar` (R27).
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PagosPorConfirmar.tsx` (nuevo, T5.1, design §6.1): props
  `datos | null`, `organizacionId`, `confirmar` y `verComprobante(pagoId)`. Tabla (fecha, monto, referencia,
  «Registrado por», comprobante, «Confirmar…»); vacío con `EmptyState`; `null` con `Alert`. «Ver comprobante» abre la
  pestaña antes del `await` (molde `VerComprobanteMiMovimiento`); cualquier no-`ok` o throw → «No se pudo abrir el
  comprobante» en la fila. Diálogo `Modal` «Confirmar pago de {monto}» con el enlace junto al monto, fila por factura
  (N.º, período con `hasta − 1 ms` en `ZONA_CR`, total, saldo, `Input` «Aplicar» con `proponerReparto`), pie «Repartido…
  / Falta…», errores de `resumenDelReparto` (o del servidor) bajo cada fila, «Confirmar pago» deshabilitado si
  `!valido`; sin facturas, el texto de §6.1 y sin botón. Resultados como §6.1.
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx` (T5.2): `leerPagos(actor, org)` aislada en el `Promise.all`
  (llama a `verPagosDeEmpresaAction({ organizacionId }, { getActor: async () => actor })`); la sección tras «Volver a
  Empresas» y antes de `PlanEmpresa`; `verComprobantePagoPlataformaAction.bind(null, empresa.organizacionId)`.
- `lib/actions/pagos-plataforma.ts`: fuera las tres anotaciones `@sin-superficie` (las tres quedan ligadas). Nada más.
- Tests: `tests/components/empresas-module.test.tsx` (fixtures + `describe` de R27 con 0, 1 y 3),
  `tests/components/PagosPorConfirmar.test.tsx` (nuevo), `tests/integration/plataforma-empresa-detalle-page.test.tsx`
  (mock de `@/lib/actions/pagos-plataforma` + `describe` SLT-60).

**Decisiones no fijadas por el design:**
- `ya_confirmado` y `not_found` cierran el diálogo y dejan el aviso en la sección (`role="status"`); `forbidden`/throw
  dejan el diálogo abierto con «No se pudo confirmar ahora» (`role="alert"`). Los errores del servidor se olvidan al
  editar un monto.
- Se mandan todas las facturas con monto escrito (incluido `"0.00"`; el servicio quita los 0); las vacías no.
- Rótulos derivados del design sin literal propio: cabeceras «Fecha», «Monto», «Referencia», «Comprobante», «Factura»,
  «Período», «Total», «Saldo»; el `aria-label` del input «Aplicar · N.º {n}»; celdas sin dato con «—». Los botones de
  cada fila llevan `aria-describedby` al monto, sin texto nuevo.

### Rutas fuera de la lista (2026-11-13, T4.2 y T5)

Autorizadas por el leader, solo `pagosPorConfirmar: 0` en la fila: `tests/components/EmpresasModuleCobro.test.tsx` (3
filas literales; las que hacen spread lo heredan), `tests/components/EmpresasModuleCobroPorcentual.test.tsx`,
`tests/components/EmpresasModulePeriodo.test.tsx`, `tests/components/EmpresasModulePlan.test.tsx`,
`tests/integration/empresas-page.test.tsx` (2) y `tests/unit/services/empresas-plataforma-service.test.ts` (2).

**Mapa R → test:**
- R12 → `PagosPorConfirmar.test.tsx` («SLT-60 R12…»: filas en orden con fecha/monto/referencia/registrado por; vacío);
  `plataforma-empresa-detalle-page.test.tsx` («R12: lee con el actor…», «R12: sin pagos…», «R12: un rol de empresa…»)
- R13 → `PagosPorConfirmar.test.tsx` («SLT-60 R13…»); `plataforma-empresa-detalle-page.test.tsx` («R13: … estado distinto
  de ok / un throw …»: plan, núcleo y módulos se pintan)
- R14 → `PagosPorConfirmar.test.tsx` («SLT-60 R14…»: 200 000 + 100 000 precargados, N.º, período, total, saldo; sin facturas)
- R17 → `PagosPorConfirmar.test.tsx` («SLT-60 R17…»: suma corta deshabilita; sobre saldo bajo su fila; `validation_error`)
- R23 → `PagosPorConfirmar.test.tsx` («SLT-60 R23…»: `ok` manda el reparto, cierra y `refresh`; `ya_confirmado`,
  `not_found`; `forbidden` y throw)
- R27 → `empresas-module.test.tsx` («SLT-60 — el contador… (R27)»: 0, 1 y 3)
- R32 → `PagosPorConfirmar.test.tsx` («Ver comprobante» / «Sin comprobante»; el diálogo repite el enlace)
- R33 → `PagosPorConfirmar.test.tsx` (pide solo el pago y abre la url sin opener; 4 fallos → «No se pudo abrir el
  comprobante»); `plataforma-empresa-detalle-page.test.tsx` («R33: … empresa ligada en el servidor»: `(ORG, pagoId)`)

**Salida:**
- `vitest run PagosPorConfirmar.test.tsx empresas-module.test.tsx`: `Test Files 2 passed (2) · Tests 65 passed (65)`.
- `vitest run plataforma-empresa-detalle-page.test.tsx`: `Test Files 1 passed (1) · Tests 32 passed (32)`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: sin errores (los 12 TS2741 de T4.1 resueltos).
- `pnpm run lint`: `✖ 251 problems (0 errors, 251 warnings)`; `eslint` sobre los 7 archivos tocados: sin avisos.
- `pnpm run test:guardias`: `Test Files 2 failed | 339 passed | 3 skipped (344) · Tests 5 failed | 4829 passed | 25
  skipped`. 4 son `dependencias-declaradas-presentes` (baseline). El 5.º es `catalogo-postgres-acota-esquema`:
  `tests/integration/db/pago-plataforma-confirmacion.test.ts:436` lee `pg_proc` sin acotar el esquema (archivo de
  backend_dev, T3.5; no tocado). `superficie-de-uso` en verde tras quitar las tres `@sin-superficie`.

**Veredicto:** T4.2, T5.1 y T5.2 en verde; queda un rojo de guardia ajeno (`catalogo-postgres-acota-esquema` en el
test de integración de T3.5).

## T5b.2, T6, T8.1, T9.3 (backend_dev)

**Archivos:**
- `lib/types/cobro-plataforma.ts` (T5b.2, R36): `MENSAJE_TOPE_PAGO_PLATAFORMA` = «El pago no puede ser mayor que lo pendiente
  de las facturas cerradas, descontados los pagos por confirmar.»; su comentario habla de lo disponible.
- Literal de R36 escrito a mano en `tests/unit/services/wallet-egreso-service.test.ts`,
  `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx`, `tests/unit/actions/wallet-egresos.composition-root.test.ts`,
  `tests/integration/db/pago-plataforma-sl45.test.ts` y `-concurrencia.test.ts`. En el diálogo, además, la frase del efecto
  al literal de R37 del spec (la pregunta abierta de R37 sigue sin resolver; no se tocó).
- `tests/integration/db/_fixtures/factura-cerrada.ts`: `confirmarComoDueno(cliente, org, pagoId, aplicaciones, porUsuarioId)`
  (`pago_plataforma_confirmar` como dueño; lanza si no responde `ok`) y el tipo `AplicacionDePrueba`.
- T6.1 `pago-plataforma-sl45.test.ts`: cierra las facturas de A (1 500) y B (300) en la siembra; control de las cerradas y
  de lo disponible. El pago deja la deuda igual y baja lo disponible; paso nuevo «SLT-60 R7: confirmado el pago de 1 500 →
  al día». El R18 de SL-45 (anular con la deuda en cero o a favor) choca con SLT-60 R10 si el pago está confirmado: se
  parte en «SLT-60 R10: A intenta anular su pago confirmado con saldo a favor → forbidden, nada escrito» y «R18: con la
  deuda de B en 0,00 (eliminó su orden), B anula su pago por confirmar → ok, la deuda sigue en 0,00». R20: B paga y sigue
  debiendo 300 (por confirmar).
- T6.2 `-concurrencia.test.ts`: cierra la factura; antes de cada afirmación de deuda confirma el pago que entró. Para R11
  la orden nueva lleva su cargo a la en curso (`UPDATE ocurrido_at` como dueño) y se cierra una segunda factura. Mismas
  cifras (500 / 400 + 400 / 100), ahora también sobre lo disponible.
- T6.3 `-blindaje.test.ts`: cierra las facturas de A y B (1 000); P1 se confirma en la siembra (deuda y disponible 400).
  m3 pasa a `sumaPagosConfirmados` (B: 0,00 por confirmar, 200,00 confirmado). El último caso confirma el INSERT a mano
  que entró antes de afirmar 100,00.
- T6.4 `factura-plataforma-deuda.test.ts`: el cargo del caso R18/R19 cae en la factura del alta (20-oct), que se cierra
  antes del pago; el pago de 60 y el de 31 040 (40 + 31 000) se confirman como dueño dentro de la transacción revertida.
  Todas las cifras de los cuatro sitios quedan igual. Comentario de cabecera: `sumaPagosConfirmados` y lo disponible.
- T6.5 `descarga-pago-plataforma-sl45.test.ts`: cierra la factura antes del pago.
- T6.6 `migracion-sl45-ida-y-vuelta.test.ts`: **sin cambios**. Su base propia se migra solo hasta SL-45
  (`20261024140000`), antes de `factura_plataforma` (SLT-118): no hay factura que sembrar y el tope de SLT-60 no existe ahí.
  Verde sin tocarlo.
- `tests/integration/db/pago-plataforma-confirmacion.test.ts:436`: el `pg_proc` del control acota `n.nspname = 'public'`
  (rojo de la guardia `catalogo-postgres-acota-esquema` que anotó frontend_dev).
- T9.3 `scripts/demo-qa/receta.ts`: antes del pago, como dueño, `factura_plataforma_cerrar(org, ahora)` (abre la en curso si
  falta) y `factura_plataforma_cerrar(org, fin_natural_at + 6 min)` de la en curso; lanza si no cierra exactamente una.
- T8.1 `docs/architecture.md`, «Facturas de la plataforma»: la deuda cuenta los confirmados (wallet y listado, «Pagado» y
  el contador) y un viñeta nueva «Pagos a la plataforma: registro y confirmación» con el saldo, lo disponible y el tope
  en dos capas, la confirmación, las dos tablas y el bloqueo de la anulación.

**Decisiones:**
- **Confirmar como dueño con el maestro como `confirmado_por`** en los tests de §8.1 (design: «como dueño o con el
  servicio»): la base solo exige un usuario de la misma empresa o sin empresa. Así estos archivos no compiten por el
  superadmin único (`tomarLockDeSuperadmin`). La autorización del superadmin la cubre `pago-plataforma-confirmacion.test.ts`.
- **R18 de SL-45** se mide con un pago por confirmar y la deuda en 0,00 (no a favor): con un pago por confirmar, la deuda
  no puede quedar a favor sin una cerrada con saldo. El caso del confirmado a favor queda como SLT-60 R10.

**Verificación (base `servi_logistic_slt60`):**
- `vitest run` de T5b.2: `Test Files 3 passed (3) · Tests 114 passed (114)`.
- `vitest run` de los 6 de T6 + `pago-plataforma-confirmacion` + los 3 unitarios de T5b.2: `Test Files 10 passed (10) ·
  Tests 180 passed (180)`, sin `skipped`.
- `vitest run tests/integration/db/demo-qa.test.ts` (sin tocarlo): `Test Files 1 passed (1) · Tests 13 passed (13)`.
- `pnpm run typecheck`: exit 0. `pnpm run lint`: `0 errors, 251 warnings`; `eslint` sobre los archivos tocados: sin avisos.
- `node scripts/check-perfil.mjs`: «6/6 docs revisados en los ultimos 60 dias», exit 0.
- `pnpm run test:guardias`: `Test Files 1 failed | 340 passed | 3 skipped (344) · Tests 4 failed | 4830 passed | 25
  skipped`; los 4 son `dependencias-declaradas-presentes` (baseline). `catalogo-postgres-acota-esquema` en verde.

**Veredicto:** T5b.2, T6.1–T6.6, T8.1 y T9.3 en verde con base; queda abierta la pregunta de R37 (T5b.3).

**Decisión del humano (2026-11-13):** opción (a), una sola oración: «…confirma el pago; baja la ganancia.».
La regla no cambia. R37 actualizado en `requirements.md`.
- T5b.3 aplicada (literal en la constante, 3 tests de vitest y `e2e/pago-plataforma-sl45.spec.ts`):
  `vitest run` de `wallet-conceptos-manuales.test.ts`, `WalletDeudaPlataformaSL45.test.tsx` y
  `wallet-registrar-movimiento-dialog.test.tsx`: `Test Files 3 passed (3) · Tests 111 passed (111)`; eslint de
  los 5 archivos sin avisos.

## T9.2 — conteo en prod

Pendiente del humano: el conteo de solo lectura en prod
(`SELECT count(*) FROM wallet_movimiento WHERE categoria = 'egreso_pago_plataforma'`) lo corre él, no el
implementer (decisión del 2026-11-13). T9.2 queda sin marcar.

## T8.2 — Mapa R → test

Siglas: **INT** = `tests/integration/db/pago-plataforma-confirmacion.test.ts`; **SVC** =
`tests/unit/services/pago-plataforma-confirmacion-service.test.ts`; **ACT** = `tests/unit/actions/pagos-plataforma.test.ts`;
**E2E** = `e2e/pago-plataforma-confirmacion.spec.ts`; **COMP** = `tests/components/PagosPorConfirmar.test.tsx`;
**PAG** = `tests/integration/plataforma-empresa-detalle-page.test.tsx`; **TOPE** =
`tests/unit/services/tope-pago-plataforma-service.test.ts`; **DEUDA45** = `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts`.

| R | Test |
|---|---|
| R1 | INT «R1, R6: A paga 200 000 → por confirmar; la caja baja 200 000, la deuda NO baja y lo disponible sí» |
| R2 | INT «R2: A intenta 180 000,01 → validation_error…»; TOPE «R2: … 180 000,00 cabe (el borde exacto)» y «R2: … 180 000,01 supera»; `wallet-egreso-service.test.ts` «R9, SLT-60 R36: supera → validation_error en monto…» |
| R3 | INT «R3: A con órdenes por 380 000 y sin cerrar → disponible 0…»; TOPE «R3: con 0,00 disponibles…», «R3: con lo disponible negativo (−30 000,00…)» |
| R4 | INT «R4: como servi_app a mano, un pago de 180 000,01 → check_violation; uno de 180 000,00 entra» |
| R5 | INT «R5: dos pagos de 100 000 a la vez… uno entra y el otro es validation_error»; TOPE «R5: toma el candado ANTES…» |
| R6 | INT «R1, R6: …» (deuda 380 000, disponible 180 000) |
| R7 | INT «R16, R22» y «R18, R7»; DEUDA45 «SLT-60 R7, R8, R27: …»; `tests/unit/actions/deuda-plataforma.composition-root.test.ts`; E2E paso 4 |
| R8 | DEUDA45 «SLT-60 R7, R8, R27: …»; `tests/unit/actions/empresas-plataforma.composition-root.test.ts` «el superadmin recibe el listado…» |
| R9 | INT «R9: A anula el pago de 100 000 por confirmar → ok…» |
| R10 | INT «R10: A anula el pago confirmado → forbidden…»; `tests/unit/services/wallet-anulacion-service.test.ts` «SLT-60 … (R10)»; `tests/integration/db/pago-plataforma-sl45.test.ts` «SLT-60 R10»; E2E paso 4 |
| R11 | INT «R11: el contra-asiento del pago confirmado escrito a mano → SL060» |
| R12 | INT «R12, R14, R32: …»; COMP «SLT-60 R12 …»; PAG «R12: lee con el actor de la sesión…», «R12: sin pagos…», «R12: un rol de empresa no lee…»; SVC «verDeEmpresa (R12, R14)»; ACT «verPagosDeEmpresaAction… (R12, R14, R32)» |
| R13 | COMP «con `null` dice «No se pudieron cargar los pagos por confirmar»…»; PAG «R13: si la lectura da %s…»; ACT «si la base devuelve otra forma, lanza (… R13)» |
| R14 | `tests/unit/utils/reparto-pago-plataforma.test.ts` «R14: el pago de 300 000 propone 200 000 … y 100 000…» (+4 casos R14); COMP «Confirmar pago de {monto}…»; INT «R12, R14, R32» |
| R15 | INT «R15, R17: un reparto inválido…» y «R31»; SVC «R15, R17: %s de la base va bajo su factura» |
| R16 | INT «R16, R22: el superadmin confirma los 200 000…»; SVC «R16: …»; ACT «R16: …» |
| R17 | INT «R15, R17»; SVC «R17: …» (4 casos); ACT «R17: …»; reparto «R17: …» (9 casos); COMP «si la suma no cuadra…», «un monto sobre el saldo…», «un `validation_error` del servidor…» |
| R18 | INT «R18, R7: un pago que deja el saldo en 0…» |
| R19 | INT «R19: confirmar otra vez → ya_confirmado» y «R19: dos confirmaciones a la vez…»; SVC «R19»; ACT «R19» |
| R20 | INT «R20: confirmar el anulado, uno inexistente o el de otra empresa → not_found»; SVC «R20»; ACT «R20» |
| R21 | INT «R21: A anula y el superadmin confirma el mismo pago a la vez → gana exactamente una…» |
| R22 | INT «R16, R22: … disponible igual…» |
| R23 | COMP «SLT-60 R23 — tras confirmar, la página se relee» |
| R24 | SVC «R24: …» (4 casos); ACT «R24: un maestro recibe forbidden…», «R24: sin sesión…» |
| R25 | INT «R25: B lee solo sus confirmaciones y aplicaciones; otra empresa no ve nada; y no puede escribirlas (42501)» |
| R26 | INT «R26: una confirmación o una aplicación no cambian, tampoco como dueño (SL060)» |
| R27 | `tests/components/empresas-module.test.tsx` «SLT-60 — el contador … (R27)» (0, 1, 3); DEUDA45 «SLT-60 R27: …»; E2E paso 3 |
| R28 | `tests/integration/db/migracion-slt60-ida-y-vuelta.test.ts` «R28: …» |
| R29 | `tests/integration/db/migracion-slt60-ida-y-vuelta.test.ts` «R29: el down.sql quita … y repone el tope de SLT-118» |
| R30 | E2E pasos 2, 3 y 4 |
| R31 | INT «R31: C con cerradas de 200 000 y −30 000 → disponible 170 000…» |
| R32 | COMP ««Ver comprobante» con comprobante y «Sin comprobante» sin él (R32)»; INT «R12, R14, R32» y «R32, R34»; E2E paso 3 |
| R33 | SVC «R33: firma con el TTL de la wallet…»; ACT «R33: …»; COMP «al pulsarlo pide SOLO el pago y abre la url firmada… (R33)»; PAG «R33: …»; INT «R32, R34»; E2E paso 3 |
| R34 | SVC «R34: …» (4 casos); ACT «R34: …» (2 casos); INT «R32, R34: … el pago de C no se ve desde B» |
| R35 | `tests/unit/components/wallet-labels.test.ts`; `tests/components/WalletDeudaPlataformaSL45.test.tsx`; `tests/components/WalletDeudaPlataformaSL40.test.tsx`; `tests/unit/asistente/contexto-sl45.test.ts` «R1–R3 y SLT-60 R35…»; E2E paso 2; `e2e/cobro-plataforma-sl40.spec.ts` |
| R36 | `tests/unit/services/wallet-egreso-service.test.ts` «R9, SLT-60 R36…»; `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx` «R9, SLT-60 R36…»; E2E paso 2 |
| R37 | `tests/unit/components/wallet-conceptos-manuales.test.ts` «cada concepto tiene su frase…» y «R6: sus dos frases…»; `tests/components/WalletDeudaPlataformaSL45.test.tsx` «R4: …»; `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx` «las siete frases de la 461…» |
| R38 | `tests/unit/asistente/contexto-sl45.test.ts` «SLT-60 R38, …» (3 casos) |

## T7 (E2E) — leader, 2026-11-13

- Primera corrida completa (frontend_dev, base `servi_logistic_slt60_e2e` recreada): grupo `dinero` entero,
  incluido `e2e/pago-plataforma-confirmacion.spec.ts`: «111 passed (10.2m)». `dos-empresas-humo` + sl40 + sl45:
  «27 passed (2.6m)». 0 failed, 0 skipped y 0 flaky.
- Segunda corrida: no válida. Primero, otro agente recreó la base a mitad de camino. Después, el leader la
  relanzó y Claude Code la detuvo por falta de memoria en la máquina.
- Decisión del humano (2026-11-13): la segunda corrida la cierra el check `e2e` del CI cuando el PR #151 salga
  de borrador. T7.3 queda pendiente de ese check.
