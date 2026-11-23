# SLT-244 — moneda-pantallas-componentes-cierres · requirements.md

> **Zona:** fullstack (en la práctica, solo pantallas y una descarga del navegador: no hay cambio de
> servidor) · **Complejidad:** high · **Ruta:** completa (dinero) · **depends_on:** SLT-235 (en `dev`)
> **Rama:** `feature/SLT-244-moneda-pantallas-componentes-cierres`, sobre `dev` (SLT-243 ya mergeada, #278).
>
> **Alcance (rebanada 6 de 8 del corte de SLT-235):** los importes y el nombre del impuesto que pintan
> los componentes de `components/private/cierres/**` salen con la moneda y el impuesto del país de la
> empresa. Esos componentes los montan `/cierres-admin` (cola de mensajeros y de bodega, consolidación,
> detalle único), `/cierre-dia` (cola propia y detalle del mensajero) y, por `Cuenta`, la conciliación
> del estado de cuenta de la satélite. Entran:
> - **la cola** (`ColaCierres`, `TablaColaPropia`): recaudado, pago al mensajero, ingreso de la bodega
>   por rechazos, lo que va a la central, lo que falta por recibir, los rechazos y el pendiente del pago;
> - **el detalle único** (`CifrasCierre`, `Cuenta`, `DineroCierre`, `MensajerosCierreBodega` y los
>   textos que arma `detalle-cierre-vista.ts`): cifras, desglose por método, cuentas, reparto, tabla por
>   tienda, pestaña «Mensajeros», texto del pie y nota del origen del ingreso de bodega;
> - **la fila de una gestión** (`FilaGestion` y los textos de `fila-gestion-vista.ts` y
>   `fila-gestion-labels.ts`): columnas, ganancia, tarjetas y «Ver cómo se calculó» (base de la tarifa
>   en porcentaje y porcentajes con el separador decimal de la moneda del país);
> - **los rótulos de pantalla con «IVA»** que pintan esos componentes, vivan en
>   `components/private/cierres/**` o en `cierres-admin/_components/` (lo que SLT-243 dejó aquí por su
>   P3; lista en `design.md §5`);
> - **el texto de la tarifa de la descarga «Gestiones»** del modelo nuevo («Monto fijo ₡3.500 · …»,
>   «2 % de ₡25.000 · …»), que se arma con piezas de `fila-gestion-labels.ts` (SLT-243 P3).
>
> Con esto se cierra el riesgo que dejó SLT-243: la marca «ajustado» de la fila ya salía en la moneda
> del país y el resto de la fila en la de la plataforma.
>
> **Para Costa Rica nada cambia a la vista** con la forma recomendada en P1 (el nombre del impuesto a
> secas). Si el humano elige otra forma en P1, cambia también Costa Rica y el tamaño (ver P1).
>
> **La lista de excepciones de `pais-sin-literales` no tiene ninguna entrada a nombre de SLT-244**
> (`tests/unit/guards/_pais-sin-literales-excepciones.ts`, tope 12, comprobado el 2026-11-23): esta
> rebanada no retira ninguna y el tope se queda en 12. La guardia mira archivos de servidor, y ninguno
> de esta ficha lo es.
>
> **Lo que NO entra:**
> - El código de `cierre-factura.tsx` y de `cierre-detalle-shared.tsx` que no monta ninguna pantalla
>   (SLT-243 P1). Las constantes que ese código lee (`FLETE_DEV_CON_IVA_LABEL`, `IVA_FLETE_LABEL`,
>   `ivaFleteNoEntregaLabel`, `fleteDevConIvaDeGestion`…) **conservan su texto** con «IVA»; los
>   componentes de esta ficha dejan de leerlas. Las borra SLT-146 «Podar cierre-factura.tsx de lo que
>   quedó sin montar».
> - Los encabezados de las descargas de cierres del admin: ya los hizo SLT-243 (forma «impuesto
>   (<nombre>)»). Esta ficha no los toca.
> - Las celdas de importe de las descargas, que ya salen crudas, sin símbolo.
> - Las fechas y horas en zona de CR (`fecha-cr`, `hora-cr`) → SLT-81 / SLT-92 «Pantallas: fechas y
>   teléfonos en la zona y el prefijo del país de la empresa».
> - El resto de la pantalla de conciliación de la satélite (`ConciliacionSatelite.tsx`, que llama a
>   `money(` por su cuenta): es de la wallet (SLT-245 / SLT-246). Solo cambia `Cuenta`, que ella monta.
> - `FichaQueLoRetira` y `FICHAS_ADMITIDAS`: se limpian en la última rebanada del corte (P3).
> - Los hallazgos menores H2–H4 de `progress/review_SLT-243.md`: caen en archivos de `cierres-admin`
>   que esta ficha no toca (`descargaColaCierres`…, `PagoMensajeroSeccion`). No se recogen.
>
> Inventario hecho con Grep el 2026-11-23 sobre `components/private/cierres/**` y sobre los archivos de
> `cierres-admin/_components/` que esos componentes importan. Patrones: `money(`, `moneyTope(`,
> `formatMonto`, `montoExacto`, `monedaConfig`, `₡`, `CRC`, `\bIVA\b`, `IMPUESTO_ROTULO`, `_IVA_`,
> `ConIva`, `porcentajeParaVerEnLaPlataforma`. Detalle en `design.md > Lo que ya existe`.

## Requisitos (EARS)

Vocabulario:
- **Moneda del país / nombre del impuesto del país:** los que entrega SLT-235 para la empresa del
  usuario. En pantalla salen de `useMonedaDelPais()` y `useImpuestoDelPais()`, con sus caídas
  (SLT-235 R3–R5, R15).
- **Moneda de la plataforma / rótulo de la plataforma:** `MONEDA_PLATAFORMA` e `IMPUESTO_ROTULO`
  («IVA»).
- **Reglas de formato:** las de SL-21 R8 (`formatearMontoEn`).
- **Separador decimal del porcentaje:** el de la moneda del país (SLT-241 R3, `porcentajeParaVer`).
- **Marcador de «sin importe»:** la raya larga que pinta hoy `money(null)` (`SIN_MONTO_RAYA`).
- **País de prueba:** una empresa con `MONEDA_DE_PRUEBA` (código `XTS`, «€», espacio de miles, punto
  decimal, 0 decimales) e impuesto «IGV».
- **Componentes de cierres:** los archivos de `components/private/cierres/**`.

### Importes en pantalla

- **R1.** CUANDO la cola de cierres (todas sus pestañas y tablas, y la cola propia del mensajero) pinta
  un importe, el sistema DEBE formatearlo con la moneda del país y las reglas de formato. Sin importe,
  DEBE pintar el marcador de «sin importe».
- **R2.** CUANDO el detalle de un cierre pinta sus cifras (con el desglose por método), las líneas de
  sus cuentas, el reparto de lo recaudado, la tabla por tienda o la pestaña «Mensajeros» del cierre de
  bodega, el sistema DEBE formatear cada importe con la moneda del país. Sin importe, DEBE pintar el
  marcador de «sin importe».
- **R3.** CUANDO el pie del detalle resume lo recaudado de un cierre de mensajero o lo declarado de un
  cierre de bodega, y CUANDO la cuenta «De lo facturado, le queda a la empresa» anota el origen del
  ingreso de la bodega (SLA y manual), los importes de esos textos DEBEN ir en la moneda del país.
- **R4.** CUANDO la fila de una gestión pinta los importes de sus columnas, su ganancia o sus tarjetas,
  el sistema DEBE formatearlos con la moneda del país.
- **R5.** CUANDO «Ver cómo se calculó» pinta una tarifa en porcentaje con su base («2 % de …») o un
  concepto del modelo viejo con su porcentaje y su base, la base DEBE ir en la moneda del país y el
  porcentaje con el separador decimal de la moneda del país.

### Impuesto en los rótulos de pantalla (P1)

- **R6.** CUANDO el detalle o la fila de una gestión pinta un rótulo que hoy nombra el impuesto, el
  sistema DEBE poner, donde hoy dice «IVA», el nombre del impuesto del país con la forma que cierre
  P1. Son los rótulos de la tabla de `design.md §5` (por ejemplo «Flete por entregado + IGV», «IGV
  (no es de la empresa)», «sin IGV, ya restados mensajero y bodega», «IGV flete», «IGV 18 %»).

### Descarga «Gestiones» (P2)

- **R7.** CUANDO el usuario genera la descarga «Gestiones» del modelo nuevo, el texto de la tarifa de
  cada concepto y del pago («Monto fijo <importe> · <origen>», «<n> % de <importe> · <origen>») DEBE
  escribir el importe del monto fijo y la base del porcentaje en la moneda del país, y el porcentaje
  con su separador decimal. Los dos textos DEBEN usar la misma moneda. Las demás celdas, las claves,
  el orden y los encabezados de la descarga NO DEBEN cambiar.

### Moneda e impuesto explícitos

- **R8.** SI un llamador arma un texto de los componentes de cierres que lleva un importe o el nombre
  del impuesto, o el libro de la descarga «Gestiones», sin pasar la moneda o el impuesto, ENTONCES el
  typecheck DEBE rechazarlo.

### Costa Rica, caídas y lo que no cambia

- **R9.** MIENTRAS la empresa sea de Costa Rica, lo que pintan R1–R6 y el texto de la tarifa de R7
  DEBEN ser idénticos, carácter a carácter, a los de antes de esta ficha.
- **R10.** MIENTRAS un componente de esta ficha se monte sin los datos del país (solo en un test, o
  fuera del portal), el sistema DEBE usar la moneda y el rótulo de la plataforma (SLT-235 R15).
- **R11.** El sistema NO DEBE cambiar en esta ficha:
  - las cifras, las sumas, las restas ni qué importe va en cada sitio;
  - las claves y nombres internos con «iva» (`fleteConIva`, `ivaFlete`…);
  - el texto de las constantes con «IVA» que lee el código sin montar (`FLETE_DEV_CON_IVA_LABEL`,
    `IVA_FLETE_LABEL`, `ivaFleteNoEntregaLabel(…)`, `fleteDevConIvaDeGestion(…)`…), ni ese código;
  - los encabezados de las descargas, ni las celdas de importe;
  - los archivos de la wallet, de plataforma y de órdenes.

### Guardias

- **R12.** Los archivos de esta ficha que quedan sin formateador implícito DEBEN entrar en el censo de
  SLT-235 R18 (no llaman a `money(`, `moneyTope(` ni a los demás formateadores implícitos, no leen
  `monedaConfig` más allá de `.locale`, no leen el país por una acción y no usan `localStorage`).
  Además, ningún archivo de `components/private/cierres/**` DEBE llamar a un formateador implícito.
- **R13.** Ningún archivo de `components/private/cierres/**` DEBE escribir «IVA» fuera de los
  comentarios, importar `IMPUESTO_ROTULO`, importar los rótulos con «IVA» de `cierres-admin` de la
  tabla de `design.md §5`, ni llamar a `porcentajeParaVerEnLaPlataforma`.
- **R14.** Al cerrar esta ficha, ninguna entrada de la lista de excepciones de `pais-sin-literales`
  DEBE estar a nombre de SLT-244, y `TOPE_EXCEPCIONES` NO DEBE pasar de 12.

### Cobertura de las decisiones cerradas

| Decisión | R |
|---|---|
| Rebanada 6 del corte de SLT-235; cada rebanada se mergea sola y baja sus excepciones | R9, R10, R14 |
| Moneda explícita: proveedor y hook, cada pantalla pasa la moneda al formateador | R1–R5, R7, R8, R12 |
| País sin moneda o lectura que falla: plataforma + log, la página no falla | R10 |
| Sin token ni `localStorage`; consulta única + memo de 10 min | R12 |
| `monto-cliente.ts` fuera (SLT-238) | R11 (no cambia qué importe va en cada sitio) |
| Pantallas de plataforma fuera (SLT-237) | R11; el reviewer lo mira en el diff |
| Heredadas de SL-21: nombres internos con «iva» sin renombrar; OpenAPI sin cambios | R11 |
| `FichaQueLoRetira` y `FICHAS_ADMITIDAS` no se tocan (SLT-240 P2) | R14 |
| SLT-243 P1: el código sin montar de `cierre-factura.tsx` / `cierre-detalle-shared.tsx` no se migra | R11, R13 |
| SLT-243 P2: encabezados de descarga con «impuesto (<nombre>)» (hechos en SLT-243) | R7, R11 (no se tocan) |
| SLT-243 P3: rótulos que solo pinta `components/private/cierres` y texto de la tarifa → SLT-244 | R5, R6, R7, R13 |

## Preguntas abiertas

Este spec está escrito con la recomendación de cada pregunta. Si el humano elige otra cosa, lo que
cambia está dicho en la pregunta.

- **P1. ¿Qué forma llevan los rótulos de pantalla con impuesto de los componentes de cierres?**
  - Hay dos formas en el repo:
    - **el nombre a secas** («Flete + IGV», «IGV del flete»): la del listado y la descarga de
      órdenes (SLT-240) y la que ya componen hoy estos rótulos con `IMPUESTO_ROTULO`
      («Flete por entregado + ${IMPUESTO_ROTULO}»);
    - **«impuesto (<nombre>)»** («Flete + impuesto (IGV)», «Impuesto (IGV) del flete»): la que el
      humano eligió el 2026-11-23 para los encabezados de las descargas de cierres del admin (SLT-243 P2).
  - **Recomendación: el nombre a secas.** En pantalla: «Flete por entregado + IGV», «IGV (no es de la
    empresa)», «IGV flete», «IGV 18 %».
    - Costa Rica no cambia, que es lo que pide la description de la ficha («Para Costa Rica nada
      cambia»).
    - Es la forma de los rótulos de pantalla de órdenes (SLT-240).
    - Coste: el detalle de un cierre dirá «Flete por entregado + IVA» y su descarga «Flete + impuesto
      (IVA)». Esa diferencia entre pantalla y descarga ya existe desde SLT-243.
  - **Si el humano elige «impuesto (<nombre>)»:**
    - cambia también Costa Rica («Flete por entregado + impuesto (IVA)»);
    - hay que actualizar los literales de unos 9 tests de pantalla (`FilaGestion`,
      `DetalleCierreDinero`, `CierreBodegaDetalleCascadas`, `fila-gestion-vista`,
      `detalle-cierre-vista`…) y 2 E2E (`cierres-rediseno.spec.ts`,
      `cierre-modelo-nuevo-plan-porcentual.spec.ts`);
    - la ficha pasa de 24 a unos 35 archivos, por encima del 80% (32), y habría que cortarla
      (propuesta: rótulos de impuesto en una ficha aparte, R6 y R13).
- **P2. ¿El texto de la tarifa de la descarga «Gestiones» pasa entero a la moneda del país?**
  - Hoy: «Monto fijo ₡3.500 · …» y «2 % de ₡25.000 · …», los dos con la moneda de la plataforma.
  - **Recomendación: sí, los dos textos con la moneda del país, y el porcentaje con su separador
    decimal** (R7): «Monto fijo €3 500 · …», «2 % de €25 000 · …». Es el mismo texto que pinta «Ver
    cómo se calculó» en pantalla (R5).
  - Migrar solo uno dejaría la columna con dos monedas según la fila (lo que SLT-243 P3 quiso evitar).
  - En Costa Rica no cambia nada.
- **P3. `FichaQueLoRetira` y `FICHAS_ADMITIDAS`: confirmar que no se tocan aquí.**
  - Ya lo cubre la decisión heredada (SLT-240 P2): se limpian en la última rebanada del corte.
  - **Recomendación: no se tocan.** `"SLT-244"` se queda en `FichaQueLoRetira` aunque no tenga
    ninguna entrada.
- **P4. ¿Se borra `porcentajeParaVerEnLaPlataforma`?**
  - SLT-241 la creó «para los textos que todavía no pasan a la moneda del país (la fila de gestión de
    cierres)». Con esta ficha se queda sin llamadores.
  - **Recomendación: sí, se borra**, y el caso que la prueba en `moneda-del-pais-tarifas.test.tsx`
    («R18: `porcentajeParaVerEnLaPlataforma` … sigue con la moneda de la plataforma») sale. Está
    contado en el tamaño.
  - Si el humano dice que no, se queda como código muerto y hay 2 archivos menos (22).

## Decisiones cerradas (no reabrir)

Heredadas de SLT-235 (`specs/SLT-235-moneda-pais-pantallas/requirements.md > Decisiones cerradas`) y
de las rebanadas SLT-240 a SLT-243. Esta ficha no las reabre.

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-20 | ¿Cabe en un PR? (SLT-235) | Corte en 8 rebanadas; esta es la 6 (componentes de cierres). Cada rebanada baja sus entradas de la lista de excepciones de `pais-sin-literales`. |
| 2026-11-20 | ¿Moneda explícita o leída de un contexto global? | Explícita: proveedor y hook, y cada pantalla pasa la moneda al formateador. Sin default a CRC. |
| 2026-11-20 | País sin moneda o lectura que falla | La pantalla cae a `MONEDA_PLATAFORMA` (y al rótulo de la plataforma) y deja un aviso en el log; la página no falla. |
| 2026-11-20 | ¿Token, caché o carga por pantalla? | Sin token ni `localStorage`; consulta única del país y memo de 10 min en el servidor (SLT-235). |
| 2026-11-20 | `components/shared/monto-cliente.ts` | Fuera: los céntimos al teclear son de SLT-238. |
| 2026-11-20 | Pantallas de plataforma | Fuera: son de SLT-237. |
| 2026-11-20 | Heredadas de SL-21 | Los nombres internos con «iva» no se renombran; la OpenAPI no cambia. |
| 2026-11-20 | `FichaQueLoRetira` y `FICHAS_ADMITIDAS` (SLT-240 P2) | No se tocan: se limpian cuando cierre la última rebanada del corte de SLT-235. |
| 2026-11-23 | SLT-243 P1: ¿se migra el código de `cierre-factura.tsx` / `cierre-detalle-shared.tsx` que no monta ninguna pantalla? | No. Lo borra SLT-146. |
| 2026-11-23 | SLT-243 P2: encabezados con «IVA» de las descargas de cierres del admin | Hechos en SLT-243 con la forma «impuesto (<nombre del impuesto del país>)». |
| 2026-11-23 | SLT-243 P3: rótulos de `cierres-admin` que solo pinta `components/private/cierres` y texto de la tarifa de la descarga «Gestiones» | Van a SLT-244 (esta ficha). |
