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
  a `dev` y a `prod`; el E2E, solo en el PR a `prod`.
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

> ABIERTO: la versión de Postgres objetivo (CI usa 17, de la plantilla) hasta crear el Supabase
> de servi_logistic.

### Por qué
La lógica de dinero vive en el SQL: un test de servicio con dobles no ve el `WHERE`. Copiar el
`.env` a cada worktree compartiría credenciales y una sola base entre features.

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
