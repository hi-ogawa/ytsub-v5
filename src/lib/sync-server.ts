import { serverSessionToLocal } from "./caption-session.ts";
import { orpc } from "./rpc-client.ts";

/** Whether the user is signed in, and when the server last changed the video. */
export async function checkServerSyncState(youtubeId: string) {
  const { authenticated } = await orpc.auth.check.call({});
  if (!authenticated) {
    return { authenticated: false as const };
  }
  const data = await orpc.videos.getVideoEditedAt.call({ youtubeId });
  return {
    authenticated: true as const,
    serverEditedAt: data?.editedAt,
  };
}

export async function fetchServerSession(youtubeId: string) {
  const data = await orpc.videos.getFullSession.call({ youtubeId });
  if (!data) {
    throw new Error("Video not found on server");
  }
  return {
    session: serverSessionToLocal(data),
    editedAt: data.video.editedAt,
  };
}
