<!-- perfil: revisado=2026-10-21 por=Carlos Restrepo -->
# docs/verification.md — Cómo demostrar que funciona

"Compila" y "el agente dice que está listo" NO son verificación. Una feature está verificada
cuando hay evidencia ejecutable. El gate y sus dos niveles están en `docs/gate.md`; aquí va lo
propio de servi_logistic.

## Comandos

```bash
./init.sh                  # gate local rápido (por defecto): typecheck, lint, relacionados, guardias
./init.sh --completo       # la suite entera; solo para reproducir un rojo de CI
pnpm run typecheck         # TypeScript strict, cero errores
pnpm run lint              # ESLint, cero errores
pnpm run test:guardias     # las guardias (`vitest run guard`)
pnpm exec vitest related --run <archivos>   # los tests que cubren ESTOS archivos
pnpm exec playwright test e2e/<archivo>.spec.ts   # un E2E concreto
```

- La suite completa corre en CI (`.github/workflows/gate.yml`, check `gate-completo`) en cada PR
  a `dev` y a `prod`. El E2E (check `e2e`) también, y a mano con `workflow_dispatch`; ver
  `## El E2E`.
- El veredicto de los tests lo da `tests/baseline-rojos.json` (`docs/gate.md > Rojos heredados`).
  Un archivo nuevo en rojo tumba el gate; uno del baseline que vuelve a verde se borra de la lista
  en el mismo PR.

### Por qué
`dev` arrastra rojos heredados de Ordenex. Sin baseline, el gate no contestaría «¿rompí algo yo?».

## Base de datos de test

- Los tests contra Postgres viven en `tests/integration/db/` y se envuelven en
  `HAY_BASE_DE_DATOS` (`tests/integration/db/_postgres-real.ts`). Sin `DATABASE_URL` se **saltan**,
  no fallan: el gate lo dice con nombre y cifra antes de correr. Un verde sin base no prueba la
  capa de datos.
- En local, una base Postgres propia de servi_logistic. Nunca la de Ordenex
  (sus proyectos Supabase: los ids están en la memoria local del leader, fuera del repo; si un `.env` o un MCP apunta a uno de ellos, PARA).
- En CI, un contenedor `postgres:17` efímero por job.
- `git worktree add` no copia el `.env`: exporta `DATABASE_URL` en la sesión del worktree.
- El test de la demo de QA (`tests/integration/db/demo-qa.test.ts`, SL-43) pone la marca de QA en su
  base (la fila `('entorno','qa')` de `entorno_marca`). En su `afterAll` quita esa fila y borra las
  empresas demo, para que los tests de `down` de las migraciones encuentren la base sin ellas.

> ABIERTO: la versión de Postgres objetivo (CI usa 17, de la plantilla) hasta crear el Supabase
> de servi_logistic.

### Por qué
La lógica de dinero vive en el SQL: un test de servicio con dobles no ve el `WHERE`. Copiar el
`.env` a cada worktree compartiría credenciales y una sola base entre features.

## El E2E

**Cuándo y cómo corre en CI.** En cada PR a `dev` y a `prod` (fuera de borrador) y con
`workflow_dispatch`. Va en tres grupos, cada uno un proyecto de `playwright.config.ts` con su
propio Postgres de servicio, migrado y con `db:seed`: `aislamiento` (arrastra `plataforma-vacia`
por `dependencies`), `reparto` y `dinero`. El check `e2e` sale verde solo si los tres terminan en
`success`. Un caso que solo pasa al reintentarse deja el grupo en rojo (`failOnFlakyTests`). Si un
grupo cae, sube como artefacto las trazas y el log del servidor.

**Datos.** Cada spec crea su empresa, sus usuarios y sus datos con `tests/fabricas/e2e.ts` y los
escenarios de `e2e/_escenarios/`, por los servicios reales. Los correos son `@example.test` con
sufijo aleatorio. Lo creado no se borra al terminar (un ajuste global que un spec cambie sí se
devuelve en su `afterAll`) y nada se busca por nombre fijo ni por recuento total, así que dos
corridas seguidas sobre la misma base pasan. La fábrica aborta si `DATABASE_URL` no apunta a `localhost` o
`127.0.0.1`. Sin `skip`, `fixme` ni `.only`, y sin datos sembrados a mano: lo vigila
`tests/unit/guards/e2e-sin-saltos.guardia.test.ts`, que además comprueba que cada spec está en
exactamente un proyecto y que cada flujo crítico de `docs/checkpoints-proyecto.md` tiene su archivo.

**El OTP.**
- Playwright arranca la app con `e2e/_servidor-app.mjs` (`next start`, o `next dev` con
  `E2E_SERVIDOR=dev`). Ese lanzador escribe su stdout y su stderr en el archivo de `E2E_LOG_SERVIDOR`,
  fuera del checkout.
- El servidor arranca con `SMTP_USER` y `SMTP_PASSWORD` vacíos, así que usa el emisor de consola, y
  con `AUTH_OTP_DEBUG_LOG=1`. Con eso, el código sale en la línea de debug del log.
- El E2E lee el código de esa línea, filtrando por el destinatario y solo entre lo escrito después de
  pedirlo. No hace falta SMTP.
- `AUTH_OTP_DEBUG_LOG=1` solo lo encienden las pruebas: `webServer.env` de Playwright y el job de
  CI. Lo vigila `tests/unit/guards/otp-debug-solo-en-pruebas.guardia.test.ts`.
- **Excepción decidida por Carlos el 2026-10-25 (SL-43):** `AUTH_OTP_DEBUG_LOG=1` también está
  encendida en Vercel, en Preview y solo para la rama `dev`, para entrar con los usuarios demo de QA.
  Es una variable del panel, no un archivo del repo, así que la guardia no cambia.
- Con `VERCEL_ENV=production`, el código no se escribe nunca, aunque la variable esté encendida
  (`lib/config/email.ts > otpDebugLogHabilitado`).

**Storage.** La app no habla con Supabase. Playwright arranca el doble `e2e/_storage-falso/servidor.mjs`,
en `127.0.0.1:${E2E_STORAGE_PUERTO:-54329}`, y le da a la app `SUPABASE_URL` apuntando a él, con una
clave falsa. Guarda en memoria lo subido y lo sirve por la URL firmada. Su contrato con el cliente
real de supabase-js lo prueba `tests/unit/e2e/storage-falso.test.ts`. `lib/storage/` no cambia.

**En local.**
- Una base desechable propia, migrada y con catálogos: `DROP`/`CREATE`, `pnpm exec prisma migrate
  deploy` y `pnpm run db:seed`, con `DATABASE_URL` apuntando a ella. Nunca la de desarrollo.
- `next build` antes, si cambió el código de la app: el lanzador sirve el `.next` construido.
- `E2E_PUERTO=3044 pnpm exec playwright test --project=<grupo> --reporter=list`. Playwright levanta
  el doble de Storage y la app; no se arranca nada a mano. `E2E_PUERTO` evita el 3000 de otra
  sesión. El puerto del doble también tiene que estar libre.
- Para dar un cambio por bueno, dos corridas seguidas sobre la misma base, las dos con 0 failed,
  0 skipped y 0 flaky. La base se recrea solo antes de la primera.

### Por qué
Hasta SL-44 el E2E corría solo en el PR a `prod`, sin datos propios, y salía en rojo por specs que
esperaban usuarios sembrados a mano. Con grupos con base propia cabe en cada PR, y lo que se rompe se
ve en el PR que lo rompe, no al salir a producción.

## Qué cuenta como evidencia

- Salida real de los tests pasando, pegada en `progress/impl_<feature>.md`.
- El mapa `R<n> → test`: para cada requisito, el test que lo cubre.
- Para features con UI o flujo crítico: un E2E que ejercita el camino completo, no solo un unit
  test del helper.
- Para datos multi-empresa: un test que lee con otra `organizacion_id` y confirma que no ve nada.

## Qué NO cuenta

- "Debería funcionar."
- Un test que no asegura nada, o que compara un valor contra la función que lo genera.
- Un test de integración que pasa sin datos (`if (!fila) return;`).

## Datos (Supabase)

- Verifica RLS con un test que intente acceder sin permiso y confirme el rechazo.
- Verifica migraciones aplicando y revirtiendo (`down.sql`) en una base de prueba.

## El dev server: uno solo, con su `.next` limpio

Dos dev servers comparten `.next` aunque escuchen en puertos distintos, y el segundo corrompe la
caché del primero. Antes de medir en el navegador: `rm -rf .next` y comprueba que no hay otro dev
server vivo. Si un agente ya tiene el suyo, pídele el puerto.

### Por qué
En Ordenex (ficha 447) dos agentes persiguieron un error que solo existía con `.next` compartido:
0 de 24 vueltas con un server limpio, 7 de ~15 con dos.

## Regla del reviewer

Si un requisito no tiene test, o un test no verifica el requisito que dice cubrir, es hallazgo
bloqueante. La feature no pasa a `done`.
