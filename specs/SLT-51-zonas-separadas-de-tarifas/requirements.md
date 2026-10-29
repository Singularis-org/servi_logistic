# SLT-51 — zonas-separadas-de-tarifas · requirements.md

> Zona: fullstack · Complejidad: medium · depends_on: — · Rama: feature/SLT-51-zonas-separadas-de-tarifas
> Épica: EP-8 Tarifas flexibles
>
> **Alcance.** Zonas pasa a ser un módulo propio (`/configuracion/zonas`) que solo crea, edita y
> lista zonas: nombre, distritos, «zona de bodega principal» (antes central/GAM) y SINPE. El
> formulario de zona deja de pedir y guardar costos: pago al mensajero (incl. por vehículo),
> tarifa de cobro de la zona y distritos especiales. El botón «Cobertura» se muda a Zonas.
>
> **Lo que NO entra.** Editar costos en otra pantalla, ni siquiera de forma provisional → SLT-54
> (la épica sale completa a producción). Modelo nuevo de tarifas y fin de la variante GAM en el
> cálculo → SLT-52. Cambios en las tarifas por tienda (`TiendasModule`), que siguen como están.
>
> Sembrado por `/afinar-feature` el 2026-10-29. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-28 | ¿Zonas y tarifas juntas? | Separadas: primero se crean zonas, luego se configuran tarifas en su módulo (épica EP-8). |
| 2026-10-28 | ¿Nombre de la zona central/GAM? | «Zona de bodega principal». La marca sigue (decide a qué bodega va el cierre); la variante de flete GAM la retira SLT-52. |
| 2026-10-29 | ¿Editor provisional de costos hasta SLT-54? | No. La épica sale completa a producción; entre fichas, `dev` puede quedar sin editor de costos de zona. |
| 2026-10-29 | ¿Dónde va «Cobertura»? | En Zonas. |
| 2026-10-29 | ¿E2E? | Sí, uno corto: el maestro crea una zona sin costos y la ve en el listado. |
| heredado | ¿Quién escribe zonas? | Solo `maestro` (spec 24, `ZonaService`). |
| heredado | Geografía | Catálogo global del país, gestionado por el superadmin (SL-20). |
| heredado | Zona sin tarifa | El cierre registra 0 sin bloquear y la API por key responde 409 (274 R39). |
| heredado | Zona especial | Es de cada empresa y se configura desde Tarifas (SL-38), no desde Zonas. |
