# SLT-69 «Escáner rechaza guías asignadas después de abrir la pantalla» — design

## Lo que ya existe

Buscado en `feature_list.json` (`recoger`, `escaner`, `refresc`, `lista vieja`, `volver a la app`),
en `specs/` (`visibilitychange`, `al volver a la app`, `lista vieja`) y en el código de `prod`
(`visibilitychange`, `addEventListener("focus"`, `router.refresh()`, `useRecogerPorGuia`,
`RecogerPaqueteCard`, `listarMisAsignaciones`):

- **Board:** solo la propia SLT-69. Nada duplicado.
- **Specs:** `specs/167-apartado-recoleccion-mensajero` (R12) ya resolvió el MISMO fallo en
  Recolección quitando el corte en cliente de `useRecolectarPorGuia`. Se reutiliza su diagnóstico,
  no su arreglo (ver alternativa A1). `specs/261-dia-reparto-protege` (R13) fija el rechazo por
  reserva que se conserva.
- **Código:**
  - `app/(app)/mis-asignaciones/_components/useRecogerPorGuia.ts` — el corte en cliente (líneas 50-53).
  - `app/(app)/mis-asignaciones/_components/RecogerModule.tsx:300` — único `router.refresh()`, tras éxito.
  - `lib/actions/mis-asignaciones.ts > listarMisAsignaciones` — Server Action YA exportada
    (`"use server"`), la misma que lee la página; devuelve `porRecoger: MiAsignacionDTO[]`. Se
    reutiliza tal cual para la relectura: sin contrato nuevo.
  - No existe en el repo ningún listener de `visibilitychange`/`focus`: el hook de R6-R8 es nuevo.
- **Recolección** (`app/(app)/recoleccion/_components/useRecolectarPorGuia.ts`): sin corte en
  cliente; no tiene este fallo. Fuera de alcance (requirements P1).

## Resumen

Dos cambios de cliente, sin tocar servidor ni base:

1. `useRecogerPorGuia`: en un fallo de búsqueda local, en vez de rechazar, llama UNA vez a
   `listarMisAsignaciones()`, busca la guía en el `porRecoger` devuelto y sigue el flujo de siempre
   con esa orden (reserva → toast de reserva; si no → `recogerAsignaciones`).
2. Hook nuevo `hooks/useRefrescarAlVolver.ts` (foco + visibilidad, con intervalo mínimo) que
   `RecogerModule` conecta a `router.refresh()`.

## Modelo de datos, autorización, migraciones, país

- Sin tablas, columnas, RLS ni migraciones nuevas.
- Autorización: sin cambios. `listarMisAsignaciones` resuelve el actor por sesión y el servicio
  exige rol `mensajero` (R12 de la 36) y filtra por el propio `usuarioId` en el repositorio
  existente. `recogerAsignaciones` sigue siendo la defensa real (R17 de la 36, R1/R4/R5 de la 261,
  R25 de la 111). Ningún módulo nuevo que encender.
- Multi-empresa (`organizacion_id`): no se escribe ninguna query nueva; se reutiliza la lectura
  existente.
- Datos que dependen del país: ninguno nuevo. Los textos de los toasts son los existentes.

## Contratos

### `useRecogerPorGuia(porRecoger)` — firma sin cambios

```ts
recoger(numGuia: number): Promise<boolean> // true solo en recogida exitosa
procesando: boolean
```

Flujo nuevo de `recoger(numGuia)`:

1. `if (procesando) return false` (sin cambios).
2. `orden = porRecoger.find(numGuia)`.
3. **Si no está** (antes: toast y `return false`):
   - `setProcesando(true)` ANTES de la relectura (R9: un segundo escaneo durante la relectura
     sale por el paso 1, y `EscanerGuiaCard` ya deshabilita controles con `procesando`).
   - `r = await listarMisAsignaciones()` dentro de `try`:
     - `r.status === "ok"` → `orden = r.porRecoger.find(numGuia)`; si sigue sin estar → toast
       «La guía `<n>` no está entre tus órdenes para recoger.» y `return false` (R3).
     - `r.status === "unauthenticated"` → toast «Tu sesión expiró. Inicia sesión de nuevo.» (R5).
     - cualquier otro estado (`error`, `forbidden`) o excepción → toast «No se pudo registrar la
       recogida. Intentá de nuevo.» (R5). La excepción NO se traga en silencio: se convierte en ese
       desenlace visible (`docs/conventions.md > Manejo de errores`), igual que la ficha 440 hizo
       con `error`.
   - Con la orden encontrada, se sigue por el paso 4 (sin volver a releer: un solo reintento, R1).
4. `orden.esParaManana` → toast de reserva con `avisoReservaParaOtroDia(orden.fechaRepartoISO)`
   (R4; el texto sale de la fuente única, no se redacta).
5. `recogerAsignaciones({ ordenIds: [orden.id] })` y el `switch` de toasts actual, intacto (R2, R10).
6. `finally { setProcesando(false) }` cubre también la relectura.

Toda la recogida (pasos 3-5) queda bajo UN `try/finally` para que `procesando` no se quede
colgado si la relectura lanza. Exactamente un toast por envío en todos los caminos (sin dobles).

`RecogerPaqueteCard` no cambia: ante `true` ya llama `onRecogida()` → `router.refresh()` y fija la
confirmación persistente; así la lista visible se pone al día tras recoger una guía «nueva» (R2).

### `hooks/useRefrescarAlVolver(alVolver, { intervaloMinimoMs = 30_000 })` — nuevo

- Registra en `useEffect` `document.addEventListener("visibilitychange")` y
  `window.addEventListener("focus")`; los retira en el cleanup (R8).
- Al dispararse: si `document.visibilityState !== "visible"` no hace nada (R8). Si no pasaron
  `intervaloMinimoMs` desde la última llamada (marca en `useRef`, `Date.now()`), no hace nada (R7).
  Si no, actualiza la marca y llama `alVolver()`.
- `alVolver` se guarda en un `useRef` para no re-suscribir en cada render.
- La marca arranca en el montaje (la página acaba de leer del servidor; un `focus` inmediato no
  relee).

`RecogerModule`: `useRefrescarAlVolver(() => router.refresh())` (R6). Se monta aunque el mensajero
esté bloqueado o la lista esté vacía: así una lista vacía al abrir trae la tarjeta de recogida en
cuanto vuelve a la app con órdenes nuevas, y un bloqueo resuelto se refleja (el `bloqueo` también lo
relee la página).

## Rutas / endpoints

Ninguna ruta nueva. Se reutiliza la Server Action `listarMisAsignaciones` (ya expuesta).
Coste: la relectura en un fallo es la misma lectura que la página (consultas a la base del propio
mensajero, sin servicios externos), una por guía no encontrada; el refresco al volver queda acotado
a una cada 30 s.

## Riesgos conocidos

- En móvil, el diálogo de permiso de cámara puede provocar `blur`/`focus`; con el intervalo mínimo
  eso produce como mucho una relectura. `router.refresh()` conserva el estado de cliente (no cierra
  el modal), salvo que la lista quede vacía, caso en el que la tarjeta se oculta como hoy.
- La lista visible no cambia tras una relectura por fallo que termina en rechazo (R3/R4): no se
  añade `router.refresh()` ahí para no ampliar el hotfix.

## Alternativas descartadas

- **A1. Quitar el corte en cliente, como la 167 hizo en Recolección** (llamar siempre al servidor
  con el `num_guia`). Descartada: `recogerAsignaciones` recibe `ordenIds` (UUID), no `num_guia`; haría
  falta una action o un esquema nuevo en el servidor, lo que contradice D4 (servidor sin cambios) y
  agranda el hotfix. Además perdería el rechazo local por reserva con su fecha (261/R13) para el
  caso común.
- **A2. Usar `router.refresh()` en el fallo y reintentar.** Descartada: `router.refresh()` no
  devuelve una promesa con los datos; no hay forma fiable de esperar a las props nuevas dentro del
  `recoger` en curso (habría que reintentar en un efecto, con estado pendiente y riesgo de doble
  toast).
- **A3. Polling periódico de la lista.** Descartada: el humano pidió refresco al volver a la app, no
  periódico; añade carga constante sobre la pantalla más usada del portal.
- **A4. SWR (`revalidateOnFocus`).** Descartada: el módulo es server-driven por props +
  `router.refresh()` (`lib/actions/ruta-mensajero.ts` lo documenta) y SWR aquí está reservado a datos
  públicos (`docs/perfil-agentes.md > frontend_dev`). Cambiar el modelo de datos de la pantalla no
  cabe en un hotfix.

## Dependencias

Ninguna nueva.

## Tests

| R | Test | Archivo |
|---|---|---|
| R1, R2 | **Reproduce el bug** (DEBE fallar en el código actual): `porRecoger` sin la guía 34991060; `listarMisAsignaciones` mockeado devuelve `ok` con esa orden; `recoger(34991060)` → `true`, `recogerAsignaciones` llamado con su id, `listarMisAsignaciones` llamado 1 vez, toast success «Guía 34991060 recogida.», ningún toast de error. | `tests/components/useRecogerPorGuia.test.tsx` |
| R2 | En `RecogerPaqueteCard` con la guía fuera de la lista y servidor que la tiene: enviar por teclado → `onRecogida` llamado 1 vez y aparece la confirmación «Guía 34991060 recogida correctamente.» | `tests/components/RecogerPaqueteCard.test.tsx` |
| R3 | Servidor tampoco la tiene → `false`, 1 solo `toast.error` con el texto literal, `recogerAsignaciones` no llamado, `listarMisAsignaciones` 1 vez. | `tests/components/useRecogerPorGuia.test.tsx` |
| R4 | Servidor la tiene con `esParaManana: true` → toast literal de reserva (fecha escrita a mano), `recogerAsignaciones` no llamado. | idem |
| R5 | Tres casos: `unauthenticated`, `error`, excepción → un solo toast con su literal, `recogerAsignaciones` no llamado, `procesando` vuelve a `false`. | idem |
| R6 | Disparar `visibilitychange` (visible) → `router.refresh` llamado. | `tests/components/RecogerModuleRefrescoAlVolver.test.tsx` |
| R7 | `visibilitychange` + `focus` seguidos → 1 llamada; otro a los 29 s → sigue 1; a los 30 s → 2 (fake timers). | `tests/components/useRefrescarAlVolver.test.tsx` |
| R8 | `visibilitychange` con `hidden` → 0 llamadas; tras `unmount`, `focus` → 0 llamadas. | idem |
| R9 | Relectura pendiente (promesa diferida): un segundo `recoger` → `false`, `listarMisAsignaciones` 1 vez, `recogerAsignaciones` 0 veces. | `tests/components/useRecogerPorGuia.test.tsx` |
| R10 | Guía en la lista cargada → `listarMisAsignaciones` NO llamado; `recogerAsignaciones` 1 vez; con `conflict` del servidor se pinta el toast de conflicto de siempre. | idem |
| R11 | `RecogerModule` con `bloqueo.bloqueado = true` → no hay botón «Recoger paquete»; el aviso de bloqueo sí. | `tests/components/RecogerModuleRefrescoAlVolver.test.tsx` |

Todos los datos de prueba son literales escritos a mano (guías, ids, textos); ninguna aserción
compara contra la función que genera el texto.

### E2E: diferido, con motivo

No se añade E2E. Reproducir el caso exige dos sesiones simultáneas (admin asigna mientras el
mensajero tiene la pantalla abierta) y control del foco del navegador; el fallo es 100 % de cliente y
lo reproducen los tests de hook/componente con el servidor mockeado (el test de R1 falla en el código
actual). No toca dinero ni escritura nueva. El PR a `prod` corre igualmente el E2E existente en CI
(`docs/gate.md`).
