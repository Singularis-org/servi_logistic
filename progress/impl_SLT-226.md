# impl SLT-226 «Cobro automático: modelo del cobro e idempotencia»

## Tanda 1 (T0–T3), 2026-11-20

Base de la feature: `servi_logistic_slt226` en localhost (migrada hasta `20261124120100_cobro_intento`, catálogos
sembrados, sin empresas).

### Primera parte (commit 4a4d5f6c)
- T0.1, T0.2, T0.4, T0.5, T0.6: anotados en `design.md` (§1.4, §3.5, §5, §11).
- T1.1, T1.2: `db/migrations/20261124120000_cobro_historial_enum/{migration.sql,down.sql}`, con ida y vuelta.
- T0.3 quedó BLOQUEADA: con el trigger `cobro_intento_sin_borrar` y la FK `RESTRICT` de `creado_por`, una empresa
  con intentos no se podía limpiar.

### Decisiones del humano (2026-11-20), aplicadas al spec
1. T0.3, opción a: sin trigger de borrado; lo cierra solo el `REVOKE DELETE` a `servi_app`. R8 ajustado, §1.1, §3.9,
   §8 y §11 del design, T0.3 [x] y T2.2 sin el trigger.
2. «Pagado en línea» en «Registró» en este PR: R29 nuevo, design §5.1 y §8, alternativa 6 ya no descartada, T5.5
   en tasks (tanda 2), tamaño a ~34 archivos.

### Segunda parte: T2 y T3
Archivos:
- `db/migrations/20261124120100_cobro_intento/migration.sql` (nuevo, 714 líneas): tablas, CHECK, índices, RLS,
  REVOKE, triggers de SL-17 (generados), `cobro_intento_solo_avanza`, `cobro_webhook_evento_inmutable`, la
  confirmación sin persona, la sobrecarga de `_pago_plataforma_aplicar`, el tope con la salida del pago en línea,
  `_cobro_historial`, `_cobro_intento_pasar`, las funciones de §3.1–§3.3, §3.5 y §3.8 y los triggers de §3.4.
- `db/migrations/20261124120100_cobro_intento/down.sql` (nuevo, 146 líneas): guarda, cuerpos literales del tope
  (20261116120000 §8) y de `_pago_plataforma_aplicar` de 7 argumentos (20261121130000 §4, extraídos del archivo),
  DROP de lo nuevo, la columna y el CHECK.
- `db/schema.prisma` (+~90): `CobroIntento`, `CobroWebhookEvento`, `PagoPlataformaConfirmacion` (`confirmadoPor?`,
  `confirmador?`, `enLinea`), relaciones inversas en `Usuario`, `WalletMovimiento`, `Organizacion` y
  `FacturaPlataforma`, comentarios de `HistorialPlataforma`. Solo mis líneas (sin `prisma format`, por el choque con
  SLT-221).
- `lib/db/modelos-de-negocio.ts` (+4): `CobroIntento` en negocio y `CobroWebhookEvento` en plataforma.
- `tests/unit/guards/_unicos-sin-empresa.ts` (+12) y `docs/architecture.md` (+3): los dos globales.
- `tests/unit/guards/rls-por-empresa.guardia.test.ts` (97) y `scripts/verificar-rls-despliegue.ts` (186).
- `tests/fixtures/api-key-dependencias-usuario.ts` (+4): `CobroIntento.creador`, `no_alcanzable` (lo pidió la guardia
  `api-key-dependencias-usuario`; no estaba en «Archivos esperados», ya añadido).
- `specs/…/requirements.md`, `design.md`, `tasks.md`: las dos decisiones, notas de implementación (§3.9) y T0.3,
  T2.1–T2.6 y T3.1–T3.4 en [x].

Conteos reales de T3.4 (medidos en la base migrada): 97 tablas de negocio, 186 triggers de misma empresa, 97
`…_sin_cambio_de_empresa`, 98 políticas `…_por_empresa`. Quitar el trigger de borrado no los mueve.

### Verificación (salida real)
- `pnpm exec prisma validate`: «The schema at db\schema.prisma is valid».
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma` (base migrada y base desechable):
  «No difference detected».
- `tsx scripts/generar-misma-empresa.ts --faltantes`: 0 `CREATE TRIGGER` pendientes.
- T2.1: `pg_indexes` de `cobro_intento` muestra los seis índices más la PK.
- T2.4: las 9 funciones nuevas del dueño (y la sobrecarga) con `prosecdef = true` y sin EXECUTE para `servi_app`.
- Ida y vuelta en `servi_logistic_slt226_ida` (borrada después), con una huella del catálogo (funciones con su
  definición y ACL, columnas, constraints, triggers, índices, políticas, enums y grants):
  - up → down de 120100: idéntica a la base antes de la migración;
  - con un intento: el down aborta («rollback SLT-226: 1 filas en cobro_intento») y la huella no cambia;
  - down de 120100 y de 120000, y vuelta a subir las dos: misma huella que la primera subida; bajar otra vez,
    idéntica a la de antes.
- Humo en transacciones con ROLLBACK: R1, R2, R10 (`ok`/`ya_pendiente`), eventos `nuevo`/`pendiente`/`repetido`,
  pago aprobado `ok` y luego `ya_registrado` (caja negativa, confirmación `en_linea` sin persona, saldo 0),
  `devuelto`/`sin_cambio`/`no_alcanzable`, `creado`→`aprobado` con dos filas de historial, R11 por la confirmación
  de SLT-60 y por la anulación de SLT-143, SL226 `transicion_invalida` y `columna_fija`, `servi_app` con «permiso
  denegado» al borrar intentos, al leer eventos y al ejecutar las funciones.
- T0.3: `borrarFilasDeEmpresas` de la demo, en una base desechable (borrada después), limpia en una pasada una
  empresa demo con un intento aprobado y otro vivo con `creado_por` de su usuario: `{ filas: 9, pasadas: 1 }`, 0
  intentos y 0 empresas. Quedan las 2 filas de historial con actor nulo, como todo `historial_plataforma` (la fila
  sobrevive a su sujeto). `borrar.ts` y `limpiar459` no cambian.
- `vitest run` con `DATABASE_URL` a la base de la feature: `pago-plataforma-confirmacion`, `pago-plataforma-por-fuera`,
  `migracion-slt143-ida-y-vuelta`, `migracion-slt60-ida-y-vuelta`: 4 archivos, 53 tests en verde, sin cambios.
- `pnpm run typecheck` (con `--max-old-space-size=8192`): `tsc --noEmit` sale con 0.
- `pnpm run lint`: 0 errores, 249 avisos, los mismos de antes.
- `pnpm run test:guardias` (sin `DATABASE_URL`): 357 archivos en verde y 3 saltados; 5399 tests en verde y 28 saltados
  (los que piden base). La primera corrida dio rojo en `api-key-dependencias-usuario` (relación nueva sin
  clasificar, ya corregido) y un timeout de 20 s en `cierres-componentes-retirados` bajo carga, que pasa solo y en la
  corrida final.

### Mapa R<n> → test
Pendiente: los tests llegan en T4–T7 (R29 en T5.5 y T6.1).

Veredicto: T0–T3 cerradas; la base, el esquema y la clasificación están listos para la tanda 2 (T4–T7).
