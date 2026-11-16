# impl SLT-164 «PWA del mensajero: Recoger en bodega y Recolección» — rebanada C de SLT-156 «PWA de los mensajeros: tablas usables en el móvil»

## Tanda 1 (C1, C2, C3) · frontend_dev · 2026-11-15

Spec: `specs/SLT-156-pwa-mensajero-tablas/` (R500, R506, R516, R517-R522; tasks.md > «Rebanada C»). Grafo no
consultado: el worktree es nuevo; se exploró con Grep/Read.

### Archivos

Producción (`MA/` = `app/(app)/mis-asignaciones/_components/`):
- `MA/mis-asignaciones-buscador.ts` — `BUSCADOR_GUIAS_LABEL` («Buscar guías») y `BUSCADOR_GUIAS_PLACEHOLDER` («Guía,
  remisión, teléfono o nombre», R506) para Recoger y Recolección. `filtrarAsignaciones` ya era genérica por forma
  (`OrdenBuscable`): la firma no cambia y Recolección la usa tal cual en sus dos listas.
- `MA/RecogerModule.tsx` — C1 (R518): escáner → `BuscadorFiltros` (`fija`, `tactil`, `leerDeUrl={false}`,
  `debounceMs={0}`, sin `filtros`) → pestañas (`min-h-11`, R493) con el conmutador en su fila (envuelve) → aviso
  de nuevas → lista. Fuera el `Input` propio y su región «Buscar guías para recoger». Detalle con `compacta` (R517).
- `MA/RecogerPaqueteCard.tsx` — disparador `ESCANER_LABEL_GUIA` con `tactil` (44 px, a todo el ancho); la tarjeta
  conserva «Recoger paquete» y su flujo (R522).
- `app/(app)/recoleccion/_components/RecoleccionModule.tsx` — C2 (R519): aviso o escáner (`ESCANER_LABEL_GUIA`,
  `tactil`) → `BuscadorFiltros` fija (hija directa del contenedor, que llega al final de «Recogidos en tienda
  hoy») → «Por recolectar en tienda» → «Recogidos en tienda hoy». Un término filtra las dos listas (R520); las
  cabeceras cuentan el día entero; vacío de búsqueda (R521). Detalle con `compacta`.
- `app/(app)/recoleccion/_components/RecolectadasHoyLista.tsx` — props opcionales `visibles` y `buscando`;
  `SIN_RESULTADOS_BUSQUEDA` («Ninguna guía por recolectar coincide con la búsqueda.»); Detalle con `compacta`.

Tests y E2E:
- `tests/components/RecogerModule.test.tsx` — describe nuevo «SLT-156 rebanada C» (6). Ajustados al cambio:
  `contadorNuevas()` (el `BuscadorFiltros` trae su propio `status`), R22 Detalle despliega la fila compacta,
  R28 sin la región del buscador viejo.
- `tests/components/RecoleccionModule.test.tsx` — describe nuevo «SLT-156 rebanada C» (8).
- `RecogerPaqueteCard.test.tsx`, `RecogerModuleRefrescoAlVolver.test.tsx`, `RecoleccionPage.test.tsx` — el
  disparador se llama «Escanear o escribir guía».
- `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts` — m7: los 5 archivos de C con «recorte»,
  «escala» y «oculta».
- `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` (nuevo, C3) — (a) Recoger a 360 y 414 px; (b) Recolección a
  360 y 414 px, con recolección real por el escáner y búsqueda en las dos listas. Registrado en el proyecto
  `reparto` de `playwright.config.ts`.
- `e2e/mis-asignaciones.spec.ts` — el disparador de Recoger se llama «Escanear o escribir guía».

### R → test

| R | Test | Mutación que lo mata |
|---|---|---|
| R500, R518 | `RecogerModule.test.tsx` «R518/R500: «Escanear o escribir guía» (cerrado) → barra fija → pestañas → aviso → lista»; E2E (a) | C1a escáner bajo la barra (la de tasks.md); C1c sin `fija` |
| R500, R519 | `RecoleccionModule.test.tsx` «R519/R500: … → barra fija → «Por recolectar» → «Recogidos»»; E2E (b) | C2b barra encima del escáner; C2j sin `fija` |
| R493 (C) | `RecogerModule.test.tsx` «R493: el disparador mide 44 px … las pestañas, 44 px»; `RecoleccionModule.test.tsx` «R493»; E2E `tactil()` | C1e/C2f sin `tactil`; C1f pestaña sin `min-h-11` |
| R495, R506 | «R495/R506: un solo campo, con el placeholder…, que busca también por teléfono» (las dos) | C1b/C2h placeholder viejo |
| R516 | `RecogerModule.test.tsx` «R518/R516: bloqueado…»; `RecoleccionModule.test.tsx` «R516/R519: bloqueado…»; `RecogerModuleRefrescoAlVolver.test.tsx` | C1i/C2g escáner con bloqueo |
| R517 | «R517: arranca en Mosaico … Detalle pinta las tarjetas compactas, sin acciones» (las dos); E2E (a), (b) | C1g/C2k vista inicial «detalle»; C1d/C2e/C2l Detalle sin `compacta` |
| R520 | `RecoleccionModule.test.tsx` «R520: el término filtra las DOS listas y las cabeceras siguen contando el día entero»; E2E (b) | C2a filtrar solo «Por recolectar» (la de tasks.md); C2i conteo filtrado |
| R521 | `RecogerModule.test.tsx` «R521: sin coincidencias…»; `RecoleccionModule.test.tsx` «R521: … distinto del vacío sin órdenes»; E2E (b) | C1h vacío de búsqueda = vacío sin órdenes; C2c/C2d sin vacío de búsqueda |
| R522 | `RecoleccionModule.test.tsx` «R522»; `RecogerPaqueteCard.test.tsx` (R2, R15 y demás, por el disparador nuevo); E2E (b) recolecta por el escáner | C1j/C2m sin la confirmación |
| R490, R492, R501 (C) | E2E (a), (b): `sinDesborde`, `sinElipsis`, importes en una línea (`Range` con una sola altura) | E2E: `truncate` en `RecolectadasHoyLista` (la de tasks.md) |

### Mutaciones

Arnés `c164-mutar.py` en el scratchpad: aplica el cambio (exige el texto UNA vez), corre los tests, restaura y
compara byte a byte. Las 23 en ROJO, las 23 con `restaurado_identico=True`:

```
C1a-escaner-bajo-la-barra: ROJO · 1 failed | 75 passed (76)
C1b-placeholder-viejo: ROJO · 1 failed | 75 passed (76)
C1c-sin-fija: ROJO · 1 failed | 75 passed (76)
C1d-detalle-no-compacta: ROJO · 1 failed | 75 passed (76)
C1e-disparador-sin-tactil: ROJO · 1 failed | 75 passed (76)
C1f-pestanas-sin-44: ROJO · 1 failed | 75 passed (76)
C1g-vista-inicial-detalle: ROJO · 11 failed | 65 passed (76)
C1h-vacio-busqueda-igual-al-vacio: ROJO · 4 failed | 72 passed (76)
C1i-escaner-con-bloqueo: ROJO · 3 failed | 73 passed (76)
C1j-recogida-sin-confirmacion: ROJO · 2 failed | 21 passed (23)
C2a-filtra-solo-por-recolectar: ROJO · 2 failed | 50 passed (52)
C2b-barra-sobre-el-escaner: ROJO · 2 failed | 50 passed (52)
C2c-sin-vacio-busqueda-por-recolectar: ROJO · 1 failed | 51 passed (52)
C2d-sin-vacio-busqueda-recogidos: ROJO · 1 failed | 51 passed (52)
C2e-detalle-no-compacta: ROJO · 1 failed | 51 passed (52)
C2f-disparador-sin-tactil: ROJO · 1 failed | 51 passed (52)
C2g-escaner-con-bloqueo: ROJO · 8 failed | 44 passed (52)
C2h-placeholder-viejo: ROJO · 1 failed | 51 passed (52)
C2i-conteo-filtrado: ROJO · 1 failed | 51 passed (52)
C2j-sin-fija: ROJO · 1 failed | 51 passed (52)
C2k-vista-inicial-detalle: ROJO · 6 failed | 46 passed (52)
C2l-recogidos-detalle-no-compacta: ROJO · 1 failed | 51 passed (52)
C2m-recoleccion-sin-confirmacion: ROJO · 3 failed | 49 passed (52)
```

E2E (C3): `truncate` en el pie «Recogido a las…» de `RecolectadasHoyLista` + `next build` → (b) 360 y 414 px en
ROJO (`ellipsis: «Recogido a las 9:09 p. m.»`), 2 failed | 2 passed. Restaurado: `cmp` limpio y `git diff`
del archivo igual que antes de la mutación.

### Comandos

- Base desechable `slt164_gate` (Postgres local; URL a un archivo del scratchpad, nunca impresa):
  `migrate deploy` (MIGR_EXIT=0) + `db:seed` (SEED_EXIT=0).
- `pnpm run typecheck`: verde. `eslint` sobre los archivos tocados: 0 errores, 1 aviso ya existente
  (`ContactoButtons` sin uso en `RecoleccionModule.tsx`, no es de esta tanda).
- vitest de los afectados (RecogerModule, RecogerModuleRefrescoAlVolver, RecogerPaqueteCard, RecoleccionModule,
  RecoleccionPage, ChatContactoAntesDeRecoger) + `pwa-mensajero-sin-recorte` + `e2e-sin-saltos`: verde.
- E2E sobre la base nueva `servi_slt164_e2e` (DROP/CREATE + `migrate deploy` + `db:seed`), `next build` y
  Playwright con `E2E_PUERTO=3101` (el `baseURL` de `playwright.config.ts` lo respeta), `E2E_STORAGE_PUERTO=54339`
  y `NEXT_PUBLIC_APP_URL=http://localhost:3101`:
  - `--project=reparto` `pwa-mensajero-recoger-recoleccion`, `mis-asignaciones`, `asignacion-satelite`,
    `pwa-mensajero-reparto`: **13 passed**, EXIT=0.
  - `--project=dinero` `pwa-mensajero-base`, `pwa-mensajero-cierre-dia` (los otros que usan el fixture):
    **9 passed**, EXIT=0.
- `./init.sh` con `DATABASE_URL`/`DIRECT_URL` a `slt164_gate`, log fuera del árbol: **INIT_EXIT=0**. Tamaño:
  14/40 archivos, 322/1000 líneas de producción, 628/3000 de tests.

### Decisiones y desviaciones

- **Conmutador Mosaico/Detalle de Recoger** en la fila de las pestañas (envuelve a 360 px). R518 no lo ubica; la
  barra fija es `BuscadorFiltros` sin `filtros`, y meterlo como `children` lo pondría delante del campo.
- **Barra de Recoger dentro de la sección «Recoger en bodega»** (su primer hijo), no hija directa del módulo: la
  sección contiene pestañas y lista hasta el final, así que `sticky` la acompaña igual; el test lo afirma (el padre
  de la barra contiene la lista).
- **El vacío de búsqueda de Recolección es el mismo texto en sus dos listas** («Ninguna guía por recolectar
  coincide con la búsqueda.»): R521 y `design.md §9` dan un solo texto para la pantalla. En «Recogidos en tienda
  hoy» la palabra «por recolectar» suena menos exacta: si Carlos quiere otro texto ahí, es un cambio de constante.
- **Detalle compacto en «Recogidos en tienda hoy»**: la hora («Recogido a las…») va al despliegue de la fila, como
  las acciones de Reparto; en Mosaico sigue a la vista.
- **Escáner de Recoger** sigue sin montarse con la lista vacía (como hoy); R500 no lo cambia.
- **Placeholder**: Reparto conserva su literal propio (no se tocó `RepartoModule.tsx` para no cruzar con SLT-166
  «PWA del mensajero: mapa de ruta», en vuelo); Recoger y Recolección usan la constante nueva. El mismo texto en
  los dos sitios.
- **`tests/components/RepartoModule.test.tsx` `accesoRecogida`** busca «Recoger paquete» para afirmar que Reparto no
  monta la recogida; con el disparador renombrado esa negación ya no puede fallar. No se tocó (archivo de B, cruce
  con SLT-166); queda para el reviewer.
- **Escenario E2E de Recolección** sin tocar las fábricas: el spec da de alta una segunda tienda de la misma empresa
  con `seRecogeEnTienda: true` (`crearUsuarioE2E`) y su tarifa (`TarifaService.crear`), crea las órdenes con
  `crearOrden` sobre esa tienda (nacen `por_recolectar_en_tienda` con guía) y las asigna con
  `GuiaAsignacionService.asignarRecoleccion`. La recolección de «Recogidos hoy» la hace el propio E2E por el escáner.
- **`playwright.config.ts`**: SLT-166 también registra su spec en el proyecto `reparto`; posible conflicto de
  merge en esa lista.

### Veredicto

C1-C3 hechas, cada R con su test y su mutación en rojo; E2E 13/13 y 9/9; gate `INIT_EXIT=0`.
