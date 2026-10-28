# SL-9 — Diseño: capturas e iconos de la PWA con la marca nueva

## Lo que ya existe

Búsqueda hecha el 2026-10-28 en el board (`feature_list.json`, todos los estados), en `specs/` y en el
código. El MCP del grafo no estaba disponible para este agente, así que el código se buscó con Grep.
Términos: `screenshots`, `captura`, `icono_`, `KpisMensajero`, `purple-200`, `marca`, `lucide`.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | SL-8 `marca-logo-paleta-fuente` (done) | Es la dependencia. Dejó a SL-9 las capturas y los `icono_*` (su `requirements.md`, «Lo que NO entra»). Se reutilizan su `Logo`, sus tokens y `tests/fixtures/contraste.ts`. |
| Board | SL-33 `paleta-secundaria` (pending) | Sin solape: los restos de color fuera de `KpisMensajero` son suyos (alcance de SL-9). SL-9 no toca `--chart-*`, `muted-foreground` ni `asfalto-*`. |
| Board | SL-35 `landing-por-empresa` (pending), SLT-32 `login-exige-empresa` (in_progress), SLT-41 `selector-empresa-login` (pending) | Cambiarán `/` o `/login`, y con ello lo que muestran las capturas. SL-9 no toca esas páginas. Por eso el script es repetible: quien cambie una de esas pantallas lo vuelve a correr. |
| `specs/` | `164-instalar-pwa` (historia): las capturas se tomaron con Playwright contra el servidor, ocultando `nextjs-portal`; descartó generarlas con `sharp` | Se sigue el mismo método, ahora como script versionado. |
| `specs/` | `284-pwa-correcta`: `scripts/generate-pwa-icons.mjs` | Patrón de script de assets: `.mjs`, Node puro, cabecera con el uso, dependencia cargada con `import()` dinámico. |
| Código | `public/manifest.json`, `screenshots` (3 entradas) | No se toca: nombres, tamaños y `label` se quedan. |
| Código | `tests/unit/pwa/manifest.test.ts` y `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` ya comprueban que cada captura existe y mide lo que declara | Se reutilizan para R1. No se tocan. |
| Código | `tests/unit/guards/pwa-servida-sin-sesion.guardia.test.ts` cita `/screenshots/inicio-narrow.png` | El nombre no cambia: sigue verde sin tocarlo. |
| Código | `app/(app)/mis-asignaciones/_components/KpisMensajero.tsx`: único consumidor de los 4 `icono_*.png` | Se edita. |
| Código | `tests/components/textos-estado-455.test.tsx` renderiza `KpisMensajero` y afirma «Entregado» | No se toca; cubre parte de R16. |
| Código | `lucide-react` ya se usa en 93 archivos de `app/(app)/`: `Truck`, `PackageCheck`, `HandCoins` y `Wallet` ya se importan en el repo | Se usan esos cuatro: existen en la versión instalada. |
| Código | `tests/unit/guards/estado-con-info.guardia.test.ts:217` censa `KpisMensajero.tsx` | Mira rótulos de estado, no iconos: R16 lo deja verde. |

## Modelo de datos, autorización y país

No aplica:
- no hay tablas, RLS, migraciones ni `organizacion_id`;
- no hay autorización nueva ni módulo que encender. Las capturas son de pantallas sin sesión, y
  `KpisMensajero` sigue bajo la autorización que ya tiene `/mis-asignaciones/reparto`;
- nada depende del país.

## Dependencias

Ninguna nueva. `@playwright/test` (navegador de las capturas), `lucide-react` (iconos) y `sharp`
(lectura de píxeles en la guardia) están aprobadas en `docs/dependencias.md` y en `package.json`.
El script usa el `chromium` que ya instala el E2E. Si falta en la máquina, el script lo dice con
`pnpm exec playwright install chromium`, que es un binario de `@playwright/test`, no un paquete.

## D1 — Script `scripts/capturas-pwa.mjs` (R2, R5–R10)

Node puro, en LF (guardia `finales-de-linea-lf`). Mismo formato que `generate-pwa-icons.mjs`:
cabecera con el porqué y el uso.

```
Uso: node scripts/capturas-pwa.mjs
     CAPTURAS_URL=http://localhost:3044 node scripts/capturas-pwa.mjs
```

**Quién levanta la app.** El script no la levanta: la espera servida en `CAPTURAS_URL` (por defecto
`http://localhost:3000`). Lo recomendado, en la cabecera, es `pnpm build && pnpm start`: sin
indicador de desarrollo y con las fuentes ya servidas. Con `pnpm dev` también vale, porque oculta el
indicador (paso 4). `/` y `/login` no necesitan sesión ni base: `/` no lee datos, y `/login` solo
consulta la base si llega con la cookie de sesión, que un contexto nuevo de Playwright no tiene.

**Partes puras, exportadas y probadas sin navegador.** El script exporta tres funciones, y solo
ejecuta `main()` cuando se lanza directamente
(`import.meta.url === pathToFileURL(process.argv[1]).href`, como `scripts/tests-de-arbol.mjs`).
`@playwright/test` se carga con `import()` dentro de `main()`: importar el script desde vitest no
abre ningún navegador.

```js
/** Captura → pantalla. Única tabla escrita a mano (R2). */
export const PANTALLA_POR_CAPTURA = {
  "/screenshots/inicio-narrow.png": "/",
  "/screenshots/ingreso-narrow.png": "/login",
  "/screenshots/inicio-wide.png": "/",
};

/**
 * Plan desde el manifiesto (R5, R6). Lanza Error si una captura del manifiesto no tiene pantalla
 * o si una pantalla de la tabla no está en el manifiesto.
 * @returns {Array<{ src, ruta, ancho, alto, viewport: { width, height }, escala }>}
 */
export function planDeCapturas(manifiesto) {}

/** R7. Devuelve la URL normalizada o lanza Error si el host no es localhost ni 127.0.0.1. */
export function urlBaseLocal(texto) {}

/**
 * R9. Recibe lo observado en la página y devuelve la lista de motivos de fallo (vacía = se puede
 * capturar).
 * @param {{ texto: string, logos: string[], archivoCargada: boolean, indicadorVisible: boolean }} o
 * @returns {string[]}
 */
export function fallosDePantalla(o) {}
```

**Tamaños.** `ancho` y `alto` salen del `sizes` del manifiesto. El viewport se deriva así:
- `narrow`: ancho CSS de 360 px (el móvil que mide SL-8, R8) y `escala = ancho / 360`. Para 540×1170
  da un viewport de 360×780 con `deviceScaleFactor` 1.5. Si la división no da un alto entero,
  `planDeCapturas` lanza Error.
- `wide`: viewport igual al tamaño y escala 1.

**`main()`, en orden:**
1. `urlBaseLocal(process.env.CAPTURAS_URL ?? "http://localhost:3000")` (R7).
2. Lee `public/manifest.json` y llama a `planDeCapturas` (R6). Un error aquí corta antes de abrir
   el navegador.
3. `fetch` de la URL base. Si falla o no da 2xx, sale con
   `La app no responde en <url>: arráncala con pnpm build && pnpm start` y código 1 (R8).
4. Lanza `chromium` y, por captura, crea un contexto con su viewport, su `deviceScaleFactor`,
   `colorScheme: "light"` y `reducedMotion: "reduce"`. Abre la ruta con `waitUntil: "networkidle"`,
   inyecta `nextjs-portal { display: none !important }`, espera a `document.fonts.ready` y a que
   todas las `img` estén `complete`.
5. Observa en la página: `document.body.innerText`; los `src` de los `img` visibles cuyo `src`
   contiene `/brand/`; `document.fonts.check("16px Archivo")`; y si hay un `nextjs-portal` con
   `display` distinto de `none`. Pasa el resultado a `fallosDePantalla`.
6. **Todo o nada.** Hace las tres capturas en memoria (`page.screenshot({ type: "png",
   animations: "disabled", caret: "hide" })`, solo el viewport) y solo escribe en
   `public/screenshots/` si las tres pasan el paso 5. Si una falla, sale con código 1, la pantalla y
   sus motivos, y no escribe ninguna (R9).
7. Escribe los tres PNG, relee la cabecera IHDR de cada uno y compara con el `sizes` (R10). Imprime
   una línea por captura: ruta, pantalla y tamaño.

Por qué todo o nada: si se escribiera una y fallara la siguiente, `public/screenshots/` quedaría con
capturas de dos versiones de la app y nada se pondría rojo.

## D2 — Guardia de las capturas (R3, R4, R13)

`tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts`. Su nombre contiene `guard`, así que
corre siempre (`arnes.config.json > gate.siempre`). Hace falta: un cambio en un PNG no lo relaciona
ningún grafo de imports.

**R3, huellas de la marca anterior.** Una constante `HUELLAS_MARCA_ANTERIOR` con el SHA-256 de las
tres capturas tal como están hoy en `dev`. Se calculan en T1, antes de regenerar, y se escriben como
literales con su nombre de archivo. El caso afirma que el SHA-256 de cada captura actual no es su
huella.

**R4, píxeles.** Con `sharp` (`.raw()`, como hace `pwa-manifiesto-atajos` con las esquinas), por cada
captura se cuenta la fracción de píxeles a distancia euclídea RGB ≤ 24 de cada color:
- **marca anterior:** naranja `#f26419` y navy `#0b2545` (`specs/SL-8-marca-logo-paleta-fuente/design.md
  > D5`). La suma tiene que ser **< 0.5 %**;
- **marca nueva:** negro `#111111` y amarillo `#FFD000`. La suma tiene que ser **≥ 1 %**.

Los umbrales son de partida. T1 mide las fracciones en las capturas viejas y T4 en las nuevas, y las
dos medidas van a `progress/impl_SL-9.md`. Los umbrales se fijan entre las dos, con margen. La guardia
tiene que dar rojo con las capturas viejas: es su prueba de que muerde. Si las medidas no dejan un
hueco claro (por ejemplo, por la foto del héroe), T4 se para y se avisa al leader, en vez de aflojar
el umbral.

**R13, iconos borrados.** Dos casos:
- los cuatro `public/icons/icono_*.png` no existen;
- un recorrido de `app/`, `components/`, `lib/` y `public/`, sin `node_modules` ni carpetas que
  empiecen por punto, no encuentra en ningún archivo de texto los nombres `icono_envios`,
  `icono_entregadas`, `icono_wallet` ni `icono_transacciones`.

El recorrido lleva un caso de anti-vacuidad: lee más de 100 archivos y encuentra
`KpisMensajero.tsx`.

## D3 — `KpisMensajero`: iconos de `lucide-react` (R11, R12, R16)

`Tile.icon: string` pasa a `Tile.Icono: LucideIcon`, el tipo que ya usan `LandingPostular.tsx` y
`FilaComposicion.tsx`:

| Indicador | Antes | Icono | Por qué |
|---|---|---|---|
| Pendientes | `icono_envios.png` | `Truck` | Órdenes en reparto. Es el icono de reparto del `Sidebar`. |
| Entregado | `icono_entregadas.png` | `PackageCheck` | Paquete entregado. Ya se usa así en `RecogerPaqueteCard` y `GestionarOrdenPanel`. |
| Por cobrar | `icono_wallet.png` | `HandCoins` | Contra entrega por recaudar: dinero que se recibe en mano. |
| Total a cobrar | `icono_transacciones.png` | `Wallet` | El total acumulado. |

El `<img>` y su `eslint-disable` se van. Cada icono va dentro de un círculo:

```tsx
<span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
  <tile.Icono className="size-7" strokeWidth={1.75} aria-hidden="true" />
</span>
```

`size-14` mantiene el hueco de 56 px del PNG, así que la tarjeta no cambia de alto.

**Colores (R12).** Son tokens que ya giran con el tema, con cifras de `docs/marca.md` y de
`app/globals.css`:

| Tema | Fondo (`--accent`) | Trazo (`--accent-foreground`) | Contraste |
|---|---|---|---|
| claro | `#FFF8D9` | `#111111` | 17.70 |
| oscuro | `#352E0E` | `#FFD000` | 9.22 |

No hay amarillo sobre claro: el amarillo solo aparece en oscuro, sobre `#352E0E`. La guardia de
SL-8 (`marca-texto-amarillo`) no censa `text-accent-foreground`, así que no la toca.

**Test** `tests/components/KpisMensajero.test.tsx`:
- R11: hay 4 `svg` con las clases `lucide-truck`, `lucide-package-check`, `lucide-hand-coins` y
  `lucide-wallet`, todas distintas y dentro de un `aria-hidden="true"`; no hay ningún `img`.
- R12: el contenedor del icono lleva `bg-accent` y `text-accent-foreground`. Con
  `contraste(token(tema, "accent-foreground"), token(tema, "accent"))` del fixture, el resultado es
  ≥ 3 en `claro` y en `oscuro`, y en `claro` el trazo no es `#FFD000`.
- R16: los cuatro rótulos y las cuatro cifras de unos KPIs de prueba.

## D4 — Brillo al pasar el cursor (R14, R15)

En la `className` de la `Card`, solo cambian dos utilidades:

| Antes | Después |
|---|---|
| `before:from-purple-200` | `before:from-brand-soft` |
| `before:to-white` | sin cambio |

`brand-soft` es `#FFF8D9` = `componer(#FFD000, #FFFFFF, 0.15)`, un tono de la paleta, fijo en los dos
temas (SL-8, D3). El rótulo y la cifra en claro son `text-muted-foreground` (`#4a5368`) y
`text-foreground` (`#111111`).

`dark:before:from-white/10 dark:before:to-transparent` se queda tal cual (R15): en oscuro ese par
pisa a `from-brand-soft`, que de otro modo blanquearía la tarjeta, el mismo defecto que arregló la
feature 208. El comentario de la tarjeta se reescribe: dice el tono nuevo y por qué el oscuro no
cambia, sin nombrar el morado.

**Test** en `tests/components/KpisMensajero.test.tsx`:
- R14: la `className` de cada tarjeta no contiene `purple-` y contiene `before:from-brand-soft`.
  `contraste(token("claro", "muted-foreground"), paleta("brand-soft"))` ≥ 4.5 y
  `contraste(token("claro", "foreground"), paleta("brand-soft"))` ≥ 4.5. `paleta()` ya lee
  `--color-brand-soft: #FFF8D9;` de `@theme inline` (`app/globals.css:179`).
- R15: contiene `dark:before:from-white/10` y `dark:before:to-transparent`.

## D5 — «Ordenex» (R17)

Ningún archivo de la lista de `tasks.md > Archivos esperados` tiene que contener «ordenex». Hoy
`KpisMensajero.tsx` y `docs/marca.md` no lo tienen. Los archivos nuevos se escriben sin él, también
en comentarios: hablan de «la marca anterior» o «el nombre anterior».

El script (R9) y su test tienen que buscar ese nombre sin escribirlo. Siguen el precedente de
`e2e/marca.spec.ts:30`: `const NOMBRE_ANTERIOR = ["orden", "ex"].join("");`, con un comentario que
dice por qué va partido. La comparación es sobre `innerText.toLowerCase()`, así que cubre cualquier
combinación de mayúsculas. El caso sintético del test arma su texto con esa misma constante.

Se comprueba en el cierre con:

```bash
git diff --name-only --diff-filter=d dev...HEAD -- . ':!*.png' ':!specs/' ':!progress/' | xargs grep -il ordenex
```

La salida tiene que ser vacía, y se pega en `progress/impl_SL-9.md`. Se excluyen:
- los PNG, porque son binarios. El texto de las capturas lo cubre R9 al generarlas;
- los archivos borrados (`--diff-filter=d`), que ya no existen;
- el spec y `progress/` (excepción de R17).

## D6 — `docs/marca.md`

Se renombra la sección «Pendiente (SL-9…)» a «Hecho en SL-9», con tres puntos:
- las capturas de `public/screenshots/` se generan con `node scripts/capturas-pwa.mjs` y se vuelven
  a generar cuando cambian `/` o `/login`;
- los indicadores del mensajero usan iconos de `lucide-react` sobre `--accent`, y los `icono_*.png`
  se borraron;
- el brillo de esas tarjetas es `brand-soft` en claro.

## Alternativas descartadas

- **A. Las capturas como un spec de `e2e/`.** La guardia `e2e-sin-saltos` obliga a meter cada
  `e2e/*.spec.ts` en un proyecto de `playwright.config.ts`, y entonces correría en CI en cada PR a
  `prod`, escribiendo en `public/` desde un job de verificación. Además arrastraría el `webServer`
  del E2E, con el doble de Storage, la base y los secretos, que dos pantallas sin sesión no
  necesitan. Generar assets no es verificar.
- **B. Que el script levante la app** (reutilizando `e2e/_servidor-app.mjs`). Habría que gestionar
  el puerto, el build, el apagado en Windows y el log, para ahorrar un comando. El script quedaría
  ligado a cómo arranca hoy el E2E. Se descarta: el script pide la app arrancada y dice cómo
  arrancarla (R8).
- **C. Componer las capturas con `sharp`** a partir del logo y la paleta. Ya lo descartó la 164:
  serían imágenes inventadas presentadas como capturas de la app en el diálogo de instalación.
- **D. Viewport `narrow` de 540 px CSS con escala 1.** Da el tamaño, pero 540 px CSS no es un móvil:
  la landing pintaría su maquetado intermedio, no el de teléfono que mide SL-8 a 360 px. Con 360×780
  a escala 1.5 se obtienen los mismos 540×1170 con el maquetado real de móvil.
- **E. Iconos `lucide` sueltos en `text-brand`, sin círculo.** También son válidos por contraste
  (negro en claro, amarillo sobre la tarjeta oscura: 11.6). Pero un trazo de 28 px en un hueco de
  56 px deja la tarjeta descompensada frente a los PNG de antes, que eran ilustraciones llenas. El
  círculo `bg-accent` conserva el peso visual, con tokens que ya tienen sus cifras medidas.
- **F. Comprobar R3 y R4 en un test de `tests/unit/pwa/`.** No lo seleccionaría `vitest related`
  cuando cambia un PNG, así que solo correría en CI. En `guards/` corre en cada gate local.

## Riesgos

- **Foto del héroe en `/`.** Puede tener píxeles cerca del naranja. D2 lo trata midiendo antes de
  fijar el umbral, y si no hay hueco, parando y avisando.
- **SLT-32 y SL-35 cambian `/login` y `/`.** Las capturas de SL-9 quedarán viejas cuando entren. No
  es un defecto de SL-9: el script existe para eso, y D6 lo deja escrito en `docs/marca.md`.
- **Fuente no cargada al capturar.** Con `pnpm dev`, Archivo puede tardar. El paso 5 de D1 lo
  convierte en un fallo explícito y no en una captura con la fuente de respaldo, el mismo fallo mudo
  que documenta `generate-pwa-icons.mjs`.
- **CRLF.** `scripts/*.mjs` tiene que ir en LF (guardia `finales-de-linea-lf`).
