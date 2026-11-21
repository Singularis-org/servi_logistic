# SLT-96 «Consolidación de ₡0 no se puede marcar recibida» (HOTFIX)

## Alcance (de `progress/features/SLT-96.md`)

En `/wallet/satelites`, una consolidación de bodega satélite cuyo «Para la central» (lo declarado) es
₡0 no se puede marcar como recibida nunca: el diálogo «Marcar recibido» deja el botón apagado con el
monto en 0, y aunque se saltara la pantalla, el servidor rechaza el 0. Caso real: la consolidación de
Turrialba del 2026-11-07, declarada en ₡0 porque solo llevaba una orden reprogramada.

Arreglo, rama desde `origin/prod`:

1. Aceptar el monto 0 en «Marcar recibido» y en «Corregir» **solo** cuando lo declarado es 0.
2. Con lo declarado distinto de 0, se sigue exigiendo un monto mayor que 0, como hoy.
3. La regla vive en el servidor, que lee lo declarado de la base. La pantalla la refleja.

**Lo que NO entra:**
- Cambiar `montoPositivoSchema`: lo comparten la wallet, los pagos de gestión y otros bordes.
- El cálculo de lo declarado, de la diferencia y de los asientos (SLT-73 «Dinero de satélite al
  conciliar»): no se toca.
- Las consolidaciones con lo declarado **negativo**: siguen como hoy (ver `## Preguntas abiertas`).
- Migraciones: el `CHECK` de `cierre_bodega.monto_recibido` ya admite `>= 0`. Dependencias nuevas: ninguna.
- Pantallas nuevas: se reutiliza el diálogo existente.

## Decisiones cerradas (no reabrir)

| Fecha | Quién | Decisión | Cubierta por |
|---|---|---|---|
| 2026-11-09 | Carlos | HOTFIX: rama desde `origin/prod`, PR a `prod` y luego a `dev`. | Proceso. La rama y el worktree ya existen. |
| 2026-11-09 | Carlos | Aceptar ₡0 en «Marcar recibido» SOLO cuando lo declarado por la bodega es ₡0. | R1, R2, R9, R11 |
| 2026-11-09 | Carlos | Aceptar ₡0 en «Corregir» SOLO cuando lo declarado es ₡0. | R3, R4, R11 |
| 2026-11-09 | Carlos | Con lo declarado > 0 se sigue exigiendo monto > 0: comportamiento actual intacto. | R2, R4, R6, R10 |
| 2026-11-09 | Carlos (vía leader) | La regla vive en el servidor: lo declarado se lee de la base, nunca se acepta del cliente. La pantalla la refleja. | R5, R10-R13 |
| 2026-11-09 | Carlos (vía leader) | Arreglo mínimo: ni el cálculo de dinero ni los asientos cambian; `montoPositivoSchema` no cambia. | R7, R8 |

Esta decisión **reabre en parte** el `design.md` §4.3 de la ficha 431 «Cierres de bodega satélite
autónomos» («marcar recibí ₡0 no es una marca, es no marcar») y el R11 de la 473 «Corregir recepción
de satélite» (monto ≤ 0 → `validation_error`), solo para lo declarado igual a 0. Ver `design.md > Lo que ya existe`.

## Requisitos (EARS)

«Lo declarado» es siempre el «Para la central» de la consolidación: `totalGeneral − totalPagoMensajero −
totalIngresoBodegaRechazos` de su snapshot en `cierre_bodega` (`esperadoDe`). «Monto 0» es un texto
que cumple la forma del monto (hasta 2 decimales) y no tiene ningún dígito distinto de 0: `"0"`,
`"0.0"`, `"0.00"`.

### A. Servidor

- **R1** — CUANDO un usuario con acceso total marca recibida, con monto 0, una consolidación pendiente
  de conciliar cuyo declarado es 0, el sistema DEBE dejarla conciliada (`estado = aprobado`,
  `conciliado_at` y `conciliado_por` rellenos, `monto_recibido = 0`), DEBE responder `ok` y DEBE
  escribir su fila de historial `cierre_bodega_conciliado` con `monto = 0`.
- **R2** — SI se marca recibida con monto 0 una consolidación cuyo declarado es distinto de 0, ENTONCES
  el sistema DEBE responder `validation_error` con el mensaje
  `«Solo se puede registrar 0 cuando lo declarado es 0.»` en `fieldErrors.montoRecibido`, y NO DEBE
  cambiar la consolidación ni escribir historial, ajuste de diferencia ni movimiento de caja.
- **R3** — CUANDO un usuario con acceso total corrige a monto 0 una consolidación ya conciliada cuyo
  declarado es 0, el sistema DEBE guardar `monto_recibido = 0`, DEBE responder `ok` y DEBE escribir su
  fila de historial con `valor_anterior` y `valor_nuevo = "0.00"`.
- **R4** — SI se corrige a monto 0 una consolidación cuyo declarado es distinto de 0, ENTONCES el sistema
  DEBE responder el `validation_error` de R2 y NO DEBE cambiar la consolidación ni escribir historial,
  ajuste ni movimiento.
- **R5** — El sistema DEBE decidir si lo declarado es 0 leyendo el snapshot guardado de esa
  consolidación en la base. La petición NO DEBE poder aportarlo: una clave extra en la entrada
  (p. ej. `declarado`) DEBE responder `validation_error` sin llamar al servicio.
- **R6** — SI el monto no es un monto válido mayor o igual que 0 (ausente, vacío, negativo, `"-0"`, con
  tres decimales, no numérico o un `number`), ENTONCES el sistema DEBE responder `validation_error` sin
  llamar al servicio, en marcar y en corregir. Un monto mayor que 0 DEBE seguir aceptándose con
  cualquier declarado.
- **R7** — CUANDO se marca con monto 0 una consolidación de declarado 0, el sistema NO DEBE escribir
  ninguna fila de `conciliacion_bodega_ajuste` ni ningún movimiento de caja con origen
  `conciliacion_bodega_ajuste`, y la transacción DEBE confirmarse sin error.
- **R8** — `montoPositivoSchema` DEBE seguir rechazando `"0"` y `"0.00"`.
- **R9** — SI el monto es 0 y la consolidación no existe, ENTONCES el sistema DEBE responder
  `no_encontrada`, igual que con un monto mayor que 0.

### B. Pantalla (diálogo «Marcar recibido», compartido por `/wallet/satelites` y `/cierres-admin`)

- **R10** — MIENTRAS el diálogo está abierto con un declarado distinto de 0, el botón de confirmar DEBE
  seguir deshabilitado con el monto en 0, como hoy.
- **R11** — MIENTRAS el diálogo está abierto con un declarado de 0, el botón de confirmar DEBE estar
  habilitado con el monto precargado `"0.00"`, y CUANDO se confirma, el sistema DEBE enviar
  `montoRecibido: "0.00"`. También DEBE habilitarse con `"0"` tecleado y en modo corrección
  (`montoActual` presente).
- **R12** — CUANDO el servidor responde el `validation_error` de R2, el diálogo DEBE mostrar ese mensaje
  bajo el campo del monto, DEBE seguir abierto y DEBE conservar el monto tecleado.
- **R13** — MIENTRAS el declarado es 0 y el monto tecleado no tiene forma válida, el aviso del campo
  DEBE ser `«Escribí un monto válido, de cero o más y con dos decimales como máximo.»`. Con un
  declarado distinto de 0 DEBE seguir el aviso actual (`«… mayor que cero …»`).

## Trazabilidad R → test

El test se escribe antes o junto al código; el implementer mide cada mutación y la anota en
`progress/impl_SLT-96.md`. AC = `tests/unit/actions/conciliacion-satelites-actions.test.ts`, SV =
`tests/unit/services/conciliacion-satelites-service.test.ts`, INT =
`tests/integration/db/slt96-marca-cero.int.test.ts` (nuevo, Postgres real, fuera del baseline), DLG =
`tests/components/MarcarRecibidoDeclaradoCero.test.tsx` (nuevo), MC = `tests/unit/components/monto-cliente-cero.test.ts` (nuevo).

| R | Test | La mutación que debe ponerlo rojo |
|---|---|---|
| R1 | INT: consolidación sembrada con `totalGeneral = 1500.00`, `totalPagoMensajero = 1500.00` (declarado 0 por la cascada, no por un total en 0); marcar `"0.00"` → `updated`; se releen de la base `estado`, `conciliado_at`, `monto_recibido = 0` y la fila de historial con `monto = 0` | Leer `totalEfectivo` (o `totalGeneral`) en vez de `esperadoDe`; quitar la rama del cero |
| R2 | INT: declarado 5000.00, marcar `"0.00"` → `monto_cero_no_permitido`; la fila sigue con `conciliado_at` y `monto_recibido` nulos; cero filas de historial, de ajuste y de movimiento. SV: el repo doble devuelve `monto_cero_no_permitido` → `validation_error` con el literal en `fieldErrors.montoRecibido` | Invertir la condición (`!isZero` → `isZero`); que el servicio lo traduzca a `conflict` |
| R3 | INT: declarado 0, marcar `"10.00"` y corregir a `"0.00"` → `updated`; `monto_recibido = 0`, historial con `valor_nuevo = "0.00"` | Quitar la rama del cero en `corregirConciliacion` |
| R4 | INT: declarado 5000.00, marcar `"5000.00"` y corregir a `"0.00"` → `monto_cero_no_permitido`; `monto_recibido` sigue `5000.00`, sin historial nuevo. SV: igual que R2 para `corregirRecibida` | Comprobar el cero solo en `marcarConciliado` |
| R5 | INT: el caso R1 y el R2 difieren SOLO en los snapshots sembrados, con la misma entrada. AC: `{ cierreBodegaId, montoRecibido: "0.00", declarado: "0.00" }` → `validation_error` y el servicio no se llama | Quitar `.strict()`; decidir por un dato de la entrada |
| R6 | AC: `it.each` de los casos del borde (incluye `"-0"` y `"-0.00"`) para marcar y corregir; `"0"`, `"0.00"` y `"485.00"` llegan al servicio | Relajar la forma del cero a `/^-?0…/`; aceptar `number` |
| R7 | INT: tras R1, `conciliacion_bodega_ajuste` y `wallet_movimiento` con `origen_tipo = 'conciliacion_bodega_ajuste'` de esa consolidación: 0 filas; la transacción no lanza | Escribir el ajuste aunque `delta` sea 0 (quitar el `if (delta.isZero()) return`) |
| R8 | AC: `montoPositivoSchema.safeParse("0")` y `("0.00")` → `success: false` | Cambiar `gt(0)` por `gte(0)` en `montoPositivoSchema` |
| R9 | INT: id inexistente con `"0.00"` → `fuera_de_alcance`. SV: → `no_encontrada` | Devolver `monto_cero_no_permitido` cuando la lectura del snapshot es nula |
| R10 | DLG: declarado `"5000.00"`, monto `"0"` → botón deshabilitado | Habilitar el cero sin mirar el declarado |
| R11 | DLG: declarado `"0.00"`: botón habilitado al abrir, click → `onMarcar` con `montoRecibido: "0.00"`; con `"0"` tecleado; con `montoActual="10.00"` cambiado a `"0"`. MC: `esMontoCero` con `"0"`, `"0.00"`, `"-0.00"` (true) y `"0.01"`, `"10"`, `""` (false) | Dejar `montoValido` como única condición |
| R12 | DLG: `onMarcar` doble que responde el `validation_error` de R2 → el literal aparece bajo el campo, el diálogo sigue abierto y el campo conserva `"0.00"` | Cerrar el diálogo ante `validation_error` |
| R13 | DLG: declarado `"0.00"` con `"abc"` → aviso nuevo; declarado `"5000.00"` con `"abc"` → aviso actual | Usar el mismo aviso en las dos ramas |

Los mapas finales con el nombre de cada test van en `progress/impl_SLT-96.md`. La comprobación con la
consolidación real de Turrialba no es un test automático: es la T6 de `tasks.md`.

## Preguntas abiertas

- **Q1 (no bloquea, para Carlos):** una consolidación con lo declarado **negativo** (la central le debe
  a la satélite; medido en la 393: 1 de 14 cierres) tampoco se puede marcar con 0 hoy, y con esta
  decisión sigue igual. ¿Debe aceptarse el 0 también ahí? Si sí, es otra ficha: cambia la lectura del
  saldo y la diferencia (SLT-73 «Dinero de satélite al conciliar»), no solo la validación.
