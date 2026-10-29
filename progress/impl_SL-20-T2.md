# impl SL-20 — tanda 2, rama A (T2.1, T2.2, T2.3) — backend_dev

Worktree `.worktrees/SL-20-pais-geografia-configurable/`, base `servi_logistic_sl20` (local; `DATABASE_URL`
exportada por comando desde el `.env` del repo con el nombre de base cambiado). Sin commits.
MCP del grafo: no usado; exploración con Grep/Read.

**Estado: T2.1, T2.2 y T2.3 cerradas y marcadas `[x]` en `tasks.md`.**

## Archivos

Nuevos:
- `lib/types/pais.ts` — `CODIGO_PAIS`, `crearPaisSchema` (`id` ISO alfa-2; nombre y seis nombres de nivel
  con `normalizarNombreGeografico`, 2–40, `.strict()`), `PaisDTO` (extiende `ReglaDeCodigoDePais` de
  `lib/utils/codigo-geografico.ts`: compatible con T3.3 sin tocar `division-csv`), `EtiquetasGeograficas`
  (`Record<NivelGeografico, {singular, plural}>`), `etiquetasDePais`, `ETIQUETAS_NEUTRAS`.
- `lib/interfaces/repositories/IPaisRepository.ts`, `lib/repositories/PaisRepository.ts` — `listar`
  (por nombre), `porId`, `crear` (país + `pais_creado` con `appendAccionPlataforma` en la misma
  `$transaction`; actor congelado con `resolverActorCongelado`; P2002 → `duplicado` `id`/`nombre`),
  `deLaEmpresa(organizacionId)`.
- `lib/interfaces/services/IPaisService.ts`, `lib/services/PaisService.ts` — `listar`, `crear` (rol →
  zod → código y nombre `normalizeName` contra los existentes → repo), `etiquetasDeEmpresa`.
- `tests/unit/services/pais-service.test.ts`, `tests/integration/db/pais-repositorio.test.ts`.

Modificados:
- `lib/types/organizacion.ts` — `paisId` obligatorio (`CODIGO_PAIS`); `CampoEnConflicto` + `"paisId"`.
- `lib/repositories/OrganizacionRepository.ts` (+ comentario en `IOrganizacionRepository.ts`) — guarda
  `paisId`; país inexistente → `invalida` `paisId` (comprobado antes de escribir); misma alta (slug +
  maestro) con otro país → `conflicto` `paisId`.
- `lib/repositories/EmpresasPlataformaRepository.ts`, `lib/types/empresas-plataforma.ts` — `pais: {id, nombre}`.
- `tests/fabricas/empresa-y-usuarios.ts` — `crearEmpresa` acepta `paisId?` (por defecto `"CR"`, R10).
  Con eso `scripts/demo-qa/receta.ts` (usa `crearEmpresa`) sigue compilando y las empresas demo nacen en
  CR por el alta, no por el DEFAULT: **no hizo falta tocar `scripts/demo-qa/`**.
- Tests adaptados: `organizacion-service.test.ts`, `organizaciones-action.test.ts`,
  `alta-empresa-rol.test.ts`, `organizaciones-action.composition-root.test.ts` (doble `tx.pais` y
  aserción de `paisId` en `organizacion.create`), `empresas-plataforma-service.test.ts` (fixture con `pais`),
  `organizacion-alta.test.ts`, `empresas-plataforma.test.ts` (columna `pais` y copia de `pais` en el
  esquema desechable).
- `tests/unit/guards/superadmin-fuera-de-empresa.guardia.test.ts` — excepción declarada
  `PaisService.GESTION_ROLES` (solo plataforma), igual que la de `GeografiaService`.
- `specs/.../tasks.md` — `[x]` en T2.1–T2.3.

## Mapa R → test

| R | Test |
|---|---|
| R6 | `organizacion-service.test.ts` › «sin país / país vacío / en minúsculas / de tres letras / que no es texto → invalida(paisId)», «el repositorio recibe el `paisId`…»; `organizacion-alta.test.ts` › «SL-20 R6: la empresa nace en el país de la entrada (Costa Rica)», «SL-20 R6: sin país, o con uno que no existe, es `invalida` `paisId` y no escribe nada»; `organizaciones-action.composition-root.test.ts` (paisId llega a `organizacion.create`) |
| R8 | `organizacion-alta.test.ts` › «SL-20 R6/R8: en otro país nace allí, y repetirla con otro país es `conflicto` `paisId` sin cambiar nada»; `organizacion-service.test.ts` y `organizaciones-action.test.ts` (el desenlace pasa tal cual y no envía bienvenida) |
| R9 (datos) | `empresas-plataforma.test.ts` › «SL-20 R9: cada empresa trae su país, código y nombre», y las columnas exactas del listado. La parte de pantalla es T5.5 |
| R10 (fábrica de alta) | `empresas-plataforma.test.ts` (fábrica → CR); `crearEmpresa` con `paisId` por defecto `"CR"` |
| R23 | `pais-service.test.ts` › «crea el país con los datos normalizados…», «un código que ya existe es `conflict` por `id`…», «un nombre que ya existe … es `conflict` por `nombre`…», «los acentos no distinguen…», «si la base rechaza el único…», entradas inválidas; `pais-repositorio.test.ts` › «R23/R33: crea el país sin geografía y su fila `pais_creado`…», «R23: un código o un nombre que ya están los rechaza la base como `duplicado`…» |
| R37 (país) | `pais-service.test.ts` › «%s: crear y listar son `forbidden` sin tocar la base» (todos los roles de empresa del enum) |
| T2.3 / R19 (datos) | `pais-service.test.ts` › «una empresa en XA ve los nombres de XA», «una empresa en CR ve Provincia, Cantón y Distrito», «ETIQUETAS_NEUTRAS no son las de ningún país…»; `pais-repositorio.test.ts` › «R19/T2.3: en el contexto de una empresa (RLS)… XA y CR» |

## Salida real

- Tests (unit + integración contra `servi_logistic_sl20` + guardias que toca el diff), juntos:
  `pnpm exec vitest run` de `pais-service`, `organizacion-service`, `empresas-plataforma-service`,
  `organizaciones-action`, `alta-empresa-rol`, `organizaciones-action.composition-root`,
  `empresas-plataforma.composition-root`, `pais-repositorio`, `organizacion-alta`, `empresas-plataforma`,
  `empresas-plataforma-deuda-sl45`, y las guardias `superadmin-fuera-de-empresa`, `plataforma-solo-en-lista`,
  `historial-accion-punto-unico`, `lib-no-importa-app`, `prisma-client-sin-adaptador`, `p2003-detector-unico`,
  `sql-a-mano-por-empresa`
  → `Test Files 1 failed | 17 passed (18) · Tests 1 failed | 202 passed (203)`.
  El rojo: `superadmin-fuera-de-empresa` › «en el árbol real no hay ninguna falta» con
  `lib/services/CargaDivisionService.ts: GESTION_ROLES … no es una excepción declarada` — archivo del
  otro backend_dev (T4.5), no tocado. Con mi excepción y antes de que existiera ese archivo:
  `Tests 14 passed (14)`.
  Por separado: T2 unit `Test Files 5 passed (5) · Tests 95 passed (95)`; integración
  `Test Files 3 passed (3) · Tests 21 passed (21)` (sin skips: 4 + 12 + 5).
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` (una vez) → exit 2. Errores:
  - **De T2.2, pendientes de T5.5 (frontend, no tocados):** `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx(245)`
    (`paisId` falta en `AltaEmpresaInput`); `tests/components/empresas-module.test.tsx(26,40)`,
    `tests/components/EmpresasModuleCobro.test.tsx(28,39,344)`, `tests/integration/empresas-page.test.tsx(59,70)`
    (fixtures de `EmpresaListada` sin `pais`).
  - `tests/unit/services/empresas-plataforma-service.test.ts` → corregido después (fixture con `pais`; 12/12).
  - **Del otro agente (T4.x), no tocados:** `lib/services/GeografiaService.ts`, `tests/integration/db/geografia-alta`,
    `geografia-cascada-reversible`, `geografia-registro-accion`, `tests/unit/repositories/geo-repository.escrituras`,
    `tests/unit/services/geografia-service`.
  - Ninguno en los archivos nuevos de esta tanda.
- `eslint` sobre los 21 archivos de la tanda → sin problemas (exit 0; dos avisos de variables sin usar
  quitados). `pnpm run lint` completo no se corrió (memoria justa).

## Decisiones de implementación (no fijadas por el design)

1. El campo del código en `crearPaisSchema` se llama `id` (como la columna y `paisId`), no `codigo`.
2. `crear` devuelve `conflict` con `campo: "id" | "nombre"` (R23 solo pide `conflict`); útil para la pantalla.
3. `ETIQUETAS_NEUTRAS`: singular y plural iguales («Nivel 1»/«Nivel 1»…); el design solo dice «Nivel 1»….
4. `etiquetasDeEmpresa` con una empresa sin país visible **lanza** con el id (no devuelve neutras): no
   inventa etiquetas sobre un dato roto. El layout (T5) decide qué hace con el error.
5. `listar` de países es solo plataforma (`forbidden` a roles de empresa).
6. R6 por consulta previa a `pais` dentro de la transacción del alta; no hay traducción de P2003 a
   `invalida paisId` (el país no se puede borrar: FK `RESTRICT` y sin camino de borrado).
7. R8 se decide antes de mirar si el país existe: misma alta con otro país (exista o no) → `conflicto`.

## Preguntas abiertas / avisos

1. **Typecheck rojo hasta T5.5**: `EmpresasModule.tsx` y tres tests de componentes/página necesitan `paisId`
   y `pais`. ¿Lo cierra el frontend_dev en T5.5 o se adelanta?
2. `e2e/_dos-empresas-fixture.ts` llama a `altaEmpresa` sin `paisId` (no rompe typecheck: `input` es
   `unknown`), así que en runtime dará `invalida paisId`. Está en T5.5; no se tocó.
3. `superadmin-fuera-de-empresa.guardia` necesita también la excepción de `CargaDivisionService.GESTION_ROLES`
   (del otro agente); el archivo de la guardia ya lo toqué yo (entrada de `PaisService`): coordinar para no pisarse.
4. Decisiones 1–4 de arriba: confirmar con quien haga la pantalla (T5.x).

Veredicto: T2.1–T2.3 cerradas con sus tests en verde (unit 95/95, integración 21/21); el typecheck queda
rojo solo por la UI de «Empresas» (T5.5) y por archivos de T4.x del otro agente.
