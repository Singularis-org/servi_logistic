# Review SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» — vuelta 1

> Reviewer, 2026-11-12. Ruta completa. Diff `origin/dev...HEAD` (hasta `879778eb`). Base desechable
> `slt107_solicitados`. Grafo no consultado: Grep/Read sobre el worktree.

## Checklist

- [x] **Ruta:** completa (permiso nuevo y pantalla de dinero). Corresponde.
- [x] **Trazabilidad R280-R296 y R del madre:** cada R tiene un test real que la afirma (ver tabla).
- [ ] **Tasks:** T0-T4 en `[x]`. T5.1-T5.3 sin marcar: es el gate que el leader está corriendo. T6
  es el Preview con Carlos, después del merge. Ver P1.
- [x] **Tamaño:** `node scripts/tamano-pr.mjs`: 40/40 archivos, 2 983/1 000 líneas, con la línea
  `tamano-pr-aceptado` (valor real, `879778eb`).
- [x] **`design.md > ## Lo que ya existe`:** presente y con contenido. El diff no vuelve a crear nada de
  esa lista: reutiliza `ocultarFulfillmentSiNoCentral`, `vistaBodegaDesdeAdmin`, `ColaCierres`,
  `CifrasCierre`, `sumarMontos` e `inicioDeUltimosNDiasEnUtc`.
- [x] **Typecheck:** `npx tsc --noEmit` `TC_EXIT=0`, 0 errores.
- [x] **Lint** de los 16 archivos de producción tocados: `LINT_EXIT=0`.
- [x] **Tests relacionados:** 24 archivos y 437 tests en verde. Entran los de unidad y componentes
  tocados, `CierresBodegaAdminDetalleUnico`, `DeepLink`, `Refresco` y `ColaCierresBodega` (estas
  cuatro sin cambios en el diff, R295 y R296) y `liquidacion-money-safe`.
- [x] **Guardias de T0.2:** `contadores-cabecera`, `cascada-central-en-las-dos-pantallas`,
  `cierre-bodega-vocabulario` y `cierres-descarga-detallada-puerta`: 4 archivos y 58 tests en verde.
- [x] **Integración nueva** (`satelite-cierre-bodega-lectura.int.test.ts`, Postgres real): 11 de 11
  *passed*, 0 *skipped*. La siembra se cuenta antes de afirmar nada.
- [x] **Seguridad: zona en el `WHERE`.** Reproduje la mutación M1: quité `zonaId` del `where` de la
  cabecera (`CierresBodegaAdminRepository.ts:488`). Salen en rojo «R281: S1 no lee CB5…» (integración)
  y «SLT-107 R280: alcance de zona -> `where` exacto» (repositorio). Restaurada; `git status` limpio.
- [x] **Seguridad: empresa.** Reproduje la mutación de la empresa: el repositorio de
  `buildCierresBodegaAdminService` recibió un `PrismaClient` con `PrismaPg`, sin la extensión de
  empresa. Sale en rojo «empresa cruzada» y los otros 10 casos pasan. Restaurada; `git status` limpio.
  (Un primer intento con un `PrismaClient` sin adapter rompía por error INTERNAL y no por aserción, así
  que lo descarté como prueba.)
- [x] **Campos de la central:** el servicio pasa cada gestión por `ocultarFulfillmentSiNoCentral`
  (`CierresBodegaAdminService.ts:363`), con `fulfillmentCargadoAt` incluido, y `desmarcable: false`
  (`:505`). El criterio es «no es acceso total», que falla cerrado. `totalesIngresoEmpresa` no lleva
  fulfillment (R31 de `ingreso-empresa.ts`). La integración lo afirma sobre la base y la central sí ve
  `fulfillmentCargadoAt` y `tarifa.fulfillment` como control (R284).
- [x] **`alcance` obligatorio:** es el tercer parámetro, sin `?` (`ICierresBodegaAdminRepository.ts`).
  Las 8 llamadas adaptadas pasan `{ lectura: "toda_la_empresa" }`, que es exactamente lo que leían antes
  (central, `findUnique` por id). Ninguna queda trivial ni pierde lo que vigilaba. Los dos dobles pasan
  de `findUnique` a `findFirst` sin cambiar el valor devuelto.
- [x] **`audiencia` en el detalle común:** la prop es obligatoria (`"central" | "satelite"`), así que no
  hay default implícito. Solo `"central"` pinta fulfillment (`quienMiraEsCentral`). La satélite no
  recibe `conciliacion`. La central conserva sus suites sin editar (R295). Ver M1.
- [x] **Dinero sin floats (R71, R72):** las sumas del servidor usan `sumarMontos` y `Prisma.Decimal`.
  La pantalla pinta strings y no hace aritmética. No hay `parseFloat`, `Number(`, `toFixed` ni
  `Math.` en el código nuevo de cliente. El diff no toca `db/` y en `lib/actions/` solo cambia el
  builder (T5.2 verificada a mano).
- [x] **Literales y trato:** los textos nuevos van en «tú» («No tienes permiso…», «Inténtalo de
  nuevo», «Aún no has solicitado…»). No hay Costa Rica, colones, SINPE ni Ordenex en el código nuevo.
  La zona horaria sale de `reglasPais`.
- [x] **Capas y permisos:** la autorización está en el servicio. La zona se lee del usuario en la base
  (`findUsuarioZonaId`), nunca de la petición. La consulta está en el repositorio y el composition root
  inyecta `OrdenRepository` (`lib/actions/cierre-bodega.ts:88`); el caso por la Server Action solo con
  `getActor` lo prueba.
- [x] **E2E afectados con constancia:** `cierre-bodega-satelite.spec.ts` (6/6) y
  `cierres-rediseno.spec.ts` (16/16) corrieron en local (bitácora, tanda 3), y la mutación E1 los puso
  en rojo. `dos-empresas-humo.spec.ts` no consta: ver P1.

## Trazabilidad verificada

| R | Test que la afirma |
|---|---|
| R280 | integración «R280/R283» (S1 lee CB1 por la Server Action); repositorio «where exacto»; mutación M1 en rojo |
| R281 | integración «R281» (CB5, inexistente, S0); servicio `it.each` «sin zona» y «sin `zonaDelUsuario`»; servicio «sin firmar» |
| R282 | servicio «R282: mensajero -> forbidden sin leer su zona ni el repositorio» |
| R283 (herencia de SLT-110) | servicio «los seis campos… `desmarcable` false»; integración sobre la base (`fulfillmentCargadoAt` en null; CB2 desmarcable solo para la central) |
| R284 (herencia de SLT-111) | servicio «mismas llamadas al repositorio»; integración `normal(sat) == normal(central)` y `porcentajesReparto` iguales |
| R285 | servicio e integración: aprobar y rechazar → `forbidden` (ver M3) |
| R286 / R288 / R289 | `cola-cierres-vista.test.ts`; `ColaCierresConsolidar.test.tsx` (literales, «—», signo, región, carga, error, vacío, pie, paginación) |
| R287 / R68 | `consolidacion-cola-satelite.test.ts` con literales (borde de 30 y 31 días, signo, `> 0`); integración con S1, S2 y S0 |
| D-T03 (corregido hoy entra en los 30 días) | unit «T0.3 (a)»; integración «T0.3 (a)» con `corregirConciliacion` real dentro de una transacción revertida |
| R290 | `ConsolidacionBodegaRefresco.test.tsx` (c), de «Solicitados 25» a «Solicitados 13»; E2E satélite |
| R291 (deuda R190/R191 de SLT-106) | `ConsolidacionBodegaRefresco.test.tsx` (a) filtro → las dos pestañas a la página 1 con el filtro; (b) cambiar de pestaña conserva página y filtro; mutación V2 en rojo |
| R292 / R293 / R294 | `ConsolidacionBodegaRefresco.test.tsx` (d), (e) y (f) |
| R295 / R296 | suites de la central sin editar y en verde; `cola-cierres-vista.test.ts` «R296» |
| R32, R49, R50, R51, R52, R71, R72, R77 | según `tasks.md > Trazabilidad`; todas existen y están en verde; R77 por E2E con E1 en rojo |

## Hallazgos

- **M1 — menor.** `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx:543`: el detalle de
  la central se monta con `audiencia="central"` literal. Antes era
  `quienMiraEsCentral={audiencia === "admin"}`, derivado de `esAccesoTotal` en `page.tsx:208`, y
  la ficha 431 pedía expresamente no escribir un literal. Hoy no hay fuga, por dos razones: el módulo
  solo se monta con acceso total y el servidor anula el fulfillment (R283). Aun así, si el módulo se
  monta con su default `"satelite"`, ahora el detalle diría «central». Sugerencia:
  `audiencia={audiencia === "admin" ? "central" : "satelite"}`.
- **M2 — menor (desvío de T3.3).** `ConsolidacionBodegaModule.tsx:129` `leerSolicitados` duplica, salvo
  `filtros`, a `leerPagina` de `CierresBodegaSolicitadosLista.tsx:68` (seis líneas). No deja código
  muerto: la lista se sigue montando para la satélite sin zona (`ConsolidacionBodegaModule.tsx:538`,
  R202), con una clave SWR distinta y sin colisión. El desvío está anotado en `tasks.md`. Se resuelve
  cuando SLT-115 «Retirar los componentes de cierre sustituidos» quite la lista.
- **M3 — menor.** R285 dice que las acciones de conciliación (marcar recibido, corregir, desmarcar)
  siguen en `forbidden` para la satélite, y en esta ficha solo se vuelven a probar aprobar y rechazar.
  El código de la conciliación no cambia en el diff y lo cubren sus suites anteriores (ficha 431).
- **M4 — menor.** La integración prueba la empresa cruzada con el maestro, no con una satélite de A que
  pida CB7 de B. Esa satélite queda cubierta por el filtro de zona (las zonas son por empresa), pero no
  hay un caso explícito.
- **P1 — pendiente del leader, no es un hallazgo del código.** T5.1-T5.3 sin `[x]`: el gate se está
  corriendo. `docs/checkpoints-proyecto.md > Flujos críticos` pide correr `e2e/dos-empresas-humo.spec.ts`
  cuando una feature toca consultas de negocio, y aquí cambia la del detalle de bodega. Tiene que
  constar en T5.3, con los dos E2E de cierres, antes del aviso «listo para mergear».

## Veredicto

**OK.** No hay bloqueantes. Antes de mergear, el leader cierra P1 (T5 en `[x]`, gate verde y
`dos-empresas-humo` en T5.3). M1-M4 son menores y no frenan el PR #144.
