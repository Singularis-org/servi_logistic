# SLT-99 — planes-vista-empresa-cambiar-plan · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **Ruta:** completa (toca el cobro) · **depends_on:** — · **Rama:** feature/SLT-99-planes-vista-empresa-cambiar-plan
>
> **Alcance.** En «Mi plan», el maestro ve su plan activo (uso de la plataforma, costo por orden,
> período y renovación, uso de usuarios y API keys, módulos) y un carrusel con los planes públicos y
> la tarjeta «Plan a la medida». Al tocar una tarjeta ve sus detalles (precio por período de cobro y
> comparación con su plan). Puede cambiar a otro plan público: el cambio queda pendiente y rige en
> el próximo corte (1 o 16 del mes); puede cancelarlo o reemplazarlo antes. El listado y los
> detalles quedan como componentes compartidos, reutilizables sin empresa.
>
> **Lo que NO entra.** La solicitud que envía «Contáctanos» al superadmin → SLT-117 (el botón se
> ve, pero su envío llega con esa ficha). La página pública de planes, su renderizado estático y la
> compra en la inscripción → SLT-116. Cambiar el tipo de cobro de la empresa (lo hace el
> superadmin, SLT-86). Topes de órdenes (no existen).
>
> Sembrado por `/afinar-feature` el 2026-11-09. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)
_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas
- Qué muestra y cómo se compara un plan sin cuota (solo costo por orden) en el selector anual.
- Cómo interactúa el corte 1/16 con una empresa cuyo tipo de cobro es mensual, bimestral o anual
  (SLT-86 usa períodos de calendario): el spec debe leer el período de calendario y proponer, sin
  inventar.

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-09 | Diseño | Aprobado: https://claude.ai/artifact/M1owRvXM3ziekGffd6ct45 (carrusel, tarjeta clickeable sin «Ver detalles», chip «Activo» junto al nombre, insignia circular de descuento solo en anual, módulos uno por uno con ícono, «Uso de la plataforma» y «Costo por orden», sin chip «Público»). |
| 2026-11-09 | ¿Quién ve y cambia? | Solo el maestro (hereda «Mi plan» de SLT-58). Autorización en el servicio. |
| 2026-11-09 | ¿Aprobación del superadmin? | No: el maestro cambia directo. |
| 2026-11-09 | ¿Desde cuándo rige? | Desde el próximo corte, el 1 o el 16 del mes, igual para todas las empresas. Sin opción «ahora» ni fecha. |
| 2026-11-09 | ¿Cobro del cambio? | Sin prorrateo: el plan actual rige hasta el corte y el nuevo desde el corte. |
| 2026-11-09 | ¿Cambio pendiente? | Se puede cancelar o reemplazar por otro plan antes del corte. |
| 2026-11-09 | ¿Bajar a un plan con menos usuarios o API keys de los que se usan? | Se rechaza, con un aviso que dice cuántos sobran. |
| 2026-11-09 | Usuarios | Un solo «Usuarios» = suma de los topes por rol, calculada en el front; si alguno es sin tope, «Sin tope». El modelo no cambia. |
| 2026-11-09 | Mensual / Anual | Selector en el carrusel; en anual, precio del año con descuento e insignia del %. |
| 2026-11-09 | «Plan a la medida» | Tarjeta con «Contáctanos», activa salvo que la empresa ya tenga un plan custom activo (entonces es su plan activo). El envío (mensaje abierto al superadmin) va a SLT-117. |
| 2026-11-09 | Reutilización | Listado y detalles en `components/shared/`, sin depender de la empresa: reciben por props los planes, el plan activo (opcional) y las acciones. Los usa SLT-116. |
| 2026-11-09 | Carrusel | El de shadcn (`components/ui/carousel.tsx`, `embla-carousel-react` ya aprobada). Sin dependencias nuevas. |
| 2026-11-09 | ¿E2E? | Sí: el maestro ve su plan, cambia a otro, ve el pendiente para el próximo corte y lo cancela. |
| 2026-11-09 | Tamaño | «Contáctanos» se separa (SLT-117) para que el PR quepa en el tope. |
