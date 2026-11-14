# SLT-154 «Vista de la bodega satélite: solo lo suyo» — tasks (rebanada 1: los detalles)

> R460–R478 de `requirements.md`; diseño en `design.md`. Reparto: T1–T2 `backend_dev`, T3 y T5
> `frontend_dev`, T4 de quien rompió el test. Una tanda por agente.
>
> **Antes del primer gate:** copiar `.env` al worktree y exportar la base DESECHABLE antes de cualquier
> `vitest` (los tests de integración y `vitest related` tocan la base). Sin `.env` el gate sale verde
> saltando la integración: no vale. Verificar el `.env` solo con booleanos, sin imprimir valores.
>
> **Reglas de los tests:** literales escritos A MANO (el cálculo en un comentario junto al literal y en
> `progress/impl_SLT-154.md`), nunca copiados de la salida, nunca comparados contra la función que los
> genera. Si un literal sale rojo, se revisa el cálculo a mano, no se ajusta a la salida. En un test
> negativo, un texto que no pueda aparecer por casualidad (un rótulo o un importe que no esté en el
> corpus por otro lado; nunca un dígito suelto).

## T0 — Inventario (sin tocar producción)

- [ ] **T0.1** Listar los tests que hoy esperan, con un lector sin acceso total, cifras de la empresa o
  `ingresoEmpresa` en los dos detalles, o que llaman a `columnasDe` con dos argumentos:
  `grep -rln "adminSatelite\|\"satelite\"\|columnasDe(" tests/ e2e/` cruzado con `pagoTienda`,
  `netoEmpresa`, `ingresoEmpresa`, `leQueda`, `Le queda a la empresa`, `Cobro a la tienda`.
  **Hecho:** la lista, con la línea y el `R` que cambia cada expectativa, en
  `progress/impl_SLT-154.md > T0`. Si sale un archivo que no está en `## Archivos esperados`, se añade
  aquí; si con él la lista pasa de 32 archivos, PARA y avisa al leader.
- [ ] **T0.2** Comprobar que el corpus del E2E (`e2e/cierre-bodega-satelite.spec.ts`, cabecera) siga
  dando recaudado 9 000, pago 1 500, gana la bodega 500, debe llegar 7 000, facturado 3 750 y le queda
  1 750 en la base de la corrida.
  **Hecho:** los números medidos en `impl_SLT-154.md > T0`.

## T1 — Integración contra Postgres real, primero (depende de T0)

- [ ] **T1.1** Crear `tests/integration/db/satelite-detalle-sin-dinero-empresa-sql-real.test.ts` con el
  corpus de `design.md > Verificación` (zona C, S, M; BX con A, B y N), sembrado en
  `enTransaccionRevertida`. Sin base, `describe.skip` visible; con base y sin catálogos, falla ruidosa
  (patrón de `satelite-cierre-bodega-lectura.int.test.ts`). **Prohibido** `if (!dato) return;`: un caso
  sin datos falla.
- [ ] **T1.2** Casos, cada uno con su `R` en el nombre:
  - R460: `verCierreBodegaDetalle(BX, S)` → las ocho claves del agregado son `null` (`toBeNull()` una a
    una, no un `toMatchObject` parcial).
  - R461: cada `cierres[i]` de S → las ocho en `null`; `totales`, `totalPagoMensajero`,
    `totalIngresoBodegaRechazos`, `paraLaCentral` y `efectivoCubreDescuentos` iguales a los literales a
    mano (A: 3 000.00 / 700.00 / 100.00 / 2 200.00 / `true`).
  - R462: `verCierreDetalle(A, S)` → las diez claves de R462 en `null`.
  - R463: toda gestión de los dos detalles de S → `ingresoEmpresa === null` y `tarifaModelo` igual al
    congelado; `montoRecibido`, `pagos`, `pagoMensajero` e `ingresoBodegaRechazo` iguales a los de M.
  - R465: con M, los dos detalles traen las cifras de la empresa con valor (al menos `netoEmpresa`,
    `pagoTienda` y el `ingresoEmpresa.total` de una gestión, con literal a mano) y la gestión sin
    `tarifaModelo` aparte.
  - R466: `centralDebe` de BX = `"800.00"`, para S y para M.
  - R467: `verCierreDetalle(A, …)` → `paraLaCentral "2200.00"`, `efectivoCubreDescuentos true`,
    `porcentajesRepartoCentral` = el literal calculado a mano con la regla de `porcentajesReparto`.
- [ ] **T1.3** Correr el archivo **contra el código de hoy**.
  **Hecho:** rojos R460–R464, R466, R467 y verde R465 (la central ya es así), anotado en
  `impl_SLT-154.md > T1`. Commit solo de tests.

## T2 — Servidor (depende de T1.3)

- [ ] **T2.1** Tipos: `ICierresAdminService.ts`, `ICierresBodegaAdminService.ts`, `ICierreDiaService.ts`
  (`tarifaModelo?` en `CierreDetalleGestion`), `ICierresBodegaAdminRepository.ts`
  (`pagoIndependienteEfectivo`), según `design.md > Contratos`.
  **Hecho:** `pnpm run typecheck` solo con errores en los consumidores que tocan T2–T3.
- [ ] **T2.2** `ocultarDineroEmpresaSiNoCentral`, `anularEmpresa` y las tres clasificaciones
  exhaustivas (`satisfies Record<keyof …, "propio" | "empresa">`); aplicarlas al final de
  `verCierreDetalle` y `verCierreBodegaDetalle` (agregado y cada cierre del día). F5 no se toca.
- [ ] **T2.3** «La central debe»: `pagoIndependienteEfectivo` en `DETALLE_CIERRE_SELECT` y
  `toDetalleCierreRow`; `export` de `repartirEfectivo`; `centralDebe` en `verCierreBodegaDetalle`.
- [ ] **T2.4** `paraLaCentral`, `efectivoCubreDescuentos`, `porcentajesRepartoCentral` en
  `verCierreDetalle`.
- [ ] **T2.5** `hayGestionEnModeloNuevo` lee también `g.tarifaModelo`.
- [ ] **T2.6** `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts`: R464 (un actor con
  un rol sin acceso total distinto de `adminSatelite` recibe el recorte; `maestro` no) y la expectativa
  de la satélite de F481 en los detalles pasa a `ingresoEmpresa: null` (cita R463).
  **Hecho T2:** T1.2 entero verde; `pnpm exec vitest related --run` de los archivos tocados, verde.
- [ ] **T2.7** **Mutaciones** (una a una; aplicar, correr, anotar el test que se pone rojo, revertir,
  `git diff` limpio):
  - M1 quitar el recorte del agregado en `verCierreBodegaDetalle` → rojo R460 (integración).
  - M2 quitar el recorte en `verCierreDetalle` → rojo R462 (integración).
  - M3 volver a `ocultarFulfillmentSiNoCentral` en un detalle → rojo R463 (integración).
  - M4 criterio `actor.rol === "adminSatelite"` en lugar de `!esAccesoTotal` → rojo R464 (unidad).
  - M5 no filtrar los cierres nuevos en `centralDebe` → rojo R466 («5800.00» ≠ «800.00»).
  - M6 no sacar `tarifaModelo` aparte → rojo R463.
  - M7 recortar también para M (quitar el `esAccesoTotal ? r :`) → rojo R465.
  **Hecho:** las siete, con su test rojo, en `impl_SLT-154.md > T2.7`. Una mutación que no pone nada
  en rojo se trata como un test que falta: se añade el caso y se repite.

## T3 — Vista y cableado (depende de T2.1; [P] con T2.2–T2.6)

- [ ] **T3.1** `detalle-cierre-vista.ts`: tipos de la vista, `vistaMensajeroDesdeAdmin` /
  `vistaBodegaDesdeAdmin`, `cifrasDe`, `lineasDinero`, `cuentaCentral(nivel, rotuloPago)`,
  `pestanasDe` (`design.md > La vista`). Ningún `CifraId` nuevo.
- [ ] **T3.2** `fila-gestion-vista.ts`: `veDineroEmpresa`, `ColumnaId "ganaBodega"`, `columnasDe` con
  tercer parámetro obligatorio, `montoDeColumna`, `tarjetasDe`.
- [ ] **T3.3** `detalle-cierre-descarga-columnas.ts`: `columnasDescargaDetalle`, `ganaBodega` en la fila.
- [ ] **T3.4** Cableado: `GestionesCierre.tsx`, `FilaGestion.tsx`, `DetalleCierreBodegaAbierto.tsx`,
  `CierresAdminModule.tsx` (`DetalleAbierto` y `abrirDetalle`).
- [ ] **T3.5** Tests con literales a mano:
  - `tests/unit/utils/detalle-cierre-vista.test.ts`: R468–R473 y R478 para la satélite; R477 para la
    central. Fixture S4: general «9000.00» (efectivo), pago «1500.00», bodega «500.00», debe llegar
    «7000.00», `centralDebe` «0.00» → 4 tarjetas en orden [recaudado, pago, ganaBodega, paraCentral];
    con `centralDebe` «800.00» → 5.ª «La central debe» con `aviso: true`. Pestañas S4:
    `["Gestiones (2)", "Lo que va a la central", "Mensajeros (1)", "Conciliación"]`; S6:
    `["Gestiones (2)", "Lo que va a la central", "Rechazados por la tienda (0)"]`. R478: con
    `netoEmpresa: null` y audiencia central, `cuentas` sin «De lo facturado, le queda a la empresa».
  - `tests/unit/utils/fila-gestion-vista.test.ts`: R474, R475 (sin la central) y R477 (la central).
  - `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`: R476 y R477 (encabezados exactos,
    en orden).
  - `tests/components/DetalleCierre.test.tsx`: S4 y S6 de la satélite pintan «₡9.000», «₡1.500»,
    «₡500», «₡7.000»; no hay «Le queda a la empresa», «Lo que se le factura a la tienda» ni «Se le paga
    hoy a la tienda»; la pestaña seleccionada al abrir es «Gestiones (2)».
  - `tests/components/FilaGestion.test.tsx`: sin la central, cabecera con «Gana bodega» y sin «Cobro a
    la tienda»; al desplegar, sin «Se le cobra a la tienda» ni «Ver cómo se calculó»; con «₡500» en la
    gestión rechazada.
- [ ] **T3.6** **Mutaciones**: M8 `cifrasDe` de la satélite devuelve las de la central → rojo R468;
  M9 `columnasDe` ignora `quienMiraEsCentral` → rojo R474; M10 `tarjetasDe` siempre con cobro → rojo
  R475; M11 `lineasDinero` pinta `cuentaQueda` con `null` → rojo R478; M12 `pestanasDe` sin la rama
  satélite → rojo R470.
  **Hecho T3:** typecheck, lint y `vitest related` verdes; las cinco mutaciones en
  `impl_SLT-154.md > T3.6`.

## T4 — Tests existentes que cambian (depende de T2 y T3)

- [ ] **T4.1** Actualizar SOLO las expectativas que esta ficha cambia, de la lista de T0.1 (previstas:
  `satelite-cierre-bodega-lectura.int.test.ts`, `cierres-bodega-admin-service.test.ts`,
  `cierres-admin-service.test.ts`, `CierresAdminDetalleUnico.test.tsx`,
  `CierresBodegaAdminDetalleUnico.test.tsx`). Cada cambio con un comentario que cita su `R`. Nada de
  sustituir un literal por su fuente.
  **Hecho:** los archivos de T0.1 verdes; el diff de cada uno solo toca expectativas listadas en T0.1.

## T5 — E2E de la satélite (depende de T3 y T4)

- [ ] **T5.1** `e2e/cierre-bodega-satelite.spec.ts`, test nuevo «4 — la satélite ve solo lo suyo»
  (R468–R471, R474, R475), con los datos del archivo:
  - S4 («Ver» en «Solicitados»): tarjetas `[data-cifra]` recaudado «₡9.000», pago «₡1.500», ganaBodega
    «₡500», paraCentral «₡7.000»; sin `[data-cifra="leQueda"]`; pestaña abierta «Gestiones (2)»; en
    «Lo que va a la central» (pestaña acotada por rol `tab`, cuenta por rol `region`) «Total general»
    «₡9.000»; el diálogo no contiene «Le queda a la empresa», «Lo que se le factura a la tienda»,
    «₡3.750» ni «₡1.750»; la tabla tiene la columna «Gana bodega» y no «Cobro a la tienda»; la fila del
    rechazo muestra «₡500»; desplegada, sin «Se le cobra a la tienda» ni «Ver cómo se calculó».
  - S6 (el cierre del mensajero abierto por la satélite): recaudado «₡9.000», pago «₡1.500»,
    ganaBodega «₡500», paraCentral «₡7.000»; sin «Se le paga hoy a la tienda».
- [ ] **T5.2** Acotar por rol los localizadores «Lo que va a la central» de los pasos de la satélite
  (pestaña y cuenta se llaman igual). Los pasos de la central (2, 3) no cambian (R477).
  **Hecho T5:** `pnpm exec playwright test e2e/cierre-bodega-satelite.spec.ts` y
  `pnpm exec playwright test --project=dinero` verdes en local, con base desechable nueva y
  `NEXT_PUBLIC_APP_URL` como en `.github/workflows/gate.yml`; salida en `impl_SLT-154.md > T5`.

## T6 — Cierre

- [ ] **T6.1** `./init.sh` verde (con `INIT_EXIT=$?` escrito dentro del log).
- [ ] **T6.2** Mapa `R → test` de R460–R478 en `progress/impl_SLT-154.md` (el de
  `requirements.md > Trazabilidad`, con los nombres reales).
- [ ] **T6.3** Reuso (P10, RU1–RU6): `git diff --diff-filter=A --name-only origin/dev -- '*.tsx'` vacío;
  el diff de `detalle-cierre-vista.ts` no añade miembros a `CifraId`; ninguna prop nueva en
  `DineroCierre`, `Cuenta`, `CifrasCierre`, `DetalleCierre`, `GestionesCierre` ni `FilaGestion`.
  **Hecho:** la salida de los tres checks en `impl_SLT-154.md > T6`.
- [ ] **T6.4** `scripts/tamano-pr.mjs` (en `./init.sh`) por debajo del 80%.

## Tamaño

| Tipo | Archivos | Líneas estimadas |
|---|---|---|
| Producción | 16 | ~420 (servicios ~120, interfaces y repositorio ~65, vista ~140, fila y descarga ~55, cableado ~40) |
| Tests y E2E | 13 (1 nuevo de integración + 12 existentes; 5 de ellos dependen de T0.1) | ~1 450 |
| **Total** | **29** | por debajo del 80% de 40 (32) y de los topes de 1000 / 3000 líneas |

Si T0.1 añade archivos y el total pasa de 32, se para (ver T0.1). `specs/` y `progress/` no cuentan.

## Archivos esperados

Producción:

- `lib/services/CierresAdminService.ts`
- `lib/services/CierresBodegaAdminService.ts`
- `lib/services/CierreBodegaService.ts`
- `lib/repositories/CierresBodegaAdminRepository.ts`
- `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/interfaces/services/ICierresBodegaAdminService.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `app/(app)/cierres-admin/_components/cierre-labels.ts`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `components/private/cierres/detalle/detalle-cierre-descarga-columnas.ts`
- `components/private/cierres/detalle/DetalleCierreBodegaAbierto.tsx`
- `components/private/cierres/fila/fila-gestion-vista.ts`
- `components/private/cierres/fila/GestionesCierre.tsx`
- `components/private/cierres/fila/FilaGestion.tsx`

Tests:

- `tests/integration/db/satelite-detalle-sin-dinero-empresa-sql-real.test.ts`
- `tests/integration/db/satelite-cierre-bodega-lectura.int.test.ts`
- `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts`
- `tests/unit/services/cierres-bodega-admin-service.test.ts`
- `tests/unit/services/cierres-admin-service.test.ts`
- `tests/unit/utils/detalle-cierre-vista.test.ts`
- `tests/unit/utils/fila-gestion-vista.test.ts`
- `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`
- `tests/components/DetalleCierre.test.tsx`
- `tests/components/FilaGestion.test.tsx`
- `tests/components/CierresAdminDetalleUnico.test.tsx`
- `tests/components/CierresBodegaAdminDetalleUnico.test.tsx`
- `e2e/cierre-bodega-satelite.spec.ts`

Documentación (no cuenta para el tamaño):

- `specs/SLT-154-vista-satelite-solo-lo-suyo/requirements.md`
- `specs/SLT-154-vista-satelite-solo-lo-suyo/design.md`
- `specs/SLT-154-vista-satelite-solo-lo-suyo/tasks.md`
- `specs/SLT-154-vista-satelite-solo-lo-suyo/reuso.md`
- `progress/impl_SLT-154.md`
