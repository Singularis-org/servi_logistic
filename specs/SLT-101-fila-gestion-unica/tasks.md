# SLT-101 «Fila de gestión única y lista con filtros» — tasks

> 2026-11-09. Zona frontend: todo es de `frontend_dev` (si PA1 trae las cifras aquí, se añade una
> tanda de `backend_dev` y este archivo se amplía antes de tocar código).
>
> `[P]` = paralelizable con la task anterior.
>
> **Tamaño:** ~31 archivos y ~1 900 líneas estimadas (límite 40/1 000). Pendiente de PA3. Si el diff
> pasa de ~36 archivos, el implementer para y avisa.
>
> Antes del primer gate:
> - copiar `.env` al worktree (sin él, el gate sale verde saltándose la integración);
> - exportar una base desechable propia antes de cualquier `vitest` (memoria del proyecto).
>
> Candado: SLT-102 «Cola de cierres única: mensajeros (central y satélite)» también toca
> `CierresAdminModule.tsx`. Si está en vuelo de otra persona, `docs/equipo.md` decide.
>
> El índice del grafo de este worktree no existe: usar Grep/Read.

## T0 — Comprobaciones previas (sin código de producción)

- [ ] **T0.1** — Censo de lo que hoy lee la fila del detalle del admin, anotado en
  `progress/impl_SLT-101.md`:
  - `grep -l` en `tests/components/` por `<CierresAdminModule` junto con «Órdenes del cierre»,
    «Desglose de ingreso de la orden», «Corregir métodos de pago», «Ajustar pago al mensajero»,
    «Ver evidencia de la orden», «Corregir el resultado de la orden» y las regiones por resultado
    («Entregado», «Devolución a origen por rechazo»…);
  - `grep -l` en `e2e/` por las mismas regiones y nombres, descartando los que abren el detalle de
    bodega o `/cierre-dia` (no cambian);
  - si `factura-contraste.guardia` ancla líneas de `CierresAdminModule.tsx` que se mueven.

  **Hecho:** la lista coincide con `## Archivos esperados`. Si aparece uno más, se añade aquí y se
  avisa al leader.
- [ ] **T0.2** [P] — Leer y anotar con archivo:línea:
  - que `EstadoConInfo` con el código de cada resultado pinta el mismo nombre que `RESULTADO_LABEL`
    (fichas 455/456) y qué clase pide `estado-con-info.guardia` para las opciones del filtro;
  - los rótulos de `CAUSA_INCIDENTE_LABEL` (el literal «Dañado» de los tests);
  - que `cierreAbierto` trae `solicitadoAt` para `congeladoAt`;
  - que `SegmentedToggle` admite 7 opciones con conteo sin desbordar a 390 px (si no, se anota y se
    pregunta antes de cambiar nada);
  - qué constantes privadas de `cierre-factura.tsx` hacen falta (`FILA_CORREGIR_METODOS`,
    `FILA_CORREGIR_RESULTADO`, `FILA_VER_EVIDENCIA`, `conMarcaDeOrigen`…): se **exportan** sin
    cambiarlas, nunca se copian.

  **Hecho:** nota en `impl_SLT-101.md`. Si algo contradice el design, se para y se pregunta.
- [ ] **T0.3** [P] — Fijar los literales del E2E (`design.md > Verificación`) contra la siembra
  real de `e2e/_escenarios/cierres.ts`, `reparto.ts` y `_tarifas-activacion-fixture.ts`:
  - escenario A (viejo): las cifras de cada tarjeta y del cálculo de la entrega de 70 000 y de la
    devolución; si la gestión del escenario es GAM o no GAM; si hay fulfillment;
  - escenario B (nuevo): cobro, cálculo y pago de la entrega de 10 000;
  - el ajuste 1 500 → 2 200 de `ajuste-pago-mensajero-cierre`.

  **Hecho:** tabla entradas → literales con su derivación a mano en `impl_SLT-101.md`, escrita
  **antes** del test. Si un literal propuesto no cuadra, va el correcto con su derivación.

## T1 — Lógica pura · `frontend_dev`

- [ ] **T1.1** — `components/private/cierres/fila/fila-gestion-vista.ts` y
  `fila-gestion-labels.ts` (`design.md > fila-gestion-vista.ts`): `gestionesEnOrden`, `senalesDe`,
  `textoSenales`, `filtrosDe`, `filtrar`, `columnasDe`, `tarjetasDe`, `calculoDe`, `accionesDe`,
  `datosOrdenDe`.

  **Hecho:** `tests/unit/utils/fila-gestion-vista.test.ts` verde, con literales escritos a mano:
  - señales por audiencia y su orden (los seis casos de la tabla de dobles del design) (R24, R85);
  - 7 filtros con conteos, «Todas» primero, «Con señales» por audiencia, `filtrar` sin reordenar
    (R84);
  - columnas por audiencia y con/sin mensajero (R23);
  - tarjetas por audiencia (tabla de R25), «Sin dato» con fuente nula, métodos en 0 fuera, fulfillment
    solo central o solo lectura con central (R25, R27, R30);
  - cálculo viejo: GAM, no GAM, pacto, sin pacto, sin comisión, sin tarifa congelada; nuevo sin línea
    de tarifa (R28, R29);
  - acciones: la tabla de R26 × resultado × presencia del callback (R26);
  - datos de la orden de R87/R88 (mensajero sin indemnización ni ingreso de bodega).

  Mutaciones muertas anotadas: «Con señales» contando todas; fulfillment a la satélite; quitar
  `esMontoCero`.
- [ ] **T1.2** [P] — `detalle-cierre-descarga-columnas.ts`: columna «Señales» al final (R91).
  **Hecho:** `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts` afirma las 8 cabeceras
  como literal, «Vuelve a bodega» en una devolución y `null` sin señales.
  `columnas-sensibles.guardia` verde.

## T2 — Componentes · `frontend_dev` (depende de T1)

- [ ] **T2.1** — `Cuenta.tsx`: props aditivas `insignia`, `pie`, `vacio`. **Hecho:**
  `DineroIdentidadesEnPantalla.test.tsx` y los tests de S1 verdes sin tocarlos (el DOM sin las props
  es el de hoy).
- [ ] **T2.2** — `CalculoCobro.tsx` y `FilaGestion.tsx` (`design.md > FilaGestion`).
  **Hecho:** `tests/components/FilaGestion.test.tsx` verde, con los dobles y literales del design:
  - fila cerrada: celdas por audiencia, «—» en nulos, resultado con su botón de información (R86);
  - desplegar: orden/producto/dirección y los datos de R87/R88;
  - las cuatro tarjetas por audiencia (R25), su cascada y «Sin dato» (R27); fulfillment (R30);
  - «Ver cómo se calculó» abre y pliega (`aria-expanded`), viejo y nuevo (R28, R29);
  - acciones y sus callbacks con la gestión (R26); nombres accesibles de R89;
  - paridad con la fila vieja: pacto especial, sin pacto, sin comisión, sin tarifa congelada,
    origen Automático/Manual, varias evidencias.
- [ ] **T2.3** — `GestionesCierre.tsx`. **Hecho:** `tests/components/DetalleCierreGestiones.test.tsx`
  verde:
  - grupo «Filtrar por resultado» con «Todas (n)» activo al abrir; elegir «Entregado (n)» y «Con
    señales (n)» filtra; estado vacío con texto (R84);
  - la barra recibe «Descargar» a la derecha (R90);
  - columna «Mensajero» con `columnaMensajero` (R23).

## T3 — Montaje en `/cierres-admin` · `frontend_dev` (depende de T2)

- [ ] **T3.1** — `CierresAdminModule.tsx` monta `GestionesCierre` (`design.md > Montaje`); deja de
  importar `GestionesPorResultado`; `SeccionSinGestion` debajo. Exportar de `cierre-factura.tsx` lo
  anotado en T0.2, sin cambiar su cuerpo.

  **Hecho:**
  - typecheck verde;
  - `git diff` de `cierre-factura.tsx` = solo `export`;
  - `CierresBodegaAdminModule.tsx` y `CierreDiaModule.tsx` sin cambios.
- [ ] **T3.2** — Ampliar `tests/components/CierresAdminDetalleUnico.test.tsx` (central y satélite):
  - «Gestiones» pinta la lista nueva con sus filtros y la satélite no ve Fulfillment ni «Corregir
    métodos de pago» ni «Corregir el resultado» (R90, R26, R30);
  - pulsar «Ajustar pago» / «Corregir el resultado» abre el diálogo de hoy con esa gestión;
  - «Descargar» en la barra y «Pasaron a Novedad interna» debajo (R19, R90).

  **Hecho:** verde; mutación «audiencia satélite pasada como central» lo pone rojo.

## T4 — Tests y guardias que cambian · `frontend_dev` (depende de T3.1)

- [ ] **T4.1** — Adaptar, sin quitar lo que vigilan (mismo literal sobre la región nueva;
  `design.md > Tests y guardias que cambian`): `CierresAdminModule`, `cierre-detalle-ajuste-badge`,
  `CorregirResultadoCierre` y los que añada T0.1. **Hecho:** verdes; en `impl_SLT-101.md`, una línea
  por archivo «antes leía X, ahora lee Y».
- [ ] **T4.2** [P] — Guardias: `estado-con-info` (excepción `recuento` con motivo),
  `liquidacion-money-safe` (censo con `fila/`), `factura-contraste` (anclas, si T0.1 lo pidió).
  **Hecho:** `pnpm run test:guardias` verde; contraprueba: pintar `{RESULTADO_LABEL[r]}` en la
  celda de la fila pone rojo `estado-con-info`.

## T5 — E2E · `frontend_dev` (depende de T3, T4)

- [ ] **T5.1** — `e2e/cierres-rediseno.spec.ts`: `describe` de S3 con central A, satélite A y
  central B, y la descarga con «Señales», con los literales de T0.3 escritos a mano (R77).
  **Hecho:** verde dos veces seguidas en base desechable nueva, con `NEXT_PUBLIC_APP_URL` como en
  `gate.yml`; mutación «Fulfillment a la satélite» lo pone rojo.
- [ ] **T5.2** — Adaptar a la fila nueva, mismos literales: `cierres-admin`,
  `ajuste-pago-mensajero-cierre` (la parte del detalle de mensajero; la de bodega no cambia),
  `cierres-admin-rechazos-sla`, `cierre-modelo-nuevo-plan-porcentual`, `tarifas-activacion`
  («Total cobrado» → «Se le cobra»; «Ingreso de bodega:» según la respuesta a PA2).
  **Hecho:** verdes; una línea por archivo en `impl_SLT-101.md`.
- [ ] **T5.3** — `pnpm exec playwright test --project=dinero` completo, más
  `cierre-bodega-satelite` (no cambia). **Hecho:** dos corridas seguidas sin rojos ni inestables,
  salida en `impl_SLT-101.md`.

## T6 — Cierre

- [ ] **T6.1** — `./init.sh` verde, con `INIT_EXIT` escrito dentro del log. **Hecho:**
  - sin rojos; el aviso de tamaño, aceptado (PA3);
  - nada en `lib/`, `db/` ni migraciones (R72);
  - `grep -E "Number\(|parseFloat|toFixed"` vacío en `components/private/cierres/` (R71).

## Trazabilidad

| R | Test previsto |
|---|---|
| R22 | `tests/components/FilaGestion.test.tsx` (una sola fila, cuatro audiencias); `CierresAdminDetalleUnico.test.tsx` (central y satélite con la misma fila) |
| R23 | `tests/unit/utils/fila-gestion-vista.test.ts` (`columnasDe`); `DetalleCierreGestiones.test.tsx` (cabeceras y columna Mensajero); E2E central A |
| R24 | `fila-gestion-vista.test.ts` (`senalesDe`, seis casos); `FilaGestion.test.tsx` (celda vacía sin señales) |
| R25 | `fila-gestion-vista.test.ts` (`tarjetasDe` × audiencia); `FilaGestion.test.tsx`; E2E central A y satélite A |
| R26 | `fila-gestion-vista.test.ts` (`accionesDe`); `FilaGestion.test.tsx`; `CierresAdminDetalleUnico.test.tsx`; `CorregirResultadoCierre.test.tsx`; `cierre-detalle-ajuste-badge.test.tsx`; E2E satélite A |
| R27 | `fila-gestion-vista.test.ts`; `FilaGestion.test.tsx` (cascadas y «Sin dato» con literales); E2E central A/B, ajuste |
| R28 | `FilaGestion.test.tsx` (abre y pliega, nota con fecha); E2E central A |
| R29 | `fila-gestion-vista.test.ts` (`calculoDe` viejo GAM/no GAM/pacto, nuevo sin tarifa); `FilaGestion.test.tsx`; E2E central A y B |
| R30 | `fila-gestion-vista.test.ts`; `FilaGestion.test.tsx`; `CierresAdminDetalleUnico.test.tsx`; E2E satélite A (sin Fulfillment) |
| R71 | `tests/unit/guards/liquidacion-money-safe.test.ts` (censo con `fila/`); grep de T6.1 |
| R72 | revisión del diff en T6.1 |
| R77 | `e2e/cierres-rediseno.spec.ts` (central A y B, satélite A); `e2e/ajuste-pago-mensajero-cierre.spec.ts` |
| R84 | `fila-gestion-vista.test.ts` (`filtrosDe`, `filtrar`); `DetalleCierreGestiones.test.tsx`; E2E central A (conteos) |
| R85 | `fila-gestion-vista.test.ts` (texto por audiencia y orden); E2E central A (devolución) |
| R86 | `FilaGestion.test.tsx` («—» y botón de información); `estado-con-info.guardia.test.ts` |
| R87 | `fila-gestion-vista.test.ts` (`datosOrdenDe`); `FilaGestion.test.tsx` |
| R88 | `fila-gestion-vista.test.ts`; `FilaGestion.test.tsx`; `e2e/tarifas-activacion.spec.ts` (ingreso de bodega del modelo nuevo) — según PA2 |
| R89 | `FilaGestion.test.tsx`; `CierresAdminModule.test.tsx`; E2E adaptados (mismos nombres) |
| R90 | `CierresAdminDetalleUnico.test.tsx`; E2E central A y satélite A |
| R91 | `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`; E2E central A (xlsx con «Señales») |

## Archivos esperados

Pantalla (nuevos):
- `components/private/cierres/fila/GestionesCierre.tsx`
- `components/private/cierres/fila/FilaGestion.tsx`
- `components/private/cierres/fila/CalculoCobro.tsx`
- `components/private/cierres/fila/fila-gestion-vista.ts`
- `components/private/cierres/fila/fila-gestion-labels.ts`

Pantalla (cambian):
- `components/private/cierres/detalle/Cuenta.tsx`
- `components/private/cierres/detalle/detalle-cierre-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/cierre-factura.tsx`

Tests nuevos:
- `tests/unit/utils/fila-gestion-vista.test.ts`
- `tests/components/FilaGestion.test.tsx`
- `tests/components/DetalleCierreGestiones.test.tsx`

Tests que se adaptan:
- `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`
- `tests/components/CierresAdminDetalleUnico.test.tsx`
- `tests/components/CierresAdminModule.test.tsx`
- `tests/components/cierre-detalle-ajuste-badge.test.tsx`
- `tests/components/CorregirResultadoCierre.test.tsx`
- `tests/unit/guards/estado-con-info.guardia.test.ts`
- `tests/unit/guards/liquidacion-money-safe.test.ts`
- `tests/unit/guards/factura-contraste.guardia.test.ts`

E2E:
- `e2e/cierres-rediseno.spec.ts`
- `e2e/cierres-admin.spec.ts`
- `e2e/ajuste-pago-mensajero-cierre.spec.ts`
- `e2e/cierres-admin-rechazos-sla.spec.ts`
- `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts`
- `e2e/tarifas-activacion.spec.ts`

Spec y progreso:
- `specs/SLT-101-fila-gestion-unica/requirements.md`
- `specs/SLT-101-fila-gestion-unica/design.md`
- `specs/SLT-101-fila-gestion-unica/tasks.md`
- `progress/features/SLT-101.md`
- `progress/impl_SLT-101.md`
