import type { OwnerScope } from "../domain/note.js";
import type {
  DashboardUpcomingItem,
  NoteRetrievalRequest,
  RetrievedNote,
  RetrievedOriginalNote,
} from "../domain/retrieval.js";

export interface NoteRetrievalRepository {
  search(
    owner: OwnerScope,
    request: NoteRetrievalRequest,
  ): Promise<RetrievedNote[]>;

  getOriginal(
    owner: OwnerScope,
    noteId: string,
  ): Promise<RetrievedOriginalNote | null>;

  listUpcoming(
    owner: OwnerScope,
    limit: number,
  ): Promise<DashboardUpcomingItem[]>;
}
