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
