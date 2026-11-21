# SLT-121 — planes-mora-congelamiento · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** SLT-118 «Planes: facturar el período en curso»,
> SLT-60 «Confirmación del pago a la plataforma por el superadmin» · **Rama** `feature/SLT-121-planes-mora-congelamiento`
>
> **Alcance.** Cada factura cerrada (SLT-118) tiene una fecha límite de pago: el día de emisión más la gracia
> de la empresa (propia, 1–60 días, o la global de `FACTURA_DIAS_GRACIA`, 7 por defecto). Si al terminar ese
> día la empresa tiene facturas vencidas con saldo (saldo de SLT-60), de madrugada queda congelada: sus usuarios
> entran y ven, pero solo cambian su propia cuenta y pagan a la plataforma desde la wallet. Se descongela sola
> cuando el saldo vencido llega a 0, o a mano por el superadmin con motivo y fecha límite. Avisos: banner para
> maestro y admin, y tres correos al maestro. Todo queda en el historial de la empresa.
>
> **Lo que NO entra.**
> - Saldo por factura, confirmar, repartir y registrar pagos: SLT-60 «Confirmación del pago a la plataforma por
>   el superadmin» (este spec lo consume).
> - Pantallas de lista y detalle de facturas: SLT-119 «Planes: pantallas de facturas para el superadmin y el
>   maestro».
> - Correos del pago a la plataforma: SLT-132 «Correos del pago a la plataforma».
> - Zona horaria por empresa: SLT-90 (aquí rige la hora de la plataforma, CR).
> - Cobrar de verdad (pasarela): fuera, como en SL-45.
>
> Sembrado por `/afinar-feature` el 2026-11-13. El bloque de Alcance y la tabla de «Decisiones cerradas» los
> fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.
>
> El código no arranca hasta que SLT-60 esté mergeada: el saldo por factura sale de ahí.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-20. «Hora de la plataforma» es la de CR hasta SLT-90. «Saldo» de una
> factura es el de SLT-60 (`factura_plataforma_saldos`, con las anulaciones de SLT-143). Los requisitos marcados
> «(decisión Pn)» siguen la decisión cerrada Pn del 2026-11-20 (tabla de abajo).

### Plazo de pago

- **R1** — El sistema DEBE fijar la **fecha límite de pago** de cada factura cerrada como el día de emisión más
  la gracia vigente de su empresa, en días corridos y en la hora de la plataforma. El día de emisión es el día
  calendario de la plataforma en que empieza `hasta` (el fin del intervalo de la factura). La factura se puede
  pagar hasta las 23:59:59 de la fecha límite. Ejemplo: `hasta` = 16 nov 00:00 y gracia 7 → fecha límite 23 nov.
- **R2** — El sistema DEBE tomar como gracia vigente de una empresa su gracia propia si la tiene; si no, el valor
  de `FACTURA_DIAS_GRACIA`. SI `FACTURA_DIAS_GRACIA` falta, o no es un entero de 1 a 60, ENTONCES el sistema DEBE
  usar 7.
- **R3** — CUANDO el superadmin guarda la gracia propia de una empresa con un entero de 1 a 60, el sistema DEBE
  guardarla. CUANDO la quita, la empresa DEBE volver a la gracia global. SI el valor no es un entero de 1 a 60,
  ENTONCES el sistema DEBE rechazarlo sin cambiar nada.
- **R4** — SI quien cambia la gracia o descongela a mano no es el superadmin, ENTONCES el sistema DEBE rechazarlo
  sin leer ni escribir datos de la empresa.
- **R5** — CUANDO cambia la gracia vigente de una empresa, el sistema DEBE recalcular la fecha límite de todas sus
  facturas cerradas, también las ya vencidas. SI la empresa estaba congelada y con el plazo nuevo ya no tiene
  facturas vencidas con saldo, ENTONCES el sistema DEBE descongelarla en el acto.
- **R6** — El sistema DEBE considerar **vencida** una factura cerrada con saldo mayor que 0 cuando ya empezó el
  día siguiente a su fecha límite. Una factura en curso o por cerrar, o una cerrada con saldo 0 o negativo, NO
  DEBE contar como vencida. El estado vencida y la fecha límite de cada factura DEBEN poder leerse por factura
  (para SLT-231 «Cobro automático: botón «Pagar» y estado de la factura»).

### Congelar

- **R7** — CUANDO empieza un día en la hora de la plataforma, el sistema DEBE congelar, en la madrugada de ese
  día, cada empresa que cumpla las tres condiciones: tiene al menos una factura vencida, no está congelada y no
  tiene un descongelamiento manual vigente (R23).
- **R8** — El sistema NO DEBE congelar ninguna empresa fuera de la madrugada (de 00:00 a 05:59, hora de la
  plataforma). SI la corrida de la madrugada no llega a congelar dentro de esa franja, ENTONCES el sistema DEBE
  esperar a la madrugada siguiente.
- **R9** — Congelar DEBE ser idempotente: repetir la corrida en la misma madrugada NO DEBE duplicar el registro
  del historial ni los correos.

### Qué se puede hacer con la empresa congelada

- **R10** — MIENTRAS una empresa está congelada, sus usuarios DEBEN poder iniciar sesión y ver todas las
  pantallas y datos a los que su rol ya tiene acceso.
- **R11** — MIENTRAS una empresa está congelada, el sistema DEBE permitir a cada usuario cambiar su propia
  contraseña y su propio perfil (incluido confirmar su propio cambio de correo), y DEBE permitir registrar un
  pago a la plataforma desde la wallet.
- **R12** — MIENTRAS una empresa está congelada, el sistema DEBE rechazar sin efectos toda otra escritura desde
  las pantallas, y quien la intenta DEBE ver un error. Se incluyen: crear, editar, cancelar o asignar órdenes;
  gestionar entregas, también las que el mensajero ya lleva en ruta; cierres y liquidaciones; movimientos de la
  wallet que no sean el pago a la plataforma; usuarios, tarifas, zonas, tiendas y la configuración de la empresa.
- **R13** — MIENTRAS una empresa está congelada, la API por API key DEBE responder a toda escritura (`POST`, `PUT`
  o `DELETE`, salvo la cotización, que no escribe) con HTTP 403 y este cuerpo, sin efectos:
  `{ "status": "error", "code": "FORBIDDEN", "message": "Empresa suspendida por falta de pago.",
  "details": { "codigo": "empresa_congelada" } }`. Las consultas (`GET`) DEBEN seguir respondiendo igual que antes.
- **R14** — MIENTRAS una empresa está congelada, la carga masiva por pantalla DEBE rechazar el lote entero con el
  mensaje «Empresa suspendida por falta de pago.», sin crear ninguna orden.
- **R15** — MIENTRAS una empresa está congelada, el sistema DEBE seguir recibiendo y guardando los mensajes
  entrantes de WhatsApp.
- **R16** — MIENTRAS una empresa está congelada, toda escritura en sus datos de negocio que llegue por un camino
  de empresa no permitido en R11, R15 o R17 DEBE fallar en la base de datos, también por SQL a mano, y DEBE
  llegar al llamador como el error «Empresa suspendida por falta de pago.» (`empresa_congelada`).
- **R17** — (decisión P1) MIENTRAS una empresa está congelada, los trabajos de la cola y los crons del sistema
  DEBEN seguir corriendo para ella.
- **R18** — Congelar o descongelar una empresa NO DEBE cambiar lo que pueden hacer las demás.

### Descongelar

- **R19** — CUANDO el saldo de las facturas vencidas de una empresa congelada llega a 0, el sistema DEBE
  descongelarla en el acto, en la misma transacción que lo hizo bajar. Esto vale al confirmar un pago (SLT-60
  «Confirmación del pago a la plataforma por el superadmin»), al registrar un pago por fuera (SLT-143 «El
  superadmin registra un pago hecho por fuera y anula un pago confirmado») y en cualquier otro registro de pago
  que use el punto de enganche de R34. La factura en curso NO DEBE impedirlo.
- **R20** — Un pago registrado por la empresa que sigue por confirmar NO DEBE descongelarla.
- **R21** — CUANDO el superadmin anula un pago confirmado, el sistema NO DEBE congelar la empresa en el acto. SI
  tras la anulación hay facturas vencidas con saldo, ENTONCES la empresa DEBE congelarse en la madrugada siguiente
  (R7).
- **R22** — CUANDO el superadmin descongela a mano una empresa congelada con un motivo y una fecha hasta, el sistema
  DEBE descongelarla en el acto. El motivo DEBE tener de 1 a 200 caracteres. (decisión P4) La fecha hasta DEBE
  estar entre hoy y hoy + 60 días, hora de la plataforma. SI la empresa no está congelada o los datos no son
  válidos, ENTONCES el sistema DEBE rechazarlo sin cambiar nada.
- **R23** — MIENTRAS no haya pasado la fecha hasta de un descongelamiento manual, el sistema NO DEBE volver a
  congelar la empresa. CUANDO empieza el día siguiente a la fecha hasta, SI sigue habiendo facturas vencidas con
  saldo, ENTONCES el sistema DEBE congelarla en esa madrugada (R7, R8).

### Avisos

- **R24** — MIENTRAS la empresa tiene alguna factura cerrada con saldo, el sistema DEBE mostrar a sus usuarios
  `maestro` y `admin` un banner en todas las pantallas autenticadas:
  - en plazo: la fecha límite más próxima;
  - con facturas vencidas, sin congelar: que la operación se congela la madrugada siguiente;
  - congelada: «Empresa congelada por falta de pago» y lo que se puede hacer;
  - descongelada a mano: hasta qué fecha.

  Los demás roles NO DEBEN ver el banner. Sin facturas con saldo y sin congelamiento, nadie lo ve.
- **R25** — CUANDO se cierra una factura con total mayor que 0, el correo de cierre de SLT-136 «Planes: aviso,
  correo y descarga de la factura» DEBE incluir su fecha límite de pago. Con total 0 o negativo, NO DEBE llevarla.
- **R26** — CUANDO falta un día para la fecha límite de una factura con saldo, el sistema DEBE enviar un correo de
  recordatorio a los maestros de la empresa. Va una sola vez por factura y fecha límite.
- **R27** — CUANDO la empresa se congela, el sistema DEBE enviar un correo a sus maestros con las facturas vencidas
  y el saldo vencido.
- **R28** — CUANDO la empresa se descongela, por pago, a mano o por un cambio de gracia, el sistema DEBE enviar un
  correo a sus maestros avisando de que su operación está activa de nuevo.
- **R29** — Los correos de R26 a R28 DEBEN salir por la cola. Un correo que no sale NO DEBE deshacer el
  congelamiento ni el descongelamiento, y el envío DEBE reintentarse.

### Historial y superadmin

- **R30** — El sistema DEBE registrar en el historial de la empresa (`historial_accion`), en la misma transacción
  que el cambio:
  - congelada, con sus facturas vencidas y el saldo vencido;
  - descongelada por pago, con quién confirmó o registró el pago (el sistema si no hubo persona);
  - descongelada a mano, con quién, el motivo y la fecha hasta;
  - descongelada por un cambio de gracia;
  - cambio de gracia, con el valor anterior, el nuevo y quién lo hizo.
- **R31** — El maestro DEBE ver esas filas en el historial de acciones de su empresa, y el superadmin DEBE verlas
  en el detalle de la empresa en Plataforma > Empresas.
- **R32** — El detalle de la empresa en Plataforma > Empresas DEBE mostrar al superadmin la gracia vigente (propia
  o global, con su valor), el estado (al día, en plazo con su fecha límite, vencida, congelada desde o
  descongelada a mano hasta) y las facturas vencidas con su saldo. DEBE permitirle cambiar o quitar la gracia
  propia y descongelar a mano.
- **R33** — Las lecturas del estado de mora DEBEN devolver solo datos de la empresa del contexto. Con otra
  empresa, o sin empresa, DEBEN fallar sin devolver datos.

### Frontera y prueba de punta a punta

- **R34** — El sistema DEBE ofrecer una sola operación de dominio, «recalcular congelamiento de la empresa», que
  se llama dentro de la transacción que cambia el saldo de las facturas. Descongela si corresponde (R19), nunca
  congela, y deja el historial y el correo. Confirmar, registrar por fuera, anular y cambiar la gracia DEBEN
  usarla. Es el enganche para SLT-226 «Cobro automático: modelo del cobro e idempotencia» y SLT-231.
- **R35** — Un E2E DEBE recorrer de punta a punta, contra la app real, este camino:
  1. una empresa con una factura vencida se congela;
  2. el maestro ve el banner;
  3. un `admin` no puede crear una orden y ve el error;
  4. la API por key responde 403 a una carga y 200 a una consulta;
  5. el maestro registra el pago a la plataforma desde la wallet;
  6. el superadmin lo confirma;
  7. la empresa queda descongelada, sin banner, y el `admin` vuelve a crear la orden.

  `e2e/dos-empresas-humo.spec.ts` DEBE seguir en verde.

### Trazabilidad decisión → requisito

| Decisión | Requisitos |
|---|---|
| Dónde vive la gracia (2026-11-11) | R2, R3, R32 |
| ¿Cómo se sabe si una vencida está pagada? | R6, R19, R20 |
| Cambio de gracia de una empresa | R5, R28, R30 |
| Fecha límite | R1 |
| ¿Cuándo cae el congelamiento? | R7, R8, R9, R21 |
| Mensajeros en ruta al congelar | R12 |
| Entradas externas | R13, R14, R15 |
| ¿Qué queda permitido? | R10, R11, R12, R16 |
| Descongelar a mano | R22, R23 |
| Descongelamiento automático | R19, R34 |
| Historial | R30, R31 |
| Variable de entorno | R2 |
| Rango de la gracia propia | R3 |
| Banner | R24 |
| Correos | R25, R26, R27, R29 |
| Tamaño | sin requisito: es del proceso (label `tamano-pr-aceptado`) |
| E2E | R35 |
| Ruta | sin requisito: es del proceso |
| Correo al descongelar (2026-11-20) | R28 |

## Preguntas abiertas

Ninguna.

**Resuelta por el design (2026-11-20):** la respuesta de la API por key a una escritura con la empresa congelada
es 403 con `details.codigo = "empresa_congelada"`, la misma convención que `modulo_inactivo` (SL-23) y
`tope_plan` (SL-24). Detalle en `design.md` §6.3 y en R13.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-11 | Dónde vive la gracia | Por empresa, la configura el superadmin en Plataforma > Empresas; sin valor propio, rige la global de una variable de entorno, 7 días por defecto (humano). |
| 2026-11-13 | ¿Cómo se sabe si una vencida está pagada? | Con el **saldo por factura de SLT-60**. SLT-121 espera a SLT-60: el spec ahora, el código cuando SLT-60 esté mergeada (humano). |
| 2026-11-13 | Cambio de gracia de una empresa | Aplica **también a las facturas cerradas sin pagar**: la fecha límite se recalcula con la gracia vigente. Si estaba congelada y el plazo nuevo aún no venció, se descongela (humano). |
| 2026-11-13 | Fecha límite | Día de emisión + gracia, en **días corridos**, hora de la plataforma (CR, heredado de SLT-86/SLT-118 hasta SLT-90). Ejemplo: emitida el 16 nov con 7 días, paga hasta el 23 nov a las 23:59; si no pagó, se congela la madrugada del 24 (humano). |
| 2026-11-13 | ¿Cuándo cae el congelamiento? | **De madrugada**, al empezar el día siguiente a la fecha límite; nunca a mitad de jornada (humano). |
| 2026-11-13 | Mensajeros en ruta al congelar | **Se detiene todo**: tampoco gestionan lo que ya llevan. Como el congelamiento cae de madrugada, no corta una jornada a medias (humano). |
| 2026-11-13 | Entradas externas | La API por API key y la carga masiva **rechazan** las escrituras (crear, cancelar, cargar) con un error claro; las consultas (GET) siguen. Los mensajes entrantes de **WhatsApp se siguen recibiendo** y guardando (humano). |
| 2026-11-13 | ¿Qué queda permitido? | Entrar, ver, cambiar la **propia** contraseña o perfil y **pagar a la plataforma** desde la wallet. Todo lo demás queda bloqueado, también usuarios, tarifas, zonas y tiendas (humano). |
| 2026-11-13 | Descongelar a mano | El superadmin indica **motivo y fecha hasta**; al pasar esa fecha, si sigue habiendo saldo vencido, se vuelve a congelar sola en la madrugada siguiente (humano). |
| 2026-11-11 | Descongelamiento automático | En el acto, cuando el saldo de las facturas vencidas llega a 0, también al confirmar o registrar un pago en SLT-60. La factura en curso no bloquea (humano). |
| 2026-11-13 | Historial | Al **historial de la empresa** que ya existe (`historial_accion`): congelada (con sus facturas vencidas), descongelada por pago, descongelada a mano (quién, motivo y fecha hasta) y cambio de gracia (de/a, quién). Lo ven el superadmin y el maestro (humano). |
| 2026-11-13 | Variable de entorno | `FACTURA_DIAS_GRACIA`; si falta o no es un entero válido, vale 7 (patrón de `lib/config/*.ts`) (humano). |
| 2026-11-13 | Rango de la gracia propia | **De 1 a 60 días**, enteros. El superadmin puede quitarla y volver al global (humano). |
| 2026-11-13 | Banner | Solo lo ven **maestro y admin**: con la fecha límite mientras corre la gracia, y «empresa congelada» al congelarse. Los demás roles no ven banner: solo el error al intentar operar (humano). |
| 2026-11-11 | Correos | Al maestro: al cierre de la factura, un día antes de la fecha límite y al congelar (humano). Infraestructura heredada: nodemailer y cola de jobs (`plan_aviso_correo`). |
| 2026-11-13 | Tamaño | **Una sola ficha y un solo PR** grande; label `tamano-pr-aceptado` (humano). |
| 2026-11-13 | E2E | Obligatorio: toca «Dinero: wallet», cierres, asignaciones y una entrada por cron, así que corre `dos-empresas-humo` (`docs/checkpoints-proyecto.md`). |
| 2026-11-13 | Ruta | Completa: migración, dinero, permisos e integraciones (API, webhooks). |
| 2026-11-20 | ¿Sale un correo al maestro cuando la empresa se descongela, por pago o a mano? | **Sí.** El maestro recibe un aviso de que su operación está activa de nuevo, sea porque pagó o porque el superadmin la descongeló a mano (humano). |
| 2026-11-20 | P1 — ¿Los trabajos de la cola y los crons siguen corriendo con la empresa congelada? | **Sí, siguen todos** (humano). |
| 2026-11-20 | P2 — ¿Qué más cuenta como «la propia cuenta»? | Marcar avisos como leídos, activar o quitar las notificaciones push, las preferencias propias y las vistas de filtro propias: **se permiten** (humano). |
| 2026-11-20 | P3 — ¿Puede la empresa anular un pago propio por confirmar estando congelada? | **Sí**, como parte de pagar a la plataforma (humano). |
| 2026-11-20 | P4 — Rango de la fecha hasta del descongelamiento a mano | **De hoy a hoy + 60 días**, hora de la plataforma (humano). |
| 2026-11-20 | P5 — El motivo del descongelamiento a mano en `historial_accion` | Se guarda con una **segunda excepción declarada** a la regla de texto libre, solo para `empresa_descongelada_a_mano` y recortado a 200 caracteres. **Condición de la review:** Carlos Restrepo la acepta en la review del PR (humano). |
| 2026-11-20 | ¿Cómo toman la fila de la empresa las funciones de la mora (`organizacion_mora_*`)? | Con **`FOR NO KEY UPDATE`**, no con `FOR UPDATE`: con la empresa congelada, anular un pago mientras el superadmin lo confirma daba `40P01` (deadlock) contra la anulación de SLT-60. Opción (a); detalle en design §2 (humano). |
