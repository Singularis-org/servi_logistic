# Review: mejora del arnés «el paso 2 de init.sh mide las dependencias declaradas»

PR del proyecto #235 (rama `chore/arnes-dependencias-medidas`, HEAD revisado `c4888c6a`) y PR de la
plantilla singularis-co/harness_config#35. Diff: `git diff origin/dev...HEAD`. Fecha: 2026-11-18.

## Checklist

- [x] **Genérico.** Ni `scripts/verificar-dependencias.mjs` ni la guardia nueva ni el `init.sh`
  nombran servi_logistic fuera de comentarios. Solo `node:fs`/`node:path`.
- [x] **Sin `package.json`.** He ejecutado el paso 2 extraído entre sus marcadores en un directorio
  vacío: `WARN no hay package.json todavia`, exit 0. La rama `warn` sigue intacta.
- [x] **`node_modules` enlazado (worktree).** He ejecutado el paso 2 en este worktree, con
  `node_modules` como enlace a la raíz: `OK dependencias: 56 declaradas, todas presentes`, exit 0.
- [x] **Marcadores del paso 2 sin cambios.** El diff de `init.sh` no toca las líneas
  `# >>> PASO 2` ni `# >>> FIN PASO 2`. Las dos guardias usan las mismas cadenas.
- [x] **Las guardias, en verde.** `guard-dependencias-declaradas-presentes` y
  `guard-init-node-modules-enlazado` dan 2 archivos y 22/22 tests (base desechable).
- [x] **Mutación 1 (el verificador siempre dice «todas presentes»).** Cambié
  `if (resultado.faltantes.length === 0)` por `if (true)` y salieron 7 rojos: 6 del verificador
  y 1 del paso 2 ejecutado. Restaurado con `git checkout --`.
- [x] **Mutación 2 (`|| fail` del init.sh cambiado por `|| true`).** Sale 1 rojo: «con una
  dependencia ausente el paso corta en rojo». Restaurado.
- [x] **`arnes.manifest`** lista `scripts/verificar-dependencias.mjs` y
  `tests/guards/guard-dependencias-declaradas-presentes.test.ts`.
- [x] **`arnes.lock.json`** guarda los hashes de los 6 archivos subidos y la entrada `subidos` del
  #35. El dry-run (`./scripts/arnes-sync.sh`) da **0 mejoras locales**, y `--estado` dice
  «arnes al dia» (#32-#35 pendientes de merge allí).
- [x] **La guardia antigua está borrada.** No queda
  `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` ni su entrada en
  `baseline-rojos.json`. El comentario de `_consultas-en-vuelo.ts` ya apunta a la nueva. Las
  menciones que quedan están en `progress/` y `specs/` históricos y no se tocan.
- [x] **El PR de la plantilla (#35)** trae exactamente los 6 archivos del arnés del diff. Los he
  comparado uno a uno con la rama de #35: los 6 son IDÉNTICOS (sin contar CRLF).
- [x] **Typecheck (`tsc --noEmit`)** y **eslint** sobre los archivos tocados: verdes.
  `baseline-rojos.json` es JSON válido.
- [x] **Tamaño:** no aplica (rama chore).
- [ ] **El párrafo de `docs/gate.md` no inventa nada.** FALLA: ver B1.

## Hallazgos

### B1 — BLOQUEANTE: el relato histórico contradice el historial del repo (regla 6, «No inventes»)

Afirmaciones que entran en la plantilla y se copiarían a todos los proyectos:

1. «**En servi_logistic** (ficha 420, 2026-09-11)…». La ficha 420 no es de servi_logistic:
   - servi_logistic nace el 2026-10-22 (commit `86d70bf0`, «punto de partida»), y su key es SL-/SLT-;
   - `specs/420-…`, el verificador y la guardia antigua llegaron copiados en ese commit;
   - el `motivo` que esta misma rama borra de `baseline-rojos.json` decía «el init.sh **del
     producto de origen** (ficha 420…)».

   Es el incidente del proyecto de origen del arnés. El resto de `docs/gate.md` lo llama «el
   proyecto de origen».
2. «el sync del arnés 2.14.0 sobrescribió `init.sh` y perdió la llamada». El historial no lo
   respalda:
   - el `init.sh` de `origin/dev` no ha tenido nunca la llamada (`git log -S verificar-dependencias
     origin/dev -- init.sh` no devuelve nada);
   - tampoco la tenía antes del sync 2.14.0 (`9aa7e060~1:init.sh`);
   - el arreglo de SL-29 (`efef9c98`) se quedó en `origin/feature/SL-29-paso-dependencias-gate` y
     no es ancestro de dev;
   - la guardia ya estaba en el baseline desde el 2026-10-21 porque «el init.sh del arnes v2 no lo
     tiene».

   Que lo perdiera el 2.14.0 no está demostrado. Lo demostrado es que el arreglo nunca llegó a la
   plantilla.

Dónde está:
- `docs/gate.md:361` y `:367-369`;
- comentario de `init.sh:201` («servi_logistic, ficha 420»);
- `scripts/verificar-dependencias.mjs:3`;
- `tests/guards/guard-dependencias-declaradas-presentes.test.ts:3`, `:9-10` y `:263` («es lo que
  perdio el sync 2.14.0»).

Para cumplir:
- cambiar «servi_logistic» por «el proyecto de origen del arnés»;
- contar la pérdida con lo que dice el historial. Por ejemplo: «el arreglo se hizo en el proyecto y
  no llegó a la plantilla: el `init.sh` del arnés no lo traía y la guardia vivió en el baseline de
  rojos hasta que la mejora viajó».

Hecho eso, hay que volver a subir los 6 archivos para que #35 y el `arnes.lock.json` coincidan.

### m1 — menor: el texto de salida lleva una cifra del proyecto de origen

`verificar-dependencias.mjs:126` imprime en todos los proyectos
`(medido el 2026-09-11: ~1,7 s sobre un arbol ya instalado)`. Es una medición de otro proyecto,
mostrada en tiempo de ejecución. El texto es anterior a este diff, pero ahora viaja a la plantilla.
Mejor quitarlo o pasarlo a comentario.

### m2 — menor: el comentario del marcador nombra solo una guardia

`init.sh:182` dice «(lo ejecuta aislado tests/guards/guard-init-node-modules-enlazado.test.ts)»,
pero ahora las dos guardias dependen de los marcadores. Conviene nombrar las dos para que nadie los
toque pensando que solo hay una.

### m3 — menor: la referencia de sección es ambigua

`docs/gate.md > El gate tiene DOS niveles > Por que` (citada en el verificador y en la guardia)
cubre dos `### Por qué` bajo el mismo H2, en las líneas 45 y 305. El párrafo nuevo está en el
segundo.

### m4 — menor, operativo: no correr `--aplicar` hasta mergear el #35

Contra `main` de la plantilla, el dry-run marca 4 archivos «a bajar» y 2 «la plantilla ya no lo
trae: decide si borrarlo». Es el diseño del sync («si la plantilla rechaza… manda la plantilla»).
Pero un `--aplicar` antes del merge del #35 revertiría la mejora. No es un defecto de este PR.

## Veredicto

**RECHAZADO**, solo por B1. Todo lo técnico está bien:
- el código es genérico;
- la rama `warn` está intacta y el `node_modules` enlazado funciona;
- las guardias muerden (las 2 mutaciones dan rojo);
- el manifest, el lock y la plantilla cuadran.

Lo que falla es el relato del `docs/gate.md` y de los comentarios, que atribuye el incidente a
servi_logistic y la pérdida al sync 2.14.0 contra lo que dice el historial.

## Vuelta 2 (acotada a c9493766..HEAD)

HEAD revisado: `816a9b95`. Commits: `b7262982` (relato) y `816a9b95` (lock tras subir el #36).
Plantilla: #35 (`main` <- `...-0220`) y #36 (`...-0220` <- `...-0236`, head `04b2ee4c`), los dos abiertos.

### Checklist

- [x] **B1, atribución.** Ningún texto atribuye ya la ficha 420 a servi_logistic. Las 4 menciones
  dicen «proyecto de origen del arnés» (`docs/gate.md:361`, `init.sh:203`,
  `scripts/verificar-dependencias.mjs:3` y la guardia, línea 3). Las menciones de servi_logistic que
  quedan en `docs/gate.md:355`, `:396` e `init.sh:191` son anteriores al rango y hablan de incidentes
  propios (SLT-140/141, 2026-10-21). No las toca este diff.
- [x] **B1, relato.** Ya no se habla del «sync 2.14.0» en ninguno de los archivos. El texto nuevo
  dice lo que muestra el historial: «el arreglo se hizo en ese proyecto y nunca llegó a la
  plantilla: el `init.sh` del arnés no traía la llamada, y en los proyectos que heredaron la guardia
  esta vivió en el baseline de rojos desde el primer día». Lo mismo dicen la cabecera de la guardia
  y el comentario de la línea 265 («es lo que le faltaba al init.sh del arnes»).
- [x] **B1, sin nombres ajenos.** `grep -i ordenex` sobre los 4 archivos tocados no da nada, y
  tampoco aparece ningún otro producto ni cliente.
- [x] **m1.** Se ha quitado la línea impresa `(medido el 2026-09-11: ~1,7 s …)` de `veredicto()`.
  Ningún test la asertaba: las guardias siguen en verde.
- [x] **m2.** El comentario del marcador `# >>> PASO 2` nombra ya las DOS guardias. La cadena del
  marcador no cambia: las guardias, que recortan por ella, pasan.
- [x] **m3.** Las referencias `docs/gate.md > El gate tiene DOS niveles > Por que` se sustituyen
  por «`docs/gate.md`, párrafo «El paso 2 mide las dependencias»», que es único (línea 361). No queda
  ninguna referencia antigua en los 3 archivos.
- [x] **#36 frente al worktree.** `gh pr view 36`: 4 archivos (`docs/gate.md`, `init.sh`,
  `scripts/verificar-dependencias.mjs` y la guardia nueva). He bajado los archivos en el head
  `04b2ee4c` y comparado `git hash-object` con los del worktree: los 4 son blobs idénticos.
- [x] **#35 + #36 = los 6 archivos.** `compare main...04b2ee4c` da exactamente `arnes.manifest`,
  `docs/gate.md`, `init.sh`, `scripts/verificar-dependencias.mjs`,
  `guard-dependencias-declaradas-presentes.test.ts` y `guard-init-node-modules-enlazado.test.ts`.
  Los 6 son blobs idénticos a los del worktree. El sha256 (sin CR) coincide con los hashes de
  `arnes.lock.json`, y la entrada `subidos` del #36 lista los 4.
- [x] **`./scripts/arnes-sync.sh --estado`**: «#35 (6 archivos)» y «#36 (4 archivos)» constan como
  subidos y pendientes de merge. Ninguna línea dice «sin subir». El dry-run da
  `0 mejora(s) local(es)`.
- [x] **Las 2 guardias** (base desechable, con `con-desechable.cjs`): 2 archivos, 22/22.
  `bash -n init.sh`: OK.

### Hallazgos

- B1, m1, m2 y m3: **resueltos**.
- **m5 — menor, estilo.** El reflujo dejó líneas largas en `docs/gate.md:363` (119 columnas),
  `scripts/verificar-dependencias.mjs:64` y la guardia, línea 97. Es cosmético y no bloquea.
- **m6 — menor, operativo.** El #36 apunta a la rama del #35, no a `main`. Hay que mergear primero
  el #35. Si al mergearlo no se borra su rama, GitHub no re-apunta el #36 a `main`, y mergear el #36
  lo metería en una rama muerta. O se borra la rama del #35 al mergear, o se cambia la base del #36
  a `main` antes de mergearlo. Sigue en pie m4: nada de `--aplicar` hasta mergear los dos.

### Veredicto vuelta 2

**OK.** No hay bloqueantes.
