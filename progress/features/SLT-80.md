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

<!-- tamano-pr-aceptado: 2026-11-18 · ~1.760 líneas de conversión mecánica de la guía a Ayuda + ~850 de código; P2 del spec · Carlos: «aprobado» -->

## Preguntas abiertas
(cerradas el 2026-11-18; ver Decisiones)

## Tandas

## Modelos (overrides)

## Cierre
