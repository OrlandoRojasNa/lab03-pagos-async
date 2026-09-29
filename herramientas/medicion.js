// Medición del punto 8 del taller. Se ejecuta dentro de Docker:
//
//   docker compose run --rm medicion                 -> 20 pagos, espera a que todos queden PROCESADO
//   docker compose run --rm medicion 5 --sin-esperar -> 5 pagos, no espera (caso 1: consumidor detenido)
//   docker compose run --rm medicion 20 --etiqueta caso2-15s
//
// Los tiempos de respuesta se miden en el cliente (ida y vuelta HTTP).
// Los tiempos registro -> procesamiento salen de la base de datos
// (pagos.fecha_registro y procesamientos.fecha_procesamiento), a través de GET /pagos/:id.
const fs = require('fs');

const API = process.env.API_URL || 'http://api:3000';
const args = process.argv.slice(2);
const N = Number(args.find((a) => /^\d+$/.test(a)) || 20);
const SIN_ESPERAR = args.includes('--sin-esperar');
const iEtiqueta = args.indexOf('--etiqueta');
const ETIQUETA = iEtiqueta >= 0 ? args[iEtiqueta + 1] : 'medicion';
const MEDIOS = ['transferencia', 'tarjeta', 'efectivo', 'pse', 'nequi'];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const aFecha = (s) => new Date(s.replace(' ', 'T') + '-05:00'); // la BD guarda hora de Colombia
const ms = (x) => `${x.toFixed(2)} ms`;
const seg = (x) => `${(x / 1000).toFixed(2)} s`;

async function esperarApi() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${API}/salud`);
      if (r.ok && (await r.json()).data.rabbitmq) return;
    } catch { /* aún no está lista */ }
    await esperar(2000);
  }
  throw new Error(`La API no respondió en ${API}`);
}

async function main() {
  await esperarApi();
  const lote = Date.now().toString(36).toUpperCase();
  const enviados = [];

  console.log(`\nEnviando ${N} pagos seguidos a ${API}/pagos ...`);
  const inicioLote = Date.now();
  for (let i = 1; i <= N; i++) {
    const cuerpo = {
      referencia: `PAG-${lote}-${String(i).padStart(4, '0')}`,
      valor: 10000 * i + 5000,
      medio: MEDIOS[i % MEDIOS.length],
    };
    const t0 = performance.now();
    const r = await fetch(`${API}/pagos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const json = await r.json();
    const t = performance.now() - t0;
    if (json.status !== true) throw new Error(`Registro rechazado: ${JSON.stringify(json)}`);
    enviados.push({ id: json.data.id, referencia: cuerpo.referencia, respuestaMs: t });
    console.log(`  #${String(i).padStart(2)}  id=${json.data.id}  ${json.data.estado}  ${ms(t)}`);
  }

  const tiempos = enviados.map((e) => e.respuestaMs);
  const media = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
  const maximo = Math.max(...tiempos);
  const minimo = Math.min(...tiempos);
  console.log(`\nRespuesta de la API: media ${ms(media)} | máx ${ms(maximo)} | mín ${ms(minimo)}`);
  console.log(`Los ${N} registros tardaron en total ${seg(Date.now() - inicioLote)} en ser respondidos.`);

  if (SIN_ESPERAR) {
    console.log('\n--sin-esperar: no se espera el procesamiento. IDs registrados:', enviados.map((e) => e.id).join(', '));
    return;
  }

  console.log('\nEsperando a que el consumidor procese todos los pagos...');
  const detalle = new Map();
  const limite = Date.now() + 30 * 60 * 1000;
  while (detalle.size < N) {
    if (Date.now() > limite) throw new Error('Se agotó el tiempo de espera (30 min)');
    for (const e of enviados) {
      if (detalle.has(e.id)) continue;
      const { data } = await (await fetch(`${API}/pagos/${e.id}`)).json();
      if (data.estado === 'PROCESADO') detalle.set(e.id, data);
    }
    process.stdout.write(`\r  procesados: ${detalle.size}/${N}   `);
    if (detalle.size < N) await esperar(1000);
  }
  console.log('\n');

  const filas = enviados.map((e) => {
    const d = detalle.get(e.id);
    const registro = aFecha(d.fecha_registro);
    const toma = aFecha(d.procesamiento.fecha_toma);
    const fin = aFecha(d.procesamiento.fecha_procesamiento);
    return { ...e, registro, toma, fin, enCola: toma - registro, total: fin - registro };
  });
  const primero = filas[0];
  const ultimo = filas[filas.length - 1];
  const inicio = Math.min(...filas.map((f) => f.registro));
  const final = Math.max(...filas.map((f) => f.fin));

  const tabla = [
    '| Medida | Valor observado |',
    '|---|---|',
    `| Tiempo de respuesta de la API (media de los ${N} registros) | ${ms(media)} |`,
    `| Tiempo de respuesta de la API (máximo observado) | ${ms(maximo)} |`,
    `| Tiempo entre el registro y el procesamiento del primer pago | ${seg(primero.total)} |`,
    `| Tiempo entre el registro y el procesamiento del último pago | ${seg(ultimo.total)} |`,
    `| Tiempo total hasta que los ${N} pagos quedaron en estado PROCESADO | ${seg(final - inicio)} |`,
  ].join('\n');

  const hora = (d) => d.toLocaleTimeString('es-CO', { hour12: false, timeZone: 'America/Bogota' }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  const tablaDetalle = [
    '| # | id | Respuesta API | Registrado | Tomado de la cola | Procesado | Espera en cola | Registro → procesado |',
    '|---|---|---|---|---|---|---|---|',
    ...filas.map((f, i) =>
      `| ${i + 1} | ${f.id} | ${ms(f.respuestaMs)} | ${hora(f.registro)} | ${hora(f.toma)} | ${hora(f.fin)} | ${seg(f.enCola)} | ${seg(f.total)} |`),
  ].join('\n');

  const informe = [
    `# Medición: ${ETIQUETA}`,
    '',
    `Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })} — ${N} pagos enviados seguidos (uno tras otro).`,
    `Tiempo de respuesta de la API: mínimo ${ms(minimo)}.`,
    '',
    tabla,
    '',
    '## Detalle por pago',
    '',
    tablaDetalle,
    '',
  ].join('\n');

  console.log(tabla, '\n');
  console.log(tablaDetalle, '\n');

  fs.mkdirSync('/resultados', { recursive: true });
  const archivo = `/resultados/${ETIQUETA}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  fs.writeFileSync(archivo, informe);
  console.log(`Informe guardado en ./resultados/${archivo.split('/').pop()}`);
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
