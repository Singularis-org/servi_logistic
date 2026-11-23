# Review SLT-250 «/ordenes: «Sin empresa en contexto para Pais.zonaHoraria» al cargar»

- Rama: `feature/SLT-250-ordenes-zona-horaria-sin-empresa`, HEAD revisado `6da44e6a` (comprobado, árbol limpio).
- Ruta ligera: revisión acotada a `git diff origin/dev...HEAD` (4 archivos: la página, el test nuevo, el spec y la bitácora).
- MCP de grafo: no lo usé; el diff es de una línea y todo se leyó con Grep/Read.

## Checklist

- [x] **Spec ligero completo.** `requirements.md` trae alcance, causa con evidencia, «Lo que ya existe» (la puerta `notFound()` de `page.tsx`, que se amplía y no se duplica), EARS R1820–R1822, `## Tasks`, `## Archivos esperados` y trazabilidad.
- [x] **El arreglo cumple el spec.**
  - `app/(app)/ordenes/page.tsx:92` amplía la puerta existente con `(rol !== undefined && esPlataforma(rol))`.
  - `esPlataforma` se importa de `@/lib/auth/plataforma` (la única declaración de plataforma), sin literal propio.
  - La puerta va justo tras `resolveActorFromSession()`, antes de `resolverCatalogoFiltros` (`:195`), `zonaDelBorde` (`:224`) y `resolverRetenidasCentral` (`:235`). Cumple R1820 y R1821.
- [x] **Sin efectos sobre los roles de empresa.** `esPlataforma` solo es verdadero para `superadmin` (`ROLES_PLATAFORMA`). `maestro`, `admin` y `adminTienda` siguen el camino de antes (R1822).
- [x] **Sin efectos sobre el actor `null`.** Con `actor === null`, `rol` es `undefined` y la guarda `rol !== undefined` deja la página como estaba. Los 38 casos de `tests/components/OrdenesPage*` siguen en verde.
- [x] **Trazabilidad R→test.**
  - R1820 y R1821 → «superadmin: notFound antes de leer la zona (R1820, R1821)». Afirma que el rechazo es el error marcado de `notFound`, que no es `EmpresaNoResuelta` y que `zonaDelBorde` no se llamó.
  - R1822 → «roles de empresa: leen la zona y no hay notFound (R1822)», con `maestro`, `admin` y `adminTienda`. Afirma que la página resuelve y que `zonaDelBorde` se llamó una vez por rol.
  - Ninguno de los dos tests está vacío.
- [x] **La mutación muere (la corrí yo).** Quité solo la cláusula `esPlataforma` de `page.tsx:92`.
  - Resultado: `1 failed | 1 passed`, con `AssertionError: expected EmpresaNoResuelta: Sin empresa en context… to be Error: SLT-250:notFound`.
  - Restauré con `git checkout`. Con el arreglo: `2 passed`. El árbol quedó limpio.
  - Corrí con `DATABASE_URL`/`DIRECT_URL` exportadas a una desechable (`servi_review_slt250`). El test no toca la base.
- [x] **Tasks.** T1–T4 hechas según la bitácora. T0 (confirmar en los logs que los usuarios eran superadmin) sigue ABIERTA y no bloquea, por decisión del 2026-11-23.
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` → 2/40 archivos, 7/1000 líneas de producción, 81/3000 de tests.
- [x] **Typecheck** (`pnpm run typecheck`) y **lint** (eslint sobre los 2 archivos de código) en verde, corridos por mí.
- [x] **Gate local:** el implementer registra `INIT_EXIT=0` en la bitácora. No lo volví a correr.
- [x] **Datos y seguridad:** sin tabla, query, migración, secreto ni recurso de Ordenex. La autorización se decide en el Server Component.
- [x] **Comentario:** explica el porqué (el superadmin no tiene empresa y caía en `zonaDelBorde`), no el qué.
- [x] **Dependencias:** ninguna nueva.
- [~] **E2E afectados en local:** sin constancia. Ver H1.

## Hallazgos

- **H1 (condición de cierre, no es un defecto del código).** El diff toca una pantalla de `app/` y no hay constancia de que se corrieran en local los E2E que pasan por `/ordenes`.
  - `docs/perfil-agentes.md > reviewer` lo marca como bloqueante.
  - Los E2E que pasan por `/ordenes`:
    - `e2e/auth.spec.ts` («should respect redirect query parameter», `adminTienda` → `/ordenes`; flujo crítico «Login y sesión»);
    - `e2e/dos-empresas-humo.spec.ts`;
    - `e2e/mora-congelamiento.spec.ts`.
  - Todos entran con roles de empresa, que el cambio no toca, así que el riesgo es bajo.
  - Sigo el mismo criterio que en `review_SLT-243.md` H1: no se abre el PR ni se avisa «listo para mergear» sin esos E2E en verde, en local con base desechable o por `gate-completo`, y anotados en `progress/features/SLT-250.md`.
  - Si el humano no acepta esa constancia diferida, esto pasa a BLOQUEANTE.
- **H2 (menor, criterio de ruta).** El cambio toca una puerta por rol, y el suelo de `docs/specs.md > Tres rutas` pide la ruta completa si el diff toca permisos. No lo hago bloqueante, por tres motivos:
  - la puerta solo **restringe**: no concede acceso a nadie;
  - el único rol afectado (`superadmin`) ya no podía usar la página, solo cambia un 500 por un 404;
  - no hay action, policy ni servicio de autorización en el diff.
  - Carlos aprobó el spec como ligera. Lo dejo anotado por si el humano quiere aplicar el suelo de forma literal.
- **H3 (menor, proceso).** No existe `progress/impl_SLT-250.md`, que `CHECKPOINTS.md > Trazabilidad` pide con el mapa R→test. El mapa está en `progress/features/SLT-250.md > Tandas` y en la tabla de trazabilidad del spec. En la ruta ligera basta con eso; no bloquea.
- **H4 (menor, formato).** En `## Tasks` las tareas van como `- **T<n>**` sin casilla `[x]`, así que su estado solo se ve en la bitácora. Conviene marcarlas `[x]` (T1–T4) y dejar T0 `[ ]` con su nota.
- **Nota (no es hallazgo).** El test usa `"America/Costa_Rica"` como valor de un doble de `zonaDelBorde`. Es un dato de test, no un literal de país en código de producción.

## Veredicto

**OK.** No hay bloqueantes ni en el código ni en la trazabilidad, y la mutación muere. Queda la condición H1 (E2E de `/ordenes` en verde antes del PR o del aviso de merge).
