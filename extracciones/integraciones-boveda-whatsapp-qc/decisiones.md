# Decisiones — integraciones-boveda-whatsapp-qc

Origen: QuimiCloude, SHA `f786d72`. La fuente es `inventario.md`, en la misma carpeta; cada fila lleva su eje y su evidencia allí. Las respuestas del humano son de Carlos, del 2026-10-24.

| # | Decisión | QuimiCloude eligió | Alternativa y consecuencia | Estado |
|---|---|---|---|---|
| D1 | ¿Cómo conecta la empresa su cuenta de WhatsApp: copiando a mano sus datos de Meta o con un asistente de Meta que la lleva de la mano? (eje 2) | **Formulario manual** de 5 campos y siempre `origin: MANUAL`. El valor `EMBEDDED_SIGNUP` está reservado en el enum, sin flujo | **Alta guiada de Meta (Embedded Signup).** El usuario no copia tokens, pero hace falta una app de Meta revisada y una ruta de retorno | Abierta: se cierra en /afinar-feature de SL-36 |
| D2 | ¿Quien puede configurar un servicio puede también configurar todos los demás? (eje 4) | **Un solo permiso**, `integraciones.modificar`, para todas las integraciones, y solo para el Administrador | **Un permiso por integración.** Hoy, quien configura el asistente puede cambiar también el token de WhatsApp; con permisos separados, cada uno toca solo lo suyo | Abierta: se cierra en /afinar-feature de SL-36 |
| D3 | Cuando la prueba falla, ¿el usuario ve el mensaje exacto del proveedor o uno nuestro? (eje 7) | **El texto literal de Meta**, en inglés y técnico, con el prefijo «Meta rechazó la prueba: » y los secretos tapados. Además se **guarda** en `last_error` | **Un texto propio del catálogo.** Con el literal, los detalles internos del proveedor llegan a la pantalla y a la base; con el propio, se pierde el detalle útil para diagnosticar | Abierta: se cierra en /afinar-feature de SL-36 |
| D4 | ¿Puede alguien pulsar «Probar conexión» sin límite? (eje 7) | **Sin límite** de intentos | **Un límite por minuto.** Sin límite, un usuario puede agotar la cuota del proveedor de la empresa | Abierta: se cierra en /afinar-feature de SL-36 |
| D5 | ¿Queda registrado quién cambió o probó una credencial? (eje 7) | **Solo `created_by`.** La IA del mismo módulo sí tiene `updated_by` | **`updated_by` o un evento** por cambio. Sin él, no se puede saber quién reemplazó un token | Abierta: se cierra en /afinar-feature de SL-36 |
| D6 | ¿Cada servicio tiene su propia tabla o todas las credenciales van en una sola? (eje 13) | **Una tabla por proveedor**, con formas distintas: WhatsApp tiene único parcial y borrado lógico; la IA, único total y sin `deleted_at` | **Una tabla genérica** `integracion(organizacion_id, proveedor, secreto_cifrado, estado, …)`. Con tablas por proveedor, cada integración nueva es una migración y su propio código; con la genérica, los campos propios (WABA, teléfono, modelo) acaban en JSON sin esquema | Abierta: se cierra en /afinar-feature de SL-36 |
| D7 | Al quitar un servicio, ¿se borra la clave o solo se apaga? (eje 13, ligada a D9) | **Borrado lógico** (`deleted_at`), con únicos parciales sobre las filas vivas | **Borrado físico.** El lógico conserva el historial, pero exige únicos parciales a mano, que el ORM no declara y que son lo primero que se pierde al portar. El físico es simple y no deja rastro de la clave. Lo pidió la respuesta 1 del humano | Abierta: se cierra en /afinar-feature de SL-36 |
| D8 | ¿Dónde vive la llave que protege las credenciales? (eje 15) | **Cifrado en la aplicación**, con el anillo de claves en variables de entorno. El puerto es asíncrono para poder pasar a KMS | **Supabase Vault o un KMS.** En la app, una copia de la base sin las variables es ilegible, pero la custodia es manual. Con Vault, un acceso total a la base lo descifra todo. Nota: la respuesta 2 del humano ya descarta el **KMS externo** («por simple»); queda por confirmar frente a Vault | Abierta: se cierra en /afinar-feature de SL-36 |
| D9 | ¿Puede una empresa quitar una conexión (WhatsApp, Maps, asistente)? (eje 18) | **No existía.** Había columna de borrado y únicos que cuentan con ella, pero ningún caso de uso | **Respuesta 1 del humano.** Sí, se puede quitar. Antes de confirmar, la app dice qué deja de funcionar. Cada servicio se marca «requerido» o «recomendado», con lo que se pierde al quitarlo. Si sin Maps las asignaciones se bloquean o solo se degradan sigue abierto y lo verifica el spec. Borrar o apagar va con D7 | **Cerrada** (humano, 2026-10-24) |
| D10 | Cuando la plataforma cambia su llave maestra, ¿qué pasa con lo ya guardado? (eje 18) | **Versiones sin recifrado.** Lo viejo sigue legible con su versión, y nada lo pasa a la nueva, así que una versión vieja no se puede retirar nunca | **Respuesta 2 del humano.** Versiones y comando. Lo nuevo se cifra con la activa y las viejas solo leen. Un comando del superadmin recifra todo con la versión activa y muestra cuántas filas quedan con cada versión vieja. Una versión se retira del entorno cuando su conteo llega a 0. Sin KMS externo | **Cerrada** (humano, 2026-10-24) |

## Decisiones heredadas, ya justificadas en el original (no reabrir)

Cada una tiene su porqué escrito en el código o en la migración. El detalle está en `inventario.md`, ejes 3, 6, 9, 11, 12 y 13.

- **El AAD va en JSON, con versión, empresa, registro y campo.** Unir con `:` sería ambiguo.
- **El id de la fila se genera antes de cifrar.** El contexto lo necesita.
- **Un único error «ilegible» para cualquier fallo al descifrar.** La acción es siempre la misma: reescribir el secreto.
- **Si una edición falla la prueba, no se escribe nada.** La conexión sigue funcionando con las credenciales que tenía.
- **«No existe», «borrada» y «de otra empresa» dan la misma respuesta.** Distinguirlas filtraría información entre empresas.
- **Si no hay permiso, la página da un 404 indistinguible de una ruta inexistente.**
- **El puerto de cifrado es asíncrono.** Así la firma no cambia si la clave pasa a un KMS.
- **Las variables de cifrado se leen en cada llamada.** La app arranca sin ellas.
- **Los IDs del proveedor no llevan regla de formato.** Los valida la prueba contra el proveedor.

## Deuda anotada del original (sin juzgar)

- **El WABA ID nunca se verifica.**
  - La prueba solo pide el teléfono, y la edición no prueba si solo cambia el WABA.
  - Un WABA equivocado aflora solo como fallo de importación de plantillas, que va al log.
- **Migración editada en sitio.** Se quitó una columna de la migración de la tabla ya aplicada y hubo que añadir una correctiva con `DROP COLUMN IF EXISTS`.
- **Numeración R29/R30 que choca.**
  - En los tests unitarios es la importación de plantillas; en el E2E es deshabilitar y habilitar.
  - No verificado: si vienen de specs distintos o es un error de trazabilidad.
- **Actor sin addons.**
  - La acción del borde construye el actor sin `addons`, y la guarda de vínculo de contactos exige el añadido.
  - No verificado: que las acciones de contactos, fuera de la frontera, tengan el mismo hueco.
