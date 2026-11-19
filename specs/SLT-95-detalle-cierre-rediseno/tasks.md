# SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)» — tasks (v2)

> v2 del 2026-11-09. El rediseño completo se parte en 17 rebanadas (`requirements.md >
> Rebanadas`). **Esta ficha, SLT-95, implementa solo S1** («Detalle de cierre único: componente
> base»): el componente de detalle con cabecera, franja, cifras, pestañas, scroll, pie y «Dinero»,
> probado con dobles y **sin montar** en ninguna pantalla (`docs/specs.md > Partir una feature`:
> lo que aún no puede verse va sin enlace). S2 lo monta en `/cierres-admin`.
>
> `## Archivos esperados` lista solo los de S1, que es lo que `scripts/archivos-en-vuelo.mjs` debe
> ver como en vuelo. Los de las demás rebanadas están en `## Plan de las demás rebanadas` y pasan a
> su propio `tasks.md` cuando se especifique cada ficha.
>
> `[P]` = paralelizable con la task anterior. Todo S1 es de `frontend_dev`. Antes del primer gate,
> copiar `.env` al worktree (memoria: sin `.env` el gate sale verde saltándose la integración).

## S1 — Detalle de cierre único: componente base (SLT-95)

Tamaño estimado: 13 archivos, ~950 líneas (6 de código nuevo ~560, 1 movido, 6 de tests ~390).

### T0 — Comprobaciones previas (sin código)

- [x] **T0.1** — Confirmar que un componente exportado y aún no montado no pone rojo ninguna guardia
  (`superficie-de-uso.guardia.test.ts` y la de dependencias). **Hecho:** nota en
  `progress/impl_SLT-95.md`. Si alguna lo marca, se para y se pregunta (no se monta a escondidas).
- [x] **T0.2** [P] — Confirmar los campos de `CierreDetalleAdminServiceResult` y
  `CierreBodegaDetalleServiceResult` que usa la tabla `design.md > De dónde sale cada cifra`
  (`pagoTienda`, `cobradoSobreRecaudado`, `netoEmpresa`, `ganaLaTienda`, `partesPorTienda`,
  `paraLaCentral`, `totalesIngreso`, `ivaFacturado`, `rechazosDeTienda`,
  `reprogramadasRetenidasHoy`). **Hecho:** nota con el archivo y la línea de cada uno. Si falta
  uno, se para.

### T1 — Lógica pura

- [x] **T1.1** — `components/private/cierres/detalle/detalle-cierre-vista.ts`: `cifrasDe`,
  `metodosVisibles`, `avisosDe`, `pestanasDe`, `accionesDe`, `lineasDinero` para `tipo`
  mensajero y bodega y las tres audiencias. **Hecho:** `tests/unit/utils/detalle-cierre-vista.test.ts`
  cubre, con los números de `design.md > Números escritos a mano`:
  - las cifras apuntan al campo exacto y en orden: 4 con central/satélite, 3 con mensajero (R6);
  - SINPE/Transferencia en "0.00" se omiten (R7);
  - avisos por modo y audiencia, y lista vacía sin asuntos (R4);
  - pestañas por la tabla de R10, con «Rechazados por la tienda (0)» presente (R10, D11);
  - acciones del pie por la tabla de R12, con y sin permiso (R12);
  - contraprueba: con `netoEmpresa` cambiado en el doble, la cifra 4 cambia.
- [x] **T1.2** [P] — `detalle-cierre-labels.ts`: rótulos nuevos en «tú», reusando los `*_LABEL`
  existentes donde la cifra ya tiene nombre. **Hecho:** typecheck verde; ningún rótulo «Debe» ni
  «Ganancia» de la empresa exportado (R9).
- [x] **T1.3** [P] — Mover `lineasCascadaCentral` y `lineasCascadaDueno` de
  `CierresBodegaAdminModule.tsx` a `app/(app)/cierres-admin/_components/cascadas-bodega.ts`, sin
  cambiar ni una línea; el módulo las importa. **Hecho:** `CierreBodegaDetalleCascadas.test.tsx`
  verde sin tocar sus aserciones.

### T2 — Componentes

- [x] **T2.1** — `Cuenta.tsx`: tarjeta en formato cascada (R15) con `data-signo` por línea.
  **Hecho:** cubierta por `DetalleCierreDinero.test.tsx` (operador delante del rótulo, subtotal con
  raya punteada, total en negrita).
- [x] **T2.2** — `CifrasCierre.tsx` y `DineroCierre.tsx` (mensajero y bodega). **Hecho:**
  `tests/components/DetalleCierreDinero.test.tsx` lee del DOM con literales:
  - mensajero: 100 000,00 · 94 350,00 · 3 000,00 · 3 500,00; contexto «ganan en total» 92 090,00
    (R6, R8); Transferencia ausente (R7);
  - reparto 94 350,00 / 5 650,00 y las dos cascadas (5 650,00; 7 910,00; −910,00; −3 000,00;
    −500,00; 3 500,00) (R14);
  - «Por tienda» solo con dos o más tiendas (R14);
  - bodega: 96 500,00 y las tres cascadas (R16);
  - audiencia mensajero: 3 cifras y ningún texto del dinero de la empresa (R6, R9);
  - ningún «Debe»; `netoEmpresa` −250,00 con su signo (R9, R6).
- [x] **T2.3** — `DetalleCierre.tsx` sobre `components/ui/dialog` (marco modal) o región (marco
  página): cabecera y estado (R2, R3), franja fija (R4, R5), cifras, `tablist` (R10, R20), un solo
  `tabpanel` desplazable (R11), pie fijo (R12), slots de pestaña. **Hecho:**
  `tests/components/DetalleCierre.test.tsx` afirma:
  - nombre accesible con «Detalle del cierre» / «Detalle del cierre de bodega» en modal, y región sin
    X en página (R13);
  - estado de cada modo con `EstadoCierreBadge` / `estadoConciliacionDe` (R2);
  - marca de retención con `reprogramadasRetenidasHoy` = 2, ausente con 0 (R3);
  - la franja con los conteos de un doble y ausente sin asuntos (R4); fuera del panel con scroll (R5);
  - roles `tab`/`tabpanel` y que solo el panel tiene `overflow-auto` (R11, R20);
  - los botones del pie para cada fila de la tabla de R12, y que pulsar uno llama a su callback;
  - un componente para todo: el mismo `DetalleCierre` se monta con las 9 combinaciones de R12 (R1).

### T3 — Guardias

- [x] **T3.1** — Ampliar el censo de `tests/unit/guards/liquidacion-money-safe.test.ts` a
  `components/private/cierres/`. **Hecho:** la guardia caza un `Number(monto)` colado en un archivo
  de la carpeta (contraprueba anotada) (R71).
- [x] **T3.2** [P] — `tests/components/DineroIdentidadesEnPantalla.test.tsx`: añadir la superficie
  nueva (recaudado − sale de lo recaudado = se le paga hoy; facturado − IVA − pago − bodega = le
  queda; recaudado − mensajeros − bodega = debe llegar a la central), leídas del DOM vía
  `data-signo`. **Hecho:** verde, y rojo si se cambia una línea del doble.

### T4 — Cierre

- [x] **T4.1** — `./init.sh` verde. **Hecho:** sin rojos ni aviso de tamaño; revisión del diff: nada
  en `lib/`, `db/` ni migraciones (R72).

## Trazabilidad R → test (S1)

| R | Test |
|---|---|
| R1 | `tests/components/DetalleCierre.test.tsx` (las 9 combinaciones con un solo componente) |
| R2, R3 | `tests/components/DetalleCierre.test.tsx` |
| R4 | `tests/unit/utils/detalle-cierre-vista.test.ts`; `DetalleCierre.test.tsx` |
| R5 | `DetalleCierre.test.tsx` |
| R6, R7, R8 | `detalle-cierre-vista.test.ts`; `tests/components/DetalleCierreDinero.test.tsx` |
| R9 | `DetalleCierreDinero.test.tsx` |
| R10 | `detalle-cierre-vista.test.ts`; `DetalleCierre.test.tsx` |
| R11, R12, R13 | `DetalleCierre.test.tsx`; `detalle-cierre-vista.test.ts` (R12) |
| R14, R15, R16 | `DetalleCierreDinero.test.tsx`; `tests/components/DineroIdentidadesEnPantalla.test.tsx` |
| R20 | `DetalleCierre.test.tsx` |
| R71 | `tests/unit/guards/liquidacion-money-safe.test.ts` (censo + contraprueba) |
| R72 | revisión del diff en T4.1 |

El E2E por rol (R77) entra con S2, que es la primera rebanada que monta el detalle: S1 no se ve.

## Archivos esperados

- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `components/private/cierres/detalle/detalle-cierre-labels.ts`
- `components/private/cierres/detalle/DetalleCierre.tsx`
- `components/private/cierres/detalle/CifrasCierre.tsx`
- `components/private/cierres/detalle/DineroCierre.tsx`
- `components/private/cierres/detalle/Cuenta.tsx`
- `app/(app)/cierres-admin/_components/cascadas-bodega.ts`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `tests/unit/utils/detalle-cierre-vista.test.ts`
- `tests/components/DetalleCierre.test.tsx`
- `tests/components/DetalleCierreDinero.test.tsx`
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`
- `tests/unit/guards/liquidacion-money-safe.test.ts`

## Plan de las demás rebanadas

Cada una se crea como ficha con `/afinar-feature` y `depends_on` encadenado, y tendrá su propio
spec (que hereda R, decisiones y diseño de este). Estimaciones a mano; el implementer para si el
gate avisa del 80 %.

### S2 «Detalle de cierre único en /cierres-admin (mensajeros)» — frontend · depende de S1
R17-R19, R21, R38, R39, R77 (central y satélite). ~32 archivos, ~900 líneas (la mitad, tests que hoy
montan el modal).
- `CierresAdminModule.tsx` monta `DetalleCierre` tipo mensajero (decidir, solo lectura, vencido) con
  las audiencias central y satélite; «Gestiones» monta `GestionesPorResultado` tal cual hasta S3;
  «Rechazados por la tienda» con estado vacío; «Pago al mensajero» = `PagoMensajeroSeccion`;
  «Descargar» en lugar de la impresión.
- Tests a adaptar (sin quitar lo que vigilan): `CierresAdminModule`, `CierresAdminPagoMensajero`,
  `CierresAdminIndemnizacion`, `CierresAdminDeepLink`, `CierresAdminConfirmacionFisica`,
  `CierresAdminRetieneReprogramadas`, `CierreMensajeroDetalleCascadas`,
  `CierreMensajeroDesglosePorTienda`, `CierreRechazosDeTienda`, `CierreFacturaSinGestionar`,
  `CierrePremioPendiente`, `cierre-detalle-ajuste-badge`; guardias `cierre-detalle-superficies`,
  `factura-contraste`, `impresion-flujo` (censo ampliado; la de impresión deja de exigir la hoja en
  el admin).
- E2E: nuevo `e2e/cierres-rediseno.spec.ts` (central y satélite, modelo viejo y nuevo, literales);
  adaptar `e2e/cierres-admin.spec.ts`, `e2e/wallet-iva-aparte-sl39.spec.ts`,
  `e2e/ajuste-pago-mensajero-cierre.spec.ts`, `e2e/reglas-bloqueos-cierre.spec.ts`; re-ejecutar los
  otros seis que abren el diálogo.
- **Hecho:** E2E verde en local con base desechable; mutación `netoEmpresa`→`ganancia` lo pone rojo.

### S3 «Fila de gestión única y lista con filtros» — frontend · depende de S2
R22-R30. ~16 archivos, ~800 líneas. `fila/GestionesCierre.tsx`, `FilaGestion.tsx`,
`fila-gestion-vista.ts`; sustituye `GestionesPorResultado` en el detalle del admin. Tests nuevos
`DetalleCierreGestiones.test.tsx`, `FilaGestion.test.tsx` (tablas de R25/R26 por audiencia; «Sin
dato»; modelo viejo con la tarifa congelada de hoy); adaptar `CorregirPagosCierre`,
`CorregirResultadoCierre`, `CierreEvidenciasVarias486`. E2E: despliega una gestión de cada modelo y
lee sus tarjetas con literales.

### S4 «Cola de cierres única: mensajeros (central y satélite)» — frontend · depende de S2
R32-R37. ~22 archivos, ~850 líneas. `cola/ColaCierres.tsx`, `cola-cierres-vista.ts`,
`cola-cierres-labels.ts`; `CierresAdminModule.tsx` deja de montar `CierreFacturaResumen`,
`CierresAdminHistoricoLista`, `ListaComprobantes`. Tests de cola (columnas por rol y pestaña; «Pago
entregado» y «Registrar pago» solo central); E2E: la satélite no ve «Pago entregado».

### S5 «Diálogos del módulo de cierres y trato tú» — fullstack · depende de S3, S4
R53-R57. ~30 archivos, ~700 líneas (casi todo strings). `dialogos/VisorEvidencia.tsx`,
`dialogos-labels.ts`; labels del módulo, `CierreDiaService` y `ConsolidacionBodegaService` (solo
textos); `RegistrarPagoMensajeroDialog` pasa `mensajeSinSaldo`. Guardia nueva
`tests/unit/guards/cierres-trato-tu.guardia.test.ts` con contraprueba. Tests que afirman textos con
voseo se actualizan al nuevo texto.

### S6 «Detalle de cierre de bodega en el detalle único (central)» — frontend · depende de S3
R31, R40-R43. ~20 archivos, ~800 líneas. Pestañas «Mensajeros» y «Conciliación»;
`CierresBodegaAdminModule.tsx` monta `DetalleCierre` tipo bodega con `ConciliacionAcciones` en el
pie; filas en «solo lectura». Adaptar `CierreBodegaDetalleCascadas`,
`CierreBodegaDesglosePorTienda`, `CierreBodegaDetalleGestiones`, `CierresBodegaAdminRefresco`,
guardias `cascada-central-en-las-dos-pantallas` y `cierre-bodega-vocabulario`;
`e2e/cierre-bodega-satelite.spec.ts`.

### S7 «Cola de bodega de la central: Por conciliar / Conciliados» — fullstack · depende de S4, S6
R44. ~14 archivos, ~600 líneas. `WHERE` de las dos listas en `CierresBodegaAdminRepository`
(incompleto en «Por conciliar»), servicio y descargas; `ColaCierres` bodega · central. **Test de
integración** del `WHERE` contra la base (pendiente, incompleto, recibido) con mutación.

### S8 «Bodega satélite: A consolidar con la cola única» — fullstack · depende de S4, S5
R45-R48, R67. ~22 archivos, ~850 líneas. `ConsolidacionBodegaService` emite «Debe llegar a la
central» agregado y por cierre (misma `paraLaCentral`), y el bloqueo con los nombres; `ColaCierres`
bodega · satélite pestaña 1; diálogo con resumen. Test de servicio con literales (100 000,00 −
3 000,00 − 500,00 = 96 500,00) y de integración del bloqueo.

### S9 «Bodega satélite: Solicitados y su cierre de bodega en lectura» — fullstack · depende de S6, S8
R49-R52, R68. ~20 archivos, ~800 líneas. Permiso del adminSatelite en
`CierresBodegaAdminService.verDetalle` acotado por zona en el `WHERE`, sin fulfillment; tarjetas de
R68; filtro de fecha en la lista. Test de integración: cierre de otra zona → `forbidden`; E2E de la
satélite abriendo su cierre de bodega.

### S10 «/cierre-dia: detalle y cola únicos para el mensajero» — frontend · depende de S3, S4
R58-R60. ~18 archivos, ~800 líneas. Modal de cierre pasado = `DetalleCierre` audiencia mensajero;
«Cierres solicitados» = `ColaCierres` rol mensajero (tarjetas vacías hasta S14: se omiten, no se
pintan con 0); «Ganancia» en Incidente y su descarga. Adaptar `CierreDiaModuleIncidente`,
`cierre-dia-descarga-columnas`, `e2e/cierre-dia.spec.ts`; E2E del mensajero con literales.

### S11 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» — frontend · depende de S10
R61-R63 (y la respuesta a PA2). ~16 archivos, ~850 líneas. `CierreDiaModule.tsx` monta
`DetalleCierre` marco página; pestaña «Corregir»; «Devolver a gestión» en la fila.

### S12 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment» — fullstack · depende de S3
R64-R66. ~18 archivos, ~850 líneas. Lecturas en `CierresAdminRepository` y
`CierresBodegaAdminRepository` (`cierre_detail_concepto` + `tarifa_valor`, `gestion_pago_congelado`,
`orden_fulfillment_movimiento`); derivaciones en sus servicios; la fila las pinta. T0: base del
porcentaje en `derivarIngresoOrden` y si un ajuste re-congela `importe`. Tests de servicio con los
literales del escenario «modelo nuevo» y de integración de las lecturas.

### S13 «Cifras del servidor: reparto en % y señales de la cola» — fullstack · depende de S4
R70. ~14 archivos, ~600 líneas. `lib/utils/porcentajes-reparto.ts` (mayor resto) con tests 94/6 y
97/3/0 y los casos `null`; conteos por página en `CierresAdminRepository`.

### S14 «Cifras del servidor: ganancia pendiente y pagada del mensajero» — fullstack · depende de S10
R69. ~10 archivos, ~450 líneas. `CierreDiaService`; test con dos cierres aprobados (pendientes
45 000,55 y 2 500,00 → 47 500,55; 2 cierres) y un pago anulado que no cuenta.

### S15 «Excel del modelo nuevo de cierres» — fullstack · depende de S12 y de la aprobación de PA3
R73-R75. ~14 archivos, ~800 líneas. Columnas nuevas en
`cierres-gestiones-fundida-descarga-columnas.ts` y la hoja de cierres; elección de formato por
modelo en `DescargarCierresButton.tsx` y `DescargarGestionesDialog.tsx`. Tests: solo viejo =
formato actual idéntico (claves y títulos); solo nuevo; mixto sin cierres repetidos.

### S16 «Retirar los componentes de cierre sustituidos» (chore) — frontend · depende de S1-S15, S17
R76. ~25 archivos (casi todo borrados). Borra lo de `design.md > Qué sustituye cada componente` y
los tests que solo los montaban; guardia que falla si `app/` vuelve a importarlos.

### S17 «Estado de cuenta de la satélite: conciliación en pestaña» — frontend · depende de S6
R78. ~10 archivos, ~450 líneas. `EstadoCuentaSatelite.tsx`, `ConciliacionSatelite.tsx` con
`Cuenta` y el enlace al detalle de bodega.
