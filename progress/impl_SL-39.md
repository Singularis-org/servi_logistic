# impl SL-39 «Wallet: IVA aparte de las ganancias»

> Implementer, 2026-10-23. Spec en `specs/SL-39-wallet-iva-aparte/` (head 580111b, R1–R27, P1 = sí).
> Worktree `.worktrees/SL-39-wallet-iva-aparte`, rama `feature/SL-39-wallet-iva-aparte`.

## Entorno

- `node_modules` por junction al del checkout principal. Ese `node_modules` es compartido: el cliente
  Prisma lo regeneraban otros worktrees (SL-32, SL-38) con su schema. Por eso toda corrida de vitest,
  typecheck, gate o e2e pasó por un envoltorio que toma `gate.lock`, corre `prisma generate` con el
  schema de SL-39, ejecuta y suelta el lock.
- Base desechable local `sl39_test` (234 migraciones, `migrate deploy`). La base `servi-logistic` no
  se tocó. El `.env` del worktree apunta a `sl39_test`: no se versiona y se borra al terminar.
- Sin migraciones: `git diff dev -- db/` vacío (R14). `lib/utils/ingreso-empresa.ts` sin tocar (SL-38).

## Tanda 0: los rojos primero

### C0: `tests/integration/db/cierre-iva-aparte-sl39.test.ts`, rojo antes de C1

Postgres real, con `CierresAdminService` y `CierresBodegaAdminService` y sus repositorios reales:

```
     × R21–R23 cierre A: ganancia y neto sin IVA (1.700,00), IVA facturado 416,00 aparte, facturado 3.616,00
     × R22 cierre B: un rechazo cuyo IVA tapaba la perdida da ganancia −100,00
     × R21–R23 bodega, nivel de cada cierre del dia: A da 1.700,00 y B −100,00, cada uno con su IVA
     × R21–R23 bodega, nivel agregado: ganancia y neto 1.600,00 sin IVA, IVA 676,00, facturado 5.876,00
AssertionError: expected '2116.00' to be '1700.00' // Object.is equality
AssertionError: expected '160.00' to be '-100.00' // Object.is equality
AssertionError: expected { a: '2116.00', b: '160.00' } to deeply equal { a: '1700.00', b: '-100.00' }
AssertionError: expected '2276.00' to be '1600.00' // Object.is equality
 Test Files  1 failed (1)
      Tests  4 failed | 2 passed (6)      # los 2 verdes: control de no vacuidad y R25
```

El agregado de bodega (1.600 / 676 / 5.876) no viene en el design. Sale de A + B, comprobado a mano:
- A: 3.616 facturado, de los que 416 son IVA. B: 2.260, de los que 260 son IVA.
- Juntos: 5.876 facturado y 676 de IVA, así que 5.200 sin IVA.
- Pago 1.500 + 2.100 = 3.600, y por tanto ganancia = neto = 1.600.

### T0: `tests/integration/db/caja-iva-aparte-sl39.test.ts`, rojo antes de T1

**Primer intento, rojo por la razón equivocada.** Daba `expected '0.00' to be '3616.00'` en
Δentradas. La causa no era de visibilidad:
- desde la 459, el flete, la comisión y sus IVA son `cargo_a_tienda` en `LIQUIDEZ_POR_CATEGORIA`;
- es decir, no son efectivo: no suman a «Entró» ni a la cifra principal;
- los esperados del test contradecían esa regla.

**Arreglo, solo en el test:** se siembra también el contra-entrega del ejemplo, `ingreso_cod_recaudado`,
con 20.000,00 en A y 500,00 en B. Los esperados se rehicieron a mano:
- entradas 20.000; enCaja 18.500; deEmpresa 2.116; deTerceros 16.384 (20.000 − 3.616);
- R4: 1.700 + 416 + 0 + 16.384 = 18.500.

**Rojo válido, antes de tocar `lib/`.** R5 sale en verde y el primer fallo es la ganancia:

```
 FAIL  ... > R1/R2/R4/R5: con el ejemplo de design §1, ...
AssertionError: expected '2116.00' to be '1700.00' // Object.is equality
Expected: "1700.00"
Received: "2116.00"
 ❯ tests/integration/db/caja-iva-aparte-sl39.test.ts:221:31
 FAIL  ... > R16: con IVA sembrado tambien en la empresa B, ...
AssertionError: expected '2116.00' to be '1700.00' // Object.is equality
 ❯ tests/integration/db/caja-iva-aparte-sl39.test.ts:267:71
```

## Verdes tras el arreglo

- T0, tras T1:
  `Test Files  1 passed (1)` y `Tests  2 passed (2)`, con `T0_EXIT=0`.
- C0, tras C1 (integración + `iva-cierre` + los dos unit de servicio):
  `Test Files  4 passed (4)` y `Tests  166 passed (166)`.
- Capa de la caja (T1–T3): 20 archivos, 349 tests en verde. Incluye T0, el unit nuevo, las guardias, los
  puros y `aislamiento-wallet`.

## Mutaciones

Todas se aplicaron, se corrieron y se revirtieron, con md5 o `git diff` comprobado después.

### Caja (T0–T3)

| # | Mutación | Test que cae | Mensaje |
|---|---|---|---|
| 1 | `esCategoriaIva` sin categorías | T0 R1/R2/R4/R5 (+9) | expected '2116.00' to be '1700.00' |
| 2 | no sumar el IVA a `deEmpresa` | T0 R5 (+4) | expected '1700.00' to be '2116.00' |
| 3 | sumar el IVA también a `ingresosPropios` | T0 (+7) | expected '2532.00' to be '2116.00' |
| 4 | «propio» como única clasificación en `acumular` | T0, los 2 casos | expected '2116.00' to be '1700.00' |
| 5 | `esPropio` vuelve a `=== "propio"` | finanzas-diario 459/R13 y SL-39/R12 | deep equal del día |
| 6 | `ingreso_iva_flete` vuelve a `ganancia_empresa` | metrics-caja-naturaleza (3) | lista de 15 vs 14 |
| 7a | la fila de IVA sigue a las columnas | composicion-exhaustiva R11 (+5) | expected '13433.00' to be '16160.00' |
| 7b | el bloque de IVA no recibe importe | composicion-exhaustiva SL-39/R8 | expected '0.00' to be '404.00' |
| 7c | `signoIva` toma el signo de la ganancia | unit R2 del reverso | expected 'cero' to be 'negativo' |
| 7d | `WALLET_IVA_SEED` pierde el reverso | composicion-exhaustiva R18 y su autocomprobación, R8, R11 | — |
| 7e | `ingreso_iva` pierde el reverso | analitica-financiera-service R13 | expected '150.00' to be '120.00' |

### Cierre (C1)

| Mutación | Test que cae | Mensaje |
|---|---|---|
| M1 mensajero: `totalesIngreso.total` en vez de `facturadoSinIva` | C0 «cierre A» y «cierre B» | '2116.00' / '160.00' |
| M1 bodega, día | C0 «nivel de cada cierre del dia»; unit | {a:'2116.00',b:'160.00'} |
| M1 bodega, agregado | C0 «nivel agregado»; unit | '2276.00' en vez de '1600.00' |
| M2 sin `ivaFlete` | C0 A | '2025.00' en vez de '1700.00' |
| M2 sin `ivaFleteDevolucion` | C0 B | '160.00' en vez de '-100.00' |
| M2 sin `ivaComisionCod` | C0 A | '1791.00' en vez de '1700.00' |
| M3 `null` sin tolerar | iva-cierre «null o ausente» | DecimalError: Invalid argument: null |
| M3 `toString()` en vez de `toFixed(2)` | iva-cierre; C0 | '416' en vez de '416.00' |
| M3 `facturadoSinIva` no resta | iva-cierre; C0 | '2116.00' |
| M3 DTO mensajero solo con `ivaFlete` | unit servicio; C0 | '325.00' en vez de '416.00' |
| M3 DTO bodega-día solo con `ivaFlete` | unit caso 2; C0 | '325.07' en vez de '481.11' |
| M3 DTO bodega-agregado solo con `ivaFlete` | C0; unit | '325.00' en vez de '676.00' |

### Pantalla de la wallet (T4, T5)

| # | Mutación | Test que cae |
|---|---|---|
| 1 | sin la entrada «iva» en `REGIONES_BOLSILLO_EMPRESA` | WalletCajaIvaSL39 R6/R9/R20; wallet-labels R9 |
| 2 | «Ingresos» recorre otra vez `WALLET_INGRESO_PROPIO_SEED` | ComposicionGananciaCard (36) |
| 3 | el bloque del IVA con 3 filas | WalletCajaIvaSL39, el bloque y «cada fila se abre» |
| 4 | `gananciaPista` con el texto antiguo | WalletCajaIvaSL39 R8/R10; wallet-labels R10 |
| 5a | la región del IVA lee `signoCapital` | WalletCajaIvaSL39 R6/R20; wallet-labels R9 |
| 5b | todas las filas del IVA piden `ingreso_iva_flete` | WalletCajaIvaSL39 «pide SU fila» |
| 5c | el pie pinta `deEmpresa` | WalletCajaIvaSL39 R8; ComposicionGananciaCard R22/R27 |
| 5d | «Total del IVA» pinta una sola fila | WalletCajaIvaSL39 R20 |
| 5e | `role="group"` sobre la `<dl>` | WalletCajaIvaSL39 (4) |
| 5f | la descripción vuelve a decir «impuestos» | WalletCajaIvaSL39 R10 |
| 5g | `money(String(Number(...)))` en la región | WalletCajaIvaSL39 R20; CajaResumenCard R64; CajaComposicionBarra R12 |
| 5h | la nota de diferencia sin «el IVA cobrado» | wallet-labels R10; CajaResumenCard R60 |
| 5i | el nombre accesible con «(ganancia y aportes)» | wallet-labels R10; CajaComposicionBarra |
| 5j | el reverso con `tono="ingreso"` | sobrevivió al principio; con el test nuevo «verde/rojo», cae |

### Cascadas del cierre (C2)

| # | Mutación | Test que cae |
|---|---|---|
| 1 | sin la línea en `lineasNetoEmpresa` | CierreMensajeroDetalleCascadas (6); DineroIdentidades B6 |
| 2 | sin la línea en `lineasCascadaDueno` | CierreBodegaDetalleCascadas (5); DineroIdentidades B5 |
| 3 | la línea después de «Pago al mensajero» | «la línea va JUSTO después…»; B6 R24 |
| 4 | `GANANCIA_NOTA` vuelve a «Ingreso bruto…» | R27 cierre B; B6 R27 |
| 5a | `CierresAdminModule` pasa otra cifra | `'-₡0'` en vez de `'-₡416'` |
| 5b | cada día de bodega pinta el IVA del agregado | `'-₡676'` en vez de `'-₡416'`: sobrevivía con un solo día; el test usa dos |
| 5c | otro texto en `IVA_FACTURADO_NOTA` | notas literales (5) |
| 5d | `NETO_EMPRESA_NOTA` sin «sin el IVA» | nota y literal |
| 5e | `GANANCIA_NOTA_BODEGA` vuelve a «Ingreso bruto…» | literal |
| 5f | la línea suma en vez de restar | `'+₡416'` en vez de `'-₡416'` |
| 5g | la línea de bodega sin su nota | SL-39 bodega; SL-15 R4 |

## Mapa R<n> → test

| R | Tests |
|---|---|
| R1 | `tests/unit/utils/caja-iva-aparte-sl39.test.ts` R1/R3; T0 `caja-iva-aparte-sl39` (integración) R1/R2/R4/R5; `caja-derivacion-459` R4 |
| R2 | unit SL-39 «R2: el IVA va aparte», «R2: un reverso…» (signo negativo); T0; `caja-derivaciones.guardia` R9 (SL-39) |
| R3 | unit SL-39 R1/R3; T0 (ingresos y egresos propios) |
| R4 | unit SL-39 R4 (500 conjuntos); T0 `sumaR4`; `caja-derivacion-459` R7 |
| R5 | unit SL-39 R5 (dos casos); T0, primeras aserciones (entradas, salidas, enCaja, deEmpresa, deTerceros, capital) |
| R6 | `tests/components/WalletCajaIvaSL39.test.tsx` R6; `wallet-labels.test` R6 |
| R7 | WalletCajaIvaSL39 R7 (5 casos); `wallet-labels.test` R7 |
| R8 | `caja-composicion-exhaustiva.guardia` SL-39/R8; WalletCajaIvaSL39 R7/R8 y R8; `ComposicionGananciaCard.test` R22; `wallet-page.test` R9 |
| R9 | WalletCajaIvaSL39 R9; `wallet-labels.test` R9 |
| R10 | `wallet-labels.test` R10 (pista, nota, barra, solo_tiendas); WalletCajaIvaSL39 R10; `CajaResumenCard.test`; `CajaComposicionBarra.test` |
| R11 | `metrics-caja-naturaleza.guardia` «propio menos las de IVA»; `analitica-financiera-service` SL-39 R11; `financiera-ingresos-repo` |
| R12 | `tests/unit/analytics/finanzas-diario.test.ts` SL-39/R12 |
| R13 | `analitica-financiera-service` R13 |
| R14 | T0 (filas escritas como el feed y separadas al leer); `git diff dev -- db/` vacío |
| R15 | `git diff dev -- lib/utils/ingreso-empresa.ts` vacío; no regresión de los tests de aprobación de cierre (gate) |
| R16 | T0 R16 (empresas A y B con RLS real); `aislamiento-wallet.test.ts` |
| R17 | `tests/unit/services/wallet-service.test.ts` (forbidden antes de la base) |
| R18 | `caja-composicion-exhaustiva.guardia` SL-39/R18 y su autocomprobación |
| R19 | `tests/integration/db/libro-kardex-468.test.ts` y `tests/components/descarga/WalletDescarga.test.tsx` (sin tocar sus aserciones; WalletDescarga solo gana `iva` en el fixture) |
| R20 | unit SL-39 R20; WalletCajaIvaSL39 R20 (3); `wallet-page.test` barrido de texto; `iva-cierre.test` (texto con 2 decimales) |
| R21 | `tests/unit/utils/iva-cierre.test.ts`; C0 `cierre-iva-aparte-sl39` (integración), A y bodega en dos niveles; unit de los dos servicios |
| R22 | C0 «R22 cierre B» (−100,00) y los tres niveles; `iva-cierre.test` `facturadoSinIva` |
| R23 | C0 `netoEmpresa` en A, B, bodega-día y agregado; unit de servicio |
| R24 | `CierreMensajeroDetalleCascadas` SL-39 (R24); `CierreBodegaDetalleCascadas` SL-39; `DineroIdentidadesEnPantalla` B6 R24 y B5 R8 |
| R25 | C0 «R25: leer los detalles no cambia ni una fila de `cierre_detail`» |
| R26 | C0 `totalesIngreso.total` sin cambios; unit de servicio R18; `CierreMensajeroDetalleCascadas` R26; `CierreBodegaDetalleCascadas` R26; DineroIdentidades B6 R26 |
| R27 | `CierreMensajeroDetalleCascadas` R27 (cierre B «Debe» −100) y el literal; DineroIdentidades B6 R27; `GANANCIA_NOTA_BODEGA` solo por su literal (no se pinta en ninguna pantalla) |

## Gate

`TEST_RAPIDO_BASE=dev ./init.sh`, dentro de `gate.lock`. Base `sl39_test`; log fuera del repo.

- **Corrida 1:** `INIT_EXIT=127`, sin llegar a los tests. La copia local del `.env` traía `SMTP_FROM_NAME`
  sin comillas y con un espacio, y `init.sh` la carga con `.`. Se entrecomilló en la copia del
  worktree, que no se versiona.
- **Corrida 2:** `INIT_EXIT=1`, por un solo rojo nuevo: `cobro-tienda-461-completar-migration` R34,
  `40P01 se ha detectado un deadlock` en un `ALTER TABLE` que choca con otros archivos en paralelo.
  Solo, ese archivo sale `6 passed (6)`. No toca nada de SL-39.
- **Corrida 3, sobre `a1e3f8e`** (las dos de abajo son los dos bloques de vitest que corre el gate):
  ```
  ✓ typecheck paso
  ✓ lint paso
   Test Files  1224 passed (1224)
        Tests  17497 passed | 26 skipped (17523)
   Test Files  299 passed (299)
        Tests  4091 passed | 1 skipped (4092)
  == init OK ==
  INIT_EXIT=0
  ```

## Recorrido en el navegador (T5, C2, T7)

**Montaje**
- Base desechable `sl39_ui`: `migrate deploy` + `db:seed`.
- Dos empresas, A y B, dadas de alta con `altaDeEmpresa`, cada una con su maestro. El login usa
  `prepararAcceso` de SL-17: contraseña fijada y dispositivo de confianza.
- Un solo dev server, en :3039, con `.next` limpio y dentro de `gate.lock`.
- Spec: `e2e/wallet-iva-aparte-sl39.spec.ts`, con la siembra en `e2e/_wallet-iva-sl39-siembra.ts`. Hace
  `test.skip` salvo con `SL39_UI=1`, porque el E2E de CI no tiene esta siembra.

**Resultado:** `4 passed (22.9s)`. Números leídos del DOM:

| Pantalla | Cifra | Medido |
|---|---|---|
| `/wallet` A | IVA cobrado (región del bolsillo) | 416.00 («₡416»), insignia «Positivo» |
| `/wallet` A | Ganancia de la empresa | 1700.00 («₡1.700») |
| `/wallet` A | bloque «IVA cobrado (aparte de la ganancia)» | Total del IVA 416.00; pie 1700.00 |
| `/wallet` B | IVA cobrado / ganancia | 6.50 / 40.00, nada de A (mezclado daría 422,50 o 1.740) |
| `cierres-admin`, cierre A | cascada en orden | facturó 3616.00 · IVA facturado −416.00 · pago −1500.00 · bodega −0.00 · neto 1700.00 |
| `cierres-admin`, cierre B | «Debe» | −100.00, nota «Ingreso sin IVA menos el pago al mensajero.» (con IVA daría +160) |

**Mutación:** sin la entrada «iva» de `REGIONES_BOLSILLO_EMPRESA` y con el server reiniciado, el spec da
1 failed (los otros 3 no corren, porque van en serie):
`expect(regionIva, "la region «IVA cobrado» del bolsillo de la empresa").toHaveCount(1)`, con
`Expected: 1 Received: 0`. Revertida: `git diff --stat` vacío.

**Observaciones de pantalla, ajenas al alcance:**
- `money()` no pinta los decimales cuando son cero («₡1.700»).
- Una resta de cero se pinta «−₡0»; viene de antes de SL-39.
- En la «Liquidación» del cierre B, «Ingreso bruto» 2.260 (con IVA, y la nota lo dice) va seguido de
  «Debe» −100 (sin IVA). La línea del IVA está en la cascada de arriba, no en ese bloque, así que ahí la
  resta no se ve a simple vista. El spec no lo pide; queda para el leader.

## No regresión (T7)

- R14 y R15: `git diff --stat origin/dev...HEAD -- db/ lib/utils/ingreso-empresa.ts` vacío (el `dev` local estaba desfasado; se compara con origin).
- R16, R17 y R19 (`aislamiento-wallet`, `wallet-service` forbidden, `libro-kardex-468`, `WalletDescarga`):
  en verde en el gate, que da `INIT_EXIT=0`.
- E2E: solo el spec nuevo, que es el único E2E que toca esta ficha (`AGENTS.md > Quién corre qué`).
  `wallet.spec.ts` y `cierres-admin*.spec.ts` corren en el CI del PR a producción.

## Desviaciones

- C1 tocó un archivo más que los que lista el spec: `lib/interfaces/services/ICierreBodegaService.ts`.
  Ahí vive `CierreBodegaDetalleCierre`, el tipo de cada `cierres[]` de bodega.
- La identidad R7 de la 459 la fijaban tres tests de integración más, además de
  `caja-caracterizacion-459`: `caja-invariante-tiendas`, `ajuste-caja-anulacion-461` y
  `wallet-anulacion-458`.
  - A los tres se les añadió el IVA como cuarto sumando.
  - Los cuatro están en `tests/baseline-rojos.json` por falta de datos (SL-31), así que en local no se
    ven en verde.
- C1 borró de `iva-cierre.test.ts` el caso «0.10 + 0.20». No distingue `Number` de `Decimal` después de
  `toFixed(2)`.

## Seguimiento (tras el merge de SL-38)

Solo texto, sin código, en `lib/utils/ingreso-empresa.ts`:
- `gananciaEmpresa` (≈ l. 328) y `netoEmpresa` (≈ l. 632-633) dicen «ingreso BRUTO» / «lo FACTURADO».
- Desde SL-39 reciben lo facturado sin IVA (`facturadoSinIva`).
- Opcional: renombrar el parámetro `ingresoTotal`.
- **Hecho** en e63be32: docstrings de `gananciaEmpresa` y `netoEmpresa` dicen «lo facturado SIN IVA»
  (`facturadoSinIva`). El parámetro `ingresoTotal` no se renombra.

## Cierre: guardias e2e, merge de dev y gate final (2026-10-23)

- f0d1f23. R47 (`rollup-guards`): la cifra solo salía en el comentario del spec («cod 20000»). Los
  montos de la siembra (`"20000.00"`) no son una forma literal del umbral, y la guardia no los ve. El
  comentario pasa a «20.000». No se toca la guardia ni el dato.
- SINPE: `SINPE_DE_PRUEBA` se exporta de `e2e/_dos-empresas-fixture.ts` y la siembra la importa.
  Queda una sola fuente.
- 9de69bd: merge de `origin/dev` (SL-32, SL-38) sin conflictos. `prisma migrate deploy` en la base
  del gate aplicó las dos migraciones nuevas.
- Gate (dentro del lock) sobre e63be32:
  - Con `TEST_RAPIDO_BASE=dev` dio INIT_EXIT=1 y vitest no llegó a arrancar. La rama local `dev`
    está desfasada: 493 archivos de diff, frente a 88 con `origin/dev`.
  - Repetido con `TEST_RAPIDO_BASE=origin/dev`: **INIT_EXIT=0**.
    - Related: 899 archivos y 13087 tests verdes.
    - Guardias: 301 archivos y 4115 tests verdes.
    - Sin deadlock de D18.

Veredicto: SL-39 lista para revisión.

## Seguimiento: el IVA en «Liquidación» (menores 1 y 6 de la revisión, 2026-10-23)

Lo pidió Carlos tras la revisión. Solo capa de presentación.

**Archivos**
- `app/(app)/cierres-admin/_components/cierre-factura.tsx`: prop nueva `ivaFacturado?`. En
  «Liquidación», entre «Ingreso bruto» y «Debe», el renglón «IVA facturado» con su operador
  (`conOperador(iva, true)` → `-₡260`). Ausente = no se pinta. No se añade otro renglón: el pago al
  mensajero sigue en su bloque de abajo, como antes.
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`: pasa `ivaFacturado={detalle.ivaFacturado}`
  al comprobante. La vista del mensajero (`CierreDiaModule`) no pinta «Liquidación» y el detalle de
  bodega no monta ese bloque, así que no cambian.
- `lib/constants/impuesto-rotulo.ts` (nuevo): `IMPUESTO_ROTULO` se muda aquí, sin dependencias.
  `wallet-labels.ts` lo importa y lo re-exporta: es la misma constante. Motivo: importarlo desde
  `wallet-labels` arrastraba `lib/types/wallet.ts` (`Prisma` como valor) al bundle del panel y
  ponía rojo `pagos-captura.guardia` (R19). Lo cazó el primer gate.
- `app/(app)/cierres-admin/_components/cierre-labels.ts`: `IVA_FACTURADO_LABEL = \`${IMPUESTO_ROTULO} facturado\``
  (menor 6). El texto pintado no cambia («IVA facturado»).
- `tests/components/CierreMensajeroDetalleCascadas.test.tsx`: describe nuevo «Liquidación pinta el IVA
  facturado…», con 3 tests.

**Mapa**
- R24/R27, «Liquidación» del cierre A: `Ingreso bruto` ₡3.616 y `IVA facturado` -₡416, en ese orden y
  sin «Debe». Cuadra con el pago del bloque de abajo: 3.616 − 416 − 1.500 = 1.700.
- R24/R27, «Liquidación» del cierre B: [₡2.260, -₡260, -₡100]. El IVA va entre el bruto y «Debe», y
  2.260 − 260 − 2.100 = −100, leído del DOM.
- Menor 6: `IVA_FACTURADO_LABEL` === `${IMPUESTO_ROTULO} facturado`. El literal «IVA facturado» ya lo
  fija el `it.each` de R24.

**Mutaciones** (las dos se restauraron después)
1. Se quitó el renglón (`{true ? null : (`): **2 failed | 39 passed**. Caen A y B.
2. `CierresAdminModule` dejó de pasar `ivaFacturado` al comprobante (solo esa línea; la de la cascada
   queda): **2 failed | 39 passed**. Caen A y B.

**Comandos**
- `pnpm run typecheck`: TC_EXIT=0.
- `pnpm run lint`: 0 errores y 232 avisos. LINT_EXIT=0.
- vitest de `pagos-captura.guardia`, `CierreMensajeroDetalleCascadas` y `wallet-labels`: 3 archivos y
  87 tests verdes.
- Primer gate: INIT_EXIT=1. `pagos-captura.guardia` salió rojo, como se explica arriba.
- Segundo gate (`TEST_RAPIDO_BASE=origin/dev ./init.sh`, dentro del lock), tras mudar la
  constante: **INIT_EXIT=0**.
  - Related: 837 archivos verdes y 62 saltados (899). Tests: 12676 verdes y 440 saltados.
  - Guardias: 299 archivos verdes y 2 saltados (301). Tests: 4096 verdes y 20 saltados.

Veredicto: «Liquidación» cuadra en A y en B (bruto − IVA − pago = resultado), con el rótulo compuesto
desde `IMPUESTO_ROTULO`. Gate verde.
