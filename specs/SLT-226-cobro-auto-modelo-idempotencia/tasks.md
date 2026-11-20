# SLT-226 «Cobro automático: modelo del cobro e idempotencia» — tasks

> Design: `design.md`. Requisitos: `requirements.md` (R1–R28).
> - P1–P5 están cerradas (humano, 2026-11-20; `requirements.md > Decisiones cerradas`). Por la decisión P5 va
>   todo en un solo PR.
> - `[P]` = se puede hacer en paralelo con las demás `[P]` del mismo bloque.
> - Cada task cierra con su commit (`feat(SLT-226): …` / `test(SLT-226): …`).

## T0 — Comprobaciones previas (sin código de producción)

- [ ] **T0.1** La mayor migración de `dev`. **Hecho:** los dos prefijos de §3 van después de ella, o se anotan
  los nuevos en `design.md`.
- [ ] **T0.2** Las columnas exactas que escribe `pago_plataforma_registrar_por_fuera` en `wallet_movimiento`.
  **Hecho:** §3.5 las copia.
- [ ] **T0.3** El trigger `cobro_intento_sin_borrar` frente al `CASCADE` desde `organizacion`. Se prueban
  `pg_trigger_depth()` y la existencia de la empresa en una base desechable. **Hecho:** la opción elegida queda
  anotada en §1.1 y la limpieza de una empresa con intentos pasa.
- [ ] **T0.4** Tres comprobaciones, anotadas en §1.4 y §5:
  - `PagoPlataformaConfirmacionRepository.leer` ya tolera `confirmado_por` nulo;
  - `confirmador` no se usa en TypeScript;
  - qué muestra «Registró» con `registrado_por` nulo en un `egreso_pago_plataforma`.

  **Hecho:** las tres anotadas.
- [ ] **T0.5** Si `migracion-slt143-ida-y-vuelta.test.ts` aplica el `down` de SLT-143 sobre una base con esta
  migración. **Hecho:** decidido si se ajusta (va en T7.5).
- [ ] **T0.6** `prisma migrate diff` con una FK `DEFERRABLE` hecha a mano. **Hecho:** sin deriva, o §3.5 pasa al
  orden alternativo de §11.

## T1 — Migración del enum (depende de T0.1)

- [ ] **T1.1** `20261124120000_cobro_historial_enum/migration.sql`: los dos `ADD VALUE IF NOT EXISTS` de §1.3.
  **Hecho:** aplica en una base desechable.
- [ ] **T1.2** Su `down.sql`: el `DELETE` del historial y `quitar_valores_de_enum_slt226`, copiada de SLT-215.
  **Hecho:** ida y vuelta en una base desechable, sin cambiar los demás valores.

## T2 — Migración del modelo (depende de T1)

- [ ] **T2.1** Las tablas, los CHECK, los índices, la RLS y el `REVOKE` de §1.1 y §1.2. **Hecho:** aplica, y
  `\d cobro_intento` muestra los seis índices.
- [ ] **T2.2** Los triggers `cobro_intento_solo_avanza`, `cobro_intento_sin_borrar` y
  `cobro_webhook_evento_inmutable`. Los de SL-17, con `generar-misma-empresa.ts --faltantes`. **Hecho:** el
  generador no deja faltantes.
- [ ] **T2.3** `pago_plataforma_confirmacion` (§1.4), la sobrecarga de `_pago_plataforma_aplicar` (§3.6) y el
  tope (§3.7). **Hecho:** los tests de SLT-60 y SLT-143 en verde sin cambios.
- [ ] **T2.4** `_cobro_historial` y las funciones de §3.1, §3.2, §3.3, §3.5 y §3.8. **Hecho:** cada una existe en
  `pg_proc` con `prosecdef` y sin `EXECUTE` para `servi_app`.
- [ ] **T2.5** Los dos triggers de §3.4. **Hecho:** aplica.
- [ ] **T2.6** `down.sql` (§3.10). **Hecho:** ida y vuelta en una base desechable, y aborta con un intento.

## T3 — Prisma y clasificación (depende de T2)

- [ ] **T3.1** `db/schema.prisma`:
  - los modelos `CobroIntento` y `CobroWebhookEvento`;
  - los cambios de `PagoPlataformaConfirmacion`;
  - las relaciones inversas;
  - el comentario de `HistorialPlataforma.detalle` y los dos valores de sus enums.

  **Hecho:** `prisma validate` y `pnpm run typecheck` en verde.
- [ ] **T3.2** `[P]` `lib/db/modelos-de-negocio.ts`: `CobroIntento` en negocio y `CobroWebhookEvento` en
  plataforma. **Hecho:** `organizacion-en-modelos` en verde.
- [ ] **T3.3** `[P]` Los dos globales: en `tests/unit/guards/_unicos-sin-empresa.ts` y en
  `docs/architecture.md > Multi-empresa`. **Hecho:** `unicos-por-empresa` en verde.
- [ ] **T3.4** `[P]` La guardia `rls-por-empresa` a 97 y `TRIGGERS_MISMA_EMPRESA` a 186, con su comentario.
  **Hecho:** las guardias en verde.

## T4 — Tests de la base: intento, máquina y eventos (depende de T3)

- [ ] **T4.1** `tests/integration/db/cobro-intento.test.ts`, con la tabla de §8. **Hecho:** cubre R1–R11, R25 y
  R26, en verde, y las mutaciones 1, 2 y 6 lo ponen en rojo.
- [ ] **T4.2** `[P]` `tests/integration/db/cobro-webhook-evento.test.ts`. **Hecho:** cubre R12, R13 y R26
  (eventos), en verde.

## T5 — Backend (depende de T3; puede ir junto con T4)

- [ ] **T5.1** `[P]` Los tipos y el esquema zod (`lib/types/cobro.ts`) y el puerto
  (`lib/interfaces/external/IProveedorCobro.ts`). **Hecho:** typecheck en verde.
- [ ] **T5.2** `ICobroIntentoRepository` y `CobroIntentoRepository` (§4.3), con la entrada en
  `EXCEPCIONES_DE_PLATAFORMA`. **Hecho:** `plataforma-solo-en-lista` en verde.
- [ ] **T5.3** `ICobroIntentoService` y `CobroIntentoService` (§4.4). **Hecho:** typecheck y lint en verde.
- [ ] **T5.4** `tests/unit/services/cobro-intento-service.test.ts`. **Hecho:** cubre R13–R16, R20 (traducción) y
  R27, en verde.

## T6 — Tests del pago en línea (depende de T4 y T5)

- [ ] **T6.1** `tests/integration/db/cobro-pago-en-linea.test.ts`, con la tabla de §8 y la concurrencia en dos
  conexiones. **Hecho:** cubre R14 (cadena) y R17–R24, en verde, y las mutaciones 3, 4 y 5 lo ponen en rojo.

## T7 — Despliegue y cierre (depende de T6)

- [ ] **T7.1** `tests/integration/db/migracion-slt226-ida-y-vuelta.test.ts`. **Hecho:** cubre R28, en verde.
- [ ] **T7.2** Las suites de SLT-60 y SLT-143 en verde sin cambios de afirmaciones. **Hecho:** cubre R28.
- [ ] **T7.3** El mapa `R<n> -> test` en `progress/impl_SLT-226.md`. **Hecho:** los 28 requisitos tienen test.
- [ ] **T7.4** `./init.sh` en verde. El grupo `dinero` de E2E en local (`docs/perfil-agentes.md`: el diff toca
  `db/` y dinero), aunque esta ficha no añade E2E. **Hecho:** los dos en verde, salvo el aviso de tamaño, aceptado
  por la decisión P5.
- [ ] **T7.5** (solo si T0.5 lo pide) Ajustar `migracion-slt143-ida-y-vuelta.test.ts`. **Hecho:** en verde.

## Archivos esperados

- `db/migrations/20261124120000_cobro_historial_enum/migration.sql`
- `db/migrations/20261124120000_cobro_historial_enum/down.sql`
- `db/migrations/20261124120100_cobro_intento/migration.sql`
- `db/migrations/20261124120100_cobro_intento/down.sql`
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
