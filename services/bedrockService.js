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

  const timeoutMs = parseInt(process.env.BEDROCK_TIMEOUT_MS, 10) || 25000;
  const controller = new AbortController();

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`AI product scan timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const startedAt = Date.now();
  const { logAiCall } = require('./aiCallLog');

  let response;
  try {
    response = await Promise.race([
      bedrockClient.send(command, { abortSignal: controller.signal }),
      timeoutPromise,
    ]);
  } catch (err) {
    const timedOut = /timed out/i.test(err.message) || err.name === 'AbortError';
    logAiCall({
      kind: 'ai_scan',
      status: timedOut ? 'timeout' : 'error',
      latencyMs: Date.now() - startedAt,
      error: err.message,
    });
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const contentList = response.output?.message?.content;
  if (!contentList || !contentList.length || !contentList[0].text) {
    logAiCall({ kind: 'ai_scan', status: 'error', latencyMs: Date.now() - startedAt, error: 'Invalid response structure' });
    throw new Error('Invalid response structure from Bedrock Converse API');
  }

  const rawText = contentList[0].text;
  const parsed = parseModelJson(rawText);
  logAiCall({ kind: 'ai_scan', status: 'ok', latencyMs: Date.now() - startedAt });
  return parsed;
}

function parseModelJsonArray(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty response received from Bedrock model');
  }

  let text = rawText.trim();

  // Strip markdown code fences if returned by the model
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  // Find first '[' and last ']' to handle any extra commentary text around JSON
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    text = text.substring(firstBracket, lastBracket + 1);
  }

  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error('Bedrock model did not return a JSON array');
  }
  return parsed;
}

/**
 * Scan a photo of a handwritten or printed shopping list using AWS Bedrock Converse API
 * @param {Buffer} imageBuffer Raw image buffer
 * @param {string} mimetype Image MIME type (e.g. image/jpeg, image/png)
 * @returns {Promise<Array<{item: string, qty: string}>>}
 */
async function scanShoppingList(imageBuffer, mimetype) {
  if (!imageBuffer || !(imageBuffer instanceof Buffer || imageBuffer instanceof Uint8Array)) {
    throw new Error('A valid image buffer is required');
  }

  const format = getImageFormat(mimetype);
  const prompt = `Look at this photo of a handwritten or printed shopping list. Extract every list item.
Return ONLY a valid JSON array with one entry per list item, like:
[{"item": "...", "qty": "..."}]
"item": string (the list item text),
"qty": string (quantity exactly as written, e.g. "2 kg", "1 packet", or "" if not stated).
Do NOT include markdown formatting, backticks, or other text outside the JSON array.`;

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
    },
  });

  const timeoutMs = parseInt(process.env.BEDROCK_TIMEOUT_MS, 10) || 25000;
  const controller = new AbortController();

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`AI list scan timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const startedAt = Date.now();
  const { logAiCall } = require('./aiCallLog');

  let response;
  try {
    response = await Promise.race([
      bedrockClient.send(command, { abortSignal: controller.signal }),
      timeoutPromise,
    ]);
  } catch (err) {
    const timedOut = /timed out/i.test(err.message) || err.name === 'AbortError';
    logAiCall({
      kind: 'scan_list',
      status: timedOut ? 'timeout' : 'error',
      latencyMs: Date.now() - startedAt,
      error: err.message,
    });
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const contentList = response.output?.message?.content;
  if (!contentList || !contentList.length || !contentList[0].text) {
    logAiCall({ kind: 'scan_list', status: 'error', latencyMs: Date.now() - startedAt, error: 'Invalid response structure' });
    throw new Error('Invalid response structure from Bedrock Converse API');
  }

  const rawText = contentList[0].text;
  const parsed = parseModelJsonArray(rawText);
  logAiCall({ kind: 'scan_list', status: 'ok', latencyMs: Date.now() - startedAt });
  return parsed;
}

module.exports = {
  scanProductImage,
  scanShoppingList,
  parseModelJson,
  parseModelJsonArray,
  getImageFormat,
};
