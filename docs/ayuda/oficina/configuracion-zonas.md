---
titulo: Configuración · Zonas
modulo: configuracion
pantalla: /configuracion/zonas
roles: [maestro]
actualizado: 2026-11-20
fuentes:
  - app/(app)/configuracion/zonas/page.tsx
  - app/(app)/configuracion/zonas/_components/
  - lib/actions/zonas.ts
  - lib/actions/cobertura.ts
---

# Configuración · Zonas

Acá se arman las **zonas de reparto**: qué distritos entran en cada una y cuál es la zona de
bodega principal. Solo la ve el rol **maestro**.

Esta pantalla **no define costos**. Lo que se le cobra a cada tienda, también por zona, se define
en **Configuración · Tarifas**.

## Cobertura

Arriba de todo está **Descargar cobertura**: un Excel con cada distrito, si llegamos a él y con qué
zona. Se genera en el momento, con los datos de ese instante.

## Qué tiene cada zona

**Nombre.** Es la primera parte de la ubicación que se imprime en la etiqueta, así que tiene que
poder imprimirse: si lleva un carácter que la etiqueta no puede imprimir, el guardado lo rechaza y
dice cuál es.

**Distritos.** Se eligen del catálogo geográfico del país con su buscador. Marcar una provincia o
un cantón marca todos sus distritos; también se pueden marcar distritos sueltos. Al lado de cada
distrito se ve en qué zona está hoy. El catálogo no se edita acá: lo administra la plataforma.

**Zona de bodega principal.** Una casilla. Solo una zona puede tenerla a la vez.

**SINPE de la bodega.** Solo al **crear** la zona: el número (8 dígitos, empieza por 6, 7 u 8) y
«A nombre de», tal como aparece en SINPE Móvil. Después se cambia desde
**Configuración · SINPE por bodega**, no desde acá.

## La zona de bodega principal

- Si marcás la casilla en una zona y otra ya la tiene, antes de guardar se pide confirmación y se
  muestra **cuántas órdenes sin cerrar cambiarían de tarifa de flete**. Cancelar no guarda nada.
- No se le puede quitar la marca a la única zona que la tiene: hay que marcar otra.
- No se puede eliminar la zona de bodega principal: primero hay que marcar otra.

## Editar y eliminar

Al guardar una zona con otros distritos, las órdenes de esos distritos pasan a la zona nueva y el
aviso dice cuántas se reubicaron. Las que tienen el paquete en el estante de una bodega satélite no
cambian de zona, y el aviso también lo dice.

Eliminar pide confirmación. Si se rechaza, el aviso dice por qué:

- la zona **tiene historia** (órdenes o usuarios que la usaron): no se puede borrar, pero sí
  **desactivar** (ver abajo);
- o **es la zona de bodega principal**: primero hay que marcar otra.

Una zona desactivada no se edita: para cambiarle el nombre o los distritos, primero se reactiva.

## Desactivar y reactivar

**Desactivar** saca una zona del trabajo nuevo sin borrar nada de lo que ya pasó en ella. Las
órdenes, cierres, tarifas e historial que la nombran siguen como estaban. Después de desactivarla:

- no se ofrece al crear o editar un usuario (el usuario que ya la tenía la conserva hasta que se le
  cambie);
- no aparece en **Configuración · Tarifas**;
- no se le pueden asignar distritos;
- sigue en los filtros para buscar órdenes, entregas y analítica viejas.

En el listado se ve con la marca **Desactivada**, después de las zonas activas, y solo ofrece
**Reactivar** y **Eliminar**.

Desactivar pide confirmación. Si la zona todavía tiene trabajo, la confirmación sigue abierta y
dice qué hay que mover antes. Puede ser cualquiera de estas cosas, o varias a la vez:

| Lo que impide | Qué hacer |
|---|---|
| **Es la zona de bodega principal** | Marca otra zona como bodega principal. |
| **Tiene distritos** (dice cuántos) | Edita la zona y quítale todos los distritos. |
| **Tiene usuarios asignados** (con nombre, rol y estado; también los dados de baja) | En **Configuración · Usuarios**, cámbiale la zona a cada uno. |
| **Tiene órdenes sin terminar** (cuántas por estado y las primeras guías) | Espera a que lleguen a entregado, devuelta a tienda o incidente. Las eliminadas no cuentan. |

Cuando ya no queda nada, se vuelve a pulsar **Desactivar** y sale bien.

**Reactivar** pide confirmación y la vuelve a ofrecer para trabajo nuevo. No le devuelve los
distritos ni los usuarios que tenía: hay que asignarlos de nuevo.

Cada desactivación y reactivación queda en el **historial de acciones**, con quién la hizo.

## Lo que esta pantalla NO hace

- **No define tarifas ni pagos.** Lo que se cobra está en **Configuración · Tarifas**.
- **No crea ni edita provincias, cantones o distritos.** El catálogo es de la plataforma.
