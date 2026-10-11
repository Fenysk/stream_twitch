// Les réponses communes des API du serveur local.
export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const refuse = (status: number, message: string, path = ""): Response =>
  json({ issues: [{ path, message }] }, status);

// Un corps JSON déclaré est exigé pour écrire : une page d'un autre site ne peut pas le poser sans l'accord (CORS) du navigateur.
export const isJson = (request: Request): boolean =>
  request.headers.get("content-type")?.includes("application/json") === true;

// Lire un corps JSON sans lever : un corps illisible est une demande refusée, pas une panne du serveur.
export const getBodyJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};
