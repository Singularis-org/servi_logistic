# review SLT-257 «Sandbox: banner de ambiente de pruebas»

Vuelta 1 · 2026-11-23 · diff `origin/dev...HEAD` (HEAD 2e3c0800) · ruta ligera.

## Checklist

- [x] **Ruta:** ligera. El diff no toca dinero, permisos, auth, integraciones, webhooks ni esquema; complejidad low. No hace falta subir de ruta.
- [x] **Lo que ya existe:** sección presente y no vacía. El diff reutiliza el patrón de `lib/config/*`, los colores `bg-brand-light`/`text-brand-dark`, `tests/fixtures/contraste.ts` y `tests/fixtures/sin-comentarios`; no re-crea nada de la lista.
- [x] **Archivos esperados:** los 8 archivos de código y tests del diff son exactamente los 8 de `## Archivos esperados` (el 8.º, la fila de `CENSO_NEGRO_FIJO`, autorizado el 2026-11-23). Lo demás es `progress/` y `specs/`. No se tocan `docs/ayuda/` ni los crons.
- [x] **Tamaño:** `node scripts/tamano-pr.mjs`: 8/40 archivos, 47/1000 líneas de producción, 259/3000 de tests.
- [x] **Trazabilidad R→test:** todos los requisitos tienen al menos un test con aserciones reales (ver la tabla). Mapa en `progress/impl_SLT-257.md`.
- [ ] **Tasks:** T1–T4 `[x]`; T5 `[ ]` (ver m1).
- [x] **Typecheck:** `pnpm run typecheck` exit 0 (lo corrí yo).
- [x] **Lint:** eslint sobre los 7 archivos de código y tests del diff: exit 0.
- [x] **Guardias:** `pnpm run test:guardias`: 358 archivos pasan y 3 se saltan; 5437 tests pasan. Incluye `marca-texto-amarillo` y `env-example-sin-valores`.
- [x] **Tests de la ficha y vecinos:** vitest de los 3 tests nuevos más `marca-layout`, `html-lang`, `marca-texto-amarillo` y `env-example-sin-valores`: 7 archivos, 83/83 en verde.
- [x] **Flujos críticos / E2E:** no toca ningún flujo crítico. Sin la variable el componente devuelve `null` y el DOM del layout no cambia. Ni `e2e/` ni `.github/` ponen `AMBIENTE_PRUEBAS`. Sin E2E, por decisión cerrada.
- [x] **Datos y seguridad:** no hay tablas, queries, migraciones, secretos, PII ni recursos de Ordenex.
- [x] **Configuración:** la variable va por entorno y está documentada en `.env.example` sin valor.
- [x] **Dependencias:** ninguna nueva.
- [x] **Comentarios:** explican el porqué (VERCEL_ENV inservible en el sandbox, redeploy, safe-area).
- [ ] **`./init.sh`:** el validador de features frena por el exceso de cupo fullstack del humano (12/7). Es ajeno a la ficha y está aceptado; no se cuenta.
- [ ] **`gate-completo` en CI:** pendiente del PR (F2.4).

## Trazabilidad

| R | Test | Verifica de verdad |
|---|---|---|
| R1 | `ambiente-config.test.ts` «R1…»; `BannerAmbientePruebas.test.tsx` «R1…» | sí: devuelve `true` y el textContent es «Sandbox» |
| R2 | ambos archivos, `it.each` con `undefined`, `""`, `TRUE`, `True`, `1`, `yes`, `false`, ` true`, `true ` | sí: `container.innerHTML === ""` (sin contenedor vacío) |
| R3 | ambos archivos: production+true se pinta; preview/development sin variable, no | sí |
| R4 | «R4…»: textContent exacto, 0 hijos, 0 enfocables, sin tabindex | sí |
| R5 | `banner-ambiente-layout.test.ts`: lo comprueba en el fuente (lo primero tras `<body>`, antes de `ZodEnEspanol` y `{children}`) y renderizando `RootLayout` (primer hijo del body = «Sandbox», luego `MAIN`) | sí |
| R6 | «R6…»: sin `aria-hidden`, sin `role=alert`, sin `aria-live=assertive` | sí |
| R7 | «R7…»: lleva `bg-brand-light` y `text-brand-dark`, no lleva `text-brand(-light)` ni `dark:`, y `contraste ≥ 4.5`; además la fila del censo | sí |
| R8 | «R8…»: un solo `pt-*` y contiene `env(safe-area-inset-top)` | sí. La parte en iPhone real es manual (T5) |
| R9 | «R9…»: lleva `shrink-0` y nada de grow/flex-1/h-full/min-h | sí |
| R10 | `ambiente-config.test.ts`: la línea `AMBIENTE_PRUEBAS=` y el comentario con `` `true` `` y «proyecto Vercel del sandbox»; además la guardia env-example | sí |
| R11 | «R11…»: sin sticky, fixed, absolute ni `z-*` | sí |

## Decisiones cerradas

- Se detecta por `AMBIENTE_PRUEBAS === "true"` exacto, sin `VERCEL_ENV`. Cumple (`lib/config/ambiente.ts:10`).
- Va en el layout raíz, en todas las pantallas. Cumple (`app/layout.tsx:65-67`).
- No se cierra y va arriba. Sin controles; en el flujo (R11, que cierra P1).
- Texto «Sandbox», solo eso. Cumple: el layout no pasa `texto` (ver m2).
- Guía de integración, crons y E2E: sin cambios. Cumple.

## Desvíos anotados por el implementer

1. **Safe-area con la clase Tailwind `pt-[calc(env(safe-area-inset-top)+0.25rem)]` en vez de `style`.** Aceptable. T2 pide «`padding-top` que incluye `env(safe-area-inset-top)`» y no fija el mecanismo. Tailwind v4 genera ese valor arbitrario sin espacios. El layout ya declara `black-translucent` (`app/layout.tsx:53`). El test de R8 comprueba la clase.
2. **Prop opcional `texto` con default «Sandbox».** Se acepta, como menor (m2).
3. **Nota de redeploy en `.env.example`.** Aceptable y útil: es la misma nota que T5 pide para el PR. No pone valor, así que la guardia `env-example-sin-valores` pasa.

## Hallazgos

- **m1 (menor):** T5 sigue `[ ]` en `specs/SLT-257-banner-ambiente-pruebas/requirements.md:108`. Su único rojo es el cupo ajeno y aceptado, y el resto de T5 (nota de redeploy en el PR, prueba manual de R8 en un iPhone con la PWA) es trabajo del leader en F2.4. Al abrir el PR: marcar T5 anotando la excepción del cupo, y poner en el cuerpo del PR la nota de redeploy y el paso manual de R8.
- **m2 (menor):** `components/shared/BannerAmbientePruebas.tsx:11-18`. La prop `texto` con su «Prop para un i18n futuro» es generalidad especulativa: la decisión cerrada es «Sandbox, solo eso». La firma `({ texto = "Sandbox" }: Props = {})` añade superficie que ningún test cubre con otro valor. Hoy no rompe nada porque el layout no la pasa, pero conviene quitarla y dejar el literal.
- **m3 (menor):** `progress/features/SLT-257.md` está desactualizado. La tabla dice estado `pending` y la tanda 2 dice «Commit y push bloqueados… cambios sin commitear», pero el árbol está limpio y la tanda 2 ya está en el commit 2e3c0800. Lo actualiza el leader.

No hay hallazgos BLOQUEANTES.

## Veredicto

**OK**
