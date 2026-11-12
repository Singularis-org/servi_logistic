# review SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» — S10a

Reviewer, 2026-11-11. Rama `feature/SLT-108-cierre-dia-cola-unica`, HEAD revisado `ea61a865`
(diff `origin/dev...HEAD`, con el merge de `origin/dev` 7bedada3). Ruta: completa. Zona: frontend.
Fuera de esta revisión: la cola, los filtros y el pendiente de pago, que pasan a SLT-137 «/cierre-dia:
cola de cierres del mensajero con filtros».

Grafo: no se usó. El diseño ya anota que este worktree no tiene índice; todo con Grep/Read y git.

## Checklist

- [x] **Ruta.** Completa, con requirements, design y tasks. El diff no toca dinero en servidor,
  permisos, autenticación, integraciones ni webhooks: no hay `lib/`, `db/` ni `prisma/` en el diff.
- [x] **Tasks.** T0-T3 marcadas `[x]`. T4 es del leader.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 16/40 archivos y 946/1000 líneas. Da un aviso, no un
  rojo. No es hallazgo.
- [x] **`## Lo que ya existe`.** Presente y con contenido. El diff reutiliza `DetalleCierre`,
  `GestionesCierre`, `SeccionSinGestion`, `RechazosDeTiendaCierre`, `DescargarDatasetButton`,
  `columnaPago` y `GANANCIA_COL`. No re-crea nada de la lista.
- [x] **Trazabilidad.** Cada R tiene un test que lo verifica (tabla abajo). `progress/impl_SLT-108.md`
  trae el mapa R → test.
- [x] **Typecheck.** `pnpm run typecheck`: TC_EXIT=0.
- [x] **Lint.** ESLint de los 4 archivos de producción, el test nuevo y los 2 E2E: exit 0.
- [x] **Tests del diff.** Los 11 archivos de la trazabilidad, más `liquidacion-money-safe`: 277/277.
- [x] **Guardias.** `pnpm run test:guardias`: 343/344 archivos. Los 4 rojos están todos en
  `dependencias-declaradas-presentes.guardia.test.ts`, que figura en `tests/baseline-rojos.json`. Es
  un rojo heredado, no un hallazgo.
- [x] **E2E.** La bitácora deja constancia: `cierre-dia` 3/0, `dinero` 98/0, `mis-asignaciones` 4/0
  y humo 18/0, cada uno en su base desechable (perfil, reviewer punto 4). No los repetí: los corre
  el CI.
- [x] **Datos y seguridad.** Sin tablas, consultas ni migraciones nuevas. Sin literales de país o
  moneda en el código nuevo de producción. Sin Ordenex, sin secretos, sin `console.log`.
- [x] **Permisos y multi-empresa.** Sin cambios. `verCierrePasado` sigue acotando por mensajero.
- [x] **Dependencias.** Ninguna nueva.
- [x] **Comentarios.** Explican el porqué. Se reescribe el de la feature 158, «un incidente no se
  paga», como pide D8.
- [ ] **`./init.sh` y `gate-completo`.** El implementer reporta INIT_EXIT=0. Yo no corrí `init.sh`
  entero. El CI queda para el PR (leader).

## Trazabilidad verificada

| R | Test que lo verifica |
|---|---|
| R58 | `CierreDiaModuleIncidente.test.tsx`: «Ganancia» tras «Evidencia», ₡300. `cierre-dia-descarga-columnas.test.ts`: columna al final y `275.00` tal cual. `e2e/cierre-dia.spec.ts` (c). |
| R59 | `CierreDiaDetalleUnico.test.tsx`: «Ver» → `verCierrePasado({cierreId})` → `dialog` «Detalle del cierre · Tu cierre del día», nota de congelados, «Cerrar». `CierreDiaModule.test.tsx`. E2E mensajero A. |
| R71 | `liquidacion-money-safe.test.ts` (verde). `detalle-cierre-vista.test.ts`: `toEqual` con los strings del servidor. |
| R72 | El diff no toca `lib/`, `db/` ni Server Actions (comprobado con `git diff --name-only`). |
| R77 | `e2e/cierres-rediseno.spec.ts`: mensajero A (100.000 / 3 / 3.000, con método por método) y mensajero B (10.000 / 1 / 2.200), con negativos 3.500, 900 y 3.503. |
| R150 | `CierreDiaDetalleUnico.test.tsx`: folio, destino, ₡300 / 1 / ₡45, sin «Le queda», «Cobro a la tienda», ₡2.100 ni «Dinero». `detalle-cierre-vista.test.ts`: `toEqual` completo, con `solicitadoAt` y `resueltoAt`. |
| R151 | `CierreDiaDetalleUnico.test.tsx`: «Gestiones (1)» seleccionada, «Ganancia» ₡45, sin acciones de corrección, «Pasaron a Novedad interna» con 1 orden, «Rechazados por la tienda (0)» con su estado vacío. `cierre-detalle-superficies.guardia.test.ts`: `/cierre-dia` es una superficie del detalle único y `registrado` no se pasa como literal. |
| R152 | `detalle-cierre-descarga-columnas.test.ts` y `CierreDiaDetalleUnico.test.tsx`: las 7 columnas y la fila exacta. |
| R153 | `CierreDiaDetalleUnico.test.tsx`: los dos toasts, sin `dialog`. `CierreDiaModule.test.tsx`. |
| R154 | `CierreDiaDetalleUnico.test.tsx`: visor «Evidencia de la gestión» con `src` = URL firmada. `CierreEvidenciasVarias486.test.tsx`: «Ver evidencia (3)» desde la fila única. |
| R161 | `impresion-flujo.guardia.test.ts` (caso gemelo del mensajero). `cierre-detalle-superficies.guardia.test.ts`: cero montajes, con autocomprobación sobre `DetalleCierre`. |
| R162 | `CierreDiaModuleIncidente.test.tsx`: `null` → «—». `cierre-dia-descarga-columnas.test.ts`: `null` → `null`. |

## Comprobaciones pedidas por el leader

### 1. «Ganancia» de un incidente = «₡0» en el E2E

- **Es un contrato, no una copia del sistema.** La regla del modelo viejo está escrita en
  `specs/158-incidente-indemnizacion/design.md:345`: «Un `incidente` no paga al mensajero (R17)». La
  repite `specs/234-descarga-cierres-general-y-detallada/design.md:466`. `pagoPorResultado` solo
  paga `entregado`, y lo fija `tests/unit/utils/incidente-no-mueve-dinero.test.ts:37`. El ₡0 del E2E
  se deriva de esa regla. Pega: la cabecera del E2E cita el código y no el spec (m1).
- **Un incidente sí puede llevar ganancia: en el modelo nuevo.** SLT-52 creó el concepto
  `mensajero_incidente` (`lib/tarifas/catalogo.ts:47`; `specs/SLT-52-tarifas-flexibles-modelo/design.md:55`).
  `importePagoNuevo` (`lib/utils/pago-mensajero.ts:27-35`) paga ese valor, y la pantalla de Tarifas
  deja configurarlo.
  - En pantalla, el paso del valor al usuario está probado con un importe distinto de cero:
    `pagoMensajero: "300.00"` → `₡300` en `CierreDiaModuleIncidente.test.tsx`. Eso mata una columna
    que pinte siempre ₡0.
  - Ningún test prueba de extremo a extremo un incidente del modelo nuevo con ganancia mayor que
    cero. Tampoco a nivel de función pura: `tests/unit/utils/pago-modelo-nuevo.test.ts:44` usa
    `"0.00"` justo para `incidente`.
  - Es un hueco de `lib/`, fuera del alcance de esta ficha, que es solo de pantalla. Hallazgo m2.

### 2. `CierreDiaDetalleUnico.test.tsx`: de 359 a 212 líneas

Comparé las aserciones del commit 3ee14b1a con las de HEAD:
- se fusionaron casos (R59 con R150, y R151 con R152);
- se quitó `lecturaOk()` repetido;
- `expect(d).toBeDefined()` pasa a `d?.…toEqual(…)`, que falla igual si `d` no existe.

La única aserción que desaparece es `within(panel).queryByText("Cobro a la tienda")`. No se pierde
cobertura: el negativo sobre el diálogo entero («no pinta … Cobro a la tienda») la incluye. Ningún R
pierde test.

### 3. Mutaciones reaplicadas

| # | Mutación | Resultado |
|---|---|---|
| 1 | `audiencia="central"` en el `<DetalleCierre>` de `CierreDiaModule.tsx` | ROJO: 7 de 9 en `CierreDiaDetalleUnico.test.tsx` («Unable to find role="dialog" and name "Detalle del cierre · Tu cierre del día"») |
| 7 | `empresa: { ingresoBodega: c.totalIngresoBodegaRechazos }` en `vistaMensajeroDesdeCierreDia` | ROJO: 2 en `detalle-cierre-vista.test.ts` (el `toEqual` y el negativo de «3503.00») |

Las dos revertidas con `git checkout --`; `git status` quedó limpio. Con la mutación 7,
`CierreDiaDetalleUnico.test.tsx` sigue verde porque `DetalleCierre` con audiencia mensajero no pinta
`empresa`. La defensa vive en el adaptador, y ahí está el test que se pone rojo. Aceptable.

### 4. Fila del detalle sin la marca «La tienda» ni el motivo (S3-PA6)

Coincide con la decisión:
- `specs/SLT-101-fila-gestion-unica/requirements.md:48-51` y `:212` (R87 retirado): la cabecera
  desplegada lleva solo Orden, Producto y Dirección, sin motivo, causa, origen ni la marca «La tienda».
- `requirements.md` de SLT-108, fila S3-PA6: «Rige también para el mensajero».

`CierreDiaComprobanteMarcasDeOrigen.test.tsx`:
- conserva un control de no-vacuidad («Caja mediana», que solo existe con la fila desplegada);
- afirma que no está la marca, que no está la cadena cruda del cron y que sí está «Vuelve a bodega»;
- deja intacta la mitad en vivo, que sigue llevando la marca.

### 5. Visor de evidencia de SLT-103 «Diálogos del módulo de cierres y trato tú»

`GestionesCierre` recibe `onVerEvidencia={setEvidencia}`, el mismo `setEvidencia` del
`<VisorEvidencia>` único de `/cierre-dia` (SLT-103 R137). Lo prueban R154 en
`CierreDiaDetalleUnico.test.tsx`, con la URL firmada en el `src`, y `CierreEvidenciasVarias486.test.tsx`.

## Hallazgos

Ningún BLOQUEANTE.

- **m1 — menor.** La cabecera de `e2e/cierre-dia.spec.ts` (c) justifica el «₡0» con el código
  (`pagoPorResultado`) y con «medido en la base». Debería citar la regla escrita,
  `specs/158-incidente-indemnizacion/design.md:345` (R17), y decir que vale para el modelo viejo de
  la tarifa del E2E.
- **m2 — menor (deuda, fuera de alcance).** No hay prueba de que un incidente del modelo nuevo con
  `mensajero_incidente` mayor que cero llegue como «Ganancia» distinta de cero a «Incidente» de
  `/cierre-dia`. Ni E2E, ni test de servicio, ni test de función pura: `pago-modelo-nuevo.test.ts:44`
  usa `"0.00"` para `incidente`.
  - Propuesta: anotarlo como deuda.
  - Lo mínimo: cambiar ese caso por un importe distinto de cero escrito a mano.
  - Lo ideal: un E2E con tarifa nueva e incidente pagado.
- **m3 — menor.** R150 pide en la cabecera la fecha de solicitud y la de resolución. Ni el test de
  componente ni el E2E afirman esas fechas en pantalla. Las cubre el `toEqual` del adaptador
  (`solicitadoAt`, `resueltoAt`) y el render es el de `DetalleCierre` de SLT-95. Basta con añadir
  una aserción de fecha en `CierreDiaDetalleUnico.test.tsx`.
- **m4 — menor.** `tasks.md` pide «un commit por task», y la rama agrupa T1-T3 en 3 commits
  (feat, test, test+E2E). No afecta al resultado.

## Veredicto

**OK**: 0 bloqueantes, 4 menores.
