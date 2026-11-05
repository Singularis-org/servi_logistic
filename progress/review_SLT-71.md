# review SLT-71 — Geografía jerárquica: consultas de tránsito y analítica sobre el nodo

> Reviewer, F2.2 vuelta 1 (completa), 2026-11-05. Alcance: solo lo propio de SLT-71,
> `git diff c26cd50a..HEAD` (28 commits, 46 archivos). El stack de SLT-65/44/43 (PR #75) no se revisa.
> Grafo de código: no usado; todo con Grep/Read y git (el índice del worktree no está garantizado).

## Verificación ejecutada por el reviewer

`NODE_OPTIONS=--max-old-space-size=8192`, desde el worktree.

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | exit 0 |
| `pnpm run test:guardias` | 330 passed / 1 failed / 3 skipped (334); 4 tests rojos, todos en `dependencias-declaradas-presentes` (baseline) |
| `eslint` sobre los 39 `.ts` añadidos o modificados | 0 errores, 2 warnings `_c` sin usar en `ciclo-vida.test.ts:302` y `conteo-devoluciones.test.ts:326`, de `86d70bf0` (previas, no de SLT-71) |
| Unit: `lugares-del-filtro`, `lugar-orden`, los 7 de §11.1, `alcance-dinero.guardia`, `cohorte-consulta-unica`, `conteo-hoy-gestion-servicio`, `informe-transito-composicion`, `informe-transito-repo-consultas`, `conteo-entregas-contrato` y `entregas-filtro-analitica` | 16 archivos, 305 tests en verde |
| Integración contra `logistic_slt71` (localhost): `geo-71-fixture`, `geo-analitica-lugar`, `geo-transito-nombres`, `geo-equivalencia-analitica`, `geo-explain-analitica`, `geo-lecturas-sin-backfill` y `geo-explain-consultas` | `--no-file-parallelism`: 7 archivos, 47 tests en verde. En paralelo: 7 fallos por el `testTimeout` de 20 s (ver hallazgo m3) |
| Copia congelada (T1.2) frente a `c301fc87` | Los blobs de los 9 repositorios en `c26cd50a` y en `c301fc87` son idénticos. Todas las líneas de SQL de los 9 originales están literalmente en `analitica-de-hoy.ts`. Solo cambian `this.prisma` → `cliente` y los nombres; `zonas` y `contarSinHito` no se copian porque no hacen falta. La copia no se tocó después de `12b3d055`, y ese commit precede a T2–T4 y cita el SHA |

## Checklist

### Trazabilidad (R1–R25)
- [x] **R1**: `lugares-del-filtro.test.ts` (provincia → sus 3 niveles; nivel 4); `lugar-orden.test.ts` (un parámetro array por rama, dos `ANY`, sin `COALESCE`); `geo-analitica-lugar` «R1 (profundidad 4)», que comprueba que el nodo inyectado suma sus órdenes.
- [x] **R2**: `geo-analitica-lugar` «R2» (el alcance de tienda va primero en los 4 constructores); el orden de las facetas en `lugares-del-filtro.test.ts`. Que zona y tienda no cambian lo prueba la equivalencia de R4, con el filtro «dos provincias y zona».
- [x] **R3**: unidad (inválido, todos inválidos → `[]` → `FALSE`) e integración (cantón pedido como distrito, otro país y provincia pedida como cantón → cero en las 5 lecturas, igual que hoy).
- [x] **R4**: `geo-analitica-lugar` «R1, R2, R4, R7». Las 5 lecturas y las 4 que comparten el recorte, frente a la copia, en las 2 empresas, con 13 filtros × 2 rangos, como maestro y como adminTienda. Tiene antivacío.
- [x] **R5**: `geo-analitica-lugar` «R5». 0 cargas de nodos; el SQL y los valores son idénticos a la copia en más de 20 consultas. También `lugares-del-filtro` «R5».
- [x] **R6**: los tests de contrato y de filtro existentes, sin cambios y en verde. `git diff c26cd50a..HEAD -- lib/analytics/ lib/cache/` está vacío.
- [x] **R7**: `alcance-dinero.guardia` (2), `conteo-productos-sql`/`dinero-productos-sql` con faceta (p1/c1/d1) y la equivalencia de productos, dinero, cohorte y contador de hoy. `lugares` es un parámetro obligatorio, así que no hay modo doble.
- [x] **R8, R9**: `geo-transito-nombres` «R8, R9». Las filas son iguales fila a fila a las de hoy en las 2 empresas, con una sin distrito, y el modelo de `seleccionarTransito` también es igual.
- [x] **R10**: `geo-transito-nombres` «R10»: con 1 y con 40 órdenes salen las mismas consultas, y no hay `FROM/JOIN "canton"|"distrito"`. `informe-transito-repo-consultas` sigue sin cambios y en verde.
- [x] **R11**: `geo-transito-nombres` «R11».
- [x] **R12**: `geo-transito-nombres` «R12». La generación falla con `filasEnAlerta falló` y deja 1 línea de log con el prefijo exacto, los 2 ids de nodo y los 2 de orden, sin datos personales ni nombres. La contraprueba sin log también está.
- [x] **R13**: `geo-analitica-lugar` y `geo-transito-nombres`. XA carga solo su catálogo, una vez por instancia. En plataforma salta `EmpresaNoResuelta`, en las 5 lecturas y en tránsito.
- [x] **R14**: la guardia `geografia-lecturas-sin-nodo-fk`, ampliada a 10 archivos con anclas y 2 contrapruebas. `geo-lecturas-sin-backfill` da lo mismo con la columna llena, en NULL y desviada.
- [x] **R15**: `geografia-sin-cte-recursiva`, sin cambios y en verde.
- [x] **R16**: el antivacío de `catalogo-geografico-sin-instancia-de-modulo` se amplía, y está en verde.
- [x] **R17**: `geo-equivalencia-analitica`. Cuando todo coincide sale 0, y la incoherente solo aparece en `cadena-incoherente`. La contraprueba del cantón movido da diferencias y sale 1. `--muestra` funciona.
- [x] **R18**: los dos tests de los scripts. Un `INSERT` da `25006`, las filas quedan iguales, la salida no lleva datos personales, nombres ni SQL, y una URL no local sale con 2.
- [x] **R19**: `geo-explain-analitica` «R19, R18»: 6 lecturas con 5 corridas por lado, total y sin catálogo.
- [x] **R20, R21**: unidad de `veredicto`: +21/+21 → regresión, +21/+5 → costo fijo, +19 y +20 → ok, ciclo de vida +50 → ok, Seq Scan nuevo → regresión en las seis. También la línea impresa del costo fijo.
- [x] **R22**: `codigoDeSalida` da 0, 1 o 2, y con el catálogo roto las seis lecturas salen fallidas → 2.
- [x] **R23**: comprobación de diff. `git diff --name-only c26cd50a..HEAD -- db/` está vacío. Contra `origin/dev` se repite en F2.3, por decisión del humano del 2026-11-05.
- [x] **R24**: los `expect` cambiados son exactamente los de §11.1, más `alcance-dinero:222`, autorizado por el humano (verificado línea a línea abajo). Los E2E y las `informe-transito-*` de integración quedan para `gate-completo` de CI.
- [x] **R25**: `GestionOrdenRepository`, `lib/whatsapp-envios/**`, `components/`, `app/`, `lib/api/`, `lib/actions/`, `lib/interfaces/` y `lib/types/` están fuera del diff. De `OrdenRepository.ts` solo cambia la importación de `PROFUNDIDAD_DEL_NIVEL` y el borrado de su declaración.

### Tasks
- [x] T0–T8.2 marcadas `[x]`.
- T8.3 es una puerta humana y está bien sin marcar. T9.1 solo aplica si T8.3 marca regresión.

### CHECKPOINTS.md
- [x] `requirements.md` en EARS con R1–R25; `design.md` con alternativas descartadas (§12) y `tasks.md`.
- [x] `design.md` abre con `## Lo que ya existe`, que no está vacía. El diff no re-crea nada de esa lista: `medicion.ts` se extrae de `geo-explain-consultas.ts` y se re-exporta; `crearClienteDeSoloLectura`, `compararPorId`, `esBaseLocal`, `paraCadaEmpresa`, `nodo`/`nodosBajo` y `deLaEmpresa` se importan; `PROFUNDIDAD_DEL_NIVEL` se mueve y no se duplica.
- [x] El mapa `R → test` está en `progress/impl_SLT-71.md`.
- [x] Typecheck y lint en verde (solo las 2 warnings previas).
- [ ] `gate-completo` en CI: todavía no hay corrida (no hay PR). Es condición de merge, no un hallazgo.
- [x] Flujos críticos: no toca ninguno de la lista. Tránsito y analítica no están; R24 lo cubre con los E2E existentes en CI.
- [x] Sin dependencias nuevas (`package.json` solo suma los dos scripts `geo:*`).
- [x] Sin secretos: la URL de los tests no locales se arma por partes (`eaec3e99`, SL-34). Nada hardcodeado entre entornos.
- [x] `./init.sh` completo no cabe en local; en local valen typecheck y guardias (regla del humano). El veredicto es el de CI.

### docs/checkpoints-proyecto.md
- [x] Sin tablas nuevas ni migraciones.
- [x] Las queries nuevas sobre negocio siguen en el contexto de empresa (extensión SL-17 y RLS). La carga del catálogo es por empresa (`deLaEmpresa`), y hay test de dos empresas (CR y XA) en las dos suites nuevas.
- [x] Sin Ordenex. Sin `console.log` de secretos o PII: los scripts solo imprimen ids y cifras, y R18 lo prueba.
- [x] Capas: el filtro se resuelve en `lib/repositories/_shared/` y el dominio en `lib/services/geografia-dominio`. `lib/analytics/` (módulo puro) sigue sin tocar.
- [x] País: ningún literal de país, moneda, nivel ni nombre de tipo en código nuevo. Las menciones a «Costa Rica» del diff son de líneas que ya existían.
- [x] Permisos: no hay action, ruta ni módulo nuevos.

### docs/perfil-agentes.md > reviewer
- [x] Ninguna query de negocio sin el filtro de empresa, ninguna tabla sin RLS, ninguna migración. No hay literal de país ni recursos de Ordenex.
- [x] No hay dependencia nueva.
- [x] Los comentarios explican el porqué: por qué no hay `COALESCE`, por qué `lugares` es obligatorio, por qué sin filas no se carga el catálogo y por qué el log solo lleva ids.

## Juicio de las elecciones señaladas por el implementer

1. **La regla que disculpa las diferencias por órdenes de cadena incoherente** (`compararLectura`, `scripts/geo-equivalencia-analitica.ts:416–421`). Disculpa un par (lectura, filtro) si `afectadas > 0` y `|a.ordenes − b.ordenes| <= afectadas`. Es una aproximación razonable, el design no fija el mecanismo y está probada con el fixture. Pero disculpa de más y nadie puede auditar lo disculpado: hallazgo **m1**.
2. **`zona` contada como catálogo** en la suma «sin catálogo» (`medicion.ts:111–112`). Hoy es correcto. `zona` solo aparece en la consulta aparte que Prisma emite para `zona_distrito` al cargar el catálogo. `zonas()` de tránsito se lee fuera de la medición, y ninguna consulta medida de antes ni de después nombra la tabla `"zona"` (las condiciones usan `o."zona_id"`, que el regex no casa). Pero si se equivoca, se equivoca en la dirección que esconde una regresión: hallazgo **m2**.
3. **Seq Scan sobre `orden` «nuevo» cuando después > antes.** Aceptable. R20 dice «aparece un Seq Scan que antes no estaba». Contar es más estricto que la regla de SLT-65 (`despues > 0 && antes === 0`): también marca un segundo Seq Scan cuando ya había uno, y la falsa alarma va hacia el lado seguro. Límite conocido: si un Seq Scan pasa de una consulta a otra con el mismo número, no se detecta. Para estas lecturas no es realista: «después» solo añade consultas del catálogo, que no leen `orden`. Sin hallazgo.
4. **`--muestra` 20 por defecto.** Correcto: es literalmente design §8 (`[--muestra 20]`). Solo se sustituye el 200 del parser de SLT-44 si no se pasa la opción, y el test lo fija. Sin hallazgo.
5. **Ningún script abre contexto de plataforma.** Correcto, y es lo que exige R13. Cada empresa se lee en `conEmpresa`. Listar las empresas lo hace `paraCadaEmpresa`, que abre plataforma dentro de `lib/db` (SL-17), así que los scripts no entran en `EXCEPCIONES_DE_PLATAFORMA`. Sin hallazgo.
6. **Riesgo: las suites `informe-transito-*` leen sin empresa.** El riesgo es real, pero solo en tests. Sin contexto, `deLaEmpresa` hace `organizacion.findFirst({})`. Con el cliente dueño de los tests, sin RLS, devuelve una empresa cualquiera, y su país puede no ser el de las órdenes: R12 haría fallar la generación. En producción no pasa, porque el job corre en `conEmpresa` y la vista previa con la sesión (T0.1). Hoy esas 5 suites son rojos de baseline por «app nace vacía» (SL-31), así que no se ve. Hallazgo **m4**.

## Hallazgos

Ninguno es BLOQUEANTE.

- **m1 (menor) — La regla de las incoherentes disculpa de más y no deja rastro.** `scripts/geo-equivalencia-analitica.ts:416–421`.
  - **Disculpa de más.** Solo compara el total `ordenes` de cada lado.
    - En las lecturas que son una distribución (desglose por estado, cargadas por día, devoluciones por causa), si los totales caben en `afectadas` pero el reparto entre cubos difiere, se disculpa. Pasa incluso con Δ = 0.
    - Ciclo de vida: los `segundos` no entran.
    - Dinero: el `importe` no entra.
    - Tampoco mira el sentido. Con `h` órdenes que entran solo por hoy y `n` que entran solo por el lugar, lo esperado es `a − b ∈ [−n, h]`, y la regla acepta cualquier `|Δ| ≤ h + n`.
  - **No deja rastro.** La salida solo imprime `solo-incoherentes=<N>`, no qué pares se disculparon ni sus cifras. La persona de T8.3 no puede comprobar sobre la copia de producción que la disculpa es legítima.
  - **Qué falta, mínimo:** imprimir cada par disculpado como línea informativa, con bloque, filtro, lectura, `hoy=` y `nuevo=` (solo cifras e ids, como el resto, R18).
  - **Recomendado además:** acotar por sentido, con `h` y `n` por separado, y no disculpar si Δ = 0 con claves distintas.
- **m2 (menor) — `zona` en `TABLAS_DEL_CATALOGO` sin una prueba que lo fije.** `scripts/geo-equivalencia/medicion.ts:111`.
  - El comentario de `TABLAS_DE_LA_GEOGRAFIA` dice que su error «va hacia marcar regresión». Con `leeElCatalogo` es al revés: si una consulta medida de la lectura llegara a leer `"zona"`, su tiempo saldría de «sin catálogo» y una regresión real podría salir como `costo-fijo-del-catalogo`.
  - **Recomendado:** que el test de integración de R19 compruebe que, en cada lectura medida, las consultas de antes no casan con `leeElCatalogo`. Así queda fijado que todo lo que se descuenta es la carga del catálogo. Otra opción es reconocer la consulta de `zona` por su forma de carga del catálogo.
- **m3 (menor) — Tests de integración nuevos expuestos al `testTimeout` de 20 s con paralelismo de archivos.**
  - En paralelo, sin `--no-file-parallelism`, fallaron por timeout de 20 s:
    - `geo-71-fixture` (antivacío);
    - `geo-analitica-lugar` «R2»;
    - `geo-transito-nombres` «R10», «R11» y «R12»;
    - también 2 de `geo-explain-consultas`, que es de SLT-65.
  - En serie pasan los 47. Esos `it` no tienen timeout propio y esperan el cerrojo de escritura (`pg_advisory_xact_lock`) detrás de tests de 180–300 s.
  - El patrón ya existía en SLT-65, así que puede que CI lo absorba con su reparto de shards y workers. Pero es un riesgo de rojo en `gate-completo`.
  - **Recomendado:** si CI lo reproduce, dar timeout explícito a esos `it`, como ya hacen los largos.
- **m4 (menor) — Riesgo latente de las `informe-transito-*` sin empresa, sin anotar como deuda.** El riesgo está en `progress/features/SLT-71.md`, pero no en `progress/deudas.md` ni en la entrada del baseline (`tests/baseline-rojos.json:455–474`). Cuando SL-31 siembre esas suites, R12 las puede tumbar según qué empresa devuelva `findFirst`, y quien lo arregle no sabrá por qué.
  - **Qué falta:** una línea de deuda que diga que esas suites tienen que correr en `conEmpresa`/`comoLaEmpresa` al retirarlas del baseline.

## Notas (no son hallazgos)

- Los cambios de entrada en los dobles de `cohorte-consulta-unica.test.ts` e `informe-transito-composicion.test.ts` (fuera de la lista de archivos de §11.1) no tocan ningún `expect`. Ya estaban anotados en la tanda 2.
- R23 contra `origin/dev` literal y la evidencia E2E/tránsito de R24 quedan para F2.3 y CI, como decidió el humano.

## Veredicto

**OK.** 0 bloqueantes, 4 menores (m1–m4). Lo recomendable es corregir m1 antes de T8.3, porque es la evidencia que mira la persona sobre la copia de producción. El merge sigue condicionado a `gate-completo` en verde, a T8.3 y a repetir R23 contra `dev` en F2.3.

## Vuelta 2 (acotada a d8db5a65..31ba4b13)

> Reviewer, 2026-11-05. Solo las correcciones de m1–m4 y sus regresiones. No se rehace la trazabilidad.

### Verificación

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | exit 0 |
| `eslint` sobre los 2 scripts y los 2 tests tocados | sin problemas |
| Tests puros de `disculpable` y de la regla de `veredicto` | 11 en verde |
| Integración contra `logistic_slt71` (localhost), 6 archivos SLT-71, **en paralelo** | 1.ª corrida: 3 rojos (`geo-analitica-lugar` «R1, R2, R4, R7» a 31 s y «R2» a 37 s; `geo-transito-nombres` «R10» a 61 s). 2.ª corrida (4 archivos): 36/36 en verde. Intermitente (ver m6) |
| Integración en serie (vuelta 1, mismos tests) | en verde |

### Estado de los hallazgos de la vuelta 1

- **m1 — resuelto** (`0a0eb45b`).
  - Ahora `disculpable` exige cuatro cosas:
    - el sentido: `a − b ∈ [−soloLugar, soloHoy]`;
    - un Δ distinto de 0;
    - que cada cubo quepa: lo de más ≤ `soloHoy` y lo de menos ≤ `soloLugar`;
    - que `fijos` coincidan: los segundos de ciclo y de cohorte, el importe y el límite.
  - Cada par disculpado se imprime como `[solo-incoherentes]`, con bloque, filtro, lectura, `solo-hoy`/`solo-lugar` y las cifras. Solo lleva ids y números (R18).
  - Lo prueban 4 `it` puros (sentido, tamaño, mismo total con otro reparto, `fijos`) y la integración: la línea de rastro de `canton=<id> por-status` con `solo-hoy=1`, y hoy − nuevo = 1.
- **m2 — resuelto** (`62c61bab`). `sinCatalogo.consultas` se cuenta por lado. El test de R19 exige que todas las consultas de antes queden en «sin catálogo» y que después, sin el catálogo, queden tantas como antes. Si una consulta medida de la lectura leyera `"zona"`, la cuenta no cuadraría y saltaría. Los comentarios dan bien el sentido del error de cada regex.
- **m3 — resuelto en parte** (`63d880f3`). Los 5 `it` señalados ganan 180 s de `testTimeout`. El residual es m6.
- **m4 — resuelto** (`e86d02dc`). D37 en `progress/deudas.md`, con origen, qué falta (correr en `conEmpresa`/`comoLaEmpresa` al salir del baseline) y dueño.

### Hallazgos nuevos

Ninguno es BLOQUEANTE.

- **m5 (menor) — La regla nueva puede dar salida 1 cuando solo difieren las incoherentes.**
  - **Por qué.** Vuelve a la regla en sentido contrario. Si una orden incoherente aporta tiempo de ciclo, importe recibido o segundos de cohorte, `fijos` difiere y el par no se disculpa. Pasa lo mismo si aporta más de una fila a una lectura por gestión (devoluciones con dos gestiones, por ejemplo): Δ supera `soloHoy`. Y con un intercambio legítimo (una entra solo por hoy y otra solo por el lugar, Δ = 0) tampoco se disculpa.
  - **Consecuencia.** En esos casos el script sale 1, aunque R17 pide 0 «si son la única diferencia». El error va del lado seguro: no esconde nada y bloquea hasta que una persona mire. En el fixture no pasa, porque la incoherente está `en_preparacion`, sin gestión ni dinero.
  - **Qué falta.** Que la persona de T8.3 pueda reconocer el caso: añadir `solo-hoy=… solo-lugar=…` también a la línea de una diferencia **no** disculpada cuando el filtro tiene incoherentes, y anotar en el PR que un 1 con esa marca se revisa a mano.
- **m6 (menor) — El residual de m3 es real: `revertida` corta la transacción a 30 s.**
  - **Dónde.** `tests/integration/db/_fixtures/pais-20.ts:28`. La espera del cerrojo (`pg_advisory_xact_lock`) corre **dentro** de una transacción interactiva con `timeout: 30_000`. Así que los 180 s de vitest no son el límite: si el cerrojo lo tiene un test largo de SLT-71 (`revertidaLarga` 180 s, `conEscenario` 300 s), la transacción caduca antes.
  - **Reproducido.** Los 3 rojos en paralelo, a 31–61 s, lo confirman. La segunda corrida pasó: es intermitente.
  - **Por qué menor.** El helper es compartido (66 archivos), anterior a SLT-71 y fuera de su alcance. Que salga rojo depende del reparto de CI, y `gate-completo` lo decide.
  - **Recomendado.** Si CI lo reproduce, que los `it` de SLT-71 con `revertida` usen una variante con timeout largo, como ya hace `revertidaLarga` en `geo-explain-analitica.test.ts`. Así no se toca el helper compartido. Si no lo reproduce, anotarlo junto a D37.

### Veredicto vuelta 2

**OK.** m1, m2 y m4 están resueltos y m3 en parte. Hay 2 menores nuevos (m5 y m6), ningún bloqueante y ninguna regresión funcional. Las condiciones de merge siguen igual: `gate-completo` en verde, T8.3 y R23 contra `dev` en F2.3.
