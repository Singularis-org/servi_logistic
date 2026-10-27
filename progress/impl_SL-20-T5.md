# SL-20 · tanda 2b, frontend: T5.5 (Select de país + columna) y T5.3 (solo el borrado)

Rol: frontend_dev. Fecha: 2026-10-26. Fuente: decisiones 5-8 de `progress/features/SL-20.md`,
contrato de la UI en `progress/impl_SL-20-T2b.md`. Ninguna dependencia nueva.
MCP del grafo: no usado (bastó Grep/Read sobre archivos ya conocidos).

## Estado de las tasks (no se marcan `[x]`)
- **T5.5**: hecha la parte de UI (`Select` de país sin preselección, alta bloqueada sin país, solo
  países disponibles, columna «País», ajuste de los dos E2E a `CR`). Sigue `[ ]`: depende del resto
  de T2.5.
- **T5.3**: hecho SOLO el borrado de `/configuracion/geografia` (R22). Falta `/plataforma/geografia`
  (page, `GeografiaPlataformaModule.tsx`, `GeografiaAdminModule.tsx` movido y sin zonas), que depende
  de T4.3 y T5.1. Sigue `[ ]`.

## Archivos
Modificados:
- `app/(app)/plataforma/empresas/page.tsx` — `listarPaisesDisponibles(actor)` en el `Promise.all`;
  `paises={status === "ok" ? paises : []}`.
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx` — prop `paises`; campo `paisId`
  (`Select` de `components/ui/`, placeholder «Elige el país», valor inicial `""`); `paisId` en la
  entrada; `invalida paisId` → error bajo «País»; `conflicto paisId` (R8) → «Esa empresa ya existe en
  otro país.»; columna «País» (`empresa.pais.nombre`) tras «Slug».
- `app/(app)/configuracion/tarifas/_components/GeografiaSelector.tsx` — solo un comentario que
  mandaba a `/configuracion/geografia`.
- `tests/components/empresas-module.test.tsx` — `PAISES`, `pais` en las empresas (una en un país
  apagado `XA`), el alta elige «Costa Rica» y manda `paisId: "CR"`, nuevo bloque «SL-20 — país de la
  empresa (R9, R45)», casos `invalida paisId` y `conflicto paisId`.
- `tests/components/EmpresasModuleCobro.test.tsx` — `pais` en los datos y prop `paises`.
- `tests/integration/empresas-page.test.tsx` — mock de `paises-plataforma`, `pais` en los datos, la
  página no pide países a un rol de empresa, nuevo bloque «SL-20 (R9, R45)».
- `tests/unit/utils/filtrar-arbol-geografico.test.ts` — solo el comentario que citaba el test borrado.
- `e2e/_dos-empresas-fixture.ts` — `paisId: "CR"` en el alta por servicio.
- `e2e/superadmin-empresas.spec.ts` — el formulario elige «Costa Rica» en el combobox «País».
- `e2e/dos-empresas-humo.spec.ts` — solo un comentario (R22); su aserción de 404 sigue valiendo.

Borrados (R22):
- `app/(app)/configuracion/geografia/page.tsx`
- `app/(app)/configuracion/geografia/_components/GeografiaAdminModule.tsx`
- `app/(app)/configuracion/geografia/_components/zonas-sin-distritos.ts`
- `tests/unit/components/geografia-admin.ui.test.tsx`
- `tests/unit/components/geografia-admin-page.test.tsx`
- `tests/unit/utils/zonas-sin-distritos.test.ts`

Para el resto de T5.3: `GeografiaAdminModule.tsx` (879 líneas) y su test UI (1016 líneas) se
recuperan de `git show HEAD:"app/(app)/configuracion/geografia/_components/GeografiaAdminModule.tsx"`
y `git show HEAD:tests/unit/components/geografia-admin.ui.test.tsx` para moverlos a
`/plataforma/geografia` (design §8: «movido y adaptado»). Usaban `filtrar-arbol-geografico.ts` de
`app/(app)/configuracion/_shared/`, que sigue ahí porque lo usa también `GeografiaSelector` de tarifas.
`zonas-sin-distritos.ts` no vuelve (design §8). No he creado la pantalla nueva.

## Mapa R<n> → test
| R | Test |
|---|---|
| R9 (columna «País») | `tests/components/empresas-module.test.tsx` › «SL-20 — país…» › «R9: la tabla tiene la columna «País»…»; `tests/integration/empresas-page.test.tsx` › «R9/R46: la columna «País» pinta el de cada empresa…» |
| R9 (sin preselección) | `empresas-module.test.tsx` › «R9: el alta no trae ningún país preseleccionado»; tras el alta vuelve a vacío en «llama a la action una vez…»; `empresas-page.test.tsx` › «pide los países con su actor y el `Select` ofrece solo esos, sin preselección» |
| R9 (alta bloqueada sin país) | `empresas-module.test.tsx` › «R9: sin país, el alta queda bloqueada: marca «País» y NO llama a la action» |
| R9/R45 (solo disponibles en el `Select`; columna con país apagado) | `empresas-module.test.tsx` › «R9/R45: el `Select` ofrece solo los países disponibles…» y «R9/R45: la columna muestra el país de una empresa aunque ya no esté disponible»; `empresas-page.test.tsx` › bloque SL-20 |
| R6/R45 (UI del `invalida paisId`) | `empresas-module.test.tsx` › «R34: invalida con campo paisId pinta el error bajo ese campo» |
| R8 (UI del `conflicto paisId`) | `empresas-module.test.tsx` › «SL-20 R8: conflicto de país pinta el error junto a «País»» |
| R22 | Borrado de `app/(app)/configuracion/geografia/` (sin `page.tsx` la ruta no existe → 404 de Next a todo rol). Se ve en `ayuda-pantalla-ruta-existe.guardia` (ya no la lista en `RUTAS_APP`), en `menu-visibility.test.ts` › «R22: ningún ítem…» (verde) y en `e2e/dos-empresas-humo.spec.ts` (espera 404, no corrido). No hay test unitario propio del 404 (no se puede montar una página que no existe); el de R21/R22 del spec es `geografia-plataforma-page.test.tsx`, del resto de T5.3. |

## Salida real
Tests tocados:
```
pnpm exec vitest run tests/components/empresas-module.test.tsx tests/components/EmpresasModuleCobro.test.tsx tests/integration/empresas-page.test.tsx
 Test Files  3 passed (3)
      Tests  83 passed (83)
```
Guardias y tests que referencian lo borrado (por archivo):
```
pnpm exec vitest run tests/unit/guards/ayuda-pantalla-ruta-existe.guardia.test.ts
  tests/unit/guards/ayuda-md-viajan-a-produccion.guardia.test.ts tests/unit/guards/ayuda-render-sin-filtracion.guardia.test.ts
  tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts tests/unit/guards/geografia-renombrado-punto-unico.guardia.test.ts
  tests/unit/guards/geografia-predicado-unico.guardia.test.ts tests/unit/guards/geografia-sin-borrado-fisico.guardia.test.ts
  tests/unit/guards/geografia-terminales-una-sola-fuente.guardia.test.ts tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts
  tests/unit/guards/plataforma-solo-en-lista.guardia.test.ts tests/unit/guards/vistas-superficies-declaradas.guardia.test.tsx
  tests/unit/guards/buttonvariants-pasa-por-cn.guardia.test.ts tests/unit/utils/filtrar-arbol-geografico.test.ts
  tests/unit/auth/menu-visibility.test.ts
     × toda `pantalla:` declarada apunta a una ruta que EXISTE en app/
 FAIL  tests/unit/guards/ayuda-pantalla-ruta-existe.guardia.test.ts > … > toda `pantalla:` declarada apunta a una ruta que EXISTE en app/
+   "oficina/configuracion-geografia.md -> /configuracion/geografia",
 Test Files  1 failed | 13 passed (14)
      Tests  1 failed | 194 passed (195)
```
`geografia-renombrado-punto-unico` no lista archivos de `app/` (solo mira `lib/`): verde sin cambios.

Lint (`pnpm exec eslint` sobre los 10 archivos tocados que siguen existiendo): `eslint exit 0`, sin salida.

Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`):
- 1.ª pasada: `.next/types/validator.ts(143,39): error TS2307: Cannot find module '../../app/(app)/configuracion/geografia/page.js'`
  — artefacto generado y fuera de git (`.next`, incluido por `tsconfig.json`), viejo tras el borrado.
- `pnpm exec next typegen` → «✓ Types generated successfully» (regenera solo `.next/types`).
- 2.ª pasada: `tsc --noEmit`, **exit 0, 0 errores**.
  Aviso: en otra máquina o worktree con `.next` viejo sale el mismo TS2307 hasta correr `next typegen`
  o `next build`; el CI parte de limpio.

E2E: `e2e/superadmin-empresas.spec.ts`, `e2e/_dos-empresas-fixture.ts` y el comentario de
`e2e/dos-empresas-humo.spec.ts` ajustados, **no corridos** (fuera del alcance pedido).

## Preguntas abiertas / bloqueos
1. **Guardia en rojo: `ayuda-pantalla-ruta-existe`.** `docs/ayuda/oficina/configuracion-geografia.md`
   declara `pantalla: /configuracion/geografia` (y `fuentes:` con el `GeografiaAdminModule.tsx`
   borrado). No la he tocado: las tres salidas eligen por T5.6, que «lo decide quien la mantiene»:
   - retirar el `.md` (la ayuda es de `roles: [maestro, admin]`, y el maestro ya recibía 404 en esa
     ruta desde SL-32 R26) → verde ya;
   - reescribirla para el superadmin con `pantalla: /plataforma/geografia` → sigue rojo hasta que
     exista esa página (resto de T5.3);
   - quitar `pantalla:` → rompe el caso «ningún documento queda huérfano» de la misma guardia.
   Hace falta la decisión humana para dejar el gate verde.
2. El texto «Esa empresa ya existe en otro país.» para `conflicto paisId` (R8) es mío: el spec fija el
   desenlace, no el texto. Si hay un texto acordado, se cambia en `TEXTOS.errorPaisConflicto`.
3. Si `listarPaisesDisponibles` responde `forbidden` (no debería: la página ya exige plataforma), el
   `Select` queda vacío y el alta no sale; no se pinta aviso aparte. Está probado en
   `empresas-page.test.tsx`.

Veredicto: UI de T5.5 y borrado de T5.3 hechos, tests verdes y typecheck en 0. Queda en rojo la
guardia de ayuda, que espera la decisión de T5.6.

## T5.6

Decisión 9: se retira `docs/ayuda/oficina/configuracion-geografia.md` (`roles: [maestro, admin]`;
ya borrado con `git rm` por el leader). Ningún código de la app (`AyudaLayout`, `lib/ayuda/`) ni
doc de ayuda afirma las cifras o nombra el documento: solo los tests las fijan a mano. Se
actualizan los literales, con comentario «SL-20 (decisión 9)»:

- `tests/components/AyudaLayout.test.tsx`: maestro/admin 38→37 (7.º rojo, no listado en el encargo).
- `tests/unit/asistente/acotamiento-por-rol.test.ts`: R10 «37 / 37 / 10 / 8 / 7»; R11 carpeta oficina 23→22.
- `tests/unit/asistente/contexto-documental.test.ts`: R1 catálogo y contexto 38→37.
- `tests/unit/ayuda/acotamiento-por-rol.test.ts`: R21 catálogo 38→37; «los DIEZ» sin tocar la lista
  (el documento no estaba entre ellos) y la cuenta 37−10=27; admin propios 22→21.

Comandos:

```
NODE_OPTIONS=--max-old-space-size=6144 pnpm exec vitest run tests/unit/ayuda tests/unit/asistente tests/components/Ayuda* tests/components/AppLayout.test.tsx tests/unit/guards/ayuda-*
 Test Files  26 passed (26)
      Tests  373 passed (373)
(antes del cambio: 4 failed | 22 passed; 7 failed | 366 passed)

pnpm exec eslint <los 4 tests>
ESLint: No issues found
```

Typecheck no aplica: no se tocó código TS de la app.

Veredicto: T5.6 hecha; ayuda y asistente en verde con el catálogo en 37.
