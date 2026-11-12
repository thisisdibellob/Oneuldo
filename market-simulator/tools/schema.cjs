'use strict';
// Shared JSON-schema fragments for tool definitions.
const string = { type: 'string', minLength: 1 };
const seed = { anyOf: [string, { type: 'number' }] };
const object = { type: 'object' };
const llm = { type: 'object', additionalProperties: false, properties: { protocol: { enum: ['openai', 'ollama'] }, baseUrl: string, model: string, apiKeyEnv: string, maxCalls: { type: 'integer', minimum: 1, maximum: 2000 }, timeoutMs: { type: 'integer', minimum: 1, maximum: 300000 } } };
const schema = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const feedbackMovement = schema({wanderProbability:{type:'number',minimum:0,maximum:1}});
const wholeTraceRepair = schema({
  decisions:{type:'array',minItems:1,maxItems:100,items:object},
  repairVersion:{const:'1'},requestId:string,baseAttempt:{type:'integer',minimum:1},
  fromDecisionIndex:{type:'integer',minimum:0},candidateVersion:{enum:['3','4','5','6','7']},
},['decisions']);
module.exports = { string, seed, object, llm, schema, feedbackMovement, wholeTraceRepair };
