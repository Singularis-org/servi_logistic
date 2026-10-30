---
titulo: Configuración · Zonas
modulo: configuracion
pantalla: /configuracion/zonas
roles: [maestro]
actualizado: 2026-10-29
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
aviso dice cuántas se reubicaron. Las que ya tienen el paquete en una bodega no cambian de zona, y
el aviso también lo dice.

Eliminar pide confirmación. Si se rechaza, el aviso dice por qué: la zona **está en uso** o **es la
zona de bodega principal**.

## Lo que esta pantalla NO hace

- **No define tarifas ni pagos.** Lo que se cobra está en **Configuración · Tarifas**.
- **No crea ni edita provincias, cantones o distritos.** El catálogo es de la plataforma.
