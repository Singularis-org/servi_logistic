# SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» — requirements

> Ruta: completa. Zona: **frontend**. Escrito por spec_author el 2026-11-12.
>
> Rebanada **S11** del rediseño de cierres. El spec madre, **aprobado por Carlos** (2026-11-09), es
> `specs/SLT-95-detalle-cierre-rediseno/`:
> - `requirements.md` v2: R61-R63 `[S11]`; R4 y R12 (franja y pie del mensajero); R77 incluye S11;
>   PA2 (varios rechazados), respondida «sí» por Carlos el 2026-11-09 (`progress/features/SLT-95.md`);
> - `design.md`: `> Props → quién las usa` (fila «Detalle · mensajero · mensajero · en curso /
>   rechazado / vencido · página») y `> Qué sustituye cada componente` (paneles de `/cierre-dia`);
> - `tasks.md > Plan de las demás rebanadas > S11`.
>
> Canvas aprobado: `Main.dc.html` con `MensEnCurso.dc.html` (en curso, marco página) y los modos
> rechazado y vencido del mismo `Main` («Mensajero 1, 2, 3»).
>
> Ya están en `dev`: SLT-95 (detalle único), SLT-101 (fila y lista únicas), SLT-102 (cola única),
> SLT-103 (diálogos y trato tú) y SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero»
> (detalle de un cierre pasado en modal y «Ganancia» en «Incidente»).
>
> **Orden de merge:** SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» va **antes**.
> Las dos tocan `CierreDiaModule.tsx`, `CierreDiaModule.test.tsx`, `CierresDescarga.test.tsx`,
> `censo-tablas.ts` y `e2e/cierre-dia.spec.ts`. SLT-109 parte de `origin/dev` con SLT-137 dentro (`tasks.md > T0.1`).
>
> Los R ≤ 78 son copia del madre, con su número. Los nuevos van de **R240 a R256**.

## Alcance

`/cierre-dia`, rol mensajero. La parte de arriba de la página deja de ser una pila de paneles y pasa
a ser **un** detalle único (`DetalleCierre`) con `tipo` mensajero, audiencia mensajero y marco
página:

- **Qué cierre se pinta** (PA2 del madre): el que pide acción. Si el mensajero tiene un cierre por
  reenviar, ése, en modo vencido o rechazado. Si no, el de hoy, en modo en curso.
- **En curso:** cifras del día, «Gestiones» con la lista y la fila únicas y «Devolver a gestión» en
  la fila, y el pie «Solicitar cierre».
- **Rechazado:** franja con el motivo, pestaña «Corregir» con la explicación de hoy y «Órdenes por
  volver a gestionar», «Devolver a gestión» en la fila y el pie «Solicitar aprobación del cierre
  rechazado».
- **Vencido:** franja de bloqueo y el pie «Solicitar aprobación del cierre vencido».
- **Los demás rechazados** se abren desde «Cierres solicitados» en modo rechazado (modal).

Sustituye en `/cierre-dia` a: «Totales del día», «Ganancia», las secciones por resultado, el aviso
de bloqueo suelto, las regiones «Cierre vencido» y «Cierre rechazado», los paneles «Corregir el
cierre rechazado» y la sección «Solicitar cierre».

## Fuera de alcance

- La cola «Cierres solicitados»: SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros».
  Esta ficha solo cambia **qué abre** su «Ver» en un cierre rechazado (R252).
- Las tarjetas de ganancia del mensajero (R69): SLT-112 «Cifras del servidor: ganancia pendiente y
  pagada del mensajero».
- Borrar los componentes y columnas que dejan de usarse fuera de `CierreDiaModule.tsx`
  (`cierre-dia-descarga-columnas.ts` y demás): SLT-115 «Retirar los componentes de cierre
  sustituidos» (D13).
- Cualquier cambio en `lib/` o `db/`. Si hace falta un dato que el servidor no da, queda en
  `## Preguntas abiertas` (PA2, PA3).
- Cambiar cómo se calcula, congela o asienta un importe (R71, R72).

## Decisiones cerradas (no reabrir)

| # | Fecha · quién | Decisión |
|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D6 | canvas n2 | Identidad y estado arriba; lo que pide atención, primero; acciones fijas al pie; un solo scroll; métodos en 0 ocultos; trato tú. |
| D11 | 2026-11-09 · Carlos (PA4) | «Rechazados por la tienda» no se oculta sin rechazos: estado vacío. |
| D15, D17 | 2026-11-09 · Carlos | Componentes iguales con props distintas: `DetalleCierre`, `GestionesCierre`/`FilaGestion`, `DescargarDatasetButton`, `Modal`. |
| D18 | 2026-11-09 · Carlos | Canvas aprobado: `MensEnCurso.dc.html` y los modos rechazado y vencido de `Main.dc.html`. |
| S11-PA2 | 2026-11-09 · Carlos (PA2 del madre) | Con varios cierres por atender, la página pinta el que pide acción primero; los demás se abren desde «Cierres solicitados» en modo rechazado. |

Cobertura:

| Decisión | Requisitos |
|---|---|
| D5 | R71, R72 |
| D6 | R4, R12, R246, R254 |
| D11 | R242 |
| D15, D17 | R61, R242, R243, R256 |
| D18 | R61, R62, R63, R241, R247, R248, R249 |
| S11-PA2 | R240, R252 (lectura en PA1) |

## Requisitos (EARS)

El test previsto de cada R está en `tasks.md > Trazabilidad`.

### Copia del madre

- **R4** [S1; el caso «bloqueado» lo cierra S11 con R246] — Entre la cabecera y las cifras, el
  detalle DEBE mostrar una franja con lo que pide atención, y NO DEBE pintarla si no hay nada. Con
  audiencia mensajero: rechazado, «Motivo del rechazo:» con el motivo, o «La bodega no indicó un
  motivo.»; vencido o bloqueado, el texto de `avisoBloqueo` (`conCta: false`); en curso con
  `puedesSolicitar = false`, «Antes de cerrar:» con el `motivoBloqueo` del servidor.
- **R12** [S1] — El pie DEBE quedar fijo, con una línea de contexto y estas acciones (audiencia
  mensajero): en curso, «Solicitar cierre»; rechazado, «Solicitar aprobación del cierre rechazado»;
  vencido, «Solicitar aprobación del cierre vencido»; solo lectura, «Cerrar». Cada acción DEBE lanzar
  el mismo flujo que hoy.
- **R61** [S11] — `/cierre-dia` DEBE pintar el cierre en curso del mensajero con el detalle único,
  audiencia mensajero, modo en curso y marco página: gestiones con «Devolver a gestión» y el pie
  «Solicitar cierre».
- **R62** [S11] — MIENTRAS el mensajero tenga un cierre rechazado, `/cierre-dia` DEBE pintarlo en
  modo rechazado: pestaña «Corregir» con la explicación de hoy y «Órdenes por volver a gestionar»
  (con «Ya la volviste a gestionar» / «Falta volver a gestionarla» e «Ir a Entregas»), y el pie
  «Solicitar aprobación del cierre rechazado».
- **R63** [S11] — MIENTRAS el mensajero tenga un cierre vencido, `/cierre-dia` DEBE pintarlo en
  modo vencido con el pie «Solicitar aprobación del cierre vencido».
- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe:
  ni snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.
- **R77** [S11] — Para un mismo cierre, cada cifra que ve el mensajero en la página DEBE ser igual
  al céntimo al importe escrito a mano en el escenario E2E, con un cierre del modelo viejo y otro
  del modelo nuevo.

### Qué cierre pinta la página

- **R240** — CUANDO el mensajero abre `/cierre-dia`:
  - SI el servidor emite un cierre por reenviar (`bloqueo.aReenviarPrimero`), ENTONCES la página
    DEBE pintar ese cierre con el detalle único, audiencia mensajero y marco página, en modo
    `vencido` o `rechazado` según su estado, y NO DEBE pintar el cierre en curso;
  - SI no lo emite, ENTONCES la página DEBE pintar el cierre de hoy en modo `en curso`.

  La página DEBE montar un solo `DetalleCierre` con marco página.

### El cierre de hoy (en curso)

- **R241** — El detalle del cierre en curso DEBE mostrar:
  - arriba, el título «Tu cierre del día», la pastilla «Sin solicitar», el folio «Solicitud nueva»
    y la fecha «Hoy · sin solicitar», sin un separador vacío donde iría el destino (PA2);
  - tres cifras: «Recaudado» = `totales.general` del día, con efectivo, SINPE y transferencia sin
    los que valen cero; «Gestiones» = número de gestiones del día; «Tu ganancia» =
    `totalPagoMensajero` del día.

  NO DEBE pintar ninguna cifra del dinero de la empresa (entre ellas `totalIngresoBodegaRechazos`).
- **R242** — El detalle del cierre en curso DEBE ofrecer las pestañas «Gestiones (n)» y «Rechazados
  por la tienda (0)», y abrir en «Gestiones».
  - «Gestiones» DEBE listar las gestiones del día con la lista y la fila únicas en audiencia
    mensajero, con los filtros por resultado y la columna «Ganancia».
  - «Rechazados por la tienda» DEBE mostrarse con su estado vacío (D11; PA3).
- **R243** — CUANDO el mensajero pulsa «Devolver a gestión» en la fila de una gestión del cierre en
  curso o del rechazado, el sistema DEBE pedir la confirmación de hoy («Devolver la orden a
  gestión», con la orden y su destinatario) y, al confirmar, llamar a `deshacerGestion`:
  - SI responde `ok`, ENTONCES DEBE avisar «Gestión deshecha; la orden volvió a tu lista para
    gestionar.» y releer la página del servidor;
  - SI falla, ENTONCES DEBE avisar con el mensaje de hoy (el `motivo` del servidor en un
    `conflict`) y NO DEBE cambiar la lista ni las cifras.

  El botón DEBE llamarse «Devolver a gestión la orden <remisión> · <destinatario>».
- **R244** — SI la gestión la registró la tienda (`desdeAyudaTienda`), ENTONCES su «Devolver a
  gestión» DEBE estar deshabilitado, con el motivo de hoy en `title` y al final de su nombre
  accesible. MIENTRAS el deshacer de una gestión esté en vuelo, su botón DEBE estar deshabilitado.
- **R245** — El pie del cierre en curso DEBE ofrecer «Solicitar cierre» con la línea «Se agrupan
  todas tus gestiones pendientes. No se puede deshacer.».
  - SI `puedesSolicitar` es `false`, ENTONCES el botón DEBE estar deshabilitado, con
    `motivoBloqueo` como descripción accesible, y la franja DEBE decir «Antes de cerrar:» con ese
    motivo.
  - CUANDO lo pulsa, el sistema DEBE abrir la confirmación de hoy «Solicitar cierre del día» con el
    resumen Gestiones / Recaudado / Tu ganancia, y al confirmar llamar a `solicitarCierre` con los
    avisos de hoy.

### Bloqueo

- **R246** — MIENTRAS el mensajero esté bloqueado (`bloqueo.bloqueado`), el detalle de la página
  DEBE mostrar en la franja «Tu cierre está bloqueado:» con el texto de `avisoBloqueo` (`conCta:
  false`), en cualquier modo. La página NO DEBE pintar el aviso de bloqueo fuera del detalle.

### Cierre rechazado

- **R247** — El detalle de un cierre rechazado en la página DEBE mostrar:
  - arriba, «Tu cierre del día», la pastilla «Rechazado», el destino, el folio y las fechas de
    solicitud y de rechazo;
  - la franja «Motivo del rechazo:» con el motivo entre comillas, o «La bodega no indicó un
    motivo.»;
  - las tres cifras del mensajero con los importes congelados de ese cierre que da el servidor;
  - las pestañas «Corregir», «Gestiones (n)» y «Rechazados por la tienda (n)», abriendo en
    «Corregir».

  «Gestiones» DEBE llevar «Devolver a gestión» en cada fila (R243, R244) y, debajo, las órdenes que
  el corte pasó a «Novedad interna», como en el detalle de un cierre pasado (R151).
- **R248** — La pestaña «Corregir» DEBE mostrar:
  - «Cómo corregir», con la explicación de hoy («Si una gestión quedó mal, devuélvela a gestión…»)
    y el aviso del corte («Envíalo hoy: si el corte de la noche llega antes…»);
  - SI ese cierre tiene órdenes en corrección, ENTONCES «Órdenes por volver a gestionar», una fila
    por orden con su remisión, su destinatario y la pastilla «Ya la volviste a gestionar» o «Falta
    volver a gestionarla»; las que faltan DEBEN llevar el enlace «Ir a Entregas» a
    `/mis-asignaciones/reparto`. SI no tiene, ENTONCES esa sección NO DEBE pintarse.
- **R250** — CUANDO el mensajero pulsa «Solicitar aprobación del cierre rechazado», el sistema DEBE
  abrir la confirmación de hoy, que dice cuántas órdenes deshizo sin volver a gestionar si hay
  alguna, y al confirmar llamar a `solicitarCierre`; SI responde `ok`, ENTONCES DEBE avisar «Cierre
  rechazado enviado a aprobación.» y releer la página.
- **R252** — CUANDO el mensajero pulsa «Ver» en un cierre rechazado de «Cierres solicitados», el
  sistema DEBE abrir el detalle único de ese cierre en modo rechazado y marco modal: «Corregir» con
  las órdenes en corrección de ese cierre, «Gestiones» con «Devolver a gestión», y en el pie solo
  «Cerrar», con la línea «Lo envías desde esta página cuando sea el siguiente por enviar.». CUANDO
  un «Devolver a gestión» de ese modal responde `ok`, el sistema DEBE releer ese cierre y dejar el
  modal abierto con la lectura nueva.

### Cierre vencido

- **R249** — El detalle de un cierre vencido en la página DEBE mostrar arriba «Tu cierre del día»,
  la pastilla «Vencido» y la fecha «Del <día> · venció sin solicitarse»; la franja de bloqueo
  (R246); las tres cifras con los importes de ese cierre; y las pestañas «Gestiones (n)» y
  «Rechazados por la tienda (n)», sin «Devolver a gestión» en las filas.
- **R251** — CUANDO el mensajero pulsa «Solicitar aprobación del cierre vencido», el sistema DEBE
  abrir la confirmación de hoy («Se enviará tu cierre vencido a tu bodega para aprobación. No se
  recalculan los montos ya registrados.») y al confirmar llamar a `solicitarCierre`; SI responde
  `ok`, ENTONCES DEBE avisar «Cierre vencido enviado a aprobación.» y releer la página.

### Lectura fallida, sustituciones, disposición y descarga

- **R253** — SI la lectura del cierre por reenviar responde `no_encontrada` o falla, ENTONCES la
  página DEBE mostrar un aviso (`role="alert"`) «No se pudo cargar el cierre que tienes que enviar.
  Recarga la página.» junto al botón de reenvío de su estado («Solicitar aprobación del cierre
  vencido» o «… rechazado», con su confirmación), y NO DEBE pintar el cierre en curso.
- **R254** — En una pantalla de 375 × 667, al abrir `/cierre-dia`, el pie del detalle (su botón
  principal) DEBE quedar dentro de la ventana sin desplazar la página, y «Cierres solicitados»
  DEBE seguir debajo del detalle.
- **R255** — `/cierre-dia` NO DEBE montar: las regiones «Totales del día», «Ganancia», «Cierre
  vencido», «Cierre rechazado», «Solicitar cierre» ni «Corregir el cierre rechazado», ni una tabla
  por resultado.
- **R256** — En «Gestiones» del cierre en curso y de un rechazado o vencido en la página, el
  detalle DEBE ofrecer «Descargar» con una fila por gestión y las columnas del mensajero de R152
  (Nº Guía, Destinatario, Tienda, Resultado, Recibido, Ganancia, Señales). En una gestión de
  resultado incidente, «Ganancia» DEBE ser su `pagoMensajero` («—» en pantalla y vacía en el
  archivo si es nulo, R162), y la indemnización NO DEBE aparecer ni en la fila ni en el archivo.
  El archivo del cierre en curso DEBE titularse «Gestiones del cierre de hoy».

## Preguntas abiertas

- **PA1: cuál va primero con un vencido y un rechazado a la vez.** La PA2 del madre decía
  «vencido, luego el rechazado más antiguo». Pero `solicitarCierre` no recibe el id: el servidor
  reenvía siempre el re-solicitable **más viejo** (`aReenviarPrimero`). Si la página pintara otro, su
  botón enviaría un cierre distinto del que se ve. R240 pinta `aReenviarPrimero` y R252 deja los
  demás en modal **sin** botón de envío. ¿De acuerdo?
- **PA2: destino en la cabecera del cierre en curso.** El canvas lo pinta («Bodega central ·
  GAM»), pero `listarCierreDia` no lo emite: se decide al solicitar. Traerlo es de servidor. Por
  defecto (R241) la cabecera del cierre en curso va sin destino. ¿Lo quieres en una ficha de
  servidor aparte?
- **PA3: «Rechazados por la tienda» del cierre en curso.** Los rechazos se vinculan al cierre al
  solicitarlo; hoy el servidor no da los pendientes del día. Por defecto (R242, D11) la pestaña se
  ve con 0 y su estado vacío, aunque al solicitar puedan entrar rechazos. ¿Vale, o prefieres
  ocultarla en curso hasta que el servidor los emita?
- **PA4: las cinco descargas por resultado pasan a una.** Hoy cada sección del día baja su archivo
  con sus columnas (Nº Remisión, Dirección, Ubicación, Producto, Monto, Método, Motivo…). Con la
  lista única baja **un** archivo con las columnas del mensajero de R152 (R256). ¿De acuerdo?
- **PA5: tamaño.** 37 archivos (más del 80 % de 40) y ~2 300-2 500 líneas: ~1 170 de producción
  (~600 son borrados) y ~1 160 de tests (`tasks.md > Tamaño`). No parto la ficha por mi cuenta.
  Corte posible, si lo prefieres: **S11a** «el cierre de hoy como página» (R240 solo con el caso en
  curso, R241-R246, R254-R256, R61) y **S11b** «rechazado y vencido como página» (R247-R253, R62,
  R63). Las dos tocan `CierreDiaModule.tsx`: irían una detrás de otra.
