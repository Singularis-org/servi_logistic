# SL-9 — marca-pwa-capturas-iconos · requirements.md

> **Zona** frontend · **Complejidad** low · **depends_on** SL-8 · **Rama** `feature/SL-9-marca-pwa-capturas-iconos`
>
> **Alcance.** Rehacer las tres capturas de `public/screenshots/` (inicio y login en móvil, inicio en
> escritorio) con la marca nueva, generadas por un script repetible con Playwright a los tamaños que
> declara `public/manifest.json`. Sustituir los cuatro `public/icons/icono_*.png` de los indicadores
> del mensajero (`KpisMensajero`) por iconos de línea de `lucide-react` con la paleta, y borrar esos
> PNG. Quitar el degradado morado al pasar el cursor por esas tarjetas.
>
> **Lo que NO entra.**
> - Los iconos de la app (`icon-*.png`, `badge-72.png`, `public/icons/fuente/`): ya llevan la marca nueva.
> - Pantallas con sesión en las capturas.
> - Otros restos de color de Ordenex fuera de `KpisMensajero` → SL-33.
>
> Sembrado por `/afinar-feature` el 2026-10-28. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-28 | ¿Qué pantallas muestran las capturas? | Las mismas 3, rehechas: inicio móvil, login móvil, inicio escritorio. Mismos nombres y tamaños que declara el manifiesto. |
| 2026-10-28 | ¿Qué sustituye a los `icono_*.png`? | Iconos de línea de `lucide-react` (ya aprobada en `docs/dependencias.md`) con la paleta. Los 4 PNG se borran. |
| 2026-10-28 | ¿El degradado morado al pasar el cursor por `KpisMensajero` entra aquí? | Sí: se cambia por un tono de la paleta nueva. |
| 2026-10-28 | ¿Cómo se generan las capturas? | Con un script repetible con Playwright (ya en el proyecto). |
| 2026-10-28 | Fuente de la marca | `docs/marca.md` y `public/brand/`; nunca recursos de Ordenex (heredada de SL-8, D6). |
| 2026-10-28 | «Ordenex» en lo que se toca | Desaparece del todo (heredada de SL-8, D16). |
