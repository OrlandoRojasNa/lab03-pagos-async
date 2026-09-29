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
| Tiempo de respuesta de la API (media de los 20 registros) | _pendiente_ |
| Tiempo de respuesta de la API (máximo observado) | _pendiente_ |
| Tiempo entre el registro y el procesamiento del primer pago | _pendiente_ |
| Tiempo entre el registro y el procesamiento del último pago | _pendiente_ |
| Tiempo total hasta que los 20 pagos quedaron en estado PROCESADO | _pendiente_ |

## 2. Casos del punto 9

### Caso 1 — Consumidor detenido

| Evidencia | Captura |
|---|---|
| Respuestas de la API con el consumidor apagado | `evidencias/caso1-api.png` |
| Cola `pagos.registrados` con 5 mensajes *ready* y 0 consumidores | `evidencias/caso1-cola.png` |
| Tabla `pagos` con los 5 en `REGISTRADO` | `evidencias/caso1-pagos-registrado.png` |
| Log del consumidor al levantarlo, procesando los 5 | `evidencias/caso1-log-consumidor.png` |
| Tabla `pagos` con los 5 en `PROCESADO` y cola en 0 | `evidencias/caso1-pagos-procesado.png` |

### Caso 2 — Acción de 15 s

| Medida | Acción 3–5 s | Acción 15 s |
|---|---|---|
| Respuesta de la API (media) | _pendiente_ | _pendiente_ |
| Respuesta de la API (máximo) | _pendiente_ | _pendiente_ |
| Registro → procesamiento, primer pago | _pendiente_ | _pendiente_ |
| Registro → procesamiento, último pago | _pendiente_ | _pendiente_ |
| Total hasta los 20 en PROCESADO | _pendiente_ | _pendiente_ |

### Caso 3 — Fallo al procesar

| Evidencia | Captura |
|---|---|
| Log del consumidor: error en los intentos 1, 2 y 3 | `evidencias/caso3-log-consumidor.png` |
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
