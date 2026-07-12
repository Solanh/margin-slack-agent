import {
  ContextConfidenceSchema,
  TransformationSchema,
  type Transformation,
} from "../domain/note.js";

export interface TransformationInput {
  rawText: string;
  verifiedMeetingTitle?: string;
  verifiedMeetingStartsAt?: Date;
  verifiedMeetingEndsAt?: Date;
  contextConfidence?: typeof ContextConfidenceSchema._output;
  userTimeZone: string;
}

export interface TransformationModel {
  transform(input: TransformationInput): Promise<unknown>;
}

const ALWAYS_INFERRED = ["organizedText", "noteType", "priority"] as const;

export class UnsafeTransformationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTransformationError";
  }
}

/**
 * Validates both the output shape and the provenance rules Margin relies on.
 *
 * The caller must persist raw text before invoking this service. A failure here
 * must leave a valid verbatim note rather than failing capture.
 */
export async function transformNote(
  model: TransformationModel,
  input: TransformationInput,
): Promise<Transformation> {
  const output = await model.transform(input);
  const transformation = TransformationSchema.parse(output);

  validateTransformationProvenance(transformation);

  return transformation;
}

export function validateTransformationProvenance(
  transformation: Transformation,
): void {
  const inferred = new Set(transformation.inferredFields);

  for (const field of ALWAYS_INFERRED) {
    if (!inferred.has(field)) {
      throw new UnsafeTransformationError(
        `Transformation did not label ${field} as inferred`,
      );
    }
  }

  if (
    transformation.reminderIntent !== null &&
    !inferred.has("reminderIntent")
  ) {
    throw new UnsafeTransformationError(
      "Transformation did not label reminderIntent as inferred",
    );
  }

  if (
    transformation.explicitDueAt !== null &&
    !inferred.has("explicitDueAt")
  ) {
    throw new UnsafeTransformationError(
      "Transformation did not label explicitDueAt as inferred",
    );
  }

  if (
    transformation.explicitDueAt !== null &&
    transformation.reminderIntent === null
  ) {
    throw new UnsafeTransformationError(
      "An explicit due time requires a reminder intent",
    );
  }
}
