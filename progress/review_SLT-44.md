# review SLT-44 «Geografía jerárquica: dominio y repositorios»

Reviewer, 2026-10-31. Rama `feature/SLT-44-geo-jerarquica-dominio`, HEAD revisado `b0953b4`.
Alcance: los commits propios `ab63b8b..b0953b4` (más el spec `db89fa5..f186592`).

**Nota sobre la base de comparación.** `origin/feature/SLT-43-geo-jerarquica-modelo` (`6a6dd4c`) es
ancestro de HEAD, pero entre los dos está el merge de `dev` con SLT-58 (`3c4c22c`, vía `0dc0847`).
Por eso `git diff origin/feature/SLT-43…HEAD` trae ruido de SLT-58: dos migraciones `2026102912*`,
`db/schema.prisma`, planes y mi-plan. Revisé `ab63b8b^..HEAD`. Ningún commit de ese rango toca `db/`
(`git log ab63b8b^..HEAD -- db/` vacío).

## Checklist

### Especificación
- [x] `requirements.md` con R1–R26 en EARS.
- [x] `design.md` con alternativas descartadas (§11) y su porqué.
- [x] `design.md` abre con `## Lo que ya existe`. El diff reutiliza `zona-colapso`,
      `geografia-activa`, `zona-especial`, `resolveGeo` y `clasificarCobertura` sin copiarlos.
- [ ] `tasks.md` todo `[x]`: faltan **T7.1 y T7.2**. Es condición de merge, no hallazgo (m1).

### Equipo
- [x] Assignee (Camilo) y rama de `wt.sh`, según `progress/features/SLT-44.md`.

### Trazabilidad
- [x] El mapa `R<n> → test` está en `progress/impl_SLT-44.md`, con 26 filas.
- [x] Cada R tiene un test que mide de verdad (tabla abajo). R25 se comprueba sobre el diff y R26
      queda en el `gate-completo`.

### Calidad de código (lo corrí yo, con `NODE_OPTIONS=--max-old-space-size=8192` y
### `DATABASE_URL` → `logistic_slt44` local)
- [x] `pnpm run typecheck`: exit 0.
- [x] `eslint` sobre los 26 `.ts` añadidos o modificados: 0 errores y 2 warnings. Uno es nuevo, en
      un archivo de SLT-44 (m2).
- [x] Los 15 archivos de T2–T5, dobles incluidos: **15 files / 124 tests passed**.
- [x] Las 17 suites existentes del mapa (R14–R18, R20, R24, `carga-division`): **17 files / 373
      tests passed**, 0 skipped.
- [x] `pnpm run test:guardias`: 326 passed / 1 failed (archivos); 4575 passed / 4 failed. Los 4
      rojos son `dependencias-declaradas-presentes.guardia.test.ts`. Ese archivo está en
      `tests/baseline-rojos.json` y ni él ni `init.sh` cambian en el diff, así que no es hallazgo.
- [ ] `./init.sh` completo: no lo corrí, porque se cae por memoria (igual que en SLT-43). Sus piezas
      sí las corrí, por separado (arriba).
- [ ] `gate-completo` de CI: todavía no hay PR (`gh pr list` vacío). Es condición de merge.
- [x] Flujo crítico: no hay E2E nuevo (decisión cerrada). R26 se apoya en los E2E existentes de
      dinero y reparto, y en `dos-empresas-humo`. `gate.yml` los corre también en los PR a `dev`.
- [x] No hay dependencias nuevas: `package.json` solo gana el script `geo:equivalencia-dinero`.

### Seguridad, configuración, datos
- [x] No hay secretos. El script toma `DATABASE_URL` del entorno.
- [x] No hay literales de país, moneda ni SINPE en `lib/` ni en `scripts/` (grep del diff). XA y EC
      solo salen en tests.
- [x] No hay recursos de Ordenex.
- [x] Sin PII: el script solo imprime ids, flags y cifras, y lo comprueba el test de R23.
- [x] No hay tablas ni migraciones nuevas (R25).
- [x] Queries de negocio por empresa: `zona_distrito` y `distrito_zona_especial` pasan por la
      extensión y la RLS. En plataforma, `deLaEmpresa()` corta antes de consultar. Lo prueban dos
      empresas en `geo-catalogo-repository` (R9 y R11) y `zona-especial-dos-empresas`.

### Arquitectura
- [x] Las reglas viven en `lib/services/geografia-dominio.ts`, que es puro y lo vigila una guardia.
      El acceso a datos está en `lib/repositories/`. Interfaces, DTO y servicios consumidores no
      cambian.
- [x] Los comentarios explican el porqué.
- [x] No hay instancias de `OrdenRepository`, `GeoRepository`, `CoberturaRepository` ni del catálogo
      a nivel de módulo en `lib/`, `app/` o `scripts/`. Lo comprobé con grep (exit 1), y es lo que
      sostiene la caché por petición de R11.

## Trazabilidad verificada

| R | Test (lo corrí y está verde) |
|---|---|
| R1 | `geografia-dominio-puro.guardia` (con contraprueba y anti-vacuidad) |
| R2–R4, R6, R7 | `tests/unit/services/geografia-dominio.test.ts`, con un `describe` por R |
| R5 | `geografia-dominio.test.ts`: 8 + 4 combinaciones frente a `estaDisponible`, y profundidad 4 |
| R8 | `geografia-dominio.test.ts` + `geo-equivalencia-dinero.test.ts` («R8: provincias y cantones sin zona ni marca») |
| R9 | `geo-catalogo-repository`: dos empresas en dos países, y campos y orden |
| R10 | `geo-catalogo-repository`: plataforma sin consultas (contador y extensión real), `dePais("XA")` y sin contexto (ver desviación 3) |
| R11 | `geo-catalogo-repository`: una sola carga, en serie y con `Promise.all`; dos empresas, dos cargas; reintento tras un fallo |
| R12 | `geografia-lecturas-sin-nodo-fk.guardia` (con contraprueba) + `geo-lecturas-sin-backfill`, con la columna llena, NULL y desviada |
| R13 | `geografia-sin-cte-recursiva.guardia` (con contraprueba) |
| R14–R20 | `geo-lecturas-catalogo.test.ts`, un `describe` por R, frente a `lecturas-de-hoy.ts` en CR y XA. Además, las suites existentes del mapa |
| R21–R23 | `geo-equivalencia-dinero.test.ts`: 0 diferencias, contraprueba, `--muestra`, códigos 0/1/2, 25006, recuentos y sin PII |
| R24 | `nodo-geografico-sin-escritor.guardia`, `geo-repository.escrituras`, `geografia-alta`, `distrito-zona-especial-por-empresa`, `zona-repository` |
| R25 | Diff: `git log ab63b8b^..HEAD -- db/` vacío y ningún `CREATE INDEX` |
| R26 | Suites existentes verdes sin cambiar aserciones de salida (local) + `gate-completo` y E2E del PR (pendiente) |

## Desviaciones declaradas: mi juicio

1. **`isolationLevel: "RepeatableRead"` y `$transaction` opcional.** Las acepto. La «misma foto» de
   design §3 la exige: con Read Committed, cada `findMany` de la interactiva vería su propia foto.
   Como solo lee, no hay fallos de serialización. Con un cliente que ya es una transacción, la carga
   corre en ella y hereda su foto y su `set_config`, que es lo correcto. Si el cliente es el de la
   app, el proxy `transaccion` de la extensión fija la empresa al abrir.
2. **`organizacion.findFirst` por `id` y `EmpresaNoResuelta` si da null.** Lo acepto como mejora.
   Con RLS es equivalente, y sin RLS (el dueño, en tests) evita devolver el país de otra empresa. En
   modo sesión el `where` queda `{}` y manda la política `organizacion_propia`, como pide el design.
3. **R10 sin contexto: viajan `BEGIN`/`ROLLBACK` y ninguna consulta de datos.** Mi criterio es que
   **cumple** «sin consultar la base». No se lee ni una fila y el rechazo ocurre antes de ejecutar la
   primera lectura. Lo comprueba el test con la extensión real, que filtra solo el control de la
   transacción. En plataforma el corte es previo y no viaja nada (`eventos` vacío). Evitar también el
   `BEGIN` exigiría que el repositorio resolviera la sesión antes de abrir la transacción, y eso hoy
   solo lo hace la extensión. **Marcado para el humano**: si quiere leer R10 al pie de la letra (cero
   tráfico), hay que cambiar el requisito o el diseño, no este diff.
4. **Dobles de T4.4.** Lo comprobé en el diff de los 6 archivos: todos los `expect` que se quitan
   son de forma de consulta (`toHaveBeenCalledWith` del modelo viejo, `arg.where`, `arg.select`), y
   ningún `expect(r)…` de salida cambia. El caso «cantón activo bajo provincia retirada» pasó a
   «cantón retirado», y está justificado: la salida esperada fija `padreId: "p1"` para los dos
   cantones, así que con `p1` retirado `c1` dejaría de estar disponible. La cascada desde la
   provincia la cubren el dominio (R5) y `geografia-catalogo-activo`, en verde.
5. **T5: `clienteNuevo`, multiconjunto y sin prueba de extremo a extremo.** Lo acepto, con m4.
   - La inyección es la única forma de producir una diferencia real sin tocar `lib/`.
   - El multiconjunto se debe a que el DTO del Excel no lleva ids. El bloque «cobertura-por-zona»
     compensa por id de zona.
   - La barrera de solo lectura se prueba con el cliente real del script (25006).
   - La comparación se prueba con `clienteConSavepoint`. La unión de las dos piezas la ejercita
     T7.2 (la persona que corre el script).
6. **Las cuatro suites que no ejecutan en local** (`cobertura-repository`,
   `corregir-datos-cliente.repo`, `geografia-historico-intacto` y `geografia-renombrado`) están en
   `tests/baseline-rojos.json`. No es hallazgo. R19 y R20 quedan medidos por
   `geo-lecturas-catalogo` y R24 por las otras cinco suites, todas en verde (m6).

## Hallazgos

Ningún BLOQUEANTE.

- **m1 (menor): T7.1 y T7.2 sin marcar.** T7.1 espera al `gate-completo` del PR, que todavía no
  existe. Verifiqué el sustituto local (arriba). T7.2 es una puerta humana **previa al merge**: según
  el spec, solo una salida 0 pegada en el PR lo deja entrar. Las dos son condición de merge.
- **m2 (menor): un warning de lint nuevo en un archivo de SLT-44.** `tests/integration/db/geo-catalogo-repository.test.ts:9`
  importa `EscenarioGeo44` y no lo usa. Contradice el «ninguno nuevo en archivos de SLT-44» de la
  bitácora. No rompe el lint, que da 0 errores.
- **m3 (menor, para el humano): la lectura literal de R10.** Ver la desviación 3. Mi criterio es que
  cumple.
- **m4 (menor): `compararEmpresa` no se prueba de punta a punta con el cliente de solo lectura.**
  Además, `clienteNuevo` es una costura de test en el script de producción (`main` no la pasa).
  T7.2 cubre el extremo a extremo.
- **m5 (menor): «no reutilizar entre peticiones» (R11) depende de una convención.** La convención es
  que no haya instancias de los repositorios a nivel de módulo, y hoy se cumple (grep). Ninguna
  guardia lo vigila: una instancia de módulo futura serviría un catálogo viejo sin que salte nada.
  Conviene una guardia en SLT-65, que toca esos repositorios.
- **m6 (menor): R19, R20 y R24 no tienen su suite histórica midiendo.** Están en el baseline, así
  que tampoco miden en CI. Su cobertura descansa en los tests nuevos de SLT-44 y en las otras suites
  de R24. Es deuda previa: ya está en el baseline.
- **m7 (menor): el comando literal de R25 no sale vacío** contra `origin/dev`, ni tampoco contra la
  rama de SLT-43. El motivo es el apilado sobre el PR #44 y el merge de SLT-58. Saldrá vacío contra
  `origin/dev` cuando el PR #44 entre y se mergee `dev` aquí. La comprobación equivalente
  (`git log ab63b8b^..HEAD -- db/` vacío) pasa.
- **m8 (nota): el dominio, en `lib/services/`, importa dos reglas de `lib/repositories/_shared/`.**
  Son `activoEnCascada` y `zonaUnicaDeDistrito`. Lo aprobó el design (§2.3 y «Lo que ya existe»), y
  la guardia de R1 comprueba que esas dos tampoco importan Prisma. No hay acción.

## Veredicto

**OK.**

Condiciones de merge, que no son hallazgos:
- el `gate-completo` y el E2E del PR en verde, sin rojos nuevos respecto del baseline (R26 y T7.1);
- T7.2: una persona corre `pnpm geo:equivalencia-dinero` sobre una copia de producción con SLT-43 y
  pega una salida 0 en el PR;
- el PR #44 (SLT-43) mergeado antes, o a la vez.
