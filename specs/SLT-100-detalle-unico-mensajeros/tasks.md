# SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» — tasks

> 2026-11-09. Zona fullstack:
> - **T1** es de `backend_dev` (`lib/`, test de integración);
> - **T2-T4** son de `frontend_dev`;
> - **T5** (E2E) va con `frontend_dev`.
>
> `[P]` = paralelizable con la task anterior.
>
> **Tamaño:** ~42 archivos y ~1 800 líneas estimadas. Carlos aceptó el tamaño sin partir (D22,
> `tamano-pr-aceptado` en `progress/features/SLT-100.md`), así que el aviso del gate es esperado.
> Si el diff pasa de ~50 archivos, el implementer para y avisa: eso ya no es lo aceptado.
>
> Antes del primer gate:
> - copiar `.env` al worktree (sin él, el gate sale verde saltándose la integración);
> - exportar una base desechable propia antes de cualquier `vitest` (memoria del proyecto).
>
> El índice del grafo de este worktree no existe: usar Grep/Read.

## T0 — Comprobaciones previas (sin código de producción)

- [x] **T0.1** — Confirmar el censo de lo que hoy lee el interior del modal del admin, y anotarlo
  en `progress/impl_SLT-100.md`:
  - `grep -l` en `tests/components/` por `<CierresAdminModule` y por «Detalle del cierre»,
    «Comprobante detallado», «Total de la empresa», «Decisión del cierre»;
  - `grep -l` en `e2e/` por las mismas regiones más «Totales del cierre» e «Ingreso de bodega por
    devoluciones a origen del cierre».

  **Hecho:** la lista coincide con `## Archivos esperados`. Si aparece uno más, se añade aquí y
  se avisa al leader (el tamaño aceptado es este).
- [x] **T0.2** [P] — Leer y anotar con archivo:línea:
  - la forma de `DescargaFilasResult` (rama `ok`);
  - dónde viven `separarParaDevolucion`, `efectoAlAprobar`, `motivoGestionLegible`,
    `INGRESO_BODEGA_RECHAZOS_SLA_LABEL`/`_MANUAL_LABEL` y las constantes de encabezado de R82;
  - el tipo de `cierreAbierto`, para confirmar que `setDestrabar(cierreAbierto)` tipa sin
    adaptador.

  **Hecho:** nota en `impl_SLT-100.md`. Si `setDestrabar` necesita un tipo distinto, se para y se
  pregunta.
- [x] **T0.3** [P] — Fijar el escenario E2E:
  - las entradas (órdenes, montos, tarifas de tienda y de mensajero, un rechazo) que producen los
    números del escenario A (`design.md > Verificación`);
  - el escenario B (modelo nuevo) con sus cuatro cifras derivadas a mano.

  **Hecho:** tabla de entradas → literales en `impl_SLT-100.md`, escrita **antes** del test. Si A
  no se puede reproducir exacto, van los literales alternativos con su derivación a mano.

## T1 — Servidor: quién resolvió (R80) · `backend_dev`

- [x] **T1.1** — Test de integración **primero**, en rojo:
  `tests/integration/db/cierre-resuelto-por-sql-real.test.ts`.
  - Siembra: aprobado por «Carla Resolutora»; `solicitado` sin resolutor; aprobado de otra zona.
  - Con autocomprobación de las tres filas sembradas.
  - Afirma: el nombre en el aprobado; `null` en el solicitado; el de otra zona con alcance
    satélite → `null` (no encontrado).

  **Hecho:** rojo antes de T1.2 por falta del campo.
- [x] **T1.2** — `findCierreByIdEnAlcance` en `lib/repositories/CierresAdminRepository.ts`:
  - añadir `resueltoPorUsuario: { select: NOMBRE_USUARIO_SELECT }` **solo** al `select` del
    detalle;
  - devolver `resueltoPorNombre`;
  - tipo opcional en `ICierresAdminRepository.ts`.

  **Hecho:** T1.1 en verde. Dos mutaciones anotadas como muertas: sin la relación en el `select`;
  con `mensajero` en su lugar.
- [x] **T1.3** — `verCierreDetalle` en `lib/services/CierresAdminService.ts`:
  - emite `resueltoPorNombre` solo con estado `aprobado`/`rechazado`; en otro caso, `null`;
  - campo opcional en `ICierresAdminService.ts`.

  **Hecho:** dos casos nuevos en `tests/unit/services/cierres-admin-service.test.ts`: aprobado con
  el literal; `solicitado` con resolutor en el doble → `null`. La mutación «sin la regla del
  estado» los pone en rojo. Y en el diff: nada en `db/`, ni migraciones, ni otra escritura (R72).

## T2 — Lógica pura y piezas nuevas · `frontend_dev` (depende de T1.3 para el tipo)

- [x] **T2.1** — `detalle-cierre-vista.ts`:
  - `modoAdminDe(estado)` (R79);
  - `vistaMensajeroDesdeAdmin` pasa `resueltoPorNombre` (R80) y `desgloseIngresoBodega` (R81);
  - `lineasDinero` añade la nota bajo «− pago a la bodega» (R81).

  **Hecho:** `tests/unit/utils/detalle-cierre-vista.test.ts` con literales:
  - los cuatro estados → modo;
  - la nota «Automático (por plazo vencido) ₡2.700 · Manual ₡0» (formato de `money()`) en el
    modelo viejo, y ausente en el nuevo y sin desglose;
  - `resueltoPorNombre` llega a la vista.
- [x] **T2.2** [P] — `detalle-cierre-descarga-columnas.ts` (R82). **Hecho:**
  `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts` afirma:
  - las 7 cabeceras en orden, escritas como literal en el test;
  - una fila con los strings del doble;
  - un `ingresoEmpresa` ausente → celda `null`, no `"0"`.

  `columnas-sensibles.guardia` sigue verde con el módulo descubierto. Contraprueba: renombrar el
  sufijo hace que la guardia deje de verlo, y se anota.
- [x] **T2.3** [P] — `RechazosDeTiendaCierre.tsx` y sus textos en `detalle-cierre-labels.ts` (R17,
  D27). **Hecho:** cubierto en T3.2.

## T3 — Montaje en `/cierres-admin` · `frontend_dev` (depende de T2)

- [x] **T3.1** — `CierresAdminModule.tsx`:
  - sustituye el `<Modal title="Detalle del cierre">` por `<DetalleCierre>` con audiencia, modo,
    pestañas y acciones (`design.md > Qué cambia`);
  - los diálogos de corrección y ajuste quedan como hermanos;
  - el destrabe desde el pie relee el detalle (R83);
  - exportar `SeccionSinGestion` de `cierre-factura.tsx` (y las constantes de T0.2 que hagan
    falta) sin cambiar su cuerpo.

  **Hecho:**
  - typecheck verde;
  - `CierresAdminModule.tsx` ya no importa `CierreFacturaDetalle` ni `CascadasCierreMensajero`;
  - `git diff` de `cierre-factura.tsx` = solo `export`.
- [x] **T3.2** — Test nuevo `tests/components/CierresAdminDetalleUnico.test.tsx`. Monta el módulo
  con dobles del servicio, por audiencia (`admin`/`satelite`) y estado, y afirma con literales:
  - el diálogo «Detalle del cierre» es el nuevo: `tablist` con «Dinero», «Gestiones (n)» y
    «Rechazados por la tienda (0)» (R38);
  - el modo por estado y los botones del pie: solicitado → «Rechazar»/«Aprobar»; vencido →
    «Destrabar cierre vencido»; aprobado → «Cerrar» y la pestaña «Pago al mensajero» solo con
    permiso y audiencia central (R79, R18);
  - pulsar «Aprobar» llama a la Server Action de hoy, y «Rechazar» abre el sub-modal de motivo
    (R39);
  - destrabar desde el pie → la Server Action de destrabe y una segunda lectura del detalle (R83);
  - «Rechazados por la tienda» con 0 → «Este cierre no tiene paquetes rechazados por la
    tienda.»; con 2 → dos filas con guía, destinatario, motivo, tienda y fecha, y la nota (R17);
  - «Gestiones» muestra «Pasaron a Novedad interna» con su conteo, y el aviso de no registrado
    con `sinGestionRegistrado: false` (R19);
  - «Descargar» presente en «Gestiones»; ninguna `.hoja-imprimible` ni botón «Imprimir» dentro
    del diálogo (R21);
  - cabecera «… · Aprobado 2026-11-07 19:10 por Carla Resolutora» con el campo en el doble, y sin
    «por» cuando falta (R80);
  - la nota de R81 bajo «− pago a la bodega».

  **Hecho:** verde. Mutaciones muertas anotadas en `impl_SLT-100.md`: modo de `vencido` → `"solo
  lectura"`; estado vacío sin texto; «Pago al mensajero» también a la satélite; `HojaFactura`
  montada de nuevo.
- [x] **T3.3** — Quitar las 6 `@sin-superficie` de `components/private/cierres/detalle/` (D21).
  **Hecho:**
  - `superficie-de-uso.guardia` verde sin ellas;
  - si exige conservar una en un export aún sin uso (p. ej. `vistaBodegaDesdeAdmin`), queda solo
    ahí, con su motivo, y se anota;
  - `grep -r "@sin-superficie S1 de SLT-95" components/` vacío salvo esa excepción anotada.

## T4 — Tests y guardias que cambian · `frontend_dev` (depende de T3.1)

- [x] **T4.1** — Adaptar, **sin quitar lo que vigilan** (misma aserción y mismo literal sobre la
  región nueva; tabla en `design.md > Tests y guardias que cambian`), los tests que abren el modal:
  - `CierresAdminModule`, `CierresAdminPagoMensajero`, `CierresAdminIndemnizacion`;
  - `CierresAdminDeepLink`, `CierresAdminConfirmacionFisica`;
  - `CierreMensajeroDetalleCascadas`, `CierreMensajeroDesglosePorTienda`;
  - `CierrePremioPendiente`, `cierre-detalle-ajuste-badge`, `CorregirResultadoCierre`.

  **Hecho:** verdes. En `impl_SLT-100.md`, por archivo, una línea «antes leía X, ahora lee Y».
  Ninguna aserción borrada sin su sustituta.
- [x] **T4.2** [P] — Guardias:
  - `cierre-detalle-superficies` (censo con la superficie nueva y sus tres datos);
  - `impresion-flujo` (se retira el caso `max-h-[70vh]` del admin; caso nuevo: el módulo del
    admin no monta `CierreFacturaDetalle` ni `HojaFactura`);
  - `factura-contraste` (anclas de línea).

  **Hecho:** verdes. Contraprueba de `impresion-flujo`: volver a montar `CierreFacturaDetalle` en
  el módulo la pone en rojo.
- [x] **T4.3** — `DineroIdentidadesEnPantalla.test.tsx` y `liquidacion-money-safe.test.ts` siguen
  verdes sin tocarlos (R71). `pnpm run test:guardias` verde. **Hecho:** salida anotada.

## T5 — E2E · `frontend_dev` (depende de T3, T4)

- [ ] **T5.1** — Nuevo `e2e/cierres-rediseno.spec.ts` (grupo `dinero`), con los casos de
  `design.md > Verificación de lo que ve el usuario` y los literales de T0.3 escritos a mano:
  - central A (solicitado → aprobar → reabrir), central B y satélite A;
  - vencido con destrabe;
  - la descarga: cabeceras y número de filas.

  **Hecho:**
  - verde dos veces seguidas en base desechable nueva, con `NEXT_PUBLIC_APP_URL` como en
    `gate.yml`;
  - mutaciones muertas: `netoEmpresa` → `ganancia` en `cifrasDe`; nota de R81 retirada.
- [ ] **T5.2** — Adaptar a las regiones nuevas, mismos literales:
  - `cierres-admin`, `wallet-iva-aparte-sl39`, `ajuste-pago-mensajero-cierre`;
  - `reglas-bloqueos-cierre`, `cierres-admin-rechazos-sla`, `cierre-modelo-nuevo-plan-porcentual`;
  - `tarifas-activacion`, `tarifas-valor-propio-mensajero`, `tope-intentos-por-empresa`.

  **Hecho:** verdes, y una línea por archivo en `impl_SLT-100.md` («antes leía X, ahora lee Y»).
- [ ] **T5.3** — `pnpm exec playwright test --project=dinero` completo, más `cierre-vencido-modelo`
  y `cierre-bodega-satelite` (que no cambian). **Hecho:** dos corridas seguidas sin rojos ni
  inestables, salida en `impl_SLT-100.md`.

## T6 — Cierre

- [ ] **T6.1** — `./init.sh` verde, con `INIT_EXIT` escrito dentro del log. **Hecho:**
  - sin rojos; el aviso de tamaño, aceptado;
  - revisión del diff: en `lib/` solo los 4 archivos de R80, nada en `db/` ni migraciones (R72);
  - `grep -E "Number\(|parseFloat|toFixed"` vacío en `components/private/cierres/` (R71).

## Trazabilidad R → test

| R | Test |
|---|---|
| R17 | `tests/components/CierresAdminDetalleUnico.test.tsx` (0 y 2 rechazos, texto D27); `e2e/cierres-rediseno.spec.ts` (central A: «Rechazados por la tienda (0)») |
| R18 | `CierresAdminDetalleUnico.test.tsx`; `tests/components/CierresAdminPagoMensajero.test.tsx`; E2E central A reabierto |
| R19 | `CierresAdminDetalleUnico.test.tsx` («Pasaron a Novedad interna», registrado / no registrado) |
| R21 | `CierresAdminDetalleUnico.test.tsx` (sin `.hoja-imprimible`, «Descargar» presente); `tests/unit/guards/impresion-flujo.guardia.test.ts`; E2E (descarga) |
| R38 | `CierresAdminDetalleUnico.test.tsx`; `tests/components/CierresAdminDeepLink.test.tsx`; E2E central y satélite |
| R39 | `CierresAdminDetalleUnico.test.tsx`; `CierresAdminConfirmacionFisica.test.tsx`; `CierresAdminIndemnizacion.test.tsx`; E2E (aprobar, rechazar) |
| R71 | `tests/unit/guards/liquidacion-money-safe.test.ts`; `grep` de T6.1 |
| R72 | revisión del diff en T1.3 y T6.1 |
| R77 | `e2e/cierres-rediseno.spec.ts`: central A y B, satélite A, literales de T0.3 |
| R79 | `tests/unit/utils/detalle-cierre-vista.test.ts` (`modoAdminDe`); `CierresAdminDetalleUnico.test.tsx` (pie por estado) |
| R80 | `tests/integration/db/cierre-resuelto-por-sql-real.test.ts` (lectura real, alcance); `tests/unit/services/cierres-admin-service.test.ts` (solo aprobado/rechazado); `CierresAdminDetalleUnico.test.tsx` (cabecera); E2E central A reabierto |
| R81 | `detalle-cierre-vista.test.ts` (`lineasDinero`); `CierresAdminDetalleUnico.test.tsx`; `e2e/cierres-admin-rechazos-sla.spec.ts`; E2E central A (presente) y B (ausente) |
| R82 | `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`; E2E (cabeceras del archivo) |
| R83 | `CierresAdminDetalleUnico.test.tsx` (segunda lectura); E2E vencido |

Los R de S1 (R1-R16, R20) mantienen sus tests de SLT-95 «Rediseño del detalle de cierre
(mensajero y bodega)». R77 los comprueba ahora en pantalla, por rol.

## Archivos esperados

Servidor (R80):
- `lib/interfaces/repositories/ICierresAdminRepository.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/services/CierresAdminService.ts`
- `tests/integration/db/cierre-resuelto-por-sql-real.test.ts`
- `tests/unit/services/cierres-admin-service.test.ts`

Pantalla:
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/cierre-factura.tsx`
- `components/private/cierres/detalle/DetalleCierre.tsx`
- `components/private/cierres/detalle/CifrasCierre.tsx`
- `components/private/cierres/detalle/DineroCierre.tsx`
- `components/private/cierres/detalle/Cuenta.tsx`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `components/private/cierres/detalle/detalle-cierre-labels.ts`
- `components/private/cierres/detalle/RechazosDeTiendaCierre.tsx`
- `components/private/cierres/detalle/detalle-cierre-descarga-columnas.ts`

Tests nuevos o ampliados:
- `tests/components/CierresAdminDetalleUnico.test.tsx`
- `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`
- `tests/unit/utils/detalle-cierre-vista.test.ts`

Tests que se adaptan:
- `tests/components/CierresAdminModule.test.tsx`
- `tests/components/CierresAdminPagoMensajero.test.tsx`
- `tests/components/CierresAdminIndemnizacion.test.tsx`
- `tests/components/CierresAdminDeepLink.test.tsx`
- `tests/components/CierresAdminConfirmacionFisica.test.tsx`
- `tests/components/CierreMensajeroDetalleCascadas.test.tsx`
- `tests/components/CierreMensajeroDesglosePorTienda.test.tsx`
- `tests/components/CierrePremioPendiente.test.tsx`
- `tests/components/cierre-detalle-ajuste-badge.test.tsx`
- `tests/components/CorregirResultadoCierre.test.tsx`
- `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts`
- `tests/unit/guards/impresion-flujo.guardia.test.ts`
- `tests/unit/guards/factura-contraste.guardia.test.ts`

E2E:
- `e2e/cierres-rediseno.spec.ts`
- `e2e/cierres-admin.spec.ts`
- `e2e/wallet-iva-aparte-sl39.spec.ts`
- `e2e/ajuste-pago-mensajero-cierre.spec.ts`
- `e2e/reglas-bloqueos-cierre.spec.ts`
- `e2e/cierres-admin-rechazos-sla.spec.ts`
- `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts`
- `e2e/tarifas-activacion.spec.ts`
- `e2e/tarifas-valor-propio-mensajero.spec.ts`
- `e2e/tope-intentos-por-empresa.spec.ts`
