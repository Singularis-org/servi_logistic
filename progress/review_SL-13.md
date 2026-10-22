# Review — SL-13 «Fuera el integrador heredado y sus clientes» (`fuera-nuform`)

> Reviewer, vuelta 1. Diff `dev...HEAD` con HEAD `1b435bd` (merge-base `de68dfb`).
> En este archivo los nombres retirados solo aparecen dentro del slug `fuera-nuform`.
> El MCP del grafo no se usó: el cambio es de comentarios, fixtures y una guardia, y se revisó con
> Grep/Read y `git`.

## Veredicto: RECHAZADO (2 bloqueantes)

## Checklist

### Especificación (`CHECKPOINTS.md`)
- [x] `requirements.md` con R1–R16 en EARS.
- [x] `design.md` con alternativas descartadas (A–K) y su porqué.
- [ ] `tasks.md`: **T8 sigue `[ ]`** (B2).
- [x] `design.md` abre con `## Lo que ya existe`, con contenido. El diff no re-crea nada de lo
      listado. `lib/config/pais.ts` es nuevo y no duplica nada: busqué `centroMapa`,
      `ConfiguracionPais`, `PAIS_DE_OPERACION` y `codigo_pais` en `dev` (0). `lib/config/moneda.ts`
      configura el formato de la moneda, no el país (ver m3).

### Equipo
- [x] Rama `feature/SL-13-fuera-nuform` en su worktree. El assignee de Jira lo controla el leader.

### Trazabilidad
- [x] Cada R tiene su test o su evidencia, y el mapa `R → test` está en `progress/impl_SL-13.md`.
      Lo comprobé ejecutando:
  - **R1, R2, R3, R4, R15:** `sin-integrador-de-ordenex.guardia.test.ts`, 6/6 en verde. Muerde
    (mis mordidas, todas restauradas, `git status` limpio):
    - archivo nuevo sin versionar con uno de los clientes y el barrio (con tabulador entre las
      palabras): **rojo**, con las 2 líneas nombradas;
    - archivo con «Ecuador», «Distribuidora mayorista» y `Av- <calle>`: **verde**. Las palabras
      sueltas no se vetan y el `.` es literal;
    - archivo vacío cuyo nombre lleva un cliente: **rojo** por la ruta;
    - `progress/zz-*.md` con «distribuidora» + tres espacios + «central»: **rojo**. `progress/` sí
      se barre;
    - `// medido con Ecuador` en `ProductosTabla.tsx`: **rojo** (R4);
    - un par de coordenadas en `UbicacionMapaInner.tsx`: **rojo** (R15).

    La lista de términos es exactamente la de R1, la diez, y no lleva «ecuador» ni «distribuidora»
    sueltas.
  - **R12:** `test-citado-desaparecido`, 15/15. Comprobé la desviación de D4 (2 entradas, no 4):
    - `FILA_DE_REQUISITO` (`/^\s*\|\s*\**R\s*-?\s*([0-9]+[a-z]?)\**\s*\|/`) no casa
      `| R80, R88 |` ni `| R81–R86 |`, las dos filas del spec 459;
    - si se añade una excepción para el 459, sale **rojo** «ese documento ya no lo cita»;
    - si se quita la primera excepción del 461, sale **rojo** en R-1 nombrando
      `specs/461…/design.md:827`.

    La justificación del implementer es correcta.
  - **R16:** `tests/unit/config/pais.test.ts`, 3/3. Afirma el literal como contrato.
  - **R6:** comparé el número de casos de los 48 archivos con la línea base de T0 (vitest JSON): son
    iguales. La única diferencia es `test-citado-desaparecido`, que pasa de 13 a 15 y es lo esperado.
    Las seis fixtures extra tienen el mismo número de casos que en `dev`. El orden alfabético se
    conserva (`informe-picking.test.ts:241-243`).
  - **R10:** ejecutados contra la base local del worktree (host local, sin Supabase):
    - `api-key-tienda-destino-migration` 12, `cobro-tienda-461-completar-migration` 6 y
      `premio-ranking-devengo-migration` 32: **50 passed**;
    - `caja-invariante-tiendas` aborta en la precondición («faltan la zona central, el tipo `cedula`
      o una orden»).

    Es la decisión del leader (deuda de SL-31): no es hallazgo.

### Calidad de código
- [x] `pnpm run typecheck`: exit 0.
- [x] `pnpm run lint`: exit 0. Hay 234 warnings, pero ninguno en los archivos del diff.
- [x] Los 56 tests modificados o nuevos fuera de `tests/integration/db/` corren sin `DATABASE_URL`:
      1479 casos, 1462 passed, 17 skipped (los de `AnaliticaPage`, igual que en la línea base) y
      0 failed.
- [ ] `gate-completo` en CI: no se puede saber todavía. **Con `dev` de hoy la rama no integra**
      (B1).
- [~] Flujo crítico `mis-asignaciones`: el cambio solo toca el centro de respaldo del mapa (m1).
- [x] Sin dependencias nuevas: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` no
      cambian.

### Seguridad y configuración
- [x] No hay credenciales ni URLs de base en el diff:
  - 0 `postgres://` y 0 `DATABASE_URL=` en las líneas añadidas;
  - los dos project refs de Ordenex solo aparecen como advertencia «comprobar que no apunta a…» en
    `design.md` y en la bitácora, igual que en `docs/perfil-agentes.md`;
  - la única URL añadida es `fonts.googleapis.com`, en una línea de diseño que ya existía (+1/−1).
- [x] El centro del mapa sale de configuración (`lib/config/pais.ts`): `codigo: "CR"` y
      `centroMapa: [9.9281, -84.0907]`, que es San José. `RutaMapaInner.tsx` usa
      `[...PAIS_DE_OPERACION.centroMapa]`. `UbicacionMapaInner.tsx` ya no tiene la constante sin
      uso. Ninguno de los dos mapas lleva coordenadas literales.

### Datos y migraciones (`docs/checkpoints-proyecto.md`)
- [x] **R9:** `git diff --name-status dev...HEAD -- db/` da tres `M` y dos `D`, los de la 459. La
      carpeta `20260925120300_reclasificar_cobros_459` ya no existe. Contra el merge-base no se
      añade, borra ni renombra ninguna otra carpeta.

      Comparada con el `dev` de hoy, HEAD conserva dos carpetas: `20260713010000_seed_zonas_pago_distrito`
      y `20260720150000_drop_default_maestro_user`. No es un cambio de SL-13: las borró SL-11 en
      `dev` después del merge-base, y se resuelve con la sincronización de B1.
- [x] **R8:** en los tres SQL, las líneas `+`/`-` que no empiezan por `--` son 0.
- [x] **R11:** los tres archivos están borrados y la entrada del baseline se quitó.
      `gate-cableado-arnes-v2` está en verde.
- [x] **R13:** 0 archivos de `specs/` ajenos en el diff. Los literales de Costa Rica (SINPE, ₡,
      Costa Rica, San José) en los archivos modificados son 14 en `-` y 14 en `+`: solo cambia el
      nombre de tienda de esas líneas.
- [x] Ningún recurso de Ordenex en el diff. `docs/plan-saas.md:14` (R7) ya no nombra la cuenta de
      GitHub.
- [x] Ninguna tabla, query ni permiso nuevo. `organizacion_id`, RLS y capas no aplican.

### Reglas del proyecto (`docs/perfil-agentes.md > reviewer`)
- [x] «Literal de país en código nuevo»: `lib/config/pais.ts` lleva `"CR"` y un comentario que nombra
      Costa Rica. **No es hallazgo:** es la capa de configuración que pide la regla
      (`docs/checkpoints-proyecto.md`: el país «sale de configuración») y es lo que fija R16, ya
      aprobado. Ningún consumidor lleva el literal.
- [x] Ninguna migración nueva, así que no hay `down.sql` que exigir.
- [x] Los comentarios explican el porqué: la poda, el atajo del barrido entero y por qué D4 tiene dos
      entradas.
- [x] Los 16 mensajes de commit no llevan ningún término fuera del slug.

### Fixtures extra (pregunta del leader)
- [x] Las seis fixtures fuera de la lista esperada (`OrdenesCargaResumen`, `carga-api-key-sin-tarifa`
      y los cuatro `bulk-orden-service.{carga-api,carga-lote,filas-omitidas,texto-etiqueta}`) solo
      cambian las dos cadenas vetadas del barrio y la avenida, con el mapeo de D5. Lo medí con
      `git diff --word-diff`: los únicos tokens que cambian son esos dos, y el número de casos no
      cambia.

## Hallazgos

### B1 — BLOQUEANTE: la rama no integra con el `dev` actual, y al mergear la guardia nueva sale roja (R1, gate)
`dev` avanzó después del merge-base `de68dfb`: entraron SL-11 y SL-14 y está en `135037f`. Lo
simulé con `git merge-tree --write-tree HEAD dev`:

- **Hay 2 conflictos de contenido:**
  - `docs/plan-saas.md`: el lado de `dev` reintroduce, en la línea 76, la lista de la fase 1 con el
    nombre del integrador entre paréntesis;
  - `tests/baseline-rojos.json`: el lado de `dev` conserva la entrada de la guardia 459.
- **En el árbol fusionado R1 sale rojo** en
  `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts:115` y `:141`. Ese archivo lo creó SL-11
  (`cbfb276`, ya en `dev`):
  - en la 115, el nombre de la constante de la regex es el término;
  - en la 141, el mensaje es `"nombra <integrador>"`.

  La regex se construye por concatenación y no cuenta, pero el identificador y el mensaje sí.

**Qué falta:**
1. `git merge dev` en la rama y resolver los dos conflictos:
   - en `plan-saas.md`, sin el nombre;
   - en el baseline, sin la entrada de la 459.
2. En `fuera-datos-ordenex.guardia.test.ts`:
   - renombrar la constante, por ejemplo a `INTEGRADOR`;
   - cambiar el mensaje a «nombra al integrador de Ordenex».

   No se puede añadir una tercera excepción: R2 exige exactamente dos.
3. Volver a correr `sin-integrador-de-ordenex`, `fuera-datos-ordenex` y `test-citado-desaparecido`
   sobre el árbol fusionado, y anotarlo en la bitácora.

### B2 — BLOQUEANTE: T8 sin marcar en `tasks.md`
`CHECKPOINTS.md > Especificación` exige todas las tasks en `[x]`, y T8 sigue `[ ]`. La decisión del
leader ya da R10 por cumplido con los tres tests en verde y deja los otros dos para SL-31.

**Qué falta:** marcar T8 `[x]` y anotar en ella esa decisión: R10 queda cubierto con 3 de 5, y
`orden-traspaso-migration` y `caja-invariante-tiendas` pasan a SL-31.

### m1 — menor: flujo crítico `mis-asignaciones` sin E2E anotado
`RutaMapaInner.tsx` pertenece a un flujo crítico, y `e2e/mis-asignaciones.spec.ts` existe. El
cambio solo afecta al caso degenerado, una ruta sin puntos, que ningún E2E pinta. El riesgo es
bajo, y lo cubren el typecheck y la guardia de R15. El leader decide si basta el E2E del PR a
producción.

### m2 — menor: D4 y T7 siguen diciendo «cuatro entradas»
La implementación lleva dos, con la justificación verificada arriba. Conviene corregir
`design.md > D4` y el texto de T7 para que el spec describa lo que hay.

### m3 — menor: `Lo que ya existe` no nombra `lib/config/moneda.ts`
`moneda.ts` es la otra pieza de «país/moneda desde configuración», y admite override por variable de
entorno. No hay re-creación, pero SL-20 debería partir de los dos archivos.

### m4 — menor: el gate del worktree necesita `TEST_RAPIDO_BASE=dev`
Sin `origin/dev`, el `init.sh` rápido se salta la selección por diff en silencio, como describe la
bitácora. Ya está anotado como deuda D5 en `dev` (`9d8ac1e`). Aquí no es un hallazgo de SL-13.

## Lo que no corrí
- `./init.sh` y `pnpm install`, por instrucción del leader. Para R14 me baso en la bitácora
  (corrida 5, `INIT_EXIT=0`), más el typecheck, el lint y los tests que corrí yo.
- El E2E (m1).

## Vuelta 2 (acotada a f61194e..75c4875)

### Veredicto: OK (0 bloqueantes)

El rango incluye el merge de `dev` (`46617c9`), que trae SL-10, SL-11, SL-12 y SL-14. De lo que
llega de `dev` solo revisé la resolución y sus efectos sobre SL-13. Lo demás ya tiene su review.

### B1 — cerrado
- **Integra limpio.** `135037f` (el `dev` de hoy) es ancestro de `75c4875`.
  `git merge-tree --write-tree 75c4875 135037f` termina con exit 0 y devuelve el mismo árbol que
  HEAD (`cdc4a77`), sin conflictos.
- **Resolución, revisada con `git show --remerge-diff 46617c9`:**
  - **`docs/plan-saas.md`:** queda «los integradores;» (sin el nombre) junto a la línea del dominio
    que trae `dev`. Contra `dev`, el diff son solo las dos líneas de SL-13: la 14 (R7) y la de la
    fase 1.
  - **`tests/baseline-rojos.json`:** salen la entrada de la 459 y las dos de zona, que SL-11 ya había
    retirado en `dev`. Contra `dev`, el diff es solo la entrada de la 459. El JSON es válido y queda
    `dependencias-declaradas-presentes` como única entrada.
  - **`fuera-datos-ordenex.guardia.test.ts`:** la constante pasa a `INTEGRADOR` y el mensaje a «nombra
    al integrador de Ordenex». La regex sigue construida por concatenación y no cambia lo que mide.
    No se añadió ninguna excepción, y R2 sigue con dos.
- **El árbol de HEAD no tiene ningún término**, fuera de `specs/`, de la propia guardia y del slug: lo
  comprobé con `git grep` (0).
- **R9 contra el `dev` de hoy:** `git diff --name-status 135037f 75c4875 -- db/` muestra solo las
  tres `M` de comentarios y las dos `D` de la 459. Las dos carpetas que SL-11 retiró ya no aparecen
  como diferencia.

### B2 — cerrado
T8 está `[x]` y cita la decisión del leader: R10 queda con 3 de 5, y `orden-traspaso-migration` y
`caja-invariante-tiendas` pasan a SL-31. En `tasks.md` no queda ninguna task sin marcar.

### m2 y m3 — cerrados
- **m2:** `design.md > D4`, la mordida, la alternativa D y T7 dicen ahora «dos» entradas, con el
  porqué.
- **m3:** `design.md > Lo que ya existe` nombra `lib/config/moneda.ts` y explica que configura el
  formato de la moneda, no el país.

### Regresiones, verificado ejecutando
- `pnpm run typecheck`: exit 0.
- `pnpm run test:guardias` con `DATABASE_URL` sin definir: 289 archivos, de los que 288 pasan. El
  único rojo es `dependencias-declaradas-presentes`, que está en `tests/baseline-rojos.json` y no es
  hallazgo. Entre los que pasan están `sin-integrador-de-ordenex`, `fuera-datos-ordenex`,
  `test-citado-desaparecido`, `gate-cableado-arnes-v2` y `dominio-ordenex-fuera`.
- En una primera corrida con `DATABASE_URL=` vacía salieron rojos `zona-central-guarda-y-rastro` y
  `zona-guardado-conserva-inactivos` («client password must be a string»). Fue un artefacto de mi
  variable vacía: sin definirla pasan, con 19 passed. Ninguno de los dos archivos está en el diff
  contra `dev`.

### Menores nuevos
- **m5 — menor:** el gate de la bitácora se corrió después de un `touch -r node_modules pnpm-lock.yaml`.
  Es inocuo, porque `dev` no cambió `pnpm-lock.yaml`: solo quitó tres scripts `db:seed:*` de
  `package.json`, así que no hay dependencias que instalar. Aun así, un `touch` que silencia el aviso
  de `init.sh` debería anotar ese porqué en la bitácora.
- **m6 — menor:** la base local `servi_logistic_sl13` conserva dos filas de `_prisma_migrations` de
  migraciones que retiró SL-11. Cuando el humano dé su consentimiento, se limpia con un
  `migrate reset`. No afecta al repositorio.

m1 (E2E de `mis-asignaciones`) sigue en manos del leader.
