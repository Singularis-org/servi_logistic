# impl SLT-185 «aporte-capital sin empresa en contexto»

Ruta ligera, solo tests. Rango R1140-R1149. Base desechable `servi_slt185_desechable` (migrate deploy +
`db:seed`, por `con-desechable.cjs`). Ningun cambio en `lib/`, `app/`, `db/` ni `scripts/` (R1148: ningun
caso resulto ser un fallo de produccion).

## Alcance

Las 9 entradas del spec + 7 del alcance ampliado (`progress/features/SLT-185.md > Cierre`): 16 archivos.

## T1 — medicion (base vacia, antes del arreglo)

| archivo | p/f/s | primer error real |
|---|---|---|
| actions/analitica-financiera-action | 2/13/0 | `EmpresaNoResuelta: Pais.zonaHoraria` (`ReglasPaisEmpresaService.ts:89`, desde `zonaDelBordeConActor`) |
| db/ajuste-caja-anulacion-461 | 3/2/0 | `wallet: AppErrorCode inesperado INTERNAL` (`lib/actions/wallet.ts:128`) |
| db/aporte-capital | 0/5/0 | `aporte-capital: AppErrorCode inesperado INTERNAL` (`lib/actions/aporte-capital.ts:70`) |
| db/asistente-uso-diario.int | 4/7/0 | SL017 `asistente_uso_diario.usuario_id -> usuario` (:125) + R30: columna `organizacion_id` (SL-17) no esta en la lista |
| db/picking-resumen-tiendas | 0/3/0 | `EmpresaNoResuelta: Pais.zonaHoraria` |
| db/premio-ranking-idempotencia | 16/1/0 | `expected 'unauthenticated' to be 'ok'` (:1080) |
| db/rechazo-tienda-cobro.int | 9/1/0 | SL017 `rechazo_tienda_cobro.gestion_id -> gestion_orden` (:394) |
| db/reparto-manana-aviso-dedupe | 7/1/0 | SL017 `notificacion.destinatario_usuario_id -> usuario` (R24) |
| db/usuario-preferencia | 10/4/0 | `upsert` en el clon: `organizacion_id` NULL (23502) |
| db/wallet-anulacion-concurrencia | 0/2/0 | SL017 `wallet_movimiento.registrado_por -> usuario` (:69) |
| db/whatsapp-envio-idempotencia-programado | 0/4/0 | SL017 `whatsapp_envio_ejecucion.envio_id -> whatsapp_envio` (:81) |
| db/419/confirmar-entrega-lote-sql-real | 9/0/2 (hook) | `zona.create` null constraint (`419/_escenario-419.ts:160`) |
| db/454/registro-gestion-concurrencia-sql-real | 0/0/2 (hook) | `zona.create` null constraint (`454/_escenario.ts:411`) |
| db/454/senales-gestion-lectores-sql-real | 0/0/14 (hook) | `zona.create` **Unique constraint** (`454/_escenario.ts:411`): hipotesis CONFIRMADA, el escenario hermano siembra una segunda central en la misma empresa |
| db/454/caracterizacion/corte-concurrencia | 0/0/2 (hook) | `zona.create` null constraint (`:411`) |
| db/454/caracterizacion/no-doble-gestion | 0/0/2 (hook) | `zona.create` null constraint (`:411`) |

Ninguno es fallo de produccion: en todos la action/servicio falla cerrado porque el TEST no le da empresa.

## Arreglo (por archivo)

- `aporte-capital`, `ajuste-caja-anulacion-461`, `wallet-anulacion-concurrencia`: `conPersonas` corre el
  cuerpo en `conEmpresa459` con control positivo (empresa sembrada = 1, empresa en contexto = la sembrada).
  `aporte-capital`: lecturas de decision (`haySaldoInicialVigente`, `primerDiaDeLaCaja`, `verResumenCaja`)
  por `clienteConEmpresa459(prisma)` (R1142); R71 siembra su movimiento previo (hace 3 dias, admin, ajuste
  manual) con control y `primer` = ese dia (R1143); la huella del rechazo pasa a `caja: 1` (el sembrado).
  `wallet-anulacion`: el sueldo directo lleva `organizacionId`; `crearPendiente` por la envoltura.
- `picking-resumen-tiendas`, `analitica-financiera-action`: `reglasPais: reglasPaisFijas()` en `deps`, con
  conteo de llamadas como control (2 y 10).
- `premio-ranking-idempotencia` T2.5: organizacion propia confirmada, la action en `conEmpresa`, borrada en
  el `finally`.
- `454/_escenario.ts`: `sembrarComprometido` crea su organizacion, la fija (`comoApp`) y corre en
  `conEmpresa`; devuelve `organizacionId` y `centralZonaId`; si falla, borra la organizacion.
  `limpiarComprometido` borra tambien la central y la organizacion, la ULTIMA (R1145). Nuevos
  `clienteDeLaApp454` y `enEmpresaDe`. Los 3 tests de concurrencia usan clientes envueltos + `enEmpresaDe`,
  control de empresa y central = 1, y en `afterAll` comprueban empresas/zonas = 0.
- `454/senales-gestion-lectores`: el escenario hermano reusa la central (`sembrarCentral: false`), con
  control «una central en la empresa».
- `419/_escenario-419.ts`: `limpiar419` acepta `organizacionId` y la borra la ultima.
  `419/confirmar-entrega-lote` R8: organizacion propia, siembra y `c1`/`c2` por la envoltura en `conEmpresa`,
  control de central = 1 y `afterAll` con empresa/zonas = 0.
- `usuario-preferencia`: pestanas con la envoltura + `conEmpresa(EMPRESA_DE_LA_CARRERA)` y `GRANT` al rol
  `servi_app` sobre el esquema desechable; el INSERT a mano lleva `organizacion_id`; control de empresa.
- `rechazo-tienda-cobro.int`: `crearPendiente` y las 4 aprobaciones por `clienteConEmpresa459` en `conEmpresa`.
- `asistente-uso-diario.int`, `reparto-manana-aviso-dedupe`, `whatsapp-envio-idempotencia-programado`:
  clientes de la carrera `conAislamientoPorEmpresa(base, () => empresa sembrada)` (el resolutor hace de
  sesion); control de `organizacion_id` de la fila escrita. `asistente`: el INSERT de «el indice MUERDE»
  lleva la empresa y exige `23505` (antes pasaba por el NOT NULL/SL017, sin medir el indice); R30 suma
  `organizacion_id` (migracion `20261022130100_organizacion_id_en_negocio`) a las dos listas literales.
  `whatsapp`: las dos tx revertidas corren en la empresa del envio sembrado.

R1147: ningun `it` quitado ni aserción debilitada; la unica aserción literal cambiada es R30 de asistente
(contrato del esquema, que cambio con SL-17) y la huella de R71 (`caja: 1` = el movimiento sembrado por el
propio caso). `rejects.toThrow()` paso a `rejects.toThrow(/23505/)` (mas estricta).

## Mapa R -> test

| R | test |
|---|---|
| R1140 | los 16 archivos: corridas (a) y (b) abajo, 0 fallidos, 0 saltados |
| R1141 | `aporte-capital` / `ajuste-caja-anulacion-461` / `wallet-anulacion-concurrencia` (`conPersonas` + `conEmpresa459`), `premio-ranking-idempotencia` «listarCierresAdmin sin deps.service…», `picking-resumen-tiendas` y `analitica-financiera-action` (`reglasPais`), `rechazo-tienda-cobro.int` «UNA gana…», `usuario-preferencia` carreras, `asistente-uso-diario.int`, `reparto-manana-aviso-dedupe` R24, `whatsapp-envio-idempotencia-programado` |
| R1142 | `aporte-capital` (todos, lecturas por `db`); corrida (b) verde; mutacion M2 roja |
| R1143 | `aporte-capital` «R71: un saldo inicial POSTERIOR…» (siembra + control); mutacion M3 roja |
| R1144 | `454/registro-gestion-concurrencia-sql-real`, `454/caracterizacion/corte-concurrencia`, `454/caracterizacion/no-doble-gestion`, `419/confirmar-entrega-lote-sql-real` bloque R8 |
| R1145 | `afterAll` de los 4 anteriores (empresas/zonas = 0); conteos de la base antes = despues abajo |
| R1146 | controles «SLT-185: …» en cada archivo + tabla de mutaciones |
| R1147 | usuarios de los helpers (abajo) + numero de casos igual |
| R1148 | T1: ninguna causa de produccion; diff sin `lib/ app/ db/ scripts/` |
| R1149 | `tests/baseline-rojos.json`: 16 entradas retiradas, 0 quedan citando SLT-185 |

## Corridas

(a) base vacia: 16 archivos, 125 casos, todos verdes, 0 saltados:
```
analitica-financiera-action p=15 f=0 s=0 | ajuste-caja-anulacion-461 p=5 | aporte-capital p=5
asistente-uso-diario.int p=11 | picking-resumen-tiendas p=3 | premio-ranking-idempotencia p=17
rechazo-tienda-cobro.int p=10 | reparto-manana-aviso-dedupe p=8 | usuario-preferencia p=14
wallet-anulacion-concurrencia p=2 | whatsapp-envio-idempotencia-programado p=4
419/confirmar-entrega-lote-sql-real p=11 | 454/registro-gestion-concurrencia-sql-real p=2
454/senales-gestion-lectores-sql-real p=14 | 454/.../corte-concurrencia p=2 | 454/.../no-doble-gestion p=2
```
Conteos antes y despues: `organizacion=0 zona=0 usuario=0 orden=0 notificacion=0 wallet_movimiento=0
whatsapp_envio_ejecucion=0 whatsapp_envio_entrega=0 asistente_uso_diario=0 gestion_orden=0`.

(b) con OTRA empresa confirmada (organizacion, central, maestro, saldo inicial vigente fechado 2020-01-01,
movimiento de caja de 2020-01-01; script `scratchpad/otra-empresa.cjs`): los mismos 125 verdes, conteos
antes = despues (`organizacion=1 zona=1 usuario=1 wallet_movimiento=1`). Retirada al terminar.

## T6 — mutaciones (una a una, restauradas desde copia en memoria; corridas en la base (b))

| # | mutacion | resultado |
|---|---|---|
| M1 | aporte: sin `conEmpresa459` | p=0 f=5 ROJO |
| M2 | aporte: lecturas por el cliente dueno (sin acotar) | p=2 f=3 ROJO |
| M3 | aporte R71: sin el movimiento previo | p=4 f=1 ROJO |
| M4 | 461: sin `conEmpresa459` | p=3 f=2 ROJO |
| M5 | picking: sin `reglasPais` | p=2 f=1 ROJO |
| M6 | premio T2.5: sin `conEmpresa` | p=16 f=1 ROJO |
| M7 | `sembrarComprometido` sin `comoApp` (sin empresa) | registro-gestion: hook rojo, s=2 ROJO |
| M8 | registro-gestion: sin `enEmpresaDe` | hook rojo, s=2 ROJO |
| M9 | corte: sin `enEmpresaDe` | hook rojo, s=2 ROJO |
| M10 | no-doble: sin `enEmpresaDe` | hook rojo, s=2 ROJO |
| M11 | senales: el hermano vuelve a sembrar central | hook rojo, s=14 ROJO |
| M12 | 419 R8: sin `conEmpresa` | p=9, hook rojo s=2 ROJO |
| M13 | analitica: sin `reglasPais` | p=2 f=13 ROJO |
| M14 | preferencia: sin empresa en contexto | p=11 f=3 ROJO |
| M15 | rechazo: la carrera sin empresa | p=9 f=1 ROJO |
| M16 | wallet-anulacion: sin `conEmpresa459` | p=0 f=2 ROJO |
| M17 | asistente: resolutor sin empresa | hook rojo, s=11 ROJO |
| M18 | reparto: resolutor sin empresa | p=7 f=1 ROJO |
| M19 | whatsapp: resolutor sin empresa | p=2 f=2 ROJO |

Comando: `python scratchpad/mutar.py` (aplica, corre `s185-run.sh mut <test>`, restaura). Tras la corrida,
`git diff --stat` identico al de antes (474+/153-).

Incidente: en la primera tanda la copia de respaldo iba a `scratchpad/mut.bak`, un nombre compartido; otra
sesion lo piso y la restauracion de M9 dejo en `corte-concurrencia.test.ts` el contenido de un test de
migracion ajeno. Detectado por la asercion de restauracion; el archivo se recupero con `git checkout` + el
script de edicion, y el respaldo paso a memoria. Si otra sesion uso `mut.bak` a la vez, su restauracion
pudo recibir el contenido de un archivo de esta ficha: conviene que revise su arbol.

## Usuarios de los helpers tocados (R1147)

`tests/integration/db/454/` + `tests/integration/db/419/` (45 archivos verdes). Rojos, todos PREEXISTENTES
(los mismos en T1, antes del cambio) y en el baseline con otra ficha:
`454/orden-evento-migration` (SLT-187), `454/registro-gestion-sin-transicion-sql-real`,
`454/caracterizacion/{cierre-rechazado,deshacer,dinero-aprobacion,multi-dia-271}` (SLT-195).
`_fixtures/escrituras-459.ts` no se toco.

## Baseline

Quitadas (16): las 16 de la tabla de T1. Quedan citando SLT-185: 0.

## Gate

- `pnpm run typecheck` -> exit 0 (`tsc --noEmit`, sin errores).
- `pnpm exec eslint <18 archivos .ts tocados>` -> exit 0, sin avisos.
- `bash ./init.sh` (rapido, por `con-desechable.cjs` contra `servi_slt185_desechable`): `Test Files 47
  passed (47)`, `Tests 675 passed (675)`, `✓ test:rapido paso`, `== init OK ==`, **INIT_EXIT=0**.

## Veredicto

Verde: los 16 archivos del alcance pasan (125/125, 0 saltados) en base vacia y con otra empresa, 19/19 mutaciones rojas, baseline podado y gate local en verde.
