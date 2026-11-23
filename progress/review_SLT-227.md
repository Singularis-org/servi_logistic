# review SLT-227 «Cobro automático: interfaz de proveedores y adaptador de Rebill»

Fase F2.2, vuelta 1 (2026-11-23). Diff revisado: `origin/dev...HEAD` (`55762813`), 34 archivos. Ruta completa
(dinero, integración externa, migración): la ruta es la correcta.

## Verificación ejecutada por el reviewer

- `pnpm run typecheck`: sin errores.
- `pnpm exec eslint` de los 25 `.ts`/`.mjs` añadidos o modificados del diff: sin salida.
- `vitest run` de los 7 archivos de la feature (RP, HR, CS, CI, GU, CB, RC), con la base de la feature:
  `Test Files 7 passed (7) · Tests 197 passed (197)` (69 + 39 + 15 + 45 + 12 + 12 + 5; nada saltado).
- `pnpm run test:guardias`: `360 passed | 2 failed (362)`. Los dos rojos son timeouts de 20 s
  (`descargas-por-registro`, `sin-estados-retirados`) por carga del equipo. Solos: `sin-estados-retirados` pasa y
  `descargas-por-registro` vuelve a agotar el tiempo (20,8 s). Ninguno de los dos lee algo que toque el diff. No es
  hallazgo de esta ficha.
- `node scripts/tamano-pr.mjs`: `29/40 archivos, 1372/1000 lineas de produccion, 2312/3000 de tests`, con el marcador
  `tamano-pr-aceptado` en `progress/features/SLT-227.md`.
- `git merge-tree HEAD origin/dev`: se mezcla sin conflictos. La migración más alta de `origin/dev` sigue siendo
  `20261126120100_mora_congelamiento`.
- PR #277: `cambios`, `estatico`, `e2e (aislamiento)` y `e2e (reparto)` en verde; los shards de `vitest` y
  `e2e (dinero)` seguían corriendo al revisar.

## Checklist

### CHECKPOINTS.md
- [x] Ruta completa: tiene `requirements.md` (EARS R1–R27), `design.md` con alternativas descartadas (§13) y `tasks.md`.
- [x] Tasks en `[x]`, salvo T4.5 (contraste en el sandbox de Rebill), que está pendiente del humano por decisión
  cerrada. No es hallazgo.
- [x] `design.md` abre con `## Lo que ya existe`, con la búsqueda hecha y la tabla. El diff no re-crea nada de esa
  lista: reutiliza la bóveda, el CHECK, `esPlataforma`, `nuevoId` y el recifrado, y amplía el puerto de SLT-226.
- [x] Tamaño: pasa del tope, aceptado por el humano (ver menor m1).
- [x] Mapa `R<n> → test` en `progress/impl_SLT-227.md` (por tanda y consolidado).
- [x] Typecheck y lint en verde.
- [ ] `gate-completo` en verde: seguía corriendo al revisar. Lo confirma el leader antes del aviso de merge.
- [x] Sin dependencias nuevas: `package.json` solo suma el script `cobro:credencial`.
- [x] Ningún secreto en el código. Los de los tests son centinelas o se generan.
- [x] No hay webhook nuevo (es de SLT-228). `verificarFirma` está listo para él.
- [x] Nada de entorno hardcodeado salvo `URL_BASE_REBILL`, que es una sola URL para los dos entornos a propósito
  (P5, R4, design §2). El entorno sale de `VERCEL_ENV`.

### docs/checkpoints-proyecto.md
- [x] Typecheck y lint.
- [ ] Flujos críticos y E2E: ver **B1**.
- [x] Tabla nueva con RLS. Es de **plataforma**, sin `organizacion_id`, y está en `MODELOS_DE_PLATAFORMA`: RLS
  encendida sin políticas y `REVOKE ALL … FROM servi_app`, igual que `cobro_webhook_evento`. CB «R6» prueba `42501`
  en SELECT, INSERT, UPDATE y DELETE.
- [x] Las queries nuevas no son de negocio: todas van por `comoPlataforma`, con la entrada en
  `EXCEPCIONES_DE_PLATAFORMA`.
- [x] La migración trae `down.sql`, que aborta con filas, y no edita una migración aplicada. CB prueba la ida y vuelta
  sobre el catálogo y el aborto con filas.
- [x] Nada de Ordenex en el diff.
- [x] No hay `console` de secretos. El comando imprime nombres de campos, y del error solo el nombre y el código. El
  `console` del doble solo saca método, URL y `e.name`.
- [x] Capas: la regla vive en `CobroCredencialService` y el SQL en `CobroCredencialRepository`. El registro arma el
  cableado en `lib/clients/cobro` (ver menor m3).
- [x] Zod en el borde: la entrada de `guardar` y las tres respuestas de Rebill.
- [x] Sin literales de país ni moneda en el código nuevo. «CR» y los ₡ solo aparecen en comentarios de ejemplo y en
  los tests.
- [x] Autorización en el servidor: `esPlataforma` va antes de leer nada (R10).

### Reglas de `docs/perfil-agentes.md > reviewer`
- [x] Tabla de negocio sin `organizacion_id`: no aplica, porque la tabla es de plataforma y está clasificada.
- [x] RLS y `down.sql`: sí.
- [x] Literales de país o moneda: ninguno en código.
- [x] Ordenex: nada.
- [x] Dependencias: ninguna nueva.
- [x] Comentarios: explican el porqué (R25, R22, la ficha del monto, `Object.hasOwn`, el `WHERE id = EXCLUDED.id`).
- [ ] **E2E afectados corridos en local, con constancia: falta (B1).**

### Foco pedido por el leader
- [x] **Importe sin float.** Al escribir, `cuerpoJsonConMontos` mete el texto como literal JSON y nunca llama a
  `Number`. RP comprueba el cuerpo crudo `"amount":20000.00` y los bordes `0.10` y `9999999999.99`; la mutación M9
  cae. Al leer, la única conversión es la del `JSON.parse`. `montoDeRebill` la acota por debajo de 1e10 y exige que
  `toFixed(2)` vuelva al mismo `double`, así que `0.005` o 3 decimales dan `respuesta_invalida`. Es correcto: con ese
  tope, el espaciado del `double` queda muy por debajo de 0,005.
- [x] **Secretos.** Se cifran con contexto `(plataforma, id de fila, campo)` (R7, con la mutación 5). El único lector
  descifrado es `crearLectorCredencialesCobro`, y la guardia GU vigila quién lo nombra y que nadie lleve
  `"use server"`. `ProveedorCobroError` no lleva `cause` ni cuerpo. El transporte cancela el cuerpo de un no-2xx sin
  leerlo y nunca lee el mensaje de `fetch`. R25 prueba con centinelas `message`, `stack`, `String`, `JSON.stringify`,
  `inspect` con `showHidden` y `console`, y las mutaciones M3a, M3b y M3c caen. `estado` solo lee
  `jsonb_object_keys`.
- [x] **Firma.** HMAC-SHA256 en hex con el `whsec_…` completo como clave, y `timingSafeEqual` sobre 32 bytes: la
  regex `^[0-9a-f]{64}$` garantiza el largo antes de comparar. Una cabecera ausente o mal formada da `false`, y no
  sale a la red. Cuerpo crudo: ver menor m2.
- [x] **Reintentos solo en `consultarPago`.** `pedirIdempotente` lanza ante un método que no sea `GET`. `crearEnlace`
  y `devolver` usan `pedirUnaVez`, e `incierto` solo se marca en las operaciones con efecto. Las mutaciones M1 y 2
  caen.
- [x] **Mapeo de estados.** R17 sigue la tabla, con P7 y P8, leída con `Object.hasOwn`. Un estado desconocido da
  `respuesta_invalida`. El de devolución usa `denegada` (decisión del 2026-11-23).
- [x] **RLS y plataforma de la tabla nueva.** Ver arriba.
- [x] **Migración y su down.** Ver arriba. `prisma migrate diff` vacío, según la bitácora.
- [x] **Trazabilidad.** Ver la tabla.

## Trazabilidad R → test (comprobada en los archivos; ninguno está vacío)

| R | Test | Estado |
|---|---|---|
| R1 | RP «R1: el adaptador ofrece las cuatro operaciones…» | ok |
| R2 | HR «R2: el registro da el adaptador de rebill para CR; wompi y global66…» | ok |
| R3 | HR «R3: el entorno es produccion solo con VERCEL_ENV=production» | ok |
| R4 | RP «R4: … sin_configuracion y 0 peticiones», con su control | ok |
| R5 | CB «R5: el dueño no puede escribir un secreto en claro…», «R5: un trío, una fila…», «R5: guardar cifra…» | ok |
| R6 | CB «R6: como servi_app … 42501» | ok |
| R7 | CB «R7: un secreto copiado a otro trío o a otro campo…»; CS | ok |
| R8 | CB y CS (forma `sk_`/`whsec_`, campos de más, `pais_no_existe`, reemplazo sin fila nueva) | ok |
| R9 | CB y CS | ok |
| R10 | CS «R10: maestro, admin, mensajero y tienda…», sin llamadas | ok |
| R11 | GU (el lector solo en los permitidos; ninguno es `"use server"`) | ok |
| R12 | CS (stdin, sin imprimir valores, argumento desconocido ⇒ 1) | ok |
| R13 | RC «R13: el recifrado lleva a v2 las credenciales de cobro…» | ok |
| R14 | RP «R14: … las cuatro operaciones fallan y el doble recibe 0 peticiones» | ok |
| R15 | RP «R15: … x-api-key …» | ok |
| R16 | RP «R16: crear un enlace» (6 casos) | ok |
| R17 | RP «R17: consultar un pago» (7 estados, bordes, `404` ⇒ `null`) | ok |
| R18 | RP «R18: verificar la firma de un aviso» | ok |
| R19 | RP «R19: devolver un pago» | ok |
| R20 | HR «R20: … tiempo_agotado» | ok |
| R21 | HR «R21: consultarPago con 503, 503 y 200…» | ok |
| R22 | HR y RP «R22: crearEnlace y devolver …» | ok |
| R23 | HR «R23: un 401, un 404 o un 422 no se reintentan» | ok |
| R24 | HR «R24: la tabla de traducción…» y RP (los códigos HTTP por operación) | ok |
| R25 | RP «SLT-227 · R25: el secreto no sale» | ok |
| R26 | GU «R26: …» y el doble en el puerto 0 | ok |
| R27 | CI `cobro-intento-service.test.ts`, 45 passed. El diff solo cambia tipos, ninguna afirmación | ok |

## Desviaciones de la bitácora (juicio)

- **El único como `CREATE UNIQUE INDEX`** en vez de `CONSTRAINT … UNIQUE` dentro del `CREATE TABLE`. Se acepta: es
  equivalente para `ON CONFLICT (proveedor, pais_id, entorno)`, el `@@unique(map:)` de Prisma da un diff vacío y es
  la forma que sigue el detector de `unicos-por-empresa`. CB «R5: un trío, una fila» prueba el `23505`.
- **Sin `_unicos-sin-empresa.ts` ni `verificar-rls-despliegue.ts`.** Se acepta. Design §15 los dejaba condicionados a
  T0.3. El script solo cuenta políticas `*_por_empresa` y triggers de misma empresa de `MODELOS_DE_NEGOCIO`, y la
  única FK de la tabla es a `pais`, de plataforma. Las guardias corren en verde salvo los dos timeouts ajenos.
- **`organizacion.id` es `TEXT`, no `uuid`.** Se acepta. Corrige el design §8.1 con evidencia. El contexto de la bóveda
  es el trío `(organizacionId, integracionId, campo)`, así que una empresa llamada «plataforma» tendría además que
  coincidir con el `uuid` de una fila de credenciales. No hay colisión práctica.

## Hallazgos

- **B1 — BLOQUEANTE (proceso; `docs/perfil-agentes.md > reviewer` y `> Todos los agentes`, «E2E en local antes del
  PR»).** El diff toca `db/` (migración nueva y `schema.prisma`) y dinero (el cobro automático). Ni
  `progress/impl_SLT-227.md`, ni `progress/features/SLT-227.md`, ni el cuerpo del PR dejan constancia de los E2E
  afectados corridos en local. El PR dice «esta ficha no toca pantallas ni flujos de dinero de la app», pero la regla
  pide la constancia igual, y el `e2e (dinero)` del CI no la sustituye.
  - **Qué falta:** correr en una base desechable nueva, con `NEXT_PUBLIC_APP_URL` como en `gate.yml`:
    - el `grep -rl` de `e2e/` por `cobro_proveedor_credencial`, `CobroProveedorCredencial` y `rebill` (hoy solo
      encuentra el doble, que no es un spec);
    - `pnpm exec playwright test --project=dinero`.
  - **Dónde anotarlo:** el resultado, en `progress/impl_SLT-227.md`.
  - **Quién:** no hace falta tocar código; lo puede cerrar el leader o el implementer.
- **m1 — menor.** El tamaño real (1 372 líneas de producción) pasa de la estimación que cita el marcador aceptado
  («~1 150–1 300»). La decisión del humano no se reabre, pero conviene decirle la cifra real en el aviso de merge.
- **m2 — menor, nota para SLT-228 «Cobro automático: webhook por proveedor y el de Rebill».** `AvisoFirmado.cuerpoCrudo`
  es `string` y el HMAC se calcula sobre su recodificación UTF-8. El webhook tiene que pasar el texto exacto
  (`await request.text()`, sin re-serializar). Un cuerpo que no sea UTF-8 válido falla cerrado (`false`), así que no
  hay riesgo de seguridad.
- **m3 — menor.** `construirRegistroProveedoresCobro` (`lib/clients/cobro/registro-proveedores.ts`) hace de raíz de
  composición: importa `getPrismaClient`, el repositorio y el lector del servicio. Lo pide el design §7 y la guardia
  de R11 lo permite. Cuando SLT-228 o SLT-230 lo usen, conviene que se llame solo desde un job o un servicio, no desde
  una Server Action.
- **m4 — menor.** `RegistroProveedoresCobro.obtener` responde `solicitud_invalida` con un `paisId` que no tiene forma
  `^[A-Z]{2}$`. R2 no lo pide (R24 solo atribuye `solicitud_invalida` a R16 y R19). Es defensivo y razonable; conviene
  anotarlo en el design para que SLT-228 lo sepa.

## Veredicto

**RECHAZADO**, por B1 (la constancia de los E2E locales), que es de proceso. El código cumple R1–R27 con tests reales,
y el foco de dinero, secretos, firma, reintentos, mapeo, RLS y migración está bien resuelto. Al cerrar B1, una vuelta 2
acotada a la bitácora basta para dar OK.

## Vuelta 2 (acotada a bd4a38d1..b430d00b)

**B1, constancia de los E2E en local: cerrado.** `progress/impl_SLT-227.md > Review vuelta 1` deja todo lo que pide
la regla:
- el `grep -rl` en `e2e/`: la tabla no aparece y `rebill` solo sale en el doble;
- una base desechable nueva, `servi_logistic_slt227_e2e`, con `migrate deploy` y `db:seed`;
- el `next build` con `NEXT_PUBLIC_APP_URL` y `APP_BASE_URL` como en `gate.yml`;
- `pnpm exec playwright test --project=dinero`: `143 passed`, con 0 failed, 0 flaky y 0 skipped.

**El arreglo de `tests/integration/db/orden-traspaso-migration.test.ts` no debilita el test.**
- La afirmación compara con `toEqual` la lista exacta de migraciones posteriores a la de la tabla.
- Cada ficha con migración suma la suya al final, con su comentario: es la convención del archivo (SLT-226, SLT-121…).
- El cambio solo añade `20261127120000_cobro_proveedor_credencial`. No quita ni relaja nada, y la comparación sigue
  siendo exacta.
- El comentario dice la verdad: ni `migration.sql` ni `down.sql` nombran `orden_traspaso` (`grep -c` da 0 en los dos).
- Corrido por el reviewer contra la base de la feature: `Test Files 1 passed (1) · Tests 15 passed (15)`.

**Regresiones:** ninguna. El commit toca solo la bitácora y esa línea del test.

**Pendiente, sin ser hallazgo:** al revisar, los checks del CI de #277 (vitest y los tres grupos de e2e) estaban en
`pending` sobre `b430d00b`. El leader confirma `gate-completo` en verde antes del aviso de merge. Los menores m1–m4 de
la vuelta 1 siguen como notas.

### Veredicto vuelta 2: **OK**
