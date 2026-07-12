import { OpenAI } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { TransformationSchema } from "../domain/note.js";
import {
  buildTransformationInput,
  TRANSFORMATION_INSTRUCTIONS,
} from "./transformationPrompt.js";
import type {
  TransformationInput,
  TransformationModel,
} from "./transformation.js";

export class OpenAITransformationModel implements TransformationModel {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    client?: OpenAI,
  ) {
    if (!apiKey) {
      throw new Error("AI_API_KEY is required");
    }
    if (!model) {
      throw new Error("AI_MODEL is required");
    }

    this.client = client ?? new OpenAI({ apiKey });
  }

  async transform(input: TransformationInput): Promise<unknown> {
    const response = await this.client.responses.parse({
      model: this.model,
      instructions: TRANSFORMATION_INSTRUCTIONS,
      input: buildTransformationInput(input),
      text: {
        format: zodTextFormat(
          TransformationSchema,
          "margin_note_transformation",
        ),
      },
      store: false,
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI returned no parsed transformation");
    }

    return response.output_parsed;
  }
}
