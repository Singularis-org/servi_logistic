# SLT-154 «Vista de la bodega satélite: solo lo suyo» — reuso de componentes

> Pedido de Carlos al aprobar el canvas (2026-11-13): «reutiliza los componentes, no crees más si no
> es necesario, por ejemplo la línea de porcentajes». Este documento fija, pieza por pieza, qué
> componente existente pinta cada parte del diseño y qué cambio mínimo necesita.
> Fuente: Grep/Read sobre este worktree (desde `origin/dev`). La cabecera `<dl>` de SLT-153 se leyó
> en su worktree (`.worktrees/SLT-153-cabecera-cierre-folio-buscable`) porque aún no está en esta rama.
> El grafo no indexa este worktree.

**Resultado: 8 de 8 piezas se reusan. Ningún componente nuevo.** Lo que cambia son funciones de vista
(qué datos le llegan al componente) y datos del servidor; ningún `.tsx` nuevo.

## Piezas

### 1. Barra de reparto en % («¿A dónde va lo recaudado?») — REUSO

- **Componente:** `DineroCierre` (`components/private/cierres/detalle/DineroCierre.tsx:26`). La barra
  y su leyenda viven dentro (`:30-56`), no son un componente aparte. Pinta `dinero.reparto`
  (`ParteReparto[]`, `detalle-cierre-vista.ts:576`: `label`, `monto`, `porcentaje` entero del servidor
  o `null` = sin barra) con los colores por posición `COLOR_PARTE` (`:20`: success / foreground /
  warning).
- **Ya pinta el reparto que pide el canvas:** `lineasDinero("bodega", …)` (`detalle-cierre-vista.ts:686-693`)
  arma [Debe llegar a la central, Pago a mensajeros, Gana la bodega satélite] con
  `porcentajesReparto` (`DetalleBodegaVista:147`, «[central, mensajeros, bodega satélite] ya derivado
  en el servidor»).
- **S4 (cierre de bodega):** sin cambio en la barra.
- **S6 (cierre del mensajero):** la misma `DineroCierre`. Lo que cambia es la vista: para la satélite,
  `lineasDinero("mensajero", …)` (`:708-732`) debe devolver el reparto de tres partes (central /
  pago al mensajero / gana la bodega) en vez de [tienda, sale de lo recaudado]. Necesita datos que
  `DetalleMensajeroVista` (`:94`) aún no tiene: `paraLaCentral`, `efectivoCubreDescuentos` y los
  porcentajes de tres partes, derivados en el servidor (el `totalIngresoBodegaRechazos` ya está en
  `DineroEmpresaMensajero:81`, que es el objeto EMP; para la satélite debe viajar fuera de él).
- **Prop nueva en el componente:** ninguna. `DineroCierre` no conoce la audiencia y no la necesita.
- Descartadas como alternativa: `GraficaReparto` (`components/private/analytics/GraficaReparto.tsx`),
  `BarraComposicionCaja` (`app/(app)/wallet/_components/BarraComposicionCaja.tsx`) y
  `ComposicionBarra` (`app/(app)/monitoreo/_components/ComposicionBarra.tsx`): son de otros módulos;
  el detalle del cierre ya tiene la suya y la central la ve igual.

### 2. Lista «Recaudado / Pago al mensajero / Gana la bodega / Debe llegar a la central» y el desglose «Lo que va a la central» — REUSO

- **Componente:** `Cuenta` (`components/private/cierres/detalle/Cuenta.tsx:54`; props `titulo`,
  `lineas: LineaCuenta[]`, opcionales `ariaLabel`, `tono`, `vacio`, `notas`, `pie`…). `DineroCierre`
  la monta por cada `dinero.cuentas` (`DineroCierre.tsx:58-62`).
- **Líneas:** `lineasCascadaCentral` (`app/(app)/cierres-admin/_components/cascadas-bodega.ts:46`) ya
  da exactamente esa lista: Total general, − Pago al mensajero, − Gana la bodega satélite,
  Para la central (destacado, con sus notas de negativo y de efectivo). `cuentaCentral`
  (`detalle-cierre-vista.ts:654`) la pasa a formato `Cuenta`, con título `CASCADA_CENTRAL_TITULO`
  («Lo que va a la central», `cierre-labels.ts:264`) y rótulo único por cifra (`ROTULO_UNICO_CENTRAL`, `:648`).
- **S4:** la satélite se queda solo con `cuentas: [cuentaCentral(d)]` (quitar `cuentaFactura` y
  `cuentaQueda`) y `porTienda: null`.
- **S6:** misma `cuentaCentral`, generalizada para recibir el «nivel» (`general`,
  `totalPagoMensajero`, `totalIngresoBodegaRechazos`, `paraLaCentral`, `efectivoCubreDescuentos`,
  `modeloNuevo`) en vez de un `DetalleBodegaVista` entero. Es la firma que ya tiene
  `lineasCascadaCentral`. Si la etiqueta «Pago a mensajeros» de `ROTULO_UNICO_CENTRAL` no vale
  para un solo mensajero, se decide con un parámetro de la función, no con otra cuenta.
- Nota de maquetación: con una sola cuenta, `DineroCierre` usa `lg:grid-cols-2` (`:58`) y la tarjeta
  ocupa media fila. Si el canvas la quiere a todo el ancho, es una clase en `DineroCierre`, no otro
  componente.
- Descartado: `CascadaDinero` (`app/(app)/cierres-admin/_components/CascadaDinero.tsx:132`), la
  cascada del detalle viejo; el detalle único ya migró a `Cuenta` (SLT-95).

### 3. Fila de 4 tarjetas KPI (Recaudado, Pago a mensajeros, Gana la bodega, Debe llegar a la central) — REUSO

- **Componente:** `CifrasCierre` (`components/private/cierres/detalle/CifrasCierre.tsx:79`; props
  `cifras: Cifra[]`, `totales?` para los métodos bajo «Recaudado», `ariaLabel?`). Es el MISMO que ya
  pinta las tarjetas de «A consolidar» (`ColaCierres.tsx:371`), las de «Solicitados» (`:429`) y la
  cabecera del detalle (`DetalleCierre.tsx:312`). Rejilla de 4 o 5 columnas (`COLUMNAS_LG`, `:27`);
  tonos `destacada` y `aviso` ya soportados (`tonoCaja`, `:33`).
- **Datos, S4:** `tarjetasAConsolidar` (`components/private/cierres/cola/cola-cierres-vista.ts:337`,
  entrada `TarjetasAConsolidarEntrada` `:311`: `totales`, `pagoMensajeros`, `ganaBodega`,
  `paraLaCentral`, `centralDebe`, `mensajeros`, `incluyeModeloNuevo`). Es literalmente P1 («las KPI
  del modal son las de A consolidar»), incluida la quinta «La central debe» solo si ≠ 0.
  Cambio: con audiencia satélite, `cifrasBodega` (`detalle-cierre-vista.ts:298`, hoy con «Le queda a
  la empresa») pasa a devolver `tarjetasAConsolidar(...)`.
  Falta un dato: `DetalleBodegaVista` no trae `centralDebe` (hay que añadirlo desde el servidor).
- **Datos, S6:** `cifrasDe("mensajero", "satelite", …)` (`detalle-cierre-vista.ts:252`) con una rama
  satélite que use los `CifraId` que YA existen (`recaudado`, `pago`, `ganaBodega`, `paraCentral`,
  `:209-226`) y los mismos rótulos; «Pago al mensajero» (`PAGO_MENSAJERO_LABEL`) en singular.
- **Prop nueva:** ninguna en `CifrasCierre`. Ningún `CifraId` nuevo.
- **Discrepancia a resolver (ver Preguntas):** el canvas resalta «Gana la bodega»; `tarjetasAConsolidar`
  resalta «Debe llegar a la central» (`:347-349`).

### 4. Cabecera del detalle con rótulos en `<dl>` — REUSO (depende de SLT-153)

- **Componente:** `DatosCabecera` de SLT-153 «Cabecera del detalle del cierre con rótulos y folio
  buscable» (`components/private/cierres/detalle/DetalleCierre.tsx:254` en el worktree de SLT-153;
  `<dl aria-label={L.DATOS_DEL_CIERRE_LABEL}>` con un `<dt>`/`<dd>` por `ParCabecera`, `mono` para el
  folio). Los pares salen de `paresCabeceraBodega` (`detalle-cierre-vista.ts:247` de SLT-153) y
  `paresCabeceraMensajero` (`:218`); los vacíos ya se omiten (`conValor`, `:200`).
- **Estado en esta rama:** NO está. Esta rama sale de `origin/dev` sin SLT-153; hay que traerla
  (merge de `dev` cuando SLT-153 entre) antes de tocar la cabecera. Los dos tocan
  `DetalleCierre.tsx` y `detalle-cierre-vista.ts`: choque de archivos con SLT-153.
- **Prop nueva:** ninguna; los pares no llevan dinero, así que no hay nada EMP que cortar ahí.
- Descartado: el `<dl>` de `Dato` dentro de `FilaGestion.tsx:252`, que es de la fila desplegada.

### 5. Pestañas «Gestiones (n) / Lo que va a la central / Mensajeros (n) / Conciliación» — REUSO

- **Componente:** `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` de `@/components/ui/tabs`, montados en
  `DetalleCierre.tsx:314-334` sobre `m.pestanas` y `m.slots`.
- **Datos:** `pestanasDe` (`detalle-cierre-vista.ts:412`). Hoy bodega devuelve
  [Dinero, Gestiones, Mensajeros, Conciliación] (`:420-427`) sin mirar la audiencia; mensajero no
  móvil devuelve [Dinero, Gestiones, Rechazos, Pago?] (`:434-436`). Cambio: rama `audiencia ===
  "satelite"` que pone Gestiones primero y rotula la pestaña `dinero` con `CASCADA_CENTRAL_TITULO`
  («Lo que va a la central», P5). El `PestanaId` sigue siendo `"dinero"` (el slot no cambia).
- La primera pestaña abierta sale de `m.pestanas[0]` (`DetalleCierre.tsx:314`): con el nuevo orden,
  la satélite abre en Gestiones sin tocar el componente.
- **Prop nueva:** ninguna. Contenido de Mensajeros (`MensajerosCierreBodega`) y Conciliación
  (`ConciliacionCierreBodega`) sin cambio (son SAT).
- Ojo: los E2E buscan el texto «Lo que va a la central» como título de cuenta
  (`e2e/cierre-bodega-satelite.spec.ts:77`, `e2e/cierres-rediseno.spec.ts:901`); con pestaña y cuenta
  del mismo nombre, esos localizadores deben acotarse por rol.

### 6. Tabla de gestiones (Destinatario / Tienda / Mensajero / Resultado / Recibido / Pago al mensajero / Gana bodega) — REUSO

- **Componentes:** `GestionesCierre` (`components/private/cierres/fila/GestionesCierre.tsx:55`; props
  `gestiones`, `audiencia: AudienciaFila`, `quienMiraEsCentral`, `congeladoAt`, `acciones`,
  `columnaMensajero?`, `descargar?`) y `FilaGestion` (`FilaGestion.tsx:112`). Las columnas salen de
  `columnasDe(a, conMensajero)` (`fila-gestion-vista.ts:180`) y cada importe de `montoDeColumna`
  (`:207`).
- **Cambio en la función, no en el componente:**
  - `columnasDe` recibe el `quienMiraEsCentral` que AMBOS componentes ya tienen. Con `false` y
    audiencia no mensajero: sin `cobro`, con una columna `ganaBodega` (rótulo existente
    `COLUMNA_GANA_BODEGA` «Gana bodega», `cola-cierres-labels.ts:135`) después de `pago`.
  - `ColumnaId` (`:162`) gana `"ganaBodega"`; `montoDeColumna` la lee de
    `g.ingresoBodegaRechazo` (`ICierreDiaService.ts:89`), el mismo campo que ya usa la hoja
    «Gestiones» del libro para «Gana la bodega satélite»
    (`cierres-gestiones-modelo-nuevo-descarga-columnas.ts:167`).
  - `tarjetasDe` (`:351`) no añade `tarjetaCobro` con `quienMiraEsCentral === false`. Eso solo
    quita también «Ver cómo se calculó»: el botón cuelga del pie de la tarjeta `cobro`
    (`FilaGestion.tsx:176`) y `CalculoCobro` se abre desde ahí.
- **Por qué `quienMiraEsCentral` y no la audiencia:** S4 monta la fila con `audiencia="solo
  lectura"` (`DetalleCierreBodegaAbierto.tsx:74-77`) y S6 también usa `"solo lectura"` cuando la
  CENTRAL abre un cierre de satélite (`CierresAdminModule.tsx:1220-1223`). La audiencia no distingue
  quién mira; `quienMiraEsCentral` sí, y es el criterio que ya usa `veFulfillment` (`:327`).
- **Prop nueva:** ninguna en `GestionesCierre` ni en `FilaGestion`.
- El aria-label del desplegable usa `g.ingresoEmpresa` (`FilaGestion.tsx:240`): con el corte en el
  servidor cae solo al de `detalleOrdenAriaLabel`, sin cambio de código.
- Guía y Señales: `columnasDe` las da siempre; el resumen del canvas no las nombra. Se mantienen
  salvo que Carlos diga lo contrario (ver Preguntas).

### 7. Badges de estado — REUSO

- Estado del cierre de bodega: `Badge` (`@/components/ui/badge`) con `ESTADO_CONCILIACION_VARIANT`
  (`app/(app)/cierres-admin/_components/cierre-labels.ts:737`), montado en `DetalleCierre.tsx:131-135`.
- Estado del cierre del mensajero: `EstadoCierreBadge`
  (`app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx:227`), `DetalleCierre.tsx:167`.
- Resultado de cada gestión: `EstadoConInfo` (`components/shared/EstadoInfo.tsx:171`) con
  `TONO_RESULTADO` (`FilaGestion.tsx:145-148`).
- Otros ya presentes: `RetieneReprogramadasBadge` (`RetieneReprogramadasBadge.tsx:29`),
  `MarcaAjustado` (insignia «Ajustado» de la tarjeta de pago, `FilaGestion.tsx:269`).
- **Prop nueva:** ninguna. Ninguno lleva dinero EMP.

### 8. Tarjetas de la fila desplegada (Recibió / Pago al mensajero) — REUSO

- `Cuenta` vía `tarjetasDe` (ver pieza 6). Se reusan tal cual `tarjetaRecibido` y `tarjetaPago`
  (con tarifa y ajuste, SAT); solo deja de entrar `tarjetaCobro`.

## Preguntas abiertas

1. **Tarjeta resaltada.** El canvas resalta «Gana la bodega»; `tarjetasAConsolidar` (y por tanto la
   pestaña «A consolidar» de hoy) resalta «Debe llegar a la central». P1 dice que son las mismas
   KPI. Reusar sin tocar = «Debe llegar» resaltada en el modal. Si Carlos quiere «Gana la bodega»,
   se cambia en `tarjetasAConsolidar` y cambia también «A consolidar» (una sola fuente), sin prop
   nueva. Falta su decisión.
2. **Guía y Señales en la tabla de gestiones.** El resumen del canvas no las lista; `columnasDe`
   las pinta para todas las audiencias. Por defecto se quedan.

## Regla para el spec

Requisitos de reuso que `requirements.md`, `design.md` y `tasks.md` deben respetar (y el reviewer
verificar: ningún `.tsx` nuevo en `## Archivos esperados` bajo `components/private/cierres/`):

- RU1. La barra de reparto de S4 y S6 es la de `DineroCierre` (`DineroCierre.tsx:30-56`), alimentada
  con `ParteReparto[]` y porcentajes del servidor. No se crea otra barra ni otro componente de
  porcentajes.
- RU2. «Lo que va a la central» en S4 y S6 es una `Cuenta` construida con `cuentaCentral` /
  `lineasCascadaCentral`. `cuentaCentral` se generaliza para recibir el nivel; no se escribe una
  segunda cascada.
- RU3. Las tarjetas KPI de S4 y S6 son `CifrasCierre`. Las de S4 salen de `tarjetasAConsolidar`
  (P1); las de S6, de `cifrasDe` con los `CifraId` existentes. Ningún componente de tarjetas nuevo,
  ningún `CifraId` nuevo.
- RU4. La cabecera con rótulos es `DatosCabecera` de SLT-153 con `paresCabecera*`. Esta feature no
  escribe otro `<dl>` de cabecera; si SLT-153 no ha entrado en `dev`, la tarea de cabecera espera.
- RU5. Las pestañas son las de `@/components/ui/tabs` en `DetalleCierre`; el orden y el rótulo de la
  satélite salen de `pestanasDe`, con el mismo `PestanaId "dinero"`.
- RU6. La tabla de gestiones es `GestionesCierre` + `FilaGestion` sin props nuevas. El corte de
  «Cobro a la tienda», de la tarjeta «Se le cobra a la tienda» y de «Ver cómo se calculó», y la
  columna «Gana bodega», salen de `columnasDe` / `montoDeColumna` / `tarjetasDe` con el
  `quienMiraEsCentral` existente (como `veFulfillment`), no de la audiencia.
- RU7. Los badges son los existentes (`Badge` + `ESTADO_CONCILIACION_VARIANT`, `EstadoCierreBadge`,
  `EstadoConInfo`, `RetieneReprogramadasBadge`, `MarcaAjustado`); ninguno nuevo.
- RU8. Los cambios de esta feature en la capa de presentación viven en funciones de vista
  (`detalle-cierre-vista.ts`, `fila-gestion-vista.ts`, `cola-cierres-vista.ts`) y en los datos del
  servidor; los `.tsx` de `components/private/cierres/` solo se tocan para pasar datos, no para
  pintar piezas nuevas.
