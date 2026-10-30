# SLT-69 «Escáner rechaza guías asignadas después de abrir la pantalla» — requirements

> HOTFIX a `prod` (rama base `origin/prod` b31b6503). Zona frontend, complejidad baja.
> Causa medida y decisiones: `progress/features/SLT-69.md`.

## Alcance

Pantalla **Recoger en bodega** del mensajero (`/mis-asignaciones/recoger`): las dos vías de
recogida (escáner de cámara y número de guía tecleado) comparan la guía contra la lista
`porRecoger` cargada al abrir la pantalla. Esa lista solo se relee tras una recogida exitosa, así
que una orden asignada con la pantalla abierta se rechaza en el teléfono sin consultar al servidor.

Entra:
- ante una guía que no está en la lista cargada, releer la lista del servidor y reintentar una vez
  antes de mostrar el rechazo;
- releer la lista cuando la app vuelve a primer plano (foco o visibilidad), sin martillar al servidor.

No entra:
- **Recolección en tienda** (`/recoleccion`): ya NO tiene el corte en cliente desde la feature 167
  (R12): `useRecolectarPorGuia` llama siempre al servidor. No sufre el rechazo de esta ficha
  (ver Preguntas abiertas, P1).
- Cambios en Server Actions, servicios, repositorios o base de datos.
- Refresco periódico (polling) con la pantalla en primer plano.

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién / cuándo | Cubierta por |
|---|---|---|---|
| D1 | Hotfix urgente directo a producción, solo esta ficha. | Carlos, 2026-10-30 | R10 (cambio mínimo, solo cliente); el destino `prod` es de proceso: `tasks.md > T5` |
| D2 | Ante una guía que no está en la lista, refrescar la lista desde el servidor y reintentar antes del error. | Carlos, 2026-10-30 | R1, R2, R3, R4, R5 |
| D3 | Refrescar la lista al volver a la app. | Carlos, 2026-10-30 | R6, R7, R8 |
| D4 | El servidor sigue siendo la defensa real; no se cambian Server Actions salvo que sea estrictamente necesario. | Leader (instrucción del hotfix), 2026-10-30 | R10 |
| D5 | Se conservan: rechazo por reserva para otro día (feature 261), bloqueo por cierre, guarda `procesando` y los textos de los toasts. | Leader (instrucción del hotfix), 2026-10-30 | R3, R4, R9, R11 |

## Requisitos (EARS)

**Guía que no está en la lista cargada**

- **R1.** CUANDO el mensajero envía (por cámara o por teclado) un número de guía que no está en la
  lista de órdenes por recoger que tiene la pantalla, el sistema DEBE pedir al servidor la lista
  vigente de sus órdenes por recoger exactamente una vez antes de decidir el resultado.
- **R2.** SI la guía está en la lista vigente devuelta por el servidor y esa orden no está reservada
  para otro día, ENTONCES el sistema DEBE recogerla con la misma acción de recogida de siempre,
  mostrar «Guía `<n>` recogida.» y tratarla como recogida exitosa (refrescar la pantalla y mostrar
  la confirmación persistente de la última recogida).
- **R3.** SI la guía tampoco está en la lista vigente devuelta por el servidor, ENTONCES el sistema
  DEBE mostrar un único aviso «La guía `<n>` no está entre tus órdenes para recoger.» y NO DEBE
  llamar a la acción de recogida.
- **R4.** SI la guía está en la lista vigente pero la orden está reservada para un día posterior,
  ENTONCES el sistema DEBE mostrar el mismo aviso de reserva que hoy (con la fecha que trae esa
  orden) y NO DEBE llamar a la acción de recogida.
- **R5.** SI la relectura de la lista falla, ENTONCES el sistema DEBE mostrar un único aviso y NO
  DEBE llamar a la acción de recogida: «Tu sesión expiró. Inicia sesión de nuevo.» cuando el
  servidor responde sesión no válida, y «No se pudo registrar la recogida. Intentá de nuevo.» en
  cualquier otro fallo (incluida una excepción).

**Volver a la app**

- **R6.** CUANDO la pantalla Recoger en bodega vuelve a estar visible o la ventana recupera el foco,
  el sistema DEBE releer los datos de la pantalla desde el servidor.
- **R7.** MIENTRAS no hayan pasado 30 segundos desde la última relectura por volver a la app, el
  sistema NO DEBE disparar otra relectura por foco o visibilidad (un regreso que dispara los dos
  eventos a la vez cuenta como una sola relectura).
- **R8.** CUANDO la pantalla se oculta (pasa a segundo plano) o se desmonta, el sistema NO DEBE
  releer los datos por ese evento, y tras desmontarse NO DEBE reaccionar a foco ni visibilidad.

**Lo que se conserva**

- **R9.** MIENTRAS hay una recogida o una relectura de la lista en curso, el sistema NO DEBE
  iniciar otra recogida ni otra relectura por un nuevo envío de guía.
- **R10.** CUANDO la guía SÍ está en la lista cargada, el sistema NO DEBE releer la lista antes de
  recoger (el camino de hoy no gana un viaje extra al servidor), y la decisión final de cada
  recogida DEBE seguir siendo la respuesta de la acción de recogida del servidor.
- **R11.** MIENTRAS el mensajero está bloqueado por cierre, el sistema NO DEBE mostrar los
  controles de recogida (escáner e input), igual que hoy.

## Preguntas abiertas

- **P1 (no bloquea).** La descripción de la ficha menciona «(y Recolección)». Medido en el código de
  `prod`: `useRecolectarPorGuia` ya no rechaza en cliente (feature 167/R12) y siempre consulta al
  servidor, así que el escaneo NO falla allí; lo único viejo es el listado visual. Este spec la deja
  fuera. ¿Se quiere además el refresco al volver a la app en Recolección? Sería conectar el mismo
  hook de R6-R8 en `RecoleccionModule` (una línea + un test), en esta ficha o en otra.
- **P2 (no bloquea).** El intervalo mínimo de 30 s de R7 es decisión técnica de este spec (no lo fijó
  el humano). Si se prefiere otro valor, es una constante.
