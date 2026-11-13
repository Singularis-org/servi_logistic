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

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- ¿Sale un correo al maestro cuando la empresa se descongela (por pago o a mano)? La tarjeta solo pide tres
  correos: al cierre, un día antes y al congelar.
- Respuesta de la API por API key a una escritura con la empresa congelada: el código HTTP y el cuerpo los
  propone el design. El mensaje dice «empresa suspendida por falta de pago».

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
