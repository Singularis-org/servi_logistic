# SLT-226 «Cobro automático: modelo del cobro e idempotencia» — tasks

> Design: `design.md`. Requisitos: `requirements.md` (R1–R39; R30–R39 son la enmienda del 2026-11-20, tanda T8).
> - P1–P5 están cerradas (humano, 2026-11-20; `requirements.md > Decisiones cerradas`). Por la decisión P5 va
>   todo en un solo PR.
> - `[P]` = se puede hacer en paralelo con las demás `[P]` del mismo bloque.
> - Cada task cierra con su commit (`feat(SLT-226): …` / `test(SLT-226): …`).

## T0 — Comprobaciones previas (sin código de producción)

- [x] **T0.1** La mayor migración de `dev`. **Hecho:** los dos prefijos de §3 van después de ella, o se anotan
  los nuevos en `design.md`. Al sincronizar con `dev` (SL-21 tomó `20261124120000`), pasan a `20261124130000` y
  `20261124130100` (`design.md` > Riesgos).
- [x] **T0.2** Las columnas exactas que escribe `pago_plataforma_registrar_por_fuera` en `wallet_movimiento`.
  **Hecho:** §3.5 las copia.
- [x] **T0.3** El trigger `cobro_intento_sin_borrar` frente al `CASCADE` desde `organizacion`. Se prueban
  `pg_trigger_depth()` y la existencia de la empresa en una base desechable. **Hecho:** la opción elegida queda
  anotada en §1.1 y la limpieza de una empresa con intentos pasa.
  - **Decisión (humano, 2026-11-20): opción a.** Se quita el trigger; el borrado lo cierra solo el `REVOKE DELETE`
    a `servi_app`, como en SLT-60. Comprobado el 2026-11-20 en una base desechable: `borrarFilasDeEmpresas` de la
    demo limpia, en una sola pasada, una empresa con un intento aprobado (con su pago en el libro) y otro vivo,
    los dos con `creado_por` de un usuario suyo.
- [x] **T0.4** Tres comprobaciones, anotadas en §1.4 y §5:
  - `PagoPlataformaConfirmacionRepository.leer` ya tolera `confirmado_por` nulo;
  - `confirmador` no se usa en TypeScript;
  - qué muestra «Registró» con `registrado_por` nulo en un `egreso_pago_plataforma`.

  **Hecho:** las tres anotadas.
- [x] **T0.5** Si `migracion-slt143-ida-y-vuelta.test.ts` aplica el `down` de SLT-143 sobre una base con esta
  migración. **Hecho:** decidido si se ajusta (va en T7.5).
- [x] **T0.6** `prisma migrate diff` con una FK `DEFERRABLE` hecha a mano. **Hecho:** sin deriva, o §3.5 pasa al
  orden alternativo de §11.

## T1 — Migración del enum (depende de T0.1)

- [x] **T1.1** `20261124130000_cobro_historial_enum/migration.sql`: los dos `ADD VALUE IF NOT EXISTS` de §1.3.
  **Hecho:** aplica en una base desechable.
- [x] **T1.2** Su `down.sql`: el `DELETE` del historial y `quitar_valores_de_enum_slt226`, copiada de SLT-215.
  **Hecho:** ida y vuelta en una base desechable, sin cambiar los demás valores.

## T2 — Migración del modelo (depende de T1)

- [x] **T2.1** Las tablas, los CHECK, los índices, la RLS y el `REVOKE` de §1.1 y §1.2. **Hecho:** aplica, y
  `\d cobro_intento` muestra los seis índices.
- [x] **T2.2** Los triggers `cobro_intento_solo_avanza` y `cobro_webhook_evento_inmutable` (sin
  `cobro_intento_sin_borrar`: T0.3). Los de SL-17, con `generar-misma-empresa.ts --faltantes`. **Hecho:** el
  generador no deja faltantes.
- [x] **T2.3** `pago_plataforma_confirmacion` (§1.4), la sobrecarga de `_pago_plataforma_aplicar` (§3.6) y el
  tope (§3.7). **Hecho:** los tests de SLT-60 y SLT-143 en verde sin cambios.
- [x] **T2.4** `_cobro_historial` y las funciones de §3.1, §3.2, §3.3, §3.5 y §3.8. **Hecho:** cada una existe en
  `pg_proc` con `prosecdef` y sin `EXECUTE` para `servi_app`.
- [x] **T2.5** Los dos triggers de §3.4. **Hecho:** aplica.
- [x] **T2.6** `down.sql` (§3.10). **Hecho:** ida y vuelta en una base desechable, y aborta con un intento.

## T3 — Prisma y clasificación (depende de T2)

- [x] **T3.1** `db/schema.prisma`:
  - los modelos `CobroIntento` y `CobroWebhookEvento`;
  - los cambios de `PagoPlataformaConfirmacion`;
  - las relaciones inversas;
  - el comentario de `HistorialPlataforma.detalle` y los dos valores de sus enums.

  **Hecho:** `prisma validate` y `pnpm run typecheck` en verde.
- [x] **T3.2** `[P]` `lib/db/modelos-de-negocio.ts`: `CobroIntento` en negocio y `CobroWebhookEvento` en
  plataforma. **Hecho:** `organizacion-en-modelos` en verde.
- [x] **T3.3** `[P]` Los dos globales: en `tests/unit/guards/_unicos-sin-empresa.ts` y en
  `docs/architecture.md > Multi-empresa`. **Hecho:** `unicos-por-empresa` en verde.
- [x] **T3.4** `[P]` La guardia `rls-por-empresa` a 97 y `TRIGGERS_MISMA_EMPRESA` a 186, con su comentario.
  **Hecho:** las guardias en verde.
  - **Valores reales (2026-11-20):** 97 tablas de negocio y 186 triggers de misma empresa, medidos en la base
    migrada (`pg_trigger`; 97 `…_sin_cambio_de_empresa` y 98 políticas `…_por_empresa` con `jobs`). Quitar el
    trigger de borrado no los mueve: no es de SL-17.
  - La guardia `api-key-dependencias-usuario` pidió clasificar la relación nueva `CobroIntento.creador`
    (`tests/fixtures/api-key-dependencias-usuario.ts`, `no_alcanzable`).

## T4 — Tests de la base: intento, máquina y eventos (depende de T3)

- [x] **T4.1** `tests/integration/db/cobro-intento.test.ts`, con la tabla de §8. **Hecho:** cubre R1–R11, R25 y
  R26, en verde, y las mutaciones 1, 2 y 6 lo ponen en rojo.
- [x] **T4.2** `[P]` `tests/integration/db/cobro-webhook-evento.test.ts`. **Hecho:** cubre R12, R13 y R26
  (eventos), en verde.

## T5 — Backend (depende de T3; puede ir junto con T4)

- [x] **T5.1** `[P]` Los tipos y el esquema zod (`lib/types/cobro.ts`) y el puerto
  (`lib/interfaces/external/IProveedorCobro.ts`). **Hecho:** typecheck en verde.
- [x] **T5.2** `ICobroIntentoRepository` y `CobroIntentoRepository` (§4.3), con la entrada en
  `EXCEPCIONES_DE_PLATAFORMA`. **Hecho:** `plataforma-solo-en-lista` en verde.
- [x] **T5.3** `ICobroIntentoService` y `CobroIntentoService` (§4.4). **Hecho:** typecheck y lint en verde.
- [x] **T5.4** `tests/unit/services/cobro-intento-service.test.ts`. **Hecho:** cubre R13–R16, R20 (traducción) y
  R27, en verde.
- [x] **T5.5** `[P]` «Pagado en línea» en «Registró» (R29, design §5.1): la marca `enLinea` en
  `MarcasDeLaPlataforma` y `LibroCajaAutoriaRepository.marcasDeLaPlataforma`, la acción `pago_en_linea` en
  `LibroCajaAutoriaService.registro` y en `RegistroDTO`, y su texto en `ACCION_AUTOMATICA_LABEL` / `textoRegistro`.
  Tests: amplía `libro-caja-autoria-plataforma.test.ts` y `detalle-movimiento-panel-labels-plataforma.test.ts`; la
  lectura real de la marca la afirma T6.1. **Hecho:** cubre R29, en verde, y los tests de la marca de SLT-143
  siguen sin cambios.

## T6 — Tests del pago en línea (depende de T4 y T5)

- [x] **T6.1** `tests/integration/db/cobro-pago-en-linea.test.ts`, con la tabla de §8 y la concurrencia en dos
  conexiones. **Hecho:** cubre R14 (cadena) y R17–R24, en verde, y las mutaciones 3, 4 y 5 lo ponen en rojo.

## T7 — Despliegue y cierre (depende de T6)

- [x] **T7.1** `tests/integration/db/migracion-slt226-ida-y-vuelta.test.ts`. **Hecho:** cubre R28, en verde.
- [x] **T7.2** Las suites de SLT-60 y SLT-143 en verde sin cambios de afirmaciones. **Hecho:** cubre R28.
- [x] **T7.3** El mapa `R<n> -> test` en `progress/impl_SLT-226.md`. **Hecho:** los 29 requisitos tienen test.
- [x] **T7.4** `./init.sh` en verde. El grupo `dinero` de E2E en local (`docs/perfil-agentes.md`: el diff toca
  `db/` y dinero), aunque esta ficha no añade E2E. **Hecho:** los dos en verde, salvo el aviso de tamaño, aceptado
  por la decisión P5.
  - E2E `dinero` en local: 132 en verde, dos veces seguidas.
  - `./init.sh` en local se corta en la validación del board: el cupo, que el humano aceptó, y SLT-247, que es
    ajena. Sus pasos se corrieron a mano, todos en verde. En CI no hay board y corre en `estatico`.
- [x] **T7.5** (solo si T0.5 lo pide) Ajustar `migracion-slt143-ida-y-vuelta.test.ts`. **Hecho:** en verde.
  - **No aplica** (T0.5 lo descartó): la suite de SLT-143 no aplica su `down` sobre esta migración; corre en verde sin cambios (T7.2).

## T8 — Enmienda del 2026-11-20: proveedores, método y marcar pagado a mano (R30–R39; design §12)

> Tanda nueva sobre el PR #263. Edita la migración `20261124130100_cobro_intento` directamente (no está en `dev`):
> no nace ninguna migración ni ningún archivo. Antes de T8.1, la base de la feature se baja con su `down.sql`.

- [ ] **T8.1** La migración (§12.1, §12.3, §12.4):
  - los dos CHECK de proveedor con `rebill`, `wompi` y `global66`;
  - la columna `metodo` con su CHECK, y `metodo` entre las columnas fijas de `cobro_intento_solo_avanza`;
  - `_cobro_historial` con `p_manual` y el `detalle` con `proveedor` y `metodo`;
  - `cobro_intento_obtener_o_crear` con `p_metodo` y la clave nueva;
  - `_cobro_aprobar`, sacada de `cobro_registrar_pago_aprobado`, y el paso 0 de esa función;
  - `cobro_marcar_pagado_manual`, con su `REVOKE`. Admite `creado` o `pendiente`; desde `creado` pasa por
    `pendiente` con el actor (§12.4, paso 7).

  **Hecho:** aplica en una base desechable; las funciones nuevas tienen `prosecdef` y no tienen `EXECUTE` para
  `servi_app`.
- [ ] **T8.2** El `down.sql` (§12.5). **Hecho:** ida y vuelta con la huella del catálogo idéntica, y aborta con un
  intento.
- [ ] **T8.3** `[P]` `db/schema.prisma`: `metodo String` en `CobroIntento`. **Hecho:** `prisma validate` y
  `prisma migrate diff` contra la base migrada dicen «No difference detected».
- [ ] **T8.4** `[P]` Tipos (§12.6): `PROVEEDORES_COBRO` con los tres, `METODOS_COBRO`, `metodo` en el DTO,
  `marcarPagadoManualSchema` y `MarcarPagadoManualResult`. **Hecho:** typecheck en verde.
- [ ] **T8.5** Repositorio y servicio (§12.6): `metodo` en `obtenerOCrear`, sin el literal `"rebill"` en el
  servicio; `marcarPagadoManual` en las dos interfaces y las dos clases; el motivo de `EXCEPCIONES_DE_PLATAFORMA`.
  Depende de T8.4. **Hecho:** typecheck y lint en verde, y `grep '"rebill"' lib/services` no da nada.
- [ ] **T8.6** Tests de la base (§12.7): R30–R34 en `cobro-intento.test.ts` y `cobro-webhook-evento.test.ts`;
  R35–R39 (la parte de la base) en `cobro-pago-en-linea.test.ts`; el fixture y la clave de los tests que ya
  existen. Depende de T8.1–T8.3. **Hecho:** en verde, y las mutaciones 7, 8 y 9 los ponen en rojo.
- [ ] **T8.7** `[P]` Tests del servicio (§12.7): R30, R31, R38 y R39 en `cobro-intento-service.test.ts`. Depende de
  T8.5. **Hecho:** en verde, y la mutación 10 lo pone en rojo.
- [ ] **T8.8** Cierre: el mapa `R<n> → test` de `progress/impl_SLT-226.md` con R30–R39; `migracion-slt226-ida-y-vuelta`
  y las suites de SLT-60 y SLT-143 en verde sin cambiar afirmaciones (R28); `./init.sh` y el grupo `dinero` de E2E
  en local; `scripts/tamano-pr.mjs` medido. **Hecho:** los 39 requisitos con test, todo en verde, y el tamaño
  anotado. Si los tests pasan de 3 000 líneas, se acepta (decisión del humano del 2026-11-20): el implementer lo
  anota en el marcador `tamano-pr-aceptado` de `progress/features/SLT-226.md` y sigue, sin parar a preguntar.

## Archivos esperados

- `db/migrations/20261124130000_cobro_historial_enum/migration.sql`
- `db/migrations/20261124130000_cobro_historial_enum/down.sql`
- `db/migrations/20261124130100_cobro_intento/migration.sql`
- `db/migrations/20261124130100_cobro_intento/down.sql`
- `db/schema.prisma`
- `lib/types/cobro.ts`
- `lib/interfaces/external/IProveedorCobro.ts`
- `lib/interfaces/repositories/ICobroIntentoRepository.ts`
- `lib/repositories/CobroIntentoRepository.ts`
- `lib/interfaces/services/ICobroIntentoService.ts`
- `lib/services/CobroIntentoService.ts`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `docs/architecture.md`
- `scripts/verificar-rls-despliegue.ts`
- `tests/integration/db/cobro-intento.test.ts`
- `tests/integration/db/cobro-webhook-evento.test.ts`
- `tests/integration/db/cobro-pago-en-linea.test.ts`
- `tests/integration/db/migracion-slt226-ida-y-vuelta.test.ts`
- `tests/integration/db/_fixtures/cobro.ts`
- `tests/unit/services/cobro-intento-service.test.ts`
- `tests/unit/guards/_unicos-sin-empresa.ts`
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`
- `tests/integration/db/migracion-slt143-ida-y-vuelta.test.ts`
- `tests/fixtures/api-key-dependencias-usuario.ts` (T3.4: la relación `CobroIntento.creador` en el censo)
- R29 (T5.5): `lib/interfaces/repositories/ILibroCajaAutoriaRepository.ts`,
  `lib/repositories/LibroCajaAutoriaRepository.ts`, `lib/services/LibroCajaAutoriaService.ts`,
  `lib/types/estado-cuenta.ts`, `components/shared/wallet/detalle-movimiento-panel-labels.ts`,
  `tests/unit/services/libro-caja-autoria-plataforma.test.ts` y
  `tests/unit/components/detalle-movimiento-panel-labels-plataforma.test.ts`
- T0.3: `scripts/demo-qa/borrar.ts` y las limpiezas que borran empresas (`limpiar459` y similares) **no
  cambian**: el borrado de la demo descubre las tablas con `organizacion_id` y las ordena por sus FK, así que
  `cobro_intento` se borra antes que sus facturas, sus movimientos y los usuarios; y ninguna limpieza existente
  limpia empresas con intentos. Las limpiezas de los tests nuevos (T4, T6) borran `cobro_intento` antes que los
  usuarios y el libro (la FK `RESTRICT` de `creado_por`; el movimiento en línea tiene `registrado_por` nulo).

- Enmienda (T8): ningún archivo nuevo. Toca de nuevo `db/migrations/20261124130100_cobro_intento/migration.sql`,
  `db/migrations/20261124130100_cobro_intento/down.sql`, `db/schema.prisma`, `lib/types/cobro.ts`,
  `lib/interfaces/repositories/ICobroIntentoRepository.ts`, `lib/repositories/CobroIntentoRepository.ts`,
  `lib/interfaces/services/ICobroIntentoService.ts`, `lib/services/CobroIntentoService.ts`,
  `lib/db/excepciones-aislamiento.ts`, `tests/integration/db/cobro-intento.test.ts`,
  `tests/integration/db/cobro-webhook-evento.test.ts`, `tests/integration/db/cobro-pago-en-linea.test.ts`,
  `tests/integration/db/migracion-slt226-ida-y-vuelta.test.ts`, `tests/integration/db/_fixtures/cobro.ts` y
  `tests/unit/services/cobro-intento-service.test.ts`.

> **Tamaño (design §10 y §12.8):** se midieron 31 archivos (T7.4); la enmienda no suma ninguno. Las líneas de
> producción pasan del tope, aceptado por la decisión P5, y quedan en ~2 010–2 070. Las de tests quedan en
> ~2 950–3 050, en el borde de 3 000; pasar el tope lo aceptó el humano el 2026-11-20.
