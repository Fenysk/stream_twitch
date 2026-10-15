import type { CatalogueAnswer } from "../../../src/domain/deck.schema";

// Ce que le panneau sait du serveur : rien tant que le plugin n'a pas répondu, puis sa réponse.
export type CatalogueState = { status: "loading" } | CatalogueAnswer;
