# SL-8 — Tareas

Todo se hace en el worktree `.worktrees/SL-8-marca-logo-paleta-fuente`, en finales LF. Cada
`./init.sh` va a un log con `INIT_EXIT=$?` dentro (`docs/gate.md > Trampas conocidas`).

**Reparto** (`docs/perfil-agentes.md > implementer`):
- `lib/config/marca.ts` y su test → `backend_dev` (T2).
- Todo lo demás → `frontend_dev`.

No hay pantalla nueva, así que no pasa por `/design`.

**Regla de todas las tareas (R26).** Un archivo que se toca queda sin «ordenex» en ninguna combinación
de mayúsculas, comentarios incluidos.

## Tareas

- [x] **T0 — Dependencia con SL-15: el término de `EMPRESA`** (R22, R25; D8). Antes de T2, leer el
  spec de SL-15 «Nombre «Ordenex» en código y UI» en su estado aprobado, en `requirements.md` R1 y
  `design.md` §3, y comprobar si el valor de transición de `EMPRESA` está fijado.
  - **Fijado** (por ejemplo `enFrase` «la empresa», `alInicio` «La empresa», `membrete` `null`):
    T2 copia `EMPRESA` literal de allí, y T11 usa sus formas en la postulación.
  - **No fijado**, o el spec de SL-15 sin aprobar: T2 crea solo `MARCA`, y T11 deja los tres textos
    de la postulación sin nombre propio (D8).

  En ningún caso `EMPRESA` vale «Servi Logistic».
  **Hecho:** `progress/impl_SL-8.md` dice qué rama se tomó, con la cita del spec de SL-15 y su commit.

- [x] **T1 — Línea base.** Antes de tocar nada, correr:
  - `pnpm run test:guardias`;
  - `pnpm exec vitest related --run app/globals.css components/shared/Logo.tsx app/layout.tsx`.

  Guardar los logs en `_trabajo/SL-8-antes-*.log`.
  **Hecho:** `progress/impl_SL-8.md` tiene la lista de archivos rojos de partida, y dice cuáles ya
  están en `tests/baseline-rojos.json`.

- [x] **T2 — `lib/config/marca.ts`** (R22; D8). Depende de T0. Crear el módulo con `MARCA` y, solo si
  T0 lo encontró fijado, con `EMPRESA` copiado literal de SL-15. Crear también
  `tests/unit/config/marca.test.ts`. Afirma:
  - el literal `MARCA.nombre === "Servi Logistic"` como contrato;
  - si existe `EMPRESA`, que ninguno de sus valores es `MARCA.nombre` ni contiene «Servi Logistic».

  **Hecho:** test y typecheck verdes. Comprobado que el test muerde: con `EMPRESA.enFrase` puesto a
  `MARCA.nombre` en una copia, sale rojo.

- [x] **T3 — `Logo` nuevo** (R1–R5; D1). Depende de T2.
  - Reescribir `components/shared/Logo.tsx`, con `archivoDeLogo()` y `ANCHO_MINIMO_HORIZONTAL`
    exportados y `alt={MARCA.nombre}`.
  - Reescribir `tests/components/Logo.test.tsx`: las cuatro combinaciones, el límite 139/140, el
    `alt`, que no haya texto y la proporción con margen de 1 px.

  **Hecho:** verde, y comprobado que el test muerde: con el umbral cambiado a `> 140` en una copia, el
  caso 140 sale rojo.

- [x] **T4 — Llamadas a `Logo` y degradados** (R6, R7, R8, R24; D2). Depende de T3.
  - Las 9 llamadas de la tabla D2.
  - El isotipo colapsado de `Sidebar.tsx`.
  - Los cuatro degradados `rgba(242,100,25,0.16)` → `rgba(255,208,0,0.16)`.
  - Casos nuevos en `tests/components/Sidebar.test.tsx`: `src` expandido y colapsado; ningún nombre
    accesible «Ordenex».
  - Casos nuevos en `tests/components/LoginPage.test.tsx`: logo de fondo oscuro en el panel y de fondo
    claro en la cabecera móvil; ningún «Ordenex».

  **Hecho:** typecheck verde, porque no queda ningún `<Logo />` sin `fondo`, y los dos tests verdes.

- [x] **T5 — Tema claro** (R9, R12, R13, R14; D3, D5). En `app/globals.css`:
  - La tabla D3, con `--color-brand: var(--primary)` y `--color-brand-foreground` nuevo.
  - Copia hex a hex a `.papel-al-imprimir` y al bloque de impresión `html .dark, …`.
  - Mezclas calculadas con `componer()`.
  - Comentarios con cifras viejas actualizados, y fuera las dos menciones del dominio de Ordenex (D11).
  - En `tests/fixtures/contraste.ts`, el resolutor de utilidades que apuntan a `var(--…)` (D6, parte 3).

  **Hecho:** los casos de espejo de `tema-encendido` e `impresion-tokens` están verdes. Las cifras que
  se movieron quedan apuntadas para T9.

- [x] **T6 — Tema oscuro** (R10, R12; D4). Depende de T5. La tabla D4 en `.dark` y, hex a hex, en
  `.tema-sistema`.
  **Hecho:** el caso «sistema toma EXACTAMENTE los mismos tokens que oscuro» está verde.

- [x] **T7 — Tinta sobre la marca y landing** (R15, R16, R17, R8; D6). Depende de T5 y T6.
  - En el portal, `text-white` → `text-brand-foreground` en los 4 sitios con `bg-brand`.
  - Los 5 `text-brand-dark` sin `dark:`: o reciben su `dark:` o pasan a `CENSO_NEGRO_FIJO`.
  - Los `hover:bg-brand/*` de `components/ui/sidebar.tsx` → `bg-sidebar-accent`.
  - En la landing, archivo por archivo: los botones y acentos sobre `navy-deep` pasan a
    `bg-brand-light text-brand-dark`, y el texto amarillo sobre oscuro va al `CENSO_AMARILLO`.
  - Los comentarios de `components/ui/button.tsx` que citan cifras del naranja se actualizan.

  **Hecho:** `progress/impl_SL-8.md` trae una tabla por sitio con archivo:línea, superficie, clase
  antes y después, y contraste.

- [x] **T8 [P] — Guardia de marca** (R11, R13, R14, R15, R16, R17, R20, R26, R29; D6, D7, D11).
  - Crear `tests/unit/guards/marca-texto-amarillo.guardia.test.ts` con:
    - las siete partes de D6;
    - el caso de `app/layout.tsx` (R20);
    - el caso de 0 «ordenex» en las rutas fijas del alcance (R26).
  - Cada parte lleva su caso sintético rojo y verde.
  - Se puede escribir en paralelo con T7, pero se cierra después de T7 y de T12.

  **Hecho:** verde sobre el árbol. Rojo comprobado con un `text-brand-light` temporal fuera del censo
  y con un hex cambiado en la tabla de `docs/marca.md`.

- [x] **T9 — Guardias de contraste como contrato** (R18, R19; D10). Depende de T5, T6 y T7.
  - Re-medir `contraste-tokens`, `impresion-sin-dark` (con `paleta("brand")` cambiado a `token()`),
    `enlace-contraste-458`, `impresion-tokens` y `factura-contraste`.
  - En `factura-contraste`, fuera sus 3 menciones de «Ordenex».
  - Los dos casos de la 226 se reescriben.
  - Los suelos se mueven solo con la regla de R18.

  **Hecho:** las cinco están verdes, y `progress/impl_SL-8.md` trae una línea por número movido (antes
  → después, con su motivo) y por caso reescrito.

- [x] **T10 [P] — Fuente Archivo** (R20; D7). En `app/layout.tsx`, `Archivo` en lugar de `Poppins`,
  con `variable: "--font-sans"`.
  **Hecho:** typecheck verde y el caso de la guardia de T8 verde.

- [x] **T11 [P] — Textos desde `lib/config/marca.ts`** (R23, R25, R26; D8, D11). Depende de T0 y T2.
  - `app/layout.tsx`: título, descripción y `apple-mobile-web-app-title`.
  - `LandingNav.tsx` y `LandingFooter.tsx` («© 2026 · Servi Logistic»), con `MARCA`.
  - `LandingPostular.tsx`: los tres textos de la postulación, con las formas de `EMPRESA` o sin nombre
    propio, según la rama de T0 (D8). Nunca con `MARCA`.
  - Los comentarios de `LandingNav.tsx`, `primitivas.tsx`, `app/page.tsx` y `LandingPoliticas.tsx`
    (D11).
  - En `tests/components/LandingPage.test.tsx`:
    - el logo `img` y los textos de R25, sin «Ordenex»;
    - un caso que afirma que la sección `#trabaja-con-nosotros` no contiene «Servi Logistic».

  **Hecho:** test verde, y `grep -il ordenex` sobre esos archivos da vacío. Se pega la salida.

- [x] **T12 — `docs/marca.md`** (R11; D12). Depende de T6.
  - Sección `## Tema oscuro`, con las cifras recalculadas con el fixture.
  - «Pendiente» reescrito sin el nombre Ordenex.
  - La nota del amarillo sobre blanco (≈ 1.47:1).

  **Hecho:** la parte 7 de la guardia de T8 está verde, y `grep -i ordenex docs/marca.md` da vacío.

- [x] **T13 — Verificación en el navegador** (R8, R21, R27, R28; D9). Depende de T3 a T12 y de una base local migrada. No depende de SL-11.
  - Escribir `e2e/marca.spec.ts`. Su `beforeAll` crea un usuario `admin` de prueba en la base local de
    la feature, con correo único y contraseña aleatoria, y su `afterAll` lo borra (D9). No se escribe
    en ningún seed ni script versionado, y no se usa `maestro` ni superadmin.
  - Con un solo dev server y `.next` limpio, correr `pnpm exec playwright test e2e/marca.spec.ts`
    con el `DATABASE_URL` del worktree.
  - Mirar cada captura, no solo el verde: logo correcto, ningún naranja ni navy de Ordenex, amarillo
    solo sobre oscuro.

  **Hecho:**
  - la corrida está verde, sin casos saltados;
  - las capturas de R27 están en `_trabajo/capturas/SL-8/`;
  - `progress/impl_SL-8.md` trae la lista de capturas (ruta, ancho, tema), las cifras de D9 por
    pantalla y lo que se vio en cada una.

  Si no hay base local migrada, la tarea queda **BLOQUEADA** y se reporta así. No vale cerrarla con un
  render de componente ni con un `skip`.

- [x] **T14 — Cierre.** Depende de todas.
  - Correr `git diff --name-only dev...HEAD | xargs grep -il ordenex`, que tiene que dar vacío (R26).
  - Correr `./init.sh`.

  **Hecho:** salida vacía pegada, `INIT_EXIT=0` en el log y el mapa `R<n> → test` completo en
  `progress/impl_SL-8.md`.

## Trazabilidad prevista

| R | Test |
|---|---|
| R1–R5 | `tests/components/Logo.test.tsx` |
| R6 | `tests/components/Sidebar.test.tsx`, `tests/components/LoginPage.test.tsx`, `tests/components/LandingPage.test.tsx` |
| R7 | `tests/components/Sidebar.test.tsx` |
| R8 | `e2e/marca.spec.ts` (360 px) |
| R9, R10, R12 | `tests/unit/guards/tema-encendido.guardia.test.ts`, `tests/unit/guards/impresion-tokens.guardia.test.ts`, `tests/unit/guards/marca-texto-amarillo.guardia.test.ts` |
| R11, R13, R14, R15, R16, R17, R20, R29 | `tests/unit/guards/marca-texto-amarillo.guardia.test.ts` |
| R18, R19 | `tests/unit/guards/contraste-tokens.guardia.test.ts`, `tests/unit/guards/impresion-sin-dark.guardia.test.ts`, `tests/unit/guards/enlace-contraste-458.guardia.test.ts`, `tests/unit/guards/factura-contraste.guardia.test.ts` |
| R21, R27, R28 | `e2e/marca.spec.ts` |
| R22 | `tests/unit/config/marca.test.ts` |
| R23, R25 | `tests/components/LandingPage.test.tsx`; el caso de `app/layout.tsx` de la guardia de marca |
| R24 | `tests/components/LoginPage.test.tsx`, `tests/components/Sidebar.test.tsx` |
| R26 | `tests/unit/guards/marca-texto-amarillo.guardia.test.ts` (rutas fijas) más la salida de T14 |

## Archivos esperados

- `lib/config/marca.ts`
- `components/shared/Logo.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/page.tsx`
- `app/login/page.tsx`
- `app/recuperar-contrasena/page.tsx`
- `app/postulacion/page.tsx`
- `app/paquete/[numGuia]/page.tsx`
- `app/(app)/_components/Sidebar.tsx`
- `app/_landing/LandingNav.tsx`
- `app/_landing/LandingFooter.tsx`
- `app/_landing/LandingPostular.tsx`
- `app/_landing/LandingHero.tsx`
- `app/_landing/LandingServicios.tsx`
- `app/_landing/LandingPoliticas.tsx`
- `app/_landing/LandingBanda.tsx`
- `app/_landing/LandingComoFunciona.tsx`
- `app/_landing/PostularRecursoModal.tsx`
- `app/_landing/RastreoDialog.tsx`
- `app/_landing/primitivas.tsx`
- `components/ui/button.tsx`
- `components/ui/sidebar.tsx`
- `components/private/analytics/jerarquia.ts`
- `app/(app)/mis-asignaciones/_components/pos-card/PosNavBlock.tsx`
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx`
- `app/(app)/mis-asignaciones/_components/pos-card/pos-estado.ts` (T8: su marca «activa» era `bg-brand text-white`, 1.47 en oscuro)
- `app/(app)/ordenes/_components/OrdenesCargaPreview.tsx`
- `app/(app)/ordenes/_components/OrdenesCargaMasivaButton.tsx`
- `app/(app)/ranking/_components/RankingPodio.tsx`
- `tests/fixtures/contraste.ts`
- `tests/unit/config/marca.test.ts`
- `tests/unit/config/marca-layout.test.ts` (B1 del review: R23, `title`, `description` y `apple-mobile-web-app-title` del layout raíz)
- `tests/components/Logo.test.tsx`
- `tests/components/LandingPage.test.tsx`
- `tests/components/LoginPage.test.tsx`
- `tests/components/Sidebar.test.tsx`
- `tests/unit/validacion/zod-es.test.tsx` (T10: su doble de `next/font/google` exportaba `Poppins`)
- `tests/unit/guards/marca-texto-amarillo.guardia.test.ts`
- `tests/unit/guards/contraste-tokens.guardia.test.ts`
- `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` (B2 del review: su nombre y su contenido son de SL-14; SL-8 solo quita sus 4 excepciones `ficha: "SL-8"`)
- `tests/unit/guards/impresion-sin-dark.guardia.test.ts`
- `tests/unit/guards/enlace-contraste-458.guardia.test.ts`
- `tests/unit/guards/impresion-tokens.guardia.test.ts`
- `tests/unit/guards/factura-contraste.guardia.test.ts`
- `tests/unit/guards/tema-encendido.guardia.test.ts` (T9: sus casos fijaban `#f7f8fc` y `#12233f`)
- `e2e/marca.spec.ts`
- `docs/marca.md`
- `progress/impl_SL-8.md`

Si el recorrido de T7 encuentra un sitio que no está en esta lista, se hace esto en el mismo commit:
- se añade aquí, para que `scripts/archivos-en-vuelo.mjs` lo vea;
- se comprueba que no contiene «ordenex». Si lo contiene y su limpieza es de SL-15 (identificadores
  del glosario), no se toca, y se avisa al leader.
