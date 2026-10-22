# SL-34 — Tasks

> Orden: T0 → T1 → T2 → (T3 ‖ T4 ‖ T5) → T6 → T7 → T8. Un commit por task.
> **Ningún valor vigilado se escribe en un archivo del repo, en `progress/` ni en un mensaje de
> commit.** Los scripts de un solo uso viven en el scratchpad y se borran al terminar. Esta rama no
> se empuja a un remoto público: el leader publica una rama huérfana.

- [x] **T0. Punto de partida.** El worktree está sobre `dev` (`55f18ac` o posterior), y `./init.sh`
  termina con código 0.
  **Hecho cuando:** `INIT_EXIT=0` queda escrito dentro del log.

- [x] **T1. Medir y calcular los hashes** (depende de T0). Volver a medir el inventario de
  `design.md` en todo el árbol, incluidos los falsos positivos de forma. Con un script de un solo
  uso, fuera del repo, calcular el SHA-256 y el largo de los 8 vigilados, leyéndolos de las líneas
  actuales. Contar el suelo de archivos del universo.
  **Hecho cuando:** `progress/impl_SL-34.md` tiene, sin ningún valor, la tabla por archivo y línea
  con su clase, los 8 pares `(clase, largo, sha256)` y el suelo. El script queda borrado.

- [x] **T2. La guardia, primero en rojo** (depende de T1). Crear
  `tests/unit/guards/recursos-origen-fuera.guardia.test.ts` según `design.md > La guardia`, con:
  - el universo y `VIGILADOS`;
  - las formas, y `lineasConDominio` y `EXCEPCIONES_DOMINIO` importados de la guardia de SL-14;
  - la lista propia de excepciones, vacía;
  - el reporte que no imprime el valor;
  - la autoprueba sobre su propio archivo, el suelo y las contrapruebas;
  - el caso R18.

  **Hecho cuando:**
  - `pnpm exec vitest run tests/unit/guards/recursos-origen-fuera.guardia.test.ts` sale en rojo
    listando exactamente las ubicaciones de T1, como `ruta:línea · clase`, sin ningún valor en la
    salida;
  - las contrapruebas pasan;
  - con `RECURSOS_ORIGEN_REF`, R18 pasa.

- [x] **T3. [P] `specs/`** (depende de T2). Reescribir las líneas del inventario «En `specs/`» con sus
  marcadores. En `86`, `288`, `404`, `406` y `426`, después de cambiar el dominio, quitar sus 6
  entradas de `EXCEPCIONES_DOMINIO` en `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts`.
  **Hecho cuando:**
  - la guardia nueva no informa nada bajo `specs/`;
  - `pnpm exec vitest run tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` sale en verde,
    con el caso «ninguna entrada sobra» incluido (R19).

- [x] **T4. [P] Docs del perfil y del plan** (depende de T2). Reescribir la regla de seguridad sin
  los ids (R12) en `docs/perfil-agentes.md`, `docs/verification.md`, `docs/plan-saas.md` y
  `docs/limpieza-ordenex.md` §5. Cada uno conserva su marcador `<!-- perfil: … -->`, si lo tiene.
  **Hecho cuando:**
  - la guardia nueva no informa nada en `docs/`, fuera de las excepciones de SL-14;
  - cada uno de los 4 docs sigue diciendo que el agente PARA si un `.env` o un MCP apunta a un
    proyecto Supabase de la app de origen, y dónde están sus ids;
  - `pnpm exec vitest run tests/unit/guards/no-embalaje.test.ts tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts`
    sale en verde.

- [x] **T5. [P] `progress/` y el comentario del test** (depende de T2). Reescribir:
  - `progress/impl_SL-11.md`, `progress/impl_SL-13.md`, `progress/review_SL-10.md`,
    `progress/impl_SL-14.md` y `progress/review_SL-14.md`;
  - la l. 10 de `tests/unit/guards/pwa-servida-sin-sesion.guardia.test.ts`, que es un comentario.

  **Hecho cuando:** la guardia nueva no informa nada en esos archivos y `pwa-servida-sin-sesion`
  sigue en verde.

- [x] **T5b. El integrador y sus clientes** (R23; depende de T2). Medir con un script las
  apariciones de los términos de SL-13 en todo el árbol, sin imprimirlos. Reescribirlas en su línea
  con los marcadores de `design.md > Ampliación R23`. Añadir los términos a `VIGILADOS` por hash,
  con n-gramas de tokens, y pasar `TERMINOS_PROHIBIDOS` de la guardia de SL-13 a hashes.
  **Hecho cuando:**
  - la guardia nueva no informa ninguna aparición de las clases `integrador` ni `cliente`, salvo la
    excepción temporal del slug;
  - `pnpm exec vitest run tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts` sale en
    verde;
  - un script comprueba que ningún archivo versionado contiene los términos en claro, salvo el slug.

- [x] **T6. La guardia en verde, y las ediciones son de línea** (depende de T3, T4 y T5). Correr el
  script de `design.md > Reglas de edición` sobre `git diff dev...HEAD`.
  **Hecho cuando:**
  - la guardia nueva sale en verde;
  - en cada archivo editado, las líneas añadidas son tantas como las quitadas, y las citas y los
    `R<n>` no cambian;
  - no hay archivos borrados, y el resultado (sin valores) queda en `progress/impl_SL-34.md`;
  - este comando sale en verde:
    `pnpm exec vitest run tests/unit/guards/test-citado-desaparecido.guardia.test.ts`.

- [x] **T7. Comprobar que muerde, y cuánto tarda** (depende de T6). Aplicar estas mutaciones una a
  una en un archivo **sin versionar** (dentro de `specs/` y, otra vez, dentro de `docs/`). Ver cada
  una en rojo y borrar el archivo:
  1. un valor real tomado de `RECURSOS_ORIGEN_REF` (R1–R4, R9);
  2. un subdominio de vercel.app (R5);
  3. el dominio en una ruta sin excepción (R6);
  4. un email en un dominio no reservado (R7);
  5. un JWT inventado (R8);
  6. un valor real en un comentario de la propia guardia (R14);
  7. una excepción propia que no cubre nada (R16);
  8. el suelo por encima de lo medido (R17).

  Medir también el tiempo de la guardia sobre todo el árbol. La guardia y el gate no corren a la vez
  que las mutaciones.
  **Hecho cuando:** `progress/impl_SL-34.md` lista cada mutación con su caso en rojo, y la salida de
  la mutación 1 **no** contiene el valor (R15). El tiempo queda escrito, y si pasa de 20 s se aplica
  la caché de `design.md`. `git status` queda limpio.

- [x] **T8. Gate y trazabilidad** (depende de T7). Correr `./init.sh` (R22) y comprobar R21 con
  `git diff --name-only dev...HEAD`:
  - no hay archivos de `arnes.manifest`;
  - fuera de las líneas reescritas, solo están la guardia nueva, la poda de SL-14 y
    `progress/impl_SL-34.md`.

  Revisar que ningún mensaje de commit lleva un valor. Escribir el mapa `R<n> → test`.
  **Hecho cuando:** `INIT_EXIT=0` queda en el log y el mapa cubre de R1 a R22.

## Mapa R → test (previsto)

| R | Test |
|---|---|
| R1–R9, R13–R18 | `tests/unit/guards/recursos-origen-fuera.guardia.test.ts` |
| R12 | la misma guardia (sin ids en los 4 docs) y la revisión del texto de la regla en T4 |
| R19 | `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` |
| R20 | `test-citado-desaparecido`, `no-embalaje`, `sin-integrador-de-ordenex`, `pwa-servida-sin-sesion` y el resto de la suite que lee `specs/` |
| R10, R11, R21 | revisión del diff en T6 y T8 (reviewer) |
| R22 | `./init.sh` |
| R23 | `tests/unit/guards/recursos-origen-fuera.guardia.test.ts` (clases `integrador` y `cliente`) y `tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts` |

## Archivos esperados

- `tests/unit/guards/recursos-origen-fuera.guardia.test.ts`
- `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts`
- `tests/unit/guards/pwa-servida-sin-sesion.guardia.test.ts`
- `docs/perfil-agentes.md`
- `docs/verification.md`
- `docs/plan-saas.md`
- `docs/limpieza-ordenex.md`
- `progress/impl_SL-11.md`
- `progress/impl_SL-13.md`
- `progress/impl_SL-14.md`
- `progress/review_SL-10.md`
- `progress/review_SL-14.md`
- `progress/impl_SL-34.md`
- `specs/172-liquidacion/tasks.md`
- `specs/215-reintento-en-cierre/tasks.md`
- `specs/215-reintento-en-cierre/design.md`
- `specs/215-reintento-en-cierre/requirements.md`
- `specs/484-puntero-gestion-colgado/tasks.md`
- `specs/SL-11-fuera-zonas-y-seeds-ordenex/design.md`
- `specs/SL-13-fuera-nuform/requirements.md`
- `specs/SL-13-fuera-nuform/design.md`
- `specs/160-badge-intentos-entrega/requirements.md`
- `specs/160-badge-intentos-entrega/design.md`
- `specs/92-optimizacion-ruta-mensajero/credenciales-google.md`
- `specs/235-ayuda-tienda-estatus/tasks.md`
- `specs/284-pwa-correcta/requirements.md`
- `specs/86-landing-publica/requirements.md`
- `specs/288-variables-plantilla-desde-catalogo/design.md`
- `specs/404-mensajero-en-webhook-y-api/design.md`
- `specs/406-enlace-evidencias-webhook-identificador/design.md`
- `specs/406-enlace-evidencias-webhook-identificador/tasks.md`
- `specs/426-api-401-json/requirements.md`
- `specs/44-wallet-pago-mensajeros/tasks.md`
- `specs/57-logout/design.md`
- `specs/SL-34-specs-sin-recursos-origen/requirements.md`
- `specs/SL-34-specs-sin-recursos-origen/design.md`
- `specs/SL-34-specs-sin-recursos-origen/tasks.md`
