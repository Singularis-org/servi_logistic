# Review SLT-181 «Siembra propia en tests de búsqueda, push y liberación»

Revisado: rama `feature/SLT-181-siembra-tests-busqueda-push`, HEAD `4cb3531e`, contra `origin/dev`.
Ruta ligera (solo `requirements.md` con `## Tasks`). El diff no toca código de producción: dinero
y webhooks aparecen solo en tests, sin cambiar su comportamiento, así que la ruta ligera vale
(el spec lo justifica en su cabecera).

## Checklist

### CHECKPOINTS.md
- [x] Ruta: ligera. Diff de producción vacío (`git diff --name-only origin/dev...HEAD -- lib app components hooks db scripts .github package.json` → nada).
- [x] Especificación ligera: `requirements.md` con alcance, EARS R1060–R1072, `## Tasks` T1–T8 todas `[x]`, `## Archivos esperados`, `## Lo que ya existe`. No se re-crea nada de esa lista: se reutilizan `crearFksDeOrden`/`crearUsuarioDePrueba` y `conCandado459`/`sembrarPersonas459`/`limpiar459`.
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 15/40 archivos, 0/1000 producción, 855/3000 tests. Sin línea de aceptación (no hace falta).
- [ ] Equipo: assignee y candado. `progress/features/SLT-181.md` sigue con «pending / assignee —» (ver menor 3). Lo valida el leader; no lo puedo comprobar desde aquí.
- [x] Trazabilidad: el mapa R→evidencia está en `progress/impl_SLT-181.md`. Cada R tiene su test o evidencia (ver abajo).
- [x] Typecheck `pnpm run typecheck`: exit 0. Lint (`eslint` sobre los 14 archivos tocados): exit 0.
- [ ] `gate-completo` en CI: pendiente del PR (R1071).
- [x] Flujos críticos / E2E: no aplica. Solo cambian tests de integración; no cambia ningún flujo.
- [x] Dependencias: ninguna nueva. Secretos y configuración: nada hardcodeado nuevo.
- [x] `./init.sh` rápido: lo corrí yo en HEAD contra `servi_slt181_desechable` → `INIT_EXIT=0` (120 rojos heredados en el baseline).

### docs/checkpoints-proyecto.md
- [x] Calidad de código: typecheck, lint e init verdes.
- [x] Datos y seguridad: ni tablas, ni queries de producción, ni migraciones nuevas. Nada de Ordenex. Ningún `console.log` de secretos.
- [x] Arquitectura y permisos: no aplica (no hay código de producción).

### docs/perfil-agentes.md > reviewer
- [x] Sin tabla o query de negocio nueva, sin migración, sin dependencias. `sinpeNumero`, `"Titular de Prueba"` y Cartago/Cartago son campos del esquema y geografía de catálogo de las semillas de test, igual que en `_fixtures/orden-minima.ts`. No son literales de país en código de producción.
- [x] Los comentarios nuevos (`// SLT-181 — …`) explican por qué se siembra en la tx.
- [x] PR que toca dinero sin E2E: no aplica. No cambia el código de dinero, solo cómo siembran sus tests.

## Foco pedido por el leader

1. **Solo tests y baseline.** Confirmado. No cambian `_fixtures/escrituras-459.ts`, `_fixtures/orden-minima.ts`, `_postgres-real.ts` ni `454/`.
2. **No se quita ni se debilita nada (R1065).** Conté por archivo contra `origin/dev`: los `it`/`test` quedan iguales en los 14 y los `expect` solo suben (+1 a +4). Las líneas `-` con `expect` son los `expect(fks).not.toBeNull()` que pasan dentro de la tx; siguen todos. El `it` «⭑ UNA gana…» de rechazo sigue, ahora envuelto en `conSiembraCommiteada`. Ningún literal esperado cambió.
3. **`busqueda-usa-indice`: el plan no se forzó.** Sigue habiendo 14 menciones de `enable_`/`forzarIndice` en `origin/dev` y en HEAD. Ninguna línea `+` añade `SET LOCAL`, `enable_*`, `VACUUM` ni `gin_*`.
4. **Filas confirmadas.** `rechazo-tienda-cobro.int` (`conSiembraCommiteada`) y `wallet-anulacion-concurrencia` crean su zona con clave única en la empresa 459 y la borran en el `finally`, antes de `limpiar459`. **Lo comprobé:** conteo en `servi_slt181b_desechable` antes y después de correr los dos archivos: igual (`organizacion 1, zona 2, usuario 5, orden 40, gestion_orden 40, cierre_dia 1, rechazo_tienda_cobro 0, wallet_movimiento 0, zonas «Zona 337%/458C%» 0`). Quedan 0 filas propias.
5. **Controles positivos.** Cuentan en la base, por id o clave sembrada, y comparan con `1`/`2` literales o con el tamaño de lo que el test insertó (`SEMILLAS.length`, `CORPUS.length`, `FILAS`). Eso es un conteo de lo sembrado, no una comparación contra la función que genera el valor. La mutación de paridad (11 frente a 12) prueba que el control muerde.
6. **Motivos del baseline (R1068).** Las 6 entradas que quedan tienen el `desde` intacto (`2026-10-22`). Las líneas citadas coinciden con HEAD:
   - `busqueda-usa-indice:211` → `expect(plan).toContain("Bitmap Index Scan on orden_busqueda_texto_trgm_idx")`. Lo retira SLT-187.
   - `costo-y-zona-api-415:495/:605/:613` → `costoReal`, `CONSULTAS_DEL_DETALLE` y `CONSULTAS_DEL_LISTADO`. Lo retira SLT-186.
   - `push-canal-restricciones:353` → `toBe(0)` de las policies. Lo retira SLT-187.
   - `rechazo-tienda-cobro.int:394` → `crearPendiente`. Lo retira SLT-185.
   - `usuario-preferencia:299/:314/:399/:425` → las carreras. Lo retira SLT-185.
   - `wallet-anulacion-concurrencia:69/:145` → `walletMovimiento.create` y `crearPendiente`. Lo retira SLT-185.

   Ninguna entrada dice ya «La retira SLT-181». No cambia ninguna entrada fuera del alcance. Se borran 8 claves (128 → 120).

## Verificación propia (base `servi_slt181b_desechable`, con una empresa ajena confirmada)

- `vitest run` de 3 retirados: `liberacion-al-aprobar-cierre-real`, `push-destinatarios-equivalencia` y `webhook-evidencias-url-resuelve-sql-real` → los tres verdes.
- En la misma corrida, `rechazo-tienda-cobro.int` y `wallet-anulacion-concurrencia` caen con el mensaje de su motivo: «referencia a otra empresa: rechazo_tienda_cobro.gestion_id -> gestion_orden» y «… wallet_movimiento.registrado_por -> usuario».
- **Mutación propia:** en `liberacion-reprogramada-cierre-real` cambié el mensajero sembrado por un uuid que nadie sembró. Resultado: 4/4 rojos con «SLT-181: la tienda y el mensajero sembrados no estan en la base: expected 1 to be 2». Restaurado con `git checkout --`; `git status` limpio.
- `./init.sh` (base A `servi_slt181_desechable`): `INIT_EXIT=0`.

## Trazabilidad R → test

| R | test / evidencia | estado |
|---|---|---|
| R1060 | los 8 retirados, verdes en la base vacía (bitácora) | ok |
| R1061 | los 8 en la base B: lo comprobé en 3 | ok |
| R1062 | ya no se llama a `fksDeOrden(`, ni hay `usuario/zona.findFirst/findMany` globales, en los 14 (grep). El `zona.findMany` de 415 filtra por sus claves | ok |
| R1063 | `finally` en rechazo y wallet + conteo 0 (comprobado) | ok |
| R1064 | controles positivos con mensaje que nombra la fila; ya no queda `if (!fks) return` | ok |
| R1065 | conteo de `it`/`expect` frente a `origin/dev` | ok |
| R1066 | tabla T6 (13 mutaciones; wallet sin mutación útil porque cae antes, documentado) + mi mutación | ok |
| R1067/R1068 | diff del baseline revisado | ok |
| R1069 | no se tocó ningún helper compartido | ok (no aplica) |
| R1070/R1072 | diff de producción vacío; tamaño 15/0/855 | ok |
| R1071 | `gate-completo` del PR | pendiente de CI |

## Hallazgos

- **menor 1 (corregido por el reviewer, solo progress):** `progress/impl_SLT-181.md` se quedó atrás respecto del commit `4cb3531e`. T7 decía «Las 2 de la parada, intactas»; el mapa R1067/R1068 decía «4 motivos … 2 en PARADA»; y «Salidas» remitía a una sección «Gate» que no existe. Lo corregí en esta vuelta (6 motivos; init corrido por el reviewer).
- **menor 2:** en los archivos de push y avisos (`push-destinatarios-equivalencia`, `aviso-agregado-repository`, `push-canal-restricciones`, `usuario-preferencia`) siguen los `expect(fks, "la tabla \`orden\` esta vacia: el caso no se puede medir").not.toBeNull()`. Ahora son tautológicos, porque `crearFksDeOrden` nunca devuelve null, y su mensaje ya no dice la verdad. Se dejaron a propósito para no bajar aserciones (R1065). El control real es el de `sembrarFks`. No bloquea; se puede limpiar cuando se toquen.
- **menor 3 (del leader):** `progress/features/SLT-181.md` sigue en «F1.2 … pending», con assignee «—» y sin Decisiones ni Tandas. La decisión del leader sobre la parada solo consta en `impl_SLT-181.md`. Hay que actualizarlo antes de cerrar (`CHECKPOINTS.md > Verificación final`).
- **menor 4:** el entorno es Postgres 18.2 en local, y CI usa 17. Para `busqueda-usa-indice`, que depende del coste, la medición local puede no reproducirse igual en CI. Ese archivo sigue en el baseline, así que no hay riesgo de rojo nuevo.

## Veredicto

**OK.** No hay bloqueantes. Queda pendiente R1071 (`gate-completo` del PR), que verifica el CI.
