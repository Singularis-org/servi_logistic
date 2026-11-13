# SLT-60 «Confirmación del pago a la plataforma por el superadmin» — tasks

> Requisitos: `requirements.md` (R1–R38). Diseño: `design.md`. `[P]` = puede ir en paralelo con las otras
> `[P]` de la misma tanda. Cada tanda cierra con `./init.sh` en verde y un commit (`feat(SLT-60): …`).
> Reparto: `backend_dev` para `lib/`, `db/`, `scripts/` y los tests de servidor; `frontend_dev` para
> `app/` y los tests de componentes.

## T0 — Comprobaciones antes de escribir (sin código)

- [x] **T0.1** Insertar, en una base desechable, una fila con FK a `usuario` apuntando al superadmin
  (`organizacion_id` nulo) en una tabla con trigger de misma empresa. **Hecho:** anotado en
  `progress/impl_SLT-60.md` si `confirmado_por` lleva FK (design §1).
- [x] **T0.2** Comprobar que la última migración de `dev` sigue siendo anterior a `20261116120000`. Si no lo
  es, se renombra la carpeta antes de aplicarla en ninguna base compartida. **Hecho:** timestamp anotado.
- [x] **T0.3** Mirar si `scripts/demo-qa/receta.ts` cierra alguna factura antes del pago a la plataforma.
  **Hecho:** anotado qué cambia en T9.3.
- [x] **T0.4** Volver a correr `node scripts/archivos-en-vuelo.mjs --candidata SLT-60`. **Hecho:** los
  choques anotados. Se espera solo el de SLT-119 «Planes: pantallas de facturas para el superadmin y el
  maestro», en `page.tsx` y `reparto.ts`.

## T1 — La base (depende de T0)

- [x] **T1.1** La migración `20261116120000_pago_plataforma_confirmacion/migration.sql` (design §1, §3):
  - las dos tablas, con sus CHECK, únicos, índice, FK, RLS, políticas y `REVOKE`;
  - los triggers sin cambio de empresa, inmutable y de misma empresa (generados con `--faltantes`);
  - las funciones `factura_plataforma_saldos`, `pago_plataforma_por_confirmar`,
    `pago_plataforma_disponible_de`, `pago_plataforma_disponible` (con `GRANT` a `servi_app`) y
    `pago_plataforma_confirmar`;
  - el tope reescrito y el trigger `pago_plataforma_no_anular_confirmado`;
  - ningún `INSERT` de datos (R28).

  **Hecho:** aplica en una base desechable.
- [x] **T1.2** `down.sql` (design §3.8), con el cuerpo literal del tope de `20261111130100` §9. **Hecho:**
  `pnpm run db:rollback` y la migración otra vez, sin error.
- [x] **T1.3** `db/schema.prisma`: los dos modelos y sus relaciones inversas. `lib/db/modelos-de-negocio.ts`:
  los dos en `MODELOS_DE_NEGOCIO`. **Hecho:** `pnpm run typecheck` en verde.
- [x] **T1.4** [P] `scripts/verificar-rls-despliegue.ts` (`TRIGGERS_MISMA_EMPRESA` = 179, con su línea de
  comentario) y `tests/unit/guards/rls-por-empresa.guardia.test.ts` (92). **Hecho:** `pnpm run test:guardias`
  en verde.
- [x] **T1.5** [P] `tests/integration/db/migracion-slt60-ida-y-vuelta.test.ts`. **Hecho:** verde con base
  (R28, R29).

## T2 — Lectura del dinero en el servidor (depende de T1)

- [x] **T2.1** `lib/db/errores-pago-plataforma.ts`: `traducirErrorDeConfirmacion` y `esPagoConfirmadoError`
  (design §3.6).
- [x] **T2.2** `IPagoPlataformaRepository` y `PagoPlataformaRepository`:
  - fuera `sumaPagosVigentes`;
  - entran `sumaPagosConfirmados` y `disponibleParaRegistrar`;
  - el tipo del cliente se amplía.

  También `tests/unit/guards/pago-plataforma-inmutable-sl45.guardia.test.ts`. **Hecho:** typecheck y
  guardias en verde.
- [x] **T2.3** `TopePagoPlataformaService` con un solo repositorio (design §4.2), `lib/actions/wallet-egresos.ts`
  y `tests/unit/actions/wallet-egresos.composition-root.test.ts`. Se reescribe
  `tests/unit/services/tope-pago-plataforma-service.test.ts`. **Hecho:** verde, con el borde exacto (R2, R3).
- [x] **T2.4** `DeudaPlataformaService` con `sumaPagosConfirmados` y
  `tests/unit/services/deuda-plataforma-service.test.ts`. **Hecho:** verde (R7).
- [x] **T2.5** `EgresoCajaAnulacionService`: `esPagoConfirmadoError` da `forbidden`. Se amplía
  `tests/unit/services/wallet-anulacion-service.test.ts`. **Hecho:** verde (R10).

## T3 — La confirmación en el servidor (depende de T2.1)

- [x] **T3.1** [P] `lib/types/pago-plataforma.ts` (design §4.4) y `lib/utils/reparto-pago-plataforma.ts` (§5),
  con `tests/unit/utils/reparto-pago-plataforma.test.ts`. **Hecho:** verde con el ejemplo de 300 000 (R14,
  R17).
- [x] **T3.2** `IPagoPlataformaConfirmacionRepository` y `PagoPlataformaConfirmacionRepository` (§4.3), y la
  entrada en `lib/db/excepciones-aislamiento.ts`. **Hecho:** las guardias `plataforma-solo-en-lista` y
  `sql-a-mano-por-empresa` en verde.
- [x] **T3.3** `IPagoPlataformaConfirmacionService` y `PagoPlataformaConfirmacionService` (§4.5), con
  `tests/unit/services/pago-plataforma-confirmacion-service.test.ts`. **Hecho:** verde (R17, R19, R20, R24).
- [x] **T3.4** `lib/actions/pagos-plataforma.ts`, `"pagos-plataforma": "nucleo"` en `lib/modulos/reparto.ts` y
  `tests/unit/actions/pagos-plataforma.test.ts`. **Hecho:** verde; la guardia `modulos-reparto` en verde.
- [x] **T3.5** `tests/integration/db/_fixtures/factura-cerrada.ts` y
  `tests/integration/db/pago-plataforma-confirmacion.test.ts`, con la tabla de pasos de design §8 (incluida
  la empresa C con la factura de −30 000) y sus cuatro mutaciones medidas y revertidas. **Hecho:** verde con
  base. Cubre R1–R7, R9–R11, R15–R22, R25, R26, R31 y la lectura de R32 y R34.
- [x] **T3.6** El comprobante para el superadmin (design §4.8), en archivos que ya están en la lista:
  - `verComprobante` en el servicio y su interfaz;
  - `pagoDeLaEmpresa` y `tieneComprobante` en el repositorio;
  - `verComprobantePagoSchema` y su resultado en los tipos;
  - `verComprobantePagoPlataformaAction` y su composition root, que pasa `WalletComprobanteRepository`,
    `SupabaseSignedUrlProvider` con el bucket de la wallet y el TTL.

  Los casos del comprobante van en `tests/unit/services/pago-plataforma-confirmacion-service.test.ts` y en
  `tests/unit/actions/pagos-plataforma.test.ts`. **Hecho:** verde (R33, R34); la guardia
  `storage-solo-por-adaptador` en verde.

## T4 — El listado de Empresas (depende de T2.2)

- [x] **T4.1** `EmpresasPlataformaRepository` (confirmados y contador) y `lib/types/empresas-plataforma.ts`
  (`pagosPorConfirmar`). Se ajustan `tests/unit/actions/empresas-plataforma.composition-root.test.ts` y
  `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts`. **Hecho:** verde (R7, R8, R27).
- [x] **T4.2** [P] `EmpresasModule.tsx` (la tercera línea de `CeldaPlataforma`) y
  `tests/components/empresas-module.test.tsx` con 0, 1 y 3. **Hecho:** verde (R27).

## T5 — La pantalla del superadmin (depende de T3.4)

- [x] **T5.1** `PagosPorConfirmar.tsx` (design §6.1), con la columna y el enlace del comprobante, y
  `tests/components/PagosPorConfirmar.test.tsx`. **Hecho:** verde (R12–R14, R17, R23, R32, R33).
- [x] **T5.2** `page.tsx` del detalle, con `leerPagos` aislada, la sección antes de `PlanEmpresa` y
  `verComprobantePagoPlataformaAction` ligada con `organizacionId`. Se amplía
  `tests/integration/plataforma-empresa-detalle-page.test.tsx`. **Hecho:** verde (R12, R13).

## T5b — Los textos de la wallet (depende de T2.3; [P] con T5)

Cada test pasa al literal nuevo escrito a mano, nunca leído de la constante (design §6.4).

- [x] **T5b.1** [P] La pista (R35): `app/(app)/wallet/_components/wallet-labels.ts`,
  `tests/unit/components/wallet-labels.test.ts`, `tests/components/WalletDeudaPlataformaSL45.test.tsx`,
  `tests/components/WalletDeudaPlataformaSL40.test.tsx` y `e2e/cobro-plataforma-sl40.spec.ts`. **Hecho:**
  verde.
- [x] **T5b.2** [P] El mensaje del tope (R36): `lib/types/cobro-plataforma.ts`,
  `tests/unit/services/wallet-egreso-service.test.ts` y
  `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx`. **Hecho:** verde.
- [ ] **T5b.3** [P] La frase del efecto (R37): `app/(app)/wallet/_components/wallet-conceptos-manuales.ts` y
  `tests/unit/components/wallet-conceptos-manuales.test.ts`; el diálogo y la región ya están en T5b.1 y
  T5b.2. **Hecho:** verde.
- [x] **T5b.4** La ayuda (R38): `docs/ayuda/oficina/wallet-caja.md`, con `actualizado:`, y
  `tests/unit/asistente/contexto-sl45.test.ts`. **Hecho:** verde; ninguna frase de la ayuda dice que la deuda
  baja al registrar (`grep`).

## T6 — Poner al día los tests que pagan sin factura cerrada (depende de T2 y T3.5)

Cada una siembra con el fixture de T3.5 y, donde afirma la deuda tras pagar, confirma antes (design §8.1).

- [x] **T6.1** [P] `tests/integration/db/pago-plataforma-sl45.test.ts`
- [x] **T6.2** [P] `tests/integration/db/pago-plataforma-sl45-concurrencia.test.ts`
- [x] **T6.3** [P] `tests/integration/db/pago-plataforma-sl45-blindaje.test.ts`
- [x] **T6.4** [P] `tests/integration/db/factura-plataforma-deuda.test.ts`
- [x] **T6.5** [P] `tests/integration/db/descarga-pago-plataforma-sl45.test.ts`
- [x] **T6.6** [P] `tests/integration/db/migracion-sl45-ida-y-vuelta.test.ts`

**Hecho:** los seis en verde con base, sin ningún `skip` nuevo y sin bajar ninguna afirmación que no sea la de
«la deuda baja al registrar», que pasa a «al confirmar».

## T7 — E2E (depende de T4 y T5)

- [ ] **T7.1** `e2e/pago-plataforma-confirmacion.spec.ts` (design §9) y su proyecto en `playwright.config.ts`.
  **Hecho:** verde en local con una base desechable nueva (R30).
- [ ] **T7.2** `e2e/pago-plataforma-sl45.spec.ts` al día: siembra, la región no baja al pagar, y los literales
  de R35, R36 y R37. **Hecho:** verde.
- [ ] **T7.3** Correr el grupo `dinero` entero, `e2e/wallet.spec.ts` y `e2e/dos-empresas-humo.spec.ts`
  (`docs/perfil-agentes.md`). **Hecho:** verde, con la salida anotada en `progress/impl_SLT-60.md`.

## T8 — Documentación (depende de T1–T5)

- [x] **T8.1** `docs/architecture.md`, en «Facturas de la plataforma»: el saldo, lo disponible, la
  confirmación, las dos tablas, el bloqueo de la anulación y que la deuda cuenta los confirmados. **Hecho:**
  la guardia del perfil en verde.
- [ ] **T8.2** `progress/impl_SLT-60.md` con el mapa `R<n> → test` de R1 a R38.

## T9 — Cierre (depende de todo)

- [ ] **T9.1** `./init.sh` en verde.
- [ ] **T9.2** Contar los pagos a la plataforma en **prod** antes del deploy (decisión del 2026-11-11 y del
  2026-11-13), con una consulta de solo lectura:
  `SELECT count(*) FROM wallet_movimiento WHERE categoria = 'egreso_pago_plataforma'`. **Hecho:** el número
  anotado en `progress/impl_SLT-60.md`. Con más de 0 se para y decide el humano.
- [x] **T9.3** `scripts/demo-qa/receta.ts`: cerrar la factura de la demo antes del pago, si T0.3 lo pidió.
  **Hecho:** `tests/integration/db/demo-qa.test.ts` en verde sin tocarlo.

## Archivos esperados

- `db/migrations/20261116120000_pago_plataforma_confirmacion/migration.sql`
- `db/migrations/20261116120000_pago_plataforma_confirmacion/down.sql`
- `db/schema.prisma`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/db/errores-pago-plataforma.ts`
- `scripts/verificar-rls-despliegue.ts`
- `lib/types/pago-plataforma.ts`
- `lib/utils/reparto-pago-plataforma.ts`
- `lib/interfaces/repositories/IPagoPlataformaConfirmacionRepository.ts`
- `lib/repositories/PagoPlataformaConfirmacionRepository.ts`
- `lib/interfaces/services/IPagoPlataformaConfirmacionService.ts`
- `lib/services/PagoPlataformaConfirmacionService.ts`
- `lib/actions/pagos-plataforma.ts`
- `lib/modulos/reparto.ts`
- `lib/interfaces/repositories/IPagoPlataformaRepository.ts`
- `lib/repositories/PagoPlataformaRepository.ts`
- `lib/services/TopePagoPlataformaService.ts`
- `lib/actions/wallet-egresos.ts`
- `lib/services/DeudaPlataformaService.ts`
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `lib/types/empresas-plataforma.ts`
- `lib/services/EgresoCajaAnulacionService.ts`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PagosPorConfirmar.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`
- `scripts/demo-qa/receta.ts`
- `docs/architecture.md`
- `progress/impl_SLT-60.md`
- `tests/integration/db/_fixtures/factura-cerrada.ts`
- `tests/integration/db/pago-plataforma-confirmacion.test.ts`
- `tests/integration/db/migracion-slt60-ida-y-vuelta.test.ts`
- `tests/unit/utils/reparto-pago-plataforma.test.ts`
- `tests/unit/services/pago-plataforma-confirmacion-service.test.ts`
- `tests/unit/actions/pagos-plataforma.test.ts`
- `tests/components/PagosPorConfirmar.test.tsx`
- `e2e/pago-plataforma-confirmacion.spec.ts`
- `playwright.config.ts`
- `tests/integration/plataforma-empresa-detalle-page.test.tsx`
- `tests/components/empresas-module.test.tsx`
- `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts`
- `tests/unit/services/wallet-anulacion-service.test.ts`
- `tests/unit/services/tope-pago-plataforma-service.test.ts`
- `tests/unit/services/deuda-plataforma-service.test.ts`
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`
- `tests/unit/guards/pago-plataforma-inmutable-sl45.guardia.test.ts`
- `tests/integration/db/pago-plataforma-sl45.test.ts`
- `tests/integration/db/pago-plataforma-sl45-concurrencia.test.ts`
- `tests/integration/db/pago-plataforma-sl45-blindaje.test.ts`
- `tests/integration/db/factura-plataforma-deuda.test.ts`
- `tests/integration/db/descarga-pago-plataforma-sl45.test.ts`
- `tests/integration/db/migracion-sl45-ida-y-vuelta.test.ts`
- `tests/unit/actions/wallet-egresos.composition-root.test.ts`
- `tests/unit/actions/empresas-plataforma.composition-root.test.ts`
- `e2e/pago-plataforma-sl45.spec.ts`
- `app/(app)/wallet/_components/wallet-labels.ts`
- `app/(app)/wallet/_components/wallet-conceptos-manuales.ts`
- `lib/types/cobro-plataforma.ts`
- `docs/ayuda/oficina/wallet-caja.md`
- `tests/unit/components/wallet-labels.test.ts`
- `tests/components/WalletDeudaPlataformaSL45.test.tsx`
- `tests/components/WalletDeudaPlataformaSL40.test.tsx`
- `tests/unit/asistente/contexto-sl45.test.ts`
- `e2e/cobro-plataforma-sl40.spec.ts`
- `tests/unit/services/wallet-egreso-service.test.ts`
- `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx`
- `tests/unit/components/wallet-conceptos-manuales.test.ts`

67 rutas, por encima del tope de `gate.tamano_pr` (40). El humano aceptó un solo PR con todas el 2026-11-13
(«~61»; el desglose está en design §11). Con SLT-119 «Planes: pantallas de facturas para el superadmin y el maestro»
coinciden `app/(app)/plataforma/empresas/[organizacionId]/page.tsx` y `lib/modulos/reparto.ts`: rebasa quien
mergee segundo.
