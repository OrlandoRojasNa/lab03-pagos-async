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

## 4. Preguntas de cierre

_Pendientes: se responden con los datos de la medición propia._

1. **¿Cambió el tiempo de respuesta de la API al pasar la acción del consumidor de cinco a quince segundos? ¿Por qué?**

2. **Con el consumidor detenido, la API respondió que el pago fue registrado. ¿Qué le está prometiendo esa respuesta al cliente y qué no le está prometiendo?**

3. **Si este sistema tuviera un plazo declarado, ¿sobre qué parte del flujo se podría declarar y sobre cuál no?**

## 5. Declaración de uso de herramientas de inteligencia artificial

| Herramienta | Finalidad | Qué se modificó del resultado |
|---|---|---|
| Claude Code (Anthropic) | _completar_ | _completar_ |
