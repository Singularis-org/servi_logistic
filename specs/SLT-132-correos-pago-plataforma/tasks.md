# SLT-132 «Correos del pago a la plataforma» — tasks

> Requisitos R1–R25 (`requirements.md`) y diseño en `design.md`. Hay un solo PR por encima del tope, aceptado por el
> humano el 2026-11-20. Cada task termina con su commit (`feat(SLT-132): …` / `test(SLT-132): …`).
> `[P]` = puede ir en paralelo con las otras `[P]` del mismo bloque.

## T0 — Comprobaciones antes de escribir (sin código)

- [ ] **T0.1** Comprobar que la última migración de `dev` sigue siendo `20261124120000_sl21_pais_moneda_impuesto`.
  - **Hecho:** el timestamp de T1.1 queda fijado y anotado en `progress/impl_SLT-132.md`.
- [ ] **T0.2** Comprobar que `servi_app` puede insertar en `jobs` dentro de la transacción de la wallet, con el
  precedente de `webhook_evento` (ficha 454).
  - **Hecho:** anotado con el archivo y la línea del precedente. Si no puede, se para y se avisa al leader.
- [ ] **T0.3** Buscar los tests que cuentan filas de `jobs` y que registran pagos a la plataforma
  (`pago-plataforma-sl45*`, `wallet-*-458`, `factura-plataforma-deuda`, `demo-qa`).
  - **Hecho:** la lista va en `progress/impl_SLT-132.md`. Los que haya que ajustar se suman a `## Archivos esperados`.
- [ ] **T0.4** Buscar con Grep los inventarios de enums: tests que listan `'factura_plataforma_emitida'`,
  `'factura_plataforma'` o `'factura_plataforma_aviso'`.
  - **Hecho:** la lista coincide con la de design §8 o se amplía `## Archivos esperados`.

## T1 — La base y la lectura (depende de T0)

- [ ] **T1.1** La migración `20261125120000_pago_plataforma_aviso_enums` (`migration.sql` y `down.sql`) y los cinco
  valores en `db/schema.prisma` (design §1).
  - **Hecho:** `pnpm run db:migrate` y `db:rollback` dan ida y vuelta en una base desechable, y
    `pago-plataforma-aviso-migration.test.ts` está en verde (R23).
- [ ] **T1.2** Ampliar a mano los inventarios de enums (T0.4).
  - **Hecho:** pasan en local con la migración aplicada.
- [ ] **T1.3** `IPagoPlataformaAvisoRepository` y `PagoPlataformaAvisoRepository`: `datosDelPago` y
  `superadminActivo` (design §2), con su entrada en `EXCEPCIONES_DE_PLATAFORMA`.
  - **Hecho:** `pago-plataforma-aviso-datos.test.ts` está en verde (R7, R8, R13), y la guardia de las excepciones de
    plataforma también.

## T2 — El encolado (depende de T1.1)

- [ ] **T2.1** `lib/repositories/_shared/aviso-pago-plataforma.ts`, con `dedupeAvisoPago` y `encolarAvisoPago`
  (design §3).
- [ ] **T2.2** [P] El encolado de `registrado` en `WalletMovimientoRepository.crearMovimientoRegistrado` (design §3.1).
- [ ] **T2.3** [P] Las transacciones de `confirmar`, `registrarPorFuera` y `anularConfirmado` en
  `PagoPlataformaConfirmacionRepository` (design §3.2).
  - **Hecho (T2.1–T2.3):**
    - `pago-plataforma-aviso-encolado.test.ts` está en verde (R1–R6), con las cuatro mutaciones de design §8
      probadas a mano y anotadas;
    - los tests de SLT-60 y SLT-143 (`pago-plataforma-confirmacion`, `pago-plataforma-por-fuera`) y los de SL-45
      siguen en verde.

## T3 — La campanita (depende de T1.1; [P] con T2)

- [ ] **T3.1** Los tipos en `lib/types/notificacion.ts`. En `emitir.ts`: `AvisoPagoContexto`,
  `textoAvisoPagoPlataforma`, `emitirAvisoPagoPlataforma` y el `export` de `diaDeLaPlataforma`. En
  `notificadores.ts`: `emitirAvisoPagoPlataformaReal` (design §5).
  - **Hecho:** `emitir-pago-plataforma.test.ts` está en verde (R10–R12, R15, R17).
- [ ] **T3.2** [P] Las entradas en `catalogo-avisos.ts`, `push-elegibles.ts` y `lib/whatsapp-envios/eventos.ts`.
  - **Hecho:** los tres tests de catálogo están ampliados y en verde (R14), lo mismo que los de wiring (design §8).

## T4 — La plantilla (sin dependencias; [P] con T1–T3)

- [ ] **T4.1** `lib/services/email/plantillas/pago-plataforma.ts`, con `CorreoPagoPlataforma`,
  `PAGO_PLATAFORMA_TEXTOS` y `plantillaPagoPlataforma` (design §6).
  - **Hecho:** `plantilla-pago-plataforma.test.ts` está en verde (R7, R10–R12, R14, R19–R21), y
    `mi-plan-solo-maestro.guardia.test.ts` sigue en verde sin tocarse (R24).

## T5 — El trabajo (depende de T1.3, T3.1 y T4.1)

- [ ] **T5.1** `lib/planes/jobs-pago-aviso.ts`, con `crearPagoAvisoHandler` y `buildDepsAvisoPago` (design §4).
  - **Hecho:** `jobs-pago-aviso.test.ts` está en verde (R7–R18, R22).
- [ ] **T5.2** El registro: `MODULO_POR_JOB` en `lib/modulos/reparto.ts` y `handlers.set` en
  `app/api/cron/procesar-jobs/route.ts`.
  - **Hecho:** `procesar-jobs-registro.test.ts` está ampliado y en verde (R22).

## T6 — E2E (depende de T2 y T5)

- [ ] **T6.1** Ampliar `e2e/pago-plataforma-confirmacion.spec.ts` con los pasos 1 y 2 de design §9 (R25).
- [ ] **T6.2** Ampliar `e2e/pago-plataforma-por-fuera.spec.ts` con el paso 3 de design §9 (R25).
  - **Hecho (T6.1–T6.2):**
    - los dos corren en verde en local, contra una base desechable, con `NEXT_PUBLIC_APP_URL` como en `gate.yml`;
    - el grupo `dinero` entero está en verde (`pnpm exec playwright test --project=dinero`);
    - también lo están `e2e/wallet.spec.ts` y `e2e/dos-empresas-humo.spec.ts`;
    - ningún `waitForTimeout`.

## T7 — Documentación y cierre (depende de todo)

- [ ] **T7.1** Añadir a `docs/architecture.md` (sección de facturas y pagos de la plataforma) un párrafo: los avisos
  del pago van por la cola, en la misma transacción que el hecho; el superadmin, por correo, y el maestro, por correo
  y campanita a `/wallet`.
  - **Hecho:** el párrafo cita design §3.
- [ ] **T7.2** `./init.sh` en verde y el mapa `R → test` en `progress/impl_SLT-132.md`, con los 25 requisitos.
  - **Hecho:** ningún R sin test.

## Archivos esperados

Producción:
- `db/migrations/20261125120000_pago_plataforma_aviso_enums/migration.sql`
- `db/migrations/20261125120000_pago_plataforma_aviso_enums/down.sql`
- `db/schema.prisma`
- `lib/types/notificacion.ts`
- `lib/notificaciones/emitir.ts`
- `lib/notificaciones/notificadores.ts`
- `lib/notificaciones/catalogo-avisos.ts`
- `lib/notificaciones/push-elegibles.ts`
- `lib/whatsapp-envios/eventos.ts`
- `lib/repositories/_shared/aviso-pago-plataforma.ts`
- `lib/repositories/WalletMovimientoRepository.ts`
- `lib/repositories/PagoPlataformaConfirmacionRepository.ts`
- `lib/repositories/PagoPlataformaAvisoRepository.ts`
- `lib/interfaces/repositories/IPagoPlataformaAvisoRepository.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/planes/jobs-pago-aviso.ts`
- `lib/services/email/plantillas/pago-plataforma.ts`
- `lib/modulos/reparto.ts`
- `app/api/cron/procesar-jobs/route.ts`
- `docs/architecture.md`

Tests:
- `tests/integration/db/pago-plataforma-aviso-migration.test.ts`
- `tests/integration/db/pago-plataforma-aviso-encolado.test.ts`
- `tests/integration/db/pago-plataforma-aviso-datos.test.ts`
- `tests/integration/db/notificacion-evento-bloqueo-cierre-migration.test.ts`
- `tests/integration/db/notificacion-evento-dia-reparto-corregido-migration.test.ts`
- `tests/integration/db/notificacion-evento-gasto-fijo-migration.test.ts`
- `tests/integration/db/notificacion-evento-postulacion-recurso-migration.test.ts`
- `tests/integration/db/notificacion-evento-webhook-suscripcion-migration.test.ts`
- `tests/integration/db/orden-traspaso-migration.test.ts`
- `tests/integration/db/factura-plataforma-aviso-migration.test.ts`
- `tests/integration/db/migracion-plan-borrador-ida-y-vuelta.test.ts`
- `tests/integration/api/procesar-jobs-webhook-estado.test.ts`
- `tests/integration/api/procesar-jobs-geocodificacion.test.ts`
- `tests/unit/planes/jobs-pago-aviso.test.ts`
- `tests/unit/services/email/plantilla-pago-plataforma.test.ts`
- `tests/unit/notificaciones/emitir-pago-plataforma.test.ts`
- `tests/unit/notificaciones/catalogo-avisos.test.ts`
- `tests/unit/notificaciones/push-elegibles.test.ts`
- `tests/unit/whatsapp-envios/eventos-envio.test.ts`
- `tests/unit/whatsapp-envios/fila-puenteable.test.ts`
- `tests/unit/services/notificacion-notificadores-reales.test.ts`
- `tests/unit/services/notificacion-productores-wiring.test.ts`
- `tests/unit/api/procesar-jobs-registro.test.ts`
- `e2e/pago-plataforma-confirmacion.spec.ts`
- `e2e/pago-plataforma-por-fuera.spec.ts`

## Tamaño

- **Archivos:** 45. Son 20 de producción (incluida la doc) y 25 de tests. T0.3 y T0.4 pueden sumar 2 o 3.
- **Líneas de producción:** unas 950. Las más grandes son el `down.sql` (unas 140, la función copiada), el trabajo
  (unas 150), la plantilla (unas 170), el repositorio de lectura (unas 130) y `emitir.ts` (unas 90).
- **Líneas de tests:** unas 1 400.
- Pasa del tope de 40 archivos, y el humano lo aceptó el 2026-11-20 (P1).
