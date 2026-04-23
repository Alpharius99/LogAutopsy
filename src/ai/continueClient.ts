import * as vscode from 'vscode';
import {
  formatDiagnosticError,
  getDiagnosticsChannel,
  setLastDiagnosticMessage,
} from '../utils/diagnostics';

export interface ContinueOptions {
  systemPrompt?: string;
  temperature?: number;
  justification?: string;
  token?: vscode.CancellationToken;
  onToken?: (token: string) => void;
}

const DEFAULT_SYSTEM_PROMPT = [
  'You are a C# diagnostics assistant.',
  'RULES:',
  '- Always return valid JSON only',
  '- No explanations outside JSON',
  '- Be precise and technical',
  '- Do not hallucinate',
].join('\n');

function modelSelector(): vscode.LanguageModelChatSelector {
  const config = vscode.workspace.getConfiguration('testAnalysisAgent.continue');
  const vendor = config.get<string>('vendor');
  const family = config.get<string>('family');
  const id = config.get<string>('modelId');

  return {
    vendor: vendor || undefined,
    family: family || undefined,
    id: id || undefined,
  };
}

function selectorSummary(selector: vscode.LanguageModelChatSelector): string {
  return JSON.stringify(selector);
}

function modelSummary(model: unknown): string {
  if (!model || typeof model !== 'object') {
    return 'unknown-model';
  }

  const fields = model as Record<string, unknown>;
  const vendor = typeof fields.vendor === 'string' ? fields.vendor : 'unknown-vendor';
  const family = typeof fields.family === 'string' ? fields.family : 'unknown-family';
  const id = typeof fields.id === 'string' ? fields.id : 'unknown-id';
  const name = typeof fields.name === 'string' ? fields.name : undefined;
  return name ? `${name} (${vendor}/${family}/${id})` : `${vendor}/${family}/${id}`;
}

export async function analyzeWithContinue(
  userPrompt: string,
  options: ContinueOptions = {}
): Promise<string> {
  const diagnostics = getDiagnosticsChannel();
  const selector = modelSelector();
  diagnostics.info(`Selecting language model with selector ${selectorSummary(selector)}`);

  const models = await vscode.lm.selectChatModels(selector);
  if (models.length === 0) {
    diagnostics.error('No VS Code language model matched the configured selector.');
    throw new Error('No VS Code language model is available for Continue analysis.');
  }

  const model = models[0];
  diagnostics.info(
    `Selected language model ${modelSummary(model)} from ${models.length} candidate(s).`
  );
  const prompt = [
    options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    '',
    userPrompt,
  ].join('\n');
  const messages = [vscode.LanguageModelChatMessage.User(prompt)];

  let response: vscode.LanguageModelChatResponse;
  try {
    response = await model.sendRequest(
      messages,
      {
        justification:
          options.justification ??
          'Analyze test failure artifacts and return structured JSON for root cause diagnosis.',
        modelOptions: {
          temperature: options.temperature ?? 0.2,
        },
      },
      options.token
    );
  } catch (error) {
    diagnostics.error(`Language model request failed.\n${formatDiagnosticError(error)}`);
    throw error;
  }

  let text = '';
  try {
    for await (const chunk of response.text) {
      text += chunk;
      options.onToken?.(chunk);
    }
  } catch (error) {
    diagnostics.error(`Language model streaming failed.\n${formatDiagnosticError(error)}`);
    throw error;
  }

  return text.trim();
}

export async function ensureContinueModelAvailable(): Promise<void> {
  const diagnostics = getDiagnosticsChannel();
  const selector = modelSelector();
  diagnostics.info(`Running language model preflight with selector ${selectorSummary(selector)}`);

  const models = await vscode.lm.selectChatModels(selector);
  if (models.length > 0) {
    diagnostics.info(`Language model preflight succeeded with ${models.length} candidate(s).`);
    return;
  }

  const message = [
    'No VS Code chat model is available for Test Analysis Agent.',
    `Configured selector: ${selectorSummary(selector)}`,
    'Install or enable a VS Code language model provider, then verify chat works in this VS Code session.',
    'Examples: GitHub Copilot Chat or another extension that exposes chat models through the VS Code Language Model API.',
  ].join('\n');

  diagnostics.error(message);
  setLastDiagnosticMessage(message);
  throw new Error(message);
}

export function defaultContinueSystemPrompt(): string {
  return DEFAULT_SYSTEM_PROMPT;
}
