# SLT-89 — geo-jerarquica-zonas · tasks.md

> Orden de trabajo. `[P]` = paralelizable con las otras `[P]` de su bloque una vez cumplidas sus
> dependencias. Cada task cierra con `pnpm run typecheck`, `pnpm run lint` y
> `pnpm exec vitest related --run <archivos tocados>` en verde, y un commit propio
> (`feat(SLT-89): …` / `test(SLT-89): …`). Referencias a `design.md` como §n.
>
> Regla de oro: **T1 (la base) va antes que cualquier lectura o escritura de la app.** Segunda regla:
> **con la tabla nueva vacía, Costa Rica no cambia** (R38): toda task que toque una lectura deja
> verdes, sin cambiar aserciones, los tests de integración existentes de esa lectura.
>
> P1–P3 de `requirements.md` siguen abiertas; las tasks están escritas con su propuesta. Si P2 se
> cierra «sí», T7 no empieza sin la maqueta aprobada (T0.2).
>
> **Tamaño estimado del PR:** ~75 archivos (41 de código, base y docs; 33 de tests, de ellos 10 de
> componentes que solo se adaptan a la nueva entrada del formulario; 1 E2E) y ~7 000 líneas
> (≈2 800 de código y SQL, ≈4 200 de tests), sin `specs/` ni `progress/`. Pasa el máximo por defecto (40 archivos / 1 000
> líneas); el humano decidió una sola tarjeta («¿Partir la tarjeta? No»).

## T0 — Lo heredado (no se re-crea)

Montado por SLT-43/44/45/46/52/54/65/71/75/76 en esta rama. Se usa tal cual:

- `nodo_geografico`, `tipo_nivel_geografico`, la sincronía nodo → geografía vieja y las columnas
  `nodo_geografico_id` con sus triggers (SLT-43, SLT-46). Solo cambia el **cuerpo** de
  `orden_nodo_geografico` (T1.1).
- Dominio puro `geografia-dominio.ts` (`zonasCandidatas`, `zonaQueCubre`, `esZonaEspecial`,
  `nodosBajo`, `ancestros`) y `_shared/zona-colapso.ts` (SLT-44).
- `CatalogoGeograficoRepository` con memoria por petición (SLT-44); `planificarReconciliacion`,
  `whereBaseElegible`, `whereLugarEn`, `sinTransaccionAnidada` (SLT-65, fichas 366/377).
- Índice único `(organizacion_id, distrito_id)` de `zona_distrito` y su traducción (SLT-75);
  historial `zona_distrito_cambiado` (SLT-76), `orden_zona_reconciliada` (366).
- `grupo_distritos`, `grupo_distritos_distrito` con su FK compuesta, `GrupoDistritosService`,
  `resolver-tarifas.ts`, `tarifa_activacion` (SLT-52, SLT-54).
- v1 `geo-resolucion.ts` y v2 `geo-ubicacion.ts` con la regla de guardado (SLT-45): no se tocan.
- `components/shared/Modal.tsx`, patrón de cambio concurrente (SLT-46 §4.7), `impactoZonaCentral`
  y su texto (ficha 376).
- Scripts `geo:equivalencia-dinero`, `geo:equivalencia-consultas`, `geo:explain-consultas` y la
  lectura congelada de `scripts/geo-equivalencia/` (SLT-44, SLT-65): no se tocan.
- Helper `tests/unit/db/_migraciones-aditivas.ts`, `scripts/generar-misma-empresa.ts`.

- [ ] **T0.1** Comprobar que la rama arranca en verde (`./init.sh`; si la base local no da, el check
  `gate-completo` de CI) y anotar el sha de partida en `progress/impl_SLT-89.md`.
  *Hecho:* verde anotado.
- [ ] **T0.2** *(solo si P2 se cierra «sí»)* Maqueta del selector de N niveles, del modal único de
  guardado de zona y del diálogo de miembros de grupo, aprobada por el humano; fecha y enlace en
  `progress/impl_SLT-89.md`. Bloquea T7.

## T1 — La base (depende de T0.1)

- [ ] **T1.1** Migración `20261109120000_slt89_zona_nodo` con su `down.sql` (§2.1, §2.2, §2.3, §2.5):
  tablas `zona_nodo` y `grupo_distritos_nodo`, índices, FK, RLS, grants, triggers de validación
  (país `SL021`, profundidad 3, duplicado entre las dos tablas de miembros), triggers de misma empresa
  generados con el script, y `CREATE OR REPLACE FUNCTION orden_nodo_geografico`. Antes del commit,
  comprobar que el timestamp no choca con `dev` ni con las ramas en vuelo. (R28, R29, R32, R34)
  *Hecho:* `pnpm run db:migrate` y `db:rollback` limpios en local; `prisma` sin drift.
- [ ] **T1.2** Migración `20261109120100_slt89_historial_zona_nodo` (solo el `ADD VALUE`) con
  `down.sql` comentado (§2.4). (R30, R32)
- [ ] **T1.3** `db/schema.prisma` (modelos `ZonaNodo` y `GrupoDistritosNodo`, relaciones inversas,
  valor de enum) y `lib/db/modelos-de-negocio.ts`. (R34)
  *Hecho:* guardias `organizacion-en-modelos`, `fk-misma-empresa`, `unicos-por-empresa` y
  `rls-por-empresa` verdes.
- [ ] **T1.4** [P] `tests/unit/db/slt89-migraciones-aditivas.test.ts` y
  `tests/integration/db/migracion-slt89-ida-y-vuelta.test.ts`. (R32, R33)
- [ ] **T1.5** [P] `tests/integration/db/orden-nodo-mas-profundo.test.ts`: nodo = lugar, ausente,
  descendiente de profundidad 4 (se conserva), ajeno (se pisa), y cambio de distrito que deja un
  nodo fuera de la rama. (R28, R29)
- [ ] **T1.6** [P] `tests/integration/db/zona-nodo-dos-empresas.test.ts` (parte de base): RLS de las
  dos tablas, misma empresa, `SL021`, profundidad 3 rechazada en `zona_nodo`, duplicado entre tablas
  de miembros rechazado. (R34)

## T2 — Dominio y lecturas (depende de T1)

- [ ] **T2.1** `geografia-dominio.ts`: `conAsignacionesDeZona` (asignaciones propuestas) y
  `grupoDelLugar` (miembro más cercano), puros, con casos en
  `tests/unit/services/geografia-dominio.test.ts`. (R14, R19)
- [ ] **T2.2** `CatalogoGeograficoRepository`: la consulta a `zona_nodo` en la misma foto (§4.1);
  `Pick` de los repositorios que construyen el cargador (`GeoRepository`, `OrdenRepository`,
  `CoberturaRepository`, `ZonaRepository`). (R6, R9)
  *Hecho:* `tests/integration/db/geo-lecturas-catalogo.test.ts` y las suites de SLT-44/65 sin cambiar
  aserciones.
- [ ] **T2.3** `tests/integration/db/zona-nodo-herencia.test.ts`: cantón y provincia asignados →
  v1, v2 (también lugar cantón), carga masiva, cotización, Excel de cobertura, `listArbol`,
  `listGeografiaLitePorZona`; excepción de distrito; marca heredada a profundidad 4 y cantón sin marca;
  regla de guardado de SLT-45 intacta. (R6, R7, R8, R9)
- [ ] **T2.4** [P] `GeoRepository.arbolDeZonas`, `GeografiaService.listarArbolDeZonas` (solo
  `maestro`), action `listarArbolDeZonas`, DTO en `lib/types/geografia-nodo.ts` (§4.2), con
  `tests/unit/services/geografia-service.test.ts` (rol → `forbidden` con doble que falla). (R24, R36)
- [ ] **T2.5** Resolver: `gruposDeDistritos` con la segunda consulta y la subida por el catálogo
  solo cuando hay miembros nuevos (§4.3); delegados de `ClienteCobros`/`ClientePagos`. (R19, R20)
  *Hecho:* suites existentes del resolver y de cierres sin cambiar aserciones.

## T3 — Guardado de zona (depende de T2)

- [ ] **T3.1** Esquemas `crearZonaSchema`/`actualizarZonaSchema` (`nodoIds`, `antes`, «al menos uno»
  en `distritoIds`), `ActualizarZonaResult` con `cambio_concurrente`, `ZonaDTO.nodosCount`; casos en
  `tests/unit/types/zona-schemas.test.ts`. (R5, R16)
- [ ] **T3.2** `ZonaRepository.create`/`update` con los pasos de §5.1 (candado, «antes», otra zona,
  existencia, escrituras por diferencia en las dos tablas, normalización de miembros, plan con todos
  los afectados, quinto lote de historial, `esViolacionNodoUnico`); `IZonaRepository`. (R1–R4, R10,
  R11, R16, R21, R30)
- [ ] **T3.3** `ZonaService`: traducción de los desenlaces nuevos (`nodoIds`, `cambio_concurrente`),
  rol; `IZonaService`; casos en `tests/unit/services/zona-service.test.ts`. (R2, R36)
- [ ] **T3.4** [P] `tests/integration/db/zona-nodo-asignacion.test.ts`: crear/guardar con cantón,
  provincia y profundidad 4; conflicto con otra zona y carrera por el índice; excepción en los dos
  órdenes; nodo inexistente o de otro país; retirados; vacío; cambio concurrente. (R1–R5, R16)
- [ ] **T3.5** [P] `tests/integration/db/zona-nodo-reconciliacion.test.ts`: órdenes bajo el cantón
  asignado se mueven; las de la excepción no; estante retenidas; cierre y gestión final fuera; un
  lote; misma respuesta. (R10, R11)
- [ ] **T3.6** [P] `tests/integration/db/zona-nodo-rastro.test.ts`: `zona_nodo_cambiado` por nodo con
  su texto, lote propio; distritos con `zona_distrito_cambiado` como SLT-76; crear sin filas. (R30)

## T4 — Impacto (depende de T3.2)

- [ ] **T4.1** `contarPlan` común a `planificarReconciliacion` y al impacto; `impactoDeAsignacion` en
  una transacción de solo lectura (§5.3); `ZonaService.impactoAsignacion`; action
  `impactoAsignacionZona` (zod, tope de ids). (R13–R15, R36)
- [ ] **T4.2** `tests/integration/db/zona-nodo-impacto.test.ts`: cifras por categoría; aviso =
  guardado (`ordenesReconciliadas`, retenidas); ninguna escritura (conteo de filas antes/después);
  «cambian de tarifa» con y sin activación, incluido el miembro que pierde su grupo. (R13–R15)

## T5 — Grupos sobre el nodo (depende de T2.5 y T3.2)

- [ ] **T5.1** Esquemas de grupo (`nodoIds`, `antes`), `CambiarGrupoResult` con
  `cambio_concurrente`, `GrupoDistritosDTO.nodos` en `lib/types/tarifa-flexible.ts`. (R17, R22)
- [ ] **T5.2** `GrupoDistritosRepository` (`nodosCubiertos`, `distritosEnOtroGrupo` sobre las dos
  tablas, reparto por tabla, candado y «antes», historial con el recuento de las dos) y
  `GrupoDistritosService` (cobertura, rol); interfaces; `lib/actions/tarifas.ts`. (R17, R18, R22, R31,
  R37)
- [ ] **T5.3** `TarifasPantallaRepository.distritosDeZona` desde el catálogo y `nodosDeZona` nuevo;
  `TarifasPantallaService.cargarZona` con `nodos`; interfaces. (R23, R38)
- [ ] **T5.4** `tests/integration/db/grupo-nodo.test.ts`: miembro cantón y distrito heredado;
  precedencia distrito > cantón > provincia en cobro y pago (zona del mensajero); orden sin distrito
  sin grupo; normalización al guardar zona (asignado ↔ heredado conserva grupo, sale de la zona lo
  saca con historial); fuera de cobertura y en otro grupo rechazados; cambio concurrente. (R17–R22,
  R31)
- [ ] **T5.5** [P] `tests/unit/services/grupo-distritos-service.test.ts` y
  `tests/unit/services/tarifas-pantalla-service.test.ts`: roles (`admin` lee, no escribe; otros
  `forbidden` con doble que falla). (R37)

## T6 — Aislamiento y equivalencia (depende de T3, T4, T5)

- [ ] **T6.1** Completar `tests/integration/db/zona-nodo-dos-empresas.test.ts`: el mismo cantón en
  zonas de dos empresas; cobertura, impacto, grupo y precio de cada una sin ver a la otra. (R35)
- [ ] **T6.2** `tests/integration/db/slt89-equivalencia-cr.test.ts` contra la lectura congelada de
  `scripts/geo-equivalencia/` (§9). (R38)
- [ ] **T6.3** Dejar en `progress/impl_SLT-89.md` el guion para la persona que corre los tres scripts
  de R39 sobre la copia (ningún agente lo ejecuta). (R39)

## T7 — Pantallas (depende de T2.4, T3.1, T4.1, T5.1; y de T0.2 si P2 = sí)

- [ ] **T7.1** `GeografiaSelector` de N niveles (§8.1) y búsqueda N niveles en
  `_shared/filtrar-arbol-geografico.ts`; `tests/unit/components/geografia-selector-n-niveles.test.tsx`
  (herencia nombrada, excepciones, bloqueo de otra zona, deshabilitado bajo ancestro marcado, marcar
  quita descendientes propios, preselección con retirados, búsqueda a cualquier profundidad, etiquetas
  del tipo). Se adaptan `geografia-selector-zona-ocupada.test.tsx` y `geografia-selector-inactivos.test.tsx`
  a la nueva entrada. (R24–R27)
- [ ] **T7.2** `CrearZonaForm` con el modal único (§8.2), `ZonasModule` y `page.tsx` con
  `listarArbolDeZonas`; `tests/components/ZonaGuardadoConfirmacion.test.tsx` (antes → después,
  cifras, «Confirmar» bloqueado hasta tenerlas, cancelar no llama, `antes` siempre enviado,
  `cambio_concurrente` avisa y refresca). Los tests de componente de zonas que montan el formulario se
  adaptan a la nueva entrada sin cambiar lo que afirman. (R12, R13, R16)
- [ ] **T7.3** `TarifasGrupos` con árbol de miembros y modal (§8.3); casos en
  `tests/components/TarifasGrupos.test.tsx`. (R22, R23)

## T8 — E2E (depende de T7)

- [ ] **T8.1** `e2e/zonas-nodo-canton.spec.ts`: maestro asigna un cantón, ve el aviso con cifras,
  confirma; una orden en un distrito de ese cantón sale con esa zona y el precio de su tarifa; una
  segunda empresa no ve la zona ni tiene cobertura en ese cantón. Correr también
  `e2e/dos-empresas-humo.spec.ts`. (R35, R41)

## T9 — Cierre

- [ ] **T9.1** `docs/architecture.md` (Multi-empresa > Geografía jerárquica y Tarifas flexibles): la
  tabla hermana, la regla de miembros y el trigger de `orden`; `lib/types/historial-accion.ts` y
  `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` con el tipo nuevo.
- [ ] **T9.2** `./init.sh` verde; mapa `R<n> → test` (R1–R42) en `progress/impl_SLT-89.md`; revisión
  del diff contra R42 (sin cambios en filtros/exportes, FK viejas, regla de guardado, modelo viejo).

## Archivos esperados

Base de datos:
- `db/schema.prisma`
- `db/migrations/20261109120000_slt89_zona_nodo/migration.sql`
- `db/migrations/20261109120000_slt89_zona_nodo/down.sql`
- `db/migrations/20261109120100_slt89_historial_zona_nodo/migration.sql`
- `db/migrations/20261109120100_slt89_historial_zona_nodo/down.sql`

Código:
- `lib/db/modelos-de-negocio.ts`
- `lib/services/geografia-dominio.ts`
- `lib/repositories/CatalogoGeograficoRepository.ts`
- `lib/repositories/ZonaRepository.ts`
- `lib/interfaces/repositories/IZonaRepository.ts`
- `lib/services/ZonaService.ts`
- `lib/interfaces/services/IZonaService.ts`
- `lib/types/zona.ts`
- `lib/actions/zonas.ts`
- `lib/repositories/GeoRepository.ts`
- `lib/interfaces/repositories/IGeoRepository.ts`
- `lib/services/GeografiaService.ts`
- `lib/interfaces/services/IGeografiaService.ts`
- `lib/actions/geografia.ts`
- `lib/types/geografia-nodo.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/repositories/CoberturaRepository.ts`
- `lib/repositories/_shared/resolver-tarifas.ts`
- `lib/repositories/GrupoDistritosRepository.ts`
- `lib/interfaces/repositories/IGrupoDistritosRepository.ts`
- `lib/services/GrupoDistritosService.ts`
- `lib/interfaces/services/IGrupoDistritosService.ts`
- `lib/types/tarifa-flexible.ts`
- `lib/actions/tarifas.ts`
- `lib/repositories/TarifasPantallaRepository.ts`
- `lib/interfaces/repositories/ITarifasPantallaRepository.ts`
- `lib/services/TarifasPantallaService.ts`
- `lib/interfaces/services/ITarifasPantallaService.ts`
- `lib/types/historial-accion.ts`
- `app/(app)/configuracion/zonas/page.tsx`
- `app/(app)/configuracion/zonas/_components/ZonasModule.tsx`
- `app/(app)/configuracion/zonas/_components/CrearZonaForm.tsx`
- `app/(app)/configuracion/zonas/_components/GeografiaSelector.tsx`
- `app/(app)/configuracion/_shared/filtrar-arbol-geografico.ts`
- `app/(app)/configuracion/tarifas/_components/TarifasGrupos.tsx`
- `docs/architecture.md`

Tests:
- `tests/unit/db/slt89-migraciones-aditivas.test.ts`
- `tests/unit/services/geografia-dominio.test.ts`
- `tests/unit/services/geografia-service.test.ts`
- `tests/unit/services/zona-service.test.ts`
- `tests/unit/services/grupo-distritos-service.test.ts`
- `tests/unit/services/tarifas-pantalla-service.test.ts`
- `tests/unit/types/zona-schemas.test.ts`
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`
- `tests/unit/components/geografia-selector-n-niveles.test.tsx`
- `tests/unit/components/geografia-selector-zona-ocupada.test.tsx`
- `tests/unit/components/geografia-selector-inactivos.test.tsx`
- `tests/components/ZonaGuardadoConfirmacion.test.tsx`
- `tests/components/ZonaCentralConfirmacion.test.tsx`
- `tests/components/TarifasGrupos.test.tsx`
- `tests/components/CrearZonaFormReconciliacion.test.tsx`
- `tests/components/ZonaBorradoMotivo.test.tsx`
- `tests/components/ZonaDistritoEnOtraZona.test.tsx`
- `tests/components/ZonaDistritoEspecial.test.tsx`
- `tests/components/ZonaFormSinCostos.test.tsx`
- `tests/components/ZonaNombreNoImprimible.test.tsx`
- `tests/components/ZonasModuleListado.test.tsx`
- `tests/components/ZonasTarifasEditarDistritos.test.tsx`
- `tests/unit/app/zonas/ZonasPage.test.tsx`
- `tests/integration/db/migracion-slt89-ida-y-vuelta.test.ts`
- `tests/integration/db/orden-nodo-mas-profundo.test.ts`
- `tests/integration/db/zona-nodo-asignacion.test.ts`
- `tests/integration/db/zona-nodo-herencia.test.ts`
- `tests/integration/db/zona-nodo-reconciliacion.test.ts`
- `tests/integration/db/zona-nodo-impacto.test.ts`
- `tests/integration/db/zona-nodo-rastro.test.ts`
- `tests/integration/db/zona-nodo-dos-empresas.test.ts`
- `tests/integration/db/grupo-nodo.test.ts`
- `tests/integration/db/slt89-equivalencia-cr.test.ts`
- `e2e/zonas-nodo-canton.spec.ts`

Estado:
- `progress/impl_SLT-89.md`
- `progress/features/SLT-89.md`
