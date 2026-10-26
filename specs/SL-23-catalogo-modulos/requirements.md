# SL-23 — catalogo-modulos · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SL-17 · **Rama:** `feature/SL-23-catalogo-modulos`
>
> **Alcance:** catálogo fijo de módulos apagables y tabla de módulos activos por empresa. El
> superadmin los enciende y apaga desde el detalle de la empresa en `/plataforma/empresas`, con
> rastro en `historial_accion`. Un módulo apagado se oculta en el menú, da 404 por URL directa,
> se rechaza en la server action y en la API (403 `modulo_inactivo`), y sus jobs y crons se saltan.
>
> **Lo que NO entra:**
> - Planes y límites → SL-24.
> - Registro de empresas en autoservicio → SL-25.
> - El resto del panel de superadmin → SL-26.
> - Que el maestro apague módulos de su propia empresa → sin ficha; hoy no se quiere.
>
> Sembrado por `/afinar-feature` el 2026-10-26. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Vocabulario. **Módulo**: uno de los 9 apagables de la primera fila de decisiones. **Núcleo**: lo
> que nunca se apaga. **Pieza**: una ruta de `app/(app)/`, un archivo de `lib/actions/`, un tipo de
> job (`JobTipo`), un cron de `app/api/cron/` o un endpoint de `app/api/`. **Encendido**: hay
> registro de activación de ese módulo para esa empresa. El reparto de cada pieza es la tabla de
> `design.md > §3`, **propuesta pendiente de aprobación humana**.
>
> La columna «Test previsto» la confirma el implementer en `progress/impl_SL-23.md`.

### Catálogo

| R | Requisito | Test previsto |
|---|---|---|
| R1 | El sistema DEBE ofrecer un catálogo cerrado de exactamente 9 módulos apagables: Analítica, Monitoreo, Recolección, Bodegas satélite, Wallet y cierres, Ranking, Incidentes y novedades, WhatsApp y API e integraciones. Ese catálogo vive en el código y ninguna pantalla ni petición puede añadir, quitar ni renombrar un módulo. | `tests/unit/modulos/catalogo.test.ts` |
| R2 | El sistema DEBE tratar Inicio, Órdenes, Entregas, Usuarios, Tarifas y Ayuda como núcleo: están disponibles para toda empresa y no hay forma de apagarlos (no aparecen como apagables ni se aceptan en una petición de apagado). | `tests/unit/modulos/catalogo.test.ts`; `tests/unit/services/modulos-empresa-service.test.ts` |
| R3 | El sistema DEBE asignar cada pieza a exactamente uno de los 9 módulos o al núcleo. SI existe una pieza sin asignar, o una asignación que nombra una pieza inexistente, ENTONCES la verificación del gate DEBE fallar nombrando la pieza. | `tests/unit/guards/modulos-reparto.guardia.test.ts` |

### Estado por empresa

| R | Requisito | Test previsto |
|---|---|---|
| R4 | El sistema DEBE considerar un módulo encendido para una empresa si y solo si existe su registro de activación para esa empresa. Sin registro, el módulo está apagado. | `tests/integration/db/organizacion-modulo.test.ts` |
| R5 | CUANDO se aplica la migración de esta feature, el sistema DEBE dejar encendidos los 9 módulos para cada empresa que exista en ese momento. | `tests/integration/db/migracion-sl23-ida-y-vuelta.test.ts` |
| R6 | CUANDO se da de alta una empresa después de la migración, el sistema DEBE crearla sin ningún módulo encendido: solo con el núcleo. | `tests/integration/db/organizacion-modulo.test.ts` (alta por `OrganizacionService`) |
| R7 | El sistema DEBE impedir que una empresa lea la activación de otra y que escriba cualquier activación, incluida la suya, por cualquier vía. Eso incluye el SQL a mano con el rol de la app. | `tests/integration/db/organizacion-modulo.test.ts` (dos empresas; `INSERT`/`DELETE` con `servi_app` → `42501`) |

### Gestión por el superadmin

| R | Requisito | Test previsto |
|---|---|---|
| R8 | CUANDO el superadmin abre el detalle de una empresa desde `/plataforma/empresas`, el sistema DEBE mostrar los 9 módulos con su estado (encendido o apagado), cada uno con su control, y el núcleo como siempre encendido y sin control. | `tests/integration/plataforma-empresa-detalle-page.test.tsx` |
| R9 | CUANDO el superadmin enciende o apaga un módulo de una empresa, el sistema DEBE guardar el nuevo estado y aplicarlo desde la siguiente petición de esa empresa, sin esperar a que caduque ninguna caché. | `tests/unit/services/modulos-empresa-service.test.ts`; `tests/integration/db/organizacion-modulo.test.ts` |
| R10 | SI quien pide ver, encender o apagar los módulos de una empresa no es el superadmin (incluido el `maestro` de esa misma empresa), ENTONCES el sistema DEBE responder `forbidden` sin leer ni escribir nada. La comprobación vive en el servicio. | `tests/unit/services/modulos-empresa-service.test.ts` |
| R11 | SI la petición nombra una empresa que no existe o un módulo que no está en el catálogo, ENTONCES el sistema DEBE rechazarla sin escribir nada. | `tests/unit/services/modulos-empresa-service.test.ts` |
| R12 | CUANDO el superadmin cambia el estado de un módulo, el sistema DEBE registrar en `historial_accion` de esa empresa quién lo hizo, cuándo, qué módulo y si lo encendió o lo apagó, en la misma transacción que el cambio. Si el registro falla, el cambio no persiste. | `tests/integration/db/modulos-empresa-historial.test.ts` |
| R13 | SI se pide encender un módulo ya encendido o apagar uno ya apagado, ENTONCES el sistema DEBE responder bien sin cambiar nada y sin registrar ninguna acción. | `tests/unit/services/modulos-empresa-service.test.ts`; `tests/integration/db/modulos-empresa-historial.test.ts` |
| R14 | SI un usuario de cualquier rol de empresa abre la URL del detalle de una empresa, ENTONCES el sistema DEBE responder la pantalla de no encontrado antes de leer nada. | `tests/integration/plataforma-empresa-detalle-page.test.tsx` |

### Efectos de un módulo apagado

| R | Requisito | Test previsto |
|---|---|---|
| R15 | MIENTRAS un módulo esté apagado para la empresa del usuario, el sistema DEBE ocultar del menú sus ítems y subítems, no pintar un desplegable que se quede sin subítems visibles y no usar ninguno de ellos como destino tras el login ni como «volver al inicio» de la pantalla de no encontrado. | `tests/unit/auth/menu-modulos.test.ts`; `e2e/dos-empresas-humo.spec.ts` |
| R16 | MIENTRAS un módulo esté apagado para una empresa, CUANDO un usuario de esa empresa abre por URL una ruta de ese módulo, el sistema DEBE responder la pantalla de no encontrado (404), la misma que recibe un rol sin acceso. | `tests/unit/modulos/exigir-modulo.test.ts`; `tests/unit/guards/modulos-reparto.guardia.test.ts` (toda página de un módulo pasa por la puerta); `e2e/dos-empresas-humo.spec.ts` |
| R17 | MIENTRAS un módulo esté apagado para una empresa, CUANDO un usuario de esa empresa invoca una server action de ese módulo, el sistema DEBE rechazarla como `forbidden` antes de leer o escribir ningún dato de negocio. | `tests/unit/modulos/exigir-modulo.test.ts`; `tests/unit/guards/modulos-reparto.guardia.test.ts` (toda action exportada de un módulo llama a la puerta primero); `tests/integration/db/modulo-apagado-action.test.ts` |
| R18 | MIENTRAS «API e integraciones» esté apagado para una empresa, CUANDO llega una petición autenticada con una API key válida de esa empresa a cualquier endpoint de la API por key, el sistema DEBE responder 403 con el código `modulo_inactivo` sin ejecutar la operación. | `tests/unit/api/api-key-modulo-inactivo.test.ts` |
| R19 | MIENTRAS «API e integraciones» esté apagado para una empresa, el sistema NO DEBE enviar ningún webhook saliente de esa empresa. | `tests/unit/cron/procesar-jobs-modulos.test.ts` (`webhook_estado` y `webhook_evento` descartados sin llamar al handler) |
| R20 | CUANDO el drenador toma un job de un módulo que está apagado para la empresa del job, el sistema DEBE descartarlo sin ejecutar su handler, sin contarlo como fallo y sin reintentarlo, y dejar registro en la fila del job (estado de descartado y motivo con el módulo). SI el tipo es recurrente, ENTONCES el sistema DEBE agendar igualmente la siguiente ocurrencia. | `tests/unit/services/job-queue-service-descartado.test.ts`; `tests/unit/cron/procesar-jobs-modulos.test.ts` |
| R21 | CUANDO corre un cron o un job recurrente sin empresa que pertenece a un módulo, el sistema DEBE saltarse las empresas que tienen ese módulo apagado, correr para las demás e informar en su resumen cuántas se saltó y cuáles. | `tests/unit/db/para-cada-empresa-modulo.test.ts`; `tests/integration/db/para-cada-empresa-modulo.test.ts` |
| R22 | CUANDO se apaga un módulo, el sistema NO DEBE borrar ni modificar ningún dato de negocio de la empresa; CUANDO se vuelve a encender, el sistema DEBE mostrar los mismos datos que había antes de apagarlo. | `tests/integration/db/organizacion-modulo.test.ts` (apagar y encender Ranking con datos: mismo recuento y mismas filas) |
| R23 | MIENTRAS un módulo esté encendido para una empresa, el sistema DEBE comportarse con sus rutas, actions, jobs, crons y menú exactamente igual que antes de esta feature. | suites existentes de esas piezas en verde, más `e2e/dos-empresas-humo.spec.ts` (empresa A con todo encendido recorre todo el menú del maestro) |
| R24 | MIENTRAS «WhatsApp» esté apagado para una empresa, CUANDO llega al webhook de WhatsApp un mensaje entrante para un número de esa empresa, el sistema DEBE responder 200 a Meta sin guardar el mensaje ni encolar trabajo, y dejar una línea de registro sin datos personales. **Propuesta pendiente de aprobación** (`design.md > §3.5`). | `tests/unit/services/webhook-whatsapp-service-modulo.test.ts` |
| R25 | El sistema DEBE aplicar el estado de los módulos por empresa: apagar un módulo en una empresa no cambia nada en otra. | `tests/integration/db/organizacion-modulo.test.ts`; `e2e/dos-empresas-humo.spec.ts` |

### Verificación y forma

| R | Requisito | Test previsto |
|---|---|---|
| R26 | El humo de dos empresas DEBE cubrir el flujo completo: el superadmin enciende desde la pantalla todos los módulos de la empresa A y todos menos uno de la empresa B. Después, el maestro de B no ve ese módulo en el menú y recibe 404 al abrir su ruta, y el maestro de A sí lo ve y lo abre. | `e2e/dos-empresas-humo.spec.ts` |
| R27 | El sistema DEBE nombrar en español toda tabla, columna, tipo y valor de la base que añade esta feature. | `tests/integration/db/migracion-sl23-ida-y-vuelta.test.ts` (lee `information_schema` y `pg_enum`) |
| R28 | La semilla (`pnpm run db:seed`) NO DEBE crear activaciones de módulos. Cada test que necesite un módulo encendido crea su empresa y lo enciende. | `tests/unit/guards/modulos-sin-seed.guardia.test.ts` |
| R29 | La feature NO DEBE añadir ninguna dependencia de terceros. | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) y diff de `package.json` vacío en dependencias |

### Cobertura de las decisiones cerradas

| Decisión (fila) | Requisitos |
|---|---|
| ¿Qué se puede apagar? | R1, R2, R3 |
| ¿El catálogo crece sin desarrollo? | R1, R4 |
| ¿Quién enciende y apaga? | R10, R14 |
| ¿Con qué módulos nace una empresa? | R5, R6 |
| ¿Cómo se guarda «activo»? | R4, R7 |
| ¿Qué pasa al apagar un módulo? | R20, R21, R22 |
| ¿Qué ve quien entra por URL? | R16 |
| ¿Y la API con «API e integraciones» apagado? | R18, R19 |
| ¿Queda rastro de los cambios? | R12 |
| Identificadores de la base | R27 |
| ¿Seeds? | R28 |
| ¿Hace falta E2E? | R26 |
| ¿Librería? | R29 |

## Preguntas abiertas

- ~~Reparto exacto de cada ruta, action, job y cron entre los 9 módulos.~~ **Propuesta escrita en
  `design.md > §3`, pendiente de aprobación humana.** El reviewer no da por cerrado R3 hasta que el
  humano la apruebe. `corte-diario` y `procesar-devueltas-sla` quedan en el núcleo; ver P1.
- **P1 — `corte-diario` con «Wallet y cierres» apagado.** El corte barre las órdenes a
  `sin_gestionar` (núcleo) y además crea el cierre `vencido` del mensajero, que lo bloquea
  (`reglas-bloqueos-cierre`). Con el módulo apagado, el mensajero no tiene `/cierre-dia` para
  cerrarlo y se quedaría bloqueado en Entregas, que es núcleo. Propuesta: el corte siempre barre
  las órdenes y solo crea el cierre `vencido` si el módulo está encendido. Hay que confirmar si
  también se suspende el bloqueo por cierre pendiente.
- **P2 — Huecos de datos derivados.** `analitica_rollup_diario` y `snapshot-ranking` se saltan
  mientras su módulo está apagado (R21). Al reencender, los días apagados no tienen rollup ni
  foto del ranking. ¿Se acepta el hueco, se recupera con el backfill de la analítica (feature 125)
  o deben seguir corriendo aunque el módulo esté apagado?
- **P3 — Piezas que la decisión no nombra.** La propuesta las deja en el núcleo:
  `/configuracion/integraciones` (credenciales de SL-36, que también usan WhatsApp y las rutas),
  `/configuracion/sinpe`, `/historico/acciones`, `/configuracion/vehiculos`,
  `/configuracion/geografia`, `/plataforma/empresas`, `avisos-diarios` y `aviso-reparto-manana`.
  ¿Es correcto?
- **P4 — `adminSatelite` con «Bodegas satélite» apagado.** Ese rol pierde su pantalla de trabajo y
  aterriza en lo que le quede («Cierres del día», «Incidentes») o en un inicio vacío. ¿Se acepta o
  la empresa no debe tener usuarios `adminSatelite` con el módulo apagado? (Esto no se bloquea en
  esta feature.)
- **P5 — Piezas compartidas entre dos módulos.** Son `premio-ranking-devengo` (pantalla de Wallet,
  dato del Ranking) y `/api/ordenes/api-key/analitica` (API, dato de Analítica). La propuesta las
  pone en un solo módulo: Wallet y API, respectivamente. ¿Deben exigir los dos?
- **P6 — Webhook entrante de WhatsApp (R24).** Es una propuesta. La decisión cerrada solo habla de
  la API por key y de los webhooks salientes.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-26 | ¿Qué se puede apagar? | 9 módulos apagables: Analítica; Monitoreo; Recolección; Bodegas satélite (`/recepcion-satelite`, `/mi-bodega`); Wallet y cierres (`/wallet`, `/mi-wallet`, `/cierre-dia`, `/cierres-admin`); Ranking; Incidentes y novedades; WhatsApp (chat, plantillas, envíos automáticos, histórico de conversaciones); API e integraciones (API keys, webhooks, carga por API). El núcleo nunca se apaga: Inicio, Órdenes, Entregas, Usuarios, Tarifas y Ayuda. |
| 2026-10-26 | ¿El catálogo crece sin desarrollo? | No. Un módulo nuevo exige código, así que el catálogo es cerrado y vive en el código. Solo la activación por empresa va a la base. |
| 2026-10-26 | ¿Quién enciende y apaga? | Solo el superadmin, validado en el service con test. El maestro no puede. Se hereda de SL-40: la excepción por empresa la escribe solo el superadmin. |
| 2026-10-26 | ¿Con qué módulos nace una empresa? | Las empresas que existen al desplegar quedan con todo encendido (lo hace la migración). Las que se creen después nacen solo con el núcleo. |
| 2026-10-26 | ¿Cómo se guarda «activo»? | Una fila por empresa y módulo; sin fila, el módulo está apagado. Se hereda de SL-38 y SL-36. |
| 2026-10-26 | ¿Qué pasa al apagar un módulo? | Los datos no se borran y vuelven al reencender. Los jobs pendientes del módulo se descartan sin error, pero queda registro. |
| 2026-10-26 | ¿Qué ve quien entra por URL a un módulo apagado? | Un 404. |
| 2026-10-26 | ¿Y la API con el módulo «API e integraciones» apagado? | Responde 403 con código `modulo_inactivo` y no se envían webhooks salientes. |
| 2026-10-26 | ¿Queda rastro de los cambios? | Sí: cada encendido o apagado va a `historial_accion` (quién, cuándo, qué módulo). Se hereda de SL-36. |
| 2026-10-26 | Identificadores de la base | En español. Se hereda de SL-19 D5 y SL-36. |
| 2026-10-26 | ¿Seeds? | No. Los tests crean su organización. Se hereda de SL-17 D10. |
| 2026-10-26 | ¿Hace falta E2E? | Sí, porque es un flujo crítico de permisos. Se amplía el humo de dos empresas: una con un módulo apagado, que no lo ve en el menú y recibe 404. Se hereda de SL-17 D18/D19. |
| 2026-10-26 | ¿Librería? | Ninguna dependencia nueva. |
