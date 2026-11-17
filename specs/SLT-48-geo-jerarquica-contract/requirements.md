# SLT-48 — geo-jerarquica-contract · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** SLT-45, SLT-46, SLT-47, SLT-65, SLT-71, SLT-89, SLT-125 · **Rama** `feature/SLT-48-geo-jerarquica-contract` (apilada sobre `feature/SLT-125-geo-jerarquica-exportes`)
>
> **Alcance.** Es el primer deploy del retiro del modelo viejo.
> - `provincia`, `canton` y `distrito` pasan a ser vistas de solo lectura sobre `nodo_geografico`. Para eso se quitan o rehacen las FK, los NOT NULL y los triggers que lo impiden, y también los triggers de sincronía.
> - La orden guarda solo su nodo, y todo lector (lugar, filtros, tránsito, cierres, tarifas, corrección de ubicación) lee del árbol.
> - Se habilitan los países de más de 3 niveles.
> - El superadmin puede mover un nodo a otro padre de la misma profundidad.
> - Las pantallas que quedaron con 3 niveles fijos (SLT-125 P6) pasan a N niveles.
>
> **Lo que NO entra.**
> - Borrar columnas, vistas, `pais.nivel_N_*`, `digitos_codigo_nivel_N` y el código muerto (`NivelGeografico`, `PROFUNDIDAD_DEL_NIVEL`, las listas planas del catálogo de filtros, `_shared/zona-colapso.ts`). Tampoco entran el NOT NULL de `orden.nodo_geografico_id` ni los renombres `zona_nodo`/`nodo_zona_especial`. Todo eso va a **SLT-196 «Geografía jerárquica: borrar el modelo viejo»**, que empieza después de observar este deploy en producción.
> - Dar grupo de tarifas a la orden sin distrito: no se hace (ver Decisiones cerradas).
> - `cierre_detail` conserva sus 3 columnas de nombre: son historia congelada.
>
> Sembrado por `/afinar-feature` el 2026-11-17. El humano fijó el bloque de Alcance y la tabla de «Decisiones cerradas» ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- **Mover un nodo y las órdenes ya creadas.** Cuando un nodo cambia de padre, sus órdenes leen el padre nuevo. Falta decidir si también cambian la zona que las cubre y su precio, o solo el nombre del lugar que se muestra. Los cierres y los cobros ya hechos no se tocan. Le toca al humano en F1.2.
- **Duración del periodo de observación en producción** antes de SLT-196. No bloquea este spec: lo decide el humano antes de tomar SLT-196.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-17 | ¿Una ficha o varias? | Dos. El deploy 2 (borrado irreversible) va a SLT-196. El deploy 1 queda entero en SLT-48, en un solo PR y con su tamaño aceptado (~35-50 archivos de producción y 60-90 de tests). |
| 2026-11-17 | ¿A qué nodo apunta una orden? | A la hoja de su rama, en todos los países: el último nodo de su rama. En Costa Rica deja de entrar una orden con solo cantón si ese cantón tiene distritos. Las órdenes viejas no cambian. Reemplaza la regla de SLT-45 «solo profundidad 2 o 3» y termina «país aún no habilitado» (SLT-46 R29). |
| 2026-11-17 | Tarifas | El precio pasa a leer el nodo, pero el resultado no cambia. Con distrito, la orden usa el grupo del distrito. Sin distrito, sigue sin grupo y usa la tarifa base (SLT-89 R20). Ningún cobro cambia. |
| 2026-11-17 | Pantallas con 3 niveles fijos (SLT-125 P6) | Entran en SLT-48 y pasan a N niveles, con maqueta antes: el aviso y el modal de corregir ubicación, las etiquetas del historial, las pantallas de tarifas y de zonas, y la plantilla de carga masiva. |
| 2026-11-17 | ¿Hay consumidores externos que leen la base (BI, reportes)? | No hay ninguno. |
| heredada SLT-43 | Migraciones | Cada migración lleva su `down.sql` y no edita migraciones aplicadas. El `down.sql` de este deploy restaura las tablas desde los nodos. Los DROP de FK, NOT NULL y triggers de este deploy van con la excepción declarada en la guardia de migraciones aditivas. |
| heredada SLT-43 | Tope del trigger de `orden` | ≤ 1 ms por fila en una carga masiva de prueba. Los triggers llevan tests de integración contra Postgres real. |
| heredada SLT-43 / SLT-125 | Snapshot del cierre | `cierre_detail.ubicacion_snapshot` saca los ids del nodo, porque las FK de la orden quedan en NULL. |
| heredada SLT-44 / SLT-65 / SLT-71 | Equivalencia | La equivalencia y los tiempos se miden sobre la copia de producción. Los corre una persona antes del merge; ningún agente toca producción ni su copia. El resultado va al PR. |
| heredada SLT-46 | Mover nodos | Va en SLT-48. Corrige las órdenes viejas sin reescribirlas: leen el padre del árbol. |
| heredada SLT-46 P2 | Niveles | Países de 2 a 10 niveles. |
| heredada SLT-46 P9 / SLT-89 P2 / SLT-47 | Pantallas | Toda pantalla espera una maqueta aprobada por el humano. El backend avanza antes. |
| heredada SLT-46 / SLT-89 | Escrituras | Toda escritura pasa por el modal antes → después, con validación previa y control de cambio concurrente. Esto aplica a mover nodos y a corregir ubicación. |
| heredada SLT-65 | Rendimiento | Si el listado empeora, la primera mitigación es llevar los nombres al catálogo, antes que crear un índice. |
| heredada SL-20 / SLT-125 | Nombres internos | `provincia/canton/distrito` se quedan en la base, el código y la API v1. Cada superficie conserva su separador y su orden. |
| heredada SLT-125 P1 | Nivel 4 de la orden | Hasta SLT-48 la cuarta columna salía vacía. Desde aquí se llena, y la expectativa de `e2e/geo-presentacion-4-niveles.spec.ts` cambia. |
| heredada épica | Producción | Hay backup verificado antes de la release y ningún agente toca la base de producción. Las migraciones las aplica el build de `prod`. |
