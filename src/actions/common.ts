import type {
  Action,
  ActionExample,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import type { PumpdataClient, PumpdataResult } from '../client';
import { formatNotOk } from '../format';
import { getClient } from '../service';

export interface CallSpec<T> {
  name: string;
  similes: string[];
  description: string;
  examples: ActionExample[][];
  /** What the call is, for messages ("GET /launch"). */
  label: string;
  /** Whether the message (or options) carries what the call needs. */
  validate: (message: Memory, options?: Record<string, unknown>) => boolean;
  /** Runs the call; returns undefined with `missing` text when the input is not there. */
  run: (
    client: PumpdataClient,
    message: Memory,
    options: Record<string, unknown> | undefined
  ) => Promise<PumpdataResult<T> | { missing: string }>;
  format: (result: PumpdataResult<T>) => string;
}

export function makeAction<T>(spec: CallSpec<T>): Action {
  return {
    name: spec.name,
    similes: spec.similes,
    description: spec.description,
    examples: spec.examples,
    validate: async (_runtime: IAgentRuntime, message: Memory, _state?: State) =>
      spec.validate(message),
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      _state?: State,
      options?: Record<string, unknown>,
      callback?: HandlerCallback
    ): Promise<ActionResult> => {
      const client = getClient(runtime);
      let text: string;
      let success = false;
      let data: Record<string, unknown> = {};
      try {
        const result = await spec.run(client, message, options);
        if ('missing' in result) {
          text = result.missing;
        } else if (result.outcome === 'ok') {
          text = spec.format(result);
          success = true;
          data = {
            response: result.data,
            paid: result.paid,
            priceUsd: result.offer?.priceUsd ?? 0,
            dataAsOf: result.dataAsOf,
            receipt: result.receipt,
          };
        } else {
          text = formatNotOk(result, spec.label);
          data = {
            outcome: result.outcome,
            status: result.status,
            offer: result.offer,
            error: result.error,
          };
        }
      } catch (err) {
        text = `${spec.label} failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      if (callback) {
        await callback({ text, actions: [spec.name], source: message.content?.source });
      }
      return { success, text, data: { actions: [spec.name], ...data } };
    },
  };
}
