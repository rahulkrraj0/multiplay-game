/* Lightweight game catalog plus on-demand game script loading. */
(function () {
  "use strict";

  const catalog = window.PLAYORA_GAME_CATALOG || [];
  const pending = new Map();

  catalog.forEach((game) => {
    if (!GAMES[game.id]) {
      registerGame({ ...game, catalogOnly: true });
    }
  });

  window.ensurePlayoraGame = async function (id) {
    const game = catalog.find((entry) => entry.id === id);
    if (!game) throw new Error("Unknown game: " + id);

    if (GAMES[id] && !GAMES[id].catalogOnly) return GAMES[id];

    let loading = pending.get(id);
    if (!loading) {
      const scriptLoading = window.PLAYORA_LOAD_SCRIPT(game.file);
      const soundLoading = window.playoraSound && typeof window.playoraSound.preloadGame === "function"
        ? window.playoraSound.preloadGame(id)
        : Promise.resolve();
      loading = Promise.all([scriptLoading, soundLoading]).then(() => {
        const registered = GAMES[id];
        if (!registered || registered.catalogOnly) {
          throw new Error("The game script did not register: " + game.file);
        }
        return registered;
      });
      pending.set(id, loading);
      loading.catch(() => pending.delete(id));
    }

    return loading;
  };
})();
