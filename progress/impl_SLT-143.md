# impl SLT-143 «El superadmin registra un pago hecho por fuera y anula un pago confirmado»

> Bitácora del implementer. Bases de la feature: `servi_logistic_slt143` (integración) y
> `servi_logistic_slt143_e2e` (E2E), en el Postgres local (`localhost:5432`, PostgreSQL 16.1).

## Entorno (2026-11-19, backend_dev, tanda T0)

- El `.env` del checkout principal apunta a `localhost:5432/servi_logistic_simprod` y además trae
  `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` de un proyecto que la guardia `recursos-origen-fuera` reconoce como de
  la app de origen (su hash coincide con la primera entrada `supabase-ref`; es la deuda D25 de `progress/deudas.md`).
  **No se usó.** El worktree tiene su propio `.env` (ignorado por git, `git check-ignore .env` lo confirma) con **solo**
  `DATABASE_URL` a `servi_logistic_slt143`: sin Supabase. Lo leen `prisma.config.ts` y
  `tests/integration/db/_postgres-real.ts` (los dos con `process.loadEnvFile()`).
- Las dos bases se crearon nuevas (`CREATE DATABASE`) y se migraron con `prisma migrate deploy`, la de E2E pasando
  `DATABASE_URL` por entorno. Las dos con `pnpm run db:seed` (`scripts/seed-catalogos.ts`).
  - `servi_logistic_slt143`: 333 migraciones aplicadas de 333 en disco, 0 pendientes, la última
    `20261119120100_cobro_plataforma_ocurrido_utc`; `rol` con 7 filas.
  - `servi_logistic_slt143_e2e`: igual (333/333, 0 pendientes, misma última, `rol` 7).
- El worktree no tiene `node_modules`: los binarios salen de `../../node_modules/.bin/` (prisma, tsx).

## T0 — comprobaciones

### T0.1 — Timestamp de la migración

- Última migración de `origin/dev` (`bd43f7ae`, 2026-11-19): `20261119120100_cobro_plataforma_ocurrido_utc`.
  `20261120120000` sigue siendo posterior: **no hay que renombrar** por `dev`.
- Ninguna migración posterior a `20261116120000` redefine `factura_plataforma_saldos`, `pago_plataforma_confirmar`,
  `pago_plataforma_no_anular_confirmado`, `pago_plataforma_por_confirmar` ni `pago_plataforma_disponible_de`: los
  cuerpos «literales de `20261116120000`» que repone el `down.sql` (design §3.7) siguen siendo los vigentes.
- **Aviso:** la rama `origin/feature/SLT-214-planes-beneficios-texto` (SLT-214 «Planes: beneficios de texto con
  ícono», commit `d8485a5b`) ya trae `db/migrations/20261120120000_plan_beneficio`. Mismo timestamp. Por nombre,
  `…_pago_plataforma_por_fuera` ordena antes que `…_plan_beneficio`; si SLT-214 llega antes a `dev`, la nuestra
  quedaría aplicada fuera de orden en las bases compartidas. Pendiente de decisión del leader.

### T0.2 — Qué escribe hoy la anulación de un egreso

`EgresoCajaAnulacionService.anular` (`lib/services/EgresoCajaAnulacionService.ts:75-119`), en una transacción:

1. **Constancia** — `AjusteCajaAnulacionRepository.anularEgreso` (`lib/repositories/AjusteCajaAnulacionRepository.ts:88-114`):
   `ajuste_caja_anulacion.createMany({ movimientoId, motivo, anuladoPor }, skipDuplicates)` (líneas 92-95). Si
   `count === 0` → `ya_anulado` (línea 96). El único que lo decide es `movimiento_id @unique`
   (`db/schema.prisma:2857`). `created_at` por `DEFAULT now()`; `organizacion_id` por el `DEFAULT` de la empresa de
   la transacción (`schema.prisma:2865`). Hay `CHECK` de motivo no vacío (`schema.prisma:2858`).
2. **Historial** — `appendAccion` con `accion = egreso_caja_anulado`, `entidad_tipo = wallet_movimiento`, la
   etiqueta por categoría, el monto y el actor congelado (líneas 101-112).
3. **Contra-asiento** — `WalletMovimientoRepository.crearMovimientos` (`lib/repositories/WalletMovimientoRepository.ts:190-214`,
   `createMany … skipDuplicates`) con (service, líneas 94-105):
   `tipo = ingreso`, `categoria = ingreso_ajuste`, `monto = egreso.monto`, `origen_tipo = gasto`,
   `origen_id = egreso.id`, `descripcion = 'Anulación de: ' || COALESCE(descripcion, nombreDelEgresoAnulable(categoria))`,
   `registrado_por = actor`, `fecha_movimiento = ahora()`. Sin `id` explícito ni `clave_idempotencia`.
   Para `egreso_pago_plataforma` la caída es «Pago a la plataforma» (`lib/utils/egreso-anulable.ts:20`): coincide con
   design §3.4.
4. **El único que da `escritas === 0`** (línea 108) es `wallet_movimiento_origen_categoria_uq`
   `("organizacion_id", "origen_tipo", "origen_id", "categoria") WHERE "origen_id" IS NOT NULL`
   (`db/migrations/20261023090000_unicos_por_empresa/migration.sql:52-54`).
5. El rechazo del pago confirmado (`esPagoConfirmadoError` → `forbidden`, línea 115) sale del trigger de §3.5.

Notas para T1.1:
- La función de §3.4 corre como dueño y quizá sin `app.organizacion_id`: tiene que escribir `organizacion_id = p_org`
  **explícito** en `ajuste_caja_anulacion`, `wallet_movimiento` y `pago_plataforma_anulacion` (las tres lo toman del
  `DEFAULT` de la sesión).
- El historial `egreso_caja_anulado` (punto 2) **no** se copia: P6 deja fuera el historial de estas dos operaciones
  (requirements.md:19, design §3.3 paso 6). Es coherente con el design, se anota para que no parezca un olvido.

### T0.3 — Triggers de `wallet_movimiento` y de `wallet_comprobante`

Comprobado en el código y en la base viva (`pg_trigger` de `servi_logistic_slt143`, sin los internos):

| Tabla | Trigger | Función | Origen |
|---|---|---|---|
| `wallet_movimiento` | `sme_wallet_movimiento_registrado_por_a3b13386` | `verificar_misma_empresa('usuario','registrado_por','id')` | `20261022130300_misma_empresa_en_fk/migration.sql:449-450` |
| `wallet_movimiento` | `wallet_movimiento_sin_cambio_de_empresa` | `impedir_cambio_de_empresa` | mismo archivo, `:568` |
| `wallet_movimiento` | `wallet_movimiento_tope_pago_plataforma` | tope contra lo disponible | `20261024140000_pago_plataforma_blindaje/migration.sql:93-95`; cuerpo vigente en `20261116120000_pago_plataforma_confirmacion/migration.sql:314-345` |
| `wallet_movimiento` | `pago_plataforma_no_anular_confirmado` | bloqueo de la anulación | `20261116120000_pago_plataforma_confirmacion/migration.sql:352-370` |
| `wallet_comprobante` | `sme_wallet_comprobante_subido_por_a473a836` (+ otros 3 `sme_*` y `…_sin_cambio_de_empresa`) | `verificar_misma_empresa('usuario','subido_por','id')` | `20261022130300_misma_empresa_en_fk/migration.sql:443-444` |

- **Caja suficiente: ningún trigger la exige (R3 se cumple).** El tope solo compara `NEW.monto` con
  `pago_plataforma_disponible_de(org)` (facturas cerradas − por confirmar), no con el saldo de la caja. Los `CHECK` de
  `wallet_movimiento` son tipo↔categoría y similares; ninguno mira saldos.
- **El superadmin pasa el trigger de misma empresa.** `verificar_misma_empresa`
  (`20261022130300_misma_empresa_en_fk/migration.sql:11-31`) hace `IF v_org_ref IS NULL THEN RETURN NEW;` (línea 24,
  comentario «usuario superadmin (D15)»), y `usuario.organizacion_id` es nullable en la base. Ninguna migración
  posterior la redefine. Vale para `wallet_movimiento.registrado_por`, `wallet_comprobante.subido_por`,
  `ajuste_caja_anulacion.anulado_por` (`:54`) y el futuro `pago_plataforma_anulacion.anulado_por`.
- El tope corre `WHEN (categoria = 'egreso_pago_plataforma' AND tipo = 'egreso')`, toma el candado
  `pago_plataforma:<org>` y deja pasar una clave repetida (para que la descarte el `ON CONFLICT`). Exige
  `NEW.organizacion_id` no nulo (otra razón para escribirlo explícito).
- **Sin contradicción con el design.**

### T0.4 — Esquemas zod y selector de fecha

Rutas:
- **Monto (SL-45):** `montoPositivoSchema`, `lib/types/wallet.ts:674-689` (string, > 0, hasta 2 decimales). Lo usa
  `registrarEgresoAdministrativoSchema` (`lib/types/wallet.ts:967-975`).
- **Fecha (SL-45 R12):** `fechaMovimientoSchema(zona)`, `lib/types/wallet.ts:753`; sus reglas en
  `problemaDeFechaMovimiento` (`:732`) y `primerDiaMovimientoAdmisible` (`:718`).
- **Referencia (SL-45):** es el campo `descripcion` del egreso, rotulado «Referencia del pago»
  (`app/(app)/wallet/_components/wallet-labels.ts:577`, placeholder en `:583`). Su esquema:
  `descripcion: z.string().trim().min(1, "La descripcion es obligatoria.")` (`lib/types/wallet.ts:971`).
- **Motivo (458-B):** `anularEgresoCajaSchema`, `lib/types/wallet-anulacion.ts:92-97`:
  `motivo: z.string().trim().min(1, "El motivo de la anulación es obligatorio.")`.
- **Selector de fecha del diálogo de la wallet:** no es un componente propio. Es `<Input type="date" min max>`
  (`@/components/ui/input`) dentro de `<FormField>` (`@/components/shared/FormField`), en
  `components/shared/wallet/RegistrarMovimientoDialog.tsx:795-813`. La ventana `{ min, max }` se congela al abrir
  (`:186-187`, `:244`) con `primerDiaMovimientoAdmisible(ZONA_CR)` y hoy en CR; la validación del cliente usa
  `problemaDeFechaMovimiento(fecha, ZONA_CR)` (`:294`).

**Contradicciones con design §4.1** (no arregladas; ver el informe):
1. `importeDelLibroSchema` **no existe**. SL-45 usa `montoPositivoSchema`, que **no acota las cifras enteras**; su
   «no cabe en `DECIMAL(12,2)`» lo paraba el tope del servicio antes del `INSERT` (`progress/impl_SL-45.md:367-370`).
   En la función SQL de §3.3 no sería así: un monto > 9 999 999 999,99 desborda `wallet_movimiento.monto`
   (`DECIMAL(12,2)`, `db/schema.prisma` modelo `WalletMovimiento`) al formar la fila, **antes** del trigger del tope,
   y saldría `22003 numeric_value_out_of_range`, sin traducir. Además `IMPORTE_REPARTO`
   (`lib/types/pago-plataforma.ts:43`) admite 12 cifras enteras (`numeric(14,2)`), más que el libro.
2. La referencia de SL-45 **no tiene `max`**: `.max(<el de SL-45>)` no tiene valor. El `LIQUIDACION_REFERENCIA_MAX = 60`
   (`lib/types/liquidacion.ts:73`) es del campo lateral `referencia` (`lib/types/wallet-laterales.ts:39-42`), que es
   otro campo, opcional.
3. El motivo de 458-B **no tiene `max`**: «el tope del motivo de 458-B» no existe.
4. Menor, para el frontend: la ventana de fecha del diálogo de la wallet se calcula en `ZONA_CR`, mientras que el
   servidor de SLT-143 la valida en la zona del país de la empresa (design §2).

### T0.5 — Cómo aplica su `down` `migracion-slt60-ida-y-vuelta`

`tests/integration/db/migracion-slt60-ida-y-vuelta.test.ts`:
- crea una base propia `slt60_iv_<uuid>` (`:53`, `:177`), aplica **solo las anteriores** a `20261116120000` con
  `aplicarMigracionesHasta(db, M)` (`:181`; el helper corta en `carpeta >= tope`,
  `tests/integration/db/_fixtures/ida-y-vuelta-32.ts:203-210`), siembra, aplica la suya, corre su `down.sql` (`:221`)
  y la reaplica (`:235`);
- su caso de disco solo exige que vaya detrás de su `PREVIA` (`:56-63`), no que sea la última.

Nunca ve `20261120120000`, así que nuestra migración no lo toca. **T1.5 no necesita ajustarlo**; queda en la lista
de archivos solo para `archivos-en-vuelo.mjs`.

### T0.6 — La `descripcion` del pago en «Detalle»

Confirmado: la referencia (la `descripcion`) llega a los tres sitios por `textoDeOrigen`
(`components/shared/wallet/origen-movimiento.ts:33-39`: `origen · descripcion`):
- **Descarga:** `detalleDeCaja` (`app/(app)/wallet/_components/libro-caja-kardex.ts:35-41`), usado por `filaBaseCaja`
  (`app/(app)/wallet/_components/wallet-ledger-descarga-columnas.ts:72`) y por la hoja «Detalle por guía»
  (`WalletModule.tsx:291`).
- **Tabla:** `MovimientoCelda` → `<OrigenMovimiento>` (`app/(app)/wallet/_components/WalletLedger.tsx:193-205`).
- **Detalle de la fila:** `VerMovimientoCaja.tsx:72-73` (`motivo: m.descripcion` y
  `origen: <OrigenMovimiento …/>`).
- «Registró» sale de `textoRegistro` en los tres (`WalletLedger.tsx:189`, `wallet-ledger-descarga-columnas.ts:76`,
  `DetalleMovimientoPanel.tsx:28`), como dice design §5.

### T0.7 — `node scripts/archivos-en-vuelo.mjs --candidata SLT-143`

Salida (exit 0). Choques con features **de otra persona** (Carlos Restrepo):
- SLT-55 «Valor propio del mensajero»: `docs/architecture.md`, `playwright.config.ts`.
- SLT-61 «Endurecer search_path de las funciones SECURITY DEFINER»: `docs/architecture.md`.
- SLT-77 «Tope de intentos de entrega configurable por empresa»: `db/schema.prisma`, `docs/architecture.md`,
  `playwright.config.ts`.

Avisos de mismo dueño (Camilo), sin choque: SLT-43, 44, 45, 46, 47, 48, 65, 71, 81, 89, 125, 136 y 199 (sobre todo
`db/schema.prisma`, `lib/db/modelos-de-negocio.ts`, `lib/db/excepciones-aislamiento.ts`, `docs/architecture.md`,
`scripts/verificar-rls-despliegue.ts`, `tests/unit/guards/rls-por-empresa.guardia.test.ts`, `playwright.config.ts`;
SLT-136 también `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`; SLT-199 también
`tests/integration/plataforma-empresa-detalle-page.test.tsx`). 21 features de Carlos tienen la rama sin publicar: no
se pudo comprobar (SLT-88, 103, 106, 108, 110, 112, 113, 114, 124, 133, 134, 137, 139, 141, 188, 190, 192, 200, 203,
212, 213).

El choque con SLT-61 importa por el contenido, no solo por el archivo: endurece el `search_path` de las funciones
`SECURITY DEFINER`, y las nuestras ya usan `public, pg_temp` (design §3).

## Decisiones fuera del spec

Las cinco que siguen las decidió el **leader** (decisiones técnicas, tras T0, 2026-11-19); design y tasks ya las
recogen:

1. **Tope del monto (P1 a):** esquema nuevo `montoPagoPorFueraSchema` en `lib/types/pago-plataforma.ts`, tope
   9 999 999 999,99, sacado de `wallet_movimiento.monto` `DECIMAL(12,2)`, con test.
2. **Referencia (P2 a):** sin tope, como la `descripcion` de SL-45.
3. **Motivo de anulación (P3 a):** sin tope, como 458-B.
4. **Migración (P4 a):** renombrada a `20261120130000_pago_plataforma_por_fuera`, para no quedar fuera de orden si
   `20261120120000_plan_beneficio` (SLT-214) entra antes a `dev`.
5. **Fecha (P5 a):** el diálogo nuevo calcula la ventana de días en la zona del país de la empresa, igual que el
   servidor (el de la wallet usa la de Costa Rica).

Choque con SLT-55, SLT-61 y SLT-77: aceptado por el humano. Si alguna entra antes a `dev`, se mezcla `dev` y se
resuelve.
