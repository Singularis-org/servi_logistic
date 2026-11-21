# review SLT-106 «Bodega satélite: A consolidar con la cola única» — vuelta 1

Ruta completa. Rama `feature/SLT-106-satelite-a-consolidar-cola`, HEAD revisado `f4fbb229`
(sincronizada con origin/dev). Diff `origin/dev...HEAD`. Base para vitest: `slt106_consolidar`.

## Checklist

- [x] **Trazabilidad R190–R207 y R del madre (R32, R37, R45–R48, R67, R71, R72).** Cada R tiene su test
  en `tasks.md > Trazabilidad` y existe. Los leí y comprueban lo que dicen, con literales escritos a mano:
  - fila: `ColaCierresConsolidar.test.tsx:185-234`, con la contraprueba `paraLaCentral` 41234.00;
  - tarjetas y diálogo: `ConsolidacionBodegaRefresco.test.tsx:183-283`, con los pares del `<dl>` en literal;
  - servidor: `consolidacion-cola-satelite.test.ts` (unit + integración).
  R190 y R191 están cubiertos en parte (menor 1).
- [x] **Tasks.** T0–T4 y T5.2 en `[x]`. Siguen abiertas dos:
  - T5.1 (`./init.sh` del leader, en curso);
  - T6.1 (Preview antes de promover a prod; por diseño va después del merge).
  Ver la condición del veredicto.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 36/40 archivos y 2 676/1 000 líneas, aceptado por Carlos
  (`progress/features/SLT-106.md:26`). Ver el menor 4.
- [x] **`design.md > ## Lo que ya existe`.** Está y no está vacía. El diff no re-crea nada de esa lista:
  - reusa `paraLaCentral()`, la subconsulta `_count` de ajustes y el `where` de `contarCierresDiaSolicitados`;
  - reusa `CifrasCierre`, `TablaCola`, `FiltrosCierresBarra`, `DescargarDatasetButton` y `hrefDetalleCierre`.
- [x] **Typecheck.** `pnpm run typecheck` → `TC_EXIT=0`.
- [x] **Lint.** `pnpm run lint` → exit 0 (0 errores, 243 warnings heredados). `eslint` sobre los archivos
  de `app/`, `components/` y `lib/` del diff → exit 0, sin salida.
- [x] **Tests del servidor (vuelto a correr).** 7 archivos, 81/81 en verde: unit, repo y la integración
  `tests/integration/db/consolidacion-cola-satelite.test.ts`, sin `skipped`.
- [x] **Tests de pantalla y guardias (vuelto a correr).** 14 archivos, 229/229 en verde:
  - `ColaCierresConsolidar`, `ConsolidacionBodegaRefresco`, `ColaCierres` (mensajeros) y `ColaCierresBodega` (central);
  - `cola-cierres-vista`, `ColasPaginacion`, `BajoRiesgoPaginacion` y `CierreIngresoBodegaTarjetaListado`;
  - `CierresDescarga*` y `CierresAdminPage`;
  - las guardias `cobertura-tablas`, `cascada-central-en-las-dos-pantallas` y `liquidacion-money-safe`.
- [x] **Integración contra Postgres con datos sembrados.** El test siembra en una transacción revertida:
  - zona A: M1 aprobado con dos ajustes en una gestión, otro de M1 ya consolidado, M2 y M3 `solicitado`, M4 `rechazado`;
  - zona B: M5 `solicitado`.
  Antes de mirar, exige filas (`toBeGreaterThan(0)`).
- [x] **Mutaciones reproducidas por el reviewer** (aplicadas, corridas y restauradas; `git diff --stat` vacío al final):
  - quitar `estado` de `sinResolverWhere` → 2 rojos. El motivo pasa a nombrar a «Ana Aprobada, Bruno Solicitado,
    Carla Solicitada y Diego Rechazado»: la mutación muere.
  - `paraLaCentral(general, pago, "0.00")` en `toConsolidableRow` (sin la bodega) → 3 rojos: el de integración y
    dos unit. Esperaba `57700.00` y recibió `58000.00`: la mutación muere.
- [x] **R72 / R200.** El diff no trae `db/` ni `lib/actions/`. Del servicio solo cambia `listarConsolidacion`:
  `solicitarCierreBodega` sigue intacto, con su `contarCierresDiaSolicitados`, que ahora lee el `where`
  compartido, idéntico al de antes.
- [x] **R71, dinero sin floats.** `money()` es el único que toca un importe en la UI. «La central debe» se
  compara como texto (`esMontoCero`) y el signo con `esMontoNegativo`. `paraLaCentralAgregado` sale del
  servidor. `liquidacion-money-safe` censa el módulo, y su contraprueba está anotada en impl.
- [x] **Multi-empresa.** No hay tabla nueva. La única query nueva (`findMensajerosConCierreSinResolver`)
  pasa por `prisma.cierreDia` con la extensión de empresa y la RLS, y además filtra por zona. Ver el menor 2.
- [x] **Ordenex / país.** Sin recursos de Ordenex. Sin literales nuevos de país o moneda en código de
  producción: «Costa Rica» y `sinpe*` solo aparecen en la siembra y los comentarios de los tests.
- [x] **Trato tú en los textos nuevos.** Lo cumplen la descripción, el aviso de R199, el pie y las notas. El
  voseo de sin zona y de los toasts es de antes; queda fuera, para SLT-134 «Textos de pantalla de cierres en
  tú, con guardia».
- [x] **Tests adaptados sin perder lo que vigilaban, y sin aserciones contra la función que genera el texto.**
  Los esperados de la cola y del diálogo van en literal. Los negativos buscan textos que solo existirían si
  vuelve lo retirado: «por devoluciones a origen», «Comprobante del cierre de», `\bCentral debe\b`.
- [x] **Guardia `cascada-central-en-las-dos-pantallas`.** El umbral `> 2` pasa a un censo explícito con
  `toEqual` de los dos comprobantes ajenos que siguen montados. Es más estricto que antes. La contraprueba del
  extractor está en impl y la guardia está en verde. La parte de la guardia que vigila la cascada en
  `CierreBodegaFacturaResumen` no se tocó.
- [x] **E2E en local, con constancia.** Según `progress/impl_SLT-106.md:234-237`, en una base nueva:
  - `cierre-bodega-satelite`, `ajuste-pago-mensajero-cierre` y `tarifas-activacion`: 15 passed;
  - con `cierres-rediseno` además: 27 passed;
  - 0 flaky.
  `dos-empresas-humo` no se corrió (menor 2).

## Desvíos declarados (juicio)

- **`PestanaConsolidar` aparte y `ColaComun<P>` genérica**, en vez de ensanchar `PestanaCola`: **correcto**.
  Así los módulos de mensajeros y central no tienen que aceptar ids que nunca reciben, y el tipado es más
  estricto que el del design.
  - El coste es un cast en `components/private/cierres/cola/ColaCierres.tsx:218`
    (`props.onPestana as (id: string) => void`), acotado a lo que devuelve `Tabs`.
  - `ColaCierresBodegaProps` fija `rol: "central"`, como pide el design.
  - Los otros usos siguen igual: typecheck en verde, y `ColaCierres.test.tsx` y `ColaCierresBodega.test.tsx`
    pasan con un solo cambio de anotación de tipo y ninguna aserción tocada.
- **`lib/types/cierre-bodega.ts` fuera de la lista**: **correcto y mínimo**. Es un alias de tipo (Lite → Cola).
  La acción ya devolvía la fila completa del servicio, así que no cambia nada en tiempo de ejecución ni en
  `lib/actions/`.
- **`keepMounted` en «Solicitados»**: **correcto**. Conserva lo que hacía el `PanelConmutado`: no pierde su
  página y se revalida tras solicitar (SL-44, cubierto en `ConsolidacionBodegaRefresco.test.tsx:118`).
  - «A consolidar» se desmonta al cambiar de pestaña, pero su página y sus filtros viven en el módulo, así
    que no se pierden.
- **Prop `totalNetoAgregado` quitada del módulo**: **correcto**. R204 dice que deja de pintarse y sigue en el
  contrato del servicio, que la conserva. `page.tsx` ya no la pasa.

## Hallazgos

1. **menor — R190 y R191 sin test del comportamiento del módulo.** Dos cláusulas no tienen un test que las
   compruebe en `ConsolidacionBodegaModule`:
   - «al cambiar de pestaña se conservan los filtros y la página de A consolidar» (R190);
   - «cambiar un filtro devuelve A consolidar a la página 1» (R191).
   Hoy se cumplen por construcción: el estado vive en `ConsolidacionBodegaModule.tsx:244-252` y
   `aplicarFiltros` hace `setPage(1)`, igual que antes. Pero el paso de `PanelConmutado` a `TabsContent`
   (que desmonta) es justo el cambio que lo podría romper. Recomendado: un test en `ConsolidacionBodegaRefresco`
   que ponga la página 2, vaya a «Solicitados», vuelva y siga en la página 2.
2. **menor — `findMensajerosConCierreSinResolver` sin integración con dos empresas**
   (`lib/repositories/CierreBodegaRepository.ts:438`). `docs/checkpoints-proyecto.md > Datos y seguridad`
   pide un test de integración con dos empresas para cada query nueva. Lo que hay:
   - la query hereda la extensión y la RLS de `cierre_dia`, que `aislamiento-cierres.test.ts` cubre;
   - filtra por una zona, que pertenece a una sola empresa;
   - el test nuevo prueba dos zonas, no dos empresas.
   No se corrió `e2e/dos-empresas-humo.spec.ts`. El riesgo es bajo; recomendado correrlo, o dejar constancia,
   antes del PR a prod.
3. **menor — T5.1 sin marcar** (`specs/SLT-106-satelite-a-consolidar-cola/tasks.md:161`). Es el
   `./init.sh` del leader, y lo está corriendo ahora. T6.1 es posterior al merge por diseño.
4. **menor — el tamaño del PR va 20 líneas por encima de la cifra que aceptó Carlos.** El gate mide 2 676; la
   marca de `progress/features/SLT-106.md:26` dice 2 656. La diferencia es el arreglo de la guardia
   `cascada-central`, y el gate ya lo reconoce como aceptado. Basta actualizar la cifra al cerrar.
5. **menor — proceso.** La bitácora (`progress/impl_SLT-106.md:119`) dice que se usó `git stash` para comparar
   los rojos con y sin el cambio. El stash es compartido entre worktrees y la regla es no usarlo. No afecta al
   código.

No hay hallazgos bloqueantes.

## Veredicto

**OK**, con una condición: que el `./init.sh` del leader (T5.1) termine con `INIT_EXIT=0` antes de abrir el PR.
