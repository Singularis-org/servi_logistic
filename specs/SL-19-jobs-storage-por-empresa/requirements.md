# SL-19 «Cola de jobs y storage por empresa» — requirements

> Board Jira SL · épica SL-2 (Fase 2 — Varias empresas en la misma app) · assignee: Carlos Restrepo ·
> zona `backend` · complejidad media · `sdd: true` · depende de SL-17 (hecha).
> Sin `/afinar-feature`: la ficha es técnica. Este archivo lo escribe entero `spec_author` (F1.2).

## Alcance

**Qué es.** Que la cola `jobs` y los archivos de Storage queden separados por empresa en la propia
base y en el propio almacén, no solo en el código que los usa.

1. **`jobs` con RLS por empresa.** Hoy la tabla tiene la política abierta `jobs_abierta`
   (`USING (true)`, migración `20261022130000_organizacion_y_rol_app`). Por eso la salud de la
   geocodificación contaba y revivía jobs de otras empresas (hallazgo de SL-36 en QA, arreglado allí
   con un filtro en el SQL, R42/R43 de SL-36, PR #14). SL-19 cierra la causa raíz: la política pasa a
   comparar con la empresa de la transacción, sin romper al drenador, que reclama en plataforma.
2. **Storage por empresa.** Los seis buckets de la app (`design.md > §3.1`) guardan hoy los
   archivos sin rastro de la empresa (`<ordenId>/…`, `<envioId>/<ejecucionId>.pdf`, `tmp/<uuid>…`).
   Cada archivo pasa a vivir en la carpeta de su empresa, y la app solo puede alcanzar la carpeta de
   la empresa en curso.
3. **Lo ya guardado.** Un comando mueve a su carpeta los archivos que ya existen en QA y en dev. En
   producción no hay empresas reales: el comando se corre en modo de prueba para confirmarlo.
4. **Guardias** que ponen el gate en rojo si `jobs` pierde su política, si una tabla de negocio
   conserva una política abierta junto a la suya, o si algo fuera de `lib/storage/` usa Storage
   directamente.

**Lo que NO entra:**
- `dedupe_key` por empresa: se queda global (`design.md > §2.4`), salvo que el humano diga otra cosa
  (pregunta abierta 1);
- la revisión uno a uno de cada handler de la cola. SL-17 ya los envolvió todos en `conSuEmpresa`
  (`app/api/cron/procesar-jobs/route.ts`), y nada de lo evidenciado apunta a un handler;
- quitar el filtro por empresa que SL-36 añade en `GeocodeSaludRepository` (PR #14): se queda como
  segunda barrera;
- que el superadmin vea archivos de una empresa: hoy no lo hace ninguna pantalla. Si SL-26 lo
  necesita, entrará dentro de `conEmpresa` de esa empresa;
- políticas de Supabase sobre `storage.objects`: la app firma con el service role, que no las mira
  (`design.md > §3.6`, alternativa D).

## Decisiones cerradas (no reabrir)

Ninguna sale de una sesión de afinado. Son las que este spec hereda de SL-17 y del encargo del leader
(2026-10-25), que la ficha no puede cambiar.

| # | Decisión | Origen | Cubierta por |
|---|---|---|---|
| D1 | `jobs.organizacion_id` es nulable y la llena el `DEFAULT` con la empresa de la transacción que encola. El drenador corre cada job con su empresa; un job sin empresa corre en plataforma o, si es recurrente, una vez por empresa. | SL-17 D16 | R4, R6 |
| D2 | Los crons, el drenador y las purgas tienen que **funcionar** con dos empresas, no solo no filtrar. | SL-17 D20 | R6, R21 |
| D3 | La RLS de `jobs` separa por empresa (causa raíz del hallazgo de SL-36), sin romper al drenador de plataforma. | Encargo; `progress/features/SL-19.md` | R1–R3, R5, R8, R9 |
| D4 | Migraciones nuevas, cada una con su `down.sql`. Nunca se edita ni se renumera una aplicada. | `docs/architecture.md > Migraciones up/down`; SL-17 D9 | R11 |
| D5 | Sin dependencias nuevas. Identificadores en español. | Encargo; regla 7 de `CLAUDE.md` | No es comportamiento: no lleva R (`design.md > §8`) |
| D6 | Producción no tiene empresas reales; QA y dev sí tienen datos. Lo guardado no puede quedar inaccesible tras el cambio. | Encargo | R23–R28 |
| D7 | Verificación con dos empresas contra Postgres real, y cada test matado por una mutación (quitar la política, quitar la carpeta). | Encargo | R1–R10, R15–R19 (`design.md > §6`) |

## Requisitos (EARS)

«Rol de la app» es `servi_app`, el rol sin bypass de RLS al que baja cada transacción de empresa
(SL-17 `design.md > §4`). «Plataforma» es el contexto `comoPlataforma`, que opera como dueño de las
tablas, sin RLS.

### A. La cola `jobs` separada por empresa

- **R1.** MIENTRAS una transacción opera con el rol de la app y la empresa A fijada, toda lectura de
  `jobs` DEBE devolver solo jobs de A, aunque el SQL no filtre por empresa. Los jobs de la empresa B
  y los jobs sin empresa NO DEBEN aparecer.
- **R2.** MIENTRAS una transacción opera con el rol de la app y la empresa A fijada, actualizar o
  borrar un job de B o un job sin empresa DEBE afectar cero filas, y ese job DEBE quedar intacto.
- **R3.** SI una transacción con el rol de la app y la empresa A fijada intenta insertar un job con
  `organizacion_id` de B, o con `organizacion_id` NULL explícito, ENTONCES la base DEBE rechazar la
  inserción y no escribir nada.
- **R4.** CUANDO se encola un job dentro del contexto de la empresa A sin indicar empresa, el job
  DEBE guardarse con la empresa A, y el encolado DEBE devolver el job creado.
- **R5.** SI una transacción opera con el rol de la app sin empresa fijada, ENTONCES `jobs` DEBE
  devolver cero filas y rechazar toda inserción.
- **R6.** CUANDO el drenador reclama jobs en contexto de plataforma, DEBE poder reclamar en la misma
  corrida los jobs vencidos de todas las empresas y los jobs sin empresa, y después cerrarlos
  (completado, reintento o fallo terminal) igual que antes de este cambio.
- **R7.** CUANDO dentro de la empresa A se encola dos veces un job con la misma clave de
  deduplicación, DEBE existir una sola fila, y el segundo encolado DEBE devolver «omitido».
- **R8.** CUANDO la salud de la geocodificación de la empresa A cuenta los fallos de configuración o
  revive jobs muertos por configuración, DEBE contar y revivir solo jobs de A, aunque existan jobs de
  B que cumplan las mismas condiciones.
- **R9.** La tabla `jobs` NO DEBE tener ninguna política para el rol de la app que deje pasar filas
  sin comparar su `organizacion_id` con la empresa fijada. Las políticas permisivas se suman: una
  abierta anula a la de empresa.
- **R10.** CUANDO la empresa A busca jobs por clave de deduplicación (la comprobación de
  coordenadas de asignabilidad), DEBE recibir solo jobs de A, aunque B tenga un job con esa misma
  clave.
- **R11.** Cada migración de esta feature DEBE traer un `down.sql`. Aplicar la migración, su
  `down.sql` y otra vez la migración sobre una base migrada DEBE dejar las políticas de `jobs` igual
  que tras la primera aplicación. El `down.sql` DEBE devolver `jobs` a la política abierta anterior.

### B. Guardias de la base

- **R12.** SI tras aplicar todas las migraciones una tabla de negocio, o `jobs`, conserva una
  política para el rol de la app que no compara con `app.organizacion_id` (por ejemplo,
  `USING (true)`), ENTONCES el gate DEBE fallar nombrando la tabla y la política.
- **R13.** SI la tabla `jobs` queda sin su política por empresa para el rol de la app, sin la columna
  `organizacion_id`, o sin un índice cuya primera columna sea `organizacion_id`, ENTONCES el gate
  DEBE fallar nombrando lo que falta.
- **R14.** El modelo `Job` DEBE dejar de estar en la lista de diferidos y quedar clasificado como
  tabla con empresa opcional. SI un modelo de esa clase no tiene `organizacion_id` nulable, ENTONCES
  el gate DEBE fallar nombrando el modelo.

### C. Storage por empresa

- **R15.** CUANDO se guarda un archivo en cualquier bucket de la app dentro del contexto de la
  empresa A, el objeto DEBE quedar dentro de la carpeta de A en ese bucket. La ruta que recibe quien
  lo guardó, y que se persiste en la base, NO DEBE cambiar de forma respecto de la de hoy.
- **R16.** CUANDO se firma, se descarga o se borra una ruta dentro del contexto de la empresa B, el
  sistema DEBE resolverla solo dentro de la carpeta de B. Una ruta que en la carpeta de A apunta a un
  objeto existente NO DEBE dar acceso a ese objeto desde B: se comporta como un objeto que no existe,
  y el objeto de A queda intacto.
- **R17.** SI una ruta que llega al almacén está vacía, empieza por `/`, contiene `\`, o tiene un
  segmento vacío, `.` o `..`, ENTONCES el sistema DEBE rechazarla con un error identificable de ruta
  inválida y NO DEBE llamar a Storage.
- **R18.** SI se opera el almacén sin empresa en contexto (ni explícita ni resuelta desde la sesión),
  o en contexto de plataforma, ENTONCES el sistema DEBE fallar con `EmpresaNoResuelta` y NO DEBE
  llamar a Storage.
- **R19.** CUANDO se firman varias rutas en lote, el resultado DEBE venir indexado por las mismas
  rutas que se pidieron. Una ruta que no se pudo firmar se omite, como hoy.
- **R20.** SI un archivo de producción (`app/`, `lib/`, `scripts/`) fuera de `lib/storage/` accede a
  Storage a través del cliente de Supabase, y no figura en la lista de excepciones con ficha,
  ENTONCES el gate DEBE fallar nombrando el archivo.
- **R21.** CUANDO corre la purga de descargas temporales, DEBE purgar en cada empresa los objetos
  vencidos de su carpeta. Un fallo en una empresa NO DEBE frenar a las demás, y el cron DEBE
  responder con los conteos sumados. Sin empresas, termina sin tocar Storage y sin error.
- **R22.** CUANDO las purgas de los PDF de cargas y de las ejecuciones de envíos por WhatsApp borran
  los archivos vencidos de la empresa A, DEBEN borrar solo objetos de la carpeta de A.

### D. Lo ya guardado

- **R23.** CUANDO se ejecuta el comando de migración de archivos sin `--aplicar`, DEBE informar por
  bucket cuántos objetos movería, cuántos ya están en su carpeta, cuántas filas apuntan a un objeto
  que no existe y cuántos objetos huérfanos hay fuera de toda carpeta, sin mover ni borrar nada.
- **R24.** CUANDO se ejecuta con `--aplicar`, DEBE llevar cada objeto referenciado por una fila de
  negocio a la carpeta de la empresa de esa fila, sin cambiar la ruta guardada en la base. Después,
  la app DEBE poder firmar esa ruta dentro de esa empresa y obtener el mismo contenido.
- **R25.** SI el comando se ejecuta otra vez sobre un estado ya migrado, ENTONCES NO DEBE mover nada
  ni fallar. Un objeto que ya está en su carpeta cuenta como movido.
- **R26.** SI con `--aplicar` hay objetos temporales de descargas fuera de una carpeta de empresa,
  ENTONCES el comando DEBE borrarlos: ninguna fila los referencia y caducan en una hora.
- **R27.** SI hay objetos fuera de toda carpeta de empresa que ninguna fila referencia (salvo los de
  R26), ENTONCES el comando NO DEBE moverlos ni borrarlos, y DEBE listarlos con su bucket y su ruta.
- **R28.** CUANDO se ejecuta con `--revertir`, DEBE devolver a la raíz del bucket cada objeto que el
  comando movió, para que una versión anterior de la app lo vuelva a encontrar. Es el `down` del
  almacén.

### Cobertura de las decisiones

| Decisión | Requisitos |
|---|---|
| D1 | R4, R6 |
| D2 | R6, R21, R22 |
| D3 | R1, R2, R3, R5, R8, R9 |
| D4 | R11 |
| D5 | (sin R; `design.md > §8`) |
| D6 | R23, R24, R25, R26, R27, R28 |
| D7 | R1–R10 y R15–R19, con su mutación en `design.md > §6` |

## Preguntas abiertas

Ninguna bloquea el spec: cada una trae la opción por la que va el diseño mientras no haya respuesta.

> **Cerradas el 2026-10-25.** Spec aprobado por Carlos.
> - (1) La `dedupe_key` queda **global**: es técnica, el leader la cierra con la recomendación del design §2.4.
> - (2) Carlos: los archivos de QA y dev **se mueven** con el comando. Correrlo contra QA sigue siendo puerta humana (T10.4).
> - (3) Queda abierta como comprobación: si en el panel de Supabase aparece un bucket que no está en la lista, se reporta.

1. **¿La clave de deduplicación de la cola pasa a ser por empresa?** SL-17 apuntó «`dedupe_key` por
   empresa» entre lo que le quedaba a SL-19. Propongo **no cambiarla**. Hoy toda clave que se encola
   desde una empresa lleva el id de una fila suya (orden, envío, mensajero, notificación…), y esos ids
   no se repiten entre empresas, así que dos empresas nunca chocan. Cambiar el índice obliga a tocar
   el encolado, rompe la re-ejecución de una migración ya aplicada en un test
   (`20261005120200_seed_whatsapp_envio_mantenimiento`) y no arregla nada que se haya visto. El
   riesgo que queda: si mañana alguien encola desde una empresa un job con una clave sin id (por
   ejemplo, solo la fecha), la segunda empresa perdería el suyo en silencio. Detalle en
   `design.md > §2.4`. **¿De acuerdo con dejarla global?**
2. **Archivos de QA y dev: ¿se mueven o se descartan?** El diseño los mueve con el comando de R23–R28.
   QA tiene tres días de datos de prueba. Si da igual perderlos, se pueden borrar los buckets de QA y
   saltarse el comando allí. **Mientras no haya respuesta**, se mueven.
3. **¿Hay buckets en Supabase que el código no conoce?** El encargo habla de 4 buckets privados en
   producción. El código usa 6: `mensajero-docs`, `gestion-evidencias`, `etiquetas-guia` y
   `wallet-comprobantes`, creados a mano, y `descargas` y `whatsapp-envios`, que se crean solos en su
   primer uso (`design.md > §3.1`). Si en el panel aparece otro bucket, hay que decir de quién es,
   porque este spec no lo cubre.
