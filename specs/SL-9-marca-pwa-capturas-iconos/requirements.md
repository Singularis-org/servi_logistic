# SL-9 — marca-pwa-capturas-iconos · requirements.md

> **Zona** frontend · **Complejidad** low · **depends_on** SL-8 · **Rama** `feature/SL-9-marca-pwa-capturas-iconos`
>
> **Alcance.** Rehacer las tres capturas de `public/screenshots/` (inicio y login en móvil, inicio en
> escritorio) con la marca nueva, generadas por un script repetible con Playwright a los tamaños que
> declara `public/manifest.json`. Sustituir los cuatro `public/icons/icono_*.png` de los indicadores
> del mensajero (`KpisMensajero`) por iconos de línea de `lucide-react` con la paleta, y borrar esos
> PNG. Quitar el degradado morado al pasar el cursor por esas tarjetas.
>
> **Lo que NO entra.**
> - Los iconos de la app (`icon-*.png`, `badge-72.png`, `public/icons/fuente/`): ya llevan la marca nueva.
> - Pantallas con sesión en las capturas.
> - Otros restos de color de Ordenex fuera de `KpisMensajero` → SL-33.
>
> Sembrado por `/afinar-feature` el 2026-10-28. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Escritos por spec_author el 2026-10-28. La columna «Decisión» remite a la fila de la tabla de
decisiones cerradas por su pregunta: **Pantallas**, **Iconos**, **Degradado**, **Script**,
**Fuente** y **Ordenex**.

### Capturas de la PWA

- **R1 (ubicuo).** El sistema DEBE servir en `public/screenshots/` exactamente las tres capturas que
  declara `public/manifest.json`, con sus mismos nombres, `form_factor` y tamaños:
  `inicio-narrow.png` y `ingreso-narrow.png` a 540×1170, e `inicio-wide.png` a 1280×720. *(Pantallas)*
- **R2 (ubicuo).** Cada captura DEBE mostrar, sin sesión, su pantalla: `inicio-narrow` la página de
  inicio `/` a ancho de móvil, `ingreso-narrow` la página `/login` a ancho de móvil e `inicio-wide`
  la página de inicio `/` a ancho de escritorio. *(Pantallas)*
- **R3 (ubicuo).** Ninguna de las tres capturas DEBE ser idéntica, byte a byte, a la captura de la
  marca anterior con el mismo nombre. *(Pantallas, Fuente)*
- **R4 (ubicuo).** En cada captura, la fracción de píxeles con el naranja o el navy de la marca
  anterior DEBE quedar por debajo del umbral fijado en `design.md`, y la fracción de píxeles con el
  negro o el amarillo de `docs/marca.md` DEBE quedar por encima del suyo. *(Fuente)*
- **R5 (por evento).** CUANDO alguien ejecuta el script de capturas con la app servida en local, el
  sistema DEBE regenerar las tres capturas de R1, tomando nombres y tamaños de
  `public/manifest.json` y no de valores escritos en el script. *(Script)*
- **R6 (condicional).** SI `public/manifest.json` declara una captura a la que el script no sabe
  asignar pantalla, o si el script asigna pantalla a una captura que el manifiesto no declara,
  ENTONCES el script DEBE terminar con código distinto de 0, nombrando la captura, sin escribir
  ninguna. *(Script)*
- **R7 (condicional).** SI la dirección base de la app no es local (`localhost` o `127.0.0.1`),
  ENTONCES el script DEBE terminar con código distinto de 0 sin abrir el navegador. *(Fuente)*
- **R8 (condicional).** SI la app no responde en la dirección base, ENTONCES el script DEBE terminar
  con código distinto de 0 y un mensaje que diga qué dirección probó, sin escribir ninguna captura.
  *(Script)*
- **R9 (condicional).** SI la pantalla a capturar contiene el texto «Ordenex» (sin distinguir
  mayúsculas), o no muestra un logo servido desde `/brand/`, o no tiene cargada la fuente Archivo,
  o muestra el indicador de desarrollo de Next, ENTONCES el script DEBE terminar con código distinto
  de 0, nombrando la pantalla y el motivo, sin escribir ninguna captura. *(Fuente, Ordenex)*
- **R10 (condicional).** SI una captura escrita no mide lo que declara el manifiesto, ENTONCES el
  script DEBE terminar con código distinto de 0 nombrando la captura. *(Pantallas, Script)*

### Indicadores del mensajero (`KpisMensajero`)

- **R11 (ubicuo).** Cada uno de los cuatro indicadores del mensajero DEBE mostrar un icono de línea
  de `lucide-react`, distinto en cada indicador, decorativo (oculto a lectores de pantalla), y
  ninguno DEBE pintar una imagen de `public/icons/`. *(Iconos)*
- **R12 (ubicuo).** El icono de cada indicador y el fondo sobre el que se dibuja DEBEN ser tokens de
  la paleta de `docs/marca.md`, con un contraste de 3:1 o más entre ambos en tema claro y en tema
  oscuro, y sin amarillo sobre un fondo claro. *(Iconos, Fuente)*
- **R13 (ubicuo).** Los archivos `public/icons/icono_envios.png`, `icono_entregadas.png`,
  `icono_wallet.png` e `icono_transacciones.png` NO DEBEN existir, y ningún archivo de `app/`,
  `components/`, `lib/` ni `public/` DEBE nombrar `icono_envios`, `icono_entregadas`, `icono_wallet`
  ni `icono_transacciones`. *(Iconos)*
- **R14 (por evento).** CUANDO el cursor pasa por una tarjeta de los indicadores en tema claro, el
  brillo que aparece DEBE ser de un tono de la paleta de `docs/marca.md`, sin ninguna utilidad
  `purple-*`, y el rótulo y la cifra DEBEN conservar un contraste de 4.5:1 o más sobre el tono más
  intenso de ese brillo. *(Degradado)*
- **R15 (de estado).** MIENTRAS el tema es oscuro, el brillo al pasar el cursor por una tarjeta de
  los indicadores DEBE seguir siendo blanco al 10 % desvaneciéndose a transparente, como hoy.
  *(Degradado)*
- **R16 (ubicuo).** Los cuatro indicadores DEBEN conservar sus rótulos («Pendientes», «Entregado»,
  «Por cobrar», «Total a cobrar») y sus cifras. *(Iconos)*

### Ordenex

- **R17 (ubicuo).** Ningún archivo que esta feature crea o modifica DEBE contener «Ordenex» en
  ninguna combinación de mayúsculas, comentarios incluidos, salvo su propio spec
  (`specs/SL-9-marca-pwa-capturas-iconos/`) y su registro en `progress/`, que tienen que poder
  nombrar lo que se retira. *(Ordenex)*

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| Pantallas | R1, R2, R3, R10 |
| Iconos | R11, R12, R13, R16 |
| Degradado | R14, R15 |
| Script | R5, R6, R8, R10 |
| Fuente | R3, R4, R7, R9, R12 |
| Ordenex | R9, R17 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-28 | ¿Qué pantallas muestran las capturas? | Las mismas 3, rehechas: inicio móvil, login móvil, inicio escritorio. Mismos nombres y tamaños que declara el manifiesto. |
| 2026-10-28 | ¿Qué sustituye a los `icono_*.png`? | Iconos de línea de `lucide-react` (ya aprobada en `docs/dependencias.md`) con la paleta. Los 4 PNG se borran. |
| 2026-10-28 | ¿El degradado morado al pasar el cursor por `KpisMensajero` entra aquí? | Sí: se cambia por un tono de la paleta nueva. |
| 2026-10-28 | ¿Cómo se generan las capturas? | Con un script repetible con Playwright (ya en el proyecto). |
| 2026-10-28 | Fuente de la marca | `docs/marca.md` y `public/brand/`; nunca recursos de Ordenex (heredada de SL-8, D6). |
| 2026-10-28 | «Ordenex» en lo que se toca | Desaparece del todo (heredada de SL-8, D16). |
