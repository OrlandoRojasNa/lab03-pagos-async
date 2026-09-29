# Informe — Taller N.º 3: Procesamiento asíncrono de eventos

**Integrantes:** Orlando Rojas · Derly García
**Asignatura:** Sistemas Distribuidos — Ing. Juan Carlos Polania Cortes — 2026-2
**Repositorio:** https://github.com/OrlandoRojasNa/lab03-pagos-async

> El instructivo para levantar el entorno está en el [README](../README.md). Las capturas van en [docs/evidencias/](evidencias/).

---

## 1. Tabla de medición (punto 8)

Obtenida con `docker compose run --rm medicion` (20 pagos seguidos, acción del consumidor de 3–5 s). Informe completo en `resultados/`.

| Medida | Valor observado |
|---|---|
| Tiempo de respuesta de la API (media de los 20 registros) | 19,89 ms |
| Tiempo de respuesta de la API (máximo observado) | 30,93 ms |
| Tiempo entre el registro y el procesamiento del primer pago | 4,50 s |
| Tiempo entre el registro y el procesamiento del último pago | 77,14 s |
| Tiempo total hasta que los 20 pagos quedaron en estado PROCESADO | 77,52 s |

Datos adicionales: tiempo mínimo de respuesta 16,14 ms; los 20 registros se respondieron en 0,40 s en total, cuando el consumidor llevaba 1 de 20 procesados. Informe: `resultados/medicion-2026-09-29T00-47-47-208Z.md`.

| Evidencia | Captura |
|---|---|
| Los 20 registros respondidos mientras el consumidor apenas empezaba | `evidencias/medicion-envio.png` |
| Tabla final | `evidencias/medicion-tabla.png` |
| Log del consumidor (pagos 9 a 22 de la medición, parte superior) | `evidencias/caso1-log-consumidor.png` |

## 2. Casos del punto 9

### Caso 1 — Consumidor detenido

| Evidencia | Captura |
|---|---|
| Respuestas de la API con el consumidor apagado | `evidencias/caso1-api.png` |
| Cola `pagos.registrados` con 5 mensajes *ready* y 0 consumidores | `evidencias/caso1-cola.png` |
| Tabla `pagos` con los 5 en `REGISTRADO` | `evidencias/caso1-pagos-registrado.png` |
| Log del consumidor al levantarlo, procesando los 5 | `evidencias/caso1-log-consumidor.png` y `evidencias/caso1-log-final.png` |
| Tabla `pagos` con los 5 en `PROCESADO` | `evidencias/caso1-pagos-procesado.png` |
| Cola `pagos.registrados` en 0 al terminar | `evidencias/caso1-cola-final.png` |

### Caso 2 — Acción de 15 s

Se fijó la acción del consumidor en 15 s (`PROCESO_MIN_MS=PROCESO_MAX_MS=15000`) y se repitió la medición de 20 pagos. Informe: `resultados/caso2-15s-2026-09-29T21-00-50-371Z.md`.

| Medida | Acción 3–5 s | Acción 15 s |
|---|---|---|
| Respuesta de la API (media) | 19,89 ms | 23,64 ms |
| Respuesta de la API (máximo) | 30,93 ms | 90,69 ms |
| Respuesta de la API (mínimo) | 16,14 ms | 15,31 ms |
| Tiempo en responder los 20 registros | 0,40 s | 0,48 s |
| Registro → procesamiento, primer pago | 4,50 s | 15,08 s |
| Registro → procesamiento, último pago | 77,14 s | 300,39 s |
| Total hasta los 20 en PROCESADO | 77,52 s | 300,82 s |

El máximo de 90,69 ms corresponde a la **primera** petición de la corrida (primer registro después de que los contenedores se reiniciaran). Las otras 19 estuvieron entre 15,31 ms y 36,67 ms; sin esa primera, la media es 20,11 ms, prácticamente igual a la de 3–5 s.

| Evidencia | Captura |
|---|---|
| Configuración del consumidor en 15 s | `evidencias/caso2-configuracion.png` |
| Los 20 registros respondidos con 1 de 20 procesados | `evidencias/caso2-envio.png` |
| Cola a mitad del proceso: 12 *ready*, 1 *unacked* | `evidencias/caso2-cola.png` |
| Tabla `pagos` a mitad del proceso (8 PROCESADO, 12 REGISTRADO) | `evidencias/caso2-pagos-parcial.png` |
| Log del consumidor: cada pago tarda 15,0 s | `evidencias/caso2-log-consumidor.png` |
| Tabla final de la medición | `evidencias/caso2-tabla.png` |
| Tabla `pagos` con los 20 en `PROCESADO` | `evidencias/caso2-pagos-procesado.png` |
| Consumidor devuelto a 3–5 s | `evidencias/caso2-restaurado.png` |

### Caso 3 — Fallo al procesar

| Evidencia | Captura |
|---|---|
| Log del consumidor: error en los intentos 1 a 4 | `evidencias/caso3-log-consumidor.png` |
| Mensaje en `pagos.registrados.fallidos` (no se perdió) | `evidencias/caso3-cola.png` |
| Pago `FALLA-...` en estado `REGISTRADO`, sin fila en `procesamientos` | `evidencias/caso3-pagos.png` |

## 3. Consulta del mismo pago antes y después (Postman)

| Momento | Estado | Captura |
|---|---|---|
| Inmediatamente después de registrar | `REGISTRADO` | `evidencias/postman-consulta-inmediata.png` |
| Pasados 10 s | `PROCESADO` | `evidencias/postman-consulta-10s.png` |

Otras peticiones de la colección (`postman/Lab03-Pagos-Async.postman_collection.json`):

| Petición | Resultado | Captura |
|---|---|---|
| Registrar pago válido | `201`, `status: true`, `REGISTRADO` | `evidencias/postman-registro-valido.png` |
| Registrar pago inválido | `400`, `status: false`, `Datos del pago inválidos` | `evidencias/postman-invalido.png` |
| Consultar un pago ya procesado (con datos del procesamiento) | `PROCESADO` | `evidencias/postman-consulta-procesado.png` |

## 4. Preguntas de cierre

### 1. ¿Cambió el tiempo de respuesta de la API al pasar la acción del consumidor de cinco a quince segundos? ¿Por qué?

**No cambió de forma significativa.** Con la acción de 3–5 s la media fue **19,89 ms**; con la acción de 15 s fue **23,64 ms**. Esa diferencia se explica por una sola petición: la primera de la corrida de 15 s tardó 90,69 ms (primer registro después de reiniciar los contenedores). Las otras 19 estuvieron entre 15,31 y 36,67 ms, con una media de **20,11 ms**, prácticamente igual a la primera medición. Los 20 registros se respondieron en 0,40 s y en 0,48 s respectivamente.

La razón es que la respuesta de la API solo depende de tres pasos: validar, hacer el `INSERT` en MySQL y publicar el mensaje en RabbitMQ (con confirmación del broker). En ningún momento espera al consumidor. La duración de la acción del consumidor solo afecta lo que pasa **después** de la respuesta, y eso sí cambió mucho:

| | 3–5 s | 15 s |
|---|---|---|
| Registro → procesamiento del último pago | 77,14 s | 300,39 s |
| Total hasta los 20 en PROCESADO | 77,52 s | 300,82 s |

La cola absorbe la diferencia: a mitad de la corrida de 15 s había **12 mensajes esperando** en `pagos.registrados` (`caso2-cola.png`), mientras la API ya había respondido los 20. Lo mismo se vio en el caso 1: con el consumidor apagado, la API respondió en 20,45 ms de media.

### 2. Con el consumidor detenido, la API respondió que el pago fue registrado. ¿Qué le está prometiendo esa respuesta al cliente y qué no le está prometiendo?

**Lo que promete:**
- Que los datos del pago eran válidos (si no, habría respondido `status: false`).
- Que el pago **quedó guardado** en la base de datos con un identificador y en estado `REGISTRADO`, así que puede consultarlo con `GET /pagos/{id}`.
- Que el mensaje para procesarlo **quedó encolado de forma durable**: la API solo responde después de que RabbitMQ confirma que lo recibió (mensaje persistente en una cola durable). Por eso, cuando el consumidor vuelva, el pago se procesará. En el caso 1 los 5 pagos se registraron a las 19:51:49 y esperaron unos **4 minutos** en la cola sin perderse. Al levantar el consumidor se procesaron todos, entre las 19:55:48 y las 19:56:07.

**Lo que no promete:**
- Que el pago ya esté **procesado**: la respuesta dice `REGISTRADO`, no `PROCESADO`, y el comprobante todavía no existe.
- **Cuándo** se va a procesar: depende de que haya un consumidor encendido y de cuántos mensajes tenga delante. En el caso 1 fueron 4 minutos; con el consumidor apagado indefinidamente, no habría límite.
- Que el procesamiento **vaya a salir bien**: en el caso 3, el pago `FALLA-1790643872133` fue aceptado con la misma respuesta, pero falló en los 4 intentos, quedó en `REGISTRADO` y su mensaje terminó en `pagos.registrados.fallidos`. No se perdió, pero necesita que alguien lo revise.

Es decir, la respuesta es un **acuse de recibo**, no una confirmación de que el trabajo se hizo. Para saber el resultado final, el cliente tiene que volver a consultar el pago, como se hace en Postman a los 10 s.

### 3. Si este sistema tuviera un plazo declarado, ¿sobre qué parte del flujo se podría declarar y sobre cuál no? Justifique con sus mediciones.

**Se puede declarar sobre el registro** (pasos 1 a 5: validar, guardar, encolar y responder). Esa parte depende solo de la API, MySQL y RabbitMQ, y fue estable en todas las pruebas:

| Prueba | Peticiones | Media | Máximo |
|---|---|---|---|
| Medición (3–5 s) | 20 | 19,89 ms | 30,93 ms |
| Caso 1 (consumidor apagado) | 5 | 20,45 ms | 24,63 ms |
| Caso 2 (15 s) | 20 | 23,64 ms | 90,69 ms |

En las 45 peticiones el tiempo nunca pasó de 91 ms, sin importar si el consumidor estaba lento o apagado. Un plazo como "el pago queda registrado y se responde en menos de 200 ms" se puede cumplir con margen.

**No se puede declarar sobre el procesamiento** (pasos 6 a 8), al menos no sin condiciones, porque ese tiempo depende de cosas que la API no controla:
- **La duración de la acción:** el último pago pasó de 77,14 s a 300,39 s solo por cambiar la acción de 3–5 s a 15 s.
- **El lugar en la cola:** con un solo consumidor que procesa uno a la vez, cada pago espera a los anteriores. Con 15 s, el pago 1 se procesó a los 15,08 s y el pago 20 a los 300,39 s. La espera crece con la posición: unos 15 s más por cada pago que tiene delante.
- **La disponibilidad del consumidor:** en el caso 1 los pagos esperaron unos 4 minutos solo porque el consumidor estaba apagado. Si nadie lo enciende, no hay límite.
- **Los fallos:** en el caso 3 el pago nunca llegó a `PROCESADO`.

Como mucho, se podría declarar un plazo **condicionado** para el procesamiento. Por ejemplo: "con el consumidor disponible y sin fallos, un pago se procesa en aproximadamente (mensajes en cola + 1) × duración de la acción". Para cumplir un plazo así habría que controlar la capacidad, por ejemplo agregando consumidores en paralelo. La respuesta de la API, en cambio, sí se puede garantizar, y esa es precisamente la ventaja de separar el registro del procesamiento.

## 5. Declaración de uso de herramientas de inteligencia artificial

**Herramienta utilizada:** Claude Code (Anthropic), un asistente de programación con IA que ejecuta comandos y edita archivos en el equipo, siempre por instrucción nuestra.

**Finalidad:**

| Parte del taller | Qué hizo la IA | Qué hicimos nosotros |
|---|---|---|
| Diseño y código | Escribió la API (Node.js/Express), el consumidor, el script SQL, los Dockerfiles, el `docker-compose.yml` y la herramienta de medición | Elegimos el lenguaje (Node.js), pedimos cada parte y revisamos el código |
| Repositorio | Creó el repositorio en GitHub, invitó a la compañera como colaboradora y preparó los commits y el pull request | El merge del pull request lo hacemos nosotros |
| Puesta en marcha | Levantó el entorno en Docker y corrigió problemas del equipo: el puerto 3000 reservado por Windows, el choque de puertos con el laboratorio N.º 2 y el reinicio de los contenedores | Reportamos los errores que aparecían en nuestras pruebas |
| Postman | Creó la colección y explicó cómo importarla y ejecutarla | Importamos la colección, ejecutamos las peticiones y tomamos las capturas |
| Medición y casos 1 y 3 | Dio las instrucciones y los comandos, y revisó que las capturas mostraran lo correcto | Ejecutamos los comandos y tomamos las capturas |
| Caso 2 | Ejecutó la medición con la acción de 15 s y tomó las capturas de las ventanas de consola | Lo solicitamos |
| Informe | Llenó las tablas de medición y redactó un borrador de las respuestas a las preguntas de cierre a partir de nuestros datos | Verificamos que los números de las tablas y de las respuestas coinciden con las capturas y con los archivos de `resultados/` |
| Instructivo | Redactó el README | Lo usamos para levantar el entorno y ejecutar las pruebas |

**Qué modificamos del resultado:**

No modificamos el código ni los textos generados. Nuestro trabajo sobre el resultado fue de revisión:

- **Revisamos el código** de la API, del consumidor y del `docker-compose.yml`, en particular el orden de las operaciones: validar, guardar, publicar y responder sin esperar al consumidor, y confirmar el mensaje (`ack`) solo al final del procesamiento.
- **Verificamos los datos**: comparamos los valores de las tablas de medición y de las respuestas de cierre con las capturas y con los informes de `resultados/`.

**Otras herramientas de IA:** ninguna. Solo se utilizó Claude Code.
