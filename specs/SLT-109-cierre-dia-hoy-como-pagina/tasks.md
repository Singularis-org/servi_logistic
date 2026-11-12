# SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» — tasks

> **Zona:** frontend (`frontend_dev`). Un commit por task.
>
> **Antes de empezar** (memorias «Worktree sin .env = gate ciego» y «vitest related toca la base
> local»):
> - copia `.env` al worktree antes del primer gate;
> - exporta la base desechable antes de cualquier `vitest`.

## Tamaño

**37 archivos** (92 % de 40; pasa el 80 %) y **~2 300-2 500 líneas** (añadidas + borradas), unas
2,4 veces el tope de 1 000. Ya lleva el factor ~2 de los tests de esta épica.

| Bloque | Líneas | Tipo |
|---|---|---|
| `CierreDiaModule.tsx` | ~860 (borra ~600: secciones, columnas, `PanelCorreccion`, totales, CTA; pone ~260) | producción |
| `page.tsx` | ~35 | producción |
| `detalle-cierre-vista.ts` + `-labels.ts` | ~120 | producción |
| `DetalleCierre.tsx` | ~35 | producción |
| `CorregirCierre.tsx` (nuevo) | ~70 | producción |
| Fila (`FilaGestion`, `GestionesCierre`, vista, labels) | ~50 | producción |
| **Producción** | **~1 170** (de ellas ~600 borradas) | |
| `CierreDiaPagina.test.tsx` (nuevo) | ~380 | tests |
| Tests de componente adaptados (9 archivos) | ~380 | tests |
| Unit (`detalle-cierre-vista`, `fila-gestion-vista`) | ~120 | tests |
| Guardias (6 archivos) | ~80 | tests |
| E2E (7 archivos) | ~200 | tests |
| **Tests** | **~1 160** | |

No la parto: el corte posible está en `requirements.md > PA5`. Sin el borrado, la producción neta es
~570 líneas.

## T0 — Comprobaciones previas (sin código de producción)

- [ ] **T0.1** Actualiza la rama desde `origin/dev` **con SLT-137 «/cierre-dia: cola de cierres del
  mensajero con filtros» ya mergeada** (`git fetch` + merge; comprueba el `merge-base`). Si SLT-137
  no está en `dev`, para y avisa al leader. Lee cómo quedó el «Ver» de la cola (`abrirDetalle`).
  **Hecho:** SHA de `origin/dev` y firma del `onVer` de la cola anotados en
  `progress/features/SLT-109.md`.
- [ ] **T0.2** Censo de tests y guardias con `grep -rl` en `tests/` y `e2e/`: «Totales del día»,
  «Cierre vencido», «Cierre rechazado», «Corregir el cierre rechazado», `name: "Ganancia"`,
  `DESCARGA_POR_RESULTADO`, `COLUMNAS_DESCARGA_DIA_`, `CierreDiaModule.tsx`, «Devolver a gestión».
  **Hecho:** la lista coincide con `## Archivos esperados`, o el leader tiene el archivo de más.
- [ ] **T0.3** Corre `pnpm run test:guardias` en limpio y anota las verdes de partida. Mira si alguna
  exige un consumidor para cada export de `cierre-dia-descarga-columnas.ts`. **Hecho:** anotado.
- [ ] **T0.4** Mide una vez, en la base desechable, las tres cifras del mensajero del escenario de
  `e2e/cierre-dia.spec.ts` (modelo viejo) y de `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts`
  (modelo nuevo). Escríbelas a mano, con su derivación, en la cabecera de cada E2E (R77).

## T1 — Lógica pura (depende de T0) [P entre T1.1 y T1.2]

- [ ] **T1.1** `detalle-cierre-vista.ts` + `detalle-cierre-labels.ts`:
  - `vistaMensajeroEnCurso` y `cierreDeLaPagina` (`design.md > Elección del cierre`);
  - `avisosDelMensajero`: franja de bloqueo en cualquier modo (R246);
  - `accionesDeLaTabla` mensajero `rechazado` = `[solicitarRechazado, cerrar]`; `pieTextoDe` sin
    envío (R252);
  - textos mudados (`CORRECCION_*`) y nuevos («Gestiones del cierre de hoy», R253, R252).

  Test en `tests/unit/utils/detalle-cierre-vista.test.ts`:
  - `cierreDeLaPagina`: sin reenviable → en curso; vencido ok → vencido; rechazado ok → rechazado
    con su `cierreId`; reenviable con error → `error`;
  - `vistaMensajeroEnCurso`: `empresa: null`, `folio: null`, `destino: ""`, conteos de 2
    entregadas + 1 incidente = 3; `motivoBloqueo` solo con `puedesSolicitar = false`;
  - avisos: rechazado + bloqueado = 2 franjas (motivo primero); en curso + bloqueado + motivo = 2;
    sin bloqueo ni motivo = 0.

  **Hecho:** rojo si `cierreDeLaPagina` ignora `aReenviarPrimero`, si la vista copia `empresa` o si
  la franja de bloqueo vuelve a ser solo de `vencido`.
- [ ] **T1.2** Fila: `fila-gestion-vista.ts` (`devolverDeshabilitado`), `fila-gestion-labels.ts`
  (texto de la tienda mudado sin cambiar un carácter), `FilaGestion.tsx` (`disabled`, `title`,
  nombre accesible y `enVuelo`), `GestionesCierre.tsx` (pasa `enVuelo`). Tests en
  `tests/unit/utils/fila-gestion-vista.test.ts` y `tests/components/FilaGestion.test.tsx`: gestión de
  la tienda → deshabilitado con el motivo en `title` y nombre; otra → habilitado; en vuelo →
  deshabilitado. **Hecho:** rojo si se quita la condición `desdeAyudaTienda`.

## T2 — Detalle (depende de T1.1)

- [ ] **T2.1** `DetalleCierre.tsx`: `deshabilitadas` (botón `disabled` + `title` + descripción
  `sr-only`), cabecera sin partes vacías, alto del marco página (R254). Tests en
  `tests/components/DetalleCierre.test.tsx`: «Solicitar cierre» deshabilitado con su descripción;
  cabecera en curso sin « · » de más; rechazado en modal ofrece solo «Cerrar».
- [ ] **T2.2** [P con T2.1] `CorregirCierre.tsx` (R248). Tests en
  `tests/components/CierreDiaModule477Correccion.test.tsx` (adaptado): explicación y aviso del corte;
  dos órdenes (una pendiente con «Ir a Entregas» → `/mis-asignaciones/reparto`, otra rehecha sin
  enlace); sin órdenes → no hay sección.

## T3 — Montaje en `/cierre-dia` (depende de T1, T2)

- [ ] **T3.1** `page.tsx`: lee `verCierrePasado` solo con `aReenviarPrimero`; `error` sin
  `notFound()`. Test en `tests/components/CierreDiaPage.test.tsx`: sin reenviable no lo llama; con
  reenviable lo llama con su `cierreId`; `no_encontrada` → prop `error`.
- [ ] **T3.2** `CierreDiaModule.tsx`: monta `DetalleCierre` marco página por modo (`design.md >
  Montaje`), el aviso de R253, el «Ver» de un rechazado en modo rechazado (R252) y la relectura tras
  deshacer en el modal; borra lo sustituido (R255). Test nuevo `tests/components/CierreDiaPagina.test.tsx`
  con un caso por R240-R253 y R255 (ver `## Trazabilidad`).
  **Hecho:** rojo con cada mutación: pintar el en curso teniendo un reenviable; `acciones.devolver`
  en vencido; quitar `deshabilitadas.solicitar`; pintar el aviso de bloqueo fuera del detalle.
- [ ] **T3.3** Adapta los tests que montaban las secciones del día: `CierreDiaModule.test.tsx`,
  `CierreDiaModuleIncidente.test.tsx` (R256: «Ganancia» del incidente en la fila y en el archivo,
  «—»/vacía si es nula, sin indemnización), `CierreDiaMotivoRechazoAutomatico.test.tsx`,
  `CierreDiaComprobanteMarcasDeOrigen.test.tsx`, `CierreEvidenciasVarias486.test.tsx`,
  `descarga/CierresDescarga.test.tsx`, `descarga/CierresDescargaColumnas.test.tsx`. Un caso que solo
  probaba una tabla por resultado se borra y se dice en el commit; uno que probaba una regla
  (motivo legible, marca de la tienda, evidencia) se reapunta a la fila única.
- [ ] **T3.4** Guardias: `censo-tablas.ts`, `contadores-cabecera.guardia.test.ts`,
  `estado-con-info.guardia.test.ts`, `pagos-captura.guardia.test.ts`, `incidente-exhaustividad.test.ts`,
  `intentos-no-alcance-ui.test.ts`. **Hecho:** cada entrada que se quita o se mueve, con su porqué en
  el commit; `pnpm run test:guardias` verde.

## T4 — E2E (depende de T3)

- [ ] **T4.1** `e2e/cierre-dia.spec.ts`: las cifras del detalle con los literales de T0.4 (R77,
  modelo viejo); «Devolver a gestión» desde la fila (R243); viewport 375 × 667 con el botón del pie
  dentro de la ventana (`boundingBox`, R254).
- [ ] **T4.2** `e2e/cierre-vencido-modelo.spec.ts`: el vencido como página y su reenvío desde el pie
  (R63, R249, R251); tras reenviar, la página pinta el en curso.
- [ ] **T4.3** Reapunta «Totales del día» / «Cierre vencido» a las cifras y al pie del detalle en
  `reglas-bloqueos-cierre.spec.ts`, `mis-asignaciones.spec.ts`, `tope-intentos-por-empresa.spec.ts`,
  `tarifas-valor-propio-mensajero.spec.ts` y `cierre-modelo-nuevo-plan-porcentual.spec.ts` (R77,
  modelo nuevo).
- [ ] **T4.4** Corre en local, base desechable nueva, los 7 E2E (`docs/perfil-agentes.md > E2E en
  local antes del PR`). **Hecho:** verdes, anotados en `progress/features/SLT-109.md`.

## T5 — Cierre (leader)

- [ ] **T5.1** `./init.sh` verde.
- [ ] **T5.2** `git diff --stat origin/dev -- lib db` vacío (R72).
- [ ] **T5.3** Reviewer con este spec y `## Trazabilidad`. Aprobación de Carlos en Preview.

## Trazabilidad

| R | Test |
|---|---|
| R4 | `tests/unit/utils/detalle-cierre-vista.test.ts` › avisos del mensajero (rechazado + bloqueado, en curso + bloqueado + motivo) |
| R12 | `tests/components/DetalleCierre.test.tsx` › pie por modo; `tests/components/CierreDiaPagina.test.tsx` › pie en curso / rechazado / vencido |
| R61 | `tests/components/CierreDiaPagina.test.tsx` › en curso: detalle página, «Devolver a gestión», «Solicitar cierre»; `e2e/cierre-dia.spec.ts` |
| R62 | `tests/components/CierreDiaPagina.test.tsx` › rechazado; `tests/components/CierreDiaModule477Correccion.test.tsx` |
| R63 | `tests/components/CierreDiaPagina.test.tsx` › vencido; `e2e/cierre-vencido-modelo.spec.ts` |
| R71 | `tests/unit/guards/liquidacion-money-safe.test.ts` (sin cambios; cubre los archivos tocados) |
| R72 | T5.2 (`git diff --stat origin/dev -- lib db` vacío) |
| R77 | `e2e/cierre-dia.spec.ts` (modelo viejo) y `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts` (modelo nuevo), literales de T0.4 |
| R240 | `tests/unit/utils/detalle-cierre-vista.test.ts` › `cierreDeLaPagina` (4 casos); `tests/components/CierreDiaPagina.test.tsx` › un solo detalle de página; `tests/components/CierreDiaPage.test.tsx` |
| R241 | `tests/components/CierreDiaPagina.test.tsx` › cabecera y tres cifras en curso, sin dinero de la empresa |
| R242 | `tests/components/CierreDiaPagina.test.tsx` › pestañas en curso, abre en «Gestiones», «Rechazados por la tienda (0)» con estado vacío |
| R243 | `tests/components/CierreDiaPagina.test.tsx` › deshacer `ok` / `conflict`; `e2e/cierre-dia.spec.ts` |
| R244 | `tests/components/FilaGestion.test.tsx`; `tests/unit/utils/fila-gestion-vista.test.ts` |
| R245 | `tests/components/CierreDiaPagina.test.tsx` › deshabilitado con motivo; confirmación con resumen |
| R246 | `tests/components/CierreDiaPagina.test.tsx` › franja en el detalle, ningún `alert` de bloqueo fuera; `tests/unit/utils/detalle-cierre-vista.test.ts` |
| R247 | `tests/components/CierreDiaPagina.test.tsx` › rechazado: cabecera, motivo, cifras, abre en «Corregir» |
| R248 | `tests/components/CierreDiaModule477Correccion.test.tsx` |
| R249 | `tests/components/CierreDiaPagina.test.tsx` › vencido sin «Devolver a gestión»; `e2e/cierre-vencido-modelo.spec.ts` |
| R250 | `tests/components/CierreDiaModule477Correccion.test.tsx` › confirmación con órdenes sin rehacer |
| R251 | `e2e/cierre-vencido-modelo.spec.ts` › paso 3; `tests/components/CierreDiaPagina.test.tsx` |
| R252 | `tests/components/CierreDiaPagina.test.tsx` › «Ver» de un rechazado: modal modo rechazado, solo «Cerrar», relectura tras deshacer |
| R253 | `tests/components/CierreDiaPage.test.tsx` › `no_encontrada` → `error`; `tests/components/CierreDiaPagina.test.tsx` › aviso + botón de reenvío |
| R254 | `e2e/cierre-dia.spec.ts` › 375 × 667 |
| R255 | `tests/components/CierreDiaPagina.test.tsx` › ninguna de las regiones viejas |
| R256 | `tests/components/CierreDiaModuleIncidente.test.tsx`; `tests/components/descarga/CierresDescarga.test.tsx` |

## Archivos esperados

Producción:
- `app/(app)/cierre-dia/page.tsx`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `components/private/cierres/detalle/DetalleCierre.tsx`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `components/private/cierres/detalle/detalle-cierre-labels.ts`
- `components/private/cierres/detalle/CorregirCierre.tsx`
- `components/private/cierres/fila/FilaGestion.tsx`
- `components/private/cierres/fila/GestionesCierre.tsx`
- `components/private/cierres/fila/fila-gestion-vista.ts`
- `components/private/cierres/fila/fila-gestion-labels.ts`

Tests:
- `tests/components/CierreDiaPagina.test.tsx`
- `tests/components/CierreDiaModule.test.tsx`
- `tests/components/CierreDiaModule477Correccion.test.tsx`
- `tests/components/CierreDiaModuleIncidente.test.tsx`
- `tests/components/CierreDiaMotivoRechazoAutomatico.test.tsx`
- `tests/components/CierreDiaComprobanteMarcasDeOrigen.test.tsx`
- `tests/components/CierreEvidenciasVarias486.test.tsx`
- `tests/components/CierreDiaPage.test.tsx`
- `tests/components/DetalleCierre.test.tsx`
- `tests/components/FilaGestion.test.tsx`
- `tests/components/descarga/CierresDescarga.test.tsx`
- `tests/components/descarga/CierresDescargaColumnas.test.tsx`
- `tests/unit/utils/detalle-cierre-vista.test.ts`
- `tests/unit/utils/fila-gestion-vista.test.ts`
- `tests/unit/descarga/censo-tablas.ts`
- `tests/unit/descarga/contadores-cabecera.guardia.test.ts`
- `tests/unit/guards/estado-con-info.guardia.test.ts`
- `tests/unit/guards/pagos-captura.guardia.test.ts`
- `tests/unit/guards/incidente-exhaustividad.test.ts`
- `tests/unit/components/intentos-no-alcance-ui.test.ts`

E2E:
- `e2e/cierre-dia.spec.ts`
- `e2e/cierre-vencido-modelo.spec.ts`
- `e2e/reglas-bloqueos-cierre.spec.ts`
- `e2e/mis-asignaciones.spec.ts`
- `e2e/tope-intentos-por-empresa.spec.ts`
- `e2e/tarifas-valor-propio-mensajero.spec.ts`
- `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts`

Compartidos con SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» (va antes):
`CierreDiaModule.tsx`, `CierreDiaModule.test.tsx`, `CierresDescarga.test.tsx`, `censo-tablas.ts`,
`e2e/cierre-dia.spec.ts`.
