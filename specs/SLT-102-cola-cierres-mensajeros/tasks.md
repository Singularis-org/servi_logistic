# SLT-102 «Cola de cierres única: mensajeros (central y satélite)» — tasks

> 2026-11-10. Zona **frontend**; si Carlos responde «sí» a PA1, **fullstack** y T1 (servidor,
> `backend_dev`) va **antes** que T2-T6. Si responde «no», T1 y las filas marcadas «(PA1)» se
> borran antes de empezar.
>
> `[P]` = paralelizable con la task anterior.
>
> **Tamaño:** ~43 archivos y ~1 700 líneas estimadas sin PA1; ~49 archivos y ~2 150 líneas con PA1
> (límite 40). La mayor parte son tests y E2E que hoy localizan los cierres por la
> tarjeta-comprobante. Regla de Carlos «no partir» (S4-3): falta su marca `tamano-pr-aceptado`
> en `progress/features/SLT-102.md` (PA4). Si el diff pasa de 46 archivos (52 con PA1), el
> implementer para y avisa.
>
> Antes del primer gate:
> - copiar `.env` al worktree (sin él, el gate sale verde saltándose la integración);
> - exportar una base desechable propia antes de cualquier `vitest` (memoria del proyecto);
> - no correr `prisma generate`: el esquema no cambia y `node_modules` es compartido.
>
> Candado: SLT-105 «Cola de bodega de la central: Por conciliar y Conciliados» y SLT-106 «Bodega
> satélite: A consolidar con la cola única» también tocarán `components/private/cierres/cola/` y
> `/cierres-admin`; SLT-111 «Cifras del servidor: reparto en % y señales de la cola» toca
> `CierresAdminRepository.ts` / `CierresAdminService.ts` (PA1). `docs/equipo.md` decide si van a la
> vez.
>
> El índice del grafo de este worktree no existe: usar Grep/Read.

## T0 — Comprobaciones previas (sin código de producción)

- [x] **T0.1** — Censo, anotado en `progress/impl_SLT-102.md`:
  - `grep -l` en `tests/` por `<CierresAdminModule` o `CierresAdminHistoricoLista` junto con
    «Comprobante del cierre de», «Ver detalles del cierre de», «Pendientes de decisión»,
    «"Histórico"», «Cierres del día por estado», `PendienteLiquidarBadge`, «Destrabar cierre
    vencido»: qué archivo cambia y cuál sigue verde sin tocarlo;
  - `grep -l` en `e2e/` por las mismas regiones y por `getByRole("group", { name: "Cierres del día
    por estado" })`, descartando los de bodega (`Cierres de bodega por estado`, «Cierres del día a
    consolidar»);
  - qué miran de `CierresAdminModule.tsx` / `CierresAdminHistoricoLista.tsx` las guardias
    `contadores-cabecera`, `paginacion-dominios`, `paginacion-transversal`, `superficie-de-uso` y
    `factura-contraste`;
  - quién importa `CierreFacturaResumen` y el componente `CierresAdminHistoricoLista` fuera de
    `CierresAdminModule` (si nadie, `@sin-superficie`).

  **Hecho:** la lista coincide con `## Archivos esperados`; los de más se añaden y se avisa al
  leader.
- [x] **T0.2** [P] — Leer y anotar con archivo:línea:
  - de dónde sale el nombre de zona de la central y de la satélite para R106 (PA3): `actor.zonaId`
    del maestro/admin, la consulta del catálogo que «incluye la central (la GAM)», o nada;
  - que `Tabs` de `components/ui/tabs` controlado (`value`/`onValueChange`) monta solo el
    `TabsContent` activo, y que `DataTable` con `ariaLabel` da `role="table"` con filas `row`
    nombradas por su contenido;
  - que `RegistrarPagoMensajeroDialog` sin `trasAprobar` no ofrece «Ahora no» y su `onRegistrado`;
  - (PA1) tablas y columnas reales de los ajustes de pago (SLT-56) y de `indemnizacion`, y la regla
    con la que el detalle cuenta «Pago ajustado» y «Vuelve a bodega».

  **Hecho:** nota en `impl_SLT-102.md`. Si algo contradice el design, se para y se pregunta.
- [x] **T0.3** [P] — Fijar los literales del E2E y de los tests contra la siembra real de
  `e2e/_escenarios/cierres.ts` y `reparto.ts` (escenario A): Recaudado, Pago al mensajero,
  pendiente tras aprobar y lo que pinta `money()` para cada uno; (PA1) los tres conteos.

  **Hecho:** tabla entradas → literales con su derivación a mano en `impl_SLT-102.md`, escrita
  **antes** de los tests.

## T1 — Servidor (solo PA1) · `backend_dev` (depende de T0)

- [x] **T1.1** — `ICierresAdminRepository.contarSenalesPorCierre(cierreIds)` y su implementación
  en `CierresAdminRepository` (una consulta, `WHERE` por empresa y por los ids; R109);
  `CierreAdminResumen.senalesCola?` en `ICierresAdminService`; `CierresAdminService.conPendiente`
  la llama una vez por página, también con la lista vacía.
  **Hecho:** typecheck verde; `git diff db/` vacío.
- [x] **T1.2** — `tests/integration/db/cierres-cola-senales-sql-real.test.ts` (base real): los
  conteos de `design.md > Señales del servidor`, el cierre de otra empresa no se cuela; y
  `tests/unit/services/cierres-admin-senales-cola.test.ts`: una sola llamada por página (la
  mutación «una por fila» lo pone rojo).
  **Hecho:** verdes; las mutaciones «sin filtro de empresa» y «sin `IS NULL`» los ponen rojos.

## T2 — Lógica pura · `frontend_dev` (depende de T0; de T1 si PA1)

- [x] **T2.1** — `components/private/cierres/cola/cola-cierres-labels.ts` (descripciones,
  pie, «Pendiente », nombres accesibles de R105, textos de R110 si PA1) y `cola-cierres-vista.ts`
  (`columnasCola`, `folioCola`, `fechaCola`, `pagoEntregadoDe`, `senalesDe`, `accionesFilaDe`).
  **Hecho:** typecheck verde; ni `Number(`, ni `parseFloat`, ni `toFixed` en `cola/`.
- [x] **T2.2** — `tests/unit/utils/cola-cierres-vista.test.ts` con literales: columnas por
  rol × pestaña (satélite sin `pagoEntregado`); «Solicitado»/«Resuelto»; `pagoEntregadoDe` para
  `null`, `"0.00"`, `"45000.55"`; orden y textos de señales (bloqueo con su conteo, rechazado,
  retenidas 1 y 3, vacío, `bloqueoMensajero` ausente); acciones por estado y rol, «Registrar pago»
  solo central + aprobado + pendiente > 0 + permiso.
  **Hecho:** verde; la mutación «`registrarPago` también a la satélite» lo pone rojo.

## T3 — Componente · `frontend_dev` (depende de T2)

- [x] **T3.1** — `components/private/cierres/cola/ColaCierres.tsx` (`design.md > ColaCierres`):
  descripción, `Tabs` con conteo, barra + descargar fuera de los paneles, `DataTable` en una región
  con nombre, pie y paginación.
  **Hecho:** typecheck y lint verdes.
- [x] **T3.2** — `tests/components/ColaCierres.test.tsx` con dobles y literales: `tablist` «Cierres
  del día por estado» con «Pendientes 37» / «Resueltos 12»; cambiar de pestaña llama a `onPestana`
  y no desmonta la barra (un doble con estado propio lo conserva); columnas y celdas de una fila
  central (folio «#…», importes con `money()`, estado); señales con su nota accesible; «Pago
  entregado» y «Registrar pago» en central Resueltos y ausentes en satélite; nombres accesibles de
  R105; carga, error y vacío con los textos de R104.
  **Hecho:** verde; la mutación «contar con `filas.length`» no aplica aquí (el conteo llega por
  prop): se comprueba en T4.2.

## T4 — Montaje en `/cierres-admin` · `frontend_dev` (depende de T3)

- [x] **T4.1** — `CierresAdminModule.tsx` monta `ColaCierres` (`design.md > Montaje`); deja de
  montar `ListaComprobantes`, `CierreFacturaResumen`, `CierresAdminHistoricoLista`,
  `SegmentedToggle` y `PanelConmutado` en la cola; `pagoAbierto` generaliza `ofertaPago`; la
  paginación de Resueltos se monta en el módulo. `page.tsx`: sin `description`, con `zonaNombre`
  (PA3). Anotaciones `@sin-superficie` que pida T0.1.
  **Hecho:** typecheck verde; `git diff` de `CierresBodegaAdminModule.tsx`,
  `ConsolidacionBodegaModule.tsx`, `CierresTabs.tsx` y `cierre-dia/` vacío.
- [x] **T4.2** — `tests/components/CierresAdminModule.test.tsx` (ampliar): conteos desde `total`
  (página de 10, `total` 37); filtrar y cambiar de pestaña conserva el filtro y la página;
  «Ver / decidir» abre el detalle en modo decidir y «Ver» de un vencido en modo vencido;
  «Destrabar» abre la confirmación de hoy; «Registrar pago» abre el diálogo sin «Ahora no» y tras
  registrar relee las listas; la satélite (`audiencia="satelite"`) no ve «Pago entregado»; sin zona
  sigue el aviso.
  **Hecho:** verde; las mutaciones «conteo con `items.length`» y «Registrar pago a la satélite» lo
  ponen rojo.

## T5 — Tests y guardias que cambian · `frontend_dev` (depende de T4.1)

- [x] **T5.1** — Adaptar, sin quitar lo que vigilan, los tests de componentes de T0.1 (lista en
  `## Archivos esperados`): de la tarjeta a la fila (`row` filtrada por mensajero), del `group` +
  `button` al `tab`. `CierresAdminRetieneReprogramadas`: la superficie «cola» pasa a la celda
  Señales y conserva su mutación «pintar con 0».
  **Hecho:** verdes; en `impl_SLT-102.md`, una línea por archivo «antes leía X, ahora lee Y».
- [x] **T5.2** [P] — Guardias: `liquidacion-money-safe` (censo con `cola/`), y las que T0.1 haya
  señalado (`contadores-cabecera`, `paginacion-dominios`, `paginacion-transversal`,
  `superficie-de-uso`, `factura-contraste`).
  **Hecho:** `pnpm run test:guardias` verde; contraprueba: un `Number(c.totales.general)` en
  `cola-cierres-vista.ts` pone rojo `liquidacion-money-safe`.

## T6 — E2E · `frontend_dev` (depende de T4, T5)

- [x] **T6.1** — Helper `filaDeCola(region, nombre)` en `e2e/_escenarios/cierres.ts`, y `describe`
  de S4 en `e2e/cierres-rediseno.spec.ts` (`design.md > Verificación`), con los literales de T0.3
  escritos a mano: central (fila de Pendientes, aprobar, Resueltos con «Pendiente …» y «Registrar
  pago», registrar → «Liquidado»), satélite (sin «Pago entregado» ni «Registrar pago»); (PA1) las
  tres señales con su conteo.
  **Hecho:** verde dos veces seguidas en base desechable nueva, con `NEXT_PUBLIC_APP_URL` como en
  `gate.yml`; la mutación «Registrar pago a la satélite» lo pone rojo.
- [x] **T6.2** — Adaptar a la fila y a las pestañas, mismos literales: `cierres-admin`,
  `ajuste-pago-mensajero-cierre`, `cierre-vencido-modelo`, `cierre-modelo-nuevo-plan-porcentual`,
  `cierres-admin-rechazos-sla`, `reglas-bloqueos-cierre`, `tarifas-activacion` («Ingreso de bodega»
  de Resueltos de la satélite se lee en el detalle, 570 y 300), `tarifas-valor-propio-mensajero`,
  `tope-intentos-por-empresa`, `wallet-iva-aparte-sl39`.
  **Hecho:** verdes; una línea por archivo en `impl_SLT-102.md`.
- [x] **T6.3** — `pnpm exec playwright test --project=dinero` completo, más `cierre-bodega-satelite`
  (no cambia). **Hecho:** dos corridas seguidas sin rojos ni inestables, salida en
  `impl_SLT-102.md`.

## T7 — Cierre

- [x] **T7.1** — `./init.sh` verde, con `INIT_EXIT` escrito dentro del log:
  - sin rojos nuevos; el aviso de tamaño, aceptado (PA4);
  - `git diff db/` vacío y ninguna Server Action de escritura tocada (R72);
  - `grep -E "Number\(|parseFloat|toFixed"` vacío en `components/private/cierres/cola/` (R71).
- [ ] **T7.2** — Preview para Carlos (memoria del proyecto): capturas de «Central 1», «Central 3»
  y «Satélite 1» junto al canvas, con la lista «Para el Preview» de `requirements.md`.

## Trazabilidad

| R | Test previsto |
|---|---|
| R32 | `tests/components/ColaCierres.test.tsx` (descripción, pestañas, barra, tabla, pie); `CierresAdminModule.test.tsx` (central y satélite con el mismo componente) |
| R33 | `tests/unit/utils/cola-cierres-vista.test.ts` (`columnasCola`, `accionesFilaDe`); `ColaCierres.test.tsx`; E2E S4 central |
| R34 | `cola-cierres-vista.test.ts` (satélite sin `pagoEntregado` ni `registrarPago`); `ColaCierres.test.tsx`; `CierresAdminModule.test.tsx`; E2E S4 satélite |
| R35 | `cola-cierres-vista.test.ts` (`senalesDe`); `ColaCierres.test.tsx`; `CierresAdminRetieneReprogramadas.test.tsx` |
| R36 | `CierresAdminModule.test.tsx` («Ver / decidir» → decidir; «Ver» vencido → vencido); E2E S4 central y los adaptados de T6.2 |
| R37 | `CierresAdminPage.test.tsx` (conmutador «Tipo de cierre» intacto); `git diff` vacío de `CierresTabs.tsx` (T4.1); E2E `tarifas-activacion` (cambia a Bodega) |
| R70 (PA1) | `tests/integration/db/cierres-cola-senales-sql-real.test.ts`; `cola-cierres-vista.test.ts`; E2E S4 |
| R71 | `tests/unit/guards/liquidacion-money-safe.test.ts` (censo con `cola/` + contraprueba); grep de T7.1 |
| R72 | revisión del diff en T7.1 (`db/` vacío, sin Server Actions de escritura) |
| R99 | `ColaCierres.test.tsx` (`tablist`, textos «Pendientes 37»); `CierresAdminModule.test.tsx` (conteo desde `total`, conserva filtro y página); `tests/unit/descarga/contadores-cabecera.guardia.test.ts` |
| R100 | `ColaCierres.test.tsx` (barra fuera del panel, descargar en la fila); `CierresAdminFiltros.test.tsx` (filtrar acota las dos listas, `?cierre=` intacto) |
| R101 | `cola-cierres-vista.test.ts` (`folioCola`, `fechaCola`); `ColaCierres.test.tsx` (importes con `money()`, a la derecha); E2E S4 (literales de T0.3) |
| R102 | `cola-cierres-vista.test.ts` (orden, celda vacía, sin `bloqueoMensajero`); `ColaCierres.test.tsx` (nota accesible) |
| R103 | `cola-cierres-vista.test.ts` (`pagoEntregadoDe`); `CierresAdminModule.test.tsx` (diálogo sin «Ahora no», relee); `CierresAdminPagoMensajero.test.tsx`; E2E S4 central |
| R104 | `ColaCierres.test.tsx` (carga, error, vacío, regiones); `ColasPaginacion.test.tsx` |
| R105 | `ColaCierres.test.tsx` (nombres); `CierresAdminModule.test.tsx` («Destrabar» → confirmación); E2E `reglas-bloqueos-cierre` |
| R106 | `ColaCierres.test.tsx` (descripción por rol, pie de Pendientes); `CierresAdminPage.test.tsx` (sin la descripción en voseo, nombre de zona de PA3) |
| R107 | `CierresAdminModule.test.tsx` (sin tarjetas-comprobante; sin zona → aviso); T4.1 (`git diff` de bodega y `/cierre-dia` vacío) |
| R108 | `ColaCierres.test.tsx` (la fila no contiene destino, métodos, «Ingreso de bodega» ni el motivo); E2E `tarifas-activacion` (el ingreso se lee en el detalle) |
| R109 (PA1) | `cierres-cola-senales-sql-real.test.ts` (conteos, otra empresa, igual a «Gestiones»); `tests/unit/services/cierres-admin-senales-cola.test.ts` (una llamada por página) |
| R110 (PA1) | `cola-cierres-vista.test.ts` (textos singular/plural, solo > 0, orden); E2E S4 |

## Archivos esperados

Pantalla (nuevos):
- `components/private/cierres/cola/ColaCierres.tsx`
- `components/private/cierres/cola/cola-cierres-vista.ts`
- `components/private/cierres/cola/cola-cierres-labels.ts`

Pantalla (cambian):
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/page.tsx`
- `app/(app)/cierres-admin/_components/CierresAdminHistoricoLista.tsx`
- `app/(app)/cierres-admin/_components/cierre-factura.tsx`

Servidor (solo PA1):
- `lib/interfaces/repositories/ICierresAdminRepository.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/services/CierresAdminService.ts`

Tests nuevos:
- `tests/unit/utils/cola-cierres-vista.test.ts`
- `tests/components/ColaCierres.test.tsx`
- `tests/integration/db/cierres-cola-senales-sql-real.test.ts` (PA1)
- `tests/unit/services/cierres-admin-senales-cola.test.ts` (PA1)

Tests que se adaptan (candidatos; T0.1 confirma):
- `tests/components/CierresAdminModule.test.tsx`
- `tests/components/CierresAdminPage.test.tsx`
- `tests/components/CierresAdminPagoMensajero.test.tsx`
- `tests/components/CierresAdminRetieneReprogramadas.test.tsx`
- `tests/components/CierresAdminDetalleUnico.test.tsx`
- `tests/components/CierresAdminDeepLink.test.tsx`
- `tests/components/CierresAdminConfirmacionFisica.test.tsx`
- `tests/components/CierresAdminIndemnizacion.test.tsx`
- `tests/components/CierresAdminFiltros.test.tsx`
- `tests/components/CierrePremioPendiente.test.tsx`
- `tests/components/CorregirResultadoCierre.test.tsx`
- `tests/components/cierre-detalle-ajuste-badge.test.tsx`
- `tests/components/descarga/CierresDescarga.test.tsx`
- `tests/components/descarga/CierresDescargaNiveles.test.tsx`
- `tests/components/descarga/CierresDescargaColumnas.test.tsx`
- `tests/components/descarga/CierresAdminDescargaDetallada.test.tsx`
- `tests/components/paginacion/ColasPaginacion.test.tsx`
- `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx`
- `tests/components/paginacion/paginacion-transversal.test.tsx`
- `tests/unit/config/paginacion-dominios.test.ts`
- `tests/unit/descarga/contadores-cabecera.guardia.test.ts`
- `tests/unit/guards/liquidacion-money-safe.test.ts`

E2E:
- `e2e/_escenarios/cierres.ts`
- `e2e/cierres-rediseno.spec.ts`
- `e2e/cierres-admin.spec.ts`
- `e2e/ajuste-pago-mensajero-cierre.spec.ts`
- `e2e/cierre-vencido-modelo.spec.ts`
- `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts`
- `e2e/cierres-admin-rechazos-sla.spec.ts`
- `e2e/reglas-bloqueos-cierre.spec.ts`
- `e2e/tarifas-activacion.spec.ts`
- `e2e/tarifas-valor-propio-mensajero.spec.ts`
- `e2e/tope-intentos-por-empresa.spec.ts`
- `e2e/wallet-iva-aparte-sl39.spec.ts`

Spec y progreso:
- `specs/SLT-102-cola-cierres-mensajeros/requirements.md`
- `specs/SLT-102-cola-cierres-mensajeros/design.md`
- `specs/SLT-102-cola-cierres-mensajeros/tasks.md`
- `progress/features/SLT-102.md`
- `progress/impl_SLT-102.md`
