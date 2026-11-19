# SLT-143 «El superadmin registra un pago hecho por fuera y anula un pago confirmado» — tasks

> Requisitos: `requirements.md` (R1–R36). Diseño: `design.md`. `[P]` = puede ir en paralelo con las otras `[P]`
> de la misma tanda. Cada tanda cierra con `./init.sh` en verde y un commit (`feat(SLT-143): …`).
> Reparto: `backend_dev` para `lib/`, `db/`, `scripts/` y los tests de servidor; `frontend_dev` para `app/`,
> `components/` y los tests de componentes.

## T0 — Comprobaciones antes de escribir (sin código)

- [x] **T0.1** Comprobar que la última migración de `dev` sigue siendo anterior a `20261120120000`. Si no lo es,
  se renombra la carpeta antes de aplicarla en una base compartida. **Hecho:** el timestamp anotado en
  `progress/impl_SLT-143.md`.
- [x] **T0.2** Leer en `EgresoCajaAnulacionService`, `AjusteCajaAnulacionRepository` y `WalletMovimientoRepository`
  qué escribe hoy la anulación de un egreso: las columnas de la constancia y del contra-asiento, y el único que da
  `escritas === 0`. **Hecho:** anotado; la función de design §3.4 los copia.
- [x] **T0.3** Confirmar dos cosas:
  - ningún trigger de `wallet_movimiento` exige caja suficiente (R3);
  - el trigger de misma empresa de `wallet_movimiento.registrado_por` y de `wallet_comprobante.subido_por` deja
    pasar al superadmin.

  **Hecho:** anotado. Si alguno no lo deja, se para y se pregunta.
- [x] **T0.4** Localizar dos cosas:
  - los esquemas zod del monto, de la fecha y de la referencia del egreso manual (SL-45 R12), y el tope del motivo
    de 458-B;
  - el selector de fecha del diálogo de la wallet.

  **Hecho:** las rutas anotadas (design §4.1, §6.3).
- [x] **T0.5** Mirar cómo `tests/integration/db/migracion-slt60-ida-y-vuelta.test.ts` aplica su `down`. **Hecho:**
  anotado si T1.5 lo ajusta.
- [x] **T0.6** Confirmar que `libro-caja-kardex.ts` pinta la `descripcion` del pago en «Detalle», en la tabla, el
  detalle y la descarga (design §5). **Hecho:** anotado.
- [x] **T0.7** Correr `node scripts/archivos-en-vuelo.mjs --candidata SLT-143`. **Hecho:** los choques anotados.

## T1 — La base (depende de T0)

- [x] **T1.1** `db/migrations/20261120130000_pago_plataforma_por_fuera/migration.sql` (design §3):
  - la tabla `pago_plataforma_anulacion`, con RLS, política, `REVOKE` y los triggers sin cambio de empresa,
    inmutable y de misma empresa (generados con `--faltantes`);
  - la columna `por_fuera`;
  - `factura_plataforma_saldos` sin los anulados;
  - `_pago_plataforma_aplicar` y `pago_plataforma_confirmar` reescrita sobre ella;
  - `pago_plataforma_registrar_por_fuera` y `pago_plataforma_anular_confirmado`;
  - el trigger `pago_plataforma_no_anular_confirmado` con la excepción;
  - ningún `INSERT` de datos.

  **Hecho:** aplica en una base desechable.
- [x] **T1.2** `down.sql` (design §3.7): aborta si hay anulaciones, y si no, repone los cuerpos literales de
  `20261116120000`. **Hecho:** `pnpm run db:rollback` y la migración otra vez, sin error.
- [x] **T1.3** `db/schema.prisma` (el modelo, la columna y las relaciones) y `lib/db/modelos-de-negocio.ts`.
  **Hecho:** `pnpm run typecheck` en verde.
- [x] **T1.4** [P] `scripts/verificar-rls-despliegue.ts` (`TRIGGERS_MISMA_EMPRESA` = 181, con su comentario) y
  `tests/unit/guards/rls-por-empresa.guardia.test.ts` (93). **Hecho:** `pnpm run test:guardias` en verde.
- [x] **T1.5** [P] `tests/integration/db/migracion-slt143-ida-y-vuelta.test.ts` y, si T0.5 lo pidió,
  `tests/integration/db/migracion-slt60-ida-y-vuelta.test.ts`. **Hecho:** verde con base (R33).
- [x] **T1.6** `tests/integration/db/pago-plataforma-confirmacion.test.ts` (SLT-60), sin tocarlo. **Hecho:** verde
  con base: el reparto sacado a la función interna no cambió nada.

## T2 — El servidor (depende de T1)

- [x] **T2.1** `lib/db/errores-pago-plataforma.ts` (los códigos nuevos y `esTopeDelPagoSuperado`) y
  `lib/types/pago-plataforma.ts` (design §4.1).
- [x] **T2.2** `IPagoPlataformaConfirmacionRepository` y `PagoPlataformaConfirmacionRepository`: `leer` con los
  confirmados, `registrarPorFuera` y `anularConfirmado`. También el motivo en `lib/db/excepciones-aislamiento.ts`.
  **Hecho:** las guardias `plataforma-solo-en-lista` y `sql-a-mano-por-empresa` en verde.
- [x] **T2.3** `IPagoPlataformaConfirmacionService` y `PagoPlataformaConfirmacionService`: `registrarPorFuera`
  con el comprobante dentro de `conEmpresa`, y `anularConfirmado`. Se amplía
  `tests/unit/services/pago-plataforma-confirmacion-service.test.ts`. **Hecho:** verde (R5–R7, R9, R23–R25, R31).
- [x] **T2.4** `lib/actions/pagos-plataforma.ts` (las dos actions y el composition root) y
  `tests/unit/actions/pagos-plataforma.test.ts`. **Hecho:** verde (R31); la guardia `modulos-reparto` en verde.
- [x] **T2.5** [P] `PagoPlataformaRepository.sumaPagosConfirmados` y
  `EmpresasPlataformaRepository.cuentasConLaPlataforma` sin los anulados. Se amplía
  `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts`. **Hecho:** verde (R26). Si el doble de
  `tests/unit/actions/empresas-plataforma.composition-root.test.ts` afirma los argumentos del `groupBy`, se ajusta y
  se anota.
- [x] **T2.6** `tests/integration/db/pago-plataforma-por-fuera.test.ts`, con la tabla de pasos de design §8 y sus
  cinco mutaciones medidas y revertidas. **Hecho:** verde con base. Cubre R1–R3, R5, R6, R8–R12, R14, R15,
  R21–R30 y R32.

## T3 — La marca en la wallet (depende de T1.3; [P] con T2)

- [x] **T3.1** `lib/types/estado-cuenta.ts` (`"plataforma"` y `"plataforma_anulacion"`), `ILibroCajaAutoriaRepository`
  y `LibroCajaAutoriaRepository` (`marcasDeLaPlataforma`), y en `LibroCajaAutoriaService`, `registro` y `anulacion`
  (design §5, §5.1).
- [x] **T3.2** El archivo de textos, `components/shared/wallet/detalle-movimiento-panel-labels.ts`:
  - las dos entradas de `ACCION_AUTOMATICA_LABEL`, «Registrado por la plataforma» y «Anulado por la plataforma»;
  - `textoRegistro` sin «Automático» para las dos;
  - la constante `PLATAFORMA_ANULO = "la plataforma"`.

  Con `tests/unit/components/detalle-movimiento-panel-labels-plataforma.test.ts`, con los literales escritos a
  mano. **Hecho:** verde (R13, R36).
- [x] **T3.3** `tests/unit/services/libro-caja-autoria-plataforma.test.ts` y la ampliación de
  `tests/unit/descarga/wallet-caja-descarga-columnas.test.ts`. **Hecho:** verde (R13, R14, R36).

## T4 — Las pantallas del superadmin (depende de T2.4)

- [x] **T4.1** `RepartoEntreFacturas.tsx`, sacado de `PagosPorConfirmar.tsx`. **Hecho:**
  `tests/components/PagosPorConfirmar.test.tsx` en verde, sin cambiar sus afirmaciones.
- [x] **T4.2** [P] `RegistrarPagoPorFuera.tsx` y `tests/components/RegistrarPagoPorFuera.test.tsx`. **Hecho:**
  verde (R4, R5, R7, R17, R19).
- [x] **T4.3** [P] `PagosConfirmados.tsx` y `tests/components/PagosConfirmados.test.tsx`. **Hecho:** verde
  (R16–R20).
- [x] **T4.4** `page.tsx`: `<PagosConfirmados>` debajo de `<PagosPorConfirmar>`, con las actions ligadas. Se amplía
  `tests/integration/plataforma-empresa-detalle-page.test.tsx`. **Hecho:** verde (R16, R18).

## T5 — E2E (depende de T3 y T4)

- [x] **T5.1** `e2e/pago-plataforma-por-fuera.spec.ts` (design §9) y su entrada en el proyecto `dinero` de
  `playwright.config.ts`. **Hecho:** verde en local, con una base desechable nueva (R34).
- [ ] **T5.2** Correr:
  - `e2e/pago-plataforma-confirmacion.spec.ts`;
  - `e2e/pago-plataforma-sl45.spec.ts`;
  - `e2e/wallet.spec.ts`;
  - el grupo `dinero` entero.

  **Hecho:** verde, con la salida anotada en `progress/impl_SLT-143.md`.

## T6 — Documentación (depende de T1–T4)

- [x] **T6.1** `docs/architecture.md`, en «Facturas de la plataforma»: el pago por fuera, la anulación de la
  plataforma, la tabla nueva, la columna `por_fuera` y el trigger con su excepción. **Hecho:** la guardia del
  perfil en verde.
- [x] **T6.2** `docs/ayuda/oficina/wallet-caja.md`: los dos párrafos de R35, con `actualizado:`. **Hecho:** los
  tests que dispara `docs/ayuda/**` en verde, y un `grep` encuentra «Registrado por la plataforma» en la ayuda.
- [x] **T6.3** `progress/impl_SLT-143.md` con el mapa `R<n> → test` de R1 a R36.

## T7 — Cierre (depende de todo)

- [ ] **T7.1** `./init.sh` en verde.

## Archivos esperados

- `db/migrations/20261120130000_pago_plataforma_por_fuera/migration.sql`
- `db/migrations/20261120130000_pago_plataforma_por_fuera/down.sql`
- `db/schema.prisma`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/db/errores-pago-plataforma.ts`
- `scripts/verificar-rls-despliegue.ts`
- `lib/types/pago-plataforma.ts`
- `lib/interfaces/repositories/IPagoPlataformaConfirmacionRepository.ts`
- `lib/repositories/PagoPlataformaConfirmacionRepository.ts`
- `lib/interfaces/services/IPagoPlataformaConfirmacionService.ts`
- `lib/services/PagoPlataformaConfirmacionService.ts`
- `lib/actions/pagos-plataforma.ts`
- `lib/repositories/PagoPlataformaRepository.ts`
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `lib/types/estado-cuenta.ts`
- `lib/interfaces/repositories/ILibroCajaAutoriaRepository.ts`
- `lib/repositories/LibroCajaAutoriaRepository.ts`
- `lib/services/LibroCajaAutoriaService.ts`
- `components/shared/wallet/detalle-movimiento-panel-labels.ts`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/RepartoEntreFacturas.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PagosPorConfirmar.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PagosConfirmados.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/RegistrarPagoPorFuera.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`
- `docs/ayuda/oficina/wallet-caja.md`
- `docs/architecture.md`
- `progress/impl_SLT-143.md`
- `tests/integration/db/pago-plataforma-por-fuera.test.ts`
- `tests/integration/db/migracion-slt143-ida-y-vuelta.test.ts`
- `tests/integration/db/migracion-slt60-ida-y-vuelta.test.ts`
- `tests/integration/db/pago-plataforma-confirmacion.test.ts`
- `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts`
- `tests/unit/services/pago-plataforma-confirmacion-service.test.ts`
- `tests/unit/actions/pagos-plataforma.test.ts`
- `tests/unit/services/libro-caja-autoria-plataforma.test.ts`
- `tests/unit/descarga/wallet-caja-descarga-columnas.test.ts`
- `tests/unit/components/detalle-movimiento-panel-labels-plataforma.test.ts`
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`
- `tests/components/RegistrarPagoPorFuera.test.tsx`
- `tests/components/PagosConfirmados.test.tsx`
- `tests/components/PagosPorConfirmar.test.tsx`
- `tests/integration/plataforma-empresa-detalle-page.test.tsx`
- `e2e/pago-plataforma-por-fuera.spec.ts`
- `playwright.config.ts`

45 rutas: 28 de producción y docs, y 17 de tests. El archivo de textos de R36 ya estaba en la lista; R36 solo suma
su test. Hay dos condicionales: `migracion-slt60-ida-y-vuelta`, que solo
se toca si T0.5 lo pide, y `pago-plataforma-confirmacion`, que solo se corre (T1.6). Las dos se listan para que
`archivos-en-vuelo.mjs` las vea.

El tamaño queda por encima del tope de `gate.tamano_pr` (40 archivos y 1000 líneas de producción). El humano aceptó
un solo PR el 2026-11-19: unos 46 archivos y unas 1 200 líneas de producción. Las de tests se estiman en unas
1 800.
