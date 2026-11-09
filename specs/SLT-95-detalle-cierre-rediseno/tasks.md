# SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)» — tasks

> El orden sigue el corte propuesto en `requirements.md > PA1`: C → A1 → A2 → B. Si Carlos
> acepta el corte, cada bloque es una ficha con su propio PR y su gate. Si no, la feature entera
> excede `gate.tamano_pr` y necesita `tamano-pr-aceptado`.
>
> `[P]` = paralelizable con la task anterior del mismo bloque. Reparto por capa: todo esto es de
> `frontend_dev`. Solo la rebanada D (PA2), si se aprueba, añade `backend_dev`.
>
> Antes del primer gate, copiar `.env` al worktree (memoria del proyecto: sin `.env`, el gate
> sale verde saltándose la integración).

## T0 — Comprobaciones previas (sin código)

- [ ] **T0.1** — Confirmar que `CierreDiaService.listarCierreDia` deja `pagoMensajero` no nulo
  en las gestiones `incidente`, y que `verCierrePasado` lee el snapshot. **Hecho:** nota en
  `progress/impl_SLT-95.md`, con la línea del servicio.
- [ ] **T0.2** [P] — Comprobar si el alcance del maestro en `CierresAdminService.verCierreDetalle`
  incluye cierres del día con destino satélite (para «Ver su cierre», PA7). **Hecho:** nota con
  el `WHERE` de `findCierreByIdEnAlcance` y la conclusión.
- [ ] **T0.3** [P] — Listar los campos de la marca de conciliación que trae
  `CierreBodegaDetalleServiceResult.cierre` (recibido, falta, quién y cuándo). **Hecho:** nota.
  Si falta alguno, se para y se pregunta (no se inventa).

## Bloque C — `/cierre-dia` incidente y títulos de Excel (R28-R30)

- [ ] **T1.C1** — Rama `incidente` de las columnas de `CierreDiaModule.tsx`: añadir
  `columnaPago`. **Hecho:** `CierreDiaModuleIncidente.test.tsx` afirma que la columna de pago
  existe con el importe del doble y que la de indemnización no (R28).
- [ ] **T1.C2** [P] — `cierre-dia-descarga-columnas.ts`: columna de pago en la sección
  `incidente`. **Hecho:** `cierre-dia-descarga-columnas.test.ts` afirma el encabezado y que el
  valor de la celda es el literal del doble (R29).
- [ ] **T1.C3** — `columnasGestionFundida(filas)` en
  `cierres-gestiones-fundida-descarga-columnas.ts`, y que la usen `DescargarCierresButton` y
  `DescargarGestionesDialog` después de obtener las filas. **Hecho:** tests de los archivos de
  detalle de mensajero y de bodega afirman el título nuevo con filas solo del modelo nuevo, el de
  hoy con filas solo del viejo, y la misma `clave` en ambos (R30). El caso mixto, según la
  respuesta a PA6.
- [ ] **T1.C4** — Gate y E2E local de `e2e/cierre-dia.spec.ts`. **Hecho:** `./init.sh` verde, y
  E2E verde contra una base desechable.

## Bloque A1 — Componente y detalle del mensajero (R1-R12, R17-R19, R26, R27, R31)

- [ ] **T2.1** — `detalle-cierre-vista.ts` (puro): `cifrasDe`, `metodosVisibles`,
  `avisosPorRevisar`, `pestanasDe`, `conteosPorResultado`. **Hecho:**
  `tests/unit/utils/detalle-cierre-vista.test.ts` cubre:
  - las 4 cifras apuntan al campo exacto (R5);
  - el método en "0.00" se omite (R6);
  - los conteos de avisos, y sin avisos no hay franja (R4);
  - las pestañas por estado y permiso (R9).

  Y una contraprueba: con un importe cambiado en el doble, la cifra cambia.
- [ ] **T2.2** [P] — `detalle-cierre-labels.ts`: rótulos nuevos, reusando los `*_LABEL`
  existentes. **Hecho:** typecheck verde, y ningún rótulo «Debe» ni «Ganancia» exportado (R8).
- [ ] **T2.3** — `CifrasCierre.tsx` y `DineroCierre.tsx` (tipo mensajero). **Hecho:**
  `tests/components/DetalleCierreMensajero.test.tsx` lee del DOM:
  - las 4 cifras con los literales del doble (R5, R7);
  - el reparto y las dos cascadas (R12);
  - «Por tienda» solo con dos o más tiendas (R12.4);
  - ningún texto «Debe» (R8);
  - un `netoEmpresa` negativo con su signo (R5).
- [ ] **T2.4** — `DetalleCierre.tsx`, sobre `components/ui/dialog`, con estas piezas:
  - cabecera y estado (R2, R3);
  - «Por revisar» (R4);
  - `tablist` (R9, R31);
  - un solo `tabpanel` desplazable (R10);
  - pie fijo con «Rechazar»/«Aprobar» o «Cerrar» (R11);
  - «Gestiones» con `GestionesPorResultado` y la sección sin gestión (R17);
  - «Rechazados por la tienda» (R18);
  - «Pago al mensajero» por slot (R19).

  **Hecho:** el mismo test de componentes afirma:
  - el nombre accesible del diálogo contiene «Detalle del cierre»;
  - roles `tab`/`tabpanel`;
  - solo el panel tiene `overflow-auto`;
  - los botones del pie según estado;
  - la pestaña de rechazos con conteo y oculta sin rechazos;
  - la pestaña de pago solo con el slot.
- [ ] **T2.5** — `CierresAdminModule.tsx`: sustituir el cuerpo del modal por
  `<DetalleCierre tipo="mensajero">`, pasando callbacks y slots. Los diálogos no se mueven.
  **Hecho:** los tests de componentes del inventario de `design.md` que montan el detalle del
  admin quedan verdes, adaptados sin quitar lo que vigilan. La lista de los tocados va en
  `progress/impl_SLT-95.md`.
- [ ] **T2.6** — Guardias: ampliar el censo de `cierre-detalle-superficies.guardia.test.ts`
  (264/R30, 425/R14) a `DetalleCierre`, revisar `factura-contraste` e `impresion-flujo`, y
  añadir a `DineroIdentidadesEnPantalla.test.tsx` las identidades de la superficie nueva.
  **Hecho:** `pnpm run test:guardias` verde. Cada guardia tiene un caso que falla si se quita la
  prop o la cifra (mutación manual anotada).
- [ ] **T2.7** — Guardia money-safe de la carpeta `detalle-cierre/`: sin `Number(`,
  `parseFloat(`, `parseInt(`, `.toFixed(` ni aritmética sobre importes. Se hace ampliando el
  censo de `tests/unit/guards/liquidacion-money-safe.test.ts`. **Hecho:** la guardia caza un
  `Number(monto)` colado en un archivo de la carpeta (contraprueba) (R26).
- [ ] **T2.8** — E2E `e2e/detalle-cierre-rediseno.spec.ts`. Escenario sembrado con importes
  conocidos y un método en 0; el maestro abre «Ver / decidir». Comprueba:
  - las 4 cifras, los métodos y las cascadas contra **literales** escritos en el spec (R27);
  - sin «Debe» (R8);
  - el método en 0 ausente (R6);
  - el pie visible tras desplazar el cuerpo (R10);
  - «Aprobar» completa como hoy (R11).

  Adaptar `e2e/cierres-admin.spec.ts`, `e2e/wallet-iva-aparte-sl39.spec.ts`,
  `e2e/ajuste-pago-mensajero-cierre.spec.ts` (parte de mensajero) y
  `e2e/reglas-bloqueos-cierre.spec.ts`. **Hecho:**
  - verdes en local con base desechable;
  - re-ejecutados verdes los otros seis E2E del inventario;
  - mutación: cambiar `netoEmpresa` por `ganancia` en `cifrasDe` pone rojo el E2E.
- [ ] **T2.9** — Gate y revisión visual. **Hecho:**
  - `./init.sh` verde;
  - capturas de un cierre real (Preview) con las cifras del detalle viejo al lado, anotadas en
    `progress/impl_SLT-95.md`;
  - Carlos lo aprueba en Preview antes de promover.

## Bloque A2 — Lista y fila desplegada del mensajero (R14, R15, R22-R25)

- [ ] **T3.1** — `senalesDe` en `detalle-cierre-vista.ts`. **Hecho:** test unitario con una
  gestión por señal, y una sin ninguna (R15).
- [ ] **T3.2** — `GestionesCierre.tsx`: filtros con conteo, «Todas», «Con señales» y la tabla
  con sus columnas (R14). **Hecho:** `tests/components/DetalleCierreGestiones.test.tsx`:
  - los conteos de los filtros;
  - filtrar deja solo ese resultado;
  - las columnas con literales del doble.
- [ ] **T3.3** — `FilaGestionCierre.tsx`: datos de la orden, las 4 tarjetas, «Ver cómo se
  calculó» y las acciones por callback. **Hecho:** `tests/components/DetalleCierreFila.test.tsx`:
  - las 4 tarjetas con literales, sin los métodos en 0 (R22);
  - «Sin dato» en lugar de ₡0 sin `ingresoEmpresa` (R22);
  - el ajuste con el pago anterior, el motivo y quién (R22);
  - una tarjeta por concepto, que pliega y despliega (R23);
  - el modelo viejo muestra la columna de tarifa aplicada (R23);
  - sin callback no hay botón (R24);
  - el fulfillment, solo con audiencia `admin` y no nulo (R25).
- [ ] **T3.4** — En `DetalleCierre`, «Gestiones» pasa a `GestionesCierre`; la sección sin
  gestión se queda (R17). **Hecho:**
  - los tests de A1 siguen verdes;
  - el E2E de T2.8 despliega una gestión y lee sus 4 tarjetas con literales;
  - `./init.sh` verde.

## Bloque B — Detalle de bodega (R13, R16, R20, R21 y las partes [B])

- [ ] **T4.1** — Mover `lineasCascadaCentral` y `lineasCascadaDueno` a
  `cierres-admin/_components/cascadas-bodega.ts` (puro, exportado) sin cambiar ni una línea.
  **Hecho:** `CierreBodegaDetalleCascadas.test.tsx` verde sin tocar sus aserciones.
- [ ] **T4.2** — `detalle-cierre-vista.ts` con el tipo `bodega`: cifras, avisos, pestañas, y las
  gestiones de todos los cierres del día con su mensajero. **Hecho:** casos de bodega en
  `detalle-cierre-vista.test.ts` (R5, R4, R9, R14).
- [ ] **T4.3** — `DineroCierre` (bodega) y `MensajerosCierreBodega.tsx`. **Hecho:**
  `tests/components/DetalleCierreBodega.test.tsx`:
  - las 4 cifras y el reparto en tres (R5, R13);
  - las tres cascadas con literales (R13);
  - «Por tienda» según PA3;
  - una fila por mensajero con «Ver su cierre» → `/cierres-admin?cierre=<id>` (R20; PA7);
  - conciliación con «—» sin marca (R21).
- [ ] **T4.4** — `CierresBodegaAdminModule.tsx`: `<DetalleCierre tipo="bodega">`, con
  `ConciliacionAcciones` como slot del pie (R11) y `verFulfillment={audiencia === "admin"}`
  (R25). **Hecho:**
  - el test de bodega afirma que la fila no ofrece corrección ni ajuste (R16) y el fulfillment
    según la audiencia (R25);
  - `CierreBodegaDesglosePorTienda`, `CierreBodegaDetalleGestiones` y
    `CierresBodegaAdminRefresco` adaptados y verdes;
  - guardias `cascada-central-en-las-dos-pantallas` y `cierre-bodega-vocabulario` con el censo
    ampliado.
- [ ] **T4.5** — E2E: `e2e/cierre-bodega-satelite.spec.ts` y la parte de bodega de
  `e2e/ajuste-pago-mensajero-cierre.spec.ts`. El caso de bodega de
  `e2e/detalle-cierre-rediseno.spec.ts` lee las 4 cifras y la conciliación con literales.
  **Hecho:**
  - verdes en local;
  - `./init.sh` verde;
  - aprobación de Carlos en Preview.

## Trazabilidad R → test

| R | Test |
|---|---|
| R1 | `tests/components/DetalleCierreMensajero.test.tsx` (abrir desde cola y resueltos); `DetalleCierreBodega.test.tsx` |
| R2, R3 | `DetalleCierreMensajero.test.tsx`; `DetalleCierreBodega.test.tsx` |
| R4 | `tests/unit/utils/detalle-cierre-vista.test.ts` (avisos); `DetalleCierreMensajero.test.tsx` (franja ausente si resuelto) |
| R5, R7 | `detalle-cierre-vista.test.ts`; `DetalleCierreMensajero.test.tsx`; `DetalleCierreBodega.test.tsx`; `e2e/detalle-cierre-rediseno.spec.ts` |
| R6 | `detalle-cierre-vista.test.ts`; `e2e/detalle-cierre-rediseno.spec.ts` |
| R8 | `DetalleCierreMensajero.test.tsx`; `e2e/detalle-cierre-rediseno.spec.ts`; `e2e/wallet-iva-aparte-sl39.spec.ts` (adaptado) |
| R9 | `detalle-cierre-vista.test.ts`; `DetalleCierreMensajero.test.tsx` |
| R10 | `DetalleCierreMensajero.test.tsx` (un solo `overflow-auto`); `e2e/detalle-cierre-rediseno.spec.ts` (pie visible tras desplazar) |
| R11 | `DetalleCierreMensajero.test.tsx`; `tests/components/CierresAdminModule.test.tsx`; `e2e/detalle-cierre-rediseno.spec.ts` |
| R12 | `DetalleCierreMensajero.test.tsx`; `tests/components/DineroIdentidadesEnPantalla.test.tsx` |
| R13 | `DetalleCierreBodega.test.tsx`; `DineroIdentidadesEnPantalla.test.tsx` |
| R14 | `tests/components/DetalleCierreGestiones.test.tsx` |
| R15 | `detalle-cierre-vista.test.ts` (`senalesDe`) |
| R16 | `DetalleCierreBodega.test.tsx` |
| R17 | `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts` (censo ampliado); `tests/components/CierreFacturaSinGestionar.test.tsx` |
| R18 | `tests/components/CierreRechazosDeTienda.test.tsx` (adaptado) |
| R19 | `tests/components/CierresAdminPagoMensajero.test.tsx` (adaptado) |
| R20, R21 | `DetalleCierreBodega.test.tsx` |
| R22, R23, R24, R25 | `tests/components/DetalleCierreFila.test.tsx` |
| R26 | `tests/unit/guards/liquidacion-money-safe.test.ts` (censo ampliado + contraprueba); revisión del diff: sin `lib/`, `db/` ni migraciones |
| R27 | `e2e/detalle-cierre-rediseno.spec.ts` (literales del escenario) |
| R28 | `tests/components/CierreDiaModuleIncidente.test.tsx` |
| R29 | `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts` |
| R30 | `tests/components/descarga/CierresAdminDescargaDetallada.test.tsx`; `tests/components/descarga/CierresBodegaDescargaDetallada.test.tsx` |
| R31 | `DetalleCierreMensajero.test.tsx`; los E2E que localizan el diálogo por «Detalle del cierre» |

## Archivos esperados

Bloque C:
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/DescargarCierresButton.tsx`
- `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx`
- `tests/components/CierreDiaModuleIncidente.test.tsx`
- `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts`
- `tests/unit/descarga/cierres-gestiones-paridad.test.ts`
- `tests/components/descarga/CierresAdminDescargaDetallada.test.tsx`
- `tests/components/descarga/CierresBodegaDescargaDetallada.test.tsx`

Bloque A1:
- `app/(app)/cierres-admin/_components/detalle-cierre/detalle-cierre-vista.ts`
- `app/(app)/cierres-admin/_components/detalle-cierre/detalle-cierre-labels.ts`
- `app/(app)/cierres-admin/_components/detalle-cierre/DetalleCierre.tsx`
- `app/(app)/cierres-admin/_components/detalle-cierre/CifrasCierre.tsx`
- `app/(app)/cierres-admin/_components/detalle-cierre/DineroCierre.tsx`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `tests/unit/utils/detalle-cierre-vista.test.ts`
- `tests/components/DetalleCierreMensajero.test.tsx`
- `tests/components/CierresAdminModule.test.tsx`
- `tests/components/CierresAdminPagoMensajero.test.tsx`
- `tests/components/CierresAdminIndemnizacion.test.tsx`
- `tests/components/CierresAdminDeepLink.test.tsx`
- `tests/components/CierresAdminConfirmacionFisica.test.tsx`
- `tests/components/CierresAdminRetieneReprogramadas.test.tsx`
- `tests/components/CierreMensajeroDetalleCascadas.test.tsx`
- `tests/components/CierreMensajeroDesglosePorTienda.test.tsx`
- `tests/components/CierreRechazosDeTienda.test.tsx`
- `tests/components/CierreFacturaSinGestionar.test.tsx`
- `tests/components/CierrePremioPendiente.test.tsx`
- `tests/components/CorregirPagosCierre.test.tsx`
- `tests/components/CorregirResultadoCierre.test.tsx`
- `tests/components/cierre-detalle-ajuste-badge.test.tsx`
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`
- `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts`
- `tests/unit/guards/factura-contraste.guardia.test.ts`
- `tests/unit/guards/impresion-flujo.guardia.test.ts`
- `tests/unit/guards/liquidacion-money-safe.test.ts`
- `e2e/detalle-cierre-rediseno.spec.ts`
- `e2e/_escenarios/cierres.ts`
- `e2e/cierres-admin.spec.ts`
- `e2e/wallet-iva-aparte-sl39.spec.ts`
- `e2e/ajuste-pago-mensajero-cierre.spec.ts`
- `e2e/reglas-bloqueos-cierre.spec.ts`

Bloque A2:
- `app/(app)/cierres-admin/_components/detalle-cierre/GestionesCierre.tsx`
- `app/(app)/cierres-admin/_components/detalle-cierre/FilaGestionCierre.tsx`
- `tests/components/DetalleCierreGestiones.test.tsx`
- `tests/components/DetalleCierreFila.test.tsx`

Bloque B:
- `app/(app)/cierres-admin/_components/detalle-cierre/MensajerosCierreBodega.tsx`
- `app/(app)/cierres-admin/_components/cascadas-bodega.ts`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `tests/components/DetalleCierreBodega.test.tsx`
- `tests/components/CierreBodegaDetalleCascadas.test.tsx`
- `tests/components/CierreBodegaDesglosePorTienda.test.tsx`
- `tests/components/CierreBodegaDetalleGestiones.test.tsx`
- `tests/components/CierresBodegaAdminRefresco.test.tsx`
- `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts`
- `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts`
- `e2e/cierre-bodega-satelite.spec.ts`
