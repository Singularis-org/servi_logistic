# SLT-104 «Detalle de cierre de bodega en el detalle único (central)» — bitácora de implementación

## Tanda 1 — T0 y T1 (backend_dev, 2026-11-10)

Worktree `.worktrees/SLT-104-detalle-bodega-central`, rama `feature/SLT-104-detalle-bodega-central`.
Base desechable nueva `slt104_t1` (`prisma migrate deploy` + `db:seed`), exportada antes de cada vitest.
Grafo: no consultado (el design ya dice que el índice de este worktree no existe); Grep/Read.

### T0.1 — Censo

**Tests de componentes que montan `<CierresBodegaAdminModule` y leen el modal** (`grep -l` por cada rótulo
∩ `grep -l "<CierresBodegaAdminModule"` en `tests/`):

| Rótulo | Archivos |
|---|---|
| «Detalle del cierre de bodega» | ninguno (el nombre del diálogo no se busca en `tests/` con ese literal) |
| «Totales del cierre de bodega» | `CierreBodegaDetalleCascadas.test.tsx` |
| «Cierre del día · » | `cierre-detalle-ajuste-badge.test.tsx`, `CierreBodegaDetalleGestiones.test.tsx` |
| «Órdenes del cierre · » | `CierreBodegaDetalleGestiones.test.tsx` |
| «Lo que va a la central · » | ninguno |
| «Con ajustes» | `cierre-detalle-ajuste-badge.test.tsx` |
| «Conciliación del cierre de bodega» | ninguno |
| «Ver / decidir el cierre de bodega» | `cierre-detalle-ajuste-badge`, `CierreBodegaDesglosePorTienda`, `CierreBodegaDetalleCascadas`, `CierreBodegaDetalleGestiones`, `CierresBodegaAdminRefresco`, `DineroIdentidadesEnPantalla` |

Cambian (abren el modal y leen sus paneles): los seis de la última fila. Coincide con `design.md >
Tests y guardias que cambian` (mismos seis). **Ninguno de más.**

Montan el módulo pero no abren el modal (siguen verdes sin tocar, a confirmar en T5 con su corrida):
`CierreEvidenciasVarias486`, `descarga/CierresBodegaDescargaDetallada`, `descarga/CierresDescarga`,
`descarga/CierresDescargaColumnas`, `descarga/CierresDescargaNiveles`, `paginacion/BajoRiesgoPaginacion`,
`paginacion/ColasPaginacion`, `paginacion/paginacion-transversal`, `unit/config/paginacion-dominios`,
`unit/descarga/censo-tablas.ts`, `unit/descarga/cierres-descarga-detallada-puerta`,
`unit/descarga/cierres-gestiones-paridad`, `unit/services/cierres-bodega-pendientes-paginado`.
`CierreEvidenciasVarias486.test.tsx` no aparece con ningún rótulo del modal, pero habla de evidencias de
bodega: **aviso al leader** para que T5 lo corra antes de darlo por intacto.

**E2E** (`grep -l` en `e2e/`):

| Rótulo | Archivos |
|---|---|
| «Detalle del cierre de bodega» | `ajuste-pago-mensajero-cierre.spec.ts`, `cierre-bodega-satelite.spec.ts` |
| «Totales del cierre de bodega» | `cierre-bodega-satelite.spec.ts` |
| «Cierre del día · » / «Órdenes del cierre · » / «Ver / decidir el cierre de bodega» | los dos |
| «Lo que va a la central · » / «Con ajustes» | `ajuste-pago-mensajero-cierre.spec.ts` |
| «Conciliación del cierre de bodega» | ninguno |

Coincide con el design (los dos E2E nombrados).

**Guardias** (qué miran de `CierresBodegaAdminModule.tsx`):
- `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts:146-160`: las tres superficies que
  montan la TARJETA de la cola (`CierreBodegaFacturaResumen`). S6 no toca la cola → sigue verde.
- `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts:116` (censo), `:360` (rótulos de las
  cascadas en el módulo) y `:387` (vocabulario de la conciliación en el módulo). **Se pone roja al quitar
  el modal** si `CASCADA_CENTRAL_TITULO`/`GANA_BODEGA_SATELITE_LABEL` y `ConciliacionAcciones`/
  `RECIBIDO_LABEL`/`FALTA_POR_RECIBIR_LABEL` dejan de aparecer en el módulo. `ConciliacionAcciones` se
  sigue montando en el módulo (pie), así que `:387` puede seguir verde; `:360` depende de dónde queden
  los rótulos de la cascada. Lo resuelve T5 como dice el design.
- `tests/unit/descarga/contadores-cabecera.guardia.test.ts:109` y
  `tests/components/paginacion/paginacion-transversal.test.tsx:262`: contadores y paginación de la cola;
  no cambian.
- `liquidacion-money-safe` (`tests/unit/guards/liquidacion-money-safe.test.ts`): censo por carpeta; los
  `.tsx` nuevos caen dentro.
- `superficie-de-uso` (`tests/unit/guards/superficie-de-uso.guardia.test.ts`): ver abajo.

**Importadores en `app/`/`components/` de las piezas que el modal deja de montar** (imports reales):
- `lineasCascadaDueno` (`cascadas-bodega.ts`): solo `CierresBodegaAdminModule.tsx:59`. Sin el modal → nadie
  → `@sin-superficie`.
- `TotalesIngresoPanel` (`cierre-detalle-shared.tsx:1273`): solo `CierresBodegaAdminModule.tsx:49`. Sin el
  modal → nadie → `@sin-superficie`.
- `GestionesPorResultado` (`cierre-factura.tsx:2075`): también lo monta `cierre-factura.tsx:2807` → sigue
  con superficie.
- `CascadaDinero`: `CascadasCierreMensajero.tsx:10`, `DesglosePorTienda.tsx:9`,
  `wallet/satelites/_components/ConciliacionSatelite.tsx:19` → sigue con superficie.
- `DesglosePorTienda`: `CascadasCierreMensajero.tsx:14` (ya `@sin-superficie`, `:347`) y
  `detalle-cierre-vista.ts:40` importa `marcaDeVariasTiendas` → el archivo sigue usado; el componente
  `DesglosePorTienda` queda solo en `CascadasCierreMensajero` (sin superficie). T5 decide la anotación.

### T0.2 — Lecturas con archivo:línea

1. **Pie de `DetalleCierre` tipo bodega.** `components/private/cierres/detalle/DetalleCierre.tsx:217`
   llama a `accionesDe(tipo, audiencia, modo, { disponibles: disponiblesDe(props) })`;
   `disponiblesDe` (`:184-191`) mete cada clave de `props.acciones` con valor y `cerrar` si hay
   `onCerrar`. `accionesDeLaTabla` (`detalle-cierre-vista.ts:420-426`): bodega + audiencia central →
   decidir: `[cerrar("secundaria"), conciliacion]`; solo lectura: `[conciliacion, cerrar("principal")]`;
   otra audiencia → solo «Cerrar». El nodo se pinta en `DetalleCierre.tsx:285-287`
   (`a.id === "conciliacion" ? props.acciones.conciliacion`). Coincide con el design.
2. **`GestionesCierre` en «solo lectura».** `components/private/cierres/fila/GestionesCierre.tsx:43,57`
   (`columnaMensajero`, por defecto `false`), `:65` (`columnasDe(audiencia, columnaMensajero)`).
   Acciones: `fila-gestion-vista.ts:522-530` — corregir métodos y resultado exigen `a === "central"`,
   ajustar exige `central|satelite`, devolver `mensajero` → con `"solo lectura"` (y `acciones={}`) no se
   ofrece ninguna. Evidencia: `FilaGestion.tsx:251` la pinta si llega `onVerEvidencia` (no depende de la
   audiencia). Fulfillment: `fila-gestion-vista.ts:311-312` `veFulfillment` = `central` o
   (`solo lectura` y `quienMiraEsCentral`). Coincide.
3. **(PA1) Dónde se acota hoy por empresa la lectura de `cierre_dia`.** NO en `alcanceWhere`
   (`CierresAdminRepository.ts:853-858`: solo `destinoTipo` y `destinoZonaId`). La acotan dos capas:
   - el cliente: la action arma el repositorio con `getPrismaClient()` (`lib/actions/cierres-admin.ts:109,113`),
     que es el cliente con `conAislamientoPorEmpresa` (`lib/db/prisma-client.ts:182`). La extensión
     añade `organizacion_id` a cada `where` (`lib/db/extension-empresa.ts:71-73` `conWhere`, aplicado en
     `argsFiltrados` `:141-145`) y abre cada operación con
     `set_config('app.organizacion_id', …), set_config('role', 'servi_app', …)` (`:194-195`);
   - la RLS: política `cierre_dia_por_empresa` para `servi_app`
     (`db/migrations/20261022130100_organizacion_id_en_negocio/migration.sql:324`).
   Por eso el WHERE nuevo no repite la empresa (el design lo pedía solo si estuviera en `alcanceWhere`).
   **Escrituras que resuelven su propio alcance** (todas con `resolveAlcance`, `CierresAdminService.ts:527-536`,
   que para acceso total da `bodega_central`): `aprobarCierre` (`:1053`, `resolverCierre` con `scope.alcance`),
   `rechazarCierre` (`:1808`), `forzarSolicitudVencido` (destrabar, `:1849`), `actualizarPagosGestion`
   (corregir métodos, `:1585`), `corregirResultadoGestion` (`:1678`), `ajustarPagoMensajeroGestion`
   (`:1761`); las tres últimas buscan la gestión con `findGestionEditableEnCierre(…, scope.alcance)`.
   Sobre un cierre de satélite siguen dando `no_encontrada` (probado en T1.2).
   **Hallazgo — el PAGO no pasa por ese alcance:** `LiquidacionService.registrarPagoMensajero`
   (`lib/services/LiquidacionService.ts:315-335`) solo exige `esAccesoTotal` y lee el cierre por id
   (`obtenerCierreParaPago`), sin mirar `destinoTipo`. Es así desde antes de SLT-104 y esta ficha no lo
   cambia (no toca `LiquidacionService`), pero significa que **hoy la central ya puede pagar un cierre
   aprobado de satélite de su empresa** por la pantalla de liquidaciones. ABIERTO para el leader/Carlos:
   no se puede escribir el test «la central no puede pagar un cierre de satélite» porque hoy sí puede.
4. **(PA3) `solicitadoAt` en `cd.resumen`.** No lo traía: `DETALLE_CIERRE_SELECT`
   (`CierresBodegaAdminRepository.ts:166-181`) no lo pedía y `toDetalleCierreRow` (`:185-199`) no lo
   mapeaba. Se pide en el repositorio (T1.3).

Nada contradice el design.

### T0.3 — Literales (derivados a mano, antes de los tests)

`money()` (`lib/config/moneda.ts:235-241, 363`): símbolo `₡`, miles `.`, decimales `,`, y **sin cola si los
céntimos son cero**: `money("7000.00")` = `₡7.000`, `money("0.00")` = `₡0`, `money("-500.00")` = `-₡500`,
`money(null)` = `—`. (El design dice «0,00» en un sitio; lo que pinta `money` es `₡0`.)

**E2E `cierre-bodega-satelite.spec.ts` (modelo viejo).** Entradas: tarifa de la tienda por defecto de la
fábrica (`tests/fabricas/escenarios/reparto.ts:170-178`: flete 2.500, flete devuelto 1.250, GAM 2.000 /
1.000, comisión 0, IVA 0); mensajero 1.500 por entrega y 500 por rechazo (`e2e/cierre-bodega-satelite.spec.ts:68`);
una entrega de 9.000 en efectivo y un rechazo, en la zona satélite. La zona satélite se crea con
`esCentral = false` (`reparto.ts:359`) → se usan `valorFlete` y `valorFleteDevuelto`
(`lib/utils/ingreso-empresa.ts:25-29`). `Tarifa.fulfillment` no lo fija la fábrica (columna NULL, se lee 0).

| Cifra | Derivación | Literal |
|---|---|---|
| Recaudado | 9.000 efectivo | ₡9.000 |
| Pago al mensajero | 1.500 (entrega) + 0 (rechazo no paga al mensajero) | ₡1.500 |
| Gana la bodega satélite | 500 (`cobroRechazado`) | ₡500 |
| Debe llegar a la central | 9.000 − 1.500 − 500 | ₡7.000 |
| Total facturado | 2.500 (flete entrega) + 1.250 (flete devolución) + 0 IVA + 0 comisión | ₡3.750 |
| Le queda a la empresa | 3.750 − 0 IVA − 1.500 − 500 | ₡1.750 |
| Conciliación sin marca | Debe llegar 7.000 · − Recibido «—» · Falta por recibir 7.000 | ₡7.000 / — / ₡7.000 |
| Conciliación marcada por 7.000 | 7.000 · 7.000 · 0 | ₡7.000 / ₡7.000 / ₡0 |
| Mensajeros (1 fila) | Gestiones 2 · Recaudado ₡9.000 · Pago ₡1.500 · A la central ₡7.000 · Señales — | — |

ABIERTO (no inventado): «Total facturado» y «Le queda» suponen que la tienda de la fábrica no lleva
fulfillment ni zona especial; T6 debe comprobar en la base de la corrida `cierre_detail` (flete 2.500 /
1.250, fulfillment 0) antes de escribirlos en el E2E.

**E2E `ajuste-pago-mensajero-cierre.spec.ts` (paso satélite).** Entrega de 9.000 en efectivo, sin rechazo,
pago ajustado 1.500 → 1.800 (`:27-41, :249-272`).

| Cifra | Derivación | Literal |
|---|---|---|
| Pago (fila de «Mensajeros») | 1.800 | ₡1.800 |
| A la central | 9.000 − 1.800 − 0 | ₡7.200 |
| Señales | 1 gestión ajustada | «1 pago ajustado» |
| Total facturado | 2.500 (misma suposición de arriba) | ₡2.500 |
| Le queda a la empresa | 2.500 − 1.800 − 0 | ₡700 |

**Escenario B de `cierres-rediseno.spec.ts` (modelo nuevo).** Está definido en la **zona central**
(`e2e/cierres-rediseno.spec.ts:40-46`: flete 3.100 + 13 %, devolución 1.400 + 13 %, pago 2.200, una
entrega de 10.000) y un cierre de central no se consolida en un cierre de bodega. ABIERTO: para R77 hace
falta digitar y activar las tarifas del modelo nuevo **en la zona satélite** (no especificado en el spec).
Si se replican exactamente en la satélite, sin rechazo y sin ingreso de bodega: Recaudado ₡10.000 · flete
con IVA 3.100 + 403 = 3.503 · Total facturado ₡3.503 · IVA ₡403 · Pago ₡2.200 · Debe llegar a la central
10.000 − 2.200 − 0 = ₡7.800 · Le queda 3.503 − 403 − 2.200 − 0 = ₡900. Es una propuesta; lo decide T6.

### T1 — Servidor

**T1.1 (PA1).** `findCierreByIdEnAlcance` acepta `AlcanceLecturaDetalle = Alcance | { lectura:
"toda_la_empresa" }` (`ICierresAdminRepository.ts`). El WHERE sale de `alcanceLecturaWhere`
(`CierresAdminRepository.ts:866`): `{}` para la lectura ancha, `alcanceWhere` tal cual si no.
`alcanceWhere` no cambia. `verCierreDetalle` pasa `alcanceDeLectura(actor, scope.alcance)`
(`CierresAdminService.ts:123, 873`): acceso total → lectura ancha; el resto, su alcance de siempre.
Ningún método de escritura cambia; el compilador impide pasarles la lectura ancha (tipan `Alcance`).
`git diff db/` vacío.

**T1.3 (PA3).** `CierreBodegaDetalleCierreRow.solicitadoAt: string` (requerido; lo pide
`DETALLE_CIERRE_SELECT` y lo mapea `toDetalleCierreRow`); `CierreBodegaDetalleCierre.solicitadoAt?:
string` **opcional** (desviación menor del design, que lo pone requerido): el tipo lo comparten la
consolidación y cuatro fixtures de `tests/components/` de frontend; requerido rompería su typecheck sin
aportar nada. El detalle de admin lo rellena siempre (`CierresBodegaAdminService.ts`, junto a
`gestionesAjustadas`). Ningún campo existente cambia.

### Archivos

Producción: `lib/interfaces/repositories/ICierresAdminRepository.ts`, `lib/repositories/CierresAdminRepository.ts`,
`lib/services/CierresAdminService.ts`, `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`,
`lib/repositories/CierresBodegaAdminRepository.ts`, `lib/interfaces/services/ICierreBodegaService.ts`,
`lib/services/CierresBodegaAdminService.ts`.
Tests nuevos: `tests/unit/services/cierres-admin-detalle-lectura.test.ts`,
`tests/integration/db/cierre-detalle-central-lee-satelite-sql-real.test.ts`.
Tests tocados: `tests/unit/services/cierres-bodega-admin-service.test.ts` (caso PA3 + campo en el doble),
`tests/unit/repositories/cierres-bodega-admin-repository.test.ts` (aserción PA3 de la proyección + campo en
el doble), `tests/unit/repositories/cierre-pagos-lectura.test.ts` (campo en el doble: la proyección pide
`solicitadoAt` y el doble no lo traía → `toISOString` de `undefined`).
Docs: `specs/.../tasks.md` (T0-T1 `[x]`), esta bitácora. `git diff db/` vacío.

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R116 (lee: maestro y admin) | `cierres-admin-detalle-lectura.test.ts` «maestro/admin: `verCierreDetalle` pide la lectura ancha…»; integración «maestro y admin de A abren el cierre de satélite de A» |
| R116 (no escribe) | unit: aprobar, rechazar, destrabar (maestro y admin), corregir métodos, corregir resultado, ajustar pago (maestro), listas y catálogo → `bodega_central` / `no_encontrada`; integración «la central NO escribe: aprobar y rechazar… el cierre no cambia» |
| R116 (roles sin acceso total) | unit: `adminSatelite` sigue con su zona; `mensajero`, `adminTienda`, `apiKey`, `superadmin` → `forbidden` sin tocar el repo; integración: adminSatelite de otra zona `no_encontrada`, el de su zona `ok`, y no lee el de central |
| R116 (otra empresa) | integración «dos empresas: el maestro de B no lee el cierre de satélite de A, ni el de A el de B» |
| R120 (dato, PA3) | `cierres-bodega-admin-service.test.ts` «cd1 y cd2 traen el instante de su propio cierre_dia»; `cierres-bodega-admin-repository.test.ts` R11 (proyección + ISO por cierre) |

R115 y la pintura de R116/R120 son de T2-T4 (frontend).

### Mutaciones (aplicadas, corridas y restauradas con `git checkout HEAD -- <archivo>`; `git diff` limpio tras cada una)

| # | Mutación | Resultado |
|---|---|---|
| M1 | Quitar el filtro de empresa de la extensión (`conWhere` devuelve el `where` sin `organizacion_id`) | **verde** (5/5): la RLS de `cierre_dia` lo cubre sola. Defensa en profundidad, esperado |
| M2 | M1 + no bajar al rol `servi_app` (sin RLS) | **ROJO**: «dos empresas: el maestro de B no lee…» |
| M3 | `alcanceLecturaWhere` devuelve `{}` siempre (lectura ancha para todos en el repo) | **ROJO**: integración «el adminSatelite de otra zona sigue sin leerlo» |
| M4 | Ensanchar `alcanceWhere` (sin `destinoTipo` cuando no hay zona) | **ROJO**: integración «la central NO escribe…» (aprobar dejó de dar `no_encontrada`) |
| M5 | `alcanceDeLectura` da la lectura ancha a todos | **ROJO**: unit «adminSatelite: sigue con SU zona» + integración «adminSatelite de otra zona» |
| M6 | Ensanchar `resolveAlcance` de acceso total (`bodega_satelite`) | **ROJO**: 6 casos unit (aprobar/rechazar, destrabar, corregir/ajustar, listas) |
| M7 | PA3: `solicitadoAt` de la cabecera de bodega en vez del de cada cierre | **ROJO**: «cd1 y cd2 traen el instante de su propio cierre_dia» |

Nota: el test de servicio usa dobles y no ve `alcanceWhere` (M4 la caza la integración, no el unit); el unit
caza el ensanchamiento en el servicio (M5, M6).

### Salidas

- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; con el tope por defecto muere por
  memoria): exit 0.
- `pnpm run lint`: exit 0, 0 errores, 243 warnings, ninguno en archivos tocados.
- Tests tocados (8 archivos, incluye `cierres-admin-service`, `cierres-admin-repository` y
  `aislamiento-cierres`): `Test Files 8 passed (8) · Tests 258 passed (258)`. La integración corre de verdad
  (5 casos `✓`, no `skipped`).
- `vitest related` sobre los 7 de `lib/`: 125 archivos rojos, todos de `tests/integration/db/` por la base
  desechable sin datos de dominio («tabla `orden` vacia: corre `pnpm run db:seed`», etc.) más los 5 casos de
  dobles que se arreglaron arriba. Comprobado: 4 de esos archivos dan el mismo rojo (11 fallos) con el `lib/`
  de `c3f45df4`.
- `pnpm run test:guardias`: 4 rojos, todos en `dependencias-declaradas-presentes.guardia.test.ts` («init.sh ya
  no tiene el marcador >>> FIN PASO 2…»). `init.sh` no se tocó (último cambio: `9aa7e060 chore(arnes): sync
  a 2.14.0`); rojo previo de la rama, no de esta tanda. Para el leader.

### ABIERTOS

1. **Pago de un cierre de satélite por la central** (T0.2 punto 3): `LiquidacionService.registrarPagoMensajero`
   no mira el destino; la central ya puede pagar hoy un cierre aprobado de satélite de su empresa. No se pudo
   escribir el test «no puede pagar». Decide Carlos si es correcto.
2. Literales «Total facturado» / «Le queda» de los dos E2E (T0.3): dependen de que la fábrica no ponga
   fulfillment ni zona especial; T6 lo verifica en la base de la corrida.
3. Escenario B en la satélite para R77 (T0.3): sin tarifas definidas en la zona satélite.
4. Guardia `dependencias-declaradas-presentes` roja en la rama, ajena a la tanda.

Veredicto: T0 y T1 hechos; lectura de satélite solo para acceso total, sin ensanchar escritura ni empresa, con 7 mutaciones medidas.

## Tanda 2 — T2, T3 y T4 (frontend_dev, 2026-11-10)

Worktree y rama de la tanda 1. Base `slt104_t1` exportada antes de cada vitest (ningún test de esta tanda la
usa). Grafo: no consultado (el índice de este worktree no existe); Grep/Read.

### Archivos

Producción (modificados): `components/private/cierres/detalle/{detalle-cierre-labels.ts, detalle-cierre-vista.ts,
Cuenta.tsx, DetalleCierre.tsx, detalle-cierre-descarga-columnas.ts}`, `components/private/cierres/fila/{fila-gestion-vista.ts,
GestionesCierre.tsx}`, `app/(app)/cierres-admin/_components/{CierresBodegaAdminModule.tsx, CierresAdminModule.tsx}`.
Producción (nuevos): `components/private/cierres/detalle/{MensajerosCierreBodega.tsx, ConciliacionCierreBodega.tsx}`.
Tests nuevos: `tests/components/DetalleCierreBodega.test.tsx`, `tests/components/CierresBodegaAdminDetalleUnico.test.tsx`.
Tests ampliados: `tests/unit/utils/detalle-cierre-vista.test.ts`, `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`,
`tests/components/CierresAdminDeepLink.test.tsx`. Dobles con los dos campos nuevos (`montoRecibido`, `conteos.cierres`):
`tests/components/{DetalleCierre,DetalleCierreDinero,DineroIdentidadesEnPantalla}.test.tsx`.
`git diff` vacío en `db/`, `lib/`, la cola (`CierresBodegaResueltosLista`, `CierresBodegaSolicitadosLista`,
`ConsolidacionBodegaModule`, `CierresTabs`, `cierre-factura`) y `components/shared/conciliacion/` (PA5).

### Lo que se decidió aquí (sin salir del spec)

- PA2: `DetalleBodegaVista.conteos.cierres` (requerido) y `DetalleCierre` lo pasa a `pestanasDe` (una línea). El
  design ponía el conteo en `vistaBodegaDesdeAdmin`, que no arma pestañas; la cabecera sigue con `mensajeros`.
- `montoRecibido` requerido en `DetalleBodegaVista` (como `conciliado`: una superficie nueva no nace sin él).
- `ItemGestion.congeladoAt?`: `GestionesCierre` usa el del item si llega (también `null` = sin fecha) y si no el de la
  lista. `gestionesDeBodega` pone el `solicitadoAt` de SU cierre del día o `null`.
- `filaDescargaDetalleBodega(g, mensajero)` = la fila de mensajero con audiencia «solo lectura» + `mensajero`;
  columna «Mensajero» tras «Tienda» con el `COL_MENSAJERO` de la fila. `MENSAJEROS_COLUMNAS.mensajero` va como
  literal: `fila-gestion-labels` importa `detalle-cierre-labels` y al revés sería un ciclo de constantes.
- Señal de «Mensajeros» = `pagosAjustados` de la cola (mismo texto); «—» con 0 o sin el campo.
- `Cuenta`: `sinImporte` pinta «—» y marca la línea con `data-sin-importe`; el `data-monto` sigue (con «—»).
- T4.2: `soloLecturaSatelite = audiencia === "admin" && destinoTipo === "bodega_satelite"` apaga modo decidir,
  pago, rechazar/aprobar, destrabar, corregir y ajustar, y pone la fila en «solo lectura».
- `@sin-superficie`: no hizo falta; `superficie-de-uso` sigue verde tras quitar el modal (18/18).

### Fidelidad al canvas (`design.md > Fidelidad al canvas`)

F1 igual · F2 igual · F3 igual · F4 igual · F5 igual salvo «Gestiones (n)» con paréntesis (desviación de la tabla) ·
F6 igual · F7 igual · F8 igual · F9 igual (columnas, orden, señal ámbar, «Ver su cierre») · F10 igual salvo fecha
«2026-11-08 09:12» (desviación de la tabla) · F11 igual · F12 PA5 (`ConciliacionAcciones` tal cual) y «Desmarcar» solo si
`desmarcable` (desviaciones de la tabla) · F13 igual.

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R31 | `CierresBodegaAdminDetalleUnico` «la fila desplegada no ofrece corregir ni ajustar; sí «Ver evidencia» y el fulfillment», «… sin la señal que solo ve la central» |
| R40, R119 | `CierresBodegaAdminDetalleUnico` (dialog «Detalle del cierre de bodega · Cierre de bodega · Limón»; `no_encontrada` y `forbidden`) |
| R41 | `detalle-cierre-vista` «gestionesDeBodega … por resultado …»; `CierresBodegaAdminDetalleUnico` «columna Mensajero, filas de los dos cierres del día…» |
| R42, R114 | `detalle-cierre-vista` «filasMensajeros …» (3 casos); `DetalleCierreBodega` «R42, R114» (3 casos) |
| R43, R117 | `detalle-cierre-vista` «cuentaConciliacion y marcaConciliacion»; `DetalleCierreBodega` «R43, R117» (3) y «`Cuenta` con `sinImporte`» |
| R111 | `detalle-cierre-vista` «modoBodegaDe»; `CierresBodegaAdminDetalleUnico` «Ver / decidir … modo decidir», «Ver de Resueltos … solo lectura» |
| R112 | `CierresBodegaAdminDetalleUnico` (orden del pie, sin permiso solo «Cerrar», marcar cierra y relee las dos listas) |
| R113 | `detalle-cierre-descarga-columnas` «SLT-104» (3); `CierresBodegaAdminDetalleUnico` («Descargar», solo lectura, fulfillment, evidencia) |
| R115 | `DetalleCierreBodega` «R115»; `CierresBodegaAdminDetalleUnico` «R115 — navega a ?cierre=<id> sin dejar el detalle…» |
| R116 (pantalla) | `CierresAdminDeepLink` «SLT-104 (R116)» (solicitado, aprobado y vencido de satélite + 2 controles de la central) |
| R118 | `CierresBodegaAdminDetalleUnico` «R118: no monta el modal de antes ni sus paneles» |
| R120 | `detalle-cierre-vista` «PA3: cada gestión lleva la fecha de SU cierre del día»; `CierresBodegaAdminDetalleUnico` «PA3: la nota de tarifas…» |
| R121 | `detalle-cierre-vista` (3 cierres / 2 mensajeros; «PA2»); `DetalleCierreBodega` «R121 (PA2)» |

### Mutaciones (aplicadas con un script, corridas y restauradas desde copia; árbol limpio tras cada una)

| # | Mutación | Resultado |
|---|---|---|
| M1 | Pestaña con `conteos.mensajeros` (`DetalleCierre`) | **ROJO** `DetalleCierreBodega` R121 |
| M2 | «Recibido» sin marca como `partida(…, "0.00")` | **ROJO** unit + componente (2) |
| M3 | `Cuenta` pinta `money(monto)` con `sinImporte` | **ROJO** «`Cuenta` con `sinImporte`» (con `monto` "" no se vería: `money("")` = «—») |
| M4 | Modo «decidir» para un recibido | **ROJO** «Ver de Resueltos … solo lectura» |
| M5 | Audiencia «central» en la fila de bodega | **ROJO** «… sin la señal que solo ve la central» |
| M6 | No cerrar el detalle tras marcar | **ROJO** «marca, cierra el detalle y revalida…» |
| M7 | Sin el forzado de solo lectura (`soloLecturaSatelite = false`) | **ROJO** `CierresAdminDeepLink` (3 casos de satélite) |
| M8 | `congeladoAt: null` en `gestionesDeBodega` | **ROJO** unit + módulo (2) |
| M9 | «Ver su cierre» sin cerrar el detalle de bodega | **ROJO** «R115 — navega…» |

### Salidas

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: `TC_EXIT=0`.
- `pnpm run lint`: `LINT_EXIT=0`, 0 errores, 243 warnings (las mismas de la tanda 1; ninguna en archivos tocados).
- Tests de esta tanda (5 archivos nuevos o ampliados, más `DetalleCierre`, `DetalleCierreDinero`, `FilaGestion`,
  `CierresAdminModule`, `CierresBodegaAdminRefresco`, `CierreEvidenciasVarias486`): verdes. Corrida conjunta de 16
  archivos: `Tests 80 failed | 263 passed (343)`; los 80 rojos son SOLO de los cinco de T5.1 que abren el modal viejo:
  `CierreBodegaDesglosePorTienda` (29), `CierreBodegaDetalleCascadas` (25), `CierreBodegaDetalleGestiones` (20),
  `DineroIdentidadesEnPantalla` bloque «ficha 393 · B5 — el DETALLE del cierre de bodega» (4), `cierre-detalle-ajuste-badge` (2).
  `CierresBodegaAdminRefresco` sigue verde sin tocarlo.
- `pnpm run test:guardias`: `Tests 6 failed | 4820 passed | 1 skipped`. Rojos: `cierre-bodega-vocabulario` (1,
  autocomprobación de los rótulos en el módulo: T5.2), `liquidacion-money-safe` (1, «el censo de archivos … cubre sus
  propios árboles»: pide censar `MensajerosCierreBodega.tsx` y `ConciliacionCierreBodega.tsx`; el design decía que no
  hacía falta tocarla: T5.2), `dependencias-declaradas-presentes` (4, previo de la rama, tanda 1).
- `grep -E "Number\(|parseFloat|toFixed"` en los archivos tocados de `components/private/cierres/` y el módulo: solo
  un comentario antiguo en `CierresBodegaAdminModule.tsx:126`.

### ABIERTOS

1. Título de «Conciliación»: el canvas lo pinta a 15 px y `Cuenta` (compartida con «Dinero») a 14 px. No se tocó.
2. `marcaConciliacion` con marca y sin `conciliadoPorNombre`: sale «Marcó: <fecha>» (el spec no dice ese caso).
3. `liquidacion-money-safe` sí pide censar los dos `.tsx` nuevos (contra `design.md > Tests y guardias que cambian`).
4. «Ver su cierre» navega con `router.push` a `?cierre=`: lo abre `CierresAdminModule` (mitad Mensajero, cuyo detalle
   es un portal). Probado con dobles; lo confirma el E2E de T6.2.

Veredicto: T2-T4 hechos; detalle único de bodega montado fiel al canvas con las desviaciones de su tabla y 9 mutaciones en rojo; quedan para T5 los 5 tests del modal viejo y 2 guardias.

## Tanda 3 — T5 y ABIERTOS de la tanda 2 (frontend_dev, 2026-11-10)

### ABIERTOS de la tanda 2, resueltos por el leader

1. **Título de las cuentas a 15 px.** El canvas usa 15 px en TODOS los títulos de cuenta y de tarjeta:
   `Main.dc.html` (`{{c.titulo}}` de las cuentas de «Dinero», «Conciliación», «¿A dónde va lo recaudado?», «Por
   tienda», «Cómo corregir», «Órdenes por volver a gestionar») y `Fila2.dc.html` (las tarjetas de la fila, 6 usos).
   Ninguno a 14 px. Así que `Cuenta` pasa a `text-[15px]` para todos (sin prop nueva), y también los dos `h3` de
   `DineroCierre` («¿A dónde va lo recaudado?» y «Por tienda»), que estaban a 14 px contra 15 px del canvas.
   Ningún test afirmaba el tamaño: no se rompió ninguno.
2. «Marcó: <fecha>» sin nombre: queda como fallback; anotado en `progress/features/SLT-104.md > Preguntas para Preview`.
3. `liquidacion-money-safe`: censados `MensajerosCierreBodega.tsx` y `ConciliacionCierreBodega.tsx`; corregida la
   frase de `design.md > Tests y guardias que cambian`.
4. «Ver su cierre» en E2E: para T6.2.

### T5.1 — tests adaptados (antes leía X, ahora lee Y)

- `cierre-detalle-ajuste-badge.test.tsx` (SLT-56 R20): antes, la insignia «Con ajustes» en el bloque «Cierre del día ·
  Ana»; ahora, la señal «1 pago ajustado» en la fila de Ana de «Mensajeros» y «—» en la de Beto (R42, R114). La marca
  «Ajustado» con su historial y sin «Ajustar pago»: igual, en la pestaña «Gestiones».
- `CierreBodegaDetalleGestiones.test.tsx` (478): antes, cinco pestañas por mensajero en regiones «Órdenes del cierre ·
  <X>»; ahora, los filtros por resultado con conteo de todos los cierres del día («Todas 7»… «Con señales 4»), el orden
  de «Todas» con la columna Mensajero, filtrar, la fila compacta (guía, destinatario · tienda, mensajero, resultado,
  importes), las tarjetas de la fila desplegada con literales, la marca «Rechazo automático», evidencia (R10-R12), solo
  lectura (R14-R15) y UNA región de gestiones (R41, R113). R9 compara las tarjetas de la misma gestión en bodega y en
  la lista del detalle de mensajero (`GestionesCierre` con audiencia central). Retirado: pestañas independientes por
  mensajero (R41, R113: una lista), la línea de ubicación y «Ingreso de bodega por devoluciones a origen» por gestión
  (la fila única de SLT-101 en «solo lectura»: R31, R113, canvas `FilaSoloLectura.dc.html`).
- `CierreBodegaDetalleCascadas.test.tsx` (393): antes, las dos cascadas del modal (agregado y por día) y los paneles
  «Totales» e «Ingreso de la empresa»; ahora, las tres cuentas de «Dinero» con literales y su cierre al céntimo por
  `data-signo`, la línea puente (también con 0), las notas (R26, R27, R36, R37, R71), la cifra «Debe llegar a la
  central», los métodos bajo «Recaudado», las cifras por cierre del día en «Mensajeros» y su suma = agregado (R16),
  el IVA del agregado (SL-39), el nombre de la empresa (SL-15) y el rótulo del flete del modelo nuevo (SLT-54).
  Retirado: «Para la tienda» (SLT-95 R16, canvas F6), las cascadas, notas, IVA y rótulos POR cierre del día y su
  panel de ingreso (R118; viven en el detalle de cada cierre del día, R115), «Transferencia» en cero (SLT-95 R7, D4),
  la nota de la 393 junto al IVA (la línea se llama «IVA (no es de la empresa)», SLT-95 R16), la nota de «Gana la
  bodega satélite» en «De lo facturado…» (canvas F6) y el panel de ingreso por concepto (requirements > Lo que NO entra).
- `CierreBodegaDesglosePorTienda.test.tsx` (396): antes, desglose agregado y por mensajero con marca y notas; ahora,
  la tabla «Por tienda» del agregado con sus nueve cifras, umbral (2 tiendas sí, 1 no), Q8 (Norte una fila), orden del
  servidor, homónimas sin fundir, tres cifras por fila, columnas, sumas (recaudado = «Total general»; pago y gana =
  agregado del contrato escrito a mano), la diferencia de Norte = flete por devolución, cuentas sin cambio y money-safe
  sobre `DineroCierre`, `detalle-cierre-vista` y el módulo. Retirado: desglose por mensajero (R19, R118, R115), la
  marca de varias tiendas sobre «Para la tienda» (R1; SLT-95 R16, canvas F6) y las dos notas de cabecera (R17; canvas F6).
- `DineroIdentidadesEnPantalla.test.tsx` bloque «ficha 393 · B5»: antes, cascadas «de quién»/«central» del modal;
  ahora, las tres cuentas del Dinero del detalle de bodega (flete + comisión = sale de lo recaudado; + flete por
  devolución = facturado, y su hueco = 500,75; facturado − IVA − mensajeros − bodega = le queda; recaudado − mensajeros
  − bodega = debe llegar = tarjeta). Retirado «Para la tienda» (SLT-95 R16, canvas F6).

### T5.2 — guardias

- `cierre-bodega-vocabulario`: censo ampliado a `MensajerosCierreBodega.tsx` y `ConciliacionCierreBodega.tsx` (enteros)
  y a dos trozos de `detalle-cierre-vista.ts` (`cuentaCentral` y la sección de S6), con su autocomprobación (los trozos se
  cortan, son de bodega y no arrastran el detalle de mensajero). Los rótulos de la cascada se buscan en
  `cuentaCentral`; el vocabulario de la conciliación, en el módulo y en la sección de S6. Los cuatro censos, sin aflojar.
  Contraprueba: un literal «Aprobado» en `ConciliacionCierreBodega.tsx` la pone ROJA (1 fallo).
- `liquidacion-money-safe`: los dos `.tsx` censados. Contraprueba: `Number(f.recaudado)` en `MensajerosCierreBodega.tsx`
  la pone ROJA (1 fallo).
- `cascada-central-en-las-dos-pantallas` y `superficie-de-uso`: verdes sin cambios.

### Salidas

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: `TC_EXIT=0`.
- `pnpm run lint`: `LINT_EXIT=0`, 0 errores; quitados 5 imports sin uso que dejó la adaptación de B5.
- `pnpm run test:guardias`: `Tests 4 failed | 4823 passed | 1 skipped`; los 4 son `dependencias-declaradas-presentes`
  (baseline de la rama, no se toca).
- Tests tocados y vecinos (16 archivos): `Tests 336 passed (336)`. Los que montan el módulo sin abrir el detalle
  (descargas, paginación, `GestionesCierre`; 12 archivos): `Tests 112 passed (112)`.

Veredicto: T5 hecho; los cinco tests del modal viejo leen el detalle único con las mismas cifras, y las dos guardias están verdes con contraprueba.
