# SLT-136 — planes-aviso-descarga-factura · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SLT-118, SLT-119 · **Rama:** `feature/SLT-136-planes-aviso-descarga-factura`
>
> **Alcance:** al cerrarse una factura de la plataforma, cada maestro activo de la empresa recibe un
> aviso en la campanita y un correo con el resumen y un enlace a «Mi plan». Desde el detalle de una
> factura cerrada (pantallas de SLT-119), el maestro y el superadmin descargan un PDF (resumen y
> desglose por día, según la plantilla de referencia `docs/referencias/Factura-1-Ordenex.pdf`) y un
> Excel con cada movimiento.
>
> **Lo que NO entra:** los correos del pago a la plataforma (SLT-132); que el admin de la empresa vea o
> descargue facturas (sigue la regla de SLT-91: «Mi plan» solo para el maestro); la descarga de la
> factura en curso; adjuntar el PDF al correo; subir o cambiar el logo desde una pantalla.
>
> Sembrado por `/afinar-feature` el 2026-11-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- **Logo de Singularis — ya no bloquea (2026-11-17).** El humano dejó un logo PROVISIONAL (rectángulo
  negro de 400×100) en `docs/referencias/logo-singularis.png` y `.svg` del checkout principal. La tarea del
  logo lo copia a `public/brand/` con un nombre estable (el PNG: jsPDF no pinta SVG) y su ruta va en
  `lib/config/marca.ts`; queda marcado como provisional. El humano lo reemplazará por el real con el mismo
  nombre, sin tocar código.
- La plantilla de referencia (`docs/referencias/Factura-1-Ordenex.pdf`) vive solo en el checkout
  principal del humano, fuera de git. Ruta absoluta:
  `C:\Users\Cristian\Documents\trabajo\arc\servi_logistic\docs\referencias\Factura-1-Ordenex.pdf`.

### Tamaño: resuelto (2026-11-17)

`spec_author` estimó ~63 archivos (~34 de producción, ~29 de tests) y ~1 470 líneas de producción,
por encima de `gate.tamano_pr`. El humano eligió **un solo PR por encima del tope**, sin partir la ficha
(precedente: SLT-60). Las preguntas que salieron al estimar están cerradas abajo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-17 | ¿Quién descarga la factura? | El maestro, las de su empresa, en «Mi plan»; y el superadmin, las de cualquier empresa, en Plataforma > Empresas > pestaña Facturación. El admin de la empresa no ve ni descarga: se mantiene `ROLES_MI_PLAN = ["maestro"]` (SLT-91). |
| 2026-11-17 | ¿Qué facturas se descargan? | Solo las cerradas, con número. La factura en curso no se descarga. |
| 2026-11-17 | Contenido del PDF | Igual a la plantilla de referencia: cabecera con marca, «Factura de plataforma», número y cliente; tarjetas de cliente, estado, período facturado, fecha de emisión (cierre), periodicidad y plan; tabla «Resumen» (cargos por orden, reversos de cargos, total órdenes, cuota del plan) con cantidad e importe (sin columna «Tarifa», ver abajo); franja «Total a pagar»; nota con el total de movimientos; «Desglose por día» con cargos, reversos, órdenes netas e importe neto, más su fila de total. Pie con el texto de marca, el número de factura, el cliente y «Página n de m». |
| 2026-11-17 | Contenido del Excel | Detallado: una fila por movimiento con fecha, número de guía, número de remisión de la orden, tipo (cobrado o reverso) y valor. |
| 2026-11-17 | Marca del PDF | Singularis y Servi Logistic, como en la referencia («Singularis · Plataforma Servi Logistic»). El logo de la cabecera es configurable en código: un archivo en `public/brand/` con su ruta en `lib/config/marca.ts`; cambiarlo es reemplazar el archivo y desplegar. El logo en el pie no es obligatorio. |
| 2026-11-17 | Aviso al cerrar una factura | Aviso en la campanita (con push) y correo a cada maestro activo de la empresa. El superadmin no recibe nada. Enmienda R25 de SLT-118 («Aviso al cerrar: No por ahora»). |
| 2026-11-17 | Contenido del correo | Resumen del cobro (período, cuota, cargos, reversos y total a pagar) y un enlace «Ver factura» que abre «Mi plan». Sin PDF adjunto. |
| 2026-11-17 | E2E | No es flujo crítico de `docs/checkpoints-proyecto.md`. Se extiende `e2e/facturas-plataforma.spec.ts` con la descarga. |
| 2026-11-17 | Tamaño del PR | Un solo PR por encima del tope (~63 archivos, ~1 470 líneas de producción). No se parte. |
| 2026-11-17 | Columna «Tarifa» del resumen del PDF | Se quita. El resumen queda Concepto · Cantidad · Importe. La nota al pie no cita una tarifa única. |
| 2026-11-17 | Estado en la tarjeta del PDF | «Emitida», igual que las pantallas de SLT-119 (R2), no «Cerrada» como la plantilla. |
| 2026-11-17 | Primera cuota en el PDF | Va sumada en la fila «Cuota del plan», sin fila aparte. |
| 2026-11-17 | ¿Se avisa una factura de ₡0? | Sí: toda factura cerrada avisa (campanita, push y correo), aunque su total sea ₡0. |
| 2026-11-17 | Push | El aviso de factura cerrada es elegible para push, además de campanita y correo. |
| 2026-11-17 | Guardia de SLT-91 R10 (`/mi-plan` solo en el menú) | Se enmienda de forma explícita para admitir el atajo de la campanita y el enlace del correo, que este alcance pide. |
| heredado de SLT-119 | Montos | Los de la base, sin recalcular ni redondear al pintarlos (R5 de SLT-119). |
| heredado de SLT-118 | Naturaleza de la factura | Estado de cuenta interno, sin impuestos ni Hacienda. Número correlativo por empresa, asignado al cerrar. |
| heredado (exportes e informes existentes) | Cómo se arman los archivos | PDF con jsPDF y Excel con exceljs, en el navegador, como los informes de tránsito (fuente embebida que trae el `₡`) y `lib/utils/xlsx-template.ts`. Sin dependencias nuevas: las dos ya están aprobadas en `docs/dependencias.md`. |
| heredado de SLT-128 | Envío del correo | Un correo por maestro activo, con la plantilla de marca, por job como `plan_aviso_correo`. |
