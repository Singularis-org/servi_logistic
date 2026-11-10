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
> P1–P3 cerradas por el humano el 2026-11-09 (`requirements.md > Decisiones cerradas`). Tercera
> regla: **ninguna task de T7 empieza sin la maqueta aprobada (T0.2, R48)**; T1–T6 no la esperan.
>
> **Tamaño estimado del PR:** ~93 archivos (42 de código, base y docs; 50 de tests, de ellos 10 de
> componentes que solo se adaptan a la nueva entrada del formulario y 15 existentes que solo ganan el
> «antes» obligatorio, T3.7 y T5.6; 1 E2E) y ~8 100 líneas (≈3 000 de código y SQL, ≈5 100 de
> tests), sin `specs/` ni `progress/`. Revisado el 2026-11-09 por la decisión «"Antes" obligatorio»
> (+15 archivos, ~500 líneas). Pasa el máximo por defecto (40 archivos / 1 000
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

- [x] **T0.1** Comprobar que la rama arranca en verde (`./init.sh`; si la base local no da, el check
  `gate-completo` de CI) y anotar el sha de partida en `progress/impl_SLT-89.md`.
  *Hecho:* verde anotado.
- [ ] **T0.2** Maqueta de la parte visual, **bloqueante para T7.1, T7.2 y T7.3** (R48, decisión P2
  del 2026-11-09). La arma el leader en un lienzo y la aprueba el humano; el implementer no la hace.
  Cubre: el selector de N niveles (herencia, excepciones, bloqueos, búsqueda), el modal único de
  guardado de zona con el aviso de impacto y la marca central, y en Tarifas el árbol de miembros y el
  modal antes → después de las cuatro escrituras de grupos (crear, renombrar, cambiar miembros,
  borrar) con el aviso de cambio concurrente.
  *Hecho:* en `progress/impl_SLT-89.md`, la referencia al lienzo y la línea «Maqueta aprobada por el
  humano el AAAA-MM-DD», escritas antes del primer commit de T7. Sin esa línea, T7 no empieza; T1–T6
  siguen.

## T1 — La base (depende de T0.1)

- [x] **T1.1** Migración `20261110130000_slt89_zona_nodo` con su `down.sql` (§2.1, §2.2, §2.3, §2.5):
  tablas `zona_nodo` y `grupo_distritos_nodo`, índices, FK, RLS, grants, triggers de validación
  (país `SL021`, profundidad 3, duplicado entre las dos tablas de miembros), triggers de misma empresa
  generados con el script, y `CREATE OR REPLACE FUNCTION orden_nodo_geografico`. Antes del commit,
  comprobar que el timestamp no choca con `dev` ni con las ramas en vuelo. (R28, R29, R32, R34)
  *Hecho:* `pnpm run db:migrate` y `db:rollback` limpios en local; `prisma` sin drift.
  > Nota (2026-11-10): el timestamp chocaba con `20261109120000_cobro_plataforma_traza` de `dev`; la
  > migración vive en `db/migrations/20261110130000_slt89_zona_nodo/` (`progress/impl_SLT-89.md`).
- [x] **T1.2** Migración `20261110130100_slt89_historial_zona_nodo` (solo el `ADD VALUE`) con
  `down.sql` comentado (§2.4). (R30, R32)
  > Nota (2026-11-10): movida con T1.1 a `db/migrations/20261110130100_slt89_historial_zona_nodo/`.
- [x] **T1.3** `db/schema.prisma` (modelos `ZonaNodo` y `GrupoDistritosNodo`, relaciones inversas,
  valor de enum) y `lib/db/modelos-de-negocio.ts`. (R34)
  *Hecho:* guardias `organizacion-en-modelos`, `fk-misma-empresa`, `unicos-por-empresa` y
  `rls-por-empresa` verdes.
- [x] **T1.4** [P] `tests/unit/db/slt89-migraciones-aditivas.test.ts` y
  `tests/integration/db/migracion-slt89-ida-y-vuelta.test.ts`. (R32, R33)
- [x] **T1.5** [P] `tests/integration/db/orden-nodo-mas-profundo.test.ts`: nodo = lugar, ausente,
  descendiente de profundidad 4 (se conserva), ajeno (se pisa), y cambio de distrito que deja un
  nodo fuera de la rama. (R28, R29)
- [x] **T1.6** [P] `tests/integration/db/zona-nodo-dos-empresas.test.ts` (parte de base): RLS de las
  dos tablas, misma empresa, `SL021`, profundidad 3 rechazada en `zona_nodo`, duplicado entre tablas
  de miembros rechazado. (R34)

## T2 — Dominio y lecturas (depende de T1)

- [x] **T2.1** `geografia-dominio.ts`: `conAsignacionesDeZona` (asignaciones propuestas),
  `grupoDelLugar` (miembro más cercano) y `mismoConjunto` (comparación del «antes», design §5.4), puros, con casos en
  `tests/unit/services/geografia-dominio.test.ts`. (R14, R19)
- [x] **T2.2** `CatalogoGeograficoRepository`: la consulta a `zona_nodo` en la misma foto (§4.1);
  `Pick` de los repositorios que construyen el cargador (`GeoRepository`, `OrdenRepository`,
  `CoberturaRepository`, `ZonaRepository`). (R6, R9)
  *Hecho:* `tests/integration/db/geo-lecturas-catalogo.test.ts` y las suites de SLT-44/65 sin cambiar
  aserciones.
- [x] **T2.3** `tests/integration/db/zona-nodo-herencia.test.ts`: cantón y provincia asignados →
  v1, v2 (también lugar cantón), carga masiva, cotización, Excel de cobertura, `listArbol`,
  `listGeografiaLitePorZona`; excepción de distrito; marca heredada a profundidad 4 y cantón sin marca;
  regla de guardado de SLT-45 intacta. (R6, R7, R8, R9)
- [x] **T2.4** [P] `GeoRepository.arbolDeZonas`, `GeografiaService.listarArbolDeZonas` (solo
  `maestro`), action `listarArbolDeZonas`, DTO en `lib/types/geografia-nodo.ts` (§4.2), con
  `tests/unit/services/geografia-service.test.ts` (rol → `forbidden` con doble que falla). (R24, R36)
- [x] **T2.5** Resolver: `gruposDeDistritos` con la segunda consulta y la subida por el catálogo
  solo cuando hay miembros nuevos (§4.3); delegados de `ClienteCobros`/`ClientePagos`. (R19, R20)
  *Hecho:* suites existentes del resolver y de cierres sin cambiar aserciones.

## T3 — Guardado de zona (depende de T2)

- [ ] **T3.1** Esquemas `crearZonaSchema`/`actualizarZonaSchema` (`nodoIds`, `antes` **obligatorio**
  solo en `actualizarZonaSchema` —design §5.5—, «al menos uno» en `distritoIds`),
  `ActualizarZonaResult` con `cambio_concurrente`, `ZonaDTO.nodosCount`; casos en
  `tests/unit/types/zona-schemas.test.ts` (R5) y en `tests/unit/types/zona-schema.test.ts` (sin
  `antes` → error en `antes`; crear sin él → válido). (R5, R16, R46)
- [ ] **T3.2** `ZonaRepository.create`/`update` con los pasos de §5.1 (candado, «antes», otra zona,
  existencia, escrituras por diferencia en las dos tablas, normalización de miembros, plan con todos
  los afectados, quinto lote de historial, `esViolacionNodoUnico`); `IZonaRepository`. (R1–R4, R10,
  R11, R16, R21, R30)
- [ ] **T3.3** `ZonaService`: traducción de los desenlaces nuevos (`nodoIds`, `cambio_concurrente`),
  rol, y el rechazo de la falta de `antes` (`safeParse` después del rol, antes de llamar al
  repositorio; design §5.5); `IZonaService`; casos en `tests/unit/services/zona-service.test.ts`
  (sin `antes` → `validation_error` en `antes` y el doble de repositorio no se llama) y en
  `tests/integration/actions/zonas-action.test.ts` (sin `antes` → `validation_error`, base sin
  cambios). (R2, R16, R36)
- [ ] **T3.7** Adaptar al «antes» obligatorio los tests existentes que guardan una zona sin él
  (cambio de entrada AUTORIZADO por el humano el 2026-11-09; design §5.5). Va en el mismo commit que
  T3.1–T3.3: con el campo requerido, el typecheck no cierra sin esto. Cada llamada gana el «antes»
  que corresponde a lo sembrado (los distritos que la zona tiene en ese momento; `nodoIds: []`), sin
  tocar lo que afirma. Encontrados con grep de `actualizarZona(`, `.actualizar(` de `ZonaService` y
  `.update(` de `ZonaRepository`:
  - `tests/unit/types/zona-schema.test.ts` (parsea `actualizarZonaSchema`)
  - `tests/unit/services/zona-service.test.ts` (helper `crearInput` usado en `actualizar`; las
    aserciones sobre el doble `repo.update`, donde las haya, ganan `antes` en los datos: cambio de aserción autorizado)
  - `tests/unit/services/nombres-que-imprime-la-etiqueta.test.ts` (helper `actualizarZona`)
  - `tests/unit/repositories/zona-repository.test.ts` (`DATOS_ZONA_A`, `DATOS_BASE` y llamadas sueltas)
  - `tests/integration/actions/zonas-action.test.ts`
  - `tests/integration/db/zona-update-conserva-grupos.test.ts`
  - `tests/integration/db/zona-reconciliacion-ordenes.test.ts` (helper `datosDeZona`)
  - `tests/integration/db/zona-pago-mensajero-rastro.test.ts` (helper `datos`, incluido `repoRoto`)
  - `tests/integration/db/zona-guardado-conserva-inactivos.test.ts`
  - `tests/integration/db/zona-guardado-conserva-costos.test.ts` (repo, service y action)
  - `tests/integration/db/zona-especial-dos-empresas.test.ts` (solo las dos llamadas a `zonaRepo.update`)
  - `tests/integration/db/zona-distrito-unica.test.ts`
  - `tests/integration/db/zona-distrito-rastro.test.ts` (helper `e.datos`)
  - `tests/integration/db/zona-central-guarda-y-rastro.test.ts` (incluido `repoRoto`)
  - Los tests de componente del formulario de zona (T7.2) ya se adaptan allí.
  Ninguna fábrica (`tests/fabricas/`), fixture (`tests/integration/db/_fixtures/`), E2E ni script
  (`scripts/demo-qa/`) guarda una zona por estas vías: las coincidencias del grep en ellos son de
  otros `update`/`actualizar` (usuario, `DistritoZonaEspecialService`, `tx.zona.update`).
  *Hecho:* typecheck verde y esos archivos verdes con un diff que solo añade el «antes» a la entrada
  y a las aserciones de llamada sobre dobles (el reviewer lo comprueba contra R38).
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

- [ ] **T5.1** Esquemas de grupo en `lib/types/tarifa-flexible.ts` (§6): `nodoIds`; `antes`
  **obligatorio** en cambiar miembros; `nombreAnterior` **obligatorio** en renombrar; `antes: {
  nombre, distritoIds, nodoIds, valores }` **obligatorio** en borrar (design §5.5); crear sin «antes»;
  `GrupoDistritosDTO.nodos`. `CambiarGrupoResult` y `BorrarGrupoResult` con
  `conflict`/`cambio_concurrente` en `IGrupoDistritosService.ts`. (R17, R43–R46)
  *Hecho:* typecheck verde con los esquemas; los llamadores de hoy se adaptan en T5.6, que cierra en
  el mismo commit que T5.2b (cuando cambian las firmas de service y repositorio).
- [ ] **T5.2** `GrupoDistritosRepository` (`nodosCubiertos`, `distritosEnOtroGrupo` sobre las dos
  tablas, reparto por tabla, historial con el recuento de las dos) y `GrupoDistritosService`
  (cobertura, rol); interfaces; `lib/actions/tarifas.ts`. (R17, R18, R31, R37)
- [ ] **T5.2b** Cambio concurrente en las cuatro escrituras de grupos (§5.4): candado `FOR UPDATE`
  del grupo, `mismoConjunto`, comparación del «antes» en `renombrar`, `fijarDistritos` y `borrar`
  (después de `not_found`, antes de escribir), desenlace `cambio_concurrente` en repositorio y
  `conflict` en service; el «antes» pasa a ser parámetro **obligatorio** de repositorio y service
  (firmas de design §5.4) y el service rechaza su falta con `validation_error` antes de leer el grupo
  (orden de design §5.5); las actions `renombrarGrupoDistritos`, `cambiarDistritosDeGrupo` y
  `borrarGrupoDistritos` pasan el «antes» al service. Escribe `tests/integration/db/grupo-cambio-concurrente.test.ts`
  (los casos de design §10, fila R43–R46) y los casos nuevos de
  `tests/integration/actions/tarifas-action.test.ts` (incluido «sin antes → `validation_error`, base
  sin cambios»). Depende de T5.1 y T5.2. (R43–R46)
  *Hecho:* esos dos archivos y los casos nuevos de `grupo-distritos-service.test.ts` (T5.5) en verde,
  y los tests existentes de SLT-52/54 sobre grupos verdes con solo la adaptación de T5.6.
- [ ] **T5.3** `TarifasPantallaRepository.distritosDeZona` desde el catálogo y `nodosDeZona` nuevo;
  `TarifasPantallaService.cargarZona` con `nodos`; interfaces. (R23, R38)
- [ ] **T5.4** `tests/integration/db/grupo-nodo.test.ts`: miembro cantón y distrito heredado;
  precedencia distrito > cantón > provincia en cobro y pago (zona del mensajero); orden sin distrito
  sin grupo; normalización al guardar zona (asignado ↔ heredado conserva grupo, sale de la zona lo
  saca con historial); fuera de cobertura y en otro grupo rechazados. (R17–R21, R31)
- [ ] **T5.5** [P] `tests/unit/services/grupo-distritos-service.test.ts` y
  `tests/unit/services/tarifas-pantalla-service.test.ts`: roles en las cuatro escrituras y en la
  lectura (`admin` lee, no escribe; otros `forbidden` con doble que falla); `cambio_concurrente` →
  `conflict` con motivo; sin «antes» en renombrar, cambiar miembros y borrar → `validation_error` en
  su campo con doble que falla (también con grupo inexistente y con renombrar al nombre actual);
  crear sin «antes» → `ok`. (R37, R43–R46)
- [ ] **T5.6** Adaptar al «antes» obligatorio los tests existentes que renombran, cambian miembros
  o borran un grupo sin él (cambio de entrada y, donde se dice, de aserción, AUTORIZADO por el humano
  el 2026-11-09; design §5.5). Va en el mismo commit que T5.2b. Cada llamada gana el «antes» de lo
  sembrado (nombre actual, miembros actuales con `nodoIds: []`, número de valores del grupo).
  Encontrados con grep de `renombrarGrupoDistritos(`, `cambiarDistritosDeGrupo(`,
  `borrarGrupoDistritos(`, `.renombrarGrupo(`, `.fijarDistritos(`, `.borrarGrupo(` y de
  `GrupoDistritosRepository` `.renombrar(`/`.borrar(`:
  - `tests/unit/services/grupo-distritos-service.test.ts` (llamadas al service y `toHaveBeenCalledWith`
    sobre el doble de repositorio, que ganan el «antes»: cambio de aserción autorizado)
  - `tests/integration/actions/tarifas-action.test.ts` (llamadas a las actions y las aserciones
    `repo.renombrar/fijarDistritos/borrar).toHaveBeenCalledWith(…)` de las líneas ~273-277, que ganan
    el «antes» en su posición nueva: cambio de aserción autorizado)
  - `tests/integration/db/tarifa-activacion.test.ts` (`grupos().renombrar`, `grupos().borrar` del
    repositorio y la action `borrarGrupoDistritos({ id })`)
  - `tests/integration/db/tarifas-flexibles-escritura.test.ts` (`fijarDistritos`, `borrarGrupo`,
    `renombrarGrupo` del service, incluidos los de `roto` y los de `not_found`)
  - `tests/components/TarifasGrupos.test.tsx`: las aserciones
    `toHaveBeenCalledWith({ id: "g1", nombre: "Playa" })` y `toHaveBeenCalledWith({ id: "g1" })`
    ganan `nombreAnterior` y `antes` (cambio de aserción autorizado; se hace dentro de T7.3).
  `TarifasModulo.test.tsx` y `TarifasDisposicion.test.tsx` solo declaran `vi.fn()` de esas actions:
  no cambian. Ninguna fábrica, fixture, E2E ni script llama a esas escrituras.
  *Hecho:* typecheck verde y esos archivos verdes; el diff solo añade el «antes» a la entrada y a las
  aserciones de llamada nombradas arriba, nunca a lo que se afirma del resultado (R38).

## T6 — Aislamiento y equivalencia (depende de T3, T4, T5)

- [ ] **T6.1** Completar `tests/integration/db/zona-nodo-dos-empresas.test.ts`: el mismo cantón en
  zonas de dos empresas; cobertura, impacto, grupo y precio de cada una sin ver a la otra. (R35)
- [ ] **T6.2** `tests/integration/db/slt89-equivalencia-cr.test.ts` contra la lectura congelada de
  `scripts/geo-equivalencia/` (§9). (R38)
- [ ] **T6.3** Dejar en `progress/impl_SLT-89.md` el guion para la persona que corre los tres scripts
  de R39 sobre la copia (ningún agente lo ejecuta). (R39)

## T7 — Pantallas (depende de T0.2 —maqueta aprobada—, T2.4, T3.1, T4.1, T5.1 y T5.2b)

Cada task de este bloque sigue la maqueta aprobada en T0.2; si la maqueta pide algo que el spec no da,
se para y se pregunta (design §8.4). (R48)

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
- [ ] **T7.3** `TarifasGrupos` con árbol de miembros y el modal antes → después de las cuatro
  escrituras (§8.3): validación previa con los esquemas, «antes» enviado al confirmar, borrar dentro
  del mismo modal con el texto de SLT-54 R43, aviso `aria-live` y recarga ante `cambio_concurrente`;
  textos nuevos en `tarifas-textos.ts`. Casos en `tests/components/TarifasGrupos.test.tsx` (§10, filas
  R22 y R47); los casos de SLT-54 R42/R43 que ya hay se adaptan a llegar al botón por el modal sin
  cambiar lo que afirman. (R22, R23, R47)

## T8 — E2E (depende de T7)

- [ ] **T8.1** `e2e/zonas-nodo-canton.spec.ts`: maestro asigna un cantón, ve el aviso con cifras,
  confirma; una orden en un distrito de ese cantón sale con esa zona y el precio de su tarifa; una
  segunda empresa no ve la zona ni tiene cobertura en ese cantón. Correr también
  `e2e/dos-empresas-humo.spec.ts`. (R35, R41)

## T9 — Cierre

- [ ] **T9.1** `docs/architecture.md` (Multi-empresa > Geografía jerárquica y Tarifas flexibles): la
  tabla hermana, la regla de miembros y el trigger de `orden`; `lib/types/historial-accion.ts` y
  `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` con el tipo nuevo.
- [ ] **T9.2** `./init.sh` verde; mapa `R<n> → test` (R1–R48) en `progress/impl_SLT-89.md`; revisión
  del diff contra R42 (sin cambios en filtros/exportes, FK viejas, regla de guardado, modelo viejo,
  grupo de la orden sin distrito) y de R48 (aprobación de la maqueta anterior al primer commit de T7);
  revisión de que los archivos de T3.7 y T5.6 solo ganan el «antes» (R38).

## Archivos esperados

Base de datos:
- `db/schema.prisma`
- `db/migrations/20261110130000_slt89_zona_nodo/migration.sql`
- `db/migrations/20261110130000_slt89_zona_nodo/down.sql`
- `db/migrations/20261110130100_slt89_historial_zona_nodo/migration.sql`
- `db/migrations/20261110130100_slt89_historial_zona_nodo/down.sql`

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
- `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts`
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
- `tests/integration/db/grupo-cambio-concurrente.test.ts`
- `tests/integration/actions/tarifas-action.test.ts`
- `tests/integration/db/slt89-equivalencia-cr.test.ts`
- `e2e/zonas-nodo-canton.spec.ts`

Tests existentes que solo ganan el «antes» obligatorio (T3.7, T5.6; decisión del 2026-11-09):
- `tests/unit/types/zona-schema.test.ts`
- `tests/unit/repositories/zona-repository.test.ts`
- `tests/unit/services/nombres-que-imprime-la-etiqueta.test.ts`
- `tests/integration/actions/zonas-action.test.ts`
- `tests/integration/db/zona-update-conserva-grupos.test.ts`
- `tests/integration/db/zona-reconciliacion-ordenes.test.ts`
- `tests/integration/db/zona-pago-mensajero-rastro.test.ts`
- `tests/integration/db/zona-guardado-conserva-inactivos.test.ts`
- `tests/integration/db/zona-guardado-conserva-costos.test.ts`
- `tests/integration/db/zona-especial-dos-empresas.test.ts`
- `tests/integration/db/zona-distrito-unica.test.ts`
- `tests/integration/db/zona-distrito-rastro.test.ts`
- `tests/integration/db/zona-central-guarda-y-rastro.test.ts`
- `tests/integration/db/tarifa-activacion.test.ts`
- `tests/integration/db/tarifas-flexibles-escritura.test.ts`
(Los tests de servicio de zonas y de grupos, el de actions de tarifas y el de componente de
TarifasGrupos también se adaptan y ya están en la lista de arriba.)

Estado:
- `progress/impl_SLT-89.md`
- `progress/features/SLT-89.md`
