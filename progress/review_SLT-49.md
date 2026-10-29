# SLT-49 «Impresión de etiquetas por lote para la tienda» — revisión

Reviewer, 2026-10-28. Rama `feature/SLT-49-etiquetas-lote-tienda`, HEAD revisado `00e94aa6`, base `origin/dev` (`3bc855f6`).
MCP de grafo: no usado (el worktree no está indexado según `design.md`); se usó Grep/Read.

## Veredicto: APROBADO (OK)

Sin bloqueantes. Dos hallazgos menores, abajo.

## Checklist

### Especificación
- [x] `requirements.md` con R1–R15 en EARS; P1 y P2 resueltas por el humano en su opción por defecto (`progress/features/SLT-49.md`, bitácora T5).
- [x] `design.md` abre con `## Lo que ya existe` (6 filas: SLT-50, spec 32, spec 136, FICHA 358/424, `EtiquetaOrdenAccion`). El diff no re-crea nada de esa lista: reutiliza action, service, modal y PDF; copia el patrón de `resolverAlcanceBorradoOrden` en una función nueva (`alcance-etiquetas-orden.ts`), que es otra regla, como dice el diseño.
- [x] `design.md §6 Alternativas descartadas`.
- [x] `tasks.md`: 22 `[x]`, ninguna `[ ]`.

### Equipo
- [x] Assignee y rama publicada (`progress/features/SLT-49.md`, commit `9f3fa466`).

### Trazabilidad
- [x] `progress/impl_SLT-49.md` trae el mapa R→test (T9). Tabla verificada abajo.

### Calidad de código (corrido por mí)
- [x] `pnpm run typecheck` → `TC_EXIT=0`.
- [x] `eslint` sobre los 15 `.ts/.tsx` del diff → 0 errores (1 warning en `IOrdenRepository.ts:11`, línea no tocada, previo).
- [x] Tests relacionados (7 archivos: integración, alcance, service, repo guía, listado, página, cadena) con `DATABASE_URL` local → `Test Files 7 passed`, `Tests 102 passed`, 0 skipped.
- [x] Guardias (`tests/unit/guards`): único rojo `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json:51` y no lo toca el diff (no hay `init.sh` ni `scripts/` en él). No es hallazgo.
- [ ] `gate-completo` en CI: pendiente del PR (no es de esta revisión).
- [x] Flujo crítico: no toca ninguno de la lista; aun así hay E2E (R3) y el implementer corrió `dos-empresas-humo` en verde. No re-corrí el E2E (lo corre el CI).
- [x] Sin dependencias nuevas (no cambia `package.json`).

### Seguridad / datos / arquitectura
- [x] Sin secretos, sin `console.log`, sin «Ordenex», sin migraciones ni tablas nuevas.
- [x] Sin literales de país/moneda en código de la app. `sinpeNumero`/`sinpeNombre` aparecen solo en el fixture de integración (`etiquetas-frontera-tienda.test.ts:142-143`) porque la columna de `zona` es obligatoria; no es código nuevo de producto.
- [x] Las queries modificadas siguen bajo la extensión `organizacion_id` + RLS; la frontera nueva (tienda) va EN el `where` (`OrdenRepository.ts:4002` y `:4020`).
- [x] Autorización en el servidor: `EtiquetaGuiaService` deriva el alcance de `resolverAlcanceEtiquetasOrden` y pasa `tiendaId` al repo; segunda capa `esVisiblePara` sobre el mismo alcance. Los únicos llamadores de producción de `findEtiquetasByIds`/`findEtiquetaByNumGuia` son ese service (Grep).
- [x] Capas: regla pura en `lib/services/`, acceso a datos en `lib/repositories/`, página solo lee la regla.
- [x] Comentarios explican el porqué.

## Verificaciones pedidas por el leader

1. **Integración contra Postgres, sin `return` silencioso.** Leído entero: sin base → `describe.skip` (no verde); con base y sin catálogo → `throw` en `beforeAll`; ningún caso tiene `return` temprano. Cada caso trae control positivo (sin frontera se leen las dos; la guía propia sí resuelve), así que un `[]` por otra causa no pasa. Corrido: `6 passed`, 0 skipped.
2. **Mutaciones del `WHERE` (hechas por mí, en secuencia, sin gate en paralelo):**
   - Quitar `tiendaId` del `where` de `findEtiquetasByIds` → `× R10 (a)` `AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ]`, `1 failed | 5 passed`. Revertido.
   - Quitar `tiendaId` del `where` de `findEtiquetaByNumGuia` → `× R10 (b)` `AssertionError: expected { …(15) } to be null`, `1 failed | 5 passed`. Revertido.
   - `git status --porcelain` vacío tras revertir.
3. **Contrato de `etiqueta-guia-service.test.ts`.** El cambio es explícito y comentado: `ADMIN_TIENDA` sale de los bucles «cualquier rol» y su nuevo comportamiento se afirma en un bloque propio con literales (`"u-tienda"`, `"tienda-1"`, `null`, `[{ ordenId: "ajena", motivo: "no_encontrada" }]`). Ninguna aserción compara contra la función que la produce. `adminSatelite` se AÑADE a los bucles de R11/R12. No hay sustitución de literal por su fuente.
4. **R12/R13 sin regresión.** `resolverAlcanceEtiquetasOrden` da `todas` a mensajero/adminSatelite y `propias` a `apiKey` con `ownerId = usuarioId` (mismo dueño que antes). Unit: repo llamado con `null` para maestro/admin/mensajero/adminSatelite y con `"tienda-1"` para la key; casos de la feature 136 intactos y verdes; segunda capa también para la key.
5. **Matiz R5.** Ver hallazgo M1.

## Tabla R → test (verificada leyendo el test)

L = `tests/components/OrdenesListado.etiquetas-tienda.test.tsx`, P = `tests/components/OrdenesPage.test.tsx`, C = `tests/components/OrdenesListadoEtiquetasChain.test.tsx`, U = `tests/unit/services/etiqueta-guia-service.test.ts`, A = `tests/unit/services/alcance-etiquetas-orden.test.ts`, I = `tests/integration/db/etiquetas-frontera-tienda.test.ts`, E = `e2e/etiquetas-lote-tienda.spec.ts`.

| R | Test | ¿Lo verifica de verdad? |
|---|---|---|
| R1 | L «R1 — la tienda puede marcar sus órdenes con guía en los 3 estados» | Sí: casilla presente en los 3 estados |
| R2 | L «R2 — … sin conteo», «R2 — … «Imprimir etiquetas (1)»» | Sí: nombre exacto del botón en ambos casos |
| R3 | E «marca 2 órdenes, ve 2 etiquetas … y descarga un PDF (R3)» + L «R3 (parcial)» | Sí: 2 `article`, descarga `.pdf`, `failure()` null; L afirma `ordenIds: ["a","c"]` |
| R4 | L «R4 — la barra de la tienda no trae ninguna otra acción de flujo» | Sí: lista EXACTA de botones `["Imprimir etiquetas","Eliminar","Limpiar"]` |
| R5 | L «R5 — una orden de recogida SIN guía no se marca y el «!» dice «Sin guía todavía»» | Sí (con la página mixta; ver M1) |
| R6 | L «R6 — si ninguna marcada …», «R6/R5 — …» | Sí: barra `["Eliminar","Limpiar"]` |
| R7 | I «R7 (c)» (service + repo reales) + U «R7: lote mixto» | Sí |
| R8 | I «R8 (d)» + U «R8» | Sí |
| R9 | I «R9 (e)» con control de guía propia + U «R9» | Sí (service → `no_encontrada`; la página `/paquete` ya mapea eso a 404, sin cambio) |
| R10 | I «R10 (a)», «R10 (b)» (repo saltándose el service) | Sí: mis dos mutaciones del `where` los ponen en rojo |
| R11 | I «R11 (f)» + U + A | Sí |
| R12 | A «R12» + U «R11/R12 … NO se filtran» y «… repo llamado con `null`» | Sí |
| R13 | A «R13» + U feature 136 + «R13: … `tiendaId`» + «R13 segunda capa» | Sí |
| R14 | A (tabla rol→alcance) + P «R14 ×3» (incluye el caso en que la regla dice `todas` para la tienda y la prop cae) + service usa la misma función | Sí: la página no repite lista de roles |
| R15 | L «R15 — el maestro … `en_bodega_central` y el modal abre» + C (sin cambios, encadenado tras generar guía / asignar) | Sí (ver M2) |

## Hallazgos

- **M1 — menor.** `app/(app)/ordenes/_components/OrdenesListado.tsx:1239-1241` (`haySeleccionables`). Si TODA la página son órdenes de recogida sin guía y ninguna es eliminable, la columna de casillas no se monta y «Sin guía todavía» no se ve. R5 dice «bloquear su casilla y mostrar el motivo»: en ese caso no hay casilla que marcar (el efecto de bloqueo se cumple) pero falta el motivo. No lo juzgo bloqueante: es la regla previa de la pantalla («no casillas que no lleven a ningún botón», que `design.md:158` adopta tal cual), el caso es raro (según P1 estas órdenes nacen con guía, feature 155) y en cualquier página mixta el motivo sí sale (test L «R5»). El comportamiento queda fijado en L «R6/R5». Si el humano quiere el motivo también ahí, es una ficha aparte o un ajuste de R5; anotarlo en la ficha.
- **M2 — menor.** R15 nombra 5 estados; el test nuevo de componente solo ejercita `en_bodega_central` para el maestro. Los otros 4 descansan en que `accionesDe` no cambió (diff verificado: intacto) y en los tests previos del listado. Aceptable; no hace falta acción.

## Fuera de esta revisión
- `gate-completo` del CI en el PR y `## Cierre` de `progress/features/SLT-49.md`: pasos del leader.
