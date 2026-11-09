# SLT-46 — geo-jerarquica-admin · tasks.md

> Orden de trabajo. `[P]` = paralelizable con las otras `[P]` de su bloque una vez cumplidas sus
> dependencias. Cada task cierra con `pnpm run typecheck`, `pnpm run lint` y
> `pnpm exec vitest related --run <archivos tocados>` en verde, y un commit propio
> (`feat(SLT-46): …` / `test(SLT-46): …`). Referencias a `design.md` como §n.
>
> P1–P10 están cerradas (2026-11-06, `requirements.md > Decisiones cerradas`). El 2026-11-09 el humano
> aprobó la maqueta T0.2 y cerró «reordenar niveles arrastrando», «confirmación antes de escribir» y
> el título del alta: de ahí R53–R62 y las tasks T3.3, T3.4, T4.5, T4.6, T6.4 y T6.5 (y el ajuste de
> T6.1–T6.3). P11–P13 siguen abiertas sin bloquear el backend.
>
> Regla de oro: **T2 (la base) va antes que cualquier escritura de la app.** El código nuevo escribe el
> nodo y confía en el trigger de copia; sin él, la geografía vieja se queda atrás.
>
> Segunda regla: **ninguna tarea de pantalla (T6) empieza sin la maqueta aprobada (T0.2).** El backend
> (T1–T5, T7, T8) no la espera.

## T0 — Lo heredado (no se re-crea)

Montado por SLT-43/44/45/65/71 en esta rama. Se usa tal cual; ninguna task lo vuelve a crear:

- Tablas `nodo_geografico` y `tipo_nivel_geografico`, su RLS, `REVOKE`, únicos, invariantes
  (`nodo_geografico_invariantes`) y el trigger `pais_tipos_de_nivel` (SLT-43).
- Sincronía vieja → nodo `geo_sincronizar_{provincia,canton,distrito}` (SLT-43, `…120300`): **no se
  toca** (§2.2).
- Trigger `orden_nodo_geografico` y columnas `nodo_geografico_id` de `orden`/zonas (SLT-43): no se tocan
  (R44).
- Enums `nodo_geografico_*` y entidad `nodo_geografico` del historial de plataforma (SLT-43).
- `appendAccionPlataforma`, `resolverActorCongelado`, `comoPlataforma`, `EXCEPCIONES_DE_PLATAFORMA`
  (SL-20).
- `CatalogoGeograficoRepository.dePais`, `geografia-dominio` (SLT-44); `OrdenRepository.contarSinEntregarPorNodoGeografico` (SLT-65).
- Regla «país aún no habilitado» y fixture de países de 2 y 4 niveles (SLT-45).
- Script `scripts/geo-backfill-nodo.ts` y `base-propia-43.ts` (SLT-43).

- [ ] **T0.1** Comprobar que la rama arranca en verde: `./init.sh` y, con base,
  `pnpm exec vitest run tests/integration/db/geo-sincronia-geografia.test.ts tests/integration/db/carga-division.test.ts`.
  *Hecho:* verde anotado en `progress/impl_SLT-46.md` con el sha de partida.
- [x] **T0.2** **Maqueta de la pantalla (P9, R52). La aprueba el humano.** Cubre el árbol de N niveles
  (con el tipo de cada nodo y «agregar hijo»), la lista ordenada de 2–10 tipos del alta de país, la
  edición de singular/plural de cada tipo y «agregar nivel» al final (sin quitar). Contrato funcional
  en `design.md §6`. Bloqueaba T6.
  *Hecho (2026-11-09):* **aprobada por el humano** («aprobado», `progress/features/SLT-46.md >
  Decisiones`, 2026-11-09): lienzo https://claude.ai/artifact/QFq31uvvXmLXF4AGt9PFfH, versión 7, con
  reordenar arrastrando por ⠿, título «Niveles N (máximo 10)» y modal de confirmación antes → después.
  Falta copiar esa línea (fecha, enlace, versión y quién la hizo) a `progress/impl_SLT-46.md` antes del
  primer commit de T6, como pide R52; lo hace el implementer o el leader, no el spec.

## T1 — Tipos y utilidades puras (depende de T0.1)

- [x] **T1.1** [P] `validarCodigoDeTipo` en `lib/utils/codigo-geografico.ts` (§4.5). La tabla de casos
  de CR de `tests/unit/utils/codigo-geografico.test.ts` se corre también contra la función nueva. (R17)
  *Hecho:* mismos resultados para CR; tipo sin dígitos acepta 1–20 sin espacios.
- [x] **T1.2** [P] Esquemas y DTO de §4.1 y §4.6 en `lib/types/geografia-nodo.ts` y `lib/types/pais.ts`
  (`crearPaisSchema` con 2–10 tipos, `renombrarTipoNivelSchema`, `agregarNivelPaisSchema`). (R22, R24,
  R49)
  *Hecho:* `tests/unit/types/geografia-nodo.test.ts` y un test de los esquemas de país cubren `padreId`
  rechazado en renombre/estado, 2 y 10 tipos aceptados, 1 y 11 rechazados, nombres fuera de 2–40 en el
  alta y en agregar nivel.
- [x] **T1.3** `lib/types/division-csv.ts` y `planificarDivision` a P profundidades, con cabeceras
  neutras `nivel_<k>`/`codigo_nivel_<k>` (§5). (R30, R32, R34)
  *Hecho:* `tests/unit/utils/division-csv.test.ts`: los casos de SL-20 con P = 3 dan lo mismo
  (traducción 1/2/3 ↔ provincia/canton/distrito); P = 2 y P = 4; hueco → error de línea; columnas de
  más → aviso.
- [x] **T1.4** [P] Respaldo del nivel 3 vacío en `etiquetasDePais` (`lib/types/pais.ts`, §2.4), con
  JSDoc de la convención `''`. Con el nivel 3 vacío devuelve la etiqueta del nivel 2 (**P10**). (R51)
  *Hecho:* `tests/unit/types/pais-etiquetas.test.ts`: nivel 3 vacío → etiqueta del nivel 2; con nombre → el nombre.

## T2 — Base de datos (depende de T0.1; va antes de T3)

- [x] **T2.1** Migración `20261106120000_slt46_historial_tipos_de_nivel` con su `down.sql` (§2.3, §3) y
  los tres valores en `db/schema.prisma`.
  *Hecho:* `prisma migrate diff` vacío; `prisma generate` ve los valores.
- [x] **T2.2** Migración `20261106120100_slt46_nodo_copia_a_geografia_vieja` con su `down.sql` (§2.2),
  y `SLT46` en `lib/db/sqlstate.ts`.
  *Hecho:* `tests/integration/db/slt46-nodo-copia-vieja.test.ts` verde. (R2–R7, R44)
- [x] **T2.3** [P] Extraer `faltasR19` a `tests/unit/db/_migraciones-aditivas.ts` (sin cambiar las
  aserciones de `slt43-migraciones-aditivas.test.ts`) y escribir
  `tests/unit/db/slt46-migraciones-aditivas.test.ts` con la regla del cuerpo de función, la de
  `CREATE OR REPLACE FUNCTION` solo para `pais_tipos_de_nivel`, y contraprueba. (R8, R10)
  *Hecho:* verde sobre las tres carpetas; rojo con DML suelto sobre tabla existente, con
  `EXECUTE 'DROP'` y con `CREATE OR REPLACE FUNCTION` de otra función.
- [x] **T2.5** Migración `20261106120200_slt46_pais_tipos_de_nivel_opcional` con su `down.sql` (§2.4,
  §3): `CREATE OR REPLACE FUNCTION pais_tipos_de_nivel()` sin `nivel_3` cuando `nivel_3_singular = ''`;
  el `down.sql` restaura literal el cuerpo de SLT-43. (R46, R47)
  *Hecho:* `tests/integration/db/slt46-pais-tipos-de-nivel.test.ts` verde: CR y un país de 3 tipos
  quedan igual que con la función de SLT-43 tras la misma escritura; un `pais` con `''` en el nivel 3
  queda con 2 tipos tras `INSERT` y tras `UPDATE`.
- [x] **T2.4** `tests/integration/db/migracion-slt46-ida-y-vuelta.test.ts` (base propia `slt46_`), sobre
  las tres migraciones (depende de T2.5). (R9)
  *Hecho:* ida, vuelta y reaplicación verdes; tras la vuelta la sincronía vieja → nodo sigue y
  `pg_get_functiondef('pais_tipos_de_nivel')` es el de SLT-43.

## T3 — Repositorios (depende de T1, T2)

- [x] **T3.1** `GeoRepository` e `IGeoRepository` a §4.4: `arbolDePais`, `contextoDeAlta`, `crear`,
  `hermanosDeNodo`, `renombrar`, `cambiarActivacion`, `profundidadDeNodo`, `leerDivisionDePais`,
  `importarDivision`, todos sobre `nodo_geografico`; historial de §7 con entidad `nodo_geografico` a
  cualquier profundidad.
  Sin `provincia`/`canton`/`distrito` en las escrituras. (R1, R14, R16, R18, R19, R33, R35, R36)
  *Hecho:* `tests/unit/repositories/geo-repository.escrituras.test.ts` adaptado; integración de T5.
- [x] **T3.2** [P] `PaisRepository` e `IPaisRepository`: `crear` con 2–10 tipos (`''` en `nivel_3_*`
  si P = 2), `renombrarTipo` y `agregarNivel` (§2.4); historial `tipo_nivel_geografico_*` con una fila
  por nombre cambiado y `detalle.campo`, y `detalle.origen` en los creados (§7). Sin borrar tipos.
  (R23, R25, R26, R37, R46, R48, R49, R50)
  *Hecho:* `tests/integration/db/pais-alta-tipos.test.ts`, `pais-tipos-edicion.test.ts` y
  `pais-agregar-nivel.test.ts` verdes (2 → 3 con copia a `pais.nivel_3_*`; 4 → 5; tope 10; carrera →
  único; nodos intactos).
- [x] **T3.3** *(2026-11-09)* `PaisRepository` e `IPaisRepository`: `reordenarTipos(paisId, niveles,
  actor)` (§2.4 «Reordenar niveles») y el candado `FOR UPDATE` de la fila `pais` en `reordenarTipos`,
  `renombrarTipo` y `agregarNivel`; `renombrarTipo` gana `anterior` y `agregarNivel` gana
  `profundidad`, ambos con `cambio_concurrente` (§4.7). Sin migraciones ni valores de enum nuevos.
  Adapta la llamada de `PaisService` lo justo para que `typecheck` siga verde (el contrato del
  service es T4.5). (R46, R55, R56, R57, R61)
  *Hecho:* `tests/integration/db/pais-reordenar-tipos.test.ts` verde (nombres por profundidad; copia a
  `pais.nivel_1..3_*`; ids, claves, regla de código y nodos intactos; país de 2 sin `nivel_3`; historial
  con `origen: "reordenado"`; orden actual sin escribir; `no_existe`; `cambio_concurrente` sin escribir)
  y la parte de tipos de `tests/integration/db/geografia-cambio-concurrente.test.ts`;
  `pais-tipos-edicion.test.ts` y `pais-agregar-nivel.test.ts` siguen verdes con la entrada nueva
  (mismos resultados).
- [x] **T3.4** [P] *(2026-11-09)* `GeoRepository.renombrar(id, nombre, nombreAnterior, actorId)` con
  `cambio_concurrente` por comparar y escribir en una sentencia (§4.4, §4.7); adapta la llamada de
  `GeografiaService` lo justo para `typecheck`. (R18, R61)
  *Hecho:* la parte de nodos de `geografia-cambio-concurrente.test.ts` verde («antes» viejo →
  sin escribir ni historial; valor ya pedido → `sin_cambio`); `geo-repository.escrituras.test.ts` y
  `geografia-renombrado.test.ts` verdes con la entrada nueva.

## T4 — Services y actions (depende de T3)

- [x] **T4.1** `GeografiaService` e `IGeografiaService` (§4.3), con el rol antes de todo. (R14–R20, R39)
  *Hecho:* `tests/unit/services/geografia-service.test.ts`: casos de SL-20 con nodos de CR (mismos
  desenlaces y mensajes, R12), profundidad 4, sin tipo, conteo 4 → 0, `maestro` → `forbidden` con doble
  que falla si se le llama.
- [x] **T4.2** [P] `CargaDivisionService` e `ICargaDivisionService` (§4.3, §5). (R30–R34, R39)
  *Hecho:* `tests/unit/services/carga-division-service.test.ts` con P = 3 y P = 4 y `forbidden`.
- [x] **T4.3** [P] `PaisService` e `IPaisService`: `crear` con tipos, `renombrarTipo` y `agregarNivel`;
  `cambiarDisponible` sin mirar niveles. (R23–R26, R28, R39, R48, R49)
  *Hecho:* `tests/unit/services/pais-service.test.ts` verde (incluye `tope` → `validation_error`,
  `no_existe` → `not_found`, `maestro` → `forbidden`).
- [x] **T4.4** `lib/actions/geografia-plataforma.ts`: esquemas nuevos, `renombrarTipoNivelAction` y
  `agregarNivelPaisAction`. (R5, R22, R39, R40, R49, R50)
  *Hecho:* `tests/unit/actions/geografia-plataforma-action.test.ts` y
  `geografia-plataforma.composition-root.test.ts` verdes (incluida la lista de exports sin action de
  mover ni de quitar nivel; único → `conflict` en agregar nivel).
- [x] **T4.5** *(2026-11-09; depende de T3.3, T3.4)* Esquemas de §4.1: `nombreAnterior` en
  `renombrarNodoGeograficoSchema`, `anterior` en `renombrarTipoNivelSchema`, `profundidad` en
  `agregarNivelPaisSchema` y `reordenarTiposSchema` nuevo; `PaisService.reordenarTipos` /
  `IPaisService`; variante `{ status: "conflict"; motivo: "cambio_concurrente" }` en los resultados de
  `GeografiaService.renombrar`, `PaisService.renombrarTipo`, `agregarNivel` y `reordenarTipos`, con el
  rol antes de todo. (R39, R55, R57, R60, R61)
  *Hecho:* `tests/unit/types/pais-schemas.test.ts` y `tests/unit/types/geografia-nodo.test.ts` (campos
  obligatorios nuevos; repetidos, 1 y 11 niveles rechazados); `pais-service.test.ts` y
  `geografia-service.test.ts` (desenlaces nuevos; los `conflict` de antes sin `motivo`; `maestro` →
  `forbidden` en `reordenarTipos` con doble que falla si se le llama).
- [x] **T4.6** *(2026-11-09; depende de T4.5)* `reordenarTiposAction` en
  `lib/actions/geografia-plataforma.ts` y paso del «antes» en las actions existentes. (R39, R57, R60,
  R61)
  *Hecho:* `geografia-plataforma-action.test.ts` (entrada inválida en cada action de escritura →
  `validation_error` sin escribir; `cambio_concurrente` → `conflict` con motivo; la lista de exports gana
  `reordenarTiposAction` y sigue sin mover ni quitar nivel) y
  `geografia-plataforma.composition-root.test.ts` verdes.

## T5 — Integración y equivalencia (depende de T4)

- [x] **T5.1** `tests/integration/db/geografia-admin-n-niveles.test.ts` (país de 4 niveles por el
  service). (R14–R19)
- [x] **T5.2** [P] `tests/integration/db/slt46-equivalencia-geografia.test.ts` (secuencia completa por el
  service en CR de prueba y en el de 4 niveles; comparación fila a fila). (R11, R12)
- [x] **T5.3** [P] `tests/integration/db/carga-division.test.ts` adaptado a la forma nueva sin cambiar
  resultados, retirando solo el caso «decision 4: dos homónimos normalizados» (P6: SL-20 R49 superado
  por SLT-46), con un comentario en su lugar que cita P6; y `carga-division-n-niveles.test.ts` (país
  de 4 niveles y uno de 2). (R31, R33)
- [x] **T5.4** [P] Ampliar `geografia-registro-accion.test.ts`, `geografia-superadmin-sin-empresa.test.ts`
  y `pais-disponible.test.ts`. (R28, R35, R36, R38, R40)
- [x] **T5.5** Pasar las suites existentes `tests/integration/db/geografia-*.test.ts`,
  `geo-sincronia-geografia.test.ts`, `geo-nodo-rls.test.ts`, `orden-nodo-escritura.test.ts` y
  `tests/integration/api/v2-paises-de-prueba.route.test.ts`; solo cambia la forma de la entrada
  (`{id}`), nunca un resultado. (R12, R29, R41, R44)
  *Hecho de T5:* todo verde con `HAY_BASE_DE_DATOS`; cada cambio de test existente listado en
  `progress/impl_SLT-46.md` con su motivo.

## T6 — Pantalla (depende de **T0.2, maqueta aprobada**, de T4 y de T4.6)

Maqueta aprobada el 2026-11-09 (T0.2). Ninguna de estas tareas empieza sin esa aprobación copiada en
`progress/impl_SLT-46.md` (R52). Lo implementado sigue la maqueta (lienzo
https://claude.ai/artifact/QFq31uvvXmLXF4AGt9PFfH, versión 7); si algo de la maqueta choca con
`design.md §6`, se para y se pregunta. T6.4 y T6.5 van antes que T6.1–T6.3, que los usan.

- [x] **T6.4** [P] *(2026-11-09)* `_components/ListaReordenable.tsx`: manija ⠿ como `button`,
  arrastre nativo solo desde la manija, `ArrowUp`/`ArrowDown` con la manija enfocada, foco que se queda
  en la manija, región `aria-live`; sin flechas visibles; controlado, sin actions (§6). (R53)
  *Hecho:* `tests/components/lista-reordenable.test.tsx` verde.
- [x] **T6.5** [P] *(2026-11-09)* `_components/ConfirmarCambio.tsx` sobre `components/shared/Modal`:
  filas antes → después, `closeOnConfirm={false}`, aviso y `router.refresh()` ante
  `motivo: "cambio_concurrente"` (§4.7, §6). (R58, R59, R61)
  *Hecho:* `tests/components/confirmar-cambio.test.tsx` verde (pinta antes → después; cancelar no llama
  a la acción; confirmar la llama una vez; el motivo concurrente avisa y refresca).
- [x] **T6.1** `GeografiaAdminModule.tsx`: árbol recursivo, tipo por nodo, «Agregar <tipo>» solo con tipo
  siguiente, sin mover ni elegir tipo (§6); alta, renombre (con `nombreAnterior`), retiro y
  reactivación de nodo validan con el esquema y pasan por `ConfirmarCambio` (§6, tabla). (R14, R21,
  R22, R52, R58, R59, R61)
  *Hecho:* `tests/components/geografia-arbol-n-niveles.test.tsx` verde, con los casos de R58/R59 de
  esas cuatro acciones.
- [x] **T6.2** [P] `GeografiaPlataformaModule.tsx`: alta de país con lista de 2–10 tipos titulada
  «Niveles N (máximo 10)», reordenable con `ListaReordenable`, validada con `crearPaisSchema` y
  confirmada con `ConfirmarCambio`; equivalencia `nivel_k` del CSV para P niveles. (R23, R30, R52, R53,
  R54, R58, R59, R62)
  *Hecho:* `tests/components/GeografiaPlataformaAltaPais.test.tsx` adaptado (2 y 10 filas; título con
  N; sin añadir una 11.ª ni quitar por debajo de 2; orden de pantalla = orden enviado; dato inválido
  sin modal; confirmar llama a la action).
- [ ] **T6.3** [P] `_components/TiposDeNivelPais.tsx` (editar nombres, reordenar con
  `ListaReordenable` y guardar el orden con `reordenarTiposAction`, «Agregar nivel» al final con su
  `profundidad`, oculto con 10 tipos, sin quitar; cada escritura con `ConfirmarCambio` y su «antes») y
  su uso en la página. (R25–R27, R48, R50, R52, R53, R55, R58, R59, R61)
  *Hecho:* `tests/components/tipos-de-nivel-pais.test.tsx` (incluye reordenar sin guardar hasta
  confirmar y el aviso de cambio concurrente) y `tests/unit/components/geografia-plataforma-page.test.tsx`
  verdes.

## T7 — Guardias (depende de T3)

- [x] **T7.1** **Retirar** `tests/unit/guards/nodo-geografico-sin-escritor.guardia.test.ts` y crear
  `nodo-geografico-escritor-unico.guardia.test.ts` (solo `GeoRepository` escribe el nodo; solo
  `PaisRepository`, los tipos; con contraprueba). (R43)
  *Hecho:* verde; un `prisma.nodoGeografico.create` inventado en otro archivo de `lib/` sale rojo.
- [x] **T7.2** [P] `geografia-vieja-sin-escritor.guardia.test.ts` (R1) y ajustar
  `geografia-renombrado-punto-unico.guardia.test.ts` al nodo (R43).
- [x] **T7.3** [P] Ampliar `geografia-sin-borrado-fisico.guardia.test.ts` a `nodoGeografico`,
  `tipoNivelGeografico` y `DELETE FROM` SQL. (R42, R50)
  *Hecho de T7:* `pnpm run test:guardias` verde, con contraprueba en cada guardia nueva o ampliada.

## T8 — Script y ensayo (depende de T2)

- [x] **T8.1** Modo `--equivalencia-geografia` en `scripts/geo-backfill-nodo.ts`, solo lectura, sin
  tocar los modos de SLT-43, y
  `tests/integration/db/geo-equivalencia-geografia.test.ts`. (R13)
- [x] **T8.2** Dejar en `progress/impl_SLT-46.md` el guion del ensayo de §10 para la persona que lo corre
  (ningún agente lo ejecuta).

## T9 — Cierre

- [ ] **T9.1** `./init.sh` verde; mapa `R<n> → test` (R1–R62) en `progress/impl_SLT-46.md`; R45: sin
  archivos nuevos en `e2e/`; R52: aprobación de la maqueta anotada con fecha anterior al primer commit
  de T6.

## Archivos esperados

Base de datos:
- `db/schema.prisma`
- `db/migrations/20261106120000_slt46_historial_tipos_de_nivel/migration.sql`
- `db/migrations/20261106120000_slt46_historial_tipos_de_nivel/down.sql`
- `db/migrations/20261106120100_slt46_nodo_copia_a_geografia_vieja/migration.sql`
- `db/migrations/20261106120100_slt46_nodo_copia_a_geografia_vieja/down.sql`
- `db/migrations/20261106120200_slt46_pais_tipos_de_nivel_opcional/migration.sql`
- `db/migrations/20261106120200_slt46_pais_tipos_de_nivel_opcional/down.sql`

Código:
- `lib/db/sqlstate.ts`
- `lib/types/geografia-nodo.ts`
- `lib/types/pais.ts`
- `lib/types/division-csv.ts`
- `lib/utils/division-csv.ts`
- `lib/utils/codigo-geografico.ts`
- `lib/interfaces/repositories/IGeoRepository.ts`
- `lib/interfaces/repositories/IPaisRepository.ts`
- `lib/interfaces/services/IGeografiaService.ts`
- `lib/interfaces/services/ICargaDivisionService.ts`
- `lib/interfaces/services/IPaisService.ts`
- `lib/repositories/GeoRepository.ts`
- `lib/repositories/PaisRepository.ts`
- `lib/services/GeografiaService.ts`
- `lib/services/CargaDivisionService.ts`
- `lib/services/PaisService.ts`
- `lib/actions/geografia-plataforma.ts`
- `app/(app)/plataforma/geografia/page.tsx`
- `app/(app)/plataforma/geografia/_components/GeografiaAdminModule.tsx`
- `app/(app)/plataforma/geografia/_components/GeografiaPlataformaModule.tsx`
- `app/(app)/plataforma/geografia/_components/TiposDeNivelPais.tsx`
- `app/(app)/plataforma/geografia/_components/ListaReordenable.tsx`
- `app/(app)/plataforma/geografia/_components/ConfirmarCambio.tsx`
- `scripts/geo-backfill-nodo.ts`

Tests:
- `tests/unit/db/_migraciones-aditivas.ts`
- `tests/unit/db/slt43-migraciones-aditivas.test.ts`
- `tests/unit/db/slt46-migraciones-aditivas.test.ts`
- `tests/unit/guards/nodo-geografico-sin-escritor.guardia.test.ts`
- `tests/unit/guards/nodo-geografico-escritor-unico.guardia.test.ts`
- `tests/unit/guards/geografia-vieja-sin-escritor.guardia.test.ts`
- `tests/unit/guards/geografia-renombrado-punto-unico.guardia.test.ts`
- `tests/unit/guards/geografia-sin-borrado-fisico.guardia.test.ts`
- `tests/unit/utils/codigo-geografico.test.ts`
- `tests/unit/utils/division-csv.test.ts`
- `tests/unit/types/geografia-nodo.test.ts`
- `tests/unit/types/pais-etiquetas.test.ts`
- `tests/unit/types/pais-schemas.test.ts`
- `tests/unit/services/geografia-service.test.ts`
- `tests/unit/services/carga-division-service.test.ts`
- `tests/unit/services/pais-service.test.ts`
- `tests/unit/repositories/geo-repository.escrituras.test.ts`
- `tests/unit/actions/geografia-plataforma-action.test.ts`
- `tests/unit/actions/geografia-plataforma.composition-root.test.ts`
- `tests/unit/components/geografia-plataforma-page.test.tsx`
- `tests/components/GeografiaPlataformaAltaPais.test.tsx`
- `tests/components/geografia-arbol-n-niveles.test.tsx`
- `tests/components/tipos-de-nivel-pais.test.tsx`
- `tests/components/lista-reordenable.test.tsx`
- `tests/components/confirmar-cambio.test.tsx`
- `tests/components/etiquetas-geograficas.test.tsx`
- `tests/integration/db/slt46-nodo-copia-vieja.test.ts`
- `tests/integration/db/migracion-slt46-ida-y-vuelta.test.ts`
- `tests/integration/db/slt46-equivalencia-geografia.test.ts`
- `tests/integration/db/geo-equivalencia-geografia.test.ts`
- `tests/integration/db/geografia-admin-n-niveles.test.ts`
- `tests/integration/db/carga-division.test.ts`
- `tests/integration/db/carga-division-n-niveles.test.ts`
- `tests/integration/db/pais-alta-tipos.test.ts`
- `tests/integration/db/pais-tipos-edicion.test.ts`
- `tests/integration/db/pais-agregar-nivel.test.ts`
- `tests/integration/db/pais-reordenar-tipos.test.ts`
- `tests/integration/db/geografia-cambio-concurrente.test.ts`
- `tests/integration/db/slt46-pais-tipos-de-nivel.test.ts`
- `tests/integration/db/pais-disponible.test.ts`
- `tests/integration/db/geografia-registro-accion.test.ts`
- `tests/integration/db/geografia-superadmin-sin-empresa.test.ts`
- `tests/integration/db/geografia-alta.test.ts`
- `tests/integration/db/geografia-renombrado.test.ts`
- `tests/integration/db/geografia-dos-paises.test.ts`
- `tests/integration/db/geografia-cascada-reversible.test.ts`
- `tests/integration/db/geografia-unicidad.test.ts`
- `tests/integration/db/pais-repositorio.test.ts`

Estado:
- `progress/impl_SLT-46.md`
- `progress/features/SLT-46.md`
