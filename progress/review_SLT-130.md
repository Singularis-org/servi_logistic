# review SLT-130 «Planes: formulario por pasos compartido en un sheet (crear y editar)»

Vuelta 1, completa. Ruta completa, zona frontend. Rama `feature/SLT-130-planes-form-pasos` (HEAD `dd651580`),
PR #152 contra `dev`. Al día con `origin/dev` (`HEAD..origin/dev` vacío).

## Lo que corrí (2026-11-13, `NODE_OPTIONS=--max-old-space-size=8192`)
- `pnpm run typecheck`: 0 errores.
- `pnpm exec eslint <todos los .ts/.tsx del diff, e2e incluidos>`: exit 0, sin issues.
- `vitest run` de los 13 archivos de planes y del stepper (FormularioPorPasos, PlanFormPasos, PlanFormRevisar,
  plan-form-revision, PlanFormDescuentos, PlanForm, PlanFormVistaPreviaCustom, PlanFormCustomAsigna,
  PlanFormCosteo, PlanFormCostoPorcentual, PlanFormPeriodicidad, PlanesModule, PlanDetalle):
  `13 passed`, `165 passed`.
- `vitest related --run hooks/use-mobile.ts components/shared/FormularioPorPasos.tsx` (alcanza `components/ui/sidebar.tsx`
  y `Sidebar.test.tsx`): `87 passed`, `1307 passed | 17 skipped`.
- `node scripts/tamano-pr.mjs`: 32/40 archivos, 4 304/1 000 líneas; aceptado (`tamano-pr-aceptado` en
  `progress/features/SLT-130.md`).
- CI del PR (run 43474894170): `estatico`, los tres shards de vitest, `e2e (aislamiento)` (incluye
  `planes-superadmin` y `planes-costeo`), `e2e (dinero)` (incluye `planes-costo-porcentual`) y `e2e (reparto)` en
  verde. **`gate-completo` en rojo**: un archivo nuevo fuera del baseline,
  `tests/integration/db/migracion-slt139-ida-y-vuelta.test.ts` (ver B1).
- MCP del grafo: no usado (índice del worktree no confirmado); revisión con Grep/Read.

## Checklist

### CHECKPOINTS.md
- [x] Ruta: completa; frontend sin dinero nuevo, permisos ni integraciones. Respeta el suelo.
- [x] `requirements.md` con R1–R28 en EARS y Decisiones cerradas.
- [x] `design.md` con alternativas descartadas (§8 A–E) y su porqué.
- [ ] `tasks.md` todas `[x]`: **T10 y T11 siguen `[ ]`** (B2).
- [x] `design.md` abre con `## Lo que ya existe`; el diff no re-crea nada de la lista: reutiliza `useIsMobile`,
      la forma de ancho de `FormSheet.tsx`, `diferenciasDelPlan`/`cambiaElPrecio`, `textoDelPrecio`,
      `textoDelDescuento`, `SIN_LIMITE`, `textoDelCostoPorOrdenDelPlan`, `TEXTOS_TIPO_COBRO`; no toca
      `OrdenesCargaMasivaButton` ni usa `SegmentedToggle`; no reutiliza `lineasDeCambioDelPlan` (alternativa C).
- [x] Tamaño: fuera del máximo, con la aceptación humana escrita (desviación anotada en m3).
- [x] Equipo: assignee (Camilo) y rama publicada.
- [x] Trazabilidad: cada R1–R28 con test que lo verifica (tabla abajo).
- [x] `progress/impl_SLT-130.md` trae el mapa `R<n> -> test`.
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en verde: **rojo** (B1).
- [x] Flujo crítico: planes no está en `docs/checkpoints-proyecto.md > Flujos críticos` (decisión «E2E»).
- [x] Sin dependencias nuevas (`package.json` no cambia).
- [x] Sin secretos ni configuración por entorno hardcodeada.
- [ ] `./init.sh` rápido en verde en el worktree: no corrido (T11; ver B2).
- n/a `review_SLT-130.md` OK, Cierre de `progress/features`, desmontar worktree: posteriores a esta revisión.

### docs/checkpoints-proyecto.md
- [x] Sin tablas, migraciones, queries ni RLS nuevas (diff sin `db/`, `lib/`).
- [x] Ningún recurso de Ordenex; ningún literal de país o moneda nuevo (busqué colones, Costa Rica, SINPE, ₡, CRC
      en las líneas añadidas: nada). `mananaCalendarioCR` ya estaba en `PlanForm.tsx` de `dev`.
- [x] Ningún `console.log`; los `console.error` son los de hoy, sin PII.
- [x] Autorización: la de las actions, sin cambios. Validación: el mismo esquema zod de la action, importado.

### docs/perfil-agentes.md > reviewer
- [x] Sin `organizacion_id`/RLS/`down.sql` que exigir (sin datos).
- [x] Sin dependencia nueva.
- [x] Comentarios: explican el porqué (p. ej. `type="submit"` de «Siguiente», `key={i}` de las líneas, `style`
      del Sheet, `focoPendiente`).
- [ ] PR que toca pantallas: **sin constancia de E2E afectados corridos en local** (B2).

### Puntos que pidió el leader
- **«Siguiente» `type="submit"`** (design §4 decía `button`): correcto. Con un `button`, Enter en un paso con varios
  campos no envía el form y R19 no se cumpliría. `alEnviar` decide por paso; las `key` distintas (`final` /
  `siguiente`) evitan que el nodo de «Siguiente» se reutilice como botón final al pasar al último paso. R19 lo
  prueba con Enter en cuatro pasos y `enviar` sin llamar. Ver m1 (actualizar el design).
- **R8, R15, R17, R24, R26, R27 con casos previos adaptados**: es lo que dice su `Test:` en requirements.md
  («(adaptado) — sus casos de hoy»). Comprobé que los casos existen, navegan por los pasos y conservan sus
  aserciones de carga útil y de error. Válido.
- **Mismos componentes para crear y editar**: cumplido. Un solo `PlanForm`, un solo `FormularioPorPasos`, un
  componente por paso (`PasoGeneral`, `PasoPrecio`, `PasoCobroPorOrden`, `PasoTopes`, `PasoModulos`,
  `PasoCuandoRige`, `PasoRevisar`) con `PropsDelPaso` común; las diferencias van por `modo` dentro del paso
  (`editando` en General, `hoy` en Precio y Topes, filas en Revisar). `PasoCuandoRige` solo se monta al editar
  porque el paso solo existe al editar (R7), no es una variante. R6 lo prueba en los dos hosts con la misma
  `navigation «Pasos»`.
- **`hooks/use-mobile.ts`**: el cambio es aditivo (guarda `typeof window.matchMedia !== "function"` en
  `subscribe` y `getSnapshot`). Con `matchMedia`, el hook se comporta igual que antes. `Sidebar.test.tsx` y los
  demás usuarios del hook (wallet, analítica) pasan en el `vitest related` de arriba. No rompe el Sidebar.

## Trazabilidad R -> test (verificada leyendo los tests)

| R | Test | Verifica de verdad |
|---|---|---|
| R1–R5 | `components/FormularioPorPasos.test.tsx` «R1»…«R5» | sí: numeración, `aria-current`, «Paso 2 de 3», `data-orientacion` con prop, con `matchMedia` angosto y sin `matchMedia`, botón deshabilitado sin `onIr` |
| R6 | `PlanesModule.test.tsx`, `PlanDetalle.test.tsx` «R6» | sí: `maxWidth: none`, pasos de crear/editar, abre en General |
| R7 | `PlanFormPasos.test.tsx` «R7» ×2 | sí |
| R8 | `PlanFormCustomAsigna.test.tsx` (12 casos adaptados) | sí |
| R9 | `PlanFormPasos.test.tsx` «R9» | sí |
| R10–R13 | `PlanFormDescuentos.test.tsx` «R10» ×2, «R11» ×3, «R12» ×2, «R13» | sí: carga útil por período, valor conservado, primer libre, sin repetir, 4 líneas deshabilita, texto vacío, quitar |
| R14 | `PlanFormPasos.test.tsx` «R14: solo dos modos» + Costeo/CostoPorcentual/Periodicidad adaptados | sí |
| R15 | `PlanForm.test.tsx` «R14: envía a la action … topes …» | sí |
| R16 | `PlanFormPasos.test.tsx` «R16» ×2; unit «R16: textoDeHoy» | sí: aparece y desaparece con forma canónica, topes con «sin límite» |
| R17 | `PlanForm.test.tsx` «R15: De inmediato / A partir de / Programar cambio»; `PlanFormDescuentos.test.tsx` «Rige desde» al editar el precio | sí |
| R18 | `PlanFormPasos.test.tsx` «R18» ×2 | sí: no avanza, foco en Nombre; error de Topes no bloquea General pero sí Topes |
| R19 | «R19: Enter en un paso intermedio avanza y no guarda» | sí |
| R20 | «R20» | sí: Anterior y lista sin validar, valores conservados |
| R21 | «R21» | sí: no roba el foco al abrir; foco al h3 con Siguiente, Anterior y lista |
| R22, R23 | `PlanFormRevisar.test.tsx` «R22», «R23» ×2; unit `plan-form-revision.test.ts` | sí |
| R24 | `PlanForm.test.tsx` casos de carga útil y «en vuelo» | sí |
| R25 | `PlanFormPasos.test.tsx` «R25» ×2 | sí: va a Topes / General, error descrito y foco |
| R26 | `PlanForm.test.tsx` rechazos, fallo de red, foco al aviso | sí |
| R27 | `PlanFormVistaPreviaCustom.test.tsx` D13/D17 en Topes | sí |
| R28 | `PlanFormVistaPreviaCustom.test.tsx` «R28» | sí: deshabilitado, `aria-describedby` con el motivo en carga y en fallo, «Ir a Topes» lleva a Topes con «Reintentar» |

## Hallazgos

### B1 — BLOQUEANTE (merge): `gate-completo` en rojo por un archivo ajeno al diff
`tests/integration/db/migracion-slt139-ida-y-vuelta.test.ts` falla en el shard 2/3: «SLT-139 R337 — … van, en
orden, justo detras de la ultima migracion de dev medida en T1.2». El test fija
`ULTIMA_DE_DEV = "20261114120000_pago_independiente_efectivo"`, y `dev` ya tiene
`20261114120000_plan_cambio_por_empresa` (SLT-128, mergeado en `078191dc`). Es un rojo de `dev`, no de esta
ficha: el diff no toca `db/` ni `tests/integration/`. Aun así, nadie mergea con `gate-completo` en rojo
(regla 5). Qué hace falta: arreglarlo en una rama `chore/` sobre `dev` (lo más limpio: el test no debería fijar
la última de dev) o añadirlo a `tests/baseline-rojos.json` con motivo y fecha y decirlo en el PR
(`docs/gate.md > Rojos heredados`). Decide el humano/leader; no es trabajo del implementer de SLT-130. Los demás
PR abiertos contra `dev` se van a topar con el mismo rojo.

### B2 — BLOQUEANTE (proceso): T10 y T11 sin cerrar; sin constancia de E2E en local
- `tasks.md` tiene T10 («E2E de hoy adaptados» … corridos en local con constancia en `progress/impl_SLT-130.md`)
  y T11 (`./init.sh` en verde) en `[ ]`. CHECKPOINTS exige todas `[x]`.
- `docs/perfil-agentes.md > reviewer`: «PR que toca … pantallas … sin constancia de los E2E afectados corridos en
  local» es bloqueante. La bitácora dice explícitamente que no se corrieron (sin base desechable).
- Lo que lo cierra, sin tocar código: los tres specs ya pasaron en CI (`e2e (aislamiento)` con
  `planes-superadmin` y `planes-costeo`; `e2e (dinero)` con `planes-costo-porcentual`, run 43474894170). Necesita
  **decisión humana**: o se corren en local con una base desechable, o el humano acepta el E2E de CI como
  constancia y el gate-completo de CI en lugar de `./init.sh` local (la memoria del proyecto ya apunta a «gate en
  CI, no local» cuando el local muere por memoria). Con esa decisión, anotar en `progress/impl_SLT-130.md` el run de
  CI y la aceptación, y marcar T10 y T11 `[x]`.

### m1 — menor: el design no recoge la desviación de «Siguiente»
Design §4 sigue diciendo que «Anterior» y «Siguiente» son `type="button"`. El código hace bien en usar
`type="submit"` (R19), y la bitácora lo justifica, pero el spec queda desalineado para SLT-144, que parte de él.
Conviene corregir §4 (y §5 sobre quitar una línea, que también descarta sus errores; y §6, el parámetro
`escrito` de `filasDeRevision`).

### m2 — menor: T6 marcada `[x]` con un «Hecho» que no se comprobó
El «Hecho» de T6 pide comprobar en `pnpm dev` el ancho `min(920px, 100vw)`, los pasos al lado/arriba con < 768 px
y el pie fijo. No se hizo (sin navegador); los tests solo miden `maxWidth: none` y `data-orientacion`. Queda
como **revisión visual pendiente del humano** (lo dijo el leader). Los estilos se ven coherentes con el design:
`flex min-h-0 flex-1` en host, stepper y contenido con `overflow-y-auto` y pie `flex-none border-t`.

### m3 — menor (para que lo vea el humano): tamaño real muy por encima del estimado
Aceptado «~2 850 líneas»; el real es 4 304/1 000 líneas en el contador del gate (+4 668/−921 en `git diff
--stat`, 38 archivos con specs y bitácora). Un ~50 % más que lo estimado. Gran parte son tests (PlanFormPasos,
PlanFormRevisar, Descuentos reescrito, unitario) y la bitácora. No bloquea: la aceptación existe; se anota la
desviación.

### m4 — menor: `key={i}` en las líneas de descuento
Las líneas van por posición (con comentario del porqué: que el foco siga al cambiar de período). Al quitar una
línea del medio, el estado interno de `MontoInput` (`enfocado`) de la siguiente se reutiliza en otra línea. No
hay fallo visible (el botón de quitar tiene el foco en ese momento), pero si SLT-144 añade estado por línea,
una id estable por línea evitaría sorpresas.

## Veredicto: RECHAZADO

El código cumple el spec: R1–R28 trazados a tests que los verifican, crear y editar comparten formulario,
stepper y pasos, `use-mobile.ts` no rompe el Sidebar, typecheck/lint/tests relacionados en verde y los tres E2E
adaptados verdes en CI. Lo que bloquea es proceso y gate, no el código:
- **B1**: `gate-completo` rojo por `migracion-slt139-ida-y-vuelta.test.ts`, deuda de `dev` (arreglo en `chore/`
  o baseline; decide humano/leader).
- **B2**: T10/T11 abiertas y sin constancia local de E2E; se cierra con decisión humana (correr en local o
  aceptar el E2E y el gate de CI) y anotándolo en la bitácora.

Ninguno pide cambios en el código de la feature. Vuelta 2 acotada a esos dos puntos (y m1 si se corrige el design).
