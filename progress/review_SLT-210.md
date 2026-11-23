# Review SLT-210 «Satélite: Vistas y ordenamiento en Órdenes de la bodega, como en Órdenes»

PR #241 · ruta ligera · acotada a `git diff origin/dev...HEAD` (HEAD 6b1c4d88) · 2026-11-19.
Tests con `con-desechable.cjs … servi_slt210_desechable`. MCP del grafo no usado: lectura con Read/Grep.

## Checklist

- [x] **Ruta.** Ligera correcta: sin dinero, permisos, auth, integraciones ni migración; complejidad media.
- [x] **Lo que ya existe.** Sección presente y con contenido; el diff reusa (`SegmentedToggle`,
  `VistasFiltro` vía `BuscadorFiltros`, `ordenamiento-ordenes.ts`, `esquemaOrdenamiento`,
  `claveDeOrden`, `clave_remision`) y no re-crea nada. `components/shared/` sin tocar.
- [x] **Tasks.** T1-T5 en `[x]`.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 20/40 archivos, 272/1000 producción, 983/3000 tests.
- [x] **Trazabilidad.** R1400-R1414 tienen cada uno al menos un test que asierta el comportamiento (mapa en
  `progress/impl_SLT-210.md`, comprobado leyendo los tests). R1413 ver hallazgo 1.
- [x] **Typecheck.** `npx tsc --noEmit -p .` → exit 0, sin salida.
- [x] **Lint** (archivos del diff). exit 0, `0 errors, 2 warnings`; los dos ya existían en `dev`.
- [x] **Tests.** 10 archivos (feature + los ajustados + las dos guardias) → `Test Files 10 passed (10) ·
  Tests 138 passed (138)`, sin saltados: el de Postgres real corrió.
- [x] **E2E.** `e2e/recepcion-satelite.spec.ts` ampliado; la bitácora deja constancia (`2 passed`, `E2E_EXIT=0`).
  No lo repetí: lo corre el CI.
- [x] **Datos y seguridad.** Ninguna tabla, migración ni query nueva: solo cambia el `ORDER BY` de una
  consulta que ya existía. Sin literales de país ni moneda en producción, sin `console.log`, cero «Ordenex».

### Puntos pedidos por el leader

1. **Trazabilidad**: OK (arriba).
2. **Alcance por zona**: OK. `ordenBodegaSatelite(orden)` solo sustituye el tercer término del `ORDER BY`;
   `WHERE` (`condicionesSatelite`, con `zona_id` sacado del usuario) no cambia y va antes en las dos
   consultas (página y conjunto). `satelite-orden-sql-real.test.ts` siembra la zona B con órdenes MÁS
   NUEVAS que todas las de A (saldrían primero si se colaran), y tiene control positivo (`total` = 5). No es
   vacuo: con la mutación `zona_id = … OR TRUE`, el test se pone rojo (`expected 10 to be 5`). La
   «otra empresa» queda cubierta por lo mismo: la zona pertenece a una sola empresa y sale de la sesión.
3. **Inyección**: OK. Borde: `esquemaOrdenamiento(["created_at","num_remision"], …)` = `z.enum` +
   `.strict()`. Repositorio: columna y dirección son fragmentos `Prisma.sql` fijos elegidos por `===`; un
   valor raro cae al default, nunca al texto. El test unitario comprueba que los parámetros son los mismos
   que sin orden (no viaja nada del cliente). R1405 prueba `'o."zona_id"'`, `num_guia`, `DESC`, `up` en página y
   descarga, sin llamar al servicio.
4. **Vistas por usuario (P1)**: OK. Las actions sacan `usuarioId` de la sesión. `vista-filtro.test.ts`
   (Postgres) comprueba que otra persona no ve, no renombra, no actualiza y no borra la vista, y que cada
   superficie trae solo lo suyo, en los dos sentidos. Superficie propia `"ordenes-bodega-satelite"`; la
   guardia fija qué superficie monta cada listado.
5. **P2**: OK. El grupo de estado y `prioridad DESC` siguen delante; sin orden, el SQL da el mismo texto
   que antes (`created_at DESC`). La pre-cargada solo se usa con el orden por defecto. En Postgres, sin
   orden = `[a4,a3,a2,a1,novedad]`, y la `novedad` sale última en las cuatro combinaciones.
6. **P3**: OK en el código. `VistasFiltro.tsx` y `SegmentedToggle.tsx` no están en el diff; los
   conmutadores se montan con las mismas props que en `OrdenesListado` (sin clase propia). Ver hallazgo 1
   sobre el texto del spec.
7. **Tests ajustados, sin aflojar**: OK.
   - `recepcion-satelite-action`: los `toHaveBeenCalledWith` siguen siendo literales exactos; solo se añaden
     `sortBy`/`sortDir` del default.
   - `SateliteDescarga`: sigue con `toEqual` exacto más las dos claves.
   - `integration/db/vista-filtro`: solo añade un caso.
   - `criterio-unico.guardia`: la MUTACION 4 cambia el patrón por la llamada nueva. `mutar()` falla si el
     patrón no encuentra nada y la aserción de rojo es la misma.
   - `vistas-superficies-declaradas`: la lista literal crece en uno y suma un caso.
   - `vista-filtro-payload`: la lista literal se actualiza y sigue con `toEqual` exacto.
8. **Mutaciones repetidas** (restauradas con `git checkout --`, árbol limpio después):
   - M2, dirección siempre `DESC` en el repo: ROJO, 3 tests (SQL unitario ×2 y Postgres). La bitácora decía 1:
     corrió menos archivos.
   - M5, descarga sin `...orden` en el módulo: ROJO, 2 tests (R1406 del componente y `SateliteDescarga`).
   - Extra, zona sin filtrar (`OR TRUE`): ROJO, 1 test (Postgres, R1404).

## Hallazgos

1. **menor**: el texto del spec no recoge P3. R1413 todavía dice «por debajo de `md` (móvil) DEBEN medir 44
   px, … en `/ordenes` por igual», y D2 dice «móvil 44 px». El test de R1413 comprueba lo contrario (sin
   `max-md:h-11`), que es lo que decidió el leader en P3 y anota T4. El código y el test cumplen la decisión,
   pero el requisito escrito no. Hay que reescribir R1413 («mismo alto que `/ordenes` hoy: `h-8`/`size-8` en
   todas las anchuras») y D2. Ya puestos, quitar «*(Pendiente de P1/P2…)*» de R1403 y R1412, y «Pendiente de
   aprobación» del `## Estado` de `progress/features/SLT-210.md`.
2. **menor**: R1414 solo se prueba con el catálogo geográfico caído (`renderModulo(null)`). La otra rama,
   el catálogo de estados vacío, no tiene caso. El código usa el mismo criterio que `/ordenes`.
3. **menor**: la bitácora da 1 rojo para M2; medido son 3 (punto 8). No cambia nada: solo la cifra.

## Veredicto

**OK**. No hay bloqueantes. Los tres menores son de texto y cobertura, y no frenan el merge; conviene
cerrar el 1 antes, porque es el contrato escrito.
