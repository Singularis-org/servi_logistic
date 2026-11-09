# Review SLT-46 «Geografía jerárquica: administración de países»

- Fecha: 2026-11-09 · reviewer · ruta completa (requirements + design + tasks).
- Alcance: solo el diff de SLT-46, `44d5d02e..c7a89639` (rama apilada sobre SLT-45 «Geografía jerárquica: API v1/v2 y carga masiva»).
- Grafo de código: no usado (MCP sin este worktree indexado); revisión con Grep/Read y ejecución.

## Veredicto: **CAMBIOS** (RECHAZADO)

Un bloqueante: un test existente en rojo determinista dentro del diff. El resto está bien; los puntos de
diseño son menores o esperan decisión humana.

## Checklist

- [x] **Trazabilidad R1–R63.** El mapa de T9.1 (`progress/impl_SLT-46.md > Mapa R<n> → test consolidado`)
      lleva cada R a tests concretos. Comprobé que existen y que corren en verde los de base de datos (abajo).
      R45 y R52 son de proceso y tienen su evidencia: el diff no toca `e2e/`, y la aprobación de la
      maqueta `d74b64ea` es anterior al primer commit de T6 (`8a424edb`).
- [x] **Tasks.** Todas en `[x]` menos T0.1. Su veredicto (`./init.sh`) queda en CI (`gate-completo`): no bloquea la review.
- [~] **Tamaño del PR.** `scripts/tamano-pr.mjs` no existe en este worktree y `docs/gate.md` no tiene la
      sección «Tamaño del PR». No se puede verificar (ver m7).
- [x] **Migraciones (R8, R9, R10).** Son tres y todas traen `down.sql`:
  - enum: tres `ADD VALUE IF NOT EXISTS`, con `down` no-op explicado;
  - trigger de copia: `CREATE FUNCTION` + `CREATE TRIGGER`, con `down` que hace `DROP` de ambos;
  - `CREATE OR REPLACE FUNCTION pais_tipos_de_nivel`, con `down` que vuelve al cuerpo de SLT-43.

  No tienen DML suelto: solo dentro de los cuerpos `$$`. Ninguna toca `orden`.
- [x] **Copia nodo → geografía vieja sin bucle (R2–R7).**
  - El upsert usa `ON CONFLICT (id) DO UPDATE … WHERE … IS DISTINCT FROM`.
  - Un cambio de profundidad en 1–3 sale con `RAISE … 'SLT46'`.
  - `DELETE` en 1–3 borra también la fila vieja.
  - Profundidad > 3 no hace nada.

  `slt46-nodo-copia-vieja` está en verde (incluye `pg_trigger_depth ≤ 3`).
- [x] **Equivalencia CR (R11, R12, R13).** `slt46-equivalencia-geografia` (con contraprueba) y
      `geo-equivalencia-geografia` en verde. Las diferencias visibles de CR están en m3 y en D1–D3.
- [x] **Autorización en el service (R39).** `GESTION_ROLES.has(actor.rol)` es la primera línea de cada método
      de `PaisService` (incluidos `renombrarTipo`, `agregarNivel` y `reordenarTipos`), de `GeografiaService`
      y de `CargaDivisionService`. Hay tests con un repositorio que falla si se le llama, más la contraprueba.
- [x] **Dependencias.** Solo entran `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0` y `@dnd-kit/utilities@3.2.2`,
      con versión exacta, y la transitiva `@dnd-kit/accessibility`. Tienen fila `aprobada` como excepción
      al check 2 en `docs/dependencias.md`. `guard-dependencias-aprobadas` en verde.
- [x] **Reglas del proyecto (perfil reviewer).**
  - No hay tabla de negocio nueva sin `organizacion_id` ni sin RLS (las tablas de plataforma no cambian).
  - Ninguna migración sale sin `down.sql`.
  - No hay literal de país en código nuevo: la única mención de «Costa Rica» está en un JSDoc.
  - Nada de Ordenex.
  - Los comentarios explican el porqué.
- [x] **Accesibilidad básica.**
  - La manija es un `<button>` con `aria-label` «Mover <nombre>, posición k de N», ocupa 44 px y tiene `focus-visible`.
  - El foco vuelve a la manija tras mover, y hay una región `aria-live`.
  - Las acciones del árbol son botones con `aria-label` («Renombrar/Retirar/Reactivar <nombre>», chevron con `aria-expanded`).
  - Ningún `div`/`span`/`li` lleva `onClick`.
  - El aviso de cambio concurrente usa `role="alert"`.
- [x] **Pantalla frente a la maqueta aprobada (decisiones del 2026-11-09).**
  - Arrastre con @dnd-kit (puntero y `TouchSensor`), y con el teclado por la manija enfocada (ArrowUp/ArrowDown), sin flechas visibles.
  - Modal antes → después en toda escritura, más «Disponible» y CSV (P11).
  - Título «Niveles N (máximo 10)»: no deja quitar filas con 2 ni agregar con 10.
  - Casilla «Disponible para crear empresas» desmarcada y enviada siempre.

  El cotejo visual fino (textos de botones y títulos de modales) no se puede hacer contra el lienzo desde aquí (ver D3).
- [x] typecheck: `tsc --noEmit` → exit 0.
- [x] lint: `eslint` de los `.ts/.tsx` del diff → 0 errores, 1 warning en `geografia-alta.test.ts:102`, anterior a SLT-46.
- [ ] **Tests relacionados en verde.** Ver B1.

### Lo que corrí (base local `logistic_slt46`, `--maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=8192`)
- Unit, componentes y guardias del diff (109 archivos): `1 failed | 108 passed` · `Tests 1 failed | 2289 passed (2290)`.
  El rojo es B1.
- Integración SLT-46: 12 archivos, 89/89 en verde. Son `slt46-nodo-copia-vieja`, `migracion-slt46-ida-y-vuelta`,
  `slt46-equivalencia-geografia`, `slt46-pais-tipos-de-nivel`, `pais-alta-tipos`, `geografia-cambio-concurrente`,
  `pais-reordenar-tipos`, `geografia-superadmin-sin-empresa`, `geografia-admin-n-niveles`, `pais-agregar-nivel`,
  `pais-tipos-edicion` y `geo-equivalencia-geografia`.
- Integración existente tocada: 7 archivos, 72/72 en verde. Son `pais-disponible`, `pais-repositorio`, `carga-division`,
  `carga-division-n-niveles`, `geografia-registro-accion`, `geo-lecturas-catalogo` y `migracion-slt43-ida-y-vuelta`.
- `guard-dependencias-aprobadas` y `etiquetas-geograficas-sin-literal`: 8/8 en verde.

## Hallazgos

### BLOQUEANTE

**B1. `tests/unit/components/geografia-plataforma-page.test.tsx` está en rojo determinista.**
- Falla en «R23, R42 — alta de país eligiéndolo del catálogo › el envío lleva el id elegido y los niveles en orden, sin nombre de país».
- La causa es T6.6 (R63): la pantalla manda ahora `disponible: false` siempre, y este `toHaveBeenCalledWith({ id: "SV", tipos: [...] })` no se actualizó.
- T6.6 solo ajustó `GeografiaPlataformaAltaPais.test.tsx`. Este archivo se le pasó, y la verificación de T6.6 y la de T9.1 no lo corrieron.
- Reproducido aislado con `-t "el envío lleva el id elegido"`: `expected … { id: 'SV', …(1) }`, recibido con `"disponible": false`.
- No está en `tests/baseline-rojos.json`.
- Qué falta:
  - añadir `disponible: false` al objeto esperado, con R63 como respaldo (misma corrección que ya se hizo en `GeografiaPlataformaAltaPais.test.tsx`);
  - registrarlo en «Aserciones existentes que cambian» de T6.6;
  - volver a correr `geografia-plataforma-page.test.tsx` entero.

### menor

- **m1. Design y tasks desactualizados respecto de P11–P13 y el arrastre.** Lo que falta corregir:
  - `design.md:12-13`: dice «Abiertas P11–P13… arrastre nativo, sin táctil».
  - `design.md:45` («Lo que ya existe»): dice «No se añade librería: arrastre nativo».
  - `design.md:475-476`: describe eventos `draggable/dragstart/drop` nativos.
  - `design.md:486`: dice «ninguna librería nueva (arrastre nativo, §12)».
  - `design.md:506`: dice «P11 (abierta)».
  - `design.md:671` (§12): sigue con el arrastre nativo como elección.
  - `tasks.md:11` y `tasks.md:190` (T6.4): dicen «arrastre nativo».
  - `requirements.md > Preguntas abiertas`: sigue listando P11–P13 como abiertas, aunque el humano las cerró el 2026-11-09 (`progress/features/SLT-46.md`) y no tienen fila en `## Decisiones cerradas`.
  - R58 no nombra «Disponible» ni el CSV, aunque P11 lo decidió y la pantalla lo hace.

  El código sigue las decisiones del humano; lo que falta es alinear el papel.
- **m2. §4.7 frente al código en el cambio concurrente.**
  - §4.7 dice que el modal se cierra y hace `router.refresh()`.
  - `ConfirmarCambio` deja el modal abierto, con aviso `role="alert"`, solo con «Cerrar» y con `refresh()`.
  - El texto del aviso es el del leader, no el de §4.7.
  - Cumple R61 («la pantalla DEBE avisar…»), pero el respaldo es un pedido del leader en T6.5, no una decisión humana anotada. Ver D2.
- **m3. Cambios de vocabulario visibles en CR frente a R12.**
  - «Desactivar/Activar/Inactivos» pasa a «Retirar/Reactivar/Retirados».
  - Desaparece el chip «Inactivo por su <nivel>» (el nombre se muestra atenuado).
  - Los botones pasan a «Sí, crear/renombrar/retirar/reactivar».
  - El confirmar del retiro ya no se bloquea mientras cuenta.

  R12 habla de desenlace (status, campos de error y mensajes del servidor) y de las filas viejas. Esos no
  cambian, y los tests de backend y de equivalencia lo cubren. Son textos de pantalla que vienen de la
  maqueta aprobada y del modal (R58), pero cambian lo que ve un superadmin de CR. Ver D1.
- **m4. `ok` sin `nivel` en renombrar, retirar y reactivar.**
  - Se acepta: el campo no se puede representar a N niveles (§4.1 quita `nivel` de la entrada, §4.6 introduce `profundidad`, R14).
  - Ningún consumidor de `app/` lee `res.nivel`.
  - Solo falta escribirlo en §4.3 (la forma del `ok`) para que el respaldo no sea derivado.
- **m5. `fieldErrors.formato` para la forma vieja.** Se ajusta a la decisión humana del 2026-11-09:
  - falta de nombre da `fieldErrors.nombre`;
  - una forma vieja da «formato no válido», no `fieldErrors.entrada`.

  Lo prueban `tests/unit/types/geografia-nodo.test.ts:254-269` y `geografia-plataforma-action.test.ts:880`.
  §4.1 no menciona la clave `formato`: conviene escribirla.
- **m6. Otras desviaciones registradas por el implementer.** Son razonables y conviene llevarlas a design:
  - la etiqueta del historial va de la hoja a la raíz (§7 dice raíz → nodo; se eligió así para no cambiar el texto de CR);
  - `TipoNivelDTO` lleva `digitosCodigo` y `codigoHeredaPrefijo`;
  - `CargaDivisionService` lee la división antes de mirar la cabecera, así que con un país inexistente y una cabecera mala responde `not_found`;
  - `geo-lecturas-catalogo` compara ahora con la lectura de hoy proyectada a nodos (un helper local del test, sin nada de `app/`): correcto.
- **m7. El tamaño del PR no se puede verificar.** `node scripts/tamano-pr.mjs` → `MODULE_NOT_FOUND`, porque el script no
  existe en este worktree. El diff tiene 96 archivos, +15 477/−2 854 (incluye spec, bitácora y tests). Si la
  regla existe en `dev`, el leader debe correrla allí o anotar `<!-- tamano-pr-aceptado: … -->`.
- **m8. Etiqueta incoherente en el mapa R → test.** R39 cita `geografia-plataforma-page.test.tsx › «R21 — la puerta, antes de leer»`,
  la etiqueta R21 de SL-20. Es correcta como prueba, pero conviene aclararlo.
- **m9. Cobertura débil anotada en la auditoría de la tanda 2.** En `geografia-cascada-reversible` y `geografia-renombrado`,
  los casos «en los tres niveles» quedaron como 3 `expect` idénticos (se pierde la cobertura por nivel). Lo
  compensan los tests nuevos a N niveles. No bloquea.

## Puntos que necesitan decisión humana

- **D1 (R12, CR).** ¿Se aceptan en Costa Rica los cambios visibles de m3?
  - «Desactivar/Activar/Inactivos» pasa a «Retirar/Reactivar/Retirados».
  - Desaparece el chip «Inactivo por su <nivel>».
  - Los botones pasan a «Sí, …».

  Si se aceptan, conviene anotarlo en `## Decisiones cerradas` como alcance de R12 (desenlace del servidor, no textos de pantalla).
- **D2 (§4.7).** ¿El modal de cambio concurrente se queda abierto con el aviso y solo «Cerrar» (lo que hay), o se cierra
  y avisa fuera (lo que dice §4.7)? Según la respuesta, se actualiza §4.7 o el componente.
- **D3 (R52).** Cotejo final de los textos con la maqueta v7: títulos de los modales, «Sí, cambiar», «Sí, cargar»,
  «Columnas del CSV:», y «Quitar» oculto en vez de deshabilitado. Necesita el lienzo, que el reviewer no puede abrir.
- **T0.1.** Su veredicto queda en el check `gate-completo` de CI del PR a `dev` (no es decisión, es recordatorio).

## Para la vuelta 2
Corregir B1. m1, m2 (tras D2), m4 y m5 son ediciones de spec y pueden ir en la misma tanda. Hay que volver a correr
`tests/unit/components/geografia-plataforma-page.test.tsx` y `tests/components/GeografiaPlataformaAltaPais.test.tsx`.
