import {
  TransformationSchema,
  type Transformation,
} from "../domain/note.js";

export interface TransformationModel {
  transform(input: {
    rawText: string;
    verifiedMeetingTitle?: string;
    userTimeZone: string;
  }): Promise<unknown>;
}

/**
 * Validates model output at the application boundary.
 *
 * The caller must persist raw text before invoking this service. A failure here
 * must leave a valid verbatim note rather than failing capture.
 */
export async function transformNote(
  model: TransformationModel,
  input: {
    rawText: string;
    verifiedMeetingTitle?: string;
    userTimeZone: string;
  },
): Promise<Transformation> {
  const output = await model.transform(input);
  return TransformationSchema.parse(output);
}
