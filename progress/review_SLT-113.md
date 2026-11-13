# Review SLT-113 «Excel del modelo nuevo de cierres» — S15a (ruta completa)

## Vuelta 1 (2026-11-12, diff `origin/dev...f54c4378`)

Base de pruebas: `slt113_excel` (DATABASE_URL exportada sin imprimir). MCP del grafo: no usado
(worktree sin indexar, según la bitácora); todo por Grep/Read.

### Checklist

- [x] **Ruta:** completa; toca dinero (lectura) y permisos (alcance), así que la completa es la correcta.
- [x] **Trazabilidad:** R370–R376 mapeados en `tasks.md > Trazabilidad` y en `progress/impl_SLT-113.md`;
      todos los tests existen y están verdes (93 archivos, 1159 tests, integración NO saltada).
- [ ] **Tasks:** T0–T5 `[x]`; **T6.1–T6.4 siguen `[ ]`** (ver H2).
- [x] **Tamaño:** 45/40 archivos, 3141/1000 líneas; aceptado (`tamano-pr-aceptado` hasta 52, Carlos).
- [x] **`design.md > ## Lo que ya existe`** presente y con contenido; nada se re-crea: `folioDe` delega en
      `folioCierre` (en `lib/utils/folio-cierre.ts`, que ya existía por SLT-138: se añade, no se duplica);
      `senalesDe`/`textoSenales` se reusan con un `Pick`; `toPagoPorTarifa`/`toAjustesPago`/
      `tarifaFaltanteDe`/`cargosFulfillmentVigentes` se reusan; las relaciones de pago son la MISMA
      constante en las dos proyecciones (lo fija `cierres-admin-gestiones-where.test.ts`).
- [x] **Typecheck:** solo los 4 errores ajenos de SLT-139 (`EstadoCuentaRepository.ts` ×2,
      `PagoMensajeroMovimientoRepository.ts`, `wallet-mensajero.ts`).
- [x] **Lint** (archivos del diff): 0 errores, 5 avisos.
- [ ] **Guardias** (`pnpm run test:guardias`): rojo NUEVO en `tests/unit/analytics/rollup-guards.test.ts`
      causado por el diff (H1). `dependencias-declaradas-presentes.guardia` está en
      `tests/baseline-rojos.json` (no cuenta). `zona-central-guarda-y-rastro` cayó en la primera corrida
      sin la base desechable exportada; con `slt113_excel`, verde (no es hallazgo).
- [ ] **`./init.sh`** verde: no hay constancia (T6.1); con H1 saldría rojo.
- [ ] **E2E en local** (`cierres-rediseno` entero + grupo `dinero`): solo consta `-g "SLT-113"` (1 passed);
      el resto «queda para T6» (H2).
- [x] **Multi-empresa:** las dos consultas nuevas leen `cierre_rechazo_tienda`, registrada en
      `lib/db/modelos-de-negocio.ts:92` (extensión de tenant + RLS), igual que el resto de lecturas de
      `/cierres-admin`; alcance por `alcanceWhere` en el WHERE.
- [x] **Sin migraciones**, sin dependencias nuevas, sin Ordenex, sin secretos.
- [x] **Dinero:** solo lectura; el cliente no suma ni redondea (strings del servidor; `celdaMonto` del
      generador convierte); «Ajuste» con `-` delante; fechas con `fechaCalendario(…, zona)`.

### Verificaciones pedidas por el leader

- **Modelo viejo idéntico:** `DescargarGestionesModeloNuevo.test.tsx` (a) compara la configuración
  entera de `construirDescarga` con un literal escrito a mano (sin `tituloHoja` ni `hojasAdicionales`).
  Mutación reproducida — `nuevas = items.filter(i => i.cierreModelo !== undefined)` en
  `cierres-gestiones-modelo-nuevo-descarga.ts`: **MATADA** (5 rojos: 3 unit + componentes (a) y (c)).
  Revertida, `git status` limpio.
- **Alcance en la consulta de rechazos:** quitar `...alcanceWhere(alcance)` de
  `findRechazosTiendaModeloNuevoCompleto` (`CierresAdminRepository.ts:1959`): **MATADA** («R373:
  rechazos — central [R6]…»). Revertida, limpio. Cifras de la hoja = las del detalle: test de paridad
  `toEqual` contra `findCierreByIdEnAlcance` (A, B, D), verde.
- **Corpus de alcance corregido:** cubre lo que el design quería y algo más: la central no ve rechazos de
  satélite (R1) ni la satélite los de Norte (R3), el recorte de fechas (R4), el viejo (R2), el no
  consolidado en bodega (R5) y el cierre sin gestiones (R7). Correcto según `alcance-cierre-where.ts`
  (acceso total = `bodega_central`, disjunto de la satélite; design §2.6 de la 230). El design quedó
  desalineado (H3).
- **`DescargarDatasetButton` con libro opcional:** sin `libro` el camino es el de siempre (la rama nueva
  hace `return` solo si `libro !== undefined`); `DescargarDatasetLibro.test.tsx` (b) fija contra literal
  que sin libro no aparece `tituloHoja`; `descarga-titulo-hoja.test.ts` fija que sin `tituloHoja` la hoja
  se llama como `titulo`. Compatible hacia atrás.
- **Desvíos:** (1) módulo partido: el que declara columnas se llama `*-descarga-columnas.ts` y la guardia
  de datos sensibles lo sondea; el libro solo reparte filas ya proyectadas — no abre hueco. (2)
  `FLETE_NO_ENTREGADAS_LABEL`: la guardia no se tocó; ver H4 por el contrato. (3) `estado-con-info`:
  entrada de clase `descarga` con motivo, igual que la de la hoja fundida (línea 208) — legítima.
  Ninguno debilita su guardia.
- **13 dobles:** las 13 líneas añadidas son `findRechazos…: vi.fn(async () => [])`; ninguna aserción
  cambia (diff de `tests/unit/services/` revisado línea a línea).
- **Literales / tú / dinero / formatos:** encabezados y nombres de hoja como literales en tests; textos
  sin voseo ni usted; ningún float; fechas del país por zona de la empresa.

### Hallazgos

- **H1 — BLOQUEANTE.** `e2e/cierres-rediseno.spec.ts:1163-1164` usa el literal `20000`
  (`montoCobrar: 20000`, `monto: 20000`), que coincide con `UMBRAL_AVISO_FILAS_CORRIDA` y pone rojo
  `tests/unit/analytics/rollup-guards.test.ts > R47 (b) la cifra no aparece en ningun otro archivo`
  («Copias: e2e/cierres-rediseno.spec.ts (2x)»). No está en `tests/baseline-rojos.json`; en `origin/dev`
  ese spec no tiene la cifra. Entró con el commit del E2E (14ec4a02), después de la última corrida de
  guardias de la bitácora. Arreglo: otro monto en el escenario (y ajustar los literales esperados si
  dependen de él).
- **H2 — BLOQUEANTE.** `tasks.md` T6.1–T6.4 sin marcar: no hay `./init.sh` con `INIT_EXIT`, ni el E2E
  `cierres-rediseno` entero ni el grupo `dinero` en local (regla de `docs/perfil-agentes.md > Todos los
  agentes` y `> reviewer`: PR que toca pantallas y dinero sin constancia de los E2E afectados). Falta
  también T6.3 (lo que heredan SLT-140 y SLT-141 en `progress/features/SLT-113.md`). Con H1, el
  `./init.sh` habría salido rojo.
- **H3 — menor (spec).** `specs/SLT-113-excel-modelo-nuevo-cierres/design.md:324` dice «rechazos con el
  alcance de la central y sin rango: [R1]; con S: [R1]», imposible con `alcanceWhere` (central =
  `bodega_central`, disjunto de la satélite). El test usa central [R6], S [R1, R4] sin rango y [R1] con
  noviembre, que es lo correcto. Corregir el design para que spec y test digan lo mismo.
- **H4 — menor.** `cierres-gestiones-modelo-nuevo-descarga-columnas.ts:71-73`: los encabezados del flete de
  no entregadas usan `FLETE_NO_ENTREGADAS_LABEL` («Flete de gestiones no entregadas»…) en vez del texto
  del documento aprobado (R373 pide «exactamente» sus columnas). Razonable por la guardia, pero falta la
  constancia de Carlos en `progress/features/SLT-113.md > Decisiones`.
- **H5 — menor.** `cierres-gestiones-modelo-nuevo-descarga-columnas.ts:102`: el comentario de ejemplo lleva
  un literal de moneda (`₡3.500`). No es código ejecutable, pero la regla del perfil pide código nuevo sin
  literales de moneda; mejor un ejemplo neutro.

### Veredicto

**RECHAZADO** (H1, H2). Para volver: quitar el `20000` del E2E (guardia R47 verde), correr `./init.sh`
con `INIT_EXIT`, el E2E `cierres-rediseno` entero y el grupo `dinero` en local, marcar T6 y anotarlo en
la bitácora. H3–H5 pueden ir en la misma tanda.

## Vuelta 2 (acotada a f7255a46..4ce7e5ea)

Incluye el merge `e288780d` de origin/dev (SLT-112 «Ganancia del mensajero en servidor»).

### Checklist
- [x] **H1 cerrado.** `e2e/cierres-rediseno.spec.ts:1189-1190` usa `18000`; `tests/unit/analytics/rollup-guards.test.ts`
      verde (21/21). `18000` solo aparece en fixtures/tests ajenos (etiquetas, openapi), ninguna constante de la
      guardia R47. Las aserciones del bloque SLT-113 (nombres de hoja, encabezados, guía de N, 3503, 2200, guía
      vieja presente en la hoja anterior) no dependen del monto de la entrega vieja.
- [x] **H3 cerrado.** `design.md:324-327` dice central [R6], S sin rango [R1, R4], S noviembre [R1], bodega [R1];
      coincide con `cierres-gestiones-modelo-nuevo-descarga-sql-real.test.ts:734-737,761`.
- [x] **H4 cerrado** por decisión técnica del leader en `progress/features/SLT-113.md:16` (rótulo de R65 de SLT-54;
      Carlos lo valida en Preview).
- [x] **H5 cerrado.** El comentario de `cierres-gestiones-modelo-nuevo-descarga-columnas.ts:102` ya no lleva
      literal de moneda. Tests del archivo (descarga + guardias frontera y estado-con-info): 39/39 verdes.
- [x] **T6.2** bien marcada: `tamano-pr-aceptado` presente (hasta 52); `scripts/tamano-pr.mjs` mide 45/52 y
      solo avisa.
- [x] **T6.3** escrita en `progress/features/SLT-113.md > Lo que heredan SLT-140 y SLT-141` (ver m2).
- [ ] **T6.1 / T6.4** pendientes del gate del leader (`./init.sh` con `INIT_EXIT`), como corresponde.
- [x] **Merge con SLT-112:** de los archivos de SLT-113 solo toca `e2e/cierres-rediseno.spec.ts`, en bloques
      SLT-102/112 ajenos; el bloque SLT-113 queda intacto. La bitácora reporta `cierres-rediseno` 18/18 y `dinero`
      107/107 después del merge.

### Hallazgos
- **m1 — menor.** La evidencia de T6.2 en `tasks.md` dice «51 archivos tras el merge»; `tamano-pr.mjs` mide 45.
  Ambos bajo el tope de 52; solo afinar la cifra si se vuelve a tocar.
- **m2 — menor.** T6.3 pide nombrar `folioCierre` y el criterio de R371; la nota cubre libro, `tituloHoja` y la
  clasificación por modelo del cierre, pero no menciona `folioCierre` ni cita R371 por número. Añadir una línea.

### Veredicto
**OK** (sin bloqueantes; T6.1/T6.4 quedan para el gate del leader).
