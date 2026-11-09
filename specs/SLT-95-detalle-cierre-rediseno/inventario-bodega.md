# Inventario del flujo de bodega satélite (hoy, rama dev e9aa915f)

Fuente para el canvas de bodega (PA3, Carlos 2026-11-09: «no dejes nada por fuera»). Textos literales del código.

## 0. Común
- `/cierres-admin` (`app/(app)/cierres-admin/page.tsx`): «Cierres del día». adminSatelite → `ConsolidacionBodegaModule` + `CierresAdminModule`; maestro/admin → `CierresBodegaAdminModule` + `CierresAdminModule`.
- Conmutador «Bodega» / «Mensajero» (`CierresTabs.tsx`), arranca en Mensajero.
- adminSatelite: audiencia "satelite" (sin Fulfillment), solo «Ajustar pago» en la fila; sin registrar pago ni corregir.

## A. Satélite aprueba los cierres de sus mensajeros (`CierresAdminModule.tsx`)
- Filtros: Fecha de solicitud, Bodega, Mensajero, Estado, Buscar. Sin zona: «No tenés una zona asignada; contactá a tu administrador.»
- Pestañas «Pendientes (N)» / «Resueltos (N)». Descarga Resumen/Detalle.
- Tarjeta `CierreFacturaResumen`: «Cierre del día» #folio, estado (Solicitado/Aprobado/Rechazado/Vencido), «Mensajero bloqueado · N», «Retiene N paquetes reprogramados para hoy», mensajero · «Bodega satélite · {zona}» · fecha · Total; desplegable Desglose por método / Ajustes (Pago al mensajero, Ingreso de bodega) / Fechas. Acciones «Ver / decidir», «Ver», «Destrabar cierre vencido». Resueltos: «Bloqueante hasta re-solicitud», pago pendiente/«Liquidado».
- Modal «Detalle del cierre»: cascadas (De quién es el dinero; Lo que la empresa le factura a la tienda; De qué tienda es cada parte; Lo que le queda a la empresa) + `CierreFacturaDetalle` (Rechazados por la tienda, Pago a tienda, Ingreso de bodega Automático/Manual, KPIs, Totales, Ingreso de la empresa, Liquidación/Debe, `GestionesPorResultado` con 5 pestañas y fila desplegada, «Pasaron a Novedad interna», pie «Total recaudado ₡X · N entregas»).
- Decisión: «Rechazar» (motivo obligatorio) / «Aprobar» (flujo paquetes que vuelven: «Confirmar los paquetes que vuelven»; flujo incidentes: «Indemnizar los incidentes del cierre»). Destrabar: «Destrabar (excepción)». Toasts de aprobado/rechazado/ya resuelto/sin permiso.

## B. Satélite consolida con la central (`ConsolidacionBodegaModule.tsx`)
- Pestañas «A consolidar (N)» / «Solicitados». Descarga Excel/CSV por pestaña.
- A consolidar: «Totales a consolidar» Efectivo/SINPE/Transferencia/Total general + «Total neto»; «Total a pagar a mensajeros»; «Ingreso de bodega»; «Central debe» (si ≠ 0, nota «El efectivo no alcanzó para pagarle a todos los mensajeros (el pago no puede ser parcial).»). NO muestra «Para la central».
- Lista «Cierres del día a consolidar» (tarjetas sin estado). Vacío «No hay cierres del día aprobados para consolidar.»
- Botón «Solicitar cierre de bodega»; bloqueos: «Primero resolve los cierres de tus mensajeros antes de cerrar la bodega.» / «No hay cierres de mensajero aprobados para consolidar.» / sin zona. Confirmación «Se consolidarán todos los cierres del día aprobados de tu zona en una solicitud a la bodega central. Esta acción no se puede deshacer.»
- Solicitados: tarjeta «Cierre de bodega» #folio, badge Pendiente de conciliar / Recibido / Recibido incompleto; desplegable Desglose; «Lo que va a la central» (Total − Pago al mensajero − Gana la bodega satélite = Para la central); Conciliación (Monto recibido, Falta por recibir, Conciliado por/el, nota); Fechas; «Cierres del día consolidados: N». SIN detalle abrible.
- Rarezas: «Solicitados» ignora los filtros (la descarga sí los usa).

## C. Central
- C1 `/cierres-admin` pestaña Bodega (`CierresBodegaAdminModule.tsx`): Pendientes (N) / Resueltos; tarjeta con «Ver / decidir» / «Ver». Modal «Detalle del cierre de bodega»: Totales; «Lo que va a la central»; «De quién es el dinero» (… = Para la tienda; Cobrado sobre lo recaudado + Flete no entregadas = Lo que la empresa facturó − IVA − Pago al mensajero − Gana la bodega satélite = Neto de la empresa); Por tienda (≥2); Ingreso de la empresa; luego un bloque por cada cierre del día (badge «Con ajustes», mismas cascadas, gestiones solo lectura con Fulfillment). Sección «Conciliación del cierre de bodega» (Marcar recibido/Corregir/Desmarcar).
- C2 `/wallet/satelites`: tarjetas «Pendiente de conciliar», «Recibido este mes», «Con diferencia»; conmutador «Con pendiente (N)»/«Todas (N)»; tabla Bodega · Pendiente · Sin consolidar · Más antigua sin conciliar · Última recibida · «Ver estado de cuenta»; nota «El saldo no es un movimiento de caja…».
- C3 `/wallet/satelites/[zonaId]`: «Estado de cuenta de {bodega}»: «Por entregar hoy» + 4 tarjetas (al inicio, recibido, declarado, al final); filtros Periodo / Tipo; tabla Fecha · Movimiento · Declarado · Recibido · Por entregar. Al pie conciliación: «Pendiente de llegar», aviso de incompletas, «Sin conciliar»/«Todas», tabla Consolidada · Para la central · Recibido · Falta por recibir · Estado · Conciliado por · acciones; fila desplegada Efectivo + SINPE + Transferencia = Total − Pago al mensajero − Gana la bodega satélite = Para la central − Monto recibido = Falta por recibir.
- C4 Diálogos: «Marcar recibido» / «Corregir el monto recibido» (Declarado por la bodega, Monto recibido, Nota); «Desmarcar» (con_asientos: «No se puede desmarcar…»).

## Discrepancias vistas
- Comentario DTO de `faltaPorRecibir` dice «sobre el EFECTIVO»; desde SLT-73 es contra `paraLaCentral`.
- «Solicitados» ignora filtros.
