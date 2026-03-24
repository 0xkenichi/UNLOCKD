const fs = require('fs');
const path = require('path');

// Basic OpenAPI 3.0.0 template
const openapi = {
  openapi: '3.0.0',
  info: {
    title: 'Vestra Protocol API',
    description: 'Sovereign Credit Primitive for borrowing against locked or vesting token claims.',
    version: '1.0.0',
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Local Development Server'
    },
    {
      url: 'https://api.vestra.finance',
      description: 'Production API'
    }
  ],
  paths: {
    '/api/health': {
      get: {
        summary: 'Health Check',
        responses: {
          '200': {
            description: 'API is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    service: { type: 'string' },
                    uptimeSec: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/identity/{walletAddress}': {
      get: {
        summary: 'Get Identity Profile',
        parameters: [
          {
            name: 'walletAddress',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'Identity profile details'
          }
        }
      }
    },
    '/api/vesting/validate': {
      post: {
        summary: 'Validate Vesting Contract',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  vestingContract: { type: 'string' },
                  protocol: { type: 'string', enum: ['manual', 'sablier'] }
                },
                required: ['vestingContract']
              }
            }
          }
        },
        responses: {
          '200': { description: 'Validation result' }
        }
      }
    },
    '/api/agent/chat': {
      post: {
        summary: 'AI Agent Chat',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  history: { type: 'array', items: { type: 'object' } }
                },
                required: ['message']
              }
            }
          }
        },
        responses: {
          '200': { description: 'Agent response' }
        }
      }
    },
    '/api/pools': {
      get: {
        summary: 'List Community Pools',
        responses: {
          '200': { description: 'Array of pools' }
        }
      }
    },
    '/api/match/quote': {
      post: {
        summary: 'Get Loan Quote',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  chain: { type: 'string', enum: ['base', 'solana'] },
                  desiredAmountUsd: { type: 'number' },
                  collateralId: { type: 'string' }
                },
                required: ['chain', 'desiredAmountUsd']
              }
            }
          }
        },
        responses: {
          '200': { description: 'Loan offer' }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      AdminKey: {
        type: 'apiKey',
        in: 'header',
        name: 'x-admin-key'
      }
    }
  }
};

const outputPath = path.join(__dirname, '..', 'vestra-protocol-api.json');
fs.writeFileSync(outputPath, JSON.stringify(openapi, null, 2));
console.log(`OpenAPI spec generated at ${outputPath}`);
