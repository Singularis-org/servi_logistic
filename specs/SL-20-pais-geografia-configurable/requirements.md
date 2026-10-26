# SL-20 — pais-geografia-configurable · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: SL-17 · Rama: feature/SL-20-pais-geografia-configurable
>
> **Alcance.** Tabla de países (plataforma) y país fijo por empresa; las empresas existentes y las
> fábricas de tests quedan en Costa Rica. Provincia, cantón y distrito cuelgan del país, con el nombre
> de cada nivel definido por país; la UI muestra esos nombres. Pantalla de geografía del superadmin:
> alta de país, carga de su división por CSV y edición nodo a nodo (alta, renombre, retiro,
> reactivación). Cierra D15 y la parte de geografía de D12 (`progress/deudas.md`).
>
> **Lo que NO entra.** Teléfono, documento de identidad y zona horaria por país → SLT-42 «Teléfono,
> documento y hora por país». Moneda e impuestos → SL-21. Métodos de pago → SL-22. Renombrar
> `provincia`/`canton`/`distrito` en código, DB o API. Cargar un segundo país real. Empresas, planes y
> módulos del panel de superadmin → SL-26.
>
> Sembrado por `/afinar-feature` el 2026-10-26. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- Formato exacto del CSV de carga (columnas, codificación, qué pasa con filas repetidas o con nodos
  ya existentes). Lo propone `spec_author` en `design.md` y lo aprueba el humano en F1.4.
- D15 tenía como dueño a Carlos Restrepo («quien tome SL-26»). La decisión la tomó Camilo el
  2026-10-26 al traer la pantalla a SL-20; Carlos debe confirmarla en la aprobación del spec (F1.4).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-26 | ¿Qué países funcionan al cerrar? | Solo Costa Rica cargado; el modelo admite más países solo con cargar datos. |
| 2026-10-26 | ¿Empresa y país? | Un país por empresa, fijado en el alta, no cambia. Las existentes migran a Costa Rica. |
| 2026-10-26 | ¿Niveles? | Siempre tres, con nombre por país (CR: Provincia/Cantón/Distrito). El tercero sigue opcional en la orden. |
| 2026-10-26 | ¿Nombres internos? | Se mantienen `provincia`/`canton`/`distrito` en DB, código y API; solo cambian las etiquetas visibles. |
| 2026-10-26 | ¿Quién da de alta un país? | El superadmin, por pantalla: CSV de los tres niveles + edición a mano. |
| 2026-10-26 | ¿Código oficial? | Libre, opcional, único dentro del país. La regla de prefijo 1/3/5 dígitos solo vale para CR. |
| 2026-10-26 | D15: ¿dónde se registra una acción del superadmin? | Historial propio de plataforma, aparte de `historial_accion`; ninguna empresa lo ve. |
| 2026-10-26 | D15: ¿qué cuenta el retiro de un nodo para el superadmin? | Órdenes sin entregar de todas las empresas del país. |
| 2026-10-26 | ¿E2E? | No: unit + integración, con dos empresas en dos países de prueba. |
| 2026-10-26 | Precedentes | Hereda SL-17 (geografía y país = plataforma, solo lectura para la empresa), ficha 374 (retiro por `activo`, unicidad por padre) y SL-38 (zona especial por empresa). |
