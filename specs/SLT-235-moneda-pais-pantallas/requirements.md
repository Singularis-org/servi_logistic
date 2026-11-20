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

_Pendiente: los escribe spec_author (F1.2)._

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
