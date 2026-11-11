# SLT-103 «Diálogos del módulo de cierres y trato tú» — tasks (rebanada 1)

> Solo pantalla y tests (`frontend_dev`). Sin `lib/`, `db/` ni Server Actions. Cada task cierra con
> `pnpm run typecheck`, `pnpm run lint` y `pnpm exec vitest related --run <archivos tocados>`. Exporta
> la base desechable antes de cualquier vitest (memoria «vitest related toca la base local»). Los
> textos que se afirman van escritos a mano en el test, nunca con la función que los produce.

## T0 — Línea base

- [ ] Rama de la feature desde `dev` actualizado (`origin/dev`); `.env` copiado al worktree antes del
  primer gate (memoria «worktree sin .env = gate ciego»).
- [ ] `./init.sh` en verde antes de tocar nada. Anota en `progress/impl_SLT-103.md` qué tests de
  `CierreEvidenciasVarias486`, `FilaGestion`, `CierreDetalleIncidente`, `CierreBodegaDetalleGestiones`,
  `CierreDiaModule` y `CierresAdminPagoMensajero` hay hoy.

**Hecho:** gate verde registrado en la bitácora.

## T1 — Labels y visor nuevo · R54, R137, R138, R139 · depende de T0

- [ ] `components/private/cierres/dialogos/dialogos-labels.ts` con `VISOR_EVIDENCIA_TEXTO`,
  `contextoEvidencia`, `descripcionVisor`, `etiquetaVerEvidencia` y `RESUMEN_SOLICITUD_TEXTO`
  (`design.md > Contratos`).
- [ ] `components/private/cierres/dialogos/VisorEvidencia.tsx` con `EvidenciaAbierta` y el visor sobre
  `Modal`; «Anterior» y «Siguiente» en el cuerpo, bajo la foto, solo con n > 1.
- [ ] `tests/components/VisorEvidencia.test.tsx` (nuevo), con URL de muestra escritas a mano:
  - n = 3 abre en la foto 1: `img` con `src` de la 1.ª URL, alt «Evidencia fotográfica de la gestión»,
    descripción «Orden REM-011 · Andrés Mora · foto 1 de 3», «Anterior» deshabilitado;
  - «Siguiente» ×2 → 3.ª URL, «foto 3 de 3», «Siguiente» deshabilitado; «Anterior» → «foto 2 de 3»;
  - cerrar y reabrir con otro objeto → vuelve a «foto 1 de 3»;
  - sin contexto → «Foto 1 de 3»;
  - n = 1 → sin «Anterior» ni «Siguiente», y el texto «foto 1 de 1» no aparece en el documento;
  - «Cerrar» llama a `onClose` (y Escape también).
- [ ] Se rompe a mano: quitar el `disabled` de «Siguiente» pone rojo el caso de la foto 3. Se anota en
  la bitácora y se deshace.

**Hecho:** test nuevo verde, con la mutación probada.

## T2 — Un botón con contador · R54, R138 · depende de T1

- [ ] `botones-evidencia.tsx`: un solo botón, `onVer(urls)`, texto «Ver evidencia» o «Ver evidencia
  (n)», `aria-label` con el sufijo si lo hay; fuera `conectorTotal` y el grupo.
- [ ] `FilaGestion.tsx` (privada), `GestionesCierre.tsx` y la `FilaGestion` de `cierre-factura.tsx`:
  `onVerEvidencia(e: EvidenciaAbierta)` con `contexto` = «Orden <remisión> · <destinatario>».
- [ ] Tests:
  - `CierreEvidenciasVarias486.test.tsx`: se reescriben los casos de varias fotos. Con 3 fotos hay
    **un** botón de nombre «Ver evidencia (3) de la orden …» y `onVerEvidencia` recibe
    `{ urls: [URL_1, URL_2, URL_3], contexto: "Orden … · …" }`; con 1 foto, el nombre de hoy; con 0,
    ningún botón. Se conserva lo que vigilaba la 486: las URL firmadas y su orden.
  - `FilaGestion.test.tsx`: l.336 espera el objeto, y l.376-377 pasan a un botón «Ver evidencia (2) …».
  - `CierreDetalleIncidente.test.tsx`: el tipo del `onVerEvidencia` de `montar` (l.129).

**Hecho:** typecheck verde; los tests citados, verdes con literales.

## T3 — Las tres pantallas usan el visor nuevo · R53, R137 · depende de T2

- [ ] `CierresAdminModule.tsx`: estado `EvidenciaAbierta | null`; el `Modal` en línea de l.1692 se
  sustituye por `<VisorEvidencia>`.
- [ ] `CierresBodegaAdminModule.tsx`: ídem (l.228, l.560), con el visor nuevo.
- [ ] `CierreDiaModule.tsx`: ídem (l.1088) y `columnaEvidencia` con el `contexto` de la fila.
- [ ] `cierre-detalle-shared.tsx`: se borra `VisorEvidencia` (l.1303-1335); Grep para comprobar que no
  queda ningún import.
- [ ] `tests/unit/guards/cierres-dialogos-modal.guardia.test.ts` (nueva): las cuatro comprobaciones de
  `design.md > Guardia estructural`, con control positivo y contraprueba. Se rompe a mano: volver a
  poner `title="Evidencia de la gestión"` en `CierreDiaModule.tsx` la pone en rojo; se deshace.
- [ ] `CierreBodegaDetalleGestiones.test.tsx`: el caso R12 (l.509) sigue verde y comprueba además la
  descripción «Orden REM-N1 · Nora Novedad» del visor (R137 en la pantalla de bodega).

**Hecho:** guardia verde con la mutación probada; `vitest related` de los tres módulos, verde.

## T4 — Resumen al solicitar el cierre del día · R55, R140 · [P] con T2-T3 · depende de T1

- [ ] `CierreDiaModule.tsx`: cuerpo del `Modal` «Solicitar cierre del día» con el `<dl>` de
  `design.md > Resumen`.
- [ ] `tests/components/CierreDiaModule.test.tsx`: un caso nuevo con un fixture de 3 entregas y 1
  rechazada (4 filas), `totales.general = "285275.00"` y `totalPagoMensajero = "45000.55"`. Abre
  «Solicitar cierre» y lee del diálogo, en este orden: «Gestiones» «4», «Recaudado» y el importe
  escrito a mano en la forma de `money()` («₡285.275,00» si es la del país del fixture), «Tu ganancia»
  «₡45.000,55». Se rompe a mano: cambiar `totales.general` por `totales.efectivo` lo pone rojo.

**Hecho:** caso verde con la mutación probada.

## T5 — Sin saldo del mensajero · R57, R141 · [P] con T1-T4 · depende de T0

- [ ] `pago-mensajero-labels.ts`: clave `sinSaldo` con el texto aprobado (PA2).
- [ ] `RegistrarPagoMensajeroDialog.tsx`: pasa `mensajeSinSaldo`.
- [ ] `tests/components/CierresAdminPagoMensajero.test.tsx`: la acción de registro responde
  `sin_saldo`; el diálogo muestra «Este mensajero no tiene ganancia pendiente de pago en este cierre,
  así que no hay nada que pagar.» (escrito a mano) y su texto no contiene «tienda». Se rompe a mano:
  quitar la prop pone rojo el caso («Esta tienda…»).

**Hecho:** caso verde con la mutación probada.

## T6 — Cierre de la rebanada · depende de T1-T5

- [ ] `./init.sh` en verde (guardias incluidas).
- [ ] E2E en local con base desechable: `e2e/cierres-admin.spec.ts`, `e2e/cierre-bodega-satelite.spec.ts`
  y `e2e/cierre-dia.spec.ts` (`docs/perfil-agentes.md > E2E en local antes del PR`).
- [ ] Tamaño del PR por debajo del 80 % (`scripts/tamano-pr.mjs`).
- [ ] Bitácora `progress/impl_SLT-103.md` con el mapa `R -> test` y las mutaciones probadas.
- [ ] Preview: Carlos valida el texto de sin saldo y los botones bajo la foto (no es un R; lo vigila el
  leader antes de promover).

**Hecho:** gate y E2E verdes; mapa de trazabilidad completo.

## Trazabilidad

| R | Test |
|---|---|
| R53 | `tests/unit/guards/cierres-dialogos-modal.guardia.test.ts` (sin `ui/dialog` fuera del marco del detalle) |
| R54 | `tests/components/CierreEvidenciasVarias486.test.tsx` (un botón «Ver evidencia (n)»); `tests/components/VisorEvidencia.test.tsx` (Anterior/Siguiente, «foto i de n») |
| R55 | `tests/components/CierreDiaModule.test.tsx` (resumen en «Solicitar cierre del día») |
| R57 | `tests/components/CierresAdminPagoMensajero.test.tsx` (sin saldo sin «tienda») |
| R137 | `tests/unit/guards/cierres-dialogos-modal.guardia.test.ts` (un solo visor); `tests/components/VisorEvidencia.test.tsx` (título, alt, Cerrar, Escape); `tests/components/CierreBodegaDetalleGestiones.test.tsx` (visor en bodega) |
| R138 | `tests/components/CierreEvidenciasVarias486.test.tsx` (1, n y 0 fotos); `tests/components/FilaGestion.test.tsx`; `tests/components/VisorEvidencia.test.tsx` (sin «foto 1 de 1») |
| R139 | `tests/components/VisorEvidencia.test.tsx` |
| R140 | `tests/components/CierreDiaModule.test.tsx` |
| R141 | `tests/components/CierresAdminPagoMensajero.test.tsx` (primera frase; la segunda va en SLT-133) |

## Archivos esperados

Producción (12):
- `components/private/cierres/dialogos/VisorEvidencia.tsx`
- `components/private/cierres/dialogos/dialogos-labels.ts`
- `app/(app)/cierres-admin/_components/botones-evidencia.tsx`
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`
- `app/(app)/cierres-admin/_components/cierre-factura.tsx`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `app/(app)/cierres-admin/_components/pago-mensajero-labels.ts`
- `app/(app)/cierres-admin/_components/RegistrarPagoMensajeroDialog.tsx`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `components/private/cierres/fila/FilaGestion.tsx`
- `components/private/cierres/fila/GestionesCierre.tsx`

Tests (8):
- `tests/components/VisorEvidencia.test.tsx`
- `tests/unit/guards/cierres-dialogos-modal.guardia.test.ts`
- `tests/components/CierreEvidenciasVarias486.test.tsx`
- `tests/components/FilaGestion.test.tsx`
- `tests/components/CierreDetalleIncidente.test.tsx`
- `tests/components/CierreBodegaDetalleGestiones.test.tsx`
- `tests/components/CierreDiaModule.test.tsx`
- `tests/components/CierresAdminPagoMensajero.test.tsx`

Total: 20 archivos, ~650 líneas (50 % de `gate.tamano_pr`). Choques previsibles con SLT-133 y SLT-134
(`CierresAdminModule.tsx`, `CierresBodegaAdminModule.tsx`, `CierreDiaModule.tsx`,
`pago-mensajero-labels.ts`, `CierreDiaModule.test.tsx`): son rebanadas de la misma S5 y van en serie.
