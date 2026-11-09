# SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» — requirements

> Ruta: completa (complexity `high`, pantalla de dinero). Zona: **fullstack** (D24). Escrito por
> spec_author el 2026-11-09; v2 del mismo día con las respuestas de Carlos a PA1-PA5.
>
> Rebanada **S2** del rediseño de cierres. El spec madre, **aprobado por Carlos** (2026-11-09), es
> `specs/SLT-95-detalle-cierre-rediseno/` (`requirements.md` v2, R marcados `[S2]`; `design.md`;
> `tasks.md > Plan de las demás rebanadas > S2`), con el canvas aprobado en
> `specs/SLT-95-detalle-cierre-rediseno/canvas/project/`. Este archivo **no reabre** nada de él:
> copia los R `[S2]` con su número y su sentido, y añade solo lo que S2 necesita y el madre no
> detalla (R79-R83).

## Alcance

`/cierres-admin` › Mensajero, para la **central** (maestro/admin, audiencia `central`) y la
**bodega satélite** (adminSatelite, audiencia `satelite`):

- Abrir un cierre de mensajero, desde la cola de pendientes, desde Resueltos o por el enlace
  `?cierre=`, monta el **detalle único** que construyó S1 en SLT-95 «Rediseño del detalle de
  cierre (mensajero y bodega)» (`components/private/cierres/detalle/`), con `tipo` mensajero y
  `marco` modal. Sustituye al modal actual («Detalle del cierre», que monta
  `CascadasCierreMensajero` + `CierreFacturaDetalle`).
- Se rellenan las pestañas que S1 dejó como huecos:
  - «Gestiones»: la lista de hoy, tal cual, hasta SLT-101 «Fila de gestión única y lista con
    filtros», más las órdenes que pasaron a «Novedad interna» y «Descargar»;
  - «Rechazados por la tienda»;
  - «Pago al mensajero».
- Se conectan las acciones del pie a los flujos que ya existen: rechazar, aprobar (con
  confirmación física e indemnización), destrabar y registrar o anular el pago.
- El servidor envía quién resolvió el cierre, para la cabecera (R80). Es una lectura aditiva y no
  toca dinero.
- Desaparece la impresión del detalle del admin (D12).
- E2E de lo que ve el usuario, central y satélite, con importes escritos a mano y los dos modelos
  de tarifa (R77).

## Lo que NO entra

- La cola de cierres (`ColaCierres`), sus columnas y señales: SLT-102 «Cola de cierres única:
  mensajeros (central y satélite)». La cola, los Resueltos y sus botones siguen como hoy.
- La fila de gestión nueva, los filtros por resultado y la tabla de R23: SLT-101 «Fila de gestión
  única y lista con filtros». En S2, «Gestiones» monta `GestionesPorResultado` sin cambios.
- Los diálogos rediseñados y el trato «tú» en sus textos: SLT-103 «Diálogos del módulo de cierres y
  trato tú». En S2 los diálogos se lanzan tal cual son hoy.
- El detalle de bodega, `/cierre-dia`, `/wallet/satelites` y las cifras nuevas del servidor de la
  nota p1 (SLT-104 a SLT-114). La barra de reparto sigue sin porcentajes hasta SLT-111 «Cifras del
  servidor: reparto en % y señales de la cola».
- Borrar `CierreFacturaDetalle`, `CascadasCierreMensajero` o la hoja de impresión. Los sigue usando
  `/cierre-dia`, y los retira SLT-115 «Retirar los componentes de cierre sustituidos».
- Cualquier cambio de dinero, de permisos o de esquema (R72). La única pieza de servidor es la
  lectura de R80.

## Decisiones cerradas (no reabrir)

D1-D20 vienen del spec madre (`specs/SLT-95-detalle-cierre-rediseno/requirements.md`) y de
`progress/features/SLT-95.md`; aquí solo están las que S2 hace visibles. D21 en adelante vienen de
`progress/features/SLT-100.md`.

| # | Fecha · quién | Decisión |
|---|---|---|
| D1 | 2026-11-08 · Carlos | Un solo componente de detalle para «Ver» y «Ver / decidir». |
| D3 | 2026-11-08 · Carlos | «Le queda a la empresa» es la única cifra de ganancia; se quita «Debe». |
| D4 | 2026-11-08 · Carlos | Los métodos de pago en 0 no se muestran. |
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D11 | 2026-11-09 · Carlos | «Rechazados por la tienda» no se oculta sin rechazos: estado vacío. |
| D12 | 2026-11-09 · Carlos | Se quita la impresión del detalle; quien la necesite usa «Descargar». |
| D15 | 2026-11-09 · Carlos | Componentes iguales con props distintas para central y satélite, nunca uno por rol. |
| D17 | 2026-11-09 · Carlos | Se reutilizan tal cual `DescargarDatasetButton` y el `Modal` de los diálogos. |
| D19 | 2026-11-09 · medición en prod | En prod todo cierre es del modelo viejo; el E2E cubre los dos modelos. |
| D20 | 2026-11-09 · Carlos («unificamos») | Una cifra, un nombre: el reparto usa el nombre de su cifra o cuenta (R14/R16 corregidos). |
| D21 | 2026-11-09 · leader | Al montar el detalle se quitan las 6 anotaciones `@sin-superficie` de S1 (lo exige la guardia `superficie-de-uso`). |
| D22 | 2026-11-09 · Carlos (PA1) | S2 **no se parte**. Tamaño aceptado (`tamano-pr-aceptado` en `progress/features/SLT-100.md`). |
| D23 | 2026-11-09 · Carlos (PA2) | «Lo que haya que añadir del servidor se añade para que quede funcional como en el diseño»: el servidor trae el nombre de quien resolvió el cierre para la cabecera (R2). |
| D24 | 2026-11-09 · leader | Por D23, la zona pasa a **fullstack** (cambiada en Trello). |
| D25 | 2026-11-09 · Carlos (PA3) | El desglose «Automático (por plazo vencido) / Manual» del ingreso de bodega se conserva como nota debajo de su línea de la cuenta («es más claro»). |
| D26 | 2026-11-09 · Carlos (PA4) | «Descargar» nace con las columnas de R23; «Señales» la añade SLT-101 «Fila de gestión única y lista con filtros». |
| D27 | 2026-11-09 · Carlos (PA5) | Estado vacío de «Rechazados por la tienda»: «Este cierre no tiene paquetes rechazados por la tienda.» |

Cobertura de las decisiones:

| Decisión | Requisitos |
|---|---|
| D1 | R38 |
| D3, D4, D20 | R77 (lo que ve cada audiencia, sobre las reglas R6, R7, R9 y R14 de S1) |
| D5 | R71, R72 |
| D11, D27 | R17 |
| D12 | R21 |
| D15 | R38, R77 |
| D17 | R21, R39 |
| D19 | R77 |
| D21 | R38: la guardia solo pasa sin las anotaciones cuando el detalle es alcanzable desde la ruta |
| D22 | `tasks.md` |
| D23, D24 | R80 |
| D25 | R81 |
| D26 | R82 |

## Requisitos (EARS)

Los R con número ≤ 78 son copia literal del madre: mismo número y mismo sentido. R79-R83 son
nuevos de S2. Los R de S1 (R1-R16, R20) ya tienen test con dobles; S2 los hace visibles y R77 los
comprueba en pantalla.

### Detalle en `/cierres-admin`

- **R38** [S2] — CUANDO la central o la satélite abre un cierre de mensajero (cola, resueltos o
  enlace `?cierre=`), el sistema DEBE abrir el detalle único con `tipo` mensajero y la audiencia
  del actor, en lugar del modal actual.
- **R79** [S2, nuevo] — CUANDO la central o la satélite abre un cierre de mensajero, el modo del
  detalle DEBE salir del estado del cierre:
  - `solicitado` → decidir;
  - `vencido` → vencido;
  - `aprobado` o `rechazado` → solo lectura.

  Es la correspondencia que hoy aplica `CierresAdminModule`: solo un `solicitado` se resuelve por
  la vía normal, y un `vencido` se destraba. El madre la da por supuesta en R12 y R36.
- **R39** [S2] — Los diálogos de decisión que lanza el pie (rechazar, confirmar paquetes,
  indemnizar, destrabar, registrar pago tras aprobar) DEBEN seguir funcionando igual, con el
  `Modal` existente.
- **R83** [S2, nuevo] — CUANDO la central o la satélite confirma «Destrabar cierre vencido» desde
  el pie del detalle, el sistema DEBE ejecutar el mismo destrabe que ofrece hoy la cola, refrescar
  las listas y volver a leer el detalle del servidor, que queda en modo decidir. SI el destrabe
  falla, ENTONCES el detalle DEBE seguir en modo vencido y mostrar el error de hoy.

### Cabecera: quién resolvió

- **R80** [S2, nuevo] — CUANDO el servidor entrega el detalle de un cierre de mensajero en estado
  `aprobado` o `rechazado`, DEBE incluir el nombre de quien lo resolvió (`cierre_dia.resuelto_por`),
  leído en la misma consulta del detalle y dentro del mismo alcance. En cualquier otro estado, o
  sin resolutor, el nombre DEBE ser `null`. La cabecera lo pinta después de la fecha de resolución
  («Aprobado <fecha> por <nombre>», R2). Ningún importe ni ningún listado cambian.

### Pestañas que rellena S2

- **R17** [S2] — «Rechazados por la tienda» DEBE listar los `rechazosDeTienda` (guía, destinatario,
  motivo, tienda, fecha) con la nota de que no suman al pago del mensajero. SI no hay ninguno,
  ENTONCES la pestaña DEBE seguir visible con su conteo 0 y un estado vacío. (Texto del estado
  vacío: D27.)
- **R18** [S2] — «Pago al mensajero» DEBE montar la sección de pago de hoy (pendiente, registrar,
  anular, pagos registrados), con el mismo permiso y la misma relectura tras registrar o anular.
- **R19** [S2] — El detalle de mensajero DEBE seguir mostrando, en «Gestiones», las órdenes que el
  corte pasó a «Novedad interna» y su marca de registro.
- **R21** [S2] — El detalle NO DEBE ofrecer impresión. En «Gestiones» DEBE ofrecer «Descargar»
  (el `DescargarDatasetButton` existente) con las gestiones de ese cierre, con las mismas columnas
  que la audiencia ve en la tabla.
- **R82** [S2, nuevo] — Las columnas de «Descargar» (R21) DEBEN ser, en este orden: Nº Guía,
  Destinatario, Tienda, Resultado, Recibido, Cobro a la tienda (`ingresoEmpresa.total`) y Pago al
  mensajero (`pagoMensajero`). DEBE haber una fila por gestión del cierre y las mismas columnas
  para la central y para la satélite. Un importe ausente DEBE salir como celda vacía, nunca 0.

### «Dinero»: el origen del ingreso de bodega

- **R81** [S2, nuevo] — SI el cierre es del modelo viejo y el servidor envía el desglose por origen
  del ingreso de bodega (`desgloseIngresoBodegaRechazos.sla` y `.manual`), ENTONCES, en la cuenta
  «De lo facturado, le queda a la empresa», bajo la línea «− pago a la bodega», el detalle DEBE
  mostrar la nota «Automático (por plazo vencido) <monto> · Manual <monto>», con los strings del
  servidor. SI el cierre es del modelo nuevo, o el desglose no llega, ENTONCES NO DEBE pintarla:
  es la misma regla con la que hoy la pinta el modal.

### Dinero intacto y verificación

- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe:
  ni snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.
- **R77** [S2: central y satélite] — Para un mismo cierre, cada cifra que ve cada audiencia
  (central, satélite, mensajero) DEBE ser igual al céntimo al importe escrito a mano en el escenario
  E2E, con un cierre del modelo viejo y otro del modelo nuevo. En S2 se cubren la central y la
  satélite. El mensajero entra con SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero».

## Preguntas abiertas

PA1-PA5 quedaron resueltas por Carlos el 2026-11-09 (D22, D23, D25, D26, D27). No queda ninguna
abierta.

**Para el Preview** (no bloquean; son avisos del reviewer de S1):
- las fechas salen «2026-11-07 18:42», mientras el canvas dice «07/11/2026 18:42» (m4);
- la barra de reparto pinta solo la leyenda, sin porcentajes, hasta SLT-111 «Cifras del servidor:
  reparto en % y señales de la cola» (m2);
- «Gestiones» dice «12 entregas» y no «12 entregadas», por la guardia del estado retirado (m5).
