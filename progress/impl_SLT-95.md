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

## Revisión 2382740f — cambios pedidos (B1-B3), 2026-11-09

**B1 — R2 completo.** Cinco tests nuevos en `tests/components/DetalleCierre.test.tsx`, con literales en la cabecera: aprobado («… · Solicitado 2026-11-07 18:42 · Aprobado 2026-11-07 19:10 por Carlos R.»), rechazado («… · Rechazado 2026-11-07 19:20»), vencido («8F2A11C4 · Del 2026-11-07 18:42 · venció sin solicitarse»), subtítulo de bodega («Bodega satélite · lo solicitó Sara Satélite · 2 mensajeros · C07B3E19 · Solicitado 2026-11-07 19:05») y bodega recibida («… · Recibido 2026-11-08 09:12 por Carlos R.»). `DetalleCierre.test.tsx`: 24/24 contra `slt95_s1`. Mutaciones (aplicadas con autocomprobación y revertidas):

| # | Mutación | Resultado |
|---|---|---|
| B1a | `fechasMensajero` sin la fecha de resolución | 2 rojos (aprobado, rechazado) |
| B1b | `fechasMensajero` sin quién resolvió | 1 rojo (aprobado) |
| B1c | `fechasBodega` sin «Recibido …» | 1 rojo (bodega recibida) |
| B1d | `fechasBodega` sin «por …» | 1 rojo (bodega recibida) |
| B1e | subtítulo de bodega sin quién ni cuántos | 1 rojo (subtítulo de bodega) |
| B1f | sin la rama de vencido | 1 rojo (vencido) |

No apareció ningún fallo de lógica; no se tocó código de la app.

**B2 — T4.1.** El gate local del leader salió verde: `INIT_EXIT=0`, base `slt95_s1`, tras `8f0a4d87`. T4.1 marcada en `tasks.md`. Los bloqueos de arriba (slug de `feature_list.json` y tamaño del PR) quedaron resueltos por el leader y Carlos (`15b532d3`).

**B3 — E2E en local.** Base desechable NUEVA `slt95_e2e` (mismo Postgres local, `DROP/CREATE`, `prisma migrate deploy` «All migrations have been successfully applied», `pnpm run db:seed` «Seed de catalogos completado»). `next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3044` y secretos efímeros, como `gate.yml` (BUILD_EXIT=0). Sin otro servidor en 3000/3044/54329. `E2E_PUERTO=3044 pnpm exec playwright test --project=dinero --reporter=list`: el grupo contiene los tres specs pedidos (`ajuste-pago-mensajero-cierre` 2 ok, `cierre-bodega-satelite` 3 ok, `cierres-admin` 3 ok).

- Corrida 1: `84 passed (4.1m)`, E2E_EXIT=0.
- Corrida 2 (misma base, seguida): `84 passed (4.0m)`, E2E_EXIT=0.
- 0 failed, 0 skipped, 0 flaky en las dos. Nada que atribuir a S1 ni a inestables conocidos.

## Un nombre por cifra en «Dinero» (decisión de Carlos, 5eec5117), 2026-11-09

- La leyenda del reparto usa la constante de la cifra o de la cuenta (sin rótulos propios): mensajero «Se le paga hoy a la tienda» (`SE_LE_PAGA_HOY_LABEL`) y «Sale de lo recaudado» (`SALE_DE_LO_RECAUDADO_LABEL`); bodega «Debe llegar a la central» (`DEBE_LLEGAR_A_LA_CENTRAL_LABEL`), «Pago a mensajeros» (`PAGO_A_MENSAJEROS_LABEL`) y «Gana la bodega satélite» (`GANA_BODEGA_SATELITE_LABEL`). Se borraron `A_LA_TIENDA_HOY`, `SE_LO_COBRA_LA_EMPRESA`, `A_LA_CENTRAL`, `A_LOS_MENSAJEROS` y `A_LA_BODEGA_SATELITE`.
- **Consecuencia necesaria para R9 en bodega:** la cuenta «Lo que va a la central» (`lineasCascadaCentral`) llamaba a `paraLaCentral` «Para la central» y a `totalPagoMensajero` «Pago al mensajero». En el detalle único esas dos líneas se renombran a «Debe llegar a la central» y «Pago a mensajeros» (mapa `ROTULO_UNICO_CENTRAL` en `detalle-cierre-vista.ts`); `lineasCascadaCentral` no cambia y el detalle viejo de bodega sigue igual hasta S6. Sin esto, el test nuevo de R9 queda en rojo.
- Test nuevo `DetalleCierreDinero.test.tsx` «R9 — dentro de «Dinero», una cifra tiene un solo nombre»: lee del panel cada importe con todos sus rótulos (reparto + cuentas) y exige uno solo, con literales (mensajero ₡94.350 y ₡5.650; bodega ₡96.500, ₡3.000 y ₡500).
- Mutaciones (revertidas): R9a reparto de bodega vuelve a «A la central» → 2 rojos; R9b la cuenta central vuelve a «Para la central» → 2 rojos; R9c el reparto del mensajero vuelve a «Se lo cobra la empresa» → 2 rojos.
- Verificación contra `slt95_s1`: tests de S1 + identidades + cascadas 132/132; typecheck exit 0 (`NODE_OPTIONS=--max-old-space-size=8192`); eslint de lo tocado exit 0; `pnpm run test:rapido` completo RAPIDO_EXIT=0 (100+100+100+57 archivos en verde; 245 rojos heredados del baseline, fuera de la selección).
