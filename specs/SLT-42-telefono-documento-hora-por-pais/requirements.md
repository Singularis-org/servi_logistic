# SLT-42 — Teléfono, documento y hora por país

> **Zona** backend · **Complejidad** high · **depends_on** SL-20 · **Rama** feature/SLT-42-telefono-documento-hora-por-pais
>
> **Alcance.** El país de la empresa trae su prefijo telefónico, su zona horaria y sus tipos de
> documento, como catálogo de plataforma. Solo se carga Costa Rica; un país nuevo es cargar filas.
> El servidor valida teléfono (con libphonenumber) y documento con las reglas del país, y todo
> cálculo de «hoy», cortes, jobs y agrupación por día usa la zona horaria del país de la empresa.
>
> **Lo que NO entra.** La pantalla del superadmin para editar estos datos y adaptar los
> formularios existentes (+506 fijo, selector de documento) → SLT-81 «Datos del país: pantalla del
> superadmin y formularios» (bloqueada por SLT-42 y SLT-46). Moneda e impuestos → SL-21. Métodos de
> pago y SINPE → SL-22.
>
> Sembrado por `/afinar-feature` el 2026-11-03. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Glosario: **país de la empresa** = `organizacion.pais_id` (SL-20, inmutable). **Usuario de
plataforma** = el que no tiene empresa (superadmin). **Hora objetivo** de un proceso diario = la
hora local a la que corre hoy en Costa Rica (00:00 la liberación de reprogramadas, 00:30 el rollup
de analítica).

### Catálogo del país

- **R1** — El sistema DEBE guardar, por cada país de la plataforma, su prefijo telefónico
  internacional, la cantidad de dígitos de su número nacional y su zona horaria (identificador IANA).
- **R2** — El sistema DEBE guardar, por cada país, su catálogo de tipos de documento; cada tipo con
  un nombre, una clave única dentro del país, una regla de formato (solo dígitos o alfanumérico,
  largo mínimo y máximo), un orden y si está activo.
- **R3** — CUANDO se aplique la migración de esta ficha, el sistema DEBE dejar a Costa Rica con
  prefijo `506`, 8 dígitos nacionales, zona `America/Costa_Rica` y exactamente cinco tipos de
  documento activos: cédula física (9 dígitos), cédula jurídica (10 dígitos), DIMEX (11 o 12
  dígitos), NITE (10 dígitos) y pasaporte (alfanumérico, letras y dígitos sin espacios, de 6 a 20
  caracteres).
- **R4** — MIENTRAS el contexto sea de una empresa, el sistema DEBE permitirle leer solo los datos y
  los tipos de documento del país de su empresa, y DEBE rechazar con permiso denegado (`42501`)
  cualquier escritura suya sobre esos datos, también por SQL a mano. El usuario de plataforma DEBE
  poder leerlos y escribirlos para cualquier país.
- **R5** — CUANDO el servidor entregue a una empresa la lista de tipos de documento, DEBE contener
  solo los tipos activos del país de su empresa, en el orden del catálogo.
- **R6** — SI el país elegido en el alta de una empresa no tiene prefijo, dígitos nacionales, zona
  horaria o al menos un tipo de documento activo, ENTONCES el alta DEBE rechazarse con
  `validation_error` en `paisId`, sin escribir nada.

### Datos ya guardados

- **R7** — CUANDO se aplique la migración, los usuarios que tenían el tipo «cedula» DEBEN quedar con
  el tipo cédula física de Costa Rica, los de «ruc» con cédula jurídica y los de «pasaporte» con
  pasaporte, sin que cambie el valor de ninguna columna existente de `usuario`.
- **R8** — La migración NO DEBE cambiar ni borrar el valor de ninguna columna existente de ninguna
  fila de `usuario`, `organizacion`, `pais`, `tipo_identificacion`, `orden` ni `tienda`, y su
  `down.sql` DEBE devolver el esquema al estado anterior sin perder filas que existían antes de
  aplicarla. La única pieza existente que se borra es el índice `usuario_cedula_key`, que se recrea
  con el mismo nombre (R13) y que el `down.sql` restaura.
- **R9** — SI se edita un usuario existente sin cambiar su teléfono, ni su documento, ni su tipo de
  documento, ENTONCES el sistema NO DEBE revalidar esos campos con las reglas del país.

### Documento

- **R10** — CUANDO se cree un usuario de una empresa (alta en Configuración, aprobación de una
  postulación de mensajero o maestro del alta de empresa), el sistema DEBE validar en el servidor el
  documento con la regla de su tipo y, si no la cumple, rechazar con `validation_error` en el campo
  del documento, sin escribir nada.
- **R11** — SI el tipo de documento recibido no existe, está inactivo o es de un país distinto al de
  la empresa, ENTONCES el sistema DEBE rechazar con `validation_error` en el campo del tipo, sin
  escribir nada.
- **R12** — CUANDO se cambie el tipo de documento de un usuario existente, el sistema DEBE validar el
  documento ya guardado con la regla del tipo nuevo y, si no la cumple, rechazar el cambio con
  `validation_error` en el campo del tipo.
- **R13** — El sistema DEBE exigir que el documento sea único por empresa y tipo: un segundo usuario
  de la misma empresa con el mismo tipo y el mismo documento DEBE rechazarse con `conflict` en el
  campo del documento; el mismo documento con otro tipo en la misma empresa, o con el mismo tipo en
  otra empresa, DEBE aceptarse.

### Teléfono

- **R14** — CUANDO se cree un usuario de una empresa (mismos puntos que R10) o se cambie su teléfono,
  el servidor DEBE validar el teléfono con libphonenumber para la región del país de la empresa y,
  si no es válido, rechazar con `validation_error` en el campo del teléfono, sin escribir nada. El
  teléfono del destinatario de una orden, el de una tienda y el de una postulación de vehículo o
  bodega NO DEBEN validarse con libphonenumber: siguen aceptándose como hoy.
- **R15** — CUANDO un teléfono pase la validación de R14, el sistema DEBE guardarlo como número
  nacional en dígitos, sin prefijo internacional ni separadores.
- **R16** — SI libphonenumber no tiene reglas para la región del país de la empresa, ENTONCES el
  sistema DEBE rechazar el teléfono con `validation_error` en el campo del teléfono y un mensaje que
  diga que el país no tiene reglas de teléfono.
- **R17** — SI el usuario es de plataforma (sin empresa), ENTONCES su teléfono y su documento DEBEN
  seguir validándose con la regla genérica actual (solo dígitos, largo de `AUTH_ID_MIN_LENGTH` a
  `AUTH_ID_MAX_LENGTH`).
- **R18** — CUANDO el sistema normalice un teléfono para WhatsApp (clave del hilo, destino de un
  envío, comparación con el teléfono de la orden), DEBE aplicar, con el prefijo y los dígitos
  nacionales del país de la empresa, las cuatro reglas de hoy y en este orden: con `+` inicial, solo
  los dígitos; si ya empieza por el prefijo, los dígitos tal cual; si son exactamente los dígitos
  nacionales, el prefijo delante; en otro caso, los dígitos tal cual.
- **R19** — La normalización de R18 hecha en SQL sobre una columna DEBE dar el mismo texto que la
  hecha en el servidor para el mismo valor, para cualquier prefijo y cantidad de dígitos.
- **R20** — CUANDO el sistema decida si el teléfono de un destinatario de un envío de WhatsApp sirve,
  DEBE aceptarlo solo si, normalizado según R18, tiene de 10 a 15 dígitos y, si empieza por el
  prefijo del país de la empresa, exactamente prefijo más dígitos nacionales.
- **R21** — MIENTRAS la empresa esté en Costa Rica, R18, R19 y R20 DEBEN dar exactamente el mismo
  resultado que el código anterior a esta ficha para cada valor de la tabla de casos de la prueba.

### Hora

- **R22** — El servidor DEBE calcular «hoy», «mañana», el comienzo y el fin de un día o de un mes,
  «últimos N días», los días naturales entre dos instantes, la hora de pared y la agrupación por día
  de una empresa con la zona horaria del país de esa empresa.
- **R23** — SI la zona horaria del país tiene horario de verano, ENTONCES los límites de cada día
  DEBEN ser las 00:00 locales reales de ese día, también en los días de 23 y de 25 horas.
- **R24** — CUANDO un cron diario corra para varias empresas, el sistema DEBE calcular la fecha de
  cada empresa con la zona horaria de su país.
- **R25** — CUANDO un job recurrente diario (liberar reprogramadas, rollup de analítica) agende su
  próxima corrida, DEBE elegir el instante más cercano en que alguna zona horaria de los países con
  empresas llega a la hora objetivo, y esa corrida DEBE procesar solo las empresas de los países con
  esa zona horaria.
- **R26** — MIENTRAS todas las empresas estén en países con la misma zona horaria, las corridas de
  R25 DEBEN ocurrir en los mismos instantes que antes de esta ficha y cada empresa DEBE procesarse
  una sola vez por día local.
- **R27** — CUANDO el rastreo público muestre la fecha y hora de un evento de una orden, DEBE usar
  la zona horaria del país de la empresa de esa orden.
- **R28** — SI el país de la empresa no tiene zona horaria, ENTONCES la operación que la necesite
  DEBE fallar con el error de dominio `PaisSinZonaHoraria` sin escribir nada y, dentro de un cron o
  un job, contar como fallo de esa empresa sin impedir que corran las demás.

### Transversales

- **R29** — Ningún archivo de servidor (`lib/`, `app/api/`, las páginas de servidor de `app/`) DEBE
  contener como literal la zona `America/Costa_Rica`, un desfase horario fijo de Costa Rica ni el
  prefijo `506`, salvo los archivos de una lista de excepciones con su ficha (la UI que pasa a
  SLT-81 y SINPE, que es de SL-22). La lista solo puede bajar.
- **R30** — El sistema NO DEBE reutilizar los datos del país (zona, prefijo, dígitos, tipos) leídos
  para una empresa al atender a otra empresa.
- **R31** — El aislamiento por país (R4, R5, R11, R13, R24, R25) DEBE quedar probado con dos
  empresas en dos países distintos, con pruebas unitarias y de integración y sin E2E.

### Cobertura de las decisiones cerradas

| Decisión (fecha · pregunta) | Requisitos |
|---|---|
| 2026-11-03 · ¿Qué países funcionan? | R1, R2, R3 |
| 2026-10-26 · ¿De quién es la zona horaria? | R1, R22, R24, R27 |
| 2026-11-03 · ¿Unicidad del documento? | R13 |
| 2026-11-03 · ¿Tipos de documento de CR? | R3, R7, R10 |
| 2026-11-03 · ¿Librería para el teléfono? | R14, R16 |
| 2026-11-03 · ¿Quién mantiene los datos del país? | R3, R4 |
| 2026-11-03 · ¿Se parte la ficha? | R29 (la UI queda en la lista de excepciones, a SLT-81) |
| 2026-10-26 · ¿Quién ve y edita el catálogo? | R4, R5 |
| 2026-10-26 · ¿E2E? | R31 |
| 2026-11-03 · P1 ¿Se normalizan los teléfonos y documentos guardados? | R7, R8, R9 |
| 2026-11-03 · P2 ¿Jobs diarios con varios países? | R25, R26 |
| 2026-11-03 · P3 ¿Largos de documento de CR? | R3, R10, R12 |
| 2026-11-03 · P4 ¿Se acepta el `DROP INDEX` del único del documento? | R8, R13 |
| 2026-11-03 · P5 ¿Regla del pasaporte? | R3, R10 |
| 2026-11-03 · P6 ¿Horario de los crons de Vercel con varias zonas? | R24 (el horario no cambia; deuda) |
| 2026-11-03 · P7 ¿País incompleto entre SLT-42 y SLT-81? | R6, R28 |
| 2026-11-03 · P8 ¿Qué teléfonos se validan con libphonenumber? | R14 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-03 | ¿Qué países funcionan? | Solo Costa Rica. Prefijo, zona horaria y tipos de documento son catálogo por país: un país nuevo = filas nuevas. Hereda SL-20. |
| 2026-10-26 | ¿De quién es la zona horaria? | Del país, no de la empresa (en /afinar-feature SL-20). |
| 2026-11-03 | ¿Unicidad del documento? | Por empresa y tipo. Mantiene SL-18 (la misma persona puede estar en dos empresas); corrige el «único por país» de la descripción original. |
| 2026-11-03 | ¿Tipos de documento de CR? | Los 5 oficiales: cédula física (9 dígitos), cédula jurídica (10), DIMEX (11-12), NITE (10), pasaporte (sin formato fijo). Los usuarios con «cedula» pasan a cédula física; «ruc» a cédula jurídica. |
| 2026-11-03 | ¿Librería para el teléfono? | libphonenumber entra en esta ficha (cuatro checks de salud + fila en `docs/dependencias.md`; se aprueba con el spec en F1.4). |
| 2026-11-03 | ¿Quién mantiene los datos del país? | El superadmin, por pantalla, en SLT-81. Esta ficha siembra CR por migración. |
| 2026-11-03 | ¿Se parte la ficha? | Sí: backend aquí; pantalla del superadmin y formularios existentes en SLT-81, que espera a SLT-42 y SLT-46 (misma pantalla de países). |
| 2026-10-26 | ¿Quién ve y edita el catálogo? | Plataforma: solo el superadmin escribe; la empresa solo lee. Hereda SL-17/SL-20. |
| 2026-10-26 | ¿E2E? | No: unit + integración con dos empresas en dos países de prueba. Hereda SL-20. |
| 2026-11-03 | P1 · ¿Se normalizan los teléfonos y documentos ya guardados? | No. No se toca ningún teléfono ni documento guardado; solo se valida lo nuevo y lo que cambia. El remapeo de tipos rellena solo columnas nuevas de `tipo_identificacion`: ningún `UPDATE` sobre `usuario` (F1.4). |
| 2026-11-03 | P2 · ¿Jobs diarios con varios países? | Una serie por tipo de job; cada corrida es la de la zona que llega primero a la hora objetivo y procesa solo las empresas de esa zona (`design.md` §6; F1.4). |
| 2026-11-03 | P3 · ¿Largos de documento de CR? | Confirmados: cédula física 9, cédula jurídica 10, DIMEX 11-12, NITE 10. Se acepta que los «cedula» guardados que no tienen 9 dígitos quedan como cédula física sin cumplir la regla (F1.4). |
| 2026-11-03 | P4 · ¿Se acepta borrar `usuario_cedula_key`? | Sí: se borra y se recrea con el mismo nombre sobre `(organizacion_id, tipo_identificacion_id, cedula)`. Es una excepción declarada a la regla de la épica GEO: solo es un índice, no toca datos y el `down.sql` lo restaura. El design la nombra para la guardia de migraciones destructivas (F1.4). |
| 2026-11-03 | P5 · ¿Regla del pasaporte? | Alfanumérico, sin espacios, de 6 a 20 caracteres (F1.4). |
| 2026-11-03 | P6 · ¿Horario de los crons de Vercel con varias zonas? | Siguen a hora fija UTC. Es deuda que se resuelve cuando entre el primer país con otra zona; la anota el leader en `progress/deudas.md` (F1.4). |
| 2026-11-03 | P7 · ¿País incompleto entre SLT-42 y SLT-81? | Aceptado: no admite altas de empresa nuevas. Antes de migrar, una comprobación de solo lectura en producción confirma que no hay empresas fuera de CR; si aparece una, se para y decide el humano (F1.4). |
| 2026-11-03 | P8 · ¿Qué teléfonos se validan con libphonenumber? | Solo los de personas usuarias: usuarios, maestro del alta de empresa y postulación de mensajero. El teléfono del destinatario de una orden no se valida (F1.4). |
