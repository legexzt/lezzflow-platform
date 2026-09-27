const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
require('dotenv').config({ quiet: true });

const region = process.env.AWS_REGION || 'us-east-1';

// Uses standard AWS credential resolution chain (env vars, ~/.aws/credentials, IAM role, etc.)
const bedrockClient = new BedrockRuntimeClient({
  region,
});

const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'moonshotai.kimi-k3';

module.exports = {
  bedrockClient,
  BEDROCK_MODEL_ID,
  region,
};
