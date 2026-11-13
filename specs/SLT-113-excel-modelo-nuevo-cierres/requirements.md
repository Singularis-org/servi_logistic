# SLT-113 «Excel del modelo nuevo de cierres» — requirements (BLOQUEADO: no cabe en un PR)

> Ruta: completa. Zona: fullstack. Escrito por spec_author el 2026-11-12.
>
> Rebanada **S15** del rediseño de cierres. Spec madre: `specs/SLT-95-detalle-cierre-rediseno/`
> (R73-R75 `[S15]`; `tasks.md > Plan de las demás rebanadas > S15`).
>
> **Estado: BLOQUEADO antes de escribir los requisitos.** Con el documento aprobado, la feature pasa
> de lo que cabe en un PR (`docs/specs.md > Partir una feature`). Este archivo deja el hallazgo, el
> tamaño medido y la propuesta de corte. No hay `design.md` ni `tasks.md` hasta que decidas el corte.

## Documento aprobado

- **Dónde está:** `specs/SLT-95-detalle-cierre-rediseno/design.md > ## Excel (S15) — propuesta
  para aprobar (PA3)`: la regla de formato por modelo y la tabla de cuatro hojas (Cierres,
  Gestiones, Por tienda, Rechazados por la tienda).
- **Quién y cuándo:** Carlos, 2026-11-09: «PA3 aprueba el Excel del modelo nuevo tal como está en
  design.md» (`progress/features/SLT-95.md`, decisiones del 2026-11-09). Decisión D14 del madre.

## Decisiones cerradas (no reabrir)

Heredadas del madre. No viene sembrado por `/afinar-feature`.

| # | Fecha · quién | Decisión |
|---|---|---|
| D14 | 2026-11-09 · Carlos (PA6) | Documento nuevo para el modelo nuevo; los cierres del modelo viejo siguen bajando con el formato actual. |
| PA3 | 2026-11-09 · Carlos | El documento nuevo es el de `design.md > Excel (S15)` del madre, tal cual. |
| D19 | 2026-11-09 · medición en prod | En prod todo es modelo viejo (918 gestiones, `tarifa_modelo = viejo`; `tarifa_valor` = 0 filas). El documento nuevo no tendrá datos hasta que se activen tarifas. |
| F481 | 2026-10-15 · Carlos | El fulfillment es dato de la central: la satélite no lo recibe. |
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero: todo es lectura de lo ya congelado. |

Requisitos del madre que esta ficha cubre: R73, R74, R75. Rango reservado para requisitos nuevos:
R370-R389.

## Por qué no cabe

`arnes.config.json` no fija `gate.tamano_pr`: rige el defecto, 40 archivos y 1 000 líneas. El 80 %
son 32 archivos. El madre estimaba S15 en ~14 archivos y ~800 líneas antes de aprobarse el
documento; el documento aprobado pide cifras que hoy el servidor no emite en ninguna descarga.

### Lo que ya existe (buscado: «Excel», «descarga», «tarifaModelo», «netoEmpresa», «hojasAdicionales»)

- **Librería:** `exceljs` aprobada (`docs/dependencias.md`). No hace falta ninguna nueva.
- **Generador:** `lib/types/descarga.ts > DescargaConfig.hojasAdicionales` ya arma libros de N hojas;
  `formato: "monto"` ya emite el número con `#,##0.00` (`celdaMonto`, ficha 468). Las fechas de las
  hojas de cierres ya salen en día calendario de Costa Rica (`fechaCalendarioCR`).
- **Control:** `DescargarDatasetButton` solo sabe pedir **una** hoja extra (`DataTableDescarga.detalle`
  y `DescargaFilasResult.filasDetalle`). El documento nuevo y el caso mixto piden 2 a 4 hojas en
  un archivo: hay que ampliar ese contrato compartido (lo usan ~30 tablas).
- **Superficies de descarga de cierres hoy (formato actual):**
  - Resumen, una fila por cierre: mensajeros «Pendientes» y «Resueltos»
    (`cierres-admin-descarga-columnas.ts`), bodega «Pendientes», «Resueltos» y «Solicitados»
    (`CierresBodegaAdminModule.tsx`, `CierresBodegaResueltosLista.tsx`,
    `CierresBodegaSolicitadosLista.tsx`).
  - Detalle, una fila por gestión: la hoja fundida (`cierres-gestiones-fundida-descarga-columnas.ts`,
    `DescargarGestionesDialog.tsx`), común a mensajeros y bodega.
  - La descarga de un solo cierre dentro de su detalle (`detalle-cierre-descarga-columnas.ts`).
- **Cifras por gestión del modelo nuevo:** existen en el detalle de un cierre
  (`IngresoEmpresaDTO.conceptosTarifa`, `ivaIncluido`, `fulfillmentConIva`, `fulfillmentCargadoAt`,
  `pagoPorTarifa`, `ajustesPago`, `tarifaModelo`; SLT-101 y SLT-110), pero **no** en el DTO de la
  hoja fundida (`CierreGestionDescargaDTO`), que no lleva ni `tarifaModelo`.
- **Cifras por cierre del documento nuevo** («Se le paga a la tienda», «Gana la tienda en total»,
  «Total facturado», «IVA facturado», «Le queda a la empresa», «Pagos ajustados», partes por tienda):
  el servidor las deriva **solo en el detalle de un cierre** (`CierresAdminService`,
  `CierresBodegaAdminService`). La fila de los listados (`CierreAdminResumen`) solo trae `totales`,
  `totalPagoMensajero`, `totalIngresoBodegaRechazos`, `incluyeModeloNuevo` y el pendiente de pago.
  Para N cierres hace falta una derivación en lote nueva, con su prueba contra Postgres.

### Tamaño medido de la feature entera

| Parte | Producción | Tests |
|---|---|---|
| Hojas por gestión (Gestiones, Rechazados por la tienda) + contrato de N hojas | ~10 | ~14 |
| Hojas por cierre de mensajeros (Cierres, Por tienda) + derivación en lote | ~8 | ~12 |
| Hojas por cierre de bodega (columnas de bodega, conciliación, pago a la satélite) | ~7 | ~10 |
| **Total** | **~25** | **~36** |

~61 archivos y bastante más de 1 000 líneas (SLT-110, solo con dos cifras del detalle de bodega, dio
1 137). Pasa del tope, no solo del 80 %.

## Preguntas abiertas

- **PA1 (bloqueante): corte en rebanadas.** Propuesta, en rebanadas verticales que se mergean solas
  (cada una deja el formato actual intacto para el modelo viejo, que es todo prod según D19):
  - **S15a — SLT-113 se queda con «Excel del modelo nuevo: hojas por gestión».** El nivel «Detalle ·
    una fila por gestión» de `/cierres-admin` (mensajeros y bodega): el servidor añade a la hoja
    fundida el modelo de cada gestión y sus cifras del modelo nuevo (las mismas que el detalle);
    solo viejo = hoja fundida actual idéntica; solo nuevo = «Gestiones» + «Rechazados por la
    tienda»; mixto = esas dos + «Gestiones modelo anterior», sin gestiones repetidas. Amplía
    `DescargarDatasetButton` a N hojas. R370-R376. ~24 archivos (10 producción / 14 tests).
  - **S15b — ficha nueva «Excel del modelo nuevo: hojas por cierre de mensajeros».** El nivel
    «Resumen» de «Pendientes» y «Resueltos» de mensajeros: derivación en lote de las cifras por
    cierre con las mismas funciones del detalle; «Cierres» + «Por tienda»; mixto con «Cierres
    modelo anterior». R377-R383. ~20 archivos (8 / 12). Depende de S15a.
  - **S15c — ficha nueva «Excel del modelo nuevo: hojas por cierre de bodega».** El nivel «Resumen»
    de «Pendientes», «Resueltos» y «Solicitados» de bodega: columnas de bodega, conciliación y pago
    a la satélite; la satélite sin fulfillment ni «Pago entregado» (F481). R384-R389. ~17
    archivos (7 / 10). Depende de S15b.

  Recomendación: los tres cortes. Juntar S15b y S15c daría ~37 archivos, por encima del 80 %.
- **PA2 (bloqueante): cómo encaja el documento de cuatro hojas en el selector de hoy.** Hoy se
  elige «Resumen · una fila por cierre» o «Detalle · una fila por gestión» y cada uno baja un
  archivo de una hoja. El documento aprobado lista cuatro hojas sin decir si van en un solo archivo.
  Recomendación: conservar los dos niveles; «Resumen» baja las hojas por cierre (Cierres, Por
  tienda) y «Detalle» las hojas por gestión (Gestiones, Rechazados por la tienda). Es lo que prevé
  el plan del madre (columnas nuevas en la hoja fundida y en la hoja de cierres) y no cambia la
  pantalla. La alternativa, un único libro de cuatro hojas desde cualquier nivel, obliga a leer
  todas las gestiones también al bajar el resumen.
- **PA3: la descarga de un solo cierre dentro de su detalle** (`detalle-cierre-descarga-columnas.ts`).
  El documento aprobado no la nombra; solo dice que la de `/cierre-dia` no cambia. Recomendación:
  dejarla con su formato actual en este corte y, si la quieres con el documento nuevo, abrir una
  ficha aparte después de S15c.
- **PA4: «Pago entregado (solo central)».** No está definido en el madre si es lo pagado al
  mensajero (pagos vigentes registrados) o lo que falta (`pendientePagoMensajero`). Recomendación:
  lo pagado, `P − pendiente`, que el servidor ya puede derivar con las lecturas de SLT-137 y
  SLT-123; se cierra en el spec de S15b.
