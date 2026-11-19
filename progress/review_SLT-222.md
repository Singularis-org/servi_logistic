# Review SLT-222 «Tablas de órdenes: la selección se mantiene entre búsquedas y escaneos»

Reviewer, 2026-11-19. Ruta **ligera** (spec único `specs/SLT-222-seleccion-entre-busquedas/requirements.md`,
R1500-R1514, D6-D8 aprobadas por Carlos). Rama `feature/SLT-222-seleccion-entre-busquedas`, HEAD
revisado `1e72cda9` (PR #248 a `dev`).

## Veredicto: APROBADO

0 bloqueantes, 3 menores.

## Checklist

- [x] **Ruta.** Ligera es válida: solo cliente (`app/(app)/ordenes`, `app/(app)/recepcion-satelite`).
  La única llamada al servidor que cambia es `listarIdsVigentesBodega({ ids })`, con menos
  parámetros; la action sigue resolviendo el actor de la sesión y validando con zod
  (`lib/actions/recepcion-satelite.ts:238`). Sin dinero, permisos, autenticación, integraciones ni
  esquema.
- [x] **Lo que ya existe.** La sección está y es concreta (R60/144, R38/169, R47/170, R19/R25/R27/188).
  El diff no re-crea nada: reutiliza `SelectAllCheckbox`, `CeldaSeleccion`, `Button`, la señal
  `resetSeleccion` y el modelo `Map id -> fila` de `OrdenesModule`.
- [x] **Tasks.** T1-T5 marcadas `[x]` (ver m1 sobre el texto de T4).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 17/40 archivos, 403/1000 de producción, 1304/3000 de tests.
- [x] **Trazabilidad.** Las 15 R (R1500-R1514) tienen test con nombre `R15xx` y mapa en
  `progress/impl_SLT-222.md`. Comprobado con mutaciones (abajo) que los centrales fallan si se
  quita el comportamiento.
- [x] **Tests de specs anteriores reescritos, no borrados.** Número de `it(` antes → después en
  `origin/dev...HEAD`: `ordenes-module-busqueda` 15→15, `ordenes-module-filter-key` 9→9,
  `ordenes-module` 10→10, `SateliteSeleccionOtrasPaginas` 9→9, `SatelitePaginacion` 12→12,
  `SateliteOrdenesListado.gestion-pendiente` 5→5, `recuperar-orden.ui` 12→13. Los specs 144, 170 y
  188 llevan la nota «Sustituido por SLT-222 R15xx» sin borrar el texto.
- [x] **«Eliminadas» sigue vaciando** (R1511): `OrdenesListado.tsx:1087-1091` sube `resetSeleccion`
  al cambiar el valor derivado `verEliminadas`; test en `recuperar-orden.ui.test.tsx` (mutación M5).
- [x] **Acciones en lote filtran por estado sobre la selección acumulada.** `/ordenes`:
  `seleccionadas = filasSeleccionadas(seleccion, items)` (visibles frescas + guardadas) entra en
  `acciones(seleccionadas)` → `accionesPara`, que sigue acotando por `estatusValue` y poniendo
  «(N)»; las filas guardadas se refrescan cuando el servidor las devuelve (R1509, mutación M7).
  Satélite: `hayEstado` y el estado común se calculan sobre TODAS las marcadas (test «R1505: el
  estado común se mira sobre TODAS…»: una en bodega fuera de vista + una por devolver ⇒ botones
  deshabilitados; mutación M3) y con la fila refrescada (mutación M8). El riesgo de una fila
  guardada vieja que el servidor rechaza ya existía y está acotado en el spec; el servidor revalida.
- [x] **Typecheck:** `pnpm run typecheck` → `TC=0`.
- [x] **Lint** de los 10 archivos de código/test del diff → `LINT=0`.
- [x] **Tests del diff** (11 archivos, base desechable exportada aunque son de componente sin base):
  `Test Files 11 passed (11) · Tests 140 passed (140)`.
- [x] **CI en el PR #248 (head `1e72cda9`)**: `estatico`, `e2e (reparto)`, `e2e (aislamiento)` y
  `e2e (dinero)` en verde. El log del job `e2e (reparto)` muestra `54 passed`, incluidos
  `seleccion-entre-busquedas.spec.ts:59` (/ordenes) y `:80` (satélite) y `recepcion-satelite.spec.ts`.
  Los `vitest` shards seguían en curso al cerrar esta review: el leader no da «listo para mergear»
  sin `gate-completo` verde.
- [x] **Checkpoints del proyecto:** sin tablas, queries, migraciones, literales de país/moneda,
  recursos de Ordenex, dependencias nuevas ni secretos. Flujo crítico tocado (asignación satélite):
  hay E2E que lo recorre (`e2e/seleccion-entre-busquedas.spec.ts` abre «Asignar» con 2 órdenes).
- [x] **Comentarios** explican el porqué (D4, D5, D6, R1514) sin repetir el qué.

## Mutaciones (todas revertidas con `git checkout`; árbol limpio al terminar)

| # | Mutación | Resultado |
|---|---|---|
| M1 | `/ordenes`: volver a `setSeleccion(new Map())` al cambiar `filterKey` | 12 rojos (R1500-R1506, R38/R60 reescritos) |
| M2 | Satélite: `emitir()` vuelve a vaciar | 11 rojos |
| M3 | Satélite: la acción vuelve a ser solo la página visible (`ordenes.filter(...)`) | 19 rojos (R1505, R1503 en `SateliteSeleccionOtrasPaginas`) |
| M4 | Satélite: la poda vuelve a preguntar con `{ ...filtro, ids }` | 11 rojos (incluido «R1514» y «R19 + SLT-222 R1514») |
| M5 | «Eliminadas» ya no sube `resetSeleccion` | 1 rojo: «SLT-222 R1511» |
| M6 | «Recibir paquete» vuelve a `revalidarTablas()` (vacía) | 1 rojo: «R1510» |
| M7 | `/ordenes` sin refresco de la fila guardada | 1 rojo: «R1509» |
| M8 | Satélite sin refresco de la fila guardada | 1 rojo: «R1509» |
| M9 | `/ordenes`: la barra vuelve a depender de la página visible | 7 rojos (R1506 ×3, R1513, R1509…) |
| M10 | Satélite ignora `resetSeleccion` | 1 rojo: «R1508» |

## Desvíos declarados por el implementer

1. **`seleccion-acumulada.ts` nuevo** — ACEPTADO. Cuatro funciones puras que hacen cumplir D2
   (mismo modelo y mismo texto en las dos tablas) sin copiar código; vive en
   `ordenes/_components`, de donde la satélite ya importaba (`CambiarDiaRepartoModal`, `HistorialOrdenSheet`).
2. **Satélite vacía solo si al menos una orden salió bien** («Enviar a central», «Recuperar») —
   ACEPTADO: R1508 habla de «termine con éxito»; con fallo total lo marcado queda para reintentar.
   Ver m2 sobre el éxito parcial.
3. **Contador de la satélite conserva el sufijo de estado** — ACEPTADO: contiene literal el texto
   de D8 («N seleccionadas · M fuera de esta búsqueda») y mantiene la información que ya daba
   (estado común / mezclados), que ahora además explica por qué los botones están deshabilitados.
4. **La barra de `/ordenes` sale sin acciones aplicables** — ACEPTADO: lo exige R1506 (la barra
   con el total y «Limpiar» mientras haya algo marcado, aunque la vista no tenga filas
   seleccionables); si no, lo marcado fuera de la vista no se podría quitar.
5. **Registro del E2E en `playwright.config.ts`, proyecto `reparto`** — ACEPTADO: lo exige la
   guardia `e2e-sin-saltos`, y el CI lo corrió en ese proyecto (verde).
6. **Borrado de un `console.log` en `recuperar-orden.ui.test.tsx`** — ACEPTADO: era depuración
   olvidada (`BOTONES:`) en un archivo que ya estaba en «Archivos esperados»; sin efecto en el test.

## Hallazgos

- **m1 (menor) — E2E no corrido en local y T4 marcada con un «Hecho» que no se cumplió.**
  `docs/perfil-agentes.md > reviewer` pide constancia de los E2E afectados corridos en local para
  un PR que toca pantallas, y T4 dice «*Hecho:* verde en local» mientras su nota de estado y la
  bitácora dicen «NO corrido en local». No lo marco bloqueante porque la constancia existe y es más
  fuerte que la local: el CI del PR, sobre el MISMO head `1e72cda9`, pasó `e2e (reparto)` (54
  passed, con los dos casos de `seleccion-entre-busquedas.spec.ts` y `recepcion-satelite.spec.ts`),
  `e2e (aislamiento)` y `e2e (dinero)`; el propósito de la regla (no gastar rondas de CI) ya no
  aplica. Falta: corregir el texto de T4 para que diga dónde quedó el verde (CI del PR #248), y no
  repetirlo como costumbre.
- **m2 (menor) — Éxito parcial en la satélite.** Con «Enviar a central» o «Recuperar» parcialmente
  fallidos (`enviadas > 0` y `errores.length > 0`), `vaciarSeleccion()` desmarca también las que
  fallaron, así que para reintentarlas hay que volver a buscarlas. Cumple R1508 tal como está
  escrito y es lo que ya hace `/ordenes` con `handleSuccess`; se anota por si Carlos lo nota en
  Preview, no pide cambio en esta ficha.
- **m3 (menor) — R1508 en la satélite probado solo con «Enviar a central».** Los otros cuatro
  caminos (asignar, deshacer, cambiar día, recuperar) llaman a `vaciarSeleccion()` en una línea cada
  uno (`RecepcionSateliteModule.tsx:384, 408, 428, 452`) sin test propio. El mecanismo
  (`resetSeleccion` → desmarca todo) sí está cubierto (M10). Deuda menor de cobertura.

## Notas

- El gate local cae en el validador de features por SLT-224 (otra ficha en vuelo sin spec), ajeno
  a esta rama; no se trata como hallazgo. Typecheck, lint y tests del diff se corrieron a mano.
- MCP del grafo no usado: la revisión se hizo sobre el diff con Grep/Read.
