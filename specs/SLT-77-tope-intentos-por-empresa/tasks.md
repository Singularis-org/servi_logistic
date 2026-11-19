# SLT-77 — tope-intentos-por-empresa · tasks.md

**Puerta humana al aprobar el spec.** Se responde `requirements > P1` y se revisan los textos de `design §4.2`. La sección
no es pantalla nueva y no pasa por `/design`. Sale con EP-8.

Reglas de todas las tandas:

- Una tanda por agente. `backend_dev` para A, B, C y D; `frontend_dev` para E. Si se lanza directo, sin subagentes anidados.
- Dinero y empresa contra Postgres real: `tests/integration/db/`, con `HAY_BASE_DE_DATOS` y sin `if (!fila) return`.
- Cada tanda cierra con sus **mutaciones**: una a una, en un arnés que primero compruebe que ejecutó tests. Cada una debe
  poner en rojo el test que se nombra. **Mutaciones y gate nunca en paralelo.**
- Cada tanda commitea. El informe cita el SHA y la salida real de los tests.
- Umbrales e importes de los tests, en literales a mano: nunca leídos de la función que se prueba.
- Sin dependencias nuevas. Una ruta no prevista se añade a `## Archivos esperados` antes de tocarla.

## Tanda 0 — Preparación

- [x] **T0.1** Copiar `.env` al worktree y comprobar, solo con booleanos, que `DATABASE_URL` existe y no es de Ordenex.
  **Hecho:** `vitest` no reporta saltos por `HAY_BASE_DE_DATOS`.
- [x] **T0.2** Mirar `origin/dev` y tomar timestamps de migración mayores que el último. **Hecho:** nombres en el informe.

## Tanda A — Base (backend). Depende de T0

- [x] **T1.1** Migración `..._historial_tope_intentos` y su `down.sql`; `lib/types/historial-accion.ts`, etiquetas y
  categoría (`design §1.1`, `§2.3`). **Hecho:** catálogo y los tests de migración con la lista literal del enum al día.
- [x] **T1.2** Migración `..._organizacion_tope_intentos` y su `down.sql`; `db/schema.prisma`. **Hecho:** aplicada en la
  desechable y `prisma generate`. No generar en paralelo con otro worktree.
- [x] **T1.3** `lib/repositories/_shared/tope-intentos-empresa.ts` (`design §2.1`). **Hecho:** typecheck verde.
- [x] **T1.4** `tests/integration/db/tope-intentos-migration.test.ts`. Cubre: R2 con empresa previa y empresa nueva por
  `altaEmpresa`; R6 con 0, 11 y -1 por SQL; R38 con ida y vuelta, y que el código anterior lee. **Hecho:** 0 saltos.
- **Mutaciones A:**
  1. `DEFAULT 3` a `DEFAULT 4` → R2.
  2. Quitar el `CHECK` → R6.
  3. `down.sql` sin `REVOKE` → R38.

## Tanda B — Escritura y lectura de la pantalla (backend). Depende de A

- [x] **T2.1** `lib/types/tarifa-flexible.ts`: constantes y `guardarTopeIntentosSchema`. **Hecho:** `tarifa-schemas.test.ts`
  cubre 1, 10, 0, 11, 2,5, texto y claves de más (R5).
- [x] **T2.2** `ITopeIntentosRepository`, `TopeIntentosRepository.guardar`, `ITopeIntentosService`, `TopeIntentosService`,
  fábrica y entrada en `historial-accion-escrituras-cubiertas.guardia` (`design §2.3`, `§4.1`). **Hecho:**
  `tope-intentos-service.test.ts` cubre R4 y R5, con el rol comprobado antes que el input.
- [x] **T2.3** `guardarTopeIntentos` en `lib/actions/tarifas.ts`; `cargarPantalla` con `topeIntentos`. **Hecho:**
  `tarifas-action.test.ts` y `tarifas-pantalla-service.test.ts` cubren R3, R4 y R14; `servicios-composicion.test.ts` al día.
- [x] **T2.4** `tests/integration/db/tope-intentos-escritura.test.ts`, por el servicio y con dos empresas. Cubre: R1; R3; R7
  guardar en A no cambia B, y con `servi_app` por SQL: `UPDATE` de la fila de B no afecta filas, y `nombre`, `es_demo` y
  `plan_id` de A dan `42501`; R8 con una orden que ya alcanza el valor nuevo y conteos iguales en `orden`, `gestion_orden`,
  `orden_historial_estado`, `cierre_dia`, `cierre_detail`, `wallet_movimiento`; R9 con y sin `tarifa_activacion`; R10 con
  anterior, nuevo y actor literales; R11; R27 sin contexto y en plataforma; R41. **Hecho:** 0 saltos.
- **Mutaciones B:**
  1. Quitar la comprobación de rol → R4.
  2. Política de `UPDATE` con `USING (true)` → R7.
  3. `GRANT UPDATE` sobre toda la tabla → R7.
  4. Quitar `appendAccion` → R10.
  5. Quitar la rama de «igual al vigente» → R11.
  6. Leer con `organizacion.findFirst()` → R27, en plataforma.

## Tanda C — Cada punto usa su empresa (backend). Depende de B

- [x] **T3.1** `leerTopeIntentos()` en `IOrdenHistorialRepository`, `OrdenHistorialRepository` y el repositorio de cierres;
  `topeIntentos()` en `IOrdenHistorialService` y `OrdenHistorialService` (`design §3`). **Hecho:** typecheck verde.
- [x] **T3.2** Los 10 servicios de la tabla de `design §3`, con los `Pick` ensanchados. `umbral: number | null` para
  `mensajero` y `HistorialOrdenSheet` (`design §3.2`). **Hecho:** unit al día, sin importar la configuración. El tipo y el
  servidor están; el componente no se tocó: pasa a T5.3.
- [x] **T3.3** Borrar `lib/config/reintentos.ts` y `tests/unit/config/reintentos.test.ts`. Corregir los comentarios que citan
  ley o `reintentosConfig`, sin más cambios. **Hecho:** la guardia de T3.5 en verde.
- [x] **T3.4** `tests/integration/db/tope-intentos-caminos.test.ts`, moldes `cierre-sin-gestion-tope-sql-real` e
  `intentos-y-tope`. Empresas A (tope 2) y B (tope 4), órdenes con 2 intentos reales. Cada caso afirma los dos lados:
  - **R18:** `gestionar` del mensajero y de la ayuda: A `conflict`, sin fila; B acepta.
  - **R19:** reprogramar desde devolución.
  - **R20:** `GuiaAsignacionService` y `AsignacionSateliteService`, con lote mixto.
  - **R21:** aprobar: en A, `rechazada` con gestión sintética; en B, a bodega.
  - **R22:** `wrong_*` sin vencer y `not_found` vencida. Incluye bajar el tope y correr sin más clics.
  - **R23, R24:** plazo de aviso; `enElTope` en `MisAsignaciones` y `Novedades`.
  - **R25, R32:** la línea de tiempo da 2 y 4 a `maestro`; a `mensajero`, `null`, sin `umbral` ni tope en el JSON de sus
    listas.
  - **R26:** una sola ejecución de `handleProcesarDevueltasSla` por `paraCadaEmpresa` real; y una empresa cuyo fallo no frena
    a la otra (R27).
  - **R28:** tope 1, con cero intentos.
  - **R29:** sube, y A vuelve a admitir.
  - **R30:** conteos antes y después de cambiar el tope, iguales, en literales.
  **Hecho:** 0 saltos.
- [x] **T3.5** `tests/unit/guards/tope-intentos-sin-valor-global.guardia.test.ts`: en `lib/` y `app/` nadie nombra
  `reintentosConfig` en código, ni `REINTENTOS_MIN_INTENTOS` (R31); `tope_intentos_entrega` solo en los dos archivos de
  §2; sin «por ley», «cota legal» ni «umbral legal» en `lib/`, `app/`, `components/`, `e2e/` ni `tests/` (R40). Control
  positivo con un texto de muestra. **Hecho:** verde, y rojo con la mutación.
- [x] **T3.6** `intentos-entrega.test.tsx` y `tope-intentos.test.ts` siguen pasando sin cambiar su contrato (R32, R33).
- **Mutaciones C:**
  1. Cada uno de los 10 servicios, por separado, vuelve a un `3` literal (10 mutaciones) → su caso de R18 a R25.
  2. `umbral` también para `mensajero` → R32.
  3. `leerTopeIntentosDeLaEmpresa` con `LIMIT 1` sin `WHERE` → R26.

## Tanda D — Carreras (backend). Depende de C

- [x] **T4.1** `vetoPorTope` en `IDevolucionSlaRepository`, `DevolucionSlaRepository` y el servicio; `Math.max` en
  `CierresAdminRepository` (`design §6.1`). **Hecho:** typecheck verde.
- [x] **T4.2** `tests/integration/db/tope-intentos-carreras.test.ts`, con un doble del historial o del reloj que cambie el tope
  a mitad de la ejecución y Postgres real:
  - **R34:** el tope cambia tras la lectura: todas las órdenes deciden con el mismo.
  - **R35:** sube tras la lectura: la orden sigue en `devuelta`, sin gestión sintética, con `omitidas` 1; en la aprobación
    va a bodega; y `wrong_*` con ventana vencida escala igual.
  - **R36:** baja tras la lectura: no se rechaza, y la corrida siguiente sí.
  - **R37:** con 1 y con 50 candidatas, el número de lecturas del tope por corrida es el mismo.
  **Hecho:** 0 saltos; la ventana residual queda dicha en el informe, no probada.
- **Mutaciones D:**
  1. Quitar el veto → R35.
  2. `Math.max` por `Math.min` → R35, R36.
  3. Pasar `vetoPorTope` también al vencer la ventana → R35.
  4. Leer el tope dentro del bucle → R34, R37.

## Tanda E — Sección de la pantalla (frontend). Depende de B. [P] con C y D

- [x] **T5.1** `tarifas-textos.ts`, `TarifasTopeIntentos.tsx` y su sitio en `TarifasModule.tsx` (`design §4.2`). **Hecho:**
  `tests/components/TarifasTopeIntentos.test.tsx` cubre R12, R13, R15, R16 y R17, con los textos a mano.
- [x] **T5.2** `TarifasModulo.test.tsx`, `TarifasDisposicion.test.tsx`, `TarifasPage.test.tsx` y `tests/fixtures/tarifas-pantalla.ts`
  al día. R17 en la disposición (`min-h-11`, sin hex). **Hecho:** `vitest related` verde.
- [x] **T5.3** `HistorialOrdenSheet.tsx`: con `umbral` `null`, «Intento X» en el texto y en el `aria-label` (`design §3.2`). Hoy pintaría
  «Intento 2 de null», y compila porque una plantilla admite `null`. El `mensajero` no monta esa pantalla. **Hecho:** test de componente
  con `null`.
- **Mutaciones E:**
  1. Mostrar el aviso siempre → R16.
  2. No mostrarlo al bajar → R15.
  3. Enseñar el control con `puedeEscribir` falso → R13.
  4. Limpiar el valor elegido al fallar → R17.

## Tanda F — E2E y medida. Depende de C, D y E

- [x] **T6.1** `e2e/tope-intentos-por-empresa.spec.ts`, en el proyecto `dinero`. Empresas nuevas por los servicios reales,
  con cifras a mano en la cabecera. Recorre:
  1. Las dos empresas ven 3 en `/configuracion/tarifas`.
  2. El `maestro` de A elige 2: ve el aviso, guarda. Nada cambia en la orden al guardar (R8).
  3. Una novedad de A con 2 intentos escala tras correr el proceso, sin más clics; el siguiente cierre lleva el importe de
     rechazo fijado en la cabecera (R22). La misma situación en B no escala.
  4. En A, una orden en bodega con 2 intentos no se asigna, con el motivo de siempre; en B, sí (R20).
  5. Sube a 3: la orden de bodega vuelve a asignarse (R29). Historial con actor y números (R10).
  6. `admin` ve solo lectura; `mensajero` no entra, y su panel no trae el número (R13, R14, R32).
  7. A 390 px, `documentElement.scrollWidth` ≤ 390 y controles ≥ 44 (R17).
  **Hecho:** `--project=dinero`, dos corridas seguidas sobre la misma base, 0 failed, 0 skipped, 0 flaky. Log sin `tail`, con
  `INIT_EXIT=$?` dentro.
- [x] **T6.2** `e2e/reintentos-escalado.spec.ts`: corregir el comentario de «umbral legal»; sigue verde con 3.
  `e2e/dos-empresas-humo.spec.ts`, porque toca `organizacion` y datos de negocio. **Hecho:** verdes.
- [x] **T6.3** Mirar la sección con el navegador, a 1360 y 390 px, claro y oscuro, con un solo dev server. **Hecho:** capturas en
  `progress/impl_SLT-77.md`.

## Tanda G — Documentación y cierre. Depende de F

- [x] **T7.0** R42: el motivo de la orden agotada en los dos mappers de asignación; test desde `MSG_TOPE_INTENTOS_ASIGNACION` contra el
  texto a mano; E2E al día en la satélite. **Hecho:** quitar cada entrada pone en rojo su test.
- [x] **T7.1** `docs/architecture.md`: el tope en `> Tarifas flexibles`, y en `> Multi-empresa` la excepción de la columna a «solo
  lectura». `docs/ayuda/oficina/configuracion-tarifas.md`: sección y `actualizado`. **Hecho:** guardias de ayuda verdes.
- [x] **T7.2** `progress/deudas.md`: deuda nueva junto a D49, con `design §8` entero (R39). Número libre; D60 si sigue libre.
  **Hecho:** el reviewer lo compara con `design §8`.
- [x] **T7.3** `progress/impl_SLT-77.md`: mapa `R<n> → test` con los 42, salida real y cada mutación. **Hecho:** coincide con la
  tabla de abajo.
- [x] **T7.4** `./init.sh` en verde tras revertir toda mutación, y `git status` sin ninguna. **Hecho:** salida pegada. El
  `gate-completo` lo da el PR, que abre el leader tras el OK del reviewer.
- [ ] **T7.5 (leader, antes del PR a `prod`)** T0 de `design §9`: `REINTENTOS_MIN_INTENTOS` en producción, solo si existe y si vale
  3. **Hecho:** resultado con fecha en `progress/features/SLT-77.md`; con otro valor, se para y se pregunta.

## Dependencias

```
T0 → A → B ─┬→ C → D ─┬→ F → G
            └→ E ─────┘
```

## Trazabilidad

| R | Test |
|---|---|
| R1 | `tests/integration/db/tope-intentos-escritura.test.ts` |
| R2 | `tests/integration/db/tope-intentos-migration.test.ts` |
| R3 | `tope-intentos-escritura.test.ts`, `tests/integration/actions/tarifas-action.test.ts` |
| R4 | `tests/unit/services/tope-intentos-service.test.ts`, `tarifas-action.test.ts` |
| R5 | `tests/unit/types/tarifa-schemas.test.ts`, `tope-intentos-service.test.ts` |
| R6 | `tope-intentos-migration.test.ts` |
| R7, R8, R9, R10, R11 | `tope-intentos-escritura.test.ts`; R8 y R10 también `e2e/tope-intentos-por-empresa.spec.ts` |
| R12, R13, R15, R16, R17 | `tests/components/TarifasTopeIntentos.test.tsx`; R13 y R17 también el E2E |
| R14 | `tests/unit/services/tarifas-pantalla-service.test.ts`, `tests/unit/app/tarifas/TarifasPage.test.tsx` |
| R18 a R26, R28, R29, R30 | `tests/integration/db/tope-intentos-caminos.test.ts`; R20, R22 y R29 también el E2E |
| R27 | `tope-intentos-escritura.test.ts`, `tope-intentos-caminos.test.ts` |
| R31, R40 | `tests/unit/guards/tope-intentos-sin-valor-global.guardia.test.ts` |
| R32 | `tope-intentos-caminos.test.ts`, `tests/unit/services/orden-historial-service.test.ts`, `tests/unit/components/intentos-entrega.test.tsx` |
| R33 | `tests/unit/types/tope-intentos.test.ts` |
| R34, R35, R36, R37 | `tests/integration/db/tope-intentos-carreras.test.ts` |
| R38 | `tope-intentos-migration.test.ts` |
| R39 | Sin test ejecutable: es un documento. Lo comprueba el reviewer sobre `progress/deudas.md`; se declara aquí como excepción para que la decida el humano al aprobar. |
| R41 | `tope-intentos-escritura.test.ts`, `tests/unit/guards/tope-intentos-pii.guardia.test.ts` |
| R42 | `tests/unit/components/guia-decision-error-messages.test.ts`; la satélite también el E2E |

## Archivos esperados

- `specs/SLT-77-tope-intentos-por-empresa/requirements.md`
- `specs/SLT-77-tope-intentos-por-empresa/design.md`
- `specs/SLT-77-tope-intentos-por-empresa/tasks.md`
- `progress/features/SLT-77.md`
- `progress/impl_SLT-77.md`
- `progress/deudas.md`
- `docs/architecture.md`
- `docs/ayuda/oficina/configuracion-tarifas.md`
- `db/schema.prisma`
- `lib/actions/orden-historial.ts`
- `db/migrations/20261107130000_historial_tope_intentos/migration.sql`
- `db/migrations/20261107130000_historial_tope_intentos/down.sql`
- `db/migrations/20261107130100_organizacion_tope_intentos/migration.sql`
- `db/migrations/20261107130100_organizacion_tope_intentos/down.sql`
- `lib/config/reintentos.ts`
- `lib/config/devolucion-sla.ts`
- `lib/config/jobs.ts`
- `lib/config/ranking.ts`
- `lib/types/order-status.ts`
- `lib/types/tope-intentos.ts`
- `lib/types/tarifa-flexible.ts`
- `lib/types/historial-accion.ts`
- `lib/types/historial-accion-etiquetas.ts`
- `lib/tarifas/servicios.ts`
- `lib/actions/tarifas.ts`
- `lib/interfaces/repositories/ITopeIntentosRepository.ts`
- `lib/interfaces/repositories/IOrdenHistorialRepository.ts`
- `lib/interfaces/repositories/ICierresAdminRepository.ts`
- `lib/interfaces/repositories/IDevolucionSlaRepository.ts`
- `lib/interfaces/repositories/ITarifasPantallaRepository.ts`
- `lib/interfaces/services/ITopeIntentosService.ts`
- `lib/interfaces/services/IOrdenHistorialService.ts`
- `lib/interfaces/services/IMisAsignacionesService.ts`
- `lib/interfaces/services/ITarifasPantallaService.ts`
- `lib/repositories/_shared/tope-intentos-empresa.ts`
- `lib/repositories/TopeIntentosRepository.ts`
- `lib/repositories/OrdenHistorialRepository.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/repositories/DevolucionSlaRepository.ts`
- `lib/repositories/TarifasPantallaRepository.ts`
- `lib/services/TopeIntentosService.ts`
- `lib/services/TarifasPantallaService.ts`
- `lib/services/AsignacionSateliteService.ts`
- `lib/services/AvisosDiariosService.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/DevolucionSlaService.ts`
- `lib/services/GestionDesdeAyudaService.ts`
- `lib/services/GuiaAsignacionService.ts`
- `lib/services/MisAsignacionesService.ts`
- `lib/services/NovedadesService.ts`
- `lib/services/OrdenHistorialService.ts`
- `lib/services/ReprogramacionTiendaService.ts`
- `app/(app)/ordenes/_components/HistorialOrdenSheet.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasTopeIntentos.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasModule.tsx`
- `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts`
- `e2e/tope-intentos-por-empresa.spec.ts`
- `e2e/reintentos-escalado.spec.ts`
- `progress/capturas/SLT-77/seccion-1360-claro.png`
- `progress/capturas/SLT-77/seccion-1360-oscuro.png`
- `progress/capturas/SLT-77/seccion-390-claro.png`
- `progress/capturas/SLT-77/seccion-390-oscuro.png`
- `progress/capturas/SLT-77/solo-lectura-1360-claro.png`
- `progress/capturas/SLT-77/solo-lectura-1360-oscuro.png`
- `progress/capturas/SLT-77/solo-lectura-390-claro.png`
- `progress/capturas/SLT-77/solo-lectura-390-oscuro.png`
- `playwright.config.ts`
- `tests/integration/db/tope-intentos-migration.test.ts`
- `tests/integration/db/tope-intentos-escritura.test.ts`
- `tests/integration/db/tope-intentos-caminos.test.ts`
- `tests/integration/db/tope-intentos-carreras.test.ts`
- `tests/integration/db/484-puntero-aprobacion-sql-real.test.ts`
- `tests/integration/db/455/caracterizacion/intentos-y-tope.test.ts`
- `tests/integration/db/454/caracterizacion/tope-276.test.ts`
- `tests/integration/db/cierre-sin-gestion-confirmacion-sql-real.test.ts`
- `tests/integration/db/cierre-sin-gestion-tope-sql-real.test.ts`
- `tests/integration/db/tarifa-activacion-migration.test.ts`
- `tests/integration/db/tarifa-activacion.test.ts`
- `tests/integration/db/historial-accion-zona-pago-mensajero-migration.test.ts`
- `tests/integration/db/historial-accion-zona-sinpe-migration.test.ts`
- `tests/integration/db/historial-accion-orden-zona-reconciliada-migration.test.ts`
- `tests/integration/db/historial-accion-pago-mensajero-ajustado-migration.test.ts`
- `tests/integration/db/historial-accion-cobro-tienda-migration.test.ts`
- `tests/integration/db/historial-accion-conciliacion-bodega-migration.test.ts`
- `tests/integration/db/correccion-resultado-gestion-migration.test.ts`
- `tests/integration/db/caja-459-migration.test.ts`
- `tests/integration/actions/tarifas-action.test.ts`
- `tests/unit/config/reintentos.test.ts`
- `tests/unit/config/ranking.test.ts`
- `tests/unit/components/intentos-entrega.test.tsx`
- `tests/unit/guards/tope-intentos-sin-valor-global.guardia.test.ts`
- `tests/unit/guards/tope-intentos-pii.guardia.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`
- `tests/unit/tarifas/servicios-composicion.test.ts`
- `tests/unit/types/tope-intentos.test.ts`
- `tests/unit/types/tarifa-schemas.test.ts`
- `tests/unit/app/tarifas/TarifasPage.test.tsx`
- `tests/unit/services/tope-intentos-service.test.ts`
- `tests/unit/services/tarifas-pantalla-service.test.ts`
- `tests/unit/services/asignacion-satelite-tope-intentos.test.ts`
- `tests/unit/services/avisos-diarios-service.test.ts`
- `tests/unit/services/cierres-admin-tope-sin-gestion.test.ts`
- `tests/unit/services/cierres-admin-service.test.ts`
- `tests/unit/services/devolucion-sla-tope-wrong.test.ts`
- `tests/unit/services/gestion-desde-ayuda-tope-intentos.test.ts`
- `tests/unit/services/guia-asignacion-tope-intentos.test.ts`
- `tests/unit/services/intentos-entrega-criterio-unico.test.ts`
- `tests/unit/services/mis-asignaciones-477-correccion.test.ts`
- `tests/unit/services/mis-asignaciones-tope-intentos.test.ts`
- `tests/unit/services/orden-historial-service.test.ts`
- `tests/unit/services/reprogramacion-tienda-service.test.ts`
- `tests/unit/services/tope-intentos-dto-derivado.test.ts`
- `tests/fixtures/tarifas-pantalla.ts`
- `tests/components/GestionarOrdenPanelTope.test.tsx`
- `tests/components/TarifasTopeIntentos.test.tsx`
- `tests/components/TarifasModulo.test.tsx`
- `tests/components/TarifasDisposicion.test.tsx`
- `tests/components/HistorialOrdenSheet.test.tsx`
- `tests/integration/db/devolucion-rechazadas-flow.test.ts`
- `tests/unit/services/OrdenHistorialService.evento-orden.test.ts`
- `tests/unit/services/devolucion-sla-service.test.ts`
- `tests/unit/services/orden-historial-fusion.test.ts`
- `tests/fixtures/intentos-entrega.ts`
- `tests/unit/actions/orden-historial-action.test.ts`
- `tests/unit/services/CierresAdminService.aprobar.devolucion.test.ts`
- `tests/unit/services/cierre-bloqueo-superficies.test.ts`
- `tests/unit/services/cierres-admin-ajustar-pago.test.ts`
- `tests/unit/services/cierres-admin-aviso-rechazo.test.ts`
- `tests/unit/services/cierres-admin-confirmacion-fisica.test.ts`
- `tests/unit/services/cierres-admin-corregir-pagos.test.ts`
- `tests/unit/services/cierres-admin-corregir-resultado.test.ts`
- `tests/unit/services/cierres-admin-indemnizacion.test.ts`
- `tests/unit/services/cierres-admin-pendiente.test.ts`
- `tests/unit/services/devolucion-sla-plazo-unica-fuente.test.ts`
- `tests/unit/services/indemnizacion-tope-negocio-cierre.test.ts`
- `tests/unit/services/liberacion-al-aprobar-cierre.test.ts`
- `tests/unit/services/cierres-admin-service.aprobar.sin-gestion.test.ts`
- `tests/unit/repositories/cierres-admin-repository.test.ts`
- `app/(app)/recepcion-satelite/_components/asignacion-satelite-error-messages.ts`
- `app/(app)/ordenes/_components/guia-decision-error-messages.ts`
- `tests/unit/components/guia-decision-error-messages.test.ts`
- `tests/unit/services/orden-service.test.ts`
