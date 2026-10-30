# SLT-44 — geo-jerarquica-dominio · tasks.md

> Requisitos: `requirements.md` (R1–R26). Diseño: `design.md`. Todo es de `backend_dev` (`lib/`,
> `scripts/`, `tests/`, `docs/`): no hay `components/` ni páginas. `[P]` = puede ir en paralelo con
> las otras `[P]` de su bloque.
>
> Una task está hecha cuando su criterio se cumple **y** `pnpm exec vitest related --run <archivos>`
> pasa con `DATABASE_URL` exportada. Un verde con los tests de base saltados no cuenta.
>
> **No empieza nada sin el spec aprobado.** Si el humano no acepta la caché por petición de design
> §4, se para antes de T3.2.

## T0 — Precondiciones

- [ ] **T0.1** Comprobar que la rama lleva SLT-43 (PR #44) tal como está en su rama, sin `ruta`.
  *Hecho:* existen los modelos `NodoGeografico` y `TipoNivelGeografico` en `db/schema.prisma`, y
  no hay columna `ruta`. Si el PR #44 cambió desde el merge de `0dc0847`, se vuelve a mergear y se
  avisa al leader.
- [ ] **T0.2** Comprobar que ningún `OrdenRepository`, `GeoRepository` ni `CoberturaRepository` se
  crea a nivel de módulo en `lib/` ni en `app/` (design §4). *Hecho:* el Grep sale vacío y se
  anota en `progress/impl_SLT-44.md`. Si aparece uno, se para: la caché por instancia dejaría de
  ser por petición.

## T1 — El «antes», congelado (depende de T0)

- [ ] **T1.1** `scripts/geo-equivalencia/lecturas-de-hoy.ts` (design §6.1). Copia literal, sacada
  de `dev` **antes de tocar ningún repositorio**, de:
  - `OrdenRepository`: `findAllProvincias`, `findCantonesByProvinciaIds`,
    `findDistritosByCantonIds` y `findDistritoParaCorreccion`;
  - `CoberturaRepository.listDistritos`;
  - `GeoRepository`: `listProvinciasLite`, `listCantonesLite`, `listDistritosLite`,
    `listGeografiaLitePorZona`, `listArbol` y `listArbolDePais`.

  Cada una es una función que recibe el cliente y devuelve los mismos tipos de fila. *Hecho:*
  typecheck verde; el cuerpo de cada función es idéntico al de `dev` salvo `this.prisma` →
  `cliente`, y se anota el commit de `dev` del que salió.
- [ ] **T1.2** [P] Fixture `tests/integration/db/_fixtures/geo-44.ts` (design §10): dos empresas,
  una de CR y otra de `XA`; zonas, una central; un distrito en dos zonas y otro sin zona; un cantón
  retirado con un distrito activo; un distrito retirado; marcas de una sola empresa; una tienda con
  tarifa; órdenes con y sin distrito. Se monta sobre `geo-43.ts` y sobre las fábricas de
  `cotizacion-api-key.test.ts` si están exportadas. *Hecho:* lo usan T3.2, T4.5 y T5.3 sin duplicarlo.

## T2 — El dominio (depende de T0)

- [ ] **T2.1** `_shared/geografia-activa.ts`: añadir `activoEnCascada(flags)` y hacer que
  `estaDisponible` delegue en ella (design §2.3). *Hecho:* `tests/unit/repositories/geografia-activa.test.ts`
  y `geografia-predicado-unico.guardia.test.ts` verdes sin tocarlos.
- [ ] **T2.2** `lib/services/geografia-dominio.ts` con los tipos y las funciones de design §2.1–§2.2,
  y `tests/unit/services/geografia-dominio.test.ts` (R2–R8, filas de design §10). *Hecho:* verde
  sin `DATABASE_URL`. El caso «dos zonas en el nodo más cercano y una en el abuelo» da `null`. La
  tabla de 8 + 4 combinaciones coincide con `estaDisponible`.
- [ ] **T2.3** [P] `tests/unit/guards/geografia-dominio-puro.guardia.test.ts` (R1) con contraprueba.
  *Hecho:* verde sobre el módulo real; rojo sobre un texto que importa `@prisma/client`.
- [ ] **T2.4** [P] `tests/unit/guards/geografia-sin-cte-recursiva.guardia.test.ts` (R13) con
  contraprueba. *Hecho:* verde sobre `lib/` y `scripts/`; rojo sobre un texto con `with recursive`.

## T3 — Carga del catálogo (depende de T2.2)

- [ ] **T3.1** `_shared/zona-especial.ts`: `leerNodosConMarcaDeLaEmpresa(tx)` y el tipo
  `ClienteDeMarcas` (design §3). *Hecho:* `zona-especial-punto-unico.guardia.test.ts` verde sin
  tocarla, y ningún archivo nuevo nombra el modelo de marcas.
- [ ] **T3.2** `lib/interfaces/repositories/ICatalogoGeograficoRepository.ts` y
  `lib/repositories/CatalogoGeograficoRepository.ts` con `deLaEmpresa()` y `dePais(paisId)`, el corte
  en plataforma, la transacción única y la memoria de la promesa por empresa (design §3 y §4).
  Test: `tests/integration/db/geo-catalogo-repository.test.ts` (R9, R10, R11). *Hecho:* verde.
  Las tres lecturas en `Promise.all` hacen una sola consulta de nodos. En plataforma, o sin
  contexto, sale `EmpresaNoResuelta` con 0 consultas.

## T4 — Las lecturas (depende de T3.2 y T1.1)

- [ ] **T4.1** `GeoRepository`: reescribir `listProvinciasLite`, `listCantonesLite`,
  `listDistritosLite`, `listGeografiaLitePorZona`, `listArbol` y `listArbolDePais` sobre el
  catálogo (design §5). No se tocan `findHermanos`, `findHermanosDeNodo`, `leerDivisionDePais` ni
  las escrituras (design §7). Ampliar `GeoPrismaClient`. *Hecho:* typecheck verde y las filas
  R14–R17 de `geo-lecturas-catalogo.test.ts` (T4.5) verdes.
- [ ] **T4.2** `OrdenRepository`: reescribir **solo** `findAllProvincias`,
  `findCantonesByProvinciaIds`, `findDistritosByCantonIds` y `findDistritoParaCorreccion` (design §5).
  No se toca ninguna otra lectura de órdenes, que son de SLT-65 (design §7). *Hecho:* las filas
  R18–R19 de T4.5 verdes; `IOrdenRepository` sin cambios en el diff.
- [ ] **T4.3** [P] `CoberturaRepository.listDistritos` sobre el catálogo (design §5).
  `listZonaIdsConTarifaGeneral` no cambia. *Hecho:* la fila R20 de T4.5 y
  `cobertura-repository.test.ts` verdes.
- [ ] **T4.4** Dobles unitarios (design §10, «cambian de entrada, no de salida»):
  `tests/unit/repositories/catalogo-filtros-ordenes.test.ts`, `orden-repository.bulk.test.ts` y
  los tests de composición que el typecheck señale (`cobertura.composition-root`,
  `corregir-datos-cliente.composition-root`, `geografia.composition-root`,
  `geografia-plataforma.composition-root`). *Hecho:* verdes. En el diff no cambia ningún
  `expect(...)` de salida: solo los datos de los dobles, o el modelo simulado.
- [ ] **T4.5** `tests/integration/db/geo-lecturas-catalogo.test.ts` (R14–R20): cada método nuevo
  frente a su copia de `lecturas-de-hoy.ts` sobre el fixture de T1.2, con los empates comparados
  como conjunto. *Hecho:* verde.
- [ ] **T4.6** [P] R12: `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts` con
  contraprueba, y `tests/integration/db/geo-lecturas-sin-backfill.test.ts` en base propia
  (`_fixtures/base-propia-43.ts`), con `nodo_geografico_id` en NULL y los triggers de columna
  desactivados. *Hecho:* los dos verdes.
- [ ] **T4.7** Correr sin tocarlas las suites de R18–R20, R24 y R26 que nombra design §10:
  `vitest related` sobre los archivos de T4.1–T4.3 y `_shared/*`. *Hecho:* verdes sin cambiar
  aserciones. Si una cae, se arregla el código, no el test, y se avisa si no se puede.

## T5 — Equivalencia de dinero (depende de T4)

- [ ] **T5.1** Verificar tres cosas antes del script (design §6.2 y §9) y anotarlas en
  `progress/impl_SLT-44.md`:
  - cómo arma `ApiKeyAuthService` el actor `apiKey` de una tienda, para replicarlo sin una key;
  - qué roles acepta `CoberturaService.listar`;
  - que un script que llama a `paraCadaEmpresa` no necesita una entrada nueva en
    `EXCEPCIONES_DE_PLATAFORMA` (guardia `plataforma-solo-en-lista`).

  *Hecho:* las tres anotadas. Si alguna obliga a cambiar el diseño, se para y se avisa.
- [ ] **T5.2** `scripts/geo-equivalencia-dinero.ts` (design §6.2): cliente de solo lectura,
  `compararEmpresa` exportada, salidas 0/1/2 y la entrada `geo:equivalencia-dinero` en
  `package.json`. *Hecho:* typecheck y guardias verdes.
- [ ] **T5.3** `tests/integration/db/geo-equivalencia-dinero.test.ts` (R8, R21, R22, R23). *Hecho:*
  verde. Da 0 diferencias en el fixture. La contraprueba con una asignación inyectada en un cantón
  da diferencias nombradas. El `INSERT` falla con `25006`. La salida no contiene PII del fixture.

## T6 — Documentación (depende de T4)

- [ ] **T6.1** [P] `docs/architecture.md > Multi-empresa > País por empresa > Geografía jerárquica`.
  Hoy dice «La app todavía no lee nada del modelo nuevo: las lecturas llegan con SLT-44». Pasa a
  describir:
  - el dominio puro;
  - el catálogo por petición y por empresa;
  - qué lecturas pasaron al catálogo y cuáles siguen en las tablas viejas hasta SLT-65;
  - que el lugar se lee de las FK viejas;
  - `pnpm geo:equivalencia-dinero` y quién lo corre.

  *Hecho:* `check-perfil` verde.

## T7 — Cierre (depende de todo lo anterior)

- [ ] **T7.1** Gate local: typecheck, lint, todas las guardias y los tests de T2–T5. Si `./init.sh`
  no termina en local por memoria, se hace como en SLT-43 T7.1, y el `gate-completo` de CI hace de
  gate. En `progress/impl_SLT-44.md` van:
  - el mapa `R<n> → test` (26 filas);
  - la salida de `git diff --name-only origin/dev...HEAD -- db/`, que debe salir vacía (R25).

  *Hecho:* todo verde y el `gate-completo` del PR en verde.
- [ ] **T7.2** **Puerta humana, fuera del agente** (design §6.2). Una persona corre `pnpm
  geo:equivalencia-dinero` sobre una **copia** de producción con SLT-43 aplicada y pega la salida
  en el PR. *Hecho:* salida 0 pegada en el PR. Con 1 o 2, el PR no entra. Ningún agente lo ejecuta.

## Archivos esperados

- `lib/services/geografia-dominio.ts`
- `lib/repositories/CatalogoGeograficoRepository.ts`
- `lib/interfaces/repositories/ICatalogoGeograficoRepository.ts`
- `lib/repositories/_shared/geografia-activa.ts`
- `lib/repositories/_shared/zona-especial.ts`
- `lib/repositories/GeoRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/repositories/CoberturaRepository.ts`
- `scripts/geo-equivalencia/lecturas-de-hoy.ts`
- `scripts/geo-equivalencia-dinero.ts`
- `package.json`
- `docs/architecture.md`
- `tests/integration/db/_fixtures/geo-44.ts`
- `tests/integration/db/geo-catalogo-repository.test.ts`
- `tests/integration/db/geo-lecturas-catalogo.test.ts`
- `tests/integration/db/geo-lecturas-sin-backfill.test.ts`
- `tests/integration/db/geo-equivalencia-dinero.test.ts`
- `tests/unit/services/geografia-dominio.test.ts`
- `tests/unit/guards/geografia-dominio-puro.guardia.test.ts`
- `tests/unit/guards/geografia-sin-cte-recursiva.guardia.test.ts`
- `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts`
- `tests/unit/repositories/catalogo-filtros-ordenes.test.ts`
- `tests/unit/repositories/orden-repository.bulk.test.ts`
- `tests/unit/actions/cobertura.composition-root.test.ts`
- `tests/unit/actions/corregir-datos-cliente.composition-root.test.ts`
- `tests/unit/actions/geografia.composition-root.test.ts`
- `tests/unit/actions/geografia-plataforma.composition-root.test.ts`
- `progress/impl_SLT-44.md`
