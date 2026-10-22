<!-- perfil: revisado=2026-10-21 por=Carlos Restrepo -->
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

## extractor
Un módulo aquí es el corte vertical de una entidad: `lib/actions/<m>*`, `lib/services/<m>*`,
`lib/repositories/<m>*`, `lib/interfaces/**/<m>*`, `lib/types/<m>*`, `components/**/<m>*` y las
páginas de `app/(app)/<m>/`.
