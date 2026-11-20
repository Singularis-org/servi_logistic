# SLT-235 — moneda-pais-pantallas · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SL-21 · **Rama:** `feature/SLT-235-moneda-pais-pantallas`
> (apilada sobre `feature/SL-21-moneda-impuestos-configurables`)
>
> **Alcance (rebanada 1 del corte):** la base para que las pantallas de la empresa formateen montos
> con la moneda de su país y escriban el nombre de su impuesto en lugar de «IVA»:
> - un proveedor en `app/(app)/layout.tsx` y su hook, con la moneda y el nombre del impuesto del país
>   de la empresa (sin consulta para el superadmin);
> - `PaisRepository.deLaEmpresa` en una sola consulta y el país de la empresa en memo por proceso,
>   compartido con las etiquetas de nivel de SL-20;
> - los componentes compartidos de monto (`PriceLabel`, `KpiValorAnimado`, `DesglosePagoField`,
>   `monto-cliente`), la vista previa de plantillas del navegador (`EnviarPlantillaWhatsappButton`,
>   `sinpe-preview-segmentos`, `ChatConversacion`), `mis-asignaciones`, `recepcion-satelite` y
>   `app/paquete/[numGuia]/page.tsx`.
>
> Para Costa Rica nada cambia a la vista.
>
> **Lo que NO entra:**
> - Órdenes, novedades e incidentes (con el PDF de etiquetas del navegador) → SLT-240 «Moneda del país en pantallas: órdenes, novedades e incidentes».
> - Tarifas, configuración, ranking y el texto «IVA 13.00» del historial de tarifas → SLT-241 «Moneda e impuesto del país en pantallas: tarifas, configuración y ranking».
> - Analítica (con `AnaliticaFinancieraService`) → SLT-242 «Moneda del país en pantallas: analítica».
> - Pantallas de cierres del admin → SLT-243 «Moneda e impuesto del país en pantallas: cierres del admin».
> - Componentes de cierres → SLT-244 «Moneda e impuesto del país en pantallas: componentes de cierres».
> - Wallet de la empresa (con `wallet-rotulos.ts` e `impuesto-rotulo.ts`) → SLT-245 «Moneda e impuesto del país en pantallas: wallet de la empresa».
> - Wallet de tiendas y del mensajero → SLT-246 «Moneda e impuesto del país en pantallas: wallet de tiendas y del mensajero».
> - Pantallas de plataforma de facturas, pagos y cobro de planes → SLT-237 «Planes: precio por moneda del país».
> - Editar moneda e impuesto en «Datos del país» → SLT-236 «Datos del país: editar moneda e impuesto».
> - Céntimos en la carga de órdenes → SLT-238 «Carga de órdenes con céntimos según la moneda del país».
> - Métodos de pago y SINPE → SL-22 «Métodos de pago configurables por país». Fechas `es-CR` → SLT-92 «Pantallas: fechas y teléfonos en la zona y el prefijo del país de la empresa».
>
> Sembrado por `/afinar-feature` el 2026-11-20. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Vocabulario:
- **Moneda del país / nombre del impuesto:** los que guarda el país de la empresa (SL-21 R1).
- **Moneda de la plataforma / rótulo de la plataforma:** `MONEDA_PLATAFORMA` (`lib/config/moneda.ts`)
  y `IMPUESTO_ROTULO` (`lib/constants/impuesto-rotulo.ts`), lo único que existía antes de SL-21.
- **Datos del país para pantallas:** las etiquetas de nivel (SL-20), la moneda y el nombre del impuesto
  del país de la empresa del usuario.
- **Pantallas de esta ficha:** `PriceLabel`, `KpiValorAnimado` en modo moneda, el desglose de pago
  (`DesglosePagoField`), el detalle de la asignación, los KPI del mensajero, las tarjetas de orden del
  mensajero (fila de monto, detalle y mosaico), el chat del mensajero, el detalle y la tarjeta de la
  recepción en satélite, y `/paquete/[numGuia]`.
- **Vistas previas de plantilla:** la del botón «Enviar plantilla», la del chat del mensajero y la
  del mensaje SINPE.
- **País de prueba:** uno de `XA`–`XZ` con una moneda distinta en todo de la de CR
  (`MONEDA_DE_PRUEBA` de SL-21) y otro nombre de impuesto.

### Datos del país en el portal

- **R1.** CUANDO se pinta una página del portal autenticado (`app/(app)/`) para un usuario de empresa,
  el sistema DEBE entregar a sus pantallas los datos del país para pantallas de esa empresa, resueltos
  en el servidor al pintar la página. Ninguna pantalla DEBE leerlos por su cuenta ni guardarlos en el
  navegador.
- **R2.** MIENTRAS el usuario no tenga empresa (superadmin), el sistema DEBE entregar las etiquetas
  neutras, la moneda de la plataforma y el rótulo de la plataforma, sin consultar ningún país.
- **R3.** SI el país de la empresa no tiene moneda, ENTONCES las pantallas DEBEN usar la moneda de la
  plataforma, el sistema DEBE dejar un aviso en el log que nombre la empresa y el país, y la página NO
  DEBE fallar.
- **R4.** SI el país de la empresa no tiene nombre de impuesto, ENTONCES las pantallas DEBEN usar el
  rótulo de la plataforma, el sistema DEBE dejar un aviso en el log que nombre la empresa y el país,
  y la página NO DEBE fallar.
- **R5.** SI la lectura del país de la empresa falla o no encuentra país, ENTONCES las pantallas DEBEN
  recibir las etiquetas neutras, la moneda de la plataforma y el rótulo de la plataforma, el error
  DEBE quedar en el log, y la página NO DEBE fallar.

### Lectura y memoria del país

- **R6.** CUANDO se lee el país de una empresa por su id, el sistema DEBE hacerlo en una sola consulta
  a la base y devolver el país de esa empresa, o nada si la empresa no es visible en el contexto de
  quien lee.
- **R7.** CUANDO se piden los datos del país para pantallas de una empresa cuyo país se leyó en el mismo
  proceso hace menos de 10 minutos, el sistema DEBE responder sin consultar la base. CUANDO han pasado
  10 minutos o más, DEBE volver a leerlo.
- **R8.** El sistema NO DEBE responder a una empresa con el país memorizado de otra empresa, y NO DEBE
  memorizar una lectura que falló ni una empresa sin país.
- **R9.** MIENTRAS la memoria tenga 1 000 entradas o más, el sistema DEBE quitar las caducadas antes de
  escribir una nueva.
- **R10.** SI al país le falta la moneda o el nombre del impuesto, ENTONCES el aviso de R3 o R4 DEBE
  salir una vez por cada lectura de la base, no en cada página.

### Importes en pantalla

- **R11.** CUANDO una pantalla de esta ficha pinta un importe, DEBE formatearlo con la moneda del país
  de la empresa que entregó R1, con las reglas de formato de SL-21 R8. Incluye el mensaje de cuadre
  del desglose de pago.
- **R12.** CUANDO `KpiValorAnimado` anima un importe, el último fotograma DEBE dar el mismo texto que
  el formateador con la moneda del país, también con una moneda de 0 decimales.
- **R13.** CUANDO el navegador arma una vista previa de plantilla, cada importe DEBE salir en la moneda
  del país de la empresa, con el mismo texto que el servidor enviaría para esos datos (SL-21 R10).
- **R14.** CUANDO se abre `/paquete/[numGuia]`, el monto a cobrar DEBE salir en la moneda del país de la
  empresa del usuario. Sin empresa, en la moneda de la plataforma y sin consultar ningún país. Con
  las mismas caídas de R3 y R5.
- **R15.** MIENTRAS un componente compartido de monto se pinte fuera del portal autenticado (sin los
  datos de R1), DEBE usar la moneda de la plataforma; y la lectura del nombre del impuesto, el rótulo
  de la plataforma.
- **R16.** MIENTRAS la empresa sea de Costa Rica, lo que pintan las pantallas y las vistas previas de
  R11–R14 DEBE ser idéntico a lo de antes de esta ficha.
- **R17.** CUANDO una pantalla del portal pide el nombre del impuesto, el sistema DEBE darle el del país
  de la empresa. Esta ficha NO DEBE cambiar ningún texto «IVA» de pantalla: los cambian SLT-241 y
  SLT-243 a SLT-246.

### Guardias y lo que no cambia

- **R18.** Los archivos que esta ficha pasa a la moneda del país NO DEBEN llamar a los formateadores que
  usan la moneda de la plataforma sin nombrarla (`money`, `moneyTope`, `formatMonto`,
  `formatMontoString`, `formatMontoTope`, `montoExacto`) ni leer sus datos de moneda de `monedaConfig`.
  Su lista solo crece: cada rebanada (SLT-240 a SLT-246) añade los suyos.
- **R19.** `app/paquete/[numGuia]/page.tsx` DEBE salir de la lista de excepciones de
  `pais-sin-literales`, con el tope un número más bajo. Las entradas que sigan a nombre de SLT-235
  DEBEN pasar a la ficha de la rebanada que las retira.
- **R20.** El sistema NO DEBE cambiar en esta ficha:
  - las pantallas de plataforma de facturas, pagos y cobro de planes (siguen con la moneda de los
    planes);
  - las pantallas que no son de esta ficha (siguen con la moneda de la plataforma hasta su rebanada);
  - los nombres internos con «iva» ni el documento OpenAPI.

### Cobertura de las decisiones cerradas

| Decisión | R |
|---|---|
| Apilar sobre SL-21 | R11, R13 (usan `formatearMontoEn`, `FormatoMoneda` y `resolverValoresPlantilla` de SL-21) |
| Heredadas de SL-21 | R20 |
| ¿Cabe en un PR? (corte en 8) | R15, R18, R19, R20 |
| Moneda explícita | R11, R18 |
| Pantallas de plataforma «fila por fila» | R20 |
| País sin moneda o sin impuesto | R3, R4, R10 |
| Token, caché o carga por pantalla | R1, R2 |
| Consulta del país | R6 |
| Caché del país | R7, R8, R9 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-20 | Apilar sobre SL-21 | Se apila sobre su rama sin esperar su bloque 5 (humano). |
| 2026-11-20 | Heredadas de SL-21 | Facturas de planes en `MONEDA_DE_LOS_PLANES`; los nombres internos con «iva» no se renombran; la OpenAPI no cambia; la tasa sigue en cada tarifa (heredado de SL-21 > Decisiones cerradas). |
| 2026-11-20 | ¿Cabe en un PR? | No (~160 archivos). Corte en 8 rebanadas verticales: esta ficha es la 1 y las fichas SLT-240 a SLT-246 son las demás, todas con `depends_on` SLT-235. Cada una se mergea sola: hoy todas las empresas son de CR y su moneda es igual a la de la plataforma (SL-21 R9). Cada rebanada baja sus entradas de la lista de excepciones de `pais-sin-literales`. |
| 2026-11-20 | ¿Moneda explícita o leída de un contexto global? | Explícita: proveedor y hook, y cada pantalla pasa la moneda al formateador. Se descarta el estado de módulo, porque en el SSR mezcla empresas (SL-21 design §10). |
| 2026-11-20 | Pantallas de plataforma «fila por fila» | Las únicas con importes son las de facturas, pagos y cobro de planes: pasan a SLT-237. Esta ficha no toca pantallas de plataforma. |
| 2026-11-20 | País sin moneda o sin impuesto | La pantalla cae a `MONEDA_PLATAFORMA` (y al rótulo de la plataforma) y deja un aviso en el log; la página no falla. Mismo criterio que las etiquetas neutras de SL-20 en el layout. |
| 2026-11-20 | ¿Token, caché o carga por pantalla? | La sesión es una cookie opaca: no hay token donde guardarlo. La moneda va en el layout junto a las etiquetas de SL-20 (la usan casi todas las pantallas). No se carga bajo demanda por pantalla ni en `localStorage`: primer pintado equivocado, datos viejos por navegador y riesgo de mezclar empresas. |
| 2026-11-20 | Consulta del país | `PaisRepository.deLaEmpresa` pasa a una sola consulta (`pais.findFirst` con `organizaciones: { some: { id } }`, que Postgres resuelve como semi-join). Hoy son dos (`organizacion` y luego `pais`). No se activa `relationJoins` ni se escribe `$queryRaw`. |
| 2026-11-20 | Caché del país | Memo por proceso `organizacionId → PaisDTO` con caducidad de 10 min, mismo patrón que `lib/auth/empresa-de-la-peticion.ts`. Lo comparten etiquetas, moneda e impuesto. Un cambio de moneda tarda hasta 10 min en verse por instancia: el humano lo acepta como caso raro. |
| 2026-11-20 | `components/shared/monto-cliente.ts` (solo valida lo tecleado) | Sale del alcance: no se toca en esta ficha. Los céntimos al teclear son de SLT-238 (humano). |
| 2026-11-20 | Ejemplos «₡12.500» (`lib/types/plantilla-datos.ts`) y «₡322.900» (`lib/whatsapp-envios/informes/transito/informe.ts`) del catálogo de variables | Pasan a SLT-241 «Moneda e impuesto del país en pantallas: tarifas, configuración y ranking»: sus entradas en la lista de excepciones de `pais-sin-literales` cambian de dueño a SLT-241 (humano). |
