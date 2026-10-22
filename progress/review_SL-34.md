# Review SL-34 «Quitar de specs/ las referencias a recursos reales de la app de origen»

Rama `feature/SL-34-specs-sin-recursos-origen`, HEAD `0051621`, base `dev` `8cdbd44` (merge-base =
`dev`, así que `dev..HEAD` y `dev...HEAD` coinciden). 93 archivos: 87 modificados, 6 añadidos y 0
borrados. Reviewer, 2026-10-22. Ningún valor vigilado aparece en esta review: se nombran por su clase.

Decisiones del leader que se dan por cerradas:
- SL-16 para los dos emails y SL-27 para el slug de SL-13;
- las diez cadenas de SL-13 con guardia por hash;
- el spec de SL-13 no se edita (frase «exactamente dos» de su R2).

## Verificación que corrí yo

- **Valores de la referencia local** (18 valores en 9 clases). Usé un script del scratchpad que solo
  cuenta: no imprime ningún valor ni el texto de ninguna línea. Compara sin distinguir mayúsculas, en
  crudo y con separadores normalizados, y descuenta las apariciones dentro del slug de SL-13.

  | Dónde | Apariciones | Fuera del slug de SL-13 |
  |---|---|---|
  | líneas `+` de `dev..HEAD` (2.301) | 10, todas clase integrador | **0** |
  | líneas `+` de `dev...HEAD` | 10, todas clase integrador | **0** |
  | mensajes de commit `dev..HEAD` | 0 | **0** |
  | árbol final, contenido (6.190 rutas, 29 binarios) | 31, todas clase integrador | **0** |
  | árbol final, rutas | 3, todas clase integrador | **0** |

  Lo que queda está dentro del slug de la ficha SL-13, que es la excepción temporal aceptada (SL-27).
  El contador se autocomprobó sobre las líneas `-` del mismo diff: encuentra las 9 clases, con 23
  apariciones de supabase-ref, 12 de gcp y 80 de cliente, entre otras.
- **R10 (ediciones de línea).** Script propio sobre `git diff -U0 dev...HEAD`. Quedan fuera las
  guardias editadas, el módulo nuevo, el spec de SL-34 y la bitácora. Resultado:
  - 84 archivos y 210 pares `-`/`+`;
  - cada hunk tiene tantas líneas quitadas como añadidas;
  - en cada par se conservan las mismas citas `tests/…`/`e2e/…` y los mismos `R<n>`;
  - **0 fallos** y 0 borrados.
- **R21.** Ningún archivo del diff está en `arnes.manifest`. Lo crucé con las entradas exactas y miré
  aparte las de carpeta (`.claude/*`).
- **Guardias.** Corrí `recursos-origen-fuera`, `sin-integrador-de-ordenex`, `dominio-ordenex-fuera`,
  `no-embalaje`, `pwa-servida-sin-sesion` y `test-citado-desaparecido`:
  - sin la variable: 6 archivos, 82 tests en verde y 1 omitido («R18 omitido»);
  - con `RECURSOS_ORIGEN_REF`, las dos guardias por hash: 47 de 47 en verde, R18 incluido.
- **Tests tocados por el diff.** Los 27 archivos `tests/**/*.test.ts`: 425 en verde y 16 omitidos
  (integración, sin base de datos).
- **`vitest related`** sobre `lib/types/plantilla-datos.ts` y `e2e/marca.spec.ts`: 239 archivos en
  verde y 6 omitidos, con 3.358 tests.
- `pnpm run typecheck`: `TC_EXIT=0`. eslint sobre los `.ts`/`.tsx` añadidos o modificados:
  `LINT_EXIT=0`.
- Finales de línea: LF en los 6 archivos nuevos.
- Docs de R12: las líneas `+` de los 4 docs dicen qué hacer y cuándo parar (PARA), y remiten a la
  memoria local del leader sin dar ids.
- `e2e/marca.spec.ts`:
  - `prohibida` pasa de string a boolean, y su único uso es `if (prohibida)`, así que el
    comportamiento no cambia;
  - los dos hashes son los mismos que los de `VIGILADOS`, y R18 con la referencia confirma que
    corresponden a los valores;
  - el E2E no se corrió, ni lo corrió nadie.
- No corrí `./init.sh` ni la suite completa. R22 se apoya en el log de T8 de la bitácora
  (`INIT_EXIT=0`).

## Trazabilidad

| Req | Test | Verificado por mí |
|---|---|---|
| R1–R4, R9 | `recursos-origen-fuera` › «R1-R9, R23», por hash, + mutación 1 de T7 | verde; el contador da 0 en el árbol |
| R5 | ídem, clases `vercel`/`supabase-host`/`supabase-pooler` + mutación 2 | verde |
| R6 | ídem, `dominio` con el detector de SL-14 importado + mutación 3 | verde |
| R7 | ídem, `email` + mutación 4 | verde |
| R8 | ídem, `secreto-*` + mutación 5 | verde |
| R10, R11 | script de reglas de edición + contrapruebas de marcadores | mi script: 0 fallos |
| R12 | la guardia (0 ids en los 4 docs) + revisión del texto | sí |
| R13, R17 | «R13/R17: el universo no baja del suelo firmado», 64 hex, contrapruebas + mutación 8 | verde |
| R14 | «R14: el propio archivo…» + mutación 6 | verde |
| R15 | reporte `ruta:línea · clase` | leído en el código: nunca imprime el token |
| R16 | «ninguna excepcion propia sobra», `excepcionesDeTerminoSobrantes`, `FICHA_VALIDA = ^SL-\d+$` + mutación 7 | verde |
| R18 | caso R18 con la variable; omitido y nombrado sin ella | verde en los dos modos |
| R19 | `dominio-ordenex-fuera` (sin las 6 entradas de `specs/` ni `SL27`) | verde |
| R20 | `test-citado-desaparecido`, `no-embalaje`, `sin-integrador-de-ordenex`, `pwa-servida-sin-sesion` | verde |
| R21 | diff contra `arnes.manifest` y lista de añadidos | sí (ver hallazgo 3) |
| R22 | `./init.sh`, `INIT_EXIT=0` en la bitácora | no lo corrí |
| R23 | «R23: los diez terminos…» + la guardia de SL-13 por hash + mutación de T5b | verde; 0 en claro fuera del slug |

## Desviaciones del diseño

1. **`github-url` solo para el repo de origen.** R4 dice «al repositorio de origen», y el patrón
   genérico del diseño marcaba la URL del PR de la plantilla en `arnes.lock.json`, que escribe
   `arnes-sync.sh`. La cuenta de origen sigue vigilada por hash en cualquier token, así que una URL
   `github.com/<cuenta de origen>/<cualquier repo>/…` cae igual, por la clase `github`. El único hueco
   es un repo de origen alojado bajo otra cuenta cuyo nombre no lleve el nombre de la app. Es remoto,
   y el diseño tampoco lo cubría. **Aceptable.** (menor 1: el design no la recoge.)
2. **Clase `direccion`.** Amplía, no recorta: las tres cadenas de dirección quedan vigiladas con un
   nombre de clase honesto en vez de «cliente». No cambia R15 ni R16. **Aceptable.** (menor 1.)
3. **Lista blanca de `no-embalaje`.** Exceptúa dos archivos enteros del spec de SL-34 porque citan el
   nombre de archivo de esa guardia, igual que el precedente de `docs/limpieza-ordenex.md`. El agujero
   es pequeño, pero R21 no lo lista entre lo que puede añadirse, y a diferencia del precedente no
   lleva ficha que la retire. **Aceptable como menor** (hallazgo 3).
4. **`beforeAll` de 120 s.** Saca el barrido (~10 s solo, hasta ~18 s con carga) del `testTimeout`
   de cada caso, que es lo que dio el rojo de la primera corrida de T8. El conjunto vigilado no
   cambia y ningún caso pierde aserciones. El coste es que 120 s esconde una regresión de rendimiento
   grande, y el diseño pedía perfilar si pasaba de 20 s. **Aceptable** (hallazgo 4).

## Checklist `CHECKPOINTS.md`

- [x] requirements.md con R1–R23 en EARS.
- [x] design.md con 6 alternativas descartadas y su porqué.
- [x] tasks.md: T0–T8 y T5b en `[x]`.
- [x] `## Lo que ya existe` presente. El diff no re-crea nada: reutiliza `lineasConDominio` y
      `EXCEPCIONES_DOMINIO` de SL-14 importándolos, y el universo y el criterio de binarios de SL-13.
- [~] Assignee en Jira y rama por `wt.sh new`: no verificable desde aquí; lo comprueba el leader.
- [x] Cada R<n> mapea a un test o a una comprobación concreta.
- [x] Mapa R → test en `progress/impl_SL-34.md`.
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: pendiente del PR.
- [x] Flujo crítico: no toca ninguno. `e2e/marca.spec.ts` cambia una guarda de entorno con la misma
      semántica; no la corrí.
- [x] Dependencias: ninguna (`node:crypto`).
- [x] Secretos: el diff los quita. Las claves falsas de test se arman por partes.
- [x] `./init.sh` en verde según la bitácora (T8).
- [ ] Cierre de la ficha y desmontaje del worktree: tarea del leader.

## Checklist `docs/checkpoints-proyecto.md` y `docs/perfil-agentes.md > reviewer`

- [x] Sin tablas, queries, migraciones ni RLS que aplicar.
- [x] **Ningún recurso de Ordenex en el diff** (líneas `+`): 0 valores fuera del slug aceptado. La
      ficha existe justo para cumplir este punto.
- [x] Sin literales de país nuevos en código. Sin dependencia nueva. Sin `console.log`.
- [x] Comentarios con su porqué: el filtro `github-url`, la caché, el `beforeAll` y la poda.

## Hallazgos

1. **menor — el spec no recoge dos desviaciones.** `design.md` describe `github-url` sin la
   restricción al repo de origen y solo nombra las clases `integrador` y `cliente`; `direccion` no
   aparece. Tampoco dice que T5b creó `tests/unit/guards/_terminos-por-hash.ts`. Todo está en la
   bitácora, pero el design deriva del código. Conviene una línea en `design.md` o en
   `progress/features/SL-34.md`.
2. **menor — R21, al pie de la letra.** R21 dice que fuera de las líneas de R1–R9 y R12 solo se añaden
   la guardia nueva, la poda de R19 y la bitácora. El diff añade también:
   - `_terminos-por-hash.ts` y la reescritura de `sin-integrador-de-ordenex`, que exige R23 (posterior
     a R21);
   - la lista blanca de `no-embalaje`.

   No hay daño, pero el requisito quedó desactualizado frente a R23.
3. **menor — la lista blanca de `no-embalaje` es permanente.** Las dos entradas del spec de SL-34 no
   nombran ninguna ficha que las retire (la de `docs/limpieza-ordenex.md` sí: SL-27). La alternativa
   era citar «la guardia anti-embalaje» sin su nombre de archivo, pero el texto seguiría casando.
   Basta con anotarla como deuda.
4. **menor — 120 s de plazo para el barrido.** Medido en ~10 s. Si CI se acerca a 20 s, hay que
   perfilar antes de subir el plazo, como dice la bitácora. Que quede en `progress/deudas.md`, porque
   un plazo tan holgado no avisará solo.
5. **menor — `e2e/marca.spec.ts:73`.** Una sola línea larga con dos declaraciones encadenadas por
   coma, para cumplir R10 (misma cuenta de líneas). Es legible con esfuerzo y pasa el lint. El E2E que
   la ejecuta no se corrió en esta ficha: la equivalencia la probó el implementer con un script de
   10 casos.

## Nota de proceso (el reviewer)

Al inspeccionar el diff de `e2e/marca.spec.ts`, una orden mía mostró en mi salida de herramienta las
líneas `-` de ese archivo, que llevan los dos ids de Supabase de origen. Esa salida quedó solo en el
contexto local de esta sesión. No se escribió en ningún archivo ni en ningún commit, y esta review no
la contiene: mi contador da 0 sobre este archivo antes del commit. La historia de la rama ya lleva
esos valores en sus líneas `-`, y por eso el leader publica una rama huérfana.

## Veredicto

**OK** — 0 bloqueantes, 5 menores.
