# Review SLT-194 «Buscar escaneando en recolección, devoluciones y rechazos»

Ruta ligera, zona fullstack. Diff revisado: `47c658c7..c0fea773` (lo propio de SLT-194; SLT-193
«Botones de 44 px pendientes en la PWA del mensajero» llegó por el merge `b29126a8`, desde
`838b2431`. Las dos líneas de `progress/*SLT-193*` del diff son el commit `47c658c7` de SLT-193, que
esta rama aún no tiene: no son cambios de SLT-194). Fecha: 2026-11-17.

## Checklist

- [x] **Ruta:** ligera es válida. El diff no toca dinero, autenticación, integraciones ni webhooks.
  En permisos, Rechazos reusa la comprobación de rol que ya existía (`adminTienda`, tienda =
  `actor.usuarioId`) y no añade ninguna. Complexity low.
- [x] **Spec ligero:** `requirements.md` tiene alcance, EARS R940-R957, DC1-DC4, `## Lo que ya existe`
  con evidencia, `## Tasks` y `## Archivos esperados`. El diff no re-crea nada de lo listado: reusa
  `BuscadorFiltros`, `EscanerModal`, `criterioBusqueda`, `terminoDeBusqueda`,
  `BUSQUEDA_MIN/MAX_CHARS`, `PLACEHOLDER_BUSQUEDA` y `SIN_COINCIDENCIAS_TITULO`/`LIMPIAR_BUSQUEDA`.
- [~] **Tasks:** T1-T6 están en `[x]`. T7 (dispositivo en Preview) y T8 (gate) siguen en `[ ]`: son
  pasos del leader y de Carlos posteriores a la review, igual que en SLT-168. Ver m1.
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` da 22/40 archivos, 233/1000 líneas de producción y
  831/3000 de tests. `git diff --stat 47c658c7..c0fea773` sin `progress/` ni `specs/`: 22 archivos.
- [x] **Trazabilidad:** de R940 a R957, cada R tiene su test y el test lo verifica de verdad.
  `impl_SLT-194.md` trae el mapa R → test, separado por capa.
- [x] **Typecheck:** `pnpm run typecheck` sale con exit 0.
- [x] **Lint:** eslint sobre los 18 `.ts/.tsx` del diff da 0 errores. Hay 1 warning que ya existía:
  `OrdenHistorialOrigenTipo` sin usar (`IOrdenRepository.ts:11`), y no lo trae este diff.
- [x] **Tests del diff** (con la desechable `servi_slt194g_desechable`):
  - 9 archivos del diff, más `filter-component.test.tsx`: 204 passed, 0 skipped. La integración SQL
    corrió de verdad.
  - Descarga y DataTable (`tests/components/descarga/*`, `DataTable*`), las barras B6-B8 con `h-8`
    (`EstadoCuenta463`, `MiWalletFiltros`, `WalletCaja463`, `WalletFiltros458`) y
    `NovedadesTabs`/`NovedadesPage`: 37 archivos, 374 passed.
  - `orden-repository.rechazos-sla.test.ts`: 5 passed.
- [x] **Guardias** (`pnpm run test:guardias`): 354 de 355 en verde. El único rojo,
  `dependencias-declaradas-presentes.guardia.test.ts` (marcador de init.sh), está en
  `tests/baseline-rojos.json` y no tiene que ver con el diff: no es un hallazgo.
- [x] **E2E en local** (build sobre `servi_slt194e_desechable`, `--retries=0`):
  - `pwa-mensajero-recoger-recoleccion.spec.ts`: 8 passed, R945 incluido.
  - `cierres-admin-rechazos-sla.spec.ts`: 1 passed.
  - La bitácora deja constancia de que los E2E de `/novedades` y de B1-B8 salieron en verde sobre
    `9c84b826`.
- [x] **Datos y empresa:** sin tablas ni migraciones nuevas.
  - La query de Rechazos sigue acotada por `tiendaId` y por la RLS de la empresa.
  - El test SQL la ejerce con `comoApp` (sin BYPASSRLS) y con dos empresas.
- [x] **Capas:** acción (zod en el borde) → servicio (rol) → repositorio (`WHERE`).
- [x] **Sin** secretos, literales de país o moneda, ni recursos de Ordenex. Tampoco dependencias nuevas.
- [x] **Comentarios:** explican el porqué (AND y no OR, la llamada sin `undefined`, el `leerDeUrl={false}`).

## Reglas de Carlos

- [x] **Mismo `BuscadorFiltros` con `escaneo`.** Recolección
  (`RecoleccionModule.tsx:298`) y Rechazos (`RechazosSlaModule.tsx:147-156`) lo montan sin
  buscadores ni variantes nuevas.
- [x] **Un solo escáner.** La cámara es la de `BuscadorFiltros`/`EscanerModal`. No hay otro componente.
- [x] **Filtros y «Descargar» a 44 px solo en móvil.** Es solo `max-md:h-11`
  (`alto-controles-barra.ts:10`, `DescargarDatasetButton.tsx:340`). El `h-8` de escritorio se
  conserva y el test lo comprueba.
- [x] **En Recolección, lo escaneado solo filtra.** R941 y R942 afirman `recolectarMock` sin
  llamadas, y el E2E deja la orden en «Por recolectar».
- [x] **Rechazos busca en el servidor.** La pestaña pide la página por la acción con `q`.

## Verificaciones pedidas

**Backend de Rechazos**

- **AND y no OR.**
  - `criterioBusqueda` va como clave hermana de `tiendaId`/`deletedAt`/`estatus`/`historialEstados`
    (`OrdenRepository.ts:6046-6052`).
  - El único `OR` posible es el interno de `criterioBusqueda`, entre las dos formas del término
    sobre la misma columna, y `rechazoSlaWhere` no tiene otra clave `OR` que pueda pisar.
- **Total y página con el mismo filtro.** `count` y `find` llaman a `rechazoSlaWhere(tiendaId, busqueda)`.
  El servicio pasa el mismo término a los dos (`RechazosSlaTiendaService.ts:47-56`).
- **Sin término, la consulta es la de antes.**
  - La acción no manda la clave `busqueda`, el servicio llama sin tercer argumento y
    `criterioBusqueda(undefined)` devuelve `{}`.
  - Lo afirman la acción (`toStrictEqual`), el servicio y la integración (R957).
- **Alcance.** El rol se comprueba antes de leer: con otro rol hay cero llamadas (R956). La tienda
  sale siempre de `actor.usuarioId`, y la empresa la impone la RLS (`comoApp`).
- **Test de integración `rechazos-sla-busqueda-sql-real.test.ts`.**
  - Tiene siembra propia en una transacción revertida y comprueba como dueño que no es vacía.
  - No tiene `if (!x) return`. Solo hay un `describe.skip` cuando no hay base, que es el patrón del
    repo.
- **Mutaciones mías** (las dos revertidas con `git checkout -- <archivo>`):
  1. `findRechazadasSlaByTienda` sin el término (solo la cuenta filtra): 4 failed de 6 (R953 ×3, R954).
  2. Término en un `OR` con `tiendaId`, quitando la clave hermana: 4 failed de 6. Una de ellas es
     «otraTienda: expected [ …(3) ] to not include …».

**`alto-controles-barra.ts`**

- **Fuera de las barras con `escaneo`, nada cambia.** El contexto vale `""` por defecto, y el
  `Provider` solo envuelve `children` cuando hay `escaneo` (`BuscadorFiltros.tsx:634-641`).
  - Mutación mía, con `Provider` siempre activo: R948 cae.
  - Mutación mía, quitando `altoBarra` de las pastillas: R946 cae.
- **En escritorio, nada cambia.** Todas las clases nuevas llevan el prefijo `max-md:`. La X del
  rango solo baja a `max-md:bottom-2.5` cuando hay contexto.
- **«Descargar» crece en todos sus usos.**
  - El `Button` no tenía `className`, así que añadirlo no pisa nada.
  - Los 15 archivos de descarga y los de `DataTable` siguen en verde.
  - No rompe ninguna tabla. Solo hay una nota visual en m3.

**Guardia `buscadores-con-escaneo`**

- Confirmado: `pasaEscaneo` cuenta `escaneo={false}` como si pasara `escaneo`
  (`buscadores-con-escaneo.guardia.test.ts:50-61`).
- Es un fallo previo de la guardia (SLT-160 «Buscar escaneando en los listados»), y en estas dos
  pantallas lo cubren los tests de componente: el implementer lo midió con `escaneo={false}` en
  Recolección y en Rechazos.
- Lo valoro **menor** (m2).

**Mutaciones por R crítico**, todas revertidas, además de las dos del `WHERE`:

| R | Mutación | Resultado |
| --- | --- | --- |
| R956 | El servicio no pasa el término a `find` | 2 failed |
| R955 | Sin `.trim()` en el esquema | 1 failed |
| R951 | «Página siguiente» sin el término | 1 failed |
| R948 | Contexto siempre activo | 1 failed |
| R946 | Pastillas sin el alto | 1 failed |

Al final, `git status` queda limpio.

## Hallazgos

**Bloqueantes:** ninguno.

**Menores:**

- **m1 (menor)** — `requirements.md:222-227`: T7 (dispositivo en Preview) y T8 (gate) siguen en
  `[ ]`. Hay que marcarlas, con su nota en `progress/features/SLT-194.md`, antes del aviso «listo
  para mergear». Es el mismo criterio que se siguió con SLT-168.
- **m2 (menor)** — `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts:60`: la guardia acepta
  `escaneo={false}`.
  - Es previo a esta ficha, y en Recolección y Rechazos lo cubren los tests de componente.
  - Sugerencia para una `chore/`: exigir `escaneo` suelto o `escaneo={true}`, y rechazar
    `escaneo={false}`.
- **m3 (menor)** — `components/shared/DescargarDatasetButton.tsx:340`: en móvil, «Descargar» pasa a
  44 px pero el selector de columnas que lo acompaña en `DataTable` se queda en 32 px. La fila queda
  con dos alturas.
  - Es lo que fija el spec (D5, y `ColumnasPopover` fuera por la respuesta de Carlos), así que no
    hay que cambiarlo aquí.
  - Conviene que Carlos lo vea en T7.
- **m4 (menor)** — `tests/integration/db/rechazos-sla-busqueda-sql-real.test.ts:223`: el test «el
  total y la página salen del mismo filtro» no detecta un `find` sin término, porque su término casa
  con las dos órdenes. Mi mutación 1 lo deja en verde.
  - La propiedad sí la protegen R953 y R954, que afirman `count` y `find` por separado.
  - Lo que sobra es el nombre del test, no falta cobertura.
- **m5 (menor)** — `app/(app)/novedades/_components/RechazosSlaModule.tsx:170-207`: lo que va dentro
  del fragmento `<>…</>` no se reindentó. El lint pasa; es cosmético.

## Veredicto

**OK**: 0 bloqueantes y 5 menores. Antes de mergear hay que cerrar T7 y T8 (m1).
