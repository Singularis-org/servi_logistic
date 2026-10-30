---
titulo: Configuración · Tarifas
modulo: configuracion
pantalla: /configuracion/tarifas
roles: [maestro, admin]
actualizado: 2026-10-29
fuentes:
  - app/(app)/configuracion/tarifas/page.tsx
  - app/(app)/configuracion/tarifas/_components/
---

# Configuración · Tarifas

Acá se define **lo que se le cobra a cada tienda o cuenta por API key**: flete, fulfillment,
comisiones e IVA, con una tarifa por defecto y, si hace falta, una propia por zona.

> **Tocar esto cambia lo que se cobra y lo que se paga de aquí en adelante.** No es una pantalla de
> consulta: cada cifra de acá termina en la cuenta de una tienda.

## Qué se configura

**Tarifas por tienda o API key.** Se elige el administrador de tienda o la cuenta por API key y se
cargan sus montos: una tarifa **por defecto** y, para las zonas que lo necesiten, una propia de esa
zona.

**Comisión por cobro contra entrega (%).** El porcentaje que la empresa cobra por recaudar la plata del
cliente. Es lo que después aparece como *Comisión COD* en la cuenta de la tienda.

Las zonas no se crean acá: se arman en **Configuración · Zonas**, que también tiene la descarga de
cobertura.

## Cómo se relaciona con el resto

| Lo que definís acá | Dónde aparece |
| --- | --- |
| Flete de la tienda (por defecto o de la zona) | El flete en la cuenta de la tienda |
| Comisión COD | *Comisión COD* en **Wallet · Tiendas** y en el **Mi wallet** de la tienda |

## Antes de cambiar una tarifa

Lo que cambiás **aplica de aquí en adelante**, no reescribe lo ya cobrado. Las entregas viejas
conservan la tarifa con la que se calcularon, y eso es lo correcto: una factura emitida no cambia
porque hoy suban los precios.

Conviene avisar a las tiendas afectadas antes, no después de que vean la diferencia.

## Lo que esta pantalla NO hace

- **No recalcula lo ya cobrado.** Lo pasado queda como estaba.
- **No crea ni edita zonas.** Eso es **Configuración · Zonas**.
- **No define quién cubre qué zona.** Eso es la asignación de mensajeros y bodegas.
