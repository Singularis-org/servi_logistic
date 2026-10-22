# SL-8 — Logo, paleta y fuente de Servi Logistic en la interfaz

> Zona: frontend · Complejidad: medium · depends_on: — · Épica: SL-7 (Fase 7 — Marca) ·
> Rama: `feature/SL-8-marca-logo-paleta-fuente`
>
> **Alcance.** La interfaz deja de verse como Ordenex y pasa a la marca de `docs/marca.md`:
> 1. `components/shared/Logo.tsx` pinta los SVG de `public/brand/`, eligiendo la variante clara u
>    oscura según el fondo y el isotipo por debajo de 140 px.
> 2. Los tokens de color de `app/globals.css` pasan a la paleta de `docs/marca.md`. Sin texto
>    amarillo sobre fondo claro en ningún sitio del árbol: un token que cambia de valor cambia en todos
>    sus consumidores, no solo en las tres pantallas.
> 3. Se define el tema oscuro de la marca, que no existía, y se añade a `docs/marca.md`.
> 4. La interfaz usa la fuente Archivo, cargada con `next/font/google`.
> 5. Se crea `lib/config/marca.ts` con la forma que fija el spec de SL-15 (§3). El nombre visible en
>    login, layout (raíz y portal) y landing sale de ahí y dice «Servi Logistic».
> 6. Ningún archivo que SL-8 toca conserva «Ordenex», ni en comentarios ni como el dominio de Ordenex.
>
> Se verifica en el navegador, con capturas, y no solo con tests.
>
> **Lo que NO entra.**
> - El resto de «Ordenex» en archivos que SL-8 no toca → SL-15. Entre ellos `cierre-factura.tsx` y
>   `GestionarOrdenPanel.tsx`: el diseño los deja intactos a propósito (`design.md > D6`).
> - El dominio de Ordenex en archivos que SL-8 no toca → SL-14. Los de `LandingNav.tsx`, `primitivas.tsx`,
>   `app/page.tsx` y `globals.css` los cede SL-14 y entran.
> - Las series `--chart-1` y `--chart-2` (naranja y navy de Ordenex en analítica) → ficha aparte.
> - Los grises fríos del tema claro (`--muted-foreground`, `--secondary`, `--muted`, `--border`,
>   `--input`, `asfalto-*`) y `ink-blue`, `hivis` → fuera.
> - Los colores semánticos `success`/`warning`/`danger`/`info` y sus `-soft`/`-strong` no cambian de
>   valor.
> - Capturas de la PWA (`public/screenshots/`) e iconos `public/icons/icono_*.png` → SL-9.
> - `public/manifest.json` y su guardia `pwa-manifiesto-atajos`: ya tienen `#111111` y `#F7F7F5`. SL-8
>   no los cambia, así que no toca el test que fija SL-10.
> - Renombrar las utilidades (`brand`, `navy`…): se conservan como alias
>   (`design.md > Alternativas descartadas`).
> - El marcador fijo `#f26419` del mapa (`UbicacionMapaInner.tsx`): queda como hallazgo.
> - Seeds: no hay, y SL-8 no añade ninguno. El usuario de las capturas lo crea la propia
>   verificación (D13).

## Decisiones cerradas (no reabrir)

| # | Decisión | Origen | Cubierta por |
|---|---|---|---|
| D1 | La verificación incluye ver la app en el navegador, con capturas de login, layout autenticado y landing; no basta con los tests. | Issue SL-8; humano (vía leader, 2026-10-21) | R27, R28 |
| D2 | `next/font/google` es parte de `next` (16.2.10, aprobada en `docs/dependencias.md`): no es dependencia nueva. | Humano; `package.json`, `app/layout.tsx` | R20 |
| D3 | SL-8 cambia el nombre en login, layout y landing; el resto de los archivos es de SL-15. | Issue SL-8; descripción de SL-15 | R23, R24, R25 |
| D4 | Nunca texto amarillo sobre blanco ni sobre el fondo claro. | Issue SL-8; `docs/marca.md > Paleta` | R15, R16 |
| D5 | Si SL-8 cambiara los colores del manifiesto, actualizaría el test de SL-10. No los cambia: ya son los de la marca. | Humano; spec de SL-10, R10 | R29 |
| D6 | Fuente de verdad: `docs/marca.md` y `public/brand/`. Nunca recursos de Ordenex. | Leader; `docs/perfil-agentes.md` | R1, R9 |
| D7 | El tema oscuro lo define este spec: fondo `#111111`, tarjetas `#1C1C1A`, texto `#F7F7F5`, acento amarillo, grises como mezclas. Va a los tokens y a `docs/marca.md > Tema oscuro`, con cifras de contraste. | Humano, respuesta a P1 (2026-10-21) | R10, R11 |
| D8 | `--chart-1` y `--chart-2` van a una ficha aparte. | Humano, P2 | «Lo que NO entra»; R13 los excluye |
| D9 | Los grises cálidos del tema claro, fuera. | Humano, P3 | «Lo que NO entra» |
| D10 | Pie de la landing: «© 2026 · Servi Logistic», sin «Costa Rica» ni «S.A.». | Humano, P4 | R25 |
| D11 | Isotipo sobre fondo oscuro: `isotipo-mono-blanco.svg`. | Humano, P5 | R4, R7 |
| D12 | Tinte suave del acento: `#FFF8D9`. | Humano, P6 | R9 |
| D13 | No hay seeds. El usuario de las capturas del portal es un `admin` que crea la propia verificación en la base local migrada de la feature, como un fixture de E2E. No se versiona como semilla. Superadmin no es `maestro` (es un rol nuevo, SL-32) y SL-11 no crea ningún usuario, así que T13 no depende de SL-11: solo necesita la base local migrada. | Humano, P7, corregida el 2026-10-21 | R27 |
| D14 | SL-8 crea `lib/config/marca.ts`. `MARCA.nombre` es «Servi Logistic», la plataforma; nunca la empresa usuaria. `EMPRESA` nunca vale «Servi Logistic»: su valor de transición lo fija SL-15, y si no lo ha fijado, SL-8 crea solo `MARCA`. Lo de la landing y el layout sale de ahí, no a mano. | Humano (vía leader, corrección del 2026-10-21) | R22, R23, R25 |
| D15 | SL-8 absorbe los comentarios con el dominio de Ordenex de `LandingNav.tsx`, `primitivas.tsx`, `app/page.tsx` y `globals.css` (los cede SL-14). | Humano (vía leader) | R26 |
| D16 | «Ordenex» desaparece del todo de los archivos que SL-8 toca. | Humano (vía leader) | R26 |

## Requisitos (EARS)

### Logo

- **R1.** El componente `Logo` DEBE pintar uno de los SVG de `public/brand/` como imagen, con nombre
  accesible igual a `MARCA.nombre`, y NO DEBE pintar texto.
- **R2.** CUANDO `Logo` se pinta sobre fondo claro con un ancho de 140 px o más, el sistema DEBE usar
  `logo-horizontal-fondo-claro.svg`.
- **R3.** CUANDO `Logo` se pinta sobre fondo oscuro con un ancho de 140 px o más, el sistema DEBE usar
  `logo-horizontal-fondo-oscuro.svg`.
- **R4.** SI el ancho pedido a `Logo` es menor de 140 px, ENTONCES el sistema DEBE usar el isotipo:
  `isotipo.svg` sobre fondo claro e `isotipo-mono-blanco.svg` sobre fondo oscuro.
- **R5.** El sistema DEBE declarar en la imagen del logo un ancho y un alto que respeten la proporción
  del `viewBox` de su archivo (733 × 214 el horizontal, 1 : 1 el isotipo), con un margen de 1 px.
- **R6.** Cada uso de `Logo` DEBE declarar el fondo de la superficie donde se pinta:
  - **oscuro** en el panel de marca de login, recuperar contraseña y postulación, en la barra lateral
    del portal y en la barra y el pie de la landing;
  - **claro** sobre `bg-background`, es decir, en la cabecera móvil de esas páginas y en
    `paquete/[numGuia]`.
- **R7.** MIENTRAS la barra lateral del portal está colapsada, el sistema DEBE mostrar
  `isotipo-mono-blanco.svg`, y no `public/icons/icon-192.png`.
- **R8.** MIENTRAS la landing se ve en una pantalla de 360 px de ancho, su barra superior NO DEBE
  provocar desplazamiento horizontal.

### Paleta

- **R9.** En tema claro (`:root, .tema-claro`), los tokens de identidad DEBEN valer lo que fija
  `design.md > D3`: fondo `#F7F7F5`, texto y primario `#111111`, barra lateral `#1C1C1A`, acento
  `#FFD000` y tinte suave `#FFF8D9`. Todo valor que no esté en la paleta DEBE ser una mezcla declarada
  de dos colores de ella.
- **R10.** En tema oscuro (`.dark`, y `.tema-sistema` bajo `prefers-color-scheme: dark`), los tokens
  de identidad DEBEN valer lo que fija `design.md > D4`.
- **R11.** `docs/marca.md` DEBE tener una sección «Tema oscuro» con cada token de D4, su hex y su cifra
  de contraste. Cada hex de esa tabla DEBE coincidir con el valor del token en `app/globals.css`.
- **R12.** Los bloques que el CSS repite DEBEN seguir siendo espejo exacto, hex a hex:
  - `.tema-sistema` igual a `.dark`;
  - los dos bloques de impresión iguales a `:root, .tema-claro`.
- **R13.** Ningún token de identidad (los de D3 y D4) DEBE conservar un hex o un `rgba` del naranja o
  del navy de Ordenex (lista en `design.md > D5`).
- **R14.** Las utilidades de marca `brand` y `brand-foreground` DEBEN girar con el tema: `#111111` y
  `#ffffff` en claro, `#FFD000` y `#111111` en oscuro.
- **R15.** SI una clase de texto sin prefijo `dark:` se resuelve a `#FFD000` en tema claro, ENTONCES el
  archivo DEBE figurar en el censo de superficies oscuras fijas de la guardia de marca, con la
  superficie y su contraste medido. Cualquier otra aparición DEBE hacer fallar el gate.
- **R16.** SI un elemento tiene como fondo la utilidad de marca o el acento opacos y declara una clase
  de texto, ENTONCES esa clase DEBE dar 4.5:1 o más contra ese fondo en los dos temas. Sobre fondo
  amarillo, eso quiere decir texto `#111111`.
- **R17.** SI en el portal (`app/(app)/`, `components/`) una clase de texto sin `dark:` se resuelve al
  negro fijo `#111111` (no a un token que gire), ENTONCES la misma lista de clases DEBE cumplir una de
  dos cosas:
  - declarar su variante `dark:`, o
  - pintar el texto sobre un fondo claro fijo, que figure en el censo de la guardia con su contraste.
- **R18.** Los pares de texto y fondo que miden las guardias de contraste DEBEN quedar en 4.5:1 o más
  (texto) y en 3:1 o más (indicadores, WCAG 1.4.11), en los dos temas. Un suelo medido solo DEBE
  bajar cuando lo explica el cambio de fondo de la marca, y nunca por debajo de esos umbrales. Cada
  bajada se escribe con su cifra.
- **R19.** CUANDO el usuario enfoca un control del portal con el teclado, el anillo de foco DEBE medir
  3:1 o más contra las seis superficies de la guardia de contraste, en los dos temas.

### Fuente

- **R20.** El layout raíz DEBE cargar Archivo con `next/font/google` como `--font-sans`, y NO DEBE
  cargar Poppins.
- **R21.** CUANDO se pinta cualquier pantalla, la primera familia de la pila computada del `<body>` y
  de los encabezados DEBE ser la que `next/font` genera para Archivo (su nombre contiene «Archivo»), y
  esa fuente DEBE constar como cargada en el navegador.

### Nombre

- **R22.** `lib/config/marca.ts` DEBE exportar `MARCA = { nombre: "Servi Logistic" }` como
  constante `as const`, sin variables de entorno.
  - DONDE SL-8 exporta también `EMPRESA`, sus valores DEBEN ser el término de transición que fija
    el spec de SL-15 (hoy `enFrase` «la empresa», `alInicio` «La empresa», `membrete` `null`).
  - Ningún valor de `EMPRESA` DEBE ser igual a `MARCA.nombre` ni contener «Servi Logistic».
- **R23.** El layout raíz DEBE tomar de `MARCA.nombre` el título del documento, la descripción y
  `apple-mobile-web-app-title`.
- **R24.** El login y la barra lateral del portal NO DEBEN mostrar el texto «Ordenex» NI exponerlo como
  nombre accesible.
- **R25.** La landing DEBE tomar sus nombres de `lib/config/marca.ts`.
  - El nombre accesible del enlace de inicio de la barra y el pie («© 2026 · Servi Logistic», sin
    «Costa Rica» ni «S.A.») salen de `MARCA`.
  - La sección de postulación postula a la empresa que opera, no a la plataforma
    (`design.md > D8`), así que NO DEBE decir «Servi Logistic».
    - DONDE existe `EMPRESA`, el rótulo y los dos textos que hoy nombran a Ordenex DEBEN usar sus
      formas.
    - SI `EMPRESA` no existe, ENTONCES esos tres textos DEBEN quedar sin nombre propio.
- **R26.** Los archivos que modifica SL-8 (`tasks.md > Archivos esperados`) NO DEBEN contener
  «ordenex» en ninguna combinación de mayúsculas, incluidos los comentarios y el dominio de Ordenex.

### Verificación en el navegador

- **R27.** CUANDO la feature se da por terminada, DEBE haber capturas del navegador real de:
  - login a 1280 px y a 360 px;
  - layout autenticado con la barra lateral expandida y colapsada, en tema claro y en tema oscuro;
  - landing: barra y héroe, y pie.

  Se listan en `progress/impl_SL-8.md` con ruta, ancho y tema. Un caso saltado (`skip`) no cuenta.
- **R28.** CUANDO se toman esas capturas, el sistema DEBE medir en la misma sesión del navegador, por
  pantalla:
  - que ningún texto visible tiene color `#FFD000` sobre un fondo de luminancia clara;
  - que la fuente es la de R21;
  - que el texto visible no contiene «Ordenex»;
  - que el logo pintado es el que piden R2 a R4.

  Las cifras van a `progress/impl_SL-8.md`.

### Coherencia con el manifiesto

- **R29.** El `theme_color` de `public/manifest.json` y el `<meta name="theme-color">` del layout raíz
  DEBEN ser iguales al primario del tema claro (`#111111`), y el `background_color` del manifiesto
  DEBE ser igual al fondo del tema claro (`#F7F7F5`).

## Preguntas abiertas

Ninguna bloqueante. Las siete preguntas de la primera versión las respondió el humano el 2026-10-21
(D7 a D13).
