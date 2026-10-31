# SLT-65 — geo-jerarquica-consultas · tasks.md

> Requisitos R1–R28 en `requirements.md`; diseño en `design.md`. Ninguna task empieza antes de la
> aprobación del spec, ni antes de cerrar las preguntas abiertas que le afectan:
> - la 1 afecta a T6 y T8.3;
> - la 2 afecta a T9.1;
> - la 3 afecta a T5 y T8.3;
> - la 4 afecta a T4.3.
>
> `[P]` = paralelizable con las otras `[P]` de su bloque. Las dependencias van entre corchetes.
> Ningún agente corre los scripts de T5 ni de T6 fuera de la base de tests local.

## T0 — Preparación

- [ ] **T0.1** Comprobar los llamadores en plataforma (design §3, riesgo «Llamadores en
  plataforma»). Hay que confirmar que ningún llamador de `listByOwner`,
  `findDetalleByOrdenIdForOwner`, `list`, `findListItemsByIds`, las lecturas de recepción satélite,
  `findBaseCobroDevolucion` ni `findParaCorreccion` corre en `comoPlataforma` ni sin contexto.
  **Hecho:** la lista de llamadores está en `progress/impl_SLT-65.md`. Si aparece uno en plataforma,
  se para y se pregunta.
- [ ] **T0.2** Fixture `tests/integration/db/_fixtures/geo-65.ts` sobre `geo-44.ts` (design §14).
  **Hecho:** lo importa un test vacío que cuenta sus filas (antivacío) y pasa.

## T1 — La copia de hoy y la comparación compartida [T0]

- [ ] **T1.1** Extraer `compararPorId`, `Cifras` y `Diferencia` (con `bloque: string`) a
  `scripts/geo-equivalencia/comparacion.ts`, y hacer que `scripts/geo-equivalencia-dinero.ts` los
  importe. **Hecho:** `geo-equivalencia-dinero.test.ts` pasa sin cambiar aserciones.
- [ ] **T1.2** `scripts/geo-equivalencia/consultas-de-hoy.ts`: copia **literal** desde `b2bade4` de
  todo lo de la tabla de design §8, **antes** de tocar ningún repositorio. **Hecho:** compila. El
  commit de la copia va solo y precede a los de T2–T4, y el reviewer lo compara con `b2bade4`.

## T2 — Órdenes [T1]

- [ ] **T2.1** `lib/repositories/_shared/lugar-orden.ts` (`lugarDeLaOrden`, `whereLugarEn`) y
  `tests/unit/repositories/lugar-orden.test.ts`. **Hecho:** el test pasa (R1, R9, R13).
- [ ] **T2.2** `OrdenRepository`: helper `marcasDeOrdenes`. `apiOrdenSelect` y
  `WITH_ESTATUS_Y_TIENDA` pierden la marca anidada. `toApiOrdenRow` y `toListItemDTO` reciben la
  marca. Se cambian `listByOwner`, `findDetalleByOrdenIdForOwner`, `list`, `findListItemsByIds` y
  las dos lecturas de recepción satélite (design §2.1, filas 1–2; §3). Los nombres y los filtros no
  se tocan (§2.2). **Hecho:** `pnpm run typecheck` en verde.
- [ ] **T2.3** `findBaseCobroDevolucion` y `findParaCorreccion` (design §2.1, filas 3–4).
  **Hecho:** typecheck en verde.
- [ ] **T2.4** `tests/integration/db/geo-consultas-ordenes.test.ts` (R1–R4). Los dobles de las
  suites unitarias de design §14.1 cambian de entrada si hace falta. **Hecho:** pasa, y las suites
  existentes de la fila R1 de §14 pasan sin cambiar aserciones.

## T3 — Cierres y conteo [T1, T2.1]

- [ ] **T3.1** [P] `CierreDiaRepository`: `leerDescriptivosDeOrdenes` sobre el catálogo en la
  transacción, `cantones[id].zonaEspecial` y la marca del lugar en `crearCierre` (design §4).
  `DescriptivosTxClient` con los modelos nuevos. **Hecho:** typecheck en verde, y
  `emisor-relaciones-anidadas.test.ts` pasa sin cambiar aserciones (R7).
- [ ] **T3.2** [P] `tests/integration/db/geo-consultas-cierre.test.ts` (R5, R6, R17), sobre T3.1.
  **Hecho:** pasa, y `cierre-detail-congelado.test.ts` y las suites de R8 pasan sin cambiar
  aserciones.
- [ ] **T3.3** [P] `contarSinEntregarPorNodoGeografico` con `dePais`, `nodosBajo` y `whereLugarEn`
  (design §5). **Hecho:** typecheck en verde.
- [ ] **T3.4** [P] `tests/integration/db/geo-consultas-conteo.test.ts` (R9–R12), sobre T3.3.
  **Hecho:** pasa, y `geografia-ordenes-sin-entregar.test.ts`,
  `geografia-superadmin-sin-empresa.test.ts` y la guardia `geografia-terminales-una-sola-fuente`
  pasan sin cambios.

## T4 — Zonas y contexto [T1, T2.1]

- [ ] **T4.1** `ZonaRepository`: extraer `planificarReconciliacion`. Usa el catálogo en la
  transacción, `zonaQueCubre` y `whereLugarEn` dentro de `whereBaseElegible`. `update` aplica el
  plan (design §6). `ZonaPrismaClient` gana los modelos del catálogo. **Hecho:** typecheck en
  verde.
- [ ] **T4.2** `tests/integration/db/geo-consultas-zona.test.ts` (R13–R15, R17). **Hecho:** pasa.
  `zona-reconciliacion-ordenes.test.ts`, `zona-central-guarda-y-rastro.test.ts`,
  `zona-pago-mensajero-rastro.test.ts`, `zonas-action.test.ts` y `zona-repository.test.ts` (este,
  con dobles de entrada si hace falta) pasan sin cambiar aserciones (R16).
- [ ] **T4.3** `extension-empresa` (R18). No hay código que tocar. **Hecho:**
  `git diff --name-only origin/dev...HEAD -- lib/db/` sale vacío, o solo con
  `lib/db/excepciones-aislamiento.ts` si T5.1 lo exige. La salida va a `progress/impl_SLT-65.md`.
  `geo-nodo-rls.test.ts` y `geografia-dos-paises.test.ts` pasan sin cambios.

## T5 — Script de equivalencia [T2, T3, T4]

- [ ] **T5.1** Verificar las dos cosas de design §9:
  - si `comoPlataforma` en `scripts/` pasa `plataforma-solo-en-lista`;
  - qué consume `RechazoTiendaService` de la fila.

  **Hecho:** las respuestas están en `progress/impl_SLT-65.md`. Si hace falta una excepción nueva,
  se añade con su motivo y se avisa al reviewer.
- [ ] **T5.2** `scripts/geo-equivalencia-consultas.ts` con los bloques de design §9, y
  `pnpm geo:equivalencia-consultas` en `package.json`. **Hecho:** corre contra la base de tests
  local y sale 0 con el fixture.
- [ ] **T5.3** `tests/integration/db/geo-equivalencia-consultas.test.ts` (R22–R24). **Hecho:**
  pasa, con la contraprueba de la marca en un cantón.

## T6 — Script de rendimiento [T2, T3, T4]

- [ ] **T6.1** `scripts/geo-equivalencia/captura-consultas.ts`. Primero se verifica dónde expone el
  adaptador de Prisma 7 el SQL y los parámetros (design §10, paso 1). **Hecho:** un test de
  `geo-explain-consultas.test.ts` captura las consultas de `listByOwner` contra la base local.
- [ ] **T6.2** `scripts/geo-explain-consultas.ts` con las cinco lecturas de design §10, la mediana
  de 5, `hayRegresion` exportada y `pnpm geo:explain-consultas` en `package.json`. **Hecho:** corre
  contra la base local y su salida no tiene SQL ni datos personales.
- [ ] **T6.3** `tests/integration/db/geo-explain-consultas.test.ts` (R24, R25). **Hecho:** pasa con
  los casos de +19 %, +21 % y Seq Scan en los dos lados o solo en «después».

## T7 — Guardias [T2, T3, T4]

- [ ] **T7.1** [P] `tests/unit/guards/catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts`
  (design §12, R21). **Hecho:** verde sobre el repo, y la contraprueba con los tres casos
  prohibidos y los cuatro permitidos pasa.
- [ ] **T7.2** [P] Ampliar `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts`
  (todo `OrdenRepository.ts`, `CierreDiaRepository.ts`, `ZonaRepository.ts` y
  `_shared/lugar-orden.ts`) y `tests/integration/db/geo-lecturas-sin-backfill.test.ts` (lecturas
  1–7) (R19). **Hecho:** las dos pasan, con la contraprueba de la guardia.
- [ ] **T7.3** `pnpm run test:guardias` completo. **Hecho:** en verde, incluidas
  `zona-especial-punto-unico`, `geografia-sin-cte-recursiva` (R20) y
  `consultas-concurrentes-en-transaccion`.

## T8 — Cierre de la implementación [T5, T6, T7]

- [ ] **T8.1** Mapa `R<n> → test` completo en `progress/impl_SLT-65.md`, con las tres
  comprobaciones de diff anotadas:
  - `db/` vacío, o solo la migración de T9 (R26);
  - `lib/db/` vacío, salvo la excepción de T5.1 (R18);
  - los bloques de design §2.2 sin cambios (R28).

  **Hecho:** cada R1–R28 tiene una fila.
- [ ] **T8.2** `./init.sh` en verde. **Hecho:** la salida está en `progress/impl_SLT-65.md`.
- [ ] **T8.3** Puerta humana, sin agente. Una persona corre `pnpm geo:equivalencia-consultas` y
  `pnpm geo:explain-consultas` sobre la **copia** de producción con las migraciones de SLT-43, y
  pega las dos salidas en el PR. **Hecho:**
  - la equivalencia sale 0, o 1 solo por cadena incoherente si la pregunta abierta 3 se cierra así;
  - el rendimiento sale 0. Si sale 1, se pasa a T9.

## T9 — Solo si T8.3 marca regresión [T8.3]

- [ ] **T9.1** Primera mitigación del listado: los nombres desde el catálogo (design §11.1), solo
  con el sí de la pregunta abierta 2. **Hecho:** una persona repite T8.3 y el listado queda sin
  regresión.
- [ ] **T9.2** Índice en una migración aditiva (design §11.2).
  - Antes de crearla, se comprueba el timestamp en `origin/dev` y en las ramas en vuelo.
  - `@@index` en `db/schema.prisma`.
  - `tests/unit/db/slt43-migraciones-aditivas.test.ts` se amplía a la carpeta.

  Si el plan pide un índice de expresión, se para y se pregunta. **Hecho:** `migrate diff` sale
  vacío, el `down.sql` se ensaya sobre la base local y una persona repite T8.3 sin regresión.

## Archivos esperados

- `lib/repositories/OrdenRepository.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/repositories/ZonaRepository.ts`
- `lib/repositories/_shared/lugar-orden.ts`
- `scripts/geo-equivalencia-dinero.ts`
- `scripts/geo-equivalencia/comparacion.ts`
- `scripts/geo-equivalencia/consultas-de-hoy.ts`
- `scripts/geo-equivalencia/captura-consultas.ts`
- `scripts/geo-equivalencia-consultas.ts`
- `scripts/geo-explain-consultas.ts`
- `package.json`
- `tests/integration/db/_fixtures/geo-65.ts`
- `tests/integration/db/geo-consultas-ordenes.test.ts`
- `tests/integration/db/geo-consultas-cierre.test.ts`
- `tests/integration/db/geo-consultas-conteo.test.ts`
- `tests/integration/db/geo-consultas-zona.test.ts`
- `tests/integration/db/geo-equivalencia-consultas.test.ts`
- `tests/integration/db/geo-explain-consultas.test.ts`
- `tests/integration/db/geo-lecturas-sin-backfill.test.ts`
- `tests/unit/repositories/lugar-orden.test.ts`
- `tests/unit/guards/catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts`
- `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts`
- Posibles, solo los dobles (design §14.1):
  - `tests/unit/repositories/zona-repository.test.ts`
  - `tests/unit/repositories/cierre-dia-repository.test.ts`
  - `tests/unit/repositories/orden-repository.api-lectura.test.ts`
  - `tests/unit/repositories/orden-repository.listado-filtros-257.test.ts`
  - `tests/unit/repositories/orden-repository.no-regresion-106.test.ts`
- Solo si T5.1 lo exige: `lib/db/excepciones-aislamiento.ts`
- Solo si T9.2 aplica:
  - `db/schema.prisma`
  - `db/migrations/20261101120000_indice_lugar_orden_slt65/migration.sql`
  - `db/migrations/20261101120000_indice_lugar_orden_slt65/down.sql`
  - `tests/unit/db/slt43-migraciones-aditivas.test.ts`
- `progress/impl_SLT-65.md`
- `progress/features/SLT-65.md`
