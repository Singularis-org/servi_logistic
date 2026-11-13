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

## Pregunta abierta — R37 contra la regla de una oración

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
