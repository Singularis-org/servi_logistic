# Revisión SLT-55 «valor propio del mensajero»

Rama `feature/SLT-55-valor-propio-mensajero`, HEAD revisado `7a22019d`, base `origin/dev` `689cc9df`. El merge solo trae
`arnes.config.json`. Grafo: sin proyecto para este worktree; exploré con Grep y Read.

## Veredicto: OK

Sin bloqueantes. Cinco hallazgos menores. **T6.3 sigue abierta:** `./init.sh` no lo corrí, es del leader antes del PR.

## Ejecutado por mí

Base `servi_gate_slt55`, comprobada con booleanos: nombre y host local.

| Qué | Resultado |
|---|---|
| 18 archivos de vitest: los de la ficha, `tarifa-activacion`, `tarifas-flexibles-migration` y `-resolver` | 18 de 18 archivos, 518 de 518 tests, 0 saltos |
| `pnpm run typecheck` | exit 0 |
| `pnpm run lint` | exit 0, 0 errores, 234 avisos |
| `pnpm run test:guardias` | 330 de 331 archivos, 4 rojos. Todos en `dependencias-declaradas-presentes`, que está en `tests/baseline-rojos.json` desde 2026-10-21: no es hallazgo |
| `playwright test e2e/tarifas-valor-propio-mensajero.spec.ts --project=dinero`, 1 corrida | 11 passed, `INIT_EXIT=0` |
| `playwright test e2e/dos-empresas-humo.spec.ts --project=aislamiento --no-deps` | 8 passed |
| Puertos 3055 y 54355 al terminar; `git status` | Libres; limpio |

El E2E corrió sobre el `.next` que dejó el implementer: lleva el diálogo apilado, y el merge posterior no toca la app.

## Checklist

### Proceso
- [x] Trazabilidad: los 40 R tienen test que existe. Muestreados a fondo: R6, R13, R17, R18, R19, R21, R24, R25, R29, R31, R32, R37. Todos afirman filas o importes con literales.
- [ ] Tasks: T6.3 sin marcar, asignada al leader en la bitácora. Es la única abierta.
- [x] `design.md` abre con `## Lo que ya existe`, y el diff no re-crea nada de su lista. Tiene 5 alternativas descartadas.
- [x] Mapa `R<n> -> test` en `progress/impl_SLT-55.md`.
- [x] Sin dependencias: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` no cambian. Sin migraciones: `db/` no cambia.
- [x] E2E del flujo crítico, con su salida en la bitácora y repetido aquí.
- [x] Sin secretos, sin URLs de entorno, sin webhooks nuevos.
- [x] Reglas del perfil: sin tabla nueva, consultas nuevas filtradas por la extensión y la RLS, sin literal de país o moneda en código nuevo, sin recursos de Ordenex.
- [ ] `gate-completo`, `Cierre` de la ficha y desmontar el worktree: posteriores al PR, del leader.
- [ ] Assignee en el tracker y `wt.sh new`: no los verifiqué en Jira. La ficha local dice Carlos Restrepo.

### 1. Dinero: correcto
- Los cinco caminos pasan por `resolverPagosCon` con el `mensajeroId` de la gestión: `CierreDiaService.ts:284` y `:705`, `CorteDiarioService.ts:207`, `CierreDiaRepository.ts:2065`, `CierresAdminRepository.ts:1780`. No hay otro llamador con pago vivo.
- El rango 1 es el nivel `mensajero` (`precedencia.ts:66`, `:110-118`). Se congela con nivel, modo, valor, base e importe (`cierre-totales.ts:95-101`). La aprobación no recalcula: E2E `:283`, 3.110 aprobados tras cambiar el propio a 3.000.
- **20 % de 3.000 + 13 % = 600,00:** `caminos:792`, con la zona del mensajero sin valores. También 500,00, 400,00 y 666,67. La base no lleva IVA (`fleteSinIvaDeGestion`, `ingreso-empresa.ts:1034`).
- **Tienda sin cobro:** `caminos:845`, 0,00 con fila congelada de base 0,00.
- **El 0 escrito:** la fila con valor 0 es candidata como cualquiera (`precedencia.ts:157-161`), y `caminos:692` paga 0,00 sobre una zona de 505 con nivel `mensajero`.
- **`planDeGuardado`:** `""` con guardado = quitar; `""` sin guardado = nada; `"0"` = fijar 0 (`tarifas-borrador.ts:122-138`). Un 0 guardado se pinta como 0 y no como vacío (`montoParaCampo`). Tests `componente:372`, `:381`.

### 2. Activación: correcto
- Sin activar, `pagosViejos` no lee `tarifa_valor` (`resolver-tarifas.ts:562`). Con y sin propio, los mismos literales, y fijar y quitar van por el servicio real (`caminos:1027`). E2E `:209`: 1.700 con 2.900 digitados.
- R23: `pantalla-db` R23 y `:479`, E2E `:166` y `:233`.

### 3. Producción vieja: ningún camino decide por fila
- En la rama, la única lectura del interruptor es `usaModeloNuevo`, sobre `tarifa_activacion` (`resolver-tarifas.ts:82`). Sus usos: `:415`, `:435`, `:562` y `CoberturaRepository.ts:67`. Busqué `tarifaValor.*` y `tarifa_valor` en `lib`, `app`, `components` y `scripts`: nada más decide el modelo.
- `origin/prod` (`fae6a5d3`) decide por existencia de fila, no tiene la migración de activación, y `git grep` no halla `fijarValor` en sus `lib/actions` ni `app`.
- Al promover, el relleno de `20261104140100_tarifa_activacion` activa solo a quien ya tenga filas, y un valor propio no puede existir antes: lo escribe el código que llega con esa misma promoción. **Un propio digitado tras promover no cambia ningún pago hasta activar.**
- Lo que no está cerrado es volver atrás: hallazgo 3.

### 4. Aislamiento y permisos: correcto, también con cookie real
- `listarMensajeros` devuelve `id`, `nombre` y `elegible`, y nada más (`TarifasPantallaRepository.ts:112-124`). Lo afirma un `toEqual` exacto en `pantalla-db:263`.
- E2E con sesión de `/login`: `:443` B no ve ni le ofrecen nada de A; `:479` la sesión de B manda el id de A y recibe `validation_error` en `mensajeroId`, con control positivo; `:501` el `admin` lee sin controles y recibe `forbidden`; `:383` el mensajero no entra.
- Dado de baja y rol ajeno: `escritura` R7 y R8.

### 5. Precedencia: el hueco está cerrado
- `mensajeroId` en `nivelSchema` no abre otro nivel: `nivelDeValor` rechaza zona, grupo, vehículo, tienda, satélite y tienda (`niveles.ts:35`, `:51-56`). Los CHECK dicen lo mismo (`20261103120100…/migration.sql:128-139`), y `migración:494` los prueba.
- `escritura:337` afirma 0 filas y 0 historial en los 7 casos.

### 6. Historial y dependientes: correcto
- La etiqueta lleva solo nombre y primer apellido (`TarifaValorRepository.ts:59`, `:67`). El valor anterior y el nuevo son modo e importe.
- `FijarValorInput` solo lo consumen la action y el service. `FijarValorDatos`, solo el repositorio. `TarifaValorDTO` ya traía `mensajeroId`.
- La rejilla de zona no envía la clave y su payload no cambia (`componente:136`). SLT-54 y `TarifasValores`: sin cambios. Raíz de composición intacta, atada en `servicios-composicion.test.ts`.

### 7. Pantalla: correcta, con dos textos inexactos
- Sección y diálogo a 390 con mutación propia en la bitácora, y `:583` verde aquí. `admin` sin controles, `E2E:501`.
- «Inactivo», «Cuenta retirada», guardado parcial y reintento: solo en test de componente, con las actions dobladas.
- Textos contra el cálculo: la base del %, el 0 escrito, sin activar, «desde el siguiente cierre» y «no cubre la zona» son ciertos. Hallazgos 1 y 2.

### 8. Trazabilidad y tests
- Sin `if (!fila) return` en cuerpos de test: los dos `return` de `caminos:60` y `pantalla-db:43` son del montaje sin base, con `describe.skip` visible.
- Sin `waitForTimeout`, `.skip`, `.only` ni `retries` nuevos en el spec. El `retries: CI ? 1 : 0` ya existía, y `failOnFlakyTests` lo deja en rojo.
- `tests/baseline-rojos.json` no cambia.
- `cobertura-tablas.guardia` y `censo-tablas`: contadores, su comentario y la entrada `fuera` de la tabla nueva. Ningún test existente perdió aserciones; las líneas borradas son literales, imports o contadores.

### 9. Repo: limpio
- Abrí las 13 capturas: solo datos `E2E mensajero <hash>`, `Maestro E2E <hash>`, `Central E2E <hash>`.
- `progress/impl_SLT-55.md`, `progress/features/SLT-55.md` y `specs/` sin números de 7 o más dígitos.
- No tengo la lista de nombres reales de producción: busqué patrones de país y de cliente, y los nombres de los tests parecen inventados, pero no pude cruzarlos con producción.

## Hallazgos

1. **menor. `TarifaMensajeroDialogo.tsx:119-122`: tras un fallo total se comporta como si hubiera guardado algo.** Añadir M, con una sola fila, «Por entregado» en % con 150: el servicio responde `validation_error`, nada se guarda, y aun así `setFijado(true)` quita el selector y el toast dice «Lo demás se guardó». El comentario de `:73` dice «Tras guardar algo». Cancelar y reabrir lo restituye. Sin efecto en dinero. El toast es el mismo de `TarifasValores.tsx:205` y `:264`. Por lectura, sin ejecutar. Basta condicionar ambos a que algo haya salido bien.
2. **menor. `TarifasMensajeros.tsx:131-134`: quitar con fallo parcial dice «No se pudo guardar. Lo digitado sigue aquí».** Con 2 valores y 1 fallo, uno sí se quitó y en esa confirmación no hay nada digitado. La recarga corrige la cuenta a «Se quita 1 valor», así que no engaña sobre el estado final. Por lectura, sin ejecutar.
3. **menor, aviso de despliegue. Volver atrás tras promover.** Si tras promover se revierte al despliegue actual de `prod`, su `usaModeloNuevo` vuelve a decidir por existencia de fila: una empresa sin activar con un solo propio de 2.900 pasa entera al modelo nuevo, y otro mensajero de su zona sin valores cobra 0 en lugar de 1.700. Viene de SLT-54 y no hay arreglo en esta rama: quien promueva debe saber que ese despliegue viejo ya no es una vuelta atrás segura una vez digitados valores. Por lectura de `origin/prod`.
4. **menor. Cobertura del % en reprogramado, novedad, incidente y corte.** Con flete mayor que 0 en esos tres resultados, ningún test pasa un propio en %; R18 solo prueba la base 0. Tampoco hay % en el corte. Por lectura va bien: se congelan todos los `CONCEPTOS_TIENDA` (`resolver-tarifas.ts:457`), `conceptoPorResultado` da el concepto y `crearCierre` es el mismo de la solicitud. No es un R sin test: R17 y R19 tienen el suyo, pero esas ramas quedan sin medir.
5. **menor. Deudas sin anotar en `progress/deudas.md`.** La bitácora deja `TarifasValores` a 390 (campos enteros fuera de la vista), `TarifasVehiculo` sin medir y `TarifasTiendas` al reintentar quitar. `progress/deudas.md` no menciona SLT-55. Va en el `Cierre`.

## No verificado

- `./init.sh` (T6.3) y `gate-completo`. No corrí `vitest related`: la bitácora mide 1035 archivos, casi la suite.
- Las 76 mutaciones de la bitácora: no reproduje ninguna, porque no modifico el código. Leí los tests que dicen matarlas.
- Producción: no se tocó. Si `tarifa_valor` tiene filas allí, no lo sé.
- La conclusión del punto 3 sale de leer `origin/prod`; no ejecuté ese código.
- «Inactivo», «Cuenta retirada» y el reintento en un navegador; contraste medido en oscuro; Safari o un teléfono real.
- Concurrencia real entre un cierre y una fijación.
- Assignee en Jira.
