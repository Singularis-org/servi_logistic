# SL-41 — Maqueta de la plantilla de correo (T1)

> **Aprobada por Carlos Restrepo el 2026-10-24**, con un cambio: el logo va incrustado en el
> correo (adjunto CID), no alojado. Los tres `.html` de esta
> carpeta no están dibujados a mano: los genera la plantilla real
> (`lib/services/email/plantillas/plantilla-marca.ts`, con `otp-codigo.ts` y `bienvenida-maestro.ts`)
> con datos ficticios. Lo que se ve aquí es lo que se enviaría.

| Archivo | Qué es |
|---|---|
| `otp.html` | El código de verificación del login y de «recuperar contraseña» (es el mismo correo, R9), con logo y con contacto en el pie. |
| `bienvenida.html` | La bienvenida del maestro, con logo y con contacto. |
| `bienvenida-sin-url.html` | La misma bienvenida con la **cabecera de texto** que sale cuando falta `NEXT_PUBLIC_APP_URL` (R4). En la práctica la bienvenida no se envía sin URL base (R40); quien sale así es el OTP. Se enseña sobre la bienvenida para ver la cabecera junto a un botón. |

Datos ficticios: URL base `https://app.example.com`, contacto `soporte@example.com`, código
`045912`, maestra «Ana Pérez» de «Mensajería Rápida».

**El logo.** En el correo real la cabecera pinta `<img src="cid:logo@servilogistic">` y el
mensaje lleva el PNG como imagen en línea: no se descarga de ninguna URL. Un navegador no resuelve
`cid:`, así que en estos `.html`, **solo para la vista previa local**, ese `src` se sustituye por
el mismo PNG en data URI. El PNG es `public/brand/logo-correo.png` (360 × 105 px, 6,8 KB),
generado desde el SVG de marca con `node scripts/generar-logo-correo.mjs`, y se pinta a 180 px.

## Estructura

De arriba abajo, sobre un fondo `#F7F7F5` y en una columna de 600 px como máximo:

1. **Preheader** oculto: la línea de vista previa que muestra la bandeja de entrada.
2. **Cabecera** sobre blanco, con un relleno de 24 px y 32 px a los lados:
   - con URL base: el logo PNG incrustado (CID), a 180 px, con `alt="Servi Logistic"`;
   - sin ella: el texto «Servi Logistic» en `#111111`, a 22 px y en negrita.
3. **Franja amarilla** `#FFD000` de 4 px, a todo el ancho. Es el único amarillo del correo, y
   va como fondo, nunca como texto.
4. **Contenido** sobre blanco, con un relleno de 32 px. Lleva estos bloques, en el orden de cada
   correo:
   - párrafo: 16 px, interlineado de 24 px, `#111111`;
   - código: 28 px, negrita, 6 px entre letras, `#111111`;
   - botón: celda `#111111` con el enlace en blanco, a 16 px y en negrita, con 14 × 28 px de
     relleno y esquinas de 4 px. Debajo, a 13 px, «Si el botón no funciona, copia este enlace en
     tu navegador:» y la URL completa como enlace;
   - nota: caja `#F7F7F5` con texto `#585858` a 14 px y 12 × 16 px de relleno.
5. **Pie** sobre `#F7F7F5`, a 13 px y en `#585858`: «Servi Logistic · Este correo se envió
   automáticamente; no lo respondas.». Si `EMAIL_CONTACTO` tiene un email válido, se añade debajo
   «¿Dudas? Escríbenos a {contacto}.», con un enlace `mailto:` (R39).

Fuente: `Archivo, Arial, Helvetica, sans-serif`. Archivo casi no carga en los clientes de correo,
así que lo normal es que se vea Arial.

## Contraste de cada pareja texto/fondo

Medido con `contraste()` de `tests/fixtures/contraste.ts`. `#585858` es
`componer(#111111, #FFFFFF, 0.70)`, una mezcla declarada de dos colores de la paleta.

| Texto | Color | Fondo | Contraste |
|---|---|---|---|
| Cuerpo y cabecera de texto | `#111111` | Cuerpo y cabecera `#FFFFFF` | 18.88:1 |
| Código OTP (28 px) | `#111111` | Cuerpo `#FFFFFF` | 18.88:1 |
| Texto del botón | `#FFFFFF` | Botón `#111111` | 18.88:1 |
| URL visible bajo el botón | `#111111` | Cuerpo `#FFFFFF` | 18.88:1 |
| «Si el botón no funciona…» | `#585858` | Cuerpo `#FFFFFF` | 7.11:1 |
| Nota | `#585858` | Nota `#F7F7F5` | 6.63:1 |
| Pie y su enlace `mailto:` | `#585858` | Pie `#F7F7F5` | 6.63:1 |
| Franja (no es texto) | `#FFD000` | Cabecera `#FFFFFF` | 1.47:1, por eso nunca lleva texto |

Todas las parejas de texto pasan de 4.5:1. No sale ninguno de los colores de la marca anterior
(`#0b2545`, `#0d2444`, `#f26419`). Lo comprueba `tests/unit/services/email/plantilla-marca.test.ts`.

## Textos finales

### Código de verificación (login y «recuperar contraseña»)

- **Asunto:** «Tu código de verificación de Servi Logistic». No lleva el código (R11).
- **Preheader:** «Tu código vence en 10 minutos.» Los minutos salen de `AUTH_OTP_TTL_MINUTES`.
- **Bloques:**
  1. Párrafo: «Tu código de verificación de Servi Logistic es:»
  2. Código: `045912`
  3. Párrafo: «Vence en 10 minutos y solo sirve una vez.»
  4. Nota: «Si no lo pediste, ignora este correo y no compartas el código con nadie.»

### Bienvenida del maestro

- **Asunto:** «Te damos la bienvenida a Servi Logistic». No lleva el enlace (R11).
- **Preheader:** «Crea tu contraseña para entrar a {empresa}.»
- **Bloques:**
  1. Párrafo: «Hola, {nombre}:»
  2. Párrafo: «Se creó la cuenta de {empresa} en Servi Logistic y tú eres su maestro.»
  3. Párrafo: «Para entrar, crea tu contraseña. Tu usuario es este correo: {email}.»
  4. Botón: «Crear mi contraseña», con el enlace, y la URL visible debajo.
  5. Nota: «El enlace vence en {horas} horas y sirve una sola vez. Si venció, pide al equipo de
     Servi Logistic que te lo reenvíe, o entra en {URL base}/recuperar-contrasena y pide un código
     con tu correo.»
  6. Nota: «Si no esperabas este correo, ignóralo: sin la contraseña nadie puede entrar a tu
     cuenta.»

### Texto plano

Los dos correos llevan también una versión en texto plano, con los mismos bloques en el mismo
orden. Abre con `SERVI LOGISTIC`, pone una línea en blanco entre bloques y cierra con el pie.
El código va solo en su línea; los E2E lo leen así del registro. El botón se escribe como
`Crear mi contraseña: <URL completa>`, y la frase «Si el botón no funciona…» no aparece, porque
en texto plano la URL ya está a la vista.

## Lo que hay que comprobar en Gmail web, Gmail Android y Outlook

Se hace con un envío real por Brevo en un entorno con `NEXT_PUBLIC_APP_URL` y `SMTP_FROM` puestos.
Eso es T13 y la nota para T19 de SL-32.

- **Tablas y estilos en línea.** No hay `<style>` ni hojas externas: Gmail y Outlook los quitan.
  Hay que mirar que se respeten el ancho de 600 px, los rellenos de las celdas y la franja de 4 px.
  Outlook de escritorio a veces dibuja una franja más alta.
- **Logo incrustado (CID) con `alt`.** El logo se ve a 180 px y nítido, sin pedir «mostrar
  imágenes»: va dentro del correo. No aparece además como archivo adjunto suelto. Si un cliente lo
  bloquea igual, se ve «Servi Logistic» en negro y negrita, nunca un recuadro vacío ni un enlace
  azul.
- **Botón.** En Outlook, el fondo negro sale de la celda (`bgcolor`). El enlace tiene que verse
  blanco sobre negro y poder pulsarse en todo el botón en Gmail. En Outlook basta con que se pueda
  pulsar el texto.
- **URL visible.** La URL larga parte línea en el móvil (`word-break`) y no ensancha la columna.
- **Preheader.** La bandeja muestra la línea de vista previa y no el inicio del cuerpo.
- **Modo oscuro.** Gmail Android y Outlook pueden invertir los colores. Hay que comprobar que el
  logo de fondo claro sigue leyéndose. Si no, se valora usar la variante de fondo oscuro con
  `prefers-color-scheme`, aunque eso exigiría un `<style>` que Gmail quita.
- **Tildes y signos** (`¿`, `«»`, `·`) bien codificados en el asunto, el preheader y el cuerpo.
