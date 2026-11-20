# SLT-183 «Usuarios propios en tests de geografía, avisos y migraciones» — bitácora (backend_dev)

## Entorno
- Worktree al día con `origin/dev` (trae SLT-178, SLT-179, SLT-182). `.env` presente (no leído).
- Bases desechables vía `scratchpad/con-desechable.cjs` (sin leer `.env` ni ver URLs), migradas
  (`migrate deploy`) + `pnpm run db:seed`, igual que `gate.yml`. Postgres local **18.2** (CI usa 17):
  ningún test del alcance depende de un detalle del motor que cambie entre 17 y 18 (sí de 40P01 y del
  orden de locks, que es igual).
  - **A** `servi_slt183_desechable`: vacía (solo catálogos). R1100.
  - **B** `servi_slt183b_desechable`: + empresa AJENA confirmada con `scratchpad/slt183-otra-empresa.tmp.ts`
    (fuera del repo; copia del de SLT-182 apuntando a este worktree): 1 organización, zona central y
    satélite, 5 usuarios (mensajero, adminTienda, maestro, adminSatelite, admin), 40 órdenes, 40
    gestiones, 2 `cierre_dia`, 2 tarifas, 1 `cierre_bodega`, 1 fila en cada libro. R1101.
- `prisma generate` no se ejecutó. Ningún archivo de `lib/ app/ components/ hooks/ db/ scripts/
  .github/ package.json` tocado. Helpers compartidos (`_postgres-real.ts`, `454/_escenario.ts`,
  `_fixtures/*`, `_exclusion-demo-qa.ts`, `_whatsapp-envios-474.ts`) **sin cambios**: R1109 no aplica.

## T1 — antes (base A, JSON de vitest; p/f/s)
Iguales a la tabla del spec: api-key-eliminar 0/0/10, asistente-uso-diario.int 0/0/11,
cobertura-repository 3/0/2, geografia-cascada-reversible 0/0/10, geografia-registro-accion 2/0/12,
geografia-renombrado 0/0/17, notif-cierre-rechazado 25/1/0, notif-geocodificacion-caida 25/2/0,
notif-reparto-manana 26/1/0, notif-traspaso 27/1/0, reparto-manana-aviso-dedupe 0/0/8,
usuario-contar-adminsatelites 0/2/0, vista-filtro 0/0/8, webhook-suscripcion-circuito 14/3/0,
whatsapp-envio-idempotencia-programado 0/0/4. Los 15 estaban en el baseline citando SLT-183.

## T2-T4 — qué se sembró
| archivo | actor / rol | cómo |
|---|---|---|
| `api-key-eliminar` | maestro | `enTx` local: `crearUsuarioDePrueba` en la tx de cada caso + control `count === 1` |
| `asistente-uso-diario.int` | maestro + empresa, **commiteados** (dos conexiones de la carrera) | bajo `bajoLockDeEscrituraReal`; borrado en `afterAll` con recuento 0 |
| `cobertura-repository` | adminTienda | en `sembrar(tx)`; la central y la tarifa (NULL, NULL) se buscan en la empresa del caso (`current_setting`), no en toda la base |
| `geografia-cascada-reversible`, `-registro-accion`, `-renombrado` | **superadmin** (la geografía la gestiona la plataforma, `GESTION_ROLES`) | `tomarLockDeSuperadmin` en `beforeAll`/`afterAll`; `liberarHuecoDeSuperadmin` + `insertarUsuario(…, null)` en la tx; nombre esperado leído de la fila sembrada |
| `notificacion-evento-cierre-rechazado/-reparto-manana/-traspaso-migration` | mensajero (destinatario) | `destinatarioSembrado(tx)`; el `(SELECT "id" FROM "usuario" LIMIT 1)` pasa a parámetro |
| `notificacion-evento-geocodificacion-caida-migration` | maestro (lector) | `SELECT … WHERE "id" = $1` del sembrado; la aserción «hay 1» se conserva |
| `reparto-manana-aviso-dedupe` | 2 mensajeros + empresa, **commiteados** (R24 escribe por dos conexiones) | bajo `bajoLockDeEscrituraReal`; casos en tx con `organizacionId` de esa empresa; borrado + recuento 0 en `afterAll` |
| `usuario-contar-adminsatelites` | (ya sembraba) | el tipo `cedula` se lee del catálogo por clave, no del «primer usuario»; control `count === 1`. Cuenta por zona sembrada: estable con datos ajenos (B igual) |
| `vista-filtro` | maestro | `INSERT … SELECT` desde `tipo_identificacion`/`rol` por clave; control `count === 1` |
| `webhook-suscripcion-circuito-migracion` | maestro (dueño) | `SELECT … WHERE "id" = $1` del sembrado; anti-vacuidad intacta |
| `whatsapp-envio-idempotencia-programado` | 2 mensajeros + empresa, **commiteados** | en la tx de la siembra, tras `serializarEscriturasReales`; borrado bajo lock + recuento 0 |

Lección medida: la primera versión creaba la empresa commiteada FUERA del lock de la 227 y una de
cuatro corridas de los 15 juntos dio `40P01` en `notificacion-evento-traspaso-migration:529` (DDL del
down). Con la siembra y el borrado bajo el lock, 3 corridas seguidas sin deadlock.

R1105: ningún `it`/`expect`/literal esperado quitado ni cambiado; nº de casos por archivo igual.

## Resultado (JSON de vitest, los 15 juntos; p/f/s)
| archivo | A (vacía) | B (empresa ajena) | destino |
|---|---|---|---|
| `api-key-eliminar` | 10/0/0 | 10/0/0 | retirado |
| `cobertura-repository` | 5/0/0 | 5/0/0 | retirado |
| `geografia-cascada-reversible` | 10/0/0 | 10/0/0 | retirado |
| `geografia-registro-accion` | 14/0/0 | 14/0/0 | retirado |
| `geografia-renombrado` | 17/0/0 | 17/0/0 | retirado |
| `notificacion-evento-cierre-rechazado-migration` | 26/0/0 | 26/0/0 | retirado |
| `notificacion-evento-geocodificacion-caida-migration` | 27/0/0 | 27/0/0 | retirado |
| `notificacion-evento-reparto-manana-migration` | 27/0/0 | 27/0/0 | retirado |
| `notificacion-evento-traspaso-migration` | 28/0/0 | 28/0/0 | retirado |
| `usuario-contar-adminsatelites` | 2/0/0 | 2/0/0 | retirado |
| `vista-filtro` | 8/0/0 | 8/0/0 | retirado |
| `asistente-uso-diario.int` | 4/7/0 | 4/7/0 | baseline, SLT-185 (SL017, `:125`) |
| `reparto-manana-aviso-dedupe` | 7/1/0 | 7/1/0 | baseline, SLT-185 (SL017, `:307`) |
| `whatsapp-envio-idempotencia-programado` | 0/4/0 | 0/4/0 | baseline, SLT-185 (SL017, `:81`) |
| `webhook-suscripcion-circuito-migracion` | 16/1/0 | 16/1/0 | baseline, SLT-187 (columnas del down, `:288`) |

Los tres SLT-185: conexiones crudas (sin la extensión de empresa) que escriben fuera de una tx; el
usuario sembrado ya es de una empresa y la FK misma-empresa (SL017) lo rechaza. Es contexto de
empresa en el test, no un fallo de producción (en producción el cliente extendido fija la empresa).

R1103: conteo de B antes y después de la suite idéntico (`organizacion 1, zona 2, usuario 5, orden 40,
gestion_orden 40, cierre_dia 2, tarifa_zona_mensajero 2, notificacion 0, …`); en A, 0 en todas tras
la suite y tras las mutaciones.

## T6 — mutaciones (base A, una a una, árbol restaurado con `git checkout -- <archivo>`)
| archivo | fila quitada | caso rojo | mensaje |
|---|---|---|---|
| `api-key-eliminar` | maestro → id inventado | 10/10 (R2…) | `SLT-183: el maestro sembrado (actor) no esta en la base` |
| `asistente-uso-diario.int` | usuario → id inventado | beforeAll: los 4 verdes pasan a no ejecutarse | `SLT-183: el usuario sembrado (dueno del contador) no esta en la base: expected +0 to be 1` |
| `cobertura-repository` | adminTienda → id inventado | 2 (listZonaIdsConTarifaGeneral…) | `SLT-183: el adminTienda sembrado no esta en la base` |
| `geografia-cascada-reversible` | superadmin → id inventado | 10/10 | `SLT-183: el superadmin sembrado (actor) no esta en la base` |
| `geografia-registro-accion` | ídem | 12 | ídem |
| `geografia-renombrado` | ídem | 17/17 | ídem |
| `notificacion-evento-cierre-rechazado-migration` | destinatario → id inventado | «R25: … la fila del aviso SIGUE AHÍ» | `SLT-183: el mensajero sembrado (destinatario del aviso) no esta en la base` |
| `notificacion-evento-reparto-manana-migration` | ídem | «… la fila del aviso SIGUE AHÍ» | ídem |
| `notificacion-evento-traspaso-migration` | ídem | «… la fila del aviso SIGUE AHI» | ídem |
| `notificacion-evento-geocodificacion-caida-migration` | maestro lector → id inventado | «R9 (barrera 1)» | `no hay ningún usuario en la base: el caso no se puede medir: expected +0 to be 1` |
| `reparto-manana-aviso-dedupe` | 1.er mensajero → id inventado | beforeAll: los 7 verdes pasan a no ejecutarse | `SLT-183: los dos mensajeros sembrados no estan en la base` |
| `usuario-contar-adminsatelites` | 2.º adminSatelite de R22 (`pii-b`) | R22 | `expected +0 to be 1` |
| `vista-filtro` | INSERT del usuario anulado | 8/8 | `SLT-183: el usuario sembrado «ana» no esta en la base (¿falta «cedula» o «maestro»?)` |
| `webhook-suscripcion-circuito-migracion` | dueño → id inventado | «una fila MINIMA nace con contador 0» | `no hay ni un \`usuario\` en la base: el caso no midio nada` |
| `whatsapp-envio-idempotencia-programado` | 1.er destinatario → id inventado | beforeAll (los 4, ya rojos por SL017, dejan de ejecutarse) | `23503 … whatsapp_envio_destinatario_usuario_id_fkey` |

Nota (no se cambia, fuera de alcance): los casos «el DOWN … ABORTA RUIDOSAMENTE» de las tres
migraciones de avisos siguen verdes con la mutación porque esperan `rejects.toThrow()`; su
anti-vacuidad la da el caso hermano «la fila SIGUE AHÍ», que sí cae.

## Mapa R → test
| R | evidencia |
|---|---|
| R1100, R1102, R1104, R1105 | los 15 archivos (tabla «Resultado», columna A) + diff |
| R1101, R1103 | columna B + conteos antes/después |
| R1106 | tabla de mutaciones |
| R1107, R1108 | `git diff origin/dev -- tests/baseline-rojos.json`: −11 claves del alcance, 4 motivos reescritos (`desde` intacto) |
| R1109 | no aplica (ningún helper compartido tocado) |
| R1110, R1112 | `git diff --name-only` y `scripts/tamano-pr.mjs` (abajo) |
| R1111 | CI del PR pendiente |

## T8 — salidas
- `pnpm run typecheck`: `tsc --noEmit` sin errores (exit 0). `eslint` sobre los 15 archivos: exit 0.
- `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json`: vacío.
- `node scripts/tamano-pr.mjs`: `16/40 archivos, 0/1000 lineas de produccion, 576/3000 de tests` (sin línea de aceptación).
- Gate: `con-desechable.cjs … servi_slt183_desechable -- bash ./init.sh` → `== init OK ==`, `INIT_EXIT=0`
  (typecheck, lint, test:rapido 1001 passed; 106 rojos heredados del baseline los compara el CI).
- CI del PR (`gate-completo`, R1111): pendiente.

**Veredicto:** 11 de 15 retirados del baseline, verdes en base vacía y con empresa ajena; 4 quedan con
causa medida (SLT-185 ×3, SLT-187 ×1); gate local verde.
