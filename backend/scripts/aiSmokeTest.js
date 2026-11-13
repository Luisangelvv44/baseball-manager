// Prueba manual de la IA: manda los mismos prompts a cada modelo de la cadena y muestra
// texto, latencia, tokens y coste. No toca la base de datos.
// Uso (desde backend/): node scripts/aiSmokeTest.js
const ai = require('../services/aiService');

const SYSTEM =
  'Eres el redactor de un juego de gestion de beisbol en espanol neutro latinoamericano. ' +
  'Escribes textos breves, con personalidad, sin inventar datos que no se te den.';

const CASES = [
  {
    name: 'Rueda de prensa (JSON)',
    json: true,
    prompt:
      'Genera 3 preguntas de periodista para la rueda de prensa del manager de los Halcones de Norte. ' +
      'Contexto: acaban de ganar 3-0 la serie contra su rival historico, los Toros de Sur; llevan 5 victorias seguidas; ' +
      'son 1.o de la Division Oeste Norte; su campocorto Leo Paz esta lesionado. ' +
      'La rueda la presenta "Canal Deportivo 7", una cadena seria y analitica. ' +
      'Responde SOLO con JSON: {"questions": ["...", "...", "..."]}',
  },
  {
    name: 'Rechazo de traspaso',
    prompt:
      'Eres el GM de los Toros de Sur. Rechazas esta oferta de los Halcones de Norte: ' +
      'te piden a tu lanzador Marco Diaz (27 anos, skill 78, $4.2M) a cambio de su jardinero Pedro Soto ' +
      '(34 anos, skill 71, $9.8M). Motivos calculados por el juego: el jugador ofrecido es viejo y caro; ' +
      'te falta un campocorto. Escribe el mensaje de respuesta al usuario en 2-3 frases, educado pero firme, ' +
      'dando una pista de que aceptarias si incluyen un campocorto joven.',
  },
  {
    name: 'Biografia Hall of Fame',
    maxTokens: 500,
    prompt:
      'Escribe una biografia de 1 parrafo (maximo 120 palabras) para la induccion al Salon de la Fama de ' +
      'Ramon "El Muro" Castillo, catcher. Datos: 18 temporadas (2 con Toros de Sur, 16 con Halcones de Norte), ' +
      '412 HR, promedio .291, 3 MVP, 2 campeonatos con Halcones. Retirado a los 40. Su hijo Andres esta en el programa juvenil.',
  },
];

async function main() {
  if (!ai.isEnabled()) {
    console.error('Falta OPENROUTER_API_KEY en backend/.env');
    process.exit(1);
  }
  let total = 0;
  for (const model of ai.modelChain()) {
    console.log(`\n================ ${model} ================`);
    for (const c of CASES) {
      console.log(`\n--- ${c.name} ---`);
      try {
        const r = await ai.callModel(model, { system: SYSTEM, ...c });
        total += r.cost;
        console.log(r.text);
        const u = r.usage || {};
        const reasoning = u.completion_tokens_details?.reasoning_tokens ?? 0;
        console.log(
          `[${r.latencyMs} ms | in ${u.prompt_tokens} / out ${u.completion_tokens} (razonamiento ${reasoning}) | $${r.cost.toFixed(6)}${c.json ? ' | JSON ok' : ''}]`,
        );
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
      }
    }
  }
  console.log(`\nCoste total de la prueba: $${total.toFixed(6)}`);
}

main();
