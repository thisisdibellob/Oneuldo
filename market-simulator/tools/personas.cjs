'use strict';
// Persona catalog.
// Handler bodies were moved verbatim from server.cjs.
const { schema } = require('./schema.cjs');
const definitions = [
  { name: 'list_personas', description: 'List available personas for intent trace generation.', inputSchema: schema({}), annotations: { readOnlyHint: true } },
];
async function invoke(name, args, ctx) {
  if (name === 'list_personas') {
    const personas = require('../src/personas.ts').listPersonas();
    return { personas: personas.map(({ prompt, ...profile }) => profile) };
  }
  throw new Error('Unsupported tool.');
}
module.exports = { definitions, invoke };
