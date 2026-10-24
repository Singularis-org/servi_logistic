---
titulo: Configuración · Geografía
modulo: configuracion
pantalla: /configuracion/geografia
roles: [maestro, admin]
actualizado: 2026-10-22
fuentes:
  - app/(app)/configuracion/geografia/_components/GeografiaAdminModule.tsx
  - app/(app)/configuracion/_shared/filtrar-arbol-geografico.ts
---

# Configuración · Geografía

El **catálogo de provincias, cantones y distritos** del país. Es la base sobre la que se arman las
zonas, se calculan las tarifas y se filtran casi todas las pantallas.

## Cómo está organizado

Un árbol de tres niveles — **provincia → cantón → distrito** — que se despliega y se contrae. El
buscador acepta cualquiera de los tres niveles y te deja el camino a la vista.

## Quién lo gestiona

La geografía la gestiona **la plataforma, Servi Logistic**, no la oficina. Dar de alta una
provincia, un cantón o un distrito, cambiarle el nombre, retirarlo o volver a activarlo lo hace
Servi Logistic.

Si falta un nodo o hay que corregir uno, **se lo pedís a Servi Logistic**.

## Qué pasa cuando un nodo se retira

Un nodo retirado deja de ofrecerse al crear órdenes y al armar zonas, pero **las órdenes que ya lo
usaban siguen intactas** — no se reescribe el pasado.

Esto lo lee media aplicación: los filtros de órdenes, las zonas de tarifas, la asignación de
mensajeros. Si un distrito que se estaba usando **deja de poder elegirse**, quien lo necesite va a
reportar que «desapareció»: lo más probable es que se haya retirado del catálogo.

## Lo que esta pantalla NO hace

- **No define tarifas.** Acá está la geografía; el precio de cada zona es **Configuración · Tarifas**.
- **No asigna mensajeros a zonas.** Eso es la gestión de usuarios.
