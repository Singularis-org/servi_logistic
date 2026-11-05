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
- D (pantalla): 859ce94d; medida contra la maqueta en claro, oscuro y móvil; 42/42 mutaciones. A vigilar: en `next dev`, abrir la URL tras el login dio 500 de `useToast` en 6 de 7 intentos (se recupera en cliente); en `next start`, 3 de 3 en 200. Sin causa raíz.
- E (huecos de pantalla): 9667bb15; 37/37 mutaciones. `useToast` no reproducido (0 de 20 en `next dev`). Gate sobre `servi_gate_slt54`: INIT_EXIT=0, 19.080 tests, 4.601 guardias. Abiertos: encabezado de la descarga y `PAGO_TIENDA_NOTA`; «1 grupo» difiere de la maqueta por R44. Incidente: un `-t` sin comillas lanzó parte de la suite con la RLS de `grupo_distritos` apagada ~150 s (restaurada, `rls=true` comprobado) y dejó filas de prueba en la base LOCAL (`organizacion` +3: `demo-qa-a`, `demo-qa-b`, `e2e-sl43-real-…`, en 20 tablas). No se borraron: no se pueden atribuir con certeza. Decide Carlos.
- F (E2E y cierre): bcab441d. `dinero` 43/0/0, `reparto` 16/0/0, `aislamiento` 86/0/0 (1.ª corrida 85/1/0 por regresión en `zonas-crear-sin-costos`, arreglada). `e2e-sin-saltos` con `EXCEPCIONES` vacía. Destapó un defecto en R38 (lo digitado mientras guarda se perdía), arreglado con test. Abierto: rótulo «Ingreso de bodega por devoluciones a origen» con el modelo nuevo (el total incluye 120 de una entrega).

- G (arreglos de revisión, vuelta 1): 6ca1fab5. H1: 445b1d52 (`incluyeModeloNuevo` en cierres, consolidación y wallet). H2: 7f8a77cb. I1: 3ae73178 (`FilaEstadoCuentaDTO`). I2: ecacd68b. Revisión en tres vueltas: M1, M2, M3 y D38 cerrados; vuelta 3 OK con 6 menores (0e43d804). Quedan D39, D40 y D42 en `progress/deudas.md`, antes de cerrar EP-8.
- Decisión del leader, a validar por Carlos en el PR: rótulo «Ingreso de bodega» en el modelo nuevo; R71 y R72 añadidos en revisión.

## Medición T6.3 (R11)
- Producción, 2026-11-04 (lectura ejecutada por Carlos con `!`): una empresa, `tarifa_valor`=0, `grupo_distritos`=0. Sin repetir: se re-mide antes del merge.
- Base local, 2026-11-05: 11 empresas, 0 con `tarifa_valor`, 0 grupos, 0 activadas.

## Modelos (overrides)
Subagentes en Opus.

## Cierre
