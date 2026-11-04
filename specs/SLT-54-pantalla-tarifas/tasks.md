# SLT-54 — pantalla-tarifas · tasks.md

> Backend primero. Cada tanda cierra con `./init.sh` en verde; el worktree necesita `.env` antes del
> primer gate. `[P]` = paralelizable dentro de su tanda. Reparto: A, B y C → `backend_dev`; D y E →
> `frontend_dev`; F → implementer.
>
> **Antes de empezar:** resueltas P1-P4. Un cambio en P1 toca solo T2.1 y sus tests; en P2, T4.6; en P3,
> T4.3; en P4, ninguna. Los dobles y los E2E de la lista pueden crecer: si aparece un archivo más, se
> añade a `## Archivos esperados`.

## Tanda A — Activación e interruptor (backend)

- [ ] **T1.1 Migraciones** (R11, R8, R12). `..._historial_tarifa_activacion` y `..._tarifa_activacion`, con
  `down.sql` (design §2). Clasificación en `modelos-de-negocio.ts`; `TRIGGERS_MISMA_EMPRESA` a 168.
  *Hecho:* `tarifa-activacion-migration.test.ts` verde contra Postgres, con ida y vuelta; las guardias
  `organizacion-en-modelos`, `rls-por-empresa`, `fk-misma-empresa` y `unicos-por-empresa`, verdes.
- [ ] **T1.2 Historial** (R4). `tarifas_activadas`, entidad y etiqueta. *Hecho:* guardias
  `catalogo-y-choke-point` y `historial-accion-escrituras-cubiertas` verdes.
- [ ] **T1.3 Interruptor** (R1, R2, R3). `usaModeloNuevo` lee `tarifa_activacion`; `TarifaTxClient` y
  `PagoTarifaTxClient`; dobles y sembrados del modelo nuevo siembran la activación. Comentarios del resolver y
  de `asegurarMismoModelo`. *Hecho:* suite de tarifas y cierre verde; `tarifas-flexibles-respaldo` prueba valores
  sin activación con importes literales.
- [ ] **T1.4 Activar** (R4-R7, R9). `TarifaActivacionService`, `TarifaActivacionRepository`, interfaces, fábrica y
  action `activarTarifasNuevas`. Depende de T2.1 para los faltantes: se puede inyectar un doble y atarlo en T2.3.
  *Hecho:* tests de service e integración verdes, con la carrera `P2002` probada contra Postgres.
- [ ] **T1.5 Guardia de lectores** (R1). `tarifa-valor-lectores.guardia`. *Hecho:* mutación: un `tarifaValor.findMany`
  en otro archivo la pone roja.
- [ ] **T1.6 Contraprueba** (R1, R2, R12). Mutaciones a mano sobre `usaModeloNuevo` (volver a leer `tarifa_valor`) y
  sobre la RLS de la tabla. Salida en rojo pegada en `progress/impl_SLT-54.md`.

## Tanda B — Lecturas, referencia y vías viejas (backend)

- [ ] **T2.1 [P] Faltantes** (R13-R17). `lib/tarifas/faltantes.ts`. *Hecho:* tabla de casos: 0 escrito, grupo cubierto
  por zona, zona con solo grupos, solo tienda, vehículos completos, vehículo inactivo.
- [ ] **T2.2 [P] Referencia** (R20-R24). `leerModeloViejoCon` en el resolver y `lib/tarifas/referencia-vigente.ts`.
  *Hecho:* tabla con **literales** de cascada, bodega principal, pacto, especial sin pacto, «No paga» frente a ₡0
  y «Varía»; integración en Postgres con dos empresas; mutar la tarifa sonda la pone roja.
- [ ] **T2.3 Lecturas** (R55, R12). `TarifasPantallaService` y su repositorio; `cargarPantallaTarifas` y
  `cargarZonaTarifas`. *Hecho:* matriz de roles; integración con dos empresas (empresa A no ve lo de B); consulta de
  empresa activada sin leer `tarifas` (R24).
- [ ] **T2.4 Escritura** (R35-R38, R52). `guardarValoresTarifa` y cuatro actions de grupos; `existeVehiculo` da paso a la
  regla de inactivo; mensajes de grupos sin el nombre de nivel a mano. *Hecho:* tests de action y de service,
  con el `ivaPct` ausente y la carrera en `validation_error`.
- [ ] **T2.5 Retiro de vías viejas** (R26, R27, R28, R29). Salen las cuatro actions de `tarifas` y
  `actualizarDistritosEspeciales`; guarda en `crearZona` y `actualizarZona`. *Hecho:* `zonas-action.test.ts` adaptado,
  `tarifas-action.test.ts` reescrito; guardia `superficie-de-uso` verde; nueva guardia `tarifas-sin-escritura-vieja`.
- [ ] **T2.6 [P] Cobertura** (R30). `listZonaIdsConTarifaGeneral` por modelo. *Hecho:* `cobertura-repository.test.ts` con
  empresa activada y sin activar, y dos empresas.

## Tanda C — Huecos del lado servidor (backend)

- [ ] **T3.1 [P] DTO del cierre** (R62, R63). `IngresoEmpresaDTO.tarifaModelo`. *Hecho:* test del DTO, viejo igual que hoy.
- [ ] **T3.2 [P] Aporte** (R64). `buildWhere` y `satisfaceCriterio`. *Hecho:* integración en Postgres: orden sin el concepto
  fuera de la lista y del `count`; orden con el concepto en 0 dentro; equivalencia verde; una mutación del `WHERE` la
  pone roja.
- [ ] **T3.3 [P] Listado** (R66). `fulfillment` en el ítem. *Hecho:* `convergencia-tarifa-listado-cierre` da el mismo importe;
  el viejo no cambia.
- [ ] **T3.4 Empresa nueva** (R31, R32). *Hecho:* integración: empresa dada de alta sin activación ni tarifas, cierre 0 y 409
  antes y después de activar.

## Tanda D — Pantalla (frontend). Depende de A y B

- [ ] **T4.1 Marco** (R25, R33, R40, R55, R57, R58, R61). `page.tsx` y `TarifasModule`; estado de borrador y en vigor;
  lista de zonas. Salen los archivos viejos y sus tests; las guardias `rechazo-nombre-466` y `estado-con-info` pierden su
  entrada. *Hecho:* `TarifasPage.test.tsx` reescrito, `TarifasModulo.test.tsx`.
- [ ] **T4.2 Faltantes y activar** (R17, R18, R19). *Hecho:* `TarifasActivar.test.tsx`: casilla, sin faltantes sin casilla,
  «Completar», `ya_activada`.
- [ ] **T4.3 Rejilla de valores** (R20, R22, R23, R34-R39). *Hecho:* `TarifasValores.test.tsx`: la referencia nunca
  entra en el campo; `ivaPct` ausente en el payload espiado; vacío quita; fila en error; IVA vacío (P3).
- [ ] **T4.4 Grupos y tiendas** (R41-R46). *Hecho:* `TarifasGrupos.test.tsx`, `TarifasTiendas.test.tsx`; marca de solo lectura y
  sin llamada de escritura.
- [ ] **T4.5 Por vehículo** (R47-R51, R54). *Hecho:* `TarifasVehiculo.test.tsx`: con 1, 2 y 8 vehículos; alta sin tocar nada;
  inactivo con valor marcado y sin valor ausente; apagar con confirmación; catálogo vacío.
- [ ] **T4.6 Menú** (R56). *Hecho:* `destino-post-login.test.ts` sin cambios en lo que afirma, y `menu-visibility` por rol.
- [ ] **T4.7 Disposición** (R59, R60, R70). `TarifasDisposicion.test.tsx`, según design §12.

## Tanda E — Huecos de pantalla (frontend). Depende de C

- [ ] **T5.1 [P] Tarjeta** (R62, R63, R65). `DesgloseIngresoEmpresa`, totales. *Hecho:* `CierreDesgloseModeloNuevo.test.tsx`: sin
  nota falsa, conceptos y total, fulfillment fuera del total y oculto a quien no lo ve; viejo igual; guardia
  `flete-por-rechazo-censo` verde.
- [ ] **T5.2 [P] Factura y descarga** (R62). `cierre-factura.tsx` y la descarga leen `ing.fulfillment`. *Hecho:* test de columnas.
- [ ] **T5.3 [P] Columnas del listado** (R66). Órdenes, monitoreo y recibidas. *Hecho:* test de columna con viejo y nuevo.

## Tanda F — E2E, medición y cierre

- [ ] **T6.1 E2E** (R67, R68, R69). `e2e/tarifas-activacion.spec.ts`, `e2e/zona-especial-dos-empresas.spec.ts` sin `fixme`, sus fixtures
  y la excepción fuera de `e2e-sin-saltos`. Es la única: su test de línea 541 (`EXCEPCIONES.length > 0`) cambia para
  admitir una lista vacía. Registrar los nuevos en los proyectos de `playwright.config.ts`. *Hecho:* salida en la bitácora.
- [ ] **T6.2 Medidas** (R54, R59, R60, R70). `e2e/tarifas-maqueta.spec.ts`. *Hecho:* tabla medida frente a maqueta en la bitácora, con
  cada número de design §12, en claro y oscuro, y 8 vehículos.
- [ ] **T6.3 Medición** (R11). Antes del PR, cuántas empresas tienen valores en `tarifa_valor` por entorno, sin imprimir URLs.
  Si hay alguna en producción, se dice a Carlos. Lo hace el leader. *Hecho:* cifra en `progress/features/SLT-54.md`.
- [ ] **T6.4 Documentos.** `docs/architecture.md > Tarifas flexibles`: interruptor, consecuencia y SLT-53. *Hecho:* mapa `R<n> -> test`
  en `progress/impl_SLT-54.md`, con los E2E `e2e/cierre-*`, `e2e/wallet-*`, `e2e/dos-empresas-humo.spec.ts` en verde.
- [ ] **T6.5 Salida.** No se despliega suelta: la épica sale completa. La migración va en el PR de esta ficha. *Hecho:* leader lo
  comprueba en F2.

## Mapa R → test

| R | Test |
|---|---|
| R1 | `tests/integration/db/tarifas-flexibles-respaldo.test.ts` › «empresa sin activar con valores nuevos calcula con el viejo»; `tarifa-valor-lectores.guardia` |
| R2 | `tests/integration/db/tarifas-flexibles-resolver.test.ts` › «activada sin valores: sin tarifa y sin leer el viejo» |
| R3 | `tests/integration/db/tarifa-activacion.test.ts` › «fijar y quitar no cambian el modelo» |
| R4 | `tests/integration/db/tarifa-activacion.test.ts` › «activación con actor e historial en la misma transacción» |
| R5 | `tests/unit/services/tarifa-activacion-service.test.ts` › «matriz de roles» |
| R6 | `tests/unit/services/tarifa-activacion-service.test.ts` › «con faltantes pide confirmación» |
| R7 | `tests/integration/db/tarifa-activacion.test.ts` › «dos activaciones simultáneas: una fila y un historial» |
| R8 | `tests/integration/db/tarifa-activacion-migration.test.ts` › «la app no modifica ni borra»; `tests/components/TarifasModulo.test.tsx` › «sin desactivar» |
| R9 | `tests/integration/db/tarifa-activacion.test.ts` › «activar no toca valores, viejo, marca ni cierres» |
| R10 | `tests/unit/repositories/cierre-pago-congelado.test.ts` › «aborta al cambiar de modelo»; `tests/integration/db/tarifas-flexibles-snapshot.test.ts` › «activación entre pago y cobro» |
| R11 | `tests/integration/db/tarifa-activacion-migration.test.ts` › «relleno y bajada» |
| R12 | `tests/integration/db/tarifa-activacion.test.ts` › «activar A no cambia B», con SQL a mano |
| R13-R16 | `tests/unit/tarifas/faltantes.test.ts` |
| R17 | `tests/unit/tarifas/faltantes.test.ts` › «estados»; `tests/components/TarifasModulo.test.tsx` › «M de T» |
| R18, R19 | `tests/components/TarifasActivar.test.tsx` |
| R20 | `tests/components/TarifasValores.test.tsx` › «la referencia no entra en el campo» |
| R21-R23 | `tests/unit/tarifas/referencia-vigente.test.ts`; `tests/integration/db/tarifas-referencia.test.ts` |
| R24 | `tests/integration/db/tarifas-referencia.test.ts` › «activada no lee el viejo»; `tests/components/TarifasValores.test.tsx` › «sin Hoy rige» |
| R25 | `tests/unit/app/tarifas/TarifasPage.test.tsx` |
| R26 | `tests/integration/actions/tarifas-action.test.ts` › «las acciones viejas ya no existen»; `tests/unit/guards/tarifas-sin-escritura-vieja.guardia.test.ts` |
| R27 | `tests/integration/actions/zonas-action.test.ts` › «la action rechaza costos» |
| R28 | `tests/unit/guards/superficie-de-uso.guardia.test.ts`; `tests/unit/guards/tarifas-sin-escritura-vieja.guardia.test.ts` |
| R29 | `tests/integration/db/tarifa-activacion.test.ts` › «guardar no escribe en el viejo» |
| R30 | `tests/integration/db/cobertura-repository.test.ts` › «tarifa general por modelo» |
| R31, R32 | `tests/integration/db/tarifa-empresa-nueva.test.ts` |
| R33-R39 | `tests/components/TarifasValores.test.tsx`; R36 y R37 también en `tests/integration/actions/tarifas-action.test.ts` |
| R40 | `tests/components/TarifasModulo.test.tsx` › «en vigor»; `e2e/tarifas-activacion.spec.ts` |
| R41 | `tests/components/TarifasTiendas.test.tsx` |
| R42-R46 | `tests/components/TarifasGrupos.test.tsx`; R46 también en `tests/integration/db/tarifas-referencia.test.ts` › «marca y grupo por separado» |
| R47-R51 | `tests/components/TarifasVehiculo.test.tsx` |
| R52 | `tests/unit/services/tarifa-valor-service.test.ts` › «vehículo inactivo»; `tests/integration/db/tarifas-flexibles-escritura.test.ts` › «inactivo» |
| R53 | `tests/integration/db/tarifas-flexibles-resolver.test.ts` › «vehículo inactivo sigue pagando» |
| R54 | `e2e/tarifas-maqueta.spec.ts` › «8 vehículos» |
| R55 | `tests/unit/app/tarifas/TarifasPage.test.tsx`; `tests/unit/services/tarifas-pantalla-service.test.ts`; `e2e/tarifas-activacion.spec.ts` |
| R56 | `tests/unit/auth/menu-visibility.test.ts` › «Tarifas para admin»; `tests/unit/auth/destino-post-login.test.ts` |
| R57, R58 | `tests/components/TarifasModulo.test.tsx` |
| R59, R60 | `e2e/tarifas-maqueta.spec.ts`; `tests/components/TarifasDisposicion.test.tsx` |
| R61 | `tests/components/TarifasDisposicion.test.tsx`; `tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts` |
| R62, R63, R65 | `tests/components/CierreDesgloseModeloNuevo.test.tsx`; `tests/unit/repositories/cierres-admin-repository.test.ts` |
| R64 | `tests/integration/db/cierre-aporte-modelo-nuevo.test.ts`; `tests/unit/utils/aporte-por-orden-equivalencia.test.ts` |
| R66 | `tests/unit/repositories/convergencia-tarifa-listado-cierre.test.ts`; `tests/components/OrdenesColumnaFulfillment.test.tsx` |
| R67 | `e2e/tarifas-activacion.spec.ts` › «digitar, activar y cierre» |
| R68 | `e2e/tarifas-activacion.spec.ts` › «dos empresas» |
| R69 | `e2e/zona-especial-dos-empresas.spec.ts`; `tests/unit/guards/e2e-sin-saltos.guardia.test.ts` |
| R70 | `e2e/tarifas-maqueta.spec.ts`; `tests/components/TarifasDisposicion.test.tsx` |

## Archivos esperados

**Esquema y datos**
- `db/schema.prisma`
- `db/migrations/20261104120000_historial_tarifa_activacion/migration.sql`
- `db/migrations/20261104120000_historial_tarifa_activacion/down.sql`
- `db/migrations/20261104120100_tarifa_activacion/migration.sql`
- `db/migrations/20261104120100_tarifa_activacion/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `scripts/verificar-rls-despliegue.ts`

**Backend**
- `lib/repositories/_shared/resolver-tarifas.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/repositories/TarifaActivacionRepository.ts`
- `lib/repositories/TarifasPantallaRepository.ts`
- `lib/repositories/TarifaValorRepository.ts`
- `lib/repositories/CoberturaRepository.ts`
- `lib/repositories/CierreAporteRepository.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/services/TarifaActivacionService.ts`
- `lib/services/TarifasPantallaService.ts`
- `lib/services/TarifaValorService.ts`
- `lib/services/GrupoDistritosService.ts`
- `lib/interfaces/repositories/ITarifaActivacionRepository.ts`
- `lib/interfaces/repositories/ITarifasPantallaRepository.ts`
- `lib/interfaces/repositories/ITarifaValorRepository.ts`
- `lib/interfaces/repositories/ITarifaVigenteRepository.ts`
- `lib/interfaces/repositories/ITarifaZonaMensajeroRepository.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/interfaces/services/ITarifaActivacionService.ts`
- `lib/interfaces/services/ITarifasPantallaService.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/actions/tarifas.ts`
- `lib/actions/zonas.ts`
- `lib/actions/geografia.ts`
- `lib/tarifas/faltantes.ts`
- `lib/tarifas/referencia-vigente.ts`
- `lib/tarifas/servicios.ts`
- `lib/types/tarifa-flexible.ts`
- `lib/types/tarifa.ts`
- `lib/types/historial-accion.ts`
- `lib/types/historial-accion-etiquetas.ts`
- `lib/utils/aporte-por-orden.ts`
- `lib/auth/menu-visibility.ts`

**Pantalla nueva**
- `app/(app)/configuracion/tarifas/page.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasModule.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasEstado.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasZonas.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasValores.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasVehiculo.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasGrupos.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasTiendas.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasActivarDialog.tsx`
- `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts`

**Pantalla vieja, salen**
- `app/(app)/configuracion/tarifas/_components/TiendasModule.tsx`
- `app/(app)/configuracion/tarifas/_components/CrearTiendaForm.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifaCampos.tsx`
- `app/(app)/configuracion/tarifas/_components/CobroVehiculoTarifas.tsx`
- `app/(app)/configuracion/tarifas/_components/tarifas-labels.ts`
- `app/(app)/configuracion/tarifas/_components/useDestinoAnimado.ts`

**Huecos en pantalla**
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`
- `app/(app)/cierres-admin/_components/cierre-factura.tsx`
- `app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts`
- `app/(app)/ordenes/_components/ordenes-columns.tsx`
- `app/(app)/monitoreo/_components/detalle-columnas.ts`
- `app/(app)/recepcion-satelite/_components/recibidas-columns.tsx`
- `app/(app)/configuracion/zonas/_components/CrearZonaForm.tsx`

**Documentos**
- `docs/architecture.md`
- `progress/impl_SLT-54.md`
- `progress/review_SLT-54.md`
- `progress/features/SLT-54.md`

**Tests y E2E nuevos**
- `tests/integration/db/tarifa-activacion.test.ts`
- `tests/integration/db/tarifa-activacion-migration.test.ts`
- `tests/integration/db/tarifa-empresa-nueva.test.ts`
- `tests/integration/db/tarifas-referencia.test.ts`
- `tests/integration/db/cierre-aporte-modelo-nuevo.test.ts`
- `tests/unit/services/tarifa-activacion-service.test.ts`
- `tests/unit/services/tarifas-pantalla-service.test.ts`
- `tests/unit/tarifas/faltantes.test.ts`
- `tests/unit/tarifas/referencia-vigente.test.ts`
- `tests/unit/guards/tarifa-valor-lectores.guardia.test.ts`
- `tests/unit/guards/tarifas-sin-escritura-vieja.guardia.test.ts`
- `tests/components/TarifasModulo.test.tsx`
- `tests/components/TarifasActivar.test.tsx`
- `tests/components/TarifasValores.test.tsx`
- `tests/components/TarifasGrupos.test.tsx`
- `tests/components/TarifasTiendas.test.tsx`
- `tests/components/TarifasVehiculo.test.tsx`
- `tests/components/TarifasDisposicion.test.tsx`
- `tests/components/CierreDesgloseModeloNuevo.test.tsx`
- `tests/components/OrdenesColumnaFulfillment.test.tsx`
- `e2e/tarifas-activacion.spec.ts`
- `e2e/tarifas-maqueta.spec.ts`
- `e2e/_tarifas-activacion-fixture.ts`

**Tests y E2E que cambian o salen**
- `e2e/zona-especial-dos-empresas.spec.ts`
- `e2e/_zona-especial-fixture.ts`
- `playwright.config.ts`
- `tests/unit/guards/e2e-sin-saltos.guardia.test.ts`
- `tests/unit/guards/rechazo-nombre-466.guardia.test.ts`
- `tests/unit/guards/estado-con-info.guardia.test.ts`
- `tests/unit/components/rechazo-nombre-466-app.test.ts`
- `tests/unit/scripts/verificar-rls-despliegue.test.ts`
- `tests/unit/app/tarifas/TarifasPage.test.tsx`
- `tests/unit/tarifas/servicios-composicion.test.ts`
- `tests/unit/services/tarifa-valor-service.test.ts`
- `tests/unit/services/grupo-distritos-service.test.ts`
- `tests/unit/auth/menu-visibility.test.ts`
- `tests/unit/auth/destino-post-login.test.ts`
- `tests/unit/actions/geografia-action.test.ts`
- `tests/unit/actions/distritos-especiales-action.test.ts`
- `tests/unit/utils/tarifa-especial-por-distrito.test.ts`
- `tests/unit/utils/aporte-por-orden.test.ts`
- `tests/unit/utils/aporte-por-orden-equivalencia.test.ts`
- `tests/unit/repositories/tarifa-vigente-repository.test.ts`
- `tests/unit/repositories/orden-repository.test.ts`
- `tests/unit/repositories/convergencia-tarifa-listado-cierre.test.ts`
- `tests/unit/repositories/cierres-admin-corregir-resultado-where.test.ts`
- `tests/unit/repositories/cierres-admin-repository.test.ts`
- `tests/unit/repositories/cierre-pago-congelado.test.ts`
- `tests/unit/repositories/cierre-aporte-repository.test.ts`
- `tests/fixtures/tarifa-tienda.ts`
- `tests/integration/actions/tarifas-action.test.ts`
- `tests/integration/actions/zonas-action.test.ts`
- `tests/integration/db/cobertura-repository.test.ts`
- `tests/integration/db/tarifas-flexibles-respaldo.test.ts`
- `tests/integration/db/tarifas-flexibles-resolver.test.ts`
- `tests/integration/db/tarifas-flexibles-snapshot.test.ts`
- `tests/integration/db/tarifas-flexibles-base-congelada.test.ts`
- `tests/integration/db/tarifas-flexibles-escritura.test.ts`
- `tests/components/TarifasClaridadMontos.test.tsx`
- `tests/components/TarifasAlineacionRejilla.test.tsx`
- `tests/components/CrearTiendaForm.test.tsx`
- `tests/components/ZonasTarifasEditarDistritos.test.tsx`
- `tests/components/ZonaDistritoEnOtraZona.test.tsx`
- `tests/components/ZonaDistritoEspecial.test.tsx`
- `tests/components/ZonaFormSinCostos.test.tsx`
- `tests/components/ZonaNombreNoImprimible.test.tsx`
- `tests/components/ZonaBorradoMotivo.test.tsx`
- `tests/components/ZonaCentralConfirmacion.test.tsx`
- `tests/components/CrearZonaFormReconciliacion.test.tsx`
