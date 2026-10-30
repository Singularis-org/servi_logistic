# Review SLT-69 «Escáner rechaza guías asignadas después de abrir la pantalla»

Reviewer, 2026-10-30. HOTFIX: diff revisado `origin/prod...HEAD` (b31b6503..9c1c7e87), PR a `prod`.

## Checklist

- [x] Spec: `requirements.md` con R1-R11 en EARS; `design.md` abre con `## Lo que ya existe`
      (búsqueda real en board, specs y código) y tiene 4 alternativas descartadas con su porqué.
- [x] El diff no re-crea nada de lo listado en `## Lo que ya existe`: reutiliza la Server Action
      `listarMisAsignaciones` tal cual. El hook `useRefrescarAlVolver` es nuevo, y el design lo
      justifica: no había ningún listener de `visibilitychange`/`focus`.
- [ ] **Tasks: T1-T5 siguen `[ ]` en `tasks.md`, también en HEAD** → hallazgo B1.
- [x] Trazabilidad: el mapa `R<n> -> test` está en `progress/impl_SLT-69.md` y cada R1-R11 tiene
      un test concreto que aserta lo que pide (comprobado leyendo cada test).
- [x] Repro del bug, re-ejecutado por mí: `tests/components/useRecogerPorGuia.test.tsx` contra
      una copia del hook de `git show origin/prod:…/useRecogerPorGuia.ts` (en el scratchpad, sin
      tocar el worktree) → **7 failed | 2 passed**. R1/R2 falla con el toast «no está…»; los 2
      verdes son los R10 (el camino de siempre).
- [x] Mutaciones (en copias del scratchpad), todas muertas:
      - `procesando` encendido después de la relectura → cae R9.
      - Sin `catch` en la relectura → cae R5 (lanza).
      - Sin la rama `unauthenticated` → cae R5.
      - Sin la guarda de visibilidad → cae R8.
      - Sin el intervalo → caen 2 tests de R7.
      - Sin cleanup → cae R8 (desmontar).
      - Marca inicial en 0 → cae R7 (foco inmediato).
      - Sin actualizar la marca → cae R7.
- [x] Los 5 archivos de test tocados: 107/107 en verde (corrida mía). ESLint sobre los 8
      archivos tocados: sin problemas. En el log del gate: typecheck pasó, `== init OK ==`,
      `INIT_EXIT=0`.
- [x] Un solo toast por envío en todos los caminos: cada rama devuelve tras su único
      `toast.*`, y los tests R1/R3/R4/R5 asertan `toHaveBeenCalledTimes(1)` y que no hay un
      toast del otro tipo.
- [x] Sin doble envío: `setProcesando(true)` va antes de cualquier `await` (lo verifica R9 y la
      mutación lo confirma). Aguas arriba, `QrScanner` ya tiene su pestillo de primer
      decodificado y `EscanerGuiaCard` deshabilita los controles con `procesando`.
- [x] `procesando` siempre se libera: un único `try/finally` envuelve la relectura y la
      recogida. R5 (lanza / error / unauthenticated) aserta `procesando === false`.
- [x] Se conserva el comportamiento existente:
      - reserva para otro día (261): la misma `avisoReservaParaOtroDia`, también para la orden
        releída, y R4 aserta un literal escrito a mano;
      - el `switch` de resultados, intacto (R10 `conflict`, con literal);
      - el bloqueo (R11): sin botón ni input, y el texto del aviso es un literal;
      - los textos de los toasts no cambian.
- [x] Throttle de 30 s por foco/visibilidad (R7). Arranca en el montaje. La pantalla oculta y el
      desmontaje no releen (R8). Se monta también con bloqueo o con la lista vacía (R6, 3 tests).
- [x] Sin cambios en el servidor ni en la base: el diff solo toca
      `app/(app)/mis-asignaciones/_components/{useRecogerPorGuia.ts,RecogerModule.tsx}`,
      `hooks/useRefrescarAlVolver.ts`, tests y docs. No hay migración, query nueva ni action
      nueva, así que no aplican `organizacion_id`, RLS ni `down.sql`.
- [x] Los tests usan literales escritos a mano (guías, ids, textos, la fecha «31 de octubre»).
      Ninguna aserción se compara contra la función que genera su texto.
- [x] Tests existentes modificados (`RecogerModule.test.tsx`, `RecogerPaqueteCard.test.tsx`):
      solo se añadió el mock de `listarMisAsignaciones` y un caso nuevo. No se quitó ni se
      relajó ninguna aserción. El mock por defecto devuelve una lista sin la guía, así que los
      casos «no está…» siguen asertando el mismo desenlace.
- [x] Perfil del reviewer: no hay literales nuevos de país o moneda, ni rastro de Ordenex, ni
      dependencias nuevas. Los comentarios explican el porqué.
- [x] Seguridad y configuración: nada hardcodeado que cambie entre entornos (el 30 s es la
      decisión P2, aprobada por Carlos).
- [~] Flujo crítico `mis-asignaciones` (E2E): no se añadió un E2E. El design lo difiere con
      motivo y el spec está aprobado. `e2e/mis-asignaciones.spec.ts` ya recorre «Recoger
      paquete» por número de guía, y corre en CI en el PR a `prod` → hallazgo m2.
- [ ] Cierre de `progress/features/SLT-69.md`, PR y worktree: quedan para el leader después de
      este review (no cuentan contra el implementer).

## Hallazgos

- **B1 — BLOQUEANTE (de proceso, el arreglo es trivial).** `specs/SLT-69-escaner-lista-recoger-vieja/tasks.md`
  tiene T1-T5 sin marcar (`- [ ]`) en HEAD. `CHECKPOINTS.md > Especificacion` exige que todas
  estén en `[x]`. La bitácora dice que las cinco están hechas, y lo verificado lo respalda:
  T1 rojo, T2-T4 verdes y T5 con el gate en verde. **Qué falta:** marcar T1-T5 como `[x]` y
  commitearlo (`docs(SLT-69): …`). No hace falta ningún cambio de código.
- **m1 — menor.** R5 dice «cualquier otro fallo». La rama `forbidden` de la relectura cae en
  `vigente.status !== "ok"`, pero ningún test la ejerce: si alguien cambiara `!== "ok"` por
  `=== "error"`, todos los tests seguirían en verde. Añadir un caso `forbidden` al lado del de
  `error` lo cierra. No bloquea el hotfix.
- **m2 — menor.** Flujo crítico sin E2E nuevo. `docs/checkpoints-proyecto.md` pide un E2E y su
  salida local en `impl`. Se acepta como diferido por lo que dice el design (el caso exige dos
  sesiones simultáneas y el fallo es 100 % cliente), con una condición: el check `e2e` del PR a
  `prod` tiene que salir en verde, porque `e2e/mis-asignaciones.spec.ts` es el que vigila que
  el camino de siempre (R10) no se rompió.
- **m3 — menor.** En la tabla de `progress/features/SLT-69.md`, la columna estado dice
  `pending` aunque la feature está en curso. Lo corrige el leader al cerrar.

## Veredicto

**RECHAZADO**, solo por B1: las casillas de `tasks.md`, un cambio de documentación sin código.

El código y los tests no tienen ningún bloqueante. Con T1-T5 marcadas `[x]`, la vuelta 2 puede
acotarse a ese diff y sale **APROBADO CON MENORES** (m1-m3).
