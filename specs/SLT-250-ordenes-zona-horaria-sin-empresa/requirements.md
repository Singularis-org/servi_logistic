# SLT-250 «/ordenes: «Sin empresa en contexto para Pais.zonaHoraria» al cargar» — requirements

> Ruta ligera, zona backend (Server Component de una página, sin UI nueva). Rango reservado:
> **R1820–R1829** (se usan R1820–R1822; el más alto en vuelo es R1806, de SLT-248 y SLT-255).
> Sin migración, sin esquema, sin dependencia nueva. El grafo de código no indexa este worktree:
> todo se leyó con Grep/Read.

## Alcance

En producción (Vercel) `/ordenes` falla al cargar con
`EmpresaNoResuelta: Sin empresa en contexto para Pais.zonaHoraria: la operacion no se ejecuto`.
Pasó 3 veces, con 2 usuarios, entre el 2026-11-09 y el 2026-11-20 15:25 UTC.

Esta ficha hace que una cuenta **de plataforma** (`superadmin`, sin empresa) que llega a `/ordenes`
reciba un 404 (`notFound()`), como en el resto de páginas de empresa, en vez de un error de servidor.
No cambia nada para `maestro`, `admin` ni `adminTienda`, ni la página de un actor `null`.

## Causa, con evidencia

1. **Quién lanza el error.** `ReglasPaisEmpresaService.zonaHoraria()` pide la empresa en curso
   (`lib/services/ReglasPaisEmpresaService.ts:57-58`). Sin contexto explícito, la busca en la sesión
   (`:94`), y si la sesión no tiene empresa lanza `new EmpresaNoResuelta("Pais", operacion)` (`:95`).
   El mensaje sale de `lib/db/contexto-empresa.ts:102`. Las otras dos salidas con el mismo texto,
   `:93` (contexto de plataforma) y `:107` (empresa sin país visible), no se alcanzan desde esta página:
   la página no abre `comoPlataforma`, y la organización siempre tiene país.
2. **La sesión solo no tiene empresa si es de plataforma.** `empresaDeLaPeticion` devuelve
   `usuario.organizacionId` del dueño de la sesión (`lib/auth/empresa-de-la-peticion.ts:60-80`).
   Las cuentas de empresa tienen siempre empresa: `puedeIniciarSesion` solo deja pasar una sin empresa
   si `esPlataforma(rol)` (`lib/auth/puede-iniciar-sesion.ts:20-24`). El único rol de plataforma es
   `superadmin` (`lib/auth/plataforma.ts:17`).
3. **La página no le cierra la puerta al superadmin.** `/ordenes` usa una lista de exclusión:
   `if (rol === RolValue.mensajero || rol === RolValue.adminSatelite) notFound();`
   (`app/(app)/ordenes/page.tsx:89`). El superadmin pasa, cae en la rama del listado plano y llega a
   `const zona = await zonaDelBorde();` (`app/(app)/ordenes/page.tsx:219`). Esa línea corre **para
   cualquier rol**, sin condición. `zonaDelBorde` → `zonaHoraria()` → sesión sin empresa → la
   excepción. No hay `try` alrededor, así que la página entera cae.
4. **Cómo llega el superadmin a `/ordenes`.** El menú no se la ofrece (`lib/auth/menu-visibility.ts:405-410`,
   `roles: ["maestro","admin","adminTienda"]`). Pero el login respeta `?redirect=` para cualquier ruta
   interna, sin mirar el rol (`app/login/_components/LoginForm.tsx:36-41`, `:143`, `:226`), y el
   middleware manda a `/login?redirect=/ordenes` a quien pierde la sesión en `/ordenes`
   (`middleware.ts:109-112`). `/ordenes` es además el aterrizaje post-login de la tienda
   (`lib/auth/menu-visibility.ts:565-569`). Si un superadmin entra desde ese enlace, o escribe la URL,
   la página falla siempre: el fallo es **determinista para el rol `superadmin`** y no se da con
   ningún rol de empresa.
5. **Las páginas hermanas ya lo resuelven con una lista de inclusión.** Las que leen la zona con
   `zonaDelBorde()` hacen antes un `notFound()` para todo rol que no sea el suyo:
   `app/(app)/wallet/mensajeros/page.tsx:31` (`!actor || !esAccesoTotal(actor.rol)`),
   `app/(app)/ranking/historico/page.tsx:56`, `app/(app)/recepcion-satelite/en-bodega/page.tsx:42`.
   La única que llama a `zonaDelBorde()` sin esa puerta es `/ordenes`.

Lo que **no** se pudo comprobar desde el worktree: que los 2 usuarios de los logs sean superadmin.
Los logs de Vercel no son accesibles para este agente. Es la única explicación que da el código, pero
el leader debe confirmarlo antes de aprobar (T0).

## Lo que ya existe (y se reutiliza)

| Qué | Dónde | Uso aquí |
|---|---|---|
| Quién es plataforma | `lib/auth/plataforma.ts` (`esPlataforma`) | La puerta nueva pregunta aquí, por import, no con un literal `"superadmin"` (la regla del propio archivo). |
| Puerta por rol con `notFound()` | `app/(app)/ordenes/page.tsx:89` | Se amplía esa misma línea; no se crea otra guardia. |

## Requisitos (EARS)

- **R1820** — CUANDO un actor de plataforma (`esPlataforma(rol)`) abre `/ordenes`, la página DEBE
  responder `notFound()` antes de leer la zona horaria, el catálogo de filtros o la franja de
  retenidas.
- **R1821** — CUANDO un actor de plataforma abre `/ordenes`, la página NO DEBE llamar a
  `zonaDelBorde()` (la lectura que lanza `EmpresaNoResuelta` sin empresa).
- **R1822** — CUANDO un actor `maestro`, `admin` o `adminTienda` abre `/ordenes`, la página DEBE
  seguir renderizando el listado con la zona de su empresa, igual que hoy (sin regresión).

## Fuera de alcance

- Un actor `null` con una sesión que el middleware da por válida (usuario desactivado). Hoy esa página
  pinta el listado plano, y los tests de la página dependen de eso (`tests/components/OrdenesPage.test.tsx:54`,
  `:226`, `:560`, `:638`). Con una cuenta de empresa no da este error: la empresa sale de la sesión.
  Solo un superadmin **desactivado** con sesión viva lo daría. Si se quiere cerrar, es otra ficha.
- Hacer que el login ignore `?redirect=` cuando la ruta no es del rol. Es un cambio de autenticación
  (ruta completa) y no hace falta para cortar el error.

## Tasks

- **T0** — (leader) Confirmar en los logs de Vercel que los usuarios de los 3 errores son `superadmin`.
  Si alguno es de empresa, la causa no es esta: se para y se vuelve al diagnóstico.
- **T1** — Test rojo. Archivo nuevo `tests/components/OrdenesPageSuperadmin.test.tsx`:
  - dobla `resolveActorFromSession` a `{ rol: "superadmin" }`;
  - dobla `zonaDelBorde` para que lance `EmpresaNoResuelta("Pais","zonaHoraria")`, como en producción;
  - dobla `notFound` para que lance un error marcado.
  Afirma que `OrdenesPage()` rechaza con **ese** error de `notFound` (no con `EmpresaNoResuelta`) y que
  `zonaDelBorde` no se llamó (R1820, R1821). Un segundo caso, con `maestro`, `admin` y `adminTienda`,
  afirma que `zonaDelBorde` sí se llama y que no hay `notFound` (R1822). Se corre sin el arreglo:
  debe dar ROJO.
- **T2** — Arreglo: en `app/(app)/ordenes/page.tsx:89`, añadir `|| (rol !== undefined && esPlataforma(rol))`
  a la puerta existente, importando `esPlataforma` de `@/lib/auth/plataforma`. Comentario de una línea
  con SLT-250 y el porqué.
- **T3** — Mutación: revertir T2, correr el test de T1 y anotar que da ROJO. Restaurar y anotar que
  da VERDE.
- **T4** — `./init.sh` con la base desechable `servi_slt250` y `NODE_OPTIONS=--max-old-space-size=8192`,
  con `INIT_EXIT=$?` dentro del log. Bitácora en `progress/features/SLT-250.md`.

## Archivos esperados

- `app/(app)/ordenes/page.tsx`
- `tests/components/OrdenesPageSuperadmin.test.tsx`
- `specs/SLT-250-ordenes-zona-horaria-sin-empresa/requirements.md`
- `progress/features/SLT-250.md`

## Trazabilidad

| Requisito | Test |
|---|---|
| R1820 | `tests/components/OrdenesPageSuperadmin.test.tsx` › «superadmin: notFound antes de leer la zona» |
| R1821 | `tests/components/OrdenesPageSuperadmin.test.tsx` › mismo caso, `zonaDelBorde` sin llamadas |
| R1822 | `tests/components/OrdenesPageSuperadmin.test.tsx` › «roles de empresa: leen la zona y no hay notFound» |
