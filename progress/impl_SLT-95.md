# impl SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)» — S1 «Detalle de cierre único: componente base»

frontend_dev · 2026-11-09 · rama `feature/SLT-95-detalle-cierre-rediseno` · tareas T0.1–T3.2 (T4.1 abierta, ver «Bloqueos»).

## Archivos

Creados:
- `components/private/cierres/detalle/detalle-cierre-vista.ts` — puro: `cifrasDe`, `metodosVisibles`, `avisosDe`, `pestanasDe`, `accionesDe`, `pieTextoDe`, `lineasDinero`, y los adaptadores `vistaMensajeroDesdeAdmin` / `vistaBodegaDesdeAdmin` (solo cuentan; los importes son el string del servidor).
- `components/private/cierres/detalle/detalle-cierre-labels.ts` — textos en «tú»; reusa `PAGO_MENSAJERO_LABEL`, `GANA_BODEGA_SATELITE_LABEL`, `FLETE_*_LABEL`, `rotuloIngresoBodega`, `METODO_LABEL`, `IMPUESTO_ROTULO`, `EMPRESA.enFrase`.
- `components/private/cierres/detalle/DetalleCierre.tsx` — marco modal (`components/ui/dialog`, 75 %) o región; cabecera, franja, cifras, `Tabs` de `components/ui/tabs`, un solo `tabpanel` con `overflow-auto`, pie fijo.
- `components/private/cierres/detalle/CifrasCierre.tsx`, `DineroCierre.tsx`, `Cuenta.tsx` (cascada D16 con `data-signo`/`data-tipo`).
- `app/(app)/cierres-admin/_components/cascadas-bodega.ts` — `lineasCascadaCentral`/`lineasCascadaDueno` movidas byte a byte (`diff` contra `HEAD` = idénticas; solo se añadió `export`).
- Tests: `tests/unit/utils/detalle-cierre-vista.test.ts`, `tests/components/DetalleCierre.test.tsx`, `tests/components/DetalleCierreDinero.test.tsx`.

Modificados: `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx` (importa las cascadas), `tests/components/DineroIdentidadesEnPantalla.test.tsx` (bloque B7), `tests/unit/guards/liquidacion-money-safe.test.ts` (censo + auto-captura de `components/private/cierres/` + contraprueba), `specs/.../tasks.md` ([x]).

## T0 — comprobaciones

- **T0.1:** la guardia `superficie-de-uso` (R-B) SÍ marca un componente sin montar. Medido: quitando la anotación de `Cuenta.tsx` → «ningún componente es inalcanzable… sin su anotación `@sin-superficie`» en rojo. Se usó el mecanismo que la propia guardia documenta: `/** @sin-superficie S1 de SLT-95 es el componente base sin montar; lo monta S2 (SLT-100) en /cierres-admin */` en un export de cada uno de los 6 módulos. **No se montó nada.** La anotación caduca sola: cuando S2 monte `DetalleCierre`, la guardia exige quitarla de los 6. Lo decide el leader/humano si prefiere otra salida. La guardia de dependencias no cambia (no hay dependencias nuevas).
- **T0.2:** todos los campos existen. `ICierresAdminService.ts`: `reprogramadasRetenidasHoy` :115, `totalesIngreso` :371, `ivaFacturado` :380, `pagoTienda` :386, `cobradoSobreRecaudado` :398, `netoEmpresa` :408, `ganaLaTienda` :423, `partesPorTienda` :478, `rechazosDeTienda` :505. `ICierresBodegaAdminService.ts`: `totalesIngreso` :78, `ivaFacturado` :81, `pagoTienda` :87, `cobradoSobreRecaudado` :92, `netoEmpresa` :98, `ganaLaTienda` :117, `partesPorTienda` :156, `paraLaCentral` :162, `efectivoCubreDescuentos` :164.

## Mapa R → test (S1)

| R | Test |
|---|---|
| R1 | `DetalleCierre.test.tsx` «el mismo `DetalleCierre` pinta las nueve combinaciones de R12» |
| R2 | `DetalleCierre.test.tsx` «el estado de cada modo…», «cabecera: destino, folio y fecha de solicitud» |
| R3 | `DetalleCierre.test.tsx` «con 2 reprogramadas retenidas la cabecera lo dice; con 0, nada» |
| R4 | `detalle-cierre-vista.test.ts` `avisosDe` (7 casos); `DetalleCierre.test.tsx` «pinta los conteos del doble…», «sin asuntos no se pinta» |
| R5 | `DetalleCierre.test.tsx` «…queda fuera del panel con scroll» |
| R6 | `detalle-cierre-vista.test.ts` `cifrasDe` (+ contraprueba `netoEmpresa`); `DetalleCierreDinero.test.tsx` cuatro cifras, bodega, negativo «-₡250» |
| R7 | `detalle-cierre-vista.test.ts` `metodosVisibles`; `DetalleCierreDinero.test.tsx` «la transferencia en cero no aparece» |
| R8 | `detalle-cierre-vista.test.ts` «las líneas de contexto…»; `DetalleCierreDinero.test.tsx` «2 tiendas · ganan en total ₡92.090» |
| R9 | `DetalleCierreDinero.test.tsx` «audiencia mensajero: tres cifras y ni un importe ni un rótulo…», «ningún «Debe» ni «Ganancia»…» |
| R10 | `detalle-cierre-vista.test.ts` `pestanasDe` (4 casos); `DetalleCierre.test.tsx` tablist y «Pago al mensajero» |
| R11 | `DetalleCierre.test.tsx` «solo el panel desplaza» (un único `.overflow-auto` = el `tabpanel`) |
| R12 | `detalle-cierre-vista.test.ts` `accionesDe` (tabla + sin permiso); `DetalleCierre.test.tsx` bloque R12 (7 casos, callbacks) |
| R13 | `DetalleCierre.test.tsx` bloque R13 (modal mensajero, modal bodega, página sin X) |
| R14, R15 | `DetalleCierreDinero.test.tsx` bloque «Dinero» (reparto, cuentas con «−»/«+», subtotal punteado, total en negrita, por tienda); `DineroIdentidadesEnPantalla.test.tsx` B7 |
| R16 | `DetalleCierreDinero.test.tsx` bloque bodega; `DineroIdentidadesEnPantalla.test.tsx` B7 «bodega: recaudado − mensajeros − bodega = debe llegar a la central» |
| R20 | `DetalleCierre.test.tsx` «tablist con sus tabs…» (roles `tab`/`tabpanel`); cifras como `group` con nombre en `DetalleCierreDinero.test.tsx` |
| R71 | `liquidacion-money-safe.test.ts` (censo + auto-captura + contraprueba sobre `Cuenta.tsx`) |
| R72 | revisión del diff: nada en `lib/`, `db/` ni migraciones (`git diff --name-only | grep -E "^(lib|db)/"` vacío) |

## Mutaciones (todas aplicadas con autocomprobación y revertidas; `grep` final limpio)

| # | Mutación | Resultado |
|---|---|---|
| M1 | `cifrasDe`: `netoEmpresa` → `ganaLaTienda` | 4 rojos (vista + DOM) |
| M2 | `metodosVisibles` sin filtro de cero | 3 rojos |
| M3 | `Cuenta`: sin «−» en las restas | 2 rojos |
| M4 | `tabpanel` sin `overflow-auto` | 1 rojo (R11) |
| M5 | `accionesDe` ignora permisos | 2 rojos |
| M6 | retención fija en 2 | 1 rojo (R3) |
| M7 | `Number(l.monto)` en `Cuenta.tsx` | 2 rojos en la guardia money-safe |
| M8 | `data-signo` siempre «neutro» | 2 rojos en B7 |
| M9 | «Pago al mensajero» también a la satélite | 1 rojo |
| M10 | la audiencia mensajero recibe las 4 cifras | 1 rojo (R9) |
| M11 | franja con lista vacía | 2 rojos |
| T0.1 | sin `@sin-superficie` en `Cuenta.tsx` | 1 rojo en `superficie-de-uso` |

Negativos con valores que no aparecen por casualidad: R9 busca `₡94.350`, `₡5.650`, `₡7.910`, `₡92.090`… y rótulos; ningún test negativo contra fechas.

## Salida de los comandos

- Base desechable propia `slt95_s1` (mismo servidor local del `.env`, `DROP/CREATE` + `prisma migrate deploy` «All migrations have been successfully applied»), `DATABASE_URL` exportada antes de todo vitest.
- `pnpm run typecheck`: sin `NODE_OPTIONS` el `tsc` murió por memoria («JavaScript heap out of memory», exit 134); con `NODE_OPTIONS=--max-old-space-size=8192` → exit 0, sin errores.
- `pnpm exec eslint` sobre lo tocado: 0 errores, 1 aviso previo (`DineroIdentidadesEnPantalla.test.tsx:541`, directiva sin uso que ya estaba).
- Tests propios: `detalle-cierre-vista` 27/27, `DetalleCierre` 19/19, `DetalleCierreDinero` 11/11; `DineroIdentidadesEnPantalla` + `liquidacion-money-safe` + `CierreBodegaDetalleCascadas` 75/75 (sus aserciones sin tocar).
- `vitest related --run` de los archivos de código cambiados: 16 archivos, 274/274.
- `pnpm run test:guardias`: 340/342 archivos; los 2 rojos NO son de esta rebanada: `dependencias-declaradas-presentes` (4) busca en `init.sh` el marcador «>>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<» y `init.sh` tiene «>>> FIN PASO 2: DEPENDENCIAS <<<» (arnés, sin tocar). El otro (`censo-order-status-rename`, «entregada» como literal suelto en los labels) era mío y se corrigió; re-corrida verde.

## Bloqueos (para el leader)

1. **`./init.sh` no llega al gate:** corta en el paso del validador: «specs/SLT-95-detalle-cierre-rediseno/ no cuadra con …/feature_list.json: SLT-95 se llama "rediseno-detalle-cierre"». Es la copia local del board (del leader), no la toqué. Por eso T4.1 queda abierta.
2. **Tamaño del PR en rojo:** `node scripts/tamano-pr.mjs` → 13/40 archivos, **3122/1000 líneas** (la estimación del spec era ~950). Incluye ~340 líneas del movimiento de las cascadas (borrado + alta). Necesita la decisión humana (`tamano-pr-aceptado`) o partir S1 (p. ej. componente + vista en una, tests de identidad en otra).
3. `@sin-superficie` en los 6 módulos (T0.1): S2 debe quitarlas al montar.

## Decisiones tomadas (anotadas)

- R9 dice «una misma cifra no con dos rótulos dentro de una pestaña», pero R14/R16 piden a la vez el reparto («A la tienda hoy», «Se lo cobra la empresa», «A la central») y las cuentas («Sale de lo recaudado», «Para la central» de `lineasCascadaCentral`) en «Dinero». Se siguió R14/R16 tal cual; queda a revisión.
- Nombres del canvas para «Flete por entregado + IVA» y «Comisión COD + IVA»; la no entrega y la bodega, rotuladas según el modelo como hoy (R14).
- El reparto pinta barra solo si llegan los porcentajes del servidor (S13, R70); en S1 va solo la leyenda: calcularlos en el cliente rompería R71.
- «Rechazados por la tienda» siempre visible con su conteo (D11); «Pago al mensajero» exige estado `aprobado` y su cuerpo (permiso) presentes.
- La fecha de la cabecera usa `fechaCalendarioCR` + `horaCostaRica` («2026-11-07 18:42»).

MCP del grafo: el índice de este worktree no existe; se trabajó con Grep/Read.

**Veredicto:** S1 implementada y probada (57 tests nuevos + B7 y censo, 12 mutaciones muertas); el gate local no corre por `feature_list.json` y el tamaño del PR está en rojo (3122/1000): requiere decisión del leader/humano.
