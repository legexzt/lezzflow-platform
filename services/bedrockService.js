const { ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const { bedrockClient, BEDROCK_MODEL_ID } = require('../config/aws');

function getImageFormat(mimetype) {
  if (!mimetype) return 'jpeg';
  const type = mimetype.toLowerCase();
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  return 'jpeg';
}

function parseModelJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty response received from Bedrock model');
  }

  let text = rawText.trim();

  // Strip markdown code fences if returned by the model
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  // Find first '{' and last '}' to handle any extra commentary text around JSON
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(text);
  return {
    name: parsed.name || '',
    category: parsed.category || '',
    description: parsed.description || '',
  };
}

/**
 * Scan product image using AWS Bedrock Converse API with moonshotai.kimi-k3 model
 * @param {Buffer} imageBuffer Raw image buffer
 * @param {string} mimetype Image MIME type (e.g. image/jpeg, image/png)
 * @returns {Promise<{name: string, category: string, description: string}>}
 */
async function scanProductImage(imageBuffer, mimetype) {
  if (!imageBuffer || !(imageBuffer instanceof Buffer || imageBuffer instanceof Uint8Array)) {
    throw new Error('A valid image buffer is required');
  }

  const format = getImageFormat(mimetype);
  const prompt = `Analyze this product image. Identify the product name, its category, and a concise description.
Return ONLY a valid JSON object with the exact keys:
"name": string (product name),
"category": string (product category),
"description": string (brief description of the product).
Do NOT include markdown formatting, backticks, or other text outside the JSON.`;

  const command = new ConverseCommand({
    modelId: BEDROCK_MODEL_ID,
    messages: [
      {
        role: 'user',
        content: [
          {
            image: {
              format,
              source: {
                bytes: imageBuffer,
              },
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    inferenceConfig: {
      maxTokens: 512,
      temperature: 0.1,
    },
  });

  const response = await bedrockClient.send(command);

  const contentList = response.output?.message?.content;
  if (!contentList || !contentList.length || !contentList[0].text) {
    throw new Error('Invalid response structure from Bedrock Converse API');
  }

  const rawText = contentList[0].text;
  return parseModelJson(rawText);
}

module.exports = {
  scanProductImage,
  parseModelJson,
  getImageFormat,
};
