# SLT-244 — Moneda e impuesto del país en pantallas: componentes de cierres · design

> Alcance, «Lo que NO entra», preguntas abiertas y decisiones cerradas están en `requirements.md`.
> Aquí solo va el cómo, y las referencias `R<n>` son las de ese archivo. Es la rebanada 6 de 8 del
> corte de SLT-235. Los patrones salen de otras specs:
> - pantalla (proveedor, hook, censo): `specs/SLT-235-moneda-pais-pantallas/design.md` §6–§8;
> - sustitución `money(x)` → `formatearMontoEn(moneda, x, SIN_MONTO_RAYA)`:
>   `specs/SLT-243-moneda-pantallas-cierres-admin/design.md` §3;
> - «una base con el rótulo de caída y una función que pone el del país»: SLT-240 §5;
> - porcentaje con el separador de la moneda del país: SLT-241 (`porcentajeParaVer`).
>
> Escrito con la recomendación de P1 (nombre del impuesto a secas), P2 (tarifa de la descarga entera
> en la moneda del país), P3 (no se toca `FichaQueLoRetira`) y P4 (se borra
> `porcentajeParaVerEnLaPlataforma`).

## Lo que ya existe

Busqué el 2026-11-23 en tres sitios:
- `feature_list.json`, en todos los estados, con `private/cierres`, `fila-gestion`, `detalle-cierre`,
  `moneda` e `IVA`;
- `specs/`, con `SLT-244`, `componentes de cierres` y `private/cierres`;
- el código, con `money(`, `moneyTope(`, `formatearMontoEn`, `IMPUESTO_ROTULO`, `\bIVA\b`, `_IVA_`,
  `ConIva`, `porcentajeParaVerEnLaPlataforma`, `useMonedaDelPais` y los nombres de las funciones
  puras de vista.

**El grafo (`codebase-memory-mcp`) no tiene indexado este worktree** (`index_status`: «project not
found or not indexed»), así que la búsqueda en el código se hizo con Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| SLT-235 «Moneda e impuesto del país en las pantallas de la empresa» (`done`) | `hooks/use-moneda-del-pais.ts` (`useMonedaDelPais`, `useImpuestoDelPais`), `providers/MonedaDelPaisProvider.tsx`, censo R18 en `tests/components/moneda-del-pais-pantallas.test.tsx` | Se **reutiliza** entero. Todos los componentes de esta ficha son `"use client"` y leen los hooks. |
| SLT-243 «Moneda e impuesto del país en pantallas: cierres del admin» (`done`, #278) | `MarcaAjustado.tsx` ya lee el hook; `encabezados-con-impuesto.ts` ya da los encabezados de descarga; su P3 deja aquí los rótulos y el texto de la tarifa | Se **reutiliza** `MarcaAjustado` sin tocarla. `encabezados-con-impuesto.ts` **no se reutiliza** para pantalla: su forma es «impuesto (<nombre>)», y P1 recomienda el nombre a secas. |
| SLT-241: `porcentajeParaVer(valor, moneda)` y `porcentajeParaVerEnLaPlataforma(valor)` | `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts:123-135` | Se **reutiliza** `porcentajeParaVer`. `porcentajeParaVerEnLaPlataforma` se creó «para la fila de gestión de cierres» hasta esta ficha: sus 3 llamadas (`fila-gestion-labels.ts`) pasan a `porcentajeParaVer`, y se borra (P4). |
| SLT-240: `rotuloFleteConImpuesto` y `rotuloComisionConImpuesto` | `app/(app)/ordenes/_components/rotulos-con-impuesto.ts` | **No se reutilizan**: dan «Flete + <impuesto>» y «Comisión + <impuesto>»; los rótulos de cierres son otros textos («Flete por entregado + …», «Comisión COD + …»). Se reutiliza la idea: una función del impuesto por rótulo. |
| Rótulos con «IVA» de pantalla en `cierres-admin` | `cierre-labels.ts:181-213` (`FLETE_DEV_CON_IVA_LABEL`, `FLETE_NO_ENTREGADAS_CON_IVA_LABEL`, `ivaFleteNoEntregaLabel`, `fleteDevConIvaDeGestion`); `cierre-detalle-shared.tsx:464-468` (`IVA_FLETE_LABEL`, `IVA_COMISION_LABEL`, `IVA_FLETE_RECHAZO_LABEL`) | Cada uno gana una función del impuesto, y la constante pasa a ser esa función con `IMPUESTO_ROTULO`: mismo texto para el código sin montar (P1 de SLT-243) y sus tests. Los componentes de cierres usan la función. |
| Código de cierres que no monta ninguna pantalla | `cierre-factura.tsx` y el resto de `cierre-detalle-shared.tsx` | **No se toca** (SLT-243 P1). Lo borra SLT-146 «Podar cierre-factura.tsx de lo que quedó sin montar» (`pending`). |
| `Cuenta` montada fuera de cierres | `app/(app)/wallet/satelites/_components/ConciliacionSatelite.tsx:28` | `Cuenta` lee el hook ella misma, así que la conciliación de la satélite pinta sus cuentas en la moneda del país. El resto de esa pantalla (`money(` propios) es de la wallet (SLT-245 / SLT-246). Riesgo en §9. |
| Lista de excepciones de `pais-sin-literales` | `tests/unit/guards/_pais-sin-literales-excepciones.ts` (tope 12) | **Ninguna entrada a nombre de SLT-244.** No se edita; R14 lo afirma con un test. |
| Guardia de columnas sensibles | `tests/unit/descarga/columnas-sensibles.guardia.test.ts:238-249` | Llama a cada función exportada por un `*-descarga-columnas.ts` con **una sola** sonda, y admite factorías (`fila(x)(dto)`). Condiciona la forma de §7. |

No apareció ninguna ficha ni código que ya resuelva R1–R13.

## 1. Resumen

1. Los componentes de cierres que pintan importes leen `useMonedaDelPais()` y cambian `money(x)` por
   `formatearMontoEn(moneda, x, SIN_MONTO_RAYA)`, que con la moneda de la plataforma da el mismo
   texto (R1, R2, R4).
2. Los textos con importe o con el impuesto que arman los módulos puros (`detalle-cierre-labels.ts`,
   `detalle-cierre-vista.ts`, `fila-gestion-labels.ts`, `fila-gestion-vista.ts`) piden la moneda y
   el impuesto como argumento obligatorio. Los componentes se los pasan desde los hooks (R3, R5, R6,
   R8).
3. Los rótulos con «IVA» de `cierres-admin` que pintan estos componentes ganan su función del
   impuesto. La constante de siempre se queda con el mismo texto para el código sin montar (R6, R11).
4. El libro de la descarga «Gestiones» pide la moneda; el texto de la tarifa la usa (R7, R8).
5. Guardias: censo R18, censo «sin IVA» de la carpeta y la lista de excepciones (R12–R14).

No hay cambio de servidor, de acción ni de contrato.

## 2. Modelo de datos

No hay tabla, columna, migración, política RLS ni ruta nueva. No hay operación nueva ni cambio de
autorización.

**Datos que dependen del país y de dónde salen:**

| Dato | Fuente | Quién lo lee en esta ficha |
|---|---|---|
| Moneda (formato y separador decimal) | `pais.moneda_*` → `PaisParaPantallas.moneda` → proveedor del layout | `useMonedaDelPais()` en los componentes de §3 y en `DescargarGestionesDialog` |
| Nombre del impuesto | `PaisParaPantallas.impuestoNombre` → proveedor | `useImpuestoDelPais()` en `DetalleCierre` y `FilaGestion` |
| Caídas | `MONEDA_PLATAFORMA`, `IMPUESTO_ROTULO` | Los hooks sin proveedor (R10); el memo de SLT-235 si el país no tiene moneda o impuesto |

## 3. Importes que pintan los componentes (R1, R2, R4)

**Contrato de la sustitución** (el de SLT-243 §3): `money(s)` es
`formatearMontoEn(MONEDA_PLATAFORMA, s, SIN_MONTO_RAYA)`. Con el hook sin proveedor, o con `MONEDA_CR`
(igual a `MONEDA_PLATAFORMA`, SL-21 R9), cada componente pinta byte a byte lo de hoy (R9, R10). Los
importes siguen siendo el STRING del servidor: no se convierte nada a `number` (guardia
`liquidacion-money-safe`, que censa toda la carpeta).

| Archivo | Cambio | R |
|---|---|---|
| `components/private/cierres/cola/ColaCierres.tsx` | Los componentes de celda y `PagoEntregadoCelda` leen el hook. Sus 11 `money(` (recaudado, pago al mensajero, ingreso por rechazos, para la central, rechazo, falta por recibir, pendiente) pasan a `formatearMontoEn`. Sale el import de `money`. Si una celda se arma en una función que no es componente (`celda(c, id)`), recibe la moneda del componente que la llama. | R1 |
| `components/private/cierres/cola/TablaColaPropia.tsx` | Sus 3 `money(`. | R1 |
| `components/private/cierres/detalle/CifrasCierre.tsx` | `money(c.valor)` y `money(m.monto)` (cifra y desglose por método). | R2 |
| `components/private/cierres/detalle/Cuenta.tsx` | `money(l.monto)` y `money(aparte.monto)`. `SIN_IMPORTE` no cambia. La usan el detalle, la fila (tarjetas), «Ver cómo se calculó» y la conciliación de la satélite. | R2, R4 |
| `components/private/cierres/detalle/DineroCierre.tsx` | Sus 3 `money(` (reparto y tabla por tienda). | R2 |
| `components/private/cierres/detalle/MensajerosCierreBodega.tsx` | Sus 3 `money(` (recaudado, pago, a la central). | R2 |
| `components/private/cierres/fila/FilaGestion.tsx` | Sus 2 `money(` (columnas de importe y ganancia). | R4 |

- **Cada componente lee el hook él mismo**, como `MarcaAjustado` y `PriceLabel`. No se pasa la moneda
  por props entre componentes: no cambia ninguna firma de componente y los tests que los montan sin
  proveedor siguen igual (alternativa 3).
- `MarcaAjustado` ya está migrada (SLT-243). Con esta ficha la fila entera queda en la misma moneda.

## 4. Textos con importe de los módulos puros (R3, R5, R8)

Los módulos `*-labels.ts` y `*-vista.ts` son puros (sin React): no pueden leer el hook. Reciben lo que
necesitan como argumento **obligatorio**, sin default (decisión cerrada «moneda explícita»; hallazgo
H2 de `review_SLT-243.md`).

### 4.1 Un tipo para los dos datos

```ts
// components/private/cierres/detalle/detalle-cierre-vista.ts
/** La moneda y el nombre del impuesto del país de la empresa, para los textos del cierre. */
export interface PaisDelCierre {
  moneda: FormatoMoneda;
  impuesto: string;
}
```

Los componentes leen los dos hooks en su cuerpo y arman el objeto con
`useMemo(() => ({ moneda, impuesto }), [moneda, impuesto])`. Los tests de las funciones puras pasan
una constante propia con `MONEDA_PLATAFORMA` e `IMPUESTO_ROTULO`.

### 4.2 Funciones que cambian de firma

| Función | Firma nueva | Qué usa | R |
|---|---|---|---|
| `pieResumenMensajero` (`detalle-cierre-labels.ts`) | `(recaudado, gestiones, moneda: FormatoMoneda)` | `formatearMontoEn` | R3 |
| `pieBodega` (`detalle-cierre-labels.ts`) | `(declarado, coletilla, moneda: FormatoMoneda)` | `formatearMontoEn` | R3 |
| `notaOrigenIngresoBodega` (`detalle-cierre-vista.ts`) | `(d, moneda: FormatoMoneda)` | `formatearMontoEn` | R3 |
| `pieTextoDe` (`detalle-cierre-vista.ts`) | `(tipo, audiencia, modo, detalle, pais: PaisDelCierre, disponibles?)` — `pais` va antes del opcional | `pieBodega`, `pieResumenMensajero` | R3, R8 |
| `lineasDinero` (`detalle-cierre-vista.ts`) | `(tipo, detalle, pais: PaisDelCierre)` | `notaOrigenIngresoBodega` y los rótulos de §5 | R3, R6, R8 |
| `cifrasDe` (`detalle-cierre-vista.ts`) | `(tipo, audiencia, detalle, pais: PaisDelCierre)` | las notas «sin <impuesto>, …» de §5 | R6, R8 |
| `porcentajeDe` (`fila-gestion-labels.ts`) | `(valor, base, moneda: FormatoMoneda)` | `porcentajeParaVer` y `formatearMontoEn` | R5, R7 |
| `conPorcentaje` (`fila-gestion-labels.ts`) | `(rotulo, pct, base, moneda: FormatoMoneda)` | ídem | R5 |
| `tarjetasDe` (`fila-gestion-vista.ts`) | `(g, a, quienMiraEsCentral, pais: PaisDelCierre)` | rótulos de §5 y el porcentaje del fulfillment | R5, R6, R8 |
| `calculoDe` (`fila-gestion-vista.ts`) | `(g, congeladoAt, pais: PaisDelCierre)` | `porcentajeDe`, `conPorcentaje`, rótulos de §5 | R5, R6, R8 |

- Las sobrecargas de `cifrasDe`, `lineasDinero` y `pieTextoDe` ganan `pais` en las dos ramas.
- Llamadores de producción: `DetalleCierre.tsx` (cifras, dinero, pie) y `FilaGestion.tsx` (tarjetas,
  cálculo). Leen los dos hooks y pasan `pais`.
- Llamadores de test: `tests/unit/utils/detalle-cierre-vista.test.ts` (35) y
  `tests/unit/utils/fila-gestion-vista.test.ts` (27). Pasan la constante de la plataforma y **no
  cambia ningún valor esperado** (R9).
- R8 se comprueba con `@ts-expect-error` en una llamada sin `pais` o sin `moneda` a `cifrasDe`,
  `lineasDinero`, `tarjetasDe`, `calculoDe`, `porcentajeDe` y `libroGestiones` (§7).

## 5. Rótulos de pantalla con el impuesto (R6; P1)

**Forma (P1, recomendación):** el nombre del impuesto a secas, donde hoy dice «IVA». En Costa Rica
(«IVA») el texto es el de hoy.

**Patrón** (SLT-240 §5): cada rótulo gana una función del impuesto; si la constante la lee código que
no se migra, la constante se queda y pasa a ser esa función con `IMPUESTO_ROTULO`, con el mismo texto
de hoy.

| Hoy | Función nueva | Perú (IGV) | Vive en | ¿Se queda la constante? |
|---|---|---|---|---|
| `FLETE_POR_ENTREGADO_LABEL` «Flete por entregado + IVA» | `fletePorEntregadoConImpuesto(i)` | «Flete por entregado + IGV» | `detalle-cierre-labels.ts` | No: solo la usan los componentes de cierres |
| `COMISION_COD_LABEL` «Comisión COD + IVA» | `comisionCodConImpuesto(i)` | «Comisión COD + IGV» | `detalle-cierre-labels.ts` | No (*) |
| `IVA_NO_ES_DE_LA_EMPRESA` «IVA (no es de la empresa)» | `impuestoNoEsDeLaEmpresa(i)` | «IGV (no es de la empresa)» | `detalle-cierre-labels.ts` | No |
| `NOTA_LE_QUEDA_MENSAJERO` «sin IVA, ya restados mensajero y bodega» | `notaLeQuedaMensajero(i)` | «sin IGV, ya restados …» | `detalle-cierre-labels.ts` | No |
| `NOTA_LE_QUEDA_BODEGA` «sin IVA, ya restados mensajeros y satélite» | `notaLeQuedaBodega(i)` | «sin IGV, ya restados …» | `detalle-cierre-labels.ts` | No |
| `DE_ESO_IVA` «de eso, IVA (no es de la empresa)» | `deEsoImpuesto(i)` | «de eso, IGV (no es de la empresa)» | `fila-gestion-labels.ts` | No |
| `ivaConPorcentaje(pct)` «IVA 13 %» | `impuestoConPorcentaje(pct, pais)` | «IGV 18 %» (separador de la moneda) | `fila-gestion-labels.ts` | No |
| `FLETE_DEV_CON_IVA_LABEL` «Flete por devolución a origen + IVA» | `fleteDevConImpuestoLabel(i)` | «… + IGV» | `cierre-labels.ts` | Sí: la leen `cierre-factura.tsx`, `cierre-detalle-shared.tsx`, la hoja fundida y tests |
| `FLETE_NO_ENTREGADAS_CON_IVA_LABEL` | `fleteNoEntregadasConImpuestoLabel(i)` | «Flete de gestiones no entregadas + IGV» | `cierre-labels.ts` | Sí |
| `fleteDevConIvaDeGestion(g)` | `fleteDevConImpuestoDeGestion(g, i)` | «Flete por novedad + IGV» | `cierre-labels.ts` | Sí (= nueva con `IMPUESTO_ROTULO`) |
| `ivaFleteNoEntregaLabel(r)` «IVA del flete por …» | `impuestoFleteNoEntregaLabel(r, i)` | «IGV del flete por …» | `cierre-labels.ts` | Sí |
| `IVA_FLETE_LABEL` «IVA flete» | `impuestoFleteLabel(i)` | «IGV flete» | `cierre-detalle-shared.tsx` | Sí |
| `IVA_COMISION_LABEL` «IVA comisión» | `impuestoComisionLabel(i)` | «IGV comisión» | `cierre-detalle-shared.tsx` | Sí |
| `IVA_FLETE_RECHAZO_LABEL` «IVA del flete por devolución a origen» | `impuestoFleteRechazoLabel(i)` | «IGV del flete por …» | `cierre-detalle-shared.tsx` | Sí |

(*) `COMISION_COD_LABEL` de `detalle-cierre-labels.ts` («Comisión COD + IVA») no es el de
`cierre-detalle-shared.tsx` («Comisión COD», sin impuesto), que no cambia.

- En `cierre-detalle-shared.tsx` solo cambian esas tres constantes y su import de `IMPUESTO_ROTULO`.
  Nada del código sin montar cambia.
- Tests que leen las constantes que se quedan (`rechazo-nombre-466-app.test.ts`,
  `CierreDesgloseModeloNuevo.test.tsx`, `CierreCobrosDeLaGestion.test.tsx`,
  `moneda-del-pais-cierres-admin.test.tsx`) **no cambian**: el texto es el mismo.
- Si P1 se cierra con «impuesto (<nombre>)», solo cambia el cuerpo de las funciones (con
  `impuestoEntreParentesis` de `encabezados-con-impuesto.ts`). Las constantes que se quedan deben
  seguir diciendo «IVA» a secas, porque las lee el código sin montar; y el tamaño cambia (P1).

## 6. Autorización y módulos

No hay operación, acción ni ruta nueva, y ningún componente cambia quién lo ve. La moneda y el
impuesto llegan por el proveedor del layout. SLT-235 los resolvió en el servidor con el
`organizacionId` de la sesión, nunca de la petición. No hay puerta de módulo nueva.

## 7. Descarga «Gestiones» del modelo nuevo (R7, R8; P2)

`cierres-gestiones-modelo-nuevo-descarga-columnas.ts` arma el texto de la tarifa con
`${MONTO_FIJO} ${money(valor)}` y con `porcentajeDe(valor, base)`.

```ts
// cierres-gestiones-modelo-nuevo-descarga-columnas.ts
function textoTarifa(t: ConceptoTarifaDTO | PagoPorTarifaDTO, moneda: FormatoMoneda): string;
//   monto      → `${MONTO_FIJO} ${formatearMontoEn(moneda, valor, SIN_MONTO_RAYA)}`
//   porcentaje → porcentajeDe(valor, base, moneda)

/** Factoría: la proyección de UNA gestión con la moneda del país. Sustituye a `filaGestionModeloNuevo`. */
export function filaGestionModeloNuevoEn(
  moneda: FormatoMoneda,
): (dto: CierreGestionDescargaDTO, audiencia: AudienciaDescargaGestionesFundida) => DescargaFila;

// cierres-gestiones-modelo-nuevo-descarga.ts
interface LibroGestionesEntrada { /* lo de hoy */ moneda: FormatoMoneda }  // obligatoria
```

- **Por qué una factoría y no un tercer argumento.** `columnas-sensibles.guardia` invoca cada función
  exportada de un `*-descarga-columnas.ts` con una sola sonda. Con
  `filaGestionModeloNuevo(dto, audiencia, moneda)`, la moneda llegaría `undefined` y
  `formatearMontoEn` lanzaría al leer `moneda.simbolo`: la guardia se pondría roja. La guardia ya
  admite factorías (`fila(x)(dto)`): la primera llamada recibe la sonda como moneda y la segunda
  como DTO (alternativa 5).
- `libroGestiones` llama a `filaGestionModeloNuevoEn(moneda)` una vez y proyecta cada gestión.
- `DescargarGestionesDialog.tsx` ya lee `useImpuestoDelPais()` (SLT-243). Lee también
  `useMonedaDelPais()` y pasa `moneda` a `libroGestiones`.
- Sale el import de `money`, y el archivo entra en el censo R18 (R12). SLT-243 lo dejó fuera solo por
  esta llamada.
- `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts`: sus 8 `libroGestiones({…})`
  pasan `moneda: MONEDA_PLATAFORMA`, y sus 3 `filaGestionModeloNuevo(dto, a)` pasan a
  `filaGestionModeloNuevoEn(MONEDA_PLATAFORMA)(dto, a)`. **Ningún valor esperado cambia** («Monto
  fijo ₡3.500 · …» sigue igual, R9).
- No cambian encabezados, claves, orden, celdas de importe ni el resto de las celdas de texto.

## 8. Guardias y tests que cambian de forma (R12–R14)

- **Censo R18 de SLT-235** (`CENSO_MONEDA_DEL_PAIS` en `moneda-del-pais-pantallas.test.tsx`): nuevo
  bloque «SLT-244» con 14 archivos: `ColaCierres.tsx`, `TablaColaPropia.tsx`, `CifrasCierre.tsx`,
  `Cuenta.tsx`, `DineroCierre.tsx`, `MensajerosCierreBodega.tsx`, `DetalleCierre.tsx`,
  `detalle-cierre-vista.ts`, `detalle-cierre-labels.ts`, `FilaGestion.tsx`, `fila-gestion-vista.ts`,
  `fila-gestion-labels.ts`, `cierres-gestiones-modelo-nuevo-descarga-columnas.ts` y
  `DescargarGestionesDialog.tsx`.
  - Se borra la línea del comentario del bloque de SLT-243 que dejaba fuera la descarga «por P3».
  - El caso de SLT-243 «los 10 de SLT-243» ya corta 10 entradas (`slice(i, i + 10)`): no cambia.
  - Caso nuevo, igual a los anteriores: «los 14 de SLT-244 dan rojo con `money(` o
    `formatMontoString(`».
- **Censo de la carpeta** (R12, R13), en el test nuevo, sobre cada `.ts`/`.tsx` de
  `components/private/cierres/**` leído del disco (no una lista fija, para que un archivo nuevo entre
  solo), con la fuente sin comentarios (`quitarComentarios`):
  - ninguno llama a `money(`, `moneyTope(`, `formatMontoString(` ni `formatMontoTope(`;
  - ninguno tiene `\bIVA\b`, importa `IMPUESTO_ROTULO`, ni llama a `porcentajeParaVerEnLaPlataforma`;
  - ninguno importa `FLETE_DEV_CON_IVA_LABEL`, `FLETE_NO_ENTREGADAS_CON_IVA_LABEL`,
    `fleteDevConIvaDeGestion`, `ivaFleteNoEntregaLabel`, `IVA_FLETE_LABEL`, `IVA_COMISION_LABEL` ni
    `IVA_FLETE_RECHAZO_LABEL`;
  - con su contraprueba sobre fuentes inventadas (rojo con cada patrón; verde con el patrón solo en
    un comentario).
- **`porcentajeParaVerEnLaPlataforma` (P4):** se borra de `tarifas-textos.ts` y su caso de
  `moneda-del-pais-tarifas.test.tsx` (línea ~972) sale; su import también. Si el typecheck encuentra
  otro llamador, se avisa al leader.
- **`pais-sin-literales` (R14):** el archivo de excepciones no se edita. Un caso del test nuevo afirma
  que `EXCEPCIONES_PAIS_SIN_LITERALES.filter((e) => e.ficha === "SLT-244")` es `[]` y que
  `TOPE_EXCEPCIONES` vale como mucho 12 (`toBeLessThanOrEqual`). Hoy no hay entradas de SLT-244, así
  que no hay ninguna que quitar ni tope que bajar.
- **R8 por typecheck:** `@ts-expect-error` en `cifrasDe(t, a, d)`, `lineasDinero(t, d)`,
  `tarjetasDe(g, a, c)`, `calculoDe(g, x)`, `porcentajeDe(v, b)` y
  `libroGestiones({ items, rechazos, columnasAnterior, audiencia })` sin `moneda`.

## 9. Mapa R → test

Archivo nuevo: `tests/components/moneda-del-pais-cierres-componentes.test.tsx`. Cada caso de pantalla
se monta de tres formas: con `MonedaDelPaisProvider` + `MONEDA_DE_PRUEBA` + «IGV», con `MONEDA_CR` +
«IVA» y sin proveedor (helper como `compruebaCostaRicaYCaida` de `moneda-del-pais-cierres-admin.test.tsx`).
Las acciones y los datos se doblan como en los tests que ya existen de cada componente
(`DetalleCierre.test.tsx`, `DetalleCierreDinero.test.tsx`, `FilaGestion.test.tsx`,
`ColaCierres`/`CierresAdminModule.test.tsx`…).

| R | Test |
|---|---|
| R1 | Test nuevo: `ColaCierres` (pestañas de mensajeros, «A consolidar» y bodega con dobles) y `TablaColaPropia` pintan cada importe en «€» con espacio de miles; un importe nulo, «—» |
| R2 | Test nuevo: `CifrasCierre` (cifra y desglose por método), `Cuenta` (línea y aparte), `DineroCierre` (reparto y por tienda) y `MensajerosCierreBodega` en «€» |
| R3 | Test nuevo: `pieTextoDe` de un cierre de mensajero y de uno de bodega con `MONEDA_DE_PRUEBA` contiene «€…»; `lineasDinero` del modelo viejo con desglose de bodega lleva la nota con «€» |
| R4 | Test nuevo: `FilaGestion` desplegada pinta columnas, ganancia y tarjetas en «€» |
| R5 | Test nuevo: `calculoDe` con una tarifa en porcentaje y base: «2 % de €25 000»; un porcentaje «3.50» sale «3,5» con una moneda de coma decimal y «3.5» con `MONEDA_DE_PRUEBA`; el modelo viejo, «IGV flete (13 % de €…)» |
| R6 | Test nuevo: cada función de la tabla de §5 con «IGV» da, literal escrito a mano, la columna «Perú»; montado con el proveedor de prueba, el detalle dice «Flete por entregado + IGV» e «IGV (no es de la empresa)» y la fila «de eso, IGV (no es de la empresa)» |
| R7 | `cierres-gestiones-modelo-nuevo-descarga.test.ts` sigue verde sin cambiar valores; test nuevo: `filaGestionModeloNuevoEn(MONEDA_DE_PRUEBA)` da «Monto fijo €3 500 · …» y «2 % de €25 000 · …», y las demás celdas iguales a las de `MONEDA_PLATAFORMA`; `DescargarGestionesDialog` con el proveedor de prueba arma el libro con «€» en la tarifa |
| R8 | Test nuevo: los `@ts-expect-error` de §8 (los comprueba `pnpm run typecheck`) |
| R9 | Cada caso de R1–R7 con `MONEDA_CR` + «IVA» da el mismo texto que sin proveedor; cada función de §5 con «IVA» da el texto de hoy; siguen verdes **sin cambiar ningún valor esperado** `detalle-cierre-vista.test.ts`, `fila-gestion-vista.test.ts`, `cierres-gestiones-modelo-nuevo-descarga.test.ts`, `FilaGestion.test.tsx`, `DetalleCierre*.test.tsx`, `DineroIdentidadesEnPantalla.test.tsx`, `CierreDesgloseModeloNuevo.test.tsx`, `rechazo-nombre-466-app.test.ts` y los E2E de cierres |
| R10 | Test nuevo: sin proveedor, cada componente = `formatearMontoEn(MONEDA_PLATAFORMA, v, SIN_MONTO_RAYA)` y los rótulos dicen «IVA» |
| R11 | El reviewer comprueba en el diff: sin sumas ni restas nuevas; claves con «iva» sin renombrar; de `cierre-detalle-shared.tsx` solo las tres constantes de §5 y su import; `cierre-factura.tsx`, wallet, plataforma, órdenes y encabezados de descarga fuera del diff; en los tests que ya existían solo cambian llamadas, no valores esperados |
| R12 | `moneda-del-pais-pantallas.test.tsx > censo de R18` con los 14 archivos de §8 y su caso de rojo; censo de la carpeta del test nuevo |
| R13 | Test nuevo: censo «sin IVA» de la carpeta con su contraprueba |
| R14 | Test nuevo: ninguna excepción con `ficha === "SLT-244"` y `TOPE_EXCEPCIONES` ≤ 12; `pais-sin-literales.guardia.test.ts` verde sin tocarlo |

## 10. Riesgos

- **La guardia de columnas sensibles con la factoría.** La primera llamada recibe la sonda (un
  `Proxy`) como moneda. Leído el 2026-11-23: `formatearMontoEn` con un valor que no es decimal pinta
  `${moneda.simbolo}${texto}`, y `porcentajeParaVer` usa `moneda.separadorDecimal` en un `replace`;
  con la sonda, los dos dan el texto del marcador y no lanzan. Aun así, T4.1 corre
  `columnas-sensibles.guardia` antes que nada. Si se pone roja, el implementer para y avisa: la
  guardia no se relaja de paso.
- **Las guardias de cierres leen el fuente.** `liquidacion-money-safe`, `cierres-trato-tu`,
  `pwa-mensajero-sin-recorte`, `cierre-bodega-vocabulario` (corta `detalle-cierre-vista.ts` por
  `export function lineasDinero`), `flete-por-rechazo-censo` y `rechazo-nombre-466` leen el fuente
  de estos archivos. Ninguna exige hoy `money` ni el literal «IVA» en ellos (Grep del 2026-11-23).
  Si alguna se pone roja, el implementer para y avisa.
- **Pantalla mixta en la conciliación de la satélite.** `Cuenta` sale en la moneda del país y el
  resto de `ConciliacionSatelite.tsx` en la de la plataforma, hasta su rebanada de la wallet. Solo
  se nota fuera de Costa Rica.
- **Pantalla y descarga con formas distintas.** Con P1 = nombre a secas, el detalle dice «Flete por
  entregado + IGV» y la descarga del admin «Flete + impuesto (IGV)» (SLT-243). Esa diferencia ya
  existe hoy en Costa Rica.
- **Llamadores que el Grep no vio.** Si el typecheck señala otro llamador de las funciones de §4.2 o
  de `libroGestiones`, y es de esta ficha, se añade a «Archivos esperados» antes del PR. Si es de
  otra, se avisa al leader y no se toca.
- **Memo de 10 min.** Un cambio de moneda o de impuesto tarda hasta 10 min en verse por instancia
  (coste aceptado en SLT-235).

## 11. Alternativas descartadas

1. **Moneda e impuesto opcionales, con default de la plataforma**, en las funciones puras. Ahorra
   tocar ~70 llamadas en 3 suites de tests. Pero un llamador que se olvide cae en silencio a «IVA» y
   «₡»: es lo que la decisión cerrada «moneda explícita» prohíbe y lo que señaló H2 de
   `review_SLT-243.md`.
2. **Post-procesar los textos en el componente** (reemplazar «IVA» y reformatear los importes sobre
   lo que devuelven las funciones puras). Los importes ya vienen formateados dentro del texto («2 %
   de ₡25.000»), así que habría que volver a leerlos. Y un `replace` de «IVA» tocaría cualquier texto
   futuro que lo diga por otra razón (SLT-243, alternativa 5).
3. **Pasar la moneda por props** de `DetalleCierre` a `CifrasCierre`, `Cuenta`, `DineroCierre`… Cambia
   la firma de 7 componentes y de quienes los montan (`ConciliacionSatelite`, `CalculoCobro`), y obliga
   a tocar sus tests. Leer el hook dentro es el patrón de `PriceLabel` y `MarcaAjustado`.
4. **Convertir las constantes con «IVA» de `cierres-admin` en funciones y borrar las constantes.**
   Obliga a tocar el código sin montar de `cierre-factura.tsx` y `cierre-detalle-shared.tsx` (SLT-243
   P1) y 4 suites de tests que las leen. Dejar la constante como «función con `IMPUESTO_ROTULO`»
   mantiene una sola fuente sin tocar ese código.
5. **`filaGestionModeloNuevo(dto, audiencia, moneda)` con un tercer argumento.** Más directo, pero
   `columnas-sensibles.guardia` llama a la función con una sola sonda y la moneda llegaría
   `undefined` (§7).
6. **Migrar solo el monto fijo o solo el porcentaje del texto de la tarifa.** Dejaría una columna con
   dos monedas según la fila (P2).
7. **La forma «impuesto (<nombre>)» también en pantalla** (como las descargas de SLT-243). Pantalla y
   descarga dirían lo mismo, pero cambia Costa Rica, contra la description de la ficha, y la ficha
   pasa del 80% del tope (P1).

## 12. Tamaño

Ver `tasks.md > Tamaño`: 24 archivos (18 de producción, 6 de tests), el 60% del tope de 40. Por
debajo del umbral del 80% (32).

## Dependencias de terceros

Ninguna nueva.
