# SLT-54 «Pantalla nueva de Tarifas» — revisión F2.2

Vuelta 1 sobre `origin/dev...f80d9ea6`. `origin/dev` no tiene commits fuera de la rama.

## Veredicto: RECHAZADO

Tres hallazgos mayores y once menores. El interruptor, el aislamiento, la RLS, las migraciones y la pantalla
frente a la maqueta **están bien**, y medidos. Los mayores 1 y 2 son del mismo tipo: el cierre de una empresa
activada enseña dinero del modelo nuevo con la forma del viejo. El mayor 3 es una línea.

## Hallazgos mayores

### M1. El rótulo «Ingreso de bodega por devoluciones a origen» es falso con el modelo nuevo, y el total no cuadra con sus filas

- **Dónde:** `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx:327` (rótulo);
  `cierre-factura.tsx:458`, `:1040`, `:1901-1904`, `:2627-2642`; `CascadasCierreMensajero.tsx:329`.
  El importe sale de `lib/utils/ingreso-bodega.ts:28-30`, donde la satélite cobra por **cualquier** resultado (SLT-52 R32).
- **Lo que enseña la pantalla, leído en el código:**
  1. La tarjeta total y la cascada dicen «por devoluciones a origen» sobre un total que incluye entregas.
  2. La fila de cada gestión solo pinta ese dato si `g.resultado === "devolucion_a_origen_por_rechazo"`
     (`cierre-factura.tsx:1901`): la fila de la entrega **no lo enseña**.
  3. Las sublíneas parten en «Automático (por plazo vencido)» y «Manual (mensajero)» todo lo que no es de plazo vencido:
     la entrega cae en «Manual».
- **Escenario, con las cifras de `e2e/tarifas-activacion.spec.ts:247,257`:** un cierre con una entrega (satélite 120) y un
  rechazo (satélite 450). La tarjeta dice 570 «por devoluciones a origen», «Manual 570», y las filas solo enseñan 450.
  El `maestro` que concilia lo que paga a la satélite no puede explicar 120, y el rótulo le dice que salieron de una
  devolución que no hubo. El E2E afirma el rótulo solo en el viejo (`:207`), así que nada lo vigila.
- **Por qué es mayor aunque R65 hable del flete:** es la misma falsedad que R65 corrige, y esta ficha es la que hace
  alcanzable el modelo nuevo.
- **Qué falta:** en el modelo nuevo, un rótulo que nombre lo que suma; la fila enseña el importe de cualquier resultado; las
  sublíneas de origen no se pintan o se limitan a los rechazos. Con test del viejo y del nuevo, y el E2E afirmando el rótulo
  nuevo. El viejo no cambia. Si Carlos prefiere ficha aparte, tiene que ser antes de cerrar EP-8.

### M2. La descarga de cierres pierde importes del modelo nuevo

- **Dónde:** `app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts:368-400`
  (`ESPECIFICAS_POR_RESULTADO`), una tabla escrita para el viejo.
- **Medido** con `filaDescargaGestionFundida` y un ingreso `tarifaModelo: "nuevo"`, flete 282,50, pago 100, satélite 120:

  | Resultado | Flete no entrega | Total empresa | Pago mensajero | Ingreso bodega |
  |---|---|---|---|---|
  | entregado | no aplica (va en flete) | sí | 100 | **vacío** |
  | reprogramado | **vacío** | **vacío** | 100 | **vacío** |
  | novedad | 282,50 | sí | 100 | **vacío** |
  | devolución a origen | 282,50 | sí | 100 | 120 |
  | incidente | **vacío** | **vacío** | **vacío** | **vacío** |

- **Escenario:** una empresa activada con flete por reprogramado de 250. El comprobante en pantalla lo cobra y los totales
  lo suman; en el archivo la fila va vacía, y la suma de la columna no llega al total. En esa hoja una celda vacía significa
  «no aplica», así que el archivo dice que no se cobró. El comentario de `:399` («un incidente no paga al
  mensajero y no genera ingreso de bodega») ya no es cierto en el nuevo.
- **Qué falta:** en filas del modelo nuevo, poblar lo que ese modelo cobra y paga por cualquier resultado, con el viejo
  literal igual. R62 solo ató el fulfillment de la descarga. Test por resultado y modelo.

### M3. R61: «distritos» escrito a mano en la lista de zonas

- **Dónde:** `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts:166-167` (`grupoUnicoDeZona`), usado en
  `TarifasZonas.tsx:27`. El test lo fija: `tests/components/TarifasModulo.test.tsx:255`.
- **Escenario:** en una empresa cuyo país llama «Municipio» a ese nivel, la zona dice «Zona especial: 8 distritos», mientras el
  selector de nivel de la misma pantalla (`TarifasModule.tsx:281`) sí usa la etiqueta del país. R61 y design §2.4 lo piden
  expresamente («N distritos» con `useEtiquetasGeograficas`). La guardia no lo ve porque solo busca la palabra con mayúscula
  inicial.
- **Qué falta:** pasar singular y plural a `grupoUnicoDeZona` y atarlo con un test con otras etiquetas.

## Hallazgos menores

1. **Encabezado de la descarga «Flete por devolución a origen + IVA»** (`cierres-gestiones-fundida-descarga-columnas.ts:292`).
   Menor: engaña en una novedad del nuevo, pero la fila lleva su resultado al lado y el importe es el correcto. Conviene
   resolverlo al arreglar M2.
2. **`PAGO_TIENDA_NOTA` incompleta** (`cierre-detalle-shared.tsx:380`). Menor: no da ningún importe y lo que afirma es cierto;
   solo calla los otros fletes no entregados, que tampoco se descuentan.
3. **`useToast`, 500 en `next dev`.** Menor. Sin causa raíz, pero solo en `next dev`: en `next start`, 3 de 3 en 200 y 0 menciones
   en el log de la última corrida E2E (bitácora, tanda F). `ToastProvider` envuelve `app/(app)/layout.tsx:136` y `LogoutButton` cuelga de él,
   y la página se recupera en cliente. Lo mismo que la tanda E: la hipótesis de dos instancias del módulo sigue sin medir. Va a
   `progress/deudas.md`; si aparece en `next start`, deja de ser menor.
4. **`detalle-movimiento-cierre-postgres` y `detalle-en-lote-464`: sí están ciegos, pero no hay regresión.** Sobre `servi_gate_slt54`
   salen rojos (14 fallan y 6 se saltan) por su siembra, y el baseline los tapa **también en CI**: la nota de la ficha, «mirar en
   `gate-completo`», no mediría nada. Medí con copias temporales con la siembra arreglada (crean sus FK en la transacción), sin
   tocar la lógica: **20 de 20 en verde** sobre `f80d9ea6`. Además, la rama vieja del `WHERE` la mata
   `cierre-aporte-modelo-nuevo` › «en el modelo viejo no cambia nada» (mi mutación W2). Deuda: portar los dos a `crearFksDeOrden`
   (SL-31) y sacarlos del baseline; hoy son un `WHERE` de dinero sin vigilancia en CI.
5. **`whatsapp-envio-ejecucion-admintienda`.** Confirmado: falla por «no hay ningun usuario modelo», el archivo no se toca en la rama
   y **no está en el baseline**. Si en CI la base llega sin usuarios a ese test, `gate-completo` se pondrá rojo: mirarlo en el PR.
6. **`lib/constants/wallet-rotulos.ts:32`,** «Flete por devolución a origen cobrado a la tienda». En el nuevo ese movimiento suma
   también reprogramado, novedad e incidente, y R64 ya los lista en su detalle. Misma falsedad, fuera de la letra de R65, que habla de
   cierres. Decidir con M1.
7. **R66 dice «recibidas» y no hay tal columna.** El desarrollo acierta (abajo), pero el requisito queda sin cumplir a la letra.
   Anotar en `requirements.md` que recibidas solo la abre `adminSatelite` y no monta la columna (feature 260).
8. **Design §7 sin actualizar:** el contrato de `cargarPantallaTarifas` no cita `preciosTienda`, ni el de `cargarZonaTarifas` cita `tiendaId`.
9. **`page.tsx:18`:** para sacar nombres de grupo llama a `cargarZonaTarifas` por zona, lo que lee también la referencia (1 + vehículos
   consultas) sin usarla. No es ruta de dinero.
10. **E2E sin repetir** tras subir `actionTimeout` a 30 s (`test.use` en tres specs). Solo da margen. Como el E2E corre en el PR a
    producción, no en el de `dev`, la última salida válida sigue siendo la de la bitácora, anterior a ese ajuste.
11. **R1 por superficie.** Wallets, cotización, cobro por rechazo y corrección no tienen un caso propio con valores sin activar: los cubre
    que `usaModeloNuevo` tiene tres llamadores, todos en el resolver, y la guardia de lectores. Mi mutación I1 lo pone rojo en 12 de 21.
    Suficiente, pero conviene saber que la prueba es por construcción. Aviso de lint sin relación: `money` sin usar en `CierresAdminModule.tsx:73`.

## Decisiones del dev que Carlos no ha visto

| Decisión | Dictamen |
|---|---|
| `cargarZonaTarifas` con `tiendaId?` | **Correcta.** Sin él sería una lectura por tienda en cada zona. Validado con zod; una tienda de otra empresa no devuelve nada (test con RLS). Falta en design §7 (menor 8). |
| `cargarPantallaTarifas` con `preciosTienda` | **Correcta.** R41 la necesita, el `admin` puede leerla y el `WHERE` está probado (mi W4). Falta en design §7. |
| «Varía» en zona con distritos marcados y sin marcar | **Correcta.** El cálculo viejo les cobra distinto (R21); enseñar solo el normal escondería el pacto. |
| `conceptoCongeladoPorResultado` (R64) | **Correcta.** Con la lista vieja, una novedad entraba en el importe y no en el detalle. La rama del viejo queda igual, por lógica y medido: W1, W2, P4 y las 20 copias del menor 4. |
| Tanda C: el recorte retira `item.fulfillment` | **Correcta.** Solo `adminSatelite` abre recibidas (`RecepcionSateliteService.ts:146`) y la columna está excluida (`recibidas-columns.tsx:83`). Mantiene la decisión firmada de la feature 260. Ver menor 7. |
| «1 grupo» distinto de la maqueta | **La regla es correcta por R44, y la diferencia es aceptable.** Su texto incumple R61 (M3). Carlos debería verla: su maqueta decía otra cosa. |

## Interruptor, aislamiento y migraciones

- **Sin activar, igual que antes; activada, el nuevo.** `usaModeloNuevo` lee `tarifa_activacion`, con tres llamadores, todos en
  `resolver-tarifas.ts`. No queda otro lector de `tarifa_valor` que decida importes (`ApiKeyRepository.ts:96` solo decide si una cuenta es
  eliminable). Forzarlo a `true` da 12 rojos de 21 y a `false`, 33 de 46.
- **RLS y empresa:** tabla con política `FOR ALL TO servi_app`, único, índice, FK, triggers de misma empresa y de no cambio de empresa, y
  `REVOKE UPDATE, DELETE`. Mutados con rojo: el `REVOKE` (I4), la política abierta (I6) y el relleno (I5).
- **R7:** sin traducir el `P2002`, dos conexiones reales dan `['error','ok']` (I3).
- **R11:** relleno por regla sobre `tarifa_valor`, sin historial. Ambas migraciones traen `down.sql`, y la ida y vuelta está probada.

## Pantalla frente a maqueta

Las medidas de la bitácora (tanda F) cubren cada fila de design §12, y cada una es una aserción de `e2e/tarifas-maqueta.spec.ts`. Comparé los
valores de la maqueta con el spec y la tabla; no repetí el E2E. La pantalla vieja salió entera, y las actions de precio no existen
(`tarifas-action.test.ts`, guardia `tarifas-sin-escritura-vieja`). Diferencias de la bitácora aceptables: selector de modo por vehículo,
«Quitar» y «Renombrar», «M de T» tras activar.

## Mutaciones del reviewer

Autocomprobación: cada conjunto corrió antes sin mutar, con más de 0 tests y 0 fallos. Cada mutación se revirtió por script; `git status` limpio
al terminar. Sobre `servi_gate_slt54`. **26 de 27 matadas por aserción.**

| Id | R | Mutación | Resultado |
|---|---|---|---|
| W1 | R64 | rama nueva sin `conceptos: { some }` | Matada (4 de 6) |
| W2 | R64 | la rama vieja acepta los resultados del nuevo | Matada |
| W3 | R14 | faltantes sin `tiendaId: null` | Matada |
| W4 | R41 | precios sin `tiendaId not null` | Matada |
| W5 | R41 | tiendas sin filtro de rol | Matada |
| W6 | R30 | cobertura sin `grupoId` | Matada |
| W7 | R30 | cobertura sin `vehiculoId: null` | **Sobrevive, equivalente:** el CHECK `tarifa_valor_niveles_tienda` lo impide |
| W8 | R52 | ocupado sin `grupoId` | Matada |
| I1, I2 | R1, R2 | interruptor fijo en `true`, en `false` | Matadas (12 de 21; 33 de 46) |
| I3 | R7 | no traduce el `P2002` | Matada |
| I4, I5, I6 | R8, R11, R12 | en la migración: sin `REVOKE`, relleno de otra tabla, política abierta | Matadas |
| S1 | R24 | activada lee la referencia | Matada |
| S2 | R55 | `adminTienda` lee | Matada |
| S3 | R5 | sin la puerta de rol | Matada (10 de 24) |
| P1 | R15 | `every` por `some` | Matada |
| P2 | R21 | ignora la bodega principal | Matada |
| P3 | R23 | sin «Varía» | Matada |
| P4 | R64 | la gemela en memoria pierde novedad | Matada (equivalencia de 7680 celdas) |
| O1 | R66 | fulfillment en % sin base | Matada |
| O2 | R66 | el recorte deja pasar el dato | Matada |
| O3 | R62 | el nuevo lee la tarifa | Matada |
| U1 | R36 | `ivaPct: null` en un pago | Matada |
| U2 | R35 | vaciar no quita | Matada |
| A1 | R27 | `actualizarZona` admite `tarifas` | Matada |

## Lo que corrí

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | exit 0 |
| `eslint`, código del diff | 0 errores, 1 aviso |
| 32 archivos de la ficha, sobre `servi_gate_slt54` | 692 de 692 |
| `pnpm run test:guardias` | 4612 pasan y 4 fallan, los 4 de `dependencias-declaradas-presentes`, en el baseline |
| Script: `tasks.md > Mapa R → test` contra el disco | 70 de 70 R, archivos y títulos presentes |

**Sin correr, por encargo:** suite completa, E2E, `./init.sh`. El grafo no tiene proyecto para este worktree: usé Grep y Read.

## Checklist

**`CHECKPOINTS.md`**

- [x] `requirements.md` con EARS numerados; `design.md` con alternativas descartadas y `## Lo que ya existe`, sin recrear nada de esa lista.
- [ ] Todas las tasks `[x]`: faltan **T6.3 y T6.5**, ambas del leader. T6.3 tiene la medición en la ficha y hay que repetirla antes del PR.
- [x] Assignee y rama publicada (ficha).
- [x] Cada R con test; el mapa está en `progress/impl_SLT-54.md`. Ver la tabla de abajo.
- [x] Typecheck y lint.
- [ ] `gate-completo` en verde: CI no ha corrido. Ver menor 5.
- [x] E2E de los flujos críticos, con su salida en la bitácora (`dinero`, `reparto`, `aislamiento`). Ver menor 10.
- [x] Sin dependencias nuevas (`package.json` y `docs/dependencias.md` sin cambios).
- [x] Sin secretos; ningún webhook nuevo; nada de entorno escrito en el código.
- [ ] `./init.sh` en verde: no corrido aquí, por encargo. El leader midió el gate.
- [ ] `progress/review_SLT-54.md` con veredicto OK: **RECHAZADO**.
- [ ] `Cierre` y desmontar el worktree: pendientes, tras el PR.

**`docs/checkpoints-proyecto.md`**

- [x] Tabla nueva con RLS y `organizacion_id`; las queries nuevas filtran por empresa, probadas con dos empresas.
- [x] Migraciones con `down.sql`, sin editar ninguna aplicada.
- [x] Ningún recurso de la app de origen; ningún `console.log` nuevo.
- [x] Capas: lógica en servicios, datos en repositorios, mutaciones en actions, zod en el borde.
- [ ] País y moneda desde configuración: **falla por M3**. Moneda correcta; el único símbolo del diff en `app/` y `lib/` está en un comentario.
- [x] Autorización en el servidor: cada service decide `forbidden`. Tarifas es núcleo: no hay módulo que apagar.

**`docs/perfil-agentes.md > reviewer`**

- [x] Sin bloqueantes de tabla, RLS o `down.sql`. Sin dependencia nueva.
- [x] Los comentarios explican el porqué.

## Trazabilidad

Verificación: **M** = mi mutación lo puso rojo. **C** = lo corrí en verde y leí el caso. **E** = E2E, salida en la bitácora, no repetido por mí.

| R | Test | Verif. |
|---|---|---|
| R1 | `tarifas-flexibles-respaldo` › «empresa sin activar…», `tarifas-flexibles-snapshot`, `tarifa-valor-lectores.guardia`; E2E `tarifas-activacion` caso 2 | M (I1), E |
| R2 | `tarifas-flexibles-resolver` › «activada sin valores…»; E2E caso 4 | M (I2), E |
| R3 | `tarifa-activacion` › «fijar y quitar no cambian el modelo» | C |
| R4 | `tarifa-activacion` › «activación con actor e historial…» | C |
| R5 | `tarifa-activacion-service` › «matriz de roles» | M (S3) |
| R6 | `tarifa-activacion-service`, `TarifasActivar`; E2E caso 3 | C, E |
| R7 | `tarifa-activacion` › «dos activaciones simultáneas» | M (I3) |
| R8 | `tarifa-activacion-migration` › «la app no modifica ni borra», `TarifasModulo` | M (I4) |
| R9 | `tarifa-activacion` › «activar no toca…»; E2E `zona-especial` caso 4 | C, E |
| R10 | `cierre-pago-congelado`, `tarifas-flexibles-snapshot` › «activación entre pago y cobro» | C |
| R11 | `tarifa-activacion-migration` › «relleno», «relleno y bajada» | M (I5) |
| R12 | `tarifa-activacion` › «activar A no cambia B», `tarifa-activacion-migration` › RLS, `tarifas-referencia`; E2E R68 | M (I6), E |
| R13 | `faltantes` › «son exactamente tres» | C |
| R14 | `faltantes`, `tarifas-referencia` › «R14: lo que juzgan…» | M (W3) |
| R15 | `faltantes` › «le falta si queda un vehículo activo…» | M (P1) |
| R16 | `faltantes` › «no suma faltante y se informa» | C |
| R17 | `faltantes`, `TarifasModulo`; E2E caso 1 | C, E |
| R18, R19 | `TarifasActivar`; E2E caso 3 | C, E |
| R20 | `TarifasValores` › «la referencia no entra en el campo»; E2E caso 1 | C, E |
| R21 | `referencia-vigente`, `tarifas-referencia` | M (P2) |
| R22 | `referencia-vigente` › «un 0 configurado…» | C |
| R23 | `referencia-vigente` › «dos variantes…» | M (P3) |
| R24 | `tarifas-referencia` › «activada no lee el viejo», `TarifasValores` | M (S1) |
| R25 | `TarifasPage.test.tsx` | C |
| R26 | `tarifas-action` › «las acciones viejas ya no existen», `tarifas-sin-escritura-vieja.guardia` | C |
| R27 | `zonas-action` › «la action rechaza costos», `zona-guardado-conserva-costos` | M (A1) |
| R28 | `superficie-de-uso.guardia`, `tarifas-sin-escritura-vieja.guardia` | C |
| R29 | `tarifa-activacion` › «guardar no escribe en el viejo» | C |
| R30 | `cobertura-repository` › «tarifa general por modelo» | M (W6) |
| R31, R32 | `tarifa-empresa-nueva` | C |
| R33, R34 | `TarifasValores`, `TarifasModulo` | C |
| R35 | `TarifasValores` › «R35: vaciar…» | M (U2) |
| R36 | `TarifasValores` › «R36…», `tarifas-action` | M (U1) |
| R37, R38 | `TarifasValores` › «la carrera…», «lo digitado mientras guarda…»; `tarifas-action` | C |
| R39, R40 | `TarifasValores`, `TarifasModulo`; E2E casos 3 y 5 | C, E |
| R41 | `TarifasTiendas`, `tarifas-referencia` › «la pantalla de A…», «los precios de tienda…» | M (W4, W5) |
| R42-R46 | `TarifasGrupos`, `tarifas-action`, `tarifas-referencia`; E2E `zona-especial` | C, E |
| R47-R51 | `TarifasVehiculo`, `tarifas-referencia` › «un vehículo dado de alta…» | C |
| R52 | `tarifa-valor-service`, `tarifas-flexibles-escritura` › «inactivo» | M (W8) |
| R53 | `tarifas-flexibles-resolver` › «vehículo inactivo sigue pagando» | C |
| R54 | E2E `tarifas-maqueta` › «8 vehículos», `TarifasVehiculo` | C, E |
| R55 | `TarifasPage.test.tsx`, `tarifas-pantalla-service` › «matriz de roles»; E2E R68 | M (S2), E |
| R56 | `menu-visibility`, `destino-post-login` | C |
| R57, R58 | `TarifasModulo`, `TarifasPage.test.tsx`, `TarifasValores`, `TarifasActivar` | C |
| R59, R60 | E2E `tarifas-maqueta`, `TarifasDisposicion` | C, E |
| R61 | `TarifasValores`, `TarifasDisposicion`, `etiquetas-geograficas-sin-literal.guardia` | **Falla: M3** (el test ata el literal) |
| R62 | `CierreDesgloseModeloNuevo`, `cierres-gestiones-fundida-descarga-columnas` › «SLT-54 (T5.2, R62)» | M (O3) |
| R63 | `CierreDesgloseModeloNuevo` › «la tarjeta del modelo nuevo»; E2E caso 4 | C, E |
| R64 | `cierre-aporte-modelo-nuevo`, `aporte-por-orden-equivalencia` | M (W1, W2, P4) |
| R65 | `CierreDesgloseModeloNuevo`, `CierreBodegaDetalleCascadas`, `CierreMensajeroDetalleCascadas` | C |
| R66 | `convergencia-tarifa-listado-cierre`, `OrdenesColumnaFulfillment` | M (O1, O2) |
| R67 | E2E `tarifas-activacion` › casos 1 a 5 | E |
| R68 | E2E `tarifas-activacion` › «dos empresas y permisos» | E |
| R69 | E2E `zona-especial-dos-empresas` casos 1 a 4, `e2e-sin-saltos.guardia` (`EXCEPCIONES` vacía, sin `fixme`) | C, E |
| R70 | E2E `tarifas-maqueta`, `TarifasDisposicion` | C, E |

**Para volver a revisión:** arreglar M1, M2 y M3 con sus tests, y decidir los menores 1, 6 y 7 junto con ellos. La vuelta 2 se acota a ese diff.

## Vuelta 2 (acotada a 8b922a10..7f8a77cb; ampliada porque enmienda el spec, R71 y R72, y toca piezas compartidas)

### Veredicto: RECHAZADO

Un hallazgo mayor y once menores. M1, M2 y M3 están cerrados, los `WHERE` nuevos están bien probados y las guardias siguen
vigilando lo que vigilaban, con un hueco menor. Lo que rechaza es D38: **la tienda lee en su propia cuenta un cobro por una
devolución que no hubo.** Si Carlos prefiere llevarlo a ficha aparte, es decisión suya y tiene que constar antes de activar a una
empresa; sin esa decisión, bloquea.

### Mayor

#### D38. La tienda ve «te cobró el flete por devolución a origen» por un reprogramado

- **Dónde:** `app/(app)/mi-wallet/_components/mi-wallet-labels.ts:108,111`, leído en `MiEstadoCuenta.tsx:55` (tabla, filtro y descarga).
  La misma frase en la oficina: `app/(app)/wallet/tiendas/_components/desglose-tienda-labels.ts:47,50`, leída en `EstadoCuentaTienda.tsx:40`.
  **D38 solo cita la de la oficina: le falta la que ve la tienda.**
- **Quién lo ve:** `adminTienda`, es decir, un tercero que paga (`/mi-wallet`); y `maestro` y `admin` (`/wallet/tiendas`).
- **Medido**, con `WalletTiendaFeedService.construirMovimientosPorTienda` real, una gestión `reprogramado` del modelo nuevo y flete
  de 250 al 13 %. `TIENDA_DEBITA_FLETE_DEVOLUCION` vale `true` por defecto.

  | Categoría | Importe | Lo que lee la tienda |
  |---|---|---|
  | `flete_devolucion` | 250,00 | «La empresa te cobró el flete por devolución a origen» |
  | `iva_flete_devolucion` | 32,50 | «La empresa te cobró el IVA del flete por devolución a origen» |

- **¿Falso o impreciso?** **Falso** si la tienda no tuvo devoluciones en ese cierre, como aquí: el importe es correcto y el motivo no
  ocurrió. Con devoluciones y otros fletes en el mismo cierre, el movimiento los agrega por tienda y categoría, y entonces es impreciso.
- **Por qué mayor:** es el mismo defecto que M1, en una superficie peor: M1 lo leía el `maestro`, que puede abrir las filas, y esto
  lo lee quien recibe el cobro y puede reclamarlo. Esta ficha es la que hace alcanzable ese estado. Y ya se arregló en el libro de la caja.
- **Qué falta:** rotular por fila como `conceptoDeMovimientoCaja`, en las dos superficies. Comprobar a qué fila llega el dato: las dos
  pantallas pintan la fila del estado de cuenta, y D38 solo nombra `WalletTiendaMovimientoDTO`. Una empresa sin activar no cambia: test
  literal del viejo y test del nuevo. De paso, corregir el comentario `WalletTiendaFeedService.ts:18`, «ya SOLO nacen de una gestion
  `rechazada`», falso desde SLT-52.

### Menores

1. **D39, `ComposicionGananciaCard.tsx:219,267` y el filtro de `LibroCajaBarra.tsx:114`.** Los ven `maestro` y `admin`, nadie de fuera. En
   la tarjeta, un periodo sin devoluciones dice «Flete por devolución a origen cobrado a la tienda» sobre un total que es de otros
   fletes: falso en ese caso, pero la fila se abre y `DetalleFilaComposicion` nombra bien cada movimiento (test del encargo, móvil
   incluido). El filtro no enseña importe, y es impreciso. Menor por audiencia y porque la verdad está a un clic. Decidir antes de cerrar EP-8, como dice la deuda.
2. **Menor 1, encabezado «Flete por devolución a origen + IVA»** (`cierres-gestiones-fundida-descarga-columnas.ts:292`). Sigue menor: el
   importe es correcto y cada fila lleva su resultado. Y no es nuevo: en el modelo viejo una novedad ya cae en esa columna con
   282,50 (test literal «viejo, novedad»). Cambiarlo tocaría el archivo del viejo.
3. **`ZonasModule.tsx:250` y `GeografiaSelector.tsx:266`.** «N distrito(s)» a mano. Preexistente, fuera del diff y sin dinero; R61 habla de
   la pantalla de Tarifas. Falso solo en un país con otro nombre de nivel. No consta en `progress/deudas.md`: hay que anotarlo.
4. **El rótulo del libro de la caja no tiene E2E.** Menor: los tres tramos están cubiertos por separado (el dato, en
   `cierre-incluye-modelo-nuevo`; el rótulo, en `WalletConceptoModeloNuevo`) y `WalletService.ts:285-287` propaga la fila con `...m`.
   Leído, no ejecutado de punta a punta. Lo paga un test de una línea si se toca el E2E por D38.
5. **Quedan notas del mismo tipo que M1, sin deuda escrita.** `PARA_LA_CENTRAL_NOTA` dice «lo que gana la bodega satélite por las
   devoluciones a origen» en `CierresBodegaAdminModule.tsx:267`, junto a la nota que la Tanda G sí corrigió, y en `cierre-factura.tsx:1073`.
   `ConciliacionSatelite.tsx:167,174` lleva esa nota y `GANA_BODEGA_SATELITE_NOTA` vieja, sobre el mismo 570. Rótulo cierto, importe cierto, nota
   falsa, audiencia interna. La primera se arregla en una línea; las otras piden dato. Añadir a D39 o resolver con D38.
6. **Notas de pago a la tienda en el nuevo.** `GANA_LA_TIENDA_NOTA` y `PAGO_TIENDA_HOY_NOTA` (`CascadasCierreMensajero.tsx:201,272`) y
   `DESGLOSE_POR_TIENDA_NOTA` (`DesglosePorTienda.tsx:147`) atribuyen la diferencia solo al flete por devolución. Imprecisas, como el menor 2 de la vuelta 1, no falsas.
7. **Guardia `caja-173-alcance`: el `Pick` abre una tabla con importes y nada lo compensa.** Ver abajo, G4 y G5.
8. **El filtro por cierre del lote no tiene test** (`detalle-modelo-nuevo.ts:36`, B5). Sin él, la respuesta es igual, porque luego se pregunta por
   id, pero cada página lee todos los cierres nuevos de la empresa. Es coste, no dato.
9. **R71, redacción.** El comportamiento del libro de la caja va en una *Nota* descriptiva, sin DEBE, y es un requisito con test. Pasarlo a
   cláusula EARS.
10. **`CierresAdminRepository.ts:584`:** `type CierreResumenRow =Prisma…`, sin espacio. Cosmético.
11. **`TarifasValores.test.tsx:135`** lee el popup igual que el test que se arregló. Mismo riesgo de rojo intermitente; no falló aquí.

### Lo que pediste verificar

**1. M1, M2 y M3: cerrados.**

- **M1:** con entrega 120 + rechazo 450, «Ingreso de bodega» sobre 570 en tarjeta, región y par; sin sublíneas; filas 120 y 450; el mensajero no lo ve.
  Mi F1 (modelo fijo en viejo) da 4 rojos de 17 y F2 (pinta el 0), 1. La tarjeta del listado y la consolidación, que eran el hueco de la Tanda
  G, siguen el dato (F5, 3 de 11). El E2E es del implementer, no lo repetí.
- **M2:** reprogramado con flete 250: 282,50 en la columna con IVA, 282,50 de total, pago 100 e ingreso de bodega 120. Las cinco filas del nuevo son las del
  encargo, y la columna suma lo que da el comprobante. Mi F3 da 2 de 55. El encabezado «Ingreso bodega» de esa columna es neutro: no miente.
- **M3:** «8 municipios», «1 municipio»; mi F6 (cruzados) da 3 de 22.
- **Una empresa sin activar no cambia:** en el rango, los tests existentes solo ganan líneas (única excepción, `TarifasModulo`, punto 5), las constantes de
  texto viejas no se tocaron, el `aria-label` compuesto da el mismo literal, y hay test literal del viejo por superficie. Mi F4 (sin modelo se lee como
  nuevo) da 4 de 55.

**2. `incluyeModeloNuevo` y `incluyeModeloNuevoAgregado`: bien.** Salen de `cierre_detail.tarifa_modelo`, sin leer `tarifa_activacion`. El caso de la
activación usa la solicitud real: el cierre anterior sigue en falso con la empresa ya activada, también como único conjunto; el siguiente, en
verdadero. Mixto dentro de un cierre y entre cierres, medidos. Sin N+1: una sentencia con tres cierres, y ninguna en una página sin cierres.
La empresa la pone la RLS, y el test depende de ella: leer sin `servi_app` lo pone rojo (B8).

| Id | Mutación | Resultado |
|---|---|---|
| B1, B2 | Conteo sin `WHERE`; conteo del viejo | Matadas (4 y 6 de 9) |
| B3, B4 | Lote sin filtro de modelo; lote del viejo | Matadas (4 y 6 de 9) |
| B5 | Lote sin filtro de cierre | **Sobrevive**: misma respuesta, más lectura (menor 8) |
| B6 | Libro sin mirar `origen_tipo` | Matada (1) |
| B7 | Agregado con `every` | Matada (2) |
| B8 | El test lee sin el rol de la app, sin RLS | Matada (1, «otra empresa no contamina») |
| B9 | Umbral `> 1` | Matada (6) |

**3. Guardias: no se debilitó lo que vigilaban, salvo un hueco menor.**

- `nombres-estado-retirados`: la excepción es **por texto y con recuento exacto**. Un tercer «4 entregadas» (G1), «Entregadas hoy» (G2) y retirar la frase
  para dejar la excepción caducada (G3) salen rojos. Admite «gestiones no entregadas» y nada más. Correcta.
- `caja-173-alcance`, lo que sigue en pie: módulo sin declarar (G7), SQL crudo de escritura en el módulo nuevo (G6) y nombrar el ledger de la tienda (G8) salen
  rojos. R33 prohíbe leer los otros **libros**, y `cierre_detail` no lo es.
- **El hueco:** `cierre_detail` tiene importes. Con el `Pick` ampliado, sumarlos por Prisma desde el repositorio (G4) o desde el módulo nuevo (G5)
  **sobrevive**: antes `tsc` lo paraba en el repositorio. El módulo del cruce sí tiene `not.toMatch(/monto/i)` y este no, aunque el comentario de la guardia dice que un
  módulo nuevo se somete «a las reglas que le toquen». Falta: que el repositorio no use `cierreDetail.` y que el módulo no nombre `monto`, `_sum` ni `aggregate`.

**4. R71 y R72: valen, con el menor 9.** Forma MIENTRAS…DEBE, comprobables, «NO DEBEN» para el viejo. Filas en el mapa de `tasks.md:163-164`, con archivos y títulos
presentes; T7, T8 y T9 en `[x]`. R71 agrupa varias superficies, y *Fuera: D38 y D39* no es un requisito sino una exclusión, que **este veredicto discute para D38**.
Siguen «pendientes de visto bueno de Carlos en el PR»: hay que pedírselo.

**5. `TarifasModulo` › «R33, R41»: arreglo real, no tapa un defecto.** Con el test viejo sobre `HEAD`, rojo en 4 corridas de 4 (`Unable to find… "option"`). Medí la serie tras el clic en ese test, ejecutando el archivo entero: 0 opciones hasta los 2 ms, 3 opciones a los 5 ms y estable hasta los
400 ms, con 0 llamadas a `cargarZona`. Es decir, el popup no parpadea, no se cierra y no recarga la zona. Ejecutado solo, abre a los 0 ms. Las aserciones son las
mismas; solo se espera. No busqué por qué el orden de los tests cambia esos 5 ms. Tras el cambio, 3 de 3 en verde.

### Mutaciones del reviewer

`v2-mut.cjs`: corre antes la base y aborta si no hay tests, hay rojos o hay saltos (`BASE total 160, fail 0, skip 0`); restaura cada archivo en `finally`. Sobre
`servi_gate_slt54`. **20 de 23 matadas por aserción; sobreviven B5, G4 y G5**, explicadas arriba. Las F y las G que no salen en la tabla están en su punto.

### Lo que corrí

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | exit 0 |
| `eslint`, 7 archivos del diff | 0 errores |
| 11 archivos de la ficha y guardias tocadas, sobre `servi_gate_slt54` | 229 de 229 |
| `pnpm run test:guardias` | 4614 pasan, 4 fallan, los de `dependencias-declaradas-presentes`, en el baseline |
| Literales prohibidos en las líneas añadidas | Ninguno |
| Dependencias, esquema y migraciones en el rango | Sin cambios |

**Sin correr, por encargo:** suite completa, E2E, `./init.sh`. El grafo no tiene proyecto para este worktree: Grep y Read. Tasks abiertas: T6.3 y T6.5, del leader, como en la vuelta 1.

**Para volver a revisión:** arreglar D38 con test del viejo y del nuevo en las dos superficies, o que Carlos decida por escrito llevarlo a ficha aparte. La vuelta 3 se acota a ese diff.

## Vuelta 3 (acotada a a736f544..ecacd68b)

### Veredicto: OK, con 6 menores

D38 está cerrado en las dos superficies, en pantalla y en descarga. Sin hallazgos mayores. Lo único que corrige lo que se afirmó: D40 llama «interna» a una
audiencia que incluye al `adminSatelite` (menor 1), y el `:58` de `wallet-mensajeros` no se explica por la rama, pero su causa sigue sin medir (menor 3).

### Menores

1. **D40, audiencia mal escrita.** `cierre-factura.tsx:1073` no lo leen solo `maestro` y `admin`: `CierreBodegaFacturaResumen` también se pinta en
   `CierresBodegaSolicitadosLista`, que `ConsolidacionBodegaModule.tsx:463,471` monta para el `adminSatelite`, sobre su propio cierre. `ConciliacionSatelite.tsx:167,174` sí es solo de
   `maestro` y `admin` (`wallet/satelites/[zonaId]/page.tsx:20`, R81). Corregir el texto de D40. Si ese rol es un tercero, los docs no lo dicen: que lo tenga presente Carlos.
2. **Dos menores de la vuelta 2 sin rastro.** El menor 2 (encabezado «Flete por devolución a origen + IVA») y el menor 6 (`GANA_LA_TIENDA_NOTA`, `PAGO_TIENDA_HOY_NOTA`,
   `DESGLOSE_POR_TIENDA_NOTA`) no están en `progress/deudas.md`, ni en R71 *Fuera*, ni en las tablas de las tandas I1 e I2. Añadirlos a D40 o decir que se aceptan.
3. **`e2e/wallet-mensajeros.spec.ts:81` es un clic crudo, y no hay deuda.** `e2e/_escenarios/pulsar.ts` se declara «única fuente para todo clic del E2E que abre algo»; este abre un panel sin
   `abrirCon`. Ver el punto 6: anotar la deuda, con causa sin medir.
4. **Comentarios que siguen diciendo lo que ya no es.** `mi-wallet-labels.ts:103` nombra «el filtro por concepto», que no existe, y `CONCEPTO_MI_WALLET_TODOS_OPTION` (`:164`) no tiene lector fuera de su test.
   `lib/utils/mapeo-concepto-tienda.ts:14-15` y `lib/config/wallet-tienda.ts:38` repiten que esas categorías solo nacen de un rechazo, lo mismo que se corrigió en `WalletTiendaFeedService.ts`.
5. **`₡` literal** en `EstadoCuentaTiendaModeloNuevo.test.tsx:197,198,204,205`. Solo en test, con precedente (106 de 455 archivos de `tests/components`), y no hay guardia que lo pare. `TarifasValores.test.tsx` usa `monedaConfig.simbolo`.
6. **R71, redacción.** *Fuera* lista D41, que es de R61 y no de R71. La nota de «Para la central» (`PARA_LA_CENTRAL_NOTA_MODELO_NUEVO`) tiene test con la etiqueta «R71 (menor 5)», pero la cláusula no la pide.

### Lo que pediste verificar

**1. D38: cerrado.** Medido de punta a punta con un test temporal, ya borrado: `WalletTiendaFeedService` real, gestión `reprogramado` del modelo nuevo, flete 250 al 13 %, `EstadoCuentaService` real por sus cuatro entradas, como
`servi_app`, y las funciones de rótulo reales.

| Superficie, pantalla y descarga | Importe | Modelo nuevo | Sin activar (literal, importe de `crearFila`) |
|---|---|---|---|
| `/mi-wallet` | 250,00 | «La empresa te cobró el flete de gestiones no entregadas» | «La empresa te cobró el flete por devolución a origen» |
| `/mi-wallet` | 32,50 | «La empresa te cobró el IVA del flete de gestiones no entregadas» | sin fila en este caso; literal en el test de componente |
| `/wallet/tiendas` | 250,00 | «Flete de gestiones no entregadas cobrado a la tienda» | «Flete por devolución a origen cobrado a la tienda» |
| `/wallet/tiendas` | 32,50 | «IVA del flete de gestiones no entregadas cobrado a la tienda» | sin fila en este caso; literal en el test de componente |

- Tabla, desplegable y las dos hojas de la descarga pasan por `rotulos.concepto`. Los dos diccionarios por categoría ya solo los leen estas dos funciones, más «Registrar movimiento» (`wallet-conceptos-manuales.ts:452`), que nombra una categoría y no una fila.
- Los otros textos con «devolución a origen» de estas pantallas son del cobro por rechazo (`gestion_orden`) y de su anulación, que sí fueron una devolución.
- **El filtro de `/mi-wallet` ya no existe: confirmado.** Sin `conceptos` en `MiEstadoCuenta.tsx`; `useConceptosConMovimientos` y `opcionesDeConceptos` solo los usa `LibroCajaBarra`. Lo de «tabla, filtro y descarga» de mi vuelta 2 estaba mal: lo escribí fiándome del comentario del diccionario, sin mirar el lector.
- `/wallet/tiendas` no tiene E2E de este rótulo; `/mi-wallet` sí. Lo cubren el componente y la medida de arriba.

**2. `incluyeModeloNuevo`: bien.** `WHERE` por cierre, modelo y tienda; la empresa la pone la RLS, y el test depende de ella (T1). Una sentencia por página y ninguna sin cierres. Mixto dentro de un cierre, entre cierres y cierre anterior a activar, con la solicitud real, medidos. W1 a W7, S1 a S3, R1, R2 y T1: **13 de 13 matadas**. W6 (un cierre con alguna fila vieja deja de contar) y S1 (cualquier cierre nuevo de la página marca todas las filas) son las que miden mixto y activación.

**3. Guardia `caja-173-alcance`: no se debilitó nada, y el hueco está cerrado.** En el rango solo salen dos comentarios, el doble `PrismaClient["cierreDetail"]`, que pasa a uno más estrecho, y la lista de tablas ajenas, que crece. **G4 y G5, con el texto literal de la vuelta 2, caen** (2 y 1 de 39). También caen las variantes nuevas (`EstadoCuentaRepository` por Prisma y por SQL, corchetes, filtro por importe, alias, suma en JS) y las regresiones G6, G7 y G8. La lista de columnas sale del esquema y tiene control de no vacuidad.
Lo que no mide, sin ser hallazgo: un módulo nuevo importado por `EstadoCuentaRepository` no entra en el censo, que es solo de la caja, como antes de esta ficha. Y un alias a `.count()` escaparía, pero no lee importes.
La excepción de `nombres-estado-retirados` para `mi-wallet-labels.ts` es por texto y con recuento: un tercero (GN1) y retirar la frase (GN2) salen rojos.

**4. R71: vale; D39 y D40, declaradas con los menores 1 y 2.** El libro de la caja y D38 pasan a cláusula MIENTRAS…DEBE, comprobable, con «NO DEBEN» para el viejo y el cobro por rechazo. El mapa de `tasks.md:168` apunta a archivos y títulos presentes; T10.1 y T10.2 en `[x]`. D39 sigue siendo correcta: las líneas `ComposicionGananciaCard.tsx:219,267` y `LibroCajaBarra.tsx:114` están vivas y sin dato de fila. **Hay que pedirle a Carlos el visto bueno de R71 y R72 en el PR.**

**5. D40: menor, se confirma, con la audiencia corregida.** La falta de dato es cierta: `CierreBodegaResumen` y `ConsolidacionSateliteDTO` no traen el campo, solo `CierreBodegaResumenLite`, y `CierreBodegaFacturaResumen` no pasa `modeloNuevo`. Una nota neutra cambiaría el literal del viejo, y eso R71 lo prohíbe. Rótulo («Gana la bodega satélite», `:1063`) e importe son ciertos; lo impreciso es el motivo en una nota. No es un cobro, y quien la lee además de la oficina es la satélite, sobre lo que ella gana. Por eso no sube, aunque el motivo «audiencia interna» no valga para `:1073` (menor 1). Queda como está en D40: antes de cerrar EP-8.

**6. `wallet-mensajeros.spec.ts:58`: la rama no lo explica, y ya era frágil. La causa sigue sin medir.**

- **Lo que la rama no toca.** Desde la base (`c301fc87`): `EstadoCuenta.tsx`, `app/(app)/wallet/mensajeros` y los layouts, 0 líneas. `EstadoCuentaService` solo cambia `leerTienda`; el campo no llega a la fila del mensajero, y lo afirma el test «la fila del mensajero no lleva el campo». De `wallet-rotulos.ts` la página solo lee `ORIGEN_PAGO_LABEL`, que no cambia: la rama añade `conceptoDeMovimientoCaja`, y esa función no se llama aquí. El DTO solo gana un opcional.
- **Lo que la rama sí cambia alrededor:** `playwright.config.ts` añade `tarifas-maqueta` y `tarifas-activacion` al proyecto `dinero`, por delante de este spec, con `workers: 1`. Puede cambiar carga y orden; no lo medí. `menu-visibility.ts` añade la entrada de Tarifas y `globals.css` retira animaciones de la tarifa vieja; por lectura, ninguno de los dos desmonta una fila, sin medirlo.
- **Ya era frágil:** este mismo test cayó en CI (run 40875969358, en la navegación) y `b0322828` solo arregló el enlace. El clic de la línea 81 sigue crudo. En CI hay `retries: 1`, que lo absorbería; en local, 0.
- **Lo medido:** el spec solo, 15 repeticiones sobre una base desechable, con la misma build: **45 de 45 pasan**, y el `:58` tarda de 1,5 a 2,2 s. No lo reproduje. Corregido en la bitácora: el clic no «agotó los 30 s». Son 30 s de plazo de todo el test (`Test ended`), con un recorrido normal de 1,2 a 2,2 s, así que algo quedó parado casi todo el plazo. El registro acaba en `detached… retrying` y no vuelve a resolver el botón. El log de ese servidor no tiene errores. La traza de ese fallo se perdió con la corrida siguiente.
- **Sin comparar contra la base:** haría falta otra build y varias corridas de `dinero` enteras, y eso es del CI. No bloquea; deuda en el menor 3. Si vuelve a caer, guardar `error-context.md` antes de repetir.

### Mutaciones del reviewer

`v3-mut.cjs`, en el scratchpad: corre antes la base y aborta si no hay tests, hay rojos o hay saltos (`BASE total 89, fail 0, skip 0`); restaura cada archivo en `finally`. Sobre `servi_gate_slt54`. **33 de 33 matadas por aserción**, con 0 saltos en todas. `FINAL total 89, fail 0`, y árbol limpio.

| Id | Mutación | Rojos |
|---|---|---|
| W1, W2 | Lote sin filtro de modelo; lote del viejo | 5 y 9 de 12 |
| W3, W4, W5 | Lote sin filtro de cierre; de tienda; sin `distinct` | 1, 1 y 1 |
| W6 | Mixto: un cierre con fila vieja deja de contar | 4 |
| W7 | Consulta aunque no haya ids | 2 |
| S1, S2, S3 | Cualquier cierre nuevo marca la página; sin `origen_tipo`; toda fila de cierre es nueva | 2, 1 y 6 |
| R1, R2 | No pasa la tienda; una consulta por cierre | 1 y 1 |
| T1 | El test lee sin el rol de la app, sin RLS | 1 |
| L1, L2 | `/mi-wallet` y oficina: ausente se lee como nuevo | 3 y 4 de 29 |
| L3, L4 | La superficie no pasa el campo | 7 y 9 |
| L5, L6, L7 | Cambia el literal del viejo; el IVA de la oficina se queda viejo; el nuevo vuelve a decir devolución | 6, 6 y 7 |
| **G4, G5** | Literales de la vuelta 2 | **2 y 1 de 39** |
| G4b, G4c, G4d | Estado de cuenta por Prisma; por SQL; caja por corchetes | 1, 1 y 2 |
| G5b, G5c, G5d | Módulo: filtra por importe; selecciona por alias; suma en JS | 1, 1 y 1 |
| G6, G7, G8 | Regresiones: SQL crudo; módulo sin declarar; nombra el ledger de la tienda | 2, 1 y 1 |
| GN1, GN2 | `nombres-estado-retirados`: un tercer «entregadas»; la excepción caduca | 1 y 1 de 9 |

### Lo que corrí

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | exit 0 |
| `eslint --quiet`, los `.ts` y `.tsx` del rango | exit 0 |
| `pnpm run test:guardias` | 4616 pasan, 4 fallan, los de `dependencias-declaradas-presentes`, en el baseline; 1 salto |
| `estado-cuenta-tienda-modelo-nuevo`, `EstadoCuentaTiendaModeloNuevo`, `caja-173-alcance`, `nombres-estado-retirados`, sobre `servi_gate_slt54` | 89 de 89 |
| Test temporal de punta a punta, borrado | La tabla del punto 1 |
| `playwright test e2e/wallet-mensajeros.spec.ts --project=dinero --no-deps --repeat-each=15`, base desechable, borrada al terminar | 45 de 45 |
| Literales prohibidos en las líneas añadidas | Solo el `₡` del menor 5 |
| Dependencias, esquema y migraciones en el rango | Sin cambios |

**Sin correr, por encargo:** suite completa, E2E entero, `./init.sh`. No muté el E2E de `tarifas-activacion` ni lo repetí: es del implementer. El grafo no se consultó: Grep y Read. Tasks abiertas: T6.3 y T6.5, del leader.

### Checklist

- [x] D38 cerrado en las dos superficies, nuevo y viejo literal
- [x] Trazabilidad de R71 y R72 en el mapa; T10 en `[x]`
- [x] `WHERE`, N+1, mixto y activación, con mutación propia
- [x] Guardias: sin debilitar; G4 y G5 cerradas
- [x] Sin dependencias, esquema ni migraciones nuevas; sin el nombre del cliente
- [ ] Visto bueno de Carlos a R71 y R72: pendiente, en el PR
- [ ] T6.3 y T6.5: del leader, antes del PR y en la salida

## Vuelta 4: integración con dev

Alcance: merge `33e7a113` (padres `2804fd06` y `8eb66b88`) y commit `e3e51935`. La feature no se re-revisa.

**Veredicto: OK.** Sin bloqueantes. Tres menores. Queda abierto el check `gate-completo`: los tres shards de vitest seguían en curso al escribir esto, y nadie mergea sin él.

### 1. Conflictos resueltos

Los contadores salen del catálogo, no del test. Apliqué `prisma migrate deploy` real a una base desechable nueva y conté en `pg_trigger` y `pg_policies`:

| Contador | Código | Catálogo real |
|---|---|---|
| Modelos de negocio | 87 (`MODELOS_DE_NEGOCIO`) | 87 triggers `*_sin_cambio_de_empresa` |
| Políticas `*_por_empresa` | 88 (87 + `jobs`) | 88 |
| Triggers `sme_*` | 169 | 169 |

No se perdió nada:

- `playwright.config.ts`: entran `tarifas-activacion` y `planes-costo-porcentual`.
- `lib/db/modelos-de-negocio.ts`: entran las dos tablas.
- `wallet-labels.ts`: conserva la pista de SLT-83 y la reexportación de SLT-54.
- `db/schema.prisma`: `prisma migrate diff` contra la base migrada dice «No difference detected», con exit 0.
- Sin literales viejos de 86 o 168 en `tests/` ni `scripts/`.
- `git diff-tree --cc` lista los 7 archivos que tocaron las dos fichas, más `progress/features/SLT-54.md`, que es la bitácora de la ficha y no código.

### 2. `M_ANTERIOR`

No quedó debilitado. Se usa solo en la línea 146, para exigir que M1, M2 y M3 sean contiguas a la anterior. El literal viejo fallaba porque dejaba M1 en `i + 3`.

La parte de ida y vuelta no lo usa: `aplicarMigracionesHasta(db, M1)` corta por nombre, y ahora aplica también las de SLT-54 antes de sembrar. La foto previa a M1 incluye `tarifa_activacion`, así que la bajada se compara con ese estado, más estricto que antes. Pasa 6 de 6. Ver el menor 1.

### 3. Interacción de negocio SLT-83 y SLT-54

No encontré fallo.

- **Base del cálculo.** `cobro_plataforma_porcentual_conciliar` (`20261104150200`, línea 121) calcula sobre `orden.monto_cobrar`, leído de la fila.
- **SLT-54 no toca esa base.** Su diff en `lib/`, `app/` y migraciones no escribe `monto_cobrar` ni `estatus_id`, ni nombra `cobro_plataforma`, `deudaPlataforma` o `costoPorOrden`. Las apariciones de `montoCobrar` son de lectura: el desglose y `montoFulfillmentDeTarifa` en `OrdenRepository`.
- **SLT-83 no lee tarifas.** Sus migraciones no nombran `tarifa_valor`, `tarifa_activacion` ni `tarifas`. Su `cobro_plataforma_tarifa` es el global de plataforma, otra tabla. Su diff en `lib/` y `app/` no nombra tarifas nuevas ni cierres.
- **Sin funciones compartidas.** Solo hay 7 archivos comunes: los 4 del conflicto, `schema.prisma`, `modelos-de-negocio.ts` y `wallet-labels.ts`. Ambos diffs son aditivos y en bloques separados. `ingreso` no aparece en el diff de SLT-83.

Cifras, leídas del SQL y no ejecutadas para este cruce: orden de 100.000, plan al 2 % con mínimo 500. El cargo es 2.000,00 con el modelo viejo y con el nuevo, porque el importe no depende de la tarifa. El caso con el modelo viejo sí corrió en el E2E de CI. Ver «Sin verificar» para el cruce con empresa activada.

### 4. Migraciones fuera de orden

No hay dependencia entre fichas, ni guardia que exija orden, y nada falla. Demostrado con dos bases desechables nuevas en el servidor local, borradas al terminar:

| Paso | Resultado |
|---|---|
| `migrate deploy` sin las de SLT-54, el estado de dev | exit 0 |
| `migrate deploy` con las 304 | exit 0; `_prisma_migrations` queda 130100, 150000, 150100, 150200, 140000, 140100 |
| `migrate status` después | «Database schema is up to date!» |
| Catálogo fuera de orden frente a cronológico: columnas, restricciones, índices, triggers, políticas, md5 de funciones y `proacl`, enums, grants, RLS | 0 diferencias |
| `migrate diff` frente a `schema.prisma`, en las dos bases | exit 0 |
| Bajar SLT-54 con SLT-83 arriba | Igual a la foto previa, 0 diferencias; al resubir, 0 frente a cronológico |
| Bajar SLT-83 con SLT-54 arriba, y resubir | Sin error; 4 diferencias, solo el `ordinal_position` de las 2 columnas de `plan` |
| Bajar las 5 en orden inverso, y resubir | Sin error; las mismas 4 diferencias |

Las 4 diferencias son lo normal al recrear columnas: Postgres no reusa la posición de una columna borrada. No cambian el esquema lógico, y `migrate diff` no las ve.

Las guardias `fk-misma-empresa` y `unicos-por-empresa` recorren las migraciones por nombre, sin mirar el orden de aplicación. Ninguna guardia compara contra `_prisma_migrations`.

### 5. Rojos

`.vitest-rojos.json` es del gate de las 10:02, posterior a `e3e51935` (10:00), y coincide con el log: 245 archivos, 284 tests.

- **Ningún rojo apunta a las fichas.** Solo un bloque nombra sus objetos: `orden-traspaso-migration` (427/T2), que lista toda migración posterior a su tope y crece con cada ficha. Es deuda anterior.
- **`historial-accion-migration`:** el rojo es por la política y la segunda FK de SL-17, sin relación.
- **`wallet-458-migration`:** compara por posición fija contra valores anteriores, y el otro rojo es falta de datos. También `abono-tienda-457`, `cobro-tienda-461` y `wallet-461`, cuyos valores recibidos no son de estas fichas.
- **Tests de las dos fichas:** los 44 archivos filtrados por nombre, de SLT-54, SLT-83 y su entorno, sin un rojo.
- **Clasificación de los 71 rojos que no son falta de datos:** ninguno nombra objetos de las fichas.

Por qué puede subir el total al bajar un archivo: en esta corrida, 180 de los 245 archivos caen en el `beforeAll` sin registrar ni un test en rojo. Si una suite encuentra datos que dejó otra, pasa el `beforeAll`, corre, y aporta rojos individuales. **Es hipótesis:** la corrida anterior no se guardó, así que no pude comparar test a test.

### Hallazgos

Sin bloqueantes.

- **menor 1.** `tests/integration/db/migracion-slt83-ida-y-vuelta.test.ts:144`: el título dice «van detrás de la última de dev», y `M_ANTERIOR` todavía no está en dev. Será cierto al mergear; el test es correcto.
- **menor 2.** `scripts/db-rollback.ts:12` elige la última migración por nombre. En una base que recibió las de SLT-54 después, baja primero `150200`, y no la última aplicada de verdad. No rompe nada: los downs funcionan en ese orden.
- **menor 3.** El baseline por archivo y la base local sin datos dejan fuera de la comparación los 245 archivos, entre ellos los de cierres, estado de cuenta y wallet. Un rojo nuevo dentro de uno de ellos no se ve en el gate local. Es deuda anterior, y es el motivo de no dar por cubierto el cruce con ese gate.

### Lo que corrí

| Comando | Resultado |
|---|---|
| `pnpm run typecheck` | Sin errores |
| `eslint --quiet`, los 5 archivos tocados tras el merge que son código | Sin errores |
| `vitest run`, 10 archivos (guardias RLS, FK y únicos, `verificar-rls-despliegue`, `migracion-slt83`, `tarifa-activacion` y su migración, `cobro-plataforma-porcentual`, `plan-de-la-empresa-porcentual`, `wallet-labels`), base desechable migrada y sembrada, borrada al terminar | 138 de 138 |
| CI `e2e (dinero)` sobre `e3e51935`, leído del log | 49 pasan, con `planes-costo-porcentual` y `tarifas-activacion` |
| CI `estatico`, `e2e (aislamiento)`, `e2e (reparto)` sobre `e3e51935` | success |

### Sin verificar

- **El cruce de punta a punta: empresa activada con plan porcentual y un cierre real aprobado.** Ningún test lo cubre y no lo ejecuté. Los E2E lo cubren por separado. Lo sostiene el análisis estático del punto 3.
- **`vitest` de CI, los 3 shards:** en curso.
- **La base de dev real y producción:** no las toqué. Lo demostrado reproduce el estado de dev en una base nueva, sin sus datos.
- **`prisma migrate dev` sobre una base fuera de orden:** no lo probé. `deploy` y `status` sí.
- **La suite local completa:** no la corrí, por encargo. Usé el log existente.
- **El grafo:** no lo consulté, usé Grep y `git diff`. La búsqueda de cruces es por texto: una dependencia que no nombre esos términos no aparecería.

### Checklist

- [x] Conflictos: contadores contra el catálogo real; nada perdido
- [x] `M_ANTERIOR`: no debilitado
- [x] Interacción de negocio: sin fallo por análisis estático; cruce sin ejecutar
- [x] Migraciones fuera de orden: demostrado, con subida y bajada
- [x] Rojos: ninguno apunta a las fichas
- [ ] `gate-completo` en verde: pendiente, antes del merge
