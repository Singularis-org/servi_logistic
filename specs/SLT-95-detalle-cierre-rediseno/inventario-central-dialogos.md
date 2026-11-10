# Inventario: central, diálogos, /cierre-dia y superficies satélite (hoy, rama SLT-95)

Complementa `inventario-bodega.md` (no repite lo que ya está ahí). Textos literales del código. Rutas relativas a `app/(app)/` salvo que se diga otra cosa. `CAM` = `cierres-admin/_components/CierresAdminModule.tsx`.

## A. /cierres-admin › «Mensajero» vista por la CENTRAL (maestro/admin)

**Montaje** (`cierres-admin/page.tsx:201-254`). Mismo `CierresAdminModule` que el satélite; cambian las props:
- `puedeRegistrarPago` = `esAccesoTotal` (:225), `puedeCorregirPagos` = `esAccesoTotal` (:233), `puedeCorregirResultado` = `esAccesoTotal` (:247), `audiencia` = `"admin"` (:236).
- `puedeAjustarPagoMensajero` = `esAccesoTotal || adminSatelite` (:253). Es lo único que comparten los dos roles.
- Todas tienen default `false` / `"satelite"`, así que si falta la prop no se muestra nada (CAM:176-225, 456-461).

**Alcance:** la central solo ve cierres con destino `bodega_central` y sin filtro de zona (`lib/services/CierresAdminService.ts:497-500`). Los cierres de mensajeros de una satélite le llegan solo ya consolidados, por la pestaña Bodega. El satélite ve `bodega_satelite` de su zona (:505).

**En qué difiere de lo que ve el adminSatelite:**
| Punto | Central | Satélite | Dónde |
|---|---|---|---|
| Pestaña Bodega | `CierresBodegaAdminModule` | `ConsolidacionBodegaModule` | page.tsx:144-195 |
| Fulfillment en la fila desplegada de la gestión (`FULFILLMENT_COL` = «Fulfillment») | sí | no | `cierre-factura.tsx:1738, 1888-1891, 2811` (`verFulfillment={audiencia==="admin"}`) |
| Desglose de la gestión: bloque «Fuera de «Total cobrado»» con «Fulfillment» + «IVA de fulfillment» | sí | no | `cierre-detalle-shared.tsx:442-446, 992-999` |
| Excel «Detalle» (gestiones): columna «Fulfillment» | sí | no | `cierres-gestiones-fundida-descarga-columnas.ts:284, 321-323`; `DescargarCierresButton.tsx:210` |
| Botón de fila «Corregir métodos de pago» | sí, solo `solicitado`/`vencido`, resultado `entregado` y con `pagos.length>0` | no | CAM:1067-1069; `cierre-factura.tsx:1408, 1983-1994` |
| Botón de fila «Corregir el resultado» | sí, solo `solicitado`/`vencido` y resultado `entregado` (aunque no haya cobrado) | no | CAM:1080-1082; `cierre-factura.tsx:1414, 2000-2011` |
| Botón de fila «Ajustar pago» | sí, `solicitado`/`vencido`, cualquier resultado con `pagoMensajero !== null` | igual | CAM:1087-1089; `cierre-factura.tsx:2015-2026` |
| Sección «Pago al mensajero» en el detalle (solo si el cierre está `aprobado`) | sí | no | CAM:1055, 1416-1432 |
| Diálogo de registrar pago que se ofrece al aprobar | sí, si el pendiente es mayor que 0 | no | CAM:845-847, 1677-1692 |
| Anular pagos | sí (`puedeAnular={puedeRegistrarPago}`) | no | CAM:1428 |
| Marca «Pendiente de liquidar» / «Liquidado» en la tarjeta de Resueltos | sí | también: el servicio la rellena para todo `aprobado` sin mirar el rol | `CierresAdminHistoricoLista.tsx:147-153`; `CierresAdminService.ts:1234-1260` |

Todo lo demás es igual para los dos roles:
- filtros, pestañas Pendientes/Resueltos, tarjeta, cascadas;
- Rechazar/Aprobar, confirmación física, indemnizar, Destrabar;
- «Ver evidencia», la marca «Ajustado» y su historial.

**Marca de pago pendiente** (`PendienteLiquidarBadge.tsx:43-52`, textos en `pago-mensajero-labels.ts`):
- `null` (cierre no aprobado): en la sección pinta «—»; en la tarjeta de Resueltos no pinta nada.
- Pendiente > 0: Badge `warning` con el monto.
- Pendiente 0: Badge `success` «Liquidado».
- Rótulo: `PENDIENTE_LIQUIDAR_COL` = «Pendiente de liquidar».

**`PagoMensajeroSeccion`** (`PagoMensajeroSeccion.tsx:159-211`). Va dentro del modal «Detalle del cierre», debajo de `CierreFacturaDetalle`, solo si `puedeRegistrarPago` y el cierre está `aprobado`. No es una pestaña aparte.
- `<section aria-label="Pago al mensajero">` con título h3 «Pago al mensajero» y la línea «Pendiente de liquidar: [badge]».
- Si hay pendiente: botón «Registrar pago», que abre `RegistrarPagoMensajeroDialog`. Si no, el texto «Este cierre ya está liquidado: no queda nada por pagar.»
- Debajo, siempre: `PagosRegistradosTabla` (`components/shared/liquidacion/PagosRegistradosTabla.tsx`), que lista también los pagos anulados.
  - Nombre accesible y título de la descarga: «Pagos registrados de {mensajero}».
  - Columnas: «Fecha del pago» · «Monto» · «Método» · «Referencia» · «Nota» · «Registró» · «Registrado el» · «Estado», más «Acciones» solo si puede anular.
  - Estado: «Vigente» (secondary) o «Anulado» (destructive), con «Anulado por {nombre} el {cuando}» y «Motivo: {motivo}».
  - Solo el Excel lleva además «Anulado por», «Anulado el» y «Motivo de la anulación».
  - Vacío: «Todavía no hay pagos registrados.» Error: «No se pudieron cargar los pagos registrados.»
  - Botón «Anular» (aria «Anular el pago de {monto} del {fecha}») solo en filas vigentes.
- Toasts de la sección:
  - registrar: «Pago de {monto} registrado.»
  - anular: «Pago anulado. Pendiente de liquidar: {monto}.» / info «Este pago ya estaba anulado.»
  - anular el reparto: «Se anularon {n} imputaciones del reparto.» / «Se anularon {n} imputaciones; {m} ya estaban anuladas.» / info «Este reparto ya estaba anulado por completo ({m} imputaciones): no se movió nada.»
- Después de registrar o anular vuelve a leer el detalle del servidor y refresca las listas.

## B. Diálogos del flujo de cierres

Todos usan `components/shared/Modal.tsx`. Si no se pasan, los botones dicen «Confirmar» / «Cancelar» (:145-146).

### B1. Rechazar cierre — CAM:1464-1516 (lógica :990-1013)
- Se abre con el botón «Rechazar» (destructive) de la sección «Decisión del cierre» (CAM:1438-1460). Solo aparece si el cierre está en `solicitado`.
- Título «Rechazar cierre». Descripción «Indicá el motivo del rechazo. El mensajero lo verá para corregir.»
- Campo: label «Motivo del rechazo» con textarea `#motivo-rechazo` de 4 filas, obligatorio y sin texto de ayuda.
- Botones: «Rechazar cierre» (destructive) / «Cancelar». No se cierra al confirmar.
- Error si está vacío: «El motivo de rechazo es obligatorio.» (también si el servidor responde `validation_error` sin mensaje).
- Toast ok: «Cierre rechazado correctamente.»
- Errores comunes de la decisión (CAM:774-786; cierran el detalle y refrescan):
  - «Este cierre ya fue resuelto por otro administrador.»
  - «El cierre ya no está disponible.»
  - «No tenés permiso para resolver este cierre.»
  - «Tu sesión expiró. Iniciá sesión de nuevo.»
  - «No se pudo resolver el cierre. Intentá de nuevo.»

### B2. Confirmar los paquetes que vuelven — CAM:1518-1550; cuerpo en `cierre-confirmacion-fisica.tsx:566-720` (textos :43-175)
- Se abre al pulsar «Aprobar» si el conjunto esperado no está vacío (CAM:887-892). Es el primer paso, antes de indemnizar.
- **Qué se confirma:**
  - Las gestiones del cierre cuyo resultado vuelve a bodega: `reprogramado`, `novedad` y `devolucion_a_origen_por_rechazo` (`lib/types/gestion-retorno.ts:33-39`). No entran `entregado` ni `incidente`.
  - Las órdenes que el corte pasó a «Novedad interna».
- Título «Confirmar los paquetes que vuelven». Descripción «Antes de aprobar, tené delante cada paquete que vuelve a bodega y confirmá su guía: escaneá el código o escribí el número.»
- Botón confirmar:
  - «Continuar» si hay incidentes; si no, «Confirmar y aprobar».
  - Deshabilitado mientras falte algún paquete. No se cierra al confirmar.
  - El otro botón es «Cancelar».
- **Barra fija arriba** (:612-642):
  - Progreso: «Paquetes confirmados: {n} de {total}.» Cuenta paquetes, no filas.
  - Sin guía: «1 paquete de esta lista no tiene número de guía: no se puede confirmar, así que este cierre no se va a poder aprobar.» / «{n} paquetes de esta lista no tienen número de guía: …»
  - Faltan: «Falta 1 paquete por confirmar. Si no llegó, rechazá el cierre indicando cuál falta.» / «Faltan {n} paquetes por confirmar. Si alguno no llegó, rechazá el cierre indicando cuáles faltan.»
  - Completa: «Están todos. Queda indicar los montos de los incidentes.» / «Están todos. Ya se puede aprobar el cierre.»
  - Aviso de la última lectura (role alert, se queda en pantalla):
    - «No se pudo leer un número de guía en ese código. Escaneá de nuevo o escribí el número.»
    - «Esa guía no pertenece a este cierre.»
    - «Esa guía ya está confirmada. No se cuenta dos veces.»
    - «Esa guía es de este cierre, pero ese paquete no vuelve a bodega. Resultado: {resultado}.»
- **Incidentes excluidos** (:645-661), sección «Incidentes excluidos de la confirmación»:
  - «1 incidente de este cierre no se escanea: ese paquete no vuelve a bodega, se indemniza.» / «{n} incidentes de este cierre no se escanean: esos paquetes no vuelven a bodega, se indemnizan.»
  - Lista: «Nº Guía {g} · {remisión} · {destinatario}».
- **Tarjeta de captura** `EscanerGuiaCard` (:666-689), aria «Confirmar por número de guía o escaneo»:
  - Título «Confirmar paquete recibido». Descripción «Escaneá el código de la guía o escribí su número».
  - Cámara (QR), o campo manual con el botón «Confirmar».
  - Error de cámara: «No se pudo abrir la cámara.»
  - Éxito: «Guía {n} confirmada.»
- **Lista** (:697-716, con scroll propio):
  - Una sección por resultado con título «{Resultado} ({n})», más «Novedad interna ({n})» para las barridas.
  - Cada fila: «Nº Guía {g} · {remisión}», chip del estado con botón de info y badge «Pendiente» (warning) o «Confirmada» (success).
  - Debajo: «{destinatario} · {tienda}».
  - Si no tiene guía: «Sin número de guía: no se puede confirmar. Avisá a un administrador.»
  - Guía en varias filas: «Este paquete aparece en {n} filas de esta lista: una sola lectura las confirma todas.»
  - Si el servidor devuelve un error para esa fila, se pinta en la misma fila.

### B3. Indemnizar los incidentes del cierre — CAM:1558-1640 (textos :322-351)
- Se abre después de la confirmación física, o directamente al pulsar «Aprobar» si no hay nada que vuelva y sí hay incidentes.
- Título «Indemnizar los incidentes del cierre». Descripción «Este cierre trae paquetes dañados, perdidos o robados. Indicá cuánto se indemniza por cada uno: al aprobar, la suma sale de la caja principal como un solo egreso.»
- Una tarjeta por incidente:
  - «{remisión} · {destinatario}»
  - «Nº Guía {g} · {tienda}[ · {motivo}]»
  - «Causa: {causa}», o «Sin causa registrada» si no hay causa.
  - Label «Monto de la indemnización» con input decimal y placeholder «0.00».
  - Ayuda: «Mayor que 0 y hasta ₡9.999.999.999, con hasta 2 decimales (por ejemplo 12500.00).» El tope se pinta con `moneyTope(INDEMNIZACION_MONTO_MAX)`.
- Errores por fila:
  - «Escribí un monto mayor que 0, con punto decimal y sin separador de miles (por ejemplo 12500.00).»
  - «El monto no puede superar {tope} (10 dígitos y 2 decimales). Revisá si sobra un dígito.»
  - Los que mande el servidor.
- Nota si falta alguno: «Falta el monto de al menos un incidente, o alguno no es válido. No se puede aprobar así.»
- Botones: «Aprobar e indemnizar» (deshabilitado si algún monto no es válido) / «Cancelar». No se cierra al confirmar.
- **Toast al aprobar** (B2/B3 o aprobar directo, CAM:836-848): «Cierre aprobado correctamente.» Luego se cierra el detalle y se refresca. Si es la central y queda pendiente, se ofrece B6.

### B4. Destrabar cierre vencido — CAM:1647-1663 (lógica :1022-1050; botones de la cola :1738-1768)
- En la tarjeta de un `vencido` de la cola hay dos botones:
  - «Ver» (outline; aria «Ver el cierre de {mensajero}»).
  - «Destrabar cierre vencido» (destructive; aria «Destrabar cierre vencido abandonado de {mensajero}»).
- El resto de tarjetas tienen solo «Ver / decidir».
- Título «Destrabar cierre vencido abandonado». Descripción «Acción de excepción. Enviarás a aprobación el cierre vencido de {mensajero} en su nombre, porque no lo solicitó. Después deberás aprobarlo o rechazarlo por la vía normal. No se recalculan los montos ya registrados.»
- No tiene campos. Botones: «Destrabar (excepción)» (destructive) / «Cancelar».
- Toast ok: «Cierre vencido destrabado; quedó como solicitado para aprobación.»
- Errores:
  - «El cierre ya no está vencido (otro proceso lo resolvió).»
  - «El cierre ya no está disponible.»
  - «No tenés permiso para destrabar este cierre.»
  - «Tu sesión expiró. Iniciá sesión de nuevo.»
  - «No se pudo destrabar el cierre. Intentá de nuevo.»

### B5. Ajustar pago — `AjustarPagoMensajeroDialog.tsx:146-247` (textos `cierre-labels.ts:815-869`; montado en CAM:1404-1415)
- Título «Ajustar el pago al mensajero». Descripción «Orden {remisión} · {destinatario}. Cambia solo lo que el mensajero gana por esta orden: no cambia la tarifa ni el pago de las demás. Queda registrado quién lo ajustó, cuándo y con qué motivo.»
- Campos:
  - Línea «Pago vigente» con su monto.
  - «Valor nuevo», input decimal. Ayuda: «Puede ser 0. Solo números, con punto para los decimales (hasta 2), por ejemplo 1500 o 1500.50.»
  - «Motivo del ajuste», textarea de 3 filas. Ayuda: «Obligatorio. Queda en el historial del ajuste.»
- Botones: «Guardar ajuste» (deshabilitado si falta el valor o el motivo) / «Cancelar».
- Al terminar, el cuerpo cambia a:
  - «Listo. Así quedó el pago, según el servidor:»
  - «Pago de esta orden» {monto}
  - «Total de pago al mensajero del cierre» {monto}
  - Un solo botón: «Cerrar».
- Toast ok: «Pago al mensajero ajustado.»
- Errores generales:
  - «No se pudo ajustar el pago. Inténtalo de nuevo.»
  - «El cierre dejó de estar abierto o el pago de esta orden cambió mientras ajustabas: recarga el detalle para ver el valor vigente.»
  - «Esta gestión ya no está disponible para ajustar.»
  - «No tienes permiso para ajustar el pago al mensajero.»
  - «Tu sesión expiró. Inicia sesión de nuevo.»
  - Los errores por campo vienen del servidor.
- Rastro del ajuste (`MarcaAjustado.tsx:44-83`; se pinta en `cierre-detalle-shared.tsx:874-876`):
  - Badge «Ajustado» junto al pago. Aria «Pago ajustado: ver el ajuste» / «Pago ajustado: ver los {n} ajustes».
  - Abre un popover «Ajustes del pago al mensajero». Cada ajuste: «{cuándo} · {actor} ({rol})», «{anterior} → {nuevo}» y «Motivo: {motivo}».
  - En el detalle de bodega aparece la marca «Con ajustes», con nota «1 gestión de este cierre tiene el pago al mensajero ajustado.» / «{n} gestiones …».

### B6. Registrar pago al mensajero — `RegistrarPagoMensajeroDialog.tsx:52-103`, que envuelve `components/shared/liquidacion/RegistrarPagoDialog.tsx:369-510` (textos `liquidacion-labels.ts:171-220`)
- Dos formas de entrar:
  - Botón «Registrar pago» de `PagoMensajeroSeccion`.
  - Oferta automática después de aprobar (CAM:1677-1692, `trasAprobar`). Se monta fuera del detalle, que ya está cerrado.
- Título «Registrar pago a {mensajero}». Descripción «El pago queda anotado como documento y no se puede editar: si algo sale mal, se anula y se registra de nuevo.»
- Encabezado: «Disponible: {pendiente}».
- Campos:
  - «Monto»: arranca con el disponible completo y placeholder «0.00». Ayuda «Puedes registrar un pago parcial: escribe un monto menor.»
  - «Método»: Efectivo / SINPE / Transferencia; por defecto Efectivo.
  - «Referencia». Ayuda «Número de SINPE o de la transferencia.» (obligatoria salvo en efectivo) / «Opcional en efectivo: número de recibo, si lo hay.»
  - «Fecha del pago»: date, hoy por defecto y máximo hoy. Ayuda «El día en que se entregó el dinero. No puede ser posterior a hoy.»
  - «Nota». Ayuda «Opcional. Queda guardada junto al comprobante.»
- Errores de campo:
  - «El monto debe ser un número mayor que 0, con hasta 2 decimales.»
  - «El monto no puede superar {max}.»
  - «La referencia es obligatoria en SINPE y transferencia.»
  - «La referencia no puede superar 60 caracteres.»
  - «La nota no puede superar 500 caracteres.»
  - «La fecha del pago no puede ser posterior a hoy.»
- Respuestas del servidor:
  - «Pago registrado.»
  - «Este pago ya estaba registrado: se conservó el comprobante original y no se cobró dos veces.»
  - «El monto supera lo que se puede pagar. Disponible: {d}.»
  - `sin_saldo`: el texto por defecto habla de tienda («Esta tienda no tiene saldo a favor, así que no hay nada que pagar.»). El envoltorio del mensajero no lo sustituye.
  - «El cierre no está aprobado, así que todavía no se puede pagar.»
  - «No se encontró a quién pagar. Vuelve a abrir la pantalla e inténtalo de nuevo.»
  - «No tienes permiso para registrar pagos.»
  - «Tu sesión expiró. Inicia sesión de nuevo.»
  - «No se pudo registrar el pago. Vuelve a intentarlo; no se registró nada.»
- Botones: «Registrar pago» / «Cancelar». En la oferta después de aprobar, el segundo botón dice «Ahora no».
- Toasts:
  - ok: «Pago de {monto} registrado.»
  - fallo después de aprobar: «El cierre quedó aprobado. El pago no se registró: podés registrarlo después desde el detalle del cierre.»
  - fallo desde el detalle: «No se registró el pago. Revisá el aviso del formulario e intentá de nuevo.»

### B7. Anular pago — `components/shared/liquidacion/AnularPagoDialog.tsx:213-296` (textos `liquidacion-labels.ts:105-168`)
- Título «Anular el pago a {mensajero}». Descripción «El pago no se borra: queda a la vista, marcado y con el motivo, y el dinero vuelve al saldo con un movimiento nuevo. Si hace falta, después se puede registrar el pago correcto.»
- Resumen: «Pago de {monto} del {fecha}, en {método}.»
- Solo si el pago es parte de un reparto, aparece el bloque «Qué se anula»:
  - Opciones: «Solo este pago» (por defecto) / «Todas las imputaciones de este reparto».
  - Ayuda: «Este pago se repartió entre varios cierres. Anular el reparto completo deshace todas sus imputaciones con este mismo motivo, en un solo acto.»
- Campo «Motivo de la anulación» (textarea). Ayuda «Obligatorio. Se guarda junto al pago y lo verá quien revise el comprobante.» Error «El motivo de la anulación es obligatorio.»
- Botones: «Anular pago» (o «Anular el reparto») / «Cancelar».
- Avisos de respuesta:
  - «Pago anulado.»
  - «Este pago ya estaba anulado: se conservó la anulación original.»
  - «No se encontró el pago. Vuelve a abrir la pantalla e inténtalo de nuevo.»
  - «No tienes permiso para anular pagos.»
  - «Tu sesión expiró. Inicia sesión de nuevo.»
  - «La petición no es válida. Vuelve a abrir la pantalla e inténtalo de nuevo.»
  - «No se pudo anular el pago. Vuelve a intentarlo.»
  - Del reparto: «No se encontró el reparto. Vuelve a abrir la pantalla e inténtalo de nuevo.» / «No se pudo anular el reparto. Vuelve a intentarlo.»
- Los toasts de éxito están en A, en `PagoMensajeroSeccion`.

### B8. Corregir métodos de pago — `CorregirPagosDialog.tsx:37-45, 146-176` (montado en CAM:1373-1383)
- Título «Corregir métodos de pago». Descripción «Orden {remisión} · {destinatario}. El total recibido no cambia: se reparte entre los métodos. Queda registrado quién hizo la corrección.»
- Cuerpo: `components/shared/DesglosePagoField.tsx`, el mismo editor que usa el mensajero.
  - Título «Método de pago». Cada línea con «Método de pago línea», «Monto línea» y «Quitar línea»; botón «Añadir método».
  - Resumen del cobro: «A cobrar», «Capturado», «Diferencia».
  - Errores:
    - «El desglose debe sumar exactamente el monto a cobrar.»
    - «Monto requerido» / «Método de pago requerido»
    - Si el monto lleva céntimos: «El monto a cobrar es {m} y aquí solo se capturan montos sin céntimos: los {c} finales no se pueden teclear, así que la suma nunca va a cuadrar. Avisa a la oficina para que ajusten el monto de la orden.»
- Botones: «Guardar» (deshabilitado si hay error o el desglose no cuadra) / «Cancelar».
- Toast ok: «Métodos de pago actualizados.» Cierra el diálogo y vuelve a leer el detalle.
- Errores:
  - «No se pudo actualizar el desglose. Inténtalo de nuevo.»
  - «El cierre dejó de estar abierto mientras corregías: recarga el detalle para ver su estado.»
  - «Esta gestión ya no está disponible para corregir.»
  - «No tienes permiso para corregir el desglose de pago.»

### B9. Corregir el resultado (entregada → devolución a origen; ficha 398) — `CorregirResultadoDialog.tsx:45-83, 172-245` (montado en CAM:1389-1399)
- Título «Corregir el resultado de la entrega». Descripción «Orden {remisión} · {destinatario}. La entrega pasa a ser Devolución a origen por rechazo. Queda registrado quién la corrigió, cuándo y con qué motivo.»
- Bloque «Al corregir:» con cuatro puntos:
  - «El cobro registrado de esa entrega desaparece del cierre.»
  - «El pago al mensajero por esa entrega pasa a cero.»
  - «El paquete se tratará como una devolución al aprobar el cierre.»
  - «La orden sigue «En reparto» hasta entonces: su estado pasa a «Devolución a origen por rechazo» al aprobar el cierre.»
- Campo «Motivo de la corrección» (textarea de 3 filas). Ayuda «Obligatorio. Es lo que queda escrito para explicar por qué cambió el dinero de este cierre.»
- Botones: «Marcar como Devolución a origen por rechazo» (destructive, deshabilitado sin motivo) / «Cancelar».
- Al terminar:
  - «Listo. Así quedaron los totales del cierre, recalculados por el servidor:»
  - `TotalesPanel` con título «Totales del cierre tras la corrección»
  - Un solo botón: «Cerrar».
- Toast ok: «Resultado corregido: la entrega pasó a Devolución a origen por rechazo.»
- Errores:
  - «No se pudo corregir el resultado. Inténtalo de nuevo.»
  - «El cierre dejó de estar abierto mientras corregías: recarga el detalle para ver su estado.»
  - «Esta gestión ya no está disponible para corregir.»
  - «No tienes permiso para corregir el resultado de una gestión.»
  - El error de campo del servidor.

### B10. Ver evidencia — botones `botones-evidencia.tsx:34-89`; visor en CAM:1697-1715 y en `cierre-dia/_components/CierreDiaModule.tsx:1088-1106` (idéntico)
- Botón de la fila desplegada: con una sola foto dice «Ver evidencia» (aria «Ver evidencia de la orden {remisión} · {destinatario}»).
  - Con varias fotos son botones «Ver evidencia 1», «Ver evidencia 2», …, dentro de un grupo; aria «Ver evidencia {i} de {n} …».
  - Si no hay fotos no se pinta nada.
- Visor: Modal «Evidencia de la gestión», sin descripción. Imagen con alt «Evidencia fotográfica de la gestión» (máx. 60vh). Botón único «Cerrar».

Lista y orden de los botones de la fila desplegada (`cierre-factura.tsx:1972-2026`): Ver evidencia → Corregir métodos de pago → Corregir el resultado → Ajustar pago.

## C. /cierre-dia (vista del MENSAJERO)

**Página** (`cierre-dia/page.tsx:22-67`):
- Solo para el rol `mensajero`; a los demás les da `notFound`.
- AppPage título «Cierre del día», descripción «Detalle de lo gestionado, totales por método de pago y solicitud de cierre».
- Datos: `listarCierreDia` (grupos, totales, totalPagoMensajero, puedesSolicitar, motivoBloqueo, correcciones), `listarCierresPasadosPaginado` y `estadoBloqueoMensajero`.
- Un único componente: `CierreDiaModule.tsx`.

**Secciones en orden** (`CierreDiaModule.tsx:705-962`):

1. **Aviso de bloqueo** (:716-723). Role alert, solo si `bloqueo.bloqueado`. Texto de `avisoBloqueo(bloqueo,{conCta:false})` (`lib/constants/bloqueo-mensajero.ts`):
   - «Tienes un cierre sin enviar a aprobación. Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo. Envíalo a aprobación con el botón de abajo.»
   - «Tienes {n} cierres sin resolver y ninguno se ha enviado a aprobación. … Envíalos a aprobación, empezando por el más antiguo[, el del {día}].»
   - «Tienes {n} cierres sin resolver y {v} de ellos no se ha(n) enviado a aprobación. … Envía el/los que falta(n)[, el del {día},] y después espera a que la bodega apruebe el resto.»
   - «Tienes {n} cierres esperando aprobación. … Se desbloquea cuando la bodega apruebe el más antiguo[, el del {día}].»
   - Cuando hay órdenes en corrección, el «Mientras tanto…» pasa a «…; solo puedes volver a gestionar la orden / las {n} órdenes de tu cierre rechazado.»
2. **Cierre vencido** (:734-749). Sección «Cierre vencido» con el texto «Tu cierre venció sin enviarse a aprobación. Envíalo con el botón de abajo.» y el botón destructive «Solicitar aprobación del cierre vencido».
3. **Cierre rechazado** (:755-770). Excluye al anterior. Sección «Cierre rechazado» con el texto «Tu cierre fue rechazado, pero no queda cerrado. Vuelve a enviarlo a aprobación con el botón de abajo.» y el botón «Solicitar aprobación del cierre rechazado».
4. **Panel de corrección**, uno por cierre rechazado (:773-781 y `PanelCorreccion` :1386-1486). La región se llama «Corregir el cierre rechazado» o «… ({i} de {n})».
   - h2 «Corregir el cierre rechazado»; «Motivo del rechazo: {motivo}», o «La bodega no indicó un motivo.» si no hay.
   - Explicación: «Si una gestión quedó mal, devuélvela a gestión: sale de este cierre, sus totales se recalculan y la orden vuelve a Entregas para que la gestiones de nuevo. Cuando termines, vuelve a enviar el cierre a aprobación.»
   - Aviso: «Envíalo hoy: si el corte de la noche llega antes, lo que corregiste pasa a un cierre nuevo.»
   - h3 «Gestiones del cierre». Cada gestión: remisión, badge «La tienda», estado con info, monto y «Ganancia: {m}», más el botón «Devolver a gestión». Vacío: «Este cierre ya no tiene gestiones.»
   - h3 «Órdenes por volver a gestionar». Badge «Ya la volviste a gestionar» (success) o «Falta volver a gestionarla» (warning), y el enlace «Ir a Entregas» (`/mis-asignaciones/reparto`).
5. **«Totales del día»** (:784-797), en Card: «Efectivo» `totales.efectivo` · «SINPE» `totales.simpe` · «Transferencia» `totales.transferencia` · «Total general» `totales.general` (destacado).
6. **«Ganancia»** (:800-812), Card con borde punteado: «Total de ganancia» `totalPagoMensajero`.
7. **Una sección por resultado** (:815-875), en el orden Entregado, Reprogramado, Novedad, Devolución a origen por rechazo, Incidente. Se oculta si no tiene filas.
   - h2 «{Resultado} ({n})» con `InfoEstado`, y DataTable con su propia descarga (Excel/CSV, selector de columnas por resultado).
   - Columnas comunes (:1184-1214): «Nº Guía» (+ badge «La tienda», nota «Esta gestión la registró la tienda desde «Ayuda solicitada», no vos: el motivo y la foto son suyos. Cuenta en tu cierre igual.»), «Nº Remisión», «Destinatario», «Dirección», «Ubicación», «Producto», «Tienda».
   - Columnas por resultado (:1223-1347):
     - Entregado: + «Monto» (`montoRecibido`), «Método» (desglose), «Ganancia» (`pagoMensajero`), «Acciones».
     - Reprogramado: + «Nueva fecha», «Motivo», «Ganancia», «Acciones».
     - Novedad: + «Motivo», «Ganancia», «Acciones».
     - Devolución a origen por rechazo: + «Motivo», «Evidencia», «Ganancia», «Acciones».
     - **Incidente**: + «Causa» (`COLUMNA_CAUSA_INCIDENTE`), «Motivo», «Evidencia», «Acciones». **No lleva «Ganancia».**
   - «Motivo» usa la variante larga de `motivoGestionLegible`, que añade «· el sistema la pasó a devolución a origen al vencerse el plazo de la novedad».
   - «Evidencia»: `BotonesEvidencia`, o «—» si no hay.
   - Descarga del Incidente (`cierre-dia-descarga-columnas.ts:210-215`): las columnas comunes + «Fecha de gestión», «Causa», «Motivo», «Tiene evidencia» (Sí/No). Tampoco lleva «Ganancia». Las demás secciones sí la llevan («Ganancia»).
   - Vacío de una sección: «No hay gestiones con resultado «{Resultado}».» En la práctica no se ve, porque la sección se oculta.
   - Botón de fila «Devolver a gestión» (:1357-1380), aria «Devolver a gestión la orden {remisión} · {destinatario}». Si la gestión es de la tienda va deshabilitado, con el title «Esta orden la resolvió la tienda desde su pantalla de ayuda; solo ella puede corregirlo. Escribile por el chat de la orden.»
8. **«Solicitar cierre»** (:878-901). Botón «Solicitar cierre», deshabilitado si `!puedesSolicitar`. Debajo, la nota con `motivoBloqueo` (`lib/services/CierreDiaService.ts:83-90`):
   - «Tenés paquetes en reparto que todavía no gestionaste; gestionalos antes de cerrar.»
   - «No tenes gestiones pendientes de cierre.»
   - Sin zona: «No tenes una zona asignada; contacta a tu administrador.»
   - Carrera al re-solicitar: «Ese cierre ya se envio a aprobacion; actualiza la pagina.»
9. **«Cierres solicitados»** (:904-962). h2, botón de descarga del conjunto completo (columnas Estado, Destino, Efectivo, SINPE, Transferencia, Total, Ganancia, Fecha) y `ListaComprobantes` + paginación.
   - Vacío: «Aún no has solicitado ningún cierre.» Error: «No se pudieron cargar tus cierres solicitados.»
   - Cada tarjeta es `CierreFacturaResumenPropio` (`cierre-factura.tsx:1215-1244`):
     - «Cierre del día», folio «Comprobante #…» o «Solicitud #…» (en solicitado/vencido), badge de estado, destino y fecha.
     - «Total». Desplegable con «Desglose por método», «Ajustes» (solo «Ganancia», sin ingreso de bodega) y «Fechas».
     - «Motivo de rechazo: …» solo si está `rechazado`.
     - Botón «Ver» (aria «Ver del cierre del {fecha}»).

**Modales del mensajero** (:965-1106):
- «Solicitar cierre del día»: «Se agruparán todas tus gestiones pendientes en una solicitud de cierre. Esta acción no se puede deshacer.» Botón «Solicitar cierre».
- «Solicitar aprobación del cierre vencido»: «Se enviará tu cierre vencido a tu bodega para aprobación. No se recalculan los montos ya registrados.» Botón «Solicitar aprobación».
- «Solicitar aprobación del cierre rechazado»: «Se enviará de nuevo tu cierre rechazado a tu bodega para aprobación, con los totales de las gestiones que tenga al enviarlo.» Si quedan órdenes sin rehacer añade «Hay 1 orden que deshiciste y no volviste a gestionar: saldrá del cierre al enviarlo.» / «Hay {n} órdenes …: saldrán del cierre al enviarlo.» Botón «Solicitar aprobación».
- «Devolver la orden a gestión»: «Orden {r} · {d}. La gestión quedará anulada (queda el registro de quién la hizo y cuándo) y la orden volverá a tu lista para gestionar.» Botón «Devolver a gestión».
- «Detalle del cierre» (:1020-1085):
  - Descripción «{Estado} · {fecha} · {Bodega central|Bodega satélite}».
  - Mensajes de estado: «Cargando el detalle…», «No se pudo cargar el detalle de este cierre.» y «Este cierre ya no está disponible.»
  - Cuerpo: `CierreFacturaDetalle audiencia="mensajero"` más la nota «Los montos son los que quedaron congelados al solicitar el cierre.»
  - Botón único «Cerrar».
- «Evidencia de la gestión»: igual que B10.
- Toasts (:642-703):
  - Al enviar: «Cierre solicitado correctamente.» si el cierre es nuevo. Si es un reenvío (`via: "resolicitado"`), el texto que pasa el botón pulsado: «Cierre enviado a aprobación.», «Cierre vencido enviado a aprobación.» o «Cierre rechazado enviado a aprobación.».
  - Errores al enviar: el motivo que manda el servidor, «No tenés permiso para solicitar el cierre.» o «No se pudo solicitar el cierre. Intentá de nuevo.»
  - Deshacer: ok «Gestión deshecha; la orden volvió a tu lista para gestionar.»; errores «No podés deshacer esta gestión.» / «No se pudo deshacer la gestión. Intentá de nuevo.» o el motivo del servidor.

**Qué comparte con el detalle del admin.** El modal «Detalle del cierre» de un cierre pasado es el mismo `CierreFacturaDetalle` (`cierre-factura.tsx`), con `audiencia="mensajero"`.

Lo que el mensajero sí ve:
- La cabecera «Cierre del día», con el badge de estado y la marca «Retiene N paquetes reprogramados para hoy».
- «Rechazados por la tienda».
- KPIs: «Total general», «Ganancia», «Gestiones».
- «Totales del cierre»: Efectivo / SINPE / Transferencia / Total general.
- El bloque «Ganancia».
- `GestionesPorResultado` (pestañas). La cabecera de fila dice «Guía / Destinatario / Recibido / Ganancia»; en el admin dice «Cobrado / Total de la empresa» (`cierre-factura.tsx:2126-2132`).
- En la fila desplegada: Recibido, Tienda, Ganancia (con badge «Sin tarifa»), Nueva fecha, Motivo (variante larga), Causa, el badge «La tienda» y «Ver evidencia».
- «Pasaron a Novedad interna».

Lo que no ve:
- Las cascadas: `CascadasCierreMensajero` solo se monta en CAM.
- «Pago a tienda» / ingreso de bodega, «Total de la empresa», «Ingreso de la empresa» y «Liquidación / Debe» (`cierre-factura.tsx:2641-2800`).
- En la fila: el badge de origen Automático/Manual, la indemnización, el fulfillment, el ingreso de bodega, el desglose del ingreso de la empresa (`ing` no llega en `CierreDiaRepository`), los ajustes del pago y todos los botones de corrección o ajuste.

**Lo que es propio de /cierre-dia y no reusa el detalle del admin:**
- Las tablas en vivo del día: DataTable propia, columnas propias y descarga por sección.
- Los paneles de totales y de «Ganancia».
- `PanelCorreccion`.

## D. Otras superficies que muestran un cierre o enlazan a él

Fuera del inventario de bodega y de A-C.
- **`/wallet/mensajeros/[mensajeroId]`**: `EstadoCuentaMensajero.tsx`.
  - Estado de cuenta del mensajero, con saldo corrido de lo devengado por cierres, los pagos y los premios.
  - Lleva `SelectorCierreDeCuenta` (`components/shared/estado-cuenta/SelectorCierreDeCuenta.tsx`), que filtra por cierre.
  - Lleva `PagoMensajeroAcciones.tsx` y `RepartoPrevisualizacion.tsx`, para registrar un pago repartido entre varios cierres:
    - Sección «Pago al mensajero», «Se puede pagar ahora».
    - «Último pago registrado»: «Total aplicado», «Sigue pendiente por cierres».
    - Cada cierre imputado enlaza a `/cierres-admin?cierre=` con «Ver el cierre» (`wallet-mensajeros-labels.ts:156-226`).
  - Nota de la página: «Para anular un pago, abrí su fila con «Ver»: es la misma anulación que la de Cierres…».
  - Cada movimiento abre `wallet/_components/DetalleMovimientoCierre.tsx`: «Cierre del día {fecha}», «{a} de {n} órdenes del cierre aportan a este concepto».
- **`/wallet/mensajeros`** (listado): columnas Mensajero / Devengado / Pagado / Cuenta por pagar / Estado («Pendiente» / «Al día»). Desde aquí se entra al estado de cuenta anterior.
- **`/wallet/tiendas/...`** (`EstadoCuentaTienda.tsx`, `PagosTiendaEstadoCuenta.tsx`):
  - Los movimientos que nacen de un cierre abren `DetalleMovimientoCierre` («Cierre del día {fecha}», con las órdenes que aportan).
  - También llevan `SelectorCierreDeCuenta`.
- **`/wallet`** (libro, `WalletLedger.tsx`): el detalle de un movimiento de cierre es el mismo `DetalleMovimientoCierre`.
  - El origen legible del movimiento enlaza al detalle del cierre (`lib/services/OrigenLegibleService.ts:203`, `hrefDetalleCierre`).
- **`/mi-wallet`** (la tienda): `MiEstadoCuenta.tsx`, que abre `DetalleMiMovimientoCierre.tsx`: «Cierre del día {fecha}», «{a} de {n} órdenes tuyas del cierre aportan a este concepto».
  - También se reutiliza en `/historico/acciones` (`HistorialAccionesModule.tsx`).
- **`/ordenes`**: `FranjaReprogramadasRetenidas.tsx`.
  - Franja «Paquetes reprogramados para hoy que esperan un cierre», con la frase «Hay N paquete(s) reprogramado(s) para hoy que todavía no puedes asignar: falta(n) M cierre(s) por aprobar.»
  - Lista los cierres, cada uno con un enlace a `/cierres-admin?cierre={id}`, y el enlace «Revisar cierres».
- **`/incidentes`** (`IncidentesAdminModule.tsx`, `IncidentesHistoricoTabla.tsx`): usa `INDEMNIZACION_MONTO_MAX` y las etiquetas de `cierre-detalle-shared` (causa del incidente) para identificar la orden «igual que la cola de cierres». No abre el detalle del cierre.
- **`/mis-asignaciones/reparto`, `/mis-asignaciones/recoger`, `/recoleccion`**: muestran el mismo aviso de bloqueo que C, con el texto `avisoBloqueo` y `conCta: true`, que termina en «Ve a «Cierre del día» para enviarlo a aprobación.» o «Ve a «Cierre del día».».
- **Notificaciones** (`lib/notificaciones/catalogo-avisos.ts`):

  | Evento | Línea | Atajo |
  |---|---|---|
  | `cierre_dia_vencido` | :192 | «Ver mi cierre» → `/cierre-dia` |
  | `mensajero_bloqueado_por_cierres` | :207 | admin: «Revisar cierres» → `/cierres-admin`; mensajero: «Ver mi cierre» → `/cierre-dia` |
  | `cierre_dia_rechazado` | :290 | «Ver mi cierre» → `/cierre-dia` |
  | `reprogramadas_esperan_cierre` | :373 | — |

- **Menú**: la entrada «Cierre del día» → `/cierre-dia` (`lib/auth/menu-visibility.ts:625`). Pertenece al módulo `nucleo` (`lib/modulos/reparto.ts:30`).
- **`/analitica`** (export financiero): `ExportarVistaFinanciera.tsx` / `financiero/cargar.ts` leen `ConciliacionCierresAnaliticaRepository` (`lib/actions/analitica-financiera.ts:79`), que trae la conciliación de cierres como datos de un export. No muestra ni enlaza el detalle.

## Rarezas vistas (sin propuesta)
- /cierre-dia: en la sección y en la descarga de «Incidente» no está la columna «Ganancia»; en las otras cuatro sí.
- En `sin_saldo`, el diálogo de registrar pago al mensajero usa el texto por defecto, que habla de «Esta tienda…»: `RegistrarPagoMensajeroDialog` no le pasa `mensajeSinSaldo`.
- Tratamiento mezclado en la misma pantalla:
  - voseo («Indicá», «No tenés permiso», «podés») junto a tuteo («Inténtalo», «No tienes permiso», «Puedes registrar», «Envíalo»);
  - textos del servidor sin tildes («No tenes gestiones…», «contacta», «se envio a aprobacion»).
- La marca «Pendiente de liquidar»/«Liquidado» en Resueltos también la ve el adminSatelite, aunque no puede pagar: el servicio no filtra por rol.
