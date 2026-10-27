# Revisión SL-23 «Catálogo de módulos y módulos activos por empresa» — F2.2

Rama `feature/SL-23-catalogo-modulos`, HEAD `9062a68`, diff `dev...HEAD` (merge-base `e50ae78b`; lo
que `dev` añadió después es solo del arnés, Trello, y no toca `lib/`, `app/` ni `db/`).
Reviewer, 2026-10-26/27. El MCP del grafo no se usó: bastaron Grep/Read y el diff.

## Verificación ejecutada (no me fío de la bitácora)

| Qué | Resultado |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` | exit 0 |
| `pnpm run lint` | 0 errores, 231 warnings. `eslint` sobre los `.ts/.tsx` del diff fuera de `tests/`: 1 warning, `EnviarPlantillaWhatsappButton` sin usar en `GestionarOrdenPanel.tsx`, que ya existía en `dev` (el uso está comentado). Nada nuevo |
| Unit y componentes de SL-23 (15 archivos: `tests/unit/modulos/*`, servicio, menú, API, crons, drenador, webhook, guardias `modulos-reparto` y `modulos-sin-seed`, composition root, página de detalle, `CierresAdminPage`) + `ModulosEmpresa.test.tsx` | 15/15 archivos, 173 tests; y 8/8 |
| Integración DB (6 archivos: `organizacion-modulo`, `migracion-sl23-ida-y-vuelta`, `modulos-empresa-historial`, `modulo-apagado-action`, `nucleo-sin-modulos`, `para-cada-empresa-modulo`) | 6/6, 42/42 sobre una base nueva `logistic_sl23_rev` (`prisma migrate deploy` limpio). En `logistic_sl23b`, `modulos-empresa-historial` cae porque los E2E dejaron un superadmin en esa base (`exigirSinSuperadmin`): es la base, no el código |
| Guardias (`tests/unit/guards` + `tests/guards`, con DB) | 235/236 archivos. Los 4 rojos son `dependencias-declaradas-presentes` (baseline, ajeno, ya conocido) |
| `package.json`, `pnpm-lock.yaml`, `tests/baseline-rojos.json` | sin diff contra `dev` (R29) |
| E2E | no los corrí: me fié de la salida de la Tanda 7, que es concreta (líneas `[humo módulos …]`, dos corridas 7 passed) |
| Procesos colgados tras la interrupción del watchdog | ninguno: no queda `node`/`vitest` del worktree |

## Checklist

### Especificación
- [x] `requirements.md` con R1–R34 en EARS (no hay R26–R29 fuera de orden, solo la numeración salta para R30–R34: todos existen).
- [x] `design.md` con alternativas descartadas (§11, 8).
- [ ] **Todas las tasks `[x]`**: T14 sigue `[ ]` (falta `./init.sh`). Ver B2.
- [x] `design.md` abre con `## Lo que ya existe`, con contenido. El diff no re-crea nada de esa lista: reutiliza `paraCadaEmpresa`, `conEmpresa`/`comoPlataforma`, `appendAccion` (gana un `organizacionId?` opcional), `itemsVisibles`/`puedeVer` sin cambiar firmas, `conEmpresaDeLaKey` como punto único, el `Switch` de `components/ui`.

### Equipo
- [x] Assignee (Camilo) y rama de feature; choque con SL-43 aceptado por el humano (conocido).

### Trazabilidad
- [x] El mapa `R → test` está en `progress/impl_SL-23.md > Tanda 7`.
- [ ] **Cada R mapea a un test real**: falla R22. Ver B1. El resto lo comprobé contra los nombres y el cuerpo de los tests:
  R1/R2 `catalogo.test.ts` y el `it.each` del servicio con `incidentes_novedades`; R3 la guardia (a) con autocomprobación de mutaciones; R4/R7/R25 `organizacion-modulo` (23505, `42501` en INSERT/UPDATE/DELETE con `servi_app`, B no lee A por id); R5/R27 `migracion-sl23-ida-y-vuelta` (backfill de 8, `information_schema`, `pg_enum`, ida y vuelta de los tres `down.sql`); R6 alta por `OrganizacionService`; R8/R14 la página de detalle (6 roles → `notFound` sin leer); R9 sin memo entre peticiones (unit) y lectura siguiente (DB); R10 los 6 roles, el maestro de esa empresa y el orden «quién antes que qué»; R11; R12 misma transacción con fallo forzado del historial; R13; R15/R32 `menu-modulos`; R16/R17/R33/R34 `exigir-modulo` + guardias (b)(c) + `modulo-apagado-action`; R18 las 9 rutas (10 manejadores); R19/R20/R30 drenador y `job-queue-service-descartado`; R21 unit y DB; R24 webhook (incluye dos empresas en el mismo POST); R26 E2E; R28 guardia de seed; R29; R31 `nucleo-sin-modulos` + `CierresAdminPage`.

### Calidad de código
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: pendiente del PR (no evaluable aquí).
- [x] Flujos críticos: toca aislamiento, `mis-asignaciones`, `recepcion-satelite`, wallet/`mi-wallet` y cierres. Hay E2E de cada uno. La salida local está en el impl para `dos-empresas-humo` (×2), `wallet-iva-aparte-sl39`, `cobro-plataforma-sl40`, `pago-plataforma-sl45`, `reparto/mis-asignaciones` y `dinero/wallet`. Ver m3.
- [x] Sin dependencias nuevas.

### Seguridad y configuración
- [x] Sin secretos ni valores de entorno en el código. No se añade ningún webhook entrante; el de WhatsApp sigue validando la firma ANTES de la puerta de módulo (test «firma inválida sigue siendo unauthorized»).

### Verificación final
- [ ] `./init.sh` en verde: no se corrió. El leader sabe que cae en el validador de features por la migración a Trello, ajena. Sus pasos (typecheck, lint, guardias) los corrí por separado y están verdes salvo el baseline.
- [ ] Cierre en `progress/features/SL-23.md` y desmontaje del worktree: los hace el leader después.

### `docs/checkpoints-proyecto.md`
- [x] Tabla nueva con `organizacion_id`, RLS `FOR ALL TO servi_app` con `USING` y `WITH CHECK`, `REVOKE INSERT, UPDATE, DELETE`, trigger de «sin cambio de empresa» y clasificada en `MODELOS_DE_NEGOCIO`.
- [x] Query nueva de negocio con test de dos empresas: `organizacion-modulo`, `para-cada-empresa-modulo` y `modulos-empresa-historial` (la vecina no se entera).
- [x] Las tres migraciones traen `down.sql`. Van detrás de la última de `dev` (`20261025160100_entorno_marca`) y no editan ninguna aplicada. La ida y vuelta está probada.
- [x] Ni Ordenex ni literales de país o moneda en código nuevo. `sinpe` solo aparece como clave de ruta o action ya existente en `reparto.ts`. Los `console.log` nuevos son de E2E y no llevan PII. El `console.info` de `paraCadaEmpresa` solo lleva ids de empresa.
- [x] Capas: servicio, repositorio, action y composition root. zod en el borde (`fijarModuloEmpresaSchema`).
- [x] Autorización en el servidor: el servicio comprueba `esPlataforma` antes de zod y antes de la base. La página hace `notFound()` antes de leer. Un módulo apagado se rechaza en la action (guardia c), en el job (drenador), en la API (`conEmpresaDeLaKey`) y en la página (guardia b), no solo en el menú.

### `docs/perfil-agentes.md > reviewer`
- [x] Ninguna tabla o query de negocio sin `organizacion_id`.
- [x] Ninguna tabla sin RLS.
- [x] Ninguna migración sin `down.sql`.
- [x] Sin literales de país.
- [x] Sin referencias a Ordenex.
- [x] Sin dependencias nuevas.
- [x] Los comentarios explican el porqué (memoria por empresa, por qué `CASCADE`, por qué `details.codigo`).

## Foco pedido por el leader

- **RLS de `organizacion_modulo`.** Correcta y probada con SQL a mano como `servi_app`: lectura cruzada y escritura, incluida la propia, dan `42501`. Solo escribe `ModulosEmpresaRepository`, en `comoPlataforma`, con su fila en `EXCEPCIONES_DE_PLATAFORMA`. Escribe `organizacion_id` explícito en la fila y en el historial.
- **Caché de `exigir-modulo.ts`.** `cache()` de React va con la empresa como clave: el `organizacionId` del contexto, o `""` para la empresa de la sesión.
  - Una petición que recorre varias empresas (drenador, `paraCadaEmpresa`) no reutiliza la lista de otra. Lo cubre el test «dos empresas en la misma petición».
  - En plataforma devuelve `null` sin consultar. Sin ese corte, una lectura como dueño vería las filas de todas.
  - Solo se traga `EmpresaNoResuelta`; cualquier otro error se propaga (test).
  - No hay memoria entre peticiones (R9).
  - Las tres rutas que dependen del contexto lo tienen dentro del `conEmpresa`: el webhook (línea 205 → 240), la API por key y el drenador. Correcto.
- **`comoPlataforma`.** Solo en el repositorio de escritura y en el listado de `paraCadaEmpresa`, que ya existía. El filtro `modulos: { some: { modulo } }` también corre como plataforma, que es lo correcto para listar empresas.
- **Guardia `modulos-reparto`.**
  - Casos (a)–(f), con autocomprobación por mutación y `ANUNCIADAS` vacía.
  - Mi recuento a mano de funciones exportadas frente a puertas en las 48 actions de módulo solo encuentra diferencias en `wallet`, `wallet-egresos` y `wallet-tienda`, y son firmas de sobrecarga (la implementación sí lleva la puerta).
  - Los 4 consumos cruzados de §6.3 se aplican de verdad en las anfitrionas: el flag sale del Server Component con `moduloActivo` y la pieza no se monta.
- **Toggle solo superadmin.** El servicio decide antes de validar y antes de leer. Los 6 roles de empresa, el maestro de la misma empresa y la falta de sesión dan `forbidden` sin tocar el repositorio.
  - La action acepta un `deps` opcional, igual que los 108 archivos de `lib/actions`: es el patrón del repo, no un hallazgo de SL-23.

## Hallazgos

### B1 — BLOQUEANTE: R22 no tiene test
El mapa dice `tests/integration/db/organizacion-modulo.test.ts (apagar y encender Ranking con datos:
mismo recuento y mismas filas)`, pero en ese archivo no existe ningún caso así:
- Los únicos `it` son R4, R4, R4, R7, R7, R7, R9/R25, R25 y R6.
- La única mención a datos de ranking es el `premioRanking.deleteMany` del `afterAll`.
- Ningún archivo de tests de SL-23 cita R22.

R22 es lo que garantiza la decisión «los datos no se borran y vuelven al reencender».

**Qué falta:** un test de integración que siembre datos de un módulo (p. ej. `premio_ranking` o
filas de ranking) para una empresa, apague el módulo por `ModulosEmpresaRepository.apagar`, compruebe
que el recuento y las filas no cambian, lo vuelva a encender y compruebe que la lectura de la app
devuelve las mismas filas. Después, corregir el mapa del impl.

### B2 — BLOQUEANTE (proceso): T14 sin marcar
`tasks.md` tiene T14 `[ ]` y CHECKPOINTS exige todas en `[x]`. Lo único pendiente es `./init.sh`, que
cae por una causa ajena y conocida (validador de features por la migración a Trello en `dev`).

**Qué falta:** que el leader decida. O corre `./init.sh` cuando el validador esté sano, o deja anotado
en T14 por qué `init.sh` no es evaluable y que sus pasos se verificaron por separado (typecheck, lint
y guardias, verdes salvo el baseline en esta revisión). Después, marcar T14 `[x]`. No es un defecto
del código.

### m1 — menor: la base de la feature no sirve para repetir la integración
En `logistic_sl23b`, `modulos-empresa-historial` falla porque los E2E dejaron un superadmin en esa
base. Sobre una base limpia pasa 7/7. Conviene anotarlo en el impl para que la siguiente vuelta no
lo confunda con un rojo. También queda una base de revisión, `logistic_sl23_rev`, que se puede
borrar.

### m2 — menor: la pantalla nueva no consta como pasada por `/design`
`docs/perfil-agentes.md > frontend_dev` pide pasar toda pantalla nueva por `/design`, y en el impl no
consta que `/plataforma/empresas/[organizacionId]` lo hiciera. Usa `AppPage`, el `Switch` de
shadcn y los tokens existentes. No bloquea, pero hay que anotarlo o pasarla.

### m3 — menor: E2E de flujos críticos sin salida local
`recepcion-satelite`, `mi-wallet`, `wallet-mensajeros` y `cierres-admin` tocan páginas que ganaron
puerta o cambiaron (`/wallet/mensajeros` pierde la pestaña de premios con Ranking apagado), y no
tienen salida local. Sus empresas salen de `crearEmpresaE2E`, que enciende los 8 módulos, así que no
espero rojos. Quedan para CI, y el leader ya lo sabe para `aislamiento`. Al menos
`wallet-mensajeros` conviene correrlo en local, porque su pestaña cambió de tipo
(`premios: … | null`).

### m4 — menor: pregunta abierta sin cerrar
`progress/features/SL-23.md > Preguntas abiertas`: con WhatsApp apagado, `/novedades` se queda solo
con «Llamar». Está bien que el leader lo pregunte al humano antes del PR, pero no bloquea.

## Lo que no cubrí
- No corrí E2E. Me fié de la Tanda 7, cuya salida es concreta.
- No corrí `./init.sh` ni `vitest related` completo; quedan para CI y el leader.
- No revisé a fondo los ~120 tests existentes que solo ganan el mock `puertasAbiertas()`. Corrí los
  de SL-23 y los de cierres y wallet citados arriba.

## Veredicto

**RECHAZADO**, por B1: R22 sin test. B2 es de proceso y lo resuelve el leader. Lo demás (aislamiento,
RLS, caché por empresa, puertas, migraciones con `down.sql` y toggle solo superadmin) está bien
resuelto y verificado. La vuelta 2 debería limitarse al test de R22, al mapa y a la marca de T14.

## Vuelta 2 (acotada a 715dc40..bdedf74: merge de dev 14ec5df, test R22 7f6babd, cierre T14 bdedf74)

### Verificación ejecutada

| Qué | Resultado |
|---|---|
| `prisma migrate deploy` sobre `logistic_sl23_rev` | sin migraciones pendientes |
| `vitest run tests/integration/db/modulo-apagado-datos-intactos.test.ts` (DATABASE_URL a `logistic_sl23_rev`, `timeout 300`) | 1/1 archivo, 1/1 test en verde (no skip) |
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm run -s typecheck` | exit 0 |
| `pnpm run -s test:guardias` | 314/315 archivos; 4 tests rojos, todos en `dependencias-declaradas-presentes` (baseline, permitido) |
| `vitest related` completo | no corrido, por decisión del humano: lo cubre `gate-completo` en el PR |

### Checklist

- [x] **B1 — R22 tiene test real.** Siembra 3 premios y una foto de ranking con su fila; apaga por
  `ModulosEmpresaRepository.apagar`, comprueba que Ranking queda apagado y que recuento y filas
  completas (como dueño, sin RLS, con los Decimal normalizados) son iguales a los de antes; reenciende y
  comprueba lo mismo, y además que los repositorios de lectura de la app (extensión + contexto de
  empresa) devuelven lo mismo que antes de apagar. Tiene un control para que no compare un vacío con
  otro vacío (`toHaveLength(3)` y `toHaveLength(1)`). Usa los locks de superadmin y de escritura real.
- [x] **B1 — mapa.** `progress/impl_SL-23.md:901` apunta R22 a este archivo y a este `it`.
- [x] **B2 — T14 `[x]`** en `tasks.md`, con nota de que el `vitest related` completo queda al
  `gate-completo` de CI. Ninguna tarea `[ ]` en `tasks.md`.
- [x] **Merge de dev:** typecheck y guardias sin regresiones.

### Hallazgos

- **menor** — `specs/SL-23-catalogo-modulos/requirements.md:70`: la columna de verificación de R22
  sigue apuntando a `tests/integration/db/organizacion-modulo.test.ts`, que no tiene ningún test de
  R22. El mapa que manda (`impl_SL-23.md`) está bien; conviene alinear la tabla del spec con
  `modulo-apagado-datos-intactos.test.ts`. No bloquea.

### Veredicto

**OK.** B1 y B2 resueltos; el merge de dev no rompe typecheck ni guardias.
