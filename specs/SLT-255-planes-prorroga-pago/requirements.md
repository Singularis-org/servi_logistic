# SLT-255 — planes-prorroga-pago · requirements.md

> **Zona** fullstack · **Complejidad** medium · **depends_on** SLT-121 «Planes: plazo de pago de la factura y
> operación congelada por mora» (mergeada, #264) · **Rama** `feature/SLT-255-planes-prorroga-pago`
>
> **Alcance.** El superadmin da a una empresa un plazo de pago hasta una fecha, con motivo, desde Plataforma >
> Empresas. Si la empresa no está congelada, es una prórroga: la corrida de madrugada no la congela hasta pasada
> esa fecha, sin mover la fecha límite de sus facturas ni pausar su operación. Si ya está congelada, es el
> descongelamiento a mano de SLT-121 (R22, R23). La prórroga se puede alargar, acortar o quitar. El maestro y el
> admin ven «prórroga hasta X» en el banner, y el maestro recibe dos correos: uno al darla y otro un día antes de
> que venza.
>
> **Lo que NO entra.**
> - Prórroga por factura: la prórroga vale para toda la empresa.
> - Que la empresa pida la prórroga desde la app: la empresa la pide por fuera y el superadmin la registra.
> - Cambiar la gracia o la fecha límite de las facturas: sigue en SLT-121 (R3, R5).
> - Zona horaria por empresa: SLT-90 (rige la hora de la plataforma, CR).
>
> Sembrado por `/afinar-feature` el 2026-11-23. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó
> el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-23, sobre SLT-121 «Planes: plazo de pago de la factura y operación congelada
> por mora» ya mergeada. «Hora de la plataforma» es la de CR hasta SLT-90. «Factura vencida» y «fecha límite» son
> las de SLT-121 (R1, R6). «Plazo» es lo que deja la acción «dar plazo hasta»: el descongelamiento a mano y la
> prórroga son el mismo plazo (decisión «¿Prórroga y descongelar a mano son la misma acción?»).

### La acción «dar plazo hasta»

- **R1** — El sistema DEBE considerar **vigente** el plazo de una empresa desde que se da hasta las 23:59:59 de su
  fecha hasta, en la hora de la plataforma. Una empresa tiene como mucho un plazo vigente.
- **R2** — CUANDO el superadmin da plazo, con motivo y fecha hasta, a una empresa **congelada**, el sistema DEBE
  descongelarla en el acto y dejarle ese plazo, como en SLT-121 R22. Esto queda en el historial como descongelamiento
  a mano (`empresa_descongelada_a_mano`).
- **R3** — CUANDO el superadmin da plazo, con motivo y fecha hasta, a una empresa **no congelada**, el sistema DEBE
  dejarle una prórroga hasta esa fecha. NO DEBE cambiar la fecha límite de sus facturas, ni su gracia, ni lo que la
  empresa puede hacer. Esto queda en el historial como una acción **distinta** del descongelamiento a mano. Vale
  también para una empresa sin facturas vencidas o sin saldo.
- **R4** — SI la empresa no congelada ya tiene un plazo vigente y la fecha nueva es posterior o anterior, ENTONCES el
  sistema DEBE alargarlo o acortarlo a la fecha nueva. El historial DEBE guardar la fecha anterior y la nueva. SI la
  fecha nueva es igual a la vigente, ENTONCES el sistema DEBE responder «sin cambio», sin escribir el historial y sin
  encolar ningún correo.
- **R5** — CUANDO el superadmin quita, con motivo, el plazo vigente de una empresa no congelada, el sistema DEBE
  quitarlo en el acto y dejar en el historial la fecha que tenía. SI la empresa no tiene un plazo vigente, o está
  congelada, ENTONCES el sistema DEBE rechazarlo sin cambiar nada.
- **R6** — El motivo DEBE tener de 1 a 200 caracteres, una vez recortados los espacios de los extremos. La fecha
  hasta DEBE estar entre hoy y hoy + 60 días, en la hora de la plataforma. SI alguno de los dos no es válido,
  ENTONCES el sistema DEBE rechazar la acción sin cambiar nada y con un error por campo.
- **R7** — SI quien da o quita el plazo no es el superadmin, ENTONCES el sistema DEBE rechazarlo sin leer ni escribir
  datos de la empresa. SI la empresa no existe, ENTONCES DEBE responder «no encontrada» sin escribir nada.

### Congelar

- **R8** — MIENTRAS una empresa tiene un plazo vigente, la corrida de madrugada NO DEBE congelarla, aunque tenga
  facturas vencidas.
- **R9** — CUANDO empieza el día siguiente a la fecha hasta, o la primera madrugada después de quitar el plazo, SI la
  empresa sigue con facturas vencidas, ENTONCES el sistema DEBE congelarla en esa madrugada (SLT-121 R7, R8).
- **R10** — SI la corrida de madrugada y la acción del superadmin llegan a la vez sobre la misma empresa, ENTONCES el
  sistema DEBE aplicarlas una detrás de otra. Si la corrida va primero y congela la empresa, la acción la trata como
  congelada (R2).

### Banner

- **R11** — MIENTRAS una empresa no congelada tenga un plazo vigente y alguna factura con saldo cuya fecha límite
  sea igual o anterior a la fecha hasta, el sistema DEBE mostrar a sus usuarios `maestro` y `admin`, en todas las
  pantallas autenticadas, este banner: «Tienes prórroga de pago hasta el dd/mm/aaaa. Si no pagas, la operación se
  congela la madrugada siguiente.»
  - **Enmienda de SLT-121 R24:** este banner reemplaza al de las facturas vencidas («se congela esta madrugada»)
    y al del descongelamiento a mano («habilitada hasta»).
  - Los demás roles NO DEBEN verlo.
- **R12** — SI hay un plazo vigente pero ninguna factura con saldo tiene la fecha límite en la fecha hasta o antes,
  ENTONCES el banner DEBE ser el de SLT-121 R24 sin cambios: la fecha límite más próxima, o ninguno.

### Superadmin

- **R13** — El detalle de la empresa en Plataforma > Empresas DEBE mostrar al superadmin:
  - el estado «Con prórroga hasta dd/mm/aaaa» cuando se cumple R11;
  - «Dar plazo hasta…», con la empresa congelada o sin congelar;
  - «Quitar prórroga…», solo con la empresa no congelada y un plazo vigente.

  El diálogo DEBE decir si la acción descongela la empresa o le da una prórroga, y DEBE proponer la fecha vigente,
  si la hay, o hoy + 7.
- **R14** — Las filas de la prórroga, la dada o cambiada (R3, R4) y la quitada (R5), DEBEN aparecer en el historial
  de la mora del detalle de la empresa y en el «Histórico de acciones» del maestro, en la categoría «Mora y
  congelamiento».
- **R15** — El sistema DEBE escribir en `historial_accion` en la misma transacción que el cambio:
  - **prórroga dada o cambiada:** quién, la fecha anterior (si había plazo vigente), la nueva y el motivo;
  - **prórroga quitada:** quién, la fecha que tenía y el motivo.

  El motivo va recortado a 200 caracteres, con la excepción de SLT-121 P5 extendida a estos dos tipos.

### Correos

- **R16** — CUANDO se da, se alarga o se acorta una prórroga (R3, R4), el sistema DEBE enviar un correo a los
  maestros de la empresa con la fecha hasta nueva, y que la operación se congela la madrugada siguiente si para
  entonces no ha pagado. Si la prórroga se alarga o se acorta, el correo DEBE decirlo.
- **R17** — CUANDO se quita una prórroga (R5), el sistema DEBE enviar un correo a los maestros diciendo que ya no
  hay prórroga. SI la empresa tiene facturas vencidas en el momento del envío, ENTONCES el correo DEBE decir además
  que la operación se congela la madrugada siguiente.
- **R18** — CUANDO falta un día para la fecha hasta de un plazo vigente, SI la empresa no está congelada y tiene
  facturas vencidas, ENTONCES el sistema DEBE enviar a sus maestros un correo de recordatorio: el plazo vence mañana
  y la operación se congela la madrugada siguiente si no paga. DEBE salir una sola vez por empresa y fecha hasta.
- **R19** — SI cuando el correo de R16, R17 o R18 va a salir ya no es cierto, ENTONCES el sistema NO DEBE enviarlo.
  Pasa, por ejemplo, si la fecha hasta cambió, si el plazo se quitó o se volvió a dar, o si la empresa se congeló.
  Para R18, también si ya no hay facturas vencidas.
- **R20** — Los correos de R16 a R18 DEBEN encolarse en la transacción del cambio o de la corrida, y salir por la
  cola. Si uno no sale, NO DEBE deshacer el cambio, y el envío DEBE reintentarse (SLT-121 R29).
- **R21** — CUANDO la acción descongela la empresa (R2), el sistema DEBE enviar el correo de operación activa de
  nuevo de SLT-121 R28, y NO el de R16.
- **R22** — MIENTRAS la empresa tenga un plazo vigente con fecha hasta igual o posterior a la fecha límite de una
  factura, el recordatorio de la víspera de esa factura (SLT-121 R26) DEBE seguir saliendo. Ese recordatorio NO DEBE
  decir que la operación se congela: DEBE decir hasta qué fecha corre el plazo.

### Prueba de punta a punta

- **R23** — Un E2E corto DEBE recorrer este camino contra la app real:
  1. una empresa tiene una factura vencida;
  2. el superadmin le da una prórroga desde Plataforma > Empresas;
  3. la corrida de madrugada, dentro de la prórroga, no la congela, y el maestro y el `admin` ven el banner de R11;
  4. la madrugada siguiente a la fecha hasta, la corrida la congela y el maestro ve el banner de empresa congelada.

  `e2e/dos-empresas-humo.spec.ts` y `e2e/mora-congelamiento.spec.ts` DEBEN seguir en verde.

### Trazabilidad decisión → requisito

| Decisión | Requisitos |
|---|---|
| ¿Prórroga por empresa o por factura? | R3, R8 |
| ¿Quién la inicia? | R7 |
| Tope de la fecha hasta | R6 |
| Motivo | R6, R15 |
| ¿Prórroga y descongelar a mano son la misma acción? | R1, R2, R3, R15, R21 |
| ¿Se puede cambiar o quitar? | R4, R5, R9, R15 |
| Banner | R11, R12 |
| Correos | R16, R18, R19, R20 |
| E2E | R23 |
| Ruta | sin requisito: es del proceso |
| Tamaño | sin requisito: es del proceso (label `tamano-pr-aceptado`) |
| Banner tras descongelar a mano | R1, R11 |
| ¿Correo al alargar, acortar o quitar la prórroga? | R16, R17 |
| Recordatorio de SLT-121 R26 durante la prórroga | R22 |

## Preguntas abiertas

Ninguna.

**P1 — Tamaño:** cerrada por el humano el 2026-11-23 (fila «Tamaño» de abajo). La estimación de spec_author fue de unos 42 archivos (20 de producción, 22 de tests); 11 son ediciones mecánicas de inventarios del enum `historial_accion_tipo` y guardias.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-23 | ¿Prórroga por empresa o por factura? | **Toda la empresa**: mientras dura, ninguna factura vencida la congela (humano). |
| 2026-11-23 | ¿Quién la inicia? | **Solo el superadmin**, en Plataforma > Empresas. La empresa la pide por fuera. Rol: heredado de SLT-121 R4 (humano). |
| 2026-11-23 | Tope de la fecha hasta | **De hoy a hoy + 60 días**, hora de la plataforma. Heredado de SLT-121 P4 (humano). |
| 2026-11-23 | Motivo | De 1 a 200 caracteres, guardado en `historial_accion` con la excepción a la regla de texto libre ya aceptada en SLT-121 P5, extendida a la prórroga. |
| 2026-11-23 | ¿Prórroga y descongelar a mano son la misma acción? | **La misma acción, «dar plazo hasta»**: si la empresa está congelada, la descongela (SLT-121 R22); si no, le da prórroga. En el historial son dos acciones distintas (humano). |
| 2026-11-23 | ¿Se puede cambiar o quitar? | **Sí**: alargar, acortar o quitar, con motivo. Quitada o vencida, si sigue el saldo vencido, la empresa se congela en la madrugada siguiente (SLT-121 R7, R8). Cada cambio queda en el historial (humano). |
| 2026-11-23 | Banner | Maestro y admin ven **«prórroga hasta X»** y que la operación se congela la madrugada siguiente a esa fecha si no paga. Reemplaza el aviso «se congela mañana» (humano). |
| 2026-11-23 | Correos | Al maestro: **al darla y un día antes de que venza** si sigue el saldo vencido. Salen por la cola y se reintentan, como SLT-121 R29 (humano). |
| 2026-11-23 | E2E | **Sí, uno corto**: factura vencida, luego prórroga, la madrugada no congela y se ve el banner; al vencer, se congela en la madrugada siguiente (humano). |
| 2026-11-23 | Ruta | Completa: permisos, cron de congelamiento, historial y correos. |
| 2026-11-23 | Tamaño (P1 de spec_author: ~42 archivos frente a 40) | **Un solo PR**, con la label `tamano-pr-aceptado`, como SLT-121 (humano). |
| 2026-11-23 | Banner tras descongelar a mano | **Mismo texto** que la prórroga: «plazo de pago hasta X; si no pagas, la operación se congela la madrugada siguiente». Reemplaza el «habilitada hasta X» de SLT-121 R24 (humano). |
| 2026-11-23 | ¿Correo al alargar, acortar o quitar la prórroga? | **Sí, en los tres casos.** Alarga o acorta: la nueva fecha. Quita: que, con saldo vencido, la operación se congela la madrugada siguiente (humano). |
| 2026-11-23 | Recordatorio de SLT-121 R26 durante la prórroga | **Sigue saliendo, con el texto ajustado**: no dice que se congela, dice hasta cuándo corre el plazo (humano). |
