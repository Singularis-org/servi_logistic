# SLT-102 «Cola de cierres única: mensajeros (central y satélite)» — bitácora de implementación

## Tanda 1 (backend_dev, 2026-11-10): T0 + T1

Worktree `.worktrees/SLT-102-cola-cierres-mensajeros`, rama `feature/SLT-102-cola-cierres-mensajeros`
(desde 06636b16). Grafo: no consultado (el índice de este worktree no existe, `tasks.md` cabecera); todo
con Grep/Read. Base desechable: **`slt102_t1`** (local, creada con `pg` + `prisma migrate deploy` +
`db:seed`); su URL se exporta antes de cada vitest y nunca se imprime.

### T0.1 — Censo (`grep -l`)

**Tests de componentes que montan `<CierresAdminModule` o `CierresAdminHistoricoLista`** (20). Todos
están en `tasks.md > Archivos esperados`. Lo que localizan:

| Archivo | Qué lee hoy | ¿Cambia? |
|---|---|---|
| `tests/components/CierrePremioPendiente.test.tsx` | «"Histórico"», `PendienteLiquidarBadge`, «Ver detalles del cierre de» | sí |
| `tests/components/CierresAdminDeepLink.test.tsx` | «Pendientes de decisión» | sí (región → fila) |
| `tests/components/CierresAdminDetalleUnico.test.tsx` | «Destrabar cierre vencido» | sí |
| `tests/components/CierresAdminFiltros.test.tsx` | «Pendientes de decisión» | sí |
| `tests/components/CierresAdminModule.test.tsx` | «"Histórico"», «Destrabar…», «Pendientes de decisión», «Ver detalles del cierre de» | sí (T4.2) |
| `tests/components/CierresAdminPagoMensajero.test.tsx` | «"Histórico"», `PendienteLiquidarBadge`, «Pendientes de decisión»; ruta de `CierresAdminModule.tsx` | sí |
| `tests/components/CierresAdminRetieneReprogramadas.test.tsx` | «Comprobante del cierre de»; monta `CierreFacturaResumen` y `CierresAdminHistoricoLista` | sí (superficie «cola» → celda Señales) |
| `tests/components/CorregirResultadoCierre.test.tsx` | `button /^Resueltos/` (l. 371) | sí (→ `tab`) |
| `tests/components/cierre-detalle-ajuste-badge.test.tsx` | `button /^Resueltos/` (l. 324) | sí (→ `tab`) |
| `tests/components/paginacion/ColasPaginacion.test.tsx` | «Cierres del día por estado», «Pendientes de decisión» | sí |
| `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx` | «"Histórico"» | probable (región conservada por R104) |
| `tests/components/descarga/CierresDescarga.test.tsx`, `CierresDescargaNiveles.test.tsx`, `CierresDescargaColumnas.test.tsx`, `CierresAdminDescargaDetallada.test.tsx` | «Descargar …», `Resueltos` | probable (la pestaña pasa a `tab`) |
| `tests/components/CierresAdminConfirmacionFisica.test.tsx` | `button "Ver / decidir"` (l. 279, 523, 864) y la fuente del módulo (l. 555, `{confirmando ? (<ConfirmacionFisicaCuerpo`) | probablemente verde sin tocar: R105 conserva el nombre |
| `tests/components/CierresAdminIndemnizacion.test.tsx` | `button "Ver / decidir"` (l. 241, 648) | probablemente verde sin tocar |
| `tests/components/paginacion/paginacion-transversal.test.tsx` | ruta `CierresAdminHistoricoLista.tsx` (l. 241) y lector `CierresAdminModule.tsx` (l. 245) | sí (la paginación de Resueltos pasa al módulo) |
| `tests/unit/config/paginacion-dominios.test.ts` | rutas de los dos archivos (l. 188, 199) | sí |
| `tests/unit/guards/liquidacion-money-safe.test.ts` | `PendienteLiquidarBadge`, `CierresAdminHistoricoLista` | sí (censo con `cola/`) |

**E2E** (por las mismas regiones, sin los de bodega): coinciden con la lista de `## Archivos esperados`
(`cierres-rediseno`, `cierres-admin`, `ajuste-pago-mensajero-cierre`, `cierre-vencido-modelo`,
`cierre-modelo-nuevo-plan-porcentual`, `cierres-admin-rechazos-sla`, `reglas-bloqueos-cierre`,
`tarifas-activacion`, `tarifas-valor-propio-mensajero`, `tope-intentos-por-empresa`,
`wallet-iva-aparte-sl39`). `e2e/_wallet-iva-sl39-siembra.ts` solo lo nombra en un comentario (l. 18):
no cambia. `cierres-rediseno.spec.ts` ya localiza por la tarjeta en S2/S3 (l. 83-85, 203-206): T6.1
también adapta esos dos puntos.

**Guardias que miran los dos archivos:**
- `contadores-cabecera.guardia` (l. 105): exige en `CierresAdminModule.tsx` el contador del `total`
  (forma `conteo: X.total`); no mira `CierresAdminHistoricoLista`.
- `paginacion-dominios` (l. 188, 199) y `paginacion-transversal` (l. 241-245): fijan
  `CierresAdminHistoricoLista.tsx` como dueño de la paginación del histórico → cambian (T5.2).
- `superficie-de-uso`: anotación `/** @sin-superficie <motivo> */` junto al export (l. 40, 81).
- `factura-contraste` (l. 87, 660-664): censa `cierre-factura.tsx` y ancla `CierresAdminModule.tsx:749`
  en un comentario de `acciones`; revisar si la línea se mueve.

**Fuera de la lista, leen la fuente del módulo y deben seguir verdes sin tocarlos** (aviso al leader,
no son archivos nuevos del diff):
- `tests/components/CierreFacturaPapel.test.tsx:589` (sin `<CierreFacturaDetalle`, sin `max-h-[70vh]`);
- `tests/unit/guards/impresion-flujo.guardia.test.ts:1047-1053` (exige `<DetalleCierre`, sin `print:`);
- `tests/unit/descarga/cierres-descarga-detallada-puerta.test.ts:66-68` (exige
  `accion={(f) => descargarDatos("listarGestionesCierresAdminCompleto", f)}`);
- `tests/unit/descarga/cierres-gestiones-paridad.test.ts:138-141` (exige `<DescargarCierresButton` e
  import de `./DescargarCierresButton`);
- `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts:197` (el módulo monta el detalle único);
- `tests/unit/guards/tema-encendido.guardia.test.ts:137` (solo cita la ruta);
- `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts:168`: exige **más de 2** usos
  de los comprobantes ajenos en `app/`. Hoy son 4 (`CierreFacturaResumen` en el módulo y en
  `CierresAdminHistoricoLista`, `…Propio` en `CierreDiaModule`, `CierreConsolidable…` en
  `ConsolidacionBodegaModule`); al quitarlo del módulo quedan 3 y sigue verde **mientras el componente
  `CierresAdminHistoricoLista` conserve su JSX**. Si SLT-115 lo borra, esta guardia se pone roja.

**Importadores fuera de `CierresAdminModule`:**
- `CierreFacturaResumen` (componente, `cierre-factura.tsx:724`): en `app/` solo lo montan
  `CierresAdminModule.tsx` y `CierresAdminHistoricoLista.tsx` (`CierreDiaModule` monta
  `CierreFacturaResumenPropio`, que solo comparte prefijo). Tras S4 queda sin superficie →
  `@sin-superficie`, como prevé el design. Tests que lo montan suelto y no cambian:
  `CierreAdminBloqueoMensajero`, `CierreBodegaTarjetaCascada`, `CierreFacturaFechaCR`,
  `CierreFacturaPapel`, `CierreIngresoBodegaTarjetaListado`, `CierreMotivoRechazoSoloRechazado`.
- `CierresAdminHistoricoLista` (componente): solo `CierresAdminModule.tsx` en `app/` → `@sin-superficie`.

### T0.2 — Lecturas con archivo:línea

1. **Nombre de zona (R106, PA3).**
   - Satélite: `actor.zonaId` (`lib/auth/resolve-actor.ts:45`) y el catálogo, que para el satélite solo
     trae SU zona (`lib/repositories/CierresAdminRepository.ts:1534`, `{ id: zonaDelActor }`), con
     `{ id, nombre }` (`lib/types/filtros-cierres.ts:222-225, 251`). Se resuelve sin lectura nueva.
   - Central: el catálogo del acceso total incluye la central (`CierresAdminRepository.ts:1537`,
     `{ esCentral: true }, // la GAM`), pero el DTO **no dice cuál es** (solo `id` y `nombre`), y el
     maestro no tiene por qué tener `zonaId`. **No hay fuente fiable sin lectura nueva → «Bodega
     central.»**, como resolvió Carlos en PA3.
2. **`Tabs` controlado monta solo el panel activo:** `components/ui/tabs.tsx:71` (`TabsContent` =
   `TabsPrimitive.Panel`); base-ui `tabs/panel/TabsPanel.js:37` (`keepMounted = false`) y `:110-111`
   (no pinta si no está montado). **`DataTable` con `ariaLabel`:** `components/shared/DataTable.tsx:658-659`
   (`<table aria-label={ariaLabel}>`): rol implícito `table`, filas `<tr>` = `row` con nombre por su
   contenido.
3. **`RegistrarPagoMensajeroDialog`** (`app/(app)/cierres-admin/_components/RegistrarPagoMensajeroDialog.tsx`):
   `trasAprobar = false` por defecto (l. 58); `cancelLabel={trasAprobar ? PAGO_MENSAJERO_TEXTO.ahoraNo : undefined}`
   (l. 98) → sin `trasAprobar` no hay «Ahora no»; `await onRegistrado?.(pago)` (l. 89).
4. **(PA1) Tablas y reglas reales.**
   - `gestion_orden.indemnizacion` (`db/schema.prisma:1383`) y `gestion_orden.cierre_id` (l. 1384).
     **Desvío menor del design:** la columna es `cierre_id`, no `cierre_dia_id`.
   - Ajustes de pago SLT-56: `gestion_pago_mensajero_ajuste` (`db/schema.prisma:4614`, `gestion_id`,
     `cierre_id`, `organizacion_id`); append-only, varias filas por gestión.
   - El detalle lee las gestiones con `where: { cierreId }` (`CierresAdminRepository.ts:1636`), sin filtrar
     anuladas, y TODOS los ajustes de cada gestión (`:371`, sin filtro por `cierre_id` del ajuste).
   - «Pago ajustado» = `ajustesPago.length > 0` (`components/private/cierres/fila/fila-gestion-vista.ts:83`,
     `detalle-cierre-vista.ts:715`); «sin indemnizar» = `incidente` con `indemnizacion === null`
     (`fila-gestion-vista.ts:86`, `detalle-cierre-vista.ts:716`); «Vuelve a bodega» = `vuelveABodega`
     (`fila-gestion-vista.ts:94`; `lib/types/gestion-retorno.ts:33-39`: `reprogramado`, `novedad`,
     `devolucion_a_origen_por_rechazo`).
   - **Observación para Preview (no contradice R109):** la franja del detalle «N paquetes vuelven a
     bodega» (`detalle-cierre-vista.ts:678-680`) suma además las órdenes **barridas** por el corte; la
     cola cuenta solo **gestiones** (R109: «igual a la lista Gestiones»). Si un cierre tiene barridas, la
     cola dirá menos que la franja del detalle.

### T0.3 — Literales (escritos antes de los tests)

Escenario A (`e2e/cierres-rediseno.spec.ts:24-30, 64-76`): entregas de 70.000 (efectivo) y 30.000
(SINPE), un rechazo; mensajero 1.500 por entrega y 500 por rechazo. `money()` usa los valores por
defecto de `lib/config/moneda.ts:76-80` (`₡`, miles «.», decimal «,») y omite la cola si es «,00»
(`moneda.ts:238`). Confirmado ejecutando `money()` con `tsx`.

| Entrada | Derivación a mano | Literal |
|---|---|---|
| Recaudado (`totales.general`) | 70.000 + 30.000 + 0 = 100.000 → `"100000.00"` | «₡100.000» |
| Pago al mensajero (`totalPagoMensajero`) | 1.500 × 2 + 500 = 3.000 → `"3000.00"` | «₡3.000» |
| Pendiente tras aprobar | P = 3.000, E = 70.000 → `min(P,E)` = 3.000 → P − 3.000 + premios 0 − pagos 0 = 0 (`lib/utils/cuenta-por-pagar.ts`, `lib/utils/pendiente-cierre.ts`) → `"0.00"` | «Liquidado» |
| Unidad: pendiente `"45000.55"` | — | «Pendiente ₡45.000,55» |
| Unidad: pendiente `"0.00"` / `null` | — | «Liquidado» / «—» |
| (PA1) señales del escenario A | 0 incidentes; 0 ajustes; 1 rechazo (vuelve) | solo «1 vuelve a bodega» |

**ABIERTO-1 (contradice `design.md > Verificación` y `tasks.md > T6.1`).** En el escenario A el
mensajero se queda con 70.000 en efectivo, que cubren sus 3.000: tras aprobar el pendiente es `"0.00"`
y la fila dice «Liquidado». **No aparece «Pendiente …» ni «Registrar pago»**, así que el E2E de S4
«aprueba → Resueltos con «Pendiente <monto>» y «Registrar pago» → registra → «Liquidado»» no se puede
escribir sobre el escenario A tal cual. Hace falta un cierre con E < P (p. ej. las dos entregas por
SINPE: E = 0, pendiente 3.000 → «Pendiente ₡3.000»). Lo decide el leader/humano; no se inventa aquí.

**ABIERTO-2 (PA1 en el E2E).** El escenario A solo produce «1 vuelve a bodega». Para afirmar «las tres
señales con su conteo» (T6.1) el E2E necesita sembrar además un incidente sin indemnizar y un ajuste de
pago por los servicios. Falta decidir qué siembra.

### T1 — Servidor (PA1)

**Decisiones técnicas (anotadas):**
- `contarSenalesPorCierre` es **opcional** en `ICierresAdminRepository`: hay 16+ dobles completos y
  varios parciales (`as ICierresAdminRepository`); hacerla obligatoria tocaba ~20 archivos de test fuera
  del presupuesto del PR, y un parcial sin el método rompería en ejecución. Ausente → la fila no lleva
  `senalesCola` (no afirma «0»). Contra el «composition root que no inyecta»: el test unitario afirma que
  `CierresAdminRepository` la implementa y que `lib/actions/cierres-admin.ts` construye el servicio con
  `new CierresAdminRepository(`.
- El SQL vive en `lib/repositories/_shared/senales-cola-cierre.ts`, no en `CierresAdminRepository.ts`:
  ese archivo está en `EXCEPCIONES_SQL_A_MANO` (su `UPDATE "orden"` lo cubre la RLS) y la guardia
  `sql-a-mano-por-empresa` decide por archivo; escribir `organizacion_id` allí la habría obligado a sacarlo
  de la lista tapando el otro SQL.
- Empresa: `g."organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), '')` (precedente
  `_shared/tope-intentos-empresa.ts`); sin empresa no casa nada.
- Una consulta, `COUNT(*) FILTER`, `GROUP BY cierre_id`; con la lista vacía no consulta. El servicio la
  llama una vez por `conPendiente` (cola, histórico, listado sin paginar, conjuntos de descarga y
  detalle); el cierre que no sale en el mapa recibe `{0,0,0}`.

**Archivos:**
- creado `lib/repositories/_shared/senales-cola-cierre.ts`
- modificado `lib/interfaces/services/ICierresAdminService.ts` (`SenalesColaCierre`, `CierreAdminResumen.senalesCola?`)
- modificado `lib/interfaces/repositories/ICierresAdminRepository.ts` (`contarSenalesPorCierre?`)
- modificado `lib/repositories/CierresAdminRepository.ts` (delegación de 3 líneas)
- modificado `lib/services/CierresAdminService.ts` (`conPendiente`, `SIN_SENALES_COLA`)
- creado `tests/integration/db/cierres-cola-senales-sql-real.test.ts`
- creado `tests/unit/services/cierres-admin-senales-cola.test.ts`
- `git diff db/` vacío.

**Mapa R → test (esta tanda):**

| R | Test |
|---|---|
| R109 (una consulta, `WHERE` por ids y empresa, igual a «Gestiones») | `tests/integration/db/cierres-cola-senales-sql-real.test.ts` (5 casos); `tests/unit/services/cierres-admin-senales-cola.test.ts` (una llamada por página, también vacía; campo por fila; sin método → sin campo; cableado) |
| R70 (conteos del servidor, parte de la cola) | los dos anteriores; lo que se pinta (R110) es de T2/T3 |

**Mutaciones (sobre la base `slt102_t1`; cada una restaurada y comprobada con `cmp`):**

| Mutación | Resultado |
|---|---|
| quitar `AND g."organizacion_id" = …` | ROJO: 2 fallan («cuenta … a mano», «OTRA empresa no se cuela») |
| quitar `AND g."indemnizacion" IS NULL` | ROJO: 2 fallan («cuenta … a mano», «igual a la lista Gestiones») |
| quitar `g."cierre_id" = ANY(…)` | ROJO: 2 fallan («cuenta … a mano», «no se pidió no sale») |
| servicio: una llamada por fila | ROJO: 3 fallan (cola, histórico, página vacía) |

### Verificación (salida real)

Todo con `DATABASE_URL` de `slt102_t1` exportada antes de cada vitest.

- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin él, `tsc` muere por memoria):
  `TSC_EXIT=0`.
- `eslint` de los 7 archivos tocados: `LINT_EXIT=0`.
- `vitest run tests/integration/db/cierres-cola-senales-sql-real.test.ts`: `Tests 5 passed (5)`.
- `vitest run tests/unit/services/cierres-admin-senales-cola.test.ts`: `Tests 6 passed (6)`.
- `vitest related --run` sobre los 5 archivos de `lib/` tocados: `66 failed | 3846 passed | 689 skipped`.
  **Ningún fallo es de unidad ni de componente**: los 123 archivos con fallos son de
  `tests/integration/`, y los errores son de base vacía («tabla `orden` vacia: corre db:seed», «la tabla
  `usuario` esta vacia», «faltan la zona central…», timeouts). Ninguno nombra `senalesCola` ni el SQL nuevo.
  Contraprueba: los 20 de cierres que fallaron, en serie, **con** el cambio (61 failed | 6 passed) y con los
  4 archivos de `lib/` devueltos a HEAD (61 failed | 6 passed): **los mismos fallos, uno por uno** (`diff`
  vacío). Son de la base desechable recién sembrada (solo catálogos), no de esta tanda.
- `vitest run guard` (`test:guardias`): `4 failed | 4808 passed`, los 4 en
  `dependencias-declaradas-presentes.guardia.test.ts`: busca en `init.sh` el marcador
  «>>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<» y `scripts/verificar-dependencias.mjs`, que el `init.sh`
  de esta rama no tiene (l. 204: «>>> FIN PASO 2: DEPENDENCIAS <<<»). Esta tanda no toca `init.sh`
  ni `scripts/`: es previo, del arnés; aviso al leader. `sql-a-mano-por-empresa` en verde.

**Veredicto:** T0 y T1 hechos; servidor de PA1 listo con el `WHERE` probado contra Postgres real (4
mutaciones en rojo); quedan dos ABIERTOS de T0.3 para el E2E (pendiente del escenario A y siembra de las
tres señales).

## Tanda 2 (frontend_dev, 2026-11-10): T2 + T3 + T4

Mismo worktree y rama. Grafo: no consultado (índice de este worktree inexistente); Grep/Read. Toda
ejecución de vitest con `DATABASE_URL` de la desechable `slt102_t1` exportada antes (nunca impresa).

### Archivos

- creado `components/private/cierres/cola/cola-cierres-labels.ts` (descripción por rol, pie, columnas,
  «Pendiente », nombres accesibles de R105, textos de R110)
- creado `components/private/cierres/cola/cola-cierres-vista.ts` (`columnasCola`, `folioCola`,
  `fechaCola`, `pagoEntregadoDe`, `senalesDe`, `accionesFilaDe`)
- creado `components/private/cierres/cola/ColaCierres.tsx`
- modificado `app/(app)/cierres-admin/_components/CierresAdminModule.tsx` (monta `ColaCierres`; fuera
  `SegmentedToggle`, `PanelConmutado`, `ListaComprobantes`, `CierreFacturaResumen`,
  `CierresAdminHistoricoLista` y `AccionesCola`; `ofertaPago` → `pagoAbierto` con `trasAprobar`; la
  paginación de Resueltos se monta en el módulo; prop `zonaNombre`)
- modificado `app/(app)/cierres-admin/_components/CierresAdminHistoricoLista.tsx` (exporta
  `ERROR_CARGA_HISTORICO` y `VACIO_HISTORICO`; comentario de por qué no lleva `@sin-superficie`)
- modificado `app/(app)/cierres-admin/page.tsx` (sin `description`; `zonaNombre` de PA3)
- creado `tests/unit/utils/cola-cierres-vista.test.ts` (25 casos)
- creado `tests/components/ColaCierres.test.tsx` (16 casos)
- modificado `tests/components/CierresAdminModule.test.tsx` (6 casos adaptados a la fila/`tab`; 8 nuevos)
- modificado `tests/components/CierresAdminPage.test.tsx` (**fuera del censo de T0.1**, aviso al
  leader: su caso «maestro» pulsaba `button /^Resueltos/`; pasa a `tab`, y se añade R106 de la página)
- `git diff` de `CierresBodegaAdminModule.tsx`, `ConsolidacionBodegaModule.tsx`, `CierresTabs.tsx` y
  `app/(app)/cierre-dia/`: vacío. `cierre-factura.tsx`: sin cambios netos.

**Decisión técnica (anotada):** el design pedía `@sin-superficie` en `CierresAdminHistoricoLista` y
`CierreFacturaResumen`. La guardia `superficie-de-uso` decide **por módulo**: los dos archivos siguen
alcanzables por otros exports (`descargaHistoricoCierres`/`PAGINACION_HISTORICO_LABEL`;
`SeccionSinGestion`), así que la anotación la pone roja («la excepción caducó»). No se anota; queda un
comentario en el componente. Con eso `superficie-de-uso` está verde (18/18).

### Fidelidad al canvas (F1-F11)

| # | Resultado |
|---|---|
| F1 | igual al canvas: `tablist` «Cierres del día por estado», `tab` «Pendientes n» / «Resueltos n», subrayado (clases de `DetalleCierre`) |
| F2 | igual: barra entre pestañas y tabla, «Descargar» a la derecha en la misma fila, fuera de los paneles |
| F3 | igual: Folio · Mensajero · Solicitado/Resuelto · Estado · Recaudado · Pago al mensajero · (Pago entregado) · Señales · acciones (cabecera vacía, `sr-only` «Acciones») |
| F4 | igual en forma (folio mono 13 px, importes a la derecha, estado en pastilla); colores de la pastilla: ver ABIERTO-3 |
| F5 | igual: `pl-4 text-xs text-warning-strong` (#92400e), unidas por « · » |
| F6 | igual: «Ver / decidir» y «Registrar pago» `default`; «Ver» y «Destrabar» `outline`; 32 px / 13 px |
| F7 | igual con la desviación listada «`money()` de hoy»: «Pendiente ₡47.500», «Liquidado», «—» |
| F8 | igual: satélite sin «Pago entregado» ni «Registrar pago» |
| F9 | igual con la desviación de PA3: central «Bodega central. …» (sin fuente de zona), satélite «Bodega satélite · <zona>. …» |
| F10 | igual: «Un cierre vencido se puede destrabar como excepción.» + paginación de hoy (desviación listada) |
| F11 | igual: sin tarjetas de cifras |

Desviaciones usadas, todas de la tabla del design: título en `AppPage`, conmutador donde está, región
«Histórico», `Pagination` de hoy, `fechaHora`, `money()`, «Destrabar» con nombre largo, placeholder
«Usá los filtros…», sin destino/métodos/ingreso/«Ver detalles»/motivo.

### ABIERTOS (no decididos aquí)

- **ABIERTO-3 — colores de la pastilla de estado.** El canvas pinta «Solicitado» en ámbar
  (#fef3c7/#92400e) y «Aprobado» en verde (#d1fae5/#047857); R101 pide «la pastilla de hoy»
  (`EstadoCierreBadge`), que da `secondary` (neutra) a solicitado y `outline` a aprobado
  (`cierre-detalle-shared.tsx:207-215`). Cambiarla tocaría también el detalle. No está en la tabla de
  desviaciones: decide Carlos (Preview).
- **ABIERTO-4 — filtro «Bodega» en la barra.** El canvas dibuja Fecha de solicitud · Mensajero ·
  Estado; R100 conserva los de hoy (Fecha, Bodega, Mensajero, Estado) con `FiltrosCierresBarra` sin
  cambios. No está en la tabla de desviaciones.
- ABIERTO-1 y ABIERTO-2 de la tanda 1 (escenario del E2E) siguen abiertos; no son de esta tanda.

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R32/R107 (cola única montada, sin comprobantes; aviso sin zona) | `CierresAdminModule.test.tsx` «R106/R107: la central ve…», «R3: sinZona…» |
| R33 | `cola-cierres-vista.test.ts` «columnasCola»/«accionesFilaDe»; `ColaCierres.test.tsx` «central · Pendientes: columnas y celdas» |
| R34 | `cola-cierres-vista.test.ts` «satélite: …», «Resueltos: la satélite nunca registra pago»; `ColaCierres.test.tsx` «satélite: ni …»; `CierresAdminModule.test.tsx` «R34: la satélite…», «R34: la central sin permiso…» |
| R35/R102 | `cola-cierres-vista.test.ts` «senalesDe»; `ColaCierres.test.tsx` «una señal con nota…», «una fila sin señales…» |
| R36 | `CierresAdminModule.test.tsx` «R8/R9…» (Ver / decidir → detalle), «R15…» (Ver de un vencido → sin aprobar/rechazar), «R5: un cierre del histórico se abre en solo lectura» |
| R99 | `ColaCierres.test.tsx` «un tablist…», «cambiar de pestaña…»; `CierresAdminModule.test.tsx` «R99: los conteos…», «R99/R100: cambiar de pestaña conserva…» |
| R100 | `ColaCierres.test.tsx` «cambiar de pestaña … no desmonta la barra»; `CierresAdminModule.test.tsx` «R99/R100…» |
| R101 | `cola-cierres-vista.test.ts` «folioCola y fechaCola»; `ColaCierres.test.tsx` «columnas y celdas», «el folio va en letra monoespaciada»; `CierresAdminModule.test.tsx` «R4», «R5» |
| R103 | `cola-cierres-vista.test.ts` «pagoEntregadoDe»; `ColaCierres.test.tsx` «Pendiente ₡47.500…», «Registrar pago solo en…»; `CierresAdminModule.test.tsx` «R103: Registrar pago abre…», «R103: cerrar el diálogo…» |
| R104 | `ColaCierres.test.tsx` «carga», «error», «vacío» |
| R105 | `ColaCierres.test.tsx` «botones de la fila»; `CierresAdminModule.test.tsx` «R16: destrabar pide confirmación…» |
| R106 | `cola-cierres-vista.test.ts` «descripcionCola»; `ColaCierres.test.tsx` «la descripción va encima…»; `CierresAdminModule.test.tsx` «R106…»; `CierresAdminPage.test.tsx` «R1: el rol maestro…» (sin la vieja) y «SLT-102 (R106, PA3)…» |
| R108 | `CierresAdminModule.test.tsx` «R4» (sin destino), «R5» (sin motivo) |
| R110 | `cola-cierres-vista.test.ts` «las del servidor (R110)…», «todas juntas…»; `ColaCierres.test.tsx` celda «1 incidente sin indemnizar · 6 vuelven a bodega» |
| R71 | `grep -rnF -e "Number(" -e parseFloat -e toFixed components/private/cierres/cola/` → vacío; T5.2 lo pone en `liquidacion-money-safe` |

### Mutaciones (cada una restaurada; el script compara el archivo con el original)

| Mutación | Resultado |
|---|---|
| vista: `registrarPago` también a la satélite | ROJO: unidad «la satélite nunca registra pago» + componente «satélite: ni …» |
| vista: «Pago entregado» también a la satélite | ROJO: 3 (unidad, componente, módulo «R34: la satélite…») |
| módulo: conteo con `colaPendientes.items.length` | ROJO: «R99: los conteos … del `total`» |
| módulo: «Registrar pago» a la satélite (quitar `rolCola === "central"`) | **verde sola**: la tapa la segunda guarda de `accionesFilaDe`; con las dos quitadas, ROJO «R34: la satélite…» |

### Verificación (salida real)

- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`): `TSC_EXIT=0`.
- `eslint` de los 8 archivos tocados: `LINT_EXIT=0`, sin avisos.
- `vitest run` de los 4 archivos de test tocados: `Test Files 4 passed (4)`, `Tests 93 passed (93)`.
- `vitest related --run` de los 7 fuentes tocados (antes de arreglar `CierresAdminPage`):
  `Test Files 12 failed | 46 passed (58)`, `Tests 55 failed | 981 passed (1036)`. Los 11 que siguen
  rojos son **todos** del censo de T0.1 que adapta T5.1 (localizan por la tarjeta, por `button
  /^Resueltos/` o por la región vieja): `CierrePremioPendiente` (6), `CierresAdminDetalleUnico` (7),
  `CierresAdminPagoMensajero` (14), `CorregirResultadoCierre` (2), `cierre-detalle-ajuste-badge` (2),
  `descarga/CierresAdminDescargaDetallada` (2), `descarga/CierresDescarga` (7),
  `descarga/CierresDescargaColumnas` (5), `descarga/CierresDescargaNiveles` (1),
  `paginacion/BajoRiesgoPaginacion` (4), `paginacion/ColasPaginacion` (4).
- `pnpm run test:guardias`: `Tests 7 failed | 4804 passed | 1 skipped`, 4 archivos:
  - `dependencias-declaradas-presentes` (4): previo, del arnés (ya anotado en la tanda 1);
  - `liquidacion-money-safe` (1): el censo no incluye `cola/` → T5.2;
  - `cobertura-tablas` (1): `ColaCierres.tsx #1` sin registrar en `tests/unit/descarga/censo-tablas.ts`
    → **fuera de la lista de T5.2**, aviso al leader; se registra en T5.2;
  - `superficie-de-uso`: rojo con las anotaciones del design, **verde** sin ellas (decisión de arriba).

**Veredicto:** T2-T4 hechos y en verde en lo suyo; la cola única pinta F1-F11 como el canvas salvo las
desviaciones listadas y dos ABIERTOS (colores de la pastilla, filtro «Bodega»); quedan para T5 los 11
tests del censo y 3 guardias.

## Tanda 3 (frontend_dev, 2026-11-10): decisiones de Carlos + T5

### Decisiones de Carlos aplicadas

- **ABIERTO-3 → cerrado.** `ESTADO_BADGE_VARIANT` (`cierre-detalle-shared.tsx`) toma los colores del
  canvas con los tokens que ya existen: `solicitado` → `warning` (#fef3c7 / #92400e), `aprobado` →
  `success` (#d1fae5 / #047857), `rechazado` y `vencido` → `destructive` (= par `danger`, #fee2e2 /
  #b91c1c). Los cuatro estados de `CIERRE_ESTADO_SEED` los pinta el canvas: ninguno queda neutro, sin
  ABIERTO. Un solo componente: el detalle los hereda. Test: `ColaCierres.test.tsx` «color de la
  pastilla de estado» (4 casos). Mutación «solicitado/aprobado a los colores viejos» → ROJO (2).
- **ABIERTO-4 → cerrado.** `FiltrosCierresBarra` gana `sinBodega` (apagado por defecto: las mitades de
  bodega lo conservan); sin bodega el mensajero deja de declarar `dependsOn`/`parentValue`.
  `CierresAdminModule` lo pasa. R100 enmendado en `requirements.md`; filas F12 (pastilla) y F13
  (barra) en `design.md > Fidelidad al canvas` como «igual al canvas». Tests:
  `FiltrosCierresBarraEstado.test.tsx` (nuevo caso `sinBodega`; el de bodega sigue fijando
  «Fecha de solicitud, Bodega») y `CierresAdminFiltros.test.tsx`. Mutación «quitar `sinBodega` del
  módulo» → ROJO.

### T5.1 — tests adaptados («antes leía X, ahora lee Y»)

| Archivo | Antes | Ahora |
|---|---|---|
| `CierrePremioPendiente` | `button` Resueltos; `listitem` del comprobante, «₡5.000» y desplegar «Ver detalles» para ver ₡10.000 | `tab` Resueltos; filas de la tabla; «Pendiente ₡5.000» en «Pago entregado» y ₡10.000 en «Pago al mensajero», por columna. Misma vigilancia: snapshot ≠ deuda |
| `CierresAdminDetalleUnico` | `button` Resueltos | `tab` Resueltos |
| `CierresAdminPagoMensajero` | `button` Resueltos; «₡1.234,50»; `list`/`listitem` «Histórico» | `tab`; «Pendiente ₡1.234,50»; filas de la tabla «Histórico», con la celda «Pago entregado» de los tres casos («Pendiente ₡0…», «Liquidado», «—»); el barrido money-safe suma `ColaCierres.tsx` y `cola-cierres-vista.ts` |
| `CorregirResultadoCierre`, `cierre-detalle-ajuste-badge` | `button` Resueltos | `tab` Resueltos |
| `descarga/CierresDescarga`, `CierresDescargaColumnas` | helper de pestaña por `button` | `tab` si existe (cola de mensajeros) y `button` si no (mitades de bodega) |
| `descarga/CierresDescargaNiveles` | `button` Resueltos | `tab` Resueltos |
| `descarga/CierresAdminDescargaDetallada` | `button` Pendientes/Resueltos y `aria-pressed` | `tab` y `aria-selected` |
| `paginacion/ColasPaginacion` | cola de cierres del día como `list` y contador «(60)» en el `group` | `table`, contador «Pendientes 60» en el `tablist` (campos `contadorRol` y `textoContador`); la comprobación «no dice el tamaño de la página» sigue |
| `paginacion/BajoRiesgoPaginacion` | histórico como `list` escondida, `button` Resueltos; Q-I3 con `listitem` | `table`; `tab` o `button` según haya; R44 abre la pestaña con un `fireEvent.click` SÍNCRONO (la cola única solo monta la pestaña activa) y sigue afirmando el primer pintado sin ir al servidor; Q-I3 con filas |
| `CierresAdminFiltros` | 4 filtros con «Bodega»; encadenado bodega → mensajero; caso (2) filtra por bodega | 3 filtros (enmienda R100); «sin Bodega, el mensajero ofrece a TODOS» (el encadenado no tiene padre en esta barra); el caso (2) filtra por mensajero |
| `CierresAdminRetieneReprogramadas` | superficies cola e histórico = `CierreFacturaResumen` / `CierresAdminHistoricoLista` | la celda «Señales» de `ColaCierres` en Pendientes y en Resueltos; mutación «pintar con 0» (`retenidas >= 0`) → ROJO (3) |
| `ColaCierres`, `FiltrosCierresBarraEstado` | — | casos nuevos de color y de `sinBodega` |

### T5.2 — guardias

- `liquidacion-money-safe`: los tres archivos de `cola/` en el censo → verde.
- `cobertura-tablas`: `ColaCierres.tsx` registrado en `censo-tablas.ts` como `fuera` (su `<DataTable>`
  no declara `descarga=`; la descarga va en la barra, `DescargarCierresButton`). Totales 37→38 archivos
  e instancias, exclusiones 15→16, `fuera` 16→17, censo 38→39. **Decisión técnica a confirmar por el
  leader:** la guardia exige que una tabla de `components/` tenga más de un montaje. `ColaCierres` hoy
  tiene uno (`CierresAdminModule`). Añadí el campo `montajesPrevistos` (SLT-105, SLT-106, SLT-108): la
  regla pasa a «montajes + previstos > 1», y `montajes` se sigue contrastando contra el árbol.
- `superficie-de-uso`, `contadores-cabecera`, `paginacion-dominios`, `factura-contraste`: verdes sin cambios.
- `dependencias-declaradas-presentes`: **roja, sin tocar**. Línea exacta:
  `Error: init.sh ya no tiene el marcador ">>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<": la guardia no
  puede ejecutar el paso 2.` (`dependencias-declaradas-presentes.guardia.test.ts:267`), más
  `expected '#!/usr/bin/env bash…' to contain 'scripts/verificar-dependencias.mjs'`. `git diff HEAD
  origin/dev -- init.sh` está vacío y la merge-base es la punta de `origin/dev` local (742989932bc6):
  el `origin/dev` de este clon no tiene el cambio de la ficha 420 (¿sin `fetch`?).

### Verificación (salida real)

- `pnpm run typecheck`: `TSC_EXIT=0`.
- `eslint` de los 21 `.ts/.tsx` tocados: `LINT_EXIT=0`, sin avisos.
- `vitest run` de los 20 archivos de test tocados en las tandas 2 y 3: `Test Files 20 passed (20)`,
  `Tests 324 passed (324)`.
- `vitest related --run` de `cierre-detalle-shared.tsx`, `FiltrosCierresBarra.tsx`,
  `CierresAdminModule.tsx` y `ColaCierres.tsx`: `Test Files 84 passed (84)`, `Tests 1516 passed (1516)`.
- `pnpm run test:guardias`: `Test Files 1 failed | 341 passed (342)`, `Tests 4 failed | 4807 passed |
  1 skipped`; los 4 son `dependencias-declaradas-presentes` (arriba).

**Veredicto:** decisiones de Carlos aplicadas y T5 hecho; todo verde salvo
`dependencias-declaradas-presentes`, que es del arnés y no se tocó. Pendiente de confirmar:
`montajesPrevistos` en la guardia de cobertura.

## Tanda 4 (frontend_dev, 2026-11-10): T6 (E2E)

Base desechable NUEVA `slt102_e2e` (creada con `pg`, `prisma migrate deploy` + `db:seed`), su
`DATABASE_URL` exportada antes de cada comando. App con `next build` + `next start` (como `gate.yml`),
`NEXT_PUBLIC_APP_URL`/`APP_BASE_URL` = `http://localhost:3102`, `E2E_PUERTO=3102`. Un solo servidor
(el de Playwright); las mutaciones, con `E2E_SERVIDOR=dev` y ningún otro servidor vivo.

### ABIERTO-1 y ABIERTO-2 de T0.3 → cerrados (decisión del leader)

Escenario S4 propio en `cierres-rediseno.spec.ts` (sembrado con los servicios de `_escenarios/`):

- **Central** (tarifa y pago del escenario A: 1.500 por entrega; incidente y rechazo no pagan,
  `pago-mensajero.ts` feature 39 R5-R7): entregas de 21.000 y 10.000 por SINPE, un incidente
  («perdido», orden de 8.000), un rechazo, y el pago de la primera entrega ajustado 1.500 → 2.000
  (SLT-56; el total del cierre = suma de los pagos congelados).
  - Recaudado 21.000 + 10.000 = 31.000 → «₡31.000»; Pago al mensajero 2.000 + 1.500 + 0 + 0 = 3.500 → «₡3.500».
  - Señales (R110, orden del contrato): «1 incidente sin indemnizar · 1 pago ajustado · 1 vuelve a bodega».
  - Se aprueba por la pantalla (confirmación física del rechazo + indemnización 5.000): P 3.500, E 0 →
    3.500 − min(3.500, 0) + 0 − 0 = 3.500 → «Pendiente ₡3.500» y «Registrar pago»; el incidente ya
    tiene indemnización → señales «1 pago ajustado · 1 vuelve a bodega».
  - «Registrar pago» de la fila (diálogo sin «Ahora no», monto por defecto = disponible) → «Liquidado».
- **Satélite**: una entrega de 30.000 por SINPE y un rechazo → «₡30.000», «₡1.500», «1 vuelve a
  bodega». Aprobado, le queda 1.500 pendiente y aun así no hay «Pago entregado» ni «Registrar pago»
  (sin pendiente la ausencia del botón no probaría nada).

Literales escritos a mano en el spec (columnas, celdas en orden con `toHaveText([...])`, folio
`#` + 8 hex, fecha `AAAA-MM-DD HH:MM`).

### Archivos

- modificado `e2e/_escenarios/cierres.ts`: `filaDeCola(region, nombre)`, `pestanaDeCola(page, …)`,
  `ajustarPagoMensajero(r, gestionId, …)` (servicio `ajustarPagoMensajeroGestion` con el maestro).
- modificado `tests/fabricas/escenarios/reparto.ts`: `GestionEscenario` gana `incidente` (mismo
  `gestionar` del portal; causa por defecto «perdido»). Aditivo.
- modificado `e2e/cierres-rediseno.spec.ts`: `describe` «SLT-102 — la fila de la cola única (escenario
  S4)» (2 casos) y `abrirPendiente` / el paso a Resueltos de SLT-100 adaptados a la fila y al `tab`.
- T6.2, una línea por archivo (antes → ahora; mismos literales):
  - `cierres-admin`: comprobante en «Pendientes de decisión» / `group`+`button` Resueltos → `filaDeCola` / `pestanaDeCola`.
  - `ajuste-pago-mensajero-cierre`: comprobante de Pendientes → fila.
  - `cierre-vencido-modelo`: comprobante de Pendientes → fila.
  - `cierre-modelo-nuevo-plan-porcentual`: comprobante de Pendientes → fila; Resueltos por `tab` y fila filtrada por folio (mismo `slice(-8)`).
  - `cierres-admin-rechazos-sla`: comprobante de Pendientes → fila.
  - `reglas-bloqueos-cierre`: comprobante de Pendientes → fila («Vencido», «Destrabar…», «Ver / decidir» iguales).
  - `tarifas-activacion`: `abrirResuelto` por `tab` y fila; el bloque «la tarjeta del listado dice lo mismo
    que su detalle» pasa a: el ingreso se lee en el detalle (570 y 300, ya afirmados arriba) y la fila de
    cada cierre NO contiene «Ingreso de bodega» (R108). La parte de Bodega (consolidación) no cambia.
  - `tarifas-valor-propio-mensajero`: comprobante de Pendientes → fila.
  - `tope-intentos-por-empresa`: comprobante de Pendientes → fila.
  - `wallet-iva-aparte-sl39` (proyecto `aislamiento`): `li` de Pendientes → fila.

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R33 | E2E S4 central: columnas de Pendientes y de Resueltos, celdas en orden |
| R34 | E2E S4 satélite: columnas sin «Pago entregado», sin «Registrar pago» con pendiente 1.500 |
| R36 | E2E S4 central: «Ver / decidir» de la fila → detalle → aprobar; adaptados de T6.2 |
| R101 | E2E S4: folio, fecha, «₡31.000», «₡30.000», «₡3.500», «₡1.500», pastilla «Solicitado»/«Aprobado» |
| R103 | E2E S4 central: «Pendiente ₡3.500» → «Registrar pago» (sin «Ahora no») → «Liquidado» |
| R108 | E2E `tarifas-activacion`: la fila no lleva «Ingreso de bodega»; se lee en el detalle |
| R70, R110 (PA1) | E2E S4 central: las tres señales con su conteo, y «sin indemnizar» desaparece al indemnizar |

### Mutaciones (cada una restaurada con `git checkout`; `git status` limpio en `app/` y `components/`)

| Mutación | Resultado |
|---|---|
| «1 incidente sin indemnizar» → «…indemnizarMUT» en `cola-cierres-labels.ts` | ROJO: S4 central (`toHaveText`, la celda Señales) |
| «Registrar pago a la satélite» (quitar `rolCola === "central"` en el módulo y `rol === "central"` en `accionesFilaDe`) | ROJO: S4 satélite (celda de acciones «VerRegistrar pago») |

### Verificación (salida real)

- `pnpm run typecheck`: `TSC_EXIT=0`.
- `eslint` de los 13 archivos tocados: `LINT_EXIT=0`.
- `vitest related --run tests/fabricas/escenarios/reparto.ts`: `Test Files 4 passed (4)`, `Tests 95 passed (95)`.
- S4 sola: `2 passed`.
- `playwright test --project=dinero` (incluye `cierre-bodega-satelite`, 3 casos), 4 corridas:
  - 1: `93 passed`.
  - 2: `1 failed | 8 did not run | 84 passed`: `cierre-modelo-nuevo-plan-porcentual.spec.ts:479` con
    `Error: worker process exited unexpectedly (code=3221226505)` (0xC0000409, el proceso del worker
    murió; no es una aserción). Los 8 «did not run» son los siguientes del mismo `describe.serial`.
  - 3: `93 passed`. 4: `93 passed` (dos seguidas sin rojos ni inestables).
- `playwright test --project=aislamiento --no-deps e2e/wallet-iva-aparte-sl39.spec.ts`: `4 passed`.

### ABIERTOS

- **ABIERTO-5 — caída del worker en la corrida 2.** `cierre-modelo-nuevo-plan-porcentual:479` (el maestro
  digita tarifas; esta tanda solo tocó los helpers de las líneas 297 y 322 de ese spec, que ese caso no
  usa). No se reprodujo en 3 corridas. No está demostrado que salga en `origin/dev`: no lo corrí allí;
  queda como inestabilidad local sin atribuir.

**Veredicto:** T6 hecho; S4 cierra ABIERTO-1 y ABIERTO-2 con escenario propio, 10 E2E adaptados a la fila
y al `tab`, `dinero` 93/93 dos veces seguidas (una caída de worker aislada en otra corrida).

### Corrección del gate (R47 de `rollup-guards`)

- `rollup-guards.test.ts > R47 (b)` estaba en rojo con «Copias: e2e/cierres-rediseno.spec.ts (2x)»: el monto
  20000 de S4 coincidía con `UMBRAL_AVISO_FILAS_CORRIDA`. La entrega pasa a 21.000: Recaudado central
  21.000 + 10.000 = 31.000 → «₡31.000» (comentario y las dos filas). La guardia no se tocó.
- `vitest run tests/unit/analytics/rollup-guards.test.ts`: `Tests 21 passed (21)`.
- S4: la primera corrida falló en la siembra («tras 15 pasadas de procesar-jobs, la geocodificación … no
  falló por configuración»), por la cola de jobs acumulada en `slt102_e2e` tras cuatro corridas de `dinero`.
  Recreé `slt102_e2e` (DROP + CREATE de la base desechable, `migrate deploy` + `db:seed`): `2 passed`.
- `./init.sh` con `DATABASE_URL` de `slt102_t1`: `== init OK ==`, `INIT_EXIT=0` (escrito dentro del log).
