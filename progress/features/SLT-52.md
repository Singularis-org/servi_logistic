# SLT-52 «Tarifas flexibles: modelo y cálculo»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-52 | tarifas-flexibles-modelo | backend | high | feature/SLT-52-tarifas-flexibles-modelo | Carlos Restrepo | done |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.1 (2026-11-03): T0-T6 hechas. Siguiente: T7 → reviewer. Detalle en `progress/impl_SLT-52.md`.
Ojo: `prisma generate` ya conoce las tablas de T1; una base sin sus migraciones falla en `cierreDetail.create`.

## Evaluación
backend / high: modelo nuevo + resolver único que reemplaza cuatro cálculos de dinero, con
snapshot ampliado en `cierre_detail` y `gestion_orden`. Plan de la épica:
`C:\Users\ArqDev\.claude\plans\rippling-launching-graham.md`.

## Decisiones
- 2026-11-02 · Alcance y decisiones cerradas → `specs/SLT-52-tarifas-flexibles-modelo/requirements.md`.
  Board actualizado: descripciones de SLT-52, SLT-54 y SLT-55; creadas SLT-77 (tope de intentos)
  y SLT-78 (incentivo a la satélite). P1 y P2 cerradas el mismo día.
- 2026-11-02 · Spec aprobado por Carlos («si dale») → in_progress. P1-P4 del spec cerradas (pagos sin IVA).
- 2026-11-02 · Choque aceptado con SLT-43, SLT-44 y SLT-65 (Camilo, geografía jerárquica) en
  `db/schema.prisma`, `lib/types/historial-accion.ts`, `lib/db/modelos-de-negocio.ts`,
  `OrdenRepository.ts`, `CierreDiaRepository.ts`, `docs/architecture.md`. Carlos: «Aceptar;
  resuelve quien mergee segundo». SLT-52 arranca sobre el distrito actual; quien mergee segundo
  integra dev y adapta los grupos.
- 2026-11-02 · Mismo dueño, SLT-64 (AVISO, no choca): comparte CierreDiaRepository/Service.
  Orden: SLT-52 primero; SLT-64 integra dev al retomarse.

- 2026-11-02 21:00 (Carlos), tras T4: (1) el fulfillment del modelo nuevo LLEVA IVA, como todo cobro a la tienda;
  (2) SÍ guardar qué tarifa_valor se usó en el cobro por rechazo (columna + migración de esquema; hoy
  tarifaId queda null); (3) confirmado: «sin tarifa» = sin flete por entregado, aunque haya comisión o
  fulfillment. (1) y (2) cambian el design: pasarlos por spec (R nuevos) antes de T5.
- 2026-11-03 · Spec enmendado (R46-R51, T4.5-T4.8, 3d0f7d6b). Carlos: «te apruebo la spec»; P5 = (a),
  campo `ivaFulfillment` en la API.
- 2026-11-03 · Base del % del pago por gestión (Carlos): «siempre lo que se le cobra a la tienda por esa gestión». 477 sigue con valores vivos; 398 debe usar el congelado del cierre → T5.5 (R nuevo, lo añade el leader).

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-02 · T0 (literales del modelo viejo, 49 casos) · 45e1ee02 · —
- 2026-11-02 · T1 (esquema: 4 migraciones, 5 tablas, RLS) · 2025516d + 67ca1858 (censos) · gate ROJO
  (2 censos) → arreglado → gate VERDE. Task nueva T6.5: `ZonaRepository.update` no debe vaciar grupos.
- 2026-11-02 · T2 (núcleo puro: catálogo, precedencia, cálculo, esquemas; 179 tests) · 70ac57dd · gate
  con 2 rojos por timeout de 20 s en guardias que barren el árbol (`tarifa-status-retirado`,
  `catalogo-postgres-acota-esquema`); solas pasan 15/15 en 2 s → verde. Siguiente: T3.
- 2026-11-02 · T3 (resolver único + convivencia con el modelo viejo) · cca3b0fb · gate VERDE. Mutación sin efecto: quitar solo zonaId del WHERE de grupos (equivalente: distrito en una zona por empresa). Pendiente T4/T5: listado OrdenRepository:2111 y 6 llamadores de soloModeloViejo. Riesgo: tests que hagan commit en tarifa_valor contaminan empresas de prueba → sembrar con rollback (T5.4/T6.4).
- 2026-11-02 · T4 (funciones públicas y superficies: listado, API, cotización, rechazo) · b7e22911 · gate ROJO
  por feature_list local (SLT-62 seguía in_progress) → corregido → VERDE. Queda soloModeloViejo solo en
  CierreDiaRepository:1352 (T5.2). Firmas dobles a estrechar en T5.
- 2026-11-03 · T4.5-T4.8 (IVA del fulfillment, `rechazo_tienda_cobro.tarifa_valor_id` + 2 migraciones, R51, `ivaFulfillment` en la API) · f6efb67e · gate VERDE. 5 mutaciones en rojo. `costoReal.ivaFulfillment` = "0.00" hasta T5.3.
- 2026-11-03 · T5.1-T5.5 (cierre: pago por gestión, congelado, base del % desde el cobro congelado R52-R55) · ceb2455a, 02899491, 561a2059 · gate VERDE sin .env (no corría integración). Con .env salió la 450 (recuento por subcadena con `cierre_detail_concepto`) → fbc659d9. Rojos que quedan: 4 del estado de la base local (también en dev) + `carga-division`, inestable en paralelo.
- 2026-11-03 · T6 (escritura de tarifa_valor y grupos, fábrica, ZonaRepository.update por diferencia) · 63d627cb, 5fd6ec27 · gate con .env: solo los 4 rojos de la base local (también en dev) + `slt73-marcar-asienta`, inestable en paralelo (solo pasa 11/11). 18 mutaciones en rojo.
- 2026-11-03 · T5 (pago por gestión con el resolver, congelado en crearCierre, lectura congelada, ivaFulfillment del snapshot; integración 6/6) · ceb2455a + este commit · gate VERDE. 11 mutaciones en rojo.

## Modelos (overrides)

## Cierre
PR #74 mergeado a `dev` por Carlos (42328714): modelo de tarifas flexibles y resolver único.
YA ESTÁ EN PRODUCCIÓN: salió con el PR #73 (`dev` -> `prod`, 2026-11-04). Allí el modelo se activa con que exista una fila en `tarifa_valor`, sin interruptor (`usaModeloNuevo`); en `origin/prod` nada fuera de tests llama a `serviciosDeTarifas`, así que ninguna pantalla escribe esa tabla; producción medida el 2026-11-05: 0 filas. SLT-54, que trae el interruptor, aún no está en `prod`.
Deudas: ninguna propia.
