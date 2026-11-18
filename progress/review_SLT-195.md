# review SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)»

> reviewer, 2026-11-18. Ruta completa. PR #219, HEAD revisado `d4c9964c` (== head del PR en GitHub).
> Diff `origin/dev...HEAD`: 19 archivos, 0 de producción. Grafo no consultado (worktree no indexado);
> exploración con Grep/Read.

## Checklist

- [x] Ruta completa: requirements (EARS R1190-R1210), design (`## Lo que ya existe`, 6 alternativas
      descartadas), tasks 26/26 `[x]`. El diff no re-crea nada de lo listado (reusa `asentarCierreDia`).
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 13/40 archivos, 0/1000 producción, 330/3000 tests.
- [x] R1209: `git diff --name-only origin/dev...HEAD -- lib app components hooks db scripts package.json` vacío.
- [x] Typecheck: `tsc --noEmit -p .` → 0 errores. Lint de los archivos cambiados: 0 errores.
- [x] Tests (re-medido por mí en `servi_slt195_desechable`, `--reporter=json`): 22 archivos, 155 casos,
      154 pasan, 1 falla, 0 saltados. El que falla es «la ganancia cuadra» de
      `analitica-anulacion-rechazo-458` (espera 1130.00, mide 1000.00), que se queda en el baseline por R1203.
- [x] Baseline: salen exactamente 21 entradas (20 de la ficha + `marca-conciliacion.int`), queda
      `analitica-anulacion-rechazo-458` con su causa medida (SL-39 R11) y la pregunta en la bitácora. Línea
      de poda en `_lee_esto`. R1208 cumple: la única entrada que cita SLT-195 es la de R1203.
- [x] R1210: D64 cerrada en `progress/deudas.md` con referencia a la ficha y a lo medido.
- [x] Literales de dinero: cada cambio lleva al lado su cálculo y su regla (R1202). Comprobados a mano:
  - 454/455 `dinero-aprobacion`: `pago_efectivo|1500.00` → `pago_satelite|1500.00` (D3, SLT-139 R317/R336;
    P = 1 × 1500 ≤ E = 6000, mismo importe, cambia la categoría). Las otras 17 filas sin tocar (R1195).
  - `caja-caracterizacion-459`: fuera `cierre_dia|pago|pago_efectivo|2000.00` (D4, SLT-123 R313);
    pagado 1000 + 664 + 5000 = 6664.00; cuenta por pagar 10500 − 6664 = 3836.00 (dos sitios).
    `egreso_pago_mensajero|4500.00` y las cifras de caja/tienda sin cambio (R1200, R1201).
  - `marca-conciliacion.int` (alcance ampliado por el leader, SLT-182): 500→485 consolidado y 485→500 en
    la 1.ª marca del ciclo, para que la diferencia sea 0 (SLT-73 R13/R14, D11). Ningún literal se sustituyó
    por su propia fuente.
- [x] Grupo A (477, cierre-rechazado, deshacer, multi-dia-271): conteo = 0 justo tras aprobar (R1190) y
      asiento con `asentarCierreDia` antes de leer. multi-dia-271 añade control `dineroC2 > 0`.
- [x] Grupo C: R1196 (coordenadas + ruta de hoy → 1 job) y R1197 (ruta de hace 3 días → 0 jobs) son
      casos distintos y discriminan (M4/M5 de la bitácora).
- [x] Trazabilidad R1190..R1210 → test: mapa en `progress/impl_SLT-195.md`, todos con aserción real.
- [ ] **Controles positivos sin vacuidad: falla uno** (B1 abajo).
- [x] Reglas del proyecto (`docs/perfil-agentes.md > reviewer`): sin tablas, migraciones, dependencias ni
      Ordenex. E2E: el diff no toca `db/`, pantallas ni código de dinero (solo pruebas); no lo exijo.
- [ ] CI `gate-completo`: a la hora de la revisión, shards 2/3, 3/3 y `e2e (dinero)` seguían pendientes.
      El leader lo comprueba antes del aviso.

## Los dos arreglos fuera de D1-D6

- **`reglasPais: reglasPaisFijas()` en `analitica-anulacion-rechazo-458`: correcto.** Es inyección de
  dependencia de la acción, el mismo patrón que el servicio del mismo archivo (línea 109) y que 300+ usos
  en `tests/`. En producción la empresa sale de la sesión; el `EmpresaNoResuelta` es propio de la tx de
  prueba. No oculta nada: sin él la acción ni responde. (El archivo sigue en el baseline, así que el CI no
  lo verifica; queda para quien resuelva R1203.)
- **Quitar `categoriasConModeloNuevo` en `libro-caja-filtro-a-quien`: correcto, no oculta un contrato.**
  `WalletService.ts:449-458` arma `composicion = { ...derivarComposicionGanancia(filas), categoriasConModeloNuevo }`:
  la clave es el rótulo D39 (no dinero) y no sale de `filas`, así que R54/R59 («las tarjetas suman las
  filas») nunca pudo incluirla. El rótulo lo cubren `deudas-d39-d40-modelo-nuevo.test.ts` y los unit de
  D39. M9 (`filas.slice(1)` en la composición) la pone roja: la comparación del dinero sigue mordiendo.
  Ver m3.

## Hallazgos

### B1 — BLOQUEANTE: `libro-caja-a-quien` R57 dejó de distinguir «quien aprobó» del maestro

El escenario 459 ahora aprueba el cierre con el `maestro` (R1198), que es también quien lee el libro y
quien registra el resto de movimientos. La aserción de `libro-caja-a-quien.test.ts:151`
(`automatico.por === nombres.adminSat`) lee el esperado de `cierre_dia.resuelto_por`, que ahora ES el
maestro (`nombres.adminSat === nombres.maestro`). Antes aprobaba el `adminSatelite`, distinto del lector, y
la aserción cazaba un «por» equivocado. Ahora no.

**Medido** (base desechable, `lib/` restaurado y `git diff --name-only -- lib` vacío después):
mutación en `lib/services/LibroCajaAutoriaService.ts:135`, `por: cierres.get(o)?.aprobo` →
`por: [...nombres.values()].find((n) => n?.startsWith("Maestro"))` (el aprobador sale de otra persona del
libro, no del cierre) → `libro-caja-a-quien` **7/7 en verde**. Con el aprobador `adminSat` de antes, esa
mutación caía en R57.

El design lo previó («el nombre de quien aprobó en `libro-caja-a-quien:151` pasa de `adminSat` a
`maestro`») pero no se trató, y el control de este archivo es solo M8 (rompe el escenario entero), que no
dice si sus aserciones muerden.

**Qué falta:** que el aprobador del cierre del día sea una persona con acceso total **distinta** del
`maestro` que registra y lee (p. ej. un segundo usuario de acceso total creado en el escenario solo para
aprobar), o que la lectura de autoría la haga otro actor y ningún otro movimiento lo registre el aprobador.
Renombrar `nombres.adminSat` a algo como `aprobador`, y añadir a la tabla de R1205 una mutación dirigida a
este archivo (p. ej. la de arriba) que lo ponga rojo.

### Menores

- **m1 — R1205 de los 13 archivos del escenario es de montaje.** M8 (`imputablesDe` → `[]`) solo prueba
  que el escenario corre; el design proponía mutaciones dirigidas por archivo (lector, signo, fecha,
  `anularPago`). B1 es justo lo que eso deja pasar. Probé además una dirigida: saltar el `ajuste_devengo`
  del mensajero en `LiquidacionService` (línea 1320) → `liquidacion-fechas-cr-461` cae («expected 2 to be
  greater than or equal to 3»); `wallet-anulacion-458` sigue 10/10, pero eso es alcance propio del
  archivo (lo cubre `caja-caracterizacion-459`), no un efecto de este diff. Recomendado: una dirigida
  para los archivos cuya semántica tocó el cambio de actor/zona (`libro-caja-a-quien`,
  `wallet-comprobante-alcance`, `liquidacion-fechas-cr-461`).
- **m2 — `marca-conciliacion.int`, caso del ciclo (D6):** antes 485 → revertir → 500 distinguía la 2.ª
  marca de la 1.ª; ahora las dos son 500. Sigue discriminando (revertir deja `monto_recibido` en NULL,
  R12 lo afirma, y el final exige 500), así que no es vacío. Aceptable.
- **m3 — `libro-caja-filtro-a-quien`:** al borrar la clave, la prueba ya no nota si la composición deja
  de traer el rótulo. Sugerencia: `expect(Array.isArray(l.composicion.categoriasConModeloNuevo))` antes de
  borrarla. No bloquea.
- **m4 — `progress/features/SLT-195.md > Decisiones` vacía:** la aprobación de PA1 (a) y PA2 (a) no
  consta ahí. Es del leader.
- **m5 — fixture 459:** la zona satélite se queda sin tarifa del mensajero; nadie la lee hoy (14 verdes).
  Solo lo anoto por si una prueba futura cuenta con ella.

## Veredicto

**RECHAZADO** — un bloqueante (B1): `libro-caja-a-quien` R57 quedó sin poder de discriminación por el
cambio de aprobador del escenario, medido con una mutación que sobrevive. El resto (trazabilidad,
literales de dinero, poda del baseline, R1203, R1209, D64, typecheck, lint) está bien.
