<!-- perfil: revisado=2026-11-08 por=Carlos -->
# docs/perfil-agentes.md — Reglas del proyecto para cada agente

> Perfil del proyecto. Los agentes de `.claude/agents/` son genéricos (vienen de la plantilla y los
> pisa `arnes-sync.sh`); lo que es propio de ESTE proyecto va aquí. Cada agente lee su sección y
> `> Todos los agentes`.

## Todos los agentes
- Este repo es **servi_logistic, no Ordenex**. Nunca uses recursos de Ordenex: si un `.env`, un MCP o
  una variable apunta a uno de los proyectos Supabase de la app de origen —sus ids están en la memoria local del leader, fuera del repo—, PARA y avisa; si no tienes esa memoria, pregunta al leader antes de usarlo.
- Gestor de paquetes: `pnpm`. No instales nada sin aprobación (`docs/dependencias.md`).
- Comandos:
  - typecheck: `pnpm run typecheck`
  - lint: `pnpm run lint`
  - tests de un cambio: `pnpm exec vitest related --run <archivos>`
  - guardias: `pnpm run test:guardias`
  - E2E de un archivo: `pnpm exec playwright test e2e/<archivo>.spec.ts`
  - gate local: `./init.sh` (nunca la suite completa salvo para reproducir un rojo de CI)
- Rutas: `app/` (App Router; `app/(app)/` autenticado), `lib/{actions,services,repositories,
  interfaces,types,utils}/`, `components/{ui,shared,private}/`, `db/schema.prisma`,
  `db/migrations/`, `tests/{unit,integration,components,guards}/`, `e2e/`.
- Ramas: integración `dev`, producción `prod`.
- **E2E en local antes del PR.** Si el diff toca `db/`, una pantalla de `app/` o dinero, corre en
  local los E2E que lo cubren antes de abrir el PR: `grep -rl` en `e2e/` por la ruta, el rótulo o la
  tabla que cambiaste, y además el grupo `dinero` entero si toca dinero
  (`pnpm exec playwright test --project=dinero`). Base desechable nueva, nunca la de desarrollo, y
  `NEXT_PUBLIC_APP_URL` como en `.github/workflows/gate.yml`. El leader no abre el PR sin ese verde.
- **Un E2E inestable se arregla, no se reintenta.** El CI corre con `failOnFlakyTests`: un test que pasa
  al segundo intento deja el job en rojo. Se arregla la causa (esperar la condición, nunca
  `waitForTimeout`) en una rama `chore/` el mismo día; no se quita `failOnFlakyTests`.

### Por qué (E2E en local e inestables)
2026-11-08, SLT-94 «Cobro de fulfillment por paquete y marca «se recoge en tienda»»: tres rondas de CI
(~25 min cada una) por rojos que el local no vio. 1) El rápido se salta los `vitest related` cuando
pasan de 150 (eran 1 766) y no había disparadores: se añadió `gate.disparadores` para esquema y
migraciones. 2) `e2e/tarifas-maqueta.spec.ts` contaba una fila que R13 quitó: solo corre en CI.
3) `e2e/tope-intentos-por-empresa.spec.ts` falló y pasó al reintento: `failOnFlakyTests` tumbó #97.

## spec_author
Un `design.md` aquí trae:
- el modelo de datos con `organizacion_id`, RLS y únicos por empresa
  (`docs/architecture.md > Multi-empresa`);
- dónde se valida la autorización y, si aplica, qué módulo debe estar encendido;
- las migraciones con su `down.sql`;
- qué datos dependen del país (moneda, geografía, impuestos, métodos de pago) y de dónde salen.

## implementer
Reparte por capa: `backend_dev` para `lib/`, `db/` y `app/api/`; `frontend_dev` para
`components/`, `hooks/` y las páginas de `app/`. Un worktree por feature (`docs/worktrees.md`).

## backend_dev
- Next.js 16 (App Router), TypeScript strict, Prisma 7 con `@prisma/adapter-pg`, Postgres
  (Supabase), zod 4.
- Capas: Controller (route handler o Server Action) → Service (`lib/services/`) → Repository
  (`lib/repositories/`), con interfaces en `lib/interfaces/`.
- Toda query de negocio filtra por `organizacion_id`; la empresa se resuelve desde la sesión.
- Migraciones: `pnpm run db:migrate:create`, `down.sql` a mano, nunca editar una ya aplicada.
- Tests: unit en `tests/unit/` con dobles; el SQL se prueba en `tests/integration/db/` contra
  Postgres real (`HAY_BASE_DE_DATOS`). Un `WHERE` de dinero o de empresa sin test de integración
  no está probado.

## frontend_dev
- shadcn/ui sobre `@base-ui/react`, Tailwind CSS v4, `lucide-react`, SWR para datos públicos.
- Antes de crear un componente, búscalo en `components/ui/` o en shadcn.
- Los datos privados llegan por props desde un Server Component; `components/private/` no fetchea.
- Pantallas usadas en móvil por mensajeros: diseña para teléfono primero.
- Tests de componente en `tests/components/` con `// @vitest-environment jsdom`.
- Una pantalla NUEVA pasa por `/design` antes de implementarse.

> ABIERTO: la marca (logo, paleta y tokens) llega en la fase 7 de `docs/plan-saas.md`.

## reviewer
- Bloqueante: tabla o query de negocio sin `organizacion_id`, tabla sin RLS, migración sin
  `down.sql`, literal de país o moneda (Costa Rica, colones, SINPE) en código nuevo, cualquier
  referencia a recursos de Ordenex.
- Dependencia nueva sin fila en `docs/dependencias.md`.
- Comentarios: explican el porqué, no el qué (`docs/conventions.md`).
- Bloqueante: PR que toca `db/`, pantallas o dinero sin constancia de los E2E afectados corridos en local.

## extractor
Un módulo aquí es el corte vertical de una entidad: `lib/actions/<m>*`, `lib/services/<m>*`,
`lib/repositories/<m>*`, `lib/interfaces/**/<m>*`, `lib/types/<m>*`, `components/**/<m>*` y las
páginas de `app/(app)/<m>/`.

