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

- **Logo de Singularis.** El repo solo tiene logos de Servi Logistic (`public/brand/`). El archivo del
  logo de Singularis (SVG o PNG) lo entrega el humano en `docs/referencias/` (carpeta local, ignorada
  en git; el implementer lo copia a `public/brand/`). Bloquea solo la tarea de la cabecera del PDF, no
  el resto.
- La plantilla de referencia (`docs/referencias/Factura-1-Ordenex.pdf`) vive solo en el checkout
  principal del humano, fuera de git. Ruta absoluta:
  `C:\Users\Cristian\Documents\trabajo\arc\servi_logistic\docs\referencias\Factura-1-Ordenex.pdf`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-17 | ¿Quién descarga la factura? | El maestro, las de su empresa, en «Mi plan»; y el superadmin, las de cualquier empresa, en Plataforma > Empresas > pestaña Facturación. El admin de la empresa no ve ni descarga: se mantiene `ROLES_MI_PLAN = ["maestro"]` (SLT-91). |
| 2026-11-17 | ¿Qué facturas se descargan? | Solo las cerradas, con número. La factura en curso no se descarga. |
| 2026-11-17 | Contenido del PDF | Igual a la plantilla de referencia: cabecera con marca, «Factura de plataforma», número y cliente; tarjetas de cliente, estado, período facturado, fecha de emisión (cierre), periodicidad y plan; tabla «Resumen» (cargos por orden, reversos de cargos, total órdenes, cuota del plan) con cantidad, tarifa e importe; franja «Total a pagar»; nota con el total de movimientos; «Desglose por día» con cargos, reversos, órdenes netas e importe neto, más su fila de total. Pie con el texto de marca, el número de factura, el cliente y «Página n de m». |
| 2026-11-17 | Contenido del Excel | Detallado: una fila por movimiento con fecha, número de guía, número de remisión de la orden, tipo (cobrado o reverso) y valor. |
| 2026-11-17 | Marca del PDF | Singularis y Servi Logistic, como en la referencia («Singularis · Plataforma Servi Logistic»). El logo de la cabecera es configurable en código: un archivo en `public/brand/` con su ruta en `lib/config/marca.ts`; cambiarlo es reemplazar el archivo y desplegar. El logo en el pie no es obligatorio. |
| 2026-11-17 | Aviso al cerrar una factura | Aviso en la campanita y correo a cada maestro activo de la empresa. El superadmin no recibe nada. Enmienda R25 de SLT-118 («Aviso al cerrar: No por ahora»). |
| 2026-11-17 | Contenido del correo | Resumen del cobro (período, cuota, cargos, reversos y total a pagar) y un enlace «Ver factura» que abre «Mi plan». Sin PDF adjunto. |
| 2026-11-17 | E2E | No es flujo crítico de `docs/checkpoints-proyecto.md`. Se extiende `e2e/facturas-plataforma.spec.ts` con la descarga. |
| heredado de SLT-119 | Montos | Los de la base, sin recalcular ni redondear al pintarlos (R5 de SLT-119). |
| heredado de SLT-118 | Naturaleza de la factura | Estado de cuenta interno, sin impuestos ni Hacienda. Número correlativo por empresa, asignado al cerrar. |
| heredado (exportes e informes existentes) | Cómo se arman los archivos | PDF con jsPDF y Excel con exceljs, en el navegador, como los informes de tránsito (fuente embebida que trae el `₡`) y `lib/utils/xlsx-template.ts`. Sin dependencias nuevas: las dos ya están aprobadas en `docs/dependencias.md`. |
| heredado de SLT-128 | Envío del correo | Un correo por maestro activo, con la plantilla de marca, por job como `plan_aviso_correo`. |
