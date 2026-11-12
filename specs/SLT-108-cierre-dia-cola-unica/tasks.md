# SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» — tasks (v3, S10a)

> **Zona:** frontend (`frontend_dev`). Un commit por task.
>
> **Antes de empezar** (memorias «Worktree sin .env = gate ciego» y «vitest related toca la base
> local»):
> - copia `.env` al worktree antes del primer gate;
> - exporta la base desechable antes de cualquier `vitest`.
>
> **Tamaño:** 16 archivos (40 % de 40) y ~650-760 líneas, un ~70 % del tope de 1 000. Reparto
> estimado (añadidas + borradas):
>
> | Bloque | Líneas |
> |---|---|
> | `CierreDiaModule.tsx` | ~150 (quita ~75 del modal, pone ~60; Incidente ~15) |
> | Adaptador | ~50 |
> | Descargas | ~35 |
> | `CierreDiaDetalleUnico.test.tsx` | ~170 |
> | Tests adaptados | ~170 |
> | Guardias | ~25 |
> | E2E | ~90 |

## T0 — Comprobaciones previas (sin código de producción)

- [ ] **T0.1** Actualiza la rama desde `origin/dev`, que ya trae el PR #131 de SLT-103 «Diálogos del
  módulo de cierres y trato tú» (`git fetch` + merge; comprueba el `merge-base`). Lee cómo quedó la
  API de evidencia en `GestionesCierre` y el visor de `CierreDiaModule`.
  **Hecho:** el SHA de `origin/dev` y la firma de `onVerEvidencia` anotados en
  `progress/features/SLT-108.md`.
- [ ] **T0.2** Repite el censo de `design.md > Tests y guardias que cambian` con `grep -rl` en
  `tests/` y `e2e/`. Busca:
  - «Comprobante detallado de tu cierre»;
  - «Ver del cierre»;
  - «Este cierre ya no está disponible»;
  - `verCierrePasado`;
  - `<CierreFacturaDetalle`;
  - `COLUMNAS_DESCARGA_DIA_INCIDENTES`.

  **Hecho:** la lista coincide con `## Archivos esperados`, o el leader tiene el archivo de más.
- [ ] **T0.3** Mide una vez, en la base desechable, el `pagoMensajero` que la vista del día da a un
  incidente con la tarifa de `e2e/cierre-dia.spec.ts` (1 700 / 300). Escríbelo a mano, con su
  derivación, en la cabecera del E2E.
- [ ] **T0.4** Corre `pnpm run test:guardias` en limpio. **Hecho:** las guardias verdes de partida,
  anotadas.

## T1 — Lógica pura (depende de T0) [P entre T1.1 y T1.2]

- [ ] **T1.1** `detalle-cierre-vista.ts`: `vistaMensajeroDesdeCierreDia`. Test en
  `tests/unit/utils/detalle-cierre-vista.test.ts`, con un cierre de 2 entregadas y 1 rechazo:
  - `empresa: null`;
  - los conteos de ese cierre;
  - destino «Bodega central»;
  - folio en mayúsculas.

  **Hecho:** el test se pone rojo si el adaptador copia `empresa`.
- [ ] **T1.2** Descargas:
  - `detalle-cierre-descarga-columnas.ts`: `COLUMNAS_DESCARGA_DETALLE_MENSAJERO` y
    `filaDescargaDetalleMensajero`.
    - Test en `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`: claves y encabezados,
      sin `cobroTienda`.
  - `cierre-dia-descarga-columnas.ts`: «Ganancia» al final de Incidentes.
    - Test en `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts`: «Ganancia» presente, y
      `null` → `null`.

## T2 — Montaje en `/cierre-dia` (depende de T1)

- [ ] **T2.1** `CierreDiaModule.tsx` (R59, R150-R154, R161):
  - el `Modal` del cierre pasado pasa a `DetalleCierre`, montado como en `design.md`;
  - «Ver» queda deshabilitado mientras carga;
  - los errores van por toast;
  - se quita `CierreFacturaDetalle`;
  - la tira «Cierres solicitados» no se toca.
- [ ] **T2.2** `CierreDiaModule.tsx` (R58, R162):
  - `columnaPago` en la rama `incidente`, entre la evidencia y las acciones;
  - se reescribe el comentario de la 158.
- [ ] **T2.3** `tests/components/CierreDiaDetalleUnico.test.tsx` (nuevo). Monta `CierreDiaModule`,
  que es el composition root. Debe comprobar:
  - «Ver» → `verCierrePasado({ cierreId })` → `dialog` «Detalle del cierre · Tu cierre del día»;
  - las cifras «Recaudado» ₡300, «Gestiones» 1 y «Tu ganancia» ₡45;
  - que no aparecen «Le queda a la empresa», «Cobro a la tienda» ni ₡2.100;
  - las pestañas «Gestiones 1» y «Rechazados por la tienda 0», con su estado vacío;
  - la fila con «Ganancia» y la sección «Novedad interna» con su marca;
  - la nota de montos congelados;
  - «Descargar» con las columnas del mensajero;
  - los dos toasts de R153, sin `dialog`;
  - la evidencia (R154) y «Cerrar».

  **Hecho:** verde. Se pone rojo con cada una de estas mutaciones:
  - audiencia `"central"`;
  - `SeccionSinGestion` sin montar;
  - el toast de `no_encontrada` cambiado por el genérico.
- [ ] **T2.4** Tests adaptados:
  - `CierreDiaModule.test.tsx`: los dos casos del «Ver».
  - `CierreDiaModuleIncidente.test.tsx`:
    - «Ganancia» de un incidente con `pagoMensajero: "300.00"` → `₡300`, literal escrito a mano;
    - `null` → «—»;
    - se conservan los negativos de «Indemnización», «Monto» y «Método».
  - `CierreDiaComprobanteMarcasDeOrigen.test.tsx` y `CierreEvidenciasVarias486.test.tsx`: la mitad
    del cierre pasado.
- [ ] **T2.5** Guardias:
  - `cierre-detalle-superficies.guardia.test.ts`: cero montajes del comprobante y la superficie
    nueva del detalle único;
  - `impresion-flujo.guardia.test.ts`: el caso del módulo del mensajero.

  **Hecho:** `pnpm run test:guardias` verde, y las dos guardias se ponen rojas si se vuelve a montar
  `<CierreFacturaDetalle` en `CierreDiaModule.tsx`.
- [ ] **T2.6** `./init.sh` verde, con el tamaño medido y anotado.

## T3 — E2E (depende de T2)

- [ ] **T3.1** `e2e/cierre-dia.spec.ts`, caso nuevo: un incidente gestionado → la sección
  «Incidente» enseña «Ganancia» con el literal de T0.3.
- [ ] **T3.2** `e2e/cierres-rediseno.spec.ts`: el mensajero del escenario A abre su cierre desde la
  tira de `/cierre-dia` y lee las cifras de `design.md > Verificación`. Lo mismo con el escenario B
  (R77).
- [ ] **T3.3** En local, con base desechable y `NEXT_PUBLIC_APP_URL` como en `gate.yml`, corre:
  - `cierre-dia.spec.ts`;
  - `cierres-rediseno.spec.ts`;
  - lo que dé `grep -rl "cierre-dia" e2e/`.

  **Hecho:** verde sin reintentos.

## T4 — Cierre (leader)

- [ ] `./init.sh` verde.
- [ ] Review OK antes del PR; PR a `dev`.
- [ ] Preview con Carlos: el detalle del cierre pasado y «Ganancia» en Incidente.

## Trazabilidad

| R | Test |
|---|---|
| R58 | `tests/components/CierreDiaModuleIncidente.test.tsx`; `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts`; `e2e/cierre-dia.spec.ts` (incidente) |
| R59 | `tests/components/CierreDiaDetalleUnico.test.tsx`; `e2e/cierres-rediseno.spec.ts` (mensajero A) |
| R71 | `tests/unit/guards/liquidacion-money-safe.test.ts` (censa `detalle/`); `tests/unit/utils/detalle-cierre-vista.test.ts` (el adaptador devuelve los strings del servidor) |
| R72 | reviewer: el diff no toca `lib/`, `db/` ni Server Actions; guardias de dinero en verde |
| R77 | `e2e/cierres-rediseno.spec.ts` (mensajero, escenarios A y B) |
| R150 | `tests/components/CierreDiaDetalleUnico.test.tsx`; `tests/unit/utils/detalle-cierre-vista.test.ts` |
| R151 | `tests/components/CierreDiaDetalleUnico.test.tsx`; `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts` |
| R152 | `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`; `tests/components/CierreDiaDetalleUnico.test.tsx` |
| R153 | `tests/components/CierreDiaDetalleUnico.test.tsx`; `tests/components/CierreDiaModule.test.tsx` |
| R154 | `tests/components/CierreDiaDetalleUnico.test.tsx`; `tests/components/CierreEvidenciasVarias486.test.tsx` |
| R161 | `tests/unit/guards/impresion-flujo.guardia.test.ts`; `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts` |
| R162 | `tests/components/CierreDiaModuleIncidente.test.tsx`; `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts` |

## Archivos esperados

Producción:
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas.ts`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `components/private/cierres/detalle/detalle-cierre-descarga-columnas.ts`

Test nuevo:
- `tests/components/CierreDiaDetalleUnico.test.tsx`

Tests adaptados o ampliados:
- `tests/components/CierreDiaModule.test.tsx`
- `tests/components/CierreDiaModuleIncidente.test.tsx`
- `tests/components/CierreDiaComprobanteMarcasDeOrigen.test.tsx`
- `tests/components/CierreEvidenciasVarias486.test.tsx`
- `tests/unit/utils/detalle-cierre-vista.test.ts`
- `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts`
- `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`
- `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts`
- `tests/unit/guards/impresion-flujo.guardia.test.ts`

E2E:
- `e2e/cierre-dia.spec.ts`
- `e2e/cierres-rediseno.spec.ts`

Total: 16 archivos.
