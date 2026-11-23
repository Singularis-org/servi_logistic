# SLT-242 — moneda-pantallas-analitica · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **Ruta:** completa · **depends_on:** SLT-235 (en `dev`)
> **Rama:** `feature/SLT-242-moneda-pantallas-analitica`, apilada sobre
> `feature/SLT-241-moneda-pantallas-tarifas` (PR #275, sin mergear).
>
> **Alcance (rebanada 4 de 8 del corte de SLT-235):** los importes de la analítica salen con la moneda
> del país de la empresa:
> - `app/(app)/analitica/**`: el tablero financiero (KPI, totales, gráficas y tablas), la conciliación
>   de cierres, la tabla de productos con su detalle de dinero y las tarjetas financieras (sección hoy
>   apagada, pero con código vivo);
> - el formateador de la analítica (`components/private/analytics/formato.ts`) y los componentes del
>   paquete que lo llaman con una unidad que puede ser dinero;
> - `AnaliticaFinancieraService`: el campo `moneda` de cada importe que devuelve, y la etiqueta de la
>   métrica del impuesto;
> - `lib/analytics/metrics.ts`: la palabra «IVA» escrita en la etiqueta y las descripciones del
>   catálogo;
> - las dos pistas con «IVA» del detalle de dinero por producto (`DineroProductoDetalle.tsx`), con el
>   nombre del impuesto del país (P1, cerrada por el humano el 2026-11-21).
>
> Salen de la lista de excepciones de `pais-sin-literales` las 2 entradas a nombre de SLT-242
> (`lib/analytics/metrics.ts` y `lib/services/AnaliticaFinancieraService.ts`), y su tope baja de 14
> a 12. Para Costa Rica nada cambia a la vista.
>
> **Lo que NO entra:**
> - Los conteos, porcentajes y duraciones de la analítica: siguen con `monedaConfig.locale`, que el
>   censo de SLT-235 admite. Las fechas (`ActualizarAnalitica`) → SLT-92 «Pantallas: fechas y teléfonos
>   en la zona y el prefijo del país de la empresa».
> - Reactivar la sección de finanzas de `/analitica` (comentada el 2026-08-18): se migra su código, no
>   se enciende.
> - Los ids y nombres internos con «iva» (`ingreso_iva`, `ingreso_iva_flete`…): no se renombran
>   (decisión heredada de SL-21).
> - La animación del KPI en moneda (`KpiValor`, `DECIMALES_DE_LA_CUENTA`): no cambia (design §5.3).
> - Otras rebanadas: SLT-240, SLT-241, SLT-243 a SLT-246; pantallas de plataforma → SLT-237.
>
> Inventario hecho con Grep el 2026-11-21 (`money`, `formatMonto*`, `monedaConfig`, `formatearValor(`,
> `₡`, `CRC`, `\bIVA\b`) sobre `app/(app)/analitica/**`, `components/private/analytics/**`,
> `lib/analytics/metrics.ts`, `lib/services/AnaliticaFinancieraService.ts`,
> `lib/actions/analitica-financiera.ts` y las 2 entradas de
> `tests/unit/guards/_pais-sin-literales-excepciones.ts` a nombre de SLT-242.

## Requisitos (EARS)

Vocabulario:
- **Moneda del país / nombre del impuesto del país:** los que entrega SLT-235 para la empresa del
  usuario: en pantalla, `useMonedaDelPais()`; en el servidor, los datos del país para pantallas
  (`PaisParaPantallas`), con sus caídas (SLT-235 R3–R5).
- **Moneda de la plataforma / rótulo de la plataforma:** `MONEDA_PLATAFORMA` e `IMPUESTO_ROTULO`
  («IVA»).
- **Reglas de formato:** las de SL-21 R8 (`formatearMontoEn`).
- **Formateador de la analítica:** `formatearValor` de `components/private/analytics/formato.ts`.
- **Importe de la analítica:** un valor que la analítica pinta con la unidad `moneda`.
- **Marcador de «sin importe»:** el que pinta hoy cada pantalla cuando no hay importe (`SIN_MONTO` en
  el formateador de la analítica, la raya larga en la tabla y el detalle de productos).
- **País de prueba:** una empresa con `MONEDA_DE_PRUEBA` (código `XTS`, «€», espacio de miles, punto
  decimal, 0 decimales) e impuesto «IGV».
- **Respuesta financiera:** lo que devuelve `consultarMetricaFinanciera` (`ResultadoFinanciero`).

### Importes en pantalla

- **R1.** CUANDO el tablero financiero o la conciliación de cierres pintan un importe de la analítica
  (el KPI y su línea del bruto, los totales del DTO, las gráficas, la tabla de detalle, los totales
  por método y las tres cifras del cuadre), el sistema DEBE formatearlo con la moneda del país y las
  reglas de formato. Sin importe, DEBE pintar el marcador de hoy.
- **R2.** CUANDO un componente del paquete de analítica (KPI, variación del KPI, gráficas de barras,
  líneas, dona, ranking y reparto, su alternativa textual y la tabla de resumen) pinta un valor con la
  unidad `moneda`, el sistema DEBE formatearlo con la moneda del país.
- **R3.** CUANDO la tabla de productos o el detalle de dinero de un producto pintan un importe (las
  celdas de dinero, las líneas apiladas, el detalle de la fila, «Pendiente de cierre: …» y los importes
  del detalle), el sistema DEBE formatearlo con la moneda del país y las reglas de formato. Sin
  importe, DEBE pintar la raya larga de hoy.
- **R4.** CUANDO las tarjetas financieras de la analítica pintan un importe, el sistema DEBE
  formatearlo con la moneda del país sin convertirlo a `number`.
- **R5.** CUANDO la analítica pinta un conteo, un porcentaje o una duración, el texto DEBE ser el
  mismo con la moneda del país que con la de la plataforma.
- **R6.** SI un llamador pide al formateador de la analítica un valor cuya unidad puede ser `moneda`
  sin pasarle una moneda, ENTONCES el typecheck DEBE rechazarlo. Con una unidad que no es `moneda`, la
  moneda NO DEBE ser obligatoria.

### Respuesta financiera (servidor)

- **R7.** CUANDO el servidor arma un importe de la respuesta financiera (total y filas de cada vista),
  su campo `moneda` DEBE ser el código de la moneda del país de la empresa de la sesión.
- **R8.** CUANDO la respuesta financiera lleva la métrica del impuesto, su etiqueta DEBE nombrar el
  impuesto del país («Ingreso por <impuesto>»). Las etiquetas de las demás métricas NO DEBEN cambiar.
- **R9.** CUANDO la acción de analítica financiera necesita la moneda o el nombre del impuesto del país,
  DEBE obtenerlos de los datos del país para pantallas de la empresa de la sesión (la lectura
  memorizada de SLT-235). NO DEBE leerlos si la entrada es inválida, si el acceso se deniega o si se le
  inyecta el servicio.
- **R10.** SI el país de la empresa no tiene moneda o nombre de impuesto, o su lectura falla, ENTONCES
  R7 y R8 DEBEN usar la moneda y el rótulo de la plataforma, el aviso o el error DEBE quedar en el log
  (SLT-235 R3–R5), y la consulta NO DEBE fallar por ello.

### Nombre del impuesto en el detalle de dinero por producto

- **R17.** CUANDO el detalle de dinero de un producto pinta sus pistas con el impuesto (la de lo que
  cobró la empresa, «flete + <impuesto> y comisión + <impuesto>», y la del flete por devolución a
  origen, «… + <impuesto> de las órdenes en …»), el sistema DEBE escribir el nombre del impuesto del
  país. Sin los datos del país, DEBE usar el rótulo de la plataforma. `DineroProductoDetalle.tsx` NO
  DEBE contener la palabra «IVA» fuera de los comentarios.

### Catálogo de métricas

- **R11.** El catálogo de métricas NO DEBE escribir a mano el nombre de un impuesto fuera de los
  comentarios: su etiqueta y sus descripciones DEBEN tomarlo de un solo rótulo. Las descripciones, que
  ninguna pantalla pinta, DEBEN seguir con el rótulo de la plataforma.

### Costa Rica, caídas y lo que no cambia

- **R12.** MIENTRAS la empresa sea de Costa Rica, lo que pintan las pantallas de esta ficha, el campo
  `moneda` («CRC»), las etiquetas y las descripciones del catálogo, las pistas de R17 (con «IVA») y las
  descargas de la analítica financiera DEBEN ser idénticos, carácter a carácter, a lo de antes de esta ficha.
- **R13.** MIENTRAS una pantalla de esta ficha se pinte sin los datos del país (fuera del portal, o
  montada sola en un test), el sistema DEBE usar la moneda de la plataforma (SLT-235 R15).
- **R14.** El sistema NO DEBE cambiar en esta ficha: las cifras, las sumas y las restas de la analítica;
  los ids y nombres internos con «iva»; el estado apagado de la sección de finanzas; la animación del KPI en moneda; ni los textos de pantallas que no
  son de esta ficha.

### Guardias

- **R15.** Los archivos de pantalla que esta ficha pasa a la moneda del país DEBEN entrar en el censo de
  SLT-235 R18: no llaman a los formateadores que usan la moneda de la plataforma sin nombrarla, no leen
  `monedaConfig` más allá de `.locale`, no leen el país por una acción y no usan `localStorage`.
- **R16.** Las 2 entradas de la lista de excepciones de `pais-sin-literales` a nombre de SLT-242 DEBEN
  salir de la lista, y `TOPE_EXCEPCIONES` DEBE bajar de 14 a 12. Al cerrar esta ficha ninguna entrada
  DEBE seguir a nombre de SLT-242, y la lista NO DEBE crecer.

### Cobertura de las decisiones cerradas

| Decisión | R |
|---|---|
| Rebanada 4 del corte de SLT-235; cada rebanada se mergea sola y baja sus excepciones | R12, R13, R16 |
| Moneda explícita: proveedor y hook, cada pantalla pasa la moneda al formateador | R1–R4, R6, R15 |
| País sin moneda o lectura que falla: plataforma + log, la página no falla | R10, R13 |
| Sin token ni `localStorage`; consulta única + memo de 10 min | R9, R15 |
| `monto-cliente.ts` fuera (SLT-238) | R14 (no se toca lo que se teclea; la analítica no tiene campos de importe) |
| Pantallas de plataforma fuera (SLT-237) | R14; el reviewer lo mira en el diff |
| Heredadas de SL-21: nombres internos con «iva» sin renombrar; OpenAPI sin cambios | R14 |
| `FichaQueLoRetira` y `FICHAS_ADMITIDAS` no se tocan (SLT-240 P2) | R16 |
| `AnaliticaFinancieraService.ts` y `metrics.ts` son de SLT-242 (SLT-235 design §8) | R7, R8, R11, R16 |
| P1: los «IVA» de `DineroProductoDetalle.tsx` entran en SLT-242 con `useImpuestoDelPais()` | R17, R12 |

## Preguntas abiertas

Ninguna. P1 (los textos «IVA» de `DineroProductoDetalle.tsx`) la cerró el humano el 2026-11-21 (ver
«Decisiones cerradas»).

## Decisiones cerradas (no reabrir)

Heredadas de SLT-235 (`specs/SLT-235-moneda-pais-pantallas/requirements.md > Decisiones cerradas`),
de SLT-240 y de SLT-241. Las fija el leader al lanzar este spec (2026-11-21):

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-20 | ¿Cabe en un PR? (SLT-235) | Corte en 8 rebanadas; esta es la 4 (analítica). Cada rebanada baja sus entradas de la lista de excepciones de `pais-sin-literales`. |
| 2026-11-20 | ¿Moneda explícita o leída de un contexto global? | Explícita: proveedor y hook, y cada pantalla pasa la moneda al formateador. Sin default a CRC. |
| 2026-11-20 | País sin moneda o lectura que falla | La pantalla cae a `MONEDA_PLATAFORMA` (y al rótulo de la plataforma) y deja un aviso en el log; la página no falla. |
| 2026-11-20 | ¿Token, caché o carga por pantalla? | Sin token ni `localStorage`; consulta única del país y memo de 10 min en el servidor (SLT-235). |
| 2026-11-20 | `components/shared/monto-cliente.ts` | Fuera: los céntimos al teclear son de SLT-238. |
| 2026-11-20 | Pantallas de plataforma | Fuera: son de SLT-237. |
| 2026-11-20 | Heredadas de SL-21 | Los nombres internos con «iva» no se renombran; la OpenAPI no cambia. |
| 2026-11-20 | Reparto de las excepciones de SLT-235 (design §8) | `AnaliticaFinancieraService.ts` y `metrics.ts` pasan a SLT-242. |
| 2026-11-20 | `FichaQueLoRetira` y `FICHAS_ADMITIDAS` (SLT-240 P2) | No se tocan: se limpian cuando cierre la última rebanada del corte de SLT-235. |
| 2026-11-21 | P1: los dos textos «IVA» de `DineroProductoDetalle.tsx` (líneas 86 y 106), que ninguna rebanada tenía | Entran en SLT-242 con `useImpuestoDelPais()`. Costa Rica sigue diciendo «IVA» (humano). |
