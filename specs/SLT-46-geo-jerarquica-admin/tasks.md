# SLT-46 — geo-jerarquica-admin · tasks.md

> Orden de trabajo. `[P]` = paralelizable con las otras `[P]` de su bloque una vez cumplidas sus
> dependencias. Cada task cierra con `pnpm run typecheck`, `pnpm run lint` y
> `pnpm exec vitest related --run <archivos tocados>` en verde, y un commit propio
> (`feat(SLT-46): …` / `test(SLT-46): …`). Referencias a `design.md` como §n.
>
> Las tareas marcadas «(P<n>)» siguen la propuesta de esa pregunta abierta; si el humano responde
> otra cosa en F1.4, se rehacen antes de empezar.
>
> Regla de oro: **T2 (la base) va antes que cualquier escritura de la app.** El código nuevo escribe el
> nodo y confía en el trigger de copia; sin él, la geografía vieja se queda atrás.

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
- [ ] **T0.2** Pasar el árbol de N niveles, la lista de tipos del alta y la edición de tipos por
  `/design` (P9). Bloquea T6.
  *Hecho:* decisiones de diseño anotadas en `progress/impl_SLT-46.md`.

## T1 — Tipos y utilidades puras (depende de T0.1)

- [ ] **T1.1** [P] `validarCodigoDeTipo` en `lib/utils/codigo-geografico.ts` (§4.5). La tabla de casos
  de CR de `tests/unit/utils/codigo-geografico.test.ts` se corre también contra la función nueva. (R17)
  *Hecho:* mismos resultados para CR; tipo sin dígitos acepta 1–20 sin espacios.
- [ ] **T1.2** [P] Esquemas y DTO de §4.1 y §4.6 en `lib/types/geografia-nodo.ts` y `lib/types/pais.ts`
  (`crearPaisSchema` con 3–10 tipos (P2), `renombrarTipoNivelSchema`). (R22, R24)
  *Hecho:* `tests/unit/types/geografia-nodo.test.ts` y un test de `crearPaisSchema` cubren `padreId`
  rechazado en renombre/estado, 2 y 11 tipos rechazados, nombres fuera de 2–40.
- [ ] **T1.3** `lib/types/division-csv.ts` y `planificarDivision` a P profundidades (§5) (P4). (R30, R32,
  R34)
  *Hecho:* `tests/unit/utils/division-csv.test.ts`: los casos de SL-20 con P = 3 dan lo mismo
  (traducción 1/2/3 ↔ provincia/canton/distrito); P = 4; hueco → error de línea; columnas de más →
  aviso.

## T2 — Base de datos (depende de T0.1; va antes de T3)

- [ ] **T2.1** Migración `20261106120000_slt46_historial_tipos_de_nivel` con su `down.sql` (§2.3, §3) y
  los tres valores en `db/schema.prisma`.
  *Hecho:* `prisma migrate diff` vacío; `prisma generate` ve los valores.
- [ ] **T2.2** Migración `20261106120100_slt46_nodo_copia_a_geografia_vieja` con su `down.sql` (§2.2),
  y `SLT46` en `lib/db/sqlstate.ts`.
  *Hecho:* `tests/integration/db/slt46-nodo-copia-vieja.test.ts` verde. (R2–R7, R44)
- [ ] **T2.3** [P] Extraer `faltasR19` a `tests/unit/db/_migraciones-aditivas.ts` (sin cambiar las
  aserciones de `slt43-migraciones-aditivas.test.ts`) y escribir
  `tests/unit/db/slt46-migraciones-aditivas.test.ts` con la regla del cuerpo de función y contraprueba.
  (R8, R10)
  *Hecho:* verde sobre las dos carpetas; rojo con DML suelto sobre tabla existente y con `EXECUTE 'DROP'`.
- [ ] **T2.4** `tests/integration/db/migracion-slt46-ida-y-vuelta.test.ts` (base propia `slt46_`). (R9)
  *Hecho:* ida, vuelta y reaplicación verdes; tras la vuelta la sincronía vieja → nodo sigue.

## T3 — Repositorios (depende de T1, T2)

- [ ] **T3.1** `GeoRepository` e `IGeoRepository` a §4.4: `arbolDePais`, `contextoDeAlta`, `crear`,
  `hermanosDeNodo`, `renombrar`, `cambiarActivacion`, `profundidadDeNodo`, `leerDivisionDePais`,
  `importarDivision`, todos sobre `nodo_geografico`; historial de §7 con entidad `nodo_geografico` (P5).
  Sin `provincia`/`canton`/`distrito` en las escrituras. (R1, R14, R16, R18, R19, R33, R35, R36)
  *Hecho:* `tests/unit/repositories/geo-repository.escrituras.test.ts` adaptado; integración de T5.
- [ ] **T3.2** [P] `PaisRepository` e `IPaisRepository`: `crear` con tipos, `renombrarTipo` (§2.4),
  historial `tipo_nivel_geografico_*` (P7). (R23, R25, R26, R37)
  *Hecho:* `tests/integration/db/pais-alta-tipos.test.ts` y `pais-tipos-edicion.test.ts` verdes.

## T4 — Services y actions (depende de T3)

- [ ] **T4.1** `GeografiaService` e `IGeografiaService` (§4.3), con el rol antes de todo. (R14–R20, R39)
  *Hecho:* `tests/unit/services/geografia-service.test.ts`: casos de SL-20 con nodos de CR (mismos
  desenlaces y mensajes, R12), profundidad 4, sin tipo, conteo 4 → 0, `maestro` → `forbidden` con doble
  que falla si se le llama.
- [ ] **T4.2** [P] `CargaDivisionService` e `ICargaDivisionService` (§4.3, §5). (R30–R34, R39)
  *Hecho:* `tests/unit/services/carga-division-service.test.ts` con P = 3 y P = 4 y `forbidden`.
- [ ] **T4.3** [P] `PaisService` e `IPaisService`: `crear` con tipos y `renombrarTipo`; `cambiarDisponible`
  sin mirar niveles. (R23–R26, R28, R39)
  *Hecho:* `tests/unit/services/pais-service.test.ts` verde.
- [ ] **T4.4** `lib/actions/geografia-plataforma.ts`: esquemas nuevos y `renombrarTipoNivelAction`. (R5,
  R22, R39, R40)
  *Hecho:* `tests/unit/actions/geografia-plataforma-action.test.ts` y
  `geografia-plataforma.composition-root.test.ts` verdes (incluida la lista de exports sin action de
  mover).

## T5 — Integración y equivalencia (depende de T4)

- [ ] **T5.1** `tests/integration/db/geografia-admin-n-niveles.test.ts` (país de 4 niveles por el
  service). (R14–R19)
- [ ] **T5.2** [P] `tests/integration/db/slt46-equivalencia-geografia.test.ts` (secuencia completa por el
  service en CR de prueba y en el de 4 niveles; comparación fila a fila). (R11, R12)
- [ ] **T5.3** [P] `tests/integration/db/carga-division.test.ts` adaptado a la forma nueva sin cambiar
  resultados, retirando solo el caso de homónimos en base si el humano aprueba P6; y
  `carga-division-n-niveles.test.ts`. (R31, R33)
- [ ] **T5.4** [P] Ampliar `geografia-registro-accion.test.ts`, `geografia-superadmin-sin-empresa.test.ts`
  y `pais-disponible.test.ts`. (R28, R35, R36, R38, R40)
- [ ] **T5.5** Pasar las suites existentes `tests/integration/db/geografia-*.test.ts`,
  `geo-sincronia-geografia.test.ts`, `geo-nodo-rls.test.ts`, `orden-nodo-escritura.test.ts` y
  `tests/integration/api/v2-paises-de-prueba.route.test.ts`; solo cambia la forma de la entrada
  (`{id}`), nunca un resultado. (R12, R29, R41, R44)
  *Hecho de T5:* todo verde con `HAY_BASE_DE_DATOS`; cada cambio de test existente listado en
  `progress/impl_SLT-46.md` con su motivo.

## T6 — Pantalla (depende de T0.2, T4)

- [ ] **T6.1** `GeografiaAdminModule.tsx`: árbol recursivo, tipo por nodo, «Agregar <tipo>» solo con tipo
  siguiente, sin mover (§6). (R21, R22)
  *Hecho:* `tests/components/geografia-arbol-n-niveles.test.tsx` verde.
- [ ] **T6.2** [P] `GeografiaPlataformaModule.tsx`: alta de país con lista de tipos; equivalencia
  `nivel_k` del CSV para P niveles. (R23, R30)
  *Hecho:* `tests/components/GeografiaPlataformaAltaPais.test.tsx` adaptado.
- [ ] **T6.3** [P] `_components/TiposDeNivelPais.tsx` y su uso en la página. (R25–R27)
  *Hecho:* `tests/components/tipos-de-nivel-pais.test.tsx` y `tests/unit/components/geografia-plataforma-page.test.tsx` verdes.

## T7 — Guardias (depende de T3)

- [ ] **T7.1** **Retirar** `tests/unit/guards/nodo-geografico-sin-escritor.guardia.test.ts` y crear
  `nodo-geografico-escritor-unico.guardia.test.ts` (solo `GeoRepository` escribe el nodo; solo
  `PaisRepository`, los tipos; con contraprueba). (R43)
  *Hecho:* verde; un `prisma.nodoGeografico.create` inventado en otro archivo de `lib/` sale rojo.
- [ ] **T7.2** [P] `geografia-vieja-sin-escritor.guardia.test.ts` (R1) y ajustar
  `geografia-renombrado-punto-unico.guardia.test.ts` al nodo (R43).
- [ ] **T7.3** [P] Ampliar `geografia-sin-borrado-fisico.guardia.test.ts` a `nodoGeografico`,
  `tipoNivelGeografico` y `DELETE FROM` SQL. (R42)
  *Hecho de T7:* `pnpm run test:guardias` verde, con contraprueba en cada guardia nueva o ampliada.

## T8 — Script y ensayo (depende de T2)

- [ ] **T8.1** Modo `--equivalencia-geografia` en `scripts/geo-backfill-nodo.ts`, solo lectura (P8), y
  `tests/integration/db/geo-equivalencia-geografia.test.ts`. (R13)
- [ ] **T8.2** Dejar en `progress/impl_SLT-46.md` el guion del ensayo de §10 para la persona que lo corre
  (ningún agente lo ejecuta).

## T9 — Cierre

- [ ] **T9.1** `./init.sh` verde; mapa `R<n> → test` (R1–R45) en `progress/impl_SLT-46.md`; R45: sin
  archivos nuevos en `e2e/`.

## Archivos esperados

Base de datos:
- `db/schema.prisma`
- `db/migrations/20261106120000_slt46_historial_tipos_de_nivel/migration.sql`
- `db/migrations/20261106120000_slt46_historial_tipos_de_nivel/down.sql`
- `db/migrations/20261106120100_slt46_nodo_copia_a_geografia_vieja/migration.sql`
- `db/migrations/20261106120100_slt46_nodo_copia_a_geografia_vieja/down.sql`

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
