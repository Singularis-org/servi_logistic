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
