# SLT-80 «Guía de integración por API en la ayuda»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-80 | guia-api-en-ayuda | fullstack | medium | feature/SLT-80-guia-api-en-ayuda | sin asignar | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
- **Fase:** F1.2. Spec escrito por la ruta ligera en `specs/SLT-80-guia-api-en-ayuda/requirements.md`
  (R1300–R1317).
- **Bloquea:**
  - la aprobación del spec;
  - las preguntas P1–P4;
  - que SLT-201 «Manual de la API al día: Swagger/Postman con la carga completa y guía PDF
    actualizada» esté mergeada en `dev` (T0).

## Evaluación
- **Ruta:** ligera, por indicación del leader.
  - Sin migración, sin esquema y sin dependencia nueva (`jspdf` aprobada).
  - No cambia permisos. Las descargas aplican el predicado de lectura que ya existe
    (`puedeLeerDocumento`) y `middleware.ts` no se toca.
  - Si Carlos quiere pública la colección de Postman (P3), sube a la ruta completa.
- **Tamaño:**
  - 29 de 40 archivos.
  - ~2.600 líneas de producción: ~1.760 son la conversión mecánica HTML → `.md` y ~850 son código.
  - Pide `tamano-pr-aceptado` (P2).
- **Cruce de archivos:** SLT-201 toca `docs/api/guia-integracion/guia-integracion.html` y el
  README. Va antes, en orden.

## Decisiones
- (Carlos, 2026-11-18, «aprobado») Spec aprobado con D1–D7 y las propuestas del leader:
  - P1: el asistente lee la guía entera (sí).
  - P2: tamaño del PR aceptado (conversión mecánica de la guía + ~850 líneas de código).
  - P3: la colección de Postman se descarga con sesión de maestro/admin (no pública).
  - P4: la API v2 de SLT-45 se documenta cuando SLT-45 entre en dev (requisito condicional R1316).
- (Carlos, 2026-11-18) Enlaces desde Integraciones y `/configuracion/api` a la guía y a la descarga; PDF con
  la marca Servi Logistic.
- La implementación arranca cuando SLT-201 (PR #228) esté en dev.
- (implementer, 2026-11-18) Los 5 rojos de la tanda 1:
  1. R1305: un código no-2xx cuenta como nombrado si está en la sección de la operación o en §8.1
     «Por código»; la guardia exige que §8.1 exista y nombre los códigos comunes a todas las
     operaciones (401/403/422/500). Al aplicarlo, backend_dev limitó la cobertura de §8.1 a esos
     códigos comunes: si cubriera todos, la tabla general taparía el `404` que le faltaba a §5.5.
  2. Huecos de R1305: `404` en §5.5 (texto de `NotFound` en openApiSpec) y un ejemplo curl + respuesta
     en §5.6 (el `cargaId` de §5.1 y el `PdfGenerateResponse` de §5.5).
  3. D7: `lib/ayuda/guia-api.ts` (slug y las tres URLs de R1315, parte de T6); la exención de
     `ayuda-pantalla-ruta-existe` se deriva de ese slug.
  4. «contra el contrato actualizado: …» → «… actualizado (…)» (sin `actualizado:` en la prosa).
  5. «RUPTURA A./B.» y «YA VIGENTE C.» → «Bloque A:/B:/C:»; «Asignada en el acto» → «Se asigna en el
     acto»; `novedad_interna` → «terminó el día con el paquete aún pendiente».

<!-- tamano-pr-aceptado: 2026-11-18 · ~1.760 líneas de conversión mecánica de la guía a Ayuda + ~850 de código; P2 del spec · Carlos: «aprobado» -->

## Preguntas abiertas
(cerradas el 2026-11-18; ver Decisiones)

## Tandas
- **Tanda 1** (2026-11-18, backend_dev; T1, T2, T9, T10): `.md` creado (cuerpo 74.275 bytes /
  73.012 caracteres / 925 líneas), HTML y `generar-pdf.py` borrados, README reescrito, recuentos
  37→38 y guardia `guia-api-fuente-unica` con sus dos mutaciones en rojo. T2 y T9 [x].
  T1 y T10 sin cerrar: 5 rojos piden decisión (R1305 contra la guía, `pantalla` de D7, `actualizado:`
  en la prosa, `B.`/`sin gestionar`/`Asignada` en `nombres-estado-retirados`). Detalle en
  `progress/impl_SLT-80.md > Bloqueos`.
- **Tanda 1b** (2026-11-18, backend_dev): los 5 rojos resueltos con las decisiones del implementer
  (arriba). 11 tests de la tanda 165/165 en verde; mutación nueva de §8.1 en rojo. T1 y T10 [x];
  `lib/ayuda/guia-api.ts` adelantado de T6.

## Modelos (overrides)

## Cierre
