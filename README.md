This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Despliegue

### Variables de entorno

El código lee exactamente estas:

| Variable | Notas |
| --- | --- |
| `DATABASE_URL` | Pooler **transaccional** de Supabase (`:6543`) en serverless. Solo runtime. |
| `DIRECT_URL` | Pooler en modo **sesión** (`:5432`). Solo el CLI de Prisma (`migrate deploy` del build). Sin ella, `prisma.config.ts` cae a `DATABASE_URL`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor. Nunca exponer. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente. |
| `NEXT_PUBLIC_APP_URL` | Origin de los QR de etiqueta. Ver aviso abajo. |
| `NEXT_PUBLIC_SITE_URL` | Origin para metadatos (`app/layout.tsx`). |
| `CRON_SECRET` | Autoriza los endpoints de `/api/cron/*`. |
| `INTEGRACIONES_CLAVES_CIFRADO` | Anillo de claves maestras de la bóveda de integraciones: `v1:<base64 de 32 bytes>,v2:...`. Secreto. Ver `lib/config/integraciones.ts`. |
| `INTEGRACIONES_CLAVE_ACTIVA` | Versión del anillo con la que se cifra todo valor nuevo (`v2`). |
| `INTEGRACIONES_PRUEBAS_POR_MINUTO` | Opcional. Pruebas de conexión por minuto y empresa (default 5). |
| `INTEGRACIONES_PROBADOR_DOBLE` | Solo E2E: `1` cambia los probadores reales por un doble. Ignorada con `VERCEL_ENV=production`. |
| `DB_POOL_MAX` | Opcional. Conexiones `pg` por instancia (default 3). |

#### Credenciales de WhatsApp, Google Maps, optimización de rutas y asistente

**No van en el entorno** (SL-36). Son de cada empresa: su maestro las configura en
`/configuracion/integraciones` y se guardan cifradas con el anillo de arriba. La plataforma no
presta claves: una empresa sin una integración se queda sin ese servicio (la geocodificación y
las rutas se degradan, WhatsApp y el asistente avisan de que falta configurarlo).

Las cuatro `INTEGRACIONES_*` son las únicas variables de plataforma de esta parte. Las antiguas
variables de credenciales de Meta, Google y Anthropic (la lista está en el design de SL-36, §9.3)
ya no las lee nadie, y la guardia `tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts`
impide que vuelvan. Si siguen en el panel de Vercel, retirarlas es un paso manual.

Orden del despliegue: primero `INTEGRACIONES_CLAVES_CIFRADO` e `INTEGRACIONES_CLAVE_ACTIVA` en
Vercel, luego las migraciones y luego el código. Sin ellas la app arranca, pero guardar una
integración responde con error.

> **`NEXT_PUBLIC_*` se inlinea en build time.** Cambiarlas exige un redeploy.
> `NEXT_PUBLIC_APP_URL` queda impresa en los QR de las etiquetas físicas: si el
> dominio cambia después, esas etiquetas apuntan a una URL muerta. Definí el
> dominio definitivo *antes* de imprimir en volumen.

### Base de datos

```bash
pnpm exec prisma migrate deploy   # esquema (usa DIRECT_URL: pooler en modo sesión, :5432)
pnpm db:seed                      # catálogos: tipos de id, roles, estados, vehículos
```

Si tu base local es anterior al 2026-10-21, `pnpm exec prisma migrate reset`: algunas
migraciones se editaron en sitio (SL-11) y una base vieja da drift.

#### Cuándo migra el build

El paso de migraciones del `build` (`scripts/migrate-deploy.ts`) se ejecuta:

| Entorno | ¿Migra? |
| --- | --- |
| `VERCEL_ENV=production` | **Sí**, siempre |
| `VERCEL_ENV=preview` | Solo con `MIGRATE_ON_PREVIEW=true` |
| `development` / build local | No — usa `pnpm db:migrate` |

El motivo es que **previews y producción compartían la misma base de Supabase**:
con el `prisma migrate deploy` que corría en todos los entornos, abrir un PR
aplicaba sus migraciones a la base de producción antes de mergear.

`MIGRATE_ON_PREVIEW=true` es la declaración de que la base de Preview **es una
base de pruebas, no la de producción**. Ponlo en el entorno Preview solo cuando
`DATABASE_URL`/`DIRECT_URL` de Preview apunten a esa base propia; entonces cada
preview aplica sus migraciones contra la suya, que es el comportamiento
deseable. Sin el flag, el preview de una rama con una migración nueva corre
contra una base que no la tiene y fallará en runtime hasta que alguien la
aplique a mano.

El script aborta además si la URL de migraciones apunta al pooler
**transaccional** (`:6543` o `pgbouncer=true`) — ahí `migrate deploy` espera un
advisory lock para siempre — y le pone un tope de 120 s para que un cuelgue se
vea como un build rojo con mensaje, no como un build eterno.

### Usuarios

La app nace sin ningún usuario. El primero es el **superadmin** de la plataforma, que no
pertenece a ninguna empresa. Lo crea un comando, y desde su pantalla «Empresas» se da de alta
cada empresa con su primer maestro.

```bash
pnpm arranque:superadmin
```

- **Cuándo:** a mano, **una vez por entorno**, después de `prisma migrate deploy` y de
  `pnpm db:seed`. No forma parte del `build` ni de CI. La única excepción es el E2E, que lo corre
  con credenciales de prueba.
- **Qué lee:** seis variables de entorno obligatorias, sin valor por defecto, declaradas vacías en
  `.env.example`: `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_NOMBRE`,
  `SUPERADMIN_TELEFONO`, `SUPERADMIN_DOCUMENTO` y `SUPERADMIN_TIPO_DOCUMENTO`. La contraseña
  cumple la política de contraseñas nuevas y solo se guarda su hash. El tipo de documento es un
  valor del catálogo `tipo_identificacion`. Los valores no se commitean ni se pegan en ningún
  sitio, y después de correrlo no hace falta dejarlas en el entorno.
- **Qué responde:**

  | Salida | Código |
  | --- | --- |
  | Superadmin creado | 0 |
  | Ya existe un superadmin: no cambia nada, tampoco la contraseña | 0 |
  | Una variable falta o no es válida: nombra la variable y la regla | 1 |
  | El email o el documento ya son de otro usuario | 1 |
  | Falta el rol o el tipo de documento en el catálogo: pide `pnpm db:seed` | 1 |

  Ningún mensaje lleva la contraseña, el email ni el documento. Dos ejecuciones a la vez dejan un
  solo superadmin, y las dos terminan en 0: la base solo admite uno.
- **La contraseña** se cambia con «¿Olvidaste tu contraseña?», no volviendo a correr el comando.

#### El correo, sin el cual nadie entra

El superadmin entra por `/login`. En un dispositivo nuevo, el login pide un código por correo. El
maestro de cada empresa nueva recibe al darse de alta un correo de bienvenida con un enlace para
crear su contraseña; vale una sola vez y caduca. Si no le llega o se le vence, el superadmin lo
reenvía con «Reenviar bienvenida» en la fila de la empresa, en «Empresas», o el maestro pide un
código con «¿Olvidaste tu contraseña?», que queda de respaldo. Así que, antes de dar de alta la
primera empresa real, cada entorno necesita el correo configurado (por entorno en Vercel:
Production y Preview por separado):

- **Con SMTP:** el relay de Brevo. `SMTP_HOST=smtp-relay.brevo.com` y `SMTP_PORT=587`, con
  `SMTP_USER` y `SMTP_PASSWORD`, que son el usuario y la clave SMTP de la cuenta de Brevo.
  `SMTP_FROM` es el remitente, y tiene que ser uno verificado en Brevo: si falta, se usa
  `SMTP_USER`, que en Brevo es un login y no una dirección desde la que se pueda enviar. Con
  `SMTP_USER` y `SMTP_PASSWORD` puestas, el correo sale de verdad.
- **Sin SMTP** (desarrollo y CI): si falta `SMTP_USER` o `SMTP_PASSWORD`, el correo cae a
  `ConsoleEmailSender` y no sale ninguno. El log recoge el destinatario y el asunto, que no lleva
  el código. El código solo se imprime con `AUTH_OTP_DEBUG_LOG=1`,
  que en producción se deja vacío porque deja un secreto en los logs.

- **`NEXT_PUBLIC_APP_URL`**: la URL pública de la app, sin barra final. Sin ella la bienvenida no
  sale (el alta termina igual, la pantalla avisa de que el correo no salió y el servidor registra un
  aviso que nombra la variable), y la cabecera de los correos lleva el nombre en texto en vez del
  logo.
- **`AUTH_BIENVENIDA_TTL_HORAS`** (opcional): las horas que vale el enlace de bienvenida. Por
  defecto, 72.
- **`EMAIL_CONTACTO`** (opcional): un email de contacto para el pie de todos los correos. Vacía o
  con un valor que no es un email, el pie no muestra ninguna dirección.

Comprueba que llega un código real en cada entorno antes de dar de alta la primera empresa, y que
la bienvenida de la primera empresa llega con el enlace bien formado.
