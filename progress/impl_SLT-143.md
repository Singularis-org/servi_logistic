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

## T1 — La base (backend_dev, 2026-11-19)

### Archivos

- `db/migrations/20261120130000_pago_plataforma_por_fuera/migration.sql` (nuevo): tabla `pago_plataforma_anulacion`
  (RLS, política, `REVOKE` a `servi_app`, `…_inmutable`, `…_sin_cambio_de_empresa` y los dos `sme_*` generados con
  `tsx scripts/generar-misma-empresa.ts --faltantes`, pegados literales), columna `por_fuera`,
  `factura_plataforma_saldos` sin los anulados, `_pago_plataforma_aplicar`, `pago_plataforma_confirmar` sobre ella,
  `pago_plataforma_registrar_por_fuera`, `pago_plataforma_anular_confirmado` y el trigger
  `pago_plataforma_no_anular_confirmado` con la excepción. Sin `INSERT` de datos.
- `db/migrations/20261120130000_pago_plataforma_por_fuera/down.sql` (nuevo, a mano): aborta si
  `pago_plataforma_anulacion` tiene filas; repone los tres cuerpos copiados por `sed` de las líneas de
  `20261116120000` (literales); `DROP` de las tres funciones nuevas, de la tabla y de la columna.
- `db/schema.prisma`: modelo `PagoPlataformaAnulacion`, `porFuera` y las relaciones inversas en
  `PagoPlataformaConfirmacion`, `Organizacion` y `Usuario` (`@relation("PagoPlataformaAnulador")`).
- `lib/db/modelos-de-negocio.ts`: `PagoPlataformaAnulacion` en `MODELOS_DE_NEGOCIO`.
- `scripts/verificar-rls-despliegue.ts`: `TRIGGERS_MISMA_EMPRESA` 179 → 181, con su comentario.
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`: 92 → 93 tablas.
- `tests/fixtures/api-key-dependencias-usuario.ts`: `PagoPlataformaAnulacion.anulador` como `no_alcanzable`
  (`SOLO_OPERADOR`), igual que `PagoPlataformaConfirmacion.confirmador`. Lo pidió la guardia
  `api-key-dependencias-usuario` (censo de FK a `usuario`); no estaba en la lista de archivos del design.
- `tests/integration/db/migracion-slt143-ida-y-vuelta.test.ts` (nuevo, R33).
- `tests/integration/db/migracion-slt60-ida-y-vuelta.test.ts`: **sin cambios** (T0.5; corrido en verde).

### Decisiones fuera del spec

1. **`anulaciones PagoPlataformaAnulacion[]` (lista), no `anulacion PagoPlataformaAnulacion?`** (design §1.1). Prisma
   solo admite un 1 a 1 sobre un único de una columna, y el único es `(organizacion_id, confirmacion_id)`; es el
   mismo motivo por el que SLT-60 dejó `WalletMovimiento.confirmacionesPagoPlataforma` como lista. Efecto en T2/T3:
   los filtros de design §4.5 y §5.1 se escriben `confirmacion: { anulaciones: { none: {} } }` y
   `confirmacion: { anulaciones: { some: {} } }` (mismo significado).
2. **`organizacion_id = p_org` explícito** en `wallet_movimiento`, `wallet_comprobante`, `ajuste_caja_anulacion`,
   `pago_plataforma_confirmacion`, `pago_plataforma_aplicacion` y `pago_plataforma_anulacion` (hallazgo T0.2).
   Los `id` de `wallet_comprobante`, `ajuste_caja_anulacion` y del contra-asiento salen de `gen_random_uuid()`:
   esas columnas no tienen `DEFAULT`. El del pago es `p_pago_id` (lo genera el servicio).
3. **`created_at = now() AT TIME ZONE 'UTC'` explícito** en las cuatro filas que escriben las funciones, en vez
   del `DEFAULT CURRENT_TIMESTAMP` (dependería del TimeZone de la sesión; la base local está en
   `America/Bogota`). Mismo arreglo que 20261119120100.
4. **La constancia guarda `btrim(p_motivo)`**: el servicio ya manda el motivo recortado por zod; así el SQL a mano
   da lo mismo.
5. **Sin `prisma generate`.** El cliente generado vive en el `node_modules` compartido del checkout principal
   (`node_modules/.pnpm/@prisma+client@7.10.1_…/node_modules/.prisma/client`), y lo regeneró otra sesión hoy a las
   10:48 desde **otro** esquema (no tiene `PagoPlataformaConfirmacion`). Regenerarlo desde aquí pisaría el de los
   demás worktrees. **Bloquea T2/T3**: el repositorio necesita los tipos de `PagoPlataformaAnulacion` y `porFuera`.
   Lo decide el leader.

### Bases

- `servi_logistic_slt143`: `prisma migrate deploy` → `tsx scripts/db-rollback.ts` (el `down.sql`, sin error) →
  `prisma migrate deploy` otra vez, sin error. Queda aplicada.
- `servi_logistic_slt143_e2e`: `prisma migrate deploy`, aplicada.
- Humo a mano en `servi_logistic_slt143`, dentro de una transacción con `ROLLBACK` final (no quedó nada): con una
  factura cerrada de 300 000, registrar por fuera 100 000 con reparto que suma 99 999 → `SL060 suma_distinta` y 0
  movimientos; con 100 000 → `ok` (1 movimiento, 1 comprobante, `por_fuera = true`, disponible 200 000, 0 por
  confirmar); misma clave → `ya_registrado`; 200 000,01 → 23514 `wallet_movimiento_tope_pago_plataforma`;
  contra-asiento a mano como dueño → `SL060 pago_confirmado`; motivo «  » → `SL060 motivo_vacio`; anular →
  `ok` (2 movimientos, 1 constancia, 1 anulación, disponible y saldo 300 000); otra vez → `ya_anulado`; confirmar
  el anulado → `SL060 pago_no_encontrado`; `UPDATE` de la anulación como dueño → `SL060 inmutable`.

### Verificación

- `pnpm exec vitest --run tests/integration/db/migracion-slt143-ida-y-vuelta.test.ts` (con base): **1 archivo,
  6 passed**, 0 skipped.
- `pnpm exec vitest --run tests/integration/db/pago-plataforma-confirmacion.test.ts
  tests/integration/db/migracion-slt60-ida-y-vuelta.test.ts` (con base, T1.6 sin tocar el archivo): **2 archivos,
  26 passed**, 0 skipped.
- `eslint` sobre los archivos TS tocados: exit 0, sin avisos.
- `prisma validate`: válido.
- `pnpm run test:guardias`: **357 archivos verdes, 3 rojos, ninguno mío** (5392 passed, 13 failed, 1 skipped):
  - `tests/guards/guard-dependencias-declaradas-presentes.test.ts`: «faltan 56 de las 56» porque el worktree no
    tiene `node_modules` propio;
  - `tests/integration/db/zona-central-guarda-y-rastro.test.ts` (11) y
    `tests/integration/db/zona-guardado-conserva-costos.test.ts` (1): «The column `(not available)` does not exist»
    en `zonaDistrito.create` / `distritoZonaEspecial.create`, el cliente Prisma compartido generado desde otro
    esquema (punto 5).
  - Antes de tocar `tests/fixtures/api-key-dependencias-usuario.ts` también caía
    `api-key-dependencias-usuario.guardia.test.ts` (6) por la FK nueva a `usuario`: arreglado, verde.
- `pnpm run typecheck` (`tsc --noEmit`): **exit 2** con errores solo en archivos que T1 no toca
  (`lib/repositories/HistorialAccionRepository.ts:149,159`, `lib/types/historial-accion.ts:799`,
  `tests/integration/db/454/correccion-ramas-sql-real.test.ts:54`,
  `tests/integration/db/477-resolicitud-rechazado-sql-real.test.ts:103`): tipos del mismo cliente Prisma ajeno.
  El único cambio TS de producción de T1 es una entrada en un arreglo de `modelos-de-negocio.ts`.

Veredicto T1: la base está hecha y probada (migración, down, ida y vuelta, SLT-60 intacta); typecheck y 3
guardias quedan rojos por el cliente Prisma compartido y la falta de `node_modules`, no por T1.

## T3.2 — textos de la plataforma en la wallet (frontend_dev, 2026-11-19)

Archivos:
- `components/shared/wallet/detalle-movimiento-panel-labels.ts` (modificado): `ACCION_AUTOMATICA_LABEL.plataforma`
  «Registrado por la plataforma», `.plataforma_anulacion` «Anulado por la plataforma»; `textoRegistro` sin
  «Automático · » para las dos; `PLATAFORMA_ANULO = "la plataforma"`.
- `tests/unit/components/detalle-movimiento-panel-labels-plataforma.test.ts` (nuevo).

Mapa:
- R13 → `detalle-movimiento-panel-labels-plataforma.test.ts` «R13 — un pago registrado por fuera…»
- R36 → mismo archivo, «R36 — el contra-asiento…» y «R36 — la línea de anulación del pago original…»

Salida:
- `eslint` de los dos archivos: exit 0.
- `vitest --run` del test nuevo + DetalleMovimientoPanel, WalletLibroCaja458E, rechazo-nombre-466-app,
  wallet-labels, rechazo-nombre-466.guardia: **6 archivos, 93 passed**.
- Typecheck: depende de T3.1 (el `Record` está tipado por `RegistroDTO["automatico"]["accion"]`, que aún no
  incluye `"plataforma"` ni `"plataforma_anulacion"` en `lib/types/estado-cuenta.ts`).

Veredicto T3.2: textos y test hechos y verdes; el typecheck cierra cuando llegue T3.1.

## T2 y T3.1/T3.3 (backend_dev, 2026-11-19)

Cliente Prisma regenerado desde el worktree antes de verificar (`../../node_modules/.bin/prisma generate`; `pnpm exec`
no encuentra el binario desde el worktree). Grafo no consultado: Grep/Read.

### Archivos

- **T2.1** `lib/db/errores-pago-plataforma.ts` (códigos `pago_no_confirmado` y `motivo_vacio`; `esTopeDelPagoSuperado`),
  `lib/types/pago-plataforma.ts` (`AplicacionDeFacturaDTO`, `PagoConfirmadoDTO`, `PagosDeEmpresa.confirmados`,
  `MONTO_MAXIMO_PAGO_POR_FUERA`, `montoPagoPorFueraSchema`, `registrarPagoPorFueraSchema`, `anularPagoConfirmadoSchema`,
  los dos `Result`, textos).
- **T2.2** `IPagoPlataformaConfirmacionRepository` y `PagoPlataformaConfirmacionRepository` (`leer` con `confirmados`,
  `registrarPorFuera`, `anularConfirmado`); motivo de la excepción en `lib/db/excepciones-aislamiento.ts`.
- **T2.3** `IPagoPlataformaConfirmacionService` y `PagoPlataformaConfirmacionService` (`registrarPorFuera`, `anularConfirmado`).
- **T2.4** `lib/actions/pagos-plataforma.ts`: `registrarPagoPorFueraAction(organizacionId, formData)` y
  `anularPagoConfirmadoAction(organizacionId, { pagoId, motivo })`; el root pasa `buildComprobantes(prisma)` y
  `construirReglasPaisEmpresa(prisma)`.
- **T2.5** `PagoPlataformaRepository.sumaPagosConfirmados` y `EmpresasPlataformaRepository.cuentasConLaPlataforma` con
  `confirmacion: { anulaciones: { none: {} } }`.
- **T3.1** `lib/types/estado-cuenta.ts`, `ILibroCajaAutoriaRepository` (`marcasDeLaPlataforma`, `MarcasDeLaPlataforma`),
  `LibroCajaAutoriaRepository`, `LibroCajaAutoriaService` (`registro` y `anulacion`).
- Tests: `tests/unit/types/pago-plataforma-monto-por-fuera.test.ts` (nuevo),
  `tests/unit/services/pago-plataforma-confirmacion-service.test.ts`, `tests/unit/actions/pagos-plataforma.test.ts`,
  `tests/unit/services/libro-caja-autoria-plataforma.test.ts` (nuevo), `tests/unit/descarga/wallet-caja-descarga-columnas.test.ts`,
  `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts`, `tests/integration/db/pago-plataforma-por-fuera.test.ts` (nuevo).
- Ajustes fuera de la lista del design (necesarios):
  - `tests/unit/actions/deuda-plataforma.composition-root.test.ts` y
    `tests/unit/actions/empresas-plataforma.composition-root.test.ts`: afirman el `where` nuevo (T2.5 lo preveía);
  - `confirmados: []` en los fixtures de `tests/components/PagosPorConfirmar.test.tsx` y
    `tests/integration/plataforma-empresa-detalle-page.test.tsx` (solo el tipo, sin cambiar afirmaciones);
  - `tests/integration/db/pago-plataforma-confirmacion.test.ts:668`: `toEqual({ pagos: [], facturas: [] })` pasa a
    `toMatchObject`, porque la lectura gana `confirmados` (T1.6 decía «sin tocarlo»; es la única línea);
  - `tests/integration/db/migracion-slt143-ida-y-vuelta.test.ts:259` acota `table_schema = 'public'` (la guardia
    `catalogo-postgres-acota-esquema` lo pedía; venía de T1).

### Decisiones fuera del spec

1. **La fecha no se valida en el esquema de `lib/types/pago-plataforma.ts`.** Ese archivo llega a componentes cliente
   y no importa `lib/types/wallet.ts`, que arrastra `@prisma/client`. El esquema la deja como texto opcional y el
   servicio aplica `fechaMovimientoSchema(zona)` de `lib/types/wallet.ts` (la misma pieza, sin copiarla) dentro de
   `conEmpresa(org)`, con la zona del país de la empresa; el error va en `fecha`. Una fecha vacía del formulario es
   «sin fecha».
2. **El repositorio traduce el tope a `{ estado: "tope_superado" }`**, no a `rechazado`: el tope no es `SL060`.
3. **`esTopeDelPagoSuperado`**: `@prisma/adapter-pg` no conserva el nombre del constraint de un 23514. Se reconoce
   por el CONSTRAINT si viene, o por el mensaje literal del trigger («supera la deuda vigente de la empresa»), siempre
   con SQLSTATE 23514. Verificado contra la base en el paso R6 del test de integración.
4. **Contrato del `FormData`** (para frontend_dev): `claveIdempotencia`, `monto`, `fecha` (`YYYY-MM-DD`, vacía = hoy),
   `referencia`, `aplicaciones` como JSON `[{ "facturaId", "monto" }]` y `comprobante` opcional (un archivo de 0 bytes
   es «sin comprobante»). Los errores van en `monto`, `fecha`, `referencia`, `comprobante`, `aplicaciones` o
   `aplicaciones.<facturaId>`.
5. **Un archivo no válido** lo rechaza el borde (`leerComprobanteOpcional`); a quien no es superadmin le responde
   `forbidden`, no `validation_error` (R31).
6. **`ya_registrado` retira el comprobante** subido en ese envío (molde 458-B: `quedo` solo con `ok`).
7. **Hallazgo de T2.6, arreglado en `LibroCajaAutoriaRepository.anulaciones`.** La constancia de una anulación de la
   plataforma la firma el superadmin. La RLS de `usuario` se lo esconde a la empresa, y Prisma trae `anulador: null`
   aunque la relación sea obligatoria: `TypeError`, y la autoría del libro caía en INTERNAL. Ahora sale `por: null` y
   el servicio pone «la plataforma». `AjusteCajaAnulacionRepository.constanciasDe` tiene el mismo patrón, pero no tiene
   llamadores en `lib/` ni en `app/`: no se tocó.
8. **`LibroCajaAutoriaService` importa `PLATAFORMA_ANULO`** de `components/shared/wallet/detalle-movimiento-panel-labels.ts`
   (T3.2), como pide design §5.1.

### Tests (salida resumida)

- `vitest --run` de los 12 archivos tocados (unit e integración, base `servi_logistic_slt143`): **12 archivos, 247 tests
  verdes**, 0 skipped. `pago-plataforma-por-fuera` 20/20; `pago-plataforma-confirmacion` (SLT-60) 22/22;
  `empresas-plataforma-deuda-sl45` 8/8. Aparte: `migracion-slt143-ida-y-vuelta` + guardia de catálogo 13/13;
  `PagosPorConfirmar` + `plataforma-empresa-detalle-page` 59/59.
- `tsc --noEmit`: **exit 0**. `eslint` sobre los archivos tocados: **exit 0**.
- `vitest run guard`: 5402 passed, 3 failed, 1 skipped. Tras arreglar la consulta de catálogo quedan 2 rojos:
  - `guard-dependencias-declaradas-presentes` (conocido: `node_modules` enlazado);
  - `superficie-de-uso`: `registrarPagoPorFueraAction` y `anularPagoConfirmadoAction` aún no las importa nadie. Las liga
    `page.tsx` en **T4.4** (frontend_dev), y ahí se cierra.

### Mutaciones de design §8 (medidas y revertidas, contra `servi_logistic_slt143`)

Las SQL, con un script de una vez: `pg_get_functiondef`, reemplazo y ejecución; revertir es la definición guardada,
comprobada idéntica. La 4, editando el archivo y restaurándolo.

| # | Mutación | Rojos en `pago-plataforma-por-fuera.test.ts` |
|---|---|---|
| 1 | `factura_plataforma_saldos` sin el NOT EXISTS de la anulación | 2 (R21/R22/R26/R30, P5) |
| 2 | trigger `pago_plataforma_no_anular_confirmado` sin la excepción | 7 (R21…, R28/R36, R24 ×2, R27, P5, R32) |
| 3 | el trigger deja pasar siempre | 4 (R15, R29, R21…, R28/R36) |
| 4 | `sumaPagosConfirmados` sin el filtro | 2 (R21/R22/R26/R30, P5) |
| 5 | `_pago_plataforma_aplicar` sin la comprobación de la suma | 5 (R5, R8/R9, R11, R21…, R24) |

Tras revertir: 20/20 verde.

### Mapa R → test (T2 y T3)

En `tests/integration/db/pago-plataforma-por-fuera.test.ts`, salvo donde se dice otra cosa:
- R1, R2, R12, P6 → «R1, R2, R12, P6…»; R12 también «R12: ningún pago por fuera…».
- R3 → «R3, R6: C con la caja en 0…». R6 → «R6: 200 000,01…» y «R3, R6».
- R5 → «R5: un reparto…»; unit `pago-plataforma-confirmacion-service` «registrarPorFuera: la traducción».
- R7 → unit `pago-plataforma-confirmacion-service` «R7…» y `pago-plataforma-monto-por-fuera`.
- R8, R9 → «R8, R9…»; unit «el comprobante»; action `pagos-plataforma` «R1, R8», «R9», «R8».
- R10 → «R10…». R11 → «R11…». R15 → «R15…». R29 → «R29…». R27 → «R27…». R32 → «R32…».
- R13, R14 → «R13, R14…»; `libro-caja-autoria-plataforma`; `wallet-caja-descarga-columnas` «SLT-143 R13/R36».
- R16 (la lectura) → «R1…» (`confirmados`) y action «R16».
- R21, R22, R26, R30 → «R21, R22, R26, R30…» y «R21, P5»; `empresas-plataforma-deuda-sl45` «SLT-143 R26».
- R23, R25 → «R23, R25…»; unit `anularConfirmado`. R24 → los dos «R24».
- R28, R36 → «R28, R36…»; `libro-caja-autoria-plataforma`; `wallet-caja-descarga-columnas`.
- R31 → unit y action «R31».

Veredicto T2 y T3.1/T3.3: servidor y marca hechos, 247 tests verdes y 5/5 mutaciones muertas; queda rojo
`superficie-de-uso` hasta T4.4.

## T4 — Las pantallas del superadmin (frontend_dev, 2026-11-19)

### Archivos

- `app/(app)/plataforma/empresas/[organizacionId]/_components/RepartoEntreFacturas.tsx` (nuevo, T4.1): la tabla del
  reparto y su pie, sacados de `PagosPorConfirmar.tsx`. Recibe los errores ya mezclados (cliente + servidor).
- `.../_components/PagosPorConfirmar.tsx` (T4.1, T4.3): usa `RepartoEntreFacturas`; exporta `Comprobante` (con
  `Pick<…, "id" | "tieneComprobante">`) para que «Pagos confirmados» abra el comprobante igual (R20).
- `.../_components/RegistrarPagoPorFuera.tsx` (nuevo, T4.2) y `.../_components/PagosConfirmados.tsx` (nuevo, T4.3).
- `.../page.tsx` (T4.4): `<PagosConfirmados>` debajo de `<PagosPorConfirmar>`, con `registrarPagoPorFueraAction`,
  `anularPagoConfirmadoAction` y `verComprobantePagoPlataformaAction` ligadas con `.bind(null, organizacionId)`.
  Cierra la guardia `superficie-de-uso`.
- Tests: `tests/components/RegistrarPagoPorFuera.test.tsx` (nuevo), `tests/components/PagosConfirmados.test.tsx`
  (nuevo), `tests/integration/plataforma-empresa-detalle-page.test.tsx` (ampliado). `PagosPorConfirmar.test.tsx`
  sin tocar.

### Decisiones fuera del spec

1. **La zona de la empresa (P5) en `page.tsx`:** `leerZona` = `conEmpresa(organizacionId, () => zonaDelBorde())`,
   las dos piezas que ya existen en `lib/` (sin tocar `lib/`), en el mismo `Promise.all` y aislada como las otras
   lecturas. Si falla, `zona = null`: el campo de fecha va vacío y sin `min`/`max`, y la fecha la decide el servidor
   (vacía = hoy). El test de la página comprueba que la zona se lee dentro del contexto de la empresa de la URL.
2. **Fecha en el cliente:** con zona, la ventana `{ min, max }` se congela al abrir con
   `primerDiaMovimientoAdmisible(zona)` y `fechaCalendario(ahora, zona)`, el valor inicial es hoy en esa zona y al
   enviar se valida con `problemaDeFechaMovimiento(fecha, zona)` (los mismos textos que el servidor). El campo no
   lleva `required`: el contrato admite fecha vacía.
3. **Monto en el cliente:** `montoPagoPorFueraSchema` de `lib/types/pago-plataforma.ts` (la misma pieza que el
   servidor); el reparto solo se pinta y se propone con un monto válido. «Registrar pago» se deshabilita sin monto
   válido o con el reparto inválido (R5). La referencia vacía se avisa al enviar, sin llamar a la action.
4. **El placeholder de la referencia** es el de SL-45 (`DESCRIPCION_EGRESO_PLACEHOLDER.pago_plataforma` de
   `wallet-labels.ts`), importado, no copiado. El comprobante usa `ComprobanteCampo` de la wallet (mismo `accept` y
   tope).
5. **El reparto que viaja:** las facturas con monto escrito (también `"0.00"`; el servicio quita los ceros), como
   al confirmar en SLT-60.
6. **«Registrar pago hecho por fuera…» no se ofrece si la lectura falló** (`datos = null`): no hay facturas que
   repartir. Con `validation_error` sin clave `motivo`, el diálogo de anular pone el primer error bajo «Motivo».

### Tests (salida resumida)

- `vitest --run` de los 4 archivos de T4 (`RegistrarPagoPorFuera` 17, `PagosConfirmados` 18,
  `PagosPorConfirmar` 20, `plataforma-empresa-detalle-page` 46): **4 archivos, 101 tests verdes**.
- `eslint` sobre los 8 archivos tocados: exit 0. `tsc --noEmit` (tras `prisma generate` y `next typegen`): exit 0.
- `vitest run guard`: 5402 passed, 3 failed, 1 skipped. `superficie-de-uso` ya en verde (T4.4 liga las dos
  actions). Los 3 rojos:
  - `guard-dependencias-declaradas-presentes` (conocido del entorno: `node_modules` enlazado);
  - `descargas-por-registro` «ninguna pantalla usa directamente…» y `sin-estados-retirados`: **timeout de 20 s** del
    entorno (recorren el árbol entero). Solos: `sin-estados-retirados` verde; `descargas-por-registro` verde con
    `--testTimeout=120000` (9/9). No son del cambio.

Veredicto T4: las dos pantallas del superadmin hechas y ligadas en la página, 101 tests de T4 verdes.

### Mapa R → test (T4)

- R4 → `RegistrarPagoPorFuera` «SLT-143 R4 …» (propuesta y recálculo); `PagosConfirmados` «R17 … abre el formulario».
- R5 → `RegistrarPagoPorFuera` «SLT-143 R5 …» (botón deshabilitado; errores del servidor por factura y del pie).
- R7 → `RegistrarPagoPorFuera` «SLT-143 R7 …» (monto, referencia, errores de servidor por campo, ventana P5).
- R8, R10 → `RegistrarPagoPorFuera` «R1, R8, R10, R19 — el envío» (FormData, comprobante, misma clave).
- R16 → `PagosConfirmados` «SLT-143 R16 …»; página «R16: la sección va justo debajo…», «R16: sin confirmados…».
- R17 → `PagosConfirmados` «SLT-143 R17 …»; `RegistrarPagoPorFuera` «SLT-143 R17 …»; página «R17, P5 …».
- R18 → `PagosConfirmados` «SLT-143 R18 …»; página «R18: si la lectura da …».
- R19 → `RegistrarPagoPorFuera` «manda el FormData … refresca tras `ok`» y «dos envíos …» (`ya_registrado`);
  `PagosConfirmados` «con motivo … refresca tras `ok`» y los tres avisos.
- R20 → `PagosConfirmados` «SLT-143 R20 …».
- R21, R23–R25 (pantalla) → `PagosConfirmados` «SLT-143 R19, R21, R23–R25 — anular»; página «R21: «Anular…» …».

## Mapa R → test (T6.3, R1 a R36)

Lo comprobé con grep sobre los tests del diff `origin/dev...HEAD`. Abreviaturas de archivo:

- `porFuera` = `tests/integration/db/pago-plataforma-por-fuera.test.ts`
- `servicio` = `tests/unit/services/pago-plataforma-confirmacion-service.test.ts`
- `action` = `tests/unit/actions/pagos-plataforma.test.ts`
- `pagina` = `tests/integration/plataforma-empresa-detalle-page.test.tsx`
- `Registrar` = `tests/components/RegistrarPagoPorFuera.test.tsx`
- `Confirmados` = `tests/components/PagosConfirmados.test.tsx`
- `autoria` = `tests/unit/services/libro-caja-autoria-plataforma.test.ts`
- `labels` = `tests/unit/components/detalle-movimiento-panel-labels-plataforma.test.ts`
- `descarga` = `tests/unit/descarga/wallet-caja-descarga-columnas.test.ts`
- `migracion` = `tests/integration/db/migracion-slt143-ida-y-vuelta.test.ts`

| R | Test |
|---|------|
| R1 | `porFuera` «R1, R2, R12, P6: el superadmin registra por fuera 100 000 → caja 400 000, deuda 200 000…»; `servicio` «R1: con datos válidos, sin fecha ni comprobante, manda el pago normalizado…»; `action` «R1, R8: sin deps.service, sube el comprobante…»; `Registrar` describe «SLT-143 R1, R8, R10, R19 — el envío» |
| R2 | `porFuera` «R1, R2, R12, P6: …caja 400 000, deuda 200 000, disponible 200 000…» |
| R3 | `porFuera` «R3, R6: C con la caja en 0 registra por fuera 50 000, igual a lo disponible → ok y la caja queda en −50 000» |
| R4 | `Registrar` describe «SLT-143 R4 — el reparto propuesto» |
| R5 | `porFuera` «R5: un reparto que suma 99 999, la factura en curso o la de otra empresa → validation_error…»; `servicio` «R5: el monto mal formado de una factura va bajo su fila…» y «R5: los montos 0 se quitan; todo en 0 es validation_error…»; `action` «R5: un reparto que no es JSON es validation_error en aplicaciones…»; `Registrar` describe «SLT-143 R5 — el reparto tiene que cuadrar» |
| R6 | `porFuera` «R6: 200 000,01 con 200 000 disponibles → validation_error en monto…» y «R3, R6: …»; `servicio` «R6: el tope es validation_error en monto, con el mensaje de SLT-60» |
| R7 | `tests/unit/types/pago-plataforma-monto-por-fuera.test.ts` «R7: %s no es mayor que 0», «R7: %s no cabe en el libro», «R7: %j no tiene la forma de un importe…»; `servicio` «R7: el mayor monto que cabe en el libro pasa la validación» y describe «SLT-143 — registrarPorFuera: la fecha en la zona del país de la empresa (R7)»; `action` «R7: con fecha, la zona se lee con las reglas reales del país…»; `Registrar` describe «SLT-143 R7 — los errores de cada campo» |
| R8 | `porFuera` «R8, R9: con comprobante queda su fila con el pago; si el reparto falla, ni el pago ni el comprobante»; `servicio` «R8: se sube y se guarda con el pago…» y «R8: un archivo que el puerto no admite…»; `action` «R8: un campo de archivo vacío y una fecha vacía…» y «R8: un archivo de un tipo no admitido…»; `Registrar` «sin comprobante no manda el campo (R8)» |
| R9 | `porFuera` «R8, R9: …»; `servicio` «R9: si la base lanza, el archivo se retira y el error se propaga» y «R9: si el almacenamiento falla, comprobante_no_guardado…»; `action` «R9: si la base rechaza por el tope, el archivo subido se borra…» |
| R10 | `porFuera` «R10: el mismo registro con la misma clave → ya_registrado, y nada escrito»; `servicio` «R10: ya_registrado llega tal cual»; `Registrar` «dos envíos del mismo diálogo llevan la misma clave (R10)» |
| R11 | `porFuera` «R11: un pago desde la wallet y uno por fuera de 100 000 a la vez con 190 000 disponibles → esperan el candado…» |
| R12 | `porFuera` «R12: ningún pago por fuera es un pago por confirmar» y «R1, R2, R12, P6: …» |
| R13 | `porFuera` «R13, R14: en la wallet, el pago por fuera dice «plataforma» sin nombre ni id…»; `autoria` «R13: el pago registrado por la plataforma dice «plataforma» en Registró…», «R13: un pago por fuera aún vigente lleva la marca…» y «R13, R36: ninguna fila…»; `labels` «R13 — un pago registrado por fuera dice «Registrado por la plataforma»…»; `descarga` «SLT-143 R13/R36: «Registró» dice…» |
| R14 | `porFuera` «R13, R14: …uno de la empresa confirmado, el nombre»; `autoria` «R14: un pago registrado por la empresa y confirmado conserva el nombre…» |
| R15 | `porFuera` «R15: A intenta anular el pago por fuera → forbidden, y nada escrito» |
| R16 | `porFuera` «R1, R2, R12, P6» (lee `confirmados`); `action` «R16: mapea los confirmados del jsonb al DTO…»; `Confirmados` describe «SLT-143 R16 — la lista de pagos confirmados»; `pagina` «R16: la sección va justo debajo de «Pagos por confirmar»…» y «R16: sin confirmados, la sección dice «No hay pagos confirmados»» |
| R17 | `Confirmados` describe «SLT-143 R17 — «Registrar pago hecho por fuera…»»; `Registrar` describe «SLT-143 R17 — sin facturas cerradas con saldo»; `pagina` «R17, P5: el registro por fuera va ligado a la empresa…» |
| R18 | `Confirmados` describe «SLT-143 R18 — la lectura falló»; `pagina` «R18: si la lectura da %s, las dos secciones dicen su error y el plan se pinta igual» |
| R19 | `Registrar` describe «SLT-143 R1, R8, R10, R19 — el envío»; `Confirmados` describe «SLT-143 R19, R21, R23–R25 — anular» |
| R20 | `Confirmados` describe «SLT-143 R20 — el comprobante» |
| R21 | `porFuera` «R21, R22, R26, R30: el superadmin anula el pago por fuera con motivo…» y «R21, P5: anular un pago de la empresa ya confirmado → el mismo efecto…»; `servicio` «R21: pasa la empresa, el pago, el motivo recortado…»; `action` «R21: sin deps.service, llama a la función de la base…»; `Confirmados` describe «SLT-143 R19, R21, R23–R25 — anular»; `pagina` «R21: «Anular…» llama a la action con la empresa ligada…» |
| R22 | `porFuera` «R21, R22, R26, R30: …la caja y la deuda vuelven en 100 000, lo disponible sube…» |
| R23 | `porFuera` «R23, R25: …motivo de espacios → validation_error…»; `servicio` «R23: un motivo %s es validation_error en motivo…» y «R23: motivo_vacio de la base…»; `Confirmados` describe «SLT-143 R19, R21, R23–R25 — anular» |
| R24 | `porFuera` «R24: anular otra vez → ya_anulado, y nada escrito» y «R24: dos anulaciones a la vez del mismo pago → esperan el candado…»; `servicio` «R24, R27: ya_anulado llega tal cual» |
| R25 | `porFuera` «R23, R25: anular uno por confirmar → no_confirmado; de otra empresa o inexistente → not_found…»; `action` «R25: el rechazo SL060 pago_no_confirmado es no_confirmado»; `Confirmados` describe «SLT-143 R19, R21, R23–R25 — anular» |
| R26 | `porFuera` «R21, R22, R26, R30: …»; `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts` «SLT-143 R26: el superadmin anula el pago confirmado de A → «Pagado» y la deuda vuelven en 300,00…» |
| R27 | `porFuera` «R27: confirmar el pago anulado por la plataforma → not_found, y nada escrito» y «R24: anular otra vez → ya_anulado…»; `servicio` «R24, R27: ya_anulado llega tal cual» |
| R28 | `porFuera` «R28, R36: en la wallet, el contra-asiento dice «Anulado por la plataforma» y el pago anulado, «la plataforma» con el motivo» |
| R29 | `porFuera` «R29: el contra-asiento del pago por fuera escrito a mano, sin la anulación de la plataforma → SL060 como dueño y como servi_app» |
| R30 | `porFuera` «R21, R22, R26, R30: …» (las cifras, el número y el estado de la factura no cambian) |
| R31 | `servicio` «R31: el rol %s recibe forbidden al registrar y al anular, sin leer ni escribir» y «R31: sin sesión, forbidden aunque la entrada sea inválida»; `pagina` «R31: un rol de empresa no lee la zona ni los pagos (notFound antes de leer)» |
| R32 | `porFuera` «R32: B lee solo sus anulaciones de la plataforma; otra empresa no ve nada; no puede escribirlas (42501); y ni el dueño las cambia (SL060)» |
| R33 | `migracion` «R33: no inserta datos», «R33: el pago confirmado sigue confirmado, sin la marca y sin anulación», «R33: el down.sql aborta sin tocar nada si hay una anulación de la plataforma» y «R33: sin anulaciones, el down.sql deja el esquema como antes y repone las funciones de SLT-60» |
| R34 | `e2e/pago-plataforma-por-fuera.spec.ts` (escenarios de design §9). Lo escribe T5.1 en paralelo; al cerrar T6.3 el archivo todavía no existía |
| R35 | `tests/unit/ayuda/wallet-caja-slt143-r35.test.ts`: «R35: el pago registrado por la plataforma lleva marca, baja la caja y la deuda, y la empresa no lo anula», «R35: la plataforma puede anular un pago confirmado; el monto vuelve a la caja y la deuda sube» y «R35: el frontmatter dice `actualizado:`…». Mutación comprobada: quitar «Registrado por la plataforma» de la ayuda lo pone rojo |
| R36 | `porFuera` «R28, R36: …»; `autoria` «R36: el contra-asiento de una anulación de la plataforma dice «plataforma_anulacion»…», «R36: la línea de anulación del pago original la firma «la plataforma»…» y «R36: una anulación hecha por la empresa (SL-45) conserva el nombre…»; `labels` «R36 — el contra-asiento de la anulación dice «Anulado por la plataforma»…» y «R36 — la línea de anulación del pago original nombra a la plataforma»; `descarga` «SLT-143 R13/R36: …» |

Veredicto T6.3: 34 de 36 requisitos tienen un test real. R34 depende del E2E de T5.1, que está en curso, y R35 no tiene test porque es texto de ayuda.

## T5 — E2E (frontend_dev, 2026-11-19)

Archivos:
- `e2e/pago-plataforma-por-fuera.spec.ts` (nuevo, T5.1): design §9, serial; pasos 2–6 (maestro anota caja y
  deuda; superadmin registra por fuera con el reparto propuesto; la wallet baja deuda y caja y marca «Registrado por
  la plataforma» con la referencia; el maestro no lo anula; el superadmin lo anula con motivo; vuelven las cifras,
  el contra-asiento dice «Anulado por la plataforma» y el detalle del pago anulado «por la plataforma» + el motivo).
- `playwright.config.ts`: `pago-plataforma-por-fuera` en el proyecto `dinero`.

Mapa: R34, R36 (en la wallet) → `e2e/pago-plataforma-por-fuera.spec.ts` (tests 2–6).

Salida: `tsc --noEmit` exit 0; `eslint` de los dos archivos exit 0 (binarios de `../../node_modules/.bin`, tras
`prisma generate`).

E2E escrito, no corrido en local por decisión del leader (poca RAM); lo corre el CI. T5.2 (confirmación, sl45,
wallet, grupo dinero) delegado al CI.

Veredicto T5.1: E2E escrito y en `dinero`, typecheck y lint verdes; la ejecución queda al CI.

## T7.1 — gate local (2026-11-19)

`./init.sh` (rápido) con una copia temporal de `arnes.config.json` (cupo fullstack 12, restaurada con
`git checkout`; nunca commiteada) y `NODE_OPTIONS=--max-old-space-size=8192`:

- Verdes: dependencias (56/56, tras enlazar `node_modules` del worktree al del checkout principal con un junction;
  antes tenía solo `.cache/`), validador de features, perfil 6/6, cliente de Prisma, tipos de ruta, **typecheck**,
  **lint**.
- Avisos: tamaño del PR (49/40 archivos, 2112/1000 de producción, 3341/3000 de tests), aceptado por el humano
  («Un solo PR», renovado); `node_modules` enlazado con lock más nuevo.
- **Rojo de entorno, no del cambio:** `test:rapido` → `tests/integration/db/caja-tesoreria-migration.test.ts`,
  4 tests (R45/R46). El archivo no se toca en la rama; lo arrastra el disparador de `db/`. Causa medida: el
  `node_modules` compartido tiene `@prisma/client` y `@prisma/adapter-pg` **7.10.1**, y `pnpm-lock.yaml` fija
  **7.8.0**. En 7.10.1 el error de Postgres ya no viene en `error.cause.code` (llega `cause` nulo, con el 23514 solo
  en el mensaje), y el test lee el SQLSTATE de `cause.code`. La base sí rechaza con `23514` y
  `wallet_movimiento_tipo_categoria_check`. El CI instala con `--frozen-lockfile` (7.8.0), así que allí no
  aplica. Sin arreglar, como pidió el leader; queda para quien reinstale el checkout principal.
- `pnpm run test:guardias` aparte: 360 archivos, 5405 tests en verde, 1 skipped.

## T5.2 — E2E

Delegados al CI por decisión del leader (máquina con poca RAM): `pago-plataforma-por-fuera`,
`pago-plataforma-confirmacion`, `pago-plataforma-sl45`, `wallet` y el grupo `dinero` entero. Constancia exigida
por `docs/perfil-agentes.md > E2E en local antes del PR`: no se corrieron en local.

## Review ronda 1 (backend_dev, 2026-11-19)

### B1 — el id del superadmin llegaba a la wallet de la empresa (R13, R36)

Grep de los lectores de `registradoPor` del DTO de la wallet (`WalletMovimientoDTO`) en `app/`, `components/` y
`lib/`: **nadie lo lee**. Las apariciones de `registradoPor` en `lib/services/` son de `CrearMovimientoInput`
(escritura: `AjusteCajaService`, `EgresoCajaAnulacionService`, `WalletService`, `CajaBackfillTesoreriaService`) o
de otros tipos (`LibroCajaAutoriaRepository`, `EstadoCuentaRepository`, feeds); en `app/(app)/wallet/` solo hay un
comentario de `wallet-ledger-descarga-columnas.ts` que ya decía que la descarga no lo saca. «Registró» sale de
`LibroCajaAutoriaService`, que da nombres.

Arreglo elegido: **quitar `registradoPor` del DTO entero** (`lib/types/wallet.ts`) y de su proyección
(`toDTO` en `lib/repositories/WalletMovimientoRepository.ts`). Así no viaja en ningún asiento, tampoco en los de
usuarios de la empresa (nadie lo pintaba). El SELECT en SQL de `listar` lo sigue leyendo (el tipo de fila es el
de Prisma), pero no sale del repositorio.

Otros caminos revisados: el kardex y su versión con detalle, y el detalle de la fila (`verDetalleDeMovimientoAction`)
proyectan el mismo DTO o no llevan autor; «A quién» (`quienesDelLibroCajaAction`) da contrapartes, no autores. El
test nuevo los serializa todos.

Archivos:
- `lib/types/wallet.ts`, `lib/repositories/WalletMovimientoRepository.ts` (el arreglo).
- `tests/integration/db/pago-plataforma-por-fuera.test.ts`: test nuevo «R13, R36 (B1): ni el listado, ni la
  descarga (kardex), ni el detalle de fila llevan el id o el nombre del superadmin». Con el pago por fuera y su
  contra-asiento ya escritos, serializa la respuesta de `listarMovimientosAction`, `libroCajaKardexAction`,
  `libroCajaKardexConDetalleAction`, `verDetalleDeMovimientoAction` (del pago y del contra-asiento) y
  `quienesDelLibroCajaAction`, como el maestro de A; exige que ninguna sea un error, que no contengan ni el id ni el
  nombre del superadmin y que las dos filas estén en el listado y en los dos kardex.
- 30 archivos de `tests/`: los fixtures pierden la línea `registradoPor` del DTO (el typecheck los marcaba como
  propiedad desconocida). `libro-caja-filtro-a-quien.test.ts` deja de comparar ese campo, que ya no existe;
  `wallet-movimiento-repository.test.ts` espera el DTO sin él; `wallet-sin-uuid.guardia.test.tsx` pierde la
  constante `USUARIO`, que solo usaba ese campo.

Mapa: R13, R36 → además, `porFuera` «R13, R36 (B1): …».

Mutación: con `registradoPor: r.registradoPor` repuesto en `toDTO`, el test nuevo sale **rojo**
(`expected { cual: 'listado', id: true } to deeply equal { cual: 'listado', id: false }`, 1 failed | 20 passed);
restaurado, verde.

Verificación (`NODE_OPTIONS=--max-old-space-size=8192`, tras `pnpm exec prisma generate`):
- `pnpm run typecheck`: exit 0.
- `eslint --max-warnings=0` de los `.ts/.tsx` tocados: exit 0, salvo `tests/unit/services/wallet-detalle-movimiento.test.ts`,
  que ya traía 6 avisos de `no-unused-vars` en HEAD (no son de esta línea; 0 errores).
- `vitest --run` sobre los 64 archivos afectados (los tocados, el de B1 y los de `tests/unit` que importan
  `WalletMovimientoRepository`): 64/64 archivos, 1449/1449 tests. `pago-plataforma-por-fuera` contra
  `servi_logistic_slt143`: 21/21, 0 skipped.

Veredicto B1: el DTO del libro ya no lleva el id de nadie; el test lo prueba en las cinco lecturas y mata la mutación.
