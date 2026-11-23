# SLT-111 «Cifras del servidor: reparto en % y señales de la cola» — design

## Lo que ya existe

Buscado en `specs/`, en `feature_list.json` y en el código del worktree (el grafo no tiene indexado
este worktree; la búsqueda fue con Grep/Read).

| Pieza | Dónde | Estado |
|---|---|---|
| Señales de la cola de mensajeros (R70 parte de la cola, R109, R110) | `CierresAdminService` (`senalesCola`, una consulta agregada por página), `components/private/cierres/cola/cola-cierres-vista.ts > senalesDe`, `cola-cierres-labels.ts` | **Hecho** por SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (PA1 = sí). Tests: `tests/integration/db/cierres-cola-senales-sql-real.test.ts`, `tests/unit/services/cierres-admin-senales-cola.test.ts`, `tests/unit/utils/cola-cierres-vista.test.ts`, `tests/components/ColaCierres.test.tsx`. No se toca. |
| Barra y leyenda del reparto | `components/private/cierres/detalle/DineroCierre.tsx` | **Hecho.** Dibuja la barra solo si todas las partes traen `porcentaje`; si no, solo la leyenda. Añade «(n %)» a la leyenda cuando llega. No cambia. |
| Hueco del dato en la vista | `components/private/cierres/detalle/detalle-cierre-vista.ts`: `DineroEmpresaMensajero.porcentajesReparto?`, `DetalleBodegaVista.porcentajesReparto?`, `reparto(partes, porcentajes)` en `lineasDinero` | **Hecho**, pero nadie lo rellena: `vistaMensajeroDesdeAdmin` y `vistaBodegaDesdeAdmin` no copian ningún porcentaje. |
| Importes de las partes | `CierresAdminService.verCierreDetalle` (`pagoTienda`, `cobradoSobreRecaudado`, `cierre.totales.general`); `CierresBodegaAdminService.verCierreBodegaDetalle` (`paraLaCentral`, `cierre.totalPagoMensajero`, `cierre.totalIngresoBodegaRechazos`, `cierre.totales.general`) | **Hecho.** Strings de escala 2 derivados con `Prisma.Decimal` (`lib/utils/ingreso-empresa.ts`). Las partes suman `general` por construcción: `pagoTiendaEmpresa = general − flete − comisión` y `cobradoSobreRecaudado = flete + comisión`; `paraLaCentral = general − pago − bodega`. |
| Función del reparto en % | `lib/utils/porcentajes-reparto.ts` (nombre del madre) | **Falta.** Ningún `porcentajesReparto` en `lib/`. |
| Pase del resultado a la vista en el detalle de mensajero | `app/(app)/cierres-admin/_components/CierresAdminModule.tsx > abrirDetalle` copia campo a campo el resultado a su estado | **Falta** el campo nuevo. En bodega, `CierresBodegaAdminModule` guarda el resultado entero (`setDetalle(result)`), así que solo falta el mapeador. |
| Analítica: `components/private/analytics/porcentajes.ts` | Porcentajes con decimales para gráficas, en el cliente, sobre conteos | No sirve: trabaja con `number` y conteos, no con importes; y su regla («<0,1 %», sin suma 100) es otra (ver PA1). |

Conclusión: la ficha queda en emitir los porcentajes en el servidor y llevarlos a la vista.

## Decisión técnica

### Servidor 1 — la regla (`lib/utils/porcentajes-reparto.ts`, nuevo)

```ts
/** R260-R262. Mayor resto sobre céntimos exactos. `null` = sin barra. */
export function porcentajesReparto(partes: readonly string[], total: string): number[] | null;
```

1. `T = Decimal(total).times(100)`, `c_i = Decimal(parte_i).times(100)`. SI `T ≤ 0`, algún `c_i < 0`,
   algún valor no es entero en céntimos, o `Σ c_i ≠ T` → `null` (R261).
2. `n_i = c_i × 100`; `piso_i = n_i.divToInt(T)`; `resto_i = n_i.mod(T)`. Todo exacto: enteros
   en `Prisma.Decimal`, sin división con decimales (R262).
3. `faltan = 100 − Σ piso_i` (0 ≤ `faltan` < nº de partes). Se ordenan los índices por `resto`
   descendente y, a igual resto, por índice ascendente; los `faltan` primeros reciben +1 (R260).
4. Salida: `piso_i.toNumber()` en el orden de entrada. Es un entero 0-100, no un importe.

Literales (madre y propios):

| Partes / total | Exacto | Pisos · restos | Resultado |
|---|---|---|---|
| 94 350,00 · 5 650,00 / 100 000,00 | 94,35 · 5,65 | 94, 5 · 0,35, 0,65 | **[94, 6]** |
| 96 500,00 · 3 000,00 · 500,00 / 100 000,00 | 96,5 · 3 · 0,5 | 96, 3, 0 · 0,5, 0, 0,5 (empate) | **[97, 3, 0]** |
| 7 680,00 · 2 200,00 · 120,00 / 10 000,00 (E2E B6) | 76,8 · 22 · 1,2 | 76, 22, 1 · 0,8, 0, 0,2 | **[77, 22, 1]** |
| 26 610,00 · 3 390,00 / 30 000,00 | 88,7 · 11,3 | 88, 11 · 0,7, 0,3 | **[89, 11]** |
| 1,00 · 1,00 · 1,00 / 3,00 | 33,3… ×3 | 33, 33, 33 · empate triple | **[34, 33, 33]** |
| 100 000,00 · 0,00 / 100 000,00 | 100 · 0 | — | **[100, 0]** |
| total 0,00 | — | — | `null` |
| −1 130,00 · 1 130,00 / 0,00 (entrega prepagada) | — | — | `null` |
| −500,00 · 1 500,00 · 0,00 / 1 000,00 | — | — | `null` (parte negativa) |
| 60,00 · 30,00 / 100,00 (no suman) | — | — | `null` |

### Servidor 2 — dónde se llama

- `CierresAdminService.verCierreDetalle`: tras derivar `pagoTienda` y `cobradoSobreLoRecaudado`,
  `porcentajesReparto([pagoTienda, cobradoSobreLoRecaudado], resumen.totales.general)` y se emite
  como `porcentajesReparto` en el resultado `ok` (R263). La satélite entra por el mismo método.
- `CierresBodegaAdminService.verCierreBodegaDetalle`:
  `porcentajesReparto([resumen.paraLaCentral, resumen.totalPagoMensajero,
  resumen.totalIngresoBodegaRechazos], resumen.totales.general)` → `porcentajesReparto` (R264).
- Ninguna lectura nueva: los cuatro/cinco importes ya están en memoria cuando se llama (R265).

### Contratos I/O

- `lib/interfaces/services/ICierresAdminService.ts`, rama `ok` de `CierreDetalleAdminServiceResult`:
  `porcentajesReparto?: number[] | null` con doc «R70/R263: [tienda, empresa]; `null` = sin barra».
- `lib/interfaces/services/ICierresBodegaAdminService.ts`, rama `ok` de
  `CierreBodegaDetalleServiceResult`: `porcentajesReparto?: number[] | null` con doc «R70/R264:
  [central, mensajeros, bodega satélite]».
- **Opcional (aditivo)**, como `senalesCola` de SLT-102: hay 12 archivos de test que construyen el
  resultado del detalle a mano (`grep fleteRechazoYaCobradoATienda: tests/`) y hacerlo obligatorio
  los tocaría todos sin aportar nada. El servicio lo emite **siempre** (array o `null`); «ausente»
  solo ocurre en dobles. El riesgo de que un paso intermedio lo tire lo cubren R267 y sus tests.

### Pantalla

- `detalle-cierre-vista.ts`: `vistaMensajeroDesdeAdmin` copia `r.porcentajesReparto ?? null` a
  `empresa.porcentajesReparto`; `vistaBodegaDesdeAdmin` copia `r.porcentajesReparto ?? null` a
  `porcentajesReparto`. `vistaMensajeroDesdeCierreDia` no cambia (`empresa: null`).
- `CierresAdminModule.tsx`: el tipo del estado del detalle gana `porcentajesReparto?: number[] | null`
  y `abrirDetalle` copia `result.porcentajesReparto` tal cual (es la línea que hoy falta para que
  llegue).
- `DineroCierre.tsx` sin cambios. Ningún cálculo en el cliente (R71): el cliente solo usa el entero
  recibido como ancho y como texto.

## Modelo de datos

Sin cambios: ni tablas, ni columnas, ni RLS, ni migraciones, ni `down.sql`. Todo es lectura de lo ya
congelado y una derivación en memoria (R72, R265). `organizacion_id` no interviene: la consulta del
detalle ya está acotada a la empresa del actor y no se toca.

## Autorización y módulo

No cambia. `verCierreDetalle` ya valida el alcance (central: total; satélite: su zona) y
`verCierreBodegaDetalle` exige acceso total (SLT-110 R215). El dato viaja dentro del resultado que
cada uno ya autoriza; no hay Server Action nueva. Módulo: el de cierres sigue colgando de `nucleo`.

## Datos que dependen del país

Ninguno nuevo. Los porcentajes no llevan moneda; los importes de la leyenda siguen con `money()`
(moneda de la empresa). El formato «(94 %)» es el que ya escribe `DineroCierre`.

## Alternativas descartadas

1. **Calcular los porcentajes en el cliente** (en `lineasDinero` o en `DineroCierre`). Es la
   alternativa 3 que el madre ya descartó (`SLT-95 design.md > Alternativas`): convierte importes a
   número en el cliente, que R71 prohíbe y la guardia de dinero vigila.
2. **`Math.round` por parte.** No suma 100: 96,5 / 3 / 0,5 da 97 / 3 / 1 = 101, y la barra se sale.
   El madre fija mayor resto.
3. **Emitir porcentajes con decimales** (94,35). El madre pide enteros; la barra no gana nada y la
   leyenda se alarga.
4. **Base = suma de las partes en vez de `totales.general`.** Hoy dan lo mismo por construcción, pero
   si un snapshot agregado dejara de cuadrar con sus partes, repartir sobre la suma maquillaría el
   descuadre. Con `general` como base y `null` si no cuadra (R261) la barra desaparece y la leyenda
   sigue enseñando los importes reales, igual que la decisión de la 393 de no corregir agregados.
5. **Campo obligatorio en el contrato.** Ver «Contratos I/O»: 12 archivos de test tocados sin valor.
6. **Reusar `components/private/analytics/porcentajes.ts`.** Es cliente, trabaja con `number` y no
   suma 100 a propósito.

## Dependencias de terceros

Ninguna nueva. `Prisma.Decimal` (decimal.js) ya está en el repo y es lo que usa
`lib/utils/ingreso-empresa.ts`.

## Verificación

### Unidad — la regla (`tests/unit/utils/porcentajes-reparto.test.ts`)

Todas las filas de la tabla de literales de arriba, escritas a mano. Más: la suma es 100 en cada caso
no nulo; el orden de salida es el de entrada; el empate triple da [34, 33, 33] (gana la primera).

### Integración contra Postgres real (`tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts`)

Patrón de `tests/integration/db/cierre-iva-aparte-sl39.test.ts` (servicios reales sobre
repositorios reales) y de SLT-110 (`describeSiHayBase`, fallo ruidoso si falta un catálogo, nada de
`return` temprano, transacción que siempre se revierte, empresa propia).

Corpus (los importes los confirma T0 a mano antes de sembrar):

| Cierre | Siembra | `porcentajesReparto` esperado |
|---|---|---|
| MA, mensajero, zona central | escenario A del madre: efectivo 70 000,00 + SINPE 30 000,00; flete 4 000,00 + IVA 13 % y comisión COD 1 000,00 + IVA 13 % congelados → `pagoTienda` 94 350,00, `cobradoSobreRecaudado` 5 650,00 | **[94, 6]** |
| MB, mensajero, zona satélite | tres entregas de 10 000,00 en efectivo, flete 1 000,00 + IVA 13 % cada una, sin comisión → 26 610,00 / 3 390,00 | **[89, 11]** (central y adminSatelite de esa zona) |
| MC, mensajero | una entrega prepagada (`monto_cobrar` nulo, `general` 0,00) con flete 1 000,00 + IVA 13 % → `pagoTienda` −1 130,00 | **`null`** |
| BX, bodega | snapshot agregado `general` 100 000,00, pago a mensajeros 3 000,00, ingreso de bodega 500,00 (dos cierres del día) | **[97, 3, 0]** |
| BY, bodega | `general` 1 000,00, pago 1 500,00, ingreso 0,00 (un cierre del día) → `paraLaCentral` −500,00 | **`null`** |

Aserciones: los cinco valores; MB igual para la central y para el adminSatelite de su zona;
ninguna escritura (`serializarEscriturasReales`); el número de sentencias SQL de `verCierreDetalle`
es el mismo para MA (1 gestión) que para MB (3 gestiones) y el de `verCierreBodegaDetalle` el mismo
para BX (2 cierres del día) que para BY (1) (R265, sin N+1).

No hay SQL nueva que mutar: las mutaciones (tasks T4) van sobre la regla, el orden de las partes y el
pase de cada servicio, que es donde vive lo que esta ficha añade.

### Componentes

- `tests/components/DetalleCierreDinero.test.tsx`: con porcentajes, la barra tiene una franja por parte
  con `width` 94 % / 6 % y la leyenda «(94 %)», «(6 %)»; con `null`, sin barra y sin «%». Los dobles
  de los tests existentes no cambian (el test «R9 — una cifra, un nombre» lee el rótulo del `li` y se
  rompería si se les añadiera el porcentaje).
- `tests/components/CierresAdminDetalleUnico.test.tsx` y `tests/components/CierresBodegaAdminDetalleUnico.test.tsx`:
  la acción devuelve `porcentajesReparto` y la leyenda del módulo montado dice «(94 %)» / «(97 %)»:
  prueba que el módulo no lo tira (R267, «composition root que no inyecta»).
- `tests/unit/utils/detalle-cierre-vista.test.ts`: los dos mapeadores copian el valor (array y
  `null`); `vistaMensajeroDesdeCierreDia` sigue con `empresa: null`.

### E2E (`e2e/cierres-rediseno.spec.ts`)

Con los escenarios que ya existen, sin sembrar nada nuevo: escenario A (mensajero, central) añade la
leyenda «Se le paga hoy a la tienda ₡94.350 (94 %)» y «Sale de lo recaudado ₡5.650 (6 %)»; escenario
B6 (bodega, central) añade «Debe llegar a la central ₡7.680 (77 %)», «Pago a mensajeros ₡2.200
(22 %)» y «Gana la bodega satélite ₡120 (1 %)». Literales escritos a mano.

## Lo que hereda SLT-107

SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura»: si la satélite abre su
cierre de bodega por `verCierreBodegaDetalle` (con el permiso que añada) y `vistaBodegaDesdeAdmin`,
recibe el reparto sin más código. Si abre por un método nuevo, ese método DEBE llamar a
`porcentajesReparto` con las mismas tres partes y el mismo total (R264).

## Orden de merge con lo que está en vuelo

- SLT-106 «Bodega satélite: A consolidar con la cola única» toca `detalle-cierre-vista.ts` (y la cola): va a `dev`
  antes; esta rama se pone al día con `dev` antes del PR. El cambio aquí son dos líneas aditivas en
  los mapeadores.
- SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» toca `e2e/cierres-rediseno.spec.ts`: aquí solo se
  añaden aserciones en dos tests existentes (escenarios A y B6). Si SLT-137 llega antes, se resuelve
  al ponerse al día; si llega después, se le avisa del bloque añadido.
- Sin solape con `ColaCierres.tsx`, `cola-cierres-*`, `CierreDiaModule.tsx` ni la guardia
  `liquidacion-money-safe` (la función nueva no casa su auto-captura y `CierresAdminService.ts`, que
  sí está censado, no gana `Number(`/`parseFloat(`).
