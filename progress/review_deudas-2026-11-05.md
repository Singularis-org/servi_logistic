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
