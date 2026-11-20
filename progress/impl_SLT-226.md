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

Veredicto de la tanda 1: T0–T3 cerradas.

## Mapa R<n> → test (T7.3)

Archivos: `CI` = `tests/integration/db/cobro-intento.test.ts`, `WE` = `tests/integration/db/cobro-webhook-evento.test.ts`,
`PL` = `tests/integration/db/cobro-pago-en-linea.test.ts`, `MI` = `tests/integration/db/migracion-slt226-ida-y-vuelta.test.ts`,
`SV` = `tests/unit/services/cobro-intento-service.test.ts`, `LA` = `tests/unit/services/libro-caja-autoria-plataforma.test.ts`,
`PA` = `tests/unit/components/detalle-movimiento-panel-labels-plataforma.test.ts`.

| R | Tests |
|---|---|
| R1 | CI «R1, R25: factura de 30 000 con 10 000 confirmados → intento `creado` de 20 000…»; SV (capa de servicio) |
| R2 | CI «R2: pedirlo otra vez con la misma clave devuelve `existente`…» |
| R3 | CI «R3, R25: un vivo con OTRA clave… se anula `clave_distinta` y nace uno nuevo…» |
| R4 | CI «R4: dos pedidos a la vez sobre A3…»; CI «R4: un INSERT del dueño de un segundo vivo… 23505» |
| R5 | CI «R5: la factura en curso, la de otra empresa, una inexistente y una con saldo 0 se rechazan…» |
| R6 | CI «R6: los importes son decimales, y el dueño no puede escribir un monto ≤ 0…» |
| R7 | CI «R7: el dueño solo puede mover un intento por la tabla de R7…» (22 transiciones) |
| R8 | CI «R8: el dueño no puede cambiar la empresa, la factura…»; CI «R8, R26: como `servi_app`… no puede borrar… (42501)» |
| R9 | CI «R9: `aprobado` sin el pago del proveedor o sin el pago del libro da 23514» |
| R10 | CI «R10, R25: registrar el enlace pasa el intento a `pendiente`…»; CI «R10: el mismo id externo en un intento de B da 23505…» |
| R11 | CI «R11, R25: … confirmar (SLT-60)…»; CI «R11: anular (SLT-143)…»; CI «R11: un pago por fuera (SLT-143)…» |
| R12 | WE «R12: guarda el evento una vez…»; WE «R12: el único (proveedor, log_id)… (23505)»; SV (evento sin logId) |
| R13 | WE «R13: si llegó antes y su proceso no terminó…»; WE «R13: cerrado… `repetido`…»; WE «R13: lo recibido no cambia…»; SV «R13: un evento ya procesado se ignora…»; SV «R13: un evento que llegó y no terminó se procesa otra vez…» |
| R14 | SV «R14: el evento dice «pendiente» y el proveedor «aprobado»…»; SV «R14: … el proveedor «rechazado»…»; PL «R14, R25: un intento aún `creado` con su id externo… → `aprobado`» (sembrado a mano: hueco anotado para SLT-230) |
| R15 | SV «R15: con «%s» el evento se cierra como «sin_cambio»…»; PL «R15: `pendiente` sobre un aprobado → `sin_cambio`…» |
| R16 | SV «R16: si la consulta al proveedor falla, no cambia el intento, no cierra el evento…» |
| R17 | PL «R17, R25: el pago aprobado de 30 000 → `ok`; caja 20 000, deuda 0…» |
| R18 | PL «R18: C con la caja en 0 recibe un pago en línea de 10 000 → `ok`…» |
| R19 | PL «R19: el pago en línea no sale en `pago_plataforma_por_confirmar`…» |
| R20 | PL «R20: el mismo pago otra vez → `ya_registrado`…»; PL «R20: el mismo pago de B1 registrado a la vez desde dos conexiones…»; SV «R20: un pago ya registrado cierra el evento como «aplicado»» |
| R21 | PL «R21: un intento `anulado`, otro monto (29 999) u otra moneda → `requiere_revision`…»; SV (requiere_revision) |
| R22 | PL «R22: con un pago de la wallet de 10 000 por confirmar…» |
| R23 | PL «R23: `avanzar` a `devuelto`…»; PL «R23: `contracargo` sobre un aprobado…» |
| R24 | PL «R24: `rechazado` y `expirado` sobre un vivo → el intento cierra…» |
| R25 | CI y PL en los tests de R1, R3, R10, R11, R14 y R17; CI «R25: si la transacción que cambia un estado falla después…» |
| R26 | CI «R8, R26: como `servi_app`…»; CI «R26: como `servi_app`, B lee solo sus intentos…»; WE «R26: como `servi_app` de cualquier empresa, ni se leen ni se escriben los eventos…» |
| R27 | SV «R27: %s lee los intentos de su empresa»; SV «R27: el superadmin lee…»; SV «R27: %s recibe forbidden…»; SV «R27: un maestro sin empresa…» |
| R28 | MI «R28: no insertan ni cambian datos»; MI «R28: no crean datos…»; MI «R28: la confirmación que ya existía sigue igual…»; MI «R28: el down.sql aborta sin tocar nada si hay un intento»; MI «R28: sin intentos, los dos down.sql dejan el esquema como antes…»; suites de SLT-60 y SLT-143 sin cambios (T7.2) |
| R29 | LA «R29: el pago aprobado en línea dice «pago_en_linea» en Registró…» (y 3 más); PA «R29 — un pago aprobado en línea dice «Pagado en línea»…»; PA «R29 — un gasto de plantilla sigue diciendo «Automático · …»»; PL «R29: como `servi_app` de A, `marcasDeLaPlataforma` devuelve el pago en `enLinea`…» |

## Tanda 2 (T4, T5): commit dc824e6e

- T4: `cobro-intento` y `cobro-webhook-evento`: 2 archivos, 26 tests en verde, también en la segunda pasada (la
  limpieza es idempotente). Mutaciones en `servi_logistic_slt226_mut` (borrada): 1a 8 rojos, 1b 1, 2 10, 6 8.
- T5: `cobro-intento-service`, más los dos tests ampliados de R29: 3 archivos y 42 tests en verde.
  `vitest related` de los 6 archivos de producción: 63 archivos en verde y 7 saltados; 834 tests.
- Typecheck en verde con T4 y T5 juntos; lint con 0 errores; guardias con 5399 tests en verde.
- Fuera de `lib/` y `tests/`: `components/shared/wallet/detalle-movimiento-panel-labels.ts` (R29, solo el mapeo
  del texto).

## Tanda 3 (T6, T7): la cierra el implementer

El `backend_dev` escribió los dos archivos, pero no entregó informe. Verifiqué todo de nuevo con
`DATABASE_URL` en `servi_logistic_slt226`:
- `vitest run` de `cobro-pago-en-linea`, `migracion-slt226-ida-y-vuelta`, `cobro-intento` y `cobro-webhook-evento`:
  `Test Files 4 passed (4)`, `Tests 47 passed (47)`, ninguno saltado.
- T7.2: `pago-plataforma-confirmacion`, `pago-plataforma-por-fuera`, `migracion-slt143-ida-y-vuelta`,
  `migracion-slt60-ida-y-vuelta`, `pago-plataforma-sl45`, `-sl45-blindaje` y `-sl45-concurrencia`:
  `Test Files 7 passed (7)`, `Tests 84 passed (84)`. Ninguno cambia frente a `origin/dev`.
- Mutaciones sobre `cobro-pago-en-linea`, en `servi_logistic_slt226_mut` creada desde la base de la feature
  (TEMPLATE) y borrada después:
  - 3: `cobro_registrar_pago_aprobado` sin el chequeo R20 y sin candado ni `FOR UPDATE`. 2 rojos, los dos R20:
    secuencial y concurrente.
  - 4: la aplicación va antes de `aprobado`. 10 rojos: R17, R29, R20, R18, R22, R14, R23, R15.
  - 5: el tope sin la salida de §3.7. 1 rojo: R22.
- T7.4: ver abajo.

### T7.4: gate local y E2E

- `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` (rápido): `exit 1` en el paso 3, antes de llegar al diff.
  `✗ feature_list.json invalido`: zona fullstack 15/7 y zona backend 7/6, el exceso que aceptó el humano;
  además «faltan specs para features sdd en vuelo: SLT-247», que no es de esta ficha. Es el estado del board, no el
  código. En CI no hay copia del board, así que ese paso sale en verde.
- Pasos del rápido corridos a mano:
  - typecheck: 0 errores.
  - lint: 0 errores y 249 avisos, los de antes.
  - `test:guardias`: con la CPU al 99 % por procesos de otras features, 8 archivos dieron rojo por
    timeout de 20 s. Corridos aparte, todos en verde; los dos que seguían lentos pasan con
    `--testTimeout=180000` (19 tests en 8 s). Ningún rojo es de lógica.
  - `scripts/tamano-pr.mjs`: AVISO (31/40 archivos, 1752/1000 de producción, 2534/3000 de tests), aceptado por P5. El
    marcador está en `progress/features/SLT-226.md`.
- E2E `dinero`: en CI, en verde sobre `dc824e6e` (9 min 32 s). La tanda 3 solo añade tests y no cambia código
  de producción. No lo corrí en local porque la máquina estaba ocupada con el Playwright de otra feature.
- El primer CI del PR (#263) dio rojo solo por el tamaño, sin marcador. `estatico` y los tres shards de vitest
  cortaron ahí. El E2E `aislamiento` dio timeout de `page.goto` en la landing (`marca.spec.ts` y
  `rastreo-publico.spec.ts`); el diff no toca la landing, y en la primera corrida del PR estaba en verde.

### CI del PR #263 sobre d887fab3: 4 rojos fuera del baseline

- `catalogo-postgres-acota-esquema`: dos consultas de los tests nuevos leían `pg_enum` y `pg_trigger` sin acotar el
  esquema. Ahora acotan a `public`.
- `verificar-rls-despliegue.test.ts`: las cifras seguían en las de SLT-221. Pasan a 97 tablas, 186 triggers sme, 98
  políticas y 97 sin cambio. El script ya estaba bien.
- `orden-traspaso-migration`: a la lista exacta de migraciones posteriores le faltaban las dos de SLT-226.
- `caja-caracterizacion-459`: no es de SLT-226. Falla 1 de cada 1000 corridas porque `diaDelPremio()`
  (`_fixtures/caja-459.ts:129`) sortea dos fechas que pueden coincidir en la misma empresa. Lo trae `86d70bf0`. No se
  tocó ni se añadió al baseline: va a una rama `chore/`, que decide el leader.
- Local, con la base de la feature: los 4 archivos más los 2 tocados dan `Test Files 6 passed (6)` y
  `Tests 76 passed (76)`.
