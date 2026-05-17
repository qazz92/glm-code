#!/usr/bin/env node
const readline = require('node:readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const handlers = {
  initialize: async () => ({
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: { name: 'glm-code-testbed-tools', version: '1.0.0' },
  }),
  'tools/list': async () => ({
    tools: [
      {
        name: 'testbed_echo',
        description: 'Echo a message from the GLM Code testbed MCP server',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to echo' },
          },
          required: ['message'],
        },
      },
      {
        name: 'testbed_task_count',
        description: 'Return the number of sample tasks in the testbed',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  }),
  'tools/call': async (params) => {
    if (params.name === 'testbed_echo') {
      return {
        content: [{ type: 'text', text: String(params.arguments.message) }],
      };
    }
    if (params.name === 'testbed_task_count') {
      return { content: [{ type: 'text', text: '3' }] };
    }
    throw new Error(`Unknown tool: ${params.name}`);
  },
};

rl.on('line', async (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  const handler = handlers[message.method];
  if (!handler) {
    if (message.id !== undefined) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: 'Method not found' },
      });
    }
    return;
  }

  try {
    const result = await handler(message.params || {});
    if (message.id !== undefined)
      send({ jsonrpc: '2.0', id: message.id, result });
  } catch (error) {
    if (message.id !== undefined) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32603, message: error.message },
      });
    }
  }
});

send({ jsonrpc: '2.0', method: 'initialized' });
