# Taller N.º 3 — Procesamiento asíncrono de eventos

**Sistemas Distribuidos · Ingeniería de Software IX · FET · 2026-2**

Registro de pagos en el que la API **guarda el pago y responde de inmediato**, y el procesamiento posterior (generar un comprobante) ocurre de forma independiente, disparado por un mensaje en RabbitMQ.

```
 Cliente ──POST /pagos──►  API  ──INSERT (REGISTRADO)──►  MySQL
    ▲                       │                               ▲
    └──── 201 inmediato ◄───┤                               │
                            └──publica {pagoId}──► RabbitMQ │
                                                     │      │
                                          Consumidor ◄┘      │
                              (3–5 s: genera comprobante)   │
                              UPDATE PROCESADO + INSERT ────┘
                              procesamientos, luego ACK
```

| Servicio | Tecnología | Puerto en el equipo |
|---|---|---|
| `mysql` | MySQL 8.4 | 3307 (opcional, para un cliente gráfico) |
| `rabbitmq` | RabbitMQ 4.1 + panel de administración | **15672** (panel) |
| `api` | Node.js 22 + Express | **8000** (dentro de Docker escucha en el 3000) |
| `consumer` | Node.js 22 | — |

Todo corre en contenedores. En el equipo solo se usa Docker, Postman, el navegador y el editor.

---

## 1. Instructivo: levantar el entorno desde cero

**Requisito único:** Docker con Docker Compose v2 (Docker Desktop en Windows/macOS, o Docker Engine en Linux).

```bash
git clone https://github.com/OrlandoRojasNa/lab03-pagos-async.git
cd lab03-pagos-async
docker compose up -d --build
```

Ese es el único comando. La primera vez tarda unos minutos porque descarga las imágenes. MySQL y RabbitMQ tardan unos segundos en quedar listos; la API y el consumidor **reintentan la conexión cada 3 s** en lugar de fallar, así que es normal ver mensajes `no disponible ... reintento` al principio.

Comprobar que todo quedó arriba:

```bash
docker compose ps
docker compose logs -f api consumer
```

Cuando aparezcan `[api] escuchando en el puerto 3000` y `[consumidor] esperando mensajes`, el entorno está listo.

| Qué | Dónde |
|---|---|
| API | http://localhost:8000/pagos |
| Estado de la API | http://localhost:8000/salud |
| Panel de RabbitMQ | http://localhost:15672 — usuario `guest`, clave `guest` |

> **Si el puerto 15672 ya está ocupado** (por ejemplo, por el RabbitMQ del laboratorio N.º 2), apague ese entorno o publique el panel en otro puerto: `RABBITMQ_PANEL_PORT=15673 docker compose up -d --build` (en PowerShell: `$env:RABBITMQ_PANEL_PORT=15673; docker compose up -d --build`). Para no repetirlo en cada terminal, cree un archivo `.env` en la raíz del proyecto con la línea `RABBITMQ_PANEL_PORT=15673`; Docker Compose lo lee solo (está en `.gitignore`). El puerto AMQP 5672 no se publica en el equipo: la API y el consumidor llegan a RabbitMQ por la red interna de Docker.

Para apagar: `docker compose down`. Para borrar también los datos y empezar de cero: `docker compose down -v`.

---

## 2. La API

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/pagos` | Registra un pago. Responde sin esperar el procesamiento. |
| `GET` | `/pagos/:id` | Consulta un pago (incluye su procesamiento, si ya ocurrió). |
| `GET` | `/pagos?estado=REGISTRADO` | Lista los últimos pagos (apoyo para evidencias). |
| `GET` | `/salud` | Estado de la API y de la conexión con RabbitMQ. |

Petición:

```json
{"referencia": "PAG-0001", "valor": 125000, "medio": "transferencia"}
```

Respuesta (201):

```json
{"status": true, "message": "Pago registrado", "data": {"id": 1, "estado": "REGISTRADO"}}
```

Datos inválidos (400) — no se inserta ni se publica nada:

```json
{"status": false, "message": "Datos del pago inválidos"}
```

Reglas de validación: `referencia` de 1 a 50 caracteres (letras, números, `-`, `_`), única; `valor` numérico mayor que 0; `medio` uno de `transferencia`, `tarjeta`, `efectivo`, `pse`, `nequi`, `daviplata`. Cada respuesta trae la cabecera `X-Response-Time`.

### Orden de las operaciones en `POST /pagos` ([api/src/index.js](api/src/index.js))

1. Valida. Si falla → `status: false` y termina.
2. `INSERT` en `pagos` con estado `REGISTRADO`.
3. Publica `{ "pagoId": <id> }` en la cola `pagos.registrados` **después** de guardar (mensaje persistente, con confirmación del broker).
4. Responde. No hay ninguna espera al consumidor.

## 3. El consumidor ([consumer/src/index.js](consumer/src/index.js))

- Toma **un mensaje a la vez** (`prefetch 1`) con confirmación manual.
- **Acción:** genera un comprobante de pago en `/app/comprobantes/comprobante-000001.txt` (volumen `comprobantes`). Tarda deliberadamente entre 3 y 5 s (aleatorio).
- En una sola transacción: `UPDATE pagos SET estado='PROCESADO'` + `INSERT INTO procesamientos`.
- **El `ack` se envía al final**, solo si todo lo anterior salió bien. Si hay error, hace `nack` con reencolado: el mensaje vuelve a la cola y el pago sigue `REGISTRADO`.
- La cola es de tipo *quorum* con `x-delivery-limit = 3`: tras el intento original y 3 reintentos fallidos (4 entregas), RabbitMQ mueve el mensaje a `pagos.registrados.fallidos`. En ningún caso se pierde.
- Si recibe un mensaje de un pago que ya está `PROCESADO` (entrega repetida), lo descarta sin procesarlo dos veces.
- En el log muestra el id del pago, la hora en que lo **tomó** de la cola y la hora en que **terminó**:

```
[consumidor] pago 7 | TOMADO de la cola a las 10:15:02.118 (intento 1)
[consumidor] pago 7 | TERMINADO a las 10:15:06.431 (duración 4.31 s) -> PROCESADO. Comprobante comprobante-000007.txt generado en 4.3 s
```

Ver los comprobantes generados:

```bash
docker compose exec consumer ls comprobantes
docker compose exec consumer cat comprobantes/comprobante-000001.txt
```

## 4. Tablas

Script: [db/init.sql](db/init.sql) (se ejecuta solo al crear el contenedor de MySQL por primera vez).

- `pagos(id, referencia, valor, medio, fecha_registro, estado)` — `estado` ∈ {`REGISTRADO`, `PROCESADO`}
- `procesamientos(id, pago_id, fecha_toma, fecha_procesamiento, resultado)`

Consultar las tablas (para capturas):

```bash
docker compose exec mysql mysql -upagos -ppagos pagos_db -e "SELECT * FROM pagos ORDER BY id DESC LIMIT 25;"
docker compose exec mysql mysql -upagos -ppagos pagos_db -e "SELECT * FROM procesamientos ORDER BY id DESC LIMIT 25;"
docker compose exec mysql mysql -upagos -ppagos pagos_db -e "SELECT estado, COUNT(*) FROM pagos GROUP BY estado;"
```

Estado de las colas (mensajes listos / sin confirmar):

```bash
docker compose exec rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
```

O en el panel: http://localhost:15672 → pestaña **Queues and Streams**.

---

## 5. Medición (punto 8)

La herramienta [herramientas/medicion.js](herramientas/medicion.js) corre en un contenedor de Node (no se instala nada en el equipo). Envía 20 pagos seguidos, mide el tiempo de respuesta de cada uno, espera a que todos queden `PROCESADO` y calcula la tabla con los tiempos guardados en la base de datos.

```bash
docker compose run --rm medicion
```

El informe queda en `resultados/medicion-<fecha>.md`, con la tabla del taller y el detalle por pago.

Opciones: `docker compose run --rm medicion <cantidad> [--sin-esperar] [--etiqueta nombre]`.

---

## 6. Casos del punto 9

### Caso 1 — Consumidor detenido

```bash
docker compose stop consumer
docker compose run --rm medicion 5 --sin-esperar --etiqueta caso1
```

(o enviar 5 pagos desde Postman). Evidencias:

- La API responde normal (`status: true`, tiempos en ms).
- `rabbitmqctl list_queues ...` → `pagos.registrados` con **5 mensajes ready** y 0 consumidores.
- `SELECT * FROM pagos ...` → los 5 en `REGISTRADO`.

Luego:

```bash
docker compose start consumer
docker compose logs -f consumer
```

El consumidor procesa los 5 (uno cada 3–5 s), la cola queda en 0 y los pagos en `PROCESADO`.

### Caso 2 — Acción más lenta (15 s)

En PowerShell:

```powershell
$env:PROCESO_MIN_MS=15000; $env:PROCESO_MAX_MS=15000; docker compose up -d consumer
docker compose run --rm medicion 20 --etiqueta caso2-15s
```

En Bash (Linux/macOS/Git Bash):

```bash
PROCESO_MIN_MS=15000 PROCESO_MAX_MS=15000 docker compose up -d consumer
docker compose run --rm medicion 20 --etiqueta caso2-15s
```

El log del consumidor debe mostrar `acción de 15-15 s` al arrancar. Comparar el tiempo de respuesta de la API con el de la medición normal. Los 20 pagos tardan unos 5 minutos en procesarse.

Para volver a 3–5 s: en PowerShell `Remove-Item Env:PROCESO_MIN_MS, Env:PROCESO_MAX_MS`, y luego `docker compose up -d consumer`.

### Caso 3 — Fallo al procesar

Cualquier pago cuya referencia empiece por **`FALLA`** provoca un error dentro del consumidor a mitad de la acción (petición 6 de Postman, o):

```bash
curl -X POST http://localhost:8000/pagos -H "Content-Type: application/json" -d "{\"referencia\":\"FALLA-0001\",\"valor\":50000,\"medio\":\"tarjeta\"}"
```

Lo que se observa:

- Log: `ERROR ... (intento 1)`, `el mensaje se devuelve a la cola; el pago sigue REGISTRADO`, y lo mismo en los intentos 2, 3 y 4.
- Tras el cuarto intento, `rabbitmqctl list_queues` muestra **1 mensaje en `pagos.registrados.fallidos`**: no se perdió.
- `SELECT * FROM pagos WHERE referencia LIKE 'FALLA%'` → sigue en `REGISTRADO`, y no hay fila en `procesamientos`.
- En el panel de RabbitMQ → cola `pagos.registrados.fallidos` → **Get messages** se puede ver el mensaje con `{"pagoId": ...}`.

Variante (caída a mitad de proceso): registrar un pago normal y, antes de que pasen 3 s, ejecutar `docker compose kill consumer`. El mensaje, que estaba *unacked*, vuelve a *ready*. Al hacer `docker compose start consumer` se procesa.

---

## 7. Postman

Importar [postman/Lab03-Pagos-Async.postman_collection.json](postman/Lab03-Pagos-Async.postman_collection.json). La variable `baseUrl` apunta a `http://localhost:8000`.

1. **Registrar pago válido** → guarda el `id` en la variable `pagoId`.
2. **Registrar pago inválido** → `status: false`.
3. **Consultar pago (inmediatamente)** → `REGISTRADO`.
4. **Consultar pago (pasados 10 segundos)** → espera 10 s antes de enviar → `PROCESADO`.
5. Consultar pago inexistente → 404.
6. Registrar pago que falla (caso 3).
7. Listar pagos en estado `REGISTRADO`.

Con **Run collection** se ejecutan en orden y las pruebas verifican que las consultas 3 y 4 muestran estados distintos.

---

## 8. Estructura

```
├── docker-compose.yml        # los 4 servicios (+ herramienta de medición)
├── db/init.sql               # creación de las tablas
├── comun/                    # conexión con reintentos y topología de la cola (API y consumidor)
├── api/                      # Dockerfile, package.json, src/index.js
├── consumer/                 # Dockerfile, package.json, src/index.js
├── herramientas/medicion.js  # medición del punto 8
├── postman/                  # colección exportada
├── resultados/               # informes de medición
└── docs/INFORME.md           # medición, casos, preguntas de cierre y declaración de IA
```
