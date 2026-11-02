# SLT-68 «Incentivo manual a un mensajero en la wallet» — Requisitos

> Ficha SLT-68 · zona fullstack · complejidad medium · SDD. **Hotfix urgente**: sale de una rama
> basada en `prod`, no en `dev`. Todo lo citado del código está medido en el worktree de esta rama
> (`origin/prod`), no en `dev`.

## Alcance

Maestro y admin registran desde Wallet un **incentivo** a un mensajero: un importe que la empresa
decide reconocerle. El incentivo:

- sube lo que la empresa le debe al mensajero (su cuenta por pagar);
- baja la ganancia de la empresa;
- sale en el libro del mensajero como «Incentivo», con categoría propia;
- se puede anular con su contraasiento.

### Lo que NO entra

- Pagar el incentivo. Se paga con el pago a mensajero que ya existe («La empresa le paga a un
  mensajero», reparto de la 205); esta ficha solo hace que ese pago lo vea y lo pueda saldar.
- Editar un incentivo. Un error se corrige anulándolo y registrando otro.
- Incentivos automáticos o por regla (por entregas, por ranking…). Siempre hay un acto humano.
- Tocar el premio del ranking (293), el ajuste de pago de una gestión (SLT-56, solo en `dev`) o el
  cierre del día.
- Tipos nuevos en `historial_accion` (ver Q3).

## Decisiones cerradas (no reabrir)

| # | Fecha | Quién | Decisión | Cubierta por |
|---|---|---|---|---|
| D1 | 2026-10-30 | Carlos | Prioritaria y urgente, antes que EP-8; sale a producción en cuanto pase review y gate. Alcance mínimo y patrones existentes. | R21, R22 |
| D2 | 2026-10-30 | Carlos | Lo registran maestro y admin. | R1, R2 |
| D3 | 2026-10-30 | Carlos | Monto y motivo obligatorios, y fecha. | R3 |
| D4 | 2026-10-30 | Carlos | Suma a la cuenta por pagar del mensajero. | R6, R7, R8, R9 |
| D5 | 2026-10-30 | Carlos | Baja la ganancia de la empresa. | R6, R7 |
| D6 | 2026-10-30 | Carlos | Sale en el libro del mensajero como «Incentivo», en una categoría propia: no es `premio_ranking` ni `ajuste_devengo`. | R12, R18 |
| D7 | 2026-10-30 | Carlos | Se puede anular con su contraasiento. | R13, R14, R15, R16 |

## Requisitos (EARS)

### Autorización

- **R1** — SI quien registra o anula un incentivo no tiene acceso total (`maestro` o `admin`),
  ENTONCES el sistema DEBE responder `forbidden` antes de leer o escribir ningún dato.
- **R2** — SI no hay sesión, ENTONCES el sistema DEBE responder `unauthenticated` antes de validar
  ningún dato de la petición.

### Registro

- **R3** — CUANDO se pide registrar un incentivo, el sistema DEBE exigir:
  - un mensajero;
  - un monto mayor que cero con dos decimales como máximo;
  - un motivo que no quede vacío tras recortar espacios;
  - una fecha calendario válida que no sea posterior a hoy, con el mismo criterio de fecha que los
    demás conceptos del registro manual de Wallet (por defecto, hoy).

  Si falta o falla alguno, DEBE responder `validation_error` con el campo y no escribir nada.
- **R4** — SI el mensajero indicado no existe en la empresa del actor, o el incentivo que se quiere
  anular no es de esa empresa, ENTONCES el sistema DEBE responder `no_encontrado` sin escribir nada.
  Eso incluye un mensajero o un incentivo de otra empresa.
- **R5** — SI el mensajero no tiene ningún cierre del día en estado `aprobado`, ENTONCES el sistema
  DEBE responder `sin_cierre_aprobado` sin escribir nada (regla de imputación: Q1).
- **R6** — CUANDO se registra un incentivo válido, el sistema DEBE escribir en una sola transacción:
  - en el libro del mensajero, un movimiento de **devengo** con la categoría `incentivo`, por el
    monto, imputado al cierre `aprobado` más reciente de ese mensajero (Q1);
  - en la caja de la empresa, un **egreso** de la categoría `egreso_pago_mensajero`, por el mismo
    monto.

  Los dos van fechados en la fecha elegida, llevan el motivo en la descripción y al actor como quien
  lo registró. El sistema NO DEBE modificar el cierre (`total_pago_mensajero` ni ningún otro dato
  suyo).
- **R7** — CUANDO se registra un incentivo de monto M:
  - la cuenta por pagar del mensajero DEBE subir exactamente M;
  - la ganancia de la empresa, derivada de la caja, DEBE bajar exactamente M.
- **R8** — CUANDO se registra un incentivo de monto M, lo pagable del cierre al que se imputa DEBE
  subir M. En la previsualización del pago a ese mensajero, lo imputable DEBE subir M y la deuda no
  imputable NO DEBE cambiar. Un reparto por M DEBE poder saldarlo.
- **R9** — CUANDO se registran dos incentivos distintos al mismo mensajero e imputados al mismo
  cierre (cada uno con su propia clave de idempotencia), el sistema DEBE escribir los dos.
- **R10** — SI se repite un registro con la misma clave de idempotencia (doble clic, reintento,
  dos pestañas), ENTONCES el sistema DEBE responder `ya_registrado` y no escribir ninguna fila más en
  ningún libro. Vale también si las dos peticiones son simultáneas.
- **R11** — SI falla cualquiera de las escrituras de un registro o de una anulación, ENTONCES el
  sistema NO DEBE dejar escrita ninguna de las demás.
- **R12** — La base de datos DEBE rechazar:
  - un movimiento `incentivo` que no sea `devengo` o cuyo origen no sea un cierre del día;
  - un movimiento `reverso_incentivo` que no sea `pago` o cuyo origen no sea un incentivo.

### Anulación

- **R13** — CUANDO se anula un incentivo vigente con un motivo no vacío, el sistema DEBE escribir en
  una sola transacción:
  - en el libro del mensajero, un movimiento de **pago** con la categoría `reverso_incentivo`, por el
    mismo monto;
  - en la caja, un **ingreso** `ingreso_ajuste`, por el mismo monto.

  Los dos van fechados el día de la anulación y llevan el motivo en la descripción. Las filas
  originales DEBEN quedar intactas.
- **R14** — CUANDO se anula un incentivo de monto M, la cuenta por pagar del mensajero, la ganancia
  de la empresa y lo pagable de su cierre DEBEN volver a lo que valían antes de registrarlo.
- **R15** — SI se pide anular un incentivo ya anulado, ENTONCES el sistema DEBE responder
  `ya_anulado` sin escribir nada. Vale también si las dos peticiones son simultáneas.
- **R16** — CUANDO se pide anular un movimiento desde la caja o desde el libro del mensajero, el
  sistema DEBE:
  - mandar al camino `incentivo_mensajero`, con el id del incentivo, el devengo `incentivo` y el
    egreso de caja de ese incentivo;
  - declarar `no_anulable` (`contra_asiento`) el `reverso_incentivo` y el `ingreso_ajuste` de esa
    anulación.

### Consumidores

- **R17** — La conciliación de cierres NO DEBE declarar descuadre por un incentivo ni por su
  anulación.
- **R18** — El libro del mensajero, en la vista de la oficina, en `/mis-pagos` y en sus descargas,
  DEBE rotular el devengo como «Incentivo» y su contraasiento como «Anulación de incentivo». El
  estado de cuenta DEBE agruparlos en el filtro «Incentivos» y emparejarlos como original y
  contraasiento.
- **R19** — El registro manual de Wallet DEBE ofrecer el concepto del incentivo en el grupo «Sale
  dinero de la empresa». Pide el mensajero, el monto, el motivo y la fecha. Su «Así queda» DEBE
  predecir:
  - la cuenta por pagar del mensajero, +M;
  - la ganancia, −M;
  - lo que de verdad pasa al registrarlo.
- **R20** — En analítica, el catálogo de la métrica de cuenta por pagar a mensajeros DEBE nombrar
  `incentivo` y `reverso_incentivo`. El aporte por orden DEBE clasificarlos como movimientos que no
  nacen de un cierre.

### Migración y flujo completo

- **R21** — Las migraciones de esta ficha:
  - DEBEN aplicar sobre el esquema de producción sin mover ninguna fila;
  - DEBEN revertirse con sus `down.sql` hasta dejar el esquema de antes;
  - DEBEN tener un timestamp posterior a toda migración de `prod` y de `origin/dev`.
- **R22** — CUANDO el maestro registra un incentivo desde Wallet en el navegador, DEBE verlo en el
  libro de ese mensajero como «Incentivo» con su cuenta por pagar subida en el monto. CUANDO después
  lo anula, la cuenta por pagar DEBE volver a su valor.

## Trazabilidad prevista (R → test)

| R | Test |
|---|---|
| R1 | `tests/unit/services/incentivo-mensajero-service.test.ts` › rol sin acceso total → `forbidden` sin llamar a ningún repositorio (registrar y anular) |
| R2 | `tests/unit/actions/incentivo-mensajero-action.test.ts` › sin sesión → `unauthenticated` antes del schema |
| R3 | `tests/unit/actions/incentivo-mensajero-action.test.ts` › cada campo inválido → `validation_error` con su clave |
| R4 | `tests/integration/db/incentivo-mensajero-slt68.test.ts` › dos empresas: mensajero e incentivo ajenos → `no_encontrado`, cero filas |
| R5 | `tests/integration/db/incentivo-mensajero-slt68.test.ts` › mensajero sin cierre aprobado → `sin_cierre_aprobado`, cero filas |
| R6 | `tests/integration/db/incentivo-mensajero-slt68.test.ts` › registro escribe 1+1 con categoría, origen, fecha, descripción y actor; `cierre_dia` intacto |
| R7 | `tests/integration/db/incentivo-mensajero-slt68.test.ts` › cuenta por pagar +M y ganancia −M (`derivarCaja`) |
| R8 | `tests/integration/db/incentivo-mensajero-slt68.test.ts` › previsualización del reparto: imputable +M, no imputable igual; reparto por M lo salda |
| R9 | `tests/integration/db/incentivo-mensajero-slt68.test.ts` › dos incentivos al mismo cierre → dos devengos y dos egresos |
| R10 | `tests/integration/db/incentivo-mensajero-slt68.test.ts` › misma clave dos veces (secuencial y en paralelo) → `ya_registrado`, una fila por libro |
| R11 | `tests/unit/services/incentivo-mensajero-service.test.ts` › la segunda escritura falla → la transacción lanza y no devuelve `ok` |
| R12 | `tests/integration/db/incentivo-mensajero-slt68.test.ts` › INSERT a mano con tipo u origen equivocado → 23514 |
| R13 | `tests/integration/db/incentivo-mensajero-slt68.test.ts` › anulación escribe 1+1, originales sin cambios |
| R14 | `tests/integration/db/incentivo-mensajero-slt68.test.ts` › tras anular, cuenta por pagar, ganancia y pagable del cierre vuelven al valor previo |
| R15 | `tests/integration/db/incentivo-mensajero-slt68.test.ts` › segunda anulación (secuencial y en paralelo) → `ya_anulado`, sin filas nuevas |
| R16 | `tests/unit/services/wallet-anulacion-service.test.ts` › incentivo (caja y mensajero) → camino `incentivo_mensajero`; reversos → `contra_asiento` |
| R17 | `tests/integration/db/incentivo-mensajero-slt68.test.ts` › conciliación de cierres sin descuadre con un incentivo y con su anulación |
| R18 | `tests/unit/components/incentivo-rotulos-slt68.test.ts` › rótulos, chip y emparejamiento del estado de cuenta |
| R19 | `tests/unit/components/wallet-conceptos-manuales.test.ts` + `tests/unit/utils/efecto-movimiento.test.ts` + `tests/integration/db/efecto-movimiento-predice.test.ts` |
| R20 | `tests/unit/utils/incentivo-analitica-slt68.test.ts` › catálogo de la métrica y `FUENTE_MENSAJERO` |
| R21 | `tests/integration/db/migracion-slt68-ida-y-vuelta.test.ts` |
| R22 | `e2e/incentivo-mensajero-slt68.spec.ts` |

## Preguntas abiertas

Las tres tienen una respuesta por defecto y el diseño está escrito con ella. Si el humano no
contesta otra cosa al aprobar el spec, se queda la respuesta por defecto.

- **Q1 — ¿A qué cierre se imputa el incentivo?** Tiene que colgar de un cierre aprobado para que el
  pago a mensajero (reparto de la 205) lo pueda saldar. Hoy ese pago solo reparte entre cierres, y lo
  que no cuelga de ninguno lo muestra como «deuda no imputable», que no se puede pagar
  (`LiquidacionService.previsualizarRepartoMensajero`; `lib/types/liquidacion-reparto.ts:130`).
  - **Por defecto:** al cierre `aprobado` más reciente del mensajero. Si no tiene ninguno, no se
    puede registrar (R5).
  - Alternativa (a): al cierre del día de la fecha elegida, como el premio del ranking. Es más
    restrictiva: un día sin cierre aprobado no admite incentivo.
  - Alternativa (b): no imputarlo a ningún cierre. Entonces no se puede pagar sin construir un camino
    de pago nuevo, que queda fuera del alcance de un hotfix.
- **Q2 — ¿Se puede anular un incentivo que ya se pagó?**
  - **Por defecto:** sí, igual que el premio del ranking (293 no bloquea la anulación). La cuenta por
    pagar del mensajero queda negativa por ese monto: él le debe a la empresa. Lo pagable del cierre
    no baja de cero.
  - Alternativa: bloquear la anulación si el cierre ya no tiene pendiente suficiente.
- **Q3 — ¿El incentivo deja fila en el historial de acciones (`historial_accion`)?**
  - **Por defecto:** no, en este hotfix. Para hacerlo bien hacen falta dos tipos propios, como pide
    la convención de la 362. Reusar `wallet_movimiento_manual_*` pondría una frase falsa: «Anuló una
    corrección de caja».
  - Los dos tipos propios obligan a tocar el enum `historial_accion_tipo`, y ese enum ya tiene en
    `dev` dos valores que `prod` no tiene: `20261028130100_historial_accion_planes` y
    `20261029120100_historial_accion_pago_mensajero_ajustado`. El `down.sql` de esta rama recrearía
    el tipo sin ellos.
  - Mientras tanto, la autoría queda en el propio movimiento: quién (`registrado_por`), cuándo, cuánto
    y por qué (la descripción con el motivo). Se propone una ficha de seguimiento cuando `dev` llegue
    a producción.
