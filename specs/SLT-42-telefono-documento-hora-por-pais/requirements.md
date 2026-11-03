# SLT-42 — Teléfono, documento y hora por país

> **Zona** backend · **Complejidad** high · **depends_on** SL-20 · **Rama** feature/SLT-42-telefono-documento-hora-por-pais
>
> **Alcance.** El país de la empresa trae su prefijo telefónico, su zona horaria y sus tipos de
> documento, como catálogo de plataforma. Solo se carga Costa Rica; un país nuevo es cargar filas.
> El servidor valida teléfono (con libphonenumber) y documento con las reglas del país, y todo
> cálculo de «hoy», cortes, jobs y agrupación por día usa la zona horaria del país de la empresa.
>
> **Lo que NO entra.** La pantalla del superadmin para editar estos datos y adaptar los
> formularios existentes (+506 fijo, selector de documento) → SLT-81 «Datos del país: pantalla del
> superadmin y formularios» (bloqueada por SLT-42 y SLT-46). Moneda e impuestos → SL-21. Métodos de
> pago y SINPE → SL-22.
>
> Sembrado por `/afinar-feature` el 2026-11-03. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- Teléfonos ya guardados: ¿se normalizan en la migración o solo se valida lo nuevo? spec_author lo
  propone; lo cierra el humano en F1.4. Tener en cuenta la regla de la épica GEO (SLT-43…SLT-47:
  migraciones solo aditivas, sin `UPDATE` de columnas existentes, «no quiero correr riesgos de dañar
  o borrar datos de prod», 2026-10-28): aplica también al remapeo de `usuario.tipo_identificacion_id`
  de «cedula»/«ruc» a los tipos nuevos.
- Jobs diarios (liberar reprogramadas, rollup de analítica, snapshot de ranking): con varios
  países, ¿una corrida por zona horaria o una sola? Con solo CR no cambia el resultado. Se resuelve
  en `design.md`.
- Largos de documento de la tabla de decisiones (9, 10, 11-12, 10): se dieron de memoria.
  spec_author los cruza con el código actual (`lib/types/auth.ts` y validadores de cédula); si
  difieren, sale como pregunta en F1.4.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-03 | ¿Qué países funcionan? | Solo Costa Rica. Prefijo, zona horaria y tipos de documento son catálogo por país: un país nuevo = filas nuevas. Hereda SL-20. |
| 2026-10-26 | ¿De quién es la zona horaria? | Del país, no de la empresa (en /afinar-feature SL-20). |
| 2026-11-03 | ¿Unicidad del documento? | Por empresa y tipo. Mantiene SL-18 (la misma persona puede estar en dos empresas); corrige el «único por país» de la descripción original. |
| 2026-11-03 | ¿Tipos de documento de CR? | Los 5 oficiales: cédula física (9 dígitos), cédula jurídica (10), DIMEX (11-12), NITE (10), pasaporte (sin formato fijo). Los usuarios con «cedula» pasan a cédula física; «ruc» a cédula jurídica. |
| 2026-11-03 | ¿Librería para el teléfono? | libphonenumber entra en esta ficha (cuatro checks de salud + fila en `docs/dependencias.md`; se aprueba con el spec en F1.4). |
| 2026-11-03 | ¿Quién mantiene los datos del país? | El superadmin, por pantalla, en SLT-81. Esta ficha siembra CR por migración. |
| 2026-11-03 | ¿Se parte la ficha? | Sí: backend aquí; pantalla del superadmin y formularios existentes en SLT-81, que espera a SLT-42 y SLT-46 (misma pantalla de países). |
| 2026-10-26 | ¿Quién ve y edita el catálogo? | Plataforma: solo el superadmin escribe; la empresa solo lee. Hereda SL-17/SL-20. |
| 2026-10-26 | ¿E2E? | No: unit + integración con dos empresas en dos países de prueba. Hereda SL-20. |
