# SLT-121 «Planes: plazo de pago de la factura y operación congelada por mora» · bitácora de implementación

## Tanda 1 — Base de datos (backend_dev, 2026-11-20)

### Archivos

Creados:
- `db/migrations/20261126120000_mora_enums/migration.sql` y `down.sql` (T1.1).
- `db/migrations/20261126120100_mora_congelamiento/migration.sql` y `down.sql` (T1.2).
- `tests/integration/db/_fixtures/fecha-limite-pago.ts` (T1.3, tabla compartida con la gemela TS de T2.2).
- `tests/integration/db/_fixtures/mora-121.ts` (helpers de los tests de la base; no estaba en `tasks.md`).
- `tests/integration/db/factura-plataforma-mora.test.ts` (T1.3).
- `tests/integration/db/mora-congelar.test.ts` y `bloqueo-por-mora.test.ts` (T1.4).
- `tests/integration/db/bloqueo-por-mora-cobertura.test.ts` y `mora-migration.test.ts` (T1.2).

Modificados:
- `db/schema.prisma`: 5 valores en `HistorialAccionTipo`, 2 en `JobTipo`, 3 columnas en `Organizacion`.
- `tests/integration/db/orden-traspaso-migration.test.ts`: las dos migraciones en su lista de posteriores.
- `tests/integration/db/caja-459-migration.test.ts`: los cinco tipos nuevos al final del enum.

### Desvíos frente al spec
- Timestamps `20261126120000` y `20261126120100` (no `20261124…`): `20261124120000` lo usa SLT-226 «Cobro automático:
  modelo del cobro e idempotencia» en otra rama. Primero fueron `20261125…`, pero la regex `/backfill|125/` de
  `tests/unit/analytics/backfill-guards.test.ts` los atrapaba; renombradas en la tanda T2.6.
- `organizacion_mora_congelar` con una empresa que no existe lanza `P0002` (el design no lo dice).
- La guarda de `factura_plataforma_mora` reconoce a `servi_app` por `current_setting('role')` (lo fija la envoltura
  con `set_config('role', …)` y SECURITY DEFINER no lo cambia) o por `session_user`.

### R → test (Tanda 1)
| R | Test |
|---|---|
| R1 | `factura-plataforma-mora.test.ts` (tabla de casos; cierre real 16 nov → 23 nov) |
| R6 | `factura-plataforma-mora.test.ts` (vencida desde `vence_at`; saldo 0/negativo fuera; parcial; anulado) |
| R33 | `factura-plataforma-mora.test.ts` (42501 otra empresa y sin empresa; privilegios) |
| R7, R8, R9, R18, R21, R23 | `mora-congelar.test.ts` |
| R5, R34 (pieza SQL) | `mora-congelar.test.ts` |
| R10, R12, R16, R18 | `bloqueo-por-mora.test.ts` |
| R16 | `bloqueo-por-mora-cobertura.test.ts`, `mora-migration.test.ts` |
| R3 (CHECK) | `mora-migration.test.ts` |

### Verificación (salida real)
- `pnpm exec vitest run` de los 5 archivos nuevos + `orden-traspaso-migration`: 6 archivos, 45 tests, 0 fallidos
  (bloqueo-por-mora 5, cobertura 1, factura-plataforma-mora 5, mora-congelar 10, mora-migration 9, orden-traspaso 15).
- `db:rollback` de la principal y `migrate deploy` otra vez: OK. El `down` de enums se prueba de ida y vuelta en
  `mora-migration.test.ts` (base propia), porque `db:rollback` solo revierte la última carpeta.
- `pnpm run lint`: 0 errores, 249 avisos (heredados; `eslint` sobre los archivos de esta tanda: limpio).
- `pnpm run typecheck`: ROJO, 4 errores, todos por los valores nuevos del enum en el cliente de Prisma:
  `lib/types/historial-accion.ts` (exhaustividad de `HISTORIAL_ACCION_TIPOS`), `HistorialAccionRepository.ts` (2) y
  `lib/modulos/reparto.ts` (`MODULO_POR_JOB`). Son T2.6 y T3.2.
- En rojo por lo mismo (comparan la base con `HISTORIAL_ACCION_TIPOS`, `MODULO_POR_JOB` o `buildHandlers`): 13
  inventarios de `historial_accion_tipo`, `catalogo.test.ts`, `procesar-jobs-modulos.test.ts`,
  `jobs-handler-por-tipo.guardia`. Más `backfill-guards.test.ts` (R5 de la 125: su regex `/125/` atrapa
  `20261125…`).

Veredicto: base de datos de la Tanda 1 lista y probada; typecheck e inventarios en rojo hasta decidir el orden
con T2.6 y T3.2 (BLOQUEADO devuelto al leader).

## Tanda T2.6 + adelanto de T3.2 (backend_dev, 2026-11-20)

### Base de la feature
- Revertidas las dos migraciones con sus `down.sql` (congelamiento y luego enums), borradas sus filas de
  `_prisma_migrations`, renombradas a `20261126120000_mora_enums` y `20261126120100_mora_congelamiento`, y vueltas a
  aplicar con `prisma migrate deploy` («All migrations have been successfully applied»). `migrate status`: «Database
  schema is up to date!». `db:generate`: OK.

### Archivos
Modificados:
- `db/migrations/20261126120000_mora_enums/migration.sql` y `down.sql`, `20261126120100_mora_congelamiento/*.sql`,
  `db/schema.prisma`: referencias al nombre nuevo.
- `lib/types/historial-accion.ts`: bloque A.7 con los cinco tipos; categoría `mora` («Mora y congelamiento») en
  `CATEGORIAS_ACCION`, `CATEGORIA_POR_ACCION`, `ACCION_LABELS` y `CATEGORIA_LABELS`. Las etiquetas no dicen «la
  empresa» (SL-15 R4 la reserva a la marca).
- `lib/types/historial-accion-etiquetas.ts`: la entidad `organizacion` admite `{ asunto?: "tope_intentos" | "mora" }`;
  con `mora` la etiqueta es «Plazo de pago y mora» (design §7.2). Sin `asunto`, la del tope, como antes.
- `lib/modulos/reparto.ts`: `mora_diaria` y `mora_aviso_correo` → `"nucleo"` en `MODULO_POR_JOB` (adelanto de T3.2).
- `tests/unit/guards/historial-accion-sin-datos-cliente.guardia.test.ts`: excepción declarada P5 para
  `empresa_descongelada_a_mano` en `MoraEmpresaRepository.ts`, con `escritorPendiente` (T2.4) y la nota de que Carlos
  Restrepo la acepta en la review del PR; el test de excepciones admite un archivo pendiente que aún no existe y exige
  que una excepción con escritor esté en `PUNTOS_DE_ESCRITURA`; test nuevo «SLT-121 P5».
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`: los cinco tipos en
  `ESCRITOR_PENDIENTE_EN_CURSO` (T2.4 y T2.5); el número duro pasa a 95.
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`: 95 tipos y 7 categorías; describe «SLT-121 R30».
- Inventarios de `historial_accion_tipo` con los cinco tipos detrás de SLT-225:
  `correccion-resultado-gestion-migration`, `historial-accion-cobro-tienda-migration`,
  `historial-accion-conciliacion-bodega-migration`, `historial-accion-orden-zona-reconciliada-migration`,
  `historial-accion-pago-mensajero-ajustado-migration`, `historial-accion-zona-pago-mensajero-migration`,
  `historial-accion-zona-sinpe-migration`.
- Sin cambios: `HistorialAccionRepository.ts` (sus errores de typecheck venían del catálogo incompleto).

### R → test (esta tanda)
| R | Test |
|---|---|
| R30 (catálogo, categoría, etiquetas) | `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` > «SLT-121 R30» |
| R30 (P5, excepción de texto libre) | `historial-accion-sin-datos-cliente.guardia.test.ts` > «SLT-121 P5» |
| R30 (escritura en la misma transacción) | pendiente: `mora-empresa-repository.test.ts` (T2.4) y `pago-plataforma-recalcula-mora.test.ts` (T2.5) |

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: verde (`tsc --noEmit` sin errores).
- `pnpm run lint`: 0 errores, 250 avisos (heredados; `eslint` sobre los archivos tocados en esta tanda: limpio).
- `pnpm run test:guardias`: 354 archivos verdes, 2 rojos:
  - `jobs-handler-por-tipo.guardia`: `['mora_diaria', 'mora_aviso_correo']` sin handler en `buildHandlers`. Es T3.2.
  - `cierres-componentes-retirados.guardia`: timeout de 20 s con la base de integración corriendo a la vez; solo, verde.
- Unitarios (15 archivos, 389 tests, 0 fallidos): las 8 guardias del historial, `catalogo-y-choke-point` (58),
  `lectura-borde-y-servicio` (39), `historial-acciones-filtros-def` (15), `rechazo-nombre-466-lib` (8),
  `modulos/catalogo` (13), `cron/procesar-jobs-modulos` (9), `analytics/backfill-guards` (21).
- Integración (31 archivos: los 27 que leen `historial_accion_tipo`/`HISTORIAL_ACCION_TIPOS`, entre ellos
  `mora-migration`, `orden-traspaso-migration` y `caja-459-migration`, + los otros 4 de la Tanda 1): 29 verdes, 299
  tests pasados, 4 fallidos, todos en `tests/baseline-rojos.json`: `abono-tienda-457-migration` (a) y (c) y
  `wallet-461-migration` (a) y (c). Los (c) son PG 17/18; los (a) miran posiciones fijas de la cola de enums que ya
  estaban corridas antes de esta feature.
- `caja-459-migration` (d) dio una vez `XX000 could not open relation with OID` corriendo en paralelo con los otros
  inventarios; solo y en la segunda pasada del conjunto, 6/6 verde.

Veredicto: T2.6 hecha y migraciones renombradas; typecheck, lint e inventarios en verde; solo queda en rojo
`jobs-handler-por-tipo` hasta los handlers de T3.2.

## Tanda T2.3 + T2.7 — permisos y traducción de la mora (backend_dev, 2026-11-20)

### Archivos
Creados:
- `lib/db/permiso-en-mora.ts`: `MOTIVOS_EN_MORA`, `permitidoEnMora`, `permisoEnMoraActual` (ALS propio en `globalThis`
  con `Symbol.for`; un motivo fuera de la lista se rechaza con `TypeError`).
- `lib/planes/empresa-congelada.ts`: `EmpresaCongelada` (`ForbiddenError`, `details.codigo = "empresa_congelada"`),
  `traducirErrorDeMora` (SL121), `exigirEmpresaOperativa(lector?)`. El lector por defecto importa en perezoso
  `MoraEmpresaRepository.estaCongelada()` (T2.4) y `getPrismaClient` para no cerrar el ciclo
  `prisma-client → extension-empresa → empresa-congelada`. `MENSAJE_EMPRESA_CONGELADA` sale de `lib/planes/mora.ts`.
- Tests: `tests/unit/db/extension-empresa-mora.test.ts`, `tests/unit/actions/wallet-egresos-mora.test.ts`,
  `tests/unit/services/webhook-whatsapp-mora.test.ts`, `tests/unit/cron/procesar-jobs-mora.test.ts`,
  `tests/unit/guards/mora-permiso-solo-en-lista.guardia.test.ts`.

Modificados:
- `lib/db/extension-empresa.ts`: `set_config('app.mora_permitida', …)` en la misma sentencia en los dos sitios;
  `traducirError` = `traducirErrorDeMora(traducirErrorDeEmpresa(e))` en los dos `traducir`.
- `lib/actions/wallet-egresos.ts`: permiso `pago_plataforma` solo si `data.tipoEgreso === "pago_plataforma"`; el
  `FORBIDDEN` del borde pasa a `{ status: "forbidden" }` (antes lanzaba «AppErrorCode inesperado»).
- `lib/actions/wallet-anulacion.ts` (P3): `anularEgresoCajaAction` lee la categoría del egreso (dep
  `categoriaDelEgreso`, por defecto `WalletMovimientoRepository.obtenerPorId`) y concede `pago_plataforma` solo a
  `egreso_pago_plataforma`; `FORBIDDEN` → `forbidden`.
- `lib/actions/confirmar-correo.ts` (solo el canje, `cuenta_propia`), `push.ts` (registrar, preferencia, baja),
  `notificaciones.ts` (marcar todas, descartar), `vistas-filtro.ts` (guardar, renombrar, actualizar, eliminar).
- `lib/services/WebhookWhatsappService.ts`: los dos `conEmpresa` con `whatsapp_entrante`.
- `app/api/cron/procesar-jobs/route.ts` (`conSuEmpresa`) y `lib/db/para-cada-empresa.ts`: `sistema`.
- `tests/unit/db/extension-empresa.test.ts`: `esSetConfigDe` espera ahora dos valores (empresa y permiso vacío).

### Desvíos frente al spec
- Design §6.1 dice `data.categoria === "egreso_pago_plataforma"`; el schema real no tiene `categoria`, tiene
  `tipoEgreso`: se usa `data.tipoEgreso === "pago_plataforma"` (que `TIPO_EGRESO_MANUAL_A_CATEGORIA` mapea a esa
  categoría).
- P3 (anulación): el permiso se decide con una lectura previa de la categoría en la action (el design no dice cómo).
  «Por confirmar» lo sigue imponiendo el trigger `pago_plataforma_no_anular_confirmado` (SLT-60).
- `toEgresoActionError` y `toAnulacionActionError` traducen `FORBIDDEN` (antes lanzaban): sin eso, el «forbidden»
  de R12 que pide `wallet-egresos-mora.test.ts` era una excepción.
- En `notificaciones.ts`, `notificarCargaMasivaTerminada` queda SIN permiso: no es de la propia cuenta.

### R → test (esta tanda)
| R | Test |
|---|---|
| R11 (wallet: pago a la plataforma y anulación P3) | `wallet-egresos-mora.test.ts` |
| R11 (envoltura con el motivo, fuera y dentro de tx) | `extension-empresa-mora.test.ts` |
| R11, R15, R17 (lista cerrada de permisos y motivos) | `mora-permiso-solo-en-lista.guardia.test.ts` |
| R12 (gasto/anulación con la empresa congelada → `forbidden`) | `wallet-egresos-mora.test.ts` |
| R13/R16 (SL121 → `EmpresaCongelada`; `withErrorHandler` → `FORBIDDEN` + `details.codigo`) | `extension-empresa-mora.test.ts` |
| R15 | `webhook-whatsapp-mora.test.ts` |
| R17 | `procesar-jobs-mora.test.ts` |
| §6.2 `exigirEmpresaOperativa` (congelada, operativa, sin empresa, fallo) | `extension-empresa-mora.test.ts` |

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: verde (`tsc --noEmit` sin errores), con los archivos
  de T2.4/T2.5 del otro agente ya en el árbol.
- `pnpm run lint`: `0 errors, 249 warnings` (heredados); `eslint` sobre los 19 archivos de esta tanda: limpio.
- `pnpm exec vitest run` de 31 archivos unitarios (los 5 nuevos + extension-empresa, para-cada-empresa(-modulo),
  contexto-empresa-una-instancia, prisma-transaccion, wallet-egresos-actions, wallet-egresos.composition-root,
  wallet-anulacion-service, confirmar-correo, push-action, vistas-filtro-action, marco-superadmin-sin-empresa,
  webhook-whatsapp-{service,pais-incompleto,entregas,por-empresa}, procesar-jobs-{modulos,plan-cambio,registro,
  registro-envios}, crons-sin-empresas, plataforma-solo-en-lista, sql-a-mano-por-empresa, alta-push, baja-push,
  notificacion-service): **31 archivos, 495 tests, 0 fallidos**.
- Integración que importa los archivos tocados (aislamiento-wallet, pago-plataforma-*, empresas-plataforma-deuda,
  descarga-pago-plataforma…): ROJA por el entorno, no por el cambio. `prisma migrate status` sobre la base de la
  feature: «not yet applied: 20261126120000_mora_enums, 20261126120100_mora_congelamiento» y «found in the database,
  not locally: 20261124120000_cobro_historial_enum, 20261124120100_cobro_intento» (las de SLT-226). El cliente de
  Prisma pide `congelada_at` y la base no la tiene («The column `(not available)` does not exist»). No reaplico
  migraciones: la base parece compartida con otro trabajo.

Veredicto: T2.3 y T2.7 hechas; typecheck, lint y 495 unitarios en verde; la integración queda pendiente de que la
base de la feature vuelva a tener las migraciones de la mora.

## Tanda 2: T2.1, T2.2, T2.4 y T2.5 (backend_dev, 2026-11-20)

### Base de datos usada
`servi_logistic_slt121` (`prisma migrate status`: «Database schema is up to date!»). La URL del scratchpad del leader
(`dburl`) apunta a `servi_logistic_slt226`, la base de SLT-226 «Cobro automático: modelo del cobro e
idempotencia», que no tiene las migraciones de la mora. Allí solo corrió una pasada de tests en transacciones
revertidas, que fallaron por la columna que falta: no se escribió ni se migró nada. Es también la causa del rojo de
integración de la sección de T2.3 y T2.7, justo arriba.

### Archivos
Creados:
- `lib/config/factura-gracia.ts`: `diasDeGraciaGlobal(env)` (T2.1).
- `lib/planes/mora.ts`: la gemela pura (T2.2).
  - Funciones: `fechaLimiteDePago`, `venceEn`, `estaVencida`, `enFranjaDeMadrugada`, `estadoDeMora`.
  - Textos: `MORA_TEXTOS` y `MENSAJE_EMPRESA_CONGELADA`.
  - Tipos: `FilaMora`, `FacturaVencida`, `OrganizacionMora`, `EstadoMora`.
- `lib/interfaces/repositories/IMoraEmpresaRepository.ts` y `lib/repositories/MoraEmpresaRepository.ts` (T2.4).
- `lib/repositories/_shared/encolar-aviso-mora.ts`: el payload de `mora_aviso_correo`, las dedupes de §4.2 y el
  encolado en la transacción. Lo usan el repositorio y el recálculo; T3.2 importa el tipo.
- `lib/planes/mora-recalcular.ts`: `recalcularCongelamiento` (T2.5).
- Tests:
  - `tests/unit/config/factura-gracia.test.ts`;
  - `tests/unit/planes/mora.test.ts`;
  - `tests/integration/repositories/mora-empresa-repository.test.ts`;
  - `tests/integration/repositories/pago-plataforma-recalcula-mora.test.ts`.

Modificados:
- `.env.example`: `FACTURA_DIAS_GRACIA=`.
- `lib/db/excepciones-aislamiento.ts`: la entrada de `MoraEmpresaRepository.ts` en `EXCEPCIONES_DE_PLATAFORMA`
  (`SL-24`). Solo esa entrada.
- `lib/repositories/PagoPlataformaConfirmacionRepository.ts`: `confirmar`, `registrarPorFuera` y
  `anularConfirmado` van en `$transaction` y llaman a `recalcularCongelamiento` tras un `ok`. El contrato no cambia.
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`: cuatro entradas nuevas en el `CENSO` y
  `ESCRITOR_PENDIENTE_EN_CURSO` vacío.
- `tests/unit/guards/historial-accion-sin-datos-cliente.guardia.test.ts`:
  - `MoraEmpresaRepository.ts` y `lib/planes/mora-recalcular.ts` entran en `PUNTOS_DE_ESCRITURA`;
  - la excepción P5 pierde `escritorPendiente`;
  - `ARCHIVOS_CON_ESCRITOR_PENDIENTE` queda vacío.
- `tests/unit/actions/pagos-plataforma.test.ts` (SLT-60 y SLT-143):
  - el cliente falso gana `$transaction`;
  - los dos casos que contaban una sola llamada a `$queryRaw` cuentan dos. La segunda es la lectura del recálculo.

### Desvíos frente al spec
- **Sin entrada en `_pais-sin-literales-excepciones.ts`.**
  - `mora.ts` no escribe la zona. Toma la hora de la plataforma de `lib/planes/ciclo.ts` (`fechaCalendarioPlataforma`,
    `inicioDelDiaPlataforma`, `horaDeParedPlataforma`), que ya es excepción a cargo de SLT-90.
  - Una entrada sin literal pone roja la guardia `pais-sin-literales` («la lista solo baja»), y el tope está lleno
    (8 de 8).
- **`recalcularCongelamiento` admite un 5.º parámetro opcional, `gracia`**, que por defecto vale
  `diasDeGraciaGlobal()`. `fijarGracia` le pasa la gracia global que recibe, y los tests la fijan. La llamada de
  cuatro argumentos de §5.2 (la de SLT-226) no cambia.
- **El recálculo lee primero `congelada_at`, sin bloquear.** Solo si la empresa está congelada llama a
  `organizacion_mora_descongelar_si_pagada`.
  - Sin esa lectura, `pago-plataforma-confirmacion.test.ts` > «R21: A anula y el superadmin confirma el mismo pago a la
    vez» daba `40P01` (deadlock).
  - La causa: la anulación de la empresa toma `FOR KEY SHARE` sobre `organizacion` (la FK del contra-asiento) y espera
    el candado `pago_plataforma:`. La confirmación ya tiene ese candado y pide `FOR UPDATE` sobre la misma fila.
  - **Queda abierto:** con la empresa congelada, el mismo cruce sigue siendo posible. Es la decisión P3: la empresa
    anula su pago por confirmar mientras el superadmin lo confirma. Arreglarlo de raíz pide `FOR NO KEY UPDATE` en las
    tres funciones `organizacion_mora_*` (migración de la Tanda 1). Lo decide el leader.
- **Los tipos del dominio viven en `lib/planes/mora.ts` y en la interfaz**, no en `lib/types/mora.ts` (que es de
  T4.1). T4.1 puede reexportarlos.
- **`fijarGracia` toma la empresa con `FOR NO KEY UPDATE`**, no con el «FOR UPDATE» del design. Es la misma razón que
  en `TopeIntentosRepository`: no frenar las FK de las escrituras de la empresa.
- **Empresa inexistente en `fijarGracia`:** lanza un `Error`. El design no lo dice; el servicio (T4.1) debería
  responder `not_found` antes.

### R → test (esta tanda)
| R | Test |
|---|---|
| R1 | `tests/unit/planes/mora.test.ts` > «fechaLimiteDePago y venceEn con la tabla compartida» (los 11 casos de `fecha-limite-pago.ts`) |
| R2 | `tests/unit/config/factura-gracia.test.ts`: ausente, vacía, «abc», «0», «61», «7.5», «-3» y «15abc» dan 7; «15», «1», «60» y « 30 » se toman |
| R3 | `mora-empresa-repository.test.ts` > «R3, R30: de la global a 15 y de vuelta…» |
| R5 | `mora-empresa-repository.test.ts` > «R5, R28, R30: … la descongela en el acto» y «R5: subir la gracia sin dejar la factura en plazo no descongela; bajarla nunca congela» |
| R6 | `mora.test.ts` > «estaVencida»: tabla compartida, el milisegundo anterior, saldo 0 y negativo |
| R7, R27 | `mora-empresa-repository.test.ts` > «R7, R27, R30: congela y … deja la fila y el correo» |
| R8 | `mora.test.ts` > «enFranjaDeMadrugada»; `mora-empresa-repository.test.ts` > «R8: fuera de la franja…» |
| R9 | `mora-empresa-repository.test.ts` > «R9: repetir la corrida…» |
| R19 | `pago-plataforma-recalcula-mora.test.ts`: confirmar el pago que salda, un pago parcial, registrar por fuera |
| R20 | `pago-plataforma-recalcula-mora.test.ts` > «R20: un pago … por confirmar no la descongela» |
| R21 | `pago-plataforma-recalcula-mora.test.ts` > «R21: anular un pago confirmado no congela en el acto» |
| R22 | `mora-empresa-repository.test.ts` > «R22, R28, R30: descongela hasta la fecha…», «decisión P5: … recortado a 200» y «R22: … no_congelada» |
| R24 | `mora.test.ts` > «estadoDeMora en sus cinco estados» y «textos»; `mora-empresa-repository.test.ts` > «R24, §6.2: la empresa lee su mora…» |
| R26 | `mora-empresa-repository.test.ts` > «R26: encola el recordatorio… a las 08:00…» |
| R28 | el trabajo `descongelada`: `mora-empresa-repository.test.ts` (por gracia y a mano) y `pago-plataforma-recalcula-mora.test.ts` (por pago) |
| R29 | los mismos tests: el trabajo entra en la transacción del cambio. Además, «R30: si el registro falla, la empresa no queda congelada» |
| R30 | `mora-empresa-repository.test.ts` (las cuatro filas del repositorio, con actor, monto y valores) y `pago-plataforma-recalcula-mora.test.ts` (la fila por pago); guardias `historial-accion-escrituras-cubiertas` y `historial-accion-sin-datos-cliente` |
| R31, R32 | `mora-empresa-repository.test.ts` > «R32, R31: el superadmin ve la gracia propia, las facturas … y el historial» |
| R33 | `mora-empresa-repository.test.ts` > «R33: sin empresa en el contexto…»; también `factura-plataforma-mora.test.ts` (Tanda 1) |
| R34 | `pago-plataforma-recalcula-mora.test.ts` > «R34: si el recálculo falla, la confirmación se deshace» y «… ya_confirmado no recalcula» |

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit`, exit 0, con los archivos de
  T2.3 y T2.7 que había en disco en ese momento.
- `pnpm run lint`: exit 0, `0 errors, 249 warnings` (heredados). `eslint` sobre los 15 archivos de esta tanda: exit
  0, sin avisos.
- `pnpm exec vitest run` sobre la base `servi_logistic_slt121`: 18 archivos, 526 tests; 526 pasados, 0 fallidos, 0
  saltados.

  | Archivo | Pasados |
  |---|---|
  | `mora-empresa-repository` | 15/15 |
  | `pago-plataforma-recalcula-mora` | 7/7 |
  | `pagos-plataforma` (unit) | 28/28 |
  | `factura-plataforma-mora` | 5/5 |
  | `mora-congelar` | 10/10 |
  | `pago-plataforma-confirmacion` | 22/22 |
  | `pago-plataforma-por-fuera` | 21/21 |
  | `factura-gracia` | 13/13 |
  | `mora` | 37/37 |
  | `catalogo-y-choke-point` | 58/58 |
  | `pago-plataforma-confirmacion-service` | 99/99 |
  | `env-example-sin-valores` (guardia) | 4/4 |
  | `historial-accion-escrituras-cubiertas` (guardia) | 105/105 |
  | `historial-accion-punto-unico` (guardia) | 7/7 |
  | `historial-accion-sin-datos-cliente` (guardia) | 34/34 |
  | `pais-sin-literales` (guardia) | 35/35 |
  | `plataforma-solo-en-lista` (guardia) | 7/7 |
  | `sql-a-mano-por-empresa` (guardia) | 19/19 |
- Los cuatro archivos de integración (SLT-60, SLT-143 y los dos nuevos), en tres pasadas seguidas: 65/65 en cada una.

Veredicto: T2.1, T2.2, T2.4 y T2.5 hechas y en verde contra `servi_logistic_slt121`. Queda abierto el deadlock con la
empresa congelada (P3), que pide `FOR NO KEY UPDATE` en las funciones de la Tanda 1.

## Deadlock: opción (a) (decisión del 2026-11-20)

- **Qué se eligió:** `FOR NO KEY UPDATE` sobre `organizacion` en las tres funciones `organizacion_mora_*`
  (`db/migrations/20261126120100_mora_congelamiento/migration.sql`), con `design.md` §2 y `requirements.md`
  enmendados. Cierra el cruce que la Tanda 2 dejaba abierto (la empresa anula su pago por confirmar mientras el
  superadmin lo confirma, con la empresa congelada): `FOR NO KEY UPDATE` no choca con el `FOR KEY SHARE` de la FK del
  contra-asiento y sigue serializando a las tres funciones entre sí.
- `lib/planes/mora-recalcular.ts`: solo el comentario (habla de `FOR NO KEY UPDATE`). La lectura previa sin bloquear
  se queda: ahorra la llamada en el caso normal (empresa no congelada).
- **Prueba:** `tests/integration/repositories/pago-plataforma-recalcula-mora.test.ts` > «decisión §2: … cruces
  forzados — la confirmación termina sin 40P01, la anulación responde forbidden y la empresa sigue congelada»: verde
  contra `servi_logistic_slt121` (8/8 en el archivo; salida en la Tanda 3).
- **Desvío 10 aceptado:** `organizacion_mora_congelar` con una empresa que no existe lanza `P0002` (Tanda 1,
  «Desvíos»). El design no lo dice; queda así.

## Tanda 3: T3.1, T3.2 y T3.3 (backend_dev, 2026-11-21)

La empezaron dos agentes que se cortaron; esta pasada revisa lo que dejaron contra el spec, lo completa y lo verifica.
Base: `servi_logistic_slt121` (el archivo `dburl_SLT121_NO_TOCAR` del leader). Sin migraciones nuevas.

### Revisión contra el spec
- **T3.1 (§6.2, §6.3; R13, R14):** `exigirEmpresaOperativa()` va justo después de `conEmpresaDeLaKey` y antes del
  cuerpo en las seis rutas (`carga`, `carga/{cargaId}/generate`, `habilitar`, `{numGuia}/cancelar`,
  `orden/{id}/generate` y el `DELETE` de `orden/{id}`; el `GET` de esa ruta no la lleva), y en `carga-masiva/chunk`
  tras la sesión y el rol. La cotización y los `GET` no la llevan. El 403 va en la response compartida `Forbidden`
  de `openapi-spec.ts` y del YAML (las seis rutas ya la referencian por `$ref`), en `CHANGELOG.md` y en la guía
  (4.3, 4.4, 8.1 y el historial). Completo.
- **T3.2 (§4; R7, R9, R26–R29):** `jobs-mora.ts` con `mora_diaria` (06:30 UTC, dedupe `mora_diaria:<AAAA-MM-DD>`,
  `RECURRENTES_DE_PLATAFORMA`, siembra) y `mora_aviso_correo` (zod de las tres formas, relee el estado, un correo por
  maestro, error sin correos). Cableado en `procesar-jobs/route.ts`, `MODULO_POR_JOB` (`nucleo`, Tanda 2) y
  `SIEMBRAS_RECURRENTES`. Faltaba la prueba de idempotencia de la siembra contra Postgres que exige
  `jobs-recurrentes-con-siembra` (ficha 313, frente 4): añadida.
- **T3.3 (§4.2; R25–R28):** plantilla `mora-aviso.ts` con los tres asuntos del design y el botón a `/mi-plan`;
  `factura-emitida.ts` pinta «Paga hasta el dd/mm/aaaa» solo con total > 0, con `fechaLimiteDePago` (la gemela de
  `factura_plataforma_mora`); `jobs-factura-aviso.ts` lee al enviar la gracia vigente de la empresa
  (`MoraEmpresaRepository.graciaDeLaEmpresa`, nueva). El único productor de `FacturaEmitidaParams` en `lib/` es
  `jobs-factura-aviso.ts`, y pasa `gracia`. `mi-plan-solo-maestro.guardia` enmendada. Completo.

### Archivos
Creados (los seis primeros, por los agentes anteriores):
- `lib/planes/jobs-mora.ts`; `lib/services/email/plantillas/mora-aviso.ts`;
- `tests/integration/api/api-key-empresa-congelada.route.test.ts`,
  `tests/integration/api/carga-masiva-empresa-congelada.route.test.ts`;
- `tests/unit/planes/jobs-mora.test.ts`, `tests/unit/services/email/plantilla-mora-aviso.test.ts`;
- `tests/integration/db/siembra-mora-diaria-idempotente.test.ts` (esta pasada).

Modificados por los agentes anteriores (revisados): las siete rutas de T3.1, `lib/api/openapi-spec.ts`,
`docs/api/api-key-openapi.yaml`, `docs/api/CHANGELOG.md`, `docs/ayuda/oficina/guia-integracion-api.md`,
`app/api/cron/procesar-jobs/route.ts`, `scripts/siembra-jobs-recurrentes.ts`,
`lib/services/email/plantillas/factura-emitida.ts`, `lib/planes/jobs-factura-aviso.ts`,
`lib/interfaces/repositories/IMoraEmpresaRepository.ts` y `lib/repositories/MoraEmpresaRepository.ts`
(`graciaDeLaEmpresa`), y los tests `api-key-empresa`, `mora-empresa-repository`, `jobs-factura-aviso`,
`plantilla-factura-emitida`, `mi-plan-solo-maestro.guardia` y `jobs-handler-por-tipo.guardia`.

Modificados en esta pasada:
- `lib/services/email/plantillas/mora-aviso.ts`: `facturas` de `ContenidoAvisoMora` pasa a `readonly` (la plantilla
  solo la lee; el test le pasaba un literal `as const`).
- `lib/planes/mora.ts` y `tests/unit/planes/mora.test.ts`: la clave `MORA_TEXTOS.superadmin` pasa a
  `MORA_TEXTOS.plataforma`. El literal `superadmin:` ponía roja `superadmin-fuera-de-empresa.guardia` (rojo que venía
  de la Tanda 2). Nadie más la usa todavía; T4.3 la leerá con el nombre nuevo.
- `docs/api/api-key-openapi.yaml`: el comentario dice «design 6.3» sin `§` (`api-artefactos-url-y-simbolos`).
- `docs/ayuda/oficina/guia-integracion-api.md` (8.1): la frase de `empresa_congelada` va después de «En cualquier
  otro endpoint, contacte a la empresa: …», que es una frase fija de `docs-marca-heredada` (SL-16 R7).
- `gracia: 7` en el literal de `FacturaEmitidaParams`: `tests/unit/notificaciones/emitir-factura-emitida.test.ts` y
  `tests/unit/planes/factura-moneda-plataforma.test.ts`.
- Inventarios cerrados de la cola con `mora_diaria` (y `mora_aviso_correo` en los de handlers):
  `tests/integration/api/procesar-jobs-geocodificacion.test.ts` (recurrencias: 7),
  `tests/integration/api/procesar-jobs-webhook-estado.test.ts`, `tests/unit/api/procesar-jobs-registro.test.ts`,
  `tests/unit/services/jobs-registro.test.ts` y `tests/unit/guards/jobs-recurrentes-con-siembra.guardia.test.ts`
  (censo y prueba de idempotencia).
- `tests/unit/guards/openapi-carga-claves-reales.guardia.test.ts`: ejecuta la ruta de la carga, que ahora pasa por la
  puerta; a la puerta REAL se le inyecta un lector con la empresa al día (el `getPrismaClient` doble de la guardia
  lanza a propósito).

### R → test (Tanda 3)
| R | Test |
|---|---|
| R7 | `jobs-mora.test.ts` > «SLT-121/R7 …» (cada empresa, mismo «ahora» y gracia); `siembra-mora-diaria-idempotente.test.ts` (06:30 UTC) |
| R9 | `jobs-mora.test.ts` > «R9: repetir la corrida …»; `siembra-mora-diaria-idempotente.test.ts` (una fila por día) |
| R13 | `api-key-empresa-congelada.route.test.ts`: las seis rutas en 403 `empresa_congelada` sin efectos; los `GET` y la cotización igual y sin consultar; descongelar vale desde la petición siguiente |
| R14 | `carga-masiva-empresa-congelada.route.test.ts`: el lote entero se rechaza, el 403 llega antes del 422, control al día en 200 |
| R25 | `plantilla-factura-emitida.test.ts` > «SLT-121/R25 …» (total > 0 sí; 0 y negativo no); `jobs-factura-aviso.test.ts` > «SLT-121/R25 …»; `mora-empresa-repository.test.ts` > «R25: la gracia de la empresa del contexto …» |
| R26 | `jobs-mora.test.ts` > «SLT-121/R26 …» (relee la factura: pagada, con otra fecha o vencida no sale); `plantilla-mora-aviso.test.ts` > «SLT-121/R26 …» |
| R27 | `jobs-mora.test.ts` > «SLT-121/R27 …»; `plantilla-mora-aviso.test.ts` > «SLT-121/R27 …» |
| R28 | `jobs-mora.test.ts` > «SLT-121/R28 …»; `plantilla-mora-aviso.test.ts` > «SLT-121/R28 …» (pago, gracia y a mano) |
| R29 | `jobs-mora.test.ts` > «SLT-121/R29 — una empresa que falla no frena a las demás» y «— un envío que falla» |

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit` sin errores. Antes de esta pasada daba
  5 errores (`emitir-factura-emitida`, `factura-moneda-plataforma` y tres en `plantilla-mora-aviso`).
- `pnpm run lint`: exit 0, `✖ 249 problems (0 errors, 249 warnings)` (heredados). `eslint` sobre los 16 archivos de
  esta pasada: exit 0, sin avisos.
- `pnpm run test:guardias`: 361 archivos, 357 verdes, 4 rojos (5453 pasados, 1 saltado). Los cuatro, resueltos:
  - `api-artefactos-url-y-simbolos` (`§` en el YAML), `docs-marca-heredada` (frase de 8.1) y
    `superadmin-fuera-de-empresa` (`lib/planes/mora.ts`): arreglados arriba;
  - `ordenes-columnas-money-safe`: timeout de 20 s con todas las guardias a la vez; sola, verde.
  - Vueltas a correr las cuatro + `mora`, `guia-api-fuente-unica`, `guia-api-descargas`,
    `openapi-contrato-en-reparto` y `openapi-466-descripciones`: 9 archivos, 192/192.
- `pnpm exec vitest run` sobre 82 archivos (las 106 coincidencias por import pasaban de 80; elegidos: procesar-jobs,
  siembra, catálogo de módulos, OpenAPI, rutas api-key, carga masiva, plantillas, notificaciones de factura, jobs de
  planes y los de la Tanda 3): 80 verdes, 1040 pasados, 5 fallidos:
  - 4 de `openapi-carga-claves-reales.guardia` (500 por la puerta): arreglados; solo, 16/16.
  - 1 de `carga-nombre-duplicado-real` (SLT-93): «version de Postgres no reconocida: expected 160001 to be greater
    than or equal to 170000». La base local es PG 16 y el test exige ≥ 17; ajeno a esta feature.
  - La primera pasada (65 archivos, antes de los inventarios) dio además 8 rojos de inventarios cerrados de la cola
    (`procesar-jobs-geocodificacion`, `procesar-jobs-webhook-estado`, `procesar-jobs-registro`,
    `jobs-recurrentes-con-siembra`): arreglados arriba y verdes en la segunda.
- `pago-plataforma-recalcula-mora.test.ts` + `siembra-mora-diaria-idempotente.test.ts`, `--reporter=verbose`: 2
  archivos, 9/9, entre ellos «decisión §2: … cruces forzados» y la siembra.

Veredicto: T3.1, T3.2 y T3.3 completas y coherentes con el spec; typecheck, lint, guardias y los tests de la tanda en
verde (salvo el rojo de versión de Postgres de SLT-93, ajeno).

## Tanda 4: T4.1 (backend_dev, 2026-11-21)

### Archivos

Creados:
- `lib/types/mora.ts`: esquemas zod del borde (`moraDeEmpresaSchema`, `fijarGraciaSchema`, `descongelarSchema`),
  `MoraEmpresaVista`, `FacturaConSaldoVista` y los resultados `MoraDeEmpresaResult`, `FijarGraciaResult`,
  `DescongelarResult`; reexporta los tipos del dominio (`EstadoMora`, `FacturaVencida`, `FilaMora`,
  `OrganizacionMora`, `FilaHistorialMora`).
- `lib/interfaces/services/IMoraEmpresaService.ts` y `lib/services/MoraEmpresaService.ts` (design §5.3).
- `lib/actions/_shared/mora-empresa.ts` (`construirMoraEmpresaService`, composition root fuera de "use server").
- `lib/actions/mora-empresa.ts` (design §5.4): `avisoMoraDelLayout`, `verMoraDeEmpresaAction`,
  `fijarGraciaEmpresaAction`, `descongelarEmpresaAction`.
- `tests/unit/services/mora-empresa-service.test.ts`, `tests/unit/actions/mora-empresa.test.ts`.

Modificados:
- `lib/modulos/reparto.ts`: `"mora-empresa": "nucleo"` en `MODULO_POR_ACTION`.
- `lib/planes/mora.ts`: `MORA_TEXTOS.plataforma.errores` (días, motivo, hasta, no congelada, no encontrada, sin
  permiso).
- `lib/interfaces/repositories/IMoraEmpresaRepository.ts` y `lib/repositories/MoraEmpresaRepository.ts`:
  `existeEmpresa(organizacionId)` (en `comoPlataforma`; la RLS de `organizacion` no deja verla con `servi_app`).
- `tests/integration/repositories/mora-empresa-repository.test.ts`: caso de `existeEmpresa`.
- `tests/unit/planes/jobs-mora.test.ts`: el doble del repositorio suma `existeEmpresa`.

### Desvíos frente al spec
- **`not_found` también en `fijarGracia` y `descongelar`** (el design §5.3 solo lo pone en `moraDeEmpresa`): el
  repositorio lanza sin empresa en `fijarGracia` y en `descongelarAMano` respondería `no_congelada`, que es falso.
  Para eso, método nuevo `existeEmpresa` en el repositorio. Un `organizacionId` que no es uuid también es
  `not_found` (no `validation_error`): la empresa la liga el servidor, no la escribe nadie.
- **`MoraEmpresaVista` más ancha que `EstadoMora`**: trae `facturas` (todas las de saldo, con `vencida`),
  `facturasVencidas` (también durante un descongelamiento a mano, cuando `EstadoMora` no las lleva y R32 pide
  verlas) y `descongelar: { desde, hasta, porDefecto }` (hoy, hoy + 60 y hoy + 7 de la plataforma) para el diálogo.
- **El aislamiento del banner vive en `avisoMoraDelLayout`**: si la lectura lanza, devuelve `null` y lo registra con
  `console.error` (design §7.1 lo pide a la lectura; el layout no necesita su propio `try`).
- **`@sin-superficie` en las cuatro actions**: la guardia `superficie-de-uso` exige que una action sea alcanzable
  desde una ruta. Las montan T4.2 y T4.3; quien las cablee debe quitar la anotación (la guardia lo exige: la
  excepción caduca).

### R → test (Tanda 4)
| R | Test |
|---|---|
| R3 | `mora-empresa-service.test.ts` > «fijarGracia — R3»: 1, 15 y 60 se guardan; `null` vuelve a la global; `sin_cambio`; 0, 61, 7.5, -3, "15" y ausente → `validation_error` sin tocar el repositorio |
| R4 | `mora-empresa-service.test.ts` > «R4: solo el superadmin …» (maestro, admin, mensajero y sin sesión × 3 métodos, sin llamadas); `mora-empresa.test.ts` > «R4: un rol de empresa no llega a la base» (servicio real con repositorio que lanza) |
| R22 | `mora-empresa-service.test.ts` > «descongelar — R22, decisión P4»: extremos hoy y hoy + 60; hoy de la plataforma a las 23:30; ayer, hoy + 61, 30 de febrero y otro formato; motivo vacío, de espacios, de 201 y de 200; `no_congelada`; `not_found` |
| R24 | `mora-empresa-service.test.ts` > «avisoDeMiEmpresa — R24» (maestro y admin leen; mensajero, superadmin, adminTienda y sin sesión → `null` sin leer; al día; congelada); `mora-empresa.test.ts` > «el banner del layout» (fallo → `null`) |
| R32 | `mora-empresa-service.test.ts` > «moraDeEmpresa — R31, R32» (gracia global y propia, estado, facturas, vencidas, rango, historial; descongelada a mano con vencidas); `mora-empresa.test.ts` > «la empresa ligada manda»; `mora-empresa-repository.test.ts` > «R32: existeEmpresa …» |
| R33 | `mora-empresa-service.test.ts` > «R33: una empresa que no existe responde not_found …» |

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit` sin errores.
- `pnpm run lint`: exit 0, `✖ 249 problems (0 errors, 249 warnings)` (heredados, los mismos que en la Tanda 3).
  `eslint` sobre los 13 archivos tocados: exit 0, sin avisos.
- `pnpm exec vitest run` de `mora-empresa-service`, `mora-empresa` (actions), `jobs-mora` y `mora`: 4 archivos,
  136/136.
- `pnpm exec vitest run` de `mora-empresa-repository` (Postgres real) + guardias `modulos-reparto`,
  `use-server-exports-async`, `use-server-sin-reexport-de-tipos`, `superadmin-fuera-de-empresa`,
  `plataforma-solo-en-lista`, `sql-a-mano-por-empresa`, `historial-acciones-solo-lectura` e
  `historial-accion-escrituras-cubiertas`: 9 archivos, 230/230 (el de integración, 17/17 con `existeEmpresa`).
- `pnpm run test:guardias`: 361 archivos, 360 verdes, 1 rojo (5456 pasados, 1 saltado): `superficie-de-uso` R-A con
  las cuatro actions nuevas. Arreglado con `@sin-superficie` (arriba); vuelto a correr con `mora-empresa` y
  `use-server-exports-async`: 3 archivos, 32/32.

Veredicto: T4.1 completa; servicio, actions y tipos listos para T4.2 y T4.3, con typecheck, lint, guardias y sus tests
en verde.

## Tanda 4: T4.2 (frontend_dev, 2026-11-21)

### Archivos
Creados:
- `app/(app)/_components/AvisoMora.tsx`: el banner (design §7.1), Server Component sin `"use client"`, sobre
  `components/ui/alert`. Textos de `MORA_TEXTOS.banner`; `role="status"` (en plazo, descongelada a mano) o
  `role="alert"` (vencida, congelada); `al_dia` y `null` no pintan nada. «Ver facturas» (`/mi-plan`) solo en
  `en_plazo` y solo si el rol está en `ROLES_MI_PLAN`.
- `tests/components/AvisoMora.test.tsx` (R24).

Modificados:
- `app/(app)/layout.tsx`: quinta posición del `Promise.all` de la rama de empresa,
  `esAccesoTotal(actor.rol) ? avisoMoraDelLayout() : null` (los demás roles, `null` literal sin promesa; el
  superadmin y sin sesión, `null`). `<AvisoMora>` entre la hamburguesa y `{children}`, como hermano.
- `lib/actions/mora-empresa.ts`: quitada solo la línea `@sin-superficie` de `avisoMoraDelLayout`.
- `tests/components/AppLayout.test.tsx`: doble de `@/lib/actions/mora-empresa` y bloque «SLT-121 R24 — el banner de
  la mora en el layout».
- `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts`: `AvisoMora.tsx` en la autocomprobación, en `permitidos`
  y en la lista exacta de `href` a `/mi-plan` (design §10 la enmienda).

### Desvíos frente al spec
- La guardia de SLT-91 también fija la lista exacta de archivos con `href="/mi-plan"`; el design §10 solo nombra
  `permitidos`. El banner sí lleva un `href`, así que entra en las dos listas, con su condición a `ROLES_MI_PLAN`
  probada en `AvisoMora.test.tsx`.
- El enlace se condiciona con `ROLES_MI_PLAN` y no con `rol === "maestro"`: es la constante única de SLT-91 R5.

### R → test (Tanda 4: T4.2)
| R | Test |
|---|---|
| R24 | `tests/components/AvisoMora.test.tsx`: en plazo con fecha y enlace para el maestro (`status`); admin sin enlace; vencida (`alert`, maestro y admin); congelada (`alert`); descongelada a mano (`status`, fecha hasta); `al_dia` y `null` sin banner |
| R24 | `tests/components/AppLayout.test.tsx` > «SLT-121 R24 — el banner de la mora en el layout»: maestro y admin consultan una vez y ven el banner; mensajero, adminTienda y superadmin no consultan ni ven banner; `null` → sin banner y la página se pinta |
| R24 | `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts` (enmendada): el único `href` nuevo a `/mi-plan` es el del banner |

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit` sin errores.
- `npx eslint` sobre los 6 archivos tocados: `ESLint: No issues found`, exit 0.
- `pnpm exec vitest run` de `AvisoMora`, `AppLayout`, `mora-empresa` (actions) y `mi-plan-solo-maestro`: 4 archivos,
  58/58.
- `pnpm exec vitest run` de las guardias `superficie-de-uso`, `asistente-panel-hermano`,
  `etiquetas-geograficas-sin-literal`, `modulos-reparto`, `push-alta-punto-unico`, `pwa-aviso-sin-recarga`,
  `revision-sinpe-no-bloquea`, `use-server-exports-async`, `use-server-sin-reexport-de-tipos`,
  `superadmin-fuera-de-empresa` + `tests/integration/app-layout-superadmin.test.tsx`: 10/11 archivos, 154/155; el
  rojo era `superficie-de-uso` R-A por las tres anotaciones de T4.3 (en curso en paralelo). Tras quitarlas T4.3,
  `superficie-de-uso` + `mora-empresa`: 2 archivos, 29/29.

Veredicto: T4.2 completa; banner de la mora en el layout para maestro y admin, con typecheck, lint, guardias y tests
en verde.

## Tanda 4: T4.3 (frontend_dev, 2026-11-21)

### Archivos

Creados:
- `app/(app)/plataforma/empresas/[organizacionId]/_components/MoraEmpresa.tsx` (design §7.2): sección «Plazo de pago
  y mora» (cliente). Gracia vigente («15 días (propia)» / «7 días (global)»), campo de 1 a 60 con «Guardar» y «Usar
  la global» (este, solo con gracia propia), estado con su fecha, tabla de facturas vencidas (número, fecha límite,
  saldo) con el saldo vencido, historial de la mora (R31, con `ACCION_LABELS`) y «Descongelar…» solo si está
  congelada: diálogo (`Modal`) con motivo (`Textarea`, `maxLength` 200) y «Habilitada hasta» (`min`/`max` =
  `descongelar.desde`/`hasta`, valor inicial `porDefecto`). Textos del dominio de `MORA_TEXTOS.plataforma` (estado,
  gracia, errores); los propios de la pantalla en `TEXTOS`.
- `tests/components/MoraEmpresa.test.tsx` (34 casos).

Modificados:
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`: `leerMora` aislada (throw o estado distinto de `ok` →
  `null`) en el `Promise.all`; `<MoraEmpresa>` al principio de la pestaña «Empresa», antes de `PlanEmpresa`, con
  `fijarGraciaEmpresaAction` y `descongelarEmpresaAction` ligadas con `.bind(null, empresa.organizacionId)`.
- `lib/actions/mora-empresa.ts`: quitadas las tres `@sin-superficie` de `verMoraDeEmpresaAction`,
  `fijarGraciaEmpresaAction` y `descongelarEmpresaAction` (la de `avisoMoraDelLayout` es de T4.2).

### Desvíos frente al spec
- **Tabla de facturas = `facturasVencidas`**, no `facturas`: R32 pide «las facturas vencidas con su saldo» y así se
  ven también durante un descongelamiento a mano. Las no vencidas con saldo no se pintan (el estado «En plazo» ya
  da la fecha límite más próxima).
- **La validación del cliente repite la del servidor** (gracia entera de 1 a 60; motivo recortado de 1 a 200; fecha
  dentro de `descongelar.desde … hasta`): lo que ya se sabe que caerá no se manda. El formulario de la gracia lleva
  `noValidate` para que el error sea el de `FormField` (`aria-invalid` + texto), no la burbuja nativa de `min`/`max`.
- El entero se comprueba con `String(Number.parseInt(t, 10)) === t`, no con `/^\d+$/`: la guardia
  `lectura-guia-unica` (R567) prohíbe esa regex suelta en `app/`.
- **`fijarGracia` con `forbidden` o `not_found`** muestra el mensaje como `role="alert"` bajo el formulario (el design
  §7.2 solo habla del diálogo de descongelar).

### R → test (Tanda 4: T4.3)
| R | Test (`tests/components/MoraEmpresa.test.tsx`) |
|---|---|
| R3 | «SLT-121 R3, R32 — cambiar o quitar la gracia propia»: «Guardar» manda `{ dias: 30 }` y refresca; «Usar la global» manda `{ dias: null }`; «0», «61», «», «-3» y «7.5» no llegan al servidor y marcan el campo; `validation_error` del servidor bajo el campo; `forbidden` como alerta |
| R22 | «SLT-121 R22, R32 — descongelar a mano»: sin botón si no está congelada (4 estados); el diálogo propone hoy + 7 con `min`/`max` y `maxLength` 200; manda el motivo recortado y la fecha, cierra y refresca; sin motivo y fecha fuera de rango no llegan al servidor; `no_congelada`, `not_found` y `forbidden` en el diálogo, que sigue abierto; `validation_error` bajo su campo |
| R31 | «SLT-121 R31 — el historial de la mora»: fecha, acción (`ACCION_LABELS`), quién o «Sistema», detalle (antes → después, monto); vacío |
| R32 | «SLT-121 R32 — lo que ve el superadmin»: gracia propia y global con su valor; los 5 estados con su fecha; facturas vencidas con número, fecha límite y saldo, y saldo vencido; vencidas también descongelada a mano; sin vencidas; lectura `null` → «No se pudo cargar la mora» |

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit` sin errores.
- `npx eslint` sobre `MoraEmpresa.tsx`, `page.tsx`, `lib/actions/mora-empresa.ts` y el test: `ESLint: No issues found`,
  exit 0.
- `pnpm exec vitest run` de `MoraEmpresa`, `mora-empresa` (actions) y las guardias `superficie-de-uso`,
  `superadmin-fuera-de-empresa`, `plataforma-solo-en-lista`, `pais-sin-literales`, `use-server-exports-async` y
  `vistas-superficies-declaradas`: 8 archivos, 146/146.
- `pnpm run test:guardias`: 361 archivos, 357 verdes, 3 saltados, 1 rojo (5429 pasados): `lectura-guia-unica` por
  `/^\d+$/` en `MoraEmpresa.tsx`. Arreglado (arriba); vuelto a correr `MoraEmpresa`, `lectura-guia-unica`,
  `mora-empresa` (actions), `superficie-de-uso` y `superadmin-fuera-de-empresa`: 5 archivos, 85/85; typecheck y
  eslint otra vez limpios. Con el caso «7.5» añadido, `MoraEmpresa`: 34/34.
- Sin base de datos: ningún test de T4.3 la necesita. Sin E2E: lo cubre T5.1.

Veredicto: T4.3 completa; sección de la mora del superadmin con gracia propia y descongelar a mano, con typecheck,
lint, guardias y tests en verde.

## Tanda 5: T5.1 (frontend_dev, 2026-11-21)

### Archivos
Creados:
- `e2e/mora-congelamiento.spec.ts` (proyecto `dinero`, serie, 6 casos; design §11).

Modificados:
- `playwright.config.ts`: solo la línea `"mora-congelamiento"` en `dinero`, con su comentario `SLT-121 · R35`.

### Siembra (como dueño, antes de congelar)
`altaDeEmpresa` + `prepararAcceso` + `sembrarDatos` (`_dos-empresas-fixture`); secreto conocido para la API key
sembrada (técnica de `guia-api-ejemplos-ejecutables.spec.ts`); distrito de la plantilla enlazado a la zona; un
`admin` y una tienda (`adminTienda`) con `crearUsuarioE2E`; plan custom con 500,00 por orden y dos órdenes con
cargo (`_planes-fixture`); la factura se cierra con el atajo de `pago-plataforma-confirmacion.spec.ts`
(`factura_plataforma_cerrar` con `fin_natural_at + 6 min`): N.º 1, total 1000,00. Después,
`organizacion_mora_congelar(org, vence_at + 30 min, 7)` con el `vence_at` leído de `factura_plataforma_mora`:
00:30 de la plataforma del día en que vence → `congelada`. Los logins (maestro, admin, tienda, superadmin) van
DESPUÉS de congelar (R10).

### Desvíos frente al spec
- **El `hasta` de la factura no se mueve 8 días atrás ni se fija gracia propia 1** (design §11): el trigger
  `factura_plataforma_inmutable` rechaza con `SL118` cualquier cambio de una cerrada, también al dueño. En su lugar
  el `ahora` de `organizacion_mora_congelar` es el de la madrugada en que la factura ya vence (el mismo artificio de
  reloj que el cierre, solo para esta empresa desechable). Sin filas escritas a mano: todo pasa por funciones de la
  base, servicios y fixtures existentes.
- **Los pasos 2 y 6 («crear una orden») los hace la tienda (`adminTienda`), no el `admin`**: el `admin` no tiene
  ninguna pantalla para crear órdenes. La única creación por pantalla es la carga masiva, que es solo de
  `adminTienda` (`app/(app)/ordenes/page.tsx:90` y `app/api/ordenes/carga-masiva/chunk/route.ts:115`). El `admin`
  sí se recorre para el banner (R24): lo ve congelada y no lo ve al terminar; el caso 6 afirma además que no tiene el
  botón «Carga masiva». **R35 (3) y (7) nombran al `admin`; hay que enmendar el texto de R35 o decidir otra cosa.**
- **HALLAZGO para el leader (R14, no del test):** con la empresa congelada, el chunk de la carga masiva responde 403
  con `message: "Empresa suspendida por falta de pago."` (el E2E lo afirma sobre la respuesta), pero la pantalla
  pinta `No se pudo validar el archivo (estado 403).` (`OrdenesCargaUpload.tsx > mensajeDeError`, que solo mira el
  status de `ChunkRequestError`). R14 pide ese mensaje en la carga masiva por pantalla, y el design §6.4 dice que el
  texto exacto «se garantiza en la API, la carga masiva y el banner». El E2E afirma «un error en pantalla»
  (`role="alert"` en el diálogo), como dice el design §11, y registra el texto con `MEDIDO`. No lo arreglo (fuera de
  T5.1): pide una tarea de frontend en la carga masiva o aceptar el texto actual.

### R → test (Tanda 5: T5.1)
| R | Test (`e2e/mora-congelamiento.spec.ts`) |
|---|---|
| R35 (1) | `beforeAll`: `organizacion_mora_congelar` → `congelada`, `congelada_at` no nula |
| R10 | `beforeAll` (los cuatro logins con la empresa congelada) y caso 1 |
| R24, R35 (2) | caso 1: maestro (en `/wallet`) y admin (en `/ordenes`) ven el `alert` con «Empresa congelada por falta de pago. …»; caso 6: ninguno lo ve |
| R12, R14, R35 (3) | caso 2: el chunk responde 403 con «Empresa suspendida por falta de pago.» y `empresa_congelada`, el diálogo muestra un `alert`, no hay «Confirmar y cargar», la remisión no existe y el total de órdenes de la empresa no cambia |
| R13, R35 (4) | caso 3: `POST /api/ordenes/api-key/carga` → 403 con el cuerpo exacto, sin orden; `GET /api/ordenes/api-key` → 200 |
| R11, R20, R35 (5) | caso 4: el maestro registra el pago del total desde la wallet; queda en el libro y la empresa sigue congelada |
| R19, R30, R32, R35 (6) | caso 5: la sección «Plazo de pago y mora» dice `congelada`; el superadmin confirma; `congelada_at` nula; tras recargar, «Al día» y la fila «Descongeló la operación por un pago» en «Historial de la mora» |
| R35 (7) | caso 6: sin banner y la tienda crea la orden por la carga masiva («Confirmar y cargar 1 nueva», la remisión en su empresa, sin 5xx) |
| R18 | `e2e/dos-empresas-humo.spec.ts` (sin cambios), corrido abajo |

### Verificación (salida real)
Base desechable `servi_logistic_slt121_e2e` (mismo servidor que la de la feature, solo cambia el nombre): `DROP` /
`CREATE`, `pnpm exec prisma migrate deploy` («All migrations have been successfully applied.») y `pnpm run db:seed`
(«Seed de catalogos completado (rol, order_status, vehiculos).»). `next build` con
`NEXT_PUBLIC_APP_URL=http://localhost:3044` y `NODE_OPTIONS=--max-old-space-size=8192`: exit 0. Todo en serie, sin
build y tests a la vez.

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit` sin errores.
- `npx eslint e2e/mora-congelamiento.spec.ts playwright.config.ts`: `ESLint: No issues found`, exit 0.
- `pnpm exec vitest run tests/unit/guards/e2e-sin-saltos.guardia.test.ts`: 1 archivo, 38/38.
- `E2E_PUERTO=3044 pnpm exec playwright test e2e/mora-congelamiento.spec.ts --project=dinero --reporter=list`,
  corrida 1:
  ```
  MEDIDO factura N.º 1: total=1000.00; congelar → {"facturas":[{"id":"7065c59e-…","saldo":"1000.00","numero":1}],"resultado":"congelada","saldo_vencido":"1000.00"}
    ✓  1 … 1. con la empresa congelada, el maestro y el admin entran y ven «Empresa congelada por falta de pago» (R10, R24, R35) (7.0s)
  MEDIDO error de la carga masiva congelada: «No se pudo validar el archivo (estado 403).»
    ✓  2 … 2. la tienda intenta crear una orden por la carga masiva: 403 «Empresa suspendida…», un error en pantalla y ninguna orden (R12, R14, R35) (3.2s)
    ✓  3 … 3. la API por key responde 403 con el cuerpo de R13 a una carga, sin orden, y 200 a una consulta (R13, R35) (288ms)
    ✓  4 … 4. el maestro registra el pago a la plataforma del total desde la wallet (R11, R35) (2.8s)
    ✓  5 … 5. el superadmin confirma el pago y «Plazo de pago y mora» pasa a «Al día» con la fila «descongelada por pago» (R19, R30, R32, R35) (4.8s)
    ✓  6 … 6. sin banner para el maestro ni el admin, y la tienda vuelve a crear la orden por la carga masiva (R24, R35) (9.8s)
    6 passed (1.4m)
  ```
- Corrida 2, sobre la misma base: `6 passed (1.1m)`, 0 failed, 0 flaky, 0 skipped.
- `E2E_PUERTO=3044 pnpm exec playwright test e2e/dos-empresas-humo.spec.ts --project=aislamiento --reporter=list`
  (arrastra `plataforma-vacia` por `dependencies`): `18 passed (3.8m)` (10 de `plataforma-vacia`, 8 del humo).
- `E2E_PUERTO=3044 pnpm exec playwright test --project=dinero --reporter=list`: `138 passed (18.3m)`, 0 failed,
  0 flaky, 0 skipped; los 6 de `mora-congelamiento` en verde (66–71). Ningún spec ajeno falló.

Veredicto: T5.1 completa; E2E de la mora en verde dos veces seguidas, con `dinero` entero y el humo de dos empresas en
verde; quedan para el leader el desvío del `admin` en R35 y el texto de la carga masiva frente a R14.

## Tanda 5: arreglo R14 (pantalla de carga masiva)

Cierra el HALLAZGO de T5.1: con la empresa congelada, la pantalla de carga masiva pintaba
«No se pudo validar el archivo (estado 403).» en vez del texto exacto de R14.

### Archivos
- `app/(app)/ordenes/_components/carga-masiva-chunks.ts`: `ChunkRequestError` gana `codigo` (el `details.codigo`
  del cuerpo de error, `null` si no lo hay o no es JSON); `procesarEnChunks` lo lee con `codigoDeError(res)` antes
  de lanzar. Status y mensaje del error, sin cambios.
- `app/(app)/ordenes/_components/OrdenesCargaUpload.tsx`: `mensajeDeError` devuelve `MENSAJE_EMPRESA_CONGELADA`
  (importado de `lib/planes/mora.ts`, puro) cuando `codigo === "empresa_congelada"`; el resto de errores igual. El
  código va como constante local con comentario: `CODIGO_EMPRESA_CONGELADA` vive en `lib/planes/empresa-congelada.ts`,
  que arrastra `node:async_hooks` (vía `lib/db/contexto-empresa`) y no se puede importar desde un componente de cliente.
- `tests/components/CargaMasivaChunks.test.ts`: 2 casos SLT-121/R14 (403 de mora → `codigo = "empresa_congelada"`;
  cuerpo no JSON → `codigo = null`) y `codigo` nulo en el caso 401 existente.
- `tests/components/OrdenesCargaUpload.test.tsx`: 2 casos SLT-121/R14 (el `alert` es exactamente
  «Empresa suspendida por falta de pago.»; otro 403 sin ese código conserva «… (estado 403).»).
- `e2e/mora-congelamiento.spec.ts`: el caso 2 exige `toHaveText(TEXTO.suspendida)` en el `alert` del diálogo (antes
  solo `toBeVisible` + `MEDIDO`); título y cabecera del caso ajustados.

`OrdenesCargaMasivaButton.tsx` (toast del paso de confirmar) no se toca: con la empresa congelada el dry-run ya
falla antes, así que el botón de confirmar no llega a existir (el E2E afirma su ausencia).

### R → test
| R | Test |
|---|---|
| R14 | `tests/components/OrdenesCargaUpload.test.tsx` › «SLT-121/R14: un 403 empresa_congelada muestra exactamente «Empresa suspendida por falta de pago.»» y «… otro 403 sin ese codigo conserva el mensaje con el estado» |
| R14 | `tests/components/CargaMasivaChunks.test.ts` › «SLT-121/R14: lanza ChunkRequestError con codigo empresa_congelada …» y «… un cuerpo de error que no es JSON deja codigo en null» |
| R14 (E2E) | `e2e/mora-congelamiento.spec.ts` › caso 2 (`toHaveText("Empresa suspendida por falta de pago.")`) |

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit` sin errores.
- `npx eslint` de los 5 archivos tocados: `ESLint: No issues found`, exit 0.
- `pnpm exec vitest run tests/components/CargaMasivaChunks.test.ts tests/components/OrdenesCargaUpload.test.tsx tests/components/OrdenesCargaMasivaButton.test.tsx`:
  `Test Files 3 passed (3)`, `Tests 43 passed (43)`.
- Guardias `lib-no-importa-app`, `pais-sin-literales`, `lectura-guia-unica`, `e2e-sin-saltos`:
  `Test Files 4 passed (4)`, `Tests 97 passed (97)`.
- `next build` (`NEXT_PUBLIC_APP_URL=http://localhost:3044`, `NODE_OPTIONS=--max-old-space-size=8192`, `DATABASE_URL`
  en `servi_logistic_slt121_e2e`): exit 0. Después, en serie,
  `E2E_PUERTO=3044 pnpm exec playwright test e2e/mora-congelamiento.spec.ts --project=dinero --reporter=list`:
  los 6 casos ✓, incluido «2. la tienda intenta crear una orden por la carga masiva: 403 «Empresa suspendida…», el
  mismo texto en pantalla y ninguna orden (R12, R14, R35) (1.2s)»; `6 passed (27.5s)`, exit 0.

Veredicto: R14 cerrado en la pantalla de carga masiva; unit, componente y E2E en verde.

## Tanda 5: T5.3 — mapa consolidado R1–R35 → test (implementer, 2026-11-21)

Enmienda de R35 (humano, 2026-11-21: «Enmendar R35 a tienda»): `requirements.md` (R35 y la tabla de decisiones) y
`design.md` §11. La escritura la intenta y la hace la tienda (`adminTienda`); el `admin` ve el banner y ve que
desaparece. El E2E de T5.1 ya seguía ese camino, así que no cambia.

Integración = `tests/integration/`; unidad = `tests/unit/`; componentes = `tests/components/`.

| R | Test(s) |
|---|---|
| R1 | `integration/db/factura-plataforma-mora.test.ts` (tabla `_fixtures/fecha-limite-pago.ts`); `unit/planes/mora.test.ts` > «fechaLimiteDePago y venceEn con la tabla compartida» |
| R2 | `unit/config/factura-gracia.test.ts` |
| R3 | `integration/db/mora-migration.test.ts` (CHECK); `integration/repositories/mora-empresa-repository.test.ts` > «R3, R30 …»; `unit/services/mora-empresa-service.test.ts` > «fijarGracia — R3»; `components/MoraEmpresa.test.tsx` > «SLT-121 R3, R32 …» |
| R4 | `unit/services/mora-empresa-service.test.ts` > «R4: solo el superadmin …»; `unit/actions/mora-empresa.test.ts` > «R4: un rol de empresa no llega a la base» |
| R5 | `integration/db/mora-congelar.test.ts`; `integration/repositories/mora-empresa-repository.test.ts` > «R5, R28, R30 …» y «R5: subir la gracia sin dejar la factura en plazo …» |
| R6 | `integration/db/factura-plataforma-mora.test.ts`; `unit/planes/mora.test.ts` > «estaVencida» |
| R7 | `integration/db/mora-congelar.test.ts`; `mora-empresa-repository.test.ts` > «R7, R27, R30 …»; `unit/planes/jobs-mora.test.ts` > «SLT-121/R7 …»; `integration/db/siembra-mora-diaria-idempotente.test.ts` |
| R8 | `integration/db/mora-congelar.test.ts`; `unit/planes/mora.test.ts` > «enFranjaDeMadrugada»; `mora-empresa-repository.test.ts` > «R8 …» |
| R9 | `integration/db/mora-congelar.test.ts`; `mora-empresa-repository.test.ts` > «R9 …»; `unit/planes/jobs-mora.test.ts` > «R9 …»; `siembra-mora-diaria-idempotente.test.ts` |
| R10 | `integration/db/bloqueo-por-mora.test.ts` (las lecturas pasan); `e2e/mora-congelamiento.spec.ts` (`beforeAll` y caso 1) |
| R11 | `unit/actions/wallet-egresos-mora.test.ts`; `unit/db/extension-empresa-mora.test.ts`; `unit/guards/mora-permiso-solo-en-lista.guardia.test.ts`; E2E caso 4 |
| R12 | `integration/db/bloqueo-por-mora.test.ts` (`SL121` en escrituras de `servi_app`); `unit/actions/wallet-egresos-mora.test.ts` (`forbidden`); E2E caso 2 |
| R13 | `integration/api/api-key-empresa-congelada.route.test.ts`; `unit/db/extension-empresa-mora.test.ts`; E2E caso 3 |
| R14 | `integration/api/carga-masiva-empresa-congelada.route.test.ts`; `components/OrdenesCargaUpload.test.tsx` y `components/CargaMasivaChunks.test.ts` > «SLT-121/R14 …»; E2E caso 2 (texto exacto) |
| R15 | `unit/services/webhook-whatsapp-mora.test.ts`; `mora-permiso-solo-en-lista.guardia.test.ts` |
| R16 | `integration/db/bloqueo-por-mora.test.ts`, `bloqueo-por-mora-cobertura.test.ts` y `mora-migration.test.ts`; `unit/db/extension-empresa-mora.test.ts` (traducción) |
| R17 | `unit/cron/procesar-jobs-mora.test.ts`; `mora-permiso-solo-en-lista.guardia.test.ts` |
| R18 | `integration/db/mora-congelar.test.ts` y `bloqueo-por-mora.test.ts` (la otra empresa escribe); `e2e/dos-empresas-humo.spec.ts` |
| R19 | `integration/repositories/pago-plataforma-recalcula-mora.test.ts`; E2E caso 5 |
| R20 | `pago-plataforma-recalcula-mora.test.ts` > «R20 …»; E2E caso 4 (sigue congelada) |
| R21 | `integration/db/mora-congelar.test.ts`; `pago-plataforma-recalcula-mora.test.ts` > «R21 …» |
| R22 | `mora-empresa-repository.test.ts` > «R22, R28, R30 …», «decisión P5 …», «R22 … no_congelada»; `unit/services/mora-empresa-service.test.ts` > «descongelar — R22, decisión P4»; `components/MoraEmpresa.test.tsx` > «SLT-121 R22, R32 …» |
| R23 | `integration/db/mora-congelar.test.ts` |
| R24 | `unit/planes/mora.test.ts` > «estadoDeMora …»; `mora-empresa-repository.test.ts` > «R24, §6.2 …»; `unit/services/mora-empresa-service.test.ts` > «avisoDeMiEmpresa — R24»; `unit/actions/mora-empresa.test.ts` > «el banner del layout»; `components/AvisoMora.test.tsx`; `components/AppLayout.test.tsx` > «SLT-121 R24 …»; `unit/guards/mi-plan-solo-maestro.guardia.test.ts`; E2E casos 1 y 6 |
| R25 | `unit/services/email/plantilla-factura-emitida.test.ts` > «SLT-121/R25 …»; `unit/planes/jobs-factura-aviso.test.ts` > «SLT-121/R25 …»; `mora-empresa-repository.test.ts` > «R25 …» |
| R26 | `mora-empresa-repository.test.ts` > «R26 …»; `unit/planes/jobs-mora.test.ts` > «SLT-121/R26 …»; `unit/services/email/plantilla-mora-aviso.test.ts` > «SLT-121/R26 …» |
| R27 | `mora-empresa-repository.test.ts` > «R7, R27, R30 …»; `jobs-mora.test.ts` y `plantilla-mora-aviso.test.ts` > «SLT-121/R27 …» |
| R28 | `mora-empresa-repository.test.ts` (gracia y a mano); `pago-plataforma-recalcula-mora.test.ts` (pago); `jobs-mora.test.ts` y `plantilla-mora-aviso.test.ts` > «SLT-121/R28 …» |
| R29 | `jobs-mora.test.ts` > «SLT-121/R29 …» (empresa que falla, envío que falla); `mora-empresa-repository.test.ts` > «R30: si el registro falla …» |
| R30 | `mora-empresa-repository.test.ts`; `pago-plataforma-recalcula-mora.test.ts`; `unit/historial-accion/catalogo-y-choke-point.test.ts` > «SLT-121 R30»; guardias `historial-accion-escrituras-cubiertas` y `historial-accion-sin-datos-cliente` (P5); E2E caso 5 |
| R31 | `mora-empresa-repository.test.ts` > «R32, R31 …»; `unit/services/mora-empresa-service.test.ts` > «moraDeEmpresa — R31, R32»; `components/MoraEmpresa.test.tsx` > «SLT-121 R31 …» |
| R32 | `mora-empresa-repository.test.ts` > «R32, R31 …» y «R32: existeEmpresa …»; `mora-empresa-service.test.ts` > «moraDeEmpresa — R31, R32»; `unit/actions/mora-empresa.test.ts` > «la empresa ligada manda»; `components/MoraEmpresa.test.tsx` > «SLT-121 R32 …»; E2E caso 5 |
| R33 | `integration/db/factura-plataforma-mora.test.ts` (`42501`); `mora-empresa-repository.test.ts` > «R33 …»; `mora-empresa-service.test.ts` > «R33 …» |
| R34 | `integration/db/mora-congelar.test.ts` (pieza SQL); `pago-plataforma-recalcula-mora.test.ts` > «R34 …», «… ya_confirmado no recalcula» y «decisión §2: … cruces forzados» |
| R35 | `e2e/mora-congelamiento.spec.ts` (casos 1–6, R35 enmendado a la tienda) + `e2e/dos-empresas-humo.spec.ts` |

Los 35 requisitos tienen al menos un test concreto; ninguno queda sin cubrir.

Verificación de cierre: tras el merge con `origin/dev` (`448056ee`), el typecheck y los tests locales los mató el
sistema por falta de memoria. Por indicación del leader, la verificación del merge la hace el CI de #264 (no se
relanzó en local ni se corrió `./init.sh`).
