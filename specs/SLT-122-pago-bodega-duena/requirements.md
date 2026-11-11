# SLT-122 «Pago al mensajero: solo la bodega dueña del cierre» — requirements (ruta ligera)

> Spec único de ruta ligera (`docs/specs.md > Tres rutas`): alcance, requisitos EARS, `## Tasks`,
> `## Archivos esperados` y `## Trazabilidad`. Escrito por spec_author el 2026-11-10.
> **Ver PA0:** la feature toca dinero y autorización; el suelo de `docs/specs.md` la manda a la
> ruta completa salvo que Carlos lo decida.

## Alcance

**El hueco (medido en el código, 2026-11-10).** `LiquidacionService.registrarPagoMensajero`
(`lib/services/LiquidacionService.ts:315-382`) solo mira el ROL (`esAccesoTotal`, `:319`) y el
ESTADO del cierre (`:333-335`). Lee el cierre con `obtenerCierreParaPago`
(`lib/repositories/LiquidacionPagoRepository.ts:273-296`), cuyo WHERE es solo `{ id }` y cuyo
`select` no trae el destino. Resultado: un `maestro` o `admin` (la central) puede registrar el pago
de un cierre `aprobado` cuyo destino es `bodega_satelite` de su empresa, llamando a la acción
`registrarPagoMensajeroAction` (`lib/actions/liquidacion.ts:137-151`) con ese `cierreId`.

Hallado en SLT-104 «Detalle de cierre de bodega en el detalle único (central)»
(`progress/features/SLT-104.md`, `progress/review_SLT-104.md:64-66`). Carlos, 2026-11-10: es un
hueco; solo la bodega dueña del cierre puede pagarlo.

**Por qué importa además del permiso.** SLT-73 (D4, `specs/SLT-73-dinero-satelite-al-conciliar/
requirements.md:41`) fija que la satélite paga a sus mensajeros y que eso se descuenta de su deuda
con la central. Un pago de la central contra un cierre de satélite es, por tanto, un posible
**doble pago** al mensajero.

**Quién es la bodega dueña, según el código.**
- El alcance de escritura de cierres vive en `CierresAdminService.resolveAlcance`
  (`lib/services/CierresAdminService.ts:527-540`): acceso total (`maestro`/`admin`) →
  `{ destinoTipo: "bodega_central", destinoZonaId: null }`; `adminSatelite` →
  `{ destinoTipo: "bodega_satelite", destinoZonaId: <su zona> }`; otro rol → `forbidden`. El
  repositorio lo traduce a WHERE con `alcanceWhere` (`lib/repositories/CierresAdminRepository.ts:
  851-858`).
- Fuera de alcance, las escrituras de cierres responden «no encontrado», igual que un id que no
  existe (p. ej. `actualizarPagosGestion`, `CierresAdminService.ts:1574-1576` y `:1600`). En
  `LiquidacionService` el resultado equivalente ya existe y se llama `no_encontrado`
  (`LiquidacionService.ts:334`).
- **La central paga los cierres `bodega_central`.** Es lo que este spec deja cerrado.
- **Los cierres de satélite, hoy, no los paga nadie más:** el `adminSatelite` recibe `forbidden`
  en `registrarPagoMensajero` (`:319`) por decisión de la 172 (P3, `specs/172-liquidacion/
  requirements.md:380-387`; `design.md:496-514`: «el `adminSatelite` aprueba, pero no paga»).
  Si eso sigue así o cambia es **PA1**.

**Lo que entra.**
1. `registrarPagoMensajero` rechaza un cierre fuera del alcance de pago del actor con
   `no_encontrado`, sin escribir nada, antes de mirar estado o monto.
2. El filtro se expresa en el WHERE del repositorio con el mismo mecanismo de alcance
   (`Alcance` + `alcanceWhere`) que ya usan las escrituras de `/cierres-admin`; no se inventa otro.
3. Según **PA2**: el reparto desde `/wallet/mensajeros` (`previsualizarRepartoMensajero` y
   `registrarRepartoMensajero`) solo imputa a cierres del mismo alcance.

**Lo que NO entra.**
- Dar al `adminSatelite` permiso de pagar (decisión de la 172 P3; ver PA1).
- La anulación de un pago ya registrado (`anularPago`, `anularReparto`): no cambia de alcance, para
  que la central pueda deshacer un pago que ya hizo contra un cierre de satélite (R8).
- La lectura: `listarPagosDeCierre`, el pendiente de `/cierres-admin`, el detalle de solo lectura
  de satélite de SLT-104 y la cuenta por pagar del libro del mensajero no cambian (R7).
- Corregir pagos ya registrados contra cierres de satélite: se mide en T0.2 y, si los hay, se
  decide aparte.
- El esquema y las migraciones: no se tocan (no hay columna nueva; `cierre_dia.destino_tipo` y
  `destino_zona_id` ya existen y están indexadas).

**La UI.** Hoy `/cierres-admin` **no** ofrece «Registrar pago» en un cierre de satélite: la lista de
acceso total solo trae `bodega_central` (`resolveAlcance`) y el detalle de satélite es de solo
lectura (`CierresAdminModule.tsx:1100-1101`, `ofrecerPagoEnDetalle` exige `!soloLecturaSatelite`;
lo vigila `tests/components/CierresAdminDeepLink.test.tsx` «aprobado de satélite: sin la pestaña
"Pago al mensajero"»). No hay tarea de UI en `/cierres-admin`. En `/wallet/mensajeros` el botón
«Pagar» sigue visible para un mensajero de satélite con cuenta por pagar; con PA2 = (a) el reparto
le dirá que no hay cierres que imputar (ver PA2).

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién, cuándo | Cubierta por |
|---|---|---|---|
| D1 | Que la central pueda pagar un cierre aprobado de un mensajero de la satélite es un hueco: solo la bodega dueña del cierre puede pagarlo. | Carlos, 2026-11-10 | R1, R2, R4, R5 |
| D2 | Se acepta el choque con SLT-42 «Teléfono, documento y hora por país» (Camilo) en `lib/services/LiquidacionService.ts`: su rama ya está mergeada en dev y su tarjeta en Finalizado. | Carlos, 2026-11-10 | — (proceso, no comportamiento) |

## Requisitos (EARS)

**R1** — SI un actor con acceso total (`maestro` o `admin`) pide registrar un pago al mensajero
contra un cierre cuyo destino no es `bodega_central`, ENTONCES el sistema DEBE responder
`no_encontrado` —el mismo resultado que para un cierre que no existe— sin escribir ningún
documento de pago ni ningún movimiento en el libro del mensajero.

**R2** — SI el cierre de R1 está en cualquier estado (`solicitado`, `aprobado`, `rechazado`,
`vencido`) y con cualquier monto pedido, ENTONCES el sistema DEBE responder `no_encontrado`, y
nunca `cierre_no_aprobado`, `sin_saldo` ni `excede`: el alcance se resuelve antes que el estado y
el monto, y la respuesta no revela nada del cierre ajeno.

**R3** — CUANDO un actor con acceso total registra un pago contra un cierre `aprobado` con destino
`bodega_central` de su empresa, el sistema DEBE registrarlo exactamente como hoy: mismo
comprobante, mismo `restante`, mismo movimiento en el libro y misma respuesta idempotente
(`ya_registrado`) ante una clave repetida.

**R4** — SI un actor pide registrar un pago contra un cierre de otra empresa (de cualquier
destino), ENTONCES el sistema DEBE responder `no_encontrado` sin escribir nada.

**R5** — MIENTRAS el actor no tenga acceso total —incluido el `adminSatelite` pidiendo un cierre
de su propia zona—, el sistema DEBE responder `forbidden` a registrar un pago al mensajero, sin
leer el cierre. *(Según PA1 = (a). Si Carlos elige (b), este requisito se reescribe.)*

**R6** — El sistema DEBE expresar el alcance de pago de R1-R4 en la consulta a la base (el WHERE
que lee el cierre) con el mismo `Alcance` que resuelve `CierresAdminService.resolveAlcance` para
el actor, y no como un filtro en memoria después de leer el cierre.

**R7** — El sistema NO DEBE cambiar ninguna lectura: `listarPagosDeCierre`, el detalle y las listas
de `/cierres-admin` (incluido el pendiente de pago al mensajero y el detalle de solo lectura de un
cierre de satélite de SLT-104 sin la sección «Pago al mensajero») devuelven lo mismo que antes de
esta ficha.

**R8** — CUANDO un actor con acceso total anula un pago ya registrado contra un cierre de satélite,
el sistema DEBE anularlo como hoy (`anularPago` no cambia de alcance).

**R9** — *(Según PA2 = (a).)* CUANDO un actor con acceso total previsualiza o registra un reparto a
un mensajero, el sistema DEBE tomar como imputables solo sus cierres `aprobado` con destino
`bodega_central`: un cierre de satélite no entra en la ventana, no se bloquea y no recibe
imputación, y el conteo de excluidos por estado cuenta solo cierres `bodega_central`.

**R10** — *(Según PA2 = (a).)* SI el mensajero solo tiene cierres con pendiente en una bodega
satélite, ENTONCES registrar un reparto DEBE responder `sin_saldo` sin escribir ningún pago ni
movimiento en el libro, y la previsualización DEBE mostrar imputable `0.00`.

## Preguntas abiertas

- **PA0 — Ruta.** La ficha está marcada `ruta: ligera`, pero toca **dinero** (registro de pagos) y
  **autorización** (quién puede pagar qué). `docs/specs.md > Tres rutas` dice que eso va siempre por
  la completa, y lo comprueba el reviewer. **Recomendación:** que Carlos lo decida al aprobar este
  spec: (a) subir a completa —este archivo sirve de `requirements.md` y se añaden `design.md` y
  `tasks.md` con lo de `## Tasks`—, o (b) dejarla en ligera como excepción escrita (el cambio solo
  **estrecha** un permiso, no toca esquema ni migraciones, y cabe en ~16 archivos). Yo recomiendo
  (b) con la excepción anotada en `## Decisiones cerradas`, porque el diseño no tiene decisiones
  caras: reusa el alcance que ya existe.

- **PA1 — ¿Quién paga los cierres de satélite?** Con este arreglo nadie podrá registrarlos en el
  sistema: la central queda fuera (D1) y el `adminSatelite` ya lo estaba (172 P3: «aprobar un
  cierre y mover dinero no son la misma responsabilidad»). Opciones:
  (a) **Nadie en el sistema:** la satélite paga a sus mensajeros fuera de la liquidación y eso ya
  se descuenta de su deuda al conciliar (SLT-73 D4). El `adminSatelite` sigue en `forbidden` (R5).
  (b) El `adminSatelite` paga los cierres de su zona: revierte la 172 P3, amplía un permiso de
  dinero y obliga a la ruta completa (y a decidir si también anula y reparte).
  **Recomendación: (a).** Es coherente con SLT-73 D4 y con 172 P3, y es el arreglo mínimo del hueco.

- **PA2 — El reparto también paga cierres de satélite.** `registrarRepartoMensajero` y
  `previsualizarRepartoMensajero` imputan a todos los cierres `aprobado` del mensajero
  (`listarCierresImputables`, `LiquidacionPagoRepository.ts:311-339`, WHERE `{ mensajeroId,
  estado }`; usado en `LiquidacionService.ts:412`, `:547`, `:1084`). Es la misma puerta por otro
  botón (`/wallet/mensajeros`, «Pagar»). Opciones:
  (a) **Cerrarlo aquí** (R9, R10), con el mismo alcance. Efecto visible: a un mensajero de satélite
  el diálogo le muestra imputable `0.00` y su cuenta por pagar como «deuda no imputable»; el botón
  «Pagar» sigue en la fila.
  (b) Ficha aparte.
  **Recomendación: (a).** Sin ella el hueco de D1 sigue abierto por el otro camino. El aviso de
  «deuda no imputable» para un mensajero de satélite es cierto (esa deuda no se paga desde aquí);
  queda como pregunta para Preview si se quiere ocultar «Pagar» en esas filas (no entra aquí).

## Tasks

Dependencias: T0 → T1 → T2 → T3 → (T4 [según PA2]) → T5 [P] T6 → T7 → T8.

- [ ] **T0.1 — Lectura (backend_dev, sin código).** Confirmar con archivo:línea, contra la rama, cada
  cita del Alcance: `LiquidacionService.ts:315-382` (`:319` rol, `:333-335` lectura y estado),
  `:401-481`, `:511-637`, `:1083-1114`; `LiquidacionPagoRepository.ts:273-296` y `:311-339` y el
  conteo de excluidos que le sigue; `ILiquidacionPagoRepository.ts:250-283`;
  `CierresAdminService.ts:527-540`; `CierresAdminRepository.ts:851-858`; los otros que llaman a
  `obtenerCierreParaPago`/`listarCierresImputables` (`CierresAdminService.ts:1378`,
  `IncentivoMensajeroService.ts:62` y `:80`, `LiquidacionService.ts:1229` y `:1400`), que **no** se
  tocan. *Hecho:* tabla en `progress/impl_SLT-122.md` con cada cita y si sigue igual.
- [x] **T0.2 — Medida (leader, solo lectura en prod).** Contar pagos vigentes (`liquidacion_pago`
  sin anulación) contra cierres con `destino_tipo = 'bodega_satelite'`, por empresa. Sin imprimir
  datos personales. *Hecho:* el número en `progress/features/SLT-122.md`; si es > 0, se avisa a
  Carlos (posible doble pago, SLT-73 D4) y no bloquea esta ficha.
- [ ] **T1 — Un solo alcance (backend_dev).** Sacar `alcanceWhere` de `CierresAdminRepository.ts` a
  un módulo compartido de repositorios y el alcance de acceso total (`bodega_central`, zona `null`)
  a un módulo compartido de servicios; `CierresAdminRepository` y `CierresAdminService.resolveAlcance`
  pasan a importarlos sin cambiar su comportamiento. *Hecho:* el literal del alcance de acceso total
  y el cuerpo de `alcanceWhere` aparecen una sola vez en `lib/`; los tests existentes de
  `/cierres-admin` siguen verdes sin tocarlos.
- [ ] **T2 — Repositorio (backend_dev).** Método nuevo en `ILiquidacionPagoRepository` /
  `LiquidacionPagoRepository` que lee el cierre para pago con `{ id, ...alcanceWhere(alcance) }`,
  con `tx` y el mismo `select` que `obtenerCierreParaPago`. El `alcance` es obligatorio (sin valor
  por defecto). `obtenerCierreParaPago` no cambia (lo usan otros cuatro caminos). *Hecho:* typecheck
  verde; test unitario del repositorio que fija el `where` exacto.
- [ ] **T3 — Servicio (backend_dev).** `registrarPagoMensajero` usa el método de T2 con el alcance de
  acceso total de T1, dentro de la transacción y después del candado, en lugar de
  `obtenerCierreParaPago`. `null` → `no_encontrado` antes de mirar estado y monto (R1, R2). El guard
  de rol (`:319`) no cambia (R5). *Hecho:* tests de `tests/unit/services/liquidacion-service.test.ts`
  para R1, R2 (los cuatro estados), R3, R5 (`adminSatelite` con un cierre de su zona → `forbidden` y
  el repositorio no se llama).
- [ ] **T4 — Reparto [según PA2] (backend_dev).** Lo mismo para la lista de imputables y el conteo de
  excluidos del reparto: método o parámetro con alcance obligatorio solo para `LiquidacionService`;
  `IncentivoMensajeroService` sigue con `listarCierresImputables` sin cambios. *Hecho:* tests de
  `tests/unit/services/liquidacion-reparto-service.test.ts` para R9 y R10.
- [ ] **T5 [P] — Dobles de los tests (backend_dev).** Añadir el método nuevo a los dobles tipados de
  `ILiquidacionPagoRepository` que lo necesiten (`liquidacion-anulacion.test.ts`,
  `caja-cadena-pago-anulacion.test.ts` y los de T3/T4), sin cambiar lo que afirman. *Hecho:*
  `pnpm run typecheck` verde y esos archivos verdes.
- [ ] **T6 [P] — Integración contra la base (backend_dev).** Test nuevo
  `tests/integration/db/pago-mensajero-bodega-duena.test.ts` con el servicio y los repositorios
  reales, en una base desechable: dos empresas; en la empresa A un cierre `aprobado` central y uno
  `aprobado` de satélite del mismo mensajero; en la B, uno central. Afirma R1 (satélite →
  `no_encontrado`, cero filas nuevas en `liquidacion_pago` y en el libro del mensajero), R3 (central →
  `ok`), R4 (cierre de B desde A → `no_encontrado`), R8 (anular un pago sembrado contra el cierre
  satélite → ok) y, según PA2, R9/R10. Cada `it` comprueba primero que los datos sembrados existen
  (nada de `if (!x) return`). **Mutación obligatoria:** quitar el `alcanceWhere` del WHERE del
  método de T2 (y del de T4) pone en rojo R1 y R9; anotar en `progress/impl_SLT-122.md` el rojo
  observado y revertir la mutación. *Hecho:* verde con la base desechable exportada antes de
  cualquier `vitest`, y la mutación registrada.
- [ ] **T7 — Lectura sin cambios y E2E de dinero (backend_dev).** R7: correr
  `pnpm exec vitest related --run` sobre los archivos tocados y `tests/components/CierresAdminDeepLink.test.tsx`;
  y, como toca dinero (`docs/perfil-agentes.md > Todos los agentes`), `pnpm exec playwright test
  --project=dinero` en base desechable. *Hecho:* verdes, con el resultado en `progress/impl_SLT-122.md`.
- [ ] **T8 — Cierre (backend_dev).** `./init.sh` en verde con `.env` copiado al worktree y la
  salida escrita a archivo con `INIT_EXIT=$?` dentro del log; mapa `R<n> -> test` en
  `progress/impl_SLT-122.md`. *Hecho:* `INIT_EXIT=0` y todos los R con su test.

## Archivos esperados

- `lib/repositories/alcance-cierre-where.ts`
- `lib/services/alcance-cierres.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/services/CierresAdminService.ts`
- `lib/interfaces/repositories/ILiquidacionPagoRepository.ts`
- `lib/repositories/LiquidacionPagoRepository.ts`
- `lib/services/LiquidacionService.ts`
- `tests/unit/repositories/liquidacion-pago-repository.test.ts`
- `tests/unit/services/liquidacion-service.test.ts`
- `tests/unit/services/liquidacion-reparto-service.test.ts`
- `tests/unit/services/liquidacion-anulacion.test.ts`
- `tests/unit/services/caja-cadena-pago-anulacion.test.ts`
- `tests/integration/db/pago-mensajero-bodega-duena.test.ts`
- `specs/SLT-122-pago-bodega-duena/requirements.md`
- `progress/features/SLT-122.md`
- `progress/impl_SLT-122.md`

Tamaño estimado: 16 archivos (40% de `gate.tamano_pr`), ~450-650 líneas, la mayor parte tests.

## Trazabilidad

| R | Test previsto |
|---|---|
| R1 | `tests/unit/services/liquidacion-service.test.ts` (satélite → `no_encontrado`, sin escribir) + `tests/integration/db/pago-mensajero-bodega-duena.test.ts` (cero filas nuevas) |
| R2 | `tests/unit/services/liquidacion-service.test.ts` (los cuatro estados y monto > pendiente → `no_encontrado`) |
| R3 | `tests/unit/services/liquidacion-service.test.ts` (tests existentes de pago y `ya_registrado` siguen verdes) + `tests/integration/db/pago-mensajero-bodega-duena.test.ts` (central → `ok`) |
| R4 | `tests/integration/db/pago-mensajero-bodega-duena.test.ts` (cierre de la empresa B desde la A) |
| R5 | `tests/unit/services/liquidacion-service.test.ts` (`adminSatelite` con cierre de su zona → `forbidden`, el repositorio no se llama) |
| R6 | `tests/unit/repositories/liquidacion-pago-repository.test.ts` (el `where` lleva `destinoTipo`) + mutación del WHERE en `tests/integration/db/pago-mensajero-bodega-duena.test.ts` |
| R7 | `tests/components/CierresAdminDeepLink.test.tsx` y los tests de `/cierres-admin` existentes, sin cambios y en verde |
| R8 | `tests/integration/db/pago-mensajero-bodega-duena.test.ts` (anular un pago sembrado contra un cierre satélite → ok) |
| R9 | `tests/unit/services/liquidacion-reparto-service.test.ts` + `tests/integration/db/pago-mensajero-bodega-duena.test.ts` (mutación del WHERE) |
| R10 | `tests/unit/services/liquidacion-reparto-service.test.ts` (`sin_saldo`, imputable `0.00`) |
