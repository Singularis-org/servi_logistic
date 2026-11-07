# Revisión — rama `chore/deudas-2026-11-05` (D39, D40, D42, D43 y n1, n2, n3 de SLT-64)

HEAD revisado `900407a6`, base `origin/dev` `49f45a7e`. No es una ficha SDD: se contrasta con los bloques de
`progress/deudas.md`, con `progress/impl_deudas-2026-11-05.md` y con R71/R72 de SLT-54.

## Veredicto: RECHAZADO

**Un solo bloqueante, de una línea y sin código:** `progress/features/SLT-52.md:61` dice «Sin promover» y SLT-52 ya
está en `origin/prod`. El código, los textos y los tests pasan. Los 7 menores no impiden el OK.

## Hallazgos

### BLOQUEANTE 1 — El cierre de SLT-52 afirma algo falso sobre producción

`progress/features/SLT-52.md:61`: «PR #74 mergeado a `dev` por Carlos (42328714): […] Sin promover: sale con EP-8.»

- `origin/prod` es `fae6a5d3`, de padres `3ede2017` y **`42328714`**: el merge de SLT-52 es padre directo de la punta de
  producción. Lo trajo el PR #73 (`dev` → `prod`, «planes v1, ajustes de sincronizacion de rutas», mergeado el
  2026-11-04 13:30 UTC, por otra persona).
- `origin/prod` trae `lib/tarifas/{calculo,catalogo,niveles,precedencia,servicios}.ts`, las migraciones
  `20261103120000_tarifas_flexibles_enums` a `20261103140100_rechazo_tienda_cobro_tarifa_valor_misma_empresa`, y
  `tarifa_modelo` en `db/schema.prisma`.
- El propio PR #80 midió `tarifa_valor`=0 en producción: la tabla ya existe allí.

**Qué falta:** corregir la frase. Lo cierto, según git: el código de SLT-52 llegó a `prod` con el PR #73, y ninguna empresa
puede activar el modelo porque la pantalla y la activación (SLT-54, `49f45a7e`) no están en `prod`. Que eso último baste
como garantía de negocio lo decide Carlos; este reviewer no lo ha medido en producción. Que el leader se lo diga: hoy
cree, por este texto, que el modelo no ha salido.

SLT-54 («No promovido») y SLT-64 sí son ciertos: `49f45a7e` y `88887afa` no son ancestros de `origin/prod`.

### Menor 1 — El `EXISTS` de D39 es la lectura más cara de la caja cuando la empresa no tiene modelo nuevo

`lib/repositories/_shared/detalle-modelo-nuevo.ts:101-104`, llamado desde `WalletService.ts:441` y
`FiltrosWalletService.ts` (caso `caja`). Medido en `servi_gate_deudas`, como `servi_app`, con RLS y `set_config`, en
transacción revertida, 3 corridas (comprobado después: 0 filas en las dos tablas). Volumen sintético; **no** hay medida
con el volumen real, que este reviewer no leyó.

| Empresa, sin periodo | `cierre_detail` | Cobros que recorre | `EXISTS` (ms) | Agregado de la caja (ms, aprox.) |
|---|---|---|---|---|
| Todo viejo | 500.000 | 20.000 | 376 / 276 / 266 | 73 / 58 / 155 |
| Todo viejo | 2.500.000 | 100.000 | 1.474 / 1.425 / 1.434 | 87 / 67 / 67 |
| Una gestión nueva por cierre | 500.000 | 20.000 | 363 / 285 / 196 | 216 / 143 / 135 |
| Todo viejo, con índice parcial | 2.500.000 | 100.000 | 113 / 85 / 87 | 69 / 146 / 158 |

- **Sí tiene índice, pero no el que le sirve.** El plan es `Nested Loop Semi Join`: `wallet_movimiento_organizacion_id_idx`
  con filtro (el `::text` impide usar el de `categoria`) y `cierre_detail_cierre_id_orden_id_key` por cada cobro.
  Una empresa sin ninguna gestión nueva no encuentra nada y tira las 50 filas de cada cierre: `Rows Removed by Filter: 50`,
  `loops=100000`. **Justo el caso de hoy para todas las empresas.**
- **Crece con el detalle, no con el periodo.** `/wallet` lo pide sin periodo (`wallet/page.tsx:51`). Cada cambio de
  filtro lo paga dos veces (`verResumenCaja` y `conceptosConMovimientos`), y Analítica también, sin leer el dato
  (`finanzas/cargar-kpis.ts:142`). Un fallo o un tiempo agotado de esta lectura tumba el resumen entero de la caja por
  un rótulo: no va protegida.
- **No bloquea:** 50.000 cierres son mucha historia, y a 500.000 detalles cuesta ~270 ms.
- **Arreglo medido, sin aplicar:** `CREATE INDEX … ON cierre_detail (cierre_id) WHERE tarifa_modelo = 'nuevo'` baja de
  1.430 ms a ~90 ms, 16 veces. Es una migración con su `down.sql`: decidirlo antes de promover EP-8, o anotarlo como deuda.

### Menor 2 — La regla nueva de `caja-173-alcance` solo mira el alias `cd`

`tests/unit/guards/caja-173-alcance.guardia.test.ts:141-143`. Las reglas anteriores siguen intactas: el diff solo añade.
Pero `/\bcd\."(\w+)"/` no ve `SELECT d."tarifa_valor_flete" FROM "cierre_detail" d` ni `cd.*`. Las columnas prohibidas de
`:134` están en camelCase y el regex de `monto` no alcanza `tarifa_valor_flete`. La no vacuidad de `:334` tampoco lo caza,
porque el fragmento legítimo sigue dando sus 3 columnas. R33 de la 173 depende hoy de un alias. Por lectura; no se mutó.

**Qué falta:** prohibir en el módulo cualquier identificador SQL entrecomillado fuera de una lista cerrada, no solo los
del alias.

### Menor 3 — Tres comentarios que el diff dejó falsos

- `tests/unit/guards/caja-173-alcance.guardia.test.ts:102`: «sin montos ni SQL crudo»; el módulo ya lleva un `Prisma.sql`.
- `caja-173-alcance.guardia.test.ts:324`, título del test: «solo llega a `tarifa_modelo`»; llega a tres columnas.
- `lib/repositories/_shared/detalle-modelo-nuevo.ts:7`: «La empresa la pone la RLS»; el fragmento de `:97` la lleva en
  el texto, y lo dice bien, pero la cabecera del módulo quedó general.

### Menor 4 — La excepción de `nombres-estado-retirados` es estricta en número, no en frase

`nombres-estado-retirados.guardia.test.ts:101,386`: multiconjunto exacto de 4 «entregadas». Cae con un quinto o con uno
menos (G1, G3). No cae si una de las cuatro se reescribe y sigue usando la palabra como estado («órdenes entregadas»),
porque lo que se compara es la palabra hallada. Es la limitación de la regla desde la 455, no de esta rama: aquí se
cumple. Por lectura.

### Menor 5 — D42 deja su siguiente paso apoyado en una traza que no existe

- `progress/deudas.md:259`: «si vuelve a caer en CI, medir con esa traza». «Esa» no tiene antecedente en el bloque.
- `playwright.config.ts:70` tiene `trace: "on-first-retry"`: el intento que cae no guarda traza; solo el reintento. Para
  medir la caída hace falta `retain-on-failure` en CI o decir qué se medirá en su lugar.
- `e2e/_escenarios/pulsar.ts:15-16` sigue diciendo que `abrirCon` «NO sirve para un control que alterna», y
  `e2e/wallet-mensajeros.spec.ts:81` lo usa en uno. El comentario del spec explica la excepción y es correcta, pero el
  contrato del módulo la contradice. Ya existe `desplegar` (`e2e/wallet.spec.ts:53`) para este botón, leyendo
  `aria-expanded`: dos patrones para lo mismo.

### Menor 6 — Lo que dice `specs/SLT-54-pantalla-tarifas/requirements.md` frente a los cierres

`:244` y `:260` siguen en «pendientes de visto bueno de Carlos», y `:259` en «Fuera: D39, D40 y D41». `SLT-54.md:43` y
el cuerpo del PR #80 dicen que el visto bueno se dio el 2026-11-05, y D39 y D40 ya están hechas. Las 3 notas nuevas de
`cierre-labels.ts` tampoco tienen requisito: su única constancia es la deuda.

### Menor 7 — Formato de los cierres

- `SLT-52.md:61`: `CHECKPOINTS.md:44` pide «resumen, PR, deudas que deja», y no dice las deudas, ni siquiera «ninguna».
  `progress/deudas.md` no tiene ninguna entrada que nombre SLT-52.
- D39 y D40 CERRADAS conservan «Qué falta» y «Dueño» (`deudas.md:242-243,248-249`). D38, la anterior cerrada, no los
  lleva. D39 se lee cerrada y con trabajo pendiente a la vez.
- La bitácora `impl_deudas-2026-11-05.md:329` dice que sin empresa «saldría el rótulo de hoy». En la app no se llega ahí:
  ver el punto 2.

## Los 8 puntos

### 1. Dinero y modelo — OK

- [x] **Fuente:** `incluyeModeloNuevo` y `categoriasConModeloNuevo` leen `cierre_detail.tarifa_modelo`. Ninguna lectura
  nueva nombra `tarifa_activacion`. El test «activar la empresa no mueve lo congelado» lo fija en D39 y en D40.
- [x] **Periodo:** `categoriasConModeloNuevoSql` usa `whereLibroCajaConTerminoSql` con los mismos `filtros` que
  `agregarPorCategoriaYTipo` (`WalletService.ts:433-441`). `FiltrosComunesSql` y `BalanceFiltros` tienen los mismos campos
  y `construirFiltros` no pasa ninguno más. Test con marzo nuevo y junio viejo: `desde` inclusivo y `hasta` exclusivo.
- [x] **Reversos:** quedan fuera por catálogo (`WALLET_CATEGORIA_ROTULO_POR_MODELO_SEED`). Su único escritor es
  `CajaRechazoTiendaCobroFeedService.ts:39,42`, que anula cobros por rechazo: «devolución a origen» es cierto.
- [x] **Composition root:** `lib/actions/{wallet,wallet-filtros,cierre-bodega,conciliacion-satelites}.ts` construyen con los
  repositorios reales. `verResumenCajaAction` y el hook devuelven el DTO entero. `toResumen` copia el campo, y es el único
  mapper intermedio; `CierreBodegaService` pasa las filas tal cual. El test las recorre por servicio y con 7 superficies.
- [x] **Importes:** los tests fijan que no se mueven (`282.50`, `850.00`).

### 2. Aislamiento — OK

- [x] **En la app:** el único camino al fragmento es `verResumenCajaAction` y `conceptosConMovimientosAction`. Ni cron ni jobs
  lo llaman. `maestro` y `admin` entran con `esAccesoTotal`. La extensión envuelve el SQL a mano en
  `$transaction([set_config, query])` con `servi_app` (`extension-empresa.ts:195,222-224`), así que la sesión lleva la empresa.
- [x] **Plataforma sin empresa:** la lectura no llega a dar el rótulo viejo. `aplicar` rechaza con `EmpresaNoResuelta` el negocio y el
  SQL a mano sin contexto (`extension-empresa.ts:202-206`), y antes cae `agregarPorCategoriaYTipo`. Es correcto: no enseña ni
  importes ni rótulo. `sinRlsSinEmpresa` fija una rama que solo sirve de red. Por lectura; no se ejecutó con ese usuario.
- [x] **Filtro:** misma expresión que las 88 políticas RLS. `cd.organizacion_id = w.organizacion_id` es necesario: `origen_id`
  no tiene FK. Test con fila de A apuntando a un cierre de B, como dueño y sin RLS.
- [x] **`caja-173-alcance`:** sigue exigiendo lo que exigía; lo añadido solo restringe. Ver menor 2 y 3.
- [x] **`nombres-estado-retirados`:** estricta en número. Ver menor 4.
- [x] **`sql-a-mano-por-empresa`:** en verde, sin excepción nueva.

### 3. Textos — OK

- [x] **Modelo viejo:** literales a mano en `DeudasD39D40ModeloEnPantalla.test.tsx:64-77`, sin importar las constantes de
  `cierre-labels.ts`, con ausente y `false`. Comparados con el diff: idénticos a los anteriores.
- [x] **Las 3 notas son ciertas.** En el nuevo, `ingreso_flete_devolucion` recoge todo resultado distinto de `entregado`
  (`ingreso-empresa.ts:257`), y en el viejo solo nace de un rechazo. `WalletTiendaFeedService` debita las dos categorías, con el
  mismo interruptor que ya condicionaba la frase vieja.
- [x] **Cierre mixto:** el usuario lee «flete de gestiones no entregadas» sobre devoluciones y reprogramados juntos. **No es
  falso:** una devolución a origen es una gestión no entregada, y ninguna categoría de esas lleva una entrega. Lo mismo para
  «Flete de gestiones no entregadas cobrado a la tienda» cuando el conjunto suma un cobro por rechazo. Es lo que R71 ya
  declara: «un conjunto mixto se lee como nuevo».
- [x] **Satélite mixta:** «sus gestiones» es menos preciso y cierto.
- [x] **Roles:** `adminSatelite` lee la nota por `CierresBodegaSolicitadosLista` → `CierreBodegaFacturaResumen` y `maestro` por
  `CierresBodegaResueltosLista`; test con las dos listas. Pasar `modeloNuevo` no cambia `:1049`, porque esta hoja siempre
  lleva `cascadaCentral`.
- [x] **R71/R72:** el modelo viejo no cambia ni texto ni importe. R72 no se toca, y el encabezado queda en D43, como se dijo.

### 4. Coste — Menor 1

Medido; ver la tabla.

### 5. D42 — OK, sin arreglo demostrado (y lo dice)

Por lectura de `pulsar.ts`, `DataTable.tsx:435,552` y `DetalleMovimientoCierre.tsx:432-467`:

- **La región se monta en el mismo clic:** `toggle` es un `setState` y las dos ramas renderizan la `section` con su
  `aria-label`, antes de que la lectura acabe.
- **Reintento:** solo se pulsa si la región no está visible, y `toPass` no termina hasta verla. Un plegado accidental se
  reabre en la vuelta siguiente, así que el peor caso es agotar los 30 s, no quedar plegado.
- **Falso verde:** no. Las aserciones del destinatario siguen después.
- **Falso rojo:** sí, el mismo de antes. Si la fila se remonta **después** de que `abrirCon` vuelva, el panel se pierde y el
  destinatario no aparece. Como la caída original fue por desmontaje del botón, este cambio puede no arreglarla. La bitácora lo
  admite, y `deudas.md` no marca D42 como cerrada: correcto.
- La cuenta de la bitácora es cierta: (5/6)^5 ≈ 0,40.

### 6. n1, n2, n3 — OK

- [x] **n1:** `CicloVidaRepository` usa `RESULTADOS_DE_CIERRE` y fecha `g."created_at"`; `CohorteCargaRepository`, `ESTADOS_TERMINALES`.
  Los comentarios son ciertos, y no queda otro «`CicloVidaKpi` … terminal» en Analítica.
- [x] **n2:** los 4 tests citados existen y corren: el bloque «las tres vías» (`deshacer-…:139`), `cache-invalidacion-correccion-cableado`,
  `{ expire: 0 }` con literal (`cache-por-empresa.test.ts:146`) y el caso (c) (`e2e/cierres-admin.spec.ts:163`). La fila es honesta:
  «por composición». Grep: ningún archivo de `e2e/` que nombre deshacer nombra también Analítica, así que «ningún test deshace y lee en
  navegador» es cierto.
- [x] **n3:** ninguna URL ni valor. `gate.yml` la escribe antes de `next build` (`:372`, `:395`). `app-url.ts:17` cae a
  `NEXT_PUBLIC_SITE_URL`. `plataforma-vacia` incluye `superadmin-empresas` (`playwright.config.ts:77-79`). `enlaceEnviadoA` solo lee tras
  `#enlace=` (`_superadmin-fixture.ts:96-115`). No se ejecutó el E2E sin la variable.

### 7. Cierres — BLOQUEANTE 1

| Dato | Git / `gh` | Escrito | |
|---|---|---|---|
| SLT-52, PR #74, `42328714` | MERGED a `dev`, 2026-11-03 local | Igual | [x] |
| SLT-52 «Sin promover» | **Padre de `origin/prod`** | Falso | [ ] |
| SLT-64, PR #77, `88887afa` | MERGED a `dev`, 2026-11-04 | Igual | [x] |
| SLT-64 `{ expire: 0 }`, sin OK aparte | El cuerpo del PR #77 lo declara | Igual | [x] |
| SLT-64 m3, m4, R18-R23 | `review_SLT-64.md`, cuerpo del PR | Igual | [x] |
| SLT-54, PR #80, `49f45a7e` | MERGED a `dev`, 2026-11-05, fuera de `prod` | Igual | [x] |
| SLT-54 visto bueno, `tarifa_valor`=0 | Cuerpo del PR #80 (no se midió producción) | Igual | [x] |
| SLT-54 «sin cubrir de punta a punta» | Cuerpo del PR #80 | Igual | [x] |
| SLT-54 D36, D37, D41, D42, D43 abiertas | `deudas.md` | Igual | [x] |

### 8. `tests/baseline-rojos.json` — OK

`git diff origin/dev...HEAD -- tests/baseline-rojos.json`: vacío. Sin Ordenex, país, moneda ni URLs en las líneas añadidas fuera de `tests/`
(los `₡` son esperados de test, formateados por la app). En `progress/`, `docs/` y `specs/` el único nombre propio añadido es el del dueño de
las deudas: no se nombra a la empresa usuaria.

## Checkpoints

No aplican los de especificación (`requirements`, `design`, `tasks`, `## Lo que ya existe`, `R<n> → test`): no es ficha SDD.

- [x] Typecheck: exit 0. Lint: exit 0, 0 errores y 234 avisos.
- [x] Sin tablas ni migraciones ni dependencias nuevas. Sin secretos ni valores que cambien entre entornos.
- [x] Consulta nueva con empresa y test de aislamiento.
- [x] Sin autorización nueva: `esAccesoTotal`, antes de la base, sigue siendo la puerta.
- [ ] `progress/features/SLT-52.md > Cierre` correcto: **bloqueante 1**.
- [ ] `gate-completo` en el PR: no existe aún el PR; lo corre CI.

## Salida real

Sobre la base desechable, corrido por este reviewer:

- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, 0 errores y 234 avisos.
- 10 archivos relacionados (`caja-173-alcance`, `nombres-estado-retirados`, `sql-a-mano-por-empresa`, `e2e-sin-saltos`, `deudas-d39-d40-modelo-nuevo`,
  `DeudasD39D40ModeloEnPantalla`, `cierre-incluye-modelo-nuevo`, `deshacer-gestion-invalida-analitica`, `cache-invalidacion-correccion-cableado`,
  `cache-por-empresa`): 201 de 201, exit 0.
- `pnpm run test:guardias`: 330 archivos en verde y 1 en rojo; 4616 tests en verde, 4 rojos y 1 saltado. Exit 1. El rojo es
  `dependencias-declaradas-presentes`, que está en `tests/baseline-rojos.json`: **no es un hallazgo**.
- `./init.sh` no se corrió entero: se corrieron sus piezas por separado.

## No verificado

- **Volumen real:** la tabla usa datos sintéticos, con 50 gestiones por cierre. No se tocó producción.
- **E2E:** no se corrió ninguno. D42 queda por lectura y por la tabla de la bitácora.
- **Pantalla real** y sesión real por la extensión: los tests leen con `servi_app` y `set_config` a mano, no por `conAislamientoPorEmpresa`.
- **Mutaciones:** no se repitieron (27, 46 y 8 según la bitácora). No se edita código en esta revisión.
- **Suite completa:** la corre CI.
- **Producción:** que las migraciones de SLT-52 estén aplicadas solo se infiere de la medida del PR #80.
- **Grafo de código:** no se consultó; la bitácora anota que este worktree no está indexado. Grep y Read.

## Vuelta 2 (acotada a 393b5391..e57de8db)

HEAD revisado `e57de8db`.

### Veredicto: OK

El bloqueante 1 está corregido y el diff no introduce ninguno nuevo. Quedan 3 menores: el segundo es una regresión estrecha de la
guardia, que conviene arreglar y no impide el OK.

### Hallazgos

#### Menor V2-1 — La guardia dejó de ver `cd."columna"` fuera de una plantilla

`tests/unit/guards/caja-173-alcance.guardia.test.ts:137`, `:175-179`. La regla vieja buscaba `cd."x"` en todo el código; `palabrasDeSql`
solo lee entre backticks. El balance neto es a mejor (tabla del punto 3), pero estos tres casos caían y hoy no caen en
`fugasDeLecturaDelModelo`, y los dos primeros tampoco en `escriturasCrudas`:

- `Prisma.sql(['SELECT cd."tarifa_iva_flete" FROM "cierre_detail" cd'])`. Ejecutado: `Prisma.sql([cadena]).sql` devuelve ese SQL.
- `new Prisma.Sql([...], [])`. Por las mismas razones; solo se probó contra la guardia.
- `Prisma.raw('…cd."x"…')`: sigue cayendo, pero solo en `escriturasCrudas` (`:356`).

No hay un caso así en el módulo real: es la red, no un fallo de hoy.

**Qué falta:** que la regla lea también las cadenas normales, o conservar la regla vieja junto a la nueva, con una contraprueba de
`Prisma.sql([...])` en `:530`.

#### Menor V2-2 — Una frase falsa en la bitácora sobre ese hueco

`progress/impl_deudas-2026-11-05.md`, tanda 5, «No verificado»: «Ejecutarlas exige `$queryRawUnsafe` o `Prisma.raw`, que caen en
`fugasDeLecturaDelModelo` y en `escriturasCrudas`». `Prisma.sql([cadena])` y `new Prisma.Sql` también las ejecutan, y no caen. Además,
`Prisma.raw` no cae en `fugasDeLecturaDelModelo`, solo en `escriturasCrudas`. Se corrige con V2-1.

#### Menor V2-3 — D42 y el cierre de SLT-52: ciertos, con lagunas

- `progress/deudas.md:252`: el título sigue diciendo `:81` y «clic crudo». Hoy es `:82` y ya no es crudo. La deuda sigue abierta por la causa.
- `progress/deudas.md:254`: las 5 corridas «con él» son de `abrirCon`, no de `desplegar`, y lo dice. Las de `desplegar` (1 de `dinero` y 1 del
  spec) solo están en la bitácora.
- `progress/features/SLT-52.md:62`: **la frase de que ninguna pantalla escribe `tarifa_valor` no está en el archivo** (ni en `progress/` del diff).
  Lo escrito es cierto, pero el lector no sabe por qué esas 0 filas se mantienen. El dato sí es cierto: ver el punto 1. Si se quiere dejar
  constancia, se puede añadir tal cual.

### Punto por punto

#### 1. `progress/features/SLT-52.md` — [x] cierto contra git; bloqueante 1 cerrado

| Afirmación | Comprobado | |
|---|---|---|
| PR #74, `42328714`, a `dev` | `gh`: MERGED, base `dev` | [x] |
| Salió con el PR #73, `dev` -> `prod`, 2026-11-04 | `gh`: MERGED 2026-11-04 13:30 UTC; `fae6a5d3` tiene a `42328714` de padre | [x] |
| Se activa con una fila, sin interruptor | `origin/prod:lib/repositories/_shared/resolver-tarifas.ts:80`: `tarifaValor.findFirst` sin `where`; sin `tarifaActivacion` en `lib/`, `app/` ni el esquema | [x] |
| Producción, 0 filas, 2026-11-05 | Cuerpo del PR #80: «Re-medido por Carlos». **No se midió aquí** | [x] por cita |
| SLT-54 trae el interruptor y no está en `prod` | `63bb2c89` (`feat(SLT-54)`) cambia `usaModeloNuevo`; `49f45a7e` no es ancestro de `origin/prod` | [x] |
| «Deudas: ninguna propia» | `deudas.md` no nombra SLT-52 | [x] |

**Nadie escribe `tarifa_valor` en `origin/prod`.** Por `git grep` sobre ese commit:

- `serviciosDeTarifas`: solo se define (`lib/tarifas/servicios.ts:22`) y lo llaman dos tests.
- `TarifaValorService` y `TarifaValorRepository`: fuera de tests, solo los construye `servicios.ts:24`; el resto son tipos y comentarios.
- Las únicas escrituras por delegado están en `TarifaValorRepository.ts:175,176,211`.
- Sin `INSERT INTO tarifa_valor` en código ni migraciones. `app/`, `lib/actions`, `components/` y `scripts/` no lo nombran, salvo un comentario de
  `scripts/verificar-rls-despliegue.ts`.
- `lib/actions/tarifas.ts` existe en `prod`, pero no llega a esos servicios. Importa `TarifaService` y `TarifaRepository`, los del modelo viejo. En `origin/dev` sí los llama: por eso SLT-54 es la frontera.

Límite: esto dice que el código no escribe. No descarta una escritura a mano en esa base; solo la medida de 0 filas habla de eso.

Sin regresión: ningún otro archivo de `progress/`, `docs/` o `specs/` sigue diciendo que SLT-52 no se promovió, salvo la cita de la vuelta 1.

#### 2. `desplegar` — [x] mismo comportamiento en `wallet.spec.ts`; sin falso verde

Comparados `desplegar` nuevo y el de `393b5391` con Playwright real, en Chromium, sobre 8 páginas sintéticas (16 de 16, exit 0). Plazo de
8 s en vez de 30 s; el spec llama a la función real de `pulsar.ts`:

| Caso | Nuevo y viejo |
|---|---|
| Abre al primer clic | Abierto, 1 clic |
| Ya abierto | 0 clics |
| Primer clic perdido, manejador a 1 s | Termina abierto |
| Render lento, 2,5 s, con reintento que pliega | Termina abierto |
| El control aparece a los 3 s | Termina abierto |
| **Nunca abre** | **Cae** |
| **Sin `aria-expanded`** | **Cae** |
| **Control ausente** | **Cae** |

- **`wallet.spec.ts`:** lo único que cambia es el plazo de 2 s de `getAttribute`. Sin `actionTimeout` en `playwright.config.ts`, antes esa lectura esperaba
  dentro de una sola vuelta, hasta el plazo de `toPass`. Ahora lanza a los 2 s y `toPass` reintenta. El resultado es el mismo en todos los casos de la tabla, y el
  plazo total sigue en 30 s. Cambia solo el mensaje con el que cae si el control no aparece: el último error, en lugar del tiempo agotado.
- **Falso verde en `wallet-mensajeros.spec.ts:82`:** no. `pulsarHasta` solo termina si `toHaveAttribute("aria-expanded", "true")` pasa, y las aserciones de
  `conCod` y `sinCod` siguen después. Quitar la espera de la región no pierde nada: la región se pinta en la misma rama de `abierta` (`DataTable.tsx:533,552`), y lo que se afirma es el destinatario.
- **El localizador no se pierde al abrir:** `expandAriaLabel` recibe solo la fila (`EstadoCuenta.tsx:1091`), así que el nombre no cambia con el estado.
- **Falso rojo:** sigue el de la vuelta 1. Si la fila se remonta después de `desplegar`, el panel se pliega. `abrirCon` tenía el mismo. D42 sigue abierta, con razón.
- Comentarios de `pulsar.ts` ciertos; `abrirCon` y `desplegar` ya no se contradicen. `e2e/mi-wallet.spec.ts:71` sigue con clic crudo, como dice D42. Traza
  `on-first-retry` en `:70`, como dice D42.

#### 3. `VOCABULARIO_SQL_DE_LA_LECTURA` — [x] cae con lo pedido; [ ] una regla vieja se debilitó (V2-1)

Funciones extraídas del propio archivo en `e57de8db` y `393b5391`, sin editarlo:

| SQL añadido | Regla vieja | Regla nueva |
|---|---|---|
| Importe, alias `cd` | Cae | Cae |
| Importe, alias `d` | **No cae** | Cae |
| Importe, con el alias legítimo `w` | **No cae** | Cae |
| Importe sin comillas | **No cae** | Cae |
| `cd.*` | **No cae** | Cae |
| `SUM(cd."cierre_id")` | **No cae** | Cae |
| `${col}` interpolado | **No cae** | Cae |
| `JOIN` a otra tabla | **No cae** | Cae |
| En mayúsculas | **No cae** | Cae |
| Cadena normal con `cd."col"` | Cae | **No cae** |
| `Prisma.sql([cadena])` | Cae | **No cae** |
| `new Prisma.Sql` | Cae | **No cae** |
| El módulo real | Sin fugas | Sin fugas |

- **Lista cerrada:** de las columnas de `cierre_detail` (leídas del esquema), solo `cierre_id`, `organizacion_id` y `tarifa_modelo` están en el vocabulario. `origen_id` y
  `origen_tipo` no existen en esa tabla: no abren nada.
- **La no vacuidad se conserva:** `arrayContaining` es menos estricta que el `toEqual` de 3 columnas, pero ese `toEqual` ya no hace falta con la lista cerrada, y falla si
  desaparece el fragmento.
- **Contrapruebas:** `monto_x` salió del test de `:360`; `monto` sigue en la regex de `:133`, y el caso «Importe, alias `cd`» cae.
- **Comentarios:** `:102`, `:125-127`, `:301`, `:360` y `:170-174` son ciertos. `:171` ya avisa de que mira plantillas: V2-1 es el límite de la regla, no un comentario falso.

#### 4. `lib/repositories/_shared/detalle-modelo-nuevo.ts` — [x] solo comentarios

Fuera de las líneas `//` del diff, 0 líneas. Los dos tests que nombra existen. El comentario es cierto: `CierreDetail` entra en la extensión y el fragmento lleva la empresa en el texto (`:103`).

#### 5. `specs/SLT-54-pantalla-tarifas/requirements.md` — [x] sin requisitos nuevos, cierto

Ningún `R<n>` nuevo. El visto bueno del 2026-11-05 está en el cuerpo del PR #80 (puntos 1 y 2) y en `SLT-54.md:43`. D41 sigue abierta (`deudas.md:247`). Las 3 notas son
`GANA_LA_TIENDA_NOTA_MODELO_NUEVO`, `PAGO_TIENDA_HOY_NOTA_MODELO_NUEVO` y `DESGLOSE_POR_TIENDA_NOTA_MODELO_NUEVO` (`cierre-labels.ts:389,396,552`), las que nombra el cierre de D40.

#### 6. `progress/deudas.md` y la bitácora — [x] ciertos

- **D39 y D40:** solo pierden «Qué falta» y «Dueño», y quedan con la forma de D38 (`:235-237`). El resto se revisó en la vuelta 1.
- **D42:** cierto, con V2-3.
- **D43:** sin cambios en este diff; `:292` usa `FLETE_DEV_CON_IVA_LABEL` (`cierre-labels.ts:182`), con ese texto.
- **D44:** las cifras coinciden con la tabla de la vuelta 1 (266-376, unos 1.430, 58-155, 85-113). `cargar-kpis.ts:142` llama a `verResumenCajaAction`.
- **`impl_deudas-2026-11-05.md:329`:** cierto contra `extension-empresa.ts`. `:202-206` rechaza el SQL a mano sin contexto; `:209-212` deja pasar `comoPlataforma`. `sinRlsSinEmpresa`
  (`deudas-d39-d40-modelo-nuevo.test.ts:390`) usa el `tx` del dueño, fuera de la extensión. `extension-empresa.test.ts -t R11`: 7 en verde y 68 saltados, igual que la bitácora; `:304-307` existe.
  `comoPlataforma` no aparece en `lib/actions/wallet.ts`, `wallet-filtros.ts`, `WalletService` ni `FiltrosWalletService`, y `ROLES_ACCESO_TOTAL` solo trae `maestro` y `admin`.

#### 7. `caja-backfill` y `ciclo-vida-gestion-final` — el filtro de la rama no lo causa; fue por lectura, sin reproducir

**El filtro no puede dar ese error:**

- `referencia a otra empresa` (`SL017`) solo lo lanza `verificar_misma_empresa`, un trigger `BEFORE INSERT OR UPDATE` (`20261022130300_misma_empresa_en_fk/migration.sql:27`).
- `FILA_DE_CAJA_CON_MODELO_NUEVO_SQL` es un `SELECT`, y solo llega a los dos `$queryRaw` de lectura de `FiltrosWalletRepository.ts:94` y `WalletMovimientoRepository.ts:383`.
- Ninguno de los dos tests lo llama. En el camino del backfill, `RecolectorDeFilasDeCaja.categoriasConModeloNuevo` lanza.
- La rama no trae migraciones (vuelta 1), ni toca `CicloVidaRepository` ni `CierresAdminRepository`. `CajaBackfillTesoreriaService` solo gana ese método.

**`caja-backfill`: los datos lo explican del todo, y ya pasaba antes de esta rama.**

- `sembrar` (`caja-backfill.test.ts:80-81`) toma dos usuarios y una zona cualesquiera, sin empresa, en una transacción con empresa nueva. Con datos de E2E, son de otra empresa.
- `progress/impl_SLT-54.md:146` documenta el mismo error, `cierre_dia.destino_zona_id -> zona`, y el mismo rojo sobre el commit base `9124244a`, anterior a D39.
- **Corrige la bitácora:** «dependen de que la base esté limpia» no es la explicación. Sin usuarios, `sembrar` da `null` y los casos hacen `return` (`:176`, `:215`, `:303`, `:334`, `:363`):
  **en base limpia ese archivo sale verde sin comprobar nada.** Preexistente, fuera de este diff y de este alcance; se anota, no bloquea.

**`ciclo-vida-gestion-final`: no se identificó la FK.** Siembra en su propia empresa (`sembrarBase`), y los catálogos que lee (`canton`, `order_status`, `rol`) no cuelgan de una empresa. No queda
en ningún log la FK de esa caída, y en `gate-deudas.log` ese archivo salió verde. Lo más probable son las escrituras reales de R6 y R8 (`:415`, `:524`) con lecturas como dueño, pero no está demostrado.
Que no es el filtro sí lo está, por los puntos de arriba.

### Checkpoints de esta vuelta

- [x] Bloqueante 1 cerrado.
- [x] Sin dependencias, tablas ni migraciones en el diff. `tests/baseline-rojos.json` no se toca.
- [x] Sin literales de país o moneda, ni Ordenex, en las líneas añadidas (grep sobre el diff: 0).
- [ ] `gate-completo`: no hay PR aún; lo corre CI.

### Salida real

Sobre la desechable:

- `pnpm run typecheck`: exit 0.
- `eslint` de los 5 archivos de código y tests del diff: exit 0.
- `vitest run` de `caja-173-alcance`, `e2e-sin-saltos`, `cierre-incluye-modelo-nuevo`, `deudas-d39-d40-modelo-nuevo`, `caja-backfill` y `ciclo-vida-gestion-final`: 6 archivos y 137 tests en verde, exit 0.
- `extension-empresa.test.ts -t R11`: 7 en verde y 68 saltados, exit 0.
- Playwright sintético de `desplegar`: 16 de 16, exit 0.
- Sonda de la guardia sin editarla: tabla del punto 3.

### No verificado

- **E2E reales:** `wallet.spec.ts` y `wallet-mensajeros.spec.ts` no se corrieron contra la app; cuento con la bitácora (`dinero` 49/0/0, una corrida). Lo mío es la función contra páginas sintéticas.
- **Producción:** las 0 filas son de la cita del PR #80. No se tocó esa base, ni se comprobó que el despliegue corra exactamente `origin/prod`.
- **La FK de `ciclo-vida-gestion-final`** con datos de E2E: no se reprodujo.
- **`caja-backfill` vacío en la desechable:** lo verde sin comprobar sale de leer el código y del «0 usuarios» de la bitácora; el recuento directo falló (sin el paquete `pg`).
- **Mutaciones sobre el módulo real:** no se editó; la sonda usa las funciones de la guardia con el texto añadido a parte.
- **Suite completa y guardias enteras:** las corre CI; solo se corrieron las relacionadas.
- **Grafo de código:** no se consultó; Grep y Read.
