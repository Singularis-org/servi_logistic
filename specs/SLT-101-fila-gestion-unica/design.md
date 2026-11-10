# SLT-101 «Fila de gestión única y lista con filtros» — design

> 2026-11-09, actualizado el mismo día con las respuestas de Carlos (S3-1 a S3-6) y su corrección de
> los filtros. Baja a ejecutable el plan S3 del spec madre (`specs/SLT-95-detalle-cierre-rediseno/
> design.md > 3. Fila de una gestión`, `> Cifras nuevas`; `tasks.md > Plan de las demás rebanadas >
> S3`). Hereda de él, sin repetirlo, la arquitectura de los cuatro componentes, «De dónde sale cada
> cifra» y las alternativas descartadas 1-6. Aquí está solo lo que S3 decide.

## Lo que ya existe

**Términos buscados:**
- board (`feature_list.json`): «fila», «gestiones», «filtro», «señales», «Ver cómo se calculó»,
  «IVA incluido», «por tarifa», «fulfillment»;
- `specs/`: «Con señales», «Filtrar por resultado», «fila desplegada», «Ver cómo se calculó»,
  «Señales», «Cifras nuevas», «pago congelado»;
- código (Grep/Read; el grafo no tiene índice de este worktree, ver la nota final):
  `GestionesPorResultado`, `FilaGestion`, `DesgloseIngresoEmpresa`, `renderPagoMensajero`,
  `MarcaAjustado`, `BotonesEvidencia`, `BuscadorFiltros`, `FilterComponent`, `SegmentedToggle`,
  `EstadoConInfo`, `vuelveABodega`, `Cuenta`, `COLUMNAS_DESCARGA_DETALLE_CIERRE`,
  `toIngresoEmpresa`, `toPendienteRowDesdeSnapshot`, `ocultarFulfillmentSiNoCentral`,
  `fulfillmentCongeladoDe`, `ajustarPagoMensajeroEnCierre`, `pagosDelCierre`, `CATALOGO_CONCEPTOS`.

**Resultado:**
- **Board:** ninguna ficha hace esto. Las hermanas tocan otras superficies: SLT-102 «Cola de cierres
  única: mensajeros (central y satélite)» (la cola), SLT-103 «Diálogos del módulo de cierres y trato
  tú» (visor de evidencia), SLT-104 «Detalle de cierre de bodega en el detalle único (central)» y
  SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» (montan solo lectura y mensajero).
  SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment» **queda vacía** para la
  fila (ver «Qué le queda a SLT-110»).
- **Specs que fijaron lo que la fila pinta y S3 respeta:** 213 (desglose de métodos), 263 (rejilla
  y guía sin recorte), 337/338 (desglose de la tarifa congelada), 398 (corregir el resultado), 414
  (origen del rechazo), 456 (nombre de estado con su botón de información), 478 (fila en pestañas;
  incidente), 481 (fulfillment solo central), 486 (evidencias), SLT-52 (modelo nuevo: conceptos y
  pago congelados, R24 «un actor sin valor paga 0»), SLT-54 R62-R71, SLT-56 (ajuste del pago),
  SLT-94 (cobro del fulfillment por paquete, `orden_fulfillment_movimiento`).
- **Código que se reutiliza tal cual:**
  - `components/shared/BuscadorFiltros.tsx` + `components/shared/FilterComponent.tsx`: la barra de
    filtros de la app (S3-4), con `leerDeUrl={false}` en los dos y una prop aditiva en cada uno
    (abajo);
  - `components/private/cierres/detalle/Cuenta.tsx` (cascada de D16), con props aditivas;
  - `EstadoConInfo`, `MarcaAjustado`, `BotonesEvidencia` (hasta SLT-103), `DescargarDatasetButton`;
  - reglas y textos: `vuelveABodega`, `fleteDevConIvaDeGestion`, `fleteNoEntregaLabel`,
    `CAUSA_INCIDENTE_LABEL`, `RESULTADO_LABEL`, `METODO_LABEL`, `esMontoCero`, `money()`, los
    `*_LABEL` de `cierre-detalle-shared.tsx` y los de «Lo que se le factura a la tienda» de
    `detalle-cierre-labels.ts`; `COBRO_A_LA_TIENDA_COL`/`PAGO_AL_MENSAJERO_COL` de SLT-100;
  - servidor: `toIngresoEmpresa` (ya deriva con `Prisma.Decimal` el `total` y los `*ConIva`),
    `ocultarFulfillmentSiNoCentral` (ficha 481), `CONCEPTO_CONGELADO_SELECT`, la relación
    `GestionOrden.pagosCongelados`, `CATALOGO_CONCEPTOS`.
- **Lo que existe y no sirve tal cual:**
  - `GestionesPorResultado` + su `FilaGestion` privada: pestañas por resultado, sin señales ni
    tarjetas, con `esMensajero` en lugar de `audiencia`. Lo comparten bodega y `/cierre-dia`: no se
    toca (alternativa 1).
  - `DesgloseIngresoEmpresa`: dos columnas de auditoría. El canvas (D2) pide una tarjeta por
    concepto cobrado; se reescribe en `CalculoCobro`, con las mismas reglas de origen del flete.
  - `tarifaFaltante` en el admin llega siempre `false` (`toDetalleDTO`, parámetro por defecto).
  - El ajuste del pago (`ajustarPagoMensajeroEnCierre`) **solo** reescribe `pago_mensajero`; no toca
    `gestion_pago_congelado`. Por eso el importe congelado sigue siendo el «por tarifa» después de
    ajustar (resuelve la duda del madre, «Cifras nuevas > Pago por tarifa»).

## Fidelidad al canvas («sé fiel al diseño»)

Recorrido de `Fila2.dc.html` y de la lista de `Main.dc.html` (`enGestiones`, líneas 135-161 y
333-363) contra el spec anterior. **Corregido en esta versión:**

| # | Canvas | Spec anterior | Ahora |
|---|---|---|---|
| F1 | Filtros como pastillas a la vista, «Todas 19», sin paréntesis, sin buscador | `SegmentedToggle` con «Entregado (12)» | `BuscadorFiltros` sin buscador + `FilterComponent` `single` en presentación de pastillas; conteo tras un espacio (R84) |
| F2 | «Con señales» con borde y texto ámbar | sin tono | opción con `tono: "aviso"` |
| F3 | Cabecera desplegada: «solo datos de la orden» (Orden, Producto, Dirección) | + ubicación, nueva fecha, motivo, causa, origen, marca (R87) e indemnización/ingreso de bodega (R88) | solo los tres (R87, R88 retirados; PA6) |
| F4 | «de eso, IVA (no es de la empresa)» bajo el total del cobro | no se pintaba | R93 |
| F5 | Pago: «Por tarifa · <origen>», «− Ajuste», «Se le paga», y motivo/ajustó separados con raya punteada; borde ámbar e insignia «Ajustado» | solo «Se le paga» + notas | R95, R98 |
| F6 | Fulfillment: «+ IVA 13 %», «Se cobró» en negrita, «Se cargó al saldo de la tienda el <fecha>, una vez por paquete…»; tarjeta con borde punteado y fondo suave | sin total ni fecha | R94 |
| F7 | Cálculo: título = concepto, «Tarifa: grupo «…» de la zona …», «Monto fijo» / «2 % de ₡25.000,00», «+ IVA 13 %», total con el nombre del concepto | líneas sin tarifa en el nuevo; total sin nombre | R97 (nuevo); en el viejo, el total también lleva el nombre del concepto |
| F8 | Nota del cálculo con fecha **y hora** («07/11/2026 18:42») | solo fecha | R97 |
| F9 | Mensajero: señal «Sin tarifa» (no «Sin tarifa de pago») | «Sin tarifa de pago» para todos | R85 |
| F10 | Pago: sin marca «Sin tarifa» dentro de la tarjeta | marca de hoy en la tarjeta | solo la señal de la fila |
| F11 | «Descargar» en la misma fila que los filtros, a la derecha | «en la barra» | igual, explícito (R90) |

**Desviaciones que se conservan, con su motivo:**

| Canvas | Se pinta | Por qué |
|---|---|---|
| «Devolución» (filtro y fila) | «Devolución a origen por rechazo» | Ficha 456 y su guardia: un nombre por estado en toda la app. PA7. |
| Cabeceras «Cobro a tienda», «Pago mensajero» | «Cobro a la tienda», «Pago al mensajero» | Las aprobó Carlos en PA4 de SLT-100 para «Descargar»; D20 (una cifra, un nombre) las ata a la tabla. |
| Resultado como pastilla sola | pastilla con su botón de información (`EstadoConInfo`) | Ficha 456, vigilada por `estado-con-info.guardia`. |
| «Ver evidencia (2)» | un botón por foto (`BotonesEvidencia`) | Lo cambia SLT-103 «Diálogos del módulo de cierres y trato tú» (R54). |
| `aria-label="Ver detalle de la gestión"` | «Desglose de ingreso de la orden <remisión> · <destinatario>» | No se ve; conserva los nombres que leen 6 E2E (R89). |
| «Pago ajustado» también para el mensajero (lista de `Main`) | solo central, satélite y solo lectura | SLT-56 Q2: al mensajero no le llegan los ajustes. Lo retoma SLT-108 al montar esa audiencia. |
| «Tu ganancia» con «Por tarifa», «− Ajuste», insignia y motivo | mensajero sin ajustes (mismo motivo) | Ídem; con dobles, sin montar aquí. |
| Viejo (el canvas solo dibuja el nuevo) | sin «Por tarifa» ni «− Ajuste»; cálculo con los rótulos de hoy | R29 del madre; lo congelado del viejo no tiene pago congelado (R95). |

## Arquitectura

```
lib/ (servidor, S3-1)
  repositories/CierresAdminRepository.ts   select + mapper + 1 consulta nueva (cargos de fulfillment)
  services/CierresAdminService.ts          ficha 481 anula también los campos nuevos de fulfillment
  services/CierreDiaService.ts             toDetalleDTO: passthrough de pagoPorTarifa y tarifaFaltante
  interfaces/…/ICierreDiaService.ts        campos aditivos del DTO
  interfaces/…/ICierreDiaRepository.ts     campos aditivos de CierreGestionPendienteRow

components/private/cierres/fila/ (pantalla)
  GestionesCierre.tsx     lista: barra de filtros + Descargar + cabecera + filas + estado vacío
  FilaGestion.tsx         una gestión: fila cerrada y desplegada (datos, tarjetas, acciones)
  CalculoCobro.tsx        «Ver cómo se calculó»: una Cuenta por concepto cobrado
  fila-gestion-vista.ts   PURO: qué se ve por audiencia, señales, filtros, tarjetas, cálculo
  fila-gestion-labels.ts  textos nuevos (trato «tú») y origen de tarifa por nivel
```

Mismo patrón que `detalle/` (S1): el `.ts` puro **elige**; los importes son strings del servidor;
los `.tsx` solo pintan.

## Servidor: de dónde sale cada cifra (S3-1)

Todo en `CierresAdminRepository`, dentro de `findCierreByIdEnAlcance` y su mapper
`toPendienteRowDesdeSnapshot` / `toIngresoEmpresa`. Aritmética con `Prisma.Decimal` y salida
`.toFixed(2)`, como ya hacen `total` y los `*ConIva` (R92). **Sin migración, sin esquema nuevo:**
todas las columnas existen (`cierre_detail_concepto`, `gestion_pago_congelado`, `tarifa_valor`,
`zona`, `grupo_distritos`, `vehiculo`, `orden_fulfillment_movimiento`).

### Campos aditivos (todos opcionales en el tipo: los dobles de los tests de hoy no cambian)

```ts
// IngresoEmpresaDTO (+)
ivaIncluido?: string | null;            // R65, R93
fulfillmentConIva?: string | null;      // R65, R94 «Se cobró»
ivaPctFulfillment?: string | null;      // R94 «+ IVA 13 %»; null en el viejo
fulfillmentCargadoAt?: string | null;   // R65, R94 ISO del último cargo vigente
conceptosTarifa?: ConceptoTarifaDTO[];  // R64, R97; [] en el viejo
interface OrigenTarifaDTO { nivel: TarifaNivel; zonaNombre: string | null;
  grupoNombre: string | null; vehiculoNombre: string | null }
interface ConceptoTarifaDTO extends OrigenTarifaDTO {
  concepto: "flete" | "fleteDevolucion" | "comisionCod";   // a qué tarjeta va
  modo: "monto" | "porcentaje"; valor: string; ivaPct: string;
  base: string | null;                  // porcentaje: `montoCobrar` (catálogo: base «pedido»)
}
// CierreDetalleGestion / CierreGestionPendienteRow (+)
pagoPorTarifa?: PagoPorTarifaDTO | null;  // R66, R95
interface PagoPorTarifaDTO extends OrigenTarifaDTO {
  importe: string; modo: "monto" | "porcentaje"; valor: string; base: string | null;
  ajuste: { signo: "suma" | "resta"; monto: string } | null;
}
// tarifaFaltante: ya existe; el admin pasa de `false` fijo al valor de R96.
```

### Tabla de derivaciones

| Cifra (R) | Fuente y derivación | Capa |
|---|---|---|
| IVA incluido (R65, R93) | Σ de `ingreso_iva_flete`, `ingreso_iva_comision_cod`, `ingreso_iva_flete_devolucion` **presentes** en el `derivado` de `derivarIngresoOrden` que `toIngresoEmpresa` ya calcula; `null` si ninguno está presente. Es el mismo derivado que da `total`, así que no puede divergir. | repositorio (mapper) |
| Se cobró (R65, R94) | `fulfillment` + `ivaFulfillment` de `fulfillmentCongeladoDe`; `null` si `fulfillment` es `null`. | repositorio (mapper) |
| % IVA del fulfillment (R94) | modelo nuevo: `ivaPct` del concepto `tienda_fulfillment` de `d.conceptos`; viejo o sin fila: `null`. | repositorio (mapper) |
| Fecha del cargo (R65, R94) | **Consulta nueva**, una por detalle (no N+1), en el mismo `Promise.all`: `ordenFulfillmentMovimiento.findMany({ where: { ordenId: { in: <órdenes del cierre> } }, orderBy: [{ ordenId }, { secuencia: "desc" }], distinct: ["ordenId"], select: { ordenId, tipo, ocurridoAt } })`; por orden, `ocurridoAt` si el último es `cargo`, si no `null`. Las órdenes salen de `cierre_detail` del cierre ya filtrado por alcance. | repositorio (consulta + mapper) |
| Tarifa del concepto, nuevo (R64, R97) | `d.conceptos` ampliado con `tarifaValor: { zona.nombre, grupo.nombre }` (select local al detalle, sin tocar `CONCEPTO_CONGELADO_SELECT`, que usan otros). Uno por concepto cobrado salvo `tienda_fulfillment`; `concepto` según el resultado (`tienda_flete_entregado` → `flete`; `tienda_flete_<no entrega>` → `fleteDevolucion`; `tienda_comision_cod` → `comisionCod`). `base` = `montoCobrar` en porcentaje. | repositorio (select + mapper) |
| Pago por tarifa (R66, R95) | `GESTION_ADMIN_SELECT.pagosCongelados: { where: { actor: "mensajero" }, select: { modo, valor, base, importe, nivel, tarifaValor: { zona.nombre, grupo.nombre, vehiculo.name } } }`. Sin fila → `null`. | repositorio (select + mapper) |
| Ajuste (R95) | Con `pagoPorTarifa`, `ajustesPago` no vacío y `pagoMensajero` no nulo: `d = pagoMensajero − importe` (`Prisma.Decimal`); `d = 0` → `null`; si no, `{ signo: d > 0 ? "suma" : "resta", monto: |d| }`. | repositorio (mapper) |
| `tarifaFaltante` (R66, R96) | `tarifaModelo === "nuevo"` y `CATALOGO_CONCEPTOS` tiene concepto `mensajero_*` para `resultado` (hoy los cinco) y `pagosCongelados` vacío. Viejo: `false`. | repositorio (mapper); `toDetalleDTO` lo pasa tal cual |

**El cliente no deriva ninguna** (R71, guardia money-safe): solo elige qué línea mostrar según si el
campo es nulo, y formatea con `money()`.

### Alcance (organización y zona) en el `WHERE`

- **Zona/bodega:** `findCierreByIdEnAlcance` ya pone el alcance en el `WHERE` del `findFirst` del
  cierre y devuelve `null` si no casa; las consultas hijas van por `cierreId` (patrón documentado en
  ese método: «EL ALCANCE NO SE REPITE»). La consulta nueva va por `ordenId IN` las órdenes de
  `cierre_detail WHERE cierre_id = <ese cierre>`, así que no puede traer cargos de otra orden.
- **Pago congelado:** el filtro `actor = 'mensajero'` va en el `where` de la relación, no en
  memoria: una mutación que lo quite pinta el importe de la satélite (lo mata el test de T1.2).
- **Organización:** por RLS (SL-17), como todo el repositorio; las tres tablas leídas tienen
  `organizacion_id` y su política por empresa. No se añade un filtro de empresa a mano que el resto
  del repositorio no tiene.
- **Ficha 481:** `ocultarFulfillmentSiNoCentral` anula también `fulfillmentConIva`,
  `ivaPctFulfillment` y `fulfillmentCargadoAt` para quien no es acceso total (falla cerrado, como
  hoy). `conceptosTarifa`, `ivaIncluido` y `pagoPorTarifa` no son del fulfillment: viajan a la
  satélite como el resto del cobro (la satélite ya ve «Se le cobra» y «Ver cómo se calculó»,
  R25).

### Coste

Una consulta más por detalle (los cargos). Las otras dos lecturas son relaciones añadidas a selects
que ya se piden (Prisma: una consulta por nivel, no por gestión).

## Pantalla

### `GestionesCierre`

```ts
type AudienciaFila = "central" | "satelite" | "mensajero" | "solo lectura";

interface GestionesCierreProps {
  /** Ya en el orden de PA5/S3-5 (ORDEN_RESULTADOS y, dentro, el del servidor). */
  gestiones: readonly { gestion: CierreDetalleGestion; mensajeroNombre?: string }[];
  audiencia: AudienciaFila;
  quienMiraEsCentral: boolean;          // fulfillment en «solo lectura» (R25, R30)
  /** `solicitadoAt` del cierre: la nota de R97. `null` = no se pinta la fecha. */
  congeladoAt: string | null;
  acciones: AccionesFila;
  onVerEvidencia?: (url: string) => void;  // el visor de hoy; SLT-103 cambia la firma
  descargar?: ReactNode;                 // el `DescargarDatasetButton`, a la derecha de los filtros
  columnaMensajero?: boolean;            // R23 bodega (la monta SLT-104)
}
```

**Filtros (S3-4, R84, R89).** Una fila `flex` con, a la izquierda, la barra de la app y, a la
derecha, `descargar` (canvas `Main`, líneas 137-145):

```tsx
<BuscadorFiltros buscador={false} leerDeUrl={false} onChange={SIN_BUSQUEDA}>
  <FilterComponent
    leerDeUrl={false}
    debounceMs={0}
    filters={[{ key: "resultado", label: "Filtrar por resultado", kind: "single",
                presentacion: "pastillas", options: filtrosDe(gestiones, audiencia) }]}
    onChange={(sel) => setFiltro(sel.resultado?.[0] ?? "todas")}
  />
</BuscadorFiltros>
```

- `filtrosDe` da 7 `FilterOption` con `value` (`todas`, los 5 resultados, `con_senales`) y `label`
  «<nombre> <n>» (`textoFiltro`); «Con señales» lleva `tono: "aviso"`.
- **(a) URL:** `leerDeUrl={false}` en los dos (props existentes): la barra ni lee ni resta params,
  así que `?cierre=` y los filtros de la cola de `/cierres-admin` no se tocan (R84).
- **(b) Conteos:** van en el `label` de cada opción (prop existente) y se ven porque la presentación
  «pastillas» pinta todas las opciones, no un desplegable.
- Sin `filtros` en `BuscadorFiltros`: el selector «Filtros» no se monta (comportamiento de hoy).

Tabla: región «Órdenes del cierre» (R89), cabecera de `columnasDe(audiencia, columnaMensajero)` y
una `FilaGestion` por gestión filtrada; sin gestiones, `estadoVacioDe(filtro)` con `role="status"`.

### Props aditivas de la barra de filtros (S3-4)

Lo que `BuscadorFiltros` y `FilterComponent` **ya admiten** resuelve (a) y (b): `leerDeUrl`,
`debounceMs`, `children`, `FilterOption.label` libre. **No admiten** dos cosas que el canvas
dibuja; cada una entra como prop aditiva, apagada por defecto, sin cambiar a ningún consumidor:

| Componente | Prop | Sin la prop (hoy) | Con la prop |
|---|---|---|---|
| `BuscadorFiltros` | `buscador?: boolean` (default `true`) | campo de búsqueda + su línea de aviso | `false`: no monta el campo ni su `role="status"` reservado; «Limpiar todo» solo depende de `hayFiltrosAplicados` |
| `FilterComponent` → `FilterDef` | `presentacion?: "desplegable" \| "pastillas"` (default `"desplegable"`, solo `kind: "single"`) | `Select` | un `role="group"` con nombre `label` y un botón por opción, `aria-pressed`, forma de pastilla del canvas (activa en negro); elegir sustituye (R7 de hoy); sin valor elegido, la **primera** opción se marca activa |
| `FilterComponent` → `FilterOption` | `tono?: "aviso"` | — | solo en «pastillas»: borde y texto ámbar («Con señales») |

Tests que las cubren (nuevos; los de hoy no se tocan y siguen verdes como prueba de «sin la prop,
igual»): `tests/unit/components/buscador-filtros-sin-buscador.test.tsx` (sin la prop hay `searchbox`;
con `false` no hay campo ni aviso y los `children` se pintan; con `leerDeUrl={false}` no navega) y
`tests/unit/components/filter-component-chips.test.tsx` (grupo con nombre, 7 botones, `aria-pressed`,
emite `[valor]`, primera activa sin selección, `tono` aplicado; sin `presentacion` sigue el
`Select`). Guardias que deben seguir verdes sin cambios: `filtros-url-r25`,
`wallet-barra-unica-467`, `analitica-barra-filtros-sin-solape`, `vistas-superficies-declaradas`.

### `FilaGestion`

```ts
type AccionesFila = Partial<{
  corregirMetodos: (g: CierreDetalleGestion) => void;
  ajustarPago: (g: CierreDetalleGestion) => void;
  corregirResultado: (g: CierreDetalleGestion) => void;
  devolver: (g: CierreDetalleGestion) => void;
}>;
interface FilaGestionProps {
  gestion: CierreDetalleGestion; mensajeroNombre?: string;
  audiencia: AudienciaFila; quienMiraEsCentral: boolean; congeladoAt: string | null;
  acciones: AccionesFila; onVerEvidencia?: (url: string) => void;
}
```

**Cerrada** (rejilla `70px 1.7fr 110px 1fr 1fr 1fr 1.3fr 40px` del canvas; bodega y mensajero, las
de `Main`): guía (sin recorte, 263); destinatario · tienda; mensajero si va la columna; resultado con
`EstadoConInfo`; importes de `columnasDe` («—» si nulos, R86); señales (`textoSenales`, ámbar);
«Devolver a gestión» si hay callback; botón de desplegar con el nombre de R89.

**Desplegada:**
1. Cabecera `dl`: Orden (`numRemision`), Producto, Dirección. Nada más (F3).
2. Tarjetas en 2 columnas (D2), cada una una `Cuenta` (D16), en este orden:

   | Tarjeta | Líneas (strings del servidor) | Total | Extras |
   |---|---|---|---|
   | Recibió el mensajero | un `pagos[i]` por método sin los de 0 (`esMontoCero`); el primero sin operador, los demás «+» | «Recibió» = `montoRecibido` | `pie`: «Corregir métodos de pago» (R26) |
   | Se le cobra a la tienda | «Flete por entregado + IVA» `fleteConIva`; «+ Comisión COD + IVA» `comisionConIva`; «+ <rótulo por modelo> + IVA» `fleteDevolucionConIva`; solo los no nulos | «Se le cobra» = `ingresoEmpresa.total` | `aparte`: «de eso, IVA (no es de la empresa)» = `ivaIncluido` si no nulo (R93); `pie`: «Ver cómo se calculó» / «Ocultar cómo se calculó» (`aria-expanded`) |
   | Se le paga al mensajero / Tu ganancia | con `pagoPorTarifa`: «Por tarifa · <origen>» = `importe`; «− Ajuste»/«+ Ajuste» = `ajuste.monto` si hay | «Se le paga» = `pagoMensajero` | con ajuste: `insignia` = `MarcaAjustado` y `tono: "aviso"`; `notas`: «Motivo: «…»», «Ajustó <actorNombre> · <dd/MM HH:mm>» del último ajuste; `pie`: «Ajustar pago» (R26, R98) |
   | Fulfillment · se cobró al crear la orden | «Fulfillment» = `fulfillment`; «+ IVA <ivaPctFulfillment> %» = `ivaFulfillment` si `ivaPctFulfillment` no es nulo | «Se cobró» = `fulfillmentConIva` | `tono: "aparte"`; `pie`: «Se cargó al saldo de la tienda el <fecha>, una vez por paquete. No depende de esta gestión ni de este cierre.» (sin fecha: solo la segunda frase, R94) |

   Fuente nula (`montoRecibido`, `ingresoEmpresa`, `pagoMensajero`) → título + «Sin dato» (R27). Los
   rótulos de concepto son **los mismos** que en «Lo que se le factura a la tienda» (D20).
3. «Ver cómo se calculó» abierto → `CalculoCobro` (R28, R29, R97), `aria-label="Cómo se calculó el
   cobro a la tienda"` (canvas).
4. Pie: «Ver evidencia» (`BotonesEvidencia`) a la izquierda, «Corregir el resultado» a la derecha.

Estado local: `abierta` y `calculoAbierto`, los dos `false` al montar.

### `CalculoCobro` (R28, R29, R97)

Una `Cuenta` por concepto **cobrado** (`!== null`), en 2 columnas; título = nombre del concepto;
total con el mismo nombre (canvas). Nota «Tarifas tal como estaban al crear el cierre (<dd/MM/yyyy
HH:mm de `congeladoAt`>). Si después cambian, aquí no cambia nada.»

- **Modelo viejo** (R29, como hoy): tarifa aplicada con la regla de `DesgloseIngresoEmpresa` (pacto
  si `*Origen === "especial"` y existe; si no, columna GAM o no GAM por `esCentral`), rótulos de hoy
  (`FLETE_LABEL`, `IVA_FLETE_LABEL`, `COMISION_COD_LABEL`…), «+ IVA flete (<ivaFlete %> de <monto>)»,
  notas «especial» / «especial sin pacto», `SIN_COMISION_NOTA`; `tarifa === null` → solo
  `SIN_TARIFA_CONGELADA_NOTA`.
- **Modelo nuevo** (R97): por concepto de `conceptosTarifa`: «Tarifa: <origenDe(nivel, nombres)>»;
  «Monto fijo» o «<valor> % de <money(base)>» = base del concepto (`flete`, `comisionCod` o
  `fleteDevolucion`); «+ IVA <ivaPct> %» = su IVA; total = `*ConIva`.

Los % son el string congelado con « %» pegado; los montos de los rótulos pasan por `money()`. Es
formato, no aritmética (R71).

### `fila-gestion-vista.ts` (puro)

| Función | Qué decide | R |
|---|---|---|
| `gestionesEnOrden(grupos)` | lista plana en el orden de `ORDEN_RESULTADOS` | R84, S3-5 |
| `senalesDe(g, audiencia)` | `{ id, texto }[]` en el orden de R85 | R24, R85 |
| `textoSenales(g, audiencia)` | `senalesDe(...).map(texto).join(" · ")`, `""` sin señales | R85, R91 |
| `filtrosDe(gestiones, audiencia)` | 7 `FilterOption` con «<nombre> <n>» y `tono` | R84 |
| `filtrar(gestiones, filtro, audiencia)` | subconjunto, sin reordenar | R84 |
| `columnasDe(audiencia, conMensajero)` | rótulos y fuente de cada columna | R23, R86 |
| `tarjetasDe(g, audiencia, quienMiraEsCentral)` | tarjetas con `LineaCuenta[]`, total, `aparte`, `notas`, `tono`, o «Sin dato» | R25, R27, R30, R93-R95, R98 |
| `calculoDe(g)` | tarjetas de `CalculoCobro` | R28, R29, R97 |
| `origenDe(nivel, nombres)` | texto «Tarifa:» / «Por tarifa ·» por nivel (PA8) | R97, R98 |
| `accionesDe(g, audiencia, acciones)` | qué botón se ofrece (regla de hoy de `cierre-factura.tsx:1983-2026`, sin cambios) | R26 |

Regla de acciones (además de la tabla de R26): corregir métodos solo `entregado` con
`pagos.length > 0`; corregir el resultado solo `entregado`; ajustar pago con `pagoMensajero !==
null`; evidencia con `evidenciaUrls.length > 0`. Estado del cierre y permiso llegan como
**presencia del callback**.

Columnas (R23), de una sola fuente con la descarga (D20):

| Audiencia | Columnas |
|---|---|
| central, satélite | Guía · Destinatario · tienda · Resultado · Recibido · Cobro a la tienda · Pago al mensajero · Señales |
| solo lectura | igual, con «Mensajero» tras «Destinatario · tienda» si `columnaMensajero` |
| mensajero | Guía · Destinatario · tienda · Resultado · Recibido · Ganancia · Señales |

### `Cuenta.tsx`: props aditivas

`insignia?: ReactNode` (junto al título), `tono?: "aviso" | "aparte"` (borde ámbar / borde punteado
y fondo suave, canvas), `vacio?: string` (con `lineas` vacías pinta ese texto), `aparte?: { label;
monto }` (línea gris bajo el total, sin raya), `notas?: readonly string[]` (bloque gris con raya
punteada bajo las líneas) y `pie?: ReactNode` (botones o párrafo al final). Sin ellas el DOM es el
de hoy: «Dinero» y `DineroIdentidadesEnPantalla.test.tsx` no cambian.

### Montaje en `/cierres-admin` (R90)

En `CierresAdminModule.tsx`, el slot `gestiones` pasa de `<DescargarDatasetButton>` +
`<GestionesPorResultado>` a:

```tsx
<GestionesCierre
  gestiones={gestionesEnOrden(detalle.grupos).map((gestion) => ({ gestion }))}
  audiencia={audiencia === "admin" ? "central" : "satelite"}
  quienMiraEsCentral={audiencia === "admin"}
  congeladoAt={cierreAbierto.solicitadoAt}
  acciones={{ corregirMetodos: ofrecerCorreccionPagos ? setCorrigiendo : undefined,
              corregirResultado: ofrecerCorreccionResultado ? setCorrigiendoResultado : undefined,
              ajustarPago: ofrecerAjustePago ? setAjustandoPago : undefined }}
  onVerEvidencia={setEvidencia}
  descargar={<DescargarDatasetButton … />}
/>
<SeccionSinGestion … />   // R19, sin cambios
```

`CierresBodegaAdminModule.tsx` y `CierreDiaModule.tsx` no se tocan.

### «Descargar» (R91)

`detalle-cierre-descarga-columnas.ts` añade `{ clave: "senales", encabezado: SENALES_COL }` al final
y `filaDescargaDetalleCierre(g, audiencia)` rellena `senales: textoSenales(g, audiencia) || null`.

## Autorización

Sin cambios de permiso. La `audiencia` la decide `/cierres-admin/page.tsx` como hoy (central =
`esAccesoTotal`; satélite = adminSatelite). El fulfillment y sus campos nuevos llegan `null` a la
satélite desde el servidor (ficha 481, R94) y la fila además no lo pinta fuera de la central
(R30). Módulo: cierres sigue en `nucleo`.

## Datos que dependen del país

- Moneda: solo `money()`. IVA: el % sale del string congelado (concepto o tarifa vieja); nunca
  «13 %» escrito. Fechas: `fechaCalendarioCR`/`horaCostaRica`, como el resto de cierres (SLT-92
  «Pantallas: fechas y teléfonos en la zona y el prefijo del país de la empresa» las generalizará).

## Qué le queda a SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment»

**Nada de la fila de `/cierres-admin`:** R64, R65 y R66 entran aquí. Lo que el madre le asignaba y
**no** cubre esta ficha:

- pintar esas cifras en el detalle de bodega (las emite ya el mismo mapper; las pinta SLT-104
  «Detalle de cierre de bodega en el detalle único (central)» al montar la fila) y en `/cierre-dia`
  (vista del mensajero, otro servicio: SLT-108 «/cierre-dia: detalle y cola únicos para el
  mensajero»);
- las columnas de esas cifras en el Excel (rebanada S15 del madre, «Excel del modelo nuevo de
  cierres», que dependía de S12 y ahora depende de esta).

Propuesta para el leader: cerrar SLT-110 como absorbida por esta ficha, o dejarla solo para la
vista del mensajero si SLT-108 no la cubre. Lo decide Carlos en el board.

## Tests y guardias que cambian

Ninguno pierde lo que vigila: si una aserción leía una región que desaparece, pasa a leer la nueva
**con el mismo literal**, salvo las dos de PA2, que se retiran con motivo.

| Archivo | Qué vigilaba | Cómo queda |
|---|---|---|
| `tests/components/CierresAdminModule.test.tsx` | región por resultado de las pestañas | pulsa «Entregado <n>» en el grupo «Filtrar por resultado» y lee «Órdenes del cierre»; mismos literales |
| `tests/components/cierre-detalle-ajuste-badge.test.tsx` | marca «Ajustado» en la fila | la marca en la tarjeta de pago y la señal «Pago ajustado» |
| `tests/components/CorregirResultadoCierre.test.tsx` | botón de la fila | mismo nombre (R89), al pie de la fila desplegada |
| `tests/components/CierresAdminDetalleUnico.test.tsx` | «Descargar» y novedad interna | mismo, con «Descargar» en la fila de filtros |
| `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts` | 7 cabeceras | 8, con «Señales» |
| `tests/unit/guards/estado-con-info.guardia.test.ts` | nombres de estado con su botón | `USOS_PERMITIDOS` gana `fila-gestion-vista.ts`, clase `recuento` (las opciones «<resultado> <n>» del filtro, como las pestañas de hoy) |
| `tests/unit/guards/liquidacion-money-safe.test.ts` | ningún `Number()`/`parseFloat` en dinero | el censo suma los 5 archivos de `fila/` |
| `tests/unit/guards/factura-contraste.guardia.test.ts` | anclas `CierresAdminModule.tsx:<línea>` | se mueven las que cambien de línea (si T0.1 lo confirma) |
| `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts` | ficha 481: la satélite no recibe fulfillment | + los tres campos nuevos `null` para la satélite y presentes para la central |
| `e2e/tarifas-activacion.spec.ts` | «Total cobrado» de la fila; «Ingreso de bodega:» por fila (120 + 450 = 570, SLT-54 R71) | «Total cobrado» → «Se le cobra»; **se retiran** las dos aserciones de «Ingreso de bodega:» por fila (S3-2). Lo que vigilaban sigue cubierto en la base (`congeladoDelCierre`: `["entregado","2200","120"]`, `["devolucion…","0","450"]`) y en «Dinero» («− Ingreso de bodega» 570) |

Los tests que montan `GestionesPorResultado` directamente **no cambian** (bodega y `/cierre-dia` lo
siguen usando). Lo que vigilan de la fila se re-afirma sobre `FilaGestion` en
`FilaGestion.test.tsx` (pacto especial, sin pacto, sin comisión, sin tarifa congelada, varias
evidencias), salvo indemnización, ingreso de bodega y los datos de cabecera retirados (S3-2, PA6).

## Verificación de lo que ve el usuario (R77)

**Servidor** (`tests/integration/db/cierre-detalle-cifras-fila-sql-real.test.ts`, base desechable,
SQL real, memoria «probar el WHERE donde vive»). Siembra: un cierre del modelo nuevo con una entrega
(flete 3 500,00 + IVA 13 % 455,00; comisión 2 % de 25 000,00 = 500,00 + 65,00; fulfillment 600,00 +
78,00), su fila congelada del mensajero (importe 2 500,00, nivel `mensajero`) **y otra de la
satélite** (importe 900,00), un ajuste 2 500,00 → 1 800,00, un cargo de fulfillment de su orden con
`ocurrido_at` 2026-11-06, y **otra orden de otro cierre** con un cargo posterior. Literales:

| Campo | Esperado |
|---|---|
| `ivaIncluido` | `"520.00"` |
| `fulfillmentConIva`, `ivaPctFulfillment` | `"678.00"`, `"13.00"` (o el string congelado; T0.2) |
| `fulfillmentCargadoAt` | el ISO del 2026-11-06 sembrado |
| `conceptosTarifa` | flete `monto` `"3500.00"` nivel `grupo` con su grupo y zona; comisión `porcentaje` `"2.00"` base `"25000.00"` nivel `zona` |
| `pagoPorTarifa` | importe `"2500.00"`, nivel `mensajero`, ajuste `{ signo: "resta", monto: "700.00" }` |
| `tarifaFaltante` | `false`; y `true` en una segunda gestión del modelo nuevo sin fila del mensajero |
| último movimiento = reverso | `fulfillmentCargadoAt: null` |

Mutaciones que deben ponerlo rojo (anotadas en `progress/impl_SLT-101.md`): quitar
`actor: "mensajero"` del `where` (sale 900,00); quitar el `ordenId IN` (sale la fecha de la otra
orden); quitar `distinct`/orden por `secuencia` (sale el cargo anterior al reverso).

**Componentes** con dobles y literales escritos a mano (nunca la función que los produce):

| Gestión doble | Literales |
|---|---|
| Vieja, entrega central: efectivo 15 000,00 + SINPE 10 000,00 + transferencia 0,00; `montoCobrar` 25 000,00; tarifa GAM 4 000,00, IVA 13, comisión 4, IVA comisión 13; `ivaIncluido` 650,00 | Recibió: «Efectivo ₡15.000,00», «+ SINPE ₡10.000,00», sin Transferencia, «Recibió ₡25.000,00». Se le cobra: «Flete por entregado + IVA ₡4.520,00», «+ Comisión COD + IVA ₡1.130,00», «Se le cobra ₡5.650,00», «de eso, IVA (no es de la empresa) ₡650,00». Cálculo: «tarifa GAM ₡4.000,00», «IVA flete (13 % de ₡4.000,00) ₡520,00», «Comisión COD (4 % de ₡25.000,00) ₡1.000,00» |
| Nueva = el canvas (`Fila2`): conceptos y pago de la siembra de arriba | «Se le cobra ₡4.520,00», «de eso, IVA (no es de la empresa) ₡520,00»; cálculo «Tarifa: grupo «San José centro» de la zona GAM», «Monto fijo ₡3.500,00», «+ IVA 13 % ₡455,00», «Flete por entregado ₡3.955,00», «Tarifa: valor base de la zona GAM», «2 % de ₡25.000,00 ₡500,00», «Comisión COD ₡565,00»; pago «Por tarifa · precio propio del mensajero ₡2.500,00», «− Ajuste ₡700,00», «Se le paga ₡1.800,00», «Ajustado»; fulfillment «Fulfillment ₡600,00», «+ IVA 13 % ₡78,00», «Se cobró ₡678,00», «Se cargó al saldo de la tienda el 06/11/2026, una vez por paquete.» solo en central (y solo lectura con central) |
| Incidente «Dañado», `indemnizacion` nula | señal central «Dañado · sin indemnizar», mensajero y solo lectura «Dañado» |
| Devolución a origen `esRechazoSla` | «Vuelve a bodega · Rechazo automático» (central), «Vuelve a bodega» (mensajero) |
| Nueva sin fila del mensajero (`tarifaFaltante: true`) | central «Sin tarifa de pago», mensajero «Sin tarifa» |
| Pre-snapshot (`ingresoEmpresa: null`, `pagoMensajero: null`) | celdas «—»; tarjetas «Sin dato» |

**E2E** (`e2e/cierres-rediseno.spec.ts`, `describe` nuevo, grupo `dinero`), sobre los escenarios que
ya siembra SLT-100. Literales **propuestos**, que T0.3 confirma contra la siembra antes del test:
- **Central A (viejo, solicitado).** Filtros «Todas 3», «Entregado 2», «Devolución a origen por
  rechazo 1», «Con señales 1». Entrega de 70 000 en efectivo: «Efectivo ₡70.000,00», «Recibió
  ₡70.000,00»; «Flete por entregado + IVA ₡2.260,00», «+ Comisión COD + IVA ₡791,00», «Se le cobra
  ₡3.051,00», «de eso, IVA (no es de la empresa) ₡351,00»; «Se le paga ₡1.500,00» sin «Por tarifa».
  Cálculo: «tarifa GAM ₡2.000,00», IVA ₡260,00; comisión ₡700,00, IVA ₡91,00. Devolución: señal
  «Vuelve a bodega», «Se le cobra ₡2.260,00». Acciones presentes. «Descargar»: 8 cabeceras con
  «Señales». La URL no cambia al filtrar.
- **Satélite A:** mismas cifras; sin «Fulfillment»; «Ajustar pago» sí, «Corregir métodos de pago» y
  «Corregir el resultado» no.
- **Central B (nuevo):** «Flete por entregado + IVA ₡3.503,00», «Se le cobra ₡3.503,00», «de eso,
  IVA ₡403,00»; cálculo «Tarifa: …» (texto de T0.3), «Monto fijo ₡3.100,00», «+ IVA 13 % ₡403,00»;
  «Por tarifa · … ₡2.200,00», «Se le paga ₡2.200,00»; fulfillment según la siembra (T0.3).
- **Ajuste** (`e2e/ajuste-pago-mensajero-cierre.spec.ts`, adaptado): tras ajustar 1 500 → 2 200,
  «Se le paga ₡2.200,00», «Ajustado», el motivo y la señal «Pago ajustado» (y «+ Ajuste ₡700,00» si
  el escenario es del modelo nuevo; T0.3).

**Mutaciones de pantalla:** quitar `esMontoCero` en «Recibió»; Fulfillment también a la satélite;
cálculo sin la columna aplicada (pacto ↔ GAM); «Con señales» contando todas; `leerDeUrl` a `true`
(el E2E de URL lo pone rojo).

## Alternativas descartadas

1. **Reescribir `GestionesPorResultado` en su sitio con `audiencia`.** Cambiaría bodega y
   `/cierre-dia` antes de SLT-104 y SLT-108 y movería ~10 tests que las protegen.
2. **`SegmentedToggle` (el conmutador de cierres) para los filtros.** Era la propuesta anterior.
   Carlos la corrige (S3-4): los filtros de la app ya tienen componente, `BuscadorFiltros`, y es el
   que hay que reutilizar; un segundo control de filtros en la misma app es justo lo que D17 evita.
3. **`BuscadorFiltros` tal cual, con el resultado como `single` en un desplegable.** No necesita
   props nuevas, pero esconde los conteos en un desplegable y pinta un buscador que el canvas no
   dibuja: no es fiel. Se queda el componente y se añaden dos props aditivas mínimas.
4. **Pastillas nuevas propias en `fila/`.** Sería un control de filtros nuevo; S3-4 lo prohíbe.
5. **Calcular en el cliente el IVA incluido, el «Se cobró» o el «− Ajuste».** Rompe R71 y la guardia
   money-safe; van en el mapper del repositorio, junto al `total` que ya se deriva allí.
6. **El «por tarifa» del modelo viejo desde `pagoAnterior` del primer ajuste.** Daría una línea al
   viejo, pero solo cuando hubo ajuste, y la corrección de resultado (398) puede haber cambiado el
   pago después: no es un dato congelado. R66 lo limita a la gestión con pago congelado.
7. **«Sin tarifa de pago» del viejo con la tarifa de pago de hoy de la zona** (la regla de
   `/cierre-dia`). En un cierre pasado puede afirmar algo falso; PA9.
8. **Un componente de tarjeta nuevo para la fila.** `Cuenta` ya es la cascada aprobada (D16).

## Dependencias de terceros

Ninguna nueva.

*Grafo:* `index_status` del proyecto
`R-job-singularis-projects-servi_logistic-.worktrees-SLT-101-fila-gestion-unica` responde «project
not found». Se exploró con Grep/Read sobre el worktree.
