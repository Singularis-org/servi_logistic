# SLT-257 — banner-ambiente-pruebas · requirements.md

> **Zona:** frontend · **Complejidad:** low · **depends_on:** — · **Rama:** feature/SLT-257-banner-ambiente-pruebas
>
> **Alcance.** Una franja fija arriba de todas las pantallas (layout raíz `app/layout.tsx`) con el
> texto «Sandbox», visible solo en el proyecto de Vercel del sandbox. Se enciende con la variable de
> servidor `AMBIENTE_PRUEBAS=true`; sin ella, o con otro valor, no se pinta nada.
>
> **Lo que NO entra.** Crons con horarios propios del sandbox (decisión 2026-11-23: no por ahora).
> Cambios a la guía de integración. Configuración de Vercel y Supabase del sandbox (manual, fuera
> del código). Limpieza de la base del sandbox (no urgente, sin ficha).
>
> Sembrado por `/afinar-feature` el 2026-11-23. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-23 | ¿Cómo se detecta el sandbox? | Variable `AMBIENTE_PRUEBAS`, solo con el valor exacto `true`. No `VERCEL_ENV`: el sandbox es un proyecto Vercel aparte con `prod` como rama de producción y ahí `VERCEL_ENV=production`. |
| 2026-11-23 | ¿Dónde va? | Layout raíz `app/layout.tsx`: todas las pantallas, con y sin sesión, incluidas las públicas. |
| 2026-11-23 | ¿Se puede cerrar? | No. Franja fija arriba, siempre visible, también en el celular y en la PWA. |
| 2026-11-23 | ¿Qué texto lleva? | «Sandbox», solo eso. |
| 2026-11-23 | ¿Cambia la guía de integración? | No: ya contempla otro ambiente (`docs/ayuda/oficina/guia-integracion-api.md:270`). |
| 2026-11-23 | ¿Crons más espaciados en el sandbox? | No por ahora. Se revisa el costo en Usage de Vercel tras una semana. |
| 2026-11-23 | ¿E2E? | No: no es un flujo crítico. Test del componente: con `true` se pinta; sin la variable o con otro valor, no. |
| 2026-11-23 | ¿Ruta? | Ligera: un solo `requirements.md` con EARS, tasks y archivos esperados. |
