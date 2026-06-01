import { handleStudyRequest } from '../src/study-server.mjs';

export default async function handler(request, response) {
  await handleStudyRequest(request, response);
}
