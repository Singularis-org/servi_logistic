# impl SLT-114 «Estado de cuenta de la satélite: conciliación en pestaña» — frontend_dev

Ruta ligera. Spec: `specs/SLT-114-estado-cuenta-conciliacion-pestana/requirements.md` (aprobado por Carlos
2026-11-12 con PA1, PA2 y PA3, ya reflejadas en R231, R235 y R239 antes de codificar).

## Archivos

Creados:
- `tests/unit/utils/cierre-enlace.test.ts`
- `tests/components/CierresBodegaAdminDeepLink.test.tsx`

Modificados:
- `lib/utils/cierre-enlace.ts` — `PARAM_CIERRE_BODEGA`, `hrefDetalleCierreBodega` (T1).
- `app/(app)/cierres-admin/_components/cierre-enlace.ts` — reexporta los dos (T1).
- `app/(app)/cierres-admin/_components/CierresTabs.tsx` — arranca en «Bodega» con `?cierreBodega=` (T2).
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx` — lo mínimo: `AbrirCierreBodegaDeLaUrl`
  (gemelo local de `AbrirCierreDeLaUrl`, que no se exporta y vive en `CierresAdminModule`, que no se toca)
  y limpiar el parámetro al cerrar (T2).
- `components/shared/estado-cuenta/EstadoCuenta.tsx` — prop opcional `pestanaPrevia`; sin ella el DOM es el
  de antes (el libro va en un fragmento) (T3).
- `app/(app)/wallet/satelites/_components/EstadoCuentaSatelite.tsx` — la conciliación como `pestanaPrevia`
  con el conteo «<n> sin conciliar» (T4).
- `app/(app)/wallet/satelites/_components/ConciliacionSatelite.tsx` — sin tarjeta «Pendiente de llegar»
  (PA1), columnas «Debe llegar» / «Falta» (PA2), fila desplegada con dos `Cuenta` y el enlace (R235-R237,
  PA3 con `metodosVisibles`), `useTotalSinConciliar` (misma clave SWR); deja de importar `CascadaDinero` (T5).
- `app/(app)/wallet/satelites/_components/satelites-labels.ts` — textos de pestañas, enlace y columnas.
- `components/private/cierres/detalle/detalle-cierre-vista.ts` — `cuentaConciliacion` acepta el subconjunto
  `paraLaCentral | montoRecibido | faltaPorRecibir` (sin duplicar líneas).
- `tests/components/EstadoCuenta.test.tsx`, `tests/components/EstadoCuentaSatelite.test.tsx`,
  `tests/components/ConciliacionSateliteCascada.test.tsx` (reescrito con literales a mano y canario).
- `e2e/cierre-bodega-satelite.spec.ts` — caso «1b» (T6: verificación en navegador).
- Adaptados a la pestaña y a la `Cuenta`: `tests/components/EstadoCuenta468.test.tsx`,
  `tests/components/EstadoCuentaBarra467.test.tsx`, `tests/components/DeudasD39D40ModeloEnPantalla.test.tsx`,
  `tests/integration/wallet-satelites.test.tsx`.
- `specs/SLT-114-estado-cuenta-conciliacion-pestana/requirements.md` — PA1-PA3 y casillas.

Ninguna dependencia nueva. Ningún servicio, acción, consulta ni esquema tocado.

## Mapa R → test

| R | Test |
|---|---|
| R230 | `tests/components/EstadoCuentaSatelite.test.tsx` › «R230 — pestañas Conciliación y Movimientos, abre en Conciliación»; E2E «1b» |
| R231 | `tests/components/EstadoCuentaSatelite.test.tsx` › «R231 — cada pestaña muestra lo suyo y las tarjetas siguen» |
| R232 | `tests/components/EstadoCuentaSatelite.test.tsx` › «R232 — volver a una pestaña conserva filtro y página» (mutación: sin `keepMounted` sale rojo) y «R30: marcar recibido relee el estado de cuenta de ESTA bodega» |
| R233 | `tests/components/EstadoCuentaSatelite.test.tsx` › «R233 — la pestaña dice "2 sin conciliar" con total 2 y solo "Conciliación" con 0» y «R233 — si la lectura falla…»; E2E «1b» («Conciliación 1 sin conciliar») |
| R234 | `tests/components/EstadoCuenta.test.tsx` › «R234 — sin pestaña de conciliación no hay tablist» (tienda, `/mi-wallet` y control con la prop) |
| R235 | `tests/components/ConciliacionSateliteCascada.test.tsx` › «R235 — "Lo que va a la central" con literales del doble», «R235 — los métodos en cero no se pintan (PA3)», «R235 — con modelo nuevo…» |
| R236 | `tests/components/ConciliacionSateliteCascada.test.tsx` › «R236 — "Conciliación": "—" sin marca y la falta del servidor tal cual (canario)» y «con marca…» |
| R237 | `tests/components/ConciliacionSateliteCascada.test.tsx` › «R237 — enlace "Ver el cierre de bodega completo" con su href» + `tests/unit/utils/cierre-enlace.test.ts` |
| R238 | `tests/components/CierresBodegaAdminDeepLink.test.tsx` (5 casos: abre en «Bodega» con el detalle, sin parámetro como hoy, cierra y limpia con `replace`, desde la cola no toca la URL, `no_encontrada` avisa); E2E «1b» |
| R239 | `tests/components/EstadoCuentaSatelite.test.tsx` › «R239 — sin "Pendiente de llegar" y columnas "Debe llegar" y "Falta"», «sin permiso de conciliar, ningún botón de marcar», R30; `ConciliacionSateliteCascada` › «el diálogo de marcar precarga lo ESPERADO» |

## Verificación (salida real)

Base desechable `slt114_conciliacion` (DROP/CREATE en el Postgres local del `.env` + `prisma migrate deploy`,
`DEPLOY_EXIT=0`); `DATABASE_URL` exportada a ella antes de cada vitest; la URL nunca se imprimió.

- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`): `TC_EXIT=0`.
- `pnpm exec eslint` sobre todos los archivos tocados: `LINT=0`.
- Tests de la feature: `EstadoCuentaSatelite` 17/17, `EstadoCuenta` 24/24, `ConciliacionSateliteCascada`
  10/10, `CierresBodegaAdminDeepLink` 5/5, `cierre-enlace` 3/3.
- Todos los tests que importan un módulo tocado (48 archivos, por Grep): 757 casos; el único rojo
  (`DeudasD39D40ModeloEnPantalla`, leía `-₡2.300,50` de la `CascadaDinero`) se adaptó a la `Cuenta` y queda
  27/27. También se adaptaron a la pestaña `EstadoCuenta468` (10/10; su doble de `ConciliacionSatelite`
  exporta `useTotalSinConciliar`), `EstadoCuentaBarra467` y `tests/integration/wallet-satelites.test.tsx`
  (PA1: sin «Pendiente de llegar»), los tres verdes.
- `vitest related` de los fuentes: 9 archivos rojos, todos `tests/integration/db/**` que necesitan filas de
  `usuario`/`orden` en la base; los 9 están en `tests/baseline-rojos.json`. Ninguno toca código de esta ficha.
- `pnpm run test:guardias`: 343/344 archivos verdes; el rojo es
  `dependencias-declaradas-presentes.guardia.test.ts` (lee `init.sh`), en el baseline y ajeno.
- Mutación de control: sin `keepMounted` en la pestaña de conciliación, «R232 — volver a una pestaña conserva
  filtro y página» sale rojo (`MUT_EXIT=1`); restaurado.
- E2E (candado tomado y liberado, puerto 3000, `next build` + `next start`, base desechable sembrada con
  `db:seed`): `e2e/cierre-bodega-satelite.spec.ts` 5/5 con el caso nuevo «1b» (abre en «Conciliación 1 sin
  conciliar», sin «Pendiente de llegar», las dos cuentas con sus literales, el enlace abre el detalle en
  `/cierres-admin` en la mitad «Bodega» y al cerrar se limpia `cierreBodega`); `e2e/cierres-rediseno.spec.ts` +
  `e2e/cierres-admin.spec.ts` 15/15. Primer intento en `next dev` cayó por compilación en frío (30 s) y el
  segundo por mirar el conmutador con el modal abierto (fuera del árbol accesible): corregido en el spec.
- `./init.sh`: `INIT_EXIT=1` SOLO por el tamaño del PR: 1132/1000 líneas (19/40 archivos). Pesan los tests
  (≈640 líneas). No se anotó `tamano-pr-aceptado`: lo decide el humano.

## Veredicto

T1-T5 hechas y probadas; T6 con E2E y navegador verdes, pendiente solo de que el humano acepte el tamaño del PR
(1132/1000) para que el gate quede verde.

## Gate del leader (2026-11-12)
- `./init.sh` con la base slt114_conciliacion: único rojo nuevo `dominio-ordenex-fuera` por timeout de 20 s con 3 agentes en paralelo; corrido solo, 9/9 en 2 s. Flaky por carga conocido (también en SLT-106 hoy).

## Arreglos review 1 (2026-11-12)

Archivos:
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx` — `abrirDetalle` devuelve si abrió;
  `abrirDetalleDeLaUrl` limpia `?cierreBodega=` también cuando la lectura falla (menor 5).
- `tests/components/EstadoCuentaSatelite.test.tsx` — R239 aviso con dos incompletas (bloqueante 1);
  cabeceras con `toEqual` literal en orden (menor 2); R232 del libro: término, casillas y página (menor 3).
- `tests/components/CierresBodegaAdminDeepLink.test.tsx` — `no_encontrada` y `forbidden` limpian el parámetro.
- `specs/SLT-114-estado-cuenta-conciliacion-pestana/requirements.md` — trazabilidad R232/R238/R239 y T6 `[x]`.

Mapa añadido:
- R239 → «R239 — con dos incompletas, el aviso dice el `saldoActual` del estado de cuenta»: literal a mano
  «Entre todas falta por llegar ₡48.250,75…» (saldoActual `48250.75`; faltas `20000.00` y `12000.00`,
  suma `32000.00`: tres importes distintos). Cabeceras: `["Desglose", "Consolidada", "Debe llegar",
  "Recibido", "Falta", "Estado", "Conciliado por", ""]`.
- R232 → «R232 — volver a "Movimientos" conserva término, casillas y página del libro» (`etiquetas`,
  «Tipo de movimiento» marcada, «21-40 de 45», sin lectura nueva al ir y volver).
- R238 → «si la lectura responde `no_encontrada`/`forbidden`, quita `cierreBodega` con replace…».

Mutaciones (revertidas, `git diff` del archivo vacío tras restaurar):
- Aviso con `money("0")` → cae («…falta por llegar ₡0.»).
- Aviso con `money(incompletas[0].faltaPorRecibir)` → cae («…₡20.000.»).
- Quitar la limpieza en el fallo → caen los 2 casos nuevos de R238.

Comandos (DATABASE_URL → slt114_conciliacion):
- `pnpm run typecheck`: `TC_EXIT=0`.
- `eslint` de los 3 `.ts/.tsx` tocados: `LINT_EXIT=0`.
- vitest `EstadoCuentaSatelite`, `CierresBodegaAdminDeepLink`, `CierresBodegaAdminCola`,
  `CierresBodegaAdminDetalleUnico`, `CierresBodegaAdminRefresco`, `CierresAdminDeepLink`,
  `ConciliacionSateliteCascada`, `integration/wallet-satelites`: 8 archivos, 111/111.

Veredicto: bloqueante y menores 1, 2, 3 y 5 resueltos; el bloqueante y el menor 5 con test que cae ante su mutación; menor 4 sin tocar (cubierto en `ConciliacionSateliteCascada`).
