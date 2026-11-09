# SLT-85 «Traza de facturación de los cobros por orden» — bitácora de implementación

## Tanda 1 — T1 y T2 (backend_dev, 2026-11-09)

### Archivos
- `db/schema.prisma`: modelo `CobroPlataformaTraza` y relaciones inversas en `Orden`, `Organizacion` y
  `CobroPlataformaMovimiento` (T1.1).
- `lib/db/modelos-de-negocio.ts`: entrada del modelo (T1.2).
- `db/migrations/20261109120000_cobro_plataforma_traza/migration.sql` (T2.2) y `down.sql` (T2.3).

### T2.1 — ¿el runner envuelve la migración en una transacción?
- `prisma migrate deploy` (Prisma 7.8): manda el archivo como un script de varias sentencias, que Postgres
  corre en una transacción implícita. Sonda en una base vacía, sin `BEGIN`: `CREATE TABLE`, `LOCK TABLE`
  y un `RAISE` final. El `LOCK` no dio 25P01 y vio su cerrojo; tras el `RAISE` la tabla no existía.
- El runner de los tests (`ejecutar` y `aplicarMigracionesHasta`, en
  `tests/integration/db/_fixtures/ida-y-vuelta-32.ts`) corre sentencia a sentencia, en autocommit. Ahí un
  `LOCK TABLE` suelto da 25P01 (comprobado) y un fallo del cierre dejaría la tabla a medias.
- Con `BEGIN;`/`COMMIT;` explícitos, el script funciona en los dos runners. Bajo `migrate deploy`, un fallo
  intermedio aborta el bloque y no queda nada (sonda B). 19 migraciones del repo ya lo llevan, p. ej.
  `20261023090000`.
- Decisión: el archivo lleva `BEGIN;` y `COMMIT;`.

### Evidencia
- `prisma validate`: válido. `prisma generate`: escribe en el `node_modules` compartido (junction).
- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`, como CI; sin él, OOM): solo 2
  errores, ajenos a este cambio. `lib/validacion/telefono.ts` no encuentra `libphonenumber-js`, que no
  está instalado en el `node_modules` compartido.
- `eslint lib/db/modelos-de-negocio.ts`: limpio.
- `generar-misma-empresa.ts --faltantes`: los 3 `sme_*` (`movimiento_id`, `orden_id`, `reverso_de`) y
  `cobro_plataforma_traza_sin_cambio_de_empresa`, pegados en el paso 2.
- Guardias `unicos-por-empresa`, `fk-misma-empresa` y `organizacion-en-modelos`: verdes.
  `rls-por-empresa`: rojo esperado, 89 frente a 88; es el T3.2.
- Ida y vuelta en `servi_logistic_slt85`. Movimientos: count, sum(monto) y md5 del libro.
  | Paso | Movimientos | Traza |
  |---|---|---|
  | 0 sembrado (todas hasta 20261108120300) | 19 / 12800.00 / 5b88… | no existe |
  | 1 deploy con relleno | 19 / 12800.00 / 5b88… | 19 filas, 19 reconstruidas, 0 descuadres |
  | 2 `db:rollback` | 19 / 12800.00 / 5b88… | no existe, 0 funciones y 0 triggers |
  | 3 deploy otra vez | 19 / 12800.00 / 5b88… | 19, 19 reconstruidas, 0 descuadres |
  | 4 orden porcentual viva (cargo y reverso) | 21 / 14800.00 | 21, 2 en vivo con guía, monto, estado, plan y período |
  | 5 `db:rollback` con filas vivas | 21 / 14800.00 (sin cambios) | el down se niega; `_prisma_migrations` intacto |
- `UPDATE` como dueño sobre la traza: SQLSTATE `SL085`.
- Descuadre = un movimiento sin traza o con otra empresa, orden, tipo, fuente, fecha o valor (±), o un
  reverso que no apunta a la traza del cargo `secuencia − 1`.

Veredicto de la tanda: T1 y T2 hechos; la ida y vuelta deja el libro idéntico y la traza cuadra 1 a 1.

## Tanda 2 — T3 y T4 (dos backend_dev en paralelo, 2026-11-09)

### Archivos
- T3 (`5a789878`): `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` (patrones de
  la traza por Prisma y SQL; 15 positivos y 4 negativos en la contraprueba),
  `tests/unit/guards/rls-por-empresa.guardia.test.ts` (88 → 89), `scripts/verificar-rls-despliegue.ts`
  (`TRIGGERS_MISMA_EMPRESA` 172 → 175) y `tests/unit/scripts/verificar-rls-despliegue.test.ts`
  (no estaba en «Archivos esperados»: su contrato fija las mismas cifras, 90 políticas / 175 / 89).
- T4 (`c972899c`): `tests/integration/db/cobro-plataforma-traza.test.ts`,
  `cobro-plataforma-traza-aislamiento.test.ts` y `migracion-slt85-ida-y-vuelta.test.ts` (esta última en
  su propia base `slt85_iv_<rand>`, que borra al terminar).
- **Corrección de la migración en T4** (mismo commit): Postgres corre los triggers `BEFORE` por orden
  alfabético y `cobro_plataforma_traza_inmutable` iba antes que `…_sin_cambio_de_empresa`, así que un
  cambio de `organizacion_id` daba `SL085` en vez del `SL017` de R26. Ahora la función de inmutabilidad
  deja pasar ese caso al trigger siguiente, que lo rechaza con `SL017`; cualquier otro `UPDATE` sigue en
  `SL085`. En `servi_logistic_slt85` se aplicó a mano el `CREATE OR REPLACE` (el checksum de
  `_prisma_migrations` de esa base ya no cuadra con el archivo: recrearla antes de reutilizarla). La ida y
  vuelta con el archivo final la prueba `migracion-slt85-ida-y-vuelta.test.ts` (R17–R20), en verde.

### Evidencia
- `pnpm run test:guardias`: 342 archivos: 336 pasan, 3 fallan, 3 saltados (4 788 tests: 4 758 / 5 / 25).
  - `dependencias-declaradas-presentes.guardia.test.ts`: en `tests/baseline-rojos.json`.
  - `379-maestro-sin-bloqueo.guardia.test.ts` y `wallet-sin-uuid.guardia.test.tsx`: fuera del baseline;
    caen al cargar con «Cannot find package 'libphonenumber-js/core'» (`lib/validacion/telefono.ts`).
    `libphonenumber-js` está en `package.json` pero no instalado en el `node_modules` compartido del
    checkout principal. Ajeno a este diff; en CI se instala.
  - Las dos guardias tocadas: 61/61.
- vitest contra Postgres real (`servi_logistic_slt85`, sin saltados): 7 archivos, 71 tests, 0 fallos.
  | Archivo | Pasados |
  |---|---|
  | `cobro-plataforma-traza` | 27 |
  | `cobro-plataforma-traza-aislamiento` | 5 |
  | `migracion-slt85-ida-y-vuelta` | 5 |
  | `cobro-plataforma-cargos` (R4) | 20 |
  | `cobro-porcentual-estados-finales` (R4) | 3 |
  | `cobro-plataforma-porcentual-aislamiento` (R4) | 5 |
  | `migracion-slt83-ida-y-vuelta` (R4) | 6 |
- `eslint` de los archivos tocados: limpio. `tsc` (8 GB): solo los 2 errores de `libphonenumber-js`.

## Mapa R → test (T5.1)

Todos en `tests/integration/db/` salvo R25. Cada `it` empieza por su `R<n>`.

| R | Archivo › it |
|---|---|
| R1 | `cobro-plataforma-traza.test.ts` › «R1 — cada movimiento tiene exactamente una traza y ninguna traza queda sin movimiento» |
| R2 | ídem › 7 `it` «R2 — …»: alta fija, alta que nace anulada, anulación, recuperación, porcentual al estado final, porcentual que sale del final, porcentual anulada y recuperada |
| R3 | ídem › «R3 — si la transacción se deshace no queda ni el movimiento ni la traza» y «R3 — si la traza no se puede escribir, el movimiento no se registra» |
| R4 | ídem › «R4 — los movimientos y la deuda son los mismos con y sin traza»; y las 4 suites de SL-40/SLT-83 en verde |
| R5 | ídem › «R5 — copia guía, monto_cobrar y código de estado del instante; guía vacía si no tiene» y «R5 — una orden sin monto_cobrar deja el monto vacío» |
| R6 | ídem › «R6 — cambiar guía, monto o estado después no cambia la traza ya escrita» |
| R7 | ídem › «R7 — orden porcentual: tipo porcentual, % y mínimo congelados, sin valor fijo» |
| R8 | ídem › «R8 — orden fija: tipo fijo, valor fijo = importe, sin % ni mínimo» |
| R9 | ídem › «R9 — la fuente es la del movimiento: empresa, plan, global y sin_configurar (con 0,00)» |
| R10 | ídem › «R10 — copia el plan del instante, también con fuente empresa; sin plan, vacío» y «R10 — tras cambiar de plan, la fila nueva lleva el nuevo y la vieja no cambia» |
| R11 | ídem › «R11 — cargo positivo, reverso negativo, mismo valor absoluto exacto que el movimiento» |
| R12 | ídem › «R12 — fecha de cobro = ocurrido_at, también en el reverso con deleted_at» |
| R13 | ídem › «R13 — el reverso apunta a la traza del cargo que anula; el cargo no apunta a nada» |
| R14 | ídem › «R14 — el período de calendario de la fecha de cobro, para los cuatro tipos (tabla de SLT-86)» (90 casos) y «R14 — con una entrada a mitad de período, el inicio es el del calendario y no el de la entrada» |
| R15 | ídem › «R15 — empresa sin plan: período vacío» |
| R16 | ídem › «R16 — las filas en vivo salen con reconstruido = false» |
| R17 | `migracion-slt85-ida-y-vuelta.test.ts` › «R17 — el relleno escribe una traza por movimiento con lo guardado y vacíos lo demás» |
| R18 | ídem › «R18 — el período de los históricos sale del tipo de la empresa al migrar; sin plan, vacío» |
| R19 | ídem › «R19 — la migración falla si queda un movimiento sin traza, y no deja nada aplicado» |
| R20 | ídem › «R20 — el down baja sin tocar movimientos, y subir otra vez rehace el relleno» y «R20 — el down se niega si hay una fila en vivo, sin cambiar nada» |
| R21 | `cobro-plataforma-traza-aislamiento.test.ts` › «R21 — la app en la empresa A solo lee las de A; sin contexto, ninguna» |
| R22 | ídem › «R22 — la plataforma lee las de las dos empresas» |
| R23 | ídem › «R23 — la app no inserta, no cambia y no borra: 42501 sin cambios» |
| R24 | ídem › «R24 — nadie cambia una fila, tampoco el dueño: SL085» |
| R25 | `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` › contraprueba con los patrones de la traza y «ningún archivo de lib/ ni de app/ escribe en cobro_plataforma_traza (SLT-85, R25)» |
| R26 | `cobro-plataforma-traza-aislamiento.test.ts` › «R26 — una traza no apunta a orden, movimiento ni traza de otra empresa ni cambia de empresa: SL017» |
| R27 | `cobro-plataforma-traza.test.ts` › «R27 — la tabla tiene exactamente las columnas esperadas, importes numeric(12,2), porcentaje numeric(5,2), sin impuesto ni moneda» |

Ningún R sin test.

## T5 — cierre
- T5.1 mapa: arriba. T5.4: línea «Traza de facturación» en `docs/architecture.md > Multi-empresa`.
- **T5.2 (`./init.sh`) y T5.3 (E2E del grupo `dinero` y los 5 specs) NO corridos**: la sesión los
  prohibió por memoria (el gate lo da CI). Quedan para el leader antes del PR (`docs/perfil-agentes.md >
  E2E en local antes del PR`).

## Propuestas abiertas (para el humano)
1. Prisma: el movimiento expone `trazas CobroPlataformaTraza[]` y no `traza?` (uno a uno) porque el único
   del SQL es `(organizacion_id, movimiento_id)`; la alternativa es añadir `UNIQUE (movimiento_id)`.
2. Un reverso sin traza de su cargo hace fallar el movimiento (vía el `CHECK` de `reverso_de`), no lo
   deja pasar sin `reverso_de`.
3. R26/R24: la inmutabilidad deja pasar el cambio de `organizacion_id` para que salga `SL017`; la
   alternativa es renombrar el trigger para que corra el último.
4. Test R19 extra: un reverso suelto sin cargo tumba la migración entera (23514).

Veredicto: T1–T4, T5.1 y T5.4 hechos; T5.2 y T5.3 pendientes del leader.
