# SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)» — design

## Lo que ya existe

**Términos buscados:**
- board (`feature_list.json`, todos los estados): «detalle del cierre», «Le queda a la
  empresa», «verFulfillment», «Por revisar», «pestañas por tipo», «Incidente de /cierre-dia»;
- `specs/`: «un solo componente», «fila desplegada», «Ver cómo se calculó», «Le queda a la
  empresa»;
- código: `cierre-detalle-shared`, `CierreFacturaDetalle`, `CascadasCierreMensajero`,
  `CierresBodegaAdminModule`, `GestionesPorResultado`, `verFulfillment`, `GANANCIA_DEBE_LABEL`,
  `ConciliacionAcciones`.

**Resultado:**
- **Board:** solo SLT-95. Ninguna ficha, viva ni cerrada, rediseña este modal. SLT-96
  «Consolidación de ₡0 no se puede marcar recibida» está `done` y toca `ConciliacionAcciones`:
  se reutiliza tal cual.
- **Specs:** nada que lo especifique. Las fichas previas que fijaron lo que este detalle pinta, y
  que esta feature respeta, son: 393 (cascadas de bodega), 395 (cascadas del mensajero), 396 (por
  tienda), 425 (rechazos de tienda), 431 (conciliación en lugar de aprobar bodega), 462
  (retención), 478 y 486 (fila y evidencias), 481 (fulfillment solo central), SL-39 (IVA aparte,
  «Le queda a la empresa») y SLT-56 (ajuste del pago). Ninguna de ellas es este rediseño.
- **Grafo:** el índice del worktree (`R-job-singularis-projects-servi_logistic-.worktrees-SLT-95-detalle-cierre-rediseno`)
  no existe todavía. Se exploró con Grep/Read sobre el worktree, que nace de `dev` (e9aa915f).

**Qué se reutiliza** (no se re-crea nada de esto):

| Pieza existente | Dónde | Uso en SLT-95 |
|---|---|---|
| `CascadaDinero`, `LineaCascada` | `cierres-admin/_components/CascadaDinero.tsx` | las cascadas de «Dinero» |
| `DesglosePorTienda`, `marcaDeVariasTiendas` | `DesglosePorTienda.tsx` | «Por tienda» y su umbral |
| `lineasCascadaCentral`, `lineasCascadaDueno` (hoy privadas) | `CierresBodegaAdminModule.tsx` | se exportan o se mueven a un archivo puro para reusarlas (B) |
| `EstadoCierreBadge`, `esMontoCero`, `esMontoNegativo`, rótulos `*_LABEL` | `cierre-detalle-shared.tsx` | cabecera, métodos en 0, signos |
| `estadoConciliacionDe`, `ESTADO_CONCILIACION_LABEL` | `cierre-labels.ts` | estado de bodega |
| `ConciliacionAcciones` | `components/shared/conciliacion/` | pie de bodega |
| `RetieneReprogramadasBadge`, `MarcaAjustado`, `BotonesEvidencia`, `VisorEvidencia` | `cierres-admin/_components/` | cabecera, fila |
| `PagoMensajeroSeccion` | idem | pestaña «Pago al mensajero» |
| `GestionesPorResultado` | `cierre-factura.tsx` | «Gestiones» en A1, sin tocarla |
| Diálogos de corrección, ajuste, rechazo, confirmación física e indemnización | `CierresAdminModule.tsx` y sus hijos | se siguen montando en el módulo; el detalle solo recibe callbacks |
| `hrefDetalleCierre` | `lib/utils/cierre-enlace.ts` | «Ver su cierre» |
| `money()` | formateador compartido | toda cifra |

## Zona

`frontend`, confirmada para A1, A2, B y C:
- **Pago del incidente en `/cierre-dia`:** el servidor ya deriva `pagoMensajero` para todas las
  gestiones (`CierreDiaService.listarCierreDia → derivarPagos`, incidente incluido). La tabla
  (`CierreDiaModule.tsx`, rama `incidente`) y su descarga (`filaDescargaDiaIncidente`)
  simplemente no lo pintan.
- **Títulos de Excel:** se declaran en `app/(app)/cierres-admin/_components/*-descarga-columnas.ts`,
  y cada fila del «Detalle» ya trae `ingresoEmpresa.tarifaModelo`.
- **`verFulfillment` en bodega:** el detalle de bodega solo lo sirve el servidor a
  `esAccesoTotal` (`CierresBodegaAdminService`, `forbidden` para el resto). Por eso basta con
  pasar `verFulfillment={audiencia === "admin"}` a la fila. Hoy no lo pasa y cae en su default
  `true`. Ningún dato sensible viaja a quien no debe.

Solo la rebanada D (PA2), si se aprueba, sería `fullstack`: lectura de
`cierre_detail_concepto` y `gestion_pago_congelado` en los repositorios del detalle, más los
derivados que falten, en el servicio.

## Modelo de datos, RLS y migraciones

Ninguno. No hay tablas, columnas, RLS ni migraciones, y por tanto no hay `down.sql`. Los
contratos `CierreDetalleAdminServiceResult` y `CierreBodegaDetalleServiceResult` no cambian.

## Autorización

Sin cambios: todo se sigue decidiendo en el servidor y baja por props.
- `page.tsx` calcula `audiencia`, `puedeRegistrarPago`, `puedeCorregirPagos`,
  `puedeCorregirResultado`, `puedeAjustarPagoMensajero` y `puedeConciliar`, como hoy.
- El detalle recibe esos permisos ya resueltos como presencia o ausencia de callbacks. No conoce
  roles.

## Datos que dependen del país

- **Moneda:** solo vía `money()` (config de país).
- **Métodos de pago:** sus rótulos salen de `METODO_LABEL`, como hoy.
- **Impuestos:** el IVA llega ya calculado del servidor. No hay geografía nueva.

## Diseño del componente

Carpeta nueva: `app/(app)/cierres-admin/_components/detalle-cierre/`. Se usa en un solo módulo,
así que se queda junto a la página, sin promoverla a `shared/` (`docs/architecture.md >
Componentes`).

| Archivo | Rebanada | Qué es |
|---|---|---|
| `detalle-cierre-vista.ts` | A1 (+A2, B) | **Módulo puro**, sin React, que traduce el resultado del servidor a la vista (ver abajo). |
| `detalle-cierre-labels.ts` | A1 | Rótulos nuevos: «Por revisar», nombres de las 4 cifras, pestañas, reparto, notas. Reusa los `*_LABEL` existentes cuando la cifra ya tiene nombre (regla 2). |
| `DetalleCierre.tsx` | A1 | El caparazón (ver abajo). |
| `CifrasCierre.tsx` | A1 | Las 4 tarjetas, con métodos y contexto. |
| `DineroCierre.tsx` | A1 (+B) | Reparto + cascadas + «Por tienda», por tipo. |
| `GestionesCierre.tsx` | A2 | Filtros por resultado y «Con señales», tabla, fila plegable. |
| `FilaGestionCierre.tsx` | A2 | Fila desplegada opción 2: 4 tarjetas 2x2 + «Ver cómo se calculó» + acciones. |
| `MensajerosCierreBodega.tsx` | B | Pestañas «Mensajeros» y «Conciliación». |

**`detalle-cierre-vista.ts`** reúne todo lo que se puede probar sin montar nada. Solo cuenta
cardinales; los importes pasan como referencias a los strings del servidor:
- `cifrasDe(detalle)`;
- `metodosVisibles(totales)`, con `esMontoCero`;
- `avisosPorRevisar(detalle)`;
- `pestanasDe(tipo, detalle, opciones)`;
- `senalesDe(gestion)`;
- `conteosPorResultado(gestiones)`.

**`DetalleCierre.tsx`** se monta sobre el `Dialog` de `components/ui`, no sobre `Modal`, porque
`Modal` pone su propio pie de confirmar y cancelar, y el canvas pide una cabecera con cierre (X)
y un pie de acciones propio. La rejilla es `flex-col` con `max-h-[calc(100dvh-2rem)]`:
- cabecera, «Por revisar», cifras y `tablist` llevan `shrink-0`;
- el `tabpanel` lleva `flex-1 min-h-0 overflow-auto`, y es el único scroll (R10);
- el pie lleva `shrink-0`.

El ancho sigue siendo el 75 % de siempre.

**Contrato:**

```ts
type DetalleCierreProps =
  | {
      tipo: "mensajero";
      detalle: DetalleAbiertoMensajero;          // el estado que hoy guarda CierresAdminModule
      audiencia: "admin" | "satelite";
      acciones: {                               // ausente = no se ofrece (R11, R24)
        onRechazar?: () => void; onAprobar?: () => void;
        onCorregirPagos?: (g) => void; onCorregirResultado?: (g) => void; onAjustarPago?: (g) => void;
        onVerEvidencia: (url: string) => void;
      };
      pagoMensajero?: ReactNode;                // la PagoMensajeroSeccion ya montada (R19), o nada
      onCerrar: () => void;
    }
  | {
      tipo: "bodega";
      detalle: DetalleAbiertoBodega;             // el estado que hoy guarda CierresBodegaAdminModule
      audiencia: "admin" | "satelite";
      conciliacion?: ReactNode;                 // ConciliacionAcciones ya montada (R11), o nada
      onVerEvidencia: (url: string) => void;
      onCerrar: () => void;
    };
```

Los diálogos (rechazo, confirmación física, indemnización, correcciones, ajuste) siguen viviendo
en los módulos, que ya tienen su estado y sus Server Actions. El detalle solo dispara callbacks.
Así A1 no mueve lógica de aprobación.

**Nombre accesible (R31).** El título visible es la identidad («Cierre de <mensajero>»,
«Cierre de bodega · <zona>»). Un prefijo `sr-only` «Detalle del cierre · » o «Detalle del
cierre de bodega · » mantiene el nombre del diálogo que usan los E2E (`getByRole("dialog", {
name: "Detalle del cierre" })`, que compara por subcadena). Los E2E que solo abren y aprueban no
cambian.

### De dónde sale cada cifra (R5, R12, R13, R20-R22)

| Cifra en pantalla | Campo del servidor (sin cambios) |
|---|---|
| Recaudado + métodos | `cierre.totales.{general,efectivo,simpe,transferencia}` |
| Se le paga hoy a la tienda / A la tienda hoy | `pagoTienda` (mensajero) |
| ganan en total | `ganaLaTienda` |
| Se lo cobra la empresa / Sale de lo recaudado | `cobradoSobreRecaudado` |
| Debe llegar a la central / A la central / Declarado | `paraLaCentral` (bodega) |
| Pago al mensajero / a mensajeros / A los mensajeros | `cierre.totalPagoMensajero` |
| Pago a la bodega / Gana la bodega satélite | `cierre.totalIngresoBodegaRechazos` |
| Flete por entregado + IVA, Comisión COD + IVA, Flete de no entregadas + IVA, Total facturado | `totalesIngreso.{fleteConIva,comisionConIva,fleteDevolucionConIva,total}` |
| − IVA | `ivaFacturado` |
| Le queda a la empresa | `netoEmpresa` |
| Por tienda | `partesPorTienda[].{recaudado,pagoTienda,ganaLaTienda}` |
| Mensajeros (bodega) | `cierres[].{totales.general,totalPagoMensajero,paraLaCentral,gestionesAjustadas}` |
| Conciliación | campos de la marca en `cierre` (los que hoy lee `ConciliacionAcciones`; T0.3 los verifica) |
| Fila: recibido, métodos | `montoRecibido`, `pagos[]` |
| Fila: cobro a la tienda y conceptos | `ingresoEmpresa.{total,flete,ivaFlete,comisionCod,ivaComisionCod,fleteDevolucion,ivaFleteDevolucion,fleteConIva,…}` |
| Fila: pago y ajuste | `pagoMensajero`, `ajustesPago[]` |
| Fila: fulfillment | `ingresoEmpresa.{fulfillment,ivaFulfillment}` |
| Fila: tarifa del modelo viejo | `ingresoEmpresa.tarifa` + `esCentral` + `*Origen` |

**Desaparece de la pantalla:** `ganancia` (y con ella «Debe», D3). Sigue viajando en el
contrato; no se toca el servidor.

**No existen hoy, PA2:** porcentajes del reparto, «IVA incluido» sumado, total del fulfillment
con IVA, tarifa por concepto del modelo nuevo, tarifa del pago al mensajero, fecha del cargo del
fulfillment y «Sin tarifa de pago» en admin. Por defecto, la barra de reparto se pinta como
leyenda con importes, sin anchos proporcionales. Se pinta cada IVA por concepto en «Ver cómo se
calculó», y el fulfillment con sus dos líneas, sin total.

### `/cierre-dia` (C)

- `CierreDiaModule.tsx`: la rama `incidente` de las columnas añade `columnaPago`, la misma de
  las demás secciones (R28). `COLUMNA_CAUSA_INCIDENTE` y la ausencia de indemnización no cambian.
- `cierre-dia-descarga-columnas.ts`: `filaDescargaDiaIncidente` y sus columnas añaden
  `pagoMensajero` (R29).

### Títulos de Excel (C)

`cierres-gestiones-fundida-descarga-columnas.ts` exporta `columnasGestionFundida(filas)`. Esta
función devuelve los mismos encabezados de hoy, salvo `fleteDevolucionConIva`, que pasa de
`FLETE_DEV_CON_IVA_LABEL` («Flete por devolución a origen + IVA») a
`FLETE_NO_ENTREGADAS_CON_IVA_LABEL`. El cambio solo aplica cuando todas las filas traen
`tarifaModelo === "nuevo"`.

`ingresoBodega` ya sale como `INGRESO_BODEGA_RECHAZOS_COL` = «Ingreso bodega», que es neutro, y
no cambia.

Los llamadores (`DescargarCierresButton` y su acción de detalle) piden las filas y después
construyen la config con esas columnas. El caso mixto se resuelve según PA6. Las **claves** no
cambian: los filtros de columnas guardados por el usuario siguen valiendo.

## Verificación de lo que ve el usuario

Regla del proyecto: el backend sin pantalla no es entrega, y hay que comparar con números.
- **E2E nuevo `e2e/detalle-cierre-rediseno.spec.ts`** (A1, y se amplía en A2 y B). Usa el
  escenario de `e2e/_escenarios/cierres.ts` con importes sembrados conocidos y abre el detalle
  como maestro. Lee las 4 cifras, los métodos visibles y las dos cascadas, y los compara con
  **literales** calculados a mano en el propio spec (`importe(…)`), no con la función que los
  genera.
- **Comprobaciones del mismo E2E:**
  - un método en 0 no aparece;
  - no existe ningún texto «Debe»;
  - el pie sigue visible tras desplazar el cuerpo (`boundingBox` dentro del viewport);
  - «Aprobar» funciona igual que hoy.
- **Identidades en pantalla:** `tests/components/DineroIdentidadesEnPantalla.test.tsx` se
  amplía con la superficie nueva: recaudado − cobrado sobre lo recaudado = se le paga hoy;
  facturado − IVA − pago − bodega = le queda. Se leen del DOM.
- **Antes de promover:** Carlos lo aprueba en Preview (memoria del proyecto). El leader
  adjunta capturas de un cierre real de mensajero y de bodega con sus cifras al lado de las del
  detalle actual.

## Inventario: qué se reemplaza y qué pruebas se ven afectadas

**Producción reemplazada en `/cierres-admin`.** Se deja de montar, pero no se borra (PA8):

| Ahora | Quién lo monta hoy | Después |
|---|---|---|
| Cuerpo del `<Modal title="Detalle del cierre">` | `CierresAdminModule.tsx` | `<DetalleCierre tipo="mensajero">` |
| `CascadasCierreMensajero` | idem | `DineroCierre` |
| `CierreFacturaDetalle` (audiencia admin) | idem | cifras + pestañas. Lo sigue montando `CierreDiaModule` con audiencia mensajero |
| Sección «Decisión del cierre» (Aprobar/Rechazar) | idem | pie de `DetalleCierre` |
| Cuerpo del `<Modal title="Detalle del cierre de bodega">` | `CierresBodegaAdminModule.tsx` | `<DetalleCierre tipo="bodega">` (B) |
| `TotalesPanel`, `TotalesIngresoPanel`, cascadas y desglose por cierre del día | idem | «Dinero», «Mensajeros» (B) |
| `GestionesPorResultado` | los dos módulos y `CierreFacturaDetalle` | A1 la monta dentro de «Gestiones»; A2 y B la sustituyen en admin por `GestionesCierre`. Sigue en `/cierre-dia` |

**E2E afectados (11).**
- Usan regiones o rótulos que desaparecen y hay que reescribir:
  - `e2e/cierres-admin.spec.ts`: región «Totales del cierre»;
  - `e2e/wallet-iva-aparte-sl39.spec.ts`: «Liquidación», «Debe», región «Lo que le queda a…»;
  - `e2e/ajuste-pago-mensajero-cierre.spec.ts`: región «Lo que le queda…» y el detalle de
    bodega;
  - `e2e/cierre-bodega-satelite.spec.ts`: región «Totales del cierre de bodega»;
  - `e2e/reglas-bloqueos-cierre.spec.ts`: «Totales del cierre».
- Solo abren el diálogo y pulsan «Aprobar». Se re-ejecutan y no deberían cambiar gracias al
  nombre accesible conservado:
  - `e2e/cierres-admin-rechazos-sla.spec.ts`;
  - `e2e/cierre-vencido-modelo.spec.ts`;
  - `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts`;
  - `e2e/tarifas-activacion.spec.ts`;
  - `e2e/tarifas-valor-propio-mensajero.spec.ts`;
  - `e2e/tope-intentos-por-empresa.spec.ts`.
- Para C: `e2e/cierre-dia.spec.ts` se re-ejecuta.

**Tests de componentes y guardias que montan el detalle del admin y pasarán a montar
`DetalleCierre`:**
- `tests/components/CierresAdminModule.test.tsx`
- `CierresAdminPagoMensajero.test.tsx`
- `CierresAdminIndemnizacion.test.tsx`
- `CierresAdminDeepLink.test.tsx`
- `CierresAdminConfirmacionFisica.test.tsx`
- `CierresAdminRetieneReprogramadas.test.tsx`
- `CierreMensajeroDetalleCascadas.test.tsx`
- `CierreMensajeroDesglosePorTienda.test.tsx`
- `CierreRechazosDeTienda.test.tsx`
- `CierreFacturaSinGestionar.test.tsx`
- `CierrePremioPendiente.test.tsx`
- `CorregirPagosCierre.test.tsx`
- `CorregirResultadoCierre.test.tsx`
- `cierre-detalle-ajuste-badge.test.tsx`
- `DineroIdentidadesEnPantalla.test.tsx`
- en B: `CierreBodegaDetalleCascadas.test.tsx`, `CierreBodegaDesglosePorTienda.test.tsx`,
  `CierreBodegaDetalleGestiones.test.tsx`, `CierresBodegaAdminRefresco.test.tsx`;
- guardias: `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts` (264/R30, 425/R14),
  `cascada-central-en-las-dos-pantallas.guardia.test.ts` (393/R38),
  `cierre-bodega-vocabulario.guardia.test.ts`, `factura-contraste.guardia.test.ts` e
  `impresion-flujo.guardia.test.ts`. Se adaptan **ampliando el censo** a la superficie nueva,
  nunca quitando lo que vigilan.

Que cada uno cambie o no depende de lo que afirma. El implementer lo confirma ejecutándolo en
T1.1 y anota en `progress/impl_SLT-95.md` cuáles tocó y por qué.

**No se tocan:** los tests que montan `CierreFacturaDetalle` o `GestionesPorResultado`
directamente, porque esos componentes no cambian:
- `CierreFacturaPapel`, `CierreFacturaFilaIncidente`, `CierreFacturaFechaCR`,
  `CierreDesgloseModeloNuevo`, `CierreIngresoBodegaModeloNuevo`, `CierreEvidenciasVarias486`,
  `CierreDetallePagos`, `ComprobanteMensajeroOrigenRechazo`, `CierreTarifaAplicada`,
  `CierreTarifaEspecial`, `CierreCobrosDeLaGestion`.

**Para C:**
- `tests/components/CierreDiaModuleIncidente.test.tsx`: su caso «la tabla de incidentes NO tiene
  columna de… ningún monto» se reescribe a «tiene la de pago y no la de indemnización»;
- `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts`;
- `tests/components/descarga/CierresAdminDescargaDetallada.test.tsx` y
  `CierresBodegaDescargaDetallada.test.tsx`, por los títulos.

## Alternativas descartadas

1. **Reescribir `CierreFacturaDetalle` en su sitio.** Esa hoja la monta también `/cierre-dia`
   con audiencia `mensajero`, y es la que se imprime (223). Cambiarla rediseña la pantalla del
   mensajero, que no entra, y arrastra la guardia de impresión y una docena de tests que hoy la
   protegen. Un componente nuevo deja intacta la hoja del mensajero.
2. **Dos componentes, uno por tipo, que compartan piezas.** Contradice D1 (opción A del canvas,
   decisión cerrada). Además deja dos caparazones que divergen en scroll, pie y «Por revisar»,
   que son justo las reglas que el canvas quiere iguales.
3. **Calcular en el cliente las cifras que faltan** (porcentajes, IVA incluido, fulfillment con
   IVA). Rompe la regla money-safe del repo: ni una operación aritmética sobre importes en
   pantalla (395, `liquidacion-money-safe`). Si Carlos las quiere, se derivan en el servidor
   (rebanada D).
4. **Mover los diálogos de aprobación dentro del componente nuevo.** Más reutilizable, pero
   mueve lógica de aprobar y rechazar en un PR que debía ser solo presentación. Se mantienen en
   los módulos y el detalle recibe callbacks.

## Dependencias de terceros

Ninguna nueva. Se usan las primitivas `Dialog` y `Badge` de `components/ui` (shadcn), que ya
están.
