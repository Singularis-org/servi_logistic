# Review — SLT-197 «Retirar paquetes de una bodega satélite a la central»

Reviewer, 2026-11-17. Ruta completa, fullstack. Worktree en `d38a0be7` (ya con `origin/dev` = `b9e886b3`).
Diff propio: `git diff origin/dev...HEAD` (39 archivos, 33 cuentan). El grafo no indexa este
worktree: todo con Grep/Read.

## Veredicto: OK

Sin hallazgos mayores. 4 menores, ninguno bloquea el PR.

## Checklist

- [x] **Ruta.** Completa, como pide el diff (transición de estado, permisos e historial). Spec aprobado por Carlos.
- [x] **Spec.** `requirements.md` (R970-R986 en EARS, D1-D9 cerradas), `design.md` y `tasks.md`.
  `design.md > ## Lo que ya existe` está completa, y el diff no re-crea nada de esa lista: reutiliza
  la recepción #37, «Rutear a bodega satélite», `Modal`, `ManifiestoResultado` y el choke point.
- [~] **Tasks.** 26/27 en `[x]`; falta T9.1, la de cierre (menor m1).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 33/40 archivos, 448/1000 líneas de producción y
  1474/3000 de tests. Da aviso, pero no pasa del máximo y no hace falta la línea de aceptación. Se
  justifica: 15 de producción y docs, y el resto son tests nuevos (unit, integración, componentes
  y E2E). Además hubo que actualizar 7 tests por contrato: recuentos de aristas y de puntos, dobles de
  `IOrdenRepository` y el censo de escrituras.
- [x] **Trazabilidad.** R970-R986: cada uno tiene un test que lo verifica (abajo).
- [x] **Typecheck.** `pnpm run typecheck` → exit 0.
- [x] **Lint** de los 17 archivos tocados: exit 0, 0 errores. El único warning es previo
  (`IOrdenRepository.ts:11`).
- [x] **Tests relacionados.** 12 archivos con la base desechable `servi_slt197g_desechable`:
  356/356, sin saltados.
- [x] **Guardias** (`pnpm run test:guardias`): 355/356. El rojo es
  `dependencias-declaradas-presentes.guardia.test.ts`, que ya está en `tests/baseline-rojos.json:56`.
  No es un hallazgo.
- [x] **E2E en local tras el merge.** `next build` nuevo con `servi_slt197e_desechable`,
  `--retries=0`:
  - `retiro-satelite-central` + `recepcion-satelite` + `asignacion-satelite` → 5 passed;
  - `dos-empresas-humo` → 18 passed.
- [x] **`./init.sh`** (rápido, base desechable): ver «Gate local» al final.
- [x] **Datos y seguridad.** Sin tablas, sin migración y sin literales de país o moneda en el código
  nuevo. El `sinpeNumero` aparece solo en la siembra del test, como en las demás suites. Ningún
  recurso de Ordenex y ningún `console.log`.
- [x] **Capas.** Las capas van como deben: repo (`retirarSateliteLote`) → service
  (`retirarABodegaCentral`) → Server Action con zod en el borde (`retirarSateliteSchema`).
- [x] **Permisos.** El servidor decide el rol (`esAccesoTotal` en el service, antes de leer nada). La
  pantalla solo oculta la acción (`accionesLote` = `esAccesoTotal(rol)` en `app/(app)/ordenes/page.tsx:104`).
- [x] **D8.** Sin cambios en `docs/api/`, `lib/api/` ni en el código de webhooks. El webhook genérico
  del choke point sigue como estaba (aceptado en D8).
- [x] **Sin `@sin-superficie`** en `retirarABodegaCentral`. Lo que aparece en
  `lib/actions/ordenes-guia.ts:304` es un comentario previo, ajeno a este cambio.
- [x] **Fuera de lista, justificados.**
  - `specs/456-tooltip-estados/textos-aprobados.md`: cambia solo la fila de «En ruta a bodega
    central» al texto de D7, con su línea de enmienda (la lee `descripcion-estado.test.ts`).
  - `playwright.config.ts`: +1 entrada en `reparto`, que exige `e2e-sin-saltos`.

## Lo verificado en detalle

**Dominio.**
- `lib/types/order-status-transiciones.ts:184` añade **una** arista:
  `en_bodega_satelite -> en_ruta_bodega_central`, `ajuste_estado`, `maestro/admin`.
- El diff de ese archivo es de +4/-0: no se abre ninguna otra.
- Los recuentos dicen lo mismo:
  - inventario: 59 → 60 aristas, 54 → 55 pares (`tests/fixtures/inventario-transiciones-140.ts`);
  - caracterización: lista literal de 60.
- El bloque R970 de la guardia:
  - afirma las salidas enumeradas de `en_bodega_satelite`;
  - afirma que `en_bodega_satelite -> en_bodega_central` sigue ilegal;
  - afirma que tampoco hay vuelta `en_ruta_bodega_central -> en_bodega_satelite` (D6).

**Repositorio** (`lib/repositories/OrdenRepository.ts:4127-4172`).
- El `WHERE` es el mismo en la lectura y en el `updateMany`: `id IN` ∧ `deletedAt: null` ∧
  `estatus.value = en_bodega_satelite`.
- Si alguno de los dos conteos no da `n`, lanza una excepción interna y la transacción se revierte:
  devuelve `"conflicto"` sin filas cambiadas ni historial.
- Deja vacíos `mensajeroAsignadoId`, `asignadoAt` y `fechaReparto`. `zonaId`, la tienda, la guía, la
  remisión y el monto no salen en `data`.
- La empresa la ponen `lib/db/extension-empresa.ts`, que inyecta `organizacion_id` en el `where` de
  `findMany` y `updateMany`, y la RLS. Mismo patrón que `rutearBodegaSateliteLote`.
- El historial pasa por `appendCambioEstado`. Ahí `validarTransiciones` exige la arista #73, así que
  una arista mal declarada revienta antes de escribir.

**Mapa de puntos.**
- `#36 retirarSateliteLote / ajuste_estado` está en `PUNTOS_DE_ESCRITURA`: 31 → 32.
- `ajuste_estado` está en `FAMILIAS_CON_VARIOS_PUNTOS` con 2 puntos.
- `orden-historial-cobertura.test.ts` en verde y las guardias en verde.
- La desviación respecto a `tasks.md` (decía #35; el #35 ya existía) está anotada en
  `progress/impl_SLT-197.md`.

**Dinero (D2) y efectos colaterales del cambio de estado.**
- El choke point dispara tres cosas:
  - el webhook genérico (D8);
  - `emisorNotificacionReal`, que es un no-op (`lib/notificaciones/emitir.ts:235`);
  - `emitirBienvenidaRecogida`, que filtra por `origenTipo === recoleccion`. Con `ajuste_estado`, el
    retiro **no** encola un segundo WhatsApp de bienvenida al cliente.
- Para la recolección en tienda (#43) también llega a `en_ruta_bodega_central`. La recepción central
  (`RecepcionBodegaCentralService.ts:28-39`) decide el destino **solo por el estado de origen**:
  - pasa a `en_bodega_central` con `liberaAsignacion: true`;
  - no mira de dónde vino ni toca dinero (`OrdenRepository.recibirEnBodegaCentral`, 4599-4640).
  - Para la orden retirada, que ya viene sin mensajero, el efecto es el mismo y correcto.
- `DevolucionSlaService` parte siempre de `novedad`, así que el retiro no le afecta. El deshacer de
  `CierreDiaService` mira `en_bodega_satelite` y, con la orden ya retirada, se niega; esa es la
  dirección segura.
- R983 lo mide la integración: cuenta 16 tablas de dinero y cierres antes y después del retiro y de la
  recepción.
- Efecto colateral sin cambio de regla: `en_ruta_bodega_central` y `en_bodega_central` están en
  `ESTADOS_ELIMINABLES`. La orden retirada vuelve a poder eliminarse, siempre que tenga 0 intentos,
  igual que antes de rutearla a la satélite. Es coherente con la decisión del 2026-09-04: moverla
  entre bodegas es logística, no un intento. No es un hallazgo.

**Recepción y después.**
- La integración «R977/R978/R979/R983» recorre el flujo con el repo real:
  1. retiro;
  2. el listado de la satélite ya no la muestra, ni en tránsito ni recibida, con control positivo
     previo;
  3. `RecepcionBodegaCentralService` → `en_bodega_central` con la zona intacta;
  4. «Asignar mensajero» de la central → conflicto «orden de zona no-GAM»;
  5. «Rutear a bodega satélite» → ok;
  6. historial de las tres transiciones con su familia.
- El E2E repite el recorrido en pantalla.

**Pantalla.**
- `accionesDe` (`OrdenesListado.tsx`) añade `case "en_bodega_satelite"`, detrás de la puerta
  `accionesLote` (solo maestro y admin).
- `RetirarACentralModal` reutiliza `Modal` y `ManifiestoResultado flujo="retiro_satelite"` con el
  molde de `RutearSateliteModal`.
- El conflicto se muestra por orden con motivos de usuario («ya no existe», «ya no está en bodega
  satélite», «cambió de estado mientras se retiraba»), sin el valor interno del estado.
- La ayuda (`docs/ayuda/oficina`, `satelite` y `publico`) sigue el voseo de los docs existentes.

**Mutaciones propias** (revertidas con `git checkout -- <archivo>`; `git status` limpio tras cada una).

| # | Mutación | Test | Resultado |
|---|---|---|---|
| R1 | `WHERE` del repo: `estatus.value IN (en_bodega_satelite, mensajero_recogiendo_en_bodega)` (ampliar el origen) | `retiro-satelite-central.int.test.ts` | **rojo** 2/6 («R973/R974 …mensajero_recogiendo», «R974 carrera») |
| R2 | Service: saltar la comprobación de estado de origen (`if (false && …)`) | `guia-asignacion-retiro-satelite.test.ts` + int | **rojo** 2 (R973 detalle, R970 `en_bodega_central`) |
| R3 | Repo: no limpiar `mensajeroAsignadoId` en el retiro | `retiro-satelite-central.int.test.ts` | **rojo** 1/6 («R971/R972/R985») |

Sumadas a las 4 del implementer (M1-M4: estado, `deletedAt`, `id IN` y comprobación de conteo), la
siembra propia de la integración muerde.

## Trazabilidad R → test

| R | Test | ¿Verifica? |
|---|---|---|
| R970 | `tests/unit/domain/order-status-transiciones.guardia.test.ts` (bloque SLT-197 R970) + inventario/caracterización (60) | sí |
| R971 | `tests/integration/db/retiro-satelite-central.int.test.ts` «R971/R972/R985» (estado + historial origen/destino/actor/familia) + unit | sí |
| R972 | ídem (columnas antes/después, mensajero/asignadoAt/fechaReparto nulos; mutación R3 la mata) | sí |
| R973 | int «R973/R974 …mensajero_recogiendo» y «R973 …BORRADA» + unit «R973» | sí |
| R974 | int «R974: la satelite asigna…» (cambio entre la lectura del service y la escritura) | sí |
| R975 | `tests/unit/services/guia-asignacion-retiro-satelite.test.ts` (adminSatelite, adminTienda, mensajero) + `ordenes-guia-action.test.ts` | sí |
| R976 | `tests/integration/actions/ordenes-guia-action.test.ts` (sin sesión, `[]`, no lista, no string, sin campo) | sí |
| R977 | int «R977/R978/R979/R983» | sí |
| R978 | ídem (asignar → conflicto; rutear → ok) | sí |
| R979 | ídem (control positivo + ausencia en tránsito y recibida) | sí |
| R980 | `tests/components/OrdenesRetirarACentral.test.tsx` (maestro/admin sí; adminTienda no; no en `en_bodega_central` ni `en_ruta_bodega_central`) + E2E | sí |
| R981 | `tests/components/RetirarACentralModal.test.tsx` (5 casos) + E2E | sí |
| R982 | `tests/unit/services/manifiesto-service.test.ts` «SLT-197 R982» | sí |
| R983 | int «R977/R978/R979/R983» (16 tablas antes/después) | sí |
| R984 | `tests/unit/types/order-status.test.ts` (literal escrito a mano) + `descripcion-estado.test.ts` | sí |
| R985 | int «R971/R972/R985» (dos zonas, cada una conserva la suya) + unit + componente | sí |
| R986 | int «R986» (en tránsito y recibida se mueven; la del estante se retiene: 1) | sí |

## Hallazgos

### Mayores
Ninguno.

### Menores

- **m1 · menor — T9.1 sin marcar.**
  - Dónde: `specs/SLT-197-retirar-satelite-a-central/tasks.md:106`.
  - Qué pasa: es la tarea de cierre (`./init.sh`, guardias, mapa R → test). El mapa ya está en
    `progress/impl_SLT-197.md` y yo corrí el gate (ver abajo).
  - Qué falta: marcarla antes del PR.
- **m2 · menor — Botones del diálogo de 32 px.**
  - Dónde: `components/shared/Modal.tsx:278-296` usa el `Button` por defecto, que mide `h-8`
    (`components/ui/button.tsx:108-109`).
  - Qué pasa: Confirmar y Cancelar de `RetirarACentralModal` quedan en 32 px en móvil, no en 44 px.
    Viene del `Modal` compartido: `RutearSateliteModal` y los demás diálogos de `/ordenes` miden lo
    mismo, y no hay regla escrita de 44 px en `docs/`.
  - Por qué no bloquea: no es una regresión de esta ficha, y arreglarlo aquí sería tocar un componente
    compartido. Si se quiere, va como deuda aparte.
- **m3 · menor — Motivos de conflicto atados al texto del servidor.**
  - Dónde: `app/(app)/ordenes/_components/RetirarACentralModal.tsx:30-35`. `motivoDeRetiro` reconoce los
    motivos por el prefijo del texto que emite `GuiaAsignacionService.retirarABodegaCentral`.
  - Qué pasa: si el texto del servidor cambia, el diálogo cae a «no admite el retiro». La degradación es
    segura, pero ningún test une las dos puntas: el de componente usa los literales a mano.
  - Qué haría falta: un código de motivo tipado resolvería el acople, pero es un patrón que ya existe en
    el módulo y no se reabre aquí.
- **m4 · menor — Sin test de integración con dos empresas sobre `retirarSateliteLote`.**
  - Qué pasa: `docs/checkpoints-proyecto.md > Datos y seguridad` pide ese test para cada query nueva. La
    query nueva es Prisma (`findMany` y `updateMany` sobre `orden`), y la acota
    `lib/db/extension-empresa.ts` + RLS, igual que todos sus hermanos del repositorio, que tampoco tienen
    un test por empresa propio.
  - Lo que corrí: `e2e/dos-empresas-humo.spec.ts` tras el merge, 18/18.
  - Lo que no hay: un caso en `retiro-satelite-central.int.test.ts` con una orden de otra empresa en el
    lote, que tendría que salir «conflicto». Lo anoto; no lo exijo.

## Gate local

`./init.sh` (rápido), con `DATABASE_URL` en la desechable `servi_slt197g_desechable`: **`INIT_EXIT=0`**.
- Typecheck, lint, guardias, validador y perfil en verde.
- Selección rápida: 100 archivos, 1573 passed y 1 skipped. Otro bloque: 63 archivos, 810 passed.
- 152 rojos heredados del baseline fuera de la selección.
- La suite completa queda para el check `gate-completo` del PR.
