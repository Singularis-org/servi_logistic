# Review SLT-102 «Cola de cierres única: mensajeros (central y satélite)»

- Rama `feature/SLT-102-cola-cierres-mensajeros`, HEAD revisado `efe2c3c5`, diff `origin/dev...HEAD`
  (54 archivos, +4305/-450).
- Ruta completa (complexity high, pantalla de dinero): correcta.
- Revisado el 2026-11-10 con Grep/Read. No usé el grafo: el índice de este worktree no tiene el código
  nuevo.

## Verificación ejecutada por el reviewer

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` (8 GB) | `TSC_EXIT=0` |
| `eslint` de los .ts/.tsx añadidos o modificados | `LINT_EXIT=0` |
| `vitest run` de los 22 tests del diff + `contadores-cabecera` + `rollup-guards` (base `slt102_t1`) | 24 archivos, 361 passed |
| `vitest run` integración `cierres-cola-senales-sql-real` (verbose) | 5 passed. No se saltó: corrió contra Postgres |
| `pnpm run test:guardias` | 4 failed, todos en `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json`: no es un hallazgo |
| `node scripts/tamano-pr.mjs` | 49/40 archivos, 3327/1000 líneas, con aceptación humana presente |
| `git diff origin/dev...HEAD -- db/ lib/actions/` | vacío (R72) |
| grep `Number(`, `parseFloat`, `toFixed`, `₡`, `Costa Rica`, `SINPE` en las líneas añadidas a `app/ components/ lib/` | ningún literal de código; un `₡` en un comentario (`cola-cierres-labels.ts:45`) |

Siguiendo la instrucción, no levanté servidor ni corrí E2E. Las mutaciones las verifiqué leyendo el
código, sin ejecutarlas (ver punto 3).

## Checklist

### CHECKPOINTS.md
- [x] Ruta completa respetada.
- [x] `requirements.md` en EARS y numerado. `design.md` con 6 alternativas descartadas y su porqué.
- [ ] `tasks.md`: T0-T6 marcadas `[x]`. **T7.1 y T7.2 sin marcar** (ver hallazgo 6).
- [x] `design.md > ## Lo que ya existe` presente y con contenido. El diff no recrea nada de la lista:
  reutiliza `DataTable`, `Tabs`, `FiltrosCierresBarra`, `DescargarCierresButton`, `Pagination`,
  `RegistrarPagoMensajeroDialog`, `money()` y los textos y notas de los badges. `EstadoCierreBadge`
  cambia de color por la decisión F12 de Carlos.
- [x] Tamaño: por encima del máximo, con `<!-- tamano-pr-aceptado: … -->` en
  `progress/features/SLT-102.md:35` (ver hallazgo 7).
- [x] Trazabilidad: cada R tiene al menos un test real (tabla abajo). El mapa R → test está en
  `impl_SLT-102.md`.
- [x] Typecheck y lint en verde.
- [x] Flujo crítico «Cierres de día y su revisión»: E2E S4 en `cierres-rediseno.spec.ts` y 10 specs
  adaptados. `--project=dinero` dos veces seguidas en verde, según `impl_SLT-102.md:470-476`.
- [x] Sin dependencias nuevas, sin secretos y sin configuración hardcodeada.
- [x] `./init.sh` en verde según el implementer (`impl_SLT-102.md:497`, `INIT_EXIT=0`). No lo repetí.

### docs/checkpoints-proyecto.md
- [x] Typecheck y lint.
- [ ] **Aislamiento entre empresas: `e2e/dos-empresas-humo.spec.ts` sin constancia de haberse corrido**
  (hallazgo 1).
- [x] Query nueva sobre datos de negocio filtrada por `organizacion_id`, con test de integración de dos
  empresas (punto 3).
- [x] Sin tablas ni migraciones nuevas, sin recursos de Ordenex y sin `console.log`.
- [x] Capas: SQL en `lib/repositories/_shared/`, agregación en el servicio, y la UI solo pinta.
- [x] País y moneda solo por `money()` y `fechaHora`.
- [x] Permisos: «Registrar pago» solo se ofrece con `puedeRegistrarPago` y rol central. La Server
  Action de hoy sigue siendo la defensa y no se tocó.

### docs/perfil-agentes.md > reviewer
- [x] Sin query de negocio sin `organizacion_id`, sin tabla sin RLS y sin migración.
- [x] Sin literales de país o moneda en código nuevo.
- [x] Sin dependencias nuevas.
- [x] Los comentarios explican el porqué.
- [ ] Constancia de E2E afectados en local: `dinero` y `wallet-iva-aparte-sl39` sí; `dos-empresas-humo`
  no (hallazgo 1).

## Los 7 puntos del leader

1. **Trazabilidad.** Todos los R tienen test (tabla abajo).
   - La enmienda de R100 la fija un literal contrato:
     `CierresAdminFiltros.test.tsx:244` `toEqual(["Fecha de solicitud","Mensajero","Estado"])`, más el
     caso `sinBodega` de `FiltrosCierresBarraEstado.test.tsx`.
   - La pastilla F12 está en `ColaCierres.test.tsx:343-375`, con clases por estado. Comprobé que los
     tokens valen los hex del canvas en `app/globals.css:195-199,342-347`.
2. **Fidelidad al canvas.** Recorrí F1-F13 contra `ColaCierres.dc.html:137-162` y la plantilla
   (líneas 14-93):
   - F1-F13 están implementados.
   - Coinciden con el canvas: botones primarios `#111111` (`--primary`), Señales en
     `text-xs text-warning-strong` (12 px, `#92400e`), folio mono de 13 px, fecha gris y pie con
     `border-t`.
   - Diferencias fuera de la tabla de desviaciones: hallazgos 4 y 5.
3. **Aislamiento en `contarSenalesPorCierre`.**
   - El `WHERE` va por ids y por `organizacion_id = NULLIF(current_setting('app.organizacion_id', true), '')`.
     Es el mismo patrón que `detalle-modelo-nuevo.ts:103` y `TopeIntentosRepository.ts:27`.
   - El `EXISTS` de ajustes también ata la empresa.
   - El test de integración pide `[A1, A2, B1]`, con B1 de otra empresa, y afirma con `toEqual` exacto
     sobre la lista completa. Si se quitara el filtro de empresa, B1 entraría y el `toEqual` se pondría
     rojo. Si se quitara `IS NULL`, A1 daría 2 incidentes. Las dos mutaciones las mata el test, por
     construcción.
   - Con lista vacía no consulta nada.
4. **La interfaz opcional y el composition root.**
   - `CierresAdminRepository.contarSenalesPorCierre` es un método de clase y `lib/actions/cierres-admin.ts:110-113`
     construye `new CierresAdminService(new CierresAdminRepository(prisma, …))`: la action lo pasa de
     verdad.
   - Lo vigilan `cierres-admin-senales-cola.test.ts:175-185` y, de punta a punta, el E2E S4, que pinta
     «1 incidente sin indemnizar · 1 pago ajustado · 1 vuelve a bodega» con la app real.
   - Si el método falta: `senales === null`, la fila no lleva `senalesCola` (test en `:163-171`) y
     `senalesDe` no pinta nada. La fila no afirma «0».
5. **Excepción `montajesPrevistos`:** abre la puerta sin control (hallazgo 2).
6. **Tests débiles.**
   - Sin `if (!x) return;`.
   - El literal del importe va escrito a mano (`"₡285.275"`, `"Pendiente ₡47.500"`), no contra
     `money()`.
   - Los negativos `not.toContain("B1")` y `not.toContain("A3")` buscan nombres deterministas.
   - Hay dos negativos débiles: hallazgos 3 y 8.
7. **Importes.** Las celdas pasan el string del servidor por `money()`. `pagoEntregadoDe` y
   `accionesFilaDe` comparan por texto (`hayPendienteDeLiquidar`). No hay aritmética ni `Number` en
   `cola/` ni en el módulo.

## Trazabilidad (R → test verificado)

| R | Test |
|---|---|
| R32 | `ColaCierres.test.tsx` (descripción, tablist, barra, tabla y pie); `CierresAdminModule.test.tsx` «R106/R107: la central…» y «la satélite…» |
| R33 | `cola-cierres-vista.test.ts` (`columnasCola`, `accionesFilaDe`); `ColaCierres.test.tsx:183` (cabeceras y celdas exactas); E2E S4 |
| R34 | `ColaCierres.test.tsx:265`; `CierresAdminModule.test.tsx` «R34: la satélite…» y «…sin permiso…»; E2E S4 satélite |
| R35 | `cola-cierres-vista.test.ts` (`senalesDe`); `ColaCierres.test.tsx:214`; `CierresAdminRetieneReprogramadas.test.tsx` |
| R36 | `ColaCierres.test.tsx:278`; E2E S4 central y los specs adaptados |
| R37 | `CierresAdminPage.test.tsx`; `CierresTabs.tsx` fuera del diff |
| R70/R109 | `cierres-cola-senales-sql-real.test.ts` (corrido: 5 passed); `cierres-admin-senales-cola.test.ts` |
| R71 | `liquidacion-money-safe.test.ts` (censo con `cola/`) y el grep de este informe |
| R72 | `db/` y `lib/actions/` fuera del diff |
| R99 | `ColaCierres.test.tsx:133,144`; `CierresAdminModule.test.tsx` «conteos… del `total`» y «conserva el filtro y la página»; `contadores-cabecera` |
| R100 (enmendado) | `CierresAdminFiltros.test.tsx:220-249`; `FiltrosCierresBarraEstado.test.tsx` (`sinBodega`) |
| R101 | `ColaCierres.test.tsx:183,209,343-375`; E2E S4 |
| R102 | `cola-cierres-vista.test.ts`; `ColaCierres.test.tsx:214,224` |
| R103 | `cola-cierres-vista.test.ts` (`pagoEntregadoDe`); `ColaCierres.test.tsx:232,252`; `CierresAdminModule.test.tsx` «R103…» (dos casos); E2E S4 |
| R104 | `ColaCierres.test.tsx:308-328`; `ColasPaginacion.test.tsx` |
| R105 | `ColaCierres.test.tsx:278,299`; `CierresAdminModule.test.tsx` (Destrabar); E2E `reglas-bloqueos-cierre` |
| R106 | `ColaCierres.test.tsx:330`; `CierresAdminModule.test.tsx` (PA3); `CierresAdminPage.test.tsx` |
| R107 | `CierresAdminModule.test.tsx` (sin comprobantes; sin zona, aviso). La mitad de bodega y `/cierre-dia` están fuera del diff |
| R108 | `ColaCierres.test.tsx:197` (celdas exactas: la fila no tiene más contenido); `CierresAdminModule.test.tsx:343,370`; E2E `tarifas-activacion` |
| R110 | `cola-cierres-vista.test.ts` (singular, plural y orden); E2E S4 |

## Hallazgos

1. **BLOQUEANTE: falta la constancia de `e2e/dos-empresas-humo.spec.ts`.**
   - Qué exige la regla: `docs/checkpoints-proyecto.md > Flujos críticos > Aislamiento entre
     empresas` pide correrlo a toda feature que toque datos de negocio.
   - Por qué aplica: el diff añade una lectura SQL nueva por empresa
     (`lib/repositories/_shared/senales-cola-cierre.ts:31-44`) que depende de `app.organizacion_id`. El
     humo recorre `/cierres-admin` (`lib/auth/menu-visibility.ts:635`) y vigila fugas de marcadores y
     `EmpresaNoResuelta`.
   - Qué falta: `impl_SLT-102.md:470-476` solo registra `dinero` y `wallet-iva-aparte-sl39`, y el CI no
     corre E2E en el PR a `dev`.
   - Para cerrarlo: correr `pnpm exec playwright test --project=aislamiento e2e/dos-empresas-humo.spec.ts`
     en base desechable y pegar la salida en `impl_SLT-102.md`.
2. **Mayor: la excepción `montajesPrevistos` no tiene control.**
   - Dónde: `tests/unit/descarga/cobertura-tablas.guardia.test.ts:587-595`, `censo-tablas.ts:102`.
   - El problema: cualquier tabla del censo puede declarar `montajesPrevistos: ["x"]` y saltarse la
     regla de «un solo montaje». No hay lista cerrada de rutas, no se comprueba el formato
     `SLT-n «título»` y nada obliga a retirarlo cuando la segunda pantalla monte la tabla: con 2
     montajes reales y la lista vieja, sigue en verde. La deuda aceptada dice «el reviewer lo
     verifica», pero eso no es mecánico.
   - Para cerrarlo:
     - limitar el campo a una lista explícita (hoy solo `components/private/cierres/cola/ColaCierres.tsx`);
     - exigir `/^SLT-\d+ «.+»$/`;
     - fallar si `montajes.length > 1` y `montajesPrevistos` sigue presente.
3. **Menor: un negativo que puede pasar antes de que abra el diálogo.**
   - Dónde: `e2e/cierres-rediseno.spec.ts:692`, `expect(pago.getByRole("button", { name: "Ahora no" })).toHaveCount(0)`.
   - El problema: se comprueba sin haber esperado a que el diálogo sea visible. Si el diálogo tarda,
     el negativo pasa en vacío.
   - Para cerrarlo: anteponer `await expect(pago).toBeVisible()`. El test de componente
     (`CierresAdminModule.test.tsx:1813`) sí localiza el diálogo antes.
4. **Menor (fidelidad): la paginación en el pie de Pendientes.** El canvas solo pone el texto del pie
   en Pendientes (`ColaCierres.dc.html:162`). La pantalla añade `Pagination` (`CierresAdminModule.tsx:1263-1269`).
   R106 lo pide, pero falta en la tabla de desviaciones de `design.md`, que solo lista el «Mostrando…»
   de Resueltos. Hay que añadir la fila.
5. **Menor (fidelidad y D20): «vuelven a bodega» con dos cifras.** La cola cuenta gestiones
   («6 vuelven a bodega»). La franja del detalle cuenta también las barridas del corte
   («N paquetes vuelven a bodega», `detalle-cierre-labels.ts:47`). Es la misma cifra con dos valores
   en pantallas que se abren una desde la otra. Ya está en «A Preview» de la ficha. Si Carlos lo
   acepta, debe ir a la tabla de desviaciones con su motivo.
6. **Menor: T7.1 y T7.2 sin marcar en `tasks.md:157-162`.** La evidencia de T7.1 existe (`INIT_EXIT=0`,
   `db/` vacío, grep vacío en `cola/`) y la confirmo arriba: falta marcarla. T7.2 (Preview con
   Carlos) es posterior a esta review por diseño del proceso. No la cuento como bloqueante, pero el
   leader debe cerrarla antes de `done`.
7. **Menor: tamaño real por encima de lo aceptado.** La aceptación de `progress/features/SLT-102.md:35`
   cita «~49 archivos / ~2 150 líneas». `tamano-pr.mjs` mide 49 archivos y **3 327** líneas. Conviene
   decírselo a Carlos al pedir el merge.
8. **Menor: un negativo de R108 contra un texto exacto.** `CierresAdminModule.test.tsx:343`
   `queryByText("Bodega central · GAM")` pasaría en vacío si el destino se formateara de otra manera.
   R108 queda cubierto de forma fuerte por las celdas exactas de `ColaCierres.test.tsx:197`, así que no
   bloquea.
9. **Menor (doc): fila obsoleta en `design.md:96`.** Sigue diciendo «solo si PA1 = sí» para las tres
   señales. PA1 fue «sí» y ahora se pintan igual que el canvas, así que la fila ya no es una
   desviación.

## Veredicto

**RECHAZADO**: 1 bloqueante, 1 mayor y 7 menores.

El código, la trazabilidad, el aislamiento del SQL y el cableado del composition root están bien. El
único bloqueante es de evidencia: correr `dos-empresas-humo` y anotarlo. Recomiendo resolver en la
misma vuelta el mayor (cerrar `montajesPrevistos`) y los menores 3, 4, 6 y 9, que son de una línea
cada uno.

## Vuelta 2 (acotada a 31ffb651..a7c546c5)

Diff revisado: 6 archivos (`fdc0c9eb` arreglos y `a7c546c5` marca de tamaño). Cada hallazgo se
comprobó en el código, no en la bitácora.

| Comando | Resultado |
|---|---|
| `vitest run` de `cobertura-tablas`, `contadores-cabecera` y `rollup-guards` (base `slt102_t1`) | 3 archivos, 34 passed |
| `pnpm run typecheck` | `TSC_EXIT=0` |
| `eslint` de los 3 archivos de test y E2E tocados | `LINT_EXIT=0` |

No corrí los E2E: siguen la instrucción del leader y los repite el CI.

| # | Hallazgo de la vuelta 1 | Estado |
|---|---|---|
| 1 | BLOQUEANTE: falta `dos-empresas-humo` | **Cerrado.** `impl_SLT-102.md:501-507` registra la corrida: base desechable `slt102_e2e` recreada, `--project=aislamiento`, `18 passed`, `PW_EXIT=0`. La constancia es la que pide la regla. |
| 2 | Mayor: `montajesPrevistos` sin control | **Cerrado.** `problemasMontajesPrevistos` (en `cobertura-tablas.guardia.test.ts`) se aplica al censo real («el censo real cumple»). Cubre lista cerrada de rutas (`RUTAS_CON_MONTAJES_PREVISTOS`, solo `ColaCierres.tsx`), formato `/^SLT-\d+ «.+»$/`, lista vacía y caducidad (más de 1 montaje real es rojo). Las tres mutaciones (a), (b) y (c) prueban la función sobre copias del censo y cada una espera exactamente 1 problema con su texto: falsables. |
| 3 | Menor: negativo «Ahora no» antes del diálogo | **Cerrado.** `e2e/cierres-rediseno.spec.ts`: ahora espera `pago` visible y su botón «Registrar pago» antes del negativo. |
| 4 | Menor: paginación del pie de Pendientes fuera de la tabla de desviaciones | **Cerrado.** Fila añadida a `design.md > Desviaciones`, con su motivo (R106). |
| 5 | Menor: «vuelven a bodega» con dos cifras (cola y franja) | **Abierto, para Preview.** No cambia en este rango; sigue en «A Preview» de la ficha. Si Carlos lo acepta, va a la tabla de desviaciones. No bloquea. |
| 6 | Menor: T7.1 y T7.2 sin marcar | **Fuera de alcance por decisión del leader:** T7.1 la cierra él al abrir el PR y T7.2 es el Preview. |
| 7 | Menor: tamaño real por encima del aceptado | **Cerrado.** Nueva marca en `progress/features/SLT-102.md` con ~3 327 líneas, aceptada por Carlos. |
| 8 | Menor: negativo de R108 contra un texto exacto | **Abierto, menor.** `CierresAdminModule.test.tsx:343` no cambió. En su lugar se reforzó el E2E `tarifas-activacion`: cabeceras exactas, 8 celdas por fila y `getByText(/ingreso/i)` con conteo 0. Con eso y las celdas exactas de `ColaCierres.test.tsx:197`, R108 queda bien cubierto. No bloquea. |
| 9 | Menor: fila obsoleta en `design.md:96` | **Cerrado.** Pasa a «Lo que se pinta como el canvas» como F14, y sale de las desviaciones. |

Regresiones: ninguna. El cambio en `tarifas-activacion` sustituye un negativo por afirmaciones
positivas más fuertes.

### Veredicto vuelta 2

**OK con menores.** 0 bloqueantes y 0 mayores. Siguen abiertos dos menores: el 5, que espera la
decisión de Carlos en Preview, y el 8, que es opcional.
