# SLT-132 — correos-pago-plataforma · requirements.md

> **Zona:** fullstack · **Complejidad:** medium · **depends_on:** SLT-60 · **Rama:** `feature/SLT-132-correos-pago-plataforma`
>
> **Alcance:** avisos del flujo de pago a la plataforma.
> - Al **superadmin**, un correo por pago apenas una empresa registra un pago por confirmar:
>   empresa, monto, fecha, referencia y enlace a la empresa en Plataforma.
> - Al **maestro** de la empresa, por correo y en la campanita:
>   - cuando el superadmin confirma su pago, con las facturas a las que se aplicó (SLT-60);
>   - cuando la plataforma registra un pago hecho por fuera, con las facturas a las que se aplicó
>     (SLT-143);
>   - cuando la plataforma anula un pago confirmado, con el motivo (SLT-143).
>
> **Lo que NO entra:**
> - El correo y el aviso de rechazo → SLT-142 «Rechazo del pago a la plataforma y su estado en la
>   wallet», que reutiliza la plantilla de esta ficha.
> - Resumen diario al superadmin: no se hace.
>
> Sembrado por `/afinar-feature` el 2026-11-20. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-20 (F1.2).
>
> **Términos:**
> - **«Pago»:** un `egreso_pago_plataforma` de la wallet de una empresa (SL-45).
> - **Estados del pago:** «por confirmar», «confirmado» y «anulado por la plataforma», como en SLT-60 §1 y
>   SLT-143 §1.1.
> - **«Aviso»:** uno de los cuatro hechos de la ficha: **registrado**, **confirmado**, **por fuera** y **anulado**.
> - **«Trabajo de aviso»:** el trabajo de la cola que entrega un aviso.
>
> **Formatos:**
> - Los montos van con la moneda de los planes (`MONEDA_DE_LOS_PLANES`, SL-21), tal como los da la base, sin recalcular.
> - Las fechas van en `dd/mm/aaaa`, en la hora de la plataforma (`ZONA_CR`, como las pantallas de SLT-60 y el correo
>   de SLT-136).

### A. El encolado, junto con el hecho

- **R1** — CUANDO una empresa registra desde su wallet un pago a la plataforma y el pago queda escrito, el sistema DEBE
  encolar un trabajo de aviso **registrado** de ese pago, con la empresa del pago, en la misma transacción que el
  registro. SI el registro no queda escrito (tope superado, clave de idempotencia repetida o cualquier error), ENTONCES
  NO DEBE quedar ningún trabajo.
- **R2** — CUANDO el superadmin confirma un pago y la confirmación queda escrita, el sistema DEBE encolar un trabajo de
  aviso **confirmado**, con la empresa del pago, en la misma transacción que la confirmación. SI la confirmación
  responde «ya confirmado» o es rechazada, ENTONCES NO DEBE quedar ningún trabajo.
- **R3** — CUANDO el superadmin registra un pago hecho por fuera y el registro queda escrito, el sistema DEBE encolar un
  trabajo de aviso **por fuera**, con la empresa, en la misma transacción. SI responde «ya registrado» o es rechazado,
  ENTONCES NO DEBE quedar ningún trabajo.
- **R4** — CUANDO el superadmin anula un pago confirmado y la anulación queda escrita, el sistema DEBE encolar un
  trabajo de aviso **anulado**, con la empresa, en la misma transacción. SI responde «ya anulado» o es rechazada,
  ENTONCES NO DEBE quedar ningún trabajo.
- **R5** — SI el encolado del mismo aviso del mismo pago se repite, ENTONCES el sistema DEBE dejar exactamente un
  trabajo. Avisos distintos del mismo pago (confirmado y después anulado) DEBEN dejar un trabajo cada uno.
- **R6** — El sistema NO DEBE enviar correos ni crear avisos en la campanita dentro de la operación del pago, sino
  solo desde la cola. Un fallo del correo o de la campanita NO DEBE deshacer ni cambiar el pago, su confirmación ni su
  anulación, y NO DEBE cambiar lo que la operación responde.

### B. El correo al superadmin

- **R7** — CUANDO corre el trabajo de aviso **registrado** de un pago que sigue por confirmar, el sistema DEBE enviar
  un correo al único usuario superadmin activo. Cada pago lleva su propio correo, sin agrupar. El correo DEBE llevar:
  - el nombre de la empresa (también en el asunto);
  - el monto;
  - la fecha del pago;
  - la referencia, o «Sin referencia» si no la tiene;
  - un botón «Ver empresa» que abre el detalle de esa empresa en Plataforma (`/plataforma/empresas/<id>`).
- **R8** — SI al correr el trabajo **registrado** el pago ya no está por confirmar (confirmado, anulado o inexistente),
  ENTONCES el sistema DEBE terminar sin enviar nada. SI no hay un superadmin activo, ENTONCES DEBE terminar sin
  enviar nada.
- **R9** — El sistema NO DEBE crear avisos en la campanita ni push para el superadmin, y NO DEBE enviar el aviso
  **registrado** a ningún usuario de la empresa.

### C. Los avisos al maestro (campanita y correo)

- **R10** — CUANDO corre el trabajo de aviso **confirmado** de un pago confirmado, el sistema DEBE:
  - crear un aviso en la campanita dirigido al rol `maestro` de la empresa. Lleva la fecha del pago y los números de
    las facturas a las que se aplicó, sin montos;
  - enviar un correo a cada maestro activo de la empresa, con el monto, la fecha, la referencia y cada factura
    aplicada con su número y el monto que se le aplicó.
- **R11** — CUANDO corre el trabajo de aviso **por fuera** de un pago registrado por la plataforma, el sistema DEBE
  crear el aviso y enviar los correos de R10. El texto DEBE decir que la plataforma registró un pago hecho por fuera de
  la app.
- **R12** — CUANDO corre el trabajo de aviso **anulado** de un pago anulado por la plataforma, el sistema DEBE:
  - crear un aviso en la campanita dirigido al rol `maestro`, con la fecha del pago y el motivo, sin montos;
  - enviar un correo a cada maestro activo con el monto, la fecha, la referencia y el motivo. El correo DEBE decir
    que el monto vuelve a la caja de la empresa y que las facturas recuperan su saldo.
- **R13** — SI al correr el trabajo no existe el hecho que avisa, ENTONCES el sistema DEBE terminar sin crear avisos
  ni enviar correos. Es el caso de un pago inexistente, de un **confirmado** o **por fuera** sin confirmación y de
  un **anulado** sin anulación de la plataforma.
- **R14** — Los avisos del maestro en la campanita DEBEN:
  - llevar el atajo «Ver wallet», que abre `/wallet`;
  - no ser elegibles para push (el canal decidido es correo y campanita);
  - no estar disponibles como disparo de WhatsApp.

  Los correos del maestro DEBEN llevar el botón «Ver wallet» a `/wallet`. Ningún aviso ni correo de esta ficha DEBE
  enlazar a `/mi-plan`.
- **R15** — SI el trabajo de un aviso del maestro corre otra vez, ENTONCES el sistema NO DEBE crear un segundo aviso en
  la campanita. Un pago confirmado y después anulado DEBE dejar dos avisos distintos.
- **R16** — SI la empresa no tiene maestros activos, ENTONCES el trabajo DEBE crear el aviso de la campanita y terminar
  sin enviar correos.
- **R17** — El sistema NO DEBE dirigir los avisos del maestro, en la campanita ni por correo, al admin, a otro rol de la
  empresa ni al superadmin.

### D. El envío y la plantilla

- **R18** — SI un envío falla, ENTONCES el sistema DEBE seguir con los demás destinatarios y después fallar el trabajo
  para que se reintente. El motivo del fallo NO DEBE llevar ninguna dirección de correo. El reintento NO DEBE crear un
  segundo aviso en la campanita.
- **R19** — SI la app no tiene su URL configurada, ENTONCES el correo DEBE ir sin botón y DEBE decir dónde está lo que
  avisa: «Plataforma > Empresas» para el superadmin y «la wallet» para el maestro.
- **R20** — Los correos de esta ficha DEBEN:
  - pintar los montos con la moneda de los planes, a partir del texto de la base y sin redondear;
  - pintar las fechas en `dd/mm/aaaa` en la hora de la plataforma;
  - escapar todo dato variable (empresa, referencia, motivo y nombre);
  - no fijar un remitente propio, para que salga el configurado (`SMTP_FROM`).
- **R21** — Todos los correos de los avisos del pago DEBEN salir de una sola plantilla con la marca. Cada uno lleva:
  - el asunto `<título del aviso> — <empresa>`;
  - el saludo con el nombre del destinatario;
  - los datos del pago (monto, fecha y referencia);
  - la parte propia del aviso: las facturas en **confirmado** y **por fuera**, y el motivo en **anulado**.

  Un aviso nuevo con motivo (el rechazo de SLT-142) DEBE poder añadirse como un tipo más, sin cambiar los existentes.
- **R22** — El trabajo de aviso DEBE:
  - tener su manejador en la cola;
  - ser de núcleo, para que ningún módulo apagado lo descarte;
  - ser puntual, no recurrente.

  SI su payload está malformado o el trabajo no tiene empresa, ENTONCES DEBE fallar con su motivo.

### E. Base, guardias y E2E

- **R23** — La migración DEBE añadir solo cinco valores: los tres eventos de la campanita (confirmado, por fuera y
  anulado), el tipo de entidad «pago a la plataforma» y el tipo de trabajo. NO DEBE tener backfill. Su `down.sql`
  DEBE quitar solo esos cinco valores y DEBE abortar sin borrar nada si alguna fila los usa.
- **R24** — La guardia de SLT-91 (R9 y R10) DEBE seguir en verde sin enmiendas: ningún evento nuevo contiene «plan» y
  ningún archivo nuevo nombra `/mi-plan`.
- **R25** — El E2E DEBE recorrer el flujo crítico de dinero de punta a punta, con la cola corrida por su cron real:
  1. **El maestro registra un pago desde la wallet.** El E2E DEBE comprobar que queda un trabajo de aviso
     **registrado** de ese pago, con su empresa, y que la cola lo termina sin error.
  2. **El superadmin confirma el pago.** El maestro DEBE ver en la campanita el aviso de pago confirmado, con el
     número de la factura, y su atajo «Ver wallet» DEBE abrir la wallet.
  3. **El superadmin registra un pago por fuera y lo anula.** El maestro DEBE ver los dos avisos, y el de la anulación
     DEBE llevar el motivo.

### Decisiones cerradas → requisitos

| Decisión | R |
|---|---|
| Correo de rechazo (pasa a SLT-142) | R21 (la plantilla admite un tipo más con motivo) |
| Pago por fuera y anulación | R3, R4, R11, R12, R25 |
| Aviso al superadmin (uno por pago, sin resumen diario) | R1, R7, R8, R9 |
| Canal del maestro (correo y campanita; el superadmin, solo correo) | R9, R10–R12, R14, R17 |
| Destinatarios, envío y fallos (heredado de SLT-136) | R6, R10–R12, R16, R18, R22 |
| Remitente, plantilla y moneda (heredado) | R20, R21 |
| Tamaño del PR | — (lo mide el gate) |
| Dirección del superadmin | R7, R8 |
| Enlace del maestro a `/wallet` | R14, R24, R25 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-20 | Correo de rechazo | Pasa a SLT-142, que reutiliza la plantilla de esta ficha (humano). |
| 2026-11-20 | Pago por fuera y anulación (pendiente de SLT-143, P7) | Entran los dos (humano). |
| 2026-11-20 | Aviso al superadmin | Un correo por pago, sin resumen diario (humano). |
| 2026-11-20 | Canal del maestro | Correo y campanita; el superadmin, solo correo (humano). |
| 2026-11-20 | Destinatarios, envío y fallos | Heredado de SLT-136: los maestros de la empresa; el envío va por la cola de trabajos y un fallo del correo no afecta al pago. |
| 2026-11-20 | Remitente, plantilla y moneda | Heredado: `SMTP_FROM`, la plantilla con la marca (`plantilla-marca.ts`) y la moneda de los planes (SL-21, `MONEDA_DE_LOS_PLANES`). |
| 2026-11-20 | Tamaño del PR (P1) | Un solo PR por encima del tope (unos 48 archivos y unas 1000 líneas de producción). No se parte, como en SLT-60, SLT-136 y SLT-143 (humano). |
| 2026-11-20 | Dirección del superadmin | El `usuario.email` del único superadmin activo (índice `usuario_un_solo_superadmin`, SL-32). Sin variable de entorno nueva (humano). |
| 2026-11-20 | Enlace del maestro (correo y campanita) | `/wallet`, no `/mi-plan`. La guardia de SLT-91 no se enmienda (humano). |
