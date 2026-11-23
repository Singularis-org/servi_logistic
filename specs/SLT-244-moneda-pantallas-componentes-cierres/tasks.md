# SLT-244 — Moneda e impuesto del país en pantallas: componentes de cierres · tasks

> Los requisitos están en `requirements.md` y el cómo, en `design.md`.
>
> Una task está hecha cuando cumple su criterio **y** `pnpm run typecheck` está en verde. `[P]`
> marca las tasks que pueden ir en paralelo con las otras `[P]` de su bloque.
>
> Tests:
> - Cada task añade sus casos a `tests/components/moneda-del-pais-cierres-componentes.test.tsx`. Es un
>   archivo nuevo; lo crea la primera task que llegue.
> - Cada caso de pantalla se prueba tres veces: con `MONEDA_DE_PRUEBA` + «IGV», con `MONEDA_CR` +
>   «IVA» y sin proveedor. Con CR, el texto debe ser el mismo que sin proveedor (R9, R10).
> - Los tests que ya existían y solo cambian la forma de llamar **no cambian ningún valor esperado**.
>
> Escrito con la recomendación de P1–P4 (`requirements.md > Preguntas abiertas`). Si P1 se cierra con
> «impuesto (<nombre>)», cambian T2.1 y el tamaño (ver P1).

## Bloque 1 — Importes de los componentes (R1, R2, R4, R10)

- [x] **T1.1** [P] La cola: `ColaCierres.tsx` (11 `money(`) y `TablaColaPropia.tsx` (3) leen
  `useMonedaDelPais()` y pasan a `formatearMontoEn(moneda, …, SIN_MONTO_RAYA)` (design §3).
  - Casos de R1.
  - *Hecho:* en verde; `CierresAdminModule.test.tsx`, los tests de la cola y de `/cierre-dia` y la
    guardia `liquidacion-money-safe` pasan sin tocarlos.
- [x] **T1.2** [P] El detalle: `CifrasCierre.tsx`, `Cuenta.tsx`, `DineroCierre.tsx` y
  `MensajerosCierreBodega.tsx` (design §3).
  - Casos de R2.
  - *Hecho:* en verde; `DetalleCierre.test.tsx`, `DetalleCierreBodega.test.tsx`,
    `DetalleCierreDinero.test.tsx` y `DineroIdentidadesEnPantalla.test.tsx` pasan sin tocarlos.

## Bloque 2 — Textos de los módulos puros (R3, R5, R6, R8) (en paralelo con el bloque 1)

- [x] **T2.1** Rótulos con el impuesto (design §5).
  - Funciones nuevas en `detalle-cierre-labels.ts` (5) y `fila-gestion-labels.ts` (`deEsoImpuesto`,
    `impuestoConPorcentaje`), que sustituyen a sus constantes (que salen).
  - Funciones nuevas en `cierre-labels.ts` (4) y `cierre-detalle-shared.tsx` (3). Sus constantes se
    quedan, definidas como la función con `IMPUESTO_ROTULO`. En `cierre-detalle-shared.tsx` no se toca
    nada más.
  - Casos de R6: las funciones con «IGV» dan la columna «Perú» de design §5, con literales escritos a
    mano; con «IVA», el texto de hoy (R9).
  - *Hecho:* en verde; `rechazo-nombre-466-app.test.ts`, `CierreDesgloseModeloNuevo.test.tsx`,
    `CierreCobrosDeLaGestion.test.tsx`, `moneda-del-pais-cierres-admin.test.tsx`,
    `flete-por-rechazo-censo.guardia.test.ts` y `rechazo-nombre-466.guardia.test.ts` pasan sin
    tocarlos.
- [x] **T2.2** Detalle: `PaisDelCierre`, `pieResumenMensajero`, `pieBodega`, `notaOrigenIngresoBodega`,
  `pieTextoDe`, `lineasDinero` y `cifrasDe` con la moneda y el impuesto obligatorios (design §4).
  `DetalleCierre.tsx` lee los dos hooks y pasa `pais`. Depende de T2.1.
  - `detalle-cierre-vista.test.ts`: sus llamadas pasan la constante de la plataforma.
  - Casos de R3 y los `@ts-expect-error` de `cifrasDe` y `lineasDinero` (R8).
  - *Hecho:* en verde; `detalle-cierre-vista.test.ts` sin cambiar ningún valor esperado;
    `cierre-bodega-vocabulario.guardia.test.ts` en verde sin tocarla.
- [x] **T2.3** Fila: `porcentajeDe`, `conPorcentaje`, `tarjetasDe` y `calculoDe` con la moneda y el
  impuesto obligatorios, y `porcentajeParaVer(…, moneda)` en lugar de
  `porcentajeParaVerEnLaPlataforma` (design §4). `FilaGestion.tsx` lee los dos hooks, pasa `pais` y
  formatea sus 2 importes (R4). Depende de T2.1.
  - `fila-gestion-vista.test.ts`: sus llamadas pasan la constante de la plataforma.
  - Casos de R4, R5 y los `@ts-expect-error` de `tarjetasDe`, `calculoDe` y `porcentajeDe` (R8).
  - *Hecho:* en verde; `fila-gestion-vista.test.ts` sin cambiar ningún valor esperado;
    `FilaGestion.test.tsx`, `DetalleCierreGestiones.test.tsx` y `cierres-trato-tu.guardia.test.ts`
    pasan sin tocarlos.

## Bloque 3 — Descarga «Gestiones» (R7, R8) (depende de T2.3: usa `porcentajeDe`)

- [x] **T3.1** Antes de cambiar nada, correr `columnas-sensibles.guardia.test.ts` sobre un borrador
  de la factoría y confirmar que la sonda como moneda no lanza (design §10). Si se pone roja, parar y
  avisar.
  - Después: `textoTarifa(t, moneda)`, `filaGestionModeloNuevoEn(moneda)` en lugar de
    `filaGestionModeloNuevo`, `moneda` obligatoria en `LibroGestionesEntrada`, y
    `DescargarGestionesDialog.tsx` pasa `useMonedaDelPais()` (design §7).
  - `cierres-gestiones-modelo-nuevo-descarga.test.ts`: 8 `libroGestiones` con
    `moneda: MONEDA_PLATAFORMA` y 3 llamadas a la factoría.
  - Casos de R7 y el `@ts-expect-error` de `libroGestiones` sin `moneda` (R8).
  - *Hecho:* en verde; la suite de descarga sin cambiar ningún valor esperado;
    `columnas-sensibles.guardia.test.ts`, `cierres-gestiones-paridad.test.ts`,
    `DescargarGestionesDialog.test.tsx` y `DescargarGestionesModeloNuevo.test.tsx` pasan sin tocarlos.

## Bloque 4 — Guardias y cierre (depende de los bloques 1–3)

- [x] **T4.1** `porcentajeParaVerEnLaPlataforma` sale de `tarifas-textos.ts`, con su caso y su import
  en `moneda-del-pais-tarifas.test.tsx` (P4).
  - *Hecho:* typecheck en verde (ningún llamador más) y `moneda-del-pais-tarifas.test.tsx` en verde.
- [x] **T4.2** Censo de R18 de SLT-235 (design §8).
  - `CENSO_MONEDA_DEL_PAIS` gana el bloque «SLT-244» con los 14 archivos; sale la línea del
    comentario de SLT-243 que dejaba fuera la descarga «por P3».
  - Caso nuevo: «los 14 de SLT-244 dan rojo con `money(` o `formatMontoString(`» (R12).
  - *Hecho:* en verde, y rojo si se reescribe un `money(` en uno de ellos.
- [x] **T4.3** En el test nuevo:
  - el censo de la carpeta `components/private/cierres/**`, leída del disco: sin formateadores
    implícitos (R12) y «sin IVA» (R13), con su contraprueba;
  - el caso de R14: ninguna excepción con `ficha === "SLT-244"` y `TOPE_EXCEPCIONES` ≤ 12
    (`toBeLessThanOrEqual`). No se edita `_pais-sin-literales-excepciones.ts`.
  - *Hecho:* `pnpm run test:guardias` en verde.
- [x] **T4.4** Cierre.
  - `./init.sh` en verde.
  - E2E en local sobre una base desechable (`docs/perfil-agentes.md > E2E en local antes del PR`):
    - el grupo `dinero`;
    - los que salgan de `grep -rl` en `e2e/` por `cierres-admin`, `cierre-dia`, `Ver cómo se calculó`
      y `Gestiones`. Hoy son al menos `cierres-rediseno.spec.ts`,
      `cierre-modelo-nuevo-plan-porcentual.spec.ts`, `cierres-admin.spec.ts`, `cierre-dia.spec.ts`
      y `cierre-bodega-satelite.spec.ts`.
    - Ninguno debería cambiar: con Costa Rica el texto es el mismo (R9).
  - El mapa R → test va en `progress/impl_SLT-244.md`.
  - El reviewer comprueba en el diff lo de R11 (design §9).
  - *Hecho:* todo verde y el mapa cubre los 14 requisitos.

## Archivos esperados

Producción:
- `components/private/cierres/cola/ColaCierres.tsx`
- `components/private/cierres/cola/TablaColaPropia.tsx`
- `components/private/cierres/detalle/CifrasCierre.tsx`
- `components/private/cierres/detalle/Cuenta.tsx`
- `components/private/cierres/detalle/DineroCierre.tsx`
- `components/private/cierres/detalle/MensajerosCierreBodega.tsx`
- `components/private/cierres/detalle/DetalleCierre.tsx`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `components/private/cierres/detalle/detalle-cierre-labels.ts`
- `components/private/cierres/fila/FilaGestion.tsx`
- `components/private/cierres/fila/fila-gestion-vista.ts`
- `components/private/cierres/fila/fila-gestion-labels.ts`
- `app/(app)/cierres-admin/_components/cierre-labels.ts`
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx` (solo las tres constantes de design §5)
- `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga.ts`
- `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx`
- `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts` (P4)

Tests:
- `tests/components/moneda-del-pais-cierres-componentes.test.tsx` (nuevo)
- `tests/components/moneda-del-pais-pantallas.test.tsx`
- `tests/components/moneda-del-pais-tarifas.test.tsx` (P4)
- `tests/unit/utils/detalle-cierre-vista.test.ts` (solo llamadas)
- `tests/unit/utils/fila-gestion-vista.test.ts` (solo llamadas)
- `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts` (solo llamadas)

Grep del 2026-11-23. Si el typecheck o un test señalan otro llamador de las funciones de design §4.2 o
de `libroGestiones`, se añade aquí antes del PR (design §10) **y se avisa al leader**.

## Tamaño

| | Archivos | Líneas (añadidas + borradas) |
|---|---|---|
| Producción | 18 | unas 330 |
| Tests | 6 | unas 850 (unas 650 del archivo nuevo, unas 150 de llamadas, unas 50 de censos) |
| **Total** | **24** | |

Son el 60% de `gate.tamano_pr` (40 archivos), por debajo del umbral del 80% (32). Las líneas quedan
por debajo de sus dos topes (1 000 de producción y 3 000 de tests).

Si P1 se cierra con «impuesto (<nombre>)», se suman unos 9 tests de pantalla y 2 E2E (unos 35
archivos, el 87,5%) y la ficha habría que cortarla: los rótulos de impuesto (R6, R13 y T2.1) pasarían
a una ficha aparte, que depende de esta.
