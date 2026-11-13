# Review — SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega»

Vuelta 1 · 2026-11-13 · reviewer · rama `feature/SLT-141-excel-hojas-cierre-bodega`, HEAD `cd32557f`,
diff `origin/dev...HEAD`. Ruta completa (fullstack / medium). MCP del grafo no usado: Grep/Read y
`git diff` sobre el worktree.

## Veredicto: CAMBIOS (RECHAZADO)

El código y los tests están bien. Bloquea solo el cierre: falta T6 y no consta que se hayan corrido en
local los E2E de dinero que cubren las pantallas de bodega tocadas.

## Verificación ejecutada por el reviewer

- `pnpm run typecheck`: TC=0.
- `eslint` sobre los `.ts/.tsx` del diff: 0 errores. Hay 1 aviso, ya existente en dev
  (`deudas-d39-d40-modelo-nuevo.test.ts:205 _soloDelLibro`, línea no tocada).
- `vitest run` contra la base desechable `slt141_wt` (`DATABASE_URL` exportada, nunca la de desarrollo):
  los 7 tests nuevos, `deudas-d39-d40-modelo-nuevo`, la guardia de frontera y los existentes de R384
  (`cierres-bodega-admin-service`, `cierre-desglose-tres-superficies`, `cierres-bodega-descarga-columnas`,
  `CierresDescargaNiveles`, `CierresDescargaColumnas`). Resultado: **14 archivos, 176 tests passed, 0
  skipped**, VT_EXIT=0. La integración contra Postgres corrió de verdad: no hubo `describe.skip`.
- `node scripts/tamano-pr.mjs`: 27/40 archivos y 3 324/1 000 líneas. Hay línea `tamano-pr-aceptado`,
  así que sale aviso y no rojo.
- No apliqué mutaciones de código: las controla el leader. Me apoyo en las de la bitácora (M1-M9) y
  en que las aserciones son literales.

## Checklist

- [x] **Ruta:** completa, adecuada (dinero de solo lectura, permisos por audiencia).
- [x] **Spec:** `requirements.md` en EARS (R384-R389), `design.md` con 5 alternativas descartadas y `## Lo
  que ya existe` no vacía. El diff no re-crea nada de esa lista. Reusa de SLT-140 `cifrasDelCierre`,
  `derivarPagoEntregadoCierre`, `COLUMNAS_POR_TIENDA`/`filaPorTienda`, los nombres de hoja y
  `obtenerFilasConColumnas`.
- [ ] **Tasks:** T0-T5 marcadas `[x]`. **T6.1, T6.2 y T6.3 siguen `[ ]`** (ver B1).
- [x] **Tamaño:** pasa del máximo y lleva la línea `tamano-pr-aceptado`. La cifra aceptada se queda
  corta (ver m1).
- [x] **Trazabilidad:** cada R tiene al menos un test que existe, está verde y afirma contra literales
  (detalle abajo). Falta el mapa consolidado de T6.3 (B1).
- [x] **Typecheck / lint** verdes. El gate local está verde según el leader (INIT_EXIT=0), pero no está
  anotado en la bitácora (B1).
- [ ] **E2E de flujos críticos (cierres, dinero) en local:** `cierres-rediseno` sí (2×20). No hay
  constancia de `cierre-bodega-satelite` ni del grupo `dinero` entero (B1).
- [x] **Multi-empresa / RLS:** sin tablas ni migraciones. Las tres consultas nuevas usan el cliente con la
  empresa de la sesión, y el alcance de la satélite va en el `WHERE`
  (`cierreBodega: { zonaId }`, `CifrasBodegaLoteRepository.ts:44`), probado contra Postgres con BZ de
  señuelo.
- [x] **Dependencias:** ninguna nueva.
- [x] **Seguridad / config:** sin secretos ni valores de entorno en el código.
- [x] **Ordenex:** ninguna referencia.

## Puntos que pidió el leader

1. **Decisiones del leader, cumplidas.**
   - «Pago entregado»: `pagoEntregadoPorBodega` (`lib/services/cifras-bodega-descarga.ts:96-143`) suma
     `derivarPagoEntregadoCierre` por cierre del día con `Prisma.Decimal`, es decir (P + premios) −
     pendiente con la regla de la marca. Si algún día no está aprobado, devuelve `null`. Llama una
     sola vez a cada lectura para todo el lote, y la de la satélite solo con los aprobados que llevan
     la marca. Es la misma forma que `CierresAdminService.ts:1405-1408` de SLT-140.
   - Audiencia: `"admin"`/`"satelite"` en `columnasCierresBodegaModeloNuevoPara`, en
     `filaCierreBodegaModeloNuevo` y en las tres pantallas («Solicitados» fija `"satelite"`).
   - Los literales de (c) en `cierres-bodega-resumen-modelo-nuevo-service.test.ts:287-329` los
     recalculé a mano contra `derivarPendienteCierre`:
     - D2, sin marca: generado 5 000 − min(5 000, 2 000) = 3 000; pendiente 3 000 + 1 000 − 2 500 =
       1 500; entregado 6 000 − 1 500 = **4 500**.
     - D3, con marca: pendiente 4 000 + 500 − 1 000 − 1 200 = 2 300; entregado 4 500 − 2 300 =
       **2 200**.
     - Σ **6 700.00**; BY con D5 `solicitado` da `null`.

     Casan, y vienen con su cálculo en comentario: no están copiados de la salida. El caso D2
     distingue la variante sin premios (daría 3 500), que es la mutación M5 de la bitácora.
     También revisé B2 = 600.00 y B3 = 0.00 de la integración: casan.
2. **Literal `zona.n` 1 → 2 en `deudas-d39-d40-modelo-nuevo.test.ts:685`: es un coste fijo legítimo,
   no un contrato roto.**
   - El contrato del caso es «tres cierres no cuestan una sentencia por fila». Con 3 consolidaciones
     nuevas, una lectura por fila daría ≥ 4 (3 + 1 o 1 + 3); 2 sigue separando la regresión.
   - La segunda sentencia sobre `cierre_detail` es la `cierreDetail.findMany` única del lote (R385/R389).
   - `vacia.n` sigue en 0.
   - Inyectar la `CifrasBodegaLoteRepository` real en `servicioZona` es necesario: sin ella, el contrato
     «ruidosa si falta» lanzaría.
   - **R384 «ninguna lectura más» con solo viejos sigue probado.** En la central, contra Postgres:
     `cierres-bodega-cifras-lote-sql-real.test.ts:643-655` exige las 9 consultas de la línea base
     medida en T0.3 antes del cambio (constante literal, no derivada), el lote sin llamar y ninguna
     clave `cifrasModeloNuevo`. En la satélite, con dobles: `cierre-bodega-solicitados-…:153-162`
     (ni lote ni zona horaria).
3. **El cableado inyecta de verdad.**
   - `lib/actions/cierre-bodega.ts` construye `CierresBodegaAdminService` con 6 argumentos: el 5.º es
     `CifrasBodegaLoteRepository` y el 6.º `{ liquidaciones: LiquidacionPagoRepository, premios:
     PagoMensajeroMovimientoRepository }`, en el orden del constructor (`CierresBodegaAdminService.ts:96-104`).
   - `CierreBodegaService` recibe 5 argumentos (`undefined` para el reloj y la lectura en lote), sin
     pagos.
   - `cierre-bodega-cifras-cableado.test.ts` ejecuta las acciones sin servicio inyectado y afirma
     `toBeInstanceOf` y la aridad en cada posición.
   - Son los únicos `new` de producción de los dos servicios: solo hay otro en
     `scripts/demo-qa/receta.ts`, que no descarga.
4. **`ConCifrasBodegaEnOk` en `ICierreBodegaService.ts` en vez de `lib/types`: desvío aceptable.** Tiene
   precedente directo: `ConCifrasModeloNuevoEnOk` y `ConRechazosDeTiendaEnOk` viven en
   `lib/interfaces/services/ICierresAdminService.ts` y `lib/types/*` los importa. Así servicio y borde
   comparten un solo genérico, y el segundo parámetro tipa la satélite sin `pagoEntregado`. Está
   anotado en la bitácora. Ver m4.
5. **Tests que pasan sin comprobar nada: no encontré ninguno.**
   - Los `if (r.status !== "ok") return;` (`…resumen-modelo-nuevo-service.test.ts:263, 317`,
     `…solicitados-…:132`) van precedidos de `expect(r.status).toBe("ok")`, así que solo estrechan el
     tipo. La integración lanza si el estado no es `ok` y no tiene `return` temprano.
   - Los negativos son de ausencia de clave (`not.toHaveProperty("pagoEntregado")`, `"cifrasModeloNuevo"
     in r` → `false`) o de encabezado exacto, y van junto a listas literales de 26/25 encabezados. No
     dependen de una fecha ni de un valor casual.
   - Las configuraciones «de hoy» del test de componente (`COLUMNAS_*_HOY`, `FILA_*_BV`) son literales
     y no se importan del módulo bajo prueba.
   - La paridad lote ↔ detalle llama a `cifrasAgregadasBodega` en los dos lados, pero lo que prueba es
     la entrada (las gestiones que lee cada repositorio), y además el detalle se afirma contra
     literales (94 350 / 3 500 / 92 090 / partes). No es una aserción contra su propia fuente.

## Trazabilidad R → test (comprobada)

| R | Test (verde en esta revisión salvo el E2E, que tomo de T5) |
|---|---|
| R384 | `CierresBodegaResumenModeloNuevo.test.tsx` (a) ×3 · `cierres-bodega-resumen-modelo-nuevo-service.test.ts` (a) · `cierre-bodega-solicitados-…` «solo viejos» · `cierres-bodega-cifras-lote-sql-real.test.ts` «solo BV» (9 consultas) · existentes sin tocar |
| R385 | `cierres-bodega-modelo-nuevo-descarga.test.ts` (solo nuevos, mixto, ningún cierre en dos hojas) · componentes (b) · E2E SLT-141 (hojas en orden) |
| R386 | `cierres-bodega-modelo-nuevo-descarga.test.ts` (26/25) · `cierre-bodega-solicitados-…` (sin `pagoEntregado`) · integración «Solicitados» · componentes (b, c) |
| R387 | `cifras-cierre-bodega.test.ts` · integración (BN, B2/B3, paridad, sin escrituras) · descarga (celdas, signo) · E2E (números) |
| R388 | descarga (folio, fechas CR, vacíos, conteos) · servicio (b)(c) · integración (Gestiones, Pagos ajustados, Pago entregado) |
| R389 | integración (alcance en el WHERE con BZ; mismas consultas con 1 y 3) · `cierre-bodega-solicitados-…` (alcance `zona`) · `cierre-bodega-cifras-cableado.test.ts` |

## Hallazgos

### B1 — BLOQUEANTE · T6 sin hacer: falta constancia de los E2E de dinero y el cierre en la bitácora

- `tasks.md` tiene T6.1, T6.2 y T6.3 en `[ ]`. `CHECKPOINTS.md > Especificacion` exige todas en `[x]`, y
  `> Trazabilidad` exige el mapa `R → test` en `progress/impl_SLT-141.md`. Hoy hay mapas por tanda, pero
  no el consolidado «igual a `## Trazabilidad`» que pide T6.3.
- Que el gate esté verde (`INIT_EXIT=0`) no está escrito en la bitácora.
- **Lo que pesa: E2E en local.** El diff toca dinero: refactoriza la derivación del detalle de bodega en
  `verCierreBodegaDetalle` → `cifrasAgregadasBodega` y añade «Pago entregado». También toca la
  pantalla «Solicitados» de la satélite. `docs/perfil-agentes.md > reviewer` lo marca como bloqueante
  sin constancia de los E2E afectados corridos en local, y `> Todos los agentes` pide además el grupo
  `dinero` entero. Solo consta `cierres-rediseno` (2×20).
  - Sin constancia: `e2e/cierre-bodega-satelite.spec.ts` (descarga de «Solicitados» y detalle de
    bodega) y `e2e/ajuste-pago-mensajero-cierre.spec.ts`, los dos del proyecto `dinero`, y el
    `--project=dinero` entero que pide T6.1.
- **Para cerrarlo:** correr en local, con una base desechable nueva y `NEXT_PUBLIC_APP_URL` como en
  `gate.yml`, `pnpm exec playwright test --project=dinero`. Después, anotar en `progress/impl_SLT-141.md`
  `INIT_EXIT`, la salida del E2E y el mapa R → test consolidado, y marcar T6.1-T6.3.

### m1 — menor · El tamaño aceptado se queda corto

Carlos aceptó «~1 500 líneas (~520 producción, ~1 000 tests), 25 archivos». El diff real es **3 324
líneas**: 933 de producción y 2 391 de tests/E2E, en 27 archivos. Es más del doble, y la producción
casi lo dobla. La línea sigue valiendo para el gate, pero conviene que el leader se lo diga a Carlos con
el desglose antes del PR (memoria «tamaño del PR roto por tests»).

### m2 — menor · «Destino» no es el texto de `destinoCierre` (PA2)

PA2, aprobada, dice «con el texto que la pantalla da a un destino `bodega_central` (`destinoCierre`)».
Esa función da «Bodega central · <zona>», y la hoja pone solo «Bodega central»
(`cierres-bodega-modelo-nuevo-descarga-columnas.ts:112`) porque `CierreBodegaResumen` no trae la zona
central. El implementer lo dejó abierto, que es lo correcto. Falta que el leader registre la decisión
en `progress/features/SLT-141.md`: aceptar el texto sin zona, o pedir el dato al servidor. El E2E ya
fija «Bodega central».

### m3 — menor · Degradación silenciosa en el cliente si faltan las cifras

`libroCierresBodega` devuelve `null` con `cifras === undefined` aunque haya items nuevos
(`cierres-bodega-modelo-nuevo-descarga.ts:64`), y entonces sale el archivo viejo sin avisar. Esto
contradice el comentario de la misma función («no se degrada a viejo en silencio»). Hoy no pasa: el
servidor siempre manda la clave o lanza. Sería más coherente lanzar si hay nuevos y no hay cifras.

### m4 — menor · `ConCifrasBodegaEnOk` fuera de `lib/types`

Desvío del design con precedente en SLT-140 (ver punto 4). Basta con anotarlo como decisión técnica en
`progress/features/SLT-141.md > Decisiones`; hoy solo está en la bitácora.

### m5 — menor · Un cierre de bodega sin días en el lote da «Pago entregado» 0.00 y no vacío

En `pagoEntregadoPorBodega`, si `grupos.get(id)` está vacío, `dias.some(...)` es `false` y sale
`"0.00"`. Con acceso total no ocurre (todo cierre de bodega tiene días), pero `null` sería más honesto.
Es solo una nota.

### m6 — menor · Literales de país en código nuevo

«SINPE» como encabezado y `ZONA_CR`/`fechaDiaInstanteCR` con la marca `// SLT-81`. Son el patrón
existente (SLT-140, `cierres-bodega-descarga-columnas.ts`), el documento aprobado los pide «tal cual»
y la guardia `pais-sin-literales` está verde. Sigue siendo deuda de país heredada; no es nueva de
SLT-141.
