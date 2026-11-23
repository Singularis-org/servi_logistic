# SLT-243 — moneda-pantallas-cierres-admin · requirements.md

> **Zona:** fullstack (en la práctica, solo pantallas y descargas del navegador: no hay cambio de
> servidor) · **Complejidad:** high · **Ruta:** completa (dinero) · **depends_on:** SLT-235 (en `dev`)
> **Rama:** `feature/SLT-243-moneda-pantallas-cierres-admin`, sobre `dev` (SLT-242 ya mergeada, #276).
>
> **Alcance (rebanada 5 de 8 del corte de SLT-235):** los importes y el nombre del impuesto que pintan
> las pantallas **montadas** de `app/(app)/cierres-admin/**` y `app/(app)/cierre-dia/**` salen con la
> moneda y el impuesto del país de la empresa:
> - `/cierre-dia`: el total general y el pago al mensajero del cierre;
> - `/cierres-admin`:
>   - el diálogo de ajustar el pago al mensajero;
>   - la marca «ajustado» (`MarcaAjustado`);
>   - los totales de la consolidación de bodega;
>   - el panel de totales de la corrección del resultado (`TotalesPanel`);
>   - la sección del pago al mensajero (insignia del pendiente y avisos de pago registrado o anulado);
>   - el aviso de cuadre de la corrección de los métodos de pago (`CorregirPagosDialog`);
>   - el tope del monto de la indemnización al aprobar;
> - `mensajeDeCuadre` (`components/shared/DesglosePagoField.tsx`) pasa a pedir la moneda siempre: lo
>   dejó escrito SLT-235 (design §7 y §12, alternativa 4) para esta rebanada;
> - los encabezados con «IVA» de las descargas de cierres del admin (resumen de cierres de mensajero,
>   resumen de cierres de bodega, gestiones del modelo nuevo y hoja fundida de gestiones). Pasan a
>   decir «impuesto (<nombre del impuesto del país>)» (P2, cerrada el 2026-11-23).
>
> Para Costa Rica nada cambia a la vista, **salvo esos encabezados de descarga**: por P2 pasan de
> «IVA del flete» a «Impuesto (IVA) del flete», también en Costa Rica (design §6.1).
>
> **La lista de excepciones de `pais-sin-literales` no tiene ninguna entrada a nombre de SLT-243**
> (`tests/unit/guards/_pais-sin-literales-excepciones.ts`, tope 12, comprobado el 2026-11-23): esta
> rebanada no retira ninguna y el tope se queda en 12. Ningún archivo de servidor de los cierres
> escribe la moneda ni el impuesto de la plataforma.
>
> **Lo que NO entra:**
> - El código de `cierre-factura.tsx` y de `cierre-detalle-shared.tsx` que ya no monta ninguna
>   pantalla (P1). Ejemplos: `CierreFacturaResumen`, `CierreBodegaFacturaResumen`,
>   `CierreFacturaDetalle`, `GestionesPorResultado`, `DesgloseIngresoEmpresa`, `TotalesIngresoPanel`
>   y las tarjetas de totales. Se quedan con `money(` y sus textos con «IVA» hasta que SLT-146
>   «Podar cierre-factura.tsx de lo que quedó sin montar» los borre. Lo mismo vale para
>   `desglose-pago.ts` y las notas con «IVA» que solo lee ese código.
> - Los rótulos con «IVA» que viven en `cierre-labels.ts` o `cierre-detalle-shared.tsx` pero solo
>   pinta `components/private/cierres/**`, y el texto de la tarifa de la descarga «Gestiones», que
>   se arma con piezas de `fila-gestion-labels.ts`. Son de SLT-244 «Moneda e impuesto del país en
>   pantallas: componentes de cierres» (P3).
> - Las celdas de importe de las descargas: ya salen crudas, sin símbolo (guardia 359, diente 3).
> - Las fechas en zona de CR (`fecha-cr`, `hora-cr`) → SLT-81 / SLT-92 «Pantallas: fechas y
>   teléfonos en la zona y el prefijo del país de la empresa».
> - `components/shared/liquidacion/liquidacion-labels.ts`, la wallet y las pantallas de plataforma:
>   son de otras rebanadas (SLT-245, SLT-246, SLT-237).
> - `FichaQueLoRetira` y `FICHAS_ADMITIDAS`: se limpian en la última rebanada del corte.
>
> Inventario hecho con Grep el 2026-11-23 sobre `app/(app)/cierres-admin/**` y
> `app/(app)/cierre-dia/**`. Patrones: `money(`, `moneyTope(`, `formatMonto`, `montoExacto`,
> `monedaConfig`, `₡`, `CRC`, `\bIVA\b`, `IMPUESTO_ROTULO`, `mensajeDeCuadre` y `KpiValorAnimado`.
> Después se separó lo montado de lo que no monta nadie (design, «Lo que ya existe»).

## Requisitos (EARS)

Vocabulario:
- **Moneda del país / nombre del impuesto del país:** los que entrega SLT-235 para la empresa del
  usuario. En pantalla salen de `useMonedaDelPais()` y `useImpuestoDelPais()`, con sus caídas
  (SLT-235 R3–R5, R15).
- **Moneda de la plataforma / rótulo de la plataforma:** `MONEDA_PLATAFORMA` e `IMPUESTO_ROTULO`
  («IVA»).
- **Reglas de formato:** las de SL-21 R8 (`formatearMontoEn`). Para un tope, las de
  `formatearTopeEn`, que nunca cuadra al alza.
- **Marcador de «sin importe»:** la raya larga que pinta hoy `money(null)` (`SIN_MONTO_RAYA`).
- **País de prueba:** una empresa con `MONEDA_DE_PRUEBA` (código `XTS`, «€», espacio de miles, punto
  decimal, 0 decimales) e impuesto «IGV».
- **Descargas de cierres del admin:** el resumen de cierres de mensajero (pendientes e histórico), el
  resumen de cierres de bodega (pendientes, resueltos y solicitados), el libro de gestiones del
  modelo nuevo y la hoja fundida de gestiones, con su selector de columnas.

### Importes en pantalla

- **R1.** CUANDO `/cierre-dia` pinta el total general o el total del pago al mensajero de un cierre,
  el sistema DEBE formatearlo con la moneda del país y las reglas de formato. Sin importe, DEBE
  pintar el marcador de «sin importe».
- **R2.** CUANDO el diálogo de ajustar el pago al mensajero pinta el pago vigente de la gestión o,
  tras ajustar, el pago nuevo y el total del pago del cierre, el sistema DEBE formatearlos con la
  moneda del país.
- **R3.** CUANDO la marca «ajustado» pinta el pago anterior y el nuevo, el sistema DEBE formatearlos
  con la moneda del país, en cualquier pantalla que la monte.
- **R4.** CUANDO la consolidación de bodega pinta sus totales agregados (total general, pago a
  mensajeros, ingreso de la bodega por rechazos y lo que va a la central), el sistema DEBE
  formatearlos con la moneda del país.
- **R5.** CUANDO el panel de totales de la corrección del resultado pinta efectivo, SINPE,
  transferencia, el total general y, si lo hay, el neto, el sistema DEBE formatearlos con la moneda
  del país.
- **R6.** CUANDO la sección del pago al mensajero pinta el pendiente de liquidar, o avisa que un pago
  se registró o se anuló, el sistema DEBE escribir esos importes con la moneda del país.
- **R7.** CUANDO la corrección de los métodos de pago de una gestión avisa que el desglose no puede
  cuadrar por céntimos, los importes del aviso DEBEN ir en la moneda del país.
- **R8.** SI un llamador pide el aviso de cuadre, o los avisos de pago registrado o anulado, sin
  pasarles una moneda, ENTONCES el typecheck DEBE rechazarlo.
- **R9.** CUANDO el formulario de indemnización al aprobar un cierre anuncia el tope del monto (en la
  ayuda y en el error de exceso), el sistema DEBE pintar el tope con la moneda del país, sin cuadrarlo
  al alza. El tope anunciado, tecleado sin separadores de miles, DEBE ser aceptado por el validador
  del monto.

### Descargas de cierres del admin (P2)

- **R10.** CUANDO el usuario genera una descarga de cierres del admin o abre su selector de columnas,
  cada encabezado que hoy nombra el impuesto DEBE decir, donde hoy dice «IVA», la palabra
  «impuesto» seguida del nombre del impuesto del país entre paréntesis: «Impuesto (IGV) del flete»,
  «Flete + impuesto (IGV)», «De eso, impuesto (IGV)». «Impuesto» va con mayúscula solo cuando abre el
  encabezado. Son los nueve encabezados de la tabla de `design.md §6.1`. Las claves de columna, su
  orden, la preferencia de columnas guardada y las celdas NO DEBEN cambiar.
- **R11.** Los archivos que declaran las columnas de las descargas de cierres del admin NO DEBEN
  escribir «IVA» a mano fuera de los comentarios. Sus encabezados con impuesto DEBEN salir de una
  sola fuente, la misma que usa R10, y NO DEBEN depender de los rótulos de pantalla de
  `cierre-labels.ts`.

### Costa Rica, caídas y lo que no cambia

- **R12.** MIENTRAS la empresa sea de Costa Rica, lo que pintan R1–R9 DEBE ser idéntico, carácter a
  carácter, a lo de antes de esta ficha. Los encabezados de R10 DEBEN ser, en Costa Rica, los de R10
  con «IVA» entre paréntesis («Impuesto (IVA) del flete»), y todo encabezado de las descargas sin
  impuesto DEBE quedar idéntico al de antes.
- **R13.** MIENTRAS una pantalla o una descarga de esta ficha se arme sin los datos del país (montada
  sola en un test, o fuera del portal), el sistema DEBE usar la moneda y el rótulo de la plataforma
  (SLT-235 R15): los encabezados de R10 dicen «impuesto (IVA)».
- **R14.** El sistema NO DEBE cambiar en esta ficha:
  - las cifras, las sumas, las restas ni la validación de los montos;
  - las claves y nombres internos con «iva» (`fleteConIva`, `ivaFacturado`…);
  - las celdas de las descargas ni el texto de la tarifa de la descarga «Gestiones» (P3);
  - el código que no monta ninguna pantalla (P1);
  - los rótulos de pantalla con «IVA» de `cierre-labels.ts` y `cierre-detalle-shared.tsx`, que pinta
    `components/private/cierres/**` (P3);
  - los archivos de `components/private/cierres/**`, de la wallet y de plataforma;
  - los encabezados de la descarga de órdenes (SLT-240 R16);
  - el texto de los mensajes del tope, salvo el importe.

### Guardias

- **R15.** Los archivos de pantalla que esta ficha deja sin formateador implícito DEBEN entrar en el
  censo de SLT-235 R18. Esos archivos no llaman a `money(`, `moneyTope(` ni a los demás formateadores
  implícitos, no leen `monedaConfig` más allá de `.locale`, no leen el país por una acción y no usan
  `localStorage`.
- **R16.** Al cerrar esta ficha, ninguna entrada de la lista de excepciones de `pais-sin-literales`
  DEBE estar a nombre de SLT-243, y `TOPE_EXCEPCIONES` NO DEBE pasar de 12.

### Cobertura de las decisiones cerradas

| Decisión | R |
|---|---|
| Rebanada 5 del corte de SLT-235; cada rebanada se mergea sola y baja sus excepciones | R12, R13, R16 |
| Moneda explícita: proveedor y hook, cada pantalla pasa la moneda al formateador | R1–R9, R15 |
| País sin moneda o lectura que falla: plataforma + log, la página no falla | R13 |
| Sin token ni `localStorage`; consulta única + memo de 10 min | R15 |
| `monto-cliente.ts` fuera (SLT-238) | R14 (no cambia la validación ni lo que se teclea) |
| Pantallas de plataforma fuera (SLT-237) | R14; el reviewer lo mira en el diff |
| Heredadas de SL-21: nombres internos con «iva» sin renombrar; OpenAPI sin cambios | R10, R14 |
| `FichaQueLoRetira` y `FICHAS_ADMITIDAS` no se tocan (SLT-240 P2) | R16 |
| `mensajeDeCuadre` con la moneda obligatoria en SLT-243 (SLT-235 design §12, alternativa 4) | R7, R8 |
| P1: el código sin montar no se migra; solo `TotalesPanel` | R5, R14 |
| P2: los encabezados de las descargas entran, con la forma «impuesto (<nombre>)» | R10, R11, R12, R13 |
| P3: rótulos que solo pinta `components/private/cierres` y texto de la tarifa → SLT-244 | R14 |

## Preguntas abiertas

P1–P4 se cerraron el 2026-11-23; se dejan abajo como registro.

- **P4 (cerrada 2026-11-23: el humano acepta 33/40 en un solo PR; no se corta). La ficha ya no cabe en un PR: ¿se corta en dos?**
  - Con la forma de P2, los encabezados de descarga cambian también en Costa Rica. Eso obliga a
    actualizar los encabezados esperados de 8 suites de descarga y de `e2e/cierres-rediseno.spec.ts`.
  - Total: 33 archivos (20 de producción, 13 de tests), el 82,5% de `gate.tamano_pr` (40). El
    umbral es el 80% (32).
  - **Propuesta (`docs/specs.md > Partir una feature`), dos rebanadas verticales que se mergean solas:**
    - **SLT-243 (esta):** importes en pantalla, aviso de cuadre, pago al mensajero, tope de la
      indemnización y guardias. R1–R9, R13–R16, y R12 sin la parte de encabezados. 17 archivos (13 de
      producción, 4 de tests).
    - **Ficha nueva «Encabezados con impuesto en las descargas de cierres del admin»:** R10, R11 y la
      parte de descargas de R12–R14, con design §6.0–§6.2 tal cual. 16 archivos (7 de producción,
      9 de tests). Depende de SLT-243 (toca `CierresAdminModule.tsx`, `CierresBodegaAdminModule.tsx`
      y `ConsolidacionBodegaModule.tsx` en otro sitio).
  - Alternativa sin cortar: que el humano acepte 33 archivos de forma explícita.

- **P1 (cerrada el 2026-11-23: no). ¿Se migra el código de cierres que ya no monta ninguna pantalla?**
  - Qué es: la mayor parte de `cierre-factura.tsx` (unas 45 llamadas a `money(` y los textos con
    «IVA» de la liquidación) y los componentes sin montar de `cierre-detalle-shared.tsx`, más
    `desglose-pago.ts` y las notas con «IVA» que solo usa ese código.
  - Por qué no lo monta nadie: lo dicen las guardias `cierre-detalle-superficies` y
    `cascada-central-en-las-dos-pantallas`, y SLT-146 «Podar cierre-factura.tsx de lo que quedó sin
    montar» (`pending`) es la ficha que lo borra.
  - **Recomendación: no.** Migrarlo cuesta unas 300 líneas de producción que nadie ve y que SLT-146
    va a borrar. Ningún usuario de otro país lo vería.
  - El precio: `cierre-factura.tsx` y `cierre-detalle-shared.tsx` no entran en el censo de R15
    hasta SLT-146. Este spec está escrito con la recomendación. Si el humano dice «sí», se suman
    `cierre-factura.tsx` y `desglose-pago.ts` (unos 27 archivos en total, todavía por debajo del 80%).
- **P2 (cerrada el 2026-11-23: sí, con la forma «impuesto (<nombre>)»). ¿Entran los encabezados con
  «IVA» de las descargas de cierres del admin?**
  - Respuesta literal del humano: «impuesto(nombredel impuesto)». Interpretación escrita en
    design §6.1, con el antes/después de cada encabezado, para confirmarla al aprobar el spec.
  - Hay cuatro archivos de columnas en `cierres-admin/_components/` que escriben «IVA» en
    encabezados (`IVA del flete`, `De eso, IVA`, `IVA facturado`…). La hoja fundida los toma de
    `cierre-labels.ts`.
  - **Recomendación: sí.** SLT-240 hizo lo mismo con la descarga de órdenes (su R16), y la
    description de la ficha dice «rótulos «IVA» … en cierres-admin/**».
  - (Propuesta original, ya superada: «Flete + IGV», «IGV del flete», sin cambio en Costa Rica.)
  - Consecuencia de la forma elegida: el encabezado cambia también en Costa Rica, así que las ocho
    suites de tests de descarga y `e2e/cierres-rediseno.spec.ts` actualizan los encabezados que
    esperan (no las celdas). Ver design §6 y `tasks.md > Tamaño`.
- **P3 (cerrada el 2026-11-23: los hace SLT-244). Frontera con SLT-244 «Moneda e impuesto del país
  en pantallas: componentes de cierres».**
  - Qué entra en la pregunta:
    - los rótulos `IVA_FLETE_LABEL`, `IVA_COMISION_LABEL`, `IVA_FLETE_RECHAZO_LABEL`,
      `ivaFleteNoEntregaLabel`, `fleteDevConIvaDeGestion` y `FLETE_NO_ENTREGADAS_CON_IVA_LABEL`.
      Viven en archivos de `cierres-admin/`, pero solo los pinta `components/private/cierres/**`;
    - el texto de la tarifa de la descarga «Gestiones» («Monto fijo ₡3.500 · …», «2 % de
      ₡25.000 · …»), que se arma con `porcentajeDe` de `fila-gestion-labels.ts`.
  - **Recomendación: que los haga SLT-244, que es quien los pinta.**
    - Esta ficha deja las funciones de impuesto que SLT-244 puede reutilizar:
      `rotuloFleteDevConImpuesto` y los encabezados de §6.
    - Partir el texto de la tarifa dejaría la celda a medias: «Monto fijo €3 500» junto a
      «2 % de ₡25.000».

## Decisiones cerradas (no reabrir)

Heredadas de SLT-235 (`specs/SLT-235-moneda-pais-pantallas/requirements.md > Decisiones cerradas`) y
de las rebanadas SLT-240 a SLT-242. Esta ficha no las reabre.

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-20 | ¿Cabe en un PR? (SLT-235) | Corte en 8 rebanadas; esta es la 5 (cierres del admin). Cada rebanada baja sus entradas de la lista de excepciones de `pais-sin-literales`. |
| 2026-11-20 | ¿Moneda explícita o leída de un contexto global? | Explícita: proveedor y hook, y cada pantalla pasa la moneda al formateador. Sin default a CRC. |
| 2026-11-20 | País sin moneda o lectura que falla | La pantalla cae a `MONEDA_PLATAFORMA` (y al rótulo de la plataforma) y deja un aviso en el log; la página no falla. |
| 2026-11-20 | ¿Token, caché o carga por pantalla? | Sin token ni `localStorage`; consulta única del país y memo de 10 min en el servidor (SLT-235). |
| 2026-11-20 | `components/shared/monto-cliente.ts` | Fuera: los céntimos al teclear son de SLT-238. |
| 2026-11-20 | Pantallas de plataforma | Fuera: son de SLT-237. |
| 2026-11-20 | Heredadas de SL-21 | Los nombres internos con «iva» no se renombran; la OpenAPI no cambia. |
| 2026-11-20 | `mensajeDeCuadre` (SLT-235 design §7 y §12, alternativa 4) | Opcional y transitorio hasta SLT-243, que lo vuelve obligatorio. |
| 2026-11-20 | `FichaQueLoRetira` y `FICHAS_ADMITIDAS` (SLT-240 P2) | No se tocan: se limpian cuando cierre la última rebanada del corte de SLT-235. |
| 2026-11-23 | P1: ¿se migra el código de `cierre-factura.tsx` / `cierre-detalle-shared.tsx` que no monta ninguna pantalla? | No. Solo se migra `TotalesPanel`; el resto lo borra SLT-146. |
| 2026-11-23 | P2: ¿entran los encabezados con «IVA» de las descargas de cierres del admin? | Sí, con la forma «impuesto (<nombre del impuesto del país>)»: «Impuesto (IGV) del flete», «Flete + impuesto (IGV)». En Costa Rica, «Impuesto (IVA) del flete». |
| 2026-11-23 | P3: rótulos de `cierres-admin` que solo pinta `components/private/cierres` y texto de la tarifa de la descarga «Gestiones» | Van a SLT-244. |
