# Review — SLT-104 «Detalle de cierre de bodega en el detalle único (central)»

Reviewer, 2026-11-10. Worktree `.worktrees/SLT-104-detalle-bodega-central`, rama
`feature/SLT-104-detalle-bodega-central`, HEAD `a098fa25`, diff `origin/dev...HEAD` (47 archivos).
Ruta completa (fullstack tras PA1 y PA3 = sí). Grafo: no consultado; uso Grep/Read y git.

## Veredicto: **OK con menores**

Cero bloqueantes, cero mayores, cuatro menores.

## Checklist

- [x] Ruta: completa. Toca autorización de lectura (PA1) y pantalla de dinero, así que la completa es la correcta.
- [x] `requirements.md` en EARS (R31, R40-R43, R71, R72, R77, R111-R121), `design.md` con `## Lo que ya existe`
  completa y 6 alternativas descartadas, `tasks.md` con trazabilidad.
- [ ] Tasks: T0-T6 `[x]`; **T7.1 y T7.2 `[ ]`** (menor m1, con el mismo criterio que en SLT-101 y SLT-102).
- [x] Tamaño: `node scripts/tamano-pr.mjs` da 42/40 archivos y 4448 líneas, con `tamano-pr-aceptado` de Carlos (PA4) en
  `progress/features/SLT-104.md:27`.
- [x] El diff no re-crea nada de `## Lo que ya existe`: reutiliza `DetalleCierre`, `GestionesCierre`, `Cuenta`,
  `ConciliacionAcciones` (sin tocar), `pagosAjustados`, `hrefDetalleCierre`, `DescargarDatasetButton` y `VisorEvidencia`.
- [x] Assignee: Carlos Restrepo (ficha).
- [x] Trazabilidad: cada R tiene un test concreto (tabla abajo) y está el mapa R→test en `impl_SLT-104.md`.
- [x] Typecheck: `tsc --noEmit` EXIT=0.
- [x] Lint de los archivos del diff: 0 errores. El único warning (`DineroIdentidadesEnPantalla.test.tsx:541`) ya estaba en `origin/dev`.
- [x] Guardias (`vitest run guard`): 4823 en verde. Los 4 rojos son de `dependencias-declaradas-presentes`, que está en
  `tests/baseline-rojos.json:51` y no es de esta ficha.
- [x] Tests del diff que corrí yo (base `slt104_t1`):
  - integración + servicio + repositorio: 4 archivos, 79/79, ninguno saltado;
  - componentes + unit: 14 archivos, 274/274.
- [x] E2E en local constatados en `impl_SLT-104.md` (Tanda 4): `--project=dinero` 94/94 dos veces y
  `dos-empresas-humo` 18/18. No los repetí, porque el leader pidió no correr el E2E.
- [x] R71: en el diff de `components/` y `app/` no se añade ningún `Number(`, `parseFloat`, `parseInt` ni `toFixed`.
- [x] R72: `db/` y `prisma/` sin cambios y ninguna Server Action tocada (`lib/actions/` no está en el diff).
- [x] Datos y seguridad: sin tablas ni migraciones. La query nueva (lectura ancha) va filtrada por empresa (extensión +
  RLS) y la prueba un test de integración con dos empresas. Sin literales de país ni moneda en código nuevo (los dos `₡0`
  son comentarios), sin Ordenex y sin `console.log`.
- [x] Permisos: se validan en el servidor (detalle en el punto 1).
- [x] Sin dependencias nuevas.

## 1. Autorización (PA1, R116), comprobada en el código

- **La lectura ancha solo la reciben maestro y admin.** `alcanceDeLectura` (`lib/services/CierresAdminService.ts:123-125`)
  devuelve `{ lectura: "toda_la_empresa" }` solo si `esAccesoTotal(actor.rol)`, es decir `[maestro, admin]`
  (`lib/auth/acceso-total.ts:5`). Al resto le pasa su `Alcance` sin cambios. Además, `resolveAlcance` corre antes
  (`:867-869`), así que mensajero, adminTienda, apiKey y superadmin siguen en `forbidden` y sin zona da `no_encontrada`.
- **Ninguna escritura puede recibir la lectura ancha.**
  - `AlcanceLecturaEmpresa` no es un `Alcance` (`ICierresAdminRepository.ts:45-50`).
  - Solo `findCierreByIdEnAlcance` acepta `AlcanceLecturaDetalle`, y `alcanceWhere`, que comparten las listas y las
    escrituras, sigue tipado `Alcance` y no cambia.
  - Los únicos dos llamadores de `findCierreByIdEnAlcance` son `verCierreDetalle` (`:873`, con la lectura ancha) y
    `avisarDelRechazo` (`:476`, con el `Alcance` de la escritura).
  - `alcanceDeLectura(` aparece una sola vez fuera de su definición.
- **La empresa se filtra.**
  - `CierreDia` está en `lib/db/modelos-de-negocio.ts:85`, de modo que la extensión del cliente pone `organizacion_id`,
    y la RLS de `cierre_dia` lo vuelve a exigir.
  - Integración (`tests/integration/db/cierre-detalle-central-lee-satelite-sql-real.test.ts:187-191`): el maestro de B
    no lee el cierre de satélite de A, ni el de A el de B. Corrida en verde, sin saltos. La mutación M2 de la bitácora
    (sin extensión ni RLS) lo pone rojo.
- **La pantalla no ofrece ninguna acción.** `soloLecturaSatelite` (`CierresAdminModule.tsx:1094`) apaga el modo
  decidir, `ofrecerPagoEnDetalle`, `esResoluble` (aprobar/rechazar), destrabar, corregir métodos, corregir resultado
  y ajustar, y deja la fila en «solo lectura». Las pestañas que quedan (`RechazosDeTiendaCierre`, `SeccionSinGestion`)
  no escriben. Lo vigilan `CierresAdminDeepLink.test.tsx:351-455` y el E2E S6 de `cierres-rediseno.spec.ts`: pie solo
  con «Cerrar», ninguna escritura, sin «Pago al mensajero» y la base sin cambios.
- **SLT-122 «Pago al mensajero: solo la bodega dueña del cierre».** Esta ficha no lo empeora: el detalle de satélite
  **no** monta `PagoMensajeroSeccion`, ni siquiera en un `aprobado` con permiso de pagar (test
  `CierresAdminDeepLink` «aprobado de satélite: sin la pestaña "Pago al mensajero"» y E2E).

## 2. Trazabilidad

| R | Test que lo verifica (abierto y leído) |
|---|---|
| R31 | `CierresBodegaAdminDetalleUnico.test.tsx:345` (sin corregir ni ajustar; sí evidencia y fulfillment); `CierresAdminDeepLink` R116 |
| R40 | `CierresBodegaAdminDetalleUnico.test.tsx:229` (`dialog` con su nombre); E2E `cierre-bodega-satelite` |
| R41 | `detalle-cierre-vista.test.ts` (`gestionesDeBodega`); `CierresBodegaAdminDetalleUnico.test.tsx:334`; `CierreBodegaDetalleGestiones.test.tsx` |
| R42 / R114 | `DetalleCierreBodega.test.tsx:127-166`; `detalle-cierre-vista.test.ts` (`filasMensajeros`); `cierre-detalle-ajuste-badge.test.tsx`; E2E |
| R43 / R117 | `DetalleCierreBodega.test.tsx:198-275` («—», «Aún nadie», con marca, negativo, `sinImporte`); E2E antes y después de marcar |
| R71 | `liquidacion-money-safe` con los dos `.tsx` censados (contraprueba en T5.2) |
| R72 | diff: `db/` vacío, ninguna Server Action |
| R77 | E2E `cierre-bodega-satelite` (modelo viejo) y `cierres-rediseno` S6 (modelo nuevo), con literales escritos a mano |
| R111 | `CierresBodegaAdminDetalleUnico.test.tsx:229,269`; `modoBodegaDe` |
| R112 | `CierresBodegaAdminDetalleUnico.test.tsx:229,254,269,281` |
| R113 | `CierresBodegaAdminDetalleUnico.test.tsx:334`; `detalle-cierre-descarga-columnas.test.ts` |
| R115 | `DetalleCierreBodega.test.tsx:168`; `CierresBodegaAdminDetalleUnico.test.tsx:365`; E2E S6 |
| R116 | integración (5 casos); `cierres-admin-detalle-lectura.test.ts` (lee / no escribe / roles); `CierresAdminDeepLink.test.tsx:351` |
| R118 | `CierresBodegaAdminDetalleUnico.test.tsx:245` |
| R119 | `CierresBodegaAdminDetalleUnico.test.tsx:304,317` |
| R120 | `cierres-bodega-admin-service.test.ts:1794`; `CierresBodegaAdminDetalleUnico.test.tsx:354` (18:42, no 19:05) |
| R121 | `DetalleCierreBodega.test.tsx:186`; `detalle-cierre-vista.test.ts` |

## 3. Fidelidad al canvas

Comparé `Main.dc.html:186-206` (Mensajeros y Conciliación) y `:425-434` (datos) con `MensajerosCierreBodega.tsx`,
`ConciliacionCierreBodega.tsx` y `Cuenta.tsx`.

**Coincide con el canvas:**
- rejilla `1.6fr 90px 1fr 1fr 1fr 1.2fr 120px`;
- cabecera de 12 px y filas de 14 px con `py-3`;
- cuatro números a la derecha;
- «Señales» en ámbar de 12 px con `pl-4`;
- «Ver su cierre» en azul de 14 px;
- tarjeta con `px-4 py-1` y borde;
- Conciliación: `max-w-[520px]`, título de 15 px, líneas de 14 px con `gap-2` y «− Recibido» en gris;
- «Falta por recibir» en negrita con raya continua;
- «Marcó: …» de 13 px bajo raya punteada.

Las diferencias de F5, F10, F12 y «Desmarcar» están en la tabla de desviaciones. Las que no están en la tabla son dos
detalles de píxel (m4).

## 4. `Cuenta` y `DineroCierre` a 15 px

El canvas respalda el cambio:
- `Main.dc.html:97, 113, 125, 167, 172, 199`: todos los títulos de cuenta y de tarjeta a 15 px;
- `Fila2.dc.html:39, 50, 62, 74, 89, 98`: los de la fila, también a 15 px.

`Cuenta` lo usan solo `ConciliacionCierreBodega`, `DetalleCierre`/`DineroCierre`, `fila/CalculoCobro` y `fila/FilaGestion`,
todos dibujados en ese canvas a 15 px. Tras el cambio, ningún `h3` ni `h4` de `components/private/cierres/` queda en
14 px. Ningún test afirmaba el tamaño y los 274 tests de componentes siguen en verde.

## 5. Vigilancia retirada en T5 (commit `70ebdea9`)

Crucé cada `it` borrado en `CierreBodegaDesglosePorTienda` (-24/+15), `CierreBodegaDetalleCascadas` (-18/+18),
`CierreBodegaDetalleGestiones` (-13/+13), `DineroIdentidadesEnPantalla` (-4/+4) y `cierre-detalle-ajuste-badge` (-1/+1)
con `impl_SLT-104.md:371-402`.

- Casi todos los retiros citan un R o una desviación: R118/R115 (por cierre del día), SLT-95 R16 con canvas F6 («Para la
  tienda»), R41/R113 (pestañas por mensajero), SLT-95 R7/D4 («Transferencia») y requirements > Lo que NO entra (ingreso
  por concepto).
- Los casos negativos (R36, R11, R37) siguen en `CierreBodegaDetalleCascadas.test.tsx:564-606`.
- Dos retiros no los cita la bitácora (m2).

## 6. Tests débiles

- `return;` añadidos:
  - `if (sat.status !== "ok") return;` y `if (r.status !== "ok") return;` van siempre detrás de
    `expect(...status).toBe("ok")`, así que no pueden pasar en verde sin comprobar nada;
  - `if (ids.length === 0) return;` está en la limpieza de la integración.
- Negativos con valores imposibles por casualidad:
  - `not.toContain("19:05")` va junto al positivo `toContain("(07/11/2026 18:42)")`;
  - `not.toContain("₡0")` va con el positivo «—»;
  - las ausencias del E2E S6 van detrás de un control positivo (cifras cargadas).
- Literales escritos a mano (`impl > T0.3`), no derivados de `money()` ni de la función que se prueba.
- La autocomprobación de `cierre-bodega-vocabulario` exige que los dos trozos de la vista existan y no salgan vacíos
  (`:394-407`), así que el `if (inicio !== -1)` del extractor no puede vaciar el censo en silencio.

## 7. `solicitadoAt`

- `CierreBodegaDetalleCierreRow.solicitadoAt: string` es **requerido** (`ICierresBodegaAdminRepository.ts:26-27`).
- `DETALLE_CIERRE_SELECT` lo pide y `toDetalleCierreRow` lo mapea siempre (`CierresBodegaAdminRepository.ts:175, 200`).
- Lo propaga el único constructor de `cierres[]` del detalle de admin (`CierresBodegaAdminService.ts:340`).
- El compilador obliga a todo productor de la fila a traerlo, y lo vigila `cierres-bodega-admin-service.test.ts:1794`
  (dos cierres del día con su propio instante; la mutación M7 lo pone rojo).
- Que sea opcional en `CierreBodegaDetalleCierre` es aditivo y está justificado en `impl:180-185`: el tipo lo comparte la
  consolidación.
- Si llegara sin el campo, la nota sale sin fecha (`gestionesDeBodega`: `cd.solicitadoAt ?? null`), nunca con la del
  cierre de bodega (R120).

## Hallazgos

1. **menor — T7.1 y T7.2 sin marcar** (`specs/SLT-104-detalle-bodega-central/tasks.md:176-182`). T7.1 es el gate de
   cierre: lo cierra el leader al abrir el PR. Typecheck, lint, guardias, `db/` vacío y el grep de R71 los confirmo
   arriba. T7.2 es el Preview con Carlos.
2. **menor — dos retiros de T5 sin motivo citado** (`tests/components/CierreBodegaDesglosePorTienda.test.tsx:620, 642`):
   - el test «los cinco rótulos de dinero que nombran a la tienda son cinco textos distintos» se borró, y su sustituto
     (`:620`, columnas = textos aprobados) no vigila que sean distintos entre sí;
   - de «dos tiendas HOMÓNIMAS no se funden Y NO comparten nombre accesible» quedó solo la primera mitad (`:642`).

   Ninguno de los dos está en `impl_SLT-104.md:393-398`. Probablemente no aplican (la tabla «Por tienda» no tiene
   regiones con nombre y «Para la tienda» se retiró con cita), pero falta la línea que lo diga.
3. **menor — el design y el código no dicen lo mismo de `sinImporte`.** `design.md:164-166` dice que `Cuenta` pinta «—»
   con `data-monto=""`. El código pinta «—» **dentro** de `data-monto` y marca la línea con `data-sin-importe`
   (`components/private/cierres/detalle/Cuenta.tsx:97, 120`). Está anotado en `impl:285`. Hoy no rompe nada, porque
   ninguna aserción de identidades recorre «Conciliación». Pero un barrido futuro de `[data-monto]` leería «—» como
   importe. Conviene alinear el design o filtrar por `data-sin-importe`.
4. **menor — dos diferencias de píxel fuera de la tabla de desviaciones:**
   - en «Mensajeros», la última fila no lleva raya inferior (`last:border-b-0`, `MensajerosCierreBodega.tsx:54`), y el
     canvas la dibuja en todas (`Main.dc.html:192`);
   - en «Conciliación», el relleno es `p-4` (16 px) y el canvas pone `16px 18px` (`Main.dc.html:198`); `Cuenta.tsx:73`
     es compartida.

   Para el Preview; no merecen tocar el componente compartido.

## Notas (no son hallazgos)

- Rojo de `dependencias-declaradas-presentes`: está en el baseline (`tests/baseline-rojos.json:51`).
- No apliqué mutaciones propias porque el encargo prohíbe editar código o tests. Las de la bitácora (T1 M1-M7 y T2-T4
  M1-M9) son coherentes con lo que leí: M1 en verde por la RLS, como se esperaba, y M2 en rojo.
