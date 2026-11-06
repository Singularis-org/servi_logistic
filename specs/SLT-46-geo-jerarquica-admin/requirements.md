# SLT-46 — geo-jerarquica-admin · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: SLT-44, SLT-65, SLT-71 · Rama: feature/SLT-46-geo-jerarquica-admin (sobre SLT-45)
>
> **Alcance.** La geografía del superadmin pasa a N niveles y escribe en `nodo_geografico`:
> árbol con crear, renombrar, retirar y reactivar nodos de cualquier profundidad; alta de país
> con su catálogo de tipos; edición del nombre singular y plural de cada tipo, con historial y copia a
> `pais.nivel_N_*` (niveles 1–3) mientras existan; CSV de carga con una columna por tipo y
> profundidad (el CSV de CR de SL-20 se acepta igual); CSV de división leído del nodo
> (`leerDivisionDePais`, heredado de SLT-45). Los triggers de sincronía se invierten: el nodo
> copia a `provincia/canton/distrito` los nodos de profundidad 1–3.
>
> **Lo que NO entra.**
> - Zonas de la empresa (asignar cualquier nodo a zona y zona especial, `GeografiaSelector`,
>   herencia con aviso de impacto, grupos de distritos de tarifas, trigger de `orden` a
>   cualquier nodo) → SLT-89, bloqueada por SLT-46.
> - Mover nodos → SLT-48 (sin FK viejas, mover corrige solas las órdenes viejas).
> - Filtros, exportes y presentación → SLT-47.
>
> Sembrado por `/afinar-feature` el 2026-11-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)
_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas
Ninguna.

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-06 | ¿Una tarjeta o dos? | Dos: SLT-46 = geografía del superadmin; zonas de la empresa a SLT-89. |
| 2026-11-06 | ¿Mover nodos? | No en SLT-46. Va en SLT-48, que corrige también las órdenes viejas sin reescribirlas (el humano quiere que las viejas se corrijan). |
| 2026-11-06 | ¿El nombre de tipo corregido se copia a `pais.nivel_N_*`? | Sí, niveles 1–3, mientras existan las columnas. |
| 2026-11-06 | ¿País disponible sin 3 niveles antes de SLT-48? | Sí, cualquiera. Sus órdenes dan «país aún no habilitado» hasta SLT-48 (regla de SLT-45). Reemplaza la mitigación vieja «ningún país con más de 3 niveles se marca disponible hasta SLT-48» (SLT-43 design:311-313). |
| heredada SL-20 | Retirar nodo | Baja lógica (`activo`), nunca borrado físico. |
| heredada SL-20 | E2E | Sin E2E nuevo; el rol se prueba en el service. |
| heredada SL-20 | Historial | Toda acción sobre nodos y tipos va a `historial_plataforma`. |
| heredada SLT-43 | Migraciones | Solo aditivas hasta SLT-48, cada una con `down.sql`. |
