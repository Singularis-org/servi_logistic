# Review SL-8 «Logo, paleta y fuente de Servi Logistic en la interfaz» — vuelta 1

Rama `feature/SL-8-marca-logo-paleta-fuente`, HEAD revisado `c4cede8`. Base de la rama `de68dfb`;
`dev` de hoy `135037f` (con SL-10, SL-11, SL-12 y SL-14). Fecha: 2026-10-22.
El MCP del grafo no se usó: los archivos son de UI, CSS y tests, y Grep/Read bastaron.

## Verificación ejecutada por el reviewer

| Qué | Dónde | Resultado |
|---|---|---|
| `pnpm run typecheck` | worktree SL-8 | verde |
| `eslint` sobre los `.ts/.tsx` del diff | worktree SL-8 | 0 errores |
| `vitest run` de los 14 archivos del diff y `pwa-manifiesto-atajos` | worktree SL-8 | 14 archivos, 314 tests, todo verde |
| Grep R26: `git diff --name-only de68dfb..HEAD \| xargs grep -il ordenex` | worktree SL-8 | solo los 3 archivos de `specs/SL-8-*` (fuera de «Archivos esperados») |
| Contrastes: recalculados con la fórmula WCAG | scratchpad | coinciden con la bitácora al centésimo (1.47, 1.37, 17.60, 18.88, 12.84, 11.60, 9.37, 15.91, 17.70, 9.22, 8.90, 13.61, 10.55) |
| `git merge-tree --write-tree HEAD 135037f` | — | sin conflictos (árbol `7ec747b`) |
| `pnpm run test:guardias` sobre el merge simulado | worktree temporal, ya borrado | **2 rojos nuevos en `dominio-ordenex-fuera`** (ver B2), más los 2 del baseline; otros 4 rojos eran timeouts por carga y salen verdes aislados (68/68) |
| typecheck y tests de componentes del diff sobre el merge simulado | worktree temporal | verde; 6 archivos, 84 tests |
| Capturas (10 PNG) y `cifras.json` | `_trabajo/capturas-SL-8/` | revisadas una a una (abajo) |

## Checklist

### Especificación
- [x] `requirements.md` con R1–R29 en EARS.
- [x] `design.md` con alternativas descartadas (A–E) y su porqué.
- [x] `tasks.md`: T0–T14 marcadas `[x]`, ninguna `[ ]`.
- [x] `design.md` abre con `## Lo que ya existe`. El diff reutiliza `Logo.tsx`, `public/brand/`, `next/font/google`
      y `tests/fixtures/contraste.ts` sin re-crearlos.

### Trazabilidad
- [x] `progress/impl_SL-8.md` trae el mapa `R<n> -> test`.
- [ ] **Cada R mapea a un test real: falla R23** (B1).
- [~] R6: los tests cubren login, barra lateral y landing. Recuperar contraseña, postulación y
      `paquete/[numGuia]` no tienen test (m1). El código de las 13 llamadas es correcto.

### Calidad de código
- [x] Typecheck y lint verdes.
- [ ] `gate-completo` en el PR: **se pondría rojo al integrar con el `dev` de hoy** (B2).
- [x] Flujo crítico: SL-8 toca el login solo en lo visual. Hay E2E nuevo (`e2e/marca.spec.ts`) que entra
      por `/login`, con su salida en la bitácora.
- [x] Ninguna dependencia nueva: `package.json` intacto, y `next/font/google` es parte de `next` (D2).

### Seguridad, configuración y datos
- [x] Sin secretos. El E2E lee `DATABASE_URL` del entorno y aborta si apunta a un proyecto de Ordenex
      o a Supabase. La contraseña es aleatoria y el usuario se borra en `afterAll`.
- [x] Sin tablas, migraciones ni queries nuevas.
- [x] Ningún recurso de Ordenex en el código del diff. El dominio de origen solo queda en los specs de SL-8 (B2).
- [x] Sin literales de país nuevos: el pie pierde «Costa Rica» (D10). «Hacienda CR», «+506» y
      «San José, Costa Rica» del pie ya estaban y no son de SL-8.

### Reglas del proyecto (`docs/perfil-agentes.md > reviewer`)
- [x] Nada de `organizacion_id`, RLS, `down.sql` ni dependencias que aplique.
- [x] Los comentarios nuevos explican el porqué: por ejemplo, el isotipo bajo `md` en `LandingNav` y el
      `eslint-disable` de `<img>` en `Logo`.

### Decisiones del humano
- [x] `MARCA = { nombre: "Servi Logistic" } as const`, sin variables de entorno.
- [x] `EMPRESA` es literal de SL-15: «la empresa», «La empresa» y `null`. `tests/unit/config/marca.test.ts`
      fija los literales y que ningún valor sea ni contenga «Servi Logistic».
- [x] La postulación de la landing no dice «Servi Logistic». Usa «Sumate a la empresa» y «con la empresa»,
      y lo prueba `LandingPage.test.tsx` (`#trabaja-con-nosotros`). En la captura del pie se lee «Ponelo a
      trabajar con la empresa» y «el equipo de la empresa».
- [x] El tema oscuro es el de D4. Las capturas oscuras muestran fondo `#111111`, tarjetas `#1C1C1A`, tinta
      clara y el botón de colapsar amarillo. La parte 7 de la guardia compara las 25 filas de
      `docs/marca.md > Tema oscuro` con `.dark`.
- [x] Sin texto amarillo sobre blanco. `cifras.json` da 0 en las 10 pantallas, y a la vista también: el
      amarillo solo aparece sobre el héroe oscuro, la barra y el panel del login. Las partes 1 a 4 de la
      guardia lo hacen cumplir en el árbol.
- [x] «Ordenex» fuera de los archivos tocados: grep vacío en «Archivos esperados». Además, la guardia de
      marca pide 0 en las rutas fijas de D11.

### Logo por superficie (código + capturas)
- [x] Login 1280: panel oscuro con `logo-horizontal-fondo-oscuro`. Login 360: cabecera clara con
      `logo-horizontal-fondo-claro`.
- [x] Landing 1280: barra y pie con el horizontal de fondo oscuro. Landing 360: la barra lleva
      `isotipo-mono-blanco`, sin desbordar (`scrollWidth` 360).
- [x] Barra lateral expandida con el horizontal de fondo oscuro. Colapsada, con `isotipo-mono-blanco` en
      claro y en oscuro, y ya no `icon-192.png` (R7: test de componente y E2E).
- [x] `paquete/[numGuia]`: `fondo="claro" ancho={140}`; recuperar y postulación igual que el login
      (solo código, ver m1).

### E2E de marca
- [x] `e2e/marca.spec.ts` sin `skip`, `fixme` ni `.only`. Si falta la base, falla con un mensaje.
      La bitácora trae 6/6 `ok` y `PW_EXIT=0`.
- [x] Las mediciones de R28 están dentro del test (amarillo sobre claro, familia y `document.fonts`,
      nombre anterior, `src` del logo y `scrollWidth`) y escriben `cifras.json`.

## Hallazgos

### B1 — BLOQUEANTE: R23 no tiene test
R23 exige que el layout raíz tome de `MARCA.nombre` tres cosas: el `title`, la `description` y
`apple-mobile-web-app-title`. El código lo cumple (`app/layout.tsx:24-25, 53`), pero ningún test lo
comprueba:
- El mapa lo atribuye a `tests/components/LandingPage.test.tsx`, y ese archivo no lee `metadata` ni
  `app/layout.tsx`.
- También al «caso de `app/layout.tsx` de la guardia de marca», y ese caso solo mira la fuente (R20).
- La guardia de rutas fijas (R26) prueba que falta el nombre anterior, no que esté `MARCA.nombre`.
- El E2E no mira `document.title`.

En la práctica: si `title` vuelve a un literal cualquiera, todo sigue en verde.

**Qué falta:** un test que falle si alguno de los tres valores deja de ser `MARCA.nombre`. Por ejemplo:
- importar `metadata` de `app/layout.tsx` y afirmar `title` y `description`; o
- en `e2e/marca.spec.ts`, afirmar `document.title` y el `content` de
  `meta[name="apple-mobile-web-app-title"]`.

El literal «Servi Logistic» sirve como contrato. Después hay que corregir la fila R23 del mapa en la
bitácora.

### B2 — BLOQUEANTE: al integrar con el `dev` de hoy, la guardia del dominio de SL-14 se pone roja
`git merge-tree` no da conflictos, pero sobre el árbol resultante
`tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` falla en dos casos. Ese archivo no está en
`tests/baseline-rojos.json`.

1. **«ninguna entrada sobra»:** SL-8 ya limpió los cuatro archivos que la guardia exceptúa a su nombre,
   y la guardia pide borrar estas entradas de `EXCEPCIONES_DOMINIO`:
   - `app/_landing/LandingNav.tsx`
   - `app/_landing/primitivas.tsx`
   - `app/page.tsx`
   - `app/globals.css`
2. **«ningún archivo versionado fuera de la lista lleva el dominio» (R9 de SL-14):** los specs de SL-8
   citan el dominio literal en 7 líneas:
   - `specs/SL-8-marca-logo-paleta-fuente/design.md:14`
   - `specs/SL-8-marca-logo-paleta-fuente/design.md:452`
   - `specs/SL-8-marca-logo-paleta-fuente/requirements.md:16`
   - `specs/SL-8-marca-logo-paleta-fuente/requirements.md:23`
   - `specs/SL-8-marca-logo-paleta-fuente/requirements.md:57`
   - `specs/SL-8-marca-logo-paleta-fuente/requirements.md:147`
   - `specs/SL-8-marca-logo-paleta-fuente/tasks.md:69`

**Qué falta:**
- traer `dev` (`135037f`) a la rama;
- quitar las cuatro entradas `ficha: "SL-8"` de `EXCEPCIONES_DOMINIO`;
- reescribir esas 7 líneas sin el literal, por ejemplo «el dominio de Ordenex». No vale añadir una
  excepción: la guardia solo admite excepciones temporales con una ficha que las retire;
- volver a correr `pnpm run test:guardias` sobre el resultado.

No hace falta nada más del merge: el typecheck y los tests de componentes del diff salen verdes sobre el
árbol simulado.

### m1 — menor: R6 sin test en tres superficies
`recuperar-contrasena`, `postulacion` y `paquete/[numGuia]` declaran bien `fondo` y `ancho`, pero ningún
test fija su valor. El typecheck solo obliga a declarar `fondo`, no a que sea el correcto. Se arregla
con un caso por página en `tests/integration/{recuperar-contrasena,postulacion}-page.test.tsx`, que ya
existen.

### m2 — menor: logo duplicado en el árbol de accesibilidad de la barra lateral
`Sidebar.tsx` deja los dos `<Logo>` siempre montados y los cruza por opacidad. Los dos tienen
`alt="Servi Logistic"`, así que un lector de pantalla oye el nombre dos veces, una de ellas con la imagen
invisible. Antes ya era así: se heredó el patrón. Se arregla con `alt=""` o `aria-hidden` en la variante
oculta, o con un `alt` vacío en el isotipo.

### m3 — menor: comentario con cifras viejas en `RankingPodio.tsx:38-39`
El comentario dice 7.3 y 12.7, que eran las cifras de la marca anterior; hoy miden 8.79 y 12.84. La
bitácora ya lo anota.

### m4 — menor: el `beforeAll` del E2E también condiciona los casos sin sesión
El usuario se crea en un `beforeAll` común a todo el archivo. Si la base del CI no tiene `admin` o un tipo
de identificación, caen también los cuatro casos de landing y login, que no necesitan sesión. El E2E del CI
es informativo y su siembra está ABIERTA en `gate.yml`, así que no bloquea. Mover la sesión a un `describe`
propio aislaría el fallo.

### m5 — menor, fuera de alcance: navy de la marca anterior en la landing
Los títulos de sección siguen en `asfalto-9` (`#0d2444`) y el fondo de postulación en `kraft-inset`
(`#f1f4fb`). Se ve en las capturas. «Lo que NO entra» lo deja fuera, y la bitácora pide ficha.

## Veredicto

**RECHAZADO.** Hay 2 bloqueantes:
- **B1:** R23 no tiene test.
- **B2:** la rama no integra en verde con `dev` `135037f`, porque se pone roja la guardia
  `dominio-ordenex-fuera`: 4 excepciones de SL-8 que sobran y el dominio de origen literal en 7 líneas de los
  specs de SL-8.

Lo demás está bien:
- la marca, la paleta, el tema oscuro, la fuente y `lib/config/marca.ts`;
- la sección de postulación;
- las cifras de contraste, que coinciden con las capturas;
- el E2E sin `skip`.

Para la vuelta 2 basta con revisar el diff que arregla B1 y B2.

## Vuelta 2 (acotada a 0a07f0c..394da1b)

Revisado el diff de la vuelta, sin contar lo que trae `dev`: commits `72eb95a`, `88d90ee`, `5cb0c45`
y `394da1b`, más el merge `ac9208a`. HEAD `394da1b`. `dev` de hoy: `55f18ac`.

### Verificación ejecutada por el reviewer

| Qué | Resultado |
|---|---|
| Merge `ac9208a` (`0a07f0c` + `55f18ac`) | `diff-tree --cc` vacío: no hubo resolución a mano |
| Integración con `dev` `55f18ac` | `55f18ac` ya es ancestro de `394da1b`: el merge es *fast-forward* y `merge-tree` no da conflictos |
| `pnpm run typecheck` | verde |
| `eslint` sobre los 7 archivos de código y tests de la vuelta | 0 errores |
| `vitest run` de `tests/unit/config`, `Logo`, `Sidebar`, `LandingPage`, `LoginPage` y `RankingPodio*` | 36 archivos, 342 tests, todo verde |
| `pnpm run test:guardias` | 287 verdes, 2 saltados y 1 rojo, `dependencias-declaradas-presentes`, que está en el baseline. `dominio-ordenex-fuera` en verde |
| Mutaciones de R23 en `app/layout.tsx`, una cada vez y revertidas: `title` = «Otra», `description` sin `MARCA` y `apple-mobile-web-app-title` = «Otra» | las tres dan rojo, 1 test de 3 cada una |
| Grep de R26 sobre `git diff --name-only 55f18ac..HEAD` | salen los specs de SL-8 y este review, los dos fuera de «Archivos esperados», y la guardia de dominio (ver abajo) |
| el dominio de origen literal en `specs/SL-8-*` | 0 líneas |

### Hallazgos de la vuelta 1

- **B1, cerrado.** `tests/unit/config/marca-layout.test.ts` afirma tres cosas contra el literal «Servi
  Logistic», que es el contrato:
  - el `title`;
  - que la `description` contiene el nombre;
  - el `content` de `meta[name="apple-mobile-web-app-title"]`, renderizando el layout.

  Las tres mutaciones lo ponen rojo.
- **B2, cerrado.**
  - Se quitaron las 4 entradas `ficha: "SL-8"` de `EXCEPCIONES_DOMINIO`.
  - Las 7 líneas del spec dicen ahora «el dominio de Ordenex». Es un cambio de redacción, sin efecto en
    los requisitos.
  - La guardia del dominio sale verde sobre la rama, que ya contiene el `dev` de hoy.
- **R26 y la guardia de SL-14.** `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` contiene
  «ordenex» en su nombre y en su texto, pero SL-8 solo le borró líneas: 0 líneas añadidas frente a
  `55f18ac`. Se acepta como excepción, por decisión del leader. Está listado en «Archivos esperados» con
  su motivo.
- **m2, cerrado.**
  - `Logo` recibe la prop `oculto`, que pone `aria-hidden`.
  - `Sidebar` la pasa a la variante que no se ve, según `state` y `isMobile` de `useSidebar()`. Ese hook
    ya se usaba en el mismo archivo, dentro del `SidebarProvider` del layout.
  - Los tests afirman que hay una sola imagen accesible por estado y que las dos siguen montadas.
- **m3, cerrado.** `RankingPodio.tsx:38-39` dice ahora 8.79 y 12.84.
- **m1 y m4, siguen abiertos.** Son menores y no se tocaron en esta vuelta: no bloquean.
- **m5** queda fuera de alcance, como en la vuelta 1.

### Hallazgos nuevos

- **menor:** el test de R23 no distingue `MARCA.nombre` de un literal «Servi Logistic» escrito a mano en
  el layout. Basta como contrato. Que el valor salga del módulo lo ve la lectura del código
  (`app/layout.tsx:24-25, 53`). Decidido sin consultar, porque el humano no está disponible: no bloquea.

Ninguna regresión en el diff de la vuelta.

### Veredicto vuelta 2

**OK.** 0 bloqueantes. La rama integra limpia con `dev` `55f18ac` en *fast-forward*.
