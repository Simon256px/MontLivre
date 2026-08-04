/** TEMPORAIRE — jalon 2 seulement.
 *
 *  De quoi juger la grille, les couvertures engendrées et la page de lecture
 *  sans avoir encore branché ni foliate-js ni le disque. Ce fichier disparaît
 *  au jalon 4, quand la bibliothèque lira le vrai library.json.
 */

const LOREM = [
  "Au commencement, il n'y avait qu'une page blanche et le bruit de la pluie sur les tuiles. Elle posa le livre sur la table, et la maison entière sembla retenir son souffle.",
  "On lui avait dit que les histoires ne changeaient rien. Elle savait pourtant qu'une phrase, lue au bon moment, pouvait déplacer une vie de quelques degrés — et que quelques degrés suffisaient.",
  "La lampe grésilla. Dehors, le vent poussait les volets contre le mur avec une régularité de métronome, et les mots continuaient d'arriver, un à un, patients.",
  "Il faudrait un jour écrire l'histoire des lecteurs plutôt que celle des livres : ceux qui veillent, ceux qui abandonnent page trente, ceux qui recommencent chaque hiver le même chapitre.",
];

const sample = (count) => ({
  sections: Array.from({ length: count }, (_, i) => ({
    title: `Chapitre ${i + 1}`,
    paragraphs: LOREM.concat(LOREM.slice(0, 2)),
  })),
  toc: Array.from({ length: count }, (_, i) => ({ label: `Chapitre ${i + 1}`, depth: 0 })),
});

export const FIXTURES = [
  { id: "a1", title: "Le Horla", author: "Guy de Maupassant", fraction: 0.42, ...sample(6) },
  { id: "a2", title: "À la recherche du temps perdu", author: "Marcel Proust", fraction: 0.08, ...sample(9) },
  { id: "a3", title: "Les Fleurs du mal", author: "Charles Baudelaire", fraction: 1, ...sample(4) },
  { id: "a4", title: "Bouvard et Pécuchet", author: "Gustave Flaubert", fraction: 0, ...sample(5) },
  { id: "a5", title: "Le Grand Meaulnes", author: "Alain-Fournier", fraction: 0.73, ...sample(7) },
  { id: "a6", title: "Une saison en enfer", author: "Arthur Rimbaud", fraction: 0, ...sample(3) },
  { id: "a7", title: "La Bête humaine", author: "Émile Zola", fraction: 0.19, ...sample(8) },
  { id: "a8", title: "Voyage au bout de la nuit", author: "Louis-Ferdinand Céline", fraction: 0, ...sample(6) },
  { id: "a9", title: "Aurélia", author: "Gérard de Nerval", fraction: 0.55, ...sample(4) },
  { id: "a10", title: "Mémoires d'outre-tombe", author: "François-René de Chateaubriand", fraction: 0, ...sample(10) },
];
