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
