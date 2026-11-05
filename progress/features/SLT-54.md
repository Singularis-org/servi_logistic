# SLT-54 «Pantalla nueva de Tarifas»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-54 | pantalla-tarifas | fullstack | high | feature/SLT-54-pantalla-tarifas | Carlos Restrepo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.1 desde el 2026-11-04: spec y maqueta aprobados por Carlos, también el tablero `Vehiculo` («ya lo vi, está correcto»).

## Evaluación
zone fullstack (era frontend; la activación pide backend) / complexity high. Sin `tasks.md` aún: repetir `archivos-en-vuelo.mjs --candidata SLT-54` tras el spec y en F2.0.

## Decisiones
- 2026-11-04 (Carlos): alcance y decisiones en `specs/SLT-54-pantalla-tarifas/requirements.md`.
- 2026-11-04 (Carlos): spec aprobado con P1-P4 según la recomendación, y choques aceptados con SL-42, SLT-42, SLT-43, SLT-44, SLT-65 y SLT-83 (`db/schema.prisma`, `lib/db/modelos-de-negocio.ts`, historial, `OrdenRepository`, `CierreDiaRepository`). Frase: «va con tus recomendaciones», en respuesta a la pregunta que incluía los choques. Los resuelve quien mergee segundo.

## Preguntas abiertas
Ninguna.

## Tandas
- A (activación e interruptor): c3929057, `backend_dev` directo (el implementer lo corta el hook). Gate local rojo solo por estado de las bases: la local (5 archivos: job `done`, enum, datos de otra empresa) y la desechable `servi_gate_slt54` (1: exige usuario sembrado); cada archivo pasa en al menos una. Lo decide `gate-completo`.
- B (lecturas, referencia, retiro de vías viejas): f215c6aa. La pantalla vieja no lee ni guarda precios hasta T4.1 (`tarifas-retiradas.ts` provisional). Decisiones del dev por revisar: `cargarZonaTarifas` con `tiendaId?`; `cargarPantallaTarifas` con `preciosTienda`; «Toda la zona» con distritos marcados y sin marcar da «Varía».
- C (huecos de servidor): addf8afb. Mirar en `gate-completo`: `detalle-movimiento-cierre-postgres` y `detalle-en-lote-464` (WHERE del viejo, en el baseline local). Para T5.3: el recorte de zona retira `item.fulfillment`, así que la satélite no lo recibe en «recibidas». R64 añade `conceptoCongeladoPorResultado`.

## Modelos (overrides)
Subagentes en Opus.

## Cierre
