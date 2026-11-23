# SLT-169 «Se le paga hoy a la tienda con todos los cobros restados» — requirements

Ruta: **completa** (zona fullstack, complejidad medium; toca cifras de dinero en pantalla y en Excel).
Requisitos: **R620-R636** (rango reservado R620-R639; R560-R619 son de SLT-159 «Escaneo continuo en
recepciones y recogidas» y SLT-160 «Buscar escaneando en los listados»).

## Origen

Verificado en producción (folio #C51B7B93, cierre del mensajero aprobado): una tienda con 1 entrega
(₡19.900 recaudados) y 12 devoluciones por rechazo. Hoy el detalle enseña dos cifras que se
contradicen:

- KPI «Se le paga hoy a la tienda» = recaudado − flete y comisión (con IVA) de lo entregado =
  **₡16.626,95** (`pagoTiendaEmpresa`, `lib/utils/ingreso-empresa.ts:483-489`; la ficha 301 decidió
  no restar el flete por rechazo «porque se cobra aparte, contra su saldo»).
- «Gana en total» de la tabla «Por tienda» = recaudado − todo lo facturado = **−₡13.205,05**
  (`ganaLaTienda`, `lib/utils/ingreso-empresa.ts:521-523`; fichas 395/396).

La diferencia, ₡29.832,00, son los 12 fletes por rechazo con IVA (12 × ₡2.486,00).

## Alcance

**Dentro:**
- Detalle del cierre del mensajero y del cierre de bodega, vistos por la central: tarjeta «Se le paga
  hoy a la tienda», «Reparto de lo recaudado», cuenta de lo facturado y tabla «Por tienda».
- Las cifras que los alimentan en el servidor (`cifrasDelCierre`, `partesPorTienda`, el nivel de cada
  cierre del día en `CierresBodegaAdminService`, el reparto en % de `CierresAdminService`).
- Descargas Excel del modelo nuevo: hoja «Cierres» (mensajeros y bodega) y hoja «Por tienda».
- Los dos modelos de tarifa (viejo y nuevo).

**Fuera (lo que NO entra):**
- Cualquier movimiento de dinero: aprobación de cierres, libro de la tienda
  (`wallet_tienda_movimiento`), caja (`wallet_movimiento`), cobros por rechazo desde novedades, pagos y
  liquidaciones. Esta ficha es **solo presentación** (evidencia en `design.md > ¿Toca dinero?`).
- El reparto por producto de la ficha 347 (`lib/utils/dinero-por-producto.ts`), que sigue con
  `pagoTiendaEmpresa` sin cambios.
- Los componentes sin superficie `CascadasCierreMensajero.tsx` y `DesglosePorTienda.tsx` (ningún
  archivo de `app/` ni de `components/` los monta; solo `tests/fixtures/detalle-cierre-admin-anterior.tsx`).
- Retirar del contrato los campos que quedan redundantes (`ganaLaTienda`, `cobradoSobreRecaudado`):
  ficha de limpieza aparte (P3).
- Las descargas de la satélite sin el dinero de la empresa: las hace SLT-161 «Descargas de la satélite
  sin el dinero de la empresa». Esta ficha no le añade nada a la satélite (R634).

## Decisiones cerradas (no reabrir)

| Id | Fecha · quién | Decisión |
|---|---|---|
| D1 | 2026-11-14 · Carlos | Opción A («vamos con la opcion a y te apruebo»): lo que se le paga a la tienda resta **desde el inicio** todo lo que la empresa le cobra en ese cierre: fletes de entregas y de rechazos, comisión, IVA y cualquier otro cobro a la tienda del cierre. |
| D2 | 2026-11-14 · Carlos | Una sola cifra con su signo. Si es negativa se pinta en rojo y se lee como que la tienda debe, p. ej. «−₡13.205,05 (la tienda debe)». |
| D3 | 2026-11-14 · Carlos | En «Por tienda» las columnas «Se le paga hoy» y «Gana en total» se funden en una. |
| D4 | 2026-11-14 · Carlos | Alcance: detalle de cierre de mensajero y de bodega, «Por tienda» y descargas Excel. Sin cobrar dos veces contra la wallet de la tienda. |

Cobertura: D1 → R620, R621, R623, R635; D2 → R622, R625, R627; D3 → R627, R630; D4 → R623, R628-R632.

## Requisitos (EARS)

### La cifra (servidor)

- **R620** — El sistema DEBE calcular «Se le paga hoy a la tienda» de un cierre del mensajero como lo
  recaudado del cierre (`total_general`) menos el total facturado a la tienda con IVA en ese cierre
  (flete de las entregadas, comisión COD, flete de devolución o de no entregadas, y el IVA de cada
  uno). Con el cierre #C51B7B93 (₡19.900 recaudados, ₡3.273,05 de flete y comisión con IVA y
  12 × ₡2.486,00 de flete por rechazo con IVA) el resultado DEBE ser −13205.05.
- **R621** — El sistema DEBE calcular «Se le paga hoy» de cada tienda de «Por tienda» con la misma
  definición de R620 sobre las gestiones de esa tienda, de modo que la suma de las tiendas sea igual
  a la cifra del cierre al céntimo, y DEBE ordenar las tiendas por esa cifra de mayor a menor (mismo
  desempate de hoy: nombre y luego id).
- **R622** — SI la cifra de R620 o de R621 es negativa, ENTONCES el sistema DEBE emitirla con su signo,
  nunca recortada a 0.00.
- **R623** — En el detalle del cierre de bodega, el sistema DEBE aplicar la definición de R620 a cada
  cierre del día y al agregado de la bodega, y la suma de los cierres del día DEBE ser igual al
  agregado.
- **R624** — El «Reparto de lo recaudado» del detalle del cierre del mensajero DEBE tener dos partes,
  «Se le paga hoy a la tienda» y «Total facturado», que suman lo recaudado. SI «Se le paga hoy a la
  tienda» es negativa, ENTONCES el reparto NO DEBE llevar porcentajes ni barra, solo los dos
  importes (regla de hoy de `porcentajesReparto` para una parte negativa).

### Lo que ve la central

- **R625** — La tarjeta «Se le paga hoy a la tienda» DEBE mostrar la cifra de R620 con su signo y, como
  contexto, el número de tiendas («1 tienda» / «N tiendas») sin el texto «gana en total». SI la cifra
  es negativa, ENTONCES DEBE pintarse en rojo y llevar junto al importe «(la tienda debe)» con una
  tienda o «(las tiendas deben)» con dos o más (P2).
- **R626** — La cuenta de lo facturado («Lo que se le factura a la tienda») NO DEBE mostrar el
  subtotal «Sale de lo recaudado»: DEBE listar flete por entregado + IVA, comisión COD + IVA, el flete
  de devolución a origen (viejo) o de no entregadas (nuevo) + IVA, y «Total facturado». Aplica al
  detalle del mensajero y al de bodega.
- **R627** — La tabla «Por tienda» del detalle (mensajero y bodega) DEBE tener tres columnas:
  «Tienda», «Recaudado» y «Se le paga hoy» (la cifra de R621). NO DEBE tener «Gana en total». SI la
  cifra de una tienda es negativa, ENTONCES su celda DEBE pintarse en rojo y llevar «(la tienda debe)».

### Descargas Excel (modelo nuevo)

- **R628** — La hoja «Cierres» del libro de cierres de mensajeros DEBE tener una sola columna de la
  tienda, «Se le paga a la tienda», con la cifra de R620, en el lugar que hoy ocupa; NO DEBE tener
  «Gana la tienda en total». La central recibe 19 columnas (hoy 20).
- **R629** — La hoja «Cierres» del libro de cierres de bodega DEBE rotular «Se le paga a la tienda» la
  columna que hoy se llama «Gana la tienda en total», en la misma posición y con la cifra de R623
  (agregado de la bodega). El número de columnas no cambia (26 para la central).
- **R630** — La hoja «Por tienda» (de los dos libros) DEBE tener cuatro columnas: «Folio», «Tienda»,
  «Recaudado» y «Se le paga hoy» (la cifra de R621, como número con su signo). NO DEBE tener «Gana en
  total».

### El dinero real no cambia

- **R631** — El sistema NO DEBE cambiar ningún movimiento de dinero: al aprobar un cierre, los
  movimientos que se escriben en el libro de la tienda y en la caja DEBEN ser los mismos que antes de
  esta ficha (mismas filas, categorías y montos), y ningún servicio que escribe dinero DEBE leer las
  cifras de presentación de R620-R623.
- **R632** — CUANDO un cierre está aprobado y el débito del flete por devolución al libro de la tienda
  está encendido (`TIENDA_DEBITA_FLETE_DEVOLUCION`, P1), para cada tienda del cierre la cifra de R621
  DEBE ser igual a los créditos menos los débitos que ese cierre dejó en el libro de esa tienda.

### Lo que NO ve la satélite (sin regresión de SLT-154)

- **R633** — MIENTRAS quien mira el detalle no es la central, el sistema NO DEBE enviar ni mostrar «Se le
  paga hoy a la tienda», «Total facturado», el reparto con esas partes ni «Por tienda» (contrato de
  SLT-154 «Vista de la bodega satélite: solo lo suyo», R462-R478).
- **R634** — MIENTRAS la audiencia de una descarga es la satélite, el libro NO DEBE ganar ninguna
  columna ni hoja respecto de hoy.

### Alcance de modelos y de lo que no se toca

- **R635** — El sistema DEBE aplicar R620-R630 igual a los cierres del modelo viejo (el flete de
  devolución solo nace de `devolucion_a_origen_por_rechazo`) y del modelo nuevo (nace de todo
  resultado que no es `entregado`).
- **R636** — El reparto por producto de la ficha 347 (`repartoDeOrden`) NO DEBE cambiar: sigue
  restando solo flete y comisión de lo entregado.

El test previsto de cada R está en `tasks.md > Trazabilidad`.

## Preguntas abiertas

- **P1 (para Carlos o el leader, antes del PR; bloquea R632)** — El débito del flete por devolución al
  libro de la tienda depende de `WALLET_TIENDA_DEBITA_FLETE_DEVOLUCION` (`lib/config/wallet-tienda.ts:69-71`,
  por defecto encendido). La variable no aparece en ningún archivo de entorno del repo. Si en
  producción o en Preview estuviera en `false`, el libro NO cobra el flete por rechazo y la pantalla
  enseñaría un cobro que no ocurre. Hay que comprobar que no está definida o que vale `true`
  (solo como booleano, sin imprimir el entorno). Si vale `false`, se para y decide Carlos.
- **P2 (copia, se confirma en Preview)** — Con dos o más tiendas y la suma negativa, el texto propuesto
  es «(las tiendas deben)». Carlos solo dio el ejemplo con una tienda.
- **P3 (deuda, ficha aparte)** — Desde esta ficha `ganaLaTienda` vale lo mismo que `pagoTienda` y
  `cobradoSobreRecaudado` ya no se pinta. Siguen en el contrato porque quitarlos ahora toca 49 archivos
  de tests (`ganaLaTienda`) y no cabe en el PR (`design.md > Alternativas descartadas`). Se propone
  una ficha de limpieza que los retire junto con los dos componentes sin superficie.
