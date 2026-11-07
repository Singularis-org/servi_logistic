# Revisión SLT-91 «Mi plan solo para el maestro»

Rama `feature/SLT-91-mi-plan-solo-maestro`, HEAD revisado `72b8696c`, base `origin/dev` `7f374d4b` (sin atraso). Grafo: sin
proyecto para este worktree; exploré con `git grep`, Grep y Read.

## Veredicto: OK

Sin bloqueantes. Tres hallazgos menores. `./init.sh` no lo corrí yo, y `gate-completo`, `Cierre` y desmontar el worktree son
posteriores al PR.

## Ejecutado por mí

Base `servi_gate_slt91r`, nueva, con `migrate deploy` y `db:seed`; host local comprobado con booleano. `DATABASE_URL` y
`DIRECT_URL` exportadas en cada comando. Borrada al terminar (`existe: false`). Un primer `db:seed` falló porque la base aún
no existía; no tocó nada y lo repetí tras crearla.

| Qué | Resultado |
|---|---|
| 15 archivos de vitest: los que nombra el mapa de R1 a R13, más `MiPlanModule` | 15 de 15 archivos, 249 de 249 tests, 0 saltos |
| `pnpm run typecheck` | exit 0 |
| `pnpm run lint` | exit 0, 0 errores, 244 avisos |
| `pnpm run test:guardias` | 333 de 334 archivos, 4 rojos. Todos en `dependencias-declaradas-presentes`, en `tests/baseline-rojos.json`: no es hallazgo. El `skipped` es 1, ajeno |
| `next build` con `NEXT_PUBLIC_APP_URL`, `APP_BASE_URL` y `SESSION_SECRET` de CI | exit 0. Rehízo el `.next` del worktree, que no se versiona |
| `playwright test e2e/planes-superadmin.spec.ts` | 18 passed. `/mi-plan` del `admin`: **404 HTTP**; del `mensajero`: 404 |
| Puertos 3000 y 54329 al terminar; `git status` | Libres; limpio antes de escribir este archivo |

**Solo leído, sin ejecutar:** `./init.sh`, `plan-topes-usuarios.test.ts`, `plan-de-la-empresa.test.ts`, `PlanEmpresa.test.tsx`
y `e2e/dos-empresas-humo.spec.ts`. Las mutaciones de la bitácora no las repetí: no edito código ni tests. Leí los tests que
matan y sus esperados son literales.

## Checklist

### Proceso
- [x] Trazabilidad: los 14 R tienen test que existe y corrió. R12 con matiz: m2.
- [x] Tasks: todas las de `tasks.md` en `[x]`.
- [x] `design.md` abre con `## Lo que ya existe`, y el diff no re-crea nada de su lista. 4 alternativas descartadas.
- [x] Mapa `R<n> -> test` en `progress/impl_SLT-91.md`, igual a la tabla de `requirements.md`.
- [x] Sin dependencias: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` no cambian. Sin migraciones: `db/` no cambia.
- [x] Flujos críticos: la feature no toca ninguno. Cambia una lista de roles de lectura; aun así, su E2E corrió aquí.
- [x] Sin secretos, sin URLs de entorno, sin webhooks nuevos. El `console.log` nuevo del E2E solo imprime el estado HTTP.
- [x] Reglas del perfil: sin tabla ni query nueva, sin literal de país o moneda en código nuevo, sin recursos de Ordenex.
- [x] Autorización en el servidor: `MiPlanService.ts:24`, antes del repositorio. Página: `notFound()` en `page.tsx:20`.
- [ ] `./init.sh` por mí: no lo corrí. La bitácora lo da verde; yo corrí sus partes por separado.
- [ ] `gate-completo`, `Cierre` de la ficha y desmontar el worktree: posteriores al PR, del leader.
- [ ] Assignee en el tracker y `wt.sh new`: no los verifiqué en Jira. La ficha local dice Carlos Restrepo.

### 1. Otras vías del `admin` a la vista o a los datos: ninguna
- **Ruta y lectura:** `verMiPlan` solo lo llama `mi-plan/page.tsx:19`, y `lib/actions/_shared/mi-plan.ts` no es Server Action, así que no se puede invocar desde el cliente. `plan_de_la_empresa` solo la llama `MiPlanRepository.ts:140`. Ningún `app/api/` lee el plan: solo el cron de jobs.
- **Enlaces y atajos:** `/mi-plan` solo está en `menu-visibility.ts:696`, `reparto.ts:49` (no es enlace) y el comentario de la página. Ni el correo, ni el dashboard, ni `public/`, ni `hooks/`. Los atajos del `admin` bajan de 16 a 15 y los demás roles no cambian (`pwa-manifiesto-atajos.guardia.test.ts`).
- **Ayuda:** `docs/ayuda` no nombra «Mi plan». `wallet-caja.md:176, 183` habla del costo por orden y de la deuda, que siguen (R12).
- **Marcas y cambio programado:** «Cerca del tope» y «Lleno» solo en `ConsumoDelPlan.tsx:59-60`, importado solo por `MiPlanModule.tsx` y `PlanEmpresa.tsx`. `AvisosDeTopes` solo se monta en `plataforma/`.
- **Textos en pantalla:** barrí `plan` en `app/` y `components/` fuera de `plataforma/` y `mi-plan/`. Solo queda la pista de la wallet, `wallet-labels.ts:128` («con plan porcentual»), y el texto del tope: los dos decididos (R12, R11).
- **Lecturas de plataforma:** los 14 métodos con actor de `PlanesService` empiezan con `esSuperadmin`, y `planes-service-lecturas.test.ts:205` recorre los roles de empresa, con `admin`. El historial sigue en `ROLES_HISTORIAL_ACCIONES`.
- **Correos:** el único destino es `rol: { value: "maestro" }` (`PlanesRepository.ts:1327`). `planes-cambio-correos.test.ts:175` compara con la lista de maestros, con un `admin` activo en la empresa (`:119`, `:183`).
- **Campana:** ningún valor de `NotificacionEvento` contiene `plan`.
- **E2E, con el `admin` real:** 404, «No encontramos esta página» y sin el nombre del plan en el HTML. El `/dashboard` pinta el menú (control `a[href="/configuracion/tarifas"]`) y no enlaza a la ruta.

### 2. El `maestro` no pierde nada: correcto
- La lista lo conserva, y el ítem sigue tras «Histórico» (`menu-historial-acciones.test.ts:178-180`). Sus 24 atajos y su aterrizaje no cambian.
- `integracion`: en la misma empresa, con el repositorio real como `servi_app`, `admin` en `forbidden` y `maestro` en `ok` con plan. El `maestro` es el control.
- E2E `:376`: el `maestro` de A ve nombre, topes y consumo.

### 3. Límites, cobro, wallet y módulos del `admin`: sin cambios
- La producción cambia una línea: `menu-visibility.ts:338`. El resto son comentarios. `ROLES_MI_PLAN` solo la leen el ítem y `MiPlanService`, ninguna regla de plan.
- Wallet: `DeudaPlataformaService` va por `esAccesoTotal`, ajeno a la lista (`deuda-plataforma-service.test.ts:87`).
- El menú del `admin` pierde solo «Mi plan» (`menu-visibility.test.ts:183`, lista exacta); su aterrizaje sigue en `/dashboard`.
- El tope al aprobar: `aprobacion-postulacion-tope-plan.test.ts`, con `admin` y el literal completo.

### 4. Superadmin: sin cambios
No estaba en la lista y sigue recibiendo `forbidden` en `/mi-plan` (`mi-plan-page.test.tsx`). `PlanEmpresa` y `PlanesService` no leen la constante.

### 5. Textos y enmiendas: coherentes
- `requirements.md` de SLT-58: líneas 12, 40, 47 (R8), 49, 129 y 168 marcadas. `design.md`: 38, 130, 180 y 184 marcadas, con nota arriba de los dos. Todo `admin` restante trata de topes o de `plan_uso_rol`, o es la nota de tests de `design.md:207`.
- `docs/architecture.md:251` correcto y es la única línea de `docs/` que nombra la ruta. D61 registrada, una sola vez.
- Excepción: el comentario de m1.

## Hallazgos

### Bloqueantes
Ninguno.

### Menores
- **m1. Comentario falso.** `lib/interfaces/services/IMiPlanService.ts:8` sigue diciendo «si no es `maestro` ni `admin` (R8)». `design.md §6` no lo listó y la búsqueda del implementer no lo vio. Una línea.
- **m2. El test nombrado para el conteo de R12 no lo prueba.** `tests/integration/db/mi-plan-repository.test.ts:115` afirma `admin: 0` en una empresa sin ningún `admin` activo (`:79-80`): con los usuarios del `admin` sin contar seguiría verde. La prueba real está en otros archivos: `plan-topes-usuarios.test.ts:245-246` y `planes-cambio-correos.test.ts:183`, que no están en el mapa. El SQL no cambia, así que el riesgo de esta feature es nulo; basta corregir el mapa de R12.
- **m3. La guardia no barre `hooks/`.** `mi-plan-solo-maestro.guardia.test.ts:15` cubre `app`, `components`, `lib` y `public`, como dice el spec, pero `hooks/` existe y es de la app. Hoy no contiene la ruta; un `router.push("/mi-plan")` ahí no lo vería.
