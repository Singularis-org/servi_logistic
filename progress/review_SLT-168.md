# Review SLT-168 «Escaneo continuo en las recogidas del mensajero»

Fecha: 2026-11-17. Ruta **completa** (frontend, medium). Rama `feature/SLT-168-escaneo-continuo-recogidas`,
diff `origin/dev...436aee8e` (merge-base `1b0565c2` = `origin/dev`). Sin servidor, esquema, permisos ni
dinero: la ruta completa es la que corresponde.

## Veredicto: **OK**

No hay hallazgos mayores. Hay 5 menores (abajo); ninguno bloquea.

## Checklist

- [x] **Ruta y spec:** están `requirements.md`, `design.md` y `tasks.md`. Requisitos en EARS: R595-R599
  heredados con su numeración y R830-R834 nuevos. Las decisiones de Carlos (2026-11-17) están en
  `progress/features/SLT-168.md`.
- [x] **Lo que ya existe** (`design.md:6-28`): la lista no está vacía y el diff reutiliza
  `sesion-escaneo`, `useSesionEscaneo`, `EscaneoContinuo` y `EscanerModal`. No vuelve a crear ninguno.
  `hooks/useSesionEscaneo.ts` no cambia.
- [x] **Trazabilidad:** cada R de R595-R599 y R830-R834 tiene un test que falla si se rompe. Lo
  comprobé con mutaciones (tabla abajo).
- [~] **Tasks:** T1-T7 están en `[x]`. T8 sigue en `[ ]`: su gate ya pasó (la anota el leader en
  `impl_SLT-168.md:123-125`) y le falta la prueba en Preview con Carlos, que va después del PR. Ver m3.
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` da 16/40 archivos, 345/1000 líneas de producción y
  1294/3000 de tests.
- [x] **Typecheck:** `tsc --noEmit -p .` → `TSC_EXIT=0`.
- [x] **Lint:** `eslint` sobre los `.ts`/`.tsx` del diff → exit 0.
- [x] **Tests:** `pnpm exec vitest run` sobre los 8 archivos del diff más la guardia 455 → 9 archivos y
  239 tests en verde.
- [x] **Flujo crítico** (recogida en `mis-asignaciones`): se ajustaron `e2e/mis-asignaciones.spec.ts` y
  `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` (b). No los corrí en local: por decisión del leader
  los cubre el job `e2e (reparto)` del CI, como en SLT-159, SLT-189 y SLT-191.
- [x] **Datos y seguridad:** no hay tablas, queries, migraciones, secretos, literales de país o moneda,
  dependencias nuevas ni referencias a Ordenex.
- [x] **Permisos:** `recogerAsignaciones` y `recolectarEnTiendaPorQr` no cambian. Sus guardas de
  servidor tampoco.
- [x] **Comentarios:** explican el porqué.

## Puntos pedidos por el leader

1. **Ni doble recogida ni lecturas perdidas.** Una relectura de la sesión no se reenvía (R831): la
   acción se llama una sola vez y la fila suma a «Repetidas». «Código inválido» y «No se pudo …» no
   suman. M-A pone 4 tests en rojo. Las tres lecturas seguidas (R595) salen en orden.
2. **Un solo refresco al cerrar, y nada pendiente se envía tras cerrar.**
   - M1: `onRecogida` pasa a ser `alCerrarConRecepcion`.
   - M2: `router.refresh` también pasa a `alCerrarConRecepcion`.
   - Si al cerrar quedan lecturas en vuelo, la guarda `cerrado` del hook (SLT-159, sin cambios) impide
     enviarlas.
   - Refrescar por lectura (M-B, M-C) o quitar el refresco (M-L, M-M) deja tests en rojo.
3. **Un solo disparador.** `EscanerModal` no cambia y no se añade ningún botón. Los tests de R833
   comprueban `getAllByRole("button", { name: "Escanear o escribir guía", hidden: true })` de longitud
   1, en Recoger y en Recolección.
4. **Variantes `dark:`.** El diff no añade clases. Los chips usan `COLOR_ESTADO` de SLT-159, que ya
   tiene la variante oscura.
5. **Guardia 455.** `git diff origin/dev -- tests/unit/guards/nombres-estado-retirados.guardia.test.ts`
   sale vacío y la guardia está en verde.
6. **Recepciones (R834).** Ningún archivo de recepciones aparece en el diff. Por defecto se usa
   `TEXTOS_RECEPCION`, y los casos de SLT-159 solo cambian una línea de `import`. M-H pone 11 tests en
   rojo.
7. **Acciones y guardas.** No hay cambios en `lib/actions`, `lib/services` ni `lib/repositories`.
8. **Reserva de la 261 (R599) y relectura de SLT-69.** Las dos siguen en `useRecogerPorGuia.ts`.
   Quitar la reserva (M-J) o la relectura (M-K) deja tests en rojo.
9. **Mutaciones propias.** Están en la tabla. Las restauré con `git checkout --`, sin `git stash`, y el
   árbol quedó limpio después de cada una.
10. **Tests reescritos.** Comparé los casos `it` de cada archivo contra `origin/dev`:

    | Archivo | Casos | Llamadas a `expect` |
    | --- | --- | --- |
    | `RecogerPaqueteCard` | 23 → 29 | 73 → 100 |
    | `RecoleccionModule` | 52 → 59 | 154 → 179 |
    | `RecogerModule` | 76 → 77 | 235 → 237 |
    | `EscaneoContinuo` | 9 → 11 | 47 → 55 |
    | `sesion-escaneo` | 9 → 16 | 20 → 37 |
    | `useRecogerPorGuia` | 9 → 10 | 47 → 36 |

    En `useRecogerPorGuia` bajan las llamadas a `expect` pero no se pierde nada: cada par «aviso del
    toast + `ok`» pasa a un único `toEqual` sobre el desenlace con el motivo literal, y se añade
    `sinToasts()`. Los negativos de la 261 contra el texto genérico de `conflict` se mantienen, ahora
    sobre la fila (`RecogerModule.test.tsx`, casos de la feature 261/R13).

## Mutaciones (reviewer)

| Mutación | Archivos de test | Resultado |
| --- | --- | --- |
| A doble recogida: `estadoAlLlegar` nunca frena la relectura | Card, Recolección | ROJO 4 |
| B M1 refresca por lectura (`onRecogida` tras cada `recoger`) | Card, RecogerModule | ROJO 7 |
| C M2 refresca por lectura (`router.refresh` tras cada `recolectar`) | Recolección | ROJO 5 |
| D envía tras cerrar (sin la guarda `cerrado`) | hook, Card, Recolección, RecogerModule | ROJO 1 (solo `useSesionEscaneo.test.ts`), ver m1 |
| E M2 `ya_recolectada` → éxito | Recolección | ROJO 4 |
| F M1 sin `textos` | Card | ROJO 14 |
| G M1 sin `resumen` | Card, useRecogerPorGuia | ROJO 3 |
| H textos por defecto = recogida (R834) | sesion-escaneo, EscaneoContinuo | ROJO 11 |
| I M1 `no_encontrada` → `no_se_pudo` | Card, useRecogerPorGuia | ROJO 5 |
| J M1 sin la reserva de la 261 | Card, useRecogerPorGuia | ROJO 3 |
| K M1 sin la relectura de SLT-69 | Card, useRecogerPorGuia | ROJO 4 |
| L M2 sin `alCerrarConRecepcion` | Recolección | ROJO 3 |
| M M1 sin `alCerrarConRecepcion` | Card, RecogerModule | ROJO 2 |
| N M2 `resumen` siempre `undefined` | Recolección | ROJO 2 |
| O M2 sin `textos` | Recolección | ROJO 20 |
| P guardias: M1 sin `<TarjetaEscaneoContinuo` | lectura-guia-unica, rutas-336 | ROJO 2 |
| Q M2 da el `resumen` de otra orden a una guía fuera de las listas | Recolección | ROJO 1 |
| R sin cadena única (dos envíos a la vez) | Card, RecogerModule, hook | ROJO 1 |

## Hallazgos

- **m1 (menor):** ningún test de M1 ni de M2 comprueba que, al cerrar con lecturas en vuelo, lo
  pendiente no se envía.
  - Con la mutación D solo cae `tests/unit/hooks/useSesionEscaneo.test.ts`, que es de SLT-159.
  - El hook es compartido y no cambia en este diff, así que la protección sigue cubierta. Aun así, un
    caso en `RecogerPaqueteCard.test.tsx` lo anclaría a la recogida, que cambia estados de órdenes.
- **m2 (menor):** quedan textos desfasados en la documentación.
  - `requirements.md:148-164`: «Preguntas abiertas» 1-3 siguen como abiertas y proponen
    «Recolectada»/«Recolectadas», aunque Carlos ya las cerró (`progress/features/SLT-168.md:24-25`).
    La sección «Preguntas abiertas» de `progress/features/SLT-168.md:28-30` tampoco se actualizó.
  - `progress/impl_SLT-168.md:43,49` dice «Recolectada» y «Ya recolectada» donde hoy es «Recogida en
    tienda» y «Ya recogida en tienda».
- **m3 (menor):** `tasks.md:36-40` se contradice: T7 dice «sin correr» y a la vez «Hecho: los dos E2E
  en verde en local». Además, T8 sigue en `[ ]`: le falta la prueba en Preview con Carlos, que va
  después del PR; conviene marcar ya la parte del gate.
- **m4 (menor):** en `tests/unit/guards/lectura-guia-unica.guardia.test.ts:112,130`, la regla
  `MONTA_TARJETA_CONTINUA` busca en el fuente con comentarios incluidos. Un comentario que contenga
  `<TarjetaEscaneoContinuo ` bastaría para pasarla. `rutas-336` usa `codigoSinComentarios`, y lo
  mismo valdría aquí.
- **m5 (menor, informativo):** los E2E ajustados no se corrieron en local. Según la decisión del
  leader los corre el CI (`e2e (reparto)`); hay que confirmar que esté en verde antes del merge.
