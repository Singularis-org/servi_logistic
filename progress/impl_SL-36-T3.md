# SL-36 · T3 (repositorios) y T5.5 (catálogo) — bitácora de backend_dev

> Parcial de T3 + T5.5. El implementer la funde en `impl_SL-36.md`. Sin commit (lo hace el leader).
> Base local propia de la feature (`DATABASE_URL` del scratchpad, nunca impresa).

## Archivos

Creados:
- `lib/types/integraciones.ts` (T5.5): servicios, estados, marcas PROVISIONALES (constante
  `MARCAS_INTEGRACION`), campos secretos, tipos de credencial / datos de prueba / datos públicos,
  zod `strictObject` de `datos_publicos` por servicio, motivos de prueba (comunes + WhatsApp + rutas)
  con su texto, códigos `prueba_fallida.<s>.<m>`, códigos de rechazo en uso (R30) con texto, campos
  del formulario, guía, «qué deja de funcionar» (literal del design §7), errores de las operaciones
  con su texto y `textoDelUltimoError`.
- `lib/interfaces/repositories/IIntegracionRepository.ts`, `IIntegracionPruebaMinutoRepository.ts`,
  `IIntegracionEnrutadoRepository.ts`.
- `lib/repositories/IntegracionRepository.ts` (T3.1), `IntegracionPruebaMinutoRepository.ts` (T3.2),
  `IntegracionEnrutadoRepository.ts` (T3.3).
- `tests/integration/db/integracion-dos-empresas.test.ts`, `integracion-prueba-minuto.test.ts`,
  `integracion-enrutado.test.ts`, `empresas-plataforma-integraciones.test.ts`.
- `tests/unit/types/integraciones-catalogo.test.ts`.

Modificados:
- `lib/interfaces/external/IProbadorIntegracion.ts`: los tipos de servicio se mueven al catálogo y se
  reexportan; los probadores no cambian de import.
- `lib/db/excepciones-aislamiento.ts`: entrada `IntegracionEnrutadoRepository.ts` (SL-36). La del
  route del webhook sigue; la quita T6.2.
- `lib/repositories/EmpresasPlataformaRepository.ts` (+ `estadoIntegraciones`, Pick con
  `integracion`), `lib/interfaces/repositories/IEmpresasPlataformaRepository.ts`,
  `lib/services/EmpresasPlataformaService.ts` (+ `estadoIntegraciones(actor)`),
  `lib/interfaces/services/IEmpresasPlataformaService.ts`, `lib/types/empresas-plataforma.ts` (T3.4).
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`: 5 entradas del censo
  (un método por tipo) y número duro 65 → 70.
- `tests/unit/guards/historial-accion-sin-datos-cliente.guardia.test.ts`: `IntegracionRepository.ts`
  entra en `PUNTOS_DE_ESCRITURA`.
- `tests/unit/services/empresas-plataforma-service.test.ts`: el doble suma `estadoIntegraciones`.
- `tests/integration/db/integracion-migracion.test.ts` (T1): sus dos consultas a `pg_class` y
  `pg_policies` acotan `public`; las tenía en rojo la guardia `catalogo-postgres-acota-esquema`.

## Mapa R<n> → test (esta tanda)

| R | Test |
|---|---|
| R5 (base) | `integracion-dos-empresas.test.ts` › «R5: en la base solo hay v<n>: y hex de 64; la lectura no trae el resumen ni texto en claro»; catálogo › «R5: datos_publicos rechaza una clave de más» |
| R8 | `integracion-dos-empresas.test.ts` › «R8: B no lee, edita, prueba, regenera, marca ni borra la de A por el repositorio» + «R8: con comoApp(B), el SQL a mano…» |
| R9 (base) | ídem › «R9: id sin forma, inexistente o de otra empresa dan el mismo null» |
| R10 | ídem › «R10: la segunda alta…» + «R10: dos altas concurrentes… (cliente de la app, commiteado)» |
| R11 | ídem › «R11: número de A rechazado en B como numero_ocupado (alta y edición); liberado al desconectar» |
| R14/R15 (repo) | ídem › «R14/R15: la edición conserva el cifrado intacto…» |
| R16 (base) | `integracion-prueba-minuto.test.ts` › «la sexta prueba del minuto…», «A y B cuentan por separado…», «con pruebas a la vez ninguna se pierde…» |
| R22 | `integracion-enrutado.test.ts` › «número y resumen llevan a SU empresa…; select solo id y organizacion_id» |
| R32 | `integracion-dos-empresas.test.ts` › «R32: desconectar borra la fila y sus secretos; el historial sobrevive» |
| R33 | ídem › «R33: alta, edición, prueba, regenerar y desconectar dejan su fila de historial sin secretos» + guardia del censo |
| R37 | `empresas-plataforma-integraciones.test.ts` › «superadmin: solo el estado…», «%s: forbidden…», «sin sesión: forbidden…» |
| R13/R31/R34/R35 (catálogo) | `tests/unit/types/integraciones-catalogo.test.ts` (R31 contra el texto de `design.md`) |

## Mutaciones (todas revertidas; `cmp` contra la copia previa = igual; después, verde)

| Mutación | Resultado |
|---|---|
| (a1) `porId` sin `organizacionId` en el `where` | ROJO 2: «R8: B no lee…», «R9: …mismo null» |
| (a2) `actualizar` sin `organizacionId` (findFirst + update) | ROJO: «R8: B no lee, edita…» |
| (a3) `borrar` sin `organizacionId` | ROJO: «R8: B no lee, edita…» |
| (a4) `porServicio` sin `organizacionId` | ROJO: «R8: B no lee, edita…» |
| (b) SQL de prueba-minuto sin `organizacion_id` (columna, valor y `WHERE`) | ROJO 2: «la sexta prueba…», «A y B cuentan por separado» (el caso concurrente sigue verde: con la envoltura, el DEFAULT pone la empresa; está dicho en la cabecera del test) |
| (c) `estado` añadido al `select` del enrutado | ROJO: «…select solo id y organizacion_id» (`expected [ …(3) ] to deeply equal [ 'id', 'organizacion_id' ]`) |
| (d) P2002 del número traducido a `ya_existe` | ROJO: «R11: número de A rechazado en B…» |

## Salida de verificación

- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, `0 errors, 232 warnings` (los mismos de antes); `eslint` sobre los 23
  archivos tocados: exit 0.
- Mis tests + los que toco, con base real: `Test Files 13 passed (13) · Tests 111 passed (111)`, 0
  skipped (dos-empresas 12, prueba-minuto 4, enrutado 2, empresas-plataforma-integraciones 5,
  catálogo 9, migración T1 9, empresas-plataforma SL-32, probadores 54, service SL-32).
- `pnpm run test:guardias`: `Test Files 2 failed | 303 passed | 2 skipped (307) · Tests 5 failed`
  antes de arreglar `recursos-origen-fuera` (un dato de mi test con forma de email; corregido y
  verde: `40 passed | 1 skipped`, el skipped es de la guardia). Queda en rojo solo
  `dependencias-declaradas-presentes` (4), en `tests/baseline-rojos.json`. `historial-accion-
  escrituras-cubiertas` y `catalogo-postgres-acota-esquema`: verdes.
- `pnpm exec vitest related --run` sobre los 9 archivos de `lib/` tocados (sin base):
  `Test Files 6 passed | 7 skipped (13) · Tests 69 passed | 38 skipped`; los 7 skipped son los de
  integración, que con base pasan (fila de arriba).

## Lo que queda para T5

- `IntegracionesService` (T5.1) debe envolver cada operación en el contexto de la empresa del actor:
  el repositorio lee la empresa de `contextoActual()` y, sin contexto explícito, falla con
  `EmpresaNoResuelta` (no la saca de la cookie). La action (T7.1) hace `conEmpresa(actor.organizacionId, …)`.
- R16 completo (rechazo sin llamar al proveedor y `reintentarEnS` desde `minuto + 60 s`) es del service.
- R9 completo («id sin forma de UUID» → `no_encontrada` sin consultar) es del service; el repo ya da
  el mismo `null` para los tres casos.
- R5 de la vista, R6, R7, R12-R15, R18 son del service con dobles de estas interfaces.
- Validación zod de la ENTRADA del formulario (longitudes, `SECRETO_MIN/MAX` ya están en el catálogo).

## Desviaciones del spec

1. `porNumeros` hace una consulta por número y no un `IN`: con un `IN` habría que seleccionar también
   el número para repartir las filas, y el `select` dejaría de ser solo los dos ids (R22).
2. Códigos de rechazo en uso (R30) con forma `<servicio>.credencial_rechazada` y
   `optimizacion_rutas.permiso` (este último literal del design §5); los otros cuatro no tienen literal
   en el design. R29 usa el código `credencial_ilegible`.
3. `marcarError` (R29/R30) no deja fila de historial: no es una acción del maestro y no hay tipo del
   enum para ella (R33 enumera crear, cambiar, probar, regenerar y desconectar).
4. Los textos de los motivos y de los errores son propuesta propia (el design pide «texto propio en
   español» sin literal), salvo «qué deja de funcionar», que es literal del design §7.
5. `registrarPrueba` recibe la hora de la prueba (el repositorio no tiene reloj); `datos_publicos` de
   WhatsApp no guarda `numeroId` (va en su columna).
6. `estadoIntegraciones` llama a `comoPlataforma("SL-36", …)` dentro de un archivo cuya excepción es
   SL-32; no añade excepción, como pide el design §11.
7. Arreglé dos consultas del test de T1 (`integracion-migracion.test.ts`) que la guardia
   `catalogo-postgres-acota-esquema` tenía en rojo (no estaba en la bitácora de T1).

## Veredicto

T3.1-T3.4 y T5.5 hechos y verificados contra Postgres real con dos empresas; las cuatro mutaciones
pedidas (y tres variantes de la primera) quedan en rojo; la guardia del censo del historial, cerrada.
