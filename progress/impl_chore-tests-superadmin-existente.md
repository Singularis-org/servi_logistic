# impl — chore/tests-superadmin-existente

Cambio de tests pedido por el humano (2026-11-19): «ajústalo para que reutilice el superadmin
existente». Sin ficha. Rama `chore/tests-superadmin-existente`, desde `origin/dev` (bd43f7ae).

## Problema

La base local de desarrollo (`servi_logistic_simprod`) ya tiene un superadmin real con filas que lo
referencian, y el índice `usuario_un_solo_superadmin` (SL-32 R27) solo admite uno. Los tests que
borraban el superadmin (`liberarHuecoDeSuperadmin`, 23503) o abortaban (`exigirSinSuperadmin`, el
fixture E2E) fallaban sin probar nada. En una base vacía (CI) el comportamiento es el de antes.

**Regla:** nunca se borra ni se modifica el superadmin existente ni sus datos (ni contraseña, ni
email, ni ninguna columna).

## Archivos cambiados

### Integración (`tests/integration/db/`)
- `_fixtures/superadmin-32.ts`: añade `superadminDeLaBase`, `superadminDelCaso`,
  `obtenerOCrearSuperadmin`, `MOTIVO_SUPERADMIN_AJENO`, `saltarSiHaySuperadminAjeno` (`ctx.skip` en
  marcha, con el lock tomado) y `exigirHuecoDeSuperadmin`. Quita `liberarHuecoDeSuperadmin`, el
  `DELETE` del superadmin. Mantiene el lock `tomarLockDeSuperadmin` y el orden de locks.
- `_fixtures/planes.ts`: reutiliza el superadmin de la base en vez de apartarlo.
- `geografia-renombrado`, `geografia-cascada-reversible`, `geografia-registro-accion`,
  `geografia-superadmin-sin-empresa`, `bug-report`, `vehiculos-plataforma`, `planes-historial`,
  `pago-plataforma-confirmacion`, `empresas-plataforma-deuda-sl45`, `modulo-apagado-datos-intactos`,
  `modulos-empresa-historial`, `aislamiento-fk-misma-empresa`: usan el superadmin de la base si
  existe, o crean el suyo como antes y solo borran ese.
- `aislamiento-usuarios`, `arranque-superadmin`, `carga-division`, `un-solo-superadmin`,
  `usuario-empresa-o-superadmin`, `usuarios-sin-superadmin`, `usuario-unico-por-empresa`: los casos
  que necesitan el hueco del índice o un superadmin propio se saltan con superadmin ajeno (tabla de
  abajo); el resto reutiliza.

### E2E (`e2e/`)
- `_superadmin-fixture.ts`: añade `superadminDeLaBase`, `hayOtroSuperadmin` y
  `entrarComoSuperadmin`. Con un superadmin ajeno, `asegurarSuperadmin` no corre el arranque (devuelve
  `null`); sin superadmin, o con el de prueba, hace lo de siempre.
- `_planes-fixture.ts`: `idDelSuperadmin` toma el superadmin de la base.
- `superadmin-empresas`, `dos-empresas-humo`, `cobro-plataforma-sl40`, `facturas-plataforma`,
  `integraciones-por-empresa`, `pago-plataforma-confirmacion`, `pago-plataforma-sl45`,
  `planes-borrador`, `planes-costeo`, `planes-costo-porcentual`, `planes-superadmin`,
  `reporte-de-bugs`: entran con `entrarComoSuperadmin(page, db)`.
- `cierre-modelo-nuevo-plan-porcentual`, `mi-plan-cambiar-plan` (y los de planes y facturas): toman
  el id del superadmin con `superadminDeLaBase`.
- `reporte-de-bugs`: con superadmin ajeno compara el nombre real. La aserción es la misma.
- `superadmin-arranque`: con superadmin ajeno, `beforeAll` falla con un motivo claro (ver «E2E en
  local»).
- `playwright.config.ts`: **sin cambios**; las dependencias entre proyectos siguen igual.

### Cómo se entra sin tocar las credenciales (E2E)
La sesión es la cookie `session` = id de una fila `Session` (`userId`, `expiresAt`); es lo único que
miran el middleware y `resolveActorFromSession`. Con un superadmin ajeno, `entrarComoSuperadmin`:
- abre una `Session` nueva con el `SessionRepository` de la app, con 2 h de vida;
- pone la cookie.

No toca la fila `usuario`, sus dispositivos confiados ni sus intentos de login. Con el superadmin de
prueba (CI) entra con OTP leído del log, como antes.

## Casos que se saltan con superadmin ajeno (en CI corren igual)

Motivo (`MOTIVO_SUPERADMIN_AJENO`): «la base ya tiene un superadmin que no es del test (no se borra
ni se toca): este caso necesita el hueco del indice R27 o un superadmin propio; en CI (base sin el)
corre».

| Archivo | Casos | Por qué |
|---|---|---|
| `un-solo-superadmin` | los que insertan «el primero» | prueban el índice R27: necesitan el hueco |
| `arranque-superadmin` | los del comando de arranque | prueban que el arranque CREA el superadmin |
| `usuario-empresa-o-superadmin` | «un superadmin con NULL y un maestro con empresa pasan» | inserta un superadmin |
| `aislamiento-usuarios` | R35 «con `organizacionId: null` explícito crea el usuario sin empresa» | crea un superadmin |
| `usuario-unico-por-empresa` | R3 «el superadmin entra con el email y la cédula de una cuenta de A…» | crea un superadmin con datos dados |
| `usuarios-sin-superadmin` | 3 casos (búsqueda por sufijo, filtro por rol, listar/listarCompleto) | cuentan sobre un superadmin propio |
| `carga-division` | «control: el actor es el superadmin de la suite» | comprueba que es el de la suite |

En E2E no se puede saltar: la guardia `tests/unit/guards/e2e-sin-saltos.guardia.test.ts` (SL-44
R13) prohíbe todo `skip` en `e2e/`, también el condicional. `superadmin-arranque` (3 casos) falla en
`beforeAll` con un motivo claro. Decisión del humano: no se toca la guardia ni la config; en local se
usa `--no-deps` (abajo).

## E2E en local con una base que ya tiene superadmin

- **`--no-deps`.** Corre cada proyecto con `--project=<p> --no-deps`. `plataforma-vacia` incluye
  `superadmin-arranque`, que falla con superadmin ajeno, y sin `--no-deps` bloquea a los proyectos que
  dependen de él. En CI (base vacía) corre todo con sus dependencias, igual que antes.
- **`AUTH_RISK_THRESHOLD`.** El `.env` del checkout principal trae `AUTH_RISK_THRESHOLD=1000`, que
  apaga el OTP. No hay que exportarla al correr el E2E: con ella fallan los logins de los maestros,
  que leen el OTP del log.
- **chromium 1255.** Playwright 1.65.1 pide `chromium_headless_shell-1255`, que no está instalado en
  esta máquina. No se instaló nada: se usó una config temporal, ya borrada, que apunta al headless
  shell 1234 instalado.
- **Build.** Se usa `next build` directo, no `pnpm build`, que corre migrate-deploy y demo-qa sobre
  la base.
- **Catálogos.** El puerto es `E2E_PUERTO=3044` y la `DATABASE_URL` se exporta a mano. Con
  `aislamiento --no-deps` sale «faltan catálogos en la base: vehiculo: moto, carro, camion». No se
  corrió `db:seed` sobre la base del humano: está **abierto**, lo pregunta el leader.

## Rojo conocido: `carga-division` en bases que ya tienen geo

`carga-division` «decision 4: con dos homonimos…» falla en la base local por la restricción
`nodo_geografico_padre_id_nombre_normalizado_key`, que esa base ya tiene porque le aplicaron las
migraciones de SLT-43 (geo jerárquica), que no están en dev. No es de este cambio y no se arregla
aquí.

## Verificación

- Typecheck (`tsc --noEmit`, con `NODE_OPTIONS=--max-old-space-size=6144`): exit 0.
- Lint completo (`eslint`): exit 0, 0 errores y 249 warnings preexistentes.
- Guardias (`vitest run guard`): 355 archivos pasan y 3 se saltan; 5376 tests pasan. Hay 2 rojos, los
  dos por timeout de 20 s, no por aserción:
  - `descargas-por-registro`;
  - `sin-estados-retirados`.

  Las dos guardias recorren `app/` y `components/`, que este cambio no toca (el código es idéntico a
  `origin/dev`). Corrida sola, `sin-estados-retirados` pasa; `descargas-por-registro` vuelve a agotar
  los 20 s en esta máquina. Lo confirma el CI.
- Integración contra la base del humano (agente de integración):
  - los 3 de geo (`geografia-renombrado`, `geografia-cascada-reversible`,
    `geografia-registro-accion`) pasan;
  - los demás archivos tocados pasan o se saltan con motivo, salvo el rojo de `carga-division` de
    arriba.
- E2E (`E2E_PUERTO=3044`):
  - `plataforma-vacia`: 7 pasan (`superadmin-empresas` 7/7, reutilizando el superadmin existente);
    `superadmin-arranque` falla en `beforeAll` con el motivo y sus otros 2 casos no corren.
  - `aislamiento --no-deps`: se detiene en `beforeAll` por los catálogos.

## El superadmin quedó intacto

Comprobado antes y después de correr los tests:
- `md5(id||email||password_hash)`: `4512a0a39597a7c52b83e132bc590170`, igual antes y después.
- md5 de la fila entera: `9fcf8867fd2f03ae588bf0d9a7c57daa`, igual.
- Sigue `activo`, sin empresa, con 1 dispositivo confiado.
- Sus sesiones pasaron de 3 a 5: son las 2 filas `Session` que abrió el E2E, con 2 h de vida.
